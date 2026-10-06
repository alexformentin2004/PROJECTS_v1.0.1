# PROJECTS v1.0.1

> **Hotfix della release installabile.** La v1.0.0 distribuita in precedenza era incompleta e conteneva soltanto quattro file. La v1.0.1 include l’intera PWA: HTML, CSS, JavaScript, icone, manifest, Service Worker, documentazione e test.

**moduleId:** `projects`  \n**appVersion:** `1.0.1`  \n**schemaVersion:** `1`  \n**dbVersion:** `1`

PWA personale offline-first per gestire progetti reali e futura componente di ALEX HUB. La v0.9 consolida il **layer di integrazione ALEX HUB** sopra il core già composto da progetti, task, milestone, checklist, dipendenze, Dashboard, Oggi, note, riferimenti, Timeline, budget, template ed export/import.

## Scopo
PROJECTS serve a portare avanti obiettivi complessi senza diventare una copia di Note o Promemoria. La struttura principale resta:

**Progetto → Milestone → Task → Checklist**

con health automatico, prossima azione, contesto collegato e backup portabile.

## Identità modulo
- `moduleId`: `projects`
- `appVersion`: `0.9.0`
- `schemaVersion`: `1`
- IndexedDB: `alex.projects.db`
- DB version: `1`
- namespace logico: `alex.projects.*`
- cache PWA: `alex-projects-shell-v0.9.0`

Non è richiesta alcuna migrazione dalla v0.8: lo schema dati resta `1`.

## Funzioni
### Base PWA
- HTML/CSS/JavaScript vanilla;
- manifest installabile;
- Service Worker e shell offline;
- IndexedDB locale;
- interfaccia touch-first con safe-area iPhone;
- light/dark automatico;
- nessuna CDN o servizio a pagamento indispensabile.

### Progetti
- CRUD progetto;
- stati `idea`, `planning`, `active`, `paused`, `completed`, `archived`;
- priorità, data inizio, scadenza, tag e blocco manuale;
- ricerca, filtri e archivio;
- health derivato: In linea / A rischio / In ritardo / Bloccato;
- prossima azione automatica;
- origine template visibile quando il progetto nasce da un modello.

### Task, checklist e milestone
- CRUD task e milestone;
- priorità e scadenze;
- checklist;
- collegamento Task → Milestone;
- dipendenze semplici anti-ciclo nello stesso progetto;
- task bloccato derivato dai prerequisiti;
- avanzamento automatico di task, milestone e progetto.

### Dashboard e Oggi
- focus action globale;
- distribuzione health;
- scaduti, oggi, bloccati e milestone imminenti;
- prossime azioni suggerite.

### Note, riferimenti, Timeline e budget
- note collegate e fissabili;
- riferimenti link/file/testuali senza duplicare File;
- Timeline automatica e manuale;
- budget semplice previsto/speso/residuo senza registro transazioni.

### Template
Template predefiniti:
- Sviluppo app;
- Acquisto importante;
- Viaggio;
- Nuovo PC;
- Progetto auto;
- Obiettivo complesso.

È possibile anche salvare un progetto esistente come template personale. Date, dipendenze, checklist e collegamenti alle milestone vengono trasformati in una struttura riutilizzabile con nuovi UUID a ogni applicazione.


## ALEX Integration Layer — v0.9
PROJECTS espone ora un adapter stabile e versionato tramite `js/services/integration-service.js`.

### Descriptor del modulo
`getModuleDescriptor()` dichiara:
- protocollo `alex-hub-module` v1;
- `moduleApiVersion: 1.0.0`;
- identità modulo e namespace;
- versioni dei singoli contratti;
- capability disponibili;
- autonomia standalone e offline-first.

### Contratti versionati
- Today Contract v1;
- Hub Summary v1;
- Insights Contract v1;
- Events Contract v1;
- Quick Actions Contract v1;
- Global Backup Contribution v1;
- Action Target Contract v1.

