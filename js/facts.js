// Curiosità per l'intervallo e il ticker: statistiche del gruppo, notizie della serata e trivia.
import { fmt, dbKey } from './util.js';
import { buildAllTime, records, groupLevel, pairsMap, onThisDay, lastPlayed, nightsByDate } from './stats.js';
import { t, has, fmtList, fmtDate, locale } from './i18n.js';

const asArr = (x) => (Array.isArray(x) ? x : Object.values(x || {}));

/**
 * Curiosità verificate sul mondo dei giochi da tavolo: facts.trivia.1, .2, … nei dizionari (it-voice.js,
 * en-voice.js). L'elenco contiene tutte le chiavi presenti, in ordine, nella lingua scelta; è "vivo"
 * (stesso array, riempito di nuovo) se la lingua cambia senza ricaricare la pagina.
 */
export const TRIVIA = [];
function fillTrivia() {
  const list = [];
  for (let i = 1; has(`facts.trivia.${i}`); i++) list.push(t(`facts.trivia.${i}`));
  TRIVIA.splice(0, TRIVIA.length, ...list);
}
fillTrivia();
if (typeof window !== 'undefined') window.addEventListener?.('gnr-lang', fillTrivia);

const names = (list) => fmtList(list);

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
    out.push({ icon: '🏆', text: t('facts.group.winrate', { name: x.name, pct: Math.round(x.r * 100), game: x.game, won: x.won, played: x.played }) });
  });
  const at = buildAllTime(nights, library);
  const loved = at.games.find((g) => g.n >= 3);
  if (loved) out.push({ icon: '❤️', text: t('facts.group.loved', { game: loved.name, avg: fmt(loved.avg), n: loved.n }) });
  if (at.mostPlayed[0]) out.push({ icon: '🎲', text: t('facts.group.played', { game: at.mostPlayed[0].name, nights: t('facts.nights', { n: at.mostPlayed[0].nights }) }) });
  if (at.wins[0]) out.push({ icon: '👑', text: t('facts.group.king', { name: at.wins[0].name, n: at.wins[0].wins }) });
  if (at.mvp[0]) out.push({ icon: '⭐', text: t('facts.group.mvp', { name: at.mvp[0].name, n: at.mvp[0].votes }) });
  const voters = Object.values(people).filter((p) => p.n >= 8).map((p) => ({ ...p, avg: p.sum / p.n }));
  if (voters.length >= 3) {
    voters.sort((a, b) => a.avg - b.avg);
    out.push({ icon: '🧊', text: t('facts.group.strict', { name: voters[0].name, avg: fmt(voters[0].avg) }) });
    out.push({ icon: '💛', text: t('facts.group.generous', { name: voters[voters.length - 1].name, avg: fmt(voters[voters.length - 1].avg) }) });
  }
  const seer = Object.values(people).filter((p) => p.seer >= 2).sort((a, b) => b.seer - a.seer)[0];
  if (seer) out.push({ icon: '🧿', text: t('facts.group.seer', { name: seer.name, n: seer.seer }) });
  const pm = pairsMap(nights);
  if (pm.souls) out.push({ icon: '🤝', text: t('facts.group.souls', { a: pm.souls.aName, b: pm.souls.bName, pct: pm.souls.compat }) });
  if (pm.rivalry) out.push({ icon: '⚔️', text: t('facts.group.rivalry', { a: pm.rivalry.aName, b: pm.rivalry.bName, aw: pm.rivalry.aWins, bw: pm.rivalry.bWins }) });
  for (const r of records(nights).slice(0, 3)) out.push({ icon: '📈', text: t('facts.group.record', { title: String(r.title).toLocaleLowerCase(locale()), value: r.value }) });
  const gl = groupLevel(nights);
  out.push({ icon: '🚀', text: t('facts.group.level', { level: gl.level, nights: t('facts.nights', { n: gl.nights }), games: t('facts.games', { n: gl.games }) }) });
  const otd = onThisDay(nights);
  if (otd?.yearAgo) out.push({ icon: '📸', text: t('facts.group.yearAgo', { games: names(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3)) }) });
  if (otd?.anniversary) out.push({ icon: '🎂', text: t('facts.group.anniversary', { n: otd.anniversary.years }) });
  const played = lastPlayed(nights);
  const dusty = Object.values(library || {}).filter((it) => it?.name && played[dbKey(it.name)] >= 4).sort((a, b) => played[dbKey(b.name)] - played[dbKey(a.name)])[0];
  if (dusty) out.push({ icon: '🕰️', text: t('facts.group.dusty', { game: dusty.name, n: played[dbKey(dusty.name)] }) });
  const never = Object.values(library || {}).filter((it) => it?.name && !(dbKey(it.name) in played));
  if (never.length) out.push({ icon: '📦', text: t('facts.group.never', { n: never.length, games: names(never.slice(0, 3).map((it) => it.name)), end: never.length > 3 ? '…' : '.' }) });
  if (next?.at) {
    const date = fmtDate(Number(next.at), { weekday: 'long', day: 'numeric', month: 'long' });
    out.push({ icon: '📅', text: next.place ? t('facts.group.nextAt', { date, place: next.place }) : t('facts.group.next', { date }) });
  }
  return out;
}

/** Notizie della serata in corso, per il ticker. board: classifica di stasera. */
export function tonightNews({ board = [], players = {}, wins = {}, minutes = 0, seers = {} } = {}) {
  const out = [];
  const name = (uid) => players[uid]?.name;
  if (board[0]) out.push(t(board.length > 1 ? 'facts.news.lead' : 'facts.news.first', { game: board[0].name, avg: fmt(board[0].stats.avg) }));
  if (board.length >= 3) out.push(t('facts.news.last', { game: board[board.length - 1].name, avg: fmt(board[board.length - 1].stats.avg) }));
  const w = Object.entries(wins).filter(([uid]) => name(uid)).sort((a, b) => b[1] - a[1]);
  if (w[0] && w[0][1] >= 2) out.push(t('facts.news.wins', { name: name(w[0][0]), n: w[0][1] }));
  const active = Object.entries(players).filter(([, p]) => p && !p.away);
  if (board.length >= 3) {
    const dry = active.filter(([uid]) => !wins[uid]).map(([, p]) => p.name);
    if (dry.length && dry.length <= 2) out.push(t('facts.news.dry', { n: dry.length, names: names(dry) }));
  }
  if (board.length) {
    const voted = t('facts.news.voted', { n: board.length });
    const time = minutes >= 60 ? t('facts.news.hm', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('facts.news.min', { n: minutes });
    out.push(minutes ? t('facts.news.votedIn', { voted, time }) : voted);
  }
  const top = board.reduce((b, r) => (r.stats.consensus !== null && r.stats.n >= 3 && (!b || r.stats.consensus < b.stats.consensus) ? r : b), null);
  if (top && top.stats.consensus < 60) out.push(t('facts.news.split', { game: top.name, pct: top.stats.consensus }));
  const s = Object.entries(seers).filter(([uid]) => name(uid)).sort((a, b) => b[1] - a[1])[0];
  if (s) out.push(t('facts.news.seer', { name: name(s[0]), n: s[1] }));
  return out;
}
