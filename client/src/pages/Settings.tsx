import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Bell, BellOff, Download, Smartphone, RefreshCw, Send, Shield, Laptop, Trash2, Copy, LogOut, ExternalLink } from 'lucide-react';
import { get, post, patch, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import { toast } from '@/store/ui';
import { Async, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Tabs } from '@/components/ui';
import { canInstall, disablePush, enablePush, isIOS, isStandalone, onInstallChange, promptInstall, pushState, PushState } from '@/pwa';
import { showDeviceNotification } from '@/lib/notifications';
import { ago, fmtSize, label, roleLabel } from '@/lib/format';
import { ThemePicker } from '@/components/Header';
import { useTheme } from '@/store/theme';

type T = 'profile' | 'notifications' | 'users' | 'roles' | 'integrations';
export default function Settings() {
  const can = useCan(); const [sp, setSp] = useSearchParams(); const tab = (sp.get('tab') as T) || 'profile';
  const tabs = [{ key: 'profile' as T, label: 'Profile' }, { key: 'notifications' as T, label: 'Notifications' }, ...(can('users.manage') ? [{ key: 'users' as T, label: 'Users' }] : []), ...(can('roles.manage') ? [{ key: 'roles' as T, label: 'Roles and permissions' }] : []), ...(can('integrations.manage') ? [{ key: 'integrations' as T, label: 'Integrations' }] : [])];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} value={tab} onChange={(k) => setSp(k === 'profile' ? {} : { tab: k }, { replace: true })} />
      {tab === 'profile' && <Profile />}{tab === 'notifications' && <NotificationSettings />}{tab === 'users' && can('users.manage') && <Users />}{tab === 'roles' && can('roles.manage') && <Roles />}{tab === 'integrations' && can('integrations.manage') && <Integrations />}
    </>
  );
}

