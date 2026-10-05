import { Automation, AutomationRun, Content, Reminder, User } from '../models';
import { bus, DomainEvent, EventPayload } from './events';
import { createTask } from './tasks';
import { notify, managerIds, idsByRole } from './notify';
import { emitOrg } from './realtime';
import { logActivity } from './activity';

/**
 * WHEN <trigger> THEN <actions>.
 * Action types:
 *  create_task    { assignee: 'writer'|'shooter'|'editor'|'smm'|'reviewer'|'owner', kind, title, dueInHours, priority }
 *  notify         { to: ['editor','managers','smm',...], title, message, category }
 *  create_reminder{ to: 'reviewer'|'owner'|..., title, inHours, type }
 * Templates: {contentId} {title} {version} {actor} {reason}
 */
const FIELD: Record<string, string> = { writer: 'assignedWriter', shooter: 'assignedShooter', editor: 'assignedEditor', smm: 'assignedSMM', reviewer: 'assignedReviewer', owner: 'currentOwner', creator: 'createdBy' };

async function resolve(target: string, content: any, p: EventPayload): Promise<string[]> {
  if (target === 'managers') return managerIds();
  if (target === 'actor') return p.actorId ? [String(p.actorId)] : [];
  if (target === 'assignee') return p.assigneeId ? [String(p.assigneeId)] : [];
  if (target.startsWith('role:')) return idsByRole(target.slice(5));
  const f = FIELD[target];
  if (f && content?.[f]) return [String(content[f])];
  if (f && content) { // fallback to role if not assigned so work is never lost
    const roleMap: Record<string, string> = { writer: 'SCRIPT_WRITER', shooter: 'SHOOTER', editor: 'EDITOR', smm: 'SMM' };
    return roleMap[target] ? idsByRole(roleMap[target]) : managerIds();
  }
  return [];
}
function fill(t: string, content: any, p: EventPayload) {
  return (t || '').replace(/\{contentId\}/g, content?.contentId || '').replace(/\{title\}/g, content?.title || '')
    .replace(/\{version\}/g, p.version || '').replace(/\{actor\}/g, p.actorName || 'Someone').replace(/\{reason\}/g, p.reason || p.comment || '').replace(/\{task\}/g, p.taskTitle || '');
}
const link = (content: any, tab?: string) => (content ? `/content/${content._id}${tab ? `?tab=${tab}` : ''}` : '/');

export async function runAutomation(a: any, event: string, p: EventPayload) {
  const started = Date.now();
  const content = p.contentId ? await Content.findById(p.contentId) : null;
  if (p.actorId && !p.actorName) p.actorName = (await User.findById(p.actorId).select('name').lean())?.name;
  const done: string[] = [];
  try {
    if (a.conditions?.contentType && content && content.type !== a.conditions.contentType) {
      await AutomationRun.create({ automationId: a._id, automationName: a.name, trigger: event, contentId: content?._id, result: 'SKIPPED', durationMs: 0 });
      return;
    }
    for (const act of a.actions) {
      const prm = act.params || {};
      if (act.type === 'create_task') {
        const [assignee] = await resolve(prm.assignee || 'owner', content, p);
        await createTask({ title: fill(prm.title, content, p), description: fill(prm.description || '', content, p), contentId: content?._id, clientId: content?.clientId, assignedTo: assignee, kind: prm.kind || 'GENERAL', priority: prm.priority || content?.priority || 'MEDIUM', dueAt: prm.dueInHours ? new Date(Date.now() + prm.dueInHours * 3600e3) : content?.deadline, automationId: a._id }, { source: 'AUTOMATIC' });
        done.push(`Task created: ${fill(prm.title, content, p)}`);
      } else if (act.type === 'notify') {
        const ids = (await Promise.all((prm.to || []).map((t: string) => resolve(t, content, p)))).flat();
        await notify(ids, { type: event, category: prm.category || 'WORKFLOW', title: fill(prm.title, content, p), message: fill(prm.message || '', content, p), link: prm.link ? fill(prm.link, content, p) : link(content, prm.tab), entityType: content ? 'content' : undefined, entityId: content?._id, contentId: content?._id }, { excludeUserId: prm.includeActor ? undefined : p.actorId });
        done.push(`Notified ${prm.to.join(', ')}`);
      } else if (act.type === 'create_reminder') {
        const ids = await resolve(prm.to || 'owner', content, p);
        for (const uid of ids) await Reminder.create({ title: fill(prm.title, content, p), type: prm.type || 'CONTENT', userId: uid, contentId: content?._id, clientId: content?.clientId, approvalId: p.approvalId, remindAt: new Date(Date.now() + (prm.inHours ?? 0) * 3600e3), priority: prm.priority || 'HIGH', source: 'AUTOMATIC' });
        done.push('Reminder created');
      }
    }
    a.lastRunAt = new Date(); a.lastResult = 'SUCCESS'; a.lastError = undefined; a.runCount++; await a.save();
    const run = await AutomationRun.create({ automationId: a._id, automationName: a.name, trigger: event, contentId: content?._id, actions: done, result: 'SUCCESS', durationMs: Date.now() - started });
    emitOrg('automation:executed', run.toJSON());
  } catch (e: any) {
    a.lastRunAt = new Date(); a.lastResult = 'FAILED'; a.lastError = String(e.message || e).slice(0, 500); a.failCount++; a.runCount++; await a.save();
    const run = await AutomationRun.create({ automationId: a._id, automationName: a.name, trigger: event, contentId: content?._id, actions: done, result: 'FAILED', error: a.lastError, durationMs: Date.now() - started });
    emitOrg('automation:failed', run.toJSON());
    await logActivity({ actorType: 'AUTOMATION', action: 'automation.failed', message: `Automation "${a.name}" failed`, contentId: content?._id, meta: { error: a.lastError } });
  }
}

