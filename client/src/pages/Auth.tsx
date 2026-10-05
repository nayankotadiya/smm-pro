import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Eye, EyeOff, ArrowRight, Sparkles, Zap, Shield, Users } from 'lucide-react';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Field, Input } from '@/components/ui';
import { Logo, LogoMark } from '@/components/Logo';
import { ThemeToggle } from '@/components/Header';
import { STAGES, label } from '@/lib/format';

/** Floating animated feature badge */
function FeatureBadge({ icon: Icon, label, delay = 0 }: { icon: any; label: string; delay?: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 backdrop-blur-md border border-white/12 text-white/80 text-[12px] font-semibold animate-rise"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Icon size={13} className="text-indigo-300" strokeWidth={2.2} />
      {label}
    </div>
  );
}

/** Left brand panel */
function BrandPanel() {
  const shown = STAGES.slice(0, 12);
  const reached = 7;
  return (
    <aside
      className="relative hidden w-[48%] max-w-[600px] flex-col justify-between overflow-hidden lg:flex"
      style={{ background: 'linear-gradient(145deg, #080d1a 0%, #0e1630 40%, #111c38 100%)' }}
      aria-hidden
    >
      {/* Animated aurora orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-orb-1 absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-violet-600/40 blur-[90px]" />
        <div className="aurora-orb-2 absolute -right-16 top-0 h-[440px] w-[440px] rounded-full bg-indigo-500/35 blur-[100px]" />
        <div className="aurora-orb-3 absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/25 blur-[80px]" />
        <div className="aurora-orb-1 absolute right-0 bottom-1/3 h-[300px] w-[300px] rounded-full bg-fuchsia-600/20 blur-[100px]" />
      </div>

      {/* Subtle dot grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse at 30% 30%, #000 0%, transparent 65%)',
        }}
      />

      {/* Top logo */}
      <div className="relative z-10 flex items-center gap-2.5 p-8">
        <LogoMark size={32} />
        <div>
          <div className="text-[15px] font-bold tracking-tight text-white">SMM PRO</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Content Operations</div>
        </div>
      </div>

      {/* Main headline content */}
      <div className="relative z-10 px-8 pb-2">
        <div className="mb-5 flex flex-wrap gap-2">
          <FeatureBadge icon={Zap} label="Automated Workflows" delay={80} />
          <FeatureBadge icon={Shield} label="Client Approvals" delay={150} />
          <FeatureBadge icon={Users} label="Team Workload" delay={220} />
          <FeatureBadge icon={Sparkles} label="Live Publishing" delay={290} />
        </div>

        <h2 className="animate-rise max-w-xs text-[34px] font-extrabold leading-[1.08] tracking-[-0.035em] text-white" style={{ animationDelay: '40ms' }}>
          From brief<br />to published,<br />
          <span className="bg-gradient-to-r from-indigo-300 via-violet-200 to-cyan-300 bg-clip-text text-transparent">in one place.</span>
        </h2>
        <p className="mt-4 max-w-[300px] animate-rise text-[13.5px] leading-6 text-white/50" style={{ animationDelay: '100ms' }}>
          Scripts, shoots, edits, approvals and scheduling — every step tracked and moving forward automatically.
        </p>

        {/* Workflow checklist */}
        <ol className="mt-8 grid max-w-[340px] grid-cols-2 gap-x-5 gap-y-2.5">
          {shown.map((s, i) => (
            <li
              key={s}
              className="flex animate-rise items-center gap-2.5 text-[12.5px]"
              style={{ animationDelay: `${200 + i * 50}ms` }}
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all ${
                  i < reached
                    ? 'border-transparent bg-indigo-500'
                    : i === reached
                    ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_8px_rgba(99,102,241,0.6)]'
                    : 'border-white/15'
                }`}
              >
                {i < reached ? (
                  <Check size={11} strokeWidth={3} className="text-white" />
                ) : i === reached ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                ) : null}
              </span>
              <span className={i < reached ? 'text-white/85' : i === reached ? 'font-semibold text-white/95' : 'text-white/35'}>
                {label(s)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Bottom footer */}
      <div className="relative z-10 p-8">
        <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-4 backdrop-blur-md border border-white/10">
          <div className="flex -space-x-2">
            {['A', 'R', 'K', 'M'].map((l, i) => (
              <div
                key={l}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0e1630] bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white shadow-sm"
                style={{ zIndex: 4 - i }}
              >
                {l}
              </div>
            ))}
          </div>
          <div>
            <div className="text-[12px] font-semibold text-white/85">Trusted by 40+ agency teams</div>
            <div className="text-[11px] text-white/40">Average 3.2× faster content pipeline</div>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-white/30">Internal workspace · Team members only</p>
      </div>
    </aside>
  );
}

/** Right auth form frame */
function Frame({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-canvas">
      <BrandPanel />
      <main className="relative flex flex-1 flex-col items-center justify-center bg-canvas px-4 py-10">
        {/* Background subtle glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-indigo-500/[0.06] blur-[120px] dark:bg-indigo-500/[0.12]" />
          <div className="absolute -right-24 bottom-0 h-[400px] w-[400px] rounded-full bg-violet-500/[0.05] blur-[100px] dark:bg-violet-500/[0.10]" />
        </div>

        {/* Top bar */}
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <ThemeToggle />
        </div>

        <div className="relative z-10 w-full max-w-[380px]">
          {/* Mobile logo */}
          <div className="mb-7 lg:hidden">
            <Logo size={32} />
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="!text-[26px] !leading-tight">{title}</h1>
            {sub && (
              <p className="mt-1.5 text-[14px] text-ink-2">{sub}</p>
            )}
          </div>

          {/* Form card */}
          <div className="card p-6 shadow-lift ring-1 ring-inset ring-white/[0.04]">
            {children}
          </div>

          {/* Mobile footer */}
          <p className="mt-5 text-center text-[12px] text-ink-3 lg:hidden">
            Internal workspace · Team members only
          </p>
        </div>
      </main>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export function Login() {
  const { user, setSession } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const f = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to="/" replace />;

  const submit = f.handleSubmit(async (v) => {
    setErr('');
    try {
      const r = await api.post('/auth/login', v);
      if (r.data.mfaRequired) {
        setMfaToken(r.data.mfaToken);
        return;
      }
      setSession(r.data.accessToken, r.data.user);
      nav('/');
    } catch (e) {
      setErr(errMsg(e));
    }
  });

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim() || !mfaToken) return;
    setErr('');
    setMfaLoading(true);
    try {
      const r = await api.post('/auth/mfa/verify-login', {
        mfaToken,
        code: mfaCode.trim(),
      });
      setSession(r.data.accessToken, r.data.user);
      nav('/');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setMfaLoading(false);
    }
  };

  if (mfaToken) {
    return (
      <Frame title="Two-Factor Authentication" sub="Enter the 6-digit code from your authenticator app or an emergency recovery code.">
        <form onSubmit={submitMfa} className="space-y-4" noValidate>
          <Field label="Verification code">
            <Input
              type="text"
              autoFocus
              placeholder="e.g. 123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="text-center tracking-widest font-mono text-[18px]"
              autoComplete="one-time-code"
            />
          </Field>

          {err && (
            <p
              role="alert"
              className="animate-rise flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger-ink"
            >
              {err}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full !h-11 text-[14.5px]"
            loading={mfaLoading}
            disabled={!mfaCode.trim()}
          >
            {mfaLoading ? 'Verifying…' : 'Verify & Sign in'}
            {!mfaLoading && <ArrowRight size={15} />}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setMfaToken(null); setMfaCode(''); setErr(''); }}
              className="link text-[13px]"
            >
              Back to email login
            </button>
          </div>
        </form>
      </Frame>
    );
  }

  return (
    <Frame title="Welcome back" sub="Sign in with your company account.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" error={f.formState.errors.email?.message}>
          <Input
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com"
            {...f.register('email')}
          />
        </Field>

        <Field label="Password" error={f.formState.errors.password?.message}>
          <span className="relative block">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              {...f.register('password')}
            />
            <button
              type="button"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow((v) => !v)}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 transition-all hover:bg-surface-2 hover:text-ink active:scale-90"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </Field>

        {err && (
          <p
            role="alert"
            className="animate-rise flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger-ink"
          >
            {err}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full !h-11 text-[14.5px]"
          loading={f.formState.isSubmitting}
        >
          {f.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          {!f.formState.isSubmitting && <ArrowRight size={15} />}
        </Button>

        <div className="text-center">
          <Link to="/forgot-password" className="link text-[13px]">
            Forgot password?
          </Link>
        </div>
      </form>
    </Frame>
  );
}


export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (x) {
      setErr(errMsg(x));
    }
    setBusy(false);
  };

  return (
    <Frame title="Reset password" sub={sent ? undefined : 'We will email you a reset link.'}>
      {sent ? (
        <div className="animate-rise space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success-ink ring-1 ring-success/30">
            <Check size={22} />
          </div>
          <p className="font-medium">
            If an account exists for <b>{email}</b>, a reset link is on its way.{' '}
            The link expires in 1 hour.
          </p>
          <p className="text-[13px] text-ink-2">
            No email? Ask your admin to reset your password from Settings.
          </p>
          <Link to="/login" className="link inline-flex items-center gap-1">
            <ArrowRight size={14} className="rotate-180" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={go} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              placeholder="you@company.com"
            />
          </Field>
          {err && <p className="text-[13px] text-danger-ink">{err}</p>}
          <Button type="submit" variant="primary" className="w-full !h-11" loading={busy}>
            Send reset link
          </Button>
          <div className="text-center">
            <Link to="/login" className="link text-[13px]">
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </Frame>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/auth/reset-password', { token: sp.get('token'), password: pw });
      nav('/login');
    } catch (x) {
      setErr(errMsg(x));
    }
    setBusy(false);
  };

  return (
    <Frame title="Choose a new password">
      <form onSubmit={go} className="space-y-4">
        <Field label="New password" hint="At least 8 characters.">
          <Input
            type="password"
            minLength={8}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        {err && <p className="text-[13px] text-danger-ink">{err}</p>}
        <Button type="submit" variant="primary" className="w-full !h-11" loading={busy}>
          Save password
        </Button>
      </form>
    </Frame>
  );
}
