// GameNight Show · proxy per BoardGameGeek (Cloudflare Worker, piano gratuito).
//
// Perché esiste: l'XML API2 di BGG vuole un token (Authorization: Bearer …) che non deve stare nel
// browser né nel repository, chiede di fare le chiamate dai server e di usare la cache.
// Il Worker tiene il token come segreto, risponde solo al sito e all'app di GameNight Show,
// mette in cache le risposte e restituisce JSON con i soli campi che servono.
//
// Operazioni:
//   GET /search?q=catan        → giochi trovati (con anno, miniatura, giocatori, durata)
//   GET /thing?id=13,822       → schede complete (fino a 20 id)
//   GET /health                → stato del proxy (senza dati di BGG)
//
// Configurazione (wrangler.toml e segreti):
//   BGG_TOKEN        segreto (wrangler secret put BGG_TOKEN)
//   ALLOWED_ORIGINS  origini ammesse, separate da virgole
//   RATE_LIMIT       richieste per indirizzo IP ogni 10 minuti (predefinito 120)

import { parseSearch, parseThings, rankResults, norm, looksLikeItems, xmlError } from './bgg.js';

export const VERSION = '1.0.0';
const BGG = 'https://boardgamegeek.com/xmlapi2';
const SEARCH_TTL = 24 * 3600; // ricerche: 24 ore
const THING_TTL = 7 * 24 * 3600; // schede: 7 giorni
const MAX_IDS = 20; // limite di BGG per una richiesta /thing
const SEARCH_ENRICH = 16; // risultati della ricerca completati con miniatura e dati
const DEFAULT_ORIGINS = 'https://mashaup.github.io,https://localhost';

// ---------------------------------------------------------------------------
// Limite di richieste per indirizzo IP (in memoria, per istanza del Worker: protezione di base)
// ---------------------------------------------------------------------------

const hits = new Map();
export function rateLimited(ip, limit, now = Date.now(), windowMs = 10 * 60 * 1000) {
  if (!ip) return false;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  return false;
}
export function resetRateLimit() { hits.clear(); }

// ---------------------------------------------------------------------------
// Risposte
// ---------------------------------------------------------------------------

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

function cors(origin) {
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  } : {};
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors(origin), ...extra }
  });
}
const fail = (code, status, origin, extra = {}) => json({ ok: false, error: code, ...extra }, status, origin, extra.retryAfter ? { 'Retry-After': String(extra.retryAfter) } : {});

// ---------------------------------------------------------------------------
// Chiamate a BGG, con pochi nuovi tentativi quando BGG chiede di riprovare
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callBgg(path, env, { fetchImpl = fetch, retries = 2, wait = sleep } = {}) {
  if (!env.BGG_TOKEN) throw Object.assign(new Error('no_token'), { code: 'no_token', status: 503 });
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetchImpl(`${BGG}${path}`, { headers: { Authorization: `Bearer ${env.BGG_TOKEN}`, 'User-Agent': `GameNightShow-proxy/${VERSION}` } });
    } catch (err) {
      last = Object.assign(new Error('bgg_unreachable'), { code: 'bgg_unreachable', status: 502 });
      if (attempt < retries) { await wait(800 * (attempt + 1)); continue; }
      throw last;
    }
    // 202: BGG ha messo la richiesta in coda; 429/503: troppe richieste. Si riprova poco e con calma.
    if (res.status === 202 || res.status === 429 || res.status === 503 || res.status === 500) {
      const ra = Number(res.headers.get('Retry-After')) || 0;
      last = Object.assign(new Error('bgg_busy'), { code: 'bgg_busy', status: 503, retryAfter: Math.min(60, Math.max(5, ra || 10)) });
      if (attempt < retries) { await wait(Math.min(4000, ra ? ra * 1000 : 1200 * (attempt + 1))); continue; }
      throw last;
    }
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('bgg_auth'), { code: 'bgg_auth', status: 502 });
    if (!res.ok) throw Object.assign(new Error('bgg_error'), { code: 'bgg_error', status: 502, upstream: res.status });
    const xml = await res.text();
    if (!looksLikeItems(xml)) {
      const msg = xmlError(xml);
      if (msg && /rate|too many|try again/i.test(msg)) {
        last = Object.assign(new Error('bgg_busy'), { code: 'bgg_busy', status: 503, retryAfter: 10 });
        if (attempt < retries) { await wait(1200 * (attempt + 1)); continue; }
        throw last;
      }
      throw Object.assign(new Error('bgg_bad_response'), { code: 'bgg_bad_response', status: 502 });
    }
    return xml;
  }
  throw last || new Error('bgg_error');
}

// ---------------------------------------------------------------------------
// Cache (Cache API del Worker)
// ---------------------------------------------------------------------------

const cacheKey = (kind, key) => new Request(`https://gamenight-bgg-cache.invalid/${kind}/${encodeURIComponent(key)}`);

async function cacheGet(cache, kind, key) {
  if (!cache) return null;
  try { const r = await cache.match(cacheKey(kind, key)); return r ? await r.json() : null; } catch { return null; }
}
async function cachePut(cache, kind, key, data, ttl) {
  if (!cache) return;
  try {
    await cache.put(cacheKey(kind, key), new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }));
  } catch { /* la cache è facoltativa */ }
}

