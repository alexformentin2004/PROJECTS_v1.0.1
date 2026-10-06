class FakeObjectStoreNames {
  constructor(db) { this.db = db; }
  contains(name) { return this.db.stores.has(name); }
}
class FakeRequest {
  constructor(executor) {
    this.result = undefined;
    this.error = null;
    queueMicrotask(() => {
      try { this.result = executor(); this.onsuccess?.({ target: this }); }
      catch (error) { this.error = error; this.onerror?.({ target: this }); }
    });
  }
}
class FakeStore {
  constructor(map) { this.map = map; }
  createIndex() { return null; }
  get(id) { return new FakeRequest(() => structuredClone(this.map.get(id))); }
  put(value) { return new FakeRequest(() => { this.map.set(value.id, structuredClone(value)); return value.id; }); }
  delete(id) { return new FakeRequest(() => { this.map.delete(id); }); }
  getAll() { return new FakeRequest(() => [...this.map.values()].map(value => structuredClone(value))); }
  count() { return new FakeRequest(() => this.map.size); }
}
class FakeDB {
  constructor() { this.stores = new Map(); this.objectStoreNames = new FakeObjectStoreNames(this); }
  createObjectStore(name) { const map = new Map(); this.stores.set(name, map); return new FakeStore(map); }
  transaction(name) {
    const key = Array.isArray(name) ? name[0] : name;
    if (!this.stores.has(key)) throw new Error(`Missing store ${key}`);
    return { objectStore: storeName => new FakeStore(this.stores.get(storeName || key)) };
  }
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

function assert(condition, message) { if (!condition) throw new Error(message); }

const { initializeDatabase, putRecord } = await import('../js/db.js');
const {
  getModuleDescriptor,
  getIntegrationSnapshot,
  getGlobalBackupContribution,
  getIntegrationDiagnostics,
  parseActionTarget,
  dispatchActionTarget,
  createAlexModuleBridge
} = await import('../js/services/integration-service.js');

await initializeDatabase();
const now = '2026-10-06T08:00:00.000Z';
await putRecord('projects', { id: 'p1', title: 'PROJECTS', status: 'active', priority: 'high', progressMode: 'auto', updatedAt: now });
await putRecord('tasks', { id: 't1', projectId: 'p1', title: 'Integrare HUB', status: 'todo', priority: 'high', dueDate: '2026-10-06', dependencyIds: [], checklist: [], updatedAt: now });
await putRecord('milestones', { id: 'm1', projectId: 'p1', title: 'Integration ready', status: 'active', priority: 'high', targetDate: '2026-10-07', updatedAt: now });

const descriptor = getModuleDescriptor();
assert(descriptor.moduleId === 'projects', 'moduleId descriptor errato');
assert(descriptor.appVersion === '1.0.1', 'appVersion descriptor errata');
assert(descriptor.contracts.today === 1 && descriptor.contracts.globalBackup === 1, 'Contract version mancanti');
assert(descriptor.capabilities.includes('backup.moduleContribution'), 'Capability backup mancante');

const snapshot = await getIntegrationSnapshot({ includeTodayOverview: true });
assert(snapshot.module.moduleId === 'projects', 'Snapshot modulo errato');
assert(Array.isArray(snapshot.today), 'Today non è array');
assert(snapshot.hubSummary.length >= 2 && snapshot.hubSummary.length <= 5, 'Hub Summary fuori range 2-5');
assert(snapshot.quickActions.length === 2, 'Quick actions errate');
assert(snapshot.quickActions.every(a => a.sourceModule === 'projects'), 'Quick action non normalizzata');
assert(snapshot.insights.every(i => i.sourceModule === 'projects'), 'Insight sourceModule errato');
assert(snapshot.events.every(e => e.sourceModule === 'projects'), 'Event sourceModule errato');

const diagnostics = await getIntegrationDiagnostics();
assert(Object.values(diagnostics.checks).every(Boolean), `Diagnostica contract fallita: ${JSON.stringify(diagnostics.checks)}`);

const contribution = await getGlobalBackupContribution();
assert(contribution.format === 'alex-hub-module-backup', 'Formato backup globale errato');
assert(contribution.storageKey === 'modules.projects', 'Storage key globale non namespaced');
assert(contribution.payload.moduleId === 'projects', 'Payload globale errato');
assert(contribution.payload.data.projects.length === 1, 'Backup globale non contiene i progetti');

const taskIntent = parseActionTarget('projects/project/p1/task/t1');
assert(taskIntent.valid && taskIntent.route === 'projects/project/p1/task/t1', 'Deep-link task errato');
assert(!parseActionTarget('money/action/new-task').valid, 'Target altro modulo accettato');

let dispatched = '';
const dispatchedResult = await dispatchActionTarget('projects/action/new-project', { newProject: () => { dispatched = 'new-project'; } });
assert(dispatchedResult.handled && dispatched === 'new-project', 'Dispatch quick action fallito');

const bridge = createAlexModuleBridge({ navigate: route => { dispatched = route; } });
await bridge.dispatchActionTarget('projects/project/p1');
assert(dispatched === 'projects/project/p1', 'Bridge navigation fallita');
assert(bridge.descriptor.moduleId === 'projects', 'Bridge descriptor errato');

console.log('PASS integration-layer smoke test');
console.log(JSON.stringify({
  contracts: descriptor.contracts,
  capabilities: descriptor.capabilities.length,
  today: snapshot.today.length,
  hubSummary: snapshot.hubSummary.length,
  insights: snapshot.insights.length,
  events: snapshot.events.length,
  quickActions: snapshot.quickActions.length,
  storageKey: contribution.storageKey
}));
