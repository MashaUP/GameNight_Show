# Verifica della versione 1.1.0

Come è stata provata questa versione prima della consegna. Per ogni richiesta: **stato**, **come è stata provata**, **risultato** e **cosa resta da provare a mano**.

I test automatici girano su Chromium (Playwright): TV a 1280×720, 1366×657, 1600×900, 1920×969 e 1024×600; telefoni a 412×915 e 360×760, in modalità mobile e touch. Firebase è sostituito da un piccolo server di prova in due versioni:
- **senza regole**, per provare le schermate;
- **con le regole vere** di `database.rules.json`, applicate dal simulatore *targaryen*: ogni scrittura e lettura viene accettata o rifiutata come farebbe Firebase.

Legenda: ✅ verificata · ✋ da provare a mano (serve un dispositivo vero) · ⚠️ verificata in parte.

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
