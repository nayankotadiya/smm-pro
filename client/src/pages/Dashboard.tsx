import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, ArrowRight, HardDrive, Building2, Clapperboard, FileText, Camera, Scissors, MessagesSquare, ShieldCheck, CalendarClock, Rocket, AlarmClockOff, ListChecks, CalendarCheck, Loader, Hourglass, CheckCheck, CalendarDays, FileVideo, FilePen, Users, Zap } from 'lucide-react';
import { get } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { useUI } from '@/store/ui';
import { Async, Avatar, Badge, BarList, Button, Card, DateRangePicker, Empty, PageHeader, PresenceDot, Progress, Segmented, Stat, Table } from '@/components/ui';
import { ContentTable, TaskList, ActivityFeed } from '@/components/Lists';
import { ContentFormModal, TaskFormModal, ReminderFormModal, FastTrackVideoModal } from '@/components/Forms';
import { ago, fmtAge, fmtDateTime, fmtSize, label, roleLabel } from '@/lib/format';
import { FileCard, useMediaActions } from '@/components/Media';

import { DeadlineAlertsBanner } from '@/components/DeadlineAlerts';
import { ClientReportModal } from '@/components/ClientReportModal';
import { Sparkles } from 'lucide-react';

const dq = (key: string, params?: any) => ({ queryKey: ['dashboard', key, params], queryFn: () => get(`/dashboard/${key}`, params) });
const More = ({ to, children = 'View all' }: { to: string; children?: string }) => <Link to={to} className="group flex items-center gap-1 text-[13px] font-medium text-primary-ink">{children}<ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" /></Link>;

