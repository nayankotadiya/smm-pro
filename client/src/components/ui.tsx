import { ReactNode, ButtonHTMLAttributes, useEffect, useLayoutEffect, useRef, useState, forwardRef, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Loader2, X, AlertCircle, Inbox, RotateCw } from 'lucide-react';
import { label as toLabel, tone, initials, ago, formatLastSeen } from '@/lib/format';
import { useUI } from '@/store/ui';
import { usePresence, useCountUp } from '@/hooks/useMotion';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }

const V: Record<BtnVariant, string> = {
  primary: 'ios-gradient-btn text-white border-transparent',
  secondary: 'bg-surface/75 text-ink border-line/70 shadow-xs hover:border-line-strong hover:bg-surface-2/90 hover:-translate-y-0.5 backdrop-blur-xl',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-3/80 hover:text-ink',
  danger: 'bg-danger/10 text-danger-ink border-danger/25 shadow-xs hover:bg-danger/20 hover:border-danger/40',
  success: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-[0_4px_16px_-2px_rgba(16,185,129,0.45)] hover:brightness-110 hover:-translate-y-0.5',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, style, ...p }: BtnProps) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      style={style}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-semibold tracking-tight transition-all duration-200 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100',
        V[variant],
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-body sm:h-9',
        className
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}{children}
    </button>
  );
}

export function IconButton({ label, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-all duration-200 hover:bg-surface-3/80 hover:text-ink hover:scale-105 active:scale-90',
        className
      )}
    >
      {children}
    </button>
  );
}

const TONES = {
  neutral: 'bg-slate-100 dark:bg-surface-3/80 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-line/70',
  blue: 'bg-indigo-100/90 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.14)]',
  green: 'bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.14)]',
  amber: 'bg-amber-100/90 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 shadow-[0_0_12px_rgba(251,146,60,0.14)]',
  red: 'bg-rose-100/90 dark:bg-rose-500/20 text-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.14)]',
};

const DOTS = {
  neutral: 'bg-slate-600 dark:bg-ink-3',
  blue: 'bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_6px_#6366f1]',
  green: 'bg-emerald-600 dark:bg-emerald-400 shadow-[0_0_6px_#10b981]',
  amber: 'bg-amber-600 dark:bg-amber-400 shadow-[0_0_6px_#f59e0b]',
  red: 'bg-rose-600 dark:bg-rose-400 shadow-[0_0_6px_#f43f5e]',
};

export function Badge({ status, children, t, dot = true }: { status?: string; children?: ReactNode; t?: keyof typeof TONES; dot?: boolean }) {
  const k = t || tone(status);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-meta font-semibold backdrop-blur-sm', TONES[k])}>
      {dot && status !== undefined && <span className={clsx('h-1.5 w-1.5 rounded-full', DOTS[k])} />}
      {children ?? toLabel(status)}
    </span>
  );
}

export function Priority({ p }: { p?: string }) {
  const c = p === 'URGENT' ? 'bg-danger shadow-[0_0_6px_#f43f5e]' : p === 'HIGH' ? 'bg-warning shadow-[0_0_6px_#fb923c]' : p === 'MEDIUM' ? 'bg-primary shadow-[0_0_6px_#818cf8]' : 'bg-line-strong';
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-ink-2">
      <span className={clsx('h-1.5 w-1.5 rounded-full', c)} />
      {toLabel(p)}
    </span>
  );
}

