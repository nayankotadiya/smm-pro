import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as ioc, Socket } from 'socket.io-client';
import { app, as, boot, shutdown, users, settle, makeClient } from './setup';
import { initSockets } from '../sockets';
import { Approval, Task, Notification, Reminder, CommunicationLog, Content, User, WebhookEvent, Presence } from '../models';
import { runAllChecks } from '../jobs/checks';
import { progressFor, mediaFileName } from '../utils/naming';
import { STAGES } from '../config/constants';

let client: any; let content: any;
beforeAll(async () => { await boot(); client = await makeClient(); content = (await as('ishita').post('/api/content', { title: 'Offer Reel', clientId: client._id, deadline: new Date(Date.now() + 90 * 60_000) })).body; });
afterAll(shutdown);

describe('Pure logic', () => {
  it('progress is derived from the stage', () => {
    expect(progressFor('IDEA')).toBe(0); expect(progressFor('PUBLISHED')).toBe(100);
    const all = STAGES.map(progressFor); expect([...all].sort((a, b) => a - b)).toEqual(all);
  });
  it('file names follow the convention', () => {
    expect(mediaFileName('REEL-2026-001', 'EDIT', 2, 'my final FINAL (3).MOV')).toBe('REEL-2026-001_EDIT_V2.mov');
    expect(mediaFileName('REEL-2026-001', 'THUMBNAIL', 1, 'cover', 'image/jpeg')).toBe('REEL-2026-001_THUMBNAIL_V1.jpg');
  });
});

describe('Authentication', () => {
  it('rejects bad credentials and never returns password hashes', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'nayan@t.local', password: 'wrong' })).status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send({ email: 'nayan@t.local', password: 'Password@1' });
    expect(ok.status).toBe(200); expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash/);
    expect(ok.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  });
  it('rotates refresh tokens, requires the CSRF header, and kills the family on reuse', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'aman@t.local', password: 'Password@1' });
    const c1 = login.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c1)).status).toBe(403); // no X-Requested-With
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c1).set('X-Requested-With', 'smm-pro');
    expect(r1.status).toBe(200);
    const c2 = r1.headers['set-cookie'][0].split(';')[0]; expect(c2).not.toBe(c1);
    await new Promise((r) => setTimeout(r, 50));
    // simulate theft: old token replayed after the grace window
    const { RefreshToken } = await import('../models');
    await RefreshToken.updateMany({ revokedAt: { $ne: null } }, { revokedAt: new Date(Date.now() - 60_000) });
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c1).set('X-Requested-With', 'smm-pro')).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', c2).set('X-Requested-With', 'smm-pro')).status).toBe(401);
  });
  it('there is no client role and no client login', async () => {
    const r = await as('nayan').post('/api/users', { name: 'X', email: 'x@t.local', role: 'CLIENT', password: 'Password@1' });
    expect(r.status).toBe(400);
  });
});

describe('RBAC', () => {
  it('editors cannot create clients, see integrations, manage users or roles', async () => {
    expect((await as('rahul').post('/api/clients', { name: 'Nope' })).status).toBe(403);
    expect((await as('rahul').get('/api/integrations')).status).toBe(403);
    expect((await as('rahul').post('/api/users', {})).status).toBe(403);
    expect((await as('rahul').get('/api/roles')).status).toBe(403);
    expect((await as('ishita').get('/api/integrations')).status).toBe(403); // managers don't see integration settings
  });
  it('Mongo operators in query strings or JSON bodies are neutralised', async () => {
    const q = await as('other').get('/api/content?status[$ne]=x&clientId[$gt]=');
    expect(q.status).toBe(200); expect(q.body.total).toBe(0); // still scoped; the operator was not interpreted
    const login = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(login.status).toBe(400);
  });
  it('content list is scoped to assignments', async () => {
    expect((await as('other').get('/api/content')).body.total).toBe(0);
    expect((await as('rahul').get('/api/content')).body.total).toBe(1);
  });
  it('permissions are configurable per role', async () => {
    expect((await as('other').get('/api/reports')).status).toBe(403);
    const roles = await as('nayan').get('/api/roles');
    const editor = roles.body.roles.find((x: any) => x.key === 'EDITOR');
    expect((await as('nayan').patch('/api/roles/EDITOR', { permissions: [...editor.permissions, 'reports.view'] })).status).toBe(200);
    expect((await as('other').get('/api/reports')).status).toBe(200);
    await as('nayan').patch('/api/roles/EDITOR', { permissions: editor.permissions });
    expect((await as('nayan').patch('/api/roles/SUPER_ADMIN', { permissions: [] })).status).toBe(400);
  });
});

