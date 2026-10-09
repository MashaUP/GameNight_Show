// Calcolo di medie, classifica e premi finali.
import { fmt, dbKey } from './util.js';

export const CRITERIA = [
  { key: 'coinv', label: 'Coinvolgimento', short: 'Coinv.', hint: '1 = aspettavo il turno, 5 = sempre dentro', color: '#2EC4B6' },
  { key: 'sempl', label: 'Semplicità', short: 'Sempl.', hint: '1 = regole complicate, 5 = si capisce subito', color: '#FFC93C' },
  { key: 'rigioc', label: 'Rigiocabilità', short: 'Rigioc.', hint: '1 = una volta basta, 5 = subito un’altra', color: '#FF8FB1' }
];

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Statistiche di un singolo gioco a partire dai voti { uid: voto }. */
/** Domande attive nella serata: i tre criteri (disattivabili) più fino a due domande personalizzate. */
export function activeCriteria(voting) {
  const v = voting || {};
  const base = CRITERIA.filter((c) => v[c.key] !== false);
  const custom = (Array.isArray(v.custom) ? v.custom : Object.values(v.custom || {}))
    .filter((q) => q && String(q.label || '').trim()).slice(0, 2)
    .map((q, i) => ({ key: `c${i + 1}`, label: String(q.label).trim().slice(0, 40), short: String(q.label).trim().slice(0, 9), hint: '1 = per niente, 5 = moltissimo', color: i ? '#4D96FF' : '#C77DFF', custom: true }));
  return [...base, ...custom];
}
const ALL_CRIT_KEYS = ['coinv', 'sempl', 'rigioc', 'c1', 'c2'];

/**
 * Statistiche di un gioco. Se è indicato chi ha giocato, la media è solo dei giocatori
 * e i voti degli altri diventano il "voto del pubblico".
 */
export function gameStats(votes, playing = null) {
  const all = Object.entries(votes || {})
    .map(([uid, v]) => ({ uid, ...v }))
    .filter((v) => typeof v.overall === 'number');
  const hasPlayers = playing && typeof playing === 'object' && Object.keys(playing).length > 0;
  const list = hasPlayers ? all.filter((v) => playing[v.uid]) : all;
  const audienceList = hasPlayers ? all.filter((v) => !playing[v.uid]) : [];
  const n = list.length;
  const overall = list.map((v) => v.overall);
  const avg = mean(overall);
  const std = n ? Math.sqrt(mean(overall.map((x) => (x - avg) ** 2))) : null;

  const crit = {};
  for (const k of ALL_CRIT_KEYS) {
    crit[k] = mean(list.map((v) => v[k]).filter((x) => typeof x === 'number'));
  }

  const tally = {};
  for (const v of all) {
    if (v.mvp) tally[v.mvp] = (tally[v.mvp] || 0) + 1;
  }
  const top = Math.max(0, ...Object.values(tally));
  const winners = top > 0 ? Object.keys(tally).filter((uid) => tally[uid] === top) : [];

  // Indovina la media: chi ci è andato più vicino
  const guesses = all.filter((v) => typeof v.guess === 'number');
  let oracle = null;
  if (guesses.length && avg !== null) {
    const errs = guesses.map((v) => ({ uid: v.uid, guess: v.guess, err: Math.abs(v.guess - avg) }));
    const best = Math.min(...errs.map((e) => e.err));
    oracle = { err: best, winners: errs.filter((e) => Math.abs(e.err - best) < 1e-9) };
  }

  return {
    n, list, avg, std,
    min: n ? Math.min(...overall) : null,
    max: n ? Math.max(...overall) : null,
    crit,
    mvp: { tally, top, winners },
    oracle,
    // Consenso: 100% = tutti d'accordo, 0% = voti agli estremi
    consensus: n >= 2 ? Math.max(0, Math.round(100 - (std / 4.5) * 100)) : null,
    audience: { n: audienceList.length, avg: mean(audienceList.map((v) => v.overall)), list: audienceList }
  };
}

/** Commento automatico mostrato al reveal. */
export function verdict(st) {
  if (!st || !st.n) return 'Nessun voto';
  if (st.n > 1 && st.std === 0) return 'Tutti d’accordo!';
  if (st.n > 2 && st.std >= 2.2) return 'Gioco divisivo!';
  const a = st.avg;
  if (a >= 9) return 'Capolavoro della serata!';
  if (a >= 8) return 'Promosso a pieni voti!';
  if (a >= 7) return 'Bella partita!';
  if (a >= 6) return 'Promosso, senza lode';
  if (a >= 5) return 'Così così…';
  return 'Bocciato!';
}

/** Classifica dei giochi già svelati, dal migliore al peggiore. */
export function buildBoard(games, votes) {
  const rows = Object.entries(games || {})
    .filter(([, g]) => g && g.status === 'revealed')
    .map(([id, g]) => ({ id, ...g, stats: gameStats(votes?.[id], g.players) }))
    .filter((r) => r.stats.n > 0)
    .sort((a, b) =>
      b.stats.avg - a.stats.avg ||
      (b.stats.crit.rigioc ?? 0) - (a.stats.crit.rigioc ?? 0) ||
      (a.order || 0) - (b.order || 0));

  // Posizioni a pari merito quando la media (arrotondata) è identica.
  let prevAvg = null;
  let prevRank = 0;
  rows.forEach((r, i) => {
    const key = Math.round(r.stats.avg * 100);
    r.rank = key === prevAvg ? prevRank : i + 1;
    prevAvg = key;
    prevRank = r.rank;
  });
  return rows;
}

function bestBy(rows, getValue, minN = 1) {
  let best = null;
  for (const r of rows) {
    const v = getValue(r);
    if (v === null || v === undefined || r.stats.n < minN) continue;
    if (!best || v > best.value) best = { row: r, value: v };
  }
  return best;
}

/** Premi speciali di fine serata. */
export function buildAwards(board, votes, players) {
  const awards = [];
  if (!board.length) return awards;

  const coinv = bestBy(board, (r) => r.stats.crit.coinv);
  if (coinv) awards.push({ key: 'coinv', kind: 'game', title: 'Il più coinvolgente', game: coinv.row, value: `${fmt(coinv.value)} / 5 di coinvolgimento`, color: '#2EC4B6' });

  const sempl = bestBy(board, (r) => r.stats.crit.sempl);
  if (sempl) awards.push({ key: 'sempl', kind: 'game', title: 'Il più semplice', game: sempl.row, value: `${fmt(sempl.value)} / 5 di semplicità`, color: '#FFC93C' });

  const rigioc = bestBy(board, (r) => r.stats.crit.rigioc);
  if (rigioc) awards.push({ key: 'rigioc', kind: 'game', title: 'Il più richiesto', game: rigioc.row, value: `${fmt(rigioc.value)} / 5 di rigiocabilità`, color: '#FF8FB1' });

  const div = bestBy(board, (r) => (r.stats.std > 0 ? r.stats.std : null), 2);
  if (div) awards.push({ key: 'div', kind: 'game', title: 'Il più divisivo', game: div.row, value: `Voti da ${div.row.stats.min} a ${div.row.stats.max}`, color: '#7B5CFA' });

  // MVP della serata: somma dei voti MVP ricevuti in tutti i giochi svelati.
  const total = {};
  for (const r of board) {
    for (const [uid, c] of Object.entries(r.stats.mvp.tally)) {
      total[uid] = (total[uid] || 0) + c;
    }
  }
  const top = Math.max(0, ...Object.values(total));
  if (top > 0) {
    const uids = Object.keys(total).filter((uid) => total[uid] === top);
    const people = uids.map((uid) => ({ uid, ...(players?.[uid] || { name: 'Ex giocatore' }) }));
    awards.push({ key: 'mvp', kind: 'player', title: 'MVP della serata', players: people, value: `${top} ${top === 1 ? 'voto' : 'voti'} MVP`, color: '#FF5A4E' });
  }
  // Il più vincente: chi ha vinto più partite (le vittorie le segna la TV).
  const wins = winsByPlayer(board);
  const topWins = Math.max(0, ...Object.values(wins));
  if (topWins > 0) {
    const uids = Object.keys(wins).filter((uid) => wins[uid] === topWins);
    awards.push({ key: 'wins', kind: 'player', title: 'Il più vincente', players: uids.map((uid) => ({ uid, ...(players?.[uid] || { name: 'Ex giocatore' }) })), value: `${topWins} ${topWins === 1 ? 'vittoria' : 'vittorie'}`, color: '#FFC93C' });
  }
  // Il veggente: chi ha indovinato più vincitori con i pronostici
  const seers = seersByPlayer(board);
  const topSeer = Math.max(0, ...Object.values(seers));
  if (topSeer > 0) {
    const uids = Object.keys(seers).filter((uid) => seers[uid] === topSeer).slice(0, 3);
    awards.push({ key: 'seer', kind: 'player', title: 'Il veggente', players: uids.map((uid) => ({ uid, ...(players?.[uid] || { name: 'Ex giocatore' }) })), value: `${topSeer} ${topSeer === 1 ? 'pronostico azzeccato' : 'pronostici azzeccati'}`, color: '#C77DFF' });
  }
  awards.push(...playerAwards(board, players));
  return awards;
}

