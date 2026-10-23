// Link ufficiali di GameNight Show (GitHub, Discord, Ko-fi, guida, segnalazioni…).
//
// Unica fonte: config/links.json. Questo modulo è l'"adattatore web" del nucleo riutilizzabile
// js/links-core.js: decide da dove leggere la configurazione, dove ricordarla e come mostrarla.
//   - Sul sito il file è quello pubblicato su GitHub Pages: il service worker lo riprende dalla
//     rete a ogni apertura e lo tiene per quando si è offline.
//   - Nell'app Android il file incluso nell'APK è la base; la copia pubblicata sul sito
//     (SITE_URL + config/links.json) la aggiorna senza bisogno di una nuova versione.
// Nei componenti non si scrivono indirizzi: si usa data-link="id", data-link-icons="id,id"
// oppure data-link-list (vedi bindLinks). Guida: docs/LINKS.md

import { createLinkStore } from './links-core.js';
import { PROJECT, LINK_POLICY } from './links-policy.js';
import { LINKS_URL } from './services.js';
import { SITE_URL } from './site.js';
import { isApp } from './native.js';
import { t, has, lang } from './i18n.js';
import { esc, ErrLog } from './util.js';

const BASELINE_URL = new URL('../config/links.json', import.meta.url).href;
const STORE_KEY = 'gnr_links';

/** Copia remota: indirizzo scelto in js/services.js, oppure (nell'app) quella del sito pubblico. */
export function remoteLinksUrl() {
  if (LINKS_URL) return LINKS_URL;
  if (isApp() && SITE_URL) {
    try { return new URL('config/links.json', SITE_URL).href; } catch { return ''; }
  }
  return ''; // sul sito la copia inclusa È quella pubblicata
}

const webStorage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } }
};

export const links = createLinkStore({
  project: PROJECT,
  policy: LINK_POLICY,
  loadBaseline: async () => {
    const r = await fetch(BASELINE_URL, { cache: 'no-cache', credentials: 'same-origin' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  },
  remoteUrl: remoteLinksUrl(),
  storage: webStorage,
  key: STORE_KEY,
  onError: (code, detail) => {
    // Nessun avviso a schermo: i link non sono essenziali. Resta traccia nel registro errori.
    if (code === 'baseline_unavailable' && navigator.onLine === false) return;
    ErrLog.add('links', `${code}${detail ? `: ${Array.isArray(detail) ? detail.join(', ') : detail}` : ''}`);
  }
});

/** Carica i link (una sola volta per pagina). */
export const linksReady = () => links.ready();

/** Forza il controllo della copia remota (es. dal pulsante "Cerca aggiornamento"). */
export function refreshLinks() {
  return links.ready().then(() => links.refresh({ force: true }));
}

// ---------------------------------------------------------------------------
// Etichette e icone
// ---------------------------------------------------------------------------

/** Etichetta nella lingua scelta: testo dell'app per i link noti, altrimenti quello della configurazione. */
export function linkLabel(e) {
  const k = `links.${e.id}`;
  if (has(k)) return t(k);
  const l = e.label;
  if (typeof l === 'string') return l;
  if (l) return l[lang()] || l.it || l.en || Object.values(l)[0] || e.id;
  return e.id;
}

// Marchi ufficiali (solo per collegarsi al rispettivo servizio): GitHub da Octicons (MIT),
// Discord da Simple Icons (CC0). Colore dal tema (currentColor), nessun file esterno.
const SVG = {
  github: '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/></svg>'
};
const EMOJI = { kofi: '☕', docs: '📖', bug: '🐞', idea: '💡', link: '🔗' };

export function linkIconHTML(e) {
  return SVG[e.icon] || `<span class="link-emoji" aria-hidden="true">${EMOJI[e.icon] || EMOJI.link}</span>`;
}

const anchorAttrs = (e, label) =>
  `href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" data-link-id="${esc(e.id)}"`
  + ` aria-label="${esc(t('links.newTab', { name: label }))}"`;

/** Fila di icone piccole (es. footer): solo i link attivi tra quelli indicati, nell'ordine indicato. */
export function linkIconsHTML(ids) {
  return ids.map((id) => links.get(id)).filter(Boolean).map((e) => {
    const label = linkLabel(e);
    return `<a class="link-ico" ${anchorAttrs(e, label)} title="${esc(label)}">${linkIconHTML(e)}</a>`;
  }).join('');
}

/** Elenco completo dei link attivi (es. "Community e supporto"): i link nuovi compaiono da soli. */
export function linkListHTML(exclude = []) {
  return links.list({ exclude }).map((e) => {
    const label = linkLabel(e);
    const d = has(`links.${e.id}.d`) ? `<small>${esc(t(`links.${e.id}.d`))}</small>` : '';
    return `<li><a class="link-row" ${anchorAttrs(e, label)}><span class="link-row-ico">${linkIconHTML(e)}</span><span class="link-row-txt"><b>${esc(label)}</b>${d}</span><span class="link-row-go" aria-hidden="true">↗</span></a></li>`;
  }).join('');
}

/**
 * Collega gli elementi della pagina ai link centrali e li tiene aggiornati
 * (nuova configurazione, cambio di lingua):
 *   <a data-link="kofi">            → href dal link "kofi"; nascosto se spento o mancante
 *   <span data-link-icons="github,discord"> → icone piccole
 *   <ul data-link-list data-link-exclude="kofi"> → elenco completo
 */
export function bindLinks(root = document) {
  let loaded = false;
  const ids = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const paint = () => {
    for (const a of root.querySelectorAll('[data-link]')) {
      const e = links.get(a.dataset.link);
      if (e) { a.setAttribute('href', e.url); a.hidden = false; }
      else { a.removeAttribute('href'); a.hidden = true; }
    }
    for (const el of root.querySelectorAll('[data-link-icons]')) {
      el.innerHTML = linkIconsHTML(ids(el.dataset.linkIcons));
      el.hidden = !el.children.length;
    }
    for (const el of root.querySelectorAll('[data-link-list]')) {
      el.innerHTML = linkListHTML(ids(el.dataset.linkExclude));
      el.hidden = !el.children.length;
    }
    // Riquadri che esistono solo per dei link (es. "Sostieni GameNight"): spariti i link, sparisce il riquadro.
    // Prima del caricamento non si nasconde nulla, per non far "saltare" la pagina.
    if (!loaded) return;
    for (const box of root.querySelectorAll('[data-link-box]')) {
      box.hidden = !box.querySelector('[data-link]:not([hidden]), [data-link-list]:not([hidden])');
    }
  };
  paint();
  links.subscribe(paint);
  window.addEventListener('gnr-lang', () => setTimeout(paint, 0));
  links.ready().finally(() => { loaded = true; paint(); });
  return paint;
}
