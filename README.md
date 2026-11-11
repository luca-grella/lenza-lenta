# Lenza Lenta

Un gioco di pesca 3D rilassante per il browser, installabile su iPhone come app (PWA).

Si gioca su https://luca-grella.github.io/lenza-lenta/ . Lo stesso gioco resta anche su
https://luca-grella.github.io/lenza-lenta-v2/ (copia sempre aggiornata, per chi l'ha installato da lì e non vuole
perdere i salvataggi). La prima versione è in `archivio/v1/`, spenta.
Sei appena arrivato a Porto Lento con la vecchia canna di bambù del nonno e una sua lettera:
pesca, conosci gli abitanti del villaggio, fai amicizia con il gatto, ripara la barca, rema fino
agli isolotti, esplora la grotta marina con la lanterna e riaccendi il faro. Alla fine ti aspettano
cinque pesci leggendari, ognuno con il suo luogo, la sua ora, il suo tempo e la sua esca.

Non ci sono timer né fallimenti: il tempo scorre piano, i negozi chiudono la sera e il gioco
salva da solo.

## Come si gioca

- **Pescare**: guarda verso l'acqua, tieni premuto il pulsante azione per caricare il lancio e
  rilascia. Quando il galleggiante affonda ("!") tocca subito per ferrare, poi tieni premuto per
  recuperare il filo e rilascia quando la tensione sale troppo (o quando il pesce scappa o salta).
- **Cesto**: i pesci si vendono in Pescheria, si regalano all'acquario, si cucinano o si danno al gatto.
- **Esche**: ogni esca attira pesci diversi; alcuni pesci escono solo di notte, con la pioggia o
  in un posto preciso. Il diario tiene traccia di tutto quello che hai pescato.
- **Missioni**: l'obiettivo attuale è sempre in alto a sinistra. Parla con gli abitanti per
  andare avanti e per le richieste del giorno.
- **Barca**: dopo averla riparata, avvicinati al pontile e sali. Rema con la levetta, guarda
  verso il mare aperto per pescare, guarda verso la riva per scendere.
- **Dormire**: il letto di casa porta al mattino dopo (e salva).

## Comandi

| | Telefono | Tastiera | Gamepad |
|---|---|---|---|
| Muoversi | levetta a sinistra | WASD / frecce (Shift = piano) | levetta sinistra |
| Azione (lancia, ferra, recupera, parla) | pulsante grande a destra | Spazio / Invio | A |
| Interagisci | pulsante azione | E | X |
| Cambia esca | pulsante esca | B | Y |
| Diario / Mappa / Zaino / Missioni | menu | J / M / I / Q | Back = mappa |
| Pausa e impostazioni | menu in alto a destra | Esc | Start |

La rotella del mouse avvicina o allontana la camera. Nelle impostazioni si cambiano lingua
(italiano / inglese), volume di musica ed effetti, vibrazione e qualità grafica.

## Avviarlo

Non serve nessuna compilazione: basta un server statico nella cartella del progetto, per esempio

```
node tools/serve.mjs 8080
```

e poi aprire `http://localhost:8080/`. Su iPhone: Safari → Condividi → "Aggiungi alla schermata
Home" per averlo a schermo intero e giocabile offline.

Per sviluppatori: `?debug` attiva gli strumenti di test (`window.__lenza`), `?quality=low|mid|high`
forza la qualità grafica. Le pagine in `sandbox/` sono banchi di prova delle singole parti.
La struttura del codice è descritta in `docs/ARCHITECTURE.md`.

## Crediti

Fatto interamente in codice: modelli, scheletri e animazioni, terreno, acqua, cielo, piante,
pesci, icone, musica ed effetti sonori sono generati proceduralmente in JavaScript (three.js e
WebAudio). Nessun modello, texture, font o file audio scaricato.

Unica libreria esterna: [three.js](https://threejs.org) (licenza MIT), inclusa in `vendor/`.

## Publishing (password)

Since 11 Nov 2026 the game is private while in development: GitHub Pages is published by `.github/workflows/pages.yml`,
which copies the repo and encrypts `index.html` with StatiCrypt (`tools/encrypt_for_pages.py`), using the shared password
of the private pages of luca-grella.github.io (repo secret `STATICRYPT_PASSWORD`). The repo keeps the plain `index.html`,
so local testing does not change.
