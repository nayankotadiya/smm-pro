import fs from 'fs';
import FileType from 'file-type';
import { Response } from 'express';
import { Media, Content, Shoot, Approval, Client } from '../models';
import { AuthUser, can } from '../middleware/auth';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { ALLOWED_MIME_PREFIX, CATEGORY_CONTENT_FOLDER, MediaCategory, STAGES } from '../config/constants';
import { mediaFileName, VERSIONED } from '../utils/naming';
import { env } from '../config/env';
import { storageMode, ensureContentFolders, ensureClientFolders, localPathFor } from './storage';
import * as gd from '../integrations/drive';
import { visibilityFilter, moveToStage, setLastAction, broadcastContent } from './content';
import { logActivity } from './activity';
import { postSystemEvent } from './chat';
import { emitDomain } from './events';

/** Subset of multer's File shape — avoids depending on the global Express.Multer namespace */
interface MulterFile { fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; destination: string; filename: string; path: string; buffer: Buffer; }

import { closeTasks } from './tasks';
import { emitOrg } from './realtime';

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
export const mimeAllowed = (m: string) => ALLOWED_MIME_PREFIX.some((p) => m.startsWith(p));

export const EXT_MIME_MAP: Record<string, string> = {
  // Video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
  ts: 'video/mp2t',
  '3gp': 'video/3gpp',
  ogv: 'video/ogg',

  // Image
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  tif: 'image/tiff',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',

  // Documents & archives
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
};

export const isVideoMime = (m: string) =>
  m.startsWith('video/') || m === 'application/x-matroska' || m === 'application/mkv';

export const isImageMime = (m: string) =>
  m.startsWith('image/');

export function inferMimeType(fileName: string, declaredMime?: string | null): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const inferred = EXT_MIME_MAP[ext];
  if (!declaredMime || declaredMime === 'application/octet-stream' || declaredMime === 'binary/octet-stream' || !mimeAllowed(declaredMime)) {
    return inferred || declaredMime || 'application/octet-stream';
  }
  return declaredMime;
}

export function safeMoveFile(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch (err: any) {
    fs.copyFileSync(src, dest);
    try {
      fs.unlinkSync(src);
    } catch {
      // safe to ignore unlink lock on temporary file
    }
  }
}

const DOCS = ['DOCUMENT', 'REFERENCE', 'IMAGE', 'AUDIO', 'CHAT'];
/** What each production role may upload. Roles not listed (managers, leads, SMM, admins) are unrestricted. */
const ROLE_CATEGORIES: Record<string, string[]> = {
  SCRIPT_WRITER: DOCS,
  SUPPORT: [...DOCS, 'BRAND_ASSET'],
  SHOOTER: ['RAW', 'REFERENCE', 'IMAGE', 'CHAT'],
  EDITOR: ['EDIT', 'FINAL', 'THUMBNAIL', 'CHAT', 'IMAGE', 'AUDIO', 'REFERENCE'],
  DESIGNER: ['THUMBNAIL', 'IMAGE', 'CHAT', 'BRAND_ASSET', 'REFERENCE']
};

