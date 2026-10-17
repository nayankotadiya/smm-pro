import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  CalendarDays, Clock, CheckCircle2, AlertTriangle, Send, Share2,
  Filter, Search, SlidersHorizontal, X, ArrowRight, ExternalLink,
  ChevronLeft, ChevronRight, Eye, RefreshCw, Sparkles, Check, Play,
  Package, Film, Layers, Image as ImageIcon, Plus
} from 'lucide-react';
import { get, post, patch, errMsg } from '@/lib/api';
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { ContentThumb, StatusBadge, TypeBadge, PlatformBadge } from '@/components/Lists';
import { useClients, useTeam } from '@/hooks/useData';
import { fmtDate, fmtDateTime, fmtTime, isOverdue, label, getStatusMeta } from '@/lib/format';
import { toast } from '@/store/ui';

type TabKey = 'ALL' | 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'PENDING_APPROVAL' | 'READY_TO_SCHEDULE' | 'SCHEDULED' | 'POSTED' | 'CANCELLED';
type CalendarMode = 'month' | 'week' | 'day';
type BlockFilterKey = 'ALL' | 'PRODUCED' | 'PENDING' | 'SCHEDULED' | 'REELS' | 'POSTS' | 'CAROUSELS';

const blockFilterLabels: Record<BlockFilterKey, string> = {
  ALL: 'Monthly Target Quota (All Items)',
  PRODUCED: 'Produced & Completed Deliverables',
  PENDING: 'Pending Production / Remaining Deliverables',
  SCHEDULED: 'Scheduled for Publishing',
  REELS: 'Reels & Videos',
  POSTS: 'Posts & Graphics',
  CAROUSELS: 'Carousels',
};

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
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [activeBlockFilter, setActiveBlockFilter] = useState<BlockFilterKey | null>(null);
  const [calMode, setCalMode] = useState<CalendarMode>('month');
  const [curDate, setCurDate] = useState(() => sod(new Date()));

  const handleBlockClick = (key: BlockFilterKey) => {
    if (activeBlockFilter === key) {
      setActiveBlockFilter(null);
    } else {
      setActiveBlockFilter(key);
      setViewMode('list');
      if (key === 'SCHEDULED') {
        setActiveTab('SCHEDULED');
      } else {
        setActiveTab('ALL');
      }
    }
  };

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

  // Fetch Scheduling KPIs with Package Quota metrics
  const metricsQ = useQuery({
    queryKey: ['content', 'scheduling', 'metrics', selectedClient],
    queryFn: () => get<any>('/content/scheduling/metrics', { clientId: selectedClient || undefined }),
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

      // Active Block Filter (from top Hero & Breakdown Cards)
      if (activeBlockFilter) {
        if (activeBlockFilter === 'PRODUCED') {
          const isProduced = ['SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED' || c.approvalStatus === 'APPROVED_CLIENT' || c.productionStatus === 'POSTED';
          if (!isProduced) return false;
        } else if (activeBlockFilter === 'PENDING') {
          const isProduced = ['SCHEDULE', 'PUBLISHED'].includes(c.stage) || c.status === 'COMPLETED' || c.productionStatus === 'POSTED';
          const isCancelled = c.productionStatus === 'CANCELLED' || c.productionStatus === 'SHOOT_CANCELLED';
          if (isProduced || isCancelled) return false;
        } else if (activeBlockFilter === 'SCHEDULED') {
          const isScheduled = c.stage === 'SCHEDULE' || !!c.plannedPublicationDate || c.productionStatus === 'SCHEDULED';
          if (!isScheduled) return false;
        } else if (activeBlockFilter === 'REELS') {
          const t = (c.type || '').toUpperCase();
          if (!['REEL', 'VIDEO', 'SHORT', 'AI_REEL'].includes(t)) return false;
        } else if (activeBlockFilter === 'POSTS') {
          const t = (c.type || '').toUpperCase();
          if (!['POST', 'IMAGE', 'OTHER'].includes(t)) return false;
        } else if (activeBlockFilter === 'CAROUSELS') {
          const t = (c.type || '').toUpperCase();
          if (t !== 'CAROUSEL') return false;
        }
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
  }, [allItems, activeTab, search, selectedAssignee, activeBlockFilter]);

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

  const pkg = metricsQ.data?.packageOverview || {
    clientName: selectedClient ? ((clients.data || []).find((c) => c._id === selectedClient)?.name || 'Client') : 'All Clients',
    target: { reels: 0, posts: 0, carousels: 0, total: 0 },
    made: { reels: 0, posts: 0, carousels: 0, total: 0 },
    remaining: { reels: 0, posts: 0, carousels: 0, total: 0 },
    scheduled: { reels: 0, posts: 0, carousels: 0, total: 0 },
    readyToSchedule: 0,
    posted: 0,
    fulfillmentPct: 0,
    scheduledPct: 0,
    isFullyMade: true,
    pendingAlerts: [] as string[],
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

      {/* Client Monthly Package Quota & Scheduling Progress Section */}
      <div className="rounded-2xl border border-line/80 bg-surface/85 backdrop-blur-xl p-4 sm:p-5 shadow-card space-y-4">
        {/* Header & Client Selector Pills */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-line/60 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Package size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-ink tracking-tight">
                  Monthly Deliverables & Scheduling Status
                </h3>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3 uppercase tracking-wider">
                  Live Quota Tracker
                </span>
              </div>
              <p className="text-xs text-ink-3">
                Tracking {pkg.clientName || 'All Clients'}: Total Produced, Pending Production, and Scheduled deliverables
              </p>
            </div>
          </div>

          {/* Quick Client Filter Switcher */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none max-w-full">
            <button
              onClick={() => setSelectedClient('')}
              className={clsx(
                'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold transition-all',
                !selectedClient
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
              )}
            >
              All Clients
            </button>
            {(clients.data || []).map((c) => (
              <button
                key={c._id}
                onClick={() => setSelectedClient(c._id)}
                className={clsx(
                  'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1.5',
                  selectedClient === c._id
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink'
                )}
              >
                <span>{c.name}</span>
                {c.clientCode && (
                  <span className={clsx(
                    'text-[10px] rounded px-1',
                    selectedClient === c._id ? 'bg-white/20 text-white' : 'bg-surface-3 text-ink-3'
                  )}>
                    {c.clientCode}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Highlighted Alert Banner if Deliverables are Remaining to be made */}
        {pkg.remaining.total > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/15 p-3.5 shadow-sm animate-rise">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-500">
                      Deliverables Pending Production
                    </span>
                    <Badge t="amber">
                      ⚠️ {pkg.remaining.total} REMAINING
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-ink mt-0.5">
                    {pkg.pendingAlerts.length > 0
                      ? pkg.pendingAlerts.join(' · ') + ' required to fulfill this client’s monthly quota!'
                      : `${pkg.remaining.total} deliverable(s) remaining to reach monthly target.`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  onClick={() => nav('/content')}
                >
                  Create Deliverable
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 4 Core Hero Balance Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* 1. Target Quota */}
          <button
            type="button"
            onClick={() => handleBlockClick('ALL')}
            title="Click to view all deliverables for this client in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3.5 text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'ALL'
                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-surface bg-primary/10 shadow-md scale-[1.01]'
                : 'border-line bg-surface-2/60 hover:bg-surface-2 hover:border-line-2'
            )}
          >
            <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider flex items-center justify-between">
              <span className={activeBlockFilter === 'ALL' ? 'text-primary' : ''}>Monthly Target Quota</span>
              <div className="flex items-center gap-1">
                {activeBlockFilter === 'ALL' && <Check size={12} className="text-primary stroke-[3]" />}
                <Package size={14} className={activeBlockFilter === 'ALL' ? 'text-primary' : 'text-ink-3'} />
              </div>
            </div>
            <div className="mt-1.5 text-2xl font-black tabular tracking-tight text-ink">
              {pkg.target.total} <span className="text-xs font-medium text-ink-3">items</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink-2 truncate">
              {pkg.target.reels} Reels · {pkg.target.posts} Posts · {pkg.target.carousels} Carousels
            </div>
            <div className="mt-2 text-[10px] font-bold text-ink-4 group-hover:text-primary transition-colors flex items-center gap-1">
              {activeBlockFilter === 'ALL' ? '✓ Filter Active' : 'Click to filter ➔'}
            </div>
          </button>

          {/* 2. Made / Produced */}
          <button
            type="button"
            onClick={() => handleBlockClick('PRODUCED')}
            title="Click to view all produced & completed deliverables in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3.5 text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'PRODUCED'
                ? 'border-emerald-500 ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface bg-emerald-500/15 shadow-md scale-[1.01]'
                : 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
            )}
          >
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>Produced / Completed</span>
              <div className="flex items-center gap-1">
                {activeBlockFilter === 'PRODUCED' && <Check size={12} className="text-emerald-500 stroke-[3]" />}
                <CheckCircle2 size={14} className="text-emerald-500" />
              </div>
            </div>
            <div className="mt-1.5 text-2xl font-black tabular tracking-tight text-emerald-500">
              {pkg.made.total} <span className="text-xs font-semibold text-ink-3">/ {pkg.target.total}</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink-2 truncate">
              {pkg.fulfillmentPct}% Produced ({pkg.made.reels}R · {pkg.made.posts}P · {pkg.made.carousels}C)
            </div>
            <div className="mt-2 text-[10px] font-bold text-emerald-500/70 group-hover:text-emerald-500 transition-colors flex items-center gap-1">
              {activeBlockFilter === 'PRODUCED' ? '✓ Filter Active' : 'Click to filter ➔'}
            </div>
          </button>

          {/* 3. Remaining Deliverables to Make (Highlighted!) */}
          <button
            type="button"
            onClick={() => handleBlockClick('PENDING')}
            title="Click to view all deliverables currently pending production in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3.5 text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'PENDING'
                ? 'border-amber-500 ring-2 ring-amber-500 ring-offset-2 ring-offset-surface bg-amber-500/20 shadow-md scale-[1.01]'
                : pkg.remaining.total > 0
                  ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
                  : 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
            )}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
              <span className={pkg.remaining.total > 0 ? 'text-amber-500' : 'text-emerald-500'}>
                Pending Production / Remaining
              </span>
              <div className="flex items-center gap-1">
                {activeBlockFilter === 'PENDING' && <Check size={12} className="text-amber-500 stroke-[3]" />}
                {pkg.remaining.total > 0 ? (
                  <AlertTriangle size={14} className="text-amber-500 animate-bounce" />
                ) : (
                  <Check size={14} className="text-emerald-500" />
                )}
              </div>
            </div>
            <div className={clsx(
              'mt-1.5 text-2xl font-black tabular tracking-tight',
              pkg.remaining.total > 0 ? 'text-amber-500' : 'text-emerald-500'
            )}>
              {pkg.remaining.total > 0 ? (
                <span>⚠️ {pkg.remaining.total} <span className="text-xs font-medium text-amber-500/80">REMAINING</span></span>
              ) : (
                <span>0 <span className="text-xs font-medium text-emerald-500">Done 🎉</span></span>
              )}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink-2 truncate">
              {pkg.remaining.total > 0
                ? `${pkg.remaining.reels} Reels, ${pkg.remaining.posts} Posts, ${pkg.remaining.carousels} Carousels`
                : 'All monthly deliverables produced!'}
            </div>
            <div className="mt-2 text-[10px] font-bold text-amber-500/70 group-hover:text-amber-500 transition-colors flex items-center gap-1">
              {activeBlockFilter === 'PENDING' ? '✓ Filter Active' : 'Click to filter ➔'}
            </div>
          </button>

          {/* 4. Scheduled for Posting */}
          <button
            type="button"
            onClick={() => handleBlockClick('SCHEDULED')}
            title="Click to view all scheduled deliverables in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3.5 text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'SCHEDULED'
                ? 'border-fuchsia-500 ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-surface bg-fuchsia-500/15 shadow-md scale-[1.01]'
                : 'border-fuchsia-500/30 bg-fuchsia-500/5 hover:bg-fuchsia-500/10'
            )}
          >
            <div className="text-[11px] font-bold text-fuchsia-500 uppercase tracking-wider flex items-center justify-between">
              <span>Scheduled for Publishing</span>
              <div className="flex items-center gap-1">
                {activeBlockFilter === 'SCHEDULED' && <Check size={12} className="text-fuchsia-500 stroke-[3]" />}
                <CalendarDays size={14} className="text-fuchsia-500" />
              </div>
            </div>
            <div className="mt-1.5 text-2xl font-black tabular tracking-tight text-fuchsia-500">
              {pkg.scheduled.total} <span className="text-xs font-semibold text-ink-3">items</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink-2 truncate">
              {pkg.readyToSchedule} Ready to Schedule · {pkg.posted} Posted Live
            </div>
            <div className="mt-2 text-[10px] font-bold text-fuchsia-500/70 group-hover:text-fuchsia-500 transition-colors flex items-center gap-1">
              {activeBlockFilter === 'SCHEDULED' ? '✓ Filter Active' : 'Click to filter ➔'}
            </div>
          </button>
        </div>

        {/* Deliverables Breakdown by Type (Reels, Posts, Carousels) with progress */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Reels Breakdown */}
          <button
            type="button"
            onClick={() => handleBlockClick('REELS')}
            title="Click to view Reels & video deliverables in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3 flex flex-col justify-between text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'REELS'
                ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-surface bg-primary/10 shadow-md scale-[1.01]'
                : 'border-line bg-surface-2/40 hover:bg-surface-2/80'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Film size={14} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">Reels</span>
                    {activeBlockFilter === 'REELS' && <Check size={12} className="text-primary stroke-[3]" />}
                  </div>
                  <div className="text-[10px] text-ink-3">Target: {pkg.target.reels} Reels</div>
                </div>
              </div>
              {pkg.remaining.reels > 0 ? (
                <Badge t="amber">
                  ⚠️ {pkg.remaining.reels} REMAINING
                </Badge>
              ) : (
                <Badge t="green">
                  ✓ {pkg.made.reels} / {pkg.target.reels} Made
                </Badge>
              )}
            </div>
            <div className="mt-2.5 space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-ink-3">
                <span>Made: {pkg.made.reels}</span>
                <span>Scheduled: {pkg.scheduled.reels}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pkg.target.reels > 0 ? Math.min(100, (pkg.made.reels / pkg.target.reels) * 100) : 100}%` }}
                />
              </div>
            </div>
          </button>

          {/* Posts Breakdown */}
          <button
            type="button"
            onClick={() => handleBlockClick('POSTS')}
            title="Click to view Posts & graphics deliverables in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3 flex flex-col justify-between text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'POSTS'
                ? 'border-emerald-500 ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface bg-emerald-500/10 shadow-md scale-[1.01]'
                : 'border-line bg-surface-2/40 hover:bg-surface-2/80'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <ImageIcon size={14} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">Posts & Graphics</span>
                    {activeBlockFilter === 'POSTS' && <Check size={12} className="text-emerald-500 stroke-[3]" />}
                  </div>
                  <div className="text-[10px] text-ink-3">Target: {pkg.target.posts} Posts</div>
                </div>
              </div>
              {pkg.remaining.posts > 0 ? (
                <Badge t="amber">
                  ⚠️ {pkg.remaining.posts} REMAINING
                </Badge>
              ) : (
                <Badge t="green">
                  ✓ {pkg.made.posts} / {pkg.target.posts} Made
                </Badge>
              )}
            </div>
            <div className="mt-2.5 space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-ink-3">
                <span>Made: {pkg.made.posts}</span>
                <span>Scheduled: {pkg.scheduled.posts}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${pkg.target.posts > 0 ? Math.min(100, (pkg.made.posts / pkg.target.posts) * 100) : 100}%` }}
                />
              </div>
            </div>
          </button>

          {/* Carousels Breakdown */}
          <button
            type="button"
            onClick={() => handleBlockClick('CAROUSELS')}
            title="Click to view Carousel deliverables in the Pipeline List"
            className={clsx(
              'rounded-xl border p-3 flex flex-col justify-between text-left transition-all cursor-pointer relative group hover:-translate-y-0.5 shadow-2xs',
              activeBlockFilter === 'CAROUSELS'
                ? 'border-purple-500 ring-2 ring-purple-500 ring-offset-2 ring-offset-surface bg-purple-500/10 shadow-md scale-[1.01]'
                : 'border-line bg-surface-2/40 hover:bg-surface-2/80'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                  <Layers size={14} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink">Carousels</span>
                    {activeBlockFilter === 'CAROUSELS' && <Check size={12} className="text-purple-500 stroke-[3]" />}
                  </div>
                  <div className="text-[10px] text-ink-3">Target: {pkg.target.carousels} Carousels</div>
                </div>
              </div>
              {pkg.remaining.carousels > 0 ? (
                <Badge t="amber">
                  ⚠️ {pkg.remaining.carousels} REMAINING
                </Badge>
              ) : (
                <Badge t="green">
                  ✓ {pkg.made.carousels} / {pkg.target.carousels} Made
                </Badge>
              )}
            </div>
            <div className="mt-2.5 space-y-1">
              <div className="flex justify-between text-[11px] font-semibold text-ink-3">
                <span>Made: {pkg.made.carousels}</span>
                <span>Scheduled: {pkg.scheduled.carousels}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${pkg.target.carousels > 0 ? Math.min(100, (pkg.made.carousels / pkg.target.carousels) * 100) : 100}%` }}
                />
              </div>
            </div>
          </button>
        </div>
      </div>

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
          {/* Active Block Filter Indicator Banner */}
          {activeBlockFilter && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 shadow-sm animate-rise">
              <div className="flex items-center gap-2.5">
                <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold text-ink">
                  Filtering Deliverables by Block: <span className="text-primary font-black">{blockFilterLabels[activeBlockFilter]}</span>
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {filteredItems.length} matching {filteredItems.length === 1 ? 'deliverable' : 'deliverables'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveBlockFilter(null)}
                className="flex items-center gap-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 px-2.5 py-1 text-xs font-semibold text-ink-2 hover:text-ink transition-colors cursor-pointer border border-line"
              >
                <X size={13} />
                <span>Reset Block Filter</span>
              </button>
            </div>
          )}

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
