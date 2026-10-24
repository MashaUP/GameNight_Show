// Testi in italiano dell'area "tvx". Stesse chiavi di en-tvx.js (tests/check.mjs).
export default {
  // Strumenti da tavolo
  'tvx.table.title': '🎲 Strumenti da tavolo',
  'tvx.table.tools': 'Strumenti',
  'tvx.table.starter': 'Chi inizia?',
  'tvx.table.teams': 'Squadre',
  'tvx.table.need2': 'Servono almeno 2 giocatori.',
  'tvx.table.starterLead': 'Chi fa la prima mossa? La ruota lo decide, e il nome compare anche sui telefoni.',
  'tvx.table.spin': 'Gira la ruota',
  'tvx.table.last': 'Ultimo estratto: <b>{name}</b>',
  'tvx.table.starts': 'Inizia <b>{name}</b>!',
  'tvx.table.startsLog': 'Inizia {name}',
  'tvx.table.teamsLead': 'Squadre equilibrate: chi vince di più nello storico del gruppo viene diviso dagli altri forti.',
  'tvx.table.nTeams': '{n} squadre',
  'tvx.table.clearTeams': 'Togli le squadre',
  'tvx.table.teamsEmpty': 'Scegli quante squadre: si possono rimescolare quante volte volete.',
  'tvx.table.teamsLog': '{n} squadre: {list}',

  // Ruota dei giochi
  'tvx.wheel.need2': 'Servono almeno 2 giochi nell’armadio adatti a stasera e non ancora giocati.',
  'tvx.wheel.title': '🎡 La ruota dei giochi',
  'tvx.wheel.lead': {
    one: '{games} giochi adatti a {n} giocatore e non ancora giocati stasera. Decide la fortuna!',
    other: '{games} giochi adatti a {n} giocatori e non ancora giocati stasera. Decide la fortuna!'
  },
  'tvx.wheel.spin': 'Gira!',
  'tvx.wheel.result': 'Si gioca a <b>{name}</b>!',
  'tvx.wheel.log': 'La ruota ha scelto {name}',
  'tvx.wheel.toast': 'La ruota ha scelto: {name}',

  // Segnapunti
  'tvx.score.title': '🧮 Segnapunti',
  'tvx.score.fix': 'Correggi il punteggio di {name}',
  'tvx.score.prompt': 'Punteggio di {name}:',
  'tvx.score.nan': 'Scrivi un numero.',

  // Quiz
  'tvx.quiz.none': 'Non ho domande pronte.',
  'tvx.quiz.name': 'Quiz del gruppo',
  'tvx.quiz.kicker': '🧠 Quiz del gruppo',
  'tvx.quiz.count': { one: '{n} domanda', other: '{n} domande' },
  'tvx.quiz.rules': 'Rispondete dal telefono: una risposta sola, {secs} secondi a domanda. Un punto per ogni risposta giusta.',
  'tvx.quiz.first': 'Prima domanda',
  'tvx.quiz.kind.trivia': '🎲 Curiosità ludica',
  'tvx.quiz.kind.tonight': '🌙 Stasera',
  'tvx.quiz.kind.group': '👥 Il gruppo',
  'tvx.quiz.closeQuiz': 'Chiudi il quiz',
  'tvx.quiz.reveal': 'Svela',
  'tvx.quiz.answered': '{n} / {total} hanno risposto',
  'tvx.quiz.final': 'Classifica finale',
  'tvx.quiz.next': 'Prossima domanda',
  'tvx.quiz.nobody': 'Nessuno ha indovinato!',
  'tvx.quiz.wins': { one: 'Vince {names}!', other: 'Vince {names}!' },
  'tvx.quiz.noPoints': 'Nessun punto!',
  'tvx.quiz.back': 'Torna alla serata',

  // Allarme intrusi
  'tvx.knock.locked': 'ha provato a entrare nella stanza chiusa',
  'tvx.knock.banned': 'espulso, ha provato a rientrare',
  'tvx.knock.regia': 'ha provato un codice regia sbagliato',
  'tvx.knock.full': 'ha provato a entrare nella stanza piena',
  'tvx.knock.device': 'Un dispositivo',
  'tvx.knock.times': { one: '({n} volta)', other: '({n} volte)' },
  'tvx.knock.log': 'Allarme: {text}',
  'tvx.knock.title': 'Allarme intrusi',
  'tvx.knock.clear': 'Pulisci l’elenco',
  'tvx.knock.none': 'Nessun tentativo sospetto stasera.',

  // Sicurezza
  'tvx.regia.log': 'Codice regia cambiato: la regia dai telefoni va riattivata',
  'tvx.rooms.log': {
    one: '{n} stanza vecchia cancellata (più di {days} giorni)',
    other: '{n} stanze vecchie cancellate (più di {days} giorni)'
  },

  // Stagioni
  'tvx.season.nights': { one: '{n} serata', other: '{n} serate' },
  'tvx.season.champ': '{n} da campione',
  'tvx.season.wins': { one: '{n} vittoria', other: '{n} vittorie' },
  'tvx.season.mvp': '{n} MVP',
  'tvx.season.pt': 'pt',
  'tvx.season.pts': '{n} pt',
  'tvx.season.title': 'Stagione {name}',
  'tvx.season.rules': 'Punti dei campioni di ogni serata: vittoria 3, voto MVP 1, pronostico azzeccato 1, media indovinata 1. A fine stagione chi è primo vince il trofeo.',
  'tvx.season.empty': 'La stagione comincia con la prossima serata salvata.',
  'tvx.season.hall': '🏆 Albo d’oro',
  'tvx.season.hallEmpty': 'Il primo trofeo si assegna alla fine di questa stagione.',
  'tvx.stage.title': 'Classifica della stagione {name}',
  'tvx.stage.gain': '+{n} stasera',
  'tvx.stage.new': 'nuovo',

  // Rivalità
  'tvx.rivals.emptyTitle': 'Ancora nessuna rivalità',
  'tvx.rivals.emptyText': 'Servono partite con un vincitore segnato giocate insieme.',
  'tvx.rivals.games': { one: '{n} partita insieme', other: '{n} partite insieme' },
  'tvx.rivals.tie': 'parità perfetta',
  'tvx.rivals.ahead': '{name} avanti',
  'tvx.rivals.line': '⚔️ Sfida nella sfida: {a} {aw}–{bw} {b}',

  // Figurine
  'tvx.cards.emptyTitle': 'Ancora nessuna figurina',
  'tvx.cards.emptyText': 'Ogni giocatore ottiene la sua carta dopo la prima serata salvata.',
  'tvx.cards.lead': 'Una figurina per ogni giocatore: la rarità cresce con il livello (Comune, Rara, Epica, Leggendaria). Sul telefono, in “Il mio profilo”, si condivide come immagine.',

  // Video riassunto
  'tvx.video.title': '🎬 Video della serata',
  'tvx.video.lead': 'Una storia verticale di circa 20 secondi con giochi, campioni, premi e foto: perfetta per il gruppo WhatsApp. La TV la registra adesso: lascia questa finestra aperta.',
  'tvx.video.make': 'Crea il video',
  'tvx.video.unsupported': 'Questo browser non sa registrare video: usa Chrome, Edge o Firefox su computer.',
  'tvx.video.recording': 'Registrazione in corso…',
  'tvx.video.info': '{secs} secondi · {mb} MB · formato {format}',
  'tvx.video.save': 'Scarica il video',
  'tvx.video.log': 'Video della serata creato',
  'tvx.video.fail': 'Non sono riuscito a registrare il video.',

  // Importazione CSV
  'tvx.csv.none': 'Nel file non ho trovato giochi: serve una colonna con il nome (objectname per BoardGameGeek, oppure "nome").',
  'tvx.csv.bgg': 'Collezione di BoardGameGeek',
  'tvx.csv.file': 'File CSV',
  'tvx.csv.confirm': '{src}: {n} giochi.\n\n• {fresh} nuovi da aggiungere all’armadio\n• {known} già presenti (completo solo i dati mancanti: giocatori, durata, anno)\n\nProcedo?',
  'tvx.csv.log': 'Armadio: importati {n} giochi da {src}'
};
