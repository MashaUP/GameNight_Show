// Musica d'atmosfera della TV, generata al momento con Web Audio (nessun file, nessun diritto d'autore).
// Quattro atmosfere: lounge (attesa), suspense (votazione), festa (premiazione), pausa.
import { audioCtx, musicOut, isMuted } from './sounds.js';
import { isSafeMode } from './safe.js';

const KEY = 'gnr_music';
export const MUSIC_MODES = [
  ['off', 'Spenta'],
  ['auto', 'Automatica (segue la serata)'],
  ['lounge', 'Lounge'],
  ['suspense', 'Suspense'],
  ['festa', 'Festa'],
  ['pausa', 'Relax']
];
export const MOOD_LABEL = { lounge: 'Lounge', suspense: 'Suspense', festa: 'Festa', pausa: 'Relax' };

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
let noise = null;

function noiseBuffer(a) {
  if (noise) return noise;
  noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

// ---------------------------------------------------------------------------
// Strumenti
// ---------------------------------------------------------------------------

function env(a, g, t, vol, attack, dur, release = 0.08) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur) + release);
}

function osc(a, out, type, freq, t, dur, vol, { attack = 0.01, release = 0.08, lp = 0, detune = 0 } = {}) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  const g = a.createGain();
  env(a, g, t, vol, attack, dur, release);
  if (lp) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + release + 0.05);
}

const I = {
  epiano(a, out, m, t, dur, vol) {
    osc(a, out, 'sine', midi(m), t, dur, vol, { attack: 0.008, release: 0.3 });
    osc(a, out, 'triangle', midi(m + 12), t, dur * 0.4, vol * 0.18, { attack: 0.005, release: 0.15 });
  },
  pad(a, out, m, t, dur, vol) {
    osc(a, out, 'sawtooth', midi(m), t, dur, vol, { attack: Math.min(0.8, dur / 3), release: 0.9, lp: 900, detune: -7 });
    osc(a, out, 'sawtooth', midi(m), t, dur, vol, { attack: Math.min(0.8, dur / 3), release: 0.9, lp: 900, detune: 7 });
  },
  bass(a, out, m, t, dur, vol) {
    osc(a, out, 'triangle', midi(m), t, dur, vol, { attack: 0.006, release: 0.06, lp: 700 });
    osc(a, out, 'sine', midi(m), t, dur, vol * 0.6, { attack: 0.006, release: 0.06 });
  },
  bell(a, out, m, t, vol) {
    osc(a, out, 'sine', midi(m), t, 0.9, vol, { attack: 0.004, release: 0.5 });
    osc(a, out, 'sine', midi(m) * 3.01, t, 0.25, vol * 0.25, { attack: 0.002, release: 0.2 });
  },
  pluck(a, out, m, t, vol) {
    osc(a, out, 'triangle', midi(m), t, 0.12, vol, { attack: 0.003, release: 0.12, lp: 3000 });
  },
  kick(a, out, t, vol) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(a, g, t, vol, 0.002, 0.16, 0.05);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  },
  hit(a, out, t, vol, freq, type, dur) {
    const s = a.createBufferSource();
    s.buffer = noiseBuffer(a);
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = a.createGain();
    env(a, g, t, vol, 0.002, dur, 0.03);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.1);
  },
  hat(a, out, t, vol, open = false) { I.hit(a, out, t, vol, 7000, 'highpass', open ? 0.18 : 0.04); },
  snare(a, out, t, vol) { I.hit(a, out, t, vol, 1800, 'bandpass', 0.12); I.hit(a, out, t, vol * 0.5, 4000, 'highpass', 0.08); },
  brush(a, out, t, vol) { I.hit(a, out, t, vol, 2500, 'bandpass', 0.18); },
  click(a, out, t, vol) { I.hit(a, out, t, vol, 3500, 'highpass', 0.02); }
};

// ---------------------------------------------------------------------------
// Atmosfere: progressioni e pattern a sedicesimi
// ---------------------------------------------------------------------------

