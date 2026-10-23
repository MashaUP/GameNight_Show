// Test del proxy BGG con risposte di BoardGameGeek simulate (nessuna chiamata vera).
// Esecuzione: node --test bgg-proxy/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, resetRateLimit, callBgg } from '../src/worker.js';
import { parseThings, parseSearch, decode, rankResults } from '../src/bgg.js';

const ORIGIN = 'https://mashaup.github.io';
const ENV = { BGG_TOKEN: 'segreto-di-prova', ALLOWED_ORIGINS: 'https://mashaup.github.io,https://localhost', RATE_LIMIT: '5' };

const SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?><items total="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
<item type="boardgame" id="13"><name type="primary" value="CATAN"/><yearpublished value="1995" /></item>
<item type="boardgameexpansion" id="926"><name type="primary" value="CATAN: Cities &amp; Knights"/><yearpublished value="1998" /></item>
<item type="boardgame" id="99999"><name type="alternate" value="Catan Junior"/><yearpublished value="2007" /></item>
</items>`;

const THING_XML = `<?xml version="1.0" encoding="utf-8"?><items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
<item type="boardgame" id="13">
 <thumbnail>https://cf.geekdo-images.com/thumb_13.jpg</thumbnail>
 <image>https://cf.geekdo-images.com/img_13.jpg</image>
 <name type="primary" sortindex="1" value="CATAN" />
 <name type="alternate" sortindex="1" value="I Coloni di Catan" />
 <description>Non deve essere usata &amp; modificata</description>
 <yearpublished value="1995" /><minplayers value="3" /><maxplayers value="4" />
 <poll name="suggested_numplayers" title="User Suggested Number of Players" totalvotes="2000">
  <results numplayers="1"><result value="Best" numvotes="0" /><result value="Recommended" numvotes="5" /><result value="Not Recommended" numvotes="900" /></results>
  <results numplayers="3"><result value="Best" numvotes="300" /><result value="Recommended" numvotes="900" /><result value="Not Recommended" numvotes="100" /></results>
  <results numplayers="4"><result value="Best" numvotes="1300" /><result value="Recommended" numvotes="300" /><result value="Not Recommended" numvotes="20" /></results>
  <results numplayers="4+"><result value="Best" numvotes="1" /><result value="Recommended" numvotes="1" /><result value="Not Recommended" numvotes="500" /></results>
 </poll>
 <playingtime value="120" /><minplaytime value="60" /><maxplaytime value="120" /><minage value="10" />
 <link type="boardgamecategory" id="1029" value="Economic" />
 <link type="boardgamemechanic" id="2072" value="Dice Rolling" />
 <link type="boardgameexpansion" id="926" value="CATAN: Cities &amp; Knights" />
 <statistics page="1"><ratings><usersrated value="120000" /><average value="7.09" /><averageweight value="2.29" /></ratings></statistics>
</item>
<item type="boardgameexpansion" id="926">
 <thumbnail>//cf.geekdo-images.com/thumb_926.jpg</thumbnail>
 <name type="primary" sortindex="1" value="CATAN: Cities &amp; Knights" />
 <yearpublished value="1998" /><minplayers value="3" /><maxplayers value="4" /><playingtime value="90" />
 <link type="boardgameexpansion" id="13" value="CATAN" inbound="true" />
 <statistics page="1"><ratings><usersrated value="20000" /><average value="7.6" /><averageweight value="2.9" /></ratings></statistics>
</item>
</items>`;

function fakeCache() {
  const m = new Map();
  return { m, async match(req) { const v = m.get(req.url); return v ? new Response(v) : undefined; }, async put(req, res) { m.set(req.url, await res.text()); } };
}
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    for (const [re, fn] of routes) if (re.test(url)) return typeof fn === 'function' ? fn(url, calls.length) : fn;
    return new Response('nope', { status: 404 });
  };
  f.calls = calls;
  return f;
}
const xml = (s, status = 200, headers = {}) => new Response(s, { status, headers: { 'Content-Type': 'text/xml', ...headers } });
const req = (path, origin = ORIGIN, extra = {}) => new Request(`https://proxy.example.workers.dev${path}`, { headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': extra.ip || '1.2.3.4' }, method: extra.method || 'GET' });
const noWait = async () => {};

test('decode: entità XML', () => {
  assert.equal(decode('Cities &amp; Knights &#039;x&#39; &#x27;y&#x27; &quot;z&quot;'), "Cities & Knights 'x' 'y' \"z\"");
});

