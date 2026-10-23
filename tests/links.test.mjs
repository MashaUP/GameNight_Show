// Prove del sistema dei link ufficiali (js/links-core.js + config/links.json).
// Uso: node --test tests/links.test.mjs   (incluso in "npm test")
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkUrl, parseConfig, createLinkStore, hostsFor, SCHEMA, SCHEMA_VERSION } from '../js/links-core.js';
import { PROJECT, LINK_POLICY } from '../js/links-policy.js';

const REAL = readFileSync(new URL('../config/links.json', import.meta.url), 'utf8');
const P = { project: PROJECT, policy: LINK_POLICY };
const cfg = (links, extra = {}) => ({ schema: SCHEMA, schemaVersion: 1, project: PROJECT, updated: '2026-10-23', links, ...extra });

// ------------------------------------------------------------------ la configurazione reale
// Solo regole, non valori: l'invito Discord o un link spento si cambiano nel JSON senza toccare le prove.
test('config/links.json è valida, senza voci scartate, con i link usati dall’interfaccia', () => {
  const p = parseConfig(REAL, P);
  assert.equal(p.ok, true, p.error);
  assert.deepEqual(p.errors, []);
  for (const id of ['github', 'discord', 'kofi']) assert.ok(p.links[id], `manca la voce ${id} (per spegnerla usa "enabled": false)`);
  assert.match(p.updated, /^\d{4}-\d{2}-\d{2}$/, 'manca "updated" (AAAA-MM-GG)');
});

test('config/links.json non contiene segreti né codice', () => {
  assert.doesNotMatch(REAL, /token|secret|password|apikey|api_key|<script|javascript:/i);
  const urls = Object.values(JSON.parse(REAL).links).map((l) => l.url).filter(Boolean);
  assert.equal(new Set(urls).size, urls.length, 'indirizzi duplicati');
});

// ------------------------------------------------------------------ validazione indirizzi
test('checkUrl accetta solo https su domini ammessi', () => {
  const H = ['github.com', 'discord.gg'];
  assert.equal(checkUrl('https://github.com/MashaUP/GameNight_Show', H), 'https://github.com/MashaUP/GameNight_Show');
  assert.equal(checkUrl('  https://gist.github.com/x ', H), 'https://gist.github.com/x', 'sottodominio ammesso, spazi esterni tolti');
  for (const bad of [
    'http://github.com/x', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://github.com',
    'https://user:pw@github.com/', 'https://github.com:8443/', 'https://evil.com/', 'https://github.com.evil.com/',
    'https://evilgithub.com/', 'https://192.168.1.1/', 'https://[::1]/', '//github.com/x', '/relativo', '',
    'https://github.com/a b', 'https://github.com/<x>', 'https://github.com/"x', `https://github.com/${'a'.repeat(2100)}`,
    null, 42, {}, ['https://github.com']
  ]) assert.equal(checkUrl(bad, H), null, `doveva rifiutare ${String(bad).slice(0, 40)}`);
});

test('regole per id: un "discord" non può portare altrove', () => {
  assert.deepEqual(hostsFor('discord', LINK_POLICY), ['discord.gg', 'discord.com']);
  assert.deepEqual(hostsFor('nuovo-link', LINK_POLICY), LINK_POLICY.hosts);
  const p = parseConfig(cfg({ discord: { url: 'https://github.com/x' }, altro: { url: 'https://ko-fi.com/x' } }), P);
  assert.equal(p.ok, true);
  assert.equal(p.links.discord, undefined);
  assert.ok(p.errors.some((e) => e.startsWith('discord')));
  assert.equal(p.links.altro.url, 'https://ko-fi.com/x', 'un link nuovo su un dominio ammesso funziona senza toccare il codice');
});

