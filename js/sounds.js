// Effetti sonori della TV, sintetizzati al momento (nessun file audio da scaricare).
// Mixer: effetti e musica hanno volumi separati; "Silenzioso" spegne tutto.
import { SFX_META } from './sfx.js';
import { isSafeMode } from './safe.js';
const KEY = 'gnr_sounds';
const VOL_KEY = { fx: 'gnr_vol_fx', music: 'gnr_vol_music' };
const VOL_DEFAULT = { fx: 0.8, music: 0.45 };
const MUTE_KEY = 'gnr_mute';
let ctx = null;
let master = null;
let fxBus = null;
let musicBus = null;
let duckGain = null;
let noiseBuf = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } }
};

/** Effetti sonori attivi (e non in modalità silenziosa). */
export function soundsOn() {
  return store.get(KEY) !== 'off';
}
export function setSounds(on) {
  store.set(KEY, on ? 'on' : 'off');
}
export function isMuted() {
  return store.get(MUTE_KEY) === '1';
}
export function setMuted(on) {
  store.set(MUTE_KEY, on ? '1' : '0');
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.05);
  window.dispatchEvent(new CustomEvent('gnr-mute', { detail: on }));
}
export function getVolume(kind) {
  const v = Number(store.get(VOL_KEY[kind]));
  return Number.isFinite(v) && store.get(VOL_KEY[kind]) !== null ? Math.max(0, Math.min(1, v)) : VOL_DEFAULT[kind];
}
export function setVolume(kind, v) {
  const val = Math.max(0, Math.min(1, Number(v) || 0));
  store.set(VOL_KEY[kind], String(val));
  const bus = kind === 'fx' ? fxBus : musicBus;
  if (bus && ctx) bus.gain.setTargetAtTime(val, ctx.currentTime, 0.05);
}

/** Contesto audio condiviso (creato al primo gesto: i browser non permettono l'audio prima). */
export function audioCtx() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = isMuted() ? 0 : 1;
      master.connect(ctx.destination);
      fxBus = ctx.createGain();
      fxBus.gain.value = getVolume('fx');
      fxBus.connect(master);
      duckGain = ctx.createGain();
      duckGain.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = getVolume('music');
      musicBus.connect(duckGain);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}
export function musicOut() { audioCtx(); return musicBus; }
export function audioRunning() { return Boolean(ctx && ctx.state === 'running'); }

/** Abbassa la musica mentre parla il commentatore. */
export function duck(on) {
  if (!duckGain || !ctx) return;
  duckGain.gain.setTargetAtTime(on ? 0.25 : 1, ctx.currentTime, 0.25);
}

function audio() {
  if (!soundsOn() || isMuted() || isSafeMode()) return null;
  return audioCtx();
}
// Il browser permette l'audio solo dopo un gesto. Sugli schermi touch (tablet, telefono, TV touch)
// il gesto "vale" solo quando il dito si alza (pointerup/touchend/click), non quando appoggia:
// prima si ascoltava solo pointerdown, una volta sola, e sui touch l'audio restava bloccato per sempre.
// Ora si riprova a ogni gesto finché l'audio non parte davvero.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'];
const unlock = () => {
  const a = audioCtx();
  if (!a) return;
  const done = () => {
    if (a.state !== 'running') return;
    GESTURES.forEach((ev) => document.removeEventListener(ev, unlock, true));
    window.dispatchEvent(new Event('gnr-audio'));
  };
  if (a.state === 'running') done(); else a.resume().then(done).catch(() => {});
};
GESTURES.forEach((ev) => document.addEventListener(ev, unlock, true));

/** L'audio della TV è pronto? (false finché nessuno ha toccato lo schermo, o se il dispositivo non ha audio) */
export function audioBlocked() {
  if (!soundsOn() || isMuted() || isSafeMode()) return false;
  try { return !ctx || ctx.state !== 'running'; } catch { return true; }
}
/** Perché un effetto non si sente: '' se si sente. */
export function audioStatus() {
  if (isSafeMode()) return 'Safe Mode attiva';
  if (isMuted()) return 'TV in silenzioso';
  if (!soundsOn()) return 'effetti spenti negli Strumenti';
  if (!(window.AudioContext || window.webkitAudioContext)) return 'questo dispositivo non ha l’audio';
  if (!ctx || ctx.state !== 'running') return 'audio da attivare';
  return '';
}

function noiseBuffer(a) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function tone(freq, start, dur, type = 'sine', vol = 0.18, out = null) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out || fxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start, dur, vol = 0.12) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(fxBus);
  src.start(t);
}

