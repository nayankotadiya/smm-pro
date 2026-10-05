import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, as, boot, shutdown, users, settle, makeClient, uploadVideo } from './setup';
import { Approval, Task, Notification, Message, ChatRoom, ActivityLog, Content, AutomationRun } from '../models';
import { sha256, randomToken } from '../utils/crypto';

/** The public URL is only returned once (at send time); pull the token out of it. */
const tokenOf = (url: string) => url.split('/').pop()!;

describe('Full workflow: client -> published (spec section 131)', () => {
  let client: any; let c: any; let scriptId: string; let url1: string; let url2: string;
  beforeAll(async () => { await boot(); client = await makeClient(); });
  afterAll(shutdown);

  it('creates content with an auto ID, default team, owner and 0% progress', async () => {
    const r = await as('ishita').post('/api/content', { title: 'Diwali Collection Reel', clientId: client._id, type: 'REEL' });
    expect(r.status).toBe(201); c = r.body; scriptId = c.scriptId;
    expect(c.contentId).toMatch(/^REEL-\d{4}-001$/);
    expect(c.stage).toBe('IDEA'); expect(c.progress).toBe(0);
    expect(c.currentOwner).toBe(users.pooja.id);
  });

  it('writer creates script V1 and submits; reviewer is notified', async () => {
    const v = await as('pooja').post(`/api/scripts/${scriptId}/version`, { hook: 'Sparkle this Diwali', scenes: [{ title: 'Scene 1', dialogue: 'Hello' }], cta: 'Shop now' });
    expect(v.status).toBe(201); expect(v.body.label).toBe('V1');
    const s = await as('pooja').post(`/api/scripts/${scriptId}/submit`);
    expect(s.status).toBe(200);
    await settle();
    const fresh = await Content.findById(c._id);
    expect(fresh!.stage).toBe('INTERNAL_REVIEW');
    expect(String(fresh!.currentOwner)).toBe(users.ishita.id);
    expect(await Notification.countDocuments({ userId: users.ishita.id, type: 'script.submitted' })).toBe(1);
  });

  it('changes requested -> revision task for writer; V2 never overwrites V1', async () => {
    const ap = await Approval.findOne({ contentId: c._id, type: 'INTERNAL_SCRIPT', status: 'PENDING' });
    const r = await as('ishita').post(`/api/approvals/${ap!._id}/review`, { decision: 'CHANGES', note: 'Stronger hook' });
    expect(r.status).toBe(200); await settle();
    const t = await Task.findOne({ contentId: c._id, kind: 'SCRIPT_REVISION' });
    expect(String(t!.assignedTo)).toBe(users.pooja.id); expect(t!.source).toBe('AUTOMATIC');
    expect((await Content.findById(c._id))!.status).toBe('CHANGES_REQUESTED');
    const v2 = await as('pooja').post(`/api/scripts/${scriptId}/version`, { hook: 'This Diwali, shine brighter', changes: 'New hook' });
    expect(v2.body.label).toBe('V2');
    const all = await as('pooja').get(`/api/scripts/${scriptId}`);
    expect(all.body.versions.map((x: any) => x.label)).toEqual(['V2', 'V1']);
    expect(all.body.versions[1].hook).toBe('Sparkle this Diwali');
    await as('pooja').post(`/api/scripts/${scriptId}/submit`);
    expect((await Task.findById(t!._id))!.status).toBe('COMPLETED');
  });

  it('writer cannot approve their own script (RBAC)', async () => {
    const ap = await Approval.findOne({ contentId: c._id, type: 'INTERNAL_SCRIPT', status: 'PENDING' });
    const r = await as('pooja').post(`/api/approvals/${ap!._id}/review`, { decision: 'APPROVE' });
    expect(r.status).toBe(403);
  });

  it('internal approval -> client review link created; token stored only as a hash', async () => {
    const ap = await Approval.findOne({ contentId: c._id, type: 'INTERNAL_SCRIPT', status: 'PENDING' });
    expect((await as('ishita').post(`/api/approvals/${ap!._id}/review`, { decision: 'APPROVE' })).status).toBe(200);
    const send = await as('ishita').post('/api/approvals/send', { contentId: c._id, kind: 'SCRIPT' });
    expect(send.status).toBe(201); url1 = send.body.url;
    expect(send.body.approval.tokenHash).toBeUndefined();
    const stored = await Approval.findById(send.body.approval._id).select('+tokenHash');
    expect(stored!.tokenHash).toBe(sha256(tokenOf(url1)));
    expect((await as('ishita').get(`/api/approvals/${stored!._id}/link`)).body.url).toBe(url1); // staff can re-copy the active link
    expect((await as('rahul').get(`/api/approvals/${stored!._id}/link`)).status).toBe(403);
    expect(stored!.status).toBe('WAITING_FOR_CLIENT'); // AiSensy not configured in tests -> manual link
    expect((await Content.findById(c._id))!.stage).toBe('CLIENT_REVIEW');
  });

  it('public page exposes only this approval; GET does not mark it opened', async () => {
    const t = tokenOf(url1);
    const v = await request(app).get(`/api/public/approval/${t}`);
    expect(v.status).toBe(200); expect(v.body.title).toBe('Diwali Collection Reel'); expect(v.body.script.hook).toBe('This Diwali, shine brighter');
    expect(JSON.stringify(v.body)).not.toMatch(/assigned|currentOwner|_id/);
    expect((await Approval.findOne({ tokenHash: sha256(t) }))!.openedAt).toBeUndefined();
    await request(app).post(`/api/public/approval/${t}/open`);
    expect((await Approval.findOne({ tokenHash: sha256(t) }))!.status).toBe('OPENED');
    expect((await request(app).get(`/api/public/approval/${randomToken(32)}`)).status).toBe(404);
    expect((await request(app).get('/api/content')).status).toBe(401);
  });

  it('client approves -> shooting stage + automatic shoot task; token cannot be reused', async () => {
    const t = tokenOf(url1);
    const r = await request(app).post(`/api/public/approval/${t}/approve`).send({ name: 'Meera' });
    expect(r.status).toBe(200); await settle();
    expect((await Content.findById(c._id))!.stage).toBe('SHOOTING');
    const task = await Task.findOne({ contentId: c._id, kind: 'SHOOT' });
    expect(String(task!.assignedTo)).toBe(users.harsh.id);
    expect((await request(app).post(`/api/public/approval/${t}/approve`).send({})).status).toBe(409);
    expect((await as('ishita').get(`/api/approvals/${(await Approval.findOne({ tokenHash: sha256(t) }))!._id}/link`)).status).toBe(400); // decided links can't be copied
    expect((await request(app).post(`/api/public/approval/${t}/request-changes`).send({ comments: [{ comment: 'x' }] })).status).toBe(409);
  });

  it('editor cannot upload RAW; unassigned editor cannot see the content', async () => {
    expect((await uploadVideo('rahul', c._id, 'RAW')).status).toBe(403);
    expect((await as('other').get(`/api/content/${c._id}`)).status).toBe(403);
    expect((await uploadVideo('other', c._id, 'EDIT')).status).toBe(403);
  });

  it('shooter uploads raw -> auto name, stage, editor task, notifications, chat card', async () => {
    const up = await uploadVideo('harsh', c._id, 'RAW');
    expect(up.status).toBe(200);
    expect(up.body.fileName).toBe(`${c.contentId}_RAW_V1.mp4`);
    await settle();
    const fresh = await Content.findById(c._id);
    expect(fresh!.stage).toBe('RAW_FOOTAGE'); expect(String(fresh!.currentOwner)).toBe(users.rahul.id);
    expect((await Task.findOne({ contentId: c._id, kind: 'SHOOT' }))!.status).toBe('COMPLETED');
    const edit = await Task.findOne({ contentId: c._id, kind: 'EDIT' });
    expect(String(edit!.assignedTo)).toBe(users.rahul.id);
    expect(await Notification.countDocuments({ userId: users.rahul.id, type: 'raw.uploaded' })).toBe(1);
    expect(await Notification.countDocuments({ userId: users.ishita.id, type: 'raw.uploaded' })).toBe(1);
    const room = await ChatRoom.findOne({ contentId: c._id });
    const sys = await Message.findOne({ roomId: room!._id, 'system.event': 'raw.uploaded' });
    expect(sys!.system!.title).toBe('RAW VIDEO UPLOADED'); expect(String(sys!.system!.mediaId)).toBe(up.body._id);
  });

  it('edit V1 -> SMM review; SMM requests changes with timestamp -> revision task; edit V2 keeps V1', async () => {
    const v1 = await uploadVideo('rahul', c._id, 'EDIT');
    expect(v1.body.fileName).toBe(`${c.contentId}_EDIT_V1.mp4`); await settle();
    expect((await Content.findById(c._id))!.stage).toBe('SMM_REVIEW');
    expect(await Notification.countDocuments({ userId: users.aman.id, type: 'edit.uploaded' })).toBe(1);
    const ap = await Approval.findOne({ contentId: c._id, type: 'SMM', status: 'PENDING' });
    const rv = await as('aman').post(`/api/approvals/${ap!._id}/review`, { decision: 'CHANGES', comments: [{ timestampSec: 8, comment: 'Increase subtitle size' }] });
    expect(rv.status).toBe(200); await settle();
    expect((await Content.findById(c._id))!.stage).toBe('EDITING');
    const rev = await Task.findOne({ contentId: c._id, kind: 'EDIT_REVISION' });
    expect(String(rev!.assignedTo)).toBe(users.rahul.id); expect(rev!.description).toContain('00:08');
    expect(await Notification.countDocuments({ userId: users.rahul.id, type: 'task.assigned' })).toBeGreaterThanOrEqual(2);
    const v2 = await uploadVideo('rahul', c._id, 'EDIT');
    expect(v2.body.fileName).toBe(`${c.contentId}_EDIT_V2.mp4`);
    const files = await as('rahul').get(`/api/media/content/${c._id}`);
    const edits = files.body.filter((m: any) => m.category === 'EDIT');
    expect(edits.map((m: any) => m.version)).toEqual(['EDIT_V2', 'EDIT_V1']);
    expect(edits[1].status).toBe('SUPERSEDED');
  });

  it('SMM approves -> final review -> final video -> client final approval -> scheduling task', async () => {
    const smm = await Approval.findOne({ contentId: c._id, type: 'SMM', status: 'PENDING' });
    await as('aman').post(`/api/approvals/${smm!._id}/review`, { decision: 'APPROVE' }); await settle();
    expect((await Content.findById(c._id))!.stage).toBe('FINAL_REVIEW');
    const fin = await uploadVideo('rahul', c._id, 'FINAL');
    expect(fin.body.fileName).toBe(`${c.contentId}_FINAL_V1.mp4`);
    const fa = await Approval.findOne({ contentId: c._id, type: 'FINAL', status: 'PENDING' });
    expect(String(fa!.mediaId)).toBe(fin.body._id);
    expect((await as('aman').post('/api/approvals/send', { contentId: c._id, kind: 'FINAL' })).status).toBe(400); // not before final internal review
    await as('ishita').post(`/api/approvals/${fa!._id}/review`, { decision: 'APPROVE' });
    const send = await as('ishita').post('/api/approvals/send', { contentId: c._id, kind: 'FINAL' });
    url2 = send.body.url;
    // resending rotates the token: the old link must stop working
    const re = await as('ishita').post(`/api/approvals/${send.body.approval._id}/resend`);
    expect(re.status).toBe(200);
    expect((await request(app).get(`/api/public/approval/${tokenOf(send.body.url)}`)).status).toBe(410);
    url2 = re.body.url;
    const t = tokenOf(url2);
    const view = await request(app).get(`/api/public/approval/${t}`);
    expect(view.body.hasVideo).toBe(true);
    const video = await request(app).get(`/api/public/approval/${t}/video`).set('Range', 'bytes=0-99');
    expect(video.status).toBe(206);
    await request(app).post(`/api/public/approval/${t}/open`);
    const ok = await request(app).post(`/api/public/approval/${t}/approve`).send({});
    expect(ok.status).toBe(200); await settle();
    const fresh = await Content.findById(c._id);
    expect(fresh!.stage).toBe('SCHEDULE'); expect(String(fresh!.currentOwner)).toBe(users.aman.id);
    const st = await Task.findOne({ contentId: c._id, kind: 'SCHEDULE' });
    expect(String(st!.assignedTo)).toBe(users.aman.id);
    expect(await Notification.countDocuments({ userId: users.aman.id, type: 'client.approved' })).toBe(1);
    expect((await request(app).get(`/api/public/approval/${t}/video`)).status).toBe(200); // still viewable, but...
    expect((await request(app).post(`/api/public/approval/${t}/approve`).send({})).status).toBe(409); // ...no second decision
  });

  it('schedule -> publish -> 100%, activity, chat and automation log complete', async () => {
    const when = new Date(Date.now() + 3600e3).toISOString();
    expect((await as('aman').post(`/api/content/${c._id}/schedule`, { scheduledAt: when, caption: 'Shine', hashtags: '#diwali' })).status).toBe(200);
    expect((await Task.findOne({ contentId: c._id, kind: 'SCHEDULE' }))!.status).toBe('COMPLETED');
    const pub = await as('aman').post(`/api/content/${c._id}/publish`, { publishedUrl: 'https://instagram.com/p/abc' });
    expect(pub.status).toBe(200); await settle();
    const fresh = await Content.findById(c._id);
    expect(fresh!.stage).toBe('PUBLISHED'); expect(fresh!.progress).toBe(100); expect(fresh!.status).toBe('COMPLETED');
    const acts = (await ActivityLog.find({ contentId: c._id })).map((a) => a.action);
    for (const a of ['content.created', 'script.submitted', 'approval.client.sent', 'approval.client.approved', 'media.uploaded', 'content.scheduled', 'content.stage']) expect(acts).toContain(a);
    const room = await ChatRoom.findOne({ contentId: c._id });
    const events = (await Message.find({ roomId: room!._id, kind: 'SYSTEM' })).map((m) => m.system!.event);
    for (const e of ['script.submitted', 'client_review.sent', 'client.approved', 'raw.uploaded', 'edit.uploaded', 'smm.changes', 'final.uploaded', 'content.published']) expect(events).toContain(e);
    expect(await AutomationRun.countDocuments({ result: 'FAILED' })).toBe(0);
    expect(await AutomationRun.countDocuments({ result: 'SUCCESS' })).toBeGreaterThan(8);
    const detail = await as('ishita').get(`/api/content/${c.contentId}`); // lookup by human ID works too
    expect(detail.body.content.lastAction.text).toContain('published');
  });
});
