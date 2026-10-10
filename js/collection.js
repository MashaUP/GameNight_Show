// Armadio organizzato (1.2): funzioni sui dati dell'armadio, senza interfaccia.
// Le usano la pagina dell'armadio (js/armadio.js), la TV (js/host.js), il telefono (js/play.js)
// e la pagina per aggiungere giochi dal telefono (js/library.js).
//
// Dati (armadi/<codice>/…):
//   info            nome, descrizione, icona, proprietario
//   library/<id>    i giochi: dati leggeri + miniatura "thumb" (≈8 KB)
//   images/<id>     la foto grande (640×480), scaricata solo quando si apre la scheda
//   loans/<id>      prestiti (attivi e passati)             — solo proprietario e collaboratori
//   log/<id>        cronologia delle modifiche              — solo proprietario e collaboratori
//   trash/<id>      cestino, con ripristino                 — solo proprietario e collaboratori
//   share           token del link pubblico                 — solo proprietario e collaboratori
//   invites/<code>  inviti per diventare collaboratori      — li crea il proprietario
// pub/<token>       copia in sola lettura dei soli campi scelti, per il link pubblico
import { armadioRef, dbRef, get, set, update, remove, push } from './fb.js';
import { cleanName, dbKey } from './util.js';
import { tagsOf, isAvailable, GAME_STATUS, GAME_MODES } from './stats.js';

export const THUMB_W = 240;
export const THUMB_H = 180;
const CODE6 = /^[A-Z0-9]{6}$/;

// ---------------------------------------------------------------------------
// Posizione fisica
// ---------------------------------------------------------------------------

export const LOC_KEYS = ['room', 'unit', 'shelf', 'box'];
export const LOC_LABELS = { room: 'Stanza', unit: 'Mobile', shelf: 'Ripiano', box: 'Contenitore' };
export const LOC_HINTS = { room: 'Es. Soggiorno', unit: 'Es. Libreria grande', shelf: 'Es. Ripiano 2', box: 'Es. Scatola rossa' };

export function cleanLoc(loc) {
  const out = {};
  for (const k of LOC_KEYS) { const v = cleanName(loc?.[k] || '', 30); if (v) out[k] = v; }
  return Object.keys(out).length ? out : null;
}
export function hasLoc(it) { return Boolean(cleanLoc(it?.loc)); }
export function locText(loc, sep = ' › ') {
  const c = cleanLoc(loc);
  return c ? LOC_KEYS.filter((k) => c[k]).map((k) => c[k]).join(sep) : '';
}
/** Chiave per raggruppare per scaffale (stanza › mobile › ripiano, senza il contenitore). */
export function shelfKey(it) {
  const c = cleanLoc(it?.loc);
  if (!c) return '';
  return ['room', 'unit', 'shelf'].filter((k) => c[k]).map((k) => c[k]).join(' › ') || c.box || '';
}

// ---------------------------------------------------------------------------
// Titoli, edizioni, duplicati
// ---------------------------------------------------------------------------

const EDITION_WORDS = /\b(edizione|edition|ed\.|deluxe|big box|bigbox|ristampa|reprint|revised|riveduta|nuova|new|seconda|second|terza|third|2a|2nd|3a|3rd|anniversary|anniversario|collector'?s?|collezionista|italiana|italian|english|inglese|kickstarter|ks)\b/g;

/** Titolo confrontabile: minuscole, senza accenti, punteggiatura e parole d'edizione. */
export function normTitle(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ').replace(/[^a-z0-9: -]+/g, ' ').replace(EDITION_WORDS, ' ').replace(/\s+/g, ' ').trim();
}
/** Titolo senza sottotitolo ("Dixit: Odyssey" → "dixit"). */
export function baseTitle(s) {
  return normTitle(s).split(/:| - /)[0].trim();
}

/**
 * Possibili duplicati (solo con i dati dell'armadio, niente cancellazioni automatiche).
 * Restituisce coppie { a, b, kind, why }:
 *   dup      stesso gioco inserito due volte
 *   edition  stesso gioco, edizione/lingua/anno diversi
 *   similar  nomi simili ma giochi diversi (o forse un'espansione)
 * Le coppie segnate come "va bene così" (dupOk) non compaiono.
 */
export function duplicatePairs(lib) {
  // Titoli normalizzati calcolati una volta sola: con centinaia di giochi il confronto a coppie resta veloce
  const items = Object.entries(lib || {}).filter(([, it]) => it?.name).map(([id, it]) => ({ id, ...it, _n: normTitle(it.name), _o: it.orig ? normTitle(it.orig) : '', _b: baseTitle(it.name) }));
  const pairs = [];
  const ok = (a, b) => a.dupOk?.[b.id] || b.dupOk?.[a.id];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]; const b = items[j];
      if (ok(a, b) || a.baseId === b.id || b.baseId === a.id) continue;
      const diff = [];
      if ((a.edition || '') !== (b.edition || '') && (a.edition || b.edition)) diff.push('edizione');
      if ((a.language || '').toLowerCase() !== (b.language || '').toLowerCase() && a.language && b.language) diff.push('lingua');
      if (a.year && b.year && a.year !== b.year) diff.push('anno');
      const sameId = (a.ean && a.ean === b.ean) || (a.extId && a.extId === b.extId);
      const sameTitle = a._n === b._n || (a._o && a._o === b._n) || (b._o && b._o === a._n);
      if (sameId || sameTitle) {
        pairs.push({ a: a.id, b: b.id, kind: diff.length ? 'edition' : 'dup', why: sameId ? 'stesso codice a barre o identificativo' : diff.length ? `stesso titolo, ${diff.join(', ')} divers${diff.length > 1 ? 'i' : 'a'}` : 'stesso titolo' });
        continue;
      }
      const ba = a._b; const bb = b._b;
      if (ba && ba.length >= 3 && ba === bb) pairs.push({ a: a.id, b: b.id, kind: 'similar', why: 'nome simile: giochi diversi o forse un’espansione' });
    }
  }
  return pairs;
}
export const DUP_KINDS = { dup: 'Possibile duplicato', edition: 'Edizione diversa', similar: 'Nome simile' };
export function duplicateIds(lib) {
  const s = new Set();
  for (const p of duplicatePairs(lib)) if (p.kind !== 'similar') { s.add(p.a); s.add(p.b); }
  return s;
}

