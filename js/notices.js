// Centro avvisi della home (2.1, idea 72): un posto unico per gli avvisi che prima comparivano sparsi.
//
// Categorie: prestiti (scaduti o in scadenza), serate (la prossima serata di un tuo gruppo nei prossimi
// 7 giorni), app (aggiornamento disponibile), dati (backup e operazioni da riprovare). Ogni categoria si
// spegne dal centro stesso; un avviso letto si può togliere (torna solo se cambia). Tutto su questo
// dispositivo: nessun dato in più nel database.
import { esc } from './util.js';
import { t } from './i18n.js';

export const NOTICE_CATS = ['loans', 'nights', 'app', 'data'];
const OFF = 'gnr_notice_off';
const SEEN = 'gnr_notice_seen';
const ls = {
  json(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* niente */ } }
};

export const Notices = {
  items: new Map(),
  listeners: new Set(),
  catOff(c) { return Boolean(ls.json(OFF, {})[c]); },
  setCat(c, on) { const o = ls.json(OFF, {}); if (on) delete o[c]; else o[c] = true; ls.set(OFF, o); this.emit(); },
  /** n: { id, cat, icon, title, sub?, href?, sig? } — sig cambia quando l'avviso va rimostrato. */
  put(n) { if (n?.id && NOTICE_CATS.includes(n.cat)) { this.items.set(n.id, n); this.emit(); } },
  clearCat(cat) { for (const [id, n] of this.items) if (n.cat === cat) this.items.delete(id); this.emit(); },
  dismiss(id) { const n = this.items.get(id); if (!n) return; const s = ls.json(SEEN, {}); s[id] = n.sig || '1'; ls.set(SEEN, s); this.emit(); },
  list() {
    const seen = ls.json(SEEN, {});
    return [...this.items.values()].filter((n) => !this.catOff(n.cat) && seen[n.id] !== (n.sig || '1'));
  },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const fn of this.listeners) { try { fn(); } catch { /* niente */ } } }
};

/** Contenuto del foglio del centro avvisi. */
export function noticesHTML() {
  const list = Notices.list();
  return `${list.length ? `<ul class="rows nc-list">${list.map((n) => `<li class="nc-item">${n.href ? `<a class="row hub-item" href="${esc(n.href)}">` : '<div class="row hub-item">'}<span aria-hidden="true">${esc(n.icon || '🔔')}</span><span class="mini-text"><b>${esc(n.title)}</b>${n.sub ? `<small>${esc(n.sub)}</small>` : ''}</span>${n.href ? '</a>' : '</div>'}<button type="button" class="link-btn" data-ncdismiss="${esc(n.id)}" aria-label="${esc(t('nc.dismiss'))}">✕</button></li>`).join('')}</ul>` : `<p class="empty">${esc(t('nc.none'))}</p>`}
    <details class="hub-details"><summary>${esc(t('nc.settings'))}</summary><div class="tips-cats">${NOTICE_CATS.map((c) => `<label class="quick-toggle"><input type="checkbox" data-nccat="${c}" ${Notices.catOff(c) ? '' : 'checked'}><span>${esc(t(`nc.cat.${c}`))}</span></label>`).join('')}</div></details>`;
}

export function bindNotices(root, repaint) {
  root.addEventListener('click', (e) => {
    const d = e.target.closest('[data-ncdismiss]');
    if (d) { e.preventDefault(); Notices.dismiss(d.dataset.ncdismiss); repaint(); }
  });
  root.addEventListener('change', (e) => {
    const c = e.target.closest('[data-nccat]');
    if (c) { Notices.setCat(c.dataset.nccat, c.checked); repaint(); }
  });
}
