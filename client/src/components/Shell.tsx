import { CheckCircle2, AlertCircle, Info, X, UploadCloud, RotateCw, WifiOff, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useUI } from '@/store/ui';
import { Progress, IconButton } from './ui';

export function Toasts() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 safe-b-4 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto relative flex w-full max-w-sm items-start gap-2.5 overflow-hidden rounded-lg border border-line bg-surface-raised px-3 py-2.5 shadow-pop', t.leaving ? 'animate-toast-out' : 'animate-toast-in')}>
          <span className={clsx('absolute inset-y-0 left-0 w-[3px]', t.kind === 'success' ? 'bg-success' : t.kind === 'error' ? 'bg-danger' : 'bg-primary')} aria-hidden />
          {t.kind === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 animate-spin-in text-success-ink" /> : t.kind === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0 animate-spin-in text-danger-ink" /> : <Info size={18} className="mt-0.5 shrink-0 animate-spin-in text-primary-ink" />}
          <div className="min-w-0 flex-1 text-body">{t.text}{t.action && <button className="link ml-2 font-medium" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}</div>
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-ink-3 transition-colors hover:text-ink"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

export function UploadTray() {
  const { uploads, removeUpload } = useUI();
  if (!uploads.length) return null;
  return (
    <div className="fixed left-4 right-4 z-[55] animate-modal-in overflow-hidden rounded-lg border border-line bg-surface-raised shadow-pop sm:left-auto sm:w-[340px]" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-meta font-medium text-ink-2"><UploadCloud size={15} /> Uploads</div>
      <ul className="max-h-56 divide-y divide-line overflow-y-auto">
        {uploads.map((u) => (
          <li key={u.id} className="animate-rise px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-medium">{u.fileName}</span>
              <span className={clsx('shrink-0 text-meta tabular', u.status === 'done' ? 'text-success-ink' : u.status === 'error' ? 'text-danger-ink' : 'text-ink-2')}>{u.status === 'uploading' ? `${u.progress}%` : u.status === 'processing' ? 'Finishing…' : u.status === 'done' ? 'Done' : u.status === 'cancelled' ? 'Cancelled' : 'Failed'}</span>
            </div>
            {(u.status === 'uploading' || u.status === 'processing') && <div className="mt-1.5 flex items-center gap-2"><Progress value={u.progress} />{u.cancel && u.status === 'uploading' && <button onClick={u.cancel} className="text-meta text-ink-2 transition-colors hover:text-danger-ink">Cancel</button>}</div>}
            {u.status === 'done' && <Progress value={100} tone="green" className="mt-1.5" />}
            {u.status === 'error' && <div className="mt-1 flex items-center justify-between gap-2"><span className="text-meta text-danger-ink">{u.error}</span><span className="flex items-center gap-1">{u.retry && <IconButton label="Retry" onClick={u.retry}><RotateCw size={15} /></IconButton>}<IconButton label="Dismiss" onClick={() => removeUpload(u.id)}><X size={15} /></IconButton></span></div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Subtle connection state — never a full-screen takeover */
export function ConnectionBar() {
  const { online, socketUp } = useUI();
  const [wasDown, setWasDown] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const down = !online || !socketUp;
  const [delayed, setDelayed] = useState(false);
  useEffect(() => { if (!down) { setDelayed(false); return; } const t = setTimeout(() => setDelayed(true), 4000); return () => clearTimeout(t); }, [down]);
  useEffect(() => {
    if (delayed) setWasDown(true);
    else if (wasDown && !down) { setShowBack(true); setWasDown(false); const t = setTimeout(() => setShowBack(false), 2500); return () => clearTimeout(t); }
  }, [delayed, down, wasDown]);
  if (delayed) return <div className="flex animate-slide-down items-center justify-center gap-2 bg-inverse px-3 py-1.5 text-meta text-inverse-ink"><WifiOff size={14} /> Connection lost. Changes will sync when connection returns.</div>;
  if (showBack) return <div className="flex animate-slide-down items-center justify-center gap-2 bg-success px-3 py-1.5 text-meta text-white"><Wifi size={14} /> Connected.</div>;
  return null;
}
