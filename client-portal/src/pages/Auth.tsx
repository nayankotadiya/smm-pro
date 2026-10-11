import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Mail, Lock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-canvas flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary-hover text-white shadow-lift mb-4 font-extrabold text-2xl tracking-wider">
            SP
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Client Portal</h1>
          <p className="text-sm text-ink-2 mt-1">Review scripts, sign off videos & track your content deliverables</p>
        </div>

        <Card className="p-6 sm:p-8 shadow-lift border-line">
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
          <div className="mt-6 pt-5 border-t border-line/60 text-center">
            <p className="text-xs text-ink-3">
              Need access or a password reset? Contact your agency account manager.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
