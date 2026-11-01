// Analisi dello storico del gruppo (1.12, idee 8, 37, 41, 44, 45, 46, 48, 49, 50, 60, 71).
//
// Solo funzioni pure sui riassunti delle serate (groups/<gruppo>/nights) e sull'armadio: niente pagina,
// niente database. Tutte le conclusioni portano con sé quanti dati le sostengono (idea 44): sotto le
// soglie si dice "pochi dati" invece di inventare tendenze. Prove: tests/insights.test.mjs.
//
// Affidabilità (idea 44), documentata anche in docs/SVILUPPO.md:
//   pochi    < 3 voti (o < 2 serate per le tendenze)
//   discreti 3–7 voti
//   solidi   ≥ 8 voti
// Non è una misura statistica: è solo il conteggio dei dati, detto in parole.
import { nightsByDate, seasonOf, personKey } from './stats.js';
import { dbKey, fmt } from './util.js';
import { t } from './i18n.js';

export const CONF_FEW = 3;
export const CONF_SOLID = 8;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const keyOf = (g) => g?.key || dbKey(g?.name || '');

/** Affidabilità di un valore calcolato su n dati: 'few' | 'ok' | 'solid'. */
export function confidence(n) {
  const v = Number(n) || 0;
  return v >= CONF_SOLID ? 'solid' : v >= CONF_FEW ? 'ok' : 'few';
}

/**
 * Idea 8 · Lo stesso gioco serata per serata: [{ room, at, avg, n, players, minutes, few }] dalla più vecchia.
 * players: quanti hanno giocato; few: media su meno di CONF_FEW voti (da non confrontare).
 */
export function gameSessions(nights, name) {
  const k = dbKey(name);
  const out = [];
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      if (keyOf(g) !== k || !g.n) continue;
      out.push({ room: n.room, at: Number(n.at) || 0, avg: g.sum / g.n, n: g.n, players: (Array.isArray(g.pl) ? g.pl : Object.values(g.pl || {})).length || g.n, minutes: Number(g.playedMin) || null, few: g.n < CONF_FEW });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Idea 41 · Tendenze: per i giochi votati in almeno 4 serate, media delle ultime metà contro le prime.
 * Solo differenze di almeno 1 punto con almeno CONF_FEW voti per parte. [{ name, key, from, to, delta, nights, nFrom, nTo, dir }]
 */
export function trends(nights, { minNights = 4, minDelta = 1 } = {}) {
  const by = {};
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      if (!g?.n) continue;
      (by[keyOf(g)] ||= { name: g.name, list: [] }).list.push({ at: Number(n.at) || 0, n: g.n, sum: g.sum });
    }
  }
  const out = [];
  for (const [key, { name, list }] of Object.entries(by)) {
    if (list.length < minNights) continue;
    list.sort((a, b) => a.at - b.at);
    const half = Math.floor(list.length / 2);
    const A = list.slice(0, half);
    const B = list.slice(list.length - half);
    const nA = A.reduce((a, x) => a + x.n, 0);
    const nB = B.reduce((a, x) => a + x.n, 0);
    if (nA < CONF_FEW || nB < CONF_FEW) continue;
    const from = A.reduce((a, x) => a + x.sum, 0) / nA;
    const to = B.reduce((a, x) => a + x.sum, 0) / nB;
    const delta = to - from;
    if (Math.abs(delta) < minDelta) continue;
    out.push({ name, key, from, to, delta, nights: list.length, nFrom: nA, nTo: nB, dir: delta > 0 ? 'up' : 'down' });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Riassunto di un insieme di serate (per stagioni e periodi). */
function periodSummary(list) {
  const games = {};
  const people = {};
  let votes = 0;
  let minutes = 0;
  for (const n of list) {
    for (const g of Object.values(n.games || {})) {
      if (!g?.n) continue;
      const G = (games[keyOf(g)] ||= { name: g.name, n: 0, sum: 0, nights: 0 });
      G.n += g.n; G.sum += g.sum; G.nights++;
      votes += g.n;
      minutes += Number(g.playedMin) || 0;
    }
    for (const [k, pp] of Object.entries(n.people || {})) {
      const P = (people[k] ||= { name: pp.name, nights: 0, wins: 0, mvp: 0 });
      P.nights++; P.wins += Number(pp.wins) || 0; P.mvp += Number(pp.mvp) || 0;
    }
  }
  const glist = Object.values(games).map((g) => ({ ...g, avg: g.sum / g.n }));
  const best = glist.filter((g) => g.n >= CONF_FEW).sort((a, b) => b.avg - a.avg)[0] || null;
  const most = [...glist].sort((a, b) => b.nights - a.nights || b.n - a.n)[0] || null;
  const plist = Object.values(people);
  const winner = [...plist].sort((a, b) => b.wins - a.wins)[0];
  const regular = [...plist].sort((a, b) => b.nights - a.nights)[0];
  return {
    nights: list.length, games: glist.length, votes, minutes, people: plist.length,
    best: best && { name: best.name, avg: best.avg, n: best.n },
    most: most && { name: most.name, nights: most.nights },
    winner: winner?.wins ? { name: winner.name, wins: winner.wins } : null,
    regular: regular ? { name: regular.name, nights: regular.nights } : null
  };
}

/** Stagioni presenti nello storico: [{ id, name }] dalla più recente. */
export function seasonList(nights) {
  const seen = new Map();
  for (const n of nightsByDate(nights)) { const s = seasonOf(n.at); seen.set(s.id, s); }
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }));
}

