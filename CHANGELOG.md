# Novità

## 2.4.0 · Stanza della TV ridisegnata, serate chiudibili dalla pagina Serate, niente più tetto a 12 giocatori (2 novembre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** (chiusura della serata da parte del creatore, `maxPlayers` fino a 100, `meta/muted`). Per l'app Android la release da pubblicare è `v2.4.0`.

**Perché 2.4.0 (MINOR)**: nuove funzioni retrocompatibili (chiudere una serata in corso, preferenze della lobby, densità, silenzioso dalla regia, posti oltre 12) e un ridisegno di pagine e stanza; nessun dato da convertire, le serate vecchie si aprono come prima.

**Funzioni**
- «Chiudi la serata» nella pagina Serate per le serate in corso (solo creatore o dispositivo con il codice regia): porta la stanza alla premiazione con conferma, senza cancellare giochi e voti. Il riassunto nel gruppo lo scrive la TV appena si riapre (o subito, se è aperta). Regole: il creatore può scrivere lo stato solo verso la premiazione conclusa.
- Serate di prova (giocatori finti): ora registrano il creatore, quindi si possono eliminare. Il resoconto usa da solo la sessione della regia se il dispositivo ha il codice regia della serata.
- Posti: niente tetto fisso a 12. Il master sceglie fino a 100 (campo numerico nella creazione). 100 è un limite tecnico: il piano gratuito di Firebase regge 100 connessioni contemporanee per database.
- Silenzioso: ferma anche suoni personalizzati e voce del commento, il pulsante resta premuto (aria-pressed), la scelta resta salvata sulla TV ed è copiata in `meta/muted`; il telefono della regia la vede e la cambia.

**Stanza della TV (lobby)**
- Barra in alto: logo a sinistra, ora, codice, giocatori, pausa, timer, silenzioso, schermo intero, Fine serata, «Chiudi stanza» (con conferma). «Gioca anche tu», Ludoteca e «Nuova serata» sono negli Strumenti, ordinati per categoria.
- I partecipanti sono al centro: card che si adattano a 1–2, 3–4, 5–8, 9–12 e oltre (nessun posto fisso disegnato), posti liberi in una sola card discreta, stato collegato/non collegato. Posti previsti separati dal numero di collegati.
- Modalità Standard, Minimal e Informativa; checklist (con voci a scelta), «Sul tavolo stasera» e scaletta si accendono da Impostazioni › Partita e regia o dagli Strumenti (preferenza della regia, su quel dispositivo).
- Niente più parti tagliate in basso («Codice regia», «Inizia la serata») da 1366×768 a 3440×1440.

**Pagine**
- Home a tutta larghezza su monitor grandi, sidebar senza barra orizzontale, Armadi / Serate / Gruppi con la stessa struttura (titolo, descrizione, azione, numeri, card, aiuto a lato).
- Impostazioni a sezioni con indice (Generali, Aspetto e accessibilità, Consigli, Notifiche, Partita e regia, Privacy e dati, Aiuto e diagnostica); densità Compatta / Bilanciata / Spaziosa.
- Traguardi per categoria con percentuale e progressi; Profilo e app con il QR dei dispositivi in alto; finestra Scarica con il QR vicino all'inizio.
- Caratteri fluidi (17–22 px) e spazi a variabili per i monitor da 2048 a 3440 px e lo zoom al 125/150%.

## 2.3.0 · Sistema di design più leggibile, home riordinata, si elimina anche l'ultima serata (2 novembre 2026)

> **Le regole del database sono cambiate** (solo la presenza nella stanza): ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica**. Per l'app Android la release da pubblicare è `v2.3.0`.

**Perché 2.3.0 (MINOR)**: sistema di design rivisto su tutte le pagine, novità piccole ma nuove (notifica che si nasconde, «Come funziona» nella card «Crea una stanza») e una correzione; tutto retrocompatibile, nessun dato da convertire.

**Eliminare l'ultima serata**
- Si può eliminare anche l'ultima serata giocata (e quella ancora aperta sulla TV). Prima l'eliminazione riusciva, ma la TV teneva la copia locale come «serata interrotta» e «Riprendi» la ricreava nel database con voti e classifica.
- Ora l'eliminazione cancella anche le copie locali, il rientro nella serata e il codice regia su quel dispositivo; la TV riconosce una serata eliminata (anche da un altro dispositivo) e mostra «Serata eliminata» invece di «Ricrea la serata». Classifica di sempre, statistiche e «Le tue serate» si aggiornano come prima.
- Un telefono o una TV rimasti aperti non ricreano più la stanza eliminata con la loro presenza (regole del database).

