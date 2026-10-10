// App Android (Capacitor): le poche cose che cambiano rispetto al sito aperto nel browser.
// Nel browser questo modulo non fa niente: isApp() è falso e tutto resta com'era.
import { SITE_URL, APK_URL } from './site.js';

/** Vero quando la pagina gira dentro l'app Android. */
export function isApp() {
  try { return Boolean(window.Capacitor?.isNativePlatform?.()); } catch { return false; }
}
export const isAndroid = () => /Android/i.test(navigator.userAgent || '');

/**
 * Indirizzo pubblico di una pagina, per i QR e i link da mandare agli altri.
 * Nell'app le pagine stanno su https://localhost, che sugli altri telefoni non esiste:
 * si usa quindi l'indirizzo del sito su GitHub Pages.
 */
export function publicUrl(page) {
  return new URL(page, isApp() && SITE_URL ? SITE_URL : location.href);
}

/** File version.json da controllare per sapere se c'è un aggiornamento. */
export function versionUrl() {
  return isApp() && SITE_URL ? `${SITE_URL}version.json` : 'version.json';
}

/** Dove scaricare l'ultima APK (vuoto se non si sa: sito non su GitHub Pages). */
export function apkUrl() {
  if (APK_URL) return APK_URL;
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname || '');
  if (!m) return '';
  const repo = location.pathname.split('/').filter(Boolean)[0];
  if (!repo || /\.html?$/i.test(repo)) return '';
  return `https://github.com/${m[1]}/${repo}/releases/download/app-android/GameNight-Show.apk`;
}

// ---------------------------------------------------------------------------
// Chiamate ai plugin nativi (Filesystem, Share, SystemBars)
// ---------------------------------------------------------------------------

export function nativeCall(plugin, method, opts = {}) {
  const cap = window.Capacitor;
  if (typeof cap?.nativePromise === 'function') return cap.nativePromise(plugin, method, opts);
  const p = cap?.Plugins?.[plugin];
  if (p && typeof p[method] === 'function') return p[method](opts);
  return Promise.reject(new Error(`${plugin}.${method} non disponibile`));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error || new Error('lettura non riuscita'));
    r.readAsDataURL(blob);
  });
}

const safeName = (n) => String(n || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file';
const cancelled = (err) => /cancel|annull|dismiss/i.test(String(err?.message || err || ''));

/** Apre il pannello "Condividi" di Android con il file. */
async function shareFile(data, name, title, text) {
  const { uri } = await nativeCall('Filesystem', 'writeFile', { path: `condivisi/${name}`, data, directory: 'CACHE', recursive: true });
  try {
    await nativeCall('Share', 'share', { title: title || 'GameNight Show', text: text || undefined, files: [uri], dialogTitle: title || 'Condividi' });
    return 'shared';
  } catch (err) {
    if (cancelled(err)) return 'cancelled';
    throw err;
  }
}

/**
 * Salva o condivide un file dall'app.
 * mode 'save': lo mette in Documenti/GameNight Show (se non si può, apre "Condividi").
 * mode 'share': apre subito "Condividi" (WhatsApp, Drive, Gmail…).
 * Restituisce { result: 'saved' | 'shared' | 'cancelled', where }.
 */
export async function nativeFile(blob, filename, { mode = 'save', title = '', text = '' } = {}) {
  const name = safeName(filename);
  const data = await blobToBase64(blob);
  if (mode === 'save') {
    try {
      await nativeCall('Filesystem', 'writeFile', { path: `GameNight Show/${name}`, data, directory: 'DOCUMENTS', recursive: true });
      return { result: 'saved', where: `Documenti/GameNight Show/${name}` };
    } catch { /* cartella non scrivibile su questo telefono: si passa a "Condividi" */ }
  }
  return { result: await shareFile(data, name, title, text), where: '' };
}

// ---------------------------------------------------------------------------
// Link esterni, barra di stato
// ---------------------------------------------------------------------------

/** Nell'app i link "in una nuova scheda" si aprono nel browser (siti esterni) o nella stessa finestra (pagine dell'app). */
function bindLinks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[target="_blank"][href]');
    if (!a || e.defaultPrevented) return;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol)) return;
    e.preventDefault();
    // Una navigazione verso un altro sito viene passata da Android al browser.
    location.href = url.href;
  });
}

