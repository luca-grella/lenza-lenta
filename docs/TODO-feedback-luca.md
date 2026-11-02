# Feedback di Luca dal primo test su iPhone (1 nov 2026)

Risolti:
- [x] Tocchi bloccati / joystick morto: livelli UI invisibili a tutto schermo intercettavano i tocchi (css/base.css, `:where()`), SW r4.
- [x] Primo piano della camera che non tornava alla vista normale dopo i dialoghi (src/systems/quests.js: niente più setMode('dialog') prima del dialogo + rete di sicurezza basata su ctx.ui.isOpen()), SW r5.

Da fare (dopo il reset dell'utilizzo):
- [ ] Non si riesce a salire sul pontile del porto (village dock): groundY/walkable delle passerelle e del raccordo spiaggia-pontile.
- [ ] Alcune case/negozi non raggiungibili: si parla con le persone stando in acqua → posizioni NPC/interactables e percorsi a terra verso ogni porta.
- [ ] Alcuni personaggi si incastrano e sembrano buggati (routine NPC tra POI: resolveMove, punti di sosta irraggiungibili, animazioni che non tornano a idle).
- [ ] Il player non si ferma sui bordi (entra in acqua o cade dai bordi) e a volte attraversa oggetti: collider mancanti su edifici/props, bordo acqua non bloccante.
- [ ] Scritte che si sovrappongono: banner del nome del luogo (zone:enter) sopra la card missione/obiettivo; verificare anche toast e altri banner.
- [ ] Test con tocchi veri (Input.dispatchTouchEvent) di avvio, dialoghi e joystick: i test automatici usavano la tastiera.
- [ ] Il gatto ruota la testa in modo innaturale (rotazione testa/look-at senza limiti).
- [ ] Accarezzare il gatto a volte da lontano: il player deve avvicinarsi/fermarsi accanto al gatto prima dell'animazione `pet`.
- [ ] Panchina del falò: compare "Siediti" ma non si siede davvero (sitAt/POI bench_* o animazione sit_down).
- [ ] Bordi dei pontili: non si siede per pescare (sit_idle + pesca da seduto sul bordo).
- [ ] Testi con segnaposto non sostituiti tipo "{n}" in menu e testi: scansione di tutte le t() con variabili mancanti.
- [ ] Trattoria/Nonna Pina: "4 ore" sulle ricette è la durata del bonus (ore di gioco = minuti reali) ma sembra un tempo di cottura → riscrivere: "Bonus: … per 4 ore di gioco (~4 min)".
- [ ] Salvataggi: eliminando la PWA su iPhone si perde tutto → Esporta/Importa salvataggio (file + codice da copiare) in Impostazioni, `navigator.storage.persist()`, eventuale backup cloud in futuro.

## Nuove funzioni richieste (giro successivo, dopo le correzioni)
- [ ] Più primi piani / momenti cinematografici brevi e cozy (camera che si avvicina e poi torna sempre alla vista normale): cattura del pesce, pesce raro/leggendario, prima volta che si fa qualcosa, cucina, carezza al gatto, tramonto seduti sul pontile.
- [ ] Dopo la cattura: il pescatore appoggia il pesce sulla stuoia accanto a sé (stuoia con il pescato visibile nel mondo, come nel video di riferimento).
- [ ] Pulire il pesce (azione + animazione dedicata), e in generale più azioni con animazioni proprie legate al pescato (sfilettare/preparare, mettere nel secchio, mostrarlo al gatto…).
