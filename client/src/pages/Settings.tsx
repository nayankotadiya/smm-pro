import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Bell, BellOff, Download, Smartphone, RefreshCw, Send, Shield, Laptop, Trash2, Copy, LogOut, ExternalLink, Sparkles, Camera } from 'lucide-react';
import { get, post, patch, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Tabs, Avatar } from '@/components/ui';
import { canInstall, disablePush, enablePush, isIOS, isStandalone, onInstallChange, promptInstall, pushState, PushState } from '@/pwa';
import { showDeviceNotification } from '@/lib/notifications';
import { TestNotificationButton } from '@/components/NotificationBanner';
import { ago, fmtSize, label, roleLabel } from '@/lib/format';
import { ThemePicker } from '@/components/Header';
import { useTheme } from '@/store/theme';

type T = 'profile' | 'notifications' | 'users' | 'roles' | 'integrations';
export default function Settings() {
  const can = useCan(); const [sp, setSp] = useSearchParams(); const tab = (sp.get('tab') as T) || 'profile';
  const tabs = [{ key: 'profile' as T, label: 'Profile' }, { key: 'notifications' as T, label: 'Notifications' }, ...(can('users.manage') ? [{ key: 'users' as T, label: 'Users' }] : []), ...(can('roles.manage') ? [{ key: 'roles' as T, label: 'Roles and permissions' }] : []), ...(can('integrations.manage') ? [{ key: 'integrations' as T, label: 'Integrations' }] : [])];
  return (
    <>
      <PageHeader
        title="Settings"
        actions={<TestNotificationButton />}
      />
      <Tabs tabs={tabs} value={tab} onChange={(k) => setSp(k === 'profile' ? {} : { tab: k }, { replace: true })} />
      {tab === 'profile' && <Profile />}{tab === 'notifications' && <NotificationSettings />}{tab === 'users' && can('users.manage') && <Users />}{tab === 'roles' && can('roles.manage') && <Roles />}{tab === 'integrations' && can('integrations.manage') && <Integrations />}
    </>
  );
}

