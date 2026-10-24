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

**Versione 1.10.0** · [Novità](CHANGELOG.md) · [Guida](docs/GUIDA.md) · [Installa la tua copia](docs/INSTALLAZIONE.md) · [App Android](docs/ANDROID.md)

## Che cos'è

GameNight Show è una web app per le serate di giochi da tavolo tra amici. Un computer (o un'Android TV) collegato
al televisore fa da **regia**, ognuno vota dal proprio telefono, e dopo ogni partita la TV svela i voti con le
carte che si girano, aggiorna la classifica e a fine serata fa la premiazione.

Ogni serata appartiene a un **gruppo**, che ricorda tutto da una volta all'altra: classifica di sempre, ricordi,
foto, statistiche e il riepilogo dell'anno. I giochi che avete stanno nell'**armadio**, da sfogliare anche dal
telefono. Funziona nel browser su computer, Android e iPhone; su Android (anche TV) c'è l'app. I dati stanno sul
tuo progetto Firebase gratuito.

## Come funziona una serata

1. **La TV** apre `host.html` e crea la stanza.
2. **I telefoni** inquadrano il QR, scelgono nome e personaggio. Chi arriva dopo entra quando vuole.
3. **Dopo ogni partita** si vota: un voto da 1 a 10, tre criteri e l'MVP. I voti restano segreti finché la TV non li svela.
4. **A fine serata** la premiazione: podio, premi speciali, immagine da condividere, resoconto in PDF.

Passo per passo, con tutte le schermate: [docs/GUIDA.md](docs/GUIDA.md).

## Funzionalità

- **Voto e reveal:** criteri, MVP, pubblico, voto veloce, "Indovina la media", reveal con le carte.
- **Classifica e premi** della serata e di sempre, ai giochi e ai giocatori; **Il vostro anno** da sfogliare e condividere.
- **Gruppi:** identità, ricordi, album, calendario, stagioni, Hall of Fame.
- **Armadio:** foto (con ritaglio), schede, prestiti con avvisi di scadenza, cestino, **catalogo pubblico** con campi scelti, **preferiti**, ricerca a frasi, **BoardGameGeek** (ricerca e schede, tramite proxy), **manuali** (link, file sul dispositivo, ricerca).
- **Durante la partita:** **pausa della serata**, **timer condiviso** (turno, round, pausa) visibile su TV e telefoni, segnapunti, squadre, pronostici, soundboard anche **personalizzata**.
- **Prima della partita:** giochi di stasera, scaletta, regole, **Consigliere** su cosa giocare (tempo, peso, modalità, preferiti).
- **Show:** tema da studio televisivo, musica e **atmosfere con suono**, commentatore, **schermo ambiente** tra una partita e l'altra.
- **I tuoi dati:** **esportazione e importazione guidata** (JSON versionato, anteprima, niente sovrascritture silenziose), centro **privacy** e **diagnostica**.
- **Affidabilità e sicurezza:** salvataggio a ogni mossa, ripresa dopo un crash, voti in coda se cade la rete, Safe Mode, regole del database precise, Content-Security-Policy.
- **Accessibilità e lingue:** testo grande, alto contrasto, daltonici, meno animazioni, tastiera e **telecomando**; **italiano e inglese**.
- **App Android e Android TV** con aggiornamenti verificati (SHA-256) e PDF veri anche dall'app; pulsante **Cerca aggiornamento**, **Ko-fi** e **Discord** (link aggiornabili senza nuove versioni).

## Inizia

| Voglio… | Dove |
|---|---|
| provarla subito | [mashaup.github.io/GameNight_Show](https://mashaup.github.io/GameNight_Show/) |
| la mia copia, con i miei dati (10 minuti, gratis) | [docs/INSTALLAZIONE.md](docs/INSTALLAZIONE.md) |
| l'app su Android o Android TV | [pagina di download](https://mashaup.github.io/GameNight_Show/scarica.html) · [docs/ANDROID.md](docs/ANDROID.md) |
| imparare a usarla | [docs/GUIDA.md](docs/GUIDA.md) |

> **Hai già la tua copia?** A ogni nuova versione ricopia `firebase/database.rules.json` in Firebase e premi **Pubblica** ([come](docs/INSTALLAZIONE.md#23-regole-del-database)).

## Documentazione

| Documento | Contenuto |
|---|---|
| [GUIDA](docs/GUIDA.md) | uso completo: serata, gruppi, armadio, app, problemi comuni |
| [INSTALLAZIONE](docs/INSTALLAZIONE.md) | GitHub, Firebase, GitHub Pages, servizi facoltativi |
| [ANDROID](docs/ANDROID.md) | app Android e Android TV: download, release, aggiornamenti, firma, esportazioni |
| [SVILUPPO](docs/SVILUPPO.md) | tecnologie, struttura, moduli, stato condiviso, lingue, prove |
| [DATI](docs/DATI.md) | formato di esportazione e importazione |
| [LINKS](docs/LINKS.md) | link ufficiali e configurazione remota (`config/links.json`) |
| [PRIVACY](docs/PRIVACY.md) | cosa resta sul dispositivo, cosa va su Firebase e ai servizi facoltativi |
| [AUDIT](docs/AUDIT.md) · [VERIFICA](docs/VERIFICA.md) | stato del progetto, piano, verifiche fatte e da fare a mano |
| [CHANGELOG](CHANGELOG.md) | novità di ogni versione |

## Contribuire e community

- **Un problema?** [Segnalalo](https://mashaup.github.io/GameNight_Show/go.html?to=bugs) (modulo guidato; niente codici o dati personali: le segnalazioni sono pubbliche).
- **Un'idea?** [Proponila](https://mashaup.github.io/GameNight_Show/go.html?to=ideas) o parlane su [Discord](https://mashaup.github.io/GameNight_Show/go.html?to=discord).
- **Codice:** fork, prove, pull request: [CONTRIBUTING](.github/CONTRIBUTING.md). Problemi di sicurezza in privato: [SECURITY](.github/SECURITY.md).
- ☕ GameNight Show è gratis e senza pubblicità: se vi piace, [offrite un caffè su Ko-fi](https://mashaup.github.io/GameNight_Show/go.html?to=kofi).

## Licenza e crediti

Codice con licenza **MIT** ([LICENSE](LICENSE)): puoi usarlo, modificarlo e ridistribuirlo mantenendo l'avviso di copyright; se pubblichi una versione modificata usa un nome e un logo diversi.

- Avatar: [DiceBear](https://www.dicebear.com) 9.4 (MIT). Stili Adventurer di Lisa Wischofsky, Big Smile di Ashley Seo e Toon Head di Johan Melin, con licenza CC BY 4.0.
- [Firebase JavaScript SDK](https://github.com/firebase/firebase-js-sdk) 10.14 (Apache 2.0).
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 di Kazuhiko Arase (MIT).
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 di Cosmo Wolfe (Apache 2.0), lettore di QR dell'app Android.
- [Capacitor](https://capacitorjs.com) 8.5 di Ionic (MIT), con i plugin Filesystem, Share e File Opener (capawesome, MIT).
- Font Atkinson Hyperlegible Next (testi dell’interfaccia), Fredoka (titoli e numeri) e Nunito (immagini da condividere): SIL Open Font License, testi in `assets/fonts`.
- Icone di GitHub ([Octicons](https://github.com/primer/octicons), MIT) e di Discord ([Simple Icons](https://simpleicons.org), CC0), usate solo per collegarsi ai rispettivi servizi.

