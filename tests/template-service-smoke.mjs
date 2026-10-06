/* Smoke test Node senza dipendenze esterne: simula il sottoinsieme IndexedDB usato da PROJECTS. */
class FakeObjectStoreNames {
  constructor(db) { this.db = db; }
  contains(name) { return this.db.stores.has(name); }
}
class FakeRequest {
  constructor(executor) {
    this.result = undefined;
    this.error = null;
    queueMicrotask(() => {
      try {
        this.result = executor();
        this.onsuccess?.({ target: this });
      } catch (error) {
        this.error = error;
        this.onerror?.({ target: this });
      }
    });
  }
}
class FakeStore {
  constructor(map) { this.map = map; }
  createIndex() { return null; }
  get(id) { return new FakeRequest(() => structuredClone(this.map.get(id))); }
  put(value) { return new FakeRequest(() => { this.map.set(value.id, structuredClone(value)); return value.id; }); }
  delete(id) { return new FakeRequest(() => { this.map.delete(id); return undefined; }); }
  getAll() { return new FakeRequest(() => [...this.map.values()].map(value => structuredClone(value))); }
  count() { return new FakeRequest(() => this.map.size); }
}
class FakeDB {
  constructor() { this.stores = new Map(); this.objectStoreNames = new FakeObjectStoreNames(this); }
  createObjectStore(name) { const map = new Map(); this.stores.set(name, map); return new FakeStore(map); }
  transaction(name) {
    if (!this.stores.has(name)) throw new Error(`Missing store ${name}`);
    return { objectStore: () => new FakeStore(this.stores.get(name)) };
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

const { initializeDatabase, getAllRecords } = await import('../js/db.js');
const {
  ensureBuiltInTemplates,
  listTemplates,
  createProjectFromTemplate,
  createTemplateFromProject,
  deleteTemplate,
  addDays
} = await import('../js/services/template-service.js');
const { listTasksByProject } = await import('../js/services/task-service.js');
const { listMilestonesByProject } = await import('../js/services/milestone-service.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await initializeDatabase();
await ensureBuiltInTemplates();
let templates = await listTemplates();
assert(templates.filter(t => t.source === 'builtin').length === 6, 'Devono esistere 6 template predefiniti');

const appTemplate = templates.find(t => t.id === 'builtin.app-development');
assert(appTemplate, 'Template Sviluppo app mancante');
const project = await createProjectFromTemplate(appTemplate.id, {
  title: 'App di prova',
  startDate: '2026-10-06',
  status: 'planning',
  priority: 'high',
  tags: 'test, app',
  blocked: false
});
assert(project.templateId === appTemplate.id, 'Origine template non salvata');
assert(project.targetDate === addDays('2026-10-06', 35), 'Target progetto relativo errato');

const [tasks, milestones] = await Promise.all([
  listTasksByProject(project.id),
  listMilestonesByProject(project.id)
]);
assert(tasks.length === appTemplate.tasks.length, 'Numero task generati errato');
assert(milestones.length === appTemplate.milestones.length, 'Numero milestone generate errato');
assert(tasks.every(t => t.projectId === project.id), 'Task con projectId errato');
assert(milestones.every(m => m.projectId === project.id), 'Milestone con projectId errato');
assert(tasks.some(t => (t.dependencyIds || []).length > 0), 'Dipendenze non ricostruite');
const ids = new Set(tasks.map(t => t.id));
assert(tasks.flatMap(t => t.dependencyIds || []).every(id => ids.has(id)), 'Dipendenza verso ID esterno');
assert(tasks.every(t => !t.milestoneId || milestones.some(m => m.id === t.milestoneId)), 'Collegamento task→milestone invalido');

const custom = await createTemplateFromProject(project.id, {
  name: 'App personale',
  description: 'Smoke test',
  category: 'Test',
  icon: 'T'
});
assert(custom.source === 'custom', 'Template personale con source errata');
assert(custom.tasks.length === tasks.length, 'Template personale non conserva i task');
assert(custom.tasks.some(t => (t.dependsOnKeys || []).length > 0), 'Template personale non conserva dipendenze logiche');

const second = await createProjectFromTemplate(custom.id, {
  title: 'Seconda app',
  startDate: '2027-01-10',
  status: 'planning',
  priority: 'normal',
  blocked: false
});
const secondTasks = await listTasksByProject(second.id);
assert(second.id !== project.id, 'Il nuovo progetto riusa ID sorgente');
assert(secondTasks.every(t => !ids.has(t.id)), 'Il nuovo progetto riusa ID task sorgente');
const firstDueOffset = custom.tasks.find(t => t.offsetDays !== null)?.offsetDays;
if (firstDueOffset !== undefined) {
  const expected = addDays('2027-01-10', firstDueOffset);
  assert(secondTasks.some(t => t.dueDate === expected), 'Date relative non traslate correttamente');
}

await deleteTemplate(custom.id);
templates = await listTemplates();
assert(!templates.some(t => t.id === custom.id), 'Template personale non eliminato');
const timeline = await getAllRecords('timelineEntries');
assert(timeline.some(e => e.projectId === project.id && e.type === 'template.applied'), 'Evento template.applied mancante');

console.log('PASS template-service smoke test');
console.log(JSON.stringify({ builtinTemplates: 6, tasks: tasks.length, milestones: milestones.length, timelineEntries: timeline.length }));
