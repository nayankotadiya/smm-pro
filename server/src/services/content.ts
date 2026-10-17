import { Content, Counter, Client, User, Script } from '../models';
import { STAGES, Stage, STAGE_OWNER_FIELD, STAGE_NEXT_ACTION, STAGE_LABELS, getWorkflowStagesForType } from '../config/constants';
import { progressFor } from '../utils/naming';
import { emitOrg, emitToRoom } from './realtime';
import { logActivity } from './activity';
import { ensureContentRoom } from './chat';
import { emitDomain } from './events';
import { AuthUser, can } from '../middleware/auth';
import { notFound, forbidden } from '../utils/errors';
import { dupRetry } from '../utils/async';
import { ensureContentFolders } from './storage';
import { ensureStageTask } from './tasks';
import { syncSingleContentToSheet } from '../integrations/sheets';

const TYPE_PREFIX: Record<string, string> = {
  REEL: 'REEL', POST: 'POST', CAROUSEL: 'CARO', AI_REEL: 'AIREEL', AI_IMAGE: 'AIIMG',
  STORY: 'STRY', VIDEO: 'VID', SHORT: 'SHRT', AD: 'AD', OTHER: 'CNT'
};

export async function nextContentCode(type: string, client?: any, date = new Date()) {
  if (client?.clientCode && client.clientCode.trim()) {
    const prefix = client.clientCode.trim().toUpperCase();
    const key = client?._id ? `CLI-${client._id}` : `CLI-${prefix}`;
    const c = await dupRetry(() => Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true }));
    return `${prefix}-${String(c!.seq).padStart(3, '0')}`;
  }

  const prefix = TYPE_PREFIX[type] || 'CNT';
  const key = `${prefix}-${date.getFullYear()}`;
  const c = await dupRetry(() => Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true }));
  return `${prefix}-${date.getFullYear()}-${String(c!.seq).padStart(3, '0')}`;
}

export function visibilityFilter(u: AuthUser) {
  if (can(u, 'content.read.all')) return {};
  const id = u._id;
  return { $or: [{ assignedWriter: id }, { assignedShooter: id }, { assignedEditor: id }, { assignedDesigner: id }, { assignedSMM: id }, { assignedReviewer: id }, { currentOwner: id }, { nextOwner: id }, { createdBy: id }] };
}
export async function getVisibleContent(u: AuthUser, id: string) {
  const q = /^[A-Z0-9_-]+$/.test(id) && id.length < 20 ? { contentId: id } : { _id: id };
  const c = await Content.findOne({ $and: [q, visibilityFilter(u)] });
  if (!c) {
    if (await Content.exists(q)) throw forbidden('This content is not assigned to you');
    throw notFound('Content');
  }
  return c;
}

export function ownerFor(content: any, stage: Stage) { return content[STAGE_OWNER_FIELD[stage]] || null; }

export function applyStage(content: any, stage: Stage) {
  const stages = getWorkflowStagesForType(content.type || 'REEL');
  const i = stages.indexOf(stage);
  content.stage = stage;
  content.progress = i >= 0 ? Math.round((i / Math.max(1, stages.length - 1)) * 100) : progressFor(stage);
  content.currentOwner = ownerFor(content, stage);
  content.nextOwner = (i >= 0 && i < stages.length - 1) ? ownerFor(content, stages[i + 1]) : null;
  content.nextAction = STAGE_NEXT_ACTION[stage] || 'Proceed to next workflow stage';
}

export async function broadcastContent(content: any) {
  const c = await Content.findById(content._id).populate('clientId', 'name').populate('currentOwner nextOwner assignedDesigner', 'name role').lean();
  emitOrg('content:updated', c);
  emitToRoom(`content:${content._id}`, 'workflow:updated', c);
}

export async function setLastAction(content: any, text: string, by?: any) {
  content.lastAction = { text, at: new Date(), by };
}

