# Feedback di Luca dal primo test su iPhone (1 nov 2026)

Risolti:
- [x] Tocchi bloccati / joystick morto: livelli UI invisibili a tutto schermo intercettavano i tocchi (css/base.css, `:where()`), SW r4.
- [x] Primo piano della camera che non tornava alla vista normale dopo i dialoghi (src/systems/quests.js: niente più setMode('dialog') prima del dialogo + rete di sicurezza basata su ctx.ui.isOpen()), SW r5.

Da fare (dopo il reset dell'utilizzo) — giro di correzioni del 2 nov, da riprovare sull'iPhone vero (SW r6):
- [x] (2 nov, verificato con tocchi veri, portrait e landscape: tmp/playtest/a3, al) Non si riesce a salire sul pontile del porto (village dock): groundY/walkable delle passerelle e del raccordo spiaggia-pontile.
- [x] (2 nov: tutti i negozi e i 6 abitanti raggiunti a piedi e all'asciutto, di giorno e al tramonto: tmp/playtest/b, bl, d, f2, fl2) Alcune case/negozi non raggiungibili: si parla con le persone stando in acqua → posizioni NPC/interactables e percorsi a terra verso ogni porta.
- [x] (2 nov: giornata intera senza blocchi nel test di Actors, tmp/actors/npc-day.md; nei giri di gioco nessun abitante incastrato) Alcuni personaggi si incastrano e sembrano buggati (routine NPC tra POI: resolveMove, punti di sosta irraggiungibili, animazioni che non tornano a idle).
- [x] (2 nov: test di World tmp/world/sitw*.out, deck-solids; nessun bagno nei giri di gioco) Il player non si ferma sui bordi (entra in acqua o cade dai bordi) e a volte attraversa oggetti: collider mancanti su edifici/props, bordo acqua non bloccante.
- [x] (2 nov: titolo della zona mai sopra la card obiettivo o i toast in tutti i giri; nomi delle zone sulla mappa non più coperti dai segnaposto) Scritte che si sovrappongono: banner del nome del luogo (zone:enter) sopra la card missione/obiettivo; verificare anche toast e altri banner.
- [x] (tools/play.mjs + tmp/playtest/) Test con tocchi veri (Input.dispatchTouchEvent) di avvio, dialoghi e joystick: i test automatici usavano la tastiera.
- [x] (Actors, tmp/actors/cat*.out) Il gatto ruota la testa in modo innaturale (rotazione testa/look-at senza limiti).
- [x] (2 nov: il player cammina fino al gatto, carezza a 0.97 m: tmp/playtest/b, bl) Accarezzare il gatto a volte da lontano: il player deve avvicinarsi/fermarsi accanto al gatto prima dell'animazione `pet`.
- [x] (2 nov: Siediti → seduto davvero → Alzati, tmp/playtest/b, bl) Panchina del falò: compare "Siediti" ma non si siede davvero (sitAt/POI bench_* o animazione sit_down).
- [x] (2 nov: seduto sul bordo del pontile di casa, 3 pesci presi da seduto, Alzati: tmp/playtest/a3, al) Bordi dei pontili: non si siede per pescare (sit_idle + pesca da seduto sul bordo).
- [x] (2 nov: tutti i pannelli e le schede del menu in IT e EN, nessuna { } o chiave grezza: tmp/playtest/c, cl) Testi con segnaposto non sostituiti tipo "{n}" in menu e testi: scansione di tutte le t() con variabili mancanti.
- [x] (2 nov: "Bonus quando lo mangi … Dura 4 ore di gioco (circa 4 min reali)": tmp/playtest/b/07-cook-panel.png) Trattoria/Nonna Pina: "4 ore" sulle ricette è la durata del bonus (ore di gioco = minuti reali) ma sembra un tempo di cottura → riscrivere: "Bonus: … per 4 ore di gioco (~4 min)".
- [x] (2 nov: esporta come codice e reimporta, in inglese: tmp/playtest/c, cl; import da file .json e foglio di condivisione iOS NON provati) Salvataggi: eliminando la PWA su iPhone si perde tutto → Esporta/Importa salvataggio (file + codice da copiare) in Impostazioni, `navigator.storage.persist()`, eventuale backup cloud in futuro.

## Nuove funzioni richieste (giro successivo, dopo le correzioni)
- [ ] Più primi piani / momenti cinematografici brevi e cozy (camera che si avvicina e poi torna sempre alla vista normale): cattura del pesce, pesce raro/leggendario, prima volta che si fa qualcosa, cucina, carezza al gatto, tramonto seduti sul pontile.
- [ ] Dopo la cattura: il pescatore appoggia il pesce sulla stuoia accanto a sé (stuoia con il pescato visibile nel mondo, come nel video di riferimento).
- [ ] Pulire il pesce (azione + animazione dedicata), e in generale più azioni con animazioni proprie legate al pescato (sfilettare/preparare, mettere nel secchio, mostrarlo al gatto…).
