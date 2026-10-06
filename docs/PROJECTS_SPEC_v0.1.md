# PROJECTS v0.1 — Specifica congelata

Questa milestone definisce l'architettura funzionale iniziale della PWA PROJECTS.

Decisioni chiave:
- moduleId `projects`;
- appVersion `0.1.0`;
- schemaVersion `1`;
- namespace `alex.projects.*`;
- storage principale IndexedDB `alex.projects.db`;
- task sempre collegato a un progetto;
- dashboard centrata su attenzione/prossima azione;
- schermata Oggi operativa;
- avanzamento auto + manuale;
- dipendenze task semplici e senza cicli;
- budget leggero di progetto, non contabilità;
- riferimenti ai file, non archivio documentale;
- export/import JSON completo;
- offline-first;
- integrazione ALEX HUB tramite Today, Insights, Hub Summary, Events e Quick Actions.

Per i dettagli completi vedere i documenti numerati inclusi nel pacchetto.
