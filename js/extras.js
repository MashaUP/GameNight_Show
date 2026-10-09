// Strumenti: squadre bilanciate, quiz del gruppo, invito da calendario (.ics),
// importazione della collezione di BoardGameGeek (file CSV) e geometria della ruota.
import { buildAllTime, nightsByDate, seasonTables } from './stats.js';

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ---------------------------------------------------------------------------
// Squadre bilanciate
// ---------------------------------------------------------------------------

/**
 * Divide i giocatori in n squadre equilibrate: si ordinano per "forza" (percentuale di vittorie
 * nello storico più quelle di stasera, con un pizzico di caso) e si distribuiscono a serpentina.
 * skill: { uid: numero 0..1 }.
 */
export function balancedTeams(uids, n = 2, skill = {}) {
  const k = Math.max(2, Math.min(n, uids.length));
  const ranked = shuffle(uids).map((u) => ({ u, s: (Number(skill[u]) || 0) + Math.random() * 0.08 })).sort((a, b) => b.s - a.s);
  const teams = Array.from({ length: k }, () => []);
  const sums = Array(k).fill(0);
  ranked.forEach((p, i) => {
    const round = Math.floor(i / k);
    const pos = i % k;
    const t = round % 2 === 0 ? pos : k - 1 - pos;
    teams[t].push(p.u);
    sums[t] += p.s;
  });
  return teams;
}

export const TEAM_STYLE = [
  { name: 'Rossi', color: '#FF5A4E', icon: '🔥' },
  { name: 'Blu', color: '#4D96FF', icon: '🌊' },
  { name: 'Verdi', color: '#8AC926', icon: '🌿' },
  { name: 'Gialli', color: '#FFC93C', icon: '⚡' }
];