// ---------------------------------------------------------------------------
// Schede incomplete
// ---------------------------------------------------------------------------

export const CHECK_FIELDS = [
  { k: 'players', label: 'numero di giocatori', test: (it) => Boolean(it.minPlayers || it.maxPlayers) },
  { k: 'duration', label: 'durata', test: (it) => Boolean(it.duration) },
  { k: 'mode', label: 'tipologia', test: (it) => Boolean(it.mode) },
  { k: 'weight', label: 'difficoltà', test: (it) => Boolean(it.weight) },
  { k: 'loc', label: 'posizione', test: (it) => hasLoc(it) },
  { k: 'photo', label: 'foto', test: (it) => Boolean(it.thumb || it.image) }
];
export function missingFields(it) {
  return CHECK_FIELDS.filter((f) => !f.test(it || {})).map((f) => f.k);
}

// ---------------------------------------------------------------------------
// Filtri, ordinamento
// ---------------------------------------------------------------------------

/** Espansioni di un gioco (stesso armadio). */
export function expansionsOf(lib, id) {
  return Object.entries(lib || {}).filter(([, it]) => it?.baseId === id).map(([eid, it]) => ({ id: eid, ...it }));
}

/** Disponibile: non venduto/non disponibile e con almeno una copia in casa (con più copie se ne può prestare una). */
export function available(it) {
  return isAvailable(it) && (!it?.loanId || (Number(it?.copies) || 1) > 1);
}

/**
 * f: { text, players, durMin, durMax, mode, wMin, wMax, lang, avail, status, owner, room, unit,
 *      exp ('base'|'exp'|'hasExp'), loaned, noLoc, incomplete, dups, isNew, tag }
 * ctx: { lib, dupIds }
 */
export function applyFilters(items, f, ctx = {}) {
  const text = normTitle(f.text || '');
  const raw = String(f.text || '').trim().toLowerCase();
  const n = Number(f.players) || 0;
  return items.filter((it) => {
    if (raw) {
      const hay = `${normTitle(it.name)} ${normTitle(it.orig || '')} ${tagsOf(it).join(' ').toLowerCase()} ${(it.publisher || '').toLowerCase()} ${locText(it.loc).toLowerCase()} ${(it.ean || '')}`;
      if (!hay.includes(text) && !hay.includes(raw)) return false;
    }
    const min = Number(it.minPlayers) || 0; const max = Number(it.maxPlayers) || 0;
    if (n && ((min && n < min) || (max && n > max) || (!min && !max))) return false;
    const dur = Number(it.duration) || 0;
    if (f.durMin && (!dur || dur < f.durMin)) return false;
    if (f.durMax && (!dur || dur > f.durMax)) return false;
    if (f.mode && it.mode !== f.mode) return false;
    const w = Number(it.weight) || 0;
    if (f.wMin && (!w || w < f.wMin)) return false;
    if (f.wMax && (!w || w > f.wMax)) return false;
    if (f.lang && (it.language || '').toLowerCase() !== f.lang.toLowerCase()) return false;
    if (f.avail === 'si' && !available(it)) return false;
    if (f.avail === 'no' && available(it)) return false;
    if (f.status && (it.status || 'posseduto') !== f.status) return false;
    if (f.owner && (it.owner || '') !== f.owner) return false;
    if (f.room && (it.loc?.room || '') !== f.room) return false;
    if (f.unit && (it.loc?.unit || '') !== f.unit) return false;
    if (f.shelf && shelfKey(it) !== f.shelf) return false;
    if (f.exp === 'base' && it.baseId) return false;
    if (f.exp === 'exp' && !it.baseId) return false;
    if (f.exp === 'hasExp' && !expansionsOf(ctx.lib, it.id).length) return false;
    if (f.loaned && !(it.loanId || it.status === 'prestato')) return false;
    if (f.noLoc && hasLoc(it)) return false;
    if (f.incomplete && !missingFields(it).length) return false;
    if (f.dups && !ctx.dupIds?.has(it.id)) return false;
    if (f.isNew && !it.isNew) return false;
    if (f.tag && !tagsOf(it).some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
    return true;
  });
}

export const FILTER_LABELS = {
  players: (v) => `${v} giocatori`, durMin: (v) => `da ${v} min`, durMax: (v) => `fino a ${v} min`,
  mode: (v) => GAME_MODES[v] || v, wMin: (v) => `difficoltà ≥ ${v}`, wMax: (v) => `difficoltà ≤ ${v}`,
  lang: (v) => `lingua: ${v}`, avail: (v) => (v === 'si' ? 'disponibili' : 'non disponibili'),
  status: (v) => GAME_STATUS[v] || v, owner: (v) => `di ${v}`, room: (v) => `in ${v}`, unit: (v) => `nel mobile ${v}`, shelf: (v) => `📍 ${v}`,
  exp: (v) => ({ base: 'solo giochi base', exp: 'solo espansioni', hasExp: 'con espansioni' })[v] || v,
  loaned: () => 'prestati', noLoc: () => 'senza posizione', incomplete: () => 'schede incomplete',
  dups: () => 'possibili duplicati', isNew: () => 'nuovi, da provare', tag: (v) => `#${v}`
};
export function activeFilters(f) {
  return Object.entries(f || {}).filter(([k, v]) => k !== 'text' && FILTER_LABELS[k] && v !== '' && v !== null && v !== undefined && v !== false && v !== 0)
    .map(([k, v]) => ({ k, label: FILTER_LABELS[k](v) }));
}

export const SORTS = {
  name: 'Nome (A–Z)', '-name': 'Nome (Z–A)', '-added': 'Aggiunti di recente', added: 'Aggiunti per primi',
  duration: 'Durata (più brevi)', '-duration': 'Durata (più lunghi)', players: 'Giocatori (minimo)',
  loc: 'Posizione', owner: 'Proprietario', status: 'Stato', '-updated': 'Modificati di recente'
};
/** Ordina; i valori mancanti vanno sempre in fondo, a parità di valore si ordina per nome. */
export function sortItems(items, sort = 'name') {
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'it', { sensitivity: 'base' });
  const val = (it) => {
    switch (key) {
      case 'name': return null;
      case 'added': return Number(it.addedAt) || null;
      case 'updated': return Number(it.updatedAt || it.addedAt) || null;
      case 'duration': return Number(it.duration) || null;
      case 'players': return Number(it.minPlayers || it.maxPlayers) || null;
      case 'loc': return locText(it.loc).toLowerCase() || null;
      case 'owner': return (it.owner || '').toLowerCase() || null;
      case 'status': return it.loanId ? 'prestato' : (it.status || 'posseduto');
      default: return null;
    }
  };
  return [...items].sort((a, b) => {
    if (key === 'name') return desc ? byName(b, a) : byName(a, b);
    const va = val(a); const vb = val(b);
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it');
    return (desc ? -c : c) || byName(a, b);
  });
}

