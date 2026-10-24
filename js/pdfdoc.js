// PDF vero del resoconto della serata, generato nel dispositivo (1.10).
//
// Serve soprattutto all'app Android: lì non esiste la finestra di stampa del browser ("Salva come PDF"),
// quindi il file si costruisce qui, senza librerie esterne: un piccolo scrittore PDF (testo con i font
// standard Helvetica, linee, riquadri e foto JPEG) e l'impaginazione del resoconto in pagine A4.
// Il testo resta selezionabile e ricercabile. Le emoji non esistono nei font standard del PDF: si tolgono.
import { t } from './i18n.js';
import { fmt } from './util.js';

// ---------------------------------------------------------------------------
// Codifica del testo (WinAnsi) e larghezze dei caratteri Helvetica (millesimi di em)
// ---------------------------------------------------------------------------

const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
const REPLACE = { '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u00D7': 'x', '\u2605': '*', '\u2B50': '*', '\u2192': '->', '\u2190': '<-', '\u202F': ' ', '\u2009': ' ' };

/** Testo → codici WinAnsi (i caratteri che il PDF standard non ha vengono tolti). */
export function winAnsi(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    if (REPLACE[ch] && REPLACE[ch].length > 1) { for (const x of REPLACE[ch]) out.push(x.charCodeAt(0)); continue; }
    const c = REPLACE[ch] ?? ch;
    const code = c.codePointAt(0);
    if (code >= 0x20 && code <= 0x7E) out.push(code);
    else if (code >= 0xA0 && code <= 0xFF) out.push(code);
    else if (WIN[c]) out.push(WIN[c]);
    else if (code === 0x0A || code === 0x09) out.push(0x20);
    // emoji, simboli e alfabeti non latini: niente
  }
  // Spazi doppi lasciati dalle emoji tolte
  const res = [];
  for (const b of out) if (!(b === 0x20 && res[res.length - 1] === 0x20)) res.push(b);
  return res;
}
export const pdfText = (s) => String.fromCharCode(...winAnsi(s)).trim();

const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const BASE = 'AAAAAAACEEEEIIIIDNOOOOOxOUUUUYTsaaaaaaaceeeeiiiidnooooo/ouuuuyty'; // 0xC0–0xFF → lettera di base
const SPECIAL_W = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x99: 1000, 0xB0: 400, 0xA0: 278, 0xAB: 556, 0xBB: 556, 0xB7: 278 };

function charW(code, bold) {
  const tab = bold ? W_BOLD : W_REG;
  if (code >= 0x20 && code <= 0x7E) return tab[code - 32];
  if (SPECIAL_W[code]) return SPECIAL_W[code];
  if (code >= 0xC0) { const b = BASE.charCodeAt(code - 0xC0); return tab[b - 32] || 556; }
  return 556;
}
/** Larghezza di un testo in punti. */
export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const c of winAnsi(str)) w += charW(c, bold);
  return (w * size) / 1000;
}

