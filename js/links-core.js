// links-core.js — Link ufficiali con configurazione remota (formato "mashaup.links", schema 1).
//
// Modulo autonomo e riutilizzabile: niente DOM, niente dipendenze, nessuna conoscenza di
// GameNight Show. Funziona nel browser, in un'app Capacitor, nel service worker di
// un'estensione Chrome (Manifest V3) e in Node 18+. Ogni progetto gli passa:
//   - project:      identificativo del progetto (deve coincidere con "project" nel JSON)
//   - policy:       domini ammessi, decisi nel CODICE (la configurazione remota non può allargarli)
//   - loadBaseline: funzione che restituisce la configurazione inclusa nel pacchetto (testo o oggetto)
//   - remoteUrl:    indirizzo pubblico della stessa configurazione, aggiornabile senza rilasci ('' = nessuno)
//   - storage:      { get(key), set(key, value) } sincrono o asincrono (localStorage, chrome.storage.local…)
//
// La configurazione contiene solo DATI: indirizzi, etichette, nomi di icone. Non viene mai
// eseguito nulla di ciò che arriva da fuori, e ogni voce viene validata prima dell'uso.
// Guida completa: docs/LINKS.md

export const SCHEMA = 'mashaup.links';
export const SCHEMA_VERSION = 1;          // aumenta solo con modifiche NON compatibili del formato
export const MAX_BYTES = 64 * 1024;        // una configurazione di link è minuscola: oltre è un errore
export const MAX_LINKS = 50;
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const ICON_RE = /^[a-z][a-z0-9-]{0,23}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BAD_CHARS = /[\s<>"'`\\\u0000-\u001f\u007f]/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Il dominio `host` è `rule` o un suo sottodominio? */
function hostMatches(host, rule) {
  return host === rule || host.endsWith(`.${rule}`);
}

/** Domini ammessi per un certo link: regola specifica se c'è, altrimenti l'elenco generale. */
export function hostsFor(id, policy = {}) {
  const own = policy.byId && Array.isArray(policy.byId[id]) ? policy.byId[id] : null;
  return own || (Array.isArray(policy.hosts) ? policy.hosts : []);
}

/**
 * Controlla un indirizzo: solo https, nessuna credenziale, nessuna porta, nessun indirizzo IP,
 * dominio nell'elenco ammesso. Restituisce l'indirizzo normalizzato oppure null.
 */
export function checkUrl(raw, hosts = []) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048 || BAD_CHARS.test(s)) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!host || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null;
  if (!hosts.some((h) => typeof h === 'string' && h && hostMatches(host, h.toLowerCase()))) return null;
  return u.href;
}

function cleanLabel(v) {
  const one = (x) => (typeof x === 'string' && x.trim() && x.length <= 80 ? x.trim() : null);
  if (typeof v === 'string') return one(v);
  if (!isObj(v)) return null;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (/^[a-z]{2}$/.test(k) && one(x)) out[k] = one(x);
  return Object.keys(out).length ? out : null;
}

/**
 * Legge e valida una configurazione (testo JSON o oggetto già letto).
 * Esito: { ok: true, links, updated, errors } oppure { ok: false, error }.
 * Una voce sbagliata viene scartata da sola (errors) senza invalidare le altre.
 */