/** Pronostici azzeccati per giocatore nei giochi svelati. */
export function seersByPlayer(board) {
  const out = {};
  for (const r of board) {
    for (const [uid, target] of Object.entries(r.bets || {})) if (r.winners?.[target]) out[uid] = (out[uid] || 0) + 1;
  }
  return out;
}

/** Esito dei pronostici di una partita: chi ha indovinato e quanti hanno puntato. */
export function betResults(game) {
  const bets = Object.entries(game?.bets || {});
  return { total: bets.length, hits: bets.filter(([, t]) => game?.winners?.[t]).map(([uid]) => uid), bets: Object.fromEntries(bets) };
}

/**
 * Campioni della serata: punti ai giocatori (non ai giochi).
 * Vittoria 3 punti, ogni voto MVP ricevuto 1, pronostico azzeccato 1, media indovinata 1.
 * Restituisce la classifica con posizioni a pari merito.
 */
export function nightChampions(board) {
  const pts = {};
  const add = (uid, k, n = 1) => {
    if (!uid) return;
    const p = (pts[uid] ||= { uid, points: 0, wins: 0, mvp: 0, seer: 0, oracle: 0 });
    p[k] += n;
    p.points += k === 'wins' ? 3 * n : n;
  };
  for (const r of board) {
    for (const uid of Object.keys(r.winners || {})) add(uid, 'wins');
    for (const [uid, n] of Object.entries(r.stats?.mvp?.tally || {})) add(uid, 'mvp', n);
    for (const [uid, target] of Object.entries(r.bets || {})) if (r.winners?.[target]) add(uid, 'seer');
    for (const w of r.stats?.oracle?.winners || []) add(w.uid, 'oracle');
  }
  const list = Object.values(pts).filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.mvp - a.mvp);
  let prev = null;
  let prevRank = 0;
  list.forEach((p, i) => {
    const key = `${p.points}|${p.wins}|${p.mvp}`;
    p.rank = key === prev ? prevRank : i + 1;
    prev = key;
    prevRank = p.rank;
  });
  return list;
}

/** Vittorie per giocatore nei giochi svelati. */
export function winsByPlayer(board) {
  const wins = {};
  for (const r of board) {
    for (const uid of Object.keys(r.winners || {})) wins[uid] = (wins[uid] || 0) + 1;
  }
  return wins;
}

/** Testo sulla posizione in classifica, per il reveal. */
export function rankLine(board, gameId) {
  const row = board.find((r) => r.id === gameId);
  if (!row) return '';
  if (board.length === 1) return 'Il primo gioco della serata';
  if (row.rank === 1) return `Primo in classifica su ${board.length} giochi!`;
  return `${row.rank}° in classifica su ${board.length} giochi`;
}

