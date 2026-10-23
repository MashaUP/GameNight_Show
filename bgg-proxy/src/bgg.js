// Lettura delle risposte XML di BoardGameGeek (XML API2) senza librerie: nei Worker non c'è DOMParser.
// Si estraggono solo i campi che servono a GameNight Show, senza modificarne il contenuto.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };

/** Decodifica le entità XML/HTML (&amp; &#039; &#x27; …). */
export function decode(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Valore di un attributo dentro un tag aperto (`<name type="primary" value="Catan"/>`). */
export function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[2] ?? m[3] ?? '') : null;
}

/** Tutti i tag aperti con quel nome (anche quelli che si chiudono da soli). */
function tags(xml, name) {
  return String(xml).match(new RegExp(`<${name}(?=[\\s/>])[^>]*>`, 'gi')) || [];
}

/** Blocchi <item …>…</item> con il loro tag di apertura. */
function items(xml) {
  const out = [];
  const re = /<item(?=[\s>])([^>]*)>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) out.push({ head: `<item${m[1]}>`, body: m[2] });
  return out;
}

const text = (body, name) => {
  const m = new RegExp(`<${name}(?=[\\s>])[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(body);
  return m ? decode(m[1].trim()) : null;
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const valueOf = (body, name) => {
  const t = tags(body, name)[0];
  return t ? attr(t, 'value') : null;
};
const posInt = (v) => {
  const n = num(v);
  return n && n > 0 ? Math.round(n) : null;
};
const httpsUrl = (u) => {
  const s = String(u || '').trim();
  if (!s) return null;
  const full = s.startsWith('//') ? `https:${s}` : s;
  return /^https:\/\/[^\s"'<>]+$/.test(full) ? full : null;
};

/** La risposta è XML di BGG? (BGG a volte risponde con una pagina HTML di errore) */
export function looksLikeItems(xml) {
  return /<items[\s>]/i.test(String(xml || ''));
}

/** Messaggio d'errore dentro l'XML (`<errors><error><message>…`). */
export function xmlError(xml) {
  const m = /<error[^>]*>[\s\S]*?<message>([\s\S]*?)<\/message>/i.exec(String(xml || ''));
  return m ? decode(m[1].trim()) : null;
}

/** Risultati di /xmlapi2/search: id, nome, anno, tipo. */
export function parseSearch(xml) {
  if (!looksLikeItems(xml)) throw Object.assign(new Error('bad_xml'), { code: 'bgg_bad_response' });
  return items(xml).map(({ head, body }) => {
    const names = tags(body, 'name');
    const primary = names.find((t) => attr(t, 'type') === 'primary') || names[0];
    return {
      id: posInt(attr(head, 'id')),
      type: attr(head, 'type') || 'boardgame',
      name: primary ? attr(primary, 'value') : null,
      year: posInt(valueOf(body, 'yearpublished'))
    };
  }).filter((x) => x.id && x.name);
}

/** Numero di giocatori consigliato (sondaggio "suggested_numplayers"): migliori e consigliati. */
function playerPoll(body) {
  const poll = /<poll[^>]*name="suggested_numplayers"[^>]*>([\s\S]*?)<\/poll>/i.exec(body);
  if (!poll) return { best: [], rec: [], votes: 0 };
  const votes = num(attr(/<poll[^>]*>/i.exec(poll[0])[0], 'totalvotes')) || 0;
  const best = [], rec = [];
  const re = /<results[^>]*numplayers="([^"]+)"[^>]*>([\s\S]*?)<\/results>/gi;
  let m;
  while ((m = re.exec(poll[1]))) {
    const n = Number(String(m[1]).replace('+', ''));
    if (!Number.isFinite(n) || /\+/.test(m[1])) continue; // "8+" non è un numero preciso
    const r = {};
    for (const t of tags(m[2], 'result')) r[attr(t, 'value')] = num(attr(t, 'numvotes')) || 0;
    const b = r.Best || 0, rc = r.Recommended || 0, nr = r['Not Recommended'] || 0;
    const tot = b + rc + nr;
    if (!tot) continue;
    if (b >= rc && b >= nr) best.push(n);
    if (b + rc > nr) rec.push(n);
  }
  return { best, rec, votes };
}

/** Schede di /xmlapi2/thing (con stats=1): i soli campi usati da GameNight Show. */
export function parseThings(xml) {
  if (!looksLikeItems(xml)) throw Object.assign(new Error('bad_xml'), { code: 'bgg_bad_response' });
  return items(xml).map(({ head, body }) => {
    const id = posInt(attr(head, 'id'));
    const type = attr(head, 'type') || 'boardgame';
    const names = tags(body, 'name');
    const primary = names.find((t) => attr(t, 'type') === 'primary') || names[0];
    const alt = names.filter((t) => t !== primary).map((t) => attr(t, 'value')).filter(Boolean).slice(0, 8);
    const links = tags(body, 'link').map((t) => ({ type: attr(t, 'type'), id: posInt(attr(t, 'id')), name: attr(t, 'value'), inbound: attr(t, 'inbound') === 'true' }));
    const pick = (ty, max) => links.filter((l) => l.type === ty && l.name).slice(0, max);
    const poll = playerPoll(body);
    const ratings = /<ratings[^>]*>([\s\S]*?)<\/ratings>/i.exec(body)?.[1] || '';
    const weight = num(valueOf(ratings, 'averageweight'));
    const usersRated = num(valueOf(ratings, 'usersrated')) || 0;
    const rating = num(valueOf(ratings, 'average'));
    const minTime = posInt(valueOf(body, 'minplaytime'));
    const maxTime = posInt(valueOf(body, 'maxplaytime'));
    const isExpansion = type === 'boardgameexpansion';
    return {
      id,
      type,
      isExpansion,
      name: primary ? attr(primary, 'value') : null,
      alt,
      year: posInt(valueOf(body, 'yearpublished')),
      minPlayers: posInt(valueOf(body, 'minplayers')),
      maxPlayers: posInt(valueOf(body, 'maxplayers')),
      bestPlayers: poll.best,
      recPlayers: poll.rec,
      pollVotes: poll.votes,
      time: posInt(valueOf(body, 'playingtime')),
      minTime,
      maxTime,
      minAge: posInt(valueOf(body, 'minage')),
      weight: weight && weight > 0 ? Math.round(weight * 100) / 100 : null,
      rating: rating && usersRated ? Math.round(rating * 100) / 100 : null,
      usersRated,
      categories: pick('boardgamecategory', 8).map((l) => l.name),
      mechanics: pick('boardgamemechanic', 10).map((l) => l.name),
      expansions: links.filter((l) => l.type === 'boardgameexpansion' && !l.inbound && l.id).slice(0, 40).map((l) => ({ id: l.id, name: l.name })),
      baseGames: isExpansion ? links.filter((l) => l.type === 'boardgameexpansion' && l.inbound && l.id).slice(0, 5).map((l) => ({ id: l.id, name: l.name })) : [],
      image: httpsUrl(text(body, 'image')),
      thumb: httpsUrl(text(body, 'thumbnail')),
      url: id ? `https://boardgamegeek.com/${isExpansion ? 'boardgameexpansion' : 'boardgame'}/${id}` : null
    };
  }).filter((x) => x.id && x.name);
}

/**
 * Ordina i risultati di una ricerca: prima il nome identico, poi quelli che iniziano con il testo cercato,
 * poi i più valutati su BGG (di solito il gioco base prima delle espansioni e delle edizioni rare).
 */
export function rankResults(list, query) {
  const q = norm(query);
  const score = (x) => {
    const n = norm(x.name);
    const alts = (x.alt || []).map(norm);
    let s = 0;
    if (n === q) s += 1e9;
    else if (alts.includes(q)) s += 5e8;
    else if (n.startsWith(q)) s += 1e8;
    else if (alts.some((a) => a.startsWith(q))) s += 5e7;
    if (!x.isExpansion && x.type !== 'boardgameexpansion') s += 1e6;
    s += Math.min(999999, Number(x.usersRated) || 0);
    return s;
  };
  return [...list].sort((a, b) => score(b) - score(a));
}

/** Testo di ricerca normalizzato (minuscole, senza accenti né spazi doppi). */
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
