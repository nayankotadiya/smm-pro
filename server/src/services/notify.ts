import { Notification, User, PushSubscription } from '../models';
import { emitToUser } from './realtime';
import { sendPush } from '../integrations/push';
import { sendEmail } from '../integrations/email';
import { NotificationCategory } from '../config/constants';

export interface NotifyInput {
  type: string; category: NotificationCategory; title: string; message?: string; link?: string;
  entityType?: string; entityId?: any; contentId?: any; critical?: boolean;
}
/** Creates notifications honoring per-user preferences; critical ones bypass category opt-outs. */
export async function notify(userIds: any[], n: NotifyInput, opts: { excludeUserId?: any } = {}) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => id !== String(opts.excludeUserId || ''));
  if (!ids.length) return [];
  // cover: if someone has nominated a colleague to cover for them, that colleague is notified as well
  const covers = await User.find({ _id: { $in: ids }, coverUserId: { $ne: null } }).select('coverUserId').lean();
  for (const c of covers) { const cid = String(c.coverUserId); if (!ids.includes(cid) && cid !== String(opts.excludeUserId || '')) ids.push(cid); }
  const users = await User.find({ _id: { $in: ids }, active: true }).lean();
  const created: any[] = [];
  for (const u of users) {
    const prefs: any = u.notificationPrefs || {};
    const catOn = n.critical || prefs.categories?.[n.category] !== false;
    if (!catOn) continue;
    const doc = await Notification.create({ userId: u._id, ...n, entityId: n.entityId ? String(n.entityId) : undefined });
    if (prefs.inApp !== false || n.critical) emitToUser(u._id, 'notification:new', doc.toJSON());
    if (prefs.push !== false) void deliverPush(doc, u._id);
    if (prefs.email && u.email) void deliverEmail(doc, u.email);
    created.push(doc);
  }
  return created;
}
async function deliverPush(doc: any, userId: any) {
  const subs = await PushSubscription.find({ userId });
  if (!subs.length) { await Notification.updateOne({ _id: doc._id }, { 'delivery.push': 'NO_SUBSCRIPTION' }); return; }
  let ok = 0;
  for (const s of subs) {
    const r = await sendPush(s, { title: doc.title, body: doc.message || '', url: doc.link || '/notifications', tag: String(doc._id) });
    if (r === 'SENT') { ok++; s.lastUsedAt = new Date(); s.failures = 0; await s.save(); }
    else if (r === 'GONE') await s.deleteOne();
    else if (r === 'FAILED') { s.failures = (s.failures || 0) + 1; await s.save(); }
  }
  // "SENT" means accepted by the push service; we never claim device delivery
  await Notification.updateOne({ _id: doc._id }, { 'delivery.push': ok ? 'SENT' : 'FAILED' });
}
async function deliverEmail(doc: any, to: string) {
  const ok = await sendEmail(to, doc.title, `${doc.message || ''}\n\nOpen: ${(process.env.APP_URL || '').split(',')[0]}${doc.link || ''}`);
  await Notification.updateOne({ _id: doc._id }, { 'delivery.email': ok === null ? 'NONE' : ok ? 'SENT' : 'FAILED' });
}
/** Managers & admins to be looped in on org-level events */
export async function managerIds() {
  const u = await User.find({ role: { $in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }, active: true }).select('_id').lean();
  return u.map((x) => String(x._id));
}
export async function idsByRole(role: string) {
  return (await User.find({ role, active: true }).select('_id').lean()).map((x) => String(x._id));
}
