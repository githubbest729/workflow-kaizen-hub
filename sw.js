'use strict';
const VERSION = 'wkh-v1.0.0';
const STATIC = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;
const ASSETS = ['./', 'index.html', 'offline.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
  'css/tokens.css', 'css/layout.css', 'css/components.css',
  'js/app.js', 'js/db.js', 'js/pwa-installer.js', 'js/seed-data.js',
  'icons/icon-72.png', 'icons/icon-96.png', 'icons/icon-128.png', 'icons/icon-144.png', 'icons/icon-152.png',
  'icons/icon-192.png', 'icons/icon-384.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(RUNTIME);
        c.put(req, net.clone());
        return net;
      } catch (_) {
        return (await caches.match(req)) || (await caches.match('index.html')) || (await caches.match('offline.html'));
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net.ok) { const c = await caches.open(RUNTIME); c.put(req, net.clone()); }
      return net;
    } catch (_) {
      return (await caches.match('offline.html')) || Response.error();
    }
  })());
});

// Background sync placeholder: the app is local-first, so there is nothing to push.
// Hook a team file-share or historian endpoint here if one is introduced later.
self.addEventListener('sync', e => {
  if (e.tag === 'wkh-sync') e.waitUntil(Promise.resolve());
});
