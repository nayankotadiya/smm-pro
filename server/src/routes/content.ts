import { Router } from 'express';
import { z } from 'zod';
import { Content, Script, ScriptVersion, Shoot, Media, Approval, Task, Feedback, ActivityLog, ScheduledPost, Reminder, User, ChatRoom, Message, ChatActionMessage } from '../models';
import { ah } from '../utils/async';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { requirePerm, can } from '../middleware/auth';
import { createContent, getVisibleContent, visibilityFilter, applyStage, setLastAction, broadcastContent, moveToStage } from '../services/content';
import { logActivity } from '../services/activity';
import { ensureContentRoom, postSystemEvent } from '../services/chat';
import { notify, managerIds } from '../services/notify';
import { emitDomain } from '../services/events';
import { closeTasks, createTask } from '../services/tasks';
import { STAGES } from '../config/constants';
import { escapeRx } from './clients';

const r = Router();
const oid = z.string().regex(/^[a-f0-9]{24}$/).optional().nullable();
const body = z.object({
  title: z.string().min(1).max(160), clientId: z.string(), campaignId: oid,
  type: z.enum(['REEL', 'POST', 'CAROUSEL', 'STORY', 'VIDEO', 'SHORT', 'AD']).optional(),
  platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'LINKEDIN', 'X', 'MULTI']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), deadline: z.coerce.date().optional().nullable(),
  description: z.string().max(4000).optional().nullable(), caption: z.string().max(4000).optional().nullable(), hashtags: z.string().max(2000).optional().nullable(),
  assignedWriter: oid, assignedShooter: oid, assignedEditor: oid, assignedSMM: oid, assignedReviewer: oid,
});
const ASSIGN = ['assignedWriter', 'assignedShooter', 'assignedEditor', 'assignedSMM', 'assignedReviewer'] as const;

r.get('/', ah(async (req, res) => {
  const f: any[] = [visibilityFilter(req.user!)];
  const q = req.query as Record<string, string>;
  if (q.clientId) f.push({ clientId: q.clientId });
  if (q.campaignId) f.push({ campaignId: q.campaignId });
  if (q.platform) f.push({ platform: q.platform });
  if (q.type) f.push({ type: q.type });
  if (q.status) f.push({ status: { $in: q.status.split(',') } });
  if (q.stage) f.push({ stage: { $in: q.stage.split(',') } });
  if (q.priority) f.push({ priority: q.priority });
  if (q.member) f.push({ $or: [...ASSIGN.map((a) => ({ [a]: q.member })), { currentOwner: q.member }] });
  if (q.owner) f.push({ currentOwner: q.owner === 'me' ? req.user!._id : q.owner });
  if (q.from || q.to) f.push({ deadline: { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) } });
  if (q.overdue === '1') f.push({ deadline: { $lt: new Date() }, status: { $nin: ['COMPLETED', 'CANCELLED'] } });
  if (q.q) f.push({ $or: [{ title: new RegExp(escapeRx(q.q), 'i') }, { contentId: new RegExp(escapeRx(q.q), 'i') }] });
  const page = Math.max(1, Number(q.page) || 1); const limit = Math.min(100, Number(q.limit) || 50);
  const where = { $and: f };
  const [items, total] = await Promise.all([
    Content.find(where).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('clientId', 'name')
      .populate('campaignId', 'name')
      .populate('currentOwner nextOwner', 'name role')
      .populate('latestMediaId', 'fileName mimeType')
      .lean(),
    Content.countDocuments(where),
  ]);
  res.json({ items, total, page, limit });
}));

r.post('/', requirePerm('content.write'), ah(async (req, res) => { res.status(201).json(await createContent(body.parse(req.body), req.user!)); }));