export async function handleEvent(event: DomainEvent, p: EventPayload) {
  const list = await Automation.find({ trigger: event, active: true });
  for (const a of list) await runAutomation(a, event, p);
}
export function startAutomationEngine() {
  bus.on('domain', (e: DomainEvent, p: EventPayload) => { handleEvent(e, p).catch((err) => console.error('[automation]', err)); });
}

export const DEFAULT_AUTOMATIONS = [
  { key: 'script_submitted', name: 'Script submitted → Notify reviewer', trigger: 'script.submitted', actions: [{ type: 'notify', params: { to: ['reviewer', 'managers'], title: 'Script review required', message: '{contentId} · {title} · {version}', category: 'APPROVAL', tab: 'script' } }] },
  { key: 'script_changes', name: 'Script changes requested → Revision task', trigger: 'script.changes_requested', actions: [{ type: 'create_task', params: { assignee: 'writer', kind: 'SCRIPT_REVISION', title: 'Revise script {version} · {title}', description: '{reason}', dueInHours: 24, priority: 'HIGH' } }] },
  { key: 'script_approved', name: 'Script approved → Notify team', trigger: 'script.approved', actions: [{ type: 'notify', params: { to: ['writer', 'managers'], title: 'Script approved', message: '{contentId} · {version} approved by {actor}', category: 'APPROVAL', tab: 'script' } }] },
  { key: 'client_script_approved', name: 'Client approved script → Create shooting task', trigger: 'client_script.approved', actions: [{ type: 'create_task', params: { assignee: 'shooter', kind: 'SHOOT', title: 'Shoot {title}', dueInHours: 72 } }, { type: 'notify', params: { to: ['shooter', 'managers'], title: 'Ready for shooting', message: '{contentId} · {title}', category: 'WORKFLOW', tab: 'shooting' } }] },
  { key: 'client_script_changes', name: 'Client changes on script → Revision task', trigger: 'client_script.changes_requested', actions: [{ type: 'create_task', params: { assignee: 'writer', kind: 'SCRIPT_REVISION', title: 'Client changes: script for {title}', description: '{reason}', dueInHours: 24, priority: 'HIGH' } }, { type: 'notify', params: { to: ['writer', 'managers'], title: 'Client requested script changes', message: '{contentId} · {reason}', category: 'APPROVAL', tab: 'reviews' } }] },
  { key: 'raw_uploaded', name: 'Raw video uploaded → Editor task + notify', trigger: 'raw.uploaded', actions: [{ type: 'create_task', params: { assignee: 'editor', kind: 'EDIT', title: 'Edit {title}', description: 'Raw footage {version} uploaded by {actor}', dueInHours: 48 } }, { type: 'notify', params: { to: ['editor', 'managers'], title: 'Raw footage uploaded', message: '{actor} uploaded {version} for {contentId}', category: 'FILES', tab: 'files' } }] },
  { key: 'edit_uploaded', name: 'Edit uploaded → SMM review task + notify', trigger: 'edit.uploaded', actions: [{ type: 'create_task', params: { assignee: 'smm', kind: 'SMM_REVIEW', title: 'Review {version} · {title}', dueInHours: 24 } }, { type: 'notify', params: { to: ['smm', 'managers'], title: 'New edit uploaded', message: '{actor} uploaded {version} for {contentId}', category: 'FILES', tab: 'editing' } }] },
  { key: 'smm_changes', name: 'SMM requested changes → Revision task', trigger: 'smm.changes_requested', actions: [{ type: 'create_task', params: { assignee: 'editor', kind: 'EDIT_REVISION', title: 'Revise edit {version} · {title}', description: '{reason}', dueInHours: 24, priority: 'HIGH' } }] },
  { key: 'smm_approved', name: 'SMM approved → Final review', trigger: 'smm.approved', actions: [{ type: 'create_task', params: { assignee: 'reviewer', kind: 'FINAL_REVIEW', title: 'Final review {version} · {title}', dueInHours: 24 } }, { type: 'notify', params: { to: ['reviewer', 'editor'], title: 'SMM approved edit', message: '{contentId} {version} is ready for final review', category: 'APPROVAL', tab: 'reviews' } }] },
  { key: 'final_changes', name: 'Final review changes → Revision task', trigger: 'final.changes_requested', actions: [{ type: 'create_task', params: { assignee: 'editor', kind: 'EDIT_REVISION', title: 'Final review changes · {title}', description: '{reason}', dueInHours: 24, priority: 'HIGH' } }] },
  { key: 'final_approved', name: 'Final review approved → Send client review', trigger: 'final.approved', actions: [{ type: 'notify', params: { to: ['reviewer', 'smm', 'managers'], title: 'Final approved — send to client', message: '{contentId} {version} is ready for client final approval', category: 'APPROVAL', tab: 'reviews' } }] },
  { key: 'client_approved', name: 'Client approves → Scheduling task', trigger: 'client.approved', actions: [{ type: 'create_task', params: { assignee: 'smm', kind: 'SCHEDULE', title: 'Schedule {title}', dueInHours: 24, priority: 'HIGH' } }, { type: 'notify', params: { to: ['smm', 'managers'], title: 'Client approval received', message: '{contentId} {version} approved by client', category: 'APPROVAL', tab: 'reviews', includeActor: true } }] },
  { key: 'client_changes', name: 'Client requests changes → Revision task', trigger: 'client.changes_requested', actions: [{ type: 'create_task', params: { assignee: 'editor', kind: 'EDIT_REVISION', title: 'Client changes · {title}', description: '{reason}', dueInHours: 24, priority: 'URGENT' } }, { type: 'notify', params: { to: ['editor', 'managers'], title: 'Client requested changes', message: '{contentId}: {reason}', category: 'APPROVAL', tab: 'reviews', includeActor: true } }] },
  { key: 'task_overdue', name: 'Task overdue → Notify manager', trigger: 'task.overdue', actions: [{ type: 'notify', params: { to: ['assignee', 'managers'], title: 'Task overdue', message: '{task}', category: 'DEADLINE', link: '/tasks', includeActor: true } }] },
  { key: 'approval_24h', name: 'Client approval pending >24h → Follow-up reminder', trigger: 'approval.pending_24h', actions: [{ type: 'create_reminder', params: { to: 'reviewer', title: 'Follow up with client: {title} {version}', inHours: 0, type: 'APPROVAL' } }] },
  { key: 'content_published', name: 'Published → Notify team', trigger: 'content.published', actions: [{ type: 'notify', params: { to: ['managers', 'smm'], title: 'Content published', message: '{contentId} · {title}', category: 'WORKFLOW', includeActor: true } }] },
];
export async function seedAutomations() {
  for (const a of DEFAULT_AUTOMATIONS) await Automation.updateOne({ key: a.key }, { $setOnInsert: { ...a, system: true, active: true } }, { upsert: true });
}
