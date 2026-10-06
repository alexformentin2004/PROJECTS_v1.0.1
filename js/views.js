import {
  MODULE,
  MILESTONE_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES
} from './constants.js';
import { getDashboardData, getTodayOverview } from './integration.js';
import { getIntegrationDiagnostics } from './services/integration-service.js';
import { getAllRecords, getStoreCounts } from './db.js';
import { getProject, listProjects, projectBudgetSummary, projectSearchText } from './services/project-service.js';
import {
  listTasksByProject,
  taskBlockers,
  taskIsBlocked,
  taskProgress
} from './services/task-service.js';
import { listMilestonesByProject, milestoneProgress } from './services/milestone-service.js';
import { listNotesByProject } from './services/note-service.js';
import { listReferencesByProject } from './services/reference-service.js';
import { isManualTimelineEntry, listTimelineByProject } from './services/timeline-service.js';
import {
  getProjectHealth,
  getProjectIntelligence,
  localDateKey,
  projectProgress
} from './services/project-intelligence.js';

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const STATUS_LABELS = Object.fromEntries(PROJECT_STATUSES.map(item => [item.id, item.label]));
const PRIORITY_LABELS = Object.fromEntries(PROJECT_PRIORITIES.map(item => [item.id, item.label]));
const TASK_STATUS_LABELS = Object.fromEntries(TASK_STATUSES.map(item => [item.id, item.label]));
const MILESTONE_STATUS_LABELS = Object.fromEntries(MILESTONE_STATUSES.map(item => [item.id, item.label]));
const HEALTH_LABELS = {
  on_track: 'In linea',
  at_risk: 'A rischio',
  overdue: 'In ritardo',
  blocked: 'Bloccato',
  completed: 'Completato',
  archived: 'Archiviato'
};
const HEALTH_COPY = {
  on_track: 'Nessun segnale critico rilevato.',
  at_risk: 'Richiede attenzione per scadenze vicine, task bloccati o budget oltre il previsto.',
  overdue: 'Una scadenza del progetto, di un task o di una milestone è già passata.',
  blocked: 'Il progetto è stato dichiarato bloccato.',
  completed: 'Il progetto è completato.',
  archived: 'Il progetto è archiviato.'
};

