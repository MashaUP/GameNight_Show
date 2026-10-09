// Cassaforte della serata sul dispositivo della regia (IndexedDB).
// - "current" più tre copie precedenti a rotazione, ognuna con il suo checksum:
//   se l'ultima si rovina si recupera quella prima;
// - istantanee prima delle azioni rischiose (la "macchina del tempo");
// - cronologia degli eventi della serata.
// Se IndexedDB non è disponibile (navigazione privata) si ripiega su localStorage.

export const SCHEMA_VERSION = 2;
const DB_NAME = 'gnr_vault';
const MAX_SNAPS = 60;
const MAX_LOG = 400;
let dbPromise = null;

/** Checksum FNV-1a a 32 bit (veloce, serve a riconoscere un salvataggio rovinato). */
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('slots', { keyPath: 'key' });
      db.createObjectStore('snaps', { keyPath: 'id', autoIncrement: true }).createIndex('room', 'room');
      db.createObjectStore('log', { keyPath: 'id', autoIncrement: true }).createIndex('room', 'room');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb-blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });
}
function reqP(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

function record(key, room, data, extra = {}) {
  const json = JSON.stringify({ ...data, schema: SCHEMA_VERSION });
  return { key, room, at: Date.now(), json, sum: checksum(json), size: json.length, ...extra };
}

/** Legge un record e controlla che il contenuto corrisponda al checksum. */
function verified(rec) {
  if (!rec?.json || checksum(rec.json) !== rec.sum) return null;
  try { return JSON.parse(rec.json); } catch { return null; }
}

const lsKey = (room) => `gnr_backup_${room}`;

export const Vault = {
  available: null,

  async ready() {
    if (this.available !== null) return this.available;
    try { await open(); this.available = true; } catch { this.available = false; }
    return this.available;
  },

  /**
   * Salvataggio atomico: current → b1 → b2 → b3 in una sola transazione.
   * info: piccolo riassunto (gruppo, giochi, giocatori) per la schermata di ripresa.
   */
  async saveCurrent(room, data, info = {}) {
    const rec = record(`${room}:current`, room, data, { info, closed: false });
    if (!(await this.ready())) {
      try { localStorage.setItem(lsKey(room), rec.json); } catch { /* spazio pieno */ }
      return { at: rec.at, sum: rec.sum };
    }
    const db = await open();
    const tx = db.transaction('slots', 'readwrite');
    const st = tx.objectStore('slots');
    const [cur, b1, b2] = await Promise.all(['current', 'b1', 'b2'].map((s) => reqP(st.get(`${room}:${s}`))));
    if (cur && cur.sum === rec.sum) { tx.abort(); return { at: cur.at, sum: cur.sum, same: true }; }
    if (b2) st.put({ ...b2, key: `${room}:b3` });
    if (b1) st.put({ ...b1, key: `${room}:b2` });
    if (cur) st.put({ ...cur, key: `${room}:b1` });
    st.put(rec);
    await done(tx);
    return { at: rec.at, sum: rec.sum };
  },

  /** L'ultima copia valida della serata (se la più recente è rovinata, quella prima). */
  async loadCurrent(room) {
    if (!(await this.ready())) {
      try {
        const raw = localStorage.getItem(lsKey(room));
        return raw ? { data: JSON.parse(raw), at: JSON.parse(raw).at || 0, slot: 'local', fallback: false } : null;
      } catch { return null; }
    }
    const db = await open();
    const st = db.transaction('slots').objectStore('slots');
    for (const slot of ['current', 'b1', 'b2', 'b3']) {
      const rec = await reqP(st.get(`${room}:${slot}`));
      const data = verified(rec);
      if (data) return { data, at: rec.at, slot, fallback: slot !== 'current', info: rec.info, closed: rec.closed };
    }
    return null;
  },

  /** Stato delle copie a rotazione (per il pannello Strumenti). */
  async slots(room) {
    if (!(await this.ready())) return [];
    const db = await open();
    const st = db.transaction('slots').objectStore('slots');
    const out = [];
    for (const slot of ['current', 'b1', 'b2', 'b3']) {
      const rec = await reqP(st.get(`${room}:${slot}`));
      if (rec) out.push({ slot, at: rec.at, ok: Boolean(verified(rec)), size: rec.size });
    }
    return out;
  },

  /** Segna la serata come chiusa: non verrà più proposta come "sessione interrotta". */
  async close(room) {
    if (!(await this.ready())) return;
    const db = await open();
    const tx = db.transaction('slots', 'readwrite');
    const st = tx.objectStore('slots');
    const cur = await reqP(st.get(`${room}:current`));
    if (cur) st.put({ ...cur, closed: true });
    await done(tx);
  },

  /** Serate salvate su questo dispositivo e non chiuse, dalla più recente. */
  async sessions(maxAgeH = 36) {
    if (!(await this.ready())) return [];
    const db = await open();
    const all = await reqP(db.transaction('slots').objectStore('slots').getAll());
    const cutoff = Date.now() - maxAgeH * 3600000;
    return all
      .filter((r) => r.key.endsWith(':current') && !r.closed && r.at >= cutoff && verified(r))
      .map((r) => ({ room: r.room, at: r.at, info: r.info || {} }))
      .sort((a, b) => b.at - a.at);
  },

  /** Istantanea con un'etichetta ("Prima del reveal di Dixit"). */
  async snapshot(room, label, data, kind = 'auto') {
    if (!(await this.ready())) return null;
    const db = await open();
    const rec = record(undefined, room, data, { label, kind });
    delete rec.key;
    const tx = db.transaction('snaps', 'readwrite');
    const st = tx.objectStore('snaps');
    const id = await reqP(st.add(rec));
    const keys = await reqP(st.index('room').getAllKeys(room));
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SNAPS))) st.delete(k);
    await done(tx);
    return id;
  },

  /** Elenco delle istantanee (senza il contenuto), dalla più recente. */
  async snapshots(room) {
    if (!(await this.ready())) return [];
    const db = await open();
    const all = await reqP(db.transaction('snaps').objectStore('snaps').index('room').getAll(room));
    return all.map((r) => ({ id: r.id, at: r.at, label: r.label, kind: r.kind, ok: Boolean(verified(r)), size: r.size })).sort((a, b) => b.at - a.at);
  },

  async getSnapshot(id) {
    if (!(await this.ready())) return null;
    const db = await open();
    const rec = await reqP(db.transaction('snaps').objectStore('snaps').get(id));
    return verified(rec);
  },

  /** Un evento nella cronologia della serata. */
  async log(room, text, icon = '•') {
    if (!(await this.ready())) return;
    const db = await open();
    const tx = db.transaction('log', 'readwrite');
    const st = tx.objectStore('log');
    st.add({ room, at: Date.now(), text: String(text).slice(0, 140), icon });
    const keys = await reqP(st.index('room').getAllKeys(room));
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_LOG))) st.delete(k);
    await done(tx);
  },

  async logs(room, limit = 80) {
    if (!(await this.ready())) return [];
    const db = await open();
    const all = await reqP(db.transaction('log').objectStore('log').index('room').getAll(room));
    return all.sort((a, b) => b.at - a.at).slice(0, limit);
  },

  /** Byte occupati dalle copie di questo dispositivo (per stanza e in tutto). */
  async usage() {
    const out = { rooms: {}, total: 0, snaps: 0, log: 0 };
    if (!(await this.ready())) return out;
    const db = await open();
    const tx = db.transaction(['slots', 'snaps', 'log']);
    const [slots, snaps, log] = await Promise.all(['slots', 'snaps', 'log'].map((s) => reqP(tx.objectStore(s).getAll())));
    for (const r of [...slots, ...snaps]) {
      out.rooms[r.room] = (out.rooms[r.room] || 0) + (r.size || 0);
      out.total += r.size || 0;
    }
    out.snaps = snaps.length;
    out.log = log.length;
    out.total += log.length * 120;
    return out;
  },

  /** Cancella le copie delle serate più vecchie di `days` giorni (tranne `keep`). */
  async prune(days = 30, keep = null) {
    if (!(await this.ready())) return 0;
    const db = await open();
    const cutoff = Date.now() - days * 86400000;
    const tx = db.transaction(['slots', 'snaps', 'log'], 'readwrite');
    let n = 0;
    for (const name of ['slots', 'snaps', 'log']) {
      const st = tx.objectStore(name);
      const all = await reqP(st.getAll());
      for (const r of all) {
        if (r.room === keep || r.at >= cutoff) continue;
        st.delete(name === 'slots' ? r.key : r.id);
        n++;
      }
    }
    await done(tx);
    return n;
  }
};

