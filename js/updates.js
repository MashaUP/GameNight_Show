// Versioni, aggiornamenti e installazione dell'app Android.
//
// Come è fatto GameNight Show: il sito (GitHub Pages) e l'app Android (Capacitor) sono lo stesso codice.
// - Nel browser il sito si aggiorna da solo: basta ricaricare (avviso "Aggiorna" in util.js).
// - L'app Android ha le pagine DENTRO l'APK: per avere le novità bisogna installare l'APK nuova.
//
// Fonte unica delle informazioni (niente server in più):
// - version.json del sito: versione, data, novità, Android minimo (scritto a ogni rilascio);
// - l'ultima release pubblicata a mano su GitHub (tag vX.Y.Z), letta con l'API pubblica
//   (releases/latest, gratuita, senza chiavi). Il workflow ci aggiunge solo i file, senza modificarla:
//   GameNight-Show.apk con l'etichetta "GameNight Show X.Y.Z · build N"; l'impronta SHA-256 la calcola
//   GitHub stesso (campo "digest" del file). Versione dal tag, novità da version.json.
//   Indirizzo stabile dell'APK: https://github.com/<utente>/<repo>/releases/latest/download/GameNight-Show.apk
// - Compatibilità: le release scritte dai workflow fino alla 1.4 (release "app-android", dati nella
//   descrizione <!-- gamenight-apk: {...} -->) vengono ancora lette.
import { APP_VERSION } from './version.js';
import { t, lang, fmtDate, fmtNum } from './i18n.js';
import { isApp, isAndroid, apkUrl, publicUrl, versionUrl, nativeCall } from './native.js';

const CACHE_KEY = 'gnr_release';
const SEEN_KEY = 'gnr_upd_seen';
const TTL = 6 * 3600e3; // controllo automatico al massimo ogni 6 ore (l'API di GitHub ne concede 60 l'ora)
const APK_NAME = 'GameNight-Show.apk';
const LOCAL_APK = 'GameNight-Show-aggiornamento.apk';
export const MIN_ANDROID = '7.0';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } }
};

// ---------------------------------------------------------------------------
// Versioni
// ---------------------------------------------------------------------------

const SEMVER = /^v?(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?(?:-([0-9A-Za-z.-]{1,30}))?$/;
/** Versione valida ("1.2", "1.2.0", "1.3.0-beta.1")? */
export function isVersion(v) { return typeof v === 'string' && SEMVER.test(v.trim()); }
/**
 * Confronto semantico: -1, 0, 1 (null se una delle due non è una versione).
 * 1.10.0 > 1.9.0; 1.2 = 1.2.0; 1.3.0-beta < 1.3.0.
 */
export function semverCmp(a, b) {
  const pa = SEMVER.exec(String(a ?? '').trim()); const pb = SEMVER.exec(String(b ?? '').trim());
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const x = Number(pa[i] || 0); const y = Number(pb[i] || 0);
    if (x !== y) return x > y ? 1 : -1;
  }
  const ra = pa[4] || ''; const rb = pb[4] || '';
  if (ra === rb) return 0;
  if (!ra) return 1;
  if (!rb) return -1;
  const sa = ra.split('.'); const sb = rb.split('.');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    const na = /^\d+$/.test(sa[i]); const nb = /^\d+$/.test(sb[i]);
    if (na && nb && Number(sa[i]) !== Number(sb[i])) return Number(sa[i]) > Number(sb[i]) ? 1 : -1;
    if (na !== nb) return na ? -1 : 1;
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Repository GitHub della release ufficiale, ricavato dall'indirizzo ufficiale dell'APK (mai inventato).
 * Accetta l'indirizzo stabile (releases/latest/download/…) e quello dei workflow fino alla 1.4 (download/app-android/…).
 */
export function releaseSource(url = apkUrl()) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/releases\/(?:latest\/download|download\/app-android)\/GameNight-Show\.apk$/.exec(url || '');
  if (!m) return null;
  const base = `https://github.com/${m[1]}/${m[2]}`;
  return {
    owner: m[1], repo: m[2],
    apk: `${base}/releases/latest/download/GameNight-Show.apk`,
    api: `https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`,
    page: `${base}/releases/latest`
  };
}

/**
 * Il file è l'APK di una release del repository ufficiale? Restituisce il tag (es. "v1.5.0") oppure ''.
 * Utente e repository senza distinguere maiuscole e minuscole (il sito li vede in minuscolo, GitHub come sono).
 */
