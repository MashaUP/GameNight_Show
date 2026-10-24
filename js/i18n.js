// Lingue dell'interfaccia (italiano e inglese), senza dipendenze.
//
//   t('home.join.title')                 testo nella lingua scelta
//   t('home.arm.count', { n: 3 })        con parametri {n}; se il testo ha le forme one/other sceglie il plurale giusto
//   fmtDate(d, { day: 'numeric' })       date e numeri con Intl nella lingua scelta
//   setLang('en')                        cambia lingua su questo dispositivo
//
// La scelta vale per dispositivo (localStorage "gnr_lang"). Alla prima apertura si usa la lingua
// del dispositivo; se non è tra quelle disponibili, l'italiano. I dati salvati nel database restano
// neutri (codici), quindi TV e telefoni possono avere lingue diverse nella stessa serata.
// I dizionari stanno in js/lang/it.js e js/lang/en.js con le stesse chiavi (tests/check.mjs lo verifica).

export const LANGS = { it: 'Italiano', en: 'English' };
export const DEFAULT_LANG = 'it';
const KEY = 'gnr_lang';
const LOCALES = { it: 'it-IT', en: 'en-GB' };

function stored() {
  try { const v = localStorage.getItem(KEY); return v && LANGS[v] ? v : null; } catch { return null; }
}
/** Lingua del dispositivo, se disponibile ("en-US" → "en"), altrimenti l'italiano. */
export function deviceLang() {
  const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of list) {
    const k = String(l || '').slice(0, 2).toLowerCase();
    if (LANGS[k]) return k;
  }
  return DEFAULT_LANG;
}

let current = stored() || deviceLang();
let dict = {};
let fallback = null;

async function load(l) {
  try { return (await import(`./lang/${l}.js`)).default || {}; } catch (err) { console.error('Lingua non caricata', l, err); return {}; }
}
dict = await load(current);
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = current;

/** Lingua scelta adesso ("it" o "en"). */
export const lang = () => current;
/** Locale per Intl ("it-IT", "en-GB"). */
export const locale = () => LOCALES[current] || 'it-IT';
/** La scelta è stata fatta dall'utente (e non presa dal dispositivo)? */
export const langChosen = () => Boolean(stored());

const plurals = {};
function pluralForm(n) {
  const p = plurals[current] ||= new Intl.PluralRules(locale());
  return p.select(Number(n) || 0);
}

function pick(entry, params) {
  if (entry && typeof entry === 'object') {
    const n = params?.n ?? params?.count ?? 0;
    return entry[Number(n) === 0 && entry.zero !== undefined ? 'zero' : pluralForm(n)] ?? entry.other ?? '';
  }
  return entry;
}

/**
 * Testo tradotto. I parametri sostituiscono {nome}; i numeri vengono formattati nella lingua scelta
 * (passare una stringa per lasciarli come sono, es. codici).
 * Se la chiave manca: il testo di riserva in italiano (se caricato) o la chiave stessa, così si vede subito.
 */
export function t(key, params) {
  let s = pick(dict[key], params);
  if (s === undefined || s === null) {
    if (fallback && fallback[key] !== undefined) s = pick(fallback[key], params);
    else {
      if (!fallback && current !== DEFAULT_LANG) load(DEFAULT_LANG).then((d) => { fallback = d; });
      warnMissing(key);
      return key;
    }
  }
  if (!params) return s;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in params)) return m;
    const v = params[k];
    return typeof v === 'number' ? fmtNum(v) : String(v ?? '');
  });
}
/** C'è un testo per questa chiave? (per i testi facoltativi) */
export const has = (key) => dict[key] !== undefined;

const missing = new Set();
function warnMissing(key) {
  if (missing.has(key)) return;
  missing.add(key);
  console.warn(`[i18n] testo mancante: ${key} (${current})`);
}

/** Numero nella lingua scelta (1,5 in italiano, 1.5 in inglese). */
export function fmtNum(n, digits) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '–';
  const o = digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return new Intl.NumberFormat(locale(), o).format(Number(n));
}
/** Data/ora nella lingua scelta (opzioni di Intl.DateTimeFormat). */
export function fmtDate(d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '–';
  return new Intl.DateTimeFormat(locale(), opts).format(x);
}
/** Elenco "a, b e c" / "a, b and c". */
export function fmtList(items) {
  const l = (items || []).map(String);
  try { return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(l); } catch { return l.join(', '); }
}

/**
 * Cambia la lingua di questo dispositivo. Le pagine che sanno ridisegnarsi ascoltano
 * l'evento "gnr-lang"; le altre si ricaricano (i dati della serata sono nel database e nel dispositivo).
 */
export async function setLang(l, { reload = true } = {}) {
  if (!LANGS[l]) return;
  try { localStorage.setItem(KEY, l); } catch { /* niente */ }
  if (l === current) return;
  const next = await load(l);
  current = l;
  dict = next;
  fallback = null;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    applyStatic(document);
  }
  const ev = new CustomEvent('gnr-lang', { detail: l, cancelable: true });
  const handled = typeof window !== 'undefined' && !window.dispatchEvent(ev);
  // Nessuna pagina ha detto "ci penso io" (preventDefault): si ricarica.
  if (reload && !handled && typeof location !== 'undefined') location.reload();
}

/**
 * Traduce gli elementi scritti direttamente nell'HTML:
 *   data-i18n="chiave"                         testo
 *   data-i18n-html="chiave"                    testo con markup sicuro scritto nel dizionario
 *   data-i18n-attr="aria-label:chiave;title:chiave2"
 */
export function applyStatic(root = document) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
  const tk = root.querySelector?.('meta[name="gnr-title"]')?.content;
  if (tk) document.title = t(tk);
}
if (typeof document !== 'undefined' && document.readyState !== 'loading') applyStatic(document);
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => applyStatic(document));

/** Pulsante piccolo per passare all'altra lingua (pagine senza impostazioni: download, resoconto, verifica). */
export function langToggleHTML(cls = 'ph-home') {
  const other = current === 'en' ? 'it' : 'en';
  return `<button type="button" class="${cls}" data-lang-set="${other}" lang="${other}" title="${LANGS[other]}" aria-label="${LANGS[other]}">${other.toUpperCase()}</button>`;
}

/** Selettore "Lingua: Italiano / English" (stesso aspetto del selettore del tema). */
export function langSwitchHTML(id = 'langSwitch') {
  const opt = (v) => `<button type="button" data-lang-set="${v}" aria-pressed="${current === v}" lang="${v}">${LANGS[v]}</button>`;
  return `<div class="seg" id="${id}" role="group" aria-label="${t('common.language')}">${Object.keys(LANGS).map(opt).join('')}</div>`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-lang-set]');
    if (!b) return;
    b.parentElement.querySelectorAll('[data-lang-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    setLang(b.dataset.langSet);
  });
}
