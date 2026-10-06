globalThis.window = globalThis;

const {
  createExportPayloadFromSnapshot,
  validateBackup,
  backupToStoreSnapshot,
  migrateBackup,
  backupFilename
} = await import('../js/services/backup-service.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const now = '2026-10-06T07:30:00.000Z';
const snapshot = {
  projects: [{ id: 'p1', title: 'Progetto', status: 'active', priority: 'high', updatedAt: now }],
  milestones: [{ id: 'm1', projectId: 'p1', title: 'Milestone', updatedAt: now }],
  tasks: [
    { id: 't1', projectId: 'p1', title: 'Prima', dependencyIds: [], updatedAt: now },
    { id: 't2', projectId: 'p1', milestoneId: 'm1', title: 'Seconda', dependencyIds: ['t1'], updatedAt: now }
  ],
  notes: [{ id: 'n1', projectId: 'p1', title: 'Nota', updatedAt: now }],
  references: [{ id: 'r1', projectId: 'p1', title: 'Link', updatedAt: now }],
  timelineEntries: [{ id: 'e1', projectId: 'p1', title: 'Creato', updatedAt: now }],
  templates: [{ id: 'tpl1', name: 'Template', milestones: [], tasks: [], updatedAt: now }],
  settings: [{ id: 'locale', value: 'it-IT', updatedAt: now }, { id: 'currency', value: 'EUR', updatedAt: now }],
  metadata: [{ id: 'module', moduleId: 'projects', appVersion: '1.0.1', schemaVersion: 1, updatedAt: now }]
};

const backup = createExportPayloadFromSnapshot(snapshot, now);
assert(backup.moduleId === 'projects', 'moduleId errato');
assert(backup.appVersion === '1.0.1', 'appVersion errata');
assert(backup.schemaVersion === 1, 'schemaVersion errata');
assert(backup.settings.locale === 'it-IT', 'Settings non normalizzate');
assert(backup.data.tasks.length === 2, 'Task mancanti export');
assert(backup.metadata.records.length === 1, 'Metadata store non esportato');

const valid = validateBackup(backup);
assert(valid.valid, `Backup valido respinto: ${valid.errors.join(' | ')}`);
assert(valid.summary.counts.projects === 1 && valid.summary.counts.tasks === 2, 'Conteggi backup errati');

const imported = backupToStoreSnapshot(backup);
assert(imported.projects.length === 1, 'Snapshot import progetti errato');
assert(imported.settings.some(item => item.id === 'currency' && item.value === 'EUR'), 'Settings import errate');
assert(imported.metadata.some(item => item.id === 'module'), 'Metadata import errati');

const wrongModule = structuredClone(backup);
wrongModule.moduleId = 'money';
assert(!validateBackup(wrongModule).valid, 'Modulo errato non rilevato');

const brokenRelation = structuredClone(backup);
brokenRelation.data.tasks[0].projectId = 'missing';
assert(!validateBackup(brokenRelation).valid, 'Project reference errata non rilevata');

const duplicate = structuredClone(backup);
duplicate.data.projects.push(structuredClone(duplicate.data.projects[0]));
assert(!validateBackup(duplicate).valid, 'ID duplicato non rilevato');

const cycle = structuredClone(backup);
cycle.data.tasks[0].dependencyIds = ['t2'];
cycle.data.tasks[1].dependencyIds = ['t1'];
assert(!validateBackup(cycle).valid, 'Ciclo dipendenze non rilevato');

const future = structuredClone(backup);
future.schemaVersion = 99;
assert(!validateBackup(future).valid, 'Schema futuro non respinto');

const migrated = migrateBackup(backup);
assert(migrated.schemaVersion === 1, 'Migrazione no-op schema 1 fallita');
assert(/^PROJECTS_backup_\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(backupFilename(new Date('2026-10-06T07:25:00'))), 'Nome backup non valido');

console.log('PASS backup-service smoke test');
console.log(JSON.stringify(valid.summary));
