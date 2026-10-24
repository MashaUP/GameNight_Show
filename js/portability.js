// Portabilità dei dati: esportare i propri dati in un file e importarli in un'altra installazione
// di GameNight Show (un altro sito con il suo Firebase, un altro dispositivo, l'app Android…).
//
// Qui solo funzioni pure (niente pagina, niente database): costruire il file, leggerlo senza
// fidarsi, controllarlo e preparare il piano dell'importazione. La pagina (datacenter.js) mostra
// l'anteprima, chiede conferma e scrive. Prove: tests/features.test.mjs.
//
// Formato "gamenight-export", versione 2 (JSON, documentato in docs/DATI.md):
// {
//   format: 'gamenight-export', version: 2, app: '1.10.0', exportedAt: ISO,
//   categories: ['profile', 'favs', 'armadi', 'loans', 'groups'],      quelle scelte da chi esporta
//   profile: { name, style, seed, color, motto?, opts? },             solo l'aspetto, mai chiavi o codici
//   favs: { <armadio>: { <gioco>: ms } },
//   armadi: [{ id, name, desc?, emoji?, games: [ { id, name, … } ], loans?: [ { id, item, to, start, due?, ret?, note? } ] }],
//   groups: [ <backup del gruppo, lo stesso del pulsante "Backup del gruppo" della TV> ],
//   sum: impronta per riconoscere un file modificato a mano
// }
// Si leggono anche i file "gamenight-armadio" versione 1 (esportazione di un solo armadio, dalla 1.2).
//
// Cosa NON va mai nel file: chiavi dei profili, degli armadi e dei gruppi, codice regia, uid dei
// dispositivi, token del catalogo pubblico, configurazione di Firebase.
import { sanitizeGame, planImport, normTitle } from './collection.js';
import { cleanFavs } from './favs.js';
import { lookOf } from './person.js';
import { checksum } from './vault.js';

export const EXPORT_FORMAT = 'gamenight-export';
export const EXPORT_VERSION = 2;
export const CATEGORIES = ['profile', 'favs', 'armadi', 'loans', 'groups'];
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_GAMES = 2000;
const CODE6 = /^[A-Z0-9]{6}$/;
const ID = /^[\w-]{1,40}$/;

const err = (key, params) => Object.assign(new Error(key), { user: true, key, params });

/** Prestito pulito (dati di chi lo esporta, campi controllati). */
export function cleanLoan(l, gameIds) {
  if (!l || typeof l !== 'object' || !ID.test(String(l.item || '')) || (gameIds && !gameIds.has(l.item))) return null;
  const to = String(l.to || '').trim().slice(0, 40);
  const start = Number(l.start);
  if (!to || !Number.isFinite(start) || start <= 0) return null;
  const out = { item: l.item, to, start: Math.round(start), name: String(l.name || '').slice(0, 60) };
  for (const k of ['due', 'ret']) if (Number.isFinite(Number(l[k])) && Number(l[k]) > 0) out[k] = Math.round(Number(l[k]));
  if (l.note) out.note = String(l.note).trim().slice(0, 200);
  if (l.state && /^[a-z]{1,20}$/.test(l.state)) out.state = l.state;
  return out;
}

/**
 * Costruisce il file da esportare.
 * src: { look, favs, armadi: [{ id, info, lib, loans }], groups: [backup del gruppo], appVersion, now }
 */
export function buildExport(src, categories = CATEGORIES) {
  const cat = new Set(categories.filter((c) => CATEGORIES.includes(c)));
  const out = { format: EXPORT_FORMAT, version: EXPORT_VERSION, app: src.appVersion || '', exportedAt: new Date(src.now || Date.now()).toISOString(), categories: [...cat] };
  if (cat.has('profile') && src.look) out.profile = lookOf(src.look);
  if (cat.has('favs')) out.favs = cleanFavs(src.favs);
  if (cat.has('armadi')) {
    out.armadi = (src.armadi || []).filter((a) => CODE6.test(a.id || '')).map((a) => {
      const games = Object.entries(a.lib || {}).filter(([id, it]) => ID.test(id) && it?.name).map(([id, it]) => {
        const g = { id, ...it };
        // Mai: foto grandi (troppo pesanti), legami con i prestiti, scelte della serata
        delete g.image; delete g.loanId; delete g.sel; delete g.dupOk;
        return g;
      });
      const entry = { id: a.id, name: String(a.info?.name || a.id).slice(0, 40), games };
      if (a.info?.desc) entry.desc = String(a.info.desc).slice(0, 200);
      if (a.info?.emoji) entry.emoji = String(a.info.emoji).slice(0, 8);
      if (cat.has('loans')) {
        const ids = new Set(games.map((g) => g.id));
        entry.loans = Object.entries(a.loans || {}).map(([lid, l]) => (ID.test(lid) ? { id: lid, ...cleanLoan(l, ids) } : null)).filter((l) => l && l.item);
      }
      return entry;
    });
  }
  if (cat.has('groups')) out.groups = (src.groups || []).filter((g) => g && g.kind === 'group');
  const body = { ...out };
  out.sum = checksum(JSON.stringify(body));
  return out;
}

