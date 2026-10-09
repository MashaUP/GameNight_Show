import { APP_VERSION } from './version.js';
import { isSafeMode } from './safe.js';
import { confettiBurst } from './fx.js';
import { isApp, nativeFile, versionUrl, apkUrl } from './native.js';

// I moduli sono partiti: il controllo di js/stale.js non serve più.
try { window.__gnrReady = true; } catch { /* niente */ }
// Funzioni di supporto condivise da TV e telefoni.

export const PLAYER_COLORS = [
  '#FF5A4E', '#2EC4B6', '#7B5CFA', '#FFC93C', '#FF8FB1', '#4D96FF',
  '#8AC926', '#FF924C', '#00B4D8', '#C77DFF', '#F15BB5', '#9BE564'
];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const DEFAULT_PLAYERS = 8;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Codice QR come SVG (serve vendor/qrcode.js caricato nella pagina). */
export function qrSVG(text) {
  if (typeof window.qrcode !== 'function') return '<p class="muted">QR non disponibile</p>';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#1F1A3D"/></svg>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function safeColor(c) {
  return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#FFC93C';
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(len = 4) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
}
export function normalizeCode(s, len = 4) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);
}

/** Chiave stabile per confrontare i nomi (maiuscole e spazi non contano). */
export function nameKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Chiave utilizzabile nel database (Firebase non accetta . # $ [ ] /). */
export function dbKey(s) {
  return nameKey(s).replace(/[.#$\[\]\/]/g, '_') || '_';
}

export function cleanName(s, max = 40) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

/** Errore pensato per essere mostrato così com'è all'utente. */
export function userError(message) {
  const e = new Error(message);
  e.user = true;
  return e;
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Numero con una cifra decimale e virgola italiana. */
export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toFixed(digits).replace('.', ',');
}

/** Giocatori presenti adesso (esclude chi è uscito dalla serata). */
export function activePlayers(players) {
  return sortedPlayers(players).filter((p) => !p.away);
}

/** Il gioco va bene per n giocatori? Senza informazioni, sì. */
export function libFits(item, n) {
  const min = Number(item?.minPlayers) || 0;
  const max = Number(item?.maxPlayers) || 0;
  return (!min || n >= min) && (!max || n <= max);
}

/** Descrizione breve, es. "2–8 giocatori, 30 min". */
export function libInfo(item) {
  const min = Number(item?.minPlayers) || 0;
  const max = Number(item?.maxPlayers) || 0;
  const parts = [];
  if (min && max) parts.push(min === max ? `${min} giocatori` : `${min}–${max} giocatori`);
  else if (min) parts.push(`da ${min} giocatori`);
  else if (max) parts.push(`fino a ${max} giocatori`);
  if (Number(item?.playedCount) && Number(item?.playedTotal)) parts.push(`${Math.round(item.playedTotal / item.playedCount)} min a partita`);
  else if (Number(item?.duration)) parts.push(`${Number(item.duration)} min`);
  return parts.join(', ');
}

/** Firebase può restituire un elenco come array o come oggetto {0:…, 1:…}. */
export function asList(x) {
  if (Array.isArray(x)) return x.filter((v) => v !== null && v !== undefined);
  return x && typeof x === 'object' ? Object.values(x) : [];
}

export function sortedPlayers(players) {
  return Object.entries(players || {})
    .map(([uid, p]) => ({ uid, ...p }))
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.name).localeCompare(b.name));
}

/** Ridimensiona e comprime una foto in JPEG (data URL) per salvarla nel database. */
export function compressImage(file, max = 720, quality = 0.74) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Il file scelto non è un’immagine.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossibile leggere questa immagine. Prova con un JPG o PNG.'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Immagini dei giochi: tutte nello stesso formato (4:3, 640×480)
// ---------------------------------------------------------------------------

export const GAME_IMG_W = 640;
export const GAME_IMG_H = 480;

function loadAnyImage(src, cors = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossibile leggere questa immagine. Prova con un JPG o PNG.'));
    img.src = src;
  });
}

/**
 * Disegna la foto in un riquadro 4:3 sempre uguale: la scatola intera al centro (senza tagli),
 * e intorno la stessa foto ingrandita e sfocata, così non restano bande vuote.
 */
