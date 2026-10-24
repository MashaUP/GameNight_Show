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
docs/                      GUIDA, INSTALLAZIONE, ANDROID, SVILUPPO, DATI, LINKS, PRIVACY, AUDIT, VERIFICA
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
- `rooms/<codice>/meta`: `ambient` (schermo ambiente), `customSfx` (solo nomi e icone: i file audio restano sulla TV),
  `atmoLevel`, `atmoSound`.
- `people/<id>/favs`: preferiti del profilo; `pub/<token>`: catalogo pubblico dell'armadio (solo i campi scelti).

Formato dei file di esportazione e regole dell'importazione: [DATI.md](DATI.md).

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
nell'elenco delle verifiche a mano: [VERIFICA.md](VERIFICA.md).

## BoardGameGeek

La cartella `bgg-proxy/` contiene un Cloudflare Worker gratuito che collega GameNight Show a BoardGameGeek senza
mettere il token di BGG nel sito. Va attivato una volta (registrazione dell'app su BGG, Worker su Cloudflare,
indirizzo in `js/services.js`): guida in [`bgg-proxy/README.md`](../bgg-proxy/README.md). Senza proxy tutto
funziona come prima e l'importazione del CSV di BGG resta.
