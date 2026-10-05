import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ah } from '../utils/async';
import { notFound } from '../utils/errors';
import { publicView, publicOpened, clientDecision, publicStreamTarget } from '../services/approvals';
import { pipeMedia } from '../services/media';

/** The ONLY surface a client can reach. Every route is scoped to a single approval token. */
const r = Router();
r.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
const decide = rateLimit({ windowMs: 10 * 60_000, max: 15 });
const comments = z.array(z.object({ timestampSec: z.number().min(0).max(86400).optional(), comment: z.string().min(1).max(2000) })).max(30);

r.get('/approval/:token', ah(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await publicView(req.params.token)); }));
/** POST (not GET) so link previewers / WhatsApp crawlers never mark the link as opened */
r.post('/approval/:token/open', ah(async (req, res) => { res.json(await publicOpened(req.params.token)); }));
r.post('/approval/:token/approve', decide, ah(async (req, res) => {
  const b = z.object({ name: z.string().max(80).optional(), comments: comments.optional() }).parse(req.body || {});
  res.json(await clientDecision(req.params.token, 'APPROVE', b, { ip: req.ip }));
}));
r.post('/approval/:token/request-changes', decide, ah(async (req, res) => {
  const b = z.object({ name: z.string().max(80).optional(), comments: comments.min(1) }).parse(req.body);
  res.json(await clientDecision(req.params.token, 'CHANGES', b, { ip: req.ip }));
}));
for (const which of ['video', 'thumbnail'] as const) {
  r.get(`/approval/:token/${which}`, ah(async (req, res) => {
    const m = await publicStreamTarget(req.params.token, which);
    if (!m) throw notFound('File');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    await pipeMedia(m, res, req.headers.range);
  }));
}
export default r;