/**
 * Idea 45 · Due stagioni a confronto: { a, b, uneven } con i riassunti; uneven = una ha più del doppio
 * delle serate dell'altra (il confronto va letto con prudenza).
 */
export function compareSeasons(nights, idA, idB) {
  const all = nightsByDate(nights);
  const pick = (id) => all.filter((n) => seasonOf(n.at).id === id);
  const A = periodSummary(pick(idA));
  const B = periodSummary(pick(idB));
  const lo = Math.min(A.nights, B.nights);
  const hi = Math.max(A.nights, B.nights);
  return { a: A, b: B, uneven: lo === 0 || hi > lo * 2 };
}

/** Idea 71 · Riepilogo di un periodo qualsiasi (mese, stagione, anno): { from, to } in ms. */
export function periodRecap(nights, from, to) {
  return periodSummary(nightsByDate(nights).filter((n) => Number(n.at) >= from && Number(n.at) < to));
}

/** Inizio e fine di un mese, di un trimestre o di un anno che contiene "at". */
export function periodBounds(kind, at = Date.now()) {
  const d = new Date(at);
  if (kind === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
  if (kind === 'quarter') { const q = Math.floor(d.getMonth() / 3) * 3; return { from: new Date(d.getFullYear(), q, 1).getTime(), to: new Date(d.getFullYear(), q + 3, 1).getTime() }; }
  return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: new Date(d.getFullYear() + 1, 0, 1).getTime() };
}

/**
 * Idea 46 · Abitudini: quante serate per giorno della settimana (0 = lunedì) e per mese (0 = gennaio),
 * più la griglia giorno × mese. Solo date del gruppo, nessun dato personale.
 */
export function habits(nights) {
  const days = Array(7).fill(0);
  const months = Array(12).fill(0);
  const grid = Array.from({ length: 7 }, () => Array(12).fill(0));
  const hours = Array(24).fill(0);
  for (const n of nightsByDate(nights)) {
    const d = new Date(Number(n.at));
    if (Number.isNaN(d.getTime())) continue;
    const wd = (d.getDay() + 6) % 7;
    days[wd]++; months[d.getMonth()]++; grid[wd][d.getMonth()]++; hours[d.getHours()]++;
  }
  const top = (arr) => { const m = Math.max(...arr); return m ? arr.indexOf(m) : -1; };
  return { days, months, grid, hours, topDay: top(days), topMonth: top(months), total: days.reduce((a, b) => a + b, 0) };
}

/**
 * Idee 37 e 48 · Gusti del gruppo e statistiche per modalità: medie per modalità, peso e durata
 * (prese dall'armadio di stasera per nome, o dalla modalità salvata nel riassunto dalla 1.12).
 * [{ dim, value, avg, n, games }] solo con almeno CONF_FEW voti.
 */
