// Pagina iniziale (sito e app Android): profilo personale, ingresso nelle serate, armadi, gruppi e impostazioni.
// Il profilo personale (js/person.js) è lo stesso su tutti i dispositivi collegati.
// Sezioni (viste) con l'indirizzo dopo #: home, armadi, serate, gruppi, altro. Barra laterale sul computer,
// barra in basso sul telefono. Tutti i testi vengono da js/lang/<lingua>.js.
import {
  $, $$, esc, normalizeCode, registerSW, applyTheme, ErrLog, toast, themeSwitchHTML, a11yHTML, PLAYER_COLORS,
  squarePhoto, qrSVG, cleanName, param, randomCode, userError, densityHTML, setDensity
} from './util.js';
import { t, fmtDate, langSwitchHTML, applyStatic } from './i18n.js';
import { isConfigured, connect, get, set, dbRef, roomRef, groupRef, memberRef, armadioRef, onValue, explainError, explainAuthError, accountInfo, isDemo, startDemo, stopDemo } from './fb.js';
import { Person, parseLinkCode, personKeysFor, mergedNights } from './person.js';
import { Account, googleAvailable, checkCredentials } from './account.js';
import { tipsSettingsHTML, bindTipsSettings } from './tips.js';
import { avatarHTML, avatarOptions, avatarUri } from './avatars.js';
import { progressFor, ACHIEVEMENTS } from './stats.js';
import { isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';
import { mountUpdatePanel, autoCheck } from './updates.js';
import { isNightCreator } from './nights.js';
import { Notices, noticesHTML, bindNotices, NOTICE_CATS } from './notices.js';
import { LEADS, reminderLead, setReminderLead } from './reminders.js';
import { lobbyPrefsHTML, bindLobbyPrefs } from './lobby-prefs.js';
import { links, bindLinks, refreshLinks } from './links.js';
import { APP_VERSION } from './version.js';
import { initSpatialNav, isTvDevice } from './spatialnav.js';
// Su un televisore (Android TV) le frecce del telecomando spostano il fuoco.
if (isTvDevice()) initSpatialNav();
import { loanAlerts, alertsSig } from './collection.js';
import { bindDataCenter, openExport, openImport, openPrivacy, openDiagnostics } from './datacenter.js';

ErrLog.install();
applyTheme();
registerSW();

const H = { uid: null, online: false, groupStops: [], groups: {}, view: 'home', appPanel: null, appFull: null };
const CODE6 = /^[A-Z0-9]{6}$/;
const VIEWS = ['home', 'armadi', 'serate', 'gruppi', 'altro'];
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } },
  json(k, fb) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } }
};

// ---------------------------------------------------------------------------
// Sezioni: #home, #armadi, #serate, #gruppi, #altro (il tasto Indietro torna alla home)
// ---------------------------------------------------------------------------

function viewFromHash() {
  const h = location.hash.replace(/^#/, '');
  return VIEWS.includes(h) ? h : 'home';
}
function showView(v, { focus = false } = {}) {
  H.view = v;
  for (const el of $$('.view')) el.hidden = el.dataset.view !== v;
  for (const a of $$('[data-nav]')) {
    const on = a.dataset.nav === v;
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.body.dataset.view = v;
  if (v === 'altro') mountAppFull();
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    const h = $(`.view[data-view="${v}"] h1, .view[data-view="${v}"] h2`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#aggiornamenti') { history.replaceState(null, '', location.pathname); openUpdates(); return; }
  const l = parseLinkCode(location.hash);
  if (l) { history.replaceState(null, '', location.pathname); H.ready?.then(() => askLink(l)); return; }
  showView(viewFromHash(), { focus: true });
});
// Tasto Indietro di Android: da una sezione si torna alla home, dalla home l'app va in secondo piano.
window.addEventListener('gnr:back', (e) => {
  if (H.view !== 'home') { e.preventDefault(); location.hash = '#home'; }
});
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (!o) return;
  if (o.dataset.open === 'settings') openSettings();
  else if (o.dataset.open === 'export') openExport();
  else if (o.dataset.open === 'import') openImport();
  else if (o.dataset.open === 'privacy') openPrivacy();
  else if (o.dataset.open === 'diag') openDiagnostics();
  else if (o.dataset.open === 'updates') openUpdates(true);
});

// ---------------------------------------------------------------------------
// Finestre dal basso (stesso aspetto del telefono durante la serata)
// ---------------------------------------------------------------------------

