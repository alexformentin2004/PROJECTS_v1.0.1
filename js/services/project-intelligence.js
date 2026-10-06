import { calculateProjectProgress, taskIsBlocked } from './task-service.js';
import { milestoneProgress } from './milestone-service.js';

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };
const STATUS_RANK = { in_progress: 0, todo: 1, waiting: 2 };

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const from = new Date(`${fromKey}T12:00:00`);
  const to = new Date(`${toKey}T12:00:00`);
  return Math.round((to - from) / 86400000);
}

export function projectProgress(project, tasks = []) {
  if (project?.progressMode === 'manual') {
    return Math.max(0, Math.min(100, Number(project.manualProgress || 0)));
  }
  return calculateProjectProgress(tasks);
}

export function getProjectHealth(project, tasks = [], milestones = [], todayKey = localDateKey()) {
  if (!project) return 'on_track';
  if (project.status === 'completed') return 'completed';
  if (project.status === 'archived') return 'archived';
  if (project.blocked) return 'blocked';

  const relevantTasks = tasks.filter(task => task.status !== 'cancelled');
  const taskMap = new Map(relevantTasks.map(task => [task.id, task]));
  const openTasks = relevantTasks.filter(task => task.status !== 'completed');
  const openMilestones = milestones.filter(item => !['completed', 'cancelled'].includes(item.status));
  const progress = projectProgress(project, relevantTasks);

  const projectOverdue = Boolean(project.targetDate && project.targetDate < todayKey);
  const overdueTask = openTasks.some(task => task.dueDate && task.dueDate < todayKey);
  const overdueMilestone = openMilestones.some(item => item.targetDate && item.targetDate < todayKey);
  if (projectOverdue || overdueTask || overdueMilestone) return 'overdue';

  const blockedTasks = openTasks.filter(task => taskIsBlocked(task, taskMap));
  if (blockedTasks.length) return 'at_risk';

  const hasBudgetPlanned = project.budget?.planned !== null && project.budget?.planned !== undefined && project.budget?.planned !== '';
  const hasBudgetSpent = project.budget?.spent !== null && project.budget?.spent !== undefined && project.budget?.spent !== '';
  const budgetPlanned = Number(project.budget?.planned);
  const budgetSpent = Number(project.budget?.spent);
  const budgetOverrun = Boolean(project.budget?.enabled) && hasBudgetPlanned && hasBudgetSpent && Number.isFinite(budgetPlanned) && Number.isFinite(budgetSpent) && budgetSpent > budgetPlanned;
  if (budgetOverrun) return 'at_risk';

  const nearCriticalTask = openTasks.some(task => {
    if (!task.dueDate || !['critical', 'high'].includes(task.priority)) return false;
    const days = daysBetween(todayKey, task.dueDate);
    return days !== null && days >= 0 && days <= 3;
  });
  if (nearCriticalTask) return 'at_risk';

  const nearMilestoneAtRisk = openMilestones.some(item => {
    if (!item.targetDate) return false;
    const days = daysBetween(todayKey, item.targetDate);
    if (days === null || days < 0 || days > 7) return false;
    const mProgress = milestoneProgress(item, relevantTasks);
    return mProgress < 70;
  });
  if (nearMilestoneAtRisk) return 'at_risk';

  if (project.targetDate) {
    const days = daysBetween(todayKey, project.targetDate);
    if (days !== null && days >= 0 && days <= 14 && progress < 75) return 'at_risk';
  }

  return 'on_track';
}

export function getNextAction(project, tasks = [], todayKey = localDateKey()) {
  if (!project || ['completed', 'archived'].includes(project.status) || project.blocked) return null;
  const relevant = tasks.filter(task => task.status !== 'cancelled');
  const taskMap = new Map(relevant.map(task => [task.id, task]));
  const candidates = relevant.filter(task => task.status !== 'completed' && !taskIsBlocked(task, taskMap));
  if (!candidates.length) return null;

  const score = task => {
    const dueDays = task.dueDate ? daysBetween(todayKey, task.dueDate) : null;
    let urgency = 50;
    if (dueDays !== null && dueDays < 0) urgency = 0;
    else if (dueDays === 0) urgency = 5;
    else if (dueDays !== null && dueDays <= 3) urgency = 10 + dueDays;
    else if (dueDays !== null && dueDays <= 7) urgency = 20 + dueDays;
    else if (dueDays !== null) urgency = 35 + Math.min(dueDays, 14);

    return [
      urgency,
      PRIORITY_RANK[task.priority] ?? 9,
      STATUS_RANK[task.status] ?? 9,
      task.dueDate || '9999-12-31',
      task.createdAt || ''
    ];
  };

  const compare = (a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] < sb[i]) return -1;
      if (sa[i] > sb[i]) return 1;
    }
    return 0;
  };

  const task = [...candidates].sort(compare)[0];
  const dueDays = task.dueDate ? daysBetween(todayKey, task.dueDate) : null;
  let reason = 'Prossima attività disponibile';
  if (dueDays !== null && dueDays < 0) reason = `Scaduto da ${Math.abs(dueDays)} ${Math.abs(dueDays) === 1 ? 'giorno' : 'giorni'}`;
  else if (dueDays === 0) reason = 'Da fare oggi';
  else if (dueDays === 1) reason = 'Scade domani';
  else if (dueDays !== null && dueDays <= 7) reason = `Scade tra ${dueDays} giorni`;
  else if (task.status === 'in_progress') reason = 'Già in corso';
  else if (task.priority === 'critical') reason = 'Priorità critica';
  else if (task.priority === 'high') reason = 'Priorità alta';

  return {
    taskId: task.id,
    projectId: task.projectId,
    title: task.title,
    priority: task.priority || 'normal',
    dueDate: task.dueDate || null,
    dueTime: task.dueTime || null,
    reason,
    actionTarget: `projects/project/${task.projectId}/task/${task.id}`
  };
}

export function getProjectIntelligence(project, tasks = [], milestones = [], todayKey = localDateKey()) {
  const relevantTasks = tasks.filter(task => task.projectId === project.id && task.status !== 'cancelled');
  const projectMilestones = milestones.filter(item => item.projectId === project.id && item.status !== 'cancelled');
  const taskMap = new Map(relevantTasks.map(task => [task.id, task]));
  const openTasks = relevantTasks.filter(task => task.status !== 'completed');
  return {
    project,
    progress: projectProgress(project, relevantTasks),
    health: getProjectHealth(project, relevantTasks, projectMilestones, todayKey),
    nextAction: getNextAction(project, relevantTasks, todayKey),
    overdueTasks: openTasks.filter(task => task.dueDate && task.dueDate < todayKey),
    dueTodayTasks: openTasks.filter(task => task.dueDate === todayKey),
    blockedTasks: openTasks.filter(task => taskIsBlocked(task, taskMap)),
    budgetOverrun: Boolean(project.budget?.enabled)
      && project.budget?.planned !== null && project.budget?.planned !== undefined && project.budget?.planned !== ''
      && project.budget?.spent !== null && project.budget?.spent !== undefined && project.budget?.spent !== ''
      && Number.isFinite(Number(project.budget.planned)) && Number.isFinite(Number(project.budget.spent))
      && Number(project.budget.spent) > Number(project.budget.planned),
    upcomingMilestones: projectMilestones.filter(item => {
      if (!item.targetDate || item.status === 'completed') return false;
      const days = daysBetween(todayKey, item.targetDate);
      return days !== null && days >= 0 && days <= 7;
    })
  };
}
