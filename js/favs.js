// Preferiti rapidi: i giochi preferiti di una persona, per armadio.
//
// Sono PERSONALI: stanno nel profilo personale (people/<codice>/favs/<armadio>/<gioco> = ora in ms),
// quindi seguono la persona su tutti i suoi dispositivi e nessun altro li legge. Senza profilo
// personale restano solo su questo dispositivo (localStorage "gnr_favs"). Non si condividono mai da
// soli: alla serata arrivano solo se la persona li propone (per esempio come "voglio giocare a…").
//
// Un gioco tolto dall'armadio (cestino, spostato) resta tra i preferiti finché non lo si toglie:
// se torna, torna anche la stella. Chi mostra i preferiti ignora quelli che non esistono più e
// può proporre di toglierli (missingFavs).
import { dbRef, set, remove } from './fb.js';
import { Person } from './person.js';

const LS = 'gnr_favs';
const CODE6 = /^[A-Z0-9]{6}$/;
const GID = /^[\w-]{1,40}$/;

const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(LS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const writeLocal = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } };

/** Pulisce una mappa { armadio: { gioco: ms } } letta da fuori (database, file importato). */
export function cleanFavs(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [aid, games] of Object.entries(raw)) {
    if (!CODE6.test(aid) || !games || typeof games !== 'object') continue;
    for (const [gid, at] of Object.entries(games)) {
      if (!GID.test(gid)) continue;
      const n = Number(at);
      (out[aid] ||= {})[gid] = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
    }
  }
  return out;
}

/** Preferiti che puntano a giochi non più presenti nell'armadio. */
export function missingFavs(favIds, lib) {
  return [...favIds].filter((id) => !lib?.[id]?.name);
}

/** Ordina mettendo prima i preferiti (stabile: a parità resta l'ordine di partenza). */
export function favFirst(items, favIds) {
  return items.map((it, i) => [it, i]).sort((a, b) => (favIds.has(b[0].id) - favIds.has(a[0].id)) || a[1] - b[1]).map(([it]) => it);
}

export const Favs = {
  /** Tutti i preferiti (dal profilo se c'è, altrimenti da questo dispositivo). */
  all() {
    const p = Person.data?.pid ? Person.data.favs : null;
    return cleanFavs(p || readLocal());
  },
  ids(aid) { return new Set(Object.keys(this.all()[aid] || {})); },
  has(aid, id) { return Boolean(this.all()[aid]?.[id]); },
  /** Con il profilo: chi aveva preferiti solo sul dispositivo li ritrova nel profilo (una volta). */
  async adoptLocal() {
    const d = Person.data;
    const loc = cleanFavs(readLocal());
    if (!d?.pid || !Object.keys(loc).length) return 0;
    let n = 0;
    for (const [aid, games] of Object.entries(loc)) {
      for (const [gid, at] of Object.entries(games)) {
        if (d.favs?.[aid]?.[gid]) continue;
        await set(dbRef(`people/${d.pid}/favs/${aid}/${gid}`), at).catch(() => {});
        ((d.favs ||= {})[aid] ||= {})[gid] = at;
        n++;
      }
    }
    writeLocal({});
    return n;
  },
  async toggle(aid, id, on = !this.has(aid, id)) {
    if (!CODE6.test(aid || '') || !GID.test(id || '')) return false;
    const d = Person.data;
    if (d?.pid) {
      const ref = dbRef(`people/${d.pid}/favs/${aid}/${id}`);
      if (on) await set(ref, Date.now()); else await remove(ref);
      d.favs = d.favs || {};
      if (on) (d.favs[aid] ||= {})[id] = Date.now();
      else if (d.favs[aid]) { delete d.favs[aid][id]; if (!Object.keys(d.favs[aid]).length) delete d.favs[aid]; }
      Person.saveCache?.();
    } else {
      const loc = cleanFavs(readLocal());
      if (on) (loc[aid] ||= {})[id] = Date.now();
      else if (loc[aid]) { delete loc[aid][id]; if (!Object.keys(loc[aid]).length) delete loc[aid]; }
      writeLocal(loc);
    }
    window.dispatchEvent(new CustomEvent('gnr-favs', { detail: { aid, id, on } }));
    return on;
  },
  /** Toglie i preferiti di giochi che non esistono più in quell'armadio. */
  async prune(aid, lib) {
    const gone = missingFavs(this.ids(aid), lib);
    for (const id of gone) await this.toggle(aid, id, false);
    return gone.length;
  },
  /** Sostituisce tutti i preferiti (importazione): solo armadi e id validi. */
  async importAll(map, { merge = true } = {}) {
    const clean = cleanFavs(map);
    let n = 0;
    for (const [aid, games] of Object.entries(clean)) {
      for (const gid of Object.keys(games)) {
        if (merge && this.has(aid, gid)) continue;
        await this.toggle(aid, gid, true);
        n++;
      }
    }
    return n;
  }
};
