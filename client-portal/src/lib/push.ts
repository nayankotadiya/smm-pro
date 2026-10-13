import { api } from './api';

export type PushPermissionStatus = 'unsupported' | 'default' | 'denied' | 'granted';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function registerClientSW() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const doRegister = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[Portal SW] Registered with scope:', reg.scope);
        // Prompt immediate SW update if a new worker is waiting
        if (reg.waiting) {
          reg.waiting.postMessage('skipWaiting');
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[Portal SW] New version installed, activating...');
              newWorker.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[Portal SW] Registration error:', err);
      });
  };

  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister);
  }
}

const b64ToUint8 = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export function getDeviceInfo() {
  const ua = navigator.userAgent;
  const platform = /android/i.test(ua)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(ua)
    ? 'iOS'
    : /mac/i.test(ua)
    ? 'macOS'
    : /win/i.test(ua)
    ? 'Windows'
    : 'Other';
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /firefox/i.test(ua)
    ? 'Firefox'
    : /chrome|crios/i.test(ua)
    ? 'Chrome'
    : /safari/i.test(ua)
    ? 'Safari'
    : 'Browser';
  const deviceType = /mobi|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop';
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  return { platform, browser, deviceType, isPWA };
}

export async function getClientPushState(): Promise<{
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}> {
  if (!isPushSupported()) {
    return { supported: false, permission: 'denied', subscribed: false };
  }

  const permission = Notification.permission;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return {
      supported: true,
      permission,
      subscribed: !!sub && permission === 'granted',
    };
  } catch {
    return { supported: true, permission, subscribed: false };
  }
}

/** Automatically syncs and activates push subscription if browser permission is already granted */
export async function syncClientPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    const cfgRes = await api.get('/push/config').catch(() => null);
    const publicKey = cfgRes?.data?.publicKey;
    if (!publicKey) return false;

    const expectedAppServerKey = b64ToUint8(publicKey);

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const rawSubKey = sub.options.applicationServerKey;
      let keyMatches = false;
      if (rawSubKey) {
        const subKeyBytes = new Uint8Array(rawSubKey);
        if (subKeyBytes.length === expectedAppServerKey.length) {
          keyMatches = subKeyBytes.every((b, i) => b === expectedAppServerKey[i]);
        }
      }
      if (!keyMatches) {
        console.log('[syncClientPush] VAPID Key changed, renewing push subscription...');
        await sub.unsubscribe().catch(() => null);
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedAppServerKey,
      });
    }

    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        ...getDeviceInfo(),
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[syncClientPush failed]', err);
    return false;
  }
}

export async function enableClientPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Push notifications are not supported in this browser. On iPhone, make sure to add this app to your Home Screen first.' };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: perm === 'denied' ? 'Notifications are blocked in browser settings. Please allow notifications.' : 'Notification prompt was dismissed.' };
    }

    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    // Fetch VAPID key
    const cfgRes = await api.get('/push/config').catch(() => null);
    const publicKey = cfgRes?.data?.publicKey;

    if (!publicKey) {
      return { ok: false, reason: 'Push server configuration unavailable.' };
    }

    const expectedAppServerKey = b64ToUint8(publicKey);

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const rawSubKey = sub.options.applicationServerKey;
      let keyMatches = false;
      if (rawSubKey) {
        const subKeyBytes = new Uint8Array(rawSubKey);
        if (subKeyBytes.length === expectedAppServerKey.length) {
          keyMatches = subKeyBytes.every((b, i) => b === expectedAppServerKey[i]);
        }
      }
      if (!keyMatches) {
        console.log('[enableClientPush] ApplicationServerKey mismatch, renewing...');
        await sub.unsubscribe().catch(() => null);
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedAppServerKey,
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'Failed to generate browser push keys.' };
    }

    await api.post('/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      ...getDeviceInfo(),
    });

    return { ok: true };
  } catch (err: any) {
    console.error('[enableClientPush error]', err);
    return { ok: false, reason: err.message || 'Subscription failed.' };
  }
}

export async function disableClientPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => null);
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[disableClientPush error]', err);
  }
}

export async function sendTestClientPush(): Promise<{ ok: boolean; message: string; count?: number }> {
  try {
    const res = await api.post('/push/test');
    return { ok: res.data.ok, message: res.data.message || 'Test sent!', count: res.data.sentCount };
  } catch (err: any) {
    return { ok: false, message: err.response?.data?.message || err.message || 'Test failed.' };
  }
}

const recentLocalNotifications = new Map<string, number>();

/** Show local desktop notification if app is open but tab is in background / blurred */
export async function showLocalNotification(title: string, options: NotificationOptions = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // If user is actively focused on the app window, let in-app toast handle it; avoid annoying duplicate OS popup
  if (document.visibilityState === 'visible' && document.hasFocus()) return;

  const dedupeKey = (options.tag as string) || `${title}:${options.body || ''}`;
  const now = Date.now();
  const lastShown = recentLocalNotifications.get(dedupeKey);
  if (lastShown && now - lastShown < 4500) {
    return; // Drop duplicate!
  }
  recentLocalNotifications.set(dedupeKey, now);
  if (recentLocalNotifications.size > 80) {
    for (const [k, time] of recentLocalNotifications) {
      if (now - time > 10000) recentLocalNotifications.delete(k);
    }
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) {
      reg.showNotification(title, {
        icon: '/brand/bulletproof-shield.png',
        badge: '/brand/bulletproof-shield.png',
        ...options,
      } as any);
      return;
    }
    new Notification(title, {
      icon: '/brand/bulletproof-shield.png',
      ...options,
    });
  } catch (e) {
    console.warn('[showLocalNotification]', e);
  }
}