**Leggibilità e contrasti**
- Avviso della versione («La versione 2.2.0 è appena uscita…») leggibile nella finestra «Scarica», nella scheda «App Android» e nella pagina di download: testo scuro su fondo chiaro con una barra colorata (prima arancione su lavanda, contrasto 1,4:1; ora 11,7:1). Stesso stile per gli altri stati (aggiornato, nuova versione, errore).
- Testi descrittivi e secondari più chiari su tutte le pagine (11,8:1 e 7,9:1 sulle card), anche nella card «Sostieni GameNight»; il pulsante Ko-fi tiene il suo rosso con il testo scuro (5,9:1; in bianco era 3:1). Controllo automatico axe-core (WCAG 2.2 A/AA) su home, profilo, download, telefono in serata e resoconto: da 7 problemi a 0.
- Caratteri: 17 px sul telefono e 18 px dal computer, descrizioni a 1rem, titoli che si adattano allo schermo senza diventare enormi.
- Focus da tastiera giallo con anello scuro, visibile su fondi chiari e scuri.

**Pulsanti, campi e spazi**
- Controlli normali alti almeno 48 px, azioni principali almeno 56 px, controlli compatti mai sotto i 44 px; stato disabilitato uguale per tutti.
- Spazi tra e dentro le card da una scala unica, che cresce un poco con lo schermo.

**Home**
- «Entra in una stanza»: campo del codice più chiaro della card con bordo visibile, «Entra» con bordo viola (secondaria, «Crea la stanza» resta la principale).
- «Crea una stanza»: i tre passaggi (crei la stanza, gli amici inquadrano il QR, votate) al posto dello spazio vuoto; pulsante più grande.
- «La tua collezione»: «I tuoi armadi» e «Le tue serate» affiancati a metà della card e alti uguali; quando la card è stretta (telefono, tablet) vanno uno sotto l'altro per non troncare i testi.
- «Risultati della serata» è una **notifica**: barra laterale, etichetta «Risultati pronti» / «Serata in corso» e pulsante ✕ per nasconderla (torna se cambia lo stato della serata).
- Card più ariose (profilo, gruppi); sul laptop la scheda «App Android» resta larga tutta la riga invece di essere schiacciata.
- «Profilo e app»: card a colonne, ognuna alta quanto il suo contenuto (niente più card mezze vuote).

## 2.2.0 · Lobby partita con la copertina protagonista, rivelazione dei voti a scelta, regia che gioca (2 novembre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** (nuovi `meta/manualReveal`, `armadi/…/viewers` e `armadi/…/blocked`). Per l'app Android la release da pubblicare è `v2.2.0`.

**Perché 2.2.0 (MINOR)**: funzioni nuove (rivelazione decisa dalla regia, «Gioca anche tu», chi vede l'armadio e rimozione dell'accesso) e un ridisegno di lobby e lobby partita, tutto retrocompatibile: stanze, voti, armadi e modelli di prima restano validi, i campi nuovi sono facoltativi.

**Lobby partita (la schermata "Gioco N" sulla TV)**
- La **copertina del gioco** è la protagonista: grande, intera (`object-fit: contain`, mai tagliata), con lo sfondo sfumato della stessa immagine. Le azioni della foto (file, telefono, link) sono pulsanti piccoli sotto la copertina.
- In alto il **nastro dei giochi** dell'armadio; a destra della copertina nome, chi gioca e chi ha vinto in una griglia ordinata.
- **Un'azione principale alla volta**: prima della partita «Inizia la partita», a partita iniziata «Apri la votazione» (l'altra resta disponibile, più discreta).
- **Classifica compatta** in una colonna stretta, con in cima la **barra delle azioni** (Intervallo, Tavolo, Scaletta, Quiz) e «Termina la serata» separato e in rosso (chiede conferma come prima). Sotto i 1100 px la classifica va sotto, sotto i 760 px la copertina va sopra al modulo.

**Lobby prepartita**
- Intestazione a gruppi: informazioni della stanza da una parte, azioni della regia dall'altra.
- Posti liberi come tessere piene e sobrie (non più tratteggiate con il "?"), giochi sul tavolo come pillole.
- **Checklist «Pronti?»**: pulsante «Nascondi» che la riduce a una riga; in Regia dello show › Profilo si sceglie *Completa*, *Una riga* o *Nascosta* (preferenza di quella TV).
- **Codice regia** in un riquadro con «Copia»; logo "Show" senza l'alone rosa; piede con avviso, armadio e «Inizia la serata» allineati.