/** Forza di ogni giocatore presente: vittorie / partite nello storico (con un minimo di partite), più stasera. */
export function skillMap(players, nights, tonightWins = {}, personKey) {
  const stats = {};
  for (const n of nightsByDate(nights)) {
    for (const [k, pp] of Object.entries(n.people || {})) {
      const s = (stats[k] ||= { w: 0, g: 0 });
      s.w += Number(pp.wins) || 0;
      s.g += Number(pp.games) || 0;
    }
  }
  const out = {};
  for (const [uid, p] of Object.entries(players || {})) {
    const s = stats[personKey(p)] || { w: 0, g: 0 };
    out[uid] = (s.w + 1) / (s.g + 3) + (Number(tonightWins[uid]) || 0) * 0.05;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ruota (giochi e "chi inizia")
// ---------------------------------------------------------------------------

/** Angolo finale della ruota per far fermare la freccia (in alto) sullo spicchio i di n. */
export function wheelTarget(i, n, current = 0, turns = 6) {
  const slice = 360 / n;
  const jitter = (Math.random() - 0.5) * slice * 0.6;
  const want = 360 - (i * slice + slice / 2) + jitter;
  const base = Math.ceil(current / 360) * 360 + turns * 360;
  return base + ((want % 360) + 360) % 360;
}

/** Sfondo a spicchi colorati per la ruota (conic-gradient). */
export function wheelGradient(colors) {
  const n = colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${(i * 360) / n}deg ${((i + 1) * 360) / n}deg`).join(', ')})`;
}

// ---------------------------------------------------------------------------
// Quiz del gruppo (domande dallo storico) + domande ludiche fisse
// ---------------------------------------------------------------------------

const BANK = [
  { q: 'In che anno è uscito I Coloni di Catan?', a: '1995', o: ['1989', '2001', '2008'] },
  { q: 'Chi ha inventato I Coloni di Catan?', a: 'Klaus Teuber', o: ['Reiner Knizia', 'Uwe Rosenberg', 'Alan R. Moon'] },
  { q: 'Chi ha creato Codenames?', a: 'Vlaada Chvátil', o: ['Antoine Bauza', 'Matt Leacock', 'Bruno Cathala'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2010?', a: 'Dixit', o: ['Carcassonne', 'Azul', 'Hanabi'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2018?', a: 'Azul', o: ['Kingdomino', 'Codenames', 'Just One'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2019?', a: 'Just One', o: ['Azul', 'Cascadia', 'Dixit'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2022?', a: 'Cascadia', o: ['MicroMacro', 'Dorfromantik', 'Sky Team'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2004?', a: 'Ticket to Ride', o: ['Carcassonne', 'I Coloni di Catan', 'Dixit'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2001?', a: 'Carcassonne', o: ['Ticket to Ride', 'Bohnanza', 'Hanabi'] },
  { q: 'Chi ha creato Pandemic?', a: 'Matt Leacock', o: ['Klaus Teuber', 'Jamey Stegmaier', 'Vlaada Chvátil'] },
  { q: 'Chi ha creato Ticket to Ride?', a: 'Alan R. Moon', o: ['Bruno Faidutti', 'Klaus-Jürgen Wrede', 'Reiner Knizia'] },
  { q: 'Chi ha creato Carcassonne?', a: 'Klaus-Jürgen Wrede', o: ['Michael Kiesling', 'Klaus Teuber', 'Antoine Bauza'] },
  { q: 'Chi ha creato Azul?', a: 'Michael Kiesling', o: ['Uwe Rosenberg', 'Matt Leacock', 'Alan R. Moon'] },
  { q: 'Da quale gioco nasce il Monopoly?', a: 'The Landlord’s Game', o: ['Il gioco dell’oca', 'Sorry!', 'Scarabeo'] },
  { q: 'Quante facce ha il dado dei giochi di ruolo più famoso, il d20?', a: '20', o: ['12', '10', '24'] },
  { q: 'Quante carte ha un mazzo francese senza jolly?', a: '52', o: ['40', '54', '48'] },
  { q: 'Quante caselle ha una scacchiera?', a: '64', o: ['49', '81', '100'] },
  { q: 'Quanti pezzi ha ogni giocatore a scacchi?', a: '16', o: ['12', '14', '18'] },
  { q: 'Quante carte ci sono in un mazzo classico di UNO?', a: '108', o: ['100', '112', '96'] },
  { q: 'Quante tessere ha un set di Mahjong?', a: '144', o: ['108', '136', '160'] },
  { q: 'Quanti blocchi ha una torre di Jenga?', a: '54', o: ['48', '60', '42'] },
  { q: 'Quante carte ha Dobble (Spot It!)?', a: '55', o: ['50', '57', '62'] },
  { q: 'Quanti simboli ci sono su ogni carta di Dobble?', a: '8', o: ['6', '7', '10'] },
  { q: 'Quante pedine ha ogni giocatore a backgammon?', a: '15', o: ['12', '16', '10'] },
  { q: 'Su che griglia si gioca a Go (tavoliere classico)?', a: '19 × 19', o: ['15 × 15', '21 × 21', '13 × 13'] },
  { q: 'Chi ha inventato Risiko (La Conquête du Monde)?', a: 'Albert Lamorisse', o: ['Anthony Pratt', 'Alfred Butts', 'Merle Robbins'] },
  { q: 'Chi ha inventato Cluedo?', a: 'Anthony Pratt', o: ['Albert Lamorisse', 'Klaus Teuber', 'Elizabeth Magie'] },
  { q: 'Quante stanze ci sono nella villa di Cluedo?', a: '9', o: ['6', '8', '12'] },
  { q: 'Chi ha inventato lo Scarabeo/Scrabble?', a: 'Alfred Mosher Butts', o: ['Merle Robbins', 'Anthony Pratt', 'Albert Lamorisse'] },
  { q: 'Chi ha creato Dixit?', a: 'Jean-Louis Roubira', o: ['Antoine Bauza', 'Bruno Cathala', 'Vlaada Chvátil'] },
  { q: 'Quale gioco cooperativo ha vinto lo Spiel des Jahres nel 2013?', a: 'Hanabi', o: ['Pandemic', 'The Crew', 'Just One'] },
  { q: 'Quale gioco ha vinto lo Spiel des Jahres nel 2024?', a: 'Sky Team', o: ['Dorfromantik', 'Cascadia', 'MicroMacro'] }
];

const pick = (list, n) => shuffle(list).slice(0, n);
/** "a Dixit", ma "ad Azul" (davanti a una a). */
const aDi = (name) => (/^[aàAÀ]/.test(String(name)) ? `ad ${name}` : `a ${name}`);

/** Una domanda con la risposta giusta e fino a 3 sbagliate (testi diversi), rimescolate. */
function make(kind, q, right, wrong) {
  const opts = [...new Set(wrong.map(String))].filter((w) => w !== String(right)).slice(0, 3);
  if (opts.length < 1) return null;
  const options = shuffle([String(right), ...opts]);
  return { kind, q, options, correct: options.indexOf(String(right)) };
}

/** Domande sul gruppo: dalla classifica di sempre, dalle stagioni e dalla serata in corso. */
export function groupQuestions({ nights = {}, library = {}, board = [], names = {} } = {}) {
  const out = [];
  const at = buildAllTime(nights, library);
  const people = [...new Set([...at.wins.map((w) => w.name), ...at.mvp.map((m) => m.name)])];
  const games = at.games.map((g) => g.name);
  if (at.games.length >= 2 && at.games[0].rank === 1 && at.games[1].rank !== 1) out.push(make('group', 'Quale gioco ha la media più alta di sempre nel gruppo?', at.games[0].name, games.slice(1)));
  if (at.wins.length >= 2 && at.wins[0].wins > at.wins[1].wins) out.push(make('group', 'Chi ha vinto più partite di sempre?', at.wins[0].name, people.filter((p) => p !== at.wins[0].name)));
  if (at.mvp.length >= 2 && at.mvp[0].votes > at.mvp[1].votes) out.push(make('group', 'Chi ha ricevuto più voti MVP di sempre?', at.mvp[0].name, people.filter((p) => p !== at.mvp[0].name)));
  if (at.mostPlayed.length >= 2 && at.mostPlayed[0].nights > at.mostPlayed[1].nights) out.push(make('group', 'Qual è il gioco giocato in più serate?', at.mostPlayed[0].name, at.mostPlayed.slice(1).map((g) => g.name)));
  const n = nightsByDate(nights).length;
  if (n >= 3) out.push(make('group', 'Quante serate ha fatto il gruppo finora?', n, [n - 2, n + 1, n + 3, n - 1].filter((x) => x > 0)));
  const season = seasonTables(nights)[0];
  if (season && season.rows.length >= 2 && season.rows[0].rank === 1 && season.rows[1].rank !== 1) out.push(make('group', `Chi è in testa alla stagione ${season.name}?`, season.rows[0].name, season.rows.slice(1).map((r) => r.name)));
  // Stasera
  if (board.length >= 2 && board[0].rank === 1 && board[1].rank !== 1) out.push(make('tonight', 'Quale gioco è primo stasera?', board[0].name, board.slice(1).map((r) => r.name)));
  for (const r of board.slice(0, 4)) {
    const list = r.stats?.list || [];
    if (list.length < 3) continue;
    const max = Math.max(...list.map((v) => v.overall));
    const top = list.filter((v) => v.overall === max);
    if (top.length === 1 && names[top[0].uid]) {
      out.push(make('tonight', `Chi ha dato il voto più alto ${aDi(r.name)}?`, names[top[0].uid], list.filter((v) => v !== top[0]).map((v) => names[v.uid]).filter(Boolean)));
    }
    const avg = Math.round(r.stats.avg * 10) / 10;
    const f = (x) => x.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    out.push(make('tonight', `Che media ha preso ${r.name} stasera?`, f(avg), [avg - 1.2, avg + 0.8, avg - 0.5, avg + 1.5].filter((x) => x >= 1 && x <= 10).map(f)));
  }
  return out.filter(Boolean);
}

/** Round di quiz: fino a metà domande sul gruppo, il resto dalla banca delle curiosità ludiche. */
export function buildQuizRound(ctx, count = 5) {
  const group = pick(groupQuestions(ctx), Math.ceil(count * 0.6));
  const trivia = pick(BANK, count - group.length).map((b) => make('trivia', b.q, b.a, b.o));
  return shuffle([...group, ...trivia]).slice(0, count);
}

// ---------------------------------------------------------------------------
// Invito da calendario (.ics)
// ---------------------------------------------------------------------------

const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** File .ics della prossima serata (si apre con il calendario del telefono o del computer). */
export function nextNightICS({ at, place = '', note = '', group = 'Game Night', hours = 4, url = '' }) {
  const start = Number(at);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GameNight_Show//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gnr-${start}-${Math.random().toString(36).slice(2, 8)}@gamenight-show`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(start + hours * 3600000)}`,
    `SUMMARY:${icsText(`🎲 Game Night · ${group}`)}`,
    place ? `LOCATION:${icsText(place)}` : '',
    `DESCRIPTION:${icsText([note, url ? `Classifiche e armadio dei giochi: ${url}` : ''].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('Stasera Game Night!')}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Collezione di BoardGameGeek (file CSV esportato dal sito) o CSV generico
// ---------------------------------------------------------------------------

/** Lettore CSV con virgolette, virgole e a capo dentro i campi. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const num = (v, lo, hi) => {
  const n = Math.round(Number(String(v || '').replace(',', '.')));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/**
 * Giochi da un CSV: quello di BoardGameGeek (Collezione › Esporta: colonne objectname, minplayers,
 * maxplayers, playingtime, yearpublished, own…) oppure uno semplice con le colonne nome/giocatori/durata.
 * Restituisce { items, source, skipped }.
 */
export function gamesFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { items: [], source: null, skipped: 0 };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iName = col('objectname', 'name', 'nome', 'gioco', 'titolo', 'game');
  if (iName < 0) return { items: [], source: null, skipped: rows.length - 1 };
  const bgg = head.includes('objectname');
  const iMin = col('minplayers', 'min', 'giocatori min', 'min giocatori');
  const iMax = col('maxplayers', 'max', 'giocatori max', 'max giocatori');
  const iTime = col('playingtime', 'maxplaytime', 'durata', 'minuti', 'duration');
  const iYear = col('yearpublished', 'anno', 'year');
  const iOwn = col('own');
  const iWeight = col('avgweight', 'peso', 'weight');
  const items = [];
  let skipped = 0;
  const seen = new Set();
  for (const r of rows.slice(1)) {
    const name = String(r[iName] || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name || (iOwn >= 0 && String(r[iOwn]).trim() === '0')) { skipped++; continue; }
    const k = name.toLowerCase();
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    const it = { name };
    const mn = iMin >= 0 ? num(r[iMin], 1, 20) : null;
    const mx = iMax >= 0 ? num(r[iMax], 1, 20) : null;
    if (mn) it.minPlayers = mn;
    if (mx && (!mn || mx >= mn)) it.maxPlayers = mx;
    const d = iTime >= 0 ? num(r[iTime], 1, 600) : null;
    if (d) it.duration = d;
    const y = iYear >= 0 ? num(r[iYear], 1900, 2100) : null;
    if (y) it.year = y;
    const w = iWeight >= 0 ? Number(String(r[iWeight] || '').replace(',', '.')) : NaN;
    if (w >= 1 && w <= 5) it.weight = Math.round(w * 10) / 10;
    items.push(it);
  }
  return { items, source: bgg ? 'bgg' : 'csv', skipped };
}
