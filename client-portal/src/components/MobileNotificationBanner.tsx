import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Smartphone, Share, X, Zap } from 'lucide-react';
import { getClientPushState, enableClientPush, sendTestClientPush, getDeviceInfo } from '@/lib/push';
import { useNotifications } from '@/store/notifications';
import clsx from 'clsx';

export function MobileNotificationBanner() {
  const { addToast } = useNotifications();
  const [status, setStatus] = useState<{
    supported: boolean;
    permission: NotificationPermission;
    subscribed: boolean;
  }>({ supported: true, permission: 'default', subscribed: true });
  const [device, setDevice] = useState<{ platform: string; isPWA: boolean; deviceType: string }>({
    platform: 'Other',
    isPWA: false,
    deviceType: 'desktop',
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDevice(getDeviceInfo());
    getClientPushState().then((s) => setStatus(s));
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await enableClientPush();
      if (res.ok) {
        setStatus((prev) => ({ ...prev, subscribed: true, permission: 'granted' }));
        addToast({
          title: '⚡ Background Alerts Active!',
          message: 'You will receive notifications on your lock screen even when this app is closed.',
          type: 'success',
        });
      } else {
        addToast({
          title: 'Permission Notice',
          message: res.reason || 'Could not enable push.',
          type: 'warning',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await sendTestClientPush();
      if (res.ok) {
        addToast({
          title: 'Test Push Dispatched',
          message: 'Lock your phone or switch apps now to verify background delivery!',
          type: 'success',
        });
      } else {
        addToast({
          title: 'Test Notification',
          message: res.message,
          type: 'warning',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  if (dismissed) return null;

  // iOS Safari not in PWA standalone mode
  const isIOSBrowser = device.platform === 'iOS' && !device.isPWA;

  if (isIOSBrowser && !status.subscribed) {
    return (
      <div className="mb-4 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-surface to-indigo-500/10 p-3.5 sm:p-4 text-xs shadow-xs animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-xs">
              <Share size={18} />
            </span>
            <div className="min-w-0">
              <h4 className="font-bold text-ink text-[13px]">iPhone Lock-Screen Notifications Setup</h4>
              <p className="text-ink-2 mt-0.5 leading-relaxed">
                Apple iOS requires adding this portal to your Home Screen for background alerts when the app is closed:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-ink font-semibold">
                <span className="inline-flex items-center gap-1 rounded-lg bg-surface border border-line px-2 py-1">
                  1. Tap <b>Share</b> <Share size={11} className="inline ml-0.5" /> in Safari
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-surface border border-line px-2 py-1">
                  2. Tap <b>Add to Home Screen</b>
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-surface border border-line px-2 py-1">
                  3. Open from Home Screen & tap <b>Enable Alerts</b>
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="text-ink-3 hover:text-ink p-1 rounded-lg hover:bg-surface-2 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Not subscribed on Android, iOS PWA, or Desktop
  if (!status.subscribed) {
    return (
      <div className="mb-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary-soft via-surface to-primary-soft/40 p-3.5 sm:p-4 shadow-xs animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs animate-pulse">
              <BellRing size={18} />
            </span>
            <div className="min-w-0">
              <h4 className="font-bold text-ink text-[13.5px]">Turn On Real-Time Device Alerts</h4>
              <p className="text-xs text-ink-2 mt-0.5">
                Receive notifications on your lock screen when video reviews or messages arrive, even when this app is closed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={handleEnable}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 active:scale-95"
            >
              <BellRing size={14} />
              {loading ? 'Activating...' : 'Enable Alerts'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold text-ink-3 hover:text-ink transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
