# Audit di GameNight Show (partenza: 1.3.1)

Data: 19 ottobre 2026 (aggiornato il 24 ottobre 2026, versione 1.10.0). Analisi del codice reale del repository prima dei lavori della serie 1.4 e successive.
Le voci sono separate in **verificato** (provato con un test o leggendo il codice) e **ipotesi**.

## 1. Architettura reale

**Pagine** (HTML minimi, il contenuto lo disegnano i moduli in `js/`):

| Pagina | Modulo | Ruolo |
|---|---|---|
| `index.html` | `home.js` | Home personale: profilo, Entra/Crea, armadi, serate, gruppi, impostazioni, app Android, Ko-fi |
| `host.html` | `host.js` (6.400 righe) + `tv-extras.js`, `tv-prep.js`, `extras.js`, `stats.js`, `music.js`, `atmo.js`, `commentary.js` | TV e regia |
| `play.html` | `play.js` (3.100 righe) + `phone-extras.js`, `phone-prep.js` | Telefono del giocatore |
| `armadio.html` | `armadio.js` (1.660 righe) + `collection.js` | Armadio dei giochi (1.2) |
| `ludoteca.html` | `library.js` | Consultazione e aggiunta rapida |
| `resoconto.html` | `resoconto.js`, `report.js`, `share.js`, `cards.js`, `recap-video.js` | Resoconto della serata |
| `scarica.html` | `scarica.js`, `updates.js` | Download dell'APK |
| `test.html` | `selftest.js` | Tavolo di verifica con Firebase vero |

