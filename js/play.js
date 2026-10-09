// Schermata telefono (giocatore): ingresso con avatar, voto segreto, attesa del reveal.
import {
  isConfigured, connect, roomRef, groupRef, armadioRef, libraryRef, memberRef, dbRef, onValue, get, set, update, push, serverTimestamp, explainError,
  trackConnection, serverNow
} from './fb.js';
import {
  $, esc, fmt, param, normalizeCode, sortedPlayers, activePlayers, compressImage, gameImage, gameImageHTML, toast,
  installImageFallback, showFatal, showNotConfigured, ICONS, PLAYER_COLORS, safeColor, nameKey, cleanName, asList, libInfo, libFits, connectionStatus,
  keepAwake, watchVersion, registerSW, randomCode, userError, applyTheme, themeSwitchHTML, watchBattery, compressPhoto, dbKey, qrSVG,
  ErrLog, a11yHTML, voteTimer, timerColor, buzz
} from './util.js';
import { avatarHTML, avatarUri, avatarOptions, avatarParts } from './avatars.js';
import {
  CRITERIA, gameStats, verdict, buildBoard, buildAwards, buildAllTime, personalStats, personKey, trophies, affinities,
  activeCriteria, progressFor, newAchievements, recommend,
  nightsList, wrapped, yearsOf, personInsights, searchLibrary, parseQuery, tagsOf, isAvailable, GAME_STATUS, GAME_MODES, nightFacts,
  nightChampions
} from './stats.js';
import { confettiBurst } from './fx.js';
import { publicUrl, isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';
import { bindPhonePrep, gameRowHTML, tonightSummaryHTML, markTonight, Scanner, rulesCardHTML, planCardHTML, bringHTML } from './phone-prep.js';
import { bindPhone, knock, checkCohost, tableHTML, paintSand, scoreHTML, QuizPhone, cardSectionHTML, bindCardSection, rivalsSectionHTML, seasonLineHTML, icsButtonHTML } from './phone-extras.js';
import { renderShareImage, renderStoryImage, shareOrDownload, nightDate } from './share.js';
import { SFX_META } from './sfx.js';
import { setRoomSafeMode } from './safe.js';

const app = $('#app');
const WATCHED = ['meta', 'state', 'players', 'games', 'votes', 'poll', 'presence', 'claims', 'heartbeat', 'bets', 'profileClaims', 'profileGrants', 'scores', 'table', 'quiz', 'quizAns', 'quizScore', 'cohosts', 'tonight', 'wish', 'plan', 'rules', 'knows'];
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
bindPhonePrep({ P, roomRef, groupRef, libraryRef, set, update, push, serverTimestamp, explainError, Net: { track: (l, pr) => Net.track(l, pr) } });

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
    if (found) toast(found === 1 ? 'Ho ritrovato il tuo profilo su questo telefono' : `Ho ritrovato ${found} profili su questo telefono`);
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
  throw new Error('nessun codice libero');
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Nell'app: pulsante per inquadrare il QR della TV (la fotocamera del telefono aprirebbe il browser). */
function qrScanButtonHTML() {
  return isApp() && canScanQR() ? '<button type="button" class="btn-sec btn-block qr-scan-btn" data-scanqr>📷 Inquadra il QR della TV</button>' : '';
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-scanqr]');
  if (!b) return;
  e.preventDefault();
  const text = await scanQR();
  if (!text) return;
  const to = routeFromQR(text);
  if (to) location.href = to;
  else toast('Questo QR non è di GameNight Show.', 'warn');
});