function drawStandard(img) {
  const W = GAME_IMG_W, H = GAME_IMG_H;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) throw new Error('Immagine vuota.');
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#1F1A3D'; c.fillRect(0, 0, W, H);
  // Sfondo: copia piccolissima ingrandita (sfocatura che funziona su tutti i browser)
  const tiny = document.createElement('canvas');
  tiny.width = 24; tiny.height = 18;
  const tc = tiny.getContext('2d');
  const cover = Math.max(24 / iw, 18 / ih);
  tc.drawImage(img, (24 - iw * cover) / 2, (18 - ih * cover) / 2, iw * cover, ih * cover);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(tiny, -W * 0.06, -H * 0.06, W * 1.12, H * 1.12);
  c.fillStyle = 'rgba(20, 11, 46, 0.28)'; c.fillRect(0, 0, W, H);
  // Primo piano: la foto intera, centrata
  const fit = Math.min(W / iw, H / ih);
  const w = iw * fit, h = ih * fit;
  // Se la foto ha quasi la stessa forma del riquadro, la si riempie del tutto (taglio minimo).
  const near = Math.abs(iw / ih - W / H) < 0.12;
  if (near) {
    const fill = Math.max(W / iw, H / ih);
    c.drawImage(img, (W - iw * fill) / 2, (H - ih * fill) / 2, iw * fill, ih * fill);
  } else {
    c.shadowColor = 'rgba(0, 0, 0, 0.45)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  return cv.toDataURL('image/jpeg', 0.8);
}

// ---------------------------------------------------------------------------
// Rotazione delle foto prima di salvarle (giochi, personaggio, ricordi, logo)
// ---------------------------------------------------------------------------

/**
 * Foto girata di quarti di giro (1 = 90° in senso orario, -1 = antiorario).
 * L'orientamento EXIF delle fotocamere è già applicato dal browser quando la foto viene letta,
 * quindi la rotazione si somma a quello: quello che si vede in anteprima è quello che si salva.
 */
function rotatedCanvas(img, quarter, maxSide = 3000) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
  const q = ((quarter % 4) + 4) % 4;
  const cv = document.createElement('canvas');
  cv.width = q % 2 ? h : w; cv.height = q % 2 ? w : h;
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.translate(cv.width / 2, cv.height / 2);
  c.rotate(q * Math.PI / 2);
  c.drawImage(img, -w / 2, -h / 2, w, h);
  return cv;
}

/**
 * Finestra "Ruota la foto": anteprima di come verrà salvata, ⟲ e ⟳ di 90°, Usa o Annulla.
 * kind: 'game' (riquadro 4:3 standard), 'square' (personaggio), 'free' (ricordi, logo).
 * Restituisce il file da usare (quello originale se non è stato ruotato) oppure lancia
 * un errore con cancelled = true se si annulla.
 */
