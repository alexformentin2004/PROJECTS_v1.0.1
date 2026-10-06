import {
  MILESTONE_STATUSES,
  MODULE,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  ROUTES,
  TASK_STATUSES
} from './constants.js';
import { initializeDatabase, putRecord } from './db.js';
import { createRouter } from './router.js';
import { renderRoute } from './views.js';
import { createProject, deleteProject, getProject, listProjects, setProjectStatus, updateProject, updateProjectBudget } from './services/project-service.js';
import {
  createTask,
  deleteTask,
  getTask,
  listTasksByProject,
  toggleChecklistItem,
  toggleTaskCompleted,
  updateTask
} from './services/task-service.js';
import {
  createMilestone,
  deleteMilestone,
  getMilestone,
  listMilestonesByProject,
  setMilestoneStatus,
  updateMilestone
} from './services/milestone-service.js';
import {
  createNote,
  deleteNote,
  getNote,
  toggleNotePinned,
  updateNote
} from './services/note-service.js';
import {
  createReference,
  deleteReference,
  getReference,
  REFERENCE_TYPES,
  updateReference
} from './services/reference-service.js';
import {
  createManualTimelineEntry,
  deleteManualTimelineEntry
} from './services/timeline-service.js';
import {
  createProjectFromTemplate,
  createTemplateFromProject,
  deleteTemplate,
  ensureBuiltInTemplates,
  getTemplate,
  listTemplates,
  localDateKey,
  templateSummary
} from './services/template-service.js';
import {
  backupFilename,
  downloadBackup,
  exportBackupFile,
  importBackup,
  parseBackupFile,
  shareBackupFile
} from './services/backup-service.js';
import { createAlexModuleBridge, dispatchActionTarget } from './services/integration-service.js';

const view = document.querySelector('#view');
const screenTitle = document.querySelector('#screenTitle');
const tabLinks = [...document.querySelectorAll('.tab-link')];
const settingsButton = document.querySelector('#settingsButton');
const quickAddButton = document.querySelector('#quickAddButton');
const quickSheet = document.querySelector('#quickSheet');
const editorSheet = document.querySelector('#editorSheet');
const editorBody = document.querySelector('#editorBody');
const editorTitle = document.querySelector('#editorTitle');
const sheetBackdrop = document.querySelector('#sheetBackdrop');
const toast = document.querySelector('#toast');
const connectionBadge = document.querySelector('#connectionBadge');

