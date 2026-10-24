// Il commentatore della serata: frasi celebrative o "roast" lette dalla TV con la sintesi vocale del browser.
import { fmt } from './util.js';
import { duck, isMuted } from './sounds.js';
import { isSafeMode } from './safe.js';
import { t, has, fmtList, locale } from './i18n.js';

const KEY = 'gnr_commentator';
// I valori ('off', 'festa', 'roast') restano codici (localStorage); le etichette seguono la lingua.
// L'elenco è "vivo": se la lingua cambia senza ricaricare, le etichette si aggiornano qui dentro.
const MODES = ['off', 'festa', 'roast'];
export const COMMENTATOR_MODES = [];
function fillModes() { COMMENTATOR_MODES.splice(0, COMMENTATOR_MODES.length, ...MODES.map((m) => [m, t(`voice.mode.${m}`)])); }
fillModes();
if (typeof window !== 'undefined') window.addEventListener?.('gnr-lang', fillModes);

export function commentatorMode() {
  try { return localStorage.getItem(KEY) || 'off'; } catch { return 'off'; }
}
export function setCommentatorMode(m) {
  try { localStorage.setItem(KEY, m); } catch { /* niente */ }
}

/**
 * Frasi alternative. I dizionari accettano solo testi o plurali (niente array), quindi le varianti
 * sono chiavi numerate: voice.roast.open.1, voice.roast.open.2, … ; variant('voice.roast.open', p)
 * conta quante ne esistono nella lingua scelta e ne legge una a caso. Per aggiungere una frase basta
 * aggiungere la chiave successiva in it-voice.js ed en-voice.js.
 */
function variant(base, params) {
  let n = 0;
  while (has(`${base}.${n + 1}`)) n++;
  return t(n ? `${base}.${1 + Math.floor(Math.random() * n)}` : base, params);
}
const names = (list) => fmtList(list.filter(Boolean));
const num = (x) => fmt(x);
function duration(min) {
  if (!min) return '';
  if (min < 60) return t('voice.dur.min', { n: min });
  const h = Math.floor(min / 60), m = min % 60;
  const hours = t('voice.dur.hours', { n: h });
  return m ? t('voice.dur.hm', { hours, minutes: t('voice.dur.min', { n: m }) }) : hours;
}
const band = (avg) => (avg >= 9 ? 's9' : avg >= 8 ? 's8' : avg >= 7 ? 's7' : avg >= 6 ? 's6' : avg >= 5 ? 's5' : 's0');

/**
 * Commento al reveal di un gioco.
 * d: { game, avg, n, min, max, minNames, maxNames, winners, mvp, consensus, rank, total, seers, betsTotal, audience }
 */
export function revealComment(d, mode) {
  if (!d || !d.n) return '';
  const game = d.game;
  const avg = num(d.avg);
  const parts = [];
  if (mode === 'roast') {
    parts.push(variant('voice.roast.open', { game }));
    parts.push(variant(`voice.roast.${band(d.avg)}`, { avg, game }));
    if (d.max - d.min >= 4 && d.minNames.length) parts.push(variant('voice.roast.low', { names: names(d.minNames), min: d.min }));
    if (d.winners.length) parts.push(variant('voice.roast.win', { names: names(d.winners) }));
    if (d.betsTotal && d.winners.length && !d.seers.length) parts.push(t('voice.roast.unforeseen', { n: d.winners.length, names: names(d.winners) }));
    else if (d.seers.length) parts.push(t('voice.roast.seers', { n: d.seers.length, names: names(d.seers) }));
    if (d.mvp.length) parts.push(variant('voice.roast.mvp', { names: names(d.mvp) }));
    if (d.rank === 1 && d.total > 1) parts.push(t('voice.roast.top'));
    return parts.join(' ');
  }
  parts.push(variant('voice.party.open', { game }));
  parts.push(t(`voice.party.${band(d.avg)}`, { avg }));
  if (d.max - d.min >= 4 && d.minNames.length && d.maxNames.length) parts.push(t('voice.party.split', { min: d.min, max: d.max, minNames: names(d.minNames), maxNames: names(d.maxNames) }));
  else if (d.consensus !== null && d.consensus >= 85 && d.n >= 3) parts.push(t('voice.party.consensus', { pct: d.consensus }));
  if (d.winners.length) parts.push(t('voice.party.win', { names: names(d.winners) }));
  if (d.seers.length) parts.push(t('voice.party.seers', { names: names(d.seers) }));
  if (d.mvp.length) parts.push(t('voice.party.mvp', { names: names(d.mvp) }));
  if (d.rank === 1 && d.total > 1) parts.push(t('voice.party.top'));
  return parts.join(' ');
}

/**
 * Resoconto della serata.
 * d: { group, games, minutes, top, flop, kings, kingWins, mvp, awards: [{title, who}], next }
 */
