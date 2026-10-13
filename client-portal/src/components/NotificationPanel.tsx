import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  CheckCheck,
  X,
  MessageSquare,
  CheckSquare,
  Sparkles,
  FileText,
  Calendar,
  Send,
  ExternalLink,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Share2,
  PlusSquare,
  Lock,
  KeyRound
} from 'lucide-react';
import { useNotifications, NotificationItem } from '@/store/notifications';
import { useAuth } from '@/store/auth';
import { getClientPushState, enableClientPush, disableClientPush, sendTestClientPush } from '@/lib/push';
import { Spinner } from '@/components/Ui';
import clsx from 'clsx';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const { user, toggle2FA } = useAuth();
  const {
    notifications,
    unreadNotifications,
    loadingNotifications,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    addToast
  } = useNotifications();

  const [pushStatus, setPushStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission;
    subscribed: boolean;
  }>({
    supported: true,
    permission: 'default',
    subscribed: false,
  });
  const [loadingPush, setLoadingPush] = useState(false);
  const [loading2FA, setLoading2FA] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  );

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      getClientPushState().then(setPushStatus);
      if (isIos && !isStandalone) {
        setShowIosGuide(true);
      }
    }
  }, [isOpen, fetchNotifications, isIos, isStandalone]);

  if (!isOpen) return null;

  const handleTogglePush = async () => {
    setLoadingPush(true);
    try {
      if (pushStatus.subscribed) {
        await disableClientPush();
        addToast({
          title: 'Background Alerts Disabled',
          message: 'You will no longer receive push alerts when the app is closed.',
          type: 'info',
        });
      } else {
        const res = await enableClientPush();
        if (res.ok) {
          addToast({
            title: 'Push Notifications Enabled!',
            message: 'You will now receive alerts in your device notification panel even when app is closed.',
            type: 'success',
          });
        } else {
          addToast({
            title: 'Action Needed',
            message: res.reason || 'Could not enable push.',
            type: 'warning',
          });
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
        title: res.ok ? '⚡ Test Alert Dispatched' : 'Notification Notice',
        message: res.ok
          ? 'Lock your screen or close this tab now to see it pop up on your device!'
          : res.message,
        type: res.ok ? 'success' : 'warning',
      });
    } finally {
      setLoadingPush(false);
    }
  };

  const handleToggle2FA = async () => {
    setLoading2FA(true);
    try {
      const newState = await toggle2FA();
      addToast({
        title: newState ? '2FA Enabled!' : '2FA Disabled',
        message: newState
          ? 'Two-Factor Authentication is active. A verification code will be sent on each sign in.'
          : 'Two-Factor Authentication has been turned off.',
        type: newState ? 'success' : 'info',
      });
    } catch {
      addToast({
        title: 'Error',
        message: 'Could not update 2FA settings.',
        type: 'warning',
      });
    } finally {
      setLoading2FA(false);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      await markNotificationRead(notif._id);
    }
    onClose();
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'MESSAGE':
      case 'CHAT':
        return <MessageSquare size={16} className="text-blue-500" />;
      case 'APPROVAL':
      case 'REVIEW':
        return <CheckSquare size={16} className="text-amber-500" />;
      case 'BRIEF':
        return <FileText size={16} className="text-indigo-500" />;
      case 'CALENDAR':
        return <Calendar size={16} className="text-emerald-500" />;
      default:
        return <Sparkles size={16} className="text-primary" />;
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in">
      {/* Backdrop overlay */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-md bg-surface border-l border-line shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between bg-surface-2/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Bell size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink">Notifications & Security</h2>
                {unreadNotifications > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary text-white">
                    {unreadNotifications} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-3">Live activity & device alert settings</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadNotifications > 0 && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="text-xs text-primary hover:underline font-semibold px-2 py-1"
                title="Mark all as read"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-ink-3 hover:text-ink hover:bg-surface transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Settings & Notifications Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60">
          {/* SECTION 1: Device Push & Screen-Off Wake Configuration */}
          <div className="p-3.5 bg-canvas/40 space-y-3">
            <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className={pushStatus.subscribed ? 'text-emerald-500' : 'text-primary'} />
                  <span className="text-xs font-bold text-ink">Device Notification Panel</span>
                </div>
                <span
                  className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-md',
                    pushStatus.subscribed
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                  )}
                >
                  {pushStatus.subscribed ? 'Active in OS Tray' : 'Pending Activation'}
                </span>
              </div>

              <p className="text-[11px] text-ink-2 leading-relaxed">
                {pushStatus.subscribed
                  ? 'High-priority delivery enabled. You will receive banner popups on iOS & Android lock screens even when the screen is turned off or app is closed.'
                  : 'Enable background alerts to receive notifications on your phone lock screen & notifications tray.'}
              </p>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={handleTogglePush}
                  disabled={loadingPush}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all shadow-xs',
                    pushStatus.subscribed
                      ? 'bg-surface-2 hover:bg-danger-soft hover:text-danger-ink text-ink-2 border border-line'
                      : 'bg-primary hover:bg-primary-hover text-white'
                  )}
                >
                  {loadingPush ? (
                    <Spinner size={14} />
                  ) : pushStatus.subscribed ? (
                    'Turn Off Alerts'
                  ) : (
                    'Enable Device Alerts'
                  )}
                </button>

                {pushStatus.subscribed && (
                  <button
                    onClick={handleSendTestPush}
                    disabled={loadingPush}
                    title="Send a test notification to check lock screen"
                    className="flex items-center gap-1 py-2 px-3 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-ink transition-colors shrink-0"
                  >
                    <Send size={12} /> Send Test Alert
                  </button>
                )}
              </div>

              {/* iOS Safari Home Screen Installation Banner */}
              {isIos && !isStandalone && (
                <div className="mt-3 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-[11px] space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                    <Share2 size={13} />
                    <span>How to get iPhone Lock Screen Notifications:</span>
                  </div>
                  <p className="text-blue-800 dark:text-blue-300 leading-relaxed text-[10.5px]">
                    Apple iOS requires web apps to be on your Home Screen to wake your screen with notifications:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-900 dark:text-blue-200 font-medium text-[10.5px] pt-0.5">
                    <li>Tap the <strong>Share button (⎋)</strong> at the bottom of Safari</li>
                    <li>Scroll down and tap <strong>Add to Home Screen (⊞)</strong></li>
                    <li>Open Bulletproof from your Home Screen & tap <strong>Enable Device Alerts</strong></li>
                  </ol>
                </div>
              )}
            </div>

            {/* SECTION 2: Two-Factor Authentication (2FA) Security Card */}
            <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className={user?.twoFactorEnabled ? 'text-emerald-500' : 'text-ink-3'} />
                  <span className="text-xs font-bold text-ink">Two-Factor Authentication (2FA)</span>
                </div>
                <span
                  className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-md',
                    user?.twoFactorEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-surface-2 text-ink-3 border border-line'
                  )}
                >
                  {user?.twoFactorEnabled ? 'Protected' : 'Off'}
                </span>
              </div>

              <p className="text-[11px] text-ink-2 leading-relaxed">
                {user?.twoFactorEnabled
                  ? '2FA is active. A secure 6-digit verification code will be sent to your email on each login.'
                  : 'Add an extra layer of protection to your client workspace by requiring email verification on sign in.'}
              </p>

              <button
                onClick={handleToggle2FA}
                disabled={loading2FA}
                className={clsx(
                  'w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border',
                  user?.twoFactorEnabled
                    ? 'border-line bg-surface-2 hover:bg-danger-soft hover:text-danger-ink text-ink-2'
                    : 'border-primary/30 bg-primary-soft hover:bg-primary text-primary hover:text-white'
                )}
              >
                {loading2FA ? (
                  <Spinner size={14} />
                ) : user?.twoFactorEnabled ? (
                  'Disable 2FA Protection'
                ) : (
                  'Enable 2FA Protection'
                )}
              </button>
            </div>
          </div>

          {/* SECTION 3: Activity & Notifications List */}
          <div className="p-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3 px-1">
              Recent Activity
            </span>
          </div>

          <div>
            {loadingNotifications && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40">
                <Spinner size={22} />
                <span className="text-xs text-ink-3 mt-2">Checking notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-ink-3 mb-2.5">
                  <CheckCircle2 size={22} className="text-emerald-500" />
                </div>
                <p className="text-xs font-bold text-ink">You're all caught up!</p>
                <p className="text-[11px] text-ink-3 max-w-xs mt-0.5">
                  When new scripts, video edits, or messages arrive, they will appear here and in your phone tray.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  onClick={() => handleNotificationClick(notif)}
                  className={clsx(
                    'px-4 py-3.5 flex items-start gap-3 cursor-pointer transition-colors relative hover:bg-surface-2/70',
                    !notif.read ? 'bg-primary-soft/20' : 'bg-transparent'
                  )}
                >
                  {/* Type Icon Badge */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-line shadow-xs mt-0.5">
                    {getNotificationIcon(notif.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className={clsx('text-xs font-semibold truncate', !notif.read ? 'text-ink font-bold' : 'text-ink-2')}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-ink-3 shrink-0">
                        {formatTimestamp(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-3 line-clamp-2 mt-0.5 leading-relaxed">
                      {notif.message}
                    </p>
                    {notif.actionUrl && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary mt-1.5 hover:underline">
                        <span>Open item</span>
                        <ExternalLink size={10} />
                      </div>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!notif.read && (
                    <span className="absolute right-3.5 top-4 h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
