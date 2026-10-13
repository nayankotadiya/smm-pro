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

function getDeviceInfo() {
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
  return { platform, browser, deviceType };
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

export async function enableClientPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'Push notifications are not supported in this browser.' };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: perm === 'denied' ? 'Permission denied by browser.' : 'Permission dismissed.' };
    }

    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    // Fetch VAPID key
    const cfgRes = await api.get('/push/config').catch(() => null);
    const publicKey = cfgRes?.data?.publicKey;

    if (!publicKey) {
      return { ok: false, reason: 'Push server configuration unavailable.' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(publicKey),
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

export async function sendTestClientPush(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await api.post('/push/test');
    return { ok: res.data.ok, message: res.data.message || 'Test sent!' };
  } catch (err: any) {
    return { ok: false, message: err.response?.data?.message || err.message || 'Test failed.' };
  }
}

/** Show local desktop notification if app is open but tab is in background / blurred */
export async function showLocalNotification(title: string, options: NotificationOptions = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

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
