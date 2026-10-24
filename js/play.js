// Schermata telefono (giocatore): ingresso con avatar, voto segreto, attesa del reveal.
import {
  isConfigured, connect, roomRef, groupRef, armadioRef, libraryRef, memberRef, dbRef, onValue, get, set, update, push, serverTimestamp, explainError,
  trackConnection, serverNow
} from './fb.js';
import {
  $, esc, fmt, param, normalizeCode, sortedPlayers, activePlayers, compressImage, gameImage, gameImageHTML, toast,
  installImageFallback, showFatal, showNotConfigured, ICONS, PLAYER_COLORS, safeColor, nameKey, cleanName, asList, libInfo, libFits, connectionStatus,
  keepAwake, watchVersion, registerSW, randomCode, userError, applyTheme, themeSwitchHTML, watchBattery, compressPhoto, dbKey, qrSVG,
  ErrLog, a11yHTML, voteTimer, timerColor, buzz, squarePhoto, rememberNight, pollChoices, pollValue
} from './util.js';
import { avatarHTML, avatarUri, avatarOptions, avatarParts } from './avatars.js';
import {
  CRITERIA, gameStats, verdict, buildBoard, buildAwards, buildAllTime, personalStats, personKey, trophies, affinities,
  activeCriteria, progressFor, newAchievements, recommend,
  nightsList, wrapped, yearsOf, personInsights, searchLibrary, parseQuery, tagsOf, isAvailable, GAME_STATUS, GAME_MODES, nightFacts,
  nightChampions, awardTitle
} from './stats.js';
import { confettiBurst } from './fx.js';
import { publicUrl, isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';
import { bindPhonePrep, gameRowHTML, tonightSummaryHTML, markTonight, Scanner, rulesCardHTML, planCardHTML, bringHTML } from './phone-prep.js';
import { bindPhone, knock, checkCohost, tableHTML, paintSand, scoreHTML, QuizPhone, cardSectionHTML, bindCardSection, rivalsSectionHTML, seasonLineHTML, icsButtonHTML } from './phone-extras.js';
import { renderShareImage, renderStoryImage, renderYearImage, shareOrDownload, nightDate } from './share.js';
import { SFX_META } from './sfx.js';
import { sfxKey } from './customsfx.js';
/** Suoni della soundboard: quelli predefiniti più quelli caricati sulla TV (meta.customSfx: solo nome e icona). */
const allSfx = () => [...SFX_META, ...Object.entries(P.meta?.customSfx || {}).filter(([id, c]) => /^c[a-z0-9]{1,8}$/.test(id) && c?.l).map(([id, c]) => ({ k: sfxKey(id), icon: String(c.i || '🔔').slice(0, 8), label: String(c.l).slice(0, 24) }))];
import { setRoomSafeMode } from './safe.js';
import { Person, lookOf } from './person.js';
import { t, has, lang, fmtDate, fmtList, fmtNum, langSwitchHTML } from './i18n.js';
import { bindSharedTimer, SharedTimer, TimerSheet, phoneExpire } from './sharedtimer.js';
import { Favs, favFirst } from './favs.js';
import { saveGame, newGameId, logEvent as armLog } from './collection.js';

const app = $('#app');
const WATCHED = ['pick', 'meta', 'state', 'players', 'games', 'votes', 'poll', 'presence', 'claims', 'heartbeat', 'bets', 'profileClaims', 'profileGrants', 'scores', 'table', 'quiz', 'quizAns', 'quizScore', 'cohosts', 'tonight', 'wish', 'plan', 'rules', 'knows', 'timer'];
const VOTE_KEYS = ['overall', 'coinv', 'sempl', 'rigioc', 'c1', 'c2', 'mvp', 'guess', 'comment'];
const emptyVote = () => Object.fromEntries(VOTE_KEYS.map((k) => [k, null]));

const P = {
  uid: null,
  code: null,
  meta: null,
  state: null,
  players: {},
  games: {},
  votes: {},
  poll: null,
  presence: {},
  claims: {},
  bets: {},
  library: {},
  nights: {},
  groupWatching: null,
  addingGame: false,
  member: null,
  skipProfile: false,
  showProfile: false,
  cohost: false,
  loaded: new Set(),
  screenKey: null,
  screen: null,
  wasIn: false,
  profileEdit: false,
  editingVote: false,
  form: null,
  vote: null,
  voteGameId: null
};

// Segnapunti, quiz, figurine…: ricevono lo stato e le funzioni del telefono.
bindPhone({ P, roomRef, set, serverTimestamp, serverNow, explainError, Net: { track: (l, pr) => Net.track(l, pr) }, shareOrDownload: (...a) => shareOrDownload(...a) });
bindPhonePrep({ P, roomRef, groupRef, libraryRef, set, update, push, serverTimestamp, explainError, Net: { track: (l, pr) => Net.track(l, pr) }, render: () => render() });

installImageFallback();
applyTheme();
// Pulsanti "fisici": un colpetto di vibrazione quando si schiacciano (dove il telefono la supporta).
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('button:not(:disabled), .btn, .btn-sec, [role="button"], .quick-toggle, .seg button')) buzz(8);
}, { passive: true });
registerSW();
watchVersion();
watchBattery();
ErrLog.install();
// Android: il browser propone di installare l'app; il pulsante compare nella schermata iniziale.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
boot();

// ---------------------------------------------------------------------------
// Profilo personale salvato sul telefono (un profilo per gruppo)
// ---------------------------------------------------------------------------

const PROFILES_KEY = 'gnr_profiles';
function profiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}') || {}; } catch { return {}; }
}
function saveProfile(groupId, memberId, remote = true) {
  const all = profiles();
  all[groupId] = memberId;
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(all)); } catch { /* niente */ }
  // Anche il database ricorda il profilo di questo telefono: se la memoria del browser si svuota, si ritrova.
  if (remote && P.uid) set(dbRef(`deviceProfiles/${P.uid}/${groupId}`), memberId).catch(() => {});
}
/** Profili ricordati dal database per questo telefono (dopo una pulizia della memoria del browser). */
async function syncDeviceProfiles() {
  try {
    const remote = (await get(dbRef(`deviceProfiles/${P.uid}`))).val() || {};
    const local = profiles();
    let found = 0;
    for (const [gid, mid] of Object.entries(remote)) if (!local[gid] && /^[A-Z0-9]{6}$/.test(mid)) { saveProfile(gid, mid, false); found++; }
    for (const [gid, mid] of Object.entries(local)) if (remote[gid] !== mid) set(dbRef(`deviceProfiles/${P.uid}/${gid}`), mid).catch(() => {});
    if (found) toast(t('ph.found', { n: found }));
  } catch { /* regole vecchie o rete assente: pazienza */ }
}
/** Un profilo del gruppo con lo stesso nome (dallo storico delle serate), non ancora in stanza. */
function sameNameProfile(name) {
  const k = nameKey(name || '');
  if (!k || !P.meta?.groupId) return null;
  const inRoom = new Set(Object.values(P.players || {}).map((p) => p.memberId).filter(Boolean));
  let best = null;
  for (const n of Object.values(P.nights || {})) {
    for (const pp of Object.values(n?.people || {})) {
      if (!pp?.memberId || inRoom.has(pp.memberId) || nameKey(pp.name) !== k) continue;
      if (P.member?.id === pp.memberId) continue;
      best = best && best.mid === pp.memberId ? { ...best, nights: best.nights + 1 } : best || { mid: pp.memberId, name: pp.name, nights: 1 };
    }
  }
  return best;
}
function forgetProfile(groupId) {
  const all = profiles();
  delete all[groupId];
  localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
}
async function loadMember(id) {
  if (!/^[A-Z0-9]{6}$/.test(id || '')) return null;
  const v = (await get(memberRef(id))).val();
  return v ? { id, ...v } : null;
}
async function createMember(data) {
  for (let i = 0; i < 12; i++) {
    const id = randomCode(6);
    if (!(await get(memberRef(id))).exists()) {
      await set(memberRef(id), { ...data, createdAt: serverTimestamp() });
      return id;
    }
  }
  throw new Error(t('common.noFreeCode'));
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Nell'app: pulsante per inquadrare il QR della TV (la fotocamera del telefono aprirebbe il browser). */
function qrScanButtonHTML() {
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  return canScanQR() && (isApp() || touch) ? `<button type="button" class="btn btn-block qr-scan-btn" data-scanqr>📷 ${esc(t('scan.title'))}</button>` : '';
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-scanqr]');
  if (!b) return;
  e.preventDefault();
  const text = await scanQR();
  if (!text) return;
  const to = routeFromQR(text);
  if (to) location.href = to;
  else toast(t('home.join.notOurQR'), 'warn');
});

/** Suggerimento per installare l'app sul telefono (non compare se è già installata). */
function installHintHTML(code = '') {
  if (isStandalone() || isApp()) return '';
  const apk = isAndroid() ? apkUrl() : '';
  const how = isIOS() ? t('ph.inst.ios') : apk ? t('ph.inst.androidApk') : t('ph.inst.android');
  return `
    <section class="card install-card">
      <h2>${esc(t('ph.inst.title'))}</h2>
      <p>${how} ${esc(t('ph.inst.fullscreen'))}</p>
      ${code ? `<p class="muted small">${t('ph.inst.code', { code: `<b>${esc(code)}</b>` })}</p>` : ''}
      ${apk ? `<a class="btn" href="${esc(apk)}" rel="noopener">📲 ${esc(t('ph.inst.apk'))}</a>` : ''}
      ${!isIOS() ? `<button type="button" class="btn-sec" id="installBtn">${esc(t('ph.inst.install'))}</button>` : ''}
    </section>`;
}
function bindInstall(root) {
  $('#installBtn', root)?.addEventListener('click', async () => {
    if (!installPrompt) { toast(t('ph.inst.menu')); return; }
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
  });
}

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  const code = normalizeCode(param('room'));

  app.innerHTML = loadingHTML(t('ph.connecting'));
  try {
    P.uid = await connect();
  } catch (err) {
    showFatal(app, t('ph.cantConnect'), explainError(err));
    return;
  }
  // Senza stanza: la pagina iniziale è la home personale (index.html), con profilo, armadi e gruppi.
  const prof = normalizeCode(param('profilo'), 6);
  if (code.length !== 4) { location.replace(`index.html${prof.length === 6 ? `?profilo=${prof}` : ''}`); return; }
  Person.uid = P.uid;
  await Person.load().catch(() => null);
  // Link (o QR) del profilo personale: collega il profilo a questo telefono.
  if (prof.length === 6) {
    try {
      const m = await loadMember(prof);
      if (m) { saveProfile(m.groupId, m.id); Person.linkGroup(m.groupId, m.id).catch(() => {}); toast(t('ph.profileLinked', { name: m.name })); }
      else toast(t('home.code6.none'), 'warn');
    } catch (err) { toast(explainError(err), 'error'); }
    const url = new URL(location.href);
    url.searchParams.delete('profilo');
    history.replaceState(null, '', url.pathname + url.search);
  }
  await syncDeviceProfiles();

  if (param('foto') === '1') { renderPhotoMode(code); return; }

  try {
    const meta = (await get(roomRef(code, 'meta'))).val();
    if (!meta) { renderCodeEntry(t('ph.noRoom', { code }), ''); return; }
  } catch (err) {
    showFatal(app, t('ph.cantRead'), explainError(err));
    return;
  }
  openRoom(code);
}

function loadingHTML(text) {
  return `<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>${esc(text)}</p></div>`;
}

/** Emblema del gruppo (emoji o logo) per la barra in alto. */
function phoneEmblemHTML() {
  const id = P.identity;
  if (id?.logo) return `<img src="${esc(id.logo)}" alt="">`;
  return id?.emblem ? esc(id.emblem) : '';
}

/** Colore ed emblema del gruppo anche sui telefoni. */
function paintPhoneIdentity() {
  const c = P.identity?.color;
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) document.documentElement.style.setProperty('--group', c);
  else document.documentElement.style.removeProperty('--group');
  const h = phoneEmblemHTML();
  document.querySelectorAll('[data-emblem]').forEach((el) => { if (el.innerHTML !== h) el.innerHTML = h; });
}

/** Intestazione del telefono. back: dove porta il pulsante "←" (vuoto: nessun pulsante). */
function phoneTop(code = P.code, back = '') {
  return `
    <header class="ph-top">
      ${back ? `<button type="button" class="btn-sec btn-sec--sm ph-back" data-phback="${esc(back)}" aria-label="${esc(t('ph.back'))}">←</button>`
        : code ? `<button type="button" class="btn-sec btn-sec--sm ph-back" data-phhome aria-label="${esc(t('ph.backHomeAria'))}" title="${esc(t('ph.backHomeTitle'))}">←</button>` : ''}
      <span class="brand-row"><span class="ph-emblem" data-emblem>${phoneEmblemHTML()}</span><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span class="ph-right">${code ? `<span class="ph-room">${esc(t('ph.room', { code }))}</span>` : ''}${code ? '<button type="button" class="net-pill" data-netpill aria-live="polite"></button>' : ''}${back && !['index', 'home'].includes(back) ? `<button type="button" class="ph-home" data-phhome aria-label="${esc(t('ph.homeAria'))}" title="${esc(t('home.nav.home'))}">🏠</button>` : ''}</span>
    </header>`;
}

// Tasto Indietro di Android (app): prima le schermate interne (profilo, aggiungi gioco), poi la home.
window.addEventListener('gnr:back', (e) => {
  const back = document.querySelector('[data-phback]');
  const to = back?.dataset.phback || '';
  if (to && !['index', 'home'].includes(to)) { e.preventDefault(); back.click(); return; }
  if (P.code) { e.preventDefault(); goHome(); }
});

/** Home: si esce dalla schermata, non dalla serata (si rientra con un tocco dalla home). */
function goHome() {
  const voting = P.state?.phase === 'voting' && P.players?.[P.uid] && !P.votes?.[P.state?.gameId]?.[P.uid] && document.querySelector('#sendVote');
  if (voting && !confirm(t('ph.leaveVoteConfirm'))) return;
  location.href = 'index.html';
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-phhome]')) { goHome(); return; }
  const b = e.target.closest('[data-phback]');
  if (!b) return;
  const to = b.dataset.phback;
  if (to === 'index') { location.href = 'index.html'; return; }
  if (to === 'home') { location.href = 'index.html'; return; }
  if (to.startsWith('room:')) { location.href = `play.html?room=${encodeURIComponent(to.slice(5))}`; return; }
  if (to === 'addgame') { P.addingGame = false; render(); return; }
  if (to === 'profile') { P.showProfile = false; render(); return; }
  if (to === 'profileEdit') { P.profileEdit = false; render(); return; }
});

// ---------------------------------------------------------------------------
// Stato della rete: 🟢 connesso · 🟡 offline · 🔵 in coda (azioni in attesa di invio)
// ---------------------------------------------------------------------------

const Net = {
  online: true,
  pending: new Map(),
  seq: 0,
  synced: [],
  toastTimer: null,
  setOnline(on) {
    if (on === this.online) return;
    this.online = on;
    if (!on) for (const it of this.pending.values()) it.queued = true;
    this.paint();
  },
  /** Segue un invio: se resta in sospeso (rete assente) compare "In coda", quando parte "✓ sincronizzato". */
  track(label, promise) {
    const id = ++this.seq;
    const item = { label, queued: !this.online };
    this.pending.set(id, item);
    const slow = setTimeout(() => { item.queued = true; this.paint(); }, 1500);
    const end = (ok) => {
      clearTimeout(slow);
      this.pending.delete(id);
      if (ok && item.queued) { this.synced.push(label); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.syncedToast(), 500); }
      this.paint();
    };
    promise.then(() => end(true), () => end(false));
    this.paint();
    return promise;
  },
  count() {
    const items = [...this.pending.values()];
    let n = items.filter((x) => x.queued).length;
    if (outboxPending() && !items.some((x) => x.label === 'vote')) n++;
    return n;
  },
  syncedToast() {
    const l = this.synced;
    this.synced = [];
    if (!l.length) return;
    toast(l.length === 1 ? `✓ ${t('ph.net.synced1', { what: netLabel(l[0]) })}` : `✓ ${t('ph.net.syncedN', { n: l.length })}`);
  },
  paint() {
    const n = this.count();
    const st = n ? 'queue' : this.online ? 'ok' : 'off';
    const html = st === 'ok' ? `<i class="net-dot"></i><span class="sr-only">${esc(t('ph.net.ok'))}</span>` : st === 'off' ? `<i class="net-dot"></i><span>${esc(t('ph.net.off'))}</span>` : `<i class="net-dot"></i><span>${esc(t('ph.net.queue', { n }))}</span>`;
    const title = st === 'ok' ? t('ph.net.okTitle') : st === 'off' ? t('ph.net.offTitle') : t('ph.net.queueTitle', { n });
    // Voto ancora in coda: la schermata "Voto inviato" lo dice chiaramente.
    const vt = document.getElementById('votedTitle');
    if (vt) {
      const queued = [...this.pending.values()].some((x) => x.label === 'vote' && x.queued) || (outboxPending() && !this.online);
      const txt = queued ? t('ph.vote.queued') : t('ph.vote.sent');
      if (vt.textContent !== txt) {
        vt.textContent = txt;
        document.getElementById('votedLead').textContent = queued ? t('ph.vote.queuedLead') : t('ph.vote.sentLead');
      }
    }
    document.querySelectorAll('[data-netpill]').forEach((el) => {
      if (el.dataset.st === st && el.dataset.n === String(n)) return;
      el.dataset.st = st;
      el.dataset.n = String(n);
      el.className = `net-pill net-pill--${st}`;
      el.innerHTML = html;
      el.title = title;
      el.setAttribute('aria-label', title);
    });
  }
};
document.addEventListener('click', (e) => {
  const pill = e.target.closest('[data-netpill]');
  if (pill) toast(pill.title, pill.dataset.st === 'ok' ? 'info' : 'warn');
});

/** Battito ogni 5 s: la TV capisce in 15 s se il telefono si è spento, bloccato o è senza rete. */
function ensureBeat() {
  if (P.hbTimer) return;
  const beat = () => {
    if (!P.code || !P.players?.[P.uid] || document.visibilityState !== 'visible' || !Net.online) return;
    set(roomRef(P.code, `hb/${P.uid}`), serverTimestamp()).catch(() => {});
  };
  P.hbTimer = setInterval(beat, 5000);
  document.addEventListener('visibilitychange', beat);
  beat();
}

// ---------------------------------------------------------------------------
// Codice stanza e modalità foto
// ---------------------------------------------------------------------------

function renderCodeEntry(error = '', value = '') {
  const last = value || normalizeCode(localStorage.getItem('gnr_room'));
  app.innerHTML = `
    <main class="phone phone--center">
      ${phoneTop('', 'home')}
      <h1 class="ph-title">${esc(t('ph.code.title'))}</h1>
      <p class="ph-lead">${esc(t('ph.code.lead'))}</p>
      <p class="form-error" role="alert">${esc(error)}</p>
      ${qrScanButtonHTML()}
      <form class="code-form" id="codeForm" novalidate>
        <label class="hub-or" for="codeInput">${esc(t('ph.code.label'))}</label>
        <input class="input code-input" id="codeInput" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2" value="${esc(last)}">
        <button class="btn-sec btn-block" type="submit">${esc(t('ph.code.go'))}</button>
      </form>
    </main>`;
  const input = $('#codeInput');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (code.length !== 4) {
      app.querySelector('.form-error').textContent = t('home.join.errLen');
      return;
    }
    location.search = `?room=${code}`;
  });
}

function renderPhotoMode(code) {
  app.innerHTML = `
    <main class="phone phone--center">
      ${phoneTop(code, `room:${code}`)}
      <div class="photo-ico">${ICONS.camera}</div>
      <h1 class="ph-title">${esc(t('ph.photo.title'))}</h1>
      <p class="ph-lead">${esc(t('ph.photo.lead'))}</p>
      <label class="btn btn-block" for="camInput">${ICONS.camera}<span>${esc(t('ph.photo.take'))}</span></label>
      <input type="file" id="camInput" accept="image/*" class="sr-only">
      <div id="photoPrev" class="photo-prev"></div>
      <p id="photoStatus" class="ph-lead" role="status"></p>
    </main>`;
  const input = $('#camInput');
  const status = $('#photoStatus');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    status.textContent = t('ph.photo.sending');
    try {
      const data = await gameImage(file);
      await set(roomRef(code, 'pendingImage'), { data, at: serverTimestamp() });
      $('#photoPrev').innerHTML = `<img src="${data}" alt="${esc(t('ph.photo.sentAlt'))}">`;
      status.textContent = t('ph.photo.sent');
    } catch (err) {
      status.textContent = err?.code ? explainError(err) : err.message;
    }
  });
}

// ---------------------------------------------------------------------------
// Stanza e rendering
// ---------------------------------------------------------------------------

