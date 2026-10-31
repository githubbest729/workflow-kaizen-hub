import { DB } from './db.js';
import { seedAll } from './seed-data.js';
import { initPWA, storageInfo, requestPersist } from './pwa-installer.js';

const STAGES = ['Plan', 'Do', 'Check', 'Act'];
const STAGE_HINT = { Plan: 'Identify bottleneck / waste', Do: 'Implement countermeasure', Check: 'Measure SCADA metric', Act: 'Standardise & update SOP' };
const PRIOS = ['Critical', 'High', 'Medium', 'Low'];
const WASTES = ['Defects', 'Waiting', 'Motion', 'Overprocessing'];
const st = { sops: [], kaizens: [], runs: [], q: '', prio: 'all' };
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view'), modal = $('#modal');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + '-' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
const fdt = iso => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

async function load() {
  [st.sops, st.kaizens, st.runs] = await Promise.all([DB.all('sops'), DB.all('kaizens'), DB.all('runs')]);
  st.runs.sort((a, b) => b.ts.localeCompare(a.ts));
}

async function ensureSeed() {
  if (await DB.getMeta('seeded')) return;
  if ((await DB.totals()).total === 0) {
    const s = seedAll();
    await DB.putMany('sops', s.sops); await DB.putMany('kaizens', s.kaizens); await DB.putMany('runs', s.runs);
  }
  await DB.setMeta('seeded', true);
}

/* ---------- derived metrics ---------- */
function metrics() {
  const scored = st.runs.filter(r => r.total - r.na > 0);
  const adherence = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : null;
  const active = st.kaizens.filter(k => k.stage !== 'Act').length;
  const proven = st.kaizens.filter(k => k.stage === 'Check' || k.stage === 'Act');
  const mins = proven.reduce((a, k) => a + (+k.minutesSaved || 0), 0);
  const withInc = proven.filter(k => +k.incidentReduction > 0);
  const inc = withInc.length ? Math.round(withInc.reduce((a, k) => a + +k.incidentReduction, 0) / withInc.length) : 0;
  return { adherence, active, mins, inc };
}
const ring = p => `<div class="ring" style="--p:${p ?? 0};--c:${p == null ? 'var(--border)' : p >= 90 ? 'var(--ok)' : p >= 70 ? 'var(--warn)' : 'var(--bad)'}" role="img" aria-label="${p == null ? 'No runs' : p + ' percent adherence'}"><span>${p == null ? '--' : p + '%'}</span></div>`;
const lastRun = id => st.runs.find(r => r.sopId === id);

/* ---------- views ---------- */
function vDashboard() {
  const m = metrics();
  const hrs = (m.mins / 60).toFixed(1);
  const wasteCount = WASTES.map(w => [w, st.kaizens.filter(k => k.waste === w).length]);
  const max = Math.max(1, ...wasteCount.map(w => w[1]));
  const stageCount = STAGES.map(s => [s, st.kaizens.filter(k => k.stage === s).length]);
  return `
  <section class="grid kpis" aria-label="Key metrics">
    <article class="card kpi"><div class="label">SOP Adherence Rate</div><div class="value ${m.adherence == null ? '' : m.adherence >= 90 ? 'ok' : m.adherence >= 70 ? 'warn' : 'bad'}">${m.adherence == null ? '--' : m.adherence + '%'}</div><div class="hint">Average across ${st.runs.length} audit runs</div></article>
    <article class="card kpi"><div class="label">Active Kaizens</div><div class="value">${m.active}</div><div class="hint">Not yet standardised (Plan/Do/Check)</div></article>
    <article class="card kpi"><div class="label">Cycle Time Saved</div><div class="value">${hrs}<small> h</small></div><div class="hint">Verified in Check or Act stages</div></article>
    <article class="card kpi"><div class="label">Incident Reduction</div><div class="value ok">${m.inc}%</div><div class="hint">Mean across verified improvements</div></article>
  </section>
  <section class="grid cols-2" style="margin-top:var(--space-4)">
    <article class="card"><h2>Lean waste distribution</h2>
      ${wasteCount.map(([w, n]) => `<div class="bar-row"><span>${w}</span><div class="bar"><i style="width:${n / max * 100}%"></i></div><b>${n}</b></div>`).join('')}
      <h2 style="margin-top:var(--space-4)">PDCA pipeline</h2>
      ${stageCount.map(([s, n]) => `<div class="bar-row"><span>${s}</span><div class="bar"><i style="width:${n / Math.max(1, st.kaizens.length) * 100}%"></i></div><b>${n}</b></div>`).join('')}
    </article>
    <article class="card"><h2>Recent SOP audit runs</h2>
      ${st.runs.length ? `<ul class="list">${st.runs.slice(0, 7).map(r => { const s = st.sops.find(x => x.id === r.sopId); return `<li><span>${esc(s ? s.title : r.sopId)}<br><span class="muted">${esc(r.engineer)} · ${fdt(r.ts)}</span></span><b class="${r.score >= 90 ? 'ok' : r.score >= 70 ? 'warn' : 'bad'}">${r.score}%</b></li>`; }).join('')}</ul>` : '<p class="muted">No runs recorded yet. Open the SOP Tracker to start one.</p>'}
    </article>
  </section>`;
}

