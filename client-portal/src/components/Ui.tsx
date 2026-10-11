import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin text-primary', className)} />;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const base = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] select-none';

  const variants = {
    primary: 'bg-primary text-white shadow-sm hover:bg-primary-hover active:bg-primary-hover',
    secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line/60',
    success: 'bg-success text-white shadow-sm hover:bg-success-hover',
    danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    outline: 'border border-line-strong text-ink hover:bg-surface-2',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-6 py-3.5 gap-2.5 font-semibold',
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={16} className="text-current" /> : icon}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-surface border border-line/70 rounded-2xl p-5 shadow-card transition-all',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
}) {
  const map = {
    primary: 'bg-primary-soft text-primary-ink border-primary/20',
    success: 'bg-success-soft text-success-ink border-success/20',
    warning: 'bg-warning-soft text-warning-ink border-warning/20',
    danger: 'bg-danger-soft text-danger-ink border-danger/20',
    neutral: 'bg-surface-2 text-ink-2 border-line',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        map[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Input({
  label,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <div className="w-full space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</label>}
      <input
        className={clsx(
          'w-full px-4 py-3 rounded-xl border border-line bg-surface text-ink text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-ink-3',
          error && 'border-danger focus:ring-danger/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger font-medium">{error}</p>}
    </div>
  );
}

export function Textarea({
  label,
  error,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <div className="w-full space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</label>}
      <textarea
        className={clsx(
          'w-full px-4 py-3 rounded-xl border border-line bg-surface text-ink text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-ink-3 min-h-[90px]',
          error && 'border-danger focus:ring-danger/20',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger font-medium">{error}</p>}
    </div>
  );
}