export function parseConfig(input, { project = '', policy = {} } = {}) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > MAX_BYTES) return { ok: false, error: 'too_large' };
    try { data = JSON.parse(input); } catch { return { ok: false, error: 'bad_json' }; }
  }
  if (!isObj(data)) return { ok: false, error: 'not_object' };
  if (data.schema !== SCHEMA) return { ok: false, error: 'bad_schema' };
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return { ok: false, error: 'bad_version' };
  if (data.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'incompatible' };
  if (project && data.project !== project) return { ok: false, error: 'wrong_project' };
  if (!isObj(data.links)) return { ok: false, error: 'no_links' };
  const updated = typeof data.updated === 'string' && DATE_RE.test(data.updated) ? data.updated : '';
  const errors = [];
  const links = {};
  const entries = Object.entries(data.links);
  if (entries.length > MAX_LINKS) errors.push('too_many_links');
  for (const [id, e] of entries.slice(0, MAX_LINKS)) {
    if (!ID_RE.test(id)) { errors.push(`${id.slice(0, 40)}: bad_id`); continue; }
    if (!isObj(e)) { errors.push(`${id}: not_object`); continue; }
    if (e.enabled !== undefined && typeof e.enabled !== 'boolean') { errors.push(`${id}: bad_enabled`); continue; }
    if (e.url !== undefined && typeof e.url !== 'string') { errors.push(`${id}: bad_url`); continue; }
    const hasUrl = typeof e.url === 'string' && e.url.trim() !== '';
    const url = hasUrl ? checkUrl(e.url, hostsFor(id, policy)) : '';
    if (hasUrl && !url) { errors.push(`${id}: bad_url`); continue; }
    links[id] = {
      id,
      url,
      // Un link senza indirizzo resta spento anche se "enabled" è vero: niente pulsanti verso il nulla.
      enabled: e.enabled !== false && !!url,
      icon: typeof e.icon === 'string' && ICON_RE.test(e.icon) ? e.icon : '',
      label: cleanLabel(e.label),
      order: Number.isFinite(e.order) ? e.order : 100
    };
  }
  return { ok: true, links, updated, errors };
}

/** Sovrappone `over` a `base`: ogni voce valida di `over` sostituisce quella con lo stesso id. */
export function mergeLinks(base = {}, over = {}) {
  return { ...base, ...over };
}

const later = (a, b) => (a || '') >= (b || '');

/**
 * Crea l'archivio dei link di un progetto.
 * load() non lancia mai eccezioni e non aspetta la rete: usa subito la copia inclusa e quella
 * salvata, poi (se è il momento) controlla la copia remota in background.
 */
