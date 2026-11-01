'use strict';
const VERSION = 'wkh-v2.5.0';
const STATIC = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;
const DB_NAME = 'workflow-kaizen-hub';
const SYNC_TAG = 'wkh-outbox';
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
  const t = e.data && e.data.type;
  if (t === 'SKIP_WAITING') self.skipWaiting();
  if (t === 'FLUSH_OUTBOX') e.waitUntil(flush().catch(() => {}));
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

/* ---------------- Background Sync: IndexedDB outbox flush ---------------- */
const idb = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('outbox')) { db.close(); resolve(null); } else resolve(db);
    };
  });
}

async function report(sent, left, reason) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'OUTBOX', sent, left, reason: reason || '' }));
}

async function mark(db, item, patch) {
  const t = db.transaction('outbox', 'readwrite');
  t.objectStore('outbox').put(Object.assign({}, item, patch, { attempts: (item.attempts || 0) + 1 }));
  await txDone(t);
}

async function flushOutbox() {
  const db = await openDb();
  if (!db) return report(0, 0, 'no-db');
  try {
    const ep = await idb(db.transaction('meta').objectStore('meta').get('syncEndpoint'));
    const all = await idb(db.transaction('outbox').objectStore('outbox').getAll());
    const items = all.filter(i => i.status === 'pending').sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    if (!items.length) return report(0, 0);
    if (!ep || !ep.value) return report(0, items.length, 'no-endpoint');
    let sent = 0;
    for (const item of items) {
      let res;
      try {
        res = await fetch(ep.value, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': item.id },
          body: JSON.stringify({ id: item.id, seq: item.seq, type: item.type, ts: item.ts, payload: item.payload })
        });
      } catch (err) {
        await mark(db, item, { lastError: String(err) });
        await report(sent, items.length - sent, 'offline');
        throw err; // lets the browser reschedule the sync
      }
      if (res.ok) {
        const t = db.transaction('outbox', 'readwrite');
        t.objectStore('outbox').delete(item.id);
        await txDone(t);
        sent++;
      } else if (res.status >= 500 || res.status === 429) {
        await mark(db, item, { lastError: 'HTTP ' + res.status });
        await report(sent, items.length - sent, 'http-' + res.status);
        throw new Error('HTTP ' + res.status);
      } else {
        await mark(db, item, { status: 'rejected', lastError: 'HTTP ' + res.status });
      }
    }
    const left = (await idb(db.transaction('outbox').objectStore('outbox').getAll())).filter(i => i.status === 'pending').length;
    await report(sent, left);
  } finally {
    db.close();
  }
}

let flushing = null;
function flush() {
  if (!flushing) flushing = flushOutbox().finally(() => { flushing = null; });
  return flushing;
}

self.addEventListener('sync', e => {
  if (e.tag === SYNC_TAG) e.waitUntil(flush());
});
