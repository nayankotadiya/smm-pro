import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Filter, CalendarDays, Plus, User, Camera, Scissors, Clock, FileText, CheckCircle2, MapPin, MessageSquare, ArrowRight } from 'lucide-react';
import { get } from '@/lib/api';
import { Badge, Button, Card, Empty, Modal, PageHeader, Segmented, Select, Spinner } from '@/components/ui';
import { ContentFormModal } from '@/components/Forms';
import { fmtDateTime, fmtTime, roleLabel } from '@/lib/format';
import { useCan } from '@/store/auth';

type View = 'month' | 'week' | 'day';

const KIND: Record<string, { label: string; cls: string; border: string }> = {
  CONTENT: { label: 'Content deadline', cls: 'border-l-rose-500 bg-rose-500/10 text-rose-200', border: 'border-rose-500' },
  SHOOT: { label: 'Shoot', cls: 'border-l-amber-500 bg-amber-500/10 text-amber-200', border: 'border-amber-500' },
  EDIT_DEADLINE: { label: 'Edit deadline', cls: 'border-l-primary bg-primary-soft text-primary-ink', border: 'border-primary' },
  REVIEW: { label: 'Review', cls: 'border-l-purple-500 bg-purple-500/10 text-purple-200', border: 'border-purple-500' },
  FOLLOWUP: { label: 'Client follow-up', cls: 'border-l-warning bg-warning-soft text-ink', border: 'border-warning' },
  MEETING: { label: 'Meeting', cls: 'border-l-ink-2 bg-surface-3 text-ink', border: 'border-ink-2' },
  REMINDER: { label: 'Reminder', cls: 'border-l-ink-3 bg-surface-2 text-ink-2', border: 'border-ink-3' },
  SCHEDULE: { label: 'Scheduled post', cls: 'border-l-cyan-500 bg-cyan-500/10 text-cyan-200', border: 'border-cyan-500' },
  PUBLISH: { label: 'Published', cls: 'border-l-emerald-500 bg-emerald-500/10 text-emerald-200', border: 'border-emerald-500' },
  TASK: { label: 'Task', cls: 'border-l-ink-3 bg-surface-2 text-ink-2', border: 'border-ink-3' },
};

