import { deleteRecord, getAllRecords, getRecord, putRecord } from '../db.js';
import { createProject, getProject } from './project-service.js';
import { createMilestone, listMilestonesByProject } from './milestone-service.js';
import { createTask, listTasksByProject, updateTask } from './task-service.js';

const DAY_MS = 86400000;
const BUILTIN_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix = 'tpl') {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function localDateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey, offsetDays = 0) {
  const base = parseDateKey(dateKey);
  if (!base || offsetDays === null || offsetDays === undefined || offsetDays === '') return null;
  base.setDate(base.getDate() + Number(offsetDays || 0));
  return localDateKey(base);
}

export function daysBetween(baseDateKey, dateKey) {
  const base = parseDateKey(baseDateKey);
  const date = parseDateKey(dateKey);
  if (!base || !date) return null;
  return Math.round((date.getTime() - base.getTime()) / DAY_MS);
}

function milestone(key, title, offsetDays, priority = 'normal', description = '') {
  return { key, title, description, status: 'planned', priority, offsetDays };
}

function task(key, title, offsetDays, options = {}) {
  return {
    key,
    title,
    description: options.description || '',
    status: 'todo',
    priority: options.priority || 'normal',
    offsetDays,
    dueTime: options.dueTime || null,
    milestoneKey: options.milestoneKey || null,
    dependsOnKeys: options.dependsOnKeys || [],
    checklist: (options.checklist || []).map(text => ({ text }))
  };
}

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin.app-development',
    name: 'Sviluppo app',
    description: 'Dall’idea a una prima release stabile, con architettura, prototipo, test e rilascio.',
    category: 'Sviluppo', icon: '⌘', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'high', tags: ['app', 'sviluppo'], durationDays: 35 },
    milestones: [
      milestone('m_arch', 'Architettura definita', 5, 'high'),
      milestone('m_proto', 'Prototipo utilizzabile', 14, 'high'),
      milestone('m_test', 'Test completati', 28, 'high'),
      milestone('m_release', 'Release stabile', 35, 'critical')
    ],
    tasks: [
      task('t_scope', 'Definire scopo e requisiti', 2, { priority: 'high', milestoneKey: 'm_arch', checklist: ['Obiettivo', 'Funzioni essenziali', 'Vincoli'] }),
      task('t_model', 'Definire UX e modello dati', 5, { priority: 'high', milestoneKey: 'm_arch', dependsOnKeys: ['t_scope'] }),
      task('t_core', 'Costruire il core funzionante', 12, { priority: 'high', milestoneKey: 'm_proto', dependsOnKeys: ['t_model'] }),
      task('t_proto', 'Preparare il prototipo installabile', 14, { priority: 'high', milestoneKey: 'm_proto', dependsOnKeys: ['t_core'] }),
      task('t_test', 'Testare i flussi principali', 25, { priority: 'high', milestoneKey: 'm_test', dependsOnKeys: ['t_proto'], checklist: ['Creazione dati', 'Modifica dati', 'Offline', 'Backup'] }),
      task('t_fix', 'Correggere problemi emersi dai test', 28, { priority: 'high', milestoneKey: 'm_test', dependsOnKeys: ['t_test'] }),
      task('t_release', 'Chiudere documentazione e release', 35, { priority: 'critical', milestoneKey: 'm_release', dependsOnKeys: ['t_fix'] })
    ]
  },
  {
    id: 'builtin.important-purchase',
    name: 'Acquisto importante',
    description: 'Ricerca, confronto, decisione e acquisto senza perdere criteri, alternative e scadenze.',
    category: 'Acquisti', icon: '◇', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'normal', tags: ['acquisto'], durationDays: 21 },
    milestones: [
      milestone('m_req', 'Criteri definiti', 3, 'high'),
      milestone('m_short', 'Shortlist pronta', 10, 'normal'),
      milestone('m_decision', 'Decisione presa', 17, 'high'),
      milestone('m_buy', 'Acquisto completato', 21, 'high')
    ],
    tasks: [
      task('t_budget', 'Definire budget e criteri', 3, { priority: 'high', milestoneKey: 'm_req', checklist: ['Budget massimo', 'Must-have', 'Nice-to-have'] }),
      task('t_research', 'Raccogliere le alternative', 7, { milestoneKey: 'm_short', dependsOnKeys: ['t_budget'] }),
      task('t_compare', 'Confrontare la shortlist', 10, { priority: 'high', milestoneKey: 'm_short', dependsOnKeys: ['t_research'] }),
      task('t_verify', 'Verificare prezzo, garanzia e disponibilità', 15, { milestoneKey: 'm_decision', dependsOnKeys: ['t_compare'] }),
      task('t_decide', 'Prendere la decisione finale', 17, { priority: 'high', milestoneKey: 'm_decision', dependsOnKeys: ['t_verify'] }),
      task('t_buy', 'Effettuare l’acquisto', 21, { priority: 'high', milestoneKey: 'm_buy', dependsOnKeys: ['t_decide'] })
    ]
  },
  {
    id: 'builtin.trip',
    name: 'Viaggio',
    description: 'Organizza destinazione, prenotazioni, itinerario e preparazione finale in un unico progetto.',
    category: 'Viaggi', icon: '✈︎', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'normal', tags: ['viaggio'], durationDays: 45 },
    milestones: [
      milestone('m_plan', 'Piano definito', 7, 'high'),
      milestone('m_book', 'Prenotazioni principali chiuse', 18, 'high'),
      milestone('m_itinerary', 'Itinerario pronto', 32, 'normal'),
      milestone('m_ready', 'Pronti a partire', 44, 'high')
    ],
    tasks: [
      task('t_dates', 'Definire date, persone e budget', 3, { priority: 'high', milestoneKey: 'm_plan' }),
      task('t_destination', 'Confermare destinazione e durata', 7, { priority: 'high', milestoneKey: 'm_plan', dependsOnKeys: ['t_dates'] }),
      task('t_transport', 'Prenotare trasporti', 14, { priority: 'high', milestoneKey: 'm_book', dependsOnKeys: ['t_destination'] }),
      task('t_stay', 'Prenotare alloggio', 18, { priority: 'high', milestoneKey: 'm_book', dependsOnKeys: ['t_destination'] }),
      task('t_itinerary', 'Preparare itinerario essenziale', 32, { milestoneKey: 'm_itinerary', dependsOnKeys: ['t_transport', 't_stay'] }),
      task('t_docs', 'Controllare documenti e prenotazioni', 40, { priority: 'high', milestoneKey: 'm_ready', checklist: ['Documenti', 'Biglietti', 'Prenotazioni', 'Assicurazione se serve'] }),
      task('t_pack', 'Preparare bagaglio e ultime cose', 44, { milestoneKey: 'm_ready', dependsOnKeys: ['t_docs'] })
    ]
  },
  {
    id: 'builtin.pc-build',
    name: 'Nuovo PC',
    description: 'Dai requisiti alla scelta componenti, acquisto, montaggio e verifica finale.',
    category: 'Tecnologia', icon: '▣', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'high', tags: ['pc', 'hardware'], durationDays: 30 },
    milestones: [
      milestone('m_req', 'Requisiti e budget definiti', 4, 'high'),
      milestone('m_build', 'Build scelta', 12, 'high'),
      milestone('m_parts', 'Componenti acquistati', 20, 'high'),
      milestone('m_done', 'PC configurato e testato', 30, 'critical')
    ],
    tasks: [
      task('t_use', 'Definire utilizzo, target e budget', 4, { priority: 'high', milestoneKey: 'm_req' }),
      task('t_parts', 'Preparare lista componenti', 9, { priority: 'high', milestoneKey: 'm_build', dependsOnKeys: ['t_use'] }),
      task('t_compat', 'Verificare compatibilità e alimentazione', 12, { priority: 'high', milestoneKey: 'm_build', dependsOnKeys: ['t_parts'] }),
      task('t_prices', 'Confrontare prezzi e disponibilità', 16, { milestoneKey: 'm_parts', dependsOnKeys: ['t_compat'] }),
      task('t_buy', 'Acquistare componenti', 20, { priority: 'high', milestoneKey: 'm_parts', dependsOnKeys: ['t_prices'] }),
      task('t_assemble', 'Assemblare e installare il sistema', 26, { priority: 'high', milestoneKey: 'm_done', dependsOnKeys: ['t_buy'] }),
      task('t_bench', 'Testare temperature, stabilità e prestazioni', 30, { priority: 'critical', milestoneKey: 'm_done', dependsOnKeys: ['t_assemble'] })
    ]
  },
  {
    id: 'builtin.car-project',
    name: 'Progetto auto',
    description: 'Per modifiche, restauro, configurazione o sviluppo di un progetto legato all’auto.',
    category: 'Auto', icon: '◆', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'high', tags: ['auto'], durationDays: 60 },
    milestones: [
      milestone('m_goal', 'Obiettivo e vincoli definiti', 7, 'high'),
      milestone('m_solution', 'Soluzione scelta', 21, 'high'),
      milestone('m_execution', 'Esecuzione completata', 50, 'high'),
      milestone('m_validation', 'Verifica finale', 60, 'critical')
    ],
    tasks: [
      task('t_goal', 'Definire risultato, budget e vincoli', 7, { priority: 'high', milestoneKey: 'm_goal' }),
      task('t_options', 'Valutare soluzioni e alternative', 14, { milestoneKey: 'm_solution', dependsOnKeys: ['t_goal'] }),
      task('t_cost', 'Stimare costi, tempi e rischi', 18, { priority: 'high', milestoneKey: 'm_solution', dependsOnKeys: ['t_options'] }),
      task('t_decide', 'Scegliere la soluzione', 21, { priority: 'high', milestoneKey: 'm_solution', dependsOnKeys: ['t_cost'] }),
      task('t_source', 'Reperire componenti o fornitori', 32, { milestoneKey: 'm_execution', dependsOnKeys: ['t_decide'] }),
      task('t_execute', 'Eseguire il lavoro', 50, { priority: 'high', milestoneKey: 'm_execution', dependsOnKeys: ['t_source'] }),
      task('t_validate', 'Verificare risultato, affidabilità e difetti', 60, { priority: 'critical', milestoneKey: 'm_validation', dependsOnKeys: ['t_execute'] })
    ]
  },
  {
    id: 'builtin.complex-goal',
    name: 'Obiettivo complesso',
    description: 'Trasforma un obiettivo personale ampio in fasi, azioni verificabili e revisione finale.',
    category: 'Personale', icon: '◎', source: 'builtin', locked: true, builtinVersion: BUILTIN_VERSION,
    projectDefaults: { status: 'planning', priority: 'normal', tags: ['obiettivo'], durationDays: 42 },
    milestones: [
      milestone('m_define', 'Obiettivo definito', 4, 'high'),
      milestone('m_plan', 'Piano attivo', 10, 'high'),
      milestone('m_review', 'Revisione intermedia', 28, 'normal'),
      milestone('m_finish', 'Obiettivo verificato', 42, 'high')
    ],
    tasks: [
      task('t_define', 'Definire risultato misurabile', 4, { priority: 'high', milestoneKey: 'm_define', checklist: ['Risultato', 'Criterio di successo', 'Vincoli'] }),
      task('t_breakdown', 'Dividere il lavoro in fasi', 8, { milestoneKey: 'm_plan', dependsOnKeys: ['t_define'] }),
      task('t_first', 'Completare la prima azione concreta', 10, { priority: 'high', milestoneKey: 'm_plan', dependsOnKeys: ['t_breakdown'] }),
      task('t_review', 'Fare una revisione intermedia', 28, { milestoneKey: 'm_review', dependsOnKeys: ['t_first'] }),
      task('t_adjust', 'Correggere il piano se necessario', 31, { milestoneKey: 'm_review', dependsOnKeys: ['t_review'] }),
      task('t_finish', 'Completare e verificare il risultato', 42, { priority: 'high', milestoneKey: 'm_finish', dependsOnKeys: ['t_adjust'] })
    ]
  }
];