const Sheet = {
  el: null,
  open(html, { onClose, wide = false, cls = '' } = {}) {
    this.close();
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet hub-overlay';
    // 2.4: le finestre larghe (wide) sono davvero più larghe (sheet--wide), non solo più alte
    el.innerHTML = `<div class="card sheet ${wide ? 'sheet--tall sheet--wide' : ''} ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) this.close(); });
    this.el = el;
    this.onClose = onClose || null;
    this.last = document.activeElement;
    const title = el.querySelector('h2');
    if (title) { title.id ||= 'sheetTitle'; el.firstElementChild.setAttribute('aria-labelledby', title.id); }
    requestAnimationFrame(() => el.querySelector('input:not([type=file]), button:not([data-close])')?.focus({ preventScroll: true }));
    return el;
  },
  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    const cb = this.onClose; this.onClose = null;
    cb?.();
    this.last?.focus?.({ preventScroll: true });
  }
};
document.addEventListener('keydown', (e) => {
  if (!Sheet.el) return;
  if (e.key === 'Escape') { e.preventDefault(); Sheet.close(); return; }
  // Il fuoco resta dentro la finestra
  if (e.key === 'Tab') {
    const f = [...Sheet.el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=file]), select, textarea, summary, label[for]')].filter((x) => x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
const head = (title) => `<div class="panel-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">✕</button></div>`;

// ---------------------------------------------------------------------------
// Entra in una serata: prima il QR (nell'app e sui telefoni), poi il codice
// ---------------------------------------------------------------------------

const input = $('#homeCode');
input.addEventListener('input', () => { input.value = normalizeCode(input.value); $('#homeErr').textContent = ''; });
$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizeCode(input.value);
  if (code.length !== 4) { $('#homeErr').textContent = t('home.join.errLen'); input.focus(); return; }
  location.href = `play.html?room=${code}`;
});
const touch = window.matchMedia('(pointer: coarse)').matches;
if (canScanQR() && (isApp() || touch)) {
  $('#scanBtn').hidden = false;
  $('#codeLabel').textContent = t('home.join.codeOr');
  $('#scanBtn').addEventListener('click', scanAndGo);
}
async function scanAndGo() {
  const text = await scanQR();
  if (!text) return;
  const link = parseLinkCode(text);
  if (link) { askLink(link); return; }
  const to = routeFromQR(text);
  if (to) location.href = to;
  else toast(t('home.join.notOurQR'), 'warn');
}

/** "Rientra nella serata" e "La tua regia": solo se la stanza esiste ancora (mai dentro una serata finita senza volerlo). */
async function paintBack() {
  const last = normalizeCode(ls.get('gnr_room'));
  const hostRoom = normalizeCode(ls.get('gnr_host_room'));
  const box = $('#backBox');
  if (hostRoom.length === 4 && H.uid) {
    const meta = (await get(roomRef(hostRoom, 'meta')).catch(() => null))?.val();
    // 2.0: la TV ha una sessione sua; questo dispositivo è la regia se ne conosce il codice regia.
    if (meta && (meta.hostUid === H.uid || ls.get(`gnr_regia_${hostRoom}`))) {
      $('#tileHost').classList.add('tile--live');
      $('#createTitle').textContent = t('home.host.liveTitle');
      $('#createTxt').innerHTML = `<span class="live-dot" aria-hidden="true"></span> ${esc(t('home.host.liveText', { code: hostRoom, group: meta.groupName || t('home.host.noGroup') }))}`;
      $('#createGo').textContent = t('home.host.back');
    }
  }
  if (last.length !== 4) return;
  input.value = last;
  if (!H.uid) return;
  try {
    const [meta, state, me] = await Promise.all([
      get(roomRef(last, 'meta')).then((s) => s.val()),
      get(roomRef(last, 'state')).then((s) => s.val()),
      get(roomRef(last, `players/${H.uid}`)).then((s) => s.val()).catch(() => null)
    ]);
    if (!meta) { input.value = ''; return; }
    const done = state?.phase === 'awards' && state?.done;
    // 2.3: è una notifica (si può nascondere), non una scheda come le altre. Nascosta resta nascosta
    // solo per questa serata e per questo stato: quando la serata finisce torna con i risultati.
    const sig = `${last}:${done ? 'done' : 'live'}`;
    if (ls.get('gnr_back_hidden') === sig) return;
    box.innerHTML = `<div class="notice notice--${done ? 'done' : 'live'}">
      <a class="notice-main back-link hub-back-link" href="play.html?room=${esc(last)}">
        ${me ? avatarHTML(me, '2.6rem') : `<span class="tile-ico tile-ico--${done ? 'sun' : 'live'}" aria-hidden="true">${done ? '🏆' : '↩️'}</span>`}
        <span class="mini-text"><span class="notice-kicker">${esc(t(done ? 'home.back.kickerDone' : 'home.back.kickerLive'))}</span><b>${esc(done ? t('home.back.results', { code: last }) : t('home.back.rejoin', { code: last }))}</b><small>${esc(meta.groupName || t('home.back.noGroup'))}${done ? ` · ${esc(t('home.back.ended'))}` : ''}</small></span>
        <span class="mini-go" aria-hidden="true">›</span></a>
      <button type="button" class="notice-close" id="backHide" aria-label="${esc(t('home.back.hide'))}" title="${esc(t('home.back.hide'))}">✕</button>
    </div>`;
    $('#backHide').addEventListener('click', () => { ls.set('gnr_back_hidden', sig); box.hidden = true; box.innerHTML = ''; });
    box.hidden = false;
  } catch { /* stanza non leggibile: niente scorciatoia */ }
}

// ---------------------------------------------------------------------------
// Profilo personale
// ---------------------------------------------------------------------------

function paintHero(d) {
  const name = d?.info?.name;
  $('#heroTitle').textContent = name ? t('home.hero.hello', { name }) : t('home.hero.welcome');
}

function meStats(d) {
  const groups = Object.keys(d?.groups || {}).length;
  const arms = armadiList().length;
  const nights = historyList().length;
  const stat = (n, label) => `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`;
  return `<div class="stats">${stat(nights, t('home.me.statNights', { n: nights }))}${stat(groups, t('home.me.statGroups', { n: groups }))}${stat(arms, t('home.me.statArmadi', { n: arms }))}</div>`;
}

/** Riquadro del profilo: compatto nella home (full=false), completo in "Profilo e app". */
function meHTML(state, full) {
  if (!isConfigured) return `<p class="muted">${esc(t('home.me.noFirebase'))}</p>`;
  if (state?.revoked || state?.missing) {
    return `<div class="tile-head"><span class="tile-ico tile-ico--violet" aria-hidden="true">👤</span><div><h2>${esc(t('home.me.title'))}</h2><p class="tile-sub">${esc(state.revoked ? t('home.me.revoked') : t('home.me.missing'))}</p></div></div>
      <div class="btn-row"><button type="button" class="ui-btn ui-btn--primary" data-act="create">${esc(t('home.me.create'))}</button><button type="button" class="ui-btn ui-btn--ghost" data-act="link">🔗 ${esc(t('home.me.link'))}</button></div>`;
  }
  const d = state?.info ? state : null;
  if (!d) {
    return `<div class="tile-head"><span class="tile-ico tile-ico--violet" aria-hidden="true">👤</span><div><h2>${esc(t('home.me.title'))}</h2><p class="tile-sub">${esc(t('home.me.intro'))}</p></div></div>
      <div class="btn-row">
        <button type="button" class="ui-btn ui-btn--primary" data-act="create">✨ ${esc(t('home.me.createShort'))}</button>
        <button type="button" class="ui-btn ui-btn--ghost" data-act="link">🔗 ${esc(t('home.me.have'))}</button>
      </div>`;
  }
  const devices = d.devices || 1;
  return `
    <div class="me-row">
      <button type="button" class="me-av hub-av" data-act="edit" aria-label="${esc(t('home.me.editAria'))}">${avatarHTML(d.info, full ? '4.6rem' : '3.6rem', 'avatar--shadow')}<i aria-hidden="true">✏️</i></button>
      <div class="me-text">
        <b class="me-name hub-name">${esc(d.info.name)}</b>
        ${d.info.motto ? `<span class="me-motto">“${esc(d.info.motto)}”</span>` : ''}
        <span class="me-meta">${esc(t('home.me.devices', { n: devices }))}</span>
      </div>
    </div>
    ${meStats(d)}
    ${full ? `<div class="btn-row btn-row--3">
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="edit">✏️ <span>${esc(t('home.me.edit'))}</span></button>
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="trophies">🏆 <span>${esc(t('home.me.trophies'))}</span></button>
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="share" title="${esc(t('home.me.devicesHint'))}">🔗 <span>${esc(t('home.me.devicesBtn'))}</span></button>
    </div>` : `<a class="ui-btn ui-btn--ghost ui-btn--block ui-btn--sm" href="#altro">${esc(t('home.me.open'))}</a>`}`;
}

/** 2.4: QR e codice per collegare un altro dispositivo, in cima a "Profilo e app" (prima solo in una finestra). */
function devicesHTML() {
  const head = `<div class="tile-head"><span class="tile-ico tile-ico--sky" aria-hidden="true">📲</span><div><h2 id="devTitle">${esc(t('home.dev.title'))}</h2><p class="tile-sub">${esc(t('home.dev.lead'))}</p></div></div>`;
  if (!Person.local()) return `${head}<p class="muted">${esc(t('home.dev.none'))}</p><button type="button" class="ui-btn ui-btn--primary" data-act="create">✨ ${esc(t('home.me.createShort'))}</button>`;
  const url = Person.linkUrl();
  const code = Person.linkCode();
  return `${head}
    <div class="dev-body">
      <div class="dev-qr hub-qr" aria-label="QR">${qrSVG(url)}</div>
      <div class="dev-text">
        <ol class="tile-steps"><li><b aria-hidden="true">1</b><span>${esc(t('home.dev.step1'))}</span></li><li><b aria-hidden="true">2</b><span>${esc(t('home.dev.step2'))}</span></li><li><b aria-hidden="true">3</b><span>${esc(t('home.dev.step3'))}</span></li></ol>
        <p class="hub-link-code"><span class="code-chip">${esc(code)}</span><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="devCopy">${esc(t('common.copy'))}</button></p>
        <details class="hub-details"><summary>${esc(t('home.dev.link'))}</summary><p class="dev-url"><a href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ''))}</a></p></details>
        <p class="muted small">${esc(t('home.share.secret'))}</p>
        <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="share">🔐 ${esc(t('home.dev.manage'))}</button>
      </div>
    </div>`;
}

function paintMe(state = Person.data) {
  $('#hubMe').innerHTML = meHTML(state, false);
  $('#hubMeFull').innerHTML = `<h2 class="sr-only">${esc(t('home.me.title'))}</h2>${meHTML(state, true)}${accountHTML()}`;
  $('#hubDevices').innerHTML = devicesHTML();
  $('#devCopy')?.addEventListener('click', async () => { const c = Person.linkCode(); try { await navigator.clipboard.writeText(c); toast(t('home.share.copied')); } catch { toast(c); } });
  paintHero(state?.info ? state : null);
  paintSideFoot(state);
}

function paintSideFoot(state = Person.data) {
  const d = state?.info ? state : null;
  $('#sideFoot').innerHTML = `
    ${d ? `<a class="side-me" href="#altro">${avatarHTML(d.info, '2.4rem')}<span><b>${esc(d.info.name)}</b><small>${esc(t('home.side.profile'))}</small></span></a>` : ''}
    <button type="button" class="side-ver" data-open="updates"><span>${esc(t('home.side.version', { v: APP_VERSION }))}</span><small>${esc(isApp() ? t('upd.check') : t('home.side.app'))}</small></button>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'create') openEditor(null);
  else if (act === 'edit') openEditor(Person.data?.info);
  else if (act === 'link') openLinkInput();
  else if (act === 'share') openShare();
  else if (act === 'trophies') openTrophies();
  else if (act === 'acc-google') signInGoogle(b);
  else if (act === 'acc-email') openAccountEmail();
  else if (act === 'acc-out') signOutAccount(b);
});

// ---------------------------------------------------------------------------
// Account permanente (2.0): Google o email, sopra al profilo personale (js/account.js)
// ---------------------------------------------------------------------------

/** Riquadro "Account" in Profilo e app. */
function accountHTML() {
  if (!isConfigured || !H.uid) return '';
  const a = accountInfo();
  if (a && !a.anonymous) {
    const via = a.provider === 'google.com' ? 'Google' : t('acc.viaEmail');
    return `<section class="acc-card" id="accCard">
      <div class="tile-head"><span class="tile-ico tile-ico--green" aria-hidden="true">🔐</span><div><h3>${esc(t('acc.title'))}</h3><p class="tile-sub">${esc(t('acc.signedIn', { who: a.email || a.name || '—', via }))}</p></div></div>
      <p class="muted small">${esc(t('acc.signedLead'))}</p>
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="acc-out">${esc(t('acc.signOut'))}</button>
    </section>`;
  }
  return `<section class="acc-card" id="accCard">
    <div class="tile-head"><span class="tile-ico tile-ico--violet" aria-hidden="true">🔐</span><div><h3>${esc(t('acc.title'))}</h3><p class="tile-sub">${esc(t('acc.lead'))}</p></div></div>
    <div class="btn-row">
      ${googleAvailable() ? `<button type="button" class="ui-btn ui-btn--primary ui-btn--sm acc-google" data-act="acc-google"><span class="g-logo" aria-hidden="true">G</span> ${esc(t('acc.google'))}</button>` : ''}
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-act="acc-email">✉️ ${esc(t('acc.email'))}</button>
    </div>
    ${googleAvailable() ? '' : `<p class="muted small">${esc(t('acc.appNote'))}</p>`}
    <p class="muted small">${esc(t('acc.guestNote'))}</p>
  </section>`;
}

/** Dopo l'accesso: messaggio e ritorno alla pagina da cui si è partiti (es. la serata). */
function afterAccount(res) {
  toast(t(res.profile === 'joined' ? 'acc.ok.joined' : res.kind === 'linked' ? 'acc.ok.linked' : 'acc.ok.created'));
  const back = accountBack();
  setTimeout(() => { if (back) location.href = back; else location.reload(); }, 900);
}

/** Pagina a cui tornare dopo l'accesso (?torna=play.html?room=ABCD): solo pagine nostre. */
function accountBack() {
  const raw = param('torna') || '';
  return /^play\.html\?room=[A-Z0-9]{4}$/.test(raw) ? raw : '';
}

async function signInGoogle(btn) {
  btn.disabled = true;
  try { afterAccount(await Account.google()); } catch (err) { toast(explainAuthError(err), 'error'); btn.disabled = false; }
}

async function signOutAccount(btn) {
  if (!confirm(t('acc.signOutAsk'))) return;
  btn.disabled = true;
  try { await Account.signOut(); toast(t('acc.signedOut')); setTimeout(() => location.reload(), 700); } catch (err) { toast(explainAuthError(err), 'error'); btn.disabled = false; }
}

