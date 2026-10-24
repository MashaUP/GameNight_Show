// BoardGameGeek nell'app (1.8): ricerca e schede passano dal proxy gratuito in bgg-proxy/
// (Cloudflare Worker con il token di BGG come segreto). Il token non arriva mai qui.
//
// Facoltativo: con js/services.js › BGG_PROXY_URL vuoto tutto resta come prima (niente pulsanti BGG,
// importazione del CSV sempre disponibile). Le funzioni pure (bggToGame, mergePlan) sono provate in
// tests/features.test.mjs; la pagina le usa per l'anteprima "prima / dopo" senza sovrascrivere
// niente in silenzio.
import { BGG_PROXY_URL } from './services.js';

export const BGG_SITE = 'https://boardgamegeek.com';
const TIMEOUT = 15000;
let override = null;

/** Indirizzo del proxy (le prove possono sostituirlo con setBggProxy). */
export function bggBase() {
  const u = override ?? BGG_PROXY_URL;
  return typeof u === 'string' && /^https:\/\/[^\s"<>]+$/.test(u) ? u.replace(/\/+$/, '') : '';
}
export function setBggProxy(url) { override = url; }
export const bggEnabled = () => Boolean(bggBase());

/** Errore con un codice da tradurre (bgg.err.<code>). */
const fail = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

async function call(path, { signal } = {}) {
  const base = bggBase();
  if (!base) throw fail('off');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  signal?.addEventListener('abort', () => ctrl.abort());
  let res;
  try {
    res = await fetch(`${base}${path}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
  } catch (err) {
    throw fail(signal?.aborted ? 'aborted' : err?.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
  let body = null;
  try { body = await res.json(); } catch { throw fail('bad_response'); }
  if (!res.ok || !body?.ok) {
    const code = String(body?.error || `http_${res.status}`);
    throw fail(code, { retryAfter: Number(res.headers.get('Retry-After')) || Number(body?.retryAfter) || null });
  }
  return body;
}

/** Ricerca per nome: [{ id, name, year, isExpansion, thumb?, minPlayers?, maxPlayers?, time?, weight? }]. */
export async function bggSearch(q, opts = {}) {
  const s = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (s.length < 2) throw fail('short');
  const b = await call(`/search?q=${encodeURIComponent(s)}`, opts);
  return Array.isArray(b.items) ? b.items.filter((x) => Number.isInteger(x?.id) && x.name) : [];
}

/** Scheda completa di un gioco. */
export async function bggThing(id, opts = {}) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw fail('bad_request');
  const b = await call(`/thing?id=${Number(id)}`, opts);
  const it = Array.isArray(b.items) ? b.items.find((x) => Number(x?.id) === Number(id)) : null;
  if (!it) throw fail('not_found');
  return it;
}

/** Stato del proxy (per il centro diagnostico): { ok, token } oppure { ok: false, code }. */
export async function bggHealth() {
  if (!bggEnabled()) return { ok: false, code: 'off' };
  try { const b = await call('/health'); return { ok: true, token: Boolean(b.token), version: b.version || '' }; } catch (err) { return { ok: false, code: err.code || 'network' }; }
}

/** Codice da salvare nella scheda del gioco ("bgg:13") e lettura inversa. */
export const bggExtId = (id) => `bgg:${Number(id)}`;
export function bggIdOf(extId) {
  const m = /^bgg:(\d{1,8})$/.exec(String(extId || '').trim()) || /^(\d{1,8})$/.exec(String(extId || '').trim());
  return m ? Number(m[1]) : null;
}
/** Pagina del gioco e pagina dei file (manuali caricati dagli utenti di BGG). */
export const bggPage = (id) => `${BGG_SITE}/boardgame/${Number(id)}`;
export const bggFilesPage = (id) => `${BGG_SITE}/boardgame/${Number(id)}/files`;

const cleanStr = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

/**
 * Scheda di BGG → campi dell'armadio (solo quelli che BGG conosce davvero; niente valori inventati).
 * Durata: il tempo di gioco indicato; difficoltà: il "peso" medio (1–5) con un decimale.
 */
export function bggToGame(it) {
  if (!it || !it.name) return {};
  const g = { name: cleanStr(it.name, 40), extId: bggExtId(it.id) };
  const int = (v, lo, hi) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);
  const set = (k, v) => { if (v !== null && v !== undefined && v !== '') g[k] = v; };
  set('year', int(it.year, 1900, 2100));
  set('minPlayers', int(it.minPlayers, 1, 20));
  set('maxPlayers', int(it.maxPlayers, 1, 20));
  if (g.minPlayers && g.maxPlayers && g.minPlayers > g.maxPlayers) delete g.maxPlayers;
  set('duration', int(it.time, 1, 600) || int(it.maxTime, 1, 600));
  const w = Number(it.weight);
  if (Number.isFinite(w) && w >= 1 && w <= 5) g.weight = Math.round(w * 10) / 10;
  if (Array.isArray(it.categories) && it.categories.length) g.tags = [...new Set(it.categories.map((c) => cleanStr(c, 20)).filter(Boolean))].slice(0, 6);
  if (typeof it.thumb === 'string' && /^https:\/\/[^\s"<>]+$/.test(it.thumb) && it.thumb.length < 400) g.thumbUrl = it.thumb;
  if (typeof it.image === 'string' && /^https:\/\/[^\s"<>]+$/.test(it.image) && it.image.length < 400) g.imageUrl = it.image;
  if (Array.isArray(it.bestPlayers) && it.bestPlayers.length) g.bestPlayers = it.bestPlayers.filter((n) => Number.isInteger(n)).slice(0, 6);
  if (it.isExpansion) g.isExpansion = true;
  return g;
}

/** Campi che si possono prendere da BGG e come si chiamano nel modulo. */
export const BGG_FIELDS = ['name', 'year', 'minPlayers', 'maxPlayers', 'duration', 'weight', 'tags', 'extId'];

/**
 * Confronta la scheda attuale con quella di BGG: per ogni campo dice se è vuoto (si riempie da solo),
 * uguale (niente da fare) o diverso (si cambia SOLO se la persona lo sceglie).
 * Restituisce [{ field, current, bgg, state: 'fill'|'same'|'conflict' }].
 */
export function mergePlan(current, bgg) {
  const out = [];
  const norm = (v) => (Array.isArray(v) ? v.map(String).map((x) => x.toLowerCase()).sort().join(',') : v === null || v === undefined ? '' : String(v).toLowerCase());
  for (const f of BGG_FIELDS) {
    if (bgg[f] === undefined) continue;
    const cur = current?.[f];
    const empty = cur === undefined || cur === null || cur === '' || (Array.isArray(cur) && !cur.length);
    out.push({ field: f, current: empty ? null : cur, bgg: bgg[f], state: empty ? 'fill' : norm(cur) === norm(bgg[f]) ? 'same' : 'conflict' });
  }
  return out;
}

/** Applica le scelte: campi vuoti riempiti, quelli diversi solo se scelti (chosen: Set di campi). */
export function applyMerge(current, plan, chosen = new Set()) {
  const patch = {};
  for (const p of plan) if (p.state === 'fill' || (p.state === 'conflict' && chosen.has(p.field))) patch[p.field] = p.bgg;
  return { ...current, ...patch, _changed: Object.keys(patch) };
}
