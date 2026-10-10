# Verifica della versione 1.3.1

Come è stata provata questa versione prima della consegna. Per ogni richiesta: **stato**, **come è stata provata**, **risultato** e **cosa resta da provare a mano**.

I test automatici girano su Chromium (Playwright): TV a 1280×720, 1366×657, 1600×900, 1920×969 e 1024×600; telefoni a 412×915 e 360×760, in modalità mobile e touch. Firebase è sostituito da un piccolo server di prova in due versioni:
- **senza regole**, per provare le schermate;
- **con le regole vere** di `database.rules.json`, applicate dal simulatore *targaryen*: ogni scrittura e lettura viene accettata o rifiutata come farebbe Firebase.

Legenda: ✅ verificata · ✋ da provare a mano (serve un dispositivo vero) · ⚠️ verificata in parte.

## Correzione della 1.3.1

| Problema | Stato | Come è stata provata | Risultato |
|---|---|---|---|
| Sul sito pubblicato “Le informazioni sulla versione pubblicata non sono valide”, con l’APK regolarmente creata | ✅ ✋ | Causa: il sito ricava l’indirizzo dell’APK da `mashaup.github.io` (minuscolo), la release lo scrive con `MashaUP`; il confronto era esatto. Test aggiunto: utente con maiuscole e sito in minuscolo. | L’APK viene riconosciuta e si scarica dall’indirizzo scritto da GitHub. `upd13` 56/56. ✋ Da ricontrollare sul sito dopo il caricamento (da qui l’API di GitHub non è raggiungibile). |

## Novità della 1.3.0 · Aggiornamenti e installazione

Test nuovo `upd13` (55 controlli). L’app Android è simulata nel browser con un Capacitor finto, che riproduce download, avanzamento, lettura del file e apertura dell’installazione; GitHub (API e APK) è simulato con risposte preparate. **Non sono stati provati:** la costruzione dell’APK con il nuovo componente (serve GitHub Actions, qui non c’è l’Android SDK), l’installazione vera su un telefono, la lettura del QR con un telefono vero davanti alla TV, un dispositivo Android TV.

