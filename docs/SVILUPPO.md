# Sviluppo: tecnologie, struttura, prove

Per chi vuole leggere o modificare il codice. Regole del progetto e pull request: [CONTRIBUTING.md](../.github/CONTRIBUTING.md).
Installare una copia: [INSTALLAZIONE.md](INSTALLAZIONE.md). App Android: [ANDROID.md](ANDROID.md).

## Tecnologie

- **HTML, CSS e JavaScript** (moduli ES), senza framework né bundler: i file del repository sono il sito.
- **Firebase Realtime Database** con accesso anonimo (piano gratuito Spark); la sicurezza sta nelle regole (`firebase/database.rules.json`).
- **GitHub Pages** per il sito, **GitHub Actions** per le prove e per l'APK.
- **Capacitor 8** per l'app Android (anche Android TV).
- **Service worker** per l'uso con la rete instabile e l'installazione come app.
- Librerie incluse nel repository (nessun CDN): Firebase JS SDK, DiceBear (personaggi), qrcode-generator, jsQR.
- Facoltativo: un **Cloudflare Worker** gratuito per BoardGameGeek (`bgg-proxy/`).
- Prove: Node (`node:test`, targaryen per le regole) e Playwright con Chromium.

## Struttura del progetto

Nella radice restano solo le pagine del sito (i loro indirizzi sono nei QR e nei link già condivisi) e i file che
GitHub Pages, il service worker e l'app devono trovare lì.

```
index.html                 home: profilo, entra in una serata, armadi, serate, gruppi, app, community, dati
host.html                  la TV (regia): lobby, votazione, reveal, classifica, premiazione
play.html                  il telefono durante la serata
armadio.html, ludoteca.html  l'armadio dei giochi (computer e telefono)
resoconto.html, scarica.html, test.html, go.html  resoconto, download dell'app, verifica di Firebase, collegamenti stabili
sw.js, manifest.webmanifest  service worker (deve stare nella radice) e installazione come app
version.json               versione pubblicata e novità (letta dagli aggiornamenti dell'app: indirizzo fisso)
README.md, CHANGELOG.md, LICENSE, .nojekyll
config/links.json          link ufficiali (unica fonte, aggiornabile senza nuove versioni)
firebase/database.rules.json  regole di sicurezza da incollare in Firebase
css/style.css, css/ui.css  stile delle schermate e sistema di design
js/                        moduli (elenco qui sotto); js/lang/ dizionari it/en divisi per area
android-app/               app Android (Capacitor): configurazione, icone, banner per Android TV, firma
bgg-proxy/                 proxy BoardGameGeek per Cloudflare Workers (facoltativo)
tests/                     controlli statici, regole, prove unitarie, link, prove nel browser (tests/e2e)
docs/                      GUIDA, INSTALLAZIONE, ANDROID, SVILUPPO, DATI, LINKS, PRIVACY (cose da fare: TODO.md nella radice)
.github/                   workflow, CONTRIBUTING.md, SECURITY.md, moduli per le segnalazioni, Sponsor (Ko-fi)
vendor/, assets/           librerie incluse; icone, marchio, font
```

### I moduli in `js/`

