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

Giro di rifinitura (polish) del 2 nov sera, dal verdetto QA — da riprovare sull'iPhone vero (SW r7). Tutto verificato con
tocchi veri (joystick, tasto grande, tasto laterale, schede) su 390x844 e 844x390; scenari e screenshot in tmp/polish/
(git-ignored). Gli aiuti usati sono scritti accanto a ogni punto.
- [x] (major) Gino: dopo la prima vendita la richiesta del giorno nascondeva "Vediamo cosa c'è" e di giorno non si poteva
  vendere. Ora la richiesta del giorno (e il grazie quando gliela consegni) finisce sempre con "Vediamo cosa c'è / A dopo!",
  per ogni negoziante (src/systems/dailies.js, quests.js). Verificato con lo scenario QA q12 da salvataggio nuovo, senza
  aiuti: 4 dialoghi su 4 aprono la pescheria, anche il 2° e il 3° che ripetono "Gino ha bisogno di 2 × Cavedano"
  (tmp/polish/q12, portrait IT; tmp/polish/q12-land-en, landscape EN).
- [x] Gli abitanti non si attraversano più: player e abitanti restano ad almeno 0.78 m tra i centri; spingendo contro di
  loro si scivola di lato, e se un abitante cammina addosso al player fermo lo sposta piano, mai nel muro o in mare
  (src/actors/player.js). Spingendo dritto su Tonio, Pina e Marta: 0.78-1.26 m, prima 0.24 m. Si parla a 0.78 m da Gino,
  0.96-1.04 m da Rosa e 0.80 m da Pina. Nel dialogo la camera mette i due personaggi uno accanto all'altro, non uno
  dietro l'altro, e dopo torna alla vista normale (src/core/camera.js). Prova in tmp/polish/npc-land, landscape IT
  (02-rosa-talk.png). Abitanti: 0 blocchi, 0 replan.
- [x] Nome della zona sul confine Bosco dei Pini/Cascata: c'è un'isteresi di 4 m più un tempo minimo (src/world/index.js),
  e lo stesso nome non torna prima di 40 s (src/ui/index.js). Percorso QA di 20 m: 1 nome contro 7; 40 s spinti contro
  la riva sul confine: 0 nomi. Entrando davvero in un'altra zona il nome compare (tmp/polish/zone, portrait IT;
  tmp/polish/zone-land-en; anche lo scenario QA q10).
- [x] Bocconcino per il gatto: nello Zaino il tasto dice "Dai a Biscotto / Give to Biscuit". Toccandolo lo Zaino si chiude,
  il player cammina fino al gatto, si china e glielo dà: amicizia +2, senza "Buon appetito". Il piatto se ne va solo se
  il gatto viene raggiunto. Da più di 10 m compare "Biscotto è troppo lontano: raggiungilo, poi daglielo dallo Zaino" e
  il piatto resta (src/ui/sheets/inventory.js, systems/cooking.js, systems/cat.js). Aiuti: il piatto messo nello Zaino e
  un teleport a 22 m per il caso "lontano" (tmp/polish/cat, portrait IT; tmp/polish/cat-land-en).
- [x] Gatto non ancora amico: il tasto non promette più "Accarezza". Dice "Saluta Biscotto / Say hi to Biscuit": il player
  si avvicina piano, si china e porge la mano, e il gatto annusa e si scosta ("…Portagli un pesce!"). Vicino alla
  Trattoria, quando il tasto grande è "Parla con Nonna Pina", il gatto compare sul tasto laterale e la carezza funziona
  (src/systems/interact.js; tmp/polish/cat/05-pina-cat-side.png).
- [x] Spiagge in pendenza dolce: in mare la profondità ammessa ora scende con la pendenza, e il player si ferma dove finisce
  la schiuma disegnata (src/world/colliders.js `wadeLimit`, stessa distanza dalla terra usata da water.js). Sulla costa
  ovest del Bosco dei Pini si ferma sul bordo della schiuma, non 1-2 m dentro il turchese
  (tmp/polish/shore-en/01-shore-forest-west.png). Ripetuti i 44 punti di costa di QA 8: profondità sempre ≤ 0.07 m, al
  massimo 0.45 m oltre la linea dell'acqua o dentro la fascia di schiuma sulle secche piatte, e lo stick arriva ancora a
  ogni riva (tmp/polish/coast). Le celle di mare basso non più calpestabili sono 111 (griglia da 1 m) su tutta la mappa.
