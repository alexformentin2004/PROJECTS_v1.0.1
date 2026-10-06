import { MODULE } from '../constants.js';
import {
  getTodaySummary,
  getTodayOverview,
  getDashboardData,
  getHubSummary,
  getInsights,
  getEvents,
  getQuickActions
} from '../integration.js';
import { createExportPayload } from './backup-service.js';

export const ALEX_INTEGRATION = Object.freeze({
  protocol: 'alex-hub-module',
  protocolVersion: 1,
  moduleApiVersion: '1.0.0',
  contracts: Object.freeze({
    today: 1,
    hubSummary: 1,
    insights: 1,
    events: 1,
    quickActions: 1,
    globalBackup: 1,
    actionTarget: 1
  }),
  capabilities: Object.freeze([
    'today.summary',
    'today.overview',
    'hub.summary',
    'insights.metrics',
    'events.normalized',
    'quickActions',
    'backup.moduleContribution',
    'actionTarget.resolve'
  ])
});

export function getModuleDescriptor() {
  return {
    protocol: ALEX_INTEGRATION.protocol,
    protocolVersion: ALEX_INTEGRATION.protocolVersion,
    moduleApiVersion: ALEX_INTEGRATION.moduleApiVersion,
    moduleId: MODULE.moduleId,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    namespace: MODULE.namespace,
    standalone: true,
    offlineFirst: true,
    contracts: { ...ALEX_INTEGRATION.contracts },
    capabilities: [...ALEX_INTEGRATION.capabilities]
  };
}

export function parseActionTarget(target) {
  const raw = String(target || '').trim().replace(/^#?\/?/, '');
  if (!raw) return { valid: false, reason: 'empty_target' };
  const segments = raw.split('/').filter(Boolean);
  if (segments[0] !== MODULE.moduleId) return { valid: false, reason: 'wrong_module', moduleId: segments[0] || null };

  if (segments[1] === 'action' && ['new-task', 'new-project'].includes(segments[2])) {
    return {
      valid: true,
      kind: 'quickAction',
      moduleId: MODULE.moduleId,
      actionId: segments[2],
      target: `${MODULE.moduleId}/action/${segments[2]}`
    };
  }

  if (segments[1] === 'project' && segments[2]) {
    const projectId = segments[2];
    if (segments.length === 3) {
      return {
        valid: true,
        kind: 'navigation',
        moduleId: MODULE.moduleId,
        projectId,
        route: `projects/project/${projectId}`,
        target: `${MODULE.moduleId}/project/${projectId}`
      };
    }
    if (segments[3] === 'task' && segments[4] && segments.length === 5) {
      return {
        valid: true,
        kind: 'navigation',
        moduleId: MODULE.moduleId,
        projectId,
        taskId: segments[4],
        route: `projects/project/${projectId}/task/${segments[4]}`,
        target: `${MODULE.moduleId}/project/${projectId}/task/${segments[4]}`
      };
    }
  }

  return { valid: false, reason: 'unsupported_target', moduleId: MODULE.moduleId };
}

export async function dispatchActionTarget(target, handlers = {}) {
  const intent = parseActionTarget(target);
  if (!intent.valid) return intent;

  if (intent.kind === 'navigation') {
    if (typeof handlers.navigate === 'function') await handlers.navigate(intent.route, intent);
    return { ...intent, handled: typeof handlers.navigate === 'function' };
  }

  if (intent.actionId === 'new-project') {
    if (typeof handlers.newProject === 'function') await handlers.newProject(intent);
    return { ...intent, handled: typeof handlers.newProject === 'function' };
  }
  if (intent.actionId === 'new-task') {
    if (typeof handlers.newTask === 'function') await handlers.newTask(intent);
    return { ...intent, handled: typeof handlers.newTask === 'function' };
  }
  return { ...intent, handled: false };
}

export async function getGlobalBackupContribution() {
  const payload = await createExportPayload();
  return {
    format: 'alex-hub-module-backup',
    formatVersion: 1,
    moduleId: MODULE.moduleId,
    namespace: MODULE.namespace,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    exportedAt: payload.exportedAt,
    storageKey: `modules.${MODULE.moduleId}`,
    payload
  };
}

export async function getIntegrationSnapshot({ includeInsights = true, includeEvents = true, includeTodayOverview = false } = {}) {
  const [today, hubSummary, quickActions, insights, events, todayOverview] = await Promise.all([
    getTodaySummary(),
    getHubSummary(),
    Promise.resolve(getQuickActions()),
    includeInsights ? getInsights() : Promise.resolve(null),
    includeEvents ? getEvents() : Promise.resolve(null),
    includeTodayOverview ? getTodayOverview() : Promise.resolve(null)
  ]);
  const result = {
    generatedAt: new Date().toISOString(),
    module: getModuleDescriptor(),
    today,
    hubSummary,
    quickActions
  };
  if (insights !== null) result.insights = insights;
  if (events !== null) result.events = events;
  if (todayOverview !== null) result.todayOverview = todayOverview;
  return result;
}

export async function getIntegrationDiagnostics() {
  const [today, hubSummary, insights, events] = await Promise.all([
    getTodaySummary(),
    getHubSummary(),
    getInsights(),
    getEvents()
  ]);
  const quickActions = getQuickActions();
  return {
    descriptor: getModuleDescriptor(),
    counts: {
      todayItems: today.length,
      hubSummaryItems: hubSummary.length,
      insights: insights.length,
      events: events.length,
      quickActions: quickActions.length
    },
    checks: {
      hubSummaryRange: hubSummary.length >= 2 && hubSummary.length <= 5,
      todayNormalized: today.every(item => item && item.title && item.status && item.priority && item.shortText),
      insightsNormalized: insights.every(item => item && item.timestamp && item.metricId && 'value' in item && item.unit && item.category && item.sourceModule === MODULE.moduleId),
      eventsNormalized: events.every(item => item && item.eventId && item.sourceModule === MODULE.moduleId && item.type && item.title && item.startAt && item.priority),
      quickActionsNormalized: quickActions.every(item => item && item.id && item.label && item.actionTarget && item.sourceModule === MODULE.moduleId)
    }
  };
}

export function createAlexModuleBridge(handlers = {}) {
  return Object.freeze({
    descriptor: getModuleDescriptor(),
    getTodaySummary,
    getHubSummary,
    getInsights,
    getEvents,
    getQuickActions,
    getIntegrationSnapshot,
    getGlobalBackupContribution,
    resolveActionTarget: parseActionTarget,
    dispatchActionTarget: target => dispatchActionTarget(target, handlers)
  });
}