/** Esporta la classifica in CSV (separatore ; per Excel in italiano). */
export function boardCSV(board, players) {
  const head = ['Posizione', 'Gioco', 'Media', 'Coinvolgimento', 'Semplicità', 'Rigiocabilità', 'Voti', 'MVP', 'Vincitori'];
  const lines = [head.join(';')];
  for (const r of board) {
    const mvp = r.stats.mvp.winners.map((uid) => players?.[uid]?.name || 'Ex giocatore').join(' / ');
    const won = Object.keys(r.winners || {}).map((uid) => players?.[uid]?.name || 'Ex giocatore').join(' / ');
    lines.push([
      r.rank,
      `"${String(r.name).replace(/"/g, '""')}"`,
      fmt(r.stats.avg, 2),
      fmt(r.stats.crit.coinv, 2),
      fmt(r.stats.crit.sempl, 2),
      fmt(r.stats.crit.rigioc, 2),
      r.stats.n,
      `"${mvp.replace(/"/g, '""')}"`,
      `"${won.replace(/"/g, '""')}"`
    ].join(';'));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// Premi ai giocatori
// ---------------------------------------------------------------------------

const PLAYER_AWARD_COLORS = { generous: '#8AC926', critic: '#4D96FF', rebel: '#FF924C', twins: '#C77DFF' };

/**
 * Premi basati su come ha votato ciascuno: il più generoso, il critico,
 * il bastian contrario e le anime gemelle. Servono almeno 2 giocatori.
 */
export function playerAwards(board, players) {
  const out = [];
  const byUid = {};
  for (const r of board) {
    for (const v of r.stats.list) {
      (byUid[v.uid] ||= {})[r.id] = { v: v.overall, avg: r.stats.avg, n: r.stats.n };
    }
  }
  const minGames = board.length >= 2 ? 2 : 1;
  const people = Object.entries(byUid)
    .filter(([, games]) => Object.keys(games).length >= minGames)
    .map(([uid, games]) => ({ uid, games, list: Object.values(games) }));
  if (people.length < 2) return out;
  const who = (uids) => uids.map((uid) => ({ uid, ...(players?.[uid] || { name: 'Ex giocatore' }) }));
  const pick = (arr, better) => {
    let best = null;
    for (const x of arr) if (x.value !== null && (!best || better(x.value, best[0].value))) best = [x];
    else if (best && x.value !== null && Math.abs(x.value - best[0].value) < 1e-9) best.push(x);
    return best || [];
  };

  // Media dei voti dati
  const given = people.map((p) => ({ uid: p.uid, value: mean(p.list.map((g) => g.v)) }));
  const hi = pick(given, (a, b) => a > b);
  const lo = pick(given, (a, b) => a < b);
  if (hi.length && lo.length && hi[0].value - lo[0].value >= 0.3) {
    out.push({ key: 'generous', kind: 'player', title: 'Il più generoso', players: who(hi.map((x) => x.uid)), value: `Media dei voti dati: ${fmt(hi[0].value)}`, color: PLAYER_AWARD_COLORS.generous });
    out.push({ key: 'critic', kind: 'player', title: 'Il critico', players: who(lo.map((x) => x.uid)), value: `Media dei voti dati: ${fmt(lo[0].value)}`, color: PLAYER_AWARD_COLORS.critic });
  }

  // Distanza media dal resto del gruppo (solo giochi votati da almeno 3 persone)
  const rebels = people.map((p) => {
    const ds = p.list.filter((g) => g.n >= 3).map((g) => Math.abs(g.v - (g.avg * g.n - g.v) / (g.n - 1)));
    return { uid: p.uid, value: ds.length ? mean(ds) : null };
  });
  const rebel = pick(rebels, (a, b) => a > b);
  if (rebel.length && rebel[0].value >= 1) {
    out.push({ key: 'rebel', kind: 'player', title: 'Il bastian contrario', players: who(rebel.map((x) => x.uid)), value: `In media a ${fmt(rebel[0].value)} punti dagli altri`, color: PLAYER_AWARD_COLORS.rebel });
  }

  // L'oracolo: chi indovina meglio la media dei giochi
  const guessMin = board.length >= 2 ? 2 : 1;
  const oracles = Object.keys(byUid).map((uid) => {
    const errs = board.map((r) => r.stats.list.find((v) => v.uid === uid && typeof v.guess === 'number'))
      .map((v, i) => (v ? Math.abs(v.guess - board[i].stats.avg) : null))
      .filter((x) => x !== null);
    return { uid, value: errs.length >= guessMin ? mean(errs) : null };
  });
  const oracle = pick(oracles, (a, b) => a < b);
  if (oracle.length) {
    out.push({ key: 'oracle', kind: 'player', title: 'L’oracolo', players: who(oracle.map((x) => x.uid)), value: oracle[0].value < 0.05 ? 'Ha indovinato le medie al decimo!' : `In media sbaglia la media di ${fmt(oracle[0].value)}`, color: '#00B4D8' });
  }

  // Coppia con i voti più simili
  let twins = null;
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i], b = people[j];
      const common = Object.keys(a.games).filter((id) => b.games[id]);
      if (common.length < minGames) continue;
      const d = mean(common.map((id) => Math.abs(a.games[id].v - b.games[id].v)));
      if (!twins || d < twins.d || (d === twins.d && common.length > twins.c)) twins = { uids: [a.uid, b.uid], d, c: common.length };
    }
  }
  if (twins) {
    out.push({ key: 'twins', kind: 'player', title: 'Anime gemelle', players: who(twins.uids), value: twins.d === 0 ? 'Sempre lo stesso voto!' : `In media a ${fmt(twins.d)} punti di distanza`, color: PLAYER_AWARD_COLORS.twins });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classifica di sempre
// ---------------------------------------------------------------------------

/** Chiave stabile di una persona: il profilo se c'è, altrimenti il nome. */
export function personKey(player) {
  if (player?.memberId) return `m_${player.memberId}`;
  return dbKey(player?.name || '');
}

/** Riassunto della serata da salvare nel gruppo (somme, così si possono unire più serate). */
export function nightSummary(board, players, meta, awards = []) {
  const quotes = [];
  let end = 0;
  const games = {};
  const voters = new Set();
  const people = {};
  const person = (uid) => {
    const p = players?.[uid];
    if (!p?.name) return null;
    const k = personKey(p);
    return people[k] ||= { name: p.name, memberId: p.memberId || null, n: 0, sumGiven: 0, wins: 0, mvp: 0, given: {}, games: 0, played: {}, with: {}, oracle: 0, rebel: 0, nightWins: 0, seer: 0, bets: 0 };
  };
  for (const r of board) {
    const sum = (k) => r.stats.list.reduce((a, v) => a + (typeof v[k] === 'number' ? v[k] : 0), 0);
    const gk = dbKey(r.name);
    games[r.id] = {
      name: r.name,
      key: gk,
      n: r.stats.n,
      nCrit: r.stats.list.filter((v) => typeof v.coinv === 'number').length,
      nC: r.stats.list.filter((v) => typeof v.coinv === 'number').length,
      nS: r.stats.list.filter((v) => typeof v.sempl === 'number').length,
      nR: r.stats.list.filter((v) => typeof v.rigioc === 'number').length,
      playedMin: Number(r.playedMin) || null,
      sum: sum('overall'),
      sumC: sum('coinv'),
      sumS: sum('sempl'),
      sumR: sum('rigioc'),
      order: r.order || 0,
      cons: r.stats.consensus,
      v: {}, pl: [], w: []
    };
    const gEntry = games[r.id];
    for (const v of r.stats.list) {
      const p = players?.[v.uid];
      if (p?.name) gEntry.v[personKey(p)] = v.overall;
      if (v.comment && p?.name && quotes.length < 30) quotes.push({ name: p.name, game: r.name, text: String(v.comment).slice(0, 80) });
    }
    for (const uid of Object.keys(r.winners || {})) if (players?.[uid]?.name) gEntry.w.push(personKey(players[uid]));
    if (Number(r.revealedAt) > end) end = Number(r.revealedAt);
    for (const v of r.stats.list) {
      voters.add(v.uid);
      const pp = person(v.uid);
      if (!pp) continue;
      pp.n++;
      pp.sumGiven += v.overall;
      pp.given[gk] = v.overall;
    }
    for (const [uid, c] of Object.entries(r.stats.mvp.tally)) {
      const pp = person(uid);
      if (pp) pp.mvp += c;
    }
    for (const uid of Object.keys(r.winners || {})) {
      const pp = person(uid);
      if (pp) { pp.wins++; pp.nightWins++; }
    }
    // Chi ha giocato (se non indicato: chi ha votato), con chi, e a cosa
    const playing = r.players && Object.keys(r.players).length ? Object.keys(r.players) : r.stats.list.map((v) => v.uid);
    const keys = playing.map((uid) => (players?.[uid]?.name ? personKey(players[uid]) : null)).filter(Boolean);
    gEntry.pl = keys;
    for (const uid of playing) {
      const pp = person(uid);
      if (!pp) continue;
      pp.games++;
      pp.played[gk] = true;
      const me = personKey(players[uid]);
      for (const k of keys) if (k !== me) pp.with[k] = true;
    }
    for (const w of r.stats.oracle?.winners || []) { const pp = person(w.uid); if (pp) pp.oracle++; }
    // Pronostici sul vincitore
    for (const [uid, target] of Object.entries(r.bets || {})) {
      const pp = person(uid);
      if (!pp) continue;
      pp.bets++;
      if (r.winners?.[target]) pp.seer++;
    }
    if (r.stats.n >= 3) {
      const far = Math.max(...r.stats.list.map((v) => Math.abs(v.overall - r.stats.avg)));
      if (far >= 2) r.stats.list.filter((v) => Math.abs(Math.abs(v.overall - r.stats.avg) - far) < 1e-9).forEach((v) => { const pp = person(v.uid); if (pp) pp.rebel++; });
    }
  }
  const mvp = {};
  const wins = {};
  for (const [k, pp] of Object.entries(people)) {
    if (pp.mvp) mvp[k] = { name: pp.name, votes: pp.mvp };
    if (pp.wins) wins[k] = { name: pp.name, wins: pp.wins };
  }
  // Titoli guadagnati stasera (diventano i "trofei" della serata successiva)
  const titles = {};
  for (const a of awards) {
    for (const pl of a.players || []) {
      const p = players?.[pl.uid];
      if (!p?.name) continue;
      (titles[personKey(p)] ||= []).push(a.title);
    }
  }
  const at = Number(meta?.createdAt) || Date.now();
  const duration = end > at ? Math.round((end - at) / 60000) : null;
  const names = Object.values(people).map((pp) => pp.name);
  return { at, end: end || null, duration, voters: voters.size, names, games, mvp, wins, people, titles, quotes };
}

/** Statistiche personali di una persona su tutte le serate del gruppo. */
export function personalStats(nights, key) {
  const out = { nights: 0, votes: 0, sumGiven: 0, wins: 0, mvp: 0, byGame: {} };
  for (const night of Object.values(nights || {})) {
    const pp = night?.people?.[key];
    if (!pp) continue;
    out.nights++;
    out.votes += pp.n || 0;
    out.sumGiven += pp.sumGiven || 0;
    out.wins += pp.wins || 0;
    out.mvp += pp.mvp || 0;
    for (const [gk, vote] of Object.entries(pp.given || {})) {
      const name = Object.values(night.games || {}).find((g) => g.key === gk)?.name || gk;
      const a = out.byGame[gk] ||= { name, sum: 0, n: 0 };
      a.sum += vote; a.n++; a.name = name;
    }
  }
  out.avgGiven = out.votes ? out.sumGiven / out.votes : null;
  const games = Object.values(out.byGame).map((g) => ({ ...g, avg: g.sum / g.n })).sort((a, b) => b.avg - a.avg || b.n - a.n);
  out.favorite = games[0] || null;
  out.leastFavorite = games.length > 1 ? games[games.length - 1] : null;
  out.gamesVoted = games.length;
  return out;
}

/** Unisce tutte le serate salvate del gruppo. */
export function buildAllTime(nights, library) {
  const games = {};
  const mvp = {};
  const wins = {};
  let count = 0;
  for (const night of Object.values(nights || {})) {
    if (!night || !night.games) continue;
    count++;
    const at = Number(night.at) || 0;
    for (const g of Object.values(night.games)) {
      if (!g || !g.n) continue;
      const k = g.key || dbKey(g.name);
      const a = games[k] ||= { key: k, name: g.name, n: 0, nCrit: 0, sum: 0, sumC: 0, sumS: 0, sumR: 0, nights: 0, last: -1 };
      a.n += g.n; a.sum += g.sum; a.sumC += g.sumC || 0; a.sumS += g.sumS || 0; a.sumR += g.sumR || 0;
      a.nCrit += typeof g.nCrit === 'number' ? g.nCrit : g.n;
      a.nC = (a.nC || 0) + (g.nC ?? g.nCrit ?? g.n); a.nS = (a.nS || 0) + (g.nS ?? g.nCrit ?? g.n); a.nR = (a.nR || 0) + (g.nR ?? g.nCrit ?? g.n);
      a.nights++;
      if (at >= a.last) { a.name = g.name; a.last = at; }
    }
    for (const [k, m] of Object.entries(night.mvp || {})) {
      if (!m || !m.name) continue;
      const a = mvp[k] ||= { key: k, name: m.name, votes: 0, nights: 0 };
      a.votes += m.votes || 0;
      a.nights++;
      a.name = m.name;
    }
    for (const [k, w] of Object.entries(night.wins || {})) {
      if (!w || !w.name) continue;
      const a = wins[k] ||= { key: k, name: w.name, wins: 0 };
      a.wins += w.wins || 0;
      a.name = w.name;
    }
  }
  const imageByKey = {};
  for (const item of Object.values(library || {})) {
    if (item?.name && item.image) imageByKey[dbKey(item.name)] = item.image;
  }
  const rows = Object.values(games)
    .map((g) => ({
      ...g,
      avg: g.sum / g.n,
      crit: { coinv: g.nC ? g.sumC / g.nC : null, sempl: g.nS ? g.sumS / g.nS : null, rigioc: g.nR ? g.sumR / g.nR : null },
      image: imageByKey[g.key] || null
    }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n || String(a.name).localeCompare(b.name));
  let prev = null, prevRank = 0;
  rows.forEach((r, i) => {
    const key = Math.round(r.avg * 100);
    r.rank = key === prev ? prevRank : i + 1;
    prev = key; prevRank = r.rank;
  });
  const mvpRows = Object.values(mvp).filter((m) => m.votes > 0).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const mostPlayed = [...rows].sort((a, b) => b.nights - a.nights || b.n - a.n).filter((r) => r.nights > 1);
  const winRows = Object.values(wins).filter((w) => w.wins > 0).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  return { nights: count, games: rows, mvp: mvpRows, mostPlayed, wins: winRows };
}


// ---------------------------------------------------------------------------
// Trofei, affinità e giochi da rispolverare
// ---------------------------------------------------------------------------

const toArray = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

/** Serate salvate dalla più recente, esclusa (se indicata) quella in corso. */
export function nightsByDate(nights, exclude = null) {
  return Object.entries(nights || {})
    .filter(([k, n]) => k !== exclude && n && n.games)
    .map(([k, n]) => ({ room: k, ...n }))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

/**
 * Trofei da mostrare sul personaggio: corona all'MVP della serata precedente,
 * stella all'MVP di sempre, titolo vinto la volta scorsa (es. "Il critico").
 */
export function trophies(nights, exclude = null) {
  const list = nightsByDate(nights, exclude);
  const out = {};
  const get = (k) => (out[k] ||= { crown: false, star: false, title: null });
  const last = list[0];
  if (last) {
    const mv = Object.entries(last.mvp || {});
    const top = Math.max(0, ...mv.map(([, m]) => Number(m?.votes) || 0));
    if (top > 0) mv.filter(([, m]) => Number(m?.votes) === top).forEach(([k]) => { get(k).crown = true; });
    for (const [k, t] of Object.entries(last.titles || {})) {
      const title = toArray(t).find((x) => x !== 'MVP della serata');
      if (title) get(k).title = title;
    }
  }
  if (list.length >= 2) {
    const all = buildAllTime(Object.fromEntries(list.map((n) => [n.room, n])), {});
    if (all.mvp[0]) get(all.mvp[0].key).star = true;
  }
  return out;
}

/** Affinità tra amici: quanto si somigliano i voti sugli stessi giochi (tutte le serate). */
export function affinities(nights) {
  const people = {};
  for (const n of nightsByDate(nights)) {
    for (const [k, pp] of Object.entries(n.people || {})) {
      const p = people[k] ||= { key: k, name: pp.name, games: {} };
      p.name = p.name || pp.name;
      for (const [gk, v] of Object.entries(pp.given || {})) (p.games[gk] ||= []).push(Number(v));
    }
  }
  const list = Object.values(people).map((p) => ({ ...p, avg: Object.fromEntries(Object.entries(p.games).map(([g, vs]) => [g, mean(vs)])) }));
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const common = Object.keys(a.avg).filter((g) => g in b.avg);
      if (common.length < 2) continue;
      pairs.push({ a: { key: a.key, name: a.name }, b: { key: b.key, name: b.name }, diff: mean(common.map((g) => Math.abs(a.avg[g] - b.avg[g]))), common: common.length });
    }
  }
  pairs.sort((x, y) => x.diff - y.diff || y.common - x.common);
  return pairs;
}

/** Da quante serate non si gioca a ogni gioco (0 = l'ultima serata). */
export function lastPlayed(nights) {
  const out = {};
  nightsByDate(nights).forEach((n, i) => {
    for (const g of Object.values(n.games || {})) {
      const k = g.key || dbKey(g.name);
      if (!(k in out)) out[k] = i;
    }
  });
  return out;
}

/** Testo breve per un gioco dell’armadio: "Mai giocato" o "Non lo giocate da 3 serate". */
export function freshnessLabel(item, played) {
  const k = dbKey(item?.name || '');
  if (!(k in played)) return 'Mai giocato insieme';
  const n = played[k];
  return n >= 2 ? `Non lo giocate da ${n} serate` : '';
}


// ---------------------------------------------------------------------------
// Cosa giochiamo stasera? Raccomandazioni per i presenti
// ---------------------------------------------------------------------------

export function durationOf(item) {
  if (Number(item?.playedCount) && Number(item?.playedTotal)) return Math.round(item.playedTotal / item.playedCount);
  return Number(item?.duration) || null;
}

/**
 * Punteggio 1-99 per ogni gioco dell’armadio, pensato per chi è presente adesso.
 * present: [{ key, name }] (chiavi persona), maxMinutes: null = senza limiti.
 */
export function recommend({ library, nights, present, playedTonight = new Set(), maxMinutes = null }) {
  const n = present.length;
  const played = lastPlayed(nights);
  const tastes = {};
  for (const night of Object.values(nights || {})) {
    for (const [k, pp] of Object.entries(night?.people || {})) {
      for (const [gk, v] of Object.entries(pp.given || {})) ((tastes[gk] ||= {})[k] ||= []).push(Number(v));
    }
  }
  const out = [];
  for (const [id, it] of Object.entries(library || {})) {
    if (!it?.name || !isAvailable(it)) continue;
    const gk = dbKey(it.name);
    if (playedTonight.has(gk)) continue;
    const min = Number(it.minPlayers) || 0, max = Number(it.maxPlayers) || 0;
    if ((min && n < min) || (max && n > max)) continue;
    const dur = durationOf(it);
    if (maxMinutes && dur && dur > maxMinutes) continue;
    const reasons = [];
    const t = tastes[gk] || {};
    const likes = present.map((p) => (t[p.key] ? mean(t[p.key]) : null));
    const known = likes.filter((x) => x !== null);
    const fans = present.filter((p, i) => likes[i] !== null && likes[i] >= 7).length;
    const haters = present.filter((p, i) => likes[i] !== null && likes[i] <= 4);
    let score; let kind;
    if (known.length) {
      score = mean(known) * 10;
      kind = 'top';
      reasons.push(`piace a ${fans} su ${n} presenti`);
    } else if (gk in played) {
      const all = Object.values(t).flat();
      score = all.length ? mean(all) * 10 - 5 : 60;
      kind = 'top';
      reasons.push('i presenti non l’hanno ancora votato');
    } else {
      score = 70;
      kind = 'new';
      reasons.push('mai giocato insieme');
    }
    if (haters.length) { score -= 15 * haters.length; reasons.push(`${haters.map((h) => h.name).join(' e ')} non lo ama`); }
    const ago = played[gk];
    if (ago >= 3) { score += Math.min(10, ago * 2); reasons.push(`non lo giocate da ${ago} serate`); }
    if (dur) reasons.push(`dura circa ${dur} minuti`);
    score = Math.max(1, Math.min(99, Math.round(score)));
    out.push({ id, item: it, score, kind, ago, dusty: ago >= 3 && score >= 60, reasons });
  }
  out.sort((a, b) => b.score - a.score);
  return {
    top: out.filter((r) => r.kind === 'top').slice(0, 5),
    tryNew: out.filter((r) => r.kind === 'new').slice(0, 4),
    dusty: out.filter((r) => r.dusty).slice(0, 3),
    all: out
  };
}

// ---------------------------------------------------------------------------
// Progressione: XP, livelli, traguardi, record
// ---------------------------------------------------------------------------

const LEVEL_NAMES = [[1, 'Novellino'], [3, 'Giocatore'], [5, 'Stratega'], [8, 'Veterano'], [12, 'Leggenda']];

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🎲', name: 'Prima serata', desc: 'Hai partecipato a una serata', test: (s) => s.nights >= 1 },
  { id: 'regular', icon: '🪑', name: 'Habitué', desc: '5 serate giocate', test: (s) => s.nights >= 5, progress: (s) => [s.nights, 5] },
  { id: 'veteran', icon: '🎖️', name: 'Veterano', desc: '10 serate giocate', test: (s) => s.nights >= 10, progress: (s) => [s.nights, 10] },
  { id: 'loyal', icon: '📅', name: 'Fedelissimo', desc: '3 serate di fila del gruppo', test: (s) => s.streak >= 3, progress: (s) => [s.streak, 3] },
  { id: 'explorer', icon: '🧭', name: 'Esploratore', desc: '10 giochi diversi provati', test: (s) => s.distinct >= 10, progress: (s) => [s.distinct, 10] },
  { id: 'explorer2', icon: '🗺️', name: 'Grande esploratore', desc: '20 giochi diversi provati', test: (s) => s.distinct >= 20, progress: (s) => [s.distinct, 20] },
  { id: 'social', icon: '🤝', name: 'Socievole', desc: 'Hai giocato con 5 persone diverse', test: (s) => s.people >= 5, progress: (s) => [s.people, 5] },
  { id: 'winner', icon: '🏆', name: 'Vincente', desc: '5 vittorie', test: (s) => s.wins >= 5, progress: (s) => [s.wins, 5] },
  { id: 'machine', icon: '⚙️', name: 'Macchina da guerra', desc: '3 vittorie nella stessa serata', test: (s) => s.bestNightWins >= 3 },
  { id: 'marathon', icon: '🏃', name: 'Maratoneta', desc: '6 giochi nella stessa serata', test: (s) => s.bestNightGames >= 6 },
  { id: 'star', icon: '⭐', name: 'Beniamino', desc: '10 voti MVP ricevuti', test: (s) => s.mvp >= 10, progress: (s) => [s.mvp, 10] },
  { id: 'oracle', icon: '🔮', name: 'Oracolo', desc: 'Hai indovinato la media 5 volte', test: (s) => s.oracle >= 5, progress: (s) => [s.oracle, 5] },
  { id: 'seer', icon: '🧿', name: 'Veggente', desc: 'Hai pronosticato il vincitore 5 volte', test: (s) => s.seer >= 5, progress: (s) => [s.seer, 5] },
  { id: 'rebel', icon: '💀', name: 'Bastian contrario', desc: 'Il tuo voto è stato il più lontano dalla media 3 volte', test: (s) => s.rebel >= 3, progress: (s) => [s.rebel, 3] },
  { id: 'complete', icon: '📚', name: 'Completista', desc: 'Hai provato tutti i giochi dell’armadio (almeno 5)', test: (s) => s.libSize >= 5 && s.libDone >= s.libSize, progress: (s) => [s.libDone, s.libSize] },
  { id: 'harsh', icon: '🧊', name: 'Critico implacabile', desc: 'Media dei voti dati sotto il 6 (dopo 10 voti)', secret: true, test: (s) => s.votes >= 10 && s.avgGiven < 6 },
  { id: 'gold', icon: '💛', name: 'Cuore d’oro', desc: 'Media dei voti dati sopra l’8,5 (dopo 10 voti)', secret: true, test: (s) => s.votes >= 10 && s.avgGiven > 8.5 },
  { id: 'night-owl', icon: '🦉', name: 'Nottambulo', desc: '10 giochi nella stessa serata', secret: true, test: (s) => s.bestNightGames >= 10 }
];