| Funzione | Stato | Come è stata provata | Risultato / limiti |
|---|---|---|---|
| Confronto delle versioni | ✅ | 1.10.0/1.9.0, 1.2/1.2.0, beta, 2.0.0/10.0.0, testi non validi. | Confronto numerico, non alfabetico; le versioni non valide vengono ignorate. |
| Dati della versione pubblicata | ✅ | Release corretta, APK non ufficiale, release senza APK, dati della build mancanti o rotti, dimensione o SHA-256 non validi, `version.json` non valido. | Ogni campo controllato; un’APK da un indirizzo diverso da quello ufficiale viene ignorata. Senza dati della build si verifica solo la dimensione. |
| Stessa versione / nuova versione / build più recente / in preparazione | ✅ | App 1.3.0 build 58 con release uguale; app 1.2.0 con release 1.3.0 e poi 1.4.0; stessa versione con build più nuova; sito già alla 1.4.0 con APK ancora 1.3.0. | “GameNight Show è aggiornato”; avviso con versione installata, nuova e prima novità; download possibile senza avviso; “APK in preparazione” senza download. |
| Avviso senza disturbo | ✅ | 4 pagine aperte di seguito; ✕ e ricarica; uscita di una versione ancora più nuova. | 1 sola richiesta a GitHub; ✕ vale per quella versione; con la versione successiva l’avviso torna. |
| Errori di rete e dati | ✅ | API irraggiungibile, risposta rotta, release assente. | L’app parte normalmente, nessun avviso; nel pannello il motivo in chiaro e nessun pulsante di download. |
| Download e controllo | ✅ ⚠️ | Download corretto; file alterato, troncato, vuoto; APK irraggiungibile (404); rete caduta; SHA-256 pubblicato diverso. | Avanzamento visibile; “completato e controllato (SHA-256 e dimensione)” solo a controllo superato; negli altri 6 casi messaggio chiaro, file cancellato, nessuna installazione. ⚠️ Il download vero lo fa il componente Filesystem di Capacitor (già nell’app): qui è simulato. |
| Installazione | ✅ ✋ | Pulsante Installa. | Apre l’installazione di Android sul file controllato (tipo APK) e scrive “Installazione da confermare”, mai “installato”; spiega il permesso “Consenti da questa fonte”. ✋ Da provare su un telefono con l’APK 1.3. |
| APK vecchia senza componente | ✅ | App senza FileOpener. | Propone il download nel browser. |
| Pagina scarica.html | ✅ | Android 13, Android 6, iPhone, telefono a 390 px. | Download ufficiale, istruzioni, novità, SHA-256; Android 6: “richiede Android 7.0”, niente download; iPhone: usa il sito. Niente scorrimento a destra. |
| Home del sito | ✅ | 1366 px. | Riquadro “Scarica GameNight” con versione, link ufficiale e QR per il telefono. |
| QR sulla TV | ✅ ✋ | 1280×720 e 1920×1080: apertura con Invio, lettura del QR con jsQR, Tab, scorciatoie, Esc. Nella stanza dentro l’app: Strumenti › App sui telefoni. | QR di 376 e 567 px, tutto nello schermo, il QR porta alla pagina stabile `scarica.html` (nell’app: sito pubblico). Il fuoco resta nella finestra, Esc chiude e riporta il fuoco al pulsante. ✋ Lettura con un telefono vero alla distanza del divano. |
| Regressione | ✅ | Rieseguiti tutti i test delle versioni precedenti (armadio 1.2, regress, tranche 1–9, xss, tavolo di verifica, fit, tour, telefono, fine serata, hub, app, votazioni, suoni, rotazione) più `check.mjs` (984 controlli). | Nessun errore. Tranche 2, 3 e 7 sono state rieseguite da sole: le prime due per un aggiornamento del programma di prova (copia del nuovo modulo), la 7 perché sotto carico era scaduto un tempo d’attesa. |
| Workflow | ✅ ⚠️ | Il passaggio che scrive i dati della build e la descrizione della release è stato eseguito in locale su un file di prova (con virgolette, apostrofi, % e `}` nelle novità). | JSON e descrizione corretti, impronta uguale a `sha256sum`. ⚠️ Il workflow completo (Gradle, firma, pubblicazione) gira solo su GitHub: va controllata la spunta verde dopo il caricamento. |

## Novità della 1.2.0 · Armadio organizzato

Test nuovo `am12` (102 controlli), eseguito sul server di prova **con le regole vere**. Più l’armadio grande da 600 giochi (`amperf`), 229 regole del database (`tests/rules.test.js`) e 5 verifiche nuove nel tavolo di verifica, anche queste con le regole vere.