// ---------------------------------------------------------------------------
// Immagini: miniatura nell'elenco, foto grande a parte
// ---------------------------------------------------------------------------

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('immagine non leggibile'));
    img.src = src;
  });
}

/** Miniatura 240×180 (≈6–10 KB). Le foto da link non copiabili restano il link stesso. */
export async function makeThumb(src) {
  if (!src || typeof src !== 'string') return null;
  if (/^https?:\/\//i.test(src)) return src.length < 40000 ? src : null;
  if (!/^data:image\//.test(src)) return null;
  const img = await loadImg(src);
  const cv = document.createElement('canvas');
  cv.width = THUMB_W; cv.height = THUMB_H;
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth || img.width; const ih = img.naturalHeight || img.height;
  const k = Math.max(THUMB_W / iw, THUMB_H / ih);
  c.drawImage(img, (THUMB_W - iw * k) / 2, (THUMB_H - ih * k) / 2, iw * k, ih * k);
  let q = 0.72; let out = cv.toDataURL('image/jpeg', q);
  while (out.length > 30000 && q > 0.35) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
  return out;
}

const cache = new Map();
/** Foto grande di un gioco: quella vecchia dentro il gioco, oppure dal nodo images, oppure la miniatura. */
export async function fullImage(aid, id, it) {
  if (it?.image) return it.image;
  if (!aid || !id) return it?.thumb || null;
  const k = `${aid}/${id}`;
  if (cache.has(k)) return cache.get(k) || it?.thumb || null;
  let v = null;
  try { v = (await get(armadioRef(aid, `images/${id}`))).val(); } catch { v = null; }
  cache.set(k, v);
  return v || it?.thumb || null;
}
export function forgetImage(aid, id) { cache.delete(`${aid}/${id}`); }

/**
 * Salva un gioco dell'armadio in un'unica scrittura (più percorsi insieme).
 * patch: campi del gioco (null = togli); full: nuova foto grande (undefined = non toccarla, null = togli).
 * Restituisce l'oggetto update usato (utile per i test).
 */
export async function saveGame(aid, id, patch, { full, create = false } = {}) {
  const upd = {};
  const clean = { ...patch };
  delete clean.image;
  if (full !== undefined) {
    const thumb = full ? await makeThumb(full).catch(() => null) : null;
    upd[`images/${id}`] = full || null;
    clean.thumb = thumb;
    if (!create) upd[`library/${id}/image`] = null;
    forgetImage(aid, id);
    if (full) cache.set(`${aid}/${id}`, full);
  }
  clean.updatedAt = Date.now();
  if (create) {
    upd[`library/${id}`] = Object.fromEntries(Object.entries({ addedAt: Date.now(), ...clean }).filter(([, v]) => v !== null && v !== undefined));
  } else {
    for (const [k, v] of Object.entries(clean)) upd[`library/${id}/${k}`] = v === undefined ? null : v;
  }
  await update(armadioRef(aid), upd);
  return upd;
}
/** Nuovo id per un gioco (lo stesso formato di Firebase). */
export function newGameId(aid) { return push(armadioRef(aid, 'library')).key; }

/**
 * Migrazione graduale delle foto vecchie (dentro il gioco) verso miniatura + foto a parte.
 * Sicura: prima copia la foto, poi la rilegge per controllare, solo dopo la toglie dal gioco.
 * Se qualcosa va storto il gioco resta com'era. max: quanti giochi per volta.
 */
export async function migrateImages(aid, lib, { max = 40, onStep } = {}) {
  let done = 0; let failed = 0;
  const todo = Object.entries(lib || {}).filter(([, it]) => it?.image && typeof it.image === 'string');
  for (const [id, it] of todo.slice(0, max)) {
    try {
      const thumb = it.thumb || await makeThumb(it.image);
      await update(armadioRef(aid), { [`images/${id}`]: it.image, ...(thumb && !it.thumb ? { [`library/${id}/thumb`]: thumb } : {}) });
      const back = (await get(armadioRef(aid, `images/${id}`))).val();
      if (back !== it.image) throw new Error('copia non verificata');
      await update(armadioRef(aid), { [`library/${id}/image`]: null });
      done++;
    } catch { failed++; }
    onStep?.(done, todo.length);
  }
  return { done, failed, left: Math.max(0, todo.length - done) };
}

// ---------------------------------------------------------------------------
// Cronologia
// ---------------------------------------------------------------------------

export const OPS = {
  add: '➕ Aggiunto', edit: '✏️ Modificato', loc: '📍 Posizione', status: '🔁 Stato', exp: '🧩 Espansioni',
  lend: '🤝 Prestato', back: '↩️ Restituito', move: '🚚 Spostato', trash: '🗑️ Nel cestino', restore: '♻️ Ripristinato',
  purge: '❌ Eliminato', import: '📥 Importato', rename: '🏷️ Armadio rinominato', bulk: '🧺 Modifica multipla',
  dup: '👯 Duplicati', share: '🔗 Link pubblico', people: '👥 Persone'
};
export function logEvent(aid, ev) {
  if (!aid) return Promise.resolve();
  const rec = { at: Date.now(), op: String(ev.op || 'edit').slice(0, 20) };
  if (ev.item) rec.item = String(ev.item).slice(0, 40);
  if (ev.name) rec.name = String(ev.name).slice(0, 60);
  if (ev.msg) rec.msg = String(ev.msg).slice(0, 200);
  if (ev.by) rec.by = String(ev.by).slice(0, 40);
  return set(push(armadioRef(aid, 'log')), rec).catch(() => {});
}
/** Riepilogo leggibile delle differenze (per la cronologia, senza copiare tutto il gioco). */
export function diffSummary(before = {}, after = {}) {
  const L = { name: 'nome', minPlayers: 'giocatori min', maxPlayers: 'giocatori max', duration: 'durata', mode: 'tipologia', weight: 'difficoltà', language: 'lingua', owner: 'proprietario', status: 'stato', edition: 'edizione', year: 'anno', baseId: 'gioco base', acq: 'acquisizione', isNew: 'nuovo', copies: 'copie', tags: 'etichette', publisher: 'editore', orig: 'titolo originale', ean: 'codice a barre', rules: 'regole', video: 'video', note: 'note' };
  const out = [];
  for (const [k, lab] of Object.entries(L)) {
    const a = JSON.stringify(before[k] ?? null); const b = JSON.stringify(after[k] ?? null);
    if (k in after && a !== b) out.push(lab);
  }
  if ('loc' in after && locText(before.loc) !== locText(after.loc)) out.push(`posizione: ${locText(after.loc) || '—'}`);
  return out.join(', ');
}

// ---------------------------------------------------------------------------
// Cestino
// ---------------------------------------------------------------------------

/** Sposta nel cestino (la foto grande resta, così il ripristino è completo). */
export async function trashGame(aid, id, it, by = '') {
  const game = { ...it };
  delete game.id; delete game.image;
  await update(armadioRef(aid), { [`trash/${id}`]: { game, at: Date.now(), ...(by ? { by: by.slice(0, 40) } : {}) }, [`library/${id}`]: null });
  logEvent(aid, { op: 'trash', item: id, name: it.name, by });
}
/**
 * Ripristina dal cestino. Non sovrascrive: se c'è già un gioco con lo stesso id o lo stesso titolo
 * restituisce { conflict } e non fa niente (a meno di asCopy: true, che lo ripristina come gioco separato).
 */
export async function restoreGame(aid, id, rec, lib, { asCopy = false, by = '' } = {}) {
  const game = { ...(rec?.game || {}) };
  if (!game.name) throw new Error('Elemento del cestino non valido.');
  if (lib?.[id]) return { conflict: 'id' };
  const same = Object.entries(lib || {}).find(([, it]) => it?.name && normTitle(it.name) === normTitle(game.name));
  if (same && !asCopy) return { conflict: 'name', other: same[0] };
  if (same && asCopy) game.dupOk = { ...(game.dupOk || {}), [same[0]]: true };
  delete game.loanId;
  if (game.status === 'prestato') { game.status = 'posseduto'; delete game.loanTo; }
  game.updatedAt = Date.now();
  await update(armadioRef(aid), { [`library/${id}`]: game, [`trash/${id}`]: null });
  logEvent(aid, { op: 'restore', item: id, name: game.name, by });
  return { ok: true };
}
export async function purgeGame(aid, id, name = '', by = '') {
  await update(armadioRef(aid), { [`trash/${id}`]: null, [`images/${id}`]: null });
  forgetImage(aid, id);
  logEvent(aid, { op: 'purge', item: id, name, by });
}

// ---------------------------------------------------------------------------
// Prestiti
// ---------------------------------------------------------------------------

export const DAY = 86400000;
export function loansOf(loans, id) {
  return Object.entries(loans || {}).map(([lid, l]) => ({ id: lid, ...l })).filter((l) => l.item === id).sort((a, b) => b.start - a.start);
}
export function activeLoans(loans) {
  return Object.entries(loans || {}).map(([id, l]) => ({ id, ...l })).filter((l) => !l.ret).sort((a, b) => (a.due || Infinity) - (b.due || Infinity));
}
export function isOverdue(l, now = Date.now()) { return !l.ret && l.due && l.due < now; }

/**
 * Registra un prestito. Con più copie (copies) si possono prestare fino a quel numero;
 * altrimenti un solo prestito attivo per gioco.
 */
export async function lendGame(aid, id, it, loans, { to, toKey = '', due = null, note = '' }, by = '') {
  const name = cleanName(to, 40);
  if (!name) throw Object.assign(new Error('Scrivi a chi lo presti.'), { user: true });
  const act = loansOf(loans, id).filter((l) => !l.ret);
  const copies = Number(it.copies) || 1;
  if (act.length >= copies) throw Object.assign(new Error(copies > 1 ? `Tutte le ${copies} copie sono già in prestito.` : `È già in prestito a ${act[0].to}.`), { user: true });
  const ref = push(armadioRef(aid, 'loans'));
  const loan = { item: id, name: String(it.name).slice(0, 60), to: name, start: Date.now() };
  if (toKey) loan.toKey = String(toKey).slice(0, 60);
  if (due) loan.due = Number(due);
  if (note) loan.note = cleanName(note, 200);
  if (by) loan.by = by.slice(0, 40);
  const allOut = act.length + 1 >= copies;
  await update(armadioRef(aid), {
    [`loans/${ref.key}`]: loan,
    [`library/${id}/loanId`]: ref.key,
    [`library/${id}/loanTo`]: name.slice(0, 24),
    [`library/${id}/status`]: allOut ? 'prestato' : (it.status && it.status !== 'prestato' ? it.status : 'posseduto'),
    [`library/${id}/updatedAt`]: Date.now()
  });
  logEvent(aid, { op: 'lend', item: id, name: it.name, msg: `a ${name}${due ? `, da restituire entro il ${new Date(due).toLocaleDateString('it-IT')}` : ''}`, by });
  return ref.key;
}
export async function updateLoan(aid, lid, patch) {
  const p = {};
  if ('due' in patch) p.due = patch.due ? Number(patch.due) : null;
  if ('note' in patch) p.note = patch.note ? cleanName(patch.note, 200) : null;
  if ('to' in patch && cleanName(patch.to, 40)) p.to = cleanName(patch.to, 40);
  await update(armadioRef(aid, `loans/${lid}`), p);
}
export async function returnGame(aid, loan, it, loans, { state = 'ok', note = '' } = {}, by = '') {
  const others = loansOf(loans, loan.item).filter((l) => !l.ret && l.id !== loan.id);
  const upd = {
    [`loans/${loan.id}/ret`]: Date.now(),
    [`loans/${loan.id}/state`]: state
  };
  if (note) upd[`loans/${loan.id}/note`] = cleanName(`${loan.note ? `${loan.note} · ` : ''}${note}`, 200);
  if (it) {
    upd[`library/${loan.item}/loanId`] = others[0]?.id || null;
    upd[`library/${loan.item}/loanTo`] = others[0]?.to?.slice(0, 24) || null;
    upd[`library/${loan.item}/status`] = others.length ? (others.length >= (Number(it.copies) || 1) ? 'prestato' : 'posseduto') : 'posseduto';
    upd[`library/${loan.item}/updatedAt`] = Date.now();
  }
  await update(armadioRef(aid), upd);
  logEvent(aid, { op: 'back', item: loan.item, name: loan.name || it?.name, msg: `da ${loan.to}${state !== 'ok' ? ` (${state})` : ''}`, by });
}

// ---------------------------------------------------------------------------
// Esportazione e importazione
// ---------------------------------------------------------------------------

/** Colonne del CSV (intestazioni italiane, leggibili in Excel). */
export const CSV_COLS = [
  ['id', 'id'], ['nome', 'name'], ['titolo_originale', 'orig'], ['edizione', 'edition'], ['anno', 'year'], ['editore', 'publisher'],
  ['lingua', 'language'], ['giocatori_min', 'minPlayers'], ['giocatori_max', 'maxPlayers'], ['durata_min', 'duration'],
  ['tipologia', 'mode'], ['difficolta', 'weight'], ['etichette', 'tags'], ['stato', 'status'], ['prestato_a', 'loanTo'],
  ['proprietario', 'owner'], ['copie', 'copies'], ['stanza', 'loc.room'], ['mobile', 'loc.unit'], ['ripiano', 'loc.shelf'],
  ['contenitore', 'loc.box'], ['gioco_base', 'baseName'], ['data_acquisizione', 'acq'], ['nuovo_da_provare', 'isNew'],
  ['codice_a_barre', 'ean'], ['identificativo_esterno', 'extId'], ['video', 'video'], ['regole', 'rules'], ['preparazione', 'setup'], ['note', 'note']
];
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? x : x[k]), o); }

