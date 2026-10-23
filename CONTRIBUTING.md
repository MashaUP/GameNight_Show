# Contribuire a GameNight Show

Grazie! Qualunque aiuto va bene: una segnalazione chiara vale quanto una riga di codice.

## Segnalazioni e idee

- **Problema:** [modulo "Segnala un problema"](https://mashaup.github.io/GameNight_Show/go.html?to=bugs). Indica versione, dispositivo e passi.
- **Idea:** [modulo "Proponi un'idea"](https://mashaup.github.io/GameNight_Show/go.html?to=ideas), oppure parlane su [Discord](https://mashaup.github.io/GameNight_Show/go.html?to=discord).
- **Sicurezza:** in privato, vedi [SECURITY.md](SECURITY.md).

Le segnalazioni sono pubbliche: niente codici dei gruppi, chiavi, codici regia o dati personali.

## Preparare il computer

Servono Node.js 18+ e, per le prove nel browser, Python 3.10+.

1. Fai un fork del repository e clonalo.
2. Avvia un server locale dalla cartella del progetto: `python3 -m http.server 8000`, poi apri `http://localhost:8000/host.html`.
   Per usare Firebase serve la tua configurazione in `js/config.js` (README, passo 2): **non includerla nella pull request**.
3. Installa gli strumenti di prova: `cd tests && npm install`.
4. Per le prove nel browser: `python3 -m pip install playwright pillow` e `python3 -m playwright install chromium`.

## Prima di aprire una pull request

- `cd tests && npm test`: versioni, file offline, sintassi e import, **ESLint**, traduzioni, link, regole del database (deve essere tutto verde).
- `python3 tests/e2e/run.py <prove>`: le prove nel browser toccate dalla modifica (elenco in `tests/README.md`), oppure `--ci` per la selezione di GitHub.
- Il workflow **Verifica** le ripete su GitHub per ogni pull request.

## Regole del progetto

- **Niente framework, bundler o TypeScript:** moduli ES caricati direttamente dal browser. Le librerie stanno in `vendor/`, mai da CDN.
- **Tutto gratuito:** Firebase piano Spark, GitHub Pages e Actions. Niente servizi a pagamento; il Cloudflare Worker di BoardGameGeek è l'unica eccezione e resta facoltativo.
- **Due lingue:** ogni testo dell'interfaccia va in `js/lang/it.js` **e** `js/lang/en.js` con la stessa chiave e gli stessi `{parametri}`; nel codice si usa `t('chiave')`. Nel database si salvano codici, non testi tradotti.
- **Link ufficiali** solo in `config/links.json` (vedi `docs/LINKS.md`); nelle pagine `data-link="id"`.
- **Sicurezza nelle regole:** ogni permesso nuovo va in `database.rules.json` con le prove in `tests/rules.test.js`, e il CHANGELOG deve ricordare di ricopiare le regole in Firebase. Mai indebolire una regola per far funzionare una schermata.
- **Testi degli utenti** sempre con `esc()` prima di finire nell'HTML.
- **Accessibilità:** pulsanti veri (`<button>`), etichette per i lettori di schermo, uso da tastiera, contrasto nei temi Show e Giorno.
- **Versioni `x.y.z`:** MAJOR per cambiamenti incompatibili, MINOR per funzioni nuove, PATCH per correzioni. Lo stesso numero in `version.json`, `js/version.js` e `sw.js`, con la voce nel `CHANGELOG.md`.
- Commenti e documentazione in italiano, semplici e concreti.

## Pubblicare una versione (per chi gestisce il repository)

1. Aggiorna numero, data e novità (italiano in `notes`, inglese in `notesEn`) in `version.json`, poi `js/version.js`, `sw.js` e `CHANGELOG.md`.
2. Carica i file su `main` e aspetta la spunta verde di **Verifica**.
3. Pubblica la release con il tag `vX.Y.Z` (Releases › Draft a new release › Create new tag on publish › Publish release): il workflow **App Android** costruisce l'APK e la aggiunge alla release. Un tag da solo non basta.
4. Se è cambiato `database.rules.json`, ricopialo in Firebase e premi **Pubblica**.

## Licenza

Contribuendo accetti che il tuo codice sia distribuito con la licenza MIT del progetto ([LICENSE](LICENSE)).
