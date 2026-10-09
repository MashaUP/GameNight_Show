// Effetti speciali su canvas: coriandoli con un po' di fisica e fuochi d'artificio.
// Un solo canvas a tutto schermo, creato quando serve e tolto quando non c'è più niente da disegnare.
// Con Safe Mode, "Meno animazioni" o risparmio energetico non parte niente.
import { isSafeMode } from './safe.js';

const COLORS = ['#FF5A4E', '#FFC93C', '#2EC4B6', '#7B5CFA', '#FF8FB1', '#4D96FF', '#FF8A3D', '#FF3DCB', '#FFD34D', '#8AC926'];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

export function fxAllowed() {
  if (typeof window === 'undefined' || isSafeMode()) return false;
  const c = document.documentElement.classList;
  if (c.contains('a11y-motion') || c.contains('save-power')) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const F = { canvas: null, ctx: null, parts: [], rockets: [], raf: null, last: 0, dpr: 1 };

function ensure() {
  if (F.canvas) return true;
  const cv = document.createElement('canvas');
  cv.className = 'fx-layer';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  F.canvas = cv;
  F.ctx = cv.getContext('2d');
  if (!F.ctx) { cv.remove(); F.canvas = null; return false; }
  F.onResize = () => size();
  window.addEventListener('resize', F.onResize);
  size();
  return true;
}

function size() {
  if (!F.canvas) return;
  F.dpr = Math.min(window.devicePixelRatio || 1, 2);
  F.canvas.width = Math.round(window.innerWidth * F.dpr);
  F.canvas.height = Math.round(window.innerHeight * F.dpr);
  F.ctx.setTransform(F.dpr, 0, 0, F.dpr, 0, 0);
}

function stop() {
  cancelAnimationFrame(F.raf);
  F.raf = null;
  window.removeEventListener('resize', F.onResize);
  F.canvas?.remove();
  F.canvas = null;
  F.ctx = null;
  F.parts = [];
  F.rockets = [];
}

function run() {
  if (F.raf) return;
  F.last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - F.last) / 1000);
    F.last = now;
    step(dt);
    if (!F.parts.length && !F.rockets.length) { stop(); return; }
    F.raf = requestAnimationFrame(frame);
  };
  F.raf = requestAnimationFrame(frame);
}

function step(dt) {
  const c = F.ctx;
  const w = window.innerWidth, h = window.innerHeight;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  // Razzi che salgono
  for (const r of F.rockets) {
    r.t += dt;
    if (r.t < 0) continue;
    r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 260 * dt;
    r.trail.push([r.x, r.y]);
    if (r.trail.length > 10) r.trail.shift();
    if (r.vy >= -40 || r.y <= r.ty) { explode(r); r.dead = true; }
  }
  F.rockets = F.rockets.filter((r) => !r.dead);
  c.globalCompositeOperation = 'lighter';
  for (const r of F.rockets) {
    if (r.t < 0) continue;
    c.strokeStyle = 'rgba(255, 220, 160, 0.8)';
    c.lineWidth = 2.4;
    c.beginPath();
    r.trail.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
  // Scintille dei fuochi (luce che si somma) e coriandoli (carta)
  for (const p of F.parts) {
    p.life -= dt;
    if (p.kind === 'spark') {
      p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.6 * dt; p.vy += 120 * dt;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, p.life / p.max);
      c.strokeStyle = p.color;
      c.globalAlpha = a * (p.flicker ? (0.5 + Math.random() * 0.5) : 1);
      c.lineWidth = p.r;
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
    }
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  for (const p of F.parts) {
    if (p.kind !== 'paper') continue;
    p.t += dt;
    if (p.t < 0) { p.life += dt; continue; }
    p.vx *= 1 - 0.9 * dt; p.vy = Math.min(p.vy + 520 * dt, p.term);
    p.vy *= 1 - 0.4 * dt;
    p.x += (p.vx + Math.sin(p.t * p.wf + p.ph) * p.wob) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.tilt += p.vt * dt;
    const a = Math.min(1, p.life / 0.6);
    c.save();
    c.globalAlpha = a;
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.scale(1, Math.cos(p.tilt));
    c.fillStyle = Math.cos(p.tilt) > 0 ? p.color : p.shade;
    if (p.shape === 'circle') { c.beginPath(); c.arc(0, 0, p.w * 0.5, 0, Math.PI * 2); c.fill(); }
    else if (p.shape === 'ribbon') { c.fillRect(-p.w * 0.2, -p.h, p.w * 0.4, p.h * 2); }
    else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    c.restore();
  }
  F.parts = F.parts.filter((p) => p.life > 0 && p.y < h + 60);
}

function shadeOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.68;
  return `rgb(${Math.round(((n >> 16) & 255) * k)}, ${Math.round(((n >> 8) & 255) * k)}, ${Math.round((n & 255) * k)})`;
}