export function Card({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('card animate-rise overflow-hidden min-w-0 max-w-full', className)}>
      {(title || action) && (
        <header className="flex min-h-[48px] items-center justify-between gap-3 border-b border-line/50 bg-surface-2/25 px-4 sm:px-5 py-3 backdrop-blur-sm">
          <h2 className="text-[14px] font-bold tracking-tight truncate">{title}</h2>
          <div className="shrink-0">{action}</div>
        </header>
      )}
      <div className={pad ? 'p-3.5 sm:p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]" aria-hidden />
          <h1 className="truncate text-[20px] sm:text-[24px] font-bold text-ink">{title}</h1>
        </div>
        {sub && <div className="mt-1.5 pl-3.5 text-[13px] font-medium text-ink-2">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pt-0.5 sm:justify-end">{actions}</div>}
    </div>
  );
}

export function Progress({ value, className, tone: tn }: { value: number; className?: string; tone?: 'blue' | 'red' | 'amber' | 'green' }) {
  const c = tn === 'red' ? 'from-rose-500 to-red-600 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
    : tn === 'amber' ? 'from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(251,146,60,0.5)]'
    : tn === 'green' ? 'from-emerald-400 to-teal-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]'
    : 'from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]';
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60 ring-1 ring-inset ring-black/5 dark:ring-white/10', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full origin-left animate-grow">
        <div className={clsx('h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-rose-500 to-pink-600',
  'from-fuchsia-500 to-purple-600',
  'from-sky-500 to-blue-600',
  'from-lime-500 to-green-600',
];

export function Avatar({
  name,
  avatarUrl,
  src,
  size = 30,
  className,
}: {
  name?: string;
  avatarUrl?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = !imgError ? (avatarUrl || src) : null;
  const idx = name ? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length : 0;

  if (imageSrc) {
    return (
      <span
        style={{ width: size, height: size }}
        className={clsx(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/20 bg-surface-2',
          className
        )}
        aria-hidden
      >
        <img
          src={imageSrc}
          alt={name || 'Avatar'}
          className="h-full w-full object-cover rounded-full"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-1 ring-inset ring-white/20 select-none',
        AVATAR_GRADIENTS[idx],
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function PresenceDot({ userId, className }: { userId?: string; className?: string }) {
  const pres = useUI((s) => (userId ? s.presence[userId] : undefined));
  const p = pres?.status || 'OFFLINE';
  const c = p === 'ONLINE' ? 'bg-success shadow-[0_0_6px_#34d399]' : p === 'AWAY' ? 'bg-warning shadow-[0_0_6px_#fb923c]' : p === 'DND' ? 'bg-danger shadow-[0_0_6px_#f43f5e]' : 'bg-line-strong';
  const tip = p === 'ONLINE' ? 'Online' : p === 'AWAY' ? `Away${pres?.lastActive ? ` · active ${ago(pres.lastActive)}` : ''}` : p === 'DND' ? 'Do Not Disturb' : (pres?.lastSeen || pres?.lastActive ? formatLastSeen(pres.lastSeen || pres.lastActive) : 'Offline');
  return (
    <span title={tip} className={clsx('inline-flex h-2 w-2', !className?.includes('absolute') && 'relative', className)}>
      {p === 'ONLINE' && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75" />}
      <span className={clsx('relative inline-block h-2 w-2 rounded-full ring-2 ring-surface transition-colors duration-300', c)} />
    </span>
  );
}

export function Spinner({ className }: { className?: string }) { return <Loader2 size={18} className={clsx('animate-spin text-primary-ink', className)} />; }
export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-10" style={{ width: `${100 - i * 8}%`, animationDelay: `${i * 90}ms` }} />)}</div>;
}
export function Empty({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3/70 text-ink-3 ring-1 ring-line/60 shadow-xs">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-meta font-medium text-ink-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex animate-rise flex-col items-center px-4 py-12 text-center">
      <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink ring-1 ring-danger/30">
        <AlertCircle size={22} />
      </div>
      <p className="font-semibold text-ink">{message}</p>
      {retry && <Button className="mt-4" size="sm" onClick={retry} icon={<RotateCw size={14} />}>Retry</Button>}
    </div>
  );
}

export function Async<T>({ q, children, empty, rows }: { q: { isLoading: boolean; isError: boolean; error: any; data: T | undefined; refetch: () => void }; children: (d: T) => ReactNode; empty?: ReactNode; rows?: number }) {
  if (q.isLoading) return <Loading rows={rows} />;
  if (q.isError) return <ErrorState message={q.error?.response?.data?.error?.message || 'Could not load this data.'} retry={() => q.refetch()} />;
  if (empty && (q.data == null || (Array.isArray(q.data) && q.data.length === 0))) return <>{empty}</>;
  return <>{children(q.data as T)}</>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const [mounted, closing] = usePresence(open, 180);
  const last = useRef({ title, children, footer });
  if (open) last.current = { title, children, footer };
  else ({ title, children, footer } = last.current);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={clsx('fixed inset-0 z-50 flex items-end justify-center bg-overlay/50 backdrop-blur-[6px] sm:items-center sm:p-4', closing ? 'animate-fade-out' : 'animate-fade-in')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={clsx('flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line/70 bg-surface-raised/90 backdrop-blur-2xl shadow-pop sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', closing ? 'animate-sheet-out sm:animate-modal-out' : 'animate-sheet-in sm:animate-modal-in')}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <header className="flex items-center justify-between border-b border-line/60 px-5 py-3.5"><h2 className="text-[16px] font-bold">{title}</h2><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></header>
        <div className="overflow-y-auto overscroll-y-contain p-5" style={{ WebkitOverflowScrolling: 'touch' }}>{children}</div>
        {footer && <footer className="safe-b-3 flex flex-wrap justify-end gap-2 border-t border-line/60 px-5 pt-3.5">{footer}</footer>}
      </div>
    </div>, document.body);
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  const measure = () => { const el = refs.current[value]; if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth }); };
  useLayoutEffect(measure, [value, tabs.length, tabs.map((t) => `${t.label}${t.count ?? ''}`).join('|')]); // eslint-disable-line
  useEffect(() => { const ro = new ResizeObserver(measure); if (wrap.current) ro.observe(wrap.current); document.fonts?.ready.then(measure); return () => ro.disconnect(); }, [value]); // eslint-disable-line
  useEffect(() => { refs.current[value]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }, [value]);
  return (
    <div className="-mx-4 mb-4 overflow-x-auto overscroll-x-contain border-b border-line/60 px-4 sm:mx-0 sm:px-0" role="tablist" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
      <div ref={wrap} className="relative flex min-w-max gap-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={clsx('flex items-center gap-2 py-3 text-body font-bold transition-all duration-200', value === t.key ? 'text-primary-ink' : 'text-ink-2 hover:text-ink')}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={clsx('rounded-full px-2 py-0.5 text-meta font-bold tabular transition-all duration-200', value === t.key ? 'bg-primary-soft text-primary-ink shadow-[0_0_8px_rgba(124,58,237,0.3)]' : 'bg-surface-3 text-ink-2')}>
                {t.count}
              </span>
            )}
          </button>
        ))}
        {bar && <span aria-hidden className="pointer-events-none absolute bottom-0 h-[2.5px] rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_10px_rgba(124,58,237,0.5)] transition-[left,width] duration-300 ease-out" style={{ left: bar.left, width: bar.width }} />}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { key: T; label: ReactNode; title?: string }[]; value: T; onChange: (k: T) => void; size?: 'sm' | 'md' }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => { const el = refs.current[value]; if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth }); }, [value, options.length]);
  return (
    <div className="relative inline-flex rounded-xl border border-line/70 bg-surface-2/80 p-1 backdrop-blur-md">
      {thumb && <span aria-hidden className="absolute bottom-1 top-1 rounded-[9px] bg-surface shadow-xs ring-1 ring-line/70 transition-[left,width] duration-300 ease-out" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => (
        <button
          key={o.key}
          ref={(el) => { refs.current[o.key] = el; }}
          title={o.title}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={clsx('relative z-10 flex items-center gap-1.5 rounded-[9px] font-bold transition-all duration-200', size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-1.5 text-[13px]', value === o.key ? 'text-ink' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-meta font-medium text-ink-3">{hint}</span>}
      {error && <span className="mt-1 block animate-rise text-meta font-semibold text-danger-ink">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={clsx('input', className)} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} {...p} className={clsx('input pr-8', className)}>{children}</select>);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} {...p} className={clsx('input', className)} />);

export function Table({ head, children, minWidth = 640 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="w-full max-w-full overflow-x-auto overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-line/60 bg-surface-2/60">{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr>
        </thead>
        <tbody className="stagger divide-y divide-line/60 [&>tr]:transition-colors [&>tr]:duration-150">{children}</tbody>
      </table>
    </div>
  );
}

function getStatPalette(label: string, tn?: 'red' | 'amber') {
  const l = label.toLowerCase();
  if (tn === 'red' || l.includes('overdue') || l.includes('block')) {
    return {
      bg: 'from-rose-500/25 to-red-600/30 text-rose-600 dark:text-rose-300 border-rose-500/40 shadow-[0_0_16px_rgba(244,63,94,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(244,63,94,0.45)]',
      borderHover: 'hover:border-rose-500/60 hover:shadow-[0_16px_36px_-4px_rgba(244,63,94,0.3)]',
      accent: 'from-rose-500 to-red-600',
      aura: 'bg-rose-500/20',
    };
  }
  if (tn === 'amber' || l.includes('review') || l.includes('attention') || l.includes('due') || l.includes('waiting')) {
    return {
      bg: 'from-amber-500/25 to-orange-500/30 text-amber-600 dark:text-amber-300 border-amber-500/40 shadow-[0_0_16px_rgba(251,146,60,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(251,146,60,0.45)]',
      borderHover: 'hover:border-amber-500/60 hover:shadow-[0_16px_36px_-4px_rgba(251,146,60,0.3)]',
      accent: 'from-amber-400 to-orange-500',
      aura: 'bg-amber-500/20',
    };
  }
  if (l.includes('client')) {
    return {
      bg: 'from-emerald-500/25 to-teal-500/30 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 shadow-[0_0_16px_rgba(52,211,153,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(52,211,153,0.45)]',
      borderHover: 'hover:border-emerald-500/60 hover:shadow-[0_16px_36px_-4px_rgba(52,211,153,0.3)]',
      accent: 'from-emerald-400 to-teal-500',
      aura: 'bg-emerald-500/20',
    };
  }
  if (l.includes('shoot')) {
    return {
      bg: 'from-cyan-500/25 to-sky-500/30 text-cyan-600 dark:text-cyan-300 border-cyan-500/40 shadow-[0_0_16px_rgba(6,182,212,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(6,182,212,0.45)]',
      borderHover: 'hover:border-cyan-500/60 hover:shadow-[0_16px_36px_-4px_rgba(6,182,212,0.3)]',
      accent: 'from-cyan-400 to-sky-500',
      aura: 'bg-cyan-500/20',
    };
  }
  if (l.includes('edit')) {
    return {
      bg: 'from-pink-500/25 to-fuchsia-600/30 text-pink-600 dark:text-pink-300 border-pink-500/40 shadow-[0_0_16px_rgba(236,72,153,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(236,72,153,0.45)]',
      borderHover: 'hover:border-pink-500/60 hover:shadow-[0_16px_36px_-4px_rgba(236,72,153,0.3)]',
      accent: 'from-pink-500 to-rose-500',
      aura: 'bg-pink-500/20',
    };
  }
  if (l.includes('script')) {
    return {
      bg: 'from-purple-500/25 to-violet-600/30 text-purple-600 dark:text-purple-300 border-purple-500/40 shadow-[0_0_16px_rgba(168,85,247,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(168,85,247,0.45)]',
      borderHover: 'hover:border-purple-500/60 hover:shadow-[0_16px_36px_-4px_rgba(168,85,247,0.3)]',
      accent: 'from-purple-500 to-violet-600',
      aura: 'bg-purple-500/20',
    };
  }
  if (l.includes('publish') || l.includes('complete')) {
    return {
      bg: 'from-teal-500/25 to-emerald-500/30 text-teal-600 dark:text-teal-300 border-teal-500/40 shadow-[0_0_16px_rgba(20,184,166,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(20,184,166,0.45)]',
      borderHover: 'hover:border-teal-500/60 hover:shadow-[0_16px_36px_-4px_rgba(20,184,166,0.3)]',
      accent: 'from-teal-400 to-emerald-500',
      aura: 'bg-teal-500/20',
    };
  }
  if (l.includes('schedule')) {
    return {
      bg: 'from-blue-500/25 to-indigo-600/30 text-blue-600 dark:text-blue-300 border-blue-500/40 shadow-[0_0_16px_rgba(59,130,246,0.3)]',
      glow: 'shadow-[0_0_24px_rgba(59,130,246,0.45)]',
      borderHover: 'hover:border-blue-500/60 hover:shadow-[0_16px_36px_-4px_rgba(59,130,246,0.3)]',
      accent: 'from-blue-400 to-indigo-500',
      aura: 'bg-blue-500/20',
    };
  }
  return {
    bg: 'from-indigo-500/25 to-purple-600/30 text-indigo-600 dark:text-indigo-300 border-indigo-500/40 shadow-[0_0_16px_rgba(124,58,237,0.3)]',
    glow: 'shadow-[0_0_24px_rgba(124,58,237,0.45)]',
    borderHover: 'hover:border-indigo-500/60 hover:shadow-[0_16px_36px_-4px_rgba(124,58,237,0.3)]',
    accent: 'from-indigo-500 to-purple-600',
    aura: 'bg-indigo-500/20',
  };
}

export function Stat({ label, value, hint, onClick, tone: tn, icon }: { label: string; value: ReactNode; hint?: string; onClick?: () => void; tone?: 'red' | 'amber'; icon?: ReactNode }) {
  const C: any = onClick ? 'button' : 'div';
  const numeric = typeof value === 'number';
  const n = useCountUp(numeric ? (value as number) : 0);
  const hot = numeric && (value as number) > 0;
  const p = getStatPalette(label, tn);

  return (
    <C
      onClick={onClick}
      className={clsx(
        'card group relative block w-full animate-rise overflow-hidden p-4 text-left transition-all duration-300 ease-out',
        onClick && clsx('hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.98]', p.borderHover)
      )}
    >
      {/* Ambient background hover glow bloom */}
      <div className={clsx('pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-40', p.aura)} aria-hidden />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold tracking-tight text-ink-2 transition-colors duration-200 group-hover:text-ink">
          {label}
        </span>
        {icon && (
          <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br border transition-all duration-300 group-hover:scale-110', p.bg, p.glow)}>
            {icon}
          </div>
        )}
      </div>
      <div className={clsx('relative z-10 mt-2 text-[30px] font-black leading-8 tracking-tight tabular text-ink transition-transform duration-200 group-hover:scale-[1.03]', tn === 'red' && hot && '!text-danger-ink', tn === 'amber' && hot && '!text-warning-ink')}>
        {numeric ? n : value}
      </div>
      {hint && <div className="relative z-10 mt-1 text-meta font-semibold text-ink-3">{hint}</div>}
      {onClick && (
        <span aria-hidden className={clsx('absolute inset-x-0 bottom-0 h-[2.5px] bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100', p.accent)} />
      )}
    </C>
  );
}

export function BarList({ rows, onPick, unit = '' }: { rows: { key: string; label: string; value: number }[]; onPick?: (key: string) => void; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => {
        const C: any = onPick ? 'button' : 'div';
        return (
          <li key={r.key}>
            <C
              onClick={onPick ? () => onPick(r.key) : undefined}
              title={`${r.label}: ${r.value}${unit}`}
              className={clsx('group grid w-full grid-cols-[minmax(96px,30%)_1fr_32px] items-center gap-3 rounded-xl px-2 py-2 text-left transition-all duration-150', onPick && 'hover:bg-surface-2/80')}
            >
              <span className="truncate text-meta font-semibold text-ink-2 transition-colors group-hover:text-ink">{r.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-3/80 ring-1 ring-inset ring-white/5">
                <span className="block h-full origin-left animate-grow rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-[width,filter] duration-500 group-hover:brightness-110 shadow-[0_0_8px_rgba(168,85,247,0.3)]" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0, animationDelay: `${i * 45}ms` }} />
              </span>
              <span className="text-right text-meta font-bold tabular">{r.value}</span>
            </C>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact date range picker — from/to inputs side by side with a clear button */
export function DateRangePicker({ from, to, onChange, className }: { from: string; to: string; onChange: (from: string, to: string) => void; className?: string }) {
  const presets: [string, string, string][] = [
    ['Today', new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
    ['This week', (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })(), new Date().toISOString().slice(0, 10)],
    ['This month', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
    ['Last 7 days', new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
    ['Last 30 days', new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)],
  ];
  const hasFilter = from || to;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-1.5 rounded-xl border border-line/70 bg-surface/80 px-2.5 py-1.5 backdrop-blur-md shadow-xs">
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
          className="bg-transparent text-[13px] font-medium text-ink outline-none w-28 sm:w-32"
        />
        <span className="text-ink-3">—</span>
        <input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
          className="bg-transparent text-[13px] font-medium text-ink outline-none w-28 sm:w-32"
        />
        {hasFilter && (
          <button
            aria-label="Clear date filter"
            onClick={() => onChange('', '')}
            className="ml-1 rounded-md p-0.5 text-ink-3 hover:bg-surface-3/80 hover:text-ink transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map(([label, f, t]) => (
          <button
            key={label}
            onClick={() => onChange(f, t)}
            className={clsx(
              'rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-all duration-150',
              from === f && to === t
                ? 'border-primary/50 bg-primary-soft text-primary-ink'
                : 'border-line/60 bg-surface-2/60 text-ink-2 hover:border-line-strong hover:text-ink'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