function Profile() {
  const { user, setUser } = useAuth(); const { mode, resolved } = useTheme(); const [name, setName] = useState(user!.name); const [email, setEmail] = useState(user!.email); const [phone, setPhone] = useState(user!.phone || ''); const [cur, setCur] = useState(''); const [pw, setPw] = useState('');
  const save = useMutation({ mutationFn: (b: any) => patch('/auth/me', b), onSuccess: (r) => { setUser(r.user); setCur(''); setPw(''); toast.success('Saved.'); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
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
  const on = async () => { setBusy(true); try { const s = await enablePush(); setPs(s); if (s === 'on') { toast.success('Push notifications enabled on this device.'); save.mutate({ push: true }); qc.invalidateQueries({ queryKey: ['push-devices'] }); } else if (s === 'denied') toast.error('Notifications are blocked for this site in your browser settings.'); } catch (e) { toast.error(errMsg(e, 'Could not enable push on this device.')); } setBusy(false); };
  const off = async () => { setBusy(true); await disablePush(); setPs(await pushState()); qc.invalidateQueries({ queryKey: ['push-devices'] }); setBusy(false); toast.success('Push disabled on this device.'); };
  const test = async () => {
    try {
      showDeviceNotification({
        title: '🔔 SMM PRO',
        message: 'Push & device notifications are working on this device.',
        sound: true,
        vibrate: true,
      });
      const r = await post('/push/test');
      toast.info(r.devices ? `Test sent to ${r.devices} device${r.devices > 1 ? 's' : ''}. Check your notification panel.` : 'Notification triggered on this device.');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Card title="Push notifications on this device">
          <p className="text-ink-2">Get notified about assignments, approvals, mentions and reminders even when SMM PRO is not open.</p>
          <div className="mt-3">
            {ps === null ? <span className="text-ink-3">Checking this device…</span>
              : ps === 'on' ? <div className="flex flex-wrap items-center gap-2"><Badge t="green">Enabled on this device</Badge><Button size="sm" onClick={test} icon={<Send size={14} />}>Send test</Button><Button size="sm" loading={busy} onClick={off} icon={<BellOff size={14} />}>Disable</Button></div>
              : ps === 'off' ? <Button variant="primary" loading={busy} onClick={on} icon={<Bell size={15} />}>Enable notifications</Button>
              : ps === 'ios-needs-install' ? <div className="rounded border border-line bg-surface-2 p-3 text-[13px]"><div className="flex items-center gap-2 font-medium"><Smartphone size={15} />Add SMM PRO to your Home Screen first</div><ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-ink-2"><li>In Safari, tap the Share button.</li><li>Choose "Add to Home Screen".</li><li>Open SMM PRO from the Home Screen and return to this page.</li></ol><p className="mt-1.5 text-ink-3">iPhone and iPad only allow push for installed web apps (iOS 16.4 or later).</p></div>
              : ps === 'denied' ? <p className="rounded bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">Notifications are blocked for this site. Allow them in your browser's site settings, then reload.</p>
              : ps === 'server-off' ? <p className="text-[13px] text-ink-2">Push is not configured on the server yet. An admin needs to add VAPID keys.</p>
              : <p className="text-[13px] text-ink-2">This browser does not support push notifications. In-app notifications still work.</p>}
          </div>
          {!!devices.data?.length && <div className="mt-4 border-t border-line pt-3"><div className="label">Your subscribed devices</div><ul className="space-y-1 text-[13px]">{devices.data.map((d) => <li key={d.endpoint} className="flex justify-between"><span>{d.platform} · {d.browser}</span><span className="text-ink-3">{d.lastUsedAt ? `Last used ${ago(d.lastUsedAt)}` : ''}</span></li>)}</ul></div>}
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
  const qc = useQueryClient(); const me = useAuth((s) => s.user)!; const q = useQuery({ queryKey: ['team', 'all'], queryFn: () => get<any[]>('/team', { all: 1 }) }); const [edit, setEdit] = useState<any>(null);
  const [v, setV] = useState<any>({});
  useEffect(() => { if (edit) setV({ name: edit.name || '', email: edit.email || '', role: edit.role || 'EDITOR', title: edit.title || '', phone: edit.phone || '', password: '', active: edit.active !== false, coverUserId: edit.coverUserId || '' }); }, [edit]);
  const m = useMutation({ mutationFn: () => { const b = { ...v, coverUserId: v.coverUserId || null }; if (!b.password) delete b.password; return edit._id ? patch(`/users/${edit._id}`, b) : post('/users', b); }, onSuccess: () => { toast.success(edit._id ? 'User updated.' : 'User created.'); setEdit(null); qc.invalidateQueries({ queryKey: ['team'] }); }, onError: (e) => toast.error(errMsg(e)) });
  const set = (k: string) => (e: any) => setV((s: any) => ({ ...s, [k]: e.target.value }));
  return (
    <>
      <Card title="Team accounts" pad={false} action={<Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEdit({})}>Add user</Button>}>
        <Async q={q}>{(d: any[]) => <Table head={['Name', 'Email', 'Role', 'Status', 'Last sign-in', '']} minWidth={720}>{d.map((u) => <tr key={u._id} className="group hover:bg-surface-2 transition-colors"><td className="td font-semibold text-ink group-hover:text-primary-ink transition-colors">{u.name}</td><td className="td font-medium text-ink-2">{u.email}</td><td className="td font-medium text-ink">{roleLabel(u.role)}</td><td className="td"><Badge t={u.active ? 'green' : 'neutral'}>{u.active ? 'Active' : 'Deactivated'}</Badge></td><td className="td text-meta font-medium text-ink-2">{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</td><td className="td text-right"><Button size="sm" onClick={() => setEdit(u)}>Edit</Button></td></tr>)}</Table>}</Async>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? `Edit ${edit.name}` : 'Add user'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!v.name || !v.email || (!edit?._id && (v.password || '').length < 8)} onClick={() => m.mutate()}>{edit?._id ? 'Save' : 'Create user'}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={v.name || ''} onChange={set('name')} /></Field><Field label="Email"><Input type="email" value={v.email || ''} onChange={set('email')} /></Field>
          <Field label="Role"><Select value={v.role || 'EDITOR'} onChange={set('role')} disabled={edit?._id === me._id}>{ROLES.filter((r) => r !== 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select></Field><Field label="Job title"><Input value={v.title || ''} onChange={set('title')} /></Field>
          <Field label="Phone"><Input value={v.phone || ''} onChange={set('phone')} /></Field><Field label={edit?._id ? 'Reset password' : 'Temporary password'} hint={edit?._id ? 'Leave blank to keep the current password.' : 'At least 8 characters. Ask them to change it after first sign-in.'}><Input type="text" value={v.password || ''} onChange={set('password')} autoComplete="off" /></Field>
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
        <Card pad={false}><ul>{ROLES.map((r) => <li key={r}><button onClick={() => setRole(r)} className={`block w-full px-4 py-2.5 text-left transition-colors duration-150 ${r === role ? 'bg-primary-soft font-medium text-primary-ink' : 'hover:bg-surface-2'}`}>{roleLabel(r)}</button></li>)}</ul></Card>
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
        <SystemHealthCard />
        <p className="text-meta text-ink-3 lg:col-span-2">Credentials are stored only as server environment variables and are never shown here.</p>
      </div>
    )}</Async>
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