// ------------------------------------------------------------------ validazione schema
test('configurazioni rotte o estranee vengono rifiutate senza eccezioni', () => {
  const cases = [
    ['{non json', 'bad_json'], ['[]', 'not_object'], ['null', 'not_object'], ['"testo"', 'not_object'],
    [JSON.stringify({ ...cfg({}), schema: 'altro' }), 'bad_schema'],
    [JSON.stringify({ ...cfg({}), schemaVersion: '1' }), 'bad_version'],
    [JSON.stringify({ ...cfg({}), schemaVersion: SCHEMA_VERSION + 1 }), 'incompatible'],
    [JSON.stringify({ ...cfg({}), project: 'un-altro-progetto' }), 'wrong_project'],
    [JSON.stringify({ ...cfg({}), links: [] }), 'no_links'],
    ['x'.repeat(70 * 1024), 'too_large']
  ];
  for (const [input, error] of cases) assert.deepEqual(parseConfig(input, P), { ok: false, error }, error);
});

test('voci sbagliate scartate una per una, le altre restano', () => {
  const p = parseConfig(cfg({
    github: { url: 'https://github.com/MashaUP/GameNight_Show' },
    'ID STRANO': { url: 'https://github.com/x' },
    kofi: 'https://ko-fi.com/mashaup',
    docs: { url: 'https://github.com/x', enabled: 'sì' },
    bugs: { url: 12 },
    ideas: { url: 'https://github.com/i', icon: '<img onerror=x>', label: { it: 'Idee', en: 'Ideas', xx: 5 }, order: 'primo' }
  }), P);
  assert.equal(p.ok, true);
  assert.deepEqual(Object.keys(p.links).sort(), ['github', 'ideas']);
  assert.equal(p.errors.length, 4);
  assert.equal(p.links.ideas.icon, '', 'nome di icona non valido ignorato');
  assert.deepEqual(p.links.ideas.label, { it: 'Idee', en: 'Ideas' });
  assert.equal(p.links.ideas.order, 100);
});

test('link spenti o senza indirizzo non sono cliccabili', () => {
  const p = parseConfig(cfg({
    discord: { url: 'https://discord.gg/abc', enabled: false },
    docs: { url: '', enabled: true },
    bugs: { enabled: true }
  }), P);
  assert.equal(p.links.discord.enabled, false);
  assert.equal(p.links.docs.enabled, false);
  assert.equal(p.links.bugs.enabled, false);
});

test('troppi link: si tengono i primi 50 e si segnala', () => {
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`l${i}`, { url: `https://github.com/${i}` }]));
  const p = parseConfig(cfg(many), P);
  assert.equal(Object.keys(p.links).length, 50);
  assert.ok(p.errors.includes('too_many_links'));
});

// ------------------------------------------------------------------ archivio, cache e rete
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, get: (k) => structuredClone(m.get(k) ?? null), set: (k, v) => { m.set(k, structuredClone(v)); } };
};
// Come chrome.storage.local: tutto asincrono.
const asyncStorage = () => {
  const m = new Map();
  return { m, get: async (k) => structuredClone(m.get(k) ?? null), set: async (k, v) => { m.set(k, structuredClone(v)); } };
};
const res = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const BASE = cfg({
  github: { url: 'https://github.com/MashaUP/GameNight_Show', order: 1 },
  discord: { url: 'https://discord.gg/VECCHIO', order: 2 },
  kofi: { url: 'https://ko-fi.com/mashaup', order: 3 }
}, { updated: '2026-10-20' });
const REMOTE = cfg({ discord: { url: 'https://discord.gg/NUOVO' } }, { updated: '2026-10-25' });
const flush = () => new Promise((r) => setTimeout(r, 0));

function store(o = {}) {
  let clock = o.start ?? 1_000_000;
  const calls = [];
  const s = createLinkStore({
    project: PROJECT, policy: LINK_POLICY,
    loadBaseline: o.baseline ?? (async () => JSON.stringify(BASE)),
    remoteUrl: o.remoteUrl ?? 'https://mashaup.github.io/GameNight_Show/config/links.json',
    storage: o.storage ?? memStorage(),
    fetchFn: async (url, init) => { calls.push({ url, init }); return o.fetch ? o.fetch(url, init) : res(REMOTE); },
    now: () => clock,
    timeoutMs: o.timeoutMs ?? 200,
    onError: o.onError
  });
  return { s, calls, tick: (ms) => { clock += ms; } };
}

