/* Bulletproof Client Portal Service Worker
 * - Handles Web Push Notifications even when app is closed / in background
 * - Deep-links to Approvals or Chat upon clicking notifications
 */
const VERSION = 'bulletproof-portal-v1';
const SHELL = ['/', '/brand/bulletproof-shield.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
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
  const url = d.url || '/';
  const vibratePattern = [300, 100, 400, 100, 300];

  const options = {
    body: d.body || 'New update waiting for your review.',
    icon: '/brand/bulletproof-shield.png',
    badge: '/brand/bulletproof-shield.png',
    tag: d.tag || ('portal-' + Date.now()),
    renotify: true,
    silent: false,
    requireInteraction: true,
    vibrate: vibratePattern,
    timestamp: Date.now(),
    data: { url },
    actions: [
      { action: 'open', title: 'Open Portal' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(title, options).catch(() => {
      // Fallback for browsers that do not support actions
      const { actions, ...fallbackOpts } = options;
      return self.registration.showNotification(title, fallbackOpts);
    })
  );
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
  if (e.data === 'logout') {
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
