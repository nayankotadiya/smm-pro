import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, as, boot, shutdown, users, settle } from './setup';
import { Content, Client, Task } from '../models';
import { nextContentCode } from '../services/content';
import { ensureStageTask, handleShootCancelled } from '../services/tasks';
import { getWorkflowStagesForType, STATUS_CONFIG } from '../config/constants';
import { CONTENT_TRACKER_COLUMNS } from '../integrations/sheets';

describe('Advanced Content Workflow & Google Sheets Integration', () => {
  let clientSag: any;
  beforeAll(async () => {
    await boot();
    // Create client with explicit clientCode
    const r = await as('nayan').post('/api/clients', {
      name: 'Sagloo Skincare',
      clientCode: 'SAG',
      phone: '9876543211',
      defaultTeam: {
        writer: users.pooja.id,
        shooter: users.harsh.id,
        editor: users.rahul.id,
        designer: users.other.id,
        smm: users.aman.id,
        reviewer: users.ishita.id,
      },
    });
    clientSag = r.body;
  });
  afterAll(shutdown);

  it('generates sequential client-prefixed Content IDs (e.g. SAG-001, SAG-002)', async () => {
    const code1 = await nextContentCode('REEL', clientSag);
    const code2 = await nextContentCode('CAROUSEL', clientSag);
    const code3 = await nextContentCode('POST', clientSag);

    expect(code1).toBe('SAG-001');
    expect(code2).toBe('SAG-002');
    expect(code3).toBe('SAG-003');
  });

  it('provides distinct workflow paths per content type without unnecessary shooting', () => {
    const reelStages = getWorkflowStagesForType('REEL');
    const postStages = getWorkflowStagesForType('POST');
    const carouselStages = getWorkflowStagesForType('CAROUSEL');
    const aiReelStages = getWorkflowStagesForType('AI_REEL');

    // Reels require shooting and editing
    expect(reelStages).toContain('SHOOTING');
    expect(reelStages).toContain('EDITING');
    expect(reelStages).not.toContain('GRAPHIC_DESIGN');

    // Posts require graphic design but NOT shooting
    expect(postStages).toContain('GRAPHIC_DESIGN');
    expect(postStages).not.toContain('SHOOTING');
    expect(postStages).not.toContain('RAW_FOOTAGE');

    // AI Reels require AI generation
    expect(aiReelStages).toContain('AI_GENERATION');
    expect(aiReelStages).toContain('EDITING');
    expect(aiReelStages).not.toContain('SHOOTING');
  });

  it('creates graphic design task when a Post or Carousel enters GRAPHIC_DESIGN stage', async () => {
    const r = await as('ishita').post('/api/content', {
      title: 'Product Benefits Carousel',
      clientId: clientSag._id,
      type: 'CAROUSEL',
    });
    expect(r.status).toBe(201);
    const content = r.body;
    expect(content.contentId).toMatch(/^SAG-\d{3}$/);

    // Transition to GRAPHIC_DESIGN
    await ensureStageTask(content, 'GRAPHIC_DESIGN');
    await settle();

    const task = await Task.findOne({ contentId: content._id, kind: 'GRAPHIC_DESIGN' });
    expect(task).not.toBeNull();
    expect(task!.title).toContain('Design graphics');
    expect(String(task!.assignedTo)).toBe(users.other.id); // Assigned to designer
  });

  it('cancels shoot, sets status to SHOOT_CANCELLED and cleans up pending shooting task', async () => {
    const r = await as('ishita').post('/api/content', {
      title: 'Night Essence Serum Reel',
      clientId: clientSag._id,
      type: 'REEL',
    });
    const content = r.body;

    // Simulate entering shooting stage
    await ensureStageTask(content, 'SHOOTING');
    await settle();
    expect(await Task.findOne({ contentId: content._id, kind: 'SHOOT', status: { $ne: 'CANCELLED' } })).not.toBeNull();

    // Shoot cancelled
    await handleShootCancelled(content, 'Client requested postponement due to event');
    await settle();

    const freshContent = await Content.findById(content._id);
    expect(freshContent!.productionStatus).toBe('SHOOT_CANCELLED');

    const shootTask = await Task.findOne({ contentId: content._id, kind: 'SHOOT' });
    expect(shootTask!.status).toBe('CANCELLED');
  });

  it('validates Content Tracker columns A through AB and reference status colors', () => {
    expect(CONTENT_TRACKER_COLUMNS.length).toBe(31); // A to AE = 31 columns
    expect(CONTENT_TRACKER_COLUMNS[0]).toBe('Content ID');
    expect(CONTENT_TRACKER_COLUMNS[1]).toBe('Client');
    expect(CONTENT_TRACKER_COLUMNS[7]).toBe('Shooter');
    expect(CONTENT_TRACKER_COLUMNS[8]).toBe('Shoot Date');
    expect(CONTENT_TRACKER_COLUMNS[9]).toBe('Shoot Status');
    expect(CONTENT_TRACKER_COLUMNS[10]).toBe('Editor');
    expect(CONTENT_TRACKER_COLUMNS[11]).toBe('Edit Date');
    expect(CONTENT_TRACKER_COLUMNS[12]).toBe('Edit Status');
    expect(CONTENT_TRACKER_COLUMNS[13]).toBe('Graphic Designer');
    expect(CONTENT_TRACKER_COLUMNS[16]).toBe('Graphic Approval');
    expect(CONTENT_TRACKER_COLUMNS[17]).toBe('Client Approval');
    expect(CONTENT_TRACKER_COLUMNS[25]).toBe('Due Date');
    expect(CONTENT_TRACKER_COLUMNS[26]).toBe('Days Left');
    expect(CONTENT_TRACKER_COLUMNS[27]).toBe('Overdue');
    expect(CONTENT_TRACKER_COLUMNS[30]).toBe('Last Updated');

    // Status colors match reference sheet exactly
    expect(STATUS_CONFIG.SCRIPT_DONE.color).toBe('#00D9E8');
    expect(STATUS_CONFIG.VOICE_OVER.color).toBe('#9575CD');
    expect(STATUS_CONFIG.SHOOT.color).toBe('#FF9800');
    expect(STATUS_CONFIG.EDIT_DONE.color).toBe('#FFEB00');
    expect(STATUS_CONFIG.SCHEDULING.color).toBe('#E600E6');
    expect(STATUS_CONFIG.UPLOAD_DONE.color).toBe('#00E600');
    expect(STATUS_CONFIG.SHOOT_CANCELLED.color).toBe('#FF0000');
    expect(STATUS_CONFIG.CLIENT_REVIEW.color).toBe('#C98555');
    expect(STATUS_CONFIG.TRAIL.color).toBe('#B39DDB');
  });

  it('properly distinguishes overdue production deadline from future publication date', async () => {
    const pastDate = new Date(Date.now() - 86400000); // 1 day ago
    const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days ahead

    const r = await as('ishita').post('/api/content', {
      title: 'Skincare Routine Reel',
      clientId: clientSag._id,
      type: 'REEL',
      deadline: pastDate.toISOString(),
    });
    const c = r.body;

    // Production task deadline has passed, but publication date is in the future
    await as('ishita').patch(`/api/content/${c._id}`, {
      stage: 'EDITING',
      stageDeadlines: { edit: pastDate.toISOString() },
      plannedPublicationDate: futureDate.toISOString(),
    });

    const updated = await Content.findById(c._id);
    expect(new Date(updated!.deadline!).getTime()).toBeLessThan(Date.now());
    expect(new Date(updated!.plannedPublicationDate!).getTime()).toBeGreaterThan(Date.now());
  });
});