function normalizeTemplate(record) {
  return {
    id: record.id || uuid(),
    name: String(record.name || '').trim(),
    description: String(record.description || '').trim(),
    category: String(record.category || 'Personale').trim(),
    icon: String(record.icon || '▦').trim().slice(0, 4) || '▦',
    source: record.source === 'builtin' ? 'builtin' : 'custom',
    locked: Boolean(record.locked),
    builtinVersion: record.builtinVersion || null,
    projectDefaults: {
      status: record.projectDefaults?.status || 'planning',
      priority: record.projectDefaults?.priority || 'normal',
      tags: Array.isArray(record.projectDefaults?.tags) ? record.projectDefaults.tags.map(String).filter(Boolean) : [],
      durationDays: Number.isFinite(Number(record.projectDefaults?.durationDays)) ? Number(record.projectDefaults.durationDays) : null
    },
    milestones: Array.isArray(record.milestones) ? record.milestones.map((item, index) => ({
      key: String(item.key || `m_${index + 1}`),
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      status: 'planned',
      priority: item.priority || 'normal',
      offsetDays: item.offsetDays === null || item.offsetDays === undefined || item.offsetDays === '' ? null : (Number.isFinite(Number(item.offsetDays)) ? Number(item.offsetDays) : 0)
    })).filter(item => item.title) : [],
    tasks: Array.isArray(record.tasks) ? record.tasks.map((item, index) => ({
      key: String(item.key || `t_${index + 1}`),
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      status: 'todo',
      priority: item.priority || 'normal',
      offsetDays: item.offsetDays === null || item.offsetDays === undefined || item.offsetDays === '' ? null : (Number.isFinite(Number(item.offsetDays)) ? Number(item.offsetDays) : 0),
      dueTime: item.dueTime || null,
      milestoneKey: item.milestoneKey || null,
      dependsOnKeys: Array.isArray(item.dependsOnKeys) ? [...new Set(item.dependsOnKeys.map(String).filter(Boolean))] : [],
      checklist: Array.isArray(item.checklist) ? item.checklist.map(check => ({ text: String(check.text || check).trim() })).filter(check => check.text) : []
    })).filter(item => item.title) : [],
    createdAt: record.createdAt || nowIso(),
    updatedAt: record.updatedAt || nowIso()
  };
}

