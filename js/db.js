const NAME = 'workflow-kaizen-hub';
const VERSION = 3;
const rng = (a, b) => IDBKeyRange.bound([a, ''], [a, '\uffff']);
const STORES = {
  sops:     { keyPath: 'id', indexes: [['category', 'category'], ['code', 'code'], ['updated', 'updated']] },
  kaizens:  { keyPath: 'id', indexes: [['stage', 'stage'], ['priority', 'priority'], ['waste', 'waste'], ['updated', 'updated']] },
  runs:     { keyPath: 'id', indexes: [['sopId', 'sopId'], ['ts', 'ts'], ['initials', 'initials'], ['status', 'status'],
              ['sop_ts', ['sopId', 'ts']], ['initials_ts', ['initials', 'ts']], ['status_ts', ['status', 'ts']]] },
  evidence: { keyPath: 'id', indexes: [['runId', 'runId'], ['sopId', 'sopId'], ['ts', 'ts']] },
  outbox:   { keyPath: 'id', indexes: [['status', 'status'], ['ts', 'ts']] },
  audit:    { keyPath: 'id', indexes: [['ts', 'ts'], ['action', 'action']] },
  meta:     { keyPath: 'key', indexes: [] }
};
let dbp = null;

const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = e => {
      const db = r.result, t = r.transaction;
      for (const [name, def] of Object.entries(STORES)) {
        const os = db.objectStoreNames.contains(name) ? t.objectStore(name) : db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [iname, path] of def.indexes) if (!os.indexNames.contains(iname)) os.createIndex(iname, path);
      }
      const runs = t.objectStore('runs');
      if (runs.indexNames.contains('engineer')) runs.deleteIndex('engineer');
      if (e.oldVersion > 0 && e.oldVersion < 3) {
        const c = runs.openCursor();
        c.onsuccess = () => {
          const cur = c.result; if (!cur) return;
          cur.update(migrateRun(cur.value));
          cur.continue();
        };
      }
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => { r.result.close(); dbp = null; };
      resolve(r.result);
    };
    r.onerror = () => { dbp = null; reject(r.error); };
    r.onblocked = () => { dbp = null; reject(new Error('Database upgrade blocked by another open tab')); };
  });
  return dbp;
}

function migrateRun(v) {
  if (v.initials === undefined) { v.initials = v.engineer || '--'; delete v.engineer; }
  if (!v.status) v.status = (v.fail || 0) > 0 ? 'Failed' : 'Passed';
  if (Array.isArray(v.results)) v.results = v.results.map(x => (x && x.result !== undefined) ? { r: x.result, t: x.ts || v.ts, n: '', p: null } : x);
  return v;
}

const mkOutbox = (type, payload) => ({ id: uid(), type, payload, ts: new Date().toISOString(), status: 'pending', attempts: 0 });
const mkAudit = a => ({ id: uid(), ts: new Date().toISOString(), action: a.action, ref: a.ref || '', detail: a.detail || '', actor: a.actor || '' });

