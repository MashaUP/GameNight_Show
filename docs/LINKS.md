# Link ufficiali e configurazione remota

GitHub, Discord, Ko-fi, guida, segnalazioni: tutti gli indirizzi ufficiali di GameNight Show stanno
in **un solo file**, [`config/links.json`](../config/links.json). Pagine e componenti non contengono
indirizzi: chiedono il link per nome (`github`, `discord`, `kofi`…). Cambiato il file sul sito,
cambiano i link ovunque, **anche nell'app Android già installata, senza una nuova versione**.

- [Come funziona](#come-funziona)
- [Aggiornare l'invito Discord](#aggiornare-linvito-discord-senza-una-nuova-versione)
- [Aggiungere, cambiare, spegnere un link](#aggiungere-cambiare-spegnere-un-link)
- [Il formato del file](#il-formato-del-file)
- [Sicurezza](#sicurezza)
- [Cache, offline ed errori](#cache-offline-ed-errori)
- [Collegamenti stabili: go.html](#collegamenti-stabili-gohtml)
- [Usarlo nei componenti](#usarlo-nei-componenti)
- [Riutilizzarlo in un altro progetto](#riutilizzarlo-in-un-altro-progetto)
- [Estensioni Chrome](#estensioni-chrome)
- [Perché così (scelte e alternative)](#perché-così-scelte-e-alternative)

## Come funziona

```
config/links.json  ──(stesso file)──►  sito su GitHub Pages: https://mashaup.github.io/GameNight_Show/config/links.json
        │                                     │
        │ incluso nell'APK                    │ letto dall'app (al massimo ogni 6 ore,
        ▼                                     ▼ o subito con "Cerca aggiornamento")
  copia di base dell'app  ───────────►  copia remota validata, salvata sul telefono
                                  │
                                  ▼
                 js/links.js → icone del footer, Ko-fi, "Community e supporto", go.html
```

| Dove | Copia di base | Copia remota |
|---|---|---|
| **Sito** (GitHub Pages) | `config/links.json` del sito stesso: il service worker lo riprende dalla rete a ogni apertura e lo tiene per quando si è offline | non serve: la copia di base è già quella pubblicata |
| **App Android** | `config/links.json` dentro l'APK (quello della versione installata) | `SITE_URL` + `config/links.json`, cioè il file pubblicato sul sito |
| **Altri progetti / estensioni** | il file incluso nel pacchetto | l'indirizzo pubblico scelto dal progetto |

I file coinvolti:

| File | Cosa fa |
|---|---|
| `config/links.json` | **l'unica fonte** degli indirizzi (dati, niente codice) |
| `js/links-core.js` | nucleo riutilizzabile, senza dipendenze: validazione, unione, cache, rete con timeout |
| `js/links-policy.js` | regole di sicurezza di GameNight Show: domini ammessi, in generale e per ogni link |
| `js/links.js` | adattatore web: da dove leggere, dove salvare (`localStorage`), come mostrare (icone, elenco) |
| `js/services.js` | `LINKS_URL`: indirizzo della copia remota, vuoto = automatico |
| `go.html`, `js/go.js` | collegamenti stabili (`go.html?to=discord`) per README, GitHub, QR |
| `tests/links.test.mjs` | 23 prove del nucleo e del file reale (`npm test`) |
| `tests/e2e/links.py` | prove nel browser: icone, tastiera, temi, link spenti, indirizzi non validi, app, offline |

## Aggiornare l'invito Discord senza una nuova versione

1. Su GitHub apri `config/links.json` e premi la matita (**Edit this file**).
2. Cambia l'indirizzo in `"discord": { "url": "https://discord.gg/NUOVO-CODICE", … }`.
3. Aggiorna `"updated"` con la data di oggi (`AAAA-MM-GG`).
4. **Commit changes** sul ramo `main`.

Fatto. Il workflow **Verifica** controlla il file: se è scritto male diventa rosso (e l'app, comunque, lo ignorerebbe e terrebbe i link buoni). GitHub Pages lo pubblica
in circa un minuto; poi:

- **sito:** il nuovo invito compare alla prossima apertura della pagina (GitHub Pages può tenere in cache il file per circa 10 minuti);
- **app Android:** entro 6 ore, oppure subito con **Cerca aggiornamento**;
- **README, profilo GitHub, QR stampati** che usano `https://mashaup.github.io/GameNight_Show/go.html?to=discord`: subito.

Non serve una release, non parte la costruzione dell'APK (si avvia solo quando pubblichi una release) e non cambia il numero di versione.

> Consiglio: in Discord crea l'invito con **Scade dopo: mai** e **Numero massimo di usi: nessun limite**,
> così cambia solo se lo decidi tu. L'invito attuale non scade.

## Aggiungere, cambiare, spegnere un link

- **Cambiare un indirizzo:** modifica `url` e `updated`.
- **Spegnere un link** (sparisce da tutte le schermate, niente pulsanti verso il nulla): `"enabled": false`.
  Non cancellare la voce: nell'app Android una voce assente nella copia remota viene presa dalla copia di base dell'APK.
- **Aggiungere un link** su un dominio già ammesso (GitHub, GitHub Pages di `mashaup`, Discord, Ko-fi):
  aggiungi una voce con un id nuovo. Compare da solo nell'elenco **Community e supporto**, anche nelle app già installate:

  ```json
  "wiki": {
    "url": "https://github.com/MashaUP/GameNight_Show/wiki",
    "enabled": true,
    "icon": "docs",
    "order": 45,
    "label": { "it": "Wiki", "en": "Wiki" }
  }
  ```
- **Un link su un dominio nuovo** (per esempio un sito tuo): aggiungi il dominio a `LINK_POLICY.hosts` in
  `js/links-policy.js` e pubblica una nuova versione. È voluto: chi modifica il JSON non può portare l'app
  su un dominio che il codice non conosce (vedi [Sicurezza](#sicurezza)).
- **Mostrarlo in un punto preciso** (oltre all'elenco): nel codice `data-link="wiki"` su un `<a>`, oppure aggiungi l'id a `data-link-icons`.

## Il formato del file

```json
{
  "schema": "mashaup.links",
  "schemaVersion": 1,
  "project": "gamenight-show",
  "updated": "2026-10-23",
  "links": {
    "discord": { "url": "https://discord.gg/EPsbQCuAkx", "enabled": true, "icon": "discord", "order": 20 }
  }
}
```

| Campo | Obbligatorio | Significato |
|---|---|---|
| `schema` | sì | sempre `mashaup.links`: un file di altro tipo viene rifiutato |
| `schemaVersion` | sì | `1`. Aumenta **solo** per modifiche non compatibili; campi nuovi facoltativi non lo cambiano. Un'app vecchia che trova un numero più alto ignora il file e tiene i suoi link |
| `project` | sì | deve essere `gamenight-show`: un file di un altro progetto viene rifiutato |
| `updated` | consigliato | data `AAAA-MM-GG`. Una copia remota **più vecchia** di quella inclusa nell'app viene ignorata (così una nuova versione non torna indietro per colpa di una cache) |
| `links.<id>` | — | id stabile: lettere minuscole, cifre e trattini, fino a 32 caratteri (`github`, `discord`, `kofi`, `docs`, `bugs`, `ideas`…). Al massimo 50 link |
| `url` | — | `https://` su un dominio ammesso. Vuoto = link spento |
| `enabled` | no | `true` (predefinito) o `false` |
| `icon` | no | `github`, `discord`, `kofi`, `docs`, `bug`, `idea`, `link` (sconosciuta = 🔗) |
| `order` | no | posizione negli elenchi (numeri più bassi prima, predefinito 100) |
| `label` | no | testo o `{ "it": "…", "en": "…" }`. I link noti hanno già i testi dell'app (`links.<id>` nei dizionari) e la descrizione (`links.<id>.d`) |

Ogni voce viene controllata da sola: una voce sbagliata viene scartata (resta quella della copia di base)
senza toccare le altre. `tests/check.mjs` e `npm test` bloccano un `config/links.json` non valido o con voci scartate.

## Sicurezza

- **Solo dati, mai codice.** Il file non viene mai eseguito; le etichette finiscono nella pagina come testo (con escape), le icone sono scelte da un elenco fisso nel codice.
- **Indirizzi validati prima di diventare cliccabili** (`checkUrl` in `links-core.js`): solo `https://`, niente credenziali (`utente:password@`), niente porte, niente indirizzi IP, niente spazi o caratteri strani, al massimo 2048 caratteri.
- **Domini ammessi decisi dal codice** (`js/links-policy.js`), non dal file remoto: in generale `github.com`, `mashaup.github.io`, `discord.gg`, `discord.com`, `ko-fi.com` (e sottodomini); regole più strette per i link noti (`discord` solo Discord, `kofi` solo Ko-fi, `bugs`/`ideas` solo GitHub…). `javascript:`, `data:`, `http:` e domini simili per ingannare (`github.com.evil.com`) vengono rifiutati: ci sono le prove.
- **Nessun segreto** nel file (`check` e prove lo controllano): è pubblico per definizione.
- **La copia di base resta la riserva affidabile**: file rotto, troppo grande (oltre 64 KB), di un altro progetto, di uno schema futuro o più vecchio → ignorato.
- **Anche la copia salvata sul dispositivo viene rivalidata** a ogni apertura (potrebbe essere stata manomessa).
- **Nessun "open redirect"**: `go.html` accetta solo un id, mai un indirizzo.
- I link si aprono in una nuova scheda con `rel="noopener noreferrer"`; nell'app Android si aprono nel browser del telefono.
- La richiesta della copia remota non invia cookie né credenziali (`credentials: 'omit'`) e porta solo l'indirizzo del file.

## Cache, offline ed errori

- **L'avvio non aspetta mai la rete:** i link si mostrano subito dalla copia di base o da quella salvata; la copia remota arriva dopo, in background, e aggiorna la pagina.
- **Richieste:** al massimo una ogni **6 ore**; dopo un errore si riprova non prima di **30 minuti**; **timeout di 5 secondi**. Con **Cerca aggiornamento** il controllo è immediato e salta anche le cache intermedie (`?t=…`).
- **Cache:** l'ultima copia remota valida resta in `localStorage` (`gnr_links`) e vale anche offline. Sul sito si salva l'ultima copia buona del file, utile se un giorno non si potesse leggere.
- **Errori:** nessun avviso a schermo (i link non sono essenziali e un messaggio ripetuto darebbe fastidio). Ogni errore (`network`, `timeout`, `http_500`, `bad_json`, `wrong_project`, `incompatible`, `older_than_app`, voci scartate…) finisce nel **registro errori** scaricabile. In **Profilo e app › Community e supporto** una riga dice da quando sono aggiornati i link.
- **Tempi di GitHub Pages:** dopo un commit il sito si aggiorna in circa un minuto; i file possono restare in cache fino a 10 minuti. Il controllo dell'app usa `cache: 'no-cache'` (chiede sempre al server se il file è cambiato).

## Collegamenti stabili: go.html

`https://mashaup.github.io/GameNight_Show/go.html?to=<id>` porta sempre alla destinazione attuale del link `<id>`:

| Collegamento stabile | Porta a |
|---|---|
| `go.html?to=discord` | l'invito Discord attuale |
| `go.html?to=github` | il repository |
| `go.html?to=kofi` | Ko-fi |
| `go.html?to=bugs` / `?to=ideas` | i moduli di segnalazione su GitHub |

Serve dove l'app non c'è: README, descrizione del repository, `.github/ISSUE_TEMPLATE/config.yml`, QR stampati, messaggi.
Se il link è spento o l'id non esiste, la pagina lo dice e mostra gli altri link ufficiali. Funziona dopo
la pubblicazione della 1.5.0 su GitHub Pages.

## Usarlo nei componenti

```html
<a data-link="kofi" target="_blank" rel="noopener noreferrer" hidden>Ko-fi</a>   <!-- href dal JSON; nascosto se spento -->
<span class="link-icons" data-link-icons="github,discord"></span>                 <!-- icone piccole -->
<ul class="link-list" data-link-list data-link-exclude="kofi"></ul>              <!-- elenco completo -->
<section data-link-box>…</section>   <!-- riquadro che sparisce se non contiene link attivi -->
```

```js
import { links, bindLinks, refreshLinks } from './links.js';
bindLinks();                  // collega gli elementi qui sopra e li aggiorna (nuova configurazione, cambio di lingua)
links.url('discord');         // '' se spento o mancante
links.list({ exclude: ['kofi'] });
refreshLinks();               // controllo immediato (lo fa "Cerca aggiornamento")
```

`tests/check.mjs` fallisce se in una pagina o in un modulo compare a mano un indirizzo di GitHub (`MashaUP`), Discord o Ko-fi.

## Riutilizzarlo in un altro progetto

Il formato (`mashaup.links`) e il nucleo (`links-core.js`) sono comuni; ogni progetto ha il suo file e il suo adattatore.

1. **Copia `js/links-core.js`** così com'è (nessuna dipendenza; browser, estensioni e Node 18+).
2. **Crea il file** `config/links.json` del progetto, con il suo `project` (es. `vinted-relist`).
3. **Pubblicalo** su GitHub Pages del repository del progetto: `https://mashaup.github.io/<Repository>/config/links.json`
   (attiva Pages in **Settings › Pages**, ramo `main`, cartella `/`). GitHub Pages permette la lettura
   da altre origini (CORS aperto): è quello che già fa l'app Android con `version.json`.
4. **Scrivi le regole** (come `links-policy.js`): domini ammessi e regole per id.
5. **Crea l'archivio** con un adattatore per la piattaforma:

```js
import { createLinkStore } from './links-core.js';
const links = createLinkStore({
  project: 'vinted-relist',
  policy: { hosts: ['github.com', 'discord.gg', 'discord.com', 'ko-fi.com'], byId: { discord: ['discord.gg', 'discord.com'] } },
  loadBaseline: () => fetch(new URL('config/links.json', location.href)).then((r) => r.text()),
  remoteUrl: 'https://mashaup.github.io/Vinted_Relist/config/links.json',
  storage: { get: (k) => JSON.parse(localStorage.getItem(k) || 'null'), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) },
  onError: (code) => console.info('links:', code)
});
await links.ready();
links.url('discord');
```

6. Copia anche le prove di `tests/links.test.mjs` cambiando `project` e regole.

**Un file per progetto, non uno per tutti:** un errore in un file non tocca gli altri progetti, ogni progetto
lo modifica nel suo repository, la cache è separata e ogni app scarica solo ciò che le serve. Il formato
comune permette comunque di riusare nucleo, prove e documentazione. Se un giorno si volesse un unico posto
per tutti i file, basta un repository `MashaUP/mashaup.github.io` con `config/<progetto>.json` e
`LINKS_URL` (o `remoteUrl`) che punta lì: nessun cambio di formato.

## Estensioni Chrome

Il nucleo funziona nel service worker di un'estensione Manifest V3 (niente DOM). Quello che cambia è l'adattatore:

```js
// background.js (service worker dell'estensione, "type": "module" nel manifest)
import { createLinkStore } from './links-core.js';
const links = createLinkStore({
  project: 'keep-watching',
  policy: { hosts: ['github.com', 'discord.gg', 'discord.com', 'ko-fi.com'] },
  loadBaseline: () => fetch(chrome.runtime.getURL('config/links.json')).then((r) => r.text()),
  remoteUrl: 'https://mashaup.github.io/Keep_Watching/config/links.json',
  storage: {
    get: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
    set: (k, v) => chrome.storage.local.set({ [k]: v })
  }
});
// Apertura di un link dal popup o dal service worker:
async function open(id) { await links.ready(); const url = links.url(id); if (url) chrome.tabs.create({ url }); }
```

Vincoli e regole per le estensioni:

- **La logica resta nel pacchetto** (`links-core.js` incluso nell'estensione); il JSON remoto contiene solo dati e non viene mai eseguito, come richiedono le regole del Chrome Web Store sul codice remoto.
- **Permessi:** `"storage"` per `chrome.storage.local`. Per leggere il file remoto non servono `host_permissions`, perché GitHub Pages risponde con CORS aperto; se un giorno il file stesse su un server senza CORS, servirebbe `"host_permissions": ["https://mashaup.github.io/*"]` (comporta un avviso all'installazione).
- **Content Security Policy** delle pagine dell'estensione: `connect-src` deve permettere `https://mashaup.github.io` se la policy è personalizzata (quella predefinita di MV3 lo permette).
- **Service worker che si spegne:** `links.ready()` va richiamato a ogni risveglio (l'archivio rilegge la copia salvata in `chrome.storage.local`, senza richieste se non sono passate 6 ore). Per un controllo periodico si può usare `chrome.alarms` con `links.refresh()`.
- **Aprire i link:** `chrome.tabs.create({ url })` dal service worker o dal popup.
- **Offline:** come sul sito, valgono la copia inclusa e quella salvata.

Questo adattatore **non è incluso** in GameNight Show (che non è un'estensione): è il punto di partenza per le estensioni. La parte comune (nucleo e formato) è provata anche con un archivio asincrono come `chrome.storage.local`.

## Perché così (scelte e alternative)

| Domanda | Scelta | Perché |
|---|---|---|
| JSON remoto o backend? | **file JSON statico su GitHub Pages** | gratuito, già usato dal progetto (il sito e `version.json` stanno lì), si modifica dal browser con un commit, cronologia delle modifiche gratis, CORS aperto, cache corta (10 minuti). Un backend aggiungerebbe costi, manutenzione e un punto di guasto senza vantaggi per pochi link |
| GitHub Raw? | **no, GitHub Pages** | `raw.githubusercontent.com` ha una cache di circa 5 minuti non controllabile e non è pensato come servizio per le app; Pages è il sito stesso del progetto |
| Redirect o JSON? | **entrambi, con una sola fonte** | il JSON serve all'app (validazione, link spenti, etichette, offline); `go.html?to=…` dà un indirizzo stabile ai posti dove l'app non c'è (README, QR). Il redirect legge lo stesso JSON: un solo file da modificare |
| Cloudflare per i redirect? | **non ora** | richiederebbe un dominio o un Worker in più; `go.html` su Pages fa lo stesso gratis. Il Worker di BoardGameGeek resta separato (non va mescolato con i link) |
| Un file unico per tutti i progetti? | **un file per progetto, formato comune** | isolamento degli errori, nessuna dipendenza tra progetti, file piccoli; vedi [sopra](#riutilizzarlo-in-un-altro-progetto) |
| Libreria separata (npm)? | **non ancora** | un file da copiare (`links-core.js`) con le sue prove basta per 3-4 progetti personali. Se i progetti crescono, si può spostare in un repository `MashaUP/links-kit` senza cambiare formato |
| Domini nel JSON? | **no, nel codice** | se il JSON potesse allargare i domini, chi riuscisse a modificarlo potrebbe mandare gli utenti ovunque |
| Firma del JSON? | **non ora** | il file sta nello stesso repository del codice: chi può modificarlo può modificare anche il codice. Con l'elenco dei domini nel codice il rischio è già contenuto |
| Messaggio se l'aggiornamento fallisce? | **no, solo registro** | i link non sono essenziali; un avviso ripetuto infastidirebbe. La data dei link è visibile nella sezione Community |

Idee per il futuro (non fatte perché oggi non servono): annunci o avvisi remoti ("serata di prova sabato") con
lo stesso formato, link diversi per lingua (`url` per lingua), scadenza degli inviti (`expires`). Si possono
aggiungere come campi facoltativi senza cambiare `schemaVersion`.
