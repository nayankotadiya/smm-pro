import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from 'mongoose';
import { User, RoleModel, Client, Content, Campaign, ScriptVersion, Task, Media, Message, ChatRoom, Approval, ActivityLog, Shoot, Reminder, ScheduledPost, Presence, Integration, WebhookEvent } from '../models';
import { ah } from '../utils/async';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { requirePerm, can, clearPermCache } from '../middleware/auth';
import { visibilityFilter } from '../services/content';
import { ROLES, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, STAGES } from '../config/constants';
import { logActivity } from '../services/activity';
import { teamWorkload, storage } from '../services/dashboard';
import { driveConfigured, storageQuota, serviceAccountEmail, getRootFolderStatus } from '../integrations/drive';
import { aisensyConfigured, sendTemplate } from '../integrations/aisensy';
import { pushConfigured } from '../integrations/push';
import { emailConfigured } from '../integrations/email';
import { env } from '../config/env';
import { escapeRx } from './clients';

const r = Router();

// ---------------- Global search ----------------
r.get('/search', ah(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json({});
  const rx = new RegExp(escapeRx(term), 'i'); const u = req.user!; const L = 6;
  const vis = visibilityFilter(u);
  const visIds = (await Content.find(vis).select('_id').lean()).map((c) => c._id);
  const myRooms = (await ChatRoom.find({ participants: u._id }).select('_id').lean()).map((x) => x._id);
  const taskScope = can(u, 'tasks.read.all') ? {} : { $or: [{ assignedTo: u._id }, { createdBy: u._id }] };
  const [clients, content, campaigns, scripts, tasks, files, messages, team, approvals] = await Promise.all([
    can(u, 'clients.read') ? Client.find({ $or: [{ name: rx }, { businessName: rx }, { contactPerson: rx }] }).limit(L).select('name businessName status').lean() : [],
    Content.find({ $and: [vis, { $or: [{ title: rx }, { contentId: rx }] }] }).limit(L).select('contentId title stage').populate('clientId', 'name').lean(),
    can(u, 'clients.read') ? Campaign.find({ name: rx }).limit(L).populate('clientId', 'name').lean() : [],
    ScriptVersion.find({ contentId: { $in: visIds }, $or: [{ hook: rx }, { dialogue: rx }, { body: rx }, { cta: rx }, { 'scenes.dialogue': rx }] }).limit(L).select('label hook dialogue body contentId scriptId').populate('contentId', 'contentId title').lean(),
    Task.find({ $and: [taskScope, { $or: [{ title: rx }, { description: rx }] }] }).limit(L).select('title status dueAt').lean(),
    Media.find({ $and: [can(u, 'media.read.all') ? {} : { contentId: { $in: visIds } }, { fileName: rx }, { status: { $nin: ['UPLOADING', 'FAILED'] } }] }).limit(L).select('fileName category contentId size').lean(),
    Message.find({ roomId: { $in: myRooms }, message: rx, deletedAt: null }).sort({ createdAt: -1 }).limit(L).select('message roomId createdAt').populate('senderId', 'name').lean(),
    User.find({ name: rx, active: true, ...(u.role !== 'SUPER_ADMIN' ? { role: { $ne: 'SUPER_ADMIN' } } : {}) }).limit(L).select('name role').lean(),
    Approval.find({ contentId: { $in: visIds }, version: rx }).limit(L).select('version type status contentId').populate('contentId', 'contentId title').lean(),
  ]);
  res.json({ clients, content, campaigns, scripts, tasks, files, messages, team, approvals });
}));