export function exportRows(lib) {
  return Object.entries(lib || {}).filter(([, it]) => it?.name).map(([id, it]) => ({ id, ...it, baseName: it.baseId ? (lib[it.baseId]?.name || '') : '' }));
}
/** CSV con punto e virgola e BOM: Excel in italiano lo apre già diviso in colonne, con gli accenti giusti. */
export function toCSV(lib) {
  const rows = exportRows(lib);
  const head = CSV_COLS.map(([h]) => h).join(';');
  const lines = rows.map((r) => CSV_COLS.map(([, k]) => {
    let v = getPath(r, k);
    if (k === 'tags') v = tagsOf(r).join(', ');
    if (k === 'isNew') v = r.isNew ? 'si' : '';
    if (k === 'mode') v = r.mode || '';
    return csvCell(v);
  }).join(';'));
  return `﻿${[head, ...lines].join('\r\n')}\r\n`;
}
/** JSON completo (relazioni con gli id), senza foto grandi né dati di prestito di altre persone. */
export function toJSON(info, lib, { withThumbs = false } = {}) {
  const games = exportRows(lib).map((r) => {
    const g = { ...r };
    delete g.image; delete g.loanId; delete g.dupOk; delete g.sel;
    if (!withThumbs) delete g.thumb;
    return g;
  });
  return JSON.stringify({ format: 'gamenight-armadio', version: 1, exportedAt: new Date().toISOString(), armadio: { name: info?.name || '', desc: info?.desc || '' }, games }, null, 2);
}

