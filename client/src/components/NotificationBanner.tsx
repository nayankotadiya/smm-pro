import { useState, useEffect } from 'react';
import { Bell, X, Smartphone, Laptop, Send } from 'lucide-react';
import { getDeviceNotificationState, requestAndEnableDeviceNotifications, showDeviceNotification } from '@/lib/notifications';
import { toast } from '@/store/ui';
import { post } from '@/lib/api';
import { enablePush } from '@/pwa';

export function DeviceNotificationBanner() {
  const [state, setState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('granted');
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = getDeviceNotificationState();
    setState(s);
    if (sessionStorage.getItem('dismiss_notif_banner') === 'true') {
      setDismissed(true);
    }
  }, []);

  if (dismissed) {
    return null;
  }

  if (state === 'denied') {
    return (
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 text-xs text-amber-300 backdrop-blur-xl animate-fade-in flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bell size={18} className="shrink-0 text-amber-400" />
          <div>
            <span className="font-bold">Notifications are blocked: </span>
            <span>Click the lock icon in your browser address bar ➔ Site Settings ➔ Notifications ➔ <b>Allow</b> to receive real-time device alerts.</span>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1 hover:opacity-70 shrink-0"><X size={15} /></button>
      </div>
    );
  }

  if (state !== 'default') {
    return null;
  }

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await requestAndEnableDeviceNotifications();
      if (res.granted) {
        setState('granted');
        toast.success('Device notifications active! Alerts will appear on your notification panel.');
      } else {
        setState(getDeviceNotificationState());
        if (getDeviceNotificationState() === 'denied') {
          toast.error('Notifications were blocked. Please enable them in your browser settings.');
        }
      }
    } catch {
      toast.error('Could not enable notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('dismiss_notif_banner', 'true');
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-surface-2 to-surface-1 p-3.5 sm:p-4 shadow-lg backdrop-blur-xl animate-fade-in">
      <div className="flex flex-col sm:row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/25">
            <Bell size={20} className="animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] sm:text-[15px] font-bold text-ink">
                Enable Notifications for All Devices
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-primary-ink bg-primary-soft px-2 py-0.5 rounded-full">
                <Smartphone size={12} /> Mobile <Laptop size={12} /> PC
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] sm:text-[13px] text-ink-2">
              Receive instant alerts on your Mobile, PC & Laptop notification panel for scripts, edits, tasks, and client approvals.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-[12px] font-semibold text-ink-3 hover:text-ink transition-colors"
          >
            Later
          </button>
          <button
            disabled={loading}
            onClick={handleEnable}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-[13px] font-bold text-white shadow-md shadow-primary/30 hover:bg-primary-hover active:scale-95 transition-all"
          >
            <Bell size={14} />
            {loading ? 'Enabling…' : 'Enable Notifications'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TestNotificationButton({ className, label }: { className?: string; label?: string } = {}) {
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      if (getDeviceNotificationState() !== 'granted') {
        const res = await requestAndEnableDeviceNotifications();
        if (!res.granted) {
          toast.error('Please allow notifications in your browser permissions.');
          setTesting(false);
          return;
        }
      } else {
        // Ensure this device has its push subscription active on backend
        await enablePush().catch(() => undefined);
      }

      // 1. Trigger local OS shade alert with sound & vibration
      await showDeviceNotification({
        title: '🔔 SMM PRO Device Alert',
        message: 'Notification panel & vibration test successful!',
        link: '/notifications',
        sound: true,
        vibrate: true,
      });

      // 2. Trigger backend push test
      const r = await post<any>('/push/test').catch(() => ({ ok: false, devices: 0 }));
      if (r?.devices > 0 && r?.sentCount > 0) {
        toast.success(`✅ Test notification sent to ${r.sentCount} registered device(s). Check your notification panel.`);
      } else if (r?.devices === 0) {
        toast.info('Local test triggered. Enable device notifications in Settings to link this device.');
      } else {
        toast.success('Test notification sent successfully. Check your notification panel.');
      }
    } catch {
      toast.error('Failed to trigger test notification.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <button
      onClick={test}
      disabled={testing}
      className={`inline-flex select-none items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-[12.5px] font-bold text-primary-ink shadow-xs hover:bg-primary/20 hover:border-primary transition-all active:scale-95 ${className || ''}`}
    >
      <Send size={13} className="text-primary" />
      {testing ? 'Testing…' : label || '🔔 Test Notification (Sound & Vibrate)'}
    </button>
  );
}
