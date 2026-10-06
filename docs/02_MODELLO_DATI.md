# 02 — Modello dati

## Identità modulo
```json
{
  "moduleId": "projects",
  "appVersion": "0.9.0",
  "schemaVersion": 1
}
```

## Storage
Database IndexedDB proposto:
- `alex.projects.db`

Object store:
- `projects`
- `milestones`
- `tasks`
- `notes`
- `references`
- `timelineEntries`
- `templates`
- `settings`
- `metadata`

Chiavi locali accessorie, se necessarie:
- `alex.projects.ui.lastRoute`
- `alex.projects.ui.preferences`

Nessuna chiave generica come `data`, `settings`, `history` fuori dal namespace del modulo.

## Entità Project
```json
{
  "id": "uuid",
  "title": "PROJECTS",
  "description": "",
  "status": "active",
  "priority": "high",
  "tags": ["app", "alex-hub"],
  "startDate": "2026-10-05",
  "targetDate": null,
  "progressMode": "auto",
  "manualProgress": null,
  "blocked": false,
  "blockedReason": null,
  "blockedSince": null,
  "budget": {
    "enabled": false,
    "currency": "EUR",
    "planned": null,
    "spent": null,
    "note": null
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "completedAt": null,
  "archivedAt": null
}
```

### Project status
- `idea`
- `planning`
- `active`
- `paused`
- `completed`
- `archived`

### Priority
- `low`
- `normal`
- `high`
- `critical`

## Entità Milestone
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "title": "Prototipo utilizzabile",
  "description": "",
  "status": "planned",
  "priority": "high",
  "targetDate": "2026-10-20",
  "completedAt": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Stati milestone:
- `planned`
- `active`
- `completed`
- `cancelled`

`overdue` è derivato, non salvato.

## Entità Task
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "milestoneId": null,
  "title": "Definire modello dati",
  "description": "",
  "status": "todo",
  "priority": "high",
  "dueDate": "2026-10-06",
  "dueTime": null,
  "dependencyIds": [],
  "checklist": [
    {
      "id": "uuid",
      "text": "Definire Project",
      "completed": true
    }
  ],
  "estimateMinutes": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "startedAt": null,
  "completedAt": null
}
```

Stati task:
- `todo`
- `in_progress`
- `waiting`
- `completed`
- `cancelled`

Lo stato `blocked` non viene salvato: è derivato quando almeno una dipendenza non è completata.

## Regole dipendenze
- un task non può dipendere da sé stesso;
- sono vietati cicli;
- una dipendenza può puntare solo a task dello stesso progetto nella v1;
- un task è actionable solo se tutte le dipendenze sono `completed`;
- eliminando un task, i riferimenti dipendenza devono essere ripuliti o segnalati prima della conferma.

## Entità Note
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "title": "Decisioni tecniche",
  "body": "Testo semplice",
  "pinned": false,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Le note sono collegate al progetto e non aspirano a sostituire l'app Note.

## Entità Reference
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "type": "link",
  "label": "Repository",
  "url": "https://...",
  "fileName": null,
  "fileHint": null,
  "text": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Tipi:
- `link`
- `file_reference`
- `text_reference`

Per file locali si salva un riferimento descrittivo/nome/link disponibile, non una copia obbligatoria del documento.

## Entità TimelineEntry
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "type": "project.status_changed",
  "title": "Progetto avviato",
  "detail": null,
  "occurredAt": "ISO-8601",
  "source": "system",
  "entityType": "project",
  "entityId": "uuid"
}
```

Tipi indicativi:
- `project.created`
- `project.status_changed`
- `project.blocked`
- `project.unblocked`
- `milestone.status_changed`
- `task.status_changed`
- `budget.updated`
- `note.created`
- `reference.created`
- `manual.note`
- `template.applied`

Non si registra ogni micro-modifica: la timeline deve restare leggibile.

## Entità Template
```json
{
  "id": "uuid oppure builtin.*",
  "name": "Acquisto importante",
  "description": "",
  "category": "Acquisti",
  "icon": "◇",
  "source": "builtin | custom",
  "locked": false,
  "projectDefaults": {
    "status": "planning",
    "priority": "normal",
    "tags": ["acquisto"],
    "durationDays": 21
  },
  "milestones": [
    { "key": "m_1", "title": "Shortlist pronta", "priority": "normal", "offsetDays": 10 }
  ],
  "tasks": [
    {
      "key": "t_1",
      "title": "Confrontare alternative",
      "priority": "high",
      "offsetDays": 8,
      "milestoneKey": "m_1",
      "dependsOnKeys": [],
      "checklist": [{ "text": "Prezzo" }]
    }
  ],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Le date dei blueprint sono espresse come `offsetDays` dalla nuova data di partenza. `null` mantiene un task/milestone senza scadenza. Le relazioni usano chiavi logiche e vengono convertite in nuovi UUID all'istanziazione.

## Calcolo avanzamento
### Task progress
- task completato = 100%;
- task non completato con checklist = elementi completati / totale;
- task non completato senza checklist = 0%.

### Milestone progress
Media del progresso dei task collegati, esclusi i task `cancelled`.

### Project progress automatico
Media del progresso di tutti i task non `cancelled` del progetto.

Se non esistono task:
- 0% finché il progetto non è completato;
- 100% quando `completed`.

### Manual mode
`progressMode = manual` abilita `manualProgress` da 0 a 100.

## Prossima azione derivata
È il task non completato:
- non bloccato da dipendenze;
- con priorità più alta;
- poi con scadenza più vicina;
- poi con ordine/creazione più vecchia.

## Budget
Nella v1 è un riepilogo di progetto:
- budget pianificato;
- spesa effettiva inserita manualmente;
- valuta;
- nota.

Non è un registro transazioni. In futuro potrà ricevere riferimenti dal modulo MONEY senza duplicarne i dati.

## Date
Per scadenze giornaliere si usa `YYYY-MM-DD` per evitare problemi di timezone. L'orario è opzionale in un campo separato. Timestamp tecnici (`createdAt`, `updatedAt`) sono ISO-8601 completi.