| Funzione | Stato | Come è stata provata | Risultato / limiti |
|---|---|---|---|
| Rinomina, descrizione, icona | ✅ | Rinomina dalla pagina e ricarica. Un estraneo prova a rinominare. La home mostra il nome nuovo. | Salvata e mostrata ovunque, anche nella stanza aperta. Rifiutata a chi non è proprietario (anche a un collaboratore). La rinomina finisce in cronologia. |
| Ricerca, filtri combinati, ordinamento, viste | ✅ | Ricerca per nome e per posizione. “In 2” + cooperativo. Chip tolto, poi Azzera. Senza posizione. Solo espansioni. Ordinamento per durata e per posizione. Griglia, Lista, Scaffali. Vista salvata e riapplicata dopo una ricarica. | Risultati esatti in ogni caso. I valori mancanti vanno in fondo. È stato trovato e corretto un difetto: dopo aver scritto un numero, il primo tocco su un chip andava a vuoto. |
| Posizione e “Trova il gioco” | ✅ | Posizione inserita, mostrata nella scheda e in Trova, anche con le espansioni. | Stanza › mobile › ripiano › contenitore, con i suggerimenti dei valori già usati. |
| Prestiti | ✅ | Prestito scaduto (rosso nella scheda Prestiti e nel riepilogo) e restituzione “manca qualcosa”. Due copie prestate a due persone, poi una restituita. | Stato, storico e note corretti. Con tutte le copie fuori non si può prestare. Con una copia in casa il gioco è di nuovo disponibile. |
| Espansioni, edizioni, copie, duplicati | ✅ | Espansione collegata dall’importazione. Stesso nome: “un’altra copia” (copie = 2). Altra edizione aggiunta senza domande e trovata tra i duplicati. “Sono diversi” ricordato su entrambi i giochi. | Niente viene cancellato da solo. |
| Cronologia e cestino | ✅ | Cestino, poi ripristino con tutti i dati. Ripristino con un nome già presente: chiede conferma. Eliminazione: senza la parola ELIMINA non succede niente, con ELIMINA va. Un estraneo prova a svuotare il cestino. Il proprietario prova a riscrivere una voce della cronologia. | Rifiutati entrambi dalle regole. La cronologia mostra tutte le operazioni. Il proprietario può solo cancellare una voce, non modificarla. |
| Import / export | ✅ | CSV con giochi nuovi, uno già presente, una riga ripetuta e una senza nome. Anteprima, poi Importa, Annulla e reimportazione. Esportati CSV e JSON. | L’anteprima conta tutto esattamente e non scrive niente. L’annullamento mette nel cestino. Il JSON non contiene chiavi, utenti né foto grandi. Tavolo di verifica: un CSV con accenti e punto e virgola si reimporta uguale. |
| Link pubblico | ✅ | Creato e aperto da un altro dispositivo. Scritture e letture vietate provate direttamente sul database. Modifica di un gioco e aggiornamento del catalogo. Disattivazione. | Il visitatore vede solo il catalogo, senza comandi, con la posizione nascosta. Il catalogo non contiene prestiti, nomi, note, proprietari né posizioni (salvo scelta). Il visitatore non può: scriverlo, scrivere nell’armadio, leggere i prestiti, elencare tutti i cataloghi. Il catalogo si aggiorna da solo in circa 3 secondi. Dopo la disattivazione compare “Link non più valido” all’istante. |
| Foto leggere e migrazione | ✅ | Gioco con foto: controllate miniatura e foto grande. Un gioco “vecchio” con la foto dentro, poi l’apertura dell’armadio. | Nell’elenco solo la miniatura. La foto grande si scarica alla scheda. Migrazione: copia, rilettura, poi rimozione; nessuna perdita. |
| Prestazioni (600 giochi) | ✅ ⚠️ | `amperf`: 600 giochi con foto 640×480. | Dati scaricati all’apertura: 7,1 MB invece di 31,2 MB (4,4 volte meno). Con le foto di prova la miniatura è di circa 12 KB contro i 40 KB della foto grande. Si disegnano 120 giochi alla volta (“Mostra altri”). Ricerca 0,26 s, cambio vista 0,2–0,5 s, duplicati su 600 giochi istantanei. ⚠️ I tempi di apertura misurati qui dipendono dal server di prova, non da Firebase. |
| Modifica multipla | ✅ | 2 giochi selezionati: posizione (parziale) ed etichetta. | L’anteprima dice quanti giochi cambiano e non scrive niente. I campi lasciati vuoti restano com’erano. Le etichette vengono aggiunte, non sostituite. Tutto in cronologia. |
| Etichette QR | ✅ ✋ | Pagina di stampa generata. Lettura del QR come la fa l’app. | Un QR per gioco, anche per scaffale. Il QR si apre dall’app con gioco e scaffale. ✋ Stampa su carta e lettura con il telefono da provare a mano. |
| Schede incomplete | ✅ | “Salva e avanti” e “Salta”. | Vengono chiesti solo i campi mancanti. |
| Collaboratori e permessi | ✅ | Invito, poi un altro dispositivo diventa collaboratore e modifica. Revoca. Riuso dell’invito. Ricarica della pagina. | Il codice sparisce dall’indirizzo. Dopo la revoca il dispositivo non scrive più e torna in sola lettura. È stato trovato e corretto un problema di sicurezza: un collaboratore revocato poteva rientrare con lo stesso invito. Ora l’invito vale per **una sola persona** e la revoca lo annulla. 9 regole nuove. |
| Trasferimento tra armadi | ✅ | Gioco spostato in un secondo armadio. | Spostato, non copiato. Posizione da riconfermare. I prestiti seguono il gioco. |
| TV e app | ✅ ✋ | `host.html?armadio=…`, “Crea una serata”, tasto Indietro simulato (scheda aperta, sezione, elenco), pagina a 360 px. | La TV porta alla pagina nuova. La serata ha già l’armadio scelto. Indietro chiude la scheda, poi torna all’elenco, poi alla home. A 360 px niente esce dallo schermo (griglia, lista, scaffali, filtri, scheda, selezione, prestiti, cronologia, cestino, strumenti). ✋ Da riprovare sull’APK. |

