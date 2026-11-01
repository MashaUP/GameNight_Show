# Dati e privacy in GameNight Show

GameNight Show è gratuito, senza pubblicità e senza strumenti di tracciamento. Non ci sono account con email o password: ogni dispositivo entra in Firebase con un **accesso anonimo** (un identificativo casuale).

Questo documento elenca dove finisce ogni dato. Va aggiornato insieme al codice.

## 1. Sul dispositivo (memoria del browser o dell'app)

Restano solo su quel telefono, tablet o computer, finché non si cancellano i dati del sito o dell'app.

| Cosa | Dove | Note |
|---|---|---|
| Preferenze: lingua, tema, accessibilità, volumi, modalità leggera | `localStorage` (`gnr_lang`, `gnr_theme`, `gnr_a11y`, `gnr_vol_*`, `gnr_lite`…) | Valgono per quel dispositivo |
| Collegamento al profilo personale (codice e chiave) | `localStorage` (`gnr_person`, `gnr_person_cache`) | La chiave è come una password: non viene mai mostrata ad altri |
| Ultime stanze, serate aperte, armadi recenti | `localStorage` (`gnr_room`, `gnr_host_room`, `gnr_history`, `gnr_armadi`) | Per le scorciatoie della home |
| Copie di sicurezza della serata (sulla TV) | `localStorage` (`gnr_vault`) | Salvataggi a rotazione per riprendere dopo un crash |
| Registro degli errori | `localStorage` (`gnr_errlog`) | Ultimi 150 errori, solo su richiesta dell'utente viene scaricato |
| Informazioni sull'ultima versione pubblicata | `localStorage` (`gnr_release`) | Copia di 6 ore per non interrogare GitHub a ogni pagina |
| Link ufficiali (GitHub, Discord, Ko-fi…) | `localStorage` (`gnr_links`) | Ultima copia valida di `config/links.json`, per l'uso offline (nessun dato personale) |
| Giochi preferiti (copia locale) | `localStorage` (`gnr_favs`) | Se c'è un profilo personale vanno anche nel profilo (sotto) |
| Manuali salvati sul dispositivo (PDF o foto) | IndexedDB `gnr_manuals` | **Solo su questo dispositivo**: non vanno mai su Firebase |
| Suoni personalizzati della soundboard (file audio) | IndexedDB `gnr_sounds` (computer della TV) | **Solo sulla TV**: su Firebase vanno solo nome e icona |
| Avviso dei prestiti rimandato | `localStorage` (`gnr_loan_snooze`) | Solo la data fino a cui non mostrarlo |
| Scadenze del timer già suonate | `sessionStorage` (`gnr_timer_fired`) | Per non suonare due volte la stessa scadenza; si cancella chiudendo la scheda |
| Abbinamenti codice a barre → scheda di BoardGameGeek | `localStorage` (`gnr_ean_map`) | Solo codice, numero di BGG e nome del gioco; al massimo 300 |
| Comandi rapidi scelti, modelli di serata senza gruppo | `localStorage` (`gnr_quick`, `gnr_templates`) | Solo sulla TV |

## 2. Su Firebase (Realtime Database del progetto)

Leggibili solo secondo le regole di `firebase/database.rules.json`.

| Cosa | Chi lo vede |
|---|---|
| Stanza della serata: nomi scelti dai giocatori, personaggio, foto facoltativa, voti, punteggi, commenti | Chi conosce il codice della stanza (chi è alla serata) |
| Profilo personale (nome, personaggio, foto facoltativa, motto, gruppi e armadi collegati) | Solo i dispositivi collegati al profilo |
| Gruppo: nome, storico delle serate, foto ricordo | I membri; lo storico può essere reso privato dal proprietario |
| Armadio dei giochi: giochi, foto, posizioni, prestiti (con il nome di chi ha il gioco) | Proprietario e collaboratori; prestiti, cronologia e cestino solo a loro |
| Catalogo pubblico dell'armadio (`pub/<token>`) | Chiunque abbia il link, **solo se il proprietario lo attiva**, con i soli campi scelti (posizione, stato, durata, regole e manuale, solo disponibili); mai prestiti, nomi di chi ha un gioco o chiavi |
| Codice regia della stanza | Nessuno può leggerlo (si può solo scrivere) |
| Pausa, timer condiviso, schermo ambiente, elenco dei suoni personalizzati (solo nome e icona), intensità e suono dell'atmosfera | Chi conosce il codice della stanza; li scrivono solo la TV (e, per il timer, i telefoni regia) |
| Giochi preferiti del profilo (`people/<id>/favs`: armadio, gioco, data) | Solo i dispositivi collegati al profilo |
| Ospiti (`players/<uid>/guest`) | Come il resto della stanza; nel riassunto del gruppo resta solo il numero degli ospiti, nessun nome o voto personale |
| Chi ha creato la serata (`meta/creatorUid`, `creatorPid`, copiati nel riassunto) | Come la stanza e il gruppo; serve alle regole per lasciare eliminare la serata solo al creatore |
| Modelli di serata (`groups/<id>/templates`) | Chi è collegato; li scrivono proprietario e admin. Solo impostazioni, mai codici o identificativi |
| Premi del gruppo (`rooms/<codice>/customAwards`, poi `custom` nel riassunto: nome del premio e della persona) | Come la stanza e il gruppo; li assegna solo la regia, mai agli ospiti |
| Regole della casa (`groups/<id>/house`: una frase, eventualmente il nome di un gioco) | Come lo storico del gruppo (privato se lo storico è privato) |
| Modalità e peso del gioco nel riassunto della serata (1.12) | Come lo storico del gruppo; sono dati del gioco, non delle persone |
| Link al manuale di un gioco (`manual` nella scheda) | Come il resto dell'armadio; nel catalogo pubblico solo se si sceglie "regole e manuale" |
| Account (2.0, `accounts/<uid>`: solo il numero del profilo e la sua chiave) | Solo la persona stessa. Email e nome dell'account li conserva Firebase Authentication (Google), non il database; l'app mostra l'email solo sul dispositivo collegato |
| Voti dopo la votazione (2.0: `rooms/<codice>/late` e `votelog`: gioco, giocatore, tipo di operazione, ora) | Come la stanza; mai il valore del voto nel registro. Li scrive la regia (e il giocatore solo per il proprio voto) |
| Passaggio di identità (2.0, `rooms/<codice>/handover/<uid>`: un gettone casuale) | Come la stanza; dura finché la TV sposta il posto, poi si cancella |
| Informazioni di BoardGameGeek nella scheda (2.0, `bggInfo`: autori, età, voto e posizione su BGG) | Come il resto dell'armadio; sono dati del gioco |
| Note e suggerimenti della prossima serata (2.1, `next/board`, `next/sugg`: testo breve, nome, chiave della persona) | I dispositivi del gruppo. Nei suggerimenti il nome si vede dall'inizio della serata: non è anonimato assoluto (il database sa chi li ha scritti) |
| Sfide fra gruppi (2.1, `challenges/<codice>`: solo totali — serate, giochi, voti, media, gioco più amato) | Chi conosce il codice. Mai nomi di persone, voti singoli, commenti o foto; si tolgono uscendo dalla sfida |
| Proposte di modifica dell'armadio (2.1: il nome di chi propone e il motivo) | Proprietario e collaboratori dell'armadio |
| Correzioni dei riassunti (2.1, `fixes`: cosa è cambiato e perché) | Come lo storico del gruppo |