/** CSV robusto: separatore automatico (; , o tab), virgolette, a capo dentro le celle, BOM. */
export function parseCSV(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row); }
  return rows;
}

// Intestazioni riconosciute: le nostre, quelle di BoardGameGeek e qualche variante comune.
const HEAD_ALIASES = {
  id: ['id'], name: ['nome', 'name', 'titolo', 'title', 'gioco', 'objectname'], orig: ['titolo_originale', 'originalname', 'original'],
  edition: ['edizione', 'edition', 'version'], year: ['anno', 'year', 'yearpublished'], publisher: ['editore', 'publisher'],
  language: ['lingua', 'language'], minPlayers: ['giocatori_min', 'minplayers', 'min_players', 'min'], maxPlayers: ['giocatori_max', 'maxplayers', 'max_players', 'max'],
  duration: ['durata_min', 'durata', 'playingtime', 'duration', 'maxplaytime'], mode: ['tipologia', 'modalita', 'mode'], weight: ['difficolta', 'weight', 'avgweight'],
  tags: ['etichette', 'tags', 'categorie'], status: ['stato', 'status'], loanTo: ['prestato_a'], owner: ['proprietario', 'owner'], copies: ['copie', 'copies', 'quantity'],
  'loc.room': ['stanza', 'room'], 'loc.unit': ['mobile', 'unit', 'scaffale'], 'loc.shelf': ['ripiano', 'shelf'], 'loc.box': ['contenitore', 'box'],
  baseName: ['gioco_base', 'base'], acq: ['data_acquisizione', 'acquisizione', 'acquired', 'acquisitiondate'], isNew: ['nuovo_da_provare', 'nuovo'],
  ean: ['codice_a_barre', 'ean', 'barcode'], extId: ['identificativo_esterno', 'objectid', 'bggid'], video: ['video'], rules: ['regole', 'rules'], setup: ['preparazione', 'setup'], note: ['note', 'comment', 'notes']
};
function headMap(headers) {
  const norm = (h) => String(h || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
  const map = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [k, al] of Object.entries(HEAD_ALIASES)) if (al.includes(n) && !(k in map)) map[k] = i;
  });
  return map;
}

