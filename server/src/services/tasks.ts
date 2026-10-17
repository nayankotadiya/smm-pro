import { Task, Content, Shoot } from '../models';
import { notify } from './notify';
import { logActivity } from './activity';
import { emitToUser, emitOrg } from './realtime';
import { userName } from './content';

export async function createTask(data: any, opts: { actorId?: any; source?: 'MANUAL' | 'AUTOMATIC' | 'CHAT'; silent?: boolean } = {}) {
  // Idempotency check: if an automatic task of the same kind already exists for this content and is active, return it
  if (data.contentId && data.kind && (opts.source === 'AUTOMATIC' || data.source === 'AUTOMATIC')) {
    const existing = await Task.findOne({
      contentId: data.contentId,
      kind: data.kind,
      status: { $nin: ['COMPLETED', 'CANCELLED'] },
    });
    if (existing) {
      return existing;
    }
  }

  const t = await Task.create({
    ...data,
    source: opts.source || data.source || 'MANUAL',
    createdBy: opts.actorId || data.createdBy,
  });
  const content = t.contentId ? await Content.findById(t.contentId).select('contentId title clientId').lean() : null;
  if (content && !t.clientId) { t.clientId = content.clientId as any; await t.save(); }
  const by = opts.actorId ? await userName(opts.actorId) : 'Automation';
  const assignee = t.assignedTo ? await userName(t.assignedTo) : null;
  const msg = assignee
    ? `${by} created task "${t.title}" assigned to ${assignee}${content ? ` for ${content.contentId}` : ''}`
    : `${by} created task "${t.title}"${content ? ` for ${content.contentId}` : ''}`;
  await logActivity({
    actorId: opts.actorId,
    actorType: opts.actorId ? 'USER' : 'AUTOMATION',
    action: t.assignedTo ? 'task.assigned' : 'task.created',
    message: msg,
    entityType: 'task',
    entityId: t._id,
    contentId: t.contentId,
    clientId: t.clientId,
    meta: { assignedTo: t.assignedTo, assignee },
  });
  if (t.assignedTo && !opts.silent) {
    await notify([t.assignedTo], {
      type: 'task.assigned',
      category: 'TASK',
      title: 'Task assigned',
      message: `${t.title}${content ? ` · ${content.contentId}` : ''}`,
      link: `/tasks/${t._id}`,
      entityType: 'task',
      entityId: t._id,
      contentId: t.contentId,
    }, { excludeUserId: opts.actorId });
    emitToUser(t.assignedTo, 'task:assigned', t.toJSON());
  }
  emitOrg('task:updated', t.toJSON());
  return t;
}

/** Completes open automatic tasks of a kind on a content (e.g. EDIT task closes when edit uploaded) */
export async function closeTasks(contentId: any, kinds: string[]) {
  const open = await Task.find({ contentId, kind: { $in: kinds }, status: { $nin: ['COMPLETED', 'CANCELLED'] } });
  for (const t of open) {
    t.status = 'COMPLETED';
    t.completedAt = new Date();
    await t.save();
    emitOrg('task:completed', t.toJSON());
  }
}

/** Cancels tasks of specified kinds (e.g. cancelled shoot) */
export async function cancelTasks(contentId: any, kinds: string[], reason?: string) {
  const open = await Task.find({ contentId, kind: { $in: kinds }, status: { $nin: ['COMPLETED', 'CANCELLED'] } });
  for (const t of open) {
    t.status = 'CANCELLED';
    t.blockedReason = reason || 'Cancelled';
    await t.save();
    emitOrg('task:updated', t.toJSON());
  }
}

