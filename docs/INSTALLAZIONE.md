# Installa la tua copia di GameNight Show

Puoi provare GameNight Show sul [sito ufficiale](https://mashaup.github.io/GameNight_Show/); per le vostre serate conviene una copia tutta vostra: è gratis e i dati restano nel vostro Firebase. Ti servono:

- un account GitHub (per pubblicare il sito, gratis);
- un account Google per Firebase (il database in tempo reale, gratis con il piano Spark).

La configurazione si fa una volta sola e richiede circa 10 minuti.

> **Hai già la tua copia?** A ogni nuova versione ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([passo 2.3](#23-regole-del-database)): molte funzioni dipendono dalle regole del database.

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
2. Cancella tutto, incolla il contenuto del file `firebase/database.rules.json` di questo progetto e clicca **Pubblica**.

Le regole fanno in modo che solo la TV che ha creato la stanza possa guidarla, che ognuno possa votare solo per sé e solo mentre la votazione è aperta, e che le serate salvate in un gruppo arrivino solo dalla TV che le ha guidate. Il profilo personale (`people`) lo leggono e lo modificano solo i dispositivi collegati con la sua chiave. Negli armadi, prestiti, cronologia, cestino e inviti li vedono solo proprietario e collaboratori; la cronologia non si può modificare; il catalogo pubblico (`pub`) si legge solo conoscendo il link e lo scrive solo chi può modificare l’armadio.

**Ogni volta che il file `firebase/database.rules.json` cambia** (per esempio con una nuova versione), ricopialo in Firebase e premi **Pubblica**: altrimenti le funzioni nuove vengono rifiutate dal database.

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
- armadio (permessi e chiave), giochi dell’armadio nella stanza (le stelline della serata non toccano la collezione), armadio organizzato (rinomina, foto leggere, prestiti privati, cronologia non modificabile, cestino, link pubblico in sola lettura, invito per una sola persona e revoca, esporta/importa), gruppo, serata salvata una volta sola, fine serata e resoconto, profilo personale su più dispositivi.

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


## 4. Servizi facoltativi

- **BoardGameGeek** (ricerca, schede e copertine): un Cloudflare Worker gratuito che tiene il token di BGG fuori dal sito. Guida: [`bgg-proxy/README.md`](../bgg-proxy/README.md). Una volta pubblicato, basta scriverne l'indirizzo in `js/services.js` (`BGG_PROXY_URL`): non serve cambiare altro codice. Senza proxy tutto funziona come prima (resta l'importazione del CSV di BGG).
- **Link ufficiali** (Discord, Ko-fi, GitHub…): stanno in [`config/links.json`](../config/links.json) e si cambiano senza nuove versioni ([LINKS.md](LINKS.md)).
- **App Android**: [ANDROID.md](ANDROID.md).

## Problemi comuni

- **"Manca la configurazione"**: `js/config.js` non è stato compilato o non è stato caricato su GitHub (passo 2.5).
- **"L'accesso anonimo non è attivo"**: rivedi il passo 2.4.
- **"Il database ha rifiutato l'operazione"**: le regole del passo 2.3 non sono state ricopiate dopo l'ultimo aggiornamento, oppure manca `databaseURL` in `config.js`.
- **L'app dice "in preparazione" da molto**: hai caricato la nuova versione ma non hai pubblicato la release, oppure il lavoro **App Android** è fallito (vedi [ANDROID.md](ANDROID.md#pubblicare-una-nuova-versione-e-lapk)).

Il **centro diagnostica** (home › Profilo e app › I tuoi dati e la privacy › Centro diagnostico) controlla da solo Firebase, accesso, regole, rete, file offline, spazio, BoardGameGeek e aggiornamenti. Tutti gli altri problemi (stanze, telefoni scollegati, foto, suoni, backup…) sono nella [guida](GUIDA.md#problemi-comuni).