function openRoom(code) {
  P.code = code;
  localStorage.setItem('gnr_room', code);
  app.innerHTML = loadingHTML(t('ph.entering'));
  for (const key of WATCHED) {
    onValue(roomRef(code, key), (snap) => {
      const val = snap.val();
      P[key] = (key === 'meta' || key === 'state' || key === 'poll') ? val : (val || {});
      P.loaded.add(key);
      render();
    }, (err) => showFatal(app, t('ph.connLost'), explainError(err)));
  }
  // Presenza: la TV vede se questo telefono è collegato e non lo aspetta se cade la linea.
  trackConnection((on) => { connectionStatus(on); Net.setOnline(on); }, code, P.uid);
}

const SCREENS = {};

// Timer condiviso: lo vedono tutti (chip in alto); la regia lo comanda dal suo foglio.
bindSharedTimer({
  role: 'phone', code: () => P.code, uid: () => P.uid, timer: () => P.timer, state: () => P.state,
  canControl: () => Boolean(P.code && P.cohosts?.[P.uid]), explainError,
  openPanel: () => TimerSheet.open(),
  onExpire: (v) => phoneExpire(v)
});

// Motivi del time-out: si salvano come codici, la TV li mostra nella sua lingua.
const TIMEOUT_REASONS = ['rules', 'bathroom', 'smoke', 'pizza', 'other'];
/** Nome di un invio in coda ("vote", "photo"…) nella lingua scelta. */
const netLabel = (l) => (has(`ph.net.label.${l}`) ? t(`ph.net.label.${l}`) : l);
/** Evento casuale della Modalità Chaos: testo nella lingua del telefono (le serate vecchie hanno il testo salvato). */
// Evento Chaos: dalla 1.10 la TV salva un codice neutro (k) con i parametri (p); i vecchi eventi hanno solo il testo.
const evParams = (ev) => Object.fromEntries(Object.entries(ev?.p || {}).map(([a, b]) => [a, String(b ?? '')]));
const eventTitle = (ev) => (ev?.k && has(`tv.chaos.${ev.k}.t`) ? t(`tv.chaos.${ev.k}.t`, evParams(ev)) : ev?.id && has(`chaos.${ev.id}.t`) ? t(`chaos.${ev.id}.t`) : ev?.title || '');
const eventText = (ev) => (ev?.k && has(`tv.chaos.${ev.k}.x`) ? t(`tv.chaos.${ev.k}.x`, evParams(ev)) : ev?.id && has(`chaos.${ev.id}.d`) ? t(`chaos.${ev.id}.d`) : ev?.text || '');

function watchGroup() {
  const gid = P.meta?.groupId;
  if (!gid || P.groupWatching === gid) return;
  P.groupWatching = gid;
  P.cohost = localStorage.getItem(`gnr_cohost_${P.code}`) === '1';
  const mid = profiles()[gid];
  if (mid) loadMember(mid).then((m) => { if (m && m.groupId === gid) { P.member = m; render(); } }).catch(() => {});
  // Con lo storico privato le serate si leggono solo da membri: la TV registra il telefono appena entra,
  // quindi se il permesso manca si riprova ogni 5 secondi (per qualche minuto).
  const listen = (key, tries = 0) => onValue(groupRef(gid, key), (snap) => {
    P[key] = snap.val() || (key === 'next' ? null : {});
    render();
  }, () => { if (tries < 36 && P.groupWatching === gid) setTimeout(() => listen(key, tries + 1), 5000); });
  for (const key of ['nights', 'identity', 'next', ...(P.meta?.armadioId ? [] : ['library'])]) listen(key);
}

/** I giochi della serata: dall'armadio collegato alla stanza (indipendente dal gruppo). */
function watchArmadio() {
  const aid = P.meta?.armadioId;
  if (!aid || P.armadioWatching === aid) return;
  P.armadioWatching = aid;
  onValue(armadioRef(aid, 'library'), (snap) => { P.library = snap.val() || {}; render(); }, () => {});
}

// ---------------------------------------------------------------------------
// Foto ricordo, prossima serata, ricordi
// ---------------------------------------------------------------------------

function photoButtonHTML() {
  if (!P.meta?.groupId) return '';
  return `<label class="btn-sec photo-btn" for="memPhoto">📸 <span>${esc(t('ph.mem.btn'))}</span></label>
    <input type="file" id="memPhoto" accept="image/*" class="sr-only">`;
}

/** Il gioco a cui si riferisce la foto: quello in corso o l'ultimo giocato. */
function currentGameName() {
  const g = P.games?.[P.state?.gameId];
  if (g) return g.name;
  const last = Object.values(P.games || {}).sort((a, b) => (b.order || 0) - (a.order || 0))[0];
  return P.state?.playName || last?.name || '';
}

document.addEventListener('change', async (e) => {
  if (e.target.id !== 'memPhoto') return;
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || !P.meta?.groupId) return;
  let data;
  try { data = await compressPhoto(f); } catch (err) { toast(err.message, 'error'); return; }
  const game = currentGameName();
  const sheet = document.createElement('div');
  sheet.className = 'overlay overlay--sheet';
  sheet.innerHTML = `
    <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="phTitle">
      <div class="panel-head"><h2 id="phTitle">${esc(t('ph.mem.btn'))}</h2><button type="button" class="icon-btn" data-phclose data-close aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
      <img class="photo-prev-big" src="${data}" alt="">
      <label class="field-label" for="phCaption">${esc(t('ph.mem.caption'))} <span class="muted">${esc(t('common.optional'))}</span></label>
      <input class="input" id="phCaption" maxlength="80" placeholder="${esc(game ? t('ph.mem.phGame', { game }) : t('ph.mem.ph'))}">
      <button type="button" class="btn btn-block" id="phSave">${esc(t('ph.mem.add'))}</button>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', async (ev) => {
    if (ev.target === sheet || ev.target.closest('[data-phclose]')) { sheet.remove(); return; }
    if (!ev.target.closest('#phSave')) return;
    ev.target.closest('#phSave').disabled = true;
    try {
      const gid = P.meta.groupId;
      await Net.track('photo', rated((x) => groupRef(gid, x), `photos/${P.code}`, 'photo', {
        data, uid: P.uid, by: P.players[P.uid]?.name || '', at: serverTimestamp(),
        caption: cleanName($('#phCaption', sheet).value, 80) || null, game: game || null
      }));
      sheet.remove();
      toast(t('ph.mem.added'));
    } catch (err) { toast(spamError(err), 'error'); ev.target.closest('#phSave').disabled = false; }
  });
});

/**
 * Invio con contatore anti-spam: insieme al dato si aggiorna rate/<uid>/<tipo>, e le regole
 * del database accettano un invio ogni pochi secondi (non si aggira togliendo i controlli dell'app).
 */
function rated(refOf, path, kind, data) {
  const key = push(refOf(path)).key;
  return update(refOf(''), { [`${path}/${key}`]: data, [`rate/${P.uid}/${kind}`]: serverTimestamp() });
}
const roomOf = (p) => roomRef(P.code, p);
function spamError(err) {
  return String(err?.code || err?.message || '').toLowerCase().includes('permission') ? t('ph.tooFast') : explainError(err);
}

const rsvpLabel = (a) => t(`ph.rsvp.${a}`);

/** Prossima serata con le presenze. gid/key/name: gruppo e persona che risponde. */
function nextNightHTML(next, key) {
  const at = Number(next?.at) || 0;
  if (!at) return `<p class="muted">${esc(t('ph.next.none'))}</p>`;
  const rs = Object.values(next.rsvp || {});
  const mine = next.rsvp?.[key]?.answer;
  const count = (a) => rs.filter((r) => r.answer === a).length;
  const yes = rs.filter((r) => r.answer === 'si').map((r) => r.name);
  return `
    <p class="next-when">${esc(fmtDate(at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}${next.place ? ` · ${esc(next.place)}` : ''}</p>
    <div class="rsvp-btns" role="group" aria-label="${esc(t('ph.rsvp.aria'))}">${['si', 'forse', 'no'].map((a) => `<button type="button" class="lib-chip" data-rsvp="${a}" aria-pressed="${mine === a}">${esc(rsvpLabel(a))} (${count(a)})</button>`).join('')}</div>
    ${yes.length ? `<p class="muted small">${esc(t('ph.rsvp.yesList', { names: yes.join(', ') }))}</p>` : ''}`;
}

async function answerRsvp(gid, key, name, answer) {
  await Net.track('rsvp', set(groupRef(gid, `next/rsvp/${key}`), { name, answer }));
  toast(t(`ph.rsvp.toast.${answer}`));
}

/** Dettaglio di una serata passata (con l'album), in un foglio sopra la pagina. */
async function openNightSheet(n, gid) {
  const sheet = document.createElement('div');
  sheet.className = 'overlay overlay--sheet';
  const names = Object.fromEntries(Object.entries(n.people || {}).map(([k, pp]) => [k, pp.name]));
  const quotes = Array.isArray(n.quotes) ? n.quotes : Object.values(n.quotes || {});
  sheet.innerHTML = `
    <div class="card sheet sheet--tall" role="dialog" aria-modal="true" aria-labelledby="nsTitle">
      <div class="panel-head"><h2 id="nsTitle">Game Night #${n.number}</h2><button type="button" class="icon-btn" data-nsclose data-close aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
      <p class="muted">${esc(fmtDate(Number(n.at), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${nightFacts(n)}</p>
      <div class="p-board"><ol>${[...n.gamesSorted].sort((a, b) => (b.n ? b.sum / b.n : 0) - (a.n ? a.sum / a.n : 0)).map((g, i) => `<li class="p-row"><span class="p-rank">${i + 1}</span><span class="p-name">${esc(g.name)}${(g.w || []).length ? ` <small>🏆 ${esc((Array.isArray(g.w) ? g.w : Object.values(g.w)).map((k) => names[k] || k).join(', '))}</small>` : ''}</span><span class="p-avg">${g.n ? fmt(g.sum / g.n) : '—'}</span></li>`).join('')}</ol></div>
      ${n.mvpNames.length ? `<p class="stats-line">👑<span>${esc(t('ph.ns.mvp'))} <b>${esc(n.mvpNames.join(', '))}</b></span></p>` : ''}
      ${n.winners.length ? `<p class="stats-line">🏆<span>${esc(t('ph.ns.winner'))} <b>${esc(n.winners.join(', '))}</b></span></p>` : ''}
      ${quotes.length ? `<h3>💬 ${esc(t('ph.ns.comments'))}</h3><ul class="quote-list">${quotes.slice(0, 6).map((q) => `<li>«${esc(q.text)}» <small>${esc(q.name)}, ${esc(q.game)}</small></li>`).join('')}</ul>` : ''}
      <h3>📸 ${esc(t('ph.ns.album'))}</h3><div class="album-mini" id="nsAlbum"><p class="muted">${esc(t('ph.ns.loadingPhotos'))}</p></div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet || ev.target.closest('[data-nsclose]')) sheet.remove(); });
  const snap = await get(groupRef(gid, `photos/${n.room}`)).catch(() => null);
  const photos = Object.values(snap?.val() || {}).filter((p) => p?.data).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  const box = $('#nsAlbum', sheet);
  if (box) box.innerHTML = photos.length ? photos.map((p) => `<figure><img src="${esc(p.data)}" alt="${esc(p.caption || t('ph.mem.btn'))}"><figcaption>${esc(p.caption || '')}</figcaption></figure>`).join('') : `<p class="muted">${esc(t('ph.ns.noPhotos'))}</p>`;
}

function render() {
  if (!WATCHED.every((k) => P.loaded.has(k))) return;
  if (P.meta && P.rememberedRoom !== P.code) { P.rememberedRoom = P.code; rememberNight(P.code, { group: P.meta.groupName, gid: P.meta.groupId }); }
  watchGroup();
  watchArmadio();
  flushOutbox();
  watchHeartbeat();
  if (!P.meta) {
    showFatal(app, t('ph.closed.title'), t('ph.closed.text'));
    return;
  }

  const me = P.players[P.uid];
  const banned = Boolean(P.meta?.banned?.[P.uid]);
  setRoomSafeMode(P.meta?.safeMode);
  if (me) { ensureBeat(); firstTimeHelp(me); }
  // "Bentornato Andrea 👋 Sei nella Game Night #48" quando si riapre la pagina già in partita.
  if (P.welcomed === undefined) {
    P.welcomed = true;
    if (me && !me.away) setTimeout(() => { const n = nightNo(); toast(`${t('ph.welcomeBack', { name: me.name })} 👋 ${n ? t('ph.inNight', { n: String(n) }) : t('ph.inRoom', { code: P.code })}`); }, 1400);
  }
  checkProfileGrant();
  if (P.claimSent && !P.claims?.[P.uid] && !P.claimCheck) {
    // La TV ha risposto alla richiesta di rientro: si aspetta un attimo che arrivino anche i dati del giocatore.
    P.claimCheck = setTimeout(() => {
      P.claimCheck = null;
      P.claimSent = false;
      const back = P.players[P.uid];
      if (back) toast(t('ph.claim.back', { name: back.name }));
      else toast(t('ph.claim.noConfirm'), 'warn');
      render();
    }, 800);
  }
  if (me) {
    P.wasIn = true;
  } else if (P.wasIn) {
    P.wasIn = false;
    P.profileEdit = false;
    toast(banned ? t('ph.removed') : t('ph.notInRoom'), 'warn');
  }

  const phase = P.state?.phase || 'lobby';
  const gid = P.state?.gameId || '';
  const count = activePlayers(P.players).length;
  const max = P.meta.maxPlayers || 8;

  let key;
  if (!me && banned) key = 'banned';
  else if (!me && (P.claims?.[P.uid] || P.claimCheck)) key = 'claim';
  else if (!me && P.meta?.locked) key = 'locked';
  else if (!me) key = count >= max ? 'full' : 'join';
  else if (me.away) key = 'away';
  else if (P.profileEdit) key = 'join';
  else if (phase === 'voting' && P.games[gid]) {
    key = (P.votes[gid]?.[P.uid] && !P.editingVote) ? `voted:${gid}` : `vote:${gid}`;
  } else if (P.state?.paused) key = 'pause';
  else if (phase === 'reveal' && P.games[gid]) key = `reveal:${gid}`;
  else if (phase === 'awards') key = P.state?.done ? 'awards:done' : 'awards:wait';
  else if (phase === 'poll' && P.poll) key = `poll:${P.poll.open ? 'open' : 'closed'}`;
  else if (P.addingGame && (P.meta.groupId || P.meta.armadioId)) key = 'addgame';
  else if (P.showProfile && ['lobby', 'idle', 'board', 'alltime', 'awards'].includes(phase)) key = 'profile';
  else if (phase === 'alltime') key = 'alltime';
  else key = { lobby: 'wait', idle: 'idle', board: 'board' }[phase] || 'wait';
  if (!['addgame'].includes(key) && !['lobby', 'idle', 'board', 'alltime'].includes(phase)) P.addingGame = false;

  const name = key.split(':')[0];
  keepAwake(['vote', 'voted', 'poll', 'reveal', 'claim'].includes(name));
  checkCohost();
  Regia.sync();
  Dock.sync();
  SharedTimer.sync();
  TimerSheet.update();
  Buzz.sync();
  QuizPhone.sync();
  if (key !== P.screenKey) {
    P.screen?.unmount?.();
    P.screenKey = key;
    P.screen = SCREENS[name];
    P.screen.mount(app);
    window.scrollTo(0, 0);
  }
  P.screen.update?.();
  paintPhoneIdentity();
  Net.paint();
}

/** La prima volta che si entra: tre righe su come funziona (una volta sola per telefono). */
function firstTimeHelp(me) {
  try { if (localStorage.getItem('gnr_tour_phone') === '1') return; localStorage.setItem('gnr_tour_phone', '1'); } catch { return; }
  setTimeout(() => {
    const sheet = document.createElement('div');
    sheet.className = 'overlay overlay--sheet';
    sheet.innerHTML = `
      <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="ftTitle">
        <h2 id="ftTitle">${esc(t('ph.ft.title', { name: me.name }))}</h2>
        <ol class="ft-list">
          <li>${t('ph.ft.1')}</li>
          <li>${t('ph.ft.2')}</li>
          <li>${t('ph.ft.3')}</li>
          <li>${esc(t('ph.ft.4'))}</li>
        </ol>
        <button type="button" class="btn btn-block" data-ftok data-close>${esc(t('ph.ft.ok'))}</button>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-ftok]')) sheet.remove(); });
  }, 900);
}

/** La TV ha confermato "è proprio Andrea": il profilo passa a questo telefono. */
async function checkProfileGrant() {
  const g = P.profileGrants?.[P.uid];
  if (!g?.mid || P.grantDone === g.mid) return;
  P.grantDone = g.mid;
  try {
    const m = await loadMember(g.mid);
    if (!m || m.groupId !== P.meta?.groupId) return;
    saveProfile(m.groupId, m.id);
    P.member = m;
    P.skipProfile = false;
    P.sameSkip = null;
    toast(t('ph.grant', { name: m.name }));
    if (!P.players[P.uid]) await joinAsMember(m);
    render();
  } catch (err) { toast(explainError(err), 'error'); }
}

/** Numero della serata nel gruppo (Game Night #N). */
function nightNo() {
  if (!P.meta?.groupId) return null;
  const nights = { ...(P.nights || {}) };
  if (!nights[P.code]) nights[P.code] = { at: Number(P.meta.createdAt) || Date.now(), games: { x: {} } };
  return nightsList(nights).find((n) => n.room === P.code)?.number || null;
}

function others() {
  return activePlayers(P.players)
    .filter((p) => p.uid !== P.uid)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), lang()));
}

function namesList(names) {
  return fmtList(names);
}

function miniBoardHTML(withTitle = true) {
  const board = buildBoard(P.games, P.votes);
  if (!board.length) return '';
  return `
    <div class="p-board">
      ${withTitle ? `<h2>${esc(t('ph.board'))}</h2>` : ''}
      <ol>${board.map((r) => `
        <li class="p-row">
          <span class="p-rank">${r.rank}</span>
          <span class="p-name">${esc(r.name)}</span>
          <span class="p-avg">${fmt(r.stats.avg)}</span>
        </li>`).join('')}</ol>
    </div>`;
}

// ---------------------------------------------------------------------------
// Ingresso: nome, personaggio, colore
// ---------------------------------------------------------------------------

function leaveNight() {
  if (!confirm(t('ph.leaveConfirm'))) return;
  update(roomRef(P.code, `players/${P.uid}`), { away: true })
    .catch((err) => toast(explainError(err), 'error'));
}

async function rejoinNight() {
  const me = P.players[P.uid];
  if (!me) return;
  const active = activePlayers(P.players);
  if (active.length >= (P.meta.maxPlayers || 8)) {
    toast(t('ph.full'), 'warn');
    return;
  }
  const patch = { away: null };
  const taken = new Set(active.map((p) => p.color));
  if (taken.has(me.color)) {
    const free = PLAYER_COLORS.find((c) => !taken.has(c));
    if (free) patch.color = free;
  }
  try {
    await update(roomRef(P.code, `players/${P.uid}`), patch);
    if (patch.color) toast(t('ph.colorTaken'));
  } catch (err) {
    toast(explainError(err), 'error');
  }
}

SCREENS.away = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="wait-hero wait-hero--away" id="awayMe"></div>
        <h1 class="ph-title">${esc(t('ph.away.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.away.lead'))}</p>
        <button type="button" class="btn btn-block" id="rejoinBtn">${esc(t('ph.away.rejoin'))}</button>
        <p class="muted center" id="awaySeats" aria-live="polite"></p>
      </main>`;
    $('#rejoinBtn', el).addEventListener('click', rejoinNight);
  },
  update() {
    const me = P.players[P.uid];
    const n = activePlayers(P.players).length;
    const max = P.meta.maxPlayers || 8;
    const full = n >= max;
    $('#awayMe').innerHTML = avatarHTML(me, '7rem', 'avatar--shadow');
    $('#rejoinBtn').disabled = full;
    $('#awaySeats').textContent = full ? t('ph.away.full') : t('ph.away.seats', { n, max });
  }
};

// Battito della TV: se smette per più di un minuto, i telefoni avvisano.
function watchHeartbeat() {
  if (P.beatTimer) {
    if (P.heartbeat !== P.lastBeatVal) { P.lastBeatVal = P.heartbeat; P.lastBeat = Date.now(); }
    return;
  }
  P.lastBeatVal = P.heartbeat;
  P.lastBeat = Date.now();
  P.beatTimer = setInterval(() => {
    const silent = Date.now() - P.lastBeat > 75000 && !(P.state?.phase === 'awards' && P.state?.done);
    let el = $('#tvBanner');
    if (silent && !el) {
      el = document.createElement('div');
      el.id = 'tvBanner';
      el.className = 'net-banner tv-banner';
      el.setAttribute('role', 'alert');
      el.innerHTML = `${ICONS.tv}<span>${esc(t('ph.tvSilent'))} ${P.cohost ? `<a href="host.html?room=${esc(P.code)}">${esc(t('ph.tvResume'))}</a>` : esc(t('ph.tvTell'))}</span>`;
      document.body.appendChild(el);
    }
    if (!silent && el) el.remove();
  }, 10000);
}

// Voti in uscita: restano sul telefono finché Firebase non conferma di averli ricevuti.
const outboxKey = () => `gnr_outbox_${P.code}`;
function outboxSave(gid, data) {
  try { localStorage.setItem(outboxKey(), JSON.stringify({ gid, data })); } catch { /* niente */ }
}
function outboxClear() {
  try { localStorage.removeItem(outboxKey()); } catch { /* niente */ }
  Net.paint();
}
function outboxPending() {
  try { return Boolean(P.code && localStorage.getItem(outboxKey())); } catch { return false; }
}
/** Se un voto non era stato confermato (rete caduta, pagina chiusa), lo reinvia appena possibile. */
function flushOutbox() {
  let ob = null;
  try { ob = JSON.parse(localStorage.getItem(outboxKey()) || 'null'); } catch { /* niente */ }
  if (!ob?.gid || P.flushing) return;
  const stillVoting = P.state?.phase === 'voting' && P.state?.gameId === ob.gid && !P.state?.paused;
  if (P.votes?.[ob.gid]?.[P.uid] || (!stillVoting && P.state?.phase !== 'voting')) { outboxClear(); return; }
  if (!stillVoting || !P.players[P.uid]) return;
  P.flushing = true;
  Net.track('vote', set(roomRef(P.code, `votes/${ob.gid}/${P.uid}`), { ...ob.data, at: serverTimestamp() }))
    .then(() => { outboxClear(); toast(t('ph.outboxSent')); })
    .catch(() => {})
    .finally(() => { P.flushing = false; });
}

// Note private: restano solo su questo telefono.
const NOTES_KEY = 'gnr_notes';
function privateNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch { return {}; }
}
function saveNote(key, game, text) {
  const all = privateNotes();
  if (text.trim()) all[key] = { game, text: text.slice(0, 300), at: Date.now() };
  else delete all[key];
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(all)); } catch { /* spazio pieno */ }
}

