import { Router } from 'express';
import { z } from 'zod';
import { Script, ScriptVersion, Content } from '../models';
import { ah } from '../utils/async';
import { forbidden, notFound } from '../utils/errors';
import { can } from '../middleware/auth';
import { visibilityFilter, getVisibleContent } from '../services/content';
import { saveVersion, submitScript } from '../services/scripts';

const r = Router();
const scene = z.object({ title: z.string().max(120).optional(), dialogue: z.string().max(5000).optional(), visual: z.string().max(5000).optional(), broll: z.string().max(2000).optional() });
const vBody = z.object({
  hook: z.string().max(2000).optional(),
  scenes: z.array(scene).max(30).optional(),
  dialogue: z.string().max(50000).optional(),
  body: z.string().max(50000).optional(),
  script: z.string().max(50000).optional(),
  visualDirection: z.string().max(5000).optional(),
  broll: z.string().max(5000).optional(),
  cta: z.string().max(1000).optional(),
  captionNotes: z.string().max(3000).optional(),
  music: z.string().max(500).optional(),
  duration: z.string().max(50).optional(),
  changes: z.string().max(2000).optional(),
  forceNew: z.boolean().optional(),
});

async function guard(req: any, scriptId: string) {
  const s = await Script.findById(scriptId);
  if (!s) throw notFound('Script');
  await getVisibleContent(req.user, String(s.contentId));
  if (!can(req.user, 'scripts.write')) throw forbidden('You cannot edit scripts');
  return s;
}

r.get('/', ah(async (req, res) => {
  const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean();
  const q: any = { contentId: { $in: vis.map((v) => v._id) } };
  if (req.query.status) q.status = { $in: String(req.query.status).split(',') };
  if (req.query.clientId) q.clientId = req.query.clientId;
  if (req.query.from || req.query.to) {
    const d: any = {};
    if (req.query.from) d.$gte = new Date(String(req.query.from));
    if (req.query.to) { const t = new Date(String(req.query.to)); t.setHours(23, 59, 59, 999); d.$lte = t; }
    q.updatedAt = d;
  }
  res.json(await Script.find(q).sort({ updatedAt: -1 }).populate({ path: 'contentId', select: 'contentId title stage deadline clientId', populate: { path: 'clientId', select: 'name' } }).populate('writerId', 'name').lean());
}));
r.post('/', ah(async (req, res) => {
  const b = z.object({ contentId: z.string() }).merge(vBody).parse(req.body);
  const c = await getVisibleContent(req.user!, b.contentId);
  if (!can(req.user, 'scripts.write')) throw forbidden('You cannot edit scripts');
  const s = (await Script.findOne({ contentId: c._id })) || (await Script.create({ contentId: c._id, clientId: c.clientId, writerId: c.assignedWriter }));
  res.status(201).json({ script: s, version: await saveVersion(String(s._id), b, req.user!) });
}));
r.get('/:id', ah(async (req, res) => {
  const s = await Script.findById(req.params.id).populate({ path: 'contentId', select: 'contentId title stage clientId', populate: { path: 'clientId', select: 'name' } }).lean();
  if (!s) throw notFound('Script');
  await getVisibleContent(req.user!, String((s.contentId as any)._id));
  res.json({ script: s, versions: await ScriptVersion.find({ scriptId: s._id }).sort({ version: -1 }).populate('createdBy reviewedBy', 'name').lean() });
}));
r.post('/:id/version', ah(async (req, res) => { await guard(req, req.params.id); const b = vBody.parse(req.body); res.status(201).json(await saveVersion(req.params.id, b, req.user!, b.forceNew)); }));
r.post('/:id/submit', ah(async (req, res) => { await guard(req, req.params.id); res.json(await submitScript(req.params.id, req.user!)); }));
export default r;
