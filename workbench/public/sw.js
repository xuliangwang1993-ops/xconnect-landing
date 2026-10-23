/* X-connect Workbench service worker.
 * Static shell only. Never caches /api/, /voice, /bridge/ or any authenticated
 * response: balances, cards, conversations and billing stay network-only.
 */
const BUILD = '__BUILD__';
const CACHE = 'xcw-shell-' + BUILD;
const PRECACHE = [
  '/workbench',
  '/styles.css',
  '/app.js',
  '/project-delivery-view.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/assets/brand-x.png',
  '/assets/fonts/space-grotesk-400.woff2',
  '/assets/fonts/space-grotesk-500.woff2',
  '/assets/fonts/space-grotesk-600.woff2',
  '/assets/fonts/space-grotesk-700.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('xcw-shell-') && k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isPrivate = (url) => (
  url.pathname.startsWith('/api/') ||
  url.pathname === '/voice' ||
  url.pathname.startsWith('/bridge/') ||
  url.pathname === '/healthz'
);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/').then((r) => r || new Response('离线', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })))
    );
    return;
  }

  const isCode = /\.(js|css|webmanifest)$/.test(url.pathname) || url.pathname === '/';
  if (isCode) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
