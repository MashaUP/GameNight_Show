// English texts for the "phone" area. Same keys as it-phone.js (tests/check.mjs).
export default {
  'phx.regia.lost': 'The host code has changed: host controls on this phone have been turned off.',

  // Who goes first, teams, sand timer
  'phx.table.starts': '🎲 <b>{name}</b> goes first',
  'phx.table.startsMe': '🎲 <b>{name} (you!)</b> goes first',
  'phx.table.team': 'You’re on <b>{team}</b>',
  'phx.table.teamWith': 'You’re on <b>{team}</b> with {names}',
  'phx.sand.over': '⏳ Time!',
  'phx.sand.left': '⏳ {n} s',

  // Scores
  'phx.score.title': '🧮 Scores',
  'phx.score.titleGame': '🧮 Scores: {game}',
  'phx.score.set': 'Type your score',
  'phx.score.hint': 'Everyone’s points show up on the TV. If nobody marks the winner, whoever has the most points wins.',
  'phx.score.prompt': 'Your score:',
  'phx.score.nan': 'Type a number.',
  'phx.score.net': 'Points',

  // Quiz
  'phx.quiz.aria': 'Group quiz',
  'phx.quiz.done': '🧠 Quiz over',
  'phx.quiz.points': { one: '{n} point', other: '{n} points' },
  'phx.quiz.watch': 'Look at the TV!',
  'phx.quiz.head': '🧠 Question {n} of {total}',
  'phx.quiz.right': '✅ Right! +1',
  'phx.quiz.wrong': '❌ Wrong',
  'phx.quiz.missed': '⏱️ You didn’t answer',
  'phx.quiz.sent': 'Answer sent: look at the TV',
  'phx.quiz.tap': 'Tap the right answer',

  // Player card
  'phx.card.title': '🃏 Your player card',
  'phx.card.empty': 'It arrives after the group’s first saved night.',
  'phx.card.share': 'Share your card',
  'phx.card.album': 'Group album: {found} / {total} cards found',
  'phx.card.shareText': 'My GameNight Show player card: level {level}, {rarity}!',
  'phx.card.fail': 'I couldn’t create the image.',

  // Rivalries and season
  'phx.rivals.title': '⚔️ Your rivalries',
  'phx.rivals.empty': 'They show up once you’ve played games together with a winner.',
  'phx.rivals.games': { one: '{n} game', other: '{n} games' },
  'phx.rivals.nemesis': {
    one: 'Your nemesis: <b>{name}</b> (beat you {n} time, you won {won})',
    other: 'Your nemesis: <b>{name}</b> (beat you {n} times, you won {won})'
  },
  'phx.rivals.victim': 'Your favourite victim: <b>{name}</b> ({won} to {lost} for you)',
  'phx.season.line': 'Season {name}: <b>#{rank}</b> with {points} points out of {total} players',
  'phx.season.won': 'Seasons won: <b>{list}</b>',

  // Invite
  'phx.ics.add': 'Add to calendar',

  'ph.guest.label': 'I’m joining as a guest',
  'ph.guest.hintGroup': 'You vote like everyone tonight, but nothing about you stays in the group: no profile, stats, signed comments or titles.',
  'ph.guest.hint': 'You vote like everyone tonight, without creating a profile on this phone.',
  'ph.guest.you': 'You’re a guest: your vote counts tonight, but nothing about you is saved in the group.',

  // ---------------------------------------------------------------- 2.2 rivelazione dei voti (telefono)
  'ph.vote.allManual': 'Everyone has voted: the host reveals the votes when ready.',
  'ph.vote.allAuto': 'Everyone has voted: watch the TV!'
};
