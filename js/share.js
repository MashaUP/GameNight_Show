// Immagine della classifica da condividere (PNG disegnato su canvas).
import { fmt, saveInApp } from './util.js';
import { isApp } from './native.js';

const C = {
  cream: '#FFF4DE', paper: '#FFFFFF', ink: '#1F1A3D', soft: '#4A4468',
  sun: '#FFC93C', teal: '#2EC4B6', pink: '#FF8FB1', tomato: '#FF5A4E', violet: '#7B5CFA'
};
const DISPLAY = '"Lilita One", "Nunito", "Arial Rounded MT Bold", sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const W = 1080;
const PAD = 64;

/** Carica solo immagini incorporate (data:), così il canvas resta esportabile. */
function loadImg(src) {
  if (!src || !/^data:image\//.test(src)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Riquadro pop: ombra piena, riempimento e bordo spesso. */
function box(ctx, x, y, w, h, r, fill, shadow = 8, line = 5) {
  if (shadow) {
    ctx.fillStyle = C.ink;
    rr(ctx, x + shadow, y + shadow, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

function fit(ctx, text, maxW) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** Rettangolo con solo gli angoli in alto arrotondati (base del podio). */
function rrTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function namesList(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

/** Foto del gioco ritagliata a riempire il riquadro, oppure segnaposto a righe con le iniziali. */
function gameTile(ctx, img, name, x, y, s) {
  box(ctx, x, y, s, s, 26, C.paper, 8, 5);
  ctx.save();
  rr(ctx, x + 2.5, y + 2.5, s - 5, s - 5, 24);
  ctx.clip();
  if (img) {
    const scale = Math.max(s / img.naturalWidth, s / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    ctx.drawImage(img, x + (s - w) / 2, y + (s - h) / 2, w, h);
  } else {
    ctx.fillStyle = 'rgba(123, 92, 250, 0.16)';
    for (let i = -s; i < s * 2; i += 36) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + s);
      ctx.lineTo(x + i + 18, y + s);
      ctx.lineTo(x + i + 18 + s, y);
      ctx.lineTo(x + i + s, y);
      ctx.fill();
    }
    ctx.font = `${Math.round(s * 0.3)}px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), x + s / 2, y + s / 2 + 4);
  }
  ctx.restore();
  rr(ctx, x, y, s, s, 26);
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
}

function chip(ctx, text, cx, cy, font, fill, padX = 22, h = 54) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  box(ctx, cx - w / 2, cy - h / 2, w, h, h / 2, fill, 4, 4);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 2);
}

async function fontsReady() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`400 60px ${DISPLAY}`),
      document.fonts.load(`900 30px ${BODY}`),
      document.fonts.load(`800 24px ${BODY}`)
    ]);
  } catch { /* si usano i font di riserva */ }
}

/**
 * Disegna la classifica della serata.
 * board: righe di buildBoard; awards: premi di buildAwards.
 */
export async function renderShareImage({ title, subtitle, board, awards }) {
  await fontsReady();
  const top3 = board.slice(0, 3);
  const rest = board.slice(3, 8);
  const extra = Math.max(0, board.length - 8);
  const imgs = await Promise.all(top3.map((r) => loadImg(r.image)));

  const podiumTop = 250;
  const ground = podiumTop + 600;
  const listTop = ground + 50;
  const listH = rest.length ? rest.length * 78 + (extra ? 46 : 0) : 0;
  const awardsTop = listTop + listH + (rest.length ? 40 : 0);
  const awardRows = Math.ceil(awards.length / 2);
  const awardsH = awards.length ? 70 + awardRows * 112 : 0;
  const H = Math.max(1350, awardsTop + awardsH + 90);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Sfondo crema con puntini
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(31, 26, 61, 0.10)';
  for (let y = 18; y < H; y += 36) {
    for (let x = 18; x < W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Testata
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = `86px ${DISPLAY}`;
  ctx.fillText('GameNight', PAD, 132);
  const logoW = ctx.measureText('GameNight').width;
  ctx.save();
  ctx.translate(PAD + logoW + 92, 100);
  ctx.rotate(-4 * Math.PI / 180);
  ctx.font = `56px ${DISPLAY}`;
  const tagW = ctx.measureText('Show').width + 40;
  box(ctx, -tagW / 2, -38, tagW, 76, 16, C.sun, 5, 5);
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Show', 0, 3);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = `900 38px ${BODY}`;
  ctx.fillText(fit(ctx, title, W - PAD * 2), PAD, 196);
  ctx.fillStyle = C.soft;
  ctx.font = `800 28px ${BODY}`;
  ctx.fillText(fit(ctx, subtitle, W - PAD * 2), PAD, 236);

  // Podio: secondo, primo, terzo
  const colW = 300, gap = 30;
  const startX = (W - (colW * 3 + gap * 2)) / 2;
  const cols = [
    { idx: 1, base: 130, size: 220, fill: C.teal },
    { idx: 0, base: 180, size: 250, fill: C.sun },
    { idx: 2, base: 95, size: 200, fill: C.pink }
  ];
  cols.forEach((c, i) => {
    const r = top3[c.idx];
    const x = startX + i * (colW + gap);
    const baseTop = ground - c.base;
    // Base del podio
    ctx.fillStyle = c.fill;
    rrTop(ctx, x, baseTop, colW, c.base, 22);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = `86px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(r ? r.rank : c.idx + 1), x + colW / 2, baseTop + c.base / 2 + 6);
    if (!r) return;
    chip(ctx, fmt(r.stats.avg), x + colW / 2, baseTop - 42, `46px ${DISPLAY}`, C.paper);
    ctx.font = `40px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fit(ctx, r.name, colW - 8), x + colW / 2, baseTop - 92);
    gameTile(ctx, imgs[c.idx], r.name, x + (colW - c.size) / 2, baseTop - 132 - c.size, c.size);
  });
  // Pavimento
  ctx.fillStyle = C.ink;
  ctx.fillRect(startX - 30, ground, colW * 3 + gap * 2 + 60, 8);

  // Resto della classifica
  rest.forEach((r, i) => {
    const y = listTop + i * 78;
    box(ctx, PAD, y, W - PAD * 2, 64, 18, C.paper, 5, 4);
    ctx.fillStyle = C.ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `36px ${DISPLAY}`;
    ctx.fillText(String(r.rank), PAD + 44, y + 34);
    ctx.textAlign = 'right';
    ctx.font = `38px ${DISPLAY}`;
    ctx.fillText(fmt(r.stats.avg), W - PAD - 28, y + 34);
    ctx.textAlign = 'left';
    ctx.font = `34px ${DISPLAY}`;
    ctx.fillText(fit(ctx, r.name, W - PAD * 2 - 260), PAD + 92, y + 34);
  });
  if (extra) {
    ctx.fillStyle = C.soft;
    ctx.font = `800 26px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`e altri ${extra} ${extra === 1 ? 'gioco' : 'giochi'}`, W / 2, listTop + rest.length * 78 + 30);
  }

  // Premi speciali, su due colonne
  if (awards.length) {
    ctx.fillStyle = C.ink;
    ctx.font = `52px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Premi speciali', PAD, awardsTop + 46);
    const cw = (W - PAD * 2 - 24) / 2;
    awards.forEach((a, i) => {
      const x = PAD + (i % 2) * (cw + 24);
      const y = awardsTop + 70 + Math.floor(i / 2) * 112;
      box(ctx, x, y, cw, 94, 20, C.paper, 5, 4);
      ctx.fillStyle = a.color || C.sun;
      ctx.beginPath();
      ctx.arc(x + 38, y + 47, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      const who = a.game ? a.game.name : namesList((a.players || []).map((p) => p.name));
      ctx.textAlign = 'left';
      ctx.fillStyle = C.soft;
      ctx.font = `800 22px ${BODY}`;
      ctx.fillText(fit(ctx, a.title, cw - 90), x + 70, y + 36);
      ctx.fillStyle = C.ink;
      ctx.font = `32px ${DISPLAY}`;
      ctx.fillText(fit(ctx, who, cw - 90), x + 70, y + 74);
    });
  }

  ctx.fillStyle = C.soft;
  ctx.font = `800 22px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Fatto con GameNight Show', W / 2, H - 34);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Immagine non creata'))), 'image/png');
  });
}