const MODE_ALIASES = { competitivo: 'competitivo', competitive: 'competitivo', cooperativo: 'cooperativo', cooperative: 'cooperativo', coop: 'cooperativo', squadre: 'squadre', 'a squadre': 'squadre', team: 'squadre', misto: 'misto' };
const STATUS_ALIASES = { disponibile: 'posseduto', posseduto: 'posseduto', prestato: 'prestato', 'non disponibile': 'non disponibile', venduto: 'venduto' };

/**
 * Trasforma un oggetto grezzo (riga CSV o gioco JSON) in un gioco valido per l'armadio.
 * Restituisce { game, errors, warnings }. Non si fida di niente: tipi, lunghezze e valori controllati.
 */
export function sanitizeGame(raw) {
  const errors = []; const warnings = [];
  const str = (v, n) => cleanName(v == null ? '' : String(v), n);
  const num = (v, lo, hi, label) => {
    if (v === '' || v === null || v === undefined) return null;
    const x = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(x)) { warnings.push(`${label} non valido (“${String(v).slice(0, 20)}”), ignorato`); return null; }
    if (x < lo || x > hi) { warnings.push(`${label} fuori intervallo (${x}), ignorato`); return null; }
    return x;
  };
  const g = {};
  g.name = str(raw.name, 40);
  if (!g.name) errors.push('manca il nome');
  if (raw.name && String(raw.name).trim().length > 40) warnings.push('nome accorciato a 40 caratteri');
  const set1 = (k, v) => { if (v !== null && v !== undefined && v !== '') g[k] = v; };
  set1('orig', str(raw.orig, 60));
  set1('edition', str(raw.edition, 40));
  set1('year', (() => { const y = num(raw.year, 1900, 2100, 'anno'); return y ? Math.round(y) : null; })());
  set1('publisher', str(raw.publisher, 40));
  set1('language', str(raw.language, 20));
  const mn = num(raw.minPlayers, 1, 20, 'giocatori min'); const mx = num(raw.maxPlayers, 1, 20, 'giocatori max');
  if (mn && mx && mn > mx) warnings.push('giocatori min più alto del max: scambiati');
  set1('minPlayers', mn && mx && mn > mx ? Math.round(mx) : (mn ? Math.round(mn) : null));
  set1('maxPlayers', mn && mx && mn > mx ? Math.round(mn) : (mx ? Math.round(mx) : null));
  set1('duration', (() => { const d = num(raw.duration, 1, 600, 'durata'); return d ? Math.round(d) : null; })());
  if (raw.mode) { const m = MODE_ALIASES[String(raw.mode).trim().toLowerCase()]; if (m) g.mode = m; else warnings.push(`tipologia “${String(raw.mode).slice(0, 20)}” non riconosciuta`); }
  set1('weight', (() => { const w = num(raw.weight, 1, 5, 'difficoltà'); return w ? Math.round(w * 10) / 10 : null; })());
  const tags = Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(/[,|#]/);
  const tg = [...new Set(tags.map((t) => cleanName(t, 20)).filter(Boolean))].slice(0, 8);
  if (tg.length) g.tags = tg;
  if (raw.status) { const st = STATUS_ALIASES[String(raw.status).trim().toLowerCase()]; if (st) g.status = st; else warnings.push('stato non riconosciuto, ignorato'); }
  if (g.status === 'prestato') { const lt = str(raw.loanTo, 24); if (lt) g.loanTo = lt; }
  set1('owner', str(raw.owner, 24));
  set1('copies', (() => { const c = num(raw.copies, 1, 20, 'copie'); return c ? Math.round(c) : null; })());
  const loc = cleanLoc(raw.loc || { room: raw['loc.room'], unit: raw['loc.unit'], shelf: raw['loc.shelf'], box: raw['loc.box'] });
  if (loc) g.loc = loc;
  if (raw.acq) { const a = String(raw.acq).trim(); const m = a.match(/^(\d{4})-(\d{2})-(\d{2})/) || a.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); if (m) g.acq = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; else warnings.push('data di acquisizione non valida'); }
  if (raw.isNew === true || /^(si|sì|yes|true|1|x)$/i.test(String(raw.isNew || '').trim())) g.isNew = true;
  if (raw.ean) { const e = String(raw.ean).replace(/\D/g, ''); if (/^[0-9]{8,14}$/.test(e)) g.ean = e; else warnings.push('codice a barre non valido'); }
  set1('extId', str(raw.extId, 40));
  if (raw.video) { const v = String(raw.video).trim(); if (/^https:\/\/[^\s"<>]+$/.test(v) && v.length <= 200) g.video = v; else warnings.push('link del video non valido'); }
  set1('rules', raw.rules ? String(raw.rules).trim().slice(0, 600) : null);
  set1('setup', raw.setup ? String(raw.setup).trim().slice(0, 300) : null);
  set1('note', raw.note ? String(raw.note).trim().slice(0, 300) : null);
  if (raw.thumb && typeof raw.thumb === 'string' && raw.thumb.length < 40000 && /^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/.test(raw.thumb)) g.thumb = raw.thumb;
  return { game: g, errors, warnings, baseName: str(raw.baseName, 40), srcId: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : '', baseIdSrc: typeof raw.baseId === 'string' ? raw.baseId : '' };
}

/** Legge un file (testo) JSON o CSV e restituisce le righe come oggetti grezzi. */
export function readImportFile(name, text) {
  const t = String(text || '').trim();
  if (/\.json$/i.test(name) || t.startsWith('{') || t.startsWith('[')) {
    let data;
    try { data = JSON.parse(t); } catch { throw Object.assign(new Error('Il file JSON non è leggibile (forse è incompleto).'), { user: true }); }
    const arr = Array.isArray(data) ? data : Array.isArray(data?.games) ? data.games : null;
    if (!arr) throw Object.assign(new Error('Nel JSON non trovo l’elenco dei giochi (campo “games”).'), { user: true });
    if (arr.length > 2000) throw Object.assign(new Error('Troppi giochi in un solo file (massimo 2000).'), { user: true });
    return { kind: 'JSON', rows: arr.map((x) => (x && typeof x === 'object' ? x : {})) };
  }
  const rows = parseCSV(t);
  if (rows.length < 2) throw Object.assign(new Error('Il CSV è vuoto o ha solo l’intestazione.'), { user: true });
  const map = headMap(rows[0]);
  if (!('name' in map)) throw Object.assign(new Error('Nel CSV manca la colonna con il nome del gioco (“nome”, “name” o “objectname”).'), { user: true });
  if (rows.length > 2001) throw Object.assign(new Error('Troppe righe in un solo file (massimo 2000).'), { user: true });
  return {
    kind: 'CSV',
    rows: rows.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[i] ?? '']))),
    bgg: 'name' in map && rows[0].some((h) => /objectname/i.test(h))
  };
}