// Time-out: un pulsante sempre a portata di mano mette in pausa la serata con un fischio sulla TV.
/** Pulsante "Tavolo": time-out, soundboard sulla TV e pettegolezzi anonimi per il ticker. */
const Buzz = {
  el: null,
  label: '',
  extras() { return { board: Boolean(P.meta?.soundboard || P.cohost), ticker: Boolean(P.meta?.ticker) }; },
  sync() {
    const me = P.players?.[P.uid];
    const phase = P.state?.phase;
    const show = Boolean(me && !me.away && phase && !['lobby', 'awards'].includes(phase) && !P.state?.paused && !P.showProfile && !Dock.visible);
    const x = this.extras();
    const label = x.board || x.ticker ? `<span aria-hidden="true">📣</span><span>${esc(t('ph.buzz.table'))}</span>` : `<span aria-hidden="true">✋</span><span>${esc(t('ph.buzz.timeout'))}</span>`;
    if (show && !this.el) {
      this.el = document.createElement('button');
      this.el.type = 'button';
      this.el.className = 'buzz-fab';
      this.el.addEventListener('click', () => this.ask());
      document.body.appendChild(this.el);
      this.label = '';
    }
    if (show && this.label !== label) { this.el.innerHTML = label; this.label = label; }
    if (!show && this.el) { this.el.remove(); this.el = null; }
  },
  /** Fa partire un effetto sulla TV (pulsante con data-sfx). */
  async sendSfx(fx) {
    if (!this.cool('gnr_sfx_at', 4000, t('ph.buzz.sfxCool'))) return;
    try {
      await Net.track('sfx', rated(roomOf, 'sfx', 'sfx', { k: fx.dataset.sfx, by: P.uid, at: serverTimestamp(), regia: P.cohost || null }));
      localStorage.setItem('gnr_sfx_at', String(Date.now()));
      if (navigator.vibrate) navigator.vibrate(15);
      fx.classList.add('is-sent');
      setTimeout(() => fx.classList.remove('is-sent'), 600);
    } catch (err) { toast(spamError(err), 'error'); }
  },
  cool(key, ms, msg) {
    const last = Number(localStorage.getItem(key)) || 0;
    if (Date.now() - last < ms) { toast(msg, 'warn'); return false; }
    return true;
  },
  ask() {
    const x = this.extras();
    const sheet = document.createElement('div');
    sheet.className = 'overlay overlay--sheet';
    sheet.innerHTML = `
      <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="bzTitle">
        <div class="panel-head"><h2 id="bzTitle">${esc(x.board || x.ticker ? t('ph.buzz.table') : t('ph.buzz.timeoutTitle'))}</h2><button type="button" class="icon-btn" data-bzclose data-close aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        ${x.ticker ? `<section class="tb-sec"><h3>📰 ${esc(t('ph.gossip.title'))}</h3>
          <label class="sr-only" for="gsText">${esc(t('ph.gossip.aria'))}</label>
          <textarea class="input" id="gsText" maxlength="90" rows="2" placeholder="${esc(t('ph.gossip.ph'))}"></textarea>
          <div class="tb-row"><span class="muted small">${esc(t('ph.gossip.hint'))}</span><button type="button" class="btn-sec btn-sec--sm" id="gsSend">${esc(t('ph.send'))}</button></div></section>` : ''}
        ${x.board ? `<section class="tb-sec"><h3>🔊 ${esc(t('ph.sfx.title'))}</h3><div class="sfx-grid">${allSfx().map((m) => `<button type="button" class="sfx-btn" data-sfx="${esc(m.k)}"><span aria-hidden="true">${esc(m.icon)}</span><small>${esc(m.label)}</small></button>`).join('')}</div></section>` : ''}
        <section class="tb-sec"><h3>✋ ${esc(t('ph.buzz.timeout'))}</h3><p class="muted small">${esc(t('ph.buzz.lead'))}</p>
          <div class="tb-reasons">${TIMEOUT_REASONS.map((r) => `<button type="button" class="btn-sec" data-bz="${r}">${esc(t(`timeout.${r}`))}</button>`).join('')}</div></section>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', async (e) => {
      if (e.target === sheet || e.target.closest('[data-bzclose]')) { sheet.remove(); return; }
      const fx = e.target.closest('[data-sfx]');
      if (fx) { this.sendSfx(fx); return; }
      if (e.target.closest('#gsSend')) {
        const text = cleanName($('#gsText', sheet).value, 90);
        if (!text) { toast(t('ph.gossip.empty'), 'warn'); return; }
        if (!this.cool('gnr_gossip_at', 20000, t('ph.gossip.cool'))) return;
        try {
          await Net.track('gossip', rated(roomOf, 'gossip', 'gossip', { text, by: P.uid, at: serverTimestamp() }));
          localStorage.setItem('gnr_gossip_at', String(Date.now()));
          $('#gsText', sheet).value = '';
          toast(t('ph.gossip.sent'));
        } catch (err) { toast(spamError(err), 'error'); }
        return;
      }
      const b = e.target.closest('[data-bz]');
      if (!b) return;
      if (!this.cool('gnr_buzz_at', 30000, t('ph.buzz.cool'))) return;
      sheet.remove();
      try {
        // Il motivo si salva come codice (rules, bathroom…): la TV lo mostra nella sua lingua.
        await Net.track('timeout', rated(roomOf, 'buzz', 'buzz', { by: P.uid, reason: b.dataset.bz === 'other' ? null : b.dataset.bz, at: serverTimestamp() }));
        localStorage.setItem('gnr_buzz_at', String(Date.now()));
        if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
      } catch (err) { toast(spamError(err), 'error'); }
    });
  }
};

// ---------------------------------------------------------------------------
// Pronostico sul vincitore: si punta solo nei primi minuti della partita
// ---------------------------------------------------------------------------

const BET_MS = 5 * 60000;

function betCandidates() {
  const st = P.state || {};
  return (st.playPlayers ? Object.keys(st.playPlayers) : activePlayers(P.players).map((p) => p.uid))
    .map((u) => P.players[u] && { uid: u, ...P.players[u] }).filter((p) => p && !p.away);
}
/** null: nessuna partita; altrimenti { open, left (ms), mine, count } */
function betState() {
  const st = P.state || {};
  if (st.phase !== 'idle' || !st.playStart || !st.playId || betCandidates().length < 2) return null;
  const left = Number(st.playStart) + BET_MS - serverNow();
  const bets = P.bets?.[st.playId] || {};
  return { open: left > 0, left: Math.max(0, left), mine: bets[P.uid] || null, count: Object.keys(bets).length };
}
const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function betHTML() {
  const b = betState();
  if (!b) return `<p class="muted">${esc(t('ph.bet.notYet'))}</p>`;
  const st = P.state;
  const cand = betCandidates();
  return `
    <h2>🔮 ${esc(st.playName ? t('ph.bet.titleGame', { game: st.playName }) : t('ph.bet.title'))}</h2>
    <p class="bet-clock ${b.open ? '' : 'is-closed'}" data-betclock>${b.open ? `⏳ ${t('ph.bet.open', { left: `<b>${mmss(b.left)}</b>` })}` : `🔒 ${esc(t('ph.bet.closed'))}`}</p>
    <div class="bet-grid">${cand.map((p) => `<button type="button" class="bet-opt" data-bet="${esc(p.uid)}" aria-pressed="${b.mine === p.uid}" ${b.open ? '' : 'disabled'}>${avatarHTML(p, '2.6rem')}<span>${esc(p.uid === P.uid ? t('ph.you', { name: p.name }) : p.name)}</span></button>`).join('')}</div>
    <p class="muted small">${b.mine ? t(b.open ? 'ph.bet.mineOpen' : 'ph.bet.mine', { name: `<b>${esc(P.players[b.mine]?.name || '')}</b>` }) : esc(b.open ? t('ph.bet.reward') : t('ph.bet.missed'))}${b.count ? ` · ${esc(t('ph.bet.count', { n: b.count }))}` : ''}</p>`;
}

/** Riquadro sulla schermata: invita a pronosticare finché si può. */
function betBannerHTML() {
  const b = betState();
  if (!b || !b.open) return '';
  return `<button type="button" class="bet-banner ${b.mine ? 'is-done' : ''}" data-dock="bet">🔮 <span>${b.mine ? t('ph.bet.bannerMine', { name: `<b>${esc(P.players[b.mine]?.name || '')}</b>` }) : t('ph.bet.banner')}</span><small data-betclock-mini>${mmss(b.left)}</small></button>`;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-timer]')) TimerSheet.open();
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-bet]');
  if (!b || !P.state?.playId) return;
  if (!betState()?.open) { toast(t('ph.bet.closed'), 'warn'); return; }
  try {
    await Net.track('bet', set(roomRef(P.code, `bets/${P.state.playId}/${P.uid}`), b.dataset.bet));
    if (navigator.vibrate) navigator.vibrate(15);
  } catch (err) { toast(explainError(err), 'error'); }
});

// ---------------------------------------------------------------------------
// Barra in basso del telefono: piccole icone che aprono un pannello
// (pronostico, segnapunti, suoni sulla TV, giochi, time-out, profilo)
// ---------------------------------------------------------------------------

const Dock = {
  el: null,
  sheet: null,
  visible: false,
  sig: '',
  items() {
    const me = P.players?.[P.uid];
    const phase = P.state?.phase;
    if (!me || me.away || P.state?.paused || P.showProfile || P.addingGame || P.profileEdit) return [];
    if (!['lobby', 'idle', 'board', 'alltime', 'reveal'].includes(phase)) return [];
    const st = P.state || {};
    const playing = phase === 'idle' && st.playStart && st.playId;
    const imPlayer = playing && (!st.playPlayers || st.playPlayers[P.uid]);
    const b = betState();
    const board = Boolean(P.meta?.soundboard || P.cohost);
    const out = [];
    if (b) out.push({ k: 'bet', icon: '🔮', label: t('ph.dock.bet'), badge: b.open && !b.mine ? '!' : (b.open ? '' : '🔒') });
    if (imPlayer) out.push({ k: 'score', icon: '🧮', label: t('ph.dock.score') });
    if (board && phase !== 'lobby') out.push({ k: 'sfx', icon: '🔊', label: t('ph.dock.sfx') });
    if (P.meta?.groupId || P.meta?.armadioId) out.push({ k: 'games', icon: '📦', label: t('ph.dock.games') });
    if (phase !== 'lobby') out.push({ k: 'timeout', icon: '✋', label: t('ph.buzz.timeout') });
    out.push({ k: 'me', icon: '👤', label: t('ph.dock.me') });
    return out;
  },
  sync() {
    const items = this.items();
    this.visible = items.length > 0;
    document.body.classList.toggle('has-dock', this.visible);
    const sig = JSON.stringify(items);
    if (!this.visible) { this.el?.remove(); this.el = null; this.sig = ''; this.closeSheet(); return; }
    if (!this.el) {
      this.el = document.createElement('nav');
      this.el.className = 'ph-dock';
      this.el.setAttribute('aria-label', t('ph.dock.aria'));
      document.body.appendChild(this.el);
    }
    if (sig !== this.sig) {
      this.sig = sig;
      this.el.innerHTML = items.map((it) => `<button type="button" class="dock-btn" data-dock="${it.k}" aria-pressed="${this.sheet?.kind === it.k}"><span class="dock-ico" aria-hidden="true">${it.icon}</span><small>${esc(it.label)}</small>${it.badge ? `<i class="dock-badge">${it.badge}</i>` : ''}</button>`).join('');
    }
    if (this.sheet && !items.some((it) => it.k === this.sheet.kind)) this.closeSheet();
    this.refresh();
  },
  open(kind) {
    if (kind === 'games') { P.addingGame = true; render(); return; }
    if (kind === 'me') { P.showProfile = true; P.newCode = null; render(); return; }
    if (kind === 'timeout') { Buzz.ask(); return; }
    if (this.sheet?.kind === kind) { this.closeSheet(); return; }
    this.closeSheet();
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet dock-sheet';
    el.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true" aria-label="${esc(t(`ph.dock.${kind}`))}"><button type="button" class="icon-btn sheet-x" data-dockclose data-close aria-label="${esc(t('common.close'))}">${ICONS.x}</button><div class="dock-body"></div></div>`;
    document.body.appendChild(el);
    this.sheet = { kind, el, sig: '' };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-dockclose]')) { this.closeSheet(); return; }
      const fx = e.target.closest('[data-sfx]');
      if (fx) Buzz.sendSfx(fx);
    });
    this.refresh(true);
    this.sig = '';
    this.sync();
    this.timer = setInterval(() => { this.refresh(); paintSand(); }, 500);
  },
  closeSheet() {
    clearInterval(this.timer);
    if (!this.sheet) return;
    this.sheet.el.remove();
    this.sheet = null;
    this.sig = '';
  },
  /** Aggiorna il contenuto del pannello aperto se i dati sono cambiati. */
  refresh(force = false) {
    const sh = this.sheet;
    if (!sh) return;
    let html = '';
    if (sh.kind === 'bet') html = betHTML();
    else if (sh.kind === 'score') html = scoreHTML() || `<p class="muted">${esc(t('ph.score.notYet'))}</p>`;
    else if (sh.kind === 'sfx') html = `<h2>🔊 ${esc(t('ph.sfx.title'))}</h2><p class="muted small">${esc(t('ph.sfx.lead'))}</p><div class="sfx-grid sfx-grid--big">${allSfx().map((m) => `<button type="button" class="sfx-btn" data-sfx="${esc(m.k)}"><span aria-hidden="true">${esc(m.icon)}</span><small>${esc(m.label)}</small></button>`).join('')}</div>`;
    const sig = sh.kind === 'bet' ? html.replace(/<b>\d+:\d\d<\/b>/, '') : html;
    if (sh.kind === 'bet') { const c = sh.el.querySelector('[data-betclock] b'); const b = betState(); if (c && b?.open) c.textContent = mmss(b.left); }
    if (!force && sig === sh.sig) return;
    sh.sig = sig;
    $('.dock-body', sh.el).innerHTML = html.replace(/^\s*<section class="card ph-card[^"]*">/, '').replace(/<\/section>\s*$/, '');
  }
};

document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dock]');
  if (d) Dock.open(d.dataset.dock);
});

function myUnlockedHTML() {
  const me = P.players[P.uid];
  if (!me || !P.meta?.groupId || !P.nights?.[P.code]) return '';
  const got = newAchievements(P.nights, personKey(me), P.code, P.library);
  const pr = progressFor(P.nights, personKey(me), P.library);
  return `<div class="p-awards"><h2>${esc(t('ph.myNight'))}</h2>
    <p class="stats-line">⭐<span>${esc(t('ph.levelLine', { n: pr.level, name: pr.levelName, xp: pr.xp }))}</span></p>
    ${got.map((a) => `<p class="stats-line ach-new">${a.icon}<span>${esc(t('ph.achNew'))} <b>${esc(a.name)}</b> — ${esc(a.desc)}</span></p>`).join('')}</div>`;
}

function eventHTML() {
  const ev = P.state?.phase === 'idle' ? P.state.event : null;
  if (!ev) return '';
  return `<section class="card event-mini"><p class="event-kicker">🎲 ${esc(t('ph.event'))}</p><h2>${esc(eventTitle(ev))}</h2><p>${esc(eventText(ev))}</p></section>`;
}

// Bozza del voto: se la pagina si chiude a metà, riaprendola si ritrovano le scelte.
const draftKey = (gid) => `gnr_draft_${P.code}_${gid}`;

function loadDraft(gid) {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(gid)) || 'null');
    if (!d || typeof d !== 'object') return null;
    const v = emptyVote();
    for (const k of Object.keys(v)) if (d[k] !== undefined) v[k] = d[k];
    return Object.values(v).some((x) => x !== null) ? v : null;
  } catch { return null; }
}

function saveDraft(gid, v) {
  if (!gid || !Object.values(v).some((x) => x !== null)) return;
  try { localStorage.setItem(draftKey(gid), JSON.stringify(v)); } catch { /* spazio pieno: pazienza */ }
}

function clearDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(`gnr_draft_${P.code}_`)).forEach((k) => localStorage.removeItem(k));
  } catch { /* niente */ }
}