/** Fondo crema con puntini. */
function dots(ctx, w, h) {
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(31, 26, 61, 0.10)';
  for (let y = 18; y < h; y += 36) for (let x = 18; x < w; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
}

/** Testo su più righe centrato, al massimo `lines` righe. */
function wrapCenter(ctx, text, cx, y, maxW, lh, lines = 2) {
  const words = String(text || '').split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  const shown = out.slice(0, lines);
  if (out.length > lines) shown[lines - 1] = fit(ctx, `${shown[lines - 1]} ${out.slice(lines).join(' ')}`, maxW);
  shown.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
  return shown.length;
}

/**
 * Storia verticale (1080×1920) per Instagram e WhatsApp: gioco della serata, podio, MVP e vincitore.
 * opts: { title, subtitle, number, board, mvp: [nomi], winners: [nomi], facts, color, emblem }
 */
export async function renderStoryImage({ title, subtitle, number, board, mvp = [], winners = [], facts = '', color = C.sun, emblem = '', awards = [] }) {
  await fontsReady();
  const SW = 1080, SH = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = SW;
  canvas.height = SH;
  const ctx = canvas.getContext('2d');
  dots(ctx, SW, SH);
  // Fascia in alto nel colore del gruppo
  ctx.fillStyle = /^#[0-9A-Fa-f]{6}$/.test(color || '') ? color : C.sun;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(SW, 0); ctx.lineTo(SW, 360); ctx.lineTo(0, 440); ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(0, 440); ctx.lineTo(SW, 360); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = `92px ${DISPLAY}`;
  ctx.fillText('GameNight Show', SW / 2, 150);
  ctx.font = `900 46px ${BODY}`;
  ctx.fillText(fit(ctx, `${emblem ? `${emblem} ` : ''}${title || 'La nostra serata'}`, SW - 140), SW / 2, 232);
  ctx.font = `800 34px ${BODY}`;
  ctx.fillStyle = C.soft;
  ctx.fillText(fit(ctx, subtitle || '', SW - 140), SW / 2, 284);
  if (number) chip(ctx, `GAME NIGHT #${number}`, SW / 2, 352, `44px ${DISPLAY}`, C.paper, 30, 70);

  const top = board[0];
  let y = 560;
  if (top) {
    ctx.fillStyle = C.ink;
    ctx.font = `58px ${DISPLAY}`;
    ctx.fillText('Il gioco della serata', SW / 2, 540);
    const img = await loadImg(top.image);
    gameTile(ctx, img, top.name, (SW - 480) / 2, 580, 480);
    ctx.fillStyle = C.ink;
    ctx.font = `76px ${DISPLAY}`;
    const lines = wrapCenter(ctx, top.name, SW / 2, 1150, SW - 160, 78, 2);
    chip(ctx, `⭐ ${fmt(top.stats.avg)}`, SW / 2, 1150 + (lines - 1) * 78 + 82, `60px ${DISPLAY}`, C.sun, 34, 92);
    y = 1150 + (lines - 1) * 78 + 160;
  }
  // Secondo e terzo
  for (const r of board.slice(1, 3)) {
    box(ctx, 90, y, SW - 180, 92, 24, C.paper, 6, 5);
    ctx.fillStyle = C.ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `48px ${DISPLAY}`;
    ctx.fillText(String(r.rank), 150, y + 48);
    ctx.textAlign = 'right';
    ctx.fillText(fmt(r.stats.avg), SW - 130, y + 48);
    ctx.textAlign = 'left';
    ctx.font = `44px ${DISPLAY}`;
    ctx.fillText(fit(ctx, r.name, SW - 480), 210, y + 48);
    y += 116;
  }
  ctx.textBaseline = 'alphabetic';
  // MVP e vincitore
  const cardY = y + 24;
  const half = (SW - 180 - 30) / 2;
  [['👑 MVP della serata', mvp, C.tomato], ['🏆 Vincitore della serata', winners, C.teal]].forEach(([label, who, fill], i) => {
    const x = 90 + i * (half + 30);
    box(ctx, x, cardY, half, 150, 26, fill, 6, 5);
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.font = `900 30px ${BODY}`;
    ctx.fillText(fit(ctx, label, half - 30), x + half / 2, cardY + 52);
    ctx.font = `46px ${DISPLAY}`;
    ctx.fillText(fit(ctx, who.length ? namesList(who) : '—', half - 30), x + half / 2, cardY + 112);
  });
  ctx.fillStyle = C.soft;
  ctx.font = `900 32px ${BODY}`;
  ctx.textAlign = 'center';
  if (facts) ctx.fillText(fit(ctx, facts, SW - 160), SW / 2, cardY + 214);
  // Qualche premio speciale, se c'è spazio
  let ay = cardY + 254;
  for (const a of awards) {
    if (ay + 72 > SH - 84) break;
    box(ctx, 90, ay, SW - 180, 72, 20, C.paper, 5, 4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.soft;
    ctx.font = `900 26px ${BODY}`;
    const tw = Math.min(ctx.measureText(a.title).width, 380);
    ctx.fillText(fit(ctx, a.title, 380), 120, ay + 37);
    ctx.fillStyle = C.ink;
    ctx.font = `36px ${DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, a.who, SW - 180 - tw - 90), SW - 120, ay + 38);
    ay += 86;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = C.soft;
  ctx.font = `800 26px ${BODY}`;
  ctx.fillText('Fatto con GameNight Show', SW / 2, SH - 50);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Immagine non creata'))), 'image/png');
  });
}

/** Condivide l'immagine (WhatsApp, ecc.) dove il browser lo permette, altrimenti la scarica. */
export async function shareOrDownload(blob, filename, text, preferDownload = false) {
  if (isApp()) {
    // App Android: "Condividi" di sistema (WhatsApp, Instagram…) oppure Documenti/GameNight Show.
    const r = await saveInApp(blob, filename, { mode: preferDownload ? 'save' : 'share', text });
    return r === 'saved' ? 'saved' : r;
  }
  const file = new File([blob], filename, { type: 'image/png' });
  if (!preferDownload && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'GameNight Show', text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Data della serata in italiano, es. "sabato 10 ottobre 2026". */
export function nightDate(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
