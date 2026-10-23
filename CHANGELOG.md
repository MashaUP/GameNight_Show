# Novità

## 1.5.0 · Link ufficiali, community, telefono in inglese (23 ottobre 2026)

> Contiene anche tutta la 1.4.0, che non era stata pubblicata da sola. **Le regole del database sono cambiate rispetto alla 1.3.1** (vecchi profili di gruppo): ricopia `database.rules.json` in Firebase e premi **Pubblica** (README, passo 2.3).
>
> L'APK ora si costruisce **solo quando pubblichi una release** (tag `v1.5.0`): dopo aver caricato i file, pubblicala da Releases › Draft a new release (README, “Pubblicare una nuova versione”). I normali caricamenti non toccano più le Releases.

- **Link ufficiali in un solo posto:** `config/links.json` (GitHub, Discord, Ko-fi, guida, segnala un problema, proponi un’idea). Nessun indirizzo scritto a mano nelle pagine: un controllo automatico lo impedisce.
- **Aggiornabili senza nuove versioni:** cambiato il file sul sito, l’app Android prende i nuovi link entro 6 ore (subito con **Cerca aggiornamento**). Validazione degli indirizzi (solo https e domini ammessi dal codice), copia di base sempre di riserva, ultima copia buona salvata per l’offline, nessun blocco all’avvio. Guida: `docs/LINKS.md`.
- **Icone di GitHub e Discord** nel footer della home (piccole, accessibili da tastiera e lettori di schermo, tema chiaro e scuro) e nuova sezione **Profilo e app › Community e supporto**. Un link spento sparisce senza lasciare pulsanti vuoti.
- **Collegamenti stabili** `go.html?to=discord` (e `github`, `kofi`, `bugs`, `ideas`): per README, QR e messaggi, seguono sempre il file dei link.
- **Segnalazioni su GitHub** con moduli guidati (problema, idea) e collegamento alla community.
- **APK solo sulle release pubblicate da te** (tag `v1.5.0` o `v1.5`): prima a ogni caricamento il workflow ricostruiva l'APK e modificava la release “App Android”, facendo partire i webhook delle release ogni volta. Ora controlla che il tag corrisponda a `version.json`, rifà i controlli automatici e aggiunge solo i file alla tua release, senza crearne o modificarne altre. App e pagina di download leggono l'ultima release (`releases/latest`), con l'impronta SHA-256 calcolata da GitHub. La vecchia release “App Android” viene aggiornata solo finché esiste, per portare alla 1.5 le app 1.3 già installate.
- **Inglese anche sul telefono durante la serata:** ingresso, voto, attese, classifica, profilo, premi e statistiche. Restano in italiano la TV, l’armadio, il resoconto e alcuni pannelli extra del telefono (pronostici, pre-partita, soundboard).
- **Dati neutri nel database:** motivi del time-out e titoli dei premi si salvano come codici e ogni dispositivo li mostra nella sua lingua; le serate salvate prima vengono riconosciute e tradotte. Conviene aggiornare tutti i dispositivi del gruppo: una TV ferma alla 1.3 mostrerebbe il codice (es. “bathroom”) al posto del motivo.
- **Repository più completo:** licenza **MIT** (`LICENSE`), `CONTRIBUTING.md`, `SECURITY.md` (segnalazioni di sicurezza in privato), pulsante **Sponsor** di GitHub verso Ko-fi (`.github/FUNDING.yml`), Dependabot mensile per le azioni e gli strumenti di prova, modello per le pull request, `.gitattributes` (fine riga uniformi, librerie escluse dalle statistiche) ed `.editorconfig`, immagine di anteprima per i link (`assets/brand/social-preview.png`).
- **README riscritto** per chi arriva per la prima volta (cos’è, funzioni, stato, installazione, come contribuire); la guida completa delle schermate è in `docs/GUIDA.md`.
- **Prove:** `tests/links.test.mjs` (23 prove del sistema dei link), `tests/e2e/links.py` e `tests/e2e/phone_en.py` (telefono in inglese con la TV in italiano) nel browser; **controllo del codice con ESLint** dentro `npm test` (nomi non definiti, chiavi doppie…), che blocca anche la pubblicazione dell'APK; corrette tre prove nel browser rimaste indietro rispetto alla nuova home.