export function officialAssetTag(url, src = releaseSource()) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/releases\/download\/([A-Za-z0-9._-]{1,100})\/GameNight-Show\.apk$/.exec(url || '');
  if (!m || !src) return '';
  return m[1].toLowerCase() === src.owner.toLowerCase() && m[2].toLowerCase() === src.repo.toLowerCase() ? m[3] : '';
}
/** Stesso indirizzo dell'APK ufficiale (https, senza distinguere maiuscole e minuscole). */
export function sameUrl(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^https:\/\//.test(a) && a.toLowerCase() === b.toLowerCase();
}
/** Pagina ufficiale di download (sul sito): stabile, è quella del QR. */
export function downloadPageUrl() { return publicUrl('scarica.html').href; }

const cleanList = (n) => (Array.isArray(n) ? n : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 12).map((x) => x.trim().slice(0, 240));
/**
 * Novità nella lingua scelta. Formati accettati (version.json e dati della build):
 *   notes: [...]  (italiano, formato fino alla 1.3) con eventuale notesEn: [...]
 *   notes: { it: [...], en: [...] }
 * Se manca la lingua scelta si usa l'italiano.
 */
export function pickNotes(src) {
  const n = src?.notes;
  const byLang = n && typeof n === 'object' && !Array.isArray(n) ? n : { it: n, en: src?.notesEn };
  const mine = cleanList(byLang[lang()]);
  return mine.length ? mine : cleanList(byLang.it);
}
const cleanNotes = (src) => pickNotes(src);
const cleanDate = (d) => (typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? d : '');

/** version.json: solo campi controllati. */
export function parseWebVersion(v) {
  if (!v || typeof v !== 'object' || !isVersion(v.version)) return null;
  return { version: v.version.trim(), date: cleanDate(v.date), notes: cleanNotes(v), minAndroid: isVersion(v.minAndroid) ? v.minAndroid : MIN_ANDROID };
}

/**
 * Risposta dell'API di GitHub (ultima release) → dati della build, controllati uno per uno.
 * Restituisce null se manca l'APK ufficiale (release senza APK, di un altro repository, bozza o anteprima).
 * Versione: dai dati della build se ci sono (workflow fino alla 1.4), altrimenti dal tag (v1.5.0) o dal titolo.
 * Impronta: dai dati della build oppure dal "digest" calcolato da GitHub; se manca, si verifica solo la dimensione.
 */
export function parseRelease(json, officialApk = apkUrl()) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.assets) || json.draft === true || json.prerelease === true) return null;
  const src = releaseSource(officialApk);
  const asset = json.assets.find((a) => a && a.name === APK_NAME);
  const tag = asset ? officialAssetTag(asset.browser_download_url, src) : '';
  // Il file deve stare nella release stessa (stesso tag), nel repository ufficiale.
  if (!tag || (typeof json.tag_name === 'string' && json.tag_name !== tag)) return null;
  const size = Number.isInteger(asset.size) && asset.size > 0 ? asset.size : 0;
  let meta = {};
  const m = /<!--\s*gamenight-apk:\s*(\{[\s\S]*?\})\s*-->/.exec(String(json.body || ''));
  if (m) { try { meta = JSON.parse(m[1]) || {}; } catch { meta = {}; } }
  const fromTag = (/^v?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)$/.exec(tag) || [])[1];
  const fromTitle = (/(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)/.exec(String(json.name || '')) || [])[1];
  const version = [meta.version, fromTag, fromTitle].find(isVersion) || '';
  if (!version) return null;
  const digest = (/^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest || '')) || [])[1] || '';
  const sha = typeof meta.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(meta.sha256) ? meta.sha256.toLowerCase() : digest.toLowerCase();
  const metaSize = Number.isInteger(meta.size) && meta.size > 0 ? meta.size : 0;
  const labelCode = Number((/build\s+(\d{1,9})\b/i.exec(String(asset.label || '')) || [])[1]);
  const code = Number.isInteger(meta.versionCode) && meta.versionCode > 0 ? meta.versionCode : (labelCode > 0 ? labelCode : null);
  return {
    version,
    versionCode: code,
    url: asset.browser_download_url,
    size: size || metaSize,
    // Dimensione dei dati della build diversa da quella del file: l'APK è cambiata dopo (build in corso)
    sizeMismatch: Boolean(size && metaSize && size !== metaSize),
    sha256: sha,
    date: cleanDate(meta.date) || cleanDate(asset.updated_at) || cleanDate(json.published_at),
    notes: cleanNotes(meta),
    minAndroid: isVersion(meta.minAndroid) ? meta.minAndroid : MIN_ANDROID
  };
}

