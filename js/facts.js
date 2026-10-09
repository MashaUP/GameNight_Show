// Curiosità per l'intervallo e il ticker: statistiche del gruppo, notizie della serata e trivia.
import { fmt, dbKey } from './util.js';
import { buildAllTime, records, groupLevel, pairsMap, onThisDay, lastPlayed, nightsByDate } from './stats.js';

const asArr = (x) => (Array.isArray(x) ? x : Object.values(x || {}));

/** Curiosità verificate sul mondo dei giochi da tavolo. */
export const TRIVIA = [
  'Il Monopoly nasce da The Landlord’s Game, brevettato da Elizabeth Magie nel 1904 per mostrare i danni dei monopoli.',
  'I Coloni di Catan è uscito nel 1995: l’ha inventato Klaus Teuber, un odontotecnico tedesco.',
  'Scrabble è stato inventato negli anni ’30 dall’architetto americano Alfred Mosher Butts; l’italiano Scarabeo ne riprende l’idea.',
  'Codenames di Vlaada Chvátil ha vinto lo Spiel des Jahres nel 2016.',
  'Dixit ha vinto lo Spiel des Jahres nel 2010; le sue carte sono illustrate da Marie Cardouat.',
  'Azul si ispira agli azulejos, le piastrelle decorate portoghesi, e ha vinto lo Spiel des Jahres 2018.',
  'Lo Spiel des Jahres, il premio tedesco “gioco dell’anno”, viene assegnato dal 1979.',
  'Il Senet, giocato nell’antico Egitto, è tra i giochi da tavolo più antichi conosciuti: circa 5000 anni.',
  'Il Gioco Reale di Ur, ritrovato in Mesopotamia, ha circa 4500 anni: alcune tavole sono al British Museum.',
  'Gli scacchi derivano dal chaturanga, nato in India intorno al VI secolo.',
  'Il Risiko discende da La Conquête du Monde (1957) di Albert Lamorisse, il regista del film Il palloncino rosso.',
  'Pandemic di Matt Leacock (2008) ha reso popolari i giochi cooperativi: si vince o si perde tutti insieme.',
  'Ticket to Ride di Alan R. Moon ha vinto lo Spiel des Jahres nel 2004.',
  'Carcassonne prende il nome dalla città fortificata francese e ha vinto lo Spiel des Jahres nel 2001.',
  'La parola “meeple” (my + people) è nata nel 2000, durante una partita a Carcassonne.',
  'Exploding Kittens nasce da una campagna Kickstarter del 2015 che ha raccolto quasi 9 milioni di dollari.',
  'Cluedo è stato ideato in Inghilterra da Anthony E. Pratt durante la Seconda guerra mondiale ed è uscito nel 1949.',
  'UNO è stato inventato nel 1971 da Merle Robbins, un barbiere dell’Ohio.',
  'Il Go si gioca su una griglia 19 × 19 ed è nato in Cina più di 2500 anni fa.',
  'BoardGameGeek, il più grande database di giochi da tavolo, è online dal 2000.',
  'In un dado a sei facce le facce opposte sommano sempre 7.',
  'Just One, il gioco degli indizi di una parola sola, ha vinto lo Spiel des Jahres 2019.',
  'Cascadia ha vinto lo Spiel des Jahres 2022.',
  'Kingdomino ha vinto lo Spiel des Jahres 2017.',
  'Wingspan di Elizabeth Hargrave, un gioco sugli uccelli, ha vinto il Kennerspiel des Jahres 2019.',
  'Il Kennerspiel des Jahres, il premio per i giochi più impegnativi, esiste dal 2011.',
  'Il numero di Shannon stima in circa 10^120 le partite possibili a scacchi: molte più degli atomi dell’universo osservabile.',
  'Magic: The Gathering, il primo gioco di carte collezionabili moderno, è uscito nel 1993.',
  'La fiera SPIEL di Essen, in Germania, è la più grande fiera di giochi da tavolo al mondo.',
  'Il Gioco dell’Oca era già diffuso nel Cinquecento: Francesco I de’ Medici ne regalò una copia a Filippo II di Spagna.',
  'Lupus in Tabula si ispira a Mafia, il gioco di ruoli nascosti nato a Mosca nel 1986.',
  'Il mazzo di carte napoletane ha 40 carte, divise in coppe, denari, spade e bastoni.'
];