test('parseSearch e parseThings: campi, sondaggio giocatori, espansioni, URL https', () => {
  const s = parseSearch(SEARCH_XML);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], { id: 926, type: 'boardgameexpansion', name: 'CATAN: Cities & Knights', year: 1998 });
  const [g, e] = parseThings(THING_XML);
  assert.equal(g.name, 'CATAN');
  assert.deepEqual(g.alt, ['I Coloni di Catan']);
  assert.equal(g.minPlayers, 3); assert.equal(g.maxPlayers, 4);
  assert.deepEqual(g.bestPlayers, [4]);
  assert.deepEqual(g.recPlayers, [3, 4]);
  assert.equal(g.weight, 2.29); assert.equal(g.time, 120); assert.equal(g.minAge, 10);
  assert.deepEqual(g.expansions, [{ id: 926, name: 'CATAN: Cities & Knights' }]);
  assert.equal(g.url, 'https://boardgamegeek.com/boardgame/13');
  assert.ok(!('description' in g), 'la descrizione non viene restituita');
  assert.equal(e.isExpansion, true);
  assert.deepEqual(e.baseGames, [{ id: 13, name: 'CATAN' }]);
  assert.equal(e.thumb, 'https://cf.geekdo-images.com/thumb_926.jpg');
  assert.equal(e.url, 'https://boardgamegeek.com/boardgameexpansion/926');
});

test('XML malformato o pagina HTML: errore chiaro', () => {
  assert.throws(() => parseThings('<html>errore</html>'), /bad_xml/);
});

test('rankResults: nome identico e gioco base prima delle espansioni', () => {
  const r = rankResults([{ name: 'Catan: Seafarers', isExpansion: true, usersRated: 9e5 }, { name: 'CATAN', usersRated: 10 }], 'catan');
  assert.equal(r[0].name, 'CATAN');
});

test('ricerca: risultato con miniature, token nel header, cache al secondo giro', async () => {
  resetRateLimit();
  const cache = fakeCache();
  const f = fakeFetch([[/\/search\?/, () => xml(SEARCH_XML)], [/\/thing\?/, () => xml(THING_XML)]]);
  const r = await handle(req('/search?q=Catan'), ENV, {}, { cache, fetchImpl: f, wait: noWait });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.items[0].name, 'CATAN');
  assert.equal(j.items[0].thumb, 'https://cf.geekdo-images.com/thumb_13.jpg');
  assert.ok(f.calls.every((c) => c.auth === 'Bearer segreto-di-prova'), 'token come Bearer');
  assert.ok(!JSON.stringify(j).includes('segreto'), 'il token non esce mai nella risposta');
  const n = f.calls.length;
  const r2 = await handle(req('/search?q=catan'), ENV, {}, { cache, fetchImpl: f, wait: noWait });
  assert.equal((await r2.json()).items[0].id, 13);
  assert.equal(f.calls.length, n, 'seconda ricerca dalla cache, nessuna chiamata a BGG');
});

test('ricerca: nessun risultato', async () => {
  resetRateLimit();
  const f = fakeFetch([[/\/search\?/, () => xml('<items total="0" termsofuse="x"></items>')]]);
  const j = await (await handle(req('/search?q=zzzzzz'), ENV, {}, { cache: fakeCache(), fetchImpl: f, wait: noWait })).json();
  assert.equal(j.ok, true); assert.equal(j.total, 0); assert.deepEqual(j.items, []);
});

test('scheda: id multipli, cache per gioco', async () => {
  resetRateLimit();
  const cache = fakeCache();
  const f = fakeFetch([[/\/thing\?id=13,926/, () => xml(THING_XML)], [/\/thing\?id=926&/, () => xml(THING_XML)]]);
  const j = await (await handle(req('/thing?id=13,926'), ENV, {}, { cache, fetchImpl: f, wait: noWait })).json();
  assert.equal(j.items.length, 2);
  assert.ok(j.items[0].fetchedAt > 0);
  await handle(req('/thing?id=13'), ENV, {}, { cache, fetchImpl: f, wait: noWait });
  assert.equal(f.calls.length, 1, 'la seconda richiesta usa la cache');
});