export const DB = {
  hooks: {},
  open, uid, range: rng,

  async all(store) { const db = await open(); return req(db.transaction(store).objectStore(store).getAll()); },
  async get(store, key) { const db = await open(); return req(db.transaction(store).objectStore(store).get(key)); },
  async count(store) { const db = await open(); return req(db.transaction(store).objectStore(store).count()); },
  async countIndex(store, index, range) { const db = await open(); return req(db.transaction(store).objectStore(store).index(index).count(range || undefined)); },
  async clear(store) { const db = await open(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear(); return done(t); },
  async put(store, val) { return this.commit({ puts: { [store]: [val] } }); },
  async del(store, key) { return this.commit({ dels: { [store]: [key] } }); },
  async putMany(store, vals, chunk = 500) { for (let i = 0; i < vals.length; i += chunk) await this.commit({ puts: { [store]: vals.slice(i, i + chunk) } }); },
  async getMeta(key) { const r = await this.get('meta', key); return r ? r.value : undefined; },
  async setMeta(key, value) { return this.put('meta', { key, value }); },

  // One atomic transaction: data writes + outbox queueing + audit trail entries.
  async commit({ puts = {}, dels = {}, outbox = [], audit = [] }) {
    const names = new Set([...Object.keys(puts), ...Object.keys(dels)]);
    if (outbox.length) names.add('outbox');
    if (audit.length) names.add('audit');
    if (!names.size) return;
    const db = await open(); const t = db.transaction([...names], 'readwrite');
    for (const [s, vals] of Object.entries(puts)) vals.forEach(v => t.objectStore(s).put(v));
    for (const [s, keys] of Object.entries(dels)) keys.forEach(k => t.objectStore(s).delete(k));
    outbox.forEach(o => t.objectStore('outbox').put(mkOutbox(o.type, o.payload)));
    audit.forEach(a => t.objectStore('audit').put(mkAudit(a)));
    await done(t);
    if (outbox.length && this.hooks.outbox) this.hooks.outbox();
  },

  // Cursor-based paging on any index. `filter` is evaluated per record; `offset` counts accepted records.
  async page(store, { index = null, range = null, dir = 'prev', offset = 0, limit = 25, filter = null } = {}) {
    const db = await open(); const os = db.transaction(store).objectStore(store);
    const src = index ? os.index(index) : os;
    return new Promise((resolve, reject) => {
      const items = []; let skip = offset, jumped = false;
      const r = src.openCursor(range || undefined, dir);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return resolve({ items, done: true });
        if (!filter && offset > 0 && !jumped) { jumped = true; c.advance(offset); return; }
        if (filter) {
          if (!filter(c.value)) { c.continue(); return; }
          if (skip > 0) { skip--; c.continue(); return; }
        }
        items.push(c.value);
        if (items.length >= limit) return resolve({ items, done: false });
        c.continue();
      };
    });
  },

  async lastBySop(sopId) { const r = await this.page('runs', { index: 'sop_ts', range: rng(sopId, ''), limit: 1 }); return r.items[0] || null; },

  async runStats() {
    const db = await open(), now = Date.now();
    return new Promise((resolve, reject) => {
      const out = { count: 0, scored: 0, sum: 0, failed: 0, cur: { n: 0, s: 0, sum: 0 }, prev: { n: 0, s: 0, sum: 0 }, daily: Array.from({ length: 14 }, () => ({ n: 0, s: 0, sum: 0 })) };
      const r = db.transaction('runs').objectStore('runs').openCursor();
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const c = r.result; if (!c) return resolve(out);
        const v = c.value, scored = v.total - v.na > 0, age = Math.floor((now - Date.parse(v.ts)) / 864e5);
        out.count++;
        if (scored) { out.scored++; out.sum += v.score; }
        if (v.status === 'Failed') out.failed++;
        if (age >= 0 && age < 14) {
          const w = age < 7 ? out.cur : out.prev, d = out.daily[age];
          w.n++; d.n++;
          if (scored) { w.s++; w.sum += v.score; d.s++; d.sum += v.score; }
        }
        c.continue();
      };
    });
  },

  async evidenceFor(runId) { const db = await open(); return req(db.transaction('evidence').objectStore('evidence').index('runId').getAll(runId)); },

  async totals() {
    const o = {};
    for (const s of ['sops', 'kaizens', 'runs', 'evidence', 'outbox', 'audit']) o[s] = await this.count(s);
    o.total = o.sops + o.kaizens + o.runs + o.evidence + o.audit;
    return o;
  },

  async outboxCounts() {
    const [pending, rejected] = await Promise.all([this.countIndex('outbox', 'status', IDBKeyRange.only('pending')), this.countIndex('outbox', 'status', IDBKeyRange.only('rejected'))]);
    return { pending, rejected };
  },
  async requeueRejected() {
    const db = await open(); const t = db.transaction('outbox', 'readwrite'); const os = t.objectStore('outbox');
    const items = await req(os.index('status').getAll(IDBKeyRange.only('rejected')));
    items.forEach(i => { i.status = 'pending'; i.attempts = 0; os.put(i); });
    await done(t); return items.length;
  },

  async generateStress(n, onProgress) {
    const sops = await this.all('sops');
    const pool = sops.length ? sops : [{ id: 'sop-demo', rev: 'A', steps: [1, 2, 3, 4, 5, 6] }];
    const ini = ['AR', 'MS', 'JC', 'LT', 'RL', 'DP', 'KN', 'BG', 'HV', 'ZQ', 'OT', 'EW'];
    const now = Date.now(), span = 3 * 365 * 864e5;
    for (let i = 0; i < n; i += 500) {
      const batch = [];
      for (let j = i; j < Math.min(n, i + 500); j++) {
        const s = pool[j % pool.length], total = s.steps.length;
        const fail = Math.random() < 0.18 ? 1 + Math.floor(Math.random() * 2) : 0;
        const na = Math.random() < 0.1 ? 1 : 0;
        const pass = Math.max(0, total - fail - na);
        const ts = new Date(now - Math.random() * span).toISOString();
        batch.push({ id: 'run-stress-' + j, sopId: s.id, sopRev: s.rev, initials: ini[j % ini.length], ts, total, pass, fail, na,
          score: pass + fail ? Math.round(pass / (pass + fail) * 100) : 100, status: fail ? 'Failed' : 'Passed',
          results: Array.from({ length: total }, (_, k) => ({ r: k < fail ? 'fail' : k < fail + na ? 'na' : 'pass', t: ts, n: '', p: null })), note: 'Synthetic load-test record' });
      }
      await this.commit({ puts: { runs: batch } });
      if (onProgress) onProgress(Math.min(n, i + 500), n);
    }
  },
  async deleteStress() {
    const db = await open(); const t = db.transaction('runs', 'readwrite'); const os = t.objectStore('runs');
    const keys = await req(os.getAllKeys(IDBKeyRange.bound('run-stress-', 'run-stress-\uffff')));
    keys.forEach(k => os.delete(k)); await done(t); return keys.length;
  },

  async exportAll() {
    const data = { app: 'WorkflowKaizen Hub', schema: VERSION, exported: new Date().toISOString() };
    for (const s of ['sops', 'kaizens', 'runs', 'evidence', 'audit', 'meta']) data[s] = await this.all(s);
    return data;
  },
  async importAll(data, { merge = true } = {}) {
    if (!data || data.app !== 'WorkflowKaizen Hub') throw new Error('Not a WorkflowKaizen Hub backup file');
    const names = ['sops', 'kaizens', 'runs', 'evidence', 'audit', 'meta'];
    const db = await open(); const t = db.transaction(names, 'readwrite'); let n = 0;
    for (const s of names) {
      const os = t.objectStore(s);
      if (!merge && s !== 'meta') os.clear();
      for (let rec of (Array.isArray(data[s]) ? data[s] : [])) {
        if (!rec || rec[STORES[s].keyPath] === undefined) continue;
        if (s === 'runs') rec = migrateRun(rec);
        if (s === 'meta' && rec.key === 'syncEndpoint') continue;
        os.put(rec); n++;
      }
    }
    await done(t); return n;
  },
  async eraseAll() { for (const s of ['sops', 'kaizens', 'runs', 'evidence', 'outbox', 'audit']) await this.clear(s); }
};