function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Please select an image file (PNG, JPG, WEBP, GIF).'));
    }
    if (file.size > 5 * 1024 * 1024) {
      return reject(new Error('Image size must be less than 5 MB.'));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        const targetDim = 256;
        canvas.width = targetDim;
        canvas.height = targetDim;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, targetDim, targetDim);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          resolve(reader.result as string);
        }
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function ProfilePictureCard() {
  const { user, setUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const saveAvatar = useMutation({
    mutationFn: (avatarUrl: string | null) => patch('/auth/me', { avatarUrl }),
    onSuccess: (r) => {
      setUser(r.user);
      toast.success(r.user.avatarUrl ? 'Profile picture updated.' : 'Profile picture removed.');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await processImageFile(file);
      saveAvatar.mutate(dataUrl);
    } catch (err: any) {
      toast.error(err.message || 'Failed to process image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Card title="Profile Picture" className="lg:col-span-2">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="relative group shrink-0">
          <Avatar name={user!.name} avatarUrl={user!.avatarUrl} size={92} className="shadow-lg ring-4 ring-primary/20" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[11px] font-semibold cursor-pointer"
            title="Change photo"
          >
            <Camera size={22} className="mb-0.5" />
            <span>Change</span>
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <div>
            <h3 className="text-[16px] font-bold text-ink flex items-center justify-center sm:justify-start gap-2">
              <span>{user!.name}</span>
              <Badge t="blue">{roleLabel(user!.role)}</Badge>
            </h3>
            <p className="text-[12.5px] text-ink-2 mt-0.5">
              Upload a clear photo for your profile. Your picture is displayed across all assigned content, team chats, and activity feeds.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Camera size={14} />}
              loading={uploading || saveAvatar.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload photo
            </Button>
            {user!.avatarUrl && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} />}
                loading={saveAvatar.isPending}
                onClick={() => saveAvatar.mutate(null)}
              >
                Remove photo
              </Button>
            )}
          </div>
          <div className="text-[11px] text-ink-3">
            Supports PNG, JPG, WEBP or GIF up to 5 MB. Automatically centered and optimized.
          </div>
        </div>
      </div>
    </Card>
  );
}

function Profile() {
  const { user, setUser } = useAuth(); const { mode, resolved } = useTheme(); const [name, setName] = useState(user!.name); const [email, setEmail] = useState(user!.email); const [phone, setPhone] = useState(user!.phone || ''); const [cur, setCur] = useState(''); const [pw, setPw] = useState('');
  const save = useMutation({ mutationFn: (b: any) => patch('/auth/me', b), onSuccess: (r) => { setUser(r.user); setCur(''); setPw(''); toast.success('Saved.'); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <ProfilePictureCard />
      <Card title="Appearance" className="lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">Theme</div><div className="text-meta text-ink-2">{mode === 'system' ? `Following your device (currently ${resolved}).` : `Always ${mode}.`} Saved on this device.</div></div><ThemePicker size="md" /></div></Card>
      <Card title="Your details"><div className="space-y-3"><Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field><Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Role"><Input value={roleLabel(user!.role)} disabled /></Field><Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ name, email, phone })}>Save</Button></div></Card>
      <Card title="Change password"><div className="space-y-3"><Field label="Current password"><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field><Field label="New password" hint="At least 8 characters."><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field><Button disabled={!cur || pw.length < 8} loading={save.isPending} onClick={() => save.mutate({ currentPassword: cur, newPassword: pw })}>Update password</Button></div></Card>
      <TwoFactorCard />
      <ActiveSessionsCard />
    </div>
  );
}

function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    setLoading(true);
    try {
      const r = await post<any>('/auth/mfa/setup');
      setSecret(r.secret);
      setCode('');
      setSetupOpen(true);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const confirmEnable = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const r = await post<any>('/auth/mfa/enable', { secret, code: code.trim() });
      setBackupCodes(r.backupCodes || []);
      setUser({ ...user!, mfaEnabled: true });
      setSetupOpen(false);
      setBackupModalOpen(true);
      toast.success('Two-factor authentication enabled!');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async () => {
    if (!password) return;
    setLoading(true);
    try {
      await post('/auth/mfa/disable', { password });
      setUser({ ...user!, mfaEnabled: false });
      setDisableOpen(false);
      setPassword('');
      toast.success('Two-factor authentication disabled.');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card title={<span className="flex items-center gap-2"><Shield size={16} /> Two-Factor Authentication</span>} className="lg:col-span-2">
        <p className="text-[13px] text-ink-2">
          Add an extra layer of security. Require a 6-digit TOTP verification code from Google Authenticator, Authy, or 1Password when signing in.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex items-center gap-2">
            <Badge t={user?.mfaEnabled ? 'green' : 'neutral'}>
              {user?.mfaEnabled ? '2FA Enabled' : '2FA Disabled'}
            </Badge>
          </div>
          {user?.mfaEnabled ? (
            <Button size="sm" variant="danger" onClick={() => setDisableOpen(true)}>Disable 2FA</Button>
          ) : (
            <Button size="sm" variant="primary" loading={loading} onClick={startSetup}>Enable 2FA</Button>
          )}
        </div>
      </Card>

      <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Set up Two-Factor Authentication" footer={<><Button onClick={() => setSetupOpen(false)}>Cancel</Button><Button variant="primary" loading={loading} disabled={code.trim().length !== 6} onClick={confirmEnable}>Verify & Enable</Button></>}>
        <div className="space-y-4 text-[13px]">
          <p className="text-ink-2">
            1. Enter the secret key below into your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, Apple Passwords):
          </p>
          <div className="rounded border border-line bg-surface-2 p-3">
            <div className="text-meta font-semibold text-ink-2">Secret Key</div>
            <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[14px] font-bold tracking-wider text-ink select-all">
              <span>{secret}</span>
              <Button size="sm" icon={<Copy size={13} />} onClick={() => { navigator.clipboard.writeText(secret); toast.info('Secret copied to clipboard.'); }}>Copy</Button>
            </div>
          </div>
          <p className="text-ink-2">
            2. Enter the 6-digit verification code shown in your app:
          </p>
          <Field label="Verification code">
            <Input autoFocus placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="font-mono text-center tracking-widest text-[16px]" />
          </Field>
        </div>
      </Modal>

      <Modal open={backupModalOpen} onClose={() => setBackupModalOpen(false)} title="Emergency Recovery Codes" footer={<Button variant="primary" onClick={() => setBackupModalOpen(false)}>I have saved my codes</Button>}>
        <div className="space-y-3 text-[13px]">
          <p className="text-warning-ink bg-warning-soft p-3 rounded font-medium">
            Save these emergency recovery codes in a safe place. If you lose access to your device, each single-use code can be used to sign in.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded border border-line bg-surface-2 p-3 font-mono text-[13px] font-bold text-ink">
            {backupCodes.map((c, i) => (
              <div key={i} className="py-0.5">{c}</div>
            ))}
          </div>
          <Button size="sm" icon={<Copy size={13} />} onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); toast.info('Recovery codes copied.'); }}>Copy all codes</Button>
        </div>
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable Two-Factor Authentication" footer={<><Button onClick={() => setDisableOpen(false)}>Cancel</Button><Button variant="danger" loading={loading} disabled={!password} onClick={confirmDisable}>Disable 2FA</Button></>}>
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">Enter your current password to confirm disabling two-factor authentication.</p>
          <Field label="Current password">
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function ActiveSessionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['active-sessions'], queryFn: () => get<any[]>('/auth/sessions') });
  const [revoking, setRevoking] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await post(`/auth/sessions/${id}/revoke`);
      toast.success('Session revoked.');
      qc.invalidateQueries({ queryKey: ['active-sessions'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRevoking(null);
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm('Log out of all other devices?')) return;
    setRevoking('others');
    try {
      await post('/auth/sessions/revoke-others');
      toast.success('All other devices have been logged out.');
      qc.invalidateQueries({ queryKey: ['active-sessions'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Laptop size={16} /> Active Sessions & Devices</span>} className="lg:col-span-2" action={q.data && q.data.length > 1 && <Button size="sm" variant="danger" loading={revoking === 'others'} onClick={revokeOthers} icon={<LogOut size={13} />}>Log out other devices</Button>}>
      <Async q={q}>
        {(sessions: any[]) => (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-2">
              Devices currently signed in to your account.
            </p>
            <div className="divide-y divide-line rounded border border-line mt-3">
              {sessions.map((s) => (
                <div key={s._id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-[13px]">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-ink">
                      <span>{s.userAgent?.slice(0, 70) || 'Unknown Browser'}</span>
                      {s.current && <Badge t="green">This device</Badge>}
                    </div>
                    <div className="text-meta text-ink-3">
                      IP: {s.ip} · Started {ago(s.createdAt)}
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" loading={revoking === s._id} onClick={() => revoke(s._id)} icon={<Trash2 size={13} />}>
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Async>
    </Card>
  );
}


const CATS: [string, string][] = [['TASK', 'Task assigned'], ['APPROVAL', 'Approvals'], ['CHAT', 'Chat'], ['REMINDER', 'Reminders'], ['DEADLINE', 'Deadlines'], ['FILES', 'Files'], ['WORKFLOW', 'Workflow'], ['SYSTEM', 'System']];
const Toggle = ({ on, onChange, label: l, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) => (
  <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1.5"><span><span className="block">{l}</span>{hint && <span className="block text-meta text-ink-2">{hint}</span>}</span>
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${on ? 'bg-primary' : 'bg-line-strong'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ease-out ${on ? 'left-[18px]' : 'left-0.5'}`} /></button></label>
);
function NotificationSettings() {
  const { user, setUser } = useAuth(); const prefs = user!.notificationPrefs || {}; const qc = useQueryClient();
  const [ps, setPs] = useState<PushState | null>(null); const [busy, setBusy] = useState(false); const [, force] = useState(0);
  useEffect(() => { pushState().then(setPs); return onInstallChange(() => force((n) => n + 1)); }, []);
  const save = useMutation({ mutationFn: (p: any) => patch('/auth/me', { notificationPrefs: p }), onSuccess: (r) => setUser(r.user), onError: (e) => toast.error(errMsg(e)) });
  const devices = useQuery({ queryKey: ['push-devices'], queryFn: () => get<any[]>('/push/devices') });
  const on = async () => { setBusy(true); try { const s = await enablePush(true); setPs(s); if (s === 'on') { toast.success('Push notifications enabled on this device.'); save.mutate({ push: true }); qc.invalidateQueries({ queryKey: ['push-devices'] }); } else if (s === 'denied') toast.error('Notifications are blocked for this site in your browser settings.'); } catch (e) { toast.error(errMsg(e, 'Could not enable push on this device.')); } setBusy(false); };
  const off = async () => { setBusy(true); await disablePush(); setPs(await pushState()); qc.invalidateQueries({ queryKey: ['push-devices'] }); setBusy(false); toast.success('Push disabled on this device.'); };
  const test = async () => {
    try {
      if (ps !== 'on') {
        const s = await enablePush(true);
        setPs(s);
        if (s !== 'on') {
          toast.error('કૃપા કરીને પહેલા આ ફોન પર "Enable notifications" ક્લિક કરીને પરવાનગી આપો.');
          return;
        }
      }

      // Trigger local OS notification shade alert with sound & vibration
      await showDeviceNotification({
        title: '🔔 SMM PRO Mobile Alert',
        message: 'Notification panel & vibration test successful!',
        sound: true,
        vibrate: true,
      });

      // Send backend test push to all user's registered devices
      const r = await post<any>('/push/test');
      qc.invalidateQueries({ queryKey: ['push-devices'] });

      if (r?.devices === 0) {
        toast.error('⚠️ ડેટાબેઝમાં આ ફોનનું સબસ્ક્રિપ્શન મળ્યું નથી. "Enable notifications" ફરી દબાવો.');
      } else if (r?.sentCount > 0) {
        toast.success(`✅ ${r.sentCount} ડિવાઇસ પર ટેસ્ટ પુશ સફળતાપૂર્વક મોકલાયો! ફોનની નોટિફિકેશન પેનલ ચેક કરો.`);
      } else {
        toast.info('ટેસ્ટ પુશ સેન્ડ થઈ ગયો છે.');
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card title="Push notifications on this device">
          <p className="text-ink-2">Get notified about assignments, approvals, mentions and reminders even when SMM PRO is not open.</p>
          {/* ALWAYS VISIBLE MAIN TEST BUTTON */}
          <div className="mt-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <Button
              variant="primary"
              onClick={test}
              icon={<Send size={15} />}
              className="w-full sm:w-auto font-bold py-2.5 px-4 shadow-md shadow-primary/25"
            >
              🔔 Test Mobile Notification (Sound & Vibrate)
            </Button>
            {ps === 'on' ? (
              <Button size="sm" loading={busy} onClick={off} icon={<BellOff size={14} />}>
                Disable
              </Button>
            ) : (
              <Button size="sm" variant="secondary" loading={busy} onClick={on} icon={<Bell size={14} />}>
                Enable / Re-link device
              </Button>
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            {ps === null ? (
              <span className="text-[12px] text-ink-3">Checking this device…</span>
            ) : ps === 'on' ? (
              <Badge t="green">Active on this device</Badge>
            ) : ps === 'off' ? (
              <Badge t="amber">Permissions not active yet — tap Test above to enable</Badge>
            ) : ps === 'ios-needs-install' ? (
              <Badge t="amber">iOS: Add to Home Screen first</Badge>
            ) : ps === 'denied' ? (
              <Badge t="red">Blocked in browser permissions</Badge>
            ) : ps === 'server-off' ? (
              <Badge t="amber">VAPID key pending on server</Badge>
            ) : (
              <span className="text-[12px] text-ink-3">{ps}</span>
            )}
          </div>

          {ps === 'ios-needs-install' && (
            <div className="mt-3 rounded border border-line bg-surface-2 p-3 text-[13px]">
              <div className="flex items-center gap-2 font-medium"><Smartphone size={15} />Add SMM PRO to your Home Screen first</div>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-ink-2">
                <li>In Safari, tap the Share button.</li>
                <li>Choose "Add to Home Screen".</li>
                <li>Open SMM PRO from the Home Screen and return to this page.</li>
              </ol>
              <p className="mt-1.5 text-ink-3">iPhone and iPad only allow push for installed web apps (iOS 16.4 or later).</p>
            </div>
          )}

          {ps === 'denied' && (
            <p className="mt-3 rounded bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
              Notifications are blocked for this site. Allow them in your browser's site settings, then reload.
            </p>
          )}

          {/* Subscribed devices section */}
          {devices.data && devices.data.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <div className="flex items-center justify-between text-[13px] font-semibold text-ink">
                <span>રજીસ્ટર્ડ ડિવાઇસ ({devices.data.length})</span>
                <span className="text-[11px] font-normal text-success-ink bg-success-soft px-2 py-0.5 rounded-full">Active in DB</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-[12.5px]">
                {devices.data.map((d: any) => (
                  <li key={d.endpoint} className="flex items-center justify-between rounded-lg bg-surface-2/70 px-2.5 py-1.5 border border-border/50">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      {d.deviceType === 'mobile' ? <Smartphone size={14} className="text-primary" /> : <Laptop size={14} className="text-primary" />}
                      <span>{d.platform || 'Device'} · {d.browser || 'Browser'}</span>
                    </span>
                    <span className="text-[11px] text-ink-3">
                      {d.lastUsedAt ? `Active ${ago(d.lastUsedAt)}` : 'Recently linked'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-300">
              <b>⚠️ આ ફોન હજી સુધી સર્વર પર લિંક નથી થયો:</b>
              <div className="mt-1">
                ઉપર આપેલ <b>"Enable notifications"</b> બટન દબાવો અને બ્રાઉઝરમાં <b>Allow</b> કરો જેથી તમારો ફોન બેકએન્ડ ડેટાબેઝમાં એડ થઈ જાય.
              </div>
            </div>
          )}

          {/* Phone notification panel & sound guidance */}
          <div className="mt-3.5 rounded-xl border border-border/80 bg-surface-2/80 p-3.5 text-[12px] space-y-2 text-ink-2">
            <div className="font-semibold text-ink flex items-center gap-1.5 text-[13px]">
              <Smartphone size={15} className="text-primary" /> ફોનમાં સાઉન્ડ કે વાઇબ્રેટ ન થાય તો આ સેટિંગ્સ ચકાસો:
            </div>
            <ul className="list-disc pl-4 space-y-1.5 text-[11.5px] leading-relaxed">
              <li><b>1. Android Sound Mode:</b> ફોન <i>Silent</i> કે <i>Do Not Disturb (DND)</i> મોડ પર ન હોય તે ચેક કરો. જો સાયલન્ટ હશે તો કોઈ સાઉન્ડ નહીં આવે.</li>
              <li><b>2. Chrome Notification Category:</b> ફોન <i>Settings ➔ Apps ➔ Chrome ➔ Notifications ➔ Notification categories ➔ Sites ➔ તમારો ડોમેન</i> પર જઈને <b>"Alert"</b> (Sound & Vibrate Allowed) સિલેક્ટ કરો.</li>
              <li><b>3. Battery Saver (Xiaomi / Vivo / Oppo / Realme / Samsung):</b> <i>Settings ➔ Apps ➔ Chrome ➔ Battery ➔ "Unrestricted"</i> અને <i>"Autostart"</i> ચાલુ કરો, જેથી સ્ક્રીન લૉક હોય ત્યારે પણ તરત નોટિફિકેશન આવે.</li>
              <li><b>4. iPhone (iOS):</b> Safari માં <b>Share ➔ Add to Home Screen</b> કરો. હોમ સ્ક્રીન એપ ખોલીને આ પેજ પર આવીને Notifications ઓન કરો (iOS 16.4+).</li>
            </ul>
          </div>
        </Card>
        <Card title="Install the app">
          {isStandalone() ? <Badge t="green">Installed</Badge> : canInstall() ? <Button icon={<Download size={15} />} onClick={() => promptInstall()}>Install SMM PRO</Button> : isIOS() ? <p className="text-[13px] text-ink-2">In Safari, tap Share, then "Add to Home Screen".</p> : <p className="text-[13px] text-ink-2">Use your browser menu and choose "Install app" or "Add to Home screen". Available in Chrome and Edge on Android, Windows and macOS, and in Safari on macOS ("Add to Dock").</p>}
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Channels"><div className="divide-y divide-line">
          <Toggle label="In-app notifications" hint="Toasts while you work. The bell always keeps a record." on={prefs.inApp !== false} onChange={(v) => save.mutate({ inApp: v })} />
          <Toggle label="Push notifications" hint="Applies to all your subscribed devices." on={prefs.push !== false} onChange={(v) => save.mutate({ push: v })} />
          <Toggle label="Email notifications" on={!!prefs.email} onChange={(v) => save.mutate({ email: v })} />
          <Toggle label="WhatsApp notifications" hint="Requires an approved internal WhatsApp template. Not active yet." on={!!prefs.whatsapp} disabled onChange={() => undefined} />
        </div></Card>
        <Card title="What to notify me about"><div className="divide-y divide-line">{CATS.map(([k, l]) => <Toggle key={k} label={l} on={prefs.categories?.[k] !== false} onChange={(v) => save.mutate({ categories: { [k]: v } })} />)}</div><p className="mt-3 text-meta text-ink-3">Critical security and system notifications are always delivered.</p></Card>
      </div>
    </div>
  );
}

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD', 'SCRIPT_WRITER', 'SHOOTER', 'EDITOR', 'SMM', 'DESIGNER', 'SUPPORT'];
function Users() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const q = useQuery({ queryKey: ['team', 'all'], queryFn: () => get<any[]>('/team', { all: 1 }) });
  const [edit, setEdit] = useState<any>(null);
  const [v, setV] = useState<any>({});
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (edit) {
      setV({
        name: edit.name || '',
        email: edit.email || '',
        role: edit.role || 'EDITOR',
        title: edit.title || '',
        phone: edit.phone || '',
        avatarUrl: edit.avatarUrl || null,
        password: '',
        active: edit.active !== false,
        coverUserId: edit.coverUserId || '',
      });
    }
  }, [edit]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await processImageFile(file);
      setV((s: any) => ({ ...s, avatarUrl: dataUrl }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to process image');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const m = useMutation({
    mutationFn: () => {
      const b = { ...v, coverUserId: v.coverUserId || null };
      if (!b.password) delete b.password;
      return edit._id ? patch(`/users/${edit._id}`, b) : post('/users', b);
    },
    onSuccess: () => {
      toast.success(edit._id ? 'User updated.' : 'User created.');
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const set = (k: string) => (e: any) => setV((s: any) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <Card
        title="Team accounts"
        pad={false}
        action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({})}>Add user</Button>}
      >
        <Async q={q}>
          {(d: any[]) => (
            <Table head={['User', 'Email', 'Role', 'Status', 'Last sign-in', '']} minWidth={720}>
              {d.map((u) => (
                <tr key={u._id} className="group hover:bg-surface-2 transition-colors">
                  <td className="td font-semibold text-ink group-hover:text-primary-ink transition-colors">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} size={30} />
                      <div>
                        <div className="leading-tight">{u.name}</div>
                        {u.title && <div className="text-[11px] font-normal text-ink-3">{u.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="td font-medium text-ink-2">{u.email}</td>
                  <td className="td font-medium text-ink">{roleLabel(u.role)}</td>
                  <td className="td"><Badge t={u.active ? 'green' : 'neutral'}>{u.active ? 'Active' : 'Deactivated'}</Badge></td>
                  <td className="td text-meta font-medium text-ink-2">{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</td>
                  <td className="td text-right"><Button size="sm" onClick={() => setEdit(u)}>Edit</Button></td>
                </tr>
              ))}
            </Table>
          )}
        </Async>
      </Card>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?._id ? `Edit ${edit.name}` : 'Add user'}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={m.isPending}
              disabled={!v.name || !v.email || (!edit?._id && (v.password || '').length < 8)}
              onClick={() => m.mutate()}
            >
              {edit?._id ? 'Save' : 'Create user'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* Profile Picture section */}
          <div className="sm:col-span-2 flex items-center gap-4 p-3 rounded-xl border border-line bg-surface-2/60">
            <div className="relative group shrink-0">
              <Avatar name={v.name || 'User'} avatarUrl={v.avatarUrl} size={54} className="ring-2 ring-primary/20" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-semibold cursor-pointer"
                title="Upload picture"
              >
                <Camera size={16} />
              </button>
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-[12px] font-semibold text-ink">Profile Picture</div>
              <div className="text-[11px] text-ink-3">Upload a photo or avatar for this team member.</div>
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarFile}
                  accept="image/*"
                  className="hidden"
                />
                <Button
                  type="button"
                  size="sm"
                  loading={uploadingAvatar}
                  icon={<Camera size={13} />}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {v.avatarUrl ? 'Change photo' : 'Upload photo'}
                </Button>
                {v.avatarUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={13} />}
                    onClick={() => setV((s: any) => ({ ...s, avatarUrl: null }))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Field label="Name"><Input value={v.name || ''} onChange={set('name')} /></Field>
          <Field label="Email"><Input type="email" value={v.email || ''} onChange={set('email')} /></Field>
          <Field label="Role"><Select value={v.role || 'EDITOR'} onChange={set('role')} disabled={edit?._id === me._id}>{ROLES.filter((r) => r !== 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select></Field>
          <Field label="Job title"><Input value={v.title || ''} onChange={set('title')} /></Field>
          <Field label="Phone"><Input value={v.phone || ''} onChange={set('phone')} /></Field>
          <Field label={edit?._id ? 'Reset password' : 'Temporary password'} hint={edit?._id ? 'Leave blank to keep the current password.' : 'At least 8 characters. Ask them to change it after first sign-in.'}><Input type="text" value={v.password || ''} onChange={set('password')} autoComplete="off" /></Field>
          {edit?._id && <div className="sm:col-span-2"><Field label="Covered by" hint="While set, this colleague also receives this person's notifications. Use it for leave or sick days."><Select value={v.coverUserId || ''} onChange={set('coverUserId')}><option value="">Nobody</option>{(q.data || []).filter((u) => u._id !== edit._id && u.active).map((u) => <option key={u._id} value={u._id}>{u.name} — {roleLabel(u.role)}</option>)}</Select></Field></div>}
          {edit?._id && edit._id !== me._id && <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Account is active</label>}
        </div>
      </Modal>
    </>
  );
}

const PERM_GROUPS: [string, string[]][] = [['Dashboard and reports', ['dashboard.org', 'reports.view', 'audit.view']], ['Clients', ['clients.read', 'clients.write', 'clients.delete', 'communication.write']], ['Content', ['content.read.all', 'content.write', 'content.assign']], ['Scripts and reviews', ['scripts.write', 'scripts.review', 'approvals.review', 'approvals.send']], ['Files', ['media.upload', 'media.read.all']], ['Tasks', ['tasks.read.all', 'tasks.manage']], ['Administration', ['automations.manage', 'users.manage', 'roles.manage', 'integrations.manage']]];
const PERM_LABEL: Record<string, string> = { 'dashboard.org': 'See company dashboard', 'reports.view': 'View reports', 'audit.view': 'View audit log with IP', 'clients.read': 'View clients', 'clients.write': 'Create and edit clients', 'clients.delete': 'Archive clients', 'communication.write': 'Log client communication', 'content.read.all': 'See all content (not only assigned)', 'content.write': 'Create and edit content', 'content.assign': 'Assign people and move stages', 'scripts.write': 'Write scripts', 'scripts.review': 'Review scripts', 'approvals.review': 'Review edits and finals', 'approvals.send': 'Send client reviews', 'media.upload': 'Upload files', 'media.read.all': 'Access all files', 'tasks.read.all': 'See everyone\'s tasks', 'tasks.manage': 'Assign and manage tasks', 'automations.manage': 'Manage automations', 'users.manage': 'Manage users', 'roles.manage': 'Manage roles', 'integrations.manage': 'Manage integrations' };
function Roles() {
  const qc = useQueryClient(); const me = useAuth((s) => s.user)!; const q = useQuery({ queryKey: ['roles'], queryFn: () => get('/roles') }); const [role, setRole] = useState('MANAGER'); const [perms, setPerms] = useState<string[]>([]);
  const cur = q.data?.roles.find((r: any) => r.key === role);
  useEffect(() => { if (cur) setPerms(cur.permissions); }, [cur?.key, q.dataUpdatedAt]); // eslint-disable-line
  const m = useMutation({ mutationFn: () => patch(`/roles/${role}`, { permissions: perms }), onSuccess: () => { toast.success(`${roleLabel(role)} permissions saved. They apply within 30 seconds.`); qc.invalidateQueries({ queryKey: ['roles'] }); }, onError: (e) => toast.error(errMsg(e)) });
  const locked = cur?.locked || (role === 'ADMIN' && me.role !== 'SUPER_ADMIN');
  const dirty = cur && [...perms].sort().join() !== [...cur.permissions].sort().join();
  return (
    <Async q={q}>{() => (
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card pad={false}><ul>{ROLES.filter((r) => r !== 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN').map((r) => <li key={r}><button onClick={() => setRole(r)} className={`block w-full px-4 py-2.5 text-left transition-colors duration-150 ${r === role ? 'bg-primary-soft font-medium text-primary-ink' : 'hover:bg-surface-2'}`}>{roleLabel(r)}</button></li>)}</ul></Card>
        <Card title={`${roleLabel(role)} can…`} action={!locked && <Button size="sm" variant="primary" disabled={!dirty} loading={m.isPending} onClick={() => m.mutate()}>Save</Button>}>
          {locked && <p className="mb-3 rounded bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{role === 'SUPER_ADMIN' ? 'Super admins always have full access.' : 'Only a super admin can change admin permissions.'}</p>}
          <div className="grid gap-5 sm:grid-cols-2">{PERM_GROUPS.map(([g, list]) => <div key={g}><div className="mb-1 text-meta font-semibold uppercase tracking-wide text-ink-2">{g}</div>{list.map((p) => <label key={p} className="flex min-h-[32px] items-center gap-2"><input type="checkbox" disabled={locked} checked={perms.includes(p)} onChange={(e) => setPerms((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />{PERM_LABEL[p]}</label>)}</div>)}</div>
          <p className="mt-4 text-meta text-ink-3">There is no client role. Clients never sign in; they only receive one-time review links.</p>
        </Card>
      </div>
    )}</Async>
  );
}

function Integrations() {
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => get('/integrations') });
  const [phone, setPhone] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [busy, setBusy] = useState('');
  const sync = async () => { setBusy('sync'); try { const r = await post('/drive/sync'); toast.success(`Drive sync complete: ${r.checked} files checked, ${r.missing} missing, ${r.foldersCreated} folders created.`); } catch (e) { toast.error(errMsg(e)); } setBusy(''); };
  const test = async () => { setBusy('wa'); try { await post('/integrations/aisensy/send', { phone }); toast.success('Test message accepted by AiSensy.'); } catch (e) { toast.error(errMsg(e)); } setBusy(''); };
  const S = ({ ok, text }: { ok: boolean; text?: string }) => <Badge t={ok ? 'green' : 'neutral'}>{text || (ok ? 'Connected' : 'Not configured')}</Badge>;
  return (
    <Async q={q}>{(d: any) => (
      <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2">Google Drive<S ok={d.drive.configured && d.drive.ok !== false} text={d.drive.ok === false ? 'Error' : undefined} /></span>}>
          {d.drive.configured ? (
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Authentication:</span>
                <span className="font-semibold">{d.drive.mode}</span>
              </div>
              {d.drive.serviceAccountEmail && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-2 shrink-0">Service account:</span>
                  <span className="truncate rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink" title={d.drive.serviceAccountEmail}>
                    {d.drive.serviceAccountEmail}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Storage target:</span>
                <span className="font-semibold">
                  {d.drive.sharedDrive ? 'Workspace Shared Drive' : 'Personal Google Drive (Shared Folder)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Target folder:</span>
                {d.drive.rootFolder?.id ? (
                  <a
                    href={`https://drive.google.com/drive/folders/${d.drive.rootFolder.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
                    title="Open root folder in Google Drive"
                  >
                    {d.drive.rootFolder?.name || d.drive.rootFolderName || 'SMM PRO'}
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <a
                    href="https://drive.google.com/drive/search?q=SMM%20PRO"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:underline"
                    title="Search for SMM PRO in Google Drive"
                  >
                    {d.drive.rootFolder?.name || d.drive.rootFolderName || 'SMM PRO'}
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">Storage quota:</span>
                <span className="font-semibold">
                  {Number(d.drive.quota?.limit) > 0
                    ? `${fmtSize(Number(d.drive.quota.usage))} of ${fmtSize(Number(d.drive.quota.limit))}`
                    : 'Uses personal Drive quota of folder owner'}
                </span>
              </div>
              {d.drive.error && <p className="rounded bg-danger-soft px-3 py-2 text-danger-ink">{d.drive.error}</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <Button size="sm" loading={busy === 'sync'} onClick={sync} icon={<RefreshCw size={14} />}>
                  Run Drive sync
                </Button>
                <a
                  href={d.drive.rootFolder?.id ? `https://drive.google.com/drive/folders/${d.drive.rootFolder.id}` : 'https://drive.google.com/drive/search?q=SMM%20PRO'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 transition-colors"
                >
                  <ExternalLink size={13} /> Open Drive Folder
                </a>
              </div>

              {/* Folder ID and One-Click Sharing for Personal Google Drive */}
              <div className="mt-3 rounded-lg border border-border bg-surface-2/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-2 font-medium">Drive Folder ID:</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink">
                    <span className="truncate max-w-[170px] select-all bg-surface-3 px-1.5 py-0.5 rounded">
                      {d.drive.rootFolder?.id || 'Auto-created by Service Account'}
                    </span>
                    {d.drive.rootFolder?.id && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(d.drive.rootFolder.id);
                          toast.success('Folder ID copied to clipboard!');
                        }}
                        className="rounded p-1 hover:bg-surface-3 hover:text-ink transition-colors"
                        title="Copy Folder ID"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-border/60 text-xs">
                  <span className="font-semibold text-ink">તમારા Google Drive માં જોવા માટે:</span>
                  <p className="text-[11px] text-ink-2 leading-relaxed">
                    તમારો Gmail લખીને <b>Share</b> ક્લિક કરો જેથી આ ફોલ્ડર તમારા Google Drive ના <b>"Shared with me"</b> માં તરત જ આવી જાય.
                  </p>
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="તમારો Gmail (e.g. name@gmail.com)"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Button
                      size="sm"
                      loading={busy === 'share'}
                      disabled={!shareEmail.includes('@')}
                      onClick={async () => {
                        setBusy('share');
                        try {
                          const r = await post('/drive/share', { email: shareEmail });
                          toast.success(r.message || 'Folder successfully shared with your Gmail!');
                          setShareEmail('');
                        } catch (e) {
                          toast.error(errMsg(e));
                        }
                        setBusy('');
                      }}
                    >
                      Share
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={busy === 'share-public'}
                      onClick={async () => {
                        setBusy('share-public');
                        try {
                          const r = await post('/drive/share', {});
                          toast.success(r.message || 'Public link access enabled!');
                        } catch (e) {
                          toast.error(errMsg(e));
                        }
                        setBusy('');
                      }}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      {busy === 'share-public' ? 'Enabling...' : '🔓 Enable Link Access (Anyone with link)'}
                    </button>
                    {d.drive.rootFolder?.id && (
                      <a
                        href={`https://drive.google.com/drive/folders/${d.drive.rootFolder.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-brand-primary hover:underline flex items-center gap-1"
                      >
                        Open in Drive <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">
              Not connected. Files are being stored on the API server's disk, which is only suitable for testing. Set <code>GOOGLE_SERVICE_ACCOUNT_JSON_BASE64</code> on the server and restart.
            </p>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2">AiSensy WhatsApp<S ok={d.aisensy.configured} /></span>}>
          <div className="space-y-2 text-[13px]"><div>Campaign: <b>{d.aisensy.campaign || '—'}</b></div><div>Webhook secured: <b>{d.aisensy.webhookSecured ? 'Yes' : 'No'}</b></div><div>Last webhook received: <b>{d.aisensy.lastWebhookAt ? ago(d.aisensy.lastWebhookAt) : 'Never'}</b></div><div className="break-all text-ink-2">Webhook URL: <code>{window.location.origin.replace(/:\d+$/, '')}{d.aisensy.webhookUrl}?secret=…</code></div>
            {d.aisensy.configured ? <div className="flex gap-2 pt-1"><Input placeholder="Test number, e.g. 919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /><Button loading={busy === 'wa'} disabled={phone.replace(/\D/g, '').length < 10} onClick={test}>Send test</Button></div> : <p className="text-ink-2">Set <code>AISENSY_API_KEY</code> and <code>AISENSY_CAMPAIGN_NAME</code> on the server. Until then, review links are created and copied for manual sharing.</p>}</div>
        </Card>
        <Card title={<span className="flex items-center gap-2">Web Push<S ok={d.push.configured} /></span>}><p className="text-[13px] text-ink-2">{d.push.configured ? 'VAPID keys are set. Each person enables push per device under Notifications.' : 'Generate keys with "npx web-push generate-vapid-keys" and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.'}</p></Card>
        <Card title={<span className="flex items-center gap-2">Email<S ok={d.email.configured} /></span>}><p className="text-[13px] text-ink-2">{d.email.configured ? 'SMTP is configured for password resets and email notifications.' : 'Set EMAIL_HOST, EMAIL_USER and EMAIL_PASSWORD. Without email, admins reset passwords from the Users tab.'}</p></Card>
        <Card title={<span className="flex items-center gap-2">Background jobs<S ok text={d.redis.scheduler} /></span>}><p className="text-[13px] text-ink-2">{d.redis.configured ? 'Reminders, deadline checks and approval follow-ups run on BullMQ with Redis.' : 'Running on the in-process scheduler. This is reliable for a single API instance; set REDIS_URL before running more than one.'}</p></Card>
        <AiContentStudioCard />
        <PurgeDemoDataCard />
        <SystemHealthCard />
        <p className="text-meta text-ink-3 lg:col-span-2">Credentials are stored only as server environment variables and are never shown here.</p>
      </div>
    )}</Async>
  );
}

function AiContentStudioCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ai-status'], queryFn: () => get<any>('/ai/status') });
  const [apiKey, setApiKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await post('/ai/config', { apiKey: apiKey.trim() });
      toast.success('Google Gemini API key saved successfully!');
      setEditing(false);
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['ai-status'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const configured = q.data?.configured;
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span>AI Content Studio (Google Gemini)</span>
          <span
            className={`h-2 w-2 rounded-full ${
              configured ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-amber-500'
            }`}
          />
        </span>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-2">Status:</span>
          {configured ? (
            <Badge t="green">Active · {q.data?.model || 'Gemini 1.5 Flash'}</Badge>
          ) : (
            <Badge t="amber">Ready to connect (Free Tier)</Badge>
          )}
        </div>

        {configured && !editing ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-2.5">
              <div className="text-xs">
                <span className="text-ink-2">API Key: </span>
                <code className="text-ink font-semibold">{q.data?.maskedKey || '••••••••'}</code>
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Update Key
                </Button>
              )}
            </div>
            <p className="text-[12px] text-ink-3">
              Powers the optional AI Script Generator, 5 Viral Hooks selector, and Auto Captions/Hashtags.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-ink-2 text-xs leading-relaxed">
              Google Gemini offers a <b>100% free tier (1,500 requests/day)</b> with zero credit card required.
            </p>
            {canEdit ? (
              <div className="space-y-2">
                <Field label="Gemini API Key" hint="Paste your key from Google AI Studio">
                  <Input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    Get Free Key from Google AI Studio <ExternalLink size={12} />
                  </a>
                  <div className="flex gap-2">
                    {editing && (
                      <Button size="sm" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!apiKey.trim()}
                      loading={saving}
                      onClick={handleSave}
                    >
                      Save Key
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-3 italic">
                Ask an Admin or Super Admin to set the Gemini API Key to enable live AI features.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function PurgeDemoDataCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  if (user?.role !== 'SUPER_ADMIN') return null;

  const handlePurge = async () => {
    if (confirmText.trim().toUpperCase() !== 'PURGE') return;
    setLoading(true);
    try {
      const res = await post<any>('/system/purge-demo-data');
      toast.success(res.message || 'Demo data wiped successfully!');
      setOpen(false);
      setConfirmText('');
      qc.invalidateQueries();
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2 text-rose-500 font-semibold">
          <Trash2 size={16} /> Clean Slate: Purge Demo Data
        </span>
      }
      className="lg:col-span-2 border-rose-500/30 bg-rose-500/5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="font-semibold text-ink">Remove all demo clients, scripts, chats & content</div>
          <p className="text-[13px] text-ink-2 max-w-2xl">
            Permanently wipes all sample/test operational data (clients, contents, scripts, versions, shoots, tasks, approvals, messages, chatrooms, uploaded test media).
            <span className="block mt-1 text-emerald-500 font-medium">
              ✓ All user accounts, team members, passwords, and device push notifications are preserved.
            </span>
          </p>
        </div>
        <Button variant="danger" onClick={() => { setConfirmText(''); setOpen(true); }}>
          Purge Demo Data
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirm Demo Data Purge"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText.trim().toUpperCase() !== 'PURGE'}
              loading={loading}
              onClick={handlePurge}
            >
              Confirm & Wipe Demo Data
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[14px]">
          <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-rose-400">
            ⚠️ <b>Caution:</b> This action is irreversible. All demo clients, scripts, shoots, tasks, messages, and uploaded files will be permanently deleted from this database.
          </div>
          <p className="text-ink-2">
            Your login accounts, team members, passwords, and device push notification subscriptions will <b>NOT</b> be deleted.
          </p>
          <Field label="Type PURGE to confirm">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="PURGE"
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function SystemHealthCard() {
  const can = useCan();
  const allowed = can('users.manage') || can('integrations.manage') || can('roles.manage');
  const q = useQuery({ queryKey: ['system-health'], queryFn: () => get<any>('/system-health'), refetchInterval: 30000, enabled: allowed });
  if (!allowed) return null;

  return (
    <Card title="System & Database Health" className="lg:col-span-2">
      <Async q={q}>
        {(h: any) => (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-[13px]">
            <div className="rounded border border-line bg-surface-2 p-3">
              <div className="text-meta text-ink-2">Status</div>
              <div className="mt-1 flex items-center gap-2 font-bold text-ink">
                <Badge t={h?.status === 'HEALTHY' ? 'green' : 'amber'}>{h?.status || 'UNKNOWN'}</Badge>
              </div>
              <div className="mt-1 text-meta text-ink-3">Uptime: {Math.floor((h?.uptimeSeconds || 0) / 3600)}h {Math.floor(((h?.uptimeSeconds || 0) % 3600) / 60)}m</div>
            </div>
            <div className="rounded border border-line bg-surface-2 p-3">
              <div className="text-meta text-ink-2">Database</div>
              <div className="mt-1 font-bold text-ink">{h?.database?.name || 'smmpro'}</div>
              <div className="mt-1 text-meta text-ink-3">Ping: {h?.database?.pingMs != null && h?.database?.pingMs >= 0 ? `${h.database.pingMs}ms` : 'Active'} · Pool: {h?.database?.poolSize ?? 50}</div>
            </div>
            <div className="rounded border border-line bg-surface-2 p-3">
              <div className="text-meta text-ink-2">Memory (RSS / Heap)</div>
              <div className="mt-1 font-bold text-ink">{h?.memory?.rssMb ?? 0} MB</div>
              <div className="mt-1 text-meta text-ink-3">Heap: {h?.memory?.heapUsedMb ?? 0} / {h?.memory?.heapTotalMb ?? 0} MB</div>
            </div>
            <div className="rounded border border-line bg-surface-2 p-3">
              <div className="text-meta text-ink-2">Total Records</div>
              <div className="mt-1 font-bold text-ink">{h?.counts?.content ?? 0} Content · {h?.counts?.users ?? 0} Users</div>
              <div className="mt-1 text-meta text-ink-3">{h?.counts?.tasks ?? 0} Tasks · {h?.counts?.media ?? 0} Files</div>
            </div>
          </div>
        )}
      </Async>
    </Card>
  );
}

export { label };
