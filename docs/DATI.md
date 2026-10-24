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

**Mai nel file:** chiavi dei profili, degli armadi e dei gruppi, codice regia, identificativi dei dispositivi,
token del catalogo pubblico, configurazione di Firebase.

Si leggono anche i file **`gamenight-armadio` versione 1** (esportazione di un solo armadio, dalla 1.2).
Un file con una versione del formato **più nuova** di quella che l'app conosce viene rifiutato con un messaggio
chiaro ("aggiorna GameNight Show"), invece di essere letto a metà.

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