/** Email e password: entra, crea l'account, password dimenticata. */
function openAccountEmail(mode = 'login') {
  const el = Sheet.open(`
    ${head(`✉️ ${esc(t('acc.emailTitle'))}`)}
    <div class="seg seg--full" role="group" aria-label="${esc(t('acc.emailTitle'))}">
      <button type="button" data-accmode="login" aria-pressed="${mode === 'login'}">${esc(t('acc.mode.login'))}</button>
      <button type="button" data-accmode="register" aria-pressed="${mode === 'register'}">${esc(t('acc.mode.register'))}</button>
    </div>
    <form id="accForm" class="acc-form" novalidate>
      <div class="field"><label for="accEmail">${esc(t('acc.f.email'))}</label><input class="input" id="accEmail" type="email" autocomplete="email" inputmode="email" required></div>
      <div class="field"><label for="accPw">${esc(t('acc.f.password'))}</label><input class="input" id="accPw" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="6" required></div>
      <p class="muted small">${esc(t(mode === 'register' ? 'acc.registerNote' : 'acc.loginNote'))}</p>
      <p class="form-error" id="accErr" role="alert"></p>
      <button type="submit" class="ui-btn ui-btn--primary ui-btn--block" id="accGo">${esc(t(mode === 'register' ? 'acc.mode.register' : 'acc.mode.login'))}</button>
      ${mode === 'login' ? `<button type="button" class="link-btn" id="accForgot">${esc(t('acc.forgot'))}</button>` : ''}
    </form>`);
  el.querySelectorAll('[data-accmode]').forEach((b) => b.addEventListener('click', () => openAccountEmail(b.dataset.accmode)));
  el.querySelector('#accForgot')?.addEventListener('click', async () => {
    const email = el.querySelector('#accEmail').value;
    const bad = checkCredentials(email, 'x');
    if (bad === 'acc.err.email') { el.querySelector('#accErr').textContent = t(bad); return; }
    try { await Account.reset(email); el.querySelector('#accErr').textContent = ''; toast(t('acc.resetSent', { email })); } catch (err) { el.querySelector('#accErr').textContent = explainAuthError(err); }
  });
  el.querySelector('#accForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.querySelector('#accEmail').value;
    const pw = el.querySelector('#accPw').value;
    const bad = checkCredentials(email, pw, { register: mode === 'register' });
    const err = el.querySelector('#accErr');
    if (bad) { err.textContent = t(bad); return; }
    const go = el.querySelector('#accGo');
    go.disabled = true;
    try {
      const res = mode === 'register' ? await Account.register(email, pw) : await Account.login(email, pw);
      Sheet.close();
      afterAccount(res);
    } catch (ex) { err.textContent = explainAuthError(ex); go.disabled = false; }
  });
}

/** Modifica (o crea) nome, personaggio, colore, foto e motto. */
function openEditor(info) {
  const f = {
    name: info?.name || ls.get('gnr_name') || '',
    options: avatarOptions(9),
    pick: 0,
    color: info?.color || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
    photo: info?.photo || null,
    motto: info?.motto || '',
    opts: info?.opts || null
  };
  if (info) f.options[0] = { style: info.style, seed: info.seed };
  const el = Sheet.open(`
    ${head(esc(info ? t('home.ed.titleEdit') : t('home.ed.titleNew')))}
    <div class="hub-ed-top"><span id="edPrev"></span>
      <div class="field"><label for="edName">${esc(t('home.ed.name'))}</label><input class="input" id="edName" maxlength="16" autocomplete="nickname" enterkeyhint="done" placeholder="${esc(t('home.ed.namePh'))}" value="${esc(f.name)}"></div>
    </div>
    <div class="ph-row"><h3>${esc(t('home.ed.character'))}</h3><button type="button" class="btn-sec btn-sec--sm" id="edMore">🔄 <span>${esc(t('home.ed.more'))}</span></button></div>
    <div class="av-grid av-grid--sm" id="edGrid" role="radiogroup" aria-label="${esc(t('home.ed.character'))}"></div>
    <div class="av-tools">
      <label class="btn-sec btn-sec--sm" for="edSelfie">📷 <span>${esc(t('home.ed.selfie'))}</span></label><input type="file" id="edSelfie" accept="image/*" capture="user" class="sr-only">
      <label class="btn-sec btn-sec--sm" for="edGallery">🖼️ <span>${esc(t('home.ed.gallery'))}</span></label><input type="file" id="edGallery" accept="image/*" class="sr-only">
      <button type="button" class="link-btn" id="edNoPhoto" ${f.photo ? '' : 'hidden'}>${esc(t('home.ed.noPhoto'))}</button>
    </div>
    <h3>${esc(t('home.ed.color'))}</h3>
    <div class="swatches" id="edColors" role="radiogroup" aria-label="${esc(t('home.ed.colorAria'))}"></div>
    <div class="field field--stack"><label for="edMotto">${esc(t('home.ed.motto'))} <span class="muted">${esc(t('home.ed.mottoHint'))}</span></label><input class="input" id="edMotto" maxlength="40" autocomplete="off" placeholder="${esc(t('home.ed.mottoPh'))}" value="${esc(f.motto)}"></div>
    <p class="form-error" id="edErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="edSave">${esc(info ? t('common.save') : t('home.ed.create'))}</button>
    ${info ? '' : `<p class="muted small">${esc(t('home.ed.newHint'))}</p>`}`, { wide: true });
  const look = () => {
    const o = f.options[f.pick];
    return { name: cleanName($('#edName', el).value, 16) || t('home.ed.you'), style: o.style, seed: o.seed, color: f.color, photo: f.photo, motto: cleanName($('#edMotto', el).value, 40), opts: f.pick === 0 && info && o.style === info.style && o.seed === info.seed ? f.opts : null };
  };
  const paint = () => {
    $('#edPrev', el).innerHTML = avatarHTML(look(), '4.6rem', 'avatar--shadow');
    $('#edGrid', el).innerHTML = f.options.map((o, i) => `<button type="button" class="av-opt" data-pick="${i}" role="radio" aria-checked="${!f.photo && i === f.pick}" aria-label="${esc(t('home.ed.characterN', { n: i + 1 }))}" style="--pc:${f.color}"><img src="${esc(avatarUri(o.style, o.seed))}" alt="" draggable="false"></button>`).join('');
    $('#edColors', el).innerHTML = PLAYER_COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--sc:${c}" role="radio" aria-checked="${c === f.color}" aria-label="${esc(t('home.ed.colorN', { c }))}"></button>`).join('');
    $('#edNoPhoto', el).hidden = !f.photo;
  };
  paint();
  el.addEventListener('input', (e) => { if (e.target.id === 'edName') paint(); });
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { f.pick = Number(p.dataset.pick); f.photo = null; f.opts = null; paint(); return; }
    const c = e.target.closest('[data-color]');
    if (c) { f.color = c.dataset.color; paint(); return; }
    if (e.target.closest('#edMore')) { f.options = avatarOptions(9); f.pick = 0; f.photo = null; paint(); return; }
    if (e.target.closest('#edNoPhoto')) { f.photo = null; paint(); }
  });
  const take = async (inp) => {
    const file = inp.files[0]; inp.value = '';
    if (!file) return;
    try { f.photo = await squarePhoto(file); paint(); } catch (err) { if (!err.cancelled) toast(err.message || t('common.photoUnreadable'), 'error'); }
  };
  $('#edSelfie', el).addEventListener('change', (e) => take(e.target));
  $('#edGallery', el).addEventListener('change', (e) => take(e.target));
  $('#edName', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#edSave', el).addEventListener('click', async (e) => {
    const name = cleanName($('#edName', el).value, 16);
    if (!name) { $('#edErr', el).textContent = t('home.ed.errName'); $('#edName', el).focus(); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = t('common.saving');
    try {
      await H.ready;
      if (info) await Person.saveLook(look());
      else await Person.create(look());
      ls.set('gnr_name', name);
      Sheet.close();
      paintAll();
      toast(info ? `✓ ${t('home.ed.saved')}` : t('home.ed.created', { name }));
    } catch (err) {
      $('#edErr', el).textContent = explainError(err);
      btn.disabled = false;
      btn.textContent = info ? t('common.save') : t('home.ed.create');
    }
  });
}

/** QR e codice per collegare un altro dispositivo (per esempio l'app sul telefono). */
function openShare() {
  if (!Person.local()) { openEditor(null); return; }
  const url = Person.linkUrl();
  const code = Person.linkCode();
  const el = Sheet.open(`
    ${head(esc(t('home.share.title')))}
    <p>${t('home.share.text')}</p>
    <div class="hub-qr">${qrSVG(url)}</div>
    <p class="hub-link-code"><span class="code-chip">${esc(code)}</span><button type="button" class="btn-sec btn-sec--sm" id="shCopy">${esc(t('common.copy'))}</button></p>
    <p class="muted small">${esc(t('home.share.secret'))}</p>
    <details class="hub-details"><summary>${esc(t('home.share.security'))}</summary>
      <p class="muted small">${esc(t('home.share.renewHint'))}</p>
      <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="shRenew">🔁 ${esc(t('home.share.renew'))}</button><button type="button" class="btn-sec btn-sec--sm" id="shOut">🚪 ${esc(t('home.share.signOut'))}</button></div>
    </details>`);
  $('#shCopy', el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); toast(t('home.share.copied')); } catch { toast(code); }
  });
  $('#shRenew', el).addEventListener('click', async () => {
    try { await Person.renewKey(); Sheet.close(); openShare(); toast(t('home.share.renewed')); } catch (err) { toast(explainError(err), 'error'); }
  });
  $('#shOut', el).addEventListener('click', async () => {
    if (!confirm(t('home.share.signOutConfirm'))) return;
    await Person.signOut();
    Sheet.close();
    paintAll();
  });
}

