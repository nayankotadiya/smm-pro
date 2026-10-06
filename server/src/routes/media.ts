import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Media, Content, Feedback } from '../models';
import { ah } from '../utils/async';
import { AppError, notFound, forbidden } from '../utils/errors';
import { can, requireAuth, userFromToken } from '../middleware/auth';
import { env } from '../config/env';
import { MEDIA_CATEGORIES } from '../config/constants';
import { initUpload, completeUpload, failUpload, streamMedia, saveLocalUpload, canAccessMedia } from '../services/media';
import { visibilityFilter } from '../services/content';
import { storageMode, LOCAL_DIR } from '../services/storage';
import { escapeRx } from './clients';

const r = Router();
/** Drive only allows the resumable upload from the origin the session was created for */
const originOf = (req: any) => { const o = String(req.get('origin') || '').replace(/\/$/, ''); return env.appOrigins.includes(o) ? o : env.appOrigins[0]; };

const UPLOAD_TMP = path.join(LOCAL_DIR, 'tmp');
try { fs.mkdirSync(UPLOAD_TMP, { recursive: true }); } catch {}
const upload = multer({ dest: UPLOAD_TMP, limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 } });

/** <video>/<img>/<a download> cannot send Authorization headers, so we issue a 5-minute, single-file URL token. */
const streamAuth = ah(async (req, _res, next) => {
  const t = String(req.query.t || '');
  if (t) {
    try { const p = jwt.verify(t, env.jwtSecret) as any; if (p.typ !== 'media' || p.mid !== req.params.id) throw new Error(); req.user = await userFromToken(jwt.sign({ sub: p.sub }, env.jwtSecret, { expiresIn: '1m' })); return next(); }
    catch { throw new AppError(401, 'Link expired', 'UNAUTHORIZED'); }
  }
  return requireAuth(req, _res, next);
});
r.get('/:id/stream', streamAuth, ah(async (req, res) => { await streamMedia(req.user!, req.params.id, res, req.headers.range, false, req.ip); }));
r.get('/:id/download', streamAuth, ah(async (req, res) => { await streamMedia(req.user!, req.params.id, res, req.headers.range, true, req.ip); }));

r.use(requireAuth);

r.get('/', ah(async (req, res) => {
  const p = req.query as Record<string, string>; const f: any[] = [{ status: { $nin: ['UPLOADING', 'FAILED'] } }];
  if (!can(req.user, 'media.read.all')) { const vis = await Content.find(visibilityFilter(req.user!)).select('_id').lean(); f.push({ $or: [{ contentId: { $in: vis.map((v) => v._id) } }, { uploadedBy: req.user!._id }] }); }
  const group: Record<string, any> = { raw: { category: 'RAW' }, editing: { category: 'EDIT' }, review: { category: 'EDIT', status: 'REVIEW_REQUIRED' }, final: { category: 'FINAL' }, images: { category: { $in: ['IMAGE', 'THUMBNAIL', 'BRAND_ASSET'] } }, documents: { category: { $in: ['DOCUMENT', 'REFERENCE'] } }, audio: { category: 'AUDIO' } };
  if (p.group && group[p.group]) f.push(group[p.group]);
  if (p.category) f.push({ category: p.category });
  if (p.clientId) f.push({ clientId: p.clientId });
  if (p.contentId) f.push({ contentId: p.contentId });
  if (p.uploadedBy) f.push({ uploadedBy: p.uploadedBy });
  if (p.version) f.push({ versionNumber: Number(p.version) });
  if (p.latest === '1') f.push({ status: { $ne: 'SUPERSEDED' } });
  if (p.from || p.to) f.push({ createdAt: { ...(p.from ? { $gte: new Date(p.from) } : {}), ...(p.to ? { $lte: new Date(p.to) } : {}) } });
  if (p.q) { const rx = new RegExp(escapeRx(p.q), 'i'); const cs = await Content.find({ $or: [{ contentId: rx }, { title: rx }] }).select('_id').lean(); f.push({ $or: [{ fileName: rx }, { originalName: rx }, { contentId: { $in: cs.map((c) => c._id) } }] }); }
  res.json(await Media.find({ $and: f }).sort({ createdAt: -1 }).limit(300).populate('uploadedBy', 'name').populate('contentId', 'contentId title').populate('clientId', 'name').lean());
}));