export async function editPhoto(file, kind = 'free') {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Il file scelto non è un’immagine.');
  const url = URL.createObjectURL(file);
  let img;
  try { img = await loadAnyImage(url); } catch (err) { URL.revokeObjectURL(url); throw err; }
  return new Promise((resolve, reject) => {
    let q = 0;
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet photo-edit';
    el.innerHTML = `
      <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="peTitle">
        <div class="panel-head"><h2 id="peTitle">Controlla la foto</h2><button type="button" class="icon-btn" data-pecancel aria-label="Annulla">✕</button></div>
        <div class="pe-stage pe-stage--${kind}"><img id="peImg" alt="Anteprima della foto"></div>
        <div class="pe-rot">
          <button type="button" class="btn-sec" id="peLeft" aria-label="Ruota a sinistra di 90 gradi">⟲ <span>Sinistra</span></button>
          <button type="button" class="btn-sec" id="peRight" aria-label="Ruota a destra di 90 gradi">⟳ <span>Destra</span></button>
        </div>
        <p class="muted small">${kind === 'game' ? 'Così comparirà nell’armadio e sulla TV.' : kind === 'square' ? 'Così comparirà il tuo personaggio.' : 'Se la foto è storta, girala prima di salvarla.'}</p>
        <button type="button" class="btn btn-block" id="peOk">Usa la foto</button>
      </div>`;
    document.body.appendChild(el);
    const prev = el.querySelector('#peImg');
    const paint = () => {
      const cv = rotatedCanvas(img, q, 900);
      if (kind === 'game') prev.src = drawStandard(cv);
      else if (kind === 'square') {
        const s = Math.min(cv.width, cv.height);
        const sq = document.createElement('canvas'); sq.width = sq.height = 320;
        sq.getContext('2d').drawImage(cv, (cv.width - s) / 2, (cv.height - s) / 2, s, s, 0, 0, 320, 320);
        prev.src = sq.toDataURL('image/jpeg', 0.85);
      } else prev.src = cv.toDataURL('image/jpeg', 0.85);
    };
    const finish = (ok) => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      if (!ok) { URL.revokeObjectURL(url); reject(Object.assign(new Error(''), { cancelled: true })); return; }
      if (!(q % 4)) { URL.revokeObjectURL(url); resolve(file); return; }
      const cv = rotatedCanvas(img, q);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(new File([b], 'foto.jpg', { type: 'image/jpeg' })) : resolve(file)), 'image/jpeg', 0.92);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-pecancel]')) finish(false);
      else if (e.target.closest('#peLeft')) { q--; paint(); }
      else if (e.target.closest('#peRight')) { q++; paint(); }
      else if (e.target.closest('#peOk')) finish(true);
    });
    paint();
    el.querySelector('#peOk').focus({ preventScroll: true });
  });
}

/** Foto di un gioco da file (scelto, incollato, scattato): sempre 640×480, dopo l'eventuale rotazione. */
export async function gameImage(file, { edit = true } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Il file scelto non è un’immagine.');
  if (edit) file = await editPhoto(file, 'game');
  const url = URL.createObjectURL(file);
  try { return drawStandard(await loadAnyImage(url)); } finally { URL.revokeObjectURL(url); }
}

/**
 * Foto di un gioco da un link. Se il sito lo permette la si copia nel formato standard
 * (così resta anche se il link sparisce); altrimenti si tiene il link e la si mostra
 * comunque nel riquadro standard.
 */
export async function gameImageFromUrl(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Il link deve iniziare con http:// o https://');
  try { return { image: drawStandard(await loadAnyImage(url, true)), copied: true }; } catch { /* il sito non permette la copia */ }
  await loadAnyImage(url).catch(() => { throw new Error('Non riesco ad aprire questa immagine: copia il link diretto della foto (tasto destro › Copia indirizzo immagine).'); });
  return { image: url, copied: false };
}

