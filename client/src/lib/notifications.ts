import { enablePush } from '@/pwa';

/**
 * Audio chime using Web Audio API so it requires zero external files,
 * zero network delay, and is 100% reliable across browsers.
 */
let audioCtx: AudioContext | null = null;

export function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => undefined);
    }
    const ctx = audioCtx;
    const now = ctx.currentTime;

    // Dual-tone chime: D5 (587.33Hz) then A5 (880Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.15);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch (e) {
    // Audio autoplay restrictions or errors silently ignored
  }
}

export function vibrateDevice(pattern: number[] = [180, 80, 180]) {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration not supported or allowed
  }
}

export interface DeviceNotificationOptions {
  title: string;
  message?: string;
  link?: string;
  tag?: string;
  category?: string;
  sound?: boolean;
  vibrate?: boolean;
}

/**
 * Displays a system-level notification on the device's notification panel
 * (Windows Action Center, macOS Notification Center, Android Notification Shade).
 */
export async function showDeviceNotification(opts: DeviceNotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  if (opts.sound !== false) {
    playNotificationChime();
  }
  if (opts.vibrate !== false) {
    vibrateDevice([180, 90, 180]);
  }

  const title = opts.title || 'SMM PRO';
  const body = opts.message || 'New update in SMM PRO';
  const tag = opts.tag || `smm-${Date.now()}`;
  const icon = '/icons/icon-192.png';
  const badge = '/icons/icon-192.png';
  const url = opts.link || '/';

  // 1. First try ServiceWorker showNotification (essential for Android and best for OS panels)
  if ('serviceWorker' in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js').catch(() => null as any);
      }
      if (!reg?.active) {
        reg = await navigator.serviceWorker.ready.catch(() => reg);
      }
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag,
          renotify: true,
          data: { url },
          vibrate: [200, 100, 200],
        } as any);
        return true;
      }
    } catch (e) {
      console.warn('[notifications] SW showNotification failed', e);
    }
  }

  // 2. Fallback to standard Notification constructor (Desktop only; Chrome on Android throws Illegal constructor)
  if (!/android/i.test(navigator.userAgent)) {
    try {
      const n = new Notification(title, {
        body,
        icon,
        badge,
        tag,
        data: { url },
      } as any);

      n.onclick = () => {
        window.focus();
        if (opts.link && window.location.pathname !== opts.link) {
          window.location.href = opts.link;
        }
        n.close();
      };
      return true;
    } catch (e) {
      console.warn('[notifications] Desktop Notification constructor failed', e);
      return false;
    }
  }
  return false;
}

/**
 * Checks current notification permission state:
 * 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getDeviceNotificationState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Requests notification permission from user and automatically enables Web Push
 */
export async function requestAndEnableDeviceNotifications(): Promise<{
  granted: boolean;
  pushState: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, pushState: 'unsupported' };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { granted: false, pushState: perm === 'denied' ? 'denied' : 'off' };
    }

    // Try registering push subscription
    const pState = await enablePush().catch(() => 'off');

    // Fire welcome notification on the OS panel
    await showDeviceNotification({
      title: '🎉 Notifications Active!',
      message: 'You will receive alerts on your Mobile, PC & Laptop notification panel.',
      link: '/notifications',
      sound: true,
      vibrate: true,
    });

    return { granted: true, pushState: pState };
  } catch (e) {
    console.error('[notifications] Request permission failed', e);
    return { granted: false, pushState: 'error' };
  }
}
