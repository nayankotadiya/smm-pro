import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, MessageSquare, Ban } from 'lucide-react';
import { get, patch, del, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Empty, PageHeader, Priority, Progress, Select, Table, Tabs } from '@/components/ui';
import { TaskList, ContentTable, useCompleteTask } from '@/components/Lists';
import { TaskFormModal, ReasonModal } from '@/components/Forms';
import { ago, fmtDateTime, fmtTs, isOverdue, label } from '@/lib/format';
import { useTeam } from '@/hooks/useData';

const sod = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function Sec({ title, items, tone }: { title: string; items: any[]; tone?: 'red' }) {
  return items.length ? <Card title={<span className="flex items-center gap-2">{title}<Badge t={tone || 'neutral'}>{items.length}</Badge></span>} pad={false}><TaskList tasks={items} showAssignee={false} /></Card> : null;
}

export function MyWork() {
  const me = useAuth((s) => s.user)!; const [open, setOpen] = useState(false);
  const tasks = useQuery({ queryKey: ['tasks', 'mine'], queryFn: () => get<any[]>('/tasks', { mine: 1, assignedTo: me._id }) });
  const waiting = useQuery({ queryKey: ['content', 'owner-me'], queryFn: () => get('/content', { owner: 'me', status: 'ACTIVE,CHANGES_REQUESTED,BLOCKED' }).then((r) => r.items) });
  const g = useMemo(() => {
    const all = (tasks.data || []).filter((t) => String(t.assignedTo?._id) === me._id); const eod = +sod() + 864e5; const now = Date.now();
    const open = all.filter((t) => t.status !== 'COMPLETED');
    return {
      overdue: open.filter((t) => t.dueAt && +new Date(t.dueAt) < now),
      today: open.filter((t) => t.dueAt && +new Date(t.dueAt) >= now && +new Date(t.dueAt) < eod),
      progress: open.filter((t) => ['IN_PROGRESS', 'REVIEW'].includes(t.status) && !(t.dueAt && +new Date(t.dueAt) < eod)),
      upcoming: open.filter((t) => !['IN_PROGRESS', 'REVIEW'].includes(t.status) && (!t.dueAt || +new Date(t.dueAt) >= eod)),
      done: all.filter((t) => t.status === 'COMPLETED').slice(0, 15),
    };
  }, [tasks.data, me._id]);
  return (
    <>
      <PageHeader title="My Work" sub="Everything assigned to you, in the order it needs attention." actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>New task</Button>} />
      <Async q={tasks}>{() => (
        <div className="space-y-5">
          <Sec title="Overdue" items={g.overdue} tone="red" />
          <Sec title="Due today" items={g.today} />
          <Sec title="In progress" items={g.progress} />
          <Card title={<span className="flex items-center gap-2">Waiting for me{!!waiting.data?.length && <Badge>{waiting.data.length}</Badge>}</span>} pad={false}><Async q={waiting} empty={<Empty title="No content is waiting on you" />}>{(d: any[]) => <ContentTable items={d} compact />}</Async></Card>
          <Sec title="Upcoming" items={g.upcoming} />
          <Sec title="Completed" items={g.done} />
          {!g.overdue.length && !g.today.length && !g.progress.length && !g.upcoming.length && !g.done.length && <Card><Empty title="No tasks assigned to you" hint="Tasks are created automatically as content moves through the workflow." /></Card>}
        </div>
      )}</Async>
      <TaskFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function Tasks() {
  const [sp, setSp] = useSearchParams(); const can = useCan(); const team = useTeam(); const [open, setOpen] = useState(false);
  const filter = sp.get('filter') || 'open'; const member = sp.get('member') || '';
  const params: any = { ...(filter === 'open' ? { open: 1 } : filter === 'overdue' ? { overdue: 1 } : filter === 'completed' ? { status: 'COMPLETED' } : filter === 'blocked' ? { status: 'BLOCKED' } : filter === 'unassigned' ? { assignedTo: 'none', open: 1 } : filter === 'auto' ? { source: 'AUTOMATIC', open: 1 } : {}), ...(member ? { assignedTo: member } : {}) };
  const q = useQuery({ queryKey: ['tasks', params], queryFn: () => get<any[]>('/tasks', params) });
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  return (
    <>
      <PageHeader title="Tasks" actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>New task</Button>} />
      <Tabs value={filter} onChange={(k) => set('filter', k)} tabs={[{ key: 'open', label: 'Open' }, { key: 'overdue', label: 'Overdue' }, { key: 'blocked', label: 'Blocked' }, ...(can('tasks.read.all') ? [{ key: 'unassigned', label: 'Unassigned' }] : []), { key: 'auto', label: 'Automatic' }, { key: 'completed', label: 'Completed' }]} />
      {can('tasks.read.all') && <div className="mb-3 max-w-xs"><Select value={member} onChange={(e) => set('member', e.target.value)} aria-label="Team member"><option value="">All team members</option>{(team.data || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select></div>}
      <Card pad={false}><Async q={q}>{(d: any[]) => <TaskList tasks={d} />}</Async></Card>
      <TaskFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function TaskDetail() {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient(); const can = useCan(); const me = useAuth((s) => s.user)!;
  const q = useQuery({ queryKey: ['tasks', 'one', id], queryFn: () => get(`/tasks/${id}`) });
  const [edit, setEdit] = useState(false); const [block, setBlock] = useState(false);
  const done = useCompleteTask();
  const upd = useMutation({ mutationFn: (b: any) => patch(`/tasks/${id}`, b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setBlock(false); }, onError: (e) => toast.error(errMsg(e)) });
  const rm = useMutation({ mutationFn: () => del(`/tasks/${id}`), onSuccess: () => { toast.success('Task deleted.'); qc.invalidateQueries({ queryKey: ['tasks'] }); nav('/tasks'); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Async q={q}>{(t: any) => {
      const complete = t.status === 'COMPLETED'; const mine = t.assignedTo?._id === me._id || t.createdBy?._id === me._id;
      return (
        <>
          <PageHeader title={t.title} sub={<span className="flex flex-wrap items-center gap-2"><Badge status={isOverdue(t.dueAt, complete) ? 'OVERDUE' : t.status} /><Priority p={t.priority} />{t.source !== 'MANUAL' && <span className="text-meta text-ink-3">{t.source === 'CHAT' ? 'Created from chat' : 'Created automatically'}</span>}</span>}
            actions={(mine || can('tasks.manage')) && <><Button icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit</Button>{!complete && t.status !== 'BLOCKED' && <Button icon={<Ban size={15} />} onClick={() => setBlock(true)}>Mark blocked</Button>}</>} />
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Card title="Details">
                {t.description ? <p className="whitespace-pre-wrap">{t.description}</p> : <p className="text-ink-3">No description.</p>}
                {t.status === 'BLOCKED' && <div className="mt-3 rounded border border-danger/30 bg-danger-soft p-3 text-[13px]"><b>Blocked</b> {ago(t.blockedSince)} — {t.blockedReason}</div>}
                {t.sourceMessageId && <Link to={`/chat/${t.sourceMessageId.roomId}`} className="mt-3 flex items-start gap-2 rounded border border-line p-3 hover:bg-surface-2"><MessageSquare size={16} className="mt-0.5 text-ink-2" /><span><span className="block text-meta text-ink-2">Original chat message from {t.sourceMessageId.senderId?.name}</span>{t.sourceMessageId.message}</span></Link>}
              </Card>
              {!complete && <div className="flex flex-wrap gap-2">
                {['TODO', 'OVERDUE', 'BLOCKED'].includes(t.status) && <Button onClick={() => upd.mutate({ status: 'IN_PROGRESS' })} loading={upd.isPending}>Start</Button>}
                {t.status === 'IN_PROGRESS' && <Button onClick={() => upd.mutate({ status: 'REVIEW' })}>Send for review</Button>}
                <Button variant="primary" onClick={() => done.mutate({ id: t._id, status: 'COMPLETED' }, { onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', 'one', id] }) })} loading={done.isPending}>Mark complete</Button>
              </div>}
              {complete && <Button onClick={() => upd.mutate({ status: 'TODO' })}>Reopen</Button>}
            </div>
            <Card title="Summary">
              <dl className="space-y-3 text-[13px]">
                <Row k="Assigned to" v={t.assignedTo?.name || 'Unassigned'} /><Row k="Created by" v={t.createdBy?.name || 'Automation'} /><Row k="Due" v={t.dueAt ? fmtDateTime(t.dueAt) : 'No due date'} danger={isOverdue(t.dueAt, complete)} />
                <Row k="Client" v={t.clientId ? <Link className="link" to={`/clients/${t.clientId._id}`}>{t.clientId.name}</Link> : '—'} />
                <Row k="Content" v={t.contentId ? <Link className="link" to={`/content/${t.contentId._id}`}>{t.contentId.contentId} · {t.contentId.title}</Link> : '—'} />
                {t.contentId && <div><div className="mb-1 flex justify-between text-ink-2"><span>{label(t.contentId.stage)}</span><span className="tabular">{t.contentId.progress}%</span></div><Progress value={t.contentId.progress} /></div>}
                <Row k="Created" v={fmtDateTime(t.createdAt)} />{t.completedAt && <Row k="Completed" v={fmtDateTime(t.completedAt)} />}
              </dl>
              {(t.createdBy?._id === me._id || can('tasks.manage')) && <Button variant="danger" size="sm" className="mt-4" onClick={() => confirm('Delete this task?') && rm.mutate()}>Delete task</Button>}
            </Card>
          </div>
          <TaskFormModal open={edit} onClose={() => { setEdit(false); qc.invalidateQueries({ queryKey: ['tasks', 'one', id] }); }} task={t} />
          <ReasonModal open={block} onClose={() => setBlock(false)} title="Mark task as blocked" label="What is blocking this task?" cta="Mark blocked" danger loading={upd.isPending} onSubmit={(blockedReason) => upd.mutate({ status: 'BLOCKED', blockedReason })} />
        </>
      );
    }}</Async>
  );
}
export const Row = ({ k, v, danger }: { k: string; v: any; danger?: boolean }) => <div className="flex justify-between gap-4"><dt className="shrink-0 text-ink-2">{k}</dt><dd className={`min-w-0 text-right ${danger ? 'font-medium text-danger' : ''}`}>{v}</dd></div>;

export function Blocked() {
  const q = useQuery({ queryKey: ['content', 'blocked'], queryFn: () => get<any[]>('/content/blocked') });
  const tasks = useQuery({ queryKey: ['tasks', { status: 'BLOCKED' }], queryFn: () => get<any[]>('/tasks', { status: 'BLOCKED' }) });
  const nav = useNavigate();
  return (
    <>
      <PageHeader title="Blocked" sub="Work that cannot move forward until something is resolved." />
      <Card title="Content" pad={false} className="mb-5"><Async q={q} empty={<Empty title="No blocked content" />}>{(d: any[]) => <Table head={['Content', 'Client', 'Reason', 'Owner', 'Days blocked', 'Next action']}>{d.map((c) => <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="group cursor-pointer hover:bg-surface-2 transition-colors"><td className="td"><div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{c.title}</div><div className="font-mono text-meta font-medium text-ink-3">{c.contentId}</div></td><td className="td font-medium text-ink-2">{c.clientId?.name}</td><td className="td max-w-xs font-medium text-ink">{c.blocked?.reason}</td><td className="td font-medium text-ink">{c.currentOwner?.name || <span className="text-ink-3">Unassigned</span>}</td><td className="td tabular font-semibold text-ink">{Math.max(0, Math.floor((Date.now() - +new Date(c.blocked?.since)) / 864e5))}</td><td className="td font-medium text-ink-2">{c.blocked?.nextAction || c.nextAction}</td></tr>)}</Table>}</Async></Card>
      <Card title="Tasks" pad={false}><Async q={tasks} empty={<Empty title="No blocked tasks" />}>{(d: any[]) => <ul className="divide-y divide-line">{d.map((t) => <li key={t._id}><Link to={`/tasks/${t._id}`} className="group block px-4 py-2.5 hover:bg-surface-2 transition-colors"><div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{t.title}</div><div className="text-meta font-medium text-ink-2">{t.blockedReason} · {t.assignedTo?.name || 'Unassigned'} · blocked {ago(t.blockedSince)}</div></Link></li>)}</ul>}</Async></Card>
    </>
  );
}

export function ChangesRequested() {
  const q = useQuery({ queryKey: ['content', 'changes'], queryFn: () => get<any[]>('/content/changes-requested') }); const nav = useNavigate();
  return (
    <>
      <PageHeader title="Changes Requested" sub="Open feedback from reviewers and clients." />
      <Card pad={false}><Async q={q} empty={<Empty title="No open change requests" />}>{(d: any[]) => (
        <Table head={['Content', 'Version', 'Requested by', 'Comment', 'Timestamp', 'Assigned to', 'Due']} minWidth={900}>
          {d.map((f) => <tr key={f._id} onClick={() => nav(`/content/${f.contentId._id}?tab=reviews`)} className="group cursor-pointer hover:bg-surface-2 transition-colors"><td className="td"><div className="font-semibold text-ink group-hover:text-primary-ink transition-colors">{f.contentId.title}</div><div className="font-mono text-meta font-medium text-ink-3">{f.contentId.contentId} · {f.contentId.clientId?.name}</div></td><td className="td font-semibold text-ink whitespace-nowrap">{f.version}</td><td className="td font-medium text-ink whitespace-nowrap">{f.authorName}{f.authorType === 'CLIENT' && <span className="ml-1.5"><Badge t="amber">Client</Badge></span>}</td><td className="td max-w-sm font-medium text-ink">{f.comment}</td><td className="td tabular font-medium text-ink-2">{f.timestampSec != null ? fmtTs(f.timestampSec) : '—'}</td><td className="td font-medium text-ink">{f.task?.assignedTo?.name || f.contentId.assignedEditor?.name || '—'}</td><td className="td whitespace-nowrap text-meta font-medium text-ink-2">{f.task?.dueAt ? fmtDateTime(f.task.dueAt) : '—'}</td></tr>)}
        </Table>
      )}</Async></Card>
    </>
  );
}