function paper(x, y, vx, vy, delay = 0, colors = COLORS) {
  const color = pick(colors);
  return {
    kind: 'paper', x, y, vx, vy, t: -delay, life: rand(3.2, 5) + delay,
    w: rand(8, 14), h: rand(5, 9), shape: pick(['rect', 'rect', 'rect', 'circle', 'ribbon']),
    rot: rand(0, 6.3), vr: rand(-6, 6), tilt: rand(0, 6.3), vt: rand(4, 11),
    wob: rand(20, 70), wf: rand(2, 5), ph: rand(0, 6.3), term: rand(130, 260),
    color, shade: shadeOf(color)
  };
}

/**
 * Coriandoli. mode: 'cannons' (due cannoni dal basso, il default), 'rain' (dall'alto),
 * oppure { x, y } in pixel per un'esplosione in un punto (es. sopra il vincitore).
 */
export function confettiBurst(count = 140, mode = 'cannons', colors = COLORS) {
  if (!fxAllowed() || !ensure()) return;
  const w = window.innerWidth, h = window.innerHeight;
  const n = Math.min(document.documentElement.classList.contains('lite') ? Math.round(count * 0.35) : count, 320);
  for (let i = 0; i < n; i++) {
    if (mode === 'rain') {
      F.parts.push(paper(rand(0, w), rand(-80, -10), rand(-40, 40), rand(40, 160), rand(0, 1.2), colors));
    } else if (typeof mode === 'object') {
      const ang = rand(0, Math.PI * 2), sp = rand(200, 620);
      F.parts.push(paper(mode.x, mode.y, Math.cos(ang) * sp, Math.sin(ang) * sp - 260, rand(0, 0.08), colors));
    } else {
      const left = i % 2 === 0;
      const ang = -rand(Math.PI * 0.28, Math.PI * 0.42);
      const sp = rand(h * 0.75, h * 1.2);
      const dir = left ? 1 : -1;
      F.parts.push(paper(left ? -10 : w + 10, h * 0.92, dir * Math.cos(ang) * sp * 0.75, Math.sin(ang) * sp, rand(0, 0.35), colors));
    }
  }
  run();
}

function explode(r) {
  const n = r.big ? 110 : 70;
  const palette = r.colors;
  const ring = Math.random() < 0.35;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
    const sp = ring ? r.power : r.power * Math.sqrt(Math.random());
    const life = rand(1.1, 1.9);
    F.parts.push({ kind: 'spark', x: r.x, y: r.y, px: r.x, py: r.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life, max: life, r: rand(1.6, 3), color: pick(palette), flicker: Math.random() < 0.4 });
  }
  // Lampo al centro
  F.parts.push({ kind: 'spark', x: r.x, y: r.y, px: r.x - 0.1, py: r.y, vx: 0, vy: 0, life: 0.18, max: 0.18, r: 26, color: 'rgba(255, 245, 220, 0.9)' });
}

/** Fuochi d'artificio: qualche razzo che sale ed esplode, distribuiti nel tempo. */
export function fireworks(shots = 6, spread = 2.4) {
  if (!fxAllowed() || !ensure()) return;
  if (document.documentElement.classList.contains('lite')) shots = Math.min(shots, 2);
  const w = window.innerWidth, h = window.innerHeight;
  const palettes = [['#FFD34D', '#FF8A3D', '#FFF2B3'], ['#FF3DCB', '#B78CFF', '#FFFFFF'], ['#2EC4B6', '#9BF6FF', '#FFFFFF'], ['#FF5A4E', '#FFC93C', '#FFFFFF'], ['#8AC926', '#FFD34D', '#E8FFB5']];
  for (let i = 0; i < shots; i++) {
    const x = rand(w * 0.12, w * 0.88);
    const ty = rand(h * 0.12, h * 0.42);
    F.rockets.push({ x, y: h + 10, vx: rand(-40, 40), vy: -Math.sqrt(2 * 260 * (h - ty)) * 1.02, ty, t: -(i / Math.max(1, shots - 1)) * spread - rand(0, 0.2), trail: [], colors: pick(palettes), power: rand(h * 0.2, h * 0.32), big: i === shots - 1 });
  }
  run();
}

/** Usato dai test: quante particelle ci sono in volo. */
export function fxCount() {
  return F.parts.length + F.rockets.length;
}
