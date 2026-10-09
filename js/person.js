// Profilo personale: lo stesso su sito, telefono e app Android.
//
// Nel database (people/<codice>) ci sono nome, personaggio e colore, i profili dei gruppi
// collegati (groups), gli armadi con la loro chiave (armadi) e i dispositivi autorizzati (uids).
// Solo i dispositivi collegati lo leggono: per collegarne un altro serve la chiave segreta
// (personKeys/<codice>, che nessuno può leggere), mostrata come QR o come codice "ABC123-K7Q2XA9F".
//
// Su ogni dispositivo resta solo { pid, key } (localStorage "gnr_person") più una copia
// del profilo per mostrarlo subito anche senza rete.
//
// Regole di unione quando si collega un dispositivo che aveva già un suo profilo:
// - nome e personaggio: vince la modifica più recente (updatedAt);
// - gruppi: si sommano; se nello stesso gruppo ci sono due profili, il secondo diventa un "alias"
//   (alts) e i suoi traguardi si sommano a quelli del primo;
// - armadi: si sommano (con le chiavi per modificarli).
import { connect, dbRef, memberRef, get, set, update, remove } from './fb.js';
import { randomCode, normalizeCode, cleanName } from './util.js';
import { publicUrl } from './native.js';

const LS = 'gnr_person';
const CACHE = 'gnr_person_cache';
const ARMADI_KEY = 'gnr_armadi';
const PROFILES_KEY = 'gnr_profiles';
const CODE6 = /^[A-Z0-9]{6}$/;
const CODE8 = /^[A-Z0-9]{8}$/;

const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } };

/** Solo i campi che il database accetta per l'aspetto della persona. */
export function lookOf(src = {}) {
  const out = {
    name: cleanName(src.name || '', 16) || 'Giocatore',
    style: String(src.style || 'adventurer').slice(0, 30),
    seed: String(src.seed || 'gnr').slice(0, 40),
    color: /^#[0-9A-Fa-f]{6}$/.test(src.color || '') ? src.color : '#FF5A4E'
  };
  if (src.photo && /^data:image\//.test(src.photo) && src.photo.length < 120000) out.photo = src.photo;
  if (src.motto) out.motto = cleanName(src.motto, 40);
  if (src.opts && typeof src.opts === 'object' && Object.keys(src.opts).length) {
    out.opts = Object.fromEntries(Object.entries(src.opts).filter(([k, v]) => /^[\w-]{1,30}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 40)]));
  }
  return out;
}

/** Testo del codice di collegamento: "ABC123-K7Q2XA9F". */
export function linkCodeText(pid, key) { return `${pid}-${key}`; }

/** Legge "ABC123-K7Q2XA9F" (anche con spazi o senza trattino). */
export function parseLinkCode(text) {
  const raw = String(text || '');
  const m = /collega=([A-Za-z0-9]{6})[-.]?([A-Za-z0-9]{8})/.exec(raw);
  const s = m ? `${m[1]}${m[2]}` : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 14) return null;
  const pid = s.slice(0, 6); const key = s.slice(6);
  return CODE6.test(pid) && CODE8.test(key) ? { pid, key } : null;
}