test('"riprova più tardi" (202/429): nuovi tentativi limitati, poi errore con Retry-After', async () => {
  resetRateLimit();
  let n = 0;
  const f = fakeFetch([[/\/thing\?/, () => { n++; return xml('', 429, { 'Retry-After': '7' }); }]]);
  const r = await handle(req('/thing?id=13'), ENV, {}, { cache: fakeCache(), fetchImpl: f, wait: noWait });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'bgg_busy');
  assert.equal(r.headers.get('Retry-After'), '7');
  assert.equal(n, 3, 'un tentativo + 2 nuovi tentativi');
  // Dopo un 202 la richiesta va a buon fine al secondo tentativo
  let k = 0;
  const g = fakeFetch([[/\/thing\?/, () => (++k === 1 ? xml('', 202) : xml(THING_XML))]]);
  const ok = await handle(req('/thing?id=13'), ENV, {}, { cache: fakeCache(), fetchImpl: g, wait: noWait });
  assert.equal(ok.status, 200);
});

test('errore di BGG e XML malformato: risposta 502 chiara', async () => {
  resetRateLimit();
  const f = fakeFetch([[/\/thing\?/, () => xml('<html>Server error</html>', 200)]]);
  const r = await handle(req('/thing?id=13'), ENV, {}, { cache: fakeCache(), fetchImpl: f, wait: noWait });
  assert.equal(r.status, 502); assert.equal((await r.json()).error, 'bgg_bad_response');
  const g = fakeFetch([[/\/thing\?/, () => xml('x', 401)]]);
  assert.equal((await (await handle(req('/thing?id=13'), ENV, {}, { cache: fakeCache(), fetchImpl: g, wait: noWait })).json()).error, 'bgg_auth');
});

test('token mancante: 503 no_token, senza chiamare BGG', async () => {
  resetRateLimit();
  const f = fakeFetch([]);
  const r = await handle(req('/thing?id=13'), { ALLOWED_ORIGINS: ORIGIN }, {}, { cache: null, fetchImpl: f, wait: noWait });
  assert.equal(r.status, 503); assert.equal((await r.json()).error, 'no_token'); assert.equal(f.calls.length, 0);
});

test('CORS: solo le origini ammesse', async () => {
  resetRateLimit();
  const f = fakeFetch([[/thing/, () => xml(THING_XML)]]);
  const bad = await handle(req('/thing?id=13', 'https://altro-sito.example'), ENV, {}, { cache: null, fetchImpl: f, wait: noWait });
  assert.equal(bad.status, 403); assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  const none = await handle(req('/thing?id=13', null), ENV, {}, { cache: null, fetchImpl: f, wait: noWait });
  assert.equal(none.status, 403, 'senza Origin: rifiutato');
  const app = await handle(req('/thing?id=13', 'https://localhost'), ENV, {}, { cache: null, fetchImpl: f, wait: noWait });
  assert.equal(app.status, 200, 'app Android (https://localhost) ammessa');
  const pre = await handle(req('/search?q=x', ORIGIN, { method: 'OPTIONS' }), ENV);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(f.calls.length, 1);
});

test('limite di richieste per IP', async () => {
  resetRateLimit();
  const f = fakeFetch([[/thing/, () => xml(THING_XML)]]);
  const cache = fakeCache();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await handle(req('/thing?id=13', ORIGIN, { ip: '9.9.9.9' }), ENV, {}, { cache, fetchImpl: f, wait: noWait })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  const other = await handle(req('/thing?id=13', ORIGIN, { ip: '8.8.8.8' }), ENV, {}, { cache, fetchImpl: f, wait: noWait });
  assert.equal(other.status, 200, 'un altro indirizzo non è bloccato');
});

test('richieste non valide', async () => {
  resetRateLimit();
  const f = fakeFetch([]);
  const s = async (p) => (await handle(req(p), ENV, {}, { cache: null, fetchImpl: f, wait: noWait })).status;
  assert.equal(await s('/search?q=a'), 400);
  assert.equal(await s('/thing?id=abc'), 400);
  assert.equal(await s(`/thing?id=${Array.from({ length: 21 }, (_, i) => i + 1).join(',')}`), 400);
  assert.equal(await s('/altro'), 404);
  const h = await (await handle(req('/health'), ENV)).json();
  assert.equal(h.ok, true); assert.equal(h.token, true);
  assert.equal(f.calls.length, 0);
});

test('callBgg: rete assente → bgg_unreachable dopo i tentativi', async () => {
  let n = 0;
  await assert.rejects(callBgg('/thing?id=1', ENV, { fetchImpl: async () => { n++; throw new Error('offline'); }, wait: noWait }), /bgg_unreachable/);
  assert.equal(n, 3);
});