/** Moves content to a stage and recalculates owner / progress / next action. */
export async function moveToStage(content: any, stage: Stage, actorId?: any, lastActionText?: string) {
  const prev = content.stage;
  applyStage(content, stage);
  content.stageHistory.push({ stage, enteredAt: new Date(), by: actorId });

  // Update operational status
  if (stage === 'PUBLISHED') {
    content.status = 'COMPLETED';
    content.productionStatus = 'POSTED';
    if (!content.publishedAt) content.publishedAt = new Date();
  } else if (stage === 'SCHEDULE') {
    content.productionStatus = 'SCHEDULING';
  } else if (stage === 'FINAL_UPLOAD') {
    content.productionStatus = 'UPLOAD_DONE';
  } else if (stage === 'SMM_REVIEW') {
    content.approvalStatus = 'PENDING_INTERNAL';
  } else if (stage === 'CLIENT_FINAL_APPROVAL' || stage === 'CLIENT_REVIEW') {
    content.approvalStatus = 'PENDING_CLIENT';
  } else if (content.status === 'CHANGES_REQUESTED' || content.status === 'COMPLETED') {
    content.status = 'ACTIVE';
  }

  if (lastActionText) await setLastAction(content, lastActionText, actorId);
  await content.save();

  // Create or close tasks corresponding to the stage
  await ensureStageTask(content, stage, actorId).catch((e) => console.warn('[tasks] ensureStageTask', e.message));

  if (prev !== stage) {
    await logActivity({
      actorId,
      actorType: actorId ? 'USER' : 'SYSTEM',
      action: 'content.stage',
      message: `${content.contentId} moved to ${STAGE_LABELS[stage] || stage}`,
      entityType: 'content',
      entityId: content._id,
      contentId: content._id,
      clientId: content.clientId,
    });
  }

  // Idempotently sync row to Google Sheets if configured
  syncSingleContentToSheet(String(content._id)).catch((e) => console.warn('[sheets] single sync', e.message));

  await broadcastContent(content);
  return content;
}

export async function createContent(data: any, u: AuthUser) {
  const client = await Client.findById(data.clientId);
  if (!client) throw notFound('Client');
  const dt = client.defaultTeam || ({} as any);

  const contentId = data.contentId || (await nextContentCode(data.type || 'REEL', client));

  const content: any = new Content({
    ...data,
    contentId,
    contentBrief: data.contentBrief || data.description || '',
    productionDeadline: data.productionDeadline || data.deadline,
    plannedPublicationDate: data.plannedPublicationDate || data.scheduledAt,
    plannedPublicationTime: data.plannedPublicationTime || '',
    assignedWriter: data.assignedWriter || dt.writer,
    assignedShooter: data.assignedShooter || dt.shooter,
    assignedEditor: data.assignedEditor || dt.editor,
    assignedDesigner: data.assignedDesigner || dt.designer,
    assignedSMM: data.assignedSMM || dt.smm,
    assignedReviewer: data.assignedReviewer || dt.reviewer,
    createdBy: u._id,
    stageHistory: [{ stage: data.stage || 'IDEA', enteredAt: new Date(), by: u._id }],
  });

  applyStage(content, data.stage || 'IDEA');
  await setLastAction(content, `${u.name} created the content`, u._id);
  await content.save();

  const script = await Script.create({ contentId: content._id, clientId: content.clientId, writerId: content.assignedWriter });
  content.scriptId = script._id;
  await content.save();

  await ensureContentRoom(content);
  ensureContentFolders(content).catch((e) => console.warn('[drive] content folders', e.message));

  // Initialize first stage task
  await ensureStageTask(content, content.stage, u._id).catch((e) => console.warn('[tasks] initial task', e.message));

  // Sync to Google Sheets
  syncSingleContentToSheet(String(content._id)).catch((e) => console.warn('[sheets] create sync', e.message));

  await logActivity({
    actorId: u._id,
    action: 'content.created',
    message: `${u.name} created ${content.contentId} · ${content.title}`,
    entityType: 'content',
    entityId: content._id,
    contentId: content._id,
    clientId: content.clientId,
  });

  emitDomain('content.created', { contentId: String(content._id), actorId: u._id });
  await broadcastContent(content);
  return content;
}

export async function userName(id: any) { return id ? (await User.findById(id).select('name').lean())?.name || 'Someone' : 'System'; }

export function sanitizeSuperAdminUsers(doc: any, isSuperAdmin: boolean): any {
  if (!doc || isSuperAdmin) return doc;
  const mask = (u: any) => {
    if (!u) return u;
    if (typeof u === 'object' && u.role === 'SUPER_ADMIN') {
      return {
        ...u,
        name: 'System Admin',
        email: undefined,
        phone: undefined,
      };
    }
    return u;
  };
  const fields = ['currentOwner', 'nextOwner', 'assignedWriter', 'assignedShooter', 'assignedEditor', 'assignedSMM', 'assignedReviewer', 'createdBy', 'reviewerId', 'shooterId', 'editorId', 'assignedTo'];
  for (const f of fields) {
    if (doc[f]) doc[f] = mask(doc[f]);
  }
  return doc;
}