export const Person = {
  uid: null,
  data: null, // { pid, info, groups, alts, armadi }

  /** Codice e chiave salvati su questo dispositivo (null se nessun profilo). */
  local() {
    const p = read(LS, null);
    return p && CODE6.test(p.pid) && CODE8.test(p.key) ? p : null;
  },
  cached() {
    const loc = this.local();
    const c = read(CACHE, null);
    return loc && c?.pid === loc.pid ? c : null;
  },

  async ready() {
    if (!this.uid) this.uid = await connect();
    return this.uid;
  },

  /**
   * Carica il profilo dal database. Restituisce null se su questo dispositivo non c'è.
   * Se il database non lo fa leggere (dispositivo scollegato da un altro) lo dice con { revoked: true }.
   */
  async load() {
    const loc = this.local();
    if (!loc) { this.data = null; return null; }
    await this.ready();
    let v;
    try {
      v = (await get(dbRef(`people/${loc.pid}`))).val();
    } catch (err) {
      if (String(err?.code || err?.message || '').toLowerCase().includes('permission')) {
        // Proviamo a ricollegarci con la chiave (per esempio dopo una pulizia dei dati dell'app).
        if (await this.claim(loc.pid, loc.key).catch(() => false)) return this.load();
        return { revoked: true, pid: loc.pid };
      }
      throw err;
    }
    if (!v?.info) {
      if (await this.claim(loc.pid, loc.key).catch(() => false)) {
        v = (await get(dbRef(`people/${loc.pid}`))).val();
      }
      if (!v?.info) { this.data = null; return { missing: true, pid: loc.pid }; }
    }
    this.data = { pid: loc.pid, info: v.info, groups: v.groups || {}, alts: v.alts || {}, armadi: v.armadi || {}, devices: Object.keys(v.uids || {}).length };
    write(CACHE, this.data);
    this.syncLocal();
    return this.data;
  },

  /** Crea il profilo su questo dispositivo. */
  async create(look, extra = {}) {
    await this.ready();
    const info = { ...lookOf(look), ownerUid: this.uid, updatedAt: Date.now(), createdAt: Date.now() };
    for (let i = 0; i < 10; i++) {
      const pid = randomCode(6);
      if ((await get(dbRef(`people/${pid}/info`)).catch(() => null))?.exists()) continue;
      const key = randomCode(8);
      const upd = { [`people/${pid}/info`]: info, [`people/${pid}/uids/${this.uid}`]: Date.now() };
      for (const [gid, mid] of Object.entries(extra.groups || {})) if (CODE6.test(gid) && CODE6.test(mid)) upd[`people/${pid}/groups/${gid}`] = mid;
      for (const [aid, a] of Object.entries(extra.armadi || {})) if (CODE6.test(aid) && a?.name) upd[`people/${pid}/armadi/${aid}`] = cleanArm(a);
      await update(dbRef(''), upd);
      await set(dbRef(`personKeys/${pid}`), key);
      write(LS, { pid, key });
      await this.load();
      return pid;
    }
    throw new Error('nessun codice libero');
  },

  /** Salva nome, personaggio, colore (vince sempre l'ultima modifica). */
  async saveLook(look) {
    const d = this.data || (await this.load());
    if (!d?.info) throw new Error('Nessun profilo su questo dispositivo');
    const info = { ...lookOf(look), ownerUid: d.info.ownerUid, updatedAt: Date.now(), ...(d.info.createdAt ? { createdAt: d.info.createdAt } : {}) };
    await set(dbRef(`people/${d.pid}/info`), info);
    d.info = info;
    write(CACHE, d);
    // I profili dei gruppi seguono il profilo personale.
    await Promise.all(Object.entries(d.groups || {}).map(([gid, mid]) => this.pushLookToMember(mid, gid).catch(() => {})));
    return info;
  },

  /** Copia nome e personaggio nel profilo di gruppo (members/<codice>). */
  async pushLookToMember(mid, gid) {
    const info = this.data?.info;
    if (!info || !CODE6.test(mid || '')) return;
    const look = lookOf(info);
    await update(memberRef(mid), { name: look.name, style: look.style, seed: look.seed, color: look.color, groupId: gid, photo: look.photo || null, motto: look.motto || null, opts: look.opts || null });
  },

  async linkGroup(gid, mid) {
    if (!this.local() || !CODE6.test(gid || '') || !CODE6.test(mid || '')) return;
    const d = this.data || (await this.load().catch(() => null));
    if (!d?.pid) return;
    const cur = d.groups?.[gid];
    if (cur === mid) return;
    if (cur && cur !== mid) {
      // Due profili nello stesso gruppo: il nuovo diventa quello principale, il vecchio un alias (traguardi sommati).
      await set(dbRef(`people/${d.pid}/alts/${gid}/${cur}`), true).catch(() => {});
      d.alts = { ...(d.alts || {}), [gid]: { ...(d.alts?.[gid] || {}), [cur]: true } };
    }
    await set(dbRef(`people/${d.pid}/groups/${gid}`), mid);
    d.groups = { ...(d.groups || {}), [gid]: mid };
    write(CACHE, d);
  },

  /** Ricorda un armadio nel profilo (con la chiave per modificarlo dagli altri dispositivi). */
  async linkArmadio(aid, name, key = '', own = false) {
    if (!this.local() || !CODE6.test(aid || '')) return;
    const d = this.data || (await this.load().catch(() => null));
    if (!d?.pid) return;
    const prev = d.armadi?.[aid] || {};
    const next = cleanArm({ name: name || prev.name || aid, key: key || prev.key || '', own: own || prev.own || false, at: Date.now() });
    if (prev.name === next.name && (prev.key || '') === (next.key || '') && Boolean(prev.own) === Boolean(next.own) && Date.now() - (prev.at || 0) < 3600e3) return;
    await set(dbRef(`people/${d.pid}/armadi/${aid}`), next);
    d.armadi = { ...(d.armadi || {}), [aid]: next };
    write(CACHE, d);
  },

  async unlinkArmadio(aid) {
    const d = this.data;
    if (!d?.pid) return;
    await remove(dbRef(`people/${d.pid}/armadi/${aid}`));
    delete d.armadi[aid];
    write(CACHE, d);
  },

  /** Indirizzo da mettere nel QR per collegare un altro dispositivo. */
  linkUrl() {
    const loc = this.local();
    if (!loc) return '';
    const u = publicUrl('index.html');
    u.hash = `collega=${linkCodeText(loc.pid, loc.key)}`;
    return u.href;
  },
  linkCode() {
    const loc = this.local();
    return loc ? linkCodeText(loc.pid, loc.key) : '';
  },

  /** Rende questo dispositivo autorizzato a usare il profilo pid con la chiave key. */
  async claim(pid, key) {
    await this.ready();
    await set(dbRef(`personKeyClaims/${pid}/${this.uid}`), key);
    await set(dbRef(`people/${pid}/uids/${this.uid}`), Date.now());
    return true;
  },

  /**
   * Collega questo dispositivo al profilo di un altro (codice + chiave).
   * Se qui c'era già un profilo diverso, lo unisce: aspetto più recente, gruppi e armadi sommati.
   * Restituisce { merged: boolean, info }.
   */
  async linkWith(pid, key) {
    await this.ready();
    const mine = this.local();
    if (mine?.pid === pid) { await this.load(); return { merged: false, info: this.data?.info }; }
    let old = null;
    if (mine) {
      try { old = (await get(dbRef(`people/${mine.pid}`))).val(); } catch { old = null; }
    }
    if (!old) {
      // Profilo solo locale (vecchie versioni): i profili dei gruppi salvati sul telefono.
      const groups = read(PROFILES_KEY, {}) || {};
      if (Object.keys(groups).length) old = { groups, info: null };
    }
    try {
      await this.claim(pid, key);
    } catch (err) {
      throw Object.assign(new Error('Codice non valido: controlla di averlo copiato bene, oppure inquadra il QR dall’altro dispositivo.'), { user: true, cause: err });
    }
    const target = (await get(dbRef(`people/${pid}`))).val();
    if (!target?.info) throw Object.assign(new Error('Questo profilo non esiste più.'), { user: true });
    const upd = {};
    let merged = false;
    if (old) {
      if (old.info && (old.info.updatedAt || 0) > (target.info.updatedAt || 0)) {
        upd[`people/${pid}/info`] = { ...lookOf(old.info), ownerUid: target.info.ownerUid, updatedAt: old.info.updatedAt, ...(target.info.createdAt ? { createdAt: target.info.createdAt } : {}) };
        merged = true;
      }
      for (const [gid, mid] of Object.entries(old.groups || {})) {
        if (!CODE6.test(gid) || !CODE6.test(mid)) continue;
        const cur = target.groups?.[gid];
        if (!cur) { upd[`people/${pid}/groups/${gid}`] = mid; merged = true; }
        else if (cur !== mid) { upd[`people/${pid}/alts/${gid}/${mid}`] = true; merged = true; }
      }
      for (const [gid, mids] of Object.entries(old.alts || {})) {
        for (const mid of Object.keys(mids || {})) if (CODE6.test(gid) && CODE6.test(mid) && target.groups?.[gid] !== mid) upd[`people/${pid}/alts/${gid}/${mid}`] = true;
      }
      for (const [aid, a] of Object.entries(old.armadi || {})) {
        if (!CODE6.test(aid) || !a?.name) continue;
        const cur = target.armadi?.[aid];
        if (!cur || (!cur.key && a.key)) { upd[`people/${pid}/armadi/${aid}`] = cleanArm({ ...cur, ...a }); merged = true; }
      }
    }
    // Armadi aperti su questo dispositivo (con la chiave): finiscono anche nel profilo.
    for (const a of read(ARMADI_KEY, []) || []) {
      if (!CODE6.test(a?.id || '') || target.armadi?.[a.id] || upd[`people/${pid}/armadi/${a.id}`]) continue;
      const k = (() => { try { return localStorage.getItem(`gnr_akey_${a.id}`) || ''; } catch { return ''; } })();
      upd[`people/${pid}/armadi/${a.id}`] = cleanArm({ name: a.name || a.id, key: k, at: Date.now() });
      merged = true;
    }
    if (Object.keys(upd).length) await update(dbRef(''), upd);
    if (mine && mine.pid !== pid) {
      // Il vecchio profilo di questo dispositivo resta nel database ma non è più usato qui.
      remove(dbRef(`people/${mine.pid}/uids/${this.uid}`)).catch(() => {});
    }
    write(LS, { pid, key });
    await this.load();
    if (merged) await Promise.all(Object.entries(this.data?.groups || {}).map(([gid, mid]) => this.pushLookToMember(mid, gid).catch(() => {})));
    return { merged, info: this.data?.info };
  },

  /** Nuova chiave: i dispositivi già collegati restano, i vecchi QR non funzionano più. */
  async renewKey() {
    const loc = this.local();
    if (!loc) return '';
    const key = randomCode(8);
    await set(dbRef(`personKeys/${loc.pid}`), key);
    write(LS, { pid: loc.pid, key });
    return key;
  },

  /** Scollega questo dispositivo (il profilo resta sugli altri). */
  async signOut() {
    const loc = this.local();
    if (loc && this.uid) await remove(dbRef(`people/${loc.pid}/uids/${this.uid}`)).catch(() => {});
    write(LS, null);
    write(CACHE, null);
    this.data = null;
  },

  /**
   * Profili e armadi del profilo copiati nella memoria del dispositivo, dove li cercano
   * le pagine della serata (play.js, host.js, ludoteca): così funzionano come prima.
   */
  syncLocal() {
    const d = this.data;
    if (!d) return;
    const profs = read(PROFILES_KEY, {}) || {};
    let changed = false;
    for (const [gid, mid] of Object.entries(d.groups || {})) if (profs[gid] !== mid) { profs[gid] = mid; changed = true; }
    if (changed) write(PROFILES_KEY, profs);
    const list = read(ARMADI_KEY, []) || [];
    const ids = new Set(list.map((a) => a?.id));
    const add = Object.entries(d.armadi || {}).filter(([aid]) => !ids.has(aid)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).map(([id, a]) => ({ id, name: a.name }));
    if (add.length) write(ARMADI_KEY, [...list, ...add].slice(0, 12));
    for (const [aid, a] of Object.entries(d.armadi || {})) {
      try { if (a.key && !localStorage.getItem(`gnr_akey_${aid}`)) localStorage.setItem(`gnr_akey_${aid}`, a.key); } catch { /* niente */ }
    }
  },

  /**
   * Versioni precedenti: il telefono aveva solo i profili dei gruppi (un codice per gruppo).
   * Se non c'è ancora un profilo personale lo crea dal profilo di gruppo usato più di recente.
   */
  async migrateLegacy(loadMember) {
    if (this.local()) return null;
    const profs = read(PROFILES_KEY, {}) || {};
    const entries = Object.entries(profs).filter(([gid, mid]) => CODE6.test(gid) && CODE6.test(mid));
    if (!entries.length) return null;
    let look = null;
    for (const [, mid] of entries.reverse()) {
      const m = await loadMember(mid).catch(() => null);
      if (m) { look = m; break; }
    }
    if (!look) return null;
    const armadi = {};
    for (const a of read(ARMADI_KEY, []) || []) {
      if (!CODE6.test(a?.id || '')) continue;
      let k = '';
      try { k = localStorage.getItem(`gnr_akey_${a.id}`) || ''; } catch { /* niente */ }
      armadi[a.id] = { name: a.name || a.id, key: k };
    }
    return this.create(look, { groups: Object.fromEntries(entries), armadi });
  }
};

