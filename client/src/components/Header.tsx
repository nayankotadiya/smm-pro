import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, Search, CheckCheck, X, ClipboardList, ShieldCheck, MessageSquare, AlarmClock, Clock, FileVideo, GitBranch, Settings2, LogOut, MinusCircle, User, Sun, Moon, Monitor, Plus, Calendar, Camera, Scissors, FileText, Sparkles, Building2, Users, CornerDownLeft, Zap, Send } from 'lucide-react';
import { get, post, patch, del } from '@/lib/api';
import { ago, roleLabel } from '@/lib/format';
import { Avatar, Empty, IconButton, Spinner, PresenceDot } from './ui';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useTheme, ThemeMode } from '@/store/theme';
import { usePresence } from '@/hooks/useMotion';
import { Segmented } from './ui';

export const CAT_ICON: Record<string, any> = { TASK: ClipboardList, APPROVAL: ShieldCheck, CHAT: MessageSquare, REMINDER: AlarmClock, DEADLINE: Clock, FILES: FileVideo, WORKFLOW: GitBranch, SYSTEM: Settings2 };

function useOutside(ref: React.RefObject<HTMLElement>, close: () => void, open: boolean) {
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); }; const k = (e: KeyboardEvent) => e.key === 'Escape' && close(); document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, [open, close, ref]);
}

export function useNotificationActions() {
  const qc = useQueryClient(); const nav = useNavigate();
  const inv = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => patch(`/notifications/${id}/read`), onSuccess: inv });
  const readAll = useMutation({ mutationFn: () => post('/notifications/read-all'), onSuccess: inv });
  const remove = useMutation({ mutationFn: (id: string) => del(`/notifications/${id}`), onSuccess: inv });
  const open = (n: any) => { if (!n.read) read.mutate(n._id); if (n.link) nav(n.link); };
  return { read, readAll, remove, open };
}
export function NotificationRow({ n, onOpen, onRead, onDelete }: { n: any; onOpen: () => void; onRead?: () => void; onDelete?: () => void }) {
  const Icon = CAT_ICON[n.category] || Bell;
  return (
    <li className={clsx('group relative flex items-start gap-3 px-4 py-3 transition-colors duration-200 hover:bg-surface-2', !n.read && 'bg-primary-soft/40')}>
      {!n.read && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
      <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', !n.read ? 'bg-primary-soft text-primary-ink' : 'bg-surface-3 text-ink-2')}><Icon size={15} /></span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2"><span className={clsx('truncate', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</span>{!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</div>
        {n.message && <div className="line-clamp-2 text-[13px] text-ink-2">{n.message}</div>}
        <div className="mt-0.5 text-meta text-ink-3">{ago(n.createdAt)}</div>
      </button>
      <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {!n.read && onRead && <IconButton label="Mark as read" onClick={onRead}><CheckCheck size={15} /></IconButton>}
        {onDelete && !n.critical && <IconButton label="Delete" onClick={onDelete}><X size={15} /></IconButton>}
      </div>
    </li>
  );
}

import { TestNotificationButton } from './NotificationBanner';
import { CustomNotificationModal } from './CustomNotificationModal';

export function NotificationBell() {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const me = useAuth((s) => s.user);
  const canSendCustom = me?.role === 'SUPER_ADMIN' || me?.role === 'ADMIN' || me?.role === 'MANAGER';
  useOutside(ref, () => setOpen(false), open);
  const q = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => get('/notifications', { limit: 8 }) });
  const a = useNotificationActions();
  const unread = q.data?.unread || 0;
  const [mounted, closing] = usePresence(open, 140);
  return (
    <div className="relative" ref={ref}>
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={clsx('relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-all duration-200 hover:bg-surface-3/80 hover:text-ink hover:scale-105 active:scale-90', open && 'bg-surface-3 text-ink')}>
        <Bell size={18} className={clsx('origin-top transition-transform duration-300', open && '-rotate-12')} />
        {unread > 0 && <span key={unread} className="absolute right-0.5 top-0.5 min-w-[17px] animate-badge-pop rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-1 text-center text-[10px] font-bold leading-[17px] text-white shadow-[0_0_10px_rgba(244,63,94,0.45)] ring-2 ring-surface">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {mounted && (
        <div className={clsx('menu fixed inset-x-2 top-14 z-40 origin-top-right overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]', closing ? 'animate-pop-out' : 'animate-pop-in')}>
          <div className="flex items-center justify-between border-b border-line/60 px-5 py-3"><span className="font-bold">Notifications {unread > 0 && <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-meta font-bold text-primary-ink shadow-[0_0_8px_rgba(124,58,237,0.3)]">{unread}</span>}</span>{unread > 0 && <button className="link text-meta" onClick={() => a.readAll.mutate()}>Mark all as read</button>}</div>
          {q.isLoading ? <div className="flex justify-center p-6"><Spinner /></div> : !q.data?.items.length ? <Empty title="You're all caught up" /> :
            <ul className="stagger max-h-[60dvh] divide-y divide-line/60 overflow-y-auto">{q.data.items.map((n: any) => <NotificationRow key={n._id} n={n} onOpen={() => { a.open(n); setOpen(false); }} onRead={() => a.read.mutate(n._id)} />)}</ul>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 bg-surface-2/60 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <TestNotificationButton />
              {canSendCustom && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); setCustomModalOpen(true); }}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-primary hover:underline transition-colors"
                >
                  <Send size={11} /> Send Alert
                </button>
              )}
            </div>
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-[12.5px] font-bold text-primary-ink transition-colors hover:underline">Open center →</Link>
          </div>
        </div>
      )}
      {canSendCustom && <CustomNotificationModal open={customModalOpen} onClose={() => setCustomModalOpen(false)} />}
    </div>
  );
}