- [x] "Adesso Bottega di Rosa è chiusa. Torna di giorno!" (accordo al femminile per tutti i negozi che chiudono), verificato
  di notte a tocchi (scenario QA q10, tmp/polish/q10).
- [x] Mappa: i nomi delle zone si spostano (sotto, sopra, a lato) per non stare sotto le icone, la freccia "Tu" o il
  segnaposto Obiettivo (src/ui/sheets/map.js). "Home Beach" e "Slow Harbor" si leggono interi (tmp/polish/map-en,
  tmp/polish/map-land-it): nessuna sovrapposizione misurata, né all'apertura, né con lo zoom, né dal borgo. Nota: in
  landscape, con la mappa centrata sul borgo, "Spiaggia di Casa" finisce un po' sopra il mare, sotto il segnaposto
  Obiettivo, perché vicino alla spiaggia non c'è un posto libero.
- [x] Panchina del faro: ora ha due posti. Ettore si siede su un capo e l'altro resta libero. Davanti al posto libero il tasto
  grande dice "Siediti" e Ettore va sul tasto laterale; ci si siede accanto a lui (0.84 m) e "Alzati" funziona. Un posto
  occupato da un abitante non viene più offerto (src/world/props/places.js, systems/interact.js; tmp/polish/bench-land-en).
- [x] sw.js CACHE r7; sw-assets.js rigenerato, nessun file aggiunto o tolto. Ho controllato che ogni file che l'app può
  caricare (import statici e dinamici, import map, icone del manifest) sia nella lista: nessuno manca
  (tmp/polish/sw-check.mjs).
Non provati qui (limiti headless): margini safe-area, audio e vibrazione, il foglio di condivisione iOS.

## Nuove funzioni richieste (giro successivo, dopo le correzioni)
- [ ] Più primi piani / momenti cinematografici brevi e cozy (camera che si avvicina e poi torna sempre alla vista normale): cattura del pesce, pesce raro/leggendario, prima volta che si fa qualcosa, cucina, carezza al gatto, tramonto seduti sul pontile.
- [ ] Dopo la cattura: il pescatore appoggia il pesce sulla stuoia accanto a sé (stuoia con il pescato visibile nel mondo, come nel video di riferimento).
- [ ] Pulire il pesce (azione + animazione dedicata), e in generale più azioni con animazioni proprie legate al pescato (sfilettare/preparare, mettere nel secchio, mostrarlo al gatto…).

