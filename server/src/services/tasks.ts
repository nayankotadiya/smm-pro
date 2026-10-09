import { Task, Content } from '../models';
import { notify } from './notify';
import { logActivity } from './activity';
import { emitToUser, emitOrg } from './realtime';
import { userName } from './content';

export async function createTask(data: any, opts: { actorId?: any; source?: 'MANUAL' | 'AUTOMATIC' | 'CHAT'; silent?: boolean } = {}) {
  const t = await Task.create({ ...data, source: opts.source || data.source || 'MANUAL', createdBy: opts.actorId || data.createdBy });
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
    await notify([t.assignedTo], { type: 'task.assigned', category: 'TASK', title: 'Task assigned', message: `${t.title}${content ? ` · ${content.contentId}` : ''}`, link: `/tasks/${t._id}`, entityType: 'task', entityId: t._id, contentId: t.contentId }, { excludeUserId: opts.actorId });
    emitToUser(t.assignedTo, 'task:assigned', t.toJSON());
  }
  emitOrg('task:updated', t.toJSON());
  return t;
}
/** Completes open automatic tasks of a kind on a content (e.g. EDIT task closes when edit uploaded) */
export async function closeTasks(contentId: any, kinds: string[]) {
  const open = await Task.find({ contentId, kind: { $in: kinds }, status: { $nin: ['COMPLETED'] } });
  for (const t of open) { t.status = 'COMPLETED'; t.completedAt = new Date(); await t.save(); emitOrg('task:completed', t.toJSON()); }
}
