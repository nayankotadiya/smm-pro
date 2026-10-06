import { Approval, Content, Client, Script, ScriptVersion, Shoot, Feedback, Media, CommunicationLog, WhatsAppNotificationLog, Review, DailyReviewAccess } from '../models';
import { AuthUser, can } from '../middleware/auth';
import { AppError, badRequest, forbidden, notFound } from '../utils/errors';
import { randomToken, sha256, encrypt, decrypt } from '../utils/crypto';
import { env } from '../config/env';
import { moveToStage, setLastAction, broadcastContent } from './content';
import { logActivity } from './activity';
import { postSystemEvent } from './chat';
import { emitDomain } from './events';
import { closeTasks } from './tasks';
import { emitOrg } from './realtime';
import { aisensyConfigured, sendTemplate } from '../integrations/aisensy';

const OPEN = ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'];
const push = (a: any, status: string, extra: any = {}) => a.history.push({ status, at: new Date(), ...extra });
const broadcast = (a: any) => emitOrg('approval:updated', { _id: String(a._id), contentId: String(a.contentId), status: a.status, type: a.type });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' });

/** INTERNAL_SCRIPT, SMM and FINAL approvals are decided inside the app */
export async function reviewInternal(id: string, decision: 'APPROVE' | 'CHANGES', note: string | undefined, u: AuthUser, comments: { timestampSec?: number; comment: string }[] = []) {
  const a = await Approval.findById(id);
  if (!a) throw notFound('Approval');
  if (!['INTERNAL_SCRIPT', 'SMM', 'FINAL'].includes(a.type)) throw badRequest('Client approvals are decided by the client');
  if (a.status !== 'PENDING') throw badRequest('This review has already been decided');
  const allowed = can(u, 'approvals.review') || can(u, 'scripts.review') || String(a.reviewerId) === u._id;
  if (!allowed) throw forbidden('You are not a reviewer for this item');
  if (decision === 'CHANGES' && !note && !comments.length) throw badRequest('Describe the changes required');
  const content = (await Content.findById(a.contentId))!;
  const version = a.version || '';
  a.status = decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED';
  a.decidedAt = new Date(); if (decision === 'APPROVE') a.approvedAt = new Date();
  push(a, a.status, { by: u._id, note });
  const all = [...(note ? [{ comment: note }] : []), ...comments];
  for (const c of all) await Feedback.create({ contentId: content._id, approvalId: a._id, mediaId: a.mediaId, version: version, timestampSec: c.timestampSec, comment: c.comment, authorType: 'USER', authorId: u._id, authorName: u.name });
  a.feedbackCount = (a.feedbackCount || 0) + all.length;
  await a.save();
  const reason = all.map((c) => (c.timestampSec != null ? `${fmtTs(c.timestampSec)} ${c.comment}` : c.comment)).join('; ');
  const verb = decision === 'APPROVE' ? 'approved' : 'requested changes on';
  await logActivity({ actorId: u._id, action: `approval.${a.type.toLowerCase()}.${decision.toLowerCase()}`, message: `${u.name} ${verb} ${version}`, entityType: 'approval', entityId: a._id, contentId: content._id, clientId: content.clientId });
  const p = { contentId: String(content._id), actorId: u._id, version: version, reason, approvalId: String(a._id) };

  if (a.type === 'INTERNAL_SCRIPT') {
    const v = await ScriptVersion.findById(a.scriptVersionId);
    if (v) { v.status = decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED'; v.approvalState = a.status; v.reviewNote = note; v.reviewedBy = u._id as any; v.reviewedAt = new Date(); await v.save(); }
    await Script.updateOne({ contentId: content._id }, { status: decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED' });
    if (decision === 'APPROVE') {
      await moveToStage(content, 'CLIENT_REVIEW', u._id, `${u.name} approved ${version}`);
      await postSystemEvent(content._id, 'script.approved', `${version.toUpperCase()} APPROVED`, [`Approved by ${u.name}`, 'Next: send to client for review'], {
        action: {
          actionType: 'SEND_CLIENT_REVIEW',
          title: `Send Script ${version} to Client`,
          description: `Internal script review approved by ${u.name}. Dispatch review link via WhatsApp / link.`,
          allowedRoles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'SMM'],
          payload: { kind: 'SCRIPT' },
        },
      });
      emitDomain('script.approved', p);
    } else {
      content.status = 'CHANGES_REQUESTED';
      await moveToStage(content, 'SCRIPT', u._id, `${u.name} requested changes on ${version}`);
      content.status = 'CHANGES_REQUESTED'; await content.save(); await broadcastContent(content);
      await postSystemEvent(content._id, 'script.changes', 'SCRIPT CHANGES REQUESTED', [version, reason]);
      emitDomain('script.changes_requested', p);
    }
  } else if (a.type === 'SMM') {
    await closeTasks(content._id, ['SMM_REVIEW']);
    if (a.mediaId) await Media.updateOne({ _id: a.mediaId }, { status: decision === 'APPROVE' ? 'APPROVED' : 'READY' });
    if (decision === 'APPROVE') {
      const apFin = await Approval.create({ contentId: content._id, clientId: content.clientId, type: 'FINAL', version: version, mediaId: a.mediaId, status: 'PENDING', reviewerId: content.assignedReviewer, createdBy: u._id, sentAt: new Date(), history: [{ status: 'SUBMITTED', by: u._id, note: 'SMM approved' }] });
      await moveToStage(content, 'FINAL_REVIEW', u._id, `${u.name} approved ${version} (SMM)`);
      await postSystemEvent(content._id, 'smm.approved', 'SMM REVIEW COMPLETED', [`${version} approved by ${u.name}`, 'Next: Final review'], {
        action: {
          actionType: 'FINAL_REVIEW',
          title: `Final Review for ${version}`,
          description: `SMM review passed by ${u.name}. Final managerial sign-off required.`,
          allowedRoles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD'],
          payload: { approvalId: apFin._id, version },
        },
      });
      emitDomain('smm.approved', p);
    } else {
      await moveToStage(content, 'EDITING', u._id, `${u.name} requested changes on ${version}`);
      content.status = 'CHANGES_REQUESTED'; await content.save(); await broadcastContent(content);
      await postSystemEvent(content._id, 'smm.changes', 'SMM CHANGES REQUESTED', [version, reason]);
      emitDomain('smm.changes_requested', p);
    }
  } else if (a.type === 'FINAL') {
    await closeTasks(content._id, ['FINAL_REVIEW']);
    if (decision === 'APPROVE') {
      await moveToStage(content, 'CLIENT_FINAL_APPROVAL', u._id, `${u.name} gave final approval to ${version}`);
      await postSystemEvent(content._id, 'final.approved', 'FINAL REVIEW APPROVED', [`${version} approved by ${u.name}`, 'Next: send for client final approval'], {
        action: {
          actionType: 'SEND_CLIENT_REVIEW',
          title: `Send ${version} for Client Final Approval`,
          description: `Internal final review passed. Send to client via WhatsApp / link for approval.`,
          allowedRoles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'SMM'],
          payload: { kind: 'FINAL' },
        },
      });
      emitDomain('final.approved', p);
    } else {
      await moveToStage(content, 'EDITING', u._id, `${u.name} requested final changes on ${version}`);
      content.status = 'CHANGES_REQUESTED'; await content.save(); await broadcastContent(content);
      await postSystemEvent(content._id, 'final.changes', 'FINAL REVIEW CHANGES REQUESTED', [version, reason]);
      emitDomain('final.changes_requested', p);
    }
  }
  broadcast(a);
  return a;
}
export const fmtTs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Create a client approval (script or final), a secure one-time link, and send it via AiSensy when configured. */
export async function sendClientReview(u: AuthUser, b: { contentId: string; kind: 'SCRIPT' | 'FINAL'; phone?: string; recipientName?: string; sendWhatsApp?: boolean }, customBaseUrl?: string) {
  const content = await Content.findById(b.contentId);
  if (!content) throw notFound('Content');
  const client = (await Client.findById(content.clientId))!;
  const type = b.kind === 'SCRIPT' ? 'CLIENT_SCRIPT' : 'CLIENT_FINAL';
  // The client only ever sees work that has passed internal review
  if (type === 'CLIENT_SCRIPT' && content.stage !== 'CLIENT_REVIEW') throw badRequest('The script must pass internal review before it can go to the client');
  if (type === 'CLIENT_FINAL' && content.stage !== 'CLIENT_FINAL_APPROVAL') throw badRequest('Final internal review must be approved before sending to the client');
  let version: string; let scriptVersionId: any; let mediaId: any;
  if (type === 'CLIENT_SCRIPT') {
    const v = await ScriptVersion.findOne({ contentId: content._id, status: 'APPROVED' }).sort({ version: -1 });
    if (!v) throw badRequest('An internally approved script is required first');
    version = `Script ${v.label}`; scriptVersionId = v._id;
  } else {
    const m = await Media.findOne({ contentId: content._id, category: { $in: ['FINAL', 'EDIT'] }, status: { $in: ['APPROVED', 'REVIEW_REQUIRED', 'READY'] } }).sort({ category: -1, versionNumber: -1 });
    if (!m) throw badRequest('Upload the final video first');
    version = m.category === 'FINAL' ? `Final V${m.versionNumber}` : `Edit V${m.versionNumber}`; mediaId = m._id;
  }
  // cancel older open links of the same type (single active link per content/type)
  const open = await Approval.find({ contentId: content._id, type, status: { $in: ['DRAFT', 'SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'] } });
  for (const o of open) { o.status = 'CANCELLED'; push(o, 'CANCELLED', { by: u._id, note: 'Replaced by a new review link' }); await o.save(); }
  const token = randomToken(32);
  const a = await Approval.create({
    contentId: content._id, clientId: client._id, type, version, scriptVersionId, mediaId, status: 'DRAFT',
    tokenHash: sha256(token), tokenEnc: encrypt(token, env.jwtSecret), expiresAt: new Date(Date.now() + env.approvalTtlHours * 3600e3),
    recipientPhone: b.phone || client.phone, recipientName: b.recipientName || client.contactPerson || client.name,
    reviewerId: content.assignedReviewer, createdBy: u._id, history: [{ status: 'DRAFT', by: u._id }],
  });
  const baseUrl = (customBaseUrl || env.publicApprovalUrl).replace(/\/$/, '');
  const url = `${baseUrl}/${token}`;
  await deliver(a, content, client, url, u, b.sendWhatsApp !== false);
  await moveToStage(content, type === 'CLIENT_SCRIPT' ? 'CLIENT_REVIEW' : 'CLIENT_FINAL_APPROVAL', u._id, `${u.name} sent ${version} for client review`);
  await logActivity({ actorId: u._id, action: 'approval.client.sent', message: `${u.name} sent ${content.contentId} ${version} for client review${a.source === 'AISENSY' ? ' via WhatsApp' : ''}`, entityType: 'approval', entityId: a._id, contentId: content._id, clientId: client._id });
  await postSystemEvent(content._id, 'client_review.sent', 'SENT FOR CLIENT REVIEW', [version, a.source === 'AISENSY' ? `WhatsApp to ${a.recipientName}` : 'Link ready to share', a.sendError ? `WhatsApp failed: ${a.sendError}` : '']);
  emitDomain('client_review.sent', { contentId: String(content._id), actorId: u._id, version, approvalId: String(a._id) });
  emitOrg('approval:new', { _id: String(a._id), contentId: String(content._id), status: a.status, type });
  return { approval: a, url };
}

async function deliver(a: any, content: any, client: any, url: string, u: AuthUser, whatsapp: boolean) {
  a.sentAt = new Date();
  if (whatsapp && aisensyConfigured() && a.recipientPhone) {
    try {
      const token = url.split('/').pop()!;
      const r = await sendTemplate({ phone: a.recipientPhone, userName: a.recipientName, params: [a.recipientName, content.title, a.version, url], buttonUrlSuffix: env.aisensy.useUrlButton ? token : undefined });
      a.source = 'AISENSY'; a.externalMessageId = r.messageId; a.status = 'SENT'; a.sendError = undefined;
      push(a, 'SENT', { by: u._id, source: 'AISENSY' });
      await CommunicationLog.create({ clientId: client._id, contentId: content._id, employeeId: u._id, type: 'WHATSAPP', direction: 'OUTBOUND', summary: `Review link sent for ${content.title} (${a.version})`, source: 'AISENSY', externalId: r.messageId || undefined });
      await logActivity({ actorType: 'INTEGRATION', actorName: 'AiSensy', action: 'aisensy.sent', message: `AiSensy message sent for ${content.contentId}`, entityType: 'approval', entityId: a._id, contentId: content._id, clientId: client._id });
      await WhatsAppNotificationLog.create({
        provider: 'AISENSY',
        externalMessageId: r.messageId || undefined,
        recipientPhone: a.recipientPhone,
        recipientName: a.recipientName,
        clientId: client._id,
        contentId: content._id,
        approvalId: a._id,
        type: 'CLIENT_APPROVAL',
        templateName: env.aisensy.templateName,
        parameters: [a.recipientName, content.title, a.version, url],
        status: 'SENT',
        sentAt: new Date(),
      });
    } catch (e: any) {
      a.source = 'LINK'; a.status = 'WAITING_FOR_CLIENT'; a.sendError = (e.response?.data?.message || e.message || 'Send failed').toString().slice(0, 200);
      push(a, 'WAITING_FOR_CLIENT', { by: u._id, note: `WhatsApp send failed: ${a.sendError}. Share link manually.` });
      await WhatsAppNotificationLog.create({
        provider: 'AISENSY',
        recipientPhone: a.recipientPhone,
        recipientName: a.recipientName,
        clientId: client._id,
        contentId: content._id,
        approvalId: a._id,
        type: 'CLIENT_APPROVAL',
        templateName: env.aisensy.templateName,
        parameters: [a.recipientName, content.title, a.version, url],
        status: 'FAILED',
        error: a.sendError,
      });
    }
  } else {
    a.source = 'LINK'; a.status = 'WAITING_FOR_CLIENT';
    push(a, 'WAITING_FOR_CLIENT', { by: u._id, note: aisensyConfigured() ? 'Link generated' : 'AiSensy not configured — share link manually' });
  }
  await a.save();
}

export async function resend(u: AuthUser, id: string, customBaseUrl?: string) {
  const a = await Approval.findById(id);
  if (!a || !['CLIENT_SCRIPT', 'CLIENT_FINAL'].includes(a.type)) throw notFound('Client approval');
  if (['APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'].includes(a.status)) throw badRequest('This review is closed; send a new one');
  // rotate token so old links stop working
  return sendClientReview(u, { contentId: String(a.contentId), kind: a.type === 'CLIENT_SCRIPT' ? 'SCRIPT' : 'FINAL', phone: a.recipientPhone || undefined, recipientName: a.recipientName || undefined }, customBaseUrl);
}
/** Returns the still-active public link for an open client approval (staff only). */
export async function activeLink(id: string, customBaseUrl?: string) {
  const a = await Approval.findById(id).select('+tokenEnc');
  if (!a) throw notFound('Approval');
  if (!a.tokenEnc || !OPEN.includes(a.status) || (a.expiresAt && a.expiresAt < new Date())) throw badRequest('This link is no longer active. Use Resend to create a new one.');
  const baseUrl = (customBaseUrl || env.publicApprovalUrl).replace(/\/$/, '');
  return { url: `${baseUrl}/${decrypt(a.tokenEnc, env.jwtSecret)}`, expiresAt: a.expiresAt };
}
export async function cancel(u: AuthUser, id: string) {
  const a = await Approval.findById(id);
  if (!a) throw notFound('Approval');
  if (['APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'].includes(a.status)) throw badRequest('Already closed');
  a.status = 'CANCELLED'; a.set('tokenEnc', undefined); push(a, 'CANCELLED', { by: u._id }); await a.save();
  await logActivity({ actorId: u._id, action: 'approval.cancelled', message: `${u.name} cancelled ${a.version} review`, entityType: 'approval', entityId: a._id, contentId: a.contentId });
  broadcast(a); return a;
}

// ---------- Public (client) side ----------
export async function findByToken(token: string) {
  if (!token || token.length < 30) throw notFound('Link');
  const a = await Approval.findOne({ tokenHash: sha256(token) }).select('+tokenHash');
  if (!a) throw notFound('Link');
  if (a.status === 'CANCELLED') throw new AppError(410, 'This review link is no longer active.', 'CANCELLED');
  if (a.status === 'EXPIRED' || (a.expiresAt && a.expiresAt < new Date() && OPEN.includes(a.status))) {
    if (a.status !== 'EXPIRED') { a.status = 'EXPIRED'; push(a, 'EXPIRED'); await a.save(); broadcast(a); }
    throw new AppError(410, 'This review link has expired. Please contact your account manager.', 'EXPIRED');
  }
  return a;
}
export async function publicView(token: string) {
  const a = await findByToken(token);
  const content = (await Content.findById(a.contentId).lean())!;
  const client = (await Client.findById(a.clientId).select('name businessName').lean())!;
  let script: any = null;
  if (a.scriptVersionId) {
    const v = await ScriptVersion.findById(a.scriptVersionId).lean();
    script = v && { hook: v.hook, scenes: v.scenes, dialogue: v.dialogue, body: v.body || v.dialogue, cta: v.cta, captionNotes: v.captionNotes, duration: v.duration, music: v.music };
  }
  const media = a.mediaId ? await Media.findById(a.mediaId).select('mimeType fileName').lean() : null;
  const thumb = await Media.findOne({ contentId: a.contentId, category: 'THUMBNAIL', status: { $in: ['READY', 'APPROVED', 'REVIEW_REQUIRED'] } }).sort({ versionNumber: -1 }).select('_id').lean();
  return {
    brand: client.businessName || client.name, title: content.title, version: a.version, type: a.type,
    caption: content.caption, hashtags: content.hashtags, description: content.description,
    decided: ['APPROVED', 'CHANGES_REQUESTED'].includes(a.status), status: a.status,
    script, hasVideo: !!media && (media.mimeType || '').startsWith('video/'), hasThumbnail: !!thumb, expiresAt: a.expiresAt,
  };
}
export async function publicStreamTarget(token: string, which: 'video' | 'thumbnail') {
  const a = await findByToken(token);
  if (which === 'video') return a.mediaId ? Media.findById(a.mediaId).select('+localPath') : null;
  return Media.findOne({ contentId: a.contentId, category: 'THUMBNAIL', status: { $in: ['READY', 'APPROVED', 'REVIEW_REQUIRED'] } }).sort({ versionNumber: -1 }).select('+localPath');
}
export async function publicOpened(token: string) {
  const a = await findByToken(token);
  if (!a.openedAt && OPEN.includes(a.status)) {
    a.openedAt = new Date(); a.status = 'OPENED'; push(a, 'OPENED', { source: 'LINK' }); await a.save();
    await logActivity({ actorType: 'CLIENT', action: 'approval.opened', message: `Client opened review link for ${a.version}`, entityType: 'approval', entityId: a._id, contentId: a.contentId, clientId: a.clientId });
    broadcast(a);
  }
  return { ok: true };
}

export async function clientDecision(tokenOrApproval: string | any, decision: 'APPROVE' | 'CHANGES', body: { name?: string; comments?: { timestampSec?: number; comment: string }[] }, opts: { manualBy?: AuthUser; ip?: string } = {}) {
  const a = typeof tokenOrApproval === 'string' ? await findByToken(tokenOrApproval) : tokenOrApproval;
  if (!OPEN.includes(a.status) && a.status !== 'DRAFT') throw new AppError(409, 'A decision has already been recorded for this review.', 'DECIDED');
  const comments = (body.comments || []).filter((c) => c.comment?.trim());
  if (decision === 'CHANGES' && !comments.length) throw badRequest('Please describe the changes you need');
  const content = (await Content.findById(a.contentId))!;
  a.status = decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED';
  a.decidedAt = new Date(); if (decision === 'APPROVE') a.approvedAt = new Date();
  if (opts.manualBy) a.source = 'MANUAL';
  a.tokenEnc = undefined; // link can no longer be copied or reused
  push(a, a.status, { by: opts.manualBy?._id, source: opts.manualBy ? 'MANUAL' : 'LINK', note: body.name ? `By ${body.name}` : undefined });
  for (const c of comments) await Feedback.create({ contentId: content._id, approvalId: a._id, mediaId: a.mediaId, version: a.version, timestampSec: c.timestampSec, comment: c.comment.slice(0, 2000), authorType: opts.manualBy ? 'USER' : 'CLIENT', authorId: opts.manualBy?._id, authorName: opts.manualBy ? opts.manualBy.name : body.name || 'Client' });
  a.feedbackCount = (a.feedbackCount || 0) + comments.length;
  await a.save();
  const reason = comments.map((c) => (c.timestampSec != null ? `${fmtTs(c.timestampSec)} ${c.comment}` : c.comment)).join('; ');
  const who = opts.manualBy ? `${opts.manualBy.name} (recorded client decision)` : 'Client';
  const actorId = opts.manualBy?._id;
  const p = { contentId: String(content._id), actorId, version: a.version, reason, approvalId: String(a._id), actorName: who };
  await logActivity({ actorId, actorType: opts.manualBy ? 'USER' : 'CLIENT', action: decision === 'APPROVE' ? 'approval.client.approved' : 'approval.client.changes', message: `${who} ${decision === 'APPROVE' ? 'approved' : 'requested changes on'} ${content.contentId} ${a.version}`, entityType: 'approval', entityId: a._id, contentId: content._id, clientId: content.clientId, ip: opts.ip });
  if (a.type === 'CLIENT_SCRIPT') {
    if (decision === 'APPROVE') {
      await Script.updateOne({ contentId: content._id }, { status: 'FINAL' });
      if (a.scriptVersionId) await ScriptVersion.updateOne({ _id: a.scriptVersionId }, { approvalState: 'CLIENT_APPROVED' });
      if (!(await Shoot.exists({ contentId: content._id }))) await Shoot.create({ contentId: content._id, clientId: content.clientId, shooterId: content.assignedShooter });
      await moveToStage(content, 'SHOOTING', actorId, `Client approved ${a.version}`);
      await postSystemEvent(content._id, 'client.approved', 'CLIENT APPROVAL RECEIVED', [`Content: ${content.title}`, `Version: ${a.version}`, `Approved: ${fmtTime(new Date())}`], {
        action: {
          actionType: 'ASSIGN_SHOOTER',
          title: `Schedule Shoot for ${content.contentId}`,
          description: `Client approved script. Manager or SMM: set shoot date, time, location & shooter.`,
          allowedRoles: ['MANAGER', 'SUPER_ADMIN', 'ADMIN', 'TEAM_LEAD', 'SMM'],
          payload: { contentId: content._id },
        },
      });
      emitDomain('client_script.approved', p);
    } else {
      await Script.updateOne({ contentId: content._id }, { status: 'CHANGES_REQUESTED' });
      await moveToStage(content, 'SCRIPT', actorId, `Client requested changes on ${a.version}`);
      content.status = 'CHANGES_REQUESTED'; await content.save(); await broadcastContent(content);
      await postSystemEvent(content._id, 'client.changes', 'CLIENT CHANGE REQUEST', [a.version, ...comments.map((c) => (c.timestampSec != null ? `${fmtTs(c.timestampSec)}  "${c.comment}"` : `"${c.comment}"`))], {
        action: {
          actionType: 'CREATE_TASK',
          title: `Revise Script: ${content.contentId}`,
          description: `Client requested modifications: ${reason}`,
          allowedRoles: ['SCRIPT_WRITER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
          payload: { contentId: content._id, priority: 'URGENT' },
        },
      });
      emitDomain('client_script.changes_requested', p);
    }
  } else {
    if (decision === 'APPROVE') {
      if (a.mediaId) await Media.updateOne({ _id: a.mediaId }, { status: 'APPROVED' });
      await moveToStage(content, 'SCHEDULE', actorId, `Client approved ${a.version}`);
      await postSystemEvent(content._id, 'client.approved', 'CLIENT APPROVAL RECEIVED', [`Content: ${content.title}`, `Version: ${a.version}`, `Approved: ${fmtTime(new Date())}`], {
        action: {
          actionType: 'CREATE_TASK',
          title: `Schedule Post: ${content.contentId}`,
          description: `Client approved final video. Schedule across social platforms.`,
          allowedRoles: ['SMM', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
          payload: { contentId: content._id, priority: 'HIGH' },
        },
      });
      emitDomain('client.approved', p);
    } else {
      await moveToStage(content, 'EDITING', actorId, `Client requested changes on ${a.version}`);
      content.status = 'CHANGES_REQUESTED'; await content.save(); await broadcastContent(content);
      await postSystemEvent(content._id, 'client.changes', 'CLIENT CHANGE REQUEST', [a.version, ...comments.map((c) => (c.timestampSec != null ? `${fmtTs(c.timestampSec)}  "${c.comment}"` : `"${c.comment}"`))], {
        action: {
          actionType: 'CREATE_TASK',
          title: `Revise Edit: ${content.contentId} (${a.version})`,
          description: `Client requested modifications: ${reason}`,
          allowedRoles: ['EDITOR', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'],
          payload: { contentId: content._id, priority: 'URGENT' },
        },
      });
      emitDomain('client.changes_requested', p);
    }
  }
  broadcast(a);
  return { status: a.status };
}

/** From a communication log: employee explicitly converts a client's WhatsApp reply into a decision */
export async function resolveFromCommunication(u: AuthUser, commId: string, action: 'MARK_APPROVED' | 'CREATE_CHANGE_REQUEST', approvalId: string, comment?: string) {
  const log = await CommunicationLog.findById(commId);
  if (!log) throw notFound('Communication');
  const a = await Approval.findById(approvalId);
  if (!a || String(a.clientId) !== String(log.clientId)) throw badRequest('Choose an open review for this client');
  await clientDecision(a, action === 'MARK_APPROVED' ? 'APPROVE' : 'CHANGES', { comments: action === 'CREATE_CHANGE_REQUEST' ? [{ comment: comment || log.summary }] : [] }, { manualBy: u });
  log.resolution = action === 'MARK_APPROVED' ? 'MARKED_APPROVED' : 'CHANGE_REQUEST_CREATED'; log.contentId = a.contentId as any; await log.save();
  return log;
}

/** 9 AM Daily Review Gate items and status */
export async function getDailyReviewGate(u: AuthUser, dateStr?: string) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const internal = await Approval.find({ type: { $in: ['INTERNAL_SCRIPT', 'SMM', 'FINAL'] }, status: 'PENDING' })
    .populate({ path: 'contentId', select: 'contentId title stage progress clientId deadline', populate: { path: 'clientId', select: 'name' } })
    .populate('reviewerId createdBy', 'name role')
    .populate('mediaId', 'fileName mimeType size version')
    .lean();

  const clientOpen = await Approval.find({ type: { $in: ['CLIENT_SCRIPT', 'CLIENT_FINAL'] }, status: { $in: ['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT'] } })
    .populate({ path: 'contentId', select: 'contentId title stage progress clientId deadline', populate: { path: 'clientId', select: 'name' } })
    .populate('createdBy', 'name')
    .lean();

  let access = await DailyReviewAccess.findOne({ date, reviewerId: u._id }).lean();
  if (!access && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(u.role)) {
    access = (await DailyReviewAccess.create({
      date,
      reviewerId: u._id,
      reviewerRole: u.role,
      totalPending: internal.length,
      status: 'PENDING',
    })).toJSON() as any;
  }

  const signoffs = await DailyReviewAccess.find({ date }).populate('reviewerId', 'name role').lean();

  return {
    date,
    items: { internal, client: clientOpen },
    access,
    signoffs,
    summary: {
      pendingScripts: internal.filter((i: any) => i.type === 'INTERNAL_SCRIPT').length,
      pendingSmm: internal.filter((i: any) => i.type === 'SMM').length,
      pendingFinal: internal.filter((i: any) => i.type === 'FINAL').length,
      waitingClient: clientOpen.length,
      totalInternal: internal.length,
      completedSignoffs: signoffs.filter((s: any) => s.status === 'COMPLETED').length,
    },
  };
}

/** Reviewer / Manager sign-off on 9 AM Daily Review Gate */
export async function signOffDailyReviewGate(u: AuthUser, body: { date?: string; notes?: string; contentsReviewed?: any[] }) {
  const date = body.date || new Date().toISOString().slice(0, 10);
  let access = await DailyReviewAccess.findOne({ date, reviewerId: u._id });
  if (!access) {
    access = new DailyReviewAccess({ date, reviewerId: u._id, reviewerRole: u.role });
  }
  access.status = 'COMPLETED';
  access.completedAt = new Date();
  access.notes = body.notes || 'Daily review gate cleared.';
  if (body.contentsReviewed?.length) {
    access.contentsReviewed = body.contentsReviewed as any;
    access.totalApproved = body.contentsReviewed.filter((c: any) => c.decision === 'APPROVE').length;
    access.totalChanges = body.contentsReviewed.filter((c: any) => c.decision === 'CHANGES').length;
  }
  await access.save();

  await logActivity({
    actorId: u._id,
    action: 'daily_review_gate.signoff',
    message: `${u.name} signed off on 9 AM Daily Review Gate (${date})`,
    entityType: 'dailyReviewGate',
    entityId: String(access._id),
  });

  emitOrg('daily_review_gate:signed', { date, reviewerId: u._id, reviewerName: u.name });
  return access;
}

/** Get WhatsApp notification log records */
export async function getWhatsAppNotificationLogs(opts: { limit?: number; clientId?: string; status?: string } = {}) {
  const q: any = {};
  if (opts.clientId) q.clientId = opts.clientId;
  if (opts.status) q.status = opts.status;
  const items = await WhatsAppNotificationLog.find(q)
    .sort({ createdAt: -1 })
    .limit(opts.limit || 100)
    .populate('clientId', 'name')
    .populate('contentId', 'contentId title')
    .populate('approvalId', 'version type status')
    .lean();
  return items;
}

export { setLastAction };