export default function Dashboard() {
  const user = useAuth((s) => s.user)!; const can = useCan(); const org = can('dashboard.org');
  const [modal, setModal] = useState<'content' | 'task' | 'reminder' | 'fast-track' | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const h = new Date().getHours();
  return (
    <>
      <PageHeader title={`Good ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`} sub={new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={<>
          <Button icon={<Sparkles size={15} className="text-emerald-400" />} onClick={() => setShowReport(true)}>Daily / Weekly Report</Button>
          {can('content.write') && (
            <Button
              variant="primary"
              icon={<Zap size={15} className="text-amber-300 fill-amber-300/30" />}
              onClick={() => setModal('fast-track')}
            >
              Fast-track Video
            </Button>
          )}
          {can('content.write') && <Button icon={<Plus size={16} />} onClick={() => setModal('content')}>New content</Button>}
          <Button icon={<Plus size={16} />} onClick={() => setModal('task')}>Task</Button>
          <Button icon={<Plus size={16} />} onClick={() => setModal('reminder')}>Reminder</Button>
        </>} />

      <DeadlineAlertsBanner />

      <div className="mb-5 rounded-2xl border border-line/60 bg-surface-2/40 p-4 backdrop-blur-xl">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarDays size={15} className="text-ink-3" />
          <span className="text-[13px] font-bold text-ink-2">Date filter</span>
          {(dateFrom || dateTo) && <Badge t="blue">Active</Badge>}
        </div>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
      </div>
      {org ? <OrgDashboard dateFrom={dateFrom} dateTo={dateTo} /> : <TeamDashboard dateFrom={dateFrom} dateTo={dateTo} />}
      <ContentFormModal open={modal === 'content'} onClose={() => setModal(null)} />
      <FastTrackVideoModal open={modal === 'fast-track'} onClose={() => setModal(null)} />
      <TaskFormModal open={modal === 'task'} onClose={() => setModal(null)} />
      <ReminderFormModal open={modal === 'reminder'} onClose={() => setModal(null)} />
      <ClientReportModal open={showReport} onClose={() => setShowReport(false)} />
    </>
  );
}

function OrgDashboard({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const nav = useNavigate();
  const sum = useQuery(dq('summary'));
  const o = sum.data?.org;
  const kpis: [string, any, string, any, ('red' | undefined)?][] = o ? [
    ['Total Clients', o.totalClients, '/clients', Building2], ['Total Content', o.totalContent, '/content', Clapperboard], ['Pending Scripts', o.pendingScripts, '/content?stage=IDEA,SCRIPT,INTERNAL_REVIEW', FileText], ['In Shooting', o.shooting, '/shooting', Camera], ['In Editing', o.editing, '/editing', Scissors],
    ['Client Reviews', o.clientReviews, '/approvals?tab=client', MessagesSquare], ['Needs Review', o.needsReview, '/approvals?tab=internal', ShieldCheck], ['Scheduled', o.scheduled, '/content?stage=SCHEDULE', CalendarClock], ['Published', o.published, '/content?stage=PUBLISHED', Rocket], ['Overdue', o.overdue, '/tasks?filter=overdue', AlarmClockOff, 'red'],
  ] : [];
  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{sum.isLoading ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-[76px] !rounded-lg" />) : kpis.map(([l, v, to, I, t]) => <Stat key={l} label={l} value={v} tone={t} icon={<I size={16} />} onClick={() => nav(to)} />)}</div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <NeedsAttention />
          <WaitingFor />
          <PendingReviewsDetail dateFrom={dateFrom} dateTo={dateTo} />
          <Card title="Workflow overview" action={<More to="/content" />}><Async q={useQuery(dq('content-by-stage'))}>{(d: any[]) => <BarList rows={d.map((x) => ({ key: x.stage, label: label(x.stage), value: x.count }))} onPick={(k) => nav(`/content?stage=${k}`)} />}</Async></Card>
          <Card title="Recent content" pad={false} action={<More to="/content" />}><Async q={useQuery(dq('recent-content', { limit: 8 }))}>{(d: any[]) => <ContentTable items={d} />}</Async></Card>
          <Workload />
          <TodayTasks org />
        </div>
        <div className="min-w-0 space-y-5">
          <PendingApprovals />
          <BlockedCard />
          <RemindersCard />
          <LiveActivity />
          <TeamOnline />
          <StorageCard />
          <AutomationCard />
          <ChatPreview />
        </div>
      </div>
    </div>
  );
}

function TeamDashboard({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const nav = useNavigate();
  const sum = useQuery(dq('summary')); const m = sum.data?.me;
  const a = useMediaActions();
  const files = useQuery(dq('my-files'));
  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {m ? <><Stat label="My Assigned" value={m.assigned} icon={<ListChecks size={16} />} onClick={() => nav('/my-work')} /><Stat label="Due Today" value={m.dueToday} tone="amber" icon={<CalendarCheck size={16} />} onClick={() => nav('/my-work')} /><Stat label="In Progress" value={m.inProgress} icon={<Loader size={16} />} onClick={() => nav('/my-work')} /><Stat label="Waiting for Me" value={m.waitingForMe} icon={<Hourglass size={16} />} onClick={() => nav('/content?owner=me')} /><Stat label="Completed (7 days)" value={m.completed} icon={<CheckCheck size={16} />} onClick={() => nav('/my-work')} /></> : Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-[76px] !rounded-lg" />)}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <NeedsAttention mine />
          <PendingReviewsDetail dateFrom={dateFrom} dateTo={dateTo} mine />
          <TodayTasks />
          <Card title="My content" pad={false} action={<More to="/content" />}><Async q={useQuery(dq('recent-content', { limit: 8 }))}>{(d: any[]) => <ContentTable items={d} compact />}</Async></Card>
          <Card title="Files shared with me" action={<More to="/media" />}><Async q={files} empty={<Empty title="No new files" />}>{(d: any[]) => <div className="grid gap-3 md:grid-cols-2">{d.slice(0, 4).map((f) => <FileCard key={f._id} m={f} a={a} />)}</div>}</Async></Card>
        </div>
        <div className="min-w-0 space-y-5"><PendingApprovals /><RemindersCard /><ChatPreview /><LiveActivity /><TeamOnline /></div>
      </div>
      {a.modal}
    </div>
  );
}

function NeedsAttention({ mine }: { mine?: boolean }) {
  const q = useQuery(dq('needs-attention'));
  return (
    <Card title={mine ? 'What needs attention now' : 'Needs your attention'} pad={false} action={q.data?.length ? <Badge t="red">{q.data.length}</Badge> : undefined}>
      <Async q={q} empty={<Empty title="Nothing needs attention" hint="Overdue work, stalled reviews, blockers and failures show up here." />}>
        {(rows: any[]) => (
          <>
            <ul className="divide-y divide-line md:hidden">{rows.slice(0, 12).map((r, i) => <li key={i}><Link to={r.link} className="block px-4 py-3"><div className="font-medium">{r.issue}</div><div className="mt-0.5 text-meta text-ink-2">{[r.content?.contentId, r.client, r.owner, fmtAge(r.ageHours)].filter(Boolean).join(' · ')}</div></Link></li>)}</ul>
            <div className="hidden md:block"><Table head={['Issue', 'Content', 'Client', 'Owner', 'Age', '']}>
              {rows.slice(0, 12).map((r, i) => <tr key={i} className="hover:bg-surface-2 transition-colors"><td className="td"><span className="flex items-center gap-2"><span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', r.severity >= 3 ? 'bg-danger' : r.severity === 2 ? 'bg-warning' : 'bg-line-strong')} /><span className="font-semibold text-ink">{r.issue}</span></span></td><td className="td text-ink-2 font-medium">{r.content ? <Link className="hover:text-primary-ink font-mono text-ink-3" to={`/content/${r.content._id}`}>{r.content.contentId}</Link> : '—'}</td><td className="td text-ink-2 font-medium">{r.client || '—'}</td><td className="td font-medium text-ink">{r.owner || <span className="text-ink-3">Unassigned</span>}</td><td className="td tabular text-ink-2 font-medium">{fmtAge(r.ageHours)}</td><td className="td text-right"><Link to={r.link}><Button size="sm">Open</Button></Link></td></tr>)}
            </Table></div>
          </>
        )}
      </Async>
    </Card>
  );
}
function PendingReviewsDetail({ dateFrom, dateTo, mine: _mine }: { dateFrom: string; dateTo: string; mine?: boolean }) {
  const nav = useNavigate();
  const params: any = {};
  if (dateFrom) params.from = dateFrom;
  if (dateTo) params.to = dateTo;
  const q = useQuery({ queryKey: ['dashboard', 'pending-reviews-detail', params], queryFn: () => get('/dashboard/pending-reviews-detail', params) });
  const [tab, setTab] = useState<'script' | 'video' | 'client'>('script');
  const d = q.data as any;
  const scriptCount = d?.scriptReviews?.length || 0;
  const videoCount = d?.videoReviews?.length || 0;
  const clientCount = d?.clientReviews?.length || 0;
  const totalPending = scriptCount + videoCount + clientCount;
  const subTabs: [string, string, any, number][] = [['script', 'Script Reviews', FilePen, scriptCount], ['video', 'Video Reviews', FileVideo, videoCount], ['client', 'Client Reviews', Users, clientCount]];
  return (
    <Card
      title={<span className="flex items-center gap-2">Pending Reviews — Detail{totalPending > 0 && <Badge t="red">{totalPending}</Badge>}{(dateFrom || dateTo) && <Badge t="blue">Filtered</Badge>}</span>}
      pad={false}
      action={<More to="/approvals" />}
    >
      <div className="flex border-b border-line/60 bg-surface-2/25 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {subTabs.map(([key, lbl, Icon, count]) => (
          <button key={key} onClick={() => setTab(key as any)} className={clsx('flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[13px] font-bold border-b-2 transition-all duration-200', tab === key ? 'border-primary text-primary-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
            <Icon size={13} />{lbl}{count > 0 && <span className={clsx('rounded-full px-1.5 text-[11px] font-bold leading-5', tab === key ? 'bg-primary-soft text-primary-ink' : 'bg-surface-3 text-ink-2')}>{count}</span>}
          </button>
        ))}
      </div>
      <Async q={q} empty={<Empty title="No pending reviews" hint="All reviews are up to date." />}>
        {() => {
          if (tab === 'script') {
            const rows: any[] = d?.scriptReviews || [];
            if (!rows.length) return <Empty title="No pending script reviews" />;
            return (
              <>
                <ul className="divide-y divide-line/60 md:hidden">
                  {rows.map((a) => (
                    <li key={a._id} className="p-3.5 hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav(`/content/${a.contentId?._id}?tab=script`)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink truncate">{a.contentId?.title || '—'}</span>
                        <span className="text-meta tabular text-ink-3 shrink-0">{fmtAge(Math.round((Date.now() - new Date(a.createdAt).getTime()) / 36e5))}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                        <span className="font-mono text-ink-3">{a.contentId?.contentId}</span>
                        <span>•</span>
                        <span>{a.contentId?.clientId?.name || '—'}</span>
                        <span>•</span>
                        <span>v{a.version || '1'}</span>
                      </div>
                      <div className="mt-1 text-[12px] text-ink-3">Reviewer: <span className="text-ink font-medium">{a.reviewerId?.name || 'Unassigned'}</span></div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table head={['Content', 'Client', 'Reviewer', 'Submitted by', 'Version', 'Waiting']} minWidth={680}>
                    {rows.map((a) => <tr key={a._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav(`/content/${a.contentId?._id}?tab=script`)}>
                      <td className="td"><div className="font-semibold text-ink">{a.contentId?.title || '—'}</div><div className="font-mono text-meta font-medium text-ink-3">{a.contentId?.contentId}</div></td>
                      <td className="td text-ink-2 font-medium">{a.contentId?.clientId?.name || '—'}</td>
                      <td className="td font-medium text-ink">{a.reviewerId?.name || <span className="text-ink-3">Unassigned</span>}</td>
                      <td className="td text-ink-2 font-medium">{a.createdBy?.name || '—'}</td>
                      <td className="td tabular font-medium text-ink">{a.version || '—'}</td>
                      <td className="td tabular font-medium text-ink-2">{fmtAge(Math.round((Date.now() - new Date(a.createdAt).getTime()) / 36e5))}</td>
                    </tr>)}
                  </Table>
                </div>
              </>
            );
          }
          if (tab === 'video') {
            const rows: any[] = d?.videoReviews || [];
            if (!rows.length) return <Empty title="No pending video reviews" />;
            return (
              <>
                <ul className="divide-y divide-line/60 md:hidden">
                  {rows.map((a) => (
                    <li key={a._id} className="p-3.5 hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav(`/content/${a.contentId?._id}?tab=editing`)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink truncate">{a.contentId?.title || '—'}</span>
                        <Badge t={a.type === 'FINAL' ? 'red' : 'amber'}>{label(a.type)}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                        <span className="font-mono text-ink-3">{a.contentId?.contentId}</span>
                        <span>•</span>
                        <span>{a.contentId?.clientId?.name || '—'}</span>
                        <span>•</span>
                        <span>v{a.version || '1'}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[12px] text-ink-3">
                        <span>Reviewer: <span className="text-ink font-medium">{a.reviewerId?.name || 'Unassigned'}</span></span>
                        <span className="tabular">{fmtAge(Math.round((Date.now() - new Date(a.createdAt).getTime()) / 36e5))}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden md:block">
                  <Table head={['Content', 'Client', 'Type', 'Reviewer', 'Submitted by', 'Version', 'Waiting']} minWidth={740}>
                    {rows.map((a) => <tr key={a._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav(`/content/${a.contentId?._id}?tab=editing`)}>
                      <td className="td"><div className="font-semibold text-ink">{a.contentId?.title || '—'}</div><div className="font-mono text-meta font-medium text-ink-3">{a.contentId?.contentId}</div></td>
                      <td className="td text-ink-2 font-medium">{a.contentId?.clientId?.name || '—'}</td>
                      <td className="td"><Badge t={a.type === 'FINAL' ? 'red' : 'amber'}>{label(a.type)}</Badge></td>
                      <td className="td font-medium text-ink">{a.reviewerId?.name || <span className="text-ink-3">Unassigned</span>}</td>
                      <td className="td text-ink-2 font-medium">{a.createdBy?.name || '—'}</td>
                      <td className="td tabular font-medium text-ink">{a.version || '—'}</td>
                      <td className="td tabular font-medium text-ink-2">{fmtAge(Math.round((Date.now() - new Date(a.createdAt).getTime()) / 36e5))}</td>
                    </tr>)}
                  </Table>
                </div>
              </>
            );
          }
          const rows: any[] = d?.clientReviews || [];
          if (!rows.length) return <Empty title="No pending client reviews" />;
          return (
            <>
              <ul className="divide-y divide-line/60 md:hidden">
                {rows.map((a) => (
                  <li key={a._id} className="p-3.5 hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav('/approvals?tab=client')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink truncate">{a.contentId?.title || '—'}</span>
                      <Badge status={a.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                      <span className="font-mono text-ink-3">{a.contentId?.contentId}</span>
                      <span>•</span>
                      <span>{a.contentId?.clientId?.name || '—'}</span>
                      <span>•</span>
                      <Badge>{label(a.type)}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[12px] text-ink-3">
                      <span>Sent to: <span className="text-ink font-medium">{a.recipientName || a.reviewerId?.name || '—'}</span></span>
                      <span className="tabular">{fmtAge(Math.round((Date.now() - new Date(a.sentAt || a.createdAt).getTime()) / 36e5))}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table head={['Content', 'Client', 'Type', 'Sent to', 'Status', 'Sent', 'Waiting']} minWidth={700}>
                  {rows.map((a) => <tr key={a._id} className="hover:bg-surface-2 transition-colors cursor-pointer" onClick={() => nav('/approvals?tab=client')}>
                    <td className="td"><div className="font-semibold text-ink">{a.contentId?.title || '—'}</div><div className="font-mono text-meta font-medium text-ink-3">{a.contentId?.contentId}</div></td>
                    <td className="td text-ink-2 font-medium">{a.contentId?.clientId?.name || '—'}</td>
                    <td className="td"><Badge>{label(a.type)}</Badge></td>
                    <td className="td font-medium text-ink">{a.recipientName || a.reviewerId?.name || '—'}</td>
                    <td className="td"><Badge status={a.status} /></td>
                    <td className="td tabular text-meta text-ink-2">{a.sentAt ? fmtDateTime(a.sentAt) : '—'}</td>
                    <td className="td tabular font-medium text-ink-2">{fmtAge(Math.round((Date.now() - new Date(a.sentAt || a.createdAt).getTime()) / 36e5))}</td>
                  </tr>)}
                </Table>
              </div>
            </>
          );
        }}
      </Async>
    </Card>
  );
}
function WaitingFor() {
  const q = useQuery(dq('waiting-for')); const nav = useNavigate();
  const items: [string, string, string][] = [
    ['clientReviews', 'Client Reviews', '/approvals?tab=client'],
    ['internalReviews', 'Internal Reviews', '/approvals?tab=internal'],
    ['rawFootage', 'Raw Footage', '/shooting'],
    ['editorAction', 'Editor Action', '/editing'],
    ['smmAction', 'SMM Action', '/content?stage=SMM_REVIEW'],
    ['finalReview', 'Final Review', '/approvals?tab=final'],
    ['scheduling', 'Scheduling', '/content?stage=SCHEDULE'],
  ];
  return (
    <Card title="Waiting for">
      <Async q={q}>
        {(d: any) => (
          <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {items.map(([k, l, to]) => {
              const count = d[k] || 0;
              const hasItems = count > 0;
              return (
                <button
                  key={k}
                  onClick={() => nav(to)}
                  className={clsx(
                    'glass-tile group relative overflow-hidden px-3.5 py-3 text-left transition-all duration-200',
                    hasItems && 'hover:border-primary/45 hover:shadow-[0_8px_24px_-4px_rgba(139,92,246,0.22)]'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className={clsx('text-[22px] font-black leading-tight tabular transition-transform duration-200 group-hover:scale-105', hasItems ? 'text-ink' : 'text-ink-3/70')}>
                      {count}
                    </div>
                    {hasItems && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.9)] animate-pulse" />
                    )}
                  </div>
                  <div className="mt-1 truncate text-meta font-semibold text-ink-2 group-hover:text-ink transition-colors">
                    {l}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Async>
    </Card>
  );
}
function Workload() {
  const q = useQuery(dq('team-workload'));
  return (
    <Card title="Team workload" pad={false} action={<More to="/team" />}>
      <Async q={q}>{(rows: any[]) => (
        <>
          <ul className="divide-y divide-line/60 md:hidden">
            {rows.map((r) => (
              <li key={r.userId} className="p-3.5 hover:bg-surface-2 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/team/${r.userId}`} className="flex items-center gap-2 font-semibold text-ink hover:text-primary-ink truncate">
                    <Avatar name={r.name} size={28} />
                    <span className="truncate">{r.name}</span>
                  </Link>
                  <PresenceLabel userId={r.userId} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] text-ink-2">
                  <span className="font-medium">{roleLabel(r.role)}</span>
                  <div className="flex items-center gap-2.5 font-medium">
                    <span><strong className="text-ink">{r.assigned}</strong> assigned</span>
                    <span><strong className="text-ink">{r.completed}</strong> done</span>
                    {r.overdue > 0 && <span className="font-semibold text-danger">{r.overdue} overdue</span>}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Progress value={r.workload} tone={r.workload >= 90 ? 'red' : r.workload >= 70 ? 'amber' : 'blue'} />
                  <span className="w-9 text-right text-meta font-bold tabular text-ink-2">{r.workload}%</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table head={['Member', 'Role', 'Assigned', 'Completed', 'Pending', 'Overdue', 'Workload', 'Presence']} minWidth={760}>
              {rows.map((r) => <tr key={r.userId} className="hover:bg-surface-2 transition-colors"><td className="td"><Link to={`/team/${r.userId}`} className="flex items-center gap-2 font-semibold text-ink hover:text-primary-ink"><Avatar name={r.name} size={24} />{r.name}</Link></td><td className="td text-ink-2 font-medium">{roleLabel(r.role)}</td><td className="td tabular font-semibold text-ink">{r.assigned}</td><td className="td tabular text-ink-2">{r.completed}</td><td className="td tabular text-ink-2">{r.pending}</td><td className={clsx('td tabular font-semibold', r.overdue > 0 ? 'text-danger' : 'text-ink-3')}>{r.overdue}</td><td className="td"><div className="flex w-28 items-center gap-2"><Progress value={r.workload} tone={r.workload >= 90 ? 'red' : r.workload >= 70 ? 'amber' : 'blue'} /><span className="w-9 text-right text-meta font-medium tabular text-ink-2">{r.workload}%</span></div></td><td className="td"><PresenceLabel userId={r.userId} /></td></tr>)}
            </Table>
          </div>
        </>
      )}</Async>
    </Card>
  );
}
export function PresenceLabel({ userId }: { userId: string }) {
  const p = useUI((s) => s.presence[userId]);
  return <span className="flex items-center gap-1.5 text-meta text-ink-2"><PresenceDot userId={userId} />{label(p?.status || 'OFFLINE')}</span>;
}
function TodayTasks({ org }: { org?: boolean }) {
  const [scope, setScope] = useState<'all' | 'mine' | 'overdue' | 'open'>(org ? 'all' : 'open');
  const q = useQuery(dq('today-tasks', { scope }));
  const tabs: [typeof scope, string][] = org ? [['all', 'All'], ['mine', 'Mine'], ['overdue', 'Overdue']] : [['open', 'All open'], ['mine', 'Due today'], ['overdue', 'Overdue']];
  return (
    <Card title={org ? "Today's tasks" : 'My tasks'} pad={false} action={<Segmented size="sm" value={scope} onChange={setScope} options={tabs.map(([key, label]) => ({ key, label }))} />}>
      <Async q={q}>{(d: any[]) => <TaskList tasks={d} showAssignee={org} emptyText={scope === 'overdue' ? 'Nothing overdue' : scope === 'open' ? 'No open tasks' : 'No tasks due today'} />}</Async>
    </Card>
  );
}
function PendingApprovals() {
  const q = useQuery(dq('pending-approvals'));
  return <Card title="Pending approvals" pad={false} action={<More to="/approvals" />}><Async q={q} empty={<Empty title="No pending approvals" />}>{(d: any[]) => <ul className="divide-y divide-line">{d.slice(0, 6).map((a) => <li key={a._id}><Link to={`/content/${a.contentId?._id}?tab=reviews`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2"><div className="min-w-0"><div className="truncate font-medium">{a.contentId?.title}</div><div className="text-meta text-ink-2">{a.version} · {label(a.type)} · {ago(a.sentAt || a.createdAt)}</div></div><Badge status={a.status} /></Link></li>)}</ul>}</Async></Card>;
}
function BlockedCard() {
  const q = useQuery(dq('blocked-items'));
  if (!q.data?.length) return null;
  return <Card title="Blocked" pad={false} action={<More to="/blocked" />}><ul className="divide-y divide-line">{q.data.slice(0, 5).map((c: any) => <li key={c._id}><Link to={`/content/${c._id}`} className="block px-4 py-2.5 hover:bg-surface-2"><div className="font-medium">{c.title}</div><div className="text-meta text-ink-2">{c.blocked?.reason}</div><div className="text-meta text-ink-3">{c.currentOwner?.name || 'Unassigned'} · blocked {ago(c.blocked?.since)}</div></Link></li>)}</ul></Card>;
}
function RemindersCard() {
  const q = useQuery(dq('reminders'));
  return <Card title="Upcoming reminders" pad={false} action={<More to="/reminders" />}><Async q={q} empty={<Empty title="No upcoming reminders" />}>{(d: any[]) => <ul className="divide-y divide-line">{d.slice(0, 5).map((r) => <li key={r._id}><Link to={`/reminders?id=${r._id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2"><span className="truncate">{r.title}</span><span className={clsx('shrink-0 text-meta', new Date(r.remindAt) < new Date() ? 'font-medium text-danger' : 'text-ink-2')}>{fmtDateTime(r.remindAt)}</span></Link></li>)}</ul>}</Async></Card>;
}
function LiveActivity() {
  const q = useQuery({ queryKey: ['activity', 'dash'], queryFn: () => get('/dashboard/activity', { limit: 12 }) });
  return <Card title="Live activity" pad={false} action={<More to="/activity" />}><Async q={q}>{(d: any[]) => <ActivityFeed items={d} limit={8} />}</Async></Card>;
}
function TeamOnline() {
  const q = useQuery(dq('team-presence')); const presence = useUI((s) => s.presence);
  const order = { ONLINE: 0, DND: 1, AWAY: 2, OFFLINE: 3 } as any;
  return (
    <Card title="Team online" pad={false} action={<More to="/team" />}>
      <Async q={q}>{(d: any[]) => <ul className="divide-y divide-line">{[...d].map((u) => ({ ...u, ...(presence[u.userId] || {}) })).sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)).slice(0, 8).map((u) => (
        <li key={u.userId} className="flex items-center gap-3 px-4 py-2"><span className="relative"><Avatar name={u.name} /><PresenceDot userId={u.userId} className="absolute -bottom-0.5 -right-0.5" /></span><div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><span className="font-medium">{u.name}</span><span className="text-meta text-ink-3">{roleLabel(u.role)}</span></div><div className="truncate text-meta text-ink-2">{u.status === 'OFFLINE' ? (u.lastActive ? `Last active ${ago(u.lastActive)}` : 'Offline') : u.status === 'AWAY' ? `Away · last active ${ago(u.lastActive)}` : u.currentActivity || label(u.status)}</div></div></li>
      ))}</ul>}</Async>
    </Card>
  );
}
function StorageCard() {
  const q = useQuery(dq('storage')); const nav = useNavigate();
  const groups: [string, string, string[]][] = [['raw', 'Raw', ['RAW']], ['editing', 'Editing', ['EDIT']], ['final', 'Final', ['FINAL']], ['images', 'Images', ['IMAGE', 'THUMBNAIL', 'BRAND_ASSET']], ['documents', 'Documents', ['DOCUMENT', 'REFERENCE']]];
  return (
    <Card title={<span className="flex items-center gap-2"><HardDrive size={16} className="text-ink-2" />Storage</span>}>
      <Async q={q}>{(d: any) => {
        const used = Number(d.quota?.usage || 0); const limit = Number(d.quota?.limit || 0);
        const total = d.byCategory.reduce((s: number, x: any) => s + (x.bytes || 0), 0);
        return <>
          {d.quota && !d.quota.error ? <><div className="flex items-baseline justify-between"><span className="text-[18px] font-semibold tabular">{fmtSize(used)}</span><span className="text-meta text-ink-2">{limit ? `of ${fmtSize(limit)}` : 'Google Drive'}</span></div>{limit > 0 && <Progress className="mt-2" value={(used / limit) * 100} tone={used / limit > 0.9 ? 'red' : 'blue'} />}</>
            : <><div className="text-[18px] font-semibold tabular">{fmtSize(total) === '—' ? '0 MB' : fmtSize(total)}</div><div className="text-meta text-ink-2">{d.quota?.error || 'Google Drive is not connected. Files are stored on the server.'}</div></>}
          <ul className="mt-3 divide-y divide-line border-t border-line">{groups.map(([k, l, cats]) => { const rows = d.byCategory.filter((x: any) => cats.includes(x._id)); const bytes = rows.reduce((s: number, x: any) => s + x.bytes, 0); const n = rows.reduce((s: number, x: any) => s + x.count, 0); return <li key={k}><button onClick={() => nav(`/media?group=${k}`)} className="flex w-full items-center justify-between py-2 text-left hover:text-primary-ink"><span>{l}</span><span className="text-meta tabular text-ink-2">{n} files · {bytes ? fmtSize(bytes) : '0 MB'}</span></button></li>; })}</ul>
        </>;
      }}</Async>
    </Card>
  );
}
function AutomationCard() {
  const q = useQuery({ queryKey: ['automations', 'dash'], queryFn: () => get('/dashboard/automation-activity') });
  return <Card title="Automation activity" pad={false} action={<More to="/automation" />}><Async q={q} empty={<Empty title="No automation runs yet" />}>{(d: any[]) => <ul className="divide-y divide-line">{d.slice(0, 6).map((r) => <li key={r._id} className="flex items-center justify-between gap-3 px-4 py-2"><div className="min-w-0"><div className="truncate text-[13px] font-medium">{r.automationName}</div><div className="truncate text-meta text-ink-2">{(r.actions || []).join(', ') || label(r.trigger)} · {ago(r.createdAt)}</div></div><Badge status={r.result} /></li>)}</ul>}</Async></Card>;
}
function ChatPreview() {
  const q = useQuery({ queryKey: ['chat-rooms', 'preview'], queryFn: () => get('/dashboard/chat-preview') }); const me = useAuth((s) => s.user)!;
  return <Card title="Chat" pad={false} action={<More to="/chat" children="Open chat" />}><Async q={q} empty={<Empty title="No conversations yet" />}>{(d: any[]) => <ul className="divide-y divide-line">{d.map((r) => <li key={r._id}><Link to={`/chat/${r._id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2"><div className="min-w-0"><div className={clsx('truncate', r.unread ? 'font-semibold' : 'font-medium')}>{r.type === 'DIRECT' ? r.participants.find((p: any) => p._id !== me._id)?.name : r.name}</div><div className="truncate text-meta text-ink-2">{r.lastMessagePreview}</div></div>{r.unread > 0 && <span className="rounded bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-white">{r.unread}</span>}</Link></li>)}</ul>}</Async></Card>;
}
