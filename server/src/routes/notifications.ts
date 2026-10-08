import { Router } from 'express';
import { z } from 'zod';
import { Notification, PushSubscription, User } from '../models';
import { ah } from '../utils/async';
import { emitToUser } from '../services/realtime';
import { env } from '../config/env';
import { pushConfigured, sendPush, getVapidPublicKey } from '../integrations/push';
import { escapeRx } from './clients';
import { forbidden, badRequest } from '../utils/errors';
import { ROLES, NOTIFICATION_CATEGORIES } from '../config/constants';
import { notify } from '../services/notify';
import { logActivity } from '../services/activity';

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

// ---------------- Custom notification send box (SUPER_ADMIN, ADMIN, MANAGER only) ----------------
r.post('/custom', ah(async (req, res) => {
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user!.role)) {
    throw forbidden('Only Admin, Manager, and Super Admin can send custom notifications');
  }

  const b = z.object({
    targetType: z.enum(['ALL', 'ROLE', 'USERS']),
    role: z.enum(ROLES).optional(),
    userIds: z.array(z.string()).optional(),
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(1000),
    category: z.enum(NOTIFICATION_CATEGORIES).default('SYSTEM'),
    critical: z.boolean().default(false),
    link: z.string().max(300).optional().nullable(),
  }).parse(req.body);

  let recipientIds: string[] = [];
  if (b.targetType === 'ALL') {
    const users = await User.find({ active: true }).select('_id').lean();
    recipientIds = users.map((u) => String(u._id));
  } else if (b.targetType === 'ROLE') {
    if (!b.role) throw badRequest('Target role is required');
    const users = await User.find({ role: b.role, active: true }).select('_id').lean();
    recipientIds = users.map((u) => String(u._id));
  } else if (b.targetType === 'USERS') {
    if (!b.userIds?.length) throw badRequest('Select at least one user');
    recipientIds = b.userIds;
  }

  recipientIds = [...new Set(recipientIds.filter(Boolean))];

  const exclude = b.targetType === 'ALL' ? req.user!._id : undefined;
  const created = await notify(recipientIds, {
    type: 'custom.alert',
    category: b.category,
    title: b.title,
    message: b.message,
    link: b.link || undefined,
    critical: b.critical,
  }, { excludeUserId: exclude });

  await logActivity({
    actorId: req.user!._id,
    action: 'notification.custom_sent',
    message: `${req.user!.name} sent custom notification "${b.title}" to ${created.length} recipient(s)`,
    entityType: 'notification',
    ip: req.ip,
  });

  res.json({ ok: true, recipientCount: recipientIds.length, deliveredCount: created.length });
}));

export default r;

export const push = Router();
push.get('/config', (_req, res) => { res.json({ enabled: pushConfigured(), publicKey: getVapidPublicKey() }); });
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
  const configured = pushConfigured();
  if (!configured) {
    return res.status(400).json({
      ok: false,
      configured: false,
      devices: 0,
      sentCount: 0,
      message: 'Push notifications are not configured on the server (missing VAPID keys).',
      results: [],
    });
  }
  const subs = await PushSubscription.find({ userId: req.user!._id });
  const results: any[] = [];
  for (const s of subs) {
    const status = await sendPush(s, {
      title: '🔔 SMM PRO Mobile Alert',
      body: 'Push notification & vibration test successful!',
      url: '/settings',
      tag: 'test-' + Date.now(),
    });
    results.push({
      id: s._id,
      deviceType: s.deviceType || 'unknown',
      platform: s.platform || 'unknown',
      browser: s.browser || 'unknown',
      status,
    });
  }
  const sentCount = results.filter((r) => r.status === 'SENT').length;
  res.json({
    ok: true,
    configured: true,
    devices: subs.length,
    sentCount,
    results,
    message: subs.length === 0
      ? 'No device registered on server for this user.'
      : `${sentCount} of ${subs.length} push notification(s) delivered to push service.`,
  });
}));