describe('Blocked, tasks and reminders', () => {
  it('blocking needs a reason and notifies managers', async () => {
    expect((await as('pooja').post(`/api/content/${content._id}/block`, {})).status).toBe(400);
    expect((await as('pooja').post(`/api/content/${content._id}/block`, { reason: 'Raw product images not received' })).status).toBe(200);
    expect((await as('ishita').get('/api/content/blocked')).body[0].blocked.reason).toMatch(/product images/);
    expect(await Notification.countDocuments({ userId: users.ishita.id, type: 'content.blocked' })).toBe(1);
    expect((await as('pooja').post(`/api/content/${content._id}/unblock`)).status).toBe(200);
  });
  it('overdue tasks trigger the automation exactly once', async () => {
    const t = await as('ishita').post('/api/tasks', { title: 'Edit Leafiber Reel', assignedTo: users.rahul.id, dueAt: new Date(Date.now() - 3600e3) });
    expect(t.status).toBe(201);
    await runAllChecks(); await settle(); await runAllChecks(); await settle();
    expect(await Notification.countDocuments({ userId: users.rahul.id, type: 'task.overdue' })).toBe(1);
    expect(await Notification.countDocuments({ userId: users.ishita.id, type: 'task.overdue' })).toBe(1);
    expect((await Task.findById(t.body._id))!.status).toBe('OVERDUE');
    expect((await as('ishita').get('/api/dashboard/needs-attention')).body.some((x: any) => /Overdue task/.test(x.issue))).toBe(true);
  });
  it('2-hour deadline warning goes to the owner once', async () => {
    expect(await Notification.countDocuments({ userId: users.pooja.id, type: 'deadline.2h' })).toBe(1);
  });
  it('one-off reminders fire once; repeating reminders move forward', async () => {
    const a = await as('aman').post('/api/reminders', { title: 'Client follow-up', remindAt: new Date(Date.now() - 1000), type: 'CLIENT_FOLLOWUP' });
    const b = await as('aman').post('/api/reminders', { title: 'Daily standup', remindAt: new Date(Date.now() - 1000), repeat: 'DAILY', type: 'MEETING' });
    await runAllChecks(); await runAllChecks();
    expect(await Notification.countDocuments({ userId: users.aman.id, entityId: a.body._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: users.aman.id, entityId: b.body._id })).toBe(1);
    expect(+(await Reminder.findById(b.body._id))!.remindAt).toBeGreaterThan(Date.now());
  });
  it('notification preferences are respected', async () => {
    await as('aman').patch('/api/auth/me', { notificationPrefs: { categories: { REMINDER: false } } });
    const before = await Notification.countDocuments({ userId: users.aman.id });
    await as('aman').post('/api/reminders', { title: 'Muted', remindAt: new Date(Date.now() - 1000) });
    await runAllChecks();
    expect(await Notification.countDocuments({ userId: users.aman.id })).toBe(before);
    const list = await as('aman').get('/api/notifications?category=REMINDER');
    expect(list.body.items.length).toBe(2);
    await as('aman').post('/api/notifications/read-all');
    expect((await as('aman').get('/api/notifications')).body.unread).toBe(0);
  });
});