/** Schede per id: prima dalla cache (una voce per gioco), poi da BGG le mancanti in una sola chiamata. */
export async function getThings(ids, env, { cache, fetchImpl, wait } = {}) {
  const out = new Map();
  const missing = [];
  for (const id of ids) {
    const hit = await cacheGet(cache, 'thing', id);
    if (hit) out.set(id, hit); else missing.push(id);
  }
  if (missing.length) {
    const xml = await callBgg(`/thing?id=${missing.join(',')}&stats=1`, env, { fetchImpl, wait });
    const fetchedAt = Date.now();
    for (const g of parseThings(xml)) {
      const item = { ...g, fetchedAt };
      out.set(g.id, item);
      await cachePut(cache, 'thing', g.id, item, THING_TTL);
    }
  }
  return ids.map((id) => out.get(id)).filter(Boolean);
}

/** Ricerca per nome: risultati di BGG completati con le schede dei primi, ordinati per pertinenza. */
export async function search(q, env, { cache, fetchImpl, wait } = {}) {
  const key = norm(q);
  const hit = await cacheGet(cache, 'search', key);
  if (hit) return hit;
  const xml = await callBgg(`/search?query=${encodeURIComponent(q)}&type=boardgame,boardgameexpansion`, env, { fetchImpl, wait });
  const found = parseSearch(xml);
  // Prima i nomi più vicini al testo cercato, poi si completano i primi con le schede (miniature, giocatori…)
  const first = rankResults(found.map((x) => ({ ...x, isExpansion: x.type === 'boardgameexpansion' })), q);
  const ids = [...new Set(first.map((x) => x.id))].slice(0, SEARCH_ENRICH);
  let things = [];
  try { things = ids.length ? await getThings(ids, env, { cache, fetchImpl, wait }) : []; } catch (err) { if (err.code !== 'bgg_busy') throw err; }
  const byId = new Map(things.map((t) => [t.id, t]));
  const merged = first.slice(0, 40).map((x) => {
    const t = byId.get(x.id);
    return t ? { id: t.id, name: t.name, alt: t.alt, year: t.year ?? x.year, type: t.type, isExpansion: t.isExpansion, thumb: t.thumb, minPlayers: t.minPlayers, maxPlayers: t.maxPlayers, time: t.time, weight: t.weight, usersRated: t.usersRated }
      : { id: x.id, name: x.name, year: x.year, type: x.type, isExpansion: x.type === 'boardgameexpansion' };
  });
  const result = { total: found.length, items: rankResults(merged, q).slice(0, 12).map(({ usersRated, alt, ...rest }) => rest) };
  await cachePut(cache, 'search', key, result, SEARCH_TTL);
  return result;
}

// ---------------------------------------------------------------------------
// Ingresso del Worker
// ---------------------------------------------------------------------------

export async function handle(request, env = {}, ctx = {}, deps = {}) {
  const url = new URL(request.url);
  const origin = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const ok = allowedOrigins(env).includes(origin);
  const allow = ok ? origin : null;

  if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors(allow) });
  if (request.method !== 'GET') return fail('method_not_allowed', 405, allow);
  if (url.pathname === '/health' || url.pathname === '/') {
    return json({ ok: true, service: 'gamenight-bgg-proxy', version: VERSION, token: Boolean(env.BGG_TOKEN) }, 200, allow);
  }
  // Solo il sito e l'app di GameNight Show: BGG vieta di offrire i suoi dati ad altre applicazioni.
  if (!ok) return fail('forbidden_origin', 403, null);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (rateLimited(ip, Number(env.RATE_LIMIT) || 120)) return fail('rate_limited', 429, allow, { retryAfter: 60 });

  const cache = deps.cache !== undefined ? deps.cache : (typeof caches !== 'undefined' ? caches.default : null);
  const opts = { cache, fetchImpl: deps.fetchImpl, wait: deps.wait };
  try {
    if (url.pathname === '/search') {
      const q = String(url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (q.length < 2) return fail('bad_request', 400, allow);
      const data = await search(q, env, opts);
      return json({ ok: true, q, ...data, source: 'BoardGameGeek' }, 200, allow);
    }
    if (url.pathname === '/thing') {
      const ids = [...new Set(String(url.searchParams.get('id') || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n < 1e8))];
      if (!ids.length) return fail('bad_request', 400, allow);
      if (ids.length > MAX_IDS) return fail('too_many_ids', 400, allow, { max: MAX_IDS });
      const items = await getThings(ids, env, opts);
      if (!items.length) return fail('not_found', 404, allow);
      return json({ ok: true, items, source: 'BoardGameGeek' }, 200, allow);
    }
    return fail('not_found', 404, allow);
  } catch (err) {
    const code = err.code || 'internal';
    const status = err.status || 500;
    return fail(code, status, allow, err.retryAfter ? { retryAfter: err.retryAfter } : {});
  }
}

export default {
  fetch(request, env, ctx) { return handle(request, env, ctx); }
};
