import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Circle, CheckCircle2, Play, Film, Image as ImageIcon } from 'lucide-react';
import { Badge, Progress, Table, Priority, Empty } from './ui';
import { label, fmtDateTime, isOverdue, STAGES, ago } from '@/lib/format';
import { patch, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';

export function ContentThumb({ content, size = 'md' }: { content: any; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'h-9 w-9 min-w-[36px]' : 'h-10 w-10 min-w-[40px]';
  const mid = content.latestMediaId?._id || (typeof content.latestMediaId === 'string' ? content.latestMediaId : null);
  const mime = content.latestMediaId?.mimeType || '';
  const isVideo = mime.startsWith('video/') || ['REEL', 'VIDEO', 'SHORT'].includes(content.type);

  if (mid) {
    return (
      <div className={clsx('relative overflow-hidden rounded-xl bg-slate-100 dark:bg-surface-3 ring-1 ring-black/10 dark:ring-white/10 shadow-xs shrink-0', w)}>
        <img
          src={`/api/media/${mid}/stream`}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
        />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Play size={size === 'sm' ? 10 : 12} className="text-white fill-white ml-0.5 drop-shadow" />
          </div>
        )}
      </div>
    );
  }

  const isVid = ['REEL', 'VIDEO', 'SHORT'].includes(content.type);
  const isAd = content.type === 'AD';
  return (
    <div className={clsx(
      'flex shrink-0 items-center justify-center rounded-xl border shadow-xs transition-colors',
      w,
      isVid
        ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
        : isAd
          ? 'border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400'
          : 'border-pink-200 dark:border-pink-500/30 bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400'
    )}>
      {isVid ? <Film size={size === 'sm' ? 14 : 16} /> : <ImageIcon size={size === 'sm' ? 14 : 16} />}
    </div>
  );
}

