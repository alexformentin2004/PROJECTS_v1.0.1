import { MODULE, STORE_NAMES } from '../constants.js';
import { getAllRecords, replaceDatabaseContents } from '../db.js';

export const BACKUP_FORMAT_VERSION = 1;
export const DATA_STORE_NAMES = Object.freeze([
  'projects',
  'milestones',
  'tasks',
  'notes',
  'references',
  'timelineEntries',
  'templates'
]);

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const REQUIRED_TOP_LEVEL = ['moduleId', 'appVersion', 'schemaVersion', 'exportedAt', 'settings', 'data', 'metadata'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeSettingsRecords(settings) {
  if (Array.isArray(settings)) return settings.map(item => clone(item));
  if (!isPlainObject(settings)) return [];
  return Object.entries(settings).map(([id, value]) => ({ id, value }));
}

function settingsObject(records) {
  return Object.fromEntries((records || []).filter(item => validId(item?.id)).map(item => [item.id, clone(item.value)]));
}

function normalizeMetadataRecords(metadata) {
  if (Array.isArray(metadata)) return metadata.map(item => clone(item));
  if (Array.isArray(metadata?.records)) return metadata.records.map(item => clone(item));
  return [];
}

function compareUpdatedAt(localRecord, importedRecord) {
  const localTime = Date.parse(localRecord?.updatedAt || '') || 0;
  const importedTime = Date.parse(importedRecord?.updatedAt || '') || 0;
  return importedTime >= localTime ? importedRecord : localRecord;
}

function mergeRecords(localRecords = [], importedRecords = []) {
  const map = new Map();
  for (const item of localRecords) if (validId(item?.id)) map.set(item.id, clone(item));
  for (const item of importedRecords) {
    if (!validId(item?.id)) continue;
    const local = map.get(item.id);
    map.set(item.id, local ? clone(compareUpdatedAt(local, item)) : clone(item));
  }
  return [...map.values()];
}

function countSnapshot(snapshot) {
  return Object.fromEntries(DATA_STORE_NAMES.map(store => [store, snapshot[store]?.length || 0]));
}

export async function captureDatabaseSnapshot() {
  const snapshot = {};
  for (const storeName of STORE_NAMES) snapshot[storeName] = await getAllRecords(storeName);
  return snapshot;
}

export function createExportPayloadFromSnapshot(snapshot, exportedAt = new Date().toISOString()) {
  const data = {};
  for (const storeName of DATA_STORE_NAMES) data[storeName] = clone(snapshot[storeName] || []);
  const metadataRecords = clone(snapshot.metadata || []);
  return {
    moduleId: MODULE.moduleId,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    exportedAt,
    settings: settingsObject(snapshot.settings || []),
    data,
    metadata: {
      exportFormatVersion: BACKUP_FORMAT_VERSION,
      namespace: MODULE.namespace,
      dbName: MODULE.dbName,
      dbVersion: MODULE.dbVersion,
      recordCounts: countSnapshot(snapshot),
      records: metadataRecords
    }
  };
}

export async function createExportPayload() {
  return createExportPayloadFromSnapshot(await captureDatabaseSnapshot());
}

export function serializeBackup(payload, pretty = true) {
  return JSON.stringify(payload, null, pretty ? 2 : 0);
}

export function backupFilename(date = new Date(), prefix = 'PROJECTS_backup') {
  const pad = value => String(value).padStart(2, '0');
  return `${prefix}_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

export async function exportBackupFile() {
  const payload = await createExportPayload();
  const text = serializeBackup(payload);
  return {
    payload,
    text,
    filename: backupFilename(),
    blob: new Blob([text], { type: 'application/json;charset=utf-8' })
  };
}

export function downloadBackup({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareBackupFile(fileData) {
  const file = new File([fileData.blob], fileData.filename, { type: 'application/json' });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({
    title: 'Backup PROJECTS',
    text: 'Backup dati PROJECTS — ALEX HUB',
    files: [file]
  });
  return true;
}

function validateUniqueIds(records, label, errors) {
  const ids = new Set();
  records.forEach((record, index) => {
    if (!isPlainObject(record)) {
      errors.push(`${label}[${index}] non è un oggetto valido.`);
      return;
    }
    if (!validId(record.id)) {
      errors.push(`${label}[${index}] non ha un id valido.`);
      return;
    }
    if (ids.has(record.id)) errors.push(`${label}: id duplicato “${record.id}”.`);
    ids.add(record.id);
  });
  return ids;
}

function hasDependencyCycle(tasks) {
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const task = taskMap.get(id);
    for (const dependencyId of task?.dependencyIds || []) {
      if (taskMap.has(dependencyId) && visit(dependencyId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return tasks.some(task => visit(task.id));
}

export function validateBackup(raw) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) return { valid: false, errors: ['Il file JSON non contiene un backup valido.'], warnings, summary: null };
  for (const key of REQUIRED_TOP_LEVEL) if (!(key in raw)) errors.push(`Campo obbligatorio mancante: ${key}.`);
  if (raw.moduleId !== MODULE.moduleId) errors.push(`Backup del modulo “${raw.moduleId || 'sconosciuto'}”: serve un backup “${MODULE.moduleId}”.`);
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) errors.push('schemaVersion non valida.');
  if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion > MODULE.schemaVersion) errors.push(`Il backup usa schemaVersion ${raw.schemaVersion}, più recente della ${MODULE.schemaVersion} supportata da questa app.`);
  if (typeof raw.appVersion !== 'string' || !raw.appVersion.trim()) errors.push('appVersion non valida.');
  if (!isoOrNull(raw.exportedAt)) errors.push('exportedAt non è una data valida.');
  if (!isPlainObject(raw.settings) && !Array.isArray(raw.settings)) errors.push('settings deve essere un oggetto o un array.');
  if (!isPlainObject(raw.data)) errors.push('data deve essere un oggetto.');
  if (!isPlainObject(raw.metadata)) errors.push('metadata deve essere un oggetto.');

  const data = isPlainObject(raw.data) ? raw.data : {};
  const ids = {};
  for (const storeName of DATA_STORE_NAMES) {
    if (!Array.isArray(data[storeName])) {
      errors.push(`data.${storeName} deve essere un array.`);
      ids[storeName] = new Set();
    } else ids[storeName] = validateUniqueIds(data[storeName], `data.${storeName}`, errors);
  }

  const projects = Array.isArray(data.projects) ? data.projects : [];
  const milestones = Array.isArray(data.milestones) ? data.milestones : [];
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];
  const references = Array.isArray(data.references) ? data.references : [];
  const timeline = Array.isArray(data.timelineEntries) ? data.timelineEntries : [];

  for (const item of [...milestones, ...tasks, ...notes, ...references, ...timeline]) {
    if (item?.projectId && !ids.projects.has(item.projectId)) errors.push(`Riferimento a progetto inesistente: ${item.projectId}.`);
  }

  const milestoneMap = new Map(milestones.map(item => [item.id, item]));
  const taskMap = new Map(tasks.map(item => [item.id, item]));
  for (const task of tasks) {
    if (task.milestoneId) {
      const milestone = milestoneMap.get(task.milestoneId);
      if (!milestone || milestone.projectId !== task.projectId) errors.push(`Task “${task.id}”: milestone non valida o appartenente a un altro progetto.`);
    }
    if (!Array.isArray(task.dependencyIds || [])) errors.push(`Task “${task.id}”: dependencyIds deve essere un array.`);
    for (const dependencyId of task.dependencyIds || []) {
      const dependency = taskMap.get(dependencyId);
      if (!dependency) errors.push(`Task “${task.id}”: dipendenza inesistente “${dependencyId}”.`);
      else if (dependency.projectId !== task.projectId) errors.push(`Task “${task.id}”: dipendenza appartenente a un altro progetto.`);
      if (dependencyId === task.id) errors.push(`Task “${task.id}”: auto-dipendenza non consentita.`);
    }
  }
  if (tasks.length && hasDependencyCycle(tasks)) errors.push('Le dipendenze dei task contengono almeno un ciclo.');

  const templates = Array.isArray(data.templates) ? data.templates : [];
  for (const template of templates) {
    if (!Array.isArray(template.milestones) || !Array.isArray(template.tasks)) {
      errors.push(`Template “${template.id}”: tasks e milestones devono essere array.`);
      continue;
    }
    const milestoneKeys = new Set();
    for (const milestone of template.milestones) {
      if (!validId(milestone?.key)) errors.push(`Template “${template.id}”: milestone senza key valida.`);
      else if (milestoneKeys.has(milestone.key)) errors.push(`Template “${template.id}”: milestone key duplicata “${milestone.key}”.`);
      else milestoneKeys.add(milestone.key);
    }
    const taskKeys = new Set();
    const taskByKey = new Map();
    for (const task of template.tasks) {
      if (!validId(task?.key)) errors.push(`Template “${template.id}”: task senza key valida.`);
      else if (taskKeys.has(task.key)) errors.push(`Template “${template.id}”: task key duplicata “${task.key}”.`);
      else { taskKeys.add(task.key); taskByKey.set(task.key, task); }
      if (task?.milestoneKey && !milestoneKeys.has(task.milestoneKey)) errors.push(`Template “${template.id}”: milestoneKey inesistente “${task.milestoneKey}”.`);
      if (!Array.isArray(task?.dependsOnKeys || [])) errors.push(`Template “${template.id}”: dependsOnKeys deve essere un array.`);
    }
    for (const task of template.tasks) {
      for (const key of task?.dependsOnKeys || []) {
        if (!taskKeys.has(key)) errors.push(`Template “${template.id}”: dipendenza task inesistente “${key}”.`);
        if (key === task.key) errors.push(`Template “${template.id}”: auto-dipendenza “${key}”.`);
      }
    }
    const visiting = new Set();
    const visited = new Set();
    const visitTemplateTask = key => {
      if (visiting.has(key)) return true;
      if (visited.has(key)) return false;
      visiting.add(key);
      for (const dep of taskByKey.get(key)?.dependsOnKeys || []) {
        if (taskByKey.has(dep) && visitTemplateTask(dep)) return true;
      }
      visiting.delete(key);
      visited.add(key);
      return false;
    };
    if ([...taskKeys].some(visitTemplateTask)) errors.push(`Template “${template.id}”: dipendenze cicliche.`);
  }

  const settingsRecords = normalizeSettingsRecords(raw.settings);
  validateUniqueIds(settingsRecords, 'settings', errors);
  const metadataRecords = normalizeMetadataRecords(raw.metadata);
  validateUniqueIds(metadataRecords, 'metadata.records', errors);

  if (raw.schemaVersion < MODULE.schemaVersion) warnings.push(`Il backup sarà migrato dallo schema ${raw.schemaVersion} allo schema ${MODULE.schemaVersion}.`);
  if (raw.appVersion !== MODULE.appVersion) warnings.push(`Backup creato con PROJECTS ${raw.appVersion}; app corrente ${MODULE.appVersion}.`);
  if (!raw.metadata?.exportFormatVersion) warnings.push('Backup senza exportFormatVersion esplicita: verrà interpretato come formato 1.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      appVersion: raw.appVersion || null,
      schemaVersion: raw.schemaVersion || null,
      exportedAt: isoOrNull(raw.exportedAt),
      counts: Object.fromEntries(DATA_STORE_NAMES.map(storeName => [storeName, Array.isArray(data[storeName]) ? data[storeName].length : 0]))
    }
  };
}

const MIGRATIONS = Object.freeze({
  // Esempio futuro:
  // 1: backup => ({ ...backup, schemaVersion: 2 })
});

export function migrateBackup(raw) {
  let backup = clone(raw);
  while (backup.schemaVersion < MODULE.schemaVersion) {
    const migrate = MIGRATIONS[backup.schemaVersion];
    if (typeof migrate !== 'function') throw new Error(`Nessuna migrazione disponibile dallo schema ${backup.schemaVersion}.`);
    backup = migrate(backup);
    if (!Number.isInteger(backup.schemaVersion)) throw new Error('La migrazione non ha prodotto una schemaVersion valida.');
  }
  return backup;
}

export async function parseBackupFile(file) {
  if (!file) throw new Error('Nessun file selezionato.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('Il backup supera il limite di 50 MB.');
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file selezionato non contiene JSON valido.');
  }
  const validation = validateBackup(raw);
  if (!validation.valid) {
    const error = new Error(validation.errors[0] || 'Backup non valido.');
    error.validation = validation;
    throw error;
  }
  return { raw, backup: migrateBackup(raw), validation, fileName: file.name };
}

export function backupToStoreSnapshot(backup) {
  const snapshot = {};
  for (const storeName of DATA_STORE_NAMES) snapshot[storeName] = clone(backup.data?.[storeName] || []);
  snapshot.settings = normalizeSettingsRecords(backup.settings).map(item => ({ ...item, updatedAt: item.updatedAt || backup.exportedAt || new Date().toISOString() }));
  snapshot.metadata = normalizeMetadataRecords(backup.metadata);
  return snapshot;
}

export async function buildImportSnapshot(backup, mode = 'merge') {
  const imported = backupToStoreSnapshot(backup);
  if (mode === 'replace') {
    return Object.fromEntries(STORE_NAMES.map(storeName => [storeName, imported[storeName] || []]));
  }
  if (mode !== 'merge') throw new Error('Modalità di import non valida.');
  const local = await captureDatabaseSnapshot();
  const merged = {};
  for (const storeName of STORE_NAMES) merged[storeName] = mergeRecords(local[storeName] || [], imported[storeName] || []);
  return merged;
}

export async function importBackup(backup, mode = 'merge') {
  const validation = validateBackup(backup);
  if (!validation.valid) throw new Error(validation.errors[0] || 'Backup non valido.');
  const migrated = migrateBackup(backup);
  const snapshot = await buildImportSnapshot(migrated, mode);
  const finalValidation = validateBackup(createExportPayloadFromSnapshot(snapshot));
  if (!finalValidation.valid) {
    throw new Error(`L’import produrrebbe dati incoerenti: ${finalValidation.errors[0] || 'validazione fallita'}`);
  }
  await replaceDatabaseContents(snapshot);
  return {
    mode,
    sourceAppVersion: migrated.appVersion,
    sourceSchemaVersion: migrated.schemaVersion,
    counts: Object.fromEntries(DATA_STORE_NAMES.map(storeName => [storeName, snapshot[storeName]?.length || 0]))
  };
}
