/**
 * service-worker.js - Offline support & caching
 * Caches static assets; network-first for Odoo API calls
 */

const CACHE_NAME = 'odoo-wrapper-v1';
const STATIC_ASSETS = [
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/push.js',
  '/manifest.json',
];

// ── Install: cache static assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: strategy by request type ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, browser-internal
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Odoo API calls → Network first, no cache
  if (
    url.pathname.startsWith('/web/dataset') ||
    url.pathname.startsWith('/web/session') ||
    url.pathname.startsWith('/jsonrpc') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetch(request).catch(() => {
      return new Response(
        JSON.stringify({ error: { message: 'Offline' } }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }));
    return;
  }

  // Static app assets → Cache first
  if (STATIC_ASSETS.some((a) => url.pathname.endsWith(a.replace('/', '')))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else (Odoo web pages, assets) → Network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful Odoo page responses
        if (response.ok && url.pathname.startsWith('/odoo')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
