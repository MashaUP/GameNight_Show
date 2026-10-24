# Prove automatiche di GameNight Show

Tutte gratuite ed eseguite da GitHub a ogni caricamento (workflow **Verifica**, scheda *Actions*). `cd tests && npm test` esegue insieme `check.mjs`, il controllo del codice con ESLint (`npm run lint`: nomi non definiti, chiavi doppie…), `rules.test.js` e le prove unitarie (`links`, `nightclock`, `features`, `pdf`).

| Prova | Cosa controlla | Comando (dalla radice del progetto) |
|---|---|---|
| `tests/check.mjs` | Versioni allineate, file offline del service worker, sintassi dei moduli, import ed export, file usati dalle pagine, **traduzioni** (stesse chiavi e stessi `{parametri}` in italiano e inglese, nessuna chiave usata nel codice che manca nei dizionari), **link ufficiali** (`config/links.json` valido, nessun indirizzo di GitHub, Discord o Ko-fi scritto a mano nelle pagine) | `node tests/check.mjs` |
| `tests/links.test.mjs` | Sistema dei link (`js/links-core.js`): indirizzi ammessi e rifiutati, schema, voci sbagliate, link spenti, copia remota valida, server giù, JSON rotto, timeout, cache e offline, archivio asincrono come `chrome.storage.local` | `node --test tests/links.test.mjs` |
| `tests/nightclock.test.mjs` | Pausa della serata e timer condiviso (modello puro): tempo rimasto, pausa e ripresa, +30 s, turno successivo, seguire la pausa della serata, scadenza una volta sola, revisioni | `node --test tests/nightclock.test.mjs` |
| `tests/features.test.mjs` | Consigliere, preferiti, filtri e ordinamenti dell'armadio, avvisi dei prestiti, catalogo pubblico, esportazione e importazione (formato, file rotti o più nuovi, piano senza sovrascritture), BoardGameGeek (confronto dei campi), ritaglio delle foto, soundboard personalizzata, Il vostro anno, telecomando | `node --test tests/features.test.mjs` |
| `tests/pdf.test.mjs` | PDF generato nel dispositivo (`js/pdfdoc.js`): accenti, a capo, struttura del file, più pagine; con `qpdf`/`pdftotext` controlla anche il file | `node --test tests/pdf.test.mjs` |
| `tests/i18n-scan.mjs` | Testi italiani rimasti scritti nel codice (euristico); `check.mjs` lo usa sui moduli già tradotti | `node tests/i18n-scan.mjs --count js/*.js` |
| `tests/rules.test.js` | Regole del database (`firebase/database.rules.json`) con il simulatore *targaryen*: chi può leggere e scrivere cosa | `cd tests && npm install && node rules.test.js` |
| `bgg-proxy/test/` | Proxy BoardGameGeek con risposte simulate | `node --test bgg-proxy/test/worker.test.mjs` |
| `tests/e2e/` | Il sito vero in Chromium (Playwright) con un **finto Firebase**: serate complete con TV e telefoni, armadio, profilo su più dispositivi, aggiornamenti dell'app, lingue, link ufficiali (`links.py`), pausa, timer e schermo ambiente (`night16.py`), dati, privacy, catalogo, BGG e manuali (`data16.py`), esportazioni dall'app Android (`exports16.py`), impaginazione da 360 a 1920 px | `python3 tests/e2e/run.py` |

## Prove nel browser (tests/e2e)

Servono Node.js 18+, Python 3.10+ e Playwright:

```
cd tests && npm install && cd ..
python3 -m pip install playwright pillow
python3 -m playwright install chromium
python3 tests/e2e/run.py            # tutte (circa 30 minuti)
python3 tests/e2e/run.py --ci       # la selezione di GitHub (meno di 10 minuti)
python3 tests/e2e/run.py hub i18n   # solo quelle indicate
```

`run.py` avvia da solo `tests/e2e/server.mjs`, che serve il sito su tre porte, ognuna con il suo database in memoria:

- **8765** sito con il finto Firebase (tutto permesso);
- **8766** come l'app Android (indirizzi pubblici d'esempio in `js/site.js`, Capacitor simulato dai test);
- **8767** sito con le **regole vere** di `firebase/database.rules.json` applicate a ogni lettura e scrittura.

Il finto Firebase (`tests/e2e/fakefb.js`) prende il posto di `vendor/firebase.js` e ha le stesse funzioni usate da `js/fb.js` (lettura, scrittura, `update`, `onValue`, `push`, `serverTimestamp`, accesso anonimo, `onDisconnect`); come il vero SDK rifiuta il percorso vuoto.

Registri e screenshot finiscono in `tests/e2e/out/` (non va caricata su GitHub). Un test è fallito se esce con un errore, se stampa una riga `FAIL` o se i suoi riepiloghi (`ERRORI`, `FALLITI`…) non sono vuoti. Un test che fallisce viene ripetuto una volta (alcune prove dipendono dai tempi); con `--no-retry` no.

I browser di prova partono in italiano (`it-IT`): le prove dell'inglese stanno in `i18n.py`.

## Cosa non si prova qui

- La costruzione dell'APK (serve l'Android SDK): la fa il workflow `android.yml` quando si pubblica una release (tag `v1.10.0`); controlla la spunta verde su GitHub.
- Firebase vero: lo prova il **tavolo di verifica** `test.html` sul sito pubblicato.
- Fotocamera, installazione dell'APK, Android TV: vanno provati a mano su un dispositivo vero (vedi `docs/VERIFICA.md`).