r.get('/blocked', ah(async (req, res) => {
  res.json(await Content.find({ $and: [visibilityFilter(req.user!), { status: 'BLOCKED' }] }).sort({ 'blocked.since': 1 }).populate('clientId', 'name').populate('currentOwner', 'name role').lean());
}));
r.get('/changes-requested', ah(async (req, res) => {
  const fb = await Feedback.find({ resolved: false }).sort({ createdAt: -1 }).limit(200).populate({ path: 'contentId', select: 'contentId title clientId assignedEditor assignedWriter stage status', populate: [{ path: 'clientId', select: 'name' }, { path: 'assignedEditor assignedWriter', select: 'name' }] }).populate('approvalId', 'type status').lean();
  const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean();
  const ok = new Set(vis.map((v) => String(v._id)));
  const rows = fb.filter((f: any) => f.contentId && ok.has(String(f.contentId._id)) && f.approvalId?.status === 'CHANGES_REQUESTED');
  const tasks = await Task.find({ contentId: { $in: rows.map((x: any) => x.contentId._id) }, kind: { $in: ['EDIT_REVISION', 'SCRIPT_REVISION'] }, status: { $ne: 'COMPLETED' } }).populate('assignedTo', 'name').lean();
  res.json(rows.map((f: any) => ({ ...f, task: tasks.find((t) => String(t.contentId) === String(f.contentId._id)) || null })));
}));

r.get('/:id', ah(async (req, res) => {
  const c = await getVisibleContent(req.user!, req.params.id);
  const id = c._id;
  const [content, script, versions, shoot, media, approvals, tasks, feedback, activity, room, posts, reminders] = await Promise.all([
    Content.findById(id).populate('clientId', 'name businessName phone contactPerson').populate('campaignId', 'name').populate('currentOwner nextOwner assignedWriter assignedShooter assignedEditor assignedSMM assignedReviewer createdBy', 'name role').populate('lastAction.by blocked.by', 'name').lean(),
    Script.findOne({ contentId: id }).lean(),
    ScriptVersion.find({ contentId: id }).sort({ version: -1 }).populate('createdBy reviewedBy', 'name').lean(),
    Shoot.findOne({ contentId: id }).populate('shooterId', 'name').lean(),
    Media.find({ contentId: id, status: { $nin: ['UPLOADING', 'FAILED'] } }).sort({ createdAt: -1 }).populate('uploadedBy', 'name').lean(),
    Approval.find({ contentId: id }).sort({ createdAt: 1 }).populate('reviewerId createdBy history.by', 'name').lean(),
    Task.find({ contentId: id }).sort({ createdAt: -1 }).populate('assignedTo', 'name').lean(),
    Feedback.find({ contentId: id }).sort({ createdAt: -1 }).lean(),
    ActivityLog.find({ contentId: id }).sort({ createdAt: -1 }).limit(100).lean(),
    ensureContentRoom(c),
    ScheduledPost.find({ contentId: id }).sort({ createdAt: -1 }).lean(),
    Reminder.find({ contentId: id, completed: false }).sort({ remindAt: 1 }).lean(),
  ]);
  res.json({ content, script, versions, shoot, media, approvals, tasks, feedback, activity, roomId: room._id, posts, reminders, stages: STAGES });
}));

r.patch('/:id', ah(async (req, res) => {
  const c: any = await getVisibleContent(req.user!, req.params.id);
  const b = body.partial().omit({ clientId: true }).parse(req.body);
  const touchingAssign = ASSIGN.some((a) => (b as any)[a] !== undefined);
  if (touchingAssign && !can(req.user, 'content.assign')) throw forbidden('You cannot change assignments');
  if (!can(req.user, 'content.write') && !touchingAssign) throw forbidden();
  const changed: string[] = [];
  for (const [k, v] of Object.entries(b)) { if (String(c[k] ?? '') !== String(v ?? '')) changed.push(k); c[k] = v; }
  if (touchingAssign) applyStage(c, c.stage);
  if (changed.includes('deadline')) c.deadlineAlerts = {};
  if (changed.length) await setLastAction(c, `${req.user!.name} updated ${changed.map((x) => x.replace('assigned', '').toLowerCase()).join(', ')}`, req.user!._id);
  await c.save();
  if (touchingAssign) {
    await ensureContentRoom(c);
    const newly = ASSIGN.filter((a) => changed.includes(a) && c[a]).map((a) => c[a]);
    await notify(newly, { type: 'content.assigned', category: 'TASK', title: 'You were assigned to content', message: `${c.contentId} · ${c.title}`, link: `/content/${c._id}`, entityType: 'content', entityId: c._id, contentId: c._id }, { excludeUserId: req.user!._id });
  }
  if (changed.length) await logActivity({ actorId: req.user!._id, action: touchingAssign ? 'content.assigned' : 'content.updated', message: `${req.user!.name} updated ${c.contentId} (${changed.join(', ')})`, entityType: 'content', entityId: c._id, contentId: c._id, clientId: c.clientId, ip: req.ip });
  await broadcastContent(c);
  res.json(c);
}));

