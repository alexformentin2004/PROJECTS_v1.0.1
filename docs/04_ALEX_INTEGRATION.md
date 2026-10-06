# 04 — ALEX Integration Standard

## Identità
- `moduleId`: `projects`
- `appVersion`: `0.9.0`
- `schemaVersion`: `1`

## Namespace
- DB: `alex.projects.db`
- eventuali chiavi browser: `alex.projects.*`

## Export format
```json
{
  "moduleId": "projects",
  "appVersion": "0.9.0",
  "schemaVersion": 1,
  "exportedAt": "2026-10-05T19:33:00.000Z",
  "settings": {},
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

## Today Contract
API logica proposta:
`getTodaySummary()` -> array di item normalizzati.

Esempio:
```json
[
  {
    "title": "Definire modello dati",
    "status": "overdue",
    "priority": "high",
    "shortText": "PROJECTS · scaduto ieri",
    "actionLabel": "Apri task",
    "actionTarget": "projects/project/<projectId>/task/<taskId>",
    "timestamp": "2026-10-04"
  }
]
```

Tipi di item esposti:
- task di oggi;
- task scaduti;
- milestone imminenti;
- progetti bloccati.

Ordinamento:
1. critical overdue;
2. high overdue;
3. blocked project;
4. today tasks;
5. upcoming milestones.

## Hub Summary
`getHubSummary()` deve restituire 2-5 elementi realmente utili.

Set consigliato dinamico:
- progetti attivi;
- task oggi;
- task scaduti;
- progetti bloccati;
- prossima milestone.

Se un valore è zero e poco informativo può essere omesso, mantenendo 2-5 elementi.

## Insights Contract
Forma minima:
```json
{
  "timestamp": "2026-10-05",
  "metricId": "active_projects",
  "value": 4,
  "unit": "count",
  "category": "projects",
  "sourceModule": "projects"
}
```

Metriche iniziali:
- `active_projects` — count;
- `tasks_due_today` — count;
- `overdue_tasks` — count;
- `blocked_projects` — count;
- `tasks_completed` — count per giorno;
- `project_progress` — percent, per progetto;
- `milestone_progress` — percent, per milestone;
- `project_budget_planned` — EUR/valuta;
- `project_budget_spent` — EUR/valuta.

## Eventi
Eventi normalizzati esposti quando hanno significato temporale:
- `projects.task_due`
- `projects.milestone_due`
- `projects.project_due`

Esempio:
```json
{
  "eventId": "task:<id>:due",
  "sourceModule": "projects",
  "type": "projects.task_due",
  "title": "Definire modello dati",
  "startAt": "2026-10-06",
  "endAt": null,
  "priority": "high",
  "completed": false,
  "allDay": true
}
```

## Quick Actions
- `Nuovo task`
- `Nuovo progetto`

Possibili future:
- `Apri Oggi`
- `Segna progetto bloccato`

## Backup globale
PROJECTS fornisce un payload autonomo. Nessuna chiave generica o collisione con altri moduli. Il futuro ALEX HUB può includere il payload così com'è sotto il nodo `projects` senza interpretarne i dati interni.

## Compatibilità autonoma
Tutte le funzioni principali devono funzionare senza ALEX HUB. I contratti sono adapter di uscita, non dipendenze obbligatorie.

## File e documenti
PROJECTS memorizza riferimenti, nomi, URL o hint descrittivi. Non assume di poter mantenere handle permanenti verso file locali iPhone e non crea un archivio documentale parallelo.


## Export/import operativo — v0.8
PROJECTS implementa il formato completo richiesto dallo standard. L'export include settings, tutti i dati funzionali e metadata. L'import valida `moduleId`, schema, ID, relazioni e dipendenze prima della scrittura. Sono disponibili `merge` e `replace`, entrambe precedute da backup locale automatico. La pipeline di migrazione è pronta per future `schemaVersion`.


## Integration Layer operativo — v0.9
Il file `js/services/integration-service.js` rende i contratti precedenti una vera API di modulo.

### Protocollo
- protocol: `alex-hub-module`;
- protocolVersion: `1`;
- moduleApiVersion: `1.0.0`.

### Contract version
- `today`: 1;
- `hubSummary`: 1;
- `insights`: 1;
- `events`: 1;
- `quickActions`: 1;
- `globalBackup`: 1;
- `actionTarget`: 1.

### Capability discovery
`getModuleDescriptor()` permette all'HUB di verificare quali capability sono disponibili prima di invocarle.

### Bridge browser
PROJECTS registra opzionalmente `globalThis.ALEX_HUB_MODULES.projects`, che espone i metodi pubblici senza rendere ALEX HUB una dipendenza.

### Action target
`parseActionTarget()` e `dispatchActionTarget()` gestiscono quick action e navigazione interne con target stabili. È disponibile anche `?alexTarget=` all'avvio della PWA.

### Global backup contribution
`getGlobalBackupContribution()` restituisce un envelope con `storageKey: modules.projects` e payload PROJECTS completo. L'HUB non deve conoscere object store o schema interno per includere il modulo nel backup globale.

### Diagnostica
`getIntegrationDiagnostics()` controlla a runtime la normalizzazione di Today, Hub Summary, Insights, Events e Quick Actions. La schermata Impostazioni mostra versioni contratto e conteggi correnti.