**Votazione**
- Nuova impostazione in **Strumenti › Timer del voto**: «Rivela automaticamente i voti quando tutti hanno votato» (accesa di base, come prima). Spenta: quando tutti hanno votato la TV scrive «Tutti hanno votato · pronti per la rivelazione», il pulsante «Rivela i voti» pulsa e decide la regia. È salvata nella stanza (`meta/manualReveal`, solo la regia può cambiarla, anche nei modelli di serata) e vale subito, anche a votazione aperta.
- Conto di chi manca sulla TV («3 / 5 hanno votato · mancano 2 voti») e sul telefono dopo il voto («Tutti hanno votato: la regia svela i voti quando vuole»). I voti restano nascosti fino alla rivelazione.
- **Una sola rivelazione per gioco**: la TV ignora le richieste doppie (voti, cambio dell'impostazione e comando dal telefono della regia che arrivano insieme).

**La regia gioca anche lei**
- «🎮 Gioca anche tu» nell'intestazione della TV apre la pagina del giocatore in una finestra a parte sullo stesso PC: stesso account se collegato, un voto e le statistiche come tutti, mentre la regia resta nella sua scheda (sessioni separate dalla 2.0).

**Armadio**
- In Strumenti › Persone: **«Persone che possono visualizzare questo armadio»** (nome del profilo, account o dispositivo, da quando) e **«Rimuovi accesso»** con conferma. L'esclusione è nelle regole del database: chi è escluso non legge più giochi e informazioni nemmeno con il codice, non si registra di nuovo e, se era collaboratore, non rientra con la chiave. La pagina aperta mostra subito «Non hai più accesso». Il proprietario può riammettere.

**Home e resto del sito**
- Home su PC: una griglia sola (la riga collezione/gruppi e quella in basso seguono le colonne di quella in alto), banner «Risultati della serata» scuro con bordo giallo invece del blocco giallo, «Crea la stanza» azione principale e «Entra» secondaria, più spazio nelle schede.
- Testo base un po' più grande (3%, 6% sui computer) sulle pagine del sito; i testi più piccoli crescono un po' di più.
- **Icone**: le favicon mostrano il dado intero con gli angoli arrotondati (prima era tagliato); aggiunte le misure 16 e 96 px.

## 2.1.1 · Catalogo pubblico sempre aggiornato, controlli su GitHub più solidi (1 novembre 2026)

**Perché 2.1.1 (PATCH)**: una correzione e i controlli automatici, nessuna funzione nuova. Niente da cambiare in Firebase oltre a quanto chiesto dalla 2.1.0. La release dell'app Android da pubblicare è `v2.1.1` (comprende tutta la 2.1).

- **Armadio, catalogo pubblico**: una modifica fatta proprio mentre il catalogo si stava aggiornando da solo veniva considerata "già pubblicata" e il catalogo restava indietro finché non si cambiava di nuovo quel gioco. Ora la copia si calcola prima di scrivere, gli aggiornamenti vanno uno alla volta e, se nel frattempo è cambiato qualcosa, ne parte subito un altro.
- **Controlli su GitHub (Actions)**: server fissati su Ubuntu 24.04 e Playwright 1.63 (con "ubuntu-latest" passato a Ubuntu 26 l'installazione di Playwright 1.56 falliva); più tempo per le prove nel browser; se una prova fallisce, il motivo compare direttamente nel registro.
- **Prove nel browser**: niente Internet durante le prove, come sul computer di sviluppo (prima su GitHub la rete c'era e i risultati potevano cambiare); le prove dell'armadio aspettano il database invece di attese fisse; prove su Firefox e WebKit in un controllo a parte, da avviare a mano (Actions › "Altri browser").

## 2.1.0 · Tutte le idee del backlog: regia dello show, gruppo, armadio, integrazioni (1 novembre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica**. Per i promemoria nell'app Android serve la nuova APK (release `v2.1.0`).

**Perché 2.1.0 (MINOR)**: solo funzioni nuove e retrocompatibili sopra l'architettura della 2.0. I dati vecchi restano validi; i campi nuovi sono facoltativi. Stato delle 84 idee del backlog: 81 fatte, 3 possibili solo in parte (motivi in [TODO.md](TODO.md), l'unico elenco di cose da fare).

**Serata e TV**
- **Regia dello show** (Strumenti): *scene* per ogni momento (effetti pieni, tenui o spenti e la musica), *silenzio intelligente* (musica più bassa durante le regole, il voto o il commentatore, senza toccare "Silenzioso"), *cinque volumi* (voce, musica, effetti, segnali, atmosfere), *profili* di presentazione (famiglia, competitiva, party, minimal), *vista da lontano*, *tema della TV* (sfondo, colore, carattere, podio) con controllo dei contrasti, *pacchetti di atmosfera* (file JSON controllati, solo dati), *anteprima del reveal* con voti finti.
- **Imprevisti**: si scelgono quali possono uscire e una ruota gira prima di svelarli.
- **Domande per modalità di gioco** (cooperativo, party…): si fissano nel gioco quando parte il voto, così telefoni, reveal e resoconto usano le stesse.
- **Finale per verdetto** (trionfo, amato, divisivo, flop, tranquillo): animazione e suono diversi.
- **Classifica a squadre** dai punteggi del segnapunti.
- **Presenze**: chi gioca, chi guarda (spettatore per la serata: non si aspetta nel voto), chi è via, chi è arrivato dopo, chi aveva detto sì ma non c'è.
- **Limiti della serata** (durata massima, giochi al massimo, anche nei modelli): la TV avvisa e propone di chiudere.
- **Checklist "Pronti?"** in lobby: armadio, scaletta, regole, timer, limiti, giocatori.
- **Ospiti anonimi** a fine serata: diventano "Ospite N" anche nella stanza.
- **Consigliere**: confronto dei primi tre riga per riga.
- **Accessibilità del voto**: il lettore di schermo legge "7 su 10", annuncia l'invio; prova automatica con axe.

**Gruppo e dati**
- **Correggi il riassunto** di una serata chiusa (nome del gioco, durata) con motivo e cronologia: solo chi l'ha creata.
- **Controllo dello storico** (Controllo dei dati): errori di battitura, stesso gioco scritto in modi diversi, giochi rinominati, medie fuori scala.
- **Backup**: stato dell'ultimo backup del gruppo, promemoria, **ripristino selettivo** delle serate.
- **Conservazione**: scadenza delle foto dell'album (gruppo) e della cronologia dell'armadio.
- **Organizzatori**: chi gestisce i modelli di serata senza essere admin (link con chiave).
- **Prossima serata**: bacheca di note brevi e suggerimenti di giochi con il nome nascosto fino alla serata; **promemoria** (notifica nell'app Android, avviso nel browser).
- **Sfide fra gruppi**: solo numeri aggregati, con un codice, su consenso.
- **Centro avvisi** nella home (prestiti, prossime serate, aggiornamenti) con categorie spegnibili; sul telefono **"Da riprovare"** per gli invii falliti.

**Armadio e integrazioni**
- **Proposte di modifica** da chi non può modificare, approvate dal proprietario.
- **Collezione di BoardGameGeek**: importa i giochi posseduti (sola lettura, anteprima, i già presenti non si toccano). Proxy 1.2: `/collection`.
- **Cerca nel manuale**: ricerca nei PDF salvati sul dispositivo, con il numero di pagina (pdf.js, caricato a richiesta).
- **Discord**: "Copia per Discord" e invio con il webhook del canale (salvato solo sulla TV), anche a fine serata.
- **CSV per altri tracker**: una riga per giocatore con id BGG.
- **Configura la tua copia** (`setup.html`): dalla configurazione di Firebase a `config.js`, con i controlli di accesso, database e regole.
- **Demo senza Firebase**: TV e telefono in due schede dello stesso browser, dati solo lì.

**Tecniche**
- Moduli nuovi: `tv-show.js` (collegato), `night-fix.js`, `history-check.js`, `challenge.js`, `next-board.js`, `reminders.js`, `notices.js`, `discord.js`, `trackers.js`, `arm-proposals.js`, `manual-search.js`, `demo-db.js`, `setup.js`; `vendor/pdfjs` (pdf.js 4.10.38).
- `fb.js` sceglie il backend all'avvio (SDK vero o demo) con un `import()` dinamico; `report.js` e `tv-extras.js` caricano PDF e video solo quando servono.
- `sounds.js`: bus per voce, segnali e atmosfere; abbassamento con più motivi. `fx.js`: quantità di effetti per scena. `atmo.js`: scena "pack".
- Regole: `nights/$room/games/*` e `fixes` (creatore), `groupOrgKeys`, `groupOrgKeyClaims`, `groups/$gid/organizers`, `templates` per gli organizzatori, `armadi/$aid/proposals`, `challenges`, `next/board`, `next/sugg`, `identity/theme`, `privacy/photosDays`, eliminazione delle foto da parte di proprietario/admin, `info/keepLogDays`, `meta/chaosOff|chaosWheel|maxMinutes|maxGames`, `templates/*/s/maxMinutes|maxGames`.
- Android: plugin `@capacitor/local-notifications` 8.3.1 e permesso `POST_NOTIFICATIONS`.
- **Regia divisa in moduli** (idea 76): `tv-screens.js` (tra un gioco e l'altro, classifica, premiazione, sondaggio, Di sempre) e `tv-panels.js` (armadio della serata, esportazioni, modelli, scheda del gioco, album); `host.js` da 7.400 a 5.400 righe.
- **Cronologia del gruppo** (Di sempre › Analisi › Cronologia): prima serata, traguardi, nuovi arrivati, giochi ripresi dopo mesi, record e cambi del più amato.
- Ritmo del reveal per scena (lento, normale, veloce); pacchetti di atmosfera con immagine di sfondo; **domande per modalità** anche nelle analisi (Di sempre › Analisi › Gusti); collezione BGG completata subito con giocatori, durata e peso.
- Documenti: `IDEAS`, `AUDIT`, `VERIFICA` e `MASS_IMPLEMENTATION_PROGRESS` riuniti in **`TODO.md`** (cosa manca, configurazioni, prove a mano, limiti, e le tue voci).
- Prove: regole 391 (erano 354), unitarie 104 (erano 88), proxy 15, nel browser nuova `show21`.

## 2.0.0 · Account permanenti, rientro solido, voti dopo la votazione (1 novembre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md#23-regole-del-database)). Per gli account attiva anche **Google** ed **Email/password** in Authentication ([passo 2.4.1](docs/INSTALLAZIONE.md#241-account-permanenti-google-ed-email-20-facoltativo-ma-consigliato)). Aggiorna insieme TV e telefoni.

**Perché 2.0.0 (MAJOR)**: cambia l'architettura delle identità. La regia TV usa ora una sessione Firebase separata da quella del giocatore (uid diversi anche sullo stesso dispositivo), nascono gli account permanenti (`accounts/<uid>`) e il passaggio di identità durante una serata. Le serate e i dati vecchi restano validi, ma una TV 1.x e un telefono 2.0 nella stessa serata non si capiscono su rientro e voti tardivi.

**Novità visibili**
- **Account permanente** (Home › riquadro **Account**): Google o email e password. Il profilo del dispositivo diventa quello dell'account senza perdere niente (statistiche, voti, premi, gruppi, avatar); su un altro telefono, computer o nell'app si ritrova tutto. Gli ospiti continuano senza account. Mai unioni per nome.
- **Rientro nelle stanze**: chiudere il browser o l'app non vuol dire uscire; si rientra al proprio posto dallo stesso link, dal QR (anche quelli vecchi) o dalla Home. Se lo stesso account entra da un altro dispositivo, quello vecchio lo dice ("Stai giocando da un altro dispositivo") invece di creare un doppione.
- **QR e app**: su Android il sito propone "Apri nell'app" (link `gamenight://`), l'app apre direttamente la stanza.
- **Regia separata dal giocatore**: TV e telefono regia hanno la loro sessione; chi ospita può anche giocare dallo stesso account senza confondere permessi. Se la TV si chiude, la regia si riprende da sola alla riapertura.
- **Voti dopo la votazione** (TV, dopo il reveal o dalla classifica › **Voti mancanti**): a chi non aveva votato si apre il voto sul telefono (o si vota dalla TV); a chi aveva votato si può permettere di cambiarlo. Medie, classifica e riassunto si aggiornano; il reveal mostra quanti voti sono arrivati o cambiati dopo; un registro dice chi, quando e cosa. I voti restano segreti.
- **Scelta dei giochi sulla TV**: ricerca, filtri (sul tavolo, brevi, lunghi, mai giocati, preferiti), ordinamento (consigliati, nome, durata, voto, da più tempo fermi), dettagli rapidi con ⓘ, conteggio dei giochi adatti ai giocatori presenti.
- **Foto delle scatole non più tagliate** nel riquadro del gioco sulla TV (immagine intera con lo sfondo sfumato della stessa foto).
- **Home su computer**: due colonne fino a 1400 px e tre oltre, testi leggibili, niente colonne schiacciate. Il telefono non cambia.
- **Nomi dei file esportati**: `GameNight_Gruppo_2026-10-31_Resoconto.pdf` (gruppo, data della serata, tipo), mai sovrascritti (`_2`, `_3`…). Vale per PDF, immagini, CSV, JSON, calendario, backup, etichette.
- **Meno consigli**: uno alla volta, ognuno con un numero massimo di volte e la ✕ per non vederlo più; nelle impostazioni "tutti / pochi / nessuno" e categorie spegnibili. Il Consigliere mostra le sezioni principali e il resto sotto "Mostra altri consigli".
- **BoardGameGeek**: oltre a giocatori, durata, peso e categorie anche **editore** (con conferma se diverso), **autori, età, voto e posizione su BGG, meccaniche** nella scheda del gioco, con il link alla descrizione su BGG.

**Correzioni**
- Dopo un cambio di account il dispositivo usava ancora l'uid vecchio (`connect()` lo teneva in memoria).
- Il riquadro del gioco sulla TV tagliava le foto verticali (l'immagine usciva dal riquadro).
- Telefono riaperto dopo un cambio di dispositivo: ora mostra la schermata "altro dispositivo" invece di rientrare come un nuovo giocatore.
- Accessori stagionali: sui telefoni comparivano solo alla schermata successiva.
- Il passaggio della regia con il QR chiede conferma (un vecchio link non toglie la regia alla TV).

**Tecniche**
- Nuovi moduli: `account.js` (account e passaggio di identità), `tv-votes.js` (voti dopo la votazione), `tips.js` (consigli). `fb.js`: sessioni `player`/`regia`, Google, email, collegamento dell'account. `vendor/firebase.js` ricostruito con auth Google/email.
- Regole: `accounts/<uid>`, `rooms/$code/handover`, `late`, `votelog`, voti tardivi e modifiche autorizzate in `votes`, `players/<uid>/pid|watch`, `armadi/.../library/$item/bggInfo`.
- Proxy BGG 1.1: autori, editori, posizione su BGG (la descrizione resta esclusa per i termini d'uso). Il token resta solo nel Worker.
- Bozza non collegata: `wip/tv-show.js` (regia dello show); regole pure in `js/show.js`, provate.
- Prove: regole 354 casi (erano 325), unitarie 88 (erano 71), proxy BGG 14, nel browser 41/41 (nuova `identity20`).

## 1.12.0 · Statistiche che dicono quanto sono affidabili, tradizioni e premi del gruppo (24 ottobre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md#23-regole-del-database)). Senza, premi del gruppo, regole della casa, tradizioni dei modelli e accessori stagionali vengono rifiutati.

Fase 3 di il backlog delle idee (ora [TODO.md](TODO.md)) (statistiche e memoria): idee 8, 23, 24, 25, 37, 39, 41, 44, 45, 46, 47, 48, 49, 50, 60, 68, 71.

**Novità visibili**
- **Analisi** (TV › Di sempre › Analisi): *tendenze* (i giochi che piacciono sempre di più o di meno, solo con abbastanza serate e voti), *un gioco nel tempo* (serata per serata, con grafico, voti, giocatori e durata), *stagioni a confronto* (con l'avviso se una ha molte più serate dell'altra), *riepilogo* di un mese, una stagione o un anno, *abitudini* (giorni × mesi), *gusti* del gruppo per modalità, peso e durata, *collezione* (più giocati, amati, polverosi, mai giocati), *esporta* in CSV o JSON con filtri (date, gioco) e nomi sostituiti da P1, P2… se non si sceglie altrimenti.
- **Ogni numero dice quanto è affidabile**: "pochi dati" sotto i 3 voti, "dati discreti" fino a 7, "dati solidi" da 8. Anche nella classifica di sempre.
- **Premi del gruppo** a fine serata (Premiazione › Premio del gruppo): un nome, un simbolo e la persona. Compaiono nella premiazione, nel resoconto, nel PDF e nella scheda **Tradizioni** con chi li ha vinti più spesso. Mai agli ospiti.
- **Tradizioni nei modelli di serata**: *gioco d'apertura* (proposto per primo quando la serata non ha ancora giochi) e *premio ricorrente* (già pronto nei premi del gruppo).
- **Regole della casa** (Di sempre › Tradizioni): varianti e usanze in una frase, per un gioco o per tutte le serate; si vedono quando si scrive il nome del gioco e nella spiegazione delle regole.
- **Racconto della serata** nel resoconto e nel PDF: poche frasi costruite solo dai dati veri (più amato, più divisivo, partita più lunga, chi ha vinto…), con la scelta di includere o no i commenti dei giocatori.
- **Accessori stagionali** sugli avatar (Strumenti): un piccolo simbolo a Natale, Capodanno, San Valentino, Carnevale, Pasqua, Halloween e d'estate; spenti di base, solo decorativi.
- La scheda di un gioco (TV) e la ludoteca mostrano **lo stesso gioco serata per serata** e la durata dichiarata accanto a quella vera.
- **Hall of Fame**: ogni record dice come è calcolato.
- **I tuoi dati › Esporta**: nuova voce **Le mie statistiche**, solo i tuoi voti, vittorie e MVP in ogni gruppo, senza i dati degli altri.

**Tecniche**
- Nuovi moduli `insights.js` (analisi, funzioni pure), `traditions.js` (regole della casa, accessori stagionali, data della Pasqua), `tv-memory.js` (pagine della TV).
- Il riassunto della serata nel gruppo conserva modalità e peso del gioco (dall'armadio) e i premi del gruppo (`custom`).
- Regole: `rooms/$code/customAwards`, `meta/opening`, `meta/award`, `meta/seasonal`, `groups/$gid/house`, tradizioni nei `templates`.
- Prove: regole 325 casi (erano 301), unitarie 71 (erano 56), nel browser `memory18` (40 in tutto).

## 1.11.0 · Telefono sistemato, serate protette, codice a barre, modelli e modalità pubblico (24 ottobre 2026)

> **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md#23-regole-del-database)). Senza, eliminazione delle serate, modelli, ospiti e modalità pubblico vengono rifiutati. Conviene aggiornare insieme TV e telefoni.

Fasi 1 e 2 del nuovo backlog (il backlog delle idee (ora [TODO.md](TODO.md)): 84 idee verificate sul codice, con stato, priorità e roadmap).

**Novità visibili**
- **Eliminare una serata** (dal resoconto): solo chi l'ha creata, anche da un altro dispositivo dello stesso profilo personale; gli altri master e i giocatori no, neanche chiamando il database direttamente. Si cancellano insieme stanza, riassunto nel gruppo, album ed elenco: niente dati orfani, classifiche e statistiche si ricalcolano da sole. Conferma scrivendo il codice della stanza.
- **Codice a barre** nell'armadio e nella ludoteca dal telefono: fotocamera (dove il browser la supporta) o cifre a mano, con controllo della cifra di controllo. Ritrova un gioco già presente; altrimenti cerca su BoardGameGeek per nome (BGG non cerca per codice) e, una volta confermata la scheda, ricorda l'abbinamento su quel dispositivo per la prossima scatola uguale. Nessun campo sovrascritto senza conferma.
- **Modelli di serata** (Strumenti › Modelli e serate precedenti): salva domande, Chaos, timer del voto, reveal automatico, atmosfera, musica e posti; li trovano tutte le TV del gruppo. **Riparti da una serata precedente**: impostazioni e giochi di quella sera nella scaletta, mai voti o giocatori. Prima di applicare si vede che cosa cambia.
- **Modalità pubblico** della TV (tasto V, Strumenti o telefono regia): spariscono comandi e moduli, restano gioco, timer, risultati e codice della stanza; tra un gioco e l'altro lo schermo ambiente.
- **Comandi rapidi** nella barra della TV: fino a 5 a scelta (pausa, svela, avanti, timer, silenzioso, ambiente, pubblico, intervallo, controllo), attivi solo quando hanno senso.
- **Ospiti**: "Partecipo come ospite" all'ingresso. Il voto conta per i giochi, ma nel gruppo non resta niente della persona (solo quanti ospiti c'erano).
- **Scaletta che avvisa dei ritardi**: se la serata slitta propone quali giochi togliere (prima i meno desiderati); non toglie niente da sola.

**Correzioni**
- **Impostazioni sul telefono**: Lingua e Tema a volte invisibili (schiacciati dalla finestra), "Automatico" tagliato, caselle piccole, avviso stretto; dopo il cambio di lingua si resta nel profilo.
- **Classifica, reveal e premiazione sul telefono** a 360 px: nomi su due righe invece che troncati, intestazione senza tagli, il proprio voto visibile senza scorrere. Pagina **resoconto**: intestazione, nomi lunghi, pulsanti dei voti più comodi.
- TV: **Esc** chiude le finestre anche con il cursore in un campo; la fine prevista della scaletta non conta più i giochi già giocati.
- Il motivo del **time-out** e gli **eventi Chaos** si salvano come codici: ogni schermo li mostra nella sua lingua.
- La pulizia automatica delle stanze vecchie cancella solo quelle create da quella TV.

**Tecniche**
- Nuovi moduli `nights.js`, `barcode.js`, `templates.js`; regole per `creatorUid/creatorPid`, `templates`, `guest`, `publicTv`.
- Prove: regole 301 casi (erano 266), unitarie 56 (erano 51), nel browser `mobile17`, `delete17`, `barcode17`, `phase17` (39 in tutto).
- Documenti: backlog e roadmap, stato verificato e registro dei bug (dalla 2.1 riuniti in `TODO.md`).

## 1.10.0 · Tutta in due lingue, pausa e timer condiviso, armadio completo, i tuoi dati (24 ottobre 2026)

> Raccoglie in un solo ciclo i piani 1.6 → 1.10 . **Le regole del database sono cambiate**: ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md#23-regole-del-database), passo 2.3). Il file delle regole ora sta nella cartella `firebase/`.
>
> Conviene aggiornare insieme TV e telefoni: pausa, timer condiviso, schermo ambiente e suoni personalizzati usano nodi nuovi della stanza.

**1.6 · Lo stesso stile ovunque**
- Il sistema di design della home (colori, caratteri, angoli, bordi sottili, ombre morbide, temi Show e Giorno, alto contrasto) vale ora anche per telefono, armadio, ludoteca, resoconto, download e tavolo di verifica. La TV resta il palcoscenico, con gli stessi colori e caratteri.
- Telecomando e tastiera: con le frecce il fuoco si sposta tra pulsanti e campi (anche nelle finestre aperte), sempre ben visibile.

**1.7 · Tutta l'app in italiano e inglese**
- Tradotti TV, armadio, resoconto, tavolo di verifica, pannelli extra del telefono, pre-partita, soundboard, atmosfere, musica, tutorial e messaggi comuni. Plurali, date e numeri nella lingua scelta.
- Dizionari divisi per area (`js/lang/it-*.js`, `en-*.js`); `tests/check.mjs` controlla parità, parametri, chiavi usate e doppioni, e lo scanner `tests/i18n-scan.mjs` blocca i testi italiani rimasti scritti nel codice.
- Limite noto: le domande del quiz sono scritte nella lingua della TV.

**1.8 · BoardGameGeek, manuali, Consigliere**
- **BoardGameGeek** dall'armadio: ricerca, anteprima della scheda, confronto campo per campo prima di applicare (niente sovrascritture senza conferma). Funziona appena il proxy `bgg-proxy/` è attivo e il suo indirizzo è in `js/services.js`; senza proxy lo dice chiaramente e resta l'importazione del CSV.
- **Manuali in tre modi gratuiti:** link (BGG, sito dell'editore), file PDF o foto salvato **solo sul dispositivo**, ricerca guidata del regolamento. QR del manuale sulla scheda delle regole della TV.
- **Consigliere** rinnovato: filtri per tempo, peso e modalità, giochi preferiti, giochi già sul tavolo, motivo di ogni consiglio.
- **Preferiti** del profilo: cuore sui giochi, filtro e ordinamento nell'armadio, prima nella lista dei giochi di stasera.

**1.9 · I tuoi dati e l'armadio**
- **I tuoi dati e la privacy** (home): esportazione in un file JSON versionato (`gamenight-export` v2, [docs/DATI.md](docs/DATI.md)), **importazione guidata** con anteprima, conteggi e scelte (armadio nuovo o esistente, solo i mancanti o completa i campi vuoti), mai sovrascritture silenziose, armadio nuovo scritto tutto o niente.
- **Centro privacy:** cosa sta dove, spegnere un catalogo pubblico, cancellare il profilo, svuotare il dispositivo.
- **Diagnostica:** versione e aggiornamenti, rete, Firebase, accesso anonimo, regole pubblicate, file offline, spazio, BoardGameGeek, app, registro errori, profilo e lingua, con un rapporto da scaricare (senza codici e chiavi).
- **Prestiti scaduti e in scadenza:** avviso nella home, rimandabile.
- **Catalogo pubblico** (`pub/<token>`): scegli i campi (posizione, stato, durata, regole/manuale, solo disponibili), anteprima, apri, copia, revoca.
- **Ritaglio delle foto** dei giochi, anche da tastiera.

**1.10 · Show**
- **Pausa della serata** (TV, tasto P, o dalla regia del telefono): ferma votazione, quiz e timer; tutti lo vedono.
- **Timer condiviso** (turno, round, intervallo, libero): sulla TV e su tutti i telefoni, comandato dalla TV e dai telefoni regia. Niente scritture al secondo: si salva solo l'istante di fine, con revisione controllata dalle regole; la scadenza suona una volta sola.
- **Schermo ambiente** (tasto A o dal telefono regia): gioco in corso, giocatori, timer e orologio tra una partita e l'altra.
- **Soundboard personalizzata:** fino a 16 suoni caricati sulla TV (restano solo lì: su Firebase vanno solo nomi e icone), che i telefoni possono far partire.
- **Atmosfere** con intensità e suono generato dal browser (pioggia, candele, neon, stelle, nebbia).
- **Il vostro anno:** riepilogo dell'anno del gruppo, giochi più votati e scoperti, immagine da condividere, anche dal telefono.
- **Android TV:** la stessa APK compare tra le app del televisore (banner, Leanback) e si usa con il telecomando.

**App Android: esportazioni**
- **PDF veri** (testo selezionabile, foto dell'album) per il PDF della serata, il resoconto e le etichette con QR dell'armadio: si salvano in Documenti/GameNight Show e si aprono con il lettore del telefono. Prima l'app salvava una pagina HTML.
- I manuali salvati sul dispositivo si aprono con il lettore del telefono; nel browser non scaricano più il file due volte.

**Progetto**
- README snellito; guide separate: `docs/INSTALLAZIONE.md`, `docs/ANDROID.md`, `docs/SVILUPPO.md`, `docs/DATI.md`.
- Radice più pulita: `database.rules.json` → `firebase/`, `VERIFICA.md` → `docs/`, `CONTRIBUTING.md` e `SECURITY.md` → `.github/`; tolta un'immagine non usata.
- Prove nuove: `tests/nightclock.test.mjs`, `tests/features.test.mjs`, `tests/pdf.test.mjs`, regole del database per i nodi nuovi, e nel browser `night16.py` (pausa, timer, ambiente), `data16.py` (dati, privacy, catalogo, BGG, manuali) ed `exports16.py` (esportazioni dall'app Android).

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
- **Repository più completo:** licenza **MIT** (`LICENSE`), `CONTRIBUTING.md`, `SECURITY.md` (segnalazioni di sicurezza in privato), pulsante **Sponsor** di GitHub verso Ko-fi (`.github/FUNDING.yml`), modello per le pull request, `.gitattributes` (fine riga uniformi, librerie escluse dalle statistiche) ed `.editorconfig`, immagine di anteprima per i link (`assets/brand/social-preview.png`).
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
- **Documenti:** `docs/PRIVACY.md` (dove finisce ogni dato), `tests/README.md`.
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