r.post('/:id/block', ah(async (req, res) => {
  const b = z.object({ reason: z.string().min(3).max(500), nextAction: z.string().max(300).optional() }).parse(req.body);
  const c: any = await getVisibleContent(req.user!, req.params.id);
  c.status = 'BLOCKED'; c.blocked = { reason: b.reason, since: new Date(), by: req.user!._id, nextAction: b.nextAction };
  await setLastAction(c, `${req.user!.name} marked as blocked`, req.user!._id); await c.save();
  await logActivity({ actorId: req.user!._id, action: 'content.blocked', message: `${req.user!.name} blocked ${c.contentId}: ${b.reason}`, entityType: 'content', entityId: c._id, contentId: c._id, clientId: c.clientId });
  await postSystemEvent(c._id, 'content.blocked', 'CONTENT BLOCKED', [`Reason: ${b.reason}`, `By ${req.user!.name}`]);
  await notify(await managerIds(), { type: 'content.blocked', category: 'WORKFLOW', title: 'Content blocked', message: `${c.contentId}: ${b.reason}`, link: `/content/${c._id}`, entityType: 'content', entityId: c._id, contentId: c._id }, { excludeUserId: req.user!._id });
  emitDomain('content.blocked', { contentId: String(c._id), actorId: req.user!._id, reason: b.reason });
  await broadcastContent(c); res.json(c);
}));
r.post('/:id/unblock', ah(async (req, res) => {
  const c: any = await getVisibleContent(req.user!, req.params.id);
  if (c.status !== 'BLOCKED') throw badRequest('Content is not blocked');
  c.status = 'ACTIVE'; c.blocked = undefined;
  await setLastAction(c, `${req.user!.name} removed the block`, req.user!._id); await c.save();
  await logActivity({ actorId: req.user!._id, action: 'content.unblocked', message: `${req.user!.name} unblocked ${c.contentId}`, entityType: 'content', entityId: c._id, contentId: c._id, clientId: c.clientId });
  await postSystemEvent(c._id, 'content.unblocked', 'BLOCK REMOVED', [`By ${req.user!.name}`]);
  await broadcastContent(c); res.json(c);
}));

/** Manager override when the real world got ahead of the system */
r.post('/:id/stage', requirePerm('content.assign'), ah(async (req, res) => {
  const b = z.object({ stage: z.enum(STAGES), reason: z.string().min(3).max(300) }).parse(req.body);
  const c = await getVisibleContent(req.user!, req.params.id);
  await moveToStage(c, b.stage, req.user!._id, `${req.user!.name} moved stage manually: ${b.reason}`);
  if (b.stage === 'SHOOTING' && !(await Shoot.exists({ contentId: c._id }))) await Shoot.create({ contentId: c._id, clientId: c.clientId, shooterId: c.assignedShooter });
  await postSystemEvent(c._id, 'stage.manual', 'STAGE CHANGED MANUALLY', [`Now: ${b.stage.replace(/_/g, ' ')}`, `Reason: ${b.reason}`, `By ${req.user!.name}`]);
  res.json(c);
}));

