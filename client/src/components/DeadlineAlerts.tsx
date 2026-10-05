import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, Camera, Clock, Hourglass, ArrowRight, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { get } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export function DeadlineAlertsBanner() {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'all' | 'shoots' | 'deadlines' | 'stalled'>('all');

  const q = useQuery({
    queryKey: ['dashboard', 'deadline-alerts'],
    queryFn: () => get<any>('/dashboard/deadline-alerts'),
    refetchInterval: 30000,
  });

  const d = q.data;
  const total = d?.totalCount || 0;
  const shoots: any[] = d?.shoots || [];
  const deadlines: any[] = d?.deadlines || [];
  const stalled: any[] = d?.stalledApprovals || [];

  if (q.isLoading) return null;
  if (!total) return null;

  const filteredItems = [
    ...(tab === 'all' || tab === 'shoots' ? shoots.map((x) => ({ ...x, kind: 'SHOOT' })) : []),
    ...(tab === 'all' || tab === 'deadlines' ? deadlines.map((x) => ({ ...x, kind: 'DEADLINE' })) : []),
    ...(tab === 'all' || tab === 'stalled' ? stalled.map((x) => ({ ...x, kind: 'STALLED' })) : []),
  ];

  return (
    <div className="card relative mb-5 overflow-hidden p-4 sm:p-5 border border-line shadow-card transition-all">
      {/* Sleek top accent line */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-indigo-500" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-500/30 shadow-xs">
            <AlertTriangle size={17} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold tracking-tight text-ink">Urgent Action & Deadlines</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                {total} {total === 1 ? 'critical item' : 'critical items'}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500 dark:text-slate-400">
              Scheduled shoots within 48h, approaching deadlines, and stalled client reviews.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented Filter Pills */}
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-surface-2 p-1 border border-slate-200/70 dark:border-white/10">
            {[
              { id: 'all', label: 'All', count: total },
              { id: 'shoots', label: 'Shoots', count: shoots.length },
              { id: 'deadlines', label: 'Deadlines', count: deadlines.length },
              { id: 'stalled', label: 'Stalled Reviews', count: stalled.length },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all',
                  tab === t.id
                    ? 'bg-white dark:bg-surface text-ink font-bold shadow-xs border border-black/5 dark:border-white/10'
                    : 'text-slate-600 dark:text-slate-400 hover:text-ink hover:bg-slate-200/50 dark:hover:bg-surface-3'
                )}
              >
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span
                    className={clsx(
                      'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                      tab === t.id
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                        : 'bg-slate-200 dark:bg-surface-3 text-slate-600 dark:text-slate-400'
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-surface hover:bg-surface-2 text-ink-2 hover:text-ink transition-colors shadow-xs"
            title={collapsed ? 'Expand alerts' : 'Collapse alerts'}
            aria-label="Toggle alert panel"
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>

      {/* Alert Items List */}
      {!collapsed && (
        <div className="mt-3.5 space-y-2.5">
          {filteredItems.slice(0, 5).map((item: any) => {
            if (item.kind === 'SHOOT') {
              return (
                <div
                  key={`shoot-${item._id}`}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/80 bg-slate-50/70 dark:bg-surface-2/40 px-3.5 py-2.5 hover:border-amber-400/50 hover:bg-amber-500/[0.03] transition-all shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300/80 dark:border-amber-500/30 shadow-xs">
                      <Camera size={15} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/content/${item.contentId}?tab=shooting`} className="font-bold text-ink hover:text-primary-ink text-[13px] transition-colors">
                          {item.title}
                        </Link>
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-surface-3 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10">
                          {item.code}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                          {item.isOverdue ? 'Shoot Overdue' : `Shoot in ${item.hoursRemaining}h`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                        <span>Client: <strong className="font-semibold text-ink">{item.clientName}</strong></span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>Shooter: <strong className="font-semibold text-ink">{item.shooterName}</strong></span>
                        {item.shootTime && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>Time: <strong className="font-medium text-ink">{item.shootTime}</strong></span>
                          </>
                        )}
                        {item.location && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>Loc: <strong className="font-medium text-ink">{item.location}</strong></span>
                          </>
                        )}
                        {item.remarksCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                            <MessageSquare size={11} /> {item.remarksCount} shooter {item.remarksCount === 1 ? 'remark' : 'remarks'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link to={`/content/${item.contentId}?tab=shooting`}>
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-line bg-white dark:bg-surface-3 px-3 py-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-200 shadow-xs hover:border-primary hover:text-primary-ink transition-colors">
                      Shoot Plan <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </Link>
                </div>
              );
            }

            if (item.kind === 'DEADLINE') {
              return (
                <div
                  key={`dl-${item._id}`}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/80 bg-slate-50/70 dark:bg-surface-2/40 px-3.5 py-2.5 hover:border-rose-400/50 hover:bg-rose-500/[0.03] transition-all shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-300/80 dark:border-rose-500/30 shadow-xs">
                      <Clock size={15} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/content/${item._id}`} className="font-bold text-ink hover:text-primary-ink text-[13px] transition-colors">
                          {item.title}
                        </Link>
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-surface-3 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10">
                          {item.code}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30">
                          {item.isOverdue ? 'Overdue' : `Due in ${item.hoursRemaining}h`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                        <span>Client: <strong className="font-semibold text-ink">{item.clientName}</strong></span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>Stage: <strong className="font-semibold text-ink">{item.stage}</strong></span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span>Owner: <strong className="font-semibold text-ink">{item.ownerName}</strong></span>
                      </div>
                    </div>
                  </div>
                  <Link to={`/content/${item._id}`}>
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-line bg-white dark:bg-surface-3 px-3 py-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-200 shadow-xs hover:border-primary hover:text-primary-ink transition-colors">
                      Open Content <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </Link>
                </div>
              );
            }

            // STALLED REVIEW
            const nudgeMsg = encodeURIComponent(
              `Hi ${item.recipientName || item.clientName}, gentle reminder to review the ${item.type === 'CLIENT_SCRIPT' ? 'script' : 'video'} for "${item.title}". Let us know if you need any adjustments!`
            );
            const waUrl = item.recipientPhone
              ? `https://wa.me/${item.recipientPhone.replace(/[^0-9]/g, '')}?text=${nudgeMsg}`
              : null;

            return (
              <div
                key={`stalled-${item._id}`}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/80 bg-slate-50/70 dark:bg-surface-2/40 px-3.5 py-2.5 hover:border-indigo-400/50 hover:bg-indigo-500/[0.03] transition-all shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-300/80 dark:border-indigo-500/30 shadow-xs">
                    <Hourglass size={15} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/content/${item.contentId}?tab=reviews`} className="font-bold text-ink hover:text-primary-ink text-[13px] transition-colors">
                        {item.title}
                      </Link>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-surface-3 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10">
                        {item.code}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/30">
                        {item.hoursWaiting >= 24 ? `${Math.round((item.hoursWaiting / 24) * 10) / 10}d waiting` : `${item.hoursWaiting}h waiting`}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                      <span>Client: <strong className="font-semibold text-ink">{item.clientName}</strong></span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>Sent: <strong className="font-semibold text-ink">{fmtDateTime(item.sentAt)}</strong></span>
                      {item.recipientPhone && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span>Tel: <strong className="font-medium text-ink">{item.recipientPhone}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer">
                      <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white shadow-xs transition-colors">
                        <MessageSquare size={13} /> WhatsApp Nudge
                      </button>
                    </a>
                  )}
                  <Link to={`/content/${item.contentId}?tab=reviews`}>
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-line bg-white dark:bg-surface-3 px-3 py-1.5 text-[12px] font-semibold text-slate-800 dark:text-slate-200 shadow-xs hover:border-primary hover:text-primary-ink transition-colors">
                      Review <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </Link>
                </div>
              </div>
            );
          })}

          {filteredItems.length > 5 && (
            <div className="text-center pt-1.5">
              <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                + {filteredItems.length - 5} more urgent items
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