export async function ensureBuiltInTemplates() {
  for (const definition of BUILTIN_TEMPLATES) {
    const existing = await getRecord('templates', definition.id);
    const record = normalizeTemplate({
      ...definition,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: existing?.builtinVersion === BUILTIN_VERSION ? existing.updatedAt : nowIso()
    });
    if (!existing || existing.builtinVersion !== BUILTIN_VERSION) await putRecord('templates', record);
  }
}

export async function listTemplates() {
  const all = await getAllRecords('templates');
  return all.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), 'it');
  });
}

export async function getTemplate(id) {
  return getRecord('templates', id);
}

export async function deleteTemplate(id) {
  const template = await getTemplate(id);
  if (!template) return false;
  if (template.source === 'builtin' || template.locked) throw new Error('I template predefiniti non possono essere eliminati.');
  await deleteRecord('templates', id);
  return true;
}

function projectBaseDate(project, milestones, tasks) {
  if (project.startDate) return project.startDate;
  const dates = [
    project.targetDate,
    ...milestones.map(item => item.targetDate),
    ...tasks.map(item => item.dueDate)
  ].filter(Boolean).sort();
  return dates[0] || localDateKey();
}

export async function createTemplateFromProject(projectId, input = {}) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Progetto non trovato.');
  const [milestones, tasks] = await Promise.all([
    listMilestonesByProject(projectId, { includeCancelled: false }),
    listTasksByProject(projectId, { includeCancelled: false })
  ]);
  const baseDate = projectBaseDate(project, milestones, tasks);
  const milestoneKeys = new Map(milestones.map((item, index) => [item.id, `m_${index + 1}`]));
  const taskKeys = new Map(tasks.map((item, index) => [item.id, `t_${index + 1}`]));
  const durationCandidates = [
    project.targetDate ? daysBetween(baseDate, project.targetDate) : null,
    ...milestones.map(item => daysBetween(baseDate, item.targetDate)),
    ...tasks.map(item => daysBetween(baseDate, item.dueDate))
  ].filter(value => Number.isFinite(value));

  const template = normalizeTemplate({
    id: uuid(),
    name: String(input.name || `${project.title} — modello`).trim(),
    description: String(input.description || `Template creato dal progetto “${project.title}”.`).trim(),
    category: String(input.category || 'Personale').trim(),
    icon: input.icon || '▦',
    source: 'custom',
    locked: false,
    projectDefaults: {
      status: 'planning',
      priority: project.priority || 'normal',
      tags: project.tags || [],
      durationDays: durationCandidates.length ? Math.max(0, ...durationCandidates) : null
    },
    milestones: milestones.map(item => ({
      key: milestoneKeys.get(item.id),
      title: item.title,
      description: item.description || '',
      priority: item.priority || 'normal',
      offsetDays: item.targetDate ? Math.max(0, daysBetween(baseDate, item.targetDate) ?? 0) : null
    })),
    tasks: tasks.map(item => ({
      key: taskKeys.get(item.id),
      title: item.title,
      description: item.description || '',
      priority: item.priority || 'normal',
      offsetDays: item.dueDate ? Math.max(0, daysBetween(baseDate, item.dueDate) ?? 0) : null,
      dueTime: item.dueTime || null,
      milestoneKey: milestoneKeys.get(item.milestoneId) || null,
      dependsOnKeys: (item.dependencyIds || []).map(id => taskKeys.get(id)).filter(Boolean),
      checklist: (item.checklist || []).map(check => ({ text: check.text }))
    }))
  });
  if (!template.name) throw new Error('Inserisci un nome per il template.');
  if (!template.tasks.length && !template.milestones.length) throw new Error('Il progetto non contiene task o milestone da trasformare in template.');
  await putRecord('templates', template);
  return template;
}

