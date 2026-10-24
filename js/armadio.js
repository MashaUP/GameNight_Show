// Pagina dell'armadio (1.2 "Armadio organizzato"): consultare, cercare, organizzare e condividere la collezione.
// armadio.html?a=CODICE        armadio (modifica per proprietario e collaboratori, sola lettura per gli altri)
// armadio.html?p=TOKEN         catalogo pubblico in sola lettura (link condiviso)
// &g=ID apre la scheda di un gioco (QR delle etichette), &pos=… filtra uno scaffale, #inv=CODICE invito, #ak=CHIAVE chiave
import {
  isConfigured, connect, armadioRef, dbRef, groupRef, get, set, update, remove, onValue, explainError
} from './fb.js';
import {
  $, esc, param, normalizeCode, cleanName, toast, applyTheme, registerSW, ErrLog, gameImage, gameImageFromUrl, gameImageHTML,
  qrSVG, downloadFile, randomCode, installImageFallback, showFatal, showNotConfigured, themeSwitchHTML
} from './util.js';
import { GAME_STATUS, GAME_MODES, tagsOf } from './stats.js';
import { publicUrl } from './native.js';
import { Person } from './person.js';
import { exportLabels } from './report.js';
import {
  LOC_KEYS, LOC_LABELS, LOC_HINTS, cleanLoc, hasLoc, locText, shelfKey, normTitle, duplicatePairs, duplicateIds, DUP_KINDS,
  CHECK_FIELDS, missingFields, expansionsOf, available, applyFilters, activeFilters, SORTS, sortItems,
  fullImage, saveGame, newGameId, migrateImages, logEvent, diffSummary, OPS, trashGame, restoreGame, purgeGame,
  loansOf, activeLoans, isOverdue, lendGame, updateLoan, returnGame, DAY, toCSV, toJSON, readImportFile, planImport,
  applyImport, undoImport, newToken, pubGame, syncPublic, moveGames, summary, pubFieldsOf, pubIncludes
} from './collection.js';
import { Favs, missingFavs } from './favs.js';
import { initSpatialNav, isTvDevice } from './spatialnav.js';
// Su un televisore (Android TV) le frecce del telecomando spostano il fuoco.
if (isTvDevice()) initSpatialNav();
import { bggEnabled, bggSearch, bggThing, bggToGame, mergePlan, applyMerge, bggIdOf, bggPage, BGG_SITE } from './bgg.js';
import { LocalManuals, manualSearchLinks, isManualUrl } from './manuals.js';
import { t, lang, fmtDate as fmtDateI, fmtNum, langSwitchHTML } from './i18n.js';
// Le voci della cronologia finiscono nel database (dati condivisi): restano in italiano, con i testi del dizionario italiano.
import itArm from './lang/it-arm.js';

ErrLog.install();
applyTheme();
installImageFallback();
registerSW();