export function nightRecap(d, mode) {
  const parts = [];
  const games = t('voice.recap.games', { n: d.games });
  const time = d.minutes ? duration(d.minutes) : '';
  const m = mode === 'roast' ? 'roast' : 'party';
  parts.push(d.group ? t(`voice.recap.${m}.openGroup`, { group: d.group }) : t(`voice.recap.${m}.open`));
  parts.push(time ? t(`voice.recap.${m}.time`, { games, time }) : t('voice.recap.count', { games }));
  if (mode === 'roast') {
    if (d.top) parts.push(t('voice.recap.roast.top', { game: d.top.name, avg: num(d.top.avg) }));
    if (d.flop && d.flop.name !== d.top?.name) parts.push(t('voice.recap.roast.flop', { game: d.flop.name, avg: num(d.flop.avg) }));
    if (d.kings.length) parts.push(t('voice.recap.roast.kings', { n: d.kings.length, names: names(d.kings), wins: t('voice.recap.wins', { n: d.kingWins }) }));
    if (d.mvp.length) parts.push(t('voice.recap.roast.mvp', { names: names(d.mvp) }));
  } else {
    if (d.top) parts.push(t('voice.recap.party.top', { game: d.top.name, avg: num(d.top.avg) }));
    if (d.kings.length) parts.push(t('voice.recap.party.kings', { names: names(d.kings), wins: t('voice.recap.winsWon', { n: d.kingWins }) }));
    if (d.mvp.length) parts.push(t('voice.recap.party.mvp', { names: names(d.mvp) }));
  }
  for (const a of d.awards.slice(0, 3)) parts.push(t('voice.recap.award', { title: a.title, who: a.who }));
  parts.push(d.next ? t(`voice.recap.${m}.next`, { next: d.next }) : t(`voice.recap.${m}.bye`));
  return parts.join(' ');
}

/** Il primo posto sul podio. */
export function podiumLine(name, avg, mode) {
  return t(mode === 'roast' ? 'voice.podium.roast' : 'voice.podium.party', { game: name, avg: num(avg) });
}

// ---------------------------------------------------------------------------
// Voce e sottotitoli
// ---------------------------------------------------------------------------

let voice = null;
/** Una voce nella lingua scelta (locale() di i18n.js): prima quella della stessa regione, poi la stessa lingua. */
function pickVoice() {
  if (voice || !('speechSynthesis' in window)) return voice;
  const loc = locale().toLowerCase().replace('_', '-');
  const base = loc.slice(0, 2);
  const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
  const all = window.speechSynthesis.getVoices().filter((v) => norm(v) === base || norm(v).startsWith(`${base}-`));
  const vs = [...all.filter((v) => norm(v) === loc), ...all.filter((v) => norm(v) !== loc)];
  const nice = base === 'it' ? /alice|luca|elsa|isabella|diego|federica/i : /daniel|serena|kate|libby|sonia|ryan|samantha|aria|jenny/i;
  voice = vs.find((v) => /google/i.test(v.name)) || vs.find((v) => nice.test(v.name)) || vs[0] || null;
  return voice;
}
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', () => { voice = null; pickVoice(); });
// Cambio di lingua senza ricaricare: si sceglie di nuovo la voce.
window.addEventListener?.('gnr-lang', () => { voice = null; });

export function voiceAvailable() {
  return 'speechSynthesis' in window && Boolean(pickVoice());
}

let capTimer = null;
function caption(text) {
  let el = document.getElementById('speechCap');
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'speechCap';
    el.className = 'speech-cap';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span aria-hidden="true">🎙️</span><span></span>`;
  el.lastChild.textContent = text;
}

/** Legge il testo (se c'è una voce nella lingua scelta) e lo mostra come sottotitolo. */
let speechToken = 0;
export function speak(text, { captions = true } = {}) {
  if (!text || isSafeMode()) return;
  clearTimeout(capTimer);
  const token = ++speechToken;
  if (captions) caption(text);
  const hide = () => {
    if (token !== speechToken) return;
    duck(false);
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { if (token === speechToken) caption(''); }, 1200);
  };
  const v = isMuted() ? null : pickVoice();
  if (!v) { capTimer = setTimeout(() => caption(''), Math.max(4000, text.length * 75)); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = 1.04;
    u.pitch = 1;
    u.onstart = () => duck(true);
    u.onend = hide;
    u.onerror = hide;
    window.speechSynthesis.speak(u);
    // Rete di sicurezza: alcuni browser non chiamano onend.
    setTimeout(hide, Math.max(6000, text.length * 110));
  } catch { hide(); }
}

export function stopSpeaking() {
  speechToken++;
  try { window.speechSynthesis?.cancel(); } catch { /* niente */ }
  duck(false);
  caption('');
}
