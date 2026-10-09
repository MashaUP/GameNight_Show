// Video riassunto della serata: una storia verticale (1080×1920) disegnata su canvas
// e registrata con MediaRecorder. Niente server: il file si crea nel browser della TV.
import { avatarUri } from './avatars.js';
import { fmt, safeColor } from './util.js';

const W = 1080;
const H = 1920;
const FPS = 30;
const DISPLAY = '"Lilita One", "Nunito", sans-serif';
const NUM = '"Bungee", "Lilita One", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const NEON = ['#FF8A3D', '#FF3DCB', '#FFD34D', '#3DF5E0', '#9B7BFF'];

export function videoSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

function mime() {
  const list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  return list.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

function loadImg(src) {
  if (!src || !/^data:image\//.test(src)) return Promise.resolve(null);
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}
const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const pop = (t) => { const x = Math.min(1, Math.max(0, t)); return 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; };

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function fitText(c, t, max) {
  let s = String(t || '');
  while (c.measureText(s).width > max && s.length > 2) s = s.slice(0, -1);
  return s === String(t || '') ? s : `${s.trimEnd()}…`;
}
function text3d(c, t, x, y, size, color = '#FFF3E0', depth = '#B0266A') {
  c.font = `${size}px ${DISPLAY}`;
  c.textAlign = 'center';
  for (let i = 6; i >= 1; i--) { c.fillStyle = depth; c.fillText(t, x, y + i * size * 0.012); }
  c.fillStyle = color;
  c.fillText(t, x, y);
}

/**
 * Costruisce le scene. data: { group, subtitle, number, games: [{name, avg, image}], champs: [{name, points, player}],
 * awards: [{title, who}], photos: [dataUrl], players }
 */
async function scenes(data) {
  const avatars = new Map();
  for (const ch of data.champs) {
    const p = ch.player || {};
    const src = (typeof p.photo === 'string' && p.photo.startsWith('data:image/')) ? p.photo : avatarUri(p.style, p.seed, p.opts);
    avatars.set(ch.name, await loadImg(src));
  }
  const photos = (await Promise.all((data.photos || []).slice(0, 4).map(loadImg))).filter(Boolean);
  const gameImgs = await Promise.all(data.games.map((g) => loadImg(g.image)));
  const list = [];
  // 1. Titolo
  list.push({ d: 2.6, draw(c, t) {
    const k = ease(t / 0.8);
    c.globalAlpha = k;
    text3d(c, 'GAME NIGHT', W / 2, 700 - (1 - k) * 80, 150, '#FFE27A', '#9C6300');
    if (data.number) text3d(c, `#${data.number}`, W / 2, 870, 130, '#FFF3E0');
    c.font = `56px ${DISPLAY}`; c.fillStyle = '#C2B5F2';
    c.fillText(fitText(c, data.group, W - 160), W / 2, 1010);
    c.font = `600 44px ${BODY}`; c.fillText(data.subtitle || '', W / 2, 1080);
    c.globalAlpha = 1;
  } });
  // 2. I giochi, dal quinto al primo
  const games = data.games.slice(0, 5);
  games.slice().reverse().forEach((g, idx) => {
    const rank = games.length - idx;
    const img = gameImgs[rank - 1];
    list.push({ d: rank === 1 ? 2.6 : 1.7, draw(c, t) {
      const k = pop(t / 0.5);
      c.save();
      c.translate(W / 2, 900);
      c.scale(k, k);
      c.fillStyle = rank === 1 ? '#FFD34D' : '#251A52';
      rr(c, -420, -420, 840, 760, 48); c.fill();
      c.lineWidth = 12; c.strokeStyle = '#06030F'; c.stroke();
      c.textAlign = 'center';
      c.fillStyle = rank === 1 ? '#1F1A3D' : '#FFD34D';
      c.font = `120px ${NUM}`; c.fillText(`${rank}°`, 0, -260);
      if (img) { c.save(); rr(c, -150, -230, 300, 300, 28); c.clip(); c.drawImage(img, -150, -230, 300, 300); c.restore(); }
      c.fillStyle = rank === 1 ? '#1F1A3D' : '#FFF3E0';
      c.font = `76px ${DISPLAY}`; c.fillText(fitText(c, g.name, 760), 0, img ? 160 : -40);
      const shown = Math.min(g.avg, g.avg * ease((t - 0.3) / 0.9));
      c.font = `110px ${NUM}`; c.fillText(fmt(Math.max(0, shown)), 0, img ? 290 : 130);
      c.restore();
    } });
  });
  // 3. Campioni della serata
  if (data.champs.length) {
    list.push({ d: 3.4, draw(c, t) {
      text3d(c, 'CAMPIONI', W / 2, 360, 120, '#FFE27A', '#9C6300');
      const order = [1, 0, 2];
      const xs = [W / 2 - 330, W / 2, W / 2 + 330];
      order.forEach((i, col) => {
        const ch = data.champs[i];
        if (!ch) return;
        const x = xs[col];
        const h = [700, 520, 400][i];
        const k = ease((t - (2 - i) * 0.35) / 0.6);
        const top = 1650 - h;
        c.fillStyle = ['#FFD34D', '#C9D3F0', '#F2A979'][i];
        rr(c, x - 150, top + (1 - k) * h, 300, h, 20); c.fill();
        c.lineWidth = 10; c.strokeStyle = '#06030F'; c.stroke();
        c.fillStyle = '#1F1A3D'; c.font = `110px ${NUM}`; c.textAlign = 'center';
        if (k > 0.5) c.fillText(String(i + 1), x, top + 150);
        if (k > 0.2) {
          const img = avatars.get(ch.name);
          const ay = top - 150 - Math.abs(Math.sin(t * 6 + i)) * 20 * (t < 2.4 ? 1 : 0);
          c.save(); c.beginPath(); c.arc(x, ay, 110, 0, Math.PI * 2);
          c.fillStyle = safeColor(ch.player?.color); c.fill(); c.lineWidth = 10; c.strokeStyle = '#06030F'; c.stroke(); c.clip();
          if (img) c.drawImage(img, x - 110, ay - 110, 220, 220);
          c.restore();
          c.fillStyle = '#FFF3E0'; c.font = `56px ${DISPLAY}`; c.fillText(fitText(c, ch.name, 300), x, ay + 175);
          c.font = `40px ${NUM}`; c.fillStyle = '#FFD34D'; c.fillText(`${ch.points} PT`, x, ay + 225);
          if (i === 0) { c.font = '150px serif'; c.fillText('🏆', x, ay - 140); }
        }
      });
    } });
  }
  // 4. Premi speciali
  if (data.awards.length) {
    const aw = data.awards.slice(0, 5);
    list.push({ d: 3, draw(c, t) {
      text3d(c, 'PREMI SPECIALI', W / 2, 330, 96, '#FFF3E0');
      aw.forEach((a, i) => {
        const k = ease((t - i * 0.3) / 0.5);
        const y = 480 + i * 250;
        c.globalAlpha = k;
        c.fillStyle = NEON[i % NEON.length];
        rr(c, 120 + (1 - k) * 200, y, W - 240, 200, 36); c.fill();
        c.lineWidth = 8; c.strokeStyle = '#06030F'; c.stroke();
        c.fillStyle = '#1F1A3D'; c.textAlign = 'center';
        c.font = `800 40px ${BODY}`; c.fillText(fitText(c, a.title, W - 320), W / 2, y + 75);
        c.font = `64px ${DISPLAY}`; c.fillText(fitText(c, a.who, W - 320), W / 2, y + 155);
        c.globalAlpha = 1;
      });
    } });
  }
  // 5. Foto
  photos.forEach((img, i) => {
    list.push({ d: 1.6, draw(c, t) {
      const k = ease(t / 0.4);
      const s = Math.min((W - 160) / img.width, 1300 / img.height);
      const w = img.width * s, h = img.height * s;
      c.save(); c.translate(W / 2, 960); c.rotate((i % 2 ? 1 : -1) * 0.05 * k); c.globalAlpha = k;
      c.fillStyle = '#FFFFFF'; c.fillRect(-w / 2 - 24, -h / 2 - 24, w + 48, h + 120);
      c.drawImage(img, -w / 2, -h / 2, w, h);
      c.fillStyle = '#1F1A3D'; c.font = `48px ${DISPLAY}`; c.textAlign = 'center'; c.fillText('📸 Album della serata', 0, h / 2 + 75);
      c.restore();
    } });
  });
  // 6. Chiusura
  list.push({ d: 2.2, draw(c, t) {
    const k = ease(t / 0.6);
    c.globalAlpha = k;
    text3d(c, 'ALLA PROSSIMA!', W / 2, 900, 110, '#FFE27A', '#9C6300');
    c.font = `600 46px ${BODY}`; c.fillStyle = '#C2B5F2'; c.textAlign = 'center';
    c.fillText('GameNight Show', W / 2, 1010);
    c.globalAlpha = 1;
  } });
  return list;
}

function background(c, t, conf) {
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1B0E3C'); g.addColorStop(0.55, '#0F1232'); g.addColorStop(1, '#0A201F');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // Fari
  [[0.2, 'rgba(255,61,203,0.16)'], [0.8, 'rgba(61,245,224,0.14)']].forEach(([x0, col], i) => {
    c.save(); c.translate(W * x0, -40); c.rotate(Math.sin(t * 0.7 + i * 2) * 0.3);
    c.fillStyle = col; c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.lineTo(260, H * 1.2); c.lineTo(-260, H * 1.2); c.closePath(); c.fill(); c.restore();
  });
  // Coriandoli
  for (const p of conf) {
    const y = (p.y + t * p.v) % (H + 40) - 20;
    c.save(); c.translate(p.x + Math.sin(t * 2 + p.ph) * 30, y); c.rotate(t * p.r);
    c.fillStyle = p.c; c.globalAlpha = 0.85; c.fillRect(-8, -5, 16, 10); c.restore();
  }
  c.globalAlpha = 1;
}

/** Registra il video; onProgress(0..1). Restituisce { blob, type, seconds }. */
export async function makeRecapVideo(data, onProgress = () => {}) {
  if (!videoSupported()) throw new Error('Questo browser non sa registrare video (serve Chrome, Edge o Firefox recenti).');
  try { await document.fonts?.load?.('80px "Lilita One"'); await document.fonts?.load?.('60px "Bungee"'); } catch { /* niente */ }
  const list = await scenes(data);
  const total = list.reduce((a, s) => a + s.d, 0);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const conf = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 120 + Math.random() * 220, r: Math.random() * 4 - 2, ph: Math.random() * 6, c: NEON[Math.floor(Math.random() * NEON.length)] }));
  const stream = cv.captureStream(FPS);
  const type = mime();
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  const draw = (sec) => {
    let acc = 0;
    let scene = list[list.length - 1];
    let local = scene.d;
    for (const s of list) { if (sec < acc + s.d) { scene = s; local = sec - acc; break; } acc += s.d; }
    background(c, sec, conf);
    c.save();
    // dissolvenza tra le scene
    const fade = Math.min(1, local / 0.25, (scene.d - local) / 0.25);
    c.globalAlpha = Math.max(0, fade);
    scene.draw(c, local);
    c.restore();
  };
  draw(0);
  rec.start(500);
  const start = performance.now();
  await new Promise((resolve) => {
    // Un fotogramma ogni 1/30 di secondo (setInterval: continua anche se la scheda va in secondo piano)
    const id = setInterval(() => {
      const sec = (performance.now() - start) / 1000;
      draw(Math.min(sec, total));
      onProgress(Math.min(1, sec / total));
      if (sec >= total) { clearInterval(id); resolve(); }
    }, 1000 / FPS);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  const blob = new Blob(chunks, { type: (type || 'video/webm').split(';')[0] });
  return { blob, type: blob.type, seconds: Math.round(total) };
}
