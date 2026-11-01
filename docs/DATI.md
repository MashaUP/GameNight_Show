# I tuoi dati: esportazione e importazione

Da **Profilo e app › I tuoi dati e la privacy** (home) si esportano i propri dati in un file e li si importa in un'altra
installazione di GameNight Show: un'altra copia del sito con il suo Firebase, un altro dispositivo, l'app Android.
Il codice è in `js/portability.js` (funzioni pure, provate in `tests/features.test.mjs`) e `js/datacenter.js`
(finestre, anteprima, scritture).

## Il file (`gamenight-export`, versione 2)

È un JSON leggibile. La versione del **formato** (`version`) è separata dalla versione dell'**app** (`app`):
il formato cambia solo quando cambia la struttura del file.

```json
{
  "format": "gamenight-export",
  "version": 2,
  "app": "1.10.0",
  "exportedAt": "2026-10-24T10:00:00.000Z",
  "categories": ["profile", "favs", "armadi", "loans", "groups"],
  "profile": { "name": "Anna", "style": "adventurer", "seed": "…", "color": "#FFC93C" },
  "favs": { "<armadio>": { "<gioco>": 1761300000000 } },
  "armadi": [
    { "id": "ABC123", "name": "Armadio di casa", "desc": "…", "emoji": "🎲",
      "games": [ { "id": "g1", "name": "Azul", "minPlayers": 2, "maxPlayers": 4, "duration": 45, "manual": "https://…" } ],
      "loans": [ { "id": "L1", "item": "g1", "to": "Bruno", "start": 1761300000000, "due": 1761900000000 } ] }
  ],
  "groups": [ { "kind": "group", "group": { "id": "XYZ789", "name": "…" }, "nights": { } } ],
  "sum": "impronta del contenuto"
}
```

- **categories**: quelle scelte da chi esporta (profilo, preferiti, armadi, prestiti, gruppi). I prestiti vanno
  solo insieme agli armadi.
- **profile**: solo l'aspetto (nome, personaggio, colore, motto e opzioni), **mai** la chiave del profilo.
- **armadi**: i giochi con i loro campi (nome, giocatori, durata, peso, modalità, note, link al manuale, id BGG…);
  non le foto grandi (troppo pesanti), non i legami con i prestiti e le scelte della serata.
- **groups**: lo stesso formato del pulsante **Backup del gruppo** della TV (con impronta propria).
- **sum**: impronta per riconoscere un file modificato a mano. Un file modificato si può importare lo stesso, ma
  l'anteprima lo segnala.

Dalla 1.12 il file può contenere anche **`mine`** (voce *Le mie statistiche*): per ogni gruppo
`{ group, nights, votesGiven, avgGiven, wins, mvp, games: { <gioco>: [voti in ordine di data] } }`, solo per la persona
che esporta (riconosciuta dal profilo del gruppo, oppure dal nome del profilo personale se non ha un profilo di gruppo).
Non contiene nomi o voti di altri. All'importazione si ignora: serve per leggerlo, non per ricostruire niente.

**Mai nel file:** chiavi dei profili, degli armadi e dei gruppi, codice regia, identificativi dei dispositivi,
token del catalogo pubblico, configurazione di Firebase.

Si leggono anche i file **`gamenight-armadio` versione 1** (esportazione di un solo armadio, dalla 1.2).
Un file con una versione del formato **più nuova** di quella che l'app conosce viene rifiutato con un messaggio
chiaro ("aggiorna GameNight Show"), invece di essere letto a metà.

## Esportazione delle statistiche del gruppo (`gamenight-stats`, versione 1)

Dalla TV, **Di sempre › Analisi › Esporta** (1.12). CSV (separatore virgola, UTF-8 con BOM per Excel) o JSON:

```
{ format: 'gamenight-stats', version: 1, exportedAt: ISO,
  filters: { from: ms|null, to: ms|null, game: nome|null, person: 'P1'|chiave|null, names: bool },
  rows: [ { date: 'AAAA-MM-GG', night: codice, game, avg, votes, minutes, winners: 'P1 + P3' } ] }
```

- Una riga per gioco votato in una serata, dalla più vecchia; `avg` con due decimali, `minutes` solo se cronometrato.
- **Nomi**: di base le persone diventano `P1`, `P2`… (lo stesso numero per la stessa persona *nello stesso file*;
  file diversi possono numerare diversamente). Con la casella *Con i nomi delle persone* compaiono i nomi del gruppo.
- Con il filtro di una persona (usato dalle prove e dai calcoli) le colonne diventano `person`, `vote`, `won`.
- Gli ospiti non ci sono mai: il riassunto della serata non li contiene.

## Altri dati della 1.12 nel database

| Percorso | Contenuto | Chi scrive |
|---|---|---|
| `rooms/<codice>/customAwards/<id>` | `{ t: nome (≤ 32), e: simbolo, uid: giocatore, at }` — premi del gruppo della serata | regia e co-regia; solo giocatori in stanza e non ospiti |
| `rooms/<codice>/meta/opening`, `meta/award` | gioco d'apertura e premio ricorrente applicati da un modello | regia |
| `rooms/<codice>/meta/seasonal` | accessori stagionali accesi | regia |
| `groups/<gruppo>/house/<id>` | `{ text (≤ 200), g?: gioco, at }` — regole della casa | proprietario, admin, dispositivi del gruppo |
| `groups/<gruppo>/templates/<id>/s/opening`, `s/award` | tradizioni del modello | proprietario e admin |
| `groups/<gruppo>/nights/<codice>` | in più dalla 1.12: `games/*/mode`, `games/*/weight` (dall'armadio) e `custom: [{ t, e, k, name }]` | come prima |

## Dati della 2.0 nel database

| Percorso | Contenuto | Chi scrive |
|---|---|---|
| `accounts/<uid>` | `{ pid, key, at }`: profilo personale collegato all'account | solo la persona, solo con un account vero (non anonimo) e con la chiave giusta del profilo |
| `rooms/<codice>/players/<uid>/pid` | profilo del giocatore (per rientrare e per spostare il posto quando cambia l'uid) | il giocatore |
| `rooms/<codice>/handover/<uid>` | gettone casuale (12–40 caratteri) per il passaggio di identità | il giocatore stesso (o la TV per toglierlo) |
| `rooms/<codice>/late/<gioco>/<uid>` | `{ at, edit? }`: finestra per un voto dopo la votazione (o per cambiarlo) | regia e co-regia |
| `rooms/<codice>/votes/<gioco>/<uid>` | in più: `late: true` (aggiunto dopo), `editedAt` (cambiato dopo), `by: 'tv'` | il giocatore con la finestra aperta, o la TV |
| `rooms/<codice>/votelog/<id>` | `{ gid, uid, kind: open/close/late/edit/proxy, by, at }` — non modificabile | regia; il giocatore solo per il proprio voto |
| `armadi/<id>/library/<gioco>/bggInfo` | `{ designers[≤3], age, rating, rank, mech[≤5], at }` da BoardGameGeek | chi modifica l'armadio |

## Dati della 2.1 nel database

| Percorso | Contenuto | Chi scrive |
|---|---|---|
| `groups/<gruppo>/nights/<codice>/games/<id>/name|key|playedMin` | correzioni del riassunto chiuso | solo il creatore della serata, a stanza cancellata |
| `groups/<gruppo>/nights/<codice>/fixes/<id>` | `{ gid, what, why, at }` — cronologia, non modificabile | come sopra |
| `groups/<gruppo>/organizers/<uid>` | `true`: può gestire i modelli di serata | admin, o il dispositivo stesso con la chiave `groupOrgKeys` |
| `groups/<gruppo>/next/board/<id>`, `next/sugg/<id>` | `{ text, key, name, at }` note e suggerimenti | dispositivi del gruppo |
| `groups/<gruppo>/identity/theme` | `{ bg, accent, font, podium }` | proprietario e admin |
| `groups/<gruppo>/privacy/photosDays` | giorni dopo cui togliere le foto dell'album (0 = mai) | proprietario e admin |
| `challenges/<codice>/<gruppo>` | `{ name, nights, games, votes, avg, top, recent, at }` solo aggregati | proprietario e admin del gruppo |
| `armadi/<id>/proposals/<id>` | `{ item, patch, why, uid, name, at }` | chiunque per sé; leggono e decidono proprietario e collaboratori |
| `armadi/<id>/info/keepLogDays` | giorni di cronologia da tenere | proprietario |
| `rooms/<codice>/meta/chaosOff`, `chaosWheel`, `votingByMode`, `maxMinutes`, `maxGames` | impostazioni della serata | regia |
| `rooms/<codice>/games/<id>/voting` | domande usate per quel gioco | regia |

## CSV delle partite per altri tracker (2.1)

`GameNight_<Gruppo>_<data>_Partite.csv`, UTF-8 con BOM, colonne `date, game, bgg_id, player, score, winner, minutes, rating, night`: una riga per giocatore per partita (il pubblico che votava senza giocare non c'è), ospiti come `Guest N`, data ISO, celle che iniziano con `= + - @` protette.

## Nomi dei file esportati (2.0)

`GameNight_<Gruppo>_<AAAA-MM-GG della serata>_<Tipo>[_<dettaglio>].<estensione>`, per esempio `GameNight_Amici-del-giovedi_2026-10-31_Resoconto.pdf`. Se sullo stesso dispositivo esce di nuovo lo stesso nome si aggiunge `_2`, `_3`… Il formato dei file (versione, campi) non cambia.

## Importazione guidata

1. **Scegli il file.** Si controllano dimensione (massimo 40 MB), JSON valido, formato e versione.
2. **Controllo del contenuto.** Ogni gioco passa dagli stessi controlli dell'armadio (campi, lunghezze, numeri);
   i prestiti devono puntare a giochi del file. Quello che non va è scartato e **elencato** nell'anteprima
   (massimo 2.000 giochi per armadio, 50 armadi, 20 gruppi).
3. **Anteprima.** Per ogni parte si sceglie cosa fare:
   - **profilo**: crearlo (se il dispositivo non ne ha uno) o sostituirne l'aspetto, solo con la casella spuntata;
   - **armadio**: come **armadio nuovo** (con i prestiti, se scelto) oppure **dentro un armadio esistente**, in
     modalità *aggiungi solo i giochi che mancano* o *aggiungi e completa i campi vuoti*. I conteggi (nuovi,
     completati, uguali, scartati, doppioni) si vedono prima di confermare;
   - **preferiti**: portati sugli armadi importati (gli id dei giochi vengono tradotti);
   - **gruppi**: non si scrivono da qui: si scarica il file del gruppo e lo si importa dalla TV del gruppo
     (**Strumenti › Importa backup del gruppo**), che controlla la chiave del gruppo.
4. **Scrittura.** Nessuna sovrascrittura silenziosa: un gioco già presente non viene mai sostituito, al massimo
   completato nei campi vuoti. Ogni armadio nuovo si scrive con **un solo aggiornamento multiplo** (tutto o
   niente); se qualcosa fallisce, l'esito dice cosa è stato importato e cosa no.

## Cancellare i propri dati

Sempre da **I tuoi dati e la privacy**: si può cancellare il profilo personale (con un solo aggiornamento che
toglie anche i collegamenti a gruppi e armadi), spegnere il catalogo pubblico di un armadio e svuotare i dati
del dispositivo. Cosa sta dove: [PRIVACY.md](PRIVACY.md).