/** Rumore filtrato con inviluppo (applausi, piatti, colpi). */
function burst(start, dur, { vol = 0.1, type = 'bandpass', freq = 1500, q = 1, attack = 0.002 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(fxBus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

/** Nota con frequenza che scivola (tamburi, trombone, sirene). */
function glide(f0, f1, start, dur, { type = 'sine', vol = 0.15, lp = 0, vib = 0, attack = 0.01 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  let node = o;
  if (vib) {
    const l = a.createOscillator();
    const lg = a.createGain();
    l.frequency.value = 6;
    lg.gain.value = vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  if (lp) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    node.connect(f);
    node = f;
  }
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g).connect(fxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Un voto in arrivo. */
export function ding() { tone(880, 0, 0.18, 'triangle', 0.12); tone(1320, 0.07, 0.2, 'triangle', 0.08); }
/** Una carta che si gira. */
export function pop(delay = 0) { tone(420, delay, 0.09, 'square', 0.06); tone(640, delay + 0.03, 0.08, 'triangle', 0.08); }
/** Rullo di tamburi prima del reveal. */
export function drumroll(seconds = 1.5, delay = 0) {
  for (let t = 0; t < seconds; t += 0.06) noise(delay + t, 0.05, 0.05 + (t / seconds) * 0.08);
}
/** Colpo di piatto (fine del rullo). */
export function cymbal(delay = 0) { burst(delay, 1.2, { vol: 0.1, type: 'highpass', freq: 5500, q: 0.6 }); }
/** Fanfara per la media, il vincitore del sondaggio e il primo posto. */
export function fanfare(delay = 0) {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, delay + i * 0.12, 0.35, 'triangle', 0.16));
  tone(1047, delay + 0.5, 0.7, 'sine', 0.12);
}
/** Qualcuno entra nella stanza. */
export function joinSound() { tone(660, 0, 0.12, 'sine', 0.1); tone(990, 0.08, 0.16, 'sine', 0.08); }
/** Fischio dell'arbitro per il time-out. */
export function whistle() {
  const a = audio();
  if (!a) return;
  [0, 0.42].forEach((d, i) => {
    const t = a.currentTime + d;
    const o = a.createOscillator();
    const lfo = a.createOscillator();
    const lg = a.createGain();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = 2900;
    lfo.frequency.value = 38;
    lg.gain.value = 160;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i ? 0.7 : 0.3));
    o.connect(g).connect(fxBus);
    o.start(t); lfo.start(t);
    o.stop(t + 0.75); lfo.stop(t + 0.75);
  });
}
/** Traguardo sbloccato. */
export function achievementSound(delay = 0) {
  [784, 988, 1175, 1568].forEach((f, i) => tone(f, delay + i * 0.07, 0.22, 'square', 0.05));
}
/** Vittoria (il vincitore della partita compare al reveal). */
export function victory(delay = 0) {
  [392, 523, 659, 784].forEach((f, i) => tone(f, delay + i * 0.09, 0.2, 'square', 0.045));
  [523, 659, 784].forEach((f) => tone(f, delay + 0.4, 0.9, 'triangle', 0.09));
}
/** Sconfitta: il trombone triste (anche per le medie molto basse). */
export function sadTrombone(delay = 0) {
  [[293.7, 0.32], [277.2, 0.32], [261.6, 0.32], [246.9, 1.1]].forEach(([f, d], i) => {
    glide(f, i === 3 ? f * 0.97 : f, delay + i * 0.36, d, { type: 'sawtooth', vol: 0.09, lp: 1100, vib: i === 3 ? 7 : 0, attack: 0.04 });
  });
}
/** Si apre un nuovo gioco. */
export function newGameSound() {
  tone(659, 0, 0.12, 'triangle', 0.1);
  tone(988, 0.1, 0.16, 'triangle', 0.1);
  tone(1319, 0.2, 0.35, 'sine', 0.08);
}
/** Fine serata: campane e accordo. */
export function endNightSound() {
  [523, 392, 659, 1047].forEach((f, i) => { tone(f, i * 0.28, 1.1, 'sine', 0.1); tone(f * 2.01, i * 0.28, 0.6, 'sine', 0.025); });
  [523, 659, 784, 1047].forEach((f) => tone(f, 1.3, 1.6, 'triangle', 0.07));
}
/** Ticchettio dell'orologio (conto alla rovescia). */
export function tick() { burst(0, 0.03, { vol: 0.12, type: 'highpass', freq: 3000 }); }
/** Lancetta del timer del voto: negli ultimi secondi il tic diventa più acuto e insistente. */
export function clockTick(urgent = false) {
  tone(urgent ? 1560 : 1180, 0, 0.045, 'square', urgent ? 0.06 : 0.035);
  if (urgent) tone(780, 0.02, 0.06, 'triangle', 0.05);
}
/** Tempo scaduto: sirena che scende. */
export function timeUp() {
  glide(880, 220, 0, 0.7, { type: 'sawtooth', vol: 0.08, lp: 1800 });
  glide(660, 165, 0.05, 0.75, { type: 'square', vol: 0.04, lp: 1200 });
}
/** Botto di un fuoco d'artificio. */
export function fireworkSound(delay = 0) {
  burst(delay, 0.06, { vol: 0.1, type: 'highpass', freq: 1800 });
  burst(delay + 0.03, 0.9, { vol: 0.14, type: 'lowpass', freq: 380 });
  burst(delay + 0.12, 0.7, { vol: 0.03, type: 'highpass', freq: 5000 });
}
/** Un giocatore sale sul gradino del podio. */
export function stepUp(delay = 0, height = 1) {
  [392, 494, 587].slice(0, height).forEach((f, i) => tone(f, delay + i * 0.11, 0.1, 'square', 0.05));
}

// ---------------------------------------------------------------------------
// Soundboard: effetti brevi richiamabili dalla regia o dai telefoni
// ---------------------------------------------------------------------------

function applause(seconds = 2.6) {
  for (let t = 0; t < seconds; t += 0.012 + Math.random() * 0.03) {
    const env = Math.min(1, t / 0.4) * Math.min(1, (seconds - t) / 0.8);
    burst(t, 0.03 + Math.random() * 0.03, { vol: 0.02 + env * 0.07 * Math.random(), freq: 900 + Math.random() * 1800, q: 0.9 });
  }
}

/** Risate: tante voci "ah ah ah" con filtri a formante. */
function laughter() {
  const a = audio();
  if (!a) return;
  const voices = [[150, 0], [205, 0.08], [265, 0.03], [310, 0.14], [180, 0.2]];
  for (const [pitch, off] of voices) {
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t = a.currentTime + off + i * (0.15 + Math.random() * 0.04);
      const f0 = pitch * (1.15 - i * 0.04) * (0.95 + Math.random() * 0.1);
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + 0.13);
      const g = a.createGain();
      const vol = 0.05 * (1 - i / (n + 2));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      for (const [ff, q, k] of [[780, 6, 1], [1250, 8, 0.6], [2600, 10, 0.25]]) {
        const f = a.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = ff * (pitch > 220 ? 1.12 : 1);
        f.Q.value = q;
        const fg = a.createGain();
        fg.gain.value = k;
        o.connect(f).connect(fg).connect(g);
      }
      g.connect(fxBus);
      o.start(t);
      o.stop(t + 0.16);
      burst(off + i * 0.155, 0.1, { vol: vol * 0.25, freq: 1800, q: 0.8 });
    }
  }
}