/** Foto profilo: ritaglio quadrato al centro, 256 px, compressa (selfie o galleria). */
function numOptions(max, emptyLabel) {
  return `<option value="">${esc(emptyLabel)}</option>` + Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${esc(t('lib.players', { n: i + 1 }))}</option>`).join('');
}

SCREENS.addgame = {
  mount(el) {
    this.image = null;
    this.sig = '';
    el.innerHTML = `
      <main class="phone">
        ${phoneTop(undefined, 'addgame')}
        <h1 class="ph-title">${esc(t('ph.ag.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.ag.lead'))}</p>
        <div class="tn-box" id="tnSum"></div>
        <button type="button" class="btn btn-block" id="scanBtn">📷 <span>${esc(t('ph.ag.barcode'))}</span></button>
        <details class="card ph-card ag-new" id="agNew"><summary>➕ ${esc(t('ph.ag.new'))}</summary>
        <div class="field field--stack">
          <label for="agName">${esc(t('ph.ag.name'))}</label>
          <input class="input" id="agName" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="${esc(t('ph.ag.namePh'))}">
        </div>
        <div class="ag-info" role="group" aria-labelledby="agInfoLabel">
          <span class="field-label" id="agInfoLabel">${esc(t('ph.ag.info'))} <span class="muted">${esc(t('common.optionalPl'))}</span></span>
          <div class="ag-row">
            <label class="sr-only" for="agMin">${esc(t('ph.ag.min'))}</label>
            <select class="input select" id="agMin">${numOptions(20, t('ph.ag.from'))}</select>
            <label class="sr-only" for="agMax">${esc(t('ph.ag.max'))}</label>
            <select class="input select" id="agMax">${numOptions(20, t('ph.ag.to'))}</select>
          </div>
          <label class="sr-only" for="agDur">${esc(t('ph.ag.dur'))}</label>
          <select class="input select" id="agDur"><option value="">${esc(t('ph.ag.durNone'))}</option>${[10, 15, 20, 30, 45, 60, 90, 120, 180].map((d) => `<option value="${d}">${esc(d === 180 ? t('ph.ag.minPlus', { n: d }) : t('lib.minutes', { n: d }))}</option>`).join('')}</select>
        </div>
        <label class="btn-sec photo-btn" for="agFile">${ICONS.camera}<span>${esc(t('ph.photo.take'))}</span></label>
        <input type="file" id="agFile" accept="image/*" class="sr-only">
        <div class="photo-prev" id="agPrev"></div>
        <label class="quick-toggle"><input type="checkbox" id="agBrought" checked><span>${esc(t('ph.ag.brought'))}</span></label>
        <p class="form-error" id="agErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="agSave">${esc(t('ph.ag.save'))}</button>
        </details>
        <button type="button" class="link-btn" id="agDone">${esc(t('common.done'))}</button>
        <div class="p-board" id="agList">
        </div>
      </main>`;
    const file = $('#agFile', el);
    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        this.image = await gameImage(f);
        $('#agPrev').innerHTML = `<img src="${this.image}" alt="${esc(t('img.gameAlt'))}">`;
        $('#agErr').textContent = '';
      } catch (err) {
        $('#agErr').textContent = err.message;
      }
    });
    $('#agName', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
    $('#agSave', el).addEventListener('click', () => this.save());
    $('#scanBtn', el).addEventListener('click', () => Scanner.open());
    if (!Object.keys(P.library || {}).length) $('#agNew', el).open = true;
    $('#agDone', el).addEventListener('click', () => { P.addingGame = false; render(); });
  },

  async save() {
    const input = $('#agName');
    const err = $('#agErr');
    const name = cleanName(input.value);
    if (!name) { err.textContent = t('ph.ag.errName'); input.focus(); return; }
    const num = (id) => Number($(id).value) || null;
    const info = Object.fromEntries(Object.entries({ minPlayers: num('#agMin'), maxPlayers: num('#agMax'), duration: num('#agDur') }).filter(([, v]) => v));
    if (info.minPlayers && info.maxPlayers && info.minPlayers > info.maxPlayers) {
      err.textContent = t('ph.ag.errMinMax');
      return;
    }
    const k = nameKey(name);
    const existing = Object.entries(P.library || {}).find(([, it]) => nameKey(it?.name) === k);
    const btn = $('#agSave');
    btn.disabled = true;
    try {
      if (existing) {
        const patch = { ...info };
        const hasImg = existing[1].image || existing[1].thumb;
        if (P.meta?.armadioId && (Object.keys(patch).length || (this.image && !hasImg))) await saveGame(P.meta.armadioId, existing[0], patch, this.image && !hasImg ? { full: this.image } : {});
        else if (!P.meta?.armadioId) { if (this.image && !existing[1].image) patch.image = this.image; if (Object.keys(patch).length) await update(libraryRef(P.meta, existing[0]), patch); }
        if (!Object.keys(patch).length && !(this.image && !hasImg) && !$('#agBrought').checked) { err.textContent = t('ph.ag.errExists'); btn.disabled = false; return; }
        if ($('#agBrought').checked) await markTonight(existing[0], true);
      } else {
        const me = P.players[P.uid];
        let key;
        if (P.meta?.armadioId) {
          key = newGameId(P.meta.armadioId);
          await saveGame(P.meta.armadioId, key, { name, addedBy: (me?.name || '').slice(0, 24), ...info }, { create: true, ...(this.image ? { full: this.image } : {}) });
          armLog(P.meta.armadioId, { op: 'add', item: key, name, by: me?.name || t('ph.phone') });
        } else {
          const r = push(libraryRef(P.meta));
          key = r.key;
          await set(r, { name, image: this.image || null, addedBy: me?.name || '', addedAt: serverTimestamp(), ...info });
        }
        if ($('#agBrought').checked) await markTonight(key, true);
      }
      toast(t('ph.ag.added', { name }));
      input.value = '';
      this.image = null;
      $('#agPrev').innerHTML = '';
      ['#agMin', '#agMax', '#agDur'].forEach((id) => { $(id).value = ''; });
      err.textContent = '';
    } catch (e) {
      err.textContent = explainError(e);
    }
    btn.disabled = false;
  },

  update() {
    const all = Object.values(P.library || {}).filter((it) => it?.name);
    const q = this.query || '';
    const tags = [...new Set(all.flatMap(tagsOf))];
    const people = Object.values(P.nights || {}).flatMap((n) => Object.entries(n?.people || {}).map(([key, pp]) => ({ key, name: pp.name })));
    const f = q.trim() ? parseQuery(q, people, tags) : {};
    if (q.trim() && !Object.keys(f).length) f.text = q.trim();
    const mineT = (it) => (P.tonight?.[it.id]?.[P.uid] ? 1 : 0);
    // Prima i giochi portati da me, poi i miei preferiti (personali: nessun altro li vede).
    const favs = P.meta?.armadioId ? Favs.ids(P.meta.armadioId) : new Set();
    const items = favFirst(searchLibrary(P.library, f, P.nights), favs).sort((a, b) => mineT(b) - mineT(a));
    const sig = JSON.stringify([all.map((it) => [it.name, Boolean(it.image), libInfo(it), it.status, it.loanTo, tagsOf(it)]), q, P.tonight, P.wish?.[P.uid], P.next?.bring, [...favs]]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#tnSum').innerHTML = tonightSummaryHTML();
    if (!$('#agSearch')) {
      $('#agList').innerHTML = `<h2>${esc(t('ph.ag.already'))}</h2><input class="input" type="search" id="agSearch" placeholder="${esc(t('ph.ag.searchPh'))}" aria-label="${esc(t('ph.ag.searchAria'))}"><ul class="lib-mini" id="agItems"></ul>`;
      $('#agSearch').addEventListener('input', (e) => { this.query = e.target.value; this.update(); });
    }
    $('#agList').hidden = !all.length;
    $('#agItems').innerHTML = items.length ? items.map((it) => {
      const st = !isAvailable(it) ? (it.status === 'prestato' && it.loanTo ? t('ph.ag.lentTo', { name: it.loanTo }) : (GAME_STATUS[it.status] || it.status).toLowerCase()) : '';
      const extra = [libInfo(it), it.mode ? GAME_MODES[it.mode] : '', tagsOf(it).slice(0, 2).map((tg) => `#${tg}`).join(' '), st].filter(Boolean).join(' · ');
      return gameRowHTML(it, extra);
    }).join('') : `<li class="muted">${esc(t('ph.ag.noMatch'))}</li>`;
  }
};

SCREENS.poll = {
  mount(el) {
    this.sig = '';
    const poll = P.poll;
    if (!poll.open) {
      const it = P.library?.[poll.winner] || { name: t('ph.poll.chosenGame') };
      el.innerHTML = `
        <main class="phone phone--center">
          ${phoneTop()}
          <span class="chip chip--tomato">${esc(poll.tie ? t('ph.poll.tie') : t('ph.poll.chosen'))}</span>
          <h1 class="ph-title">${esc(t('ph.poll.play', { game: it.name }))}</h1>
          <div class="card p-win">${gameImageHTML(it, 'game-img--vote')}</div>
          <p class="ph-lead">${esc(t('ph.poll.enjoy'))}</p>
        </main>`;
      return;
    }
    el.innerHTML = `
      <main class="phone">
        ${phoneTop()}
        <h1 class="ph-title">${esc(t('ph.poll.title'))}</h1>
        <p class="ph-lead" id="pollLead">${esc(t('ph.poll.lead1'))}</p>
        <div class="poll-pick" id="pollPick" role="group" aria-label="${esc(t('ph.poll.aria'))}"></div>
        <p class="muted center" id="pollMine" aria-live="polite"></p>
      </main>`;
    $('#pollPick', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      const max = Math.max(1, Number(P.poll?.max) || 1);
      const id = b.dataset.opt;
      let mine = pollChoices(P.poll?.votes?.[P.uid], max);
      if (max === 1) mine = [id];
      else if (mine.includes(id)) mine = mine.filter((x) => x !== id);
      else if (mine.length >= max) { toast(t('ph.poll.max', { n: max }), 'warn'); return; }
      else mine = [...mine, id];
      try {
        await Net.track('poll', set(roomRef(P.code, `poll/votes/${P.uid}`), pollValue(mine)));
        if (navigator.vibrate) navigator.vibrate(20);
      } catch (err) {
        toast(explainError(err), 'error');
      }
    });
  },
  update() {
    const poll = P.poll;
    if (!poll?.open) return;
    const opts = asList(poll.options).filter((id) => P.library?.[id]);
    const max = Math.max(1, Number(poll.max) || 1);
    const mine = pollChoices(poll.votes?.[P.uid], max).filter((id) => P.library?.[id]);
    const sig = JSON.stringify([opts, mine, max, opts.map((id) => (P.library[id].image || '').length)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#pollLead').textContent = max > 1 ? t('ph.poll.leadN', { n: max }) : t('ph.poll.lead1');
    $('#pollPick').innerHTML = opts.map((id) => {
      const it = P.library[id];
      const on = mine.includes(id);
      return `
        <button type="button" class="poll-opt" aria-pressed="${on}" aria-checked="${on}" data-opt="${esc(id)}">
          ${gameImageHTML(it, 'game-img--opt')}
          <span class="poll-opt-name">${esc(it.name)}</span>
          ${libInfo(it) ? `<span class="poll-opt-meta">${esc(libInfo(it))}</span>` : ''}
          ${on ? `<span class="poll-opt-check">${max > 1 ? mine.indexOf(id) + 1 : ICONS.check}</span>` : ''}
        </button>`;
    }).join('');
    const names = mine.map((id) => P.library[id].name);
    $('#pollMine').textContent = names.length
      ? (max > 1 ? t('ph.poll.mineN', { games: names.join(', '), n: names.length, max }) : t('ph.poll.mine1', { games: names.join(', ') }))
      : (max > 1 ? t('ph.poll.noneN', { n: max }) : t('ph.poll.none1'));
  }
};

function allTimeHTML(limit = 10) {
  const at = buildAllTime(P.nights, P.library);
  if (!at.games.length) return `<p class="muted">${esc(t('ph.at.none'))}</p>`;
  return `
    <div class="p-board">
      <ol>${at.games.slice(0, limit).map((r) => `
        <li class="p-row">
          <span class="p-rank">${r.rank}</span>
          <span class="p-name">${esc(r.name)}</span>
          <span class="p-avg">${fmt(r.avg)}</span>
        </li>`).join('')}</ol>
    </div>
    ${at.mvp.length ? `<p class="p-at-mvp">${ICONS.crown}<span>${t('ph.at.mvp', { name: `<b>${esc(at.mvp[0].name)}</b>`, n: at.mvp[0].votes })}</span></p>` : ''}
    ${at.wins.length ? `<p class="p-at-mvp">${ICONS.trophy}<span>${t('ph.at.wins', { name: `<b>${esc(at.wins[0].name)}</b>`, n: at.wins[0].wins })}</span></p>` : ''}`;
}

SCREENS.alltime = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.star}</div>
        <h1 class="ph-title">${esc(t('ph.at.title'))}</h1>
        <p class="ph-lead" id="atLead"></p>
        <div class="full-width" id="atBox"></div>
        ${addGameButton()}
        <div class="ph-links"><button type="button" class="link-btn" data-myprofile>${esc(t('ph.myProfile'))}</button></div>
      </main>`;
    bindAddGame(el);
  },
  update() {
    const sig = JSON.stringify([P.nights, Object.keys(P.library || {}).length]);
    if (sig === this.sig) return;
    this.sig = sig;
    const n = Object.keys(P.nights || {}).length;
    $('#atLead').textContent = `${P.meta.groupName || t('ph.at.group')}: ${t('home.tr.nights', { n })}`;
    $('#atBox').innerHTML = allTimeHTML();
  }
};

/** Giocatori che si possono "riprendere" da un telefono nuovo: scollegati o usciti. */
function reclaimable() {
  const pres = P.presence || {};
  if (!Object.keys(pres).length) return [];
  return sortedPlayers(P.players).filter((p) => !pres[p.uid]);
}

/** "Entra come Andrea" se il telefono ha già un profilo per questo gruppo. */
function profileJoinHTML() {
  const person = Person.data?.info;
  if (person && !P.skipProfile && (!P.member || P.member.id === Person.data.groups?.[P.meta?.groupId])) {
    const look = person;
    const back = P.member && Object.values(P.players).some((p) => p.memberId === P.member.id);
    return `
      <section class="card profile-join">
        <div class="home-me">${avatarHTML(look, '3.6rem', 'avatar--shadow')}<div><b class="home-name">${esc(t('ph.pj.hello', { name: look.name }))}</b><span class="muted">${esc(t('ph.pj.ready'))}</span></div></div>
        <button type="button" class="btn btn-block" id="joinPerson">${esc(t(back ? 'ph.pj.rejoinAs' : 'ph.pj.joinAs', { name: look.name }))}</button>
        <button type="button" class="link-btn" id="notMe">${esc(t('ph.pj.other'))}</button>
      </section>`;
  }
  if (!P.meta?.groupId) return '';
  if (P.member && !P.skipProfile) {
    return `
      <section class="card profile-join">
        <div class="home-me">${avatarHTML(P.member, '3.6rem', 'avatar--shadow')}<div><b class="home-name">${esc(t('ph.pj.hello', { name: P.member.name }))}</b><span class="muted">${esc(t('ph.pj.readyMember'))}</span></div></div>
        <button type="button" class="btn btn-block" id="joinMember">${esc(t(Object.values(P.players).some((p) => p.memberId === P.member.id) ? 'ph.pj.rejoinAs' : 'ph.pj.joinAs', { name: P.member.name }))}</button>
        <button type="button" class="link-btn" id="notMe">${esc(t('ph.pj.notMe', { name: P.member.name }))}</button>
      </section>`;
  }
  return `
    <details class="profile-code">
      <summary>${esc(t('ph.pj.haveCode'))}</summary>
      <div class="profile-code-row">
        <label class="sr-only" for="pcInput">${esc(t('ph.pj.codeAria'))}</label>
        <input class="input code-input code-input--6" id="pcInput" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123">
        <button type="button" class="btn-sec" id="pcGo">${esc(t('home.link.oldGo'))}</button>
      </div>
      <p class="form-error" id="pcErr" role="alert"></p>
    </details>`;
}

function bindProfileJoin(root) {
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#notMe')) { P.skipProfile = true; $('#profileBox').innerHTML = profileJoinHTML(); return; }
    if (e.target.closest('#joinPerson')) {
      const b = e.target.closest('#joinPerson');
      b.disabled = true;
      try { await joinAsPerson(); } catch (err) { toast(err.user ? err.message : explainError(err), 'error'); b.disabled = false; render(); }
      return;
    }
    if (e.target.closest('#joinMember')) {
      e.target.closest('#joinMember').disabled = true;
      try { await joinAsMember(P.member); } catch (err) { toast(explainError(err), 'error'); render(); }
      return;
    }
    if (e.target.closest('#pcGo')) {
      const id = normalizeCode($('#pcInput').value, 6);
      try {
        const m = await loadMember(id);
        if (!m) { $('#pcErr').textContent = t('home.code6.none'); return; }
        if (m.groupId !== P.meta.groupId) { $('#pcErr').textContent = t('ph.pj.otherGroup'); return; }
        saveProfile(m.groupId, m.id);
        Person.linkGroup(m.groupId, m.id).catch(() => {});
        P.member = m;
        P.skipProfile = false;
        $('#profileBox').innerHTML = profileJoinHTML();
      } catch (err) {
        $('#pcErr').textContent = explainError(err);
      }
    }
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'pcInput') e.target.value = normalizeCode(e.target.value, 6); });
}

/**
 * Entra con il profilo personale: nel gruppo della stanza usa (o crea) il profilo di gruppo collegato,
 * così classifica di sempre e traguardi continuano da dove erano.
 */
async function joinAsPerson() {
  const look = lookOf(Person.data.info);
  const gid = P.meta?.groupId;
  if (!gid) {
    if (Object.entries(P.players).some(([uid, p]) => uid !== P.uid && nameKey(p.name) === nameKey(look.name))) throw userError(t('ph.pj.sameName', { name: look.name }));
    const active = activePlayers(P.players);
    if (!P.players[P.uid] && active.length >= (P.meta.maxPlayers || 8)) throw userError(t('ph.roomFull'));
    const taken = new Set(active.filter((p) => p.uid !== P.uid).map((p) => p.color));
    const color = taken.has(look.color) ? (PLAYER_COLORS.find((c) => !taken.has(c)) || look.color) : look.color;
    await set(roomRef(P.code, `players/${P.uid}`), { name: look.name, style: look.style, seed: look.seed, color, opts: look.opts || null, photo: look.photo || null, motto: look.motto || null, memberId: null, joinedAt: P.players[P.uid]?.joinedAt || serverTimestamp() });
    localStorage.setItem('gnr_name', look.name);
    return;
  }
  let mid = Person.data.groups?.[gid] || profiles()[gid] || null;
  let m = mid ? await loadMember(mid).catch(() => null) : null;
  if (m && m.groupId !== gid) m = null;
  if (!m) {
    mid = await createMember({ ...look, groupId: gid, opts: look.opts || null, photo: look.photo || null, motto: look.motto || null });
    m = { id: mid, ...look, groupId: gid };
  } else {
    await Person.pushLookToMember(m.id, gid).catch(() => {});
    m = { ...m, ...look };
  }
  saveProfile(gid, m.id);
  await Person.linkGroup(gid, m.id).catch(() => {});
  P.member = m;
  await joinAsMember(m);
}

/** Entra nella stanza con il profilo salvato (o rientra al proprio posto se c'era già). */
async function joinAsMember(m) {
  const prev = Object.entries(P.players).find(([uid, p]) => p.memberId === m.id && uid !== P.uid);
  if (prev) {
    // Il profilo è già in partita da un altro telefono: la TV lo riconosce dal codice personale.
    P.claimSent = true;
    await set(roomRef(P.code, `claims/${P.uid}`), { target: prev[0], code: m.id, at: serverTimestamp() });
    return;
  }
  if (Object.entries(P.players).some(([uid, p]) => uid !== P.uid && nameKey(p.name) === nameKey(m.name))) {
    throw userError(t('ph.pj.sameNameMember', { name: m.name }));
  }
  const active = activePlayers(P.players);
  if (active.length >= (P.meta.maxPlayers || 8)) throw userError(t('ph.roomFull'));
  const taken = new Set(active.map((p) => p.color));
  const color = taken.has(m.color) ? (PLAYER_COLORS.find((c) => !taken.has(c)) || m.color) : m.color;
  await set(roomRef(P.code, `players/${P.uid}`), {
    name: m.name, style: m.style, seed: m.seed, color, memberId: m.id, joinedAt: serverTimestamp(),
    opts: m.opts || null, photo: m.photo || null, motto: m.motto || null
  });
  localStorage.setItem('gnr_name', m.name);
}

function reclaimHTML() {
  const list = reclaimable();
  if (!list.length) return '';
  return `
    <section class="card reclaim">
      <h2>${esc(t('ph.rc.title'))}</h2>
      <p class="muted">${esc(t('ph.rc.lead'))}</p>
      <div class="reclaim-list">${list.map((p) => `
        <button type="button" class="reclaim-btn" data-claim="${esc(p.uid)}">
          ${avatarHTML(p, '2.6rem')}<span>${esc(p.name)}</span><b>${esc(t('ph.rc.me'))}</b>
        </button>`).join('')}</div>
    </section>`;
}

function bindReclaim(el) {
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-claim]');
    if (!b) return;
    const p = P.players[b.dataset.claim];
    const mine = P.member && p?.memberId === P.member.id;
    if (!p || (!mine && !confirm(t('ph.rc.confirm', { name: p.name })))) return;
    try {
      P.claimSent = true;
      await set(roomRef(P.code, `claims/${P.uid}`), mine
        ? { target: b.dataset.claim, code: P.member.id, at: serverTimestamp() }
        : { target: b.dataset.claim, at: serverTimestamp() });
    } catch (err) {
      P.claimSent = false;
      toast(explainError(err), 'error');
    }
  });
}

SCREENS.claim = {
  mount(el) {
    const target = P.players[P.claims?.[P.uid]?.target];
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="wait-hero">${avatarHTML(target, '7rem', 'avatar--shadow')}</div>
        <h1 class="ph-title">${esc(t('ph.claim.title'))}</h1>
        <p class="ph-lead">${t('ph.claim.lead', { name: `<b>${esc(target?.name || t('person.defaultName'))}</b>` })}</p>
        <button type="button" class="link-btn" id="claimCancel">${esc(t('common.cancel'))}</button>
      </main>`;
    P.claimSent = true;
    $('#claimCancel', el).addEventListener('click', () => {
      P.claimSent = false;
      set(roomRef(P.code, `claims/${P.uid}`), null).catch(() => {});
    });
  }
};

SCREENS.pause = {
  mount(el) {
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.clock}</div>
        <h1 class="ph-title">${esc(t('ph.pause.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.pause.lead'))}</p>
        <p class="muted">${esc(t('ph.pause.draft'))}</p>
      </main>`;
  }
};

SCREENS.full = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <h1 class="ph-title">${esc(t('ph.full.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.full.lead'))}</p>
        <div class="full-width" id="profileBox"></div>
        <div class="full-width" id="reclaimBox"></div>
      </main>`;
    bindReclaim($('main', el));
    knock('full');
    bindProfileJoin($('main', el));
  },
  update() {
    // Se il mio profilo è già in partita (es. dal vecchio telefono), posso riprendermi il posto.
    const mineInRoom = P.member && Object.values(P.players).some((p) => p.memberId === P.member.id);
    const sig = JSON.stringify([reclaimable().map((p) => [p.uid, p.name]), mineInRoom && !P.skipProfile]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#profileBox').innerHTML = mineInRoom ? profileJoinHTML() : '';
    $('#reclaimBox').innerHTML = reclaimHTML();
  }
};

SCREENS.locked = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <p class="lock-big" aria-hidden="true">🔒</p>
        <h1 class="ph-title">${esc(t('ph.closed.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.locked.lead'))}</p>
        <div class="full-width" id="profileBox"></div>
        <div class="full-width" id="reclaimBox"></div>
      </main>`;
    bindReclaim($('main', el));
    bindProfileJoin($('main', el));
    knock('locked');
  },
  update() { SCREENS.full.update.call(this); }
};

SCREENS.banned = {
  mount(el) {
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <p class="lock-big" aria-hidden="true">⛔</p>
        <h1 class="ph-title">${esc(t('ph.away.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.banned.lead'))}</p>
      </main>`;
    knock('banned');
  }
};

