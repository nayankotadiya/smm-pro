import { Reminder, Content, Task, Approval, ScheduledPost, Media, WebhookEvent, Notification, DailyReviewAccess } from '../models';
import { notify, managerIds } from '../services/notify';
import { emitDomain } from '../services/events';
import { emitToUser, emitOrg } from '../services/realtime';
import { moveToStage } from '../services/content';
import { postSystemEvent } from '../services/chat';

const H = 36e5;
function nextRepeat(d: Date, rep: string) {
  const n = new Date(d);
  if (rep === 'DAILY') n.setDate(n.getDate() + 1); else if (rep === 'WEEKLY') n.setDate(n.getDate() + 7); else if (rep === 'MONTHLY') n.setMonth(n.getMonth() + 1);
  while (n < new Date()) { if (rep === 'DAILY') n.setDate(n.getDate() + 1); else if (rep === 'WEEKLY') n.setDate(n.getDate() + 7); else n.setMonth(n.getMonth() + 1); }
  return n;
}
export async function triggerReminders() {
  const due = await Reminder.find({ completed: false, nextFireAt: { $lte: new Date() } }).limit(200);
  for (const r of due) {
    const people = [r.userId, ...(r.participants || [])];
    await notify(people, { type: 'reminder', category: 'REMINDER', title: `Reminder: ${r.title}`, message: r.description || '', link: `/reminders?id=${r._id}`, entityType: 'reminder', entityId: r._id, contentId: r.contentId });
    people.forEach((p) => emitToUser(p, 'reminder:triggered', r.toJSON()));
    r.lastTriggeredAt = new Date();
    if (r.repeat !== 'NONE') r.remindAt = nextRepeat(r.remindAt, r.repeat); // pre-save hook moves nextFireAt forward
    await r.save();
    if (r.repeat === 'NONE') await Reminder.updateOne({ _id: r._id }, { nextFireAt: null });
  }
  return due.length;
}
export async function deadlineChecks() {
  const now = Date.now();
  const active = await Content.find({ status: { $nin: ['COMPLETED', 'CANCELLED'] }, deadline: { $ne: null } });
  for (const c of active) {
    const left = c.deadline!.getTime() - now;
    const owner = c.currentOwner;
    const alerts: any = c.deadlineAlerts || {};
    const link = `/content/${c._id}`;
    if (left <= 0 && !alerts.overdue) {
      await notify([owner, ...(await managerIds())], { type: 'deadline.overdue', category: 'DEADLINE', title: 'Content overdue', message: `${c.contentId} · ${c.title}`, link, entityType: 'content', entityId: c._id, contentId: c._id });
      c.set('deadlineAlerts.overdue', new Date());
    } else if (left > 0 && left <= 2 * H && !alerts.h2) {
      await notify([owner], { type: 'deadline.2h', category: 'DEADLINE', title: 'Due in 2 hours', message: `${c.contentId} · ${c.title}`, link, entityType: 'content', entityId: c._id, contentId: c._id });
      c.set('deadlineAlerts.h2', new Date());
    } else if (left > 2 * H && left <= 24 * H && !alerts.h24) {
      await notify([owner], { type: 'deadline.24h', category: 'DEADLINE', title: 'Due in 24 hours', message: `${c.contentId} · ${c.title}`, link, entityType: 'content', entityId: c._id, contentId: c._id });
      c.set('deadlineAlerts.h24', new Date());
    }
    if (c.isModified()) await c.save();
  }
  const overdueTasks = await Task.find({ status: { $nin: ['COMPLETED', 'BLOCKED'] }, dueAt: { $lt: new Date() }, overdueNotifiedAt: null }).limit(200);
  for (const t of overdueTasks) {
    t.overdueNotifiedAt = new Date(); if (t.status === 'TODO') t.status = 'OVERDUE'; await t.save();
    emitDomain('task.overdue', { contentId: t.contentId ? String(t.contentId) : undefined, assigneeId: t.assignedTo ? String(t.assignedTo) : undefined, taskTitle: t.title });
    emitOrg('task:updated', t.toJSON());
  }
}
export async function approvalChecks() {
  const open = ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'];
  const stale = await Approval.find({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: open }, sentAt: { $lt: new Date(Date.now() - 24 * H) }, followUpReminderAt: null });
  for (const a of stale) { a.followUpReminderAt = new Date(); await a.save(); emitDomain('approval.pending_24h', { contentId: String(a.contentId), version: a.version || '', approvalId: String(a._id) }); }
  const expired = await Approval.find({ status: { $in: open }, expiresAt: { $lt: new Date() } });
  for (const a of expired) { a.status = 'EXPIRED'; a.history.push({ status: 'EXPIRED', at: new Date() } as any); await a.save(); emitOrg('approval:updated', { _id: String(a._id), status: 'EXPIRED' }); }
}
/** Marks scheduled posts as due. Direct platform publishing isn't connected yet, so SMM confirms with the live URL. */
export async function scheduledPostChecks() {
  const due = await ScheduledPost.find({ status: 'SCHEDULED', scheduledAt: { $lte: new Date() }, error: null });
  for (const p of due) {
    const c = await Content.findById(p.contentId);
    if (!c) continue;
    p.error = 'AWAITING_CONFIRMATION'; await p.save();
    await notify([c.assignedSMM, ...(await managerIds())], { type: 'publish.due', category: 'WORKFLOW', title: 'Post is due now', message: `${c.contentId} · confirm when published`, link: `/content/${c._id}?tab=schedule`, entityType: 'content', entityId: c._id, contentId: c._id, critical: true });
  }
}
let lastCleanup = 0;
/** Hourly housekeeping: abandoned uploads, old webhook receipts, very old read notifications */
export async function cleanup() {
  if (Date.now() - lastCleanup < H) return;
  lastCleanup = Date.now();
  await Media.updateMany({ status: 'UPLOADING', createdAt: { $lt: new Date(Date.now() - 24 * H) } }, { status: 'FAILED', error: 'Upload was not completed' });
  await WebhookEvent.deleteMany({ createdAt: { $lt: new Date(Date.now() - 30 * 24 * H) } });
  await Notification.deleteMany({ read: true, critical: false, createdAt: { $lt: new Date(Date.now() - 90 * 24 * H) } });
}
/** 9 AM Daily Review Gate & Fallback Notification */
export async function dailyReviewGateChecks() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const pendingCount = await Approval.countDocuments({ type: { $in: ['INTERNAL_SCRIPT', 'SMM', 'FINAL'] }, status: 'PENDING' });
  if (pendingCount === 0) return;

  const managers = await managerIds();
  for (const mId of managers) {
    const existing = await DailyReviewAccess.findOne({ date: dateStr, reviewerId: mId });
    if (!existing) {
      await DailyReviewAccess.create({
        date: dateStr,
        reviewerId: mId,
        totalPending: pendingCount,
        status: 'PENDING',
      });
      await notify([mId], {
        type: 'daily_review_gate.pending',
        category: 'APPROVAL',
        title: '9 AM Daily Review Gate',
        message: `${pendingCount} items waiting for review today`,
        link: '/approvals?tab=daily-gate',
        entityType: 'dailyReviewGate',
        critical: true,
      });
    }
  }
}

export async function runAllChecks() {
  for (const [name, fn] of [['reminders', triggerReminders], ['deadlines', deadlineChecks], ['approvals', approvalChecks], ['posts', scheduledPostChecks], ['dailyGate', dailyReviewGateChecks], ['cleanup', cleanup]] as const) {
    try { await fn(); } catch (e) { console.error(`[jobs] ${name}`, e); }
  }
}
export { moveToStage, postSystemEvent };
