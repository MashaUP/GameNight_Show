// Suono d'ambiente delle atmosfere (1.10), generato dal browser: niente file da scaricare.
//
// pioggia: fruscio filtrato e qualche goccia · candele: crepitio leggero · neon: ronzio basso ·
// stelle: accordo lento e morbido · nebbia: vento. Festa e palcoscenico hanno già la musica.
// Facoltativo (spento di base), segue il volume della musica, il silenzioso e la Safe Mode, e si
// abbassa quando la musica suona. Usa pochi nodi audio e un solo timer per gli eventi brevi.
import { musicOut, isMuted } from './sounds.js';
import { isSafeMode } from './safe.js';

export const SOUND_SCENES = ['pioggia', 'candele', 'neon', 'stelle', 'nebbia'];

let ctx = null;
let out = null;
let nodes = [];
let timer = null;
let current = '';

function noiseBuffer(c, seconds = 2, brown = false) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

function loopNoise(c, { brown = false, type = 'bandpass', freq = 1000, q = 0.7, gain = 0.05 }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 2, brown);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start();
  nodes.push(src, f, g);
  return g;
}

function lfo(c, target, { rate = 0.1, depth = 0.02 }) {
  const o = c.createOscillator();
  o.frequency.value = rate;
  const g = c.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  nodes.push(o, g);
}

function tone(c, freq, gain, type = 'sine') {
  const o = c.createOscillator();
  o.type = type; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  o.connect(g).connect(out);
  o.start();
  nodes.push(o, g);
  return g;
}

/** Evento breve (goccia, crepitio) con l'inviluppo giusto. */
function blip(kind) {
  if (!ctx || !out) return;
  const t = ctx.currentTime;
  if (kind === 'drop') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(900 + Math.random() * 900, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.15);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02 + Math.random() * 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }
}

function build(scene) {
  if (scene === 'pioggia') {
    loopNoise(ctx, { type: 'bandpass', freq: 1100, q: 0.5, gain: 0.06 });
    loopNoise(ctx, { brown: true, type: 'lowpass', freq: 400, gain: 0.05 });
    return { blip: 'drop', min: 250, max: 1400 };
  }
  if (scene === 'candele') {
    loopNoise(ctx, { brown: true, type: 'lowpass', freq: 300, gain: 0.04 });
    return { blip: 'crackle', min: 120, max: 900 };
  }
  if (scene === 'neon') {
    const g = tone(ctx, 100, 0.012, 'sawtooth');
    tone(ctx, 200, 0.006);
    lfo(ctx, g.gain, { rate: 0.3, depth: 0.004 });
    return null;
  }
  if (scene === 'stelle') {
    for (const [f, gn] of [[220, 0.012], [277.18, 0.009], [329.63, 0.008]]) {
      const g = tone(ctx, f, gn);
      lfo(ctx, g.gain, { rate: 0.05 + Math.random() * 0.05, depth: gn * 0.6 });
    }
    return null;
  }
  if (scene === 'nebbia') {
    const g = loopNoise(ctx, { brown: true, type: 'bandpass', freq: 500, q: 0.4, gain: 0.07 });
    lfo(ctx, g.gain, { rate: 0.07, depth: 0.04 });
    return null;
  }
  return null;
}

function scheduleBlips(cfg) {
  if (!cfg) return;
  const next = () => {
    timer = setTimeout(() => { blip(cfg.blip); next(); }, cfg.min + Math.random() * (cfg.max - cfg.min));
  };
  next();
}

export const AtmoSound = {
  /** Accende il suono della scena (o lo spegne con on=false o una scena senza suono). level: 0–1. */
  set(scene, on, level = 0.7) {
    const want = on && SOUND_SCENES.includes(scene) && !isMuted() && !isSafeMode() ? scene : '';
    if (want === current) { this.level(level); return; }
    this.stop();
    if (!want) return;
    const bus = musicOut();
    if (!bus) return;
    ctx = bus.context;
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(bus);
    current = want;
    scheduleBlips(build(want));
    out.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
  },
  level(v) { if (out && ctx) out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.4); },
  stop() {
    clearTimeout(timer); timer = null;
    for (const n of nodes) { try { n.stop?.(); } catch { /* niente */ } try { n.disconnect(); } catch { /* niente */ } }
    nodes = [];
    try { out?.disconnect(); } catch { /* niente */ }
    out = null; current = '';
  },
  playing() { return current; }
};
