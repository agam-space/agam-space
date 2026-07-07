// Minimal service worker: caches only immutable static assets, never HTML.
// Cache name is version-stamped at build time (see scripts/inject-sw-version.js)
// so every deploy gets a fresh cache and old ones are purged on activate.
const CACHE_NAME = 'agam-static-__SW_VERSION__';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key.startsWith('agam-static-'))
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isImmutableStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept HTML/navigation requests, so we always serve the freshest
  // markup (which references correctly-hashed, SRI-verified assets).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then(res => res || Response.error()))
    );
    return;
  }

  if (isImmutableStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
