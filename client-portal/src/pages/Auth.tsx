import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  Check
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Input, Card } from '@/components/Ui';

interface PortalAuthConfig {
  authMethod: 'PASSWORD_ONLY' | 'OTP_ONLY' | 'HYBRID';
  magicLinkEnabled: boolean;
  defaultMethod: string;
}

interface TwoFactorChallenge {
  tempToken: string;
  destination: string;
  method?: string;
  message?: string;
}

export function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [portalConfig, setPortalConfig] = useState<PortalAuthConfig>({
    authMethod: 'PASSWORD_ONLY',
    magicLinkEnabled: true,
    defaultMethod: 'password',
  });

  // Login modes: password or whatsapp otp
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [phone, setPhone] = useState('');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // 2FA Challenge State
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load saved email and check remember preference on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('smm_saved_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
    const savedRemember = localStorage.getItem('smm_remember_me');
    if (savedRemember !== null) {
      setRememberMe(savedRemember === 'true');
    }
  }, []);

  // Cooldown countdown timer for 2FA resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

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

  // Verify WhatsApp OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/otp/verify', {
        phone: phone.trim(),
        code: code.trim(),
        remember: rememberMe,
      });
      login(res.data.token, res.data.user, rememberMe);
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
    setSuccess(null);
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('smm_saved_email', email.trim().toLowerCase());
    } else {
      localStorage.removeItem('smm_saved_email');
    }

    try {
      const res = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
        remember: rememberMe,
      });

      // Check if user requires Two-Factor Authentication
      if (res.data.requires2FA) {
        setTwoFactorChallenge({
          tempToken: res.data.tempToken,
          destination: res.data.destination,
          method: res.data.method,
          message: res.data.message,
        });
        setSuccess(`2FA security code sent to ${res.data.destination}`);
        setResendCooldown(60);
        return;
      }

      login(res.data.token, res.data.user, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Verify 2FA Code
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorChallenge) return;
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/2fa/verify', {
        tempToken: twoFactorChallenge.tempToken,
        code: twoFactorCode.trim(),
        remember: rememberMe,
      });

      login(res.data.token, res.data.user, rememberMe);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Incorrect 2FA verification code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend 2FA Code
  const handleResend2FA = async () => {
    if (!twoFactorChallenge || resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/auth/2fa/resend', {
        tempToken: twoFactorChallenge.tempToken,
      });
      setSuccess(res.data.message || 'Fresh 2FA code sent to your email.');
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not resend code. Please sign in again.');
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
        <div className="text-center mb-6">
          <div className="relative inline-flex items-center justify-center mb-3 group">
            <div
              className="absolute inset-0 rounded-full bg-red-600/30 blur-xl pointer-events-none -z-10 animate-pulse"
              style={{ animationDuration: '3.5s' }}
            />
            <img
              src="/brand/bulletproof-shield.png"
              alt="Bulletproof Brands Shield"
              className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-[0_8px_20px_rgba(239,68,68,0.45)] transition-transform duration-300 group-hover:scale-105"
              loading="eager"
            />
          </div>

          <div className="flex flex-col items-center select-none">
            <span className="text-[12px] sm:text-[13px] font-black uppercase tracking-[0.25em] text-red-500 font-sans">
              BULLETPROOF BRANDS
            </span>
            <span className="text-[9px] font-extrabold uppercase tracking-[0.32em] text-ink-3 mt-0.5">
              IMPOSSIBLE TO IGNORE
            </span>

            <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight mt-2.5">
              Client Portal
            </h1>
            <p className="text-xs text-ink-2 mt-1 max-w-xs">
              Review scripts, sign off video edits & direct communication
            </p>
          </div>
        </div>

        <Card className="p-5 sm:p-7 shadow-2xl border-line/80 bg-surface/95 backdrop-blur-xl rounded-2xl relative">
          {/* Security Banner */}
          <div className="flex items-center justify-between text-[11px] text-ink-3 pb-3 mb-4 border-b border-line/60">
            <span className="flex items-center gap-1 font-semibold text-ink-2">
              <ShieldCheck size={14} className="text-emerald-500" />
              {twoFactorChallenge ? 'Two-Factor Verification' : 'Secure Session'}
            </span>
            <span className="font-semibold text-emerald-500">256-Bit SSL Encrypted</span>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 text-xs font-medium text-danger-ink bg-danger-soft rounded-xl border border-danger/20 animate-fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-center gap-2 p-3 text-xs font-medium text-success-ink bg-success-soft rounded-xl border border-success/20 animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* TWO-FACTOR AUTHENTICATION (2FA) CHALLENGE VIEW */}
          {twoFactorChallenge ? (
            <form onSubmit={handleVerify2FA} className="space-y-4 animate-fade-in">
              <div className="text-center py-2 space-y-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary mx-auto mb-2 shadow-xs">
                  <KeyRound size={22} />
                </div>
                <h3 className="text-sm font-bold text-ink">Two-Factor Authentication</h3>
                <p className="text-xs text-ink-3">
                  Enter the 6-digit verification code sent to:
                </p>
                <p className="text-xs font-bold text-ink font-mono bg-surface-2 py-1 px-2.5 rounded-lg inline-block border border-line">
                  {twoFactorChallenge.destination}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2 mb-1.5 text-center">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="• • • • • •"
                  className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 px-4 rounded-xl border border-line bg-surface-2 text-ink focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              {/* Keep Signed In Checkbox on 2FA */}
              <label className="flex items-center gap-2.5 select-none cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary/20"
                />
                <span className="text-xs font-semibold text-ink-2">
                  Keep me signed in on this device (90 days)
                </span>
              </label>

              <Button
                type="submit"
                variant="primary"
                className="w-full !py-3 font-semibold"
                loading={loading}
                disabled={twoFactorCode.length < 6}
                icon={<Lock size={16} />}
              >
                Verify & Enter Portal
              </Button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={handleResend2FA}
                  disabled={loading || resendCooldown > 0}
                  className="text-primary hover:underline font-semibold disabled:text-ink-3 disabled:no-underline inline-flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTwoFactorChallenge(null);
                    setTwoFactorCode('');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-ink-3 hover:text-ink transition-colors font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Hybrid Mode Switcher (Visible only if agency admin enabled both methods) */}
              {isHybrid && (
                <div className="flex rounded-xl bg-surface-2 p-1 mb-5 border border-line">
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

              {/* Mode 1: Email & Password Login */}
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

                  {/* Keep Signed In Facility */}
                  <div className="flex items-center justify-between pt-0.5">
                    <label className="flex items-center gap-2.5 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-line text-primary focus:ring-primary/20 accent-primary cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-ink-2 hover:text-ink transition-colors">
                        Keep me signed in
                      </span>
                    </label>
                    <span className="text-[10px] text-ink-3 font-medium bg-surface-2 px-2 py-0.5 rounded-md border border-line/60">
                      90 Days Session
                    </span>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full !py-3 font-semibold mt-2"
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
                      <label className="flex items-center gap-2.5 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/20 accent-primary"
                        />
                        <span className="text-xs font-semibold text-ink-2">
                          Keep me signed in on this device
                        </span>
                      </label>
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
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="• • • • • •"
                          className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 px-4 rounded-xl border border-line bg-surface text-ink focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none"
                          required
                          autoFocus
                        />
                      </div>
                      <label className="flex items-center gap-2.5 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-line text-primary focus:ring-primary/20 accent-primary"
                        />
                        <span className="text-xs font-semibold text-ink-2">
                          Keep me signed in (90 days)
                        </span>
                      </label>
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
            </>
          )}

          {/* Client Footer */}
          <div className="mt-6 pt-4 border-t border-line/60 text-center space-y-2">
            <p className="text-xs text-ink-3">
              Need access or account assistance? Contact your agency creative team.
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
