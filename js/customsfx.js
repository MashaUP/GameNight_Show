// Soundboard personalizzata (1.10): suoni caricati dalla TV, che i telefoni possono far partire.
//
// I file audio restano SOLO sul computer della TV (IndexedDB "gnr_sounds"): niente audio su Firebase
// (il piano gratuito ha 1 GB in tutto). Nel database va solo l'elenco — nome e icona — in
// rooms/<codice>/meta/customSfx, così i telefoni mostrano i pulsanti; il suono parte dalla TV come
// quelli predefiniti (rooms/<codice>/sfx con k = "c:<id>").
//
// Limiti: 16 suoni, 400 KB e 15 secondi ciascuno, solo formati audio comuni.
const DB = 'gnr_sounds';
const STORE = 'sounds';
export const CSFX_MAX = 16;
export const CSFX_MAX_BYTES = 400 * 1024;
export const CSFX_MAX_SECS = 15;
const TYPES = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|aac|x-m4a)$/;
export const CSFX_ICONS = ['🔔', '📯', '🥁', '🎺', '🎉', '😂', '😱', '👏', '💥', '🐔', '🦆', '🚨', '🎵', '🤖', '👻', '🏆'];
const ID = /^c[a-z0-9]{1,8}$/;

/** Elenco da pubblicare nella stanza: { id: { l, i } } con testi puliti. */
export function publicList(list) {
  const out = {};
  for (const s of (list || []).slice(0, CSFX_MAX)) {
    if (!ID.test(s.id)) continue;
    out[s.id] = { l: String(s.label || '').replace(/[<>]/g, '').trim().slice(0, 24) || '?', i: CSFX_ICONS.includes(s.icon) ? s.icon : '🔔' };
  }
  return out;
}

/** Chiave del suono nella stanza ("c:abc") e lettura inversa. */
export const sfxKey = (id) => `c:${id}`;
export const customIdOf = (k) => (typeof k === 'string' && k.startsWith('c:') && ID.test(k.slice(2)) ? k.slice(2) : null);

/** Controlla un file prima di salvarlo: '' se va bene, altrimenti il codice dell'errore. */
export function checkFile(file, count = 0) {
  if (!file) return 'none';
  if (count >= CSFX_MAX) return 'full';
  if (!TYPES.test(file.type || '')) return 'type';
  if (file.size > CSFX_MAX_BYTES) return 'size';
  return '';
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('idb'));
  });
}
async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let out;
    const req = fn(tx.objectStore(STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Durata di un file audio (secondi), letta dal browser. */
function duration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    a.src = url;
  });
}

const playing = new Set();
const urls = new Map();

export const CustomSounds = {
  cache: [],
  /** Tutti i suoni (senza i file), in ordine. */
  async list() {
    try {
      const all = await run('readonly', (st) => st.getAll());
      this.cache = (all || []).map(({ blob, ...rest }) => ({ ...rest, has: Boolean(blob) })).sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch { this.cache = []; }
    return this.cache;
  },
  async add(file, { label = '', icon = '🔔' } = {}) {
    const list = await this.list();
    const bad = checkFile(file, list.length);
    if (bad) throw Object.assign(new Error(bad), { code: bad });
    const secs = await duration(file);
    if (secs === null) throw Object.assign(new Error('unreadable'), { code: 'unreadable' });
    if (secs > CSFX_MAX_SECS + 0.3) throw Object.assign(new Error('long'), { code: 'long' });
    const id = `c${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 36).toString(36)}`;
    const rec = { id, label: (label || String(file.name || '').replace(/\.[a-z0-9]+$/i, '')).replace(/[<>]/g, '').trim().slice(0, 24) || '?', icon: CSFX_ICONS.includes(icon) ? icon : '🔔', volume: 0.8, secs: Math.round(secs * 10) / 10, size: file.size, type: file.type, at: Date.now(), order: list.length, blob: file };
    await run('readwrite', (st) => st.put(rec));
    await this.list();
    return rec.id;
  },
  async update(id, patch) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const g = st.get(id);
      g.onsuccess = () => {
        const cur = g.result;
        if (!cur) return;
        const next = { ...cur };
        if (patch.label !== undefined) next.label = String(patch.label).replace(/[<>]/g, '').trim().slice(0, 24) || cur.label;
        if (patch.icon !== undefined && CSFX_ICONS.includes(patch.icon)) next.icon = patch.icon;
        if (patch.volume !== undefined) next.volume = Math.min(1, Math.max(0, Number(patch.volume) || 0));
        if (patch.order !== undefined) next.order = Number(patch.order) || 0;
        st.put(next);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    urls.delete(id);
    await this.list();
  },
  async remove(id) { await run('readwrite', (st) => st.delete(id)); urls.delete(id); await this.list(); },
  /** Sposta un suono su o giù nell'elenco. */
  async move(id, dir) {
    const list = await this.list();
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, s] of list.entries()) if (s.order !== k) await this.update(s.id, { order: k });
  },
  /** Fa partire un suono. masterVolume: volume generale degli effetti (0–1). */
  async play(id, masterVolume = 1) {
    let url = urls.get(id);
    let rec = this.cache.find((s) => s.id === id);
    if (!url) {
      const full = await run('readonly', (st) => st.get(id)).catch(() => null);
      if (!full?.blob) return null;
      url = URL.createObjectURL(full.blob);
      urls.set(id, url);
      rec = full;
    }
    const a = new Audio(url);
    a.volume = Math.min(1, Math.max(0, (rec?.volume ?? 0.8) * masterVolume));
    playing.add(a);
    a.onended = () => playing.delete(a);
    await a.play().catch(() => playing.delete(a));
    return rec || null;
  },
  /** Ferma tutti i suoni personalizzati in riproduzione. */
  stopAll() {
    for (const a of playing) { try { a.pause(); a.currentTime = 0; } catch { /* niente */ } }
    playing.clear();
  },
  isPlaying() { return playing.size > 0; }
};