/**
 * Legge il testo di un file senza fidarsi. Restituisce { kind: 'full'|'armadio', data, tampered }
 * oppure lancia un errore con key (testo da tradurre: port.err.*).
 */
export function parseImport(text, { maxBytes = MAX_FILE_BYTES } = {}) {
  const s = String(text || '');
  if (!s.trim()) throw err('port.err.empty');
  if (s.length > maxBytes) throw err('port.err.tooBig', { mb: Math.round(maxBytes / 1024 / 1024) });
  let data;
  try { data = JSON.parse(s.replace(/^﻿/, '')); } catch { throw err('port.err.notJson'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw err('port.err.notOurs');
  if (data.format === 'gamenight-armadio') {
    if (Number(data.version) !== 1) throw err('port.err.version', { v: String(data.version) });
    if (!Array.isArray(data.games)) throw err('port.err.noGames');
    return { kind: 'armadio', data: { categories: ['armadi'], armadi: [{ id: '', name: String(data.armadio?.name || '').slice(0, 40), desc: data.armadio?.desc, games: data.games }] }, tampered: false };
  }
  if (data.format !== EXPORT_FORMAT) throw err('port.err.notOurs');
  if (!Number.isInteger(Number(data.version)) || Number(data.version) < 2) throw err('port.err.version', { v: String(data.version) });
  if (Number(data.version) > EXPORT_VERSION) throw err('port.err.newer', { v: String(data.version) });
  let tampered = false;
  if (data.sum) {
    const body = { ...data };
    delete body.sum;
    tampered = checksum(JSON.stringify(body)) !== data.sum;
  }
  return { kind: 'full', data, tampered };
}

/**
 * Controlla e pulisce il contenuto. Restituisce { profile, favs, armadi, groups, warnings, games }
 * con solo dati validi (giochi passati da sanitizeGame, prestiti da cleanLoan).
 */
export function validateImport(parsed) {
  const d = parsed.data || {};
  const warnings = [];
  const out = { profile: null, favs: {}, armadi: [], groups: [], warnings, games: 0 };
  if (d.profile && typeof d.profile === 'object') {
    const look = lookOf(d.profile);
    out.profile = look;
  }
  if (d.favs) out.favs = cleanFavs(d.favs);
  const list = Array.isArray(d.armadi) ? d.armadi.slice(0, 50) : [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || !Array.isArray(a.games)) { warnings.push({ key: 'port.warn.badArmadio' }); continue; }
    const games = [];
    const seenIds = new Set();
    for (const raw of a.games.slice(0, MAX_GAMES)) {
      if (!raw || typeof raw !== 'object') continue;
      const r = sanitizeGame(raw);
      if (r.errors.length) { warnings.push({ key: 'port.warn.badGame', params: { name: String(raw.name || '?').slice(0, 40) } }); continue; }
      const id = typeof raw.id === 'string' && ID.test(raw.id) && !seenIds.has(raw.id) ? raw.id : '';
      if (id) seenIds.add(id);
      const g = { ...r.game };
      if (raw.baseId && ID.test(raw.baseId)) g.baseIdSrc = raw.baseId;
      if (raw.addedAt && Number.isFinite(Number(raw.addedAt))) g.addedAt = Number(raw.addedAt);
      games.push({ srcId: id, game: g, baseName: r.baseName, warnings: r.warnings });
    }
    if (a.games.length > MAX_GAMES) warnings.push({ key: 'port.warn.tooMany', params: { n: MAX_GAMES } });
    const ids = new Set(games.map((g) => g.srcId).filter(Boolean));
    const loans = Array.isArray(a.loans) ? a.loans.map((l) => ({ id: typeof l?.id === 'string' && ID.test(l.id) ? l.id : '', ...cleanLoan(l, ids) })).filter((l) => l.item) : [];
    out.armadi.push({
      srcId: CODE6.test(a.id || '') ? a.id : '', name: String(a.name || '').trim().slice(0, 40), desc: a.desc ? String(a.desc).slice(0, 200) : '',
      emoji: a.emoji ? String(a.emoji).slice(0, 8) : '', games, loans
    });
    out.games += games.length;
  }
  if (Array.isArray(d.groups)) out.groups = d.groups.filter((g) => g && typeof g === 'object' && g.kind === 'group' && g.group?.id && CODE6.test(g.group.id)).slice(0, 20);
  return out;
}

/**
 * Piano di importazione di un armadio del file.
 * target: 'new' (armadio nuovo, con gli stessi id dei giochi) oppure la libreria di un armadio esistente.
 * mode: 'add' (solo i giochi che mancano) | 'merge' (aggiunge e completa i campi vuoti). Mai sovrascrive.
 */
export function planArmadio(arm, { target = 'new', lib = {}, mode = 'add', withLoans = false } = {}) {
  if (target === 'new') {
    const seen = new Map();
    const add = []; const dupInFile = [];
    for (const g of arm.games) {
      const k = normTitle(g.game.name) + (g.game.edition ? `#${normTitle(g.game.edition)}` : '');
      if (seen.has(k)) { dupInFile.push({ name: g.game.name }); continue; }
      seen.set(k, true);
      add.push(g);
    }
    return { target, add, update: [], same: [], invalid: [], dupInFile, loans: withLoans ? arm.loans.filter((l) => add.some((g) => g.srcId === l.item)) : [] };
  }
  const rows = arm.games.map((g) => ({ ...g.game, id: g.srcId, baseName: g.baseName }));
  const p = planImport(rows, lib, mode);
  return { target: 'existing', add: p.add, update: p.update, same: p.same, invalid: p.invalid, dupInFile: p.dupInFile, loans: [] };
}

/**
 * Scritture per un armadio NUOVO (un solo aggiornamento multiplo: tutto o niente).
 * Restituisce { upd, ids } con i percorsi relativi a armadi/<nuovo>.
 */
export function newArmadioWrites(plan, { by = '', now = Date.now(), newId }) {
  const upd = {};
  const rows = plan.add.map((g) => ({ g, id: g.srcId && ID.test(g.srcId) ? g.srcId : newId() }));
  const ids = new Map(rows.filter((r) => r.g.srcId).map((r) => [r.g.srcId, r.id])); // id del file → id nuovo
  const byName = new Map(rows.map((r) => [normTitle(r.g.game.name), r.id]));
  for (const { g, id } of rows) {
    const game = { ...g.game, addedAt: g.game.addedAt || now, updatedAt: now, addedBy: (by || 'Importazione').slice(0, 24) };
    const base = (g.game.baseIdSrc && ids.get(g.game.baseIdSrc)) || (g.baseName && byName.get(normTitle(g.baseName)));
    delete game.baseIdSrc;
    if (base && base !== id) game.baseId = base;
    upd[`library/${id}`] = game;
  }
  for (const l of plan.loans || []) {
    const item = ids.get(l.item);
    if (!item) continue;
    const loan = { ...l, item };
    const lid = l.id || newId();
    delete loan.id;
    upd[`loans/${lid}`] = loan;
    if (!loan.ret) upd[`library/${item}`] = { ...upd[`library/${item}`], loanId: lid, loanTo: loan.to.slice(0, 24), status: 'prestato' };
  }
  return { upd, ids };
}

/** Riepilogo numerico di un piano (per l'anteprima e per l'esito). */
export function planCounts(plan) {
  return { add: plan.add.length, update: plan.update.length, same: plan.same.length, invalid: plan.invalid.length + plan.dupInFile.length, loans: (plan.loans || []).length };
}

/** Preferiti del file portati sugli armadi di destinazione (id dei giochi tradotti). */
export function mapFavs(favs, armMap) {
  const out = {};
  for (const [srcAid, games] of Object.entries(favs || {})) {
    const m = armMap[srcAid];
    if (!m?.aid) continue;
    for (const [gid, at] of Object.entries(games)) {
      const id = m.ids?.get(gid);
      if (id) (out[m.aid] ||= {})[id] = at;
    }
  }
  return out;
}

