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
  AlertCircle
} from 'lucide-react';
import { useNotifications, NotificationItem } from '@/store/notifications';
import { getClientPushState, enableClientPush, disableClientPush, sendTestClientPush } from '@/lib/push';
import { Spinner } from '@/components/Ui';
import clsx from 'clsx';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
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

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      getClientPushState().then(setPushStatus);
    }
  }, [isOpen, fetchNotifications]);

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
        title: res.ok ? 'Test Alert Dispatched' : 'Push Notification Notice',
        message: res.message,
        type: res.ok ? 'success' : 'warning',
      });
    } finally {
      setLoadingPush(false);
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
                <h2 className="text-sm font-bold text-ink">Notifications</h2>
                {unreadNotifications > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-primary text-white">
                    {unreadNotifications} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-3">Activity & updates across all devices</p>
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

        {/* Device Push Notifications Banner */}
        <div className="p-3.5 border-b border-line bg-canvas/60">
          <div className="rounded-xl border border-line bg-surface p-3 space-y-2.5 shadow-xs">
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
                {pushStatus.subscribed ? 'Active in OS tray' : 'Disabled'}
              </span>
            </div>

            <p className="text-[11px] text-ink-2 leading-relaxed">
              {pushStatus.subscribed
                ? 'Device alerts are connected! You receive push popups on iOS & Android lock screens even when the app is closed.'
                : 'Turn on background alerts to receive push notifications on your phone lock screen & notifications tray.'}
            </p>

            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={handleTogglePush}
                disabled={loadingPush}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all shadow-xs',
                  pushStatus.subscribed
                    ? 'bg-surface-2 hover:bg-danger-soft hover:text-danger-ink text-ink-2 border border-line'
                    : 'bg-primary hover:bg-primary-hover text-white'
                )}
              >
                {loadingPush ? (
                  <Spinner size={14} />
                ) : pushStatus.subscribed ? (
                  'Turn Off'
                ) : (
                  'Enable Device Alerts'
                )}
              </button>

              {pushStatus.subscribed && (
                <button
                  onClick={handleSendTestPush}
                  disabled={loadingPush}
                  className="flex items-center gap-1 py-1.5 px-2.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-semibold text-ink transition-colors"
                >
                  <Send size={12} /> Test
                </button>
              )}
            </div>

            {/* iOS Safari Tip */}
            {!pushStatus.subscribed && (
              <p className="text-[10px] text-ink-3 pt-1 border-t border-line/60">
                💡 <span className="font-semibold">iPhone tip:</span> Tap Share icon <span className="font-mono">"⎋"</span> → <span className="font-semibold">"Add to Home Screen"</span> to enable push notifications on iOS.
              </p>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60">
          {loadingNotifications && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48">
              <Spinner size={24} />
              <span className="text-xs text-ink-3 mt-2">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-3 mb-3">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-ink">You're all caught up!</p>
              <p className="text-xs text-ink-3 max-w-xs mt-1">
                No new notifications. When scripts need review or messages arrive, they will appear right here.
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
                      <span>View details</span>
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
  );
}