// ---------------- Calendar ----------------
r.get('/calendar', ah(async (req, res) => {
  const from = new Date(String(req.query.from)); const to = new Date(String(req.query.to));
  if (isNaN(+from) || isNaN(+to) || +to - +from > 100 * 864e5) throw badRequest('Invalid date range');
  const u = req.user!; const vis = visibilityFilter(u);
  const p = req.query as Record<string, string>;
  const extra: any = {}; if (p.clientId) extra.clientId = p.clientId;
  const visIds = (await Content.find({ $and: [vis, extra] }).select('_id').lean()).map((c) => c._id);
  const range = { $gte: from, $lte: to };
  const [deadlines, shoots, posts, tasks, reminders, approvals] = await Promise.all([
    Content.find({ _id: { $in: visIds }, deadline: range }).select('contentId title deadline stage clientId currentOwner').populate('clientId', 'name').populate('currentOwner', 'name role').lean(),
    Shoot.find({ contentId: { $in: visIds }, shootDate: range }).populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } }).populate('shooterId', 'name role').lean(),
    ScheduledPost.find({ contentId: { $in: visIds }, scheduledAt: range, status: { $ne: 'CANCELLED' } }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).lean(),
    Task.find({ ...(can(u, 'tasks.read.all') ? {} : { assignedTo: u._id }), ...(p.clientId ? { clientId: p.clientId } : {}), dueAt: range, status: { $ne: 'COMPLETED' } }).populate('assignedTo', 'name role').populate('clientId', 'name').lean(),
    Reminder.find({ $or: [{ userId: u._id }, { participants: u._id }], remindAt: range, completed: false }).select('title remindAt type contentId clientId').lean(),
    Approval.find({ contentId: { $in: visIds }, status: 'PENDING', sentAt: range }).populate({ path: 'contentId', select: 'contentId title clientId', populate: { path: 'clientId', select: 'name' } }).populate('reviewerId', 'name role').lean(),
  ]);
  const ev: any[] = [];
  deadlines.forEach((c: any) => ev.push({
    id: `c${c._id}`,
    kind: 'CONTENT',
    title: `${c.contentId} deadline`,
    sub: c.title,
    at: c.deadline,
    link: `/content/${c._id}`,
    clientId: c.clientId?._id,
    clientName: c.clientId?.name,
    assigneeId: c.currentOwner?._id,
    assigneeName: c.currentOwner?.name,
    assigneeRole: c.currentOwner?.role,
    stage: c.stage,
  }));
  shoots.forEach((s: any) => ev.push({
    id: `s${s._id}`,
    kind: 'SHOOT',
    title: `Shoot: ${s.contentId?.title || 'Shoot'}`,
    sub: s.location || (s.shooterId?.name ? `Shooter: ${s.shooterId.name}` : undefined),
    at: withTime(s.shootDate, s.shootTime),
    link: `/content/${s.contentId?._id}?tab=shooting`,
    clientId: s.contentId?.clientId?._id,
    clientName: s.contentId?.clientId?.name,
    assigneeId: s.shooterId?._id,
    assigneeName: s.shooterId?.name,
    assigneeRole: s.shooterId?.role || 'SHOOTER',
    location: s.location,
    status: s.status,
    remarksCount: s.remarks?.length || 0,
  }));
  posts.forEach((x: any) => ev.push({
    id: `p${x._id}`,
    kind: x.status === 'PUBLISHED' ? 'PUBLISH' : 'SCHEDULE',
    title: `${x.status === 'PUBLISHED' ? 'Published' : 'Scheduled'}: ${x.contentId?.title}`,
    at: x.scheduledAt,
    link: `/content/${x.contentId?._id}?tab=schedule`,
    clientId: x.contentId?.clientId?._id,
    clientName: x.contentId?.clientId?.name,
  }));
  tasks.forEach((t: any) => ev.push({
    id: `t${t._id}`,
    kind: t.kind === 'EDIT' || t.kind === 'EDIT_REVISION' ? 'EDIT_DEADLINE' : 'TASK',
    title: t.title,
    at: t.dueAt,
    link: `/tasks/${t._id}`,
    clientId: t.clientId?._id,
    clientName: t.clientId?.name,
    assigneeId: t.assignedTo?._id,
    assigneeName: t.assignedTo?.name,
    assigneeRole: t.assignedTo?.role,
  }));
  reminders.forEach((x: any) => ev.push({
    id: `r${x._id}`,
    kind: x.type === 'MEETING' ? 'MEETING' : x.type === 'CLIENT_FOLLOWUP' ? 'FOLLOWUP' : 'REMINDER',
    title: x.title,
    at: x.remindAt,
    link: `/reminders?id=${x._id}`,
  }));
  approvals.forEach((a: any) => ev.push({
    id: `a${a._id}`,
    kind: 'REVIEW',
    title: `Review: ${a.version}`,
    sub: a.contentId?.title,
    at: a.sentAt || a.createdAt,
    link: `/content/${a.contentId?._id}?tab=reviews`,
    clientId: a.contentId?.clientId?._id,
    clientName: a.contentId?.clientId?.name,
    assigneeId: a.reviewerId?._id,
    assigneeName: a.reviewerId?.name,
    assigneeRole: a.reviewerId?.role,
  }));
  res.json(ev.sort((a, b) => +new Date(a.at) - +new Date(b.at)));
}));
function withTime(d: Date, t?: string) { if (!t) return d; const m = /^(\d{1,2}):(\d{2})/.exec(t); if (!m) return d; const x = new Date(d); x.setHours(Number(m[1]), Number(m[2])); return x; }

