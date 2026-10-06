import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_RANK = { in_progress: 0, todo: 1, waiting: 2, completed: 3, cancelled: 4 };

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 't') {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeChecklist(input, existing = []) {
  if (!Array.isArray(input)) return Array.isArray(existing) ? existing : [];
  const existingMap = new Map((existing || []).map(item => [item.id, item]));
  return input
    .map(item => {
      const id = item.id || uuid('c');
      const previous = existingMap.get(id);
      return {
        id,
        text: String(item.text || '').trim(),
        completed: Boolean(item.completed ?? previous?.completed)
      };
    })
    .filter(item => item.text);
}

function normalizeDependencyIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(Boolean))];
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

async function validateProject(projectId) {
  const project = await getRecord('projects', projectId);
  if (!project) throw new Error('Seleziona un progetto valido.');
  if (['completed', 'archived'].includes(project.status)) {
    throw new Error('Riapri il progetto prima di aggiungere o modificare task.');
  }
  return project;
}

async function validateDependencies(taskId, projectId, dependencyIds) {
  if (taskId && dependencyIds.includes(taskId)) throw new Error('Un task non può dipendere da sé stesso.');

  const allTasks = await getAllRecords('tasks');
  const taskMap = new Map(allTasks.map(task => [task.id, task]));
  for (const dependencyId of dependencyIds) {
    const dependency = taskMap.get(dependencyId);
    if (!dependency) throw new Error('Una dipendenza selezionata non esiste più.');
    if (dependency.projectId !== projectId) throw new Error('Le dipendenze devono appartenere allo stesso progetto.');
    if (dependency.status === 'cancelled') throw new Error('Un task annullato non può essere usato come dipendenza.');
  }

  if (!taskId) return;

  const reachesTask = startId => {
    const seen = new Set();
    const stack = [startId];
    while (stack.length) {
      const currentId = stack.pop();
      if (currentId === taskId) return true;
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      const current = taskMap.get(currentId);
      for (const nextId of current?.dependencyIds || []) stack.push(nextId);
    }
    return false;
  };

  if (dependencyIds.some(reachesTask)) {
    throw new Error('Questa dipendenza creerebbe un ciclo tra task.');
  }
}

async function validateMilestone(projectId, milestoneId) {
  if (!milestoneId) return null;
  const milestone = await getRecord('milestones', milestoneId);
  if (!milestone || milestone.projectId !== projectId || milestone.status === 'cancelled') {
    throw new Error('La milestone selezionata non è valida per questo progetto.');
  }
  return milestone;
}

async function normalizeTask(input, existing = null) {
  const timestamp = nowIso();
  const projectId = String(input.projectId || existing?.projectId || '');
  await validateProject(projectId);

  const status = input.status || existing?.status || 'todo';
  const id = existing?.id || input.id || uuid('t');
  const dependencyIds = normalizeDependencyIds(input.dependencyIds ?? existing?.dependencyIds ?? []);
  await validateDependencies(existing?.id || null, projectId, dependencyIds);
  const milestoneId = input.milestoneId || null;
  await validateMilestone(projectId, milestoneId);

  const checklist = normalizeChecklist(input.checklist ?? existing?.checklist ?? [], existing?.checklist ?? []);
  if (status === 'completed' && dependencyIds.length) {
    const allTasks = await getAllRecords('tasks');
    const taskMap = new Map(allTasks.map(task => [task.id, task]));
    const blockers = dependencyIds.map(depId => taskMap.get(depId)).filter(dep => dep && dep.status !== 'completed');
    if (blockers.length) {
      throw new Error(`Completa prima ${blockers.length === 1 ? 'il task prerequisito' : 'i task prerequisiti'}.`);
    }
  }
  const record = {
    id,
    projectId,
    milestoneId,
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    status,
    priority: input.priority || existing?.priority || 'normal',
    dueDate: input.dueDate || null,
    dueTime: input.dueTime || null,
    checklist,
    dependencyIds,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: status === 'completed' ? (existing?.completedAt || timestamp) : null
  };

  if (!record.title) throw new Error('Inserisci un titolo per il task.');
  if (!['todo', 'in_progress', 'waiting', 'completed', 'cancelled'].includes(record.status)) {
    throw new Error('Stato task non valido.');
  }
  return record;
}

export async function createTask(input) {
  const task = await normalizeTask(input);
  await putRecord('tasks', task);
  await touchProject(task.projectId);
  await addTimeline(task.projectId, 'task.created', 'Task creato', task.title);
  return task;
}