/** Spazio del browser (quota) e richiesta di non cancellare i dati di questo sito. */
export async function storageInfo() {
  const out = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) Object.assign(out, await navigator.storage.estimate());
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch { /* non disponibile */ }
  return out;
}
export function askPersistence() {
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* non disponibile */ }
}

// ---------------------------------------------------------------------------
// File di backup: versione del formato, migrazioni, controllo della struttura
// ---------------------------------------------------------------------------

const STATUS = new Set(['voting', 'revealed']);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const num = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const str = (v, max) => typeof v === 'string' && v.length >= 1 && v.length <= max;

/** Aggiunge versione del formato e checksum a una copia da scaricare. */
export function sealBackup(data) {
  const body = { ...data, schema: SCHEMA_VERSION };
  delete body.sum;
  return { ...body, sum: checksum(JSON.stringify(body)) };
}

/** Porta un vecchio salvataggio al formato attuale. */
export function migrate(data) {
  const d = { ...data };
  let v = Number(d.schema) || 1;
  if (v < 2) {
    // v1 (fino alla 2.4): niente stato, niente cestino, niente versione
    d.state = isObj(d.state) ? d.state : null;
    d.kind = d.kind || 'night';
    v = 2;
  }
  d.schema = v;
  return d;
}

/**
 * Controlla un file di backup prima di importarlo.
 * Restituisce { ok, errors, warnings, tampered, data } (data già migrato).
 */