È stato trovato e corretto anche un errore che bloccava la TV: un nome importato due volte in `js/host.js`, rilevato dal controllo `check.mjs`.

**Regressione:** tutti i test delle versioni precedenti sono stati rieseguiti, senza errori:

- regress e tranche 1–9;
- xss, fit;
- mtour, dtour, phoneui;
- endnight, hub, hubjoin, app;
- armpick, armadio, arm2, images;
- pollmulti, sfx, rot;
- tavolo di verifica con le regole vere.

Quattro test che seguivano il vecchio percorso dell’armadio (armadio, arm2, images, hub) sono stati aggiornati alla pagina nuova.

## Novità della 1.1.0

| Richiesta | Stato | Come è stata provata | Risultato / limiti |
|---|---|---|---|
| Errore del tavolo di verifica "path argument was an invalid path" (Profilo personale) | ✅ | Il finto Firebase dei test ora rifiuta il percorso vuoto come quello vero; tavolo di verifica rieseguito con le regole vere. | Era un errore vero: con Firebase reale **anche la creazione del profilo dalla home falliva**. Corretto (`js/fb.js`, radice del database). Ora la verifica passa. |
| Home che sfrutta lo spazio (desktop, tablet, telefono) | ✅ | Schermate a 412, 900, 1366 e 2000 px, con e senza profilo, con armadi e serate aperti. Controllo automatico: nessun elemento fuori schermo. | Telefono: una colonna (Entra, poi Crea). Tablet: Entra e Crea affiancati. Desktop: intestazione larga, Entra/Crea affiancati, profilo accanto ad armadi e serate, App e Donazioni in fondo affiancate. |
| Carattere più leggibile | ✅ | Testi dell'interfaccia in **Atkinson Hyperlegible Next** (lettere ben distinte: I l 1, O 0). I titoli restano in Fredoka. Testi secondari più grandi (minimo ~15 px), interlinea più ampia, segnaposto più contrastati. Ricontrollato su TV (5 risoluzioni), regia sul telefono, home, resoconto e tavolo di verifica. | Il testo normale usa il peso medio, il grassetto quello pieno. Lo zero ha il taglio, per distinguerlo dalla O. |
| Tavolo di verifica largo e ordinato | ✅ | 2000, 1280 e 412 px, con le regole vere. | Verifiche raggruppate per area, ognuna con il conteggio; 2-3 colonne su desktop; riepilogo con i conteggi in alto a destra; matrice e ritorno alla home sempre visibili. |
| Barra in alto della TV con il nuovo carattere | ✅ | Misurata a 1024, 1280, 1366 e 1920 px. | Il logo non viene più coperto: il nome del gruppo è già nella sala d’attesa, e sotto i 1400 px l’orologio lascia spazio ai comandi. |
| Resoconto e armadio sul telefono aperti dal PC | ✅ | 1366 e 412 px. | Su desktop non sono più una colonna stretta: classifica e premi affiancati, giochi in griglia. |

