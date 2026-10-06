# TEST REPORT — PROJECTS v1.0.1

## Motivo della release
La v1.0.0 consegnata risultava incompleta: `index.html` richiamava risorse che non erano incluse nello ZIP. La v1.0.1 ricostruisce il pacchetto completo e aggiunge un controllo esplicito sulle risorse richieste.

## Controlli richiesti prima del packaging
- Sintassi di tutti i moduli JavaScript.
- Tutte le risorse elencate nel Service Worker devono esistere.
- Tutti gli asset referenziati da `index.html` devono esistere.
- Smoke test template.
- Smoke test backup/export/import.
- Smoke test merge/replace IndexedDB.
- Smoke test Integration Layer.
- Serving HTTP locale di ogni risorsa della shell.
- Integrità ZIP.

## Test dispositivo
La prova definitiva PWA va eseguita su Safari/iPhone dopo il deploy su HTTPS (GitHub Pages).