## 1.4.0 · Nuovo look, due lingue, prove automatiche (19 ottobre 2026, pubblicata con la 1.5.0)

> Le regole del database sono cambiate (vecchi profili di gruppo): ricopia `database.rules.json` in Firebase e premi **Pubblica** (README, passo 2.3).

- **Nuovo logo:** il dado rosso con la stella tra gli anelli al neon, su icona dell’app Android (anche adattiva e monocromatica per Android 13+), schermata di avvio, icone del sito e favicon.
- **Nuova home**, dai mockup:
  - computer: barra laterale con Home, Armadi, Serate, Gruppi, Profilo e app, Impostazioni;
  - telefono: barra in basso con le stesse sezioni (Altro = profilo, app, sostegno, impostazioni);
  - riquadri: saluto, Entra in una stanza (prima il QR, poi il codice), Crea una stanza / La tua regia, profilo con numeri, collezione, gruppi con le serate in corso, App Android, Sostieni GameNight (Ko-fi), Informazioni con **Cerca aggiornamento**;
  - il tasto Indietro (browser e Android) torna dalla sezione alla home.
- **Tema Show predefinito** su tutti i dispositivi (prima solo sulla TV). Chi aveva scelto Giorno o Notte li tiene.
- **Italiano e inglese:** Impostazioni › Lingua. Vale per dispositivo; alla prima apertura si usa la lingua del dispositivo. Tradotte in questa versione: home, impostazioni, profilo, armadi e serate della home, pagina di download, aggiornamenti dell’app, messaggi comuni (connessione, foto, errori di Firebase), traguardi e livelli. Le schermate della serata, dell’armadio e del resoconto sono ancora in italiano: arrivano nelle prossime versioni.
- **Novità degli aggiornamenti in due lingue** (`notes` e `notesEn` in `version.json`, pubblicate anche nella release dell’APK).
- **Prove automatiche nel repository:** `tests/e2e` (Playwright con un finto Firebase, anche con le regole vere), avviate da GitHub a ogni caricamento insieme ai controlli e alle regole; `tests/check.mjs` controlla anche le traduzioni.
- **Proxy BoardGameGeek** in `bgg-proxy/` (Cloudflare Worker gratuito, con prove): pronto da attivare, vedi `bgg-proxy/README.md`. L’integrazione nell’app arriva in una prossima versione.
- **Sicurezza:**
  - i vecchi profili di gruppo (`members`) non si possono più cancellare o spostare in un altro gruppo da altri dispositivi (prima bastava essere collegati);
  - le pagine caricano script solo dal sito stesso (Content-Security-Policy più stretta).
- **Documenti:** `docs/AUDIT.md` (analisi del codice e piano dei lavori), `docs/PRIVACY.md` (dove finisce ogni dato), `tests/README.md`.
- **Pulizia:** tolte due foto di prova rimaste nella radice del repository.

## 1.3.1 (10 ottobre 2026)

- Corretto: “Le informazioni sulla versione pubblicata non sono valide”. Il sito (`mashaup.github.io`) vede il nome utente in minuscolo, la release di GitHub lo scrive con le maiuscole (`MashaUP`): ora i due indirizzi vengono riconosciuti come lo stesso (GitHub non distingue maiuscole e minuscole nei nomi).

## 1.3.0 · Aggiornamenti e installazione (10 ottobre 2026)

> Le regole del database non cambiano rispetto alla 1.2.0. Serve però installare a mano, una volta, l’APK 1.3: dalle versioni successive gli aggiornamenti arrivano dall’app.

- **L’app avvisa quando c’è una versione nuova:** “È disponibile GameNight Show X · hai la Y”, con la prima novità.
  - Una volta per versione; ✕ la mette da parte.
  - Al massimo un controllo ogni mezz’ora, con dati letti ogni 6 ore.
  - Senza rete l’app funziona come sempre.
- **Sezione “Scarica GameNight”** (Impostazioni nell’app, home del sito):
  - versioni e build, data, dimensione, requisiti, novità;
  - “Controlla aggiornamenti”;
  - stati chiari: aggiornata, disponibile, in preparazione, errore, nessuna connessione.
- **Scarica APK dall’app:**
  - solo dall’indirizzo ufficiale, con avanzamento;
  - controllo di dimensione e SHA-256: un file vuoto, incompleto o diverso viene cancellato e mai installato;
  - poi “Installa” apre la schermata di Android, che chiede conferma (l’app non si installa da sola).
