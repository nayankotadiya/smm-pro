import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { LayoutDashboard, Building2, Clapperboard, FileText, Camera, Scissors, ShieldCheck, CalendarDays, FolderOpen, MessageSquare, Workflow, AlarmClock, Users, BarChart3, Settings, Menu, X, ListChecks, CheckSquare } from 'lucide-react';
import { useCan } from '@/store/auth';
import { useUI } from '@/store/ui';
import { GlobalSearch, NotificationBell, UserMenu, ThemeToggle } from '@/components/Header';
import { ConnectionBar, Toasts, UploadTray } from '@/components/Shell';
import { Logo } from '@/components/Logo';
import { useRealtime } from '@/hooks/useRealtime';
import { usePresence } from '@/hooks/useMotion';
import { get } from '@/lib/api';
import { setActivity } from '@/lib/socket';

export default function AppLayout() {
  useRealtime();
  const can = useCan(); const loc = useLocation();
  const { sidebar, setSidebar } = useUI();
  const [scrim, scrimClosing] = usePresence(sidebar, 200);
  useEffect(() => { setSidebar(false); }, [loc.pathname, setSidebar]);
  useEffect(() => { if (!/^\/content\/[a-f0-9]{24}/.test(loc.pathname)) setActivity(''); }, [loc.pathname]);
  const unread = useQuery({ queryKey: ['chat-unread'], queryFn: () => get('/chat/unread-count') });
  const appr = useQuery({ queryKey: ['approvals', 'counts'], queryFn: () => get('/approvals/counts') });
  const pending = appr.data?.mine || 0;
  const nav: { to: string; label: string; icon: any; show?: boolean; badge?: number; section?: string }[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/my-work', label: 'My Work', icon: ListChecks },
    { to: '/clients', label: 'Clients', icon: Building2, show: can('clients.read'), section: 'Production' },
    { to: '/content', label: 'Content', icon: Clapperboard },
    { to: '/scripts', label: 'Scripts', icon: FileText },
    { to: '/shooting', label: 'Shooting', icon: Camera },
    { to: '/editing', label: 'Editing', icon: Scissors },
    { to: '/approvals', label: 'Approvals', icon: ShieldCheck, badge: pending },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare, section: 'Workspace' },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/media', label: 'Media', icon: FolderOpen },
    { to: '/chat', label: 'Chat', icon: MessageSquare, badge: unread.data?.count },
    { to: '/reminders', label: 'Reminders', icon: AlarmClock },
    { to: '/automation', label: 'Automation', icon: Workflow, show: can('dashboard.org'), section: 'Company' },
    { to: '/team', label: 'Team', icon: Users },
    { to: '/reports', label: 'Reports', icon: BarChart3, show: can('reports.view') },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  const isChat = loc.pathname.startsWith('/chat');
  const pageKey = loc.pathname.split('/').slice(0, 3).join('/');

  return (
    <div className="relative flex h-app flex-col overflow-hidden bg-canvas">
      {/* Aurora Mesh Lights — soft in light mode, vivid in dark */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden>
        <div className="aurora-orb-1 absolute -left-[10%] -top-[12%] h-[680px] w-[680px] rounded-full bg-gradient-to-tr from-violet-500/20 via-purple-500/15 to-fuchsia-500/15 blur-[130px] dark:from-violet-600/45 dark:via-purple-600/35 dark:to-fuchsia-500/30" />
        <div className="aurora-orb-2 absolute -right-[8%] top-[5%] h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-cyan-400/18 via-blue-500/14 to-indigo-500/12 blur-[140px] dark:from-cyan-400/40 dark:via-blue-600/35 dark:to-indigo-600/28" />
        <div className="aurora-orb-3 absolute bottom-[0%] left-[15%] h-[580px] w-[580px] rounded-full bg-gradient-to-tr from-rose-400/15 via-pink-500/10 to-violet-500/12 blur-[145px] dark:from-rose-500/32 dark:via-pink-600/22 dark:to-violet-600/28" />
        <div className="aurora-orb-1 absolute top-[40%] right-[25%] h-[450px] w-[450px] rounded-full bg-gradient-to-br from-emerald-400/10 via-teal-500/8 to-transparent blur-[140px] dark:from-emerald-400/22 dark:via-teal-500/16" />
      </div>

      <ConnectionBar />

      <div className="relative z-10 flex min-h-0 flex-1">
        {scrim && <div className={clsx('fixed inset-0 z-40 bg-overlay/50 backdrop-blur-[4px] lg:hidden', scrimClosing ? 'animate-fade-out' : 'animate-fade-in')} onClick={() => setSidebar(false)} />}
        
        {/* Premium Dark Agency Sidebar */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 ease-out safe-t lg:static lg:z-auto lg:w-56 lg:translate-x-0 xl:w-60',
            sidebar ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full'
          )}
          style={{ background: 'rgb(var(--sidebar-bg))', borderRight: '1px solid rgb(var(--sidebar-line))' }}
        >
          {/* Logo area */}
          <div
            className="flex h-14 shrink-0 items-center justify-between px-4"
            style={{ borderBottom: '1px solid rgb(var(--sidebar-line))' }}
          >
            <Logo />
            <button
              className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/8 hover:text-white/80 lg:hidden"
              aria-label="Close menu"
              onClick={() => setSidebar(false)}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="Main">
            {nav.filter((n) => n.show !== false).map((n) => (
              <div key={n.to}>
                {n.section && (
                  <div className="flex items-center gap-2 px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'rgb(var(--sidebar-text))' }}>
                    <span className={clsx('h-1 w-1 rounded-full',
                      n.section === 'Production' ? 'bg-indigo-400 shadow-[0_0_5px_#818cf8]'
                        : n.section === 'Workspace' ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]'
                        : 'bg-pink-400 shadow-[0_0_5px_#f472b6]'
                    )} />
                    {n.section}
                  </div>
                )}
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) => clsx(
                    'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-all duration-200 lg:h-[36px]',
                    isActive
                      ? 'font-semibold'
                      : 'hover:translate-x-0.5'
                  )}
                  style={({ isActive }) => ({
                    background: isActive ? 'rgba(255,255,255,0.10)' : 'transparent',
                    color: isActive ? '#fff' : `rgb(var(--sidebar-text))`,
                    border: isActive ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  })}
                >
                  {({ isActive }) => (<>
                    {isActive && (
                      <span aria-hidden className="absolute -left-0.5 top-2 bottom-2 w-[3px] rounded-full bg-gradient-to-b from-indigo-400 via-violet-400 to-fuchsia-400 shadow-[0_0_10px_rgba(139,92,246,0.9)]" />
                    )}
                    <n.icon
                      size={17}
                      strokeWidth={isActive ? 2.2 : 1.7}
                      className={clsx(
                        'shrink-0 transition-all duration-200',
                        isActive ? 'text-indigo-300' : 'group-hover:scale-110'
                      )}
                      style={{ color: isActive ? undefined : `rgb(var(--sidebar-text))` }}
                    />
                    <span className="flex-1 truncate" style={{ color: isActive ? '#fff' : `rgb(var(--sidebar-text-hover))` }}>{n.label}</span>
                    {!!n.badge && (
                      <span key={n.badge} className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-1.5 text-[10px] font-bold leading-[18px] text-white shadow-[0_0_10px_rgba(244,63,94,0.55)] tabular">
                        {n.badge > 99 ? '99+' : n.badge}
                      </span>
                    )}
                  </>)}
                </NavLink>
              </div>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="px-3 pb-4" style={{ borderTop: '1px solid rgb(var(--sidebar-line))' }}>
            <div className="pt-3 text-[11px]" style={{ color: 'rgb(var(--sidebar-text))' }}>
              <div className="flex items-center gap-1.5 px-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
                <span className="font-medium">All systems operational</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* iOS 27 Liquid Glass Header */}
          <header className="header-safe sticky top-0 z-30 flex shrink-0 items-center gap-3 bg-surface/80 px-4 backdrop-blur-2xl backdrop-saturate-150 sm:px-6" style={{ borderBottom: '1px solid rgb(var(--line) / 0.5)', boxShadow: '0 1px 0 0 rgb(var(--line) / 0.3)' }}>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 transition-all duration-150 hover:bg-surface-3 hover:text-ink active:scale-90 lg:hidden" aria-label="Open menu" onClick={() => setSidebar(true)}>
              <Menu size={20} />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <NotificationBell />
              <UserMenu />
            </div>
          </header>

          <main className={clsx('min-h-0 flex-1', isChat ? 'overflow-hidden' : 'overflow-y-auto')}>
            {isChat ? (
              <div className="h-full animate-fade-in"><Outlet /></div>
            ) : (
              <div key={pageKey} className="mx-auto w-full max-w-[1440px] animate-page px-4 py-5 pb-24 sm:px-6 sm:py-6 sm:pb-10">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>
      <UploadTray /><Toasts />
    </div>
  );
}
