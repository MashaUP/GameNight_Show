# GameNight Show

Web app per le serate di party game da tavolo. Ognuno vota i giochi dal proprio telefono, la TV svela i voti con le carte che si girano, tiene la classifica e a fine serata fa la premiazione.

Versione 1.0.0

> **Importante:** a ogni nuova versione ricopia `database.rules.json` in Firebase (passo 2.3) e pubblica: molte funzioni dipendono dalle regole del database.

## Come funziona

- **TV (portatile collegato alla TV):** apre `host.html`, crea la stanza scegliendo quanti giocatori siete e guida la serata.
- **Telefoni:** inquadrano il QR sulla TV, scelgono nome, personaggio e colore, e votano.
- **Dopo ogni partita** l'host scrive il nome del gioco (con una foto, se vuole) e apre la votazione. Ognuno dà:
  - un **voto generale** da 1 a 10, l'unico che conta per la classifica;
  - **Coinvolgimento**, **Semplicità** e **Rigiocabilità** da 1 a 5;
  - l'**MVP** della partita, scelto tra gli altri giocatori.
- **Il numero di giocatori può cambiare durante la serata**: si può essere in 6 il pomeriggio e in 8 la sera. Chi arriva entra con il QR in qualsiasi momento, chi va via esce senza perdere i voti già dati.
- **I voti restano segreti** finché la TV non li svela. Quando hanno votato tutti, il reveal parte da solo dopo 2 secondi; l'host può anche svelarli prima.
- **L’armadio dei giochi** è indipendente: i giochi che avete, con la foto, da caricare prima della serata; ogni stanza sceglie quale armadio consultare.
- **Ogni serata appartiene a un gruppo** (es. "Amici del giovedì"), che conserva da una volta all'altra:
  - la **classifica di sempre**: medie su tutte le serate, MVP di sempre e giochi più giocati.
- **Cosa giochiamo adesso?** Tra un gioco e l'altro i telefoni votano il prossimo gioco tra quelli dell’armadio non ancora giocati e adatti a quanti siete in quel momento (ogni gioco può avere numero di giocatori e durata).
- **Chi ha vinto?** Prima di aprire la votazione la TV segna chi ha vinto la partita. Ne escono il premio "il più vincente" e la classifica di chi vince di più nel gruppo.
- **Chi è connesso:** se il telefono di qualcuno si spegne o perde il wifi, la TV lo segnala. Sul telefono compare un avviso finché la connessione non torna.
- **Sicurezza in caso di crash:** il voto che si sta compilando resta salvato sul telefono; durante la votazione la TV aspetta fino a 60 secondi chi si è scollegato; e chi deve cambiare telefono può rientrare al proprio posto, con voti, vittorie e MVP.
- **Il PC può cadere:** la TV chiede conferma prima di chiudersi, ritrova il lavoro a metà dopo un ricaricamento, e con il **codice regia** la serata si riprende da un altro computer o tablet.
- **App sul telefono con profilo personale:** si installa dalla schermata Home (Android e iPhone). Ognuno ha un codice personale di 6 caratteri che conserva nome, personaggio e statistiche di sempre; l'app trova da sola la serata in corso del gruppo.
- **Regia dal telefono:** con il codice regia l'host guida la serata anche dallo smartphone.
- **Personaggio su misura:** editor pezzo per pezzo (capelli, occhi, bocca, occhiali, colori…), oppure un selfie o una foto dalla galleria, più un motto che compare sulla TV. Chi ha vinto premi nella serata precedente si presenta con corona, stella e titolo in carica.
- **Sessioni lunghe senza pensieri:** pausa, voti che restano in coda se cade la rete, cestino con "Annulla", correzioni dopo il reveal, avviso se la TV si blocca, avviso di batteria scarica e pagina di verifica della configurazione.
- **Stabilità e sicurezza:** salvataggio a ogni mossa sul computer della regia con copie a rotazione e istantanee, **macchina del tempo** della serata, ripresa guidata dopo un crash, **controllo integrità** prima della premiazione, **Safe Mode**, battito dei telefoni ogni 5 secondi, stato della rete sul telefono (connesso, offline, in coda), **stanza chiusa**, **espulsione** di un dispositivo, **regia trasferibile** con un QR, backup di emergenza e del gruppo con versione del formato e controllo dei file, monitor dello spazio, protezione da codice e HTML inseriti nei testi.
- **Prova, accessibilità e tutorial:** **modalità prova** con giocatori finti, **reveal cinematico**, **accessibilità** (testo più grande, alto contrasto, colori per daltonici, meno animazioni), **tutorial** al primo avvio, **registro errori** scaricabile, limiti **anti-spam** imposti dal database, **gruppo modificabile solo dai membri** con la **chiave del gruppo**, profili ricordati dal telefono anche dopo aver svuotato il browser, "Sei tu, Andrea?" contro i doppioni e **"Non ho il codice: chiedi alla TV"**.
- **Pre-partita:** **i giochi di stasera** segnati dal telefono (anche **inquadrando il codice a barre** della scatola), **stelline "voglio giocare a…"**, **scaletta della serata** in base al tempo, **scheda delle regole** con "chi lo conosce già?" e cronometro della spiegazione, **arrivi** (chi ha detto "ci sono" e non è ancora entrato) e **"porto io"** (giochi e cibo) nell'invito.
- **Durante e dopo la partita:** **segnapunti dal vivo** sui telefoni (vince chi ha più punti), **strumenti da tavolo** (ruota per chi inizia, squadre equilibrate, clessidra condivisa), **ruota dei giochi**, **quiz del gruppo** con risposte dal telefono, **stagioni** con trofeo e albo d'oro, **rivalità testa a testa** (nemesi e vittima preferita), **figurine collezionabili** da condividere, **video riassunto** della serata, **invito per il calendario**, **modalità leggera** per le TV lente, **importazione della collezione di BoardGameGeek**, e per la sicurezza **cambio del codice regia**, **allarme intrusi**, **storico privato** e **stanze a scadenza**. Controlli automatici su GitHub a ogni caricamento.
- **Grafica da show:** la TV diventa uno **show televisivo** (tema Show con luci basse, neon caldi, titoli in 3D e un palcoscenico animato di dadi, segnalini e carte olografiche), **timer del voto** con anello che si consuma sulla TV e **miccia** sui telefoni, giocatori come **carte vive** (pulsano mentre pensano, lampeggiano quando votano, tremano se scade il tempo), **reveal a ritmo crescente**, **Campioni della serata** che salgono sul podio a gradini con trofei e **fuochi d'artificio**, e sul telefono un **controller da tavolo**: pulsanti che si schiacciano e vibrano, cartone e feltro, **slider gigante** e **carta MVP da trascinare sul tavolo**.
- **Tema notte** su TV e telefoni, **effetti sonori** sulla TV e **statistiche**: andamento della serata, anime affini, giochi da rispolverare.
- **Chi ha giocato e chi guardava:** per ogni partita la media è solo di chi ha giocato; chi guardava vota come **pubblico**, con un voto a parte.
- **Durante la partita:** "Inizia la partita" con timer (si ferma durante le pause), orologio e durata della serata, numero della partita (2ª, 3ª…) e **Rivincita** con un tocco.
- **Cosa giochiamo stasera?** Consigli in percentuale per chi è presente, con il motivo e un filtro per il tempo a disposizione. **Modalità Chaos** con un evento casuale prima di ogni gioco.
- **Domande della serata:** criteri attivabili, fino a due domande personalizzate, risposta "Non giudico", commento che compare al reveal, nota privata, **consenso del gruppo** su ogni gioco.
- **Time-out:** un pulsante sul telefono fa fischiare la TV e mette in pausa la serata.
- **Progressione:** XP e livelli, 18 traguardi (anche segreti), livello del gruppo e **Hall of Fame** con i record.
- **Voto veloce** per i giochi brevi (solo voto generale e MVP), **Indovina la media** con il premio "l'oracolo", **durata reale** delle partite misurata e mostrata nell’armadio, **Riapri la votazione** e **Vota per conto di** chi ha il telefono fuori uso.
- **A fine serata** la premiazione svela il podio e poi i premi speciali:
  - ai giochi: il più coinvolgente, il più semplice, il più richiesto, il più divisivo;
  - ai giocatori: l'MVP della serata, il più vincente, il più generoso, il critico, il bastian contrario e le anime gemelle.