SCREENS.join = {
  mount(el) {
    const me = P.players[P.uid];
    if (!P.form) {
      const options = avatarOptions(9);
      if (me) options[0] = { style: me.style, seed: me.seed };
      const pi = !me ? Person.data?.info : null;
      if (pi) options[0] = { style: pi.style, seed: pi.seed };
      P.form = {
        name: me?.name || pi?.name || localStorage.getItem('gnr_name') || '',
        options,
        pick: 0,
        color: me?.color || pi?.color || null,
        opts: me?.opts ? { ...me.opts } : pi?.opts ? { ...pi.opts } : {},
        photo: me?.photo || pi?.photo || null,
        motto: me?.motto || pi?.motto || ''
      };
    }
    el.innerHTML = `
      <main class="phone">
        ${phoneTop(undefined, me ? 'profileEdit' : 'home')}
        ${me ? '' : `<div id="profileBox">${profileJoinHTML()}</div><div id="reclaimBox"></div>`}
        <h1 class="ph-title">${esc(me ? t('home.me.title') : t('ph.join.who'))}</h1>
        <div class="me-row">
          <span id="mePreview"></span>
          <div class="field">
            <label for="nameInput">${esc(t('home.ed.name'))}</label>
            <input class="input" id="nameInput" maxlength="16" autocomplete="nickname" enterkeyhint="done" placeholder="${esc(t('home.ed.namePh'))}" value="${esc(P.form.name)}">
          </div>
        </div>
        <div id="sameName"></div>
        <div class="ph-row">
          <h2 id="avLabel">${esc(t('ph.join.pick'))}</h2>
          <button type="button" class="btn-sec btn-sec--sm" id="reroll">${ICONS.refresh}<span>${esc(t('home.ed.more'))}</span></button>
        </div>
        <div class="av-grid" id="avGrid" role="radiogroup" aria-labelledby="avLabel"></div>
        <div class="av-tools">
          <button type="button" class="btn-sec btn-sec--sm" id="editAv" aria-expanded="false" aria-controls="avEditor">${ICONS.edit}<span>${esc(t('ph.join.custom'))}</span></button>
          <label class="btn-sec btn-sec--sm" for="selfieIn">${ICONS.camera}<span>${esc(t('home.ed.selfie'))}</span></label>
          <input type="file" id="selfieIn" accept="image/*" capture="user" class="sr-only">
          <label class="btn-sec btn-sec--sm" for="galleryIn">${ICONS.image}<span>${esc(t('home.ed.gallery'))}</span></label>
          <input type="file" id="galleryIn" accept="image/*" class="sr-only">
          <button type="button" class="link-btn" id="noPhoto" hidden>${esc(t('home.ed.noPhoto'))}</button>
        </div>
        <div class="av-editor" id="avEditor" hidden></div>
        <div class="field field--stack">
          <label for="mottoInput">${esc(t('ph.join.motto'))} <span class="muted">${esc(t('home.ed.mottoHint'))}</span></label>
          <input class="input" id="mottoInput" maxlength="40" autocomplete="off" placeholder="${esc(t('home.ed.mottoPh'))}" value="${esc(P.form.motto)}">
        </div>
        <h2 id="colorLabel">${esc(t('home.ed.color'))}</h2>
        <div class="swatches" id="swatches" role="radiogroup" aria-labelledby="colorLabel"></div>
        <p class="form-error" id="joinErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="joinBtn">${esc(me ? t('ph.join.save') : t('ph.join.go'))}</button>
        ${me ? `<button type="button" class="link-btn" id="cancelEdit">${esc(t('common.cancel'))}</button>` : ''}
      </main>`;

    const nameInput = $('#nameInput', el);
    nameInput.addEventListener('input', () => { P.form.name = nameInput.value; this.paintPreview(); this.paintSameName(); });
    $('#sameName', el).addEventListener('click', async (e) => {
      if (e.target.closest('#snOther')) { P.sameSkip = nameKey(P.form.name); this.paintSameName(); return; }
      const ask = e.target.closest('#snAsk');
      if (ask) {
        ask.disabled = true;
        try {
          await set(roomRef(P.code, `profileClaims/${P.uid}`), { mid: ask.dataset.mid, name: cleanName(P.form.name, 16) || '?', at: serverTimestamp() });
        } catch (err) { $('#snErr').textContent = explainError(err); ask.disabled = false; }
        return;
      }
      if (!e.target.closest('#snGo')) return;
      const id = normalizeCode($('#snCode').value, 6);
      try {
        const m = await loadMember(id);
        if (!m || m.groupId !== P.meta.groupId) { $('#snErr').textContent = t('ph.sn.badCode'); return; }
        saveProfile(m.groupId, m.id);
        Person.linkGroup(m.groupId, m.id).catch(() => {});
        P.member = m;
        P.skipProfile = false;
        const box = $('#profileBox');
        if (box) box.innerHTML = profileJoinHTML();
        this.paintSameName();
        box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(t('ph.sn.found', { name: m.name }));
      } catch (err) { $('#snErr').textContent = explainError(err); }
    });
    $('#sameName', el).addEventListener('input', (e) => { if (e.target.id === 'snCode') e.target.value = normalizeCode(e.target.value, 6); });
    this.paintSameName();
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } });

    $('#reroll', el).addEventListener('click', () => {
      P.form.options = avatarOptions(9);
      P.form.pick = 0;
      this.paintGrid();
      this.paintPreview();
    });
    $('#avGrid', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      P.form.pick = Number(b.dataset.pick);
      P.form.opts = {};
      P.form.photo = null;
      this.paintGrid();
      this.paintPreview();
      this.paintEditor();
    });
    $('#editAv', el).addEventListener('click', (e) => {
      const box = $('#avEditor');
      box.hidden = !box.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!box.hidden));
      this.paintEditor();
    });
    $('#avEditor', el).addEventListener('click', (e) => {
      const o = P.form.options[P.form.pick];
      const part = avatarParts(o.style).find((p) => p.key === (e.target.closest('[data-ed]')?.dataset.ed || e.target.closest('[data-edc]')?.dataset.edc));
      if (!part) return;
      P.form.photo = null;
      const c = e.target.closest('[data-edc]');
      if (c) { P.form.opts[part.key] = c.dataset.v; }
      else {
        const dir = Number(e.target.closest('[data-ed]').dataset.dir);
        const cur = P.form.opts[part.key];
        const list = part.optional ? ['none', ...part.values] : part.values;
        const i = cur === undefined ? (dir > 0 ? -1 : 0) : list.indexOf(cur);
        P.form.opts[part.key] = list[(i + dir + list.length) % list.length];
      }
      this.paintEditor();
      this.paintPreview();
    });
    const takePhoto = async (input) => {
      const f = input.files[0];
      input.value = '';
      if (!f) return;
      try {
        P.form.photo = await squarePhoto(f);
        this.paintPreview();
      } catch (err) { if (!err.cancelled) toast(err.message || t('common.photoUnreadable'), 'error'); }
    };
    $('#selfieIn', el).addEventListener('change', (e) => takePhoto(e.target));
    $('#galleryIn', el).addEventListener('change', (e) => takePhoto(e.target));
    $('#noPhoto', el).addEventListener('click', () => { P.form.photo = null; this.paintPreview(); });
    $('#mottoInput', el).addEventListener('input', (e) => { P.form.motto = e.target.value; });
    $('#swatches', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b || b.disabled) return;
      P.form.color = b.dataset.color;
      this.paintSwatches();
      this.paintGrid();
      this.paintPreview();
    });
    $('#joinBtn', el).addEventListener('click', () => this.submit());
    this.reclaimSig = null;
    this.profileSig = JSON.stringify([P.member?.id, P.skipProfile]);
    bindReclaim($('main', el));
    bindProfileJoin($('main', el));
    $('#cancelEdit', el)?.addEventListener('click', () => {
      P.profileEdit = false;
      P.form = null;
      render();
    });

    this.paintSwatches();
    this.paintGrid();
    this.paintPreview();
  },

  update() {
    this.paintSameName();
    const pbox = $('#profileBox');
    if (pbox) {
      const psig = JSON.stringify([P.member?.id, P.skipProfile]);
      if (psig !== this.profileSig) { this.profileSig = psig; pbox.innerHTML = profileJoinHTML(); }
    }
    const box = $('#reclaimBox');
    if (box) {
      const sig = JSON.stringify(reclaimable().map((p) => [p.uid, p.name]));
      if (sig !== this.reclaimSig) { this.reclaimSig = sig; box.innerHTML = reclaimHTML(); }
    }
    // I colori presi dagli altri possono cambiare mentre si compila.
    this.paintSwatches();
    this.paintGrid();
    this.paintPreview();
  },

  unmount() {
    P.form = null;
  },

  takenColors() {
    return new Set(activePlayers(P.players).filter((p) => p.uid !== P.uid).map((p) => p.color));
  },

  paintSwatches() {
    const taken = this.takenColors();
    const free = PLAYER_COLORS.filter((c) => !taken.has(c));
    const allTaken = free.length === 0;
    if (!P.form.color || (!allTaken && taken.has(P.form.color))) P.form.color = free[0] || PLAYER_COLORS[0];
    $('#swatches').innerHTML = PLAYER_COLORS.map((c, i) => {
      const disabled = !allTaken && taken.has(c);
      const checked = c === P.form.color;
      return `<button type="button" class="swatch" role="radio" aria-checked="${checked}" aria-label="${esc(t(disabled ? 'ph.join.colorTaken' : 'ph.join.colorN', { n: i + 1 }))}" data-color="${c}" style="--sc:${c}" ${disabled ? 'disabled' : ''}></button>`;
    }).join('');
  },

  paintGrid() {
    const color = safeColor(P.form.color);
    $('#avGrid').innerHTML = P.form.options.map((o, i) => `
      <button type="button" class="av-opt" role="radio" aria-checked="${i === P.form.pick}" aria-label="${esc(t('home.ed.characterN', { n: i + 1 }))}" data-pick="${i}" style="--pc:${color}">
        <img src="${avatarUri(o.style, o.seed)}" alt="" draggable="false">
      </button>`).join('');
  },

  paintPreview() {
    const o = P.form.options[P.form.pick];
    $('#mePreview').innerHTML = avatarHTML({ ...o, opts: P.form.opts, photo: P.form.photo, color: P.form.color, name: P.form.name }, '5.6rem', 'avatar--shadow');
    const np = $('#noPhoto');
    if (np) np.hidden = !P.form.photo;
  },

  /** Editor del personaggio: una riga per ogni parte modificabile dello stile scelto. */
  paintEditor() {
    const box = $('#avEditor');
    if (!box || box.hidden) return;
    const o = P.form.options[P.form.pick];
    box.innerHTML = avatarParts(o.style).map((p) => {
      const cur = P.form.opts[p.key];
      if (p.color) {
        return `<div class="ed-row"><span class="ed-label">${esc(p.label)}</span><div class="ed-swatches">${p.values.map((v) => `
          <button type="button" class="ed-sw" data-edc="${p.key}" data-v="${esc(v)}" style="--c:#${esc(v)}" aria-pressed="${cur === v}" aria-label="${esc(p.label)} ${esc(v)}"></button>`).join('')}</div></div>`;
      }
      const list = p.optional ? ['none', ...p.values] : p.values;
      const i = cur === undefined ? null : list.indexOf(cur);
      const shown = i === null ? t('ph.ed.auto') : cur === 'none' ? t('ph.ed.none') : t('ph.ed.nOf', { n: p.values.indexOf(cur) + 1, total: p.values.length });
      return `<div class="ed-row"><span class="ed-label">${esc(p.label)}</span><div class="ed-ctrl">
        <button type="button" class="ed-btn" data-ed="${p.key}" data-dir="-1" aria-label="${esc(t('ph.ed.prev', { part: p.label }))}">‹</button>
        <span class="ed-val">${esc(shown)}</span>
        <button type="button" class="ed-btn" data-ed="${p.key}" data-dir="1" aria-label="${esc(t('ph.ed.next', { part: p.label }))}">›</button></div></div>`;
    }).join('');
  },

  /** "Sei tu, Andrea?": c'è già un profilo con questo nome nello storico del gruppo. */
  paintSameName() {
    const box = $('#sameName');
    if (!box) return;
    const me = P.players[P.uid];
    const hit = !me && P.sameSkip !== nameKey(P.form.name) ? sameNameProfile(P.form.name) : null;
    const sig = hit ? `${hit.mid}|${P.profileClaims?.[P.uid]?.mid || ''}` : '';
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = hit ? `
      <section class="card same-name" role="status">
        <b>${esc(t('ph.sn.isYou', { name: hit.name }))}</b>
        <p>${t('ph.sn.lead', { name: `<b>${esc(hit.name)}</b>`, n: hit.nights })}</p>
        <div class="profile-code-row"><label class="sr-only" for="snCode">${esc(t('ph.pj.codeAria'))}</label><input class="input code-input code-input--6" id="snCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123"><button type="button" class="btn-sec" id="snGo">${esc(t('home.link.oldGo'))}</button></div>
        <p class="form-error" id="snErr" role="alert"></p>
        ${P.profileClaims?.[P.uid]?.mid === hit.mid
          ? `<p class="same-wait">⏳ ${esc(t('ph.sn.wait', { name: hit.name }))}</p>`
          : `<button type="button" class="btn-sec" id="snAsk" data-mid="${esc(hit.mid)}">📺 ${esc(t('ph.sn.ask'))}</button>`}
        <button type="button" class="link-btn" id="snOther">${esc(t('ph.sn.other', { name: hit.name }))}</button>
      </section>` : '';
  },

  async submit() {
    const err = $('#joinErr');
    const name = $('#nameInput').value.trim().replace(/\s+/g, ' ');
    if (!name) { err.textContent = t('home.ed.errName'); $('#nameInput').focus(); return; }
    const me = P.players[P.uid];
    if (!me && P.sameSkip !== nameKey(name) && sameNameProfile(name)) {
      const hn = sameNameProfile(name).name;
      err.textContent = t('ph.sn.err', { name: hn });
      this.paintSameName();
      $('#sameName')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const count = activePlayers(P.players).length;
    if (!me && count >= (P.meta.maxPlayers || 8)) { err.textContent = t('ph.roomFull'); return; }
    const clash = Object.entries(P.players).some(([uid, p]) => uid !== P.uid && String(p.name).toLowerCase() === name.toLowerCase());
    if (clash) { err.textContent = t('ph.join.nameTaken'); return; }

    const o = P.form.options[P.form.pick];
    const btn = $('#joinBtn');
    btn.disabled = true;
    try {
      let memberId = me?.memberId || null;
      if (P.meta.groupId) {
        const data = { name, style: o.style, seed: o.seed, color: P.form.color, groupId: P.meta.groupId, ...avatarExtras() };
        try {
          if (memberId) await update(memberRef(memberId), data);
          else {
            memberId = await createMember(data);
            saveProfile(P.meta.groupId, memberId);
            P.member = { id: memberId, ...data };
            P.newCode = Person.local() ? null : memberId;
          }
        } catch (e) { console.warn('Profilo non salvato', e); }
      }
      // Il profilo personale segue: si crea al primo ingresso e si aggiorna quando lo modifichi.
      const look = { name, style: o.style, seed: o.seed, color: P.form.color, ...avatarExtras() };
      const linked = !Person.local() || !memberId || Person.data?.groups?.[P.meta.groupId] === memberId;
      (async () => {
        if (!Person.local()) await Person.create(look, memberId && P.meta.groupId ? { groups: { [P.meta.groupId]: memberId } } : {});
        else if (linked && (me || !P.meta.groupId || !Person.data?.groups?.[P.meta.groupId])) {
          if (memberId && P.meta.groupId) await Person.linkGroup(P.meta.groupId, memberId);
          if (me) await Person.saveLook(look);
        }
      })().catch((e) => console.warn('Profilo personale non aggiornato', e));
      await set(roomRef(P.code, `players/${P.uid}`), {
        name,
        style: o.style,
        seed: o.seed,
        color: P.form.color,
        ...avatarExtras(),
        memberId: memberId || null,
        joinedAt: me?.joinedAt || serverTimestamp()
      });
      localStorage.setItem('gnr_name', name);
      P.profileEdit = false;
      render();
    } catch (e) {
      err.textContent = explainError(e);
      btn.disabled = false;
    }
  }
};

// ---------------------------------------------------------------------------
// Attese: lobby, tra un gioco e l'altro, reveal, classifica, premiazione
// ---------------------------------------------------------------------------

/** Parti personalizzate, foto e motto dal modulo (null = niente). */
function avatarExtras() {
  const opts = P.form?.opts && Object.keys(P.form.opts).length ? P.form.opts : null;
  return { opts, photo: P.form?.photo || null, motto: cleanName(P.form?.motto || '', 40) || null };
}

function newCodeHTML() {
  if (!P.newCode) return '';
  return `<div class="new-code">${t('ph.newCode', { code: `<b>${esc(P.newCode)}</b>` })}</div>`;
}

// Pulsanti presenti in più schermate: un solo ascoltatore per tutta la pagina.
document.addEventListener('click', (e) => {
  if (e.target.closest('#phErrDl')) { ErrLog.download({ stanza: P.code, giocatore: P.players?.[P.uid]?.name || null }); return; }
  if (e.target.closest('[data-myprofile]')) { P.showProfile = true; P.newCode = null; render(); return; }
  if (e.target.closest('[data-profileback]')) { P.showProfile = false; render(); }
});