/** Va a capo per stare in maxW punti (spezza anche le parole troppo lunghe). */
export function wrap(str, size, maxW, bold = false) {
  const words = pdfText(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const fits = (s) => textWidth(s, size, bold) <= maxW;
  for (let w of words) {
    while (!fits(w)) { // parola più lunga della riga
      let k = w.length - 1;
      while (k > 1 && !fits(w.slice(0, k))) k--;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, k));
      w = w.slice(k);
    }
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) cur = next; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ---------------------------------------------------------------------------
// Scrittore PDF minimo
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => n2(x / 255)).join(' ');
};
function pdfStr(str) {
  // Stringa letterale con i byte WinAnsi, con ( ) \ protetti.
  let s = '';
  for (const b of winAnsi(str)) {
    if (b === 0x28 || b === 0x29 || b === 0x5C) s += `\\${String.fromCharCode(b)}`;
    else if (b > 0x7E) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `(${s})`;
}

export class PdfDoc {
  constructor({ width = 595.28, height = 841.89 } = {}) {
    this.W = width;
    this.H = height;
    this.pages = [];
    this.images = [];
    this.page = null;
    this.addPage();
  }
  addPage() { this.page = { ops: [], imgs: new Set() }; this.pages.push(this.page); return this.page; }
  op(s) { this.page.ops.push(s); }
  /** y dall'alto, come nell'impaginazione. */
  text(str, x, y, { size = 10, bold = false, italic = false, color = '#1F1A3D' } = {}) {
    const f = bold ? 'F2' : italic ? 'F3' : 'F1';
    this.op(`BT /${f} ${n2(size)} Tf ${rgb(color)} rg ${n2(x)} ${n2(this.H - y)} Td ${pdfStr(str)} Tj ET`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, lw = 1, r = 0 } = {}) {
    let path;
    if (r > 0) {
      const k = 0.5523 * r;
      const X = x; const Y = this.H - y - h;
      path = [`${n2(X + r)} ${n2(Y)} m`, `${n2(X + w - r)} ${n2(Y)} l`, `${n2(X + w - r + k)} ${n2(Y)} ${n2(X + w)} ${n2(Y + r - k)} ${n2(X + w)} ${n2(Y + r)} c`,
        `${n2(X + w)} ${n2(Y + h - r)} l`, `${n2(X + w)} ${n2(Y + h - r + k)} ${n2(X + w - r + k)} ${n2(Y + h)} ${n2(X + w - r)} ${n2(Y + h)} c`,
        `${n2(X + r)} ${n2(Y + h)} l`, `${n2(X + r - k)} ${n2(Y + h)} ${n2(X)} ${n2(Y + h - r + k)} ${n2(X)} ${n2(Y + h - r)} c`,
        `${n2(X)} ${n2(Y + r)} l`, `${n2(X)} ${n2(Y + r - k)} ${n2(X + r - k)} ${n2(Y)} ${n2(X + r)} ${n2(Y)} c`, 'h'].join(' ');
    } else path = `${n2(x)} ${n2(this.H - y - h)} ${n2(w)} ${n2(h)} re`;
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.op(`q ${fill ? `${rgb(fill)} rg ` : ''}${stroke ? `${rgb(stroke)} RG ${n2(lw)} w ` : ''}${path} ${paint} Q`);
  }
  line(x1, y1, x2, y2, { color = '#1F1A3D', lw = 1 } = {}) {
    this.op(`q ${rgb(color)} RG ${n2(lw)} w ${n2(x1)} ${n2(this.H - y1)} m ${n2(x2)} ${n2(this.H - y2)} l S Q`);
  }
  /** Foto JPEG (byte già pronti): { bytes, w, h }. */
  image(img, x, y, w, h) {
    let i = this.images.indexOf(img);
    if (i < 0) { this.images.push(img); i = this.images.length - 1; }
    this.page.imgs.add(i);
    this.op(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(this.H - y - h)} cm /Im${i} Do Q`);
  }
  /** Il file finale (Uint8Array). */
  bytes(title = '') {
    const chunks = [];
    const offsets = [];
    let len = 0;
    const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
    const obj = (id, body) => { offsets[id] = len; push(`${id} 0 obj\n`); for (const b of [].concat(body)) push(b); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    // 1 catalogo, 2 pagine, 3-5 font, 6 info, poi immagini, poi pagine e contenuti
    const imgBase = 7;
    const pageBase = imgBase + this.images.length;
    const kids = this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    const d = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    obj(6, `<< /Title ${pdfStr(title)} /Producer (GameNight Show) /CreationDate (D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}) >>`);
    this.images.forEach((im, i) => {
      obj(imgBase + i, [`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`, im.bytes, '\nendstream']);
    });
    this.pages.forEach((p, i) => {
      const id = pageBase + i * 2;
      const xo = [...p.imgs].map((k) => `/Im${k} ${imgBase + k} 0 R`).join(' ');
      obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(this.W)} ${n2(this.H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${id + 1} 0 R >>`);
      const content = enc.encode(p.ops.join('\n'));
      obj(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    });
    const total = pageBase + this.pages.length * 2;
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    push(x);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Foto: ritaglio quadrato in JPEG
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 6000);
    im.src = src;
  });
}
async function squareJpeg(src, size = 420) {
  const im = await loadImage(src);
  if (!im || !im.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  const s = Math.min(im.naturalWidth, im.naturalHeight);
  g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  const url = c.toDataURL('image/jpeg', 0.82);
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, w: size, h: size };
}

// ---------------------------------------------------------------------------
// Impaginazione del resoconto (stessi dati di reportHTML)
// ---------------------------------------------------------------------------

const INK = '#1F1A3D';
const SOFT = '#4A4468';
const RULE = '#CFC8E6';
const names = (l) => (l || []).filter(Boolean).join(', ');

/**
 * d: lo stesso oggetto di reportHTML (report.js). Restituisce un Blob application/pdf.
 * opts.photos: false per non includere le foto.
 */