const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => add(sod(d), -((d.getDay() + 6) % 7)); // Monday
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function CalendarView({ clientId: propClientId }: { clientId?: string }) {
  const nav = useNavigate();
  const [view, setView] = useState<View>(() => (window.innerWidth < 640 ? 'week' : 'month'));
  const [cur, setCur] = useState(() => sod(new Date()));
  const [selectedClientId, setSelectedClientId] = useState(propClientId || '');
  const [selectedKind, setSelectedKind] = useState<string>('ALL');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [inspectEvent, setInspectEvent] = useState<any | null>(null);

  const clientsQ = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => get<any[]>('/clients'),
  });

  const teamQ = useQuery({
    queryKey: ['team-list'],
    queryFn: () => get<any[]>('/team'),
  });

  const range = useMemo(() => {
    if (view === 'day') return { from: cur, to: add(cur, 1), days: [cur] };
    if (view === 'week') {
      const s = startOfWeek(cur);
      return { from: s, to: add(s, 7), days: Array.from({ length: 7 }, (_, i) => add(s, i)) };
    }
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const weeks = Math.ceil(((+last - +s) / 864e5 + 1) / 7);
    return { from: s, to: add(s, weeks * 7), days: Array.from({ length: weeks * 7 }, (_, i) => add(s, i)) };
  }, [view, cur]);

  const q = useQuery({
    queryKey: ['calendar', +range.from, +range.to, selectedClientId],
    queryFn: () => get<any[]>('/calendar', { from: range.from.toISOString(), to: range.to.toISOString(), clientId: selectedClientId || undefined }),
  });

  // Client-side filtering for Kind & Assignee
  const filteredEvents = useMemo(() => {
    let list: any[] = q.data || [];
    if (selectedKind !== 'ALL') {
      if (selectedKind === 'SHOOT') list = list.filter((e) => e.kind === 'SHOOT');
      else if (selectedKind === 'EDIT') list = list.filter((e) => e.kind === 'EDIT_DEADLINE' || e.kind === 'REVIEW');
      else if (selectedKind === 'DEADLINE') list = list.filter((e) => e.kind === 'CONTENT');
      else if (selectedKind === 'POST') list = list.filter((e) => e.kind === 'SCHEDULE' || e.kind === 'PUBLISH');
    }
    if (selectedAssignee) {
      list = list.filter((e) => e.assigneeId === selectedAssignee || e.assigneeName === selectedAssignee);
    }
    return list;
  }, [q.data, selectedKind, selectedAssignee]);

  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {};
    filteredEvents.forEach((e) => {
      (m[key(new Date(e.at))] ||= []).push(e);
    });
    return m;
  }, [filteredEvents]);

  const move = (n: number) =>
    setCur(view === 'month' ? new Date(cur.getFullYear(), cur.getMonth() + n, 1) : add(cur, n * (view === 'week' ? 7 : 1)));

  const title =
    view === 'month'
      ? cur.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : view === 'day'
      ? cur.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
      : `${range.days[0].toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${range.days[6].toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const today = key(new Date());

  const Ev = ({ e, full }: { e: any; full?: boolean }) => (
    <button
      type="button"
      onClick={() => setInspectEvent(e)}
      title={`${KIND[e.kind]?.label}: ${e.title}`}
      className={clsx(
        'group block w-full text-left animate-rise truncate rounded-md border-l-2 px-1.5 text-[11px] font-semibold leading-5 transition-all duration-150 hover:translate-x-0.5 hover:shadow-xs',
        full && 'py-1 text-[12px] leading-5',
        KIND[e.kind]?.cls || 'bg-surface-3 text-ink'
      )}
    >
      {full && <span className="mr-1.5 tabular font-medium opacity-80">{fmtTime(e.at)}</span>}
      <span className="truncate">{e.title}</span>
      {e.clientName && <span className="ml-1 text-[10px] font-normal opacity-70">({e.clientName})</span>}
      {e.assigneeName && <span className="ml-1 text-[10px] font-medium text-primary-ink">· {e.assigneeName}</span>}
    </button>
  );

  return (
    <>
      {/* Top Filter Bar */}
      <div className="mb-4 rounded-2xl border border-line/60 bg-surface-2/40 p-3.5 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={() => setCur(sod(new Date()))}>
                Today
              </Button>
              <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => move(-1)} icon={<ChevronLeft size={16} />} />
              <Button size="sm" variant="ghost" aria-label="Next" onClick={() => move(1)} icon={<ChevronRight size={16} />} />
              <span className="ml-2 text-[15px] font-bold text-ink">{title}</span>
              {q.isFetching && <Spinner className="ml-2" />}
            </div>

            <Segmented
              value={view}
              onChange={setView}
              options={(['month', 'week', 'day'] as View[]).map((v) => ({
                key: v,
                label: v[0].toUpperCase() + v.slice(1),
              }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Client selector */}
            {!propClientId && (
              <div className="w-44">
                <Select
                  className="!text-[12px] !py-1 !min-h-[34px]"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">All Clients</option>
                  {(clientsQ.data || []).map((c: any) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Assignee selector */}
            <div className="w-44">
              <Select
                className="!text-[12px] !py-1 !min-h-[34px]"
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
              >
                <option value="">All Team Members</option>
                {(teamQ.data || []).map((u: any) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({roleLabel(u.role)})
                  </option>
                ))}
              </Select>
            </div>

            {/* Type selector */}
            <div className="flex rounded-lg bg-surface/60 p-0.5 border border-line/60">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'SHOOT', label: 'Shoots' },
                { id: 'EDIT', label: 'Edits' },
                { id: 'DEADLINE', label: 'Deadlines' },
                { id: 'POST', label: 'Posts' },
              ].map((k) => (
                <button
                  key={k.id}
                  onClick={() => setSelectedKind(k.id)}
                  className={clsx(
                    'rounded-md px-2 py-1 text-[11px] font-bold transition-all',
                    selectedKind === k.id
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-ink-2 hover:text-ink'
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {q.isError ? (
        <Card>
          <Empty title="Could not load the calendar" action={<Button size="sm" onClick={() => q.refetch()}>Retry</Button>} />
        </Card>
      ) : view === 'month' ? (
        <div key={`${view}-${+range.from}`} className="card animate-rise overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-meta font-bold text-ink-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {range.days.map((d) => {
              const ev = byDay[key(d)] || [];
              const out = d.getMonth() !== cur.getMonth();
              return (
                <div
                  key={+d}
                  className={clsx(
                    'min-h-[82px] border-b border-r border-line p-1.5 transition-colors duration-150 hover:bg-surface-2 sm:min-h-[110px]',
                    out && 'bg-surface-2/40 opacity-70'
                  )}
                >
                  <button
                    onClick={() => {
                      setCur(d);
                      setView('day');
                    }}
                    className={clsx(
                      'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] tabular font-semibold',
                      key(d) === today
                        ? 'bg-primary font-bold text-white shadow-sm ring-2 ring-primary/40'
                        : out
                        ? 'text-ink-3'
                        : 'text-ink hover:bg-surface-3'
                    )}
                  >
                    {d.getDate()}
                  </button>
                  <div className="hidden space-y-1 sm:block">
                    {ev.slice(0, 3).map((e) => (
                      <Ev key={e.id} e={e} />
                    ))}
                    {ev.length > 3 && (
                      <button
                        className="px-1 text-[11px] font-bold text-primary-ink hover:underline"
                        onClick={() => {
                          setCur(d);
                          setView('day');
                        }}
                      >
                        +{ev.length - 3} more
                      </button>
                    )}
                  </div>
                  {ev.length > 0 && (
                    <button
                      className="flex gap-1 px-1 sm:hidden"
                      aria-label={`${ev.length} events`}
                      onClick={() => {
                        setCur(d);
                        setView('day');
                      }}
                    >
                      {ev.slice(0, 4).map((e) => (
                        <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-primary" />
                      ))}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div key={`${view}-${+range.from}`} className={clsx('stagger grid gap-3', view === 'week' && 'lg:grid-cols-7')}>
          {range.days.map((d) => {
            const ev = byDay[key(d)] || [];
            return (
              <div key={+d} className="card min-w-0">
                <div
                  className={clsx(
                    'border-b border-line px-3 py-2 text-[13px] font-bold',
                    key(d) === today ? 'text-primary-ink bg-primary-soft/30' : 'text-ink'
                  )}
                >
                  {d.toLocaleDateString([], {
                    weekday: 'short',
                    day: 'numeric',
                    month: view === 'day' ? 'long' : undefined,
                  })}
                </div>
                <div className="space-y-1.5 p-2">
                  {ev.length ? (
                    ev.map((e) => <Ev key={e.id} e={e} full={view === 'day' || window.innerWidth < 1024} />)
                  ) : (
                    <div className="px-1 py-3 text-meta text-ink-3">Nothing scheduled</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-meta text-ink-2">
        {[
          ['Shoots', 'bg-amber-500'],
          ['Deadlines', 'bg-rose-500'],
          ['Edits & Reviews', 'bg-purple-500'],
          ['Published & Scheduled', 'bg-emerald-500'],
          ['Tasks & Reminders', 'bg-ink-3'],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5 font-medium">
            <span className={clsx('h-2.5 w-2.5 rounded-full', c)} />
            {l}
          </span>
        ))}
      </div>

      {/* Inspect Event Modal / Drawer */}
      {inspectEvent && (
        <Modal
          open={!!inspectEvent}
          onClose={() => setInspectEvent(null)}
          title={
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'h-3 w-3 rounded-full',
                  inspectEvent.kind === 'SHOOT'
                    ? 'bg-amber-500'
                    : inspectEvent.kind === 'CONTENT'
                    ? 'bg-rose-500'
                    : 'bg-primary'
                )}
              />
              <span>{inspectEvent.title}</span>
            </div>
          }
          footer={
            <div className="flex w-full items-center justify-between">
              <Button onClick={() => setInspectEvent(null)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  nav(inspectEvent.link);
                  setInspectEvent(null);
                }}
                className="gap-1.5"
              >
                Open in App <ArrowRight size={15} />
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-surface-2/50 p-3.5 border border-line/60">
              <div>
                <div className="text-meta font-bold text-ink-3">Type / Stage</div>
                <div className="text-[13px] font-semibold text-ink">
                  {KIND[inspectEvent.kind]?.label || inspectEvent.kind}
                  {inspectEvent.stage && ` · ${inspectEvent.stage}`}
                </div>
              </div>

              <div>
                <div className="text-meta font-bold text-ink-3">Scheduled Date &amp; Time</div>
                <div className="text-[13px] font-semibold text-ink">
                  {fmtDateTime(inspectEvent.at)}
                </div>
              </div>

              {inspectEvent.clientName && (
                <div>
                  <div className="text-meta font-bold text-ink-3">Client</div>
                  <div className="text-[13px] font-semibold text-primary-ink">
                    {inspectEvent.clientName}
                  </div>
                </div>
              )}

              {inspectEvent.assigneeName && (
                <div>
                  <div className="text-meta font-bold text-ink-3">Assigned Team Member</div>
                  <div className="text-[13px] font-semibold text-ink">
                    {inspectEvent.assigneeName}{' '}
                    {inspectEvent.assigneeRole && (
                      <span className="text-meta text-ink-2">({roleLabel(inspectEvent.assigneeRole)})</span>
                    )}
                  </div>
                </div>
              )}

              {inspectEvent.location && (
                <div className="sm:col-span-2">
                  <div className="text-meta font-bold text-ink-3">Shoot Location</div>
                  <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                    <MapPin size={14} className="text-amber-400" />
                    {inspectEvent.location}
                  </div>
                </div>
              )}

              {inspectEvent.remarksCount > 0 && (
                <div className="sm:col-span-2 rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5">
                  <div className="text-[12px] font-bold text-rose-300 flex items-center gap-1">
                    <MessageSquare size={13} /> Shooter Remarks Recorded
                  </div>
                  <div className="text-[12px] text-ink-2 mt-0.5">
                    {inspectEvent.remarksCount} remarks / complaints filed for this shoot.
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function CalendarPage() {
  const can = useCan();
  const [newContentOpen, setNewContentOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Calendar"
        sub="Plan and track deadlines, shoots, video edits, reviews, and scheduled publications."
        actions={
          can('content.write') && (
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setNewContentOpen(true)}
            >
              New Content
            </Button>
          )
        }
      />
      <CalendarView />
      <ContentFormModal open={newContentOpen} onClose={() => setNewContentOpen(false)} />
    </>
  );
}