SCREENS.profile = {
  /** Prossima serata, statistiche avanzate, ricordi e Wrapped del gruppo. */
  paintGroup(me) {
    const gid = P.meta?.groupId;
    const key = personKey(me);
    const nextBox = $('#myNext');
    if (!gid) { ['#myNext', '#myInsights', '#myMemories', '#myWrapped'].forEach((s) => { $(s).hidden = true; }); return; }
    nextBox.innerHTML = `<h2>📅 ${esc(t('ph.next.title'))}</h2>${nextNightHTML(P.next, key)}${icsButtonHTML(P.next)}${bringHTML(P.next, key)}
      <details class="next-set"><summary>${esc(P.next?.at ? t('ph.next.change') : t('ph.next.propose'))}</summary>
        <div class="next-set-body"><label class="sr-only" for="pnAt">${esc(t('ph.next.when'))}</label><input class="input" type="datetime-local" id="pnAt">
        <label class="sr-only" for="pnPlace">${esc(t('ph.next.place'))}</label><input class="input" id="pnPlace" maxlength="60" placeholder="${esc(t('ph.next.placePh'))}">
        <button type="button" class="btn-sec" id="pnSave">${esc(t('common.save'))}</button></div></details>`;
    nextBox.onclick = async (e) => {
      const r = e.target.closest('[data-rsvp]');
      if (r) { try { await answerRsvp(gid, key, me.name, r.dataset.rsvp); } catch (err) { toast(explainError(err), 'error'); } return; }
      if (e.target.closest('#pnSave')) {
        const at = $('#pnAt').value ? new Date($('#pnAt').value).getTime() : 0;
        if (!at) { toast(t('ph.next.pick'), 'warn'); return; }
        try { await set(groupRef(gid, 'next'), { at, place: cleanName($('#pnPlace').value, 60) || null, rsvp: { [key]: { name: me.name, answer: 'si' } } }); toast(t('ph.next.saved')); } catch (err) { toast(explainError(err), 'error'); }
      }
    };
    const ins = personInsights(P.nights, key, P.library);
    const line = (icon, html) => `<p class="stats-line">${icon}<span>${html}</span></p>`;
    const lines = [
      ins.winRate !== null && line('🏆', t('ph.ins.winRate', { pct: `<b>${ins.winRate}%</b>`, won: ins.won, played: ins.played })),
      ins.severity !== null && line('⚖️', ins.severity <= -0.5 ? t('ph.ins.harsh', { n: fmt(Math.abs(ins.severity)) }) : ins.severity >= 0.5 ? t('ph.ins.generous', { n: fmt(ins.severity) }) : t('ph.ins.inLine')),
      ins.agreement !== null && line('🤝', t('ph.ins.agree', { pct: `<b>${ins.agreement}%</b>` })),
      ins.bestGame && line('💪', t('ph.ins.best', { game: `<b>${esc(ins.bestGame.name)}</b>`, won: ins.bestGame.won, played: ins.bestGame.played, n: ins.bestGame.won })),
      ins.worstGame && line('😵', t('ph.ins.worst', { game: `<b>${esc(ins.worstGame.name)}</b>`, won: ins.worstGame.won, played: ins.worstGame.played })),
      ins.mate && line('❤️', t('ph.ins.mate', { name: `<b>${esc(ins.mate.name)}</b>` })),
      ins.nemesis && line('⚔️', t('ph.ins.nemesis', { name: `<b>${esc(ins.nemesis.name)}</b>`, n: ins.nemesis.wins })),
      ins.idealMinutes && line('⏱️', t('ph.ins.minutes', { n: `<b>${ins.idealMinutes}</b>` })),
      ins.idealPlayers && line('👥', t('ph.ins.players', { n: `<b>${fmtNum(ins.idealPlayers)}</b>` })),
      ins.favTag && line('🏷️', t('ph.ins.tag', { tag: `<b>${esc(ins.favTag)}</b>` }))
    ].filter(Boolean);
    const now = new Date();
    const monthNights = nightsList(P.nights).filter((n) => { const d = new Date(Number(n.at)); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && n.people?.[key]; }).length;
    $('#myInsights').innerHTML = `<h2>${esc(t('ph.ins.title'))}</h2>${monthNights ? line('📆', t('ph.ins.month', { n: monthNights })) : ''}${lines.join('') || `<p class="muted">${esc(t('ph.ins.empty'))}</p>`}`;
    const list = nightsList(P.nights).reverse();
    $('#myMemories').innerHTML = `<h2>📸 ${esc(t('ph.mem.title'))}</h2>${list.length ? `<ul class="mem-list">${list.slice(0, 10).map((n) => `
      <li><button type="button" class="mem-row" data-mem="${esc(n.room)}"><b>#${n.number} · ${esc(fmtDate(Number(n.at), { day: 'numeric', month: 'short', year: 'numeric' }))}</b><span>${esc(t('ph.mem.games', { n: n.gamesCount }))}${n.topGame ? ` · ⭐ ${esc(n.topGame.name)}` : ''}${n.people?.[key] ? '' : ` · ${esc(t('ph.mem.absent'))}`}</span></button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('ph.mem.empty'))}</p>`}`;
    $('#myMemories').onclick = (e) => {
      const b = e.target.closest('[data-mem]');
      if (b) openNightSheet(list.find((n) => n.room === b.dataset.mem), gid);
    };
    const years = yearsOf(P.nights);
    const w = years.length ? wrapped(P.nights, years[0]) : null;
    $('#myWrapped').innerHTML = w ? `<h2>🎁 Wrapped ${w.year}</h2><ul class="wr-mini">
      <li>${t('ph.wr.counts', { nights: `<b>${w.nights}</b>`, matches: `<b>${w.matches}</b>` })}${w.hours ? ` · ${t('ph.wr.hours', { n: `<b>${fmtNum(w.hours)}</b>` })}` : ''}</li>
      ${w.mostPlayed ? `<li>${t('ph.wr.mostPlayed', { game: `<b>${esc(w.mostPlayed.name)}</b>`, n: w.mostPlayed.matches })}</li>` : ''}
      ${w.loved ? `<li>${t('ph.wr.loved', { game: `<b>${esc(w.loved.name)}</b>`, avg: fmt(w.loved.avg) })}</li>` : ''}
      ${w.deadliest ? `<li>${t('ph.wr.deadliest', { game: `<b>${esc(w.deadliest.name)}</b>`, n: w.deadliest.wins })}</li>` : ''}
      ${w.mvp ? `<li>${t('ph.wr.mvp', { name: `<b>${esc(w.mvp.name)}</b>` })}</li>` : ''}
      ${w.longestMatch ? `<li>${t('ph.wr.longest', { game: `<b>${esc(w.longestMatch.name)}</b>`, n: w.longestMatch.minutes })}</li>` : ''}
      ${w.bestMonth ? `<li>${t('ph.wr.month', { month: `<b>${esc(w.bestMonth.name)}</b>` })}</li>` : ''}</ul>
      <button type="button" class="btn-sec btn-sec--sm" id="myYearShare">📤 <span>${esc(t('year.share'))}</span></button>` : '';
    $('#myWrapped').hidden = !w;
    const ys = $('#myYearShare');
    if (ys) ys.onclick = async () => {
      ys.disabled = true;
      try { await shareOrDownload(await renderYearImage(w, { group: P.meta?.groupName || '', color: P.identity?.color }), `gamenight_anno_${w.year}.png`, t('year.shareText', { year: String(w.year) })); } catch (err) { toast(explainError(err), 'error'); }
      ys.disabled = false;
    };
  },

  /** Livello, XP, traguardi (anche segreti) e note private. */
  paintProgress(me) {
    const pr = progressFor(P.nights, personKey(me), P.library);
    $('#myLevel').innerHTML = `
      <div class="lv-head"><span class="lv-num">${pr.level}</span><div><h2>${esc(t('ph.lv.title', { n: pr.level, name: pr.levelName }))}</h2><p class="muted">${esc(t('ph.lv.xp', { xp: pr.xp, next: pr.nextXp }))}</p></div></div>
      <span class="xp-bar" aria-label="${esc(t('ph.lv.bar'))}"><i style="width:${Math.round(pr.levelProgress * 100)}%"></i></span>
      ${seasonLineHTML(me)}
      <p class="muted small">${esc(t('ph.lv.rules'))}</p>`;
    const got = pr.achievements.filter((a) => a.got).length;
    $('#myAch').innerHTML = `
      <h2>${esc(t('home.me.trophies'))} <span class="muted">${got}/${pr.achievements.length}</span></h2>
      <ul class="ach-grid">${pr.achievements.map((a) => {
        const hidden = a.secret && !a.got;
        const prog = !a.got && a.progress && a.progress[1] ? `<span class="ach-prog"><i style="width:${Math.min(100, Math.round((a.progress[0] / a.progress[1]) * 100))}%"></i></span><small>${Math.min(a.progress[0], a.progress[1])}/${a.progress[1]}</small>` : '';
        return `<li class="ach ${a.got ? 'is-got' : ''}"><span class="ach-ico" aria-hidden="true">${hidden ? '❓' : a.icon}</span><span class="ach-text"><b>${esc(hidden ? t('ph.ach.secret') : a.name)}</b><small>${esc(hidden ? t('ph.ach.secretHint') : a.desc)}</small>${prog}</span></li>`;
      }).join('')}</ul>`;
    const notes = Object.values(privateNotes()).sort((a, b) => b.at - a.at).slice(0, 8);
    $('#myNotes').innerHTML = `<h2>${esc(t('ph.notes.title'))}</h2>${notes.length
      ? `<ul class="notes-list">${notes.map((n) => `<li><b>${esc(n.game)}</b> <span class="muted small">${esc(fmtDate(n.at, { day: 'numeric', month: 'short' }))}</span><p>${esc(n.text)}</p></li>`).join('')}</ul>`
      : `<p class="muted">${esc(t('ph.notes.empty'))}</p>`}`;
  },

  /** Trofei dalla serata precedente e amici più (e meno) affini. */
  extrasHTML(me) {
    const key = personKey(me);
    const tr = trophies(P.nights, P.code)[key];
    const pairs = affinities(P.nights).filter((p) => p.a.key === key || p.b.key === key);
    const other = (p) => (p.a.key === key ? p.b.name : p.a.name);
    const lines = [];
    if (tr?.crown) lines.push(`${ICONS.crown}<span>${esc(t('ph.tr.crown'))}</span>`);
    if (tr?.star) lines.push(`${ICONS.star}<span>${esc(t('ph.tr.star'))}</span>`);
    if (tr?.title) lines.push(`${ICONS.trophy}<span>${t('ph.tr.title', { title: `<b>${esc(awardTitle(tr.title))}</b>` })}</span>`);
    if (pairs.length) lines.push(`${ICONS.users}<span>${t('ph.tr.soul', { name: `<b>${esc(other(pairs[0]))}</b>`, n: fmt(pairs[0].diff) })}</span>`);
    if (pairs.length > 1) lines.push(`${ICONS.x}<span>${t('ph.tr.opposite', { name: `<b>${esc(other(pairs[pairs.length - 1]))}</b>` })}</span>`);
    return lines.map((l) => `<p class="stats-line">${l}</p>`).join('');
  },

  mount(el) {
    this.sig = '';
    const me = P.players[P.uid];
    const mid = me?.memberId;
    el.innerHTML = `
      <main class="phone">
        ${phoneTop(undefined, 'profile')}
        <div class="profile-head">
          ${avatarHTML(me, '5rem', 'avatar--shadow')}
          <div>
            <h1 class="ph-title">${esc(me.name)}</h1>
            ${mid ? `<p class="profile-code-line">${esc(t('ph.pj.codeAria'))} <span class="code-chip code-chip--sm">${esc(mid)}</span></p>` : ''}
          </div>
        </div>
        ${mid ? `<p class="muted small">${esc(t('ph.prof.codeHint'))}</p>
        <details class="card ph-card prof-qr"><summary>📱 ${esc(t('ph.prof.qr'))}</summary><div class="qr qr--prof" id="profQr"></div><p class="muted small">${esc(t('ph.prof.qrHint'))}</p></details>` : ''}
        <section class="card ph-card" id="myNext"></section>
        <section class="card ph-card" id="myLevel"></section>
        <section class="card ph-card" id="myCard"></section>
        <section class="card ph-card" id="myRivals"></section>
        <section class="card ph-card" id="myStats"></section>
        <section class="card ph-card" id="myAch"></section>
        <section class="card ph-card" id="myNotes"></section>
        <section class="card ph-card" id="myInsights"></section>
        <section class="card ph-card" id="myMemories"></section>
        <section class="card ph-card" id="myWrapped"></section>
        <section class="card ph-card"><h2>${esc(t('common.language'))}</h2>${langSwitchHTML('phLang')}</section>
        <section class="card ph-card"><h2>${esc(t('home.set.theme'))}</h2>${themeSwitchHTML('phTheme')}</section>
        <section class="card ph-card"><h2>${esc(t('home.set.a11y'))}</h2>${a11yHTML('phA11y')}</section>
        <section class="card ph-card"><h2>${esc(t('ph.errlog.title'))}</h2><p class="muted small">${esc(t('ph.errlog.text'))}</p><button type="button" class="btn-sec btn-sec--sm" id="phErrDl">${ICONS.download}<span>${esc(t('ph.errlog.dl'))}</span></button></section>
        <section class="card ph-card">
          <h2>${esc(t('ph.regia.title'))}</h2>
          ${P.cohost
            ? `<p>${t('ph.regia.on')}</p>`
            : `<p class="muted">${esc(t('ph.regia.lead'))}</p>
               <div class="profile-code-row">
                 <label class="sr-only" for="regiaInput">${esc(t('ph.regia.code'))}</label>
                 <input class="input code-input code-input--8" id="regiaInput" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX">
                 <button type="button" class="btn-sec" id="regiaGo">${esc(t('ph.regia.go'))}</button>
               </div>
               <p class="form-error" id="regiaErr" role="alert"></p>`}
        </section>
        ${installHintHTML(mid)}
        <div class="ph-links">
          <button type="button" class="link-btn" id="editProfile">${esc(t('ph.prof.edit'))}</button>
        </div>
        <button type="button" class="btn btn-block" data-profileback>${esc(t('ph.prof.back'))}</button>
      </main>`;
    bindEditProfile(el);
    bindInstall(el);
    if (mid && $('#profQr', el)) {
      const url = publicUrl('play.html');
      url.search = '';
      url.searchParams.set('profilo', mid);
      if (P.code) url.searchParams.set('room', P.code);
      $('#profQr', el).innerHTML = qrSVG(url.href);
    }
    $('#regiaInput', el)?.addEventListener('input', (e) => {
      const v = normalizeCode(e.target.value, 8);
      e.target.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
    });
    $('#regiaGo', el)?.addEventListener('click', async () => {
      try {
        await Regia.activate($('#regiaInput').value);
        toast(t('ph.regia.active'));
        P.screenKey = null;
        render();
      } catch (err) {
        $('#regiaErr').textContent = explainError(err);
      }
    });
  },
  update() {
    const me = P.players[P.uid];
    const st = personalStats(P.nights, personKey(me));
    const sig = JSON.stringify([st, Object.keys(P.library || {}).length, P.next, Object.keys(P.nights || {}).length]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.paintProgress(me);
    this.paintGroup(me);
    if (P.meta?.groupId) {
      $('#myCard').innerHTML = cardSectionHTML(me);
      bindCardSection($('#myCard'), me);
      $('#myRivals').innerHTML = rivalsSectionHTML(me);
    } else { $('#myCard').hidden = true; $('#myRivals').hidden = true; }
    const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
    $('#myStats').innerHTML = `
      <h2>${esc(t('ph.st.title'))}</h2>
      ${st.nights ? `<dl class="stats-grid">
        ${row(esc(t('ph.st.nights')), st.nights)}
        ${row(esc(t('ph.st.votes')), st.votes)}
        ${row(esc(t('ph.st.avg')), fmt(st.avgGiven))}
        ${row(esc(t('ph.st.wins')), st.wins)}
        ${row(esc(t('ph.st.mvp')), st.mvp)}
        ${row(esc(t('ph.st.games')), st.gamesVoted)}
      </dl>
      ${st.favorite ? `<p class="stats-line">${ICONS.star}<span>${t('ph.st.fav', { game: `<b>${esc(st.favorite.name)}</b>`, avg: fmt(st.favorite.avg) })}</span></p>` : ''}
      ${st.leastFavorite && st.leastFavorite.avg < st.favorite.avg ? `<p class="stats-line">${ICONS.x}<span>${t('ph.st.least', { game: `<b>${esc(st.leastFavorite.name)}</b>`, avg: fmt(st.leastFavorite.avg) })}</span></p>` : ''}
      ${this.extrasHTML(me)}`
      : `<p class="muted">${esc(t('ph.st.empty'))}</p>`}`;
  }
};

// ---------------------------------------------------------------------------
// Regia dal telefono: pulsante fisso e pannello con i comandi per la TV
// ---------------------------------------------------------------------------

const Regia = {
  fab: null,
  sheet: null,
  sig: '',
  draft: { name: '', libraryId: null, winners: [], spectators: [], quick: false },

  /** Il gioco consigliato per i presenti (dopo almeno una serata). */
  bestHTML(active, played) {
    if (!Object.keys(P.nights || {}).length) return '';
    const rec = recommend({ library: P.library, nights: P.nights, present: active.map((p) => ({ key: personKey(p), name: p.name })), playedTonight: new Set([...played].map((k) => k.replace(/[.#$\[\]\/]/g, '_'))), favs: P.meta?.armadioId ? Favs.ids(P.meta.armadioId) : null });
    const r = rec.all[0];
    return r ? `<button type="button" class="best-pick" data-rglib="${esc(r.id)}"><span>💡 ${t('ph.rg.best', { game: `<b>${esc(r.item.name)}</b>`, pct: `${r.score}%` })}</span><small>${esc(r.reasons.slice(0, 2).join(' · '))}</small></button>` : '';
  },

  async activate(input) {
    const code = normalizeCode(input, 8);
    if (code.length !== 8) throw userError(t('ph.regia.len'));
    try {
      await set(roomRef(P.code, `takeover/${P.uid}`), code);
      await set(roomRef(P.code, `cohosts/${P.uid}`), true);
    } catch {
      knock('regia');
      throw userError(t('ph.regia.wrong'));
    }
    localStorage.setItem(`gnr_cohost_${P.code}`, '1');
    localStorage.setItem(`gnr_regia_${P.code}`, code);
    P.cohost = true;
    this.sync();
  },

  sync() {
    const show = Boolean(P.cohost && P.meta && P.players[P.uid]);
    if (show && !this.fab) {
      this.fab = document.createElement('button');
      this.fab.type = 'button';
      this.fab.className = 'regia-fab';
      this.fab.innerHTML = `${ICONS.play}<span>${esc(t('ph.rg.title'))}</span>`;
      this.fab.addEventListener('click', () => this.open());
      document.body.appendChild(this.fab);
    }
    if (!show && this.fab) { this.fab.remove(); this.fab = null; this.close(); }
    if (this.sheet) this.paint();
  },

  open() {
    if (this.sheet) return;
    this.sig = '';
    this.sheet = document.createElement('div');
    this.sheet.className = 'overlay overlay--sheet';
    this.sheet.innerHTML = `
      <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="rgTitle">
        <div class="panel-head"><h2 id="rgTitle">${esc(t('ph.rg.title'))}</h2><button type="button" class="icon-btn" id="rgClose" data-close aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <p class="rg-watch" id="rgWatch" role="status"></p>
        <div id="rgBody"></div>
        <details class="rg-safety" id="rgSafety"><summary>🛡️ ${esc(t('ph.rg.safety'))}</summary><div id="rgSafeBody"></div></details>
        <details class="rg-sfx"><summary>🔊 ${esc(t('ph.rg.sfx'))}</summary><div class="sfx-grid">${allSfx().map((m) => `<button type="button" class="sfx-btn" data-rgsfx="${esc(m.k)}"><span aria-hidden="true">${esc(m.icon)}</span><small>${esc(m.label)}</small></button>`).join('')}</div></details>
      </div>`;
    document.body.appendChild(this.sheet);
    this.sheet.addEventListener('click', (e) => this.onClick(e));
    this.sheet.addEventListener('input', (e) => { if (e.target.id === 'rgName') { this.draft.name = e.target.value; this.draft.libraryId = null; } });
    this.sheet.addEventListener('change', (e) => { if (e.target.id === 'rgQuick') this.draft.quick = e.target.checked; });
    this.paint();
    this.paintWatch();
    this.watchTimer = setInterval(() => this.paintWatch(), 1000);
  },

  close() {
    clearInterval(this.watchTimer);
    this.sheet?.remove();
    this.sheet = null;
  },

  /** Watchdog: da quanto la TV non dà segni di vita (batte ogni 5 secondi). */
  paintWatch() {
    const el = this.sheet && $('#rgWatch', this.sheet);
    if (!el) return;
    const age = Math.max(0, Math.round((Date.now() - (P.lastBeat || Date.now())) / 1000));
    const regia = localStorage.getItem(`gnr_regia_${P.code}`) || '';
    const bad = age > 30;
    const html = bad
      ? `⚠️ ${t('ph.rg.silent', { n: age })} <a href="host.html?room=${esc(P.code)}${regia ? `#regia=${esc(regia)}` : ''}">${esc(t('ph.rg.takeover'))}</a>`
      : `📡 ${esc(age < 2 ? t('ph.rg.signalNow') : t('ph.rg.signalAgo', { n: age }))}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.toggle('is-bad', bad);
  },

  paintSafety() {
    const box = this.sheet && $('#rgSafeBody', this.sheet);
    if (!box) return;
    const others = sortedPlayers(P.players).filter((p) => p.uid !== P.uid);
    const sig = JSON.stringify([Boolean(P.meta?.locked), Boolean(P.meta?.safeMode), others.map((p) => [p.uid, p.name])]);
    if (sig === this.safeSig) return;
    this.safeSig = sig;
    box.innerHTML = `
      <div class="rg-row">
        <button type="button" class="btn-sec btn-sec--sm" data-rglock>${esc(P.meta?.locked ? `🔓 ${t('ph.rg.unlock')}` : `🔒 ${t('ph.rg.lock')}`)}</button>
        <button type="button" class="btn-sec btn-sec--sm" data-rgsafe>${esc(P.meta?.safeMode ? t('ph.rg.safeOff') : `🚨 ${t('ph.rg.safeOn')}`)}</button>
      </div>
      ${others.length ? `<span class="field-label">${esc(t('ph.rg.kick'))}</span><div class="rg-chips">${others.map((p) => `<button type="button" class="lib-chip" data-rgkick="${esc(p.uid)}">⛔ ${esc(p.name)}</button>`).join('')}</div>` : ''}`;
  },

  async send(type, args = null) {
    try {
      const r = push(roomRef(P.code, 'commands'));
      await set(r, { type, args, by: P.uid, at: serverTimestamp() });
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(async () => {
        const still = await get(r).catch(() => null);
        if (still?.exists()) toast(t('ph.rg.noAnswer'), 'warn');
      }, 6000);
    } catch (err) {
      toast(explainError(err), 'error');
    }
  },

  onClick(e) {
    if (e.target === this.sheet || e.target.closest('#rgClose')) { this.close(); return; }
    if (e.target.closest('[data-rglock]')) { this.send('lock', { on: !P.meta?.locked }); return; }
    if (e.target.closest('[data-rgsafe]')) { this.send('safe', { on: !P.meta?.safeMode }); return; }
    const kk = e.target.closest('[data-rgkick]');
    if (kk) {
      const p = P.players[kk.dataset.rgkick];
      if (p && confirm(t('ph.rg.kickConfirm', { name: p.name }))) this.send('kick', { uid: kk.dataset.rgkick });
      return;
    }
    const fx = e.target.closest('[data-rgsfx]');
    if (fx) {
      rated(roomOf, 'sfx', 'sfx', { k: fx.dataset.rgsfx, by: P.uid, at: serverTimestamp(), regia: true }).catch((err) => toast(spamError(err), 'error'));
      if (navigator.vibrate) navigator.vibrate(15);
      return;
    }
    const lib = e.target.closest('[data-rglib]');
    if (lib) {
      const it = P.library?.[lib.dataset.rglib];
      this.draft = { ...this.draft, name: it?.name || '', libraryId: lib.dataset.rglib, quick: Boolean(it?.quick) };
      this.sig = '';
      this.paint();
      return;
    }
    const win = e.target.closest('[data-rgwin]');
    if (win) {
      const uid = win.dataset.rgwin;
      const w = this.draft.winners;
      const s = this.draft.spectators;
      if (w.includes(uid)) { this.draft.winners = w.filter((x) => x !== uid); this.draft.spectators = [...s, uid]; }
      else if (s.includes(uid)) this.draft.spectators = s.filter((x) => x !== uid);
      else this.draft.winners = [...w, uid];
      this.sig = '';
      this.paint();
      return;
    }
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    const type = b.dataset.cmd;
    if (type === 'openVote') {
      const name = cleanName(this.draft.name);
      if (!name) { toast(t('ph.rg.pickGame'), 'warn'); return; }
      this.send('openVote', { name, libraryId: this.draft.libraryId, winners: this.draft.winners, spectators: this.draft.spectators, quick: this.draft.quick });
      this.draft = { name: '', libraryId: null, winners: [], spectators: [], quick: false };
      return;
    }
    if (type === 'startPlay') {
      const name = cleanName(this.draft.name);
      if (!name) { toast(t('ph.rg.pickGame'), 'warn'); return; }
      this.send('startPlay', { name, spectators: this.draft.spectators });
      return;
    }
    if (type === 'end' && !confirm(t('ph.rg.endConfirm'))) return;
    if (type === 'reveal' && b.dataset.missing && !confirm(t('ph.rg.revealConfirm', { missing: b.dataset.missing }))) return;
    if (type === 'reopen' && !confirm(t('ph.rg.reopenConfirm'))) return;
    const args = b.dataset.arg ? { [b.dataset.argk || 'uid']: b.dataset.arg } : null;
    this.send(type, args);
  },

  paint() {
    if (!this.sheet) return;
    this.paintSafety();
    const st = P.state || {};
    const phase = st.phase || 'lobby';
    const gid = st.gameId;
    const sig = JSON.stringify([phase, gid, st.done, st.paused, P.meta?.ambient, st.playStart, st.event?.id, P.nights && Object.keys(P.nights).length, P.poll, P.votes?.[gid], Object.keys(P.players), Object.keys(P.library || {}), P.games?.[gid]?.status, P.presence]);
    if (sig === this.sig) return;
    this.sig = sig;
    const btn = (cmd, label, cls = 'btn btn-block', extra = '') => `<button type="button" class="${cls}" data-cmd="${cmd}" ${extra}>${label}</button>`;
    const g = P.games?.[gid];
    const active = activePlayers(P.players);
    let html = '';
    if (phase === 'lobby') {
      html = `<p>${esc(t('ph.rg.inside', { n: active.length, max: P.meta.maxPlayers || 8 }))}</p>${btn('start', esc(t('ph.rg.start')))}`;
    } else if (phase === 'idle') {
      const played = new Set(Object.values(P.games || {}).map((x) => nameKey(x?.name)));
      const items = Object.entries(P.library || {}).filter(([, it]) => it?.name && !played.has(nameKey(it.name)))
        .sort(([, a], [, b]) => (libFits(b, active.length) - libFits(a, active.length)) || a.name.localeCompare(b.name, lang()));
      const d = this.draft;
      html = `
        ${items.length >= 2 ? btn('pollStart', esc(t('ph.rg.poll')), 'btn-sec btn-block') : ''}
        <p class="field-label">${esc(t('ph.rg.next'))}</p>
        ${items.length ? `<div class="rg-chips">${items.map(([id, it]) => `<button type="button" class="lib-chip ${libFits(it, active.length) ? '' : 'is-unfit'}" data-rglib="${esc(id)}" aria-pressed="${d.libraryId === id}">${esc(it.name)}</button>`).join('')}</div>` : ''}
        <label class="sr-only" for="rgName">${esc(t('ph.ag.name'))}</label>
        <input class="input" id="rgName" maxlength="40" placeholder="${esc(t('ph.rg.namePh'))}" value="${esc(d.name)}">
        ${this.bestHTML(active, played)}
        <p class="field-label">${esc(t('ph.rg.who'))} <span class="muted">${esc(t('ph.rg.whoHint'))}</span></p>
        <div class="rg-chips">${active.map((p) => {
          const st = d.winners.includes(p.uid) ? 'winner' : d.spectators.includes(p.uid) ? 'spectator' : 'player';
          return `<button type="button" class="lib-chip rg-state rg-state--${st}" data-rgwin="${esc(p.uid)}" aria-pressed="${st === 'winner'}">${st === 'winner' ? '👑 ' : st === 'spectator' ? '👀 ' : ''}${esc(p.name)}</button>`;
        }).join('')}</div>
        <label class="quick-toggle"><input type="checkbox" id="rgQuick" ${d.quick ? 'checked' : ''}><span>${esc(t('ph.rg.quick'))}</span></label>
        <div class="rg-row">${btn('startPlay', esc(P.state?.playStart ? t('ph.rg.restartTimer') : t('ph.rg.startPlay')), 'btn-sec')}${btn('interval', `☕ ${esc(t('ph.rg.interval'))}`, 'btn-sec')}</div>
        ${btn('openVote', esc(t('ph.rg.openVote')))}
        <div class="rg-row">${btn('board', esc(t('ph.board')), 'btn-sec')}${btn('alltime', esc(t('ph.rg.alltime')), 'btn-sec')}${btn('end', esc(t('ph.rg.end')), 'btn-sec')}</div>`;
    } else if (phase === 'poll') {
      const poll = P.poll || {};
      const votes = Object.keys(poll.votes || {}).length;
      html = poll.open
        ? `<p>${esc(t('ph.rg.pollCount', { n: votes, total: active.length }))}</p>${btn('pollClose', esc(t('ph.rg.pollClose')))}${btn('pollCancel', esc(t('common.cancel')), 'btn-sec btn-block')}`
        : `<p>${t('ph.rg.pollWinner', { game: `<b>${esc(P.library?.[poll.winner]?.name || t('ph.poll.chosenGame'))}</b>` })}</p>${btn('pollGo', esc(t('ph.rg.pollGo')))}`;
    } else if (phase === 'voting' && g) {
      const votes = P.votes?.[gid] || {};
      const missing = active.filter((p) => !votes[p.uid]);
      const pres = P.presence || {};
      const tracked = Object.keys(pres).length > 0;
      html = `
        <p><b>${esc(g.name)}</b>: ${esc(t('ph.rg.voted', { n: active.length - missing.length, total: active.length }))}</p>
        ${missing.length ? `<ul class="rg-missing">${missing.map((p) => `<li>${esc(p.name)}${tracked && !pres[p.uid] ? ` <span class="muted">${esc(t('ph.rg.offline'))}</span> ${btn('skip', esc(t('ph.rg.skip')), 'btn-sec btn-sec--sm', `data-arg="${esc(p.uid)}"`)}` : ''}</li>`).join('')}</ul>` : ''}
        ${btn('reveal', esc(t('ph.rg.reveal')), 'btn btn-block', missing.length ? `data-missing="${esc(t('ph.rg.missing', { n: missing.length }))}"` : '')}`;
    } else if (phase === 'reveal') {
      html = `${btn('next', esc(t('ph.rg.nextGame')))}<div class="rg-row">${btn('rematch', esc(t('ph.rg.rematch')), 'btn-sec', `data-arg="${esc(gid || '')}" data-argk="gameId"`)}${btn('board', esc(t('ph.board')), 'btn-sec')}${btn('reopen', esc(t('ph.rg.reopen')), 'btn-sec', `data-arg="${esc(gid || '')}" data-argk="gameId"`)}</div>`;
    } else if (phase === 'board') {
      html = `${btn('next', esc(t('ph.rg.nextGame')))}<div class="rg-row">${btn('alltime', esc(t('ph.rg.alltime')), 'btn-sec')}${btn('end', esc(t('ph.rg.end')), 'btn-sec')}</div>`;
    } else if (phase === 'alltime') {
      html = btn('back', esc(t('ph.prof.back')));
    } else if (phase === 'awards') {
      html = st.done ? `<p>${esc(t('ph.rg.awardsDone'))}</p>` : btn('step', esc(t('ph.rg.awardsNext')));
    }
    if (st.paused) html = `<p>${esc(t('ph.rg.paused'))}</p>${btn('resume', esc(t('ph.rg.resume')))}`;
    else html += btn('pause', esc(t('ph.rg.pause')), 'btn-sec btn-block');
    // Timer condiviso e schermata ambientale della TV (1.6)
    if (phase !== 'awards') {
      html += `<div class="rg-row"><button type="button" class="btn-sec" data-open-timer>⏱️ ${esc(t('timer.title'))}</button>${btn('ambient', `🌙 ${esc(P.meta?.ambient ? t('amb.off') : t('amb.on'))}`, 'btn-sec', `data-arg="${P.meta?.ambient ? '0' : '1'}" data-argk="on"`)}</div>`;
    }
    $('#rgBody', this.sheet).innerHTML = html || `<p class="muted">${esc(t('ph.rg.nothing'))}</p>`;
  }
};

function addGameButton() {
  if (!P.meta?.groupId && !P.meta?.armadioId) return '';
  const n = Object.keys(P.library || {}).length;
  const mine = Object.keys(P.tonight || {}).filter((lid) => P.tonight[lid]?.[P.uid]).length;
  return `<button type="button" class="btn-sec ph-addgame" id="addGameBtn">🎲 <span>${esc(t('ph.ag.title'))}</span></button>
    <p class="muted small">${esc(mine ? t('ph.ag.broughtN', { n: mine }) : t('ph.ag.hint'))} ${esc(n ? t('ph.ag.onShelf', { n }) : t('ph.ag.empty'))}</p>`;
}

function bindAddGame(el) {
  $('#addGameBtn', el)?.addEventListener('click', () => {
    P.addingGame = true;
    render();
  });
}

function bindEditProfile(el) {
  $('#editProfile', el)?.addEventListener('click', () => {
    P.profileEdit = true;
    render();
  });
}

SCREENS.wait = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="wait-hero" id="waitMe"></div>
        <h1 class="ph-title" id="waitTitle"></h1>
        <p class="ph-lead">${esc(t('ph.wait.lead'))}</p>
        <div class="wait-list" id="waitList"></div>
        <p class="muted" id="waitCount"></p>
        ${newCodeHTML()}
        ${photoButtonHTML()}
        ${addGameButton()}
        <div class="ph-links">
          <button type="button" class="link-btn" data-myprofile>${esc(t('ph.myProfile'))}</button>
          <button type="button" class="link-btn" id="editProfile">${esc(t('ph.prof.edit'))}</button>
        </div>
      </main>`;
    bindEditProfile(el);
    bindAddGame(el);
  },
  update() {
    const me = P.players[P.uid];
    const ps = activePlayers(P.players);
    const sig = JSON.stringify([P.meta.maxPlayers, ps.map((p) => [p.uid, p.name, p.style, p.seed, p.color])]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#waitMe').innerHTML = avatarHTML(me, '8.5rem', 'avatar--shadow');
    $('#waitTitle').textContent = t('ph.wait.title', { name: me.name });
    $('#waitList').innerHTML = ps.map((p) => avatarHTML(p, '2.6rem')).join('');
    $('#waitCount').textContent = t('ph.wait.count', { n: ps.length, max: P.meta.maxPlayers || 8 });
  }
};

SCREENS.idle = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="wait-hero" id="idleMe"></div>
        <h1 class="ph-title">${esc(t('ph.idle.title'))}</h1>
        <p class="ph-lead">${esc(t('ph.idle.lead'))}</p>
        <div id="idleEvent" class="full-width"></div>
        <div id="idleBet" class="full-width"></div>
        <div id="idleRules" class="full-width"></div>
        <div id="idleTable" class="full-width"></div>
        <div id="idleBoard" class="full-width"></div>
        <div id="idlePlan" class="full-width"></div>
        ${newCodeHTML()}
        ${photoButtonHTML()}
        ${addGameButton()}
        <div class="ph-links">
          <button type="button" class="link-btn" data-myprofile>${esc(t('ph.myProfile'))}</button>
          <button type="button" class="link-btn" id="editProfile">${esc(t('ph.prof.edit'))}</button>
          <button type="button" class="link-btn" id="leaveNight">${esc(t('ph.idle.leave'))}</button>
        </div>
      </main>`;
    bindEditProfile(el);
    bindAddGame(el);
    $('#leaveNight', el).addEventListener('click', leaveNight);
    this.sand = setInterval(() => {
      paintSand();
      const b = betState();
      const mini = $('[data-betclock-mini]');
      if (mini && b?.open) mini.textContent = mmss(b.left);
      else if (mini && b && !b.open) $('#idleBet').innerHTML = '';
    }, 500);
  },
  unmount() { clearInterval(this.sand); },
  update() {
    const me = P.players[P.uid];
    const st = P.state || {};
    const tsig = JSON.stringify([P.table?.starter, P.table?.teams, P.table?.sand, P.scores?.[st.playId], st.playId, st.playStart]);
    const rsig = JSON.stringify([P.rules, P.knows?.[P.rules?.lid]?.[P.uid], P.plan, Object.keys(P.games || {}).length, P.library?.[P.rules?.lid]]);
    if (rsig !== this.rsig) {
      this.rsig = rsig;
      $('#idleRules').innerHTML = rulesCardHTML();
      $('#idlePlan').innerHTML = planCardHTML();
    }
    if (tsig !== this.tsig) {
      this.tsig = tsig;
      // Chi inizia, la propria squadra e la clessidra restano in vista; segnapunti e pronostico sono nella barra in basso.
      const tb = P.table || {};
      $('#idleTable').innerHTML = tb.starter || Array.isArray(tb.teams) || tb.sand ? tableHTML() : '';
      paintSand();
    }
    $('#idleBet').innerHTML = betBannerHTML();
    const sig = JSON.stringify([me, Object.keys(P.games), Object.keys(P.votes).length, st.event?.id, st.playId, st.playName, st.playPlayers, P.bets?.[st.playId], Object.keys(P.players)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#idleMe').innerHTML = avatarHTML(me, '6rem', 'avatar--shadow');
    $('#idleEvent').innerHTML = eventHTML();
    $('#idleBoard').innerHTML = miniBoardHTML();
  }
};

SCREENS.reveal = {
  mount(el) {
    const gid = P.state.gameId;
    const g = P.games[gid];
    const st = gameStats(P.votes[gid]);
    const mine = P.votes[gid]?.[P.uid];
    // La media compare quando la TV ha finito di girare le carte.
    const delay = 0.6 + st.n * (st.n > 8 ? 0.32 : 0.45) + 0.4;
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <h1 class="ph-title">${esc(t('ph.rv.title'))}</h1>
        <div class="card p-reveal">
          ${gameImageHTML(g, 'game-img--vote')}
          <div class="p-reveal-body">
            <b class="vgame-name">${esc(g.name)}</b>
            <div class="p-reveal-nums">
              <div><span class="muted">${esc(t('ph.rv.mine'))}</span><b class="p-num">${mine ? mine.overall : '–'}</b></div>
              <div class="p-late" style="--after:${delay.toFixed(2)}s"><span class="muted">${esc(t('ph.rv.avg'))}</span><b class="p-num p-num--avg">${fmt(st.avg)}</b></div>
            </div>
            <p class="p-late p-verdict" style="--after:${(delay + 0.2).toFixed(2)}s">${esc(verdict(st))}</p>
            ${typeof mine?.guess === 'number' ? `<p class="p-late p-guess" style="--after:${(delay + 0.3).toFixed(2)}s">${esc(t('ph.rv.guess', { n: fmt(mine.guess, Number.isInteger(mine.guess) ? 0 : 1) }))} ${esc(st.oracle?.winners.some((w) => w.uid === P.uid) ? t('ph.rv.oracle') : t('ph.rv.off', { n: fmt(Math.abs(mine.guess - st.avg)) }))}</p>` : ''}
            ${g.winners ? `<p class="p-win-line">${ICONS.trophy}<span>${esc(t('ph.rv.won', { names: namesList(Object.keys(g.winners).map((uid) => P.players[uid]?.name || t('ph.exPlayer'))) }))}</span></p>` : ''}
            ${g.winners && g.bets?.[P.uid] ? `<p class="p-late p-bet" style="--after:${(delay + 0.4).toFixed(2)}s">🔮 ${esc(t('ph.rv.bet', { name: P.players[g.bets[P.uid]]?.name || t('ph.exPlayer') }))} ${g.winners[g.bets[P.uid]] ? t('ph.rv.betOk') : esc(t('ph.rv.betKo'))}</p>` : ''}
          </div>
        </div>
      </main>`;
  }
};

SCREENS.board = {
  mount(el) {
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <h1 class="ph-title">${esc(t('ph.board'))}</h1>
        <p class="ph-lead">${esc(t('ph.bd.lead'))}</p>
        <div class="full-width" id="pBoard"></div>
      </main>`;
    this.sig = '';
  },
  update() {
    const sig = JSON.stringify([Object.keys(P.games), Object.keys(P.votes)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#pBoard').innerHTML = miniBoardHTML(false) || `<p class="muted">${esc(t('ph.bd.none'))}</p>`;
  }
};

SCREENS.awards = {
  mount(el) {
    if (P.state?.done) { this.results(el); return; }
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.trophy}</div>
        <h1 class="ph-title">${esc(t('ph.aw.live'))}</h1>
        <p class="ph-lead">${esc(t('ph.aw.liveLead'))}</p>
      </main>`;
  },

  results(el) {
    const board = buildBoard(P.games, P.votes);
    const awards = buildAwards(board, P.votes, P.players);
    const items = awards.map((a) => {
      const who = a.game ? a.game.name : namesList(a.players.map((p) => p.name));
      return `
        <li class="p-award" style="--ac:${a.color}">
          <span class="p-award-dot" aria-hidden="true"></span>
          <span class="p-award-text">
            <span class="p-award-title">${esc(a.title)}</span>
            <span class="p-award-win">${esc(who)}</span>
          </span>
        </li>`;
    }).join('');
    // Campioni della serata (gli stessi del podio dei giocatori sulla TV)
    const champs = nightChampions(board).filter((c) => c.rank <= 3).slice(0, 3);
    const medal = ['🏆', '🥈', '🥉'];
    const champsHTML = champs.length ? `
      <div class="p-champs full-width"><h2>${esc(t('ph.aw.champs'))}</h2>
        <ol class="p-champ-list">${champs.map((c) => {
          const p = P.players[c.uid] || { name: t('ph.exPlayer'), uid: c.uid };
          return `<li class="p-champ ${c.uid === P.uid ? 'is-me' : ''}"><span class="p-champ-medal" aria-hidden="true">${medal[c.rank - 1] || '🏅'}</span>${avatarHTML({ ...p, uid: c.uid }, '2.6rem')}<b>${esc(p.name)}</b><span class="p-champ-pts">${c.points} pt</span></li>`;
        }).join('')}</ol></div>` : '';
    if (champs.some((c) => c.uid === P.uid && c.rank === 1)) setTimeout(() => confettiBurst(120, 'rain'), 400);
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.trophy}</div>
        <h1 class="ph-title">${esc(t('ph.aw.results'))}</h1>
        <p class="ph-lead">${esc(t('ph.aw.thanks'))}</p>
        <div class="share-row"><button type="button" class="btn btn-block" id="shareBtn">${ICONS.share}<span>${esc(t('ph.aw.share'))}</span></button>
        <button type="button" class="btn-sec btn-block" id="storyBtn">📱 <span>${esc(t('ph.aw.story'))}</span></button></div>
        ${champsHTML}
        <div class="full-width">${miniBoardHTML() || `<p class="muted">${esc(t('ph.aw.noGames'))}</p>`}</div>
        ${items ? `<div class="p-awards"><h2>${esc(t('ph.aw.special'))}</h2><ol class="p-award-list">${items}</ol></div>` : ''}
        ${myUnlockedHTML()}
        ${P.meta.groupId && Object.keys(P.nights || {}).length > 1 ? `<div class="p-awards"><h2>${esc(t('ph.at.title'))}</h2>${allTimeHTML(5)}</div>` : ''}
        <a class="btn-sec btn-block" href="resoconto.html?room=${esc(P.code)}${P.meta.groupId ? `&g=${esc(P.meta.groupId)}` : ''}">📋 <span>${esc(t('ph.aw.report'))}</span></a>
        <a class="btn-sec btn-block end-home" href="index.html">🏠 <span>${esc(t('ph.aw.home'))}</span></a>
      </main>`;
    $('#shareBtn', el).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const blob = await renderShareImage({
          title: P.meta.groupName || t('ph.aw.ourNight'),
          subtitle: nightDate(P.meta.createdAt),
          board,
          awards
        });
        const date = new Date().toISOString().slice(0, 10);
        const how = await shareOrDownload(blob, `GameNight_Show_${date}.png`, t('ph.aw.shareText'));
        if (how === 'downloaded') toast(t('ph.aw.imgSaved'));
      } catch (err) {
        console.error(err);
        toast(t('ph.aw.imgFail'), 'error');
      }
      btn.disabled = false;
    });
    $('#storyBtn', el).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const wins = {};
        for (const r of board) for (const u of Object.keys(r.winners || {})) wins[u] = (wins[u] || 0) + 1;
        const top = Math.max(0, ...Object.values(wins));
        const winners = top ? Object.keys(wins).filter((u) => wins[u] === top).map((u) => P.players[u]?.name).filter(Boolean) : [];
        const mvp = awards.find((a) => a.key === 'mvp')?.players.map((p) => p.name) || [];
        const number = P.meta.groupId ? nightsList(P.nights).find((n) => n.room === P.code)?.number : null;
        const id = P.identity || {};
        const blob = await renderStoryImage({
          title: P.meta.groupName || t('ph.aw.ourNight'), emblem: id.logo ? '' : (id.emblem || ''), color: id.color,
          subtitle: nightDate(P.meta.createdAt), number, board, mvp, winners,
          awards: awards.filter((a) => !['mvp', 'wins'].includes(a.key)).map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) })),
          facts: `${t('ph.mem.games', { n: board.length })} · ${t('lib.players', { n: activePlayers(P.players).length })}`
        });
        const how = await shareOrDownload(blob, `GameNight_Show_${t('ph.aw.storyFile')}_${new Date().toISOString().slice(0, 10)}.png`, t('ph.aw.ourNight'));
        if (how === 'downloaded') toast(t('ph.aw.storySaved'));
      } catch (err) {
        console.error(err);
        toast(t('ph.aw.imgFail'), 'error');
      }
      btn.disabled = false;
    });
  }
};

