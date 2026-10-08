import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, CheckCircle2, Circle, Trash2, ArrowRight, MessageSquare, Repeat, Sparkles, Send } from 'lucide-react';
import { get, post, patch, del, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { useUI, toast } from '@/store/ui';
import { Async, Avatar, Badge, BarList, Button, Card, Empty, Field, Input, Modal, PageHeader, PresenceDot, Progress, Select, Stat, Table, Tabs, Textarea, IconButton } from '@/components/ui';
import { ReminderFormModal } from '@/components/Forms';
import { ActivityFeed, ContentTable, TaskList } from '@/components/Lists';
import { NotificationRow, useNotificationActions } from '@/components/Header';
import { ago, fmtDateTime, fmtSize, label, roleLabel } from '@/lib/format';
import { useTeam } from '@/hooks/useData';
import { PresenceLabel } from './Dashboard';
import { TestNotificationButton } from '@/components/NotificationBanner';
import { ClientReportModal } from '@/components/ClientReportModal';
import { CustomNotificationModal } from '@/components/CustomNotificationModal';

// ------------------------------------------------------------ Reminders
export function Reminders() {
  const qc = useQueryClient(); const [sp] = useSearchParams(); const focus = sp.get('id'); const [open, setOpen] = useState(false); const [tab, setTab] = useState<'upcoming' | 'done'>('upcoming');
  const q = useQuery({ queryKey: ['reminders', tab], queryFn: () => get<any[]>('/reminders', { completed: tab === 'done' ? 1 : 0 }) });
  const inv = () => { qc.invalidateQueries({ queryKey: ['reminders'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const upd = useMutation({ mutationFn: ({ id, ...b }: any) => patch(`/reminders/${id}`, b), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  const rm = useMutation({ mutationFn: (id: string) => del(`/reminders/${id}`), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  return (
    <>
      <PageHeader title="Reminders" sub="Follow-ups, meetings and deadlines. You are notified in the app and by push when one is due." actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>New reminder</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'done', label: 'Completed' }]} />
      <Card pad={false}><Async q={q} empty={<Empty title={tab === 'done' ? 'No completed reminders' : 'No reminders'} hint={tab === 'upcoming' ? 'Create one here, from a chat message, or by setting a follow-up date on a client communication.' : undefined} />}>{(d: any[]) => (
        <ul className="divide-y divide-line">{d.map((r) => { const due = !r.completed && new Date(r.remindAt) < new Date(); return (
          <li key={r._id} className={clsx('flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors', focus === r._id && 'bg-primary-soft/60')}>
            <button aria-label={r.completed ? 'Mark not done' : 'Mark done'} onClick={() => upd.mutate({ id: r._id, completed: !r.completed })} className="-m-1.5 p-1.5 text-ink-3 hover:text-success">{r.completed ? <CheckCircle2 size={19} className="text-success" /> : <Circle size={19} />}</button>
            <div className="min-w-0 flex-1"><div className={clsx('font-semibold', r.completed ? 'text-ink-3 line-through' : 'text-ink')}>{r.title}</div>{r.description && <div className="text-[13px] font-medium text-ink-2">{r.description}</div>}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta font-medium text-ink-2"><span className={clsx(due && 'font-semibold text-danger')}>{fmtDateTime(r.remindAt)}</span><span>{label(r.type)}</span>{r.repeat !== 'NONE' && <span className="flex items-center gap-1"><Repeat size={12} />{label(r.repeat)}</span>}{r.contentId && <Link className="font-mono text-ink-3 hover:text-primary-ink" to={`/content/${r.contentId._id}`}>{r.contentId.contentId}</Link>}{r.clientId && <Link className="hover:text-primary-ink" to={`/clients/${r.clientId._id}`}>{r.clientId.name}</Link>}{r.source !== 'MANUAL' && <span className="text-ink-3">{r.source === 'CHAT' ? 'From chat' : 'Automatic'}</span>}</div></div>
            <div className="flex shrink-0 items-center gap-1">{due && <Button size="sm" onClick={() => upd.mutate({ id: r._id, snoozeMinutes: 60 })}>Snooze 1 h</Button>}<IconButton label="Delete" onClick={() => rm.mutate(r._id)}><Trash2 size={15} /></IconButton></div>
          </li>); })}</ul>
      )}</Async></Card>
      <ReminderFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ------------------------------------------------------------ Automation
const TARGETS = ['writer', 'shooter', 'editor', 'smm', 'reviewer', 'owner', 'managers', 'actor'];
const describe = (a: any) => { const p = a.params || {}; return a.type === 'create_task' ? `Create task for ${p.assignee || 'owner'}: "${p.title}"` : a.type === 'notify' ? `Notify ${(p.to || []).join(', ')}: "${p.title}"` : `Create reminder for ${p.to || 'owner'}: "${p.title}"`; };
export function Automation() {
  const qc = useQueryClient(); const can = useCan(); const manage = can('automations.manage');
  const q = useQuery({ queryKey: ['automations', 'list'], queryFn: () => get('/automations') });
  const runs = useQuery({ queryKey: ['automations', 'runs'], queryFn: () => get<any[]>('/automations/runs') });
  const [open, setOpen] = useState(false); const [errOf, setErrOf] = useState<any>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['automations'] });
  const toggle = useMutation({ mutationFn: (a: any) => patch(`/automations/${a._id}`, { active: !a.active }), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  return (
    <>
      <PageHeader title="Automation" sub="Simple WHEN / THEN rules that create tasks, notify people and set reminders as work moves." actions={manage && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>New rule</Button>} />
      <Card title="Automation health" pad={false} className="mb-5"><Async q={q}>{(d: any) => (
        <Table head={['Automation', 'When', 'Then', 'Status', 'Last run', 'Last result', '']} minWidth={980}>
          {d.automations.map((a: any) => <tr key={a._id} className="align-top hover:bg-surface-2 transition-colors"><td className="td font-semibold text-ink">{a.name}</td><td className="td whitespace-nowrap font-medium text-ink-2">{label(a.trigger.replace(/\./g, '_'))}</td><td className="td text-[13px] font-medium text-ink-2">{a.actions.map((x: any, i: number) => <div key={i}>{describe(x)}</div>)}</td><td className="td"><Badge t={a.active ? 'green' : 'neutral'}>{a.active ? 'Active' : 'Paused'}</Badge></td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{a.lastRunAt ? ago(a.lastRunAt) : 'Never'}</td><td className="td">{a.lastResult ? <span className="flex items-center gap-2"><Badge status={a.lastResult} />{a.lastResult === 'FAILED' && <button className="link text-meta" onClick={() => setErrOf(a)}>View error</button>}</span> : <span className="text-ink-3">—</span>}</td><td className="td text-right">{manage && <Button size="sm" loading={toggle.isPending && toggle.variables?._id === a._id} onClick={() => toggle.mutate(a)}>{a.active ? 'Pause' : 'Enable'}</Button>}</td></tr>)}
        </Table>
      )}</Async></Card>
      <Card title="Automation activity" pad={false}><Async q={runs} empty={<Empty title="No runs yet" hint="Runs are recorded every time a rule fires." />}>{(d: any[]) => (
        <Table head={['Event', 'Action', 'Content', 'Time', 'Result']} minWidth={720}>{d.map((r) => <tr key={r._id} className="hover:bg-surface-2 transition-colors"><td className="td whitespace-nowrap font-medium text-ink">{label(r.trigger.replace(/\./g, '_'))}</td><td className="td text-[13px] text-ink-2 font-medium">{(r.actions || []).join('; ') || r.automationName}</td><td className="td font-mono font-medium text-ink-3">{r.contentId ? <Link className="hover:text-primary-ink" to={`/content/${r.contentId._id}`}>{r.contentId.contentId}</Link> : '—'}</td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{fmtDateTime(r.createdAt)}</td><td className="td"><Badge status={r.result} /></td></tr>)}</Table>
      )}</Async></Card>
      <Modal open={!!errOf} onClose={() => setErrOf(null)} title="Automation error">{errOf && <><p className="font-medium">{errOf.name}</p><p className="mt-1 text-meta text-ink-2">Failed {ago(errOf.lastRunAt)} · {errOf.failCount} failure{errOf.failCount === 1 ? '' : 's'} of {errOf.runCount} runs</p><pre className="mt-3 whitespace-pre-wrap rounded border border-line bg-surface-2 p-3 text-[13px]">{errOf.lastError}</pre></>}</Modal>
      {q.data && <RuleForm open={open} onClose={() => setOpen(false)} triggers={q.data.triggers} onSaved={inv} />}
    </>
  );
}
function RuleForm({ open, onClose, triggers, onSaved }: { open: boolean; onClose: () => void; triggers: string[]; onSaved: () => void }) {
  const [v, setV] = useState<any>({ name: '', trigger: triggers[0], type: 'notify', target: 'managers', title: '', dueInHours: 24 });
  useEffect(() => { if (open) setV({ name: '', trigger: triggers[0], type: 'notify', target: 'managers', title: '', dueInHours: 24 }); }, [open]); // eslint-disable-line
  const m = useMutation({ mutationFn: () => post('/automations', { name: v.name, trigger: v.trigger, actions: [v.type === 'notify' ? { type: 'notify', params: { to: [v.target], title: v.title, message: '{contentId} · {title}', category: 'WORKFLOW' } } : v.type === 'create_task' ? { type: 'create_task', params: { assignee: v.target, title: v.title, dueInHours: Number(v.dueInHours) || 24 } } : { type: 'create_reminder', params: { to: v.target, title: v.title, inHours: Number(v.dueInHours) || 0 } }] }), onSuccess: () => { toast.success('Automation created.'); onSaved(); onClose(); }, onError: (e) => toast.error(errMsg(e)) });
  const set = (k: string) => (e: any) => setV((s: any) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} title="New automation rule" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!v.name.trim() || !v.title.trim()} loading={m.isPending} onClick={() => m.mutate()}>Create rule</Button></>}>
      <div className="space-y-3">
        <Field label="Rule name"><Input value={v.name} onChange={set('name')} placeholder="Published → remind SMM to report" autoFocus /></Field>
        <Field label="WHEN"><Select value={v.trigger} onChange={set('trigger')}>{triggers.map((t) => <option key={t} value={t}>{label(t.replace(/\./g, '_'))}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="THEN"><Select value={v.type} onChange={set('type')}><option value="notify">Notify</option><option value="create_task">Create task</option><option value="create_reminder">Create reminder</option></Select></Field><Field label="For"><Select value={v.target} onChange={set('target')}>{TARGETS.filter((t) => v.type === 'notify' || t !== 'actor').map((t) => <option key={t} value={t}>{t === 'smm' ? 'SMM' : label(t.toUpperCase())}</option>)}</Select></Field></div>
        <Field label={v.type === 'notify' ? 'Notification title' : 'Title'} hint="You can use {contentId}, {title}, {version} and {actor}."><Input value={v.title} onChange={set('title')} /></Field>
        {v.type !== 'notify' && <Field label={v.type === 'create_task' ? 'Due in (hours)' : 'Remind in (hours)'}><Input type="number" min={0} value={v.dueInHours} onChange={set('dueInHours')} /></Field>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ Team
export function Team() {
  const q = useTeam(); const nav = useNavigate(); const presence = useUI((s) => s.presence);
  return (
    <>
      <PageHeader title="Team" sub="Who is working on what, and who is available." />
      <Card pad={false}><Async q={q}>{(d: any[]) => (
        <>
          <ul className="divide-y divide-line md:hidden">{d.map((u) => <li key={u._id}><Link to={`/team/${u._id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"><span className="relative"><Avatar name={u.name} size={36} /><PresenceDot userId={u._id} className="absolute -bottom-0.5 -right-0.5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-ink group-hover:text-primary-ink transition-colors">{u.name}</span><span className="block truncate text-meta font-medium text-ink-2">{roleLabel(u.role)} · {presence[u._id]?.currentActivity || label(presence[u._id]?.status || 'OFFLINE')}</span></span><span className="text-meta font-semibold tabular text-ink-2">{u.workload?.pending ?? 0} open</span></Link></li>)}</ul>
          <div className="hidden md:block"><Table head={['Name', 'Role', 'Status', 'Current activity', 'Tasks', 'Workload', 'Last active']} minWidth={860}>
            {d.map((u) => { const p = presence[u._id]; return <tr key={u._id} onClick={() => nav(`/team/${u._id}`)} className="group cursor-pointer hover:bg-surface-2 transition-colors"><td className="td"><span className="flex items-center gap-2.5 font-semibold text-ink group-hover:text-primary-ink transition-colors"><Avatar name={u.name} />{u.name}{!u.active && <Badge t="neutral">Inactive</Badge>}</span></td><td className="td font-medium text-ink-2">{roleLabel(u.role)}</td><td className="td"><PresenceLabel userId={u._id} /></td><td className="td text-ink font-medium">{p?.status && p.status !== 'OFFLINE' ? p.currentActivity || '—' : '—'}</td><td className="td tabular font-medium text-ink">{u.workload?.pending ?? 0} open{u.workload?.overdue > 0 && <span className="ml-1.5 font-semibold text-danger">{u.workload.overdue} overdue</span>}</td><td className="td"><div className="flex w-28 items-center gap-2"><Progress value={u.workload?.workload || 0} tone={u.workload?.workload >= 90 ? 'red' : u.workload?.workload >= 70 ? 'amber' : 'blue'} /><span className="w-9 text-right text-meta font-semibold tabular text-ink-2">{u.workload?.workload || 0}%</span></div></td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{p?.status === 'ONLINE' ? 'Now' : p?.lastActive ? ago(p.lastActive) : '—'}</td></tr>; })}
          </Table></div>
        </>
      )}</Async></Card>
    </>
  );
}
export function TeamMember() {
  const { id } = useParams(); const nav = useNavigate(); const me = useAuth((s) => s.user)!; const [tab, setTab] = useState<'overview' | 'tasks' | 'content' | 'activity' | 'schedule'>('overview');
  const q = useQuery({ queryKey: ['team', 'one', id], queryFn: () => get(`/team/${id}`) }); const p = useUI((s) => s.presence[id!]);
  const chat = async () => { try { const r = await post('/chat/rooms', { type: 'DIRECT', userId: id }); nav(`/chat/${r._id}`); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Async q={q}>{(d: any) => (
      <>
        <PageHeader title={<span className="flex items-center gap-3"><Avatar name={d.user.name} size={40} />{d.user.name}</span>} sub={<span className="flex flex-wrap items-center gap-3">{roleLabel(d.user.role)}<PresenceLabel userId={id!} />{p?.status !== 'ONLINE' && p?.lastActive && <span>Last active {ago(p.lastActive)}</span>}</span>} actions={id !== me._id && <Button icon={<MessageSquare size={15} />} onClick={chat}>Message</Button>} />
        {d.restricted ? <Card><Empty title="Details are visible to managers" hint="You can still message this team member." /></Card> : <>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Overview' }, { key: 'tasks', label: 'Tasks', count: d.tasks.filter((t: any) => t.status !== 'COMPLETED').length }, { key: 'content', label: 'Content', count: d.content.length }, { key: 'activity', label: 'Activity' }, { key: 'schedule', label: 'Schedule' }]} />
          {tab === 'overview' && <div className="space-y-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Assigned" value={d.workload?.assigned ?? 0} /><Stat label="Completed" value={d.workload?.completed ?? 0} /><Stat label="Pending" value={d.workload?.pending ?? 0} /><Stat label="Overdue" value={d.workload?.overdue ?? 0} tone="red" /></div><Card title="Workload"><div className="flex items-center gap-3"><Progress value={d.workload?.workload || 0} className="!h-2" /><span className="tabular font-medium">{d.workload?.workload || 0}%</span></div><p className="mt-2 text-meta text-ink-2">Based on open tasks. {p?.currentActivity && p.status !== 'OFFLINE' ? `Currently: ${p.currentActivity}.` : ''}</p></Card><Card title="Open tasks" pad={false}><TaskList tasks={d.tasks.filter((t: any) => t.status !== 'COMPLETED').slice(0, 8)} showAssignee={false} /></Card></div>}
          {tab === 'tasks' && <Card pad={false}><TaskList tasks={d.tasks} showAssignee={false} /></Card>}
          {tab === 'content' && <Card pad={false}><ContentTable items={d.content} compact /></Card>}
          {tab === 'activity' && <Card pad={false}><ActivityFeed items={d.activity} /></Card>}
          {tab === 'schedule' && <Card pad={false}>{!d.schedule.length ? <Empty title="Nothing scheduled" /> : <ul className="divide-y divide-line">{d.schedule.map((t: any) => <li key={t._id}><Link to={`/tasks/${t._id}`} className="flex justify-between gap-3 px-4 py-2.5 hover:bg-surface-2"><span>{t.title}</span><span className={clsx('shrink-0 text-meta', new Date(t.dueAt) < new Date() ? 'font-medium text-danger' : 'text-ink-2')}>{fmtDateTime(t.dueAt)}</span></Link></li>)}</ul>}</Card>}
        </>}
      </>
    )}</Async>
  );
}

// ------------------------------------------------------------ Reports
const hrs = (h: number | null) => (h == null ? '—' : h < 1 ? '<1 h' : h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`);
export function Reports() {
  const [days, setDays] = useState(30);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['reports', days], queryFn: () => get('/reports', { days }) });
  return (
    <>
      <PageHeader
        title="Reports"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<Sparkles size={15} className="text-emerald-300" />}
              onClick={() => setShowStatusModal(true)}
            >
              Status Report &amp; PDF
            </Button>
            <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="!w-auto">
              {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </Select>
          </div>
        }
      />
      <Async q={q} rows={8}>{(r: any) => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><Stat label="Content created" value={r.created} /><Stat label="Content completed" value={r.completed} /><Stat label="Published" value={r.published} /><Stat label="In production" value={r.pending} /><Stat label="Overdue tasks" value={r.overdue} tone="red" onClick={() => nav('/tasks?filter=overdue')} /><Stat label="Blocked" value={r.blocked} tone="red" onClick={() => nav('/blocked')} /></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><Stat label="Shooting" value={r.shooting} /><Stat label="Editing" value={r.editing} /><Stat label="Internal reviews" value={r.reviews} /><Stat label="Client reviews" value={r.clientReviews} /><Stat label="Internal review time" value={hrs(r.approvalTimeHours.internal)} hint="Average" /><Stat label="Client approval time" value={hrs(r.approvalTimeHours.client)} hint="Average" /></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Content by stage"><BarList rows={r.byStage.map((x: any) => ({ key: x.stage, label: label(x.stage), value: x.count }))} onPick={(k) => nav(`/content?stage=${k}`)} /></Card>
            <Card title="Content by client">{r.byClient.length ? <BarList rows={r.byClient.map((x: any) => ({ key: String(x._id), label: x.name || 'Unknown', value: x.total }))} onPick={(k) => nav(`/clients/${k}`)} /> : <Empty title="No content yet" />}</Card>
            <Card title={`Content created per day (last ${days} days)`}>{r.createdPerDay.length ? <DayBars rows={r.createdPerDay} /> : <Empty title="Nothing created in this period" />}</Card>
            <Card title="Revisions requested"><div className="mb-3 text-[24px] font-semibold tabular">{r.revisionCount.total}</div>{r.revisionCount.byType.length ? <BarList rows={r.revisionCount.byType.map((x: any) => ({ key: x._id, label: label(x._id), value: x.n }))} /> : <p className="text-ink-3">No change requests in this period.</p>}</Card>
          </div>
          <Card title="Team workload" pad={false}><Table head={['Member', 'Role', 'Assigned', 'Completed', 'Pending', 'Overdue', 'Workload']} minWidth={640}>{r.workload.map((w: any) => <tr key={w.userId} className="hover:bg-surface-2 transition-colors"><td className="td font-semibold text-ink">{w.name}</td><td className="td font-medium text-ink-2">{roleLabel(w.role)}</td><td className="td tabular font-semibold text-ink">{w.assigned}</td><td className="td tabular text-ink-2">{w.completed}</td><td className="td tabular text-ink-2">{w.pending}</td><td className={clsx('td tabular font-semibold', w.overdue > 0 ? 'text-danger' : 'text-ink-3')}>{w.overdue}</td><td className="td"><div className="flex w-28 items-center gap-2"><Progress value={w.workload} /><span className="text-meta font-semibold tabular text-ink-2">{w.workload}%</span></div></td></tr>)}</Table></Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Storage usage" pad={false}><Table head={['Category', 'Files', 'Size']} minWidth={300}>{r.storage.byCategory.map((x: any) => <tr key={x._id}><td className="td">{label(x._id)}</td><td className="td tabular">{x.count}</td><td className="td tabular">{fmtSize(x.bytes)}</td></tr>)}{!r.storage.byCategory.length && <tr><td className="td text-ink-3" colSpan={3}>No files uploaded yet</td></tr>}</Table></Card>
            <Card title="Files"><div className="grid grid-cols-2 gap-3"><Stat label="Uploaded" value={r.filesUploaded} /><Stat label="Downloaded" value={r.filesDownloaded} /></div></Card>
          </div>
        </div>
      )}</Async>
      <ClientReportModal open={showStatusModal} onClose={() => setShowStatusModal(false)} />
    </>
  );
}
/** Change over time, single series: thin columns on one axis, value on hover, x labels at the ends only */
function DayBars({ rows }: { rows: { _id: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return <div><div className="flex h-36 items-end gap-[2px] border-b border-line">{rows.map((r) => <div key={r._id} title={`${r._id}: ${r.n}`} className="group relative flex-1"><div className="mx-auto w-full max-w-[24px] rounded-t-sm bg-primary group-hover:bg-primary-hover" style={{ height: `${(r.n / max) * 136}px` }} /></div>)}</div><div className="mt-1 flex justify-between text-meta text-ink-2 tabular"><span>{rows[0]._id}</span><span>Peak {max}</span><span>{rows[rows.length - 1]._id}</span></div></div>;
}

// ------------------------------------------------------------ Notifications
const NTABS = [['all', 'All'], ['unread', 'Unread'], ['TASK', 'Tasks'], ['APPROVAL', 'Approvals'], ['CHAT', 'Chat'], ['REMINDER', 'Reminders'], ['SYSTEM', 'System'], ['FILES', 'Files']] as const;
export function Notifications() {
  const { user } = useAuth();
  const [tab, setTab] = useState<string>('all');
  const [range, setRange] = useState('');
  const [term, setTerm] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const a = useNotificationActions();
  const canSendCustom = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const params: any = { limit: 100, ...(tab === 'unread' ? { unread: 1 } : tab === 'SYSTEM' ? { category: 'SYSTEM,WORKFLOW,DEADLINE' } : tab !== 'all' ? { category: tab } : {}), ...(range ? { range } : {}), ...(term ? { q: term } : {}) };
  const q = useQuery({ queryKey: ['notifications', 'center', params], queryFn: () => get('/notifications', params) });
  return (
    <>
      <PageHeader
        title="Notifications"
        sub={q.data ? `${q.data.unread} unread` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSendCustom && (
              <Button
                variant="primary"
                icon={<Send size={14} />}
                onClick={() => setCustomOpen(true)}
              >
                Send Notification
              </Button>
            )}
            <TestNotificationButton />
            <Button onClick={() => a.readAll.mutate()} disabled={!q.data?.unread}>Mark all as read</Button>
          </div>
        }
      />
      <Tabs value={tab as any} onChange={setTab} tabs={NTABS.map(([key, l]) => ({ key, label: l }))} />
      <div className="mb-3 flex flex-wrap gap-2"><Input className="sm:max-w-xs" placeholder="Search notifications" value={term} onChange={(e) => setTerm(e.target.value)} /><Select aria-label="Date" className="!w-auto" value={range} onChange={(e) => setRange(e.target.value)}><option value="">Any time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This week</option></Select></div>
      <Card pad={false}><Async q={q}>{(d: any) => !d.items.length ? <Empty title="No notifications" /> : <ul className="divide-y divide-line">{d.items.map((n: any) => <NotificationRow key={n._id} n={n} onOpen={() => a.open(n)} onRead={() => a.read.mutate(n._id)} onDelete={() => a.remove.mutate(n._id)} />)}</ul>}</Async></Card>
      {canSendCustom && <CustomNotificationModal open={customOpen} onClose={() => setCustomOpen(false)} />}
    </>
  );
}

// ------------------------------------------------------------ Activity / audit log
export function Activity() {
  const can = useCan(); const team = useTeam(); const [actor, setActor] = useState(''); const [term, setTerm] = useState(''); const [kind, setKind] = useState('');
  const q = useQuery({ queryKey: ['activity', 'log', actor, term, kind], queryFn: () => get<any[]>('/activity', { limit: 150, ...(actor ? { actorId: actor } : {}), ...(term ? { q: term } : {}), ...(kind ? { action: kind } : {}) }) });
  const audit = can('audit.view');
  return (
    <>
      <PageHeader title={audit ? 'Audit Log' : 'Activity'} sub="Who did what, and when." />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:flex"><Input className="col-span-2 sm:max-w-xs" placeholder="Search activity" value={term} onChange={(e) => setTerm(e.target.value)} /><Select aria-label="Person" className="sm:!w-auto" value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Everyone</option>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select><Select aria-label="Type" className="sm:!w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All activity</option>{[['content', 'Content'], ['script', 'Scripts'], ['approval', 'Approvals'], ['media', 'Files'], ['task', 'Tasks'], ['aisensy', 'AiSensy'], ['automation', 'Automation'], ['auth', 'Sign-ins'], ['user', 'Users'], ['role', 'Roles']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
      <Card pad={false}><Async q={q} empty={<Empty title="No activity found" />}>{(d: any[]) => <Table head={['When', 'Who', 'What', 'Content', ...(audit ? ['IP'] : [])]} minWidth={720}>{d.map((x) => <tr key={x._id} className="hover:bg-surface-2 transition-colors"><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{fmtDateTime(x.createdAt)}</td><td className="td whitespace-nowrap font-semibold text-ink">{x.actorName}{x.actorType !== 'USER' && <span className="ml-1.5"><Badge t="neutral">{label(x.actorType)}</Badge></span>}</td><td className="td font-medium text-ink">{x.message}</td><td className="td font-mono font-medium text-ink-3">{x.contentId ? <Link className="hover:text-primary-ink" to={`/content/${x.contentId._id}`}>{x.contentId.contentId}</Link> : '—'}</td>{audit && <td className="td tabular text-ink-3">{x.ip || '—'}</td>}</tr>)}</Table>}</Async></Card>
    </>
  );
}
export { ArrowRight, Textarea };