```
config.js        configurazione Firebase (da compilare)          services.js     indirizzi dei servizi facoltativi (BGG, link)
site.js          indirizzi pubblici dell'app Android (workflow)   version.js      numero di versione
i18n.js          lingue: t('chiave'), plurali, date, numeri        lang/           dizionari it/en per area
links-core.js    link ufficiali: nucleo riutilizzabile            links-policy.js domini ammessi per i link
links.js         link ufficiali: adattatore web e interfaccia     go.js           collegamenti stabili (go.html)
fb.js            collegamento a Firebase e messaggi di errore     util.js         funzioni condivise, icone, foto, registro errori
home.js          home personale                                   person.js       profilo personale su più dispositivi
host.js          TV                                               play.js         telefono
stats.js         medie, classifiche, premi, Consigliere, anno     share.js        immagini da condividere
tv-extras.js     TV: tavolo, timer, quiz, stagioni, figurine     phone-extras.js telefono: segnapunti, squadre, quiz
prep.js, tv-prep.js, phone-prep.js   pre-partita                  extras.js       squadre, quiz, .ics, CSV di BGG
armadio.js, collection.js, library.js   armadio dei giochi        favs.js         giochi preferiti del profilo
bgg.js           BoardGameGeek (tramite il proxy)                 manuals.js      manuali: link, file locali, ricerca
nightclock.js    modello di pausa e timer condiviso (puro)        sharedtimer.js  timer condiviso: TV, co-host, telefoni
ambient.js       schermo ambiente della TV                        spatialnav.js   telecomando / D-pad (Android TV)
portability.js   formato di esportazione e importazione guidata   datacenter.js   dati, privacy, diagnostica
customsfx.js     soundboard personalizzata (file solo sulla TV)   atmosound.js    suono delle atmosfere
templates.js     modelli di serata, riparti da una serata        nights.js       eliminare una serata (solo il creatore)
barcode.js       codice a barre: lettura, controllo, abbinamenti
insights.js      analisi dello storico (puro): tendenze, sessioni, stagioni, abitudini, gusti, collezione, export
traditions.js    regole della casa, accessori stagionali, data della Pasqua (puro)
tv-memory.js     TV: schede Analisi e Tradizioni, premi del gruppo
resoconto.js, report.js, pdfdoc.js   resoconto, stampa e PDF vero (app Android)
updates.js       aggiornamenti e download dell'app                native.js       app Android: salvataggi, apertura file, Indietro
sounds.js, sfx.js, music.js, atmo.js, fx.js   suoni, musica, atmosfere, effetti
commentary.js, facts.js   commentatore, curiosità e ticker        cards.js, recap-video.js  figurine, video riassunto
vault.js, safe.js, stale.js, lite.js   copie locali, Safe Mode, file vecchi, modalità leggera
avatars.js       personaggi DiceBear                              tour.js         tutorial della TV
selftest.js      tavolo di verifica (test.html)                   scarica.js      pagina di download
```

### Stato condiviso della serata (Firebase)

- `rooms/<codice>/state`: lo scrive **solo la TV** (fase, gioco, pausa con `paused`, `pausedAt`).
- `rooms/<codice>/timer`: timer condiviso; lo scrivono la TV e i co-host. Niente scritture al secondo: si salvano
  solo l'istante di fine (`endsAt`) o il tempo rimasto in pausa, con un numero di revisione `rev` che deve crescere
  di 1 (le regole rifiutano le scritture vecchie). Ogni schermo calcola il tempo da solo, corretto con l'orologio
  del server; la scadenza la "suona" una volta sola ciascuno (chiave `expiryKey`).
- `rooms/<codice>/meta`: `ambient` (schermo ambiente), `publicTv` (modalità pubblico), `customSfx` (solo nomi e icone:
  i file audio restano sulla TV), `atmoLevel`, `atmoSound`, `creatorUid`/`creatorPid` (chi ha creato la serata: non si
  cambiano; servono alle regole per lasciarla eliminare solo a lui).
- `rooms/<codice>/players/<uid>/guest`: ospite (vota, ma nel riassunto del gruppo resta solo il numero degli ospiti).
- `groups/<gruppo>/templates`: modelli di serata (scrivono proprietario e admin; solo impostazioni, mai codici o uid).
- `people/<id>/favs`: preferiti del profilo; `pub/<token>`: catalogo pubblico dell'armadio (solo i campi scelti).

Formato dei file di esportazione e regole dell'importazione: [DATI.md](DATI.md).

### Eliminare una serata (1.11, `js/nights.js`)

- **Chi è il creatore:** alla creazione della stanza la TV scrive `meta/creatorUid` (il suo uid anonimo) e, se ha un
  profilo personale, `meta/creatorPid`. Le regole permettono di scriverli solo alla creazione e solo con i propri valori,
  e poi non si cambiano più (passare la regia a un altro non trasferisce la proprietà). Il riassunto nel gruppo li copia.
- **Chi può eliminare:** il creatore, o un altro dispositivo collegato allo stesso profilo personale
  (`people/<pid>/uids/<uid>`). Le stanze di prima della 1.11 (senza creatore) restano della TV che le guida (`hostUid`).
  Gli admin del gruppo e gli altri master no: la regola è su `rooms/$code` (cancellazione) e su `groups/$gid/nights`,
  `photos` e `rooms`, quindi vale anche per chi scrive direttamente nel database.
