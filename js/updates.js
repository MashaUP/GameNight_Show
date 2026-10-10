// Versioni, aggiornamenti e installazione dell'app Android.
//
// Come è fatto GameNight Show: il sito (GitHub Pages) e l'app Android (Capacitor) sono lo stesso codice.
// - Nel browser il sito si aggiorna da solo: basta ricaricare (avviso "Aggiorna" in util.js).
// - L'app Android ha le pagine DENTRO l'APK: per avere le novità bisogna installare l'APK nuova.
//
// Fonte unica delle informazioni (niente server in più):
// - version.json del sito: versione, data, novità, Android minimo (scritto a ogni rilascio);
// - la release "app-android" del repository GitHub, aggiornata dal workflow a ogni build:
//   l'APK (sempre allo stesso indirizzo) e, nella descrizione, i dati della build
//   <!-- gamenight-apk: {"version","versionCode","sha256","size","date",...} -->
//   letti con l'API pubblica di GitHub (gratuita, senza chiavi).
import { APP_VERSION } from './version.js';
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

/** Repository GitHub della release ufficiale, ricavato dall'indirizzo ufficiale dell'APK (mai inventato). */
export function releaseSource(url = apkUrl()) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/releases\/download\/app-android\/GameNight-Show\.apk$/.exec(url || '');
  if (!m) return null;
  return {
    owner: m[1], repo: m[2], apk: url,
    api: `https://api.github.com/repos/${m[1]}/${m[2]}/releases/tags/app-android`,
    page: `https://github.com/${m[1]}/${m[2]}/releases/tag/app-android`
  };
}
/** Stesso indirizzo dell'APK ufficiale (https, senza distinguere maiuscole e minuscole). */
export function sameUrl(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^https:\/\//.test(a) && a.toLowerCase() === b.toLowerCase();
}
/** Pagina ufficiale di download (sul sito): stabile, è quella del QR. */
export function downloadPageUrl() { return publicUrl('scarica.html').href; }

const cleanNotes = (n) => (Array.isArray(n) ? n : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 12).map((x) => x.trim().slice(0, 240));
const cleanDate = (d) => (typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? d : '');

/** version.json: solo campi controllati. */
export function parseWebVersion(v) {
  if (!v || typeof v !== 'object' || !isVersion(v.version)) return null;
  return { version: v.version.trim(), date: cleanDate(v.date), notes: cleanNotes(v.notes), minAndroid: isVersion(v.minAndroid) ? v.minAndroid : MIN_ANDROID };
}

/**
 * Risposta dell'API di GitHub per la release "app-android" → dati della build, controllati uno per uno.
 * Restituisce null se manca l'APK ufficiale. Se mancano i dati della build (workflow vecchio) la versione
 * si ricava dal titolo e l'hash resta sconosciuto (si verifica solo la dimensione).
 */
export function parseRelease(json, officialApk = apkUrl()) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.assets)) return null;
  const asset = json.assets.find((a) => a && a.name === APK_NAME);
  // Nomi di utente e repository su GitHub non distinguono maiuscole e minuscole: il sito
  // (mashaup.github.io) li vede in minuscolo, la release li scrive come sono (MashaUP).
  if (!asset || !sameUrl(asset.browser_download_url, officialApk)) return null;
  const size = Number.isInteger(asset.size) && asset.size > 0 ? asset.size : 0;
  let meta = {};
  const m = /<!--\s*gamenight-apk:\s*(\{[\s\S]*?\})\s*-->/.exec(String(json.body || ''));
  if (m) { try { meta = JSON.parse(m[1]) || {}; } catch { meta = {}; } }
  const fromTitle = (/(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?)/.exec(String(json.name || '')) || [])[1];
  const version = isVersion(meta.version) ? meta.version : (isVersion(fromTitle) ? fromTitle : '');
  if (!version) return null;
  const sha = typeof meta.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(meta.sha256) ? meta.sha256.toLowerCase() : '';
  const metaSize = Number.isInteger(meta.size) && meta.size > 0 ? meta.size : 0;
  return {
    version,
    versionCode: Number.isInteger(meta.versionCode) && meta.versionCode > 0 ? meta.versionCode : null,
    url: asset.browser_download_url,
    size: size || metaSize,
    // Dimensione dei dati della build diversa da quella del file: l'APK è cambiata dopo (build in corso)
    sizeMismatch: Boolean(size && metaSize && size !== metaSize),
    sha256: sha,
    date: cleanDate(meta.date) || cleanDate(asset.updated_at) || cleanDate(json.published_at),
    notes: cleanNotes(meta.notes),
    minAndroid: isVersion(meta.minAndroid) ? meta.minAndroid : MIN_ANDROID
  };
}

