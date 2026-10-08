import { Router } from 'express';
import { z } from 'zod';
import { Task, Content } from '../models';
import { ah } from '../utils/async';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { can } from '../middleware/auth';
import { createTask } from '../services/tasks';
import { logActivity } from '../services/activity';
import { notify } from '../services/notify';
import { emitOrg, emitToUser } from '../services/realtime';
import { moveToStage, sanitizeSuperAdminUsers } from '../services/content';

const r = Router();
const body = z.object({ title: z.string().min(1).max(200), description: z.string().max(4000).optional().nullable(), clientId: z.string().optional().nullable(), contentId: z.string().optional().nullable(), assignedTo: z.string().optional().nullable(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), dueAt: z.coerce.date().optional().nullable() });

r.get('/', ah(async (req, res) => {
  const q: any = {}; const p = req.query as Record<string, string>;
  const all = can(req.user, 'tasks.read.all');
  if (!all || p.mine === '1') q.$or = [{ assignedTo: req.user!._id }, { createdBy: req.user!._id }];
  if (p.assignedTo && all) q.assignedTo = p.assignedTo === 'none' ? null : p.assignedTo;
  if (p.status) q.status = { $in: p.status.split(',') };
  if (p.open === '1') q.status = { $ne: 'COMPLETED' };
  if (p.clientId) q.clientId = p.clientId;
  if (p.contentId) q.contentId = p.contentId;
  if (p.priority) q.priority = p.priority;
  if (p.overdue === '1') { q.dueAt = { $lt: new Date() }; q.status = { $ne: 'COMPLETED' }; }
  if (p.source) q.source = p.source;
  const isSuper = req.user?.role === 'SUPER_ADMIN';
  const tasks = await Task.find(q).sort({ status: 1, dueAt: 1, createdAt: -1 }).limit(300).populate('clientId', 'name').populate('contentId', 'contentId title progress stage').populate('assignedTo createdBy', 'name role').lean();
  res.json(isSuper ? tasks : tasks.map((t) => sanitizeSuperAdminUsers(t, false)));
}));
r.post('/', ah(async (req, res) => {
  const b = body.parse(req.body);
  if (b.assignedTo && b.assignedTo !== req.user!._id && !can(req.user, 'tasks.manage')) throw forbidden('You can only create tasks for yourself');
  res.status(201).json(await createTask(b, { actorId: req.user!._id, source: 'MANUAL' }));
}));
r.get('/:id', ah(async (req, res) => {
  const t = await Task.findById(req.params.id).populate('clientId', 'name').populate('contentId', 'contentId title progress stage').populate('assignedTo createdBy', 'name role').populate({ path: 'sourceMessageId', select: 'message roomId senderId', populate: { path: 'senderId', select: 'name' } }).lean();
  if (!t) throw notFound('Task');
  if (!can(req.user, 'tasks.read.all') && String((t.assignedTo as any)?._id) !== req.user!._id && String((t.createdBy as any)?._id) !== req.user!._id) throw forbidden();
  const isSuper = req.user?.role === 'SUPER_ADMIN';
  res.json(isSuper ? t : sanitizeSuperAdminUsers(t, false));
}));
r.patch('/:id', ah(async (req, res) => {
  const b = body.partial().extend({ status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'BLOCKED']).optional(), blockedReason: z.string().max(500).optional() }).parse(req.body);
  const t: any = await Task.findById(req.params.id);
  if (!t) throw notFound('Task');
  const mine = String(t.assignedTo) === req.user!._id || String(t.createdBy) === req.user!._id;
  if (!mine && !can(req.user, 'tasks.manage')) throw forbidden();
  const prevAssignee = String(t.assignedTo || ''); const prevStatus = t.status;
  if ((b.assignedTo !== undefined && String(b.assignedTo || '') !== prevAssignee) && !can(req.user, 'tasks.manage')) throw forbidden('Only managers can reassign tasks');
  if (b.status === 'BLOCKED' && !b.blockedReason && !t.blockedReason) throw badRequest('A reason is required to block a task');
  Object.assign(t, b);
  if (b.status === 'BLOCKED' && prevStatus !== 'BLOCKED') t.blockedSince = new Date();
  if (b.status && b.status !== 'BLOCKED') { t.blockedReason = undefined; t.blockedSince = undefined; }
  if (b.status === 'COMPLETED' && prevStatus !== 'COMPLETED') t.completedAt = new Date();
  if (b.status && b.status !== 'COMPLETED') t.completedAt = undefined;
  if (b.dueAt !== undefined) t.overdueNotifiedAt = undefined;
  await t.save();
  if (b.status && b.status !== prevStatus) {
    await logActivity({ actorId: req.user!._id, action: `task.${b.status.toLowerCase()}`, message: `${req.user!.name} marked "${t.title}" ${b.status.replace('_', ' ').toLowerCase()}`, entityType: 'task', entityId: t._id, contentId: t.contentId, clientId: t.clientId });
    if (b.status === 'COMPLETED') { emitOrg('task:completed', t.toJSON()); if (t.createdBy && String(t.createdBy) !== req.user!._id) await notify([t.createdBy], { type: 'task.completed', category: 'TASK', title: 'Task completed', message: t.title, link: `/tasks/${t._id}`, entityType: 'task', entityId: t._id, contentId: t.contentId }); }
    // Editor starting the edit task moves content into Editing
    if (b.status === 'IN_PROGRESS' && t.kind === 'EDIT' && t.contentId) { const c = await Content.findById(t.contentId); if (c && c.stage === 'RAW_FOOTAGE') await moveToStage(c, 'EDITING', req.user!._id, `${req.user!.name} started editing`); }
  }
  if (b.assignedTo && String(b.assignedTo) !== prevAssignee) {
    await notify([b.assignedTo], { type: 'task.assigned', category: 'TASK', title: 'Task assigned', message: t.title, link: `/tasks/${t._id}`, entityType: 'task', entityId: t._id, contentId: t.contentId }, { excludeUserId: req.user!._id });
    emitToUser(b.assignedTo, 'task:assigned', t.toJSON());
    await logActivity({ actorId: req.user!._id, action: 'task.reassigned', message: `${req.user!.name} reassigned "${t.title}"`, entityType: 'task', entityId: t._id, contentId: t.contentId, clientId: t.clientId });
  }
  emitOrg('task:updated', t.toJSON());
  res.json(t);
}));
r.delete('/:id', ah(async (req, res) => {
  const t = await Task.findById(req.params.id);
  if (!t) throw notFound('Task');
  if (String(t.createdBy) !== req.user!._id && !can(req.user, 'tasks.manage') && req.user!.role !== 'SUPER_ADMIN') throw forbidden();
  if (req.user!.role === 'SUPER_ADMIN' || req.query.permanent === 'true') {
    await Task.deleteOne({ _id: t._id });
  } else {
    await Task.updateOne({ _id: t._id }, { deletedAt: new Date() });
  }
  emitOrg('task:updated', { _id: String(t._id), deleted: true });
  res.json({ ok: true });
}));
export default r;