- **Cosa si cancella:** stanza, riassunto nel gruppo, album della serata, voce nell'elenco delle stanze, in **un solo
  aggiornamento multiplo** (tutto o niente); poi codice regia e serata "in corso" se puntava lì, e la copia locale.
  Classifica di sempre, stagioni, statistiche e Il vostro anno si ricalcolano dai riassunti: nessun dato orfano.
- **Niente cancellazione logica:** un riassunto nascosto ma ancora contato renderebbe incoerenti le statistiche. Si
  recupera da un backup del gruppo (Strumenti › Importa backup del gruppo).

### Identificare un gioco: BoardGameGeek e codice a barre (1.11, `js/barcode.js`)

1. **Lettura:** `BarcodeDetector` del browser (EAN-13, EAN-8, UPC-A; i rari UPC-E compressi possono non passare il controllo: si scrive il codice UPC-A) dove esiste (Chrome, Android); altrove le cifre
   si scrivono a mano. Si accettano solo codici con la cifra di controllo giusta; UPC-A ed EAN-13 con lo 0 sono lo stesso.
2. **Nell'armadio:** se un gioco ha già quel codice (`ean`), lo si apre invece di crearne un doppione.
3. **Su questo dispositivo:** la cache `gnr_ean_map` ricorda codice → scheda di BGG già confermata (anche da un altro
   armadio): la scheda si apre direttamente, ma va sempre confermata.
4. **Altrimenti:** l'API XML2 di BoardGameGeek cerca solo per nome (non per codice a barre), quindi si cerca per nome e si
   sceglie l'edizione giusta; il confronto campo per campo non sovrascrive niente senza spunta. Confermata la scheda,
   l'abbinamento si ricorda (punto 3).
5. **Senza BGG o senza risultati:** il codice resta nella scheda e si compila a mano.

Un database esterno codice → BGG non è integrato: servizio, costi e termini d'uso sono da verificare (vedi TODO.md, limiti noti).

### Statistiche: quanto sono affidabili (1.12, `js/insights.js`)

Ogni numero dell'analisi porta con sé quanti voti lo sostengono (`confidence(n)`):

| Etichetta | Voti | Uso |
|---|---|---|
| pochi dati | meno di 3 (`CONF_FEW`) | il valore si mostra segnato; non entra in "più amato", "media 8 e oltre", gusti |
| dati discreti | 3–7 | normale |
| dati solidi | 8 o più (`CONF_SOLID`) | normale |

Non è una misura statistica (niente intervalli di confidenza): è il conteggio dei dati detto in parole, perché in un
gruppo di amici i numeri sono piccoli. Le **tendenze** richiedono almeno 4 serate con lo stesso gioco, almeno 3 voti
nella prima e nella seconda metà e una differenza di almeno 1 punto; il **confronto fra stagioni** avvisa se una ha
più del doppio delle serate dell'altra. Tutti i calcoli partono dai riassunti delle serate (`groups/<id>/nights`): non
c'è nessuna cache da tenere aggiornata, e cancellare o correggere una serata cambia subito le statistiche.

Il **racconto della serata** (`nightStory`) restituisce chiavi di testo e parametri (`story.*`), mai frasi
inventate: ogni frase corrisponde a un dato del riassunto (gioco più amato, consenso sotto il 60%, partita più lunga di
45 minuti, vittorie, MVP, un commento se scelto).

## Lingue

GameNight Show parla **italiano** e **inglese**. La lingua si sceglie in **Impostazioni › Lingua** e vale solo per
quel dispositivo: TV e telefoni possono usare lingue diverse nella stessa serata. Alla prima apertura si usa la
lingua del dispositivo, con l'italiano come riserva.

- I testi stanno in `js/lang/it.js` e `js/lang/en.js` più un file per area (`it-tv.js`, `en-tv.js`, `it-arm.js`…),
  con le stesse chiavi; `js/i18n.js` li usa (`t('chiave', { parametri })`, plurali, date e numeri nella lingua scelta).
