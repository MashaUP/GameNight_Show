// Manuali dei giochi (1.8) in tre modi gratuiti, senza servizi nuovi e senza caricare file su Firebase:
//
// 1. Link al manuale ufficiale nella scheda del gioco (campo "manual", solo https): di solito la pagina
//    dell'editore. Lo vedono tutti quelli che vedono l'armadio; dalla TV si apre con un QR sul telefono.
// 2. File sul dispositivo: un PDF (o una foto delle regole) salvato SOLO su questo dispositivo, nello
//    spazio del browser (IndexedDB). Funziona anche senza rete; non va su Firebase (il piano gratuito ha
//    1 GB in tutto e i manuali sono protetti da diritto d'autore: si tengono per sé).
// 3. Ricerca guidata: se il gioco ha l'identificativo di BoardGameGeek, il collegamento alla pagina dei
//    file di BGG (dove gli utenti caricano regolamenti e riassunti); altrimenti una ricerca sul web con
//    il nome del gioco. GameNight Show non copia né ridistribuisce i manuali: rimanda alle fonti.
//
// Le "regole in breve" scritte a mano (campo rules) restano il riassunto da leggere al volo.
import { bggIdOf, bggFilesPage } from './bgg.js';
import { isApp, nativeOpen } from './native.js';

const DB = 'gnr_manuals';
const STORE = 'files';
export const MAX_MANUAL_BYTES = 30 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Link del manuale accettato? (solo https, niente caratteri strani, lunghezza ragionevole) */
export function isManualUrl(u) {
  return typeof u === 'string' && u.length <= 300 && /^https:\/\/[^\s"<>'`]+$/.test(u);
}

/** Dove cercare il manuale se non c'è il link: BGG (file) o una ricerca sul web. */
export function manualSearchLinks(game, lang = 'it') {
  const out = [];
  const id = bggIdOf(game?.extId);
  if (id) out.push({ kind: 'bgg', url: bggFilesPage(id) });
  const q = `${game?.name || ''} ${lang === 'en' ? 'rulebook pdf' : 'regolamento pdf'}`.trim();
  out.push({ kind: 'web', url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}` });
  return out;
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb'));
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error('abort')); };
  });
}
const req2p = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const LocalManuals = {
  key: (aid, gid) => `${aid}/${gid}`,
  /** Controlla il file prima di salvarlo: tipo e dimensione. Restituisce il codice dell'errore o ''. */
  check(file) {
    if (!file) return 'none';
    if (!TYPES.includes(file.type)) return 'type';
    if (file.size > MAX_MANUAL_BYTES) return 'size';
    return '';
  },
  async save(aid, gid, file) {
    const bad = this.check(file);
    if (bad) throw Object.assign(new Error(bad), { code: bad });
    const rec = { key: this.key(aid, gid), name: String(file.name || 'manuale').slice(0, 80), type: file.type, size: file.size, at: Date.now(), blob: file };
    await tx('readwrite', (st) => st.put(rec));
    return { name: rec.name, size: rec.size, at: rec.at, type: rec.type };
  },
  async get(aid, gid) {
    try { return await tx('readonly', (st) => req2p(st.get(this.key(aid, gid)))) || null; } catch { return null; }
  },
  async info(aid, gid) {
    const r = await this.get(aid, gid);
    return r ? { name: r.name, size: r.size, at: r.at, type: r.type } : null;
  },
  async remove(aid, gid) { await tx('readwrite', (st) => st.delete(this.key(aid, gid))); },
  /** Tutti i manuali salvati qui (per il centro privacy: cosa resta sul dispositivo). */
  async list() {
    try {
      const all = await tx('readonly', (st) => req2p(st.getAll()));
      return (all || []).map((r) => ({ key: r.key, name: r.name, size: r.size, at: r.at }));
    } catch { return []; }
  },
  async clear() { try { await tx('readwrite', (st) => st.clear()); } catch { /* niente */ } },
  /**
   * Apre il manuale: nel browser in una nuova scheda (che mostra il PDF o la foto); nell'app Android
   * con il lettore del telefono (lì le schede non esistono). Se la scheda è bloccata, lo scarica.
   */
  async open(aid, gid) {
    const r = await this.get(aid, gid);
    if (!r?.blob) return false;
    if (isApp()) { await nativeOpen(r.blob, r.name || 'manuale.pdf', r.blob.type || 'application/pdf'); return true; }
    const url = URL.createObjectURL(r.blob);
    // Niente "noopener": con quell'opzione window.open restituisce sempre null anche quando la scheda si apre.
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch { /* niente */ } } else { const a = document.createElement('a'); a.href = url; a.download = r.name || 'manuale'; a.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }
};