const GROUPS: { key: string; title: string; to: (x: any) => string; text: (x: any) => string; sub?: (x: any) => string }[] = [
  { key: 'content', title: 'Content', to: (x) => `/content/${x._id}`, text: (x) => x.title, sub: (x) => `${x.contentId} · ${x.clientId?.name || ''}` },
  { key: 'clients', title: 'Clients', to: (x) => `/clients/${x._id}`, text: (x) => x.name, sub: (x) => x.businessName || '' },
  { key: 'campaigns', title: 'Campaigns', to: (x) => `/clients/${x.clientId?._id}?tab=campaigns`, text: (x) => x.name, sub: (x) => x.clientId?.name || '' },
  { key: 'scripts', title: 'Scripts', to: (x) => `/content/${x.contentId?._id}?tab=script`, text: (x) => `${x.contentId?.title} — ${x.label}`, sub: (x) => x.dialogue || x.body || x.hook || '' },
  { key: 'tasks', title: 'Tasks', to: (x) => `/tasks/${x._id}`, text: (x) => x.title },
  { key: 'files', title: 'Files', to: (x) => (x.contentId ? `/content/${x.contentId}?tab=files` : '/media'), text: (x) => x.fileName, sub: (x) => roleLabel(x.category) },
  { key: 'messages', title: 'Messages', to: (x) => `/chat/${x.roomId}`, text: (x) => x.message, sub: (x) => `${x.senderId?.name || ''} · ${ago(x.createdAt)}` },
  { key: 'approvals', title: 'Approvals', to: (x) => `/content/${x.contentId?._id}?tab=reviews`, text: (x) => `${x.contentId?.title} — ${x.version}`, sub: (x) => roleLabel(x.status) },
  { key: 'team', title: 'Team members', to: (x) => `/team/${x._id}`, text: (x) => x.name, sub: (x) => roleLabel(x.role) },
];
const QUICK_ACTIONS = [
  { label: '⚡ Fast-Track Client Video', sub: 'Client shot raw footage? Drop & assign to editor in 1 click', to: '/content?action=fast-track', icon: Zap, badge: 'Fast-Track' },
  { label: 'Create New Content', sub: 'Start a new script or campaign', to: '/content', icon: Plus, badge: 'Action' },
  { label: 'Pending Approvals', sub: 'Client & internal reviews waiting', to: '/approvals', icon: ShieldCheck, badge: 'Reviews' },
  { label: 'Production Calendar', sub: 'Timeline of shoots, edits & deadlines', to: '/calendar', icon: Calendar, badge: 'Plan' },
  { label: "Shooter Shoots (Bhargav)", sub: 'Assigned shoot locations & plans', to: '/shooting', icon: Camera, badge: 'Shooter' },
  { label: "Video Editing Queue (Tapesh)", sub: 'Raw footage & editing versions', to: '/editing', icon: Scissors, badge: 'Editor' },
  { label: "Scripts Management (Siddharth)", sub: 'Drafts, versions & script review', to: '/scripts', icon: FileText, badge: 'Scripts' },
  { label: 'Clients Portfolio', sub: 'Brand settings & campaigns', to: '/clients', icon: Building2, badge: 'Clients' },
  { label: 'Team Members', sub: 'Active members & online presence', to: '/team', icon: Users, badge: 'Team' },
];