- `tests/check.mjs` blocca il caricamento se una traduzione manca, se i `{parametri}` non coincidono, se una chiave
  usata non esiste o è definita due volte; `tests/i18n-scan.mjs` trova i testi italiani rimasti scritti nel codice
  (deve dare zero sui moduli dell'elenco `I18N_DONE`).
- I dati salvati nel database restano neutri (codici, non testi tradotti): nomi di giochi, giocatori e note non si
  traducono. Eccezione nota: le domande del quiz sono scritte nella lingua della TV.
- Le novità di `version.json` hanno due elenchi: `notes` (italiano) e `notesEn` (inglese).

## Prova in locale

I moduli JavaScript non funzionano aprendo i file con doppio clic: serve un piccolo server. Dalla cartella del progetto:

```
python3 -m http.server 8000
```

Poi apri `http://localhost:8000/host.html`. Per collegare i telefoni dalla stessa wifi, sulla TV usa l'indirizzo IP
del computer (es. `http://192.168.1.20:8000/host.html`), così anche il QR punta lì; in questo caso aggiungi
quell'IP anche tra i **Domini autorizzati** di Firebase.

## Prove automatiche

[`tests/README.md`](../tests/README.md) spiega tutto. In breve:

```
cd tests && npm install && npm test     # file, versioni, traduzioni, link, ESLint, regole, prove unitarie
python3 tests/e2e/run.py                # il sito vero in Chromium, con un finto Firebase
node --test bgg-proxy/test/worker.test.mjs
```

GitHub le esegue a ogni caricamento (workflow **Verifica**); le stesse verifiche statiche bloccano anche la
pubblicazione dell'APK. Le cose che servono un dispositivo vero (APK, Android TV, fotocamera, audio) sono
nell'elenco delle verifiche a mano: [TODO.md](../TODO.md).

## Identità e sessioni (2.0)

Quattro concetti separati, mai dedotti dal nome visualizzato:

| Concetto | Dove sta | Chi lo decide |
|---|---|---|
| **Identità permanente** | `people/<pid>` (profilo) + `accounts/<uid>` = { pid, key } se c'è un account | la persona (Google, email o solo il dispositivo) |
| **Sessione giocatore** | app Firebase predefinita (`fb.js`, `useSession('player')`); anonima o con account | il dispositivo |
| **Sessione regia** | app Firebase con nome `gn-regia` (host.html, resoconto con `&s=regia`): uid diverso anche sullo stesso dispositivo | la TV / il telefono regia |
| **Ruolo nella stanza** | `rooms/<code>/meta/hostUid`, `cohosts/<uid>`, `players/<uid>` | le regole del database |

- Chiudere il browser o l'app **non** è lasciare la stanza: `players/<uid>` resta; `away` lo mette la TV quando la presenza manca, "Esci" è esplicito. Espulsione = `meta/banned`.
- Cambio di uid durante una serata (accesso a un account già esistente): `account.js` lascia un gettone in `rooms/<code>/handover/<uid vecchio>`; il nuovo uid manda una richiesta con il gettone o con il `pid` verificato e la TV sposta il posto da sola (`migratePlayer`). Mai unire per nome.
- Account: collegare Google/email a una sessione anonima **mantiene** l'uid; entrare in un account esistente **cambia** uid (lo stesso su tutti i dispositivi). Le regole permettono di scrivere `accounts/<uid>` solo a sessioni non anonime e solo con la chiave vera del profilo.
- Link dall'esterno: `gamenight://open?to=<pagina>` (Android, `native.js`), accetta solo pagine relative del sito.
- Prova end-to-end: `tests/e2e/identity20.py` (rientro, QR vecchi, due dispositivi, account, regia separata, passaggio di identità).

## Voti dopo la votazione (2.0, `js/tv-votes.js`)

La regia apre una finestra `rooms/<code>/late/<gioco>/<uid>` = { at, edit? }. Senza `edit` il giocatore che non aveva votato vota una volta (`late: true`); con `edit` cambia il proprio voto (`editedAt`), mai un secondo voto. Le regole lo garantiscono. Ogni passo finisce in `rooms/<code>/votelog` (righe non modificabili). Medie, classifica e riassunto del gruppo si ricalcolano dai voti (la TV risalva il riassunto).

## Consigli (2.0, `js/tips.js`)

Livello per dispositivo (tutti / pochi / nessuno), tetto di volte per consiglio, chiusura per sempre (✕), categorie spegnibili (voto, profilo, app, consigliere), uno per schermata in ordine di priorità (`Tips.pick`). Solo `localStorage`.

## Nomi dei file esportati (2.0, `util.js › exportName`)

`GameNight_<Gruppo>_<AAAA-MM-GG della serata>_<Tipo>[_<dettaglio>][_<n>].<ext>`: accenti tolti, caratteri vietati sostituiti, parti accorciate, un contatore per nome su questo dispositivo così non si sovrascrive niente.

## Regia dello show (2.1, `js/show.js` + `js/tv-show.js`)

Regole pure in `show.js` (provate in `tests/show.test.mjs`), pannello e applicazione in `tv-show.js`.
Preferenze di questa TV in localStorage (scene, volumi, vista da lontano, profilo, pacchetti); impostazioni della
serata nella stanza (`meta/chaosOff`, `meta/chaosWheel`, `meta/votingByMode`); tema nel gruppo
(`identity/theme`, validato dalle regole). `host.js › applyScene()` applica a ogni aggiornamento (e ogni 1,5 s per
i pannelli che non cambiano la stanza) la scala degli effetti (`fx.js › setFxScale`) e l'abbassamento della musica
(`sounds.js › duck(on, motivo)`, più motivi insieme). Le domande per modalità si copiano nel gioco al voto
(`games/<id>/voting`) e si leggono con `gameVoting(game, meta)` su TV e telefono.

## Altri moduli della 2.1

| Modulo | Cosa fa |
|---|---|
| `night-fix.js` | correzione del riassunto chiuso (creatore), cronologia `fixes` |
| `history-check.js` | controllo dello storico del gruppo e confronto del Consigliere (funzioni pure) |
| `challenge.js` | sfide fra gruppi: aggregati in `challenges/<codice>/<gruppo>` |
| `next-board.js` | bacheca e suggerimenti della prossima serata |
| `reminders.js` | promemoria (LocalNotifications nell'app, avviso nel browser) |
| `notices.js` | centro avvisi della home (solo localStorage) |
| `discord.js` | testo per Discord e invio al webhook (salvato solo sulla TV) |
| `trackers.js` | CSV delle partite per altri tracker |
| `arm-proposals.js` | proposte di modifica per l'armadio |
| `manual-search.js` | ricerca nei PDF salvati sul dispositivo (pdf.js da `vendor/pdfjs`, caricato a richiesta) |
| `demo-db.js` | finto Firebase nel browser per la demo (`localStorage gnr_demo = '1'`) |
| `setup.js` | pagina `setup.html`: config.js e controlli del progetto Firebase |
| `tv-screens.js` | schermate della TV (tra un gioco e l'altro, classifica, premiazione, sondaggio, Di sempre), collegate da `host.js` con `bindScreens()` |
| `tv-panels.js` | pannelli della TV (armadio della serata, esportazioni, modelli, scheda del gioco, album), collegati con `bindPanels()` |

**Come si estrae un pezzo da `host.js`** (idea 76): si sposta il blocco così com'è in un modulo con gli stessi
`import`; ESLint (`no-undef`) elenca i nomi che vengono da `host.js`; si dichiarano con `let` nel modulo e si
assegnano in `bindX({ … })` alla fine di `host.js` (solo costanti e funzioni: niente variabili riassegnate).
Poi la suite e2e completa.

`fb.js` usa un `await import()` al livello del modulo per scegliere tra SDK vero e demo: tutte le pagine che
importano `fb.js` aspettano quella scelta (supportato da tutti i browser moderni e dalla WebView Android).

## Novità della 2.2

- **Rivelazione dei voti** (`host.js › SCREENS.voting`, `revealGame`): `meta/manualReveal = true` (Strumenti › Timer del voto, anche nei modelli `templates/*/s`) spegne la rivelazione automatica quando tutti hanno votato. Senza il campo resta il comportamento di prima (2 secondi dopo l'ultimo voto). Lo stato si rilegge a ogni aggiornamento della stanza, quindi un cambio a votazione aperta vale subito: acceso con tutti i voti già arrivati → parte la rivelazione; spento prima del timer → il timer si annulla. `revealGame` parte solo se la stanza è ancora in `voting` su quel gioco e una sola volta alla volta (insieme `revealing`). Gli aventi diritto sono quelli di prima (`expectedVoters`: presenti, non via, senza chi è offline oltre il periodo di grazia o saltato dalla regia). Le regole permettono `manualReveal` solo alla regia (`meta/hostUid`). Sul telefono `play.js` mostra «Tutti hanno votato…» con il testo giusto.
- **Gioca anche tu** (`host.js › openPlayerHere`): `play.html?room=` dello stesso sito in una finestra a parte. La TV usa la sessione `gn-regia`, la pagina del giocatore quella normale (account incluso): nella stanza sono due ruoli distinti (`meta/hostUid` e `players/<uid>`), un voto per `uid`.
- **Lobby partita** (`tv-screens.js › IdleScreen`): `.idle--v22` con `.ng-hero` (copertina in `#dropzone`, `object-fit: contain`) e `.ng-side`; l'azione principale cambia in `paintTimer` (classe `ng-primary`). Stili in fondo a `css/style.css` (sezione 2.2).
- **Checklist «Pronti?»** (`tv-prep.js › readyView/setReadyView`): `localStorage gnr_ready_view` = `full` (predefinito), `mini`, `off`. Solo aspetto, per TV.
- **Chi vede l'armadio** (`armadio.js › registerViewer`, Strumenti › Persone): `armadi/<id>/viewers/<uid> = { name, at, acct }` scritto da chi apre l'armadio (al massimo una volta al giorno), letto da proprietario e collaboratori. «Rimuovi accesso» scrive `armadi/<id>/blocked/<uid> = true` (solo il proprietario, mai sé stesso) e toglie `viewers`, `admins`, `adminInfo` di quell'uid. Le letture di `info`, `library`, `images`, `admins`, `uids`, `adminInfo` e l'auto-iscrizione ad `admins` (chiave o invito) negano gli uid in `blocked`. Limite: un dispositivo senza account che cancella i dati del browser ha un uid nuovo (lo spiega la pagina).

## Libreria Firebase

`vendor/firebase.js` è un unico file costruito con esbuild da firebase 10.14.1 (app, auth con Google/email/anonimo, database). Per ricostruirlo: `npx esbuild fb-entry.js --bundle --format=esm --minify --outfile=vendor/firebase.js` con un `fb-entry.js` che riesporta le funzioni usate da `js/fb.js`.

## BoardGameGeek

La cartella `bgg-proxy/` contiene un Cloudflare Worker gratuito che collega GameNight Show a BoardGameGeek senza
mettere il token di BGG nel sito. Va attivato una volta (registrazione dell'app su BGG, Worker su Cloudflare,
indirizzo in `js/services.js`): guida in [`bgg-proxy/README.md`](../bgg-proxy/README.md). Senza proxy tutto
funziona come prima e l'importazione del CSV di BGG resta.

- **Il token sta solo nel Worker** (`npx wrangler secret put BGG_TOKEN`): mai nel sito, nel repository, nei log o nelle risposte (`/health` dice solo se c'è).
- Il sito conosce solo l'indirizzo pubblico del Worker (`BGG_PROXY_URL` in `js/services.js`). Il Worker risponde solo alle origini ammesse (`ALLOWED_ORIGINS`), mette in cache (ricerche 24 h, schede 7 giorni) e limita le richieste per IP.
- Campi (proxy 1.1): nome, anno, giocatori (e consigliati), durata, età, peso, categorie, meccaniche, autori, editori, voto e posizione su BGG, espansioni, immagini. **La descrizione no**: è testo protetto che i termini di BGG non lasciano copiare; l'app mette il link alla pagina di BGG.
- Nell'armadio i campi della persona non si sovrascrivono mai in silenzio (`mergePlan`: vuoto → si riempie, diverso → solo se spuntato). Autori, età, voto, posizione e meccaniche stanno a parte in `bggInfo` (validato dalle regole).
- Codice a barre: un EAN/UPC **non** è un numero di BGG. Si cerca per nome; l'abbinamento confermato (EAN → gioco BGG) si ricorda su questo dispositivo, e si può sempre scrivere a mano.
