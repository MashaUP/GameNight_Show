// Figurine collezionabili: una carta olografica per ogni giocatore del gruppo,
// in HTML (TV e telefono) e come immagine PNG da condividere.
import { esc, fmt, safeColor } from './util.js';
import { avatarHTML, avatarUri } from './avatars.js';
import { t } from './i18n.js';

const RARITY_BG = {
  comune: ['#5B6CFF', '#7FD8FF'],
  rara: ['#2EC4B6', '#B5FFEF'],
  epica: ['#9B5CFF', '#FF8FE0'],
  leggendaria: ['#FFB000', '#FFF2A8']
};

/** Figurina in HTML. card: risultato di playerCard(); player: per l'avatar (stile, colore, foto). owned=false: da trovare. */
export function cardHTML(card, player, { owned = true, big = false, me = false } = {}) {
  const r = card.rarity?.key || 'comune';
  if (!owned) {
    return `<article class="gcard gcard--missing ${big ? 'gcard--big' : ''}" aria-label="${esc(t('report.card.missing'))}">
      <div class="gcard-in"><span class="gcard-q" aria-hidden="true">?</span><b class="gcard-name">${esc(card.name)}</b><small>${esc(t('report.card.missingHint'))}</small></div></article>`;
  }
  const stars = '★'.repeat(card.rarity?.stars || 1);
  const avg = card.avgGiven === null || card.avgGiven === undefined ? '—' : fmt(card.avgGiven);
  return `
    <article class="gcard gcard--${r} ${big ? 'gcard--big' : ''} ${me ? 'is-me' : ''}" style="--pc:${safeColor(player?.color)}" tabindex="0" aria-label="${esc(t('report.card.aria', { name: card.name, rarity: card.rarity?.label || '' }))}">
      <div class="gcard-in">
        <div class="gcard-top"><span class="gcard-lv">Lv ${card.level}</span><span class="gcard-no">#${card.number}</span></div>
        <div class="gcard-art">${avatarHTML(player || { name: card.name }, big ? '9rem' : '5.6rem')}</div>
        <b class="gcard-name">${esc(card.name)}</b>
        <span class="gcard-title">${esc(card.levelName || '')}</span>
        <dl class="gcard-stats">
          <div><dt>${esc(t('report.card.nights'))}</dt><dd>${card.nights}</dd></div>
          <div><dt>${esc(t('report.card.wins'))}</dt><dd>${card.wins}</dd></div>
          <div><dt>MVP</dt><dd>${card.mvp}</dd></div>
          <div><dt>${esc(t('report.card.avgGiven'))}</dt><dd>${avg}</dd></div>
        </dl>
        ${card.fav ? `<p class="gcard-fav">❤️ ${esc(card.fav)}</p>` : ''}
        ${card.seasonTitles?.length ? `<p class="gcard-crown" title="${esc(card.seasonTitles.join(', '))}">👑 ${card.seasonTitles.length === 1 ? esc(t('report.card.champion', { season: card.seasonTitles[0] })) : esc(t('report.card.seasons', { n: card.seasonTitles.length }))}</p>` : ''}
        <div class="gcard-foot"><span class="gcard-stars">${stars}</span><span>${esc(card.rarity?.label || '')}</span></div>
      </div>
      <span class="gcard-foil" aria-hidden="true"></span>
    </article>`;
}

/** Effetto olografico che segue il dito o il mouse (e l'inclinazione del telefono, dove permessa). */
export function bindTilt(root) {
  const move = (el, x, y) => {
    const r = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (x - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    el.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 18}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
  };
  root.addEventListener('pointermove', (e) => { const c = e.target.closest('.gcard:not(.gcard--missing)'); if (c) move(c, e.clientX, e.clientY); });
  root.addEventListener('pointerleave', () => root.querySelectorAll('.gcard').forEach((c) => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }), true);
}

// ---------------------------------------------------------------------------
// PNG da condividere
// ---------------------------------------------------------------------------