export async function initUpload(u: AuthUser, b: { contentId?: string; clientId?: string; category: MediaCategory; fileName: string; mimeType: string; size: number }, origin: string) {
  if (!can(u, 'media.upload') && b.category !== 'CHAT') throw forbidden('You cannot upload files');
  const rc = ROLE_CATEGORIES[u.role];
  if (rc && !rc.includes(b.category)) throw forbidden(`Your role cannot upload ${b.category.toLowerCase()} files`);

  b.mimeType = inferMimeType(b.fileName, b.mimeType);

  if (!mimeAllowed(b.mimeType || '')) throw badRequest('This file type is not allowed');
  if (b.size > env.maxUploadMb * 1024 * 1024) throw badRequest(`File exceeds ${env.maxUploadMb} MB limit`);
  if (['RAW', 'EDIT', 'FINAL'].includes(b.category) && !isVideoMime(b.mimeType)) throw badRequest('Please upload a video file');
  if (['THUMBNAIL'].includes(b.category) && !isImageMime(b.mimeType)) throw badRequest('Please upload an image file');

  let content: any = null;
  const contentIdClean = b.contentId && b.contentId !== 'null' && b.contentId !== 'undefined' && b.contentId.trim() ? b.contentId.trim() : undefined;
  if (contentIdClean) {
    content = await Content.findOne({ $and: [{ _id: contentIdClean }, visibilityFilter(u)] });
    if (!content) throw forbidden('This content is not assigned to you');
  }
  const rawClientId = content?.clientId || (b.clientId && b.clientId !== 'null' && b.clientId !== 'undefined' && b.clientId.trim() ? b.clientId.trim() : undefined);
  const clientId = rawClientId ? rawClientId : undefined;
  let versionNumber = 1; let fileName = b.fileName; let version: string | undefined;
  if (content && VERSIONED.includes(b.category)) {
    const last = await Media.findOne({ contentId: content._id, category: b.category, status: { $ne: 'FAILED' } }).sort({ versionNumber: -1 }).lean();
    versionNumber = (last?.versionNumber || 0) + 1;
    version = `${b.category}_V${versionNumber}`;
    fileName = mediaFileName(content.contentId, b.category, versionNumber, b.fileName, b.mimeType);
  } else if (content) {
    fileName = `${content.contentId}_${b.category}_${Date.now().toString(36)}_${b.fileName.replace(/[^\w.-]/g, '_')}`;
  }
  const mode = storageMode();
  const media = await Media.create({ contentId: content?._id, clientId, storage: mode, fileName, originalName: b.fileName, mimeType: b.mimeType, size: b.size, category: b.category, versionNumber, version, stage: content?.stage, uploadedBy: u._id, status: 'UPLOADING' });
  if (mode === 'LOCAL') return { mediaId: String(media._id), fileName, mode, uploadUrl: `/api/media/${media._id}/local-upload` };
  let parent: string;
  if (content) {
    await ensureContentFolders(content);
    const fresh = await Content.findById(content._id).lean();
    parent = (fresh!.driveSubfolders as any)?.[CATEGORY_CONTENT_FOLDER[b.category]] || fresh!.driveFolderId!;
  } else if (clientId) {
    const cl = await Client.findById(clientId);
    const f = await ensureClientFolders(cl);
    parent = f!.subs[b.category === 'BRAND_ASSET' ? '01_Brand_Assets' : '10_Other'];
  } else {
    parent = (await (await import('./storage')).rootFolders()).root;
  }
  media.driveFolderId = parent; await media.save();
  const uploadUrl = await gd.createResumableSession({ name: fileName, mimeType: b.mimeType, size: b.size, parentId: parent, origin });
  return { mediaId: String(media._id), fileName, mode, uploadUrl };
}

export async function completeUpload(u: AuthUser, mediaId: string, driveFileId?: string) {
  const media = await Media.findById(mediaId);
  if (!media) throw notFound('Upload');
  if (String(media.uploadedBy) !== u._id) throw forbidden();
  if (media.status !== 'UPLOADING') return media;
  if (media.storage === 'DRIVE') {
    if (!driveFileId) throw badRequest('Missing Drive file id');
    const f = await gd.getFile(driveFileId);
    if (!f || f.trashed || !(f.parents || []).includes(media.driveFolderId!)) throw badRequest('Uploaded file could not be verified in Google Drive');
    // Magic-byte check on the first bytes actually stored in Drive: the browser-declared MIME is not trusted
    const head = await gd.readHead(driveFileId, 4100).catch(() => null);
    const ft = head ? await FileType.fromBuffer(head) : undefined;
    const mustBeVideo = ['RAW', 'EDIT', 'FINAL'].includes(media.category);
    if ((ft && !mimeAllowed(ft.mime)) || (mustBeVideo && ft && !isVideoMime(ft.mime))) {
      await gd.trashFile(driveFileId).catch(() => undefined);
      media.status = 'FAILED'; media.error = 'File content does not match an allowed type'; await media.save();
      throw badRequest(mustBeVideo ? 'The uploaded file is not a valid video' : 'File content does not match an allowed type');
    }
    if (ft) media.mimeType = ft.mime;
    media.driveFileId = driveFileId; media.webViewLink = f.webViewLink || undefined; media.size = Number(f.size || media.size);
  }
  media.status = ['EDIT', 'FINAL'].includes(media.category) ? 'REVIEW_REQUIRED' : 'READY';
  media.uploadedAt = new Date();
  await media.save();
  if (media.contentId && VERSIONED.includes(media.category)) await Media.updateMany({ contentId: media.contentId, category: media.category, _id: { $ne: media._id }, status: { $in: ['READY', 'REVIEW_REQUIRED'] } }, { status: 'SUPERSEDED' });
  await onMediaReady(media, u);
  return media;
}

export async function failUpload(u: AuthUser, mediaId: string, error: string) {
  await Media.updateOne({ _id: mediaId, uploadedBy: u._id, status: 'UPLOADING' }, { status: 'FAILED', error: error?.slice(0, 300) });
  await logActivity({ actorId: u._id, action: 'media.failed', message: `Upload failed`, entityType: 'media', entityId: mediaId, meta: { error } });
}

const idx = (s: string) => STAGES.indexOf(s as any);