// ---------------------------------------------------------------------------
// Voto
// ---------------------------------------------------------------------------

SCREENS.vote = {
  mount(el) {
    const gid = P.state.gameId;
    const g = P.games[gid];
    const mine = P.votes[gid]?.[P.uid];
    if (P.voteGameId !== gid) {
      P.voteGameId = gid;
      P.editingVote = false;
      const draft = loadDraft(gid);
      if (mine) {
        P.vote = emptyVote();
        for (const k of VOTE_KEYS) if (mine[k] !== undefined) P.vote[k] = mine[k];
        // Criterio non presente in un voto già inviato = "Non giudico"
        for (const c of activeCriteria(P.meta.voting)) if (typeof mine[c.key] !== 'number' && !g.quick) P.vote[c.key] = 'na';
      } else {
        P.vote = draft || emptyVote();
      }
      if (!mine && draft) toast(t('ph.v.draft'));
    }
    // MVP: solo tra chi ha giocato davvero (se qualcuno guardava)
    const list = others().filter((p) => !g.players || g.players[p.uid]);
    this.needMvp = list.length > 0;
    this.quick = Boolean(g.quick);
    this.crits = this.quick ? [] : activeCriteria(P.meta.voting);
    const spectator = Boolean(g.players && !g.players[P.uid]);
    const noteKey = `${P.code}_${gid}`;
    const note = privateNotes()[noteKey]?.text || '';

    el.innerHTML = `
      <main class="phone phone--vote">
        <div class="fuse" id="fuse" hidden role="timer">
          <div class="fuse-track" aria-hidden="true"><i class="fuse-rope" id="fuseRope"></i><b class="fuse-spark" id="fuseSpark"><i></i><i></i><i></i></b></div>
          <span class="fuse-txt" id="fuseTxt"></span>
        </div>
        <div class="ph-row">
          <span class="chip chip--tomato">${esc(t('ph.v.game', { n: String(g.order || '') }))}</span>
          <span class="secret">${ICONS.lock}<span>${esc(t('ph.v.secret'))}</span></span>
          <button type="button" class="net-pill" data-netpill aria-live="polite"></button>
        </div>
        <div class="card vgame">
          ${gameImageHTML(g, 'game-img--vote')}
          <h1 class="vgame-name">${esc(g.name)}</h1>
        </div>
        ${spectator ? `<p class="spectator-note">👀 ${t('ph.v.spectator')}</p>` : ''}

        <section class="vblock">
          <div class="ph-row">
            <label for="overall" class="vlabel">${esc(t('ph.v.overall'))}</label>
            <output id="overallOut" class="score-badge" for="overall">?</output>
          </div>
          <div class="giant-wrap">
            <input type="range" id="overall" class="range range--giant" min="1" max="10" step="1" value="${P.vote.overall ?? 5}" aria-describedby="overallHint">
            <div class="ticks ticks--giant" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<span style="--i:${i}">${i + 1}</span>`).join('')}</div>
          </div>
          <p class="vhint" id="overallHint">${esc(t('ph.v.overallHint'))}</p>
        </section>

        ${this.quick ? `<p class="quick-badge">${esc(t('ph.v.quick'))}</p>` : ''}
        ${this.crits.map((c) => `
          <fieldset class="vblock">
            <legend class="vlabel">${esc(c.label)}</legend>
            <p class="vhint">${esc(c.hint)}</p>
            <div class="pips-row" data-crit="${c.key}" style="--cc:${c.color}">
              ${[1, 2, 3, 4, 5].map((k) => `<button type="button" class="pip-btn" data-k="${k}" aria-pressed="false" aria-label="${esc(t('ph.v.pipAria', { crit: c.label, n: k }))}">${k}</button>`).join('')}
            </div>
            <button type="button" class="na-btn" data-na="${c.key}" aria-pressed="false">${esc(t('ph.v.na'))}</button>
          </fieldset>`).join('')}

        <fieldset class="vblock">
          <legend class="vlabel">${esc(t('ph.v.mvp'))}</legend>
          ${list.length
            ? `<p class="vhint">${esc(t('ph.v.mvpHint'))}</p>
               <div class="mvp-slot" id="mvpSlot" aria-live="polite"></div>
               <div class="mvp-grid mvp-hand" style="--n:${list.length}">${list.map((p, i) => `
                 <button type="button" class="mvp-btn mvp-card" data-mvp="${esc(p.uid)}" aria-pressed="false" style="--pc:${safeColor(p.color)}; --k:${i - (list.length - 1) / 2}">
                   <span class="mvp-av">${ICONS.crown}${avatarHTML(p, '3.9rem')}</span>
                   <span class="mvp-n">${esc(p.name)}</span>
                 </button>`).join('')}</div>`
            : `<p class="vhint">${esc(t('ph.v.mvpNone'))}</p>`}
        </fieldset>

        <fieldset class="vblock guess-block">
          <legend class="vlabel">${esc(t('ph.v.guess'))} <span class="muted">${esc(t('common.optional'))}</span></legend>
          <p class="vhint">${esc(t('ph.v.guessHint'))}</p>
          <div class="guess-row">
            <input type="range" id="guess" class="range range--guess" min="1" max="10" step="0.5" value="${P.vote.guess ?? 5.5}" aria-label="${esc(t('ph.v.guessAria'))}">
            <output id="guessOut" class="score-badge score-badge--sm" for="guess">?</output>
          </div>
          <button type="button" class="link-btn" id="guessClear">${esc(t('ph.v.guessClear'))}</button>
        </fieldset>

        <section class="vblock">
          <label class="vlabel" for="voteComment">${esc(t('ph.v.comment'))} <span class="muted">${esc(t('ph.v.commentHint'))}</span></label>
          <input class="input" id="voteComment" maxlength="80" autocomplete="off" placeholder="${esc(t('ph.v.commentPh'))}" value="${esc(P.vote.comment || '')}">
        </section>
        <details class="vblock priv-note" ${note ? 'open' : ''}>
          <summary class="vlabel">${esc(t('ph.v.note'))} <span class="muted">${esc(t('ph.v.noteHint'))}</span></summary>
          <textarea class="input" id="privNote" maxlength="300" rows="2" placeholder="${esc(t('ph.v.notePh'))}">${esc(note)}</textarea>
        </details>

        <p class="form-error" id="voteErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="sendVote">${esc(mine ? t('ph.v.update') : t('ph.v.send'))}</button>
        <p class="muted center small">${esc(t('ph.v.hidden'))}</p>
      </main>`;

    const range = $('#overall', el);
    const take = () => {
      const val = Number(range.value);
      if (val !== P.vote.overall) buzz(val === 10 || val === 1 ? 18 : 6);
      P.vote.overall = val;
      this.paint();
    };
    ['input', 'change', 'pointerup', 'touchend', 'keyup'].forEach((ev) => range.addEventListener(ev, take));

    el.querySelectorAll('[data-na]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.na;
      P.vote[k] = P.vote[k] === 'na' ? null : 'na';
      this.paint();
    }));
    $('#voteComment', el).addEventListener('input', (e) => { P.vote.comment = e.target.value; saveDraft(P.state.gameId, P.vote); });
    $('#privNote', el).addEventListener('input', (e) => saveNote(noteKey, g.name, e.target.value));
    el.querySelectorAll('.pips-row').forEach((row) => row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      P.vote[row.dataset.crit] = Number(b.dataset.k);
      this.paint();
    }));
    this.mvpList = list;
    el.querySelector('.mvp-grid')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mvp]');
      if (!b || Date.now() - (this.dragEnd || 0) < 400) return;
      this.pickMvp(b.dataset.mvp);
    });
    this.setupMvpDrag(el);
    $('#mvpSlot', el)?.addEventListener('click', (e) => {
      if (!e.target.closest('[data-mvpclear]')) return;
      P.vote.mvp = null;
      buzz(8);
      this.paint();
    });
    this.fuse = setInterval(() => this.paintFuse(), 250);
    this.paintFuse();
    const guess = $('#guess', el);
    const takeGuess = () => { P.vote.guess = Number(guess.value); this.paint(); };
    ['input', 'change'].forEach((ev) => guess.addEventListener(ev, takeGuess));
    $('#guessClear', el).addEventListener('click', () => { P.vote.guess = null; this.paint(); });
    $('#sendVote', el).addEventListener('click', () => this.send());
    this.paint();
  },

  pickMvp(uid) {
    if (P.vote.mvp !== uid) buzz([10, 30, 14]);
    P.vote.mvp = uid;
    this.paint();
    const slot = $('#mvpSlot');
    if (slot) { slot.classList.remove('is-slap'); void slot.offsetWidth; slot.classList.add('is-slap'); }
  },

  /** Carte MVP: si trascinano verso l'alto, sul tavolo (il tocco resta valido). */
  setupMvpDrag(el) {
    const hand = $('.mvp-hand', el);
    const slot = $('#mvpSlot', el);
    if (!hand || !slot) return;
    let d = null;
    const over = (x, y) => {
      const r = slot.getBoundingClientRect();
      return x > r.left - 20 && x < r.right + 20 && y > r.top - 30 && y < r.bottom + 30;
    };
    const end = (e, cancel = false) => {
      if (!d || (e && e.pointerId !== d.id)) return;
      const cur = d;
      d = null;
      if (!cur.ghost) return;
      this.dragEnd = Date.now();
      slot.classList.remove('is-over');
      cur.card.classList.remove('is-lifting');
      const hit = !cancel && e && (over(e.clientX, e.clientY) || e.clientY - cur.y0 < -90);
      if (hit) {
        const r = slot.getBoundingClientRect();
        cur.ghost.style.transition = 'transform .22s cubic-bezier(.3,1.4,.5,1), opacity .22s';
        cur.ghost.style.transform = `translate(${r.left + r.width / 2 - cur.cx}px, ${r.top + r.height / 2 - cur.cy}px) rotate(-4deg) scale(0.9)`;
        cur.ghost.style.opacity = '0';
        setTimeout(() => cur.ghost.remove(), 230);
        this.pickMvp(cur.card.dataset.mvp);
      } else {
        cur.ghost.style.transition = 'transform .25s ease, opacity .25s';
        cur.ghost.style.transform = 'translate(0, 0)';
        cur.ghost.style.opacity = '0';
        setTimeout(() => cur.ghost.remove(), 260);
      }
    };
    hand.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.mvp-btn');
      if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const r = card.getBoundingClientRect();
      d = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    window.addEventListener('pointermove', this.onMove = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.ghost) {
        if (Math.hypot(dx, dy) < 12) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.3) { d = null; return; } // scorrimento orizzontale della mano
        const g = d.card.cloneNode(true);
        g.classList.add('mvp-ghost');
        g.removeAttribute('data-mvp');
        g.setAttribute('aria-hidden', 'true');
        Object.assign(g.style, { left: `${d.r.left}px`, top: `${d.r.top}px`, width: `${d.r.width}px`, height: `${d.r.height}px` });
        document.body.appendChild(g);
        d.ghost = g;
        d.card.classList.add('is-lifting');
        buzz(10);
      }
      e.preventDefault();
      d.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-14, Math.min(14, dx / 12))}deg) scale(1.08)`;
      slot.classList.toggle('is-over', over(e.clientX, e.clientY));
    }, { passive: false });
    window.addEventListener('pointerup', this.onUp = (e) => end(e));
    window.addEventListener('pointercancel', this.onCancel = (e) => end(e, true));
  },

  /** Miccia del timer: si accorcia, cambia colore e alla fine fa vibrare il telefono. */
  paintFuse() {
    const box = $('#fuse');
    if (!box) return;
    const tm = voteTimer(P.state, serverNow());
    box.hidden = !tm;
    if (!tm) return;
    box.style.setProperty('--tc', timerColor(tm.frac));
    $('#fuseRope').style.width = `${(tm.frac * 100).toFixed(2)}%`;
    box.style.setProperty('--fx', `${(tm.frac * 100).toFixed(2)}%`);
    box.classList.toggle('is-hot', !tm.over && !tm.paused && tm.sec <= 10);
    box.classList.toggle('is-over', tm.over);
    box.classList.toggle('is-paused', tm.paused);
    $('#fuseTxt').textContent = tm.over ? t('ph.v.timeUp') : tm.paused ? t('ph.v.timerPaused') : `${tm.sec >= 60 ? `${Math.floor(tm.sec / 60)}:${String(tm.sec % 60).padStart(2, '0')}` : `${tm.sec} s`}`;
    if (!tm.paused && tm.sec !== this.fuseSec && this.fuseSec !== undefined) {
      if (tm.sec === 10) buzz([40, 60, 40]);
      if (tm.over) buzz([120, 80, 120, 80, 200]);
    }
    this.fuseSec = tm.sec;
  },

  unmount() {
    clearInterval(this.fuse);
    this.fuseSec = undefined;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    document.querySelectorAll('.mvp-ghost').forEach((g) => g.remove());
  },

  paint() {
    const v = P.vote;
    const range = $('#overall');
    const out = $('#overallOut');
    range.classList.toggle('is-untouched', !v.overall);
    range.style.setProperty('--p', v.overall ? `${((v.overall - 1) / 9) * 100}%` : '0%');
    range.style.setProperty('--f', v.overall ? String((v.overall - 1) / 9) : '0');
    out.textContent = v.overall ?? '?';
    out.classList.toggle('is-set', Boolean(v.overall));

    document.querySelectorAll('.pips-row').forEach((row) => {
      const val = v[row.dataset.crit];
      row.classList.toggle('is-na', val === 'na');
      row.querySelectorAll('.pip-btn').forEach((b) => {
        const k = Number(b.dataset.k);
        b.classList.toggle('is-on', typeof val === 'number' && k <= val);
        b.classList.toggle('is-picked', k === val);
        b.setAttribute('aria-pressed', String(k === val));
      });
    });
    document.querySelectorAll('[data-na]').forEach((b) => b.setAttribute('aria-pressed', String(v[b.dataset.na] === 'na')));
    document.querySelectorAll('.mvp-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mvp === v.mvp));
    });
    range.style.setProperty('--vc', v.overall ? timerColor((v.overall - 1) / 9) : 'var(--paper)');
    const slot = $('#mvpSlot');
    if (slot) {
      const p = v.mvp && (this.mvpList || []).find((x) => x.uid === v.mvp);
      const sig = p ? `${p.uid}|${p.name}` : '';
      if (slot.dataset.sig !== sig) {
        slot.dataset.sig = sig;
        slot.classList.toggle('is-set', Boolean(p));
        slot.innerHTML = p
          ? `<div class="mvp-played" style="--pc:${safeColor(p.color)}"><span class="mvp-av">${ICONS.crown}${avatarHTML(p, '3.4rem')}</span><span class="mvp-played-txt"><small>${esc(t('ph.v.myMvp'))}</small><b>${esc(p.name)}</b></span><button type="button" class="link-btn" data-mvpclear>${esc(t('ph.v.change'))}</button></div>`
          : `<span class="mvp-slot-empty"><b>${esc(t('ph.v.table'))}</b><small>${esc(t('ph.v.tableHint'))}</small></span>`;
      }
    }
    const gOut = $('#guessOut');
    const gRange = $('#guess');
    if (gRange) {
      const has = typeof v.guess === 'number';
      gRange.classList.toggle('is-untouched', !has);
      gRange.style.setProperty('--p', has ? `${((v.guess - 1) / 9) * 100}%` : '0%');
    }
    if (gOut) {
      gOut.textContent = v.guess === null || v.guess === undefined ? '?' : fmt(v.guess, Number.isInteger(v.guess) ? 0 : 1);
      gOut.classList.toggle('is-set', v.guess !== null && v.guess !== undefined);
      $('#guessClear').hidden = v.guess === null || v.guess === undefined;
    }
    $('#voteErr').textContent = '';
    saveDraft(P.state.gameId, v);
  },

  async send() {
    const v = P.vote;
    const missing = [];
    if (!v.overall) missing.push(t('ph.v.missOverall'));
    for (const c of this.crits) if (v[c.key] === null || v[c.key] === undefined) missing.push(t('ph.v.missCrit', { crit: c.label.toLowerCase() }));
    if (this.needMvp && !v.mvp) missing.push('MVP');
    if (missing.length) {
      $('#voteErr').textContent = t('ph.v.missing', { list: missing.join(', ') });
      return;
    }
    const gid = P.state.gameId;
    const btn = $('#sendVote');
    btn.disabled = true;
    const data = { overall: v.overall, at: serverTimestamp() };
    for (const c of this.crits) if (typeof v[c.key] === 'number') data[c.key] = v[c.key];
    if (v.mvp) data.mvp = v.mvp;
    if (typeof v.guess === 'number') data.guess = v.guess;
    const comment = cleanName(v.comment || '', 80);
    if (comment) data.comment = comment;
    try {
      outboxSave(gid, { ...data, at: null });
      await Net.track('vote', set(roomRef(P.code, `votes/${gid}/${P.uid}`), data));
      outboxClear();
      clearDrafts();
      P.editingVote = false;
      if (navigator.vibrate) navigator.vibrate(30);
      render();
    } catch (e) {
      const msg = String(e?.code || e?.message || '').toLowerCase().includes('permission')
        ? t('ph.v.closed')
        : explainError(e);
      $('#voteErr').textContent = msg;
      btn.disabled = false;
    }
  }
};

