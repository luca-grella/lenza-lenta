// Lenza Lenta 2 — service worker: offline precache, cache-first, update on reload.
// Bump CACHE on every release (and run `node tools/sw-assets.mjs` if files were added/removed).
const CACHE = 'lenza-lenta-v2-r5';
importScripts('./sw-assets.js'); // defines self.SW_ASSETS (generated list, the single source of truth)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // fetch with cache:'reload' so a new release never precaches stale HTTP-cached files
    await Promise.all((self.SW_ASSETS || []).map(async url => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch { /* one missing optional module must not break the install */ }
    }));
    await self.skipWaiting(); // new version takes over; the page shows "update ready" and applies it on reload
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lenza-lenta-v2') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // navigations: serve the cached shell (offline) — the query string (?debug, ?quality=) is ignored
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' }) ||
      (req.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});