function badumtss() {
  glide(190, 120, 0, 0.16, { vol: 0.22, attack: 0.002 });
  glide(150, 95, 0.2, 0.18, { vol: 0.22, attack: 0.002 });
  glide(110, 45, 0.44, 0.25, { vol: 0.25, attack: 0.002 });
  burst(0.44, 1.1, { vol: 0.12, type: 'highpass', freq: 6500, q: 0.7 });
}

function clapper() {
  burst(0, 0.06, { vol: 0.35, freq: 2200, q: 0.8, attack: 0.001 });
  burst(0.005, 0.25, { vol: 0.05, freq: 900, q: 0.6 });
  tone(1800, 0, 0.03, 'square', 0.05);
}

function alarm() {
  for (let i = 0; i < 6; i++) glide(i % 2 ? 660 : 880, i % 2 ? 660 : 880, i * 0.26, 0.24, { type: 'square', vol: 0.06, lp: 2500, attack: 0.005 });
}

function airhorn() {
  [[0, 0.38], [0.5, 0.16], [0.75, 0.9]].forEach(([d, len]) => {
    for (const f of [440, 444, 660, 885]) glide(f * 0.92, f, d, len, { type: 'sawtooth', vol: 0.035, lp: 3200, attack: 0.02 });
  });
}

function suspenseSting() {
  [[123.5, 0, 0.35], [130.8, 0.45, 0.35], [116.5, 0.9, 1.8]].forEach(([f, d, len]) => {
    for (const k of [1, 2, 3]) glide(f * k, f * k * (len > 1 ? 0.985 : 1), d, len, { type: 'sawtooth', vol: 0.06 / k, lp: 900, vib: len > 1 ? 4 : 0, attack: 0.02 });
    burst(d, 0.4, { vol: 0.08, type: 'lowpass', freq: 200, q: 0.7 });
  });
}

function crickets() {
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 3; k++) tone(4300 + c * 400, c * 0.33 + r * 0.6 + k * 0.06, 0.04, 'sine', 0.035);
    }
  }
}

function buzzer() {
  tone(110, 0, 0.7, 'square', 0.07);
  tone(116, 0, 0.7, 'sawtooth', 0.05);
}

function correct() {
  tone(1319, 0, 0.35, 'sine', 0.12);
  tone(1760, 0.16, 0.5, 'sine', 0.12);
}

function bigDrumroll() {
  for (let t = 0; t < 2.2; t += 0.045) burst(t, 0.04, { vol: 0.04 + (t / 2.2) * 0.09, type: 'bandpass', freq: 400, q: 0.7 });
  glide(90, 45, 2.25, 0.3, { vol: 0.25, attack: 0.002 });
  burst(2.25, 1.6, { vol: 0.14, type: 'highpass', freq: 5000, q: 0.6 });
}

const PLAY = {
  applausi: applause, risate: laughter, trombone: sadTrombone, badumtss, rullo: bigDrumroll, tensione: suspenseSting,
  tromba: airhorn, ciak: clapper, allarme: alarm, grilli: crickets, esatto: correct, errore: buzzer, fischio: whistle
};
export const SFX = SFX_META.map((m) => ({ ...m, play: PLAY[m.k] }));

export function playSfx(k) {
  const s = SFX.find((x) => x.k === k);
  if (s) s.play();
  return s || null;
}