export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [deb, setDeb] = useState('');
  const [open, setOpen] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDeb(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => modalInputRef.current?.focus(), 50);
      setActiveIdx(0);
    }
  }, [open]);

  const q = useQuery({
    queryKey: ['search', deb],
    queryFn: () => get('/search', { q: deb }),
    enabled: deb.length >= 2,
  });

  const rawGroups = GROUPS.filter((g) => q.data?.[g.key]?.length);
  const filteredGroups = filterGroup === 'all'
    ? rawGroups
    : rawGroups.filter((g) => g.key === filterGroup);

  const allResultItems = useMemo(() => {
    if (deb.length < 2) {
      return QUICK_ACTIONS.map((a) => ({
        id: a.to,
        to: a.to,
        title: a.label,
        sub: a.sub,
        badge: a.badge,
        icon: a.icon,
      }));
    }
    const items: any[] = [];
    filteredGroups.forEach((g) => {
      (q.data?.[g.key] || []).forEach((x: any) => {
        items.push({
          id: x._id,
          to: g.to(x),
          title: g.text(x),
          sub: g.sub ? g.sub(x) : g.title,
          badge: g.title,
        });
      });
    });
    return items;
  }, [deb, filteredGroups, q.data]);

  // Handle arrow key navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1 < allResultItems.length ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 >= 0 ? i - 1 : allResultItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (allResultItems[activeIdx]) {
          nav(allResultItems[activeIdx].to);
          setOpen(false);
          setTerm('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activeIdx, allResultItems, nav]);

  return (
    <>
      {/* Header Search Trigger */}
      <div className="relative min-w-0 flex-1 sm:max-w-md">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center justify-between rounded-full border border-line/65 bg-surface-2/60 px-4 text-left shadow-xs backdrop-blur-2xl transition-all duration-300 hover:border-primary/60 hover:bg-surface/90"
        >
          <span className="flex items-center gap-2 text-[13px] text-ink-3">
            <Search size={16} className="text-ink-3 shrink-0" />
            <span className="truncate hidden sm:inline">Search content, clients, scripts, team...</span>
            <span className="truncate sm:hidden">Search...</span>
          </span>
          <kbd className="hidden rounded-full border border-line/80 bg-surface/80 px-2 py-0.5 text-[10px] font-bold text-ink-3 shadow-xs sm:inline-block">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Command Palette Spotlight Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] px-4 backdrop-blur-md animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-primary/40 bg-surface shadow-[0_25px_60px_rgba(0,0,0,0.5)] animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="relative flex items-center border-b border-line px-4 py-3">
              <Search size={18} className="mr-3 text-primary-ink shrink-0" />
              <input
                ref={modalInputRef}
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setActiveIdx(0);
                }}
                placeholder="Type to search or jump to any page..."
                className="w-full border-0 bg-transparent text-[15px] font-semibold text-ink placeholder-ink-3 focus:outline-none"
              />
              {term && (
                <button
                  type="button"
                  onClick={() => setTerm('')}
                  className="rounded-lg p-1 text-ink-3 hover:bg-surface-3 hover:text-ink mr-2"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="rounded-lg border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-3">
                ESC
              </kbd>
            </div>

            {/* Filter category chips */}
            {deb.length >= 2 && rawGroups.length > 0 && (
              <div className="flex gap-1.5 border-b border-line/60 bg-surface-2/40 px-4 py-2 overflow-x-auto text-[11px] font-bold">
                <button
                  onClick={() => setFilterGroup('all')}
                  className={clsx(
                    'rounded-lg px-2.5 py-1 transition-all',
                    filterGroup === 'all' ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                  )}
                >
                  All ({rawGroups.reduce((a, b) => a + (q.data?.[b.key]?.length || 0), 0)})
                </button>
                {rawGroups.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setFilterGroup(g.key)}
                    className={clsx(
                      'rounded-lg px-2.5 py-1 transition-all',
                      filterGroup === g.key ? 'bg-primary text-white' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                    )}
                  >
                    {g.title} ({q.data[g.key]?.length || 0})
                  </button>
                ))}
              </div>
            )}

            {/* Results or Quick Actions */}
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {q.isLoading && deb.length >= 2 ? (
                <div className="flex items-center justify-center p-8">
                  <Spinner />
                </div>
              ) : deb.length < 2 ? (
                /* Quick Actions */
                <div className="space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">
                    ⚡ Quick Navigation &amp; Actions
                  </div>
                  {QUICK_ACTIONS.map((a, idx) => {
                    const Icon = a.icon;
                    const isSelected = activeIdx === idx;
                    return (
                      <button
                        key={a.to}
                        onClick={() => {
                          nav(a.to);
                          setOpen(false);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={clsx(
                          'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all',
                          isSelected
                            ? 'bg-primary-soft/80 text-primary-ink shadow-xs ring-1 ring-primary/40'
                            : 'hover:bg-surface-2 text-ink'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={clsx(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              isSelected ? 'bg-primary text-white' : 'bg-surface-2 text-ink-2'
                            )}
                          >
                            <Icon size={16} />
                          </span>
                          <div>
                            <div className="text-[13px] font-bold text-ink">{a.label}</div>
                            <div className="text-[11px] text-ink-3">{a.sub}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-ink-2">
                            {a.badge}
                          </span>
                          {isSelected && <CornerDownLeft size={14} className="text-primary-ink" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : allResultItems.length === 0 ? (
                <div className="p-8 text-center">
                  <Empty title={`No results for "${deb}"`} hint="Try searching for title, client name, or script phrase." />
                </div>
              ) : (
                /* Search Results */
                <div className="space-y-1">
                  {allResultItems.map((item, idx) => {
                    const isSelected = activeIdx === idx;
                    return (
                      <button
                        key={`${item.id}-${idx}`}
                        onClick={() => {
                          nav(item.to);
                          setOpen(false);
                          setTerm('');
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={clsx(
                          'flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all',
                          isSelected
                            ? 'bg-primary-soft/80 text-primary-ink shadow-xs ring-1 ring-primary/40'
                            : 'hover:bg-surface-2 text-ink'
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="truncate font-bold text-[13px] text-ink">{item.title}</div>
                          {item.sub && <div className="truncate text-[11px] text-ink-3">{item.sub}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-ink-2">
                            {item.badge}
                          </span>
                          {isSelected && <CornerDownLeft size={14} className="text-primary-ink" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Navigation Bar */}
            <div className="flex items-center justify-between border-t border-line/60 bg-surface-2/40 px-4 py-2 text-[11px] text-ink-3 font-medium">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-line bg-surface px-1 py-0.5 font-bold">↑</kbd>
                  <kbd className="rounded border border-line bg-surface px-1 py-0.5 font-bold">↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-bold">↵</kbd>
                  to open
                </span>
              </div>
              <span>Press <kbd className="rounded border border-line bg-surface px-1 py-0.5 font-bold">ESC</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Sun / moon button in the header with iOS spring click and hover animation */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={resolved === 'dark' ? 'Light theme' : 'Dark theme'} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-all duration-200 hover:bg-surface-3/80 hover:text-ink hover:scale-105 active:scale-90">
      <span key={resolved} className="animate-spin-in">{resolved === 'dark' ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-600" />}</span>
    </button>
  );
}
export function ThemePicker({ size = 'sm' as 'sm' | 'md' }) {
  const { mode, setMode } = useTheme();
  return <Segmented<ThemeMode> size={size} value={mode} onChange={setMode} options={[{ key: 'light', label: <><Sun size={14} />Light</> }, { key: 'dark', label: <><Moon size={14} />Dark</> }, { key: 'system', label: <><Monitor size={14} />System</> }]} />;
}

export function UserMenu() {
  const user = useAuth((s) => s.user)!; const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const nav = useNavigate(); const qc = useQueryClient();
  const status = useUI((s) => s.presence[user._id]?.status) || 'ONLINE';
  useOutside(ref, () => setOpen(false), open);
  const [mounted, closing] = usePresence(open, 140);
  const logout = async () => { try { await post('/auth/logout'); } catch { /* still sign out locally */ } navigator.serviceWorker?.controller?.postMessage('logout'); disconnectSocket(); qc.clear(); useAuth.getState().clear(); nav('/login'); };
  const setDnd = (on: boolean) => { getSocket()?.emit('presence:set', { status: on ? 'DND' : 'ONLINE' }); setOpen(false); };

  const item = 'flex w-full items-center gap-2.5 px-4 py-2 text-left font-medium text-[13px] transition-colors duration-150 hover:bg-surface-2/80';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={clsx('relative flex h-9 items-center gap-2 rounded-xl px-2 transition-all duration-200 hover:bg-surface-3/80', open && 'bg-surface-3')} aria-label="Account menu">
        <span className="relative">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size={30} />
          <PresenceDot userId={user._id} className="absolute -bottom-0.5 -right-0.5" />
        </span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-[13px] font-bold text-ink">{user.name}</span>
          <span className="block text-[11px] font-semibold text-ink-3">{roleLabel(user.role)}</span>
        </span>
      </button>
      {mounted && (
        <div className={clsx('menu absolute right-0 top-12 z-40 w-72 origin-top-right overflow-hidden py-1.5 shadow-pop', closing ? 'animate-pop-out' : 'animate-pop-in')}>
          <div className="border-b border-line/60 px-4 py-3"><div className="font-bold text-ink">{user.name}</div><div className="truncate text-meta font-medium text-ink-2">{user.email}</div></div>

          <div className="border-b border-line/60 px-4 py-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-3">Appearance</div><ThemePicker /></div>
          <button onClick={() => setDnd(status !== 'DND')} className={item}><MinusCircle size={15} className={status === 'DND' ? 'text-danger-ink' : 'text-ink-2'} />{status === 'DND' ? 'Turn off Do Not Disturb' : 'Do Not Disturb'}</button>
          <button onClick={() => { nav('/settings'); setOpen(false); }} className={item}><User size={15} className="text-ink-2" />Settings</button>
          <button onClick={logout} className={item}><LogOut size={15} className="text-ink-2" />Sign out</button>
        </div>
      )}
    </div>
  );
}