/** Tutti i numeri della progressione di una persona (chiave persona) nelle serate del gruppo. */
export function progressFor(nights, key, library = {}) {
  const list = nightsByDate(nights);
  const st = { nights: 0, votes: 0, sumGiven: 0, wins: 0, mvp: 0, games: 0, oracle: 0, rebel: 0, seer: 0, bestNightWins: 0, bestNightGames: 0, streak: 0, played: new Set(), people: 0 };
  const withSet = new Set();
  let streakOpen = true;
  for (const n of list) {
    const pp = n.people?.[key];
    if (!pp) { streakOpen = false; continue; }
    if (streakOpen) st.streak++;
    st.nights++;
    st.votes += pp.n || 0;
    st.sumGiven += pp.sumGiven || 0;
    st.wins += pp.wins || 0;
    st.mvp += pp.mvp || 0;
    st.games += pp.games || 0;
    st.oracle += pp.oracle || 0;
    st.rebel += pp.rebel || 0;
    st.seer += pp.seer || 0;
    st.bestNightWins = Math.max(st.bestNightWins, pp.nightWins || 0);
    st.bestNightGames = Math.max(st.bestNightGames, pp.games || 0);
    Object.keys(pp.played || pp.given || {}).forEach((g) => st.played.add(g));
    Object.keys(pp.with || {}).forEach((k) => withSet.add(k));
  }
  st.people = withSet.size;
  st.distinct = st.played.size;
  st.avgGiven = st.votes ? st.sumGiven / st.votes : null;
  const libKeys = Object.values(library || {}).filter((it) => it?.name).map((it) => dbKey(it.name));
  st.libSize = libKeys.length;
  st.libDone = libKeys.filter((k) => st.played.has(k)).length;
  const unlocked = ACHIEVEMENTS.filter((a) => a.test(st));
  st.xp = st.nights * 50 + st.games * 20 + st.wins * 30 + st.mvp * 10 + st.oracle * 15 + st.seer * 15 + unlocked.length * 100;
  st.level = 1 + Math.floor(Math.sqrt(st.xp / 150));
  const nextXp = 150 * st.level * st.level;
  const prevXp = 150 * (st.level - 1) * (st.level - 1);
  st.nextXp = nextXp;
  st.levelProgress = Math.min(1, (st.xp - prevXp) / Math.max(1, nextXp - prevXp));
  st.levelName = [...LEVEL_NAMES].reverse().find(([lv]) => st.level >= lv)[1];
  st.achievements = ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, name: a.name, desc: a.desc, secret: Boolean(a.secret), got: a.test(st), progress: a.progress ? a.progress(st) : null }));
  return st;
}

