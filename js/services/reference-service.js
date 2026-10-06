import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';

export const REFERENCE_TYPES = Object.freeze([
  { id: 'link', label: 'Link' },
  { id: 'file_reference', label: 'Riferimento file' },
  { id: 'text_reference', label: 'Riferimento testuale' }
]);

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 'r') {
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
    entityType: 'reference',
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function normalizeWebUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Inserisci un link valido.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Sono ammessi solo link http/https.');
  return parsed.href;
}

async function normalizeReference(input, existing = null) {
  const timestamp = nowIso();
  const projectId = String(input.projectId || existing?.projectId || '');
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');
  const type = String(input.type || existing?.type || 'link');
  if (!REFERENCE_TYPES.some(item => item.id === type)) throw new Error('Tipo di riferimento non valido.');

  const record = {
    id: existing?.id || input.id || uuid('r'),
    projectId,
    type,
    label: String(input.label ?? existing?.label ?? '').trim(),
    url: '',
    fileName: '',
    fileHint: '',
    text: '',
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };

  if (!record.label) throw new Error('Inserisci un nome per il riferimento.');

  if (type === 'link') {
    record.url = normalizeWebUrl(input.url ?? existing?.url ?? '');
    if (!record.url) throw new Error('Inserisci il link.');
  } else if (type === 'file_reference') {
    record.fileName = String(input.fileName ?? existing?.fileName ?? '').trim();
    record.fileHint = String(input.fileHint ?? existing?.fileHint ?? '').trim();
    const rawUrl = input.url ?? existing?.url ?? '';
    record.url = rawUrl ? normalizeWebUrl(rawUrl) : '';
    if (!record.fileName) throw new Error('Inserisci il nome del file.');
  } else {
    record.text = String(input.text ?? existing?.text ?? '').trim();
    if (!record.text) throw new Error('Inserisci il riferimento testuale.');
  }

  return record;
}

export async function createReference(input) {
  const reference = await normalizeReference(input);
  await putRecord('references', reference);
  await touchProject(reference.projectId);
  await addTimeline(reference.projectId, 'reference.created', 'Riferimento aggiunto', reference.label);
  return reference;
}

export async function updateReference(id, input) {
  const existing = await getRecord('references', id);
  if (!existing) throw new Error('Riferimento non trovato.');
  const reference = await normalizeReference({ ...existing, ...input, id }, existing);
  await putRecord('references', reference);
  await touchProject(reference.projectId);
  await addTimeline(reference.projectId, 'reference.updated', 'Riferimento aggiornato', reference.label);
  return reference;
}

export async function getReference(id) {
  return getRecord('references', id);
}

export async function listReferencesByProject(projectId) {
  const all = await getAllRecords('references');
  return all
    .filter(reference => reference.projectId === projectId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function deleteReference(id) {
  const reference = await getReference(id);
  if (!reference) return false;
  await deleteRecord('references', id);
  await touchProject(reference.projectId);
  await addTimeline(reference.projectId, 'reference.deleted', 'Riferimento eliminato', reference.label);
  return true;
}