export function tasteProfile(nights, library) {
  const byName = new Map(Object.values(library || {}).filter((it) => it?.name).map((it) => [dbKey(it.name), it]));
  const acc = {};
  const add = (dim, value, g) => {
    const A = (acc[`${dim}|${value}`] ||= { dim, value, n: 0, sum: 0, games: new Set() });
    A.n += g.n; A.sum += g.sum; A.games.add(keyOf(g));
  };
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      if (!g?.n) continue;
      const it = byName.get(keyOf(g)) || {};
      const mode = g.mode || it.mode;
      if (mode) add('mode', mode, g);
      const w = Number(g.weight || it.weight);
      if (w) add('weight', w < 2 ? 'light' : w < 3 ? 'medium' : 'heavy', g);
      const min = Number(g.playedMin || it.duration);
      if (min) add('length', min <= 30 ? 'short' : min <= 75 ? 'medium' : 'long', g);
    }
  }
  return Object.values(acc).filter((a) => a.n >= CONF_FEW).map((a) => ({ dim: a.dim, value: a.value, avg: a.sum / a.n, n: a.n, games: a.games.size, conf: confidence(a.n) }))
    .sort((a, b) => a.dim.localeCompare(b.dim) || b.avg - a.avg);
}

/**
 * Idea 7 (2.1) · Storico separato per criterio e modalità: per ogni modalità di gioco la media generale e
 * quella di ogni domanda (coinvolgimento, semplicità, rigiocabilità) dai riassunti delle serate.
 * [{ mode, overall: { avg, n }, crit: { coinv|sempl|rigioc: { avg, n } } }] (solo valori con almeno CONF_FEW voti).
 */
export function modeCriteria(nights, library) {
  const byName = new Map(Object.values(library || {}).filter((it) => it?.name).map((it) => [dbKey(it.name), it]));
  const acc = {};
  const CR = [['coinv', 'sumC', 'nC'], ['sempl', 'sumS', 'nS'], ['rigioc', 'sumR', 'nR']];
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      if (!g?.n) continue;
      const mode = g.mode || byName.get(keyOf(g))?.mode;
      if (!mode) continue;
      const A = (acc[mode] ||= { mode, o: { n: 0, sum: 0 }, c: {} });
      A.o.n += Number(g.n) || 0; A.o.sum += Number(g.sum) || 0;
      for (const [k, sk, nk] of CR) {
        const cnt = Number(g[nk] ?? (k === 'coinv' ? g.nCrit : 0)) || 0;
        if (!cnt) continue;
        const C = (A.c[k] ||= { n: 0, sum: 0 });
        C.n += cnt; C.sum += Number(g[sk]) || 0;
      }
    }
  }
  const val = (x) => (x && x.n >= CONF_FEW ? { avg: x.sum / x.n, n: x.n, conf: confidence(x.n) } : null);
  return Object.values(acc).map((a) => ({ mode: a.mode, overall: val(a.o), crit: Object.fromEntries(CR.map(([k]) => [k, val(a.c[k])])) }))
    .filter((r) => r.overall).sort((a, b) => b.overall.avg - a.overall.avg);
}

/**
 * Opportunità B (2.1) · Cronologia del gruppo: eventi ricavati dai riassunti, dal più recente.
 * Solo fatti con dati sufficienti (record e "più amato" con almeno CONF_FEW e 8 voti), niente coincidenze:
 * first (prima serata), milestone (10ª, 25ª…), newcomer (prima volta di una persona), rediscovered (gioco
 * ripreso dopo almeno 180 giorni), record (miglior media di un gioco in una serata), leader (cambia il gioco
 * più amato di sempre). [{ at, k, name?, prev?, n?, avg?, days? }]
 */
export function groupTimeline(nights, { max = 60 } = {}) {
  const list = nightsByDate(nights).slice().reverse();
  const ev = [];
  const games = new Map();
  const seen = new Set();
  let best = null;
  let leader = null;
  list.forEach((n, i) => {
    const at = Number(n.at) || 0;
    if (i === 0) ev.push({ at, k: 'first' });
    if ([10, 25, 50, 100, 200, 500].includes(i + 1)) ev.push({ at, k: 'milestone', n: i + 1 });
    for (const [pk, pp] of Object.entries(n.people || {})) {
      if (seen.has(pk)) continue;
      seen.add(pk);
      if (i > 0 && pp?.name) ev.push({ at, k: 'newcomer', name: pp.name });
    }
    for (const g of Object.values(n.games || {})) {
      if (!g?.name) continue;
      const k = keyOf(g);
      const e = games.get(k);
      if (e && e.last && at - e.last >= 180 * 864e5) ev.push({ at, k: 'rediscovered', name: g.name, days: Math.round((at - e.last) / 864e5) });
      const cnt = Number(g.n) || 0;
      const avg = cnt ? (Number(g.sum) || 0) / cnt : 0;
      if (cnt >= CONF_FEW && (!best || avg > best.avg + 1e-9)) {
        if (best) ev.push({ at, k: 'record', name: g.name, avg, prev: best.name });
        best = { name: g.name, avg };
      }
      const x = e || { name: g.name, n: 0, sum: 0, last: 0 };
      x.n += cnt; x.sum += Number(g.sum) || 0; x.last = at; x.name = g.name;
      games.set(k, x);
    }
    const top = [...games.values()].filter((x) => x.n >= CONF_SOLID).sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
    if (top && top.name !== leader) { if (leader) ev.push({ at, k: 'leader', name: top.name, prev: leader }); leader = top.name; }
  });
  return ev.reverse().slice(0, max);
}

