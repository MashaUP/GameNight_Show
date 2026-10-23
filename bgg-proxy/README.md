# Proxy BoardGameGeek per GameNight Show

Un piccolo **Cloudflare Worker** (piano gratuito) che sta tra GameNight Show e l'XML API2 di BoardGameGeek (BGG).

## Perché serve

- Dal 2025 BGG chiede che ogni applicazione sia **registrata** e mandi un **token** (`Authorization: Bearer …`).
- Il token non deve stare nel browser né in un repository pubblico: BGG chiede di fare le chiamate dai server e di tenere le risposte in cache.
- GitHub Pages pubblica solo file statici, quindi serve un intermediario. Il Worker:
  - tiene il token come **segreto**;
  - risponde **solo** al sito e all'app di GameNight Show (BGG vieta di offrire i suoi dati ad altre applicazioni);
  - mette in **cache** le risposte (ricerche 24 ore, schede 7 giorni);
  - restituisce **JSON** con i soli campi che servono.

Il piano gratuito di Cloudflare Workers basta e avanza: 100.000 richieste al giorno.

## Cosa risponde

| Indirizzo | Risposta |
|---|---|
| `GET /search?q=catan` | Giochi trovati: id, nome, anno, miniatura, giocatori, durata, peso |
| `GET /thing?id=13,822` | Schede complete (fino a 20 id): giocatori consigliati, durata, età, peso, categorie, meccaniche, espansioni, immagine, link alla pagina BGG |
| `GET /health` | Stato del proxy (dice solo se il token c'è, mai il token) |

Errori: `{ "ok": false, "error": "…" }` con codici come `bgg_busy` (BGG chiede di riprovare: c'è anche `Retry-After`), `bgg_unreachable`, `bgg_auth` (token non valido), `no_token`, `forbidden_origin`, `rate_limited`.

## Configurazione passo passo

Servono circa 20 minuti, più l'attesa della risposta di BGG (anche una settimana).

### 1. Registra l'applicazione su BoardGameGeek

1. Accedi a [boardgamegeek.com](https://boardgamegeek.com) con il tuo account.
2. Apri la pagina [Using the XML API](https://boardgamegeek.com/using_the_xml_api) e segui il link per registrare un'applicazione.
3. Descrivila così (in inglese): *GameNight Show, a free, ad-free web app for board game nights with friends (GitHub Pages + Android app). Used to search games and fill in player count, play time and weight in the user's own game shelf. Requests go through a server-side proxy with caching.*
4. **Licenza:** GameNight Show è gratuito e senza pubblicità, ma ha un link per le **donazioni (Ko-fi)**. BGG chiede una licenza commerciale a chi "raccoglie denaro in qualsiasi modo": dichiaralo nella richiesta e lascia decidere a loro (la licenza non commerciale è di solito gratuita; per le app con piccoli numeri a volte offrono licenze gratuite anche nei casi commerciali).
5. Quando l'applicazione è approvata, crea un **token** dalla pagina delle tue applicazioni. Copialo: serve al passo 3.

### 2. Crea il Worker su Cloudflare (gratis)

1. Crea un account gratuito su [dash.cloudflare.com](https://dash.cloudflare.com).
2. Sul computer serve [Node.js](https://nodejs.org) (versione 18 o più recente).
3. Apri il terminale nella cartella `bgg-proxy` del progetto e scrivi:

   ```
   npx wrangler login
   npx wrangler deploy
   ```

   La prima riga apre il browser per collegare l'account Cloudflare. La seconda pubblica il Worker e stampa il suo indirizzo, per esempio `https://gamenight-bgg.tuonome.workers.dev`.

### 3. Inserisci il token come segreto

```
npx wrangler secret put BGG_TOKEN
```

Incolla il token di BGG quando lo chiede. Non viene mai scritto in nessun file.

### 4. Controlla le origini ammesse

In `wrangler.toml`, `ALLOWED_ORIGINS` contiene `https://mashaup.github.io` (il sito) e `https://localhost` (l'app Android). Se il sito ha un altro indirizzo, correggilo e ripeti `npx wrangler deploy`.

### 5. Collega GameNight Show al proxy

Apri `js/services.js` nel progetto e scrivi l'indirizzo del Worker:

```js
export const BGG_PROXY_URL = 'https://gamenight-bgg.tuonome.workers.dev';
```

L'indirizzo non è segreto. Carica il progetto su GitHub: dopo la pubblicazione compaiono i pulsanti "Cerca su BoardGameGeek".

### 6. Prova

Apri `https://gamenight-bgg.tuonome.workers.dev/health` nel browser: deve rispondere `{"ok":true,…,"token":true}`.

## Pubblicazione automatica (facoltativa)

Il workflow `.github/workflows/bgg-proxy.yml` pubblica il Worker da GitHub. Si avvia solo a mano (scheda Actions › "Proxy BGG" › Run workflow) e serve il segreto del repository `CLOUDFLARE_API_TOKEN` (token Cloudflare con il permesso "Edit Cloudflare Workers"). Il token di BGG resta comunque un segreto del Worker (passo 3).

## Prove

```
node --test bgg-proxy/test/worker.test.mjs
```

Le prove usano risposte di BGG simulate: risultati, nessun risultato, errori, "riprova più tardi" (202/429), XML malformato, cache, CORS e limite di richieste. Partono anche su GitHub a ogni caricamento (workflow "Verifica").

## Costi e limiti

- Cloudflare Workers, piano gratuito: 100.000 richieste al giorno, 10 ms di CPU per richiesta. Con la cache, una serata usa poche decine di richieste.
- Il limite per indirizzo IP (predefinito 120 richieste ogni 10 minuti) protegge dagli abusi; è in memoria, quindi approssimativo.
- Nessun dato personale passa dal proxy: solo il testo cercato o i numeri dei giochi su BGG.

## Attribuzione

Dove l'app mostra dati di BGG compare il logo **"Powered by BGG"** con il link a BoardGameGeek, come chiedono i termini d'uso. GameNight Show non è affiliato a BoardGameGeek.