/** Collega questo dispositivo a un profilo che esiste già (QR o codice). */
function openLinkInput() {
  const el = Sheet.open(`
    ${head(esc(t('home.link.title')))}
    <p>${t('home.link.text')}</p>
    ${canScanQR() ? `<button type="button" class="btn btn-block" id="lkScan">📷 ${esc(t('home.link.scan'))}</button><p class="hub-or">${esc(t('home.link.or'))}</p>` : ''}
    <label class="sr-only" for="lkCode">${esc(t('home.link.codeAria'))}</label>
    <input class="input code-input code-input--link" id="lkCode" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123-K7Q2XA9F">
    <p class="form-error" id="lkErr" role="alert"></p>
    <button type="button" class="btn-sec btn-block" id="lkGo">${esc(t('home.link.go'))}</button>
    <details class="hub-details"><summary>${esc(t('home.link.oldTitle'))}</summary>
      <p class="muted small">${esc(t('home.link.oldText'))}</p>
      <div class="hub-code-row"><input class="input code-input code-input--6" id="lkMember" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="${esc(t('home.link.oldAria'))}"><button type="button" class="btn-sec" id="lkMemberGo">${esc(t('home.link.oldGo'))}</button></div>
      <p class="form-error" id="lkMemberErr" role="alert"></p>
    </details>`);
  $('#lkCode', el).addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15); });
  $('#lkMember', el).addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  $('#lkScan', el)?.addEventListener('click', async () => {
    const tx = await scanQR({ title: `📷 ${t('home.link.scanTitle')}`, hint: t('home.link.scanHint') });
    if (!tx) return;
    const l = parseLinkCode(tx);
    if (!l) { $('#lkErr', el).textContent = t('home.link.notProfileQR'); return; }
    doLink(l, $('#lkErr', el));
  });
  $('#lkGo', el).addEventListener('click', () => {
    const l = parseLinkCode($('#lkCode', el).value);
    if (!l) { $('#lkErr', el).textContent = t('home.link.errLen'); return; }
    doLink(l, $('#lkErr', el));
  });
  $('#lkMemberGo', el).addEventListener('click', async () => {
    const id = normalizeCode($('#lkMember', el).value, 6);
    const err = $('#lkMemberErr', el);
    if (id.length !== 6) { err.textContent = t('home.code6.errLen'); return; }
    try { await adoptMember(id); Sheet.close(); paintAll(); } catch (ex) { err.textContent = explainError(ex); }
  });
}

/** Conferma per i link "…index.html#collega=…" e i QR inquadrati. */
function askLink(l) {
  if (Person.local()?.pid === l.pid) { toast(t('home.link.already')); return; }
  const el = Sheet.open(`
    ${head(esc(t('home.ask.title')))}
    <p>${t('home.ask.text', { pid: `<b>${esc(l.pid)}</b>` })}</p>
    ${Person.local() ? `<p class="muted small">${esc(t('home.ask.merge'))}</p>` : ''}
    <p class="form-error" id="alErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="alGo">${esc(t('home.link.go'))}</button>
    <button type="button" class="link-btn" data-close>${esc(t('common.cancel'))}</button>`);
  $('#alGo', el).addEventListener('click', () => doLink(l, $('#alErr', el)));
}

async function doLink(l, errEl) {
  try {
    await H.ready;
    const res = await Person.linkWith(l.pid, l.key);
    Sheet.close();
    paintAll();
    toast(`✓ ${res.merged ? t('home.link.merged', { name: res.info?.name || '' }) : t('home.link.done', { name: res.info?.name || '' })}`);
  } catch (err) {
    if (errEl) errEl.textContent = err.user ? err.message : explainError(err);
    else toast(err.user ? err.message : explainError(err), 'error');
  }
}

async function loadMember(id) {
  if (!CODE6.test(id || '')) return null;
  const v = (await get(memberRef(id))).val();
  return v ? { id, ...v } : null;
}

/** Vecchio codice personale di un gruppo: entra nel profilo (o lo crea da lì). */
async function adoptMember(id) {
  await H.ready;
  const m = await loadMember(id);
  if (!m) throw userError(t('home.code6.none'));
  const profs = ls.json('gnr_profiles', {}) || {};
  profs[m.groupId] = m.id;
  ls.set('gnr_profiles', JSON.stringify(profs));
  if (Person.local()) await Person.linkGroup(m.groupId, m.id);
  else await Person.create(m, { groups: { [m.groupId]: m.id } });
  toast(t('home.code6.linked', { name: m.name }));
}

/** Traguardi di tutti i gruppi del profilo (sommati anche tra profili uniti). */
async function openTrophies() {
  const d = Person.data;
  if (!d) return;
  const el = Sheet.open(`${head(`🏆 ${esc(t('home.tr.title'))}`)}<div id="trBody"><p class="muted">${esc(t('home.tr.loading'))}</p></div>`, { wide: true, cls: 'sheet--trophies' });
  const got = new Map();
  const rows = [];
  for (const gid of Object.keys(d.groups || {})) {
    const keys = personKeysFor(gid, d);
    try {
      const [nights, info] = await Promise.all([get(groupRef(gid, 'nights')).then((s) => s.val() || {}), get(groupRef(gid, 'info')).then((s) => s.val()).catch(() => null)]);
      const pr = progressFor(mergedNights(nights, keys), keys[0], {});
      pr.achievements.filter((a) => a.got).forEach((a) => got.set(a.id, a));
      rows.push({ name: info?.name || gid, pr });
    } catch { rows.push({ name: gid, locked: true }); }
  }
  if (!el.isConnected) return;
  $('#trBody', el).innerHTML = rows.length ? trophiesHTML(rows, got) : `<p>${esc(t('home.tr.none'))}</p>`;
}

// 2.4: categorie solo per la presentazione (i criteri di sblocco restano quelli di stats.js)
const TR_CATS = [
  ['presence', ['first', 'regular', 'veteran', 'loyal']],
  ['explore', ['explorer', 'explorer2', 'complete']],
  ['wins', ['winner', 'machine', 'marathon', 'star']],
  ['votes', ['oracle', 'seer', 'rebel']],
  ['social', ['social']],
  ['secret', ['harsh', 'gold', 'night-owl']]
];
function trophiesHTML(rows, got) {
  // Avanzamento migliore fra tutti i gruppi (es. 3 serate su 5 nel gruppo dove ne hai fatte di più)
  const best = new Map();
  for (const r of rows) for (const a of r.pr?.achievements || []) {
    if (!a.progress) continue;
    const [cur, goal] = a.progress;
    const prev = best.get(a.id);
    if (!prev || cur / goal > prev[0] / prev[1]) best.set(a.id, [Math.min(cur, goal), goal]);
  }
  const total = ACHIEVEMENTS.length;
  const pct = Math.round((got.size / total) * 100);
  const known = new Set(TR_CATS.flatMap(([, ids]) => ids));
  const cats = [...TR_CATS, ['other', ACHIEVEMENTS.map((a) => a.id).filter((id) => !known.has(id))]].filter(([, ids]) => ids.length);
  const byId = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
  const card = (a) => {
    const ok = got.has(a.id);
    if (a.secret && !ok) return `<li class="tr-card is-off is-secret"><span class="tr-ico" aria-hidden="true">❔</span><div><b>${esc(t('home.tr.secret'))}</b><small>${esc(t('home.tr.secretHint'))}</small></div></li>`;
    const p = best.get(a.id);
    return `<li class="tr-card ${ok ? 'is-on' : 'is-off'}"><span class="tr-ico" aria-hidden="true">${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
      ${ok ? `<span class="badge badge--done">✓ ${esc(t('tr.done'))}</span>` : p ? `<span class="tr-prog"><i class="tr-bar"><i style="width:${Math.round((p[0] / p[1]) * 100)}%"></i></i><small>${esc(t('tr.progress', { cur: p[0], goal: p[1] }))}</small></span>` : `<span class="badge">${esc(t('tr.todo'))}</span>`}</div></li>`;
  };
  return `
    <div class="tr-summary">
      <div class="tr-ring" style="--p:${pct}" role="img" aria-label="${pct}%"><b>${pct}%</b></div>
      <div><p class="tr-summary-title">${esc(t('tr.summary', { n: got.size, total }))}</p><i class="tr-bar tr-bar--big"><i style="width:${pct}%"></i></i></div>
    </div>
    <h3>${esc(t('tr.groupsTitle'))}</h3>
    <div class="tr-groups">${rows.map((r) => r.locked
      ? `<div class="tr-group"><b>${esc(r.name)}</b><span class="muted small">${esc(t('home.tr.private'))}</span></div>`
      : `<div class="tr-group"><b>${esc(r.name)}</b><span class="lv-badge">${esc(t('home.tr.level', { n: r.pr.level }))}</span><span class="muted small">${esc(r.pr.levelName)} · ${esc(t('home.tr.nights', { n: r.pr.nights }))} · ${esc(t('home.tr.wins', { n: r.pr.wins }))}</span><i class="tr-bar"><i style="width:${Math.round(r.pr.levelProgress * 100)}%"></i></i></div>`).join('')}</div>
    ${cats.map(([c, ids]) => {
      const n = ids.filter((id) => got.has(id)).length;
      return `<section class="tr-cat"><h3>${esc(c === 'other' ? t('home.tr.title') : t(`tr.cat.${c}`))} <small class="muted">${esc(t('tr.catCount', { n, total: ids.length }))}</small></h3>
        <ul class="tr-list tr-grid">${ids.map((id) => card(byId[id])).join('')}</ul></section>`;
    }).join('')}`;
}

