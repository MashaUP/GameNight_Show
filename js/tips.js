// Consigli e suggerimenti meno invadenti (2.0).
//
// Prima ogni schermata mostrava tutti i suoi consigli insieme (righe di aiuto nel voto, codice personale,
// installazione dell'app, foto, tutte le sezioni del Consigliere…). Ora:
// - un livello scelto dall'utente (Impostazioni): "tutti", "pochi" (predefinito) oppure "nessuno";
// - ogni consiglio ha un tetto di volte (poi non torna più) e si può chiudere per sempre (✕);
// - in una schermata se ne mostra uno solo per volta, il più utile in quel momento (priorità);
// - categorie spegnibili una per una (voto, profilo, app, consigliere).
// Tutto resta su questo dispositivo (localStorage), niente nel database.
import { t } from './i18n.js';
import { esc } from './util.js';

const KEY = 'gnr_tips';
const LEVEL = 'gnr_tips_level';
const OFF = 'gnr_tips_off';
export const TIP_LEVELS = ['all', 'few', 'off'];
export const TIP_CATS = ['vote', 'profile', 'app', 'advisor'];

const ls = {
  json(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } },
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* niente */ } }
};

/** Quante volte mostrare un consiglio secondo il livello: "pochi" dimezza (almeno una volta). */
export function tipLimit(max, level) {
  if (level === 'off') return 0;
  if (level === 'all') return max;
  return Math.max(1, Math.ceil(max / 2));
}

export const Tips = {
  level() { const v = ls.get(LEVEL); return TIP_LEVELS.includes(v) ? v : 'few'; },
  setLevel(v) { ls.set(LEVEL, TIP_LEVELS.includes(v) ? v : null); },
  catOff(cat) { return Boolean(ls.json(OFF, {})[cat]); },
  setCat(cat, on) { const o = ls.json(OFF, {}); if (on) delete o[cat]; else o[cat] = true; ls.set(OFF, o); },
  state(id) { return ls.json(KEY, {})[id] || { n: 0 }; },
  /** Il consiglio si può mostrare? (livello, categoria, chiuso per sempre, volte già mostrato) */
  allowed(id, { cat = '', max = 3 } = {}) {
    if (cat && this.catOff(cat)) return false;
    const st = this.state(id);
    if (st.closed) return false;
    return st.n < tipLimit(max, this.level());
  },
  /** Segna che è stato mostrato (una volta per pagina aperta). */
  shown(id) {
    if (this.shownNow.has(id)) return;
    this.shownNow.add(id);
    const all = ls.json(KEY, {});
    all[id] = { ...(all[id] || {}), n: (Number(all[id]?.n) || 0) + 1, at: Date.now() };
    ls.set(KEY, all);
  },
  /** Conta un uso (es. un voto mandato): i consigli legati a quell'azione si diradano. */
  bump(id) {
    const all = ls.json(KEY, {});
    all[id] = { ...(all[id] || {}), n: (Number(all[id]?.n) || 0) + 1, at: Date.now() };
    ls.set(KEY, all);
  },
  close(id) { const all = ls.json(KEY, {}); all[id] = { ...(all[id] || {}), closed: true }; ls.set(KEY, all); },
  reset() { ls.set(KEY, null); ls.set(OFF, null); },
  shownNow: new Set(),
  /**
   * Tra più consigli candidati per la stessa schermata, il primo permesso in ordine di priorità
   * (list: [{ id, cat, max }]). Restituisce l'id oppure ''.
   */
  pick(list) {
    for (const c of list) if (c && this.allowed(c.id, c)) return c.id;
    return '';
  }
};

/** Un consiglio chiudibile (✕ = non mostrarlo più). */
export function tipHTML(id, html) {
  Tips.shown(id);
  return `<div class="tip-box" data-tip="${esc(id)}"><div class="tip-body">${html}</div><button type="button" class="tip-x" data-tipclose="${esc(id)}" aria-label="${esc(t('tips.close'))}" title="${esc(t('tips.close'))}">✕</button></div>`;
}

/** Chiude i consigli toccando ✕ (da chiamare una volta per pagina). */
export function bindTips(root = document) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipclose]');
    if (!b) return;
    Tips.close(b.dataset.tipclose);
    b.closest('[data-tip]')?.remove();
  });
}

/** Scelta nelle impostazioni: livello e categorie. */
export function tipsSettingsHTML() {
  const lv = Tips.level();
  return `<div class="tips-set">
    <span class="field-label">${esc(t('tips.title'))}</span>
    <div class="seg" role="group" aria-label="${esc(t('tips.title'))}">${TIP_LEVELS.map((k) => `<button type="button" data-tiplevel="${k}" aria-pressed="${lv === k}">${esc(t(`tips.level.${k}`))}</button>`).join('')}</div>
    <div class="tips-cats">${TIP_CATS.map((c) => `<label class="quick-toggle"><input type="checkbox" data-tipcat="${c}" ${Tips.catOff(c) ? '' : 'checked'}><span>${esc(t(`tips.cat.${c}`))}</span></label>`).join('')}</div>
    <button type="button" class="link-btn" data-tipsreset>${esc(t('tips.reset'))}</button>
  </div>`;
}

/** Gestisce i controlli di tipsSettingsHTML dentro root. */
export function bindTipsSettings(root, onChange = () => {}) {
  root.addEventListener('click', (e) => {
    const l = e.target.closest('[data-tiplevel]');
    if (l) { Tips.setLevel(l.dataset.tiplevel); root.querySelectorAll('[data-tiplevel]').forEach((b) => b.setAttribute('aria-pressed', String(b === l))); onChange(); return; }
    if (e.target.closest('[data-tipsreset]')) { Tips.reset(); root.querySelectorAll('[data-tipcat]').forEach((c) => { c.checked = true; }); onChange(); }
  });
  root.addEventListener('change', (e) => {
    const c = e.target.closest('[data-tipcat]');
    if (c) { Tips.setCat(c.dataset.tipcat, c.checked); onChange(); }
  });
}
