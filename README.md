<p align="center"><img src="assets/brand/logo-256.webp" width="128" height="128" alt="Logo di GameNight Show: dado rosso con la stella"></p>

<h1 align="center">GameNight Show</h1>

<p align="center">
  La serata di giochi da tavolo diventa uno show: si vota dal telefono, la TV svela i voti, alla fine c'è la premiazione.<br>
  <b>Gratis, senza pubblicità, senza installare niente.</b> Italiano · English
</p>

<p align="center">
  <a href="https://mashaup.github.io/GameNight_Show/">🌐 Apri GameNight Show</a> ·
  <a href="https://mashaup.github.io/GameNight_Show/scarica.html">📲 App Android</a> ·
  <a href="https://mashaup.github.io/GameNight_Show/go.html?to=discord">💬 Discord</a> ·
  <a href="https://mashaup.github.io/GameNight_Show/go.html?to=bugs">🐞 Segnala un problema</a> ·
  <a href="https://mashaup.github.io/GameNight_Show/go.html?to=kofi">☕ Ko-fi</a>
</p>

<p align="center">
  <a href="https://github.com/MashaUP/GameNight_Show/actions/workflows/verifica.yml"><img src="https://github.com/MashaUP/GameNight_Show/actions/workflows/verifica.yml/badge.svg" alt="Verifica"></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmashaup.github.io%2FGameNight_Show%2Fversion.json&query=%24.version&label=versione&color=7B5CFF" alt="Versione pubblicata"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licenza-MIT-FFD23F" alt="Licenza MIT"></a>
</p>

**Versione 1.5.0** · [Novità](CHANGELOG.md) · [Guida completa](docs/GUIDA.md) · [Contribuire](CONTRIBUTING.md)