const MOODS = {
  lounge: {
    bpm: 84,
    swing: 0.32,
    // Re-9, Sol13, Domaj9, La7b9: il classico giro jazz
    bars: [[38, [53, 57, 60, 64]], [43, [53, 59, 64]], [36, [52, 55, 59, 62]], [45, [55, 58, 61, 64]]],
    step(a, out, s, t, [root, chord], next, sd, rnd) {
      if (s === 0) chord.forEach((m) => I.epiano(a, out, m, t, sd * 12, 0.035));
      if (s === 10) chord.forEach((m) => I.epiano(a, out, m, t, sd * 5, 0.02));
      if (s % 4 === 0) {
        const walk = [root, root + 7, root + 12, (next ? next[0] : root) + (rnd() < 0.5 ? -1 : 1)];
        I.bass(a, out, walk[s / 4], t, sd * 3.2, 0.09);
      }
      if (s === 4 || s === 12) I.brush(a, out, t, 0.025);
      if (s % 4 === 2) I.hat(a, out, t, 0.012);
      if (s === 0) I.kick(a, out, t, 0.07);
      if ((s === 6 || s === 14) && rnd() < 0.3) I.bell(a, out, chord[Math.floor(rnd() * chord.length)] + 12, t, 0.03);
    }
  },
  suspense: {
    bpm: 96,
    bars: [[45, [57, 64]], [45, [57, 64]], [41, [57, 65]], [41, [57, 65]], [38, [57, 62]], [38, [57, 62]], [40, [56, 64]], [40, [56, 64]]],
    step(a, out, s, t, [root, chord], next, sd, rnd, lv) {
      if (s === 0) chord.forEach((m) => I.pad(a, out, m, t, sd * 16, 0.018 + lv * 0.006));
      const pulse = lv >= 1 ? 1 : 2;
      if (s % pulse === 0) I.bass(a, out, root + (s % 8 === 6 ? 12 : 0), t, sd * 0.9, 0.06 + lv * 0.01);
      if (s % (lv >= 2 ? 2 : 4) === 0) I.click(a, out, t, 0.035);
      if (lv >= 1 && (s === 0 || s === 3)) I.kick(a, out, t, 0.09);
      if (lv >= 2 && s % 2 === 1) I.hat(a, out, t, 0.01);
      if (lv >= 2 && s === 8) I.pad(a, out, chord[0] + 12, t, sd * 8, 0.01);
    }
  },
  festa: {
    bpm: 116,
    bars: [[36, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]]],
    step(a, out, s, t, [root, chord], next, sd, rnd) {
      if (s % 4 === 0) I.kick(a, out, t, 0.11);
      if (s === 4 || s === 12) I.snare(a, out, t, 0.045);
      if (s % 4 === 2) I.hat(a, out, t, 0.022, true);
      if (s % 4 === 2 || s === 0) I.bass(a, out, root + (s % 8 === 2 ? 12 : 0), t, sd * 1.6, 0.075);
      if (s === 0 || s === 3 || s === 6 || s === 10) chord.forEach((m) => I.epiano(a, out, m, t, sd * 1.5, 0.022));
      if (s % 2 === 0) I.pluck(a, out, chord[(s / 2) % chord.length] + 12, t, 0.018);
    }
  },
  pausa: {
    bpm: 64,
    bars: [[41, [53, 57, 60, 64]], [40, [52, 55, 59, 62]], [38, [53, 57, 60, 62]], [36, [52, 55, 59, 64]]],
    step(a, out, s, t, [root, chord], next, sd, rnd) {
      if (s === 0) { chord.forEach((m) => I.pad(a, out, m, t, sd * 16, 0.012)); I.bass(a, out, root, t, sd * 12, 0.05); }
      if (s % 4 === 0 && rnd() < 0.35) I.bell(a, out, chord[Math.floor(rnd() * chord.length)] + 12, t, 0.025);
    }
  }
};

// ---------------------------------------------------------------------------
// Sequencer
// ---------------------------------------------------------------------------

export const Music = {
  mood: null,
  level: 0,
  timer: null,
  bus: null,
  nextTime: 0,
  stepIndex: 0,
  bar: 0,
  seed: 1,

  mode() { try { return localStorage.getItem(KEY) || 'off'; } catch { return 'off'; } },
  setMode(m) {
    try { localStorage.setItem(KEY, m); } catch { /* niente */ }
    window.dispatchEvent(new Event('gnr-music'));
  },
  playing() { return Boolean(this.timer && this.mood); },
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; },

  /** Imposta l'atmosfera (null = silenzio). Cambia con una dissolvenza a fine battuta. */
  play(mood, level = 0) {
    this.level = level;
    if (mood === this.mood && this.timer) return;
    if (!mood || isMuted() || isSafeMode()) { this.stop(); return; }
    const a = audioCtx();
    if (!a || a.state !== 'running') { this.wanted = mood; return; }
    this.wanted = null;
    const old = this.bus;
    if (old) {
      old.gain.setTargetAtTime(0.0001, a.currentTime, 0.6);
      setTimeout(() => old.disconnect(), 3000);
    }
    this.bus = a.createGain();
    this.bus.gain.setValueAtTime(0.0001, a.currentTime);
    this.bus.gain.setTargetAtTime(1, a.currentTime + 0.3, 0.5);
    this.bus.connect(musicOut());
    this.mood = mood;
    this.stepIndex = 0;
    this.bar = 0;
    this.nextTime = a.currentTime + 0.15;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 60);
    this.schedule();
  },

  stop() {
    this.wanted = null;
    clearInterval(this.timer);
    this.timer = null;
    this.mood = null;
    const a = audioCtx();
    if (this.bus && a) {
      const b = this.bus;
      b.gain.setTargetAtTime(0.0001, a.currentTime, 0.4);
      setTimeout(() => b.disconnect(), 2500);
    }
    this.bus = null;
  },

  /** Riprende l'atmosfera chiesta prima che il browser sbloccasse l'audio. */
  resume() { if (this.wanted) this.play(this.wanted, this.level); },

  schedule() {
    const a = audioCtx();
    const m = MOODS[this.mood];
    if (!a || !m || !this.bus) return;
    const bpm = m.bpm + (this.mood === 'suspense' ? this.level * 9 : 0);
    const sd = 60 / bpm / 4;
    while (this.nextTime < a.currentTime + 0.3) {
      const s = this.stepIndex % 16;
      const chord = m.bars[this.bar % m.bars.length];
      const next = m.bars[(this.bar + 1) % m.bars.length];
      const swing = m.swing && s % 2 === 1 ? sd * m.swing : 0;
      try { m.step(a, this.bus, s, this.nextTime + swing, chord, next, sd, () => this.rnd(), this.level); } catch { /* una nota persa non ferma la musica */ }
      this.nextTime += sd;
      this.stepIndex++;
      if (this.stepIndex % 16 === 0) this.bar++;
    }
  }
};

window.addEventListener('gnr-audio', () => Music.resume());
window.addEventListener('gnr-mute', (e) => { if (e.detail) Music.stop(); });
document.addEventListener('visibilitychange', () => {
  // In una scheda nascosta i timer rallentano: meglio fermarsi e ripartire.
  if (document.hidden && Music.playing()) { Music.hiddenMood = Music.mood; Music.stop(); } else if (!document.hidden && Music.hiddenMood) { const md = Music.hiddenMood; Music.hiddenMood = null; Music.play(md, Music.level); }
});
