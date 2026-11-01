import { DB } from './db.js';
import { seedAll, SOPS, KAIZENS } from './seed-data.js';
import { initPWA, storageInfo, requestPersist, flushNow, snapshotUsage, fmt } from './pwa-installer.js';

const STAGES = ['Plan', 'Do', 'Check', 'Act'];
const STAGE_HINT = { Plan: 'Identify bottleneck / waste', Do: 'Implement countermeasure', Check: 'Measure SCADA metric', Act: 'Standardise & update SOP' };
const PRIOS = ['Critical', 'High', 'Medium', 'Low'];
const WASTES = ['Defects', 'Waiting', 'Motion', 'Overprocessing'];
const TABS = ['dashboard', 'sops', 'kaizen', 'audit', 'storage'];

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view'), modal = $('#modal');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdt = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '--';
const scoreCls = n => n >= 100 ? 'ok' : n >= 75 ? 'warn' : 'bad';   // single run: 100 / 75-99 / below 75
const kpiCls = n => n >= 90 ? 'ok' : n >= 75 ? 'warn' : 'bad';     // average across runs
const scoreTone = n => n >= 100 ? 's-ok' : n >= 75 ? 's-warn' : 's-bad';
const sopOf = id => st.sops.find(s => s.id === id);
const svg = p => `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  doc: svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
  board: svg('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="6" rx="1"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  log: svg('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>')
};
const empty = (icon, title, text, actions = '') => `<div class="empty" role="status">${icon}<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row center">${actions}</div></div>`;