### Bridge opzionale
All'avvio PROJECTS registra, quando possibile, `ALEX_HUB_MODULES.projects`. Il bridge espone descriptor, Today, Hub Summary, Insights, Events, Quick Actions, snapshot integrazione, contributo backup e dispatcher degli action target. La presenza di ALEX HUB non è richiesta: se l'oggetto globale non esiste, PROJECTS lo crea localmente e continua a funzionare come PWA autonoma.

### Action target
Sono supportati target stabili come:
- `projects/action/new-task`;
- `projects/action/new-project`;
- `projects/project/<projectId>`;
- `projects/project/<projectId>/task/<taskId>`.

È supportato anche l'avvio standalone con query `?alexTarget=<target>`, utile a un futuro HUB per aprire PROJECTS direttamente nel punto corretto.

### Snapshot integrazione
`getIntegrationSnapshot()` può produrre in un'unica chiamata descriptor, Today, Hub Summary, Quick Actions e, opzionalmente, Insights, Events e Today Overview.

### Diagnostica
Impostazioni mostra ora protocollo, Module API, namespace, numero capability, conteggi runtime e versioni dei contratti. `getIntegrationDiagnostics()` verifica inoltre la forma normalizzata dei payload.

## Export / Import — v0.8
La sezione **Impostazioni → Dati e backup** offre:

- **Esporta JSON** — genera un backup completo locale;
- **Condividi backup** — usa Web Share / foglio Condivisione su iPhone quando supportato, con fallback al download;
- **Importa JSON** — apre un flusso guidato di validazione e anteprima.

### Formato export
```json
{
  "moduleId": "projects",
  "appVersion": "0.9.0",
  "schemaVersion": 1,
  "exportedAt": "2026-10-06T07:30:00.000Z",
  "settings": {
    "locale": "it-IT",
    "currency": "EUR",
    "upcomingMilestoneDays": 7
  },
  "data": {
    "projects": [],
    "milestones": [],
    "tasks": [],
    "notes": [],
    "references": [],
    "timelineEntries": [],
    "templates": []
  },
  "metadata": {
    "exportFormatVersion": 1,
    "namespace": "alex.projects",
    "dbName": "alex.projects.db",
    "dbVersion": 1,
    "recordCounts": {},
    "records": []
  }
}
```

### Validazione import
Prima di qualunque scrittura vengono controllati:
- JSON valido;
- presenza dei campi obbligatori;
- `moduleId === "projects"`;
- `schemaVersion` supportata;
- store dati attesi;
- record con ID valido e non duplicato;
- riferimenti a progetti esistenti;
- task → milestone coerente;
- dipendenze task esistenti e nello stesso progetto;
- auto-dipendenze;
- cicli nelle dipendenze.

Un backup con schema più recente di quello supportato viene respinto.

### Unisci
Mantiene i dati locali e aggiunge quelli del backup. Quando due record hanno lo stesso `id`, viene mantenuto quello con `updatedAt` più recente. Il risultato completo viene validato nuovamente prima della scrittura.

### Sostituisci
Rimpiazza tutti gli store PROJECTS con il contenuto del backup.

### Backup pre-import
Prima di `Unisci` o `Sostituisci` viene automaticamente generato:

`PROJECTS_pre_import_YYYY-MM-DD_HHMM.json`

contenente lo stato immediatamente precedente all'import.

### Scrittura atomica
L'import usa una sola transazione IndexedDB su tutti gli object store. Non viene lasciato un database parzialmente aggiornato se l'operazione fallisce.

### Migrazioni
`migrateBackup()` è già predisposta per migrazioni sequenziali fra `schemaVersion`.

Nella v0.8 lo schema corrente resta `1`, quindi non è necessaria una trasformazione concreta. Tutte le versioni PROJECTS sviluppate finora condividono lo stesso schema.

