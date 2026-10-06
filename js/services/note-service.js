import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 'n') {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function touchProject(projectId) {
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');
  await putRecord('projects', { ...project, updatedAt: nowIso() });
  return project;
}

async function addTimeline(projectId, type, title, detail = '') {
  const timestamp = nowIso();
  await putRecord('timelineEntries', {
    id: uuid('e'),
    projectId,
    type,
    title,
    detail,
    source: 'system',
    entityType: 'note',
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

async function normalizeNote(input, existing = null) {
  const timestamp = nowIso();
  const projectId = String(input.projectId || existing?.projectId || '');
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');

  const note = {
    id: existing?.id || input.id || uuid('n'),
    projectId,
    title: String(input.title || '').trim(),
    body: String(input.body || '').trim(),
    pinned: Boolean(input.pinned),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };

  if (!note.title) throw new Error('Inserisci un titolo per la nota.');
  if (!note.body) throw new Error('Inserisci il contenuto della nota.');
  return note;
}

export async function createNote(input) {
  const note = await normalizeNote(input);
  await putRecord('notes', note);
  await touchProject(note.projectId);
  await addTimeline(note.projectId, 'note.created', 'Nota aggiunta', note.title);
  return note;
}

export async function updateNote(id, input) {
  const existing = await getRecord('notes', id);
  if (!existing) throw new Error('Nota non trovata.');
  const note = await normalizeNote({ ...existing, ...input, id }, existing);
  await putRecord('notes', note);
  await touchProject(note.projectId);
  await addTimeline(note.projectId, 'note.updated', 'Nota aggiornata', note.title);
  return note;
}

export async function getNote(id) {
  return getRecord('notes', id);
}

export async function listNotesByProject(projectId) {
  const all = await getAllRecords('notes');
  return all
    .filter(note => note.projectId === projectId)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function toggleNotePinned(id) {
  const existing = await getNote(id);
  if (!existing) throw new Error('Nota non trovata.');
  return updateNote(id, { ...existing, pinned: !existing.pinned });
}

export async function deleteNote(id) {
  const note = await getNote(id);
  if (!note) return false;
  await deleteRecord('notes', id);
  await touchProject(note.projectId);
  await addTimeline(note.projectId, 'note.deleted', 'Nota eliminata', note.title);
  return true;
}