let router;
let toastTimer;
let activeSheet = null;
let pendingImport = null;

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function setActiveTab(root) {
  tabLinks.forEach(link => {
    const active = link.dataset.route === root;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function routeTitle(route) {
  if (['projects', 'archive'].includes(route.root) && route.segments[1] === 'project') return 'Progetto';
  return ROUTES[route.root]?.title || 'Home';
}

async function showRoute(route) {
  screenTitle.textContent = routeTitle(route);
  setActiveTab(route.root);
  view.setAttribute('aria-busy', 'true');
  try {
    view.innerHTML = await renderRoute(route);
  } catch (error) {
    console.error(error);
    view.innerHTML = `<section class="card error-card"><h2>Qualcosa non ha funzionato</h2><p>${esc(error?.message || error)}</p></section>`;
  } finally {
    view.removeAttribute('aria-busy');
    if (route.segments[3] === 'task' && route.segments[4]) {
      requestAnimationFrame(() => document.querySelector('[data-focus-task]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }
}

function openSheet(sheet) {
  if (activeSheet && activeSheet !== sheet) closeSheet(false);
  activeSheet = sheet;
  sheet.hidden = false;
  sheetBackdrop.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    sheetBackdrop.classList.add('open');
  });
  document.body.classList.add('sheet-open');
}

function closeSheet(animate = true) {
  if (!activeSheet) return;
  const sheet = activeSheet;
  sheet.classList.remove('open');
  sheetBackdrop.classList.remove('open');
  document.body.classList.remove('sheet-open');
  activeSheet = null;
  const finish = () => {
    sheet.hidden = true;
    if (!activeSheet) sheetBackdrop.hidden = true;
  };
  animate ? setTimeout(finish, 220) : finish();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 180);
  }, 2600);
}

function projectFormHtml(project = null, template = null) {
  const defaults = template?.projectDefaults || {};
  const p = project || {
    title: '', description: '', status: defaults.status || 'idea', priority: defaults.priority || 'normal', tags: defaults.tags || [],
    startDate: template ? localDateKey() : '', targetDate: '', blocked: false, blockedReason: ''
  };
  const summary = template ? templateSummary(template) : null;
  return `
    <form id="projectForm" class="project-form" data-project-id="${esc(project?.id || '')}" data-template-id="${esc(template?.id || '')}">
      ${template ? `<div class="template-selected-banner"><span class="template-icon">${esc(template.icon || '▦')}</span><div><small>TEMPLATE SELEZIONATO</small><strong>${esc(template.name)}</strong><p>${summary.taskCount} task · ${summary.milestoneCount} milestone${summary.durationDays !== null ? ` · ${summary.durationDays} giorni` : ''}</p></div><button type="button" class="text-button" data-change-template>Cambia</button></div>` : ''}
      <label class="form-field"><span>Nome progetto *</span><input name="title" maxlength="100" required autocomplete="off" value="${esc(p.title)}" placeholder="Es. Nuovo PC" /></label>
      <label class="form-field"><span>Descrizione</span><textarea name="description" maxlength="1200" rows="3" placeholder="Cosa vuoi ottenere?">${esc(p.description)}</textarea></label>

      <div class="form-grid">
        <label class="form-field"><span>Stato</span><select name="status">${PROJECT_STATUSES.map(item => `<option value="${item.id}" ${p.status === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
        <label class="form-field"><span>Priorità</span><select name="priority">${PROJECT_PRIORITIES.map(item => `<option value="${item.id}" ${p.priority === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
      </div>

      <div class="form-grid">
        <label class="form-field"><span>Data inizio${template ? ' *' : ''}</span><input name="startDate" type="date" ${template ? 'required' : ''} value="${esc(p.startDate || '')}" /></label>
        <label class="form-field"><span>Scadenza</span><input name="targetDate" type="date" value="${esc(p.targetDate || '')}" /><small>${template ? 'Se vuota, viene calcolata dal template.' : ''}</small></label>
      </div>

      <label class="form-field"><span>Tag</span><input name="tags" autocomplete="off" value="${esc((p.tags || []).join(', '))}" placeholder="app, casa, acquisto" /><small>Separali con una virgola.</small></label>

      <label class="switch-row">
        <span><strong>Progetto bloccato</strong><small>Segnala che non può avanzare in questo momento.</small></span>
        <input id="blockedToggle" name="blocked" type="checkbox" ${p.blocked ? 'checked' : ''} />
      </label>
      <label id="blockedReasonField" class="form-field ${p.blocked ? '' : 'is-hidden'}"><span>Motivo del blocco *</span><textarea name="blockedReason" maxlength="500" rows="2" placeholder="Es. Attendo un preventivo">${esc(p.blockedReason || '')}</textarea></label>

      ${template ? '<p class="form-help">Task, checklist, milestone e dipendenze verranno creati automaticamente usando la data di inizio come riferimento. Potrai modificarli subito dopo.</p>' : ''}
      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">${project ? 'Salva modifiche' : template ? 'Crea dal template' : 'Crea progetto'}</button>
      </div>
    </form>`;
}

function templateCardHtml(template, { manage = false } = {}) {
  const summary = templateSummary(template);
  const builtin = template.source === 'builtin';
  return `
    <article class="template-card card">
      <div class="template-card-main">
        <span class="template-icon">${esc(template.icon || '▦')}</span>
        <div><div class="template-card-title"><h3>${esc(template.name)}</h3>${builtin ? '<span class="template-badge">ALEX</span>' : '<span class="template-badge personal">Personale</span>'}</div><p>${esc(template.description || '')}</p></div>
      </div>
      <div class="template-meta"><span>${summary.milestoneCount} milestone</span><span>${summary.taskCount} task</span>${summary.durationDays !== null ? `<span>${summary.durationDays} giorni</span>` : ''}</div>
      <div class="template-card-actions">
        <button class="primary-button compact-action" type="button" data-template-use="${esc(template.id)}">Usa</button>
        ${manage && !builtin ? `<button class="danger-text-button" type="button" data-template-delete="${esc(template.id)}">Elimina</button>` : ''}
      </div>
    </article>`;
}

async function openProjectStart() {
  const templates = await listTemplates();
  editorTitle.textContent = 'Nuovo progetto';
  editorBody.innerHTML = `
    <div class="template-picker">
      <button class="blank-project-card card" type="button" data-template-blank><span>＋</span><div><strong>Progetto vuoto</strong><small>Configura tutto manualmente.</small></div><b>›</b></button>
      <div class="template-picker-heading"><span>OPPURE PARTI DA UN MODELLO</span><small>${templates.length} disponibili</small></div>
      <div class="template-grid">${templates.map(item => templateCardHtml(item)).join('')}</div>
      <p class="sheet-note">Le date dei template sono relative: scegliendo una nuova data di inizio, PROJECTS ricalcola automaticamente tutte le scadenze.</p>
    </div>`;
  openSheet(editorSheet);
}

async function openProjectEditor(id = null, templateId = null) {
  let project = null;
  let template = null;
  if (id) {
    project = await getProject(id);
    if (!project) {
      showToast('Progetto non trovato');
      return;
    }
  } else if (templateId) {
    template = await getTemplate(templateId);
    if (!template) {
      showToast('Template non trovato');
      return;
    }
  }
  editorTitle.textContent = project ? 'Modifica progetto' : template ? template.name : 'Nuovo progetto';
  editorBody.innerHTML = projectFormHtml(project, template);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="title"]')?.focus(), 260);
}

async function openTemplateLibrary() {
  const templates = await listTemplates();
  const builtins = templates.filter(item => item.source === 'builtin');
  const custom = templates.filter(item => item.source !== 'builtin');
  editorTitle.textContent = 'Template';
  editorBody.innerHTML = `
    <div class="template-library">
      <div class="template-library-intro card"><strong>Modelli riutilizzabili</strong><p>Un template crea milestone, task, checklist e dipendenze con date calcolate dalla nuova data di inizio.</p></div>
      <div class="template-picker-heading"><span>PREDEFINITI</span><small>${builtins.length}</small></div>
      <div class="template-grid">${builtins.map(item => templateCardHtml(item, { manage: true })).join('')}</div>
      <div class="template-picker-heading"><span>I TUOI MODELLI</span><small>${custom.length}</small></div>
      ${custom.length ? `<div class="template-grid">${custom.map(item => templateCardHtml(item, { manage: true })).join('')}</div>` : '<div class="template-empty card"><strong>Nessun template personale</strong><p>Apri un progetto e usa “Salva come template” per trasformarne struttura, task e milestone in un modello riutilizzabile.</p></div>'}
    </div>`;
  openSheet(editorSheet);
}

function saveTemplateFormHtml(project) {
  return `
    <form id="saveTemplateForm" class="project-form" data-project-id="${esc(project.id)}">
      <div class="read-only-field"><span>Progetto sorgente</span><strong>${esc(project.title)}</strong></div>
      <label class="form-field"><span>Nome template *</span><input name="name" maxlength="100" required value="${esc(`${project.title} — modello`)}" /></label>
      <label class="form-field"><span>Descrizione</span><textarea name="description" maxlength="500" rows="3" placeholder="Quando useresti questo modello?"></textarea></label>
      <div class="form-grid">
        <label class="form-field"><span>Categoria</span><input name="category" maxlength="40" value="Personale" /></label>
        <label class="form-field"><span>Icona</span><input name="icon" maxlength="4" value="▦" /></label>
      </div>
      <p class="form-help">Le date assolute non vengono copiate: task e milestone saranno convertiti in giorni relativi alla data di inizio.</p>
      <div class="form-actions sticky-form-actions"><button class="secondary-button" type="button" data-close-sheet>Annulla</button><button class="primary-button" type="submit">Salva template</button></div>
    </form>`;
}

async function openSaveTemplateEditor(projectId) {
  const project = await getProject(projectId);
  if (!project) return showToast('Progetto non trovato');
  const [tasks, milestones] = await Promise.all([listTasksByProject(projectId), listMilestonesByProject(projectId)]);
  if (!tasks.length && !milestones.length) return showToast('Aggiungi almeno un task o una milestone prima di creare un template');
  editorTitle.textContent = 'Salva come template';
  editorBody.innerHTML = saveTemplateFormHtml(project);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="name"]')?.select(), 260);
}

function checklistRowHtml(item = null) {
  const id = item?.id || `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return `
    <div class="checklist-editor-row" data-checklist-row data-checklist-id="${esc(id)}">
      <input type="checkbox" data-checklist-completed aria-label="Completato" ${item?.completed ? 'checked' : ''} />
      <input type="text" data-checklist-text maxlength="180" value="${esc(item?.text || '')}" placeholder="Elemento checklist" />
      <button type="button" data-checklist-remove aria-label="Rimuovi elemento">×</button>
    </div>`;
}

function taskRelationsHtml(task, projectTasks, milestones) {
  const selectedDependencies = new Set(task?.dependencyIds || []);
  const dependencyCandidates = projectTasks.filter(item => item.id !== task?.id && item.status !== 'cancelled');
  return `
    <label class="form-field"><span>Milestone</span>
      <select name="milestoneId" id="taskMilestoneSelect">
        <option value="">Nessuna</option>
        ${milestones.filter(item => item.status !== 'cancelled').map(item => `<option value="${esc(item.id)}" ${task?.milestoneId === item.id ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}
      </select>
    </label>
    <fieldset class="relation-fieldset">
      <legend>Dipendenze</legend>
      <p>Il task resterà bloccato finché i prerequisiti selezionati non saranno completati.</p>
      <div id="dependencyOptions" class="dependency-options">
        ${dependencyCandidates.length ? dependencyCandidates.map(item => `
          <label class="dependency-option ${item.status === 'completed' ? 'dependency-completed' : ''}">
            <input type="checkbox" name="dependencyIds" value="${esc(item.id)}" ${selectedDependencies.has(item.id) ? 'checked' : ''} />
            <span><strong>${esc(item.title)}</strong><small>${item.status === 'completed' ? 'Completato' : 'Prerequisito'}</small></span>
          </label>`).join('') : '<p class="relation-empty">Nessun altro task disponibile.</p>'}
      </div>
    </fieldset>`;
}

function taskFormHtml(task, projects, projectTasks, milestones, selectedProjectId) {
  const t = task || {
    title: '', description: '', status: 'todo', priority: 'normal', dueDate: '', dueTime: '',
    checklist: [], dependencyIds: [], milestoneId: null
  };
  const project = projects.find(item => item.id === selectedProjectId);
  return `
    <form id="taskForm" class="project-form" data-task-id="${esc(task?.id || '')}">
      ${task ? `
        <input type="hidden" name="projectId" value="${esc(selectedProjectId)}" />
        <div class="read-only-field"><span>Progetto</span><strong>${esc(project?.title || 'Progetto')}</strong></div>` : `
        <label class="form-field"><span>Progetto *</span><select name="projectId" id="taskProjectSelect" required>${projects.map(item => `<option value="${esc(item.id)}" ${item.id === selectedProjectId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></label>`}

      <label class="form-field"><span>Titolo task *</span><input name="title" maxlength="120" required autocomplete="off" value="${esc(t.title)}" placeholder="Es. Confrontare i componenti" /></label>
      <label class="form-field"><span>Descrizione</span><textarea name="description" maxlength="1000" rows="3" placeholder="Dettagli utili">${esc(t.description)}</textarea></label>

      <div class="form-grid">
        <label class="form-field"><span>Stato</span><select name="status">${TASK_STATUSES.map(item => `<option value="${item.id}" ${t.status === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
        <label class="form-field"><span>Priorità</span><select name="priority">${PROJECT_PRIORITIES.map(item => `<option value="${item.id}" ${t.priority === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
      </div>

      <div class="form-grid">
        <label class="form-field"><span>Scadenza</span><input name="dueDate" type="date" value="${esc(t.dueDate || '')}" /></label>
        <label class="form-field"><span>Ora opzionale</span><input name="dueTime" type="time" value="${esc(t.dueTime || '')}" /></label>
      </div>

      <div id="taskRelations">${taskRelationsHtml(task, projectTasks, milestones)}</div>

      <fieldset class="relation-fieldset checklist-editor">
        <legend>Checklist</legend>
        <p>Usala per spezzare il task in piccoli passaggi senza creare altri task.</p>
        <div id="checklistEditorRows" class="checklist-editor-rows">
          ${(t.checklist || []).map(item => checklistRowHtml(item)).join('')}
        </div>
        <button class="secondary-button compact-action" type="button" data-checklist-add>＋ Aggiungi voce</button>
      </fieldset>

      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">${task ? 'Salva task' : 'Crea task'}</button>
      </div>
    </form>`;
}

async function openTaskEditor(id = null, preferredProjectId = null) {
  const projects = await listProjects({ archived: false });
  if (!projects.length) {
    showToast('Crea prima un progetto operativo');
    return;
  }

  let task = null;
  if (id) {
    task = await getTask(id);
    if (!task) {
      showToast('Task non trovato');
      return;
    }
  }

  const preferred = projects.find(item => item.id === (task?.projectId || preferredProjectId));
  const selectedProject = preferred || projects.find(item => item.status === 'active') || projects[0];
  const [projectTasks, milestones] = await Promise.all([
    listTasksByProject(selectedProject.id, { includeCancelled: true }),
    listMilestonesByProject(selectedProject.id, { includeCancelled: true })
  ]);

  editorTitle.textContent = task ? 'Modifica task' : 'Nuovo task';
  editorBody.innerHTML = taskFormHtml(task, projects, projectTasks, milestones, selectedProject.id);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="title"]')?.focus(), 260);
}

async function refreshTaskRelations(form) {
  const projectId = form.elements.projectId?.value;
  if (!projectId) return;
  const taskId = form.dataset.taskId || null;
  const task = taskId ? await getTask(taskId) : null;
  const [projectTasks, milestones] = await Promise.all([
    listTasksByProject(projectId, { includeCancelled: true }),
    listMilestonesByProject(projectId, { includeCancelled: true })
  ]);
  const holder = form.querySelector('#taskRelations');
  if (holder) holder.innerHTML = taskRelationsHtml(task && task.projectId === projectId ? task : null, projectTasks, milestones);
}

function milestoneFormHtml(milestone, project) {
  const m = milestone || { title: '', description: '', status: 'planned', priority: 'normal', targetDate: '' };
  return `
    <form id="milestoneForm" class="project-form" data-milestone-id="${esc(milestone?.id || '')}">
      <input type="hidden" name="projectId" value="${esc(project.id)}" />
      <div class="read-only-field"><span>Progetto</span><strong>${esc(project.title)}</strong></div>
      <label class="form-field"><span>Titolo milestone *</span><input name="title" maxlength="120" required autocomplete="off" value="${esc(m.title)}" placeholder="Es. Prototipo pronto" /></label>
      <label class="form-field"><span>Descrizione</span><textarea name="description" maxlength="800" rows="3" placeholder="Cosa deve essere vero quando la raggiungi?">${esc(m.description)}</textarea></label>
      <div class="form-grid">
        <label class="form-field"><span>Stato</span><select name="status">${MILESTONE_STATUSES.map(item => `<option value="${item.id}" ${m.status === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
        <label class="form-field"><span>Priorità</span><select name="priority">${PROJECT_PRIORITIES.map(item => `<option value="${item.id}" ${m.priority === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
      </div>
      <label class="form-field"><span>Data obiettivo</span><input name="targetDate" type="date" value="${esc(m.targetDate || '')}" /></label>
      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">${milestone ? 'Salva milestone' : 'Crea milestone'}</button>
      </div>
    </form>`;
}

async function openMilestoneEditor(id = null, projectId = null) {
  let milestone = null;
  if (id) {
    milestone = await getMilestone(id);
    if (!milestone) {
      showToast('Milestone non trovata');
      return;
    }
    projectId = milestone.projectId;
  }
  const project = await getProject(projectId);
  if (!project || ['completed', 'archived'].includes(project.status)) {
    showToast('Riapri il progetto per modificare le milestone');
    return;
  }
  editorTitle.textContent = milestone ? 'Modifica milestone' : 'Nuova milestone';
  editorBody.innerHTML = milestoneFormHtml(milestone, project);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="title"]')?.focus(), 260);
}


function noteFormHtml(note, project) {
  const n = note || { title: '', body: '', pinned: false };
  return `
    <form id="noteForm" class="project-form" data-note-id="${esc(note?.id || '')}">
      <input type="hidden" name="projectId" value="${esc(project.id)}" />
      <div class="read-only-field"><span>Progetto</span><strong>${esc(project.title)}</strong></div>
      <label class="form-field"><span>Titolo nota *</span><input name="title" maxlength="120" required autocomplete="off" value="${esc(n.title)}" placeholder="Es. Decisioni tecniche" /></label>
      <label class="form-field"><span>Contenuto *</span><textarea name="body" maxlength="6000" rows="8" required placeholder="Annota decisioni, vincoli o informazioni utili al progetto.">${esc(n.body)}</textarea></label>
      <label class="switch-row">
        <span><strong>Metti in evidenza</strong><small>Le note fissate compaiono per prime.</small></span>
        <input name="pinned" type="checkbox" ${n.pinned ? 'checked' : ''} />
      </label>
      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">${note ? 'Salva nota' : 'Aggiungi nota'}</button>
      </div>
    </form>`;
}

async function openNoteEditor(id = null, projectId = null) {
  let note = null;
  if (id) {
    note = await getNote(id);
    if (!note) {
      showToast('Nota non trovata');
      return;
    }
    projectId = note.projectId;
  }
  const project = await getProject(projectId);
  if (!project) {
    showToast('Progetto non trovato');
    return;
  }
  editorTitle.textContent = note ? 'Modifica nota' : 'Nuova nota';
  editorBody.innerHTML = noteFormHtml(note, project);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="title"]')?.focus(), 260);
}

function referenceFormHtml(reference, project) {
  const r = reference || { type: 'link', label: '', url: '', fileName: '', fileHint: '', text: '' };
  return `
    <form id="referenceForm" class="project-form" data-reference-id="${esc(reference?.id || '')}">
      <input type="hidden" name="projectId" value="${esc(project.id)}" />
      <div class="read-only-field"><span>Progetto</span><strong>${esc(project.title)}</strong></div>
      <label class="form-field"><span>Tipo</span><select name="type" id="referenceTypeSelect">${REFERENCE_TYPES.map(item => `<option value="${item.id}" ${r.type === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>
      <label class="form-field"><span>Nome riferimento *</span><input name="label" maxlength="120" required value="${esc(r.label)}" placeholder="Es. Repository GitHub" /></label>

      <div class="reference-fields" data-reference-fields="link">
        <label class="form-field"><span>Link *</span><input name="url" type="text" inputmode="url" maxlength="1200" value="${esc(r.url || '')}" placeholder="https://…" /></label>
      </div>

      <div class="reference-fields" data-reference-fields="file_reference">
        <label class="form-field"><span>Nome file *</span><input name="fileName" maxlength="240" value="${esc(r.fileName || '')}" placeholder="Es. preventivo-auto.pdf" /></label>
        <label class="form-field"><span>Dove si trova</span><textarea name="fileHint" maxlength="1000" rows="3" placeholder="Es. File > iCloud Drive > ALEX HUB > Auto">${esc(r.fileHint || '')}</textarea></label>
        <label class="form-field"><span>Link condiviso opzionale</span><input name="fileUrl" type="text" inputmode="url" maxlength="1200" value="${esc(r.type === 'file_reference' ? (r.url || '') : '')}" placeholder="https://…" /></label>
        <p class="form-help">PROJECTS salva solo il riferimento: il file resta nell’app File o nel servizio originale.</p>
      </div>

      <div class="reference-fields" data-reference-fields="text_reference">
        <label class="form-field"><span>Riferimento *</span><textarea name="text" maxlength="3000" rows="5" placeholder="Es. Codice ordine, seriale, contatto, posizione o altra informazione breve.">${esc(r.text || '')}</textarea></label>
      </div>

      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">${reference ? 'Salva riferimento' : 'Aggiungi riferimento'}</button>
      </div>
    </form>`;
}

function syncReferenceFields(form) {
  const type = form?.elements?.type?.value || 'link';
  form?.querySelectorAll('[data-reference-fields]').forEach(section => {
    const active = section.dataset.referenceFields === type;
    section.classList.toggle('is-hidden', !active);
    section.querySelectorAll('input, textarea, select').forEach(control => { control.disabled = !active; });
  });
}

async function openReferenceEditor(id = null, projectId = null) {
  let reference = null;
  if (id) {
    reference = await getReference(id);
    if (!reference) {
      showToast('Riferimento non trovato');
      return;
    }
    projectId = reference.projectId;
  }
  const project = await getProject(projectId);
  if (!project) {
    showToast('Progetto non trovato');
    return;
  }
  editorTitle.textContent = reference ? 'Modifica riferimento' : 'Nuovo riferimento';
  editorBody.innerHTML = referenceFormHtml(reference, project);
  const form = editorBody.querySelector('#referenceForm');
  syncReferenceFields(form);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="label"]')?.focus(), 260);
}

function budgetFormHtml(project) {
  const b = project.budget || { enabled: false, currency: 'EUR', planned: null, spent: null, note: '' };
  return `
    <form id="budgetForm" class="project-form" data-project-id="${esc(project.id)}">
      <div class="read-only-field"><span>Progetto</span><strong>${esc(project.title)}</strong></div>
      <label class="switch-row">
        <span><strong>Budget attivo</strong><small>Riepilogo semplice, non registro transazioni.</small></span>
        <input id="budgetEnabledToggle" name="enabled" type="checkbox" ${b.enabled ? 'checked' : ''} />
      </label>
      <div id="budgetFields" class="budget-form-fields ${b.enabled ? '' : 'is-hidden'}">
        <div class="form-grid">
          <label class="form-field"><span>Budget previsto</span><input name="planned" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(b.planned ?? '')}" placeholder="0,00" /></label>
          <label class="form-field"><span>Speso</span><input name="spent" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(b.spent ?? '')}" placeholder="0,00" /></label>
        </div>
        <label class="form-field"><span>Valuta</span><input name="currency" maxlength="3" autocapitalize="characters" value="${esc(b.currency || 'EUR')}" placeholder="EUR" /></label>
        <label class="form-field"><span>Nota budget</span><textarea name="note" maxlength="1000" rows="3" placeholder="Es. Include hardware e accessori, esclusa spedizione.">${esc(b.note || '')}</textarea></label>
      </div>
      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">Salva budget</button>
      </div>
    </form>`;
}

async function openBudgetEditor(projectId) {
  const project = await getProject(projectId);
  if (!project) {
    showToast('Progetto non trovato');
    return;
  }
  editorTitle.textContent = 'Budget progetto';
  editorBody.innerHTML = budgetFormHtml(project);
  openSheet(editorSheet);
}

function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timelineFormHtml(project) {
  return `
    <form id="timelineForm" class="project-form">
      <input type="hidden" name="projectId" value="${esc(project.id)}" />
      <div class="read-only-field"><span>Progetto</span><strong>${esc(project.title)}</strong></div>
      <label class="form-field"><span>Titolo evento *</span><input name="title" maxlength="140" required autocomplete="off" placeholder="Es. Scelta configurazione definitiva" /></label>
      <label class="form-field"><span>Dettaglio</span><textarea name="detail" maxlength="2000" rows="4" placeholder="Perché è importante o cosa è stato deciso."></textarea></label>
      <div class="form-grid">
        <label class="form-field"><span>Data</span><input name="date" type="date" value="${localDateInputValue()}" /></label>
        <label class="form-field"><span>Ora opzionale</span><input name="time" type="time" /></label>
      </div>
      <p class="form-help">La Timeline registra automaticamente gli eventi principali. Usa un evento manuale solo per decisioni o passaggi davvero significativi.</p>
      <div class="form-actions sticky-form-actions">
        <button class="secondary-button" type="button" data-close-sheet>Annulla</button>
        <button class="primary-button" type="submit">Aggiungi alla timeline</button>
      </div>
    </form>`;
}

async function openTimelineEditor(projectId) {
  const project = await getProject(projectId);
  if (!project) {
    showToast('Progetto non trovato');
    return;
  }
  editorTitle.textContent = 'Evento Timeline';
  editorBody.innerHTML = timelineFormHtml(project);
  openSheet(editorSheet);
  setTimeout(() => editorBody.querySelector('input[name="title"]')?.focus(), 260);
}

const BACKUP_COUNT_LABELS = Object.freeze({
  projects: 'Progetti',
  milestones: 'Milestone',
  tasks: 'Task',
  notes: 'Note',
  references: 'Riferimenti',
  timelineEntries: 'Timeline',
  templates: 'Template'
});

function formatBackupDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function backupCountsHtml(counts = {}) {
  return Object.entries(BACKUP_COUNT_LABELS).map(([key, label]) => `
    <div class="settings-row"><span>${label}</span><strong>${Number(counts[key] || 0)}</strong></div>`).join('');
}

async function handleBackupExport({ share = false } = {}) {
  try {
    const fileData = await exportBackupFile();
    if (share) {
      try {
        const shared = await shareBackupFile(fileData);
        if (shared) {
          showToast('Backup aperto nel foglio Condivisione');
          return;
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('Condivisione backup non disponibile:', error);
      }
    }
    downloadBackup(fileData);
    showToast('Backup JSON esportato');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Impossibile esportare il backup');
  }
}

function openImportError(error, fileName = '') {
  const validation = error?.validation;
  editorTitle.textContent = 'Backup non valido';
  editorBody.innerHTML = `
    <div class="import-preview">
      <section class="card import-status-card invalid">
        <span class="import-status-icon">!</span>
        <div><strong>Il file non verrà importato</strong><p>${esc(fileName || 'File JSON')} non supera i controlli di sicurezza.</p></div>
      </section>
      ${validation?.errors?.length ? `<section><div class="section-heading"><h3>Problemi trovati</h3><span>${validation.errors.length}</span></div><div class="card validation-list">${validation.errors.map(item => `<p>${esc(item)}</p>`).join('')}</div></section>` : `<section class="card info-card"><p>${esc(error?.message || 'Backup non valido.')}</p></section>`}
      <div class="form-actions sticky-form-actions"><button class="secondary-button" type="button" data-close-sheet>Chiudi</button><button class="primary-button" type="button" data-backup-import>Scegli un altro file</button></div>
    </div>`;
  openSheet(editorSheet);
}

function openImportPreview(parsed) {
  pendingImport = parsed;
  const { validation, fileName } = parsed;
  const warnings = validation.warnings || [];
  editorTitle.textContent = 'Importa backup';
  editorBody.innerHTML = `
    <div class="import-preview">
      <section class="card import-status-card valid">
        <span class="import-status-icon">✓</span>
        <div><small>BACKUP VALIDATO</small><strong>${esc(fileName)}</strong><p>PROJECTS ${esc(validation.summary.appVersion)} · schema ${esc(validation.summary.schemaVersion)} · ${esc(formatBackupDate(validation.summary.exportedAt))}</p></div>
      </section>
      <section>
        <div class="section-heading"><h3>Contenuto</h3><span>JSON completo</span></div>
        <div class="card settings-card">${backupCountsHtml(validation.summary.counts)}</div>
      </section>
      ${warnings.length ? `<section><div class="section-heading"><h3>Avvisi</h3><span>${warnings.length}</span></div><div class="card validation-list warning">${warnings.map(item => `<p>${esc(item)}</p>`).join('')}</div></section>` : ''}
      <section>
        <div class="section-heading"><h3>Come vuoi importarlo?</h3><span>Scegli</span></div>
        <div class="import-mode-grid">
          <button class="card import-mode-card" type="button" data-import-mode="merge"><span>＋</span><div><strong>Unisci</strong><p>Mantiene i dati locali. In caso di stesso ID conserva la versione aggiornata più di recente.</p></div></button>
          <button class="card import-mode-card danger-choice" type="button" data-import-mode="replace"><span>↺</span><div><strong>Sostituisci</strong><p>Rimpiazza il database PROJECTS con il contenuto del backup.</p></div></button>
        </div>
      </section>
      <p class="settings-note">Prima dell’import verrà scaricato automaticamente un backup di recupero dello stato attuale. L’operazione sul database è atomica.</p>
      <div class="form-actions sticky-form-actions"><button class="secondary-button" type="button" data-close-sheet>Annulla</button></div>
    </div>`;
  openSheet(editorSheet);
}

function openBackupFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const parsed = await parseBackupFile(file);
      openImportPreview(parsed);
    } catch (error) {
      console.error(error);
      openImportError(error, file.name);
    }
  }, { once: true });
  input.click();
}

async function performImport(mode) {
  if (!pendingImport?.backup) {
    showToast('Seleziona prima un backup');
    return;
  }
  const destructive = mode === 'replace';
  const message = destructive
    ? 'Sostituire tutti i dati PROJECTS con questo backup? Verrà prima esportato un backup di recupero.'
    : 'Unire questo backup ai dati PROJECTS attuali? Verrà prima esportato un backup di recupero.';
  if (!confirm(message)) return;

  const button = editorBody.querySelector(`[data-import-mode="${mode}"]`);
  if (button) button.disabled = true;
  try {
    const recovery = await exportBackupFile();
    recovery.filename = backupFilename(new Date(), 'PROJECTS_pre_import');
    downloadBackup(recovery);

    const result = await importBackup(pendingImport.backup, mode);
    await initializeDatabase();
    await ensureBuiltInTemplates();
    await putRecord('metadata', {
      id: 'lastImport',
      importedAt: new Date().toISOString(),
      mode,
      sourceFileName: pendingImport.fileName,
      sourceAppVersion: result.sourceAppVersion,
      sourceSchemaVersion: result.sourceSchemaVersion,
      updatedAt: new Date().toISOString()
    });

    pendingImport = null;
    closeSheet();
    showToast(mode === 'replace' ? 'Backup importato: dati sostituiti' : 'Backup importato e unito');
    await refreshRoute();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Import non riuscito: i dati non sono stati modificati');
  } finally {
    if (button) button.disabled = false;
  }
}

async function refreshRoute() {
  await showRoute(router.current());
}

function currentProjectId() {
  const route = router?.current();
  return route?.segments?.[1] === 'project' ? route.segments[2] : null;
}

function applyProjectFilters() {
  const list = document.querySelector('#projectList');
  if (!list) return;
  const query = (document.querySelector('#projectSearch')?.value || '').trim().toLocaleLowerCase('it-IT');
  const status = document.querySelector('#statusFilter')?.value || '';
  const priority = document.querySelector('#priorityFilter')?.value || '';
  let visible = 0;

  list.querySelectorAll('[data-project-card]').forEach(card => {
    const matches = (!query || card.dataset.search.includes(query)) &&
      (!status || card.dataset.status === status) &&
      (!priority || card.dataset.priority === priority);
    card.hidden = !matches;
    if (matches) visible += 1;
  });
  const empty = document.querySelector('#filteredEmpty');
  if (empty) empty.hidden = visible !== 0;
}

async function handleProjectStatus(id, status) {
  await setProjectStatus(id, status);
  showToast(status === 'completed' ? 'Progetto completato' : status === 'archived' ? 'Progetto archiviato' : 'Progetto riaperto');
  if (status === 'completed' || status === 'archived') router.navigate(`archive/project/${id}`);
  else router.navigate(`projects/project/${id}`);
}


function updateConnectionStatus() {
  if (!connectionBadge) return;
  const offline = !navigator.onLine;
  connectionBadge.hidden = !offline;
  connectionBadge.textContent = offline ? 'Offline' : '';
}

function installStabilityGuards() {
  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeSheet) closeSheet();
  });
  window.addEventListener('error', event => {
    console.error('PROJECTS runtime error:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', event => {
    console.error('PROJECTS rejected promise:', event.reason);
  });
}

function registerAlexHubBridge() {
  const bridge = createAlexModuleBridge({
    navigate: route => router.navigate(route),
    newProject: () => openProjectStart(),
    newTask: () => openTaskEditor(null, currentProjectId())
  });
  if (!globalThis.ALEX_HUB_MODULES || typeof globalThis.ALEX_HUB_MODULES !== 'object') {
    globalThis.ALEX_HUB_MODULES = {};
  }
  globalThis.ALEX_HUB_MODULES[MODULE.moduleId] = bridge;
  return bridge;
}

async function handleInitialAlexTarget() {
  const params = new URLSearchParams(location.search);
  const target = params.get('alexTarget');
  if (!target) return;
  try {
    const result = await dispatchActionTarget(target, {
      navigate: route => router.navigate(route),
      newProject: () => openProjectStart(),
      newTask: () => openTaskEditor(null, currentProjectId())
    });
    if (!result.valid) showToast('Azione ALEX non riconosciuta');
  } finally {
    params.delete('alexTarget');
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service Worker non registrato:', error);
  }
}

async function bootstrap() {
  document.documentElement.dataset.module = MODULE.moduleId;
  document.documentElement.dataset.version = MODULE.appVersion;

  try {
    await initializeDatabase();
    await ensureBuiltInTemplates();
  } catch (error) {
    console.error(error);
    showToast('Database locale non disponibile');
  }

  router = createRouter(showRoute);
  registerAlexHubBridge();
  await registerServiceWorker();

  installStabilityGuards();

  settingsButton.addEventListener('click', () => router.navigate('settings'));
  quickAddButton.addEventListener('click', () => openSheet(quickSheet));
  sheetBackdrop.addEventListener('click', () => closeSheet());

  document.addEventListener('click', async event => {
    const close = event.target.closest('[data-close-sheet]');
    if (close) {
      closeSheet();
      return;
    }

    const backupExport = event.target.closest('[data-backup-export]');
    if (backupExport) {
      await handleBackupExport();
      return;
    }

    const backupShare = event.target.closest('[data-backup-share]');
    if (backupShare) {
      await handleBackupExport({ share: true });
      return;
    }

    const backupImport = event.target.closest('[data-backup-import]');
    if (backupImport) {
      openBackupFilePicker();
      return;
    }

    const importMode = event.target.closest('[data-import-mode]');
    if (importMode) {
      await performImport(importMode.dataset.importMode);
      return;
    }

    const newProject = event.target.closest('[data-action="new-project"]');
    if (newProject) {
      closeSheet(false);
      await openProjectStart();
      return;
    }

    const templateBlank = event.target.closest('[data-template-blank]');
    if (templateBlank) {
      await openProjectEditor();
      return;
    }

    const templateUse = event.target.closest('[data-template-use]');
    if (templateUse) {
      await openProjectEditor(null, templateUse.dataset.templateUse);
      return;
    }

    const changeTemplate = event.target.closest('[data-change-template]');
    if (changeTemplate) {
      await openProjectStart();
      return;
    }

    const templatesOpen = event.target.closest('[data-templates-open]');
    if (templatesOpen) {
      await openTemplateLibrary();
      return;
    }

    const templateSave = event.target.closest('[data-template-save-project]');
    if (templateSave) {
      await openSaveTemplateEditor(templateSave.dataset.templateSaveProject);
      return;
    }

    const templateDelete = event.target.closest('[data-template-delete]');
    if (templateDelete) {
      if (confirm('Eliminare questo template personale? I progetti già creati non verranno modificati.')) {
        try {
          await deleteTemplate(templateDelete.dataset.templateDelete);
          showToast('Template eliminato');
          await openTemplateLibrary();
        } catch (error) {
          showToast(error?.message || 'Impossibile eliminare il template');
        }
      }
      return;
    }

    const newTask = event.target.closest('[data-action="new-task"]');
    if (newTask) {
      closeSheet(false);
      await openTaskEditor(null, currentProjectId());
      return;
    }

    const projectTaskNew = event.target.closest('[data-task-new]');
    if (projectTaskNew) {
      await openTaskEditor(null, projectTaskNew.dataset.taskNew);
      return;
    }

    const milestoneNew = event.target.closest('[data-milestone-new]');
    if (milestoneNew) {
      await openMilestoneEditor(null, milestoneNew.dataset.milestoneNew);
      return;
    }

    const addChecklist = event.target.closest('[data-checklist-add]');
    if (addChecklist) {
      const rows = document.querySelector('#checklistEditorRows');
      rows?.insertAdjacentHTML('beforeend', checklistRowHtml());
      rows?.lastElementChild?.querySelector('[data-checklist-text]')?.focus();
      return;
    }

    const removeChecklist = event.target.closest('[data-checklist-remove]');
    if (removeChecklist) {
      removeChecklist.closest('[data-checklist-row]')?.remove();
      return;
    }

    const nav = event.target.closest('[data-nav]');
    if (nav) {
      router.navigate(nav.dataset.nav);
      return;
    }

    const open = event.target.closest('[data-project-open]');
    if (open) {
      const root = open.dataset.status === 'completed' || open.dataset.status === 'archived' ? 'archive' : 'projects';
      router.navigate(`${root}/project/${open.dataset.projectOpen}`);
      return;
    }

    const target = event.target.closest('[data-action-target]');
    if (target?.dataset.actionTarget) {
      const path = target.dataset.actionTarget;
      if (path.startsWith('projects/project/')) router.navigate(path);
      return;
    }

    const edit = event.target.closest('[data-project-edit]');
    if (edit) {
      await openProjectEditor(edit.dataset.projectEdit);
      return;
    }

    const unblock = event.target.closest('[data-project-unblock]');
    if (unblock) {
      const project = await getProject(unblock.dataset.projectUnblock);
      if (project) {
        await updateProject(project.id, { ...project, blocked: false, blockedReason: '' });
        showToast('Progetto sbloccato');
        await refreshRoute();
      }
      return;
    }

    const taskEdit = event.target.closest('[data-task-edit]');
    if (taskEdit) {
      await openTaskEditor(taskEdit.dataset.taskEdit);
      return;
    }

    const taskToggle = event.target.closest('[data-task-toggle]');
    if (taskToggle) {
      try {
        await toggleTaskCompleted(taskToggle.dataset.taskToggle);
        showToast('Task aggiornato');
        await refreshRoute();
      } catch (error) {
        showToast(error?.message || 'Impossibile completare il task');
      }
      return;
    }

    const taskDelete = event.target.closest('[data-task-delete]');
    if (taskDelete) {
      if (confirm('Eliminare questo task? Le dipendenze che lo usano verranno scollegate.')) {
        await deleteTask(taskDelete.dataset.taskDelete);
        showToast('Task eliminato');
        await refreshRoute();
      }
      return;
    }

    const milestoneEdit = event.target.closest('[data-milestone-edit]');
    if (milestoneEdit) {
      await openMilestoneEditor(milestoneEdit.dataset.milestoneEdit);
      return;
    }

    const milestoneStatus = event.target.closest('[data-milestone-status]');
    if (milestoneStatus) {
      try {
        await setMilestoneStatus(milestoneStatus.dataset.milestoneId, milestoneStatus.dataset.milestoneStatus);
        showToast(milestoneStatus.dataset.milestoneStatus === 'completed' ? 'Milestone completata' : 'Milestone riaperta');
        await refreshRoute();
      } catch (error) {
        showToast(error?.message || 'Impossibile aggiornare la milestone');
      }
      return;
    }

    const milestoneDelete = event.target.closest('[data-milestone-delete]');
    if (milestoneDelete) {
      if (confirm('Eliminare questa milestone? I task collegati resteranno nel progetto senza milestone.')) {
        await deleteMilestone(milestoneDelete.dataset.milestoneDelete);
        showToast('Milestone eliminata');
        await refreshRoute();
      }
      return;
    }

    const noteNew = event.target.closest('[data-note-new]');
    if (noteNew) {
      await openNoteEditor(null, noteNew.dataset.noteNew);
      return;
    }

    const noteEdit = event.target.closest('[data-note-edit]');
    if (noteEdit) {
      await openNoteEditor(noteEdit.dataset.noteEdit);
      return;
    }

    const notePin = event.target.closest('[data-note-pin]');
    if (notePin) {
      try {
        await toggleNotePinned(notePin.dataset.notePin);
        showToast('Nota aggiornata');
        await refreshRoute();
      } catch (error) {
        showToast(error?.message || 'Impossibile aggiornare la nota');
      }
      return;
    }

    const noteDelete = event.target.closest('[data-note-delete]');
    if (noteDelete) {
      if (confirm('Eliminare questa nota?')) {
        await deleteNote(noteDelete.dataset.noteDelete);
        showToast('Nota eliminata');
        await refreshRoute();
      }
      return;
    }

    const referenceNew = event.target.closest('[data-reference-new]');
    if (referenceNew) {
      await openReferenceEditor(null, referenceNew.dataset.referenceNew);
      return;
    }

    const referenceEdit = event.target.closest('[data-reference-edit]');
    if (referenceEdit) {
      await openReferenceEditor(referenceEdit.dataset.referenceEdit);
      return;
    }

    const referenceDelete = event.target.closest('[data-reference-delete]');
    if (referenceDelete) {
      if (confirm('Eliminare questo riferimento? Il file o il sito originale non verrà toccato.')) {
        await deleteReference(referenceDelete.dataset.referenceDelete);
        showToast('Riferimento eliminato');
        await refreshRoute();
      }
      return;
    }

    const budgetEdit = event.target.closest('[data-budget-edit]');
    if (budgetEdit) {
      await openBudgetEditor(budgetEdit.dataset.budgetEdit);
      return;
    }

    const timelineNew = event.target.closest('[data-timeline-new]');
    if (timelineNew) {
      await openTimelineEditor(timelineNew.dataset.timelineNew);
      return;
    }

    const timelineDelete = event.target.closest('[data-timeline-delete]');
    if (timelineDelete) {
      if (confirm('Eliminare questo evento manuale dalla Timeline?')) {
        try {
          await deleteManualTimelineEntry(timelineDelete.dataset.timelineDelete);
          showToast('Evento rimosso');
          await refreshRoute();
        } catch (error) {
          showToast(error?.message || 'Impossibile eliminare l’evento');
        }
      }
      return;
    }

    const statusButton = event.target.closest('[data-project-status]');
    if (statusButton) {
      const status = statusButton.dataset.projectStatus;
      const id = statusButton.dataset.projectId;
      const label = status === 'completed' ? 'completare' : status === 'archived' ? 'archiviare' : 'riaprire';
      if (confirm(`Vuoi ${label} questo progetto?`)) await handleProjectStatus(id, status);
      return;
    }

    const del = event.target.closest('[data-project-delete]');
    if (del) {
      if (confirm('Eliminare definitivamente questo progetto? Questa azione rimuoverà anche task, milestone e dati collegati e non può essere annullata.')) {
        const project = await getProject(del.dataset.projectDelete);
        await deleteProject(del.dataset.projectDelete);
        showToast('Progetto eliminato');
        router.navigate(project && ['completed', 'archived'].includes(project.status) ? 'archive' : 'projects');
      }
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'projectSearch') applyProjectFilters();
  });

  document.addEventListener('change', async event => {
    if (['statusFilter', 'priorityFilter'].includes(event.target.id)) applyProjectFilters();
    if (event.target.id === 'blockedToggle') {
      document.querySelector('#blockedReasonField')?.classList.toggle('is-hidden', !event.target.checked);
    }
    if (event.target.id === 'taskProjectSelect') {
      await refreshTaskRelations(event.target.closest('#taskForm'));
    }
    if (event.target.id === 'referenceTypeSelect') {
      syncReferenceFields(event.target.closest('#referenceForm'));
    }
    if (event.target.id === 'budgetEnabledToggle') {
      document.querySelector('#budgetFields')?.classList.toggle('is-hidden', !event.target.checked);
    }
    if (event.target.matches('[data-checklist-toggle]')) {
      try {
        await toggleChecklistItem(event.target.dataset.taskId, event.target.dataset.itemId);
        await refreshRoute();
      } catch (error) {
        showToast(error?.message || 'Impossibile aggiornare la checklist');
      }
    }
  });

  document.addEventListener('submit', async event => {
    if (event.target.id === 'projectForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.blocked = form.elements.blocked.checked;
        data.blockedReason = data.blocked ? data.blockedReason : '';
        const id = form.dataset.projectId;
        const templateId = form.dataset.templateId || '';
        const project = id ? await updateProject(id, data) : templateId ? await createProjectFromTemplate(templateId, data) : await createProject(data);
        closeSheet();
        showToast(id ? 'Progetto aggiornato' : templateId ? 'Progetto creato dal template' : 'Progetto creato');
        router.navigate(`${['completed', 'archived'].includes(project.status) ? 'archive' : 'projects'}/project/${project.id}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare il progetto');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'saveTemplateForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const template = await createTemplateFromProject(form.dataset.projectId, data);
        closeSheet();
        showToast(`Template “${template.name}” salvato`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare il template');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'taskForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.dependencyIds = [...form.querySelectorAll('input[name="dependencyIds"]:checked')].map(input => input.value);
        data.checklist = [...form.querySelectorAll('[data-checklist-row]')].map(row => ({
          id: row.dataset.checklistId,
          text: row.querySelector('[data-checklist-text]')?.value || '',
          completed: Boolean(row.querySelector('[data-checklist-completed]')?.checked)
        })).filter(item => item.text.trim());
        const id = form.dataset.taskId;
        const task = id ? await updateTask(id, data) : await createTask(data);
        closeSheet();
        showToast(id ? 'Task aggiornato' : 'Task creato');
        router.navigate(`projects/project/${task.projectId}/task/${task.id}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare il task');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'milestoneForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const id = form.dataset.milestoneId;
        const milestone = id ? await updateMilestone(id, data) : await createMilestone(data);
        closeSheet();
        showToast(id ? 'Milestone aggiornata' : 'Milestone creata');
        router.navigate(`projects/project/${milestone.projectId}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare la milestone');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'noteForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.pinned = Boolean(form.elements.pinned.checked);
        const id = form.dataset.noteId;
        const note = id ? await updateNote(id, data) : await createNote(data);
        closeSheet();
        showToast(id ? 'Nota aggiornata' : 'Nota aggiunta');
        router.navigate(`projects/project/${note.projectId}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare la nota');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'referenceForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        if (data.type === 'file_reference') data.url = data.fileUrl || '';
        delete data.fileUrl;
        const id = form.dataset.referenceId;
        const reference = id ? await updateReference(id, data) : await createReference(data);
        closeSheet();
        showToast(id ? 'Riferimento aggiornato' : 'Riferimento aggiunto');
        router.navigate(`projects/project/${reference.projectId}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare il riferimento');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'budgetForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        data.enabled = Boolean(form.elements.enabled.checked);
        const project = await updateProjectBudget(form.dataset.projectId, data);
        closeSheet();
        showToast(data.enabled ? 'Budget aggiornato' : 'Budget disattivato');
        router.navigate(`${['completed', 'archived'].includes(project.status) ? 'archive' : 'projects'}/project/${project.id}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile salvare il budget');
      } finally {
        submit.disabled = false;
      }
      return;
    }

    if (event.target.id === 'timelineForm') {
      event.preventDefault();
      const form = event.target;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const entry = await createManualTimelineEntry(data);
        closeSheet();
        showToast('Evento aggiunto alla Timeline');
        router.navigate(`projects/project/${entry.projectId}`);
      } catch (error) {
        showToast(error?.message || 'Impossibile aggiungere l’evento');
      } finally {
        submit.disabled = false;
      }
      return;
    }
  });

  window.addEventListener('online', () => showToast('Connessione ripristinata'));
  window.addEventListener('offline', () => showToast('Sei offline: PROJECTS continua a funzionare'));
  await handleInitialAlexTarget();
}

bootstrap();
