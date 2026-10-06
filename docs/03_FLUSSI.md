# 03 — Flussi principali

## Flusso A — Nuovo progetto
1. Tap `+`.
2. `Nuovo progetto`.
3. Inserimento minimo: titolo, stato, priorità, target date opzionale.
4. Template opzionale.
5. Salva.
6. Apertura dettaglio progetto.
7. CTA suggerita: `Aggiungi prima milestone` oppure `Aggiungi prima azione`.

Obiettivo: creare un progetto in pochi secondi senza obbligare a compilare tutto.

## Flusso B — Nuovo task globale
1. Tap `+`.
2. `Nuovo task`.
3. Selezione progetto obbligatoria.
4. Titolo.
5. Priorità/scadenza opzionali.
6. Salva.

Il task non può esistere senza progetto: PROJECTS non diventa un'app generica di reminder.

## Flusso C — Lavoro quotidiano
1. Apri `Oggi`.
2. Vedi prima gli scaduti, poi quelli di oggi.
3. Apri o completa il task.
4. Se il task completato sblocca dipendenze, la UI aggiorna immediatamente i task diventati actionable.
5. Il progresso di progetto e milestone viene ricalcolato.
6. Gli eventi/summary ALEX HUB vengono aggiornati localmente.

## Flusso D — Dipendenze
1. Nel task, sezione `Dipendenze`.
2. Selezione di uno o più task dello stesso progetto.
3. Validazione anti-ciclo.
4. Se esiste una dipendenza incompleta, il task mostra `Bloccato da …`.
5. Al completamento dell'ultimo prerequisito, il task diventa automaticamente disponibile.

## Flusso E — Progetto bloccato
1. Nel dettaglio progetto: `Segna come bloccato`.
2. Inserimento motivo opzionale ma consigliato.
3. Il progetto riceve health `blocked`.
4. Compare in Home, Oggi e Today Contract.
5. `Sblocca progetto` rimuove il blocco e registra l'evento in timeline.

## Flusso F — Milestone
1. Crea milestone con data target.
2. Collega task esistenti o creane di nuovi.
3. Il progresso milestone si aggiorna dai task.
4. Se la data viene superata e non è completata, appare come scaduta.
5. Può essere completata manualmente; se ci sono task incompleti viene mostrato un warning non bloccante.

## Flusso G — Completamento progetto
1. Cambia stato in `completed`.
2. Se esistono task aperti, mostra riepilogo e conferma.
3. `completedAt` viene valorizzato.
4. Progress diventa 100% solo se manuale oppure per regola di stato quando non esistono task; con task esistenti il sistema può mostrare anche il dato reale storico.
5. In seguito l'utente può archiviare il progetto.

## Flusso H — Archivio / ripristino
1. Progetto -> `Archivia`.
2. Stato `archived`, `archivedAt` valorizzato.
3. Sparisce dalle liste operative.
4. Rimane ricercabile in Archivio.
5. `Ripristina` richiede di scegliere lo stato di ritorno.

## Flusso I — Template
1. Apri Template.
2. Scegli modello.
3. Anteprima di milestone/task.
4. Scegli data di partenza.
5. Gli `offsetDays` generano le date relative.
6. Crea progetto.

## Flusso J — Export
1. Impostazioni -> Esporta dati.
2. Generazione JSON completo.
3. Condivisione tramite foglio di condivisione/browser download.
4. Il file include moduleId/appVersion/schemaVersion/exportedAt/settings/data/metadata.

## Flusso K — Import
1. Selezione file JSON.
2. Validazione `moduleId`.
3. Validazione `schemaVersion`.
4. Eventuale migrazione da schema precedente supportato.
5. Anteprima conteggi.
6. Modalità:
   - `Merge`;
   - `Sostituisci dati locali`.
7. In caso di ID duplicato, confronto `updatedAt` e riepilogo conflitti.
8. Conferma finale.
9. Backup automatico locale pre-import opzionale nella versione completa.

## Flusso L — Ricerca
La ricerca attraversa:
- titolo/descrizione progetto;
- task;
- milestone;
- note;
- riferimenti;
- tag.

I risultati sono raggruppati per progetto per preservare il contesto.