async function onMediaReady(media: any, u: AuthUser) {
  const content = media.contentId ? await Content.findById(media.contentId) : null;
  const card = [media.fileName, fmtSize(media.size || 0), `Uploaded by ${u.name}`];
  await logActivity({ actorId: u._id, action: 'media.uploaded', message: `${u.name} uploaded ${media.fileName}`, entityType: 'media', entityId: media._id, contentId: media.contentId, clientId: media.clientId });
  emitOrg('file:uploaded', media.toJSON());
  if (!content) return;
  const v = `V${media.versionNumber}`;
  if (media.category === 'RAW') {
    await Shoot.updateOne({ contentId: content._id }, { status: 'RAW_UPLOADED', 'checklist.rawUploaded': true });
    await closeTasks(content._id, ['SHOOT']);
    content.currentVideoVersion = media.version; content.latestMediaId = media._id;
    if (idx(content.stage) < idx('RAW_FOOTAGE')) await moveToStage(content, 'RAW_FOOTAGE', u._id, `${u.name} uploaded raw footage ${v}`);
    else { await setLastAction(content, `${u.name} uploaded raw footage ${v}`, u._id); await content.save(); await broadcastContent(content); }
    await postSystemEvent(content._id, 'raw.uploaded', 'RAW VIDEO UPLOADED', card, {
      mediaId: media._id,
      action: {
        actionType: 'CREATE_TASK',
        title: `Start Editing ${content.contentId}`,
        description: `Raw footage ${v} uploaded by ${u.name}. Assigned editor: ${content.assignedEditor ? 'Assigned' : 'Unassigned'}`,
        allowedRoles: ['EDITOR', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
        payload: { contentId: content._id, priority: 'HIGH' },
      },
    });
    emitDomain('raw.uploaded', { contentId: String(content._id), actorId: u._id, version: `Raw ${v}`, mediaId: String(media._id) });
  } else if (media.category === 'EDIT') {
    await closeTasks(content._id, ['EDIT', 'EDIT_REVISION']);
    content.currentVideoVersion = media.version; content.latestMediaId = media._id;
    await Approval.updateMany({ contentId: content._id, type: 'SMM', status: 'PENDING' }, { status: 'CANCELLED', $push: { history: { status: 'CANCELLED', note: 'Superseded by new edit' } } });
    const apEdit = await Approval.create({ contentId: content._id, clientId: content.clientId, type: 'SMM', version: `Edit ${v}`, mediaId: media._id, status: 'PENDING', reviewerId: content.assignedSMM, createdBy: u._id, sentAt: new Date(), history: [{ status: 'SUBMITTED', by: u._id }] });
    await moveToStage(content, 'SMM_REVIEW', u._id, `${u.name} uploaded Edit ${v}`);
    await postSystemEvent(content._id, 'edit.uploaded', `EDIT ${v} UPLOADED`, [...card, 'Status: Review Required'], {
      mediaId: media._id,
      action: {
        actionType: 'SMM_REVIEW',
        title: `Review Edit ${v}`,
        description: `Uploaded by ${u.name}. Check pacing, captions, and branding.`,
        allowedRoles: ['SMM', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
        payload: { approvalId: apEdit._id, version: `Edit ${v}` },
      },
    });
    emitDomain('edit.uploaded', { contentId: String(content._id), actorId: u._id, version: `Edit ${v}`, mediaId: String(media._id) });
  } else if (media.category === 'FINAL') {
    content.currentVideoVersion = media.version; content.latestMediaId = media._id;
    await closeTasks(content._id, ['EDIT', 'EDIT_REVISION']);
    if (media.storage === 'DRIVE') {
      try { const f = await ensureClientFolders(await Client.findById(content.clientId)); await gd.copyFile(media.driveFileId, f!.subs['07_Final'], media.fileName); } catch (e: any) { console.warn('[drive] copy final', e.message); }
    }
    const pending = await Approval.findOne({ contentId: content._id, type: 'FINAL', status: 'PENDING' });
    let apFinal = pending;
    if (pending) { pending.mediaId = media._id; pending.version = `Final ${v}`; await pending.save(); }
    else {
      apFinal = await Approval.create({ contentId: content._id, clientId: content.clientId, type: 'FINAL', version: `Final ${v}`, mediaId: media._id, status: 'PENDING', reviewerId: content.assignedReviewer, createdBy: u._id, sentAt: new Date(), history: [{ status: 'SUBMITTED', by: u._id }] });
    }
    if (idx(content.stage) < idx('FINAL_REVIEW')) await moveToStage(content, 'FINAL_REVIEW', u._id, `${u.name} uploaded Final ${v}`);
    else { await setLastAction(content, `${u.name} uploaded Final ${v}`, u._id); await content.save(); await broadcastContent(content); }
    await postSystemEvent(content._id, 'final.uploaded', 'FINAL VIDEO READY', card, {
      mediaId: media._id,
      action: {
        actionType: 'FINAL_REVIEW',
        title: `Final Review: Final ${v}`,
        description: `Final video uploaded by ${u.name}. Manager/Lead approval required.`,
        allowedRoles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD'],
        payload: { approvalId: apFinal?._id, version: `Final ${v}` },
      },
    });
    emitDomain('final.uploaded', { contentId: String(content._id), actorId: u._id, version: `Final ${v}` });
  } else {
    if (media.category === 'THUMBNAIL') {
      content.latestMediaId = media._id;
    }
    await setLastAction(content, `${u.name} uploaded ${media.fileName}`, u._id); await content.save(); await broadcastContent(content);
    if (media.category !== 'CHAT') await postSystemEvent(content._id, 'file.uploaded', 'FILE UPLOADED', card, { mediaId: media._id });
  }
}

export async function canAccessMedia(u: AuthUser, media: any) {
  if (can(u, 'media.read.all') || String(media.uploadedBy) === u._id) return true;
  if (media.contentId) return !!(await Content.exists({ $and: [{ _id: media.contentId }, visibilityFilter(u)] }));
  if (media.category === 'CHAT') {
    const { Message, ChatRoom } = await import('../models');
    const m = await Message.findOne({ attachments: media._id }).lean();
    return !!(m && (await ChatRoom.exists({ _id: m.roomId, participants: u._id })));
  }
  return can(u, 'clients.read');
}

/** Streams a file through the API after permission checks. Supports HTTP Range for video preview. */
export async function streamMedia(u: AuthUser, id: string, res: Response, range: string | undefined, download: boolean, ip?: string) {
  const media = await Media.findById(id).select('+localPath');
  if (!media || media.status === 'UPLOADING' || media.status === 'FAILED') throw notFound('File');
  if (!(await canAccessMedia(u, media))) throw forbidden();
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${media.fileName}"`);
  res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, no-store');
  if (download) {
    await Media.updateOne({ _id: media._id }, { $inc: { downloads: 1 } });
    await logActivity({ actorId: u._id, action: 'media.downloaded', message: `${u.name} downloaded ${media.fileName}`, entityType: 'media', entityId: media._id, contentId: media.contentId, clientId: media.clientId, ip });
  }
  return pipeMedia(media, res, range);
}

/** Low-level byte piping (local disk or Drive) with Range support. Caller is responsible for authorization. */
export async function pipeMedia(media: any, res: Response, range?: string) {
  if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  if (media.storage === 'LOCAL') {
    const p = media.localPath;
    if (!p || !fs.existsSync(p)) throw notFound('File on disk');
    const size = fs.statSync(p).size;
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0; const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      res.status(206).setHeader('Content-Range', `bytes ${start}-${end}/${size}`); res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(p, { start, end }).pipe(res);
    }
    res.setHeader('Content-Length', size);
    return fs.createReadStream(p).pipe(res);
  }
  const r = await gd.streamFile(media.driveFileId!, range);
  if (r.status === 206) { res.status(206); if (r.headers['content-range']) res.setHeader('Content-Range', r.headers['content-range']); }
  if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
  r.stream.on('error', () => res.destroy());
  r.stream.pipe(res);
}

export async function saveLocalUpload(u: AuthUser, id: string, file: MulterFile) {
  const media = await Media.findById(id);
  if (!media || String(media.uploadedBy) !== u._id || media.storage !== 'LOCAL' || media.status !== 'UPLOADING') {
    try { fs.unlinkSync(file.path); } catch {}
    throw forbidden();
  }
  // Magic-byte sniffing: don't trust the browser MIME
  const ft = await FileType.fromFile(file.path).catch(() => undefined);
  const textLike = /^text\//.test(media.mimeType || '');
  if (!textLike && ft && !mimeAllowed(ft.mime)) {
    try { fs.unlinkSync(file.path); } catch {}
    throw badRequest('File content does not match an allowed type');
  }
  if (['RAW', 'EDIT', 'FINAL'].includes(media.category) && ft && !isVideoMime(ft.mime)) {
    try { fs.unlinkSync(file.path); } catch {}
    throw badRequest('File is not a valid video');
  }
  const dest = localPathFor(media.fileName);
  safeMoveFile(file.path, dest);
  const finalMime = ft?.mime || inferMimeType(media.fileName, media.mimeType);
  await Media.updateOne({ _id: id }, { localPath: dest, size: file.size, mimeType: finalMime });
  return completeUpload(u, id);
}