async function fetchJSON(url, ms = 9000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl?.signal, headers: url.startsWith('https://api.github.com/') ? { Accept: 'application/vnd.github+json' } : undefined });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.kind = res.status === 404 ? 'missing' : (res.status === 403 || res.status === 429 ? 'limit' : 'http'); throw e; }
    try { return await res.json(); } catch { const e = new Error('dati non validi'); e.kind = 'invalid'; throw e; }
  } catch (err) {
    if (!err.kind) err.kind = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'network';
    throw err;
  } finally { clearTimeout(t); }
}

/** Versione del sito pubblicato (version.json). */
export async function getWebVersion() {
  const v = parseWebVersion(await fetchJSON(`${versionUrl()}?t=${Date.now()}`));
  if (!v) { const e = new Error('version.json non valido'); e.kind = 'invalid'; throw e; }
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
    const rel = parseRelease(await fetchJSON(src.api), src.apk);
    if (!rel) return { release: null, error: 'invalid', stale: c?.api === src.api ? c.release : null };
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
  if (!r.release) return { ...out, status: 'error' };
  const rel = r.release;
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
  if (!isApp()) throw fail('notapp', 'Il download con installazione si fa dall’app Android.');
  const official = apkUrl();
  if (!rel || !official || !sameUrl(rel.url, official)) throw fail('url', 'Indirizzo dell’APK non ufficiale: download annullato.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw fail('offline', 'Sei offline: collegati a internet e riprova.');
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
    throw fail(offline ? 'offline' : 'network', offline ? 'Connessione persa durante il download: riprova quando sei di nuovo online.' : `Download non riuscito (${String(err?.message || err).slice(0, 120)}). Riprova.`);
  } finally { try { await sub?.remove?.(); } catch { /* niente */ } }
  onVerify?.();
  const st = await nativeCall('Filesystem', 'stat', { path: LOCAL_APK, directory: 'CACHE' }).catch(() => null);
  const size = Number(st?.size) || 0;
  if (!size) { await removeLocal(); throw fail('empty', 'Il file scaricato è vuoto: riprova più tardi.'); }
  if (rel.size && size !== rel.size) { await removeLocal(); throw fail('incomplete', `Il file scaricato è incompleto (${fmtSize(size)} su ${fmtSize(rel.size)}): riprova.`); }
  let verified = 'size';
  if (rel.sha256) {
    const r = await nativeCall('Filesystem', 'readFile', { path: LOCAL_APK, directory: 'CACHE' });
    const hex = await sha256Hex(b64ToBytes(r?.data || ''));
    if (hex !== rel.sha256) { await removeLocal(); throw fail('hash', 'Il file non corrisponde a quello pubblicato (controllo SHA-256 non superato): non lo installo. Ricontrolla gli aggiornamenti e riprova.'); }
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
  if (!isApp() || !file?.path) throw fail('notapp', 'Niente da installare.');
  try {
    await nativeCall('FileOpener', 'openFile', { path: file.path, mimeType: 'application/vnd.android.package-archive' });
  } catch (err) {
    throw fail('installer', `Android non ha aperto l’installazione (${String(err?.message || err).slice(0, 100)}).`);
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
  return n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
export function fmtDay(d) {
  const t = Date.parse(d || '');
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}
const ERR_TEXT = {
  offline: 'Nessuna connessione: GameNight Show funziona lo stesso, ricontrolla quando sei online.',
  network: 'Il servizio degli aggiornamenti non risponde: riprova più tardi. La versione installata funziona normalmente.',
  limit: 'GitHub ha ricevuto troppe richieste da questa rete: riprova tra un’ora.',
  missing: 'Non c’è ancora un’APK pubblicata nelle Releases del repository.',
  invalid: 'Le informazioni sulla versione pubblicata non sono valide: riprova più tardi.',
  http: 'Il servizio degli aggiornamenti ha risposto con un errore: riprova più tardi.',
  noconfig: 'Indirizzo ufficiale dell’APK non configurato: il sito non è su GitHub Pages (vedi README, “App Android”).'
};
export const errorText = (k) => ERR_TEXT[k] || ERR_TEXT.network;

/** Riga di stato (testo semplice) per un risultato di checkUpdates. */
export function statusText(s) {
  const r = s.release;
  switch (s.status) {
    case 'update': return `È disponibile GameNight Show ${r.version} (hai la ${s.installed.version}).`;
    case 'build': return `C’è una build più recente della ${r.version} (n. ${r.versionCode}, hai la n. ${s.installed.build}): contiene correzioni.`;
    case 'preparing': return s.installed.app
      ? `La versione ${s.web.version} è stata pubblicata: l’APK è in preparazione, ricontrolla tra qualche minuto.`
      : `La versione ${s.web.version} è appena uscita: l’APK è in preparazione (adesso si scarica la ${r.version}).`;
    case 'available': return `App Android stabile: versione ${r.version}.`;
    case 'older': return `Hai una versione più nuova di quella pubblicata (${r.version}).`;
    case 'uptodate': return s.installed.app ? `GameNight Show è aggiornato (versione ${s.installed.version}).` : `Versione stabile dell’app: ${r.version}.`;
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
  el.innerHTML = `<span class="upd-text"><b>È disponibile GameNight Show ${esc(r.version)}</b><small>Hai la ${esc(s.installed.version)}${r.notes[0] ? ` · ${esc(r.notes[0])}` : ''}</small></span>
    <button type="button" class="btn-sec btn-sec--sm" data-updopen>Vedi e scarica</button>
    <button type="button" class="upd-x" aria-label="Più tardi" title="Più tardi">✕</button>`;
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
      checking: '<span class="ver-state ver-state--busy">⏳ Controllo in corso…</span>',
      downloading: `<span class="ver-state ver-state--busy">⬇️ Download in corso… ${st.progress[1] ? `${Math.floor((st.progress[0] / st.progress[1]) * 100)}% · ` : ''}${fmtSize(st.progress[0])}${st.progress[1] ? ` di ${fmtSize(st.progress[1])}` : ''}</span>`,
      verifying: '<span class="ver-state ver-state--busy">🔎 Controllo del file…</span>',
      ready: `<span class="ver-state ver-state--ok">✅ Download completato e controllato (${st.file?.verified === 'sha256' ? 'SHA-256 e dimensione' : 'dimensione'}).</span>`,
      installing: '<span class="ver-state ver-state--ok">📲 Installazione da confermare: segui la schermata di Android.</span>',
      failed: `<span class="ver-state ver-state--err">❌ ${esc(st.err)}</span>`
    }[st.phase] || '';
    const statusCls = !s ? '' : ({ update: 'ver-state--new', build: 'ver-state--new', uptodate: 'ver-state--ok', older: 'ver-state--ok', available: 'ver-state--ok', preparing: 'ver-state--wait', error: 'ver-state--err', noconfig: 'ver-state--err' })[s.status] || '';
    const canDl = app && r && s && ['update', 'build', 'uptodate', 'older'].includes(s.status) && !s.error;
    const showDl = r && s && s.status !== 'noconfig';
    box.innerHTML = `
      <p class="ver-status" role="status" aria-live="polite">${st.phase !== 'idle' && st.phase !== 'checking' ? phaseText : s ? `<span class="ver-state ${statusCls}">${esc(statusText(s))}</span>${s.stale ? ' <small class="muted">(dati dell’ultimo controllo riuscito)</small>' : ''}` : phaseText}</p>
      <div class="ver-grid">
        ${app ? `<div class="ver-kv"><span>Installata</span><b>${esc(inst.version)}${inst.build ? ` <small>build ${esc(inst.build)}</small>` : ''}</b></div>` : ''}
        <div class="ver-kv"><span>${app ? 'Ultima pubblicata' : 'App Android stabile'}</span><b>${r ? `${esc(r.version)}${r.versionCode ? ` <small>build ${esc(r.versionCode)}</small>` : ''}` : '—'}</b></div>
        ${r?.date ? `<div class="ver-kv"><span>Pubblicata il</span><b>${esc(fmtDay(r.date))}</b></div>` : ''}
        ${r?.size ? `<div class="ver-kv"><span>Dimensione</span><b>${esc(fmtSize(r.size))}</b></div>` : ''}
        <div class="ver-kv ver-kv--wide"><span>Richiede</span><b>Android ${esc(r?.minAndroid || MIN_ANDROID)} o più recente</b></div>
      </div>
      ${st.phase === 'downloading' ? `<div class="ver-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.progress[1] ? Math.floor((st.progress[0] / st.progress[1]) * 100) : 0}"><i style="width:${st.progress[1] ? Math.min(100, (st.progress[0] / st.progress[1]) * 100) : 8}%"></i></div>` : ''}
      ${notes.length ? `<details class="hub-details ver-notes" ${s?.status === 'update' || page ? 'open' : ''}><summary>Novità della ${esc(r?.version || s?.web?.version || '')}</summary><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <div class="hub-row ver-actions">
        <button type="button" class="btn-sec" data-ver="check" ${['checking', 'downloading', 'verifying'].includes(st.phase) ? 'disabled' : ''}>🔄 Controlla aggiornamenti</button>
        ${app
    ? (st.phase === 'ready' || st.phase === 'installing'
      ? '<button type="button" class="btn" data-ver="install">📲 Installa</button>'
      : canDl && canInstallInApp()
        ? `<button type="button" class="${s.status === 'update' || s.status === 'build' ? 'btn' : 'btn-sec'}" data-ver="download" ${['downloading', 'verifying'].includes(st.phase) ? 'disabled' : ''}>⬇️ Scarica APK${r.size ? ` (${esc(fmtSize(r.size))})` : ''}</button>`
        : canDl ? `<a class="btn" href="${esc(r.url)}" target="_blank" rel="noopener">⬇️ Scarica APK nel browser</a>` : '')
    : (showDl && !tooOld && (r.url || '') ? `<a class="btn" href="${esc(r.url)}" rel="noopener" data-ver="link">⬇️ Scarica APK${r.size ? ` (${esc(fmtSize(r.size))})` : ''}</a>` : '')}
      </div>
      ${app && st.phase === 'installing' ? '<p class="muted small">Se Android dice che non può installare app da questa fonte: tocca <b>Impostazioni</b>, attiva <b>Consenti da questa fonte</b> per GameNight Show, poi torna indietro e tocca di nuovo <b>Installa</b>. I tuoi dati restano: l’aggiornamento non cancella profilo e armadi.</p>' : ''}
      ${app && canDl && !canInstallInApp() ? '<p class="muted small">Questa versione dell’app non sa aprire l’installazione da sola: l’APK si scarica nel browser, poi aprila dalle notifiche.</p>' : ''}
      ${!app && tooOld ? `<p class="form-error">Questo telefono ha Android ${esc(androidVer)}: GameNight Show richiede Android ${esc(r?.minAndroid || MIN_ANDROID)} o più recente. Puoi usare il sito dal browser.</p>` : ''}
      ${!app && showDl && !page ? `<p class="muted small">${isAndroid() ? 'Dopo il download apri il file: Android chiede di permettere l’installazione da questa fonte.' : 'Dal computer: inquadra il QR con il telefono Android. Su iPhone usa il sito (Safari › Condividi › Aggiungi alla schermata Home).'}</p>` : ''}
      ${showQR && qrSVG ? `<div class="ver-qr"><h3>Installa GameNight su un altro dispositivo</h3><p class="muted small">Inquadra il QR con il telefono Android: si apre la pagina ufficiale di download, sempre con l’ultima versione.</p><div class="hub-qr">${qrSVG(downloadPageUrl(), 4)}</div><p class="muted small ver-url"><a href="${esc(downloadPageUrl())}" target="_blank" rel="noopener">${esc(downloadPageUrl().replace(/^https?:\/\//, ''))}</a></p></div>` : ''}
      ${r?.sha256 && (page || !app) ? `<details class="hub-details"><summary>Impronta SHA-256 (per i più tecnici)</summary><code class="ver-sha">${esc(r.sha256)}</code></details>` : ''}`;
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