async function fetchJSON(url, ms = 9000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl?.signal, headers: url.startsWith('https://api.github.com/') ? { Accept: 'application/vnd.github+json' } : undefined });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.kind = res.status === 404 ? 'missing' : (res.status === 403 || res.status === 429 ? 'limit' : 'http'); throw e; }
    try { return await res.json(); } catch { const e = new Error('dati non validi'); e.kind = 'invalid'; throw e; } // i18n-ok
  } catch (err) {
    if (!err.kind) err.kind = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'network';
    throw err;
  } finally { clearTimeout(t); }
}

/** Versione del sito pubblicato (version.json). */
export async function getWebVersion() {
  const v = parseWebVersion(await fetchJSON(`${versionUrl()}?t=${Date.now()}`));
  if (!v) { const e = new Error('version.json non valido'); e.kind = 'invalid'; throw e; } // i18n-ok
  return v;
}

/**
 * Ultima APK pubblicata. Con force=false usa la copia degli ultimi 6 ore (niente richieste inutili).
 * Restituisce { release, at, cached, error } senza mai lanciare eccezioni.
 */
export async function getRelease({ force = false } = {}) {
  const src = releaseSource();
  if (!src) return { release: null, error: 'noconfig' };
  const c = ls.get(CACHE_KEY);
  const fresh = c && c.api === src.api && Date.now() - c.at < TTL && c.release;
  if (fresh && !force) return { release: c.release, at: c.at, cached: true };
  try {
    const json = await fetchJSON(src.api);
    const rel = parseRelease(json, src.apk);
    if (!rel) {
      // Release appena pubblicata, APK ancora in costruzione (5-8 minuti): non è un errore.
      const building = json && typeof json === 'object' && typeof json.tag_name === 'string' && Array.isArray(json.assets) && !json.assets.some((a) => a && a.name === APK_NAME);
      return { release: null, error: building ? 'preparing' : 'invalid', building: building ? json.tag_name.replace(/^v/, '') : '', stale: c?.api === src.api ? c.release : null };
    }
    ls.set(CACHE_KEY, { api: src.api, at: Date.now(), release: rel });
    return { release: rel, at: Date.now(), cached: false };
  } catch (err) {
    return { release: null, error: err.kind || 'network', stale: c?.api === src.api ? c.release : null, staleAt: c?.at };
  }
}

/** Versione installata: nell'app quella dell'APK (Android), nel browser quella del sito. */
export async function installedInfo() {
  if (isApp()) {
    try {
      const i = await nativeCall('App', 'getInfo');
      const build = Number.parseInt(i?.build, 10);
      return { version: isVersion(i?.version) ? i.version : APP_VERSION, build: Number.isFinite(build) ? build : null, app: true };
    } catch { /* plugin assente: si usa la versione delle pagine */ }
  }
  return { version: APP_VERSION, build: null, app: isApp() };
}

/**
 * Stato degli aggiornamenti.
 * status: 'noconfig' (indirizzo ufficiale assente) · 'error' (rete o dati) · 'update' (versione più nuova)
 *         · 'build' (stessa versione, build più recente: correzioni) · 'preparing' (versione pubblicata sul
 *         sito ma APK ancora in costruzione) · 'uptodate' · 'older' (installata più nuova della pubblicata)
 */
export async function checkUpdates({ force = false } = {}) {
  const installed = await installedInfo();
  const [r, web] = await Promise.all([getRelease({ force }), getWebVersion().catch(() => null)]);
  const out = { installed, web, release: r.release, error: r.error || '', stale: r.stale || null, at: r.at || r.staleAt || 0, cached: Boolean(r.cached) };
  if (r.error === 'noconfig') return { ...out, status: 'noconfig' };
  if (r.error === 'preparing') return { ...out, error: '', status: 'preparing', web: web || { version: r.building, notes: [] } };
  if (!r.release) return { ...out, status: 'error' };
  // Le novità stanno in version.json (le release fatte a mano non contengono dati per l'app).
  const rel = !r.release.notes.length && web && semverCmp(web.version, r.release.version) === 0 ? { ...r.release, notes: web.notes } : r.release;
  out.release = rel;
  const cmp = semverCmp(rel.version, installed.version);
  const webAhead = web && semverCmp(web.version, rel.version) === 1;
  // Nel browser il sito è sempre l'ultimo: qui conta solo quale APK si può scaricare.
  if (!installed.app) return { ...out, status: webAhead ? 'preparing' : 'available' };
  if (cmp === 1) return { ...out, status: 'update' };
  if (webAhead && installed.app) return { ...out, status: 'preparing' };
  if (cmp === 0 && installed.build && rel.versionCode && rel.versionCode > installed.build) return { ...out, status: 'build' };
  if (cmp === -1) return { ...out, status: 'older' };
  return { ...out, status: 'uptodate' };
}

