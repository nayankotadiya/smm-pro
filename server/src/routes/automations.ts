import { Router } from 'express';
import { z } from 'zod';
import { Automation, AutomationRun } from '../models';
import { ah } from '../utils/async';
import { notFound } from '../utils/errors';
import { requirePerm, can } from '../middleware/auth';
import { logActivity } from '../services/activity';

const r = Router();
export const TRIGGERS = ['content.created', 'script.submitted', 'script.approved', 'script.changes_requested', 'client_script.approved', 'client_script.changes_requested', 'raw.uploaded', 'edit.uploaded', 'smm.approved', 'smm.changes_requested', 'final.uploaded', 'final.approved', 'final.changes_requested', 'client_review.sent', 'client.approved', 'client.changes_requested', 'task.overdue', 'approval.pending_24h', 'content.scheduled', 'content.published', 'content.blocked'];
const action = z.object({ type: z.enum(['create_task', 'notify', 'create_reminder']), params: z.record(z.any()) });
const body = z.object({ name: z.string().min(1).max(120), trigger: z.enum(TRIGGERS as [string, ...string[]]), actions: z.array(action).min(1).max(6), active: z.boolean().optional(), conditions: z.record(z.any()).optional() });

r.get('/', requirePerm('automations.manage', 'dashboard.org'), ah(async (req, res) => {
  const list = await Automation.find({}).sort({ system: -1, name: 1 }).lean();
  const showErrors = can(req.user, 'automations.manage');
  res.json({ automations: list.map((a) => ({ ...a, lastError: showErrors ? a.lastError : a.lastError ? 'Failed. Ask an admin for details.' : undefined })), triggers: TRIGGERS });
}));
r.get('/runs', requirePerm('automations.manage', 'dashboard.org'), ah(async (req, res) => {
  const q: any = {}; if (req.query.automationId) q.automationId = req.query.automationId; if (req.query.result) q.result = req.query.result;
  const runs = await AutomationRun.find(q).sort({ createdAt: -1 }).limit(100).populate('contentId', 'contentId title').lean();
  const showErrors = can(req.user, 'automations.manage');
  res.json(runs.map((x) => ({ ...x, error: showErrors ? x.error : x.error ? 'Failed' : undefined })));
}));
r.post('/', requirePerm('automations.manage'), ah(async (req, res) => {
  const a = await Automation.create(body.parse(req.body));
  await logActivity({ actorId: req.user!._id, action: 'automation.created', message: `${req.user!.name} created automation "${a.name}"` });
  res.status(201).json(a);
}));
r.patch('/:id', requirePerm('automations.manage'), ah(async (req, res) => {
  const a = await Automation.findByIdAndUpdate(req.params.id, body.partial().parse(req.body), { new: true });
  if (!a) throw notFound('Automation');
  await logActivity({ actorId: req.user!._id, action: 'automation.updated', message: `${req.user!.name} updated automation "${a.name}"${req.body.active !== undefined ? ` (${a.active ? 'enabled' : 'disabled'})` : ''}` });
  res.json(a);
}));
r.delete('/:id', requirePerm('automations.manage'), ah(async (req, res) => {
  const a = await Automation.findById(req.params.id);
  if (!a) throw notFound('Automation');
  if (a.system) { a.active = false; await a.save(); return res.json({ disabled: true }); }
  await a.deleteOne(); res.json({ ok: true });
}));
export default r;