describe('AiSensy webhook', () => {
  it('is idempotent and never auto-approves on a WhatsApp reply', async () => {
    // get to a state with an open client approval
    const sid = content.scriptId;
    await as('pooja').post(`/api/scripts/${sid}/version`, { hook: 'Big offer' });
    await as('pooja').post(`/api/scripts/${sid}/submit`);
    const ia = await Approval.findOne({ contentId: content._id, type: 'INTERNAL_SCRIPT', status: 'PENDING' });
    await as('ishita').post(`/api/approvals/${ia!._id}/review`, { decision: 'APPROVE' });
    const sent = await as('ishita').post('/api/approvals/send', { contentId: content._id, kind: 'SCRIPT' });
    const payload = { id: 'evt_1', topic: 'message.created', data: { message: { id: 'wamid.1', direction: 'inbound', phone_number: '919876543210', text: 'Approved' } } };
    expect((await request(app).post('/api/integrations/aisensy/webhook').send(payload)).body.ok).toBe(true);
    expect((await request(app).post('/api/integrations/aisensy/webhook').send(payload)).body.duplicate).toBe(true);
    expect(await WebhookEvent.countDocuments({})).toBe(1);
    const logs = await CommunicationLog.find({ clientId: client._id, direction: 'INBOUND' });
    expect(logs.length).toBe(1); expect(logs[0].summary).toBe('Approved');
    expect((await Approval.findById(sent.body.approval._id))!.status).toBe('WAITING_FOR_CLIENT'); // still waiting
    expect((await Content.findById(content._id))!.stage).toBe('CLIENT_REVIEW');
    // employee explicitly marks it approved
    const res = await as('ishita').post(`/api/clients/communication/${logs[0]._id}/resolve`, { action: 'MARK_APPROVED', approvalId: sent.body.approval._id });
    expect(res.status).toBe(200);
    const a = await Approval.findById(sent.body.approval._id);
    expect(a!.status).toBe('APPROVED'); expect(a!.source).toBe('MANUAL');
    expect((await Content.findById(content._id))!.stage).toBe('SHOOTING');
  });
  it('delivery status updates tracking by message id', async () => {
    const a = await Approval.create({ contentId: content._id, clientId: client._id, type: 'CLIENT_FINAL', status: 'SENT', externalMessageId: 'msg_77', sentAt: new Date() });
    await request(app).post('/api/integrations/aisensy/webhook').send({ id: 'evt_2', topic: 'message.status.updated', data: { message: { messageId: 'msg_77', status: 'delivered' } } });
    const f = await Approval.findById(a._id);
    expect(f!.status).toBe('DELIVERED'); expect(f!.deliveredAt).toBeTruthy();
    await request(app).post('/api/integrations/aisensy/webhook').send({ id: 'evt_3', topic: 'message.status.updated', data: { message: { messageId: 'msg_77', status: 'read' } } });
    expect((await Approval.findById(a._id))!.status).toBe('DELIVERED'); // "read" on WhatsApp is not "opened the link"
    await a.deleteOne();
  });
  it('expired links are refused and flagged', async () => {
    const { sha256 } = await import('../utils/crypto');
    const tok = 'x'.repeat(43);
    const a = await Approval.create({ contentId: content._id, clientId: client._id, type: 'CLIENT_FINAL', status: 'SENT', tokenHash: sha256(tok), expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).get(`/api/public/approval/${tok}`)).status).toBe(410);
    expect((await Approval.findById(a._id))!.status).toBe('EXPIRED');
  });
});