/** Traguardi sbloccati con la serata indicata (confronto con e senza quella serata). */
export function newAchievements(nights, key, room, library = {}) {
  const without = Object.fromEntries(Object.entries(nights || {}).filter(([k]) => k !== room));
  const before = new Set(progressFor(without, key, library).achievements.filter((a) => a.got).map((a) => a.id));
  return progressFor(nights, key, library).achievements.filter((a) => a.got && !before.has(a.id));
}

/** Hall of Fame: i record del gruppo. */
export function records(nights) {
  const list = nightsByDate(nights);
  const rec = [];
  let bestGame = null, longest = null, busiest = null, bestWins = null;
  for (const n of list) {
    const games = Object.values(n.games || {});
    for (const g of games) {
      const avg = g.n ? g.sum / g.n : 0;
      if (g.n >= 2 && (!bestGame || avg > bestGame.avg)) bestGame = { name: g.name, avg };
      if (g.playedMin && (!longest || g.playedMin > longest.min)) longest = { name: g.name, min: g.playedMin };
    }
    if (!busiest || games.length > busiest.count) busiest = { count: games.length };
    for (const pp of Object.values(n.people || {})) {
      if (pp.nightWins && (!bestWins || pp.nightWins > bestWins.wins)) bestWins = { name: pp.name, wins: pp.nightWins };
    }
  }
  if (bestGame) rec.push({ title: 'Media più alta in una serata', value: `${bestGame.name}: ${fmt(bestGame.avg)}` });
  if (longest) rec.push({ title: 'Partita più lunga', value: `${longest.name}: ${longest.min} minuti` });
  if (busiest?.count) rec.push({ title: 'Serata con più giochi', value: `${busiest.count} giochi` });
  if (bestWins) rec.push({ title: 'Più vittorie in una serata', value: `${bestWins.name}: ${bestWins.wins}` });
  return rec;
}

/** Livello del gruppo: cresce con le serate e le partite giocate insieme. */
export function groupLevel(nights) {
  const list = nightsByDate(nights);
  const games = list.reduce((a, n) => a + Object.keys(n.games || {}).length, 0);
  const xp = list.length * 100 + games * 25;
  return { level: 1 + Math.floor(Math.sqrt(xp / 300)), nights: list.length, games };
}


// ---------------------------------------------------------------------------
// Armadio avanzata: stato, scheda del gioco, ricerca
// ---------------------------------------------------------------------------

export const GAME_STATUS = { posseduto: 'Disponibile', prestato: 'Prestato', 'non disponibile': 'Non disponibile', venduto: 'Venduto' };
export const GAME_MODES = { competitivo: 'Competitivo', cooperativo: 'Cooperativo', squadre: 'A squadre', misto: 'Misto' };

export function isAvailable(item) {
  return !item?.status || item.status === 'posseduto';
}

export function tagsOf(item) {
  return toArray(item?.tags).map((t) => String(t).trim()).filter(Boolean);
}

/** Quando si è giocato l'ultima volta a ogni gioco (timestamp della serata). */
export function lastPlayedAt(nights) {
  const out = {};
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      const k = g.key || dbKey(g.name);
      if (!(k in out)) out[k] = Number(n.at) || 0;
    }
  }
  return out;
}

/** Scheda di un gioco: partite, media, ultima volta, durata reale, chi vince di più. */
export function gameRecord(nights, name) {
  const k = dbKey(name);
  const rec = { matches: 0, n: 0, sum: 0, minutes: [], last: null, votes: [], wins: {}, names: {} };
  for (const night of nightsByDate(nights)) {
    for (const g of Object.values(night.games || {})) {
      if ((g.key || dbKey(g.name)) !== k) continue;
      rec.matches++;
      rec.n += g.n || 0;
      rec.sum += g.sum || 0;
      if (g.playedMin) rec.minutes.push(g.playedMin);
      rec.last = Math.max(rec.last || 0, Number(night.at) || 0);
      rec.votes.push(...Object.values(g.v || {}).map(Number));
      for (const w of toArray(g.w)) rec.wins[w] = (rec.wins[w] || 0) + 1;
    }
    for (const [pk, pp] of Object.entries(night.people || {})) rec.names[pk] = pp.name;
  }
  const top = Object.entries(rec.wins).sort((a, b) => b[1] - a[1])[0];
  return {
    matches: rec.matches,
    avg: rec.n ? rec.sum / rec.n : null,
    minutes: rec.minutes.length ? Math.round(mean(rec.minutes)) : null,
    last: rec.last,
    consensus: rec.votes.length >= 2 ? Math.max(0, Math.round(100 - (Math.sqrt(mean(rec.votes.map((x) => (x - mean(rec.votes)) ** 2))) / 4.5) * 100)) : null,
    champion: top ? { name: rec.names[top[0]] || top[0], wins: top[1] } : null,
    level: 1 + Math.floor(rec.matches / 3)
  };
}