/** Suggerimento per installare l'app sul telefono (non compare se è già installata). */
function installHintHTML(code = '') {
  if (isStandalone() || isApp()) return '';
  const apk = isAndroid() ? apkUrl() : '';
  const how = isIOS()
    ? 'Su iPhone: tocca <b>Condividi</b> in Safari e poi <b>Aggiungi alla schermata Home</b>.'
    : apk
      ? 'Su Android: scarica l’<b>app GameNight Show</b> qui sotto, oppure tocca <b>Installa</b> per aggiungere il sito alla schermata Home.'
      : 'Su Android: tocca <b>Installa</b> qui sotto, oppure il menu ⋮ di Chrome e poi <b>Installa app</b>.';
  return `
    <section class="card install-card">
      <h2>Installa l'app</h2>
      <p>${how} Si apre a schermo intero e trova da sola la serata in corso.</p>
      ${code ? `<p class="muted small">L'app installata ha una memoria separata dal browser: al primo avvio inserisci il tuo codice personale <b>${esc(code)}</b>.</p>` : ''}
      ${apk ? `<a class="btn" href="${esc(apk)}" rel="noopener">📲 Scarica l’app Android</a>` : ''}
      ${!isIOS() ? '<button type="button" class="btn-sec" id="installBtn">Installa</button>' : ''}
    </section>`;
}
function bindInstall(root) {
  $('#installBtn', root)?.addEventListener('click', async () => {
    if (!installPrompt) { toast('Usa il menu ⋮ di Chrome e scegli "Installa app".'); return; }
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
  });
}

// ---------------------------------------------------------------------------
// Schermata iniziale dell'app: profilo, serata in corso, codici
// ---------------------------------------------------------------------------

async function renderHome(error = '') {
  const mine = Object.entries(profiles());
  app.innerHTML = `
    <main class="phone">
      ${phoneTop('', 'index')}
      <div id="homeNights" class="home-nights"></div>
      <form class="card ph-card" id="codeForm" novalidate>
        <h2>Entra con il codice della TV</h2>
        <label class="sr-only" for="codeInput">Codice stanza</label>
        <input class="input code-input" id="codeInput" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2" value="${esc(normalizeCode(localStorage.getItem('gnr_room')))}">
        <p class="form-error" role="alert">${esc(error)}</p>
        <button class="btn btn-block" type="submit">Entra</button>
        ${qrScanButtonHTML()}
      </form>
      <form class="card ph-card" id="memberForm" novalidate>
        <h2>${mine.length ? 'Un altro profilo?' : 'Hai già un profilo?'}</h2>
        <p class="muted">Scrivi il tuo codice personale di 6 caratteri per ritrovare nome, personaggio e statistiche.</p>
        <label class="sr-only" for="memberInput">Codice personale</label>
        <input class="input code-input code-input--6" id="memberInput" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123">
        <p class="form-error" id="memberErr" role="alert"></p>
        <button class="btn-sec" type="submit">Ritrova il profilo</button>
      </form>
      ${installHintHTML()}
      <section class="card ph-card"><h2>Tema</h2>${themeSwitchHTML('homeTheme')}</section>
      <section class="card ph-card"><h2>Accessibilità</h2>${a11yHTML('homeA11y')}</section>
    </main>`;
  bindInstall(app);
  const input = $('#codeInput');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (code.length !== 4) { $('#codeForm .form-error').textContent = 'Il codice ha 4 caratteri.'; return; }
    location.search = `?room=${code}`;
  });
  $('#memberInput').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  $('#memberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = normalizeCode($('#memberInput').value, 6);
    try {
      const m = await loadMember(id);
      if (!m) { $('#memberErr').textContent = 'Nessun profilo con questo codice.'; return; }
      saveProfile(m.groupId, m.id);
      toast(`Ciao, ${m.name}!`);
      renderHome();
    } catch (err) {
      $('#memberErr').textContent = explainError(err);
    }
  });

  // Una scheda per ogni profilo: si aggiorna da sola quando l'host crea la serata.
  const box = $('#homeNights');
  for (const [gid, mid] of mine) {
    const card = document.createElement('article');
    card.className = 'card home-night';
    card.innerHTML = '<p class="muted">Carico il profilo…</p>';
    box.appendChild(card);
    const [m, info] = await Promise.all([loadMember(mid).catch(() => null), get(groupRef(gid, 'info')).then((s) => s.val()).catch(() => null)]);
    if (!m) { card.remove(); forgetProfile(gid); continue; }
    onValue(groupRef(gid, 'current'), async (snap) => {
      const cur = snap.val();
      let live = null;
      if (cur?.room) {
        const [meta, state] = await Promise.all([get(roomRef(cur.room, 'meta')), get(roomRef(cur.room, 'state'))]).catch(() => [null, null]);
        if (meta?.exists()) live = { room: cur.room, done: state?.val()?.phase === 'awards' && state?.val()?.done };
      }
      card.innerHTML = `
        <div class="home-me">${avatarHTML(m, '3.6rem', 'avatar--shadow')}<div><b class="home-name">Ciao, ${esc(m.name)}!</b><span class="muted">${esc(info?.name || 'Il tuo gruppo')}</span></div></div>
        ${live
          ? `<a class="btn btn-block" href="play.html?room=${esc(live.room)}">${live.done ? 'Vedi i risultati della serata' : `Entra nella serata in corso (${esc(live.room)})`}</a>`
          : '<p class="muted">Nessuna serata in corso: quando l’host ne crea una, compare qui.</p>'}
        <p class="muted small">Il tuo codice personale: <b>${esc(m.id)}</b></p>`;
    }, () => {});
  }
}

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  const code = normalizeCode(param('room'));

  app.innerHTML = loadingHTML('Collegamento in corso…');
  try {
    P.uid = await connect();
  } catch (err) {
    showFatal(app, 'Impossibile collegarsi', explainError(err));
    return;
  }
  // Link (o QR) del profilo personale: collega il profilo a questo telefono.
  const prof = normalizeCode(param('profilo'), 6);
  if (prof.length === 6) {
    try {
      const m = await loadMember(prof);
      if (m) { saveProfile(m.groupId, m.id); toast(`Profilo di ${m.name} collegato a questo telefono`); }
      else toast('Nessun profilo con questo codice.', 'warn');
    } catch (err) { toast(explainError(err), 'error'); }
    const url = new URL(location.href);
    url.searchParams.delete('profilo');
    history.replaceState(null, '', url.pathname + url.search);
  }
  await syncDeviceProfiles();
  if (code.length !== 4) { renderHome(); return; }

  if (param('foto') === '1') { renderPhotoMode(code); return; }

  try {
    const meta = (await get(roomRef(code, 'meta'))).val();
    if (!meta) { renderHome('Stanza non trovata: controlla il codice sulla TV.'); return; }
  } catch (err) {
    showFatal(app, 'Impossibile leggere la stanza', explainError(err));
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
      ${back ? `<button type="button" class="btn-sec btn-sec--sm ph-back" data-phback="${esc(back)}" aria-label="Indietro">←</button>` : ''}
      <span class="brand-row"><span class="ph-emblem" data-emblem>${phoneEmblemHTML()}</span><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span class="ph-right">${code ? `<span class="ph-room">Stanza ${esc(code)}</span>` : ''}${code ? '<button type="button" class="net-pill" data-netpill aria-live="polite"></button>' : ''}</span>
    </header>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-phback]');
  if (!b) return;
  const to = b.dataset.phback;
  if (to === 'index') { location.href = 'index.html'; return; }
  if (to === 'home') { location.href = 'play.html'; return; }
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
    if (outboxPending() && !items.some((x) => x.label === 'Voto')) n++;
    return n;
  },
  syncedToast() {
    const l = this.synced;
    this.synced = [];
    if (!l.length) return;
    toast(l.length === 1 ? `✓ ${l[0]} sincronizzato` : `✓ ${l.length} azioni sincronizzate`);
  },
  paint() {
    const n = this.count();
    const st = n ? 'queue' : this.online ? 'ok' : 'off';
    const html = st === 'ok' ? '<i class="net-dot"></i><span class="sr-only">Connesso</span>' : st === 'off' ? '<i class="net-dot"></i><span>Offline</span>' : `<i class="net-dot"></i><span>In coda · ${n}</span>`;
    const title = st === 'ok' ? 'Connesso: tutto sincronizzato' : st === 'off' ? 'Connessione persa: i tuoi dati sono salvati sul telefono' : `${n} ${n === 1 ? 'azione in attesa' : 'azioni in attesa'} di invio: partono da sole appena torna la rete`;
    // Voto ancora in coda: la schermata "Voto inviato" lo dice chiaramente.
    const vt = document.getElementById('votedTitle');
    if (vt) {
      const queued = [...this.pending.values()].some((x) => x.label === 'Voto' && x.queued) || (outboxPending() && !this.online);
      const t = queued ? 'Voto in coda' : 'Voto inviato!';
      if (vt.textContent !== t) {
        vt.textContent = t;
        document.getElementById('votedLead').textContent = queued ? 'Niente rete in questo momento: il voto è salvato sul telefono e parte da solo appena torna la connessione.' : 'Aspetta gli altri: il reveal è sulla TV.';
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
      <h1 class="ph-title">Entra nella serata</h1>
      <p class="ph-lead">Scrivi il codice di 4 caratteri che vedi sulla TV, oppure inquadra il QR.</p>
      <form class="code-form" id="codeForm" novalidate>
        <label class="sr-only" for="codeInput">Codice stanza</label>
        <input class="input code-input" id="codeInput" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2" value="${esc(last)}">
        <p class="form-error" role="alert">${esc(error)}</p>
        <button class="btn btn-block" type="submit">Entra</button>
        ${qrScanButtonHTML()}
      </form>
    </main>`;
  const input = $('#codeInput');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  $('#codeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (code.length !== 4) {
      app.querySelector('.form-error').textContent = 'Il codice ha 4 caratteri.';
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
      <h1 class="ph-title">Foto del gioco</h1>
      <p class="ph-lead">Scatta una foto alla scatola: comparirà subito sulla TV.</p>
      <label class="btn btn-block" for="camInput">${ICONS.camera}<span>Scatta o scegli una foto</span></label>
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
    status.textContent = 'Invio in corso…';
    try {
      const data = await gameImage(file);
      await set(roomRef(code, 'pendingImage'), { data, at: serverTimestamp() });
      $('#photoPrev').innerHTML = `<img src="${data}" alt="Foto inviata">`;
      status.textContent = 'Foto inviata! Controlla la TV. Puoi scattarne un’altra se serve.';
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
  app.innerHTML = loadingHTML('Entro nella stanza…');
  for (const key of WATCHED) {
    onValue(roomRef(code, key), (snap) => {
      const val = snap.val();
      P[key] = (key === 'meta' || key === 'state' || key === 'poll') ? val : (val || {});
      P.loaded.add(key);
      render();
    }, (err) => showFatal(app, 'Connessione persa', explainError(err)));
  }
  // Presenza: la TV vede se questo telefono è collegato e non lo aspetta se cade la linea.
  trackConnection((on) => { connectionStatus(on); Net.setOnline(on); }, code, P.uid);
}

const SCREENS = {};

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
  return `<label class="btn-sec photo-btn" for="memPhoto">📸 <span>Foto ricordo</span></label>
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
      <div class="panel-head"><h2 id="phTitle">Foto ricordo</h2><button type="button" class="icon-btn" data-phclose aria-label="Chiudi">${ICONS.x}</button></div>
      <img class="photo-prev-big" src="${data}" alt="">
      <label class="field-label" for="phCaption">Momento memorabile <span class="muted">(facoltativo)</span></label>
      <input class="input" id="phCaption" maxlength="80" placeholder="Es. Il tradimento di Marco${game ? ` a ${esc(game)}` : ''}">
      <button type="button" class="btn btn-block" id="phSave">Aggiungi all’album</button>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', async (ev) => {
    if (ev.target === sheet || ev.target.closest('[data-phclose]')) { sheet.remove(); return; }
    if (!ev.target.closest('#phSave')) return;
    ev.target.closest('#phSave').disabled = true;
    try {
      const gid = P.meta.groupId;
      await Net.track('Foto', rated((x) => groupRef(gid, x), `photos/${P.code}`, 'photo', {
        data, uid: P.uid, by: P.players[P.uid]?.name || '', at: serverTimestamp(),
        caption: cleanName($('#phCaption', sheet).value, 80) || null, game: game || null
      }));
      sheet.remove();
      toast('Foto aggiunta all’album della serata');
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
  return String(err?.code || err?.message || '').toLowerCase().includes('permission') ? 'Troppo veloce: riprova tra qualche secondo.' : explainError(err);
}

const RSVP_LABEL = { si: 'Ci sono', forse: 'Forse', no: 'Non ci sono' };

/** Prossima serata con le presenze. gid/key/name: gruppo e persona che risponde. */
function nextNightHTML(next, key) {
  const at = Number(next?.at) || 0;
  if (!at) return `<p class="muted">Nessuna data fissata.</p>`;
  const rs = Object.values(next.rsvp || {});
  const mine = next.rsvp?.[key]?.answer;
  const count = (a) => rs.filter((r) => r.answer === a).length;
  const yes = rs.filter((r) => r.answer === 'si').map((r) => r.name);
  return `
    <p class="next-when">${esc(new Date(at).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}${next.place ? ` · ${esc(next.place)}` : ''}</p>
    <div class="rsvp-btns" role="group" aria-label="Ci sei?">${['si', 'forse', 'no'].map((a) => `<button type="button" class="lib-chip" data-rsvp="${a}" aria-pressed="${mine === a}">${RSVP_LABEL[a]} (${count(a)})</button>`).join('')}</div>
    ${yes.length ? `<p class="muted small">Ci sono: ${esc(yes.join(', '))}</p>` : ''}`;
}

async function answerRsvp(gid, key, name, answer) {
  await Net.track('Presenza', set(groupRef(gid, `next/rsvp/${key}`), { name, answer }));
  toast(answer === 'si' ? 'Ci vediamo alla serata!' : answer === 'forse' ? 'Segnato: forse' : 'Peccato, alla prossima!');
}

/** Dettaglio di una serata passata (con l'album), in un foglio sopra la pagina. */
async function openNightSheet(n, gid) {
  const sheet = document.createElement('div');
  sheet.className = 'overlay overlay--sheet';
  const names = Object.fromEntries(Object.entries(n.people || {}).map(([k, pp]) => [k, pp.name]));
  const quotes = Array.isArray(n.quotes) ? n.quotes : Object.values(n.quotes || {});
  sheet.innerHTML = `
    <div class="card sheet sheet--tall" role="dialog" aria-modal="true" aria-labelledby="nsTitle">
      <div class="panel-head"><h2 id="nsTitle">Game Night #${n.number}</h2><button type="button" class="icon-btn" data-nsclose aria-label="Chiudi">${ICONS.x}</button></div>
      <p class="muted">${esc(new Date(Number(n.at)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${nightFacts(n)}</p>
      <div class="p-board"><ol>${[...n.gamesSorted].sort((a, b) => (b.n ? b.sum / b.n : 0) - (a.n ? a.sum / a.n : 0)).map((g, i) => `<li class="p-row"><span class="p-rank">${i + 1}</span><span class="p-name">${esc(g.name)}${(g.w || []).length ? ` <small>🏆 ${esc((Array.isArray(g.w) ? g.w : Object.values(g.w)).map((k) => names[k] || k).join(', '))}</small>` : ''}</span><span class="p-avg">${g.n ? fmt(g.sum / g.n) : '—'}</span></li>`).join('')}</ol></div>
      ${n.mvpNames.length ? `<p class="stats-line">👑<span>MVP: <b>${esc(n.mvpNames.join(', '))}</b></span></p>` : ''}
      ${n.winners.length ? `<p class="stats-line">🏆<span>Vincitore della serata: <b>${esc(n.winners.join(', '))}</b></span></p>` : ''}
      ${quotes.length ? `<h3>💬 Commenti</h3><ul class="quote-list">${quotes.slice(0, 6).map((q) => `<li>«${esc(q.text)}» <small>${esc(q.name)}, ${esc(q.game)}</small></li>`).join('')}</ul>` : ''}
      <h3>📸 Album</h3><div class="album-mini" id="nsAlbum"><p class="muted">Carico le foto…</p></div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet || ev.target.closest('[data-nsclose]')) sheet.remove(); });
  const snap = await get(groupRef(gid, `photos/${n.room}`)).catch(() => null);
  const photos = Object.values(snap?.val() || {}).filter((p) => p?.data).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  const box = $('#nsAlbum', sheet);
  if (box) box.innerHTML = photos.length ? photos.map((p) => `<figure><img src="${esc(p.data)}" alt="${esc(p.caption || 'Foto ricordo')}"><figcaption>${esc(p.caption || '')}</figcaption></figure>`).join('') : '<p class="muted">Nessuna foto per questa serata.</p>';
}

function render() {
  if (!WATCHED.every((k) => P.loaded.has(k))) return;
  watchGroup();
  watchArmadio();
  flushOutbox();
  watchHeartbeat();
  if (!P.meta) {
    showFatal(app, 'Stanza chiusa', 'Questa stanza non esiste più. Chiedi all’host il nuovo codice.');
    return;
  }

  const me = P.players[P.uid];
  const banned = Boolean(P.meta?.banned?.[P.uid]);
  setRoomSafeMode(P.meta?.safeMode);
  if (me) { ensureBeat(); firstTimeHelp(me); }
  // "Bentornato Andrea 👋 Sei nella Game Night #48" quando si riapre la pagina già in partita.
  if (P.welcomed === undefined) {
    P.welcomed = true;
    if (me && !me.away) setTimeout(() => { const n = nightNo(); toast(`Bentornato ${me.name} 👋 ${n ? `Sei nella Game Night #${n}` : `Sei nella stanza ${P.code}`}`); }, 1400);
  }
  checkProfileGrant();
  if (P.claimSent && !P.claims?.[P.uid] && !P.claimCheck) {
    // La TV ha risposto alla richiesta di rientro: si aspetta un attimo che arrivino anche i dati del giocatore.
    P.claimCheck = setTimeout(() => {
      P.claimCheck = null;
      P.claimSent = false;
      const back = P.players[P.uid];
      if (back) toast(`Di nuovo in partita, ${back.name}!`);
      else toast('La TV non ha confermato: chiedi all’host e riprova.', 'warn');
      render();
    }, 800);
  }
  if (me) {
    P.wasIn = true;
  } else if (P.wasIn) {
    P.wasIn = false;
    P.profileEdit = false;
    toast(banned ? 'L’host ha rimosso questo telefono dalla stanza.' : 'Non sei più nella stanza: rientra quando vuoi.', 'warn');
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
        <h2 id="ftTitle">Ciao ${esc(me.name)}! Come funziona</h2>
        <ol class="ft-list">
          <li><b>Dopo ogni partita voti dal telefono:</b> un voto da 1 a 10, qualche domanda veloce e l’MVP. I voti restano segreti finché la TV non li svela.</li>
          <li><b>In basso a sinistra</b> c’è il pulsante per il <b>time-out</b> (contestazioni, pausa bagno…) e, se l’host li attiva, effetti e pettegolezzi per la TV.</li>
          <li><b>"Il mio profilo"</b> ha livello, traguardi, statistiche e il tuo codice personale: con quello ritrovi tutto su un altro telefono.</li>
          <li>Il pallino in alto dice com’è la rete: se cade, i voti restano sul telefono e partono da soli.</li>
        </ol>
        <button type="button" class="btn btn-block" data-ftok>Ho capito</button>
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
    toast(`Bentornato ${m.name}! Profilo e statistiche ritrovati su questo telefono.`);
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
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
}

function namesList(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

function miniBoardHTML(withTitle = true) {
  const board = buildBoard(P.games, P.votes);
  if (!board.length) return '';
  return `
    <div class="p-board">
      ${withTitle ? '<h2>Classifica</h2>' : ''}
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
  if (!confirm('Uscire dalla serata? I voti che hai dato restano in classifica e puoi rientrare quando vuoi.')) return;
  update(roomRef(P.code, `players/${P.uid}`), { away: true })
    .catch((err) => toast(explainError(err), 'error'));
}

async function rejoinNight() {
  const me = P.players[P.uid];
  if (!me) return;
  const active = activePlayers(P.players);
  if (active.length >= (P.meta.maxPlayers || 8)) {
    toast('Tutti i posti sono occupati: chiedi all’host di aggiungerne uno.', 'warn');
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
    if (patch.color) toast('Il tuo colore era stato preso: te ne ho dato un altro.');
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
        <h1 class="ph-title">Sei fuori dalla serata</h1>
        <p class="ph-lead">I tuoi voti restano in classifica. Quando torni, rientra da qui.</p>
        <button type="button" class="btn btn-block" id="rejoinBtn">Rientra nella serata</button>
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
    $('#awaySeats').textContent = full
      ? 'Tutti i posti sono occupati: chiedi all’host di aggiungerne uno dalla TV.'
      : `Posti occupati: ${n} su ${max}.`;
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
      el.innerHTML = `${ICONS.tv}<span>La TV non dà segni di vita da più di un minuto. ${P.cohost ? `<a href="host.html?room=${esc(P.code)}">Riprendi la serata da questo dispositivo</a>` : 'Avvisa chi guida la serata.'}</span>`;
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
  Net.track('Voto', set(roomRef(P.code, `votes/${ob.gid}/${P.uid}`), { ...ob.data, at: serverTimestamp() }))
    .then(() => { outboxClear(); toast('Il voto rimasto in sospeso è stato inviato'); })
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
    const label = x.board || x.ticker ? '<span aria-hidden="true">📣</span><span>Tavolo</span>' : '<span aria-hidden="true">✋</span><span>Time-out</span>';
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
    if (!this.cool('gnr_sfx_at', 4000, 'Un effetto alla volta: aspetta qualche secondo.')) return;
    try {
      await Net.track('Effetto', rated(roomOf, 'sfx', 'sfx', { k: fx.dataset.sfx, by: P.uid, at: serverTimestamp(), regia: P.cohost || null }));
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
        <div class="panel-head"><h2 id="bzTitle">${x.board || x.ticker ? 'Tavolo' : 'Time-out!'}</h2><button type="button" class="icon-btn" data-bzclose aria-label="Chiudi">${ICONS.x}</button></div>
        ${x.ticker ? `<section class="tb-sec"><h3>📰 Pettegolezzo per la TV</h3>
          <label class="sr-only" for="gsText">Pettegolezzo</label>
          <textarea class="input" id="gsText" maxlength="90" rows="2" placeholder="Es. Marco giura di non aver mai barato"></textarea>
          <div class="tb-row"><span class="muted small">Scorre nel ticker in basso sulla TV, senza il tuo nome.</span><button type="button" class="btn-sec btn-sec--sm" id="gsSend">Invia</button></div></section>` : ''}
        ${x.board ? `<section class="tb-sec"><h3>🔊 Effetti sulla TV</h3><div class="sfx-grid">${SFX_META.map((m) => `<button type="button" class="sfx-btn" data-sfx="${m.k}"><span aria-hidden="true">${m.icon}</span><small>${esc(m.label)}</small></button>`).join('')}</div></section>` : ''}
        <section class="tb-sec"><h3>✋ Time-out</h3><p class="muted small">La TV fischia e mette in pausa la serata.</p>
          <div class="tb-reasons">${['Contestazione sulle regole', 'Pausa bagno', 'Pausa sigaretta', 'Arriva la pizza', 'Altro'].map((r) => `<button type="button" class="btn-sec" data-bz="${esc(r)}">${esc(r)}</button>`).join('')}</div></section>
      </div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', async (e) => {
      if (e.target === sheet || e.target.closest('[data-bzclose]')) { sheet.remove(); return; }
      const fx = e.target.closest('[data-sfx]');
      if (fx) { this.sendSfx(fx); return; }
      if (e.target.closest('#gsSend')) {
        const text = cleanName($('#gsText', sheet).value, 90);
        if (!text) { toast('Scrivi qualcosa prima di inviare.', 'warn'); return; }
        if (!this.cool('gnr_gossip_at', 20000, 'Un pettegolezzo ogni 20 secondi: non esagerare!')) return;
        try {
          await Net.track('Pettegolezzo', rated(roomOf, 'gossip', 'gossip', { text, by: P.uid, at: serverTimestamp() }));
          localStorage.setItem('gnr_gossip_at', String(Date.now()));
          $('#gsText', sheet).value = '';
          toast('Inviato: guarda il ticker sulla TV!');
        } catch (err) { toast(spamError(err), 'error'); }
        return;
      }
      const b = e.target.closest('[data-bz]');
      if (!b) return;
      if (!this.cool('gnr_buzz_at', 30000, 'Hai appena chiamato un time-out: aspetta qualche secondo.')) return;
      sheet.remove();
      try {
        await Net.track('Time-out', rated(roomOf, 'buzz', 'buzz', { by: P.uid, reason: b.dataset.bz === 'Altro' ? null : b.dataset.bz, at: serverTimestamp() }));
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
  if (!b) return '<p class="muted">Il pronostico si apre quando inizia una partita.</p>';
  const st = P.state;
  const cand = betCandidates();
  return `
    <h2>🔮 Chi vincerà${st.playName ? ` a ${esc(st.playName)}` : ''}?</h2>
    <p class="bet-clock ${b.open ? '' : 'is-closed'}" data-betclock>${b.open ? `⏳ Pronostici aperti ancora <b>${mmss(b.left)}</b>` : '🔒 Pronostici chiusi: si punta solo nei primi 5 minuti della partita.'}</p>
    <div class="bet-grid">${cand.map((p) => `<button type="button" class="bet-opt" data-bet="${esc(p.uid)}" aria-pressed="${b.mine === p.uid}" ${b.open ? '' : 'disabled'}>${avatarHTML(p, '2.6rem')}<span>${esc(p.uid === P.uid ? `${p.name} (tu)` : p.name)}</span></button>`).join('')}</div>
    <p class="muted small">${b.mine ? `Hai puntato su <b>${esc(P.players[b.mine]?.name || '')}</b>${b.open ? ': puoi cambiare idea finché sono aperti' : ''}.` : b.open ? 'Se indovini: +15 XP e il premio “Il veggente”.' : 'Questa volta niente pronostico: alla prossima partita!'}${b.count ? ` · ${b.count} ${b.count === 1 ? 'pronostico' : 'pronostici'}` : ''}</p>`;
}

/** Riquadro sulla schermata: invita a pronosticare finché si può. */
function betBannerHTML() {
  const b = betState();
  if (!b || !b.open) return '';
  return `<button type="button" class="bet-banner ${b.mine ? 'is-done' : ''}" data-dock="bet">🔮 <span>${b.mine ? `Pronostico: <b>${esc(P.players[b.mine]?.name || '')}</b>` : '<b>Chi vincerà?</b> Fai il pronostico'}</span><small data-betclock-mini>${mmss(b.left)}</small></button>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-bet]');
  if (!b || !P.state?.playId) return;
  if (!betState()?.open) { toast('Pronostici chiusi: si punta solo nei primi 5 minuti della partita.', 'warn'); return; }
  try {
    await Net.track('Pronostico', set(roomRef(P.code, `bets/${P.state.playId}/${P.uid}`), b.dataset.bet));
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
    if (b) out.push({ k: 'bet', icon: '🔮', label: 'Pronostico', badge: b.open && !b.mine ? '!' : (b.open ? '' : '🔒') });
    if (imPlayer) out.push({ k: 'score', icon: '🧮', label: 'Punti' });
    if (board && phase !== 'lobby') out.push({ k: 'sfx', icon: '🔊', label: 'Suoni' });
    if (P.meta?.groupId || P.meta?.armadioId) out.push({ k: 'games', icon: '📦', label: 'Giochi' });
    if (phase !== 'lobby') out.push({ k: 'timeout', icon: '✋', label: 'Time-out' });
    out.push({ k: 'me', icon: '👤', label: 'Profilo' });
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
      this.el.setAttribute('aria-label', 'Strumenti della serata');
      document.body.appendChild(this.el);
    }
    if (sig !== this.sig) {
      this.sig = sig;
      this.el.innerHTML = items.map((it) => `<button type="button" class="dock-btn" data-dock="${it.k}" aria-pressed="${this.sheet?.kind === it.k}"><span class="dock-ico" aria-hidden="true">${it.icon}</span><small>${it.label}</small>${it.badge ? `<i class="dock-badge">${it.badge}</i>` : ''}</button>`).join('');
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
    el.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true" aria-label="${esc(kind)}"><button type="button" class="icon-btn sheet-x" data-dockclose aria-label="Chiudi">${ICONS.x}</button><div class="dock-body"></div></div>`;
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
    else if (sh.kind === 'score') html = scoreHTML() || '<p class="muted">Il segnapunti si apre quando inizia una partita.</p>';
    else if (sh.kind === 'sfx') html = `<h2>🔊 Suoni sulla TV</h2><p class="muted small">Tocca un effetto: parte sulla TV (uno ogni pochi secondi).</p><div class="sfx-grid sfx-grid--big">${SFX_META.map((m) => `<button type="button" class="sfx-btn" data-sfx="${m.k}"><span aria-hidden="true">${m.icon}</span><small>${esc(m.label)}</small></button>`).join('')}</div>`;
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
  return `<div class="p-awards"><h2>La tua serata</h2>
    <p class="stats-line">⭐<span>Livello ${pr.level} · ${esc(pr.levelName)} (${pr.xp} XP)</span></p>
    ${got.map((a) => `<p class="stats-line ach-new">${a.icon}<span>Traguardo sbloccato: <b>${esc(a.name)}</b> — ${esc(a.desc)}</span></p>`).join('')}</div>`;
}

function eventHTML() {
  const ev = P.state?.phase === 'idle' ? P.state.event : null;
  if (!ev) return '';
  return `<section class="card event-mini"><p class="event-kicker">🎲 Evento casuale!</p><h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p></section>`;
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
function squarePhoto(file) {
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

function numOptions(max, emptyLabel) {
  return `<option value="">${emptyLabel}</option>` + Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1} giocatori</option>`).join('');
}

SCREENS.addgame = {
  mount(el) {
    this.image = null;
    this.sig = '';
    el.innerHTML = `
      <main class="phone">
        ${phoneTop(undefined, 'addgame')}
        <h1 class="ph-title">I giochi di stasera</h1>
        <p class="ph-lead">Tocca 🎲 sui giochi che hai portato: la TV sceglie tra quelli. Con ☆ dici a cosa vuoi giocare (massimo 3).</p>
        <div class="tn-box" id="tnSum"></div>
        <button type="button" class="btn btn-block" id="scanBtn">📷 <span>Inquadra il codice a barre della scatola</span></button>
        <details class="card ph-card ag-new" id="agNew"><summary>➕ Un gioco che non è nell’armadio</summary>
        <div class="field field--stack">
          <label for="agName">Nome del gioco</label>
          <input class="input" id="agName" maxlength="40" autocomplete="off" enterkeyhint="done" placeholder="Es. Dixit">
        </div>
        <div class="ag-info" role="group" aria-labelledby="agInfoLabel">
          <span class="field-label" id="agInfoLabel">Giocatori e durata <span class="muted">(facoltativi)</span></span>
          <div class="ag-row">
            <label class="sr-only" for="agMin">Minimo giocatori</label>
            <select class="input select" id="agMin">${numOptions(20, 'da —')}</select>
            <label class="sr-only" for="agMax">Massimo giocatori</label>
            <select class="input select" id="agMax">${numOptions(20, 'a —')}</select>
          </div>
          <label class="sr-only" for="agDur">Durata</label>
          <select class="input select" id="agDur"><option value="">Durata: —</option>${[10, 15, 20, 30, 45, 60, 90, 120, 180].map((d) => `<option value="${d}">${d} min${d === 180 ? ' o più' : ''}</option>`).join('')}</select>
        </div>
        <label class="btn-sec photo-btn" for="agFile">${ICONS.camera}<span>Scatta o scegli una foto</span></label>
        <input type="file" id="agFile" accept="image/*" class="sr-only">
        <div class="photo-prev" id="agPrev"></div>
        <label class="quick-toggle"><input type="checkbox" id="agBrought" checked><span>L’ho portato stasera</span></label>
        <p class="form-error" id="agErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="agSave">Aggiungi all’armadio</button>
        </details>
        <button type="button" class="link-btn" id="agDone">Fatto</button>
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
        $('#agPrev').innerHTML = `<img src="${this.image}" alt="Foto del gioco">`;
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
    if (!name) { err.textContent = 'Scrivi il nome del gioco.'; input.focus(); return; }
    const num = (id) => Number($(id).value) || null;
    const info = Object.fromEntries(Object.entries({ minPlayers: num('#agMin'), maxPlayers: num('#agMax'), duration: num('#agDur') }).filter(([, v]) => v));
    if (info.minPlayers && info.maxPlayers && info.minPlayers > info.maxPlayers) {
      err.textContent = 'Il minimo di giocatori è più alto del massimo.';
      return;
    }
    const k = nameKey(name);
    const existing = Object.entries(P.library || {}).find(([, it]) => nameKey(it?.name) === k);
    const btn = $('#agSave');
    btn.disabled = true;
    try {
      if (existing) {
        const patch = { ...info };
        if (this.image && !existing[1].image) patch.image = this.image;
        if (Object.keys(patch).length) await update(libraryRef(P.meta, existing[0]), patch);
        else if (!$('#agBrought').checked) { err.textContent = 'Questo gioco è già nell’armadio.'; btn.disabled = false; return; }
        if ($('#agBrought').checked) await markTonight(existing[0], true);
      } else {
        const me = P.players[P.uid];
        const r = push(libraryRef(P.meta));
        await set(r, { name, image: this.image || null, addedBy: me?.name || '', addedAt: serverTimestamp(), ...info });
        if ($('#agBrought').checked) await markTonight(r.key, true);
      }
      toast(`${name} aggiunto all’armadio`);
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
    const items = searchLibrary(P.library, f, P.nights).sort((a, b) => mineT(b) - mineT(a));
    const sig = JSON.stringify([all.map((it) => [it.name, Boolean(it.image), libInfo(it), it.status, it.loanTo, tagsOf(it)]), q, P.tonight, P.wish?.[P.uid], P.next?.bring]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#tnSum').innerHTML = tonightSummaryHTML();
    if (!$('#agSearch')) {
      $('#agList').innerHTML = `<h2>Già nell’armadio</h2><input class="input" type="search" id="agSearch" placeholder="Cerca: es. per 5 persone, massimo 30 minuti"><ul class="lib-mini" id="agItems"></ul>`;
      $('#agSearch').addEventListener('input', (e) => { this.query = e.target.value; this.update(); });
    }
    $('#agList').hidden = !all.length;
    $('#agItems').innerHTML = items.length ? items.map((it) => {
      const st = !isAvailable(it) ? (it.status === 'prestato' && it.loanTo ? `prestato a ${it.loanTo}` : (GAME_STATUS[it.status] || it.status).toLowerCase()) : '';
      const extra = [libInfo(it), it.mode ? GAME_MODES[it.mode] : '', tagsOf(it).slice(0, 2).map((t) => `#${t}`).join(' '), st].filter(Boolean).join(' · ');
      return gameRowHTML(it, extra);
    }).join('') : '<li class="muted">Nessun gioco corrisponde.</li>';
  }
};

SCREENS.poll = {
  mount(el) {
    this.sig = '';
    const poll = P.poll;
    if (!poll.open) {
      const it = P.library?.[poll.winner] || { name: 'il gioco scelto' };
      el.innerHTML = `
        <main class="phone phone--center">
          ${phoneTop()}
          <span class="chip chip--tomato">${poll.tie ? 'Pareggio: ha deciso la sorte' : 'Avete scelto'}</span>
          <h1 class="ph-title">Si gioca a ${esc(it.name)}!</h1>
          <div class="card p-win">${gameImageHTML(it, 'game-img--vote')}</div>
          <p class="ph-lead">Buona partita! A fine partita si apre la votazione.</p>
        </main>`;
      return;
    }
    el.innerHTML = `
      <main class="phone">
        ${phoneTop()}
        <h1 class="ph-title">Cosa giochiamo adesso?</h1>
        <p class="ph-lead">Tocca il gioco che vuoi fare. Puoi cambiare idea finché la TV non chiude la scelta.</p>
        <div class="poll-pick" id="pollPick" role="radiogroup" aria-label="Giochi proposti"></div>
        <p class="muted center" id="pollMine" aria-live="polite"></p>
      </main>`;
    $('#pollPick', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      try {
        await Net.track('Scelta del gioco', set(roomRef(P.code, `poll/votes/${P.uid}`), b.dataset.opt));
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
    const mine = poll.votes?.[P.uid] || null;
    const sig = JSON.stringify([opts, mine, opts.map((id) => (P.library[id].image || '').length)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#pollPick').innerHTML = opts.map((id) => {
      const it = P.library[id];
      return `
        <button type="button" class="poll-opt" role="radio" aria-checked="${mine === id}" data-opt="${esc(id)}">
          ${gameImageHTML(it, 'game-img--opt')}
          <span class="poll-opt-name">${esc(it.name)}</span>
          ${libInfo(it) ? `<span class="poll-opt-meta">${esc(libInfo(it))}</span>` : ''}
          ${mine === id ? `<span class="poll-opt-check">${ICONS.check}</span>` : ''}
        </button>`;
    }).join('');
    $('#pollMine').textContent = mine && P.library?.[mine] ? `Hai scelto ${P.library[mine].name}.` : 'Non hai ancora scelto.';
  }
};

function allTimeHTML(limit = 10) {
  const at = buildAllTime(P.nights, P.library);
  if (!at.games.length) return '<p class="muted">Ancora nessuna serata salvata.</p>';
  return `
    <div class="p-board">
      <ol>${at.games.slice(0, limit).map((r) => `
        <li class="p-row">
          <span class="p-rank">${r.rank}</span>
          <span class="p-name">${esc(r.name)}</span>
          <span class="p-avg">${fmt(r.avg)}</span>
        </li>`).join('')}</ol>
    </div>
    ${at.mvp.length ? `<p class="p-at-mvp">${ICONS.crown}<span>MVP di sempre: <b>${esc(at.mvp[0].name)}</b> (${at.mvp[0].votes} voti)</span></p>` : ''}
    ${at.wins.length ? `<p class="p-at-mvp">${ICONS.trophy}<span>Vince di più: <b>${esc(at.wins[0].name)}</b> (${at.wins[0].wins} ${at.wins[0].wins === 1 ? 'vittoria' : 'vittorie'})</span></p>` : ''}`;
}

SCREENS.alltime = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.star}</div>
        <h1 class="ph-title">Classifica di sempre</h1>
        <p class="ph-lead" id="atLead"></p>
        <div class="full-width" id="atBox"></div>
        ${addGameButton()}
        <div class="ph-links"><button type="button" class="link-btn" data-myprofile>Il mio profilo</button></div>
      </main>`;
    bindAddGame(el);
  },
  update() {
    const sig = JSON.stringify([P.nights, Object.keys(P.library || {}).length]);
    if (sig === this.sig) return;
    this.sig = sig;
    const n = Object.keys(P.nights || {}).length;
    $('#atLead').textContent = `${P.meta.groupName || 'Il vostro gruppo'}: ${n} ${n === 1 ? 'serata' : 'serate'}`;
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
  if (!P.meta?.groupId) return '';
  if (P.member && !P.skipProfile) {
    return `
      <section class="card profile-join">
        <div class="home-me">${avatarHTML(P.member, '3.6rem', 'avatar--shadow')}<div><b class="home-name">Ciao, ${esc(P.member.name)}!</b><span class="muted">Nome, personaggio e statistiche sono già pronti.</span></div></div>
        <button type="button" class="btn btn-block" id="joinMember">${Object.values(P.players).some((p) => p.memberId === P.member.id) ? 'Rientra' : 'Entra'} come ${esc(P.member.name)}</button>
        <button type="button" class="link-btn" id="notMe">Non sono ${esc(P.member.name)}</button>
      </section>`;
  }
  return `
    <details class="profile-code">
      <summary>Hai già un profilo? Usa il codice personale</summary>
      <div class="profile-code-row">
        <label class="sr-only" for="pcInput">Codice personale</label>
        <input class="input code-input code-input--6" id="pcInput" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123">
        <button type="button" class="btn-sec" id="pcGo">Ritrova</button>
      </div>
      <p class="form-error" id="pcErr" role="alert"></p>
    </details>`;
}

function bindProfileJoin(root) {
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#notMe')) { P.skipProfile = true; $('#profileBox').innerHTML = profileJoinHTML(); return; }
    if (e.target.closest('#joinMember')) {
      e.target.closest('#joinMember').disabled = true;
      try { await joinAsMember(P.member); } catch (err) { toast(explainError(err), 'error'); render(); }
      return;
    }
    if (e.target.closest('#pcGo')) {
      const id = normalizeCode($('#pcInput').value, 6);
      try {
        const m = await loadMember(id);
        if (!m) { $('#pcErr').textContent = 'Nessun profilo con questo codice.'; return; }
        if (m.groupId !== P.meta.groupId) { $('#pcErr').textContent = 'Questo profilo è di un altro gruppo.'; return; }
        saveProfile(m.groupId, m.id);
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
    throw userError(`C’è già un ${m.name} nella stanza: usa "Non sono ${m.name}" per entrare con un altro nome.`);
  }
  const active = activePlayers(P.players);
  if (active.length >= (P.meta.maxPlayers || 8)) throw userError('La stanza è piena.');
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
      <h2>Eri già in partita?</h2>
      <p class="muted">Se il telefono si è spento o hai cambiato telefono, scegli il tuo nome: la TV chiederà conferma e ritroverai voti e vittorie.</p>
      <div class="reclaim-list">${list.map((p) => `
        <button type="button" class="reclaim-btn" data-claim="${esc(p.uid)}">
          ${avatarHTML(p, '2.6rem')}<span>${esc(p.name)}</span><b>Sono io</b>
        </button>`).join('')}</div>
    </section>`;
}

function bindReclaim(el) {
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-claim]');
    if (!b) return;
    const p = P.players[b.dataset.claim];
    const mine = P.member && p?.memberId === P.member.id;
    if (!p || (!mine && !confirm(`Rientrare come ${p.name}? La TV dovrà confermare.`))) return;
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
        <h1 class="ph-title">Quasi fatto!</h1>
        <p class="ph-lead">Sulla TV deve comparire la richiesta di rientro come <b>${esc(target?.name || 'giocatore')}</b>: chiedi all’host di confermarla.</p>
        <button type="button" class="link-btn" id="claimCancel">Annulla</button>
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
        <h1 class="ph-title">Pausa!</h1>
        <p class="ph-lead">La serata è in pausa: puoi mettere giù il telefono o ricaricarlo. Quando la TV riprende, questa pagina torna da sola al punto giusto.</p>
        <p class="muted">Il voto che stavi compilando resta salvato.</p>
      </main>`;
  }
};

SCREENS.full = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <h1 class="ph-title">Stanza piena</h1>
        <p class="ph-lead">Tutti i posti sono occupati. Chiedi all’host di aggiungerne uno dalla TV: questa pagina si aggiorna da sola.</p>
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
        <h1 class="ph-title">Stanza chiusa</h1>
        <p class="ph-lead">L’host ha chiuso la stanza: chi non era già dentro non può più entrare. Se è un errore, chiedigli di riaprirla dalla TV: questa pagina si aggiorna da sola.</p>
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
        <h1 class="ph-title">Sei fuori dalla serata</h1>
        <p class="ph-lead">L’host ha rimosso questo telefono dalla stanza. Se è un errore, chiedigli di riammetterti dal pannello Giocatori sulla TV: questa pagina si aggiorna da sola.</p>
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
      P.form = {
        name: me?.name || localStorage.getItem('gnr_name') || '',
        options,
        pick: 0,
        color: me?.color || null,
        opts: me?.opts ? { ...me.opts } : {},
        photo: me?.photo || null,
        motto: me?.motto || ''
      };
    }
    el.innerHTML = `
      <main class="phone">
        ${phoneTop(undefined, me ? 'profileEdit' : 'home')}
        ${me ? '' : `<div id="profileBox">${profileJoinHTML()}</div><div id="reclaimBox"></div>`}
        <h1 class="ph-title">${me ? 'Il tuo profilo' : 'Chi sei?'}</h1>
        <div class="me-row">
          <span id="mePreview"></span>
          <div class="field">
            <label for="nameInput">Il tuo nome</label>
            <input class="input" id="nameInput" maxlength="16" autocomplete="nickname" enterkeyhint="done" placeholder="Es. Giulia" value="${esc(P.form.name)}">
          </div>
        </div>
        <div id="sameName"></div>
        <div class="ph-row">
          <h2 id="avLabel">Scegli il personaggio</h2>
          <button type="button" class="btn-sec btn-sec--sm" id="reroll">${ICONS.refresh}<span>Altri</span></button>
        </div>
        <div class="av-grid" id="avGrid" role="radiogroup" aria-labelledby="avLabel"></div>
        <div class="av-tools">
          <button type="button" class="btn-sec btn-sec--sm" id="editAv" aria-expanded="false" aria-controls="avEditor">${ICONS.edit}<span>Personalizza</span></button>
          <label class="btn-sec btn-sec--sm" for="selfieIn">${ICONS.camera}<span>Selfie</span></label>
          <input type="file" id="selfieIn" accept="image/*" capture="user" class="sr-only">
          <label class="btn-sec btn-sec--sm" for="galleryIn">${ICONS.image}<span>Dalla galleria</span></label>
          <input type="file" id="galleryIn" accept="image/*" class="sr-only">
          <button type="button" class="link-btn" id="noPhoto" hidden>Togli la foto</button>
        </div>
        <div class="av-editor" id="avEditor" hidden></div>
        <div class="field field--stack">
          <label for="mottoInput">Il tuo motto <span class="muted">(facoltativo, compare sulla TV)</span></label>
          <input class="input" id="mottoInput" maxlength="40" autocomplete="off" placeholder="Es. Stavolta vinco io" value="${esc(P.form.motto)}">
        </div>
        <h2 id="colorLabel">Il tuo colore</h2>
        <div class="swatches" id="swatches" role="radiogroup" aria-labelledby="colorLabel"></div>
        <p class="form-error" id="joinErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="joinBtn">${me ? 'Salva profilo' : 'Entra in partita'}</button>
        ${me ? '<button type="button" class="link-btn" id="cancelEdit">Annulla</button>' : ''}
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
        if (!m || m.groupId !== P.meta.groupId) { $('#snErr').textContent = 'Codice non valido per questo gruppo.'; return; }
        saveProfile(m.groupId, m.id);
        P.member = m;
        P.skipProfile = false;
        const box = $('#profileBox');
        if (box) box.innerHTML = profileJoinHTML();
        this.paintSameName();
        box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(`Ritrovato il profilo di ${m.name}: tocca "Entra come ${m.name}"`);
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
      } catch (err) { toast(err.message || 'Foto non leggibile', 'error'); }
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
      return `<button type="button" class="swatch" role="radio" aria-checked="${checked}" aria-label="Colore ${i + 1}${disabled ? ' (già preso)' : ''}" data-color="${c}" style="--sc:${c}" ${disabled ? 'disabled' : ''}></button>`;
    }).join('');
  },

  paintGrid() {
    const color = safeColor(P.form.color);
    $('#avGrid').innerHTML = P.form.options.map((o, i) => `
      <button type="button" class="av-opt" role="radio" aria-checked="${i === P.form.pick}" aria-label="Personaggio ${i + 1}" data-pick="${i}" style="--pc:${color}">
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
        return `<div class="ed-row"><span class="ed-label">${p.label}</span><div class="ed-swatches">${p.values.map((v) => `
          <button type="button" class="ed-sw" data-edc="${p.key}" data-v="${esc(v)}" style="--c:#${esc(v)}" aria-pressed="${cur === v}" aria-label="${p.label} ${esc(v)}"></button>`).join('')}</div></div>`;
      }
      const list = p.optional ? ['none', ...p.values] : p.values;
      const i = cur === undefined ? null : list.indexOf(cur);
      const shown = i === null ? 'automatico' : cur === 'none' ? 'nessuno' : `${p.values.indexOf(cur) + 1} di ${p.values.length}`;
      return `<div class="ed-row"><span class="ed-label">${p.label}</span><div class="ed-ctrl">
        <button type="button" class="ed-btn" data-ed="${p.key}" data-dir="-1" aria-label="${p.label}: precedente">‹</button>
        <span class="ed-val">${shown}</span>
        <button type="button" class="ed-btn" data-ed="${p.key}" data-dir="1" aria-label="${p.label}: successivo">›</button></div></div>`;
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
        <b>Sei tu, ${esc(hit.name)}?</b>
        <p>In questo gruppo c’è già un profilo <b>${esc(hit.name)}</b> con ${hit.nights} ${hit.nights === 1 ? 'serata' : 'serate'} di statistiche. Ritrovalo con il tuo codice personale (lo trovi in "Il mio profilo" sul vecchio telefono), così non ne nasce un doppione.</p>
        <div class="profile-code-row"><label class="sr-only" for="snCode">Codice personale</label><input class="input code-input code-input--6" id="snCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123"><button type="button" class="btn-sec" id="snGo">Ritrova</button></div>
        <p class="form-error" id="snErr" role="alert"></p>
        ${P.profileClaims?.[P.uid]?.mid === hit.mid
          ? `<p class="same-wait">⏳ Richiesta inviata: sulla TV deve comparire "${esc(hit.name)} vuole ritrovare il suo profilo". Chiedi all’host di confermarla.</p>`
          : `<button type="button" class="btn-sec" id="snAsk" data-mid="${esc(hit.mid)}">📺 Non ho il codice: chiedi alla TV</button>`}
        <button type="button" class="link-btn" id="snOther">No, sono un altro ${esc(hit.name)}</button>
      </section>` : '';
  },

  async submit() {
    const err = $('#joinErr');
    const name = $('#nameInput').value.trim().replace(/\s+/g, ' ');
    if (!name) { err.textContent = 'Scrivi il tuo nome.'; $('#nameInput').focus(); return; }
    const me = P.players[P.uid];
    if (!me && P.sameSkip !== nameKey(name) && sameNameProfile(name)) {
      const hn = sameNameProfile(name).name;
      err.textContent = `C’è già un profilo ${hn}: ritrovalo con il codice qui sopra (o chiedi alla TV), oppure tocca "No, sono un altro ${hn}".`;
      this.paintSameName();
      $('#sameName')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const count = activePlayers(P.players).length;
    if (!me && count >= (P.meta.maxPlayers || 8)) { err.textContent = 'La stanza è piena.'; return; }
    const clash = Object.entries(P.players).some(([uid, p]) => uid !== P.uid && String(p.name).toLowerCase() === name.toLowerCase());
    if (clash) { err.textContent = 'Questo nome è già preso: aggiungi un’iniziale.'; return; }

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
            P.newCode = memberId;
          }
        } catch (e) { console.warn('Profilo non salvato', e); }
      }
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
  return `<div class="new-code">Il tuo codice personale è <b>${esc(P.newCode)}</b>: segnalo, ti serve per ritrovare profilo e statistiche su un altro telefono o nell'app installata. Lo trovi sempre in "Il mio profilo".</div>`;
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
    nextBox.innerHTML = `<h2>📅 Prossima serata</h2>${nextNightHTML(P.next, key)}${icsButtonHTML(P.next)}${bringHTML(P.next, key)}
      <details class="next-set"><summary>${P.next?.at ? 'Cambia data' : 'Proponi una data'}</summary>
        <div class="next-set-body"><label class="sr-only" for="pnAt">Data e ora</label><input class="input" type="datetime-local" id="pnAt">
        <label class="sr-only" for="pnPlace">Luogo</label><input class="input" id="pnPlace" maxlength="60" placeholder="Dove? (es. da Giulia)">
        <button type="button" class="btn-sec" id="pnSave">Salva</button></div></details>`;
    nextBox.onclick = async (e) => {
      const r = e.target.closest('[data-rsvp]');
      if (r) { try { await answerRsvp(gid, key, me.name, r.dataset.rsvp); } catch (err) { toast(explainError(err), 'error'); } return; }
      if (e.target.closest('#pnSave')) {
        const at = $('#pnAt').value ? new Date($('#pnAt').value).getTime() : 0;
        if (!at) { toast('Scegli data e ora.', 'warn'); return; }
        try { await set(groupRef(gid, 'next'), { at, place: cleanName($('#pnPlace').value, 60) || null, rsvp: { [key]: { name: me.name, answer: 'si' } } }); toast('Data proposta: la vedono tutti'); } catch (err) { toast(explainError(err), 'error'); }
      }
    };
    const ins = personInsights(P.nights, key, P.library);
    const line = (icon, html) => `<p class="stats-line">${icon}<span>${html}</span></p>`;
    const lines = [
      ins.winRate !== null && line('🏆', `Vinci il <b>${ins.winRate}%</b> delle partite (${ins.won} su ${ins.played})`),
      ins.severity !== null && line('⚖️', ins.severity <= -0.5 ? `Sei <b>più severo</b> degli altri di ${fmt(Math.abs(ins.severity))} punti` : ins.severity >= 0.5 ? `Sei <b>più generoso</b> degli altri di ${fmt(ins.severity)} punti` : 'Voti <b>in linea</b> con il gruppo'),
      ins.agreement !== null && line('🤝', `D’accordo con la maggioranza nel <b>${ins.agreement}%</b> dei voti`),
      ins.bestGame && line('💪', `Rendi meglio a <b>${esc(ins.bestGame.name)}</b> (${ins.bestGame.won} vittorie su ${ins.bestGame.played})`),
      ins.worstGame && line('😵', `Perdi di più a <b>${esc(ins.worstGame.name)}</b> (${ins.worstGame.won} su ${ins.worstGame.played})`),
      ins.mate && line('❤️', `Miglior compagno di gioco: <b>${esc(ins.mate.name)}</b>`),
      ins.nemesis && line('⚔️', `Peggior avversario: <b>${esc(ins.nemesis.name)}</b> (ti ha battuto ${ins.nemesis.wins} volte)`),
      ins.idealMinutes && line('⏱️', `Durata ideale: circa <b>${ins.idealMinutes} minuti</b>`),
      ins.idealPlayers && line('👥', `Numero di giocatori preferito: <b>${String(ins.idealPlayers).replace('.', ',')}</b>`),
      ins.favTag && line('🏷️', `Categoria preferita: <b>${esc(ins.favTag)}</b>`)
    ].filter(Boolean);
    const now = new Date();
    const monthNights = nightsList(P.nights).filter((n) => { const d = new Date(Number(n.at)); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && n.people?.[key]; }).length;
    $('#myInsights').innerHTML = `<h2>Le tue statistiche avanzate</h2>${monthNights ? line('📆', `Questo mese hai giocato <b>${monthNights}</b> ${monthNights === 1 ? 'volta' : 'volte'}`) : ''}${lines.join('') || '<p class="muted">Compaiono dopo qualche partita (vittorie, voti, compagni e avversari).</p>'}`;
    const list = nightsList(P.nights).reverse();
    $('#myMemories').innerHTML = `<h2>📸 Ricordi del gruppo</h2>${list.length ? `<ul class="mem-list">${list.slice(0, 10).map((n) => `
      <li><button type="button" class="mem-row" data-mem="${esc(n.room)}"><b>#${n.number} · ${esc(new Date(Number(n.at)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }))}</b><span>${n.gamesCount} ${n.gamesCount === 1 ? 'gioco' : 'giochi'}${n.topGame ? ` · ⭐ ${esc(n.topGame.name)}` : ''}${n.people?.[key] ? '' : ' · non c’eri'}</span></button></li>`).join('')}</ul>` : '<p class="muted">Le serate salvate compaiono qui.</p>'}`;
    $('#myMemories').onclick = (e) => {
      const b = e.target.closest('[data-mem]');
      if (b) openNightSheet(list.find((n) => n.room === b.dataset.mem), gid);
    };
    const years = yearsOf(P.nights);
    const w = years.length ? wrapped(P.nights, years[0]) : null;
    $('#myWrapped').innerHTML = w ? `<h2>🎁 Wrapped ${w.year}</h2><ul class="wr-mini">
      <li><b>${w.nights}</b> serate · <b>${w.matches}</b> partite${w.hours ? ` · <b>${String(w.hours).replace('.', ',')}</b> ore` : ''}</li>
      ${w.mostPlayed ? `<li>Il più intavolato: <b>${esc(w.mostPlayed.name)}</b> (${w.mostPlayed.matches})</li>` : ''}
      ${w.loved ? `<li>Il più amato: <b>${esc(w.loved.name)}</b> (${fmt(w.loved.avg)})</li>` : ''}
      ${w.deadliest ? `<li>Il più letale: <b>${esc(w.deadliest.name)}</b> (${w.deadliest.wins} vittorie)</li>` : ''}
      ${w.mvp ? `<li>MVP dell’anno: <b>${esc(w.mvp.name)}</b></li>` : ''}
      ${w.longestMatch ? `<li>Partita più lunga: <b>${esc(w.longestMatch.name)}</b> (${w.longestMatch.minutes} min)</li>` : ''}
      ${w.bestMonth ? `<li>Mese più giocato: <b>${esc(w.bestMonth.name)}</b></li>` : ''}</ul>` : '';
    $('#myWrapped').hidden = !w;
  },

  /** Livello, XP, traguardi (anche segreti) e note private. */
  paintProgress(me) {
    const pr = progressFor(P.nights, personKey(me), P.library);
    $('#myLevel').innerHTML = `
      <div class="lv-head"><span class="lv-num">${pr.level}</span><div><h2>Livello ${pr.level} · ${esc(pr.levelName)}</h2><p class="muted">${pr.xp} XP · prossimo livello a ${pr.nextXp} XP</p></div></div>
      <span class="xp-bar" aria-label="Avanzamento verso il prossimo livello"><i style="width:${Math.round(pr.levelProgress * 100)}%"></i></span>
      ${seasonLineHTML(me)}
      <p class="muted small">XP: 50 a serata, 20 a partita, 30 a vittoria, 10 a voto MVP ricevuto, 15 a media indovinata, 15 a vincitore pronosticato, 100 a traguardo.</p>`;
    const got = pr.achievements.filter((a) => a.got).length;
    $('#myAch').innerHTML = `
      <h2>Traguardi <span class="muted">${got}/${pr.achievements.length}</span></h2>
      <ul class="ach-grid">${pr.achievements.map((a) => {
        const hidden = a.secret && !a.got;
        const prog = !a.got && a.progress && a.progress[1] ? `<span class="ach-prog"><i style="width:${Math.min(100, Math.round((a.progress[0] / a.progress[1]) * 100))}%"></i></span><small>${Math.min(a.progress[0], a.progress[1])}/${a.progress[1]}</small>` : '';
        return `<li class="ach ${a.got ? 'is-got' : ''}"><span class="ach-ico" aria-hidden="true">${hidden ? '❓' : a.icon}</span><span class="ach-text"><b>${hidden ? 'Traguardo segreto' : esc(a.name)}</b><small>${hidden ? 'Si svela quando lo sblocchi.' : esc(a.desc)}</small>${prog}</span></li>`;
      }).join('')}</ul>`;
    const notes = Object.values(privateNotes()).sort((a, b) => b.at - a.at).slice(0, 8);
    $('#myNotes').innerHTML = `<h2>Le tue note private</h2>${notes.length
      ? `<ul class="notes-list">${notes.map((n) => `<li><b>${esc(n.game)}</b> <span class="muted small">${new Date(n.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span><p>${esc(n.text)}</p></li>`).join('')}</ul>`
      : '<p class="muted">Durante il voto puoi scrivere una nota che vedi solo tu: strategie, regole da ricordare, rivincite da chiedere.</p>'}`;
  },

  /** Trofei dalla serata precedente e amici più (e meno) affini. */
  extrasHTML(me) {
    const key = personKey(me);
    const t = trophies(P.nights, P.code)[key];
    const pairs = affinities(P.nights).filter((p) => p.a.key === key || p.b.key === key);
    const other = (p) => (p.a.key === key ? p.b.name : p.a.name);
    const lines = [];
    if (t?.crown) lines.push(`${ICONS.crown}<span>MVP della serata precedente</span>`);
    if (t?.star) lines.push(`${ICONS.star}<span>MVP di sempre del gruppo</span>`);
    if (t?.title) lines.push(`${ICONS.trophy}<span>Titolo in carica: <b>${esc(t.title)}</b></span>`);
    if (pairs.length) lines.push(`${ICONS.users}<span>Anima affine: <b>${esc(other(pairs[0]))}</b> (${fmt(pairs[0].diff)} punti di distanza)</span>`);
    if (pairs.length > 1) lines.push(`${ICONS.x}<span>Gusti opposti: <b>${esc(other(pairs[pairs.length - 1]))}</b></span>`);
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
            ${mid ? `<p class="profile-code-line">Codice personale <span class="code-chip code-chip--sm">${esc(mid)}</span></p>` : ''}
          </div>
        </div>
        ${mid ? `<p class="muted small">Con questo codice ritrovi profilo e statistiche su un altro telefono o nell’app installata.</p>
        <details class="card ph-card prof-qr"><summary>📱 Il tuo QR personale</summary><div class="qr qr--prof" id="profQr"></div><p class="muted small">Inquadralo con un altro telefono (o con l’app installata) per collegare lì il tuo profilo. Non mostrarlo a chi non conosci: è come la tua password.</p></details>` : ''}
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
        <section class="card ph-card"><h2>Tema</h2>${themeSwitchHTML('phTheme')}</section>
        <section class="card ph-card"><h2>Accessibilità</h2>${a11yHTML('phA11y')}</section>
        <section class="card ph-card"><h2>Registro errori</h2><p class="muted small">Se qualcosa non va, scaricalo e mandalo a chi gestisce l’app: dice cosa è successo su questo telefono.</p><button type="button" class="btn-sec btn-sec--sm" id="phErrDl">${ICONS.download}<span>Scarica il registro</span></button></section>
        <section class="card ph-card">
          <h2>Regia dal telefono</h2>
          ${P.cohost
            ? '<p>La regia è attiva: usa il pulsante <b>Regia</b> in basso a destra per guidare la serata.</p>'
            : `<p class="muted">Sei tu a guidare la serata? Con il codice regia (sulla TV, pannello Giocatori) la comandi anche da qui.</p>
               <div class="profile-code-row">
                 <label class="sr-only" for="regiaInput">Codice regia</label>
                 <input class="input code-input code-input--8" id="regiaInput" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX">
                 <button type="button" class="btn-sec" id="regiaGo">Attiva</button>
               </div>
               <p class="form-error" id="regiaErr" role="alert"></p>`}
        </section>
        ${installHintHTML(mid)}
        <div class="ph-links">
          <button type="button" class="link-btn" id="editProfile">Modifica profilo</button>
        </div>
        <button type="button" class="btn btn-block" data-profileback>Torna alla serata</button>
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
        toast('Regia attiva: usa il pulsante Regia in basso a destra');
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
      <h2>Le tue statistiche</h2>
      ${st.nights ? `<dl class="stats-grid">
        ${row('Serate', st.nights)}
        ${row('Partite votate', st.votes)}
        ${row('Media dei tuoi voti', fmt(st.avgGiven))}
        ${row('Vittorie', st.wins)}
        ${row('Voti MVP ricevuti', st.mvp)}
        ${row('Giochi diversi', st.gamesVoted)}
      </dl>
      ${st.favorite ? `<p class="stats-line">${ICONS.star}<span>Il tuo preferito: <b>${esc(st.favorite.name)}</b> (${fmt(st.favorite.avg)})</span></p>` : ''}
      ${st.leastFavorite && st.leastFavorite.avg < st.favorite.avg ? `<p class="stats-line">${ICONS.x}<span>Ti piace meno: <b>${esc(st.leastFavorite.name)}</b> (${fmt(st.leastFavorite.avg)})</span></p>` : ''}
      ${this.extrasHTML(me)}`
      : '<p class="muted">Le statistiche compaiono dopo il primo gioco votato in una serata del gruppo.</p>'}`;
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
    const rec = recommend({ library: P.library, nights: P.nights, present: active.map((p) => ({ key: personKey(p), name: p.name })), playedTonight: new Set([...played].map((k) => k.replace(/[.#$\[\]\/]/g, '_'))) });
    const r = rec.all[0];
    return r ? `<button type="button" class="best-pick" data-rglib="${esc(r.id)}"><span>💡 Consigliato: <b>${esc(r.item.name)}</b> ${r.score}%</span><small>${esc(r.reasons.slice(0, 2).join(' · '))}</small></button>` : '';
  },

  async activate(input) {
    const code = normalizeCode(input, 8);
    if (code.length !== 8) throw userError('Il codice regia ha 8 caratteri.');
    try {
      await set(roomRef(P.code, `takeover/${P.uid}`), code);
      await set(roomRef(P.code, `cohosts/${P.uid}`), true);
    } catch {
      knock('regia');
      throw userError('Codice regia sbagliato.');
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
      this.fab.innerHTML = `${ICONS.play}<span>Regia</span>`;
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
        <div class="panel-head"><h2 id="rgTitle">Regia</h2><button type="button" class="icon-btn" id="rgClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <p class="rg-watch" id="rgWatch" role="status"></p>
        <div id="rgBody"></div>
        <details class="rg-safety" id="rgSafety"><summary>🛡️ Sicurezza della stanza</summary><div id="rgSafeBody"></div></details>
        <details class="rg-sfx"><summary>🔊 Soundboard sulla TV</summary><div class="sfx-grid">${SFX_META.map((m) => `<button type="button" class="sfx-btn" data-rgsfx="${m.k}"><span aria-hidden="true">${m.icon}</span><small>${esc(m.label)}</small></button>`).join('')}</div></details>
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
      ? `⚠️ <b>La regia non risponde</b> da ${age} s. <a href="host.html?room=${esc(P.code)}${regia ? `#regia=${esc(regia)}` : ''}">Riprendi la regia su questo dispositivo</a>`
      : `📡 Ultimo segnale dalla TV: ${age < 2 ? 'adesso' : `${age} s fa`}`;
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
        <button type="button" class="btn-sec btn-sec--sm" data-rglock>${P.meta?.locked ? '🔓 Riapri la stanza' : '🔒 Chiudi la stanza'}</button>
        <button type="button" class="btn-sec btn-sec--sm" data-rgsafe>${P.meta?.safeMode ? 'Spegni la Safe Mode' : '🚨 Safe Mode'}</button>
      </div>
      ${others.length ? `<span class="field-label">Espelli un dispositivo</span><div class="rg-chips">${others.map((p) => `<button type="button" class="lib-chip" data-rgkick="${esc(p.uid)}">⛔ ${esc(p.name)}</button>`).join('')}</div>` : ''}`;
  },

  async send(type, args = null) {
    try {
      const r = push(roomRef(P.code, 'commands'));
      await set(r, { type, args, by: P.uid, at: serverTimestamp() });
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(async () => {
        const still = await get(r).catch(() => null);
        if (still?.exists()) toast('La TV non risponde. Se il PC è spento, riprendi la serata da un altro computer con il codice regia.', 'warn');
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
      if (p && confirm(`Espellere ${p.name}? Il suo telefono esce dalla stanza e stasera non può rientrare (lo riammetti dalla TV). Il voto in corso, se c’è, viene tolto.`)) this.send('kick', { uid: kk.dataset.rgkick });
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
      if (!name) { toast('Scegli un gioco o scrivi il nome.', 'warn'); return; }
      this.send('openVote', { name, libraryId: this.draft.libraryId, winners: this.draft.winners, spectators: this.draft.spectators, quick: this.draft.quick });
      this.draft = { name: '', libraryId: null, winners: [], spectators: [], quick: false };
      return;
    }
    if (type === 'startPlay') {
      const name = cleanName(this.draft.name);
      if (!name) { toast('Scegli un gioco o scrivi il nome.', 'warn'); return; }
      this.send('startPlay', { name, spectators: this.draft.spectators });
      return;
    }
    if (type === 'end' && !confirm('Terminare la serata e passare alla premiazione?')) return;
    if (type === 'reveal' && b.dataset.missing && !confirm(`${b.dataset.missing}. Rivelare comunque?`)) return;
    if (type === 'reopen' && !confirm('Riaprire la votazione? I voti già dati restano.')) return;
    const args = b.dataset.arg ? { [b.dataset.argk || 'uid']: b.dataset.arg } : null;
    this.send(type, args);
  },

  paint() {
    if (!this.sheet) return;
    this.paintSafety();
    const st = P.state || {};
    const phase = st.phase || 'lobby';
    const gid = st.gameId;
    const sig = JSON.stringify([phase, gid, st.done, st.paused, st.playStart, st.event?.id, P.nights && Object.keys(P.nights).length, P.poll, P.votes?.[gid], Object.keys(P.players), Object.keys(P.library || {}), P.games?.[gid]?.status, P.presence]);
    if (sig === this.sig) return;
    this.sig = sig;
    const btn = (cmd, label, cls = 'btn btn-block', extra = '') => `<button type="button" class="${cls}" data-cmd="${cmd}" ${extra}>${label}</button>`;
    const g = P.games?.[gid];
    const active = activePlayers(P.players);
    let html = '';
    if (phase === 'lobby') {
      html = `<p>${active.length} su ${P.meta.maxPlayers || 8} giocatori dentro.</p>${btn('start', 'Inizia la serata')}`;
    } else if (phase === 'idle') {
      const played = new Set(Object.values(P.games || {}).map((x) => nameKey(x?.name)));
      const items = Object.entries(P.library || {}).filter(([, it]) => it?.name && !played.has(nameKey(it.name)))
        .sort(([, a], [, b]) => (libFits(b, active.length) - libFits(a, active.length)) || a.name.localeCompare(b.name, 'it'));
      const d = this.draft;
      html = `
        ${items.length >= 2 ? btn('pollStart', 'Cosa giochiamo? Votano i telefoni', 'btn-sec btn-block') : ''}
        <p class="field-label">Prossimo gioco</p>
        ${items.length ? `<div class="rg-chips">${items.map(([id, it]) => `<button type="button" class="lib-chip ${libFits(it, active.length) ? '' : 'is-unfit'}" data-rglib="${esc(id)}" aria-pressed="${d.libraryId === id}">${esc(it.name)}</button>`).join('')}</div>` : ''}
        <label class="sr-only" for="rgName">Nome del gioco</label>
        <input class="input" id="rgName" maxlength="40" placeholder="oppure scrivi il nome" value="${esc(d.name)}">
        ${this.bestHTML(active, played)}
        <p class="field-label">Chi ha giocato e chi ha vinto? <span class="muted">(tocca: vincitore, poi spettatore)</span></p>
        <div class="rg-chips">${active.map((p) => {
          const st = d.winners.includes(p.uid) ? 'winner' : d.spectators.includes(p.uid) ? 'spectator' : 'player';
          return `<button type="button" class="lib-chip rg-state rg-state--${st}" data-rgwin="${esc(p.uid)}" aria-pressed="${st === 'winner'}">${st === 'winner' ? '👑 ' : st === 'spectator' ? '👀 ' : ''}${esc(p.name)}</button>`;
        }).join('')}</div>
        <label class="quick-toggle"><input type="checkbox" id="rgQuick" ${d.quick ? 'checked' : ''}><span>Voto veloce (solo voto generale e MVP)</span></label>
        <div class="rg-row">${btn('startPlay', P.state?.playStart ? 'Riavvia il timer' : 'Inizia la partita', 'btn-sec')}${btn('interval', '☕ Intervallo sulla TV', 'btn-sec')}</div>
        ${btn('openVote', 'Apri la votazione')}
        <div class="rg-row">${btn('board', 'Classifica', 'btn-sec')}${btn('alltime', 'Di sempre', 'btn-sec')}${btn('end', 'Termina la serata', 'btn-sec')}</div>`;
    } else if (phase === 'poll') {
      const poll = P.poll || {};
      const votes = Object.keys(poll.votes || {}).length;
      html = poll.open
        ? `<p>Stanno scegliendo il gioco: ${votes} su ${active.length}.</p>${btn('pollClose', 'Chiudi la scelta')}${btn('pollCancel', 'Annulla', 'btn-sec btn-block')}`
        : `<p>Si gioca a <b>${esc(P.library?.[poll.winner]?.name || 'il gioco scelto')}</b>.</p>${btn('pollGo', 'Pronti, si gioca')}`;
    } else if (phase === 'voting' && g) {
      const votes = P.votes?.[gid] || {};
      const missing = active.filter((p) => !votes[p.uid]);
      const pres = P.presence || {};
      const tracked = Object.keys(pres).length > 0;
      html = `
        <p><b>${esc(g.name)}</b>: ${active.length - missing.length} su ${active.length} hanno votato.</p>
        ${missing.length ? `<ul class="rg-missing">${missing.map((p) => `<li>${esc(p.name)}${tracked && !pres[p.uid] ? ` <span class="muted">(scollegato)</span> ${btn('skip', 'Non aspettare', 'btn-sec btn-sec--sm', `data-arg="${esc(p.uid)}"`)}` : ''}</li>`).join('')}</ul>` : ''}
        ${btn('reveal', 'Rivela i voti', 'btn btn-block', missing.length ? `data-missing="${missing.length === 1 ? 'Manca un voto' : `Mancano ${missing.length} voti`}"` : '')}`;
    } else if (phase === 'reveal') {
      html = `${btn('next', 'Prossimo gioco')}<div class="rg-row">${btn('rematch', 'Rivincita', 'btn-sec', `data-arg="${esc(gid || '')}" data-argk="gameId"`)}${btn('board', 'Classifica', 'btn-sec')}${btn('reopen', 'Riapri la votazione', 'btn-sec', `data-arg="${esc(gid || '')}" data-argk="gameId"`)}</div>`;
    } else if (phase === 'board') {
      html = `${btn('next', 'Prossimo gioco')}<div class="rg-row">${btn('alltime', 'Di sempre', 'btn-sec')}${btn('end', 'Termina la serata', 'btn-sec')}</div>`;
    } else if (phase === 'alltime') {
      html = btn('back', 'Torna alla serata');
    } else if (phase === 'awards') {
      html = st.done ? '<p>Premiazione conclusa.</p>' : btn('step', 'Avanti con la premiazione');
    }
    if (st.paused) html = `<p>La serata è in pausa.</p>${btn('resume', 'Riprendi la serata')}`;
    else html += btn('pause', 'Metti in pausa', 'btn-sec btn-block');
    $('#rgBody', this.sheet).innerHTML = html || '<p class="muted">Niente da fare in questo momento.</p>';
  }
};

function addGameButton() {
  if (!P.meta?.groupId && !P.meta?.armadioId) return '';
  const n = Object.keys(P.library || {}).length;
  const mine = Object.keys(P.tonight || {}).filter((lid) => P.tonight[lid]?.[P.uid]).length;
  return `<button type="button" class="btn-sec ph-addgame" id="addGameBtn">🎲 <span>I giochi di stasera</span></button>
    <p class="muted small">${mine ? `Hai portato ${mine} ${mine === 1 ? 'gioco' : 'giochi'}. ` : 'Segna cosa hai portato e a cosa vuoi giocare. '}${n ? `Nell’armadio: ${n}.` : 'L’armadio è ancora vuoto.'}</p>`;
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
        <p class="ph-lead">Guarda la TV: si parte quando l’host avvia la serata.</p>
        <div class="wait-list" id="waitList"></div>
        <p class="muted" id="waitCount"></p>
        ${newCodeHTML()}
        ${photoButtonHTML()}
        ${addGameButton()}
        <div class="ph-links">
          <button type="button" class="link-btn" data-myprofile>Il mio profilo</button>
          <button type="button" class="link-btn" id="editProfile">Modifica profilo</button>
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
    $('#waitTitle').textContent = `Ci sei, ${me.name}!`;
    $('#waitList').innerHTML = ps.map((p) => avatarHTML(p, '2.6rem')).join('');
    $('#waitCount').textContent = `${ps.length} su ${P.meta.maxPlayers || 8} giocatori`;
  }
};

SCREENS.idle = {
  mount(el) {
    this.sig = '';
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="wait-hero" id="idleMe"></div>
        <h1 class="ph-title">Prossimo gioco in arrivo</h1>
        <p class="ph-lead">L’host sta preparando il gioco. Quando si apre la votazione, il telefono è pronto.</p>
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
          <button type="button" class="link-btn" data-myprofile>Il mio profilo</button>
          <button type="button" class="link-btn" id="editProfile">Modifica profilo</button>
          <button type="button" class="link-btn" id="leaveNight">Esco dalla serata</button>
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
      const t = P.table || {};
      $('#idleTable').innerHTML = t.starter || Array.isArray(t.teams) || t.sand ? tableHTML() : '';
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
        <h1 class="ph-title">Il verdetto è sulla TV!</h1>
        <div class="card p-reveal">
          ${gameImageHTML(g, 'game-img--vote')}
          <div class="p-reveal-body">
            <b class="vgame-name">${esc(g.name)}</b>
            <div class="p-reveal-nums">
              <div><span class="muted">Il tuo voto</span><b class="p-num">${mine ? mine.overall : '–'}</b></div>
              <div class="p-late" style="--after:${delay.toFixed(2)}s"><span class="muted">Media</span><b class="p-num p-num--avg">${fmt(st.avg)}</b></div>
            </div>
            <p class="p-late p-verdict" style="--after:${(delay + 0.2).toFixed(2)}s">${esc(verdict(st))}</p>
            ${typeof mine?.guess === 'number' ? `<p class="p-late p-guess" style="--after:${(delay + 0.3).toFixed(2)}s">Avevi previsto ${fmt(mine.guess, Number.isInteger(mine.guess) ? 0 : 1)}: ${st.oracle?.winners.some((w) => w.uid === P.uid) ? 'sei l’oracolo di questo gioco!' : `sbagliato di ${fmt(Math.abs(mine.guess - st.avg))}`}</p>` : ''}
            ${g.winners ? `<p class="p-win-line">${ICONS.trophy}<span>Ha vinto ${esc(namesList(Object.keys(g.winners).map((uid) => P.players[uid]?.name || 'Ex giocatore')))}</span></p>` : ''}
            ${g.winners && g.bets?.[P.uid] ? `<p class="p-late p-bet" style="--after:${(delay + 0.4).toFixed(2)}s">🔮 Avevi puntato su ${esc(P.players[g.bets[P.uid]]?.name || 'un ex giocatore')}: ${g.winners[g.bets[P.uid]] ? '<b>indovinato!</b> +15 XP' : 'non è andata, sarà per la prossima.'}</p>` : ''}
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
        <h1 class="ph-title">Classifica</h1>
        <p class="ph-lead">La vedete anche sulla TV.</p>
        <div class="full-width" id="pBoard"></div>
      </main>`;
    this.sig = '';
  },
  update() {
    const sig = JSON.stringify([Object.keys(P.games), Object.keys(P.votes)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#pBoard').innerHTML = miniBoardHTML(false) || '<p class="muted">Ancora nessun gioco votato.</p>';
  }
};

SCREENS.awards = {
  mount(el) {
    if (P.state?.done) { this.results(el); return; }
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.trophy}</div>
        <h1 class="ph-title">Premiazione in corso</h1>
        <p class="ph-lead">Occhi sulla TV: podio e premi speciali vengono svelati uno alla volta.</p>
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
      <div class="p-champs full-width"><h2>Campioni della serata</h2>
        <ol class="p-champ-list">${champs.map((c) => {
          const p = P.players[c.uid] || { name: 'Ex giocatore', uid: c.uid };
          return `<li class="p-champ ${c.uid === P.uid ? 'is-me' : ''}"><span class="p-champ-medal" aria-hidden="true">${medal[c.rank - 1] || '🏅'}</span>${avatarHTML({ ...p, uid: c.uid }, '2.6rem')}<b>${esc(p.name)}</b><span class="p-champ-pts">${c.points} pt</span></li>`;
        }).join('')}</ol></div>` : '';
    if (champs.some((c) => c.uid === P.uid && c.rank === 1)) setTimeout(() => confettiBurst(120, 'rain'), 400);
    el.innerHTML = `
      <main class="phone phone--center">
        ${phoneTop()}
        <div class="photo-ico photo-ico--sun">${ICONS.trophy}</div>
        <h1 class="ph-title">Risultati della serata</h1>
        <p class="ph-lead">Grazie per aver giocato!</p>
        <div class="share-row"><button type="button" class="btn btn-block" id="shareBtn">${ICONS.share}<span>Condividi la classifica</span></button>
        <button type="button" class="btn-sec btn-block" id="storyBtn">📱 <span>Condividi la storia</span></button></div>
        ${champsHTML}
        <div class="full-width">${miniBoardHTML() || '<p class="muted">Nessun gioco votato.</p>'}</div>
        ${items ? `<div class="p-awards"><h2>Premi speciali</h2><ol class="p-award-list">${items}</ol></div>` : ''}
        ${myUnlockedHTML()}
        ${P.meta.groupId && Object.keys(P.nights || {}).length > 1 ? `<div class="p-awards"><h2>Classifica di sempre</h2>${allTimeHTML(5)}</div>` : ''}
      </main>`;
    $('#shareBtn', el).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const blob = await renderShareImage({
          title: P.meta.groupName || 'La nostra serata',
          subtitle: nightDate(P.meta.createdAt),
          board,
          awards
        });
        const date = new Date().toISOString().slice(0, 10);
        const how = await shareOrDownload(blob, `GameNight_Show_${date}.png`, 'La classifica della nostra serata giochi');
        if (how === 'downloaded') toast('Immagine salvata');
      } catch (err) {
        console.error(err);
        toast('Non sono riuscito a creare l’immagine.', 'error');
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
          title: P.meta.groupName || 'La nostra serata', emblem: id.logo ? '' : (id.emblem || ''), color: id.color,
          subtitle: nightDate(P.meta.createdAt), number, board, mvp, winners,
          awards: awards.filter((a) => !['mvp', 'wins'].includes(a.key)).map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) })),
          facts: `${board.length} ${board.length === 1 ? 'gioco' : 'giochi'} · ${activePlayers(P.players).length} giocatori`
        });
        const how = await shareOrDownload(blob, `GameNight_Show_storia_${new Date().toISOString().slice(0, 10)}.png`, 'La nostra serata giochi');
        if (how === 'downloaded') toast('Storia salvata');
      } catch (err) {
        console.error(err);
        toast('Non sono riuscito a creare l’immagine.', 'error');
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
      if (!mine && draft) toast('Ho ripreso il voto che stavi compilando');
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
          <span class="chip chip--tomato">Gioco ${g.order || ''}</span>
          <span class="secret">${ICONS.lock}<span>Voto segreto</span></span>
          <button type="button" class="net-pill" data-netpill aria-live="polite"></button>
        </div>
        <div class="card vgame">
          ${gameImageHTML(g, 'game-img--vote')}
          <h1 class="vgame-name">${esc(g.name)}</h1>
        </div>
        ${spectator ? '<p class="spectator-note">👀 Hai guardato questa partita: voti come <b>pubblico</b>. Il tuo voto compare a parte e non entra nella media dei giocatori.</p>' : ''}

        <section class="vblock">
          <div class="ph-row">
            <label for="overall" class="vlabel">Voto generale</label>
            <output id="overallOut" class="score-badge" for="overall">?</output>
          </div>
          <div class="giant-wrap">
            <input type="range" id="overall" class="range range--giant" min="1" max="10" step="1" value="${P.vote.overall ?? 5}" aria-describedby="overallHint">
            <div class="ticks ticks--giant" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<span style="--i:${i}">${i + 1}</span>`).join('')}</div>
          </div>
          <p class="vhint" id="overallHint">Trascina il pollice lungo la barra: il telefono vibra a ogni scatto.</p>
        </section>

        ${this.quick ? '<p class="quick-badge">Voto veloce: solo voto generale e MVP</p>' : ''}
        ${this.crits.map((c) => `
          <fieldset class="vblock">
            <legend class="vlabel">${esc(c.label)}</legend>
            <p class="vhint">${esc(c.hint)}</p>
            <div class="pips-row" data-crit="${c.key}" style="--cc:${c.color}">
              ${[1, 2, 3, 4, 5].map((k) => `<button type="button" class="pip-btn" data-k="${k}" aria-pressed="false" aria-label="${esc(c.label)}: ${k} su 5">${k}</button>`).join('')}
            </div>
            <button type="button" class="na-btn" data-na="${c.key}" aria-pressed="false">Non giudico</button>
          </fieldset>`).join('')}

        <fieldset class="vblock">
          <legend class="vlabel">MVP della partita</legend>
          ${list.length
            ? `<p class="vhint">Chi è stato il giocatore più memorabile? Trascina la sua carta sul tavolo (o toccala).</p>
               <div class="mvp-slot" id="mvpSlot" aria-live="polite"></div>
               <div class="mvp-grid mvp-hand" style="--n:${list.length}">${list.map((p, i) => `
                 <button type="button" class="mvp-btn mvp-card" data-mvp="${esc(p.uid)}" aria-pressed="false" style="--pc:${safeColor(p.color)}; --k:${i - (list.length - 1) / 2}">
                   <span class="mvp-av">${ICONS.crown}${avatarHTML(p, '3.9rem')}</span>
                   <span class="mvp-n">${esc(p.name)}</span>
                 </button>`).join('')}</div>`
            : '<p class="vhint">Nessun altro giocatore da votare.</p>'}
        </fieldset>

        <fieldset class="vblock guess-block">
          <legend class="vlabel">Indovina la media <span class="muted">(facoltativo)</span></legend>
          <p class="vhint">Che media prenderà questo gioco dal gruppo? Chi ci va più vicino diventa l’oracolo.</p>
          <div class="guess-row">
            <input type="range" id="guess" class="range range--guess" min="1" max="10" step="0.5" value="${P.vote.guess ?? 5.5}" aria-label="La tua previsione della media">
            <output id="guessOut" class="score-badge score-badge--sm" for="guess">?</output>
          </div>
          <button type="button" class="link-btn" id="guessClear">Non voglio indovinare</button>
        </fieldset>

        <section class="vblock">
          <label class="vlabel" for="voteComment">Commento <span class="muted">(facoltativo, compare sulla TV al reveal)</span></label>
          <input class="input" id="voteComment" maxlength="80" autocomplete="off" placeholder="Es. Mai più contro Marco" value="${esc(P.vote.comment || '')}">
        </section>
        <details class="vblock priv-note" ${note ? 'open' : ''}>
          <summary class="vlabel">Nota privata <span class="muted">(la vedi solo tu)</span></summary>
          <textarea class="input" id="privNote" maxlength="300" rows="2" placeholder="Strategie, regole da ricordare, rivincite da chiedere…">${esc(note)}</textarea>
        </details>

        <p class="form-error" id="voteErr" role="alert"></p>
        <button type="button" class="btn btn-block" id="sendVote">${mine ? 'Aggiorna voto' : 'Invia voto'}</button>
        <p class="muted center small">I voti restano nascosti fino al reveal sulla TV.</p>
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
    const t = voteTimer(P.state, serverNow());
    box.hidden = !t;
    if (!t) return;
    box.style.setProperty('--tc', timerColor(t.frac));
    $('#fuseRope').style.width = `${(t.frac * 100).toFixed(2)}%`;
    box.style.setProperty('--fx', `${(t.frac * 100).toFixed(2)}%`);
    box.classList.toggle('is-hot', !t.over && !t.paused && t.sec <= 10);
    box.classList.toggle('is-over', t.over);
    box.classList.toggle('is-paused', t.paused);
    $('#fuseTxt').textContent = t.over ? 'Tempo scaduto: vota subito!' : t.paused ? 'Timer in pausa' : `${t.sec >= 60 ? `${Math.floor(t.sec / 60)}:${String(t.sec % 60).padStart(2, '0')}` : `${t.sec} s`}`;
    if (!t.paused && t.sec !== this.fuseSec && this.fuseSec !== undefined) {
      if (t.sec === 10) buzz([40, 60, 40]);
      if (t.over) buzz([120, 80, 120, 80, 200]);
    }
    this.fuseSec = t.sec;
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
          ? `<div class="mvp-played" style="--pc:${safeColor(p.color)}"><span class="mvp-av">${ICONS.crown}${avatarHTML(p, '3.4rem')}</span><span class="mvp-played-txt"><small>Il tuo MVP</small><b>${esc(p.name)}</b></span><button type="button" class="link-btn" data-mvpclear>Cambia</button></div>`
          : '<span class="mvp-slot-empty"><b>Il tavolo</b><small>Trascina qui la carta del tuo MVP</small></span>';
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
    if (!v.overall) missing.push('voto generale');
    for (const c of this.crits) if (v[c.key] === null || v[c.key] === undefined) missing.push(`${c.label.toLowerCase()} (o "Non giudico")`);
    if (this.needMvp && !v.mvp) missing.push('MVP');
    if (missing.length) {
      $('#voteErr').textContent = `Manca: ${missing.join(', ')}.`;
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
      await Net.track('Voto', set(roomRef(P.code, `votes/${gid}/${P.uid}`), data));
      outboxClear();
      clearDrafts();
      P.editingVote = false;
      if (navigator.vibrate) navigator.vibrate(30);
      render();
    } catch (e) {
      const msg = String(e?.code || e?.message || '').toLowerCase().includes('permission')
        ? 'La votazione è già chiusa.'
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
        <h1 class="ph-title" id="votedTitle">Voto inviato!</h1>
        <p class="ph-lead" id="votedLead">Aspetta gli altri: il reveal è sulla TV.</p>
        <div class="card my-vote" id="myVote"></div>
        <p class="vote-progress" id="voteProg" aria-live="polite"></p>
        <button type="button" class="btn-sec" id="editVote">Modifica voto</button>
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
    $('#voteProg').textContent = `${voted} su ${ps.length} hanno votato`;

    const sig = JSON.stringify([mine, P.players[mine.mvp]?.name]);
    if (sig === this.sig) return;
    this.sig = sig;
    const mvp = mine.mvp ? (P.players[mine.mvp] || { name: 'Ex giocatore' }) : null;
    $('#myVote').innerHTML = `
      <div class="my-vote-head"><b class="vgame-name">${esc(g.name)}</b><span class="score-badge is-set">${mine.overall}</span></div>
      ${activeCriteria(P.meta.voting).some((c) => typeof mine[c.key] === 'number') ? `<div class="my-vote-crit">${activeCriteria(P.meta.voting).map((c) => `<span class="bcrit-item" style="--cc:${c.color}">${esc(c.short || c.label)} ${typeof mine[c.key] === 'number' ? mine[c.key] : '—'}</span>`).join('')}</div>` : ''}
      ${mine.comment ? `<p class="my-vote-guess">«${esc(mine.comment)}»</p>` : ''}
      ${typeof mine.guess === 'number' ? `<p class="my-vote-guess">La tua previsione della media: <b>${fmt(mine.guess, Number.isInteger(mine.guess) ? 0 : 1)}</b></p>` : ''}
      ${mvp ? `<div class="my-vote-mvp">${avatarHTML({ ...mvp, uid: mine.mvp }, '2.4rem')}<span>MVP: <b>${esc(mvp.name)}</b></span></div>` : ''}`;
  }
};
