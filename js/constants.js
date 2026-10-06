export const MODULE = Object.freeze({
  moduleId: 'projects',
  appVersion: '1.0.1',
  schemaVersion: 1,
  dbName: 'alex.projects.db',
  dbVersion: 1,
  namespace: 'alex.projects'
});

export const STORE_NAMES = Object.freeze([
  'projects',
  'milestones',
  'tasks',
  'notes',
  'references',
  'timelineEntries',
  'templates',
  'settings',
  'metadata'
]);

export const ROUTES = Object.freeze({
  home: { title: 'Home' },
  projects: { title: 'Progetti' },
  today: { title: 'Oggi' },
  archive: { title: 'Archivio' },
  settings: { title: 'Impostazioni' }
});

export const PROJECT_STATUSES = Object.freeze([
  { id: 'idea', label: 'Idea' },
  { id: 'planning', label: 'Pianificazione' },
  { id: 'active', label: 'Attivo' },
  { id: 'paused', label: 'Pausa' },
  { id: 'completed', label: 'Completato' },
  { id: 'archived', label: 'Archiviato' }
]);

export const PROJECT_PRIORITIES = Object.freeze([
  { id: 'low', label: 'Bassa' },
  { id: 'normal', label: 'Normale' },
  { id: 'high', label: 'Alta' },
  { id: 'critical', label: 'Critica' }
]);

export const TASK_STATUSES = Object.freeze([
  { id: 'todo', label: 'Da fare' },
  { id: 'in_progress', label: 'In corso' },
  { id: 'waiting', label: 'In attesa' },
  { id: 'completed', label: 'Completato' },
  { id: 'cancelled', label: 'Annullato' }
]);

export const MILESTONE_STATUSES = Object.freeze([
  { id: 'planned', label: 'Pianificata' },
  { id: 'active', label: 'In corso' },
  { id: 'completed', label: 'Completata' },
  { id: 'cancelled', label: 'Annullata' }
]);

export const UI_KEYS = Object.freeze({
  lastRoute: 'alex.projects.ui.lastRoute',
  preferences: 'alex.projects.ui.preferences'
});