function loadImg(src) {
  if (!src || !/^data:image\//.test(src)) return Promise.resolve(null);
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Imposta il font più grande (da `size` in giù, fino a `min`) con cui il testo sta in `max` pixel. */
function shrink(c, text, max, size, weight, family, min = 18) {
  let s = size;
  const set = () => { c.font = `${weight ? `${weight} ` : ''}${s}px ${family}`; };
  set();
  while (s > min && c.measureText(text).width > max) { s -= 2; set(); }
}

/** Disegna la figurina su un canvas 900×1260 e restituisce il PNG. */
export async function renderCardImage(card, player, groupName = '') {
  try { await document.fonts?.load?.('80px "Fredoka"'); await document.fonts?.load?.('700 60px "Fredoka"'); } catch { /* niente */ }
  const W = 900, H = 1260;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const [a, b] = RARITY_BG[card.rarity?.key] || RARITY_BG.comune;
  // Sfondo esterno
  c.fillStyle = '#140B2E'; c.fillRect(0, 0, W, H);
  // Bordo olografico
  const g = c.createLinearGradient(0, 0, W, H);
  ['#FF3DCB', '#FFD34D', '#3DF5E0', '#9B7BFF', '#FF8A3D'].forEach((col, i) => g.addColorStop(i / 4, col));
  c.fillStyle = g; rr(c, 30, 30, W - 60, H - 60, 56); c.fill();
  const inner = c.createLinearGradient(0, 60, 0, H - 60);
  inner.addColorStop(0, a); inner.addColorStop(1, b);
  c.fillStyle = inner; rr(c, 60, 60, W - 120, H - 120, 40); c.fill();
  c.lineWidth = 10; c.strokeStyle = '#1F1A3D'; c.stroke();
  // Raggi
  c.save(); c.globalAlpha = 0.18; c.translate(W / 2, 420);
  for (let i = 0; i < 24; i++) { c.rotate(Math.PI / 12); c.fillStyle = '#FFFFFF'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -700); c.lineTo(40, -700); c.closePath(); c.fill(); }
  c.restore();
  const DISPLAY = '"Fredoka", "Nunito", sans-serif';
  const NUM = '"Fredoka", "Nunito", sans-serif';
  c.fillStyle = '#1F1A3D';
  c.font = `52px ${NUM}`; c.textAlign = 'left'; c.fillText(`LV ${card.level}`, 100, 150);
  c.textAlign = 'right'; c.fillText(`#${card.number}`, W - 100, 150);
  // Avatar
  const photo = typeof player?.photo === 'string' && player.photo.startsWith('data:image/') ? player.photo : '';
  const img = await loadImg(photo || (player ? avatarUri(player.style, player.seed, player.opts) : ''));
  c.save();
  c.beginPath(); c.arc(W / 2, 430, 220, 0, Math.PI * 2); c.fillStyle = safeColor(player?.color); c.fill();
  c.lineWidth = 14; c.strokeStyle = '#1F1A3D'; c.stroke(); c.clip();
  if (img) c.drawImage(img, W / 2 - 220, 210, 440, 440);
  c.restore();
  c.textAlign = 'center';
  c.font = `96px ${DISPLAY}`; c.fillStyle = '#1F1A3D';
  let name = card.name;
  while (c.measureText(name).width > W - 200 && name.length > 2) name = name.slice(0, -1);
  c.fillText(name, W / 2, 760);
  shrink(c, card.levelName || '', W - 200, 46, '', DISPLAY); c.fillText(card.levelName || '', W / 2, 820);
  // Statistiche
  const stats = [[t('report.card.nights'), card.nights], [t('report.card.wins'), card.wins], ['MVP', card.mvp], [t('report.card.avg'), card.avgGiven === null || card.avgGiven === undefined ? '—' : fmt(card.avgGiven)]];
  stats.forEach(([l, v], i) => {
    const x = 120 + i * 170;
    c.fillStyle = 'rgba(255,255,255,0.75)'; rr(c, x, 860, 150, 150, 26); c.fill(); c.lineWidth = 6; c.strokeStyle = '#1F1A3D'; c.stroke();
    c.fillStyle = '#1F1A3D'; c.font = `56px ${NUM}`; c.fillText(String(v), x + 75, 950);
    shrink(c, l, 136, 28, '700', 'Nunito, sans-serif'); c.fillText(l, x + 75, 990);
  });
  if (card.fav) { shrink(c, `❤️ ${card.fav}`, W - 200, 34, '800', 'Nunito, sans-serif', 24); c.fillText(`❤️ ${card.fav}`, W / 2, 1070); }
  c.font = `44px ${DISPLAY}`;
  c.fillText(`${'★'.repeat(card.rarity?.stars || 1)}  ${card.rarity?.label || ''}`, W / 2, 1140);
  c.font = '700 26px Nunito, sans-serif'; c.fillStyle = 'rgba(31,26,61,0.75)';
  c.fillText(`GameNight Show${groupName ? ` · ${groupName}` : ''}`, W / 2, 1185);
  return new Promise((resolve) => cv.toBlob((bl) => resolve(bl), 'image/png'));
}