function formatDate(dateKey) {
  if (!dateKey) return 'Nessuna';
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function formatDue(task) {
  if (!task.dueDate) return 'Nessuna scadenza';
  return `${formatDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ''}`;
}

function emptyState(icon, title, text, action = '') {
  return `
    <section class="empty-state card">
      <div class="empty-icon" aria-hidden="true">${icon}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${action ? `<p class="empty-action">${esc(action)}</p>` : ''}
    </section>`;
}

function progressBar(value, label = 'Avanzamento') {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `
    <div class="progress-block" aria-label="${esc(label)} ${safe}%">
      <div class="progress-meta"><span>${esc(label)}</span><strong>${safe}%</strong></div>
      <div class="progress-track"><span style="width:${safe}%"></span></div>
    </div>`;
}

function projectBadges(project, health = 'on_track') {
  return `
    <div class="badge-row">
      <span class="badge status-badge status-${esc(project.status)}">${esc(STATUS_LABELS[project.status] || project.status)}</span>
      <span class="badge priority-${esc(project.priority)}">${esc(PRIORITY_LABELS[project.priority] || project.priority)}</span>
      ${health !== 'on_track' && !['completed', 'archived'].includes(health) ? `<span class="badge health-${esc(health)}">${esc(HEALTH_LABELS[health])}</span>` : ''}
    </div>`;
}

function renderNextAction(action, { compact = false } = {}) {
  if (!action) return '';
  return `
    <button class="next-action-card ${compact ? 'compact-next-action' : ''}" type="button" data-action-target="${esc(action.actionTarget)}">
      <div class="next-action-icon">→</div>
      <div class="next-action-copy">
        <span>PROSSIMA AZIONE</span>
        <strong>${esc(action.title)}</strong>
        <small>${esc(action.projectTitle ? `${action.projectTitle} · ${action.reason}` : action.reason)}</small>
      </div>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
}

function renderProjectCard(project, allTasks = [], allMilestones = []) {
  const search = projectSearchText(project);
  const target = project.targetDate ? formatDate(project.targetDate) : 'Nessuna scadenza';
  const intelligence = getProjectIntelligence(project, allTasks, allMilestones);
  const projectTasks = allTasks.filter(task => task.projectId === project.id && task.status !== 'cancelled');
  return `
    <button class="project-card card" type="button"
      data-project-card
      data-project-open="${esc(project.id)}"
      data-search="${esc(search)}"
      data-status="${esc(project.status)}"
      data-priority="${esc(project.priority)}">
      <div class="project-card-top">
        <div>
          ${projectBadges(project, intelligence.health)}
          <h3>${esc(project.title)}</h3>
        </div>
        <span class="chevron" aria-hidden="true">›</span>
      </div>
      ${project.description ? `<p class="project-description">${esc(project.description)}</p>` : ''}
      ${project.blocked ? `<div class="blocked-note"><strong>Bloccato:</strong> ${esc(project.blockedReason)}</div>` : ''}
      ${projectTasks.length ? progressBar(intelligence.progress) : ''}
      ${intelligence.nextAction ? `<div class="project-next-line"><span>→ ${esc(intelligence.nextAction.title)}</span><small>${esc(intelligence.nextAction.reason)}</small></div>` : ''}
      <div class="project-meta-row">
        <span>${projectTasks.length ? `${projectTasks.filter(task => task.status === 'completed').length}/${projectTasks.length} task` : 'Scadenza'}</span>
        <strong>${esc(target)}</strong>
      </div>
      ${project.tags?.length ? `<div class="tag-row">${project.tags.slice(0, 4).map(tag => `<span>#${esc(tag)}</span>`).join('')}</div>` : ''}
    </button>`;
}

function renderProjectList(projects, allTasks, allMilestones, archive = false) {
  if (!projects.length) {
    return emptyState(
      archive ? '▤' : '▦',
      archive ? 'Archivio vuoto' : 'Nessun progetto ancora',
      archive ? 'I progetti completati o archiviati compariranno qui.' : 'Crea il tuo primo progetto e PROJECTS inizierà a organizzare scadenze, task e milestone.',
      archive ? '' : 'Tocca + oppure “Nuovo progetto”.'
    );
  }
  return `
    <section class="project-list" id="projectList">
      ${projects.map(project => renderProjectCard(project, allTasks, allMilestones)).join('')}
    </section>
    <section id="filteredEmpty" class="empty-state card compact-empty" hidden>
      <div class="empty-icon" aria-hidden="true">⌕</div>
      <h2>Nessun risultato</h2>
      <p>Prova a cambiare ricerca o filtri.</p>
    </section>`;
}

function renderProjectToolbar({ archive = false } = {}) {
  return `
    <section class="toolbar-card card filter-toolbar" data-filter-toolbar>
      <label class="search-field">
        <span aria-hidden="true">⌕</span>
        <input id="projectSearch" type="search" placeholder="${archive ? 'Cerca nell’archivio' : 'Cerca progetti'}" autocomplete="off" aria-label="Cerca progetti" />
      </label>
      <div class="filter-row">
        <label class="select-field">
          <span>Stato</span>
          <select id="statusFilter" aria-label="Filtra per stato">
            <option value="">Tutti</option>
            ${PROJECT_STATUSES.filter(item => archive ? ['completed', 'archived'].includes(item.id) : !['completed', 'archived'].includes(item.id)).map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}
          </select>
        </label>
        <label class="select-field">
          <span>Priorità</span>
          <select id="priorityFilter" aria-label="Filtra per priorità">
            <option value="">Tutte</option>
            ${PROJECT_PRIORITIES.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('')}
          </select>
        </label>
      </div>
    </section>`;
}

function renderTaskCard(task, allTasks, milestones, editable, focusTaskId = null) {
  const blocked = taskIsBlocked(task, allTasks);
  const blockers = taskBlockers(task, allTasks);
  const milestone = milestones.find(item => item.id === task.milestoneId);
  const progress = taskProgress(task);
  const checklist = task.checklist || [];
  const checklistDone = checklist.filter(item => item.completed).length;
  const overdue = task.dueDate && task.dueDate < localDateKey() && !['completed', 'cancelled'].includes(task.status);
  const focused = focusTaskId === task.id;
  return `
    <article id="task-${esc(task.id)}" class="task-card card ${task.status === 'completed' ? 'is-completed' : ''} ${blocked ? 'is-blocked' : ''} ${focused ? 'task-focus' : ''}" ${focused ? 'data-focus-task' : ''}>
      <div class="task-main-row">
        <button class="task-check ${task.status === 'completed' ? 'checked' : ''}" type="button" data-task-toggle="${esc(task.id)}" aria-label="${task.status === 'completed' ? 'Riapri task' : 'Completa task'}" ${!editable || (blocked && task.status !== 'completed') ? 'disabled' : ''}>${task.status === 'completed' ? '✓' : ''}</button>
        <div class="task-copy">
          <div class="badge-row compact-badges">
            <span class="badge task-status-${esc(task.status)}">${esc(TASK_STATUS_LABELS[task.status] || task.status)}</span>
            <span class="badge priority-${esc(task.priority)}">${esc(PRIORITY_LABELS[task.priority] || task.priority)}</span>
            ${blocked ? '<span class="badge health-blocked">Bloccato</span>' : ''}
            ${overdue ? '<span class="badge health-overdue">Scaduto</span>' : ''}
          </div>
          <h3>${esc(task.title)}</h3>
          ${task.description ? `<p>${esc(task.description)}</p>` : ''}
        </div>
        ${editable ? `<button class="mini-icon-button" type="button" data-task-edit="${esc(task.id)}" aria-label="Modifica task">•••</button>` : ''}
      </div>
      <div class="task-meta-line">
        <span>${esc(formatDue(task))}</span>
        ${milestone ? `<span>◆ ${esc(milestone.title)}</span>` : ''}
      </div>
      ${blocked ? `<div class="dependency-warning"><strong>In attesa di:</strong> ${blockers.map(item => esc(item.title)).join(', ')}</div>` : ''}
      ${(task.dependencyIds || []).length && !blocked ? `<div class="dependency-ok">✓ Prerequisiti completati</div>` : ''}
      ${checklist.length ? `
        <div class="inline-checklist">
          <div class="checklist-heading"><span>Checklist</span><strong>${checklistDone}/${checklist.length}</strong></div>
          ${checklist.map(item => `
            <label class="checklist-line ${item.completed ? 'done' : ''}">
              <input type="checkbox" data-checklist-toggle data-task-id="${esc(task.id)}" data-item-id="${esc(item.id)}" ${item.completed ? 'checked' : ''} ${editable ? '' : 'disabled'} />
              <span>${esc(item.text)}</span>
            </label>`).join('')}
        </div>` : ''}
      ${checklist.length ? progressBar(progress, 'Checklist') : ''}
      ${editable ? `<div class="row-actions"><button class="text-button danger-text" type="button" data-task-delete="${esc(task.id)}">Elimina task</button></div>` : ''}
    </article>`;
}

function renderMilestoneCard(milestone, projectTasks, editable) {
  const progress = milestoneProgress(milestone, projectTasks);
  const linkedTasks = projectTasks.filter(task => task.milestoneId === milestone.id && task.status !== 'cancelled');
  const overdue = milestone.targetDate && milestone.targetDate < localDateKey() && !['completed', 'cancelled'].includes(milestone.status);
  return `
    <article class="milestone-card card ${milestone.status === 'completed' ? 'is-completed' : ''}">
      <div class="milestone-top">
        <div>
          <div class="badge-row compact-badges">
            <span class="badge milestone-status-${esc(milestone.status)}">${esc(MILESTONE_STATUS_LABELS[milestone.status] || milestone.status)}</span>
            <span class="badge priority-${esc(milestone.priority)}">${esc(PRIORITY_LABELS[milestone.priority] || milestone.priority)}</span>
            ${overdue ? '<span class="badge health-overdue">Scaduta</span>' : ''}
          </div>
          <h3>${esc(milestone.title)}</h3>
          ${milestone.description ? `<p>${esc(milestone.description)}</p>` : ''}
        </div>
        ${editable ? `<button class="mini-icon-button" type="button" data-milestone-edit="${esc(milestone.id)}" aria-label="Modifica milestone">•••</button>` : ''}
      </div>
      <div class="task-meta-line"><span>${esc(milestone.targetDate ? formatDate(milestone.targetDate) : 'Nessuna scadenza')}</span><span>${linkedTasks.length} task</span></div>
      ${progressBar(progress, 'Avanzamento')}
      ${editable ? `
        <div class="milestone-actions">
          <button class="secondary-button compact-action" type="button" data-milestone-status="${milestone.status === 'completed' ? 'planned' : 'completed'}" data-milestone-id="${esc(milestone.id)}">${milestone.status === 'completed' ? 'Riapri' : 'Completa'}</button>
          <button class="text-button danger-text" type="button" data-milestone-delete="${esc(milestone.id)}">Elimina</button>
        </div>` : ''}
    </article>`;
}


function formatTimestamp(value) {
  if (!value) return 'Data non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function formatMoney(value, currency = 'EUR') {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(number);
  } catch {
    return `${number.toFixed(2)} ${currency || ''}`.trim();
  }
}

function renderBudget(project) {
  const budget = projectBudgetSummary(project);
  if (!budget.enabled) {
    return `
      <article class="context-empty-card card">
        <div><span class="context-glyph">€</span><div><strong>Budget non attivo</strong><p>Usalo solo quando il progetto ha un costo da tenere sotto controllo.</p></div></div>
        <button class="secondary-button compact-action" type="button" data-budget-edit="${esc(project.id)}">Configura</button>
      </article>`;
  }
  const overspent = budget.remaining !== null && budget.remaining < 0;
  return `
    <article class="budget-card card ${overspent ? 'budget-over' : ''}">
      <div class="budget-grid">
        <div><span>Previsto</span><strong>${esc(formatMoney(budget.planned, budget.currency))}</strong></div>
        <div><span>Speso</span><strong>${esc(formatMoney(budget.spent ?? 0, budget.currency))}</strong></div>
        <div><span>${overspent ? 'Oltre budget' : 'Residuo'}</span><strong>${esc(formatMoney(budget.remaining, budget.currency))}</strong></div>
      </div>
      ${budget.percentSpent !== null ? progressBar(Math.min(100, budget.percentSpent), `Budget usato${budget.percentSpent > 100 ? ` (${budget.percentSpent}%)` : ''}`) : ''}
      ${budget.note ? `<p class="budget-note">${esc(budget.note)}</p>` : ''}
      <div class="row-actions"><button class="text-button" type="button" data-budget-edit="${esc(project.id)}">Modifica budget</button></div>
    </article>`;
}

function renderNoteCard(note) {
  return `
    <article class="note-card card ${note.pinned ? 'note-pinned' : ''}">
      <div class="context-card-top">
        <div class="context-title-row">${note.pinned ? '<span class="pin-mark" aria-label="In evidenza">◆</span>' : ''}<h3>${esc(note.title)}</h3></div>
        <button class="mini-icon-button" type="button" data-note-edit="${esc(note.id)}" aria-label="Modifica nota">•••</button>
      </div>
      <p class="note-body">${esc(note.body)}</p>
      <div class="context-meta"><span>Aggiornata ${esc(formatTimestamp(note.updatedAt))}</span></div>
      <div class="context-actions">
        <button class="text-button" type="button" data-note-pin="${esc(note.id)}">${note.pinned ? 'Togli evidenza' : 'Metti in evidenza'}</button>
        <button class="text-button danger-text" type="button" data-note-delete="${esc(note.id)}">Elimina</button>
      </div>
    </article>`;
}

function safeExternalUrl(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function referenceTypeMeta(reference) {
  if (reference.type === 'file_reference') return { glyph: '▤', label: 'File' };
  if (reference.type === 'text_reference') return { glyph: '≡', label: 'Testo' };
  return { glyph: '↗', label: 'Link' };
}

function renderReferenceCard(reference) {
  const meta = referenceTypeMeta(reference);
  const href = safeExternalUrl(reference.url);
  let content = '';
  if (reference.type === 'link') {
    content = href
      ? `<a class="reference-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Apri link <span>↗</span></a><small>${esc(href)}</small>`
      : '<small>Link non disponibile</small>';
  } else if (reference.type === 'file_reference') {
    content = `<strong class="reference-value">${esc(reference.fileName || 'File')}</strong>${reference.fileHint ? `<p>${esc(reference.fileHint)}</p>` : ''}${href ? `<a class="reference-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Apri link condiviso <span>↗</span></a>` : ''}`;
  } else {
    content = `<p class="reference-text">${esc(reference.text || '')}</p>`;
  }
  return `
    <article class="reference-card card">
      <div class="context-card-top">
        <div class="reference-heading"><span class="reference-glyph">${meta.glyph}</span><div><small>${meta.label}</small><h3>${esc(reference.label)}</h3></div></div>
        <button class="mini-icon-button" type="button" data-reference-edit="${esc(reference.id)}" aria-label="Modifica riferimento">•••</button>
      </div>
      <div class="reference-content">${content}</div>
      <div class="context-actions"><span class="context-meta">${esc(formatTimestamp(reference.updatedAt))}</span><button class="text-button danger-text" type="button" data-reference-delete="${esc(reference.id)}">Elimina</button></div>
    </article>`;
}

const HIDDEN_TIMELINE_TYPES = new Set(['task.updated', 'milestone.updated', 'note.updated', 'reference.updated']);

function timelineMeta(entry) {
  if (isManualTimelineEntry(entry)) return { glyph: '✎', label: 'Nota manuale' };
  if (entry.type?.startsWith('project.')) return { glyph: '▦', label: 'Progetto' };
  if (entry.type?.startsWith('task.')) return { glyph: '✓', label: 'Task' };
  if (entry.type?.startsWith('milestone.')) return { glyph: '◆', label: 'Milestone' };
  if (entry.type?.startsWith('budget.')) return { glyph: '€', label: 'Budget' };
  if (entry.type?.startsWith('note.')) return { glyph: '✎', label: 'Nota' };
  if (entry.type?.startsWith('reference.')) return { glyph: '↗', label: 'Riferimento' };
  if (entry.type?.startsWith('template.')) return { glyph: '▦', label: 'Template' };
  return { glyph: '•', label: 'Evento' };
}

function renderTimelineEntry(entry) {
  const meta = timelineMeta(entry);
  return `
    <article class="timeline-entry">
      <div class="timeline-rail"><span>${meta.glyph}</span></div>
      <div class="timeline-content card">
        <div class="timeline-top"><span>${esc(meta.label)}</span><time>${esc(formatTimestamp(entry.occurredAt || entry.createdAt))}</time></div>
        <h3>${esc(entry.title || 'Evento')}</h3>
        ${entry.detail ? `<p>${esc(entry.detail)}</p>` : ''}
        ${isManualTimelineEntry(entry) ? `<div class="row-actions"><button class="text-button danger-text" type="button" data-timeline-delete="${esc(entry.id)}">Elimina evento</button></div>` : ''}
      </div>
    </article>`;
}

function attentionItem(item) {
  return `
    <button class="attention-card card interactive-row" type="button" data-action-target="${esc(item.actionTarget || '')}">
      <div class="status-dot status-${esc(item.status)}"></div>
      <div><strong>${esc(item.title)}</strong><p>${esc(item.shortText)}</p></div>
      <span class="priority-pill">${esc(PRIORITY_LABELS[item.priority] || item.priority)}</span>
    </button>`;
}

function todayGroup(title, subtitle, items, tone = '') {
  if (!items.length) return '';
  return `
    <section class="today-group ${tone ? `today-group-${tone}` : ''}">
      <div class="section-heading"><h2>${esc(title)}</h2><span>${items.length}${subtitle ? ` · ${esc(subtitle)}` : ''}</span></div>
      <div class="attention-list">${items.map(attentionItem).join('')}</div>
    </section>`;
}

export async function renderHome() {
  const [dashboard, operationalProjects, allTasks, allMilestones] = await Promise.all([
    getDashboardData(),
    listProjects({ archived: false }),
    getAllRecords('tasks'),
    getAllRecords('milestones')
  ]);
  const topProjects = dashboard.projects.slice(0, 4)
    .map(item => operationalProjects.find(project => project.id === item.id))
    .filter(Boolean);
  const attention = [
    ...dashboard.todayOverview.overdue,
    ...dashboard.todayOverview.blocked,
    ...dashboard.todayOverview.dueToday
  ].slice(0, 4);

  return `
    <section class="hero-card card dashboard-hero">
      <div>
        <p class="section-kicker">DASHBOARD</p>
        <h2>${dashboard.counts.operational ? `${dashboard.counts.operational} progetti in movimento.` : 'Pronto per il primo progetto.'}</h2>
        <p>${dashboard.counts.overdue ? `${dashboard.counts.overdue} attività in ritardo richiedono attenzione.` : dashboard.healthCounts.blocked ? `${dashboard.healthCounts.blocked} progetti sono bloccati.` : 'Nessuna urgenza critica rilevata.'}</p>
      </div>
      <button class="primary-button hero-action" type="button" data-action="new-project">＋ Nuovo progetto</button>
    </section>

    ${dashboard.focusAction ? `<section>${renderNextAction(dashboard.focusAction)}</section>` : ''}

    <section>
      <div class="section-heading"><h2>Salute progetti</h2><span>Automatica</span></div>
      <div class="health-grid">
        <button class="health-metric card" type="button" data-nav="projects"><span class="health-dot health-on_track"></span><strong>${dashboard.healthCounts.on_track}</strong><small>In linea</small></button>
        <button class="health-metric card" type="button" data-nav="projects"><span class="health-dot health-at_risk"></span><strong>${dashboard.healthCounts.at_risk}</strong><small>A rischio</small></button>
        <button class="health-metric card" type="button" data-nav="today"><span class="health-dot health-overdue"></span><strong>${dashboard.healthCounts.overdue}</strong><small>In ritardo</small></button>
        <button class="health-metric card" type="button" data-nav="today"><span class="health-dot health-blocked"></span><strong>${dashboard.healthCounts.blocked}</strong><small>Bloccati</small></button>
      </div>
    </section>

    <section>
      <div class="section-heading"><h2>Oggi</h2><span>${dashboard.counts.tasksToday} oggi · ${dashboard.counts.overdue} scaduti</span></div>
      ${attention.length ? attention.map(attentionItem).join('') : emptyState('✓', 'Niente di urgente', 'Non ci sono task scaduti, task di oggi o blocchi che richiedono intervento.')}
      <button class="secondary-button full-button dashboard-more" type="button" data-nav="today">Apri Oggi</button>
    </section>

    <section>
      <div class="section-heading"><h2>Progetti da tenere d’occhio</h2><span>${topProjects.length}</span></div>
      ${topProjects.length ? `<div class="project-list home-project-list">${topProjects.map(project => renderProjectCard(project, allTasks, allMilestones)).join('')}</div>` : emptyState('＋', 'Inizia da un progetto', 'PROJECTS diventa utile quando gli dai un obiettivo concreto da portare avanti.')}
    </section>

    <section class="card system-strip">
      <div><span class="system-indicator"></span><strong>Offline-first attivo</strong></div>
      <small>IndexedDB + Service Worker</small>
    </section>`;
}

export async function renderProjects() {
  const [projects, allTasks, allMilestones] = await Promise.all([
    listProjects({ archived: false }),
    getAllRecords('tasks'),
    getAllRecords('milestones')
  ]);
  return `
    <section class="list-header">
      <div><p class="section-kicker">OPERATIVI</p><h2>${projects.length} ${projects.length === 1 ? 'progetto' : 'progetti'}</h2></div>
      <div class="list-header-actions"><button class="secondary-button compact" type="button" data-templates-open>Modelli</button><button class="primary-button compact" type="button" data-action="new-project">＋ Nuovo</button></div>
    </section>
    ${renderProjectToolbar()}
    ${renderProjectList(projects, allTasks, allMilestones)}`;
}

export async function renderToday() {
  const overview = await getTodayOverview();
  const total = overview.overdue.length + overview.dueToday.length + overview.blocked.length + overview.upcomingMilestones.length;
  const nextActions = overview.nextActions;
  if (!total && !nextActions.length) {
    return `
      <section class="today-header card">
        <p class="section-kicker">FOCUS</p>
        <h2>Oggi è libero.</h2>
        <p>Nessuna scadenza urgente o blocco. Puoi scegliere la prossima azione dal progetto che vuoi far avanzare.</p>
      </section>
      ${emptyState('✓', 'Nessuna attività da mostrare', 'Quando una scadenza richiede attenzione comparirà automaticamente qui.')}`;
  }
  return `
    <section class="today-header card today-focus-header">
      <p class="section-kicker">FOCUS</p>
      <h2>${total ? `${total} elementi richiedono attenzione.` : 'Nessuna urgenza.'}</h2>
      <div class="today-count-row">
        <span><strong>${overview.overdue.length}</strong> scaduti</span>
        <span><strong>${overview.dueToday.length}</strong> oggi</span>
        <span><strong>${overview.blocked.length}</strong> bloccati</span>
        <span><strong>${overview.upcomingMilestones.length}</strong> milestone</span>
      </div>
    </section>
    ${todayGroup('Scaduti', 'prima priorità', overview.overdue, 'overdue')}
    ${todayGroup('Oggi', 'da chiudere', overview.dueToday, 'today')}
    ${todayGroup('Bloccati', 'serve intervento', overview.blocked, 'blocked')}
    ${todayGroup('Milestone imminenti', 'prossimi 7 giorni', overview.upcomingMilestones, 'milestones')}
    ${nextActions.length ? `
      <section class="today-group">
        <div class="section-heading"><h2>Prossime azioni</h2><span>Per far avanzare i progetti</span></div>
        <div class="next-action-stack">${nextActions.map(action => renderNextAction(action, { compact: true })).join('')}</div>
      </section>` : ''}`;
}

export async function renderArchive() {
  const [projects, allTasks, allMilestones] = await Promise.all([
    listProjects({ archived: true }),
    getAllRecords('tasks'),
    getAllRecords('milestones')
  ]);
  return `
    <section class="list-header">
      <div><p class="section-kicker">STORICO</p><h2>${projects.length} ${projects.length === 1 ? 'progetto' : 'progetti'}</h2></div>
    </section>
    ${renderProjectToolbar({ archive: true })}
    ${renderProjectList(projects, allTasks, allMilestones, true)}`;
}

export async function renderProjectDetail(id, focusTaskId = null) {
  const project = await getProject(id);
  if (!project) {
    return `${emptyState('!', 'Progetto non trovato', 'Potrebbe essere stato eliminato o il collegamento non è più valido.')}<button class="secondary-button full-button" type="button" data-nav="projects">Torna ai progetti</button>`;
  }

  const [projectTasks, projectMilestones, projectNotes, projectReferences, projectTimeline] = await Promise.all([
    listTasksByProject(project.id),
    listMilestonesByProject(project.id),
    listNotesByProject(project.id),
    listReferencesByProject(project.id),
    listTimelineByProject(project.id)
  ]);
  const doneTasks = projectTasks.filter(item => item.status === 'completed').length;
  const doneMilestones = projectMilestones.filter(item => item.status === 'completed').length;
  const intelligence = getProjectIntelligence(project, projectTasks, projectMilestones);
  const health = intelligence.health;
  const operational = !['completed', 'archived'].includes(project.status);
  const progress = projectProgress(project, projectTasks);
  const nextAction = intelligence.nextAction ? { ...intelligence.nextAction, projectTitle: project.title } : null;
  const visibleTimeline = projectTimeline.filter(entry => !HIDDEN_TIMELINE_TYPES.has(entry.type)).slice(0, 20);
  const olderTimelineCount = Math.max(0, projectTimeline.filter(entry => !HIDDEN_TIMELINE_TYPES.has(entry.type)).length - visibleTimeline.length);

  return `
    <section class="detail-nav">
      <button class="text-button" type="button" data-nav="${operational ? 'projects' : 'archive'}">‹ ${operational ? 'Progetti' : 'Archivio'}</button>
    </section>

    <section class="project-detail-hero card">
      ${projectBadges(project, health)}
      <h2>${esc(project.title)}</h2>
      ${project.description ? `<p>${esc(project.description)}</p>` : '<p class="muted">Nessuna descrizione.</p>'}
      ${project.templateName ? `<div class="project-template-origin"><span>▦</span><small>Creato dal template</small><strong>${esc(project.templateName)}</strong></div>` : ''}
      ${project.blocked ? `<div class="blocked-panel"><span>⚠︎</span><div><strong>Progetto bloccato</strong><p>${esc(project.blockedReason)}</p></div></div>` : ''}
      ${progressBar(progress)}
      <div class="detail-actions">
        <button class="primary-button" type="button" data-project-edit="${esc(project.id)}">Modifica</button>
        ${project.blocked ? `<button class="secondary-button" type="button" data-project-unblock="${esc(project.id)}">Sblocca</button>` : ''}
      </div>
    </section>

    ${operational && nextAction ? `<section>${renderNextAction(nextAction)}</section>` : ''}

    <section>
      <div class="section-heading"><h2>Panoramica</h2><span>${esc(HEALTH_LABELS[health])}</span></div>
      <article class="health-explanation card health-panel health-panel-${esc(health)}">
        <div><span class="health-dot health-${esc(health)}"></span><strong>${esc(HEALTH_LABELS[health])}</strong></div>
        <p>${esc(HEALTH_COPY[health] || '')}</p>
        ${intelligence.overdueTasks.length ? `<small>${intelligence.overdueTasks.length} task scaduti</small>` : ''}
        ${intelligence.blockedTasks.length ? `<small>${intelligence.blockedTasks.length} task bloccati</small>` : ''}
        ${intelligence.budgetOverrun ? '<small>Budget oltre il previsto</small>' : ''}
      </article>
      <div class="detail-grid">
        <article class="detail-stat card"><span>Stato</span><strong>${esc(STATUS_LABELS[project.status])}</strong></article>
        <article class="detail-stat card"><span>Priorità</span><strong>${esc(PRIORITY_LABELS[project.priority])}</strong></article>
        <article class="detail-stat card"><span>Inizio</span><strong>${esc(formatDate(project.startDate))}</strong></article>
        <article class="detail-stat card"><span>Scadenza</span><strong>${esc(formatDate(project.targetDate))}</strong></article>
        <article class="detail-stat card"><span>Task</span><strong>${projectTasks.length ? `${doneTasks}/${projectTasks.length}` : '0'}</strong><small>completati</small></article>
        <article class="detail-stat card"><span>Milestone</span><strong>${projectMilestones.length ? `${doneMilestones}/${projectMilestones.length}` : '0'}</strong><small>completate</small></article>
      </div>
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Budget</h2><span>${project.budget?.enabled ? 'Attivo' : 'Opzionale'}</span></div>
        <button class="secondary-button compact-action" type="button" data-budget-edit="${esc(project.id)}">${project.budget?.enabled ? 'Modifica' : '＋ Configura'}</button>
      </div>
      ${renderBudget(project)}
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Milestone</h2><span>${projectMilestones.length}</span></div>
        ${operational ? `<button class="secondary-button compact-action" type="button" data-milestone-new="${esc(project.id)}">＋ Aggiungi</button>` : ''}
      </div>
      ${projectMilestones.length ? `<div class="milestone-list">${projectMilestones.map(item => renderMilestoneCard(item, projectTasks, operational)).join('')}</div>` : emptyState('◆', 'Nessuna milestone', 'Aggiungi traguardi intermedi per dare struttura al progetto.', operational ? 'Tocca “Aggiungi”.' : '')}
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Task</h2><span>${projectTasks.length}</span></div>
        ${operational ? `<button class="secondary-button compact-action" type="button" data-task-new="${esc(project.id)}">＋ Aggiungi</button>` : ''}
      </div>
      ${projectTasks.length ? `<div class="task-list">${projectTasks.map(task => renderTaskCard(task, projectTasks, projectMilestones, operational, focusTaskId)).join('')}</div>` : emptyState('✓', 'Nessun task', 'Trasforma il progetto in azioni concrete con task, checklist e dipendenze.', operational ? 'Tocca “Aggiungi”.' : '')}
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Note</h2><span>${projectNotes.length}</span></div>
        <button class="secondary-button compact-action" type="button" data-note-new="${esc(project.id)}">＋ Aggiungi</button>
      </div>
      ${projectNotes.length ? `<div class="context-list note-list">${projectNotes.map(renderNoteCard).join('')}</div>` : emptyState('✎', 'Nessuna nota', 'Salva qui decisioni, vincoli e informazioni che servono a portare avanti questo progetto.', 'Non sostituisce l’app Note.')}
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Riferimenti</h2><span>${projectReferences.length}</span></div>
        <button class="secondary-button compact-action" type="button" data-reference-new="${esc(project.id)}">＋ Aggiungi</button>
      </div>
      ${projectReferences.length ? `<div class="context-list reference-list">${projectReferences.map(renderReferenceCard).join('')}</div>` : emptyState('↗', 'Nessun riferimento', 'Collega siti, repository, nomi di file o riferimenti testuali senza duplicare i documenti.', 'I file restano nell’app File o nel servizio originale.')}
    </section>

    <section>
      <div class="section-heading section-heading-action">
        <div><h2>Timeline</h2><span>${visibleTimeline.length}${olderTimelineCount ? '+' : ''}</span></div>
        <button class="secondary-button compact-action" type="button" data-timeline-new="${esc(project.id)}">＋ Evento</button>
      </div>
      ${visibleTimeline.length ? `<div class="timeline-list">${visibleTimeline.map(renderTimelineEntry).join('')}</div>${olderTimelineCount ? `<p class="timeline-footnote">Mostrati gli ultimi 20 eventi significativi · ${olderTimelineCount} più vecchi conservati nel database.</p>` : ''}` : emptyState('◷', 'Timeline vuota', 'Gli eventi principali di progetto, task e milestone compariranno qui automaticamente.')}
    </section>

    ${project.tags?.length ? `<section><div class="section-heading"><h2>Tag</h2></div><div class="tag-row detail-tags">${project.tags.map(tag => `<span>#${esc(tag)}</span>`).join('')}</div></section>` : ''}

    <section>
      <div class="section-heading"><h2>Gestione</h2><span>Progetto</span></div>
      <div class="management-stack card">
        <button type="button" data-template-save-project="${esc(project.id)}"><span>Salva come template</span><strong>▦</strong></button>
        ${operational ? `<button type="button" data-project-status="completed" data-project-id="${esc(project.id)}"><span>Segna come completato</span><strong>✓</strong></button>` : `<button type="button" data-project-status="active" data-project-id="${esc(project.id)}"><span>Riapri come attivo</span><strong>↺</strong></button>`}
        ${project.status !== 'archived' ? `<button type="button" data-project-status="archived" data-project-id="${esc(project.id)}"><span>Archivia progetto</span><strong>▤</strong></button>` : ''}
        <button class="danger-row" type="button" data-project-delete="${esc(project.id)}"><span>Elimina definitivamente</span><strong>×</strong></button>
      </div>
    </section>`;
}

export async function renderSettings() {
  const [counts, integrationDiagnostics] = await Promise.all([getStoreCounts(), getIntegrationDiagnostics()]);
  const stores = Object.entries(counts)
    .map(([name, count]) => `<div class="settings-row"><span>${esc(name)}</span><strong>${count}</strong></div>`)
    .join('');
  const online = navigator.onLine ? 'Online' : 'Offline';
  const sw = 'serviceWorker' in navigator ? 'Supportato' : 'Non supportato';
  const integration = integrationDiagnostics.descriptor;
  const contractRows = Object.entries(integration.contracts).map(([name, version]) => `<div class="settings-row"><span>${esc(name)}</span><strong>v${version}</strong></div>`).join('');
  const checkValues = Object.values(integrationDiagnostics.checks);
  const integrationOk = checkValues.every(Boolean);

  return `
    <section class="card settings-card">
      <div class="settings-row"><span>Modulo</span><strong>${MODULE.moduleId}</strong></div>
      <div class="settings-row"><span>App version</span><strong>${MODULE.appVersion}</strong></div>
      <div class="settings-row"><span>Schema version</span><strong>${MODULE.schemaVersion}</strong></div>
      <div class="settings-row"><span>Database</span><strong>${MODULE.dbName}</strong></div>
    </section>
    <section>
      <div class="section-heading"><h2>Diagnostica</h2><span>Locale</span></div>
      <div class="card settings-card">
        <div class="settings-row"><span>Connessione</span><strong>${online}</strong></div>
        <div class="settings-row"><span>Service Worker</span><strong>${sw}</strong></div>
      </div>
    </section>
    <section>
      <div class="section-heading"><h2>Dati e backup</h2><span>ALEX Standard</span></div>
      <div class="management-stack card data-management-card">
        <button type="button" data-backup-export><span><b>Esporta JSON</b><small>Backup completo di PROJECTS, pronto per File o ALEX HUB.</small></span><strong>⇩</strong></button>
        <button type="button" data-backup-share><span><b>Condividi backup</b><small>Usa il foglio Condivisione di iPhone quando disponibile.</small></span><strong>↗</strong></button>
        <button type="button" data-backup-import><span><b>Importa JSON</b><small>Valida prima il file, poi scegli Unisci o Sostituisci.</small></span><strong>⇧</strong></button>
      </div>
      <p class="settings-note">Prima di ogni import PROJECTS genera automaticamente un backup di recupero. L’import viene applicato con una transazione unica.</p>
    </section>
    <section>
      <div class="section-heading"><h2>ALEX HUB Integration</h2><span>${integrationOk ? 'Pronto' : 'Da verificare'}</span></div>
      <div class="card settings-card">
        <div class="settings-row"><span>Protocollo</span><strong>${esc(integration.protocol)} v${integration.protocolVersion}</strong></div>
        <div class="settings-row"><span>Module API</span><strong>${esc(integration.moduleApiVersion)}</strong></div>
        <div class="settings-row"><span>Namespace</span><strong>${esc(integration.namespace)}</strong></div>
        <div class="settings-row"><span>Capability</span><strong>${integration.capabilities.length}</strong></div>
        <div class="settings-row"><span>Today items</span><strong>${integrationDiagnostics.counts.todayItems}</strong></div>
        <div class="settings-row"><span>Insights</span><strong>${integrationDiagnostics.counts.insights}</strong></div>
        <div class="settings-row"><span>Eventi</span><strong>${integrationDiagnostics.counts.events}</strong></div>
      </div>
      <div class="section-heading compact-heading"><h3>Contract version</h3></div>
      <div class="card settings-card">${contractRows}</div>
      <p class="settings-note">PROJECTS registra opzionalmente un bridge in <code>ALEX_HUB_MODULES.projects</code>. Se ALEX HUB non è presente, l’app continua a funzionare normalmente.</p>
    </section>
    <section>
      <div class="section-heading"><h2>Object store</h2><span>IndexedDB</span></div>
      <div class="card settings-card">${stores}</div>
    </section>
    <section class="card info-card">
      <strong>PROJECTS v0.9</strong>
      <p>Integration Layer ALEX HUB versionato, contratti normalizzati e contributo al backup globale sono disponibili anche offline.</p>
    </section>`;
}

export async function renderRoute(route) {
  if (['projects', 'archive'].includes(route.root) && route.segments[1] === 'project' && route.segments[2]) {
    const focusTaskId = route.segments[3] === 'task' ? route.segments[4] : null;
    return renderProjectDetail(route.segments[2], focusTaskId);
  }
  switch (route.root) {
    case 'projects': return renderProjects();
    case 'today': return renderToday();
    case 'archive': return renderArchive();
    case 'settings': return renderSettings();
    case 'home':
    default: return renderHome();
  }
}