/**
 * Idea 49 · Report della collezione: per ogni gioco dell'armadio quante serate, media, ultima volta.
 * Gruppi: never (mai giocati), loved (media ≥ 8 con dati sufficienti), dusty (non giocati da 180 giorni), often.
 * Nessun giudizio sugli acquisti: solo i numeri.
 */
export function collectionReport(library, nights, now = Date.now()) {
  const rec = {};
  for (const n of nightsByDate(nights)) {
    for (const g of Object.values(n.games || {})) {
      const R = (rec[keyOf(g)] ||= { nights: 0, n: 0, sum: 0, last: 0 });
      R.nights++; R.n += g.n || 0; R.sum += g.sum || 0; R.last = Math.max(R.last, Number(n.at) || 0);
    }
  }
  const items = Object.entries(library || {}).filter(([, it]) => it?.name && !it.baseId).map(([id, it]) => {
    const R = rec[dbKey(it.name)] || { nights: 0, n: 0, sum: 0, last: 0 };
    return { id, name: it.name, nights: R.nights, avg: R.n ? R.sum / R.n : null, n: R.n, last: R.last || null, conf: confidence(R.n) };
  });
  const day = 86400000;
  return {
    total: items.length,
    played: items.filter((x) => x.nights).length,
    never: items.filter((x) => !x.nights).sort((a, b) => a.name.localeCompare(b.name)),
    loved: items.filter((x) => x.avg !== null && x.avg >= 8 && x.n >= CONF_FEW).sort((a, b) => b.avg - a.avg),
    dusty: items.filter((x) => x.last && now - x.last > 180 * day).sort((a, b) => a.last - b.last),
    often: items.filter((x) => x.nights).sort((a, b) => b.nights - a.nights).slice(0, 10)
  };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Idea 50 · Esportazione delle statistiche con filtri. f: { from, to, game, person, names }.
 * names=false (predefinito): le persone diventano "P1, P2…" (stesso numero nello stesso file).
 * Restituisce { rows, csv, json } con schema "gamenight-stats" versione 1 (docs/DATI.md).
 */
export function statsExport(nights, f = {}) {
  const from = Number(f.from) || 0;
  const to = Number(f.to) || Infinity;
  const gk = f.game ? dbKey(f.game) : '';
  const alias = new Map();
  const who = (k, name) => {
    if (f.names) return name || k;
    if (!alias.has(k)) alias.set(k, `P${alias.size + 1}`);
    return alias.get(k);
  };
  const rows = [];
  for (const n of nightsByDate(nights)) {
    const at = Number(n.at) || 0;
    if (at < from || at >= to) continue;
    for (const g of Object.values(n.games || {})) {
      if (!g?.n || (gk && keyOf(g) !== gk)) continue;
      const votes = Object.entries(g.v || {});
      if (f.person) {
        const mine = votes.find(([k]) => k === f.person);
        if (!mine) continue;
        rows.push({ date: new Date(at).toISOString().slice(0, 10), night: n.room || '', game: g.name, avg: Math.round((g.sum / g.n) * 100) / 100, votes: g.n, minutes: g.playedMin || null, person: who(f.person, n.people?.[f.person]?.name), vote: mine[1], won: (Array.isArray(g.w) ? g.w : Object.values(g.w || {})).includes(f.person) });
        continue;
      }
      rows.push({ date: new Date(at).toISOString().slice(0, 10), night: n.room || '', game: g.name, avg: Math.round((g.sum / g.n) * 100) / 100, votes: g.n, minutes: g.playedMin || null, winners: (Array.isArray(g.w) ? g.w : Object.values(g.w || {})).map((k) => who(k, n.people?.[k]?.name)).join(' + ') });
    }
  }
  const cols = rows.length ? Object.keys(rows[0]) : ['date', 'night', 'game', 'avg', 'votes', 'minutes', 'winners'];
  const csv = `${cols.join(',')}\n${rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n')}\n`;
  const json = JSON.stringify({ format: 'gamenight-stats', version: 1, exportedAt: new Date().toISOString(), filters: { from: from || null, to: Number.isFinite(to) ? to : null, game: f.game || null, person: f.person ? (f.names ? f.person : 'P1') : null, names: Boolean(f.names) }, rows }, null, 1);
  return { rows, csv, json };
}

/**
 * Idea 60 · Le statistiche di una persona (solo le sue) da tutti i gruppi: per l'esportazione dei propri dati.
 * groups: [{ id, name, nights }], keys: personKey possibili della persona in quei gruppi.
 */
export function personalStats(groups, keysByGroup) {
  return (groups || []).map((g) => {
    const keys = new Set(keysByGroup?.[g.id] || []);
    const out = { group: g.name || g.id, nights: 0, votesGiven: 0, avgGiven: null, wins: 0, mvp: 0, games: {} };
    let sum = 0;
    for (const n of [...nightsByDate(g.nights || {})].sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0))) {
      const mine = Object.entries(n.people || {}).find(([k]) => keys.has(k));
      if (!mine) continue;
      const [k, pp] = mine;
      out.nights++;
      out.votesGiven += Number(pp.n) || 0;
      sum += Number(pp.sumGiven) || 0;
      out.wins += Number(pp.wins) || 0;
      out.mvp += Number(pp.mvp) || 0;
      for (const gm of Object.values(n.games || {})) {
        const v = gm.v?.[k];
        if (typeof v === 'number') (out.games[gm.name] ||= []).push(v);
      }
    }
    out.avgGiven = out.votesGiven ? Math.round((sum / out.votesGiven) * 100) / 100 : null;
    return out;
  }).filter((x) => x.nights);
}

