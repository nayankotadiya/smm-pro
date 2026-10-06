/* SMM PRO service worker
 * - App shell: precached + stale-while-revalidate for static assets
 * - API, sockets, media and the public approval API are NEVER cached (private data stays off disk)
 * - Web Push: shows notifications and deep-links into the app on click
 */
const VERSION = 'smmpro-v3';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg', '/sounds/notification.wav'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return; // network only, never cached
  if (req.mode === 'navigate') {
    // offline app shell: serve cached index when the network is unavailable
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return r; }).catch(() => caches.match('/')));
    return;
  }
  if (/\.(js|css|woff2?|png|svg|webmanifest|wav|mp3)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'SMM PRO', body: e.data ? e.data.text() : '' };
  }
  const title = d.title || 'SMM PRO';
  const url = d.url || '/';
  const vibratePattern = [300, 100, 400, 100, 300];

  const fullOptions = {
    body: d.body || 'You have a new update in SMM PRO',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: d.tag || ('smm-' + Date.now()),
    renotify: true,
    silent: false,
    requireInteraction: true,
    vibrate: vibratePattern,
    sound: '/sounds/notification.wav',
    timestamp: Date.now(),
    data: { url },
  };

  e.waitUntil(
    self.registration.showNotification(title, {
      ...fullOptions,
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    }).catch(() => {
      // Fallback for mobile browsers that do not support action buttons (e.g. mobile Chrome/Safari PWA)
      return self.registration.showNotification(title, fullOptions);
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
    self.registration.showNotification(title || 'SMM PRO', {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [300, 100, 400, 100, 300],
      renotify: true,
      silent: false,
      requireInteraction: true,
      sound: '/sounds/notification.wav',
      timestamp: Date.now(),
      ...options,
    });
  }
});
