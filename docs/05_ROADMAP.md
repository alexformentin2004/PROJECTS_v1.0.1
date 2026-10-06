# 05 — Roadmap proposta

## Milestone 0.1 — Architettura funzionale
Stato: completata.

Include:
- UX;
- schermate;
- modello dati;
- flussi;
- contratti ALEX HUB;
- storage strategy.

## Milestone 0.2 — Skeleton PWA
Stato: completata.

Include:
- struttura multi-file;
- manifest;
- service worker;
- shell offline;
- router;
- design system base;
- IndexedDB layer;
- dati demo.

## Milestone 0.3 — Core Projects
Stato: completata.

- CRUD progetti;
- stati/priorità;
- lista e dettaglio;
- ricerca base;
- archivio.

## Milestone 0.4 — Task, checklist, milestone
Stato: completata.

- task;
- checklist;
- milestone;
- scadenze;
- dipendenze anti-ciclo;
- calcolo progresso.

## Milestone 0.5 — Dashboard e Oggi
Stato: completata.

- Home relevance engine;
- Oggi;
- overdue;
- blocked;
- health;
- prossima azione.

## Milestone 0.6 — Note, riferimenti, timeline, budget
Stato: completata.

- note collegate;
- link/riferimenti file;
- timeline;
- budget semplice.

## Milestone 0.7 — Template
Stato: completata.

- template predefiniti e personali;
- blueprint task/milestone/checklist;
- dipendenze e relazioni ricostruite con nuovi UUID;
- offset date;
- salvataggio progetto come template.

## Milestone 0.8 — Export/import e migrazioni
Stato: completata.

- JSON completo conforme ALEX Integration Standard;
- validazione strutturale e relazionale;
- merge/replace;
- pipeline schema migrations;
- backup automatico pre-import;
- scrittura atomica IndexedDB;
- condivisione backup tramite Web Share quando disponibile.

## Milestone 0.9 — ALEX integration layer
Stato: completata.

- Today Contract;
- Insights Contract;
- Hub Summary;
- Events;
- Quick Actions;
- backup payload.

## Milestone 1.0 — Stabilizzazione
- test su iPhone;
- gestione errori;
- performance;
- accessibilità;
- README definitivo;
- pacchetto ZIP stabile.

## Struttura file prevista per il codice
```text
projects/
  index.html
  manifest.json
  sw.js
  assets/
    icons/
  css/
    app.css
  js/
    app.js
    router.js
    db.js
    models.js
    services/
      project-service.js
      task-service.js
      milestone-service.js
      search-service.js
      export-service.js
      integration-service.js
    ui/
      components.js
      views/
  README.md
```

La struttura può essere mantenuta vanilla HTML/CSS/JS, senza framework obbligatori e senza CDN necessarie.
