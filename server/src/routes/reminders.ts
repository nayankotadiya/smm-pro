import { Router } from 'express';
import { z } from 'zod';
import { Reminder } from '../models';
import { ah } from '../utils/async';
import { forbidden, notFound } from '../utils/errors';
import { can } from '../middleware/auth';
import { emitToUser } from '../services/realtime';
import { notify } from '../services/notify';

const r = Router();
const body = z.object({
  title: z.string().min(1).max(200), description: z.string().max(2000).optional().nullable(),
  type: z.enum(['TASK', 'CONTENT', 'CLIENT_FOLLOWUP', 'MEETING', 'APPROVAL', 'PERSONAL']).optional(),
  userId: z.string().optional(), participants: z.array(z.string()).max(50).optional(),
  clientId: z.string().optional().nullable(), contentId: z.string().optional().nullable(), taskId: z.string().optional().nullable(),
  remindAt: z.coerce.date(), repeat: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  channels: z.object({ inApp: z.boolean().optional(), push: z.boolean().optional(), email: z.boolean().optional() }).optional(),
});
r.get('/', ah(async (req, res) => {
  const p = req.query as Record<string, string>;
  const q: any = { $or: [{ userId: req.user!._id }, { participants: req.user!._id }] };
  if (p.completed !== undefined) q.completed = p.completed === '1';
  if (p.type) q.type = p.type;
  res.json(await Reminder.find(q).sort({ completed: 1, remindAt: 1 }).limit(300).populate('clientId', 'name').populate('contentId', 'contentId title').populate('userId createdBy', 'name').lean());
}));
r.post('/', ah(async (req, res) => {
  const b = body.parse(req.body);
  const target = b.userId || req.user!._id;
  if (target !== req.user!._id && !can(req.user, 'tasks.manage')) throw forbidden('You can only set reminders for yourself');
  const rem = await Reminder.create({ ...b, userId: target, createdBy: req.user!._id });
  emitToUser(target, 'reminder:new', rem.toJSON());
  if (target !== req.user!._id) await notify([target], { type: 'reminder.assigned', category: 'REMINDER', title: 'Reminder set for you', message: rem.title, link: `/reminders?id=${rem._id}`, entityType: 'reminder', entityId: rem._id });
  res.status(201).json(rem);
}));
r.patch('/:id', ah(async (req, res) => {
  const b = body.partial().extend({ completed: z.boolean().optional(), snoozeMinutes: z.number().int().min(5).max(10080).optional() }).parse(req.body);
  const rem: any = await Reminder.findById(req.params.id);
  if (!rem) throw notFound('Reminder');
  if (String(rem.userId) !== req.user!._id && String(rem.createdBy) !== req.user!._id && !can(req.user, 'tasks.manage')) throw forbidden();
  const { snoozeMinutes, ...rest } = b;
  Object.assign(rem, rest);
  if (snoozeMinutes) { rem.remindAt = new Date(Date.now() + snoozeMinutes * 60_000); rem.completed = false; }
  await rem.save();
  emitToUser(rem.userId, 'reminder:new', rem.toJSON());
  res.json(rem);
}));
r.delete('/:id', ah(async (req, res) => {
  const rem = await Reminder.findById(req.params.id);
  if (!rem) throw notFound('Reminder');
  if (String(rem.userId) !== req.user!._id && String(rem.createdBy) !== req.user!._id) throw forbidden();
  await rem.deleteOne(); res.json({ ok: true });
}));
export default r;
