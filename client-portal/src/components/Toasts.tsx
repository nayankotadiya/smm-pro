import React from 'react';
import { useNotifications } from '@/store/notifications';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import clsx from 'clsx';

export function ToastsContainer() {
  const { toasts, removeToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2">
      {toasts.map((t) => {
        const isWarning = t.type === 'warning';
        const isSuccess = t.type === 'success';

        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-pop backdrop-blur-xl animate-fade-in transition-all',
              isWarning
                ? 'bg-amber-500/10 border-amber-500/30 text-ink dark:bg-amber-950/60'
                : isSuccess
                ? 'bg-emerald-500/10 border-emerald-500/30 text-ink dark:bg-emerald-950/60'
                : 'bg-surface/95 border-line text-ink'
            )}
          >
            <div className="shrink-0 mt-0.5">
              {isWarning ? (
                <AlertCircle size={18} className="text-amber-500" />
              ) : isSuccess ? (
                <CheckCircle2 size={18} className="text-emerald-500" />
              ) : (
                <Info size={18} className="text-primary" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-ink tracking-tight">{t.title}</h4>
              <p className="text-xs text-ink-2 mt-0.5 leading-snug line-clamp-2">{t.message}</p>
            </div>

            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 text-ink-3 hover:text-ink p-1 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