function cleanArm(a = {}) {
  const out = { name: cleanName(a.name || '', 40) || 'Armadio', at: Number(a.at) || Date.now() };
  const k = normalizeCode(a.key || '', 8);
  if (CODE8.test(k)) out.key = k;
  if (a.own) out.own = true;
  return out;
}

/** Chiavi persona delle serate di un gruppo da sommare: profilo principale più eventuali alias. */
export function personKeysFor(gid, data = Person.data) {
  const out = [];
  const mid = data?.groups?.[gid];
  if (mid) out.push(`m_${mid}`);
  for (const alt of Object.keys(data?.alts?.[gid] || {})) out.push(`m_${alt}`);
  return out;
}

/**
 * Serate di un gruppo in cui più chiavi persona (profilo principale e alias) diventano una sola:
 * numeri sommati, giochi e compagni uniti. Serve per i traguardi dopo un'unione di profili.
 */
export function mergedNights(nights, keys) {
  if (!keys || keys.length < 2) return nights || {};
  const [main, ...others] = keys;
  const SUM = ['n', 'sumGiven', 'wins', 'mvp', 'games', 'oracle', 'rebel', 'seer', 'nightWins'];
  const out = {};
  for (const [id, n] of Object.entries(nights || {})) {
    const people = { ...(n?.people || {}) };
    const parts = [main, ...others].map((k) => people[k]).filter(Boolean);
    if (parts.length > 1 || (parts.length === 1 && !people[main])) {
      const m = {};
      for (const p of parts) {
        for (const k of SUM) if (typeof p[k] === 'number') m[k] = (m[k] || 0) + p[k];
        for (const k of ['played', 'given', 'with']) if (p[k] && typeof p[k] === 'object') m[k] = { ...(m[k] || {}), ...p[k] };
        if (!m.name && p.name) m.name = p.name;
      }
      for (const k of others) delete people[k];
      people[main] = { ...parts[0], ...m };
    }
    out[id] = { ...n, people };
  }
  return out;
}