export function validateBackup(raw, expect = 'night') {
  const errors = [];
  const warnings = [];
  let obj = raw;
  if (typeof raw === 'string') {
    if (raw.length > 60 * 1024 * 1024) return { ok: false, errors: ['Il file è troppo grande (oltre 60 MB).'], warnings };
    try { obj = JSON.parse(raw); } catch (e) { return { ok: false, errors: [`File corrotto: non è un JSON valido (${String(e.message).slice(0, 80)}).`], warnings }; }
  }
  if (!isObj(obj) || !['GameNight_Show', 'GameNight_Rank'].includes(obj.app)) return { ok: false, errors: ['Questo file non è una copia di GameNight Show.'], warnings };
  if (Number(obj.schema) > SCHEMA_VERSION) return { ok: false, errors: [`Il file viene da una versione più nuova dell’app (formato ${obj.schema}): aggiorna la pagina e riprova.`], warnings };
  let tampered = false;
  if (obj.sum) {
    const body = { ...obj };
    delete body.sum;
    tampered = checksum(JSON.stringify(body)) !== obj.sum;
    if (tampered) warnings.push('Il file è stato modificato dopo il salvataggio (il checksum non corrisponde).');
  }
  const d = migrate(obj);
  const kind = d.kind || 'night';
  if (kind !== expect) return { ok: false, errors: [expect === 'night' ? 'Questo è il backup di un gruppo, non di una serata.' : 'Questo è il backup di una serata, non di un gruppo.'], warnings };

  if (expect === 'night') {
    if (!isObj(d.players)) errors.push('Mancano i giocatori.');
    if (!isObj(d.games)) errors.push('Mancano i giochi.');
    if (d.votes !== undefined && d.votes !== null && !isObj(d.votes)) errors.push('I voti non sono nel formato giusto.');
    if (errors.length) return { ok: false, errors, warnings, tampered };
    for (const [uid, p] of Object.entries(d.players)) {
      if (!KEY_RE.test(uid)) { errors.push(`Codice giocatore non valido: ${uid.slice(0, 20)}`); continue; }
      if (!isObj(p) || !str(p.name, 16)) errors.push(`Giocatore senza nome valido (${uid.slice(0, 8)}).`);
      else if (p.color && !/^#[0-9A-Fa-f]{6}$/.test(p.color)) errors.push(`Colore non valido per ${p.name}.`);
      if (isObj(p) && p.photo && !(typeof p.photo === 'string' && p.photo.startsWith('data:image/'))) errors.push(`Foto non valida per ${p.name}.`);
    }
    for (const [gid, g] of Object.entries(d.games)) {
      if (!KEY_RE.test(gid)) { errors.push(`Codice gioco non valido: ${gid.slice(0, 20)}`); continue; }
      if (!isObj(g) || !str(g.name, 40)) errors.push(`Gioco senza nome valido (${gid.slice(0, 8)}).`);
      else if (g.status && !STATUS.has(g.status)) errors.push(`Stato sconosciuto per ${g.name}: ${String(g.status).slice(0, 12)}.`);
      if (isObj(g) && g.image && typeof g.image !== 'string') errors.push(`Foto non valida per ${g.name}.`);
    }
    for (const [gid, gv] of Object.entries(d.votes || {})) {
      if (!d.games[gid]) { warnings.push('Voti di un gioco che non c’è più: verranno ignorati.'); continue; }
      if (!isObj(gv)) { errors.push(`Voti illeggibili per ${d.games[gid].name}.`); continue; }
      for (const [uid, v] of Object.entries(gv)) {
        const who = d.players[uid]?.name || 'un ex giocatore';
        if (!isObj(v) || !num(v.overall, 1, 10)) { errors.push(`Voto fuori scala di ${who} a ${d.games[gid].name}.`); continue; }
        for (const k of ['coinv', 'sempl', 'rigioc', 'c1', 'c2']) if (v[k] !== undefined && v[k] !== null && !num(v[k], 1, 5)) errors.push(`${k} fuori scala nel voto di ${who} a ${d.games[gid].name}.`);
        if (v.guess !== undefined && v.guess !== null && !num(v.guess, 1, 10)) errors.push(`Previsione fuori scala di ${who}.`);
        if (!d.players[uid]) warnings.push(`Un voto a ${d.games[gid].name} è di un giocatore che non c’è nel file.`);
      }
    }
  } else {
    if (!isObj(d.group) || !/^[A-Z0-9]{6}$/.test(d.group.id || '')) errors.push('Manca il codice del gruppo.');
    for (const [k, it] of Object.entries(d.library || {})) {
      if (!KEY_RE.test(k) || !isObj(it) || !str(it.name, 40)) { errors.push(`Gioco dell’armadio non valido (${String(k).slice(0, 10)}).`); }
    }
    for (const [room, n] of Object.entries(d.nights || {})) {
      if (!/^[A-Z0-9]{4}$/.test(room) || !isObj(n) || !isObj(n.games || {}) || !num(Number(n.at), 0, 1e14)) errors.push(`Serata non valida (${String(room).slice(0, 8)}).`);
    }
  }
  // Niente doppioni, niente esplosioni: al massimo i primi 8 problemi
  const uniq = (a) => [...new Set(a)].slice(0, 8);
  return { ok: errors.length === 0, errors: uniq(errors), warnings: uniq(warnings), tampered, data: d };
}
