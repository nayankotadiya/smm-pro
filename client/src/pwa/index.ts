import { get, post } from '@/lib/api';

/** Service worker: app shell + push notification listener. Registered across all devices and origins. */
export function registerSW() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const doRegister = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] ServiceWorker registered with scope:', reg.scope);
      })
      .catch((e) => console.warn('[SW] Registration failed', e));
  };
  if (document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister);
  }
}

let deferred: any = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((l) => l()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
export const onInstallChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const canInstall = () => !!deferred;
export async function promptInstall() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; listeners.forEach((l) => l()); return r.outcome === 'accepted'; }

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export type PushState = 'unsupported' | 'ios-needs-install' | 'server-off' | 'denied' | 'off' | 'on';
/** Reports what this browser can actually do. We never claim push works where the platform doesn't support it. */
export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'ios-needs-install'; // iOS only allows web push from the installed Home Screen app (16.4+)
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const cfg = await get('/push/config').catch(() => ({ enabled: false }));
  if (!cfg.enabled) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
const b64 = (s: string) => { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
function device() { const ua = navigator.userAgent; const platform = /android/i.test(ua) ? 'Android' : isIOS() ? 'iOS' : /mac/i.test(ua) ? 'macOS' : /win/i.test(ua) ? 'Windows' : 'Other'; const browser = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Browser'; return { platform, browser, deviceType: /mobi|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop' }; }

export async function enablePush(forceFresh = false): Promise<PushState> {
  const cfg = await get<{ enabled: boolean; publicKey?: string }>('/push/config').catch(() => ({ enabled: false, publicKey: '' }));
  if (!cfg.enabled || !cfg.publicKey) return 'server-off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (sub && forceFresh) {
    try {
      await sub.unsubscribe();
      sub = null;
    } catch (e) {
      console.warn('Unsubscribe before refresh failed', e);
    }
  }

  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64(cfg.publicKey),
      });
    } catch (subErr) {
      console.warn('[pwa] Subscribe attempt threw, retrying fresh subscription:', subErr);
      const stale = await reg.pushManager.getSubscription();
      if (stale) await stale.unsubscribe().catch(() => undefined);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64(cfg.publicKey),
      });
    }
  }

  const j = sub.toJSON();
  await post('/push/subscribe', { endpoint: j.endpoint, keys: j.keys, ...device() });
  return 'on';
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
  if (sub) { await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined); await sub.unsubscribe(); }
}