// ---------------------------------------------------------------------------
// Download e installazione (solo nell'app Android)
// ---------------------------------------------------------------------------

const fail = (kind, message) => Object.assign(new Error(message), { kind });
function b64ToBytes(b64) {
  const bin = atob(String(b64).replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const removeLocal = () => nativeCall('Filesystem', 'deleteFile', { path: LOCAL_APK, directory: 'CACHE' }).catch(() => {});

/**
 * Scarica l'APK ufficiale nella memoria dell'app e la controlla (dimensione e SHA-256).
 * onProgress(scaricati, totale). Errori con kind: 'notapp', 'url', 'offline', 'network', 'empty',
 * 'incomplete', 'hash'. Se un controllo fallisce il file viene cancellato: non si installa mai.
 */
export async function downloadApk(rel, { onProgress, onVerify } = {}) {
  if (!isApp()) throw fail('notapp', t('upd.err.notapp'));
  if (!rel || !officialAssetTag(rel.url)) throw fail('url', t('upd.err.url'));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw fail('offline', t('upd.err.dlOffline'));
  await removeLocal();
  const cap = window.Capacitor;
  let sub = null;
  try { sub = cap?.addListener?.('Filesystem', 'progress', (e) => { const d = e?.bytes ?? e?.data?.bytes; const t = e?.contentLength ?? e?.data?.contentLength; if (Number.isFinite(d)) onProgress?.(d, t > 0 ? t : rel.size || 0); }); } catch { sub = null; }
  let res;
  try {
    res = await nativeCall('Filesystem', 'downloadFile', { url: rel.url, path: LOCAL_APK, directory: 'CACHE', progress: true, connectTimeout: 15000, readTimeout: 30000 });
  } catch (err) {
    await removeLocal();
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw fail(offline ? 'offline' : 'network', offline ? t('upd.err.dlLost') : t('upd.err.dlFailed', { why: String(err?.message || err).slice(0, 120) }));
  } finally { try { await sub?.remove?.(); } catch { /* niente */ } }
  onVerify?.();
  const st = await nativeCall('Filesystem', 'stat', { path: LOCAL_APK, directory: 'CACHE' }).catch(() => null);
  const size = Number(st?.size) || 0;
  if (!size) { await removeLocal(); throw fail('empty', t('upd.err.empty')); }
  if (rel.size && size !== rel.size) { await removeLocal(); throw fail('incomplete', t('upd.err.incomplete', { got: fmtSize(size), total: fmtSize(rel.size) })); }
  let verified = 'size';
  if (rel.sha256) {
    const r = await nativeCall('Filesystem', 'readFile', { path: LOCAL_APK, directory: 'CACHE' });
    const hex = await sha256Hex(b64ToBytes(r?.data || ''));
    if (hex !== rel.sha256) { await removeLocal(); throw fail('hash', t('upd.err.hash')); }
    verified = 'sha256';
  }
  return { path: res?.path || st?.uri || '', uri: st?.uri || '', size, verified };
}

/**
 * Apre la schermata di installazione di Android sul file già controllato.
 * Non installa niente da sola: Android chiede conferma (e, la prima volta, il permesso
 * "Installa app sconosciute" per GameNight Show).
 */
export async function openInstaller(file) {
  if (!isApp() || !file?.path) throw fail('notapp', t('upd.err.nothing'));
  try {
    await nativeCall('FileOpener', 'openFile', { path: file.path, mimeType: 'application/vnd.android.package-archive' });
  } catch (err) {
    throw fail('installer', t('upd.err.installer', { why: String(err?.message || err).slice(0, 100) }));
  }
}
/** L'APK installata ha già il componente per aprire l'installazione? (le versioni prima della 1.3 no) */
export function canInstallInApp() {
  try { return isApp() && Boolean(window.Capacitor?.isPluginAvailable?.('FileOpener')) && Boolean(window.Capacitor?.isPluginAvailable?.('Filesystem')); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Testi
// ---------------------------------------------------------------------------

export function fmtSize(n) {
  if (!n) return '';
  return n >= 1048576 ? `${fmtNum(n / 1048576, 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
export function fmtDay(d) {
  const ms = Date.parse(d || '');
  return Number.isNaN(ms) ? '' : fmtDate(ms, { day: 'numeric', month: 'long', year: 'numeric' });
}
const ERR_KEYS = ['offline', 'network', 'limit', 'missing', 'invalid', 'http', 'noconfig'];
export const errorText = (k) => t(`upd.err.${ERR_KEYS.includes(k) ? k : 'network'}`);

/** Riga di stato (testo semplice) per un risultato di checkUpdates. */
export function statusText(s) {
  const r = s.release;
  switch (s.status) {
    case 'update': return t('upd.st.update', { v: r.version, mine: s.installed.version });
    case 'build': return t('upd.st.build', { v: r.version, code: String(r.versionCode), mine: String(s.installed.build) });
    case 'preparing': return s.installed.app || !r
      ? t('upd.st.preparingApp', { v: s.web?.version || '' })
      : t('upd.st.preparingWeb', { v: s.web.version, r: r.version });
    case 'available': return t('upd.st.available', { v: r.version });
    case 'older': return t('upd.st.older', { v: r.version });
    case 'uptodate': return s.installed.app ? t('upd.st.uptodate', { v: s.installed.version }) : t('upd.st.stable', { v: r.version });
    case 'noconfig': return errorText('noconfig');
    default: return errorText(s.error);
  }
}

// ---------------------------------------------------------------------------
// Avviso automatico nell'app (una volta per versione, senza bloccare niente)
// ---------------------------------------------------------------------------

let autoBusy = false;
/** Nell'app: se c'è una versione nuova mostra un avviso discreto. Usa la copia di 6 ore: niente richieste a ogni pagina. */
const AUTO_KEY = 'gnr_upd_auto';
const AUTO_EVERY = 30 * 60e3;
export async function autoCheck({ onOpen } = {}) {
  if (!isApp() || autoBusy || document.getElementById('updBanner')) return null;
  // Al massimo un controllo automatico ogni mezz'ora (tra tutte le pagine): niente richieste a ogni schermata
  const last = Number(ls.get(AUTO_KEY)) || 0;
  if (Date.now() - last < AUTO_EVERY) return null;
  ls.set(AUTO_KEY, Date.now());
  autoBusy = true;
  try {
    const s = await checkUpdates();
    if (s.status !== 'update') return s;
    if (ls.get(SEEN_KEY) === s.release.version) return s;
    showBanner(s, onOpen);
    return s;
  } catch { return null; } finally { autoBusy = false; }
}
/** "Più tardi": l'avviso per questa versione non torna più (il controllo manuale resta nelle Impostazioni). */
export function dismissVersion(v) { ls.set(SEEN_KEY, v); }

function showBanner(s, onOpen) {
  const r = s.release;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.className = 'upd-banner upd-banner--app';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="upd-text"><b>${esc(t('upd.banner.title', { v: r.version }))}</b><small>${esc(t('upd.banner.mine', { v: s.installed.version }))}${r.notes[0] ? ` · ${esc(r.notes[0])}` : ''}</small></span>
    <button type="button" class="btn-sec btn-sec--sm" data-updopen>${esc(t('upd.banner.open'))}</button>
    <button type="button" class="upd-x" aria-label="${esc(t('common.later'))}" title="${esc(t('common.later'))}" data-close>✕</button>`;
  el.querySelector('[data-updopen]').addEventListener('click', () => {
    el.remove();
    if (onOpen) onOpen(s); else location.href = 'index.html#aggiornamenti';
  });
  el.querySelector('.upd-x').addEventListener('click', () => { dismissVersion(r.version); el.remove(); });
  document.body.appendChild(el);
}

// ---------------------------------------------------------------------------
// Sezione "Scarica GameNight" (impostazioni dell'app, home del sito, pagina scarica.html)
// ---------------------------------------------------------------------------

/**
 * Disegna la sezione dentro box e la gestisce: versioni, stato, novità, "Controlla aggiornamenti",
 * "Scarica APK" (nell'app: download con avanzamento, controllo e installazione; nel browser: link ufficiale).
 * helpers: { qrSVG, toast } dalla pagina (per non legare questo modulo all'interfaccia).
 */
export function mountUpdatePanel(box, { qrSVG, toast, showQR = false, page = false } = {}) {
  const st = { s: null, phase: 'checking', file: null, err: '', progress: [0, 0] };
  const app = isApp();
  const androidVer = (/Android (\d+(?:\.\d+)?)/.exec(navigator.userAgent || '') || [])[1] || '';
  const tooOld = !app && androidVer && semverCmp(androidVer, MIN_ANDROID) === -1;
  const paint = () => {
    const s = st.s; const r = s?.release || s?.stale || null;
    const inst = s?.installed || { version: APP_VERSION, app };
    const notes = (r?.notes?.length ? r.notes : s?.web?.notes) || [];
    const phaseText = {
      checking: `<span class="ver-state ver-state--busy">⏳ ${esc(t('upd.p.checking'))}</span>`,
      downloading: `<span class="ver-state ver-state--busy">⬇️ ${esc(t('upd.p.downloading'))} ${st.progress[1] ? `${Math.floor((st.progress[0] / st.progress[1]) * 100)}% · ` : ''}${fmtSize(st.progress[0])}${st.progress[1] ? ` ${esc(t('upd.p.of'))} ${fmtSize(st.progress[1])}` : ''}</span>`,
      verifying: `<span class="ver-state ver-state--busy">🔎 ${esc(t('upd.p.verifying'))}</span>`,
      ready: `<span class="ver-state ver-state--ok">✅ ${esc(t(st.file?.verified === 'sha256' ? 'upd.p.readySha' : 'upd.p.readySize'))}</span>`,
      installing: `<span class="ver-state ver-state--ok">📲 ${esc(t('upd.p.installing'))}</span>`,
      failed: `<span class="ver-state ver-state--err">❌ ${esc(st.err)}</span>`
    }[st.phase] || '';
    const statusCls = !s ? '' : ({ update: 'ver-state--new', build: 'ver-state--new', uptodate: 'ver-state--ok', older: 'ver-state--ok', available: 'ver-state--ok', preparing: 'ver-state--wait', error: 'ver-state--err', noconfig: 'ver-state--err' })[s.status] || '';
    const canDl = app && r && s && ['update', 'build', 'uptodate', 'older'].includes(s.status) && !s.error;
    const showDl = r && s && s.status !== 'noconfig';
    box.innerHTML = `
      <p class="ver-status" role="status" aria-live="polite">${st.phase !== 'idle' && st.phase !== 'checking' ? phaseText : s ? `<span class="ver-state ${statusCls}">${esc(statusText(s))}</span>${s.stale ? ` <small class="muted">(${esc(t('upd.p.stale'))})</small>` : ''}` : phaseText}</p>
      <div class="ver-grid">
        ${app ? `<div class="ver-kv"><span>${esc(t('upd.p.installed'))}</span><b>${esc(inst.version)}${inst.build ? ` <small>${esc(t('upd.p.build', { n: String(inst.build) }))}</small>` : ''}</b></div>` : ''}
        <div class="ver-kv"><span>${esc(app ? t('upd.p.latest') : t('upd.p.stableApk'))}</span><b>${r ? `${esc(r.version)}${r.versionCode ? ` <small>${esc(t('upd.p.build', { n: String(r.versionCode) }))}</small>` : ''}` : '—'}</b></div>
        ${r?.date ? `<div class="ver-kv"><span>${esc(t('upd.p.date'))}</span><b>${esc(fmtDay(r.date))}</b></div>` : ''}
        ${r?.size ? `<div class="ver-kv"><span>${esc(t('upd.p.size'))}</span><b>${esc(fmtSize(r.size))}</b></div>` : ''}
        <div class="ver-kv ver-kv--wide"><span>${esc(t('upd.p.requires'))}</span><b>${esc(t('upd.p.android', { v: r?.minAndroid || MIN_ANDROID }))}</b></div>
      </div>
      ${st.phase === 'downloading' ? `<div class="ver-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.progress[1] ? Math.floor((st.progress[0] / st.progress[1]) * 100) : 0}"><i style="width:${st.progress[1] ? Math.min(100, (st.progress[0] / st.progress[1]) * 100) : 8}%"></i></div>` : ''}
      ${notes.length ? `<details class="hub-details ver-notes" ${s?.status === 'update' || page ? 'open' : ''}><summary>${esc(t('upd.p.notes', { v: r?.version || s?.web?.version || '' }))}</summary><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <div class="hub-row ver-actions">
        <button type="button" class="btn-sec" data-ver="check" ${['checking', 'downloading', 'verifying'].includes(st.phase) ? 'disabled' : ''}>🔄 ${esc(t('upd.check'))}</button>
        ${app
    ? (st.phase === 'ready' || st.phase === 'installing'
      ? `<button type="button" class="btn" data-ver="install">📲 ${esc(t('upd.p.install'))}</button>`
      : canDl && canInstallInApp()
        ? `<button type="button" class="${s.status === 'update' || s.status === 'build' ? 'btn' : 'btn-sec'}" data-ver="download" ${['downloading', 'verifying'].includes(st.phase) ? 'disabled' : ''}>⬇️ ${esc(t('upd.p.download'))}${r.size ? ` (${esc(fmtSize(r.size))})` : ''}</button>`
        : canDl ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">⬇️ ${esc(t('upd.p.downloadBrowser'))}</a>` : '')
    : (showDl && !tooOld && (r.url || '') ? `<a class="btn" href="${esc(r.url)}" rel="noopener" data-ver="link">⬇️ ${esc(t('upd.p.download'))}${r.size ? ` (${esc(fmtSize(r.size))})` : ''}</a>` : '')}
      </div>
      ${app && st.phase === 'installing' ? `<p class="muted small">${t('upd.p.installHelp')}</p>` : ''}
      ${app && canDl && !canInstallInApp() ? `<p class="muted small">${esc(t('upd.p.oldApp'))}</p>` : ''}
      ${!app && tooOld ? `<p class="form-error">${esc(t('upd.p.tooOld', { v: androidVer, min: r?.minAndroid || MIN_ANDROID }))}</p>` : ''}
      ${!app && showDl && !page ? `<p class="muted small">${esc(isAndroid() ? t('upd.p.afterDl') : t('upd.p.fromPc'))}</p>` : ''}
      ${showQR && qrSVG ? `<div class="ver-qr"><h3>${esc(t('upd.p.qrTitle'))}</h3><p class="muted small">${esc(t('upd.p.qrText'))}</p><div class="hub-qr">${qrSVG(downloadPageUrl(), 4)}</div><p class="muted small ver-url"><a href="${esc(downloadPageUrl())}" target="_blank" rel="noopener">${esc(downloadPageUrl().replace(/^https?:\/\//, ''))}</a></p></div>` : ''}
      ${r?.sha256 && (page || !app) ? `<details class="hub-details"><summary>${esc(t('upd.p.sha'))}</summary><code class="ver-sha">${esc(r.sha256)}</code></details>` : ''}`;
  };
  const run = async (force) => {
    st.phase = 'checking'; st.file = null; paint();
    try { st.s = await checkUpdates({ force }); } catch { st.s = { status: 'error', error: 'network', installed: { version: APP_VERSION, app } }; }
    st.phase = 'idle'; paint();
    if (force && st.s?.status === 'uptodate') toast?.(statusText(st.s));
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ver]');
    if (!b) return;
    const a = b.dataset.ver;
    if (a === 'check') { run(true); return; }
    if (a === 'download') {
      const rel = st.s?.release;
      st.phase = 'downloading'; st.progress = [0, rel?.size || 0]; paint();
      let last = 0;
      try {
        st.file = await downloadApk(rel, {
          onProgress: (d, t) => { st.progress = [d, t]; const now = Date.now(); if (now - last > 200) { last = now; paint(); } },
          onVerify: () => { st.phase = 'verifying'; paint(); }
        });
        st.phase = 'ready';
      } catch (err) {
        st.phase = 'failed'; st.err = err.message;
        if (err.kind === 'hash' || err.kind === 'incomplete') getRelease({ force: true }).catch(() => {});
      }
      paint();
      return;
    }
    if (a === 'install') {
      try { await openInstaller(st.file); st.phase = 'installing'; } catch (err) { st.phase = 'failed'; st.err = err.message; }
      paint();
    }
  });
  run(false);
  return { refresh: () => run(true) };
}
