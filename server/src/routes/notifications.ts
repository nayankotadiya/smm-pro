import { Router } from 'express';
import { z } from 'zod';
import { Notification, PushSubscription } from '../models';
import { ah } from '../utils/async';
import { emitToUser } from '../services/realtime';
import { env } from '../config/env';
import { pushConfigured, sendPush } from '../integrations/push';
import { escapeRx } from './clients';

const r = Router();
r.get('/', ah(async (req, res) => {
  const p = req.query as Record<string, string>; const q: any = { userId: req.user!._id };
  if (p.unread === '1') q.read = false;
  if (p.category) q.category = { $in: p.category.split(',') };
  if (p.q) q.$or = [{ title: new RegExp(escapeRx(p.q), 'i') }, { message: new RegExp(escapeRx(p.q), 'i') }];
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  if (p.range === 'today') q.createdAt = { $gte: sod };
  if (p.range === 'yesterday') q.createdAt = { $gte: new Date(sod.getTime() - 864e5), $lt: sod };
  if (p.range === 'week') q.createdAt = { $gte: new Date(sod.getTime() - 6 * 864e5) };
  const limit = Math.min(100, Number(p.limit) || 30);
  const [items, unread] = await Promise.all([Notification.find(q).sort({ createdAt: -1 }).skip(Number(p.skip) || 0).limit(limit).lean(), Notification.countDocuments({ userId: req.user!._id, read: false })]);
  res.json({ items, unread });
}));
r.patch('/:id/read', ah(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user!._id }, { read: req.body?.read !== false, readAt: new Date() });
  emitToUser(req.user!._id, 'notification:read', { id: req.params.id });
  res.json({ ok: true });
}));
r.post('/read-all', ah(async (req, res) => {
  await Notification.updateMany({ userId: req.user!._id, read: false }, { read: true, readAt: new Date() });
  emitToUser(req.user!._id, 'notification:read', { all: true });
  res.json({ ok: true });
}));
r.delete('/:id', ah(async (req, res) => { await Notification.deleteOne({ _id: req.params.id, userId: req.user!._id, critical: false }); res.json({ ok: true }); }));
export default r;

export const push = Router();
push.get('/config', (_req, res) => { res.json({ enabled: pushConfigured(), publicKey: env.vapid.publicKey || null }); });
push.post('/subscribe', ah(async (req, res) => {
  const b = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }), deviceType: z.string().max(30).optional(), platform: z.string().max(40).optional(), browser: z.string().max(40).optional() }).parse(req.body);
  await PushSubscription.findOneAndUpdate({ endpoint: b.endpoint }, { ...b, userId: req.user!._id, lastUsedAt: new Date(), failures: 0 }, { upsert: true });
  res.status(201).json({ ok: true });
}));
push.post('/unsubscribe', ah(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
  await PushSubscription.deleteOne({ endpoint, userId: req.user!._id });
  res.json({ ok: true });
}));
push.get('/devices', ah(async (req, res) => { res.json(await PushSubscription.find({ userId: req.user!._id }).select('deviceType platform browser lastUsedAt createdAt endpoint').lean()); }));
push.post('/test', ah(async (req, res) => {
  const subs = await PushSubscription.find({ userId: req.user!._id });
  const results: string[] = [];
  for (const s of subs) results.push(await sendPush(s, { title: 'SMM PRO', body: 'Push notifications are working on this device.', url: '/settings' }));
  res.json({ devices: subs.length, results });
}));
