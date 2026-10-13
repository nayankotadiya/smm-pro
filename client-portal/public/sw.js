/* Bulletproof Client Portal Service Worker v2
 * - High-priority background Web Push notifications for iOS (iPhone PWA 16.4+) & Android
 * - Guaranteed wake-up when app is closed / screen is off
 * - Universal fallback for WebKit and Blink engines
 */
const VERSION = 'bulletproof-portal-v2';
const SHELL = ['/', '/brand/bulletproof-shield.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => null))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      ),
    ])
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Bulletproof Portal', body: e.data ? e.data.text() : '' };
  }

  const title = d.title || 'Bulletproof Client Portal';
  const body = d.body || 'New update waiting for your review.';
  const url = d.url || (d.data && d.data.url) || '/';
  const tag = d.tag || ('bp-alert-' + Date.now());

  // Detect iOS WebKit PWA
  const isIOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent) ||
    (self.navigator.platform === 'MacIntel' && self.navigator.maxTouchPoints > 1);

  // iOS Safari WebKit supports only standard notification properties
  // Passing unsupported options (like 'actions' or 'vibrate') can throw or silently drop notifications on iOS
  const notificationPromise = (async () => {
    if (isIOS) {
      try {
        return await self.registration.showNotification(title, {
          body,
          icon: '/brand/bulletproof-shield.png',
          badge: '/brand/bulletproof-shield.png',
          tag,
          data: { url },
        });
      } catch (err) {
        console.warn('[SW iOS push fallback]', err);
        return await self.registration.showNotification(title, {
          body,
          data: { url },
        });
      }
    }

    // Android & Desktop Chrome / Edge / Firefox
    try {
      return await self.registration.showNotification(title, {
        body,
        icon: '/brand/bulletproof-shield.png',
        badge: '/brand/bulletproof-shield.png',
        tag,
        renotify: true,
        silent: false,
        vibrate: [300, 100, 400, 100, 300],
        timestamp: Date.now(),
        data: { url },
        actions: [
          { action: 'open', title: 'Open Portal' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      });
    } catch {
      try {
        return await self.registration.showNotification(title, {
          body,
          icon: '/brand/bulletproof-shield.png',
          badge: '/brand/bulletproof-shield.png',
          tag,
          data: { url },
        });
      } catch {
        return await self.registration.showNotification(title, {
          body,
          data: { url },
        });
      }
    }
  })();

  e.waitUntil(notificationPromise);
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'navigate', url });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  } else if (e.data === 'logout') {
    caches.delete(VERSION);
  } else if (e.data?.type === 'SHOW_NOTIFICATION') {
    const { title, options } = e.data;
    self.registration.showNotification(title || 'Bulletproof Portal', {
      icon: '/brand/bulletproof-shield.png',
      badge: '/brand/bulletproof-shield.png',
      vibrate: [300, 100, 400, 100, 300],
      renotify: true,
      silent: false,
      timestamp: Date.now(),
      ...options,
    });
  }
});