/**
 * Piano dell'importazione, senza scrivere niente. mode: 'add' (prudente: solo i nuovi)
 * oppure 'merge' (aggiunge i nuovi e completa i campi vuoti di quelli già presenti).
 */
export function planImport(rows, lib, mode = 'add', { bgg = false } = {}) {
  const byNorm = new Map();
  for (const [id, it] of Object.entries(lib || {})) if (it?.name) byNorm.set(normTitle(it.name), id);
  const plan = { total: rows.length, add: [], update: [], same: [], invalid: [], dupInFile: [], warnings: 0 };
  const seen = new Map();
  rows.forEach((raw, i) => {
    const r = sanitizeGame(raw);
    if (bgg && raw.own !== undefined && String(raw.own) === '0') { plan.invalid.push({ row: i + 2, name: r.game.name || '?', why: 'non posseduto su BoardGameGeek' }); return; }
    if (r.errors.length) { plan.invalid.push({ row: i + 2, name: r.game.name || '?', why: r.errors.join(', ') }); return; }
    plan.warnings += r.warnings.length;
    const nk = normTitle(r.game.name) + (r.game.edition ? `#${normTitle(r.game.edition)}` : '');
    if (seen.has(nk)) { plan.dupInFile.push({ row: i + 2, name: r.game.name, first: seen.get(nk) }); return; }
    seen.set(nk, i + 2);
    const existing = (r.srcId && lib?.[r.srcId]?.name && normTitle(lib[r.srcId].name) === normTitle(r.game.name) ? r.srcId : null) || byNorm.get(normTitle(r.game.name));
    if (existing && (!r.game.edition || (lib[existing].edition || '') === r.game.edition)) {
      const before = lib[existing];
      const patch = {};
      for (const [k, v] of Object.entries(r.game)) {
        if (k === 'name') continue;
        const cur = before[k];
        if (cur === undefined || cur === null || cur === '' || (k === 'loc' && !hasLoc(before))) patch[k] = v;
      }
      if (mode === 'merge' && Object.keys(patch).length) plan.update.push({ id: existing, name: before.name, patch, warnings: r.warnings });
      else plan.same.push({ id: existing, name: before.name, row: i + 2 });
      return;
    }
    plan.add.push({ row: i + 2, game: r.game, warnings: r.warnings, baseName: r.baseName, srcId: r.srcId, baseIdSrc: r.baseIdSrc });
  });
  return plan;
}

/**
 * Esegue il piano (a blocchi). Restituisce { added, updated, failed, undo } dove undo serve ad annullare.
 */
export async function applyImport(aid, plan, lib, by = '') {
  const undo = { added: [], updated: [] };
  const failed = [];
  const nameToId = new Map(Object.entries(lib || {}).filter(([, it]) => it?.name).map(([id, it]) => [normTitle(it.name), id]));
  const srcToNew = new Map();
  const items = plan.add.map((a) => ({ ...a, id: newGameId(aid) }));
  for (const a of items) { nameToId.set(normTitle(a.game.name), a.id); if (a.srcId) srcToNew.set(a.srcId, a.id); }
  const chunk = 40;
  for (let i = 0; i < items.length; i += chunk) {
    const upd = {};
    for (const a of items.slice(i, i + chunk)) {
      const g = { ...a.game, addedAt: Date.now(), updatedAt: Date.now(), addedBy: (by || 'Importazione').slice(0, 24) };
      const base = (a.baseIdSrc && srcToNew.get(a.baseIdSrc)) || (a.baseName && nameToId.get(normTitle(a.baseName)));
      if (base && base !== a.id) g.baseId = base;
      upd[`library/${a.id}`] = g;
    }
    try { await update(armadioRef(aid), upd); undo.added.push(...items.slice(i, i + chunk).map((a) => a.id)); }
    catch (err) { failed.push(...items.slice(i, i + chunk).map((a) => ({ name: a.game.name, why: err?.message || 'errore' }))); }
  }
  for (const u of plan.update) {
    const before = Object.fromEntries(Object.keys(u.patch).map((k) => [k, lib[u.id]?.[k] ?? null]));
    try { await update(armadioRef(aid, `library/${u.id}`), { ...u.patch, updatedAt: Date.now() }); undo.updated.push({ id: u.id, before }); }
    catch (err) { failed.push({ name: u.name, why: err?.message || 'errore' }); }
  }
  logEvent(aid, { op: 'import', msg: `${undo.added.length} aggiunti, ${undo.updated.length} completati${failed.length ? `, ${failed.length} non importati` : ''}`, by });
  return { added: undo.added.length, updated: undo.updated.length, failed, undo };
}
/** Annulla un'importazione appena fatta (i giochi aggiunti vanno nel cestino, i completati tornano come prima). */
export async function undoImport(aid, undo, lib, by = '') {
  const upd = {};
  for (const id of undo.added) {
    const it = lib?.[id];
    if (!it) continue;
    const game = { ...it }; delete game.image;
    upd[`trash/${id}`] = { game, at: Date.now(), by: (by || 'Annulla importazione').slice(0, 40) };
    upd[`library/${id}`] = null;
  }
  for (const u of undo.updated) for (const [k, v] of Object.entries(u.before)) upd[`library/${u.id}/${k}`] = v;
  if (Object.keys(upd).length) await update(armadioRef(aid), upd);
  logEvent(aid, { op: 'import', msg: 'importazione annullata', by });
}

