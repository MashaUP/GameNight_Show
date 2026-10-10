// Schermata TV (host): crea la stanza, guida la serata e mostra reveal, classifica e premi.
import {
  isConfigured, connect, roomRef, groupRef, armadioRef, libraryRef, secretRef, dbRef, onValue, get, set, update, remove, push,
  serverTimestamp, explainError, trackConnection, serverNow
} from './fb.js';
import {
  $, esc, fmt, param, normalizeCode, randomCode, sortedPlayers, activePlayers, compressImage, gameImage, gameImageFromUrl,
  nameKey, cleanName, userError, asList, libFits, libInfo, connectionStatus, watchVersion, registerSW,
  toastUndo, applyTheme, themeSwitchHTML, isShowTheme, dbKey, compressPhoto, qrSVG,
  isImageSource, gameImageHTML, toast, confetti, installImageFallback, showFatal,
  showNotConfigured, downloadFile, ICONS, PLAYER_COLORS, MIN_PLAYERS, MAX_PLAYERS, DEFAULT_PLAYERS,
  ErrLog, a11yHTML, prefersReducedMotion, voteTimer, timerColor, editPhoto, rememberNight, pollChoices, POLL_MAX_VOTES
} from './util.js';
import { avatarHTML, avatarOptions } from './avatars.js';
import { runTour, resetTours, tourOpen } from './tour.js';
import {
  CRITERIA, gameStats, verdict, buildBoard, buildAwards, rankLine, boardCSV, nightSummary, buildAllTime,
  activeCriteria, recommend, progressFor, newAchievements, records, groupLevel, durationOf,
  nightsList, nightHighlights, wrapped, yearsOf, nightsByMonth, onThisDay, groupInsights, pairsMap,
  searchLibrary, parseQuery, gameRecord, tagsOf, isAvailable, GAME_STATUS, GAME_MODES, nightFacts,
  betResults, seersByPlayer, winsByPlayer, nightChampions
} from './stats.js';
import { renderShareImage, renderStoryImage, shareOrDownload, nightDate } from './share.js';
import {
  ding, pop, drumroll, fanfare, joinSound, soundsOn, setSounds, whistle, achievementSound, victory, sadTrombone,
  newGameSound, endNightSound, isMuted, setMuted, getVolume, setVolume, SFX, playSfx, cymbal, audioStatus, audioBlocked, audioCtx,
  clockTick, timeUp, fireworkSound, stepUp
} from './sounds.js';
import { fireworks, confettiBurst } from './fx.js';
import {
  bindTV, TablePanel, Sand, GameWheel, Quiz, Knocks, liveScoresHTML, editScore, rivalryLine, seasonTabHTML, rivalsTabHTML,
  cardsTabHTML, bindCards, seasonStageHTML, VideoPanel, downloadICS, importGamesCSV, changeRegiaCode, cleanupOldRooms
} from './tv-extras.js';
import { Lite } from './lite.js';
import { publicUrl, isApp } from './native.js';
import { Person } from './person.js';
import { saveGame, newGameId, fullImage, trashGame as armTrash, logEvent as armLog } from './collection.js';
import { bindPrep, onTable, poolIds, wishes, prepHTML, planNextHTML, PlanPanel, RulesPanel } from './tv-prep.js';
import { Music, MUSIC_MODES, MOOD_LABEL } from './music.js';
import { Atmo, ATMOS, atmoForGame } from './atmo.js';
import { TRIVIA, groupFacts, tonightNews } from './facts.js';
import { commentatorMode, setCommentatorMode, COMMENTATOR_MODES, revealComment, nightRecap, podiumLine, speak, stopSpeaking } from './commentary.js';
import { reportHTML, printReport } from './report.js';
import { Vault, checksum, sealBackup, validateBackup, storageInfo, askPersistence } from './vault.js';
import { isSafeMode, setSafeMode, watchErrors } from './safe.js';
import { trophies, affinities, lastPlayed, freshnessLabel, personKey } from './stats.js';

const app = $('#app');
const STORE_KEY = 'gnr_host_room';
const WATCHED = ['pick', 'meta', 'state', 'players', 'games', 'votes', 'pendingImage', 'poll', 'presence', 'claims', 'commands', 'trash', 'buzz', 'bets', 'sfx', 'gossip', 'profileClaims', 'scores', 'table', 'quiz', 'quizAns', 'quizScore', 'knock', 'tonight', 'wish', 'plan', 'rules', 'knows'];
// Quanto la TV aspetta un telefono che si scollega durante la votazione.
const GRACE_MS = 60000;
const GROUPS_KEY = 'gnr_groups';
const TILTS = [-2, 1.5, -1, 2, 1, -1.5, 2, -1];

const S = {
  uid: null,
  code: null,
  meta: null,
  state: null,
  players: {},
  games: {},
  votes: {},
  pendingImage: null,
  poll: null,
  presence: {},
  claims: {},
  commands: {},
  trash: {},
  buzz: {},
  bets: {},
  sfx: {},
  gossip: {},
  profileClaims: {},
  offlineSince: {},
  skipWait: new Set(),
  group: null,
  library: {},
  nights: {},
  groupWatching: null,
  loaded: new Set(),
  screenKey: null,
  screen: null,
  setupCount: DEFAULT_PLAYERS,
  draft: { name: '', image: null, libraryId: null, winners: [], quick: false }
};

/** I giochi: nell'armadio collegato (o, per le stanze vecchie, nel gruppo). */
const libRef = (path = '') => libraryRef(S.meta, path);
const hasLib = () => Boolean(S.meta?.armadioId || S.meta?.groupId);
/** Nome da mostrare per l'armadio. */
const armadioName = () => S.meta?.armadioName || (S.meta?.armadioId ? 'Armadio' : (S.meta?.groupName ? `Armadio di ${S.meta.groupName}` : 'Armadio'));

const EMPTY_DRAFT = () => ({ name: '', image: null, libraryId: null, winners: [], spectators: [], quick: false });

// Strumenti da tavolo, quiz, stagioni…: ricevono lo stato e le funzioni della TV.
bindTV({
  S, roomRef, groupRef, libraryRef, set, update, remove, get, push, serverTimestamp, serverNow, explainError, secretRef,
  logEvent: (...a) => logEvent(...a), playerOrGhost: (u) => playerOrGhost(u), playerByName: (n) => playerByName(n),
  libOk: (it, n) => libOk(it, n), libraryItems: () => libraryItems(), playedTonight: () => playedTonight(),
  winsTonight: () => winsTonight(), board: () => buildBoard(S.games, S.votes), regiaKey: (c) => regiaKey(c), poolItems: () => poolItems(),
  chooseGame: (id) => chooseGame(id)
});
// Pre-partita: giochi sul tavolo, desideri, scaletta, regole.
bindPrep({
  S, roomRef, set, update, remove, serverTimestamp, serverNow, explainError,
  logEvent: (...a) => logEvent(...a), libraryItems: () => libraryItems(), playedTonight: () => playedTonight(),
  libOk: (it, n) => libOk(it, n), useLibraryGame: (id) => useLibraryGame(id),
  startPlay: (name) => { update(roomRef(S.code, 'state'), playState(name, S.draft.spectators)).catch((err) => toast(explainError(err), 'error')); newGameSound(); }
});

document.documentElement.classList.add('tv');
applyTheme();
Lite.watch((fps) => toast(`La TV andava a scatti (${fps} fotogrammi al secondo): ho acceso la modalità leggera. Si cambia negli Strumenti.`, 'warn'));
installImageFallback();
ErrLog.install();
setupGlobalKeys();
watchErrors(() => offerSafeMode());
registerSW();
watchVersion();
// Chiudere per sbaglio la pagina della TV chiede conferma (la serata resta comunque salvata).
window.addEventListener('beforeunload', (e) => {
  if (S.code && S.meta) { e.preventDefault(); e.returnValue = ''; }
});
boot();

// ---------------------------------------------------------------------------
// Codice regia e lavoro a metà salvati su questo computer
// ---------------------------------------------------------------------------

const regiaKey = (code) => `gnr_regia_${code}`;
function regiaCode(code = S.code) {
  return localStorage.getItem(regiaKey(code)) || '';
}
function prettyRegia(c) {
  return c ? `${c.slice(0, 4)}-${c.slice(4)}` : '';
}

const draftKey = () => `gnr_hostdraft_${S.code}`;
function saveDraft() {
  if (!S.code) return;
  try {
    localStorage.setItem(draftKey(), JSON.stringify(S.draft));
  } catch {
    try { localStorage.setItem(draftKey(), JSON.stringify({ ...S.draft, image: null })); } catch { /* niente */ }
  }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    if (d && typeof d === 'object') S.draft = { ...EMPTY_DRAFT(), ...d };
  } catch { /* niente */ }
}

// ---------------------------------------------------------------------------
// Avvio e stanza
// ---------------------------------------------------------------------------

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  // Vecchi link "host.html?armadio=CODICE": l'armadio ha la sua pagina (1.2)
  const armLink = normalizeCode(param('armadio') || '', 6);
  if (armLink.length === 6 && !param('room')) { location.replace(`armadio.html?a=${armLink}`); return; }
  app.innerHTML = loadingHTML('Collegamento in corso…');
  try {
    S.uid = await connect();
  } catch (err) {
    showFatal(app, 'Impossibile collegarsi', explainError(err));
    return;
  }

  // Profilo personale: porta su questo computer gli armadi (con le chiavi) usati sugli altri dispositivi.
  Person.uid = S.uid;
  await Person.load().catch(() => null);

  const fromUrl = normalizeCode(param('room'));
  // Regia trasferita con il QR: il codice regia arriva nell'indirizzo (dopo #, non va al server).
  const hashRegia = normalizeCode((location.hash.match(/regia=([A-Za-z0-9-]+)/) || [])[1] || '', 8);
  S.hashGroupKey = normalizeCode((location.hash.match(/gk=([A-Za-z0-9-]+)/) || [])[1] || '', 8);
  const wanted = fromUrl || normalizeCode(localStorage.getItem(STORE_KEY));
  if (wanted.length === 4) {
    try {
      const meta = (await get(roomRef(wanted, 'meta'))).val();
      if (meta && meta.hostUid === S.uid) { openRoom(wanted); toastResumed(wanted); return; }
      if (meta) { renderCreate({ resume: wanted, regia: hashRegia }); return; }
    } catch (err) {
      showFatal(app, 'Impossibile leggere la stanza', explainError(err));
      return;
    }
  }
  localStorage.removeItem(STORE_KEY);
  // Mai dritti alla schermata iniziale se c'è una serata interrotta da riprendere.
  const sess = (await Vault.sessions().catch(() => []))[0];
  renderCreate({ ...(sess ? { recover: sess } : {}), armadio: param('armadio') === '1' && !sess });
}

/** Dopo un ricaricamento: "Serata ripresa, copia valida delle 22:14:31". */
async function toastResumed(room) {
  const saved = await Vault.loadCurrent(room).catch(() => null);
  if (saved?.at) toast(`Serata ripresa · ultima copia valida delle ${new Date(saved.at).toLocaleTimeString('it-IT')}${saved.fallback ? ' (la più recente era rovinata)' : ''}`);
}

/** Riprende la guida di una stanza: subito se è di questo dispositivo, altrimenti con il codice regia. */
async function takeOver(codeIn, regiaIn) {
  const code = normalizeCode(codeIn);
  const regia = normalizeCode(regiaIn, 8);
  if (code.length !== 4) throw userError('Il codice stanza ha 4 caratteri.');
  const meta = (await get(roomRef(code, 'meta'))).val();
  if (!meta) throw userError('Nessuna stanza con questo codice.');
  if (meta.hostUid !== S.uid) {
    if (regia.length !== 8) throw userError('Scrivi il codice regia di 8 caratteri.');
    try {
      await set(roomRef(code, `takeover/${S.uid}`), regia);
      await update(roomRef(code, 'meta'), { hostUid: S.uid });
    } catch {
      throw userError('Codice regia sbagliato.');
    }
    localStorage.setItem(regiaKey(code), regia);
  }
  if (S.code === code) { S.screenKey = null; render(); return; }
  openRoom(code);
}

function renderLostRegia() {
  if (S.screenKey === 'lost') return;
  S.screenKey = 'lost';
  S.screen?.unmount?.();
  S.screen = null;
  const known = regiaCode();
  app.innerHTML = `
    <main class="create">
      <form class="card create-card" id="lostForm" novalidate>
        <h2>La regia è passata a un altro dispositivo</h2>
        <p>La serata <b>${esc(S.code)}</b> ora è guidata da un altro computer o tablet. Se vuoi riprenderla da qui, usa il codice regia.</p>
        <label class="field-label" for="lostRegia">Codice regia</label>
        <input class="input code-input code-input--8" id="lostRegia" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" value="${esc(prettyRegia(known))}">
        <p class="form-error" id="lostErr" role="alert"></p>
        <button class="btn btn-big btn-block" type="submit">Riprendi la regia qui</button>
        <button class="link-btn" type="button" id="lostNew">Crea una serata nuova</button>
      </form>
    </main>`;
  $('#lostForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await takeOver(S.code, $('#lostRegia').value); } catch (err) { $('#lostErr').textContent = explainError(err); }
  });
  $('#lostNew').addEventListener('click', () => { localStorage.removeItem(STORE_KEY); location.href = location.pathname; });
}

/** Serate recenti dei gruppi usati su questo computer (per riprenderle). */
async function recentRooms() {
  const out = [];
  for (const g of recentGroups().slice(0, 4)) {
    try {
      const rooms = (await get(groupRef(g.id, 'rooms'))).val() || {};
      for (const [code, r] of Object.entries(rooms)) out.push({ code, at: Number(r?.at) || 0, group: g.name });
    } catch { /* gruppo non leggibile: si salta */ }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 5);
}

function recentGroups() {
  try {
    const list = JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((g) => g && /^[A-Z0-9]{6}$/.test(g.id)) : [];
  } catch { return []; }
}

function rememberGroup(group) {
  const list = [group, ...recentGroups().filter((g) => g.id !== group.id)].slice(0, 8);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
}

function forgetGroup(id) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(recentGroups().filter((g) => g.id !== id)));
}

// Armadi dei giochi ricordati su questo computer (indipendenti dai gruppi)
const ARMADI_KEY = 'gnr_armadi';
function recentArmadi() {
  try {
    const list = JSON.parse(localStorage.getItem(ARMADI_KEY) || '[]');
    return Array.isArray(list) ? list.filter((a) => a && /^[A-Z0-9]{6}$/.test(a.id)) : [];
  } catch { return []; }
}
function rememberArmadio(arm) {
  try { localStorage.setItem(ARMADI_KEY, JSON.stringify([arm, ...recentArmadi().filter((a) => a.id !== arm.id)].slice(0, 8))); } catch { /* niente */ }
}
function forgetArmadio(id) {
  try { localStorage.setItem(ARMADI_KEY, JSON.stringify(recentArmadi().filter((a) => a.id !== id))); } catch { /* niente */ }
}
/** L'ultimo armadio usato con un gruppo: proposto da solo la volta dopo. */
const groupArmKey = (gid) => `gnr_group_arm_${gid}`;
const akKey = (aid) => `gnr_akey_${aid}`;
function armadioKey(aid) { try { return localStorage.getItem(akKey(aid)) || ''; } catch { return ''; } }
function saveArmadioKey(aid, k) { try { localStorage.setItem(akKey(aid), k); } catch { /* niente */ } }

/** Rende questo computer autorizzato a modificare l'armadio: proprietario, già autorizzato o con la chiave. */
async function ensureArmadioAdmin(aid, keyIn = '') {
  const info = (await get(armadioRef(aid, 'info'))).val();
  if (!info) return false;
  // L'armadio finisce nel profilo personale: lo ritrovi (e lo modifichi) anche dagli altri tuoi dispositivi.
  const remember = () => Person.linkArmadio(aid, info.name, armadioKey(aid), info.ownerUid === S.uid).catch(() => {});
  if (info.ownerUid === S.uid) {
    if (!armadioKey(aid)) {
      const k = randomCode(8);
      try { await set(dbRef(`armadioKeys/${aid}`), k); saveArmadioKey(aid, k); } catch { /* niente */ }
    }
    remember();
    return true;
  }
  if ((await get(armadioRef(aid, `admins/${S.uid}`)).catch(() => null))?.val() === true) { remember(); return true; }
  const key = normalizeCode(keyIn, 8) || armadioKey(aid);
  if (!key) { Person.linkArmadio(aid, info.name).catch(() => {}); return false; }
  try {
    await set(dbRef(`armadioKeyClaims/${aid}/${S.uid}`), key);
    await set(armadioRef(aid, `admins/${S.uid}`), true);
    saveArmadioKey(aid, key);
    remember();
    return true;
  } catch { return false; }
}

/** Nella stanza: i giochi arrivano dall'armadio collegato; i giocatori diventano membri (possono aggiungere giochi). */
function watchArmadio() {
  const aid = S.meta?.armadioId || null;
  if (S.armadioWatching === aid) return;
  // Cambio di armadio durante la serata: si smette di seguire il vecchio.
  try { S.armadioStop?.(); } catch { /* niente */ }
  S.armadioStop = null;
  S.armadioWatching = aid;
  S.armMissing = false;
  if (!aid) return;
  const stopLib = onValue(armadioRef(aid, 'library'), (snap) => { S.library = snap.val() || {}; LibPanel.sig = ''; render(); }, (err) => toast(explainError(err), 'error'));
  // Anche il nome: se l'armadio viene rinominato, la stanza mostra subito il nome nuovo
  let first = true;
  const stopInfo = onValue(armadioRef(aid, 'info'), (s) => {
    S.armMissing = !s.exists();
    if (S.armMissing && first) toast('L’armadio di questa serata non esiste più: scegline un altro da Armadio › Cambia armadio.', 'warn');
    first = false;
    const nm = s.val()?.name;
    if (nm && S.meta && S.code && nm !== S.meta.armadioName && S.meta.armadioId === aid && !S.meta.demo) {
      S.meta.armadioName = nm;
      update(roomRef(S.code, 'meta'), { armadioName: nm }).catch(() => {});
      rememberArmadio({ id: aid, name: nm });
    }
    LibPanel.sig = ''; LibPanel.update();
  }, () => {});
  S.armadioStop = () => { stopLib(); stopInfo(); };
  if (armReadOnly()) { S.armAdmin = false; LibPanel.sig = ''; LibPanel.update(); return; }
  ensureArmadioAdmin(aid).then((ok) => { S.armAdmin = ok; registerMembers(); LibPanel.sig = ''; LibPanel.update(); }).catch(() => { S.armAdmin = false; });
}
/** Serata di prova: l'armadio si consulta ma non si modifica. */
function armReadOnly() { return Boolean(S.meta?.armadioReadOnly); }

/** Cambia l'armadio della serata (prima di iniziare o tra un gioco e l'altro). */
async function switchArmadio(id) {
  const info = (await get(armadioRef(id, 'info'))).val();
  if (!info) throw userError('Nessun armadio con questo codice.');
  await update(roomRef(S.code, 'meta'), { armadioId: id, armadioName: info.name, armadioReadOnly: S.meta?.demo ? true : null });
  const n = await copyPicks(S.code, id);
  rememberArmadio({ id, name: info.name });
  logEvent(`Armadio della serata: ${info.name}`, '📦');
  toast(`📦 Ora la serata usa “${info.name}”${n ? ` (⭐ ${n} per stasera)` : ''}`);
}

function loadingHTML(text) {
  return `<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>${esc(text)}</p></div>`;
}

function renderCreate(opts = {}) {
  S.screenKey = 'create';
  history.replaceState(null, '', location.pathname);
  app.innerHTML = `
    <main class="create">
      <a class="btn-sec back-btn create-back" href="index.html">← <span>Indietro</span></a>
      <div class="create-hero">
        <h1 class="logo logo--xl">GameNight <span class="logo-tag">Show</span></h1>
        <p class="create-lead">Votate i party game dal telefono: la TV svela i voti e fa la classifica.</p>
        <section class="card arm-card" aria-labelledby="armCardTitle">
          <h2 id="armCardTitle">📦 Armadio dei giochi</h2>
          <p class="muted small">I vostri giochi con la foto, indipendenti da gruppi e stanze: preparali quando vuoi, ogni serata li consulta.</p>
          <div class="arm-list" id="armList">
            ${recentArmadi().map((a) => `<button type="button" class="arm-open-btn" data-armopen="${esc(a.id)}">📦 <span>${esc(a.name)}</span><small>${esc(a.id)}</small></button>`).join('') || '<p class="muted small">Ancora nessun armadio su questo computer.</p>'}
          </div>
          <div class="arm-actions" id="armActions">
            <button type="button" class="btn-sec btn-sec--sm" data-armmode="new">➕ <span>Nuovo armadio</span></button>
            <button type="button" class="btn-sec btn-sec--sm" data-armmode="code">🔑 <span>Ho un codice</span></button>
          </div>
          <div class="arm-inline" id="armInline" hidden>
            <label class="sr-only" for="armInlineIn">Nome o codice dell’armadio</label>
            <input class="input input--sm" id="armInlineIn" maxlength="40" autocomplete="off">
            <button type="button" class="btn btn-sec--sm" id="armInlineGo">Apri</button>
          </div>
        </section>
      </div>
      <form class="card create-card" id="createForm">
        <h2>Nuova serata</h2>
        <div class="count-row">
          <span class="field-label" id="countLabel">Giocatori</span>
          <div class="stepper" role="group" aria-labelledby="countLabel">
            <button type="button" class="step-btn" data-step="-1" aria-label="Un giocatore in meno">${ICONS.minus}</button>
            <output id="countOut" aria-live="polite">${S.setupCount}</output>
            <button type="button" class="step-btn" data-step="1" aria-label="Un giocatore in più">${ICONS.plus}</button>
          </div>
          <span class="muted small">da ${MIN_PLAYERS} a ${MAX_PLAYERS}, si cambia anche dopo</span>
        </div>
        <div class="group-field">
          <label class="field-label" for="groupSel">Il vostro gruppo</label>
          <select class="input select" id="groupSel">
            ${recentGroups().map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}
            <option value="__new">Nuovo gruppo…</option>
            <option value="__code">Ho il codice di un gruppo…</option>
          </select>
          <label class="sr-only" for="groupName">Nome del nuovo gruppo</label>
          <input class="input" id="groupName" maxlength="40" autocomplete="off" placeholder="Es. Amici del giovedì" hidden>
          <label class="sr-only" for="groupCode">Codice del gruppo</label>
          <input class="input code-input code-input--6" id="groupCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Codice di 6 caratteri" hidden>
          <p class="muted small">Il gruppo conserva classifica di sempre, profili e foto.</p>
        </div>
        <div class="group-field arm-field">
          <label class="field-label" for="armSel">Giochi dall’armadio</label>
          <select class="input select" id="armSel">
            ${recentArmadi().map((a) => `<option value="${esc(a.id)}">📦 ${esc(a.name)}</option>`).join('')}
            <option value="__new">Nuovo armadio…</option>
            <option value="__code">Ho il codice di un armadio…</option>
          </select>
          <label class="sr-only" for="armName">Nome del nuovo armadio</label>
          <input class="input" id="armName" maxlength="40" autocomplete="off" placeholder="Nome dell’armadio, es. I giochi di Andrea" hidden>
          <label class="sr-only" for="armCode">Codice dell’armadio</label>
          <input class="input code-input code-input--6" id="armCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Codice di 6 caratteri" hidden>
        </div>
        <p class="form-error" id="createErr" role="alert"></p>
        <button class="btn btn-big btn-block" type="submit" id="createBtn">Crea la stanza</button>
        <div class="create-links">
          <button class="link-btn" type="button" id="toResume">Riprendi una serata già iniziata</button>
          <button class="link-btn" type="button" id="demoBtn">🧪 Prova con giocatori finti</button>
        </div>
      </form>
      ${opts.recover ? recoveryHTML(opts.recover) : ''}
      <form class="card create-card" id="resumeForm" novalidate hidden>
        <h2>Riprendi una serata</h2>
        <p class="muted">Per continuare una serata dopo un crash, il giorno dopo, o da un altro computer.</p>
        <div class="recent-rooms" id="recentRooms"></div>
        <div class="resume-fields">
          <div class="field">
            <label class="field-label" for="rsCode">Codice stanza</label>
            <input class="input code-input" id="rsCode" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2" value="${esc(opts.resume || '')}">
          </div>
          <div class="field">
            <label class="field-label" for="rsRegia">Codice regia</label>
            <input class="input code-input code-input--8" id="rsRegia" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" value="${esc(prettyRegia(opts.regia || ''))}">
          </div>
        </div>
        <p class="muted small">Il codice regia serve solo se la serata è stata creata su un altro dispositivo: lo trovi nel pannello Giocatori della TV.</p>
        <p class="form-error" id="rsErr" role="alert"></p>
        <button class="btn btn-big btn-block" type="submit" id="rsBtn">Riprendi la serata</button>
        <button class="link-btn" type="button" id="toCreate">Crea invece una serata nuova</button>
      </form>
    </main>`;

  const showResume = async (on) => {
    $('#createForm').hidden = on;
    $('#resumeForm').hidden = !on;
    if (!on) return;
    const box = $('#recentRooms');
    box.innerHTML = '<p class="muted small">Cerco le serate recenti…</p>';
    const rooms = await recentRooms();
    box.innerHTML = rooms.length ? `<span class="field-label">Serate recenti</span>` + rooms.map((r) => `
      <button type="button" class="recent-room" data-room="${esc(r.code)}">
        <b>${esc(r.group)}</b><span>${esc(r.at ? new Date(r.at).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '')}</span><span class="code-chip code-chip--sm">${esc(r.code)}</span>
      </button>`).join('') : '';
  };
  $('#toResume').addEventListener('click', () => showResume(true));
  $('#toCreate').addEventListener('click', () => showResume(false));
  $('#rsCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
  $('#rsRegia').addEventListener('input', (e) => {
    const v = normalizeCode(e.target.value, 8);
    e.target.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
  });
  $('#recentRooms').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    $('#rsCode').value = b.dataset.room;
    const meta = (await get(roomRef(b.dataset.room, 'meta')).catch(() => null))?.val();
    if (meta?.hostUid === S.uid) { takeOver(b.dataset.room, '').catch((err) => { $('#rsErr').textContent = explainError(err); }); return; }
    const known = regiaCode(b.dataset.room);
    if (known) $('#rsRegia').value = prettyRegia(known);
    $('#rsRegia').focus();
  });
  $('#resumeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#rsBtn');
    btn.disabled = true;
    try {
      await takeOver($('#rsCode').value, $('#rsRegia').value || regiaCode(normalizeCode($('#rsCode').value)));
    } catch (err) {
      $('#rsErr').textContent = explainError(err);
      btn.disabled = false;
    }
  });
  if (opts.resume) {
    showResume(true);
    $('#rsErr').textContent = opts.regia ? 'Codice regia ricevuto: premi "Riprendi la serata" per guidarla da qui.' : 'Questa serata è guidata da un altro dispositivo: per riprenderla da qui serve il codice regia.';
    const known = opts.regia || regiaCode(opts.resume);
    if (known) $('#rsRegia').value = prettyRegia(known);
    setTimeout(() => (opts.regia ? $('#rsBtn') : $('#rsRegia')).focus(), 50);
  }
  if (opts.recover) {
    // La scheda di ripresa sta sopra al modulo per creare la stanza.
    const card = app.querySelector('.recover-card');
    app.querySelector('.create')?.insertBefore(card, $('#createForm'));
    $('#recGo').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await resumeSession(e.currentTarget.dataset.room); } catch (err) { $('#recErr').textContent = explainError(err); e.currentTarget.disabled = false; }
    });
    $('#recNew').addEventListener('click', async (e) => {
      await Vault.close(e.currentTarget.dataset.room).catch(() => {});
      card.remove();
    });
  }

  const sel = $('#groupSel');
  const syncGroup = () => {
    $('#groupName').hidden = sel.value !== '__new';
    $('#groupCode').hidden = sel.value !== '__code';
    $('#createErr').textContent = '';
  };
  if (!recentGroups().length) sel.value = '__new';
  sel.addEventListener('change', () => {
    syncGroup();
    if (sel.value === '__new') $('#groupName').focus();
    if (sel.value === '__code') $('#groupCode').focus();
  });
  $('#groupCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  syncGroup();

  const out = $('#countOut');
  app.querySelectorAll('.step-btn').forEach((b) => b.addEventListener('click', () => {
    S.setupCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, S.setupCount + Number(b.dataset.step)));
    out.textContent = S.setupCount;
  }));
  $('#createForm').addEventListener('submit', (e) => { e.preventDefault(); createRoom(); });
  $('#demoBtn').addEventListener('click', () => createDemo().catch((err) => { $('#createErr').textContent = explainError(err); }));
  const armSel = $('#armSel');
  const syncArm = () => {
    $('#armName').hidden = armSel.value !== '__new';
    $('#armCode').hidden = armSel.value !== '__code';
  };
  if (!recentArmadi().length) armSel.value = '__new';
  // Con un gruppo già usato, si propone l'armadio dell'ultima volta.
  const pickArmForGroup = () => {
    const last = sel.value && !sel.value.startsWith('__') ? localStorage.getItem(groupArmKey(sel.value)) : '';
    if (last && [...armSel.options].some((o) => o.value === last)) { armSel.value = last; syncArm(); }
  };
  sel.addEventListener('change', pickArmForGroup);
  pickArmForGroup();
  armSel.addEventListener('change', () => {
    syncArm();
    if (armSel.value === '__new') $('#armName').focus();
    if (armSel.value === '__code') $('#armCode').focus();
  });
  $('#armCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  // "Crea una serata" dalla pagina dell'armadio: quell'armadio è già scelto
  const usa = normalizeCode(param('usaArmadio') || '', 6);
  if (usa.length === 6) {
    if (![...armSel.options].some((o) => o.value === usa)) {
      const nm = recentArmadi().find((a) => a.id === usa)?.name || usa;
      armSel.insertAdjacentHTML('afterbegin', `<option value="${esc(usa)}">📦 ${esc(nm)}</option>`);
    }
    armSel.value = usa;
  }
  syncArm();
  // Riquadro "Armadio dei giochi": si apre un armadio senza creare la stanza (e senza gruppo).
  let armMode = '';
  const inl = $('#armInline');
  const inlIn = $('#armInlineIn');
  $('#armCardTitle').closest('.arm-card').addEventListener('click', async (e) => {
    const o = e.target.closest('[data-armopen]');
    if (o) { const a = recentArmadi().find((x) => x.id === o.dataset.armopen); if (a) openArmadioById(a.id, a.name); return; }
    const m = e.target.closest('[data-armmode]');
    if (m) {
      armMode = m.dataset.armmode;
      inl.hidden = false;
      inlIn.value = '';
      inlIn.placeholder = armMode === 'new' ? 'Nome, es. I giochi di Andrea' : 'Codice di 6 caratteri';
      inlIn.maxLength = armMode === 'new' ? 40 : 6;
      $('#armInlineGo').textContent = armMode === 'new' ? 'Crea' : 'Apri';
      inlIn.focus();
      return;
    }
    if (e.target.closest('#armInlineGo')) armInlineGo();
  });
  inlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); armInlineGo(); } });
  async function armInlineGo() {
    const err = $('#createErr');
    try {
      if (armMode === 'new') {
        const arm = await createArmadio(cleanName(inlIn.value) || 'I nostri giochi');
        rememberArmadio(arm);
        renderArmadio(arm);
      } else {
        const id = normalizeCode(inlIn.value, 6);
        if (id.length !== 6) throw userError('Il codice dell’armadio ha 6 caratteri.');
        await openArmadioById(id);
      }
    } catch (ex) { err.textContent = explainError(ex); }
  }
  if (opts.armadio) {
    const first = recentArmadi()[0];
    if (first) openArmadioById(first.id, first.name);
    else $('[data-armmode="new"]')?.click();
  }
  setTimeout(() => runTour('create', [
    { sel: '.count-row', title: 'Quanti siete?', text: 'Scegli i posti della stanza: potrai cambiarli in qualsiasi momento, anche a serata iniziata.' },
    { sel: '#groupSel', title: 'Il vostro gruppo', text: 'Il gruppo conserva da una serata all’altra classifica di sempre, profili, foto e statistiche.' },
    { sel: '.arm-card', title: 'L’armadio dei giochi', text: 'I vostri giochi con la foto, indipendenti da gruppi e stanze. Aprilo e riempilo anche giorni prima della serata.' },
    { sel: '#armSel', title: 'Quale armadio consultare', text: 'La stanza sceglie i giochi da questo armadio: con il codice anche un armadio di un altro computer.' },
    { sel: '#createBtn', title: 'Crea la stanza', text: 'La TV mostra un QR: ognuno lo inquadra con il telefono ed entra con nome e personaggio.' },
    { sel: '#demoBtn', title: 'Vuoi provare prima?', text: 'Con i giocatori finti fai una serata di prova da solo: votano da soli, e nulla viene salvato nel gruppo.' },
    { sel: '#toResume', title: 'Serata interrotta?', text: 'Da qui riprendi una serata già iniziata, anche da un altro computer con il codice regia.' }
  ]), 700);
}

// ---------------------------------------------------------------------------
// Modalità prova: una stanza senza gruppo con giocatori finti che votano da soli
// ---------------------------------------------------------------------------

const BOT_NAMES = ['Ada', 'Bruno', 'Carla', 'Dario', 'Elena', 'Furio', 'Gina', 'Ivo'];
const BOT_MOTTOS = ['Stavolta vinco io', 'Gioco per divertirmi (e vincere)', null, 'Le regole le leggo dopo', null];
const BOT_COMMENTS = ['Che risate!', 'Rigiochiamolo subito', 'Troppo lungo', 'Mi hanno tradito', null, null, null];

async function createDemo() {
  let code = null;
  for (let i = 0; i < 12 && !code; i++) { const c = randomCode(); if (!(await get(roomRef(c, 'meta'))).exists()) code = c; }
  if (!code) throw new Error('nessun codice libero');
  // La prova usa l'armadio scelto (solo in lettura: la prova non cambia la collezione).
  const armSel = $('#armSel')?.value || '';
  let arm = null;
  if (/^[A-Z0-9]{6}$/.test(armSel)) {
    const info = (await get(armadioRef(armSel, 'info')).catch(() => null))?.val();
    if (info) arm = { id: armSel, name: info.name };
  }
  await set(roomRef(code, 'meta'), { hostUid: S.uid, maxPlayers: 8, createdAt: serverTimestamp(), demo: true, ...(arm ? { armadioId: arm.id, armadioName: arm.name, armadioReadOnly: true } : {}) });
  if (arm) await copyPicks(code, arm.id);
  const regia = randomCode(8);
  await set(secretRef(code), regia).catch(() => {});
  localStorage.setItem(regiaKey(code), regia);
  await set(roomRef(code, 'state'), { phase: 'lobby', at: serverTimestamp() });
  openRoom(code);
}

const Demo = {
  timers: new Set(),
  pending: new Set(),
  later(key, ms, fn) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
  },
  bots() { return Object.keys(S.players || {}).filter((u) => u.startsWith('bot_')); },
  /** Aggiunge un giocatore finto (colore libero, personaggio a caso). */
  addBot() {
    const used = new Set(Object.values(S.players || {}).map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${Object.keys(S.players || {}).length + 1}`;
    const taken = new Set(activePlayers(S.players).map((p) => p.color));
    const o = avatarOptions(1)[0];
    const uid = `bot_${randomCode(6).toLowerCase()}`;
    if (activePlayers(S.players).length >= (S.meta.maxPlayers || 8)) update(roomRef(S.code, 'meta'), { maxPlayers: Math.min(MAX_PLAYERS, (S.meta.maxPlayers || 8) + 1) }).catch(() => {});
    return set(roomRef(S.code, `players/${uid}`), {
      name, style: o.style, seed: o.seed, color: PLAYER_COLORS.find((c) => !taken.has(c)) || PLAYER_COLORS[0],
      motto: BOT_MOTTOS[Math.floor(Math.random() * BOT_MOTTOS.length)], joinedAt: serverTimestamp()
    }).catch((err) => toast(explainError(err), 'error'));
  },
  /** Ogni aggiornamento: i finti entrano, pronosticano e votano come farebbero le persone. */
  tick() {
    if (!S.meta?.demo) return;
    const bots = this.bots();
    const phase = S.state?.phase;
    if (phase === 'lobby' && bots.length < 4) this.later(`join${bots.length}`, 900 + bots.length * 700, () => this.addBot());
    const st = S.state || {};
    if (phase === 'idle' && st.playId) {
      const live = activePlayers(S.players);
      for (const b of bots) {
        if (S.bets?.[st.playId]?.[b]) continue;
        this.later(`bet${st.playId}${b}`, 1500 + Math.random() * 3500, () => {
          const pick = live[Math.floor(Math.random() * live.length)];
          if (pick && S.state?.playId === st.playId) set(roomRef(S.code, `bets/${st.playId}/${b}`), pick.uid).catch(() => {});
        });
      }
    }
    if (phase === 'voting' && st.gameId && !st.paused) {
      const gid = st.gameId;
      const g = S.games[gid];
      if (!g) return;
      const crits = g.quick ? [] : activeCriteria(S.meta.voting);
      for (const b of bots) {
        if (S.votes?.[gid]?.[b] || S.players[b]?.away) continue;
        this.later(`vote${gid}${b}`, 1200 + Math.random() * 4500, () => {
          if (S.state?.phase !== 'voting' || S.state?.gameId !== gid) return;
          const r = (a, z) => a + Math.floor(Math.random() * (z - a + 1));
          const mates = activePlayers(S.players).filter((p) => p.uid !== b && (!g.players || g.players[p.uid]));
          const v = { overall: r(4, 10), at: serverTimestamp() };
          for (const c of crits) v[c.key] = r(1, 5);
          if (mates.length) v.mvp = mates[r(0, mates.length - 1)].uid;
          const cm = BOT_COMMENTS[r(0, BOT_COMMENTS.length - 1)];
          if (cm) v.comment = cm;
          if (Math.random() < 0.5) v.guess = r(10, 18) / 2;
          set(roomRef(S.code, `votes/${gid}/${b}`), v).catch(() => {});
        });
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Armadio dei giochi prima della serata (senza stanza)
// ---------------------------------------------------------------------------

const Armadio = { stops: [] };

/** Nome del gruppo scelto (per dare un nome di partenza al nuovo armadio). */
function chosenGroupName() {
  const sel = $('#groupSel');
  if (!sel) return '';
  if (sel.value === '__new') return cleanName($('#groupName')?.value || '');
  if (sel.value === '__code') return '';
  return sel.selectedOptions[0]?.textContent || '';
}

/** Crea un armadio nuovo (di questo computer). */
async function createArmadio(name) {
  let id = null;
  for (let i = 0; i < 12 && !id; i++) {
    const candidate = randomCode(6);
    if (!(await get(armadioRef(candidate, 'info'))).exists()) id = candidate;
  }
  if (!id) throw new Error('nessun codice libero');
  await set(armadioRef(id, 'info'), { name, ownerUid: S.uid, createdAt: serverTimestamp() });
  return { id, name, isNew: true };
}

/** Apre un armadio esistente (dal suo codice) come pagina. */
async function openArmadioById(id, knownName = '') {
  const info = (await get(armadioRef(id, 'info'))).val();
  if (!info) { forgetArmadio(id); throw userError('Nessun armadio con questo codice.'); }
  const arm = { id, name: info.name || knownName };
  rememberArmadio(arm);
  renderArmadio(arm);
}

/** L'armadio scelto nella schermata iniziale: esistente, nuovo, o di un altro computer (con il codice). */
async function resolveArmadio() {
  const choice = $('#armSel')?.value || '__new';
  if (choice === '__new') {
    const g = chosenGroupName();
    const name = cleanName($('#armName')?.value || '') || (g ? `Giochi di ${g}` : 'I nostri giochi');
    const arm = await createArmadio(name);
    // Il gruppo aveva già dei giochi (versioni precedenti): passano nel nuovo armadio.
    const gid = $('#groupSel')?.value;
    if (gid && /^[A-Z0-9]{6}$/.test(gid)) await copyGroupGames(gid, arm.id);
    return arm;
  }
  const id = choice === '__code' ? normalizeCode($('#armCode').value, 6) : choice;
  if (id.length !== 6) throw userError('Il codice dell’armadio ha 6 caratteri.');
  const info = (await get(armadioRef(id, 'info'))).val();
  if (!info) {
    forgetArmadio(id);
    throw userError(choice === '__code' ? 'Nessun armadio con questo codice.' : 'Questo armadio non esiste più: creane uno nuovo.');
  }
  return { id, name: info.name };
}

/** Copia i giochi salvati nel gruppo (prima che esistessero gli armadi) in un armadio nuovo. */
async function copyGroupGames(gid, aid) {
  const legacy = (await get(groupRef(gid, 'library')).catch(() => null))?.val();
  if (!legacy || typeof legacy !== 'object' || !Object.keys(legacy).length) return 0;
  await update(armadioRef(aid, 'library'), legacy).catch((err) => console.warn('Giochi del gruppo non copiati', err));
  return Object.keys(legacy).length;
}

/** L'armadio ha la sua pagina (1.2): ricerca, filtri, posizioni, prestiti, cronologia, condivisione. */
function renderArmadio(arm) {
  location.href = `armadio.html?a=${encodeURIComponent(arm.id)}${arm.isNew ? '&add=1' : ''}`;
}

async function resolveGroup() {
  const choice = $('#groupSel').value;
  if (choice === '__new') {
    const name = cleanName($('#groupName').value);
    if (!name) throw userError('Dai un nome al gruppo, es. "Amici del giovedì".');
    let id = null;
    for (let i = 0; i < 12 && !id; i++) {
      const candidate = randomCode(6);
      if (!(await get(groupRef(candidate, 'info'))).exists()) id = candidate;
    }
    if (!id) throw new Error('nessun codice libero');
    await set(groupRef(id, 'info'), { name, ownerUid: S.uid, createdAt: serverTimestamp() });
    return { id, name };
  }
  const id = choice === '__code' ? normalizeCode($('#groupCode').value, 6) : choice;
  if (id.length !== 6) throw userError('Il codice del gruppo ha 6 caratteri.');
  const info = (await get(groupRef(id, 'info'))).val();
  if (!info) {
    forgetGroup(id);
    throw userError(choice === '__code' ? 'Nessun gruppo con questo codice.' : 'Questo gruppo non esiste più: creane uno nuovo.');
  }
  return { id, name: info.name };
}

async function createRoom() {
  const btn = $('#createBtn');
  btn.disabled = true;
  btn.textContent = 'Creo la stanza…';
  try {
    const group = await resolveGroup();
    rememberGroup(group);
    const arm = await resolveArmadio();
    if (arm.isNew && $('#groupSel')?.value === '__new') await copyGroupGames(group.id, arm.id);
    rememberArmadio({ id: arm.id, name: arm.name });
    try { localStorage.setItem(groupArmKey(group.id), arm.id); } catch { /* niente */ }
    let code = null;
    for (let i = 0; i < 12 && !code; i++) {
      const candidate = randomCode();
      const snap = await get(roomRef(candidate, 'meta'));
      if (!snap.exists()) code = candidate;
    }
    if (!code) throw new Error('nessun codice libero');
    await set(roomRef(code, 'meta'), {
      hostUid: S.uid, maxPlayers: S.setupCount, createdAt: serverTimestamp(),
      groupId: group.id, groupName: group.name, soundboard: true,
      armadioId: arm.id, armadioName: arm.name
    });
    // Le stelline "Stasera" preparate nell'armadio diventano la scelta di questa serata.
    await copyPicks(code, arm.id);
    const regia = randomCode(8);
    await set(secretRef(code), regia);
    localStorage.setItem(regiaKey(code), regia);
    await set(roomRef(code, 'state'), { phase: 'lobby', at: serverTimestamp() });
    await set(groupRef(group.id, `rooms/${code}`), { at: serverTimestamp() }).catch(() => {});
    openRoom(code);
  } catch (err) {
    $('#createErr').textContent = explainError(err);
    btn.disabled = false;
    btn.textContent = 'Crea la stanza';
  }
}

function openRoom(code) {
  S.code = code;
  loadDraft();
  localStorage.setItem(STORE_KEY, code);
  history.replaceState(null, '', `${location.pathname}?room=${code}`);
  app.innerHTML = loadingHTML('Apro la stanza…');
  for (const key of WATCHED) {
    onValue(roomRef(code, key), (snap) => {
      const val = snap.val();
      S[key] = (key === 'meta' || key === 'state' || key === 'pendingImage' || key === 'poll') ? val : (val || {});
      S.loaded.add(key);
      render();
    }, (err) => showFatal(app, 'Connessione alla stanza persa', explainError(err)));
  }
  requestWakeLock();
  trackConnection(connectionStatus);
  // Battito: i telefoni capiscono se la pagina della TV si è bloccata.
  const beat = () => { if (S.meta?.hostUid === S.uid) set(roomRef(code, 'heartbeat'), serverTimestamp()).catch(() => {}); };
  beat();
  setInterval(beat, 5000);
  // Battito dei telefoni, copie locali a ogni mossa e un'istantanea al minuto.
  Beats.start(code);
  askPersistence();
  loadDoneCommands();
  setInterval(() => Save.tick(), 60000);
  setInterval(paintClock, 15000);
  S.lastInput = Date.now();
  setInterval(checkAutoInterval, 15000);
}

// ---------------------------------------------------------------------------
// Salvataggi della serata: cassaforte locale (IndexedDB), istantanee,
// macchina del tempo, backup di emergenza con versione del formato
// ---------------------------------------------------------------------------

const PHASE_LABEL = {
  lobby: 'lobby', idle: 'scelta del prossimo gioco', voting: 'votazione', reveal: 'reveal', board: 'classifica',
  poll: 'sondaggio', awards: 'premiazione', alltime: 'classifica di sempre'
};

/** Copia della serata. Senza foto (withImages=false) le immagini dei giochi restano segnate come "__img". */
function backupData(withImages = false) {
  const games = Object.fromEntries(Object.entries(S.games || {}).map(([id, g]) => [id, withImages || !g?.image ? g : { ...g, image: '__img' }]));
  const players = withImages ? S.players : Object.fromEntries(Object.entries(S.players || {}).map(([uid, p]) => [uid, p?.photo ? { ...p, photo: '__img' } : p]));
  const m = S.meta || {};
  return {
    app: 'GameNight_Show', kind: 'night', room: S.code, at: Date.now(), number: nightNumber(),
    meta: { maxPlayers: m.maxPlayers || null, groupId: m.groupId || null, groupName: m.groupName || null, createdAt: Number(m.createdAt) || null, voting: m.voting || null, chaos: m.chaos || null },
    state: S.state || null, players, games, votes: S.votes || {}
  };
}

/** Firma veloce dei dati che contano (senza foto), per capire se qualcosa è cambiato. */
function dataSig() {
  return checksum(JSON.stringify([S.state, Object.entries(S.games || {}).map(([id, g]) => [id, g?.name, g?.status, g?.winners, g?.players]), S.votes, Object.entries(S.players || {}).map(([u, p]) => [u, p?.name, p?.away])]));
}

const Save = {
  timer: null,
  lastAt: 0,
  lastSum: null,
  fallback: false,
  snapSig: null,
  /** Salvataggio a ogni mossa (raggruppato ogni secondo e mezzo). */
  touch() {
    if (this.timer || !S.code || !S.meta) return;
    this.timer = setTimeout(() => { this.timer = null; this.now(); }, 1500);
  },
  async now() {
    if (!S.code || !S.meta) return;
    try {
      const games = Object.values(S.games || {});
      const r = await Vault.saveCurrent(S.code, backupData(true), {
        group: S.meta.groupName || '', games: games.filter((g) => g?.status === 'revealed').length,
        players: activePlayers(S.players).length, number: nightNumber(), phase: S.state?.phase || 'lobby'
      });
      this.lastAt = r.same ? (this.lastAt || r.at) : r.at;
      this.lastSum = r.sum;
      ToolsPanel.paintSave?.();
    } catch (err) { console.warn('Salvataggio locale non riuscito', err); }
  },
  /** Istantanea con un'etichetta. Le azioni rischiose la aspettano al massimo un attimo. */
  snap(label, kind = 'risk') {
    if (!S.code || !S.meta) return Promise.resolve();
    const p = Vault.snapshot(S.code, label, backupData(false), kind).catch(() => null);
    this.snapSig = dataSig();
    if (kind !== 'auto') logEvent(`Istantanea: ${label}`, '📸');
    return Promise.race([p, new Promise((r) => setTimeout(r, 700))]);
  },
  /** Ogni minuto, se la serata è cambiata, un'istantanea automatica. */
  tick() {
    if (!S.code || !S.meta || S.state?.phase === 'lobby') return;
    const sig = dataSig();
    if (sig === this.snapSig) return;
    this.snap('Salvataggio automatico', 'auto');
  }
};

function logEvent(text, icon = '•') {
  if (S.code) Vault.log(S.code, text, icon).catch(() => {});
}

/** Cronologia: chi entra, chi vota, chi cambia il voto, cosa succede nella serata. */
function trackEvents() {
  const prev = S.ev;
  const votes = {};
  for (const [gid, gv] of Object.entries(S.votes || {})) for (const [uid, v] of Object.entries(gv || {})) votes[`${gid}|${uid}`] = `${v?.overall}|${v?.at}`;
  const now = {
    players: Object.fromEntries(Object.entries(S.players || {}).map(([u, p]) => [u, p?.away ? 'away' : 'in'])),
    votes, phase: S.state?.phase, game: S.state?.gameId, play: S.state?.playStart
  };
  S.ev = now;
  if (!prev) return;
  const name = (uid) => S.players[uid]?.name || 'Qualcuno';
  const gname = (gid) => S.games[gid]?.name || 'un gioco';
  for (const [u, st] of Object.entries(now.players)) {
    if (!prev.players[u]) logEvent(`Entra nella serata: ${name(u)}`, '👋');
    else if (prev.players[u] !== st) logEvent(st === 'away' ? `Esce dalla serata: ${name(u)}` : `Rientra: ${name(u)}`, st === 'away' ? '🚪' : '↩️');
  }
  for (const u of Object.keys(prev.players)) if (!now.players[u] && !S.meta?.banned?.[u]) logEvent('Un giocatore è stato tolto dalla stanza (o ha cambiato telefono)', '➖');
  for (const [k, sig] of Object.entries(votes)) {
    const [gid, uid] = k.split('|');
    if (!prev.votes[k]) logEvent(`${name(uid)} ha votato ${gname(gid)}`, '🗳️');
    else if (prev.votes[k] !== sig) logEvent(`${name(uid)} ha modificato il voto a ${gname(gid)}`, '✏️');
  }
  if (now.play && now.play !== prev.play && S.state?.playName) logEvent(`Partita iniziata: ${S.state.playName}`, '⏱️');
  if (now.phase !== prev.phase || now.game !== prev.game) {
    const g = S.games[now.game];
    const label = now.phase === 'voting' && g ? `Votazione aperta: ${g.name}` : now.phase === 'reveal' && g ? `Reveal: ${g.name}` : `Fase: ${PHASE_LABEL[now.phase] || now.phase}`;
    logEvent(label, now.phase === 'reveal' ? '🎉' : now.phase === 'voting' ? '🔓' : '➡️');
  }
}

/** Rimette la serata com'era in un'istantanea (che sia del database o del file). */
async function applySnapshot(data) {
  const patch = {};
  const gids = new Set([...Object.keys(S.games || {}), ...Object.keys(data.games || {})]);
  for (const gid of gids) {
    const g = data.games?.[gid];
    patch[`games/${gid}`] = g ? { ...g, image: g.image === '__img' ? (S.games[gid]?.image || S.trash?.[gid]?.game?.image || null) : (g.image || null) } : null;
    patch[`votes/${gid}`] = g ? (data.votes?.[gid] || null) : null;
  }
  for (const [uid, p] of Object.entries(data.players || {})) {
    if (!p?.name) continue;
    const photo = p.photo === '__img' ? (S.players[uid]?.photo || null) : (p.photo || null);
    if (!S.players[uid]) patch[`players/${uid}`] = { ...p, photo };
    else if (Boolean(S.players[uid].away) !== Boolean(p.away)) patch[`players/${uid}/away`] = p.away || null;
  }
  const st = data.state && typeof data.state === 'object' ? { ...data.state } : { phase: 'idle' };
  if (['voting', 'reveal'].includes(st.phase) && !data.games?.[st.gameId]) st.phase = 'idle';
  if (st.phase === 'poll') st.phase = 'idle';
  st.at = serverTimestamp();
  if (S.state?.paused) { st.paused = true; st.pausedAt = S.state.pausedAt || null; }
  patch.state = st;
  await update(roomRef(S.code, ''), patch);
  saveNight();
}

/** Ripristino da file: aggiunge giochi, voti e giocatori mancanti (non tocca quelli che ci sono). */
async function restoreBackup(data) {
  const patch = {};
  for (const [uid, p] of Object.entries(data.players || {})) if (!S.players[uid] && p?.name) patch[`players/${uid}`] = { ...p, photo: p.photo === '__img' ? null : (p.photo || null) };
  for (const [gid, g] of Object.entries(data.games || {})) {
    if (!S.games[gid]) patch[`games/${gid}`] = { ...g, image: g.image === '__img' ? null : (g.image || null), status: g.status === 'voting' ? 'revealed' : (g.status || 'revealed') };
    for (const [uid, v] of Object.entries(data.votes?.[gid] || {})) if (!S.votes?.[gid]?.[uid]) patch[`votes/${gid}/${uid}`] = v;
  }
  if (!Object.keys(patch).length) { toast('Niente da ripristinare: la serata contiene già tutto.'); return; }
  await Save.snap('Prima di importare una copia');
  await update(roomRef(S.code, ''), patch);
  saveNight();
  logEvent('Copia importata da file', '📥');
  toast('Copia ripristinata');
}

/** Controlla un file e, se va bene, lo importa. */
async function importBackupFile(file) {
  const text = await file.text();
  const res = validateBackup(text, 'night');
  if (!res.ok) { alert(`File corrotto o non valido:\n\n• ${res.errors.join('\n• ')}`); return; }
  const warn = res.warnings.length ? `\n\nAttenzione:\n• ${res.warnings.join('\n• ')}` : '';
  if (res.tampered && !confirm(`Il file è stato modificato a mano dopo il salvataggio.${warn}\n\nLa struttura è corretta: importarlo comunque?`)) return;
  if (!res.tampered && !confirm(`Ripristinare giochi, voti e giocatori mancanti da questo file?${warn}`)) return;
  await restoreBackup(res.data);
}

function emergencyFileName() {
  const n = nightNumber();
  return `gamenight_${n || S.code}_backup_${new Date().toISOString().slice(0, 10)}.json`;
}
function downloadEmergency() {
  downloadFile(emergencyFileName(), JSON.stringify(sealBackup(backupData(true))), 'application/json');
  logEvent('Backup di emergenza scaricato', '💾');
}

/** Backup completo del gruppo: armadio, serate, identità (e le foto, se richieste). */
async function groupBackup(withPhotos = false) {
  const gid = S.meta?.groupId;
  if (!gid) return;
  const read = async (path) => (await get(groupRef(gid, path))).val();
  const [info, identity, library, nights, next, photos] = await Promise.all([read('info'), read('identity'), S.meta?.armadioId ? get(libRef()).then((x) => x.val()) : read('library'), read('nights'), read('next'), withPhotos ? read('photos') : null]);
  // Dalla 1.2 le foto grandi dell'armadio stanno a parte: con "anche le foto" si salvano anche quelle
  const armadioImages = withPhotos && S.meta?.armadioId ? (await get(armadioRef(S.meta.armadioId, 'images')).catch(() => null))?.val() || null : null;
  const body = sealBackup({ app: 'GameNight_Show', kind: 'group', at: Date.now(), group: { id: gid, name: info?.name || S.meta.groupName || '' }, info, identity, library, nights, next, photos: photos || null, armadioImages });
  downloadFile(`gamenight_gruppo_${gid}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(body), 'application/json');
  logEvent('Backup del gruppo scaricato', '🗄️');
}

/** Rimette nel gruppo i giochi e le serate che mancano (non sovrascrive niente). */
async function restoreGroupFile(file) {
  const res = validateBackup(await file.text(), 'group');
  if (!res.ok) { alert(`File corrotto o non valido:\n\n• ${res.errors.join('\n• ')}`); return; }
  const d = res.data;
  const gid = S.meta?.groupId;
  if (d.group.id !== gid && !confirm(`Questo backup è del gruppo ${d.group.name || d.group.id}, non di quello di stasera. Importare comunque armadio e serate qui?`)) return;
  if (res.tampered && !confirm('Il file è stato modificato a mano dopo il salvataggio. Importarlo comunque?')) return;
  let lib = 0, nights = 0, failed = 0;
  for (const [id, it] of Object.entries(d.library || {})) {
    if (S.library?.[id]) continue;
    try {
      await set(libRef(id), it); lib++;
      const big = d.armadioImages?.[id];
      if (S.meta?.armadioId && typeof big === 'string' && big.startsWith('data:image/')) await set(armadioRef(S.meta.armadioId, `images/${id}`), big).catch(() => {});
    } catch { failed++; }
  }
  for (const [room, n] of Object.entries(d.nights || {})) {
    if (S.nights?.[room]) continue;
    try { await set(groupRef(gid, `nights/${room}`), n); nights++; } catch { failed++; }
  }
  if (!S.identity?.emblem && !S.identity?.logo && d.identity) await set(groupRef(gid, 'identity'), d.identity).catch(() => { failed++; });
  toast(`Ripristinati ${lib} giochi e ${nights} serate${failed ? ` (${failed} non consentiti: serve il computer che ha creato il gruppo)` : ''}`, failed ? 'warn' : 'info');
}

/** Macchina del tempo: cronologia della serata e ripristino delle istantanee. */
const TimeMachine = {
  el: null,
  isOpen() { return Boolean(this.el); },
  async open() {
    if (this.el || !S.code) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="tmTitle">
        <div class="panel-head"><h2 id="tmTitle">Macchina del tempo</h2>
          <div class="rg-row"><button type="button" class="btn-sec btn-sec--sm" id="tmSnap">📸 <span>Istantanea adesso</span></button>
          <button type="button" class="icon-btn" id="tmClose" aria-label="Chiudi">${ICONS.x}</button></div></div>
        <p class="panel-note" id="tmStatus">Leggo le copie su questo computer…</p>
        <ol class="tm-list" id="tmList"></ol>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#tmClose')) { this.close(); return; }
      if (e.target.closest('#tmSnap')) { await Save.snap('Istantanea manuale', 'manual'); this.paint(); return; }
      const r = e.target.closest('[data-tmrestore]');
      if (!r) return;
      const label = r.dataset.label || 'questa istantanea';
      if (!confirm(`Rimettere la serata com’era ${label}?\n\nGiochi, voti, vincitori e fase tornano a quel momento. Prima di farlo salvo un’istantanea dello stato attuale, così puoi tornare indietro.`)) return;
      r.disabled = true;
      try {
        const data = await Vault.getSnapshot(Number(r.dataset.tmrestore));
        if (!data) throw userError('Questa istantanea è rovinata: scegline un’altra.');
        await Save.snap('Prima del ripristino');
        await applySnapshot(data);
        logEvent(`Serata ripristinata ${label}`, '⏪');
        toast('Serata ripristinata');
        this.close();
      } catch (err) { toast(explainError(err), 'error'); r.disabled = false; }
    });
    this.paint();
  },
  async paint() {
    if (!this.el) return;
    const [snaps, logs, slots] = await Promise.all([Vault.snapshots(S.code), Vault.logs(S.code, 120), Vault.slots(S.code)]);
    if (!this.el) return;
    const t = (at) => new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const okSlots = slots.filter((s) => s.ok);
    const cur = slots.find((s) => s.slot === 'current');
    $('#tmStatus', this.el).innerHTML = Vault.available
      ? `Autosave ${cur?.ok ? '✔' : '⚠️'} <b>${cur ? t(cur.at) : '—'}</b> · Copie a rotazione integre: <b>${okSlots.length}/${slots.length || 4}</b> · Ultimo stato valido: <b>${okSlots[0] ? t(okSlots[0].at) : '—'}</b>`
      : 'Questo browser non permette di salvare le copie (navigazione privata?): restano il backup di emergenza e il database.';
    const rows = [
      ...snaps.map((s) => ({ at: s.at, html: `<li class="tm-row tm-row--snap ${s.ok ? '' : 'is-bad'}"><span class="tm-time">${t(s.at)}</span><span class="tm-text">📸 <b>${esc(s.label)}</b>${s.kind === 'auto' ? ' <span class="muted small">automatica</span>' : ''}</span>${s.ok ? `<button type="button" class="btn-sec btn-sec--sm" data-tmrestore="${s.id}" data-label="alle ${t(s.at)} (${esc(s.label.toLowerCase())})">Ripristina stato</button>` : '<span class="muted small">rovinata</span>'}</li>` })),
      ...logs.filter((l) => !String(l.text).startsWith('Istantanea:')).map((l) => ({ at: l.at, html: `<li class="tm-row"><span class="tm-time">${t(l.at)}</span><span class="tm-text">${esc(l.icon)} ${esc(l.text)}</span></li>` }))
    ].sort((a, b) => b.at - a.at).slice(0, 160);
    $('#tmList', this.el).innerHTML = rows.length ? rows.map((r) => r.html).join('') : '<li class="muted">Ancora niente: la cronologia si riempie mentre giocate.</li>';
  },
  close() { this.el?.remove(); this.el = null; }
};

// ---------------------------------------------------------------------------
// Controllo integrità della serata
// ---------------------------------------------------------------------------

function voteInRange(v) {
  const n = (x, a, b) => typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b;
  if (!v || !n(v.overall, 1, 10)) return false;
  for (const k of ['coinv', 'sempl', 'rigioc', 'c1', 'c2']) if (v[k] !== undefined && v[k] !== null && !n(v[k], 1, 5)) return false;
  return v.guess === undefined || v.guess === null || n(v.guess, 1, 10);
}

/** Tutti i controlli: ognuno con livello ok / info / warn / error ed eventuale correzione. */
function integrityChecks() {
  const out = [];
  const players = S.players || {};
  const games = S.games || {};
  const votes = S.votes || {};
  const active = activePlayers(players);
  const away = Object.values(players).filter((p) => p?.away).length;
  const badP = Object.entries(players).filter(([, p]) => !p?.name || !p.style || !p.seed || !/^#[0-9A-Fa-f]{6}$/.test(p.color || ''));
  const names = {};
  for (const p of active) (names[nameKey(p.name)] ||= []).push(p.name);
  const dupNames = Object.values(names).filter((l) => l.length > 1).map((l) => l[0]);
  const mids = {};
  for (const p of active) if (p.memberId) (mids[p.memberId] ||= []).push(p.name);
  const dupMid = Object.values(mids).filter((l) => l.length > 1).map((l) => l[0]);
  out.push({
    id: 'players', label: 'Giocatori', level: badP.length ? 'error' : dupNames.length || dupMid.length ? 'warn' : 'ok',
    text: `${active.length} in partita${away ? `, ${away} usciti` : ''}${badP.length ? ` · ${badP.length} con dati rovinati` : ''}${dupNames.length ? ` · nome doppio: ${dupNames.join(', ')}` : ''}${dupMid.length ? ` · stesso profilo su due telefoni: ${dupMid.join(', ')}` : ''}`,
    fix: badP.length ? () => Object.fromEntries(badP.filter(([, p]) => !p?.name).map(([u]) => [`players/${u}`, null]).concat(badP.filter(([, p]) => p?.name).map(([u, p]) => [`players/${u}/color`, /^#[0-9A-Fa-f]{6}$/.test(p.color || '') ? p.color : PLAYER_COLORS[0]]))) : null
  });
  let total = 0;
  const orphanGame = [];
  const orphanPlayer = [];
  const outRange = [];
  for (const [gid, gv] of Object.entries(votes)) {
    if (!games[gid]) { orphanGame.push(gid); continue; }
    for (const [uid, v] of Object.entries(gv || {})) {
      total++;
      if (!players[uid]) orphanPlayer.push([gid, uid]);
      else if (!voteInRange(v)) outRange.push([gid, uid]);
    }
  }
  const curGid = S.state?.phase === 'voting' ? S.state.gameId : null;
  const curVotes = curGid ? Object.keys(votes[curGid] || {}).length : null;
  const vErr = orphanGame.length + orphanPlayer.length + outRange.length;
  out.push({
    id: 'votes', label: 'Voti', level: vErr ? 'error' : 'ok',
    text: `${total} voti${curGid ? ` · votazione in corso: ${curVotes}/${expectedVoters(votes[curGid] || {}).length}` : ''}${orphanPlayer.length ? ` · ${orphanPlayer.length} di giocatori che non ci sono più` : ''}${orphanGame.length ? ` · voti di ${orphanGame.length} ${orphanGame.length === 1 ? 'gioco cancellato' : 'giochi cancellati'}` : ''}${outRange.length ? ` · ${outRange.length} fuori scala` : ''}`,
    fix: vErr ? () => Object.fromEntries([...orphanGame.map((g) => [`votes/${g}`, null]), ...[...orphanPlayer, ...outRange].map(([g, u]) => [`votes/${g}/${u}`, null])]) : null
  });
  const stuck = Object.entries(games).filter(([gid, g]) => g?.status === 'voting' && gid !== curGid);
  const unknown = Object.entries(games).filter(([, g]) => g?.status && !['voting', 'revealed'].includes(g.status));
  const empty = Object.entries(games).filter(([gid, g]) => g?.status === 'revealed' && !Object.keys(votes[gid] || {}).length);
  out.push({
    id: 'games', label: 'Giochi', level: stuck.length || unknown.length ? 'error' : empty.length ? 'warn' : 'ok',
    text: `${Object.keys(games).length} ${Object.keys(games).length === 1 ? 'gioco' : 'giochi'}${stuck.length ? ` · ${stuck.length} con la votazione rimasta aperta` : ''}${unknown.length ? ` · ${unknown.length} in uno stato sconosciuto` : ''}${empty.length ? ` · senza voti: ${empty.map(([, g]) => g.name).join(', ')}` : ''}`,
    fix: stuck.length || unknown.length ? () => Object.fromEntries([...stuck, ...unknown].map(([gid]) => [`games/${gid}/status`, 'revealed'])) : null
  });
  const noWinner = Object.values(games).filter((g) => g?.status === 'revealed' && !Object.keys(g.winners || {}).length).map((g) => g.name);
  out.push({ id: 'winners', label: 'Vincitori', level: noWinner.length ? 'info' : 'ok', text: noWinner.length ? `Partite senza vincitore: ${noWinner.join(', ')} (si segnano con "Correggi" in classifica)` : 'Ogni partita ha il suo vincitore' });
  const crits = activeCriteria(S.meta?.voting).filter((c) => !c.custom);
  let missing = 0;
  for (const [gid, gv] of Object.entries(votes)) {
    if (!games[gid] || games[gid].quick) continue;
    for (const v of Object.values(gv || {})) if (v && !v.byHost && crits.some((c) => v[c.key] === undefined || v[c.key] === null)) missing++;
  }
  out.push({ id: 'crit', label: 'Criteri', level: missing ? 'info' : 'ok', text: missing ? `${missing} voti senza qualche criterio ("Non giudico" o voti dalle versioni precedenti)` : 'Validi' });
  const noTime = Object.values(games).filter((g) => g && !g.createdAt && !g.order).length;
  out.push({ id: 'time', label: 'Orari', level: !S.meta?.createdAt || noTime ? 'warn' : 'ok', text: !S.meta?.createdAt ? 'La serata non ha l’ora di inizio' : noTime ? `${noTime} giochi senza orario` : 'Ogni passaggio ha il suo orario' });
  let boardOk = true;
  try {
    const b = buildBoard(games, votes);
    boardOk = b.every((r, i) => r.stats.avg >= 1 && r.stats.avg <= 10 && (i === 0 || r.rank >= b[i - 1].rank));
  } catch { boardOk = false; }
  out.push({ id: 'board', label: 'Classifica', level: boardOk ? 'ok' : 'error', text: boardOk ? 'Coerente' : 'Non si riesce a calcolare: correggi i voti segnalati' });
  const age = Save.lastAt ? Date.now() - Save.lastAt : null;
  out.push({ id: 'backup', label: 'Backup', level: !Vault.available ? 'warn' : age !== null && age < 180000 ? 'ok' : 'warn', text: !Vault.available ? 'Copie locali non disponibili in questo browser: scarica il backup di emergenza' : age !== null ? `Disponibile, ultimo salvataggio alle ${new Date(Save.lastAt).toLocaleTimeString('it-IT')}` : 'Nessun salvataggio locale ancora' });
  return out;
}

const IntegrityPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  /** onContinue: se c'è, il pannello fa da "cancello" prima di un passaggio (es. premiazione). */
  open(onContinue = null, title = 'Controllo integrità') {
    this.close();
    this.onContinue = onContinue;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="icTitle">
        <div class="panel-head"><h2 id="icTitle">🔎 ${esc(title)}</h2><button type="button" class="icon-btn" id="icClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <ul class="ic-list" id="icList"></ul>
        <p class="ic-summary" id="icSummary"></p>
        <div class="claim-actions" id="icActions"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#icClose') || e.target.closest('#icCancel')) { this.close(); return; }
      if (e.target.closest('#icFix')) {
        const patch = {};
        for (const c of this.checks) if (c.fix && c.level === 'error') Object.assign(patch, c.fix());
        try {
          await Save.snap('Prima delle correzioni automatiche');
          await update(roomRef(S.code, ''), patch);
          saveNight();
          logEvent('Correzioni automatiche dal controllo integrità', '🩺');
          toast('Problemi corretti');
          setTimeout(() => this.paint(), 400);
        } catch (err) { toast(explainError(err), 'error'); }
        return;
      }
      if (e.target.closest('#icGo')) { const go = this.onContinue; this.close(); go?.(); }
    });
    this.paint();
  },
  paint() {
    if (!this.el) return;
    this.checks = integrityChecks();
    const ico = { ok: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' };
    $('#icList', this.el).innerHTML = this.checks.map((c) => `<li class="ic-row ic-row--${c.level}"><span class="ic-ico" aria-hidden="true">${ico[c.level]}</span><b>${esc(c.label)}</b><span>${esc(c.text)}</span></li>`).join('');
    const errors = this.checks.filter((c) => c.level === 'error');
    const fixable = errors.filter((c) => c.fix);
    $('#icSummary', this.el).innerHTML = errors.length ? `<b>${errors.length} ${errors.length === 1 ? 'problema' : 'problemi'} da correggere</b>` : '<b class="ic-ready">SESSIONE PRONTA</b>';
    $('#icActions', this.el).innerHTML = `
      ${fixable.length ? '<button type="button" class="btn-sec" id="icFix">🩺 <span>Correggi automaticamente</span></button>' : ''}
      ${this.onContinue ? `<button type="button" class="btn-sec" id="icCancel">Annulla</button><button type="button" class="btn btn-big" id="icGo">${errors.length ? 'Continua comunque' : 'Continua'}</button>` : ''}`;
  },
  close() { this.el?.remove(); this.el = null; this.onContinue = null; }
};

/** Prima di un passaggio importante: se il controllo trova errori, chiede cosa fare. */
function guarded(title, go) {
  const errors = integrityChecks().filter((c) => c.level === 'error');
  if (!errors.length) { go(); return; }
  IntegrityPanel.open(go, title);
}

// ---------------------------------------------------------------------------
// Ripresa dopo un crash
// ---------------------------------------------------------------------------

/** Ricrea la serata dal salvataggio locale (stesso codice, se è ancora libero). */
async function recreateFromVault(room) {
  const saved = await Vault.loadCurrent(room);
  if (!saved?.data) throw userError('La copia locale non è più leggibile.');
  const d = saved.data;
  let code = room;
  if ((await get(roomRef(code, 'meta'))).exists()) {
    code = null;
    for (let i = 0; i < 12 && !code; i++) { const c = randomCode(); if (!(await get(roomRef(c, 'meta'))).exists()) code = c; }
    if (!code) throw new Error('nessun codice libero');
  }
  const m = d.meta || {};
  await set(roomRef(code, 'meta'), {
    hostUid: S.uid, maxPlayers: m.maxPlayers || DEFAULT_PLAYERS, createdAt: m.createdAt || serverTimestamp(),
    groupId: m.groupId || null, groupName: m.groupName || null, voting: m.voting || null, chaos: m.chaos || null
  });
  let regia = regiaCode(room) || randomCode(8);
  try { await set(secretRef(code), regia); } catch { regia = regiaCode(room); }
  if (regia) localStorage.setItem(regiaKey(code), regia);
  const patch = {};
  for (const [uid, p] of Object.entries(d.players || {})) if (p?.name) patch[`players/${uid}`] = { ...p, photo: p.photo === '__img' ? null : (p.photo || null) };
  for (const [gid, g] of Object.entries(d.games || {})) {
    patch[`games/${gid}`] = { ...g, image: g.image === '__img' ? null : (g.image || null) };
    if (d.votes?.[gid]) patch[`votes/${gid}`] = d.votes[gid];
  }
  const st = d.state && typeof d.state === 'object' ? { ...d.state } : { phase: 'idle' };
  if (['voting', 'reveal', 'poll'].includes(st.phase) && !(st.phase !== 'poll' && d.games?.[st.gameId])) st.phase = 'idle';
  patch.state = { ...st, at: serverTimestamp() };
  await update(roomRef(code, ''), patch);
  if (m.groupId) await set(groupRef(m.groupId, `rooms/${code}`), { at: serverTimestamp() }).catch(() => {});
  if (code !== room) Vault.close(room).catch(() => {});
  return code;
}

/** Riprende la sessione interrotta: la stanza c'è ancora → si riapre; non c'è più → si ricrea dalla copia. */
async function resumeSession(room) {
  const meta = (await get(roomRef(room, 'meta'))).val();
  if (meta && meta.hostUid === S.uid) { openRoom(room); return; }
  if (meta) {
    const known = regiaCode(room);
    if (known) { await takeOver(room, known); return; }
    renderCreate({ resume: room });
    return;
  }
  const code = await recreateFromVault(room);
  toast(code === room ? 'Serata ricreata dalla copia locale' : `Serata ricreata con il nuovo codice ${code}`);
  openRoom(code);
}

function recoveryHTML(sess) {
  const t = new Date(sess.at);
  const i = sess.info || {};
  return `
    <section class="card recover-card" role="alert">
      <p class="recover-kicker">⚠️ La sessione precedente è stata interrotta</p>
      <p>Trovata una copia valida delle <b>${esc(t.toLocaleTimeString('it-IT'))}</b>${t.toDateString() !== new Date().toDateString() ? ` del ${esc(t.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }))}` : ''}:
        ${i.group ? `<b>${esc(i.group)}</b>, ` : ''}stanza <b>${esc(sess.room)}</b>${i.number ? `, Game Night #${esc(i.number)}` : ''} · ${Number(i.games) || 0} ${Number(i.games) === 1 ? 'gioco votato' : 'giochi votati'} · ${Number(i.players) || 0} ${Number(i.players) === 1 ? 'giocatore' : 'giocatori'}.</p>
      <div class="claim-actions">
        <button type="button" class="btn btn-big" id="recGo" data-room="${esc(sess.room)}">${ICONS.play}<span>Riprendi serata</span></button>
        <button type="button" class="btn-sec" id="recNew" data-room="${esc(sess.room)}">Inizia nuova serata</button>
      </div>
      <p class="form-error" id="recErr" role="alert"></p>
    </section>`;
}

/** La stanza è sparita dal database mentre la TV era aperta. */
async function renderRoomGone() {
  if (S.screenKey === 'gone') return;
  S.screenKey = 'gone';
  S.screen?.unmount?.();
  S.screen = null;
  const saved = await Vault.loadCurrent(S.code).catch(() => null);
  app.innerHTML = `
    <main class="create">
      <section class="card create-card">
        <h2>La stanza non c’è più</h2>
        <p>La stanza <b>${esc(S.code)}</b> non esiste più nel database (forse è stata cancellata dalla console di Firebase).</p>
        ${saved ? `<p>Su questo computer c’è una copia valida delle <b>${esc(new Date(saved.at).toLocaleTimeString('it-IT'))}</b>: posso ricreare la serata con giocatori, giochi e voti.</p>
          <button type="button" class="btn btn-big btn-block" id="goneRestore">Ricrea la serata da questa copia</button>` : '<p class="muted">Non ho trovato copie locali di questa serata.</p>'}
        <p class="form-error" id="goneErr" role="alert"></p>
        <button type="button" class="link-btn" id="goneNew">Crea una serata nuova</button>
      </section>
    </main>`;
  $('#goneNew').addEventListener('click', () => { localStorage.removeItem(STORE_KEY); location.href = location.pathname; });
  $('#goneRestore')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { const code = await recreateFromVault(S.code); location.href = `${location.pathname}?room=${code}`; } catch (err) { $('#goneErr').textContent = explainError(err); e.currentTarget.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Stanza chiusa, espulsioni, heartbeat dei telefoni
// ---------------------------------------------------------------------------

async function setLocked(on) {
  await update(roomRef(S.code, 'meta'), { locked: on || null });
  logEvent(on ? 'Stanza chiusa: niente nuovi ingressi' : 'Stanza riaperta', on ? '🔒' : '🔓');
  toast(on ? 'Stanza chiusa: il QR non funziona più per chi non è già dentro' : 'Stanza riaperta: si può entrare con il QR');
}

/** Espelle un dispositivo: esce dalla stanza e stasera non può rientrare (si riammette dal pannello). */
async function kickPlayer(uid, all = false) {
  const p = S.players[uid];
  if (!p) return;
  await Save.snap(`Prima di espellere ${p.name}`);
  const patch = {
    [`players/${uid}`]: null, [`claims/${uid}`]: null, [`hb/${uid}`]: null,
    [`meta/banned/${uid}`]: String(p.name).slice(0, 16)
  };
  const removed = {};
  const curGid = S.state?.phase === 'voting' ? S.state.gameId : null;
  for (const [gid, gv] of Object.entries(S.votes || {})) {
    if (gv?.[uid] && (all || gid === curGid)) { patch[`votes/${gid}/${uid}`] = null; removed[gid] = gv[uid]; }
    if (all) for (const [vu, v] of Object.entries(gv || {})) if (vu !== uid && v?.mvp === uid) patch[`votes/${gid}/${vu}/mvp`] = null;
  }
  if (all) for (const [gid, g] of Object.entries(S.games || {})) if (g?.winners?.[uid]) patch[`games/${gid}/winners/${uid}`] = null;
  if (S.poll?.votes?.[uid]) patch[`poll/votes/${uid}`] = null;
  if (S.state?.playId && S.bets?.[S.state.playId]?.[uid]) patch[`bets/${S.state.playId}/${uid}`] = null;
  await update(roomRef(S.code, ''), patch);
  S.draft.winners = (S.draft.winners || []).filter((u) => u !== uid);
  saveNight();
  logEvent(`Espulsione: ${p.name}${all ? ' (con tutti i suoi voti)' : ''}`, '⛔');
  toastUndo(`Fuori dalla stanza: ${p.name}`, async () => {
    const back = { [`players/${uid}`]: p, [`meta/banned/${uid}`]: null };
    for (const [gid, v] of Object.entries(removed)) if (S.games[gid]) back[`votes/${gid}/${uid}`] = v;
    await update(roomRef(S.code, ''), back).catch((err) => toast(explainError(err), 'error'));
  });
}

async function readmit(uid) {
  await update(roomRef(S.code, 'meta/banned'), { [uid]: null });
  toast('Riammesso: può rientrare con il QR');
}

/** Finestra di conferma dell'espulsione (con la scelta sui voti). */
function confirmKick(uid) {
  const p = S.players[uid];
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="card panel panel--claim" role="alertdialog" aria-modal="true" aria-labelledby="kkTitle">
      <div class="claim-head">${avatarHTML(p, '4rem')}<div><h2 id="kkTitle">Espellere ${esc(p.name)}?</h2>
        <p class="panel-note">Il dispositivo esce subito dalla stanza e stasera non può rientrare (lo riammetti dal pannello Giocatori). Il voto della votazione in corso, se c’è, viene tolto.</p></div></div>
      <label class="quick-toggle"><input type="checkbox" id="kkAll"><span>Cancella anche tutti i suoi voti e le sue vittorie della serata (giocatore fantasma o troll)</span></label>
      <div class="claim-actions"><button type="button" class="btn-sec" id="kkNo">Annulla</button><button type="button" class="btn btn-big btn--danger" id="kkYes">⛔ <span>Espelli</span></button></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', async (e) => {
    if (e.target === el || e.target.closest('#kkNo')) { el.remove(); return; }
    if (e.target.closest('#kkYes')) {
      const all = $('#kkAll', el).checked;
      el.remove();
      kickPlayer(uid, all).catch((err) => toast(explainError(err), 'error'));
    }
  });
  $('#kkNo', el).focus();
}

/** Battito dei telefoni (ogni 5 s): se manca da 15 s, il giocatore risulta disconnesso. */
const Beats = {
  seen: {},
  vals: {},
  started: false,
  status: '',
  start(code) {
    if (this.started) return;
    this.started = true;
    onValue(roomRef(code, 'hb'), (snap) => {
      const v = snap.val() || {};
      const now = Date.now();
      for (const [uid, t] of Object.entries(v)) if (this.vals[uid] !== t) { this.vals[uid] = t; this.seen[uid] = now; }
      for (const uid of Object.keys(this.vals)) if (!(uid in v)) { delete this.vals[uid]; delete this.seen[uid]; }
      this.check();
    }, () => {});
    setInterval(() => this.check(), 2000);
  },
  /** true/false se il telefono ha mai battuto, null se non manda il battito (versione vecchia). */
  fresh(uid) {
    if (!(uid in this.seen)) return null;
    return Date.now() - this.seen[uid] < 15000;
  },
  check() {
    const st = Object.keys(this.seen).map((u) => `${u}:${this.fresh(u)}`).join('|');
    if (st !== this.status) { this.status = st; render(); }
  }
};

// ---------------------------------------------------------------------------
// Regia trasferibile
// ---------------------------------------------------------------------------

function transferUrl() {
  const url = publicUrl('host.html');
  url.search = '';
  url.searchParams.set('room', S.code);
  const gk = S.meta?.groupId ? groupKey(S.meta.groupId) : '';
  url.hash = `regia=${regiaCode()}${gk ? `&gk=${gk}` : ''}`;
  return url.href;
}

const TransferPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    this.close();
    const code = regiaCode();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="trTitle">
        <div class="panel-head"><h2 id="trTitle">Trasferisci la regia</h2><button type="button" class="icon-btn" id="trClose" aria-label="Chiudi">${ICONS.x}</button></div>
        ${code ? `<div class="transfer">
          <div class="qr qr--panel" id="trQr"></div>
          <div class="transfer-text">
            <p>Sul nuovo computer o tablet inquadra il QR, oppure apri <b>host.html</b>, tocca <b>Riprendi una serata già iniziata</b> e scrivi:</p>
            <p class="transfer-codes"><span>Stanza <b class="code-chip">${esc(S.code)}</b></span><span>Codice regia <b class="code-chip">${esc(prettyRegia(code))}</b></span>${S.meta?.groupId && groupKey(S.meta.groupId) ? `<span>Chiave del gruppo <b class="code-chip">${esc(prettyKey(groupKey(S.meta.groupId)))}</b></span>` : ''}</p>
            <p class="muted small">Il codice regia dà il controllo della serata: mostralo solo a chi deve prenderla. I telefoni non si accorgono di niente: restano collegati alla stessa stanza.</p>
            <div class="rg-row"><button type="button" class="btn-sec" id="trBackup">${ICONS.download}<span>Scarica anche il backup di emergenza</span></button></div>
          </div></div>` : '<p class="panel-note">Questo computer non conosce il codice regia della serata (è stata ripresa senza codice). Lo trovi sul dispositivo che l’ha creata.</p>'}
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    if (code) renderQR($('#trQr', el), transferUrl());
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#trClose')) { this.close(); return; }
      if (e.target.closest('#trBackup')) downloadEmergency();
    });
  },
  close() { this.el?.remove(); this.el = null; }
};

// ---------------------------------------------------------------------------
// Safe Mode e spazio occupato
// ---------------------------------------------------------------------------

function applySafeMode(on) {
  setSafeMode(on);
  if (S.code && S.meta?.hostUid === S.uid) update(roomRef(S.code, 'meta'), { safeMode: on || null }).catch(() => {});
  if (on) { Music.stop(); stopSpeaking(); Interval.close(); }
  logEvent(on ? 'Safe Mode attivata' : 'Safe Mode disattivata', '🚨');
  S.screenKey = null;
  render();
}

function offerSafeMode(reason = '') {
  if ($('#safeOffer') || isSafeMode()) return;
  const el = document.createElement('div');
  el.id = 'safeOffer';
  el.className = 'net-banner safe-offer';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<span>⚠️ La TV sta incontrando degli errori${reason ? '' : ''}. Con la <b>Safe Mode</b> si spengono animazioni, musica ed effetti e la serata continua.</span>
    <button type="button" class="btn-sec btn-sec--sm" id="soOn">Attiva Safe Mode</button><button type="button" class="link-btn" id="soNo">Ignora</button>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target.closest('#soOn')) { el.remove(); applySafeMode(true); }
    if (e.target.closest('#soNo')) el.remove();
  });
}

const fmtBytes = (b) => (b === null || b === undefined ? '—' : b < 1024 * 1024 ? `${b ? Math.max(1, Math.round(b / 1024)) : 0} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);

/** Quanto spazio occupano copie, foto e dati (sul computer e, a stima, nel database). */
async function storageReport() {
  const [st, vault] = await Promise.all([storageInfo(), Vault.usage()]);
  const size = (o) => { try { return JSON.stringify(o || {}).length; } catch { return 0; } };
  const photos = Object.values(S.photos || {}).reduce((a, p) => a + String(p?.data || '').length, 0);
  return {
    browser: st,
    vault: vault.total, thisRoom: vault.rooms[S.code] || 0, snaps: vault.snaps,
    photos, data: size(S.games) + size(S.votes) + size(S.players), library: size(S.library), nights: size(S.nights)
  };
}

/** Pausa: nessuno risulta scollegato, niente reveal automatici, i telefoni possono riposare. */
async function setPaused(on, reason = null) {
  if (Boolean(S.state?.paused) === on && !reason) return;
  const patch = { paused: on ? true : null, pausedAt: on ? serverTimestamp() : null, pauseReason: on ? reason : null };
  // Il timer della partita non conta il tempo passato in pausa.
  if (!on && S.state?.playStart && S.state?.pausedAt) {
    patch.playPaused = (Number(S.state.playPaused) || 0) + Math.max(0, Date.now() - Number(S.state.pausedAt));
  }
  // Anche il timer del voto si ferma durante la pausa.
  if (!on && S.state?.voteSecs && S.state?.pausedAt) {
    patch.votePaused = (Number(S.state.votePaused) || 0) + Math.max(0, serverNow() - Number(S.state.pausedAt));
  }
  if (on && S.state?.paused) delete patch.pausedAt;
  await update(roomRef(S.code, 'state'), patch);
}

function paintPause() {
  const on = Boolean(S.state?.paused);
  let el = $('#pauseOverlay');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'pauseOverlay';
    el.className = 'pause-overlay';
    el.innerHTML = `
      <div class="pause-box">
        <p class="pause-kicker" id="pauseKicker">Serata in pausa</p>
        <h1 class="pause-title">Pausa!</h1>
        <p class="lead-line">Mangiate, ricaricate i telefoni: nessuno risulta scollegato e la votazione aspetta.</p>
        <button type="button" class="btn btn-big" id="resumeBtn">${ICONS.play}<span>Riprendi la serata</span></button>
        <p class="muted">Tasto P per mettere e togliere la pausa.</p>
      </div>
      <p class="pause-fact" id="pauseFact"></p>`;
    document.body.appendChild(el);
    $('#resumeBtn', el).addEventListener('click', () => setPaused(false));
    // Nel frattempo: curiosità del gruppo e trivia, a rotazione.
    const pool = shuffled([...cachedFacts().map((f) => `${f.icon} ${f.text}`), ...TRIVIA.map((t) => `🎲 ${t}`)]);
    let i = 0;
    const show = () => { const p = $('#pauseFact', el); if (p) p.textContent = pool[i++ % pool.length] || ''; };
    show();
    el.dataset.timer = String(setInterval(show, 10000));
  }
  if (on && el) {
    const k = $('#pauseKicker', el);
    const txt = S.state?.pauseReason || 'Serata in pausa';
    if (k.textContent !== txt) k.textContent = txt;
  }
  if (!on && el) {
    clearInterval(Number(el.dataset.timer));
    el.remove();
    // Alla ripresa chi è ancora scollegato ha di nuovo il suo minuto per rientrare.
    S.offlineSince = {};
  }
}

/** Sposta un gioco nel cestino (con i suoi voti), da dove si può ripristinare. */
async function trashGame(gid) {
  const g = S.games[gid];
  if (!g) return;
  await Save.snap(`Prima di cestinare ${g.name}`);
  await update(roomRef(S.code, ''), {
    [`trash/${gid}`]: { game: g, votes: S.votes?.[gid] || null, at: serverTimestamp() },
    [`games/${gid}`]: null,
    [`votes/${gid}`]: null
  });
  saveNight();
  toastUndo(`“${g.name}” spostato nel cestino`, () => restoreGame(gid));
}

async function restoreGame(gid) {
  const t = S.trash?.[gid];
  if (!t?.game) return;
  const hasVotes = t.votes && Object.keys(t.votes).length;
  await update(roomRef(S.code, ''), {
    [`games/${gid}`]: { ...t.game, status: hasVotes ? 'revealed' : t.game.status === 'voting' ? 'revealed' : t.game.status },
    [`votes/${gid}`]: t.votes || null,
    [`trash/${gid}`]: null
  });
  saveNight();
  toast(`“${t.game.name}” ripristinato`);
}

const VOTE_TIMERS = [['0', 'Spento'], ['45', '45 secondi'], ['60', '1 minuto'], ['90', '1 minuto e mezzo'], ['120', '2 minuti'], ['180', '3 minuti']];

/** Pannello "Strumenti": pausa, tema, musica, suoni, ticker, cestino, copie di sicurezza, verifica della configurazione. */
const ToolsPanel = {
  el: null,
  sig: '',
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S.code) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    const opts = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="tlTitle">
        <div class="panel-head"><h2 id="tlTitle">Strumenti</h2><button type="button" class="icon-btn" id="tlClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="tools-grid">
          <section class="tool"><h3>Pausa</h3><p class="muted">Per le pause lunghe: nessuno risulta scollegato e la votazione aspetta.</p><button type="button" class="btn" id="tlPause"></button></section>
          <section class="tool"><h3>Timer del voto</h3><p class="muted">Un conto alla rovescia sulla TV e una miccia sui telefoni. Allo scadere i ritardatari tremano.</p>
            <select class="input select select--sm" id="tlVoteTimer" aria-label="Durata del timer">${opts(VOTE_TIMERS, String(Number(S.meta?.voteSeconds) || 0))}</select>
            <label class="quick-toggle"><input type="checkbox" id="tlVoteAuto" ${S.meta?.voteAuto ? 'checked' : ''}><span>Allo scadere rivela da sola (se almeno uno ha votato)</span></label></section>
          <section class="tool"><h3>Tema e atmosfera</h3>${themeSwitchHTML('tlTheme')}
            <label class="field-label" for="tlAtmo">Atmosfera animata sullo sfondo</label>
            <select class="input select select--sm" id="tlAtmo">${opts(ATMOS, S.meta?.atmosphere || 'none')}</select>
            <label class="quick-toggle"><input type="checkbox" id="tlCine" ${cinematicOn() ? 'checked' : ''}><span>🎬 Reveal cinematico (luci basse, riflettore, ralenti sui voti estremi)</span></label></section>
          <section class="tool"><h3>🎲 Tavolo e quiz</h3><p class="muted">Ruota per chi inizia, squadre equilibrate e clessidra (tasto <b>T</b>); quiz del gruppo con risposte dai telefoni (tasto <b>Q</b>).</p>
            <div class="rg-row"><button type="button" class="btn-sec" id="tlTable">Strumenti da tavolo</button><button type="button" class="btn-sec" id="tlQuiz">🧠 Quiz</button></div></section>
          <section class="tool"><h3>Modalità leggera</h3><p class="muted">Per Smart TV e computer lenti: toglie sfocature, bagliori, particelle e animazioni continue.</p>
            <select class="input select select--sm" id="tlLite" aria-label="Modalità leggera">${opts([['auto', 'Automatica (si accende se la TV va a scatti)'], ['on', 'Sempre accesa'], ['off', 'Spenta']], Lite.mode())}</select>
            ${Lite.on() ? '<p class="muted small">⚡ Adesso è accesa.</p>' : ''}</section>
          <section class="tool"><h3>Accessibilità</h3><p class="muted">Per questa TV. Ogni telefono ha le sue in "Il mio profilo".</p>${a11yHTML('tlA11y')}</section>
          <section class="tool"><h3>Registro errori</h3><p class="muted" id="tlErrInfo"></p>
            <div class="rg-row"><button type="button" class="btn-sec btn-sec--sm" id="tlErrDl">${ICONS.download}<span>Scarica il registro</span></button><button type="button" class="btn-sec btn-sec--sm" id="tlErrClear">Svuota</button></div>
            <button type="button" class="link-btn" id="tlTour">🎓 Rivedi il tutorial</button></section>
          <section class="tool"><h3>Musica</h3><p class="muted">Musica d’atmosfera generata dalla TV: lounge in attesa, suspense durante il voto, festa alla premiazione. Tasto <b>M</b> per accenderla e spegnerla.</p>
            <select class="input select select--sm" id="tlMusic" aria-label="Musica">${opts(MUSIC_MODES, Music.mode())}</select>
            <label class="vol-row"><span>Volume musica</span><input type="range" class="range range--vol" id="tlMusicVol" min="0" max="1" step="0.05" value="${getVolume('music')}" style="--p:${Math.round(getVolume('music') * 100)}%"></label></section>
          <section class="tool"><h3>Effetti sonori</h3>
            <label class="quick-toggle"><input type="checkbox" id="tlSounds" ${soundsOn() ? 'checked' : ''}><span>Effetti sonori</span></label>
            <label class="vol-row"><span>Volume effetti</span><input type="range" class="range range--vol" id="tlFxVol" min="0" max="1" step="0.05" value="${getVolume('fx')}" style="--p:${Math.round(getVolume('fx') * 100)}%"></label>
            <label class="quick-toggle"><input type="checkbox" id="tlMute" ${isMuted() ? 'checked' : ''}><span>Silenzioso (spegne musica, effetti e voce)</span></label>
            <label class="quick-toggle"><input type="checkbox" id="tlBoard" ${S.meta?.soundboard ? 'checked' : ''}><span>Soundboard dai telefoni</span></label>
            <div class="sfx-grid">${SFX.map((x) => `<button type="button" class="sfx-btn" data-sfx="${x.k}" title="${esc(x.label)}"><span aria-hidden="true">${x.icon}</span><small>${esc(x.label)}</small></button>`).join('')}</div></section>
          <section class="tool"><h3>Ticker e commentatore</h3>
            <label class="quick-toggle"><input type="checkbox" id="tlTicker" ${S.meta?.ticker ? 'checked' : ''}><span>Ticker "Ultim’ora" in basso, con i pettegolezzi anonimi dai telefoni</span></label>
            <label class="field-label" for="tlComment">Commentatore (voce della TV)</label>
            <select class="input select select--sm" id="tlComment">${opts(COMMENTATOR_MODES, commentatorMode())}</select>
            <ul class="trash-list" id="tlGossip"></ul></section>
          <section class="tool"><h3>Intervallo</h3><p class="muted">Tra un gioco e l’altro la TV fa scorrere curiosità del gruppo, foto delle serate passate e trivia. Tasto <b>I</b>.</p>
            <label class="quick-toggle"><input type="checkbox" id="tlAutoInt" ${Interval.autoOn() ? 'checked' : ''}><span>Parte da solo dopo 3 minuti senza toccare niente</span></label>
            <button type="button" class="btn-sec" id="tlInterval">☕ <span>Avvia l’intervallo</span></button></section>
          <section class="tool tool--wide"><h3>Salvataggi e sicurezza</h3><p class="save-line" id="tlSave">Leggo le copie…</p>
            <div class="rg-row"><button type="button" class="btn-sec" id="tlTime">⏪ <span>Macchina del tempo</span></button>
            <button type="button" class="btn-sec" id="tlCheck">🔎 <span>Controllo integrità</span></button>
            <button type="button" class="btn-sec" id="tlTransfer">📺 <span>Trasferisci la regia</span></button></div>
            <div class="rg-row"><button type="button" class="btn-sec" id="tlDownload">${ICONS.download}<span>Backup di emergenza</span></button>
            <button type="button" class="btn-sec" id="tlRestoreFile">📥 <span>Importa backup</span></button>
            ${S.meta?.groupId ? '<button type="button" class="btn-sec" id="tlGroupBackup">🗄️ <span>Backup del gruppo</span></button><button type="button" class="btn-sec" id="tlGroupRestore">Importa backup del gruppo</button>' : ''}</div>
            ${S.meta?.groupId ? `<label class="quick-toggle"><input type="checkbox" id="tlAutoGB" ${autoGroupBackup() ? 'checked' : ''}><span>Scarica da solo il backup del gruppo a fine serata</span></label>` : ''}
            <input type="file" id="tlFile" accept="application/json,.json" hidden><input type="file" id="tlGroupFile" accept="application/json,.json" hidden></section>
          <section class="tool"><h3>Stanza</h3>
            <label class="quick-toggle"><input type="checkbox" id="tlLock" ${S.meta?.locked ? 'checked' : ''}><span>🔒 Stanza chiusa: nessun nuovo ingresso. Chi è già dentro può sempre rientrare dal suo telefono.</span></label>
            <p class="muted small">Per espellere un dispositivo: pannello Giocatori (tasto G), pulsante ⛔.</p>
            <button type="button" class="btn-sec btn-sec--sm" id="tlRegiaNew">🔑 Cambia il codice regia</button>
            <p class="muted small">Con un codice nuovo i telefoni regia e gli altri computer che avevano il vecchio perdono l’accesso.</p>
            <h4 class="tool-sub">🚨 Allarme intrusi</h4><div id="tlKnocks">${Knocks.html()}</div></section>
          <section class="tool"><h3>🚨 Safe Mode</h3><p class="muted">Se qualcosa va storto: spegne animazioni, musica, effetti, commentatore, atmosfere e ticker, anche sui telefoni. Restano giocatori, voti, classifica, regia e salvataggi.</p>
            <label class="quick-toggle"><input type="checkbox" id="tlSafe" ${isSafeMode() ? 'checked' : ''}><span>Safe Mode attiva</span></label></section>
          <section class="tool"><h3>Spazio</h3><div class="space-list" id="tlSpace"><p class="muted">Calcolo…</p></div>
            <button type="button" class="btn-sec btn-sec--sm" id="tlPrune">Pulisci le copie delle serate vecchie (oltre 30 giorni)</button></section>
          ${S.meta?.groupId ? `<section class="tool"><h3>Il gruppo</h3><p class="muted">Emblema, motto e colore del gruppo; album con le foto ricordo di stasera.</p><div class="rg-row"><button type="button" class="btn-sec" id="tlIdentity">Identità del gruppo</button><button type="button" class="btn-sec" id="tlAlbum">Album</button></div>
            <p class="gk-line">${S.groupAdmin && groupKey(S.meta.groupId) ? `🔑 Chiave del gruppo <b class="code-chip code-chip--sm">${esc(prettyKey(groupKey(S.meta.groupId)))}</b>: serve per guidare le serate del gruppo da un altro computer. Tienila per te.` : S.groupAdmin ? '🔑 Questo computer è autorizzato a guidare il gruppo.' : '🔑 Questo computer non è autorizzato a salvare nel gruppo.'}</p>
            <div class="rg-row">${!S.groupAdmin ? '<button type="button" class="btn-sec btn-sec--sm" id="tlGkEnter">Inserisci la chiave del gruppo</button>' : ''}${S.groupOwner ? '<button type="button" class="btn-sec btn-sec--sm" id="tlGkNew">Cambia chiave</button>' : ''}</div>
            ${S.groupAdmin ? `<h4 class="tool-sub">🔐 Privacy</h4>
            <label class="quick-toggle"><input type="checkbox" id="tlPrivate" ${S.privacy?.private ? 'checked' : ''}><span>Storico privato: serate e foto visibili solo a chi ha giocato con il gruppo (l’armadio resta pubblico)</span></label>
            <label class="field-label" for="tlExpire">Cancella da sole le stanze vecchie (le serate restano nello storico)</label>
            <select class="input select select--sm" id="tlExpire">${opts([['0', 'Mai'], ['7', 'Dopo 7 giorni'], ['30', 'Dopo 30 giorni'], ['90', 'Dopo 90 giorni']], String(Number(S.privacy?.expireDays) || 0))}</select>` : ''}</section>` : ''}
          <section class="tool"><h3>Domande e Chaos</h3><p class="muted">Criteri attivi, domande personalizzate e modalità Chaos con eventi casuali.</p><button type="button" class="btn-sec" id="tlVoting">Domande della serata</button></section>
          <section class="tool"><h3>Verifica configurazione</h3><p class="muted">Controlla che Firebase e le regole siano a posto (meglio prima della serata).</p>
            <a class="btn-sec" href="test.html" target="_blank" rel="noopener">Apri la verifica</a></section>
        </div>
        <section class="tool"><h3>Cestino</h3><ul class="trash-list" id="tlTrash"></ul></section>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.sig = '';
    this.gsig = '';
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#tlClose')) { this.close(); return; }
      if (e.target.closest('#tlPause')) { setPaused(!S.state?.paused).catch((err) => toast(explainError(err), 'error')); this.close(); return; }
      if (e.target.closest('#tlVoting')) { this.close(); VotingPanel.open(); return; }
      if (e.target.closest('#tlIdentity')) { this.close(); IdentityPanel.open(); return; }
      if (e.target.closest('#tlAlbum')) { this.close(); AlbumPanel.open(); return; }
      if (e.target.closest('#tlInterval')) { this.close(); Interval.open(); return; }
      if (e.target.closest('#tlTable')) { this.close(); TablePanel.open(); return; }
      if (e.target.closest('#tlQuiz')) { this.close(); Quiz.open(); return; }
      if (e.target.closest('#tlKnockClear')) { remove(roomRef(S.code, 'knock')).catch((err) => toast(explainError(err), 'error')); return; }
      if (e.target.closest('#tlRegiaNew')) {
        if (!confirm('Creare un nuovo codice regia?\n\nI telefoni con la regia attiva e gli altri computer che conoscono il vecchio codice non potranno più guidare la serata.')) return;
        try { const c = await changeRegiaCode(); this.close(); this.open(); toast(`Nuovo codice regia: ${prettyRegia(c)}`); } catch (err) { toast(explainError(err), 'error'); }
        return;
      }
      const sfx = e.target.closest('[data-sfx]');
      if (sfx) { playSfx(sfx.dataset.sfx); return; }
      const gd = e.target.closest('[data-delgossip]');
      if (gd) { remove(roomRef(S.code, `gossip/${gd.dataset.delgossip}`)).catch((err) => toast(explainError(err), 'error')); return; }
      if (e.target.closest('#tlDownload')) { downloadEmergency(); return; }
      if (e.target.closest('#tlRestoreFile')) { $('#tlFile', el).click(); return; }
      if (e.target.closest('#tlGroupRestore')) { $('#tlGroupFile', el).click(); return; }
      if (e.target.closest('#tlGroupBackup')) {
        const photos = confirm('Includere anche le foto ricordo? Il file diventa molto più grande.\n\nOK = con le foto · Annulla = solo dati');
        groupBackup(photos).catch((err) => toast(explainError(err), 'error'));
        return;
      }
      if (e.target.closest('#tlTime')) { this.close(); TimeMachine.open(); return; }
      if (e.target.closest('#tlErrDl')) { ErrLog.download({ stanza: S.code, fase: S.state?.phase, giocatori: activePlayers(S.players).length, safeMode: isSafeMode() }); return; }
      if (e.target.closest('#tlErrClear')) { if (confirm('Svuotare il registro degli errori?')) { ErrLog.clear(); this.paintErr(); } return; }
      if (e.target.closest('#tlTour')) { resetTours(); this.close(); setTimeout(() => runTour(S.state?.phase || 'lobby', TOURS[S.state?.phase] || TOURS.lobby, { force: true }), 200); return; }
      if (e.target.closest('#tlGkEnter')) { this.close(); showGroupKeyBanner(); $('#gkInput')?.focus(); return; }
      if (e.target.closest('#tlGkNew')) {
        if (!confirm('Creare una nuova chiave del gruppo? I computer già autorizzati restano tali; la vecchia chiave non servirà più per autorizzarne altri.')) return;
        const k = randomCode(8);
        try { await set(dbRef(`groupKeys/${S.meta.groupId}`), k); saveGroupKey(S.meta.groupId, k); toast(`Nuova chiave del gruppo: ${prettyKey(k)}`); this.close(); this.open(); } catch (err) { toast(explainError(err), 'error'); }
        return;
      }
      if (e.target.closest('#tlCheck')) { this.close(); IntegrityPanel.open(); return; }
      if (e.target.closest('#tlTransfer')) { this.close(); TransferPanel.open(); return; }
      if (e.target.closest('#tlPrune')) {
        const n = await Vault.prune(30, S.code).catch(() => 0);
        toast(n ? `Tolte ${n} copie vecchie` : 'Nessuna copia vecchia da togliere');
        this.paintSpace();
        return;
      }
      const r = e.target.closest('[data-restore]');
      if (r) restoreGame(r.dataset.restore).catch((err) => toast(explainError(err), 'error'));
    });
    const metaFlag = (key, val) => update(roomRef(S.code, 'meta'), { [key]: val }).catch((err) => toast(explainError(err), 'error'));
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'tlSounds') { setSounds(t.checked); if (t.checked) ding(); }
      if (t.id === 'tlMute') { setMuted(t.checked); if (t.checked) stopSpeaking(); syncMusic(); }
      if (t.id === 'tlMusic') { Music.setMode(t.value); syncMusic(true); }
      if (t.id === 'tlAtmo') metaFlag('atmosphere', t.value === 'none' ? null : t.value);
      if (t.id === 'tlVoteTimer') metaFlag('voteSeconds', Number(t.value) || null);
      if (t.id === 'tlLite') { Lite.setMode(t.value); toast(t.value === 'on' ? 'Modalità leggera accesa' : t.value === 'off' ? 'Modalità leggera spenta' : 'Modalità leggera automatica'); }
      if (t.id === 'tlPrivate') update(groupRef(S.meta.groupId, 'privacy'), { private: t.checked || null }).then(() => toast(t.checked ? 'Storico privato: serate e foto solo ai membri' : 'Storico visibile a chi ha il codice del gruppo')).catch((err) => toast(explainError(err), 'error'));
      if (t.id === 'tlExpire') {
        const days = Number(t.value) || 0;
        update(groupRef(S.meta.groupId, 'privacy'), { expireDays: days || null }).then(async () => {
          if (!days) { toast('Le stanze vecchie restano'); return; }
          const n = await cleanupOldRooms(S.meta.groupId, days);
          toast(n ? `Cancellate ${n} ${n === 1 ? 'stanza vecchia' : 'stanze vecchie'}` : `Le stanze più vecchie di ${days} giorni verranno cancellate`);
        }).catch((err) => toast(explainError(err), 'error'));
      }
      if (t.id === 'tlVoteAuto') metaFlag('voteAuto', t.checked || null);
      if (t.id === 'tlBoard') metaFlag('soundboard', t.checked || null);
      if (t.id === 'tlTicker') metaFlag('ticker', t.checked || null);
      if (t.id === 'tlComment') { setCommentatorMode(t.value); if (t.value !== 'off') speak(t.value === 'roast' ? 'Commentatore pronto. Siete sicuri di volerlo?' : 'Commentatore pronto! Che la serata abbia inizio!'); }
      if (t.id === 'tlAutoInt') Interval.setAuto(t.checked);
      if (t.id === 'tlCine') { try { localStorage.setItem(CINE_KEY, t.checked ? '1' : '0'); } catch { /* niente */ } }
      if (t.id === 'tlLock') setLocked(t.checked).catch((err) => toast(explainError(err), 'error'));
      if (t.id === 'tlSafe') { this.close(); applySafeMode(t.checked); }
      if (t.id === 'tlAutoGB') { try { localStorage.setItem(AUTO_GB_KEY, t.checked ? '1' : '0'); } catch { /* niente */ } }
    });
    el.addEventListener('input', (e) => {
      if (e.target.classList.contains('range--vol')) e.target.style.setProperty('--p', `${Math.round(e.target.value * 100)}%`);
      if (e.target.id === 'tlMusicVol') setVolume('music', e.target.value);
      if (e.target.id === 'tlFxVol') setVolume('fx', e.target.value);
    });
    $('#tlFxVol', el).addEventListener('change', () => ding());
    $('#tlFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { await importBackupFile(f); } catch (err) { toast(explainError(err), 'error'); }
    });
    $('#tlGroupFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { await restoreGroupFile(f); } catch (err) { toast(explainError(err), 'error'); }
    });
    this.update();
    this.paintSave();
    this.paintSpace();
    this.paintErr();
  },
  paintErr() {
    const box = this.el && $('#tlErrInfo', this.el);
    if (!box) return;
    const l = ErrLog.list();
    box.textContent = l.length ? `${l.length} ${l.length === 1 ? 'voce registrata' : 'voci registrate'} su questo computer, l’ultima alle ${new Date(l[l.length - 1].t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Scaricale per capire cosa è successo.` : 'Nessun errore registrato su questo computer.';
  },
  /** "Autosave ✔ 22:14:31 · Backup ✔ · Ultimo stato valido". */
  async paintSave() {
    if (!this.el) return;
    const [slots, snaps] = await Promise.all([Vault.slots(S.code), Vault.snapshots(S.code)]);
    const box = this.el && $('#tlSave', this.el);
    if (!box) return;
    if (!Vault.available) { box.innerHTML = '⚠️ Questo browser non permette le copie locali (navigazione privata?): usa il backup di emergenza.'; return; }
    const t = (at) => new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const cur = slots.find((x) => x.slot === 'current');
    const ok = slots.filter((x) => x.ok);
    box.innerHTML = `Autosave ${cur?.ok ? '✔' : '⚠️'} <b>${cur ? t(cur.at) : '—'}</b> · Backup a rotazione ${ok.length >= 2 ? '✔' : '…'} <b>${ok.length}</b> · Istantanee <b>${snaps.length}</b> · Ultimo stato valido <b>${ok[0] ? t(ok[0].at) : '—'}</b>`;
  },
  async paintSpace() {
    if (!this.el) return;
    const r = await storageReport();
    const box = this.el && $('#tlSpace', this.el);
    if (!box) return;
    const q = r.browser.quota;
    const pct = q ? Math.round((r.browser.usage / q) * 100) : null;
    box.innerHTML = `
      <p>Questo browser: <b>${fmtBytes(r.browser.usage)}</b>${q ? ` di ${fmtBytes(q)} (${pct}%)` : ''}${r.browser.persisted ? ' · protetto dalla pulizia automatica' : ''}</p>
      <p class="muted small">Copie locali ${fmtBytes(r.vault)} (stasera ${fmtBytes(r.thisRoom)}, ${r.snaps} istantanee) · Foto di stasera ${fmtBytes(r.photos)} · Dati della serata ${fmtBytes(r.data)} · Armadio ${fmtBytes(r.library)} · Storico ${fmtBytes(r.nights)}</p>
      ${pct !== null && pct >= 80 ? '<p class="claim-warn">⚠️ Lo spazio locale sta finendo: pulisci le copie vecchie o scarica il backup di emergenza.</p>' : ''}
      ${r.photos > 60 * 1024 * 1024 ? '<p class="claim-warn">⚠️ Le foto di stasera occupano molto: il piano gratuito di Firebase ha 1 GB in tutto.</p>' : ''}`;
  },
  close() { this.el?.remove(); this.el = null; },
  update() {
    if (!this.el) return;
    $('#tlPause', this.el).innerHTML = S.state?.paused ? `${ICONS.play}<span>Riprendi la serata</span>` : '<span>Metti in pausa</span>';
    const lock = $('#tlLock', this.el);
    if (lock && lock.checked !== Boolean(S.meta?.locked)) lock.checked = Boolean(S.meta?.locked);
    const gossip = gossipList();
    const gsig = JSON.stringify([gossip.map((g) => g.id), Boolean(S.meta?.ticker)]);
    if (gsig !== this.gsig) {
      this.gsig = gsig;
      $('#tlGossip', this.el).innerHTML = S.meta?.ticker ? (gossip.length ? gossip.map((g) => `
        <li><span>«${esc(g.text)}» <span class="muted small">${esc(S.players[g.by]?.name || '')}</span></span>
        <button type="button" class="btn-sec btn-sec--sm" data-delgossip="${esc(g.id)}" aria-label="Togli dal ticker">${ICONS.x}</button></li>`).join('') : '<li class="muted">Ancora nessun pettegolezzo dai telefoni.</li>') : '';
    }
    const ksig = JSON.stringify(S.knock || {});
    if (ksig !== this.ksig) { this.ksig = ksig; const kb = $('#tlKnocks', this.el); if (kb) kb.innerHTML = Knocks.html(); }
    const items = Object.entries(S.trash || {}).filter(([, t]) => t?.game);
    const sig = JSON.stringify(items.map(([id, t]) => [id, t.game.name]));
    if (sig === this.sig) return;
    this.sig = sig;
    $('#tlTrash', this.el).innerHTML = items.length ? items.map(([id, t]) => `
      <li><span><b>${esc(t.game.name)}</b> <span class="muted">${Object.keys(t.votes || {}).length} voti</span></span>
      <button type="button" class="btn-sec btn-sec--sm" data-restore="${esc(id)}">Ripristina</button></li>`).join('') : '<li class="muted">Il cestino è vuoto.</li>';
  }
};

/** Stato "partita in corso": timer, nome e pronostici aperti sui telefoni. */
function playState(name, spectators = []) {
  const specs = new Set(spectators || []);
  const players = activePlayers(S.players).filter((p) => !specs.has(p.uid)).map((p) => p.uid);
  return {
    playStart: serverTimestamp(), playName: name, playPaused: null,
    playId: `p${Date.now().toString(36)}`,
    playPlayers: players.length ? Object.fromEntries(players.map((u) => [u, true])) : null
  };
}

function setPhase(phase, gameId = null, extra = {}) {
  // Istantanea prima di cambiare fase (reveal e premiazione hanno la loro, con il nome del gioco).
  if (S.state?.phase && phase !== S.state.phase && !['reveal', 'awards'].includes(phase)) Save.snap(`Prima di: ${PHASE_LABEL[phase] || phase}`, 'phase');
  const state = { phase, at: serverTimestamp(), ...extra };
  if (gameId) state.gameId = gameId;
  // Timer del voto (se acceso negli Strumenti): parte quando si apre la votazione.
  if (phase === 'voting' && Number(S.meta?.voteSeconds) > 0 && state.voteSecs === undefined) state.voteSecs = Number(S.meta.voteSeconds);
  // Un cambio di schermata non toglie la pausa.
  if (S.state?.paused) { state.paused = true; state.pausedAt = S.state.pausedAt || null; state.pauseReason = S.state.pauseReason || null; }
  return set(roomRef(S.code, 'state'), state).catch((err) => toast(explainError(err), 'error'));
}

function playUrl(extra = {}) {
  const url = publicUrl('play.html');
  url.search = '';
  url.searchParams.set('room', S.code);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.href;
}

// ---------------------------------------------------------------------------
// Rendering generale
// ---------------------------------------------------------------------------

const SCREENS = {};

// ---------------------------------------------------------------------------
// Chiave del gruppo: solo i computer autorizzati scrivono serate, membri e identità,
// solo i membri (chi ha giocato in una serata del gruppo) toccano armadio, foto e presenze.
// ---------------------------------------------------------------------------

const gkKey = (gid) => `gnr_gkey_${gid}`;
function groupKey(gid) { try { return localStorage.getItem(gkKey(gid)) || ''; } catch { return ''; } }
function saveGroupKey(gid, k) { try { localStorage.setItem(gkKey(gid), k); } catch { /* niente */ } }
const prettyKey = (k) => (k ? `${k.slice(0, 4)}-${k.slice(4)}` : '');

/** Rende questo computer "regia del gruppo": proprietario, già autorizzato, o con la chiave giusta. */
async function ensureGroupAdmin(gid, keyIn = '') {
  const info = (await get(groupRef(gid, 'info'))).val();
  if (!info) return false;
  if (info.ownerUid === S.uid) {
    S.groupOwner = true;
    if (!groupKey(gid)) {
      const k = randomCode(8);
      try { await set(dbRef(`groupKeys/${gid}`), k); saveGroupKey(gid, k); } catch { /* regole vecchie */ }
    }
    return true;
  }
  if ((await get(groupRef(gid, `admins/${S.uid}`)).catch(() => null))?.val() === true) return true;
  let key = normalizeCode(keyIn, 8) || groupKey(gid) || S.hashGroupKey || '';
  if (!key) {
    // Gruppo creato con una versione precedente: il primo computer che lo guida ne crea la chiave.
    const k = randomCode(8);
    try { await set(dbRef(`groupKeys/${gid}`), k); key = k; } catch { /* la chiave c'è già: serve conoscerla */ }
  }
  if (!key) return false;
  try {
    await set(dbRef(`groupKeyClaims/${gid}/${S.uid}`), key);
    await set(groupRef(gid, `admins/${S.uid}`), true);
    saveGroupKey(gid, key);
    return true;
  } catch { return false; }
}

/** Una volta autorizzati: serata in corso, stanza nell'elenco del gruppo, giocatori registrati come membri. */
function onGroupAdmin(gid) {
  S.groupAdmin = true;
  set(groupRef(gid, 'current'), { room: S.code, at: serverTimestamp() }).catch(() => {});
  set(groupRef(gid, `rooms/${S.code}`), { at: serverTimestamp() }).catch(() => {});
  $('#gkBanner')?.remove();
  registerMembers();
  if (buildBoard(S.games, S.votes).length) saveNight();
  render();
}

const registered = new Set();
/** I giocatori della stanza diventano membri del gruppo (possono aggiungere giochi, foto, presenze). */
function registerMembers() {
  const gid = S.meta?.groupId;
  if (gid && S.groupAdmin) {
    const patch = {};
    for (const uid of Object.keys(S.players || {})) if (!registered.has(uid) && !uid.startsWith('bot_')) { patch[uid] = true; registered.add(uid); }
    if (Object.keys(patch).length) update(groupRef(gid, 'uids'), patch).catch(() => { for (const u of Object.keys(patch)) registered.delete(u); });
  }
  // Anche l'armadio: chi gioca stasera può aggiungere i giochi che ha portato.
  const aid = S.meta?.armadioId;
  if (aid && S.armAdmin) {
    const patch = {};
    for (const uid of Object.keys(S.players || {})) if (!registeredArm.has(uid) && !uid.startsWith('bot_')) { patch[uid] = true; registeredArm.add(uid); }
    if (Object.keys(patch).length) update(armadioRef(aid, 'uids'), patch).catch(() => { for (const u of Object.keys(patch)) registeredArm.delete(u); });
  }
}
const registeredArm = new Set();

function showGroupKeyBanner() {
  if ($('#gkBanner') || !S.meta?.groupId) return;
  const el = document.createElement('div');
  el.id = 'gkBanner';
  el.className = 'net-banner gk-banner';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<span>🔑 Questo computer non è ancora autorizzato a salvare nel gruppo <b>${esc(S.meta.groupName || '')}</b> (serate, armadio dei giochi, membri). Scrivi la <b>chiave del gruppo</b>: la trovi negli Strumenti del computer che l’ha creato.</span>
    <span class="gk-row"><label class="sr-only" for="gkInput">Chiave del gruppo</label><input class="input code-input code-input--8" id="gkInput" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX">
    <button type="button" class="btn-sec btn-sec--sm" id="gkGo">Conferma</button><button type="button" class="link-btn" id="gkLater">Più tardi</button></span>`;
  document.body.appendChild(el);
  $('#gkInput', el).addEventListener('input', (e) => { const v = normalizeCode(e.target.value, 8); e.target.value = v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v; });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('#gkLater')) { el.remove(); return; }
    if (!e.target.closest('#gkGo')) return;
    const ok = await ensureGroupAdmin(S.meta.groupId, $('#gkInput', el).value).catch(() => false);
    if (ok) { toast('Computer autorizzato: la serata si salva nel gruppo'); onGroupAdmin(S.meta.groupId); }
    else toast('Chiave del gruppo sbagliata.', 'error');
  });
}

function watchGroup() {
  const gid = S.meta?.groupId;
  if (!gid || S.groupWatching === gid) return;
  S.groupWatching = gid;
  // I telefoni con il profilo del gruppo trovano da soli la serata in corso (solo se questo computer è autorizzato).
  ensureGroupAdmin(gid).then((ok) => { if (ok) onGroupAdmin(gid); else { S.groupAdmin = false; showGroupKeyBanner(); } }).catch(() => {});
  const paths = { group: 'info', ...(S.meta?.armadioId ? {} : { library: 'library' }), nights: 'nights', identity: 'identity', next: 'next', photos: `photos/${S.code}`, privacy: 'privacy' };
  for (const [key, path] of Object.entries(paths)) {
    onValue(groupRef(gid, path), (snap) => {
      S[key] = snap.val() || (key === 'group' || key === 'next' || key === 'privacy' ? null : {});
      render();
    }, (err) => toast(explainError(err), 'error'));
  }
}

// ---------------------------------------------------------------------------
// Identità del gruppo: emblema, motto, colore
// ---------------------------------------------------------------------------

const EMBLEMS = ['🎲', '🃏', '♟️', '🧩', '👑', '🦉', '🐉', '🦊', '🐙', '🍕', '🍻', '🔥', '⚡', '🌙', '⭐', '🚀', '🏴‍☠️', '🧙', '🤖', '👾', '🎯', '🏆', '💀', '🌈'];
const GROUP_COLORS = ['#FFC93C', '#FF5A4E', '#2EC4B6', '#7B5CFA', '#FF8FB1', '#4D96FF', '#8AC926', '#FF924C'];

function emblemHTML(id = S.identity, cls = '') {
  if (id?.logo) return `<img class="emblem emblem--img ${cls}" src="${esc(id.logo)}" alt="">`;
  return id?.emblem ? `<span class="emblem ${cls}" aria-hidden="true">${esc(id.emblem)}</span>` : '';
}

function applyIdentity() {
  const c = S.identity?.color;
  const root = document.documentElement;
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) root.style.setProperty('--group', c); else root.style.removeProperty('--group');
  const el = $('#hdrEmblem');
  if (el) { const h = emblemHTML(); if (el.innerHTML !== h) el.innerHTML = h; }
}

const IdentityPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S.meta?.groupId) return;
    const id = S.identity || {};
    this.logo = id.logo || null;
    this.emblem = id.emblem || null;
    this.color = id.color || null;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="idTitle">
        <div class="panel-head"><h2 id="idTitle">Identità del gruppo</h2><button type="button" class="icon-btn" id="idClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <p class="panel-note"><b>${esc(S.meta.groupName || '')}</b>: emblema, motto e colore compaiono sulla TV, sui telefoni e nell'immagine da condividere.</p>
        <span class="field-label">Emblema</span>
        <div class="emblem-grid">${EMBLEMS.map((e) => `<button type="button" class="emblem-btn" data-emb="${e}" aria-pressed="${this.emblem === e && !this.logo}">${e}</button>`).join('')}
          <button type="button" class="emblem-btn emblem-btn--img" id="idLogoPick" aria-pressed="${Boolean(this.logo)}">${this.logo ? `<img src="${esc(this.logo)}" alt="">` : ICONS.image}</button>
          <input type="file" id="idLogo" accept="image/*" hidden></div>
        <label class="field-label" for="idMotto">Motto</label>
        <input class="input" id="idMotto" maxlength="60" placeholder="Es. Chi perde lava i piatti" value="${esc(id.motto || '')}">
        <span class="field-label">Colore</span>
        <div class="ed-swatches">${GROUP_COLORS.map((c) => `<button type="button" class="ed-sw" data-col="${c}" style="--c:${c}" aria-pressed="${this.color === c}" aria-label="Colore ${c}"></button>`).join('')}</div>
        <div class="claim-actions"><button type="button" class="btn btn-big" id="idSave">${ICONS.check}<span>Salva</span></button></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#idClose')) { this.close(); return; }
      const b = e.target.closest('[data-emb]');
      if (b) { this.emblem = b.dataset.emb; this.logo = null; this.mark(); return; }
      if (e.target.closest('#idLogoPick')) { $('#idLogo', el).click(); return; }
      const c = e.target.closest('[data-col]');
      if (c) { this.color = c.dataset.col; el.querySelectorAll('[data-col]').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); return; }
      if (e.target.closest('#idSave')) {
        const patch = { emblem: this.logo ? null : (this.emblem || null), logo: this.logo || null, motto: cleanName($('#idMotto', el).value, 60) || null, color: this.color || null };
        try { await set(groupRef(S.meta.groupId, 'identity'), patch); toast('Identità del gruppo salvata'); this.close(); } catch (err) { toast(explainError(err), 'error'); }
      }
    });
    $('#idLogo', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { this.logo = await compressImage(await editPhoto(f, 'square'), 240, 0.8); this.mark(); } catch (err) { toast(err.message, 'error'); }
    });
  },
  mark() {
    this.el.querySelectorAll('[data-emb]').forEach((x) => x.setAttribute('aria-pressed', String(!this.logo && x.dataset.emb === this.emblem)));
    const lp = $('#idLogoPick', this.el);
    lp.setAttribute('aria-pressed', String(Boolean(this.logo)));
    lp.innerHTML = this.logo ? `<img src="${esc(this.logo)}" alt="">` : ICONS.image;
  },
  close() { this.el?.remove(); this.el = null; }
};

// ---------------------------------------------------------------------------
// Album della serata (foto ricordo dai telefoni e dalla TV)
// ---------------------------------------------------------------------------

function photoList(photos) {
  return Object.entries(photos || {}).map(([id, p]) => ({ id, ...p })).filter((p) => p.data).sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
}

const AlbumPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  /** room: stanza di cui mostrare le foto (di default quella di stasera). */
  async open(room = S.code, title = 'Album della serata') {
    if (this.el || !S.meta?.groupId) return;
    this.room = room;
    this.slide = null;
    this.sig = null;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide panel--album" role="dialog" aria-modal="true" aria-labelledby="alTitle">
        <div class="panel-head"><h2 id="alTitle">${esc(title)}</h2>
          <div class="rg-row">${room === S.code ? `<button type="button" class="btn-sec btn-sec--sm" id="alAdd">${ICONS.image}<span>Aggiungi foto</span></button><input type="file" id="alFile" accept="image/*" hidden>` : ''}
          <button type="button" class="btn-sec btn-sec--sm" id="alShow">${ICONS.play}<span>Presentazione</span></button>
          <button type="button" class="icon-btn" id="alClose" aria-label="Chiudi">${ICONS.x}</button></div></div>
        <div class="album-grid" id="alGrid"><p class="muted">Carico le foto…</p></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#alClose')) { this.close(); return; }
      if (e.target.closest('#alAdd')) { $('#alFile', el).click(); return; }
      if (e.target.closest('#alShow')) { this.show(0); return; }
      const d = e.target.closest('[data-delphoto]');
      if (d && confirm('Togliere questa foto dall’album?')) { remove(groupRef(S.meta.groupId, `photos/${this.room}/${d.dataset.delphoto}`)).catch((err) => toast(explainError(err), 'error')); return; }
      const ph = e.target.closest('[data-photo]');
      if (ph) this.show(Number(ph.dataset.photo));
    });
    $('#alFile', el)?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = await compressPhoto(f);
        await set(push(groupRef(S.meta.groupId, `photos/${this.room}`)), { data, uid: S.uid, by: 'TV', at: serverTimestamp() });
      } catch (err) { if (!err.cancelled) toast(explainError(err), 'error'); }
    });
    if (room !== S.code) {
      const snap = await get(groupRef(S.meta.groupId, `photos/${room}`)).catch(() => null);
      this.photos = photoList(snap?.val());
    }
    this.update();
  },
  list() { return this.room === S.code ? photoList(S.photos) : (this.photos || []); },
  update() {
    if (!this.el) return;
    const list = this.list();
    const sig = list.map((p) => p.id).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    $('#alGrid', this.el).innerHTML = list.length ? list.map((p, i) => `
      <figure class="polaroid" style="--r:${((i * 37) % 7) - 3}deg">
        <button type="button" class="polaroid-img" data-photo="${i}" aria-label="Apri la foto"><img src="${esc(p.data)}" alt="${esc(p.caption || 'Foto ricordo')}"></button>
        <figcaption>${esc(p.caption || '')}<small>${esc(p.by || '')}${p.game ? ` · ${esc(p.game)}` : ''}</small></figcaption>
        ${this.room === S.code ? `<button type="button" class="lib-del" data-delphoto="${esc(p.id)}" aria-label="Togli la foto">${ICONS.x}</button>` : ''}
      </figure>`).join('') : `<p class="muted">${this.room === S.code ? 'Ancora nessuna foto. Dai telefoni: "Foto ricordo" nella schermata di attesa.' : 'Nessuna foto per questa serata.'}</p>`;
  },
  show(i) {
    const list = this.list();
    if (!list.length) return;
    clearInterval(this.timer);
    let idx = i;
    const box = document.createElement('div');
    box.className = 'slideshow';
    const paint = () => {
      const p = list[idx % list.length];
      box.innerHTML = `<figure><img src="${esc(p.data)}" alt=""><figcaption>${esc(p.caption || '')} <small>${esc(p.by || '')}</small></figcaption></figure><p class="muted">${(idx % list.length) + 1} / ${list.length} · tocca per chiudere</p>`;
    };
    paint();
    this.timer = setInterval(() => { idx++; paint(); }, 4500);
    box.addEventListener('click', () => { clearInterval(this.timer); box.remove(); });
    document.body.appendChild(box);
  },
  close() { clearInterval(this.timer); document.querySelector('.slideshow')?.remove(); this.el?.remove(); this.el = null; this.sig = ''; }
};

// ---------------------------------------------------------------------------
// Prossima serata (data, luogo, presenze)
// ---------------------------------------------------------------------------

const RSVP_LABEL = { si: 'Ci sono', forse: 'Forse', no: 'Non ci sono' };

function nextNightHTML(withForm = true) {
  const nx = S.next;
  const at = Number(nx?.at) || 0;
  const rs = Object.values(nx?.rsvp || {});
  const by = (a) => rs.filter((r) => r.answer === a).map((r) => r.name);
  const local = at ? new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return `
    <section class="card stat-card next-card-cal">
      <h2>📅 Prossima serata</h2>
      ${at ? `<p class="next-when">${esc(new Date(at).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}${nx.place ? ` · ${esc(nx.place)}` : ''}</p>
        ${nx.note ? `<p class="muted">${esc(nx.note)}</p>` : ''}
        <div class="rsvp-cols">${['si', 'forse', 'no'].map((a) => `<div><b>${RSVP_LABEL[a]} (${by(a).length})</b><p>${esc(by(a).join(', ')) || '—'}</p></div>`).join('')}</div>` : '<p class="muted">Nessuna data fissata. Le presenze si segnano dal telefono.</p>'}
      ${withForm ? `<form class="next-form" id="nxForm" novalidate>
        <label class="sr-only" for="nxAt">Data e ora</label><input class="input" type="datetime-local" id="nxAt" value="${local}">
        <label class="sr-only" for="nxPlace">Luogo</label><input class="input" id="nxPlace" maxlength="60" placeholder="Dove? (es. da Giulia)" value="${esc(nx?.place || '')}">
        <button type="submit" class="btn-sec">${at ? 'Aggiorna' : 'Fissa la data'}</button>
        ${at ? '<button type="button" class="link-btn" id="nxClear">Cancella</button>' : ''}
      </form>` : ''}
      ${at ? '<button type="button" class="btn-sec btn-sec--sm" id="nxIcs">📅 <span>Invito per il calendario (.ics)</span></button>' : ''}
    </section>`;
}

async function saveNextNight(atStr, place) {
  const at = atStr ? new Date(atStr).getTime() : 0;
  if (!at) throw userError('Scegli data e ora.');
  const same = Number(S.next?.at) === at;
  await set(groupRef(S.meta.groupId, 'next'), { at, place: cleanName(place, 60) || null, note: S.next?.note || null, rsvp: same ? (S.next?.rsvp || null) : null });
}

// ---------------------------------------------------------------------------
// Scheda completa del gioco (ludoteca avanzata)
// ---------------------------------------------------------------------------

const GameSheet = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(id) {
    this.close();
    const it = S.library?.[id];
    if (!it) return;
    this.id = id;
    this.eanClear = false;
    this.image = it.image || it.thumb || null;
    this.imageChanged = false;
    const rec = gameRecord(S.nights, it.name);
    const opt = (vals, cur, empty) => `<option value="">${empty}</option>` + vals.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const bases = libraryItems().filter((x) => x.id !== id && !x.baseId).map((x) => [x.id, x.name]);
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="gsTitle">
        <div class="panel-head"><h2 id="gsTitle">${esc(it.name)}</h2><button type="button" class="icon-btn" id="gsClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="gs-record">
          <span><b>${rec.matches}</b> partite</span>
          <span><b>${rec.avg !== null ? fmt(rec.avg) : '—'}</b> media di sempre</span>
          <span><b>${rec.minutes ? `${rec.minutes} min` : '—'}</b> durata reale</span>
          <span><b>${rec.last ? new Date(rec.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'mai'}</b> ultima volta</span>
          <span><b>${rec.consensus !== null ? `${rec.consensus}%` : '—'}</b> consenso</span>
          <span><b>${rec.champion ? esc(rec.champion.name) : '—'}</b> ${rec.champion ? `vince di più (${rec.champion.wins})` : 'campione'}</span>
          <span><b>Lv ${rec.level}</b> livello del gioco</span>
        </div>
        <div class="gs-grid">
          <button type="button" class="lib-add-img ${this.image ? 'has-img' : ''}" id="gsPick" aria-label="Cambia la foto">${this.image ? `<img src="${esc(this.image)}" alt="">` : ICONS.image}</button>
          <input type="file" id="gsFile" accept="image/*" hidden>
          <label class="gs-f gs-f--wide"><span class="field-label">Nome</span><input class="input" id="gsName" maxlength="40" value="${esc(it.name)}"></label>
          <label class="gs-f"><span class="field-label">Giocatori da</span><select class="input select" id="gsMin">${playersOptions(it.minPlayers, '—')}</select></label>
          <label class="gs-f"><span class="field-label">a</span><select class="input select" id="gsMax">${playersOptions(it.maxPlayers, '—')}</select></label>
          <label class="gs-f"><span class="field-label">Durata</span><select class="input select" id="gsDur">${durationOptions(it.duration)}</select></label>
          <label class="gs-f"><span class="field-label">Modalità</span><select class="input select" id="gsMode">${opt(Object.entries(GAME_MODES), it.mode, '—')}</select></label>
          <label class="gs-f"><span class="field-label">Peso / difficoltà</span><select class="input select" id="gsWeight">${opt([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((w) => [w, `${String(w).replace('.', ',')} / 5`]), it.weight, '—')}</select></label>
          <label class="gs-f gs-f--wide"><span class="field-label">Categorie e meccaniche (separate da virgola)</span><input class="input" id="gsTags" maxlength="120" placeholder="party, deduzione, bluff" value="${esc(tagsOf(it).join(', '))}"></label>
          <label class="gs-f"><span class="field-label">Editore</span><input class="input" id="gsPub" maxlength="40" value="${esc(it.publisher || '')}"></label>
          <label class="gs-f"><span class="field-label">Anno</span><input class="input" id="gsYear" type="number" min="1900" max="2100" value="${esc(it.year || '')}"></label>
          <label class="gs-f"><span class="field-label">Lingua</span><input class="input" id="gsLang" maxlength="20" value="${esc(it.language || '')}"></label>
          <label class="gs-f"><span class="field-label">Di chi è</span><input class="input" id="gsOwner" maxlength="24" value="${esc(it.owner || (it.addedBy && it.addedBy !== 'TV' ? it.addedBy : ''))}"></label>
          <label class="gs-f"><span class="field-label">Stato</span><select class="input select" id="gsStatus">${opt(Object.entries(GAME_STATUS).filter(([k]) => k !== 'posseduto'), it.status === 'posseduto' ? '' : it.status, 'Disponibile')}</select></label>
          <label class="gs-f"><span class="field-label">Prestato a</span><input class="input" id="gsLoan" maxlength="24" value="${esc(it.loanTo || '')}"></label>
          <label class="gs-f gs-f--wide"><span class="field-label">Espansione di</span><select class="input select" id="gsBase">${opt(bases, it.baseId, 'È un gioco base')}</select></label>
          <label class="gs-f gs-f--full"><span class="field-label">Regole in breve <span class="muted">(compaiono sulla TV e sui telefoni prima di giocare)</span></span><textarea class="input" id="gsRules" maxlength="600" rows="3" placeholder="Obiettivo, turno, come si vince">${esc(it.rules || '')}</textarea></label>
          <label class="gs-f gs-f--wide"><span class="field-label">Preparazione <span class="muted">(un punto per riga)</span></span><textarea class="input" id="gsSetup" maxlength="300" rows="3" placeholder="Mescola le carte&#10;5 carte a testa">${esc(it.setup || '')}</textarea></label>
          <label class="gs-f gs-f--wide"><span class="field-label">Video delle regole (link https)</span><input class="input" id="gsVideo" type="url" maxlength="200" placeholder="https://www.youtube.com/…" value="${esc(it.video || '')}">
            ${it.ean ? `<small class="muted">Codice a barre: ${esc(it.ean)} <button type="button" class="link-btn" id="gsEanClear">togli</button></small>` : '<small class="muted">Codice a barre: si collega inquadrando la scatola dal telefono.</small>'}</label>
        </div>
        <p class="form-error" id="gsErr" role="alert"></p>
        <div class="claim-actions"><button type="button" class="btn btn-big" id="gsSave">${ICONS.check}<span>Salva</span></button></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#gsClose')) { this.close(); return; }
      if (e.target.closest('#gsPick')) { $('#gsFile', el).click(); return; }
      if (e.target.closest('#gsSave')) this.save();
      if (e.target.closest('#gsEanClear')) { this.eanClear = true; e.target.closest('small').textContent = 'Codice a barre tolto (salva per confermare).'; }
    });
    $('#gsFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { this.image = await gameImage(f); this.imageChanged = true; const b = $('#gsPick', el); b.innerHTML = `<img src="${this.image}" alt="">`; b.classList.add('has-img'); } catch (err) { if (!err.cancelled) toast(err.message, 'error'); }
    });
  },
  async save() {
    const v = (id) => $(id, this.el).value.trim();
    const num = (id) => Number(v(id)) || null;
    const name = cleanName(v('#gsName'));
    const err = $('#gsErr', this.el);
    if (!name) { err.textContent = 'Il nome non può essere vuoto.'; return; }
    const same = findLibrary(name);
    if (same && same.id !== this.id) { err.textContent = 'C’è già un altro gioco con questo nome.'; return; }
    if (num('#gsMin') && num('#gsMax') && num('#gsMin') > num('#gsMax')) { err.textContent = 'Il minimo di giocatori è più alto del massimo.'; return; }
    if (v('#gsVideo') && !/^https:\/\/[^\s"<>]+$/.test(v('#gsVideo'))) { err.textContent = 'Il link del video deve iniziare con https://'; return; }
    const year = num('#gsYear');
    const status = v('#gsStatus') || null;
    const patch = {
      name, image: this.image || null,
      minPlayers: num('#gsMin'), maxPlayers: num('#gsMax'), duration: num('#gsDur'),
      mode: v('#gsMode') || null, weight: num('#gsWeight'),
      tags: v('#gsTags') ? [...new Set(v('#gsTags').split(',').map((t) => cleanName(t, 20)).filter(Boolean))].slice(0, 8) : null,
      publisher: cleanName(v('#gsPub'), 40) || null, year: year && year >= 1900 && year <= 2100 ? year : null,
      language: cleanName(v('#gsLang'), 20) || null, owner: cleanName(v('#gsOwner'), 24) || null,
      status, loanTo: status === 'prestato' ? (cleanName(v('#gsLoan'), 24) || null) : null,
      baseId: v('#gsBase') || null,
      rules: $('#gsRules', this.el).value.trim().slice(0, 600) || null,
      setup: $('#gsSetup', this.el).value.trim().slice(0, 300) || null,
      video: /^https:\/\/[^\s"<>]+$/.test(v('#gsVideo')) ? v('#gsVideo').slice(0, 200) : null,
      ...(this.eanClear ? { ean: null } : {})
    };
    try {
      if (S.meta?.armadioId) {
        const before = S.library?.[this.id] || {};
        delete patch.image;
        await saveGame(S.meta.armadioId, this.id, patch, this.imageChanged ? { full: this.image || null } : {});
        armLog(S.meta.armadioId, { op: 'edit', item: this.id, name, by: 'TV', msg: before.name !== name ? `prima: ${before.name}` : '' });
      } else await update(libRef(this.id), patch);
      toast(`${name} aggiornato`);
      this.close();
    } catch (e) { err.textContent = explainError(e); }
  },
  close() { this.el?.remove(); this.el = null; }
};

/** Persone conosciute dal gruppo (per la ricerca "che Andrea non odia"). */
function knownPeople() {
  const out = {};
  for (const n of Object.values(S.nights || {})) for (const [k, pp] of Object.entries(n?.people || {})) out[k] = pp.name;
  for (const p of activePlayers(S.players)) out[personKey(p)] = p.name;
  return Object.entries(out).map(([key, name]) => ({ key, name }));
}

function filterChips(f) {
  const people = Object.fromEntries(knownPeople().map((p) => [p.key, p.name]));
  const out = [];
  if (f.players) out.push(`${f.players} giocatori`);
  if (f.maxMin) out.push(`max ${f.maxMin} min`);
  if (f.mode) out.push(GAME_MODES[f.mode]);
  if (f.maxWeight) out.push('leggeri');
  if (f.minWeight) out.push('impegnativi');
  if (f.tag) out.push(`#${f.tag}`);
  if (f.never) out.push('mai giocati');
  if (f.staleDays) out.push(`non giocati da ${f.staleDays} giorni`);
  if (f.notHatedBy) out.push(`che ${people[f.notHatedBy] || 'lui/lei'} non odia`);
  if (f.available) out.push('disponibili');
  return out;
}

// ---------------------------------------------------------------------------
// Musica, atmosfera, ticker, soundboard, intervallo
// ---------------------------------------------------------------------------

/** Atmosfera musicale adatta al momento della serata (modalità automatica). */
function moodNow() {
  const phase = S.state?.phase;
  if (S.state?.paused) return 'pausa';
  if (phase === 'voting') return 'suspense';
  if (phase === 'awards' || phase === 'poll') return 'festa';
  return 'lounge';
}

let musicTimer = null;
function syncMusic() {
  const mode = Music.mode();
  if (mode === 'off' || isMuted()) { if (Music.playing() || Music.wanted) Music.stop(); return; }
  // Durante il reveal la musica tace: parlano i tamburi e le carte.
  const quiet = (S.revealQuietUntil || 0) - Date.now();
  if (quiet > 0 && S.state?.phase === 'reveal') {
    if (Music.playing()) Music.stop();
    clearTimeout(musicTimer);
    musicTimer = setTimeout(syncMusic, quiet + 50);
    return;
  }
  const mood = mode === 'auto' ? moodNow() : mode;
  let level = 0;
  if (mood === 'suspense' && S.state?.phase === 'voting') {
    const votes = S.votes?.[S.state.gameId] || {};
    const total = expectedVoters(votes).length;
    const voted = activePlayers(S.players).filter((p) => votes[p.uid]).length;
    const missing = total - voted;
    level = total > 1 && missing === 1 ? 2 : total && voted / total >= 0.5 ? 1 : 0;
  }
  Music.play(mood, level);
}
window.addEventListener('gnr-music', () => syncMusic());
// Per la pagina di verifica e per chi vuole curiosare dalla console.
window.gnrDebug = { music: () => ({ mood: Music.mood, level: Music.level, playing: Music.playing(), mode: Music.mode() }), atmo: () => Atmo.scene };

function toggleMusic() {
  const cur = Music.mode();
  if (cur === 'off') {
    const back = localStorage.getItem('gnr_music_last') || 'auto';
    Music.setMode(back);
    if (isMuted()) setMuted(false);
    toast(`Musica: ${MUSIC_MODES.find(([k]) => k === back)?.[1] || 'accesa'}`);
  } else {
    localStorage.setItem('gnr_music_last', cur);
    Music.setMode('off');
    toast('Musica spenta');
  }
  syncMusic();
  const sel = $('#tlMusic');
  if (sel) sel.value = Music.mode();
}

/** Atmosfera sullo sfondo: scelta negli strumenti, oppure automatica dal gioco in corso. */
function autoAtmo() {
  const phase = S.state?.phase;
  let item = null;
  if ((phase === 'voting' || phase === 'reveal') && S.games[S.state?.gameId]) {
    const g = S.games[S.state.gameId];
    item = (g.libraryId && S.library?.[g.libraryId]) || findLibrary(g.name) || g;
  } else if (phase === 'idle') {
    const name = S.state?.playName || S.draft?.name;
    item = (S.draft?.libraryId && S.library?.[S.draft.libraryId]) || (name && findLibrary(name)) || (name ? { name } : null);
  } else if (phase === 'awards') return 'festa';
  const a = item ? atmoForGame(item) : 'none';
  return a !== 'none' ? a : isShowTheme() ? 'palco' : (document.documentElement.dataset.theme === 'night' ? 'stelle' : 'none');
}
function syncAtmo() {
  const a = S.meta?.atmosphere || 'none';
  // Con il tema Show lo schermo non resta mai fermo: senza un'atmosfera scelta c'è il palcoscenico.
  Atmo.set(a === 'auto' ? autoAtmo() : a === 'none' && isShowTheme() ? 'palco' : a);
}
window.addEventListener('gnr-theme', () => syncAtmo());

function gossipList() {
  return Object.entries(S.gossip || {}).map(([id, g]) => ({ id, ...g })).filter((g) => g.text)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)).slice(0, 12);
}

const factsCache = { ref: null, next: null, list: [] };
function cachedFacts() {
  if (factsCache.ref !== S.nights || factsCache.next !== S.next) {
    factsCache.ref = S.nights;
    factsCache.next = S.next;
    try { factsCache.list = groupFacts({ nights: S.nights, library: S.library, next: S.next }); } catch { factsCache.list = []; }
  }
  return factsCache.list;
}

function newsTonight(board = buildBoard(S.games, S.votes)) {
  const start = Number(S.meta?.createdAt) || 0;
  return tonightNews({ board, players: S.players, wins: winsByPlayer(board), minutes: start ? Math.floor((Date.now() - start) / 60000) : 0, seers: seersByPlayer(board) });
}

/** Ticker "Ultim'ora" in basso: pettegolezzi dai telefoni, notizie della serata, curiosità del gruppo. */
const Ticker = {
  el: null,
  sig: '',
  seen: null,
  sync() {
    const phase = S.state?.phase;
    const on = Boolean(S.meta?.ticker) && !['lobby', 'awards'].includes(phase);
    document.documentElement.classList.toggle('has-ticker', on);
    if (!on) { this.el?.remove(); this.el = null; this.sig = ''; return; }
    const gossip = gossipList();
    const items = [
      ...gossip.map((g) => ({ k: 'g', text: `🗣️ «${g.text}»` })),
      ...newsTonight().map((t) => ({ k: 'n', text: `📰 ${t}` })),
      ...cachedFacts().slice(0, 5).map((f) => ({ k: 'f', text: `${f.icon} ${f.text}` }))
    ];
    if (!items.length) items.push({ k: 'n', text: '📰 La serata è appena cominciata: scrivete i vostri pettegolezzi dal telefono (pulsante Tavolo)!' });
    const sig = JSON.stringify(items.map((i) => i.text));
    if (sig === this.sig) return;
    this.sig = sig;
    const fresh = this.seen ? gossip.filter((g) => !this.seen.has(g.id)) : [];
    this.seen = new Set(gossip.map((g) => g.id));
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'ticker';
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = '<span class="ticker-label">Ultim’ora</span><div class="ticker-view"><div class="ticker-track" id="tickerTrack"></div></div>';
      document.body.appendChild(this.el);
    }
    const ordered = fresh.length ? [...fresh.map((g) => ({ k: 'g', text: `🗣️ «${g.text}»` })), ...items.filter((i) => !fresh.some((g) => i.text === `🗣️ «${g.text}»`))] : items;
    const html = ordered.map((i) => `<span class="ticker-item ticker-item--${i.k}">${esc(i.text)}</span>`).join('<span class="ticker-sep">◆</span>');
    const track = $('#tickerTrack', this.el);
    track.innerHTML = `${html}<span class="ticker-sep">◆</span>${html}`;
    const chars = ordered.reduce((a, i) => a + i.text.length, 0);
    track.style.setProperty('--dur', `${Math.max(25, Math.round(chars * 0.22))}s`);
    track.classList.remove('is-running');
    void track.offsetWidth;
    track.classList.add('is-running');
    if (fresh.length) ding();
  }
};

/** Effetti della soundboard chiesti dai telefoni (o dalla regia). */
const doneSfx = new Set();
const sfxLast = {};
const sfxQueue = [];
let sfxBusyUntil = 0;
function processSfx() {
  for (const [id, x] of Object.entries(S.sfx || {})) {
    if (doneSfx.has(id)) continue;
    doneSfx.add(id);
    remove(roomRef(S.code, `sfx/${id}`)).catch(() => {});
    if (!x || (Number(x.at) && Date.now() - Number(x.at) > 20000)) continue;
    if (!S.meta?.soundboard && !x.regia) continue;
    if (Date.now() - (sfxLast[x.by] || 0) < 2500) continue;
    sfxLast[x.by] = Date.now();
    // Uno alla volta: se due telefoni premono insieme, il secondo parte subito dopo (al massimo 2 in attesa).
    if (sfxQueue.length < 2) sfxQueue.push(x);
  }
  playNextSfx();
}
function playNextSfx() {
  if (!sfxQueue.length) return;
  const wait = sfxBusyUntil - Date.now();
  if (wait > 0) { clearTimeout(playNextSfx.t); playNextSfx.t = setTimeout(playNextSfx, wait + 20); return; }
  const x = sfxQueue.shift();
  const why = audioStatus();
  if (why === 'audio da attivare') audioCtx();
  const s = playSfx(x.k);
  sfxBusyUntil = Date.now() + 1400;
  if (s) {
    const who = S.players[x.by]?.name || (x.regia ? 'Regia' : 'Qualcuno');
    const st = audioStatus();
    sfxBubble(`${s.icon} ${who}: ${s.label}${st ? ` · 🔇 ${st}` : ''}`);
    if (st === 'audio da attivare') AudioHint.show();
  }
  if (sfxQueue.length) playNextSfx();
}

/** Avviso "Tocca per attivare l'audio": i browser non suonano finché nessuno ha toccato la pagina. */
const AudioHint = {
  el: null,
  show() {
    if (this.el || !audioBlocked()) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'audio-hint';
    el.innerHTML = '🔇 <span>Tocca qui per attivare l’audio della TV (soundboard, applausi, reveal)</span>';
    el.addEventListener('click', () => { audioCtx(); setTimeout(() => this.hide(), 200); });
    document.body.appendChild(el);
    this.el = el;
  },
  hide() { this.el?.remove(); this.el = null; }
};
window.addEventListener('gnr-audio', () => AudioHint.hide());
function sfxBubble(text) {
  const el = document.createElement('div');
  el.className = 'sfx-bubble';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Intervallo tra un gioco e l'altro: curiosità, foto delle serate passate, trivia. */
const Interval = {
  el: null,
  timer: null,
  idx: 0,
  cards: [],
  autoOn() { return localStorage.getItem('gnr_interval_auto') !== 'off'; },
  setAuto(on) { localStorage.setItem('gnr_interval_auto', on ? 'on' : 'off'); },
  isOpen() { return Boolean(this.el); },

  buildCards() {
    const board = buildBoard(S.games, S.votes);
    const facts = shuffled(cachedFacts()).map((f) => ({ type: 'fact', icon: f.icon, kicker: 'Lo sapevi?', text: f.text }));
    const news = newsTonight(board).map((t) => ({ type: 'news', icon: '📰', kicker: 'Stasera', text: t }));
    const trivia = shuffled(TRIVIA).slice(0, 8).map((t) => ({ type: 'trivia', icon: '🎲', kicker: 'Curiosità ludica', text: t }));
    const photos = photoList(S.photos).map((p) => ({ type: 'photo', data: p.data, caption: p.caption, by: p.by, when: 'Stasera' }));
    const lanes = [facts, trivia, photos, news];
    const out = board.length ? [{ type: 'board', rows: board.slice(0, 3) }] : [];
    for (let i = 0; out.length < 40 && lanes.some((l) => l.length); i++) {
      const lane = lanes[i % lanes.length];
      if (lane.length) out.push(lane.shift());
    }
    return out.length ? out : [{ type: 'trivia', icon: '🎲', kicker: 'Curiosità ludica', text: TRIVIA[0] }];
  },

  async loadPastPhotos() {
    const gid = S.meta?.groupId;
    if (!gid) return;
    const past = shuffled(nightsList(S.nights).filter((n) => n.room !== S.code)).slice(0, 3);
    for (const n of past) {
      const snap = await get(groupRef(gid, `photos/${n.room}`)).catch(() => null);
      const list = photoList(snap?.val()).slice(0, 4);
      if (!this.el || !list.length) continue;
      const when = `Game Night #${n.number} · ${new Date(Number(n.at)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      for (const p of list) this.cards.splice(Math.min(this.cards.length, 1 + Math.floor(Math.random() * this.cards.length)), 0, { type: 'photo', data: p.data, caption: p.caption, by: p.by, when });
    }
  },

  open() {
    if (this.el || !S.meta) return;
    this.cards = this.buildCards();
    this.idx = 0;
    const el = document.createElement('div');
    el.className = 'interval';
    el.id = 'intervalOverlay';
    el.innerHTML = `
      <div class="int-top"><span class="int-kicker">☕ Intervallo</span><span class="int-group">${S.identity?.emblem && !S.identity?.logo ? `${esc(S.identity.emblem)} ` : ''}${esc(S.meta.groupName || '')}</span><span class="int-clock" id="intClock"></span></div>
      <div class="int-stage" id="intStage"></div>
      <p class="int-foot"><span id="intNext"></span><span>Tocca lo schermo o premi un tasto per tornare alla serata</span></p>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', () => this.close());
    this.show();
    this.timer = setInterval(() => { this.idx++; this.show(); }, 9000);
    this.loadPastPhotos();
  },

  show() {
    if (!this.el) return;
    const c = this.cards[this.idx % this.cards.length];
    const stage = $('#intStage', this.el);
    const now = new Date();
    $('#intClock', this.el).textContent = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const next = S.state?.playName || S.draft?.name;
    $('#intNext', this.el).textContent = next ? `Prossimo gioco: ${next}` : '';
    let html = '';
    if (c.type === 'photo') {
      html = `<figure class="int-photo"><img src="${esc(c.data)}" alt=""><figcaption>${esc(c.caption || 'Foto ricordo')}<small>${esc(c.when)}${c.by ? ` · ${esc(c.by)}` : ''}</small></figcaption></figure>`;
    } else if (c.type === 'board') {
      html = `<div class="int-card int-card--board"><p class="int-k">🏆 La classifica di stasera</p><ol>${c.rows.map((r) => `<li><span>${r.rank}</span><b>${esc(r.name)}</b><em>${fmt(r.stats.avg)}</em></li>`).join('')}</ol></div>`;
    } else {
      html = `<div class="int-card int-card--${c.type}"><span class="int-icon" aria-hidden="true">${esc(c.icon)}</span><p class="int-k">${esc(c.kicker)}</p><p class="int-text">${esc(c.text)}</p></div>`;
    }
    stage.innerHTML = html;
  },

  close() {
    clearInterval(this.timer);
    this.timer = null;
    this.el?.remove();
    this.el = null;
    S.lastInput = Date.now();
  }
};

function anyPanelOpen() {
  return [GameSheet, Panel, LibPanel, ProxyVote, ToolsPanel, EditGame, RecoPanel, VotingPanel, IdentityPanel, AlbumPanel, ExportPanel, QrPanel, TablePanel, GameWheel, VideoPanel, Quiz, PlanPanel, RulesPanel].some((p) => p.isOpen()) || ClaimPanel.isOpen() || Boolean($('#eventOverlay'));
}

function checkAutoInterval() {
  const phase = S.state?.phase;
  if (!Interval.autoOn() || Interval.isOpen() || S.state?.paused || !['idle', 'board'].includes(phase)) return;
  if (anyPanelOpen() || document.activeElement?.matches?.('input, textarea, select')) return;
  if (Date.now() - (S.lastInput || Date.now()) > 180000) Interval.open();
}

/** Pannello con un QR e il suo link (ludoteca sul telefono). */
const QrPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(title, url, note = '') {
    this.close();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel qr-panel" role="dialog" aria-modal="true" aria-labelledby="qpTitle">
        <div class="panel-head"><h2 id="qpTitle">${esc(title)}</h2><button type="button" class="icon-btn" id="qpClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="qr qr--big" id="qpQr"></div>
        ${note ? `<p class="panel-note">${note}</p>` : ''}
        <p class="qr-url"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ''))}</a></p>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    renderQR($('#qpQr', el), url);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('#qpClose')) this.close(); });
  },
  close() { this.el?.remove(); this.el = null; }
};

function libraryUrl() {
  const url = publicUrl('ludoteca.html');
  url.search = '';
  if (S.meta?.armadioId) url.searchParams.set('a', S.meta.armadioId);
  else url.searchParams.set('g', S.meta?.groupId || '');
  return url.href;
}

// ---------------------------------------------------------------------------
// Commentatore e resoconti
// ---------------------------------------------------------------------------

function nightNumber() {
  const list = nightsList({ ...(S.nights || {}), ...(S.nights?.[S.code] ? {} : { [S.code]: { at: S.meta?.createdAt, games: { x: {} } } }) });
  return list.find((n) => n.room === S.code)?.number || null;
}

function recapData(board, awards) {
  const wins = winsByPlayer(board);
  const top = Math.max(0, ...Object.values(wins));
  const kings = top ? Object.keys(wins).filter((u) => wins[u] === top).map((u) => playerOrGhost(u).name) : [];
  const mvpA = awards.find((a) => a.key === 'mvp');
  const start = Number(S.meta?.createdAt) || 0;
  const lastAt = Math.max(0, ...Object.values(S.games || {}).map((g) => Number(g?.revealedAt) || 0));
  return {
    group: S.meta?.groupName || '',
    games: board.length,
    minutes: start && lastAt > start ? Math.round((lastAt - start) / 60000) : null,
    top: board[0] ? { name: board[0].name, avg: board[0].stats.avg } : null,
    flop: board.length > 1 ? { name: board[board.length - 1].name, avg: board[board.length - 1].stats.avg } : null,
    kings,
    kingWins: top,
    mvp: mvpA ? mvpA.players.map((p) => p.name) : [],
    awards: awards.filter((a) => a.kind === 'player' && !['mvp', 'wins'].includes(a.key)).map((a) => ({ title: a.title, who: namesList(a.players.map((p) => p.name)) })),
    next: S.next?.at ? new Date(Number(S.next.at)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : null
  };
}

/** Pannello "Condividi ed esporta": immagine, storia verticale, PDF, CSV. */
const ExportPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(board, awards) {
    this.close();
    this.board = board;
    this.awards = awards;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="exTitle">
        <div class="panel-head"><h2 id="exTitle">Condividi ed esporta</h2><button type="button" class="icon-btn" id="exClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="export-grid">
          <button type="button" class="export-opt" id="exImg"><span aria-hidden="true">🖼️</span><b>Immagine della classifica</b><small>Podio, classifica e premi speciali (PNG)</small></button>
          <button type="button" class="export-opt" id="exStory"><span aria-hidden="true">📱</span><b>Storia verticale</b><small>Per Instagram e WhatsApp, 1080 × 1920</small></button>
          <button type="button" class="export-opt" id="exPdf"><span aria-hidden="true">📄</span><b>PDF della serata</b><small>Classifica, premi, commenti e album: scegli “Salva come PDF”</small></button>
          <button type="button" class="export-opt" id="exCsv"><span aria-hidden="true">📊</span><b>CSV</b><small>I risultati da aprire con Excel o Fogli</small></button>
          <button type="button" class="export-opt" id="exVideo"><span aria-hidden="true">🎬</span><b>Video della serata</b><small>Storia animata di 20 secondi con giochi, campioni, premi e foto</small></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#exClose')) { this.close(); return; }
      const b = e.target.closest('.export-opt');
      if (!b) return;
      b.disabled = true;
      try {
        if (b.id === 'exImg') await this.image();
        if (b.id === 'exStory') await this.story();
        if (b.id === 'exPdf') this.pdf();
        if (b.id === 'exVideo') { const data = this.videoData(); this.close(); VideoPanel.open(data); return; }
        if (b.id === 'exCsv') downloadFile(`GameNight_Show_${S.code}_${new Date().toISOString().slice(0, 10)}.csv`, boardCSV(this.board, S.players), 'text/csv;charset=utf-8');
      } catch (err) {
        toast('Non sono riuscito a creare il file.', 'error');
        console.error(err);
      } finally { b.disabled = false; }
    });
  },
  title() { return `${S.identity?.emblem && !S.identity?.logo ? `${S.identity.emblem} ` : ''}${S.meta.groupName || 'La nostra serata'}`; },
  /** Dati per il video riassunto. */
  videoData() {
    const champs = nightChampions(this.board).filter((c) => c.rank <= 3).slice(0, 3).map((c) => ({ name: playerOrGhost(c.uid).name, points: c.points, player: playerOrGhost(c.uid) }));
    const awards = this.awards.filter((a) => a.kind !== 'ach').map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) }));
    return {
      group: S.meta.groupName || 'La nostra serata', subtitle: nightDate(S.meta.createdAt), number: nightNumber(),
      games: this.board.map((r) => ({ name: r.name, avg: r.stats.avg, image: /^data:image\//.test(r.image || '') ? r.image : null })),
      champs, awards, photos: photoList(S.photos).map((p) => p.data)
    };
  },
  async image() {
    const blob = await renderShareImage({ title: this.title(), subtitle: nightDate(S.meta.createdAt), board: this.board, awards: this.awards.filter((a) => a.kind !== 'ach') });
    await shareOrDownload(blob, `GameNight_Show_${new Date().toISOString().slice(0, 10)}.png`, 'La classifica della serata', true);
  },
  async story() {
    const d = recapData(this.board, this.awards);
    const facts = [`${d.games} ${d.games === 1 ? 'gioco' : 'giochi'}`, `${activePlayers(S.players).length} giocatori`, d.minutes ? (d.minutes >= 60 ? `${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min` : `${d.minutes} min`) : ''].filter(Boolean).join(' · ');
    const awards = this.awards.filter((a) => a.kind !== 'ach' && !['mvp', 'wins'].includes(a.key)).map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) }));
    const blob = await renderStoryImage({ title: S.meta.groupName || 'La nostra serata', emblem: S.identity?.logo ? '' : (S.identity?.emblem || ''), color: S.identity?.color, subtitle: nightDate(S.meta.createdAt), number: nightNumber(), board: this.board, mvp: d.mvp, winners: d.kings, facts, awards });
    await shareOrDownload(blob, `GameNight_Show_storia_${new Date().toISOString().slice(0, 10)}.png`, 'La nostra serata', true);
  },
  pdf() {
    const d = recapData(this.board, this.awards);
    const crits = activeCriteria(S.meta.voting);
    const rows = this.board.map((r) => ({
      rank: r.rank, name: r.name, avg: r.stats.avg, n: r.stats.n,
      crit: r.quick ? {} : Object.fromEntries(crits.map((c) => [c.short || c.label, r.stats.crit[c.key] ?? null])),
      mvp: r.stats.mvp.winners.map((u) => playerOrGhost(u).name),
      winners: Object.keys(r.winners || {}).map((u) => playerOrGhost(u).name),
      minutes: r.playedMin || null, audience: r.stats.audience?.n ? r.stats.audience.avg : null, consensus: r.stats.consensus
    }));
    const quotes = [];
    for (const r of this.board) for (const v of [...r.stats.list, ...(r.stats.audience?.list || [])]) if (v.comment) quotes.push({ name: playerOrGhost(v.uid).name, game: r.name, text: v.comment });
    const html = reportHTML({
      group: S.meta.groupName || '', emblem: S.identity?.logo ? '' : (S.identity?.emblem || ''), color: S.identity?.color,
      date: nightDate(S.meta.createdAt), number: nightNumber(),
      facts: [`${d.games} ${d.games === 1 ? 'gioco' : 'giochi'}`, `${activePlayers(S.players).length} giocatori`, d.minutes ? `${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min` : ''].filter(Boolean).join(' · '),
      rows,
      awards: this.awards.filter((a) => a.kind !== 'ach').map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)), value: a.value })),
      achievements: this.awards.filter((a) => a.kind === 'ach').map((a) => ({ title: a.title, who: namesList(a.players.map((p) => p.name)) })),
      quotes: quotes.slice(0, 20),
      photos: photoList(S.photos),
      next: d.next ? `${d.next}${S.next?.place ? `, ${S.next.place}` : ''}` : ''
    });
    if (printReport(html)) toast('Nella finestra di stampa scegli “Salva come PDF”.');
  },
  close() { this.el?.remove(); this.el = null; }
};

function render() {
  if (!WATCHED.every((k) => S.loaded.has(k))) return;
  if (S.meta && S.meta.hostUid !== S.uid) { renderLostRegia(); return; }
  if (S.meta && S.rememberedRoom !== S.code) { S.rememberedRoom = S.code; rememberNight(S.code, { group: S.meta.groupName, gid: S.meta.groupId }); }
  // Dopo un ricaricamento il browser tiene l'audio bloccato finché qualcuno non tocca la TV: lo diciamo.
  if (S.meta?.soundboard && !S.audioHintChecked) { S.audioHintChecked = true; audioCtx(); setTimeout(() => { if (audioBlocked()) AudioHint.show(); }, 1500); }
  watchGroup();
  watchArmadio();
  trackOffline();
  if (!S.meta) { renderRoomGone(); return; }
  trackEvents();
  Save.touch();
  registerMembers();
  let phase = S.state?.phase;
  if (!SCREENS[phase]) phase = 'lobby';
  const gameId = S.state?.gameId || '';
  if ((phase === 'voting' || phase === 'reveal') && !S.games[gameId]) {
    setPhase('idle');
    return;
  }
  if (phase === 'poll' && !S.poll) {
    setPhase('idle');
    return;
  }

  const key = `${phase}:${gameId}`;
  if (key !== S.screenKey) {
    S.screen?.unmount?.();
    S.screenKey = key;
    S.screen = SCREENS[phase];
    app.innerHTML = shellHTML(phase);
    bindShell();
    S.screen.mount($('#screen'));
  }
  updateShell();
  S.screen.update?.();
  Demo.tick();
  maybeTour(phase);
  Panel.update();
  LibPanel.update();
  ClaimPanel.update();
  ProfileClaimPanel.update();
  ToolsPanel.update();
  AlbumPanel.update();
  TablePanel.update();
  PlanPanel.update();
  RulesPanel.update();
  Sand.sync();
  Quiz.update();
  Knocks.sync();
  maybeCleanup();
  applyIdentity();
  processBuzz();
  paintPause();
  paintEvent();
  processCommands();
  processSfx();
  Ticker.sync();
  syncAtmo();
  syncMusic();
  // L'intervallo si chiude da solo se la serata va avanti (per esempio dalla regia).
  if (S.state?.at !== S.lastStateAt) { S.lastStateAt = S.state?.at; S.lastInput = Date.now(); }
  if (Interval.isOpen() && (S.state?.paused || !['idle', 'board'].includes(phase))) Interval.close();
}

/** Tutorial della TV: un giro per schermata, la prima volta che la si vede. */
const TOURS = {
  lobby: [
    { sel: '#lobbyQr', title: 'Si entra dal telefono', text: 'Ognuno inquadra il QR (o scrive il codice) e sceglie nome, personaggio e colore. Non serve installare niente.' },
    { sel: '#slots', title: 'Chi c’è stasera', text: 'Qui compaiono i giocatori man mano che entrano. Con + e − cambi i posti, anche a serata iniziata.' },
    { sel: '#lobbyLock', title: 'Chiudi la stanza', text: 'Quando ci sono tutti, chiudila: chi non è già dentro non può più entrare, nemmeno con una foto del QR.' },
    { sel: '#hdrTools', title: 'Strumenti', text: 'Pausa, tema, musica, effetti, salvataggi, macchina del tempo, Safe Mode, accessibilità e molto altro.' },
    { sel: '#hdrLib', title: 'Armadio', text: 'I giochi del gruppo, con giocatori, durata e foto: la TV li propone e i telefoni li votano.' },
    { sel: '#startBtn', title: 'Si parte!', text: 'Inizia la serata: da qui in poi, dopo ogni partita, si vota il gioco appena giocato.' }
  ],
  idle: [
    { sel: '#libPick', title: 'Cosa giochiamo?', text: 'Tocca un gioco dell’armadio, chiedi i consigli o fai votare i telefoni.' },
    { sel: '#gameName', title: 'Il gioco', text: 'Oppure scrivi il nome: con una foto viene ancora meglio nella classifica.' },
    { sel: '.win-pick', title: 'Chi ha giocato e chi ha vinto', text: 'Tocca un personaggio per segnarlo vincitore, toccalo ancora per segnarlo spettatore (vota come pubblico).' },
    { sel: '#startPlay', title: 'Inizia la partita', text: 'Parte il timer e i telefoni possono pronosticare chi vincerà.' },
    { sel: '#openVote', title: 'Apri la votazione', text: 'A partita finita: i telefoni votano in segreto, la TV svela i voti quando hanno votato tutti.' },
    { sel: '#openTable', title: 'Tavolo e quiz', text: 'Ruota per chi inizia, squadre equilibrate, clessidra e, nelle pause, il quiz del gruppo con le risposte dal telefono.' }
  ],
  voting: [
    { sel: '#voters', title: 'Chi ha votato', text: 'Ogni personaggio si accende quando arriva il suo voto (segreto fino al reveal). Chi ha il telefono fuori uso si può far votare dalla TV.' },
    { sel: '#revealBtn', title: 'Rivela i voti', text: 'Il reveal parte da solo quando hanno votato tutti; da qui lo anticipi.' }
  ],
  reveal: [
    { sel: '.vcards', title: 'Il verdetto', text: 'Le carte si girano dal voto più basso al più alto, poi arriva la media.' },
    { sel: '#nextGame', title: 'E adesso?', text: 'Si passa al prossimo gioco. La classifica della serata si aggiorna da sola.' }
  ],
  board: [
    { sel: '#endNight', title: 'Fine serata', text: 'Quando avete finito, la premiazione svela il podio e i premi speciali, ai giochi e ai giocatori.' }
  ]
};
const CINE_KEY = 'gnr_cine';
function cinematicOn() { try { return localStorage.getItem(CINE_KEY) !== '0'; } catch { return true; } }

function maybeTour(phase) {
  if (!TOURS[phase] || tourOpen() || document.querySelector('.overlay') || S.state?.paused) return;
  clearTimeout(S.tourTimer);
  S.tourTimer = setTimeout(() => {
    if (S.state?.phase === phase && !document.querySelector('.overlay')) runTour(phase, TOURS[phase]);
  }, 900);
}

function shellHTML(phase) {
  return `
    <div class="tv-shell">
      <header class="topbar ${phase === 'lobby' ? 'topbar--lobby' : ''}">
        <div class="brand-wrap">
          <button class="chip chip-btn hdr-back" type="button" id="hdrBack" title="Torna alla schermata precedente">← <span>Indietro</span></button>
          <span class="topbar-emblem" id="hdrEmblem"></span>
          <div class="brand">GameNight <span class="logo-tag logo-tag--sm">Show</span></div>
          ${S.meta?.groupName ? `<span class="topbar-group">${esc(S.meta.groupName)}</span>` : ''}
        </div>
        <div class="topbar-right">
          <a class="chip chip-btn hdr-home" id="hdrHome" href="index.html" title="Home: profilo, armadi, altre serate (la serata resta aperta)">🏠 <span>Home</span></a>
          <span class="chip chip--clock" id="hdrClock" title="Ora e durata della serata"></span>
          ${S.meta?.demo ? '<span class="chip chip--demo" title="Modalità prova: i giocatori finti votano da soli, niente viene salvato">🧪 Prova</span>' : ''}
          <button class="chip chip-btn chip--safe" type="button" id="hdrSafe" hidden title="Safe Mode attiva: tocca per spegnerla">🚨 <span>Safe Mode</span></button>
          <span class="chip">Stanza <b class="code-text">${esc(S.code)}</b><span id="hdrLock" class="hdr-lock" title="Stanza chiusa" hidden> 🔒</span></span>
          <button class="chip chip-btn" type="button" id="hdrPlayers" aria-haspopup="dialog" title="Giocatori e posti (tasto G)">${ICONS.users}<span id="hdrPlayersTxt"></span></button>
          <button class="chip chip-btn chip--end" type="button" id="hdrEnd" ${['awards', 'alltime'].includes(phase) ? 'hidden' : ''} title="Termina la serata adesso (anche a votazione aperta) e passa alla premiazione">🏁 <span>Fine serata</span></button>
          <button class="chip chip-btn" type="button" id="hdrTools" aria-haspopup="dialog" title="Strumenti: pausa, tema, cestino, copie">${ICONS.edit}<span>Strumenti</span></button>
          ${hasLib() ? `<button class="chip chip-btn" type="button" id="hdrLib" aria-haspopup="dialog" title="Armadio (tasto L)">${ICONS.books}<span>Armadio</span></button>` : ''}
          <button class="icon-btn" type="button" id="fsBtn" aria-label="Schermo intero" title="Schermo intero (tasto F)">${ICONS.expand}</button>
          <button class="text-btn" type="button" id="newNightBtn">Nuova serata</button>
        </div>
      </header>
      <main id="screen" class="screen screen--${phase}"></main>
    </div>`;
}

/** Pulsante "Indietro" della TV: torna alla schermata precedente della serata. */
async function goBack() {
  const ph = S.state?.phase;
  try {
    switch (ph) {
      case 'lobby':
        if (!confirm('Tornare alla schermata iniziale? La stanza resta aperta: la riprendi con “Riprendi una serata già iniziata”.')) return;
        localStorage.removeItem(STORE_KEY);
        location.href = location.pathname;
        return;
      case 'idle':
        if (confirm('Tornare alla sala d’attesa con il QR per entrare?')) await setPhase('lobby');
        return;
      case 'voting': $('#cancelGame')?.click(); return;
      case 'poll': await setPhase('idle'); remove(roomRef(S.code, 'poll')).catch(() => {}); return;
      case 'awards': await setPhase('board'); return;
      case 'alltime': backFromAllTime(); return;
      default: await setPhase('idle');
    }
  } catch (err) { toast(explainError(err), 'error'); }
}

// Tasto Indietro di Android (app): nella serata fa come "← Indietro" in alto, nell'armadio torna alla creazione.
window.addEventListener('gnr:back', (e) => {
  if (S.screenKey === 'armadio' && $('#armBack')) { e.preventDefault(); $('#armBack').click(); return; }
  if (S.code && S.state && document.getElementById('hdrBack')) { e.preventDefault(); goBack(); }
});

function bindShell() {
  $('#hdrBack').addEventListener('click', goBack);
  $('#fsBtn').addEventListener('click', toggleFullscreen);
  $('#hdrPlayers').addEventListener('click', () => Panel.open());
  $('#hdrLib')?.addEventListener('click', () => LibPanel.open());
  $('#hdrTools')?.addEventListener('click', () => ToolsPanel.open());
  $('#hdrEnd')?.addEventListener('click', () => endNight());
  $('#newNightBtn').addEventListener('click', newNight);
  $('#hdrSafe').addEventListener('click', () => { if (confirm('Spegnere la Safe Mode e riaccendere animazioni, musica ed effetti?')) applySafeMode(false); });
}

function paintClock() {
  const el = $('#hdrClock');
  if (!el || !S.meta) return;
  const now = new Date();
  const hm = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const start = Number(S.meta.createdAt) || 0;
  const mins = start ? Math.floor((Date.now() - start) / 60000) : null;
  const night = mins === null ? '' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
  const games = Object.values(S.games || {}).filter((g) => g?.status === 'revealed').length;
  el.innerHTML = `${ICONS.clock}<span>${hm}${night ? ` · ${night}` : ''}${games ? ` · ${games} ${games === 1 ? 'partita' : 'partite'}` : ''}</span>`;
}

function updateShell() {
  paintClock();
  const n = activePlayers(S.players).length;
  const el = $('#hdrPlayersTxt');
  if (el) el.textContent = `${n} / ${S.meta.maxPlayers || DEFAULT_PLAYERS} giocatori`;
  const lock = $('#hdrLock');
  if (lock) lock.hidden = !S.meta.locked;
  const safe = $('#hdrSafe');
  if (safe) safe.hidden = !isSafeMode();
}

async function newNight() {
  if (!confirm('Iniziare una nuova serata? La TV creerà una stanza nuova; quella attuale resta salvata.')) return;
  await Save.snap('Prima di chiudere la serata', 'phase');
  await Save.now();
  await Vault.close(S.code).catch(() => {});
  localStorage.removeItem(STORE_KEY);
  location.href = location.pathname;
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function setupGlobalKeys() {
  const touch = () => { S.lastInput = Date.now(); };
  document.addEventListener('pointerdown', touch, true);
  document.addEventListener('wheel', touch, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => {
    touch();
    if (tourOpen()) return;
    if (Interval.isOpen()) { e.preventDefault(); Interval.close(); return; }
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ClaimPanel.isOpen() || Quiz.isOpen()) return;
    const open = [PlanPanel, RulesPanel, TablePanel, GameWheel, VideoPanel, TimeMachine, IntegrityPanel, TransferPanel, QrPanel, ExportPanel, GameSheet, Panel, LibPanel, ProxyVote, ToolsPanel, EditGame, RecoPanel, VotingPanel, IdentityPanel, AlbumPanel].find((p) => p.isOpen());
    if (e.key === 'Escape' && open) { e.preventDefault(); open.close(); return; }
    if (open) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); return; }
    if ((e.key === 'm' || e.key === 'M') && S.code && S.meta) { e.preventDefault(); toggleMusic(); return; }
    if ((e.key === 'i' || e.key === 'I') && S.code && S.meta && ['idle', 'board'].includes(S.state?.phase)) { e.preventDefault(); Interval.open(); return; }
    if ((e.key === 'g' || e.key === 'G') && S.code && S.meta) { e.preventDefault(); Panel.open(); return; }
    if ((e.key === 'l' || e.key === 'L') && hasLib()) { e.preventDefault(); LibPanel.open(); return; }
    if ((e.key === 'p' || e.key === 'P') && S.code && S.meta) { e.preventDefault(); setPaused(!S.state?.paused).catch(() => {}); return; }
    if ((e.key === 't' || e.key === 'T') && S.code && S.meta && S.state?.phase !== 'lobby') { e.preventDefault(); TablePanel.open(); return; }
    if ((e.key === 'q' || e.key === 'Q') && S.code && S.meta && ['idle', 'board'].includes(S.state?.phase)) { e.preventDefault(); Quiz.open(); return; }
    S.screen?.onKey?.(e);
  });
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* non supportato: pazienza */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.code) requestWakeLock();
});

function renderQR(el, text) {
  el.innerHTML = qrSVG(text);
}

function namesList(names) {
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1];
}

function playerOrGhost(uid) {
  return { uid, ...(S.players[uid] || { name: 'Ex giocatore' }) };
}

// ---------------------------------------------------------------------------
// Giocatori che entrano ed escono durante la serata
// ---------------------------------------------------------------------------

/**
 * Il telefono di questo giocatore è collegato? Finché nessun telefono ha mai
 * segnalato la presenza (es. regole vecchie), si considerano tutti collegati.
 */
function isOnline(uid) {
  if (S.state?.paused || String(uid).startsWith('bot_')) return true;
  const pres = S.presence || {};
  const beat = Beats.fresh(uid);
  // Il battito (ogni 5 s) si accorge in 15 s di un telefono spento, bloccato o senza rete.
  if (beat === false) return false;
  if (!Object.keys(pres).length) return true;
  return Boolean(pres[uid]);
}

/** Ricorda da quando ogni telefono risulta scollegato. */
function trackOffline() {
  for (const p of activePlayers(S.players)) {
    if (isOnline(p.uid)) {
      delete S.offlineSince[p.uid];
      S.skipWait.delete(p.uid); // "Non aspettare" vale finché il telefono non si ricollega
    } else if (!S.offlineSince[p.uid]) {
      S.offlineSince[p.uid] = Date.now();
    }
  }
}

/** Millisecondi di attesa rimasti per un telefono appena scollegato (0 = non si aspetta più). */
function graceLeft(uid) {
  if (isOnline(uid) || S.skipWait.has(uid)) return 0;
  const since = S.offlineSince[uid];
  return since ? Math.max(0, GRACE_MS - (Date.now() - since)) : 0;
}

/**
 * Giocatori presenti che la votazione deve aspettare: collegati, che hanno già
 * votato, o scollegati da poco (magari stanno rientrando dopo un crash).
 */
function expectedVoters(votedMap = {}) {
  return activePlayers(S.players).filter((p) => votedMap[p.uid] || isOnline(p.uid) || graceLeft(p.uid) > 0);
}

/** Trofei guadagnati nelle serate precedenti del gruppo, per chiave persona. */
function trophyMap() {
  const sig = Object.keys(S.nights || {}).join('|');
  if (S.trophySig !== sig) { S.trophySig = sig; S.trophyCache = trophies(S.nights, S.code); }
  return S.trophyCache || {};
}
function trophyBadges(p) {
  const t = trophyMap()[personKey(p)];
  if (!t) return '';
  return `${t.crown ? `<span class="trophy trophy--crown" title="MVP della serata precedente">${ICONS.crown}</span>` : ''}${t.star ? `<span class="trophy trophy--star" title="MVP di sempre">${ICONS.star}</span>` : ''}`;
}
function trophyTitle(p) {
  return trophyMap()[personKey(p)]?.title || '';
}

function hasVoted(uid) {
  return Object.values(S.votes || {}).some((g) => g && g[uid]);
}

/** Cambia i posti: mai sotto i giocatori presenti, mai oltre il massimo. */
function changeSeats(delta) {
  const n = activePlayers(S.players).length;
  const max = S.meta.maxPlayers || DEFAULT_PLAYERS;
  const next = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n, max + delta));
  if (next === max) {
    if (delta < 0) toast('Per togliere un posto, prima segna come uscito chi va via.', 'warn');
    if (delta > 0) toast(`Il massimo è ${MAX_PLAYERS} giocatori.`, 'warn');
    return;
  }
  update(roomRef(S.code, 'meta'), { maxPlayers: next }).catch((err) => toast(explainError(err), 'error'));
}

/** Chi va via: se non ha mai votato si toglie del tutto, altrimenti resta nello storico. */
function markOut(uid) {
  const p = S.players[uid];
  if (!p) return;
  const op = hasVoted(uid)
    ? update(roomRef(S.code, `players/${uid}`), { away: true })
    : remove(roomRef(S.code, `players/${uid}`));
  op.then(() => toastUndo(`${p.name} ha lasciato la serata`, () => {
    if (S.players[uid]) bringBack(uid);
    else set(roomRef(S.code, `players/${uid}`), p).catch((err) => toast(explainError(err), 'error'));
  })).catch((err) => toast(explainError(err), 'error'));
}

function bringBack(uid) {
  const p = S.players[uid];
  if (!p) return;
  const n = activePlayers(S.players).length;
  const max = S.meta.maxPlayers || DEFAULT_PLAYERS;
  const patch = { away: null };
  if (n >= max) {
    if (max >= MAX_PLAYERS) { toast(`Siete già in ${MAX_PLAYERS}: non c'è posto.`, 'warn'); return; }
    // Il posto si aggiunge da solo: chi rientra lo aveva già.
    update(roomRef(S.code, 'meta'), { maxPlayers: max + 1 }).catch(() => {});
  }
  const taken = new Set(activePlayers(S.players).map((x) => x.color));
  if (taken.has(p.color)) {
    const free = PLAYER_COLORS.find((c) => !taken.has(c));
    if (free) patch.color = free;
  }
  update(roomRef(S.code, `players/${uid}`), patch)
    .then(() => toast(`${p.name} è di nuovo in partita!`))
    .catch((err) => toast(explainError(err), 'error'));
}

/** Pannello "Giocatori": si apre da qualsiasi schermata con il pulsante in alto o il tasto G. */
const Panel = {
  el: null,
  sig: '',
  lastFocus: null,

  isOpen() { return Boolean(this.el); },

  open() {
    if (this.el || !S.code || !S.meta) return;
    this.lastFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
        <div class="panel-head">
          <h2 id="ppTitle">Giocatori della serata</h2>
          <button type="button" class="icon-btn" id="ppClose" aria-label="Chiudi">${ICONS.x}</button>
        </div>
        <div class="panel-join" id="ppJoin">
          <div class="qr qr--panel" id="ppQr"></div>
          <div class="lock-box" id="ppLocked" hidden><span aria-hidden="true">🔒</span><b>Stanza chiusa</b></div>
          <div class="panel-join-text">
            <p class="panel-strong" id="ppJoinTitle">Arriva qualcuno?</p>
            <p id="ppJoinText">Inquadra il QR o scrivi il codice <span class="code-chip code-chip--sm">${esc(S.code)}</span>. Si entra subito, anche a votazione aperta.</p>
            <button type="button" class="btn-sec btn-sec--sm" id="ppLock"></button>
            ${regiaCode() ? `<p class="regia-line">Codice regia <b>${esc(prettyRegia(regiaCode()))}</b>: serve per guidare la serata dal telefono o riprenderla da un altro computer. Fotografalo.</p>` : ''}
            <div class="seat-row">
              <span class="field-label" id="ppSeatsLabel">Posti</span>
              <div class="stepper" role="group" aria-labelledby="ppSeatsLabel">
                <button type="button" class="step-btn" data-seat="-1" aria-label="Un posto in meno">${ICONS.minus}</button>
                <output id="ppSeats" aria-live="polite"></output>
                <button type="button" class="step-btn" data-seat="1" aria-label="Un posto in più">${ICONS.plus}</button>
              </div>
            </div>
          </div>
        </div>
        <ul class="panel-list" id="ppList"></ul>
        <div id="ppBanned"></div>
        <p class="muted small">Chi esce resta in classifica con i voti già dati, ma non viene più aspettato nelle votazioni. ⛔ espelle un dispositivo buggato, fantasma o indesiderato.</p>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.sig = '';
    renderQR($('#ppQr', el), playUrl());

    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#ppClose')) { this.close(); return; }
      const seat = e.target.closest('[data-seat]');
      if (seat) { changeSeats(Number(seat.dataset.seat)); return; }
      const out = e.target.closest('[data-out]');
      if (out) { markOut(out.dataset.out); return; }
      const kick = e.target.closest('[data-kickp]');
      if (kick) { confirmKick(kick.dataset.kickp); return; }
      const re = e.target.closest('[data-readmit]');
      if (re) { readmit(re.dataset.readmit).catch((err) => toast(explainError(err), 'error')); return; }
      if (e.target.closest('#ppLock')) { setLocked(!S.meta?.locked).catch((err) => toast(explainError(err), 'error')); return; }
      const back = e.target.closest('[data-back]');
      if (back) bringBack(back.dataset.back);
    });
    this.update();
    $('#ppClose', el).focus();
  },

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.lastFocus?.focus?.();
  },

  update() {
    if (!this.el) return;
    const active = activePlayers(S.players);
    const max = S.meta.maxPlayers || DEFAULT_PLAYERS;
    $('#ppSeats', this.el).textContent = `${active.length} / ${max}`;
    const locked = Boolean(S.meta?.locked);
    $('#ppQr', this.el).hidden = locked;
    $('#ppLocked', this.el).hidden = !locked;
    $('#ppJoinTitle', this.el).textContent = locked ? 'Stanza chiusa' : 'Arriva qualcuno?';
    $('#ppJoinText', this.el).innerHTML = locked
      ? 'Nessun nuovo ingresso: il QR e il codice non funzionano più per chi non è già dentro. Chi era in partita può sempre rientrare dal suo telefono.'
      : `Inquadra il QR o scrivi il codice <span class="code-chip code-chip--sm">${esc(S.code)}</span>. Si entra subito, anche a votazione aperta.`;
    $('#ppLock', this.el).innerHTML = locked ? '🔓 <span>Riapri la stanza</span>' : '🔒 <span>Chiudi la stanza</span>';
    const banned = Object.entries(S.meta?.banned || {});
    const bsig = JSON.stringify(banned);
    if (bsig !== this.bsig) {
      this.bsig = bsig;
      $('#ppBanned', this.el).innerHTML = banned.length ? `<p class="field-label">Espulsi stasera</p><ul class="trash-list">${banned.map(([uid, name]) => `<li><span>⛔ <b>${esc(name)}</b></span><button type="button" class="btn-sec btn-sec--sm" data-readmit="${esc(uid)}">Riammetti</button></li>`).join('')}</ul>` : '';
    }
    const all = sortedPlayers(S.players);
    const sig = JSON.stringify([all.map((p) => [p.uid, p.name, p.style, p.seed, p.color, Boolean(p.away), isOnline(p.uid)])]);
    if (sig === this.sig) return;
    this.sig = sig;
    const list = $('#ppList', this.el);
    const rows = [...all.filter((p) => !p.away), ...all.filter((p) => p.away)];
    list.innerHTML = rows.length ? rows.map((p) => `
      <li class="panel-row ${p.away ? 'is-away' : ''}">
        ${avatarHTML(p, '2.8rem')}
        <span class="panel-name">${esc(p.name)}${trophyTitle(p) ? ` <small class="panel-title">${esc(trophyTitle(p))}</small>` : ''}</span>
        <span class="panel-status ${!p.away && !isOnline(p.uid) ? 'is-offline' : ''}">${p.away ? 'Fuori dalla serata' : isOnline(p.uid) ? 'In partita' : `${ICONS.wifiOff}Non collegato`}</span>
        <span class="panel-acts">${p.away
          ? `<button type="button" class="btn-sec btn-sec--sm" data-back="${esc(p.uid)}">Fai rientrare</button>`
          : `<button type="button" class="btn-sec btn-sec--sm" data-out="${esc(p.uid)}">${ICONS.exit}<span>Segna l’uscita</span></button>`}
          <button type="button" class="icon-btn icon-btn--sm" data-kickp="${esc(p.uid)}" title="Espelli ${esc(p.name)}" aria-label="Espelli ${esc(p.name)}">⛔</button></span>
      </li>`).join('') : '<li class="muted">Ancora nessun giocatore.</li>';
  }
};

/**
 * Sposta un giocatore su un nuovo telefono (nuovo uid): profilo, voti dati,
 * voti MVP ricevuti, vittorie e scelta nel sondaggio.
 */
async function migratePlayer(oldUid, newUid) {
  const p = S.players[oldUid];
  if (!p) throw userError('Questo giocatore non c’è più.');
  await Save.snap(`Prima del rientro di ${p.name} da un altro telefono`);
  const patch = {};
  const { away, ...profile } = p;
  patch[`players/${newUid}`] = profile;
  patch[`players/${oldUid}`] = null;
  for (const [gid, gameVotes] of Object.entries(S.votes || {})) {
    for (const [uid, v] of Object.entries(gameVotes || {})) {
      if (uid === oldUid) {
        patch[`votes/${gid}/${newUid}`] = { ...v, mvp: v.mvp === oldUid ? newUid : (v.mvp || null) };
        patch[`votes/${gid}/${oldUid}`] = null;
      } else if (v?.mvp === oldUid) {
        patch[`votes/${gid}/${uid}/mvp`] = newUid;
      }
    }
  }
  for (const [gid, g] of Object.entries(S.games || {})) {
    if (g?.winners?.[oldUid]) {
      patch[`games/${gid}/winners/${oldUid}`] = null;
      patch[`games/${gid}/winners/${newUid}`] = true;
    }
  }
  if (S.poll?.votes?.[oldUid]) {
    patch[`poll/votes/${oldUid}`] = null;
    patch[`poll/votes/${newUid}`] = S.poll.votes[oldUid];
  }
  patch[`claims/${newUid}`] = null;
  await update(roomRef(S.code, ''), patch);
  S.draft.winners = (S.draft.winners || []).map((uid) => (uid === oldUid ? newUid : uid));
  delete S.offlineSince[oldUid];
}

/** Richieste di rientro da un telefono nuovo: la TV le conferma una alla volta. */
const ClaimPanel = {
  el: null,
  current: null,
  auto: new Set(),

  isOpen() { return Boolean(this.el); },

  pending() {
    return Object.entries(S.claims || {})
      .filter(([uid, c]) => c?.target && S.players[c.target] && !S.players[uid])
      .map(([uid, c]) => ({ uid, ...c }));
  },

  update() {
    const list = this.pending();
    // Richieste non più valide (es. giocatore rimosso): si scartano.
    for (const [uid, c] of Object.entries(S.claims || {})) {
      if (!c?.target || !S.players[c.target] || S.players[uid]) remove(roomRef(S.code, `claims/${uid}`)).catch(() => {});
    }
    // Con il codice personale giusto il rientro è automatico, senza chiedere conferma.
    for (const c of list) {
      if (c.code && S.players[c.target]?.memberId === c.code && !this.auto.has(c.uid)) {
        this.auto.add(c.uid);
        const name = S.players[c.target].name;
        migratePlayer(c.target, c.uid)
          .then(() => toast(`${name} è di nuovo in partita con il nuovo telefono`))
          .catch((err) => { this.auto.delete(c.uid); toast(explainError(err), 'error'); });
      }
    }
    const manual = list.filter((c) => !this.auto.has(c.uid));
    if (this.el && !manual.some((c) => c.uid === this.current?.uid)) this.close();
    if (!this.el && manual.length) this.open(manual[0]);
  },

  open(claim) {
    if ([Panel, LibPanel].some((p) => p.isOpen())) [Panel, LibPanel].forEach((p) => p.close());
    this.current = claim;
    const p = S.players[claim.target];
    const online = isOnline(claim.target);
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--claim" role="alertdialog" aria-modal="true" aria-labelledby="clTitle">
        <div class="claim-head">
          ${avatarHTML(p, '5rem', 'avatar--shadow')}
          <div>
            <h2 id="clTitle">${esc(p.name)} vuole rientrare</h2>
            <p class="panel-note">Un telefono nuovo dice di essere ${esc(p.name)}. Se confermi, voti, vittorie e MVP passano a quel telefono.</p>
          </div>
        </div>
        ${online ? `<p class="claim-warn">${ICONS.wifiOff}<span>Attenzione: il vecchio telefono di ${esc(p.name)} risulta ancora collegato.</span></p>` : ''}
        <div class="claim-actions">
          <button type="button" class="btn-sec" id="clNo">No, non è ${esc(p.name)}</button>
          <button type="button" class="btn btn-big" id="clYes">${ICONS.check}<span>Sì, è ${esc(p.name)}</span></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    $('#clNo', el).addEventListener('click', () => {
      remove(roomRef(S.code, `claims/${claim.uid}`)).catch(() => {});
      this.close();
    });
    $('#clYes', el).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await migratePlayer(claim.target, claim.uid);
        toast(`${p.name} è di nuovo in partita con il nuovo telefono`);
        this.close();
      } catch (err) {
        toast(explainError(err), 'error');
        e.currentTarget.disabled = false;
      }
    });
    $('#clYes', el).focus();
  },

  close() {
    this.el?.remove();
    this.el = null;
    this.current = null;
  }
};

/**
 * "Non ho il codice": un telefono nuovo chiede di ritrovare un profilo del gruppo.
 * La TV mostra quante serate ha quel profilo e l'host conferma (così nessuno si prende le statistiche di un altro).
 */
const ProfileClaimPanel = {
  el: null,
  current: null,
  isOpen() { return Boolean(this.el); },
  pending() {
    return Object.entries(S.profileClaims || {}).filter(([uid, c]) => c?.mid && !S.players[uid] && !S.meta?.banned?.[uid]).map(([uid, c]) => ({ uid, ...c }));
  },
  /** Nome e serate del profilo, dallo storico del gruppo. */
  profileInfo(mid) {
    let name = null;
    let nights = 0;
    for (const n of Object.values(S.nights || {})) {
      const pp = Object.values(n?.people || {}).find((x) => x?.memberId === mid);
      if (pp) { nights++; name = pp.name; }
    }
    return { name, nights };
  },
  update() {
    const list = this.pending();
    if (this.el && !list.some((c) => c.uid === this.current?.uid)) this.close();
    if (!this.el && list.length && !ClaimPanel.isOpen()) this.open(list[0]);
  },
  open(c) {
    this.current = c;
    const info = this.profileInfo(c.mid);
    const inRoom = Object.values(S.players || {}).find((p) => p.memberId === c.mid && !p.away);
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--claim" role="alertdialog" aria-modal="true" aria-labelledby="pcTitle">
        <h2 id="pcTitle">${esc(info.name || c.name)} vuole ritrovare il suo profilo</h2>
        <p class="panel-note">Un telefono nuovo, senza codice personale, dice di essere <b>${esc(info.name || c.name)}</b>${info.nights ? ` (${info.nights} ${info.nights === 1 ? 'serata' : 'serate'} di statistiche)` : ''}. Se confermi, profilo, livello e statistiche di sempre passano anche a quel telefono.</p>
        ${!info.name ? `<p class="claim-warn">⚠️ Questo profilo non compare nello storico del gruppo.</p>` : ''}
        ${inRoom ? `<p class="claim-warn">⚠️ ${esc(inRoom.name)} è già in partita con un altro telefono.</p>` : ''}
        <div class="claim-actions">
          <button type="button" class="btn-sec" id="pcNo">No, non è ${esc(info.name || c.name)}</button>
          <button type="button" class="btn btn-big" id="pcYes">${ICONS.check}<span>Sì, è ${esc(info.name || c.name)}</span></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    $('#pcNo', el).addEventListener('click', () => {
      remove(roomRef(S.code, `profileClaims/${c.uid}`)).catch(() => {});
      logEvent(`Richiesta di profilo rifiutata (${c.name})`, '🚫');
      this.close();
    });
    $('#pcYes', el).addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        await update(roomRef(S.code, ''), { [`profileGrants/${c.uid}`]: { mid: c.mid, at: serverTimestamp() }, [`profileClaims/${c.uid}`]: null });
        logEvent(`Profilo di ${info.name || c.name} ritrovato su un telefono nuovo`, '🪪');
        toast(`${info.name || c.name} ritrova il suo profilo`);
        this.close();
      } catch (err) { toast(explainError(err), 'error'); e.currentTarget.disabled = false; }
    });
  },
  close() { this.el?.remove(); this.el = null; this.current = null; }
};

/** Correzioni dopo il reveal: nome, foto, vincitori, voti da togliere, cestino. */
const EditGame = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(gid) {
    this.close();
    const g = S.games[gid];
    if (!g) return;
    this.gid = gid;
    this.winners = new Set(Object.keys(g.winners || {}));
    this.image = g.image || null;
    this.drop = new Set();
    const people = sortedPlayers(S.players);
    const votes = S.votes?.[gid] || {};
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="egTitle">
        <div class="panel-head"><h2 id="egTitle">Correggi “${esc(g.name)}”</h2><button type="button" class="icon-btn" id="egClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="eg-top">
          <button type="button" class="lib-add-img ${this.image ? 'has-img' : ''}" id="egPick" aria-label="Cambia la foto">${this.image ? `<img src="${esc(this.image)}" alt="">` : ICONS.image}</button>
          <div class="field"><label class="field-label" for="egName">Nome del gioco</label><input class="input" id="egName" maxlength="40" value="${esc(g.name)}"></div>
          <input type="file" id="egFile" accept="image/*" hidden>
        </div>
        <span class="field-label">Chi ha vinto?</span>
        <div class="rg-chips">${people.map((p) => `<button type="button" class="lib-chip" data-egwin="${esc(p.uid)}" aria-pressed="${this.winners.has(p.uid)}">${esc(p.name)}</button>`).join('')}</div>
        <span class="field-label">Voti (togli quelli sbagliati)</span>
        <ul class="trash-list">${Object.entries(votes).map(([uid, v]) => `
          <li><span><b>${esc(S.players[uid]?.name || 'Ex giocatore')}</b> ${v.overall}${v.byHost ? ' <span class="muted">(inserito dalla TV)</span>' : ''}</span>
          <button type="button" class="btn-sec btn-sec--sm" data-egdrop="${esc(uid)}" aria-pressed="false">Togli</button></li>`).join('') || '<li class="muted">Nessun voto.</li>'}</ul>
        <div class="claim-actions">
          <button type="button" class="btn-sec" id="egTrash">Sposta nel cestino</button>
          <button type="button" class="btn btn-big" id="egSave">${ICONS.check}<span>Salva</span></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#egClose')) { this.close(); return; }
      if (e.target.closest('#egPick')) { $('#egFile', el).click(); return; }
      const w = e.target.closest('[data-egwin]');
      if (w) { const u = w.dataset.egwin; this.winners.has(u) ? this.winners.delete(u) : this.winners.add(u); w.setAttribute('aria-pressed', String(this.winners.has(u))); return; }
      const d = e.target.closest('[data-egdrop]');
      if (d) { const u = d.dataset.egdrop; this.drop.has(u) ? this.drop.delete(u) : this.drop.add(u); d.setAttribute('aria-pressed', String(this.drop.has(u))); d.textContent = this.drop.has(u) ? 'Da togliere' : 'Togli'; return; }
      if (e.target.closest('#egTrash')) { if (confirm(`Spostare “${g.name}” nel cestino?`)) { await trashGame(gid); this.close(); } return; }
      if (e.target.closest('#egSave')) this.save();
    });
    $('#egFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { this.image = await gameImage(f); const b = $('#egPick', el); b.innerHTML = `<img src="${this.image}" alt="">`; b.classList.add('has-img'); } catch (err) { toast(err.message, 'error'); }
    });
  },
  async save() {
    const name = cleanName($('#egName', this.el).value);
    if (!name) { toast('Il nome del gioco non può essere vuoto.', 'warn'); return; }
    const patch = {
      [`games/${this.gid}/name`]: name,
      [`games/${this.gid}/image`]: this.image || null,
      [`games/${this.gid}/winners`]: this.winners.size ? Object.fromEntries([...this.winners].map((u) => [u, true])) : null
    };
    for (const u of this.drop) patch[`votes/${this.gid}/${u}`] = null;
    try {
      await Save.snap(`Prima delle correzioni a ${S.games[this.gid]?.name || 'un gioco'}`);
      await update(roomRef(S.code, ''), patch);
      saveNight();
      toast('Correzioni salvate');
      this.close();
    } catch (err) { toast(explainError(err), 'error'); }
  },
  close() { this.el?.remove(); this.el = null; }
};

/** Voto inserito dalla TV per chi ha il telefono fuori uso. */
const ProxyVote = {
  el: null,

  isOpen() { return Boolean(this.el); },

  open(gid, uid) {
    this.close();
    const g = S.games[gid];
    const p = S.players[uid];
    if (!g || !p) return;
    this.gid = gid;
    this.uid = uid;
    this.quick = Boolean(g.quick);
    this.v = { overall: null, coinv: null, sempl: null, rigioc: null, mvp: null };
    const others = activePlayers(S.players).filter((x) => x.uid !== uid);
    this.needMvp = others.length > 0;
    const btns = (key, n) => Array.from({ length: n }, (_, i) => `<button type="button" class="pv-btn" data-k="${key}" data-v="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('');
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--proxy" role="dialog" aria-modal="true" aria-labelledby="pvTitle">
        <div class="panel-head">
          <h2 id="pvTitle">Voto di ${esc(p.name)} per ${esc(g.name)}</h2>
          <button type="button" class="icon-btn" id="pvClose" aria-label="Chiudi">${ICONS.x}</button>
        </div>
        <p class="panel-note">Per quando il telefono di ${esc(p.name)} è fuori uso: fatti dire il voto e inseriscilo qui.</p>
        <div class="pv-row"><span class="field-label">Voto generale</span><div class="pv-btns pv-btns--10">${btns('overall', 10)}</div></div>
        ${this.quick ? '' : CRITERIA.map((c) => `<div class="pv-row"><span class="field-label">${c.label}</span><div class="pv-btns" style="--cc:${c.color}">${btns(c.key, 5)}</div></div>`).join('')}
        ${others.length ? `<div class="pv-row"><span class="field-label">MVP</span><div class="pv-mvp">${others.map((o) => `
          <button type="button" class="pv-btn pv-av" data-k="mvp" data-v="${esc(o.uid)}" aria-pressed="false" title="${esc(o.name)}">${avatarHTML(o, '2.4rem')}<span>${esc(o.name)}</span></button>`).join('')}</div></div>` : ''}
        <p class="form-error" id="pvErr" role="alert"></p>
        <div class="claim-actions">
          <button type="button" class="btn-sec" id="pvCancel">Annulla</button>
          <button type="button" class="btn btn-big" id="pvSave">${ICONS.check}<span>Salva il voto</span></button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#pvClose') || e.target.closest('#pvCancel')) { this.close(); return; }
      if (e.target.closest('#pvSave')) { this.save(); return; }
      const b = e.target.closest('[data-k]');
      if (!b) return;
      this.v[b.dataset.k] = b.dataset.k === 'mvp' ? b.dataset.v : Number(b.dataset.v);
      el.querySelectorAll(`[data-k="${b.dataset.k}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#pvErr', el).textContent = '';
    });
  },

  async save() {
    const v = this.v;
    const missing = [];
    if (!v.overall) missing.push('voto generale');
    if (!this.quick) for (const c of CRITERIA) if (!v[c.key]) missing.push(c.label.toLowerCase());
    if (this.needMvp && !v.mvp) missing.push('MVP');
    if (missing.length) { $('#pvErr', this.el).textContent = `Manca: ${missing.join(', ')}.`; return; }
    const data = { overall: v.overall, byHost: true, at: serverTimestamp() };
    if (!this.quick) Object.assign(data, { coinv: v.coinv, sempl: v.sempl, rigioc: v.rigioc });
    if (v.mvp) data.mvp = v.mvp;
    const name = S.players[this.uid]?.name || 'Il giocatore';
    try {
      // Se nel frattempo ha votato dal telefono, il suo voto vero non va sovrascritto.
      const already = (await get(roomRef(S.code, `votes/${this.gid}/${this.uid}`))).val();
      if (already) {
        toast(`${name} ha appena votato dal telefono: resta il suo voto.`, 'warn');
        this.close();
        return;
      }
      await set(roomRef(S.code, `votes/${this.gid}/${this.uid}`), data);
      toast(`Voto di ${name} salvato`);
      this.close();
    } catch (err) {
      $('#pvErr', this.el).textContent = explainError(err);
    }
  },

  close() {
    this.el?.remove();
    this.el = null;
  }
};

// ---------------------------------------------------------------------------
// Regia dal telefono: i comandi arrivano dal database e la TV li esegue
// ---------------------------------------------------------------------------

const doneCommands = new Set();
// I comandi già eseguiti restano segnati anche se la pagina si ricarica: niente doppioni.
const doneKey = () => `gnr_done_${S.code}`;
function loadDoneCommands() {
  try { for (const id of JSON.parse(localStorage.getItem(doneKey()) || '[]')) doneCommands.add(id); } catch { /* niente */ }
}
function saveDoneCommands() {
  try { localStorage.setItem(doneKey(), JSON.stringify([...doneCommands].slice(-150))); } catch { /* niente */ }
}

function processCommands() {
  const list = Object.entries(S.commands || {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  for (const c of list) {
    if (doneCommands.has(c.id)) { remove(roomRef(S.code, `commands/${c.id}`)).catch(() => {}); continue; }
    doneCommands.add(c.id);
    saveDoneCommands();
    remove(roomRef(S.code, `commands/${c.id}`)).catch(() => {});
    // Comandi rimasti in sospeso mentre la TV era spenta: non si eseguono più.
    if (Number(c.at) && Date.now() - Number(c.at) > 60000) continue;
    runCommand(c).catch((err) => toast(explainError(err), 'error'));
  }
}

async function runCommand(c) {
  const phase = S.state?.phase;
  const gid = S.state?.gameId;
  const a = c.args || {};
  switch (c.type) {
    case 'start': if (phase === 'lobby') await setPhase('idle'); break;
    case 'openVote':
      if (phase === 'idle') await openVotingWith({ name: a.name, libraryId: a.libraryId || null, winners: asList(a.winners), spectators: asList(a.spectators), quick: Boolean(a.quick), image: null });
      break;
    case 'reveal': if (phase === 'voting' && gid) await revealGame(gid); break;
    case 'skip': if (a.uid) { S.skipWait.add(a.uid); render(); } break;
    case 'next': if (['reveal', 'board'].includes(phase)) await goNext(); break;
    case 'board': if (['reveal', 'idle'].includes(phase)) await setPhase('board'); break;
    case 'end':
      if (['idle', 'board', 'reveal'].includes(phase) && buildBoard(S.games, S.votes).length) guarded('Prima della premiazione', () => toAwards(false));
      break;
    case 'lock': await setLocked(Boolean(a.on)); break;
    case 'kick': if (a.uid && S.players[a.uid]) await kickPlayer(a.uid, Boolean(a.all)); break;
    case 'safe': applySafeMode(Boolean(a.on)); break;
    case 'step': if (phase === 'awards' && S.screen === SCREENS.awards) SCREENS.awards.next(); break;
    case 'pollStart': if (phase === 'idle') await startPoll(); break;
    case 'pollClose': if (phase === 'poll') await SCREENS.poll.close(); break;
    case 'pollGo': if (phase === 'poll') await pollGo(); break;
    case 'pollCancel':
      if (phase === 'poll') { await setPhase('idle'); remove(roomRef(S.code, 'poll')).catch(() => {}); }
      break;
    case 'reopen': if (a.gameId && ['reveal', 'board', 'idle'].includes(phase)) await reopenVoting(a.gameId); break;
    case 'alltime': if (['idle', 'board', 'awards'].includes(phase)) openAllTime(); break;
    case 'back': if (phase === 'alltime') backFromAllTime(); break;
    case 'pause': await setPaused(true); break;
    case 'rematch': if (['reveal', 'board'].includes(phase)) await rematch(a.gameId || gid); break;
    case 'startPlay': if (phase === 'idle' && a.name) { await update(roomRef(S.code, 'state'), playState(cleanName(a.name), asList(a.spectators))); newGameSound(); } break;
    case 'interval': if (Interval.isOpen()) Interval.close(); else if (['idle', 'board'].includes(phase)) Interval.open(); break;
    case 'resume': await setPaused(false); break;
    default: break;
  }
}

/**
 * Termina la serata in qualsiasi momento (anche a votazione aperta), dopo una conferma che spiega
 * cosa succede a voti, punteggi e attività in corso. Un doppio tocco non la chiude due volte.
 */
async function endNight() {
  if (S.ending || document.getElementById('endDialog')) return;
  const ph = S.state?.phase;
  if (ph === 'awards') { toast('La serata è già terminata: la premiazione è sullo schermo.'); return; }
  const board = buildBoard(S.games, S.votes);
  const gid = S.state?.gameId;
  const g = ph === 'voting' ? S.games?.[gid] : null;
  const nv = g ? Object.keys(S.votes?.[gid] || {}).length : 0;
  const total = activePlayers(S.players).length;
  const playing = ph === 'idle' && S.state?.playStart && S.state?.playName ? S.state.playName : '';
  const choice = await new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay';
    el.id = 'endDialog';
    el.innerHTML = `
      <div class="card panel end-dialog" role="dialog" aria-modal="true" aria-labelledby="edTitle">
        <div class="panel-head"><h2 id="edTitle">🏁 Terminare la serata?</h2><button type="button" class="icon-btn" data-edno aria-label="Continua a giocare">${ICONS.x}</button></div>
        <ul class="end-list">
          <li>${board.length ? `🏆 <b>${board.length} ${board.length === 1 ? 'gioco' : 'giochi'}</b> in classifica, con i voti ricevuti: si passa alla premiazione.` : '🏆 Nessun gioco votato: la premiazione sarà vuota, ma il resoconto della serata resta.'}</li>
          ${g ? `<li>🗳️ La votazione di <b>${esc(g.name)}</b> è aperta: <b>${nv} ${nv === 1 ? 'voto' : 'voti'} su ${total}</b>. Scegli qui sotto se contarla con i voti già arrivati o lasciarla fuori (va nel cestino, si può ripristinare).</li>` : ''}
          ${playing ? `<li>⏱️ La partita a <b>${esc(playing)}</b> non è stata votata: non entra in classifica.</li>` : ''}
          ${ph === 'poll' ? '<li>📱 La votazione del prossimo gioco viene chiusa senza scegliere.</li>' : ''}
          <li>🧮 Segnapunti, pronostici e quiz restano come sono; nessun dato viene cancellato.</li>
          <li>📋 Dopo, il <b>resoconto della serata</b> si apre dalla premiazione e dalla home di ogni telefono.</li>
          <li>↩️ Per qualche secondo compare <b>Annulla</b> per tornare indietro.</li>
        </ul>
        <div class="end-acts">
          ${g && nv ? `<button type="button" class="btn" data-edgo="count">Termina e conta ${nv === 1 ? 'l’unico voto' : `i ${nv} voti`} di ${esc(g.name)}</button>` : ''}
          <button type="button" class="${g && nv ? 'btn-sec' : 'btn'}" data-edgo="${g ? 'drop' : 'end'}">${g ? `Termina senza ${esc(g.name)}` : 'Termina la serata'}</button>
          <button type="button" class="btn-sec" data-edno>Continua a giocare</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const done = (v) => { document.removeEventListener('keydown', onKey, true); el.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-edno]')) { done(null); return; }
      const b = e.target.closest('[data-edgo]');
      if (b) done(b.dataset.edgo);
    });
    el.querySelector('[data-edgo]').focus();
  });
  if (!choice || S.ending || S.state?.phase === 'awards') return;
  S.ending = true;
  try {
    await guarded('Prima della fine anticipata della serata', async () => {
      if (g) {
        if (choice === 'count' && nv) await update(roomRef(S.code, `games/${gid}`), { status: 'revealed', revealedAt: serverTimestamp(), closedEarly: true });
        else await trashGame(gid);
      }
      if (ph === 'poll') await remove(roomRef(S.code, 'poll')).catch(() => {});
      await toAwards(true);
    });
  } finally { S.ending = false; }
}

/** Passa alla premiazione: istantanea, riassunto nel gruppo, eventuale backup automatico del gruppo. */
async function toAwards(withUndo = false) {
  if (S.state?.phase === 'awards') return;
  const back = S.state?.phase === 'board' ? 'board' : 'idle';
  await Save.snap('Prima della premiazione', 'phase');
  saveNight();
  await setPhase('awards');
  if (withUndo) toastUndo('Serata terminata', () => setPhase(back));
  if (autoGroupBackup()) setTimeout(() => groupBackup(false).catch(() => {}), 2500);
}

const AUTO_GB_KEY = 'gnr_auto_group_backup';
function autoGroupBackup() { try { return localStorage.getItem(AUTO_GB_KEY) === '1'; } catch { return false; } }

// ---------------------------------------------------------------------------
// Armadio del gruppo e serate salvate
// ---------------------------------------------------------------------------

/** Gioco proponibile stasera: adatto al numero di giocatori e fisicamente disponibile. */
function libOk(it, n) {
  return libFits(it, n) && isAvailable(it);
}

/** "Prestato a Luca", "Venduto"... */
function awayLabel(it) {
  return it.status === 'prestato' && it.loanTo ? `Prestato a ${it.loanTo}` : (GAME_STATUS[it.status] || it.status || '');
}

function libraryItems() {
  return Object.entries(S.library || {})
    .map(([id, it]) => ({ id, ...it }))
    .filter((it) => it.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
}

function playedTonight() {
  return new Set(Object.values(S.games || {}).filter((g) => g?.name).map((g) => nameKey(g.name)));
}

/** Giochi tra cui scegliere: quelli sul tavolo stasera (se almeno 2), altrimenti tutta l’armadio. */
function poolItems() {
  const pool = poolIds();
  return libraryItems().filter((it) => !pool || pool.has(it.id));
}
function poolLibrary() {
  const pool = poolIds();
  return pool ? Object.fromEntries(Object.entries(S.library || {}).filter(([id]) => pool.has(id))) : S.library;
}
/** I desideri dei telefoni ("voglio giocare a…") alzano il punteggio dei consigli. */
function boostWishes(list) {
  const w = wishes();
  return list.map((r) => (w[r.id] ? { ...r, score: Math.min(99, r.score + 8 * w[r.id]), reasons: [`⭐ ${w[r.id]} ${w[r.id] === 1 ? 'lo vuole' : 'lo vogliono'}`, ...r.reasons] } : r)).sort((a, b) => b.score - a.score);
}

function findLibrary(name) {
  const k = nameKey(name);
  return libraryItems().find((it) => nameKey(it.name) === k) || null;
}

/**
 * Aggiunge un gioco all’armadio. Se c'è già, completa la foto mancante e
 * aggiorna giocatori e durata indicati. Restituisce l'id.
 */
async function addToLibrary(name, image, by = 'TV', extra = {}) {
  if (!hasLib() || armReadOnly()) return null;
  const info = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null && v !== undefined));
  const existing = findLibrary(name);
  const aid = S.meta?.armadioId;
  if (existing) {
    const patch = { ...info };
    const hasImg = existing.image || existing.thumb;
    if (aid) {
      if (Object.keys(patch).length || (image && !hasImg)) await saveGame(aid, existing.id, patch, image && !hasImg ? { full: image } : {});
      return existing.id;
    }
    if (image && !existing.image) patch.image = image;
    if (Object.keys(patch).length) await update(libRef(existing.id), patch);
    return existing.id;
  }
  if (aid) {
    const id = newGameId(aid);
    await saveGame(aid, id, { name, addedBy: by, ...info }, { create: true, ...(image ? { full: image } : {}) });
    armLog(aid, { op: 'add', item: id, name, by });
    return id;
  }
  const r = push(libRef());
  await set(r, { name, image: image || null, addedBy: by, addedAt: serverTimestamp(), ...info });
  return r.key;
}

const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180];

function playersOptions(selected, emptyLabel) {
  return `<option value="">${emptyLabel}</option>` + Array.from({ length: 20 }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${Number(selected) === n ? 'selected' : ''}>${n}</option>`).join('');
}

function durationOptions(selected) {
  return '<option value="">Durata: —</option>' + DURATIONS
    .map((d) => `<option value="${d}" ${Number(selected) === d ? 'selected' : ''}>${d} min${d === 180 ? ' o più' : ''}</option>`).join('');
}

/** Salva il riassunto della serata nel gruppo, per la classifica di sempre. */
function saveNight() {
  const gid = S.meta?.groupId;
  if (!gid) return Promise.resolve();
  const board = buildBoard(S.games, S.votes);
  const ref = groupRef(gid, `nights/${S.code}`);
  if (S.meta?.demo) return Promise.resolve();
  const op = board.length ? set(ref, nightSummary(board, S.players, S.meta, buildAwards(board, S.votes, S.players))) : remove(ref);
  return op.catch((err) => { console.warn('Serata non salvata nel gruppo', err); if (S.groupAdmin === false) showGroupKeyBanner(); });
}

/** Indirizzo per aggiungere giochi all'armadio dal telefono (con la chiave del gruppo: il telefono diventa autorizzato). */
function armadioPhoneUrl() {
  const url = publicUrl('ludoteca.html');
  url.search = '';
  if (S.meta?.armadioId) {
    url.searchParams.set('a', S.meta.armadioId);
    url.searchParams.set('add', '1');
    const k = armadioKey(S.meta.armadioId);
    url.hash = k ? `ak=${k}` : '';
  } else {
    url.searchParams.set('g', S.meta?.groupId || '');
    url.searchParams.set('add', '1');
    const k = S.meta?.groupId ? groupKey(S.meta.groupId) : '';
    url.hash = k ? `gk=${k}` : '';
  }
  return url.href;
}

/**
 * Stellina "Stasera": prima della serata (pagina dell'armadio) si salva nell'armadio come proposta;
 * nella stanza invece è una scelta della serata (rooms/<codice>/pick), copiata dall'armadio alla creazione.
 * Così quello che si decide durante la serata non cambia la collezione personale.
 */
function inRoom() { return Boolean(S.code && S.state); }
function isSel(it) { return inRoom() ? S.pick?.[it?.id] === true : it?.sel === true; }
function selectedIds() {
  return Object.entries(S.library || {}).filter(([id, it]) => it?.name && isSel({ ...it, id })).map(([id]) => id);
}
/** Scrive la stellina dove serve (stanza o armadio). ids: { id: true|null } */
function writeSel(ids) {
  if (inRoom()) return update(roomRef(S.code, 'pick'), ids);
  return update(libRef(), Object.fromEntries(Object.entries(ids).map(([id, v]) => [`${id}/sel`, v])));
}
/** Copia nella stanza le stelline "Stasera" preparate nell'armadio. */
async function copyPicks(code, aid) {
  const lib = (await get(armadioRef(aid, 'library')).catch(() => null))?.val() || {};
  const picks = Object.fromEntries(Object.entries(lib).filter(([, it]) => it?.name && it.sel === true).map(([id]) => [id, true]));
  await set(roomRef(code, 'pick'), Object.keys(picks).length ? picks : null).catch(() => {});
  return Object.keys(picks).length;
}

/**
 * Armadio dei giochi: i giochi del gruppo, conservati per tutte le serate. Si prepara prima della serata
 * (dalla schermata iniziale della TV o dal telefono) e si completa anche durante.
 * opts.mount: elemento in cui mostrarlo come pagina (prima della serata); senza, si apre come pannello.
 */
const LibPanel = {
  el: null,
  sig: '',
  img: null,
  lastFocus: null,

  // Come pagina (prima della serata) non conta come pannello aperto: Esc non lo chiude.
  isOpen() { return Boolean(this.el) && !this.inline; },

  open(opts = {}) {
    if (this.el || !hasLib()) return;
    this.inline = Boolean(opts.mount);
    this.lastFocus = document.activeElement;
    this.img = null;
    const el = document.createElement('div');
    el.className = this.inline ? 'armadio-inline' : 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide armadio" role="${this.inline ? 'region' : 'dialog'}" ${this.inline ? '' : 'aria-modal="true"'} aria-labelledby="lpTitle">
        <div class="panel-head">
          <h2 id="lpTitle">📦 Armadio dei giochi</h2>
          ${inRoom() && ['lobby', 'idle'].includes(S.state?.phase) ? '<button type="button" class="btn-sec btn-sec--sm" id="lpSwitchBtn" aria-expanded="false" aria-controls="lpSwitch">🔁 <span>Cambia armadio</span></button>' : ''}
          ${this.inline ? '' : `<button type="button" class="icon-btn" id="lpClose" aria-label="Chiudi">${ICONS.x}</button>`}
        </div>
        <div class="arm-switch" id="lpSwitch" hidden></div>
        ${armReadOnly() ? '<p class="arm-ro">🧪 <b>Serata di prova:</b> i giochi di questo armadio si usano ma non si modificano. Le stelline ⭐ valgono solo per questa prova.</p>' : ''}
        <p class="arm-ro arm-missing" id="lpMissing" hidden>⚠️ Questo armadio non esiste più (forse è stato cancellato). Scegline un altro con <b>Cambia armadio</b>.</p>
        <p class="panel-note"><b>${esc(armadioName())}</b>: i vostri giochi, conservati per tutte le serate e per qualsiasi gruppo. Conviene caricarli <b>prima</b> della serata (si possono aggiungere anche durante): la foto viene messa sempre nello stesso formato.
          ${S.meta.armadioId ? `Codice dell’armadio: <span class="code-chip code-chip--sm">${esc(S.meta.armadioId)}</span> (con il codice anche un’altra TV lo consulta)` : `Codice del gruppo: <span class="code-chip code-chip--sm">${esc(S.meta.groupId)}</span>`}</p>
        <div class="arm-key" id="lpKey"></div>
        <div class="arm-tools">
          <button type="button" class="btn-sec btn-sec--sm" id="lpPhone">📱 <span>Aggiungi dal telefono</span></button>
          <button type="button" class="btn-sec btn-sec--sm" id="lpQr">🔎 <span>Sfoglia sul telefono</span></button>
          ${S.meta.armadioId && !armReadOnly() ? `<a class="btn-sec btn-sec--sm" id="lpFull" href="armadio.html?a=${esc(S.meta.armadioId)}" target="_blank" rel="noopener">🗂️ <span>Gestione completa</span></a>` : ''}
          <button type="button" class="btn-sec btn-sec--sm" id="lpCsv" title="Su boardgamegeek.com: Collezione › Esporta (CSV). Va bene anche un CSV con la colonna “nome”.">📥 <span>Importa da BoardGameGeek (CSV)</span></button>
          <input type="file" id="lpCsvFile" accept=".csv,text/csv" hidden>
        </div>
        <form class="lib-add" id="lpForm" novalidate>
          <button type="button" class="lib-add-img" id="lpPick" aria-label="Scegli una foto (oppure incollala con Ctrl+V o trascinala qui)">${ICONS.image}</button>
          <label class="sr-only" for="lpName">Nome del gioco</label>
          <input class="input" id="lpName" maxlength="40" autocomplete="off" placeholder="Nome del gioco da aggiungere">
          <button type="submit" class="btn" id="lpSubmit">${ICONS.plus}<span>Aggiungi</span></button>
          <div class="lib-add-more">
            <span class="field-label" id="lpPlLabel">Giocatori</span>
            <label class="sr-only" for="lpMin">Minimo giocatori</label>
            <select class="input select select--sm" id="lpMin">${playersOptions('', 'da —')}</select>
            <label class="sr-only" for="lpMax">Massimo giocatori</label>
            <select class="input select select--sm" id="lpMax">${playersOptions('', 'a —')}</select>
            <label class="sr-only" for="lpDur">Durata</label>
            <select class="input select select--sm" id="lpDur">${durationOptions('')}</select>
            <label class="quick-toggle"><input type="checkbox" id="lpSel" checked><span>⭐ Per stasera</span></label>
            <button type="button" class="link-btn" id="lpCancel" hidden>Annulla modifica</button>
          </div>
          <div class="lib-add-url">
            <label class="sr-only" for="lpUrl">Link della foto</label>
            <input class="input input--sm" id="lpUrl" type="url" inputmode="url" placeholder="🔗 Oppure incolla il link di una foto (https://…)">
            <button type="button" class="btn-sec btn-sec--sm" id="lpUrlOk">Usa link</button>
          </div>
          <input type="file" id="lpFile" accept="image/*" hidden>
        </form>
        <p class="form-error" id="lpErr" role="alert"></p>
        <div class="arm-sel" id="lpSelBar"></div>
        <div class="lib-search">
          <label class="sr-only" for="lpSearch">Cerca nell’armadio</label>
          <input class="input" id="lpSearch" type="search" autocomplete="off" placeholder="Cerca o chiedi: per 5 persone, massimo 45 minuti, che Andrea non odia">
          <div class="lib-chips-row" id="lpChips"></div>
        </div>
        <ul class="lib-grid" id="lpList"></ul>
      </div>`;
    (opts.mount || document.body).appendChild(el);
    this.el = el;
    this.sig = '';
    const file = $('#lpFile', el);
    $('#lpCsvFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const r = await importGamesCSV(f);
        if (r) toast(`Armadio: ${r.added} ${r.added === 1 ? 'gioco aggiunto' : 'giochi aggiunti'}${r.updated ? `, ${r.updated} completati` : ''}`);
      } catch (err) { toast(err.message || explainError(err), 'error'); }
    });
    el.addEventListener('click', (e) => {
      if ((!this.inline && e.target === el) || e.target.closest('#lpClose')) { this.close(); return; }
      if (e.target.closest('#lpPick')) { file.click(); return; }
      if (e.target.closest('#lpCsv')) { $('#lpCsvFile', el).click(); return; }
      if (e.target.closest('#lpQr')) { QrPanel.open('L’armadio sul telefono', libraryUrl(), 'Inquadra il QR per sfogliare e cercare i giochi del gruppo dal telefono: categorie, durata, peso, prestiti e statistiche.'); return; }
      if (e.target.closest('#lpPhone')) { QrPanel.open('Aggiungi giochi dal telefono', armadioPhoneUrl(), 'Inquadra il QR: dal telefono scatti la foto alla scatola, scrivi il nome e il gioco entra nell’armadio. Il QR contiene la chiave del gruppo: mostralo solo a chi vuoi.'); return; }
      if (e.target.closest('#lpUrlOk')) { this.useUrl(); return; }
      if (e.target.closest('#lpCancel')) { this.resetForm(); return; }
      if (e.target.closest('#lpSelClear')) { this.clearSel(); return; }
      if (e.target.closest('#lpKeyGo')) { this.useKey(); return; }
      if (e.target.closest('#lpSwitchBtn')) { this.paintSwitch(); return; }
      const sw = e.target.closest('[data-armswitch]');
      if (sw) { this.doSwitch(sw.dataset.armswitch); return; }
      if (e.target.closest('#lpSwitchGo')) { this.doSwitch(normalizeCode($('#lpSwitchIn', this.el).value, 6)); return; }
      if (e.target.closest('#lpSelAll')) { this.selAll(); return; }
      const sel = e.target.closest('[data-sel]');
      if (sel) { this.toggleSel(sel.dataset.sel); return; }
      const edit = e.target.closest('[data-edit]');
      if (edit) { GameSheet.open(edit.dataset.edit); return; }
      const del = e.target.closest('[data-del]');
      if (del) this.removeItem(del.dataset.del);
    });
    $('#lpUrl', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.useUrl(); } });
    file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) this.setImage(f); });
    this.onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); this.setImage(item.getAsFile()); }
    };
    document.addEventListener('paste', this.onPaste);
    const form = $('#lpForm', el);
    form.addEventListener('dragover', (e) => { e.preventDefault(); form.classList.add('is-over'); });
    form.addEventListener('dragleave', () => form.classList.remove('is-over'));
    form.addEventListener('drop', (e) => {
      e.preventDefault();
      form.classList.remove('is-over');
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) this.setImage(f);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); this.add(); });
    $('#lpSearch', el).addEventListener('input', (e) => { this.query = e.target.value; this.sig = ''; this.update(); });
    this.query = '';
    this.update();
    $('#lpName', el).focus();
  },

  async useUrl() {
    const err = $('#lpErr', this.el);
    try {
      const r = await gameImageFromUrl($('#lpUrl', this.el).value.trim());
      this.img = r.image;
      const b = $('#lpPick', this.el);
      b.innerHTML = `<img src="${esc(this.img)}" alt="">`;
      b.classList.add('has-img');
      $('#lpUrl', this.el).value = '';
      err.textContent = '';
      if (!r.copied) toast('Foto collegata dal link (il sito non permette di copiarla: se il link sparisce, sparisce anche la foto).', 'warn');
    } catch (e) { err.textContent = e.message; }
  },

  async useKey() {
    const aid = S.meta?.armadioId;
    const v = $('#lpKeyIn', this.el)?.value || '';
    if (!aid) return;
    const ok = await ensureArmadioAdmin(aid, v).catch(() => false);
    if (ok) { S.armAdmin = true; registerMembers(); toast('Computer autorizzato: ora puoi modificare l’armadio'); }
    else toast('Chiave dell’armadio sbagliata.', 'error');
    this.sig = '';
    this.update();
  },

  /** Riga della chiave: per chi può modificare, la chiave da dare a un'altra TV; per chi consulta, dove scriverla. */
  paintKey() {
    const kb = $('#lpKey', this.el);
    if (!kb) return;
    const aid = S.meta?.armadioId;
    let html = '';
    if (aid && S.armAdmin === false) {
      html = `<span>🔒 Questo computer può solo <b>consultare</b> l’armadio. Per aggiungere o modificare giochi scrivi la chiave dell’armadio (la vede chi l’ha creato, qui sotto il nome).</span>
        <span class="gk-row"><label class="sr-only" for="lpKeyIn">Chiave dell’armadio</label><input class="input code-input code-input--8" id="lpKeyIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX"><button type="button" class="btn-sec btn-sec--sm" id="lpKeyGo">Conferma</button></span>`;
    } else if (aid && S.armAdmin && armadioKey(aid)) {
      html = `<span>🔑 Chiave dell’armadio <b class="code-chip code-chip--sm">${esc(prettyKey(armadioKey(aid)))}</b>: serve per modificarlo da un’altra TV. Tienila per te.</span>`;
    }
    if (kb.dataset.sig !== html) { kb.dataset.sig = html; kb.innerHTML = html; kb.hidden = !html; }
  },

  /** Elenco degli armadi per cambiare quello della serata. */
  paintSwitch() {
    const box = $('#lpSwitch', this.el);
    const btn = $('#lpSwitchBtn', this.el);
    if (!box) return;
    box.hidden = !box.hidden;
    btn?.setAttribute('aria-expanded', String(!box.hidden));
    if (box.hidden) return;
    const list = recentArmadi().filter((a) => a.id !== S.meta?.armadioId);
    box.innerHTML = `
      <p class="muted small">La serata usa i giochi dell’armadio scelto (sempre aggiornati). Le stelline ⭐ di stasera ripartono da quelle preparate nel nuovo armadio.</p>
      ${list.length ? `<div class="arm-list">${list.map((a) => `<button type="button" class="arm-open-btn" data-armswitch="${esc(a.id)}">📦 <span>${esc(a.name)}</span><small>${esc(a.id)}</small></button>`).join('')}</div>` : ''}
      <div class="arm-inline"><label class="sr-only" for="lpSwitchIn">Codice dell’armadio</label><input class="input input--sm" id="lpSwitchIn" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="Codice di un altro armadio (6 caratteri)"><button type="button" class="btn-sec btn-sec--sm" id="lpSwitchGo">Usa</button></div>
      <p class="form-error" id="lpSwitchErr" role="alert"></p>`;
  },
  async doSwitch(id) {
    const err = $('#lpSwitchErr', this.el);
    if (!/^[A-Z0-9]{6}$/.test(id || '')) { if (err) err.textContent = 'Il codice dell’armadio ha 6 caratteri.'; return; }
    if (id === S.meta?.armadioId) return;
    try {
      await switchArmadio(id);
      this.close();
    } catch (e) { if (err) err.textContent = explainError(e); }
  },

  toggleSel(id) {
    const it = S.library?.[id];
    if (!it) return;
    writeSel({ [id]: isSel({ ...it, id }) ? null : true }).catch((e) => toast(explainError(e), 'error'));
  },

  clearSel() {
    const ids = selectedIds();
    if (!ids.length || !confirm('Togliere la stellina “Stasera” a tutti i giochi?')) return;
    writeSel(Object.fromEntries(ids.map((id) => [id, null]))).catch((e) => toast(explainError(e), 'error'));
  },

  selAll() {
    const ids = libraryItems().filter((it) => isAvailable(it) && !isSel(it)).map((it) => it.id);
    if (!ids.length) return;
    writeSel(Object.fromEntries(ids.map((id) => [id, true]))).catch((e) => toast(explainError(e), 'error'));
  },

  close() {
    if (!this.el) return;
    document.removeEventListener('paste', this.onPaste);
    this.el.remove();
    this.el = null;
    if (!this.inline) this.lastFocus?.focus?.();
    this.inline = false;
  },

  resetPick() {
    const b = $('#lpPick', this.el);
    b.innerHTML = ICONS.image;
    b.classList.remove('has-img');
  },

  resetForm() {
    this.editId = null;
    this.img = null;
    this.resetPick();
    $('#lpName', this.el).value = '';
    $('#lpMin', this.el).value = '';
    $('#lpMax', this.el).value = '';
    $('#lpDur', this.el).value = '';
    $('#lpSel', this.el).checked = true;
    $('#lpSel', this.el).closest('label').hidden = false;
    $('#lpSubmit', this.el).innerHTML = `${ICONS.plus}<span>Aggiungi</span>`;
    $('#lpCancel', this.el).hidden = true;
    $('#lpErr', this.el).textContent = '';
    $('#lpName', this.el).focus();
  },

  startEdit(id) {
    const it = S.library?.[id];
    if (!it) return;
    this.editId = id;
    this.img = null;
    $('#lpName', this.el).value = it.name;
    $('#lpMin', this.el).value = it.minPlayers || '';
    $('#lpMax', this.el).value = it.maxPlayers || '';
    $('#lpDur', this.el).value = it.duration || '';
    $('#lpSel', this.el).closest('label').hidden = true;
    const b = $('#lpPick', this.el);
    const shown = it.image || it.thumb;
    if (shown) { b.innerHTML = `<img src="${esc(shown)}" alt="">`; b.classList.add('has-img'); } else this.resetPick();
    $('#lpSubmit', this.el).innerHTML = `${ICONS.check}<span>Salva</span>`;
    $('#lpCancel', this.el).hidden = false;
    $('#lpErr', this.el).textContent = '';
    $('#lpName', this.el).focus();
  },

  /** Giocatori e durata scelti nel modulo (null se non indicati). */
  extra() {
    const num = (id) => Number($(id, this.el).value) || null;
    return { minPlayers: num('#lpMin'), maxPlayers: num('#lpMax'), duration: num('#lpDur') };
  },

  async setImage(f) {
    try {
      this.img = await gameImage(f);
      const b = $('#lpPick', this.el);
      b.innerHTML = `<img src="${this.img}" alt="">`;
      b.classList.add('has-img');
      $('#lpErr', this.el).textContent = '';
    } catch (err) {
      $('#lpErr', this.el).textContent = err.message;
    }
  },

  async add() {
    const input = $('#lpName', this.el);
    const err = $('#lpErr', this.el);
    const name = cleanName(input.value);
    const extra = this.extra();
    if (!name) { err.textContent = 'Scrivi il nome del gioco.'; input.focus(); return; }
    if (extra.minPlayers && extra.maxPlayers && extra.minPlayers > extra.maxPlayers) {
      err.textContent = 'Il minimo di giocatori è più alto del massimo.';
      return;
    }
    const same = findLibrary(name);
    try {
      if (this.editId) {
        if (same && same.id !== this.editId) { err.textContent = 'C’è già un altro gioco con questo nome.'; return; }
        const patch = { name, ...extra };
        if (S.meta?.armadioId) await saveGame(S.meta.armadioId, this.editId, patch, this.img ? { full: this.img } : {});
        else { if (this.img) patch.image = this.img; await update(libRef(this.editId), patch); }
        toast(`${name} aggiornato`);
      } else {
        if (same && !this.img && !Object.values(extra).some(Boolean)) { err.textContent = 'Questo gioco è già nell’armadio: premi la matita per modificarlo.'; return; }
        const id = await addToLibrary(name, this.img, 'TV', extra);
        if (id && $('#lpSel', this.el).checked) await writeSel({ [id]: true });
        toast(`${name} nell’armadio${$('#lpSel', this.el).checked ? ' ⭐ per stasera' : ''}`);
      }
      this.resetForm();
    } catch (e) {
      err.textContent = explainError(e);
    }
  },

  removeItem(id) {
    const it = S.library?.[id];
    if (!it || !confirm(`Togliere “${it.name}” dall’armadio? Finisce nel cestino dell’armadio, da cui si può ripristinare.`)) return;
    if (S.meta?.armadioId) armTrash(S.meta.armadioId, id, it, 'TV').then(() => toast(`${it.name} nel cestino dell’armadio`)).catch((e) => toast(explainError(e), 'error'));
    else remove(libRef(id)).catch((e) => toast(explainError(e), 'error'));
  },

  update() {
    if (!this.el) return;
    this.paintKey();
    const miss = $('#lpMissing', this.el);
    if (miss) miss.hidden = !S.armMissing;
    this.el.querySelector('.armadio')?.classList.toggle('armadio--ro', armReadOnly());
    const all = libraryItems();
    const played = playedTonight();
    const sig = JSON.stringify([all.map((i) => [i.id, i.name, i.addedBy, (i.image || '').length, libInfo(i), i.status, i.loanTo, tagsOf(i), i.baseId, i.mode, i.weight, isSel(i)]), [...played], this.query]);
    if (sig === this.sig) return;
    this.sig = sig;
    // Ricerca: parole chiave + filtri capiti dalla frase
    const q = String(this.query || '').trim();
    const tags = [...new Set(all.flatMap(tagsOf))];
    const f = q ? parseQuery(q, knownPeople(), tags) : {};
    const structured = Object.keys(f).length > 0;
    if (q && !structured) f.text = q;
    const ids = new Set(searchLibrary(S.library, f, S.nights).map((x) => x.id));
    const items = all.filter((it) => ids.has(it.id));
    $('#lpChips', this.el).innerHTML = q ? `${filterChips(f).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}<span class="muted">${items.length} su ${all.length}</span>` : '';
    const baseName = (id) => S.library?.[id]?.name;
    const nSel = all.filter((it) => isSel(it)).length;
    $('#lpSelBar', this.el).innerHTML = all.length ? `
      <span class="arm-sel-n">⭐ <b>${nSel}</b> ${nSel === 1 ? 'gioco scelto' : 'giochi scelti'} per stasera</span>
      <span class="muted small">${nSel >= 2 ? 'Ruota, “A caso”, consigli e votazione scelgono tra questi (e mai uno già giocato).' : 'Tocca ⭐ sui giochi che portate stasera: la scelta del prossimo gioco userà solo quelli.'}</span>
      <span class="rg-row">${nSel < all.length ? '<button type="button" class="btn-sec btn-sec--sm" id="lpSelAll">Tutti</button>' : ''}${nSel ? '<button type="button" class="btn-sec btn-sec--sm" id="lpSelClear">Azzera</button>' : ''}</span>` : '';
    $('#lpList', this.el).innerHTML = items.length ? items.map((it) => {
      const isPlayed = played.has(nameKey(it.name));
      const status = !isAvailable(it) ? esc(awayLabel(it)) : '';
      const note = isPlayed ? 'Giocato stasera' : (it.owner ? `Di ${esc(it.owner)}` : it.addedBy && it.addedBy !== 'TV' ? `Portato da ${esc(it.addedBy)}` : '');
      return `
        <li class="lib-tile ${isPlayed ? 'is-played' : ''} ${status ? 'is-away' : ''} ${isSel(it) ? 'is-sel' : ''}">
          ${gameImageHTML(it, 'game-img--lib')}
          <button type="button" class="lib-sel" data-sel="${esc(it.id)}" aria-pressed="${isSel(it)}" title="${isSel(it) ? 'Scelto per stasera: tocca per toglierlo' : 'Scegli per stasera'}">${isSel(it) ? '✓' : '☆'}<span>Stasera</span></button>
          ${status ? `<span class="lib-status">${status}</span>` : ''}
          <span class="lib-name">${esc(it.name)}</span>
          ${it.baseId && baseName(it.baseId) ? `<span class="lib-exp">Espansione di ${esc(baseName(it.baseId))}</span>` : ''}
          <span class="lib-info">${esc(libInfo(it)) || '&nbsp;'}</span>
          ${tagsOf(it).length || it.mode || it.weight ? `<span class="lib-tags">${it.mode ? `<span>${esc(GAME_MODES[it.mode] || it.mode)}</span>` : ''}${it.weight ? `<span>peso ${String(it.weight).replace('.', ',')}</span>` : ''}${tagsOf(it).slice(0, 3).map((t) => `<span>#${esc(t)}</span>`).join('')}</span>` : ''}
          <span class="lib-meta">${note}</span>
          <button type="button" class="lib-edit" data-edit="${esc(it.id)}" aria-label="Modifica ${esc(it.name)}">${ICONS.edit}</button>
          <button type="button" class="lib-del" data-del="${esc(it.id)}" aria-label="Togli ${esc(it.name)} dall’armadio">${ICONS.x}</button>
        </li>`;
    }).join('') : `<li class="lib-empty">${all.length ? 'Nessun gioco corrisponde alla ricerca.' : 'L’armadio è vuoto: aggiungete i giochi che avete portato.'}</li>`;
  }
};

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

SCREENS.lobby = {
  mount(el) {
    this.sig = '';
    this.known = new Set(activePlayers(S.players).map((p) => p.uid));
    const joinUrl = playUrl();
    el.innerHTML = `
      <section class="lobby">
        <div class="lobby-left">
          <h1 class="logo logo--xl">GameNight <span class="logo-tag">Show</span></h1>
          <div class="card qr-card tilt-left" id="lobbyQr">
            <div class="qr" id="qr"></div>
            <p class="qr-title">Inquadra per entrare</p>
            <p class="qr-code">Codice stanza <span class="code-chip">${esc(S.code)}</span></p>
          </div>
          <div class="card qr-card qr-card--locked tilt-left" id="lobbyLocked" hidden>
            <p class="lock-big" aria-hidden="true">🔒</p>
            <p class="qr-title">Stanza chiusa</p>
            <p class="muted">Nessun nuovo ingresso. Chi era già in partita può rientrare dal suo telefono.</p>
          </div>
          <p class="qr-url" id="lobbyUrl">${esc(joinUrl.replace(/^https?:\/\//, ''))}</p>
          ${S.meta.groupName ? `<p class="lobby-group" id="lobbyIdentity">Gruppo: ${esc(S.meta.groupName)}</p>` : ''}
          ${regiaCode() ? `<p class="lobby-regia">Codice regia <b>${esc(prettyRegia(regiaCode()))}</b> (fotografalo: serve se il PC si spegne)</p>` : ''}
        </div>
        <div class="lobby-right">
          <div class="lobby-head">
            <h2>Chi c'è stasera</h2>
            <button type="button" class="btn-sec btn-sec--sm" id="lobbyLock"></button>
            <div class="stepper" role="group" aria-label="Posti nella stanza">
              <button type="button" class="step-btn" data-step="-1" aria-label="Un posto in meno">${ICONS.minus}</button>
              <output id="lobbyCount" aria-live="polite"></output>
              <button type="button" class="step-btn" data-step="1" aria-label="Un posto in più">${ICONS.plus}</button>
            </div>
          </div>
          <div class="slots" id="slots"></div>
          <div class="prep" id="lobbyPrep"></div>
          ${S.meta.demo ? '<p class="demo-note">🧪 <b>Modalità prova:</b> i giocatori finti entrano, pronosticano e votano da soli. Niente viene salvato in un gruppo. Puoi far entrare anche un telefono vero. <button type="button" class="btn-sec btn-sec--sm" id="addBot">+ Giocatore finto</button></p>' : ''}
          <div class="lobby-foot">
            <p id="lobbyHint" class="hint-line"></p>
            ${hasLib() ? `<button class="btn-sec" type="button" id="lobbyLib">${ICONS.books}<span id="lobbyLibTxt">Armadio</span></button>` : ''}
            <button class="btn btn-big" type="button" id="startBtn">${ICONS.play}<span id="startLabel">Inizia la serata</span></button>
          </div>
        </div>
      </section>`;
    renderQR($('#qr', el), joinUrl);

    el.addEventListener('click', (e) => {
      const step = e.target.closest('.step-btn');
      if (step) { changeSeats(Number(step.dataset.step)); return; }
      const kick = e.target.closest('[data-kick]');
      if (kick) { confirmKick(kick.dataset.kick); return; }
      if (e.target.closest('#lobbyLock')) setLocked(!S.meta?.locked).catch((err) => toast(explainError(err), 'error'));
      if (e.target.closest('#addBot')) Demo.addBot();
      if (e.target.closest('#openPlan')) PlanPanel.open();
    });
    $('#startBtn', el).addEventListener('click', () => setPhase('idle'));
    $('#lobbyLib', el)?.addEventListener('click', () => LibPanel.open());
  },

  update() {
    const ps = activePlayers(S.players);
    const max = S.meta.maxPlayers || DEFAULT_PLAYERS;
    const n = ps.length;
    $('#lobbyCount').textContent = `${n} / ${max}`;
    const prep = prepHTML();
    if (prep !== this.prepSig) { this.prepSig = prep; $('#lobbyPrep').innerHTML = prep; $('#lobbyPrep').hidden = !prep; }
    const locked = Boolean(S.meta?.locked);
    $('#lobbyQr').hidden = locked;
    $('#lobbyUrl').hidden = locked;
    $('#lobbyLocked').hidden = !locked;
    $('#lobbyLock').innerHTML = locked ? '🔓 <span>Riapri la stanza</span>' : '🔒 <span>Chiudi la stanza</span>';

    const sig = JSON.stringify([max, ps.map((p) => [p.uid, p.name, p.style, p.seed, p.color, p.opts, (p.photo || '').length, p.motto, isOnline(p.uid)]), Object.keys(S.nights || {}).length]);
    if (sig !== this.sig) {
      if (ps.some((p) => !this.known.has(p.uid)) && this.known.size + 1 > 0 && this.sig) joinSound();
      this.sig = sig;
      const slots = $('#slots');
      slots.classList.toggle('slots--many', Math.max(max, n) > 8);
      const filled = ps.map((p, i) => {
        const isNew = !this.known.has(p.uid);
        return `
          <div class="slot ${isNew ? 'is-new' : ''} ${isOnline(p.uid) ? '' : 'is-offline'}" style="--tilt:${TILTS[i % TILTS.length]}deg">
            ${isOnline(p.uid) ? '' : `<span class="offline-badge" title="Telefono non collegato">${ICONS.wifiOff}</span>`}
            <span class="slot-av">${avatarHTML(p, 'var(--slot-av)')}${trophyBadges(p)}</span>
            <span class="slot-name">${esc(p.name)} <small class="lv-badge">Lv ${progressFor(S.nights, personKey(p), S.library).level}</small></span>
            ${trophyTitle(p) ? `<span class="slot-title">${esc(trophyTitle(p))}</span>` : ''}
            ${p.motto ? `<span class="slot-motto">«${esc(p.motto)}»</span>` : ''}
            <button type="button" class="kick" data-kick="${esc(p.uid)}" aria-label="Rimuovi ${esc(p.name)}">${ICONS.x}</button>
          </div>`;
      }).join('');
      const empty = Array.from({ length: Math.max(0, max - n) }, () => `
          <div class="slot slot--empty"><span class="slot-q">?</span><span class="slot-name">In attesa…</span></div>`).join('');
      slots.innerHTML = filled + empty;
      this.known = new Set(ps.map((p) => p.uid));
    }

    const idBox = $('#lobbyIdentity');
    if (idBox) {
      const h = `${emblemHTML(S.identity, 'emblem--lobby')}<span>Gruppo: <b>${esc(S.meta.groupName)}</b>${S.identity?.motto ? `<br><i>«${esc(S.identity.motto)}»</i>` : ''}</span>`;
      if (idBox.innerHTML !== h) idBox.innerHTML = h;
    }
    const libTxt = $('#lobbyLibTxt');
    if (libTxt) {
      const nLib = libraryItems().length;
      const nSel = selectedIds().length;
      libTxt.textContent = nLib ? `${armadioName()}: ${nLib} ${nLib === 1 ? 'gioco' : 'giochi'}${nSel ? ` · ⭐ ${nSel}` : ''}` : `${armadioName()}: vuoto, aggiungi i giochi`;
    }
    const hint = $('#lobbyHint');
    const btn = $('#startBtn');
    if (n < MIN_PLAYERS) {
      hint.textContent = `Servono almeno ${MIN_PLAYERS} giocatori per iniziare.`;
      btn.disabled = true;
      $('#startLabel').textContent = 'Inizia la serata';
    } else if (n < max) {
      hint.textContent = `${max - n === 1 ? 'Manca un giocatore' : `Mancano ${max - n} giocatori`}: chi arriva dopo può entrare anche a serata iniziata.`;
      btn.disabled = false;
      $('#startLabel').textContent = `Inizia con ${n}`;
    } else {
      hint.textContent = 'Tutti dentro? Si parte!';
      btn.disabled = false;
      $('#startLabel').textContent = 'Inizia la serata';
    }
  }
};

// ---------------------------------------------------------------------------
// Prossimo gioco
// ---------------------------------------------------------------------------

function miniBoardHTML(board) {
  if (!board.length) {
    return `<div class="empty-board"><p class="empty-title">Ancora nessun gioco votato</p><p class="muted">Scrivete il nome del primo gioco e aprite la votazione.</p></div>`;
  }
  return `<ol class="mini-board">${board.slice(0, 7).map((r) => `
    <li class="mini-row">
      <span class="mini-rank">${r.rank}</span>
      ${gameImageHTML(r, 'game-img--mini')}
      <span class="mini-name">${esc(r.name)}</span>
      <span class="mini-avg">${fmt(r.stats.avg)}</span>
    </li>`).join('')}</ol>
    ${board.length > 7 ? `<p class="muted">E altri ${board.length - 7}…</p>` : ''}`;
}

SCREENS.idle = {
  mount(el) {
    this.mode = 'drop';
    const number = Object.keys(S.games).length + 1;
    const board = buildBoard(S.games, S.votes);
    el.innerHTML = `
      <section class="idle">
        <form class="card next-card" id="nextForm" novalidate>
          <h1>Gioco ${number}</h1>
          <p class="play-timer" id="playTimer" hidden></p>
          <div class="live-box" id="liveBox"></div>
          <div class="lib-pick" id="libPick"></div>
          <label class="field-label" for="gameName">Nome del gioco</label>
          <input class="input input--xl" id="gameName" maxlength="40" autocomplete="off" placeholder="Es. Codenames" value="${esc(S.draft.name)}">
          <p class="field-label photo-label">Foto del gioco <span class="muted">(facoltativa)</span></p>
          <div class="photo-row">
            <div class="dropzone" id="dropzone"></div>
            <div class="img-actions">
              <button type="button" class="btn-sec" id="pickFile">${ICONS.image}<span>Scegli file</span></button>
              <button type="button" class="btn-sec" id="fromPhone" aria-pressed="false">${ICONS.phone}<span>Dal telefono</span></button>
              <button type="button" class="btn-sec" id="fromUrl" aria-expanded="false" aria-controls="urlPanel">${ICONS.link}<span>Da un link</span></button>
            </div>
          </div>
          <input type="file" id="fileInput" accept="image/*" hidden>
          <div class="url-panel" id="urlPanel" hidden>
            <label class="sr-only" for="urlInput">Link dell'immagine</label>
            <input class="input" id="urlInput" type="url" inputmode="url" placeholder="https://…/immagine.jpg">
            <button type="button" class="btn-sec" id="urlOk">Usa link</button>
          </div>
          <div class="win-pick">
            <div class="win-head">
              <span class="field-label" id="winLabel">Chi ha giocato e chi ha vinto? <span class="muted">(tocca: vincitore, poi spettatore)</span></span>
              <label class="quick-toggle" title="Solo voto generale e MVP: per i giochi brevi"><input type="checkbox" id="quickChk" ${S.draft.quick ? 'checked' : ''}><span>Voto veloce</span></label>
            </div>
            <div class="win-avs" id="winAvs" role="group" aria-labelledby="winLabel"></div>
          </div>
          <p class="form-error" id="nextErr" role="alert"></p>
          <div class="ov-row">
            <button class="btn-sec" type="button" id="openRules" title="Riassunto delle regole, chi lo conosce già e cronometro della spiegazione">📖 <span>Regole</span></button>
            <button class="btn-sec" type="button" id="startPlay">${ICONS.clock}<span id="startPlayTxt">Inizia la partita</span></button>
            <button class="btn btn-big" type="submit" id="openVote">${ICONS.lock}<span>Apri la votazione</span></button>
          </div>
        </form>
        <aside class="side-board">
          <div class="side-head">
            <h2>Classifica</h2>
            ${board.length ? `<span class="muted">${board.length} ${board.length === 1 ? 'gioco' : 'giochi'}</span>` : ''}
          </div>
          ${miniBoardHTML(board)}
          <div class="side-actions">
            ${board.length ? `<button type="button" class="btn-sec" id="showBoard">${ICONS.trophy}<span>Classifica a tutto schermo</span></button>` : ''}
            ${S.meta.groupId ? `<button type="button" class="btn-sec" id="showAllTime">${ICONS.star}<span>Classifica di sempre</span></button>` : ''}
            <button type="button" class="btn-sec" id="showInterval" title="Curiosità, foto e trivia a rotazione (tasto I)">☕ <span>Intervallo</span></button>
            <button type="button" class="btn-sec" id="openTable" title="Chi inizia, squadre e clessidra (tasto T)">🎲 <span>Tavolo</span></button>
            ${S.meta.groupId ? '<button type="button" class="btn-sec" id="openPlan" title="Ordine dei giochi per il tempo che avete">🗓️ <span>Scaletta</span></button>' : ''}
            <button type="button" class="btn-sec" id="openQuiz" title="Quiz del gruppo dai telefoni (tasto Q)">🧠 <span>Quiz</span></button>
            <button type="button" class="btn-sec" id="endNight">🏁 <span>Termina la serata</span></button>
          </div>
        </aside>
      </section>`;

    $('#showAllTime', el)?.addEventListener('click', () => openAllTime());
    $('#showInterval', el).addEventListener('click', () => Interval.open());
    $('#openTable', el).addEventListener('click', () => TablePanel.open());
    $('#openQuiz', el).addEventListener('click', () => Quiz.open());
    $('#openPlan', el)?.addEventListener('click', () => PlanPanel.open());
    $('#openRules', el).addEventListener('click', () => {
      const it = findLibrary(cleanName($('#gameName').value));
      if (!it) { this.error('Le regole si leggono dalla scheda dei giochi nell’armadio: scegline uno dalla lista.'); return; }
      RulesPanel.open(it.id);
    });
    $('#liveBox', el).addEventListener('click', (e) => { const b = e.target.closest('[data-score-edit]'); if (b) editScore(b.dataset.scoreEdit); });
    $('#winAvs', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-win]');
      if (!b) return;
      const uid = b.dataset.win;
      const wins = S.draft.winners || [];
      const specs = S.draft.spectators || [];
      // giocatore → vincitore → spettatore → giocatore
      if (wins.includes(uid)) { S.draft.winners = wins.filter((x) => x !== uid); S.draft.spectators = [...specs, uid]; }
      else if (specs.includes(uid)) S.draft.spectators = specs.filter((x) => x !== uid);
      else S.draft.winners = [...wins, uid];
      this.paintWinners(true);
      saveDraft();
    });
    $('#quickChk', el).addEventListener('change', (e) => { S.draft.quick = e.target.checked; saveDraft(); });
    $('#startPlay', el).addEventListener('click', () => {
      const name = cleanName($('#gameName').value);
      if (!name) { this.error('Scrivi o scegli il gioco prima di iniziare.'); $('#gameName').focus(); return; }
      update(roomRef(S.code, 'state'), playState(name, S.draft.spectators)).catch((err) => this.error(explainError(err)));
      newGameSound();
    });
    this.tick = setInterval(() => this.paintTimer(), 1000);
    $('#libPick', el).addEventListener('click', (e) => {
      if (e.target.closest('#startPoll')) { startPoll(); return; }
      if (e.target.closest('#openWheel')) { GameWheel.open(); return; }
      if (e.target.closest('#pickRandom')) { this.randomPick(); return; }
      const pu = e.target.closest('[data-plan-use]');
      if (pu) { useLibraryGame(pu.dataset.planUse); return; }
      if (e.target.closest('#openReco')) { RecoPanel.open(); return; }
      if (e.target.closest('#openLib')) { LibPanel.open(); return; }
      const po = e.target.closest('[data-pool]');
      if (po) { S.poolAll = po.dataset.pool === 'all'; this.paintLib(true); return; }
      const chip = e.target.closest('[data-lib]');
      if (!chip || this.rolling) return;
      this.pickLib(chip.dataset.lib);
    });

    const nameInput = $('#gameName', el);
    nameInput.addEventListener('input', () => {
      S.draft.name = nameInput.value;
      saveDraft();
      if (S.draft.libraryId && nameKey(S.library?.[S.draft.libraryId]?.name) !== nameKey(nameInput.value)) {
        S.draft.libraryId = null;
        this.paintLib(true);
      }
    });
    setTimeout(() => nameInput.focus(), 50);

    const fileInput = $('#fileInput', el);
    $('#pickFile', el).addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) this.useFile(fileInput.files[0]); fileInput.value = ''; });

    const dz = $('#dropzone', el);
    dz.addEventListener('click', (e) => {
      if (e.target.closest('#clearImg')) { S.draft.image = null; this.paintDrop(); return; }
      if (this.mode === 'drop' && !S.draft.image) fileInput.click();
    });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-over');
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file) this.useFile(file);
    });

    this.onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); this.useFile(item.getAsFile()); }
    };
    document.addEventListener('paste', this.onPaste);

    $('#fromPhone', el).addEventListener('click', () => {
      this.mode = this.mode === 'phone' ? 'drop' : 'phone';
      if (this.mode === 'phone' && S.pendingImage) remove(roomRef(S.code, 'pendingImage')).catch(() => {});
      this.paintDrop();
    });

    const urlBtn = $('#fromUrl', el);
    const urlPanel = $('#urlPanel', el);
    urlBtn.addEventListener('click', () => {
      urlPanel.hidden = !urlPanel.hidden;
      urlBtn.setAttribute('aria-expanded', String(!urlPanel.hidden));
      el.querySelector('.next-card').classList.toggle('has-url', !urlPanel.hidden);
      if (!urlPanel.hidden) $('#urlInput').focus();
    });
    const useUrl = async () => {
      const url = $('#urlInput').value.trim();
      try {
        const r = await gameImageFromUrl(url);
        S.draft.image = r.image;
        this.mode = 'drop';
        this.error('');
        this.paintDrop();
        urlPanel.hidden = true;
        urlBtn.setAttribute('aria-expanded', 'false');
        el.querySelector('.next-card').classList.remove('has-url');
      } catch (err) { this.error(err.message); }
    };
    $('#urlOk', el).addEventListener('click', useUrl);
    $('#urlInput', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); useUrl(); } });

    $('#nextForm', el).addEventListener('submit', (e) => { e.preventDefault(); this.openVoting(); });
    $('#showBoard', el)?.addEventListener('click', () => setPhase('board'));
    $('#endNight', el)?.addEventListener('click', endNight);

    this.paintDrop();
    this.paintLib(true);
    this.paintWinners(true);
  },

  /** Il gioco consigliato per i presenti, in una riga. */
  bestHTML(fit) {
    if (!fit.length || !Object.keys(S.nights || {}).length) return '';
    const ps = activePlayers(S.players);
    const rec = recommend({ library: poolLibrary(), nights: S.nights, present: ps.map((p) => ({ key: personKey(p), name: p.name })), playedTonight: new Set([...playedTonight()].map((k) => dbKey(k))) });
    const r = boostWishes(rec.all)[0];
    if (!r) return '';
    return `<button type="button" class="best-pick" data-lib="${esc(r.id)}"><span>💡 Consigliato: <b>${esc(r.item.name)}</b> ${r.score}%</span><small>${esc(r.reasons.slice(0, 2).join(' · '))}</small></button>`;
  },

  /** Pulsanti "Chi ha vinto?": i giocatori presenti, si possono scegliere in più. */
  paintWinners(force = false) {
    const box = $('#winAvs');
    if (!box) return;
    const ps = activePlayers(S.players);
    const chosen = new Set((S.draft.winners || []).filter((uid) => ps.some((p) => p.uid === uid)));
    const specs = new Set(S.draft.spectators || []);
    const sig = JSON.stringify([ps.map((p) => [p.uid, p.name, p.style, p.seed, p.color]), [...chosen], [...specs]]);
    if (!force && sig === this.winSig) return;
    this.winSig = sig;
    box.innerHTML = ps.map((p) => {
      const state = chosen.has(p.uid) ? 'winner' : specs.has(p.uid) ? 'spectator' : 'player';
      const label = { winner: 'ha vinto', spectator: 'guardava', player: 'ha giocato' }[state];
      return `
      <button type="button" class="win-av win-av--${state}" data-win="${esc(p.uid)}" aria-pressed="${state === 'winner'}" title="${esc(p.name)}: ${label}">
        ${state === 'winner' ? ICONS.crown : ''}${avatarHTML(p, '2.2rem')}<span>${esc(p.name)}</span>
        <small class="win-state">${label}</small>
      </button>`;
    }).join('');
  },

  /** Riga "Dall’armadio": i giochi non ancora giocati stasera, da toccare, e i modi per scegliere il prossimo. */
  paintLib(force = false) {
    const box = $('#libPick');
    if (!box) return;
    const card = box.closest('.next-card');
    if (!hasLib()) { box.hidden = true; return; }
    const items = libraryItems();
    const played = playedTonight();
    const table = onTable();
    const w = wishes();
    const pool = poolIds();
    const nTable = Object.keys(table).length;
    const sig = JSON.stringify([items.map((i) => [i.id, i.name, (i.image || '').length, i.minPlayers, i.maxPlayers, i.status, i.loanTo, isSel(i)]), [...played], S.draft.libraryId, activePlayers(S.players).length, Object.keys(table), w, S.plan, S.poolAll, armadioName()]);
    if (!force && sig === this.libSig) return;
    this.libSig = sig;
    const n = activePlayers(S.players).length;
    const inPool = (it) => !pool || pool.has(it.id);
    const fresh = items.filter((it) => !played.has(nameKey(it.name)));
    const fit = fresh.filter((it) => libOk(it, n) && inPool(it));
    const rest = fresh.filter((it) => !fit.includes(it));
    card.classList.toggle('has-lib', items.length > 0);
    if (!items.length) {
      box.innerHTML = `<p class="lib-hint">${ICONS.books}<span>Armadio vuoto: caricate i vostri giochi con <button type="button" class="inline-link" id="openLib">l’armadio</button> (meglio prima della serata) o dal telefono.</span></p>`;
      return;
    }
    const onT = (it) => (table[it.id] ? 1 : 0);
    const byTable = (a, b) => onT(b) - onT(a) || (w[b.id] || 0) - (w[a.id] || 0) || String(a.name).localeCompare(String(b.name), 'it');
    const chip = (it) => {
      const isPlayed = played.has(nameKey(it.name));
      const isUnfit = !isPlayed && (!libOk(it, n) || !inPool(it));
      const tip = isPlayed ? 'Già giocato stasera' : !isAvailable(it) ? awayLabel(it) : !libOk(it, n) ? `Non adatto a ${n} giocatori (${libInfo(it)})` : !inPool(it) ? 'Non è tra i giochi di stasera' : libInfo(it);
      return `
      <button type="button" class="lib-chip ${isPlayed ? 'is-played' : ''} ${isUnfit ? 'is-unfit' : ''}" data-lib="${esc(it.id)}" aria-pressed="${S.draft.libraryId === it.id}" ${tip ? `title="${esc(tip)}"` : ''}>
        ${gameImageHTML(it, 'game-img--chip')}<span>${table[it.id] ? '⭐ ' : ''}${esc(it.name)}${w[it.id] ? ` <em class="wish-n">♥${w[it.id]}</em>` : ''}</span>
      </button>`;
    };
    const playedItems = items.filter((it) => played.has(nameKey(it.name)));
    box.innerHTML = `
      <div class="lib-pick-head">
        <span class="field-label">Scegli il prossimo gioco <span class="muted">(${fit.length} ${fit.length === 1 ? 'disponibile' : 'disponibili'} in 📦 ${esc(armadioName())}, mai uno già giocato)</span></span>
        ${nTable >= 2 ? `<span class="pool-switch" role="group" aria-label="Tra quali giochi scegliere">
          <button type="button" class="pool-opt" data-pool="tonight" aria-pressed="${!S.poolAll}">⭐ Stasera (${nTable})</button>
          <button type="button" class="pool-opt" data-pool="all" aria-pressed="${Boolean(S.poolAll)}">📦 Tutto l’armadio</button></span>` : ''}
      </div>
      <div class="pick-modes">
        <button type="button" class="pick-mode" id="pickRandom" ${fit.length >= 2 ? '' : 'disabled'} title="Sceglie la TV, a caso">🎲<b>A caso</b></button>
        <button type="button" class="pick-mode" id="openWheel" ${fit.length >= 2 ? '' : 'disabled'} title="La ruota della fortuna">🎡<b>Ruota</b></button>
        <button type="button" class="pick-mode" id="startPoll" ${fit.length >= 2 ? '' : 'disabled'} title="Ognuno vota dal telefono">📱<b>Votazione</b></button>
        <button type="button" class="pick-mode" id="openReco" title="I consigli in base ai gusti dei presenti">💡<b>Consigli</b></button>
        <button type="button" class="pick-mode" id="openLib" title="Aggiungi o modifica i giochi (tasto L)">📦<b>Armadio</b></button>
      </div>
      ${planNextHTML()}
      ${this.bestHTML(fit)}
      <div class="lib-chips">${[...fit.sort(byTable), ...rest.sort(byTable)].map(chip).join('')}</div>
      ${playedItems.length ? `<details class="lib-played"><summary>Già giocati stasera (${playedItems.length})</summary><div class="lib-chips">${playedItems.map(chip).join('')}</div></details>` : ''}`;
  },

  /** Tra i giochi adatti e non ancora giocati, sceglie la TV: i nomi lampeggiano e poi si ferma. */
  async randomPick() {
    if (this.rolling) return;
    const n = activePlayers(S.players).length;
    const played = playedTonight();
    const pool = poolIds();
    const list = libraryItems().filter((it) => !played.has(nameKey(it.name)) && libOk(it, n) && (!pool || pool.has(it.id)));
    if (list.length < 2) { toast('Servono almeno 2 giochi adatti e non ancora giocati.', 'warn'); return; }
    this.rolling = true;
    const pick = list[Math.floor(Math.random() * list.length)];
    const chips = () => [...document.querySelectorAll('#libPick .lib-chips .lib-chip')].filter((c) => list.some((it) => it.id === c.dataset.lib));
    const steps = prefersReducedMotion() ? 1 : 16;
    drumroll(1.4);
    for (let i = 0; i < steps; i++) {
      const cs = chips();
      cs.forEach((c) => c.classList.remove('is-rolling'));
      const c = i === steps - 1 ? cs.find((x) => x.dataset.lib === pick.id) : cs[Math.floor(Math.random() * cs.length)];
      c?.classList.add('is-rolling');
      await new Promise((r) => setTimeout(r, 60 + i * i * 1.6));
    }
    chips().forEach((c) => c.classList.remove('is-rolling'));
    this.rolling = false;
    this.pickLib(pick.id);
    ding();
    toast(`🎲 La TV ha scelto: ${pick.name}!`);
  },

  /** Mette nel modulo un gioco dell'armadio. */
  pickLib(id) {
    const it = S.library?.[id];
    if (!it) return;
    S.draft = { ...S.draft, name: it.name, image: it.image || it.thumb || null, libraryId: id, quick: Boolean(it.quick) };
    upgradeDraftImage(id);
    $('#gameName').value = it.name;
    $('#quickChk').checked = S.draft.quick;
    saveDraft();
    this.mode = 'drop';
    this.error('');
    this.paintDrop();
    this.paintLib(true);
  },

  /** Timer della partita in corso (dopo "Inizia la partita"). */
  paintTimer() {
    const t = $('#playTimer');
    const start = Number(S.state?.playStart) || 0;
    const btn = $('#startPlayTxt');
    if (btn) btn.textContent = start ? 'Riavvia il timer' : 'Inizia la partita';
    if (!t) return;
    t.hidden = !start;
    const nb = Object.keys((S.state?.playId && S.bets?.[S.state.playId]) || {}).length;
    const betLeft = start ? start + 5 * 60000 - serverNow() : 0;
    const betTxt = betLeft > 0 ? `🔮 Pronostici aperti ancora ${clockText(betLeft)}${nb ? ` · ${nb}` : ''}` : nb ? `🔮 ${nb} ${nb === 1 ? 'pronostico' : 'pronostici'} (chiusi)` : '';
    if (start) t.innerHTML = `${ICONS.clock}<span>${esc(S.state.playName || 'Partita')} in corso da <b>${clockText(playElapsed())}</b></span>${betTxt ? `<span class="bet-count">${betTxt}</span>` : ''}`;
    // Segnapunti dal vivo e "sfida nella sfida" tra i giocatori della partita
    const box = $('#liveBox');
    if (box) {
      const rv = start ? rivalryLine(Object.keys(S.state.playPlayers || {}).length ? Object.keys(S.state.playPlayers) : activePlayers(S.players).map((p) => p.uid)) : '';
      const html = start ? `${liveScoresHTML()}${rv ? `<p class="rival-line">${esc(rv)}</p>` : ''}` : '';
      if (html !== this.liveSig) { this.liveSig = html; box.innerHTML = html; }
    }
  },

  update() {
    this.paintTimer();
    this.paintLib();
    this.paintWinners();
    const p = S.pendingImage;
    if (p && isImageSource(p.data) && /^data:image\//.test(p.data)) {
      S.draft.image = p.data;
      this.mode = 'drop';
      this.paintDrop();
      toast('Foto ricevuta dal telefono');
      remove(roomRef(S.code, 'pendingImage')).catch(() => {});
    }
  },

  unmount() {
    clearInterval(this.tick);
    document.removeEventListener('paste', this.onPaste);
  },

  error(msg) {
    const e = $('#nextErr');
    if (e) e.textContent = msg;
  },

  async useFile(file) {
    this.error('');
    try {
      S.draft.image = await gameImage(file);
      this.mode = 'drop';
      this.paintDrop();
    } catch (err) {
      this.error(err.message);
    }
  },

  paintDrop() {
    const dz = $('#dropzone');
    if (!dz) return;
    saveDraft();
    const phoneBtn = $('#fromPhone');
    phoneBtn?.setAttribute('aria-pressed', String(this.mode === 'phone'));
    dz.classList.toggle('has-img', Boolean(S.draft.image) && this.mode === 'drop');
    dz.classList.toggle('is-phone', this.mode === 'phone');
    if (this.mode === 'phone') {
      dz.innerHTML = `<div class="phone-drop"><div class="qr qr--sm" id="photoQr"></div><p>Inquadra con il telefono e scatta una foto alla scatola: comparirà qui.</p></div>`;
      renderQR($('#photoQr'), playUrl({ foto: '1' }));
    } else if (S.draft.image) {
      dz.innerHTML = `<img src="${esc(S.draft.image)}" alt="Anteprima della foto"><button type="button" class="drop-clear" id="clearImg" aria-label="Rimuovi la foto">${ICONS.x}</button>`;
    } else {
      dz.innerHTML = `<div class="drop-hint">${ICONS.image}<span>Trascina qui una foto o incollala con Ctrl+V</span></div>`;
    }
  },

  async openVoting() {
    const name = cleanName($('#gameName').value);
    if (!name) {
      this.error('Scrivi il nome del gioco.');
      $('#gameName').focus();
      return;
    }
    const btn = $('#openVote');
    btn.disabled = true;
    try {
      await openVotingWith({ ...S.draft, name });
    } catch (err) {
      this.error(explainError(err));
      btn.disabled = false;
    }
  }
};

/**
 * Apre la votazione di un gioco. Usata dal modulo della TV e dalla regia sul telefono.
 * Misura anche quanto è durata la partita (dall'inizio della schermata "Prossimo gioco").
 */
async function openVotingWith(d) {
  const name = cleanName(d.name);
  if (!name) throw userError('Manca il nome del gioco.');
  const lib = (d.libraryId && S.library?.[d.libraryId]) ? { id: d.libraryId, ...S.library[d.libraryId] } : findLibrary(name);
  let image = d.image || lib?.image || null;
  // Dall'armadio arriva la miniatura: per la TV serve la foto grande (scaricata solo adesso).
  if (lib?.id && S.meta?.armadioId && (!image || image === lib.thumb)) image = (await fullImage(S.meta.armadioId, lib.id, lib).catch(() => null)) || image;
  const quick = Boolean(d.quick);
  let libraryId = lib?.id || null;
  // I giochi nuovi entrano nell’armadio da soli, così la prossima volta ci sono già.
  if (hasLib()) {
    try { libraryId = await addToLibrary(name, image, 'TV'); } catch (err) { console.warn(err); }
  }
  const startedAt = S.state?.phase === 'idle' ? Number(S.state.playStart || S.state.at) : 0;
  const playedMin = startedAt ? Math.round(playElapsed(startedAt) / 60000) : 0;
  const measured = playedMin >= 2 && playedMin <= 300 ? playedMin : null;
  if (libraryId && hasLib()) {
    const item = S.library?.[libraryId] || {};
    const patch = {};
    if (Boolean(item.quick) !== quick) patch.quick = quick || null;
    if (measured) {
      patch.playedCount = (Number(item.playedCount) || 0) + 1;
      patch.playedTotal = (Number(item.playedTotal) || 0) + measured;
    }
    if (Object.keys(patch).length) update(libRef(libraryId), patch).catch(() => {});
  }
  const specs = new Set(d.spectators || []);
  const playing = activePlayers(S.players).filter((p) => !specs.has(p.uid)).map((p) => p.uid);
  // Segnapunti: i punti restano con il gioco e, se non è segnato nessun vincitore, vince chi ne ha di più.
  const scRaw = S.state?.phase === 'idle' && S.state?.playId ? (S.scores?.[S.state.playId] || {}) : {};
  const scores = Object.fromEntries(Object.entries(scRaw).filter(([u, v]) => typeof v === 'number' && S.players[u]));
  let chosenWins = d.winners || [];
  if (!chosenWins.length && Object.keys(scores).length) {
    const top = Math.max(...Object.values(scores));
    chosenWins = Object.keys(scores).filter((u) => scores[u] === top);
  }
  const winnerIds = chosenWins.filter((uid) => S.players[uid] && !S.players[uid].away && !specs.has(uid));
  const winners = winnerIds.length ? Object.fromEntries(winnerIds.map((uid) => [uid, true])) : null;
  const gRef = push(roomRef(S.code, 'games'));
  const order = Object.keys(S.games).length + 1;
  // I pronostici fatti durante la partita si chiudono qui e restano con il gioco.
  const betsRaw = S.state?.phase === 'idle' && S.state?.playId ? (S.bets?.[S.state.playId] || {}) : {};
  const bets = Object.fromEntries(Object.entries(betsRaw).filter(([uid, t]) => S.players[uid] && typeof t === 'string' && S.players[t]));
  await set(gRef, {
    name, image, libraryId, winners, quick: quick || null, playedMin: measured, order, status: 'voting', createdAt: serverTimestamp(),
    bets: Object.keys(bets).length ? bets : null,
    scores: Object.keys(scores).length ? scores : null,
    // Solo se qualcuno guardava: altrimenti hanno giocato tutti i presenti
    players: specs.size && playing.length ? Object.fromEntries(playing.map((uid) => [uid, true])) : null
  });
  S.draft = EMPTY_DRAFT();
  saveDraft();
  await setPhase('voting', gRef.key);
  if (Object.keys(S.bets || {}).length) remove(roomRef(S.code, 'bets')).catch(() => {});
  if (Object.keys(S.scores || {}).length) remove(roomRef(S.code, 'scores')).catch(() => {});
}

/** La foto grande del gioco scelto dall'armadio arriva dopo (nell'elenco c'è solo la miniatura). */
function upgradeDraftImage(id) {
  const aid = S.meta?.armadioId;
  const it = S.library?.[id];
  if (!aid || !it || it.image) return;
  fullImage(aid, id, it).then((full) => {
    if (!full || full === it.thumb || S.draft?.libraryId !== id || (S.draft.image && S.draft.image !== it.thumb)) return;
    S.draft.image = full;
    saveDraft();
    if (S.screen === SCREENS.idle && $('#gameName')) SCREENS.idle.paintDrop?.();
  }).catch(() => {});
}

/** Sceglie un gioco dell’armadio per il modulo "Prossimo gioco" (ruota dei giochi). */
function chooseGame(id) {
  const it = S.library?.[id];
  if (!it) return;
  S.draft = { ...S.draft, name: it.name, image: it.image || it.thumb || null, libraryId: id, quick: Boolean(it.quick) };
  saveDraft();
  upgradeDraftImage(id);
  if (S.screen === SCREENS.idle && $('#gameName')) {
    $('#gameName').value = it.name;
    const q = $('#quickChk');
    if (q) q.checked = S.draft.quick;
    SCREENS.idle.mode = 'drop';
    SCREENS.idle.paintDrop();
    SCREENS.idle.paintLib(true);
  }
}

/** Stanze a scadenza: una volta per serata, se il gruppo lo chiede e questo computer è autorizzato. */
function maybeCleanup() {
  const gid = S.meta?.groupId;
  const days = Number(S.privacy?.expireDays) || 0;
  if (!gid || !days || !S.groupAdmin || S.cleanedFor === `${gid}|${days}` || S.meta?.demo) return;
  S.cleanedFor = `${gid}|${days}`;
  cleanupOldRooms(gid, days).catch(() => {});
}

// ---------------------------------------------------------------------------
// Prossimo gioco, eventi casuali (modalità Chaos) e consigli
// ---------------------------------------------------------------------------

async function goNext() {
  const ev = S.meta?.chaos ? chaosEvent() : null;
  if (ev?.chooser) update(roomRef(S.code, 'meta'), { chaosChosen: [...asList(S.meta.chaosChosen), ev.chooser] }).catch(() => {});
  await setPhase('idle', null, ev ? { event: ev } : {});
}

function winsTonight() {
  const wins = {};
  for (const g of Object.values(S.games || {})) {
    if (g?.status !== 'revealed') continue;
    for (const uid of Object.keys(g.winners || {})) wins[uid] = (wins[uid] || 0) + 1;
  }
  return wins;
}

/** Un evento a caso tra quelli possibili in questo momento. */
function chaosEvent() {
  const ps = activePlayers(S.players);
  if (!ps.length) return null;
  const n = ps.length;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const items = libraryItems();
  const played = playedTonight();
  const fresh = items.filter((it) => !played.has(nameKey(it.name)) && libOk(it, n));
  const seen = lastPlayed(S.nights);
  const names = (list) => namesList(list.slice(0, 4).map((it) => it.name));
  const events = [];
  const chosen = new Set(asList(S.meta?.chaosChosen));
  const notChosen = ps.filter((p) => !chosen.has(p.uid));
  if (notChosen.length) { const p = pick(notChosen); events.push({ title: `Sceglie ${p.name}`, text: 'Non ha ancora scelto un gioco stasera: la parola a lui… o a lei!', chooser: p.uid }); }
  const wins = winsTonight();
  const fewest = Math.min(...ps.map((p) => wins[p.uid] || 0));
  const losers = ps.filter((p) => (wins[p.uid] || 0) === fewest);
  if (Object.keys(wins).length) { const p = pick(losers); events.push({ title: `Sceglie ${p.name}`, text: 'Chi ha vinto meno stasera sceglie il prossimo gioco.' }); }
  const last = Object.values(S.games || {}).filter((g) => g?.status === 'revealed').sort((a, b) => (b.order || 0) - (a.order || 0))[0];
  const lastWin = last && Object.keys(last.winners || {}).map((uid) => S.players[uid]).filter((p) => p && !p.away);
  if (lastWin?.length) events.push({ title: `Sceglie ${pick(lastWin).name}`, text: `Il vincitore di ${last.name} sceglie il prossimo gioco.` });
  if (fresh.length) { const it = pick(fresh); events.push({ title: `Sorteggio: ${it.name}!`, text: 'Il destino ha deciso.', libraryId: it.id }); }
  const never = fresh.filter((it) => !(dbKey(it.name) in seen));
  if (never.length >= 2) events.push({ title: 'Solo giochi mai giocati', text: `Scegliete tra: ${names(never)}.` });
  const short = fresh.filter((it) => durationOf(it) && durationOf(it) <= 30);
  if (short.length >= 2) events.push({ title: 'Solo giochi sotto i 30 minuti', text: `Scegliete tra: ${names(short)}.` });
  const oldest = [...fresh].filter((it) => it.addedAt).sort((a, b) => Number(a.addedAt) - Number(b.addedAt))[0];
  if (oldest) events.push({ title: `Si gioca a ${oldest.name}`, text: 'È il gioco più vecchio dell’armadio: tocca a lui.', libraryId: oldest.id });
  const flops = buildAllTime(S.nights, S.library).games.filter((g) => g.avg < 6);
  const flop = fresh.find((it) => flops.some((g) => g.key === dbKey(it.name)));
  if (flop) events.push({ title: `Seconda chance: ${flop.name}`, text: 'Aveva preso meno di 6: dategli un’altra possibilità.', libraryId: flop.id });
  const rec = recommend({ library: S.library, nights: S.nights, present: ps.map((p) => ({ key: personKey(p), name: p.name })), playedTonight: new Set([...played].map((k) => dbKey(k))) });
  if (rec.all[0]) events.push({ title: `La TV decide: ${rec.all[0].item.name}`, text: `Compatibilità con i presenti: ${rec.all[0].score}%.`, libraryId: rec.all[0].id });
  events.push({ title: 'Scambio di posti!', text: 'Ognuno si sposta di due posti a sinistra prima della prossima partita.' });
  const ev = pick(events);
  return { id: Math.random().toString(36).slice(2, 9), ...ev };
}

/** Prepara un gioco dell’armadio nel modulo "Prossimo gioco". */
function useLibraryGame(id) {
  const it = S.library?.[id];
  if (!it) return;
  S.draft = { ...S.draft, name: it.name, image: it.image || it.thumb || null, libraryId: id, quick: Boolean(it.quick) };
  upgradeDraftImage(id);
  saveDraft();
  if (S.screen === SCREENS.idle && $('#gameName')) {
    $('#gameName').value = it.name;
    $('#quickChk').checked = S.draft.quick;
    SCREENS.idle.mode = 'drop';
    SCREENS.idle.paintDrop();
    SCREENS.idle.paintLib(true);
  }
}

/** Evento casuale mostrato sulla TV appena si passa al prossimo gioco. */
function paintEvent() {
  const ev = S.state?.phase === 'idle' ? S.state.event : null;
  let el = $('#eventOverlay');
  if (!ev || S.eventSeen === ev.id) { el?.remove(); return; }
  if (el?.dataset.id === ev.id) return;
  el?.remove();
  el = document.createElement('div');
  el.id = 'eventOverlay';
  el.dataset.id = ev.id;
  el.className = 'overlay';
  const it = ev.libraryId ? S.library?.[ev.libraryId] : null;
  el.innerHTML = `
    <div class="card panel event-card" role="alertdialog" aria-modal="true" aria-labelledby="evTitle">
      <p class="event-kicker">Evento casuale!</p>
      ${it ? gameImageHTML(it, 'game-img--event tilt-left') : '<div class="event-dice" aria-hidden="true">🎲</div>'}
      <h2 id="evTitle">${esc(ev.title)}</h2>
      <p class="lead-line">${esc(ev.text)}</p>
      <div class="claim-actions">
        ${it ? `<button type="button" class="btn-sec" id="evOk">Ignora</button><button type="button" class="btn btn-big" id="evUse">Prepara ${esc(it.name)}</button>` : '<button type="button" class="btn btn-big" id="evOk">Va bene!</button>'}
      </div>
    </div>`;
  document.body.appendChild(el);
  fanfare();
  const close = () => { S.eventSeen = ev.id; el.remove(); };
  $('#evOk', el)?.addEventListener('click', close);
  $('#evUse', el)?.addEventListener('click', () => { useLibraryGame(ev.libraryId); close(); });
}

/** Time-out chiamato da un telefono: fischio e pausa. */
const doneBuzz = new Set();
function processBuzz() {
  for (const [id, b] of Object.entries(S.buzz || {})) {
    if (doneBuzz.has(id)) continue;
    doneBuzz.add(id);
    remove(roomRef(S.code, `buzz/${id}`)).catch(() => {});
    if (Number(b?.at) && Date.now() - Number(b.at) > 60000) continue;
    const who = S.players[b?.by]?.name || 'Qualcuno';
    whistle();
    setPaused(true, `Time-out chiamato da ${who}${b?.reason ? `: ${String(b.reason).slice(0, 40)}` : ''}`).catch(() => {});
  }
}

/** Pannello "Cosa giochiamo stasera?": consigli per i presenti, con il perché. */
const RecoPanel = {
  el: null,
  max: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !hasLib()) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="rcTitle">
        <div class="panel-head"><h2 id="rcTitle">Cosa giochiamo stasera?</h2><button type="button" class="icon-btn" id="rcClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="rc-filter"><span class="field-label">Tempo a disposizione</span>
          <div class="seg" id="rcTime">${[[null, 'Qualsiasi'], [30, '30 min'], [45, '45 min'], [60, '1 ora'], [90, '1 ora e ½']].map(([v, l]) => `<button type="button" data-max="${v ?? ''}" aria-pressed="${this.max === v}">${l}</button>`).join('')}</div></div>
        <div id="rcBody"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#rcClose')) { this.close(); return; }
      const m = e.target.closest('[data-max]');
      if (m) { this.max = m.dataset.max ? Number(m.dataset.max) : null; el.querySelectorAll('[data-max]').forEach((b) => b.setAttribute('aria-pressed', String(b === m))); this.paint(); return; }
      const u = e.target.closest('[data-use]');
      if (u) { useLibraryGame(u.dataset.use); this.close(); }
    });
    this.paint();
  },
  paint() {
    const ps = activePlayers(S.players);
    const rec = recommend({
      library: poolLibrary(), nights: S.nights, maxMinutes: this.max,
      present: ps.map((p) => ({ key: personKey(p), name: p.name })),
      playedTonight: new Set([...playedTonight()].map((k) => dbKey(k)))
    });
    const card = (r) => `
      <li class="rc-item">
        ${gameImageHTML(r.item, 'game-img--thumb')}
        <div class="rc-text"><b>${esc(r.item.name)}</b><span class="muted">${esc(r.reasons.join(' · '))}</span></div>
        <span class="rc-score">${r.score}%</span>
        <button type="button" class="btn-sec btn-sec--sm" data-use="${esc(r.id)}">Scegli</button>
      </li>`;
    const sec = (title, list) => list.length ? `<section class="rc-sec"><h3>${title}</h3><ol class="rc-list">${list.map(card).join('')}</ol></section>` : '';
    rec.top = boostWishes(rec.top);
    const body = (poolIds() ? '<p class="muted">Scelgo tra i giochi <b>sul tavolo stasera</b>.</p>' : '') + sec('🔥 Consigliati', rec.top) + sec('🎲 Potreste provare', rec.tryNew) + sec('🕰️ Da rispolverare', rec.dusty.filter((d) => !rec.top.slice(0, 3).includes(d)));
    $('#rcBody', this.el).innerHTML = body || `<p class="muted">Nessun gioco nell’armadio adatto a ${ps.length} giocatori${this.max ? ` e a ${this.max} minuti` : ''}.</p>`;
  },
  close() { this.el?.remove(); this.el = null; }
};

/** Domande della serata, criteri attivi e modalità Chaos. */
const VotingPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S.meta) return;
    const v = S.meta.voting || {};
    const custom = asList(v.custom);
    const sugg = ['Lo consiglieresti?', 'Quanto ti ha fatto ridere?', 'È durato il giusto?', 'Quanta tensione?', 'Lo rigiocheresti subito?'];
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="vpTitle">
        <div class="panel-head"><h2 id="vpTitle">Domande della serata</h2><button type="button" class="icon-btn" id="vpClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <p class="panel-note">Il voto generale (1–10) e l’MVP ci sono sempre. Scegli quali domande da 1 a 5 fare stasera; ognuno può sempre rispondere "Non giudico".</p>
        <div class="vp-list">${CRITERIA.map((c) => `<label class="quick-toggle"><input type="checkbox" data-crit="${c.key}" ${v[c.key] !== false ? 'checked' : ''}><span>${c.label}</span></label>`).join('')}</div>
        <span class="field-label">Domande personalizzate (fino a due)</span>
        <input class="input" id="vpC1" maxlength="40" placeholder="Es. Lo consiglieresti?" value="${esc(custom[0]?.label || '')}">
        <input class="input" id="vpC2" maxlength="40" placeholder="Es. Quanto ti ha fatto ridere?" value="${esc(custom[1]?.label || '')}">
        <div class="rg-chips">${sugg.map((q) => `<button type="button" class="lib-chip" data-sugg="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <label class="quick-toggle chaos-toggle"><input type="checkbox" id="vpChaos" ${S.meta.chaos ? 'checked' : ''}><span>Modalità Chaos: un evento casuale prima di ogni gioco</span></label>
        <div class="claim-actions"><button type="button" class="btn btn-big" id="vpSave">${ICONS.check}<span>Salva</span></button></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#vpClose')) { this.close(); return; }
      const s = e.target.closest('[data-sugg]');
      if (s) { const t = !$('#vpC1', el).value.trim() ? '#vpC1' : '#vpC2'; $(t, el).value = s.dataset.sugg; return; }
      if (e.target.closest('#vpSave')) {
        const voting = {};
        el.querySelectorAll('[data-crit]').forEach((c) => { voting[c.dataset.crit] = c.checked ? null : false; });
        voting.custom = [cleanName($('#vpC1', el).value), cleanName($('#vpC2', el).value)].filter(Boolean).map((label) => ({ label }));
        if (!voting.custom.length) voting.custom = null;
        try {
          await update(roomRef(S.code, 'meta'), { voting, chaos: $('#vpChaos', el).checked || null });
          toast('Domande della serata salvate');
          this.close();
        } catch (err) { toast(explainError(err), 'error'); }
      }
    });
  },
  close() { this.el?.remove(); this.el = null; }
};

/** Rivincita: lo stesso gioco è subito pronto nel modulo "Prossimo gioco", con il timer avviato. */
async function rematch(gameId) {
  const g = S.games[gameId];
  if (!g) return;
  const specs = g.players ? activePlayers(S.players).filter((p) => !g.players[p.uid]).map((p) => p.uid) : [];
  S.draft = { ...EMPTY_DRAFT(), name: g.name, image: g.image || null, libraryId: g.libraryId || null, quick: Boolean(g.quick), spectators: specs };
  saveDraft();
  await setPhase('idle', null, playState(g.name, specs));
}

/** Quante volte stasera si è giocato a questo gioco, fino a questa partita compresa. */
function matchNumber(g) {
  return Object.values(S.games || {}).filter((x) => x && nameKey(x.name) === nameKey(g.name) && (x.order || 0) <= (g.order || 0)).length;
}

function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Durata della partita in corso, senza il tempo passato in pausa. */
function playElapsed(start = Number(S.state?.playStart) || 0) {
  if (!start) return 0;
  const pausedFor = Number(S.state?.playPaused) || 0;
  const now = S.state?.paused && S.state?.pausedAt ? Number(S.state.pausedAt) : Date.now();
  return Math.max(0, now - start - pausedFor);
}

/** Riapre la votazione di un gioco già svelato, per chi non aveva fatto in tempo. */
async function reopenVoting(gameId) {
  if (!S.games[gameId]) return;
  await Save.snap(`Prima di riaprire il voto di ${S.games[gameId].name}`);
  await update(roomRef(S.code, `games/${gameId}`), { status: 'voting' });
  await setPhase('voting', gameId);
}

// ---------------------------------------------------------------------------
// Votazione in corso
// ---------------------------------------------------------------------------

async function revealGame(gameId) {
  try {
    await Save.snap(`Prima del reveal di ${S.games[gameId]?.name || 'un gioco'}`, 'phase');
    await update(roomRef(S.code, `games/${gameId}`), { status: 'revealed', revealedAt: serverTimestamp() });
    await setPhase('reveal', gameId);
    saveNight();
  } catch (err) {
    toast(explainError(err), 'error');
  }
}

SCREENS.voting = {
  mount(el) {
    this.sig = '';
    this.timer = null;
    this.clock = null;
    this.autoTimer = null;
    this.lastSec = undefined;
    this.votedBefore = new Set();
    const id = S.state.gameId;
    const g = S.games[id];
    el.innerHTML = `
      <section class="voting">
        <div class="voting-game">
          <span class="chip chip--tomato">Gioco ${g.order || ''}</span>
          ${gameImageHTML(g, 'game-img--hero tilt-left')}
          <h1 class="game-title">${esc(g.name)}</h1>
        </div>
        <div class="voting-status">
          <div class="voting-head">
            <h2 class="voting-title">Votate dal telefono</h2>
            <div class="vtimer" id="vTimer" hidden role="timer" aria-live="off">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle class="vt-track" cx="60" cy="60" r="52"/>
                <circle class="vt-arc" id="vtArc" cx="60" cy="60" r="52" stroke-dasharray="326.73" stroke-dashoffset="0"/>
                <circle class="vt-spark" id="vtSpark" cx="60" cy="8" r="5.5"/>
              </svg>
              <b id="vtNum">0</b><small id="vtLbl">secondi</small>
            </div>
          </div>
          <p class="secret-line">${ICONS.lock}<span>I voti restano segreti fino al reveal. Telefono fuori uso? Tocca il suo personaggio per votare dalla TV.</span></p>
          <div class="voters" id="voters"></div>
          <p class="vote-count" id="voteCount" aria-live="polite"></p>
          <div class="vote-note" id="voteNote"></div>
          <div class="voting-actions">
            <button type="button" class="btn-sec" id="cancelGame">Annulla gioco</button>
            <button type="button" class="btn btn-big" id="revealBtn">Rivela i voti</button>
          </div>
        </div>
      </section>`;

    $('#voters', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-proxy]');
      if (b) ProxyVote.open(id, b.dataset.proxy);
    });
    $('#voteNote', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-skip]');
      if (!b) return;
      S.skipWait.add(b.dataset.skip);
      this.update();
    });
    $('#revealBtn', el).addEventListener('click', () => {
      const { voted, total } = this.counts();
      if (voted < total && !confirm(`${total - voted === 1 ? 'Manca un voto' : `Mancano ${total - voted} voti`}. Rivelare comunque?`)) return;
      clearTimeout(this.timer);
      revealGame(id);
    });
    $('#cancelGame', el).addEventListener('click', async () => {
      if (!confirm(`Annullare “${g.name}”? Il gioco e i voti finiscono nel cestino (Strumenti), da dove si possono ripristinare.`)) return;
      clearTimeout(this.timer);
      try {
        await setPhase('idle');
        await trashGame(id);
      } catch (err) {
        toast(explainError(err), 'error');
      }
    });
  },

  counts() {
    const votes = S.votes[S.state.gameId] || {};
    const ps = activePlayers(S.players);
    const expected = expectedVoters(votes);
    return {
      ps, votes,
      voted: ps.filter((p) => votes[p.uid]).length,
      total: expected.length,
      offline: ps.length - expected.length
    };
  },

  update() {
    const { ps, votes, voted, total } = this.counts();
    const sig = JSON.stringify(ps.map((p) => [p.uid, p.name, p.style, p.seed, p.color, Boolean(votes[p.uid]), isOnline(p.uid)]));
    if (sig !== this.sig) {
      this.sig = sig;
      const box = $('#voters');
      box.classList.toggle('voters--many', total > 8);
      box.innerHTML = ps.map((p) => {
        const has = Boolean(votes[p.uid]);
        const fresh = has && !this.votedBefore.has(p.uid);
        return `
          <${has ? 'div' : 'button type="button"'} class="voter ${has ? 'is-voted' : 'voter-btn'} ${fresh ? 'is-fresh' : ''} ${!has && !isOnline(p.uid) ? 'is-offline' : ''}" style="--pc:${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#FFC93C'}; --i:${ps.indexOf(p)}" ${has ? '' : `data-proxy="${esc(p.uid)}" title="Vota dalla TV per conto di ${esc(p.name)}"`}>
            <span class="voter-av">${avatarHTML(p, 'var(--voter-av)')}${has ? `<span class="voter-badge">${ICONS.check}</span>` : ''}${!has && !isOnline(p.uid) ? `<span class="voter-badge voter-badge--off">${ICONS.wifiOff}</span>` : ''}${!has && isOnline(p.uid) ? '<span class="voter-think" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${fresh ? '<span class="voter-flash" aria-hidden="true"></span>' : ''}</span>
            <span class="voter-name">${esc(p.name)}</span>${S.games[S.state.gameId]?.players && !S.games[S.state.gameId].players[p.uid] ? '<small class="voter-aud">pubblico</small>' : ''}
          </${has ? 'div' : 'button'}>`;
      }).join('');
      if (ps.some((p) => votes[p.uid] && !this.votedBefore.has(p.uid)) && this.started) ding();
      this.started = true;
      this.votedBefore = new Set(ps.filter((p) => votes[p.uid]).map((p) => p.uid));
    }

    const all = total > 0 && voted === total;
    $('#voteCount').textContent = all ? 'Tutti hanno votato!' : `${voted} / ${total} hanno votato`;
    const missing = ps.filter((p) => !votes[p.uid] && !isOnline(p.uid));
    const waiting = missing.filter((p) => graceLeft(p.uid) > 0);
    const gone = missing.filter((p) => graceLeft(p.uid) === 0).map((p) => p.name);
    const lines = waiting.map((p) => `
      <p class="vote-wait">${ICONS.wifiOff}<span>Il telefono di ${esc(p.name)} si è scollegato: lo aspetto ancora <b>${Math.ceil(graceLeft(p.uid) / 1000)} s</b></span>
        <button type="button" class="btn-sec btn-sec--sm" data-skip="${esc(p.uid)}">Non aspettare</button></p>`);
    if (gone.length) {
      lines.push(`<p>${gone.length === 1 ? `Il telefono di ${esc(gone[0])} è scollegato` : `I telefoni di ${esc(namesList(gone))} sono scollegati`}: non ${gone.length === 1 ? 'viene aspettato' : 'vengono aspettati'}.</p>`);
    }
    const noteSig = lines.join('');
    if (noteSig !== this.noteSig) { this.noteSig = noteSig; $('#voteNote').innerHTML = noteSig; }
    // Finché qualcuno è in attesa, il conto alla rovescia si aggiorna ogni secondo.
    if (waiting.length && !this.tick) this.tick = setInterval(() => this.update(), 1000);
    if (!waiting.length && this.tick) { clearInterval(this.tick); this.tick = null; }
    $('#voteCount').classList.toggle('is-done', all);
    $('#revealBtn').disabled = voted === 0;

    if (all && !S.state?.paused) {
      if (!this.timer) this.timer = setTimeout(() => revealGame(S.state.gameId), 2000);
    } else if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.paintTimer();
  },

  /** Conto alla rovescia: anello che si consuma passando dal verde al rosso scuro. */
  paintTimer() {
    const box = $('#vTimer');
    if (!box) return;
    const t = voteTimer(S.state, serverNow());
    box.hidden = !t;
    if (!t) { clearInterval(this.clock); this.clock = null; $('#voters')?.classList.remove('voters--late'); return; }
    if (!this.clock) this.clock = setInterval(() => this.paintTimer(), 200);
    const C = 326.73;
    const ang = -Math.PI / 2 + t.frac * Math.PI * 2;
    const col = timerColor(t.frac);
    $('#vtArc').setAttribute('stroke-dashoffset', String(C * (1 - t.frac)));
    $('#vtSpark').setAttribute('cx', String(60 + Math.cos(ang) * 52));
    $('#vtSpark').setAttribute('cy', String(60 + Math.sin(ang) * 52));
    box.style.setProperty('--tc', col);
    const { voted, total } = this.counts();
    const done = total > 0 && voted === total;
    box.classList.toggle('is-hot', !t.over && !t.paused && t.sec <= 10 && !done);
    box.classList.toggle('is-over', t.over && !done);
    box.classList.toggle('is-paused', t.paused);
    $('#vtNum').textContent = t.over ? 'Tempo!' : t.paused ? '❚❚' : t.sec >= 60 ? `${Math.floor(t.sec / 60)}:${String(t.sec % 60).padStart(2, '0')}` : String(t.sec);
    $('#vtLbl').textContent = t.over ? '' : t.paused ? 'in pausa' : t.sec >= 60 ? 'minuti' : t.sec === 1 ? 'secondo' : 'secondi';
    $('#voters')?.classList.toggle('voters--late', t.over);
    // Tic negli ultimi 10 secondi, poi la sirena una volta sola.
    if (!t.paused && !done && t.sec !== this.lastSec) {
      if (t.sec <= 10 && t.sec > 0 && this.lastSec !== undefined) clockTick(t.sec <= 5);
      if (t.over && this.lastSec !== undefined && this.lastSec > 0) {
        timeUp();
        if (S.meta?.voteAuto && voted > 0 && !this.autoTimer) {
          this.autoTimer = setTimeout(() => { if (S.state?.phase === 'voting' && !S.state?.paused) revealGame(S.state.gameId); }, 2600);
        }
      }
    }
    this.lastSec = t.sec;
  },

  unmount() {
    clearTimeout(this.timer);
    clearTimeout(this.autoTimer);
    clearInterval(this.tick);
    clearInterval(this.clock);
    this.tick = null;
    this.clock = null;
    this.autoTimer = null;
    this.lastSec = undefined;
  }
};

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

function critTile(c, value) {
  const on = Math.round(value || 0);
  const pips = [1, 2, 3, 4, 5].map((k) => `<i class="${k <= on ? 'on' : ''}"></i>`).join('');
  return `
    <div class="crit-tile" style="--cc:${c.color}">
      <span class="crit-label">${c.label}</span>
      <b>${fmt(value)}<small>/ 5</small></b>
      <span class="pips" aria-hidden="true">${pips}</span>
    </div>`;
}

function mvpTile(st) {
  const winners = st.mvp.winners.map(playerOrGhost);
  if (!winners.length) {
    return `<div class="mvp-tile"><div><span class="mvp-label">MVP</span><b class="mvp-name">Nessuno</b></div></div>`;
  }
  const avs = winners.slice(0, 3).map((p) => `<span class="crowned">${ICONS.crown}${avatarHTML(p, 'var(--mvp-av)')}</span>`).join('');
  return `
    <div class="mvp-tile">
      <div class="mvp-avs">${avs}</div>
      <div class="mvp-text">
        <span class="mvp-label">MVP</span>
        <b class="mvp-name">${esc(namesList(winners.map((w) => w.name)))}</b>
        <span class="mvp-votes">${st.mvp.top} ${st.mvp.top === 1 ? 'voto' : 'voti'}</span>
      </div>
    </div>`;
}

/** Mescola una lista in modo ripetibile (stesso seme → stesso ordine). */
function seededShuffle(list, seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

SCREENS.reveal = {
  mount(el) {
    const id = S.state.gameId;
    const g = S.games[id];
    const st = gameStats(S.votes[id], g.players);
    const board = buildBoard(S.games, S.votes);
    // Le carte si girano in ordine casuale (sempre lo stesso per questo gioco, anche se la pagina si ricarica):
    // così nessuno indovina il voto dalla posizione. Prima i giocatori, poi il pubblico.
    const ordered = [
      ...seededShuffle(st.list, `${S.code}-${id}`),
      ...seededShuffle(st.audience.list, `${S.code}-${id}-pub`).map((v) => ({ ...v, aud: true }))
    ];
    const n = ordered.length;
    // Ritmo crescente: le prime carte si girano con calma, poi sempre più in fretta (fino a un minimo).
    const minStep = n > 8 ? 0.16 : 0.22;
    const spread0 = st.max !== st.min;
    // Reveal cinematico: luci basse, riflettore su ogni carta, ralenti sul voto più basso e più alto.
    const cine = cinematicOn() && !isSafeMode() && !prefersReducedMotion() && n > 0;
    const start = cine ? 1.5 : 0.6;
    const delays = [];
    const slowSet = new Set();
    let t = start;
    const lastPlayer = st.list.length - 1;
    ordered.forEach((v, i) => {
      const slow = cine && spread0 && !v.aud && (v.overall === st.max || v.overall === st.min);
      if (slow && v.overall === st.max) { drumroll(0.9, t - 0.1); t += 0.9; }
      // Prima dell'ultima carta dei giocatori un attimo di silenzio.
      else if (!slow && i === lastPlayer && lastPlayer >= 2) t += 0.45;
      delays.push(t);
      if (slow) slowSet.add(i);
      t += Math.max(minStep, (cine ? 0.85 : 0.62) * Math.pow(0.8, i)) + (slow ? 1.1 : 0);
    });
    const after = t + (cine ? 0.6 : 0.2);
    drumroll(cine ? 1.3 : 0.6);
    delays.forEach((d, i) => { pop(d + (slowSet.has(i) ? 0.8 : 0.25)); if (slowSet.has(i)) cymbal(d + 0.9); });
    if (st.n && st.avg < 5) sadTrombone(after + 0.2); else fanfare(after);
    if (g.winners) victory(after + 1.1);
    S.revealQuietUntil = Date.now() + (after + 4) * 1000;
    const br = betResults(g);
    const cols = n <= 4 ? Math.max(n, 1) : n <= 8 ? 4 : 6;
    const spread = st.max !== st.min;

    const cards = ordered.map((v, i) => {
      const p = playerOrGhost(v.uid);
      const top = !v.aud && spread && v.overall === st.max;
      const low = !v.aud && spread && v.overall === st.min;
      return `
        <div class="vcard ${v.aud ? 'is-audience' : ''} ${slowSet.has(i) ? 'is-slow' : ''}" style="--d:${delays[i].toFixed(2)}s">
          <div class="vcard-inner">
            <div class="vcard-back"><span>?</span></div>
            <div class="vcard-front ${top ? 'is-top' : ''}">
              <div class="vcard-who">${avatarHTML(p, 'var(--vc-av)')}<span>${esc(p.name)}</span></div>
              <b class="vcard-num">${v.overall}</b>
              ${v.comment ? `<span class="vcard-quote">«${esc(v.comment)}»</span>` : ''}
              <span class="vcard-tag">${v.aud ? 'Pubblico' : top ? 'Il più alto' : low ? 'Il più basso' : ''}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <section class="reveal ${cine ? 'reveal--cine' : ''}" style="--after:${after.toFixed(2)}s">
        ${cine ? '<div class="cine-dim" aria-hidden="true"></div>' : ''}
        <div class="reveal-left">
          <span class="chip chip--tomato">Gioco ${g.order || ''}: il verdetto</span>
          <div class="reveal-photo">
            ${gameImageHTML(g, 'game-img--hero tilt-left')}
            <div class="avg-badge"><span>Media</span><b>${fmt(st.avg)}</b></div>
          </div>
          <h1 class="game-title">${esc(g.name)}</h1>
          <p class="verdict-chip">${esc(verdict(st))}</p>
          ${g.winners ? `<p class="win-chip">${ICONS.trophy}<span>Ha vinto ${esc(namesList(Object.keys(g.winners).map((uid) => playerOrGhost(uid).name)))}</span></p>` : ''}
          <div class="reveal-chips">
          ${st.audience.n ? `<p class="aud-chip">Voto del pubblico: <b>${fmt(st.audience.avg)}</b> (${st.audience.n} ${st.audience.n === 1 ? 'voto' : 'voti'}, fuori dalla media)</p>` : ''}
          ${matchNumber(g) > 1 ? `<p class="aud-chip">${matchNumber(g)}ª partita a ${esc(g.name)} stasera</p>` : ''}
          ${st.consensus !== null ? `<p class="aud-chip">Consenso del gruppo: <b>${st.consensus}%</b></p>` : ''}
          ${g.winners && br.total ? `<p class="bet-chip"><span aria-hidden="true">🔮</span><span>${br.hits.length ? `Pronostico azzeccato da ${esc(namesList(br.hits.map((u) => playerOrGhost(u).name)))} (${br.hits.length} su ${br.total})` : `Nessuno dei ${br.total} ${br.total === 1 ? 'pronostico era giusto' : 'pronostici era giusto'}`}</span></p>` : ''}
          ${g.scores ? `<p class="aud-chip score-chip">🧮 <span>${esc(Object.entries(g.scores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, v]) => `${playerOrGhost(u).name} ${v}`).join(' · '))}</span></p>` : ''}
          ${st.oracle ? `<p class="oracle-chip">${ICONS.star}<span>${st.oracle.winners.length === 1
            ? `Media indovinata da ${esc(playerOrGhost(st.oracle.winners[0].uid).name)} (aveva detto ${fmt(st.oracle.winners[0].guess)})`
            : `Media indovinata da ${esc(namesList(st.oracle.winners.map((w) => playerOrGhost(w.uid).name)))}`}</span></p>` : ''}
          </div>
          <p class="rank-line">${esc(rankLine(board, id))}</p>
        </div>
        <div class="reveal-right">
          <div class="reveal-head"><h2>I voti</h2><span class="muted">${n} ${n === 1 ? 'voto' : 'voti'}</span></div>
          <div class="vcards ${cols === 6 ? 'vcards--dense' : n <= 4 ? 'vcards--one' : ''}" style="--cols:${cols}">${cards || '<p class="muted">Nessun voto ricevuto.</p>'}</div>
          <div class="crit-row ${g.quick ? 'crit-row--quick' : ''}" style="${g.quick ? '' : `grid-template-columns: repeat(${activeCriteria(S.meta.voting).length + 1}, minmax(0, 1fr))`}">
            ${g.quick ? '<div class="quick-note">Voto veloce: solo voto generale e MVP</div>' : activeCriteria(S.meta.voting).map((c) => critTile(c, st.crit[c.key])).join('')}
            ${mvpTile(st)}
          </div>
          <div class="reveal-actions">
            <button type="button" class="btn-sec" id="reopenVote" title="Per chi non ha fatto in tempo a votare">Riapri la votazione</button>
            <button type="button" class="btn-sec" id="rematchBtn" title="Rigiocate subito lo stesso gioco">Rivincita</button>
            <button type="button" class="btn-sec" id="toBoard">${ICONS.trophy}<span>Classifica</span></button>
            <button type="button" class="btn btn-big" id="nextGame">Prossimo gioco</button>
          </div>
        </div>
      </section>`;

    $('#toBoard', el).addEventListener('click', () => setPhase('board'));
    $('#nextGame', el).addEventListener('click', () => goNext());
    $('#rematchBtn', el).addEventListener('click', () => rematch(id).catch((err) => toast(explainError(err), 'error')));
    $('#reopenVote', el).addEventListener('click', () => {
      if (confirm(`Riaprire la votazione di “${g.name}”? I voti già dati restano.`)) reopenVoting(id).catch((err) => toast(explainError(err), 'error'));
    });
    if (st.avg >= 8.5) {
      this.timer = setTimeout(() => {
        confetti();
        if (st.avg >= 9) { fireworks(4, 1.6); [0.9, 1.4, 2].forEach((d) => fireworkSound(d)); }
      }, (after + 0.3) * 1000);
    }
    const mode = commentatorMode();
    if (mode !== 'off' && !isMuted() && st.n) {
      const by = (val) => st.list.filter((v) => v.overall === val).map((v) => playerOrGhost(v.uid).name);
      const line = revealComment({
        game: g.name, avg: st.avg, n: st.n, min: st.min, max: st.max, minNames: by(st.min), maxNames: by(st.max),
        winners: Object.keys(g.winners || {}).map((u) => playerOrGhost(u).name), mvp: st.mvp.winners.map((u) => playerOrGhost(u).name),
        consensus: st.consensus, rank: board.find((r) => r.id === id)?.rank, total: board.length,
        seers: br.hits.map((u) => playerOrGhost(u).name), betsTotal: br.total
      }, mode);
      this.speakTimer = setTimeout(() => speak(line), (after + 1.8) * 1000);
    }
  },

  unmount() {
    clearTimeout(this.timer);
    clearTimeout(this.speakTimer);
  }
};

// ---------------------------------------------------------------------------
// Classifica
// ---------------------------------------------------------------------------

SCREENS.board = {
  mount(el) {
    this.render(el);
  },

  render(el) {
    const board = buildBoard(S.games, S.votes);
    this.sig = board.map((r) => r.id + r.stats.n).join('|');
    const two = board.length > 6;
    const rows = board.map((r, i) => `
      <li class="brow brow--r${Math.min(r.rank, 4)}" style="--i:${i}">
        <span class="brank">${r.rank}</span>
        ${gameImageHTML(r, 'game-img--thumb')}
        <span class="bname">
          <b>${esc(r.name)}</b>
          <span class="bbar" aria-hidden="true"><i style="width:${Math.max(4, r.stats.avg * 10)}%"></i></span>
        </span>
        <span class="bcrit">${CRITERIA.map((c) => `<span class="bcrit-item" style="--cc:${c.color}" title="${c.label}">${c.short} ${fmt(r.stats.crit[c.key])}</span>`).join('')}</span>
        <span class="bavg">${fmt(r.stats.avg)}</span>
        <span class="brow-tools">
          <button type="button" class="brow-reopen" data-edit-game="${esc(r.id)}" title="Correggi ${esc(r.name)}">Modifica</button>
          <button type="button" class="brow-reopen" data-reopen="${esc(r.id)}" title="Riapri la votazione di ${esc(r.name)}">Riapri</button>
        </span>
      </li>`).join('');

    el.innerHTML = `
      <section class="board">
        <div class="board-head">
          <h1>Classifica</h1>
          <span class="muted">${board.length} ${board.length === 1 ? 'gioco votato' : 'giochi votati'}</span>
        </div>
        ${board.length
          ? `<ol class="board-list ${two ? 'board-list--two' : ''}" style="--rows:${Math.ceil(board.length / 2)}">${rows}</ol>`
          : '<div class="empty-board"><p class="empty-title">Ancora nessun gioco votato</p></div>'}
        <div class="board-actions">
          ${S.meta.groupId ? `<button type="button" class="btn-sec" id="showAllTime">${ICONS.star}<span>Classifica di sempre</span></button>` : ''}
          ${board.length ? '<button type="button" class="btn-sec" id="endNight">Termina la serata</button>' : ''}
          <button type="button" class="btn btn-big" id="nextGame">Prossimo gioco</button>
        </div>
      </section>`;
    $('#endNight', el)?.addEventListener('click', endNight);
    $('#showAllTime', el)?.addEventListener('click', () => openAllTime());
    $('#nextGame', el).addEventListener('click', () => goNext());
    el.querySelector('.board-list')?.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit-game]');
      if (ed) { EditGame.open(ed.dataset.editGame); return; }
      const b = e.target.closest('[data-reopen]');
      const g = b && S.games[b.dataset.reopen];
      if (g && confirm(`Riaprire la votazione di “${g.name}”? I voti già dati restano.`)) reopenVoting(b.dataset.reopen).catch((err) => toast(explainError(err), 'error'));
    });
  }
};

// ---------------------------------------------------------------------------
// Premiazione
// ---------------------------------------------------------------------------

SCREENS.awards = {
  mount(el) {
    this.el = el;
    this.board = buildBoard(S.games, S.votes);
    this.awards = buildAwards(this.board, S.votes, S.players);
    this.gameAwards = this.awards.filter((a) => a.kind === 'game');
    this.playerAwards = this.awards.filter((a) => a.kind === 'player');
    // Traguardi sbloccati con questa serata (calcolati con il riassunto di stasera)
    const nightsNow = { ...(S.nights || {}), [S.code]: nightSummary(this.board, S.players, S.meta, this.awards) };
    this.achAwards = [];
    if (S.meta.groupId) {
      for (const p of sortedPlayers(S.players)) {
        for (const a of newAchievements(nightsNow, personKey(p), S.code, S.library)) {
          this.achAwards.push({ key: 'ach', kind: 'ach', title: `${a.icon} ${a.name}`, players: [{ uid: p.uid, ...p }], value: a.desc, color: '#8AC926' });
        }
      }
    }
    this.awards = [...this.awards, ...this.achAwards.slice(0, 8)];
    const podium = this.board.slice(0, 3);
    // Campioni della serata: i giocatori che salgono sul podio (vittorie, voti MVP, pronostici, medie indovinate).
    this.champs = nightChampions(this.board).filter((c) => c.rank <= 3).slice(0, 3);
    // Classifica della stagione (gruppi): chi sale grazie a stasera
    this.seasonHTML = S.meta.groupId && !S.meta.demo ? seasonStageHTML() : '';
    // Prima il podio dei giochi dal terzo al primo, poi i campioni, poi i premi speciali uno alla volta.
    this.steps = [
      ...podium.map((_, i) => ({ type: 'pod', index: i })).reverse(),
      ...(this.champs.length ? [{ type: 'pstage' }, ...this.champs.map((_, i) => ({ type: 'ppod', index: i })).reverse()] : []),
      ...(this.seasonHTML ? [{ type: 'sstage' }] : []),
      ...(this.awards.length ? [{ type: 'stage' }] : []),
      ...this.awards.map((_, i) => ({ type: 'award', index: i }))
    ];
    this.step = 0;

    if (!this.board.length) {
      el.innerHTML = `
        <section class="awards awards--empty">
          <h1>Premiazione</h1>
          <div class="empty-board"><p class="empty-title">Nessun gioco votato stasera</p><p class="muted">Tornate alla serata e votate almeno un gioco.</p></div>
          <div class="awards-actions"><button type="button" class="btn btn-big" id="backIdle">Torna alla serata</button></div>
        </section>`;
      $('#backIdle', el).addEventListener('click', () => setPhase('idle'));
      return;
    }

    const podCol = (i) => {
      const r = podium[i];
      if (!r) return '<div class="pod pod--none" aria-hidden="true"></div>';
      return `
        <div class="pod pod--${i + 1}">
          <div class="pod-card is-hidden" data-pod="${i}">
            ${gameImageHTML(r, 'game-img--pod')}
            <b class="pod-name">${esc(r.name)}</b>
            <span class="pod-avg">${fmt(r.stats.avg)}</span>
          </div>
          <div class="pod-base"><span>${r.rank}</span></div>
        </div>`;
    };

    const medals = ['🏆', '🥈', '🥉'];
    const champCol = (i) => {
      const c = this.champs[i];
      if (!c) return '<div class="champ champ--none" aria-hidden="true"></div>';
      const p = playerOrGhost(c.uid);
      const bits = [c.wins ? `${c.wins} ${c.wins === 1 ? 'vittoria' : 'vittorie'}` : '', c.mvp ? `${c.mvp} MVP` : '', c.seer ? `${c.seer} ${c.seer === 1 ? 'pronostico' : 'pronostici'}` : '', c.oracle ? `${c.oracle} ${c.oracle === 1 ? 'media indovinata' : 'medie indovinate'}` : ''].filter(Boolean);
      return `
        <div class="champ champ--${i + 1}" style="--pc:${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#FFC93C'}">
          <div class="champ-who is-hidden" data-champ="${i}">
            <span class="champ-trophy" aria-hidden="true">${medals[c.rank - 1] || '🏅'}</span>
            <span class="champ-av">${avatarHTML(p, i === 0 ? '8.4rem' : '6.6rem')}</span>
            <b class="champ-name">${esc(p.name)}</b>
            <span class="champ-pts">${c.points} ${c.points === 1 ? 'punto' : 'punti'}</span>
            <small class="champ-why">${esc(bits.join(' · '))}</small>
          </div>
          <div class="champ-base champ-base--r${Math.min(c.rank, 3)}"><span>${c.rank}</span></div>
        </div>`;
    };

    const awardCard = (a) => {
      const i = this.awards.indexOf(a);
      const body = a.game
        ? `${gameImageHTML(a.game, 'game-img--award')}<b class="award-name">${esc(a.game.name)}</b>`
        : `<div class="award-people">${a.players.slice(0, 3).map((p) => `<span class="${a.key === 'mvp' ? 'crowned' : 'person'}">${a.key === 'mvp' ? ICONS.crown : ''}${avatarHTML(p, '4.2rem')}</span>`).join('')}</div><b class="award-name">${esc(namesList(a.players.map((p) => p.name)))}</b>`;
      return `
        <article class="award" data-award="${i}" style="--ac:${a.color}">
          <div class="award-inner">
            <div class="award-back">${ICONS.trophy}</div>
            <div class="award-front">
              <h3>${esc(a.title)}</h3>
              ${body}
              <span class="award-value">${esc(a.value)}</span>
            </div>
          </div>
        </article>`;
    };
    const row = (title, list) => list.length ? `
      <div class="prize-row">
        <h2 class="prize-title">${title}</h2>
        <div class="award-grid" style="--n:${list.length}">${list.map(awardCard).join('')}</div>
      </div>` : '';

    el.innerHTML = `
      <section class="awards stage-podium" id="awSec">
        <div class="awards-head">
          <div class="awards-title"><h1 id="awTitle">Premiazione</h1><div id="awStages"></div></div>
          <div class="awards-actions" id="awardsActions"></div>
        </div>
        <div class="podium">${[1, 0, 2].map(podCol).join('')}</div>
        ${this.champs.length ? `<div class="champions" id="awChamps">${[1, 0, 2].map(champCol).join('')}</div>
        <p class="champ-rule">Vittoria 3 punti · ogni voto MVP 1 · pronostico azzeccato 1 · media indovinata 1</p>` : ''}
        ${this.seasonHTML ? `<div class="season-wrap">${this.seasonHTML}</div>` : ''}
        <div class="prizes ${this.achAwards.length ? 'prizes--dense' : ''}">
          ${row('Ai giochi', this.gameAwards)}
          ${row('Ai giocatori', this.playerAwards)}
          ${row('Traguardi sbloccati stasera', this.achAwards.slice(0, 8))}
        </div>
      </section>`;
    this.stage = 'podium';

    // Si riprende dal punto raggiunto (es. dopo aver ricaricato la pagina), o tutto scoperto se era finita.
    const target = S.state?.done ? this.steps.length : Math.min(Number(S.state?.step) || 0, this.steps.length);
    if (!target) endNightSound();
    while (this.step < target) this.next(true);
    this.paintActions();
  },

  setStage(stage) {
    const sec = $('#awSec', this.el);
    sec.classList.toggle('stage-podium', stage === 'podium');
    sec.classList.toggle('stage-players', stage === 'players');
    sec.classList.toggle('stage-season', stage === 'season');
    sec.classList.toggle('stage-prizes', stage === 'prizes');
    $('#awTitle', this.el).textContent = stage === 'prizes' ? 'Premi speciali' : stage === 'players' ? 'Campioni della serata' : stage === 'season' ? 'Stagione' : 'Premiazione';
    this.stage = stage;
  },

  paintActions() {
    const box = $('#awardsActions', this.el);
    if (!box) return;
    const stagesBox = $('#awStages', this.el);
    if (stagesBox) stagesBox.innerHTML = '';
    if (this.step < this.steps.length) {
      const nextStep = this.steps[this.step];
      const label = this.step === 0 ? 'Svela il podio' : nextStep.type === 'stage' ? 'Premi speciali' : nextStep.type === 'pstage' ? 'Campioni della serata' : nextStep.type === 'sstage' ? 'Classifica di stagione' : 'Avanti';
      box.innerHTML = `<span class="muted key-hint">Barra spaziatrice per andare avanti</span><button type="button" class="btn btn-big" id="stepBtn">${label}</button>`;
      $('#stepBtn', box).addEventListener('click', () => this.next());
      $('#stepBtn', box).focus();
      return;
    }
    const stages = [['podium', 'Podio'], ...(this.champs.length ? [['players', 'Campioni']] : []), ...(this.seasonHTML ? [['season', 'Stagione']] : []), ...(this.awards.length ? [['prizes', 'Premi speciali']] : [])];
    if (stagesBox && stages.length > 1) stagesBox.innerHTML = `<div class="seg seg--stage" role="group" aria-label="Cosa mostrare">${stages.map(([k, l]) => `<button type="button" data-stage="${k}" aria-pressed="${this.stage === k}">${l}</button>`).join('')}</div>`;
    box.innerHTML = `
      <button type="button" class="btn-sec" id="shareImg">${ICONS.share}<span>Condividi</span></button>
      <button type="button" class="btn-sec" id="recapBtn" title="Il commentatore legge il riassunto della serata">🎙️ <span>Commento</span></button>
      <a class="btn-sec" id="reportLink" href="resoconto.html?room=${esc(S.code)}${S.meta.groupId ? `&g=${esc(S.meta.groupId)}` : ''}" target="_blank" rel="noopener" title="Giochi, voti, vincitori e premi: si può riaprire anche dopo">📋 <span>Resoconto</span></a>
      ${S.meta.groupId ? `<button type="button" class="btn-sec" id="openAlbum">📸 <span>Album${photoList(S.photos).length ? ` (${photoList(S.photos).length})` : ''}</span></button>` : ''}
      ${S.meta.groupId ? `<button type="button" class="btn-sec" id="toAllTime">${ICONS.star}<span>Di sempre</span></button>` : ''}
      <button type="button" class="btn" id="newNight2">Nuova serata</button>`;
    stagesBox?.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { this.setStage(b.dataset.stage); this.paintActions(); }));
    $('#shareImg', box).addEventListener('click', () => ExportPanel.open(this.board, this.awards));
    $('#recapBtn', box).addEventListener('click', () => {
      const mode = commentatorMode() === 'off' ? 'festa' : commentatorMode();
      if (isMuted()) toast('La TV è in modalità silenziosa: leggo solo i sottotitoli.', 'warn');
      speak(nightRecap(recapData(this.board, this.awards), mode), { captions: true });
    });
    $('#openAlbum', box)?.addEventListener('click', () => AlbumPanel.open());
    $('#toAllTime', box)?.addEventListener('click', () => openAllTime());
    $('#newNight2', box).addEventListener('click', newNight);
  },

  next(silent = false) {
    const s = this.steps[this.step];
    if (!s) return;
    if (s.type === 'pod') {
      if (this.stage !== 'podium') this.setStage('podium');
      $(`[data-pod="${s.index}"]`, this.el)?.classList.remove('is-hidden');
      if (s.index === 0 && !silent) {
        confetti(140);
        if (!this.champs.length) { fireworks(6); [0.9, 1.4, 1.9, 2.5].forEach((d) => fireworkSound(d)); }
        fanfare();
        const mode = commentatorMode();
        if (mode !== 'off' && !isMuted()) setTimeout(() => speak(podiumLine(this.board[0].name, this.board[0].stats.avg, mode)), 900);
      } else if (!silent) pop();
    } else if (s.type === 'pstage') {
      this.setStage('players');
      if (!silent) drumroll(1.2);
    } else if (s.type === 'ppod') {
      if (this.stage !== 'players') this.setStage('players');
      const who = $(`[data-champ="${s.index}"]`, this.el);
      who?.classList.remove('is-hidden');
      if (!silent) {
        who?.classList.add('is-climbing');
        stepUp(0.29, 1); stepUp(0.6, 2); stepUp(0.94, 3);
        if (s.index === 0) {
          fanfare(0.9);
          victory(1.6);
          setTimeout(() => {
            const r = who?.getBoundingClientRect();
            if (r) confettiBurst(160, { x: r.left + r.width / 2, y: r.top + r.height * 0.3 });
            fireworks(8, 3.2);
          }, 950);
          [1.8, 2.3, 2.9, 3.4, 4].forEach((d) => fireworkSound(d));
          const mode = commentatorMode();
          if (mode !== 'off' && !isMuted()) setTimeout(() => speak(`Campione della serata: ${playerOrGhost(this.champs[0].uid).name}, con ${this.champs[0].points} punti!`), 2600);
        } else pop(0.95);
      }
    } else if (s.type === 'sstage') {
      this.setStage('season');
      if (!silent) ding();
    } else if (s.type === 'stage') {
      this.setStage('prizes');
    } else {
      $(`[data-award="${s.index}"]`, this.el)?.classList.add('is-shown');
      if (!silent) pop();
    }
    this.step++;
    if (silent) return;
    this.paintActions();
    update(roomRef(S.code, 'state'), this.step >= this.steps.length ? { step: this.step, done: true } : { step: this.step }).catch(() => {});
  },

  onKey(e) {
    // Su un pulsante con il focus ci pensa già il click nativo.
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
      if (this.step < this.steps.length) {
        e.preventDefault();
        this.next();
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Cosa giochiamo adesso? (sondaggio dai telefoni)
// ---------------------------------------------------------------------------

/** Dopo il sondaggio: il gioco scelto è pronto nel modulo "Prossimo gioco". */
async function pollGo() {
  const poll = S.poll;
  if (!poll || poll.open) return;
  const it = S.library?.[poll.winner] || {};
  S.draft = { ...EMPTY_DRAFT(), name: it.name || '', image: it.image || it.thumb || null, libraryId: poll.winner || null, quick: Boolean(it.quick) };
  saveDraft();
  if (poll.winner) upgradeDraftImage(poll.winner);
  await setPhase('idle');
  remove(roomRef(S.code, 'poll')).catch(() => {});
}

async function startPoll() {
  const played = playedTonight();
  const n = activePlayers(S.players).length;
  const w = wishes();
  const fresh = poolItems().filter((it) => !played.has(nameKey(it.name))).sort((a, b) => (w[b.id] || 0) - (w[a.id] || 0));
  const options = fresh.filter((it) => libOk(it, n)).slice(0, 12).map((it) => it.id);
  if (options.length < 2) {
    toast(fresh.length >= 2
      ? `Servono almeno 2 giochi adatti a ${n} giocatori e non ancora giocati stasera.`
      : 'Servono almeno 2 giochi nell’armadio non ancora giocati stasera.', 'warn');
    return;
  }
  try {
    // Voti a testa: scelti dalla TV (1, 2 o 3; mai più dei giochi proposti meno uno).
    const max = Math.min(pollMaxPref(), options.length - 1);
    await set(roomRef(S.code, 'poll'), { options, open: true, max: Math.max(1, max), at: serverTimestamp() });
    await setPhase('poll');
  } catch (err) {
    toast(explainError(err), 'error');
  }
}

/** Conteggio della votazione dei giochi: con più voti a testa, ogni gioco scelto riceve un voto (mai due dalla stessa persona). */
function pollTally(poll) {
  const active = expectedVoters(poll?.votes || {});
  const ids = new Set(active.map((p) => p.uid));
  const opts = new Set(asList(poll?.options));
  const tally = {};
  let voted = 0;
  let cast = 0;
  for (const [uid, v] of Object.entries(poll?.votes || {})) {
    if (!ids.has(uid)) continue;
    const mine = pollChoices(v, poll?.max).filter((id) => S.library?.[id] && opts.has(id));
    if (mine.length) voted++;
    cast += mine.length;
    for (const id of mine) tally[id] = (tally[id] || 0) + 1;
  }
  return { tally, voted, total: active.length, cast };
}
const pollMaxPref = () => { try { return Math.min(POLL_MAX_VOTES, Math.max(1, Number(localStorage.getItem('gnr_poll_max')) || 1)); } catch { return 1; } };

SCREENS.poll = {
  mount(el) {
    this.sig = '';
    this.timer = null;
    this.shown = false;
    const n = asList(S.poll?.options).length;
    const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
    el.innerHTML = `
      <section class="poll" id="pollBox">
        <div class="poll-head">
          <div>
            <h1>Cosa giochiamo adesso?</h1>
            <p class="lead-line" id="pollLead">Scegliete dal telefono: vince il gioco più votato.</p>
            <div class="poll-max" id="pollMax"></div>
            <p class="muted poll-excluded" id="pollExcluded"></p>
          </div>
          <span class="chip chip-lg" id="pollCount" aria-live="polite"></span>
        </div>
        <div class="poll-grid ${n > 8 ? 'poll-grid--dense' : ''}" id="pollGrid" style="--cols:${cols}"></div>
        <div class="poll-actions">
          <button type="button" class="btn-sec" id="pollCancel">Annulla</button>
          <button type="button" class="btn btn-big" id="pollClose">Chiudi la scelta</button>
        </div>
      </section>
      <section class="poll-win" id="pollWin" hidden></section>`;
    $('#pollCancel', el).addEventListener('click', async () => {
      clearTimeout(this.timer);
      await setPhase('idle');
      remove(roomRef(S.code, 'poll')).catch(() => {});
    });
    $('#pollClose', el).addEventListener('click', () => this.close());
    $('#pollMax', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pmax]');
      if (!b || b.disabled) return;
      const v = Number(b.dataset.pmax);
      try { localStorage.setItem('gnr_poll_max', String(v)); } catch { /* niente */ }
      await update(roomRef(S.code, 'poll'), { max: v }).catch((err) => toast(explainError(err), 'error'));
    });
  },

  update() {
    const poll = S.poll;
    if (!poll) return;
    if (!poll.open) { this.showWinner(); return; }
    const opts = asList(poll.options).filter((id) => S.library?.[id]);
    const { tally, voted, total, cast } = pollTally(poll);
    const max = Math.max(0, ...Object.values(tally));
    const pm = Math.max(1, Number(poll.max) || 1);
    const limit = Math.min(POLL_MAX_VOTES, opts.length - 1);
    const pmSig = JSON.stringify([pm, cast > 0, limit]);
    if ($('#pollMax').dataset.sig !== pmSig) {
      $('#pollMax').dataset.sig = pmSig;
      $('#pollMax').innerHTML = limit >= 2 ? `<span class="field-label">Voti a testa</span><span class="seg" role="group" aria-label="Voti a testa">${Array.from({ length: limit }, (_, i) => i + 1).map((v) => `<button type="button" data-pmax="${v}" aria-pressed="${pm === v}" ${cast > 0 && pm !== v ? 'disabled' : ''}>${v}</button>`).join('')}</span>${cast > 0 ? '<small class="muted">(si cambia solo prima dei voti)</small>' : ''}` : '';
      $('#pollLead').textContent = pm > 1 ? `Ognuno sceglie fino a ${pm} giochi dal telefono: vince il gioco con più voti.` : 'Scegliete dal telefono: vince il gioco più votato.';
    }
    const sig = JSON.stringify([opts, tally, opts.map((id) => (S.library[id].image || '').length)]);
    if (sig !== this.sig) {
      this.sig = sig;
      $('#pollGrid').innerHTML = opts.map((id) => {
        const it = S.library[id];
        const c = tally[id] || 0;
        return `
          <div class="poll-card ${c && c === max ? 'is-lead' : ''}">
            ${gameImageHTML(it, 'game-img--poll')}
            <div class="poll-info"><span class="poll-text"><b class="poll-name">${esc(it.name)}</b>${libInfo(it) ? `<span class="poll-meta">${esc(libInfo(it))}</span>` : ''}${freshnessLabel(it, lastPlayed(S.nights)) ? `<span class="poll-fresh">${esc(freshnessLabel(it, lastPlayed(S.nights)))}</span>` : ''}</span><span class="poll-votes" aria-label="${c} voti">${c}</span></div>
            <span class="poll-bar" aria-hidden="true"><i style="width:${max ? Math.round((c / max) * 100) : 0}%"></i></span>
          </div>`;
      }).join('');
    }
    const n = activePlayers(S.players).length;
    const played = playedTonight();
    const out = libraryItems().filter((it) => !played.has(nameKey(it.name)) && isAvailable(it) && !libFits(it, n)).map((it) => it.name);
    $('#pollExcluded').textContent = out.length ? `Non proposti perché non adatti a ${n} giocatori: ${namesList(out)}.` : '';
    const all = total > 0 && voted === total;
    $('#pollCount').textContent = all ? 'Hanno scelto tutti!' : `${voted} / ${total} hanno scelto`;
    $('#pollClose').disabled = voted === 0;
    if (all && !S.state?.paused) {
      if (!this.timer) this.timer = setTimeout(() => this.close(), 2000);
    } else if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  },

  async close() {
    clearTimeout(this.timer);
    this.timer = null;
    const poll = S.poll;
    if (!poll?.open) return;
    const { tally } = pollTally(poll);
    const max = Math.max(0, ...Object.values(tally));
    if (!max) return;
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    const winner = top[Math.floor(Math.random() * top.length)];
    await update(roomRef(S.code, 'poll'), { open: false, winner, tie: top.length > 1 })
      .catch((err) => toast(explainError(err), 'error'));
  },

  showWinner() {
    if (this.shown) return;
    this.shown = true;
    clearTimeout(this.timer);
    const poll = S.poll;
    const it = S.library?.[poll.winner] || { name: 'il gioco scelto' };
    $('#pollBox').hidden = true;
    const box = $('#pollWin');
    box.hidden = false;
    box.innerHTML = `
      <div class="poll-win-art">${gameImageHTML(it, 'game-img--win tilt-left')}</div>
      <div class="poll-win-text">
        <span class="chip chip--tomato">${poll.tie ? 'Pareggio: ha deciso la sorte' : 'Avete scelto'}</span>
        <h1 class="win-title">Si gioca a ${esc(it.name)}!</h1>
        <p class="lead-line">Buona partita. Alla fine aprite la votazione.</p>
        <button type="button" class="btn btn-big" id="pollGo">${ICONS.play}<span>Pronti, si gioca</span></button>
      </div>`;
    confetti(110);
    fanfare();
    $('#pollGo').addEventListener('click', () => pollGo());
    $('#pollGo').focus();
  },

  unmount() {
    clearTimeout(this.timer);
  }
};

// ---------------------------------------------------------------------------
// Classifica di sempre (tutte le serate del gruppo)
// ---------------------------------------------------------------------------

function openAllTime() {
  saveNight();
  setPhase('alltime', null, { from: S.state?.phase || 'idle' });
}

function backFromAllTime() {
  const from = S.state?.from;
  if (from === 'awards') setPhase('awards', null, { done: true });
  else setPhase(from === 'board' ? 'board' : 'idle');
}

function playerByName(name) {
  const k = nameKey(name);
  return sortedPlayers(S.players).find((p) => nameKey(p.name) === k) || { name };
}

SCREENS.alltime = {
  TABS: [['rank', 'Classifica'], ['season', 'Stagione'], ['rivals', 'Rivalità'], ['cards', 'Figurine'], ['stats', 'Statistiche'], ['pairs', 'Coppie'], ['hof', 'Hall of Fame'], ['memories', 'Ricordi'], ['wrapped', 'Wrapped'], ['calendar', 'Calendario']],

  mount(el) {
    this.sig = '';
    this.view = 'rank';
    this.night = null;
    this.pair = null;
    this.year = null;
    this.slide = 0;
    el.innerHTML = '<section class="alltime" id="atBox"></section>';
    const box = $('#atBox', el);
    box.addEventListener('click', (e) => {
      const go = (patch) => { Object.assign(this, patch); this.sig = ''; this.update(); };
      if (e.target.closest('#atBack')) { backFromAllTime(); return; }
      const v = e.target.closest('[data-view]');
      if (v) { go({ view: v.dataset.view, slide: 0 }); return; }
      const n = e.target.closest('[data-night]');
      if (n) { go({ view: 'night', night: n.dataset.night }); return; }
      const p = e.target.closest('[data-pair]');
      if (p) { go({ pair: p.dataset.pair }); return; }
      const y = e.target.closest('[data-year]');
      if (y) { go({ year: Number(y.dataset.year), slide: 0 }); return; }
      const s = e.target.closest('[data-slide]');
      if (s) { go({ slide: this.slide + Number(s.dataset.slide) }); return; }
      const al = e.target.closest('[data-album]');
      if (al) { AlbumPanel.open(al.dataset.album, al.dataset.title || 'Album'); return; }
      if (e.target.closest('#nxIcs')) { downloadICS(S.next, S.meta.groupName || 'Game Night', libraryUrl()); return; }
      if (e.target.closest('#nxClear')) { if (confirm('Cancellare la prossima serata?')) remove(groupRef(S.meta.groupId, 'next')).catch((err) => toast(explainError(err), 'error')); }
    });
    box.addEventListener('submit', async (e) => {
      if (e.target.id !== 'nxForm') return;
      e.preventDefault();
      try { await saveNextNight($('#nxAt').value, $('#nxPlace').value); toast('Prossima serata fissata'); } catch (err) { toast(explainError(err), 'error'); }
    });
  },

  onKey(e) {
    if (this.view !== 'wrapped') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.slide++; this.sig = ''; this.update(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.slide = Math.max(0, this.slide - 1); this.sig = ''; this.update(); }
  },

  head(title, sub = '') {
    const active = this.view === 'night' ? 'memories' : this.view;
    return `
      <div class="alltime-head">
        <div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
        <button type="button" class="btn btn-big" id="atBack">Torna alla serata</button>
      </div>
      <nav class="at-tabs" aria-label="Sezioni">${this.TABS.map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${k === active}">${l}</button>`).join('')}</nav>`;
  },

  update() {
    const sig = JSON.stringify([this.view, this.night, this.pair, this.year, this.slide, Object.keys(S.nights || {}).length, JSON.stringify(S.nights || {}).length, Object.keys(S.library || {}).length, S.next, Object.keys(S.games || {}).length, S.identity]);
    if (sig === this.sig) return;
    this.sig = sig;
    const paint = { rank: this.paintRank, season: this.paintSeason, rivals: this.paintRivals, cards: this.paintCards, stats: this.paintStats, pairs: this.paintPairs, hof: this.paintHof, memories: this.paintMemories, night: this.paintNight, wrapped: this.paintWrapped, calendar: this.paintCalendar }[this.view] || this.paintRank;
    paint.call(this);
  },

  paintSeason() { $('#atBox').innerHTML = `${this.head('Stagione', `${this.groupLabel()}: una classifica ogni tre mesi, con il trofeo al campione`)}${seasonTabHTML()}`; },
  paintRivals() { $('#atBox').innerHTML = `${this.head('Rivalità', 'Testa a testa: chi vince quando due giocano la stessa partita')}${rivalsTabHTML()}`; },
  paintCards() { $('#atBox').innerHTML = `${this.head('Figurine', this.groupLabel())}${cardsTabHTML()}`; bindCards($('#atBox')); },

  groupLabel() {
    return `${S.identity?.emblem && !S.identity?.logo ? `${esc(S.identity.emblem)} ` : ''}${esc(S.meta.groupName || 'Il vostro gruppo')}`;
  },

  paintRank() {
    const at = buildAllTime(S.nights, S.library);
    const games = at.games.slice(0, 7);
    const rows = games.map((g, i) => `
      <li class="brow brow--at brow--r${Math.min(g.rank, 4)}" style="--i:${i}">
        <span class="brank">${g.rank}</span>
        ${gameImageHTML(g, 'game-img--thumb')}
        <span class="bname"><b>${esc(g.name)}</b><span class="bsub">${g.n} ${g.n === 1 ? 'voto' : 'voti'} in ${g.nights} ${g.nights === 1 ? 'serata' : 'serate'}</span></span>
        <span class="bavg">${fmt(g.avg)}</span>
      </li>`).join('');
    const row = (i, name, val) => `<li class="at-row"><span class="at-pos">${i + 1}</span>${avatarHTML(playerByName(name), '2.6rem')}<span class="at-name">${esc(name)}</span><span class="at-val">${val}</span></li>`;
    const wins = at.wins.slice(0, 3).map((w, i) => row(i, w.name, `${w.wins} ${w.wins === 1 ? 'vittoria' : 'vittorie'}`)).join('');
    const mvp = at.mvp.slice(0, 3).map((m, i) => row(i, m.name, `${m.votes} ${m.votes === 1 ? 'voto' : 'voti'}`)).join('');
    const most = at.mostPlayed.slice(0, 3).map((g) => `<li class="at-row"><span class="at-name">${esc(g.name)}</span><span class="at-val">${g.nights} serate</span></li>`).join('');
    $('#atBox').innerHTML = `
      ${this.head('Classifica di sempre', `${this.groupLabel()}: ${at.nights} ${at.nights === 1 ? 'serata' : 'serate'}, ${at.games.length} ${at.games.length === 1 ? 'gioco votato' : 'giochi votati'}`)}
      ${at.games.length ? `
        <div class="alltime-body">
          <div class="alltime-main"><ol class="board-list">${rows}</ol>${at.games.length > games.length ? `<p class="muted">E altri ${at.games.length - games.length}…</p>` : ''}</div>
          <aside class="card alltime-side">
            <h2>MVP di sempre</h2>${mvp ? `<ol class="at-list">${mvp}</ol>` : '<p class="muted">Ancora nessun MVP.</p>'}
            ${wins ? `<h2>Chi vince di più</h2><ol class="at-list">${wins}</ol>` : ''}
            ${most ? `<h2>I più giocati</h2><ol class="at-list">${most}</ol>` : ''}
          </aside>
        </div>` : '<div class="empty-board"><p class="empty-title">Ancora nessuna serata salvata</p><p class="muted">La classifica di sempre si riempie da sola a ogni gioco votato.</p></div>'}`;
  },

  /** Andamento della serata e statistiche del gruppo su tutte le serate. */
  paintStats() {
    const board = buildBoard(S.games, S.votes).sort((a, b) => (a.order || 0) - (b.order || 0));
    const W = 560, H = 210, P = 34;
    const pts = board.map((r, i) => ({ x: board.length > 1 ? P + (i * (W - 2 * P)) / (board.length - 1) : W / 2, y: H - P - ((r.stats.avg - 1) / 9) * (H - 2 * P), r }));
    const chart = board.length ? `
      <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Media dei giochi nell'ordine in cui sono stati giocati">
        ${[2, 4, 6, 8, 10].map((v) => { const y = H - P - ((v - 1) / 9) * (H - 2 * P); return `<line x1="${P}" x2="${W - P}" y1="${y}" y2="${y}" class="trend-grid"/><text x="${P - 8}" y="${y + 4}" class="trend-axis" text-anchor="end">${v}</text>`; }).join('')}
        <polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" class="trend-line"/>
        ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="7" class="trend-dot"/><text x="${p.x}" y="${p.y - 14}" text-anchor="middle" class="trend-val">${fmt(p.r.stats.avg)}</text><text x="${p.x}" y="${H - 8}" text-anchor="middle" class="trend-axis">${esc(p.r.name.length > 12 ? p.r.name.slice(0, 11) + '…' : p.r.name)}</text>`).join('')}
      </svg>` : '<p class="muted">Ancora nessun gioco votato stasera.</p>';
    const ins = groupInsights(S.nights, S.library);
    const played = lastPlayed(S.nights);
    const dusty = libraryItems().map((it) => ({ name: it.name, label: freshnessLabel(it, played), n: played[dbKey(it.name)] ?? 999 })).filter((x) => x.label).sort((a, b) => b.n - a.n).slice(0, 3);
    const card = (title, list, val, empty) => `<section class="card stat-card stat-card--sm"><h2>${title}</h2>${list.length ? `<ol class="at-list">${list.map((g) => `<li class="at-row"><span class="at-name">${esc(g.name)}</span><span class="at-val">${val(g)}</span></li>`).join('')}</ol>` : `<p class="muted">${empty}</p>`}</section>`;
    const few = 'Servono più serate.';
    $('#atBox').innerHTML = `
      ${this.head('Statistiche', this.groupLabel())}
      <div class="stats-body stats-body--grid">
        <section class="card stat-card stat-card--chart"><h2>Andamento della serata</h2>${chart}</section>
        ${card('❤️ I più amati', ins.loved, (g) => fmt(g.avg), few)}
        ${card('🤝 Piacciono a tutti', ins.everyone, (g) => `nessun voto sotto il ${g.minVote}`, 'Nessun gioco con tutti voti da 7 in su.')}
        ${card('⚡ Dividono il gruppo', ins.divisive, (g) => `consenso ${g.consensus}%`, 'Su tutto siete abbastanza d’accordo.')}
        ${card('🎈 Sopravvalutati', ins.overrated, () => 'bei voti, poca voglia di rigiocarlo', few)}
        ${card('💎 Sottovalutati', ins.underrated, () => 'voti tiepidi, ma lo rigiochereste', few)}
        ${card('⏳ Durano più del previsto', ins.longer, (g) => `${Math.round(g.realMin)} min invece di ${g.declared}`, 'Le durate dichiarate sono rispettate.')}
        ${card('🚀 Divertimento al minuto', ins.perMinute, (g) => `${fmt(g.avg)} in ${Math.round(g.realMin)} min`, 'Usate "Inizia la partita" per misurare le durate.')}
        ${card('🙈 Mai più', ins.never, (g) => fmt(g.avg), 'Nessun gioco bocciato.')}
        ${card('🔁 Quando lo rigiochiamo?', ins.replay, (g) => `fermo da ${g.ago} serate`, 'I giochi amati li fate spesso.')}
        ${card('🕰️ Da rispolverare', dusty, (g) => esc(g.label), 'Avete giocato tutto di recente!')}
      </div>`;
  },

  /** Mappa delle coppie: compatibilità, rivalità, duo imbattibili. */
  paintPairs() {
    const pm = pairsMap(S.nights);
    const people = pm.people.slice(0, 9);
    const find = (a, b) => pm.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    const hl = (icon, title, p, text) => `<button type="button" class="card pair-hl" ${p ? `data-pair="${esc(p.a)}|${esc(p.b)}"` : 'disabled'}><span class="pair-ico">${icon}</span><b>${title}</b>${p ? `<span>${esc(p.aName)} + ${esc(p.bName)}</span><small>${text(p)}</small>` : '<small>Servono più partite insieme.</small>'}</button>`;
    const heat = (c) => (c === null ? 'transparent' : `hsl(${Math.round((c / 100) * 130)}, 70%, 62%)`);
    const matrix = people.length >= 2 ? `
      <table class="pair-matrix"><thead><tr><th></th>${people.map((p) => `<th>${avatarHTML(playerByName(p.name), '2rem')}<span>${esc(p.name)}</span></th>`).join('')}</tr></thead>
      <tbody>${people.map((r) => `<tr><th>${esc(r.name)}</th>${people.map((c) => {
        if (r.key === c.key) return '<td class="is-self"></td>';
        const p = find(r.key, c.key);
        return `<td><button type="button" class="${p?.compat === null || p?.compat === undefined ? 'is-na' : ''}" data-pair="${esc(r.key)}|${esc(c.key)}" style="--h:${heat(p?.compat ?? null)}" aria-label="${esc(r.name)} e ${esc(c.name)}">${p?.compat ?? '—'}${p?.compat !== null && p?.compat !== undefined ? '%' : ''}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">Servono almeno due persone con dei voti.</p>';
    let detail = '<p class="muted">Tocca una casella per il dettaglio della coppia.</p>';
    if (this.pair) {
      const [a, b] = this.pair.split('|');
      const p = find(a, b);
      if (p) {
        const x = p.a === a ? { n1: p.aName, n2: p.bName, w1: p.aWins, w2: p.bWins } : { n1: p.bName, n2: p.aName, w1: p.bWins, w2: p.aWins };
        const gname = (k) => S.library && libraryItems().find((it) => dbKey(it.name) === k)?.name || k;
        detail = `
          <h2>${esc(x.n1)} + ${esc(x.n2)}</h2>
          <p class="pair-compat">${p.compat !== null && p.compat !== undefined ? `Compatibilità ludica <b>${p.compat}%</b>` : 'Compatibilità: servono più voti in comune'}</p>
          <ul class="pair-facts">
            <li><b>${p.together}</b> partite giocate insieme</li>
            <li>Scontri diretti: <b>${esc(x.n1)} ${x.w1}</b> – <b>${x.w2} ${esc(x.n2)}</b></li>
            <li><b>${p.both}</b> vittorie insieme (a squadre o a pari merito)</li>
            ${p.lovedBoth?.length ? `<li>Amati da entrambi: ${esc(p.lovedBoth.slice(0, 4).map(gname).join(', '))}</li>` : ''}
            ${p.opposite?.length ? `<li>Opinioni opposte: ${esc(p.opposite.slice(0, 4).map(gname).join(', '))}</li>` : ''}
          </ul>`;
      }
    }
    $('#atBox').innerHTML = `
      ${this.head('Coppie', this.groupLabel())}
      <div class="pairs-hl">
        ${hl('🔥', 'Duo imbattibile', pm.duo, (p) => `${p.both} vittorie insieme`)}
        ${hl('⚔️', 'Rivalità storica', pm.rivalry, (p) => `${p.aWins} a ${p.bWins} negli scontri diretti`)}
        ${hl('❤️', 'Anime ludiche', pm.souls, (p) => `compatibilità ${p.compat}%`)}
        ${hl('💀', 'Nemici giurati', pm.enemies, (p) => `compatibilità ${p.compat}%`)}
      </div>
      <div class="pairs-body"><div class="card stat-card pair-matrix-wrap">${matrix}</div><div class="card stat-card">${detail}</div></div>`;
  },

  /** Hall of Fame: livello del gruppo, record, livelli e traguardi dei giocatori. */
  paintHof() {
    const gl = groupLevel(S.nights);
    const rec = records(S.nights);
    const people = {};
    for (const n of Object.values(S.nights || {})) for (const [k, pp] of Object.entries(n?.people || {})) people[k] = pp.name || people[k];
    const rows = Object.entries(people).map(([k, name]) => ({ k, name, pr: progressFor(S.nights, k, S.library) })).sort((a, b) => b.pr.xp - a.pr.xp).slice(0, 8);
    $('#atBox').innerHTML = `
      ${this.head('Hall of Fame', `${this.groupLabel()}: livello ${gl.level} · ${gl.nights} ${gl.nights === 1 ? 'serata' : 'serate'} · ${gl.games} partite`)}
      <div class="stats-body stats-body--hof">
        <section class="card stat-card stat-card--wide"><h2>Livelli</h2>${rows.length ? `<ol class="hof-list">${rows.map((r, i) => `
          <li class="hof-row">
            <span class="at-pos">${i + 1}</span>
            ${avatarHTML(playerByName(r.name), '2.8rem')}
            <span class="hof-who"><b>${esc(r.name)}</b><small>Livello ${r.pr.level} · ${esc(r.pr.levelName)} · ${r.pr.xp} XP</small>
              <span class="xp-bar" aria-hidden="true"><i style="width:${Math.round(r.pr.levelProgress * 100)}%"></i></span></span>
            <span class="hof-ach" title="Traguardi sbloccati">${r.pr.achievements.filter((a) => a.got).map((a) => a.icon).join(' ')}</span>
          </li>`).join('')}</ol>` : '<p class="muted">Ancora nessuna serata salvata.</p>'}</section>
        <section class="card stat-card"><h2>Record</h2>${rec.length ? `<ol class="at-list">${rec.map((r) => `<li class="at-row at-row--stack"><span class="muted">${esc(r.title)}</span><b>${esc(r.value)}</b></li>`).join('')}</ol>` : '<p class="muted">I record arrivano con le prime serate.</p>'}</section>
      </div>`;
  },

  /** Ricordi: tutte le serate del gruppo, dalla più recente. */
  paintMemories() {
    const list = nightsList(S.nights).reverse();
    const otd = onThisDay(S.nights);
    const date = (at) => new Date(Number(at)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const banner = otd ? `<div class="otd">${otd.anniversary ? `🎂 <b>${otd.anniversary.years} ${otd.anniversary.years === 1 ? 'anno' : 'anni'}</b> dalla prima serata del gruppo (${esc(date(otd.anniversary.at))})!` : ''}${otd.yearAgo ? ` 📸 Un anno fa, ${esc(date(otd.yearAgo.at))}, giocavate a <b>${esc(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3).join(', '))}</b>.` : ''}</div>` : '';
    $('#atBox').innerHTML = `
      ${this.head('Ricordi', `${this.groupLabel()}: ${list.length} ${list.length === 1 ? 'serata' : 'serate'}`)}
      ${banner}
      ${list.length ? `<div class="mem-grid">${list.slice(0, 12).map((n) => `
        <button type="button" class="card mem-card" data-night="${esc(n.room)}">
          <span class="mem-num">Game Night #${n.number}${n.room === S.code ? ' · stasera' : ''}</span>
          <b class="mem-date">${esc(date(n.at))}</b>
          <span class="mem-facts">${nightFacts(n)}</span>
          ${n.topGame ? `<span>⭐ ${esc(n.topGame.name)} ${fmt(n.topGame.avg)}</span>` : ''}
          ${n.winners.length ? `<span>🏆 ${esc(namesList(n.winners))}</span>` : ''}
          ${n.mvpNames.length ? `<span>👑 MVP ${esc(namesList(n.mvpNames))}</span>` : ''}
        </button>`).join('')}</div>` : '<div class="empty-board"><p class="empty-title">Ancora nessuna serata</p><p class="muted">Ogni serata finisce qui, con giochi, premi, commenti e foto.</p></div>'}`;
  },

  /** Pagina di una serata. */
  paintNight() {
    const list = nightsList(S.nights);
    const n = list.find((x) => x.room === this.night);
    if (!n) { this.view = 'memories'; this.paintMemories(); return; }
    const names = Object.fromEntries(Object.entries(n.people || {}).map(([k, pp]) => [k, pp.name]));
    const titles = {};
    for (const [k, ts] of Object.entries(n.titles || {})) for (const tt of (Array.isArray(ts) ? ts : Object.values(ts))) (titles[tt] ||= []).push(names[k] || k);
    const imgByKey = Object.fromEntries(libraryItems().map((it) => [dbKey(it.name), it]));
    const games = [...n.gamesSorted].sort((a, b) => (b.n ? b.sum / b.n : 0) - (a.n ? a.sum / a.n : 0)).map((g, i) => `
      <li class="brow brow--at brow--r${Math.min(i + 1, 4)}">
        <span class="brank">${i + 1}</span>
        ${gameImageHTML(imgByKey[g.key] || g, 'game-img--thumb')}
        <span class="bname"><b>${esc(g.name)}</b><span class="bsub">${g.n} voti${g.playedMin ? ` · ${g.playedMin} min` : ''}${(g.w || []).length ? ` · 🏆 ${esc(namesList((Array.isArray(g.w) ? g.w : Object.values(g.w)).map((k) => names[k] || k)))}` : ''}</span></span>
        <span class="bavg">${g.n ? fmt(g.sum / g.n) : '—'}</span>
      </li>`).join('');
    const photos = n.room === S.code ? photoList(S.photos).length : null;
    $('#atBox').innerHTML = `
      ${this.head(`Game Night #${n.number}`, `${esc(new Date(Number(n.at)).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${nightFacts(n)}`)}
      <div class="alltime-body">
        <div class="alltime-main"><ol class="board-list">${games}</ol></div>
        <aside class="card alltime-side night-side">
          ${n.topGame ? `<p>⭐ Partita più divertente: <b>${esc(n.topGame.name)}</b> (${fmt(n.topGame.avg)})</p>` : ''}
          ${n.mvpNames.length ? `<p>👑 MVP: <b>${esc(namesList(n.mvpNames))}</b></p>` : ''}
          ${n.winners.length ? `<p>🏆 Vincitore della serata: <b>${esc(namesList(n.winners))}</b></p>` : ''}
          ${Object.keys(titles).length ? `<h2>Premi</h2><ul class="at-list">${Object.entries(titles).map(([tt, ns]) => `<li class="at-row at-row--stack"><span class="muted">${esc(tt)}</span><b>${esc(namesList(ns))}</b></li>`).join('')}</ul>` : ''}
          ${(n.quotes || []).length ? `<h2>💬 Commenti</h2><ul class="quote-list">${(Array.isArray(n.quotes) ? n.quotes : Object.values(n.quotes)).slice(0, 6).map((q) => `<li>«${esc(q.text)}» <small>${esc(q.name)}, ${esc(q.game)}</small></li>`).join('')}</ul>` : ''}
          <button type="button" class="btn-sec" data-album="${esc(n.room)}" data-title="Album · Game Night #${n.number}">📸 Album della serata${photos !== null ? ` (${photos})` : ''}</button>
          <button type="button" class="link-btn" data-view="memories">← Tutti i ricordi</button>
        </aside>
      </div>`;
  },

  /** Recap dell'anno, una scheda alla volta (frecce ← →). */
  paintWrapped() {
    const years = yearsOf(S.nights);
    if (!years.length) { $('#atBox').innerHTML = `${this.head('Wrapped')}<div class="empty-board"><p class="empty-title">Il recap arriva con le prime serate</p></div>`; return; }
    const year = years.includes(this.year) ? this.year : years[0];
    const w = wrapped(S.nights, year);
    const slides = [
      { k: `Il vostro ${year}`, big: `${w.nights} ${w.nights === 1 ? 'serata' : 'serate'}`, small: `${w.matches} partite, ${w.distinctGames} giochi diversi${w.hours ? `, ${String(w.hours).replace('.', ',')} ore di gioco` : ''}, ${w.players} giocatori.` },
      w.mostPlayed && { k: 'Il gioco più intavolato', big: w.mostPlayed.name, small: `${w.mostPlayed.matches} partite quest’anno.` },
      w.loved && { k: 'Il più amato', big: w.loved.name, small: `Media ${fmt(w.loved.avg)}.` },
      w.longestMatch && { k: 'La partita più lunga', big: w.longestMatch.name, small: `${w.longestMatch.minutes} minuti senza fiatare.` },
      w.longestNight && { k: 'La serata più lunga', big: `${Math.floor(w.longestNight.minutes / 60)} h ${w.longestNight.minutes % 60} min`, small: new Date(Number(w.longestNight.at)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) },
      w.deadliest && { k: 'Il più letale', big: w.deadliest.name, small: `${w.deadliest.wins} vittorie.` },
      w.mostPresent && { k: 'Sempre presente', big: w.mostPresent.name, small: `${w.mostPresent.nights} serate su ${w.nights}.` },
      w.mvp && { k: 'MVP dell’anno', big: w.mvp.name, small: `${w.mvp.mvp} voti MVP.` },
      w.oracle && { k: 'L’oracolo dell’anno', big: w.oracle.name, small: `Ha indovinato la media ${w.oracle.oracle} volte.` },
      w.seer && { k: 'Il veggente dell’anno', big: w.seer.name, small: `${w.seer.seer} ${w.seer.seer === 1 ? 'vincitore pronosticato' : 'vincitori pronosticati'}.` },
      w.critic && { k: 'Il più severo', big: w.critic.name, small: `Media dei voti dati ${fmt(w.critic.sum / w.critic.n)}.` },
      w.generous && { k: 'Il più generoso', big: w.generous.name, small: `Media dei voti dati ${fmt(w.generous.sum / w.generous.n)}.` },
      w.bestMonth && { k: 'Il mese più giocato', big: w.bestMonth.name, small: `${w.bestMonth.nights} ${w.bestMonth.nights === 1 ? 'serata' : 'serate'}.` },
      { k: 'Grazie per aver giocato!', big: S.meta.groupName || 'Il vostro gruppo', small: `Alla prossima serata${S.next?.at ? `: ${new Date(Number(S.next.at)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}` : ''}.` }
    ].filter(Boolean);
    const i = Math.max(0, Math.min(this.slide, slides.length - 1));
    this.slide = i;
    const s = slides[i];
    const colors = ['#FF5A4E', '#2EC4B6', '#7B5CFA', '#FFC93C', '#FF8FB1', '#4D96FF', '#8AC926', '#FF924C'];
    $('#atBox').innerHTML = `
      ${this.head(`Wrapped ${year}`, this.groupLabel())}
      ${years.length > 1 ? `<div class="rg-row">${years.map((y) => `<button type="button" class="lib-chip" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}</div>` : ''}
      <div class="wrapped">
        <button type="button" class="wr-nav" data-slide="-1" aria-label="Indietro" ${i === 0 ? 'disabled' : ''}>‹</button>
        <article class="wr-slide" style="--wc:${colors[i % colors.length]}">
          <p class="wr-k">${esc(s.k)}</p>
          <h2 class="wr-big">${esc(s.big)}</h2>
          <p class="wr-small">${esc(s.small)}</p>
          <p class="wr-dots">${slides.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</p>
        </article>
        <button type="button" class="wr-nav" data-slide="1" aria-label="Avanti" ${i === slides.length - 1 ? 'disabled' : ''}>›</button>
      </div>`;
  },

  /** Calendario: prossima serata con presenze, serate per mese, ricorrenze. */
  paintCalendar() {
    const years = yearsOf(S.nights);
    const year = this.year || new Date().getFullYear();
    const months = nightsByMonth(S.nights, year);
    const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const now = new Date();
    const thisMonth = nightsByMonth(S.nights, now.getFullYear())[now.getMonth()].length;
    const otd = onThisDay(S.nights);
    $('#atBox').innerHTML = `
      ${this.head('Calendario', this.groupLabel())}
      <div class="cal-body">
        ${nextNightHTML(true)}
        <section class="card stat-card">
          <div class="cal-head"><h2>Serate del ${year}</h2>${[...new Set([now.getFullYear(), ...years])].sort((a, b) => b - a).map((y) => `<button type="button" class="lib-chip" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}</div>
          <div class="cal-grid">${months.map((m, i) => `<div class="cal-month ${m.length ? 'has' : ''}"><b>${MONTHS[i]}</b><span class="cal-dots">${m.map((n) => `<button type="button" class="cal-dot" data-night="${esc(n.room)}" title="Game Night #${n.number}, ${new Date(Number(n.at)).getDate()} ${MONTHS[i]}">${new Date(Number(n.at)).getDate()}</button>`).join('')}</span></div>`).join('')}</div>
          <p class="muted">Questo mese: <b>${thisMonth}</b> ${thisMonth === 1 ? 'serata' : 'serate'} · in tutto il ${year}: <b>${months.flat().length}</b>.</p>
          ${otd?.anniversary ? `<p>🎂 ${otd.anniversary.years} ${otd.anniversary.years === 1 ? 'anno' : 'anni'} dalla prima serata!</p>` : ''}
          ${otd?.yearAgo ? `<p>📸 Un anno fa giocavate a <b>${esc(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3).join(', '))}</b>.</p>` : ''}
        </section>
      </div>`;
  }
};

