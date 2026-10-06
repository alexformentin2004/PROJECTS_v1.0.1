/* Smoke test IndexedDB senza dipendenze esterne per replace + merge atomico. */
class FakeObjectStoreNames {
  constructor(db) { this.db = db; }
  contains(name) { return this.db.stores.has(name); }
}
class FakeRequest {
  constructor(tx, executor) {
    this.result = undefined;
    this.error = null;
    tx.pending += 1;
    queueMicrotask(() => {
      try {
        this.result = executor();
        this.onsuccess?.({ target: this });
      } catch (error) {
        this.error = error;
        tx.error = error;
        this.onerror?.({ target: this });
        tx.onerror?.({ target: tx });
      } finally {
        tx.pending -= 1;
        tx.scheduleComplete();
      }
    });
  }
}
class FakeStore {
  constructor(map, tx) { this.map = map; this.tx = tx; }
  createIndex() { return null; }
  get(id) { return new FakeRequest(this.tx, () => structuredClone(this.map.get(id))); }
  put(value) { return new FakeRequest(this.tx, () => { this.map.set(value.id, structuredClone(value)); return value.id; }); }
  delete(id) { return new FakeRequest(this.tx, () => { this.map.delete(id); }); }
  getAll() { return new FakeRequest(this.tx, () => [...this.map.values()].map(v => structuredClone(v))); }
  count() { return new FakeRequest(this.tx, () => this.map.size); }
  clear() { return new FakeRequest(this.tx, () => this.map.clear()); }
}
class FakeTransaction {
  constructor(db, names) {
    this.db = db;
    this.names = Array.isArray(names) ? names : [names];
    this.pending = 0;
    this.error = null;
    this.completed = false;
  }
  objectStore(name) {
    if (!this.names.includes(name) || !this.db.stores.has(name)) throw new Error(`Missing store ${name}`);
    return new FakeStore(this.db.stores.get(name), this);
  }
  scheduleComplete() {
    queueMicrotask(() => {
      if (!this.completed && this.pending === 0 && !this.error) {
        this.completed = true;
        this.oncomplete?.({ target: this });
      }
    });
  }
}
class FakeDB {
  constructor() { this.stores = new Map(); this.objectStoreNames = new FakeObjectStoreNames(this); }
  createObjectStore(name) {
    const map = new Map();
    this.stores.set(name, map);
    const tx = { pending: 0, scheduleComplete() {} };
    return new FakeStore(map, tx);
  }
  transaction(names) { return new FakeTransaction(this, names); }
}

const fakeDb = new FakeDB();
globalThis.window = globalThis;
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = fakeDb;
      request.onupgradeneeded?.({ target: request });
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    });
    return request;
  }
};

const { initializeDatabase, putRecord, getAllRecords } = await import('../js/db.js');
const { createExportPayloadFromSnapshot, importBackup } = await import('../js/services/backup-service.js');

function assert(condition, message) { if (!condition) throw new Error(message); }
function emptySnapshot(projects = []) {
  return {
    projects,
    milestones: [], tasks: [], notes: [], references: [], timelineEntries: [], templates: [],
    settings: [{ id: 'locale', value: 'it-IT', updatedAt: '2026-10-01T00:00:00.000Z' }],
    metadata: [{ id: 'module', moduleId: 'projects', appVersion: '0.8.0', schemaVersion: 1, updatedAt: '2026-10-01T00:00:00.000Z' }]
  };
}

await initializeDatabase();
await putRecord('projects', { id: 'local-only', title: 'Da eliminare', updatedAt: '2026-10-02T00:00:00.000Z' });

const replaceBackup = createExportPayloadFromSnapshot(emptySnapshot([
  { id: 'p1', title: 'Importato', status: 'active', priority: 'normal', updatedAt: '2026-10-03T00:00:00.000Z' }
]), '2026-10-03T01:00:00.000Z');
await importBackup(replaceBackup, 'replace');
let projects = await getAllRecords('projects');
assert(projects.length === 1 && projects[0].id === 'p1', 'Replace non ha sostituito correttamente i progetti');

await putRecord('projects', { id: 'p1', title: 'Locale più recente', status: 'active', priority: 'high', updatedAt: '2026-10-05T00:00:00.000Z' });
const mergeBackup = createExportPayloadFromSnapshot(emptySnapshot([
  { id: 'p1', title: 'Import vecchio', status: 'active', priority: 'low', updatedAt: '2026-10-04T00:00:00.000Z' },
  { id: 'p2', title: 'Nuovo da import', status: 'idea', priority: 'normal', updatedAt: '2026-10-04T00:00:00.000Z' }
]), '2026-10-04T01:00:00.000Z');
await importBackup(mergeBackup, 'merge');
projects = await getAllRecords('projects');
const p1 = projects.find(p => p.id === 'p1');
const p2 = projects.find(p => p.id === 'p2');
assert(projects.length === 2, 'Merge non ha mantenuto entrambi i progetti');
assert(p1.title === 'Locale più recente', 'Merge non ha mantenuto updatedAt più recente');
assert(p2?.title === 'Nuovo da import', 'Merge non ha aggiunto il nuovo record');

console.log('PASS backup import DB smoke test');
console.log(JSON.stringify({ projects: projects.map(p => ({ id: p.id, title: p.title })) }));
