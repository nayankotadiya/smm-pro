import { Script, ScriptVersion, Content, Approval } from '../models';
import { AuthUser } from '../middleware/auth';
import { badRequest, notFound } from '../utils/errors';
import { moveToStage, setLastAction, broadcastContent } from './content';
import { logActivity } from './activity';
import { postSystemEvent } from './chat';
import { emitDomain } from './events';
import { closeTasks } from './tasks';
import { emitOrg } from './realtime';

const FIELDS = ['hook', 'scenes', 'dialogue', 'visualDirection', 'broll', 'cta', 'captionNotes', 'music', 'duration', 'changes'];

/** Never overwrites: every save of an approved/submitted version creates a new version. Drafts can be edited in place. */
export async function saveVersion(scriptId: string, data: any, u: AuthUser, forceNew = false) {
  const script = await Script.findById(scriptId);
  if (!script) throw notFound('Script');
  const content = await Content.findById(script.contentId);
  const latest = await ScriptVersion.findOne({ scriptId }).sort({ version: -1 });
  const pick = Object.fromEntries(FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));
  let v;
  if (latest && latest.status === 'DRAFT' && !forceNew) {
    Object.assign(latest, pick); v = await latest.save();
  } else {
    const n = (latest?.version || 0) + 1;
    v = await ScriptVersion.create({ ...(latest ? Object.fromEntries(FIELDS.map((f) => [f, (latest as any)[f]])) : {}), ...pick, scriptId, contentId: script.contentId, version: n, label: `V${n}`, createdBy: u._id, status: 'DRAFT' });
    script.currentVersion = n; script.status = 'DRAFT'; await script.save();
    content!.currentScriptVersion = n;
    await logActivity({ actorId: u._id, action: 'script.version', message: `${u.name} created Script V${n} for ${content!.contentId}`, entityType: 'script', entityId: script._id, contentId: content!._id, clientId: content!.clientId });
  }
  if (content && content.stage === 'IDEA') await moveToStage(content, 'SCRIPT', u._id, `${u.name} started Script ${v.label}`);
  else if (content) { await setLastAction(content, `${u.name} updated Script ${v.label}`, u._id); await content.save(); await broadcastContent(content); }
  emitOrg('script:updated', { scriptId, contentId: String(script.contentId) });
  return v;
}

export async function submitScript(scriptId: string, u: AuthUser) {
  const script = await Script.findById(scriptId);
  if (!script) throw notFound('Script');
  const v = await ScriptVersion.findOne({ scriptId }).sort({ version: -1 });
  if (!v) throw badRequest('Write the script before submitting');
  if (v.status === 'SUBMITTED') throw badRequest('This version is already in review');
  if (v.status !== 'DRAFT') throw badRequest('Create a new version before resubmitting');
  if (!v.hook && !(v.scenes || []).length && !v.dialogue) throw badRequest('Script is empty');
  v.status = 'SUBMITTED'; v.approvalState = 'PENDING'; await v.save();
  script.status = 'IN_REVIEW'; await script.save();
  const content = (await Content.findById(script.contentId))!;
  await Approval.updateMany({ contentId: content._id, type: 'INTERNAL_SCRIPT', status: 'PENDING' }, { status: 'CANCELLED', $push: { history: { status: 'CANCELLED', note: 'Superseded by new version' } } });
  const ap = await Approval.create({ contentId: content._id, clientId: content.clientId, type: 'INTERNAL_SCRIPT', version: `Script ${v.label}`, scriptVersionId: v._id, status: 'PENDING', reviewerId: content.assignedReviewer, createdBy: u._id, sentAt: new Date(), history: [{ status: 'SUBMITTED', by: u._id }] });
  await closeTasks(content._id, ['SCRIPT_REVISION']);
  await moveToStage(content, 'INTERNAL_REVIEW', u._id, `${u.name} submitted Script ${v.label} for review`);
  await logActivity({ actorId: u._id, action: 'script.submitted', message: `${u.name} submitted Script ${v.label} for ${content.contentId}`, entityType: 'approval', entityId: ap._id, contentId: content._id, clientId: content.clientId });
  await postSystemEvent(content._id, 'script.submitted', `SCRIPT ${v.label} SUBMITTED`, [`Submitted by ${u.name}`, 'Status: Internal Review'], {
    action: {
      actionType: 'APPROVE_SCRIPT',
      title: `Review Script ${v.label}`,
      description: `Submitted by ${u.name}. Approve or request changes.`,
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD'],
      payload: { approvalId: ap._id, version: `Script ${v.label}` },
    },
  });
  emitDomain('script.submitted', { contentId: String(content._id), actorId: u._id, version: `Script ${v.label}`, approvalId: String(ap._id) });
  emitOrg('approval:new', ap.toJSON());
  return ap;
}