function names(list) {
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

/** Curiosità sul gruppo, calcolate da tutte le serate salvate. */
export function groupFacts({ nights = {}, library = {}, next = null } = {}) {
  const out = [];
  const list = nightsByDate(nights);
  if (!list.length) return out;
  const people = {};
  const games = {};
  for (const n of list) {
    for (const [k, pp] of Object.entries(n.people || {})) {
      const p = people[k] ||= { name: pp.name, n: 0, sum: 0, nights: 0, seer: 0 };
      p.name = pp.name || p.name;
      p.n += pp.n || 0; p.sum += pp.sumGiven || 0; p.nights++; p.seer += pp.seer || 0;
    }
    for (const g of Object.values(n.games || {})) {
      const key = g.key || dbKey(g.name);
      const gg = games[key] ||= { name: g.name, per: {} };
      const winners = new Set(asArr(g.w));
      for (const k of asArr(g.pl)) {
        const e = gg.per[k] ||= { played: 0, won: 0 };
        e.played++;
        if (winners.has(k)) e.won++;
      }
    }
  }
  // Chi vince di più a quale gioco
  const rates = [];
  for (const g of Object.values(games)) {
    for (const [k, e] of Object.entries(g.per)) {
      if (e.played >= 3 && e.won / e.played >= 0.5 && people[k]) rates.push({ name: people[k].name, game: g.name, ...e, r: e.won / e.played });
    }
  }
  const seenPeople = new Set();
  rates.sort((a, b) => b.r - a.r || b.played - a.played).filter((x) => !seenPeople.has(x.name) && seenPeople.add(x.name)).slice(0, 4).forEach((x) => {
    out.push({ icon: '🏆', text: `Sapevi che ${x.name} vince il ${Math.round(x.r * 100)}% delle partite a ${x.game}? (${x.won} su ${x.played})` });
  });
  const at = buildAllTime(nights, library);
  const loved = at.games.find((g) => g.n >= 3);
  if (loved) out.push({ icon: '❤️', text: `Il gioco più amato del gruppo è ${loved.name}: media ${fmt(loved.avg)} su ${loved.n} voti.` });
  if (at.mostPlayed[0]) out.push({ icon: '🎲', text: `Il gioco più intavolato è ${at.mostPlayed[0].name}: ${at.mostPlayed[0].nights} ${at.mostPlayed[0].nights === 1 ? 'serata' : 'serate'}.` });
  if (at.wins[0]) out.push({ icon: '👑', text: `${at.wins[0].name} è il re delle vittorie del gruppo: ${at.wins[0].wins} ${at.wins[0].wins === 1 ? 'partita vinta' : 'partite vinte'}.` });
  if (at.mvp[0]) out.push({ icon: '⭐', text: `${at.mvp[0].name} è l’MVP di sempre, con ${at.mvp[0].votes} ${at.mvp[0].votes === 1 ? 'voto' : 'voti'} MVP.` });
  const voters = Object.values(people).filter((p) => p.n >= 8).map((p) => ({ ...p, avg: p.sum / p.n }));
  if (voters.length >= 3) {
    voters.sort((a, b) => a.avg - b.avg);
    out.push({ icon: '🧊', text: `${voters[0].name} è il giudice più severo: in media dà ${fmt(voters[0].avg)}.` });
    out.push({ icon: '💛', text: `${voters[voters.length - 1].name} è il più generoso: in media dà ${fmt(voters[voters.length - 1].avg)}.` });
  }
  const seer = Object.values(people).filter((p) => p.seer >= 2).sort((a, b) => b.seer - a.seer)[0];
  if (seer) out.push({ icon: '🧿', text: `${seer.name} è il veggente del gruppo: ${seer.seer} vincitori pronosticati.` });
  const pm = pairsMap(nights);
  if (pm.souls) out.push({ icon: '🤝', text: `${pm.souls.aName} e ${pm.souls.bName} sono anime ludiche: compatibilità ludica ${pm.souls.compat}%.` });
  if (pm.rivalry) out.push({ icon: '⚔️', text: `Rivalità storica: ${pm.rivalry.aName} contro ${pm.rivalry.bName}, ${pm.rivalry.aWins} a ${pm.rivalry.bWins} negli scontri diretti.` });
  for (const r of records(nights).slice(0, 3)) out.push({ icon: '📈', text: `Record del gruppo, ${r.title.toLowerCase()}: ${r.value}.` });
  const gl = groupLevel(nights);
  out.push({ icon: '🚀', text: `Il gruppo è al livello ${gl.level}: ${gl.nights} ${gl.nights === 1 ? 'serata' : 'serate'} e ${gl.games} ${gl.games === 1 ? 'partita' : 'partite'} insieme.` });
  const otd = onThisDay(nights);
  if (otd?.yearAgo) out.push({ icon: '📸', text: `Un anno fa giocavate a ${names(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3))}.` });
  if (otd?.anniversary) out.push({ icon: '🎂', text: `Oggi sono ${otd.anniversary.years} ${otd.anniversary.years === 1 ? 'anno' : 'anni'} dalla prima serata del gruppo!` });
  const played = lastPlayed(nights);
  const dusty = Object.values(library || {}).filter((it) => it?.name && played[dbKey(it.name)] >= 4).sort((a, b) => played[dbKey(b.name)] - played[dbKey(a.name)])[0];
  if (dusty) out.push({ icon: '🕰️', text: `${dusty.name} non esce dalla scatola da ${played[dbKey(dusty.name)]} serate: quando lo rigiochiamo?` });
  const never = Object.values(library || {}).filter((it) => it?.name && !(dbKey(it.name) in played));
  if (never.length) out.push({ icon: '📦', text: `Nell’armadio ${never.length === 1 ? 'c’è 1 gioco mai giocato' : `ci sono ${never.length} giochi mai giocati`}: ${names(never.slice(0, 3).map((it) => it.name))}${never.length > 3 ? '…' : '.'}` });
  if (next?.at) out.push({ icon: '📅', text: `Prossima serata: ${new Date(Number(next.at)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}${next.place ? `, ${next.place}` : ''}.` });
  return out;
}

/** Notizie della serata in corso, per il ticker. board: classifica di stasera. */
export function tonightNews({ board = [], players = {}, wins = {}, minutes = 0, seers = {} } = {}) {
  const out = [];
  const name = (uid) => players[uid]?.name;
  if (board[0]) out.push(board.length > 1 ? `${board[0].name} guida la classifica della serata con ${fmt(board[0].stats.avg)}` : `Primo gioco della serata: ${board[0].name}, media ${fmt(board[0].stats.avg)}`);
  if (board.length >= 3) out.push(`In fondo alla classifica, per ora: ${board[board.length - 1].name} (${fmt(board[board.length - 1].stats.avg)})`);
  const w = Object.entries(wins).filter(([uid]) => name(uid)).sort((a, b) => b[1] - a[1]);
  if (w[0] && w[0][1] >= 2) out.push(`${name(w[0][0])} ha già vinto ${w[0][1]} partite stasera`);
  const active = Object.entries(players).filter(([, p]) => p && !p.away);
  if (board.length >= 3) {
    const dry = active.filter(([uid]) => !wins[uid]).map(([, p]) => p.name);
    if (dry.length && dry.length <= 2) out.push(`${names(dry)} non ${dry.length === 1 ? 'ha' : 'hanno'} ancora vinto niente: tifate per ${dry.length === 1 ? 'lui… o lei' : 'loro'}!`);
  }
  if (board.length) out.push(`${board.length} ${board.length === 1 ? 'partita votata' : 'partite votate'}${minutes ? ` in ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`}` : ''}`);
  const top = board.reduce((b, r) => (r.stats.consensus !== null && r.stats.n >= 3 && (!b || r.stats.consensus < b.stats.consensus) ? r : b), null);
  if (top && top.stats.consensus < 60) out.push(`${top.name} divide il tavolo: consenso al ${top.stats.consensus}%`);
  const s = Object.entries(seers).filter(([uid]) => name(uid)).sort((a, b) => b[1] - a[1])[0];
  if (s) out.push(`${name(s[0])} ha indovinato ${s[1] === 1 ? 'un vincitore' : `${s[1]} vincitori`}: chiamatelo veggente`);
  return out;
}
