import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Pencil, Plus, ArrowRight, ShieldAlert, GitBranch, Trash2 } from 'lucide-react';
import { get, post, patch, del, errMsg } from '@/lib/api';
import { getSocket, setActivity } from '@/lib/socket';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Priority, Progress, Select, Tabs, Textarea, Avatar, PresenceDot } from '@/components/ui';
import { WorkflowBar, StatusBadge, TaskList, ActivityFeed, PlatformBadge, TypeBadge } from '@/components/Lists';
import { ReasonModal, TaskFormModal, ReminderFormModal } from '@/components/Forms';
import { ScriptTab, ShootingTab, EditingTab, ReviewsTab, FilesTab, ScheduleTab } from '@/features/ContentTabs';
import { ChatThread } from '@/features/ChatThread';
import { useTeam } from '@/hooks/useData';
import { ago, fmtDateTime, isOverdue, label, roleLabel, stageNumber, STAGES, toLocalInput } from '@/lib/format';
import { Row } from './Work';

type Tab = 'overview' | 'script' | 'shooting' | 'editing' | 'reviews' | 'files' | 'schedule' | 'activity' | 'chat';
const TABS: { key: Tab; label: string }[] = [{ key: 'overview', label: 'Overview' }, { key: 'script', label: 'Script' }, { key: 'shooting', label: 'Shooting' }, { key: 'editing', label: 'Editing' }, { key: 'reviews', label: 'Reviews' }, { key: 'files', label: 'Files' }, { key: 'schedule', label: 'Schedule' }, { key: 'activity', label: 'Activity' }, { key: 'chat', label: 'Chat' }];
/** Which tab holds the work for the current stage */
const STAGE_TAB: Record<string, Tab> = { IDEA: 'script', SCRIPT: 'script', INTERNAL_REVIEW: 'script', CLIENT_REVIEW: 'reviews', SHOOTING: 'shooting', RAW_FOOTAGE: 'editing', EDITING: 'editing', SMM_REVIEW: 'editing', FINAL_REVIEW: 'editing', CLIENT_FINAL_APPROVAL: 'reviews', SCHEDULE: 'schedule', PUBLISHED: 'schedule' };