## Feedback 3 nov (dalla versione r7 pubblicata)
- [ ] Bordi dell'acqua quasi geometrici: la riva/schiuma è diventata spigolosa (probabile effetto della regola "mare basso non calpestabile" del polish r7 o del disegno della schiuma) → riva morbida e naturale come prima.
- [ ] Prima si poteva entrare un po' in acqua immergendo le gambe: ripristinare il guado nell'acqua bassa (piedi/gambe sotto la superficie, schizzi, passo più lento), fermandosi solo dove l'acqua diventa profonda.
- [ ] Compenetrazioni: il personaggio (e gli NPC) attraversano la tenda di casa e altri oggetti; alzandosi da seduti sul pontile il personaggio sprofonda nelle assi.
- [ ] Sensazione di camminata più veloce: la velocità non è cambiata (2.6 m/s) ma la camera è più vicina in landscape → valutare con Luca (rallentare o riallontanare).
- [x] Joystick: la base resta ferma dove si è appoggiato il dito finché non lo si stacca (src/ui/controls.js).
- [ ] Distanza camera regolabile in Impostazioni (Vicina / Media / Lontana), default alla distanza della prima versione: così Luca sceglie da sé (dubbio sulla sensazione di velocità).
- [ ] Impronte sulla sabbia (e sabbia bagnata / fango) lasciate dal pescatore, dal gatto e dai paesani, che svaniscono piano piano (decal a dissolvenza, pool limitato per le prestazioni).
- [ ] Acqua ancora più realistica se possibile senza pesare sull'iPhone: increspature fini, riflessi del cielo e del sole, rifrazione del fondale, schiuma della riva morbida e irregolare, schizzi quando si guada.
- [ ] Trasparenza in base alla profondità: più ci si avvicina alla riva, più l'acqua è limpida e si vedono bene il fondale (sabbia, sassi, alghe, conchiglie) e i pesci e i granchi che nuotano nell'acqua bassa; al largo l'acqua torna blu profondo e il fondale sparisce.
- [ ] Delfini più godibili: passaggi più vicini alla riva e alla barca (sempre a distanza di sicurezza), e alla PRIMA volta che si vedono una scena cinematografica dedicata (camera che si sposta verso il branco, salti un po' rallentati con spruzzi controluce, piccola musica dedicata, poi ritorno alla vista normale; saltabile con un tocco e disattivabile con "Primi piani"). Voce nel diario "Avvistamenti" (delfini e altri animali rari) con giorno e luogo; dalle volte successive solo un breve primo piano ogni tanto.
- [ ] Estendere a TUTTI gli avvistamenti: ogni animale raro o momento speciale (delfini, cervi nel bosco all'alba, tartarughe al sole sull'isola, meduse luminose nella grotta di notte, prime lucciole, primo coniglio, gabbiano che ruba il pesce...) ha la sua breve scena dedicata la prima volta e una voce in "Avvistamenti" nel diario; gli animali comuni (granchi, farfalle, gabbiani) solo la voce nel diario, senza scena.


## STATO AL 3 NOV (pausa per tetto utilizzo 51%, si riprende la settimana del 9 nov)
Ramo di lavoro: `r2-wip` (NON pubblicato). Online resta `main` = r7 (giro correzioni).
Fatto nel ramo r2-wip, NON ancora pubblicato:
- [x] Primi piani: shot API sulla camera + regista `src/systems/cinematics.js` (catture, stuoia, pulizia, gatto, ricette, prima entrata nelle zone, tramonto seduti), saltabili, disattivabili in Impostazioni.
- [x] Stuoia (`src/actors/props/mat.js`) + 6 animazioni (srotola/arrotola, appoggia, pulisci, secchio, mostra al gatto) + posa fiera.
- [x] Flusso: Tieni → stuoia; Pulisci il pesce (filetto ×1.6 + nuove ricette); Secchio (Bottega, 30 monete) → dona all'acquario; Mostra a Biscotto; Salta durante le animazioni.
- [x] Joystick con base ferma.
- [~] Partita completa col dito: verticale IT 47/47 ok; orizzontale EN da rifare (vedi docs/RESUME-playtest.md).
Da fare alla ripresa, in ordine:
1. Finire la partita completa (orizzontale EN), poi collaudo indipendente e rifinitura del secondo giro (fasi QA/Polish del workflow `wf_1ecb37ad-176`, ripresa con resumeFromRunId).
2. Problemi noti del secondo giro: pesci piccoli poco visibili sulla stuoia; primo piano della cattura coperto dalla scheda in verticale (aprire la scheda ~1.5 s dopo); rotolo di corda sul pontile di casa sovrapposto alla stuoia.
3. Feedback 3 nov (sopra): riva morbida + guado, compenetrazioni (tenda, alzarsi dal pontile), distanza camera regolabile, impronte, acqua più realistica e limpida vicino alla riva, delfini + avvistamenti con scene dedicate.
4. Pubblicare tutto insieme su main (bump SW, oggi r8 nel ramo) dopo la verifica.
- [ ] Dal video di riferimento (vedi docs/REFERENCE.md): anello di progresso sopra il cappello durante carica/recupero, scintille del sole sul mare aperto, linee di schiuma delle onde sulla battigia, fascia di sabbia bagnata più scura, passerelle di corda mezze rotte sul fiume.
- [ ] Dal ricontrollo del video: "Raccogli" (Pack up) con cesta-zaino visibile sulla schiena e stuoia arrotolata portata addosso; prendere/riporre la canna come azione con suggerimenti contestuali; etichetta dell'ora che cambia (Mezzogiorno → Pomeriggio); scaletta in acqua sulla testata del pontile; ombre delle palme sull'acqua bassa; tronchi nel fiume; torrente del bosco più scuro con rapide.
- [ ] Dal controllo a 30 fps: interfaccia che si nasconde da sola mentre si esplora e ricompare quando serve; cartellini agganciati agli oggetti vicini; nel "Raccogli" i pesci volano uno alla volta nella cesta e la stuoia si arrotola dal lato lontano verso il pescatore; movimenti di camera continui (gru dal primo piano alla vista larga, discesa lungo la cascata, giro intorno al capanno).