## Richieste della 1.0.0

| # | Richiesta | Stato | Come è stata provata | Risultato / limiti |
|---|---|---|---|---|
| 1 | Rotazione delle foto | ✅ | Immagine metà rossa e metà blu caricata come foto di gioco e come personaggio. Prove: senza rotazione, ⟳ 90°, ⟲ 90°, 180°, foto con orientamento EXIF 6, Annulla. Si controllano i pixel del file **salvato**. | 8/8. La rotazione vale per il file salvato. L’EXIF viene applicato. Annulla non salva niente e non mostra errori. La stessa finestra vale per giochi (TV, telefono, armadio), personaggio, foto ricordo e logo del gruppo. |
| 2 | Font più leggibile | ✅ ⚠️ | Lilita One e Bungee sono stati sostituiti da **Fredoka**: forme tonde e aperte, più strette, leggibili anche piccole. Sul telefono i titoli piccoli, i pulsanti e le etichette del voto usano Nunito nero. Controllato sulle schermate reali (lobby, prossimo gioco, voto, reveal, classifica, premiazione, home, telefono). Le prove "entra tutto nello schermo" passano a 5 risoluzioni TV. | Testi tagliati non trovati. Il giudizio finale sull’estetica è tuo. |
| 3 | Armadio importato nella stanza | ✅ | Stanza creata da un armadio con 2 stelline. Poi: stelline cambiate nella stanza, cambio armadio dalla sala d’attesa, armadio cancellato, serata di prova con l’armadio. Ripetuto anche **con le regole vere**. | 11/11. La stanza usa l’armadio originale (sempre aggiornato). Le stelline della serata stanno nella stanza: la collezione non cambia. La prova è in sola lettura. L’armadio cancellato viene segnalato. |
| 4 | Chiusura manuale della serata | ✅ | Due serate chiuse con **🏁 Fine serata** a votazione aperta: una contando i voti arrivati, una lasciando fuori il gioco. Provati anche il doppio tocco e la ricarica della pagina. Ripetuto con le regole vere. | 22/22. La conferma spiega cosa succede. La serata non si chiude due volte. Il gioco escluso va nel cestino (ripristinabile). |
| 5 | Resoconto finale | ✅ | Resoconto aperto dal telefono a fine serata e poi dalla home dopo aver lasciato la stanza. | Mostra classifica, pari merito, voti di ognuno, vincitori e MVP. Dichiara "votazione chiusa in anticipo", "annullato, 1 voto non conteggiato" e "nessun voto". Si stampa. Se la stanza non c’è più, mostra il riassunto del gruppo. |
| 6 | ✕ su «Serata terminata · Annulla» | ✅ | Clic sulla ✕, poi ricarica della pagina. | L’avviso sparisce, la serata resta terminata e l’avviso non ricompare. |
| 7 | Navigazione dalla stanza | ✅ | **←** nella stanza del telefono, poi rientro. | Torna alla home senza uscire dalla serata: voti e punti restano e si rientra con un tocco. Se il voto non è ancora inviato chiede conferma. Uscire davvero (“Esco dalla serata”) e chiudere la serata (solo TV) sono azioni distinte. |
| 8 | Tasto Indietro di Android | ✅ ✋ | Il plugin dell’app (Capacitor App) è stato simulato in pagina. | Indietro chiude prima la finestra aperta, poi la schermata; dalla home l’app va in secondo piano invece di chiudersi. ✋ Da provare sull’app installata. |
| 9 | Ordine Entra / Crea nella home | ✅ | Home controllata a schermo, sul telefono e nell’app. | Per primo **Entra nella stanza** (QR, poi codice), subito sotto **Crea la stanza**, con la stessa forma. Entrambi funzionano. |
| 10 | Più voti nella votazione dei giochi | ✅ | Prova nel browser con 3 telefoni. In più, 13 regole del database. | 9/9 + 13/13. La TV sceglie 1–3 voti a testa (bloccati dopo il primo voto). Il telefono non supera il massimo. Il database rifiuta il voto in più e il doppio voto allo stesso gioco anche se arrivano da un telefono modificato. Vince il gioco più votato. |
| 11 | Soundboard | ✅ ⚠️ ✋ | Codice analizzato: sui **touch** l’audio si sbloccava solo con `pointerdown`, e una volta sola. Ma il browser dà il permesso quando il dito si alza (`pointerup`/`touchend`), quindi una TV touch restava muta per sempre. Corretto e provato: effetto dal telefono, avviso "tocca per attivare", due telefoni insieme, tocchi ripetuti, TV in silenzioso. | 7/7. I suoni creano davvero nodi audio. Due effetti partono uno dopo l’altro. Il fumetto dice perché un effetto non si sente. ⚠️ Il browser di test non riproduce il blocco dell’audio. ✋ L’ascolto vero va provato sulla TV. |
| 12 | Tavolo di verifica completo | ✅ | `test.html` eseguito contro il database **con le regole vere**. | 27 verifiche reali verdi, 5 segnate ✋ da provare a mano (mai come riuscite). Usa solo codici nuovi; la pulizia viene ricontrollata (resta solo il codice regia di prova, che le regole non fanno cancellare). Matrice scaricabile. |