function vSops() {
  const q = st.q.toLowerCase();
  const list = st.sops.filter(s => !q || (s.title + s.code + s.category + s.summary).toLowerCase().includes(q));
  return `
  <div class="toolbar"><input class="grow" id="q" type="search" placeholder="Search SOPs by title, code or category" value="${esc(st.q)}" aria-label="Search SOPs"></div>
  <section class="grid cards">${list.map(s => {
    const lr = lastRun(s.id);
    return `<article class="card sop-card">
      <div class="sop-head"><div><span class="badge waste">${esc(s.category)}</span><h3 style="margin-top:var(--space-2)">${esc(s.title)}</h3><p class="muted">${esc(s.code)} · Rev ${esc(s.rev)} · ${s.steps.length} steps</p></div>${ring(lr ? lr.score : null)}</div>
      <p class="muted">${esc(s.summary)}</p>
      <p class="muted">${lr ? 'Last run ' + fdt(lr.ts) + ' by ' + esc(lr.engineer) : 'Never executed'}</p>
      <div class="row"><button class="btn" data-run="${s.id}">Start check-off</button><button class="btn ghost" data-hist="${s.id}">History</button></div>
    </article>`;
  }).join('') || '<p class="muted">No SOPs match your search.</p>'}</section>`;
}

function vKaizen() {
  const q = st.q.toLowerCase();
  const list = st.kaizens.filter(k => (st.prio === 'all' || k.priority === st.prio) && (!q || (k.title + k.problem + k.owner + k.waste).toLowerCase().includes(q)));
  return `
  <div class="toolbar">
    <input class="grow" id="q" type="search" placeholder="Search Kaizens" value="${esc(st.q)}" aria-label="Search Kaizens">
    <select id="prio" aria-label="Filter by priority" style="width:auto"><option value="all">All priorities</option>${PRIOS.map(p => `<option ${st.prio === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <button class="btn" id="newKz">+ New Kaizen</button>
  </div>
  <section class="board">${STAGES.map((s, i) => {
    const items = list.filter(k => k.stage === s);
    return `<div class="col" data-stage="${s}" role="region" aria-label="${s} column"><header><h2>${s}</h2><small>${STAGE_HINT[s]} · ${items.length}</small></header>
    ${items.map(k => `<article class="k-card"><button class="title" data-open="${k.id}">${esc(k.title)}</button>
      <div class="badges"><span class="badge ${k.priority}">${k.priority}</span><span class="badge waste">${esc(k.waste)}</span></div>
      <p class="muted">${esc(k.owner)}${+k.minutesSaved ? ' · saves ' + k.minutesSaved + ' min' : ''}</p>
      <div class="move"><button class="btn ghost small" data-mv="${k.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move to ${STAGES[i - 1] || ''}">&larr; ${STAGES[i - 1] || ''}</button><button class="btn ghost small" data-mv="${k.id}" data-d="1" ${i === 3 ? 'disabled' : ''} aria-label="Move to ${STAGES[i + 1] || ''}">${STAGES[i + 1] || ''} &rarr;</button></div></article>`).join('') || '<p class="muted">Empty</p>'}</div>`;
  }).join('')}</section>`;
}

async function vStorage() {
  const i = await storageInfo(), t = await DB.totals();
  return `
  <section class="grid cols-2">
    <article class="card"><h2>Local storage telemetry</h2>
      ${i.supported ? `<div class="bar meter" role="progressbar" aria-valuenow="${i.pct.toFixed(2)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(i.pct, 1)}%"></i></div>
      <ul class="list" style="margin-top:var(--space-3)">
        <li><span>Used</span><b>${i.fmt(i.usage)}</b></li><li><span>Quota</span><b>${i.fmt(i.quota)}</b></li>
        <li><span>Persistent storage</span><b class="${i.persisted ? 'ok' : 'warn'}">${i.persisted ? 'Granted' : 'Not granted'}</b></li>
        <li><span>Records (SOPs / Kaizens / Runs)</span><b>${t.sops} / ${t.kaizens} / ${t.runs}</b></li>
        <li><span>Estimated capacity remaining</span><b>${i.years >= 99 ? '99+' : i.years.toFixed(1)} years</b></li></ul>
      <p class="muted" style="margin-top:var(--space-2)">Capacity assumes about 1,500 new records per year at the current average record size.</p>
      ${i.persisted ? '' : '<button class="btn" id="persist" style="margin-top:var(--space-3)">Request persistent storage</button>'}`
      : '<p class="muted">Storage estimates are not supported by this browser.</p>'}
    </article>
    <article class="card"><h2>Backup, restore &amp; reports</h2>
      <p class="muted">Data never leaves this device. Export a backup to transfer it to another workstation or keep a long-term archive.</p>
      <div class="row" style="margin-top:var(--space-3)">
        <button class="btn" id="expJson">Export full backup (JSON)</button>
        <button class="btn ghost" id="impJson">Import backup (JSON)</button>
        <button class="btn ghost" id="expSop">SOP audits (CSV)</button>
        <button class="btn ghost" id="expKz">Kaizen review (CSV)</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <label><input type="checkbox" id="replace" style="width:auto;min-height:0"> Replace existing data on import (otherwise merge)</label>
      <hr style="border:0;border-top:1px solid var(--border);margin:var(--space-4) 0">
      <button class="btn danger" id="reset">Erase all data</button>
    </article>
  </section>`;
}

/* ---------- modals ---------- */
function openModal(title, body, footer) {
  modal.innerHTML = `<div class="mh"><h2 id="modalTitle">${esc(title)}</h2><button class="btn ghost icon" data-close aria-label="Close">&times;</button></div><div class="mb">${body}</div><div class="mf">${footer}</div>`;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === modal) modal.close(); });

function runModal(sop) {
  const steps = sop.steps.map((s, i) => `<fieldset class="step" id="st${i}" style="margin-inline:0"><legend class="muted">Step ${i + 1}</legend><p>${esc(s.text)}</p>${s.detail ? `<p class="muted">${esc(s.detail)}</p>` : ''}
    <div class="seg" role="radiogroup" aria-label="Result for step ${i + 1}">
      <label><input type="radio" name="r${i}" value="pass"><span class="p">Pass</span></label>
      <label><input type="radio" name="r${i}" value="fail"><span class="f">Fail</span></label>
      <label><input type="radio" name="r${i}" value="na"><span class="n">N/A</span></label></div>
    <div class="stamp" id="ts${i}">Not recorded</div></fieldset>`).join('');
  openModal(sop.title, `<p class="muted">${esc(sop.code)} · Rev ${esc(sop.rev)}</p>
    <label for="eng">Engineer initials</label><input id="eng" maxlength="5" autocomplete="off" placeholder="e.g. AR" style="text-transform:uppercase">${steps}
    <label for="note">Deviation / remarks</label><textarea id="note" placeholder="Record any field deviation to raise as a Kaizen"></textarea>
    <p class="muted" id="live" style="margin-top:var(--space-3)" aria-live="polite">Adherence: --</p>`,
    '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="saveRun">Save audit run</button>');
  const times = {};
  const calc = () => {
    let p = 0, f = 0, n = 0;
    sop.steps.forEach((_, i) => { const v = $(`input[name=r${i}]:checked`, modal); if (!v) return; v.value === 'pass' ? p++ : v.value === 'fail' ? f++ : n++; });
    const den = p + f;
    $('#live', modal).textContent = `Adherence: ${den ? Math.round(p / den * 100) + '%' : '--'} (${p} pass, ${f} fail, ${n} N/A, ${sop.steps.length - p - f - n} pending)`;
    return { p, f, n, den };
  };
  modal.onchange = e => {
    const m = /^r(\d+)$/.exec(e.target.name || ''); if (!m) return;
    const i = +m[1]; times[i] = new Date().toISOString();
    $('#ts' + i, modal).textContent = 'Recorded ' + fdt(times[i]);
    $('#st' + i, modal).className = 'step ' + (e.target.value === 'pass' ? 'pass' : e.target.value === 'fail' ? 'fail' : '');
    calc();
  };
  $('#saveRun', modal).onclick = async () => {
    const eng = $('#eng', modal).value.trim().toUpperCase();
    if (!eng) { toast('Enter engineer initials'); $('#eng', modal).focus(); return; }
    const c = calc();
    if (c.p + c.f + c.n < sop.steps.length) { toast('Complete every step before saving'); return; }
    const results = sop.steps.map((s, i) => ({ step: s.text, result: $(`input[name=r${i}]:checked`, modal).value, ts: times[i] }));
    await DB.put('runs', { id: uid('run'), sopId: sop.id, engineer: eng, ts: new Date().toISOString(), total: sop.steps.length, pass: c.p, fail: c.f, na: c.n, score: c.den ? Math.round(c.p / c.den * 100) : 100, results, note: $('#note', modal).value.trim() });
    modal.close(); await load(); render(); toast('Audit run saved');
  };
}

function histModal(sop) {
  const runs = st.runs.filter(r => r.sopId === sop.id);
  openModal('History: ' + sop.title, runs.length ? `<ul class="list">${runs.map(r => `<li><span>${fdt(r.ts)} · ${esc(r.engineer)}<br><span class="muted">${r.pass} pass, ${r.fail} fail, ${r.na} N/A${r.note ? ' · ' + esc(r.note) : ''}</span></span><b class="${r.score >= 90 ? 'ok' : r.score >= 70 ? 'warn' : 'bad'}">${r.score}%</b></li>`).join('')}</ul>` : '<p class="muted">No runs yet.</p>', '<button class="btn ghost" data-close>Close</button>');
}

function kzModal(k) {
  const isNew = !k;
  k = k || { id: uid('kz'), title: '', stage: 'Plan', priority: 'Medium', waste: 'Waiting', owner: '', problem: '', whys: ['', '', '', '', ''], countermeasure: '', minutesSaved: 0, incidentReduction: 0, created: new Date().toISOString() };
  const opt = (arr, v) => arr.map(a => `<option ${a === v ? 'selected' : ''}>${a}</option>`).join('');
  openModal(isNew ? 'New Kaizen' : 'Kaizen detail', `
    <label for="kt">Title</label><input id="kt" value="${esc(k.title)}">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 var(--space-3)">
      <div><label for="ks">Stage</label><select id="ks">${opt(STAGES, k.stage)}</select></div>
      <div><label for="kp">Priority</label><select id="kp">${opt(PRIOS, k.priority)}</select></div>
      <div><label for="kw">Lean waste</label><select id="kw">${opt(WASTES, k.waste)}</select></div>
      <div><label for="ko">Owner</label><input id="ko" value="${esc(k.owner)}"></div></div>
    <label for="kpr">Problem statement</label><textarea id="kpr">${esc(k.problem)}</textarea>
    <label>Root cause analysis (5-Whys)</label>${k.whys.map((w, i) => `<input class="why" aria-label="Why ${i + 1}" placeholder="Why ${i + 1}?" value="${esc(w)}" style="margin-bottom:var(--space-2)">`).join('')}
    <label for="kc">Countermeasure</label><textarea id="kc">${esc(k.countermeasure)}</textarea>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0 var(--space-3)">
      <div><label for="km">Cycle time saved (minutes)</label><input id="km" type="number" min="0" inputmode="numeric" value="${+k.minutesSaved || 0}"></div>
      <div><label for="ki">Incident reduction (%)</label><input id="ki" type="number" min="0" max="100" inputmode="numeric" value="${+k.incidentReduction || 0}"></div></div>`,
    `${isNew ? '' : '<button class="btn danger" id="kdel">Delete</button>'}<button class="btn ghost" data-close>Cancel</button><button class="btn" id="ksave">Save</button>`);
  $('#ksave', modal).onclick = async () => {
    const title = $('#kt', modal).value.trim();
    if (!title) { toast('Title is required'); $('#kt', modal).focus(); return; }
    await DB.put('kaizens', { ...k, title, stage: $('#ks', modal).value, priority: $('#kp', modal).value, waste: $('#kw', modal).value, owner: $('#ko', modal).value.trim(),
      problem: $('#kpr', modal).value.trim(), whys: [...modal.querySelectorAll('.why')].map(i => i.value.trim()), countermeasure: $('#kc', modal).value.trim(),
      minutesSaved: Math.max(0, +$('#km', modal).value || 0), incidentReduction: Math.min(100, Math.max(0, +$('#ki', modal).value || 0)), updated: new Date().toISOString() });
    modal.close(); await load(); render(); toast('Kaizen saved');
  };
  const del = $('#kdel', modal);
  if (del) del.onclick = async () => { if (confirm('Delete this Kaizen permanently?')) { await DB.del('kaizens', k.id); modal.close(); await load(); render(); toast('Deleted'); } };
}

/* ---------- export helpers ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csv = rows => rows.map(r => r.map(c => { let s = String(c ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
const stamp = () => new Date().toISOString().slice(0, 10);

function bindStorage() {
  const p = $('#persist'); if (p) p.onclick = async () => { toast((await requestPersist()) ? 'Persistent storage granted' : 'Browser declined persistence'); render(); };
  $('#expJson').onclick = async () => { download(`workflow-kaizen-backup-${stamp()}.json`, JSON.stringify(await DB.exportAll(), null, 2), 'application/json'); toast('Backup exported'); };
  $('#impJson').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = await DB.importAll(JSON.parse(await f.text()), { merge: !$('#replace').checked }); await load(); render(); toast(`Imported ${n} records`); }
    catch (err) { toast('Import failed: ' + err.message); }
  };
  $('#expSop').onclick = () => {
    const rows = [['Run ID', 'SOP Code', 'SOP Title', 'Engineer', 'Timestamp', 'Pass', 'Fail', 'N/A', 'Adherence %', 'Remarks']];
    st.runs.forEach(r => { const s = st.sops.find(x => x.id === r.sopId) || {}; rows.push([r.id, s.code, s.title, r.engineer, r.ts, r.pass, r.fail, r.na, r.score, r.note]); });
    download(`sop-audits-${stamp()}.csv`, csv(rows), 'text/csv');
  };
  $('#expKz').onclick = () => {
    const rows = [['ID', 'Title', 'Stage', 'Priority', 'Waste', 'Owner', 'Problem', 'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5', 'Countermeasure', 'Minutes Saved', 'Incident Reduction %', 'Created', 'Updated']];
    st.kaizens.forEach(k => rows.push([k.id, k.title, k.stage, k.priority, k.waste, k.owner, k.problem, ...k.whys, k.countermeasure, k.minutesSaved, k.incidentReduction, k.created, k.updated]));
    download(`kaizen-review-${stamp()}.csv`, csv(rows), 'text/csv');
  };
  $('#reset').onclick = async () => {
    if (!confirm('Erase ALL SOPs, Kaizens and audit runs from this device? Export a backup first.')) return;
    for (const s of ['sops', 'kaizens', 'runs']) await DB.clear(s);
    await DB.setMeta('seeded', true); await load(); render(); toast('All data erased');
  };
}

/* ---------- router / render ---------- */
let renderId = 0;
async function render() {
  const id = ++renderId;
  const tab = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'dashboard';
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-selected', a.dataset.tab === tab));
  const html = tab === 'sops' ? vSops() : tab === 'kaizen' ? vKaizen() : tab === 'storage' ? await vStorage() : vDashboard();
  if (id !== renderId) return;
  view.innerHTML = html;
  const q = $('#q');
  if (q) q.oninput = e => { st.q = e.target.value; const pos = e.target.selectionStart; render().then(() => { const n = $('#q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); };
  if (tab === 'storage') bindStorage();
}

view.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.run) runModal(st.sops.find(s => s.id === t.dataset.run));
  else if (t.dataset.hist) histModal(st.sops.find(s => s.id === t.dataset.hist));
  else if (t.dataset.open) kzModal(st.kaizens.find(k => k.id === t.dataset.open));
  else if (t.id === 'newKz') kzModal(null);
  else if (t.dataset.mv) {
    const k = st.kaizens.find(x => x.id === t.dataset.mv); const i = STAGES.indexOf(k.stage) + +t.dataset.d;
    if (i < 0 || i > 3) return;
    k.stage = STAGES[i]; k.updated = new Date().toISOString(); await DB.put('kaizens', k); render(); toast(`Moved to ${k.stage}`);
  }
});
view.addEventListener('change', e => { if (e.target.id === 'prio') { st.prio = e.target.value; render(); } });

/* ---------- theme & boot ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0b1220' : '#f3f6fb';
  try { localStorage.setItem('wkh-theme', t); } catch (_) {}
}
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
let saved = null; try { saved = localStorage.getItem('wkh-theme'); } catch (_) {}
setTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
window.addEventListener('hashchange', () => { st.q = ''; render(); view.focus(); });

(async function boot() {
  initPWA({ onToast: toast });
  try { await ensureSeed(); await load(); }
  catch (err) { view.innerHTML = `<div class="card"><h2>Storage unavailable</h2><p class="muted">IndexedDB failed to open: ${esc(err.message)}. Private browsing may block local storage.</p></div>`; return; }
  render();
})();