r.get('/config', (_req, res) => { res.json({ storage: storageMode(), maxUploadMb: env.maxUploadMb }); });

r.post('/upload', ah(async (req, res) => {
  const b = z.object({
    contentId: z.string().optional().nullable(),
    clientId: z.string().optional().nullable(),
    category: z.enum(MEDIA_CATEGORIES),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().max(120).optional().default('application/octet-stream'),
    size: z.number().int().positive()
  }).parse(req.body);
  const sanitized = {
    ...b,
    contentId: b.contentId && b.contentId !== 'null' && b.contentId !== 'undefined' && b.contentId.trim() ? b.contentId.trim() : undefined,
    clientId: b.clientId && b.clientId !== 'null' && b.clientId !== 'undefined' && b.clientId.trim() ? b.clientId.trim() : undefined,
  };
  res.status(201).json(await initUpload(req.user!, sanitized as any, originOf(req)));
}));
r.post('/:id/local-upload', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw new AppError(400, 'No file received', 'UPLOAD');
  res.json(await saveLocalUpload(req.user!, req.params.id, req.file));
}));
/** Step 2: verify the file exists in Drive, then run the workflow side effects */
r.post('/:id/complete', ah(async (req, res) => { const b = z.object({ driveFileId: z.string().max(200).optional() }).parse(req.body || {}); res.json(await completeUpload(req.user!, req.params.id, b.driveFileId)); }));
r.post('/:id/fail', ah(async (req, res) => { await failUpload(req.user!, req.params.id, String(req.body?.error || 'Upload failed')); res.json({ ok: true }); }));

r.get('/content/:contentId', ah(async (req, res) => {
  if (!(await Content.exists({ $and: [{ _id: req.params.contentId }, visibilityFilter(req.user!)] }))) throw forbidden();
  res.json(await Media.find({ contentId: req.params.contentId, status: { $nin: ['UPLOADING', 'FAILED'] } }).sort({ category: 1, versionNumber: -1 }).populate('uploadedBy', 'name').lean());
}));
r.get('/:id', ah(async (req, res) => {
  const m = await Media.findById(req.params.id).populate('uploadedBy', 'name').populate('contentId', 'contentId title').lean();
  if (!m) throw notFound('File');
  if (!(await canAccessMedia(req.user!, m))) throw forbidden();
  const feedback = await Feedback.find({ mediaId: m._id }).sort({ timestampSec: 1, createdAt: 1 }).lean();
  res.json({ ...m, feedback });
}));
r.post('/:id/link', ah(async (req, res) => {
  const m = await Media.findById(req.params.id);
  if (!m) throw notFound('File');
  if (!(await canAccessMedia(req.user!, m))) throw forbidden();
  const t = jwt.sign({ typ: 'media', mid: String(m._id), sub: req.user!._id }, env.jwtSecret, { expiresIn: '5m' });
  res.json({ stream: `/api/media/${m._id}/stream?t=${t}`, download: `/api/media/${m._id}/download?t=${t}`, drive: m.webViewLink || null });
}));
/** Timestamped comment on a video (internal reviewers) */
r.post('/:id/feedback', ah(async (req, res) => {
  const b = z.object({ timestampSec: z.number().min(0).max(86400).optional(), comment: z.string().min(1).max(2000) }).parse(req.body);
  const m = await Media.findById(req.params.id);
  if (!m) throw notFound('File');
  if (!(await canAccessMedia(req.user!, m))) throw forbidden();
  res.status(201).json(await Feedback.create({ ...b, mediaId: m._id, contentId: m.contentId, version: m.version, authorType: 'USER', authorId: req.user!._id, authorName: req.user!.name }));
}));
r.patch('/feedback/:fid', ah(async (req, res) => { res.json(await Feedback.findByIdAndUpdate(req.params.fid, { resolved: !!req.body?.resolved }, { new: true })); }));
export default r;
