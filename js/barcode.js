// Codice a barre della scatola (1.11, richiesta 84).
//
// BoardGameGeek non ha una ricerca per codice a barre: la sua API (XML API2) cerca solo per nome e
// legge le schede per numero. Quindi il codice serve a tre cose:
// 1. ritrovare subito un gioco già nell'armadio (campo "ean" della scheda);
// 2. ricordare, su questo dispositivo, a quale scheda di BGG corrisponde un codice già confermato
//    (cache locale "gnr_ean_map": la seconda scatola uguale, anche in un altro armadio, non chiede niente);
// 3. altrimenti si cerca per nome su BGG e si conferma la scheda giusta (edizioni e ristampe hanno codici
//    diversi: niente abbinamenti automatici senza conferma).
// La fotocamera usa BarcodeDetector del browser (Chrome e Android); dove non c'è si scrivono le cifre.
import { esc, toast, buzz } from './util.js';
import { t } from './i18n.js';

export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const MAP_KEY = 'gnr_ean_map';
const MAP_MAX = 300;

export function barcodeSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Solo cifre, senza spazi. */
export const cleanBarcode = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * Codice valido? EAN-8, UPC-A (12), EAN-13 e GTIN-14 con la cifra di controllo giusta.
 * I rari UPC-E (compressi, 8 cifre) hanno la cifra di controllo calcolata sul codice esteso: possono non passare
 * il controllo come EAN-8; in quel caso si scrive a mano il codice UPC-A (12 cifre) stampato sotto.
 */
export function validBarcode(v) {
  const c = cleanBarcode(v);
  if (![8, 12, 13, 14].includes(c.length)) return false;
  const digits = [...c].map(Number);
  const check = digits.pop();
  let sum = 0;
  // Da destra: pesi 3, 1, 3, 1…
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** UPC-A (12 cifre) e EAN-13 con lo 0 davanti sono lo stesso prodotto: una sola chiave. */
export const barcodeKey = (v) => { const c = cleanBarcode(v); return c.length === 12 ? `0${c}` : c; };

/** Cache locale codice → scheda di BoardGameGeek già confermata. */
export const BarcodeMap = {
  all() {
    try { const m = JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
  },
  get(code) {
    const e = this.all()[barcodeKey(code)];
    return e && Number.isInteger(e.bgg) && e.bgg > 0 ? e : null;
  },
  set(code, { bgg, name }) {
    const k = barcodeKey(code);
    const id = Number(bgg);
    if (!validBarcode(k) || !Number.isInteger(id) || id <= 0) return;
    const m = this.all();
    m[k] = { bgg: id, name: String(name || '').slice(0, 60), at: Date.now() };
    const keys = Object.keys(m).sort((a, b) => (m[b].at || 0) - (m[a].at || 0));
    for (const old of keys.slice(MAP_MAX)) delete m[old];
    try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* memoria piena: pazienza */ }
  },
  clear() { try { localStorage.removeItem(MAP_KEY); } catch { /* niente */ } }
};

/**
 * Finestra con la fotocamera (o le cifre scritte a mano). Restituisce il codice letto, o null se si chiude.
 * Solo codici con la cifra di controllo giusta: una lettura sbagliata non porta a una scheda sbagliata.
 */
export function scanBarcode({ title = t('bar.title'), hint = t('bar.hint') } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet bar-overlay';
    const cam = barcodeSupported();
    el.innerHTML = `
      <div class="card sheet scan-sheet" role="dialog" aria-modal="true" aria-labelledby="barTitle">
        <div class="panel-head"><h2 id="barTitle">📷 ${esc(title)}</h2><button type="button" class="icon-btn" data-bar-close aria-label="${esc(t('common.close'))}">✕</button></div>
        ${cam ? `<div class="scan-view"><video id="barVideo" playsinline muted></video><i class="scan-line" aria-hidden="true"></i></div><p class="muted small" id="barHint">${esc(hint)}</p>`
          : `<p class="muted small">${esc(t('bar.noCamera'))}</p>`}
        <form class="profile-code-row" id="barForm"><label class="sr-only" for="barManual">${esc(t('bar.manual'))}</label>
          <input class="input" id="barManual" inputmode="numeric" maxlength="14" placeholder="${esc(t('bar.manualPh'))}" autocomplete="off">
          <button type="submit" class="btn-sec">${esc(t('bar.use'))}</button></form>
        <p class="form-error" id="barErr" aria-live="polite"></p>
      </div>`;
    document.body.appendChild(el);
    let stream = null;
    let timer = null;
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      el.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(code);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); finish(null); } };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-bar-close]')) finish(null); });
    const inp = el.querySelector('#barManual');
    inp.addEventListener('input', () => { inp.value = cleanBarcode(inp.value); });
    el.querySelector('#barForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = cleanBarcode(inp.value);
      if (!validBarcode(c)) { el.querySelector('#barErr').textContent = t('bar.invalid'); return; }
      finish(c);
    });
    if (!cam) { inp.focus(); return; }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        const v = el.querySelector('#barVideo');
        v.srcObject = stream;
        await v.play().catch(() => {});
        // eslint-disable-next-line no-undef
        const det = new BarcodeDetector({ formats: BARCODE_FORMATS });
        timer = setInterval(async () => {
          if (done || !v.videoWidth) return;
          try {
            const codes = await det.detect(v);
            const c = codes.map((x) => cleanBarcode(x.rawValue)).find((x) => validBarcode(x));
            if (c) { buzz([30, 40, 30]); finish(c); }
          } catch { /* fotogramma non leggibile: si riprova */ }
        }, 350);
      } catch {
        const h = el.querySelector('#barHint');
        if (h) h.textContent = t('bar.cameraDenied');
        toast(t('bar.cameraDenied'), 'warn');
      }
    })();
  });
}
