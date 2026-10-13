import React, { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, Sparkles, Home, CheckSquare, Calendar, FolderArchive, PlusCircle, MessageSquare, Bell, BellRing, Check, AlertCircle, X, Send } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useNotifications } from '@/store/notifications';
import { getClientPushState, enableClientPush, disableClientPush, sendTestClientPush } from '@/lib/push';
import { NotificationPanel } from './NotificationPanel';
import clsx from 'clsx';

export function Navbar() {
  const { user, brand, logout } = useAuth();
  const { pendingApprovals, unreadChat, unreadNotifications, addToast } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ supported: boolean; permission: NotificationPermission; subscribed: boolean }>({
    supported: true,
    permission: 'default',
    subscribed: false,
  });
  const [loadingPush, setLoadingPush] = useState(false);

  useEffect(() => {
    getClientPushState().then(setPushStatus);
  }, []);

  const handleTogglePush = async () => {
    setLoadingPush(true);
    try {
      if (pushStatus.subscribed) {
        await disableClientPush();
        addToast({ title: 'Notifications Disabled', message: 'Background push alerts have been turned off.', type: 'info' });
      } else {
        const res = await enableClientPush();
        if (res.ok) {
          addToast({ title: 'Notifications Enabled', message: 'You will now receive alerts even when the app is closed.', type: 'success' });
        } else {
          addToast({ title: 'Permission Needed', message: res.reason || 'Could not enable push.', type: 'warning' });
        }
      }
      const updated = await getClientPushState();
      setPushStatus(updated);
    } finally {
      setLoadingPush(false);
    }
  };

  const handleSendTestPush = async () => {
    setLoadingPush(true);
    try {
      const res = await sendTestClientPush();
      addToast({
        title: res.ok ? 'Alert Delivered' : 'Notice',
        message: res.message,
        type: res.ok ? 'success' : 'warning',
      });
    } finally {
      setLoadingPush(false);
    }
  };

  const navLinks = [
    { label: 'Dashboard', to: '/', icon: Home, end: true },
    { label: 'Reviews', to: '/approvals', icon: CheckSquare, badge: pendingApprovals > 0 ? pendingApprovals : null, badgeVariant: 'amber' },
    { label: 'Chat', to: '/chat', icon: MessageSquare, badge: unreadChat > 0 ? unreadChat : null, badgeVariant: 'blue' },
    { label: 'Calendar', to: '/calendar', icon: Calendar },
    { label: 'Assets', to: '/assets', icon: FolderArchive },
    { label: 'New Brief', to: '/briefs', icon: PlusCircle },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/90 backdrop-blur-md transition-all">
        <div className="mx-auto flex min-h-[4rem] max-w-5xl items-center justify-between gap-3 px-3 sm:px-6 py-2">
          {/* Brand Logo & Title */}
          <Link to="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 min-w-0 max-w-[220px] sm:max-w-xs md:max-w-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 border border-line p-1 shadow-xs group-hover:border-primary/40 transition-colors">
              <img
                src="/brand/bulletproof-shield.png"
                alt="Bulletproof Brands"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0 flex flex-col justify-center leading-tight">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-ink text-sm sm:text-base tracking-tight truncate group-hover:text-primary transition-colors">
                  {brand?.businessName || brand?.name || 'Bulletproof Brands'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[9px] font-bold text-primary-ink uppercase tracking-wider shrink-0">
                  <Sparkles size={10} /> Portal
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-semibold text-ink-3 truncate tracking-wider uppercase mt-0.5">
                Bulletproof Script Management
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 bg-surface-2/70 p-1 rounded-xl border border-line shrink-0">
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none relative',
                      isActive
                        ? 'bg-surface text-primary shadow-xs font-bold'
                        : 'text-ink-2 hover:text-ink hover:bg-surface/50'
                    )
                  }
                >
                  <Icon size={14} />
                  <span>{item.label}</span>
                  {item.badge != null && (
                    <span
                      className={clsx(
                        'ml-0.5 px-1.5 py-0.2 text-[10px] font-black rounded-full shrink-0',
                        item.badgeVariant === 'amber'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'bg-primary text-white'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Right Action Icons (Notifications, User, Logout) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Realtime Notification Bell */}
            <button
              onClick={() => setShowNotifications(true)}
              title={pushStatus.subscribed ? 'Notifications (Device alerts active)' : 'Open Notifications'}
              className={clsx(
                'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all',
                unreadNotifications > 0
                  ? 'border-primary/40 bg-primary-soft text-primary'
                  : pushStatus.subscribed
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                  : 'border-line bg-surface-2/60 text-ink-2 hover:text-primary hover:border-primary/30'
              )}
            >
              {pushStatus.subscribed ? <BellRing size={16} /> : <Bell size={16} />}
              {unreadNotifications > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white shadow-xs">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              ) : pushStatus.subscribed ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface animate-pulse" />
              ) : null}
            </button>

            {/* User Profile Info */}
            <div className="hidden sm:flex flex-col text-right max-w-[130px] lg:max-w-[180px]">
              <span className="text-xs font-semibold text-ink truncate">{user?.name}</span>
              <span className="text-[11px] text-ink-3 truncate">{user?.email}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2/60 text-ink-2 hover:bg-danger-soft hover:text-danger-ink hover:border-danger/30 transition-all shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Push Notification Setup Modal */}
      {showPushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <BellRing size={20} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">Real-time Background Alerts</h3>
                  <p className="text-xs text-ink-3">Get notified even when the app is closed or in background</p>
                </div>
              </div>
              <button
                onClick={() => setShowPushModal(false)}
                className="rounded-lg p-1 text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-2">Status:</span>
                <span
                  className={clsx(
                    'font-bold px-2 py-0.5 rounded-md text-[11px]',
                    pushStatus.subscribed
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  )}
                >
                  {pushStatus.subscribed ? 'Active (Background Enabled)' : 'Disabled / Pending Setup'}
                </span>
              </div>
              <div className="flex items-center justify-between text-ink-3">
                <span>Browser Permission:</span>
                <span className="capitalize font-mono text-[11px] font-semibold text-ink">{pushStatus.permission}</span>
              </div>
              <p className="text-ink-2 pt-1 leading-relaxed">
                When enabled, you will receive instant system notifications whenever a new script or video is ready for review, or when the creative team sends you a chat message.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={handleTogglePush}
                disabled={loadingPush}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs',
                  pushStatus.subscribed
                    ? 'bg-surface-2 hover:bg-danger-soft hover:text-danger-ink border border-line'
                    : 'bg-primary hover:bg-primary-hover text-white shadow-md'
                )}
              >
                {pushStatus.subscribed ? 'Disable Notifications' : 'Enable Background Alerts'}
              </button>

              {pushStatus.subscribed && (
                <button
                  onClick={handleSendTestPush}
                  disabled={loadingPush}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-line bg-surface hover:bg-surface-2 text-xs font-semibold text-ink transition-colors"
                >
                  <Send size={14} /> Send Test Alert
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-App Activity & Notification Panel */}
      <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </>
  );
}
