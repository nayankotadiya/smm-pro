/* SMM PRO service worker
 * - App shell: precached + stale-while-revalidate for static assets
 * - API, sockets, media and the public approval API are NEVER cached (private data stays off disk)
 * - Web Push: shows notifications and deep-links into the app on click
 */
const VERSION = 'smmpro-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg'];

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
  if (/\.(js|css|woff2?|png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'SMM PRO', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SMM PRO', { body: d.body || '', tag: d.tag, data: { url: d.url || '/' }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'navigate', url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('message', (e) => { if (e.data === 'logout') caches.delete(VERSION); });
