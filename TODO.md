# Cose da fare

L'unico file con quello che manca. Le novità già fatte sono in [CHANGELOG.md](CHANGELOG.md); come funziona il codice in [docs/SVILUPPO.md](docs/SVILUPPO.md).

Stato alla **2.3.0** (sistema di design più leggibile, home riordinata, eliminazione anche dell'ultima serata; prima 2.2: lobby, rivelazione a scelta, regia che gioca, accessi agli armadi). Delle 84 idee del backlog (1.11–2.1) **81 sono fatte**, **3 sono possibili solo in parte** (sotto, con il motivo).

---

## ✍️ Le tue cose da fare

Aggiungi qui quello che vuoi: una riga per voce, `[ ]` da fare, `[x]` fatto. Chi lavora al progetto parte da qui.

- [ ] 
- [ ] 

---

## 🧩 Idee fatte solo in parte (con il motivo)

- [ ] **Webhook verso altri servizi (idea 53).** C'è Discord (webhook del canale, dal browser della TV). Mandare eventi a servizi qualsiasi (Telegram, Zapier…) vorrebbe dire custodire i loro segreti: serve un server come il proxy BGG (`bgg-proxy/`, Cloudflare Worker), da aggiungere con una rotta `/hook` e i segreti con `wrangler secret`.
- [ ] **Esportazione verso altri tracker (idea 55).** C'è il CSV "una riga per giocatore" con l'id di BoardGameGeek (formato in `docs/DATI.md`). Un formato preciso per un'app (es. BG Stats) va aggiunto solo quando quell'app ne pubblica uno documentato.
- [ ] **Voti segreti anche per le regole del database (opportunità D).** Oggi prima del reveal i voti sono nascosti dall'interfaccia, ma `rooms/<codice>/votes` è leggibile da chi è collegato e conosce il codice. Per nasconderli davvero servirebbe un nodo leggibile solo dalla regia fino al reveal (e cambiare il conteggio "ha votato / manca" sui telefoni): cambiamento grande, da fare in una versione dedicata.
- [ ] **Prove su Firefox e Safari (idea 75).** Il controllo "Altri browser" su GitHub (`.github/workflows/altri-browser.yml`, Firefox e WebKit) è pronto ma non è mai stato eseguito: avviarlo a mano (Actions › Altri browser › Run workflow), guardare il risultato e correggere le differenze. Non blocca la "Verifica".

## 🔌 Da configurare (fuori dal codice)

- [ ] **Regole del database**: ricopiare `firebase/database.rules.json` in Firebase e premere **Pubblica** (cambiate nella 2.0 e nella 2.1).
- [ ] **Account**: in Firebase › Authentication attivare **Google** ed **Email/password** (lasciare attivo **Anonimo**) — `docs/INSTALLAZIONE.md`, passo 2.4.1.
- [x] **BoardGameGeek**: proxy pubblicato su `https://gamenight-bgg.mashaup.workers.dev` con il token (`/health` → `token: true`), indirizzo in `js/services.js`. Si attiva sul sito con la prossima pubblicazione.
- [ ] **Regole del database 2.2**: ricopiare di nuovo `firebase/database.rules.json` e **Pubblica** (nuovi `manualReveal`, `viewers`, `blocked` degli armadi).
- [ ] **App Android 2.2**: pubblicare la release `v2.2.0` (comprende tutta la 2.1; serve per i promemoria con le notifiche).
- [ ] **Regole del database 2.3**: ricopiare `firebase/database.rules.json` e **Pubblica** (presenza nella stanza solo se la stanza esiste).
- [ ] **App Android 2.3**: pubblicare la release `v2.3.0` (comprende la 2.2).

## ✋ Da provare a mano (serve un dispositivo vero)

- [ ] 2.2 sulla TV vera: lobby partita con una copertina vera, «Gioca anche tu» con i popup consentiti, rivelazione manuale.
- [ ] 2.2 armadio: «Rimuovi accesso» a un amico con account Google, poi lui riapre il link.
- [ ] 2.3: eliminare l'ultima serata dal resoconto con la TV aperta su quella serata, poi ricaricare la TV (deve dire «Serata eliminata», senza «Riprendi»).

- [ ] Notifiche dei promemoria nell'app Android (permesso, orario giusto, cambio di data).
- [ ] Accesso con Google sul dominio vero; email e password nell'app installata.
- [ ] "Apri nell'app" da Chrome su Android con l'app installata.
- [ ] Android TV con il telecomando: installazione, navigazione, QR sulla TV.
- [ ] BoardGameGeek con il token vero: ricerca, scheda, collezione di un utente.
- [ ] Discord con un webhook vero; ricerca in un manuale PDF reale (anche lungo).
- [ ] Audio sulla TV: atmosfere con suono, volumi separati, soundboard personalizzata sui touch.
- [ ] Barra di stato di Android sopra i pulsanti; stampa e lettura delle etichette QR.
- [ ] Costruzione dell'APK su GitHub Actions dopo una release (spunta verde).

## ⚠️ Limiti noti

- **Schermate da rivedere una per una con il sistema di design 2.3**: statistiche, gruppi e resoconti della TV prendono i nuovi controlli, focus e avvisi, ma non sono stati ridisegnati (la TV usa ancora il tema pop di `style.css`).
- **Serata eliminata da un altro dispositivo**: la TV la riconosce solo se la serata aveva già voti e un gruppo; altrimenti alla riapertura propone ancora «Riprendi» (si può scegliere «Nuova serata»).

- **Codice a barre con più edizioni**: non esiste un database gratuito codice → gioco; la prima volta si abbina a mano (ricerca per nome), poi quel dispositivo lo riconosce.
- **Descrizione dei giochi da BGG**: non si importa (testo protetto dai termini di BGG); nella scheda c'è il link alla pagina di BGG.
- **Promemoria nel browser**: solo con la pagina aperta (le notifiche programmate esistono solo nell'app); resta il file .ics per il calendario.
- **Demo**: niente regole e niente account; i dati stanno nel browser (circa 5 MB, le foto grandi possono riempirlo).
- **iOS**: non c'è un'app iOS; Safari usa il sito come qualsiasi browser ("Apri nell'app" solo su Android).
- **`host.js`** è sceso a 5.400 righe (schermate e pannelli in `tv-screens.js` e `tv-panels.js`); le prossime estrazioni possibili sono `ToolsPanel`, `SCREENS.voting` e `SCREENS.reveal`.
