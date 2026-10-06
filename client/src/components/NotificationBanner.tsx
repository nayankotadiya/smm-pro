import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, Smartphone, Laptop, Send } from 'lucide-react';
import { getDeviceNotificationState, requestAndEnableDeviceNotifications, showDeviceNotification } from '@/lib/notifications';
import { toast } from '@/store/ui';

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
            <span className="font-bold">ફોનમાં નોટિફિકેશન બ્લોક છે: </span>
            <span>બ્રાઉઝરમાં ઉપર URL પાસે લોક/ટ્યુન આઈકન ➔ Permissions ➔ Notifications ➔ <b>Allow</b> કરો જેથી ફોનની પેનલમાં નોટિફિકેશન આવે.</span>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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

/** Quick test notification button for settings & notification page */
export function TestNotificationButton() {
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      if (getDeviceNotificationState() !== 'granted') {
        const res = await requestAndEnableDeviceNotifications();
        if (!res.granted) {
          toast.error('Please allow notifications in browser permissions.');
          setTesting(false);
          return;
        }
      }
      await showDeviceNotification({
        title: '🔔 SMM PRO Alert',
        message: 'Device notification panel test successful! Works on Mobile, PC & Laptop.',
        link: '/notifications',
        sound: true,
        vibrate: true,
      });
      toast.success('Test notification sent to your device notification panel!');
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
      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-surface-3 transition-colors active:scale-95"
    >
      <Send size={13} className="text-primary" />
      {testing ? 'Sending…' : 'Test Device Alert'}
    </button>
  );
}