export async function updateTask(id, input) {
  const existing = await getRecord('tasks', id);
  if (!existing) throw new Error('Task non trovato.');
  const next = await normalizeTask({ ...existing, ...input, id }, existing);
  await putRecord('tasks', next);
  if (existing.status !== 'cancelled' && next.status === 'cancelled') {
    const all = await getAllRecords('tasks');
    for (const dependent of all) {
      if ((dependent.dependencyIds || []).includes(next.id)) {
        await putRecord('tasks', {
          ...dependent,
          dependencyIds: dependent.dependencyIds.filter(depId => depId !== next.id),
          updatedAt: nowIso()
        });
      }
    }
  }
  await touchProject(next.projectId);

  if (existing.status !== next.status) {
    await addTimeline(next.projectId, 'task.status_changed', 'Stato task aggiornato', `${next.title}: ${existing.status} → ${next.status}`);
  } else {
    await addTimeline(next.projectId, 'task.updated', 'Task aggiornato', next.title);
  }
  return next;
}

export async function getTask(id) {
  return getRecord('tasks', id);
}

export async function listTasksByProject(projectId, { includeCancelled = false } = {}) {
  const all = await getAllRecords('tasks');
  return all
    .filter(task => task.projectId === projectId && (includeCancelled || task.status !== 'cancelled'))
    .sort(compareTasks);
}

export async function setTaskStatus(id, status) {
  const existing = await getTask(id);
  if (!existing) throw new Error('Task non trovato.');
  if (status === 'completed') {
    const projectTasks = await listTasksByProject(existing.projectId, { includeCancelled: true });
    const blockers = taskBlockers(existing, projectTasks);
    if (blockers.length) {
      throw new Error(`Completa prima ${blockers.length === 1 ? 'il task prerequisito' : 'i task prerequisiti'}.`);
    }
  }
  return updateTask(id, { ...existing, status });
}

export async function toggleTaskCompleted(id) {
  const existing = await getTask(id);
  if (!existing) throw new Error('Task non trovato.');
  return setTaskStatus(id, existing.status === 'completed' ? 'todo' : 'completed');
}

export async function toggleChecklistItem(taskId, itemId) {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task non trovato.');
  const checklist = (task.checklist || []).map(item => item.id === itemId ? { ...item, completed: !item.completed } : item);
  const next = { ...task, checklist, updatedAt: nowIso() };
  await putRecord('tasks', next);
  await touchProject(task.projectId);
  return next;
}

export async function deleteTask(id) {
  const task = await getTask(id);
  if (!task) return false;

  const all = await getAllRecords('tasks');
  for (const dependent of all) {
    if ((dependent.dependencyIds || []).includes(id)) {
      await putRecord('tasks', {
        ...dependent,
        dependencyIds: dependent.dependencyIds.filter(depId => depId !== id),
        updatedAt: nowIso()
      });
    }
  }

  await deleteRecord('tasks', id);
  await touchProject(task.projectId);
  await addTimeline(task.projectId, 'task.deleted', 'Task eliminato', task.title);
  return true;
}

export function taskProgress(task) {
  if (task.status === 'completed') return 100;
  if (task.status === 'cancelled') return 0;
  const checklist = task.checklist || [];
  if (!checklist.length) return 0;
  const completed = checklist.filter(item => item.completed).length;
  return Math.round((completed / checklist.length) * 100);
}

export function taskBlockers(task, allTasks) {
  const map = allTasks instanceof Map ? allTasks : new Map((allTasks || []).map(item => [item.id, item]));
  return (task.dependencyIds || [])
    .map(id => map.get(id))
    .filter(dep => dep && dep.status !== 'completed');
}

export function taskIsBlocked(task, allTasks) {
  return task.status !== 'completed' && task.status !== 'cancelled' && taskBlockers(task, allTasks).length > 0;
}

export function calculateProjectProgress(tasks) {
  const relevant = (tasks || []).filter(task => task.status !== 'cancelled');
  if (!relevant.length) return 0;
  return Math.round(relevant.reduce((sum, task) => sum + taskProgress(task), 0) / relevant.length);
}

export function compareTasks(a, b) {
  const aDone = ['completed', 'cancelled'].includes(a.status);
  const bDone = ['completed', 'cancelled'].includes(b.status);
  if (aDone !== bDone) return aDone ? 1 : -1;
  const priorityDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (priorityDiff) return priorityDiff;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  const statusDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
  if (statusDiff) return statusDiff;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}
