// Tutorial guidato: evidenzia un elemento alla volta con una nuvoletta di spiegazione.
// Ogni giro compare una volta sola (si rivede dagli Strumenti).
import { esc } from './util.js';

const KEY = 'gnr_tour_';
let current = null;

function seen(id) { try { return localStorage.getItem(KEY + id) === '1'; } catch { return true; } }
function markSeen(id) { try { localStorage.setItem(KEY + id, '1'); } catch { /* niente */ } }

export function resetTours() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k); } catch { /* niente */ }
}
export function tourOpen() { return Boolean(current); }
export function tourOff() {
  try { return localStorage.getItem(`${KEY}off`) === '1'; } catch { return false; }
}

/**
 * Avvia il giro `id` (se non è già stato visto). steps: [{ sel, title, text }]:
 * i passi il cui elemento non c'è (o non si vede) vengono saltati.
 */
export function runTour(id, steps, { force = false } = {}) {
  if (current || (!force && (seen(id) || tourOff()))) return false;
  const list = steps.filter((s) => { const el = document.querySelector(s.sel); return el && el.getClientRects().length; });
  if (!list.length) return false;
  markSeen(id);
  let i = 0;
  const wrap = document.createElement('div');
  wrap.className = 'tour';
  wrap.innerHTML = '<div class="tour-hole" aria-hidden="true"></div><div class="tour-tip card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>';
  document.body.appendChild(wrap);
  const hole = wrap.querySelector('.tour-hole');
  const tip = wrap.querySelector('.tour-tip');
  const close = () => { wrap.remove(); window.removeEventListener('resize', place); current = null; };
  const place = () => {
    const s = list[i];
    const el = document.querySelector(s.sel);
    if (!el) { next(); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = Math.min(380, innerWidth - 24);
    tip.style.width = `${tw}px`;
    const th = tip.offsetHeight || 170;
    let top = r.bottom + 16;
    if (top + th > innerHeight - 12) top = Math.max(12, r.top - th - 16);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12);
    if (top < 12) top = 12;
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  };
  const paint = () => {
    const s = list[i];
    tip.innerHTML = `
      <p class="tour-step">${i + 1} di ${list.length}</p>
      <h3 id="tourTitle">${esc(s.title)}</h3>
      <p>${esc(s.text)}</p>
      <div class="tour-actions">
        <button type="button" class="link-btn" data-tour="skip">${i === list.length - 1 ? '' : 'Salta il tutorial'}</button>
        <span>${i ? '<button type="button" class="btn-sec btn-sec--sm" data-tour="prev">Indietro</button>' : ''}
        <button type="button" class="btn btn--sm" data-tour="next">${i === list.length - 1 ? 'Ho capito' : 'Avanti'}</button></span>
      </div>`;
    place();
    requestAnimationFrame(place);
    tip.querySelector('[data-tour="next"]').focus();
  };
  const next = () => { if (i >= list.length - 1) close(); else { i++; paint(); } };
  wrap.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tour]')?.dataset.tour;
    if (a === 'next') next();
    if (a === 'prev' && i > 0) { i--; paint(); }
    if (a === 'skip') { try { localStorage.setItem(`${KEY}off`, '1'); } catch { /* niente */ } close(); }
  });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft' && i > 0) { i--; paint(); }
    e.stopPropagation();
  });
  window.addEventListener('resize', place);
  current = { id, close };
  paint();
  return true;
}
