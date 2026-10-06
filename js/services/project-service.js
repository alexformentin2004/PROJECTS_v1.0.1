import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';

const ACTIVE_STATUSES = new Set(['idea', 'planning', 'active', 'paused']);
const ARCHIVE_STATUSES = new Set(['completed', 'archived']);
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_RANK = { active: 0, planning: 1, paused: 2, idea: 3, completed: 4, archived: 5 };

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
  return [...new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean))];
}

export function normalizeBudget(input = null, existing = null) {
  const source = input && typeof input === 'object' ? input : (existing && typeof existing === 'object' ? existing : {});
  const enabled = Boolean(source.enabled);
  const plannedRaw = source.planned;
  const spentRaw = source.spent;
  const planned = plannedRaw === '' || plannedRaw === null || plannedRaw === undefined ? null : Number(plannedRaw);
  const spent = spentRaw === '' || spentRaw === null || spentRaw === undefined ? null : Number(spentRaw);
  if (planned !== null && (!Number.isFinite(planned) || planned < 0)) throw new Error('Il budget previsto deve essere un numero maggiore o uguale a zero.');
  if (spent !== null && (!Number.isFinite(spent) || spent < 0)) throw new Error('La spesa deve essere un numero maggiore o uguale a zero.');
  const currency = String(source.currency || existing?.currency || 'EUR').trim().toUpperCase() || 'EUR';
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('La valuta deve usare un codice di 3 lettere, es. EUR.');
  return {
    enabled,
    currency,
    planned,
    spent,
    note: String(source.note || '').trim()
  };
}

export function projectBudgetSummary(project) {
  const budget = normalizeBudget(project?.budget || { enabled: false, currency: 'EUR' });
  const planned = budget.planned ?? 0;
  const spent = budget.spent ?? 0;
  return {
    ...budget,
    remaining: budget.planned === null ? null : planned - spent,
    percentSpent: budget.planned && budget.planned > 0 ? Math.round((spent / budget.planned) * 100) : null
  };
}

function normalizeProject(input, existing = null) {
  const timestamp = nowIso();
  const status = input.status || existing?.status || 'idea';
  const blocked = Boolean(input.blocked) && !['completed', 'archived'].includes(status);
  const record = {
    id: existing?.id || input.id || uuid(),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    status,
    priority: input.priority || existing?.priority || 'normal',
    tags: normalizeTags(input.tags),
    startDate: input.startDate || null,
    targetDate: input.targetDate || null,
    progressMode: existing?.progressMode || 'auto',
    manualProgress: Number.isFinite(Number(existing?.manualProgress)) ? Number(existing.manualProgress) : 0,
    blocked,
    blockedReason: blocked ? String(input.blockedReason || '').trim() : '',
    blockedSince: blocked ? (existing?.blocked && existing.blockedSince ? existing.blockedSince : timestamp) : null,
    budget: normalizeBudget(input.budget ?? existing?.budget ?? { enabled: false, currency: 'EUR' }, existing?.budget),
    templateId: input.templateId ?? existing?.templateId ?? null,
    templateName: input.templateName ?? existing?.templateName ?? null,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: status === 'completed' ? (existing?.completedAt || timestamp) : null,
    archivedAt: status === 'archived' ? (existing?.archivedAt || timestamp) : null
  };

  if (!record.title) throw new Error('Inserisci un nome per il progetto.');
  if (record.blocked && !record.blockedReason) throw new Error('Indica il motivo del blocco.');
  if (record.startDate && record.targetDate && record.targetDate < record.startDate) {
    throw new Error('La scadenza non può precedere la data di inizio.');
  }
  return record;
}