export function createLinkStore(opts) {
  const {
    project,
    policy = {},
    loadBaseline = async () => null,
    remoteUrl = '',
    storage = null,
    fetchFn = typeof fetch === 'function' ? (...a) => fetch(...a) : null,
    now = () => Date.now(),
    ttlMs = 6 * 3600e3,          // al massimo un controllo ogni 6 ore…
    retryMs = 30 * 60e3,         // …e dopo un errore si riprova non prima di 30 minuti
    timeoutMs = 5000,
    key = `links:${project}`,
    onError = null               // (codice, dettagli) → per un registro diagnostico, facoltativo
  } = opts || {};

  let base = { links: {}, updated: '' };
  let over = null;          // configurazione salvata o remota, se più recente della copia inclusa
  let fresh = false;        // `over` è arrivata dalla rete in questa sessione
  let cache = null;         // { at, failAt, error, data }
  let state = {};
  let lastError = '';
  let inflight = null;
  let readyPromise = null;
  const subs = new Set();

  const report = (code, detail) => { lastError = code; try { onError?.(code, detail); } catch { /* il registro non deve rompere nulla */ } };
  const parse = (x) => parseConfig(x, { project, policy });

  async function readCache() {
    if (!storage) return null;
    try {
      const v = await storage.get(key);
      return isObj(v) ? v : null;
    } catch { return null; }
  }
  async function writeCache(v) {
    cache = v;
    if (!storage) return;
    try { await storage.set(key, v); } catch { /* memoria piena o non disponibile: si continua senza */ }
  }

  function recompute() {
    state = mergeLinks(base.links, over ? over.links : {});
    for (const fn of subs) { try { fn(api); } catch { /* un componente rotto non ferma gli altri */ } }
  }

  /** Usa `p` come sovrapposizione solo se non è più vecchia della copia inclusa nell'app. */
  function adopt(p) {
    if (!p || !p.ok || !later(p.updated, base.updated)) return false;
    over = p;
    return true;
  }

  function due(force) {
    if (!remoteUrl || !fetchFn) return false;
    if (force) return true;
    const t = now();
    if (cache?.failAt && t - cache.failAt < retryMs) return false;
    return !cache?.at || t - cache.at > ttlMs;
  }

  async function refresh({ force = false } = {}) {
    if (!remoteUrl || !fetchFn) return { ok: false, error: 'no_remote' };
    if (inflight) return inflight;
    inflight = (async () => {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        let url = remoteUrl;
        // Su richiesta esplicita si salta anche la cache intermedia del browser e della rete.
        if (force) url += (url.includes('?') ? '&' : '?') + `t=${now()}`;
        const res = await fetchFn(url, { cache: 'no-cache', credentials: 'omit', redirect: 'follow', signal: ctrl?.signal });
        if (!res || !res.ok) throw Object.assign(new Error('http'), { code: `http_${res ? res.status : 0}` });
        const text = await res.text();
        const p = parse(text);
        if (!p.ok) throw Object.assign(new Error('invalid'), { code: p.error });
        if (p.errors.length) report('entries_skipped', p.errors);
        if (!later(p.updated, base.updated)) throw Object.assign(new Error('old'), { code: 'older_than_app' });
        await writeCache({ at: now(), data: JSON.parse(text) });
        over = p; fresh = true; lastError = '';
        recompute();
        return { ok: true };
      } catch (e) {
        const code = e?.code || (e?.name === 'AbortError' ? 'timeout' : 'network');
        report(code, e?.message);
        await writeCache({ ...(cache || {}), failAt: now(), error: code });
        return { ok: false, error: code };
      } finally {
        if (timer) clearTimeout(timer);
        inflight = null;
      }
    })();
    return inflight;
  }

  async function load({ autoRefresh = true } = {}) {
    let raw = null;
    let b = null;
    try {
      raw = await loadBaseline();
      if (typeof raw === 'string') raw = raw.length <= MAX_BYTES ? JSON.parse(raw) : null;
      b = parse(raw);
    } catch { b = null; }
    if (b?.ok) { base = b; if (b.errors.length) report('entries_skipped', b.errors); } else report('baseline_unavailable', b?.error);
    over = null;
    cache = await readCache();
    const c = cache?.data ? parse(cache.data) : null;
    if (c?.ok) {
      // Copia inclusa illeggibile: vale l'ultima salvata.
      if (!b?.ok) over = c;
      // Copia remota salvata: vale se non è più vecchia di quella inclusa nell'app.
      // (Senza indirizzo remoto la copia salvata è solo una riserva: la inclusa è già la più recente.)
      else if (remoteUrl) adopt(c);
    }
    // Senza indirizzo remoto (es. il sito stesso, dove la copia inclusa È quella pubblicata)
    // si ricorda l'ultima copia buona: serve se un giorno il file non si potesse leggere.
    if (!remoteUrl && b?.ok && JSON.stringify(raw) !== JSON.stringify(cache?.data)) {
      await writeCache({ at: now(), data: raw });
    }
    recompute();
    if (autoRefresh && due(false)) refresh().catch(() => {});
    return api;
  }

  const api = {
    /** Avvia il caricamento una sola volta; le chiamate successive riusano la stessa promessa. */
    ready() { return (readyPromise ||= load()); },
    load,
    refresh,
    /** Link attivo e valido con questo id, oppure null. */
    get(id) {
      const e = state[id];
      return e && e.enabled && e.url ? e : null;
    },
    url(id) { return api.get(id)?.url || ''; },
    /** Link attivi, in ordine ("order", poi id). */
    list({ exclude = [] } = {}) {
      return Object.values(state)
        .filter((e) => e.enabled && e.url && !exclude.includes(e.id))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    },
    status() {
      return {
        source: over ? (fresh ? 'remote' : 'cache') : 'baseline',
        updated: (over || base).updated,
        checkedAt: cache?.at || 0,
        error: lastError,
        remote: !!remoteUrl
      };
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
  return api;
}