/** Automatically handles stage-based task creation and preceding task closure */
export async function ensureStageTask(content: any, stage: string, actorId?: any) {
  const cid = content._id;
  const cTitle = content.title;
  const cCode = content.contentId;
  const deadlines = content.stageDeadlines || {};

  switch (stage) {
    case 'IDEA':
    case 'BRIEF':
      if (content.assignedWriter) {
        await createTask({
          title: `Prepare brief & concept for ${cCode}: ${cTitle}`,
          kind: 'BRIEF',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedWriter,
          dueAt: deadlines.scriptDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'SCRIPT':
      if (content.assignedWriter) {
        await closeTasks(cid, ['BRIEF']);
        await createTask({
          title: `Write script for ${cCode}: ${cTitle}`,
          kind: 'SCRIPT',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedWriter,
          dueAt: deadlines.scriptDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'INTERNAL_REVIEW':
      await closeTasks(cid, ['SCRIPT', 'SCRIPT_REVISION']);
      if (content.assignedReviewer) {
        await createTask({
          title: `Internal review for ${cCode}: ${cTitle}`,
          kind: 'INTERNAL_REVIEW',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedReviewer,
          dueAt: deadlines.approvalDeadline || content.deadline,
          priority: 'HIGH',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'CLIENT_REVIEW':
      await closeTasks(cid, ['INTERNAL_REVIEW']);
      break;

    case 'VOICE_OVER':
      await closeTasks(cid, ['SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW']);
      if (content.assignedWriter || content.assignedEditor) {
        await createTask({
          title: `Record Voice-Over for ${cCode}: ${cTitle}`,
          kind: 'VOICE_OVER',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedWriter || content.assignedEditor,
          dueAt: deadlines.shootDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'SHOOTING':
      await closeTasks(cid, ['SCRIPT', 'INTERNAL_REVIEW', 'CLIENT_REVIEW', 'VOICE_OVER']);
      if (content.assignedShooter) {
        await createTask({
          title: `Shoot production for ${cCode}: ${cTitle}`,
          kind: 'SHOOT',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedShooter,
          dueAt: deadlines.shootDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'RAW_FOOTAGE':
      await closeTasks(cid, ['SHOOT']);
      if (content.assignedShooter || content.assignedEditor) {
        await createTask({
          title: `Upload raw footage for ${cCode}: ${cTitle}`,
          kind: 'RAW_UPLOAD',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedShooter || content.assignedEditor,
          dueAt: deadlines.editingDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'GRAPHIC_DESIGN':
      await closeTasks(cid, ['SCRIPT', 'BRIEF', 'INTERNAL_REVIEW']);
      if (content.assignedDesigner) {
        await createTask({
          title: `Design graphics & creatives for ${cCode}: ${cTitle}`,
          kind: 'GRAPHIC_DESIGN',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedDesigner,
          dueAt: deadlines.designDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'AI_GENERATION':
      await closeTasks(cid, ['SCRIPT', 'BRIEF']);
      const aiAssignee = content.assignedDesigner || content.assignedEditor || content.assignedWriter;
      if (aiAssignee) {
        await createTask({
          title: `Generate AI creative outputs for ${cCode}: ${cTitle}`,
          kind: 'AI_GENERATION',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: aiAssignee,
          dueAt: deadlines.designDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'EDITING':
      await closeTasks(cid, ['RAW_UPLOAD', 'AI_GENERATION']);
      if (content.assignedEditor) {
        await createTask({
          title: `Edit video for ${cCode}: ${cTitle}`,
          kind: 'EDIT',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedEditor,
          dueAt: deadlines.editingDeadline || content.deadline,
          priority: content.priority || 'MEDIUM',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'SMM_REVIEW':
      await closeTasks(cid, ['EDIT', 'EDIT_REVISION', 'GRAPHIC_DESIGN']);
      if (content.assignedSMM) {
        await createTask({
          title: `SMM review for ${cCode}: ${cTitle}`,
          kind: 'SMM_REVIEW',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedSMM,
          dueAt: deadlines.approvalDeadline || content.deadline,
          priority: 'HIGH',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'FINAL_REVIEW':
    case 'CLIENT_FINAL_APPROVAL':
      await closeTasks(cid, ['SMM_REVIEW']);
      break;

    case 'FINAL_UPLOAD':
      await closeTasks(cid, ['FINAL_REVIEW', 'CLIENT_FINAL_APPROVAL']);
      const uploader = content.assignedEditor || content.assignedDesigner || content.assignedSMM;
      if (uploader) {
        await createTask({
          title: `Final export & upload for ${cCode}: ${cTitle}`,
          kind: 'FINAL_UPLOAD',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: uploader,
          dueAt: deadlines.approvalDeadline || content.deadline,
          priority: 'HIGH',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'SCHEDULE':
      await closeTasks(cid, ['FINAL_UPLOAD', 'CLIENT_FINAL_APPROVAL', 'SMM_REVIEW']);
      if (content.assignedSMM) {
        await createTask({
          title: `Schedule post for ${cCode}: ${cTitle}`,
          kind: 'SCHEDULE',
          contentId: cid,
          clientId: content.clientId,
          assignedTo: content.assignedSMM,
          dueAt: content.plannedPublicationDate || content.deadline,
          priority: 'HIGH',
        }, { actorId, source: 'AUTOMATIC' });
      }
      break;

    case 'PUBLISHED':
      await closeTasks(cid, ['SCHEDULE']);
      break;
  }
}

/** Creates a revision task when feedback or changes are requested */
export async function createRevisionTask(content: any, reason: string, requestedBy: any, stage: 'SCRIPT' | 'EDIT' | 'DESIGN') {
  let kind = 'EDIT_REVISION';
  let assignee = content.assignedEditor;
  let title = `Revisions requested for edit ${content.contentId}`;

  if (stage === 'SCRIPT') {
    kind = 'SCRIPT_REVISION';
    assignee = content.assignedWriter;
    title = `Script revisions requested for ${content.contentId}`;
  } else if (stage === 'DESIGN') {
    kind = 'DESIGN_REVISION';
    assignee = content.assignedDesigner;
    title = `Design revisions requested for ${content.contentId}`;
  }

  if (assignee) {
    return createTask({
      title,
      description: `Client / Manager Feedback: ${reason}`,
      kind,
      contentId: content._id,
      clientId: content.clientId,
      assignedTo: assignee,
      priority: 'URGENT',
      dueAt: new Date(Date.now() + 24 * 3600 * 1000), // 24h revision deadline
      revisionCount: (content.revisionCount || 0) + 1,
    }, { actorId: requestedBy, source: 'AUTOMATIC' });
  }
}

/** Handles cancellation of a shoot: marks shoot cancelled and cleans up open shoot tasks */
export async function handleShootCancelled(contentId: any, reason?: string, actorId?: any) {
  await cancelTasks(contentId, ['SHOOT', 'RAW_UPLOAD'], reason || 'Shoot cancelled');
  await Shoot.findOneAndUpdate({ contentId }, { status: 'CANCELLED' });
  const content = await Content.findById(contentId);
  if (content) {
    content.productionStatus = 'SHOOT_CANCELLED';
    await content.save();
    await logActivity({
      actorId,
      actorType: actorId ? 'USER' : 'SYSTEM',
      action: 'shoot.cancelled',
      message: `Shoot cancelled for ${content.contentId}${reason ? `: ${reason}` : ''}`,
      entityType: 'content',
      entityId: content._id,
      contentId: content._id,
      clientId: content.clientId,
    });
  }
}
