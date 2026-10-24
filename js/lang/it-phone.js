// Testi in italiano dell'area "phone". Stesse chiavi di en-phone.js (tests/check.mjs).
export default {
  'phx.regia.lost': 'Il codice regia è cambiato: la regia da questo telefono è stata disattivata.',

  // Chi inizia, squadre, clessidra
  'phx.table.starts': '🎲 Inizia <b>{name}</b>',
  'phx.table.startsMe': '🎲 Inizia <b>{name} (tu!)</b>',
  'phx.table.team': 'Sei nei <b>{team}</b>',
  'phx.table.teamWith': 'Sei nei <b>{team}</b> con {names}',
  'phx.sand.over': '⏳ Tempo!',
  'phx.sand.left': '⏳ {n} s',

  // Segnapunti
  'phx.score.title': '🧮 Segnapunti',
  'phx.score.titleGame': '🧮 Segnapunti: {game}',
  'phx.score.set': 'Scrivi il punteggio',
  'phx.score.hint': 'I punti di tutti compaiono sulla TV. Se nessuno segna il vincitore, vince chi ha più punti.',
  'phx.score.prompt': 'Il tuo punteggio:',
  'phx.score.nan': 'Scrivi un numero.',
  'phx.score.net': 'Punti',

  // Quiz
  'phx.quiz.aria': 'Quiz del gruppo',
  'phx.quiz.done': '🧠 Quiz finito',
  'phx.quiz.points': { one: '{n} punto', other: '{n} punti' },
  'phx.quiz.watch': 'Guarda la TV!',
  'phx.quiz.head': '🧠 Domanda {n} di {total}',
  'phx.quiz.right': '✅ Giusto! +1',
  'phx.quiz.wrong': '❌ Sbagliato',
  'phx.quiz.missed': '⏱️ Non hai risposto',
  'phx.quiz.sent': 'Risposta inviata: guarda la TV',
  'phx.quiz.tap': 'Tocca la risposta giusta',

  // Figurina
  'phx.card.title': '🃏 La tua figurina',
  'phx.card.empty': 'Arriva dopo la prima serata salvata del gruppo.',
  'phx.card.share': 'Condividi la figurina',
  'phx.card.album': 'Album del gruppo: {found} / {total} figurine trovate',
  'phx.card.shareText': 'La mia figurina di GameNight Show: livello {level}, {rarity}!',
  'phx.card.fail': 'Non sono riuscito a creare l’immagine.',

  // Rivalità e stagione
  'phx.rivals.title': '⚔️ Le tue rivalità',
  'phx.rivals.empty': 'Compaiono quando avete giocato insieme partite con un vincitore.',
  'phx.rivals.games': { one: '{n} partita', other: '{n} partite' },
  'phx.rivals.nemesis': {
    one: 'La tua nemesi: <b>{name}</b> (ti ha battuto {n} volta, tu {won})',
    other: 'La tua nemesi: <b>{name}</b> (ti ha battuto {n} volte, tu {won})'
  },
  'phx.rivals.victim': 'La tua vittima preferita: <b>{name}</b> ({won} a {lost} per te)',
  'phx.season.line': 'Stagione {name}: <b>{rank}° posto</b> con {points} punti su {total} giocatori',
  'phx.season.won': 'Stagioni vinte: <b>{list}</b>',

  // Invito
  'phx.ics.add': 'Aggiungi al calendario'
};
