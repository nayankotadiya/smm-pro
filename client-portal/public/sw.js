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

  // Base options supported by all platforms including iOS Safari 16.4+
  const baseOptions = {
    body: d.body || 'New update waiting for your review.',
    icon: '/brand/bulletproof-shield.png',
    badge: '/brand/bulletproof-shield.png',
    tag: d.tag || ('portal-' + Date.now()),
    data: { url },
  };

  // Extended options for desktop and Android Chrome
  const extendedOptions = {
    ...baseOptions,
    renotify: true,
    silent: false,
    vibrate: [300, 100, 400, 100, 300],
    timestamp: Date.now(),
    actions: [
      { action: 'open', title: 'Open Portal' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(title, extendedOptions).catch(() => {
      // Fallback: strip vibrate, renotify, and actions for iOS Safari/WebKit
      return self.registration.showNotification(title, baseOptions).catch((err) => {
        console.warn('[SW Push Display Fallback Error]', err);
      });
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