**Moduli condivisi:** `util.js` (DOM, immagini, tema, accessibilità, toast, versione), `fb.js` (Firebase), `person.js` (profilo personale), `native.js` (Capacitor: QR, file, rotte), `updates.js` (aggiornamenti dell'APK), `collection.js` (modello dei giochi), `vault.js` (salvataggi a rotazione), `safe.js`, `lite.js`, `sounds.js`, `sfx.js`, `fx.js`, `avatars.js`, `facts.js`, `stale.js`, `tour.js`.

**Nodi del database** (`firebase/database.rules.json`, 54 KB): `rooms/<codice>` (meta, state, players, votes, games, poll e circa 30 sotto-nodi della serata), `secrets` (codice regia, solo scrittura), `members` (vecchi profili di gruppo), `groups/<id>` (info, nights, identity, photos, admins, uids, privacy…), `groupKeys`, `deviceProfiles`, `armadi/<id>` (info, library, images, loans, log, trash, share, invites…), `armadioKeys`, `people/<pid>` (profilo personale), `personKeys`, `pub/<token>` (catalogo pubblico in sola lettura).

**Flussi principali:** creazione stanza (TV) → QR → ingresso dei telefoni (`players/<uid>`) → scelta o votazione del gioco (`poll`) → voto (`votes`) → reveal → classifica → premiazione → fine serata (`groups/<id>/nights`) → resoconto. Armadio: `armadi/<id>/library` con miniature leggere, foto grandi in `images`.

**Distribuzione:** GitHub Pages (sito) e APK Capacitor 8 costruita da `.github/workflows/android.yml` (fino alla 1.4 nella release `app-android` a ogni caricamento; dalla 1.5 solo nelle release pubblicate dall'utente).

## 2. Stato delle funzioni esistenti

Fonte: suite di regressione Playwright eseguita durante lo sviluppo della 1.3 (fuori dal repository, vedi punto 9) e lettura del codice.

| Funzione | Stato | Note |
|---|---|---|
| Consigli per la serata | funzionante · migliorabile | Percentuali e motivo presenti; mancano filtri per complessità, tipologia, disponibilità (sezione 14 del prompt) |
| Votazione dei giochi dai telefoni (anche più voti) | funzionante | |
| Ruota dei giochi, squadre, clessidra, chi inizia | funzionante | |
| Scaletta, segnapunti, quiz del gruppo | funzionante | |
| Soundboard dai telefoni | funzionante | Solo suoni predefiniti |
| Musica d'atmosfera generata, commentatore vocale | funzionante | Voce solo in italiano |
| Temi giorno, notte, Show; accessibilità; modalità leggera | funzionante | Lo stile "Show" esiste solo sulla TV |
| Profili personali multi-dispositivo, profili di gruppo | funzionante | Vedi sicurezza `members` |
| Classifiche, stagioni, rivalità | funzionante | |
| Resoconto, immagini, storie, figurine, video | funzionante | Testi solo in italiano, font Nunito diverso da quello dell'interfaccia |
| Backup serata e gruppo, export armadio | funzionante | |
| Salvataggi a rotazione, macchina del tempo, codice regia, ripresa | funzionante | |
| Import CSV di BoardGameGeek | funzionante | Nessuna integrazione diretta con BGG |
| Armadio: prestiti, espansioni, duplicati, QR, link pubblico, collaboratori | funzionante | Prestiti scaduti senza avviso nella home |
| Aggiornamenti dell'app con SHA-256, `scarica.html` | funzionante | Download non annullabile |
| **Lingua inglese** | **assente** | Tutti i testi sono scritti in italiano dentro HTML e JS |

## 3. Bug e difetti

**Verificati**

1. File di prova dimenticati nella radice del repository: `rot_exif6.jpg`, `rot_lr.jpg` (non usati da nessuna pagina).
2. I test di regressione non sono nel repository: chi modifica il progetto non può rieseguirli, e il workflow `verifica.yml` controlla solo sintassi, versioni e regole.
3. Tre test della suite (tranche2, tranche3, tranche7) a volte falliscono per tempi di attesa sotto carico: da rendere più robusti quando entrano nel repository.
4. Immagini condivisibili, PDF del resoconto e video usano Nunito, l'interfaccia usa Atkinson Hyperlegible Next: due caratteri diversi per la stessa app.

**Ipotesi (da confermare con i test nuovi)**

- Con molte serate salvate, l'apertura di un telefono scarica tutto `groups/<id>/nights` (vedi punto 6).

## 4. Sicurezza

**Verificati**

1. `members/<codice>` (vecchi profili di gruppo): `.write` è `auth != null` senza altre condizioni, quindi **chiunque sia collegato può cancellare il profilo di gruppo di un altro** (la validazione non si applica alle cancellazioni) o spostarlo in un altro gruppo. Il codice `memberId` è visibile a tutti i giocatori della stanza. → correzione nella 1.4: cancellazione vietata, gruppo non modificabile.
2. Content-Security-Policy con `script-src 'self' https:`: permette di caricare script da qualunque sito https. Tutti gli script sono già nel repository → si può restringere a `'self'`.
3. Firma dell'APK: di base la chiave di prova pubblica in `android-app/keystore` (documentato nel README, ma non evidente).

**Accettati e documentati**

- `rooms/<codice>` leggibile da chi conosce il codice di 4 caratteri: è il modo in cui si entra nella serata. I dati sensibili (codice regia) sono in `secrets`, solo in scrittura.
- Chiavi di Firebase nel client: non sono segrete, la protezione sono le regole.

## 5. UI/UX

- Home a colonna unica anche su schermi larghi; nessuna navigazione tra le sezioni; armadi e serate si aprono scorrendo.
- Il tema "Show" (il più riconoscibile) esiste solo sulla TV; home e telefono hanno uno stile diverso.
- `style.css` di 4.470 righe con 352 colori scritti a mano e circa 90 regole di eccezione per il tema notte: difficile da mantenere.
- Più versioni della stessa finestra (`Sheet` in `home.js`, `Panel` nella TV, finestre dell'armadio).
- Mancano: selettore della lingua, indicatore di connessione uniforme su tutte le pagine.

## 6. Consumo di Firebase (piano Spark)

| Schermata | Ascolti attivi | Nota |
|---|---|---|
| TV | ~20 sotto-nodi della stanza + 7 del gruppo + armadio (library, info) | `nights` e `library` interi |
| Telefono | ~15 sotto-nodi della stanza + `nights`, `identity`, `next` + armadio `library` | Ogni telefono scarica tutte le serate passate e tutte le miniature |
| Armadio | info, library, loans, log, trash, share, invites | Le foto grandi solo quando servono |
| Home | `groups/<id>/current` per gruppo | Leggero |

Stima: armadio da 150 giochi ≈ 1,2 MB di miniature; 8 telefoni + TV a serata ≈ 10–25 MB. Con 10 GB al mese c'è margine (centinaia di serate), ma le funzioni nuove (manuali, suoni) devono restare fuori da questi nodi.

## 7. Testi dell'interfaccia

Circa **2.400 testi** (stima con uno script) scritti direttamente nei moduli: `host.js` ~700, `play.js` ~300, `selftest.js` ~240, `armadio.js` ~230, `home.js` ~100, poi `stats.js`, `extras.js`, `tv-extras.js`, `updates.js`, `commentary.js`. A questi si aggiungono `aria-label`, `title`, `placeholder`, testi delle immagini su canvas e del PDF.

## 8. Piano degli incrementi

| Versione | Contenuto | Priorità | Stato |
|---|---|---|---|
| 1.4.0 | Test end-to-end nel repository e in CI; correzioni di sicurezza; infrastruttura delle lingue (`i18n.js`, dizionari, selettore, controllo di parità); nuovo logo; nuova home dai mockup, già bilingue | P0 + P1 | fatta (non pubblicata da sola: è dentro la 1.5.0) |
| 1.5.0 | Link ufficiali centralizzati con configurazione remota (`config/links.json`, `docs/LINKS.md`), icone GitHub e Discord, `go.html`, modelli di segnalazione su GitHub, APK solo sulle release pubblicate dall'utente; schermate principali del telefono (`play.js`) e statistiche (`stats.js`) bilingui | P1 | fatta |
| 1.6.0 | Sistema di design applicato a tutte le pagine; finestre unificate; responsive e accessibilità | P1 | fatta (dentro la 1.10.0) |
| 1.7.0 | App completamente bilingue (TV, armadio, resoconto, verifica, pannelli extra del telefono) | P1 | fatta (dentro la 1.10.0) |
| 1.8.0 | BoardGameGeek nell'app (il proxy è pronto), manuali nei 3 modi gratuiti, Consigliere | P2 | fatta (dentro la 1.10.0); BGG attivo appena c'è il token |
| 1.9.0 | Diagnostica, centro privacy, prestiti scaduti, catalogo pubblico, ritaglio foto | P3 | fatta (dentro la 1.10.0) |
| 1.10.0 | Soundboard personalizzata, atmosfere, "Il vostro anno", Android TV; pausa, timer condiviso, preferiti, import/export, schermo ambiente; PDF veri nell'app | P4 | fatta |

## 9. Matrice di implementazione

| Funzione | Stato iniziale | Priorità | Interventi | Test | Stato finale | Limiti |
|---|---|---|---|---|---|---|
| Test e2e nel repository + CI | assente | P0 | `tests/e2e/` (32 prove), workflow Verifica | run.py | fatto (1.4) | In CI gira un sottoinsieme (limite di tempo) |
| Sicurezza `members` | difettosa | P0 | cancellazione e cambio di gruppo vietati | rules.test.js | fatto (1.4) | Serve ricopiare le regole in Firebase |
| CSP più stretta | migliorabile | P0 | `script-src 'self'` | e2e | fatto (1.4) | `style-src` resta `'unsafe-inline'` |
| Lingue IT/EN (infrastruttura) | assente | P0 | `i18n.js`, `lang/`, parità in check.mjs | check.mjs, i18n.py | fatto (1.4) | |
| Nuovo logo e home | migliorabile | P1 | dai mockup dell'utente | hub.py, look.py | fatto (1.4) | |
| Telefono in serata bilingue | assente | P1 | `play.js`, `stats.js`; codici neutri nel database (time-out, titoli dei premi) con traduzione dei vecchi testi | suite completa | fatto (1.5) | Pannelli extra, pre-partita e soundboard ancora in italiano |
| Link ufficiali centralizzati | sparsi nel codice | P1 | `config/links.json`, `links-core.js` (riutilizzabile), `links.js`, `go.html` | links.test.mjs (23), links.py, check.mjs | fatto (1.5) | Un dominio nuovo richiede una versione (voluto) |
| APK solo sulle release pubblicate | a ogni push, release modificata ogni volta | P1 | `android.yml` su `release: published`, solo file caricati; app su `releases/latest` con `digest`; ponte per le app 1.3 | upd13.py, YAML validato | fatto (1.5) | Non eseguito su GitHub da qui |
| Sistema di design su tutte le pagine | solo home | P1 | `css/ui.css` (sezione 1.6): i vecchi token puntano a quelli nuovi su telefono, armadio, ludoteca, resoconto, download, verifica; telecomando (`spatialnav.js`) | look.py, fit.py, screenshot a 390 e 1366 px nei due temi | fatto (1.10) | La TV tiene la sua scenografia (stessi colori e font) |
| App bilingue | ~2.400 testi in italiano | P1 | dizionari per area, `i18n-scan.mjs`, controllo in `check.mjs` (sezione 9: zero testi scritti nel codice) | check.mjs, i18n.py, phone_en.py | fatto (1.10) | Quiz nella lingua della TV; cronologia dell'armadio salvata in italiano (dato) |
| BoardGameGeek | solo CSV | P2 | `bgg.js` (ricerca, scheda, confronto campo per campo), proxy `bgg-proxy/` | features.test, data16.py (proxy simulato), worker.test | fatto (1.10) | Serve il token di BGG, il Worker pubblicato e `BGG_PROXY_URL` in `js/services.js` |
| Manuali (3 modi) | assenti | P2 | link nel gioco, file sul dispositivo (IndexedDB), ricerca guidata; QR sulla scheda delle regole | data16.py, exports16.py | fatto (1.10) | I file locali non passano tra dispositivi (voluto: niente spazio su Firebase) |
| Consigliere e preferiti | consigli senza filtri | P2 | `recommend()` con tempo, peso, modalità, preferiti, tavolo; `favs.js` (profilo `people/<id>/favs`) | features.test, night16.py | fatto (1.10) | |
| Diagnostica e privacy | registro errori | P3 | `datacenter.js` | data16.py | fatto (1.10) | |
| Prestiti scaduti | nessun avviso | P3 | `loanAlerts()`, avviso in home | features.test, data16.py | fatto (1.10) | |
| Catalogo pubblico con campi scelti | tutto o niente | P3 | `pubFieldsOf`, anteprima, revoca, regole sui campi | rules.test, data16.py | fatto (1.10) | |
| Ritaglio delle foto | assente | P3 | `editPhoto` con ritaglio (anche da tastiera) | features.test, data16.py | fatto (1.10) | |
| Pausa della serata | solo time-out | P4 | `nightclock.js` (`pausePatch`), stato `paused` | nightclock.test, night16.py | fatto (1.10) | La finestra dei pronostici (5 minuti) non si ferma in pausa |
| Timer condiviso | clessidra locale | P4 | `rooms/<c>/timer` con `endsAt` e `rev` (regole: rev+1), niente scritture al secondo, scadenza una volta per dispositivo | nightclock.test, rules.test, night16.py | fatto (1.10) | |
| Schermo ambiente | assente | P4 | `ambient.js`, `meta.ambient` | night16.py | fatto (1.10) | |
| Import/export completo | solo armadio | P4 | `portability.js` (formato v2, piano senza sovrascritture, scrittura atomica) | features.test, data16.py | fatto (1.10) | I gruppi si ripristinano dalla TV |
| Soundboard personalizzata, atmosfere con suono, Il vostro anno | assenti | P4 | `customsfx.js`, `atmosound.js`, `wrapped()` | features.test, rules.test, tranche2.py (Il vostro anno) | fatto (1.10) | Audio da sentire a mano (suoni caricati e atmosfere non provati nel browser) |
| Android TV | assente | P4 | banner, Leanback, touchscreen non richiesto, telecomando | features.test (D-pad) | fatto (1.10) | ✋ da provare su un televisore vero |
| Esportazioni dall'app Android | PDF salvato come HTML | P1 | `pdfdoc.js` (PDF vero: resoconto, serata, etichette con QR), `nativeOpen` | pdf.test, exports16.py | fatto (1.10) | ✋ da provare su un telefono vero |
| Pulizia del repository | file sparsi nella radice | P1 | `firebase/`, `docs/`, `.github/`; README snellito | check.mjs | fatto (1.10) | |

La matrice viene aggiornata a ogni incremento.
