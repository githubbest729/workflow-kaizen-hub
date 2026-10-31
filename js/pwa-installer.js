import { DB } from './db.js';

let deferred = null;
const fmt = b => b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(1) + ' KB';

export async function storageInfo() {
  const out = { supported: !!(navigator.storage && navigator.storage.estimate), persisted: false, usage: 0, quota: 0, pct: 0, entries: 0, years: null, fmt };
  out.entries = (await DB.totals()).total;
  if (out.supported) {
    const e = await navigator.storage.estimate();
    out.usage = e.usage || 0; out.quota = e.quota || 0;
    out.pct = out.quota ? (out.usage / out.quota) * 100 : 0;
    if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    // Capacity model: average record size x an assumed 1,500 new records per year.
    const avg = out.entries ? Math.max(out.usage / out.entries, 512) : 2048;
    out.years = Math.min(99, (out.quota - out.usage) / (avg * 1500));
  }
  return out;
}

export async function requestPersist() {
  if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
  return false;
}

export function initPWA({ onToast }) {
  const banner = document.getElementById('banner');
  const btn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null; btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { btn.hidden = true; onToast('App installed'); });

  requestPersist();

  if (!('serviceWorker' in navigator)) return;
  const showUpdate = reg => {
    banner.hidden = false;
    banner.innerHTML = '<span>A new version of WorkflowKaizen Hub is ready.</span><button class="btn small" id="reloadBtn">Update now</button>';
    document.getElementById('reloadBtn').onclick = () => reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(err => console.warn('SW registration failed', err));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
