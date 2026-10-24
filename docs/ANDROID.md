# App Android

Nella cartella `android-app/` c'è l'app Android vera e propria (fatta con [Capacitor](https://capacitorjs.com)): contiene una copia del sito e usa lo stesso Firebase, quindi TV, telefoni con l'app e telefoni con il browser (iPhone compresi) giocano insieme nella stessa serata. Cosa cambia rispetto al sito: [guida](GUIDA.md#cosa-cambia-nellapp-android).

## Dove si scarica

- **Pagina ufficiale di download:** `https://TUO-UTENTE.github.io/NOME-REPOSITORY/scarica.html`. L’indirizzo non cambia mai e mostra sempre l’ultima versione: versione, data, dimensione, novità, impronta SHA-256, istruzioni e requisiti (Android 7.0 o più recente). Su iPhone spiega di usare il sito; sui telefoni troppo vecchi lo dice invece di scaricare.
- **Nella home del sito**, riquadro **📲 App Android**: le stesse informazioni, il pulsante **Scarica APK** e, dal computer, un QR da inquadrare con il telefono.
- **Sulla TV:** nella schermata **Nuova serata** e in **Strumenti › 📲 App sui telefoni** c’è **Installa GameNight su un altro dispositivo**: un QR grande (leggibile dal divano) verso la pagina di download.
- Il file sta nella pagina **Releases** del repository, nell'ultima versione pubblicata. L'indirizzo stabile, che porta sempre all'ultima APK, è `https://github.com/TUO-UTENTE/GameNight_Show/releases/latest/download/GameNight-Show.apk`.

## Pubblicare una nuova versione (e l'APK)

Non serve installare niente sul computer: l'APK la prepara GitHub, **solo quando pubblichi tu una release**. I caricamenti di file (codice, link, documenti) non la ricostruiscono e non toccano le Releases, quindi non fanno partire i webhook o le notifiche delle release.

1. Aggiorna lo stesso numero in `version.json` (con data e novità in italiano e inglese), `js/version.js` e `sw.js`, e carica i file su GitHub.
2. Pubblica la release: **Releases › Draft a new release › Choose a tag**, scrivi `v1.10.0`, scegli **Create new tag: v1.10.0 on publish**, scrivi titolo e testo come vuoi e premi **Publish release**. Lascia spuntato **Set as the latest release**.
3. Nella scheda **Actions** parte **App Android** (5-8 minuti). Controlla che il tag corrisponda a `version.json` (`v1.10` vale come `1.10.0`) e rifà i controlli automatici: se qualcosa non va, si ferma senza pubblicare l'APK.
4. Alla fine aggiunge **GameNight-Show.apk** alla tua release. Carica solo il file: la release non viene modificata (il tuo testo resta com'è e non partono altri eventi). L'impronta SHA-256 la calcola GitHub.

Un tag creato da terminale (`git push origin v1.10.0`) **non** basta: serve la release pubblicata. Una release segnata come **pre-release** riceve l'APK, ma l'app non la propone (utile per le prove).

Nei minuti tra la pubblicazione e la fine del lavoro, le app vedono la nuova versione come **in preparazione**: è normale, basta aspettare. Se il tag non corrisponde a `version.json`, cancella la release e il tag, correggi e pubblica di nuovo.

**Passaggio dalla 1.3 (una volta sola).** Le app 1.3 già installate leggono ancora la vecchia release **App Android** (`app-android`). Finché esiste, il lavoro la aggiorna insieme alla tua (così quei telefoni ricevono la 1.5); è l'unico caso in cui una release viene modificata da GitHub. Quando tutti gli amici hanno la 1.5 o più recente, cancellala: **Releases › App Android › Delete**, poi **Tags › app-android › Delete**. Da lì in poi esistono solo le release fatte da te.

Se il lavoro **App Android** ha la croce rossa, aprilo: in fondo alla pagina c’è il riquadro **Cosa è andato storto** con le righe dell’errore. Se l'errore è di permessi alla fine ("Resource not accessible by integration"): **Settings › Actions › General › Workflow permissions**, scegli **Read and write permissions** e salva, poi **Re-run jobs**.

## Come si installa sul telefono

1. Dal telefono apri il link dell'APK (o tocca **📲 Scarica l'app Android** nella pagina iniziale o nella scheda "Installa l'app" del sito: compare solo sui telefoni Android).
2. Apri il file scaricato. La prima volta Android chiede di permettere l'installazione da quella app (Chrome, Files…): consentila e torna indietro.
3. Play Protect può avvisare che l'app non è conosciuta: tocca **Installa comunque**. È normale per le app che non passano dal Play Store.

Gli aggiornamenti si installano allo stesso modo, sopra la versione vecchia: profili e impostazioni restano.

## Aggiornamenti dall’app

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

## Firebase

Non c'è niente da aggiungere: l'app usa lo stesso progetto e le stesse regole. Solo se hai limitato la chiave API ai siti web ([passo 2.5](INSTALLAZIONE.md#25-collega-lapp-web)), aggiungi anche `https://localhost/*`. `localhost` è già tra i **Domini autorizzati** di Authentication; se l'hai tolto, rimettilo.

## La firma dell'app

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

## Indirizzo del sito

Il workflow ricava da solo l'indirizzo del sito (`https://TUO-UTENTE.github.io/NOME-REPOSITORY/`). Se usi un dominio tuo, impostalo in **Settings › Secrets and variables › Actions › Variables** con il nome `SITE_URL` (per esempio `https://giochi.miodominio.it/`).

## Per chi vuole aprirla in Android Studio

```
cd android-app
npm install
SITE_URL=https://TUO-UTENTE.github.io/GameNight_Show/ npm run sync
```

Poi apri la cartella `android-app/android` in Android Studio. `npm run apk` costruisce l'APK firmata dal terminale (serve l'Android SDK).

## Android TV

L'app si può installare anche su Android TV e Google TV (compare tra le app grazie al banner e alla categoria *Leanback*): la stessa APK, nessuna versione a parte. Sul televisore il telecomando funziona con le frecce, OK e Indietro: il fuoco si sposta tra pulsanti e campi e resta ben visibile. Dalla regia, il tasto **A** (o il comando dal telefono) accende lo **schermo ambiente** fra una partita e l'altra. La fotocamera e i telefoni non servono alla TV: i giocatori entrano come sempre dai loro telefoni.

Va provata a mano su un televisore vero (vedi [VERIFICA.md](VERIFICA.md)): nel nostro ambiente di prova non c'è un emulatore Android TV.

## Esportazioni dall'app

Nell'app Android non esistono i download e la stampa del browser. Per questo:

- **CSV, JSON, backup, registro errori, calendario (.ics), video, immagini**: si salvano in **Documenti/GameNight Show**; se il telefono non lo permette si apre **Condividi**;
- **PDF della serata e resoconto**: l'app costruisce un **PDF vero** (testo selezionabile, foto dell'album), lo salva in Documenti/GameNight Show e lo apre con il lettore PDF del telefono;
- **manuali salvati sul dispositivo**: si aprono con il lettore del telefono (PDF o foto).