- **Pagina ufficiale di download `scarica.html`**, sempre allo stesso indirizzo:
  - versione, novità, istruzioni, requisiti, impronta SHA-256;
  - avvisi per iPhone e per i telefoni con Android troppo vecchio.
- **Sulla TV**, “Installa GameNight su un altro dispositivo”:
  - QR grande verso la pagina di download, da “Nuova serata” e da Strumenti;
  - si usa da tastiera (Invio, Esc, il fuoco resta nella finestra).
- **Workflow dell’APK:** pubblica anche i dati della build (versione, numero, dimensione, SHA-256, novità) nella release “App Android” e in `GameNight-Show.json`.
- **Correzioni:**
  - l’avviso “Aggiorna” del sito compare solo se la versione pubblicata è davvero più nuova (confronto tra versioni, non tra testi);
  - il QR ha un margine più ampio dove deve essere letto da lontano.

## 1.2.0 · “Armadio organizzato” (10 ottobre 2026)

> Le regole del database sono cambiate: ricopia `database.rules.json` in Firebase e premi **Pubblica** (README, passo 2.3).

**L’armadio ha una pagina tutta sua** (`armadio.html`), su telefono, tablet e computer.

- **Rinomina** l’armadio, con descrizione e icona. Il nome nuovo arriva anche alla home, al profilo e alla stanza aperta.
- **Ricerca, filtri combinabili e ordinamento.** I filtri attivi compaiono come chip da togliere con un tocco. Viste **Griglia**, **Lista** e **Scaffali**, più le **viste salvate**.
- **Posizione in casa** (stanza, mobile, ripiano, contenitore) e **📍 Trova il gioco**, anche negli altri tuoi armadi.
- **Prestiti completi:**
  - a chi, scadenza, note e com’è tornato;
  - i prestiti scaduti sono evidenziati;
  - storico dei prestiti;
  - più copie dello stesso gioco.
- **Espansioni, edizioni e copie:**
  - domanda “c’è già: copia, gioco diverso o apri?”;
  - revisione dei possibili **duplicati** (niente viene cancellato da solo).
- **Cronologia** non modificabile. **Cestino** con ripristino. Eliminazione definitiva solo dopo aver scritto ELIMINA.
- **Esporta CSV e JSON** e **importa con anteprima.** Due modi: prudente o completa i campi vuoti. Annulla l’importazione. Funziona anche con il CSV di BoardGameGeek.
- **Link pubblico in sola lettura**, garantito dalle regole del database:
  - non mostra prestiti, note né proprietari;
  - posizione e disponibilità solo se le scegli tu;
  - si aggiorna da solo;
  - si rinnova o si disattiva in qualsiasi momento.
- **Modifica multipla** con anteprima: posizione, stato, proprietario, tipologia, etichette, “da provare”.
- **Etichette QR stampabili** per giochi e scaffali. Si aprono anche dalla fotocamera dell’app.
- **Schede incomplete:** compilazione rapida, un gioco alla volta.
- **Persone e permessi:**
  - invito da collaboratore per **una sola persona**, valido 7 giorni;
  - revoca;
  - “lascia l’armadio”.
- **Data di acquisizione**, stato **Nuovo, da provare** e **trasferimento** in un altro armadio.
- **Più leggero:** l’elenco scarica solo le miniature (240×180). La foto grande si carica quando apri la scheda. Le foto degli armadi esistenti vengono spostate da sole, controllando la copia prima di toglierla.
- La TV apre la pagina nuova (`host.html?armadio=…` reindirizza). **📺 Crea una serata** sceglie già l’armadio. Nella stanza c’è **🗂️ Gestione completa**.

## 1.1.0

- Corretto l’errore “path argument was an invalid path”, che bloccava anche la creazione del profilo dalla home.
- Home e tavolo di verifica sfruttano lo spazio su desktop e tablet.
- Nuovo carattere più leggibile: Atkinson Hyperlegible Next.

## 1.0.0

- Profilo unico tra sito e app, armadi legati al profilo.
- App Android con tasto Indietro, barra di stato e link all’APK.
- Rotazione delle foto, fine serata manuale e resoconto.
- Più voti nella votazione dei giochi, soundboard e tavolo di verifica completo.
