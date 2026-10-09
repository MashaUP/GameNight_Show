// Avatar dei giocatori generati con DiceBear (incluso nel progetto, nessuna chiamata esterna).
import { createAvatar, adventurer, bigSmile, toonHead } from '../vendor/dicebear.js';
import { esc, safeColor, initials } from './util.js';

const STYLES = {
  adventurer,
  'big-smile': bigSmile,
  'toon-head': toonHead
};
export const AVATAR_STYLES = Object.keys(STYLES);

const cache = new Map();

/** Parti del personaggio modificabili nell'editor, lette dallo schema di ogni stile DiceBear. */
const PART_LABELS = {
  hair: 'Capelli', rearHair: 'Capelli dietro', hairColor: 'Colore capelli', eyes: 'Occhi', eyebrows: 'Sopracciglia',
  mouth: 'Bocca', glasses: 'Occhiali', earrings: 'Orecchini', features: 'Dettagli', accessories: 'Accessori',
  beard: 'Barba', clothes: 'Vestiti', clothesColor: 'Colore vestiti', skinColor: 'Pelle'
};
export function avatarParts(style) {
  const props = (STYLES[style] || adventurer).schema?.properties || {};
  const parts = [];
  for (const [key, label] of Object.entries(PART_LABELS)) {
    const p = props[key];
    if (!p) continue;
    const values = p.items?.enum || (Array.isArray(p.default) ? p.default : null);
    if (!values || values.length < 2) continue;
    parts.push({ key, label, values, color: !p.items?.enum, optional: `${key}Probability` in props });
  }
  return parts;
}

/** Opzioni DiceBear a partire dalle scelte salvate (null = parte tolta). */
function dicebearOptions(style, opts) {
  const out = {};
  if (!opts || typeof opts !== 'object') return out;
  const props = (STYLES[style] || adventurer).schema?.properties || {};
  for (const [k, v] of Object.entries(opts)) {
    if (!(k in PART_LABELS) || !(k in props)) continue;
    if (v === 'none') { if (`${k}Probability` in props) out[`${k}Probability`] = 0; continue; }
    if (typeof v !== 'string' || !/^[A-Za-z0-9]+$/.test(v)) continue;
    out[k] = [v];
    if (`${k}Probability` in props) out[`${k}Probability`] = 100;
  }
  return out;
}

export function avatarUri(style, seed, opts = null) {
  const key = `${style}|${seed}|${opts ? JSON.stringify(opts) : ''}`;
  if (!cache.has(key)) {
    const st = STYLES[style] || adventurer;
    try {
      cache.set(key, createAvatar(st, { seed: String(seed || 'gamenight'), ...dicebearOptions(style, opts) }).toDataUri());
    } catch {
      cache.set(key, '');
    }
  }
  return cache.get(key);
}

export function randomSeed() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(36) + buf[1].toString(36);
}

/** Nove proposte di personaggio, tre per ogni stile. */
export function avatarOptions(count = 9) {
  return Array.from({ length: count }, (_, i) => ({
    style: AVATAR_STYLES[i % AVATAR_STYLES.length],
    seed: randomSeed()
  }));
}

/**
 * Avatar circolare con lo sfondo del colore personale.
 * size: lato in qualsiasi unità CSS (es. "4rem", "64px").
 */
export function avatarHTML(player, size = '4rem', cls = '') {
  const photo = typeof player?.photo === 'string' && player.photo.startsWith('data:image/') ? player.photo : '';
  const uri = photo || (player ? avatarUri(player.style, player.seed, player.opts) : '');
  const color = safeColor(player?.color);
  const inner = uri
    ? `<img src="${esc(uri)}" alt="" draggable="false">`
    : `<span class="avatar-initial">${esc(initials(player?.name))}</span>`;
  return `<span class="avatar ${photo ? 'avatar--photo' : ''} ${cls}" style="--s:${size};--pc:${color}">${inner}</span>`;
}

export const AVATAR_CREDITS = [
  { name: 'Adventurer', author: 'Lisa Wischofsky', license: 'CC BY 4.0' },
  { name: 'Big Smile', author: 'Ashley Seo', license: 'CC BY 4.0' },
  { name: 'Toon Head', author: 'Johan Melin', license: 'CC BY 4.0' }
];