/** Colore delle icone della barra di stato in base al tema (chiaro o scuro). */
function bindStatusBar() {
  let last = '';
  const sync = () => {
    const bg = getComputedStyle(document.body || document.documentElement).backgroundColor || '';
    const m = bg.match(/\d+(\.\d+)?/g);
    if (!m) return;
    const [r, g, b] = m.map(Number);
    const style = (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? 'DARK' : 'LIGHT';
    if (style === last) return;
    last = style;
    nativeCall('SystemBars', 'setStyle', { style }).catch(() => {});
  };
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(sync, 60); };
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later, { once: true });
  else later();
}

// ---------------------------------------------------------------------------
// Tasto "Indietro" di Android: prima chiude la finestra aperta, poi chiede alla pagina
// (evento "gnr:back", che la pagina può gestire con preventDefault), infine torna alla home.
// Dalla home riduce l'app a icona invece di chiuderla.
// ---------------------------------------------------------------------------

const OVERLAYS = '.overlay, .dock-sheet:not([hidden]), .tour-pop, .stale-banner';
function topOverlay() {
  const list = [...document.querySelectorAll(OVERLAYS)].filter((el) => el.isConnected && el.getClientRects().length && !el.classList.contains('stale-banner'));
  return list[list.length - 1] || null;
}
function closeOverlay(el) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  setTimeout(() => {
    if (!el.isConnected || !el.getClientRects().length) return;
    const btn = el.querySelector('[data-close], [data-sheetclose], .sheet-x, [aria-label^="Chiudi"], [id$="Close"], .tour-skip');
    if (btn) { btn.click(); return; }
    // Ultima possibilità: un tocco sullo sfondo (quasi tutte le finestre si chiudono così).
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, 80);
}
/** Gestisce il tasto Indietro come lo farebbe l'utente con i pulsanti a schermo. */
export function handleBack() {
  const ov = topOverlay();
  if (ov) { closeOverlay(ov); return 'overlay'; }
  const ev = new CustomEvent('gnr:back', { cancelable: true });
  window.dispatchEvent(ev);
  if (ev.defaultPrevented) return 'page';
  const page = location.pathname.split('/').pop() || 'index.html';
  if (page !== 'index.html') { location.href = 'index.html'; return 'home'; }
  nativeCall('App', 'minimizeApp').catch(() => nativeCall('App', 'exitApp').catch(() => {}));
  return 'minimize';
}
function bindBackButton() {
  const cap = window.Capacitor;
  if (typeof cap?.addListener !== 'function' || !cap.isPluginAvailable?.('App')) return;
  try { cap.addListener('App', 'backButton', () => handleBack()); } catch { /* plugin assente: comportamento di Android */ }
}

if (isApp()) {
  document.documentElement.classList.add('in-app');
  bindLinks();
  bindStatusBar();
  bindBackButton();
}

// ---------------------------------------------------------------------------
// Lettore di QR (per entrare in una serata dall'app: la fotocamera del telefono aprirebbe il browser)
// ---------------------------------------------------------------------------

export const canScanQR = () => Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Apre la fotocamera e restituisce il testo del primo QR letto (null se si chiude).
 * Usa il lettore del telefono se c'è, altrimenti jsQR (caricato solo in quel momento).
 */