I dati delle serate restano nel database finché il proprietario del gruppo o della stanza non li cancella; le stanze vuote si possono eliminare dopo 24 ore.

Solo sul dispositivo (2.1): webhook di Discord (`gnr_discord_hook`, è una specie di password: mai nel database o nei backup), promemoria, avvisi letti, preferenze della regia dello show, pacchetti di atmosfera, database della demo (`gnr_demo_db`, cancellato uscendo dalla demo), testo dei manuali letto per la ricerca (solo in memoria).

## 3. Servizi esterni

| Servizio | Quando | Cosa riceve |
|---|---|---|
| GitHub (API pubblica delle Releases) | Controllo degli aggiornamenti dell'app | Nessun dato personale: solo la richiesta dell'ultima release pubblicata |
| GitHub Pages | Apertura del sito | Le normali informazioni di una richiesta web |
| GitHub Pages (`config/links.json`) | App Android: al massimo ogni 6 ore, o con "Cerca aggiornamento" | Solo la richiesta del file dei link, **senza cookie né dati della serata** |
| GitHub, Discord | Solo se si tocca la loro icona o un link di "Community e supporto" | Quello che l'utente sceglie di fare su quei siti |
| Proxy BoardGameGeek (Cloudflare Worker, se configurato) | Ricerca di un gioco su BGG | Solo il testo cercato o il numero del gioco su BGG. **Nessun nome, profilo o dato della serata** |
| Ko-fi | Solo se si tocca il pulsante delle donazioni | Quello che l'utente sceglie di inserire su Ko-fi |

Non vengono usati: pubblicità, statistiche di utilizzo, cookie di terze parti, servizi di intelligenza artificiale.

## 4. Esportare, controllare e cancellare i dati

**Statistiche del gruppo (1.12, TV › Analisi › Esporta):** di base i nomi diventano P1, P2…; i nomi veri solo
spuntando la casella. **Le mie statistiche** (I tuoi dati › Esporta) contiene solo i dati di chi esporta. L'analisi
delle abitudini usa solo date e orari delle serate.

Tutto da **home › Profilo e app › I tuoi dati e la privacy**:

- **Esporta** profilo (solo l'aspetto), preferiti, armadi, prestiti e gruppi in un file JSON. Nel file non vanno mai chiavi, codice regia, identificativi dei dispositivi, token del catalogo pubblico o configurazione di Firebase ([DATI.md](DATI.md)).
- **Privacy:** elenco di cosa sta dove, spegnimento dei cataloghi pubblici, **cancellazione del profilo** (un solo aggiornamento: profilo, dispositivi e collegamenti a gruppi e armadi), **svuota questo dispositivo** (preferenze, copie, manuali e suoni locali; serve scrivere la parola di conferma).
- **Centro diagnostico:** il rapporto scaricabile toglie codici e chiavi dai percorsi (`rooms/…`, `armadi/…`).

Altri modi:

- **Da questo dispositivo:** cancellare i dati del sito nel browser o, nell'app, "Cancella dati" nelle impostazioni di Android.
- **Dal profilo:** "Il tuo profilo › Dispositivi › Scollega questo dispositivo".
- **Una serata:** dal resoconto, **Elimina la serata** (solo chi l'ha creata): stanza, voti, riassunto, album ed elenco insieme.
- **Dal database:** il proprietario di un gruppo o di un armadio può cancellarne i contenuti dalle rispettive pagine; chi gestisce il progetto Firebase può cancellare qualsiasi nodo dalla console.