test('configurazione remota valida: Discord aggiornato senza nuova versione', async () => {
  const { s, calls } = store();
  await s.load();
  assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO', 'subito la copia inclusa, senza aspettare la rete');
  await flush(); await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.cache, 'no-cache');
  assert.equal(s.url('discord'), 'https://discord.gg/NUOVO');
  assert.equal(s.url('github'), 'https://github.com/MashaUP/GameNight_Show', 'le voci non citate restano quelle incluse');
  assert.equal(s.status().source, 'remote');
});

test('cache: la copia remota buona vale anche offline e senza nuove richieste fino alla scadenza', async () => {
  const storage = memStorage();
  const a = store({ storage }); await a.s.load(); await flush(); await flush();
  const b = store({ storage, fetch: () => { throw new TypeError('Failed to fetch'); } });
  await b.s.load();
  assert.equal(b.s.url('discord'), 'https://discord.gg/NUOVO');
  assert.equal(b.s.status().source, 'cache');
  await flush();
  assert.equal(b.calls.length, 0, 'entro 6 ore niente richieste inutili');
});

test('scaduta la cache si ricontrolla; un errore non cancella i link buoni e rimanda il tentativo', async () => {
  const storage = memStorage();
  const a = store({ storage }); await a.s.load(); await flush(); await flush();
  const errors = [];
  const b = store({ storage, start: 1_000_000 + 7 * 3600e3, fetch: () => { throw new TypeError('Failed to fetch'); }, onError: (c) => errors.push(c) });
  await b.s.load(); await flush(); await flush();
  assert.equal(b.calls.length, 1);
  assert.deepEqual(errors, ['network']);
  assert.equal(b.s.url('discord'), 'https://discord.gg/NUOVO');
  const c = store({ storage, start: 1_000_000 + 7 * 3600e3 + 60e3 });
  await c.s.load(); await flush();
  assert.equal(c.calls.length, 0, 'dopo un errore si aspetta mezz’ora prima di riprovare');
});

test('server non disponibile, JSON rotto, configurazione non valida o troppo lenta: resta la copia inclusa', async () => {
  for (const [name, fetch, code] of [
    ['404', () => res('Not found', 404), 'http_404'],
    ['500', () => res('err', 500), 'http_500'],
    ['offline', () => { throw new TypeError('Failed to fetch'); }, 'network'],
    ['json rotto', () => res('{"schema": "mashaup.links",'), 'bad_json'],
    ['progetto sbagliato', () => res({ ...REMOTE, project: 'altro' }), 'wrong_project'],
    ['schema futuro', () => res({ ...REMOTE, schemaVersion: 99 }), 'incompatible'],
    ['lentissimo', (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))), 'timeout']
  ]) {
    const errors = [];
    const { s } = store({ fetch, onError: (c) => errors.push(c) });
    await s.load();
    const r = await s.refresh({ force: true });
    assert.deepEqual(r, { ok: false, error: code }, name);
    assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO', name);
    assert.equal(s.status().source, 'baseline', name);
    assert.ok(errors.includes(code), name);
  }
});

test('indirizzo malevolo nella copia remota: scartato, resta quello incluso', async () => {
  const { s } = store({ fetch: () => res(cfg({ discord: { url: 'https://disc0rd-gift.example/x' }, kofi: { url: 'javascript:alert(1)' } }, { updated: '2026-10-30' })) });
  await s.load(); await s.refresh({ force: true });
  assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO');
  assert.equal(s.url('kofi'), 'https://ko-fi.com/mashaup');
});

test('la copia remota può spegnere un link (enabled: false)', async () => {
  const { s } = store({ fetch: () => res(cfg({ discord: { url: 'https://discord.gg/VECCHIO', enabled: false } }, { updated: '2026-10-30' })) });
  await s.load(); await s.refresh({ force: true });
  assert.equal(s.get('discord'), null);
  assert.deepEqual(s.list().map((e) => e.id), ['github', 'kofi']);
});

test('una copia salvata più vecchia di quella inclusa nella nuova versione viene ignorata', async () => {
  const storage = memStorage({ 'links:gamenight-show': { at: 1_000_000, data: cfg({ discord: { url: 'https://discord.gg/ANTICO' } }, { updated: '2026-01-01' }) } });
  const { s } = store({ storage, remoteUrl: '' });
  await s.load();
  assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO');
  const older = store({ fetch: () => res(cfg({ discord: { url: 'https://discord.gg/ANTICO' } }, { updated: '2026-01-01' })) });
  await older.s.load();
  assert.deepEqual(await older.s.refresh({ force: true }), { ok: false, error: 'older_than_app' });
});