SCREENS.voted = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="sent-badge">${ICONS.check}</div>
        <h1 class="ph-title" id="votedTitle">${esc(t('ph.vote.sent'))}</h1>
        <p class="ph-lead" id="votedLead">${esc(t('ph.vote.sentLead'))}</p>
        <div class="card my-vote" id="myVote"></div>
        <p class="vote-progress" id="voteProg" aria-live="polite"></p>
        <button type="button" class="btn-sec" id="editVote">${esc(t('ph.v.edit'))}</button>
        ${photoButtonHTML()}
      </main>`;
    $('#editVote', el).addEventListener('click', () => {
      P.editingVote = true;
      render();
    });
  },
  update() {
    const gid = P.state.gameId;
    const g = P.games[gid];
    const mine = P.votes[gid]?.[P.uid];
    if (!mine) return;
    const ps = activePlayers(P.players);
    const voted = ps.filter((p) => P.votes[gid]?.[p.uid]).length;
    $('#voteProg').textContent = t('ph.rg.voted', { n: voted, total: ps.length });

    const sig = JSON.stringify([mine, P.players[mine.mvp]?.name]);
    if (sig === this.sig) return;
    this.sig = sig;
    const mvp = mine.mvp ? (P.players[mine.mvp] || { name: t('ph.exPlayer') }) : null;
    $('#myVote').innerHTML = `
      <div class="my-vote-head"><b class="vgame-name">${esc(g.name)}</b><span class="score-badge is-set">${mine.overall}</span></div>
      ${activeCriteria(P.meta.voting).some((c) => typeof mine[c.key] === 'number') ? `<div class="my-vote-crit">${activeCriteria(P.meta.voting).map((c) => `<span class="bcrit-item" style="--cc:${c.color}">${esc(c.short || c.label)} ${typeof mine[c.key] === 'number' ? mine[c.key] : '—'}</span>`).join('')}</div>` : ''}
      ${mine.comment ? `<p class="my-vote-guess">«${esc(mine.comment)}»</p>` : ''}
      ${typeof mine.guess === 'number' ? `<p class="my-vote-guess">${t('ph.v.myGuess', { n: `<b>${fmt(mine.guess, Number.isInteger(mine.guess) ? 0 : 1)}</b>` })}</p>` : ''}
      ${mvp ? `<div class="my-vote-mvp">${avatarHTML({ ...mvp, uid: mine.mvp }, '2.4rem')}<span>MVP: <b>${esc(mvp.name)}</b></span></div>` : ''}`;
  }
};
