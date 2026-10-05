import { Router } from 'express';
import { z } from 'zod';
import { Client, Campaign, CommunicationLog, Content, Approval, Media, ActivityLog, Script, Reminder } from '../models';
import { ah } from '../utils/async';
import { notFound } from '../utils/errors';
import { requirePerm } from '../middleware/auth';
import { logActivity } from '../services/activity';
import { ensureClientRoom } from '../services/chat';
import { ensureClientFolders } from '../services/storage';
import { resolveFromCommunication } from '../services/approvals';
import { visibilityFilter } from '../services/content';
import { emitOrg } from '../services/realtime';

const r = Router();
const str = z.string().max(4000).optional().nullable();
const clientBody = z.object({
  name: z.string().min(1).max(120), businessName: str, contactPerson: str, phone: str, email: str, website: str, instagram: str, facebook: str, youtube: str,
  location: str, category: str, description: str, products: str, services: str, usp: str, targetAudience: str, goals: str, expectations: str, marketTrend: str,
  sellingPurpose: str, brandTone: str, brandColors: z.array(z.string().max(30)).max(12).optional(), fonts: z.array(z.string().max(60)).max(8).optional(), brandGuidelines: str,
  assignedTeam: z.array(z.string()).optional(), status: z.enum(['ACTIVE', 'PAUSED', 'ONBOARDING', 'ARCHIVED']).optional(),
  defaultTeam: z.object({ writer: z.string().nullable().optional(), shooter: z.string().nullable().optional(), editor: z.string().nullable().optional(), smm: z.string().nullable().optional(), reviewer: z.string().nullable().optional() }).optional(),
});

r.get('/', requirePerm('clients.read'), ah(async (req, res) => {
  const q: any = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.q) q.$or = [{ name: new RegExp(escapeRx(String(req.query.q)), 'i') }, { businessName: new RegExp(escapeRx(String(req.query.q)), 'i') }];
  const clients = await Client.find(q).sort({ name: 1 }).populate('assignedTeam', 'name role').lean();
  const grp = (match: any) => Content.aggregate([{ $match: { deletedAt: null, ...match } }, { $group: { _id: '$clientId', n: { $sum: 1 } } }]);
  const [total, active] = await Promise.all([grp({}), grp({ status: { $in: ['ACTIVE', 'CHANGES_REQUESTED', 'BLOCKED'] } })]);
  const n = (rows: any[], id: any) => rows.find((x) => String(x._id) === String(id))?.n || 0;
  res.json(clients.map((c) => ({ ...c, contentCount: { total: n(total, c._id), active: n(active, c._id) } })));
}));
export const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

r.post('/', requirePerm('clients.write'), ah(async (req, res) => {
  const c = await Client.create({ ...clientBody.parse(req.body), createdBy: req.user!._id });
  await ensureClientRoom(c);
  ensureClientFolders(c).catch((e) => console.warn('[drive] client folders', e.message));
  await logActivity({ actorId: req.user!._id, action: 'client.created', message: `${req.user!.name} added client ${c.name}`, entityType: 'client', entityId: c._id, clientId: c._id, ip: req.ip });
  emitOrg('client:updated', { _id: String(c._id) });
  res.status(201).json(c);
}));

r.get('/:id', requirePerm('clients.read'), ah(async (req, res) => {
  const c = await Client.findById(req.params.id).populate('assignedTeam', 'name role').populate('defaultTeam.writer defaultTeam.shooter defaultTeam.editor defaultTeam.smm defaultTeam.reviewer', 'name role').lean();
  if (!c) throw notFound('Client');
  res.json(c);
}));

r.patch('/:id', requirePerm('clients.write'), ah(async (req, res) => {
  const c = await Client.findByIdAndUpdate(req.params.id, clientBody.partial().parse(req.body), { new: true });
  if (!c) throw notFound('Client');
  await logActivity({ actorId: req.user!._id, action: 'client.updated', message: `${req.user!.name} updated client ${c.name}`, entityType: 'client', entityId: c._id, clientId: c._id, ip: req.ip });
  emitOrg('client:updated', { _id: String(c._id) });
  res.json(c);
}));

r.delete('/:id', requirePerm('clients.delete'), ah(async (req, res) => {
  const c = await Client.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), status: 'ARCHIVED' });
  if (!c) throw notFound('Client');
  await logActivity({ actorId: req.user!._id, action: 'client.deleted', message: `${req.user!.name} archived client ${c.name}`, entityType: 'client', entityId: c._id, clientId: c._id, ip: req.ip });
  res.json({ ok: true });
}));

