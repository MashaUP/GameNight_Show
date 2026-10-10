# Novità

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
