import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';
import { taskProgress } from './task-service.js';

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_RANK = { active: 0, planned: 1, completed: 2, cancelled: 3 };

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 'm') {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
    entityType: String(type || '').split('.')[0] || 'project',
    entityId: null,
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

async function touchProject(projectId) {
  const project = await getRecord('projects', projectId);
  if (!project) return;
  await putRecord('projects', { ...project, updatedAt: nowIso() });
}

async function normalizeMilestone(input, existing = null) {
  const timestamp = nowIso();
  const projectId = String(input.projectId || existing?.projectId || '');
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Progetto non trovato.');
  if (['completed', 'archived'].includes(project.status)) {
    throw new Error('Riapri il progetto prima di aggiungere o modificare milestone.');
  }

  const status = input.status || existing?.status || 'planned';
  const record = {
    id: existing?.id || input.id || uuid('m'),
    projectId,
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    status,
    priority: input.priority || existing?.priority || 'normal',
    targetDate: input.targetDate || null,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: status === 'completed' ? (existing?.completedAt || timestamp) : null
  };

  if (!record.title) throw new Error('Inserisci un titolo per la milestone.');
  if (!['planned', 'active', 'completed', 'cancelled'].includes(record.status)) {
    throw new Error('Stato milestone non valido.');
  }
  return record;
}

export async function createMilestone(input) {
  const milestone = await normalizeMilestone(input);
  await putRecord('milestones', milestone);
  await touchProject(milestone.projectId);
  await addTimeline(milestone.projectId, 'milestone.created', 'Milestone creata', milestone.title);
  return milestone;
}

export async function updateMilestone(id, input) {
  const existing = await getRecord('milestones', id);
  if (!existing) throw new Error('Milestone non trovata.');
  const next = await normalizeMilestone({ ...existing, ...input, id }, existing);
  await putRecord('milestones', next);
  await touchProject(next.projectId);
  if (existing.status !== next.status) {
    await addTimeline(next.projectId, 'milestone.status_changed', 'Stato milestone aggiornato', `${next.title}: ${existing.status} → ${next.status}`);
  } else {
    await addTimeline(next.projectId, 'milestone.updated', 'Milestone aggiornata', next.title);
  }
  return next;
}

export async function getMilestone(id) {
  return getRecord('milestones', id);
}

export async function listMilestonesByProject(projectId, { includeCancelled = false } = {}) {
  const all = await getAllRecords('milestones');
  return all
    .filter(item => item.projectId === projectId && (includeCancelled || item.status !== 'cancelled'))
    .sort(compareMilestones);
}

export async function setMilestoneStatus(id, status) {
  const existing = await getMilestone(id);
  if (!existing) throw new Error('Milestone non trovata.');
  return updateMilestone(id, { ...existing, status });
}

export async function deleteMilestone(id) {
  const milestone = await getMilestone(id);
  if (!milestone) return false;
  const tasks = await getAllRecords('tasks');
  for (const task of tasks.filter(item => item.milestoneId === id)) {
    await putRecord('tasks', { ...task, milestoneId: null, updatedAt: nowIso() });
  }
  await deleteRecord('milestones', id);
  await touchProject(milestone.projectId);
  await addTimeline(milestone.projectId, 'milestone.deleted', 'Milestone eliminata', milestone.title);
  return true;
}

export function milestoneProgress(milestone, tasks) {
  if (milestone.status === 'completed') return 100;
  if (milestone.status === 'cancelled') return 0;
  const linked = (tasks || []).filter(task => task.milestoneId === milestone.id && task.status !== 'cancelled');
  if (!linked.length) return 0;
  return Math.round(linked.reduce((sum, task) => sum + taskProgress(task), 0) / linked.length);
}

export function compareMilestones(a, b) {
  const aDone = ['completed', 'cancelled'].includes(a.status);
  const bDone = ['completed', 'cancelled'].includes(b.status);
  if (aDone !== bDone) return aDone ? 1 : -1;
  const priorityDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (priorityDiff) return priorityDiff;
  if (a.targetDate && b.targetDate && a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate);
  if (a.targetDate && !b.targetDate) return -1;
  if (!a.targetDate && b.targetDate) return 1;
  const statusDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (statusDiff) return statusDiff;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}
