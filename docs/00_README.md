# PROJECTS — ALEX HUB module

**Milestone:** v0.1 — Architettura funzionale  
**moduleId:** `projects`  
**appVersion:** `0.1.0`  
**schemaVersion:** `1` (bozza iniziale)

PROJECTS è una PWA personale, offline-first, ottimizzata per iPhone, pensata per gestire progetti reali e complessi senza sostituire Note o Promemoria.

## Obiettivo
Centralizzare per ogni progetto: stato, milestone, task, checklist, priorità, scadenze, note collegate, budget opzionale, riferimenti a file/link, timeline, avanzamento e dipendenze semplici.

## Principi
- iPhone-first e touch-first;
- offline per le funzioni essenziali;
- zero servizi a pagamento necessari;
- dati locali con IndexedDB;
- export/import JSON completo;
- modulo autonomo ma predisposto per ALEX HUB;
- task sempre collegati a un progetto;
- niente archivio documentale parallelo all'app File;
- budget di progetto, non contabilità completa.

## Navigazione proposta
Tab bar inferiore:
1. Home
2. Progetti
3. Oggi
4. Archivio

Azione globale `+` per:
- Nuovo progetto
- Nuovo task

Ricerca globale accessibile da Progetti e Archivio. Impostazioni/Dati accessibili dall'header.

## File di questa milestone
- `01_UX_E_SCHERMATE.md`
- `02_MODELLO_DATI.md`
- `03_FLUSSI.md`
- `04_ALEX_INTEGRATION.md`
- `05_ROADMAP.md`

Nessun codice applicativo è incluso in questa milestone: l'obiettivo è congelare l'architettura funzionale prima dello sviluppo.