export async function createProjectFromTemplate(templateId, input = {}) {
  const template = await getTemplate(templateId);
  if (!template) throw new Error('Template non trovato.');
  const baseDate = input.startDate || localDateKey();
  const durationDays = Number(template.projectDefaults?.durationDays);
  const project = await createProject({
    ...template.projectDefaults,
    ...input,
    startDate: baseDate,
    targetDate: input.targetDate || (Number.isFinite(durationDays) ? addDays(baseDate, durationDays) : null),
    blocked: Boolean(input.blocked),
    blockedReason: input.blocked ? String(input.blockedReason || '') : ''
  });

  try {
    const milestoneIds = new Map();
    for (const item of template.milestones || []) {
      const created = await createMilestone({
        projectId: project.id,
        title: item.title,
        description: item.description,
        status: 'planned',
        priority: item.priority,
        targetDate: addDays(baseDate, item.offsetDays)
      });
      milestoneIds.set(item.key, created.id);
    }

    const taskIds = new Map();
    const createdTasks = new Map();
    for (const item of template.tasks || []) {
      const created = await createTask({
        projectId: project.id,
        milestoneId: milestoneIds.get(item.milestoneKey) || null,
        title: item.title,
        description: item.description,
        status: 'todo',
        priority: item.priority,
        dueDate: addDays(baseDate, item.offsetDays),
        dueTime: item.dueTime || null,
        checklist: (item.checklist || []).map(check => ({ text: check.text, completed: false })),
        dependencyIds: []
      });
      taskIds.set(item.key, created.id);
      createdTasks.set(item.key, created);
    }

    for (const item of template.tasks || []) {
      const dependencyIds = (item.dependsOnKeys || []).map(key => taskIds.get(key)).filter(Boolean);
      if (!dependencyIds.length) continue;
      const current = createdTasks.get(item.key);
      await updateTask(current.id, { ...current, dependencyIds });
    }

    const appliedAt = nowIso();
    await putRecord('projects', {
      ...project,
      templateId: template.id,
      templateName: template.name,
      updatedAt: appliedAt
    });
    await putRecord('timelineEntries', {
      id: uuid('e'),
      projectId: project.id,
      type: 'template.applied',
      title: 'Template applicato',
      detail: template.name,
      source: 'system',
      entityType: 'template',
      entityId: template.id,
      occurredAt: appliedAt,
      createdAt: appliedAt,
      updatedAt: appliedAt
    });
    return await getProject(project.id);
  } catch (error) {
    // Evita di lasciare un progetto parzialmente generato se l’istanziazione fallisce.
    const { deleteProject } = await import('./project-service.js');
    await deleteProject(project.id);
    throw error;
  }
}

export function templateSummary(template) {
  return {
    milestoneCount: template?.milestones?.length || 0,
    taskCount: template?.tasks?.length || 0,
    durationDays: Number.isFinite(Number(template?.projectDefaults?.durationDays)) ? Number(template.projectDefaults.durationDays) : null
  };
}
