import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Mail, Lock, ArrowRight, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Input, Card } from '@/components/Ui';

interface PortalAuthConfig {
  authMethod: 'PASSWORD_ONLY' | 'OTP_ONLY' | 'HYBRID';
  magicLinkEnabled: boolean;
  defaultMethod: string;
}

export function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [portalConfig, setPortalConfig] = useState<PortalAuthConfig>({
    authMethod: 'PASSWORD_ONLY',
    magicLinkEnabled: true,
    defaultMethod: 'password',
  });

  // By default: Email & Password
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch administrator configured login methods
  useEffect(() => {
    api.get('/auth/config')
      .then((res) => {
        setPortalConfig(res.data);
        if (res.data.authMethod === 'OTP_ONLY') {
          setMode('otp');
        } else {
          setMode('password');
        }
      })
      .catch(() => {
        // Fallback to password by default
        setMode('password');
      });
  }, []);

  // Send WhatsApp OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/otp/send', { phone: phone.trim() });
      setOtpStep('verify');
      setSuccess('Verification code sent to your WhatsApp number.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send verification code. Please check your phone number.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/otp/verify', { phone: phone.trim(), code: code.trim() });
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Email & Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  const isHybrid = portalConfig.authMethod === 'HYBRID';
  const showPassword = portalConfig.authMethod === 'PASSWORD_ONLY' || (isHybrid && mode === 'password');
  const showOtp = portalConfig.authMethod === 'OTP_ONLY' || (isHybrid && mode === 'otp');

  return (
    <div className="min-h-screen bg-canvas relative flex flex-col justify-center items-center px-4 py-12 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="w-full max-w-md relative z-10">
        {/* Bulletproof Brands Header */}
        <div className="text-center mb-7">
          <div className="relative inline-flex items-center justify-center mb-3.5 group">
            <div
              className="absolute inset-0 rounded-full bg-red-600/30 blur-xl pointer-events-none -z-10 animate-pulse"
              style={{ animationDuration: '3.5s' }}
            />
            <img
              src="/brand/bulletproof-shield.png"
              alt="Bulletproof Brands Shield"
              className="h-20 w-20 sm:h-22 sm:w-22 object-contain drop-shadow-[0_8px_20px_rgba(239,68,68,0.45)] transition-transform duration-300 group-hover:scale-105"
              loading="eager"
            />
          </div>

          <div className="flex flex-col items-center select-none">
            <span className="text-[13px] font-black uppercase tracking-[0.25em] text-red-500 font-sans">
              BULLETPROOF BRANDS
            </span>
            <span className="text-[9px] font-extrabold uppercase tracking-[0.32em] text-ink-3 mt-0.5">
              IMPOSSIBLE TO IGNORE
            </span>

            <div className="mt-3.5 flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <h1 className="text-2xl font-extrabold text-ink tracking-tight">
                Client Portal
              </h1>
            </div>
            <p className="text-xs text-ink-2 mt-1.5 max-w-xs">
              Review scripts, sign off video edits & track real-time content deliverables
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8 shadow-2xl border-line/80 bg-surface/90 backdrop-blur-xl rounded-2xl relative">
          {/* Security Banner */}
          <div className="flex items-center justify-between text-[11px] text-ink-3 pb-3 mb-5 border-b border-line/60">
            <span className="flex items-center gap-1 font-semibold text-ink-2">
              <ShieldCheck size={14} className="text-emerald-500" /> Secure Client Session
            </span>
            <span className="font-semibold text-emerald-400">256-Bit Encrypted</span>
          </div>

          {/* Hybrid Mode Switcher (Visible only if Super Admin enabled both methods) */}
          {isHybrid && (
            <div className="flex rounded-xl bg-surface-2 p-1 mb-6 border border-line">
              <button
                type="button"
                onClick={() => { setMode('password'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'password'
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Mail size={14} className="text-primary" /> Email & Password
              </button>
              <button
                type="button"
                onClick={() => { setMode('otp'); setError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  mode === 'otp'
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                <MessageSquare size={14} className="text-emerald-500" /> WhatsApp OTP
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 text-xs font-medium text-danger-ink bg-danger-soft rounded-xl border border-danger/20">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-center gap-2 p-3 text-xs font-medium text-success-ink bg-success-soft rounded-xl border border-success/20">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Mode 1: Email & Password Login (Default) */}
          {showPassword && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full !py-3 font-semibold"
                loading={loading}
                icon={<Lock size={16} />}
              >
                Sign In
              </Button>
            </form>
          )}

          {/* Mode 2: WhatsApp OTP */}
          {showOtp && (
            <div>
              {otpStep === 'request' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <Input
                    label="WhatsApp Mobile Number"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full !py-3 font-semibold"
                    loading={loading}
                    icon={<ArrowRight size={16} />}
                  >
                    Send Verification Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2 mb-1.5">
                      Enter 6-Digit Code sent to {phone}
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="• • • • • •"
                      className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 px-4 rounded-xl border border-line bg-surface text-ink focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                      required
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="success"
                    className="w-full !py-3 font-semibold"
                    loading={loading}
                  >
                    Verify & Sign In
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setOtpStep('request'); setCode(''); }}
                    className="w-full text-center text-xs text-ink-3 hover:text-ink transition-colors mt-2"
                  >
                    Change phone number
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Client Footer */}
          <div className="mt-6 pt-5 border-t border-line/60 text-center space-y-2.5">
            <p className="text-xs text-ink-3">
              Need access or a password reset? Contact your agency account manager.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-ink-3">
              <span>Powered by</span>
              <span className="font-extrabold text-ink tracking-wider">BULLETPROOF BRANDS</span>
              <span className="text-red-500 font-bold">· SMM PRO</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
