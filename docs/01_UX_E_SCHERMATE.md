# 01 — UX e schermate

## Filosofia UX
PROJECTS deve rispondere velocemente a quattro domande:
1. Cosa devo fare oggi?
2. Quali progetti richiedono attenzione?
3. Qual è la prossima azione utile per ogni progetto?
4. Quanto è avanzato ogni progetto?

La UI evita schermate dense e usa progressive disclosure: titolo e campi essenziali subito, dettagli avanzati solo quando servono.

## Design iPhone-first
- target touch minimo circa 44 pt;
- tab bar inferiore persistente;
- pulsanti principali raggiungibili con il pollice;
- modali/bottom sheet per creazione rapida;
- schermate full-screen per editor complessi;
- supporto light/dark mode;
- niente dipendenze da hover;
- layout a una colonna su iPhone;
- feedback immediato per salvataggi locali;
- nessuna funzione essenziale dipendente dalla rete.

## 1. Home / Dashboard
Scopo: mostrare solo ciò che richiede attenzione.

Header:
- saluto/titolo PROJECTS;
- pulsante ricerca;
- pulsante impostazioni/dati.

KPI sintetici:
- progetti attivi;
- task oggi;
- task scaduti;
- progetti bloccati.

Sezioni:
### Richiede attenzione
Card dinamiche ordinate per criticità:
- progetto bloccato;
- task scaduti;
- milestone imminente;
- progetto con deadline vicina.

### Progetti attivi
Massimo 3-5 card ad alta rilevanza. Ogni card mostra:
- nome;
- stato;
- priorità;
- percentuale avanzamento;
- prossima milestone;
- prossima azione disponibile;
- eventuale indicatore bloccato/scaduto.

### Prossime milestone
Elenco breve delle milestone più vicine.

La Home NON mostra tutti i task: per quello esiste Oggi e il dettaglio progetto.

## 2. Progetti
Elenco di tutti i progetti non archiviati.

Controlli:
- ricerca;
- filtri stato;
- filtri priorità;
- ordinamento per rilevanza, scadenza, aggiornamento, avanzamento;
- chip opzionali per tag.

Card progetto:
- titolo;
- stato;
- priorità;
- progresso;
- target date;
- prossima milestone;
- prossima azione;
- badge bloccato/scaduto quando necessario.

Tap sulla card -> Dettaglio progetto.

## 3. Oggi
È la schermata operativa, distinta dalla futura app TODAY dell'HUB.

Sezioni nell'ordine:
1. Scaduti
2. Da fare oggi
3. Milestone imminenti
4. Bloccati
5. Prossimi 7 giorni

Ogni task mostra:
- checkbox stato;
- titolo;
- progetto;
- priorità;
- scadenza;
- icona dipendenze se bloccato.

Azioni rapide:
- completa;
- avvia;
- cambia data;
- apri progetto.

## 4. Archivio
Contiene progetti con stato `archived` e completati eventualmente filtrabili.

Funzioni:
- ricerca completa;
- filtro per stato, anno, tag;
- riapri/ripristina progetto;
- esporta singolo progetto;
- elimina definitivamente con conferma esplicita.

## 5. Dettaglio progetto
Header:
- titolo;
- stato;
- priorità;
- health badge;
- progresso;
- menu modifica.

CTA principale dinamica:
- `Aggiungi task` se non esiste una prossima azione;
- `Apri prossima azione` se disponibile;
- `Sblocca progetto` se esplicitamente bloccato.

Segmenti:
### Panoramica
- descrizione breve;
- date progetto;
- avanzamento;
- prossima milestone;
- prossima azione;
- milestone principali;
- budget opzionale;
- note collegate;
- riferimenti/link/file;
- blocco corrente e motivazione.

### Task
- Tutti / Da fare / In corso / In attesa / Completati;
- raggruppamento opzionale per milestone;
- dipendenze visibili;
- checklist espandibile;
- creazione rapida.

### Timeline
Unisce:
- eventi futuri datati (milestone/task/deadline);
- eventi storici significativi;
- annotazioni manuali di timeline.

## 6. Editor progetto
Campi principali:
- titolo obbligatorio;
- descrizione;
- stato;
- priorità;
- data inizio opzionale;
- target date opzionale;
- tags;
- modalità avanzamento: automatico/manuale;
- valore manuale se scelto;
- blocco progetto + motivo;
- budget opzionale.

Creazione rapida: inizialmente mostra solo titolo, stato, priorità, target date e template. Il resto sta sotto `Altri dettagli`.

## 7. Editor task
Campi:
- titolo obbligatorio;
- progetto obbligatorio;
- stato;
- priorità;
- scadenza;
- milestone opzionale;
- checklist;
- dipendenze;
- nota breve;
- stima facoltativa;

Le dipendenze sono nascoste sotto sezione avanzata per mantenere l'editor rapido.

## 8. Editor milestone
Campi:
- titolo;
- progetto;
- data target;
- stato;
- priorità;
- descrizione;
- task collegati.

Il progresso della milestone è derivato dai task collegati.

## 9. Template
Schermata con:
- template personali;
- template predefiniti opzionali;
- anteprima di milestone/task generati;
- duplicazione/modifica/eliminazione template personale.

I template possono usare offset relativi alla data di partenza del progetto.

## 10. Impostazioni e dati
- versione app/schema;
- export completo;
- import con anteprima;
- modalità merge/sostituzione;
- reset dati con doppia conferma;
- preferenze UI;
- gestione template;
- documentazione contratti ALEX HUB.

## Regole di rilevanza Home
Ordine consigliato:
1. progetto bloccato ad alta priorità;
2. task scaduto;
3. milestone scaduta/imminente;
4. progetto con target date imminente;
5. progetto attivo aggiornato di recente.

## Health derivato
- `blocked`: progetto esplicitamente bloccato;
- `overdue`: target date progetto superata e progetto non completato;
- `at_risk`: task/milestone scaduti o milestone molto vicina con lavoro incompleto;
- `on_track`: nessun segnale critico;
- `completed`: progetto completato/archiviato.