// ---------------- Reports ----------------
r.get('/reports', requirePerm('reports.view'), ah(async (req, res) => {
  const days = Math.min(365, Number(req.query.days) || 30); const since = new Date(Date.now() - days * 864e5);
  const match: any = { deletedAt: null }; if (req.query.clientId) match.clientId = new (require('mongoose').Types.ObjectId)(String(req.query.clientId));
  const cq: any = req.query.clientId ? { clientId: req.query.clientId } : {};
  const [created, completed, published, byStage, blocked, overdue, approvals, revisions, uploaded, downloads, createdDocs, allContent] = await Promise.all([
    Content.countDocuments({ ...cq, createdAt: { $gte: since } }),
    Content.countDocuments({ ...cq, status: 'COMPLETED', updatedAt: { $gte: since } }),
    Content.countDocuments({ ...cq, stage: 'PUBLISHED', publishedAt: { $gte: since } }),
    Content.aggregate([{ $match: { ...match, status: { $nin: ['CANCELLED'] } } }, { $group: { _id: '$stage', n: { $sum: 1 } } }]),
    Content.countDocuments({ ...cq, status: 'BLOCKED' }),
    Task.countDocuments({ ...cq, status: { $ne: 'COMPLETED' }, dueAt: { $lt: new Date() } }),
    Approval.find({ ...cq, decidedAt: { $gte: since }, sentAt: { $ne: null } }).select('type sentAt decidedAt status').lean(),
    Approval.aggregate([{ $match: { status: 'CHANGES_REQUESTED', decidedAt: { $gte: since }, ...(match.clientId ? { clientId: match.clientId } : {}) } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Media.countDocuments({ ...cq, createdAt: { $gte: since }, status: { $nin: ['UPLOADING', 'FAILED'] } }),
    ActivityLog.countDocuments({ ...cq, action: 'media.downloaded', createdAt: { $gte: since } }),
    Content.find({ ...cq, createdAt: { $gte: since } }).select('createdAt').lean(),
    Content.find({}).select('clientId stage').populate('clientId', 'name').lean(),
  ]);
  const dayKey = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST calendar day
  const perDayMap = new Map<string, number>();
  createdDocs.forEach((c: any) => perDayMap.set(dayKey(c.createdAt), (perDayMap.get(dayKey(c.createdAt)) || 0) + 1));
  const perDay = [...perDayMap.entries()].sort().map(([_id, n]) => ({ _id, n }));
  const clientMap = new Map<string, { name: string; total: number; published: number }>();
  allContent.forEach((c: any) => { if (!c.clientId) return; const k = String(c.clientId._id); const e = clientMap.get(k) || { name: c.clientId.name, total: 0, published: 0 }; e.total++; if (c.stage === 'PUBLISHED') e.published++; clientMap.set(k, e); });
  const byClient = [...clientMap.entries()].map(([_id, v]) => ({ _id, ...v })).sort((a, b) => b.total - a.total);
  const avg = (types: string[]) => { const xs = approvals.filter((a) => types.includes(a.type)); return xs.length ? Math.round((xs.reduce((s, a) => s + (+a.decidedAt! - +a.sentAt!), 0) / xs.length / 36e5) * 10) / 10 : null; };
  const stage = (s: string[]) => byStage.filter((x) => s.includes(x._id)).reduce((a, b) => a + b.n, 0);
  res.json({
    days, created, completed, published, blocked, overdue, filesUploaded: uploaded, filesDownloaded: downloads,
    pending: stage(STAGES.filter((s) => s !== 'PUBLISHED')), editing: stage(['RAW_FOOTAGE', 'EDITING']), shooting: stage(['SHOOTING']), reviews: stage(['INTERNAL_REVIEW', 'SMM_REVIEW', 'FINAL_REVIEW']), clientReviews: stage(['CLIENT_REVIEW', 'CLIENT_FINAL_APPROVAL']),
    byStage: STAGES.map((s) => ({ stage: s, count: byStage.find((x) => x._id === s)?.n || 0 })),
    approvalTimeHours: { internal: avg(['INTERNAL_SCRIPT', 'SMM', 'FINAL']), client: avg(['CLIENT_SCRIPT', 'CLIENT_FINAL']) },
    revisionCount: { total: revisions.reduce((a, b) => a + b.n, 0), byType: revisions },
    createdPerDay: perDay, byClient, workload: await teamWorkload(), storage: await storage(),
  });
}));

// ---------------- Activity / audit ----------------
r.get('/activity', ah(async (req, res) => {
  const p = req.query as Record<string, string>; const q: any = {};
  if (!can(req.user, 'audit.view')) { const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean(); q.contentId = { $in: vis.map((v) => v._id) }; }
  if (p.contentId) q.contentId = p.contentId;
  if (p.clientId) q.clientId = p.clientId;
  if (p.actorId) q.actorId = p.actorId;
  if (p.action) {
    if (p.action === 'assign' || p.action === 'assignment' || p.action === 'assignments') {
      q.action = { $in: ['content.assigned', 'task.assigned', 'task.reassigned', 'assignment'] };
    } else {
      q.action = new RegExp('^' + escapeRx(p.action));
    }
  }
  if (p.q) q.message = new RegExp(escapeRx(p.q), 'i');
  const isSuperOrAdmin = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
  let items = await ActivityLog.find(q).sort({ createdAt: -1 }).skip(Number(p.skip) || 0).limit(Math.min(200, Number(p.limit) || 50)).populate('contentId', 'contentId title').lean();
  if (!isSuperOrAdmin) {
    const superAdminUsers = await User.find({ role: 'SUPER_ADMIN' }).select('_id name').lean();
    const superIds = new Set(superAdminUsers.map((u) => String(u._id)));
    const superNames = superAdminUsers.map((u) => u.name).filter(Boolean);
    items = items.map((x: any) => {
      if (x.actorId && superIds.has(String(x.actorId))) {
        let msg = x.message || '';
        for (const name of superNames) {
          msg = msg.replace(new RegExp(`\\b${escapeRx(name)}\\b`, 'gi'), 'System');
        }
        return { ...x, actorId: undefined, actorName: 'System', message: msg };
      }
      return x;
    });
  }
  res.json(can(req.user, 'audit.view') ? items : items.map(({ ip, ...x }: any) => x));
}));

// ---------------- Team / users ----------------
r.get('/team', ah(async (req, res) => {
  const canSeeAll = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN';
  const roleFilter = canSeeAll ? {} : { role: { $ne: 'SUPER_ADMIN' } };
  const users = await User.find({
    ...(req.query.all === '1' && can(req.user, 'users.manage') ? {} : { active: true }),
    ...roleFilter,
  }).select('name email role title active phone lastLoginAt coverUserId').sort({ name: 1 }).lean();
  const wl = await teamWorkload();
  const pres = await Presence.find({}).lean();
  res.json(users.map((u) => {
    const w = wl.find((x) => String(x.userId) === String(u._id));
    const p = pres.find((x) => String(x.userId) === String(u._id));
    return {
      ...u,
      email: can(req.user, 'users.manage') || String(u._id) === req.user!._id ? u.email : undefined,
      phone: can(req.user, 'users.manage') ? u.phone : undefined,
      workload: w,
      presence: p?.status || 'OFFLINE',
      lastActive: p?.lastActive,
      currentActivity: p?.status === 'OFFLINE' ? undefined : p?.currentActivity,
    };
  }));
}));
r.get('/team/:id', ah(async (req, res) => {
  const u = await User.findById(req.params.id).select('name role title active').lean();
  if (!u) throw notFound('Team member');
  if (u.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') throw notFound('Team member');
  const self = req.params.id === req.user!._id; const mgr = can(req.user, 'tasks.read.all');
  if (!self && !mgr) return res.json({ user: u, restricted: true });
  const id = req.params.id;
  const [tasks, content, activity, presence, reminders] = await Promise.all([
    Task.find({ assignedTo: id }).sort({ status: 1, dueAt: 1 }).limit(100).populate('contentId', 'contentId title').populate('clientId', 'name').lean(),
    Content.find({ $or: ['assignedWriter', 'assignedShooter', 'assignedEditor', 'assignedSMM', 'assignedReviewer'].map((f) => ({ [f]: id })), status: { $nin: ['CANCELLED'] } }).sort({ updatedAt: -1 }).limit(100).populate('clientId', 'name').lean(),
    ActivityLog.find({ actorId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    Presence.findOne({ userId: id }).lean(),
    Task.find({ assignedTo: id, status: { $ne: 'COMPLETED' }, dueAt: { $ne: null } }).sort({ dueAt: 1 }).limit(30).select('title dueAt contentId').lean(),
  ]);
  res.json({ user: u, tasks, content, activity, presence: { status: presence?.status || 'OFFLINE', lastActive: presence?.lastActive, currentActivity: presence?.currentActivity }, schedule: reminders, workload: (await teamWorkload()).find((x) => String(x.userId) === id) });
}));
const userBody = z.object({ name: z.string().min(1).max(80), email: z.string().email(), role: z.enum(ROLES), title: z.string().max(80).optional().nullable(), phone: z.string().max(20).optional().nullable(), password: z.string().min(8).max(100), active: z.boolean().optional(), coverUserId: z.string().optional().nullable() });
r.post('/users', requirePerm('users.manage'), ah(async (req, res) => {
  const b = userBody.parse(req.body);
  if (b.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw forbidden('Only a super admin can create another super admin');
  const { password, ...rest } = b;
  const u = await User.create({ ...rest, passwordHash: await bcrypt.hash(password, 12) });
  await logActivity({ actorId: req.user!._id, action: 'user.created', message: `${req.user!.name} added ${u.name} (${u.role})`, entityType: 'user', entityId: u._id, ip: req.ip });
  res.status(201).json(u);
}));
r.patch('/users/:id', requirePerm('users.manage'), ah(async (req, res) => {
  const b = userBody.partial().parse(req.body);
  const u: any = await User.findById(req.params.id);
  if (!u) throw notFound('User');
  if (u.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw notFound('User');
  if (b.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw forbidden('Only a super admin can promote to super admin');
  if (req.params.id === req.user!._id && (b.active === false || (b.role && b.role !== u.role))) throw badRequest('You cannot change your own role or deactivate yourself');
  const { password, ...rest } = b;
  Object.assign(u, rest);
  if (password) u.passwordHash = await bcrypt.hash(password, 12);
  await u.save();
  await logActivity({ actorId: req.user!._id, action: 'user.updated', message: `${req.user!.name} updated ${u.name}${b.role ? ` (role: ${b.role})` : ''}${b.active === false ? ' (deactivated)' : ''}`, entityType: 'user', entityId: u._id, ip: req.ip });
  res.json(u);
}));

// ---------------- Roles & permissions ----------------
r.get('/roles', requirePerm('roles.manage', 'users.manage'), ah(async (req, res) => {
  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
  const stored = await RoleModel.find({}).lean();
  const visibleRoles = isSuperAdmin ? ROLES : ROLES.filter((k) => k !== 'SUPER_ADMIN');
  res.json({ permissions: PERMISSIONS, roles: visibleRoles.map((k) => ({ key: k, permissions: stored.find((s) => s.key === k)?.permissions || DEFAULT_ROLE_PERMISSIONS[k], locked: k === 'SUPER_ADMIN' })) });
}));
r.patch('/roles/:key', requirePerm('roles.manage'), ah(async (req, res) => {
  const key = z.enum(ROLES).parse(req.params.key);
  if (key === 'SUPER_ADMIN') throw badRequest('Super admin permissions cannot be changed');
  const { permissions } = z.object({ permissions: z.array(z.enum(PERMISSIONS)) }).parse(req.body);
  if (key === 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw forbidden('Only a super admin can change admin permissions');
  await RoleModel.updateOne({ key }, { key, permissions }, { upsert: true });
  clearPermCache();
  await logActivity({ actorId: req.user!._id, action: 'role.updated', message: `${req.user!.name} changed permissions for ${key}`, ip: req.ip });
  res.json({ ok: true });
}));

// ---------------- Integrations (status only; secrets never leave the server) ----------------
r.get('/integrations', requirePerm('integrations.manage'), ah(async (_req, res) => {
  let drive: any = {
    configured: driveConfigured(),
    mode: env.google.serviceAccountB64 ? 'Service account' : env.google.refreshToken ? 'OAuth refresh token' : null,
    sharedDrive: !!env.google.sharedDriveId,
    serviceAccountEmail: serviceAccountEmail(),
    rootFolderName: env.google.rootFolderName,
  };
  if (drive.configured) {
    try {
      drive.quota = await storageQuota();
      drive.rootFolder = await getRootFolderStatus();
      drive.ok = true;
    } catch (e: any) {
      drive.ok = false;
      drive.error = String(e.message).slice(0, 200);
    }
  }
  const lastHook = await WebhookEvent.findOne({ provider: 'aisensy' }).sort({ createdAt: -1 }).select('createdAt eventType').lean();
  res.json({
    drive,
    aisensy: { configured: aisensyConfigured(), campaign: env.aisensy.campaignName || null, webhookSecured: !!env.aisensy.webhookSecret, lastWebhookAt: lastHook?.createdAt || null, webhookUrl: '/api/integrations/aisensy/webhook' },
    push: { configured: pushConfigured() }, email: { configured: emailConfigured() }, redis: { configured: !!env.redisUrl, scheduler: env.redisUrl ? 'BullMQ' : 'In-process' },
    health: await Integration.find({}).lean(),
  });
}));
/** Sends a test template to verify the AiSensy campaign (admin only) */
r.post('/integrations/aisensy/send', requirePerm('integrations.manage'), ah(async (req, res) => {
  const b = z.object({ phone: z.string().min(8).max(20), name: z.string().max(60).optional(), params: z.array(z.string().max(500)).max(10).optional() }).parse(req.body);
  try { const out = await sendTemplate({ phone: b.phone, userName: b.name || 'Test', params: b.params || [b.name || 'Test', 'Test content', 'V1', env.appOrigins[0]] }); await logActivity({ actorId: req.user!._id, action: 'aisensy.test', message: `${req.user!.name} sent an AiSensy test message` }); res.json({ ok: true, messageId: out.messageId }); }
  catch (e: any) { throw badRequest(`AiSensy rejected the message: ${String(e.response?.data?.message || e.message).slice(0, 200)}`); }
}));

r.get('/system-health', requirePerm('users.manage', 'roles.manage', 'integrations.manage', 'dashboard.org'), ah(async (_req, res) => {
  const t0 = Date.now();
  let dbPingMs = -1;
  let dbOk = false;
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.command({ ping: 1 });
      dbPingMs = Date.now() - t0;
      dbOk = true;
    }
  } catch (e: any) {
    dbOk = false;
  }

  const mem = process.memoryUsage();
  let counts = {
    users: 0,
    clients: 0,
    content: 0,
    media: 0,
    tasks: 0,
    approvals: 0,
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const [userCount, clientCount, contentCount, mediaCount, taskCount, approvalCount] = await Promise.all([
        User.countDocuments().catch(() => 0),
        Client.countDocuments().catch(() => 0),
        Content.countDocuments().catch(() => 0),
        Media.countDocuments().catch(() => 0),
        Task.countDocuments().catch(() => 0),
        Approval.countDocuments().catch(() => 0),
      ]);
      counts = {
        users: userCount,
        clients: clientCount,
        content: contentCount,
        media: mediaCount,
        tasks: taskCount,
        approvals: approvalCount,
      };
    }
  } catch (e: any) {
    dbOk = false;
  }

  res.json({
    status: dbOk ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    environment: env.nodeEnv,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    database: {
      connected: dbOk || mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState,
      pingMs: dbPingMs,
      name: mongoose.connection.name || 'smmpro',
      poolSize: Number(process.env.DB_MAX_POOL_SIZE || 50),
    },
    counts,
  });
}));

// ---------------- Purge Demo Data (SUPER_ADMIN only) ----------------
r.post('/system/purge-demo-data', ah(async (req, res) => {
  const u = req.user!;
  if (u.role !== 'SUPER_ADMIN') {
    throw forbidden('Only Super Admin can purge demo data');
  }
  const { purgeDemoData } = await import('../reset_clean');
  await purgeDemoData();
  const userCount = await User.countDocuments();
  res.json({
    ok: true,
    message: 'All demo data (clients, contents, scripts, shoots, chats, tasks, media) successfully purged. All users and accounts preserved.',
    preservedUsers: userCount,
  });
}));

r.get('/meta', ah(async (req, res) => {
  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
  const visibleRoles = isSuperAdmin ? ROLES : ROLES.filter((k) => k !== 'SUPER_ADMIN');
  res.json({ stages: STAGES, roles: visibleRoles });
}));
export default r;