> **Hai già la tua copia?** A ogni nuova versione ricopia `database.rules.json` in Firebase e premi **Pubblica** ([passo 2.3](#23-regole-del-database)): molte funzioni dipendono dalle regole del database.

## Indice

- [Che cos'è](#che-cosè)
- [Come funziona una serata](#come-funziona-una-serata)
- [Funzionalità](#funzionalità)
- [Stato del progetto](#stato-del-progetto)
- [Installa la tua copia](#installa-la-tua-copia) (GitHub, Firebase, GitHub Pages: circa 10 minuti)
- [App Android](#app-android)
- [Link ufficiali e configurazione remota](#link-ufficiali-e-configurazione-remota)
- [Tecnologie](#tecnologie) · [Struttura del progetto](#struttura-del-progetto)
- [Prova in locale](#prova-in-locale) · [Prove automatiche](#prove-automatiche)
- [Come contribuire](#come-contribuire) · [Community e sostegno](#community-e-sostegno)
- [Privacy](#privacy) · [Sicurezza](#sicurezza) · [Licenza](#licenza) · [Crediti](#crediti-e-licenze)

## Che cos'è

GameNight Show è una web app per le serate di giochi da tavolo tra amici. Un computer collegato alla TV fa da
"regia", ognuno vota dal proprio telefono, e dopo ogni partita la TV svela i voti con le carte che si girano,
aggiorna la classifica e a fine serata fa la premiazione, con premi ai giochi e ai giocatori.

Ogni serata appartiene a un **gruppo**, che ricorda tutto da una volta all'altra: classifica di sempre, ricordi,
foto, statistiche, livelli e traguardi. I giochi che avete stanno nell'**armadio**, da sfogliare e cercare anche
dal telefono.

Funziona nel browser su computer, Android e iPhone. Su Android c'è anche l'app da installare. Serve solo
una connessione a internet; i dati stanno sul tuo progetto Firebase (gratuito).

## Come funziona una serata

1. **La TV** (un portatile collegato al televisore) apre `host.html` e crea la stanza.
2. **I telefoni** inquadrano il QR sulla TV, scelgono nome e personaggio. Chi arriva dopo entra quando vuole.
3. **Dopo ogni partita** l'host scrive il gioco e apre la votazione: un voto da 1 a 10, tre criteri da 1 a 5 e l'MVP. I voti restano segreti finché la TV non li svela.
4. **A fine serata** la premiazione: podio, premi speciali, immagine da condividere, resoconto in PDF.

Passo per passo, con tutte le schermate: [docs/GUIDA.md](docs/GUIDA.md).

## Funzionalità

Tutte disponibili nella versione attuale (dettagli nella [guida](docs/GUIDA.md#tutte-le-funzioni-in-breve)):

- **Voto e reveal:** voto generale, criteri, MVP, pubblico per chi guarda, voto veloce, "Indovina la media"; reveal con le carte, ritmo crescente, versione cinematica.
- **Classifica e premi:** classifica della serata e di sempre, premi ai giochi (il più coinvolgente, il più divisivo…) e ai giocatori (MVP, il più vincente, il critico, le anime gemelle…).
- **Gruppi:** identità (emblema, motto, colore), ricordi di ogni serata, album di foto, calendario e presenze, stagioni, Hall of Fame, Wrapped dell'anno.
- **Armadio dei giochi:** foto, schede complete, prestiti, cronologia, cestino, link pubblico in sola lettura, ricerca a frasi ("per 5 persone, massimo 45 minuti"), importazione da BoardGameGeek (CSV).
- **Durante la partita:** segnapunti dal vivo, chi inizia, squadre, clessidra, pronostici, time-out, soundboard, pettegolezzi nel ticker della TV.
- **Prima della partita:** giochi di stasera (anche dal codice a barre), "voglio giocare a…", scaletta, scheda delle regole, consigli su cosa giocare.
- **Show:** tema da studio televisivo, musica e atmosfere generate dal browser, commentatore con sintesi vocale, fuochi d'artificio.
- **Profilo personale:** nome, personaggio su misura, livelli, 18 traguardi, statistiche; lo stesso profilo su sito, telefono e app.
- **Affidabilità:** salvataggio a ogni mossa, macchina del tempo, ripresa dopo un crash, regia da un altro dispositivo, voti in coda se cade la rete, Safe Mode, controllo integrità, registro errori.
- **Sicurezza:** regole del database con permessi precisi, codice regia segreto, chiave del gruppo, limiti anti-spam, protezione da HTML nei testi, Content-Security-Policy.
- **Accessibilità:** testo più grande, alto contrasto, colori per daltonici, meno animazioni, uso da tastiera.
- **Lingue:** italiano e inglese, scelti in Impostazioni › Lingua ([cosa è tradotto](#stato-del-progetto)).
- **App Android** con aggiornamenti verificati (dimensione e SHA-256) e installazione con conferma di Android.
- **Community:** GitHub, Discord, guida e segnalazioni a un tocco, con link aggiornabili senza nuove versioni.
- Pulsante **Cerca aggiornamento** nella home e nelle impostazioni; **Ko-fi** per chi vuole sostenere il progetto.

## Stato del progetto

In sviluppo attivo. Versione **1.5.0** ([novità](CHANGELOG.md)).

| Parte | Stato |
|---|---|
| Serata completa (TV + telefoni), gruppi, armadio, app Android | stabile |
| Nuovo design (logo, home) | home fatta; le altre pagine nella 1.6 |
| Inglese | home, impostazioni, profilo, download, aggiornamenti, schermate principali del telefono; TV, armadio, resoconto e pannelli extra del telefono ancora in italiano (1.7) |
| BoardGameGeek con ricerca e schede | proxy pronto in `bgg-proxy/`, integrazione nell'app nella 1.8 |
| Prove automatiche | controlli statici, regole del database, link, 32 prove nel browser |

Il piano completo, con le priorità, è in [docs/AUDIT.md](docs/AUDIT.md#8-piano-degli-incrementi).

## Installa la tua copia

Puoi provare GameNight Show sul sito ufficiale; per le vostre serate conviene una copia tutta vostra: è gratis
e i dati restano nel vostro Firebase. Ti servono:

- un account GitHub (per pubblicare il sito, gratis);
- un account Google per Firebase (il database in tempo reale, gratis con il piano Spark).

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

Le regole fanno in modo che solo la TV che ha creato la stanza possa guidarla, che ognuno possa votare solo per sé e solo mentre la votazione è aperta, e che le serate salvate in un gruppo arrivino solo dalla TV che le ha guidate. Il profilo personale (`people`) lo leggono e lo modificano solo i dispositivi collegati con la sua chiave. Negli armadi, prestiti, cronologia, cestino e inviti li vedono solo proprietario e collaboratori; la cronologia non si può modificare; il catalogo pubblico (`pub`) si legge solo conoscendo il link e lo scrive solo chi può modificare l’armadio.

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

## App Android

Nella cartella `android-app/` c'è l'app Android vera e propria (fatta con [Capacitor](https://capacitorjs.com)): contiene una copia del sito e usa lo stesso Firebase, quindi TV, telefoni con l'app e telefoni con il browser (iPhone compresi) giocano insieme nella stessa serata. Cosa cambia rispetto al sito: [guida](docs/GUIDA.md#cosa-cambia-nellapp-android).

### Dove si scarica

- **Pagina ufficiale di download:** `https://TUO-UTENTE.github.io/NOME-REPOSITORY/scarica.html`. L’indirizzo non cambia mai e mostra sempre l’ultima versione: versione, data, dimensione, novità, impronta SHA-256, istruzioni e requisiti (Android 7.0 o più recente). Su iPhone spiega di usare il sito; sui telefoni troppo vecchi lo dice invece di scaricare.
- **Nella home del sito**, riquadro **📲 App Android**: le stesse informazioni, il pulsante **Scarica APK** e, dal computer, un QR da inquadrare con il telefono.
- **Sulla TV:** nella schermata **Nuova serata** e in **Strumenti › 📲 App sui telefoni** c’è **Installa GameNight su un altro dispositivo**: un QR grande (leggibile dal divano) verso la pagina di download.
- Il file sta nella pagina **Releases** del repository, nell'ultima versione pubblicata. L'indirizzo stabile, che porta sempre all'ultima APK, è `https://github.com/TUO-UTENTE/GameNight_Show/releases/latest/download/GameNight-Show.apk`.

### Pubblicare una nuova versione (e l'APK)

Non serve installare niente sul computer: l'APK la prepara GitHub, **solo quando pubblichi tu una release**. I caricamenti di file (codice, link, documenti) non la ricostruiscono e non toccano le Releases, quindi non fanno partire i webhook o le notifiche delle release.

1. Aggiorna lo stesso numero in `version.json` (con data e novità in italiano e inglese), `js/version.js` e `sw.js`, e carica i file su GitHub.
2. Pubblica la release: **Releases › Draft a new release › Choose a tag**, scrivi `v1.5.0`, scegli **Create new tag: v1.5.0 on publish**, scrivi titolo e testo come vuoi e premi **Publish release**. Lascia spuntato **Set as the latest release**.
3. Nella scheda **Actions** parte **App Android** (5-8 minuti). Controlla che il tag corrisponda a `version.json` (`v1.5` vale come `1.5.0`) e rifà i controlli automatici: se qualcosa non va, si ferma senza pubblicare l'APK.
4. Alla fine aggiunge **GameNight-Show.apk** alla tua release. Carica solo il file: la release non viene modificata (il tuo testo resta com'è e non partono altri eventi). L'impronta SHA-256 la calcola GitHub.

Un tag creato da terminale (`git push origin v1.5.0`) **non** basta: serve la release pubblicata. Una release segnata come **pre-release** riceve l'APK, ma l'app non la propone (utile per le prove).

Nei minuti tra la pubblicazione e la fine del lavoro, le app vedono la nuova versione come **in preparazione**: è normale, basta aspettare. Se il tag non corrisponde a `version.json`, cancella la release e il tag, correggi e pubblica di nuovo.

**Passaggio dalla 1.3 (una volta sola).** Le app 1.3 già installate leggono ancora la vecchia release **App Android** (`app-android`). Finché esiste, il lavoro la aggiorna insieme alla tua (così quei telefoni ricevono la 1.5); è l'unico caso in cui una release viene modificata da GitHub. Quando tutti gli amici hanno la 1.5 o più recente, cancellala: **Releases › App Android › Delete**, poi **Tags › app-android › Delete**. Da lì in poi esistono solo le release fatte da te.

Se il lavoro **App Android** ha la croce rossa, aprilo: in fondo alla pagina c’è il riquadro **Cosa è andato storto** con le righe dell’errore. Se l'errore è di permessi alla fine ("Resource not accessible by integration"): **Settings › Actions › General › Workflow permissions**, scegli **Read and write permissions** e salva, poi **Re-run jobs**.

### Come si installa sul telefono

1. Dal telefono apri il link dell'APK (o tocca **📲 Scarica l'app Android** nella pagina iniziale o nella scheda "Installa l'app" del sito: compare solo sui telefoni Android).
2. Apri il file scaricato. La prima volta Android chiede di permettere l'installazione da quella app (Chrome, Files…): consentila e torna indietro.
3. Play Protect può avvisare che l'app non è conosciuta: tocca **Installa comunque**. È normale per le app che non passano dal Play Store.

Gli aggiornamenti si installano allo stesso modo, sopra la versione vecchia: profili e impostazioni restano.

### Aggiornamenti dall’app

Dalla versione 1.3 l’app controlla da sola se c’è una versione nuova (al massimo ogni mezz’ora, con le informazioni lette al massimo ogni 6 ore) e mostra **È disponibile GameNight Show 1.5.0 · hai la 1.4.0** con la prima novità. **✕** lo chiude per quella versione: torna solo quando ne esce una ancora più nuova. Se la rete non c’è o GitHub non risponde, l’app funziona normalmente e non dice niente.

In **⚙️ Impostazioni › 📲 Aggiornamenti e download dell’app** (o dal pulsante **Vedi e scarica** dell’avviso) c’è la sezione **Scarica GameNight**:

- versione e build installate, ultima versione pubblicata, data, dimensione, requisiti e novità;
- **🔄 Controlla aggiornamenti** (controllo vero, subito) e lo stato: *aggiornata*, *disponibile*, *build più recente* (stessa versione con correzioni), *in preparazione* (versione già sul sito ma APK ancora in costruzione: riprova tra qualche minuto), *nessuna connessione*;
- **⬇️ Scarica APK**: scarica l’APK **solo dall’indirizzo ufficiale**, con la barra di avanzamento, poi controlla **dimensione e impronta SHA-256** pubblicate dal workflow. Se qualcosa non torna (file vuoto, incompleto, diverso) lo cancella e non lo installa;
- **📲 Installa**: apre la schermata di installazione di Android. **L’app non si installa da sola**: Android chiede conferma e, la prima volta, il permesso **Installa app sconosciute** per GameNight Show (Impostazioni › Consenti da questa fonte). Android controlla anche che l’APK sia firmata con la stessa chiave di quella installata;
- il QR per **installare GameNight su un altro dispositivo**.

Le app installate prima della 1.3 mostrano ancora il vecchio avviso con il download nel browser: dopo aver installato la 1.3 a mano, gli aggiornamenti successivi si fanno dall’app.

**Da dove arrivano le informazioni (gratis, niente server in più):**
- `version.json` del sito: versione, data, novità e Android minimo. **A ogni nuova versione si aggiorna questo file** (le novità sono quelle mostrate nell’app, in italiano e in inglese).
- L'ultima release pubblicata su GitHub: versione (dal tag), dimensione e impronta SHA-256 dell'APK (calcolata da GitHub), numero di build (nell'etichetta del file). L’app li legge con l’API pubblica di GitHub (senza chiavi, 60 richieste l’ora per rete: ne basta una ogni 6 ore).

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

## Link ufficiali e configurazione remota

Gli indirizzi ufficiali (GitHub, Discord, Ko-fi, guida, segnalazioni, proposte) stanno **solo** in
[`config/links.json`](config/links.json). L'interfaccia li chiede per nome (`github`, `discord`, `kofi`…):
icone di GitHub e Discord nel footer della home, pulsanti Ko-fi, elenco **Profilo e app › Community e supporto**.

- **Sito:** il file è quello pubblicato su GitHub Pages; il service worker lo riprende a ogni apertura e lo tiene per l'offline.
- **App Android:** parte dal file incluso nell'APK e lo aggiorna dalla copia pubblicata sul sito (al massimo ogni 6 ore, o subito con **Cerca aggiornamento**). L'ultima copia valida resta sul telefono e vale anche offline.
- **Sicurezza:** solo `https`, solo domini ammessi dal codice (`js/links-policy.js`), regole per ogni link (un `discord` porta solo a Discord), nessun codice eseguito dal file, copia di base sempre come riserva. Un file rotto o non valido viene ignorato senza fermare niente.

**Cambiare l'invito Discord (o un altro link) senza una nuova versione:** su GitHub modifica `config/links.json`
(campo `url` e data `updated`) e salva con un commit. Il sito lo usa alla prossima apertura, l'app Android entro
6 ore (o subito con **Cerca aggiornamento**). Non serve una release né una nuova APK.

**Spegnere un link:** `"enabled": false` (il link sparisce dalle schermate, niente pulsanti vuoti).
**Aggiungerne uno:** una voce nuova su un dominio già ammesso compare da sola in "Community e supporto".

**Collegamenti stabili** per README, QR e messaggi: `https://mashaup.github.io/GameNight_Show/go.html?to=discord`
(oppure `github`, `kofi`, `bugs`, `ideas`) porta sempre alla destinazione attuale scritta nel JSON.

Formato, cache, errori, sicurezza, riuso in altri progetti ed estensioni Chrome: **[docs/LINKS.md](docs/LINKS.md)**.

## Tecnologie

- **HTML, CSS e JavaScript** (moduli ES), senza framework né bundler: i file del repository sono il sito.
- **Firebase Realtime Database** con accesso anonimo (piano gratuito Spark); la sicurezza sta nelle regole (`database.rules.json`).
- **GitHub Pages** per il sito, **GitHub Actions** per le prove e per l'APK.
- **Capacitor 8** per l'app Android.
- **Service worker** per l'uso con la rete instabile e l'installazione come app.
- Librerie incluse nel repository (nessun CDN): Firebase JS SDK, DiceBear (personaggi), qrcode-generator, jsQR.
- Facoltativo: un **Cloudflare Worker** gratuito per BoardGameGeek (`bgg-proxy/`).
- Prove: Node (`node:test`, targaryen per le regole) e Playwright con Chromium.

## Struttura del progetto

```
index.html, js/home.js     home: profilo, entra in una serata, armadi, serate, gruppi, app, community
host.html, js/host.js      la TV (regia): lobby, votazione, reveal, classifica, premiazione
play.html, js/play.js      il telefono durante la serata
armadio.html, ludoteca.html  l'armadio dei giochi (computer e telefono)
resoconto.html, scarica.html, test.html, go.html  resoconto, download dell'app, verifica di Firebase, collegamenti stabili
config/links.json          link ufficiali (unica fonte, aggiornabile senza nuove versioni)
database.rules.json        regole di sicurezza da incollare in Firebase
version.json               versione pubblicata e novità (lette dagli aggiornamenti dell'app)
css/style.css, css/ui.css  stile delle schermate e sistema di design
js/                        moduli (elenco completo qui sotto)
js/lang/it.js, en.js       testi in italiano e inglese
android-app/               app Android (Capacitor): configurazione, icone, firma
bgg-proxy/                 proxy BoardGameGeek per Cloudflare Workers (facoltativo)
tests/                     controlli statici, regole, link, prove nel browser (tests/e2e)
docs/                      GUIDA.md, LINKS.md, AUDIT.md, PRIVACY.md
.github/                   workflow (Verifica, App Android, proxy BGG), moduli per le segnalazioni,
                           pulsante Sponsor (Ko-fi), modello per le pull request
LICENSE, CONTRIBUTING.md, SECURITY.md   licenza MIT, come contribuire, segnalazioni di sicurezza
vendor/, assets/           librerie incluse; icone, marchio, font
```

<details>
<summary>I moduli in <code>js/</code></summary>

```
config.js        configurazione Firebase (da compilare)          services.js     indirizzi dei servizi facoltativi (BGG, link)
site.js          indirizzi pubblici dell'app Android (workflow)   version.js      numero di versione
i18n.js          lingue: t('chiave'), plurali, date, numeri        lang/           dizionari it/en
links-core.js    link ufficiali: nucleo riutilizzabile            links-policy.js domini ammessi per i link
links.js         link ufficiali: adattatore web e interfaccia     go.js           collegamenti stabili (go.html)
fb.js            collegamento a Firebase e messaggi di errore     util.js         funzioni condivise, icone, registro errori
home.js          home personale                                   person.js       profilo personale su più dispositivi
host.js          TV                                               play.js         telefono
stats.js         medie, classifiche, premi, record, consigli      share.js        immagini da condividere
tv-extras.js     TV: tavolo, ruota, quiz, stagioni, figurine     phone-extras.js telefono: segnapunti, squadre, quiz
prep.js, tv-prep.js, phone-prep.js   pre-partita                  extras.js       squadre, quiz, .ics, CSV di BGG
armadio.js, collection.js, library.js   armadio dei giochi        resoconto.js, report.js   resoconto e PDF
updates.js       aggiornamenti e download dell'app                native.js       app Android: link, salvataggi, QR
sounds.js, sfx.js, music.js, atmo.js, fx.js   suoni, musica, atmosfere, effetti
commentary.js, facts.js   commentatore, curiosità e ticker        cards.js, recap-video.js  figurine, video riassunto
vault.js, safe.js, stale.js, lite.js   copie locali, Safe Mode, file vecchi, modalità leggera
avatars.js       personaggi DiceBear                              tour.js         tutorial della TV
selftest.js      tavolo di verifica (test.html)                   scarica.js      pagina di download
```

</details>

## Lingue

GameNight Show parla **italiano** e **inglese**. La lingua si sceglie in **Impostazioni › Lingua** (home del sito e dell'app) e vale solo per quel dispositivo: TV e telefoni possono usare lingue diverse nella stessa serata. Alla prima apertura si usa la lingua del dispositivo, con l'italiano come riserva.

- I testi stanno in `js/lang/it.js` e `js/lang/en.js`, con le stesse chiavi; `js/i18n.js` li usa (`t('chiave', { parametri })`, plurali, date e numeri nella lingua scelta).
- `tests/check.mjs` blocca il caricamento se una traduzione manca o se i `{parametri}` non coincidono tra le lingue.
- I dati salvati nel database restano neutri (codici, non testi tradotti): nomi di giochi, giocatori e note non si traducono.
- Le novità di `version.json` hanno due elenchi: `notes` (italiano) e `notesEn` (inglese).

## Prova in locale

I moduli JavaScript non funzionano aprendo i file con doppio clic: serve un piccolo server. Dalla cartella del progetto:

```
python3 -m http.server 8000
```

Poi apri `http://localhost:8000/host.html`. Per collegare i telefoni dalla stessa wifi, sulla TV usa l'indirizzo IP del computer (es. `http://192.168.1.20:8000/host.html`), così anche il QR punta lì; in questo caso aggiungi quell'IP anche tra i **Domini autorizzati** di Firebase.

## Prove automatiche

`tests/README.md` spiega tutto. In breve:

```
cd tests && npm install && npm test     # file, versioni, traduzioni, link, codice (ESLint), regole del database
python3 tests/e2e/run.py                # il sito vero in Chromium, con un finto Firebase (32 prove)
node --test bgg-proxy/test/worker.test.mjs
```

GitHub le esegue a ogni caricamento (workflow **Verifica**); le stesse verifiche statiche bloccano anche la pubblicazione dell'APK.

## Come contribuire

- **Hai trovato un problema?** [Segnalalo su GitHub](https://mashaup.github.io/GameNight_Show/go.html?to=bugs): c'è un modulo guidato (versione, dispositivo, passi). Non scrivere codici dei gruppi, chiavi o dati personali: le segnalazioni sono pubbliche.
- **Hai un'idea?** [Proponila](https://mashaup.github.io/GameNight_Show/go.html?to=ideas) o parlane su [Discord](https://mashaup.github.io/GameNight_Show/go.html?to=discord).
- **Vuoi modificare il codice?** Fai un fork, prova in locale, esegui le prove e apri una pull request. Preparazione del computer, regole del progetto (niente framework, tutto gratuito, testi in due lingue, link in `config/links.json`, regole del database con le prove) e pubblicazione delle versioni: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## BoardGameGeek (facoltativo)

La cartella `bgg-proxy/` contiene un Cloudflare Worker gratuito che collega GameNight Show a BoardGameGeek senza mettere il token di BGG nel sito. Va attivato una volta: registrazione dell'app su BGG, Worker su Cloudflare, indirizzo in `js/services.js`. Guida completa: `bgg-proxy/README.md`. Senza proxy tutto funziona come prima (l'importazione del CSV di BGG resta).

## Privacy

[`docs/PRIVACY.md`](docs/PRIVACY.md): cosa resta sul dispositivo, cosa va su Firebase, cosa (eventualmente) al proxy di BoardGameGeek e alla copia pubblica dei link. Niente pubblicità, statistiche di utilizzo o servizi di intelligenza artificiale.

## Sicurezza

Un problema di sicurezza (regole del database, testi che diventano codice, link, aggiornamenti dell'app) va segnalato **in privato**, non con una segnalazione pubblica: [SECURITY.md](SECURITY.md).

## Problemi comuni

- **"Manca la configurazione"**: `js/config.js` non è stato compilato o non è stato caricato su GitHub (passo 2.5).
- **"L'accesso anonimo non è attivo"**: rivedi il passo 2.4.
- **"Il database ha rifiutato l'operazione"**: le regole del passo 2.3 non sono state ricopiate dopo l'ultimo aggiornamento, oppure manca `databaseURL` in `config.js`.
- **L'app dice "in preparazione" da molto**: hai caricato la nuova versione ma non hai pubblicato la release, oppure il lavoro **App Android** è fallito (vedi [Pubblicare una nuova versione](#pubblicare-una-nuova-versione-e-lapk)).

Tutti gli altri (stanze, telefoni scollegati, foto, suoni, backup…) sono nella [guida](docs/GUIDA.md#problemi-comuni).

## Community e sostegno

- 💬 **Discord:** [community di GameNight Show](https://mashaup.github.io/GameNight_Show/go.html?to=discord)
- 🐙 **GitHub:** [MashaUP/GameNight_Show](https://github.com/MashaUP/GameNight_Show)
- ☕ **Ko-fi:** GameNight Show è gratis e senza pubblicità. Se vi piace, potete [offrire un caffè](https://mashaup.github.io/GameNight_Show/go.html?to=kofi) (c'è anche il pulsante nella home).

## Licenza

Il codice di GameNight Show è distribuito con licenza **MIT** ([LICENSE](LICENSE)): puoi usarlo, modificarlo e ridistribuirlo, anche per altri progetti, mantenendo l'avviso di copyright. Le librerie in `vendor/` e i font in `assets/fonts/` hanno le loro licenze (qui sotto). Se pubblichi una versione modificata, usa un nome e un logo diversi.

## Crediti e licenze

- Avatar: [DiceBear](https://www.dicebear.com) 9.4 (MIT). Stili Adventurer di Lisa Wischofsky, Big Smile di Ashley Seo e Toon Head di Johan Melin, con licenza CC BY 4.0.
- [Firebase JavaScript SDK](https://github.com/firebase/firebase-js-sdk) 10.14 (Apache 2.0).
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 di Kazuhiko Arase (MIT).
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 di Cosmo Wolfe (Apache 2.0), lettore di QR dell'app Android.
- [Capacitor](https://capacitorjs.com) 8.5 di Ionic (MIT), con i plugin Filesystem e Share.
- Font Atkinson Hyperlegible Next (testi dell’interfaccia), Fredoka (titoli e numeri) e Nunito (immagini da condividere): SIL Open Font License, testi in `assets/fonts`.
- Icone di GitHub ([Octicons](https://github.com/primer/octicons), MIT) e di Discord ([Simple Icons](https://simpleicons.org), CC0), usate solo per collegarsi ai rispettivi servizi.