/** Filtra l’armadio. f: { text, players, maxMin, mode, maxWeight, minWeight, tag, staleDays, never, notHatedBy, available } */
export function searchLibrary(library, f, nights) {
  const last = lastPlayedAt(nights);
  const tastes = {};
  for (const night of Object.values(nights || {})) {
    for (const [k, pp] of Object.entries(night?.people || {})) {
      for (const [gk, v] of Object.entries(pp.given || {})) ((tastes[gk] ||= {})[k] ||= []).push(Number(v));
    }
  }
  const text = String(f.text || '').trim().toLowerCase();
  const now = Date.now();
  return Object.entries(library || {})
    .map(([id, it]) => ({ id, ...it }))
    .filter((it) => it.name)
    .filter((it) => {
      const k = dbKey(it.name);
      if (text && !(`${it.name} ${tagsOf(it).join(' ')} ${it.publisher || ''}`.toLowerCase().includes(text))) return false;
      const min = Number(it.minPlayers) || 0, max = Number(it.maxPlayers) || 0;
      if (f.players && ((min && f.players < min) || (max && f.players > max))) return false;
      const dur = durationOf(it);
      if (f.maxMin && dur && dur > f.maxMin) return false;
      if (f.mode && it.mode !== f.mode) return false;
      if (f.maxWeight && Number(it.weight) && Number(it.weight) > f.maxWeight) return false;
      if (f.minWeight && (!Number(it.weight) || Number(it.weight) < f.minWeight)) return false;
      if (f.tag && !tagsOf(it).some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
      if (f.never && k in last) return false;
      if (f.staleDays && k in last && now - last[k] < f.staleDays * 86400000) return false;
      if (f.notHatedBy) {
        const v = tastes[k]?.[f.notHatedBy];
        if (v && mean(v) <= 4) return false;
      }
      if (f.available && !isAvailable(it)) return false;
      return true;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
}

/**
 * Ricerca "a parole": "giochi per 5 persone, massimo 45 minuti, che Andrea non odia,
 * che non giochiamo da almeno un mese". people: [{ key, name }].
 */
export function parseQuery(q, people = [], tags = []) {
  const t = String(q || '').toLowerCase();
  const f = {};
  const num = (x) => ({ un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 })[x] ?? Number(x);
  const np = t.match(/(\d+|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s*(persone|giocatori|player)/);
  if (np) f.players = num(np[1]);
  else if (/siamo in (\d+)/.test(t)) f.players = Number(t.match(/siamo in (\d+)/)[1]);
  const mm = t.match(/(?:massimo|max|entro|meno di|sotto(?: i)?|al massimo|abbiamo)\s*(\d+)\s*(?:min|minuti)/) || t.match(/(\d+)\s*(?:min|minuti)/);
  if (mm) f.maxMin = Number(mm[1]);
  if (/mezz'?ora|mezzora/.test(t)) f.maxMin = 30;
  else if (/un'?ora e mezza/.test(t)) f.maxMin = 90;
  else if (/un'?ora/.test(t) && !f.maxMin) f.maxMin = 60;
  for (const p of people) {
    const n = String(p.name).toLowerCase();
    if (new RegExp(`(?:che|a cui)\\s+${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+non\\s+(?:odia|detesta|sopporta|piace)`).test(t)) f.notHatedBy = p.key;
  }
  const st = t.match(/da almeno\s+(\d+|un|una|due|tre|quattro|sei)\s+(giorn|settiman|mes|ann)/);
  if (st) f.staleDays = num(st[1]) * ({ giorn: 1, settiman: 7, mes: 30, ann: 365 })[st[2]];
  if (/mai giocat|mai provat|nuov/.test(t)) f.never = true;
  if (/cooperativ|coop\b/.test(t)) f.mode = 'cooperativo';
  else if (/a squadre|squadre/.test(t)) f.mode = 'squadre';
  else if (/competitiv/.test(t)) f.mode = 'competitivo';
  if (/facil|legger|semplic/.test(t)) f.maxWeight = 2;
  if (/impegnativ|pesant|stratégic|strategic|complicat/.test(t)) f.minWeight = 3;
  if (/disponibil|in casa|ce l'abbiamo/.test(t)) f.available = true;
  const tag = tags.find((tg) => new RegExp(`\\b${tg.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t));
  if (tag) f.tag = tag;
  return f;
}

// ---------------------------------------------------------------------------
// Ricordi, Wrapped, calendario
// ---------------------------------------------------------------------------

/** Serate in ordine cronologico, con il numero (#1, #2…) e i momenti salienti. */
export function nightsList(nights) {
  return nightsByDate(nights).reverse().map((n, i) => ({ ...nightHighlights(n), number: i + 1 }));
}

/** "4 giocatori · 2 giochi · 1 h 40 min" per le schede dei ricordi. */
export function nightFacts(n) {
  const m = Number(n.minutes) || 0;
  const dur = m ? (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`) : '';
  return [`${n.playersCount} ${n.playersCount === 1 ? 'giocatore' : 'giocatori'}`, `${n.gamesCount} ${n.gamesCount === 1 ? 'gioco' : 'giochi'}`, dur].filter(Boolean).join(' · ');
}

export function nightHighlights(n) {
  const games = Object.values(n.games || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const top = [...games].filter((g) => g.n).sort((a, b) => b.sum / b.n - a.sum / a.n)[0] || null;
  const people = Object.entries(n.people || {});
  const best = (field) => {
    const max = Math.max(0, ...people.map(([, pp]) => pp[field] || 0));
    return max ? people.filter(([, pp]) => (pp[field] || 0) === max).map(([, pp]) => pp.name) : [];
  };
  const minutes = n.duration || games.reduce((a, g) => a + (g.playedMin || 0), 0) || null;
  return {
    ...n,
    gamesSorted: games,
    gamesCount: games.length,
    playersCount: (n.names || people.map(([, pp]) => pp.name)).length,
    topGame: top ? { name: top.name, avg: top.sum / top.n } : null,
    winners: best('nightWins'),
    mvpNames: best('mvp'),
    minutes
  };
}

export function yearsOf(nights) {
  return [...new Set(nightsByDate(nights).map((n) => new Date(Number(n.at)).getFullYear()))].sort((a, b) => b - a);
}

/** Recap dell'anno, stile "Wrapped". */
export function wrapped(nights, year) {
  const list = nightsByDate(nights).filter((n) => new Date(Number(n.at)).getFullYear() === year).map(nightHighlights);
  if (!list.length) return null;
  const games = {};
  const people = {};
  const months = {};
  let longestMatch = null, longestNight = null, minutes = 0, matches = 0;
  for (const n of list) {
    months[new Date(Number(n.at)).getMonth()] = (months[new Date(Number(n.at)).getMonth()] || 0) + 1;
    if (n.minutes) minutes += n.minutes;
    if (n.minutes && (!longestNight || n.minutes > longestNight.minutes)) longestNight = { at: n.at, minutes: n.minutes };
    for (const g of n.gamesSorted) {
      matches++;
      const k = g.key || dbKey(g.name);
      const a = games[k] ||= { name: g.name, matches: 0, n: 0, sum: 0 };
      a.matches++; a.n += g.n || 0; a.sum += g.sum || 0;
      if (g.playedMin && (!longestMatch || g.playedMin > longestMatch.minutes)) longestMatch = { name: g.name, minutes: g.playedMin };
    }
    for (const [k, pp] of Object.entries(n.people || {})) {
      const a = people[k] ||= { name: pp.name, nights: 0, wins: 0, mvp: 0, oracle: 0, seer: 0, n: 0, sum: 0, games: 0 };
      a.nights++; a.wins += pp.wins || 0; a.mvp += pp.mvp || 0; a.oracle += pp.oracle || 0; a.seer += pp.seer || 0;
      a.n += pp.n || 0; a.sum += pp.sumGiven || 0; a.games += pp.games || 0; a.name = pp.name;
    }
  }
  const gl = Object.values(games);
  const pl = Object.values(people);
  const top = (arr, f, min = 1) => { const v = arr.filter((x) => f(x) >= min).sort((a, b) => f(b) - f(a)); return v[0] || null; };
  const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const bestMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
  const loved = gl.filter((g) => g.n >= 3).sort((a, b) => b.sum / b.n - a.sum / a.n)[0] || null;
  const raters = pl.filter((p) => p.n >= 5);
  return {
    year,
    nights: list.length,
    hours: minutes ? Math.round(minutes / 6) / 10 : null,
    matches,
    distinctGames: gl.length,
    players: pl.length,
    mostPlayed: top(gl, (g) => g.matches),
    loved: loved ? { name: loved.name, avg: loved.sum / loved.n } : null,
    longestMatch,
    longestNight,
    deadliest: top(pl, (p) => p.wins),
    mostPresent: top(pl, (p) => p.nights),
    mvp: top(pl, (p) => p.mvp),
    oracle: top(pl, (p) => p.oracle),
    seer: top(pl, (p) => p.seer),
    critic: raters.length >= 2 ? [...raters].sort((a, b) => a.sum / a.n - b.sum / b.n)[0] : null,
    generous: raters.length >= 2 ? [...raters].sort((a, b) => b.sum / b.n - a.sum / a.n)[0] : null,
    bestMonth: bestMonth ? { name: MONTHS[bestMonth[0]], nights: bestMonth[1] } : null,
    first: list[list.length - 1].at
  };
}

/** Serate per mese di un anno (per il calendario). */
export function nightsByMonth(nights, year) {
  const out = Array.from({ length: 12 }, () => []);
  for (const n of nightsList(nights)) {
    const d = new Date(Number(n.at));
    if (d.getFullYear() === year) out[d.getMonth()].push(n);
  }
  return out;
}

/** "Un anno fa stavate giocando a…" e anniversario della prima serata. */
export function onThisDay(nights, now = Date.now()) {
  const list = nightsList(nights);
  if (!list.length) return null;
  const out = {};
  const yearAgo = list.find((n) => { const d = (now - Number(n.at)) / 86400000; return d >= 358 && d <= 372; });
  if (yearAgo) out.yearAgo = yearAgo;
  const first = new Date(Number(list[0].at));
  const today = new Date(now);
  const years = today.getFullYear() - first.getFullYear();
  const anniv = new Date(today.getFullYear(), first.getMonth(), first.getDate());
  if (years >= 1 && Math.abs(today - anniv) <= 3 * 86400000) out.anniversary = { years, at: list[0].at };
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Statistiche avanzate del gruppo e personali
// ---------------------------------------------------------------------------

/** Aggregati per gioco su tutte le serate (con i singoli voti, dove salvati). */
function gameAggregates(nights, library) {
  const declared = {};
  for (const it of Object.values(library || {})) if (it?.name && Number(it.duration)) declared[dbKey(it.name)] = Number(it.duration);
  const last = lastPlayed(nights);
  const out = {};
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      const k = g.key || dbKey(g.name);
      const a = out[k] ||= { key: k, name: g.name, n: 0, sum: 0, nR: 0, sumR: 0, votes: [], minutes: [], matches: 0 };
      a.matches++; a.n += g.n || 0; a.sum += g.sum || 0;
      a.nR += g.nR ?? g.nCrit ?? 0; a.sumR += g.sumR || 0;
      a.votes.push(...Object.values(g.v || {}).map(Number));
      if (g.playedMin) a.minutes.push(g.playedMin);
    }
  }
  return Object.values(out).map((a) => {
    const avg = a.n ? a.sum / a.n : null;
    const sd = a.votes.length >= 2 ? Math.sqrt(mean(a.votes.map((x) => (x - mean(a.votes)) ** 2))) : null;
    return {
      ...a, avg,
      rig: a.nR ? a.sumR / a.nR : null,
      consensus: sd === null ? null : Math.max(0, Math.round(100 - (sd / 4.5) * 100)),
      minVote: a.votes.length ? Math.min(...a.votes) : null,
      realMin: a.minutes.length ? mean(a.minutes) : null,
      declared: declared[a.key] || null,
      ago: last[a.key]
    };
  });
}

export function groupInsights(nights, library) {
  const gs = gameAggregates(nights, library).filter((g) => g.n >= 2);
  const pick = (arr, f, n = 3) => [...arr].sort(f).slice(0, n);
  return {
    loved: pick(gs.filter((g) => g.avg !== null), (a, b) => b.avg - a.avg),
    everyone: pick(gs.filter((g) => g.votes.length >= 3 && g.minVote >= 7), (a, b) => b.avg - a.avg),
    divisive: pick(gs.filter((g) => g.consensus !== null && g.votes.length >= 3 && g.consensus < 70), (a, b) => a.consensus - b.consensus),
    overrated: pick(gs.filter((g) => g.rig !== null && g.avg / 2 - g.rig >= 0.6), (a, b) => (b.avg / 2 - b.rig) - (a.avg / 2 - a.rig)),
    underrated: pick(gs.filter((g) => g.rig !== null && g.rig - g.avg / 2 >= 0.6), (a, b) => (b.rig - b.avg / 2) - (a.rig - a.avg / 2)),
    longer: pick(gs.filter((g) => g.realMin && g.declared && g.realMin > g.declared * 1.2), (a, b) => b.realMin / b.declared - a.realMin / a.declared),
    perMinute: pick(gs.filter((g) => g.realMin && g.avg), (a, b) => b.avg / b.realMin - a.avg / a.realMin),
    never: pick(gs.filter((g) => g.avg !== null && g.avg < 5 && g.n >= 3), (a, b) => a.avg - b.avg),
    replay: pick(gs.filter((g) => g.avg >= 8 && g.ago >= 3), (a, b) => b.ago - a.ago)
  };
}

/** Statistiche personali avanzate (servono le serate salvate con i dati completi). */
export function personInsights(nights, key, library) {
  const tagsByKey = {};
  for (const it of Object.values(library || {})) if (it?.name) tagsByKey[dbKey(it.name)] = tagsOf(it);
  const durByKey = {};
  for (const it of Object.values(library || {})) if (it?.name) durByKey[dbKey(it.name)] = durationOf(it);
  const names = {};
  let diffs = [], agree = 0, rated = 0, played = 0, won = 0;
  const byGame = {}, rivals = {}, likedDur = [], likedPlayers = [], likedTags = {};
  for (const n of nightsByDate(nights)) {
    for (const [k, pp] of Object.entries(n.people || {})) names[k] = pp.name;
    for (const g of Object.values(n.games || {})) {
      const gk = g.key || dbKey(g.name);
      const votes = g.v || {};
      const mine = votes[key];
      if (typeof mine === 'number') {
        const others = Object.entries(votes).filter(([k]) => k !== key).map(([, x]) => Number(x));
        if (others.length) { diffs.push(mine - mean(others)); rated++; if (Math.abs(mine - mean(others)) <= 1) agree++; }
        if (mine >= 8) {
          const d = g.playedMin || durByKey[gk];
          if (d) likedDur.push(d);
          if (toArray(g.pl).length) likedPlayers.push(toArray(g.pl).length);
          for (const t of tagsByKey[gk] || []) likedTags[t] = (likedTags[t] || 0) + 1;
        }
      }
      const pl = toArray(g.pl);
      if (!pl.includes(key)) continue;
      played++;
      const w = toArray(g.w);
      const iWon = w.includes(key);
      if (iWon) won++;
      const b = byGame[gk] ||= { name: g.name, played: 0, won: 0 };
      b.played++; if (iWon) b.won++;
      if (!iWon) for (const o of w) if (o !== key && pl.includes(o)) rivals[o] = (rivals[o] || 0) + 1;
    }
  }
  const games = Object.values(byGame).filter((b) => b.played >= 2);
  const bestGame = [...games].sort((a, b) => b.won / b.played - a.won / a.played || b.played - a.played)[0];
  const worstGame = [...games].sort((a, b) => a.won / a.played - b.won / b.played || b.played - a.played)[0];
  const nemesis = Object.entries(rivals).sort((a, b) => b[1] - a[1])[0];
  const mate = affinities(nights).find((p) => p.a.key === key || p.b.key === key);
  const favTag = Object.entries(likedTags).sort((a, b) => b[1] - a[1])[0];
  return {
    severity: diffs.length >= 3 ? mean(diffs) : null,
    agreement: rated >= 3 ? Math.round((agree / rated) * 100) : null,
    winRate: played ? Math.round((won / played) * 100) : null,
    played, won,
    bestGame: bestGame && bestGame.won ? bestGame : null,
    worstGame: worstGame && worstGame !== bestGame && worstGame.won / worstGame.played < 0.5 ? worstGame : null,
    nemesis: nemesis ? { name: names[nemesis[0]] || nemesis[0], wins: nemesis[1] } : null,
    mate: mate ? { name: mate.a.key === key ? mate.b.name : mate.a.name, diff: mate.diff } : null,
    idealMinutes: likedDur.length ? Math.round(mean(likedDur)) : null,
    idealPlayers: likedPlayers.length ? Math.round(mean(likedPlayers) * 10) / 10 : null,
    favTag: favTag ? favTag[0] : null
  };
}

/** Mappa delle coppie: compatibilità, partite insieme, scontri diretti, gusti comuni e opposti. */
export function pairsMap(nights) {
  const names = {};
  const tastes = {};
  const pairs = {};
  const key2 = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const n of nightsByDate(nights)) {
    for (const [k, pp] of Object.entries(n.people || {})) {
      names[k] = pp.name;
      for (const [gk, v] of Object.entries(pp.given || {})) ((tastes[k] ||= {})[gk] ||= []).push(Number(v));
    }
    for (const g of Object.values(n.games || {})) {
      const pl = toArray(g.pl), w = toArray(g.w);
      for (let i = 0; i < pl.length; i++) {
        for (let j = i + 1; j < pl.length; j++) {
          const [a, b] = pl[i] < pl[j] ? [pl[i], pl[j]] : [pl[j], pl[i]];
          const p = pairs[key2(a, b)] ||= { a, b, together: 0, aWins: 0, bWins: 0, both: 0 };
          p.together++;
          const wa = w.includes(a), wb = w.includes(b);
          if (wa && wb) p.both++; else if (wa) p.aWins++; else if (wb) p.bWins++;
        }
      }
    }
  }
  const keys = Object.keys(tastes);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const [a, b] = keys[i] < keys[j] ? [keys[i], keys[j]] : [keys[j], keys[i]];
      const p = pairs[key2(a, b)] ||= { a, b, together: 0, aWins: 0, bWins: 0, both: 0 };
      const ta = tastes[a], tb = tastes[b];
      const common = Object.keys(ta).filter((g) => g in tb);
      p.common = common.length;
      const diffs = common.map((g) => Math.abs(mean(ta[g]) - mean(tb[g])));
      p.compat = common.length >= 2 ? Math.max(0, Math.min(100, Math.round(100 - mean(diffs) * 15))) : null;
      p.lovedBoth = common.filter((g) => mean(ta[g]) >= 8 && mean(tb[g]) >= 8);
      p.opposite = common.filter((g) => Math.abs(mean(ta[g]) - mean(tb[g])) >= 4);
    }
  }
  const list = Object.values(pairs).map((p) => ({ ...p, aName: names[p.a] || p.a, bName: names[p.b] || p.b }));
  const best = (arr, f) => arr.sort(f)[0] || null;
  return {
    people: Object.entries(names).map(([key, name]) => ({ key, name })),
    pairs: list,
    duo: best(list.filter((p) => p.both >= 2), (x, y) => y.both - x.both),
    rivalry: best(list.filter((p) => p.aWins >= 1 && p.bWins >= 1), (x, y) => Math.min(y.aWins, y.bWins) - Math.min(x.aWins, x.bWins) || (y.aWins + y.bWins) - (x.aWins + x.bWins)),
    souls: best(list.filter((p) => p.compat !== null), (x, y) => y.compat - x.compat),
    enemies: best(list.filter((p) => p.compat !== null), (x, y) => x.compat - y.compat)
  };
}

// ---------------------------------------------------------------------------
// Stagioni, rivalità testa a testa, figurine
// ---------------------------------------------------------------------------

const SEASON_NAMES = ['Inverno', 'Primavera', 'Estate', 'Autunno'];

/** Stagione di una data: una ogni tre mesi (gen-mar Inverno, apr-giu Primavera, lug-set Estate, ott-dic Autunno). */
export function seasonOf(at) {
  const d = new Date(Number(at) || Date.now());
  const q = Math.floor(d.getMonth() / 3);
  return { id: `${d.getFullYear()}-${q + 1}`, name: `${SEASON_NAMES[q]} ${d.getFullYear()}`, year: d.getFullYear(), q };
}

/** Punti "campioni" di una persona in una serata salvata (vittoria 3, MVP 1, pronostico 1, media indovinata 1). */
export function championPoints(pp) {
  if (!pp) return 0;
  return (Number(pp.wins) || 0) * 3 + (Number(pp.mvp) || 0) + (Number(pp.seer) || 0) + (Number(pp.oracle) || 0);
}

/**
 * Classifiche di stagione dalle serate del gruppo.
 * Restituisce le stagioni dalla più recente: { id, name, nights, rows: [{ key, name, points, nights, nightWins, wins, mvp }], champion }.
 * nightWins = serate chiuse da campione (più punti di tutti quella sera).
 */
export function seasonTables(nights) {
  const seasons = {};
  for (const n of nightsByDate(nights)) {
    const s = seasonOf(n.at);
    const S = (seasons[s.id] ||= { ...s, nights: 0, last: 0, people: {} });
    S.nights++;
    S.last = Math.max(S.last, Number(n.at) || 0);
    const pts = Object.entries(n.people || {}).map(([k, pp]) => [k, championPoints(pp), pp]);
    const top = Math.max(0, ...pts.map(([, p]) => p));
    for (const [k, p, pp] of pts) {
      const row = (S.people[k] ||= { key: k, name: pp.name, points: 0, nights: 0, nightWins: 0, wins: 0, mvp: 0 });
      row.name = row.name || pp.name;
      row.points += p;
      row.nights++;
      row.wins += Number(pp.wins) || 0;
      row.mvp += Number(pp.mvp) || 0;
      if (top > 0 && p === top) row.nightWins++;
    }
  }
  return Object.values(seasons).sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true })).map((S) => {
    const rows = Object.values(S.people).sort((a, b) => b.points - a.points || b.nightWins - a.nightWins || b.wins - a.wins || a.name.localeCompare(b.name));
    let prev = null;
    let prevRank = 0;
    rows.forEach((r, i) => { const k = `${r.points}|${r.nightWins}|${r.wins}`; r.rank = k === prev ? prevRank : i + 1; prev = k; prevRank = r.rank; });
    const done = seasonOf(Date.now()).id !== S.id;
    return { id: S.id, name: S.name, nights: S.nights, rows, done, champion: rows[0]?.points ? rows.filter((r) => r.rank === 1) : [] };
  });
}

/**
 * Rivalità testa a testa: per ogni coppia che ha giocato insieme, chi ha vinto quando
 * uno dei due ha vinto e l'altro no. Le chiavi sono quelle delle persone (personKey).
 */
export function headToHead(nights) {
  const pairs = {};
  const names = {};
  const key2 = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const n of nightsByDate(nights)) {
    for (const [k, pp] of Object.entries(n.people || {})) if (pp?.name) names[k] = pp.name;
    for (const g of Object.values(n.games || {})) {
      const pl = toArray(g.pl);
      const w = new Set(toArray(g.w));
      if (!w.size || pl.length < 2) continue;
      for (let i = 0; i < pl.length; i++) {
        for (let j = i + 1; j < pl.length; j++) {
          const [a, b] = pl[i] < pl[j] ? [pl[i], pl[j]] : [pl[j], pl[i]];
          const p = (pairs[key2(a, b)] ||= { a, b, games: 0, aw: 0, bw: 0 });
          p.games++;
          if (w.has(a) && !w.has(b)) p.aw++;
          if (w.has(b) && !w.has(a)) p.bw++;
        }
      }
    }
  }
  const list = Object.values(pairs).map((p) => ({ ...p, aName: names[p.a] || '?', bName: names[p.b] || '?', decided: p.aw + p.bw }));
  return { list, names };
}

/** Le rivalità più accese: tante sfide decise e punteggio vicino. */
export function topRivalries(nights, limit = 8) {
  return headToHead(nights).list
    .filter((p) => p.decided >= 2)
    .map((p) => ({ ...p, heat: p.decided * 2 - Math.abs(p.aw - p.bw) * 1.5 }))
    .sort((x, y) => y.heat - x.heat || y.games - x.games)
    .slice(0, limit);
}

/** Rivalità di una persona: bilancio con ognuno, nemesi (chi la batte di più) e vittima preferita. */
export function rivalsOf(nights, key) {
  const mine = headToHead(nights).list.filter((p) => p.a === key || p.b === key).map((p) => {
    const me = p.a === key;
    return { key: me ? p.b : p.a, name: me ? p.bName : p.aName, games: p.games, won: me ? p.aw : p.bw, lost: me ? p.bw : p.aw };
  }).filter((r) => r.won + r.lost > 0).sort((x, y) => (y.won + y.lost) - (x.won + x.lost));
  const nemesis = [...mine].filter((r) => r.lost > r.won && r.lost >= 2).sort((x, y) => (y.lost - y.won) - (x.lost - x.won) || y.lost - x.lost)[0] || null;
  const victim = [...mine].filter((r) => r.won > r.lost && r.won >= 2).sort((x, y) => (y.won - y.lost) - (x.won - x.lost) || y.won - x.won)[0] || null;
  return { list: mine, nemesis, victim };
}

/** Rarità della figurina in base al livello. */
export function cardRarity(level) {
  if (level >= 12) return { key: 'leggendaria', label: 'Leggendaria', stars: 4 };
  if (level >= 7) return { key: 'epica', label: 'Epica', stars: 3 };
  if (level >= 3) return { key: 'rara', label: 'Rara', stars: 2 };
  return { key: 'comune', label: 'Comune', stars: 1 };
}

/** Dati della figurina di una persona: livello, rarità, statistiche principali e il gioco del cuore. */
export function playerCard(nights, key, library = {}) {
  const pr = progressFor(nights, key, library);
  const ps = personalStats(nights, key);
  let name = '';
  let fav = null;
  let best = -1;
  for (const n of nightsByDate(nights)) {
    const pp = n.people?.[key];
    if (!pp) continue;
    name = name || pp.name;
    for (const [gk, v] of Object.entries(pp.given || {})) {
      if (v > best) { best = v; fav = Object.values(n.games || {}).find((g) => g.key === gk)?.name || fav; }
    }
  }
  const seasons = seasonTables(nights);
  const titles = seasons.filter((s) => s.done && s.champion.some((c) => c.key === key)).map((s) => s.name);
  return {
    key, name, level: pr.level, levelName: pr.levelName, xp: pr.xp, rarity: cardRarity(pr.level),
    nights: ps.nights, wins: ps.wins, mvp: ps.mvp, avgGiven: ps.votes ? ps.sumGiven / ps.votes : null,
    fav, seasonTitles: titles, number: Math.abs([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 900 + 100
  };
}