export function isImageSource(s) {
  return typeof s === 'string' && (/^data:image\//.test(s) || /^https?:\/\//i.test(s));
}

/** Riquadro immagine del gioco, con segnaposto a righe se manca la foto. */
export function gameImageHTML(game, cls = '') {
  const src = game?.image;
  if (isImageSource(src)) {
    // Due livelli: sfondo sfocato che riempie il riquadro e foto intera sopra. Ogni foto, di qualsiasi forma,
    // sta nello stesso riquadro senza uscire e senza tagli brutti.
    return `<div class="game-img ${cls}" data-initials="${esc(initials(game?.name))}"><img class="gi-bg" src="${esc(src)}" alt="" aria-hidden="true" data-fallback="hide"><img class="gi-fg" src="${esc(src)}" alt="${esc(game?.name || 'Foto del gioco')}" data-fallback="game"></div>`;
  }
  return `<div class="game-img game-img--empty ${cls}"><span>${esc(initials(game?.name))}</span></div>`;
}

export function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

// Avviso "connessione persa": compare solo dopo essere stati online almeno una volta.
const net = { wasOnline: false, timer: null, shown: false };
export function connectionStatus(online) {
  if (online) {
    clearTimeout(net.timer);
    net.timer = null;
    if (net.shown) {
      $('#netBanner')?.remove();
      net.shown = false;
      toast('Di nuovo connesso');
    }
    net.wasOnline = true;
    return;
  }
  if (!net.wasOnline || net.timer || net.shown) return;
  net.timer = setTimeout(() => {
    net.timer = null;
    net.shown = true;
    const el = document.createElement('div');
    el.id = 'netBanner';
    el.className = 'net-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML = `${ICONS.wifiOff}<span>Connessione persa. I dati restano salvati su questo dispositivo e partono da soli appena torna la rete.</span>`;
    document.body.appendChild(el);
  }, 1500);
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  if (!message) return; // per esempio: foto annullata dalla finestra "Controlla la foto"
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `toast toast--${kind} is-on`;
  el.textContent = message;
  if (kind === 'error') ErrLog.add('avviso', message);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');

// ---------------------------------------------------------------------------
// Registro errori: gli ultimi 150, scaricabili per capire cosa è successo durante la serata
// ---------------------------------------------------------------------------

const ERR_KEY = 'gnr_errlog';
export const ErrLog = {
  list() { try { return JSON.parse(localStorage.getItem(ERR_KEY) || '[]') || []; } catch { return []; } },
  add(kind, msg, stack = '') {
    try {
      const l = this.list();
      const m = String(msg || '').slice(0, 400);
      const last = l[l.length - 1];
      if (last && last.msg === m && Date.now() - last.t < 5000) { last.n = (last.n || 1) + 1; }
      else l.push({ t: Date.now(), kind, msg: m, stack: String(stack || '').slice(0, 800), page: location.pathname.split('/').pop(), v: APP_VERSION });
      localStorage.setItem(ERR_KEY, JSON.stringify(l.slice(-150)));
    } catch { /* memoria piena: pazienza */ }
  },
  clear() { try { localStorage.removeItem(ERR_KEY); } catch { /* niente */ } },
  /** File di testo da allegare a una segnalazione. */
  download(extra = {}) {
    const l = this.list();
    const head = {
      app: 'GameNight_Show', versione: APP_VERSION, data: new Date().toISOString(), pagina: location.href.replace(/#.*$/, ''),
      browser: navigator.userAgent, schermo: `${screen.width}×${screen.height} (finestra ${innerWidth}×${innerHeight})`, lingua: navigator.language, ...extra
    };
    const lines = l.map((e) => `[${new Date(e.t).toLocaleString('it-IT')}] ${e.kind.toUpperCase()}${e.n > 1 ? ` ×${e.n}` : ''} (${e.page}, v${e.v})\n  ${e.msg}${e.stack ? `\n  ${e.stack.replace(/\n/g, '\n  ')}` : ''}`);
    downloadFile(`gamenight_errori_${new Date().toISOString().slice(0, 10)}.txt`, `${JSON.stringify(head, null, 2)}\n\n${lines.join('\n\n') || 'Nessun errore registrato.'}\n`, 'text/plain');
  },
  install() {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener('error', (e) => {
      if (e.target && e.target !== window && e.target.tagName) { this.add('risorsa', `Non caricata: ${e.target.tagName.toLowerCase()} ${String(e.target.src || e.target.href || '').slice(0, 120)}`); return; }
      this.add('errore', e.message, e.error?.stack);
    }, true);
    window.addEventListener('unhandledrejection', (e) => this.add('promessa', e.reason?.message || e.reason, e.reason?.stack));
    const orig = console.error.bind(console);
    console.error = (...args) => { this.add('console', args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ')); orig(...args); };
  }
};

// ---------------------------------------------------------------------------
// Accessibilità: testo più grande, alto contrasto, colori per daltonici, meno animazioni
// ---------------------------------------------------------------------------

const A11Y_KEY = 'gnr_a11y';
export function a11ySettings() {
  try { return { size: 'm', contrast: false, cb: false, motion: false, ...(JSON.parse(localStorage.getItem(A11Y_KEY) || '{}') || {}) }; } catch { return { size: 'm', contrast: false, cb: false, motion: false }; }
}
export function applyA11y(set = a11ySettings()) {
  const c = document.documentElement?.classList;
  if (!c) return;
  c.toggle('a11y-l', set.size === 'l');
  c.toggle('a11y-xl', set.size === 'xl');
  c.toggle('a11y-contrast', Boolean(set.contrast));
  c.toggle('a11y-cb', Boolean(set.cb));
  c.toggle('a11y-motion', Boolean(set.motion));
}
export function saveA11y(patch) {
  const next = { ...a11ySettings(), ...patch };
  try { localStorage.setItem(A11Y_KEY, JSON.stringify(next)); } catch { /* niente */ }
  applyA11y(next);
  window.dispatchEvent(new Event('gnr-a11y'));
}
/** Controlli dell'accessibilità (TV negli Strumenti, telefono nel profilo). */
export function a11yHTML(id = 'a11y') {
  const a = a11ySettings();
  const sz = (v, l) => `<button type="button" data-a11y-size="${v}" aria-pressed="${a.size === v}">${l}</button>`;
  return `<div class="a11y-box" id="${id}">
    <div class="seg" role="group" aria-label="Dimensione del testo">${sz('m', 'A')}${sz('l', '<span class="a11y-l-label">A+</span>')}${sz('xl', '<span class="a11y-xl-label">A++</span>')}</div>
    <label class="quick-toggle"><input type="checkbox" data-a11y="contrast" ${a.contrast ? 'checked' : ''}><span>Alto contrasto</span></label>
    <label class="quick-toggle"><input type="checkbox" data-a11y="cb" ${a.cb ? 'checked' : ''}><span>Colori adatti ai daltonici</span></label>
    <label class="quick-toggle"><input type="checkbox" data-a11y="motion" ${a.motion ? 'checked' : ''}><span>Meno animazioni</span></label>
  </div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a11y-size]');
  if (!b) return;
  saveA11y({ size: b.dataset.a11ySize });
  b.parentElement.querySelectorAll('[data-a11y-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
document.addEventListener('change', (e) => {
  const t = e.target.closest?.('[data-a11y]');
  if (t) saveA11y({ [t.dataset.a11y]: t.checked });
});
applyA11y();

// ---------------------------------------------------------------------------
// Timer del voto (stesso calcolo su TV e telefoni, con l'ora del server)
// ---------------------------------------------------------------------------

/** Stato del conto alla rovescia della votazione, o null se il timer è spento. */
export function voteTimer(state, now) {
  const secs = Number(state?.voteSecs) || 0;
  const at = Number(state?.at);
  if (!secs || state?.phase !== 'voting' || !Number.isFinite(at) || at <= 0) return null;
  const end = at + secs * 1000 + (Number(state.votePaused) || 0);
  const ref = state.paused && state.pausedAt ? Number(state.pausedAt) : now;
  const left = Math.max(0, Math.min(secs * 1000, end - ref));
  return { secs, left, sec: Math.ceil(left / 1000), frac: left / (secs * 1000), over: left <= 0, paused: Boolean(state.paused) };
}

/** Colore del timer: verde quando c'è tempo, poi giallo, arancione e rosso scuro. */
export function timerColor(frac) {
  const stops = [[0, [150, 16, 30]], [0.22, [255, 92, 40]], [0.5, [255, 205, 60]], [1, [61, 220, 132]]];
  const f = Math.max(0, Math.min(1, frac));
  for (let i = 1; i < stops.length; i++) {
    const [f1, c1] = stops[i];
    const [f0, c0] = stops[i - 1];
    if (f <= f1) {
      const k = (f - f0) / (f1 - f0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(', ')})`;
    }
  }
  return 'rgb(61, 220, 132)';
}

/** Vibrazione breve (dove il telefono la supporta). */
export function buzz(pattern = 8) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* niente */ }
}

/**
 * Coriandoli per i momenti di festa: su canvas con un po' di fisica (fx.js);
 * se il canvas non è disponibile, la vecchia versione in CSS.
 */
export function confetti(count = 90, mode = 'cannons') {
  if (prefersReducedMotion() || isSafeMode()) return;
  if (typeof HTMLCanvasElement !== 'undefined' && document.createElement('canvas').getContext) {
    confettiBurst(Math.round(count * 1.4), mode);
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    piece.style.cssText = [
      `left:${Math.random() * 100}%`,
      `background:${color}`,
      `animation-delay:${(Math.random() * 0.6).toFixed(2)}s`,
      `animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
      `--rot:${Math.round(Math.random() * 720 - 360)}deg`,
      `--drift:${Math.round(Math.random() * 160 - 80)}px`,
      `width:${8 + Math.round(Math.random() * 8)}px`,
      `height:${10 + Math.round(Math.random() * 10)}px`
    ].join(';');
    wrap.appendChild(piece);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4600);
}

/** Se un'immagine non si carica, mostra il segnaposto. */
export function installImageFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.fallback === 'game' || img.dataset.fallback === 'hide') {
      const box = img.closest('.game-img');
      if (box && !box.classList.contains('game-img--empty')) {
        box.classList.add('game-img--empty');
        box.querySelectorAll('img').forEach((i) => i.remove());
        const sp = document.createElement('span');
        sp.textContent = box.dataset.initials || '?';
        box.appendChild(sp);
      }
    }
  }, true);
}

export function showFatal(container, title, message) {
  container.innerHTML = `
    <div class="fatal">
      <div class="card fatal-card">
        <h1>${esc(title)}</h1>
        <p>${esc(message)}</p>
        <button class="btn" type="button" data-reload>Ricarica la pagina</button>
      </div>
    </div>`;
  container.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
}

export function showNotConfigured(container) {
  container.innerHTML = `
    <div class="fatal">
      <div class="card fatal-card">
        <h1>Manca la configurazione</h1>
        <p>Apri il file <code>js/config.js</code> e incolla i dati del tuo progetto Firebase.
        Trovi la guida passo passo nel README del progetto.</p>
      </div>
    </div>`;
}

export function downloadFile(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  if (isApp()) { saveInApp(blob, filename); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Nell'app Android non esistono i "download" del browser: il file va in Documenti/GameNight Show
 * oppure, se il telefono non lo permette, si apre "Condividi". mode 'share' apre subito "Condividi".
 */
export async function saveInApp(blob, filename, { mode = 'save', text = '' } = {}) {
  try {
    const r = await nativeFile(blob, filename, { mode, title: 'GameNight Show', text });
    if (r.result === 'saved') toast(`Salvato in ${r.where}`);
    return r.result;
  } catch (err) {
    console.error(err);
    toast('Non sono riuscito a salvare il file.', 'error');
    return 'error';
  }
}

// Icone SVG a tratto (ereditano il colore del testo).
const svg = (d, extra = '') =>
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  image: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>'),
  books: svg('<path d="M4.5 4h3.5v16H4.5zM10 4h3.5v16H10z"/><path d="M15.4 5.4l3.4-.9 3.2 15-3.4.9z"/>'),
  share: svg('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>'),
  wifiOff: svg('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4.5-2.4M19 12.5a10 10 0 0 0-2.4-1.7"/><path d="M2 8.8a15 15 0 0 1 4.3-2.6M22 8.8A15 15 0 0 0 11 5"/><circle cx="12" cy="19.5" r="0.6"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  tv: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  exit: svg('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  play: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5L19.5 12 7 19.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4"/>'),
  download: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  crown: '<svg class="crown" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14 L4 3 L9 8 L12 1 L15 8 L20 3 L22 14 Z" fill="#FFC93C" stroke="#1F1A3D" stroke-width="1.8" stroke-linejoin="round"/></svg>'
};


// ---------------------------------------------------------------------------
// Schermo sempre acceso (dove il browser lo permette)
// ---------------------------------------------------------------------------

const awake = { want: false, lock: null };

async function acquireWakeLock() {
  if (!awake.want || awake.lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    awake.lock = await navigator.wakeLock.request('screen');
    awake.lock.addEventListener('release', () => { awake.lock = null; });
  } catch { /* non supportato o negato: pazienza */ }
}

/** Tiene lo schermo acceso finché serve (es. durante la votazione). */
export function keepAwake(on) {
  awake.want = Boolean(on);
  if (awake.want) acquireWakeLock();
  else if (awake.lock) { awake.lock.release().catch(() => {}); awake.lock = null; }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquireWakeLock(); });
}

// ---------------------------------------------------------------------------
// Aggiornamenti: se su GitHub c'è una versione nuova, si chiede di ricaricare
// ---------------------------------------------------------------------------

let versionTimer = null;
async function checkVersion() {
  try {
    const res = await fetch(`${versionUrl()}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (version && version !== APP_VERSION && !$('#updBanner')) {
      const el = document.createElement('div');
      el.id = 'updBanner';
      el.className = 'upd-banner';
      el.setAttribute('role', 'status');
      // Nell'app la versione nuova si installa scaricando l'APK aggiornata (il sito si aggiorna da solo).
      const apk = isApp() ? apkUrl() : '';
      if (isApp() && !apk) return;
      try { if (sessionStorage.getItem('gnr_upd_hide') === version) return; } catch { /* niente */ }
      el.innerHTML = (apk
        ? `<span>È uscita la versione ${esc(version)} dell'app.</span><a class="btn-sec btn-sec--sm" href="${esc(apk)}" target="_blank" rel="noopener">Scarica</a>`
        : `<span>È disponibile una nuova versione dell'app.</span><button type="button" class="btn-sec btn-sec--sm" data-upd>Aggiorna</button>`)
        + '<button type="button" class="upd-x" aria-label="Più tardi" title="Più tardi">✕</button>';
      el.querySelector('[data-upd]')?.addEventListener('click', () => location.reload());
      // "Più tardi": il pulsante non deve mai coprire i comandi (per esempio "Entra in partita").
      el.querySelector('.upd-x').addEventListener('click', () => { try { sessionStorage.setItem('gnr_upd_hide', version); } catch { /* niente */ } el.remove(); });
      document.body.appendChild(el);
    }
  } catch { /* offline: si riprova più tardi */ }
}

export function watchVersion() {
  if (versionTimer) return;
  checkVersion();
  versionTimer = setInterval(checkVersion, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
}

/** Registra il service worker: app installabile e pagine disponibili anche se la rete va e viene. */
export function registerSW() {
  // Nell'app i file sono già tutti nel telefono: il service worker non serve.
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !isApp()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Tema giorno / notte (per dispositivo: automatico segue il telefono o il PC)
// ---------------------------------------------------------------------------

const THEME_KEY = 'gnr_theme';
// La TV ha una scelta tutta sua (e di partenza il tema "Show": luci basse e neon da studio televisivo).
const onTV = () => typeof document !== 'undefined' && document.documentElement.classList.contains('tv');
const themeKey = () => (onTV() ? 'gnr_theme_tv' : THEME_KEY);
export function themeChoice() {
  let c = null;
  try { c = localStorage.getItem(themeKey()); } catch { /* niente */ }
  if (c === 'show' && !onTV()) c = 'night';
  return c || (onTV() ? 'show' : 'auto');
}
export function applyTheme(choice = themeChoice()) {
  try { localStorage.setItem(themeKey(), choice); } catch { /* niente */ }
  const show = choice === 'show' && onTV();
  const night = show || choice === 'night' || (choice === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = night ? 'night' : 'day';
  document.documentElement.classList.toggle('theme-show', show);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', show ? '#120A26' : night ? '#15112B' : '#FFF4DE');
  window.dispatchEvent(new CustomEvent('gnr-theme', { detail: choice }));
}
export const isShowTheme = () => typeof document !== 'undefined' && document.documentElement.classList.contains('theme-show');
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (themeChoice() === 'auto') applyTheme('auto'); });
}
export function themeSwitchHTML(id = 'themeSwitch') {
  const c = themeChoice();
  const opt = (v, label) => `<button type="button" data-theme-set="${v}" aria-pressed="${c === v}">${label}</button>`;
  return `<div class="seg" id="${id}" role="group" aria-label="Tema">${onTV() ? opt('show', 'Show') : ''}${opt('day', 'Giorno')}${opt('night', 'Notte')}${opt('auto', 'Automatico')}</div>`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    applyTheme(b.dataset.themeSet);
    b.parentElement.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
}

// ---------------------------------------------------------------------------
// Messaggio con "Annulla" (per le azioni che si possono sbagliare)
// ---------------------------------------------------------------------------

export function toastUndo(message, onUndo, ms = 9000) {
  document.querySelector('.undo-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'undo-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span></span><button type="button" class="btn-sec btn-sec--sm" data-undo>Annulla</button><button type="button" class="undo-x" aria-label="Chiudi l’avviso (non annulla niente)" title="Chiudi l’avviso">✕</button>`;
  el.querySelector('span').textContent = message;
  const timer = setTimeout(() => el.remove(), ms);
  el.querySelector('[data-undo]').addEventListener('click', () => {
    clearTimeout(timer);
    el.remove();
    onUndo();
  });
  // ✕ nasconde solo l'avviso: l'azione resta fatta.
  el.querySelector('.undo-x').addEventListener('click', () => { clearTimeout(timer); el.remove(); });
  document.body.appendChild(el);
}

// ---------------------------------------------------------------------------
// Batteria (solo dove il browser la espone, es. Chrome su Android)
// ---------------------------------------------------------------------------

export async function watchBattery() {
  if (!navigator.getBattery) return;
  try {
    const bat = await navigator.getBattery();
    let warned = 1;
    const check = () => {
      const low = !bat.charging && bat.level <= 0.15;
      document.documentElement.classList.toggle('save-power', low);
      if (low && bat.level < warned - 0.04) {
        warned = bat.level;
        toast(`Batteria al ${Math.round(bat.level * 100)}%: collega il caricatore. Le animazioni sono ridotte per risparmiare.`, 'warn');
      }
      if (bat.charging) warned = 1;
    };
    bat.addEventListener('levelchange', check);
    bat.addEventListener('chargingchange', check);
    check();
  } catch { /* non disponibile */ }
}

/** Foto ricordo: la più nitida possibile che stia sotto il limite di dimensione del database. */
export async function compressPhoto(file, limit = 190000, { edit = true } = {}) {
  if (edit) file = await editPhoto(file, 'free');
  let out = null;
  for (const max of [1100, 900, 720, 560]) {
    for (const q of [0.72, 0.6, 0.5]) {
      out = await compressImage(file, max, q);
      if (out.length < limit) return out;
    }
  }
  return out;
}

/** Foto quadrata 256×256 per il personaggio (selfie o galleria), sotto i 100 KB. */
export async function squarePhoto(file, { edit = true } = {}) {
  if (edit) file = await editPhoto(file, 'square');
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      let q = 0.82, out = c.toDataURL('image/jpeg', q);
      while (out.length > 100000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto non leggibile')); };
    img.src = url;
  });
}

/** Le serate aperte su questo dispositivo (per ritrovare il resoconto dalla home). */
export function rememberNight(room, info = {}) {
  try {
    const list = JSON.parse(localStorage.getItem('gnr_history') || '[]').filter((n) => n?.room !== room);
    list.unshift({ room, at: Date.now(), group: info.group || '', gid: info.gid || '' });
    localStorage.setItem('gnr_history', JSON.stringify(list.slice(0, 15)));
  } catch { /* niente */ }
}

// ---------------------------------------------------------------------------
// Votazione del prossimo gioco: uno o più voti a testa
// ---------------------------------------------------------------------------

/** Massimo di voti a testa nella votazione dei giochi (le regole del database lo impongono). */
export const POLL_MAX_VOTES = 3;
export const POLL_SLOTS = ['a', 'b', 'c'];

/** I giochi scelti da un telefono: un codice (un voto) oppure { a, b, c } (più voti). Senza doppioni. */
export function pollChoices(v, max = POLL_MAX_VOTES) {
  const list = typeof v === 'string' ? [v] : v && typeof v === 'object' ? POLL_SLOTS.map((k) => v[k]).filter((x) => typeof x === 'string') : [];
  return [...new Set(list)].slice(0, Math.max(1, Math.min(POLL_MAX_VOTES, Number(max) || 1)));
}

/** Valore da salvare per una lista di scelte: un codice se è una sola, altrimenti { a, b, c }. */
export function pollValue(list) {
  const l = [...new Set(list)].slice(0, POLL_MAX_VOTES);
  if (!l.length) return null;
  if (l.length === 1) return l[0];
  return Object.fromEntries(l.map((id, i) => [POLL_SLOTS[i], id]));
}