## Richieste precedenti alla 1.0.0

| Richiesta | Stato | Come è stata provata | Risultato / limiti |
|---|---|---|---|
| Regia (pagina TV) sul telefono senza scorrimento a destra | ✅ | Giro completo a 412 e 360 px: sala d’attesa, giocatori, strumenti, armadio, ruota, consigli, tavolo, intervallo, quiz, scaletta, regole, votazione dei giochi, classifica di sempre (10 schede), voto, reveal, classifica, premiazione. | Nessun elemento fuori schermo, nessuno scorrimento laterale. |
| Barra di stato di Android sopra i pulsanti | ✅ ✋ | Simulata con un margine di 36 px su home, creazione stanza, sala d’attesa e telefono. | Niente sotto l’orologio. ✋ Da guardare sul telefono vero. |
| Home sempre raggiungibile, fine serata senza vicoli ciechi | ✅ | Telefono a fine serata: **Torna alla home** e **Resoconto**. Regia: **🏠 Home**. | Funziona. |
| Profilo prima della stanza, unico tra sito e app | ✅ | Due dispositivi: crea, collega con QR/codice, unisce. Ripetuto con le regole vere. | Il nome più recente vince, gruppi e armadi si sommano. Su un telefono nuovo il profilo si crea da solo al primo ingresso. **Le regole vere hanno trovato un errore** (non si potevano salvare i gruppi insieme al profilo nuovo): corretto. |
| Armadi accessibili da più dispositivi | ✅ | Dopo il collegamento, il secondo dispositivo vede l’armadio e aggiunge giochi senza chiave. | Funziona. |
| Link per scaricare l’app Android | ✅ ✋ | La home sul sito mostra **📲 App per Android** con il link alla release automatica. | ✋ La costruzione dell’APK (GitHub Actions) non si può provare qui: controlla la scheda Actions dopo il caricamento. |

## Controlli generali

- Regole del database: **184/184** casi come previsto (`tests/rules.test.js`).
- Controlli dei file del sito: tutti superati (`tests/check.mjs`).
- Prove di regressione delle versioni precedenti (serata completa, gruppi, statistiche, armadio, immagini, app, iniezioni HTML): rieseguite dopo le modifiche, vedi il messaggio di consegna.

## Non verificabile qui

- APK Android reale (costruzione su GitHub Actions; installazione).
- Telefono vero: barra di stato, tasto Indietro fisico, fotocamera e QR, vibrazione.
- Audio udibile sulla TV.
- Firebase vero: le regole sono provate con il simulatore. Sul tuo progetto usa `test.html` dopo aver ricopiato `database.rules.json`.