const st = {
  sops: [], kaizens: [], last: {}, stats: { count: 0, scored: 0, sum: 0, failed: 0 }, recent: [],
  q: '', prio: 'all',
  audit: { initials: '', status: 'all', sopId: 'all', items: [], offset: 0, done: false, total: null, ms: 0, dirty: true, events: [] }
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ---------------- data loading ---------------- */
async function load() {
  st.sops = await DB.all('sops'); st.sops.sort((a, b) => a.code.localeCompare(b.code));
  st.kaizens = await DB.all('kaizens');
  st.stats = await DB.runStats();
  if (st.stats.stale) { await DB.healStatuses(); st.stats.stale = 0; }
  const lasts = await Promise.all(st.sops.map(s => DB.lastBySop(s.id)));
  st.last = {}; st.sops.forEach((s, i) => { st.last[s.id] = lasts[i]; });
  st.recent = (await DB.page('runs', { index: 'ts', limit: 7 })).items;
  st.audit.dirty = true;
}

async function ensureSeed() {
  if (await DB.getMeta('seeded')) return;
  if ((await DB.totals()).total === 0) {
    const s = seedAll();
    await DB.commit({ puts: { sops: s.sops, kaizens: s.kaizens, runs: s.runs }, audit: [{ action: 'seed', detail: 'Sample SCADA data loaded', actor: 'system' }] });
  }
  await DB.setMeta('seeded', true);
}

function metrics() {
  const s = st.stats;
  const proven = st.kaizens.filter(k => k.stage === 'Check' || k.stage === 'Act');
  const withInc = proven.filter(k => +k.incidentReduction > 0);
  return {
    adherence: s.scored ? Math.round(s.sum / s.scored) : null,
    active: st.kaizens.filter(k => k.stage !== 'Act').length,
    mins: proven.reduce((a, k) => a + (+k.minutesSaved || 0), 0),
    inc: withInc.length ? Math.round(withInc.reduce((a, k) => a + +k.incidentReduction, 0) / withInc.length) : 0
  };
}
const I = (p, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = {
  check: I('<circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.7 2.7L16 9.5"/>', 20),
  warn: I('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>', 20),
  x: I('<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>', 20),
  play: I('<path d="M6 4l14 8-14 8z"/>'),
  hist: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>'),
  down: I('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  up: I('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  sheet: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  sync: I('<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M18 2v4h-4M6 22v-4h4"/>'),
  shield: I('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>')
};
const catClass = c => { c = String(c || '').toLowerCase();
  return /plc|protocol|handshake/.test(c) ? 'c-blue' : /qhse|safety/.test(c) ? 'c-green' : /instrument|field|calib/.test(c) ? 'c-amber'
    : /telemetry|rtu|fat|sat/.test(c) ? 'c-cyan' : /wonderware|hmi|scada/.test(c) ? 'c-purple' : ''; };
const WASTE_VAR = { Defects: '--c-red', Waiting: '--c-amber', Motion: '--c-orange', Overprocessing: '--c-cyan' };
const STAGE_VAR = { Plan: '--c-blue', Do: '--c-amber', Check: '--c-purple', Act: '--c-green' };
const WASTE_BAR = { Defects: '--bar-red', Waiting: '--bar-amber', Motion: '--bar-amber', Overprocessing: '--bar-cyan' };
const STAGE_BAR = { Plan: '--bar-blue', Do: '--bar-amber', Check: '--bar-purple', Act: '--bar-green' };
const ARW_L = I('<path d="M19 12H5M11 6l-6 6 6 6"/>', 14), ARW_R = I('<path d="M5 12h14M13 6l6 6-6 6"/>', 14), EYE = I('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>');
const stat = r => DB.statusOf(r.score);   // status is always derived from the score: 100 Passed, 75-99 Deviation, <75 Failed
const runIcon = r => stat(r) === 'Passed' ? `<span class="st-ok" title="Passed">${ICO.check}</span>` : stat(r) === 'Deviation' ? `<span class="st-warn" title="Deviation: 75-99% adherence">${ICO.warn}</span>` : `<span class="st-bad" title="Failed: below 75% adherence">${ICO.x}</span>`;
const TARGET = 95;
const ring = (p, size = 64, kpi = false) => {
  const sw = 6, r = (size - sw) / 2 - 1, c = 2 * Math.PI * r, h = size / 2;
  const col = p == null ? 'var(--border-strong)' : `var(--${(kpi ? kpiCls(p) : scoreCls(p))})`;
  const track = `<circle cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:var(--track)" stroke-width="${sw}"/>`;
  const arc = p == null || p <= 0 ? '' : `<circle cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:${col}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(c * Math.min(p, 100) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${h} ${h})"/>`;
  if (kpi) {   // gauge only: the large number lives beside it; a tick marks the target
    const a = (-90 + 360 * TARGET / 100) * Math.PI / 180, r1 = r - sw / 2 - 2, r2 = r + sw / 2 + 2;
    const tick = `<line x1="${(h + r1 * Math.cos(a)).toFixed(1)}" y1="${(h + r1 * Math.sin(a)).toFixed(1)}" x2="${(h + r2 * Math.cos(a)).toFixed(1)}" y2="${(h + r2 * Math.sin(a)).toFixed(1)}" style="stroke:var(--text)" stroke-width="2" stroke-linecap="round"/>`;
    return `<div class="ring2 gauge-ring${p === 100 ? ' glow' : ''}" style="width:${size}px;height:${size}px" role="img" aria-label="${p == null ? 'No runs yet' : p + ' percent adherence, target ' + TARGET + ' percent'}"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${track}${arc}${tick}</svg><span style="color:${col}">${ICO.shield}</span></div>`;
  }
  return `<div class="ring2${p === 100 ? ' glow' : ''}" style="width:${size}px;height:${size}px" role="img" aria-label="${p == null ? 'No runs yet' : p + ' percent adherence'}"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${track}${arc}</svg><span style="font-size:.875rem">${p == null ? '--' : p + '%'}</span></div>`;
};
const spark = (vals, color) => {
  const pts = vals.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
  if (pts.length < 2) return '';
  const W = 80, H = 24, ys = pts.map(p => p[1]), mn = Math.min(...ys), rg = (Math.max(...ys) - mn) || 1, n = vals.length - 1;
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${(p[0] / n * W).toFixed(1)} ${(H - 2 - (p[1] - mn) / rg * (H - 4)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
const trend = (d, text, none = 'No prior-week data') => d == null ? `<span class="trend flat">${none}</span>`
  : `<span class="trend ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}"><span aria-hidden="true">${d > 0 ? '\u25B2' : d < 0 ? '\u25BC' : '\u25A0'}</span> <span class="vh">${d > 0 ? 'Up' : d < 0 ? 'Down' : 'Unchanged'}</span> ${d > 0 ? '+' : ''}${d} ${text}</span>`;
const sopTitle = id => { const s = sopOf(id); return s ? s.title : id; };

/* ---------------- skeletons ---------------- */
const skelCard = '<div class="card" aria-hidden="true"><div class="skeleton line w40"></div><div class="skeleton big"></div><div class="skeleton line"></div><div class="skeleton line w60"></div><div class="skeleton block"></div></div>';
const skeleton = tab => tab === 'dashboard'
  ? `<div class="grid kpis">${skelCard.repeat(5)}</div><div class="grid cols-2" style="margin-top:var(--space-4)">${skelCard.repeat(2)}</div>`
  : `<div class="grid cards">${skelCard.repeat(6)}</div>`;

/* ---------------- views ---------------- */
function vDashboard() {
  const m = metrics(), s = st.stats, now = Date.now(), wk = 7 * 864e5;
  const avg = w => w.s ? w.sum / w.s : null;
  const dA = avg(s.cur) != null && avg(s.prev) != null ? Math.round((avg(s.cur) - avg(s.prev)) * 10) / 10 : null;
  const daily = [...s.daily].reverse();
  const advSeries = daily.map(d => d.s ? Math.round(d.sum / d.s) : null), runSeries = daily.map(d => d.n);
  const newKz = st.kaizens.filter(k => now - Date.parse(k.created) < wk).length;
  const weekMins = st.kaizens.filter(k => (k.stage === 'Check' || k.stage === 'Act') && now - Date.parse(k.updated) < wk).reduce((a, k) => a + (+k.minutesSaved || 0), 0);
  const tone = m.adherence == null ? 'var(--border-strong)' : `var(--${kpiCls(m.adherence)})`;
  const wc = WASTES.map(w => [w, st.kaizens.filter(k => k.waste === w).length]), wmax = Math.max(1, ...wc.map(x => x[1]));
  const sc = STAGES.map(x => [x, st.kaizens.filter(k => k.stage === x).length]), smax = Math.max(1, ...sc.map(x => x[1]));
  const bar = (label, n, max, v) => `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${n ? Math.max(n / max * 100, 4) : 0}%;background:var(${v})"></i></div><b>${n}</b></div>`;
  return `
  <section class="grid kpis" aria-label="Key metrics">
    <article class="card kpi primary" style="--kc:${tone}"><div class="top"><div><div class="label">SOP Adherence Rate</div><div class="value ${m.adherence == null ? '' : kpiCls(m.adherence)}">${m.adherence == null ? '--' : m.adherence + '%'}</div></div><div class="gauge">${ring(m.adherence, 88, true)}<span class="gauge-cap">Target: ${TARGET}%</span></div></div>
      <div class="foot">${trend(dA, 'pts this week')}${spark(advSeries, tone)}</div></article>
    <article class="card kpi" style="--kc:var(--c-blue)"><div><div class="label">Audit Runs</div><div class="value">${s.count}</div><div class="hint">${s.failed} with a failed step</div></div>
      <div class="foot">${trend(s.cur.n || s.prev.n ? s.cur.n - s.prev.n : null, 'runs this week', 'No runs in 14 days')}${spark(runSeries, 'var(--c-blue)')}</div></article>
    <article class="card kpi" style="--kc:var(--c-purple)"><div><div class="label">Active Kaizens</div><div class="value">${m.active}</div><div class="hint">Not yet standardised</div></div>
      <div class="foot">${trend(newKz, 'new this week')}</div></article>
    <article class="card kpi" style="--kc:var(--c-cyan)"><div><div class="label">Cycle Time Saved</div><div class="value">${(m.mins / 60).toFixed(1)}<small> h</small></div><div class="hint">Verified in Check or Act</div></div>
      <div class="foot">${trend(Math.round(weekMins / 6) / 10, 'h this week')}</div></article>
    <article class="card kpi" style="--kc:var(--c-green)"><div><div class="label">Incident Reduction</div><div class="value ok">${m.inc}%</div><div class="hint">Mean of verified improvements</div></div>
      <div class="foot"><span class="trend flat">${ICO.shield} Across ${st.kaizens.filter(k => +k.incidentReduction > 0 && (k.stage === 'Check' || k.stage === 'Act')).length} Kaizens</span></div></article>
  </section>
  <section class="grid cols-2" style="margin-top:var(--space-4)">
    <article class="card"><h2>Lean waste distribution</h2>
      ${wc.map(([w, n]) => bar(w, n, wmax, WASTE_BAR[w])).join('')}
      <h2 style="margin-top:var(--space-5)">PDCA pipeline</h2>
      ${sc.map(([x, n]) => bar(x, n, smax, STAGE_BAR[x])).join('')}
    </article>
    <article class="card"><h2>Recent SOP audit runs</h2>
      ${st.recent.length ? `<ul class="tiles">${st.recent.map(r => `<li><button class="run-tile" data-detail="${esc(r.id)}"><span class="rt-ico">${runIcon(r)}</span><span class="rt-main">${esc(sopTitle(r.sopId))}<br><span class="muted">${esc(r.initials)} · ${fdt(r.ts)}</span></span><b class="${scoreCls(r.score)}">${r.score}%</b></button></li>`).join('')}</ul>`
        : empty(ICON.log, 'No audit runs yet', 'Open the SOP Tracker and complete a check-off to see adherence data here.', '<a class="btn" href="#/sops">Go to SOP Tracker</a>')}
    </article>
  </section>`;
}

function vSops() {
  const bar = `<div class="toolbar"><input class="grow" id="q" type="search" placeholder="Search SOPs by title, code or category" value="${esc(st.q)}" aria-label="Search SOPs"><button class="btn" data-act="newsop">+ New SOP</button></div>`;
  if (!st.sops.length) return empty(ICON.doc, 'No SOPs yet', 'Create your first Standard Operating Procedure, or load the sample SCADA library to try the check-off workflow.',
    '<button class="btn" data-act="newsop">New SOP</button><button class="btn ghost" data-act="samplesops">Load sample SOPs</button>');
  const q = st.q.toLowerCase();
  const list = st.sops.filter(s => !q || (s.title + s.code + s.category + s.summary).toLowerCase().includes(q));
  return bar + (list.length ? `<section class="grid cards">${list.map(s => {
    const lr = st.last[s.id];
    return `<article class="card sop-card">
      <div class="sop-head"><div><span class="badge ${catClass(s.category)}">${esc(s.category)}</span><h3 style="margin-top:var(--space-2)">${esc(s.title)}</h3><p class="muted">${esc(s.code)} · Rev ${esc(s.rev)} · ${s.steps.length} steps</p></div>${ring(lr ? lr.score : null)}</div>
      <p class="muted">${esc(s.summary)}</p>
      <p class="muted">${lr ? 'Last run ' + fdt(lr.ts) + ' by ' + esc(lr.initials) : 'Never executed'}</p>
      <div class="row sop-actions"><button class="btn" data-run="${esc(s.id)}">${ICO.play} Start Verification</button><button class="btn ghost" data-hist="${esc(s.id)}">${ICO.hist} History</button></div>
    </article>`;
  }).join('')}</section>` : empty(ICON.search, 'No matches', `Nothing matches "${st.q}".`, '<button class="btn ghost" data-act="clearq">Clear search</button>'));
}

function vKaizen() {
  if (!st.kaizens.length) return empty(ICON.board, 'Your Kaizen board is empty', 'Capture the first field deviation or improvement idea. It starts in Plan and moves through Do, Check and Act.',
    '<button class="btn" data-act="newkz">Log first Kaizen</button><button class="btn ghost" data-act="samplekz">Load sample Kaizens</button>');
  const q = st.q.toLowerCase();
  const list = st.kaizens.filter(k => (st.prio === 'all' || k.priority === st.prio) && (!q || (k.title + k.problem + k.owner + k.waste).toLowerCase().includes(q)));
  return `
  <div class="toolbar">
    <input class="grow" id="q" type="search" placeholder="Search Kaizens" value="${esc(st.q)}" aria-label="Search Kaizens">
    <select id="prio" aria-label="Filter by priority" style="width:auto"><option value="all">All priorities</option>${PRIOS.map(p => `<option ${st.prio === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <button class="btn" data-act="newkz">+ New Kaizen</button>
  </div>
  <section class="board">${STAGES.map((s, i) => {
    const items = list.filter(k => k.stage === s);
    const chip = (k, d) => { const t = STAGES[i + d]; return `<button class="chip-btn ${d < 0 ? 'back' : ''}" style="--tc:var(${STAGE_VAR[t]})" data-mv="${esc(k.id)}" data-d="${d}" aria-label="Move ${d < 0 ? 'back' : 'forward'} to ${t}">${d < 0 ? ARW_L + ' ' + t : t + ' ' + ARW_R}</button>`; };
    return `<div class="col" data-stage="${s}" role="region" aria-label="${s} column"><div class="colhead"><h2>${s}</h2><span class="count" aria-label="${items.length} items">${items.length}</span></div><p class="hint">${STAGE_HINT[s]}</p>
    ${items.map(k => `<article class="k-card"><button class="title" data-open="${esc(k.id)}">${esc(k.title)}</button>
      <div class="badges"><span class="badge ${k.priority}">${k.priority}</span><span class="badge w-${k.waste}">${esc(k.waste)}</span></div>
      <p class="k-meta muted">${esc(k.owner)}${+k.minutesSaved ? ' · saves ' + k.minutesSaved + ' min' : ''}</p><div class="k-foot"><span class="chips">${i > 0 ? chip(k, -1) : ''}${i < 3 ? chip(k, 1) : ''}</span></div></article>`).join('') || '<p class="muted">Nothing here. Move a card in, or add a new Kaizen.</p>'}</div>`;
  }).join('')}</section>`;
}

/* audit trail: indexed, paged queries */
function auditPlan() {
  const f = st.audit; let index = 'ts', range = null; const b = v => DB.range(v, '');
  if (f.initials) { index = 'initials_ts'; range = b(f.initials); }
  else if (f.status !== 'all') { index = 'status_ts'; range = b(f.status); }
  else if (f.sopId !== 'all') { index = 'sop_ts'; range = b(f.sopId); }
  const n = (f.initials ? 1 : 0) + (f.status !== 'all' ? 1 : 0) + (f.sopId !== 'all' ? 1 : 0);
  const filter = n > 1 ? r => (!f.initials || r.initials === f.initials) && (f.status === 'all' || stat(r) === f.status) && (f.sopId === 'all' || r.sopId === f.sopId) : null;
  return { index, range, filter, n };
}
async function auditMore(reset) {
  const f = st.audit, t0 = performance.now();
  if (reset) { f.items = []; f.offset = 0; f.done = false; }
  const p = auditPlan();
  const r = await DB.page('runs', { index: p.index, range: p.range, dir: 'prev', offset: f.offset, limit: 25, filter: p.filter });
  f.items.push(...r.items); f.offset += r.items.length; f.done = r.done || r.items.length < 25;
  if (reset) f.total = p.n <= 1 ? await DB.countIndex('runs', p.index, p.range) : null;
  f.ms = Math.round(performance.now() - t0);
}
async function vAudit() {
  const f = st.audit;
  if (f.dirty) { await auditMore(true); f.events = (await DB.page('audit', { index: 'ts', limit: 12 })).items; f.dirty = false; }
  const rows = f.items.map(r => { const s = sopOf(r.sopId) || {}; const photos = (r.results || []).filter(x => x && x.p).length;
    return `<tr><td data-l="Status"><span class="badge ${stat(r)}">${stat(r)}</span></td>
      <td data-l="SOP"><b>${esc(s.code || r.sopId)}</b><br><span class="muted">${esc(s.title || '')}${photos ? ' · ' + photos + ' photo' + (photos > 1 ? 's' : '') : ''}</span></td>
      <td data-l="Engineer">${esc(r.initials)}</td><td data-l="Date &amp; time">${fdt(r.ts)}</td>
      <td data-l="Score"><span class="badge score ${scoreTone(r.score)}">${r.score}%</span></td>
      <td><button class="btn ghost small" data-detail="${esc(r.id)}" aria-label="View run ${esc(s.code || r.sopId)} ${fdt(r.ts)}">${EYE} View Run</button></td></tr>`; }).join('');
  return `
  <section class="card" aria-label="Audit runs">
    <div class="filters" role="search">
      <div class="f-init"><label for="fInit" class="vh">Engineer initials</label><input id="fInit" maxlength="5" value="${esc(f.initials)}" placeholder="Engineer" autocomplete="off" style="text-transform:uppercase"></div>
      <div class="f-status"><label for="fStatus" class="vh">Status</label><select id="fStatus">${['all', 'Passed', 'Deviation', 'Failed'].map(v => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${v === 'all' ? 'All statuses' : v}</option>`).join('')}</select></div>
      <div class="f-sop"><label for="fSop" class="vh">SOP</label><select id="fSop"><option value="all">All SOPs</option>${st.sops.map(s => `<option value="${esc(s.id)}" ${f.sopId === s.id ? 'selected' : ''}>${esc(s.code)}</option>`).join('')}</select></div>
    </div>
    <p class="muted" aria-live="polite" style="margin-bottom:var(--space-3)">${f.total != null ? f.total + ' matching runs' : f.items.length + ' loaded'} · indexed query ${f.ms} ms</p>
    ${rows ? `<div class="tbl-wrap"><table class="tbl"><caption class="vh">SOP audit runs, newest first</caption><thead><tr><th scope="col">Status</th><th scope="col">SOP</th><th scope="col">Engineer</th><th scope="col">Date &amp; time</th><th scope="col">Score</th><th scope="col"><span class="vh">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : empty(ICON.log, 'No runs match', 'Adjust the filters, or complete a SOP check-off to create an audit record.', '<button class="btn ghost" data-act="clearaudit">Reset filters</button><a class="btn" href="#/sops">Open SOP Tracker</a>')}
    ${f.done ? '' : '<div class="row center" style="margin-top:var(--space-3)"><button class="btn ghost" data-act="auditmore">Load more</button></div>'}
  </section>
  <section class="card" style="margin-top:var(--space-4)"><h2>System audit trail</h2>
    ${f.events.length ? `<ul class="list">${f.events.map(e => `<li><span>${esc(e.action)}<br><span class="muted">${esc(e.detail)}${e.actor ? ' · ' + esc(e.actor) : ''}</span></span><span class="muted">${fdt(e.ts)}</span></li>`).join('')}</ul>` : '<p class="muted">No events recorded yet.</p>'}
  </section>`;
}

async function vStorage() {
  const [i, t, oc, ep] = await Promise.all([storageInfo(), DB.totals(), DB.outboxCounts(), DB.getMeta('syncEndpoint')]);
  const pct = i.pct < 0.1 ? '<0.1' : i.pct.toFixed(1);
  return `
  <section class="grid storage-grid">
    <article class="card"><h2>Local storage telemetry</h2>
      ${i.supported ? `<div class="meter-head"><span class="meter-pct ${i.warn ? 'bad' : ''}">${pct}%</span><span class="muted">of ${fmt(i.quota)} quota used</span></div>
      <div class="segbar ${i.warn ? 'bad' : i.pct > 60 ? 'warn' : ''}" role="progressbar" aria-label="Storage used" aria-valuenow="${i.pct.toFixed(2)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, Math.max(i.pct, 2))}%"></i></div>
      <div class="hb-legend"><span><i class="sw"></i>Used ${fmt(i.usage)}</span><span><i class="sw rest"></i>Remaining ${fmt(Math.max(0, i.quota - i.usage))}</span></div>
      <ul class="list" style="margin-top:var(--space-3)">
        <li><span>Persistent storage</span><b class="${i.persisted ? 'ok' : 'warn'}">${i.persisted ? 'Granted' : 'Not granted'}</b></li>
        <li><span>SOPs / Kaizens / Runs</span><b>${t.sops} / ${t.kaizens} / ${t.runs}</b></li>
        <li><span>Evidence photos / Audit events</span><b>${t.evidence} / ${t.audit}</b></li>
        <li><span>Forecast growth</span><b>${fmt(i.perYear)} per year</b></li>
        <li><span>Capacity remaining</span><b class="${i.enough ? 'ok' : 'bad'}">${i.years >= 99 ? '99+' : i.years.toFixed(1)} years</b></li></ul>
      <p class="muted" style="margin-top:var(--space-2)">Basis: ${esc(i.basis)}. ${i.enough ? 'Comfortably covers 3 years of retention.' : 'Below 3 years. Export a backup and clear old data.'}${i.warn ? ' Quota is above 80%.' : ''}</p>
      ${i.persisted ? '' : `<button class="btn" data-act="persist" style="margin-top:var(--space-3)">${ICO.shield} Request persistent storage</button>`}`
      : '<p class="muted">Storage estimates are not supported by this browser.</p>'}
    </article>
    <article class="card"><h2>Backup, restore &amp; reports</h2>
      <p class="muted">Data stays on this device. Export a backup to move it to another workstation or keep a long-term archive.</p>
      <div class="row" style="margin-top:var(--space-3)"><button class="btn" id="expJson">${ICO.down} Full backup (JSON)</button></div>
      <div class="row" style="margin-top:var(--space-2)">
        <button class="btn soft" id="impJson">${ICO.up} Import backup</button>
        <button class="btn soft" id="expSop">${ICO.sheet} SOP audit (CSV)</button>
        <button class="btn soft" id="expKz">${ICO.sheet} Kaizen review (CSV)</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" class="vh" tabindex="-1" aria-hidden="true">
      <label style="display:flex;gap:var(--space-2);align-items:center"><input type="checkbox" id="replace"> Replace existing data on import (otherwise merge)</label>
    </article>
    <article class="card"><h2>Offline sync queue</h2>
      <p class="muted">Every SOP run and Kaizen change is queued in an IndexedDB outbox and delivered by Background Sync when the device reconnects. Set an HTTPS endpoint that accepts JSON POSTs (CORS enabled).</p>
      <ul class="list" style="margin-top:var(--space-2)"><li><span>Pending</span><b>${oc.pending}</b></li><li><span>Rejected by server</span><b class="${oc.rejected ? 'bad' : ''}">${oc.rejected}</b></li></ul>
      <label for="ep">Sync endpoint URL</label><input id="ep" type="url" inputmode="url" placeholder="https://example.org/api/kaizen-sync" value="${esc(ep || '')}">
      <div class="row" style="margin-top:var(--space-3)"><button class="btn" data-act="syncnow">${ICO.sync} Sync now</button><button class="btn soft" data-act="saveep">Save endpoint</button>${oc.rejected ? '<button class="btn ghost" data-act="requeue">Retry rejected</button>' : ''}</div>
    </article>
    <article class="card"><h2>Scale test &amp; maintenance</h2>
      <p class="muted">Generate 3,000 synthetic audit runs spread over 3 years to confirm the indexed queries stay fast.</p>
      <div class="row" style="margin-top:var(--space-3)"><button class="btn ghost" data-act="stress">Generate 3,000 test runs</button><button class="btn ghost" data-act="unstress">Remove test runs</button></div>
      <p class="muted" id="stressMsg" aria-live="polite" style="margin-top:var(--space-2)"></p>
      <hr style="border:0;border-top:1px solid var(--border);margin:var(--space-4) 0">
      <div class="row"><button class="btn ghost" data-act="tour">Replay guided tour</button><button class="btn danger" data-act="reset">Erase all data</button></div>
    </article>
  </section>`;
}

/* ---------------- modals ---------------- */
function openModal(title, body, footer) {
  modal.onchange = null; modal.oninput = null; modal.onclick = null;
  modal.innerHTML = `<div class="mh"><h2 id="modalTitle">${esc(title)}</h2><button class="btn ghost icon" data-close aria-label="Close">&times;</button></div><div class="mb">${body}</div><div class="mf">${footer}</div>`;
  if (!modal.open) modal.showModal();
}
modal.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === modal) modal.close(); });

async function toDataUrl(file, max = 800, q = 0.72) {
  const img = 'createImageBitmap' in window ? await createImageBitmap(file)
    : await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

function runModal(sop) {
  const steps = sop.steps.map((s, i) => `<fieldset class="step" id="st${i}"><legend class="muted">Step ${i + 1} of ${sop.steps.length}</legend><p class="t">${esc(s.text)}</p>${s.detail ? `<p class="muted">${esc(s.detail)}</p>` : ''}
    <div class="seg" role="radiogroup" aria-label="Result for step ${i + 1}">
      <label><input type="radio" name="r${i}" value="pass"><span class="p">Pass</span></label>
      <label><input type="radio" name="r${i}" value="fail"><span class="f">Fail</span></label>
      <label><input type="radio" name="r${i}" value="na"><span class="n">N/A</span></label></div>
    <div class="stamp" id="ts${i}">Not recorded</div>
    <details class="evd"><summary>Field evidence (note and photo)</summary>
      <label for="n${i}">Note</label><textarea id="n${i}" rows="2" data-note="${i}" placeholder="Readings, tag numbers, observations"></textarea>
      <div class="row" style="margin-top:var(--space-2)"><label class="btn ghost small filebtn" style="margin:0">Attach photo<input type="file" class="vh" accept="image/*" capture="environment" data-photo="${i}"></label><button type="button" class="btn ghost small" data-rmphoto="${i}" hidden>Remove photo</button></div>
      <img class="evi" id="pv${i}" alt="Evidence preview for step ${i + 1}" hidden></details></fieldset>`).join('');
  openModal(sop.title, `<p class="muted">${esc(sop.code)} · Rev ${esc(sop.rev)}</p>
    <label for="eng">Engineer initials</label><input id="eng" maxlength="5" autocomplete="off" placeholder="e.g. AR" style="text-transform:uppercase">${steps}
    <label for="note">Deviation / remarks</label><textarea id="note" placeholder="Record any field deviation to raise as a Kaizen"></textarea>
    <p class="muted" id="live" style="margin-top:var(--space-3)" aria-live="polite">Adherence: --</p>`,
    '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="saveRun">Save audit run</button>');
  const times = {}, ev = {};
  const calc = () => {
    let p = 0, f = 0, n = 0;
    sop.steps.forEach((_, i) => { const v = $(`input[name=r${i}]:checked`, modal); if (!v) return; v.value === 'pass' ? p++ : v.value === 'fail' ? f++ : n++; });
    $('#live', modal).textContent = `Adherence: ${p + f ? Math.round(p / (p + f) * 100) + '%' : '--'} (${p} pass, ${f} fail, ${n} N/A, ${sop.steps.length - p - f - n} pending)`;
    return { p, f, n };
  };
  modal.onchange = async e => {
    const el = e.target;
    const m = /^r(\d+)$/.exec(el.name || '');
    if (m) {
      const i = +m[1]; times[i] = new Date().toISOString();
      $('#ts' + i, modal).textContent = 'Recorded ' + fdt(times[i]);
      $('#st' + i, modal).className = 'step ' + (el.value === 'pass' ? 'pass' : el.value === 'fail' ? 'fail' : '');
      calc(); return;
    }
    if (el.dataset.photo !== undefined && el.files[0]) {
      const i = +el.dataset.photo;
      try {
        const dataUrl = await toDataUrl(el.files[0]);
        ev[i] = Object.assign(ev[i] || {}, { dataUrl, name: el.files[0].name || 'photo.jpg', size: Math.round(dataUrl.length * 0.75) });
        const pv = $('#pv' + i, modal); pv.src = dataUrl; pv.hidden = false;
        $(`[data-rmphoto="${i}"]`, modal).hidden = false;
      } catch (_) { toast('Could not read that image'); }
    }
  };
  modal.oninput = e => { if (e.target.dataset.note !== undefined) { const i = +e.target.dataset.note; ev[i] = Object.assign(ev[i] || {}, { note: e.target.value }); } };
  modal.onclick = e => {
    const b = e.target.closest('[data-rmphoto]'); if (!b) return;
    const i = +b.dataset.rmphoto; if (ev[i]) { delete ev[i].dataUrl; } $('#pv' + i, modal).hidden = true; b.hidden = true;
  };
  $('#saveRun', modal).onclick = async () => {
    const ini = $('#eng', modal).value.trim().toUpperCase();
    if (!ini) { toast('Enter engineer initials'); $('#eng', modal).focus(); return; }
    const c = calc();
    if (c.p + c.f + c.n < sop.steps.length) { toast('Complete every step before saving'); return; }
    const runId = DB.uid(), evidence = [];
    const results = sop.steps.map((s, i) => {
      const e = ev[i] || {}, entry = { r: $(`input[name=r${i}]:checked`, modal).value, t: times[i], n: (e.note || '').trim(), p: null };
      if (e.dataUrl) { entry.p = DB.uid(); evidence.push({ id: entry.p, runId, sopId: sop.id, stepIndex: i, ts: times[i], name: e.name, type: 'image/jpeg', size: e.size, dataUrl: e.dataUrl }); }
      return entry;
    });
    const run = { id: runId, sopId: sop.id, sopRev: sop.rev, initials: ini, ts: new Date().toISOString(), total: sop.steps.length, pass: c.p, fail: c.f, na: c.n,
      score: c.p + c.f ? Math.round(c.p / (c.p + c.f) * 100) : 100, status: '', results, note: $('#note', modal).value.trim() };
    run.status = DB.statusOf(run.score);
    try {
      await DB.commit({ puts: { runs: [run], evidence }, outbox: [{ type: 'sop-run', payload: { run, evidence } }], audit: [{ action: 'run.saved', ref: run.id, detail: `${sop.code} ${run.score}% ${run.status}`, actor: ini }] });
    } catch (err) { toast('Save failed: ' + err.message); return; }
    modal.close(); await load(); await render(); toast('Audit run saved');
    if (c.f > 0 && confirm('Failed steps were recorded. Raise a Kaizen from this deviation?')) {
      const bad = results.map((x, i) => x.r === 'fail' ? `Step ${i + 1}: ${sop.steps[i].text}${x.n ? ' (' + x.n + ')' : ''}` : '').filter(Boolean).join('\n');
      kzModal(null, { title: 'Deviation on ' + sop.code, problem: bad + (run.note ? '\n' + run.note : ''), waste: 'Defects', priority: 'High', owner: ini });
    }
  };
}

async function histModal(sop) {
  const range = DB.range(sop.id, ''); let offset = 0;
  const total = await DB.countIndex('runs', 'sop_ts', range);
  const li = r => `<li><button data-detail="${esc(r.id)}"><span>${fdt(r.ts)} · ${esc(r.initials)}<br><span class="muted">${r.pass} pass, ${r.fail} fail, ${r.na} N/A${r.note ? ' · ' + esc(r.note) : ''}</span></span><b class="${scoreCls(r.score)}">${r.score}%</b></button></li>`;
  const first = await DB.page('runs', { index: 'sop_ts', range, limit: 20 }); offset = first.items.length;
  openModal('History: ' + sop.title, `<p class="muted">${total} recorded runs</p><ul class="list" id="hl">${first.items.map(li).join('') || '<li><span class="muted">No runs yet. Start a check-off from the SOP card.</span></li>'}</ul>${total > offset ? '<div class="row center" style="margin-top:var(--space-3)"><button class="btn ghost" id="hmore">Load more</button></div>' : ''}`, '<button class="btn ghost" data-close>Close</button>');
  const more = $('#hmore', modal);
  if (more) more.onclick = async () => {
    const r = await DB.page('runs', { index: 'sop_ts', range, limit: 20, offset });
    $('#hl', modal).insertAdjacentHTML('beforeend', r.items.map(li).join('')); offset += r.items.length;
    if (offset >= total || !r.items.length) more.remove();
  };
}

async function runDetail(id) {
  const r = await DB.get('runs', id); if (!r) return;
  const sop = sopOf(r.sopId), evs = await DB.evidenceFor(id), byId = Object.fromEntries(evs.map(e => [e.id, e]));
  const label = { pass: 'Pass', fail: 'Fail', na: 'N/A' };
  openModal(sop ? sop.title : r.sopId, `<p class="muted">${esc(sop ? sop.code : '')} Rev ${esc(r.sopRev || '')} · ${fdt(r.ts)} · Initials ${esc(r.initials)}</p>
    <p style="margin-top:var(--space-2)"><span class="badge ${stat(r)}">${stat(r)}</span> <b class="${scoreCls(r.score)}">${r.score}%</b> <span class="muted">${r.pass} pass, ${r.fail} fail, ${r.na} N/A</span></p>
    ${(r.results || []).map((x, i) => `<div class="step ${x.r === 'pass' ? 'pass' : x.r === 'fail' ? 'fail' : ''}"><p class="t">${i + 1}. ${esc(sop && sop.steps[i] ? sop.steps[i].text : 'Step ' + (i + 1))}</p>
      <p><b class="${x.r === 'pass' ? 'ok' : x.r === 'fail' ? 'bad' : ''}">${label[x.r] || x.r}</b> <span class="stamp">${fdt(x.t)}</span></p>
      ${x.n ? `<p class="muted">Note: ${esc(x.n)}</p>` : ''}${x.p && byId[x.p] ? `<img class="evi" src="${esc(byId[x.p].dataUrl)}" alt="Evidence photo for step ${i + 1}">` : ''}</div>`).join('')}
    ${r.note ? `<p class="muted" style="margin-top:var(--space-3)">Remarks: ${esc(r.note)}</p>` : ''}`, '<button class="btn ghost" data-close>Close</button>');
}

function sopModal() {
  openModal('New SOP', `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 var(--space-3)">
      <div><label for="sc">Code</label><input id="sc" placeholder="SOP-XXX-001"></div>
      <div><label for="sr">Revision</label><input id="sr" value="A"></div>
      <div><label for="sg">Category</label><input id="sg" placeholder="Field Instrumentation"></div>
      <div><label for="so">Owner</label><input id="so"></div></div>
    <label for="stt">Title</label><input id="stt">
    <label for="ssm">Summary</label><textarea id="ssm"></textarea>
    <label for="sst">Steps (one per line)</label><textarea id="sst" rows="6" placeholder="Isolate the instrument&#10;Record as-found values"></textarea>`,
    '<button class="btn ghost" data-close>Cancel</button><button class="btn" id="ssave">Save SOP</button>');
  $('#ssave', modal).onclick = async () => {
    const title = $('#stt', modal).value.trim(), steps = $('#sst', modal).value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!title || !steps.length) { toast('Title and at least one step are required'); return; }
    const sop = { id: DB.uid(), code: $('#sc', modal).value.trim() || 'SOP-NEW', title, category: $('#sg', modal).value.trim() || 'General', rev: $('#sr', modal).value.trim() || 'A', owner: $('#so', modal).value.trim(),
      summary: $('#ssm', modal).value.trim(), steps: steps.map(t => ({ text: t, detail: '' })), updated: new Date().toISOString() };
    await DB.commit({ puts: { sops: [sop] }, outbox: [{ type: 'sop-upsert', payload: sop }], audit: [{ action: 'sop.created', ref: sop.id, detail: sop.code }] });
    modal.close(); await load(); await render(); toast('SOP created');
  };
}

function kzModal(k, prefill) {
  const isNew = !k;
  k = k || Object.assign({ id: DB.uid(), title: '', stage: 'Plan', priority: 'Medium', waste: 'Waiting', owner: '', problem: '', whys: ['', '', '', '', ''], countermeasure: '', minutesSaved: 0, incidentReduction: 0, created: new Date().toISOString() }, prefill || {});
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
    const nk = { ...k, title, stage: $('#ks', modal).value, priority: $('#kp', modal).value, waste: $('#kw', modal).value, owner: $('#ko', modal).value.trim(),
      problem: $('#kpr', modal).value.trim(), whys: [...modal.querySelectorAll('.why')].map(i => i.value.trim()), countermeasure: $('#kc', modal).value.trim(),
      minutesSaved: Math.max(0, +$('#km', modal).value || 0), incidentReduction: Math.min(100, Math.max(0, +$('#ki', modal).value || 0)), updated: new Date().toISOString() };
    await DB.commit({ puts: { kaizens: [nk] }, outbox: [{ type: 'kaizen-upsert', payload: nk }], audit: [{ action: isNew ? 'kaizen.created' : 'kaizen.updated', ref: nk.id, detail: nk.title + ' [' + nk.stage + ']', actor: nk.owner }] });
    modal.close(); await load(); await render(); toast('Kaizen saved');
  };
  const del = $('#kdel', modal);
  if (del) del.onclick = async () => {
    if (!confirm('Delete this Kaizen permanently?')) return;
    await DB.commit({ dels: { kaizens: [k.id] }, outbox: [{ type: 'kaizen-delete', payload: { id: k.id } }], audit: [{ action: 'kaizen.deleted', ref: k.id, detail: k.title }] });
    modal.close(); await load(); await render(); toast('Deleted');
  };
}

/* ---------------- export helpers ---------------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
const csv = rows => rows.map(r => r.map(c => { let s = String(c ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
const stamp = () => new Date().toISOString().slice(0, 10);

/* ---------------- storage tab actions ---------------- */
function bindStorage() {
  $('#expJson').onclick = async () => {
    download(`workflow-kaizen-backup-${stamp()}.json`, JSON.stringify(await DB.exportAll()), 'application/json');
    await DB.commit({ audit: [{ action: 'export.json', detail: 'Full backup exported' }] }); toast('Backup exported');
  };
  $('#impJson').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const n = await DB.importAll(JSON.parse(await f.text()), { merge: !$('#replace').checked });
      await DB.commit({ audit: [{ action: 'import.json', detail: n + ' records from ' + f.name }] });
      await load(); await render(); toast(`Imported ${n} records`);
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  };
  $('#expSop').onclick = async () => {
    const runs = await DB.all('runs'); runs.sort((a, b) => a.ts < b.ts ? -1 : 1);
    const evs = await DB.all('evidence'); const hasPhoto = new Set(evs.map(e => e.id));
    const rows = [['Run ID', 'Run Timestamp', 'SOP Code', 'SOP Title', 'SOP Rev', 'Initials', 'Status', 'Adherence %', 'Step #', 'Step', 'Result', 'Step Timestamp', 'Evidence Note', 'Photo Attached', 'Run Remarks']];
    runs.forEach(r => { const s = sopOf(r.sopId) || {};
      (r.results && r.results.length ? r.results : [null]).forEach((x, i) => rows.push([r.id, r.ts, s.code, s.title, r.sopRev, r.initials, stat(r), r.score, x ? i + 1 : '', x && s.steps && s.steps[i] ? s.steps[i].text : '', x ? x.r : '', x ? x.t : '', x ? x.n : '', x && x.p && hasPhoto.has(x.p) ? 'Yes' : 'No', i === 0 ? r.note : ''])); });
    download(`sop-audit-${stamp()}.csv`, '\ufeff' + csv(rows), 'text/csv'); await DB.commit({ audit: [{ action: 'export.csv', detail: 'SOP audit CSV, ' + runs.length + ' runs' }] }); toast('SOP audit CSV exported');
  };
  $('#expKz').onclick = () => {
    const rows = [['ID', 'Title', 'Stage', 'Priority', 'Waste', 'Owner', 'Problem', 'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5', 'Countermeasure', 'Minutes Saved', 'Incident Reduction %', 'Created', 'Updated']];
    st.kaizens.forEach(k => rows.push([k.id, k.title, k.stage, k.priority, k.waste, k.owner, k.problem, ...k.whys, k.countermeasure, k.minutesSaved, k.incidentReduction, k.created, k.updated]));
    download(`kaizen-review-${stamp()}.csv`, '\ufeff' + csv(rows), 'text/csv'); toast('Kaizen CSV exported');
  };
}

/* ---------------- guided tour ---------------- */
const TOUR = [
  { tab: 'dashboard', sel: '.kpis', t: 'Live KPIs', x: 'SOP adherence, active Kaizens, cycle time saved and incident reduction update as you record work.' },
  { tab: 'sops', sel: '.sop-card, .empty', t: 'SOP check-offs', x: 'Start a check-off, mark each step Pass, Fail or N/A, and attach a note or photo as field evidence. Each step is timestamped.' },
  { tab: 'kaizen', sel: '.board, .empty', t: 'PDCA Kaizen board', x: 'Move improvements through Plan, Do, Check and Act. Open a card for the 5-Whys and measurable impact.' },
  { tab: 'audit', sel: '.filters', t: 'Audit trail', x: 'Filter every run by initials, status or SOP. Indexed queries keep 3,000+ records fast.' },
  { tab: 'storage', sel: '#expJson', t: 'Your data, your device', x: 'Back up to JSON, export CSV audits, and watch storage forecasts. Offline changes queue for Background Sync.' }
];
let tourEl = null;
function endTour() { if (tourEl) tourEl.classList.remove('tour-hl'); tourEl = null; $('#tour').hidden = true; DB.setMeta('tourDone', true); }
async function go(tab) {
  if (currentTab() !== tab) { location.hash = '#/' + tab; await new Promise(r => addEventListener('hashchange', r, { once: true })); }
  await renderP;
}
async function startTour(i = 0) {
  if (i >= TOUR.length) { endTour(); toast('Tour complete. Replay it any time from the ? button.'); return; }
  const s = TOUR[i]; await go(s.tab);
  if (tourEl) tourEl.classList.remove('tour-hl');
  tourEl = $(s.sel); if (tourEl) { tourEl.classList.add('tour-hl'); tourEl.scrollIntoView?.({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  const t = $('#tour'); t.hidden = false;
  t.innerHTML = `<div class="dots">Step ${i + 1} of ${TOUR.length}</div><h2>${esc(s.t)}</h2><p class="muted">${esc(s.x)}</p>
    <div class="row"><button class="btn ghost" data-tour="skip">Skip</button><span class="row"><button class="btn ghost" data-tour="back" ${i === 0 ? 'disabled' : ''}>Back</button><button class="btn" data-tour="next">${i === TOUR.length - 1 ? 'Finish' : 'Next'}</button></span></div>`;
  t.onclick = e => { const b = e.target.closest('[data-tour]'); if (!b) return; b.dataset.tour === 'skip' ? endTour() : startTour(i + (b.dataset.tour === 'back' ? -1 : 1)); };
  $('[data-tour=next]', t).focus();
}
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#tour').hidden && !modal.open) endTour(); });

/* ---------------- router, render, events ---------------- */
const currentTab = () => { const t = (location.hash.match(/^#\/(\w+)/) || [])[1]; return TABS.includes(t) ? t : 'dashboard'; };
let lastTab = null, renderId = 0, renderP = Promise.resolve();
function syncTabs(tab) {
  document.querySelectorAll('.tabs a').forEach(a => {
    const on = a.dataset.tab === tab;
    a.setAttribute('aria-selected', String(on));
    if (on) { a.setAttribute('aria-current', 'page'); a.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } else a.removeAttribute('aria-current');
  });
}

async function render() {
  const id = ++renderId, tab = currentTab();
  syncTabs(tab);
  if (tab !== lastTab) { view.setAttribute('aria-busy', 'true'); view.innerHTML = skeleton(tab); if (tab === 'audit') st.audit.dirty = true; }
  lastTab = tab;
  let html;
  try { html = tab === 'sops' ? vSops() : tab === 'kaizen' ? vKaizen() : tab === 'audit' ? await vAudit() : tab === 'storage' ? await vStorage() : vDashboard(); }
  catch (err) { html = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(err.message)}</p></div>`; }
  if (id !== renderId) return;
  view.innerHTML = html; view.removeAttribute('aria-busy');
  const q = $('#q'); if (q) q.oninput = e => keepFocus('q', () => { st.q = e.target.value; });
  if (tab === 'audit') {
    const f = st.audit;
    $('#fInit').oninput = e => { clearTimeout(f.t); f.t = setTimeout(() => keepFocus('fInit', () => { f.initials = e.target.value.trim().toUpperCase(); f.dirty = true; }), 250); };
    $('#fStatus').onchange = e => { f.status = e.target.value; f.dirty = true; render(); };
    $('#fSop').onchange = e => { f.sopId = e.target.value; f.dirty = true; render(); };
  }
  if (tab === 'storage') bindStorage();
}
function keepFocus(id, mutate) {
  const el = $('#' + id), pos = el ? el.selectionStart : 0; mutate();
  return render().then(() => { const n = $('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } });
}

async function updateChip() {
  const chip = $('#netChip'), c = await DB.outboxCounts(), on = navigator.onLine;
  $('#netTxt').textContent = !on ? 'Offline' + (c.pending ? ` · ${c.pending} queued` : '') : c.pending ? `${c.pending} queued` : 'Online';
  chip.dataset.state = !on ? 'offline' : c.pending ? 'queued' : 'online';
  chip.dataset.pending = c.pending ? '1' : '0';
  chip.title = !on ? 'Offline. Changes are saved locally and sync when you reconnect.' : c.pending ? 'Online. Queued changes are syncing in the background.' : 'Online. All changes are stored locally and nothing is waiting to sync.';
  try {
    const i = await storageInfo(), sc = $('#storeChip');
    $('#storeTxt').textContent = i.supported ? fmt(i.usage) : 'n/a';
    sc.dataset.state = i.persisted ? 'ok' : 'warn';
    sc.title = i.supported ? `Storage ${i.persisted ? 'persistent' : 'not yet persistent'}: ${fmt(i.usage)} of ${fmt(i.quota)} used` : 'Storage estimates unavailable';
  } catch (_) { /* storage chip is informational */ }
}

function onOutbox(m) {
  if (m.sent > 0) toast(`Synced ${m.sent} queued item${m.sent > 1 ? 's' : ''}`);
  updateChip(); if (currentTab() === 'storage') render();
}

view.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.run) return runModal(sopOf(d.run));
  if (d.hist) return histModal(sopOf(d.hist));
  if (d.detail) return runDetail(d.detail);
  if (d.open) return kzModal(st.kaizens.find(k => k.id === d.open));
  if (d.mv) {
    const k = st.kaizens.find(x => x.id === d.mv), i = STAGES.indexOf(k.stage) + +d.d; if (i < 0 || i > 3) return;
    const nk = { ...k, stage: STAGES[i], updated: new Date().toISOString() };
    await DB.commit({ puts: { kaizens: [nk] }, outbox: [{ type: 'kaizen-upsert', payload: nk }], audit: [{ action: 'kaizen.moved', ref: k.id, detail: `${k.title}: ${k.stage} to ${nk.stage}`, actor: k.owner }] });
    await load(); await render(); return toast('Moved to ' + nk.stage);
  }
  switch (d.act) {
    case 'newsop': return sopModal();
    case 'newkz': return kzModal(null);
    case 'clearq': st.q = ''; return render();
    case 'clearaudit': Object.assign(st.audit, { initials: '', status: 'all', sopId: 'all', dirty: true }); return render();
    case 'auditmore': await auditMore(false); return render();
    case 'samplesops': await DB.commit({ puts: { sops: SOPS.map(s => ({ ...s, updated: new Date().toISOString() })) }, audit: [{ action: 'sample.sops' }] }); await load(); await render(); return toast('Sample SOPs loaded');
    case 'samplekz': await DB.commit({ puts: { kaizens: KAIZENS }, audit: [{ action: 'sample.kaizens' }] }); await load(); await render(); return toast('Sample Kaizens loaded');
    case 'persist': toast((await requestPersist()) ? 'Persistent storage granted' : 'The browser declined persistence. Installing the app or bookmarking it can help.'); return render();
    case 'saveep': {
      const v = $('#ep').value.trim();
      if (v && !/^https?:\/\//i.test(v)) return toast('Endpoint must start with http:// or https://');
      await DB.setMeta('syncEndpoint', v); await DB.commit({ audit: [{ action: 'sync.endpoint', detail: v || '(cleared)' }] });
      toast(v ? 'Endpoint saved' : 'Endpoint cleared'); if (v && navigator.onLine) flushNow(); return;
    }
    case 'syncnow': if (!(await DB.getMeta('syncEndpoint'))) return toast('Set a sync endpoint first'); if (!navigator.onLine) return toast('Offline. Items sync automatically when reconnected.'); await flushNow(); return toast('Sync requested');
    case 'requeue': toast(`${await DB.requeueRejected()} items re-queued`); await flushNow(); return render();
    case 'stress': {
      b.disabled = true; const msg = $('#stressMsg'), t0 = performance.now();
      try { await DB.generateStress(3000, (n, tot) => { msg.textContent = `Writing ${n} / ${tot}`; }); } finally { b.disabled = false; }
      const t1 = performance.now(); await load(); await auditMore(true);
      msg.textContent = `3,000 runs written in ${Math.round(t1 - t0)} ms. Indexed first-page query: ${st.audit.ms} ms.`; st.audit.dirty = true; return toast('Test runs generated');
    }
    case 'unstress': { const n = await DB.deleteStress(); await load(); await render(); return toast(`${n} test runs removed`); }
    case 'tour': return startTour(0);
    case 'reset':
      if (!confirm('Erase ALL SOPs, Kaizens, evidence and audit runs from this device? Export a backup first.')) return;
      await DB.eraseAll(); await DB.setMeta('seeded', true); await load(); await render(); updateChip(); return toast('All data erased');
  }
});
view.addEventListener('change', e => { if (e.target.id === 'prio') { st.prio = e.target.value; render(); } });

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0b1220' : '#f3f6fb';
  try { localStorage.setItem('wkh-theme', t); } catch (_) {}
}
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$('#tourBtn').onclick = () => startTour(0);
let savedTheme = null; try { savedTheme = localStorage.getItem('wkh-theme'); } catch (_) {}
setTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
addEventListener('hashchange', () => { syncTabs(currentTab()); st.q = ''; renderP = render(); view.focus(); });
$('.tabs').addEventListener('click', e => { const a = e.target.closest('a[data-tab]'); if (a) syncTabs(a.dataset.tab); });   // instant feedback, before the hash event
addEventListener('pageshow', () => syncTabs(currentTab()));                                                          // back/forward cache restore

(async function boot() {
  initPWA({ onToast: toast, onOutbox, onNet: updateChip });
  view.innerHTML = skeleton('dashboard');
  try { await ensureSeed(); await load(); }
  catch (err) { view.innerHTML = `<div class="card"><h2>Storage unavailable</h2><p class="muted">IndexedDB failed to open: ${esc(err.message)}. Private browsing may block local storage.</p></div>`; return; }
  renderP = render(); await renderP; updateChip();
  snapshotUsage().then(async () => { const i = await storageInfo(); if (i.warn) toast('Storage is above 80% of quota. Export a backup.'); }).catch(() => {});
  if (!(await DB.getMeta('tourDone'))) setTimeout(() => startTour(0), 700);
})();
