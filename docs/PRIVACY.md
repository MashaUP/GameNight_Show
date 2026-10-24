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
| Link al manuale di un gioco (`manual` nella scheda) | Come il resto dell'armadio; nel catalogo pubblico solo se si sceglie "regole e manuale" |

I dati delle serate restano nel database finché il proprietario del gruppo o della stanza non li cancella; le stanze vuote si possono eliminare dopo 24 ore.

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

Tutto da **home › Profilo e app › I tuoi dati e la privacy**:

- **Esporta** profilo (solo l'aspetto), preferiti, armadi, prestiti e gruppi in un file JSON. Nel file non vanno mai chiavi, codice regia, identificativi dei dispositivi, token del catalogo pubblico o configurazione di Firebase ([DATI.md](DATI.md)).
- **Privacy:** elenco di cosa sta dove, spegnimento dei cataloghi pubblici, **cancellazione del profilo** (un solo aggiornamento: profilo, dispositivi e collegamenti a gruppi e armadi), **svuota questo dispositivo** (preferenze, copie, manuali e suoni locali; serve scrivere la parola di conferma).
- **Centro diagnostico:** il rapporto scaricabile toglie codici e chiavi dai percorsi (`rooms/…`, `armadi/…`).

Altri modi:

- **Da questo dispositivo:** cancellare i dati del sito nel browser o, nell'app, "Cancella dati" nelle impostazioni di Android.
- **Dal profilo:** "Il tuo profilo › Dispositivi › Scollega questo dispositivo".
- **Dal database:** il proprietario di un gruppo o di un armadio può cancellarne i contenuti dalle rispettive pagine; chi gestisce il progetto Firebase può cancellare qualsiasi nodo dalla console.
