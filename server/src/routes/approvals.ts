import { Router } from 'express';
import { z } from 'zod';
import { Approval, Content } from '../models';
import { ah } from '../utils/async';
import { notFound } from '../utils/errors';
import { requirePerm, can } from '../middleware/auth';
import { reviewInternal, sendClientReview, resend, cancel, activeLink, getDailyReviewGate, signOffDailyReviewGate, getWhatsAppNotificationLogs } from '../services/approvals';
import { visibilityFilter } from '../services/content';

const r = Router();
const OPEN_CLIENT = ['DRAFT', 'SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'];
const comment = z.object({ timestampSec: z.number().min(0).max(86400).optional(), comment: z.string().min(1).max(2000) });

r.get('/', ah(async (req, res) => {
  const p = req.query as Record<string, string>; const q: any = {};
  const tab = p.tab || 'all';
  if (tab === 'internal') Object.assign(q, { type: { $in: ['INTERNAL_SCRIPT', 'SMM'] }, status: 'PENDING' });
  else if (tab === 'client') Object.assign(q, { type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } });
  else if (tab === 'final') Object.assign(q, { type: 'FINAL', status: 'PENDING' });
  else if (tab === 'changes') Object.assign(q, { status: 'CHANGES_REQUESTED' });
  else if (tab === 'history') Object.assign(q, { status: { $in: ['APPROVED', 'CHANGES_REQUESTED', 'EXPIRED', 'CANCELLED'] } });
  if (p.contentId) q.contentId = p.contentId;
  if (p.clientId) q.clientId = p.clientId;
  if (p.from || p.to) {
    const d: any = {};
    if (p.from) d.$gte = new Date(p.from);
    if (p.to) { const t = new Date(p.to); t.setHours(23, 59, 59, 999); d.$lte = t; }
    q.createdAt = d;
  }
  const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean();
  q.contentId = q.contentId ? q.contentId : { $in: vis.map((v) => v._id) };
  if (!can(req.user, 'content.read.all') && !can(req.user, 'approvals.review')) q.$or = [{ reviewerId: req.user!._id }, { createdBy: req.user!._id }];
  const items = await Approval.find(q).sort({ createdAt: -1 }).limit(200)
    .populate({ path: 'contentId', select: 'contentId title stage progress clientId', populate: { path: 'clientId', select: 'name' } })
    .populate('reviewerId createdBy history.by', 'name').populate('mediaId', 'fileName mimeType size version').lean();
  const counts = {
    internal: await Approval.countDocuments({ type: { $in: ['INTERNAL_SCRIPT', 'SMM'] }, status: 'PENDING' }),
    client: await Approval.countDocuments({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } }),
    final: await Approval.countDocuments({ type: 'FINAL', status: 'PENDING' }),
    changes: await Approval.countDocuments({ status: 'CHANGES_REQUESTED', updatedAt: { $gt: new Date(Date.now() - 30 * 864e5) } }),
  };
  res.json({ items, counts });
}));

r.get('/counts', ah(async (_req, res) => {
  res.json({
    internal: await Approval.countDocuments({ type: { $in: ['INTERNAL_SCRIPT', 'SMM'] }, status: 'PENDING' }),
    client: await Approval.countDocuments({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: OPEN_CLIENT } }),
    final: await Approval.countDocuments({ type: 'FINAL', status: 'PENDING' }),
    mine: await Approval.countDocuments({ reviewerId: _req.user!._id, status: 'PENDING' }),
  });
}));

function approvalBaseUrl(req: any): string | undefined {
  const origin = req.get('origin') || req.get('referer');
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.host && !u.host.includes('onrender.com') && !u.host.includes(':4000')) {
        return `${u.protocol}//${u.host}/approval`;
      }
    } catch {}
  }
  return undefined;
}

r.post('/send', requirePerm('approvals.send'), ah(async (req, res) => {
  const b = z.object({ contentId: z.string(), kind: z.enum(['SCRIPT', 'FINAL']), phone: z.string().max(20).optional(), recipientName: z.string().max(80).optional(), sendWhatsApp: z.boolean().optional() }).parse(req.body);
  const { approval, url } = await sendClientReview(req.user!, b, approvalBaseUrl(req));
  res.status(201).json({ approval, url });
}));
r.post('/:id/review', ah(async (req, res) => {
  const b = z.object({ decision: z.enum(['APPROVE', 'CHANGES']), note: z.string().max(2000).optional(), comments: z.array(comment).max(50).optional() }).parse(req.body);
  res.json(await reviewInternal(req.params.id, b.decision, b.note, req.user!, b.comments));
}));
r.post('/:id/resend', requirePerm('approvals.send'), ah(async (req, res) => { const { approval, url } = await resend(req.user!, req.params.id, approvalBaseUrl(req)); res.json({ approval, url }); }));
r.get('/:id/link', requirePerm('approvals.send'), ah(async (req, res) => { res.json(await activeLink(req.params.id, approvalBaseUrl(req))); }));
r.post('/:id/cancel', requirePerm('approvals.send'), ah(async (req, res) => { res.json(await cancel(req.user!, req.params.id)); }));
r.get('/daily-gate', ah(async (req, res) => {
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  res.json(await getDailyReviewGate(req.user!, date));
}));

r.post('/daily-gate/signoff', ah(async (req, res) => {
  const b = z.object({
    date: z.string().optional(),
    notes: z.string().max(2000).optional(),
    contentsReviewed: z.array(z.object({
      contentId: z.string(),
      stage: z.string().optional(),
      decision: z.string().optional(),
      reviewedAt: z.coerce.date().optional(),
      notes: z.string().optional(),
    })).optional(),
  }).parse(req.body || {});
  res.json(await signOffDailyReviewGate(req.user!, b));
}));

r.get('/whatsapp-logs', ah(async (req, res) => {
  const p = req.query as Record<string, string>;
  res.json(await getWhatsAppNotificationLogs({
    clientId: p.clientId,
    status: p.status,
    limit: p.limit ? Number(p.limit) : 100,
  }));
}));

r.get('/:id', ah(async (req, res) => {
  const a = await Approval.findById(req.params.id).populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } }).populate('reviewerId createdBy history.by', 'name').lean();
  if (!a) throw notFound('Approval');
  if (!(await Content.exists({ $and: [{ _id: (a.contentId as any)?._id }, visibilityFilter(req.user!)] }))) throw notFound('Approval');
  res.json(a);
}));
export default r;