export function scanQR({ title = '📷 Inquadra il QR della TV', hint = 'Tieni il telefono fermo davanti al QR che si vede sulla TV.' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet';
    el.innerHTML = `
      <div class="card sheet scan-sheet" role="dialog" aria-modal="true" aria-labelledby="qrScTitle">
        <h2 id="qrScTitle"></h2>
        <div class="scan-view scan-view--qr"><video playsinline muted></video><i class="scan-frame" aria-hidden="true"></i></div>
        <p class="muted small" data-hint></p>
        <button type="button" class="btn-sec btn-block" data-close>Chiudi</button>
      </div>`;
    el.querySelector('#qrScTitle').textContent = title;
    el.querySelector('[data-hint]').textContent = hint;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    let stream = null; let timer = null; let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      el.remove();
      resolve(val);
    };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) finish(null); });
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); finish(null); } });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        let detect;
        let native = null;
        try {
          if ('BarcodeDetector' in window) {
            const fmts = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []) || [];
            // eslint-disable-next-line no-undef
            if (!fmts.length || fmts.includes('qr_code')) native = new BarcodeDetector({ formats: ['qr_code'] });
          }
        } catch { native = null; }
        if (native) {
          detect = async () => (await native.detect(video)).find((c) => c.rawValue)?.rawValue || null;
        } else {
          const jsQR = (await import('../vendor/jsqr.js')).default;
          const cv = document.createElement('canvas');
          const cx = cv.getContext('2d', { willReadFrequently: true });
          detect = async () => {
            const w = video.videoWidth; const h = video.videoHeight;
            if (!w || !h) return null;
            const k = Math.min(1, 640 / Math.max(w, h));
            cv.width = Math.round(w * k); cv.height = Math.round(h * k);
            cx.drawImage(video, 0, 0, cv.width, cv.height);
            const img = cx.getImageData(0, 0, cv.width, cv.height);
            return jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || null;
          };
        }
        let busy = false;
        timer = setInterval(async () => {
          if (busy || done || !video.videoWidth) return;
          busy = true;
          try { const v = await detect(); if (v) { try { navigator.vibrate?.(40); } catch { /* niente */ } finish(v); } } catch { /* fotogramma non leggibile */ }
          busy = false;
        }, 300);
      } catch {
        const h = el.querySelector('[data-hint]');
        if (h) h.textContent = 'Non riesco ad aprire la fotocamera: controlla il permesso nelle impostazioni del telefono, oppure scrivi il codice a mano.';
        el.querySelector('.scan-view')?.remove();
      }
    })();
  });
}

/**
 * Trasforma il testo di un QR di GameNight Show in una pagina dell'app.
 * Accetta il QR della stanza (play.html?room=…), del profilo, del passaggio di regia (host.html#regia=…)
 * oppure un codice di 4 caratteri. Restituisce l'indirizzo relativo o null se non è un nostro QR.
 */
export function routeFromQR(text) {
  const raw = String(text || '').trim();
  if (/^[A-Za-z0-9]{4}$/.test(raw)) return `play.html?room=${raw.toUpperCase()}`;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const page = u.pathname.split('/').pop() || 'index.html';
  const keep = (names) => {
    const out = new URLSearchParams();
    for (const n of names) { const v = u.searchParams.get(n); if (v && /^[\w-]{1,40}$/.test(v)) out.set(n, v); }
    return out.toString();
  };
  if (page === 'play.html') { const q = keep(['room', 'profilo']); return q ? `play.html?${q}` : null; }
  if (page === 'host.html') {
    const q = keep(['room']);
    const h = /^#?[\w=&-]{1,200}$/.test(u.hash) ? u.hash : '';
    return q ? `host.html?${q}${h}` : null;
  }
  if (page === 'index.html' || page === '') {
    const m = /^#collega=([A-Za-z0-9]{6}-[A-Za-z0-9]{8})$/.exec(u.hash);
    return m ? `index.html#collega=${m[1]}` : null;
  }
  if (page === 'armadio.html') {
    const q = new URLSearchParams(keep(['a', 'p', 'g', 'add']));
    const pos = u.searchParams.get('pos');
    if (pos && pos.length <= 120 && !/[<>"\u0000-\u001f]/.test(pos)) q.set('pos', pos);
    const h = /^#?(ak|inv)=[\w-]{1,20}$/.test(u.hash) ? u.hash : '';
    return q.get('a') || q.get('p') ? `armadio.html?${q.toString()}${h}` : null;
  }
  if (page === 'ludoteca.html') {
    const q = keep(['a', 'g', 'add']);
    const h = /^#?(ak|gk)=[\w-]{1,20}$/.test(u.hash) ? u.hash : '';
    return q ? `ludoteca.html?${q}${h}` : null;
  }
  return null;
}
