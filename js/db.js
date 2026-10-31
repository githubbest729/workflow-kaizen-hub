const NAME = 'workflow-kaizen-hub';
const VERSION = 2;
const STORES = {
  sops:    { keyPath: 'id', indexes: [['category', 'category'], ['updated', 'updated']] },
  kaizens: { keyPath: 'id', indexes: [['stage', 'stage'], ['priority', 'priority'], ['waste', 'waste'], ['updated', 'updated']] },
  runs:    { keyPath: 'id', indexes: [['sopId', 'sopId'], ['ts', 'ts']] },
  meta:    { keyPath: 'key', indexes: [] }
};
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = e => {
      const db = req.result, tx = req.transaction;
      for (const [name, def] of Object.entries(STORES)) {
        const os = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [iname, path] of def.indexes) if (!os.indexNames.contains(iname)) os.createIndex(iname, path);
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); dbp = null; };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
  });
  return dbp;
}

const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export const DB = {
  open,
  async all(store) { const db = await open(); return wrap(db.transaction(store).objectStore(store).getAll()); },
  async get(store, key) { const db = await open(); return wrap(db.transaction(store).objectStore(store).get(key)); },
  async put(store, val) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val); return txDone(tx); },
  async putMany(store, vals) { const db = await open(); const tx = db.transaction(store, 'readwrite'); vals.forEach(v => tx.objectStore(store).put(v)); return txDone(tx); },
  async del(store, key) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); return txDone(tx); },
  async count(store) { const db = await open(); return wrap(db.transaction(store).objectStore(store).count()); },
  async clear(store) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); return txDone(tx); },
  async totals() {
    const [sops, kaizens, runs] = await Promise.all(['sops', 'kaizens', 'runs'].map(s => this.count(s)));
    return { sops, kaizens, runs, total: sops + kaizens + runs };
  },
  async exportAll() {
    const data = { app: 'WorkflowKaizen Hub', schema: VERSION, exported: new Date().toISOString() };
    for (const s of ['sops', 'kaizens', 'runs', 'meta']) data[s] = await this.all(s);
    return data;
  },
  async importAll(data, { merge = true } = {}) {
    if (!data || data.app !== 'WorkflowKaizen Hub') throw new Error('Not a WorkflowKaizen Hub backup file');
    const db = await open();
    const names = ['sops', 'kaizens', 'runs', 'meta'];
    const tx = db.transaction(names, 'readwrite');
    let n = 0;
    for (const s of names) {
      const os = tx.objectStore(s);
      if (!merge) os.clear();
      for (const rec of (Array.isArray(data[s]) ? data[s] : [])) {
        if (rec && rec[STORES[s].keyPath] !== undefined) { os.put(rec); n++; }
      }
    }
    await txDone(tx);
    return n;
  },
  async getMeta(key) { const r = await this.get('meta', key); return r ? r.value : undefined; },
  async setMeta(key, value) { return this.put('meta', { key, value }); }
};