export default function ContentDetail() {
  const { id } = useParams(); const [sp, setSp] = useSearchParams(); const can = useCan(); const qc = useQueryClient(); const nav = useNavigate();
  const { user } = useAuth();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const q = useQuery({ queryKey: ['content-detail', id], queryFn: () => get(`/content/${id}`) });
  const [modal, setModal] = useState<null | 'edit' | 'block' | 'stage' | 'task' | 'reminder' | 'delete'>(null);
  const cid = q.data?.content?._id;
  // live: join this content's room so other people's changes appear without refresh
  useEffect(() => { if (!cid) return; const s = getSocket(); const watch = () => s?.emit('content:watch', cid); watch(); s?.on('connect', watch); return () => { s?.emit('content:unwatch', cid); s?.off('connect', watch); }; }, [cid]);
  useEffect(() => { if (q.data?.content) setActivity(`Viewing ${q.data.content.contentId}`); }, [q.data?.content?.contentId]);
  const inv = () => { qc.invalidateQueries({ queryKey: ['content-detail', id] }); qc.invalidateQueries({ queryKey: ['content'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const block = useMutation({ mutationFn: (reason: string) => post(`/content/${cid}/block`, { reason }), onSuccess: () => { toast.success('Marked as blocked.'); setModal(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const unblock = useMutation({ mutationFn: () => post(`/content/${cid}/unblock`), onSuccess: () => { toast.success('Block removed.'); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const deleteContent = useMutation({
    mutationFn: () => del(`/content/${cid}`),
    onSuccess: () => {
      toast.success('Content deleted permanently.');
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      nav('/content');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Async q={q} rows={8}>{(d: any) => {
      const c = d.content; const blocked = c.status === 'BLOCKED'; const done = c.status === 'COMPLETED';
      const unread = 0;
      return (
        <>
          <PageHeader title={c.title}
            sub={<span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"><span className="font-mono text-[11px] font-bold text-primary-ink bg-primary/10 border border-primary/25 rounded-md px-2 py-0.5">{c.contentId}</span><Link to={`/clients/${c.clientId._id}`} className="font-semibold text-ink hover:text-primary-ink transition-colors">{c.clientId.name}</Link><PlatformBadge p={c.platform} /><TypeBadge t={c.type} /><StatusBadge c={c} /><Priority p={c.priority} /></span>}
            actions={<>
              {blocked ? <Button onClick={() => unblock.mutate()} loading={unblock.isPending}>Remove block</Button> : !done && <Button icon={<Ban size={15} />} onClick={() => setModal('block')}>Mark blocked</Button>}
              {(can('content.write') || can('content.assign')) && <Button icon={<Pencil size={15} />} onClick={() => setModal('edit')}>Edit</Button>}
              {can('content.assign') && <Button variant="primary" icon={<GitBranch size={15} />} onClick={() => setModal('stage')}>Move stage</Button>}
              {(user?.role === 'SUPER_ADMIN' || can('content.delete' as any)) && (
                <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setModal('delete')}>
                  Delete
                </Button>
              )}
            </>} />

          {blocked && <div className="mb-4 flex animate-rise items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" /><div className="text-[13px]"><div className="font-semibold">Blocked {ago(c.blocked?.since)} by {c.blocked?.by?.name}</div><div>{c.blocked?.reason}</div></div></div>}

          <div className="card mb-5 animate-rise p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-[240px] flex-1 items-center gap-3.5">
                <span className="text-[24px] font-bold tabular text-ink dark:text-white">{c.progress}%</span>
                <div className="flex-1">
                  <Progress value={c.progress} tone={blocked ? 'red' : done ? 'green' : 'blue'} className="!h-2.5" />
                  <div className="mt-1 flex items-center gap-2 text-meta font-semibold text-slate-700 dark:text-slate-300">
                    <span>Stage {stageNumber(c.stage)} of {STAGES.length}</span>
                    <span className="text-slate-400 dark:text-slate-600">·</span>
                    <span className="text-primary-ink font-bold">{label(c.stage)}</span>
                  </div>
                </div>
              </div>
              <div className={`text-[13px] font-semibold ${isOverdue(c.deadline, done) ? 'text-danger' : 'text-slate-700 dark:text-slate-300'}`}>
                {c.deadline ? `Deadline ${fmtDateTime(c.deadline)}` : 'No deadline'}
              </div>
            </div>
            <WorkflowBar
              stage={c.stage}
              blocked={blocked}
              onSelectStage={(stg) => {
                const targetTab = STAGE_TAB[stg];
                if (targetTab) setSp({ tab: targetTab }, { replace: true });
              }}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <div className="min-w-0">
              <Tabs tabs={TABS.map((t) => ({ ...t, count: t.key === 'reviews' ? d.approvals.filter((a: any) => a.status === 'PENDING').length : t.key === 'files' ? d.media.length : t.key === 'chat' ? unread : undefined }))} value={tab} onChange={(k) => setSp(k === 'overview' ? {} : { tab: k }, { replace: true })} />
              <div key={tab} className="animate-rise">
              {tab === 'overview' && <Overview d={d} onTask={() => setModal('task')} onReminder={() => setModal('reminder')} go={(t) => setSp({ tab: t }, { replace: true })} />}
              {tab === 'script' && <ScriptTab d={d} />}
              {tab === 'shooting' && <ShootingTab d={d} />}
              {tab === 'editing' && <EditingTab d={d} />}
              {tab === 'reviews' && <ReviewsTab d={d} />}
              {tab === 'files' && <FilesTab d={d} />}
              {tab === 'schedule' && <ScheduleTab d={d} />}
              {tab === 'activity' && <Card pad={false}><ActivityFeed items={d.activity} /></Card>}
              {tab === 'chat' && <ChatThread roomId={d.roomId} embedded />}
              </div>
            </div>
            <aside className="space-y-5">
              <Card title="Status">
                <dl className="space-y-3 text-[13px]">
                  <div><dt className="text-meta uppercase tracking-wide text-ink-3">Last action</dt><dd className="mt-0.5 font-medium text-ink">{c.lastAction?.text || '—'}{c.lastAction?.at && <span className="text-ink-3"> · {ago(c.lastAction.at)}</span>}</dd></div>
                  <div><dt className="text-meta uppercase tracking-wide text-ink-3">Current owner</dt><dd className="mt-1"><Person u={c.currentOwner} /></dd></div>
                  <div><dt className="text-meta uppercase tracking-wide text-ink-3">Next action</dt><dd className="mt-0.5 font-medium text-ink">{blocked ? `Resolve block: ${c.blocked?.reason}` : c.nextAction}</dd></div>
                  <div><dt className="text-meta uppercase tracking-wide text-ink-3">Next owner</dt><dd className="mt-1"><Person u={c.nextOwner} /></dd></div>
                  <div className="border-t border-line pt-3"><Row k="Deadline" v={c.deadline ? fmtDateTime(c.deadline) : '—'} danger={isOverdue(c.deadline, done)} /></div>
                  <Row k="Latest version" v={c.currentVideoVersion ? c.currentVideoVersion.replace('_', ' ') : c.currentScriptVersion ? `Script V${c.currentScriptVersion}` : '—'} />
                  {c.campaignId && <Row k="Campaign" v={c.campaignId.name} />}
                </dl>
                {!done && STAGE_TAB[c.stage] !== tab && <Button className="mt-4 w-full" variant="primary" onClick={() => setSp({ tab: STAGE_TAB[c.stage] }, { replace: true })}>Go to {label(c.stage)}<ArrowRight size={15} /></Button>}
              </Card>
              <Card title="Team">
                <ul className="space-y-2.5 text-[13px]">{([['Writer', c.assignedWriter], ['Shooter', c.assignedShooter], ['Editor', c.assignedEditor], ['SMM', c.assignedSMM], ['Reviewer', c.assignedReviewer]] as [string, any][]).map(([r, u]) => <li key={r} className="flex items-center justify-between gap-2"><span className="font-medium text-ink-2">{r}</span>{u ? <Link to={`/team/${u._id}`} className="flex items-center gap-1.5 font-semibold text-ink hover:text-primary-ink"><PresenceDot userId={u._id} />{u.name}</Link> : <span className="text-ink-3">Unassigned</span>}</li>)}</ul>
              </Card>
            </aside>
          </div>

          <EditContent open={modal === 'edit'} onClose={() => setModal(null)} c={c} onSaved={inv} />
          <MoveStage open={modal === 'stage'} onClose={() => setModal(null)} c={c} onSaved={inv} />
          <ReasonModal open={modal === 'block'} onClose={() => setModal(null)} title="Mark content as blocked" label="What is blocking this content?" cta="Mark blocked" danger loading={block.isPending} onSubmit={(r) => block.mutate(r)} />
          <TaskFormModal open={modal === 'task'} onClose={() => setModal(null)} contentId={c._id} clientId={c.clientId._id} />
          <ReminderFormModal open={modal === 'reminder'} onClose={() => { setModal(null); inv(); }} preset={{ contentId: c._id, clientId: c.clientId._id, type: 'CONTENT', title: `${c.contentId}: ` }} />
          <Modal
            open={modal === 'delete'}
            onClose={() => setModal(null)}
            title={`Delete ${c.contentId}`}
            footer={
              <>
                <Button onClick={() => setModal(null)}>Cancel</Button>
                <Button variant="danger" loading={deleteContent.isPending} onClick={() => deleteContent.mutate()}>
                  Permanently Delete
                </Button>
              </>
            }
          >
            <div className="space-y-3 text-[14px]">
              <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-rose-500 font-medium">
                ⚠️ Are you sure you want to delete <b>{c.title}</b> ({c.contentId})?
              </div>
              <p className="text-ink-2">
                This will permanently remove this content item along with its scripts, shot plans, editor tasks, client reviews, messages, and uploaded files. This action cannot be undone.
              </p>
            </div>
          </Modal>
        </>
      );
    }}</Async>
  );
}
function Person({ u }: { u: any }) { return u ? <span className="flex items-center gap-2"><Avatar name={u.name} size={24} /><span><span className="font-semibold text-ink">{u.name}</span><span className="text-ink-2"> — {roleLabel(u.role)}</span></span></span> : <span className="text-ink-3">Unassigned</span>; }

function Overview({ d, onTask, onReminder, go }: { d: any; onTask: () => void; onReminder: () => void; go: (t: Tab) => void }) {
  const c = d.content; const openTasks = d.tasks.filter((t: any) => t.status !== 'COMPLETED');
  return (
    <div className="space-y-5">
      <Card title="Brief">{c.description ? <p className="whitespace-pre-wrap font-medium text-ink">{c.description}</p> : <p className="text-ink-3">No brief written yet.</p>}
        {(c.caption || c.hashtags) && <div className="mt-3 border-t border-line pt-3 text-[13px]"><div className="text-meta font-medium text-ink-2">Caption</div><p className="whitespace-pre-wrap font-medium text-ink">{c.caption}</p>{c.hashtags && <p className="mt-1 font-medium text-primary-ink">{c.hashtags}</p>}</div>}</Card>
      <Card title={`Tasks (${openTasks.length} open)`} pad={false} action={<Button size="sm" icon={<Plus size={14} />} onClick={onTask}>Task</Button>}><TaskList tasks={[...openTasks, ...d.tasks.filter((t: any) => t.status === 'COMPLETED').slice(0, 5)]} emptyText="No tasks yet. They are created automatically as the workflow moves." /></Card>
      <Card title="Reminders" pad={false} action={<Button size="sm" icon={<Plus size={14} />} onClick={onReminder}>Reminder</Button>}>{!d.reminders.length ? <Empty title="No reminders" /> : <ul className="divide-y divide-line">{d.reminders.map((r: any) => <li key={r._id} className="flex justify-between gap-3 px-4 py-2.5"><span className="font-medium text-ink">{r.title}</span><span className="shrink-0 text-meta font-medium text-ink-2">{fmtDateTime(r.remindAt)}</span></li>)}</ul>}</Card>
      <Card title="Recent activity" pad={false} action={<button className="link text-[13px]" onClick={() => go('activity')}>View all</button>}><ActivityFeed items={d.activity} limit={6} /></Card>
    </div>
  );
}

function EditContent({ open, onClose, c, onSaved }: { open: boolean; onClose: () => void; c: any; onSaved: () => void }) {
  const team = useTeam(); const can = useCan(); const [v, setV] = useState<any>({});
  useEffect(() => { if (open) setV({ title: c.title, priority: c.priority, deadline: toLocalInput(c.deadline), description: c.description || '', type: c.type, platform: c.platform, assignedWriter: c.assignedWriter?._id || '', assignedShooter: c.assignedShooter?._id || '', assignedEditor: c.assignedEditor?._id || '', assignedSMM: c.assignedSMM?._id || '', assignedReviewer: c.assignedReviewer?._id || '' }); }, [open]); // eslint-disable-line
  const m = useMutation({
    mutationFn: () => { const b: any = { title: v.title, priority: v.priority, description: v.description, type: v.type, platform: v.platform, deadline: v.deadline ? new Date(v.deadline).toISOString() : null }; if (!can('content.write')) Object.keys(b).forEach((k) => delete b[k]); if (can('content.assign')) ['assignedWriter', 'assignedShooter', 'assignedEditor', 'assignedSMM', 'assignedReviewer'].forEach((k) => { b[k] = v[k] || null; }); return patch(`/content/${c._id}`, b); },
    onSuccess: () => { toast.success('Content updated.'); onSaved(); onClose(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const set = (k: string) => (e: any) => setV((s: any) => ({ ...s, [k]: e.target.value }));
  const people = (roles: string[]) => (team.data || []).filter((u) => roles.includes(u.role) || ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TEAM_LEAD'].includes(u.role));
  const A = (k: string, l: string, roles: string[]) => <Field label={l}><Select value={v[k] || ''} onChange={set(k)}><option value="">Unassigned</option>{people(roles).map((u) => <option key={u._id} value={u._id}>{u.name} — {roleLabel(u.role)}</option>)}</Select></Field>;
  return (
    <Modal open={open} onClose={onClose} title="Edit content" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>Save changes</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {can('content.write') && <>
          <div className="sm:col-span-2"><Field label="Title"><Input value={v.title || ''} onChange={set('title')} /></Field></div>
          <Field label="Priority"><Select value={v.priority} onChange={set('priority')}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((x) => <option key={x} value={x}>{roleLabel(x)}</option>)}</Select></Field>
          <Field label="Deadline"><Input type="datetime-local" value={v.deadline || ''} onChange={set('deadline')} /></Field>
          <div className="sm:col-span-2"><Field label="Brief"><Textarea value={v.description || ''} onChange={set('description')} /></Field></div>
        </>}
        {can('content.assign') && <><div className="text-meta font-semibold uppercase tracking-wide text-ink-2 sm:col-span-2">Assignments</div>{A('assignedWriter', 'Writer', ['SCRIPT_WRITER'])}{A('assignedShooter', 'Shooter', ['SHOOTER'])}{A('assignedEditor', 'Editor', ['EDITOR', 'DESIGNER'])}{A('assignedSMM', 'SMM', ['SMM'])}{A('assignedReviewer', 'Reviewer', [])}</>}
      </div>
    </Modal>
  );
}
function MoveStage({ open, onClose, c, onSaved }: { open: boolean; onClose: () => void; c: any; onSaved: () => void }) {
  const [stage, setStage] = useState(c.stage); const [reason, setReason] = useState('');
  useEffect(() => { if (open) { setStage(c.stage); setReason(''); } }, [open]); // eslint-disable-line
  const m = useMutation({ mutationFn: () => post(`/content/${c._id}/stage`, { stage, reason }), onSuccess: () => { toast.success('Stage updated.'); onSaved(); onClose(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Modal open={open} onClose={onClose} title="Move stage manually" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={stage === c.stage || reason.trim().length < 3} onClick={() => m.mutate()}>Move</Button></>}>
      <p className="mb-3 text-ink-2">Stages normally move on their own as people submit, upload and approve. Use this only to correct the record. It is logged and posted to the content chat.</p>
      <div className="space-y-3"><Field label="Stage"><Select value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s, i) => <option key={s} value={s}>{i + 1}. {label(s)}</option>)}</Select></Field><Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
    </Modal>
  );
}
export { Badge };
