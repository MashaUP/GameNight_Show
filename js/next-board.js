// Prossima serata: bacheca leggera e suggerimenti con il nome nascosto (2.1, idee 66 e 65).
//
// Bacheca (next/board): note brevi (120 caratteri) sulla prossima serata — "porto io le patatine", "arrivo
// alle 22". Niente commenti, reazioni o fili: non è un social. Si azzera quando si fissa una nuova data.
// Suggerimenti (next/sugg): un gioco da proporre per la prossima serata. Il nome di chi l'ha scritto resta
// nascosto agli altri fino all'inizio della serata, poi si vede. NON è anonimato assoluto: il database sa
// chi l'ha scritto (serve per poterlo togliere), e lo diciamo chiaramente.
import { esc } from './util.js';
import { t } from './i18n.js';

export const BOARD_MAX = 20;
export const SUGG_MAX = 15;
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Note della bacheca, dalla più recente. */
export function boardList(next) {
  return Object.entries(next?.board || {}).filter(([, x]) => x?.text).map(([id, x]) => ({ id, ...x })).sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, BOARD_MAX);
}
/** Suggerimenti con il nome visibile solo dopo l'inizio della serata (o a chi l'ha scritto). */
export function suggList(next, { me = '', now = Date.now() } = {}) {
  const open = Number(next?.at) && now >= Number(next.at);
  return Object.entries(next?.sugg || {}).filter(([, x]) => x?.text).map(([id, x]) => ({ id, text: x.text, at: x.at, mine: x.key === me, who: open || x.key === me ? x.name : null })).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0)).slice(0, SUGG_MAX);
}
export function boardEntry(text, { key, name }) {
  const s = clean(text, 120);
  if (s.length < 2) throw Object.assign(new Error('short'), { code: 'short' });
  return { text: s, key: clean(key, 40), name: clean(name, 16) || '—' };
}
export function suggEntry(text, { key, name }) {
  const s = clean(text, 60);
  if (s.length < 2) throw Object.assign(new Error('short'), { code: 'short' });
  return { text: s, key: clean(key, 40), name: clean(name, 16) || '—' };
}

/** Riquadro per il telefono (solo con una prossima serata fissata). */
export function nextBoardHTML(next, me) {
  if (!Number(next?.at)) return '';
  const notes = boardList(next);
  const sugg = suggList(next, { me });
  return `<div class="nb-wrap">
    <h3>📝 ${esc(t('nb.board'))}</h3>
    ${notes.length ? `<ul class="nb-list">${notes.map((n) => `<li><b>${esc(n.name)}</b> ${esc(n.text)}${n.key === me ? ` <button type="button" class="link-btn" data-nbdel="board/${esc(n.id)}" aria-label="${esc(t('nb.del'))}">✕</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted small">${esc(t('nb.boardNone'))}</p>`}
    <form class="nb-form" data-nbform="board"><label class="sr-only" for="nbBoard">${esc(t('nb.boardPh'))}</label><input class="input input--sm" id="nbBoard" maxlength="120" placeholder="${esc(t('nb.boardPh'))}"><button type="submit" class="btn-sec btn-sec--sm">${esc(t('nb.add'))}</button></form>
    <h3>💡 ${esc(t('nb.sugg'))}</h3>
    ${sugg.length ? `<ul class="nb-list">${sugg.map((s) => `<li>🎲 <b>${esc(s.text)}</b> <span class="muted small">${esc(s.who ? s.who : t('nb.hidden'))}</span>${s.mine ? ` <button type="button" class="link-btn" data-nbdel="sugg/${esc(s.id)}" aria-label="${esc(t('nb.del'))}">✕</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted small">${esc(t('nb.suggNone'))}</p>`}
    <form class="nb-form" data-nbform="sugg"><label class="sr-only" for="nbSugg">${esc(t('nb.suggPh'))}</label><input class="input input--sm" id="nbSugg" maxlength="60" placeholder="${esc(t('nb.suggPh'))}"><button type="submit" class="btn-sec btn-sec--sm">${esc(t('nb.add'))}</button></form>
    <p class="muted small">🔒 ${esc(t('nb.privacy'))}</p>
  </div>`;
}

/** Riquadro in sola lettura per la TV: le note e i suggerimenti (nomi nascosti fino all'inizio). */
export function nextBoardTvHTML(next) {
  if (!Number(next?.at)) return '';
  const notes = boardList(next).slice(0, 6);
  const sugg = suggList(next);
  if (!notes.length && !sugg.length) return '';
  return `<div class="nb-tv">${notes.length ? `<p><b>📝 ${esc(t('nb.board'))}:</b> ${notes.map((n) => `${esc(n.name)}: ${esc(n.text)}`).join(' · ')}</p>` : ''}${sugg.length ? `<p><b>💡 ${esc(t('nb.sugg'))}:</b> ${sugg.map((s) => esc(s.text)).join(' · ')}</p>` : ''}</div>`;
}
