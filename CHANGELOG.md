# CHANGELOG — PROJECTS

## v1.0.1
### Hotfix release completa
- Corretto il pacchetto v1.0.0 distribuito incompleto: mancavano cartelle `js/`, `css/`, `assets/`, manifest e Service Worker.
- Ripristinato il progetto completo a partire dalla codebase v0.9 stabile.
- App version aggiornata a `1.0.1`; schema e database restano invariati.
- Service Worker con cache isolata `alex-projects-shell-*` e cache corrente `v1.0.1`.
- `IndexedDB` chiude la connessione su `versionchange`.
- Badge Offline e `aria-current` sulla navigazione.
- Chiusura dei pannelli con ESC e gestione errori runtime di base.
- Refresh grafico: superfici più pulite, gerarchia visiva migliore, CTA e tab bar più moderne, focus accessibile.
- Aggiunto `.nojekyll` per GitHub Pages.
- Verifica automatica che tutte le risorse della shell esistano prima del rilascio.

## v0.9.0
### Nuovo
- ALEX Integration Layer definitivo in `integration-service.js`.
- Descriptor modulo versionato con protocollo, Module API, contract version e capability discovery.
- Contract version v1 per Today, Hub Summary, Insights, Events, Quick Actions, Global Backup e Action Target.
- Quick Actions normalizzate con `sourceModule: projects`.
- `getIntegrationSnapshot()` per leggere i payload HUB in un'unica chiamata coerente.
- `getIntegrationDiagnostics()` con controlli runtime sulla forma dei contratti.
- `getGlobalBackupContribution()` con envelope `alex-hub-module-backup` e `storageKey: modules.projects`.
- Resolver e dispatcher per target `projects/action/*`, progetto e task.
- Bridge opzionale `globalThis.ALEX_HUB_MODULES.projects`.
- Supporto standalone a `?alexTarget=<target>`.
- Diagnostica ALEX HUB nella schermata Impostazioni.
- Test `integration-layer-smoke.mjs`.

### Modificato
- App version `0.8.0` → `0.9.0`.
- Cache PWA `alex-projects-shell-v0.9.0`.
- `integration-service.js` aggiunto alla shell offline.
- Documentazione ALEX Integration aggiornata alla API realmente implementata.

### Compatibilità
- `schemaVersion` resta `1`.
- `dbVersion` resta `1`.
- Nessuna migrazione dati richiesta dalla v0.8.
- Il bridge HUB è opzionale: PROJECTS continua a funzionare in autonomia.

## v0.8.0
### Nuovo
- Export JSON completo conforme ALEX Integration Standard.
- Sezione Impostazioni → Dati e backup.
- Condivisione backup tramite Web Share quando supportata.
- Import JSON guidato con anteprima versione, schema e conteggi.
- Validazione di modulo, schema, store, ID, relazioni e dipendenze.
- Rilevamento di auto-dipendenze e cicli nei backup.
- Modalità `Unisci` con conflitti risolti tramite `updatedAt`.
- Modalità `Sostituisci` dell'intero database PROJECTS.
- Backup automatico `PROJECTS_pre_import_*` prima di ogni import.
- Scrittura atomica multi-store IndexedDB.
- Seconda validazione sul risultato di un merge prima della scrittura.
- Pipeline `migrateBackup()` pronta per future schemaVersion.
- Nuovo servizio `backup-service.js` incluso nella shell offline.
- Metadata `lastImport` dopo un import completato.

### Test
- `backup-service-smoke.mjs`: formato, validazione e casi corrotti.
- `backup-import-db-smoke.mjs`: replace e merge su IndexedDB simulato.
- Regressione template v0.7 verificata.

### Modificato
- App version `0.7.0` → `0.8.0`.
- Cache PWA `alex-projects-shell-v0.8.0`.

### Compatibilità
- `schemaVersion` resta `1`.
- `dbVersion` resta `1`.
- Nessuna migrazione dati richiesta dalla v0.7.

## v0.7.0
### Nuovo
- Libreria template offline con 6 modelli predefiniti: Sviluppo app, Acquisto importante, Viaggio, Nuovo PC, Progetto auto, Obiettivo complesso.
- Flusso `Nuovo progetto` con scelta fra progetto vuoto e template.
- Generazione automatica di milestone, task, checklist, associazioni e dipendenze.
- Scadenze relative tramite `offsetDays` calcolate dalla data di inizio.
- Salvataggio di un progetto esistente come template personale.
- Libreria Modelli con distinzione ALEX/personali e cancellazione dei template personali.
- Memorizzazione opzionale `templateId`/`templateName` sul progetto creato.
- Evento Timeline `template.applied`.
- Nuovo servizio `template-service.js` incluso nella shell offline.

### Modificato
- App version `0.6.0` → `0.7.0`.
- Cache PWA `alex-projects-shell-v0.7.0`.
- Pulsante `Nuovo progetto` ora apre il selettore Vuoto/Template.
- Sezione Progetti aggiunge accesso rapido `Modelli`.
- Dettaglio progetto aggiunge `Salva come template`.
- `project-service` conserva l'origine template durante le modifiche successive.

### Compatibilità
- `schemaVersion` resta `1`.
- `dbVersion` resta `1`.
- Lo store `templates` era già previsto e creato nelle versioni precedenti.
- Nessuna migrazione dati richiesta dalla v0.6.

## v0.6.0
- Note, riferimenti, Timeline visuale e budget opzionale.

## v0.5.0
- Dashboard evoluta, Oggi, health automatico e prossima azione.

## v0.4.0
- Task, checklist, milestone e dipendenze anti-ciclo.
- Avanzamento automatico progetto e milestone.

## v0.3.0
- CRUD progetti, ricerca, filtri, archivio e blocco progetto.

## v0.2.0
- Skeleton PWA, IndexedDB, Service Worker e contratti ALEX HUB iniziali.
