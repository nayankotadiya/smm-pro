import { Router } from 'express';
import { z } from 'zod';
import { Client, Campaign, Content, Media, DriveFolder } from '../models';
import { ah } from '../utils/async';
import { AppError, notFound } from '../utils/errors';
import { requirePerm } from '../middleware/auth';
import { driveConfigured, getFile, listFolder, findOrCreateFolder } from '../integrations/drive';
import { ensureClientFolders, ensureContentFolders } from '../services/storage';
import { initUpload } from '../services/media';
import { env } from '../config/env';
import { logActivity } from '../services/activity';

const r = Router();
/** Drive only allows the resumable upload from the origin the session was created for */
const originOf = (req: any) => { const o = String(req.get('origin') || '').replace(/\/$/, ''); return env.appOrigins.includes(o) ? o : env.appOrigins[0]; };
const need = (_q: any, _s: any, next: any) => (driveConfigured() ? next() : next(new AppError(503, 'Google Drive is not connected. Ask an admin to configure it in Settings.', 'DRIVE_NOT_CONFIGURED')));

r.post('/folders/client', need, requirePerm('clients.write'), ah(async (req, res) => {
  const c = await Client.findById(z.object({ clientId: z.string() }).parse(req.body).clientId);
  if (!c) throw notFound('Client');
  res.json(await ensureClientFolders(c));
}));
r.post('/folders/campaign', need, requirePerm('clients.write', 'content.write'), ah(async (req, res) => {
  const c = await Campaign.findById(z.object({ campaignId: z.string() }).parse(req.body).campaignId);
  if (!c) throw notFound('Campaign');
  const cf = await ensureClientFolders(await Client.findById(c.clientId));
  const id = await findOrCreateFolder(`Campaign_${c.name}`, cf!.subs['02_Content_Ideas']);
  c.driveFolderId = id; await c.save();
  res.json({ id });
}));
r.post('/folders/content', need, requirePerm('content.write'), ah(async (req, res) => {
  const c = await Content.findById(z.object({ contentId: z.string() }).parse(req.body).contentId);
  if (!c) throw notFound('Content');
  res.json(await ensureContentFolders(c));
}));
/** Alias of POST /api/media/upload (kept for API compatibility) */
r.post('/upload', ah(async (req, res) => { res.status(201).json(await initUpload(req.user!, req.body, originOf(req))); }));
r.get('/file/:id', need, requirePerm('media.read.all'), ah(async (req, res) => {
  if (!(await Media.exists({ driveFileId: req.params.id }))) throw notFound('File'); // only files this app manages
  res.json(await getFile(req.params.id));
}));
r.get('/folder/:id', need, requirePerm('media.read.all'), ah(async (req, res) => {
  if (!(await DriveFolder.exists({ driveId: req.params.id }))) throw notFound('Folder'); // only folders this app created
  res.json(await listFolder(req.params.id));
}));
/** Reconciles DB records against Drive: flags files removed from Drive, recreates missing folder structure. */
r.post('/sync', need, requirePerm('integrations.manage'), ah(async (req, res) => {
  let missing = 0; let checked = 0;
  await DriveFolder.deleteOne({ key: 'root' });
  const files = await Media.find({ storage: 'DRIVE', status: { $nin: ['UPLOADING', 'FAILED'] } }).sort({ updatedAt: 1 }).limit(300);
  for (const m of files) {
    checked++;
    try { const f = await getFile(m.driveFileId!); if (f.trashed) throw new Error('trashed'); if (f.webViewLink && f.webViewLink !== m.webViewLink) { m.webViewLink = f.webViewLink; await m.save(); } }
    catch { m.status = 'FAILED'; m.error = 'File missing in Google Drive'; await m.save(); missing++; }
  }
  const clients = await Client.find({});
  for (const c of clients) await ensureClientFolders(c);
  await logActivity({ actorId: req.user!._id, action: 'drive.sync', message: `Drive sync: ${checked} files checked, ${missing} missing, ${clients.length} client folders updated` });
  res.json({ checked, missing, foldersCreated: clients.length });
}));
export default r;
