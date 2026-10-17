import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  CalendarDays, Clock, CheckCircle2, AlertTriangle, Send, Share2,
  Filter, Search, SlidersHorizontal, X, ArrowRight, ExternalLink,
  ChevronLeft, ChevronRight, Eye, RefreshCw, Sparkles, Check, Play
} from 'lucide-react';
import { get, post, patch, errMsg } from '@/lib/api';
import { Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { ContentThumb, StatusBadge, TypeBadge, PlatformBadge } from '@/components/Lists';
import { useClients, useTeam } from '@/hooks/useData';
import { fmtDate, fmtDateTime, fmtTime, isOverdue, label, getStatusMeta } from '@/lib/format';
import { toast } from '@/store/ui';

type TabKey = 'ALL' | 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PENDING_APPROVAL' | 'READY_TO_SCHEDULE' | 'SCHEDULED' | 'POSTED' | 'CANCELLED';
type CalendarMode = 'month' | 'week' | 'day';

const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => add(sod(d), -((d.getDay() + 6) % 7)); // Monday
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function SchedulingPublishing() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const clients = useClients();
  const team = useTeam();

  // Tab & View States
  const [activeTab, setActiveTab] = useState<TabKey>('SCHEDULED');
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [calMode, setCalMode] = useState<CalendarMode>('month');
  const [curDate, setCurDate] = useState(() => sod(new Date()));

  // Filters
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Modals
  const [publishModalContent, setPublishModalContent] = useState<any | null>(null);
  const [liveUrlInput, setLiveUrlInput] = useState('');
  const [scheduleModalContent, setScheduleModalContent] = useState<any | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Fetch Scheduling KPIs
  const metricsQ = useQuery({
    queryKey: ['content', 'scheduling', 'metrics'],
    queryFn: () => get<any>('/content/scheduling/metrics'),
    refetchInterval: 30000,
  });

  // Fetch all scheduling/publishing relevant content
  const contentQ = useQuery({
    queryKey: ['content', 'scheduling', 'all', selectedClient, selectedType, selectedPlatform],
    queryFn: () => get<any>('/content', {
      limit: 300,
      clientId: selectedClient || undefined,
      type: selectedType || undefined,
      platform: selectedPlatform || undefined,
    }),
  });

  const allItems: any[] = contentQ.data?.items || [];

  // Filtered Items for List View
  const filteredItems = useMemo(() => {
    const todayStr = dateKey(new Date());
    return allItems.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matches = (c.title || '').toLowerCase().includes(q) ||
          (c.contentId || '').toLowerCase().includes(q) ||
          (c.clientId?.name || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedAssignee && c.currentOwner?._id !== selectedAssignee && c.assignedSMM?._id !== selectedAssignee) {
        return false;
      }

      const pDate = c.plannedPublicationDate ? dateKey(new Date(c.plannedPublicationDate)) : '';
      const deadlineDate = c.deadline ? dateKey(new Date(c.deadline)) : '';
      const isPastDeadline = isOverdue(c.deadline, c.status === 'COMPLETED' || c.stage === 'PUBLISHED');

      switch (activeTab) {
        case 'UPCOMING':
          return c.stage === 'SCHEDULE' && pDate > todayStr && c.productionStatus !== 'CANCELLED';
        case 'DUE_TODAY':
          return (pDate === todayStr || deadlineDate === todayStr) && c.stage !== 'PUBLISHED' && c.productionStatus !== 'CANCELLED';
        case 'OVERDUE':
          return isPastDeadline && c.stage !== 'PUBLISHED' && c.productionStatus !== 'CANCELLED';
        case 'PENDING_APPROVAL':
          return (c.stage === 'CLIENT_REVIEW' || c.stage === 'CLIENT_FINAL_APPROVAL' || c.stage === 'INTERNAL_REVIEW' || c.stage === 'FINAL_REVIEW') && c.productionStatus !== 'CANCELLED';
        case 'READY_TO_SCHEDULE':
          return (c.stage === 'FINAL_UPLOAD' || c.approvalStatus === 'APPROVED' || (c.stage === 'SCHEDULE' && !c.plannedPublicationDate)) && c.stage !== 'PUBLISHED' && c.productionStatus !== 'CANCELLED';
        case 'SCHEDULED':
          return c.stage === 'SCHEDULE' && !!c.plannedPublicationDate && c.productionStatus !== 'CANCELLED';
        case 'POSTED':
          return c.stage === 'PUBLISHED' || c.status === 'COMPLETED' || c.productionStatus === 'POSTED';
        case 'CANCELLED':
          return c.productionStatus === 'CANCELLED' || c.productionStatus === 'SHOOT_CANCELLED';
        default:
          return true;
      }
    });
  }, [allItems, activeTab, search, selectedAssignee]);

  // Calendar calculations
  const calRange = useMemo(() => {
    if (calMode === 'day') return { from: curDate, to: add(curDate, 1), days: [curDate] };
    if (calMode === 'week') {
      const s = startOfWeek(curDate);
      return { from: s, to: add(s, 7), days: Array.from({ length: 7 }, (_, i) => add(s, i)) };
    }
    const first = new Date(curDate.getFullYear(), curDate.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0);
    const weeks = Math.ceil(((+last - +s) / 864e5 + 1) / 7);
    return { from: s, to: add(s, weeks * 7), days: Array.from({ length: weeks * 7 }, (_, i) => add(s, i)) };
  }, [calMode, curDate]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    allItems.forEach((c) => {
      // Prioritize planned publication date, then general deadline
      const target = c.plannedPublicationDate || c.deadline;
      if (!target) return;
      const k = dateKey(new Date(target));
      (map[k] ||= []).push(c);
    });
    return map;
  }, [allItems]);

  // Publish Mutation
  const publishMut = useMutation({
    mutationFn: ({ id, liveUrl }: { id: string; liveUrl?: string }) =>
      post(`/content/${id}/publish`, { liveUrl, publishedAt: new Date().toISOString() }),
    onSuccess: () => {
      toast.success('Content marked as Posted! Google Sheet synchronized.');
      setPublishModalContent(null);
      setLiveUrlInput('');
      qc.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  // Schedule Mutation
  const scheduleMut = useMutation({
    mutationFn: ({ id, date, time }: { id: string; date: string; time?: string }) =>
      patch(`/content/${id}`, {
        stage: 'SCHEDULE',
        plannedPublicationDate: date,
        plannedPublicationTime: time,
        productionStatus: 'SCHEDULED',
      }),
    onSuccess: () => {
      toast.success('Publication scheduled successfully! Synced to Google Sheets.');
      setScheduleModalContent(null);
      qc.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const m = metricsQ.data || {
    totalContent: allItems.length,
    awaitingApproval: 0,
    readyToSchedule: 0,
    scheduled: 0,
    dueToday: 0,
    overdue: 0,
    posted: 0,
    cancelled: 0,
  };

  const moveCal = (delta: number) => {
    if (calMode === 'month') {
      setCurDate(new Date(curDate.getFullYear(), curDate.getMonth() + delta, 1));
    } else if (calMode === 'week') {
      setCurDate(add(curDate, delta * 7));
    } else {
      setCurDate(add(curDate, delta));
    }
  };

  const calTitle =
    calMode === 'month'
      ? curDate.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : calMode === 'day'
      ? curDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${calRange.days[0].toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${calRange.days[6].toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title="Scheduling & Publishing"
        sub="Plan publication timelines, approve final exports, and publish across social channels."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'calendar' ? 'primary' : 'secondary'}
              size="sm"
              icon={<CalendarDays size={15} />}
              onClick={() => setViewMode('calendar')}
            >
              Calendar
            </Button>
            <Button
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Clock size={15} />}
              onClick={() => setViewMode('list')}
            >
              Pipeline List
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={contentQ.isFetching ? 'animate-spin' : ''} />}
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['content'] });
                qc.invalidateQueries({ queryKey: ['content', 'scheduling'] });
              }}
            >
              Sync
            </Button>
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {[
          { label: 'Total Content', value: m.totalContent, tab: 'ALL' as TabKey, color: 'text-ink-1', border: 'border-line' },
          { label: 'Awaiting Approval', value: m.awaitingApproval, tab: 'PENDING_APPROVAL' as TabKey, color: 'text-amber-500', border: 'border-amber-400/30' },
          { label: 'Ready to Schedule', value: m.readyToSchedule, tab: 'READY_TO_SCHEDULE' as TabKey, color: 'text-cyan-500', border: 'border-cyan-400/30' },
          { label: 'Scheduled', value: m.scheduled, tab: 'SCHEDULED' as TabKey, color: 'text-fuchsia-500', border: 'border-fuchsia-400/30' },
          { label: 'Due Today', value: m.dueToday, tab: 'DUE_TODAY' as TabKey, color: 'text-blue-500', border: 'border-blue-400/30' },
          { label: 'Overdue', value: m.overdue, tab: 'OVERDUE' as TabKey, color: 'text-rose-500', border: 'border-rose-400/30' },
          { label: 'Posted', value: m.posted, tab: 'POSTED' as TabKey, color: 'text-emerald-500', border: 'border-emerald-400/30' },
          { label: 'Cancelled', value: m.cancelled, tab: 'CANCELLED' as TabKey, color: 'text-slate-400', border: 'border-slate-400/30' },
        ].map((k) => (
          <button
            key={k.label}
            onClick={() => {
              setActiveTab(k.tab);
              setViewMode('list');
            }}
            className={clsx(
              'rounded-xl border p-3 text-left transition-all backdrop-blur-xl shadow-xs hover:-translate-y-0.5',
              activeTab === k.tab && viewMode === 'list'
                ? 'bg-surface-2 ring-2 ring-primary/40 border-primary'
                : 'bg-surface/75 hover:bg-surface-2/80',
              k.border
            )}
          >
            <div className="text-[11px] font-semibold text-ink-3 truncate">{k.label}</div>
            <div className={clsx('mt-1 text-2xl font-black tabular tracking-tight', k.color)}>
              {k.value}
            </div>
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <Input
            placeholder="Search by title, Content ID (e.g. SAG-001), or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm"
          />
          <Button
            size="sm"
            variant="secondary"
            icon={<SlidersHorizontal size={14} />}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            Filters
          </Button>
          {(selectedClient || selectedType || selectedPlatform || selectedAssignee || search) && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X size={14} />}
              onClick={() => {
                setSelectedClient('');
                setSelectedType('');
                setSelectedPlatform('');
                setSelectedAssignee('');
                setSearch('');
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* View Mode & Calendar Switcher */}
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
              {(['month', 'week', 'day'] as CalendarMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCalMode(mode)}
                  className={clsx(
                    'rounded-md px-3 py-1 text-xs font-bold capitalize transition-all',
                    calMode === mode
                      ? 'bg-surface text-ink shadow-xs'
                      : 'text-ink-3 hover:text-ink'
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => moveCal(-1)}><ChevronLeft size={16} /></Button>
              <span className="min-w-[140px] text-center text-xs font-bold text-ink">{calTitle}</span>
              <Button size="sm" variant="ghost" onClick={() => moveCal(1)}><ChevronRight size={16} /></Button>
              <Button size="sm" variant="secondary" onClick={() => setCurDate(sod(new Date()))}>Today</Button>
            </div>
          </div>
        )}
      </div>

      {/* Extended Filters Drawer */}
      {filtersOpen && (
        <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-line/70 bg-surface/90 p-4 shadow-lift sm:grid-cols-4 animate-rise">
          <div>
            <label className="text-[11px] font-bold text-ink-3">Client</label>
            <Select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
              <option value="">All Clients</option>
              {(clients.data || []).map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-3">Content Type</label>
            <Select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
              <option value="">All Types</option>
              <option value="REEL">Reel</option>
              <option value="POST">Post (Graphic)</option>
              <option value="CAROUSEL">Carousel</option>
              <option value="AI_REEL">AI Reel</option>
              <option value="AI_IMAGE">AI Image</option>
              <option value="STORY">Story</option>
              <option value="AD">Ad Creative</option>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-3">Platform</label>
            <Select value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)}>
              <option value="">All Platforms</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="YOUTUBE">YouTube</option>
              <option value="LINKEDIN">LinkedIn</option>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-ink-3">Assigned Team</label>
            <Select value={selectedAssignee} onChange={(e) => setSelectedAssignee(e.target.value)}>
              <option value="">All Team Members</option>
              {(team.data || []).map((u) => (
                <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' ? (
        <Card pad={false} className="overflow-hidden">
          {calMode === 'month' && (
            <div className="grid grid-cols-7 border-b border-line bg-surface-2/40 text-center text-xs font-bold text-ink-2 py-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
          )}

          <div className={clsx(
            'grid',
            calMode === 'month' ? 'grid-cols-7 divide-x divide-y divide-line' :
            calMode === 'week' ? 'grid-cols-7 divide-x divide-line' :
            'grid-cols-1'
          )}>
            {calRange.days.map((day) => {
              const k = dateKey(day);
              const items = itemsByDay[k] || [];
              const isToday = k === dateKey(new Date());
              const isCurMonth = day.getMonth() === curDate.getMonth();

              return (
                <div
                  key={k}
                  className={clsx(
                    'min-h-[120px] p-2 transition-colors flex flex-col justify-between',
                    calMode === 'day' ? 'min-h-[300px]' : '',
                    !isCurMonth && calMode === 'month' ? 'bg-surface/30 opacity-60' : 'bg-surface/80',
                    isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/40' : ''
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={clsx(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                      isToday ? 'bg-primary text-white shadow-xs' : 'text-ink-2'
                    )}>
                      {day.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span className="text-[10px] font-bold text-ink-3">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[140px] pr-0.5">
                    {items.slice(0, 4).map((c) => (
                      <div
                        key={c._id}
                        onClick={() => nav(`/content/${c._id}`)}
                        className="group flex flex-col gap-0.5 rounded-lg border border-line/60 bg-surface-2/80 p-1.5 text-left text-xs cursor-pointer hover:border-primary/50 hover:bg-surface-3 transition-all shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-black text-indigo-500">{c.contentId}</span>
                          <span className="text-[10px] font-bold text-ink-3 truncate max-w-[80px]">{c.clientId?.name}</span>
                        </div>
                        <div className="font-semibold text-ink truncate group-hover:text-primary transition-colors text-[11px]">
                          {c.title}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <StatusBadge c={c} />
                          {c.stage === 'SCHEDULE' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPublishModalContent(c);
                              }}
                              className="text-[10px] font-bold text-emerald-500 hover:underline flex items-center gap-0.5"
                            >
                              Publish <ArrowRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {items.length > 4 && (
                      <button
                        onClick={() => {
                          setCurDate(day);
                          setCalMode('day');
                        }}
                        className="w-full text-center text-[10px] font-bold text-primary hover:underline py-0.5"
                      >
                        +{items.length - 4} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* PIPELINE / SECTION LIST VIEW */
        <div className="space-y-4">
          {/* Section Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-line">
            {[
              { id: 'SCHEDULED', label: 'Scheduled', count: m.scheduled },
              { id: 'READY_TO_SCHEDULE', label: 'Ready to Schedule', count: m.readyToSchedule },
              { id: 'DUE_TODAY', label: 'Due Today', count: m.dueToday },
              { id: 'OVERDUE', label: 'Overdue', count: m.overdue },
              { id: 'UPCOMING', label: 'Upcoming', count: allItems.filter(c => c.plannedPublicationDate && dateKey(new Date(c.plannedPublicationDate)) > dateKey(new Date())).length },
              { id: 'PENDING_APPROVAL', label: 'Pending Approval', count: m.awaitingApproval },
              { id: 'POSTED', label: 'Posted', count: m.posted },
              { id: 'CANCELLED', label: 'Cancelled', count: m.cancelled },
              { id: 'ALL', label: 'All Content', count: allItems.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
                className={clsx(
                  'flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-xs font-bold transition-all border-b-2',
                  activeTab === tab.id
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-ink-3 hover:text-ink hover:bg-surface-2/60'
                )}
              >
                <span>{tab.label}</span>
                <span className={clsx(
                  'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                  activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-ink-3'
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab Content List */}
          {filteredItems.length === 0 ? (
            <Card>
              <Empty
                title={`No content in ${label(activeTab)}`}
                hint="Items will appear here automatically when they enter this stage in the workflow."
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {filteredItems.map((c) => {
                const isItemOverdue = isOverdue(c.deadline, c.status === 'COMPLETED' || c.stage === 'PUBLISHED');
                return (
                  <Card key={c._id} pad={false} className="p-4 hover:border-primary/40 transition-all">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <ContentThumb content={c} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-indigo-500 dark:text-indigo-400">
                              {c.contentId}
                            </span>
                            <span className="text-xs font-semibold text-ink-2">· {c.clientId?.name}</span>
                            <TypeBadge t={c.type} />
                            <PlatformBadge p={c.platform} />
                          </div>
                          <h3
                            onClick={() => nav(`/content/${c._id}`)}
                            className="mt-1 text-base font-bold text-ink hover:text-primary cursor-pointer truncate transition-colors"
                          >
                            {c.title}
                          </h3>
                          <div className="mt-1 flex items-center gap-3 text-xs text-ink-3 flex-wrap">
                            {c.plannedPublicationDate ? (
                              <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400 flex items-center gap-1">
                                <CalendarDays size={13} />
                                Publication: {fmtDate(c.plannedPublicationDate)} {c.plannedPublicationTime || ''}
                              </span>
                            ) : c.deadline ? (
                              <span className={clsx('flex items-center gap-1 font-medium', isItemOverdue ? 'text-rose-600 font-bold' : '')}>
                                <Clock size={13} />
                                Deadline: {fmtDateTime(c.deadline)}
                              </span>
                            ) : null}

                            <span>Stage: <strong className="text-ink-2">{label(c.stage)}</strong></span>
                            <span>Owner: <strong className="text-ink-2">{c.currentOwner?.name || 'Unassigned'}</strong></span>
                          </div>

                          {/* Live URL if published */}
                          {c.liveUrl && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <ExternalLink size={13} />
                              <a href={c.liveUrl} target="_blank" rel="noreferrer" className="hover:underline truncate max-w-md">
                                {c.liveUrl}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <StatusBadge c={c} />

                        {c.stage !== 'PUBLISHED' && c.productionStatus !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<CalendarDays size={14} />}
                            onClick={() => {
                              setScheduleModalContent(c);
                              setScheduleDate(c.plannedPublicationDate ? dateKey(new Date(c.plannedPublicationDate)) : '');
                              setScheduleTime(c.plannedPublicationTime || '18:00');
                            }}
                          >
                            {c.plannedPublicationDate ? 'Reschedule' : 'Schedule'}
                          </Button>
                        )}

                        {c.stage === 'SCHEDULE' && c.productionStatus !== 'POSTED' && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Send size={14} />}
                            onClick={() => {
                              setPublishModalContent(c);
                              setLiveUrlInput(c.liveUrl || '');
                            }}
                          >
                            Mark Posted
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => nav(`/content/${c._id}`)}
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MARK AS PUBLISHED / LIVE URL MODAL */}
      {publishModalContent && (
        <Modal
          open={!!publishModalContent}
          onClose={() => setPublishModalContent(null)}
          title={`Publish Content: ${publishModalContent.contentId}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Marking <strong>{publishModalContent.title}</strong> as posted records the official publication timestamp and synchronizes the live URL with the Google Sheet.
            </p>

            <div>
              <label className="text-xs font-bold text-ink-2 block mb-1">Live Social Media Post URL</label>
              <Input
                placeholder="https://www.instagram.com/p/... or https://youtube.com/shorts/..."
                value={liveUrlInput}
                onChange={(e) => setLiveUrlInput(e.target.value)}
                autoFocus
              />
              <span className="text-[11px] text-ink-3 mt-1 block">
                Provide the link to the live reel or post so clients and team members can view it directly.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPublishModalContent(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={publishMut.isPending}
                icon={<CheckCircle2 size={16} />}
                onClick={() => publishMut.mutate({ id: publishModalContent._id, liveUrl: liveUrlInput })}
              >
                Confirm Published
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* SCHEDULE MODAL */}
      {scheduleModalContent && (
        <Modal
          open={!!scheduleModalContent}
          onClose={() => setScheduleModalContent(null)}
          title={`Schedule Publication: ${scheduleModalContent.contentId}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Set the planned publication date and time for <strong>{scheduleModalContent.title}</strong>.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-ink-2 block mb-1">Publication Date</label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-ink-2 block mb-1">Publication Time (IST)</label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setScheduleModalContent(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={scheduleMut.isPending}
                disabled={!scheduleDate}
                icon={<CalendarDays size={16} />}
                onClick={() => scheduleMut.mutate({
                  id: scheduleModalContent._id,
                  date: scheduleDate,
                  time: scheduleTime
                })}
              >
                Save Schedule
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