// ----- Client workspace tabs -----
r.get('/:id/overview', requirePerm('clients.read'), ah(async (req, res) => {
  const id = req.params.id; const vis = visibilityFilter(req.user!);
  const [content, scripts, reviews, files, room, followUps] = await Promise.all([
    Content.find({ $and: [{ clientId: id }, vis] }).sort({ updatedAt: -1 }).populate('currentOwner', 'name').lean(),
    Script.find({ clientId: id }).populate('contentId', 'contentId title stage').populate('writerId', 'name').lean(),
    Approval.find({ clientId: id, type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] } }).sort({ createdAt: -1 }).populate('contentId', 'contentId title').lean(),
    Media.find({ clientId: id, status: { $nin: ['UPLOADING', 'FAILED'] } }).sort({ createdAt: -1 }).limit(100).populate('uploadedBy', 'name').populate('contentId', 'contentId title').lean(),
    ensureClientRoom(await Client.findById(id)),
    Reminder.find({ clientId: id, completed: false }).sort({ remindAt: 1 }).limit(20).lean(),
  ]);
  const stats = { total: content.length, published: content.filter((c) => c.stage === 'PUBLISHED').length, active: content.filter((c) => !['COMPLETED', 'CANCELLED'].includes(c.status)).length, blocked: content.filter((c) => c.status === 'BLOCKED').length, overdue: content.filter((c) => c.deadline && c.deadline < new Date() && c.status !== 'COMPLETED').length, approvalsOpen: reviews.filter((a) => ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'].includes(a.status)).length };
  res.json({ content, scripts, reviews, files, roomId: room._id, followUps, stats });
}));
r.get('/:id/activity', requirePerm('clients.read'), ah(async (req, res) => { res.json(await ActivityLog.find({ clientId: req.params.id }).sort({ createdAt: -1 }).limit(100).lean()); }));

// ----- Campaigns -----
r.get('/:id/campaigns', requirePerm('clients.read'), ah(async (req, res) => { res.json(await Campaign.find({ clientId: req.params.id }).sort({ createdAt: -1 }).lean()); }));
r.post('/:id/campaigns', requirePerm('clients.write', 'content.write'), ah(async (req, res) => {
  const b = z.object({ name: z.string().min(1).max(120), description: str, startDate: z.coerce.date().optional().nullable(), endDate: z.coerce.date().optional().nullable() }).parse(req.body);
  const c = await Campaign.create({ ...b, clientId: req.params.id, createdBy: req.user!._id });
  await logActivity({ actorId: req.user!._id, action: 'campaign.created', message: `${req.user!.name} created campaign ${c.name}`, entityType: 'campaign', entityId: c._id, clientId: c.clientId });
  res.status(201).json(c);
}));

// ----- Communication log -----
r.get('/:id/communication', requirePerm('clients.read'), ah(async (req, res) => {
  res.json(await CommunicationLog.find({ clientId: req.params.id }).sort({ occurredAt: -1 }).limit(200).populate('employeeId', 'name').populate('contentId', 'contentId title').populate('attachmentMediaId', 'fileName mimeType size').lean());
}));
r.post('/:id/communication', requirePerm('communication.write'), ah(async (req, res) => {
  const b = z.object({ type: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'MEETING', 'INSTAGRAM_DM', 'OTHER']), direction: z.enum(['INBOUND', 'OUTBOUND']).optional(), occurredAt: z.coerce.date().optional(), summary: z.string().min(1).max(4000), actionRequired: str, nextFollowUp: z.coerce.date().optional().nullable(), contentId: z.string().optional().nullable(), attachmentMediaId: z.string().optional().nullable() }).parse(req.body);
  const log = await CommunicationLog.create({ ...b, clientId: req.params.id, employeeId: req.user!._id });
  if (b.nextFollowUp) await Reminder.create({ title: `Follow up: ${b.summary.slice(0, 80)}`, type: 'CLIENT_FOLLOWUP', userId: req.user!._id, createdBy: req.user!._id, clientId: req.params.id, contentId: b.contentId || undefined, remindAt: b.nextFollowUp, source: 'AUTOMATIC' });
  await logActivity({ actorId: req.user!._id, action: 'communication.logged', message: `${req.user!.name} logged ${b.type.toLowerCase().replace('_', ' ')} communication`, entityType: 'communication', entityId: log._id, clientId: req.params.id, contentId: b.contentId || undefined });
  res.status(201).json(log);
}));
/** Explicit employee action converting a client's message into a decision (never automatic) */
r.post('/communication/:commId/resolve', requirePerm('approvals.send', 'approvals.review'), ah(async (req, res) => {
  const b = z.object({ action: z.enum(['MARK_APPROVED', 'CREATE_CHANGE_REQUEST']), approvalId: z.string(), comment: z.string().max(2000).optional() }).parse(req.body);
  res.json(await resolveFromCommunication(req.user!, req.params.commId, b.action, b.approvalId, b.comment));
}));
export default r;