export async function reportPDF(d, { photos = true } = {}) {
  const doc = new PdfDoc();
  const M = 36;
  const W = doc.W - M * 2;
  const BOTTOM = doc.H - 44;
  const color = /^#[0-9A-Fa-f]{6}$/.test(d.color || '') ? d.color : '#FFC93C';
  let y = M;
  const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; return true; } return false; };

  // Intestazione
  doc.text('GameNight', M, y + 11, { size: 12, bold: true });
  const gx = M + textWidth('GameNight ', 12, true);
  const sw = textWidth('Show', 12, true) + 8;
  doc.rect(gx, y, sw, 15, { fill: color, stroke: INK, lw: 1.2, r: 3 });
  doc.text('Show', gx + 4, y + 11, { size: 12, bold: true });
  if (d.number) {
    const label = `Game Night #${d.number}`;
    const lw = textWidth(label, 13, true) + 22;
    doc.rect(M + W - lw, y + 4, lw, 24, { fill: color, stroke: INK, lw: 1.6, r: 12 });
    doc.text(label, M + W - lw + 11, y + 21, { size: 13, bold: true });
  }
  y += 22;
  const title = pdfText(d.group || t('report.ourNight')) || 'GameNight';
  for (const l of wrap(title, 24, W - 150, true)) { y += 25; doc.text(l, M, y, { size: 24, bold: true }); }
  const sub = [d.date, d.facts].filter(Boolean).join(' · ');
  if (sub) for (const l of wrap(sub, 10.5, W, false)) { y += 15; doc.text(l, M, y, { size: 10.5, color: SOFT }); }
  y += 9;
  doc.line(M, y, M + W, y, { lw: 2.5 });
  y += 10;

  const heading = (txt) => { ensure(40); y += 18; doc.text(txt, M, y, { size: 14, bold: true }); y += 8; };

  // Classifica
  heading(t('report.pdf.board'));
  const critHeads = [...new Set(d.rows.flatMap((r) => Object.keys(r.crit || {})))];
  const fixed = [{ k: 'rank', w: 18, h: '#' }, { k: 'name', w: 0, h: t('report.pdf.colGame') }, { k: 'avg', w: 34, h: t('report.pdf.colAvg'), r: true },
    ...critHeads.map((c) => ({ k: `c:${c}`, w: Math.min(60, Math.max(32, textWidth(String(c).toUpperCase(), 7, true) + 8)), h: c, r: true })),
    { k: 'n', w: 30, h: t('report.pdf.colVotes'), r: true }, { k: 'mvp', w: 0, h: 'MVP' }, { k: 'win', w: 0, h: t('report.pdf.colWinners') }, { k: 'min', w: 40, h: t('report.pdf.colTime'), r: true }];
  const used = fixed.reduce((a, c) => a + c.w, 0);
  const flex = Math.max(60, W - used);
  for (const c of fixed) if (!c.w) c.w = c.k === 'name' ? flex * 0.42 : flex * 0.29;
  const PAD = 3;
  const headRow = () => {
    ensure(20);
    let x = M;
    let h = 0;
    const cells = fixed.map((c) => wrap(String(c.h).toUpperCase(), 7, c.w - PAD * 2, true));
    for (const ls of cells) h = Math.max(h, ls.length);
    const rh = h * 8.5 + 6;
    fixed.forEach((c, i) => {
      cells[i].forEach((l, j) => {
        const lx = c.r ? x + c.w - PAD - textWidth(l, 7, true) : x + PAD;
        doc.text(l, lx, y + 9 + j * 8.5, { size: 7, bold: true, color: SOFT });
      });
      x += c.w;
    });
    y += rh;
    doc.line(M, y, M + W, y, { lw: 1.2 });
  };
  if (d.rows.length) headRow();
  d.rows.forEach((r, i) => {
    const val = (c) => {
      if (c.k === 'rank') return [String(r.rank)];
      if (c.k === 'avg') return [fmt(r.avg)];
      if (c.k === 'n') return [String(r.n)];
      if (c.k === 'min') return [r.minutes ? t('report.pdf.min', { n: r.minutes }) : '–'];
      if (c.k === 'mvp') return wrap(names(r.mvp) || '–', 8.5, c.w - PAD * 2);
      if (c.k === 'win') return wrap(names(r.winners) || '–', 8.5, c.w - PAD * 2);
      if (c.k.startsWith('c:')) { const v = r.crit?.[c.k.slice(2)]; return [v !== null && v !== undefined ? fmt(v) : '–']; }
      return null;
    };
    const nameLines = wrap(r.name, 9, fixed[1].w - PAD * 2, true);
    const extra = [];
    if (r.audience !== null && r.audience !== undefined) extra.push(...wrap(t('report.pdf.audience', { avg: fmt(r.audience) }), 7.5, fixed[1].w - PAD * 2));
    if (r.consensus !== null && r.consensus !== undefined) extra.push(...wrap(t('report.pdf.consensus', { n: r.consensus }), 7.5, fixed[1].w - PAD * 2));
    const cells = fixed.map((c) => (c.k === 'name' ? null : val(c)));
    const lines = Math.max(nameLines.length + extra.length * 0.85, ...cells.filter(Boolean).map((l) => l.length));
    const rh = lines * 11 + 7;
    if (ensure(rh)) headRow();
    if (i === 0) doc.rect(M, y, W, rh, { fill: '#FFF3C4' });
    let x = M;
    fixed.forEach((c, k) => {
      if (c.k === 'name') {
        nameLines.forEach((l, j) => doc.text(l, x + PAD, y + 11 + j * 11, { size: 9, bold: true }));
        extra.forEach((l, j) => doc.text(l, x + PAD, y + 11 + nameLines.length * 11 + j * 9.4, { size: 7.5, color: SOFT }));
      } else {
        const big = c.k === 'avg';
        cells[k].forEach((l, j) => {
          const sz = big ? 11 : 8.5;
          const lx = c.r ? x + c.w - PAD - textWidth(l, sz, big) : x + PAD;
          doc.text(l, lx, y + 11 + j * 11, { size: sz, bold: big });
        });
      }
      x += c.w;
    });
    y += rh;
    doc.line(M, y, M + W, y, { color: RULE, lw: 0.7 });
  });

  // Premi e traguardi: griglia a due colonne
  const boxes = (list, titleKey) => {
    if (!list.length) return;
    heading(t(titleKey));
    const cw = (W - 12) / 2;
    for (let i = 0; i < list.length; i += 2) {
      const pair = list.slice(i, i + 2).map((a) => {
        const top = a.small ? wrap(a.small, 8, cw - 14) : [];
        const mid = wrap(a.big, 10.5, cw - 14, true);
        const bot = a.foot ? wrap(a.foot, 8, cw - 14) : [];
        return { top, mid, bot, h: 10 + top.length * 10 + mid.length * 13 + bot.length * 10 };
      });
      const h = Math.max(...pair.map((p) => p.h));
      ensure(h + 6);
      pair.forEach((p, k) => {
        const x = M + k * (cw + 12);
        doc.rect(x, y, cw, h, { stroke: INK, lw: 1, r: 5 });
        let yy = y + 4;
        for (const l of p.top) { yy += 10; doc.text(l, x + 7, yy, { size: 8, color: SOFT }); }
        for (const l of p.mid) { yy += 13; doc.text(l, x + 7, yy, { size: 10.5, bold: true }); }
        for (const l of p.bot) { yy += 10; doc.text(l, x + 7, yy, { size: 8, color: SOFT }); }
      });
      y += h + 6;
    }
  };
  boxes((d.awards || []).map((a) => ({ small: a.title, big: a.who, foot: a.value })), 'report.awards');
  boxes((d.achievements || []).map((a) => ({ big: a.title, foot: a.who })), 'report.pdf.achievements');

  // Commenti
  if (d.quotes?.length) {
    heading(t('report.pdf.quotes'));
    for (const q of d.quotes) {
      const body = wrap(t('report.pdf.quote', { text: q.text }), 9.5, W - 14);
      const who = wrap(`${q.name}, ${q.game}`, 8, W - 14);
      const h = body.length * 12 + who.length * 10 + 4;
      ensure(h + 4);
      doc.rect(M, y + 1, 2.5, h - 2, { fill: color });
      let yy = y;
      for (const l of body) { yy += 12; doc.text(l, M + 10, yy, { size: 9.5, italic: true }); }
      for (const l of who) { yy += 10; doc.text(l, M + 10, yy, { size: 8, color: SOFT }); }
      y += h + 4;
    }
  }

  // Album
  const list = photos ? (d.photos || []).slice(0, 12) : [];
  if (list.length) {
    const imgs = [];
    for (const p of list) imgs.push(await squareJpeg(p.data).catch(() => null));
    const ok = list.map((p, i) => ({ p, img: imgs[i] })).filter((x) => x.img);
    if (ok.length) {
      heading(t('report.pdf.album'));
      const cw = (W - 16) / 3;
      for (let i = 0; i < ok.length; i += 3) {
        const row = ok.slice(i, i + 3).map((x) => ({ ...x, cap: wrap([x.p.caption, x.p.by].filter(Boolean).join(' · '), 8, cw - 8).slice(0, 3) }));
        const h = cw + 8 + Math.max(0, ...row.map((r) => r.cap.length)) * 10;
        ensure(h + 8);
        row.forEach((r, k) => {
          const x = M + k * (cw + 8);
          doc.rect(x, y, cw, h, { stroke: INK, lw: 1 });
          doc.image(r.img, x + 4, y + 4, cw - 8, cw - 8);
          r.cap.forEach((l, j) => doc.text(l, x + 4, y + cw + 6 + j * 10, { size: 8 }));
        });
        y += h + 8;
      }
    }
  }

  // Piede di pagina su ogni pagina
  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    doc.page = p;
    const fy = doc.H - 26;
    doc.line(M, fy - 10, M + W, fy - 10, { color: RULE, lw: 0.8 });
    if (d.next) doc.text(wrap(t('report.pdf.next', { when: d.next }), 8, W * 0.55)[0], M, fy, { size: 8, color: SOFT });
    const right = `${pdfText(t('report.madeWith'))}${total > 1 ? `  ·  ${i + 1}/${total}` : ''}`;
    doc.text(right, M + W - textWidth(right, 8), fy, { size: 8, color: SOFT });
  });

  const title2 = `GameNight Show · ${d.group || t('report.pdf.night')} · ${d.date || ''}`;
  return new Blob([doc.bytes(title2)], { type: 'application/pdf' });
}

