import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 'e') {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function touchProject(projectId) {
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');
  await putRecord('projects', { ...project, updatedAt: nowIso() });
  return project;
}

export async function listTimelineByProject(projectId) {
  const all = await getAllRecords('timelineEntries');
  return all
    .filter(entry => entry.projectId === projectId)
    .sort((a, b) => String(b.occurredAt || b.createdAt || '').localeCompare(String(a.occurredAt || a.createdAt || '')));
}

export async function createManualTimelineEntry(input) {
  const timestamp = nowIso();
  const projectId = String(input.projectId || '');
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');
  const title = String(input.title || '').trim();
  const detail = String(input.detail || '').trim();
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();

  if (!title) throw new Error('Inserisci un titolo per l’evento.');
  const occurredAt = date
    ? new Date(`${date}T${time || '12:00'}:00`).toISOString()
    : timestamp;

  const entry = {
    id: uuid('e'),
    projectId,
    type: 'manual.note',
    title,
    detail,
    source: 'manual',
    entityType: 'project',
    entityId: projectId,
    occurredAt,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await putRecord('timelineEntries', entry);
  await touchProject(projectId);
  return entry;
}

export async function deleteManualTimelineEntry(id) {
  const entry = await getRecord('timelineEntries', id);
  if (!entry) return false;
  if (entry.source !== 'manual' && entry.type !== 'manual.note') {
    throw new Error('Gli eventi automatici della timeline non possono essere eliminati.');
  }
  await deleteRecord('timelineEntries', id);
  await touchProject(entry.projectId);
  return true;
}

export function isManualTimelineEntry(entry) {
  return entry?.source === 'manual' || entry?.type === 'manual.note';
}