describe('Real-time: chat, presence, notifications', () => {
  let server: http.Server; let port: number; let s1: Socket; let s2: Socket; let roomId: string;
  const connect = (who: string) => new Promise<Socket>((res, rej) => { const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: users[who].token }, transports: ['websocket'] }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
  const once = <T = any>(s: Socket, ev: string, pred: (d: T) => boolean = () => true) => new Promise<T>((res) => { const h = (d: T) => { if (pred(d)) { s.off(ev, h); res(d); } }; s.on(ev, h); });
  let ioServer: any;
  beforeAll(async () => { server = http.createServer(app); ioServer = initSockets(server); await new Promise<void>((r) => server.listen(0, r)); port = (server.address() as any).port; });
  afterAll(async () => { s1?.close(); s2?.close(); await settle(200); await new Promise((r) => ioServer.close(r)); });

  it('rejects sockets without a valid token', async () => {
    await expect(new Promise((res, rej) => { const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: 'bad' }, transports: ['websocket'] }); s.on('connect', () => rej(new Error('connected'))); s.on('connect_error', (e) => { s.close(); res(e.message); }); })).resolves.toBe('unauthorized');
  });
  it('presence goes online on connect and offline on disconnect', async () => {
    s1 = await connect('ishita');
    const online = once(s1, 'user_online', (d: any) => d.userId === users.rahul.id);
    s2 = await connect('rahul'); await online;
    expect((await Presence.findOne({ userId: users.rahul.id }))!.status).toBe('ONLINE');
    s2.emit('presence:set', { status: 'DND' });
    await once(s1, 'user_online', (d: any) => d.userId === users.rahul.id && d.status === 'DND');
    const off = once(s1, 'user_offline', (d: any) => d.userId === users.rahul.id);
    s2.close(); await off;
    expect((await Presence.findOne({ userId: users.rahul.id }))!.status).toBe('OFFLINE');
    s2 = await connect('rahul');
  });
  it('messages, typing and read receipts are delivered live; outsiders cannot join', async () => {
    const detail = await as('ishita').get(`/api/content/${content._id}`); roomId = detail.body.roomId;
    const join = (s: Socket) => new Promise<boolean>((r) => s.emit('chat:join', roomId, r));
    expect(await join(s1)).toBe(true); expect(await join(s2)).toBe(true);
    const outsider = await connect('other'); expect(await new Promise<boolean>((r) => outsider.emit('chat:join', roomId, r))).toBe(false); outsider.close();
    expect((await as('other').get(`/api/chat/${roomId}/messages`)).status).toBe(403);
    const typing = once(s1, 'message:typing'); s2.emit('message:typing', { roomId, typing: true });
    expect((await typing).name).toBe('Rahul');
    const got = once(s1, 'message:new', (m: any) => m.kind === 'USER'); const note = once(s1, 'notification:new', (n: any) => n.category === 'CHAT');
    const sent = await as('rahul').post(`/api/chat/${roomId}/messages`, { message: 'Change subtitle at 00:08 @Ishita' });
    expect(sent.status).toBe(201);
    expect((await got).message).toContain('00:08'); expect((await note).link).toBe(`/chat/${roomId}`);
    expect((await as('ishita').get('/api/chat/unread-count')).body.count).toBeGreaterThan(0);
    const read = once(s2, 'message:read'); s1.emit('message:read', { roomId }); await read;
    expect((await as('ishita').get('/api/chat/unread-count')).body.count).toBe(0);
    // chat -> task, chat -> reminder, reaction, pin
    const task = await as('ishita').post(`/api/chat/message/${sent.body._id}/task`, {});
    expect(task.status).toBe(201); expect(task.body.title).toContain('Change subtitle'); expect(task.body.assignedTo).toBe(users.rahul.id); expect(task.body.sourceMessageId).toBe(sent.body._id);
    const rem = await as('ishita').post(`/api/chat/message/${sent.body._id}/reminder`, { remindAt: new Date(Date.now() + 864e5) });
    expect(rem.status).toBe(201); expect(rem.body.messageId).toBe(sent.body._id);
    const react = once(s2, 'message:reaction'); await as('ishita').post(`/api/chat/message/${sent.body._id}/reaction`, { key: 'ack' }); expect((await react).reactions.length).toBe(1);
    expect((await as('ishita').post(`/api/chat/message/${sent.body._id}/pin`)).body.pinned).toBe(true);
    expect((await as('ishita').get(`/api/chat/${roomId}/messages?q=subtitle`)).body.messages.length).toBe(1);
  });
  it('content viewers receive workflow updates without refresh', async () => {
    s2.emit('content:watch', content._id); await settle(100);
    const upd = once(s2, 'workflow:updated');
    await as('ishita').patch(`/api/content/${content._id}`, { priority: 'URGENT' });
    expect((await upd).priority).toBe('URGENT');
  });
  it('direct chats are private and de-duplicated', async () => {
    const a = await as('ishita').post('/api/chat/rooms', { type: 'DIRECT', userId: users.aman.id });
    const b = await as('aman').post('/api/chat/rooms', { type: 'DIRECT', userId: users.ishita.id });
    expect(a.body._id).toBe(b.body._id);
    expect((await as('rahul').post(`/api/chat/${a.body._id}/messages`, { message: 'hi' })).status).toBe(403);
  });
});