// ---------------------------------------------------------------------------
// Link pubblico (catalogo in sola lettura)
// ---------------------------------------------------------------------------

/** Token imprevedibile (80 bit), non derivato da codici o utenti. */
export function newToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...a].map((x) => abc[x % 36]).join('');
}
/** Solo i campi pubblicabili. Mai: prestiti, note, proprietario, cronologia. Posizione solo se scelta. */
export function pubGame(it, fields = {}) {
  const g = { name: String(it.name).slice(0, 40) };
  for (const k of ['minPlayers', 'maxPlayers', 'duration', 'weight', 'year', 'copies']) if (Number.isFinite(Number(it[k])) && it[k] !== null && it[k] !== undefined && it[k] !== '') g[k] = Number(it[k]);
  for (const k of ['mode', 'language', 'edition', 'publisher', 'baseId', 'video']) if (typeof it[k] === 'string' && it[k]) g[k] = it[k].slice(0, k === 'video' ? 200 : 40);
  if (typeof it.rules === 'string' && it.rules) g.rules = it.rules.slice(0, 600);
  if (it.isNew) g.isNew = true;
  const tags = tagsOf(it); if (tags.length) g.tags = tags.slice(0, 8);
  if (typeof it.thumb === 'string' && it.thumb.length < 40000) g.thumb = it.thumb;
  if (fields.status) g.avail = available(it);
  if (fields.loc) { const l = cleanLoc(it.loc); if (l) g.loc = l; }
  return g;
}
/**
 * Aggiorna il catalogo pubblico scrivendo solo i giochi cambiati (prev = copia attuale del catalogo).
 */
export async function syncPublic(token, aid, info, lib, fields, prev = {}) {
  const upd = { aid, name: String(info?.name || 'Armadio').slice(0, 40), at: Date.now(), fields: { loc: Boolean(fields.loc), status: Boolean(fields.status) } };
  if (info?.desc) upd.desc = String(info.desc).slice(0, 200); else upd.desc = null;
  if (info?.emoji) upd.emoji = String(info.emoji).slice(0, 8); else upd.emoji = null;
  let n = 0;
  const ids = new Set([...Object.keys(lib || {}), ...Object.keys(prev || {})]);
  for (const id of ids) {
    const it = lib?.[id];
    const next = it?.name ? pubGame(it, fields) : null;
    if (JSON.stringify(next) !== JSON.stringify(prev?.[id] || null)) { upd[`games/${id}`] = next; n++; }
  }
  await update(dbRef(`pub/${token}`), upd);
  return n;
}

// ---------------------------------------------------------------------------
// Trasferimento tra armadi
// ---------------------------------------------------------------------------

/**
 * Sposta giochi in un altro armadio (stesso id: niente copie). La posizione va riconfermata (locCheck).
 * I prestiti attivi seguono il gioco; le espansioni non selezionate restano dove sono.
 */
export async function moveGames(fromAid, toAid, ids, lib, loans, by = '') {
  if (!CODE6.test(toAid) || toAid === fromAid) throw Object.assign(new Error('Scegli un altro armadio.'), { user: true });
  const moved = []; const failed = [];
  for (const id of ids) {
    const it = lib?.[id];
    if (!it?.name) continue;
    try {
      const full = await fullImage(fromAid, id, it);
      const game = { ...it, updatedAt: Date.now() };
      delete game.image;
      if (hasLoc(it)) game.locCheck = true;
      if (game.baseId && !ids.includes(game.baseId)) game.note = cleanName(`${game.note ? `${game.note} · ` : ''}Espansione di ${lib[game.baseId]?.name || 'un gioco'} (rimasto nell’altro armadio)`, 300);
      if (game.baseId && !ids.includes(game.baseId)) delete game.baseId;
      const tUpd = { [`library/${id}`]: game };
      if (full && full !== it.thumb) tUpd[`images/${id}`] = full;
      for (const l of loansOf(loans, id).filter((x) => !x.ret)) { const c = { ...l }; delete c.id; tUpd[`loans/${l.id}`] = c; }
      await update(armadioRef(toAid), tUpd);
      const fUpd = { [`library/${id}`]: null, [`images/${id}`]: null };
      for (const l of loansOf(loans, id).filter((x) => !x.ret)) fUpd[`loans/${l.id}`] = null;
      await update(armadioRef(fromAid), fUpd);
      logEvent(fromAid, { op: 'move', item: id, name: it.name, msg: `nell’armadio ${toAid}`, by });
      logEvent(toAid, { op: 'move', item: id, name: it.name, msg: `dall’armadio ${fromAid}`, by });
      moved.push(id);
    } catch (err) { failed.push({ id, name: it.name, why: err?.message || 'errore' }); }
  }
  return { moved, failed };
}

/** Riassunto per la home e la pagina: giochi base, espansioni, prestiti, incompleti. */
export function summary(lib, loans) {
  const items = Object.values(lib || {}).filter((it) => it?.name);
  const exp = items.filter((it) => it.baseId).length;
  const act = activeLoans(loans);
  return {
    games: items.length - exp, expansions: exp, total: items.length,
    lent: act.length, overdue: act.filter((l) => isOverdue(l)).length,
    incomplete: items.filter((it) => missingFields(it).length).length,
    noLoc: items.filter((it) => !hasLoc(it)).length,
    isNew: items.filter((it) => it.isNew).length
  };
}

export { dbKey };
