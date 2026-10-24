// English texts for the "tvx" area. Same keys as it-tvx.js (tests/check.mjs).
export default {
  // Table tools
  'tvx.table.title': '🎲 Table tools',
  'tvx.table.tools': 'Tools',
  'tvx.table.starter': 'Who goes first?',
  'tvx.table.teams': 'Teams',
  'tvx.table.need2': 'You need at least 2 players.',
  'tvx.table.starterLead': 'Who makes the first move? The wheel decides, and the name shows up on the phones too.',
  'tvx.table.spin': 'Spin the wheel',
  'tvx.table.last': 'Last pick: <b>{name}</b>',
  'tvx.table.starts': '<b>{name}</b> goes first!',
  'tvx.table.startsLog': '{name} goes first',
  'tvx.table.teamsLead': 'Balanced teams: whoever wins most in the group’s history gets split up from the other strong players.',
  'tvx.table.nTeams': '{n} teams',
  'tvx.table.clearTeams': 'Remove teams',
  'tvx.table.teamsEmpty': 'Pick how many teams: you can reshuffle as often as you like.',
  'tvx.table.teamsLog': '{n} teams: {list}',

  // Game wheel
  'tvx.wheel.need2': 'You need at least 2 games on the shelf that suit tonight and haven’t been played yet.',
  'tvx.wheel.title': '🎡 The game wheel',
  'tvx.wheel.lead': {
    one: '{games} games for {n} player, not played yet tonight. Let luck decide!',
    other: '{games} games for {n} players, not played yet tonight. Let luck decide!'
  },
  'tvx.wheel.spin': 'Spin!',
  'tvx.wheel.result': 'We’re playing <b>{name}</b>!',
  'tvx.wheel.log': 'The wheel picked {name}',
  'tvx.wheel.toast': 'The wheel picked: {name}',

  // Scoreboard
  'tvx.score.title': '🧮 Scores',
  'tvx.score.fix': 'Fix {name}’s score',
  'tvx.score.prompt': '{name}’s score:',
  'tvx.score.nan': 'Type a number.',

  // Quiz
  'tvx.quiz.none': 'I don’t have any questions ready.',
  'tvx.quiz.name': 'Group quiz',
  'tvx.quiz.kicker': '🧠 Group quiz',
  'tvx.quiz.count': { one: '{n} question', other: '{n} questions' },
  'tvx.quiz.rules': 'Answer from your phone: one answer only, {secs} seconds per question. One point for every right answer.',
  'tvx.quiz.first': 'First question',
  'tvx.quiz.kind.trivia': '🎲 Game trivia',
  'tvx.quiz.kind.tonight': '🌙 Tonight',
  'tvx.quiz.kind.group': '👥 The group',
  'tvx.quiz.closeQuiz': 'Close the quiz',
  'tvx.quiz.reveal': 'Reveal',
  'tvx.quiz.answered': '{n} / {total} have answered',
  'tvx.quiz.final': 'Final standings',
  'tvx.quiz.next': 'Next question',
  'tvx.quiz.nobody': 'Nobody got it!',
  'tvx.quiz.wins': { one: '{names} wins!', other: '{names} win!' },
  'tvx.quiz.noPoints': 'No points!',
  'tvx.quiz.back': 'Back to the night',

  // Intruder alarm
  'tvx.knock.locked': 'tried to get into the locked room',
  'tvx.knock.banned': 'was kicked out and tried to get back in',
  'tvx.knock.regia': 'tried a wrong host code',
  'tvx.knock.full': 'tried to get into the full room',
  'tvx.knock.device': 'A device',
  'tvx.knock.times': { one: '({n} time)', other: '({n} times)' },
  'tvx.knock.log': 'Alarm: {text}',
  'tvx.knock.title': 'Intruder alarm',
  'tvx.knock.clear': 'Clear the list',
  'tvx.knock.none': 'No suspicious attempts tonight.',

  // Security
  'tvx.regia.log': 'Host code changed: host controls on phones need to be activated again',
  'tvx.rooms.log': {
    one: '{n} old room deleted (older than {days} days)',
    other: '{n} old rooms deleted (older than {days} days)'
  },

  // Seasons
  'tvx.season.nights': { one: '{n} night', other: '{n} nights' },
  'tvx.season.champ': '{n} as champion',
  'tvx.season.wins': { one: '{n} win', other: '{n} wins' },
  'tvx.season.mvp': '{n} MVP',
  'tvx.season.pt': 'pts',
  'tvx.season.pts': '{n} pts',
  'tvx.season.title': 'Season {name}',
  'tvx.season.rules': 'Points for each night’s champions: win 3, MVP vote 1, correct prediction 1, guessed average 1. At the end of the season whoever is first wins the trophy.',
  'tvx.season.empty': 'The season starts with the next saved night.',
  'tvx.season.hall': '🏆 Hall of fame',
  'tvx.season.hallEmpty': 'The first trophy is awarded at the end of this season.',
  'tvx.stage.title': 'Season standings {name}',
  'tvx.stage.gain': '+{n} tonight',
  'tvx.stage.new': 'new',

  // Rivalries
  'tvx.rivals.emptyTitle': 'No rivalries yet',
  'tvx.rivals.emptyText': 'You need games played together with a winner marked.',
  'tvx.rivals.games': { one: '{n} game together', other: '{n} games together' },
  'tvx.rivals.tie': 'dead even',
  'tvx.rivals.ahead': '{name} ahead',
  'tvx.rivals.line': '⚔️ Rivalry on the line: {a} {aw}–{bw} {b}',

  // Player cards
  'tvx.cards.emptyTitle': 'No player cards yet',
  'tvx.cards.emptyText': 'Every player gets their card after the first saved night.',
  'tvx.cards.lead': 'One card for each player: rarity grows with level (Common, Rare, Epic, Legendary). On the phone, in “My profile”, you can share it as an image.',

  // Recap video
  'tvx.video.title': '🎬 Video of the night',
  'tvx.video.lead': 'A vertical story of about 20 seconds with games, champions, awards and photos: perfect for the WhatsApp group. The TV records it now: keep this window open.',
  'tvx.video.make': 'Make the video',
  'tvx.video.unsupported': 'This browser can’t record video: use Chrome, Edge or Firefox on a computer.',
  'tvx.video.recording': 'Recording…',
  'tvx.video.info': '{secs} seconds · {mb} MB · {format} format',
  'tvx.video.save': 'Download the video',
  'tvx.video.log': 'Video of the night created',
  'tvx.video.fail': 'I couldn’t record the video.',

  // CSV import
  'tvx.csv.none': 'I found no games in the file: it needs a column with the name (objectname for BoardGameGeek, or "name").',
  'tvx.csv.bgg': 'BoardGameGeek collection',
  'tvx.csv.file': 'CSV file',
  'tvx.csv.confirm': '{src}: {n} games.\n\n• {fresh} new to add to the shelf\n• {known} already there (I’ll only fill in missing details: players, length, year)\n\nGo ahead?',
  'tvx.csv.log': 'Game shelf: imported {n} games from {src}'
};