// ---------------------------------------------------------------------------
// Armadi (indipendenti dai gruppi, legati al profilo)
// ---------------------------------------------------------------------------

function armadiList() {
  const map = new Map();
  for (const [id, a] of Object.entries(Person.data?.armadi || {})) map.set(id, { id, name: a.name, own: a.own, key: a.key, at: a.at || 0 });
  for (const a of ls.json('gnr_armadi', []) || []) if (a && CODE6.test(a.id) && !map.has(a.id)) map.set(a.id, { id: a.id, name: a.name, at: 0 });
  return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
}
const armUrl = (id) => `armadio.html?a=${id}`; // i18n-ok

/** 2.4: intestazione comune delle pagine (titolo, descrizione, azione principale, riepilogo). */
function pageHead({ id, ico, title, lead, action = '', stats = [] }) {
  return `<header class="page-head">
      <div class="page-head-text"><h1 class="page-title" id="${id}">${ico} ${esc(title)}</h1><p class="page-lead">${esc(lead)}</p></div>
      ${action ? `<div class="page-head-acts">${action}</div>` : ''}
    </header>
    ${stats.length ? `<ul class="page-stats" aria-label="${esc(t('page.stats'))}">${stats.map(([n, label, cls]) => `<li class="${cls || ''}"><b>${n}</b><span>${esc(label)}</span></li>`).join('')}</ul>` : ''}`;
}
/** Riquadro "Cosa puoi fare" accanto alle card: la pagina resta completa anche con pochi elementi. */
function pageAside(lines, extra = '') {
  return `<aside class="tile page-aside" aria-label="${esc(t('page.help'))}"><h2 class="sec-title">💡 ${esc(t('page.help'))}</h2>
    <ul class="page-help">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${extra}</aside>`;
}

H.armInfo = H.armInfo || {};
function armCardHTML(a) {
  const info = H.armInfo[a.id] || {};
  const role = a.own ? t('home.arm.own') : a.key ? t('home.arm.editor') : t('home.arm.viewer');
  const upd = Number(info.updatedAt || info.createdAt) || 0;
  return `<li><a class="row hub-item card-item" href="${armUrl(a.id)}">
      <span class="card-item-top"><span class="tile-ico tile-ico--violet" aria-hidden="true">${esc(info.emoji || '📦')}</span><span class="badge ${a.own ? 'badge--own' : ''}">${esc(role)}</span></span>
      <span class="mini-text"><b>${esc(info.name || a.name)}</b>${info.desc ? `<small>${esc(info.desc)}</small>` : ''}</span>
      <span class="card-item-meta"><span>${esc(t('home.arm.code', { code: a.id }))}</span>${upd ? `<span>${esc(t('home.arm.updated', { date: fmtDate(upd, { day: 'numeric', month: 'short', year: 'numeric' }) }))}</span>` : ''}</span>
      <span class="card-item-go">${esc(t('home.arm.open'))} <span aria-hidden="true">›</span></span>
    </a></li>`; // i18n-ok
}
function paintArmadi() {
  const list = armadiList();
  $('#tileArmTxt').textContent = list.length
    ? `${t('home.arm.count', { n: list.length })}: ${list.slice(0, 2).map((a) => a.name).join(', ')}${list.length > 2 ? '…' : ''}`
    : t('home.arm.empty');
  const own = list.filter((a) => a.own).length;
  const box = $('#hubArmadi');
  box.innerHTML = `
    ${pageHead({ id: 'armTitle', ico: '📦', title: t('home.arm.title'), lead: t('home.arm.lead'),
    action: `<button type="button" class="ui-btn ui-btn--primary" id="armNew">➕ <span>${esc(t('home.arm.new'))}</span></button>`,
    stats: list.length ? [[list.length, t('home.arm.stTotal', { n: list.length })], [own, t('home.arm.stOwn', { n: own })], [list.length - own, t('home.arm.stShared', { n: list.length - own })]] : [] })}
    <div class="page-body">
      <div class="page-main">${list.length ? `<ul class="rows card-grid">${list.map(armCardHTML).join('')}</ul>` : `<p class="empty empty--big">${esc(t('home.arm.none'))}</p>`}</div>
      ${pageAside([t('home.arm.help1'), t('home.arm.help2'), t('home.arm.help3')], `
        <details class="hub-details" open><summary>${esc(t('home.arm.haveCode'))}</summary>
          <div class="hub-code-row"><input class="input code-input code-input--6" id="armCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="${esc(t('home.arm.codeAria'))}"><button type="button" class="btn-sec" id="armCodeGo">${esc(t('common.open'))}</button></div>
          <p class="form-error" id="armCodeErr" role="alert"></p>
        </details>
        ${Person.local() ? '' : `<p class="muted small">${esc(t('home.arm.withProfile'))}</p>`}`)}
    </div>`;
  $('#armNew').addEventListener('click', openNewArmadio);
  $('#armCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  $('#armCodeGo').addEventListener('click', async () => {
    const id = normalizeCode($('#armCode').value, 6);
    const err = $('#armCodeErr');
    if (id.length !== 6) { err.textContent = t('home.code6.errLen'); return; }
    try {
      await H.ready;
      const info = (await get(armadioRef(id, 'info'))).val();
      if (!info) { err.textContent = t('home.arm.notFound'); return; }
      rememberArm(id, info.name);
      await Person.linkArmadio(id, info.name).catch(() => {});
      location.href = armUrl(id);
    } catch (ex) { err.textContent = explainError(ex); }
  });
  loadArmInfo(list);
}
/** Nome aggiornato, emoji, descrizione e data degli armadi (una lettura per armadio, solo "info"). */
async function loadArmInfo(list) {
  if (!H.uid) return;
  const todo = list.filter((a) => !H.armInfo[a.id]).slice(0, 24);
  if (!todo.length) return;
  await Promise.all(todo.map((a) => get(armadioRef(a.id, 'info')).then((sn) => { H.armInfo[a.id] = sn.val() || {}; }).catch(() => { H.armInfo[a.id] = {}; })));
  const grid = $('#hubArmadi .card-grid');
  if (grid) grid.innerHTML = armadiList().map(armCardHTML).join('');
}
// ---------------------------------------------------------------------------
// Prestiti scaduti e in scadenza (dagli armadi che questo dispositivo può modificare)
// ---------------------------------------------------------------------------

const LOAN_SNOOZE = 'gnr_loan_snooze';
async function checkLoans() {
  const box = $('#loanAlert');
  if (!box) return;
  const arms = armadiList().filter((a) => a.own || a.key || ls.get(`gnr_akey_${a.id}`));
  const overdue = []; const soon = [];
  for (const a of arms.slice(0, 8)) {
    let loans = null;
    // Si legge una volta sola all'apertura (niente ascolti fissi): chi non può leggere i prestiti non vede niente.
    try { loans = (await get(armadioRef(a.id, 'loans'))).val(); } catch { continue; }
    const r = loanAlerts(loans);
    overdue.push(...r.overdue.map((l) => ({ ...l, aid: a.id, arm: a.name })));
    soon.push(...r.soon.map((l) => ({ ...l, aid: a.id, arm: a.name })));
  }
  const all = [...overdue, ...soon];
  const sig = alertsSig(all);
  // 2.1 (idea 72): anche nel centro avvisi
  Notices.clearCat('loans');
  for (const l of all) Notices.put({ id: `loan:${l.aid}:${l.id}`, cat: 'loans', icon: overdue.includes(l) ? '⏰' : '📅', title: l.name || '?', sub: `${l.arm} · ${l.to || ''}`.trim(), href: `armadio.html?a=${l.aid}&loan=${l.id}`, sig: String(l.due || '') });
  const sn = ls.json(LOAN_SNOOZE, null);
  // Rimandato a domani: torna prima solo se c'è un prestito nuovo da ricordare.
  if (!all.length || (sn && sn.sig === sig && Date.now() < sn.until)) { box.hidden = true; box.innerHTML = ''; return; }
  const row = (l, late) => `<li><a class="row hub-item" href="armadio.html?a=${esc(l.aid)}&loan=${esc(l.id)}"><span aria-hidden="true">${late ? '⏰' : '📅'}</span><span class="mini-text"><b>${esc(l.name || '?')}</b><small>${esc(late ? t('loan.lateBy', { name: l.to, n: l.days }) : l.days ? t('loan.dueIn', { name: l.to, n: l.days }) : t('loan.dueToday', { name: l.to }))}${arms.length > 1 ? ` · ${esc(l.arm || '')}` : ''}</small></span><span class="mini-go" aria-hidden="true">›</span></a></li>`; // i18n-ok
  box.hidden = false;
  box.innerHTML = `
    <div class="tile-head"><span class="tile-ico tile-ico--pink" aria-hidden="true">🤝</span><div><h2>${esc(overdue.length ? t('loan.titleLate', { n: overdue.length }) : t('loan.titleSoon', { n: soon.length }))}</h2>
      <p class="tile-sub">${esc(t('loan.sub'))}</p></div></div>
    <ul class="rows">${overdue.slice(0, 5).map((l) => row(l, true)).join('')}${soon.slice(0, Math.max(0, 5 - overdue.length)).map((l) => row(l, false)).join('')}</ul>
    <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="loanSnooze">${esc(t('loan.snooze'))}</button>`;
  $('#loanSnooze').addEventListener('click', () => {
    const d = new Date(); d.setHours(24, 0, 0, 0);
    ls.set(LOAN_SNOOZE, JSON.stringify({ sig, until: d.getTime() }));
    box.hidden = true;
  });
}