async function addTimeline(projectId, type, title, detail = '') {
  const timestamp = nowIso();
  await putRecord('timelineEntries', {
    id: uuid(),
    projectId,
    type,
    title,
    detail,
    source: 'system',
    entityType: String(type || '').split('.')[0] || 'project',
    entityId: null,
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function createProject(input) {
  const project = normalizeProject(input);
  await putRecord('projects', project);
  await addTimeline(project.id, 'project.created', 'Progetto creato', project.title);
  if (project.blocked) await addTimeline(project.id, 'project.blocked', 'Progetto bloccato', project.blockedReason);
  return project;
}

export async function updateProject(id, input) {
  const existing = await getRecord('projects', id);
  if (!existing) throw new Error('Progetto non trovato.');
  const next = normalizeProject({ ...existing, ...input, id }, existing);
  await putRecord('projects', next);

  if (existing.status !== next.status) {
    await addTimeline(id, 'project.status_changed', 'Stato aggiornato', `${existing.status} → ${next.status}`);
  }
  if (!existing.blocked && next.blocked) {
    await addTimeline(id, 'project.blocked', 'Progetto bloccato', next.blockedReason);
  } else if (existing.blocked && !next.blocked) {
    await addTimeline(id, 'project.unblocked', 'Blocco rimosso', existing.blockedReason || '');
  } else if (existing.blocked && next.blocked && existing.blockedReason !== next.blockedReason) {
    await addTimeline(id, 'project.block_reason_changed', 'Motivo del blocco aggiornato', next.blockedReason);
  }
  return next;
}


export async function updateProjectBudget(id, budgetInput) {
  const existing = await getProject(id);
  if (!existing) throw new Error('Progetto non trovato.');
  const budget = normalizeBudget(budgetInput, existing.budget);
  const next = { ...existing, budget, updatedAt: nowIso() };
  await putRecord('projects', next);
  const summary = projectBudgetSummary(next);
  const detail = budget.enabled
    ? `Previsto ${summary.planned ?? '—'} ${budget.currency} · Speso ${summary.spent ?? 0} ${budget.currency}`
    : 'Budget disattivato';
  await addTimeline(id, 'budget.updated', 'Budget aggiornato', detail);
  return next;
}

export async function getProject(id) {
  return getRecord('projects', id);
}

export async function listProjects({ archived = false } = {}) {
  const all = await getAllRecords('projects');
  const accepted = archived ? ARCHIVE_STATUSES : ACTIVE_STATUSES;
  return all.filter(project => accepted.has(project.status)).sort(compareProjects);
}

export async function listAllProjects() {
  const all = await getAllRecords('projects');
  return all.sort(compareProjects);
}

export async function setProjectStatus(id, status) {
  const existing = await getProject(id);
  if (!existing) throw new Error('Progetto non trovato.');
  return updateProject(id, {
    ...existing,
    status,
    blocked: ['completed', 'archived'].includes(status) ? false : existing.blocked,
    blockedReason: ['completed', 'archived'].includes(status) ? '' : existing.blockedReason
  });
}

export async function deleteProject(id) {
  const project = await getProject(id);
  if (!project) return false;
  const linkedStores = ['milestones', 'tasks', 'notes', 'references', 'timelineEntries'];
  for (const storeName of linkedStores) {
    const items = await getAllRecords(storeName);
    for (const item of items.filter(record => record.projectId === id)) {
      await deleteRecord(storeName, item.id);
    }
  }
  await deleteRecord('projects', id);
  return true;
}

export function compareProjects(a, b) {
  if (Boolean(a.blocked) !== Boolean(b.blocked)) return a.blocked ? -1 : 1;
  const priorityDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (priorityDiff) return priorityDiff;
  const statusDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (statusDiff) return statusDiff;
  if (a.targetDate && b.targetDate && a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate);
  if (a.targetDate && !b.targetDate) return -1;
  if (!a.targetDate && b.targetDate) return 1;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

export function projectHealth(project, todayKey = null) {
  const now = new Date();
  const today = todayKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (project.status === 'completed') return 'completed';
  if (project.status === 'archived') return 'archived';
  if (project.blocked) return 'blocked';
  if (project.targetDate && project.targetDate < today) return 'overdue';
  return 'on_track';
}

export function projectSearchText(project) {
  return [
    project.title,
    project.description,
    project.status,
    project.priority,
    project.blockedReason,
    ...(project.tags || [])
  ].filter(Boolean).join(' ').toLocaleLowerCase('it-IT');
}