/** personKey della persona in un gruppo: dal profilo di gruppo (memberId) o dal nome. */
export const personKeysFor = ({ memberId, name }) => [memberId ? personKey({ memberId }) : null, name ? personKey({ name }) : null].filter(Boolean);

/**
 * Idea 39 · Sintesi della serata in poche frasi, solo da dati veri del riassunto (o della stanza).
 * Restituisce un elenco di { k, p } (chiave di testo e parametri): la pagina li traduce. withQuotes=false
 * esclude i commenti dei giocatori.
 */
export function nightStory(summary, { withQuotes = true } = {}) {
  const games = Object.values(summary?.games || {}).filter((g) => g?.n).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!games.length) return [];
  const out = [];
  const people = Object.values(summary.people || {});
  out.push({ k: 'story.open', p: { n: games.length, people: people.length + (Number(summary.guests) || 0) } });
  const best = [...games].sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
  out.push({ k: 'story.best', p: { name: best.name, avg: Math.round((best.sum / best.n) * 10) / 10 } });
  const split = games.filter((g) => typeof g.cons === 'number').sort((a, b) => a.cons - b.cons)[0];
  if (split && split.cons < 60 && split !== best) out.push({ k: 'story.split', p: { name: split.name } });
  const long = games.filter((g) => g.playedMin).sort((a, b) => b.playedMin - a.playedMin)[0];
  if (long && long.playedMin >= 45) out.push({ k: 'story.long', p: { name: long.name, min: long.playedMin } });
  const champ = [...people].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
  if (champ?.wins) out.push({ k: 'story.champ', p: { name: champ.name, n: champ.wins } });
  const mvp = [...people].sort((a, b) => (b.mvp || 0) - (a.mvp || 0))[0];
  if (mvp?.mvp && mvp !== champ) out.push({ k: 'story.mvp', p: { name: mvp.name } });
  if (withQuotes && summary.quotes?.length) {
    const q = Object.values(summary.quotes)[0];
    if (q?.text) out.push({ k: 'story.quote', p: { name: q.name, text: q.text } });
  }
  return out;
}

/** Frasi del racconto nella lingua scelta (le medie con la virgola giusta). */
export function storyText(list) {
  return (list || []).map(({ k, p }) => t(k, { ...p, ...(typeof p?.avg === 'number' ? { avg: fmt(p.avg) } : {}) }));
}

/** Media delle durate dichiarate e osservate di un gioco (idea 36): { declared, observed, n }. */
export function durationInfo(item) {
  const n = Number(item?.playedCount) || 0;
  return { declared: Number(item?.duration) || null, observed: n ? Math.round(Number(item.playedTotal) / n) : null, n };
}

export const _test = { mean };