const app = $('#app');
const CODE6 = /^[A-Z0-9]{6}$/;
const PAGE = 120;
const A = {
  aid: '', token: '', pub: false, uid: '', info: null, lib: {}, loans: {}, trash: {}, log: {}, share: null,
  admins: {}, adminInfo: {}, uids: {}, invites: {}, role: 'viewer', f: {}, sort: 'name', view: 'grid', tab: 'games',
  sel: new Set(), selecting: false, limit: PAGE, lastSig: '', pubPrev: null, pubFields: pubFieldsOf({ status: true }), undo: null, stops: [], loaded: false
};
const ls = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } }
};
const me = () => Person.data?.info?.name || (A.role === 'owner' ? 'Proprietario' : 'Collaboratore'); // i18n-ok: nome salvato nel database (by, addedBy)
const canEdit = () => A.role === 'owner' || A.role === 'editor';
const canAdd = () => canEdit() || A.role === 'member';
const items = () => Object.entries(A.lib || {}).filter(([, it]) => it?.name).map(([id, it]) => ({ id, ...it }));
const fmtDate = (ts) => (ts ? fmtDateI(ts, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtWhen = (ts) => (ts ? fmtDateI(ts, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
/** Testo del dizionario italiano (per la cronologia nel database), con {parametri} e plurali one/other. */
const tIt = (k, p = {}) => {
  const e = itArm[k];
  const s = e && typeof e === 'object' ? (Number(p.n) === 1 ? e.one : e.other) : e;
  return String(s ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in p ? String(p[x]) : m));
};
/** Peso (difficoltà) nella lingua scelta: 2,5 / 2.5. */
const fmtW = (w) => fmtNum(Number(w));
/** Stato al ritorno di un prestito (codice salvato nel database: ok, incompleto, danneggiato). */
const armHref = (aid, g = '') => `armadio.html?a=${aid}${g ? `&g=${g}` : ''}`; // i18n-ok: indirizzo della pagina
const retState = (s) => ({ incompleto: t('arm.ret.incomplete'), danneggiato: t('arm.ret.damaged') })[s] || s;

// ---------------------------------------------------------------------------
// Finestre (stesse dell'app: dal basso sul telefono, al centro sul computer)
// ---------------------------------------------------------------------------

const Sheet = {
  stack: [],
  open(html, { wide = false, cls = '', onClose } = {}) {
    const el = document.createElement('div');
    el.className = `overlay overlay--sheet am-overlay ${cls}`;
    el.innerHTML = `<div class="card sheet ${wide ? 'sheet--tall am-sheet--wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) this.close(el); });
    this.stack.push({ el, onClose, last: document.activeElement });
    requestAnimationFrame(() => el.querySelector('[autofocus], input:not([type=file]):not([type=checkbox]), select, button:not([data-close])')?.focus({ preventScroll: true }));
    return el;
  },
  close(el) {
    const i = el ? this.stack.findIndex((x) => x.el === el) : this.stack.length - 1;
    if (i < 0) return;
    const [x] = this.stack.splice(i, 1);
    x.el.remove();
    x.onClose?.();
    x.last?.focus?.({ preventScroll: true });
  },
  closeAll() { while (this.stack.length) this.close(); }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && Sheet.stack.length) { e.preventDefault(); Sheet.close(); } });
const head = (title) => `<div class="panel-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">✕</button></div>`;
const busy = async (btn, fn) => {
  if (btn) { btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.innerHTML = '…'; }
  try { return await fn(); } finally { if (btn?.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.txt; } }
};
const userMsg = (err) => (err?.user ? err.message : explainError(err));

// ---------------------------------------------------------------------------
// Avvio: armadio, catalogo pubblico, permessi
// ---------------------------------------------------------------------------

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  A.token = (param('p') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  A.aid = normalizeCode(param('a'), 6);
  A.pub = A.token.length === 16;
  if (!A.pub && !CODE6.test(A.aid)) { showFatal(app, t('arm.boot.notFound'), t('arm.boot.noCode')); return; }
  app.innerHTML = `<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>${esc(t('arm.boot.opening'))}</p></div>`;
  try {
    A.uid = await connect();
    Person.uid = A.uid;
    await Person.load().catch(() => null);
    Favs.adoptLocal().catch(() => {});
  } catch (err) { showFatal(app, t('arm.boot.noConnect'), explainError(err)); return; }
  A.view = ls.get('gnr_am_view', 'grid');
  A.sort = ls.get('gnr_am_sort', 'name');
  if (A.pub) return bootPublic();
  let info;
  try { info = (await get(armadioRef(A.aid, 'info'))).val(); } catch (err) { showFatal(app, t('arm.boot.noRead'), explainError(err)); return; }
  if (!info) { showFatal(app, t('arm.boot.notFound'), t('arm.boot.gone')); return; }
  A.info = info;
  await claimAccess(info);
  // Dall'avviso della home: apre direttamente il prestito (scheda Prestiti + "Restituito").
  const lid = param('loan');
  if (lid && canEdit()) { A.pendingLoan = lid; A.tab = 'loans'; }
  mount();
  watch();
  const pos = param('pos');
  if (pos) { A.f = { shelf: pos }; paintGames(); }
  const gid = param('g');
  if (gid) setTimeout(() => openGame(gid), 300);
  if (param('add') === '1' && canAdd()) setTimeout(() => openEditor(null), 300);
  // Ricaricando la pagina non si riapre la finestra di prima
  if (gid || pos || param('add') || lid) history.replaceState(null, '', `${location.pathname}?a=${A.aid}`);
}

const keyStore = () => `gnr_akey_${A.aid}`;
/** Diventa collaboratore con la chiave dell'armadio (QR "Aggiungi dal telefono", profilo) o con un invito. */
async function claimAccess(info) {
  const hash = location.hash || '';
  const hashKey = normalizeCode((hash.match(/ak=([A-Za-z0-9-]+)/) || [])[1] || '', 8);
  const inv = normalizeCode((hash.match(/inv=([A-Za-z0-9-]+)/) || [])[1] || '', 10);
  if (hashKey || inv) history.replaceState(null, '', location.pathname + location.search);
  const val = async (p) => (await get(armadioRef(A.aid, p)).catch(() => null))?.val();
  if (info.ownerUid === A.uid) {
    A.role = 'owner';
    // Come sulla TV: il proprietario ha sempre la chiave (serve al QR "Aggiungi dal telefono" e agli altri suoi dispositivi)
    let k0 = '';
    try { k0 = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ }
    if (!k0) {
      const k = randomCode(8);
      try { await set(dbRef(`armadioKeys/${A.aid}`), k); localStorage.setItem(keyStore(), k); } catch { /* niente */ }
    }
  }
  else if (await val(`admins/${A.uid}`) === true) A.role = 'editor';
  else {
    let key = hashKey;
    if (!key) { try { key = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ } }
    if (key) {
      try {
        await set(dbRef(`armadioKeyClaims/${A.aid}/${A.uid}`), key);
        await set(armadioRef(A.aid, `admins/${A.uid}`), true);
        try { localStorage.setItem(keyStore(), key); } catch { /* niente */ }
        A.role = 'editor';
      } catch { /* chiave non valida */ }
    }
    if (A.role === 'viewer' && inv) {
      try {
        await set(dbRef(`armadioInviteClaims/${A.aid}/${A.uid}`), inv);
        // L'invito vale per una sola persona: si prenota prima di usarlo
        await set(armadioRef(A.aid, `invites/${inv}/used`), A.uid);
        await set(armadioRef(A.aid, `admins/${A.uid}`), true);
        A.role = 'editor';
        toast(t('arm.inv.ok', { name: info.name }));
      } catch { toast(t('arm.inv.bad'), 'warn'); }
    }
    if (A.role === 'viewer' && await val(`uids/${A.uid}`) === true) A.role = 'member';
  }
  if (A.role === 'editor') {
    const known = await val(`adminInfo/${A.uid}`);
    if (!known) set(armadioRef(A.aid, `adminInfo/${A.uid}`), { name: (Person.data?.info?.name || 'Dispositivo').slice(0, 40), at: Date.now() }).catch(() => {}); // i18n-ok: nome salvato nel database
  }
  let k = '';
  try { k = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ }
  Person.linkArmadio(A.aid, info.name, canEdit() ? k : '', A.role === 'owner').catch(() => {});
  try {
    const list = JSON.parse(localStorage.getItem('gnr_armadi') || '[]').filter((a) => a?.id !== A.aid);
    localStorage.setItem('gnr_armadi', JSON.stringify([{ id: A.aid, name: info.name }, ...list].slice(0, 12)));
  } catch { /* niente */ }
}

function watch() {
  const on = (p, key, after, fb = {}) => A.stops.push(onValue(armadioRef(A.aid, p), (s) => { A[key] = s.val() ?? fb; after?.(); }, () => {}));
  on('info', 'info', () => { paintHero(); schedulePub(); }, null);
  on('library', 'lib', () => { A.loaded = true; refresh(); schedulePub(); migrateLater(); });
  on('admins', 'admins', () => { if (A.tab === 'tools') paintTab(); });
  on('adminInfo', 'adminInfo', () => { if (A.tab === 'tools') paintTab(); });
  on('uids', 'uids');
  if (canEdit()) {
    on('loans', 'loans', () => {
      refresh();
      if (A.pendingLoan) {
        const lid = A.pendingLoan;
        A.pendingLoan = null;
        if (A.loans?.[lid] && !A.loans[lid].ret) setTimeout(() => openReturn(lid), 200);
        else toast(t('loan.notFound'), 'warn');
      }
    });
    on('trash', 'trash', () => { paintTabs(); if (A.tab === 'trash') paintTab(); });
    on('log', 'log', () => { if (A.tab === 'log') paintTab(); });
    on('share', 'share', () => { loadPubPrev(); if (A.tab === 'tools') paintTab(); }, null);
    if (A.role === 'owner') on('invites', 'invites', () => { if (A.tab === 'tools') paintTab(); });
  }
}
function refresh() { paintHero(); paintTabs(); if (A.tab === 'games') paintGames(); else paintTab(); }

/** Foto vecchie (dentro il gioco) spostate a parte, poche alla volta: l'armadio diventa leggero. */
let migrating = false;
function migrateLater() {
  if (migrating || !canEdit() || !items().some((it) => it.image)) return;
  migrating = true;
  setTimeout(async () => {
    const bar = $('#amMigr');
    const r = await migrateImages(A.aid, A.lib, { max: 40, onStep: (d, tot) => { if (bar) { bar.hidden = false; bar.textContent = t('arm.migr.progress', { d, n: Math.min(tot, 40) }); } } }).catch(() => null);
    if (bar) bar.hidden = true;
    migrating = false;
    if (r?.done) toast(`${t('arm.migr.done', { n: r.done })}${r.left ? t('arm.migr.left', { n: r.left }) : ''}`);
  }, 1500);
}

// Catalogo pubblico: tiene aggiornata la copia in sola lettura (solo i giochi cambiati)
let pubTimer = null;
async function loadPubPrev() {
  if (!A.share?.token) { A.pubPrev = null; return; }
  try {
    const v = (await get(dbRef(`pub/${A.share.token}`))).val();
    A.pubPrev = v?.games || {};
    if (v?.fields) A.pubFields = pubFieldsOf(v.fields);
    schedulePub();
  } catch { A.pubPrev = null; }
}
function schedulePub() {
  if (!canEdit() || !A.share?.token || A.pubPrev === null || !A.loaded) return;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(async () => {
    try {
      await syncPublic(A.share.token, A.aid, A.info, A.lib, A.pubFields, A.pubPrev);
      A.pubPrev = Object.fromEntries(items().filter((it) => pubIncludes(it, A.pubFields)).map((it) => [it.id, pubGame(it, A.pubFields)]));
    } catch { /* riprovo alla prossima modifica */ }
  }, 2500);
}

// ---------------------------------------------------------------------------
// Struttura della pagina
// ---------------------------------------------------------------------------

function mount() {
  app.innerHTML = `
    <main class="phone am">
      <header class="ph-top am-top">
        <a class="btn-sec btn-sec--sm ph-back" href="index.html" id="amBack" aria-label="${esc(t('arm.top.back'))}">←</a>
        <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
        <span class="ph-right"><button type="button" class="ph-home" data-act="theme" aria-label="${esc(t('arm.theme'))}" title="${esc(t('arm.theme'))}">🌐</button><a class="ph-home" href="index.html" aria-label="Home" title="Home">🏠</a></span>
      </header>
      <section class="card am-hero" id="amHero"></section>
      <p class="arm-ro am-migr" id="amMigr" hidden></p>
      <nav class="am-tabs" id="amTabs" aria-label="${esc(t('arm.top.sections'))}"></nav>
      <section id="amBody" class="am-body-sec"></section>
    </main>`;
  window.addEventListener('gnr:back', (e) => {
    e.preventDefault();
    if (A.selecting) { stopSelecting(); return; }
    if (A.tab !== 'games') { A.tab = 'games'; refresh(); return; }
    location.href = 'index.html';
  });
  app.addEventListener('click', onClick);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
  paintHero();
  paintTabs();
  paintTab();
}

function roleLabel() {
  const k = { owner: 'arm.role.owner', editor: 'arm.role.editor', member: 'arm.role.member', viewer: 'arm.role.viewer' }[A.role];
  return k ? t(k) : '';
}

function paintHero() {
  const h = $('#amHero');
  if (!h) return;
  const s = summary(A.lib, A.loans);
  const info = A.pub ? A.pubInfo || {} : A.info || {};
  document.title = `${info.name || t('arm.armadio')} · GameNight Show`;
  h.innerHTML = `
    <div class="am-title">
      <span class="am-emoji" aria-hidden="true">${esc(info.emoji || '📦')}</span>
      <div class="am-title-text">
        <h1 id="amName">${esc(info.name || t('arm.armadio'))}</h1>
        ${info.desc ? `<p class="am-desc">${esc(info.desc)}</p>` : ''}
        <p class="am-meta">${A.pub ? esc(t('arm.hero.pub')) : t('arm.hero.code', { role: roleLabel(), code: esc(A.aid) })}</p>
      </div>
    </div>
    <div class="am-stats">
      <span>${t('arm.hero.games', { n: s.games })}</span>${s.expansions ? `<span>${t('arm.hero.exps', { n: s.expansions })}</span>` : ''}
      ${!A.pub && canEdit() ? `<span class="${s.overdue ? 'is-warn' : ''}">${t('arm.hero.lent', { n: s.lent })}${s.overdue ? t('arm.hero.late', { n: s.overdue }) : ''}</span>` : ''}
      ${s.isNew ? `<span>${t('arm.hero.new', { n: s.isNew })}</span>` : ''}
    </div>
    <div class="am-actions">
      ${canAdd() ? `<button type="button" class="btn" data-act="add">➕ <span>${esc(t('arm.act.add'))}</span></button>` : ''}
      <button type="button" class="btn-sec" data-act="find">📍 <span>${esc(t('arm.act.find'))}</span></button>
      ${A.role === 'owner' ? `<button type="button" class="btn-sec" data-act="editInfo">✏️ <span>${esc(t('arm.act.editInfo'))}</span></button>` : ''}
      ${canEdit() && !A.pub ? `<button type="button" class="btn-sec am-desk-only" data-act="phoneQR">📱 <span>${esc(t('arm.act.phone'))}</span></button>` : ''}
      ${!A.pub ? `<a class="btn-sec" href="host.html?usaArmadio=${esc(A.aid)}">📺 <span>${esc(t('arm.act.night'))}</span></a>` : ''}
    </div>`;
}

function paintTabs() {
  const n = $('#amTabs');
  if (!n) return;
  if (A.pub || !canEdit()) { n.hidden = true; return; }
  n.hidden = false;
  const s = summary(A.lib, A.loans);
  const nt = Object.keys(A.trash || {}).length;
  const tab = (k, l) => `<button type="button" class="am-tab" data-tab="${k}" aria-pressed="${A.tab === k}">${l}</button>`;
  n.innerHTML = tab('games', esc(t('arm.tab.games'))) + tab('loans', `${esc(t('arm.tab.loans'))}${s.lent ? ` <small>${s.lent}</small>` : ''}`) + tab('log', esc(t('arm.tab.log'))) + tab('trash', `${esc(t('arm.tab.trash'))}${nt ? ` <small>${nt}</small>` : ''}`) + tab('tools', esc(t('arm.tab.tools')));
}

function paintTab() {
  const b = $('#amBody');
  if (!b) return;
  if (A.tab === 'games') { mountGames(); return; }
  if (A.tab === 'loans') b.innerHTML = loansHTML();
  else if (A.tab === 'log') b.innerHTML = logHTML();
  else if (A.tab === 'trash') b.innerHTML = trashHTML();
  else if (A.tab === 'tools') b.innerHTML = toolsHTML();
}

// ---------------------------------------------------------------------------
// Giochi: ricerca, filtri, ordinamento, viste, selezione
// ---------------------------------------------------------------------------

function mountGames() {
  const b = $('#amBody');
  const views = [['grid', t('arm.view.grid')], ['list', t('arm.view.list')], ['shelves', t('arm.view.shelves')]];
  b.innerHTML = `
    <div class="am-layout">
      <aside class="am-side" id="amSide" aria-label="${esc(t('arm.f.title'))}"></aside>
      <div class="am-main">
        <div class="am-toolbar">
          <label class="sr-only" for="amSearch">${esc(t('arm.search.label'))}</label>
          <input class="input am-search" id="amSearch" type="search" autocomplete="off" placeholder="${esc(t('arm.search.ph'))}" title="${esc(t('arm.search.title'))}" value="${esc(A.f.text || '')}">
          <button type="button" class="btn-sec am-filter-btn" data-act="filters">⚙️ <span>${esc(t('arm.f.title'))}</span><b id="amFCount"></b></button>
          <label class="sr-only" for="amSort">${esc(t('arm.sort.label'))}</label>
          <select class="input select am-sort" id="amSort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${A.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="seg am-views" role="group" aria-label="${esc(t('arm.view.label'))}">${views.map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${A.view === k}">${l}</button>`).join('')}</div>
          <button type="button" class="btn-sec" data-act="views" title="${esc(t('arm.views.title'))}">⭐ <span>${esc(t('arm.views.btn'))}</span></button>
          ${canEdit() ? `<button type="button" class="btn-sec" data-act="select" aria-pressed="${A.selecting}">☑️ <span>${esc(t('arm.sel.btn'))}</span></button>` : ''}
        </div>
        <div id="amFavs"></div>
        <div class="am-chips" id="amChips"></div>
        <p class="am-count" id="amCount"></p>
        <div id="amList"></div>
      </div>
    </div>
    <div class="am-selbar" id="amSelBar" hidden></div>`;
  paintSide();
  paintGames();
}

function filterOptions() {
  const its = items();
  const uniq = (fn) => [...new Set(its.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  return {
    langs: uniq((it) => it.language), owners: uniq((it) => it.owner), rooms: uniq((it) => it.loc?.room), units: uniq((it) => it.loc?.unit),
    tags: uniq((it) => tagsOf(it).join('\u0001')).join('\u0001').split('\u0001').filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).sort(),
    shelves: uniq((it) => shelfKey(it))
  };
}
function filtersHTML() {
  const f = A.f; const o = filterOptions();
  const sel = (k, opts, empty) => `<select class="input select select--sm" data-f="${k}"><option value="">${empty}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(f[k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const num = (k, ph, min, max) => `<input class="input input--sm" type="number" inputmode="numeric" min="${min}" max="${max}" data-f="${k}" placeholder="${ph}" value="${esc(f[k] ?? '')}">`;
  const chk = (k, l) => `<label class="quick-toggle"><input type="checkbox" data-f="${k}" ${f[k] ? 'checked' : ''}><span>${l}</span></label>`;
  const opt = (arr) => arr.map((v) => [v, v]);
  return `
    <div class="am-fgrid">
      <div class="am-f"><span class="field-label">${esc(t('arm.f.players'))}</span>${num('players', esc(t('arm.f.playersPh')), 1, 20)}</div>
      <div class="am-f"><span class="field-label">${esc(t('arm.f.duration'))}</span><div class="am-pair">${num('durMin', esc(t('arm.f.from')), 1, 600)}${num('durMax', esc(t('arm.f.to')), 1, 600)}</div></div>
      <div class="am-f"><span class="field-label">${esc(t('arm.f.mode'))}</span>${sel('mode', Object.entries(GAME_MODES), esc(t('arm.f.allF')))}</div>
      <div class="am-f"><span class="field-label">${esc(t('arm.f.weight'))}</span><div class="am-pair">${num('wMin', esc(t('arm.f.from')), 1, 5)}${num('wMax', esc(t('arm.f.to')), 1, 5)}</div></div>
      ${!A.pub || A.pubFields.status ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.avail'))}</span>${sel('avail', [['si', t('arm.f.availYes')], ['no', t('arm.f.availNo')]], esc(t('arm.f.allM')))}</div>` : ''}
      ${!A.pub ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.status'))}</span>${sel('status', Object.entries(GAME_STATUS), esc(t('arm.f.allM')))}</div>` : ''}
      ${o.langs.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.lang'))}</span>${sel('lang', opt(o.langs), esc(t('arm.f.allF')))}</div>` : ''}
      ${!A.pub && o.owners.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.owner'))}</span>${sel('owner', opt(o.owners), esc(t('arm.f.allM')))}</div>` : ''}
      ${o.rooms.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.room'))}</span>${sel('room', opt(o.rooms), esc(t('arm.f.allF')))}</div>` : ''}
      ${o.units.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.unit'))}</span>${sel('unit', opt(o.units), esc(t('arm.f.allM')))}</div>` : ''}
      ${o.shelves.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.shelf'))}</span>${sel('shelf', opt(o.shelves), esc(t('arm.f.allM')))}</div>` : ''}
      <div class="am-f"><span class="field-label">${esc(t('arm.f.exp'))}</span>${sel('exp', [['base', t('arm.f.expBase')], ['exp', t('arm.f.expOnly')], ['hasExp', t('arm.f.expHas')]], esc(t('arm.f.allN')))}</div>
      ${o.tags.length ? `<div class="am-f"><span class="field-label">${esc(t('arm.f.tag'))}</span>${sel('tag', opt(o.tags), esc(t('arm.f.allF')))}</div>` : ''}
    </div>
    <div class="am-checks">
      ${!A.pub ? chk('fav', `❤️ ${esc(t('fav.filter'))}`) : ''}
      ${chk('isNew', esc(t('arm.f.isNew')))}
      ${!A.pub ? `${chk('loaned', esc(t('arm.f.loaned')))}${chk('noLoc', esc(t('arm.f.noLoc')))}${chk('incomplete', esc(t('arm.f.incomplete')))}${canEdit() ? chk('dups', esc(t('arm.f.dups'))) : ''}` : ''}
    </div>
    <button type="button" class="link-btn" data-act="clearFilters">${esc(t('arm.f.clear'))}</button>`;
}
function paintSide() {
  const s = $('#amSide');
  if (s) s.innerHTML = `<h2 class="am-side-title">${esc(t('arm.f.title'))}</h2>${filtersHTML()}`;
}

let dupCache = { sig: '', ids: new Set() };
function dupIds() {
  const sig = Object.keys(A.lib || {}).length + ':' + JSON.stringify(Object.values(A.lib || {}).map((it) => [it?.name, it?.edition, it?.ean, it?.dupOk]).slice(0, 2000)).length;
  if (dupCache.sig !== sig) dupCache = { sig, ids: duplicateIds(A.lib) };
  return dupCache.ids;
}
function favIds() { return A.pub ? new Set() : Favs.ids(A.aid); }
function filtered() {
  const favs = favIds();
  const ctx = { lib: A.lib, dupIds: A.f.dups ? dupIds() : null, favs };
  return sortItems(applyFilters(items(), A.f, ctx), A.sort, ctx);
}
/** Riga "I tuoi preferiti": accesso rapido, con la disponibilità reale di ogni gioco. */
function favStripHTML() {
  if (A.pub) return '';
  const ids = favIds();
  if (!ids.size) return '';
  const favs = items().filter((it) => ids.has(it.id)).sort((a, b) => available(b) - available(a) || String(a.name).localeCompare(String(b.name)));
  const gone = missingFavs(ids, A.lib).length;
  if (!favs.length && !gone) return '';
  return `<section class="am-favs" aria-labelledby="amFavT">
      <div class="am-favs-head"><h2 id="amFavT">❤️ ${esc(t('fav.title'))}</h2>
        <button type="button" class="link-btn" data-act="favFilter">${esc(t('fav.onlyFavs'))}</button></div>
      <div class="am-favs-row">${favs.map((it) => `<button type="button" class="am-fav-item ${available(it) ? '' : 'is-off'}" data-open="${esc(it.id)}">${gameImageHTML(it, 'am-img am-img--xs')}<span><b>${esc(it.name)}</b>${available(it) ? '' : `<small>${esc(t('fav.unavailable'))}</small>`}</span></button>`).join('')}</div>
      ${gone ? `<p class="muted small">${esc(t('fav.gone', { n: gone }))} <button type="button" class="link-btn" data-act="favPrune">${esc(t('fav.prune'))}</button></p>` : ''}
    </section>`;
}
function favBtn(id, cls = '') {
  if (A.pub) return '';
  const on = Favs.has(A.aid, id);
  return `<button type="button" class="am-fav ${cls} ${on ? 'is-on' : ''}" data-act="fav" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${esc(on ? t('fav.remove') : t('fav.add'))}" title="${esc(on ? t('fav.remove') : t('fav.add'))}">${on ? '♥' : '♡'}</button>`;
}

function paintGames() {
  const list = $('#amList');
  if (!list) return;
  // Cambiano filtri, ordinamento o vista: si riparte dai primi giochi
  const sig = JSON.stringify([A.f, A.sort, A.view]);
  if (sig !== A.lastSig) { A.lastSig = sig; A.limit = PAGE; }
  const all = items();
  const res = filtered();
  const chips = activeFilters(A.f);
  const fs = $('#amFavs');
  if (fs) fs.innerHTML = chips.length || A.f.text ? '' : favStripHTML();
  $('#amFCount').textContent = chips.length ? ` ${chips.length}` : '';
  $('#amChips').innerHTML = chips.length ? `${chips.map((c) => `<button type="button" class="am-chip" data-unf="${esc(c.k)}" aria-label="${esc(t('arm.f.remove', { label: c.label }))}">${esc(c.label)} <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="link-btn" data-act="clearFilters">${esc(t('arm.f.clearAll'))}</button>` : '';
  const s = summary(A.lib, A.loans);
  $('#amCount').innerHTML = !A.loaded && !A.pub ? esc(t('arm.list.loading'))
    : `${res.length === all.length ? esc(t('arm.n.games', { n: all.length })) : esc(t('arm.list.nOf', { n: res.length, total: all.length }))}${!A.pub && canEdit() && s.incomplete ? ` · <button type="button" class="link-btn" data-act="wizard">🧩 ${esc(t('arm.list.toComplete', { n: s.incomplete }))}</button>` : ''}`;
  list.className = `am-list am-list--${A.view}`;
  if (!all.length) {
    list.innerHTML = `<div class="empty am-empty"><p class="empty-title">${esc(t('arm.list.empty'))}</p><p class="muted">${esc(canAdd() ? t('arm.list.emptyAdd') : t('arm.list.emptyView'))}</p>${canAdd() ? `<button type="button" class="btn" data-act="add">➕ ${esc(t('arm.act.add'))}</button>` : ''}</div>`;
  } else if (!res.length) {
    list.innerHTML = `<div class="empty am-empty"><p class="empty-title">${esc(t('arm.list.noMatch'))}</p><button type="button" class="btn-sec" data-act="clearFilters">${esc(t('arm.f.clear'))}</button></div>`;
  } else {
    // Con armadi grandi si disegnano i primi giochi e gli altri a richiesta: la pagina resta reattiva
    const shown = res.slice(0, A.limit);
    const more = res.length - shown.length;
    const moreBtn = more > 0 ? `<button type="button" class="btn-sec btn-block am-more" data-act="more">${esc(t('arm.list.more', { n: Math.min(more, PAGE), total: more }))}</button>` : '';
    if (A.view === 'list') list.innerHTML = listHTML(shown) + moreBtn;
    else if (A.view === 'shelves') list.innerHTML = shelvesHTML(shown) + moreBtn;
    else list.innerHTML = shown.map(cardHTML).join('') + moreBtn;
  }
  paintSelBar();
}

function badges(it) {
  const out = [];
  const min = it.minPlayers; const max = it.maxPlayers;
  if (min || max) out.push(`👥 ${min && max ? (min === max ? min : `${min}–${max}`) : (min ? `${min}+` : `≤${max}`)}`);
  if (it.duration) out.push(`⏱️ ${it.duration}′`);
  if (it.weight) out.push(`🧠 ${fmtW(it.weight)}`);
  return out;
}
function availHTML(it) {
  if (A.pub) return A.pubFields.status ? (it.avail === false ? `<span class="am-tag am-tag--off">${esc(t('arm.tag.unavail'))}</span>` : `<span class="am-tag am-tag--ok">${esc(t('arm.tag.avail'))}</span>`) : '';
  const copies = Number(it.copies) || 1;
  if (it.loanId && copies > 1 && it.status !== 'prestato') {
    const n = canEdit() ? loansOf(A.loans, it.id).filter((l) => !l.ret).length : 1;
    return `<span class="am-tag am-tag--ok">${esc(t('arm.tag.copiesLent', { n: n || 1, total: copies }))}</span>`;
  }
  if (it.loanId || it.status === 'prestato') {
    const l = A.loans?.[it.loanId];
    const late = l && isOverdue(l);
    return `<span class="am-tag ${late ? 'am-tag--late' : 'am-tag--off'}">🤝 ${canEdit() && (l?.to || it.loanTo) ? esc(t('arm.tag.lentTo', { name: l?.to || it.loanTo })) : esc(t('arm.tag.lent'))}${late ? esc(t('arm.tag.late')) : ''}</span>`;
  }
  if (it.status && it.status !== 'posseduto') return `<span class="am-tag am-tag--off">${esc(GAME_STATUS[it.status] || it.status)}</span>`;
  return '';
}
function cardHTML(it) {
  const base = it.baseId ? (A.lib?.[it.baseId]?.name) : '';
  const exps = expansionsOf(A.lib, it.id).length;
  const sel = A.sel.has(it.id);
  return `
    <article class="am-card ${sel ? 'is-sel' : ''}" data-open="${esc(it.id)}">
      ${A.selecting ? `<label class="am-check" data-nopen><input type="checkbox" data-sel="${esc(it.id)}" ${sel ? 'checked' : ''} aria-label="${esc(t('arm.sel.one', { name: it.name }))}"></label>` : ''}
      ${gameImageHTML(it, 'am-img')}
      ${favBtn(it.id, 'am-fav--card')}
      <div class="am-card-body">
        <b class="am-name">${esc(it.name)}</b>
        ${it.edition || base ? `<small class="muted">${base ? `🧩 ${esc(t('arm.card.expOf', { name: base }))}` : ''}${it.edition ? `${base ? ' · ' : ''}${esc(it.edition)}` : ''}</small>` : ''}
        <span class="am-badges">${badges(it).map((b) => `<span>${b}</span>`).join('')}${exps ? `<span>🧩 ${exps}</span>` : ''}</span>
        <span class="am-tags">${it.isNew ? `<span class="am-tag am-tag--new">${esc(t('arm.card.new'))}</span>` : ''}${availHTML(it)}${(it.copies || 1) > 1 ? `<span class="am-tag">×${it.copies}</span>` : ''}</span>
        ${hasLoc(it) ? `<small class="am-loc">📍 ${esc(locText(it.loc))}${it.locCheck ? ` <b class="am-warn">${esc(t('arm.card.locCheck'))}</b>` : ''}</small>` : ''}
      </div>
    </article>`;
}
function listHTML(res) {
  return `<div class="am-table" role="table" aria-label="${esc(t('arm.table.label'))}">
    <div class="am-tr am-th" role="row"><span role="columnheader"></span><span role="columnheader">${esc(t('arm.table.game'))}</span><span role="columnheader">${esc(t('arm.table.players'))}</span><span role="columnheader">${esc(t('arm.table.duration'))}</span><span role="columnheader">${esc(t('arm.table.loc'))}</span><span role="columnheader">${esc(t('arm.table.status'))}</span></div>
    ${res.map((it) => `
    <div class="am-tr ${A.sel.has(it.id) ? 'is-sel' : ''}" role="row" data-open="${esc(it.id)}">
      <span role="cell" class="am-td-img">${A.selecting ? `<label class="am-check am-check--inline" data-nopen><input type="checkbox" data-sel="${esc(it.id)}" ${A.sel.has(it.id) ? 'checked' : ''} aria-label="${esc(t('arm.sel.one', { name: it.name }))}"></label>` : ''}${gameImageHTML(it, 'am-img am-img--xs')}</span>
      <span role="cell" class="am-td-name">${favBtn(it.id, 'am-fav--inline')}<b>${esc(it.name)}</b>${it.baseId ? `<small>🧩 ${esc(A.lib?.[it.baseId]?.name || t('arm.table.exp'))}</small>` : ''}${it.isNew ? `<small>${esc(t('arm.table.new'))}</small>` : ''}</span>
      <span role="cell">${it.minPlayers || it.maxPlayers ? `${it.minPlayers || '?'}–${it.maxPlayers || '?'}` : '<span class="muted">—</span>'}</span>
      <span role="cell">${it.duration ? `${it.duration}′` : '<span class="muted">—</span>'}</span>
      <span role="cell" class="am-td-loc">${hasLoc(it) ? esc(locText(it.loc)) : '<span class="muted">—</span>'}</span>
      <span role="cell">${availHTML(it) || `<span class="am-tag am-tag--ok">${esc(t('arm.tag.avail'))}</span>`}</span>
    </div>`).join('')}</div>`;
}
function shelvesHTML(res) {
  const groups = new Map();
  for (const it of res) {
    const k = shelfKey(it) || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const keys = [...groups.keys()].sort((a, b) => (!a) - (!b) || a.localeCompare(b, 'it'));
  return keys.map((k) => `
    <section class="am-shelf">
      <div class="am-shelf-head"><h3>${k ? `📍 ${esc(k)}` : esc(t('arm.shelf.noLoc'))}</h3><span class="muted">${esc(t('arm.n.games', { n: groups.get(k).length }))}</span>
        ${k && !A.pub ? `<button type="button" class="btn-sec btn-sec--sm" data-shelflabel="${esc(k)}">🏷️ <span>${esc(t('arm.shelf.label'))}</span></button>` : ''}
        ${!k && canEdit() ? `<button type="button" class="btn-sec btn-sec--sm" data-act="bulkNoLoc">📍 <span>${esc(t('arm.shelf.assign'))}</span></button>` : ''}
      </div>
      <div class="am-shelf-items">${groups.get(k).map((it) => `
        <button type="button" class="am-shelf-item ${A.sel.has(it.id) ? 'is-sel' : ''}" data-open="${esc(it.id)}" ${A.selecting ? `aria-pressed="${A.sel.has(it.id)}"` : ''}>
          ${A.selecting ? `<span class="am-tick" aria-hidden="true">${A.sel.has(it.id) ? '☑️' : '⬜'}</span>` : ''}
          ${gameImageHTML(it, 'am-img am-img--spine')}<span><b>${esc(it.name)}</b>${it.loc?.box ? `<small>${esc(it.loc.box)}</small>` : ''}</span>${availHTML(it)}
        </button>`).join('')}</div>
    </section>`).join('');
}

function paintSelBar() {
  const bar = $('#amSelBar');
  if (!bar) return;
  document.body.classList.toggle('am-selecting', A.selecting);
  if (!A.selecting) { bar.hidden = true; return; }
  for (const id of [...A.sel]) if (!A.lib?.[id]) A.sel.delete(id);
  const n = A.sel.size;
  bar.hidden = false;
  bar.innerHTML = `
    <span class="am-sel-n">${t('arm.sel.count', { n })}</span>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selAll">${esc(t('arm.sel.all'))}</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selNone" ${n ? '' : 'disabled'}>${esc(t('arm.sel.none'))}</button>
    <button type="button" class="btn btn-sm" data-act="bulk" ${n ? '' : 'disabled'}>✏️ ${esc(t('arm.sel.edit'))}</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selLabels" ${n ? '' : 'disabled'}>🏷️ ${esc(t('arm.sel.labels'))}</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selMove" ${n ? '' : 'disabled'}>🚚 ${esc(t('arm.sel.move'))}</button>
    <button type="button" class="btn-sec btn-sec--sm am-danger" data-act="selTrash" ${n ? '' : 'disabled'}>🗑️ ${esc(t('arm.sel.trash'))}</button>
    <button type="button" class="link-btn" data-act="select">${esc(t('arm.sel.done'))}</button>`;
}
function stopSelecting() { A.selecting = false; A.sel.clear(); mountGames(); }

// ---------------------------------------------------------------------------
// Eventi
// ---------------------------------------------------------------------------

let searchTimer = null;
function onInput(e) {
  // Con centinaia di giochi non si ridisegna a ogni lettera: si aspetta una breve pausa
  if (e.target.id === 'amSearch') { A.f.text = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(paintGames, items().length > 150 ? 180 : 60); return; }
  const fk = e.target.dataset?.f;
  if (fk && e.target.type === 'number') { const v = Number(e.target.value) || null; if (v) A.f[fk] = v; else delete A.f[fk]; paintGames(); }
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'amSort') { A.sort = t.value; ls.set('gnr_am_sort', A.sort); paintGames(); return; }
  if (t.dataset?.sel) { if (t.checked) A.sel.add(t.dataset.sel); else A.sel.delete(t.dataset.sel); t.closest('.am-card, .am-tr, .am-shelf-item')?.classList.toggle('is-sel', t.checked); paintSelBar(); return; }
  const fk = t.dataset?.f;
  // I numeri sono già applicati mentre si scrive: ridisegnare all'uscita dal campo
  // sposterebbe sotto il dito il pulsante appena toccato (per esempio un filtro da togliere).
  if (fk && t.type === 'number') return;
  if (fk) {
    if (t.type === 'checkbox') { if (t.checked) A.f[fk] = true; else delete A.f[fk]; }
    else if (t.type !== 'number') { if (t.value) A.f[fk] = t.value; else delete A.f[fk]; }
    syncFilterInputs();
    paintGames();
  }
}
/** I filtri compaiono sia nel pannello laterale sia nella finestra: restano allineati. */
function syncFilterInputs() {
  document.querySelectorAll('[data-f]').forEach((el) => {
    const v = A.f[el.dataset.f];
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (document.activeElement !== el) el.value = v ?? '';
  });
}

function onClick(e) {
  const t = e.target;
  if (t.closest('[data-nopen]') && !t.closest('button[data-act]')) return;
  const tab = t.closest('[data-tab]');
  if (tab) { A.tab = tab.dataset.tab; if (A.tab !== 'games') { A.selecting = false; document.body.classList.remove('am-selecting'); } paintTabs(); paintTab(); return; }
  const view = t.closest('[data-view]');
  if (view) { A.view = view.dataset.view; ls.set('gnr_am_view', A.view); view.parentElement.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === view))); paintGames(); return; }
  const unf = t.closest('[data-unf]');
  if (unf) { delete A.f[unf.dataset.unf]; syncFilterInputs(); paintGames(); return; }
  const open = t.closest('[data-open]');
  if (open && !t.closest('[data-act]')) {
    if (A.selecting) { const id = open.dataset.open; if (A.sel.has(id)) A.sel.delete(id); else A.sel.add(id); paintGames(); return; }
    openGame(open.dataset.open); return;
  }
  const sl = t.closest('[data-shelflabel]');
  if (sl) { const k = sl.dataset.shelflabel; printLabels(items().filter((it) => shelfKey(it) === k), { shelf: k }); return; }
  const a = t.closest('[data-act]');
  if (a) act(a.dataset.act, a, e);
}
document.addEventListener('click', (e) => {
  // Azioni dentro le finestre (che non sono dentro #app)
  if (!e.target.closest('.am-overlay')) return;
  const open = e.target.closest('[data-open]');
  if (open && !e.target.closest('[data-act]')) { openGame(open.dataset.open); return; }
  const a = e.target.closest('[data-act]');
  if (a && a.dataset.act !== 'close') act(a.dataset.act, a, e);
});
document.addEventListener('change', (e) => {
  if (!e.target.closest('.am-overlay')) return;
  if (e.target.dataset?.f) onChange(e);
});
document.addEventListener('input', (e) => {
  if (!e.target.closest('.am-overlay')) return;
  if (e.target.dataset?.f) onInput(e);
});

function act(name, el) {
  switch (name) {
    case 'add': openEditor(null); break;
    case 'find': openFind(); break;
    case 'editInfo': openInfoEditor(); break;
    case 'filters': Sheet.open(`${head(`⚙️ ${esc(t('arm.f.title'))}`)}${filtersHTML()}<button type="button" class="btn btn-block" data-close>${esc(t('arm.f.show', { n: filtered().length }))}</button>`, { cls: 'am-filters-sheet' }); break;
    case 'clearFilters': A.f = { text: A.f.text || '' }; if (!A.f.text) delete A.f.text; syncFilterInputs(); paintGames(); break;
    case 'views': openViews(); break;
    case 'select': A.selecting = !A.selecting; if (!A.selecting) A.sel.clear(); mountGames(); break;
    case 'more': A.limit += PAGE; paintGames(); break;
    case 'selAll': filtered().forEach((it) => A.sel.add(it.id)); paintGames(); break;
    case 'selNone': A.sel.clear(); paintGames(); break;
    case 'bulk': openBulk([...A.sel]); break;
    case 'bulkNoLoc': A.selecting = true; items().filter((it) => !hasLoc(it)).forEach((it) => A.sel.add(it.id)); mountGames(); openBulk([...A.sel], { focus: 'loc' }); break;
    case 'selLabels': printLabels(items().filter((it) => A.sel.has(it.id))); break;
    case 'selMove': openMove([...A.sel]); break;
    case 'selTrash': bulkTrash([...A.sel]); break;
    case 'wizard': openWizard(); break;
    case 'dups': openDups(); break;
    case 'export-json': exportJSON(); break;
    case 'export-csv': exportCSV(); break;
    case 'import': $('#amImport')?.click(); break;
    case 'labels-all': printLabels(filtered()); break;
    case 'share': openShare(); break;
    case 'invite': createInvite(el); break;
    case 'newLoan': pickGameForLoan(); break;
    case 'renewKey': renewKey(el); break;
    case 'phoneQR': openPhoneQR(); break;
    case 'fav': {
      const id = el.dataset.id;
      Favs.toggle(A.aid, id).then((on) => { toast(on ? t('fav.added') : t('fav.removed')); paintGames(); document.querySelectorAll(`.am-fav[data-id="${CSS.escape(id)}"]`).forEach((b) => { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '♥' : '♡'; b.setAttribute('aria-label', on ? t('fav.remove') : t('fav.add')); }); })
        .catch((err) => toast(explainError(err), 'error'));
      break;
    }
    case 'favFilter': A.f.fav = true; syncFilterInputs(); paintGames(); break;
    case 'favPrune': Favs.prune(A.aid, A.lib).then((n) => { toast(t('fav.pruned', { n })); paintGames(); }).catch((err) => toast(explainError(err), 'error')); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Scheda del gioco
// ---------------------------------------------------------------------------

async function openGame(id) {
  const it = A.lib?.[id] ? { id, ...A.lib[id] } : null;
  if (!it) { toast(t('arm.game.gone'), 'warn'); return; }
  const base = it.baseId ? A.lib?.[it.baseId] : null;
  const exps = expansionsOf(A.lib, id);
  const myLoans = A.pub ? [] : loansOf(A.loans, id);
  const actAll = myLoans.filter((l) => !l.ret);
  const canLend = actAll.length < (Number(it.copies) || 1) && (!it.status || it.status === 'posseduto' || it.status === 'prestato');
  const log = A.pub || !canEdit() ? [] : Object.values(A.log || {}).filter((ev) => ev.item === id).sort((a, b) => b.at - a.at).slice(0, 8);
  const row = (k, v) => (v ? `<div class="am-kv"><span>${k}</span><b>${v}</b></div>` : '');
  const el = Sheet.open(`
    ${head(`${esc(it.name)} ${favBtn(id, 'am-fav--head')}`)}
    <div class="am-sheet-grid">
      <div class="am-sheet-img" id="amBig">${gameImageHTML(it, 'am-img am-img--big')}</div>
      <div class="am-sheet-info">
        ${it.orig || it.edition || it.year || it.publisher ? `<p class="muted">${[it.orig && `“${esc(it.orig)}”`, it.edition && esc(it.edition), it.year, it.publisher && esc(it.publisher)].filter(Boolean).join(' · ')}</p>` : ''}
        <div class="am-tags">${it.isNew ? `<span class="am-tag am-tag--new">${esc(t('arm.game.new'))}</span>` : ''}${availHTML(it) || (A.pub && !A.pubFields.status ? '' : `<span class="am-tag am-tag--ok">✅ ${esc(t('arm.tag.avail'))}</span>`)}${(it.copies || 1) > 1 ? `<span class="am-tag">${esc(t('arm.game.copies', { n: it.copies }))}</span>` : ''}</div>
        <div class="am-kvs">
          ${row(esc(t('arm.table.players')), it.minPlayers || it.maxPlayers ? `${it.minPlayers || '?'}–${it.maxPlayers || '?'}` : '')}
          ${row(esc(t('arm.table.duration')), it.duration ? esc(t('arm.game.minutes', { n: it.duration })) : '')}
          ${row(esc(t('arm.f.mode')), it.mode ? esc(GAME_MODES[it.mode] || it.mode) : '')}
          ${row(esc(t('arm.game.weight')), it.weight ? `${fmtW(it.weight)} / 5` : '')}
          ${row(esc(t('arm.f.lang')), esc(it.language || ''))}
          ${!A.pub ? row(esc(t('arm.f.owner')), esc(it.owner || '')) : ''}
          ${!A.pub ? row(esc(t('arm.game.acq')), it.acq ? fmtDateI(it.acq, { day: 'numeric', month: 'numeric', year: 'numeric' }) : '') : ''}
          ${tagsOf(it).length ? row(esc(t('arm.game.tags')), tagsOf(it).map((tg) => `#${esc(tg)}`).join(' ')) : ''}
        </div>
      </div>
    </div>
    <section class="am-sec">
      <h3>📍 ${esc(t('arm.game.where'))}</h3>
      ${A.pub && !A.pubFields.loc ? `<p class="muted">${esc(t('arm.game.locHidden'))}</p>`
        : hasLoc(it) ? `<p class="am-where">${esc(locText(it.loc))}${it.locCheck ? ` <b class="am-warn">${esc(t('arm.game.locRecheck'))}</b>` : ''}</p>`
          : `<p class="am-warn">${esc(t('arm.game.noLoc'))}</p>${canEdit() ? `<button type="button" class="btn-sec btn-sec--sm" data-edit="${esc(id)}" data-focus="loc">📍 ${esc(t('arm.game.setLoc'))}</button>` : ''}`}
    </section>
    ${base ? `<section class="am-sec"><h3>🧩 ${esc(t('arm.game.expOf'))}</h3><button type="button" class="am-mini" data-open="${esc(it.baseId)}">${gameImageHTML({ ...base }, 'am-img am-img--xs')}<b>${esc(base.name)}</b>${hasLoc(base) && (!A.pub || A.pubFields.loc) ? `<small>📍 ${esc(locText(base.loc))}</small>` : ''}</button></section>` : ''}
    ${exps.length ? `<section class="am-sec"><h3>🧩 ${esc(t('arm.game.exps', { n: exps.length }))}</h3><div class="am-minis">${exps.map((x) => `<button type="button" class="am-mini" data-open="${esc(x.id)}">${gameImageHTML(x, 'am-img am-img--xs')}<b>${esc(x.name)}</b><small>${hasLoc(x) && (!A.pub || A.pubFields.loc) ? `📍 ${esc(locText(x.loc))}` : (!A.pub ? esc(t('arm.game.noLocLow')) : '')}${(!A.pub && (x.loanId || x.status === 'prestato')) ? ` · 🤝 ${esc(t('arm.game.onLoanLow'))}` : ''}</small></button>`).join('')}</div></section>` : ''}
    ${it.rules ? `<section class="am-sec"><h3>📖 ${esc(t('arm.game.rules'))}</h3><p class="am-pre">${esc(it.rules)}</p></section>` : ''}
    ${it.setup ? `<section class="am-sec"><h3>🧰 ${esc(t('arm.game.setup'))}</h3><p class="am-pre">${esc(it.setup)}</p></section>` : ''}
    ${it.video ? `<p><a class="btn-sec btn-sec--sm" href="${esc(it.video)}" target="_blank" rel="noopener noreferrer">▶️ ${esc(t('arm.game.video'))}</a></p>` : ''}
    ${manualSectionHTML(it)}
    ${bggIdOf(it.extId) ? `<p class="am-bgg-credit"><a href="${esc(bggPage(bggIdOf(it.extId)))}" target="_blank" rel="noopener noreferrer">🎲 ${esc(t('bgg.page'))}</a> <span class="muted small">· ${esc(t('bgg.credit'))}</span></p>` : ''}
    ${!A.pub && it.note && canEdit() ? `<section class="am-sec"><h3>📝 ${esc(t('arm.game.note'))}</h3><p class="am-pre">${esc(it.note)}</p></section>` : ''}
    ${canEdit() ? `<section class="am-sec"><h3>🤝 ${esc(t('arm.game.loans'))}</h3>${actAll.length ? actAll.map((l) => `<div class="am-loan ${isOverdue(l) ? 'is-late' : ''}"><span class="am-loan-main"><span>${isOverdue(l) ? t('arm.game.late') : ''}${t('arm.game.lentSince', { name: esc(l.to), date: fmtDate(l.start) })}${l.due ? t('arm.game.dueBy', { date: fmtDate(l.due) }) : ''}.</span>${l.note ? `<small>${esc(l.note)}</small>` : ''}</span><button type="button" class="btn-sec btn-sec--sm" data-return="${esc(l.id)}">↩️ ${esc(t('arm.loan.returned'))}</button></div>`).join('') : `<p class="muted">${esc(t('arm.game.noLoans'))}</p>`}
      ${myLoans.filter((l) => l.ret).length ? `<details class="hub-details"><summary>${esc(t('arm.game.loanHistory', { n: myLoans.filter((l) => l.ret).length }))}</summary><ul class="am-mini-list">${myLoans.filter((l) => l.ret).map((l) => `<li>${esc(l.to)}: ${fmtDate(l.start)} → ${fmtDate(l.ret)}${l.state && l.state !== 'ok' ? ` · <b>${esc(retState(l.state))}</b>` : ''}${l.note ? ` · ${esc(l.note)}` : ''}</li>`).join('')}</ul></details>` : ''}
    </section>` : ''}
    ${log.length ? `<details class="hub-details am-sec"><summary>🕘 ${esc(t('arm.game.log', { n: log.length }))}</summary><ul class="am-mini-list">${log.map((ev) => `<li><b>${esc(OPS[ev.op] || ev.op)}</b> ${esc(ev.msg || '')} <span class="muted">· ${fmtWhen(ev.at)}${ev.by ? ` · ${esc(ev.by)}` : ''}</span></li>`).join('')}</ul></details>` : ''}
    <div class="am-sheet-actions">
      ${canEdit() ? `<button type="button" class="btn" data-edit="${esc(id)}">✏️ ${esc(t('arm.game.edit'))}</button>
        ${canLend ? `<button type="button" class="btn-sec" data-lend="${esc(id)}">🤝 ${esc(actAll.length ? t('arm.game.lendMore') : t('arm.game.lend'))}</button>` : ''}
        <button type="button" class="btn-sec" data-label="${esc(id)}">🏷️ ${esc(t('arm.shelf.label'))}</button>
        <button type="button" class="btn-sec" data-move="${esc(id)}">🚚 ${esc(t('arm.sel.move'))}</button>
        <button type="button" class="btn-sec am-danger" data-trash="${esc(id)}">🗑️ ${esc(t('arm.sel.trash'))}</button>` : ''}
      ${!canEdit() && canAdd() ? `<button type="button" class="btn-sec" data-edit="${esc(id)}">✏️ ${esc(t('arm.game.complete'))}</button>` : ''}
    </div>`, { wide: true });
  if (!A.pub) paintLocalManual(el, it);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit],[data-lend],[data-return],[data-label],[data-move],[data-trash]');
    if (!b) return;
    if (b.dataset.edit) { Sheet.close(el); openEditor(b.dataset.edit, { focus: b.dataset.focus }); }
    else if (b.dataset.lend) openLend(b.dataset.lend);
    else if (b.dataset.return) openReturn(b.dataset.return);
    else if (b.dataset.label) printLabels([{ id, ...A.lib[id] }]);
    else if (b.dataset.move) { Sheet.close(el); openMove([id]); }
    else if (b.dataset.trash) { Sheet.close(el); bulkTrash([id]); }
  });
  // Foto grande: solo adesso (nell'elenco c'è la miniatura)
  if (!A.pub && !it.image) {
    const full = await fullImage(A.aid, id, it).catch(() => null);
    if (full && full !== it.thumb && el.isConnected) $('#amBig', el).innerHTML = gameImageHTML({ name: it.name, image: full }, 'am-img am-img--big');
  }
}

// ---------------------------------------------------------------------------
// Modifica / aggiunta di un gioco
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Manuali (1.8): link ufficiale, file su questo dispositivo, ricerca guidata (manuals.js)
// ---------------------------------------------------------------------------

function manualSectionHTML(it) {
  const links = manualSearchLinks(it, lang());
  return `<section class="am-sec am-manual"><h3>📘 ${esc(t('man.title'))}</h3>
      ${it.manual ? `<p><a class="btn-sec btn-sec--sm" href="${esc(it.manual)}" target="_blank" rel="noopener noreferrer">📄 <span>${esc(t('man.open'))}</span></a> <span class="muted small">${esc(t('man.official'))}</span></p>` : ''}
      ${!A.pub ? `<div class="am-manual-local" id="amManLocal"><p class="muted small">${esc(t('man.localChecking'))}</p></div>` : ''}
      ${!it.manual ? `<p class="muted small">${esc(t('man.find'))} ${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(t(`man.find.${l.kind}`))}</a>`).join(' · ')}</p>` : ''}
    </section>`;
}
async function paintLocalManual(el, it) {
  const box = $('#amManLocal', el);
  if (!box) return;
  const info = await LocalManuals.info(A.aid, it.id);
  if (!box.isConnected) return;
  const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  box.innerHTML = info
    ? `<p><button type="button" class="btn-sec btn-sec--sm" data-man="open">📂 <span>${esc(t('man.openLocal'))}</span></button> <span class="muted small">${esc(info.name)} · ${esc(size(info.size))}</span> <button type="button" class="link-btn" data-man="del">${esc(t('man.removeLocal'))}</button></p>`
    : `<p><button type="button" class="btn-sec btn-sec--sm" data-man="add">💾 <span>${esc(t('man.saveLocal'))}</span></button></p><p class="muted small">${esc(t('man.localHint'))}</p>`;
  box.insertAdjacentHTML('beforeend', '<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" hidden data-manfile>');
  box.onclick = async (e) => {
    const b = e.target.closest('[data-man]');
    if (!b) return;
    if (b.dataset.man === 'add') box.querySelector('[data-manfile]').click();
    if (b.dataset.man === 'open' && !(await LocalManuals.open(A.aid, it.id))) toast(t('man.missing'), 'warn');
    if (b.dataset.man === 'del' && confirm(t('man.removeConfirm'))) { await LocalManuals.remove(A.aid, it.id).catch(() => {}); paintLocalManual(el, it); }
  };
  box.querySelector('[data-manfile]').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { await LocalManuals.save(A.aid, it.id, file); toast(t('man.saved')); paintLocalManual(el, it); } catch (err) { toast(t(`man.err.${err.code || 'save'}`), 'error'); }
  };
}

// ---------------------------------------------------------------------------
// BoardGameGeek (1.8): ricerca, confronto "prima / dopo", nessuna sovrascrittura silenziosa
// ---------------------------------------------------------------------------

const BGG_LABEL = { name: 'bgg.f.name', year: 'bgg.f.year', minPlayers: 'bgg.f.min', maxPlayers: 'bgg.f.max', duration: 'bgg.f.duration', weight: 'bgg.f.weight', tags: 'bgg.f.tags', extId: 'bgg.f.extId' };
const BGG_INPUT = { name: '#edName', year: '#edYear', minPlayers: '#edMin', maxPlayers: '#edMax', duration: '#edDur', weight: '#edWeight', tags: '#edTags', extId: '#edExt' };
const bggErr = (err) => t(`bgg.err.${['off', 'network', 'timeout', 'bgg_busy', 'rate_limited', 'bgg_unreachable', 'no_token', 'bgg_auth', 'forbidden_origin', 'not_found', 'short'].includes(err?.code) ? err.code : 'other'}`);
const showVal = (v) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? '—' : String(v));

/** Valori attuali del modulo (solo i campi che BGG può riempire e che esistono nel modulo). */
function formValues(form) {
  const out = {};
  for (const [k, sel] of Object.entries(BGG_INPUT)) {
    const inp = $(sel, form);
    if (!inp) continue;
    const v = inp.value.trim();
    out[k] = k === 'tags' ? (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []) : ['name', 'extId'].includes(k) ? v : (v === '' ? null : Number(v.replace(',', '.')));
  }
  return out;
}

function openBggSearch(form, editingId, setImage, wantImage) {
  const q0 = $('#edName', form)?.value.trim() || '';
  const el = Sheet.open(`${head(`🔎 ${esc(t('bgg.title'))}`)}
    <form class="am-bgg-form" id="bgForm"><label class="sr-only" for="bgQ">${esc(t('bgg.search'))}</label>
      <input class="input" id="bgQ" type="search" maxlength="80" value="${esc(q0)}" placeholder="${esc(t('bgg.searchPh'))}" autocomplete="off">
      <button type="submit" class="btn">${esc(t('bgg.searchGo'))}</button></form>
    <div id="bgRes" aria-live="polite"></div>
    <p class="muted small">${esc(t('bgg.credit'))} <a href="${BGG_SITE}" target="_blank" rel="noopener noreferrer">BoardGameGeek</a></p>`, { wide: true });
  let ctrl = null;
  const run = async () => {
    const q = $('#bgQ', el).value.trim();
    const box = $('#bgRes', el);
    ctrl?.abort(); ctrl = new AbortController();
    box.innerHTML = `<p class="muted">${esc(t('bgg.searching'))}</p>`;
    try {
      const list = await bggSearch(q, { signal: ctrl.signal });
      if (!el.isConnected) return;
      const have = new Map(items().filter((x) => x.id !== editingId).map((x) => [normTitle(x.name), x]));
      box.innerHTML = list.length ? `<ul class="am-bgg-list">${list.map((r) => `<li><button type="button" class="am-bgg-item" data-bgg="${r.id}">
          ${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="am-bgg-noimg" aria-hidden="true">🎲</span>'}
          <span><b>${esc(r.name)}</b>${r.year ? ` <span class="muted">(${r.year})</span>` : ''}${r.isExpansion ? ` <span class="am-tag">🧩 ${esc(t('bgg.expansion'))}</span>` : ''}
          <small>${esc([r.minPlayers ? `👥 ${r.minPlayers}${r.maxPlayers && r.maxPlayers !== r.minPlayers ? `–${r.maxPlayers}` : ''}` : '', r.time ? `⏱️ ${r.time}′` : '', r.weight ? `🧠 ${r.weight}` : ''].filter(Boolean).join(' · '))}</small>
          ${have.has(normTitle(r.name)) ? `<small class="am-warn">${esc(t('bgg.already', { name: have.get(normTitle(r.name)).name }))}</small>` : ''}</span></button></li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('bgg.none'))}</p>`;
    } catch (err) {
      if (err.code === 'aborted' || !el.isConnected) return;
      box.innerHTML = `<p class="form-error">${esc(bggErr(err))}</p><button type="button" class="btn-sec btn-sec--sm" id="bgRetry">${esc(t('bgg.retry'))}</button>`;
    }
  };
  $('#bgForm', el).addEventListener('submit', (e) => { e.preventDefault(); run(); });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('#bgRetry')) { run(); return; }
    const b = e.target.closest('[data-bgg]');
    if (!b) return;
    b.disabled = true;
    try {
      const thing = await bggThing(Number(b.dataset.bgg));
      if (!el.isConnected) return;
      reviewBgg(el, form, bggToGame(thing), setImage, wantImage);
    } catch (err) { toast(bggErr(err), 'error'); b.disabled = false; }
  });
  if (q0.length >= 2) run(); else $('#bgQ', el).focus();
}

/** Confronto "nella scheda / su BGG": i campi vuoti si riempiono, quelli diversi solo se spuntati. */
function reviewBgg(sheet, form, bgg, setImage, wantImage) {
  const cur = formValues(form);
  const plan = mergePlan(cur, bgg).filter((p) => BGG_INPUT[p.field] && $(BGG_INPUT[p.field], form));
  const rows = plan.map((p) => `<tr class="is-${p.state}"><th scope="row">${esc(t(BGG_LABEL[p.field]))}</th><td>${esc(showVal(p.current))}</td><td>${esc(showVal(p.bgg))}</td>
      <td>${p.state === 'conflict' ? `<label class="quick-toggle"><input type="checkbox" data-take="${p.field}"><span>${esc(t('bgg.take'))}</span></label>` : `<span class="muted small">${esc(t(p.state === 'fill' ? 'bgg.willFill' : 'bgg.same'))}</span>`}</td></tr>`).join('');
  const box = $('#bgRes', sheet);
  box.innerHTML = `<h3>${esc(bgg.name)}${bgg.isExpansion ? ` · 🧩 ${esc(t('bgg.expansion'))}` : ''}</h3>
    <p class="muted small">${esc(t('bgg.reviewLead'))}</p>
    <div class="am-bgg-table-wrap"><table class="am-bgg-table"><thead><tr><th></th><th>${esc(t('bgg.colNow'))}</th><th>${esc(t('bgg.colBgg'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${wantImage && (bgg.imageUrl || bgg.thumbUrl) ? `<label class="quick-toggle"><input type="checkbox" id="bgImg" checked><span>${esc(t('bgg.useImage'))}</span></label>` : ''}
    <div class="am-form-actions"><button type="button" class="btn" id="bgApply">${esc(t('bgg.apply'))}</button><button type="button" class="btn-sec" id="bgBack">${esc(t('bgg.back'))}</button></div>`;
  $('#bgBack', sheet).addEventListener('click', () => $('#bgForm', sheet).requestSubmit());
  $('#bgApply', sheet).addEventListener('click', async () => {
    const chosen = new Set([...sheet.querySelectorAll('[data-take]:checked')].map((c) => c.dataset.take));
    const next = applyMerge(cur, plan, chosen);
    for (const k of next._changed) {
      const inp = $(BGG_INPUT[k], form);
      if (inp) inp.value = Array.isArray(next[k]) ? next[k].join(', ') : String(next[k]);
    }
    if ($('#bgImg', sheet)?.checked) {
      try { const r = await gameImageFromUrl(bgg.imageUrl || bgg.thumbUrl); setImage(r.image); } catch { /* foto non leggibile: si tiene il resto */ }
    }
    Sheet.close(sheet);
    toast(t('bgg.applied', { n: next._changed.length }));
  });
}

function datalist(id, vals) { return `<datalist id="${id}">${vals.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`; }

function openEditor(id, { focus } = {}) {
  if (!canAdd()) return;
  const cur = id ? { ...A.lib[id] } : {};
  if (id && !A.lib[id]) return;
  const limited = !canEdit();
  let full; let imgChanged = false;
  const opts = (vals, v, empty) => `<option value="">${empty}</option>${vals.map(([k, l]) => `<option value="${esc(k)}" ${String(v ?? '') === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;
  const its = items();
  const uniq = (fn) => [...new Set(its.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  const bases = its.filter((x) => x.id !== id && !x.baseId).map((x) => [x.id, x.name]).sort((a, b) => a[1].localeCompare(b[1], 'it'));
  const f = (k) => esc(cur[k] ?? '');
  const el = Sheet.open(`
    ${head(id ? `✏️ ${esc(cur.name)}` : `➕ ${esc(t('arm.ed.newTitle'))}`)}
    <form id="edForm" class="am-form" novalidate>
      <div class="am-form-top">
        <button type="button" class="lib-add-img am-ed-img ${cur.thumb || cur.image ? 'has-img' : ''}" id="edPick" aria-label="${esc(t('arm.ed.pickPhoto'))}">${cur.thumb || cur.image ? `<img src="${esc(cur.thumb || cur.image)}" alt="">` : '📷'}</button>
        <input type="file" id="edFile" accept="image/*" hidden>
        <div class="am-form-name">
          <label class="field-label" for="edName">${esc(t('arm.ed.name'))}</label>
          <input class="input" id="edName" maxlength="40" required value="${f('name')}" placeholder="${esc(t('arm.ed.namePh'))}" autocomplete="off">
          <div class="am-url-row"><input class="input input--sm" id="edUrl" type="url" inputmode="url" placeholder="${esc(t('arm.ed.urlPh'))}"><button type="button" class="btn-sec btn-sec--sm" id="edUrlOk">${esc(t('arm.ed.urlUse'))}</button></div>
          ${bggEnabled() ? `<button type="button" class="btn-sec btn-sec--sm am-bgg-btn" id="edBgg">🔎 <span>${esc(t('bgg.searchBtn'))}</span></button>` : ''}
        </div>
      </div>
      <fieldset class="am-fs"><legend>${esc(t('arm.ed.howTo'))}</legend>
        <div class="am-grid2">
          <label><span class="field-label">${esc(t('arm.ed.min'))}</span><input class="input" type="number" min="1" max="20" id="edMin" value="${f('minPlayers')}"></label>
          <label><span class="field-label">${esc(t('arm.ed.max'))}</span><input class="input" type="number" min="1" max="20" id="edMax" value="${f('maxPlayers')}"></label>
          <label><span class="field-label">${esc(t('arm.ed.dur'))}</span><input class="input" type="number" min="1" max="600" id="edDur" value="${f('duration')}"></label>
          <label><span class="field-label">${esc(t('arm.f.weight'))}</span><input class="input" type="number" min="1" max="5" step="0.1" id="edWeight" value="${f('weight')}"></label>
          <label><span class="field-label">${esc(t('arm.f.mode'))}</span><select class="input select" id="edMode">${opts(Object.entries(GAME_MODES), cur.mode, '—')}</select></label>
          <label><span class="field-label">${esc(t('arm.f.lang'))}</span><input class="input" id="edLang" maxlength="20" list="dlLang" value="${f('language')}"></label>
        </div>
        <label><span class="field-label">${esc(t('arm.ed.tags'))}</span><input class="input" id="edTags" maxlength="160" value="${esc(tagsOf(cur).join(', '))}" placeholder="${esc(t('arm.ed.tagsPh'))}"></label>
      </fieldset>
      <fieldset class="am-fs" id="edLocFs"><legend>📍 ${esc(t('arm.game.where'))}</legend>
        <div class="am-grid2">${LOC_KEYS.map((k) => `<label><span class="field-label">${LOC_LABELS[k]}</span><input class="input" id="edLoc_${k}" maxlength="30" list="dlLoc_${k}" placeholder="${LOC_HINTS[k]}" value="${esc(cur.loc?.[k] || '')}"></label>`).join('')}</div>
        ${cur.locCheck ? `<label class="quick-toggle"><input type="checkbox" id="edLocOk" checked><span>${esc(t('arm.ed.locOk'))}</span></label>` : ''}
      </fieldset>
      ${limited ? '' : `
      <fieldset class="am-fs"><legend>${esc(t('arm.ed.edition'))}</legend>
        <div class="am-grid2">
          <label><span class="field-label">${esc(t('arm.ed.orig'))}</span><input class="input" id="edOrig" maxlength="60" value="${f('orig')}"></label>
          <label><span class="field-label">${esc(t('arm.ed.ed'))}</span><input class="input" id="edEdition" maxlength="40" value="${f('edition')}" placeholder="${esc(t('arm.ed.edPh'))}"></label>
          <label><span class="field-label">${esc(t('arm.ed.year'))}</span><input class="input" type="number" min="1900" max="2100" id="edYear" value="${f('year')}"></label>
          <label><span class="field-label">${esc(t('arm.ed.pub'))}</span><input class="input" id="edPub" maxlength="40" value="${f('publisher')}"></label>
          <label><span class="field-label">${esc(t('arm.game.expOf'))}</span><select class="input select" id="edBase">${opts(bases, cur.baseId, esc(t('arm.ed.standalone')))}</select></label>
          <label><span class="field-label">${esc(t('arm.ed.copies'))}</span><input class="input" type="number" min="1" max="20" id="edCopies" value="${f('copies') || ''}" placeholder="1"></label>
          <label><span class="field-label">${esc(t('arm.f.owner'))}</span><input class="input" id="edOwner" maxlength="24" list="dlOwner" value="${f('owner')}"></label>
          <label><span class="field-label">${esc(t('arm.f.status'))}</span><select class="input select" id="edStatus">${opts(Object.entries(GAME_STATUS).filter(([k]) => k !== 'prestato' || cur.status === 'prestato'), cur.status || 'posseduto', '—')}</select></label>
          <label><span class="field-label">${esc(t('arm.ed.acq'))}</span><input class="input" type="date" id="edAcq" value="${f('acq')}"></label>
          <label><span class="field-label">${esc(t('arm.ed.ean'))}</span><input class="input" id="edEan" inputmode="numeric" maxlength="14" value="${f('ean')}"></label>
        </div>
        <label class="quick-toggle"><input type="checkbox" id="edNew" ${cur.isNew || !id ? 'checked' : ''}><span>${esc(t('arm.game.new'))}</span></label>
      </fieldset>
      <fieldset class="am-fs"><legend>${esc(t('arm.ed.rulesNotes'))}</legend>
        <label><span class="field-label">${esc(t('arm.game.rules'))}</span><textarea class="input" id="edRules" maxlength="600" rows="3">${f('rules')}</textarea></label>
        <label><span class="field-label">${esc(t('arm.game.setup'))}</span><textarea class="input" id="edSetup" maxlength="300" rows="2">${f('setup')}</textarea></label>
        <label><span class="field-label">${esc(t('arm.ed.video'))}</span><input class="input" id="edVideo" type="url" maxlength="200" value="${f('video')}"></label>
        <label><span class="field-label">${esc(t('man.urlLabel'))}</span><input class="input" id="edManual" type="url" maxlength="300" value="${f('manual')}" placeholder="https://…"></label>
        <label><span class="field-label">${esc(t('arm.ed.note'))}</span><textarea class="input" id="edNote" maxlength="300" rows="2">${f('note')}</textarea></label>
        <label><span class="field-label">${esc(t('arm.ed.ext'))}</span><input class="input" id="edExt" maxlength="40" value="${f('extId')}"></label>
      </fieldset>`}
      ${datalist('dlLang', uniq((it) => it.language))}${datalist('dlOwner', uniq((it) => it.owner))}
      ${LOC_KEYS.map((k) => datalist(`dlLoc_${k}`, uniq((it) => it.loc?.[k]))).join('')}
      <p class="form-error" id="edErr" role="alert"></p>
      <div class="am-form-actions"><button type="submit" class="btn" id="edSave">${esc(id ? t('common.save') : t('arm.ed.addBtn'))}</button><button type="button" class="btn-sec" data-close>${esc(t('common.cancel'))}</button></div>
    </form>`, { wide: true });
  if (focus === 'loc') setTimeout(() => { $('#edLoc_room', el)?.focus(); $('#edLocFs', el)?.scrollIntoView({ block: 'center' }); }, 60);
  const pick = $('#edPick', el);
  const showImg = (src) => { pick.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '📷'; pick.classList.toggle('has-img', Boolean(src)); };
  pick.addEventListener('click', () => $('#edFile', el).click());
  $('#edFile', el).addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { full = await gameImage(file); imgChanged = true; showImg(full); } catch (err) { if (!err.cancelled) toast(err.message, 'error'); }
  });
  $('#edBgg', el)?.addEventListener('click', () => openBggSearch(el, id, (img) => { full = img; imgChanged = true; showImg(img); }, !full && !cur.thumb && !cur.image));
  $('#edUrlOk', el).addEventListener('click', async () => {
    try { const r = await gameImageFromUrl($('#edUrl', el).value.trim()); full = r.image; imgChanged = true; showImg(full); if (!r.copied) toast(t('arm.ed.urlWarn'), 'warn'); } catch (err) { $('#edErr', el).textContent = err.message; }
  });
  $('#edForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (s) => $(s, el)?.value.trim() ?? '';
    const n = (s) => (v(s) === '' ? null : Number(v(s).replace(',', '.')));
    const err = $('#edErr', el);
    const name = cleanName(v('#edName'), 40);
    if (!name) { err.textContent = t('arm.ed.errName'); $('#edName', el).focus(); return; }
    const mn = n('#edMin'); const mx = n('#edMax');
    if (mn !== null && (mn < 1 || mn > 20)) { err.textContent = t('arm.ed.errMin'); return; }
    if (mx !== null && (mx < 1 || mx > 20)) { err.textContent = t('arm.ed.errMax'); return; }
    if (mn && mx && mn > mx) { err.textContent = t('arm.ed.errMinMax'); return; }
    const dur = n('#edDur'); if (dur !== null && (dur < 1 || dur > 600)) { err.textContent = t('arm.ed.errDur'); return; }
    const w = n('#edWeight'); if (w !== null && (w < 1 || w > 5)) { err.textContent = t('arm.ed.errWeight'); return; }
    const patch = {
      name, minPlayers: mn ? Math.round(mn) : null, maxPlayers: mx ? Math.round(mx) : null, duration: dur ? Math.round(dur) : null,
      weight: w ? Math.round(w * 10) / 10 : null, mode: v('#edMode') || null, language: cleanName(v('#edLang'), 20) || null,
      tags: v('#edTags') ? [...new Set(v('#edTags').split(',').map((x) => cleanName(x, 20)).filter(Boolean))].slice(0, 8) : null,
      loc: cleanLoc(Object.fromEntries(LOC_KEYS.map((k) => [k, v(`#edLoc_${k}`)])))
    };
    if ($('#edLocOk', el)) patch.locCheck = $('#edLocOk', el).checked ? null : true;
    if (!limited) {
      const yr = n('#edYear'); if (yr !== null && (yr < 1900 || yr > 2100)) { err.textContent = t('arm.ed.errYear'); return; }
      const cp = n('#edCopies'); if (cp !== null && (cp < 1 || cp > 20)) { err.textContent = t('arm.ed.errCopies'); return; }
      const ean = v('#edEan').replace(/\D/g, ''); if (ean && !/^[0-9]{8,14}$/.test(ean)) { err.textContent = t('arm.ed.errEan'); return; }
      const video = v('#edVideo'); if (video && !/^https:\/\/[^\s"<>]+$/.test(video)) { err.textContent = t('arm.ed.errVideo'); return; }
      const manual = v('#edManual'); if (manual && !isManualUrl(manual)) { err.textContent = t('man.badUrl'); return; }
      Object.assign(patch, {
        orig: cleanName(v('#edOrig'), 60) || null, edition: cleanName(v('#edEdition'), 40) || null, year: yr ? Math.round(yr) : null,
        publisher: cleanName(v('#edPub'), 40) || null, baseId: v('#edBase') || null, copies: cp && cp > 1 ? Math.round(cp) : null,
        owner: cleanName(v('#edOwner'), 24) || null, acq: /^\d{4}-\d{2}-\d{2}$/.test(v('#edAcq')) ? v('#edAcq') : null,
        isNew: $('#edNew', el).checked ? true : null, ean: ean || null, video: video || null, manual: manual || null, extId: cleanName(v('#edExt'), 40) || null,
        rules: v('#edRules').slice(0, 600) || null, setup: v('#edSetup').slice(0, 300) || null, note: v('#edNote').slice(0, 300) || null
      });
      const st = v('#edStatus');
      if (st && st !== 'prestato') patch.status = st === 'posseduto' && !cur.status ? null : st;
      if (patch.baseId && expansionsOf(A.lib, id).length) { err.textContent = t('arm.ed.errBase'); return; }
    }
    // Possibile doppione (solo per i nuovi o se cambia nome)
    if (!id || normTitle(cur.name) !== normTitle(name)) {
      const same = items().find((x) => x.id !== id && normTitle(x.name) === normTitle(name) && (x.edition || '') === (patch.edition || cur.edition || ''));
      if (same) {
        const choice = await askDuplicate(same, name);
        if (choice === 'cancel') return;
        if (choice === 'copy') {
          await busy($('#edSave', el), async () => {
            await saveGame(A.aid, same.id, { copies: (Number(same.copies) || 1) + 1 });
            logEvent(A.aid, { op: 'edit', item: same.id, name: same.name, msg: `una copia in più (ora ${(Number(same.copies) || 1) + 1})`, by: me() }); // i18n-ok: cronologia nel database
          });
          toast(t('arm.ed.copyAdded', { name: same.name }));
          Sheet.close(el);
          return;
        }
        if (choice === 'open') { Sheet.close(el); openGame(same.id); return; }
        patch.dupOk = { ...(cur.dupOk || {}), [same.id]: true };
      }
    }
    try {
      await busy($('#edSave', el), async () => {
        if (id) {
          await saveGame(A.aid, id, patch, imgChanged ? { full } : {});
          const d = diffSummary(cur, patch) || (imgChanged ? 'foto' : ''); // i18n-ok: cronologia nel database
          if (d || imgChanged) logEvent(A.aid, { op: patch.loc && locText(cur.loc) !== locText(patch.loc) && d.startsWith('posizione') ? 'loc' : 'edit', item: id, name, msg: d, by: me() }); // i18n-ok: testo della cronologia (italiano)
        } else {
          const nid = newGameId(A.aid);
          const g = Object.fromEntries(Object.entries({ ...patch, addedBy: me().slice(0, 24) }).filter(([, x]) => x !== null && x !== undefined));
          await saveGame(A.aid, nid, g, { create: true, ...(full ? { full } : {}) });
          logEvent(A.aid, { op: 'add', item: nid, name, by: me() });
        }
      });
      toast(id ? t('arm.ed.saved', { name }) : t('arm.ed.added', { name }));
      Sheet.close(el);
    } catch (ex) { err.textContent = userMsg(ex); }
  });
}

function askDuplicate(same, name) {
  return new Promise((resolve) => {
    const el = Sheet.open(`
      ${head(`👯 ${esc(t('arm.dupAsk.title'))}`)}
      <p>${t('arm.dupAsk.lead', { name: esc(same.name) })}${same.edition ? ` (${esc(same.edition)})` : ''}${hasLoc(same) ? esc(t('arm.dupAsk.where', { loc: locText(same.loc) })) : ''}.</p>
      <div class="am-choices">
        <button type="button" class="btn-sec btn-block" data-c="copy">➕ ${esc(t('arm.dupAsk.copy', { n: (Number(same.copies) || 1) + 1 }))}</button>
        <button type="button" class="btn-sec btn-block" data-c="new">📚 ${esc(t('arm.dupAsk.new', { name }))}</button>
        <button type="button" class="btn-sec btn-block" data-c="open">👀 ${esc(t('arm.dupAsk.open'))}</button>
        <button type="button" class="link-btn" data-c="cancel">${esc(t('common.cancel'))}</button>
      </div>`, { onClose: () => resolve('cancel') });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const c = b.dataset.c;
      const st = Sheet.stack.find((x) => x.el === el);
      if (st) st.onClose = null;
      Sheet.close(el);
      resolve(c);
    });
  });
}

// ---------------------------------------------------------------------------
// Trova il gioco (anche negli altri armadi del profilo)
// ---------------------------------------------------------------------------

function findRow(it, armName, aid) {
  const loc = A.pub && !A.pubFields.loc ? '' : locText(it.loc);
  const lent = !A.pub && (it.loanId || it.status === 'prestato');
  const l = A.loans?.[it.loanId];
  const exps = aid === A.aid ? expansionsOf(A.lib, it.id) : [];
  return `<li class="am-found">
    <button type="button" class="am-found-main" ${aid === A.aid ? `data-open="${esc(it.id)}"` : `data-goto="${esc(armHref(aid, it.id))}"`}>
      ${gameImageHTML(it, 'am-img am-img--xs')}
      <span><b>${esc(it.name)}</b><small>📦 ${esc(armName)}</small>
      <small class="${loc ? '' : 'am-warn'}">📍 ${loc ? esc(loc) : esc(A.pub ? t('arm.find.locHidden') : t('arm.game.noLocLow'))}</small>
      <small>${lent ? `🤝 ${esc(t('arm.tag.lent'))}${canEdit() && (l?.to || it.loanTo) ? esc(t('arm.find.lentTo', { name: l?.to || it.loanTo })) : ''}${l?.due ? esc(t('arm.find.due', { date: fmtDate(l.due) })) : ''}` : (it.status && it.status !== 'posseduto' && !A.pub) ? `⛔ ${esc(GAME_STATUS[it.status] || it.status)}` : (A.pub && !A.pubFields.status) ? '' : `✅ ${esc(t('arm.tag.avail'))}`}</small>
      ${exps.length ? `<small>🧩 ${exps.map((x) => `${esc(x.name)}${hasLoc(x) ? ` (📍 ${esc(locText(x.loc))})` : ''}`).join(', ')}</small>` : ''}</span>
    </button></li>`;
}
function openFind() {
  const el = Sheet.open(`
    ${head(`📍 ${esc(t('arm.act.find'))}`)}
    <input class="input" id="fdQ" type="search" placeholder="${esc(t('arm.find.ph'))}" autocomplete="off" autofocus>
    <ul class="am-found-list" id="fdList"></ul>
    ${!A.pub && otherArmadi().length ? `<button type="button" class="btn-sec btn-sec--sm" id="fdOther">🔎 ${esc(t('arm.find.others', { n: otherArmadi().length }))}</button>` : ''}`, { wide: true });
  const others = [];
  const paint = () => {
    const q = $('#fdQ', el).value;
    const res = q.trim() ? applyFilters(items(), { text: q }, { lib: A.lib }).slice(0, 30) : [];
    const ext = q.trim() ? others.flatMap((o) => applyFilters(o.items, { text: q }, {}).slice(0, 10).map((it) => ({ it, o }))) : [];
    $('#fdList', el).innerHTML = !q.trim() ? `<li class="muted">${esc(t('arm.find.hint'))}</li>`
      : (res.map((it) => findRow(it, (A.pub ? A.pubInfo : A.info)?.name || t('arm.find.this'), A.aid)).join('') + ext.map(({ it, o }) => findRow(it, o.name, o.id)).join('')) || `<li class="muted">${esc(t('arm.find.none'))}</li>`;
  };
  $('#fdQ', el).addEventListener('input', paint);
  $('#fdOther', el)?.addEventListener('click', async (e) => {
    await busy(e.currentTarget, async () => {
      for (const a of otherArmadi()) {
        const lib = (await get(armadioRef(a.id, 'library')).catch(() => null))?.val() || {};
        others.push({ id: a.id, name: a.name, items: Object.entries(lib).filter(([, it]) => it?.name).map(([id, it]) => ({ id, ...it })) });
      }
    });
    e.target.closest('button')?.remove();
    paint();
  });
  el.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) location.href = g.dataset.goto; });
  paint();
}
function otherArmadi() {
  const m = new Map();
  for (const [id, a] of Object.entries(Person.data?.armadi || {})) if (id !== A.aid) m.set(id, { id, name: a.name, key: a.key });
  try { for (const a of JSON.parse(localStorage.getItem('gnr_armadi') || '[]')) if (a?.id && a.id !== A.aid && !m.has(a.id)) m.set(a.id, { id: a.id, name: a.name }); } catch { /* niente */ }
  return [...m.values()];
}

// ---------------------------------------------------------------------------
// Rinomina e informazioni dell'armadio
// ---------------------------------------------------------------------------

function openInfoEditor() {
  if (A.role !== 'owner') return;
  const i = A.info || {};
  const EMOJI = ['📦', '🎲', '🧩', '🃏', '♟️', '🏰', '🐉', '🚀', '🌈', '🍕', '🏖️', '🎉'];
  const el = Sheet.open(`
    ${head(`✏️ ${esc(t('arm.act.editInfo'))}`)}
    <form id="aiForm" class="am-form" novalidate>
      <label><span class="field-label">${esc(t('arm.ed.name'))}</span><input class="input" id="aiName" maxlength="40" value="${esc(i.name || '')}" required></label>
      <label><span class="field-label">${esc(t('arm.info.desc'))}</span><textarea class="input" id="aiDesc" maxlength="200" rows="2" placeholder="${esc(t('arm.info.descPh'))}">${esc(i.desc || '')}</textarea></label>
      <span class="field-label">${esc(t('arm.info.icon'))}</span>
      <div class="am-emojis" role="radiogroup" aria-label="${esc(t('arm.info.icon'))}">${EMOJI.map((x) => `<button type="button" class="am-emoji-btn" data-emo="${x}" aria-pressed="${(i.emoji || '📦') === x}">${x}</button>`).join('')}</div>
      <p class="form-error" id="aiErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="aiSave">${esc(t('common.save'))}</button>
    </form>`);
  let emoji = i.emoji || '📦';
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-emo]'); if (b) { emoji = b.dataset.emo; el.querySelectorAll('[data-emo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
  $('#aiForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanName($('#aiName', el).value, 40);
    if (!name) { $('#aiErr', el).textContent = t('arm.info.errName'); return; }
    const desc = cleanName($('#aiDesc', el).value, 200);
    try {
      await busy($('#aiSave', el), () => update(armadioRef(A.aid, 'info'), { name, desc: desc || null, emoji, updatedAt: Date.now() }));
      if (name !== i.name) logEvent(A.aid, { op: 'rename', msg: `da “${i.name}” a “${name}”`, by: me() }); // i18n-ok: cronologia nel database
      Person.linkArmadio(A.aid, name).catch(() => {});
      try {
        const list = JSON.parse(localStorage.getItem('gnr_armadi') || '[]').map((a) => (a?.id === A.aid ? { ...a, name } : a));
        localStorage.setItem('gnr_armadi', JSON.stringify(list));
      } catch { /* niente */ }
      toast(t('arm.info.saved'));
      Sheet.close(el);
    } catch (ex) { $('#aiErr', el).textContent = userMsg(ex); }
  });
}

// ---------------------------------------------------------------------------
// Modifica multipla
// ---------------------------------------------------------------------------

function openBulk(ids, { focus } = {}) {
  if (!canEdit() || !ids.length) return;
  const its = ids.map((id) => ({ id, ...A.lib[id] })).filter((x) => x.name);
  const uniq = (fn) => [...new Set(items().map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  const el = Sheet.open(`
    ${head(`✏️ ${esc(t('arm.bulk.title', { n: its.length }))}`)}
    <p class="muted">${esc(t('arm.bulk.lead'))}</p>
    <form id="bkForm" class="am-form" novalidate>
      <fieldset class="am-fs" id="bkLocFs"><legend>📍 ${esc(t('arm.table.loc'))}</legend>
        <div class="am-grid2">${LOC_KEYS.map((k) => `<label><span class="field-label">${LOC_LABELS[k]}</span><input class="input" id="bkLoc_${k}" maxlength="30" list="bkdl_${k}" placeholder="${esc(t('arm.bulk.keep'))}"></label>`).join('')}</div>
        <label class="quick-toggle"><input type="checkbox" id="bkLocClear"><span>${esc(t('arm.bulk.locClear'))}</span></label>
        ${LOC_KEYS.map((k) => datalist(`bkdl_${k}`, uniq((it) => it.loc?.[k]))).join('')}
      </fieldset>
      <div class="am-grid2">
        <label><span class="field-label">${esc(t('arm.f.status'))}</span><select class="input select" id="bkStatus"><option value="">${esc(t('arm.bulk.keep'))}</option><option value="posseduto">${esc(t('arm.tag.avail'))}</option><option value="non disponibile">${esc(t('arm.tag.unavail'))}</option><option value="venduto">${esc(t('arm.bulk.sold'))}</option></select></label>
        <label><span class="field-label">${esc(t('arm.f.owner'))}</span><input class="input" id="bkOwner" maxlength="24" list="bkdlOwner" placeholder="${esc(t('arm.bulk.keep'))}"></label>
        <label><span class="field-label">${esc(t('arm.bulk.new'))}</span><select class="input select" id="bkNew"><option value="">${esc(t('arm.bulk.keep'))}</option><option value="si">${esc(t('arm.bulk.yes'))}</option><option value="no">${esc(t('arm.bulk.no'))}</option></select></label>
        <label><span class="field-label">${esc(t('arm.f.mode'))}</span><select class="input select" id="bkMode"><option value="">${esc(t('arm.bulk.keep'))}</option>${Object.entries(GAME_MODES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label><span class="field-label">${esc(t('arm.bulk.tagAdd'))}</span><input class="input" id="bkTagAdd" maxlength="80" placeholder="${esc(t('arm.bulk.tagAddPh'))}"></label>
        <label><span class="field-label">${esc(t('arm.bulk.tagDel'))}</span><input class="input" id="bkTagDel" maxlength="80"></label>
      </div>
      <label class="quick-toggle"><input type="checkbox" id="bkOwnerClear"><span>${esc(t('arm.bulk.ownerClear'))}</span></label>
      ${datalist('bkdlOwner', uniq((it) => it.owner))}
      <div id="bkPreview" class="am-preview" hidden></div>
      <p class="form-error" id="bkErr" role="alert"></p>
      <div class="am-form-actions"><button type="button" class="btn-sec" id="bkPrev">👀 ${esc(t('arm.bulk.preview'))}</button><button type="submit" class="btn" id="bkGo" disabled>${esc(t('arm.bulk.apply'))}</button><button type="button" class="link-btn" data-close>${esc(t('common.cancel'))}</button></div>
    </form>`, { wide: true });
  if (focus === 'loc') setTimeout(() => $('#bkLoc_room', el)?.focus(), 60);
  const plan = () => {
    const v = (s) => $(s, el).value.trim();
    const locNew = cleanLoc(Object.fromEntries(LOC_KEYS.map((k) => [k, v(`#bkLoc_${k}`)])));
    const add = v('#bkTagAdd').split(',').map((x) => cleanName(x, 20)).filter(Boolean);
    const del = v('#bkTagDel').split(',').map((x) => cleanName(x, 20).toLowerCase()).filter(Boolean);
    // Ogni modifica è [chiave, parametri]: in pagina nella lingua scelta, nella cronologia (database) in italiano
    const changes = [];
    const per = its.map((it) => {
      const p = {};
      if ($('#bkLocClear', el).checked) { if (hasLoc(it)) p.loc = null; } else if (locNew) { const nl = { ...(cleanLoc(it.loc) || {}), ...locNew }; if (locText(nl) !== locText(it.loc)) p.loc = nl; if (it.locCheck) p.locCheck = null; }
      if (v('#bkStatus') && (it.status || 'posseduto') !== v('#bkStatus') && !it.loanId) p.status = v('#bkStatus');
      if ($('#bkOwnerClear', el).checked) { if (it.owner) p.owner = null; } else if (v('#bkOwner') && it.owner !== cleanName(v('#bkOwner'), 24)) p.owner = cleanName(v('#bkOwner'), 24);
      if (v('#bkNew') === 'si' && !it.isNew) p.isNew = true;
      if (v('#bkNew') === 'no' && it.isNew) p.isNew = null;
      if (v('#bkMode') && it.mode !== v('#bkMode')) p.mode = v('#bkMode');
      if (add.length || del.length) {
        const tg = [...new Set([...tagsOf(it).filter((x) => !del.includes(x.toLowerCase())), ...add])].slice(0, 8);
        if (JSON.stringify(tg) !== JSON.stringify(tagsOf(it))) p.tags = tg.length ? tg : null;
      }
      return { it, p };
    }).filter((x) => Object.keys(x.p).length);
    if ($('#bkLocClear', el).checked) changes.push(['arm.bulk.ch.locClear']);
    else if (locNew) changes.push(['arm.bulk.ch.loc', { loc: locText(locNew) }]);
    if (v('#bkStatus')) changes.push([its.some((it) => it.loanId) ? 'arm.bulk.ch.statusLent' : 'arm.bulk.ch.status', { label: GAME_STATUS[v('#bkStatus')] }]);
    if ($('#bkOwnerClear', el).checked) changes.push(['arm.bulk.ch.ownerClear']); else if (v('#bkOwner')) changes.push(['arm.bulk.ch.owner', { name: v('#bkOwner') }]);
    if (v('#bkNew')) changes.push([v('#bkNew') === 'si' ? 'arm.bulk.ch.newYes' : 'arm.bulk.ch.newNo']);
    if (v('#bkMode')) changes.push(['arm.bulk.ch.mode', { label: GAME_MODES[v('#bkMode')] }]);
    if (add.length) changes.push(['arm.bulk.ch.tagAdd', { tags: add.join(' #') }]);
    if (del.length) changes.push(['arm.bulk.ch.tagDel', { tags: del.join(' #') }]);
    return { per, changes };
  };
  const preview = () => {
    const { per, changes } = plan();
    const box = $('#bkPreview', el);
    box.hidden = false;
    box.innerHTML = changes.length
      ? `<p><b>${esc(changes.map(([k, p]) => t(k, p)).join(' · '))}</b></p><p>${per.length ? esc(t('arm.bulk.willChange', { n: per.length, total: its.length })) : esc(t('arm.bulk.noChange'))}${per.length < its.length && per.length ? esc(t('arm.bulk.others', { n: its.length - per.length })) : ''}</p><p class="muted small">${per.slice(0, 12).map((x) => esc(x.it.name)).join(', ')}${per.length > 12 ? '…' : ''}</p>`
      : `<p class="muted">${esc(t('arm.bulk.nothing'))}</p>`;
    $('#bkGo', el).disabled = !per.length;
  };
  $('#bkPrev', el).addEventListener('click', preview);
  el.addEventListener('input', () => { $('#bkGo', el).disabled = true; });
  el.addEventListener('change', () => { $('#bkGo', el).disabled = true; });
  $('#bkForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const { per, changes } = plan();
    if (!per.length) return;
    let ok = 0; const bad = [];
    await busy($('#bkGo', el), async () => {
      for (let i = 0; i < per.length; i += 40) {
        const upd = {};
        for (const { it, p } of per.slice(i, i + 40)) { for (const [k, v] of Object.entries(p)) upd[`library/${it.id}/${k}`] = v; upd[`library/${it.id}/updatedAt`] = Date.now(); }
        try { await update(armadioRef(A.aid), upd); ok += Math.min(40, per.length - i); } catch (err) { bad.push(...per.slice(i, i + 40).map((x) => x.it.name)); console.warn(err); }
      }
    });
    logEvent(A.aid, { op: 'bulk', msg: `${changes.map(([k, p]) => tIt(k, p)).join(' · ')} — ${tIt('arm.n.games', { n: ok })}`, by: me() });
    Sheet.close(el);
    if (bad.length) Sheet.open(`${head(esc(t('arm.bulk.multi')))}<p>✅ ${esc(t('arm.n.updated', { n: ok }))}.</p><p class="form-error">❌ ${esc(t('arm.bulk.failed', { n: bad.length, names: bad.join(', ') }))}</p>`);
    else toast(`✓ ${t('arm.n.updated', { n: ok })}`);
  });
}

async function bulkTrash(ids) {
  const its = ids.map((id) => ({ id, ...A.lib[id] })).filter((x) => x.name);
  if (!its.length) return;
  const lent = its.filter((x) => x.loanId);
  const withExp = its.filter((x) => expansionsOf(A.lib, x.id).length && !ids.includes(expansionsOf(A.lib, x.id)[0].id));
  if (!confirm(`${t('arm.trash.ask', { what: its.length === 1 ? `“${its[0].name}”` : t('arm.n.games', { n: its.length }) })}${lent.length ? t('arm.trash.lent', { n: lent.length }) : ''}${withExp.length ? t('arm.trash.exp', { names: withExp.map((x) => x.name).join(', ') }) : ''}`)) return;
  let ok = 0;
  for (const it of its) { try { const g = { ...it }; delete g.id; await trashGame(A.aid, it.id, g, me()); ok++; A.sel.delete(it.id); } catch (err) { toast(userMsg(err), 'error'); } }
  toast(t('arm.trash.done', { n: ok }));
}

// ---------------------------------------------------------------------------
// Prestiti
// ---------------------------------------------------------------------------

async function knownPeople() {
  const out = new Map();
  for (const l of Object.values(A.loans || {})) if (l?.to) out.set(l.to, l.toKey || '');
  for (const a of Object.values(A.adminInfo || {})) if (a?.name) out.set(a.name, '');
  for (const gid of Object.keys(Person.data?.groups || {})) {
    const nights = (await get(groupRef(gid, 'nights')).catch(() => null))?.val() || {};
    for (const n of Object.values(nights)) for (const [k, pp] of Object.entries(n?.people || {})) if (pp?.name && !out.has(pp.name)) out.set(pp.name, k);
  }
  return [...out.entries()].map(([name, key]) => ({ name, key })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
async function openLend(id, { onDone } = {}) {
  const it = A.lib?.[id];
  if (!it) return;
  const people = await knownPeople();
  const due = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
  const el = Sheet.open(`
    ${head(`🤝 ${esc(t('arm.lend.title', { name: it.name }))}`)}
    <form id="lnForm" class="am-form" novalidate>
      <label><span class="field-label">${esc(t('arm.lend.to'))}</span><input class="input" id="lnTo" maxlength="40" list="lnPeople" placeholder="${esc(t('arm.lend.toPh'))}" autocomplete="off" autofocus></label>
      ${datalist('lnPeople', people.map((p) => p.name))}
      <p class="muted small">${esc(people.length ? t('arm.lend.hintPeople') : t('arm.lend.hint'))}</p>
      <label><span class="field-label">${esc(t('arm.lend.due'))}</span><input class="input" type="date" id="lnDue" value="${due}"></label>
      <label><span class="field-label">${esc(t('arm.game.note'))}</span><input class="input" id="lnNote" maxlength="200" placeholder="${esc(t('arm.lend.notePh'))}"></label>
      <p class="form-error" id="lnErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="lnGo">${esc(t('arm.lend.go'))}</button>
    </form>`);
  $('#lnForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = cleanName($('#lnTo', el).value, 40);
    const d = $('#lnDue', el).value;
    const person = people.find((p) => p.name.toLowerCase() === to.toLowerCase());
    try {
      await busy($('#lnGo', el), () => lendGame(A.aid, id, it, A.loans, { to, toKey: person?.key || '', due: d ? new Date(`${d}T20:00:00`).getTime() : null, note: $('#lnNote', el).value }, me()));
      toast(`🤝 ${t('arm.lend.done', { name: it.name, to })}`);
      Sheet.closeAll();
      onDone?.();
    } catch (ex) { $('#lnErr', el).textContent = userMsg(ex); }
  });
}
function openReturn(lid) {
  const l = A.loans?.[lid] ? { id: lid, ...A.loans[lid] } : null;
  if (!l) return;
  const it = A.lib?.[l.item];
  const el = Sheet.open(`
    ${head(`↩️ ${esc(t('arm.ret.title', { name: l.name || it?.name || t('arm.table.game') }))}`)}
    <p>${t('arm.game.lentSince', { name: esc(l.to), date: fmtDate(l.start) })}${l.due ? esc(t('arm.ret.due', { date: fmtDate(l.due) })) : ''}.</p>
    <form id="rtForm" class="am-form" novalidate>
      <span class="field-label">${esc(t('arm.ret.how'))}</span>
      <div class="seg" role="radiogroup"><button type="button" data-st="ok" aria-pressed="true">👍 ${esc(t('arm.ret.ok'))}</button><button type="button" data-st="incompleto" aria-pressed="false">🧩 ${esc(t('arm.ret.missing'))}</button><button type="button" data-st="danneggiato" aria-pressed="false">💥 ${esc(t('arm.ret.broken'))}</button></div>
      <label><span class="field-label">${esc(t('arm.game.note'))}</span><input class="input" id="rtNote" maxlength="120"></label>
      <p class="form-error" id="rtErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="rtGo">${esc(t('arm.ret.go'))}</button>
    </form>
    <details class="hub-details"><summary>${esc(t('arm.ret.changeDue'))}</summary><div class="hub-code-row"><input class="input" type="date" id="rtDue" value="${l.due ? new Date(l.due).toISOString().slice(0, 10) : ''}"><button type="button" class="btn-sec" id="rtDueGo">${esc(t('common.save'))}</button></div></details>`);
  let st = 'ok';
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) { st = b.dataset.st; el.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
  $('#rtDueGo', el).addEventListener('click', async () => {
    const d = $('#rtDue', el).value;
    try { await updateLoan(A.aid, lid, { due: d ? new Date(`${d}T20:00:00`).getTime() : null }); toast(t('arm.ret.dueSaved')); Sheet.close(el); } catch (ex) { $('#rtErr', el).textContent = userMsg(ex); }
  });
  $('#rtForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await busy($('#rtGo', el), () => returnGame(A.aid, l, it ? { id: l.item, ...it } : null, A.loans, { state: st, note: $('#rtNote', el).value }, me()));
      toast(`↩️ ${t('arm.loan.returned')}`);
      Sheet.closeAll();
    } catch (ex) { $('#rtErr', el).textContent = userMsg(ex); }
  });
}
function pickGameForLoan() {
  const el = Sheet.open(`${head(`🤝 ${esc(t('arm.loans.new'))}`)}<input class="input" id="pgQ" type="search" placeholder="${esc(t('arm.loans.pickPh'))}" autofocus><ul class="am-found-list" id="pgList"></ul>`);
  const paint = () => {
    const res = applyFilters(items(), { text: $('#pgQ', el).value, avail: 'si' }, { lib: A.lib }).slice(0, 20);
    $('#pgList', el).innerHTML = res.map((it) => `<li><button type="button" class="am-found-main" data-pg="${esc(it.id)}">${gameImageHTML(it, 'am-img am-img--xs')}<span><b>${esc(it.name)}</b></span></button></li>`).join('') || `<li class="muted">${esc(t('arm.loans.pickNone'))}</li>`;
  };
  $('#pgQ', el).addEventListener('input', paint);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (b) { Sheet.close(el); openLend(b.dataset.pg); } });
  paint();
}
function loansHTML() {
  const act = activeLoans(A.loans);
  const past = Object.entries(A.loans || {}).map(([id, l]) => ({ id, ...l })).filter((l) => l.ret).sort((a, b) => b.ret - a.ret);
  const row = (l) => `<li class="am-loan ${isOverdue(l) ? 'is-late' : ''}">
    <button type="button" class="am-loan-main" data-open="${esc(l.item)}"><b>${esc(l.name || A.lib?.[l.item]?.name || t('arm.table.game'))}</b>
    <small>${t('arm.loans.row', { name: esc(l.to), date: fmtDate(l.start) })}${l.due ? esc(t(isOverdue(l) ? 'arm.loans.overdue' : 'arm.loans.dueBy', { date: fmtDate(l.due) })) : ''}${l.note ? ` · ${esc(l.note)}` : ''}</small></button>
    <button type="button" class="btn-sec btn-sec--sm" data-return="${esc(l.id)}">↩️ ${esc(t('arm.loan.returned'))}</button></li>`;
  setTimeout(() => $('#amBody')?.querySelectorAll('[data-return]').forEach((b) => b.addEventListener('click', () => openReturn(b.dataset.return))), 0);
  return `
    <div class="am-pane">
      <div class="hub-sec-head"><h2>🤝 ${esc(t('arm.loans.active', { n: act.length }))}</h2><button type="button" class="btn" data-act="newLoan">➕ ${esc(t('arm.loans.new'))}</button></div>
      ${act.length ? `<ul class="am-loans">${act.map(row).join('')}</ul>` : `<p class="muted">${esc(t('arm.loans.none'))}</p>`}
      ${act.some((l) => isOverdue(l)) ? `<p class="am-warn">⏰ ${esc(t('arm.loans.lateHint'))}</p>` : ''}
      <h2>${esc(t('arm.loans.past', { n: past.length }))}</h2>
      ${past.length ? `<ul class="am-mini-list">${past.slice(0, 100).map((l) => `<li><button type="button" class="link-btn" data-open="${esc(l.item)}">${esc(l.name || t('arm.table.game'))}</button> — ${esc(l.to)} · ${fmtDate(l.start)} → ${fmtDate(l.ret)}${l.state && l.state !== 'ok' ? ` · <b>${esc(retState(l.state))}</b>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('arm.loans.pastNone'))}</p>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Cronologia e cestino
// ---------------------------------------------------------------------------

function logHTML() {
  const evs = Object.values(A.log || {}).filter((x) => x?.at).sort((a, b) => b.at - a.at).slice(0, 300);
  return `<div class="am-pane"><h2>${esc(t('arm.tab.log'))}</h2><p class="muted small">${esc(t('arm.log.lead'))}</p>
    ${evs.length ? `<ul class="am-log">${evs.map((ev) => `<li><span class="am-log-op">${esc(OPS[ev.op] || ev.op)}</span><span>${ev.item && A.lib?.[ev.item] ? `<button type="button" class="link-btn" data-open="${esc(ev.item)}">${esc(ev.name || A.lib[ev.item].name)}</button>` : `<b>${esc(ev.name || '')}</b>`} ${esc(ev.msg || '')}</span><small class="muted">${fmtWhen(ev.at)}${ev.by ? ` · ${esc(ev.by)}` : ''}</small></li>`).join('')}</ul>` : `<p class="muted">${esc(t('arm.log.none'))}</p>`}</div>`;
}
function trashHTML() {
  const list = Object.entries(A.trash || {}).map(([id, r]) => ({ id, ...r })).filter((r) => r.game?.name).sort((a, b) => b.at - a.at);
  setTimeout(() => {
    $('#amBody')?.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => doRestore(b.dataset.restore)));
    $('#amBody')?.querySelectorAll('[data-purge]').forEach((b) => b.addEventListener('click', () => doPurge(b.dataset.purge)));
  }, 0);
  return `<div class="am-pane"><h2>${esc(t('arm.tab.trash'))}</h2><p class="muted small">${esc(t('arm.trash.lead'))}</p>
    ${list.length ? `<ul class="am-loans">${list.map((r) => `<li class="am-loan">${gameImageHTML(r.game, 'am-img am-img--xs')}<span class="am-loan-main"><b>${esc(r.game.name)}</b><small>${esc(t('arm.trash.when', { when: fmtWhen(r.at) }))}${r.by ? esc(t('arm.trash.by', { name: r.by })) : ''}${r.game.baseId ? esc(t('arm.trash.expOf', { name: A.lib?.[r.game.baseId]?.name || t('arm.trash.aGame') })) : ''}</small></span>
      <button type="button" class="btn-sec btn-sec--sm" data-restore="${esc(r.id)}">♻️ ${esc(t('arm.trash.restore'))}</button><button type="button" class="btn-sec btn-sec--sm am-danger" data-purge="${esc(r.id)}">${esc(t('arm.trash.purge'))}</button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('arm.trash.empty'))}</p>`}</div>`;
}
async function doRestore(id) {
  const rec = A.trash?.[id];
  if (!rec) return;
  try {
    let r = await restoreGame(A.aid, id, rec, A.lib, { by: me() });
    if (r.conflict === 'name') {
      if (!confirm(t('arm.trash.conflict', { name: rec.game.name }))) return;
      r = await restoreGame(A.aid, id, rec, A.lib, { asCopy: true, by: me() });
    } else if (r.conflict === 'id') { toast(t('arm.trash.conflictId'), 'warn'); return; }
    if (r.ok) toast(`♻️ ${t('arm.trash.restored', { name: rec.game.name })}`);
  } catch (err) { toast(userMsg(err), 'error'); }
}
async function doPurge(id) {
  const rec = A.trash?.[id];
  if (!rec) return;
  const word = t('arm.purge.word');
  const ans = prompt(t('arm.purge.ask', { name: rec.game.name, word }));
  if ((ans || '').trim().toUpperCase() !== word.toUpperCase()) { if (ans !== null) toast(t('arm.purge.no', { word }), 'warn'); return; }
  try { await purgeGame(A.aid, id, rec.game.name, me()); toast(t('arm.purge.done')); } catch (err) { toast(userMsg(err), 'error'); }
}

// ---------------------------------------------------------------------------
// Strumenti: schede incomplete, duplicati, importa/esporta, etichette, link pubblico, persone
// ---------------------------------------------------------------------------

function toolsHTML() {
  const its = items();
  const miss = Object.fromEntries(CHECK_FIELDS.map((f) => [f.k, its.filter((it) => !f.test(it)).length]));
  const pairs = duplicatePairs(A.lib);
  const tok = A.share?.token;
  const admins = Object.keys(A.admins || {}).filter((u) => A.admins[u] === true);
  const players = Object.keys(A.uids || {}).length;
  const inv = Object.entries(A.invites || {}).filter(([, x]) => x.exp > Date.now() && !x.used);
  setTimeout(bindTools, 0);
  return `<div class="am-pane am-tools">
    <section class="card am-tool"><h2>${esc(t('arm.f.incomplete'))}</h2>
      <ul class="am-mini-list">${CHECK_FIELDS.map((f) => `<li>${miss[f.k] ? `<b>${miss[f.k]}</b>` : '✓'} ${esc(t('arm.tools.without', { label: f.label }))}</li>`).join('')}</ul>
      <button type="button" class="btn" data-act="wizard" ${its.some((it) => missingFields(it).length) ? '' : 'disabled'}>✍️ ${esc(t('arm.wz.title'))}</button></section>
    <section class="card am-tool"><h2>👯 ${esc(t('arm.tools.dups'))}</h2>
      <p>${pairs.length ? `${esc(t('arm.tools.pairs', { n: pairs.length }))}: ${Object.entries(DUP_KINDS).map(([k, l]) => { const n = pairs.filter((p) => p.kind === k).length; return n ? `${n} ${esc(l.toLowerCase())}` : ''; }).filter(Boolean).join(', ')}.` : esc(t('arm.dups.none'))}</p>
      <button type="button" class="btn-sec" data-act="dups" ${pairs.length ? '' : 'disabled'}>${esc(t('arm.tools.review'))}</button></section>
    <section class="card am-tool"><h2>${esc(t('arm.tools.io'))}</h2>
      <p class="muted small">${esc(t('arm.tools.ioLead'))}</p>
      <div class="hub-row"><button type="button" class="btn-sec" data-act="export-csv">📤 CSV</button><button type="button" class="btn-sec" data-act="export-json">📤 JSON</button><button type="button" class="btn" data-act="import">📥 ${esc(t('arm.tools.import'))}</button></div>
      <input type="file" id="amImport" accept=".csv,.json,text/csv,application/json" hidden>
      ${A.undo ? `<button type="button" class="btn-sec btn-sec--sm" id="amUndo">↶ ${esc(t('arm.tools.undoLast'))}</button>` : ''}</section>
    <section class="card am-tool"><h2>🏷️ ${esc(t('arm.tools.labels'))}</h2>
      <p class="muted small">${esc(t('arm.tools.labelsLead'))}</p>
      <div class="hub-row"><button type="button" class="btn-sec" data-act="labels-all">🏷️ ${esc(t('arm.tools.labelsFiltered', { n: filtered().length }))}</button></div>
      <p class="muted small">${esc(t('arm.tools.labelsHint'))}</p></section>
    <section class="card am-tool"><h2>🔗 ${esc(t('arm.share.title'))}</h2>
      <p>${esc(tok ? t('arm.tools.shareOn') : t('arm.tools.shareOff'))}</p>
      <button type="button" class="btn-sec" data-act="share">${esc(tok ? t('arm.tools.shareManage') : t('arm.tools.shareCreate'))}</button></section>
    <section class="card am-tool am-tool--wide"><h2>👥 ${esc(t('arm.people.title'))}</h2>
      <ul class="am-people">
        <li><b>${esc(t('arm.role.owner'))}</b><span>${esc(t('arm.people.owner', { who: A.role === 'owner' ? t('arm.people.you') : t('arm.people.creator') }))}</span></li>
        ${admins.map((u) => `<li><b>✏️ ${esc(A.adminInfo?.[u]?.name || t('arm.people.device'))}${u === A.uid ? esc(t('arm.people.youSuffix')) : ''}</b><span>${esc(t('arm.people.editor'))}${A.adminInfo?.[u]?.at ? esc(t('arm.people.since', { date: fmtDate(A.adminInfo[u].at) })) : ''}</span>${A.role === 'owner' ? `<button type="button" class="btn-sec btn-sec--sm am-danger" data-revoke="${esc(u)}">${esc(t('arm.people.revoke'))}</button>` : u === A.uid ? `<button type="button" class="btn-sec btn-sec--sm" data-revoke="${esc(u)}">${esc(t('arm.people.leave'))}</button>` : ''}</li>`).join('') || `<li class="muted">${esc(t('arm.people.noEditors'))}</li>`}
        <li><b>🎲 ${esc(t('arm.people.players'))}</b><span>${esc(t('arm.people.playersInfo', { n: players }))}</span></li>
        <li><b>👀 ${esc(t('arm.people.visitors'))}</b><span>${esc(t('arm.people.visitorsInfo', { code: A.aid }))}</span></li>
      </ul>
      ${A.role === 'owner' ? `<div class="hub-row"><button type="button" class="btn" data-act="invite">➕ ${esc(t('arm.invite.title'))}</button><button type="button" class="btn-sec btn-sec--sm" data-act="renewKey" title="${esc(t('arm.people.keyTitle'))}">🔑 ${esc(t('arm.people.renewKey'))}</button></div>
        ${inv.length ? `<p class="muted small">${esc(t('arm.people.invites'))} ${inv.map(([c, x]) => `<span class="code-chip code-chip--sm">${esc(c)}</span> ${esc(t('arm.people.until', { date: fmtDate(x.exp) }))} <button type="button" class="link-btn" data-uninvite="${esc(c)}">${esc(t('arm.people.cancelInv'))}</button>`).join(' ')}</p>` : ''}` : ''}
    </section>
  </div>`;
}
function bindTools() {
  const b = $('#amBody');
  if (!b) return;
  $('#amImport', b)?.addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openImport(f); });
  $('#amUndo', b)?.addEventListener('click', async () => {
    if (!A.undo || !confirm(t('arm.imp.undoAsk'))) return;
    try { await undoImport(A.aid, A.undo, A.lib, me()); A.undo = null; toast(t('arm.imp.undone')); paintTab(); } catch (err) { toast(userMsg(err), 'error'); }
  });
  b.querySelectorAll('[data-revoke]').forEach((x) => x.addEventListener('click', async () => {
    const u = x.dataset.revoke;
    const who = A.adminInfo?.[u]?.name || t('arm.people.thisDevice');
    const whoIt = A.adminInfo?.[u]?.name || 'questo dispositivo'; // i18n-ok: cronologia nel database
    if (!confirm(u === A.uid ? t('arm.people.leaveAsk') : t('arm.people.revokeAsk', { who }))) return;
    // Se era entrato con un invito, l'invito si cancella: con quello non può rientrare
    const usedInv = Object.entries(A.invites || {}).filter(([, x]) => x?.used === u).map(([c]) => [`invites/${c}`, null]);
    try { await update(armadioRef(A.aid), { [`admins/${u}`]: null, [`adminInfo/${u}`]: null, ...(A.role === 'owner' ? Object.fromEntries(usedInv) : {}) }); logEvent(A.aid, { op: 'people', msg: `revocato: ${whoIt}`, by: me() }); toast(t('common.done')); if (u === A.uid) location.reload(); } catch (err) { toast(userMsg(err), 'error'); } // i18n-ok: cronologia nel database
  }));
  b.querySelectorAll('[data-uninvite]').forEach((x) => x.addEventListener('click', async () => {
    try { await remove(armadioRef(A.aid, `invites/${x.dataset.uninvite}`)); toast(t('arm.people.invCancelled')); } catch (err) { toast(userMsg(err), 'error'); }
  }));
}

/** QR per fotografare e aggiungere i giochi dal telefono (con la chiave: il telefono diventa collaboratore). */
function openPhoneQR() {
  let k = '';
  try { k = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ }
  const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.searchParams.set('add', '1');
  if (k) u.hash = `ak=${k}`;
  Sheet.open(`${head(`📱 ${esc(t('arm.act.phone'))}`)}
    <p>${esc(t('arm.phone.lead'))}</p>
    <div class="hub-qr">${qrSVG(u.href)}</div>
    <p class="qr-url muted small"><a href="${esc(u.href)}" target="_blank" rel="noopener">${esc(u.href.replace(/^https?:\/\//, ''))}</a></p>
    <p class="muted small">${esc(k ? t('arm.phone.withKey') : t('arm.phone.noKey'))}</p>`);
}

async function createInvite(btn) {
  const code = randomCode(10);
  const exp = Date.now() + 7 * DAY;
  try {
    await busy(btn, () => set(armadioRef(A.aid, `invites/${code}`), { exp, role: 'editor', by: me().slice(0, 40) }));
    logEvent(A.aid, { op: 'people', msg: 'nuovo invito per un collaboratore', by: me() }); // i18n-ok: cronologia nel database
    const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.hash = `inv=${code}`;
    Sheet.open(`${head(`➕ ${esc(t('arm.invite.title'))}`)}
      <p>${t('arm.invite.lead')}</p>
      <div class="hub-qr">${qrSVG(u.href)}</div>
      <p class="hub-link-code"><span class="code-chip">${esc(code)}</span><button type="button" class="btn-sec btn-sec--sm" id="ivCopy">${esc(t('arm.invite.copy'))}</button></p>
      <p class="muted small">${esc(t('arm.invite.revokeHint'))}</p>`).querySelector('#ivCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(u.href); toast(t('arm.share.copied')); } catch { toast(u.href); }
    });
  } catch (err) { toast(userMsg(err), 'error'); }
}
async function renewKey(btn) {
  if (!confirm(t('arm.key.ask'))) return;
  const k = randomCode(8);
  try {
    await busy(btn, () => set(dbRef(`armadioKeys/${A.aid}`), k));
    try { localStorage.setItem(keyStore(), k); } catch { /* niente */ }
    Person.linkArmadio(A.aid, A.info?.name, k, true).catch(() => {});
    logEvent(A.aid, { op: 'people', msg: 'chiave dell’armadio cambiata', by: me() }); // i18n-ok: cronologia nel database
    toast(t('arm.key.done'));
  } catch (err) { toast(userMsg(err), 'error'); }
}

// Schede incomplete: una alla volta, solo i campi che mancano
function openWizard() {
  if (!canEdit()) return;
  const chosen = new Set(CHECK_FIELDS.filter((f) => f.k !== 'photo').map((f) => f.k));
  const el = Sheet.open(`${head(`✍️ ${esc(t('arm.wz.title'))}`)}
    <p>${esc(t('arm.wz.lead'))}</p>
    <div class="am-checks">${CHECK_FIELDS.map((f) => `<label class="quick-toggle"><input type="checkbox" data-wf="${f.k}" ${chosen.has(f.k) ? 'checked' : ''}><span>${f.label} (${items().filter((it) => !f.test(it)).length})</span></label>`).join('')}</div>
    <button type="button" class="btn btn-block" id="wzGo">${esc(t('arm.wz.start'))}</button>`, { wide: true });
  el.addEventListener('change', (e) => { const k = e.target.dataset?.wf; if (k) { if (e.target.checked) chosen.add(k); else chosen.delete(k); } });
  $('#wzGo', el).addEventListener('click', () => {
    const queue = sortItems(items().filter((it) => missingFields(it).some((k) => chosen.has(k))), 'name').map((it) => it.id);
    if (!queue.length) { toast(t('arm.wz.nothing')); return; }
    Sheet.close(el);
    wizardStep(queue, 0, chosen, 0);
  });
}
function wizardStep(queue, i, chosen, saved) {
  if (i >= queue.length) { Sheet.open(`${head(`✍️ ${esc(t('common.done'))}`)}<p>${t('arm.wz.done', { n: saved, total: queue.length })}</p><button type="button" class="btn btn-block" data-close>${esc(t('common.close'))}</button>`); return; }
  const id = queue[i]; const it = A.lib?.[id];
  if (!it) { wizardStep(queue, i + 1, chosen, saved); return; }
  const miss = missingFields(it).filter((k) => chosen.has(k));
  const uniq = (fn) => [...new Set(items().map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  let full = null;
  const fields = miss.map((k) => {
    if (k === 'players') return `<div class="am-grid2"><label><span class="field-label">${esc(t('arm.ed.min'))}</span><input class="input" type="number" min="1" max="20" id="wzMin"></label><label><span class="field-label">${esc(t('arm.ed.max'))}</span><input class="input" type="number" min="1" max="20" id="wzMax"></label></div>`;
    if (k === 'duration') return `<label><span class="field-label">${esc(t('arm.f.duration'))}</span><input class="input" type="number" min="1" max="600" id="wzDur"></label>`;
    if (k === 'mode') return `<label><span class="field-label">${esc(t('arm.f.mode'))}</span><select class="input select" id="wzMode"><option value="">—</option>${Object.entries(GAME_MODES).map(([m, l]) => `<option value="${m}">${l}</option>`).join('')}</select></label>`;
    if (k === 'weight') return `<label><span class="field-label">${esc(t('arm.wz.weight'))}</span><input class="input" type="number" min="1" max="5" step="0.5" id="wzW"></label>`;
    if (k === 'loc') return `<div class="am-grid2">${LOC_KEYS.map((x) => `<label><span class="field-label">${LOC_LABELS[x]}</span><input class="input" id="wzLoc_${x}" maxlength="30" list="wzdl_${x}" placeholder="${LOC_HINTS[x]}"></label>`).join('')}</div>${LOC_KEYS.map((x) => datalist(`wzdl_${x}`, uniq((g) => g.loc?.[x]))).join('')}`;
    if (k === 'photo') return `<button type="button" class="btn-sec" id="wzPhoto">📷 ${esc(t('arm.wz.photo'))}</button><input type="file" id="wzFile" accept="image/*" hidden><span id="wzPhotoOk"></span>`;
    return '';
  }).join('');
  const el = Sheet.open(`${head(`✍️ ${esc(t('arm.list.nOf', { n: i + 1, total: queue.length }))}`)}
    <div class="am-wz-progress" aria-hidden="true"><i style="width:${Math.round((i / queue.length) * 100)}%"></i></div>
    <div class="am-wz-head">${gameImageHTML(it, 'am-img am-img--xs')}<div><b>${esc(it.name)}</b><small class="muted">${esc(t('arm.wz.missing', { list: miss.map((k) => CHECK_FIELDS.find((f) => f.k === k).label).join(', ') }))}</small></div></div>
    <form id="wzForm" class="am-form" novalidate>${fields}<p class="form-error" id="wzErr" role="alert"></p>
      <div class="am-form-actions"><button type="submit" class="btn" id="wzSave">${esc(t('arm.wz.save'))}</button><button type="button" class="btn-sec" id="wzSkip">${esc(t('arm.wz.skip'))}</button><button type="button" class="link-btn" data-close>${esc(t('arm.wz.exit'))}</button></div></form>`, { wide: true });
  $('#wzPhoto', el)?.addEventListener('click', () => $('#wzFile', el).click());
  $('#wzFile', el)?.addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { full = await gameImage(f); $('#wzPhotoOk', el).textContent = ` ✓ ${t('arm.wz.photoOk')}`; } catch (err) { if (!err.cancelled) toast(err.message, 'error'); } });
  $('#wzSkip', el).addEventListener('click', () => { Sheet.close(el); wizardStep(queue, i + 1, chosen, saved); });
  $('#wzForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = (s) => { const v = $(s, el)?.value.trim(); return v ? Number(v.replace(',', '.')) : null; };
    const p = {};
    if ($('#wzMin', el)) { const a = n('#wzMin'); const b = n('#wzMax'); if (a && b && a > b) { $('#wzErr', el).textContent = t('arm.wz.errMinMax'); return; } if (a >= 1 && a <= 20) p.minPlayers = Math.round(a); if (b >= 1 && b <= 20) p.maxPlayers = Math.round(b); }
    if ($('#wzDur', el)) { const d = n('#wzDur'); if (d >= 1 && d <= 600) p.duration = Math.round(d); }
    if ($('#wzMode', el)?.value) p.mode = $('#wzMode', el).value;
    if ($('#wzW', el)) { const w = n('#wzW'); if (w >= 1 && w <= 5) p.weight = Math.round(w * 10) / 10; }
    if ($('#wzLoc_room', el)) { const l = cleanLoc(Object.fromEntries(LOC_KEYS.map((x) => [x, $(`#wzLoc_${x}`, el).value]))); if (l) p.loc = l; }
    let ok = saved;
    if (Object.keys(p).length || full) {
      try {
        await busy($('#wzSave', el), () => saveGame(A.aid, id, p, full ? { full } : {}));
        logEvent(A.aid, { op: 'edit', item: id, name: it.name, msg: `completata: ${diffSummary(it, p) || 'foto'}`, by: me() }); // i18n-ok: cronologia nel database
        ok++;
      } catch (ex) { $('#wzErr', el).textContent = userMsg(ex); return; }
    }
    Sheet.close(el);
    wizardStep(queue, i + 1, chosen, ok);
  });
}

// Duplicati: revisione coppia per coppia (niente viene cancellato da solo)
function openDups() {
  const pairs = duplicatePairs(A.lib);
  const card = (it) => `<div class="am-dup-card">${gameImageHTML(it, 'am-img am-img--xs')}<div><b>${esc(it.name)}</b><small>${[it.edition, it.language, it.year, it.copies > 1 && t('arm.game.copies', { n: it.copies }), hasLoc(it) && `📍 ${locText(it.loc)}`, it.ean && `EAN ${it.ean}`].filter(Boolean).map(esc).join(' · ') || '—'}</small></div></div>`;
  const el = Sheet.open(`${head(`👯 ${esc(t('arm.dups.title', { n: pairs.length }))}`)}
    <p class="muted small">${esc(t('arm.dups.lead'))}</p>
    <div class="am-dups">${pairs.map((p, n) => {
      const a = { id: p.a, ...A.lib[p.a] }; const b = { id: p.b, ...A.lib[p.b] };
      return `<section class="card am-dup" data-pair="${n}"><p><span class="am-tag">${DUP_KINDS[p.kind]}</span> <small class="muted">${esc(p.why)}</small></p>
        <div class="am-dup-pair">${card(a)}${card(b)}</div>
        <div class="hub-row">${p.kind === 'similar'
          ? `<button type="button" class="btn-sec btn-sec--sm" data-d="expB">🧩 ${esc(t('arm.dups.isExp', { a: b.name, b: a.name }))}</button><button type="button" class="btn-sec btn-sec--sm" data-d="expA">🧩 ${esc(t('arm.dups.isExp', { a: a.name, b: b.name }))}</button>`
          : `<button type="button" class="btn-sec btn-sec--sm" data-d="copy">➕ ${esc(t('arm.dups.merge'))}</button><button type="button" class="btn-sec btn-sec--sm" data-d="trashB">🗑️ ${esc(t('arm.dups.keepFirst'))}</button>`}
          <button type="button" class="btn-sec btn-sec--sm" data-d="ok">✓ ${esc(t('arm.dups.different'))}</button></div></section>`;
    }).join('') || `<p>${esc(t('arm.dups.none'))}</p>`}</div>`, { wide: true });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const p = pairs[Number(b.closest('[data-pair]').dataset.pair)];
    const A1 = A.lib[p.a]; const B1 = A.lib[p.b];
    if (!A1 || !B1) { toast(t('arm.dups.gone'), 'warn'); return; }
    try {
      await busy(b, async () => {
        if (b.dataset.d === 'ok') await update(armadioRef(A.aid), { [`library/${p.a}/dupOk/${p.b}`]: true, [`library/${p.b}/dupOk/${p.a}`]: true });
        else if (b.dataset.d === 'expB') await saveGame(A.aid, p.b, { baseId: p.a });
        else if (b.dataset.d === 'expA') await saveGame(A.aid, p.a, { baseId: p.b });
        else if (b.dataset.d === 'copy') {
          if (B1.loanId) throw Object.assign(new Error(t('arm.dups.lentMerge', { name: B1.name })), { user: true });
          const fill = {};
          for (const k of ['minPlayers', 'maxPlayers', 'duration', 'mode', 'weight', 'language', 'publisher', 'year', 'loc', 'ean', 'rules', 'setup', 'video']) if ((A1[k] === undefined || A1[k] === null) && B1[k] !== undefined && B1[k] !== null) fill[k] = B1[k];
          await saveGame(A.aid, p.a, { ...fill, copies: (Number(A1.copies) || 1) + (Number(B1.copies) || 1) });
          await trashGame(A.aid, p.b, B1, me());
        } else if (b.dataset.d === 'trashB') {
          if (B1.loanId) throw Object.assign(new Error(t('arm.dups.lent', { name: B1.name })), { user: true });
          await trashGame(A.aid, p.b, B1, me());
        }
        logEvent(A.aid, { op: 'dup', item: p.a, name: A1.name, msg: { ok: `diverso da ${B1.name}`, expB: `${B1.name} è sua espansione`, expA: `espansione di ${B1.name}`, copy: `unito con ${B1.name}`, trashB: `${B1.name} nel cestino (doppione)` }[b.dataset.d], by: me() }); // i18n-ok: cronologia nel database
      });
      b.closest('[data-pair]').remove();
      toast(t('common.done'));
    } catch (err) { toast(userMsg(err), 'error'); }
  });
}

// Esporta / importa
const stamp = () => new Date().toISOString().slice(0, 10);
const fileName = (ext) => `armadio_${(A.info?.name || A.aid).replace(/[^\w-]+/g, '_').slice(0, 30)}_${stamp()}.${ext}`;
function exportCSV() { downloadFile(fileName('csv'), toCSV(A.lib), 'text/csv;charset=utf-8'); toast(t('arm.exp.csv')); }
function exportJSON() { downloadFile(fileName('json'), toJSON(A.info, A.lib, { withThumbs: true }), 'application/json'); toast(t('arm.exp.json')); }
async function openImport(file) {
  if (file.size > 8 * 1024 * 1024) { toast(t('arm.imp.tooBig'), 'error'); return; }
  let parsed;
  try { parsed = readImportFile(file.name, await file.text()); } catch (err) { Sheet.open(`${head(`📥 ${esc(t('arm.imp.title'))}`)}<p class="form-error">${esc(err.user ? err.message : t('arm.imp.unreadable'))}</p>`); return; }
  let mode = 'add';
  const el = Sheet.open(`${head(`📥 ${esc(t('arm.imp.titleFile', { name: file.name }))}`)}<div id="imBody"></div>`, { wide: true });
  const paint = () => {
    const plan = planImport(parsed.rows, A.lib, mode, { bgg: parsed.bgg });
    $('#imBody', el).innerHTML = `
      <p class="muted small">${esc(t('arm.imp.previewLead'))}</p>
      <div class="seg" role="radiogroup" aria-label="${esc(t('arm.imp.mode'))}"><button type="button" data-mode="add" aria-pressed="${mode === 'add'}">🛡️ ${esc(t('arm.imp.modeAdd'))}</button><button type="button" data-mode="merge" aria-pressed="${mode === 'merge'}">🧩 ${esc(t('arm.imp.modeMerge'))}</button></div>
      <ul class="am-im-sum">
        <li>${t('arm.imp.rows', { n: plan.total, kind: parsed.kind })}${parsed.bgg ? esc(t('arm.imp.fromBgg')) : ''})</li>
        <li>✅ ${t('arm.imp.toAdd', { n: plan.add.length })}</li>
        ${mode === 'merge' ? `<li>🧩 ${t('arm.imp.toUpdate', { n: plan.update.length })}</li>` : ''}
        <li>⏭️ ${t(mode === 'merge' ? 'arm.imp.sameMerge' : 'arm.imp.sameAdd', { n: plan.same.length })}</li>
        ${plan.dupInFile.length ? `<li>👯 ${t('arm.imp.dupInFile', { n: plan.dupInFile.length })}</li>` : ''}
        ${plan.invalid.length ? `<li>❌ ${t('arm.imp.invalid', { n: plan.invalid.length })}</li>` : ''}
        ${plan.warnings ? `<li>⚠️ ${esc(t('arm.imp.warnings', { n: plan.warnings }))}</li>` : ''}
      </ul>
      ${plan.add.length ? `<details class="hub-details" open><summary>${esc(t('arm.imp.listAdd', { n: plan.add.length }))}</summary><ul class="am-mini-list">${plan.add.slice(0, 200).map((a) => `<li><b>${esc(a.game.name)}</b>${a.game.edition ? ` · ${esc(a.game.edition)}` : ''}${a.warnings.length ? ` <small class="am-warn">⚠️ ${esc(a.warnings.join('; '))}</small>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${plan.update.length ? `<details class="hub-details"><summary>${esc(t('arm.imp.listUpdate', { n: plan.update.length }))}</summary><ul class="am-mini-list">${plan.update.slice(0, 200).map((u) => `<li><b>${esc(u.name)}</b>: ${esc(Object.keys(u.patch).join(', '))}</li>`).join('')}</ul></details>` : ''}
      ${plan.invalid.length ? `<details class="hub-details"><summary>${esc(t('arm.imp.listInvalid', { n: plan.invalid.length }))}</summary><ul class="am-mini-list">${plan.invalid.map((x) => `<li>${esc(t('arm.imp.row', { row: String(x.row) }))} ${esc(x.name)} — ${esc(x.why)}</li>`).join('')}</ul></details>` : ''}
      ${plan.dupInFile.length ? `<details class="hub-details"><summary>${esc(t('arm.imp.listDup', { n: plan.dupInFile.length }))}</summary><ul class="am-mini-list">${plan.dupInFile.map((x) => `<li>${esc(t('arm.imp.row', { row: String(x.row) }))} ${esc(x.name)} ${esc(t('arm.imp.sameAs', { row: String(x.first) }))}</li>`).join('')}</ul></details>` : ''}
      <p class="form-error" id="imErr" role="alert"></p>
      <div class="am-form-actions"><button type="button" class="btn" id="imGo" ${plan.add.length || plan.update.length ? '' : 'disabled'}>${esc(t('arm.imp.go', { n: plan.add.length + plan.update.length }))}</button><button type="button" class="btn-sec" data-close>${esc(t('common.cancel'))}</button></div>`;
    $('#imGo', el).addEventListener('click', async (e) => {
      try {
        const r = await busy(e.currentTarget, () => applyImport(A.aid, plan, A.lib, me()));
        A.undo = r.undo;
        Sheet.close(el);
        Sheet.open(`${head(`📥 ${esc(t('arm.imp.done'))}`)}
          <p>${t('arm.imp.doneAdded', { n: r.added })} · ${t('arm.imp.doneUpdated', { n: r.updated })}${plan.same.length ? ` · ⏭️ ${esc(t('arm.imp.doneSame', { n: plan.same.length }))}` : ''}${plan.invalid.length ? ` · ❌ ${esc(t('arm.imp.doneInvalid', { n: plan.invalid.length }))}` : ''}.</p>
          ${r.failed.length ? `<p class="form-error">${esc(t('arm.imp.failed', { n: r.failed.length, names: r.failed.map((f) => f.name).join(', ') }))}</p>` : ''}
          <button type="button" class="btn-sec" id="imUndo">↶ ${esc(t('arm.imp.undoThis'))}</button>`).querySelector('#imUndo').addEventListener('click', async (ev) => {
          if (!confirm(t('arm.imp.undoThisAsk'))) return;
          try { await busy(ev.currentTarget, () => undoImport(A.aid, A.undo, A.lib, me())); A.undo = null; toast(t('arm.imp.undone')); Sheet.closeAll(); } catch (err) { toast(userMsg(err), 'error'); }
        });
      } catch (err) { $('#imErr', el).textContent = userMsg(err); }
    });
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { mode = b.dataset.mode; paint(); } });
  paint();
}

// Etichette QR stampabili
function gameLink(id) {
  const u = A.pub ? publicUrl('armadio.html') : publicUrl('armadio.html');
  if (A.pub) u.searchParams.set('p', A.token); else u.searchParams.set('a', A.aid);
  u.searchParams.set('g', id);
  return u.href;
}
function printLabels(list, { shelf = '' } = {}) {
  const arr = list.filter((it) => it?.name);
  if (!arr.length && !shelf) { toast(t('arm.labels.none'), 'warn'); return; }
  const data = []; // gli stessi dati per il PDF dell'app Android
  const lab = (title, sub, ref, url) => {
    data.push({ title, sub, ref, url });
    return `<div class="lab"><div class="q">${qrSVG(url)}</div><div class="t"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<small>${esc(ref)}</small></div></div>`;
  };
  let labels = '';
  if (shelf) {
    const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.searchParams.set('pos', shelf);
    labels += lab(`📍 ${shelf}`, `${t('arm.n.games', { n: arr.length })} · ${A.info?.name || ''}`, t('arm.labels.ref', { code: A.aid }), u.href);
  }
  labels += arr.map((it) => lab(it.name, hasLoc(it) ? locText(it.loc) : '', `${A.info?.name || t('arm.armadio')} · ${A.aid}·${String(it.id).slice(-4)}`, gameLink(it.id))).join('');
  const heading = t('arm.labels.heading', { name: A.info?.name || t('arm.armadio'), date: fmtDateI(new Date(), { day: 'numeric', month: 'numeric', year: 'numeric' }) });
  const html = `<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><title>${esc(t('arm.labels.docTitle', { name: A.info?.name || t('arm.armadio') }))}</title>
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Atkinson Hyperlegible Next', 'Segoe UI', Arial, sans-serif; color: #1F1A3D; }
h1 { font-size: 12pt; margin: 0 0 4mm; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.lab { display: flex; gap: 3mm; align-items: center; border: 0.4mm dashed #888; border-radius: 3mm; padding: 3mm; height: 34mm; break-inside: avoid; overflow: hidden; }
.q { width: 26mm; height: 26mm; flex-shrink: 0; }
.q svg { width: 100%; height: 100%; display: block; }
.t { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.t b { font-size: 11pt; line-height: 1.15; overflow-wrap: anywhere; }
.t span { font-size: 8.5pt; }
.t small { font-size: 7pt; color: #555; }
</style></head><body><h1>🏷️ ${esc(heading)}</h1><div class="grid">${labels}</div></body></html>`;
  exportLabels(html, { heading, labels: data });
}

// Link pubblico
function openShare() {
  if (!canEdit()) return;
  const tok = A.share?.token;
  const f = { ...A.pubFields };
  const el = Sheet.open(`${head(`🔗 ${esc(t('arm.share.title'))}`)}
    <p>${t('arm.share.lead')}</p>
    <h3>${esc(t('arm.share.what'))}</h3>
    <ul class="am-mini-list"><li>✅ ${esc(t('arm.share.shown'))}</li>
      <li>🚫 ${esc(t('arm.share.never'))}</li></ul>
    <label class="quick-toggle"><input type="checkbox" id="shStatus" ${f.status ? 'checked' : ''}><span>${esc(t('arm.share.status'))}</span></label>
    <label class="quick-toggle"><input type="checkbox" id="shLoc" ${f.loc ? 'checked' : ''}><span>${esc(t('arm.share.loc'))}</span></label>
    <label class="quick-toggle"><input type="checkbox" id="shExp" ${f.exp ? 'checked' : ''}><span>${esc(t('pub.exp'))}</span></label>
    <label class="quick-toggle"><input type="checkbox" id="shRules" ${f.rules ? 'checked' : ''}><span>${esc(t('pub.rules'))}</span></label>
    <label class="quick-toggle"><input type="checkbox" id="shOnlyAvail" ${f.onlyAvail ? 'checked' : ''}><span>${esc(t('pub.onlyAvail'))}</span></label>
    <div class="rg-row"><button type="button" class="btn-sec btn-sec--sm" id="shPreview">👁️ <span>${esc(t('pub.preview'))}</span></button>${tok ? `<a class="btn-sec btn-sec--sm" id="shOpen" target="_blank" rel="noopener" href="${esc((() => { const u = publicUrl('armadio.html'); u.searchParams.set('p', tok); return u.href; })())}">↗ <span>${esc(t('pub.open'))}</span></a>` : ''}</div>
    <div id="shPrevBox" class="sh-prev" hidden></div>
    <div id="shLink"></div>
    <p class="form-error" id="shErr" role="alert"></p>
    <div class="am-form-actions">${tok ? `<button type="button" class="btn" id="shSave">${esc(t('common.save'))}</button><button type="button" class="btn-sec" id="shRenew">🔁 ${esc(t('arm.share.renew'))}</button><button type="button" class="btn-sec am-danger" id="shOff">${esc(t('arm.share.off'))}</button>` : `<button type="button" class="btn" id="shOn">${esc(t('arm.tools.shareCreate'))}</button>`}</div>`, { wide: true });
  const paintLink = (tk) => {
    if (!tk) { $('#shLink', el).innerHTML = ''; return; }
    const u = publicUrl('armadio.html'); u.searchParams.set('p', tk);
    $('#shLink', el).innerHTML = `<div class="hub-qr">${qrSVG(u.href)}</div><p class="hub-link-code"><input class="input input--sm" readonly value="${esc(u.href)}" aria-label="${esc(t('arm.share.title'))}"><button type="button" class="btn-sec btn-sec--sm" id="shCopy">${esc(t('common.copy'))}</button></p>`;
    $('#shCopy', el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(u.href); toast(t('arm.share.copied')); } catch { toast(u.href); } });
  };
  paintLink(tok);
  const read = () => pubFieldsOf({ status: $('#shStatus', el).checked, loc: $('#shLoc', el).checked, exp: $('#shExp', el).checked, rules: $('#shRules', el).checked, onlyAvail: $('#shOnlyAvail', el).checked });
  // Anteprima: esattamente quello che vedrà chi apre il link, calcolato qui senza pubblicare niente.
  const preview = () => {
    const fields = read();
    const list = items().filter((it) => pubIncludes(it, fields)).map((it) => ({ id: it.id, ...pubGame(it, fields) })).sort((a, b) => a.name.localeCompare(b.name));
    const box = $('#shPrevBox', el);
    box.hidden = false;
    box.innerHTML = `<p class="muted small">${esc(t('pub.previewCount', { n: list.length, total: items().length }))}</p>
      <ul class="sh-prev-list">${list.slice(0, 12).map((g) => `<li>${gameImageHTML(g, 'am-img am-img--xs')}<span><b>${esc(g.name)}</b><small>${esc([g.minPlayers || g.maxPlayers ? `👥 ${g.minPlayers || '?'}–${g.maxPlayers || '?'}` : '', g.duration ? `⏱️ ${g.duration}′` : '', fields.status ? (g.avail === false ? t('pub.off') : t('pub.on')) : '', fields.loc && g.loc ? `📍 ${locText(g.loc)}` : '', g.rules ? t('pub.hasRules') : ''].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>
      ${list.length > 12 ? `<p class="muted small">${esc(t('pub.more', { n: list.length - 12 }))}</p>` : ''}`;
  };
  $('#shPreview', el).addEventListener('click', preview);
  el.addEventListener('change', (e) => { if (e.target.closest('input[type=checkbox]') && !$('#shPrevBox', el).hidden) preview(); });
  const publish = async (tk, fields, prev) => {
    A.pubFields = fields;
    const n = await syncPublic(tk, A.aid, A.info, A.lib, fields, prev);
    A.pubPrev = Object.fromEntries(items().filter((it) => pubIncludes(it, fields)).map((it) => [it.id, pubGame(it, fields)]));
    return n;
  };
  $('#shOn', el)?.addEventListener('click', async (e) => {
    try {
      const tk = newToken();
      await busy(e.currentTarget, async () => { await publish(tk, read(), {}); await set(armadioRef(A.aid, 'share'), { token: tk }); });
      logEvent(A.aid, { op: 'share', msg: 'link pubblico creato', by: me() }); // i18n-ok: cronologia nel database
      Sheet.close(el); openShare();
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shSave', el)?.addEventListener('click', async (e) => {
    try { await busy(e.currentTarget, () => publish(tok, read(), A.pubPrev || {})); toast(t('arm.share.saved')); } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shRenew', el)?.addEventListener('click', async (e) => {
    if (!confirm(t('arm.share.renewAsk'))) return;
    try {
      const tk = newToken();
      await busy(e.currentTarget, async () => { await publish(tk, read(), {}); await set(armadioRef(A.aid, 'share'), { token: tk }); await remove(dbRef(`pub/${tok}`)); });
      logEvent(A.aid, { op: 'share', msg: 'link pubblico rigenerato', by: me() }); // i18n-ok: cronologia nel database
      Sheet.close(el); openShare();
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shOff', el)?.addEventListener('click', async (e) => {
    if (!confirm(t('arm.share.offAsk'))) return;
    try {
      await busy(e.currentTarget, async () => { await remove(dbRef(`pub/${tok}`)); await remove(armadioRef(A.aid, 'share')); });
      A.pubPrev = null;
      logEvent(A.aid, { op: 'share', msg: 'link pubblico disattivato', by: me() }); // i18n-ok: cronologia nel database
      toast(t('arm.share.offDone')); Sheet.close(el);
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
}

// Spostare giochi in un altro armadio
async function openMove(ids) {
  if (!canEdit()) return;
  const its = ids.map((id) => ({ id, ...A.lib[id] })).filter((x) => x.name);
  const targets = otherArmadi();
  if (!targets.length) { toast(t('arm.move.noTargets'), 'warn'); return; }
  const lent = its.filter((x) => x.loanId);
  const orphanExp = its.flatMap((x) => expansionsOf(A.lib, x.id)).filter((x) => !ids.includes(x.id));
  const el = Sheet.open(`${head(`🚚 ${esc(t('arm.move.title', { what: its.length === 1 ? its[0].name : t('arm.n.games', { n: its.length }) }))}`)}
    <label><span class="field-label">${esc(t('arm.move.to'))}</span><select class="input select" id="mvTo">${targets.map((x) => `<option value="${esc(x.id)}">${esc(x.name || x.id)} (${esc(x.id)})</option>`).join('')}</select></label>
    <ul class="am-mini-list">
      <li>${esc(t('arm.move.info'))}</li>
      <li>📍 ${esc(t('arm.move.loc'))}</li>
      ${lent.length ? `<li>🤝 ${t('arm.move.lent', { n: lent.length })}</li>` : ''}
      ${orphanExp.length ? `<li>🧩 ${esc(t('arm.move.orphans', { names: orphanExp.map((x) => `“${x.name}”`).join(', ') }))}</li>` : ''}
    </ul>
    <p class="form-error" id="mvErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="mvGo">${esc(t('arm.sel.move'))}</button>`);
  $('#mvGo', el).addEventListener('click', async (e) => {
    const to = $('#mvTo', el).value;
    try {
      await busy(e.currentTarget, async () => {
        // Bisogna poter modificare anche l'armadio di destinazione
        const info = (await get(armadioRef(to, 'info'))).val();
        if (!info) throw Object.assign(new Error(t('arm.move.gone')), { user: true });
        let okTo = info.ownerUid === A.uid || (await get(armadioRef(to, `admins/${A.uid}`)).catch(() => null))?.val() === true;
        const key = targets.find((x) => x.id === to)?.key || (() => { try { return localStorage.getItem(`gnr_akey_${to}`) || ''; } catch { return ''; } })();
        if (!okTo && key) {
          try { await set(dbRef(`armadioKeyClaims/${to}/${A.uid}`), key); await set(armadioRef(to, `admins/${A.uid}`), true); okTo = true; } catch { /* niente */ }
        }
        if (!okTo) throw Object.assign(new Error(t('arm.move.noRights')), { user: true });
        const r = await moveGames(A.aid, to, ids, A.lib, A.loans, me());
        ids.forEach((id) => A.sel.delete(id));
        Sheet.close(el);
        Sheet.open(`${head(`🚚 ${esc(t('arm.move.done'))}`)}<p>✅ ${esc(t('arm.move.moved', { n: r.moved.length, name: info.name }))}</p>${r.failed.length ? `<p class="form-error">❌ ${esc(t('arm.move.failed', { names: r.failed.map((x) => x.name).join(', ') }))}</p>` : ''}<a class="btn-sec" href="${esc(armHref(to))}">${esc(t('arm.move.open', { name: info.name }))}</a>`);
      });
    } catch (err) { $('#mvErr', el).textContent = userMsg(err); }
  });
}

// Viste salvate (filtri + ordinamento + vista)
const viewsKey = () => `gnr_amviews_${A.aid || A.token}`;
function openViews() {
  const list = ls.get(viewsKey(), []) || [];
  const el = Sheet.open(`${head(`⭐ ${esc(t('arm.views.title'))}`)}
    ${list.length ? `<ul class="am-views-list">${list.map((v, i) => `<li><button type="button" class="am-view-go" data-vgo="${i}"><b>${esc(v.name)}</b><small>${esc(activeFilters(v.f).map((c) => c.label).join(' · ') || t('arm.views.noFilter'))}${v.f?.text ? ` · “${esc(v.f.text)}”` : ''} · ${esc(SORTS[v.sort] || '')}</small></button><button type="button" class="icon-btn" data-vren="${i}" aria-label="${esc(t('arm.views.rename'))}">✏️</button><button type="button" class="icon-btn" data-vdel="${i}" aria-label="${esc(t('arm.views.delete'))}">🗑️</button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('arm.views.none'))}</p>`}
    <div class="hub-code-row"><input class="input" id="vName" maxlength="40" placeholder="${esc(t('arm.views.namePh'))}"><button type="button" class="btn" id="vSave">${esc(t('common.save'))}</button></div>
    <p class="muted small">${esc(t('arm.views.local'))}</p>`);
  const save = (l) => ls.set(viewsKey(), l);
  $('#vSave', el).addEventListener('click', () => {
    const name = cleanName($('#vName', el).value, 40);
    if (!name) { toast(t('arm.views.needName'), 'warn'); return; }
    const next = [...list.filter((v) => v.name !== name), { name, f: { ...A.f }, sort: A.sort, view: A.view }].slice(-20);
    save(next); toast(`⭐ ${t('arm.views.saved', { name })}`); Sheet.close(el);
  });
  el.addEventListener('click', (e) => {
    const go = e.target.closest('[data-vgo]'); const ren = e.target.closest('[data-vren]'); const del = e.target.closest('[data-vdel]');
    if (go) { const v = list[Number(go.dataset.vgo)]; A.f = { ...(v.f || {}) }; A.sort = v.sort || 'name'; A.view = v.view || 'grid'; Sheet.close(el); A.tab = 'games'; paintTabs(); mountGames(); return; }
    if (ren) { const v = list[Number(ren.dataset.vren)]; const n = cleanName(prompt(t('arm.views.renameAsk'), v.name) || '', 40); if (n) { v.name = n; save(list); Sheet.close(el); openViews(); } return; }
    if (del) { const v = list[Number(del.dataset.vdel)]; if (confirm(t('arm.views.deleteAsk', { name: v.name }))) { list.splice(Number(del.dataset.vdel), 1); save(list); Sheet.close(el); openViews(); } }
  });
}

// ---------------------------------------------------------------------------
// Catalogo pubblico (link condiviso, sola lettura)
// ---------------------------------------------------------------------------

function bootPublic() {
  A.role = 'viewer';
  A.stops.push(onValue(dbRef(`pub/${A.token}`), (s) => {
    const v = s.val();
    if (!v) {
      app.innerHTML = `<main class="phone phone--center"><p class="lock-big" aria-hidden="true">🔒</p><h1 class="ph-title">${esc(t('arm.pub.invalid'))}</h1><p class="ph-lead">${esc(t('arm.pub.invalidLead'))}</p><a class="btn-sec" href="index.html">🏠 Home</a></main>`;
      return;
    }
    A.pubInfo = { name: v.name, desc: v.desc, emoji: v.emoji };
    A.pubFields = pubFieldsOf(v.fields);
    A.lib = v.games || {};
    A.loaded = true;
    if (!$('#amBody')) mount();
    refresh();
    const gid = param('g');
    if (gid && !A.openedG) { A.openedG = true; setTimeout(() => openGame(gid), 200); }
  }, (err) => showFatal(app, t('arm.pub.unavailable'), explainError(err))));
}

// Tema (impostazioni minime anche qui)
document.addEventListener('click', (e) => { if (e.target.closest('[data-act="theme"]')) Sheet.open(`${head(esc(t('arm.theme')))}${themeSwitchHTML('amTheme')}<h3>${esc(t('common.language'))}</h3>${langSwitchHTML('amLang')}`); });

boot();