test('sito (senza copia remota): il file modificato vale subito, anche con la stessa data della copia salvata', async () => {
  const storage = memStorage({ 'links:gamenight-show': { at: 5, data: { ...BASE, links: { ...BASE.links, discord: { url: 'https://discord.gg/PRIMA' } } } } });
  const { s } = store({ storage, remoteUrl: '' });
  await s.load();
  assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO');
  assert.equal(storage.m.get('links:gamenight-show').data.links.discord.url, 'https://discord.gg/VECCHIO', 'la riserva viene aggiornata');
});

test('copia salvata manomessa o rovinata: ignorata senza errori', async () => {
  for (const bad of [{ at: 5, data: '{rotto' }, { at: 5, data: { ...REMOTE, links: { discord: { url: 'https://evil.com' } } } }, 'stringa', 42]) {
    const { s } = store({ storage: memStorage({ 'links:gamenight-show': bad }), remoteUrl: '' });
    await s.load();
    assert.equal(s.url('discord'), 'https://discord.gg/VECCHIO');
  }
});

test('copia inclusa illeggibile: si usa l’ultima salvata; se manca tutto, nessun link e nessun crash', async () => {
  const storage = memStorage({ 'links:gamenight-show': { at: 5, data: REMOTE } });
  const a = store({ storage, remoteUrl: '', baseline: async () => { throw new Error('offline'); } });
  await a.s.load();
  assert.equal(a.s.url('discord'), 'https://discord.gg/NUOVO');
  const b = store({ remoteUrl: '', baseline: async () => '<html>404</html>' });
  await b.s.load();
  assert.deepEqual(b.s.list(), []);
  assert.equal(b.s.get('github'), null);
});

test('memoria non disponibile (storage che lancia eccezioni): funziona lo stesso', async () => {
  const broken = { get() { throw new Error('SecurityError'); }, set() { throw new Error('QuotaExceeded'); } };
  const { s } = store({ storage: broken });
  await s.load(); await s.refresh({ force: true });
  assert.equal(s.url('discord'), 'https://discord.gg/NUOVO');
});

test('adattatore asincrono stile chrome.storage.local', async () => {
  const storage = asyncStorage();
  const a = store({ storage }); await a.s.load(); await flush(); await flush(); await flush();
  assert.equal(storage.m.get('links:gamenight-show').data.links.discord.url, 'https://discord.gg/NUOVO');
  const b = store({ storage }); await b.s.load();
  assert.equal(b.s.url('discord'), 'https://discord.gg/NUOVO');
});

test('refresh forzato: salta le cache intermedie e le richieste contemporanee si uniscono', async () => {
  const { s, calls } = store();
  await s.load({ autoRefresh: false });
  await Promise.all([s.refresh({ force: true }), s.refresh({ force: true })]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\?t=\d+$/);
});

test('senza indirizzo remoto (sito): nessuna richiesta esterna, si ricorda l’ultima copia buona', async () => {
  const storage = memStorage();
  const { s, calls } = store({ remoteUrl: '', storage });
  await s.load(); await flush();
  assert.equal(calls.length, 0);
  assert.equal(storage.m.get('links:gamenight-show').data.updated, '2026-10-20');
  assert.deepEqual(await s.refresh(), { ok: false, error: 'no_remote' });
});

test('ordine dell’elenco, avvisi ai componenti e componenti difettosi isolati', async () => {
  const { s } = store({ remoteUrl: '' });
  let seen = 0;
  s.subscribe(() => { throw new Error('componente rotto'); });
  s.subscribe(() => { seen++; });
  await s.load();
  assert.ok(seen >= 1);
  assert.deepEqual(s.list().map((e) => e.id), ['github', 'discord', 'kofi']);
  assert.deepEqual(s.list({ exclude: ['kofi'] }).map((e) => e.id), ['github', 'discord']);
});