describe('Dashboards, search, calendar, reports', () => {
  it('org dashboard for managers, personal dashboard for team', async () => {
    const m = await as('ishita').get('/api/dashboard/summary');
    expect(m.body.org.totalClients).toBe(1); expect(m.body.org.totalContent).toBe(1); expect(m.body.org.shooting).toBe(1);
    const e = await as('rahul').get('/api/dashboard/summary');
    expect(e.body.org).toBeNull(); expect(e.body.me.assigned).toBeGreaterThan(0);
    expect((await as('rahul').get('/api/dashboard/team-workload')).status).toBe(403);
    const wl = await as('ishita').get('/api/dashboard/team-workload');
    expect(wl.body.find((x: any) => x.name === 'Rahul').pending).toBeGreaterThan(0);
    const st = await as('ishita').get('/api/dashboard/content-by-stage');
    expect(st.body.find((x: any) => x.stage === 'SHOOTING').count).toBe(1);
    for (const p of ['recent-content', 'pending-approvals', 'today-tasks?scope=overdue', 'reminders', 'activity', 'team-presence', 'waiting-for', 'storage', 'automation-activity', 'blocked-items', 'my-files', 'chat-preview']) expect((await as('ishita').get(`/api/dashboard/${p}`)).status, p).toBe(200);
  });
  it('global search groups results and respects visibility', async () => {
    const r = await as('ishita').get('/api/search?q=offer');
    expect(r.body.content.length).toBe(1); expect(r.body.scripts.length).toBe(1);
    expect((await as('other').get('/api/search?q=offer')).body.content.length).toBe(0);
    expect((await as('ishita').get('/api/search?q=zemora')).body.clients.length).toBe(1);
  });
  it('calendar and reports respond with real data', async () => {
    const cal = await as('ishita').get(`/api/calendar?from=${new Date(Date.now() - 864e5).toISOString()}&to=${new Date(Date.now() + 7 * 864e5).toISOString()}`);
    expect(cal.status).toBe(200); expect(cal.body.some((e: any) => e.kind === 'CONTENT')).toBe(true);
    const rep = await as('ishita').get('/api/reports?days=30');
    expect(rep.status).toBe(200); expect(rep.body.created).toBe(1); expect(rep.body.shooting).toBe(1);
  });
  it('client workspace, communication log with follow-up reminder, audit trail', async () => {
    const when = new Date(Date.now() + 864e5).toISOString();
    const log = await as('ishita').post(`/api/clients/${client._id}/communication`, { type: 'WHATSAPP', summary: 'Client requested changes to opening scene.', actionRequired: 'Update Edit V3.', nextFollowUp: when });
    expect(log.status).toBe(201);
    expect(await Reminder.countDocuments({ clientId: client._id, type: 'CLIENT_FOLLOWUP' })).toBe(1);
    const ov = await as('ishita').get(`/api/clients/${client._id}/overview`);
    expect(ov.body.content.length).toBe(1); expect(ov.body.reviews.length).toBeGreaterThan(0);
    const audit = await as('nayan').get('/api/activity?action=auth');
    expect(audit.body.length).toBeGreaterThan(0);
    expect((await as('nayan').get('/api/team')).body.length).toBe(7);
    expect(await User.countDocuments({ role: 'CLIENT' as any })).toBe(0);
  });
});
