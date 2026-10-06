import { MODULE } from './constants.js';
import { getAllRecords } from './db.js';
import { projectBudgetSummary } from './services/project-service.js';
import { taskIsBlocked } from './services/task-service.js';
import {
  getProjectHealth,
  getProjectIntelligence,
  localDateKey,
  projectProgress
} from './services/project-intelligence.js';

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 };
const HEALTH_RANK = { blocked: 0, overdue: 1, at_risk: 2, on_track: 3, completed: 4, archived: 5 };

function operationalProject(project) {
  return !['completed', 'archived'].includes(project.status);
}

function sortAttention(a, b) {
  const statusRank = { overdue: 0, blocked: 1, due_today: 2, upcoming_milestone: 3, next_action: 4 };
  return (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) ||
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
}

export async function getTodayOverview() {
  const [projects, tasks, milestones] = await Promise.all([
    getAllRecords('projects'),
    getAllRecords('tasks'),
    getAllRecords('milestones')
  ]);
  const today = localDateKey();
  const projectMap = new Map(projects.map(project => [project.id, project]));
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  const overdue = [];
  const dueToday = [];
  const blocked = [];
  const upcomingMilestones = [];

  for (const task of tasks) {
    if (['completed', 'cancelled'].includes(task.status)) continue;
    const project = projectMap.get(task.projectId);
    if (!project || !operationalProject(project)) continue;
    const isBlocked = taskIsBlocked(task, taskMap);
    const item = {
      kind: 'task',
      title: task.title,
      status: isBlocked ? 'blocked' : (task.dueDate && task.dueDate < today ? 'overdue' : 'due_today'),
      priority: task.priority || 'normal',
      shortText: `${project.title}${task.dueDate ? ` · ${task.dueDate}` : ''}`,
      actionLabel: 'Apri task',
      actionTarget: `projects/project/${project.id}/task/${task.id}`,
      timestamp: task.dueDate || task.updatedAt,
      projectId: project.id,
      projectTitle: project.title,
      taskId: task.id
    };
    if (isBlocked) blocked.push({ ...item, shortText: `${project.title} · in attesa di prerequisiti` });
    else if (task.dueDate && task.dueDate < today) overdue.push(item);
    else if (task.dueDate === today) dueToday.push(item);
  }

  for (const project of projects.filter(operationalProject)) {
    if (project.blocked) {
      blocked.push({
        kind: 'project',
        title: project.title,
        status: 'blocked',
        priority: project.priority || 'normal',
        shortText: project.blockedReason || 'Progetto bloccato',
        actionLabel: 'Apri progetto',
        actionTarget: `projects/project/${project.id}`,
        timestamp: project.blockedSince || project.updatedAt,
        projectId: project.id,
        projectTitle: project.title
      });
    }
  }

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonKey = localDateKey(horizon);
  for (const milestone of milestones) {
    if (['completed', 'cancelled'].includes(milestone.status) || !milestone.targetDate) continue;
    const project = projectMap.get(milestone.projectId);
    if (!project || !operationalProject(project)) continue;
    if (milestone.targetDate >= today && milestone.targetDate <= horizonKey) {
      upcomingMilestones.push({
        kind: 'milestone',
        title: milestone.title,
        status: 'upcoming_milestone',
        priority: milestone.priority || 'normal',
        shortText: `${project.title} · ${milestone.targetDate === today ? 'oggi' : milestone.targetDate}`,
        actionLabel: 'Apri progetto',
        actionTarget: `projects/project/${project.id}`,
        timestamp: milestone.targetDate,
        projectId: project.id,
        projectTitle: project.title,
        milestoneId: milestone.id
      });
    }
  }

  const nextActions = projects
    .filter(operationalProject)
    .map(project => {
      const intelligence = getProjectIntelligence(project, tasks, milestones, today);
      if (!intelligence.nextAction) return null;
      return {
        ...intelligence.nextAction,
        kind: 'next_action',
        status: 'next_action',
        projectTitle: project.title,
        shortText: `${project.title} · ${intelligence.nextAction.reason}`,
        timestamp: intelligence.nextAction.dueDate || project.updatedAt,
        health: intelligence.health
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      (HEALTH_RANK[a.health] ?? 9) - (HEALTH_RANK[b.health] ?? 9) ||
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
      String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
    )
    .slice(0, 5);

  overdue.sort(sortAttention);
  dueToday.sort(sortAttention);
  blocked.sort(sortAttention);
  upcomingMilestones.sort(sortAttention);

  return { overdue, dueToday, blocked, upcomingMilestones, nextActions };
}

export async function getTodaySummary() {
  const overview = await getTodayOverview();
  return [
    ...overview.overdue,
    ...overview.blocked,
    ...overview.dueToday,
    ...overview.upcomingMilestones
  ].sort(sortAttention).map(({ kind, projectId, projectTitle, taskId, milestoneId, health, ...item }) => item);
}

export async function getDashboardData() {
  const [projects, tasks, milestones, todayOverview] = await Promise.all([
    getAllRecords('projects'),
    getAllRecords('tasks'),
    getAllRecords('milestones'),
    getTodayOverview()
  ]);
  const today = localDateKey();
  const operational = projects.filter(operationalProject);
  const projectCards = operational.map(project => {
    const intelligence = getProjectIntelligence(project, tasks, milestones, today);
    return {
      id: project.id,
      title: project.title,
      status: project.status,
      priority: project.priority,
      targetDate: project.targetDate,
      progress: intelligence.progress,
      health: intelligence.health,
      nextAction: intelligence.nextAction,
      overdueCount: intelligence.overdueTasks.length,
      blockedTaskCount: intelligence.blockedTasks.length,
      dueTodayCount: intelligence.dueTodayTasks.length
    };
  }).sort((a, b) =>
    (HEALTH_RANK[a.health] ?? 9) - (HEALTH_RANK[b.health] ?? 9) ||
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    String(a.targetDate || '9999-12-31').localeCompare(String(b.targetDate || '9999-12-31'))
  );

  const healthCounts = { on_track: 0, at_risk: 0, overdue: 0, blocked: 0 };
  for (const item of projectCards) {
    if (item.health in healthCounts) healthCounts[item.health] += 1;
  }

  const focusAction = projectCards.find(item => item.nextAction)?.nextAction || null;
  if (focusAction) {
    const project = projectCards.find(item => item.id === focusAction.projectId);
    focusAction.projectTitle = project?.title || '';
    focusAction.health = project?.health || 'on_track';
  }

  return {
    projects: projectCards,
    healthCounts,
    focusAction,
    todayOverview,
    counts: {
      operational: operational.length,
      active: operational.filter(project => project.status === 'active').length,
      tasksToday: todayOverview.dueToday.length,
      overdue: todayOverview.overdue.length,
      blocked: todayOverview.blocked.length,
      upcomingMilestones: todayOverview.upcomingMilestones.length
    }
  };
}

export async function getHubSummary() {
  const dashboard = await getDashboardData();
  const summary = [
    { id: 'active_projects', label: 'Attivi', value: dashboard.counts.active },
    { id: 'tasks_due_today', label: 'Task oggi', value: dashboard.counts.tasksToday }
  ];
  if (dashboard.counts.overdue) summary.push({ id: 'overdue_tasks', label: 'Scaduti', value: dashboard.counts.overdue });
  if (dashboard.healthCounts.blocked) summary.push({ id: 'blocked_projects', label: 'Progetti bloccati', value: dashboard.healthCounts.blocked });
  const nextMilestone = dashboard.todayOverview.upcomingMilestones[0];
  if (nextMilestone && summary.length < 5) {
    summary.push({ id: 'next_milestone', label: 'Prossima milestone', value: nextMilestone.timestamp, title: nextMilestone.title });
  }
  return summary.slice(0, 5);
}

export async function getInsights() {
  const [summary, projects, tasks, milestones] = await Promise.all([
    getHubSummary(),
    getAllRecords('projects'),
    getAllRecords('tasks'),
    getAllRecords('milestones')
  ]);
  const timestamp = localDateKey();
  const metrics = summary
    .filter(item => typeof item.value === 'number')
    .map(item => ({
      timestamp,
      metricId: item.id,
      value: item.value,
      unit: 'count',
      category: 'projects',
      sourceModule: MODULE.moduleId
    }));

  for (const project of projects.filter(item => item.status !== 'archived')) {
    const projectTasks = tasks.filter(task => task.projectId === project.id && task.status !== 'cancelled');
    const projectMilestones = milestones.filter(item => item.projectId === project.id && item.status !== 'cancelled');
    metrics.push({
      timestamp,
      metricId: 'project_progress',
      value: projectProgress(project, projectTasks),
      unit: 'percent',
      category: 'projects',
      sourceModule: MODULE.moduleId,
      entityId: project.id
    });
    metrics.push({
      timestamp,
      metricId: 'project_health',
      value: getProjectHealth(project, projectTasks, projectMilestones, timestamp),
      unit: 'status',
      category: 'projects',
      sourceModule: MODULE.moduleId,
      entityId: project.id
    });
    const budget = projectBudgetSummary(project);
    if (budget.enabled) {
      if (budget.planned !== null) {
        metrics.push({
          timestamp,
          metricId: 'project_budget_planned',
          value: budget.planned,
          unit: budget.currency,
          category: 'projects',
          sourceModule: MODULE.moduleId,
          entityId: project.id
        });
      }
      if (budget.spent !== null) {
        metrics.push({
          timestamp,
          metricId: 'project_budget_spent',
          value: budget.spent,
          unit: budget.currency,
          category: 'projects',
          sourceModule: MODULE.moduleId,
          entityId: project.id
        });
      }
    }
  }
  return metrics;
}

export async function getEvents() {
  const [tasks, milestones, projects] = await Promise.all([
    getAllRecords('tasks'),
    getAllRecords('milestones'),
    getAllRecords('projects')
  ]);
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const events = [];

  for (const task of tasks) {
    if (!task.dueDate || task.status === 'cancelled') continue;
    events.push({
      eventId: `task:${task.id}:due`,
      sourceModule: MODULE.moduleId,
      type: 'projects.task_due',
      title: task.title,
      startAt: task.dueTime ? `${task.dueDate}T${task.dueTime}` : task.dueDate,
      endAt: null,
      priority: task.priority || 'normal',
      completed: task.status === 'completed',
      projectTitle: projectMap.get(task.projectId)?.title || null
    });
  }

  for (const milestone of milestones) {
    if (!milestone.targetDate || milestone.status === 'cancelled') continue;
    events.push({
      eventId: `milestone:${milestone.id}:due`,
      sourceModule: MODULE.moduleId,
      type: 'projects.milestone_due',
      title: milestone.title,
      startAt: milestone.targetDate,
      endAt: null,
      priority: milestone.priority || 'normal',
      completed: milestone.status === 'completed',
      projectTitle: projectMap.get(milestone.projectId)?.title || null
    });
  }

  for (const project of projects) {
    if (!project.targetDate || project.status === 'archived') continue;
    events.push({
      eventId: `project:${project.id}:due`,
      sourceModule: MODULE.moduleId,
      type: 'projects.project_due',
      title: project.title,
      startAt: project.targetDate,
      endAt: null,
      priority: project.priority || 'normal',
      completed: project.status === 'completed'
    });
  }
  return events;
}

export function getQuickActions() {
  return [
    { id: 'new-task', sourceModule: MODULE.moduleId, label: 'Nuovo task', actionTarget: 'projects/action/new-task' },
    { id: 'new-project', sourceModule: MODULE.moduleId, label: 'Nuovo progetto', actionTarget: 'projects/action/new-project' }
  ];
}