- **Immagine della classifica:** dal telefono si condivide direttamente (WhatsApp, Telegram…), dalla TV si scarica. Dalla TV si possono scaricare i risultati anche in CSV.
- **Identità del gruppo:** emblema (o logo), motto e colore del gruppo su TV, telefoni e immagine da condividere.
- **Foto ricordo e album:** dai telefoni e dalla TV si aggiungono foto con una didascalia ("Il tradimento di Marco"); la TV le mostra come polaroid e in presentazione.
- **Ricordi:** ogni serata ha la sua pagina (Game Night #1, #2…) con giochi, vincitori, MVP, premi, commenti e album; "un anno fa giocavate a…" e l'anniversario del gruppo.
- **Wrapped dell'anno:** il recap a schede, da scorrere con le frecce (gioco più giocato e più amato, partita e serata più lunghe, più letale, sempre presente, MVP, oracolo, più severo e più generoso, mese più giocato).
- **Calendario e prossima serata:** data e luogo della prossima serata, presenze dal telefono (Ci sono / Forse / Non ci sono), serate per mese.
- **Statistiche avanzate e coppie:** giochi più amati, che piacciono a tutti, che dividono, sopravvalutati e sottovalutati, che durano più del previsto, divertimento al minuto, "mai più" e "quando lo rigiochiamo?"; mappa delle coppie con compatibilità, duo imbattibile, rivalità storica, anime ludiche e nemici giurati; sul telefono le statistiche personali (quanto vinci, se sei severo, compagno migliore, peggior avversario, durata e numero di giocatori ideali).
- **Musica e suoni:** musica d'atmosfera generata dalla TV (lounge in attesa, suspense durante il voto che accelera quando manca l'ultimo voto, festa alla premiazione, relax in pausa), volumi separati per musica ed effetti, modalità silenziosa, suoni per vittoria, sconfitta, nuovo gioco e fine serata.
- **Soundboard:** applausi, risate, trombone triste, ba-dum-tss, rullo di tamburi, tensione, trombetta, ciak, allarme, grilli e altri, dalla TV, dalla regia o dai telefoni (se l'host lo permette).
- **Atmosfere animate** sullo sfondo della TV: pioggia sul vetro, candele, neon, cielo stellato, festa, nebbia, oppure automatiche in base alle categorie del gioco.
- **Ticker "Ultim'ora"** in basso sulla TV, con i pettegolezzi anonimi scritti dai telefoni, le notizie della serata e le curiosità del gruppo. L'host può togliere i messaggi.
- **Pronostici:** durante la partita ognuno pronostica dal telefono chi vincerà; chi indovina prende 15 XP, il traguardo "Veggente" e il premio "Il veggente".
- **Intervallo:** tra un gioco e l'altro la TV fa scorrere curiosità del gruppo ("Sapevi che Giulia vince il 78% delle partite a Dixit?"), foto delle serate passate, notizie della serata e trivia sui giochi da tavolo. Parte anche da solo dopo qualche minuto di inattività.
- **Commentatore:** la TV commenta ogni reveal e legge il resoconto della serata con la voce del browser, in versione celebrativa o "roast"; i sottotitoli compaiono sempre.
- **Esportazioni:** immagine della classifica, storia verticale per Instagram e WhatsApp, PDF della serata (con classifica, premi, commenti e album) e CSV.
- **QR:** il QR personale del profilo (per collegarlo a un altro telefono) e il QR dell’armadio, da sfogliare e cercare sul telefono.
- **Armadio avanzato:** scheda completa di ogni gioco (modalità, peso, categorie, editore, anno, lingua, proprietario, stato e prestiti, espansioni) con le sue statistiche, e **ricerca a frasi**: "per 5 persone, massimo 45 minuti", "cooperativi", "mai giocati", "che Andrea non odia". I giochi prestati o non disponibili non vengono proposti.

Funziona su Android e iPhone, senza installare niente. Serve solo una connessione a internet.

## Cosa ti serve

- Un account GitHub (per pubblicare il sito, gratis).
- Un account Google per Firebase (il database in tempo reale, gratis con il piano Spark).

La configurazione si fa una volta sola e richiede circa 10 minuti.

## 1. Carica il progetto su GitHub

1. Crea un nuovo repository, per esempio `GameNight_Show`, e rendilo **pubblico** (GitHub Pages gratuito funziona con i repository pubblici).
2. Carica **il contenuto** di questa cartella nella radice del repository: `index.html`, `host.html`, `play.html` e le cartelle devono stare al primo livello.

## 2. Crea il progetto Firebase

### 2.1 Progetto

1. Vai su https://console.firebase.google.com e clicca **Crea un progetto**.
2. Dagli un nome (es. `gamenight-show`). Google Analytics non serve: puoi disattivarlo.

### 2.2 Realtime Database

1. Nel menu a sinistra apri **Database e Spazio di Archiviazione** (Realtime Database) e clicca **Crea database**.
2. Come posizione scegli **Belgio (europe-west1)**.
3. Scegli **Avvia in modalità bloccata** e conferma.

### 2.3 Regole del database

1. Nella pagina del Realtime Database apri la scheda **Regole**.
2. Cancella tutto, incolla il contenuto del file `database.rules.json` di questo progetto e clicca **Pubblica**.

Le regole fanno in modo che solo la TV che ha creato la stanza possa guidarla, che ognuno possa votare solo per sé e solo mentre la votazione è aperta, e che le serate salvate in un gruppo arrivino solo dalla TV che le ha guidate. Il profilo personale (`people`) lo leggono e lo modificano solo i dispositivi collegati con la sua chiave.

**Ogni volta che il file `database.rules.json` cambia** (per esempio con una nuova versione), ricopialo in Firebase e premi **Pubblica**: altrimenti le funzioni nuove vengono rifiutate dal database.

### 2.4 Accesso anonimo

Ogni dispositivo viene riconosciuto con un accesso anonimo: nessuno deve registrarsi.

1. Apri **Sicurezza › Authentication** e clicca **Inizia**.
2. Nella scheda **Metodo di accesso** scegli **Anonimo**, attivalo e salva.
3. Nella scheda **Impostazioni › Domini autorizzati** aggiungi il dominio di GitHub Pages: `TUO-UTENTE.github.io`, cioè il tuo nome utente GitHub in minuscolo seguito da `.github.io`. Per esempio, per il repository `https://github.com/MashaUP/GameNight_Show` il dominio è `mashaup.github.io`. Non serve averlo già attivo: GitHub Pages si accende al passo 3, e il dominio si può aggiungere anche prima.

### 2.5 Collega l'app web

1. Nel menu a sinistra clicca **Impostazioni** (l'ingranaggio) › **Generale**. Si apre la pagina **Impostazioni progetto**.
2. Scorri in basso fino a **Le tue app** ("Non ci sono app nel progetto"). Tra le icone delle piattaforme clicca quella web, **`</>`** (la terza, dopo iOS+ e Android), dai un nome (es. `GameNight Show`) e registra l'app. Lascia spenta la casella di Firebase Hosting: non serve.
   Non registrare un'app Android: anche l'app Android di GameNight Show usa questa configurazione web.
3. Firebase mostra un blocco `firebaseConfig` (scegli l'opzione **npm** o **`<script>`**: i valori sono gli stessi). Copia i valori dentro `js/config.js`, al posto dei campi vuoti. Se chiudi la finestra, li ritrovi più tardi nella stessa pagina, sotto **Le tue app**, alla voce **Configurazione SDK**.
4. Controlla che ci sia anche **`databaseURL`**: per un database in Belgio ha questa forma: `https://NOME-PROGETTO-default-rtdb.europe-west1.firebasedatabase.app`. Se manca, copialo dall'intestazione della pagina Realtime Database.
5. Salva e carica il nuovo `js/config.js` su GitHub.

Le chiavi di `config.js` non sono password: per le app web Firebase sono pubbliche per natura, e la protezione è data dalle regole del database. Se GitHub ti avvisa di aver trovato una "Google API Key" nel repository, è normale. Per stare più tranquillo puoi limitarla: in https://console.cloud.google.com/apis/credentials apri la chiave e, in **Limitazioni delle applicazioni**, scegli **Siti web** e aggiungi `https://TUO-UTENTE.github.io/*` e, se usi l'app Android, anche `https://localhost/*` (dentro l'app le pagine girano a quell'indirizzo).

### 2.6 Verifica

Dopo aver pubblicato il sito (passo 3), apri `https://TUO-UTENTE.github.io/GameNight_Show/test.html` (o il link **Verifica la configurazione di Firebase** in fondo alla pagina iniziale, o ⚙️ › **Verifica Firebase** nella home). È il **tavolo di verifica**: la pagina fa la TV e crea due “telefoni” di prova, poi prova davvero sul tuo Firebase:

- stanza, codice regia segreto, ingresso, stanza chiusa e rientro, telefono rimosso;
- votazione (solo per sé, bloccata dopo il reveal), timer del voto, pronostici solo nei primi 5 minuti, segnapunti, quiz (una risposta), soundboard con anti-spam, votazione dei giochi con più voti a testa;
- armadio (permessi e chiave), giochi dell’armadio nella stanza (le stelline della serata non toccano la collezione), gruppo, serata salvata una volta sola, fine serata e resoconto, profilo personale su più dispositivi.

Usa solo dati di prova con codici nuovi (controllati prima) e alla fine li cancella e ricontrolla: i tuoi dati non vengono toccati. Con **Prova anche un tuo armadio** controlla, in sola lettura, un tuo armadio vero (giochi, foto, stelline). Le cose che servono una persona davanti (audio della TV, telefono che si spegne, fotocamera, tasto Indietro dell’app, grafica della premiazione) sono segnate ✋ **da provare a mano**, mai come riuscite. In fondo c’è la **matrice delle verifiche** (funzione, stato, come è stata provata, risultato), che si può scaricare.

Se tutto è verde la serata può cominciare; se qualcosa è rosso, il messaggio dice cosa sistemare (di solito: ripubblicare le regole o attivare l'accesso anonimo).

## 3. Pubblica con GitHub Pages

GitHub Pages non è un servizio a parte: è un'opzione gratuita di ogni repository, che pubblica i file come sito web. Non serve creare niente fuori da GitHub. Con un account gratuito il repository deve essere **pubblico**.

1. Nel repository apri **Settings › Pages**.
2. In **Build and deployment** scegli **Deploy from a branch**, poi il ramo `main` e la cartella `/ (root)`, e salva.
3. Dopo un minuto il sito è online su `https://TUO-UTENTE.github.io/GameNight_Show/` (per esempio `https://mashaup.github.io/GameNight_Show/`). L'indirizzo esatto compare in cima alla pagina **Settings › Pages**.

### Se rinomini il repository (per esempio da `GameNight_Rank` a `GameNight_Show`)

1. Nel repository apri **Settings › General**, cambia **Repository name** e conferma con **Rename**.
2. Il sito si sposta su `https://TUO-UTENTE.github.io/NUOVO-NOME/`: il vecchio indirizzo smette di funzionare.
3. In Firebase non c'è niente da cambiare: il dominio autorizzato (`TUO-UTENTE.github.io`) resta lo stesso, e restano serate, gruppi, armadio e profili.
4. Sui telefoni e sulla TV restano anche le impostazioni e i profili ricordati, perché sono legati al dominio e non al nome del repository.
5. Da rifare: l'app installata sulla schermata Home (toglila e reinstallala dal nuovo indirizzo), i preferiti, i link condivisi e i QR stampati dell’armadio.
6. Se usi git dal computer: `git remote set-url origin https://github.com/TUO-UTENTE/NUOVO-NOME.git`.

## 4. La serata

1. Sul portatile collegato alla TV apri `https://TUO-UTENTE.github.io/GameNight_Show/host.html` e metti lo schermo intero (pulsante in alto o tasto **F**).
2. Scegli il numero di giocatori e il **gruppo**, poi crea la stanza. In lobby compare il **codice regia** (8 caratteri): **fotografalo**, serve se il PC si spegne o per guidare la serata dal telefono. Lo ritrovi anche nel pannello **Giocatori**.
   - La prima volta scegli **Nuovo gruppo…** e dagli un nome. Le volte successive il portatile lo ripropone da solo.
   - Da un altro computer scegli **Ho il codice di un gruppo…** e scrivi il codice di 6 caratteri: lo trovi nel pannello **Armadio**.
   - Puoi cambiare i posti anche dopo, con **−** e **+**.
3. Ognuno inquadra il QR con il telefono (o va sulla pagina principale e scrive il codice di 4 caratteri), sceglie nome, personaggio e colore. Due giocatori non possono avere lo stesso nome o lo stesso colore.
4. Mentre aspettate, completate l’**armadio**: ognuno può premere **Aggiungi un gioco all’armadio** sul telefono e fotografare la scatola, oppure la TV aggiunge i giochi dal pulsante **Armadio** (o tasto **L**). Per ogni gioco potete indicare da quanti a quanti giocatori si gioca e quanto dura: sono facoltativi, ma servono a proporre solo i giochi adatti. Nel pannello della TV, la **matita** su un gioco permette di modificarlo.
5. Quando ci siete tutti, premi **Inizia la serata**. Chi arriva in ritardo può entrare anche dopo, se c'è un posto libero.
6. Per decidere cosa giocare, premi **Cosa giochiamo? Si vota dal telefono**. Vengono proposti solo i giochi non ancora giocati e adatti al numero di giocatori presenti; quelli esclusi sono elencati sotto il titolo, e nella riga **Scegli il prossimo gioco** compaiono sbiaditi. Ognuno tocca il gioco che preferisce; quando hanno scelto tutti (o premi **Chiudi la scelta**) la TV annuncia il vincitore, con sorteggio in caso di pareggio. **Pronti, si gioca** prepara già nome e foto per la votazione.
7. Finita una partita, tocca il gioco nella riga **Scegli il prossimo gioco**, oppure scrivi il nome e aggiungi la foto se vuoi:
   - **Scegli file** o trascina un'immagine (anche incollandola con Ctrl+V);
   - **Dal telefono**: compare un QR, inquadralo e scatta una foto alla scatola, che arriva subito sulla TV;
   - **Da un link**: incolla l'indirizzo diretto di un'immagine.
   I giochi nuovi scritti a mano entrano nell’armadio da soli, così la prossima volta ci sono già.
   Quando la partita comincia, premi **Inizia la partita**: parte il timer (che non conta le pause) e la durata reale finisce nell’armadio.
   Per scegliere, **Consigli** mostra i giochi più adatti ai presenti in percentuale ("piace a 3 su 4 presenti, dura circa 30 minuti"), divisi tra consigliati, da provare e da rispolverare, con un filtro per il tempo a disposizione; sopra l’armadio compare anche il gioco più consigliato.
8. Sotto **Chi ha giocato e chi ha vinto?** tocca i personaggi: un tocco = ha vinto (corona), due tocchi = guardava, tre = di nuovo giocatore. Se segni qualcuno come spettatore, la media del gioco è solo di chi ha giocato; lo spettatore vota lo stesso, ma come **pubblico**, e il suo voto compare a parte nel reveal. Si può segnare più di un vincitore (giochi a squadre); per i cooperativi lascia senza vincitori. Per i giochi brevi attiva **Voto veloce**: si vota solo voto generale e MVP (la scelta resta memorizzata nell’armadio per quel gioco). Poi premi **Apri la votazione**.
   Sui telefoni, oltre al voto, c'è **Indovina la media** (facoltativo): chi si avvicina di più alla media del gioco compare nel reveal, e a fine serata vince il premio **L'oracolo**. L'app misura anche quanto è durata la partita (dall'inizio della schermata "Prossimo gioco" all'apertura del voto) e l’armadio mostra la durata media reale. Sulla TV si accendono i personaggi di chi ha votato. Chi ha già votato può modificare il voto fino al reveal.
   Sul telefono, ogni domanda da 1 a 5 ha anche **Non giudico**; si può aggiungere un **commento** (compare sulla carta del voto al reveal) e una **nota privata** che resta solo sul proprio telefono (si ritrova in **Il mio profilo**).
9. Dopo il reveal scegli **Prossimo gioco**, **Rivincita** (stesso gioco, stessi giocatori, timer già avviato) o guarda la **Classifica**. Il reveal mostra anche il voto del pubblico, il **consenso del gruppo** (100% = tutti d'accordo) e, se è una rivincita, il numero della partita. La **Classifica di sempre** si apre dalla schermata del prossimo gioco o dalla classifica, e si aggiorna a ogni gioco votato.
10. Quando avete finito, **Termina la serata** e premi **Avanti** (o la barra spaziatrice): prima il podio dal terzo al primo, poi la pagina dei premi speciali, uno alla volta. Alla fine, sulla TV: **Immagine** scarica la grafica della classifica, **CSV** i dati, **Podio**/**Premi speciali** passa da una pagina all'altra. Sui telefoni compaiono i risultati e il pulsante **Condividi la classifica**.

Per togliere qualcuno dalla lobby (per esempio se è entrato due volte), passa con il mouse sulla sua carta e premi la **×**.

### Se il PC si blocca o si spegne

- **Chiusura per sbaglio:** la TV chiede conferma prima di chiudere la pagina.
- **Pagina ricaricata o browser in crash:** riaprendo `host.html` sullo stesso computer la serata riparte dal punto in cui era, compreso il gioco che stavi preparando (nome, foto, vincitori) e il punto raggiunto nella premiazione. Tutti i dati della serata stanno su Firebase, non sul PC.
- **PC fuori uso:** su un altro computer o tablet apri `host.html`, premi **Riprendi una serata già iniziata**, scrivi il codice stanza e il codice regia. La serata continua da lì; il vecchio PC, se si riaccende, mostra "La regia è passata a un altro dispositivo". Dallo stesso elenco si riprendono anche le serate dei giorni precedenti (serate a puntate).
- **La pagina della TV si blocca:** i telefoni avvisano dopo poco più di un minuto ("La TV non dà segni di vita"); chi ha la regia attiva sul telefono trova il link per riprendere la serata da lì.
- **Voto per conto di:** se un telefono è morto e non ce n'è un altro, durante la votazione tocca il personaggio di quel giocatore sulla TV e inserisci il suo voto.
- **Riapri la votazione:** se il reveal è partito senza qualcuno, dal reveal o dalla classifica (passando con il mouse su un gioco) puoi riaprire la votazione; i voti già dati restano.

### Stabilità e sicurezza

**Salvataggi.** La TV è l'unica che decide: i telefoni mandano solo intenzioni (il voto, il pronostico, il time-out) e le regole del database impediscono loro di toccare giochi, fasi e risultati. A ogni mossa la TV salva la serata anche sul computer della regia (IndexedDB): una copia corrente più le tre precedenti a rotazione, ognuna con un controllo di integrità, così se l'ultima si rovina si recupera quella prima. Ogni minuto di gioco, e sempre prima dei passaggi delicati (cambio di fase, reveal, premiazione, cestino, correzioni, riapertura del voto, espulsioni, ripristini), la TV scatta un'**istantanea**. Il browser viene anche pregato di non cancellare questi dati per fare spazio.

**Macchina del tempo** (Strumenti): la cronologia della serata minuto per minuto ("22:12 Luca ha modificato il voto a Dixit", "22:14 Reveal: Dixit") con le istantanee. **Ripristina stato** rimette giochi, voti, vincitori e fase com'erano in quel momento; prima di farlo la TV salva lo stato attuale, quindi anche il ripristino si può annullare. **Istantanea adesso** ne crea una a mano.

**Ripresa dopo un crash.** Riaprendo `host.html` la serata riparte da sola e la TV dice da quale copia ("Serata ripresa · ultima copia valida delle 22:14:31"). Se invece si arriva alla schermata iniziale e c'è una serata rimasta a metà, compare **La sessione precedente è stata interrotta** con **Riprendi serata** o **Inizia nuova serata**. Se la stanza è sparita dal database (per esempio cancellata dalla console di Firebase), la TV propone di **ricrearla dalla copia locale**, con giocatori, giochi e voti: i telefoni rientrano da soli al loro posto.

**Controllo integrità** (Strumenti, e in automatico prima della premiazione): giocatori con dati rovinati o doppi, voti di giocatori che non ci sono più o di giochi cancellati, numeri fuori scala, votazioni rimaste aperte, partite senza vincitore, criteri mancanti, orari, coerenza della classifica, ultimo backup. Se va tutto bene compare **SESSIONE PRONTA**; altrimenti **Correggi automaticamente** sistema quello che si può (dopo un'istantanea).

**Safe Mode** (Strumenti, o la regia sul telefono): spegne animazioni, musica, effetti, commentatore, atmosfere e ticker, sulla TV e sui telefoni. Restano giocatori, voti, classifica, regia e salvataggi. Se la pagina della TV incontra più errori in un minuto, è lei stessa a proporla. In alto compare **Safe Mode**: toccalo per spegnerla.

**Telefoni collegati.** Ogni telefono manda un battito ogni 5 secondi: se la TV non lo riceve per 15 secondi il giocatore risulta **Non collegato** (telefono spento, bloccato o senza rete) e la votazione non resta ferma ad aspettarlo oltre il minuto di tolleranza. Sul telefono, in alto, un pallino dice com'è la rete: 🟢 connesso, 🟡 **Offline** (i dati restano sul telefono), 🔵 **In coda** con il numero di azioni in attesa; quando la rete torna parte tutto da solo e compare "✓ Voto sincronizzato". Un voto inviato due volte (rete lenta, pagina riaperta) resta comunque un voto solo: ognuno ha un posto fisso nel database. Riaprendo la pagina compare "Bentornato Andrea 👋 Sei nella Game Night #12".

**Stanza chiusa.** Quando sono arrivati tutti, **Chiudi la stanza** (in lobby, nel pannello Giocatori, negli Strumenti o dalla regia): il QR sparisce e chi non è già dentro non può più entrare, nemmeno conoscendo il codice o il link, perché lo impediscono le regole del database. Chi era in partita può sempre rientrare dal suo telefono (con la conferma della TV o con il codice personale). **Riapri la stanza** quando arriva qualcuno.

**Espulsione.** Nel pannello Giocatori, ⛔ accanto a un nome espelle quel dispositivo (anche un giocatore fantasma o un telefono impazzito): esce subito, il suo voto della votazione in corso viene tolto e stasera non può rientrare. Si può scegliere di cancellare anche tutti i suoi voti e le sue vittorie della serata. **Annulla** compare per qualche secondo; gli espulsi si riammettono con **Riammetti**. Funziona anche dalla regia sul telefono.

**Regia trasferibile.** **Strumenti › Trasferisci la regia** mostra il codice stanza, il codice regia e un QR: inquadrato dal nuovo computer o tablet, apre la ripresa della serata con il codice già scritto. I telefoni non si accorgono di niente. Sul telefono con la regia, in cima al pannello, c'è sempre "Ultimo segnale dalla TV: 3 s fa"; se la TV non risponde per più di 30 secondi compare **Riprendi la regia su questo dispositivo**.

**Backup.** **Backup di emergenza** scarica la serata intera in un file (`gamenight_12_backup_2026-10-08.json`) con la versione del formato e un checksum; **Importa backup** controlla il file prima di usarlo: se è rovinato o ha dati fuori scala lo rifiuta ("File corrotto…"), se è stato modificato a mano chiede conferma, se viene da una versione vecchia lo aggiorna. **Backup del gruppo** scarica armadio, serate e identità (e, se vuoi, le foto); con **Scarica da solo il backup del gruppo a fine serata** parte in automatico alla premiazione. **Importa backup del gruppo** rimette armadio e serate mancanti (le serate solo dal computer che ha creato il gruppo).

**Spazio.** Negli Strumenti: quanto occupa il browser rispetto al massimo, copie locali, foto di stasera, armadio e storico, con un avviso quando lo spazio sta finendo e il pulsante per pulire le copie delle serate più vecchie di 30 giorni. Le foto vengono ridotte (al massimo circa 190 KB) e ricodificate, il che toglie anche i metadati come la posizione GPS.

**Testi al sicuro.** Nomi, motti, commenti, pettegolezzi, didascalie e nomi dei giochi vengono sempre mostrati come testo: chi scrive `<script>` o `<img onerror=…>` vede solo quei caratteri sullo schermo. In più le pagine hanno una Content Security Policy che blocca qualsiasi codice inserito, e le regole del database rifiutano colori, foto e loghi costruiti per iniettare codice.

**Da sapere.** I dati veri della serata e del gruppo stanno su Firebase, non sul PC: se il computer si rompe non si perde niente, e le copie locali servono per i casi in cui manca la rete o qualcuno cancella la stanza dal database. Il codice personale è come una password tra amici: chi lo conosce può usare quel profilo, quindi mostralo solo ai tuoi. Il backup automatico su Google Drive o Dropbox non c'è: richiederebbe di registrare l'app presso Google o Dropbox; al suo posto c'è il backup del gruppo scaricato a fine serata.

### Giocatori ricordati e profili

Ogni telefono ha un'identità fissa e, alla prima serata del gruppo, un **profilo personale** (nome, personaggio, statistiche di sempre) con un codice di 6 caratteri. Il telefono ricorda il profilo due volte: nella memoria del browser e nel database, legato a quel telefono. Se la memoria del browser si svuota, all'apertura successiva compare "Ho ritrovato il tuo profilo". Le statistiche di sempre sono legate al profilo, non al nome.

Su un telefono nuovo:
- **con il codice** (o il QR del profilo dal vecchio telefono) si ritrova tutto subito;
- **senza codice**: scrivendo il proprio nome compare **"Sei tu, Andrea?"** se nello storico c'è già un profilo con quel nome. Si può inserire il codice oppure toccare **Non ho il codice: chiedi alla TV**: sulla TV compare "Andrea vuole ritrovare il suo profilo" con il numero di serate; se l'host conferma, il telefono entra come Andrea con livello e statistiche. La conferma serve perché nessuno possa prendersi il profilo di un altro;
- **è davvero un'altra persona** con lo stesso nome: "No, sono un altro Andrea".

### Modalità prova, reveal cinematico, accessibilità e tutorial

- **Modalità prova:** nella schermata iniziale della TV, **Prova con giocatori finti** crea una serata di prova: i finti entrano uno alla volta, fanno i pronostici e votano da soli. Con **+ Giocatore finto** se ne aggiungono altri, e può entrare anche un telefono vero. Niente viene salvato in un gruppo: serve a provare tutto (e a far vedere l'app) prima che arrivino gli amici.
- **Reveal cinematico** (Strumenti, attivo di serie): le luci si abbassano, un riflettore illumina ogni carta che si gira e il voto più basso e quello più alto arrivano al ralenti. Si spegne da solo con la Safe Mode o con "Meno animazioni".
- **Accessibilità** (Strumenti sulla TV, Il mio profilo sul telefono; ogni dispositivo ha le sue): testo **A / A+ / A++**, **alto contrasto**, **colori adatti ai daltonici** e **meno animazioni**.
- **Tutorial:** la prima volta la TV spiega ogni schermata con nuvolette (creazione, lobby, prossimo gioco, votazione, reveal, classifica); **Salta il tutorial** lo chiude, **Rivedi il tutorial** negli Strumenti lo fa ripartire. Sul telefono, al primo ingresso, compare un breve "Come funziona".
- **Registro errori:** TV e telefoni annotano gli errori (con ora, pagina, versione e tipo di browser). Dagli Strumenti, o da Il mio profilo sul telefono, **Scarica il registro** crea un file di testo da mandare a chi gestisce l'app.
- **Anti-spam:** il database accetta al massimo un pettegolezzo ogni 15 secondi, un effetto della soundboard ogni 3, un time-out ogni 20 e una foto ricordo ogni 8 per telefono. È imposto dalle regole, quindi non si aggira modificando l'app.
- **Gruppo solo ai membri:** armadio, foto, presenze e prossima serata li modifica solo chi ha giocato almeno una serata del gruppo (la TV registra da sola chi entra). Serate salvate, identità e membri li scrivono solo i computer autorizzati: quello che ha creato il gruppo e quelli che hanno la **chiave del gruppo**. La chiave si trova negli Strumenti (sezione Il gruppo) e nel pannello **Trasferisci la regia**, che la passa al nuovo computer insieme al codice regia. Se un computer non autorizzato apre una serata del gruppo, la TV la chiede con un avviso in alto: senza chiave la serata si gioca lo stesso, ma non finisce nello storico del gruppo.

### L’armadio dei giochi

È il posto dove stanno i vostri giochi, con la foto, conservati da una serata all’altra. **Non dipende dal gruppo**: è un armadio a sé, con un suo codice, e ogni stanza sceglie quale armadio consultare (lo stesso armadio può servire a più gruppi, e una TV diversa può consultarlo con il codice). Conviene riempirlo **prima** della serata, così durante non si perde il ritmo (ma si possono aggiungere giochi anche a serata iniziata).

- **Prima della serata:** nella pagina iniziale della TV, a sinistra, c’è il riquadro **📦 Armadio dei giochi**: tocca un armadio già usato, **➕ Nuovo armadio** (gli dai un nome, es. “I giochi di Andrea”) oppure **🔑 Ho un codice**. Si apre l’armadio senza creare la stanza e senza gruppo. Dalla home del sito c’è anche il link **Prepara l’armadio dei giochi**.
- **La serata:** nel riquadro **Nuova serata**, il campo **Giochi dall’armadio** sceglie quale armadio consultare (con lo stesso gruppo viene proposto quello dell’ultima volta). Dall’armadio aperto, **Crea la stanza** lo sceglie da solo.
- **Da un’altra TV:** scegli **🔑 Ho un codice** (o, in **Giochi dall’armadio**, **Ho il codice di un armadio…**) e scrivi il codice di 6 caratteri (lo trovi in cima all’armadio). Quella TV può **consultare** i giochi; per aggiungerli o modificarli serve anche la **chiave dell’armadio** (8 caratteri), che il computer che l’ha creato vede nell’armadio stesso.
- **Giochi salvati nei gruppi con le versioni precedenti:** quando crei un armadio nuovo per quel gruppo, vengono copiati da soli nell’armadio.
- **Aggiungere un gioco:** nome, giocatori, durata e la foto: **scegli un file**, **trascinala**, **incollala** (Ctrl+V) oppure **incolla il link** di una foto trovata online.
- **Dal telefono:** **📱 Aggiungi dal telefono** mostra un QR: il telefono apre l’armadio, fotografa la scatola e aggiunge il gioco. Il QR contiene la chiave dell’armadio: mostralo solo a chi vuoi. Durante la serata anche i telefoni dei giocatori possono aggiungere i giochi che hanno portato.
- **Foto dritte:** dopo aver scelto o scattato una foto (giochi, personaggio, foto ricordo, logo del gruppo) compare **Controlla la foto** con l’anteprima e **⟲ / ⟳** per girarla di 90°: la rotazione vale per la foto salvata, non solo per l’anteprima. L’orientamento delle fotocamere (EXIF) è già applicato; **✕** annulla senza salvare niente.
- **Foto tutte uguali:** ogni foto viene messa nello stesso formato (640×480): la scatola intera al centro e, intorno, la stessa foto sfocata. Anche le foto molto alte o molto larghe stanno nel riquadro, senza uscire e senza tagli. Le foto da link che il sito non permette di copiare sono mostrate nello stesso riquadro.
- **Legato al tuo profilo:** gli armadi che crei o apri finiscono nel profilo personale, con la chiave per modificarli. Su un altro dispositivo collegato allo stesso profilo (per esempio l'app sul telefono) li ritrovi in **📦 I tuoi armadi** e puoi aggiungere giochi senza QR né chiave. Dalla home si crea anche un armadio nuovo (**➕ Nuovo**): sul telefono si apre la pagina per fotografare le scatole.
- **L’armadio della serata:** in sala d’attesa il pulsante dell’armadio mostra quale armadio usa la serata (es. *I giochi di Andrea: 24 giochi · ⭐ 6*). Nel pannello dell’armadio, **🔁 Cambia armadio** (prima di iniziare o tra un gioco e l’altro) passa a un altro armadio. La stanza usa l’armadio **originale** (sempre aggiornato, niente copie da tenere allineate); le **stelline “Stasera” invece sono della serata**: alla creazione si copiano quelle preparate nell’armadio, e quello che cambiate durante la serata non tocca la collezione. Se l’armadio è vuoto, cancellato o il computer può solo consultarlo, il pannello lo dice.
- **Prova con giocatori finti:** usa l’armadio scelto in **Giochi dall’armadio**, in sola lettura: si gioca con i vostri giochi ma la prova non aggiunge né modifica niente.
- **⭐ Stasera:** con la stellina segni i giochi che portate stasera (i giochi nuovi la hanno già). Durante la serata **A caso**, **Ruota**, **Votazione** e **Consigli** scelgono solo tra quelli, e **mai un gioco già giocato**. Con **📦 Tutto l’armadio** si sceglie tra tutti i giochi; **Azzera** toglie tutte le stelline.
- **Scegli il prossimo gioco** (schermata della TV tra un gioco e l’altro): 🎲 **A caso** (la TV fa lampeggiare i nomi e si ferma su uno), 🎡 **Ruota**, 📱 **Votazione** dai telefoni, 💡 **Consigli** in base ai gusti dei presenti, 📦 **Armadio**. Oppure tocca direttamente un gioco. I giochi già giocati finiscono in **Già giocati stasera**.

### Il telefono durante la serata

In basso c’è una barra di icone: ognuna apre un pannello.

- 🔮 **Pronostico:** chi vincerà la partita in corso. Si punta solo nei **primi 5 minuti** dalla pressione di **Inizia la partita** (la TV mostra quanto manca): alla fine sarebbe troppo facile. Finché è aperto, sullo schermo compare l’invito a pronosticare.
- 🧮 **Punti:** il segnapunti personale (+1, +5, −1, −5 o scritto a mano); la TV mostra la classifica dal vivo.
- 🔊 **Suoni:** applausi, rullo di tamburi, trombetta… partono sulla TV. La soundboard è accesa di base nelle stanze nuove (si spegne dagli Strumenti della TV).
- 📦 **Giochi**, ✋ **Time-out** e 👤 **Profilo**.

Chi inizia, la propria squadra e la clessidra restano sempre in vista sullo schermo. Durante il voto la barra sparisce, per lasciare spazio allo slider.

**Il reveal** gira le carte dei voti in **ordine casuale** (non più dal voto più basso al più alto): nessuno indovina il voto dalla posizione.

**Pulsanti Indietro:** sulla TV **← Indietro** in alto a sinistra torna alla schermata precedente (gioco → sala d’attesa, classifica → prossimo gioco…); sui telefoni la freccia **←** nell’intestazione.

### Fine serata e resoconto

- **🏁 Fine serata** è sempre nella barra in alto della TV (e in fondo alla schermata del prossimo gioco): la serata si chiude quando volete, anche a votazione aperta. Prima compare una conferma che spiega cosa succede: quanti giochi sono in classifica, la votazione aperta (puoi **contarla con i voti già arrivati** oppure **lasciarla fuori**: il gioco va nel cestino e si può ripristinare), la partita non votata, la votazione del prossimo gioco che si chiude. Segnapunti, pronostici e quiz restano come sono. Un doppio tocco non chiude la serata due volte.
- L’avviso **Serata terminata · Annulla** ha anche una **✕**: chiude solo l’avviso, la serata resta terminata (**Annulla** invece torna indietro).
- **📋 Resoconto della serata:** gioco per gioco, posizione (con i pari merito), media, verdetto, consenso, criteri, vincitore, MVP, chi ha indovinato la media, segnapunti e i voti di ognuno (con i commenti). I giochi senza voti, le votazioni non completate e i giochi annullati sono indicati come tali: niente viene inventato. Se la serata è finita in anticipo, è scritto. Si apre dalla premiazione sulla TV, dai risultati sul telefono e, dopo, dalla home › **📋 Le tue serate**. Si può stampare (o salvare in PDF). Se la stanza è stata cancellata, mostra il riassunto salvato nel gruppo.

### Il pre-partita

- **I giochi di stasera** (dal telefono, pulsante **🎲 I giochi di stasera** in attesa e tra un gioco e l'altro): ognuno tocca **🎲 Porto** sui giochi dell’armadio che ha portato. Se sul tavolo ci sono almeno 2 giochi, **consigli, ruota, sondaggio e scaletta scelgono solo tra quelli**; nella lista "Dall’armadio" della TV compaiono per primi, con 🎲. Un gioco nuovo si aggiunge dallo stesso schermo (con la casella "L’ho portato stasera").
- **Codice a barre:** **Inquadra il codice a barre della scatola** apre la fotocamera. La prima volta si dice che gioco è (o se ne crea uno nuovo): da quel momento lo stesso codice lo mette sul tavolo da solo. Funziona con Chrome su Android; su iPhone il browser non legge i codici a barre, quindi si scrivono i numeri sotto il codice (va bene anche così).
- **Voglio giocare a…:** fino a 3 stelline a testa. La TV mostra i giochi più desiderati, li mette in cima ai consigli (“⭐ 2 lo vogliono”), al sondaggio e alla scaletta.
- **Arrivi e presenze:** se la prossima serata del gruppo è oggi, la lobby mostra chi ha detto “ci sono” (o “forse”) e non è ancora entrato, avvisa quando sono in ritardo e quando servono più posti.
- **Porto io:** nel profilo del telefono, rispondendo “Ci sono” o “Forse” alla prossima serata, si scelgono i giochi che si portano e cosa si porta da mangiare o da bere. La sera stessa quei giochi sono già sul tavolo e la lobby mostra “Da mangiare”.
- **Scaletta della serata** (lobby o pulsante **Scaletta**): scegli il tempo (da 1 a 4 ore) e la TV mette in fila i giochi adatti a quanti siete: uno breve per scaldarsi, poi i più desiderati, chiusura con uno veloce, con gli orari previsti (5 minuti a gioco per spiegazione e preparazione). Si riordina con le frecce, **Giochiamo** lo carica nel modulo, e “Prossimo in scaletta” resta in vista. I telefoni vedono la scaletta.
- **Regole e spiegazione:** nella scheda di un gioco (Armadio) si scrivono **regole in breve**, **preparazione** (un punto per riga) e il **link al video**. Con **📖 Regole** (accanto a “Inizia la partita”) la TV le mostra con il QR del video e un cronometro della spiegazione; i telefoni rispondono “Lo conosci già?” e la TV propone chi spiega. **Iniziamo!** avvia la partita.

### Segnapunti, tavolo, quiz, stagioni, figurine e sicurezza

**Durante la partita**
- **Segnapunti dal vivo:** dopo **Inizia la partita**, ogni telefono ha il suo contapunti (−5, −1, +1, +5 o "Scrivi il punteggio"). La TV mostra la classifica della partita in tempo reale e l'host può correggere un punteggio toccandolo. Se all'apertura del voto non è segnato nessun vincitore, **vince chi ha più punti** (a pari merito tutti); i punteggi restano con il gioco e compaiono al reveal.
- **Strumenti da tavolo** (pulsante **Tavolo** o tasto **T**):
  - **Chi inizia?** una ruota con i personaggi dei presenti: gira, rallenta con il ticchettio e il nome compare anche sui telefoni;
  - **Squadre** da 2 a 4, equilibrate con lo storico del gruppo (chi vince di più viene diviso dagli altri forti); ognuno vede la sua squadra sul telefono;
  - **Clessidra** da 30 secondi a 3 minuti, per i giochi a tempo: gira sulla TV (anche a pannello chiuso, in un angolo) e sui telefoni, che vibrano alla fine.
- **Sfida nella sfida:** se nella partita ci sono due rivali storici, la TV mostra il loro testa a testa.
- **Ruota dei giochi** (accanto a "Votate dal telefono"): la fortuna sceglie tra i giochi dell’armadio adatti a quanti siete e non ancora giocati.
- **Quiz del gruppo** (pulsante **Quiz** o tasto **Q**): 5 domande, metà sulla storia del gruppo (gioco con la media più alta, chi vince di più, chi ha dato il voto più alto stasera…) e metà sul mondo dei giochi da tavolo. Si risponde dal telefono con quattro pulsanti colorati, 20 secondi a domanda, un punto per risposta giusta e classifica finale.

**Nel tempo**
- **Stagioni:** una ogni tre mesi (Inverno, Primavera, Estate, Autunno) con i punti dei Campioni di ogni serata. Scheda **Stagione** nella Classifica di sempre con l'**albo d'oro**, tappa "Classifica di stagione" nella premiazione (con quanto ha guadagnato ognuno stasera e chi sale) e piazzamento nel profilo del telefono. Chi vince una stagione lo porta sulla figurina.
- **Rivalità:** scheda con i testa a testa più accesi (chi vince quando due giocano la stessa partita) e, nel profilo, il bilancio con ognuno, la propria **nemesi** e la **vittima preferita**.
- **Figurine:** ogni giocatore ha una carta olografica con livello, rarità (Comune, Rara, Epica, Leggendaria), serate, vittorie, MVP, media dei voti dati e gioco del cuore. Sul telefono si inclina con il dito e si **condivide come immagine**; l'**album** raccoglie quelle di chi ha giocato con te (le altre sono "da trovare"). Sulla TV, scheda **Figurine**.
- **Video della serata** (Condividi › Video della serata): una storia verticale di circa 20 secondi con giochi, campioni, premi e foto, registrata dalla TV (Chrome, Edge o Firefox), da scaricare e mandare nel gruppo. È senza audio.
- **Invito per il calendario:** la prossima serata si aggiunge al calendario del telefono o del computer (file .ics, con promemoria 3 ore prima), dalla TV (Calendario) o dal profilo del telefono.

**Comodità**
- **Modalità leggera** (Strumenti): se la TV va a scatti si accende da sola e toglie sfocature, bagliori, particelle e animazioni continue. Si può anche tenere sempre accesa o spenta.
- **Importa da BoardGameGeek:** su boardgamegeek.com apri la tua **Collezione › Esporta** (file CSV) e caricalo dall’**Armadio**: entrano i giochi che possiedi con numero di giocatori, durata, anno e peso; quelli già presenti vengono solo completati. Va bene anche un CSV semplice con la colonna "nome". (Il collegamento diretto con BoardGameGeek non è possibile da un sito senza server: il loro servizio richiede un'applicazione registrata con una chiave segreta.)

**Sicurezza**
- **Cambia il codice regia** (Strumenti › Stanza): i telefoni con la regia attiva e gli altri computer che conoscevano il vecchio codice perdono subito l'accesso.
- **Allarme intrusi:** se qualcuno prova a entrare nella stanza chiusa o piena, un telefono espulso prova a rientrare o qualcuno sbaglia il codice regia, la TV lo segnala in alto (e l'elenco resta negli Strumenti). È una segnalazione dei telefoni con l'app: i blocchi veri restano quelli delle regole del database.
- **Storico privato** (Strumenti › Il gruppo, sui computer autorizzati): serate e foto si leggono solo da chi ha giocato almeno una serata con il gruppo; l’armadio resta consultabile con il QR. È imposto dalle regole del database.
- **Stanze a scadenza:** dopo 7, 30 o 90 giorni le stanze vecchie del gruppo si cancellano da sole all'apertura di una nuova serata (la serata resta nello storico del gruppo, con le foto). Le regole permettono di cancellare solo stanze di più di un giorno, e solo a chi le guidava o a un computer autorizzato del gruppo.

**Controlli automatici**
- Nella cartella `tests` ci sono le prove delle regole del database (129 casi) e un controllo dei file del sito (versioni allineate, file offline, errori nei moduli, import mancanti). Su GitHub partono da soli a ogni caricamento: il risultato è nella scheda **Actions** (spunta verde = tutto a posto). Per lanciarli sul computer: `cd tests`, `npm install`, `npm test`.

### La grafica da show

- **Tema Show (solo TV, attivo di serie):** sfondo serale "materico" (viola profondo, blu notte, verde scuro con una grana leggera), accenti neon arancio, magenta e oro con bagliori, titoli con effetto 3D a strati e numeri grandi e tondi (font Fredoka, scelto per la leggibilità anche da lontano e sui telefoni). Si cambia in **Strumenti › Tema e atmosfera** (Show, Giorno, Notte, Automatico): la TV ricorda la sua scelta, separata da quella dei telefoni.
- **Palcoscenico animato:** con il tema Show lo schermo non è mai fermo: dadi a 20 facce, meeple, segnalini e carte olografiche sfocate galleggiano piano, con polvere luminosa e due fari da studio. Si può anche scegliere come atmosfera (🎲 Palcoscenico). Con Safe Mode, "Meno animazioni" o risparmio energetico resta fermo.
- **Giocatori come carte vive** durante il voto: chi deve ancora votare **pulsa** con i puntini "sta pensando", chi vota fa un **lampo** di luce nel suo colore, e allo scadere del tempo chi manca **trema** con il bordo rosso.
- **Timer del voto** (Strumenti › Timer del voto: spento, 45 s, 1, 1½, 2 o 3 minuti): sulla TV un **anello che si consuma** passando dal verde al giallo, all'arancione e al rosso scuro, con una scintilla in punta, il tic degli ultimi 10 secondi e la sirena di "Tempo!". Sui telefoni una **miccia** che si accorcia con fumo e scintille, e che vibra a 10 secondi e alla fine. Si ferma durante la pausa. Con **"Allo scadere rivela da sola"** il reveal parte da solo (se almeno uno ha votato); altrimenti decide l'host. Il conto usa l'ora del server, quindi è uguale su TV e telefoni.
- **Reveal a ritmo crescente:** le carte coperte si girano in 3D una alla volta, prima con calma e poi sempre più in fretta, con un attimo di silenzio prima del voto più alto e un lampo quando ogni carta atterra. Con una media da 9 in su partono anche i fuochi d'artificio.
- **Campioni della serata:** dopo il podio dei giochi, una nuova tappa della premiazione mette sul podio **i giocatori**: vittoria 3 punti, ogni voto MVP ricevuto 1, pronostico azzeccato 1, media indovinata 1. Gli avatar **saltano su per i gradini**, i trofei cadono dall'alto con un rimbalzo e sul primo posto partono **coriandoli e fuochi d'artificio**. I campioni compaiono anche nei risultati sul telefono. A premiazione finita si passa tra **Podio, Campioni e Premi speciali** con i pulsanti accanto al titolo.
- **Coriandoli nuovi:** su canvas, con un po' di fisica (sparati da due cannoni, cadono girando su sé stessi).
- **Telefono come controller da tavolo:** ogni sezione del voto è un porta-carte di cartone pressato (feltro con il tema notte), i pulsanti sono di "plastica pesante" e si **schiacciano perdendo l'ombra con una vibrazione**, il **voto da 1 a 10 è uno slider gigante** che cambia colore e vibra a ogni scatto, e **l'MVP si sceglie trascinando la sua carta sul tavolo verde** (o toccandola). "Non giudico" è una carta che si scarta.

### Se un telefono si blocca o si spegne

- **La pagina si chiude o il browser va in crash:** basta riaprire la pagina della serata (lo stesso link, oppure inquadrare di nuovo il QR o scrivere il codice). Il telefono viene riconosciuto e il voto che si stava compilando è ancora lì.
- **Durante la votazione:** se un telefono si scollega, sulla TV compare "Il telefono di Marco si è scollegato: lo aspetto ancora 60 s" con il conto alla rovescia, così ha il tempo di rientrare e votare. Se non serve aspettare, premi **Non aspettare** (vale finché quel telefono non si ricollega); passato il minuto la votazione va avanti senza di lui.
- **Rete che cade mentre si vota:** il voto resta salvato sul telefono e parte da solo appena torna la connessione, anche se nel frattempo la pagina è stata chiusa.
- **Batteria scarica:** sui telefoni Android, sotto il 15% compare un avviso e le animazioni si riducono per risparmiare (su iPhone il browser non comunica il livello della batteria).
- **Con il profilo personale:** su un telefono nuovo (o nell'app installata) basta inserire il codice personale e toccare **Rientra come Andrea**: la TV riconosce il codice e rimette Andrea al suo posto senza chiedere conferma.
- **Telefono scarico o da cambiare, senza codice:** con un altro telefono si apre la pagina della serata e, sopra il modulo di ingresso, compare **Eri già in partita?** con i giocatori scollegati. Si tocca il proprio nome e la TV chiede conferma ("Marco vuole rientrare"): premendo **Sì** il nuovo telefono prende il suo posto, con i voti già dati, le vittorie e i voti MVP ricevuti. Funziona anche quando la stanza è piena.

Il personaggio di chi è scollegato appare spento sulla TV, con il simbolo del wifi barrato; quando il telefono si ricollega torna tutto normale.

### Il personaggio

Quando entri, oltre alle 9 proposte puoi:
- toccare **Personalizza** e cambiare ogni parte con le frecce (capelli, occhi, sopracciglia, bocca, occhiali, orecchini, barba, vestiti…) e i colori; "automatico" lascia la scelta del personaggio di partenza, "nessuno" toglie la parte;
- usare **Selfie** o **Dalla galleria** per mettere una foto (viene ritagliata quadrata e rimpicciolita);
- scrivere un **motto**, che compare sotto il tuo nome sulla TV.

Tutto resta salvato nel profilo personale. Dalla seconda serata del gruppo, sulla TV compaiono i **trofei**: corona per l'MVP della serata precedente, stella per l'MVP di sempre e il titolo vinto l'ultima volta (es. "Il critico").

### Soundboard (effetti dai telefoni)

Dal telefono **🔊 Suoni** fa partire un effetto sulla TV (applausi, rullo, trombetta…). Gli effetti sono generati dal browser (nessun file da scaricare). Cosa è stato sistemato:
- i browser non suonano finché nessuno ha toccato la pagina: sui **touch** (tablet o telefono usati come TV) il tocco “vale” quando il dito si alza, e prima la TV aspettava il tocco sbagliato, restando muta per sempre. Ora l’audio si attiva al primo tocco, e se la TV è muta compare **🔇 Tocca qui per attivare l’audio della TV**;
- se un effetto non si sente, il fumetto sulla TV dice perché (*TV in silenzioso*, *effetti spenti*, *Safe Mode*, *audio da attivare*);
- due telefoni insieme: gli effetti partono uno dopo l’altro, non uno sopra l’altro;
- anti-spam: un effetto ogni 4 secondi dal telefono, imposto anche dal database (3 secondi).
Nell’app Android l’audio parte senza tocchi (l’app lo permette).

### Strumenti della TV

Il pulsante **Strumenti** in alto contiene:
- **Pausa** (anche con il tasto **P** o dalla regia sul telefono): nessuno risulta scollegato, i reveal automatici aspettano e i telefoni mostrano "Pausa!". Ideale per la cena o per ricaricare i telefoni.
- **Timer del voto, Tavolo e quiz, Modalità leggera** (vedi sopra).
- **Tema** Show (solo TV), giorno, notte o automatico, ed **Effetti sonori** (rullo di tamburi, carte che si girano, fanfare). Il tema si sceglie anche sul telefono, in **Il mio profilo**.
- **Salvataggi e sicurezza:** macchina del tempo, controllo integrità, trasferimento della regia, backup di emergenza e del gruppo (vedi **Stabilità e sicurezza** qui sotto).
- **Stanza**, **Safe Mode** e **Spazio**: chiudere la stanza ai nuovi ingressi, spegnere tutto ciò che non serve se qualcosa va storto, vedere quanto occupano copie e foto.
- **Cestino:** i giochi annullati finiscono qui e si ripristinano con un tocco.
- **Domande e Chaos:** scegli quali domande da 1 a 5 fare stasera (Coinvolgimento, Semplicità, Rigiocabilità), aggiungi fino a due domande tue (es. "Lo consiglieresti?") e attiva la **modalità Chaos**: prima di ogni gioco la TV estrae un evento casuale (sceglie chi non ha ancora scelto, sceglie chi ha vinto meno, sorteggio, solo giochi mai giocati, solo giochi sotto i 30 minuti, seconda chance a un gioco sotto il 6, scambio di posti, "la TV decide"…). Gli eventi compaiono anche sui telefoni.
- **Verifica configurazione:** apre la pagina di verifica.

Dopo le azioni delicate (annullare un gioco, terminare la serata, segnare l'uscita di qualcuno) compare per qualche secondo il pulsante **Annulla**. In classifica, passando con il mouse su un gioco, **Modifica** permette di correggere nome, foto e vincitori o di togliere un voto sbagliato.

In alto sulla TV ci sono sempre l'ora, la durata della serata e il numero di partite giocate.

### Time-out

Sui telefoni, durante la serata, in basso a sinistra c'è **Time-out**: si sceglie il motivo (contestazione sulle regole, pausa bagno, pizza…), la TV fischia e va in pausa mostrando chi l'ha chiamato. Il timer della partita si ferma; la serata riprende dalla TV (o dalla regia sul telefono).

### Livelli, traguardi e Hall of Fame

Ogni giocatore con il profilo personale accumula XP (50 a serata, 20 a partita, 30 a vittoria, 10 a voto MVP ricevuto, 15 a media indovinata, 15 a vincitore pronosticato, 100 a traguardo) e sale di livello. In **Il mio profilo** ci sono il livello, i 18 traguardi con l'avanzamento (alcuni sono segreti e si svelano solo quando li sblocchi) e le note private. Il livello compare accanto al nome in lobby; i traguardi sbloccati in serata vengono svelati alla premiazione e nei risultati sul telefono. Dalla **Classifica di sempre**, **Hall of Fame** mostra il livello del gruppo, i livelli di tutti e i record (media più alta, partita più lunga, serata con più giochi, più vittorie in una serata).

Dalla **Classifica di sempre**, il pulsante **Statistiche** mostra l'andamento della serata, le anime affini e i gusti opposti del gruppo, e i giochi da rispolverare (anche "Cosa giochiamo?" segnala i giochi mai fatti insieme o fermi da tempo).

### Il gruppo: identità, album, ricordi e calendario

- **Identità:** **Strumenti** › **Il gruppo** › **Identità del gruppo**: scegli un emblema (o carica un logo), scrivi il motto e scegli il colore. Compaiono in alto sulla TV, in lobby, sui telefoni e nell'immagine della classifica.
- **Foto ricordo:** sul telefono, nella schermata di attesa, **Foto ricordo** scatta o sceglie una foto e chiede una didascalia facoltativa. Dalla TV: **Strumenti** › **Album**, oppure **Album** nella premiazione. **Presentazione** fa scorrere le foto a tutto schermo. Le foto vengono rimpicciolite prima di essere salvate.
- **Classifica di sempre:** le schede in alto portano a **Statistiche**, **Coppie**, **Hall of Fame**, **Ricordi**, **Wrapped** e **Calendario**. In **Ricordi** tocca una serata per aprirne la pagina con l'album; in **Wrapped** usa le frecce (anche quelle della tastiera); in **Coppie** tocca una casella per il dettaglio.
- **Prossima serata:** in **Calendario** sulla TV, oppure dal telefono in **Il mio profilo** › **Proponi una data**. Ognuno risponde **Ci sono**, **Forse** o **Non ci sono** dal proprio profilo; la TV mostra chi c'è.
- **Scheda gioco:** nel pannello **Armadio** la matita apre la scheda completa, con partite giocate, media di sempre, durata reale, ultima volta, consenso, campione e livello del gioco. Segna lo stato **Prestato** (e a chi) o **Non disponibile**: il gioco resta nell’armadio ma non viene proposto. Un'espansione si collega al suo gioco base.
- **Ricerca:** nell’armadio (TV) e in **Aggiungi un gioco** (telefono) scrivi una parola o una frase: numero di persone, durata massima, cooperativi/competitivi/a squadre, leggeri o impegnativi, una categoria (#party), "mai giocati", "non giocati da un mese", "che Andrea non odia". Sotto la ricerca compaiono i filtri capiti.

### Musica, atmosfere, ticker e commentatore

Tutto si regola da **Strumenti** sulla TV:
- **Musica:** spenta, automatica (segue la serata) oppure fissa su lounge, suspense, festa o relax, con il suo volume. Il tasto **M** la accende e la spegne. È generata dal browser della TV: niente file, niente diritti d'autore, funziona anche offline. Se preferite la vostra playlist, lasciatela spenta.
- **Effetti sonori:** volume, **Silenzioso** (spegne musica, effetti e voce) e **Soundboard dai telefoni**. I pulsanti degli effetti suonano anche direttamente dalla TV; dalla regia sul telefono la soundboard è sempre disponibile.
- **Atmosfera animata:** sceglila tra pioggia, candele, neon, cielo stellato, festa e nebbia, oppure **Automatica**: la TV la sceglie dalle categorie e dal nome del gioco (un giallo porta la pioggia, un fantasy le candele, un party game la festa…). Si vede meglio con il tema notte.
- **Ticker:** attivalo e sui telefoni il pulsante in basso a sinistra diventa **Tavolo**, con il time-out, gli effetti e i **pettegolezzi**: frasi brevi che scorrono sulla TV senza il nome di chi le ha scritte (un messaggio ogni 20 secondi). Sotto il ticker, in Strumenti, l'host vede l'elenco e toglie quelli di troppo con la X.
- **Commentatore:** "Telecronista" celebrativo o "Roast" satirico (con affetto). Commenta ogni reveal e, alla premiazione, il gioco della serata; il pulsante **Resoconto** legge il riassunto di tutta la serata. Usa la voce italiana del browser (su Chrome e Edge di solito c'è); se manca, restano i sottotitoli.
- **Intervallo:** il pulsante **Intervallo** (o il tasto **I**) nella schermata del prossimo gioco, oppure dalla regia sul telefono. Si chiude toccando lo schermo o premendo un tasto, e da solo quando si apre la votazione. Se l'opzione è attiva, parte da solo dopo 3 minuti senza toccare la TV. Anche la schermata di pausa mostra le curiosità a rotazione.

### Votazione del prossimo gioco con più voti

Con **📱 Votazione** (tra un gioco e l’altro) la TV propone i giochi e i telefoni scelgono. In alto a sinistra **Voti a testa: 1 · 2 · 3** decide quante scelte ha ognuno (si cambia solo prima che arrivi il primo voto). Sul telefono si tocca per aggiungere o togliere un gioco, fino al massimo; ogni gioco riceve al massimo un voto da ciascuno. Vince il gioco con più voti (in pareggio decide la sorte). Il limite è imposto anche dalle regole del database: un telefono modificato non può mandare più voti di quelli concessi né votare due volte lo stesso gioco.

### Pronostici

Quando l'host preme **Inizia la partita** (dalla TV o dalla regia), sui telefoni compare **Chi vincerà?** con chi sta giocando. Si può cambiare idea fino all'apertura del voto; sulla TV si vede quanti pronostici ci sono. Al reveal la TV dice chi aveva indovinato, e il telefono di ognuno mostra com'è andata. I pronostici azzeccati danno 15 XP, contano per il traguardo **Veggente** (5 vincitori indovinati), per il premio della serata **Il veggente** e per il Wrapped.

### Condividere ed esportare la serata

Alla premiazione, **Condividi** apre:
- **Immagine della classifica** (come prima) e **Storia verticale** 1080 × 1920 con il gioco della serata, il podio, MVP, vincitore e premi, pronta per Instagram e WhatsApp. La storia si condivide anche dal telefono, nei risultati della serata.
- **PDF della serata:** si apre la finestra di stampa del browser; scegli **Salva come PDF**. Contiene classifica con criteri, MVP, vincitori e durate, premi, traguardi, commenti e le foto dell'album.
- **CSV** per Excel o Fogli.

### QR del profilo e dell’armadio

- In **Il mio profilo**, sul telefono, **Il tuo QR personale**: inquadrato da un altro telefono collega lì il tuo profilo (nome, personaggio, statistiche). Vale come una password: mostralo solo ai tuoi.
- Nel pannello **Armadio** della TV, **Sfoglia sul telefono** apre la pagina `ludoteca.html` del gruppo: chiunque la inquadri sfoglia i giochi, li cerca a frasi o con i filtri rapidi (disponibili, cooperativi, leggeri, fino a 30 minuti, mai giocati) e tocca un gioco per vederne le statistiche.

### Regia dal telefono

Sul telefono dell'host: **Il mio profilo** › **Regia dal telefono**, scrivi il codice regia e premi **Attiva**. In basso a destra compare il pulsante **Regia**: da lì si inizia la serata, si sceglie il prossimo gioco (anche quello consigliato) con chi ha giocato, chi ha vinto, chi guardava e voto veloce, si avvia il timer con **Inizia la partita**, si chiede la **Rivincita**, si apre e si rivela la votazione, si lancia "Cosa giochiamo?", si va in classifica, si termina la serata e si fa avanzare la premiazione. I comandi li esegue la TV: se il PC è spento, il telefono avvisa che la TV non risponde.

### Chi arriva e chi va via durante la serata

Il pulsante con il numero di giocatori in alto sulla TV (o il tasto **G**) apre il pannello **Giocatori della serata**, disponibile in ogni momento:

- **Arriva qualcuno:** aumenta i **Posti** con **+** e fagli inquadrare il QR del pannello (o scrivere il codice). Entra subito, anche a votazione aperta, e può votare il gioco in corso.
- **Qualcuno va via:** premi **Segna l’uscita** accanto al suo nome, oppure è lui stesso a premere **Esco dalla serata** sul telefono tra un gioco e l'altro. I suoi voti restano in classifica e nei premi, ma le votazioni successive non lo aspettano e non è più votabile come MVP. Se esce prima di aver votato qualcosa, viene semplicemente tolto.
- **Torna:** premi **Fai rientrare** sulla TV, oppure **Rientra nella serata** dal suo telefono. Se nel frattempo il suo colore è stato preso, ne riceve un altro.

Le medie si calcolano sempre sui voti ricevuti da ciascun gioco, quindi un gioco votato in 6 e uno votato in 8 sono confrontabili.

Se ricarichi la pagina della TV o di un telefono, si riprende dal punto in cui eravate.

## L'app sul telefono

GameNight Show è una web app installabile: non serve passare dagli store.

- **Android:** c'è la vera app da installare (vedi sotto, **L'app Android**). In alternativa, in Chrome tocca **Installa** nella scheda "Installa l'app", oppure il menu ⋮ › **Installa app**.
- **iPhone (Safari):** tocca **Condividi** › **Aggiungi alla schermata Home**.

L'app si apre sulla **home personale** (la stessa pagina iniziale del sito):

- per primo **🎉 Entra nella stanza:** prima **📷 Inquadra il QR della TV**, sotto il codice da scrivere a mano; se eri già in una serata ancora aperta compare **Rientra nella serata K7Q2** (controllata: una serata cancellata non compare);
- subito sotto **📺 Crea la stanza** (o **Torna alla regia** se ne stai già guidando una);
- poi **il tuo profilo** (nome, personaggio, traguardi), modificabile anche senza essere in una serata, **📦 I tuoi armadi**, **📋 Le tue serate** (i resoconti) e **👥 I tuoi gruppi** con la serata in corso;
- **⚙️** in alto a destra: tema, accessibilità, **Rivedi l’introduzione** (alla prima apertura compare una breve presentazione in 3 passi, che si può saltare).

Nella stanza, sul telefono, la freccia **←** in alto a sinistra torna alla home: si esce dalla schermata, **non dalla serata** (voti e punti restano, e si rientra con un tocco). Per uscire davvero c’è **Esco dalla serata**, con conferma; per chiuderla, solo la TV ha **🏁 Fine serata**. Nelle schermate interne (profilo, aggiungi gioco) **←** torna alla stanza e **🏠** alla home. Nella regia c’è **🏠 Home** nella barra in alto. A fine serata, sotto i risultati, c’è **🏠 Torna alla home**.

### Il profilo personale (uguale su sito, telefono e app)

Il profilo si crea dalla home (**✨ Crea il profilo**) oppure da solo alla prima serata. Contiene nome, personaggio, colore, foto e motto, i profili dei gruppi in cui hai giocato (con livelli e traguardi) e i tuoi armadi dei giochi.

**Usarlo su un altro dispositivo** (per esempio dal sito sul PC all'app sul telefono): sul dispositivo dove c'è già, **Il tuo profilo › 🔗 Dispositivi** mostra un QR e un codice tipo `ABC123-K7Q2XA9F`. Sull'altro dispositivo: **Il tuo profilo › Ce l’ho già** e inquadra il QR (o scrivi il codice). Il codice è come una password: chi lo ha può usare il profilo. Da **Sicurezza** puoi farne uno nuovo (i dispositivi già collegati restano collegati) o scollegare il dispositivo.

**Se l'altro dispositivo aveva già un suo profilo**, i due si uniscono:
- nome, personaggio e colore: resta la modifica **più recente**;
- gruppi: si sommano; se nello stesso gruppo c'erano due profili, i **traguardi si sommano** (le serate non vengono contate due volte);
- armadi: si sommano, con il permesso di modificarli.

Quando cambi nome o personaggio dalla home, cambia anche nei gruppi. Entrando in una serata compare **Entra come Andrea**: un tocco e sei dentro.

**Chi aveva un profilo con le versioni precedenti** (codice di 6 caratteri per gruppo) non deve fare niente: alla prima apertura della home il profilo personale viene creato da quello. Il vecchio codice si può ancora usare in **Ce l’ho già › Ho solo il codice personale di 6 caratteri**.

**Dopo una pubblicazione:** il sito controlla sempre se i file sono cambiati, quindi basta ricaricare la pagina. Se una pagina resta ferma o compare **La pagina non si è caricata del tutto**, il browser aveva tenuto file vecchi: tocca **Ricarica** (sul computer, se serve, Ctrl+Shift+R).

**Aggiornamenti:** quando carichi una nuova versione su GitHub, le pagine aperte mostrano "È disponibile una nuova versione" con il pulsante **Aggiorna**. Se modifichi il progetto, aumenta il numero di versione in `js/version.js`, `version.json` e `sw.js` (devono essere uguali).

## L'app Android

Nella cartella `android-app/` c'è l'app Android vera e propria (fatta con [Capacitor](https://capacitorjs.com)): contiene una copia del sito e usa lo stesso Firebase, quindi TV, telefoni con l'app e telefoni con il browser (iPhone compresi) giocano insieme nella stessa serata.

### Dove si scarica

Nella home del sito c'è il riquadro **📲 App per Android** con **Scarica l’app (APK)**: compare sul sito pubblicato su GitHub Pages, sia dal PC che dal telefono. Il file sta nella pagina **Releases** del repository (release **App Android**) e viene **rifatto da solo a ogni caricamento su GitHub**: non devi fare niente, basta aspettare 5-8 minuti dopo il push.

### Come si ottiene l'APK

Non serve installare niente sul computer: l'APK la prepara GitHub.

1. Carica il progetto su GitHub come al solito. Nella scheda **Actions** parte da solo il lavoro **App Android** (ci mette 5-8 minuti).
2. Quando ha la spunta verde, apri la pagina **Releases** del repository (colonna a destra della pagina principale): nella release **App Android** c'è il file **GameNight-Show.apk**.
3. L'indirizzo è sempre lo stesso, anche dopo gli aggiornamenti: `https://github.com/TUO-UTENTE/GameNight_Show/releases/download/app-android/GameNight-Show.apk`. Mandalo agli amici con Android.
4. Si può anche rifare l'APK a mano: **Actions › App Android › Run workflow**.

Se il lavoro **App Android** ha la croce rossa, aprilo: in fondo alla pagina del lavoro c’è il riquadro **Cosa è andato storto** con le righe dell’errore (si vede anche senza accedere). Mandale a chi ti aiuta con il progetto.

Se il lavoro fallisce con un errore di permessi alla fine ("Resource not accessible by integration"): **Settings › Actions › General › Workflow permissions**, scegli **Read and write permissions** e salva, poi **Re-run jobs**.

### Come si installa sul telefono

1. Dal telefono apri il link dell'APK (o tocca **📲 Scarica l'app Android** nella pagina iniziale o nella scheda "Installa l'app" del sito: compare solo sui telefoni Android).
2. Apri il file scaricato. La prima volta Android chiede di permettere l'installazione da quella app (Chrome, Files…): consentila e torna indietro.
3. Play Protect può avvisare che l'app non è conosciuta: tocca **Installa comunque**. È normale per le app che non passano dal Play Store.

Gli aggiornamenti si installano allo stesso modo, sopra la versione vecchia: profili e impostazioni restano. Quando sul sito c'è una versione più nuova, l'app mostra **È uscita la versione…** con il pulsante **Scarica**.

### Cosa cambia nell'app

- Si apre a schermo intero, con la sua icona da show (dado al neon sotto i riflettori, anche nella versione a tema di Android 13+) e la schermata di avvio con il palco; funziona anche come TV (per esempio su un tablet collegato al televisore).
- **📷 Inquadra il QR della TV**: nell'app si entra nella serata inquadrando il QR con il pulsante apposito (la fotocamera normale del telefono aprirebbe il sito nel browser). Funziona anche con il QR del profilo e con quello del passaggio di regia.
- I QR e i link mostrati dall'app puntano sempre al sito pubblico su GitHub Pages, così chi non ha l'app entra dal browser.
- Immagini, figurine e video si condividono con il pannello **Condividi** di Android (WhatsApp, Instagram, Drive…). Backup, registro errori e inviti al calendario si salvano in **Documenti/GameNight Show** (sui telefoni dove non si può, si apre **Condividi**).
- Il resoconto in PDF dall'app si salva come pagina `.html`: aprila nel browser e stampala in PDF.
- La memoria dell'app è separata da quella del browser: per avere lo stesso profilo del sito, sul sito apri **Il tuo profilo › 🔗 Dispositivi** e nell'app **Ce l’ho già › Inquadra il QR**.
- **Tasto Indietro di Android:** chiude prima la finestra aperta (pannelli, armadio, quiz…), poi torna alla schermata precedente (nella regia fa come **← Indietro**, con le stesse conferme); dalle altre pagine torna alla home e dalla home riduce l'app a icona invece di chiuderla. Se stai votando e non hai ancora inviato il voto, chiede conferma.
- **La regia sul telefono:** se apri **Crea la stanza** dall'app (o dal browser del telefono), tutte le schermate della TV si dispongono in colonna e la barra dei comandi in alto scorre di lato da sola: niente esce dallo schermo e la pagina non scorre più a destra. Ruota, squadre, clessidra, quiz, intervallo, scaletta, votazione dei giochi, reveal, classifica e premiazione funzionano come sulla TV.
- La barra di stato di Android (orologio, batteria) non copre più i pulsanti in alto.
- Su iPhone si continua a usare il sito nel browser (o aggiunto alla schermata Home).

### Sito e app: cosa c'è dove

| Funzione | Sito (browser) | App Android |
|---|---|---|
| Home personale, profilo, traguardi, armadi, gruppi | ✅ | ✅ identica |
| Stesso profilo su più dispositivi (QR o codice) | ✅ | ✅ identica |
| Entrare in una serata | QR con la fotocamera del telefono o codice | 📷 lettore di QR nell'app, poi codice |
| Voto, pronostici, segnapunti, soundboard, time-out, squadre, quiz, figurine | ✅ | ✅ identica |
| Regia (TV): lobby, ruota, tavolo, quiz, intervallo, scaletta, votazione dei giochi, reveal, classifica, premiazione | ✅ | ✅ adattata al telefono (in colonna, barra che scorre) |
| Regia dal telefono di un giocatore (codice regia) | ✅ | ✅ identica |
| Tasto Indietro di sistema | quello del browser | gestito (finestre → schermata → home) |
| Condividere immagini, salvare backup e registro | download del browser | pannello Condividi e cartella Documenti |
| Resoconto PDF | stampa del browser | file `.html` da stampare |
| Schermo intero sulla TV | ✅ (tasto F) | — (l'app è già a tutto schermo) |
| Installazione | "Aggiungi a Home" (anche iPhone) | APK dalla home del sito |

### Firebase

Non c'è niente da aggiungere: l'app usa lo stesso progetto e le stesse regole. Solo se hai limitato la chiave API ai siti web (passo 2.5), aggiungi anche `https://localhost/*`. `localhost` è già tra i **Domini autorizzati** di Authentication; se l'hai tolto, rimettilo.

### La firma dell'app

Android accetta un aggiornamento solo se è firmato con la stessa chiave della versione installata.

- **Di base** l'APK è firmata con una chiave di prova inclusa nel progetto (`android-app/keystore/`). Funziona e resta sempre uguale, ma è pubblica: va bene per un'app tra amici.
- **Per una chiave tutta tua** (consigliato se il repository è pubblico), dal computer, con Java installato:
  ```
  keytool -genkeypair -v -keystore gamenight.jks -alias gamenight -keyalg RSA -keysize 2048 -validity 10000
  ```
  Poi in **Settings › Secrets and variables › Actions › New repository secret** crea:
  - `ANDROID_KEYSTORE_B64`: il file in base64 (`base64 -w0 gamenight.jks` su Linux, `certutil -encode` su Windows, togliendo le righe BEGIN/END);
  - `ANDROID_KEYSTORE_PASSWORD`: la password scelta;
  - `ANDROID_KEY_ALIAS`: `gamenight`;
  - `ANDROID_KEY_PASSWORD`: la password della chiave (se è la stessa, puoi ometterlo).
  
  Conserva il file `.jks` e le password: senza, non potrai più aggiornare l'app sui telefoni. Cambiando chiave, chi ha già l'app deve disinstallarla una volta e installare la nuova (il codice personale riporta indietro il profilo).

### Indirizzo del sito

Il workflow ricava da solo l'indirizzo del sito (`https://TUO-UTENTE.github.io/NOME-REPOSITORY/`). Se usi un dominio tuo, impostalo in **Settings › Secrets and variables › Actions › Variables** con il nome `SITE_URL` (per esempio `https://giochi.miodominio.it/`).

### Per chi vuole aprirla in Android Studio

```
cd android-app
npm install
SITE_URL=https://TUO-UTENTE.github.io/GameNight_Show/ npm run sync
```

Poi apri la cartella `android-app/android` in Android Studio. `npm run apk` costruisce l'APK firmata dal terminale (serve l'Android SDK).

## Prova in locale

I moduli JavaScript non funzionano aprendo i file con doppio clic: serve un piccolo server. Dalla cartella del progetto:

```
python3 -m http.server 8000
```

Poi apri `http://localhost:8000/host.html`. Per collegare i telefoni dalla stessa wifi, sulla TV usa l'indirizzo IP del computer (es. `http://192.168.1.20:8000/host.html`), così anche il QR punta lì; in questo caso aggiungi quell'IP anche tra i **Domini autorizzati** di Firebase.

## Problemi comuni

- **"Manca la configurazione"**: `js/config.js` non è stato compilato o non è stato caricato su GitHub.
- **"L'accesso anonimo non è attivo"**: rivedi il passo 2.4.
- **"Il database ha rifiutato l'operazione"**: le regole del passo 2.3 non sono state pubblicate, oppure manca `databaseURL` in `config.js`.
- **"Questa stanza è gestita da un altro dispositivo"**: la stanza si guida solo dal portatile e dal browser con cui è stata creata. Da un altro dispositivo crea una nuova serata.
- **"Tutti i posti sono occupati"** sul telefono di chi arriva: aggiungi un posto dal pannello **Giocatori** sulla TV. La pagina del telefono si aggiorna da sola.
- **La foto da link non si carica**: alcuni siti bloccano l'uso delle loro immagini altrove. Usa il link diretto all'immagine oppure scarica la foto e caricala con **Scegli file**.
- **L'immagine non mostra la foto di un gioco**: le foto prese da un link esterno non possono finire nell'immagine (il browser lo impedisce); al loro posto compaiono le iniziali. Le foto caricate o scattate ci sono sempre.
- **Il premio "Il bastian contrario" non compare**: serve almeno un gioco votato da 3 persone e qualcuno che si sia allontanato in media di almeno un punto dagli altri. Allo stesso modo, generoso e critico compaiono solo se le loro medie sono davvero diverse.
- **"Eri già in partita?" non mostra il mio nome**: compaiono solo i giocatori il cui telefono risulta scollegato. Se il vecchio telefono è ancora acceso con la pagina aperta, chiudila; se si è spento da poco, aspetta qualche secondo (fino a circa un minuto) e la lista si aggiorna da sola.
- **Un giocatore risulta "Non collegato" anche se è lì**: i telefoni, soprattutto gli iPhone, sospendono la pagina quando lo schermo si spegne o si passa a un'altra app. Basta riaprire la pagina della serata e si ricollega da solo. Se il telefono si spegne di colpo, Firebase può impiegare fino a circa un minuto per accorgersene.
- **Un gioco non compare tra le proposte di "Cosa giochiamo?"**: è già stato giocato stasera, il numero di giocatori indicato nell’armadio non va bene per quanti siete, oppure è segnato come prestato o non disponibile. Controlla con la matita nel pannello **Armadio**.
- **"Il database ha rifiutato l'operazione" salvando foto, identità, prossima serata, pronostici, pettegolezzi, effetti, battito o stanza chiusa**: ricopia `database.rules.json` (passo 2.3): le regole vecchie non conoscono questi dati.
- **Un telefono vede "Stanza chiusa"**: l'host ha chiuso la stanza. Riaprila dalla lobby, dal pannello Giocatori o dagli Strumenti. Chi era già in partita può rientrare dalla lista "Eri già in partita?".
- **Un telefono vede "Sei fuori dalla serata"**: è stato espulso. Nel pannello Giocatori, sotto **Espulsi stasera**, premi **Riammetti**.
- **"File corrotto" importando un backup**: il file è incompleto o è stato toccato a mano in modo sbagliato. Usa un altro backup di emergenza, oppure la macchina del tempo se sei sullo stesso computer.
- **"Il database ha rifiutato l'operazione" aggiungendo un gioco, una foto o la presenza**: chi scrive non risulta membro del gruppo (succede con un telefono che non è mai entrato in una serata del gruppo). Basta entrare nella serata in corso: la TV lo registra da sola. Per una TV: inserisci la chiave del gruppo nell'avviso in alto.
- **"Troppo veloce: riprova tra qualche secondo"**: è il limite anti-spam su pettegolezzi, effetti, time-out e foto.
- **Ho perso la chiave del gruppo**: sul computer che ha creato il gruppo è sempre negli Strumenti, sezione Il gruppo.
- **Un giocatore risulta "Non collegato" con il telefono acceso**: lo schermo si è spento o è passato a un'altra app; appena riapre la pagina torna collegato da solo.
- **Dal telefono gli effetti o i pettegolezzi non arrivano**: l'host deve attivare **Soundboard dai telefoni** o il **Ticker** in **Strumenti**. Effetti e messaggi hanno un limite di frequenza per non diventare un bombardamento.
- **Il commentatore non parla**: il browser della TV non ha una voce italiana (su Chrome e Edge di solito c'è; su Firefox per Linux spesso no) oppure la TV è in modalità **Silenzioso**. I sottotitoli compaiono comunque.
- **La musica non parte**: i browser permettono l'audio solo dopo il primo clic o tasto sulla pagina della TV. Controlla anche che la musica non sia **Spenta** in **Strumenti** e che il volume non sia a zero.
- **Il PDF non si scarica**: si apre la finestra di stampa; come stampante scegli **Salva come PDF**.
- **Una foto non si carica**: viene ridotta fino a circa 190 KB; se il telefono non riesce a leggerla (alcuni formati HEIC), scegli una foto normale o fai uno screenshot.
- **Ho perso il codice regia:** il codice è segreto e non si può leggere dal database. Se il PC che ha creato la serata funziona ancora, lo trovi nel pannello **Giocatori**; altrimenti crea una serata nuova nello stesso gruppo: ludoteca e classifica di sempre restano.
- **Ho perso il codice personale:** se il telefono vecchio è ancora acceso, è in **Il mio profilo**. Altrimenti si rientra comunque dalla lista "Eri già in partita?" con la conferma della TV.
- **Non si sentono i suoni:** il browser li permette solo dopo il primo clic sulla pagina della TV; controlla anche che siano attivi in **Strumenti** e che il volume del PC sia alzato.
- **La regia dal telefono dice "La TV non risponde":** la pagina della TV è chiusa o il PC è spento. Riaprila, oppure riprendi la serata da un altro computer con il codice regia.
- **Le stanze vecchie restano nel database**: puoi cancellarle quando vuoi dalla console Firebase, in Realtime Database › `rooms`. Non cancellare `groups` e `armadi`: lì ci sono i giochi degli armadi, i gruppi e la classifica di sempre. Le foto ricordo sono in `groups` › (gruppo) › `photos`, divise per serata: il piano gratuito di Firebase basta per migliaia di foto, ma se vuoi fare spazio puoi cancellare lì gli album più vecchi.

## Struttura dei file

```
index.html            home personale: profilo, entra in una serata (QR o codice), armadi, gruppi, app Android
host.html             schermata TV
play.html             schermata telefono
database.rules.json   regole di sicurezza da incollare in Firebase
css/style.css         tema grafico
js/config.js          configurazione Firebase (da compilare)
js/fb.js              collegamento a Firebase e messaggi di errore
js/host.js            logica della TV: lobby, votazione, reveal, classifica, premiazione
js/play.js            logica del telefono: ingresso, voto, attese
js/stats.js           medie, classifica, vittorie, premi ai giochi e ai giocatori, classifica di sempre, CSV
js/share.js           immagine della classifica e storia verticale da condividere
js/sounds.js          effetti sonori e soundboard della TV (generati al momento, nessun file audio)
js/vault.js           copie locali della serata (IndexedDB), istantanee, cronologia, controllo dei file di backup
js/safe.js            Safe Mode e guardiano degli errori
js/tour.js            tutorial guidato della TV
js/sfx.js             elenco degli effetti della soundboard (TV e telefoni)
js/music.js           musica d'atmosfera generata dal browser
js/atmo.js            atmosfere animate sullo sfondo della TV
js/tv-extras.js       TV: tavolo, ruota, segnapunti, quiz, stagioni, rivalità, figurine, video, sicurezza
js/phone-extras.js    telefono: segnapunti, squadre, quiz, figurina, rivalità, invito
js/prep.js            pre-partita: giochi sul tavolo, desideri, arrivi, scaletta
js/tv-prep.js         TV, pre-partita: riquadro della lobby, scaletta, spiegazione delle regole
js/phone-prep.js      telefono, pre-partita: giochi portati, stelline, codice a barre, porto io, regole
js/extras.js          squadre equilibrate, domande del quiz, invito .ics, CSV di BoardGameGeek
js/cards.js           figurine collezionabili (HTML e immagine)
js/recap-video.js     video riassunto della serata (canvas + MediaRecorder)
js/lite.js            modalità leggera automatica
js/fx.js              coriandoli e fuochi d'artificio su canvas
js/facts.js           curiosità del gruppo, notizie della serata e trivia (intervallo e ticker)
js/commentary.js      commentatore: frasi e sintesi vocale
js/report.js          resoconto stampabile (PDF) della serata
ludoteca.html         armadio dei giochi sul telefono: sfogliarlo e aggiungere giochi con la foto (QR dalla TV)
js/library.js         logica della pagina dell’armadio sul telefono
js/selftest.js        tavolo di verifica (pagina test.html): prove reali su Firebase e matrice dei risultati
test.html             tavolo di verifica di Firebase e delle regole
resoconto.html        resoconto della serata (giochi, voti, vincitori, premi), anche dopo la fine
js/resoconto.js       logica del resoconto
js/version.js         numero di versione (uguale a version.json e sw.js)
version.json          versione pubblicata, per avvisare dei nuovi aggiornamenti
sw.js                 service worker: app installabile e copia dei file per la rete instabile
manifest.webmanifest  nome, icone e colori dell'app installabile
js/avatars.js         personaggi DiceBear
js/util.js            funzioni condivise e icone
js/home.js            home personale (profilo, collegamento dei dispositivi, armadi, gruppi, introduzione)
js/person.js          profilo personale condiviso tra sito e app: collegamento con chiave, unione, armadi
js/native.js          app Android: link pubblici, salvataggi e condivisione, lettore di QR
js/site.js            indirizzi pubblici dell'app Android (vuoto sul sito, lo compila il workflow)
android-app/          progetto dell'app Android (Capacitor): configurazione, icone, firma
tests/                controlli automatici (regole del database e file del sito)
.github/workflows/    controlli a ogni caricamento (verifica.yml) e APK Android (android.yml)
vendor/               librerie incluse (Firebase, DiceBear, generatore e lettore di QR)
assets/               icone dell'app (dado al neon sul palco), marchio logo-mark.svg, favicon e font
```

Le librerie sono incluse nel progetto: il sito non dipende da CDN esterni, solo da Firebase.

## Donazioni

GameNight Show è gratis e senza pubblicità. Se vi piace, potete offrire un caffè su Ko-fi: https://ko-fi.com/mashaup (c’è anche il pulsante in fondo alla pagina iniziale).

## Crediti e licenze

- Avatar: [DiceBear](https://www.dicebear.com) 9.4 (MIT). Stili Adventurer di Lisa Wischofsky, Big Smile di Ashley Seo e Toon Head di Johan Melin, con licenza CC BY 4.0.
- [Firebase JavaScript SDK](https://github.com/firebase/firebase-js-sdk) 10.14 (Apache 2.0).
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 di Kazuhiko Arase (MIT).
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 di Cosmo Wolfe (Apache 2.0), lettore di QR dell'app Android.
- [Capacitor](https://capacitorjs.com) 8.5 di Ionic (MIT), con i plugin Filesystem e Share.
- Font Fredoka e Nunito (SIL Open Font License, testi in `assets/fonts`).