// ---------------------------------------------------------------------------
// Etichette con QR dell'armadio (A4, 3 colonne), per l'app Android
// ---------------------------------------------------------------------------

/** QR come quadratini vettoriali (nitido a ogni stampa). */
function drawQR(doc, text, x, y, size) {
  if (typeof window === 'undefined' || typeof window.qrcode !== 'function') return false;
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 4);
  doc.rect(x, y, size, size, { fill: '#FFFFFF' });
  const ops = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      ops.push(`${n2(x + (c + 2) * cell)} ${n2(doc.H - (y + (r + 3) * cell))} ${n2(cell + 0.05)} ${n2(cell + 0.05)} re`);
    }
  }
  doc.op(`q ${rgb('#1F1A3D')} rg ${ops.join(' ')} f Q`);
  return true;
}

/**
 * labels: [{ title, sub, ref, url }]; heading: titolo in cima alla prima pagina.
 * Restituisce un Blob application/pdf.
 */
export function labelsPDF({ heading = '', labels = [] } = {}) {
  const doc = new PdfDoc();
  const M = 28;
  const COLS = 3;
  const GAP = 8;
  const W = (doc.W - M * 2 - GAP * (COLS - 1)) / COLS;
  const H = 96;
  let y = M;
  if (heading) { doc.text(wrap(heading, 12, doc.W - M * 2, true)[0], M, y + 12, { size: 12, bold: true }); y += 24; }
  labels.forEach((l, i) => {
    const col = i % COLS;
    if (col === 0 && i > 0) y += H + GAP;
    if (col === 0 && y + H > doc.H - M) { doc.addPage(); y = M; }
    const x = M + col * (W + GAP);
    doc.op('q [3 2] 0 d');
    doc.rect(x, y, W, H, { stroke: '#888888', lw: 0.8, r: 8 });
    doc.op('Q');
    const q = 74;
    drawQR(doc, l.url, x + 6, y + (H - q) / 2, q);
    const tx = x + q + 12;
    const tw = W - q - 18;
    let ty = y + 14;
    for (const line of wrap(l.title, 10.5, tw, true).slice(0, 3)) { ty += 12; doc.text(line, tx, ty, { size: 10.5, bold: true }); }
    for (const line of (l.sub ? wrap(l.sub, 8, tw).slice(0, 2) : [])) { ty += 10; doc.text(line, tx, ty, { size: 8 }); }
    if (l.ref) for (const line of wrap(l.ref, 6.5, tw).slice(0, 2)) { ty += 9; doc.text(line, tx, ty, { size: 6.5, color: '#555555' }); }
  });
  return new Blob([doc.bytes(heading)], { type: 'application/pdf' });
}