export function ContentTable({ items, compact }: { items: any[]; compact?: boolean }) {
  const nav = useNavigate();
  if (!items.length) return <Empty title="No content here" hint="Content appears as soon as it is created or assigned." />;
  return (
    <>
      {/* phones: stacked rows, not a shrunken table */}
      <ul className="stagger divide-y divide-line md:hidden">
        {items.map((c) => (
          <li key={c._id}><Link to={`/content/${c._id}`} className="block px-4 py-3.5 transition-colors duration-150 active:bg-surface-2 hover:bg-surface-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <ContentThumb content={c} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">{c.title}</div>
                  <div className="mt-0.5 text-meta font-medium text-ink-2">{c.contentId} · {c.clientId?.name}</div>
                </div>
              </div>
              <StatusBadge c={c} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
              <span className="w-9 text-right text-meta font-semibold tabular text-ink-2">{c.progress}%</span>
            </div>
            <div className="mt-1.5 flex justify-between text-meta font-medium text-ink-2">
              <span>{label(c.stage)} · {c.currentOwner?.name || 'Unassigned'}</span>
              <span className={clsx(isOverdue(c.deadline, c.status === 'COMPLETED') ? 'font-semibold text-danger' : 'text-ink-3')}>{c.deadline ? fmtDateTime(c.deadline) : ''}</span>
            </div>
          </Link></li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table head={compact ? ['Content', 'Client', 'Stage', 'Progress', 'Owner', 'Deadline', 'Status'] : ['Content', 'Client', 'Type', 'Platform', 'Stage', 'Progress', 'Owner', 'Deadline', 'Status']} minWidth={compact ? 720 : 900}>
          {items.map((c) => (
            <tr key={c._id} onClick={() => nav(`/content/${c._id}`)} className="group cursor-pointer hover:bg-surface-2/80 transition-colors">
              <td className="td">
                <div className="flex items-center gap-3">
                  <ContentThumb content={c} />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink group-hover:text-primary-ink transition-colors truncate">{c.title}</div>
                    <div className="font-mono text-[11.5px] font-bold text-indigo-600 dark:text-indigo-400">{c.contentId}</div>
                  </div>
                </div>
              </td>
              <td className="td font-medium text-ink-2">{c.clientId?.name}</td>
              {!compact && <td className="td font-medium"><TypeBadge t={c.type} /></td>}
              {!compact && <td className="td font-medium"><PlatformBadge p={c.platform} /></td>}
              <td className="td">
                <StageBadge s={c.stage} />
              </td>
              <td className="td">
                <div className="flex w-28 items-center gap-2">
                  <Progress value={c.progress} tone={c.status === 'BLOCKED' ? 'red' : undefined} />
                  <span className="w-8 text-right text-meta font-bold tabular text-ink-2">{c.progress}%</span>
                </div>
              </td>
              <td className="td font-semibold text-ink">{c.currentOwner?.name || <span className="text-ink-3">Unassigned</span>}</td>
              <td className={clsx('td whitespace-nowrap text-meta font-semibold', isOverdue(c.deadline, c.status === 'COMPLETED') ? 'font-bold text-danger' : 'text-ink-2')}>
                {c.deadline ? fmtDateTime(c.deadline) : '—'}
              </td>
              <td className="td"><StatusBadge c={c} /></td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

export function PlatformBadge({ p }: { p: string }) {
  const pl = (p || '').toUpperCase();
  if (pl.includes('INSTAGRAM')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-300 dark:border-pink-500/40 bg-pink-100/90 dark:bg-pink-500/20 px-2.5 py-0.5 text-[11px] font-bold text-pink-950 dark:text-pink-200 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-pink-600 dark:bg-pink-400 shadow-[0_0_6px_#ec4899]" />
        Instagram
      </span>
    );
  }
  if (pl.includes('YOUTUBE')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 dark:border-red-500/40 bg-red-100/90 dark:bg-red-500/20 px-2.5 py-0.5 text-[11px] font-bold text-red-950 dark:text-red-200 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400 shadow-[0_0_6px_#ef4444]" />
        YouTube
      </span>
    );
  }
  if (pl.includes('LINKEDIN')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 dark:border-blue-500/40 bg-blue-100/90 dark:bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-950 dark:text-blue-200 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shadow-[0_0_6px_#3b82f6]" />
        LinkedIn
      </span>
    );
  }
  if (pl.includes('FACEBOOK')) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 dark:border-blue-600/40 bg-blue-100/90 dark:bg-blue-600/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-950 dark:text-blue-200 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shadow-[0_0_6px_#2563eb]" />
        Facebook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-line bg-slate-100 dark:bg-surface-3 px-2.5 py-0.5 text-[11px] font-bold text-slate-800 dark:text-slate-200">
      {label(p)}
    </span>
  );
}

export function StageBadge({ s }: { s: string }) {
  const stage = (s || '').toUpperCase();
  let color = 'bg-violet-100/90 dark:bg-violet-950/40 text-violet-950 dark:text-violet-200 border-violet-300 dark:border-violet-700/50';
  if (stage.includes('SHOOT') || stage.includes('RAW')) {
    color = 'bg-cyan-100/90 dark:bg-cyan-950/40 text-cyan-950 dark:text-cyan-200 border-cyan-300 dark:border-cyan-700/50';
  } else if (stage.includes('EDIT') || stage.includes('SMM')) {
    color = 'bg-pink-100/90 dark:bg-pink-950/40 text-pink-950 dark:text-pink-200 border-pink-300 dark:border-pink-700/50';
  } else if (stage.includes('REVIEW') || stage.includes('APPROVAL')) {
    color = 'bg-amber-100/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-700/50';
  } else if (stage.includes('PUBLISH')) {
    color = 'bg-emerald-100/90 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700/50';
  } else if (stage.includes('SCHEDULE')) {
    color = 'bg-blue-100/90 dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 border-blue-300 dark:border-blue-700/50';
  }

  return (
    <span className={clsx('inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-bold shadow-xs', color)}>
      {label(s)}
    </span>
  );
}

export function TypeBadge({ t }: { t: string }) {
  const tp = (t || '').toUpperCase();
  const c = tp.includes('REEL') 
    ? 'text-rose-950 dark:text-rose-200 bg-rose-100/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/50' 
    : tp.includes('VIDEO') 
      ? 'text-indigo-950 dark:text-indigo-200 bg-indigo-100/90 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700/50' 
      : tp.includes('AD') 
        ? 'text-purple-950 dark:text-purple-200 bg-purple-100/90 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700/50' 
        : tp.includes('POST') || tp.includes('CAROUSEL') 
          ? 'text-teal-950 dark:text-teal-200 bg-teal-100/90 dark:bg-teal-950/40 border-teal-300 dark:border-teal-700/50' 
          : tp.includes('STORY') 
            ? 'text-orange-950 dark:text-orange-200 bg-orange-100/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-700/50' 
            : 'text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-surface-3 border-slate-300 dark:border-line/70';
  return (
    <span className={clsx('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold shadow-xs', c)}>
      {label(t)}
    </span>
  );
}

export function StatusBadge({ c }: { c: any }) {
  if (c.status === 'BLOCKED') return <Badge status="BLOCKED" />;
  if (c.status === 'CHANGES_REQUESTED') return <Badge status="CHANGES_REQUESTED" />;
  if (c.status === 'COMPLETED') return <Badge status="COMPLETED">Published</Badge>;
  if (isOverdue(c.deadline)) return <Badge status="OVERDUE" />;
  return <Badge status="IN_PROGRESS" />;
}

export function WorkflowBar({ stage, blocked, onSelectStage }: { stage: string; blocked?: boolean; onSelectStage?: (stage: string) => void }) {
  const i = STAGES.indexOf(stage);
  return (
    <div className="overflow-x-auto pb-2 pt-1" style={{ scrollbarWidth: 'thin' }}>
      <ol className="flex min-w-[880px] items-start px-1">
        {STAGES.map((s, n) => {
          const done = n < i; const cur = n === i;
          return (
            <li
              key={s}
              className={clsx(
                'group relative flex-1 text-center transition-transform',
                onSelectStage && 'cursor-pointer'
              )}
              onClick={() => onSelectStage?.(s)}
              title={onSelectStage ? `Jump to ${label(s)}` : label(s)}
            >
              {n > 0 && (
                <span className="absolute right-1/2 top-[14px] h-[3px] w-full rounded-full bg-slate-300 dark:bg-white/20">
                  <span
                    className={clsx(
                      'block h-full origin-left rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_14px_rgba(168,85,247,0.9)]',
                      n <= i ? 'animate-grow' : 'hidden'
                    )}
                    style={{ animationDelay: `${n * 50}ms`, animationDuration: '0.4s' }}
                  />
                </span>
              )}
              <span className="relative z-10 mx-auto flex h-8 w-8 items-center justify-center">
                {cur && !blocked && <span className="absolute inset-0 animate-ping rounded-full bg-primary/45 opacity-75" />}
                <span
                  className={clsx(
                    'relative flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold transition-all duration-300',
                    done
                      ? 'border border-transparent bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white shadow-[0_0_16px_rgba(139,92,246,0.7)] group-hover:scale-110'
                      : cur
                        ? (blocked
                            ? 'border-2 border-danger bg-danger/25 text-white shadow-[0_0_16px_rgba(244,63,94,0.6)] ring-2 ring-danger/40 group-hover:scale-110'
                            : 'border-2 border-primary bg-gradient-to-br from-indigo-600/35 to-purple-600/35 text-white shadow-[0_0_20px_rgba(139,92,246,0.85)] ring-2 ring-primary group-hover:scale-110')
                        : 'border border-slate-300 dark:border-white/25 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-bold shadow-xs group-hover:border-primary/70 group-hover:text-primary-ink group-hover:bg-primary/10 group-hover:scale-105'
                  )}
                >
                  {done ? <Check size={14} strokeWidth={3} className="animate-spin-in text-white" style={{ animationDelay: `${n * 50}ms` }} /> : n + 1}
                </span>
              </span>
              <span
                className={clsx(
                  'mt-2.5 inline-block max-w-full px-1 text-[11px] leading-tight transition-colors duration-300',
                  cur
                    ? 'font-bold text-white bg-primary/25 border border-primary/50 rounded-full px-2 py-0.5 shadow-sm'
                    : done
                      ? 'font-semibold text-slate-700 dark:text-slate-200 group-hover:text-primary-ink'
                      : 'font-semibold text-slate-700 dark:text-slate-200 group-hover:text-ink dark:group-hover:text-white'
                )}
              >
                {label(s)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => patch(`/tasks/${id}`, { status }), onSuccess: (_d, v) => { if (v.status === 'COMPLETED') toast.success('Task completed.'); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['content-detail'] }); }, onError: (e) => toast.error(errMsg(e)) });
}
export function TaskList({ tasks, showAssignee = true, emptyText = 'No tasks' }: { tasks: any[]; showAssignee?: boolean; emptyText?: string }) {
  const done = useCompleteTask();
  if (!tasks.length) return <Empty title={emptyText} />;
  return (
    <ul className="stagger divide-y divide-line">
      {tasks.map((t) => {
        const complete = t.status === 'COMPLETED'; const over = isOverdue(t.dueAt, complete);
        return (
          <li key={t._id} className="group flex items-start gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-2">
            <button aria-label={complete ? 'Reopen task' : 'Mark complete'} title={complete ? 'Reopen' : 'Mark complete'} onClick={() => done.mutate({ id: t._id, status: complete ? 'TODO' : 'COMPLETED' })} className="-m-1.5 mt-[-2px] p-1.5 text-ink-3 transition-[color,transform] duration-150 hover:scale-110 hover:text-success-ink active:scale-90">{complete ? <CheckCircle2 size={19} className="animate-spin-in text-success-ink" /> : <Circle size={19} />}</button>
            <Link to={`/tasks/${t._id}`} className="min-w-0 flex-1">
              <div className={clsx('truncate font-semibold transition-colors duration-200 group-hover:text-primary-ink', complete ? 'text-ink-3 line-through' : 'text-ink')}>{t.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta font-medium text-ink-2">
                {t.contentId?.contentId && <span className="font-mono text-ink-3">{t.contentId.contentId}</span>}{t.clientId?.name && <span>{t.clientId.name}</span>}
                {showAssignee && <span className="text-ink">{t.assignedTo?.name || 'Unassigned'}</span>}<Priority p={t.priority} />
                {t.source === 'AUTOMATIC' && <span className="text-ink-3">Automatic</span>}
              </div>
            </Link>
            <div className="shrink-0 text-right"><div className={clsx('text-meta font-medium', over ? 'font-semibold text-danger' : 'text-ink-2')}>{t.dueAt ? fmtDateTime(t.dueAt) : 'No due date'}</div>{!complete && t.status !== 'TODO' && <div className="mt-0.5"><Badge status={over && t.status === 'OVERDUE' ? 'OVERDUE' : t.status} /></div>}</div>
          </li>
        );
      })}
    </ul>
  );
}
export function ActivityFeed({ items, limit }: { items: any[]; limit?: number }) {
  if (!items.length) return <Empty title="No activity yet" />;
  return <ul className="divide-y divide-line">{items.slice(0, limit || items.length).map((a) => <li key={a._id} className="flex animate-rise items-start justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-2"><div className="min-w-0"><div className="text-[13px] font-medium text-ink">{a.message}</div>{a.contentId?.contentId && <Link to={`/content/${a.contentId._id}`} className="text-meta font-mono font-medium text-ink-3 hover:text-primary-ink">{a.contentId.contentId}</Link>}</div><span className="shrink-0 text-meta text-ink-3">{ago(a.createdAt)}</span></li>)}</ul>;
}
