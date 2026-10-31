import { DB } from './db.js';

export const fmt = b => b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB';
let deferred = null, swReg = null;

export async function requestPersist() {
  if (!(navigator.storage && navigator.storage.persist)) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) { return false; }
}

// Keeps one usage sample per day (max ~2 years) so growth can be measured rather than guessed.
export async function snapshotUsage() {
  if (!(navigator.storage && navigator.storage.estimate)) return;
  const e = await navigator.storage.estimate();
  const hist = (await DB.getMeta('usageHistory')) || [];
  const d = new Date().toISOString().slice(0, 10);
  const n = (await DB.totals()).total;
  if (hist.length && hist[hist.length - 1].d === d) hist[hist.length - 1] = { d, u: e.usage || 0, n };
  else hist.push({ d, u: e.usage || 0, n });
  await DB.setMeta('usageHistory', hist.slice(-800));
}

export async function storageInfo() {
  const o = { supported: !!(navigator.storage && navigator.storage.estimate), persisted: false, usage: 0, quota: 0, pct: 0, entries: 0, years: null, basis: '', perYear: 0, warn: false, enough: true };
  o.entries = (await DB.totals()).total;
  if (!o.supported) return o;
  const e = await navigator.storage.estimate();
  o.usage = e.usage || 0; o.quota = e.quota || 0;
  o.pct = o.quota ? o.usage / o.quota * 100 : 0;
  o.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const hist = (await DB.getMeta('usageHistory')) || [];
  let perDay = null;
  if (hist.length >= 2) {
    const a = hist[0], b = hist[hist.length - 1], days = (new Date(b.d) - new Date(a.d)) / 864e5;
    if (days >= 7 && b.u > a.u) { perDay = (b.u - a.u) / days; o.basis = 'measured growth over ' + Math.round(days) + ' days'; }
  }
  if (perDay == null) {
    const avg = o.entries ? Math.max(o.usage / o.entries, 1024) : 2048;
    perDay = avg * 1500 / 365; o.basis = 'assumed 1,500 records/year at the current average record size';
  }
  o.perYear = perDay * 365;
  o.years = Math.min(99, Math.max(0, (o.quota - o.usage) / o.perYear));
  o.enough = o.years >= 3;
  o.warn = o.pct >= 80;
  return o;
}

export async function flushNow() {
  if (!('serviceWorker' in navigator)) return;
  const reg = swReg || await navigator.serviceWorker.ready;
  const sw = navigator.serviceWorker.controller || reg.active;
  if (sw) sw.postMessage({ type: 'FLUSH_OUTBOX' });
}

async function registerSync() {
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    if (reg.sync) await reg.sync.register('wkh-outbox');
  } catch (_) { /* Background Sync unsupported: the online-event fallback calls flushNow() */ }
}

export function initPWA({ onToast, onOutbox, onNet }) {
  const banner = document.getElementById('banner');
  const btn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; onToast('App installed'); });

  requestPersist();
  DB.hooks.outbox = () => { registerSync(); if (navigator.onLine) flushNow(); onNet(); };
  window.addEventListener('online', () => { onNet(); registerSync(); flushNow(); });
  window.addEventListener('offline', onNet);

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'OUTBOX') onOutbox(e.data); });
  const showUpdate = reg => {
    banner.hidden = false;
    banner.innerHTML = '<span>A new version of WorkflowKaizen Hub is ready.</span><button class="btn small" id="reloadBtn">Update now</button>';
    document.getElementById('reloadBtn').onclick = () => reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); });
    });
    setInterval(() => reg.update().catch(() => {}), 3600000);
    registerSync(); if (navigator.onLine) flushNow();
  }).catch(err => console.warn('SW registration failed', err));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