// ----- Shooting -----
r.patch('/:id/shoot', ah(async (req, res) => {
  const c: any = await getVisibleContent(req.user!, req.params.id);
  const b = z.object({
    shootDate: z.coerce.date().optional().nullable(),
    shootTime: z.string().max(20).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    talent: z.string().max(500).optional().nullable(),
    product: z.string().max(500).optional().nullable(),
    props: z.string().max(1000).optional().nullable(),
    shotList: z.string().max(5000).optional().nullable(),
    instructions: z.string().max(5000).optional().nullable(),
    beforeShootRemarks: z.string().max(5000).optional().nullable(),
    afterShootRemarks: z.string().max(5000).optional().nullable(),
    status: z.enum(['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'RAW_UPLOADED', 'COMPLETED']).optional(),
    checklist: z.record(z.boolean()).optional(),
    shooterId: oid,
  }).parse(req.body);

  const canManageShoot = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'SMM'].includes(req.user!.role) || can(req.user, 'content.write');

  // Fields that only Manager / SMM / Admin can set or alter
  const schedulingKeys = ['shootDate', 'shootTime', 'location', 'talent', 'product', 'props', 'shotList', 'instructions', 'shooterId'];
  const isSchedulingAttempt = schedulingKeys.some((k) => (req.body as any)[k] !== undefined);

  if (isSchedulingAttempt && !canManageShoot) {
    throw forbidden('Only Managers, SMM, or Admins can schedule shoots and set shoot date, time, location, or instructions. Shooters cannot set or modify shoot details.');
  }

  let s: any = await Shoot.findOne({ contentId: c._id });
  if (!s) s = new Shoot({ contentId: c._id, clientId: c.clientId, shooterId: c.assignedShooter });
  const { checklist, ...rest } = b;
  Object.assign(s, rest);
  if (checklist) for (const [k, v] of Object.entries(checklist)) if (k in s.checklist.toObject()) s.checklist[k] = v;
  if (b.shootDate && s.status === 'PENDING') s.status = 'SCHEDULED';
  if (b.shooterId) s.shooterId = b.shooterId;
  await s.save();

  if (b.shooterId && String(c.assignedShooter) !== String(b.shooterId)) {
    c.assignedShooter = b.shooterId;
    applyStage(c, c.stage);
  }
  await setLastAction(c, `${req.user!.name} updated shoot details`, req.user!._id);
  await c.save();

  // If Manager or SMM scheduled/updated shoot details, update or create shooter task and notify them
  if (canManageShoot && (b.shootDate || b.shootTime || b.location || b.shooterId)) {
    const targetShooter = b.shooterId || c.assignedShooter;
    if (targetShooter) {
      const shootDateStr = b.shootDate
        ? new Date(b.shootDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : s.shootDate
        ? new Date(s.shootDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Date TBD';
      const shootTimeStr = b.shootTime || s.shootTime || '';
      const locStr = b.location || s.location || 'Location TBD';

      const taskDesc = `📍 Location: ${locStr}\n📅 Date: ${shootDateStr} ${shootTimeStr}\n📝 Instructions: ${b.instructions || s.instructions || 'N/A'}`;
      const existingTask = await Task.findOne({ contentId: c._id, kind: 'SHOOT', status: { $ne: 'COMPLETED' } });
      if (existingTask) {
        existingTask.assignedTo = targetShooter as any;
        existingTask.description = taskDesc;
        if (b.shootDate) existingTask.dueAt = b.shootDate;
        await existingTask.save();
      } else {
        await createTask({
          title: `Shoot: ${c.title || c.contentId}`,
          description: taskDesc,
          contentId: c._id,
          clientId: c.clientId,
          assignedTo: targetShooter,
          dueAt: b.shootDate || new Date(Date.now() + 72 * 3600 * 1000),
          priority: 'HIGH',
          kind: 'SHOOT',
        }, { actorId: req.user!._id, source: 'AUTOMATIC' });
      }

      await notify([targetShooter], {
        type: 'shoot.scheduled',
        category: 'WORKFLOW',
        title: `🎬 Shoot Scheduled by ${req.user!.name}`,
        message: `${c.contentId} · ${c.title}\n📅 ${shootDateStr} ${shootTimeStr}\n📍 ${locStr}`,
        link: `/content/${c.contentId}?tab=shooting`,
        contentId: c._id,
      }, { excludeUserId: req.user!._id });

      const shooterUser = await User.findById(targetShooter).select('name').lean();
      await postSystemEvent(c._id, 'shoot.scheduled', 'SHOOT SCHEDULED BY ' + req.user!.role, [
        `Shooter: ${shooterUser?.name || 'Assigned'}`,
        `Date: ${shootDateStr} ${shootTimeStr}`,
        `Location: ${locStr}`,
        `Scheduled by: ${req.user!.name} (${req.user!.role})`,
      ]);
    }
  }

  await logActivity({
    actorId: req.user!._id,
    action: 'shoot.updated',
    message: `${req.user!.name} updated shoot for ${c.contentId}`,
    entityType: 'shoot',
    entityId: s._id,
    contentId: c._id,
    clientId: c.clientId,
  });
  await broadcastContent(c);
  res.json(s);
}));

/** Shooter adds a remark/complaint about this shoot (Before / After shoot) */
r.post('/:id/shoot/remark', ah(async (req, res) => {
  const c = await getVisibleContent(req.user!, req.params.id);
  const { text, stage } = z.object({ text: z.string().min(1).max(2000), stage: z.enum(['BEFORE', 'AFTER']).default('BEFORE').optional() }).parse(req.body);
  let s: any = await Shoot.findOne({ contentId: c._id });
  if (!s) s = new Shoot({ contentId: c._id, clientId: c.clientId, shooterId: c.assignedShooter });
  if (!s.remarks) s.remarks = [];
  const remarkStage = stage || 'BEFORE';
  s.remarks.push({ text, by: req.user!._id, byName: req.user!.name, stage: remarkStage, at: new Date() });
  await s.save();
  await logActivity({ actorId: req.user!._id, action: 'shoot.remark', message: `${req.user!.name} added ${remarkStage === 'BEFORE' ? 'pre-shoot' : 'post-shoot'} remark on ${c.contentId}: ${text.slice(0, 80)}`, entityType: 'shoot', entityId: s._id, contentId: c._id, clientId: c.clientId });
  res.json(s);
}));

/** Editor picks up raw footage */
r.post('/:id/start-editing', ah(async (req, res) => {
  const c = await getVisibleContent(req.user!, req.params.id);
  if (c.stage !== 'RAW_FOOTAGE') throw badRequest('Editing can start once raw footage is uploaded');
  await Shoot.updateOne({ contentId: c._id }, { status: 'COMPLETED' });
  await Task.updateMany({ contentId: c._id, kind: 'EDIT', status: 'TODO' }, { status: 'IN_PROGRESS' });
  await moveToStage(c, 'EDITING', req.user!._id, `${req.user!.name} started editing`);
  res.json(c);
}));

// ----- Schedule / publish -----
r.post('/:id/schedule', ah(async (req, res) => {
  const c: any = await getVisibleContent(req.user!, req.params.id);
  if (!can(req.user, 'content.write')) throw forbidden();
  const b = z.object({ scheduledAt: z.coerce.date(), caption: z.string().max(4000).optional(), hashtags: z.string().max(2000).optional(), platform: z.string().optional() }).parse(req.body);
  if (!['SCHEDULE', 'PUBLISHED'].includes(c.stage)) throw badRequest('Client final approval is required before scheduling');
  await ScheduledPost.updateMany({ contentId: c._id, status: 'SCHEDULED' }, { status: 'CANCELLED' });
  const post = await ScheduledPost.create({ contentId: c._id, clientId: c.clientId, platform: b.platform || c.platform, scheduledAt: b.scheduledAt, caption: b.caption ?? c.caption, hashtags: b.hashtags ?? c.hashtags, createdBy: req.user!._id });
  c.scheduledAt = b.scheduledAt; if (b.caption !== undefined) c.caption = b.caption; if (b.hashtags !== undefined) c.hashtags = b.hashtags;
  c.nextAction = 'Publish at scheduled time and confirm';
  await setLastAction(c, `${req.user!.name} scheduled the post`, req.user!._id); await c.save();
  await closeTasks(c._id, ['SCHEDULE']);
  await logActivity({ actorId: req.user!._id, action: 'content.scheduled', message: `${req.user!.name} scheduled ${c.contentId} for ${b.scheduledAt.toISOString()}`, entityType: 'content', entityId: c._id, contentId: c._id, clientId: c.clientId });
  await postSystemEvent(c._id, 'content.scheduled', 'POST SCHEDULED', [b.scheduledAt.toLocaleString('en-US', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }), `By ${req.user!.name}`]);
  emitDomain('content.scheduled', { contentId: String(c._id), actorId: req.user!._id });
  await broadcastContent(c); res.json(post);
}));
r.post('/:id/publish', ah(async (req, res) => {
  const c: any = await getVisibleContent(req.user!, req.params.id);
  if (!can(req.user, 'content.write')) throw forbidden();
  const b = z.object({ publishedUrl: z.string().url().max(500).optional().or(z.literal('')), failed: z.boolean().optional(), error: z.string().max(300).optional() }).parse(req.body);
  if (c.stage !== 'SCHEDULE') throw badRequest('Content must be in the Schedule stage');
  const post = await ScheduledPost.findOne({ contentId: c._id, status: 'SCHEDULED' }).sort({ createdAt: -1 });
  if (b.failed) {
    if (post) { post.status = 'FAILED'; post.error = b.error || 'Publishing failed'; await post.save(); }
    await logActivity({ actorId: req.user!._id, action: 'content.publish_failed', message: `Publishing failed for ${c.contentId}`, contentId: c._id, clientId: c.clientId });
    await broadcastContent(c); return res.json({ ok: true });
  }
  if (post) { post.status = 'PUBLISHED'; post.publishedUrl = b.publishedUrl || undefined; post.error = undefined; await post.save(); }
  else await ScheduledPost.create({ contentId: c._id, clientId: c.clientId, platform: c.platform, scheduledAt: new Date(), status: 'PUBLISHED', publishedUrl: b.publishedUrl || undefined, createdBy: req.user!._id });
  c.publishedAt = new Date(); c.publishedUrl = b.publishedUrl || undefined;
  await closeTasks(c._id, ['SCHEDULE']);
  await moveToStage(c, 'PUBLISHED', req.user!._id, `${req.user!.name} published the content`);
  await postSystemEvent(c._id, 'content.published', 'CONTENT PUBLISHED', [c.title, b.publishedUrl || ''], { link: b.publishedUrl || undefined });
  emitDomain('content.published', { contentId: String(c._id), actorId: req.user!._id });
  res.json(c);
}));

// Delete content permanently (Super Admin or content.delete)
r.delete('/:id', ah(async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && !can(req.user, 'content.delete' as any)) {
    throw forbidden('Only Super Admin can delete content');
  }
  const c = await Content.findById(req.params.id);
  if (!c) throw notFound('Content not found');

  await Promise.all([
    Content.deleteOne({ _id: c._id }),
    Script.deleteMany({ contentId: c._id }),
    ScriptVersion.deleteMany({ contentId: c._id }),
    Shoot.deleteMany({ contentId: c._id }),
    Task.deleteMany({ contentId: c._id }),
    Approval.deleteMany({ contentId: c._id }),
    Media.deleteMany({ contentId: c._id }),
    ScheduledPost.deleteMany({ contentId: c._id }),
    Feedback.deleteMany({ contentId: c._id }),
    Reminder.deleteMany({ contentId: c._id }),
    ChatRoom.deleteMany({ contentId: c._id }),
    Message.deleteMany({ contentId: c._id }),
    ChatActionMessage.deleteMany({ contentId: c._id }),
    ActivityLog.deleteMany({ contentId: c._id }),
  ]);

  await logActivity({
    actorId: req.user!._id,
    action: 'content.deleted',
    message: `${req.user!.name} permanently deleted ${c.contentId} (${c.title})`,
    entityType: 'content',
    entityId: c._id,
    clientId: c.clientId,
  });

  emitDomain('content.deleted', { contentId: String(c._id), actorId: req.user!._id });
  res.json({ ok: true, message: `Content ${c.contentId} deleted successfully.` });
}));

// Delete / reset shoot record (Super Admin or shoot management)
r.delete('/:id/shoot', ah(async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && !['ADMIN', 'MANAGER'].includes(req.user!.role)) {
    throw forbidden('Only Super Admin or Manager can delete shoot details');
  }
  await Shoot.deleteMany({ contentId: req.params.id });
  res.json({ ok: true, message: 'Shoot details removed.' });
}));

export default r;
