// Tradizioni del gruppo (1.12): regole della casa (idea 68) e accessori stagionali degli avatar (idea 25).
//
// Regole della casa: groups/<gruppo>/house/<id> = { text, g?, at } — una frase breve (al massimo 200
// caratteri), legata a un gioco (g = nome del gioco) oppure generale. Le scrivono proprietario, admin e chi
// ha la chiave del gruppo; le leggono tutti i dispositivi del gruppo. Appaiono nella scheda "Tradizioni"
// della TV e accanto alle regole del gioco quando lo si spiega.
//
// Accessori stagionali: un piccolo simbolo sull'avatar in certi giorni dell'anno (Natale, Capodanno,
// San Valentino, Carnevale, Pasqua, estate, Halloween). Solo cosmetici, spenti di base: li accende la
// TV per la serata (meta/seasonal) e valgono su TV e telefoni. Non cambiano nomi né colori.
//
// Solo funzioni pure: prove in tests/insights.test.mjs.

export const HOUSE_MAX = 40;
export const HOUSE_TEXT_MAX = 200;
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Regola della casa da salvare: { text, g?, at }. Lancia un errore con code 'text' se il testo è vuoto. */
export function makeHouseRule(text, game = '', now = Date.now()) {
  const tx = clean(text, HOUSE_TEXT_MAX);
  if (!tx) throw Object.assign(new Error('text'), { code: 'text' });
  const g = clean(game, 60);
  return { text: tx, ...(g ? { g } : {}), at: now };
}

/** Elenco controllato delle regole della casa: [{ id, text, g, at }] (prima quelle generali, poi per gioco). */
export function houseList(obj) {
  return Object.entries(obj || {}).map(([id, r]) => {
    const text = clean(r?.text, HOUSE_TEXT_MAX);
    return text && /^[\w-]{1,40}$/.test(id) ? { id, text, g: clean(r?.g, 60), at: Number(r?.at) || 0 } : null;
  }).filter(Boolean).sort((a, b) => (a.g ? 1 : 0) - (b.g ? 1 : 0) || a.g.localeCompare(b.g) || a.at - b.at).slice(0, HOUSE_MAX);
}

/** Regole della casa di un gioco (per nome, senza badare a maiuscole e accenti). */
export function houseFor(obj, name) {
  const k = norm(name);
  return k ? houseList(obj).filter((r) => r.g && norm(r.g) === k) : [];
}

/** Domenica di Pasqua (calendario gregoriano, algoritmo anonimo "Meeus/Jones/Butcher"). */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Accessorio stagionale per una data: { id, icon } oppure null.
 * Capodanno 31/12–1/1 🎉 · Natale 8/12–6/1 🎄 · San Valentino 14/2 💘 · Carnevale (giovedì grasso →
 * martedì grasso) 🎭 · Pasqua (giovedì santo → lunedì dell'Angelo) 🐣 · Halloween 25/10–2/11 🎃 ·
 * estate 1/7–31/8 🕶️.
 */
export function seasonalAccessory(at = Date.now()) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  const md = m * 100 + day;
  const dayMs = 86400000;
  const today = new Date(y, m - 1, day).getTime();
  const e = easter(y).getTime();
  const near = (from, to) => today >= e + from * dayMs - dayMs / 2 && today <= e + to * dayMs + dayMs / 2;
  if (md === 1231 || md === 101) return { id: 'newyear', icon: '🎉' };
  if (md >= 1208 || md <= 106) return { id: 'xmas', icon: '🎄' };
  if (md === 214) return { id: 'valentine', icon: '💘' };
  if (near(-52, -47)) return { id: 'carnival', icon: '🎭' };
  if (near(-3, 1)) return { id: 'easter', icon: '🐣' };
  if (md >= 1025 && md <= 1102) return { id: 'halloween', icon: '🎃' };
  if (md >= 701 && md <= 831) return { id: 'summer', icon: '🕶️' };
  return null;
}
