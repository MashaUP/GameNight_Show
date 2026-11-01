// Assistente per le regole: ricerca nel manuale salvato sul dispositivo (2.1, idea 42).
//
// Cerca le parole nel PDF del manuale (quello salvato con "Salva il manuale su questo dispositivo") e mostra
// le pagine in cui compaiono, con un pezzo di testo intorno. Niente risposte inventate e niente intelligenza
// artificiale: solo il testo del manuale, con il numero di pagina per andare a controllare.
// Il lettore dei PDF (pdf.js, vendor/pdfjs) si carica solo quando si cerca la prima volta. Le foto del
// manuale (JPEG/PNG) non hanno testo: si dice chiaramente.
import { esc } from './util.js';
import { t } from './i18n.js';

const cache = new Map(); // chiave del manuale → [{ page, text }]
let pdfjs = null;

async function lib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

/** Testo di ogni pagina (al massimo 400 pagine). */
export async function pdfPages(blob, key = '') {
  if (key && cache.has(key)) return cache.get(key);
  const { getDocument } = await lib();
  const doc = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 400); i++) {
    const p = await doc.getPage(i);
    const c = await p.getTextContent();
    pages.push({ page: i, text: c.items.map((x) => x.str || '').join(' ').replace(/\s+/g, ' ').trim() });
  }
  doc.destroy?.();
  if (key) cache.set(key, pages);
  return pages;
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Pagine con tutte le parole cercate (in qualsiasi ordine), dalla più pertinente: [{ page, hits, snippet }].
 * Lo snippet è il testo intorno alla prima parola trovata (circa 180 caratteri).
 */
export function searchPages(pages, query, max = 12) {
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 2).slice(0, 6);
  if (!words.length) return [];
  const out = [];
  for (const p of pages || []) {
    const f = fold(p.text);
    if (!words.every((w) => f.includes(w))) continue;
    const hits = words.reduce((a, w) => a + f.split(w).length - 1, 0);
    const i = f.indexOf(words[0]);
    const from = Math.max(0, i - 80);
    const snippet = `${from > 0 ? '…' : ''}${p.text.slice(from, from + 180).trim()}${from + 180 < p.text.length ? '…' : ''}`;
    out.push({ page: p.page, hits, snippet });
  }
  return out.sort((a, b) => b.hits - a.hits || a.page - b.page).slice(0, max);
}

/** Evidenzia le parole cercate nello snippet (già sicuro: esc prima, <mark> dopo). */
export function highlight(snippet, query) {
  let h = esc(snippet);
  // Le lettere accentate valgono come quelle senza accento (parita trova "parità")
  const V = { a: '[aàáâäã]', e: '[eèéêë]', i: '[iìíîï]', o: '[oòóôöõ]', u: '[uùúûü]', c: '[cç]', n: '[nñ]' }; // i18n-ok: lettere, non testi
  for (const w of fold(query).split(/[^a-z0-9]+/).filter((x) => x.length >= 2).slice(0, 6)) {
    // (?<!&[a-z#0-9]*): mai dentro un'entità già scritta da esc (&lt; &amp; …)
    h = h.replace(new RegExp(`(?<!&[a-z#0-9]*)(${[...w].map((ch) => V[ch] || ch).join('')})`, 'gi'), '<mark>$1</mark>');
  }
  return h;
}

export function searchBoxHTML() {
  return `<form class="nb-form ms-form" data-msform><label class="sr-only" for="msQ">${esc(t('ms.label'))}</label><input class="input input--sm" id="msQ" type="search" maxlength="60" placeholder="${esc(t('ms.ph'))}"><button type="submit" class="btn-sec btn-sec--sm">🔎 ${esc(t('ms.go'))}</button></form><div class="ms-res" aria-live="polite"></div>`;
}