// I tuoi dati: esportazione, importazione, privacy e diagnostica (datacenter.js)
bindDataCenter({
  Sheet, head, uid: () => H.uid, ready: () => H.ready || Promise.resolve(), armadiList: () => armadiList(),
  rememberArm: (id, name) => rememberArm(id, name), repaint: () => { paintAll(); checkLoans().catch(() => {}); }
});

function rememberArm(id, name) {
  const list = (ls.json('gnr_armadi', []) || []).filter((a) => a?.id !== id);
  ls.set('gnr_armadi', JSON.stringify([{ id, name }, ...list].slice(0, 12)));
}
function openNewArmadio() {
  const who = Person.data?.info?.name;
  const el = Sheet.open(`
    ${head(`📦 ${esc(t('home.arm.newTitle'))}`)}
    <p>${esc(t('home.arm.newText'))}</p>
    <div class="field field--stack"><label for="naName">${esc(t('home.arm.name'))}</label><input class="input" id="naName" maxlength="40" autocomplete="off" placeholder="${esc(who ? t('home.arm.defaultName', { name: who }) : t('home.arm.defaultHome'))}"></div>
    <p class="form-error" id="naErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="naGo">${esc(t('home.arm.createGo'))}</button>`);
  $('#naGo', el).addEventListener('click', async (e) => {
    const name = cleanName($('#naName', el).value, 40) || (who ? t('home.arm.defaultName', { name: who }) : t('home.arm.defaultHome'));
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await H.ready;
      let id = null;
      for (let i = 0; i < 12 && !id; i++) { const c = randomCode(6); if (!(await get(armadioRef(c, 'info'))).exists()) id = c; }
      if (!id) throw new Error(t('common.noFreeCode'));
      await set(armadioRef(id, 'info'), { name, ownerUid: H.uid, createdAt: Date.now() });
      const key = randomCode(8);
      await set(dbRef(`armadioKeys/${id}`), key);
      ls.set(`gnr_akey_${id}`, key);
      rememberArm(id, name);
      await Person.linkArmadio(id, name, key, true).catch(() => {});
      location.href = `${armUrl(id)}&add=1`;
    } catch (err) {
      $('#naErr', el).textContent = explainError(err);
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Le tue serate: resoconti di quelle aperte su questo dispositivo
// ---------------------------------------------------------------------------

function historyList() {
  return (ls.json('gnr_history', []) || []).filter((n) => /^[A-Z0-9]{4}$/.test(n?.room || ''));
}
H.nightSt = H.nightSt || {};
/** Stato di una serata dello storico: live (in corso), done, saved (solo riassunto nel gruppo), gone. */
async function nightStatus(n) {
  const [meta, state] = await Promise.all([get(roomRef(n.room, 'meta')).then((x) => x.val()), get(roomRef(n.room, 'state')).then((x) => x.val())]).catch(() => [null, null]);
  if (meta) return { st: state?.phase === 'awards' ? 'done' : 'live', meta };
  if (n.gid) {
    const has = (await get(groupRef(n.gid, `nights/${n.room}`)).catch(() => null))?.exists();
    if (has) return { st: 'saved' };
  }
  return { st: 'gone' };
}
function reportUrl(n, extra = '') {
  const regia = ls.get(`gnr_regia_${n.room}`) ? '&s=regia' : ''; // sulla TV che l'ha guidata vale la sessione della regia
  return `resoconto.html?room=${esc(n.room)}${n.gid ? `&g=${esc(n.gid)}` : ''}${regia}${extra}`;
}
function nightCardHTML(n) {
  const x = H.nightSt[n.room];
  const st = x?.st || 'checking';
  const canClose = st === 'live' && (Boolean(ls.get(`gnr_regia_${n.room}`)) || isNightCreator(x.meta, H.uid, Person.data?.pid || ''));
  const ico = { live: '🔴', done: '🏆', saved: '📋', gone: '🗃️', checking: '📋' }[st];
  return `<li><div class="row hub-item card-item card-item--night is-${st}">
      <span class="card-item-top"><span class="tile-ico tile-ico--${st === 'live' ? 'live' : st === 'done' ? 'sun' : 'teal'}" aria-hidden="true">${ico}</span><span class="badge badge--${st}">${esc(t(`home.hist.st.${st}`))}</span></span>
      <span class="mini-text"><b>${esc(n.group || t('home.hist.night'))} · ${esc(n.room)}</b><small>${esc(fmtDate(n.at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small></span>
      <span class="card-item-acts">
        ${st !== 'gone' ? `<a class="ui-btn ui-btn--ghost ui-btn--sm" href="${reportUrl(n)}">📋 ${esc(t('home.hist.openReport'))}</a>` : ''}
        ${canClose ? `<a class="ui-btn ui-btn--outline ui-btn--sm" href="${reportUrl(n, '&do=close')}" title="${esc(t('home.hist.closeTitle'))}">🏁 ${esc(t('home.hist.close'))}</a>` : ''}
      </span>
    </div></li>`; // i18n-ok
}
function paintHistory() {
  const list = historyList();
  $('#tileHistTxt').textContent = list.length
    ? t('home.hist.count', { n: list.length, last: fmtDate(list[0].at, { day: 'numeric', month: 'short' }) })
    : t('home.hist.empty');
  const known = list.filter((n) => H.nightSt[n.room]);
  const live = known.filter((n) => H.nightSt[n.room].st === 'live').length;
  const done = known.filter((n) => ['done', 'saved'].includes(H.nightSt[n.room].st)).length;
  const full = known.length === list.length;
  const box = $('#hubHistory');
  box.innerHTML = `
    ${pageHead({ id: 'histTitle', ico: '📋', title: t('home.hist.title'), lead: t('home.hist.lead'),
    action: `<a class="ui-btn ui-btn--primary" href="host.html">📺 <span>${esc(t('home.host.go'))}</span></a>`,
    stats: list.length ? [[list.length, t('home.hist.stTotal', { n: list.length })], [full ? done : '…', t('home.hist.stDone', { n: done })], [full ? live : '…', t('home.hist.stLive'), live ? 'is-live' : '']] : [] })}
    <div class="page-body">
      <div class="page-main">${list.length ? `<ul class="rows card-grid">${list.map(nightCardHTML).join('')}</ul>` : `<p class="empty empty--big">${esc(t('home.hist.none'))}</p>`}</div>
      ${pageAside([t('home.hist.help1'), t('home.hist.help2'), t('home.hist.help3')])}
    </div>`;
  if (H.uid && list.some((n) => !H.nightSt[n.room])) loadNightStatus(list);
}
async function loadNightStatus(list) {
  if (H.nightBusy) return;
  H.nightBusy = true;
  try {
    await Promise.all(list.filter((n) => !H.nightSt[n.room]).map(async (n) => { H.nightSt[n.room] = await nightStatus(n); }));
  } finally { H.nightBusy = false; }
  paintHistory();
}

// ---------------------------------------------------------------------------
// Gruppi: serata in corso (un ascolto leggero per gruppo, su "current")
// ---------------------------------------------------------------------------

function groupIds() {
  const groups = { ...(ls.json('gnr_profiles', {}) || {}), ...(Person.data?.groups || {}) };
  return Object.keys(groups).filter((g) => CODE6.test(g));
}
function groupRowHTML(gid) {
  const g = H.groups[gid] || {};
  const name = g.name || gid;
  if (g.live) {
    return `<a class="row hub-item hub-item--live" href="play.html?room=${esc(g.live.room)}"><span class="tile-ico tile-ico--${g.live.done ? 'sun' : 'live'}" aria-hidden="true">${g.live.done ? '🏆' : '🔴'}</span><span class="mini-text"><b>${esc(name)}</b><small>${esc(g.live.done ? t('home.groups.ended') : t('home.groups.live', { code: g.live.room }))}</small></span><span class="mini-go" aria-hidden="true">›</span></a>`;
  }
  return `<div class="row hub-item"><span class="tile-ico tile-ico--violet" aria-hidden="true">🎲</span><span class="mini-text"><b>${esc(name)}</b><small>${esc(g.checked ? t('home.groups.idle') : t('home.groups.checking'))}</small></span></div>`;
}
function groupCardHTML(gid) {
  const g = H.groups[gid] || {};
  const name = g.name || gid;
  const role = g.owner ? 'owner' : ls.get(`gnr_gkey_${gid}`) ? 'key' : 'member';
  const live = g.live && !g.live.done;
  return `<li id="grp_${esc(gid)}"><div class="row hub-item card-item ${live ? 'hub-item--live is-live' : ''}">
      <span class="card-item-top"><span class="tile-ico tile-ico--${live ? 'live' : g.live ? 'sun' : 'violet'}" aria-hidden="true">${live ? '🔴' : g.live ? '🏆' : '🎲'}</span><span class="badge ${role === 'owner' ? 'badge--own' : ''}">${esc(t(`home.groups.role.${role}`))}</span></span>
      <span class="mini-text"><b>${esc(name)}</b><small>${esc(g.live ? (g.live.done ? t('home.groups.ended') : t('home.groups.live', { code: g.live.room })) : g.checked ? t('home.groups.idle') : t('home.groups.checking'))}</small></span>
      <span class="card-item-meta">${g.nights === null ? `<span>🔒 ${esc(t('home.groups.private'))}</span>` : Number.isFinite(g.nights) ? `<span>${esc(t('home.groups.nights', { n: g.nights }))}</span>${g.lastAt ? `<span>${esc(t('home.groups.last', { date: fmtDate(g.lastAt, { day: 'numeric', month: 'short' }) }))}</span>` : ''}` : ''}</span>
      ${g.live ? `<span class="card-item-acts"><a class="ui-btn ${live ? 'ui-btn--primary' : 'ui-btn--ghost'} ui-btn--sm" href="play.html?room=${esc(g.live.room)}">${esc(live ? t('home.groups.join') : t('home.groups.results'))} ›</a></span>` : ''}
    </div></li>`; // i18n-ok
}
function renderGroups() {
  const ids = groupIds();
  const full = $('#hubGroups');
  const liveN = ids.filter((g) => H.groups[g]?.live && !H.groups[g].live.done).length;
  const nights = ids.reduce((a, g) => a + (Number(H.groups[g]?.nights) || 0), 0);
  full.innerHTML = `
    ${pageHead({ id: 'grpTitle', ico: '👥', title: t('home.groups.title'), lead: t('home.groups.lead'),
    action: `<a class="ui-btn ui-btn--primary" href="host.html">📺 <span>${esc(t('home.groups.newNight'))}</span></a>`,
    stats: ids.length ? [[ids.length, t('home.groups.stTotal', { n: ids.length })], [liveN, t('home.groups.stLive'), liveN ? 'is-live' : ''], [nights, t('home.groups.stNights', { n: nights })]] : [] })}
    <div class="page-body">
      <div class="page-main">${ids.length ? `<ul class="rows card-grid" id="grpList">${ids.map(groupCardHTML).join('')}</ul>` : `<p class="empty empty--big">${esc(t('home.groups.none'))}</p>`}</div>
      ${pageAside([t('home.groups.help1'), t('home.groups.help2')])}
    </div>`;
  const live = ids.filter((g) => H.groups[g]?.live && !H.groups[g].live.done);
  const order = [...live, ...ids.filter((g) => !live.includes(g))].slice(0, 3);
  $('#grpMini').innerHTML = ids.length
    ? `<ul class="rows rows--mini">${order.map((g) => `<li>${groupRowHTML(g)}</li>`).join('')}</ul>${ids.length > 3 ? `<p class="muted small">${esc(t('home.groups.more', { n: ids.length - 3 }))}</p>` : ''}`
    : `<p class="empty empty--sm">${esc(t('home.groups.none'))}</p>`;
}
function paintGroups() {
  H.groupStops.forEach((f) => { try { f(); } catch { /* niente */ } });
  H.groupStops = [];
  const ids = groupIds();
  renderGroups();
  for (const gid of ids) {
    H.groups[gid] ||= {};
    get(groupRef(gid, 'info')).then((s) => { const i = s.val() || {}; H.groups[gid].name = i.name || gid; H.groups[gid].owner = Boolean(H.uid && i.ownerUid === H.uid); renderGroups(); }).catch(() => {});
    // Quante serate e l'ultima (riassunti piccoli; un gruppo privato di cui non si è membri non si legge)
    get(groupRef(gid, 'nights')).then((s) => { const all = Object.values(s.val() || {}); H.groups[gid].nights = all.length; H.groups[gid].lastAt = Math.max(0, ...all.map((n) => Number(n?.at) || 0)) || 0; renderGroups(); }).catch(() => { H.groups[gid].nights = null; renderGroups(); });
    H.groupStops.push(onValue(groupRef(gid, 'current'), async (snap) => {
      const cur = snap.val();
      let live = null;
      if (cur?.room) {
        const meta = (await get(roomRef(cur.room, 'meta')).catch(() => null))?.val();
        const st = meta ? (await get(roomRef(cur.room, 'state')).catch(() => null))?.val() : null;
        if (meta) live = { room: cur.room, done: st?.phase === 'awards' && st?.done };
      }
      H.groups[gid].live = live;
      H.groups[gid].checked = true;
      renderGroups();
    }, () => { H.groups[gid].checked = true; renderGroups(); }));
  }
}

// ---------------------------------------------------------------------------
// App Android e aggiornamenti
// ---------------------------------------------------------------------------

function appTileHead() {
  return `<div class="tile-head"><span class="tile-ico tile-ico--green" aria-hidden="true">🤖</span><div><h2>${esc(t('home.app.title'))}</h2><p class="tile-sub">${esc(t('home.app.text'))}</p></div></div>`;
}
function paintApp() {
  const box = $('#hubApp');
  // Nell'app la sezione sta in "Profilo e app" e nelle Impostazioni (e nell'avviso degli aggiornamenti)
  const hide = isApp() || !apkUrl();
  box.hidden = hide;
  $('#homeGrid').classList.toggle('no-app', hide);
  if (hide) return;
  box.innerHTML = `${appTileHead()}<div id="hubVerPanel" class="ver-panel ver-panel--tile"></div>`;
  H.appPanel = mountUpdatePanel($('#hubVerPanel'), { qrSVG, toast, showQR: !isAndroid() });
}
function mountAppFull() {
  if (H.appFull) return;
  const box = $('#hubAppFull');
  if (!apkUrl()) { box.innerHTML = `${appTileHead()}<p class="muted small">${esc(t('upd.err.noconfig'))}</p>`; H.appFull = true; return; }
  box.innerHTML = `${appTileHead()}<div id="altroVerPanel" class="ver-panel"></div>`;
  H.appFull = mountUpdatePanel($('#altroVerPanel'), { qrSVG, toast, showQR: true });
}

/** Sezione "Scarica GameNight" in una finestra: versioni, aggiornamenti, download e QR per un altro telefono. */
function openUpdates(force = false) {
  const el = Sheet.open(`${head(`📲 ${esc(t('home.app.sheetTitle'))}`)}
    <div id="stVerPanel" class="ver-panel"></div>`, { wide: true });
  const p = mountUpdatePanel($('#stVerPanel', el), { qrSVG, toast, showQR: true });
  if (force) { p.refresh(); refreshLinks().catch(() => {}); }
}
$('#hubCheckUpd').addEventListener('click', () => openUpdates(true));

// ---------------------------------------------------------------------------
// Link ufficiali (GitHub, Discord, Ko-fi…): tutti da config/links.json, vedi js/links.js
// ---------------------------------------------------------------------------

function paintLinksStatus() {
  const el = $('#linksStatus');
  if (!el) return;
  const s = links.status();
  const date = s.updated ? fmtDate(new Date(`${s.updated}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  el.textContent = !date ? '' : t(s.source === 'baseline' && s.remote ? 'links.st.base' : 'links.st.remote', { date });
}
bindLinks();
links.subscribe(paintLinksStatus);
links.ready().then(paintLinksStatus, () => {});
window.addEventListener('gnr-lang', () => setTimeout(paintLinksStatus, 0));

// ---------------------------------------------------------------------------
// Impostazioni e introduzione
// ---------------------------------------------------------------------------

/**
 * 2.4: Impostazioni a sezioni (Generali, Aspetto e accessibilità, Consigli, Notifiche, Partita e regia, Privacy,
 * Aiuto), con un indice in alto e una finestra più larga (sheet--settings). Ogni controllo usa il sistema che
 * c'era già: lingua, tema e accessibilità (util.js), consigli (tips.js), centro avvisi (notices.js), promemoria
 * (reminders.js), dati (datacenter.js). Nuove: densità (util.js) e lobby della TV (lobby-prefs.js).
 */
function openSettings() {
  const sec = (id, ico, title, body) => `<section class="set-sec" id="set-${id}" aria-labelledby="set-${id}-t"><h3 id="set-${id}-t">${ico} ${esc(title)}</h3>${body}</section>`;
  const secs = [
    ['general', '🌐', t('set.sec.general'), `<p class="field-label" id="stLangT">${esc(t('common.language'))}</p>${langSwitchHTML('hubLang')}<p class="muted small">${esc(t('home.set.langHint'))}</p>`],
    ['look', '🎨', t('set.sec.look'), `<p class="field-label">${esc(t('home.set.theme'))}</p>${themeSwitchHTML('hubTheme')}
      <p class="field-label">${esc(t('home.set.a11y'))}</p>${a11yHTML('hubA11y')}
      <p class="field-label">${esc(t('density.label'))}</p>${densityHTML()}<p class="muted small">${esc(t('density.hint'))}</p>`],
    ['tips', '💡', t('set.sec.tips'), `${tipsSettingsHTML()}<p class="muted small">${esc(t('tips.lead'))}</p>`],
    ['notify', '🔔', t('set.sec.notify'), `<p class="muted small">${esc(t('set.notify.lead'))}</p>
      <p class="field-label">${esc(t('set.notify.cats'))}</p><div class="tips-cats">${NOTICE_CATS.map((c) => `<label class="quick-toggle"><input type="checkbox" data-nccat="${c}" ${Notices.catOff(c) ? '' : 'checked'}><span>${esc(t(`nc.cat.${c}`))}</span></label>`).join('')}</div>
      <label class="field"><span class="field-label">${esc(t('set.notify.remind'))}</span><select class="input select" id="stRemind">${LEADS.map((v) => `<option value="${v}" ${v === reminderLead() ? 'selected' : ''}>${esc(t(`rem.lead.${v}`))}</option>`).join('')}</select></label>`],
    ['room', '📺', t('set.sec.room'), `<p class="muted small">${esc(t('set.room.lead'))}</p><div id="stLobby">${lobbyPrefsHTML('stLobbyPrefs')}</div>`],
    ['privacy', '🔐', t('set.sec.privacy'), `<p class="muted small">${esc(t('set.privacy.lead'))}</p>
      <div class="set-grid"><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-open="export">📤 ${esc(t('dc.exp.title'))}</button><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-open="import">📥 ${esc(t('dc.imp.title'))}</button><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-open="privacy">🔐 ${esc(t('dc.priv.title'))}</button>${Person.local() ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="stShare">🔗 ${esc(t('home.set.share'))}</button>` : ''}</div>`],
    ['help', '🩺', t('set.sec.help'), `<div class="set-grid"><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="stIntro">👋 ${esc(t('home.set.intro'))}</button><a class="ui-btn ui-btn--ghost ui-btn--sm" href="test.html">🩺 ${esc(t('home.info.firebase'))}</a><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-open="diag">🧪 ${esc(t('dc.diag.title'))}</button>${isDemo ? `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="stDemo">🧪 ${esc(t('demo.exit'))}</button>` : `<button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="stDemo">🧪 ${esc(t('demo.try'))}</button>`}<a class="ui-btn ui-btn--ghost ui-btn--sm" href="setup.html">🛠️ ${esc(t('setup.open'))}</a><button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" id="stUpd">🔄 ${esc(t('upd.check'))}</button></div>
      <p class="muted small">${esc(t('demo.lead'))}</p><p class="muted small" id="stVer"></p>`]
  ];
  const el = Sheet.open(`
    ${head(`⚙️ ${esc(t('home.nav.settings'))}`)}
    <nav class="set-nav" aria-label="${esc(t('set.nav'))}">${secs.map(([id, ico, title]) => `<a href="#set-${id}" data-set-jump="${id}">${ico} <span>${esc(title)}</span></a>`).join('')}</nav>
    <div class="set-body">${secs.map((x) => sec(...x)).join('')}</div>`, { wide: true, cls: 'sheet--settings' });
  el.addEventListener('click', (e) => {
    const j = e.target.closest('[data-set-jump]');
    if (j) { e.preventDefault(); $(`#set-${j.dataset.setJump}`, el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const d = e.target.closest('[data-density]');
    if (d) { setDensity(d.dataset.density); el.querySelectorAll('[data-density]').forEach((b) => b.setAttribute('aria-pressed', String(b === d))); }
  });
  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-nccat]');
    if (c) Notices.setCat(c.dataset.nccat, c.checked);
    if (e.target.id === 'stRemind') setReminderLead(e.target.value);
  });
  bindLobbyPrefs($('#stLobby', el), () => { $('#stLobby', el).innerHTML = lobbyPrefsHTML('stLobbyPrefs'); });
  $('#stUpd', el).addEventListener('click', () => { Sheet.close(); openUpdates(true); });
  $('#stIntro', el).addEventListener('click', () => { Sheet.close(); showIntro(true); });
  $('#stShare', el)?.addEventListener('click', () => { Sheet.close(); openShare(); });
  $('#stDemo', el).addEventListener('click', () => { if (isDemo) { if (confirm(t('demo.exitAsk'))) stopDemo(); } else if (confirm(t('demo.startAsk'))) startDemo(); });
  $('#stVer', el).textContent = $('#hubVer').textContent;
  bindTipsSettings(el);
}
$('#hubSettings').addEventListener('click', openSettings);

const INTRO = [
  { ico: '📺', k: 'tv' },
  { ico: '📱', k: 'phone' },
  { ico: '👤', k: 'profile' }
];
function showIntro(force = false) {
  if (!force && ls.get('gnr_intro_done') === '1') return;
  let i = 0;
  const el = Sheet.open('<div id="inBody"></div>', { onClose: () => ls.set('gnr_intro_done', '1') });
  const paint = () => {
    const s = INTRO[i];
    $('#inBody', el).innerHTML = `
      <div class="intro-step"><span class="intro-ico" aria-hidden="true">${s.ico}</span><h2>${esc(t(`home.intro.${s.k}.t`))}</h2><p>${esc(t(`home.intro.${s.k}.d`))}</p></div>
      <div class="intro-dots" aria-hidden="true">${INTRO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="hub-row hub-row--end"><button type="button" class="link-btn" data-close>${esc(t('home.intro.skip'))}</button><button type="button" class="btn" id="inNext">${esc(i < INTRO.length - 1 ? t('home.intro.next') : (Person.local() ? t('home.intro.start') : t('home.me.createShort')))}</button></div>`;
    $('#inNext', el).addEventListener('click', () => {
      if (i < INTRO.length - 1) { i++; paint(); return; }
      Sheet.close();
      if (!Person.local() && isConfigured) openEditor(null);
    });
  };
  paint();
}

// Cambio di lingua: si ridisegna tutto senza ricaricare (nessun dato si perde).
window.addEventListener('gnr-lang', (e) => {
  e.preventDefault();
  applyStatic(document);
  paintStatic();
  paintAll();
  if (H.appPanel) paintApp();
  if (H.appFull && H.appFull !== true) { H.appFull = null; if (H.view === 'altro') mountAppFull(); }
  if (Sheet.el) { const reopen = Sheet.el.querySelector('#hubLang'); Sheet.close(); if (reopen) openSettings(); }
  paintBack();
});

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------

function paintStatic() {
  const v = t('home.side.version', { v: APP_VERSION });
  $('#hubVer').textContent = v;
  $('#infoVer').textContent = `${v} · ${t('common.languageName')}`;
  if ($('#scanBtn').hidden === false) $('#codeLabel').textContent = t('home.join.codeOr');
}

// ---------------------------------------------------------------------------
// Centro avvisi (2.1, idea 72)
// ---------------------------------------------------------------------------

function paintNoticeCount() {
  const n = Notices.list().length;
  const c = $('#ncCount');
  if (!c) return;
  c.hidden = !n;
  c.textContent = n > 9 ? '9+' : String(n);
}
Notices.on(paintNoticeCount);
function openNotices() {
  const el = Sheet.open(`${head(`🔔 ${esc(t('nc.title'))}`)}<div id="ncBody">${noticesHTML()}</div>`);
  const body = $('#ncBody', el);
  bindNotices(body, () => { body.innerHTML = noticesHTML(); });
}
/** Prossime serate dei tuoi gruppi (entro 7 giorni): una lettura all'apertura, niente ascolti fissi. */
async function checkNextNights() {
  const groups = { ...(ls.json('gnr_profiles', {}) || {}), ...(Person.data?.groups || {}) };
  Notices.clearCat('nights');
  for (const gid of Object.keys(groups).filter((g) => /^[A-Z0-9]{6}$/.test(g)).slice(0, 6)) {
    const nx = (await get(groupRef(gid, 'next')).catch(() => null))?.val();
    const at = Number(nx?.at) || 0;
    if (!at || at < Date.now() || at - Date.now() > 7 * 86400000) continue;
    const info = (await get(groupRef(gid, 'info/name')).catch(() => null))?.val() || '';
    Notices.put({ id: `night:${gid}`, cat: 'nights', icon: '📅', title: t('nc.night', { group: info || gid }), sub: `${fmtDate(at, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${nx.place ? ` · ${nx.place}` : ''}`, sig: String(at) });
  }
}

function paintAll() {
  paintMe(Person.data);
  paintArmadi();
  paintGroups();
  paintHistory();
}

async function boot() {
  paintStatic();
  showView(viewFromHash());
  paintApp();
  const cached = Person.cached();
  paintMe(cached);
  paintArmadi();
  paintHistory();
  renderGroups();
  if (!isConfigured) { paintMe(null); return; }
  let readyResolve;
  H.ready = new Promise((r) => { readyResolve = r; });
  try {
    H.uid = await connect();
    Person.uid = H.uid;
  } catch (err) {
    $('#hubMe').innerHTML = `<p class="form-error">${esc(explainError(err))}</p>`;
    return;
  }
  readyResolve();
  // Link del profilo (QR "Altri dispositivi") e vecchi link del codice personale.
  const hashLink = parseLinkCode(location.hash);
  const legacy = normalizeCode(param('profilo'), 6);
  if (hashLink || legacy) history.replaceState(null, '', location.pathname);
  // Memoria del browser svuotata: il database ricorda i profili dei gruppi usati da questo dispositivo.
  if (!Person.local()) {
    try {
      const remote = (await get(dbRef(`deviceProfiles/${H.uid}`))).val() || {};
      const profs = ls.json('gnr_profiles', {}) || {};
      let found = 0;
      for (const [gid, mid] of Object.entries(remote)) if (CODE6.test(gid) && CODE6.test(mid) && !profs[gid]) { profs[gid] = mid; found++; }
      if (found) { ls.set('gnr_profiles', JSON.stringify(profs)); toast(t('home.found', { n: found })); }
    } catch { /* regole vecchie o rete assente */ }
  }
  let state = null;
  try {
    state = await Person.load();
    if (!state && !hashLink) state = await Person.migrateLegacy(loadMember).then(() => Person.data).catch(() => null);
  } catch (err) { console.warn('Profilo non caricato', err); state = cached; }
  paintAll();
  paintBack();
  checkLoans().catch(() => {});
  checkNextNights().catch(() => {});
  if (legacy.length === 6) { try { await adoptMember(legacy); paintAll(); } catch (err) { toast(explainError(err), 'warn'); } }
  if (hashLink) askLink(hashLink);
  else if (param('accedi') === '1') { showView('altro'); setTimeout(() => (googleAvailable() ? document.querySelector('#accCard')?.scrollIntoView({ block: 'center' }) : openAccountEmail()), 300); }
  else if (!state) showIntro();
}
boot();
// Avviso "È disponibile GameNight Show …" nell'app, e link diretto alla sezione (index.html#aggiornamenti)
if (location.hash === '#aggiornamenti') { history.replaceState(null, '', location.pathname); openUpdates(); } else {
  autoCheck({ onOpen: () => openUpdates() }).then((st) => {
    if (st?.status === 'update') Notices.put({ id: 'app:update', cat: 'app', icon: '⬇️', title: t('nc.update', { v: st.release?.version || '' }), href: '#aggiornamenti', sig: st.release?.version || '' });
  }).catch(() => {});
}
$('#hubNotices')?.addEventListener('click', openNotices);