## Struttura file
```text
PROJECTS_v0.9/
├── index.html
├── manifest.json
├── sw.js
├── README.md
├── CHANGELOG.md
├── TEST_REPORT.md
├── START_PROJECTS_WINDOWS.bat
├── assets/icons/
├── css/app.css
├── docs/
│   ├── 11_V0.8_BACKUP_IMPORT.md
│   └── 12_V0.9_ALEX_INTEGRATION_LAYER.md
├── tests/
│   ├── template-service-smoke.mjs
│   ├── backup-service-smoke.mjs
│   ├── backup-import-db-smoke.mjs
│   └── integration-layer-smoke.mjs
└── js/
    ├── app.js
    ├── constants.js
    ├── db.js
    ├── router.js
    ├── views.js
    ├── integration.js
    └── services/
        ├── project-service.js
        ├── task-service.js
        ├── milestone-service.js
        ├── project-intelligence.js
        ├── note-service.js
        ├── reference-service.js
        ├── timeline-service.js
        ├── template-service.js
        ├── backup-service.js
        └── integration-service.js
```

## Schema dati
Object store IndexedDB:
- `projects`
- `milestones`
- `tasks`
- `notes`
- `references`
- `timelineEntries`
- `templates`
- `settings`
- `metadata`

Il formato dati funzionale resta invariato; la v0.9 non aggiunge store e non modifica campi obbligatori delle entità.

## Chiavi storage/database
Nessuna chiave generica `data`, `settings` o `history` in localStorage. Database dedicato: `alex.projects.db`. Preferenze UI sotto `alex.projects.ui.*`.

## Today Contract
`getTodaySummary()` espone task scaduti/oggi, task o progetti bloccati e milestone imminenti tramite campi normalizzati `title`, `status`, `priority`, `shortText`, `actionLabel`, `actionTarget`, `timestamp`.

## Insights Contract
`getInsights()` produce metriche normalizzate con `timestamp`, `metricId`, `value`, `unit`, `category`, `sourceModule`.

Metriche attive:
- `active_projects`;
- `tasks_due_today`;
- `overdue_tasks`;
- `blocked_projects`;
- `project_progress`;
- `project_health`;
- `project_budget_planned`;
- `project_budget_spent`.

## Hub Summary
`getHubSummary()` restituisce massimo 5 informazioni ad alta rilevanza: progetti attivi, task oggi, scaduti, progetti bloccati e prossima milestone quando utile.

## Eventi
`getEvents()` espone:
- `projects.task_due`;
- `projects.milestone_due`;
- `projects.project_due`.

## Quick actions
- `Nuovo task`
- `Nuovo progetto`

## Offline first
Dopo il primo caricamento via HTTP/HTTPS, Service Worker e IndexedDB consentono l'uso essenziale offline. Anche `backup-service.js` e `integration-service.js` sono inclusi nella shell cache v0.9: backup e contratti HUB non richiedono connessione.

## Backup globale ALEX HUB
Il metodo `getGlobalBackupContribution()` restituisce un envelope autonomo:
- `format: alex-hub-module-backup`;
- `formatVersion: 1`;
- `moduleId: projects`;
- namespace `alex.projects`;
- `storageKey: modules.projects`;
- `payload` contenente l'export PROJECTS completo.

Il futuro backup globale può quindi raccogliere i moduli sotto `modules.<moduleId>` senza collisioni e senza interpretare i dati interni di PROJECTS.

## Limiti noti
- nessuna sincronizzazione cloud automatica;
- nessuna collaborazione multiutente;
- limite import singolo impostato a 50 MB;
- il test visuale finale su Safari/iPhone va eseguito sul dispositivo reale;
- le migrazioni concrete saranno aggiunte solo quando nascerà una nuova `schemaVersion`.

## Avvio su Windows
1. Estrarre lo ZIP.
2. Aprire la cartella `PROJECTS_v0.9`.
3. Eseguire `START_PROJECTS_WINDOWS.bat`.
4. Aprire l'indirizzo locale mostrato dal terminale.

Per test PWA e Service Worker non aprire `index.html` direttamente con `file://`.

## Versione corrente
**PROJECTS 0.9.0 — schema 1 — DB 1**

Prossima milestone prevista: **v1.0 — Stabilizzazione, test reali su iPhone e rifinitura finale**.