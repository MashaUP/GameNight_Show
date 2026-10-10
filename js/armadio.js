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
import { printReport } from './report.js';
import {
  LOC_KEYS, LOC_LABELS, LOC_HINTS, cleanLoc, hasLoc, locText, shelfKey, normTitle, duplicatePairs, duplicateIds, DUP_KINDS,
  CHECK_FIELDS, missingFields, expansionsOf, available, applyFilters, activeFilters, SORTS, sortItems,
  fullImage, saveGame, newGameId, migrateImages, logEvent, diffSummary, OPS, trashGame, restoreGame, purgeGame,
  loansOf, activeLoans, isOverdue, lendGame, updateLoan, returnGame, DAY, toCSV, toJSON, readImportFile, planImport,
  applyImport, undoImport, newToken, pubGame, syncPublic, moveGames, summary
} from './collection.js';

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
  sel: new Set(), selecting: false, limit: PAGE, lastSig: '', pubPrev: null, pubFields: { status: true, loc: false }, undo: null, stops: [], loaded: false
};
const ls = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ } }
};
const me = () => Person.data?.info?.name || (A.role === 'owner' ? 'Proprietario' : 'Collaboratore');
const canEdit = () => A.role === 'owner' || A.role === 'editor';
const canAdd = () => canEdit() || A.role === 'member';
const items = () => Object.entries(A.lib || {}).filter(([, it]) => it?.name).map(([id, it]) => ({ id, ...it }));
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtWhen = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

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
const head = (t) => `<div class="panel-head"><h2>${t}</h2><button type="button" class="icon-btn" data-close aria-label="Chiudi">✕</button></div>`;
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
  if (!A.pub && !CODE6.test(A.aid)) { showFatal(app, 'Armadio non trovato', 'Nel link manca il codice dell’armadio (6 caratteri). Aprilo dalla home: “I tuoi armadi”.'); return; }
  app.innerHTML = '<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>Apro l’armadio…</p></div>';
  try {
    A.uid = await connect();
    Person.uid = A.uid;
    await Person.load().catch(() => null);
  } catch (err) { showFatal(app, 'Impossibile collegarsi', explainError(err)); return; }
  A.view = ls.get('gnr_am_view', 'grid');
  A.sort = ls.get('gnr_am_sort', 'name');
  if (A.pub) return bootPublic();
  let info;
  try { info = (await get(armadioRef(A.aid, 'info'))).val(); } catch (err) { showFatal(app, 'Impossibile leggere l’armadio', explainError(err)); return; }
  if (!info) { showFatal(app, 'Armadio non trovato', 'Questo armadio non esiste più o il codice è sbagliato.'); return; }
  A.info = info;
  await claimAccess(info);
  mount();
  watch();
  const pos = param('pos');
  if (pos) { A.f = { shelf: pos }; paintGames(); }
  const gid = param('g');
  if (gid) setTimeout(() => openGame(gid), 300);
  if (param('add') === '1' && canAdd()) setTimeout(() => openEditor(null), 300);
  // Ricaricando la pagina non si riapre la finestra di prima
  if (gid || pos || param('add')) history.replaceState(null, '', `${location.pathname}?a=${A.aid}`);
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
        toast(`Ora puoi modificare “${info.name}”`);
      } catch { toast('Invito non valido o scaduto: chiedi un nuovo invito a chi ti ha condiviso l’armadio.', 'warn'); }
    }
    if (A.role === 'viewer' && await val(`uids/${A.uid}`) === true) A.role = 'member';
  }
  if (A.role === 'editor') {
    const known = await val(`adminInfo/${A.uid}`);
    if (!known) set(armadioRef(A.aid, `adminInfo/${A.uid}`), { name: (Person.data?.info?.name || 'Dispositivo').slice(0, 40), at: Date.now() }).catch(() => {});
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
    on('loans', 'loans', refresh);
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
    const r = await migrateImages(A.aid, A.lib, { max: 40, onStep: (d, t) => { if (bar) { bar.hidden = false; bar.textContent = `📦 Alleggerisco le foto dell’armadio: ${d} di ${Math.min(t, 40)}…`; } } }).catch(() => null);
    if (bar) bar.hidden = true;
    migrating = false;
    if (r?.done) toast(`Foto alleggerite: ${r.done}${r.left ? ` (ne restano ${r.left}, continuo alla prossima apertura)` : ''}`);
  }, 1500);
}

// Catalogo pubblico: tiene aggiornata la copia in sola lettura (solo i giochi cambiati)
let pubTimer = null;
async function loadPubPrev() {
  if (!A.share?.token) { A.pubPrev = null; return; }
  try {
    const v = (await get(dbRef(`pub/${A.share.token}`))).val();
    A.pubPrev = v?.games || {};
    if (v?.fields) A.pubFields = { status: Boolean(v.fields.status), loc: Boolean(v.fields.loc) };
    schedulePub();
  } catch { A.pubPrev = null; }
}
function schedulePub() {
  if (!canEdit() || !A.share?.token || A.pubPrev === null || !A.loaded) return;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(async () => {
    try {
      await syncPublic(A.share.token, A.aid, A.info, A.lib, A.pubFields, A.pubPrev);
      A.pubPrev = Object.fromEntries(items().map((it) => [it.id, pubGame(it, A.pubFields)]));
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
        <a class="btn-sec btn-sec--sm ph-back" href="index.html" id="amBack" aria-label="Indietro">←</a>
        <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
        <a class="ph-home" href="index.html" aria-label="Home" title="Home">🏠</a>
      </header>
      <section class="card am-hero" id="amHero"></section>
      <p class="arm-ro am-migr" id="amMigr" hidden></p>
      <nav class="am-tabs" id="amTabs" aria-label="Sezioni dell’armadio"></nav>
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
  return { owner: '👑 Proprietario', editor: '✏️ Collaboratore', member: '🎲 Giocatore (puoi aggiungere giochi)', viewer: '👀 Sola lettura' }[A.role] || '';
}

function paintHero() {
  const h = $('#amHero');
  if (!h) return;
  const s = summary(A.lib, A.loans);
  const info = A.pub ? A.pubInfo || {} : A.info || {};
  document.title = `${info.name || 'Armadio'} · GameNight Show`;
  h.innerHTML = `
    <div class="am-title">
      <span class="am-emoji" aria-hidden="true">${esc(info.emoji || '📦')}</span>
      <div class="am-title-text">
        <h1 id="amName">${esc(info.name || 'Armadio')}</h1>
        ${info.desc ? `<p class="am-desc">${esc(info.desc)}</p>` : ''}
        <p class="am-meta">${A.pub ? '🔗 Catalogo pubblico, in sola lettura' : `${roleLabel()} · codice <b>${esc(A.aid)}</b>`}</p>
      </div>
    </div>
    <div class="am-stats">
      <span><b>${s.games}</b> ${s.games === 1 ? 'gioco' : 'giochi'}</span>${s.expansions ? `<span><b>${s.expansions}</b> ${s.expansions === 1 ? 'espansione' : 'espansioni'}</span>` : ''}
      ${!A.pub && canEdit() ? `<span class="${s.overdue ? 'is-warn' : ''}"><b>${s.lent}</b> in prestito${s.overdue ? ` · ${s.overdue} in ritardo` : ''}</span>` : ''}
      ${s.isNew ? `<span><b>${s.isNew}</b> da provare</span>` : ''}
    </div>
    <div class="am-actions">
      ${canAdd() ? '<button type="button" class="btn" data-act="add">➕ <span>Aggiungi un gioco</span></button>' : ''}
      <button type="button" class="btn-sec" data-act="find">📍 <span>Trova il gioco</span></button>
      ${A.role === 'owner' ? '<button type="button" class="btn-sec" data-act="editInfo">✏️ <span>Modifica armadio</span></button>' : ''}
      ${canEdit() && !A.pub ? '<button type="button" class="btn-sec am-desk-only" data-act="phoneQR">📱 <span>Aggiungi dal telefono</span></button>' : ''}
      ${!A.pub ? `<a class="btn-sec" href="host.html?usaArmadio=${esc(A.aid)}">📺 <span>Crea una serata</span></a>` : ''}
    </div>`;
}

function paintTabs() {
  const n = $('#amTabs');
  if (!n) return;
  if (A.pub || !canEdit()) { n.hidden = true; return; }
  n.hidden = false;
  const s = summary(A.lib, A.loans);
  const t = Object.keys(A.trash || {}).length;
  const tab = (k, l) => `<button type="button" class="am-tab" data-tab="${k}" aria-pressed="${A.tab === k}">${l}</button>`;
  n.innerHTML = tab('games', '🎲 Giochi') + tab('loans', `🤝 Prestiti${s.lent ? ` <small>${s.lent}</small>` : ''}`) + tab('log', '🕘 Cronologia') + tab('trash', `🗑️ Cestino${t ? ` <small>${t}</small>` : ''}`) + tab('tools', '🧰 Strumenti');
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
  const views = [['grid', '▦ Griglia'], ['list', '☰ Lista'], ['shelves', '🗄️ Scaffali']];
  b.innerHTML = `
    <div class="am-layout">
      <aside class="am-side" id="amSide" aria-label="Filtri"></aside>
      <div class="am-main">
        <div class="am-toolbar">
          <label class="sr-only" for="amSearch">Cerca</label>
          <input class="input am-search" id="amSearch" type="search" autocomplete="off" placeholder="🔎 Nome, etichetta o posto" title="Cerca per nome, titolo originale, etichetta, editore, posizione o codice a barre" value="${esc(A.f.text || '')}">
          <button type="button" class="btn-sec am-filter-btn" data-act="filters">⚙️ <span>Filtri</span><b id="amFCount"></b></button>
          <label class="sr-only" for="amSort">Ordina</label>
          <select class="input select am-sort" id="amSort">${Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${A.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="seg am-views" role="group" aria-label="Vista">${views.map(([k, l]) => `<button type="button" data-view="${k}" aria-pressed="${A.view === k}">${l}</button>`).join('')}</div>
          <button type="button" class="btn-sec" data-act="views" title="Viste salvate">⭐ <span>Viste</span></button>
          ${canEdit() ? `<button type="button" class="btn-sec" data-act="select" aria-pressed="${A.selecting}">☑️ <span>Seleziona</span></button>` : ''}
        </div>
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
      <div class="am-f"><span class="field-label">Quanti siete</span>${num('players', 'n. giocatori', 1, 20)}</div>
      <div class="am-f"><span class="field-label">Durata (minuti)</span><div class="am-pair">${num('durMin', 'da', 1, 600)}${num('durMax', 'a', 1, 600)}</div></div>
      <div class="am-f"><span class="field-label">Tipologia</span>${sel('mode', Object.entries(GAME_MODES), 'Tutte')}</div>
      <div class="am-f"><span class="field-label">Difficoltà (1–5)</span><div class="am-pair">${num('wMin', 'da', 1, 5)}${num('wMax', 'a', 1, 5)}</div></div>
      ${!A.pub || A.pubFields.status ? `<div class="am-f"><span class="field-label">Disponibilità</span>${sel('avail', [['si', 'Disponibili'], ['no', 'Non disponibili']], 'Tutti')}</div>` : ''}
      ${!A.pub ? `<div class="am-f"><span class="field-label">Stato</span>${sel('status', Object.entries(GAME_STATUS), 'Tutti')}</div>` : ''}
      ${o.langs.length ? `<div class="am-f"><span class="field-label">Lingua</span>${sel('lang', opt(o.langs), 'Tutte')}</div>` : ''}
      ${!A.pub && o.owners.length ? `<div class="am-f"><span class="field-label">Proprietario</span>${sel('owner', opt(o.owners), 'Tutti')}</div>` : ''}
      ${o.rooms.length ? `<div class="am-f"><span class="field-label">Stanza</span>${sel('room', opt(o.rooms), 'Tutte')}</div>` : ''}
      ${o.units.length ? `<div class="am-f"><span class="field-label">Mobile</span>${sel('unit', opt(o.units), 'Tutti')}</div>` : ''}
      ${o.shelves.length ? `<div class="am-f"><span class="field-label">Scaffale</span>${sel('shelf', opt(o.shelves), 'Tutti')}</div>` : ''}
      <div class="am-f"><span class="field-label">Espansioni</span>${sel('exp', [['base', 'Solo giochi base'], ['exp', 'Solo espansioni'], ['hasExp', 'Con espansioni']], 'Tutto')}</div>
      ${o.tags.length ? `<div class="am-f"><span class="field-label">Etichetta</span>${sel('tag', opt(o.tags), 'Tutte')}</div>` : ''}
    </div>
    <div class="am-checks">
      ${chk('isNew', '🆕 Nuovi, da provare')}
      ${!A.pub ? `${chk('loaned', '🤝 Prestati')}${chk('noLoc', '❔ Senza posizione')}${chk('incomplete', '🧩 Schede incomplete')}${canEdit() ? chk('dups', '👯 Possibili duplicati') : ''}` : ''}
    </div>
    <button type="button" class="link-btn" data-act="clearFilters">Azzera i filtri</button>`;
}
function paintSide() {
  const s = $('#amSide');
  if (s) s.innerHTML = `<h2 class="am-side-title">Filtri</h2>${filtersHTML()}`;
}

let dupCache = { sig: '', ids: new Set() };
function dupIds() {
  const sig = Object.keys(A.lib || {}).length + ':' + JSON.stringify(Object.values(A.lib || {}).map((it) => [it?.name, it?.edition, it?.ean, it?.dupOk]).slice(0, 2000)).length;
  if (dupCache.sig !== sig) dupCache = { sig, ids: duplicateIds(A.lib) };
  return dupCache.ids;
}
function filtered() {
  const ctx = { lib: A.lib, dupIds: A.f.dups ? dupIds() : null };
  return sortItems(applyFilters(items(), A.f, ctx), A.sort);
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
  $('#amFCount').textContent = chips.length ? ` ${chips.length}` : '';
  $('#amChips').innerHTML = chips.length ? `${chips.map((c) => `<button type="button" class="am-chip" data-unf="${esc(c.k)}" aria-label="Togli il filtro ${esc(c.label)}">${esc(c.label)} <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="link-btn" data-act="clearFilters">Azzera tutto</button>` : '';
  const s = summary(A.lib, A.loans);
  $('#amCount').innerHTML = !A.loaded && !A.pub ? 'Carico i giochi…'
    : `${res.length === all.length ? plural(all.length, 'gioco', 'giochi') : `${res.length} di ${all.length}`}${!A.pub && canEdit() && s.incomplete ? ` · <button type="button" class="link-btn" data-act="wizard">🧩 ${s.incomplete === 1 ? '1 scheda da completare' : `${s.incomplete} schede da completare`}</button>` : ''}`;
  list.className = `am-list am-list--${A.view}`;
  if (!all.length) {
    list.innerHTML = `<div class="empty am-empty"><p class="empty-title">L’armadio è vuoto</p><p class="muted">${canAdd() ? 'Aggiungi il primo gioco, oppure importa la collezione da un file (Strumenti › Importa).' : 'Qui compariranno i giochi.'}</p>${canAdd() ? '<button type="button" class="btn" data-act="add">➕ Aggiungi un gioco</button>' : ''}</div>`;
  } else if (!res.length) {
    list.innerHTML = '<div class="empty am-empty"><p class="empty-title">Nessun gioco con questi filtri</p><button type="button" class="btn-sec" data-act="clearFilters">Azzera i filtri</button></div>';
  } else {
    // Con armadi grandi si disegnano i primi giochi e gli altri a richiesta: la pagina resta reattiva
    const shown = res.slice(0, A.limit);
    const more = res.length - shown.length;
    const moreBtn = more > 0 ? `<button type="button" class="btn-sec btn-block am-more" data-act="more">Mostra altri ${Math.min(more, PAGE)} (${more} in tutto)</button>` : '';
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
  if (it.weight) out.push(`🧠 ${String(it.weight).replace('.', ',')}`);
  return out;
}
function availHTML(it) {
  if (A.pub) return A.pubFields.status ? (it.avail === false ? '<span class="am-tag am-tag--off">Non disponibile</span>' : '<span class="am-tag am-tag--ok">Disponibile</span>') : '';
  const copies = Number(it.copies) || 1;
  if (it.loanId && copies > 1 && it.status !== 'prestato') {
    const n = canEdit() ? loansOf(A.loans, it.id).filter((l) => !l.ret).length : 1;
    return `<span class="am-tag am-tag--ok">🤝 ${n || 1} di ${copies} in prestito</span>`;
  }
  if (it.loanId || it.status === 'prestato') {
    const l = A.loans?.[it.loanId];
    const late = l && isOverdue(l);
    return `<span class="am-tag ${late ? 'am-tag--late' : 'am-tag--off'}">🤝 ${canEdit() && (l?.to || it.loanTo) ? `Prestato a ${esc(l?.to || it.loanTo)}` : 'In prestito'}${late ? ' · in ritardo' : ''}</span>`;
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
      ${A.selecting ? `<label class="am-check" data-nopen><input type="checkbox" data-sel="${esc(it.id)}" ${sel ? 'checked' : ''} aria-label="Seleziona ${esc(it.name)}"></label>` : ''}
      ${gameImageHTML(it, 'am-img')}
      <div class="am-card-body">
        <b class="am-name">${esc(it.name)}</b>
        ${it.edition || base ? `<small class="muted">${base ? `🧩 Espansione di ${esc(base)}` : ''}${it.edition ? `${base ? ' · ' : ''}${esc(it.edition)}` : ''}</small>` : ''}
        <span class="am-badges">${badges(it).map((b) => `<span>${b}</span>`).join('')}${exps ? `<span>🧩 ${exps}</span>` : ''}</span>
        <span class="am-tags">${it.isNew ? '<span class="am-tag am-tag--new">🆕 Da provare</span>' : ''}${availHTML(it)}${(it.copies || 1) > 1 ? `<span class="am-tag">×${it.copies}</span>` : ''}</span>
        ${hasLoc(it) ? `<small class="am-loc">📍 ${esc(locText(it.loc))}${it.locCheck ? ' <b class="am-warn">da confermare</b>' : ''}</small>` : ''}
      </div>
    </article>`;
}
function listHTML(res) {
  return `<div class="am-table" role="table" aria-label="Giochi">
    <div class="am-tr am-th" role="row"><span role="columnheader"></span><span role="columnheader">Gioco</span><span role="columnheader">Giocatori</span><span role="columnheader">Durata</span><span role="columnheader">Posizione</span><span role="columnheader">Stato</span></div>
    ${res.map((it) => `
    <div class="am-tr ${A.sel.has(it.id) ? 'is-sel' : ''}" role="row" data-open="${esc(it.id)}">
      <span role="cell" class="am-td-img">${A.selecting ? `<label class="am-check am-check--inline" data-nopen><input type="checkbox" data-sel="${esc(it.id)}" ${A.sel.has(it.id) ? 'checked' : ''} aria-label="Seleziona ${esc(it.name)}"></label>` : ''}${gameImageHTML(it, 'am-img am-img--xs')}</span>
      <span role="cell" class="am-td-name"><b>${esc(it.name)}</b>${it.baseId ? `<small>🧩 ${esc(A.lib?.[it.baseId]?.name || 'espansione')}</small>` : ''}${it.isNew ? '<small>🆕 da provare</small>' : ''}</span>
      <span role="cell">${it.minPlayers || it.maxPlayers ? `${it.minPlayers || '?'}–${it.maxPlayers || '?'}` : '<span class="muted">—</span>'}</span>
      <span role="cell">${it.duration ? `${it.duration}′` : '<span class="muted">—</span>'}</span>
      <span role="cell" class="am-td-loc">${hasLoc(it) ? esc(locText(it.loc)) : '<span class="muted">—</span>'}</span>
      <span role="cell">${availHTML(it) || '<span class="am-tag am-tag--ok">Disponibile</span>'}</span>
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
      <div class="am-shelf-head"><h3>${k ? `📍 ${esc(k)}` : '❔ Senza posizione'}</h3><span class="muted">${plural(groups.get(k).length, 'gioco', 'giochi')}</span>
        ${k && !A.pub ? `<button type="button" class="btn-sec btn-sec--sm" data-shelflabel="${esc(k)}">🏷️ <span>Etichetta</span></button>` : ''}
        ${!k && canEdit() ? '<button type="button" class="btn-sec btn-sec--sm" data-act="bulkNoLoc">📍 <span>Assegna una posizione</span></button>' : ''}
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
    <span class="am-sel-n"><b>${n}</b> ${n === 1 ? 'selezionato' : 'selezionati'}</span>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selAll">Tutti quelli filtrati</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selNone" ${n ? '' : 'disabled'}>Nessuno</button>
    <button type="button" class="btn btn-sm" data-act="bulk" ${n ? '' : 'disabled'}>✏️ Modifica…</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selLabels" ${n ? '' : 'disabled'}>🏷️ Etichette</button>
    <button type="button" class="btn-sec btn-sec--sm" data-act="selMove" ${n ? '' : 'disabled'}>🚚 Sposta</button>
    <button type="button" class="btn-sec btn-sec--sm am-danger" data-act="selTrash" ${n ? '' : 'disabled'}>🗑️ Cestino</button>
    <button type="button" class="link-btn" data-act="select">Fine</button>`;
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
    case 'filters': Sheet.open(`${head('⚙️ Filtri')}${filtersHTML()}<button type="button" class="btn btn-block" data-close>Mostra ${filtered().length} giochi</button>`, { cls: 'am-filters-sheet' }); break;
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
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Scheda del gioco
// ---------------------------------------------------------------------------

async function openGame(id) {
  const it = A.lib?.[id] ? { id, ...A.lib[id] } : null;
  if (!it) { toast('Questo gioco non è più nell’armadio.', 'warn'); return; }
  const base = it.baseId ? A.lib?.[it.baseId] : null;
  const exps = expansionsOf(A.lib, id);
  const myLoans = A.pub ? [] : loansOf(A.loans, id);
  const actAll = myLoans.filter((l) => !l.ret);
  const canLend = actAll.length < (Number(it.copies) || 1) && (!it.status || it.status === 'posseduto' || it.status === 'prestato');
  const log = A.pub || !canEdit() ? [] : Object.values(A.log || {}).filter((ev) => ev.item === id).sort((a, b) => b.at - a.at).slice(0, 8);
  const row = (k, v) => (v ? `<div class="am-kv"><span>${k}</span><b>${v}</b></div>` : '');
  const el = Sheet.open(`
    ${head(esc(it.name))}
    <div class="am-sheet-grid">
      <div class="am-sheet-img" id="amBig">${gameImageHTML(it, 'am-img am-img--big')}</div>
      <div class="am-sheet-info">
        ${it.orig || it.edition || it.year || it.publisher ? `<p class="muted">${[it.orig && `“${esc(it.orig)}”`, it.edition && esc(it.edition), it.year, it.publisher && esc(it.publisher)].filter(Boolean).join(' · ')}</p>` : ''}
        <div class="am-tags">${it.isNew ? '<span class="am-tag am-tag--new">🆕 Nuovo, da provare</span>' : ''}${availHTML(it) || (A.pub && !A.pubFields.status ? '' : '<span class="am-tag am-tag--ok">✅ Disponibile</span>')}${(it.copies || 1) > 1 ? `<span class="am-tag">${it.copies} copie</span>` : ''}</div>
        <div class="am-kvs">
          ${row('Giocatori', it.minPlayers || it.maxPlayers ? `${it.minPlayers || '?'}–${it.maxPlayers || '?'}` : '')}
          ${row('Durata', it.duration ? `${it.duration} minuti` : '')}
          ${row('Tipologia', it.mode ? esc(GAME_MODES[it.mode] || it.mode) : '')}
          ${row('Difficoltà', it.weight ? `${String(it.weight).replace('.', ',')} / 5` : '')}
          ${row('Lingua', esc(it.language || ''))}
          ${!A.pub ? row('Proprietario', esc(it.owner || '')) : ''}
          ${!A.pub ? row('Acquisito', it.acq ? new Date(it.acq).toLocaleDateString('it-IT') : '') : ''}
          ${tagsOf(it).length ? row('Etichette', tagsOf(it).map((t) => `#${esc(t)}`).join(' ')) : ''}
        </div>
      </div>
    </div>
    <section class="am-sec">
      <h3>📍 Dove si trova</h3>
      ${A.pub && !A.pubFields.loc ? '<p class="muted">Posizione non pubblicata.</p>'
        : hasLoc(it) ? `<p class="am-where">${esc(locText(it.loc))}${it.locCheck ? ' <b class="am-warn">(da riconfermare: arriva da un altro armadio)</b>' : ''}</p>`
          : `<p class="am-warn">Posizione non registrata.</p>${canEdit() ? `<button type="button" class="btn-sec btn-sec--sm" data-edit="${esc(id)}" data-focus="loc">📍 Imposta la posizione</button>` : ''}`}
    </section>
    ${base ? `<section class="am-sec"><h3>🧩 Espansione di</h3><button type="button" class="am-mini" data-open="${esc(it.baseId)}">${gameImageHTML({ ...base }, 'am-img am-img--xs')}<b>${esc(base.name)}</b>${hasLoc(base) && (!A.pub || A.pubFields.loc) ? `<small>📍 ${esc(locText(base.loc))}</small>` : ''}</button></section>` : ''}
    ${exps.length ? `<section class="am-sec"><h3>🧩 Espansioni (${exps.length})</h3><div class="am-minis">${exps.map((x) => `<button type="button" class="am-mini" data-open="${esc(x.id)}">${gameImageHTML(x, 'am-img am-img--xs')}<b>${esc(x.name)}</b><small>${hasLoc(x) && (!A.pub || A.pubFields.loc) ? `📍 ${esc(locText(x.loc))}` : (!A.pub ? 'posizione non registrata' : '')}${(!A.pub && (x.loanId || x.status === 'prestato')) ? ' · 🤝 in prestito' : ''}</small></button>`).join('')}</div></section>` : ''}
    ${it.rules ? `<section class="am-sec"><h3>📖 Regole in breve</h3><p class="am-pre">${esc(it.rules)}</p></section>` : ''}
    ${it.setup ? `<section class="am-sec"><h3>🧰 Preparazione</h3><p class="am-pre">${esc(it.setup)}</p></section>` : ''}
    ${it.video ? `<p><a class="btn-sec btn-sec--sm" href="${esc(it.video)}" target="_blank" rel="noopener noreferrer">▶️ Video delle regole</a></p>` : ''}
    ${!A.pub && it.note && canEdit() ? `<section class="am-sec"><h3>📝 Note</h3><p class="am-pre">${esc(it.note)}</p></section>` : ''}
    ${canEdit() ? `<section class="am-sec"><h3>🤝 Prestiti</h3>${actAll.length ? actAll.map((l) => `<div class="am-loan ${isOverdue(l) ? 'is-late' : ''}"><span class="am-loan-main"><span>${isOverdue(l) ? '⏰ <b>In ritardo</b> · ' : ''}Prestato a <b>${esc(l.to)}</b> dal ${fmtDate(l.start)}${l.due ? `, da restituire entro il <b>${fmtDate(l.due)}</b>` : ''}.</span>${l.note ? `<small>${esc(l.note)}</small>` : ''}</span><button type="button" class="btn-sec btn-sec--sm" data-return="${esc(l.id)}">↩️ Restituito</button></div>`).join('') : '<p class="muted">Nessun prestito in corso.</p>'}
      ${myLoans.filter((l) => l.ret).length ? `<details class="hub-details"><summary>Storico (${myLoans.filter((l) => l.ret).length})</summary><ul class="am-mini-list">${myLoans.filter((l) => l.ret).map((l) => `<li>${esc(l.to)}: ${fmtDate(l.start)} → ${fmtDate(l.ret)}${l.state && l.state !== 'ok' ? ` · <b>${esc(l.state)}</b>` : ''}${l.note ? ` · ${esc(l.note)}` : ''}</li>`).join('')}</ul></details>` : ''}
    </section>` : ''}
    ${log.length ? `<details class="hub-details am-sec"><summary>🕘 Cronologia (${log.length})</summary><ul class="am-mini-list">${log.map((ev) => `<li><b>${esc(OPS[ev.op] || ev.op)}</b> ${esc(ev.msg || '')} <span class="muted">· ${fmtWhen(ev.at)}${ev.by ? ` · ${esc(ev.by)}` : ''}</span></li>`).join('')}</ul></details>` : ''}
    <div class="am-sheet-actions">
      ${canEdit() ? `<button type="button" class="btn" data-edit="${esc(id)}">✏️ Modifica</button>
        ${canLend ? `<button type="button" class="btn-sec" data-lend="${esc(id)}">🤝 Presta${actAll.length ? ' un’altra copia' : ''}</button>` : ''}
        <button type="button" class="btn-sec" data-label="${esc(id)}">🏷️ Etichetta</button>
        <button type="button" class="btn-sec" data-move="${esc(id)}">🚚 Sposta</button>
        <button type="button" class="btn-sec am-danger" data-trash="${esc(id)}">🗑️ Cestino</button>` : ''}
      ${!canEdit() && canAdd() ? `<button type="button" class="btn-sec" data-edit="${esc(id)}">✏️ Completa la scheda</button>` : ''}
    </div>`, { wide: true });
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
    ${head(id ? `✏️ ${esc(cur.name)}` : '➕ Nuovo gioco')}
    <form id="edForm" class="am-form" novalidate>
      <div class="am-form-top">
        <button type="button" class="lib-add-img am-ed-img ${cur.thumb || cur.image ? 'has-img' : ''}" id="edPick" aria-label="Scegli o scatta la foto">${cur.thumb || cur.image ? `<img src="${esc(cur.thumb || cur.image)}" alt="">` : '📷'}</button>
        <input type="file" id="edFile" accept="image/*" hidden>
        <div class="am-form-name">
          <label class="field-label" for="edName">Nome *</label>
          <input class="input" id="edName" maxlength="40" required value="${f('name')}" placeholder="Es. Dixit" autocomplete="off">
          <div class="am-url-row"><input class="input input--sm" id="edUrl" type="url" inputmode="url" placeholder="🔗 oppure il link di una foto"><button type="button" class="btn-sec btn-sec--sm" id="edUrlOk">Usa</button></div>
        </div>
      </div>
      <fieldset class="am-fs"><legend>Come si gioca</legend>
        <div class="am-grid2">
          <label><span class="field-label">Giocatori min</span><input class="input" type="number" min="1" max="20" id="edMin" value="${f('minPlayers')}"></label>
          <label><span class="field-label">Giocatori max</span><input class="input" type="number" min="1" max="20" id="edMax" value="${f('maxPlayers')}"></label>
          <label><span class="field-label">Durata (min)</span><input class="input" type="number" min="1" max="600" id="edDur" value="${f('duration')}"></label>
          <label><span class="field-label">Difficoltà (1–5)</span><input class="input" type="number" min="1" max="5" step="0.1" id="edWeight" value="${f('weight')}"></label>
          <label><span class="field-label">Tipologia</span><select class="input select" id="edMode">${opts(Object.entries(GAME_MODES), cur.mode, '—')}</select></label>
          <label><span class="field-label">Lingua</span><input class="input" id="edLang" maxlength="20" list="dlLang" value="${f('language')}"></label>
        </div>
        <label><span class="field-label">Etichette (separate da virgole)</span><input class="input" id="edTags" maxlength="160" value="${esc(tagsOf(cur).join(', '))}" placeholder="party, parole, famiglia"></label>
      </fieldset>
      <fieldset class="am-fs" id="edLocFs"><legend>📍 Dove si trova</legend>
        <div class="am-grid2">${LOC_KEYS.map((k) => `<label><span class="field-label">${LOC_LABELS[k]}</span><input class="input" id="edLoc_${k}" maxlength="30" list="dlLoc_${k}" placeholder="${LOC_HINTS[k]}" value="${esc(cur.loc?.[k] || '')}"></label>`).join('')}</div>
        ${cur.locCheck ? '<label class="quick-toggle"><input type="checkbox" id="edLocOk" checked><span>Confermo la posizione (arriva da un altro armadio)</span></label>' : ''}
      </fieldset>
      ${limited ? '' : `
      <fieldset class="am-fs"><legend>Edizione e collezione</legend>
        <div class="am-grid2">
          <label><span class="field-label">Titolo originale</span><input class="input" id="edOrig" maxlength="60" value="${f('orig')}"></label>
          <label><span class="field-label">Edizione</span><input class="input" id="edEdition" maxlength="40" value="${f('edition')}" placeholder="Es. Big Box, 2ª ed."></label>
          <label><span class="field-label">Anno</span><input class="input" type="number" min="1900" max="2100" id="edYear" value="${f('year')}"></label>
          <label><span class="field-label">Editore</span><input class="input" id="edPub" maxlength="40" value="${f('publisher')}"></label>
          <label><span class="field-label">Espansione di</span><select class="input select" id="edBase">${opts(bases, cur.baseId, '— gioco autonomo —')}</select></label>
          <label><span class="field-label">Copie</span><input class="input" type="number" min="1" max="20" id="edCopies" value="${f('copies') || ''}" placeholder="1"></label>
          <label><span class="field-label">Proprietario</span><input class="input" id="edOwner" maxlength="24" list="dlOwner" value="${f('owner')}"></label>
          <label><span class="field-label">Stato</span><select class="input select" id="edStatus">${opts(Object.entries(GAME_STATUS).filter(([k]) => k !== 'prestato' || cur.status === 'prestato'), cur.status || 'posseduto', '—')}</select></label>
          <label><span class="field-label">Data di acquisizione</span><input class="input" type="date" id="edAcq" value="${f('acq')}"></label>
          <label><span class="field-label">Codice a barre</span><input class="input" id="edEan" inputmode="numeric" maxlength="14" value="${f('ean')}"></label>
        </div>
        <label class="quick-toggle"><input type="checkbox" id="edNew" ${cur.isNew || !id ? 'checked' : ''}><span>🆕 Nuovo, da provare</span></label>
      </fieldset>
      <fieldset class="am-fs"><legend>Regole e note</legend>
        <label><span class="field-label">Regole in breve</span><textarea class="input" id="edRules" maxlength="600" rows="3">${f('rules')}</textarea></label>
        <label><span class="field-label">Preparazione</span><textarea class="input" id="edSetup" maxlength="300" rows="2">${f('setup')}</textarea></label>
        <label><span class="field-label">Video delle regole (https://…)</span><input class="input" id="edVideo" type="url" maxlength="200" value="${f('video')}"></label>
        <label><span class="field-label">Note private (componenti mancanti, condizioni…)</span><textarea class="input" id="edNote" maxlength="300" rows="2">${f('note')}</textarea></label>
        <label><span class="field-label">Identificativo esterno (es. BoardGameGeek)</span><input class="input" id="edExt" maxlength="40" value="${f('extId')}"></label>
      </fieldset>`}
      ${datalist('dlLang', uniq((it) => it.language))}${datalist('dlOwner', uniq((it) => it.owner))}
      ${LOC_KEYS.map((k) => datalist(`dlLoc_${k}`, uniq((it) => it.loc?.[k]))).join('')}
      <p class="form-error" id="edErr" role="alert"></p>
      <div class="am-form-actions"><button type="submit" class="btn" id="edSave">${id ? 'Salva' : 'Aggiungi all’armadio'}</button><button type="button" class="btn-sec" data-close>Annulla</button></div>
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
  $('#edUrlOk', el).addEventListener('click', async () => {
    try { const r = await gameImageFromUrl($('#edUrl', el).value.trim()); full = r.image; imgChanged = true; showImg(full); if (!r.copied) toast('Uso il link: se la foto sparisce dal sito, sparisce anche qui.', 'warn'); } catch (err) { $('#edErr', el).textContent = err.message; }
  });
  $('#edForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (s) => $(s, el)?.value.trim() ?? '';
    const n = (s) => (v(s) === '' ? null : Number(v(s).replace(',', '.')));
    const err = $('#edErr', el);
    const name = cleanName(v('#edName'), 40);
    if (!name) { err.textContent = 'Il nome è obbligatorio.'; $('#edName', el).focus(); return; }
    const mn = n('#edMin'); const mx = n('#edMax');
    if (mn !== null && (mn < 1 || mn > 20)) { err.textContent = 'Giocatori minimi: da 1 a 20.'; return; }
    if (mx !== null && (mx < 1 || mx > 20)) { err.textContent = 'Giocatori massimi: da 1 a 20.'; return; }
    if (mn && mx && mn > mx) { err.textContent = 'Il minimo di giocatori è più alto del massimo.'; return; }
    const dur = n('#edDur'); if (dur !== null && (dur < 1 || dur > 600)) { err.textContent = 'Durata: da 1 a 600 minuti.'; return; }
    const w = n('#edWeight'); if (w !== null && (w < 1 || w > 5)) { err.textContent = 'Difficoltà: da 1 a 5.'; return; }
    const patch = {
      name, minPlayers: mn ? Math.round(mn) : null, maxPlayers: mx ? Math.round(mx) : null, duration: dur ? Math.round(dur) : null,
      weight: w ? Math.round(w * 10) / 10 : null, mode: v('#edMode') || null, language: cleanName(v('#edLang'), 20) || null,
      tags: v('#edTags') ? [...new Set(v('#edTags').split(',').map((t) => cleanName(t, 20)).filter(Boolean))].slice(0, 8) : null,
      loc: cleanLoc(Object.fromEntries(LOC_KEYS.map((k) => [k, v(`#edLoc_${k}`)])))
    };
    if ($('#edLocOk', el)) patch.locCheck = $('#edLocOk', el).checked ? null : true;
    if (!limited) {
      const yr = n('#edYear'); if (yr !== null && (yr < 1900 || yr > 2100)) { err.textContent = 'Anno non valido.'; return; }
      const cp = n('#edCopies'); if (cp !== null && (cp < 1 || cp > 20)) { err.textContent = 'Copie: da 1 a 20.'; return; }
      const ean = v('#edEan').replace(/\D/g, ''); if (ean && !/^[0-9]{8,14}$/.test(ean)) { err.textContent = 'Il codice a barre ha da 8 a 14 cifre.'; return; }
      const video = v('#edVideo'); if (video && !/^https:\/\/[^\s"<>]+$/.test(video)) { err.textContent = 'Il link del video deve iniziare con https://'; return; }
      Object.assign(patch, {
        orig: cleanName(v('#edOrig'), 60) || null, edition: cleanName(v('#edEdition'), 40) || null, year: yr ? Math.round(yr) : null,
        publisher: cleanName(v('#edPub'), 40) || null, baseId: v('#edBase') || null, copies: cp && cp > 1 ? Math.round(cp) : null,
        owner: cleanName(v('#edOwner'), 24) || null, acq: /^\d{4}-\d{2}-\d{2}$/.test(v('#edAcq')) ? v('#edAcq') : null,
        isNew: $('#edNew', el).checked ? true : null, ean: ean || null, video: video || null, extId: cleanName(v('#edExt'), 40) || null,
        rules: v('#edRules').slice(0, 600) || null, setup: v('#edSetup').slice(0, 300) || null, note: v('#edNote').slice(0, 300) || null
      });
      const st = v('#edStatus');
      if (st && st !== 'prestato') patch.status = st === 'posseduto' && !cur.status ? null : st;
      if (patch.baseId && expansionsOf(A.lib, id).length) { err.textContent = 'Questo gioco ha già delle espansioni: non può essere a sua volta un’espansione.'; return; }
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
            logEvent(A.aid, { op: 'edit', item: same.id, name: same.name, msg: `una copia in più (ora ${(Number(same.copies) || 1) + 1})`, by: me() });
          });
          toast(`${same.name}: una copia in più`);
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
          const d = diffSummary(cur, patch) || (imgChanged ? 'foto' : '');
          if (d || imgChanged) logEvent(A.aid, { op: patch.loc && locText(cur.loc) !== locText(patch.loc) && d.startsWith('posizione') ? 'loc' : 'edit', item: id, name, msg: d, by: me() });
        } else {
          const nid = newGameId(A.aid);
          const g = Object.fromEntries(Object.entries({ ...patch, addedBy: me().slice(0, 24) }).filter(([, x]) => x !== null && x !== undefined));
          await saveGame(A.aid, nid, g, { create: true, ...(full ? { full } : {}) });
          logEvent(A.aid, { op: 'add', item: nid, name, by: me() });
        }
      });
      toast(id ? `${name}: salvato` : `${name} è nell’armadio`);
      Sheet.close(el);
    } catch (ex) { err.textContent = userMsg(ex); }
  });
}

function askDuplicate(same, name) {
  return new Promise((resolve) => {
    const el = Sheet.open(`
      ${head('👯 C’è già')}
      <p>Nell’armadio c’è già <b>${esc(same.name)}</b>${same.edition ? ` (${esc(same.edition)})` : ''}${hasLoc(same) ? `, in ${esc(locText(same.loc))}` : ''}.</p>
      <div class="am-choices">
        <button type="button" class="btn-sec btn-block" data-c="copy">➕ È un’altra copia dello stesso gioco (${(Number(same.copies) || 1) + 1} copie)</button>
        <button type="button" class="btn-sec btn-block" data-c="new">📚 È un gioco diverso o un’altra edizione: aggiungi “${esc(name)}”</button>
        <button type="button" class="btn-sec btn-block" data-c="open">👀 Apri quello che c’è già</button>
        <button type="button" class="link-btn" data-c="cancel">Annulla</button>
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
    <button type="button" class="am-found-main" ${aid === A.aid ? `data-open="${esc(it.id)}"` : `data-goto="armadio.html?a=${esc(aid)}&g=${esc(it.id)}"`}>
      ${gameImageHTML(it, 'am-img am-img--xs')}
      <span><b>${esc(it.name)}</b><small>📦 ${esc(armName)}</small>
      <small class="${loc ? '' : 'am-warn'}">📍 ${loc ? esc(loc) : (A.pub ? 'posizione non pubblicata' : 'posizione non registrata')}</small>
      <small>${lent ? `🤝 In prestito${canEdit() && (l?.to || it.loanTo) ? ` a ${esc(l?.to || it.loanTo)}` : ''}${l?.due ? `, entro il ${fmtDate(l.due)}` : ''}` : (it.status && it.status !== 'posseduto' && !A.pub) ? `⛔ ${esc(GAME_STATUS[it.status] || it.status)}` : (A.pub && !A.pubFields.status) ? '' : '✅ Disponibile'}</small>
      ${exps.length ? `<small>🧩 ${exps.map((x) => `${esc(x.name)}${hasLoc(x) ? ` (📍 ${esc(locText(x.loc))})` : ''}`).join(', ')}</small>` : ''}</span>
    </button></li>`;
}
function openFind() {
  const el = Sheet.open(`
    ${head('📍 Trova il gioco')}
    <input class="input" id="fdQ" type="search" placeholder="Nome del gioco" autocomplete="off" autofocus>
    <ul class="am-found-list" id="fdList"></ul>
    ${!A.pub && otherArmadi().length ? `<button type="button" class="btn-sec btn-sec--sm" id="fdOther">🔎 Cerca anche negli altri ${otherArmadi().length} armadi</button>` : ''}`, { wide: true });
  const others = [];
  const paint = () => {
    const q = $('#fdQ', el).value;
    const res = q.trim() ? applyFilters(items(), { text: q }, { lib: A.lib }).slice(0, 30) : [];
    const ext = q.trim() ? others.flatMap((o) => applyFilters(o.items, { text: q }, {}).slice(0, 10).map((it) => ({ it, o }))) : [];
    $('#fdList', el).innerHTML = !q.trim() ? '<li class="muted">Scrivi il nome: ti dico dove si trova e se è disponibile.</li>'
      : (res.map((it) => findRow(it, (A.pub ? A.pubInfo : A.info)?.name || 'Questo armadio', A.aid)).join('') + ext.map(({ it, o }) => findRow(it, o.name, o.id)).join('')) || '<li class="muted">Nessun gioco con questo nome.</li>';
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
    ${head('✏️ Modifica armadio')}
    <form id="aiForm" class="am-form" novalidate>
      <label><span class="field-label">Nome *</span><input class="input" id="aiName" maxlength="40" value="${esc(i.name || '')}" required></label>
      <label><span class="field-label">Descrizione</span><textarea class="input" id="aiDesc" maxlength="200" rows="2" placeholder="Es. I giochi di casa, nel soggiorno">${esc(i.desc || '')}</textarea></label>
      <span class="field-label">Icona</span>
      <div class="am-emojis" role="radiogroup" aria-label="Icona">${EMOJI.map((x) => `<button type="button" class="am-emoji-btn" data-emo="${x}" aria-pressed="${(i.emoji || '📦') === x}">${x}</button>`).join('')}</div>
      <p class="form-error" id="aiErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="aiSave">Salva</button>
    </form>`);
  let emoji = i.emoji || '📦';
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-emo]'); if (b) { emoji = b.dataset.emo; el.querySelectorAll('[data-emo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
  $('#aiForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanName($('#aiName', el).value, 40);
    if (!name) { $('#aiErr', el).textContent = 'Il nome non può essere vuoto.'; return; }
    const desc = cleanName($('#aiDesc', el).value, 200);
    try {
      await busy($('#aiSave', el), () => update(armadioRef(A.aid, 'info'), { name, desc: desc || null, emoji, updatedAt: Date.now() }));
      if (name !== i.name) logEvent(A.aid, { op: 'rename', msg: `da “${i.name}” a “${name}”`, by: me() });
      Person.linkArmadio(A.aid, name).catch(() => {});
      try {
        const list = JSON.parse(localStorage.getItem('gnr_armadi') || '[]').map((a) => (a?.id === A.aid ? { ...a, name } : a));
        localStorage.setItem('gnr_armadi', JSON.stringify(list));
      } catch { /* niente */ }
      toast('Armadio aggiornato');
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
    ${head(`✏️ Modifica ${plural(its.length, 'gioco', 'giochi')}`)}
    <p class="muted">Cambia solo quello che compili: il resto resta com’è.</p>
    <form id="bkForm" class="am-form" novalidate>
      <fieldset class="am-fs" id="bkLocFs"><legend>📍 Posizione</legend>
        <div class="am-grid2">${LOC_KEYS.map((k) => `<label><span class="field-label">${LOC_LABELS[k]}</span><input class="input" id="bkLoc_${k}" maxlength="30" list="bkdl_${k}" placeholder="non cambiare"></label>`).join('')}</div>
        <label class="quick-toggle"><input type="checkbox" id="bkLocClear"><span>Togli la posizione</span></label>
        ${LOC_KEYS.map((k) => datalist(`bkdl_${k}`, uniq((it) => it.loc?.[k]))).join('')}
      </fieldset>
      <div class="am-grid2">
        <label><span class="field-label">Stato</span><select class="input select" id="bkStatus"><option value="">non cambiare</option><option value="posseduto">Disponibile</option><option value="non disponibile">Non disponibile</option><option value="venduto">Venduto</option></select></label>
        <label><span class="field-label">Proprietario</span><input class="input" id="bkOwner" maxlength="24" list="bkdlOwner" placeholder="non cambiare"></label>
        <label><span class="field-label">Nuovo, da provare</span><select class="input select" id="bkNew"><option value="">non cambiare</option><option value="si">Sì</option><option value="no">No</option></select></label>
        <label><span class="field-label">Tipologia</span><select class="input select" id="bkMode"><option value="">non cambiare</option>${Object.entries(GAME_MODES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label><span class="field-label">Aggiungi etichette</span><input class="input" id="bkTagAdd" maxlength="80" placeholder="es. vacanza, famiglia"></label>
        <label><span class="field-label">Togli etichette</span><input class="input" id="bkTagDel" maxlength="80"></label>
      </div>
      <label class="quick-toggle"><input type="checkbox" id="bkOwnerClear"><span>Togli il proprietario</span></label>
      ${datalist('bkdlOwner', uniq((it) => it.owner))}
      <div id="bkPreview" class="am-preview" hidden></div>
      <p class="form-error" id="bkErr" role="alert"></p>
      <div class="am-form-actions"><button type="button" class="btn-sec" id="bkPrev">👀 Anteprima</button><button type="submit" class="btn" id="bkGo" disabled>Applica</button><button type="button" class="link-btn" data-close>Annulla</button></div>
    </form>`, { wide: true });
  if (focus === 'loc') setTimeout(() => $('#bkLoc_room', el)?.focus(), 60);
  const plan = () => {
    const v = (s) => $(s, el).value.trim();
    const locNew = cleanLoc(Object.fromEntries(LOC_KEYS.map((k) => [k, v(`#bkLoc_${k}`)])));
    const add = v('#bkTagAdd').split(',').map((t) => cleanName(t, 20)).filter(Boolean);
    const del = v('#bkTagDel').split(',').map((t) => cleanName(t, 20).toLowerCase()).filter(Boolean);
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
        const t = [...new Set([...tagsOf(it).filter((x) => !del.includes(x.toLowerCase())), ...add])].slice(0, 8);
        if (JSON.stringify(t) !== JSON.stringify(tagsOf(it))) p.tags = t.length ? t : null;
      }
      return { it, p };
    }).filter((x) => Object.keys(x.p).length);
    if ($('#bkLocClear', el).checked) changes.push('tolgo la posizione');
    else if (locNew) changes.push(`posizione → ${locText(locNew)}`);
    if (v('#bkStatus')) changes.push(`stato → ${GAME_STATUS[v('#bkStatus')]}${its.some((it) => it.loanId) ? ' (non per i giochi in prestito)' : ''}`);
    if ($('#bkOwnerClear', el).checked) changes.push('tolgo il proprietario'); else if (v('#bkOwner')) changes.push(`proprietario → ${v('#bkOwner')}`);
    if (v('#bkNew')) changes.push(`nuovo, da provare → ${v('#bkNew')}`);
    if (v('#bkMode')) changes.push(`tipologia → ${GAME_MODES[v('#bkMode')]}`);
    if (add.length) changes.push(`aggiungo #${add.join(' #')}`);
    if (del.length) changes.push(`tolgo #${del.join(' #')}`);
    return { per, changes };
  };
  const preview = () => {
    const { per, changes } = plan();
    const box = $('#bkPreview', el);
    box.hidden = false;
    box.innerHTML = changes.length
      ? `<p><b>${changes.join(' · ')}</b></p><p>${per.length ? `Cambierà ${plural(per.length, 'gioco', 'giochi')} su ${its.length}` : 'Nessun gioco cambia (hanno già questi valori).'}${per.length < its.length && per.length ? `: gli altri ${its.length - per.length} hanno già questi valori.` : ''}</p><p class="muted small">${per.slice(0, 12).map((x) => esc(x.it.name)).join(', ')}${per.length > 12 ? '…' : ''}</p>`
      : '<p class="muted">Non hai scelto nessuna modifica.</p>';
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
    logEvent(A.aid, { op: 'bulk', msg: `${changes.join(' · ')} — ${plural(ok, 'gioco', 'giochi')}`, by: me() });
    Sheet.close(el);
    if (bad.length) Sheet.open(`${head('Modifica multipla')}<p>✅ ${plural(ok, 'gioco aggiornato', 'giochi aggiornati')}.</p><p class="form-error">❌ Non aggiornati (${bad.length}): ${bad.map(esc).join(', ')}. Controlla la connessione e riprova.</p>`);
    else toast(`✓ ${plural(ok, 'gioco aggiornato', 'giochi aggiornati')}`);
  });
}

async function bulkTrash(ids) {
  const its = ids.map((id) => ({ id, ...A.lib[id] })).filter((x) => x.name);
  if (!its.length) return;
  const lent = its.filter((x) => x.loanId);
  const withExp = its.filter((x) => expansionsOf(A.lib, x.id).length && !ids.includes(expansionsOf(A.lib, x.id)[0].id));
  if (!confirm(`Spostare nel cestino ${its.length === 1 ? `“${its[0].name}”` : plural(its.length, 'gioco', 'giochi')}?\n\nSi possono ripristinare dal Cestino.${lent.length ? `\n\n⚠️ ${lent.length} in prestito: il prestito resta nello storico.` : ''}${withExp.length ? `\n\n🧩 Le espansioni di ${withExp.map((x) => x.name).join(', ')} restano nell’armadio.` : ''}`)) return;
  let ok = 0;
  for (const it of its) { try { const g = { ...it }; delete g.id; await trashGame(A.aid, it.id, g, me()); ok++; A.sel.delete(it.id); } catch (err) { toast(userMsg(err), 'error'); } }
  toast(`🗑️ ${plural(ok, 'gioco', 'giochi')} nel cestino`);
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
    ${head(`🤝 Presta ${esc(it.name)}`)}
    <form id="lnForm" class="am-form" novalidate>
      <label><span class="field-label">A chi</span><input class="input" id="lnTo" maxlength="40" list="lnPeople" placeholder="Nome (dal gruppo o di un’altra persona)" autocomplete="off" autofocus></label>
      ${datalist('lnPeople', people.map((p) => p.name))}
      <p class="muted small">${people.length ? 'Puoi scegliere qualcuno dei tuoi gruppi o scrivere il nome di chiunque.' : 'Scrivi il nome di chi lo prende.'}</p>
      <label><span class="field-label">Da restituire entro</span><input class="input" type="date" id="lnDue" value="${due}"></label>
      <label><span class="field-label">Note</span><input class="input" id="lnNote" maxlength="200" placeholder="Es. manca una carta, scatola rovinata"></label>
      <p class="form-error" id="lnErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="lnGo">Registra il prestito</button>
    </form>`);
  $('#lnForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const to = cleanName($('#lnTo', el).value, 40);
    const d = $('#lnDue', el).value;
    const person = people.find((p) => p.name.toLowerCase() === to.toLowerCase());
    try {
      await busy($('#lnGo', el), () => lendGame(A.aid, id, it, A.loans, { to, toKey: person?.key || '', due: d ? new Date(`${d}T20:00:00`).getTime() : null, note: $('#lnNote', el).value }, me()));
      toast(`🤝 ${it.name} prestato a ${to}`);
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
    ${head(`↩️ ${esc(l.name || it?.name || 'Gioco')} restituito`)}
    <p>Prestato a <b>${esc(l.to)}</b> dal ${fmtDate(l.start)}${l.due ? `, scadenza ${fmtDate(l.due)}` : ''}.</p>
    <form id="rtForm" class="am-form" novalidate>
      <span class="field-label">Com’è tornato?</span>
      <div class="seg" role="radiogroup"><button type="button" data-st="ok" aria-pressed="true">👍 Tutto a posto</button><button type="button" data-st="incompleto" aria-pressed="false">🧩 Manca qualcosa</button><button type="button" data-st="danneggiato" aria-pressed="false">💥 Danneggiato</button></div>
      <label><span class="field-label">Note</span><input class="input" id="rtNote" maxlength="120"></label>
      <p class="form-error" id="rtErr" role="alert"></p>
      <button type="submit" class="btn btn-block" id="rtGo">Segna come restituito</button>
    </form>
    <details class="hub-details"><summary>Cambia la scadenza</summary><div class="hub-code-row"><input class="input" type="date" id="rtDue" value="${l.due ? new Date(l.due).toISOString().slice(0, 10) : ''}"><button type="button" class="btn-sec" id="rtDueGo">Salva</button></div></details>`);
  let st = 'ok';
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) { st = b.dataset.st; el.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); } });
  $('#rtDueGo', el).addEventListener('click', async () => {
    const d = $('#rtDue', el).value;
    try { await updateLoan(A.aid, lid, { due: d ? new Date(`${d}T20:00:00`).getTime() : null }); toast('Scadenza aggiornata'); Sheet.close(el); } catch (ex) { $('#rtErr', el).textContent = userMsg(ex); }
  });
  $('#rtForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await busy($('#rtGo', el), () => returnGame(A.aid, l, it ? { id: l.item, ...it } : null, A.loans, { state: st, note: $('#rtNote', el).value }, me()));
      toast('↩️ Restituito');
      Sheet.closeAll();
    } catch (ex) { $('#rtErr', el).textContent = userMsg(ex); }
  });
}
function pickGameForLoan() {
  const el = Sheet.open(`${head('🤝 Nuovo prestito')}<input class="input" id="pgQ" type="search" placeholder="Quale gioco?" autofocus><ul class="am-found-list" id="pgList"></ul>`);
  const paint = () => {
    const res = applyFilters(items(), { text: $('#pgQ', el).value, avail: 'si' }, { lib: A.lib }).slice(0, 20);
    $('#pgList', el).innerHTML = res.map((it) => `<li><button type="button" class="am-found-main" data-pg="${esc(it.id)}">${gameImageHTML(it, 'am-img am-img--xs')}<span><b>${esc(it.name)}</b></span></button></li>`).join('') || '<li class="muted">Nessun gioco disponibile con questo nome.</li>';
  };
  $('#pgQ', el).addEventListener('input', paint);
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-pg]'); if (b) { Sheet.close(el); openLend(b.dataset.pg); } });
  paint();
}
function loansHTML() {
  const act = activeLoans(A.loans);
  const past = Object.entries(A.loans || {}).map(([id, l]) => ({ id, ...l })).filter((l) => l.ret).sort((a, b) => b.ret - a.ret);
  const row = (l) => `<li class="am-loan ${isOverdue(l) ? 'is-late' : ''}">
    <button type="button" class="am-loan-main" data-open="${esc(l.item)}"><b>${esc(l.name || A.lib?.[l.item]?.name || 'Gioco')}</b>
    <small>a <b>${esc(l.to)}</b> · dal ${fmtDate(l.start)}${l.due ? ` · ${isOverdue(l) ? '⏰ scaduto il' : 'entro il'} ${fmtDate(l.due)}` : ''}${l.note ? ` · ${esc(l.note)}` : ''}</small></button>
    <button type="button" class="btn-sec btn-sec--sm" data-return="${esc(l.id)}">↩️ Restituito</button></li>`;
  setTimeout(() => $('#amBody')?.querySelectorAll('[data-return]').forEach((b) => b.addEventListener('click', () => openReturn(b.dataset.return))), 0);
  return `
    <div class="am-pane">
      <div class="hub-sec-head"><h2>🤝 In prestito (${act.length})</h2><button type="button" class="btn" data-act="newLoan">➕ Nuovo prestito</button></div>
      ${act.length ? `<ul class="am-loans">${act.map(row).join('')}</ul>` : '<p class="muted">Nessun gioco in prestito.</p>'}
      ${act.some((l) => isOverdue(l)) ? '<p class="am-warn">⏰ I prestiti in rosso hanno superato la data di restituzione.</p>' : ''}
      <h2>Restituiti (${past.length})</h2>
      ${past.length ? `<ul class="am-mini-list">${past.slice(0, 100).map((l) => `<li><button type="button" class="link-btn" data-open="${esc(l.item)}">${esc(l.name || 'Gioco')}</button> — ${esc(l.to)} · ${fmtDate(l.start)} → ${fmtDate(l.ret)}${l.state && l.state !== 'ok' ? ` · <b>${esc(l.state)}</b>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Ancora nessuno.</p>'}
    </div>`;
}

// ---------------------------------------------------------------------------
// Cronologia e cestino
// ---------------------------------------------------------------------------

function logHTML() {
  const evs = Object.values(A.log || {}).filter((x) => x?.at).sort((a, b) => b.at - a.at).slice(0, 300);
  return `<div class="am-pane"><h2>🕘 Cronologia</h2><p class="muted small">Chi ha aggiunto, modificato, prestato o tolto un gioco. Le voci non si possono modificare.</p>
    ${evs.length ? `<ul class="am-log">${evs.map((ev) => `<li><span class="am-log-op">${esc(OPS[ev.op] || ev.op)}</span><span>${ev.item && A.lib?.[ev.item] ? `<button type="button" class="link-btn" data-open="${esc(ev.item)}">${esc(ev.name || A.lib[ev.item].name)}</button>` : `<b>${esc(ev.name || '')}</b>`} ${esc(ev.msg || '')}</span><small class="muted">${fmtWhen(ev.at)}${ev.by ? ` · ${esc(ev.by)}` : ''}</small></li>`).join('')}</ul>` : '<p class="muted">Ancora nessuna modifica registrata.</p>'}</div>`;
}
function trashHTML() {
  const list = Object.entries(A.trash || {}).map(([id, t]) => ({ id, ...t })).filter((t) => t.game?.name).sort((a, b) => b.at - a.at);
  setTimeout(() => {
    $('#amBody')?.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => doRestore(b.dataset.restore)));
    $('#amBody')?.querySelectorAll('[data-purge]').forEach((b) => b.addEventListener('click', () => doPurge(b.dataset.purge)));
  }, 0);
  return `<div class="am-pane"><h2>🗑️ Cestino</h2><p class="muted small">I giochi tolti restano qui finché non li elimini per sempre. Niente viene cancellato da solo.</p>
    ${list.length ? `<ul class="am-loans">${list.map((t) => `<li class="am-loan">${gameImageHTML(t.game, 'am-img am-img--xs')}<span class="am-loan-main"><b>${esc(t.game.name)}</b><small>tolto il ${fmtWhen(t.at)}${t.by ? ` da ${esc(t.by)}` : ''}${t.game.baseId ? ` · espansione di ${esc(A.lib?.[t.game.baseId]?.name || 'un gioco')}` : ''}</small></span>
      <button type="button" class="btn-sec btn-sec--sm" data-restore="${esc(t.id)}">♻️ Ripristina</button><button type="button" class="btn-sec btn-sec--sm am-danger" data-purge="${esc(t.id)}">Elimina per sempre</button></li>`).join('')}</ul>` : '<p class="muted">Il cestino è vuoto.</p>'}</div>`;
}
async function doRestore(id) {
  const rec = A.trash?.[id];
  if (!rec) return;
  try {
    let r = await restoreGame(A.aid, id, rec, A.lib, { by: me() });
    if (r.conflict === 'name') {
      if (!confirm(`Nell’armadio c’è già un gioco chiamato “${rec.game.name}”. Ripristinarlo comunque come gioco separato (per esempio un’altra copia o edizione)?`)) return;
      r = await restoreGame(A.aid, id, rec, A.lib, { asCopy: true, by: me() });
    } else if (r.conflict === 'id') { toast('C’è già un gioco con lo stesso identificativo: non lo sovrascrivo.', 'warn'); return; }
    if (r.ok) toast(`♻️ ${rec.game.name} di nuovo nell’armadio`);
  } catch (err) { toast(userMsg(err), 'error'); }
}
async function doPurge(id) {
  const rec = A.trash?.[id];
  if (!rec) return;
  const ans = prompt(`Eliminare per sempre “${rec.game.name}”? Non si potrà più ripristinare.\n\nPer confermare scrivi ELIMINA:`);
  if ((ans || '').trim().toUpperCase() !== 'ELIMINA') { if (ans !== null) toast('Non eliminato: serve scrivere ELIMINA.', 'warn'); return; }
  try { await purgeGame(A.aid, id, rec.game.name, me()); toast('Eliminato per sempre'); } catch (err) { toast(userMsg(err), 'error'); }
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
    <section class="card am-tool"><h2>🧩 Schede incomplete</h2>
      <ul class="am-mini-list">${CHECK_FIELDS.map((f) => `<li>${miss[f.k] ? `<b>${miss[f.k]}</b>` : '✓'} senza ${f.label}</li>`).join('')}</ul>
      <button type="button" class="btn" data-act="wizard" ${its.some((it) => missingFields(it).length) ? '' : 'disabled'}>✍️ Completa le schede</button></section>
    <section class="card am-tool"><h2>👯 Duplicati</h2>
      <p>${pairs.length ? `${plural(pairs.length, 'coppia da controllare', 'coppie da controllare')}: ${Object.entries(DUP_KINDS).map(([k, l]) => { const n = pairs.filter((p) => p.kind === k).length; return n ? `${n} ${l.toLowerCase()}` : ''; }).filter(Boolean).join(', ')}.` : 'Nessun possibile duplicato.'}</p>
      <button type="button" class="btn-sec" data-act="dups" ${pairs.length ? '' : 'disabled'}>Rivedi</button></section>
    <section class="card am-tool"><h2>📤 Esporta · 📥 Importa</h2>
      <p class="muted small">CSV per Excel (punto e virgola, accenti giusti) o JSON completo. L’importazione mostra prima un’anteprima e si può annullare.</p>
      <div class="hub-row"><button type="button" class="btn-sec" data-act="export-csv">📤 CSV</button><button type="button" class="btn-sec" data-act="export-json">📤 JSON</button><button type="button" class="btn" data-act="import">📥 Importa…</button></div>
      <input type="file" id="amImport" accept=".csv,.json,text/csv,application/json" hidden>
      ${A.undo ? '<button type="button" class="btn-sec btn-sec--sm" id="amUndo">↶ Annulla l’ultima importazione</button>' : ''}</section>
    <section class="card am-tool"><h2>🏷️ Etichette QR</h2>
      <p class="muted small">Da stampare e attaccare alle scatole o agli scaffali: inquadrandole si apre la scheda del gioco.</p>
      <div class="hub-row"><button type="button" class="btn-sec" data-act="labels-all">🏷️ Giochi filtrati (${filtered().length})</button></div>
      <p class="muted small">Per uno scaffale: vista 🗄️ Scaffali › Etichetta. Per alcuni giochi: ☑️ Seleziona › Etichette.</p></section>
    <section class="card am-tool"><h2>🔗 Link pubblico</h2>
      <p>${tok ? '✅ Attivo: chi ha il link vede il catalogo in sola lettura.' : 'Spento. Puoi creare un link per far consultare il catalogo agli amici, senza che possano modificare niente.'}</p>
      <button type="button" class="btn-sec" data-act="share">${tok ? '⚙️ Gestisci il link' : '🔗 Crea il link'}</button></section>
    <section class="card am-tool am-tool--wide"><h2>👥 Persone e permessi</h2>
      <ul class="am-people">
        <li><b>👑 Proprietario</b><span>${A.role === 'owner' ? 'Tu' : 'Chi ha creato l’armadio'} · modifica tutto, rinomina, gestisce le persone</span></li>
        ${admins.map((u) => `<li><b>✏️ ${esc(A.adminInfo?.[u]?.name || 'Dispositivo con la chiave')}${u === A.uid ? ' (tu)' : ''}</b><span>Collaboratore · modifica giochi, prestiti, cestino${A.adminInfo?.[u]?.at ? ` · dal ${fmtDate(A.adminInfo[u].at)}` : ''}</span>${A.role === 'owner' ? `<button type="button" class="btn-sec btn-sec--sm am-danger" data-revoke="${esc(u)}">Revoca</button>` : u === A.uid ? `<button type="button" class="btn-sec btn-sec--sm" data-revoke="${esc(u)}">Lascia</button>` : ''}</li>`).join('') || '<li class="muted">Nessun collaboratore.</li>'}
        <li><b>🎲 Giocatori delle serate</b><span>${players} · possono aggiungere giochi durante le serate, non modificarli</span></li>
        <li><b>👀 Visitatori</b><span>Chi ha il codice ${esc(A.aid)} o il link pubblico: sola lettura</span></li>
      </ul>
      ${A.role === 'owner' ? `<div class="hub-row"><button type="button" class="btn" data-act="invite">➕ Invita un collaboratore</button><button type="button" class="btn-sec btn-sec--sm" data-act="renewKey" title="La chiave serve ai tuoi computer e al QR “Aggiungi dal telefono”">🔑 Cambia la chiave</button></div>
        ${inv.length ? `<p class="muted small">Inviti attivi: ${inv.map(([c, x]) => `<span class="code-chip code-chip--sm">${esc(c)}</span> fino al ${fmtDate(x.exp)} <button type="button" class="link-btn" data-uninvite="${esc(c)}">annulla</button>`).join(' ')}</p>` : ''}` : ''}
    </section>
  </div>`;
}
function bindTools() {
  const b = $('#amBody');
  if (!b) return;
  $('#amImport', b)?.addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openImport(f); });
  $('#amUndo', b)?.addEventListener('click', async () => {
    if (!A.undo || !confirm('Annullare l’ultima importazione? I giochi aggiunti vanno nel cestino e quelli completati tornano come prima.')) return;
    try { await undoImport(A.aid, A.undo, A.lib, me()); A.undo = null; toast('Importazione annullata'); paintTab(); } catch (err) { toast(userMsg(err), 'error'); }
  });
  b.querySelectorAll('[data-revoke]').forEach((x) => x.addEventListener('click', async () => {
    const u = x.dataset.revoke;
    const who = A.adminInfo?.[u]?.name || 'questo dispositivo';
    if (!confirm(u === A.uid ? 'Lasciare l’armadio? Non potrai più modificarlo (resti in sola lettura).' : `Revocare ${who}? Non potrà più modificare l’armadio. Se aveva la chiave dell’armadio, cambiala con “Cambia la chiave”.`)) return;
    // Se era entrato con un invito, l'invito si cancella: con quello non può rientrare
    const usedInv = Object.entries(A.invites || {}).filter(([, x]) => x?.used === u).map(([c]) => [`invites/${c}`, null]);
    try { await update(armadioRef(A.aid), { [`admins/${u}`]: null, [`adminInfo/${u}`]: null, ...(A.role === 'owner' ? Object.fromEntries(usedInv) : {}) }); logEvent(A.aid, { op: 'people', msg: `revocato: ${who}`, by: me() }); toast('Fatto'); if (u === A.uid) location.reload(); } catch (err) { toast(userMsg(err), 'error'); }
  }));
  b.querySelectorAll('[data-uninvite]').forEach((x) => x.addEventListener('click', async () => {
    try { await remove(armadioRef(A.aid, `invites/${x.dataset.uninvite}`)); toast('Invito annullato'); } catch (err) { toast(userMsg(err), 'error'); }
  }));
}

/** QR per fotografare e aggiungere i giochi dal telefono (con la chiave: il telefono diventa collaboratore). */
function openPhoneQR() {
  let k = '';
  try { k = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ }
  const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.searchParams.set('add', '1');
  if (k) u.hash = `ak=${k}`;
  Sheet.open(`${head('📱 Aggiungi dal telefono')}
    <p>Inquadra il QR con il telefono: si apre l’armadio pronto per aggiungere un gioco con la foto.</p>
    <div class="hub-qr">${qrSVG(u.href)}</div>
    <p class="qr-url muted small"><a href="${esc(u.href)}" target="_blank" rel="noopener">${esc(u.href.replace(/^https?:\/\//, ''))}</a></p>
    <p class="muted small">${k ? 'Il QR contiene la chiave dell’armadio: mostralo solo a chi può modificarlo.' : 'Su questo dispositivo manca la chiave: il telefono potrà solo consultare. Per chi deve modificare usa “Invita un collaboratore”.'}</p>`);
}

async function createInvite(btn) {
  const code = randomCode(10);
  const exp = Date.now() + 7 * DAY;
  try {
    await busy(btn, () => set(armadioRef(A.aid, `invites/${code}`), { exp, role: 'editor', by: me().slice(0, 40) }));
    logEvent(A.aid, { op: 'people', msg: 'nuovo invito per un collaboratore', by: me() });
    const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.hash = `inv=${code}`;
    Sheet.open(`${head('➕ Invita un collaboratore')}
      <p>Manda questo link (o fai inquadrare il QR) a chi deve poter modificare l’armadio. Vale per <b>una sola persona</b>, per <b>7 giorni</b>, e non contiene la chiave dell’armadio.</p>
      <div class="hub-qr">${qrSVG(u.href)}</div>
      <p class="hub-link-code"><span class="code-chip">${esc(code)}</span><button type="button" class="btn-sec btn-sec--sm" id="ivCopy">Copia il link</button></p>
      <p class="muted small">Puoi revocare il collaboratore in qualsiasi momento da “Persone e permessi”.</p>`).querySelector('#ivCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(u.href); toast('Link copiato'); } catch { toast(u.href); }
    });
  } catch (err) { toast(userMsg(err), 'error'); }
}
async function renewKey(btn) {
  if (!confirm('Cambiare la chiave dell’armadio? I vecchi QR “Aggiungi dal telefono” smettono di funzionare. Chi è già collaboratore resta collaboratore (revocalo a parte se serve).')) return;
  const k = randomCode(8);
  try {
    await busy(btn, () => set(dbRef(`armadioKeys/${A.aid}`), k));
    try { localStorage.setItem(keyStore(), k); } catch { /* niente */ }
    Person.linkArmadio(A.aid, A.info?.name, k, true).catch(() => {});
    logEvent(A.aid, { op: 'people', msg: 'chiave dell’armadio cambiata', by: me() });
    toast('Chiave cambiata');
  } catch (err) { toast(userMsg(err), 'error'); }
}

// Schede incomplete: una alla volta, solo i campi che mancano
function openWizard() {
  if (!canEdit()) return;
  const chosen = new Set(CHECK_FIELDS.filter((f) => f.k !== 'photo').map((f) => f.k));
  const el = Sheet.open(`${head('✍️ Completa le schede')}
    <p>Quali informazioni vuoi completare? Puoi saltare un gioco o lasciare un campo vuoto: niente è obbligatorio.</p>
    <div class="am-checks">${CHECK_FIELDS.map((f) => `<label class="quick-toggle"><input type="checkbox" data-wf="${f.k}" ${chosen.has(f.k) ? 'checked' : ''}><span>${f.label} (${items().filter((it) => !f.test(it)).length})</span></label>`).join('')}</div>
    <button type="button" class="btn btn-block" id="wzGo">Inizia</button>`, { wide: true });
  el.addEventListener('change', (e) => { const k = e.target.dataset?.wf; if (k) { if (e.target.checked) chosen.add(k); else chosen.delete(k); } });
  $('#wzGo', el).addEventListener('click', () => {
    const queue = sortItems(items().filter((it) => missingFields(it).some((k) => chosen.has(k))), 'name').map((it) => it.id);
    if (!queue.length) { toast('Niente da completare con questi campi.'); return; }
    Sheet.close(el);
    wizardStep(queue, 0, chosen, 0);
  });
}
function wizardStep(queue, i, chosen, saved) {
  if (i >= queue.length) { Sheet.open(`${head('✍️ Fatto')}<p>Schede completate: <b>${saved}</b> su ${queue.length}.</p><button type="button" class="btn btn-block" data-close>Chiudi</button>`); return; }
  const id = queue[i]; const it = A.lib?.[id];
  if (!it) { wizardStep(queue, i + 1, chosen, saved); return; }
  const miss = missingFields(it).filter((k) => chosen.has(k));
  const uniq = (fn) => [...new Set(items().map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  let full = null;
  const fields = miss.map((k) => {
    if (k === 'players') return '<div class="am-grid2"><label><span class="field-label">Giocatori min</span><input class="input" type="number" min="1" max="20" id="wzMin"></label><label><span class="field-label">Giocatori max</span><input class="input" type="number" min="1" max="20" id="wzMax"></label></div>';
    if (k === 'duration') return '<label><span class="field-label">Durata (minuti)</span><input class="input" type="number" min="1" max="600" id="wzDur"></label>';
    if (k === 'mode') return `<label><span class="field-label">Tipologia</span><select class="input select" id="wzMode"><option value="">—</option>${Object.entries(GAME_MODES).map(([m, l]) => `<option value="${m}">${l}</option>`).join('')}</select></label>`;
    if (k === 'weight') return '<label><span class="field-label">Difficoltà (1 facile – 5 impegnativo)</span><input class="input" type="number" min="1" max="5" step="0.5" id="wzW"></label>';
    if (k === 'loc') return `<div class="am-grid2">${LOC_KEYS.map((x) => `<label><span class="field-label">${LOC_LABELS[x]}</span><input class="input" id="wzLoc_${x}" maxlength="30" list="wzdl_${x}" placeholder="${LOC_HINTS[x]}"></label>`).join('')}</div>${LOC_KEYS.map((x) => datalist(`wzdl_${x}`, uniq((g) => g.loc?.[x]))).join('')}`;
    if (k === 'photo') return '<button type="button" class="btn-sec" id="wzPhoto">📷 Scatta o scegli la foto</button><input type="file" id="wzFile" accept="image/*" hidden><span id="wzPhotoOk"></span>';
    return '';
  }).join('');
  const el = Sheet.open(`${head(`✍️ ${i + 1} di ${queue.length}`)}
    <div class="am-wz-progress" aria-hidden="true"><i style="width:${Math.round((i / queue.length) * 100)}%"></i></div>
    <div class="am-wz-head">${gameImageHTML(it, 'am-img am-img--xs')}<div><b>${esc(it.name)}</b><small class="muted">Manca: ${miss.map((k) => CHECK_FIELDS.find((f) => f.k === k).label).join(', ')}</small></div></div>
    <form id="wzForm" class="am-form" novalidate>${fields}<p class="form-error" id="wzErr" role="alert"></p>
      <div class="am-form-actions"><button type="submit" class="btn" id="wzSave">Salva e avanti</button><button type="button" class="btn-sec" id="wzSkip">Salta</button><button type="button" class="link-btn" data-close>Esci</button></div></form>`, { wide: true });
  $('#wzPhoto', el)?.addEventListener('click', () => $('#wzFile', el).click());
  $('#wzFile', el)?.addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { full = await gameImage(f); $('#wzPhotoOk', el).textContent = ' ✓ foto pronta'; } catch (err) { if (!err.cancelled) toast(err.message, 'error'); } });
  $('#wzSkip', el).addEventListener('click', () => { Sheet.close(el); wizardStep(queue, i + 1, chosen, saved); });
  $('#wzForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = (s) => { const v = $(s, el)?.value.trim(); return v ? Number(v.replace(',', '.')) : null; };
    const p = {};
    if ($('#wzMin', el)) { const a = n('#wzMin'); const b = n('#wzMax'); if (a && b && a > b) { $('#wzErr', el).textContent = 'Il minimo è più alto del massimo.'; return; } if (a >= 1 && a <= 20) p.minPlayers = Math.round(a); if (b >= 1 && b <= 20) p.maxPlayers = Math.round(b); }
    if ($('#wzDur', el)) { const d = n('#wzDur'); if (d >= 1 && d <= 600) p.duration = Math.round(d); }
    if ($('#wzMode', el)?.value) p.mode = $('#wzMode', el).value;
    if ($('#wzW', el)) { const w = n('#wzW'); if (w >= 1 && w <= 5) p.weight = Math.round(w * 10) / 10; }
    if ($('#wzLoc_room', el)) { const l = cleanLoc(Object.fromEntries(LOC_KEYS.map((x) => [x, $(`#wzLoc_${x}`, el).value]))); if (l) p.loc = l; }
    let ok = saved;
    if (Object.keys(p).length || full) {
      try {
        await busy($('#wzSave', el), () => saveGame(A.aid, id, p, full ? { full } : {}));
        logEvent(A.aid, { op: 'edit', item: id, name: it.name, msg: `completata: ${diffSummary(it, p) || 'foto'}`, by: me() });
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
  const card = (it) => `<div class="am-dup-card">${gameImageHTML(it, 'am-img am-img--xs')}<div><b>${esc(it.name)}</b><small>${[it.edition, it.language, it.year, it.copies > 1 && `${it.copies} copie`, hasLoc(it) && `📍 ${locText(it.loc)}`, it.ean && `EAN ${it.ean}`].filter(Boolean).map(esc).join(' · ') || '—'}</small></div></div>`;
  const el = Sheet.open(`${head(`👯 Possibili duplicati (${pairs.length})`)}
    <p class="muted small">Decidi tu per ogni coppia. “Sono diversi” la toglie da questo elenco.</p>
    <div class="am-dups">${pairs.map((p, n) => {
      const a = { id: p.a, ...A.lib[p.a] }; const b = { id: p.b, ...A.lib[p.b] };
      return `<section class="card am-dup" data-pair="${n}"><p><span class="am-tag">${DUP_KINDS[p.kind]}</span> <small class="muted">${esc(p.why)}</small></p>
        <div class="am-dup-pair">${card(a)}${card(b)}</div>
        <div class="hub-row">${p.kind === 'similar'
          ? `<button type="button" class="btn-sec btn-sec--sm" data-d="expB">🧩 “${esc(b.name)}” è un’espansione di “${esc(a.name)}”</button><button type="button" class="btn-sec btn-sec--sm" data-d="expA">🧩 “${esc(a.name)}” è un’espansione di “${esc(b.name)}”</button>`
          : `<button type="button" class="btn-sec btn-sec--sm" data-d="copy">➕ Stesso gioco: unisci come copie</button><button type="button" class="btn-sec btn-sec--sm" data-d="trashB">🗑️ Tieni il primo, l’altro nel cestino</button>`}
          <button type="button" class="btn-sec btn-sec--sm" data-d="ok">✓ Sono diversi</button></div></section>`;
    }).join('') || '<p>Nessun possibile duplicato.</p>'}</div>`, { wide: true });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const p = pairs[Number(b.closest('[data-pair]').dataset.pair)];
    const A1 = A.lib[p.a]; const B1 = A.lib[p.b];
    if (!A1 || !B1) { toast('Uno dei due giochi non c’è più.', 'warn'); return; }
    try {
      await busy(b, async () => {
        if (b.dataset.d === 'ok') await update(armadioRef(A.aid), { [`library/${p.a}/dupOk/${p.b}`]: true, [`library/${p.b}/dupOk/${p.a}`]: true });
        else if (b.dataset.d === 'expB') await saveGame(A.aid, p.b, { baseId: p.a });
        else if (b.dataset.d === 'expA') await saveGame(A.aid, p.a, { baseId: p.b });
        else if (b.dataset.d === 'copy') {
          if (B1.loanId) throw Object.assign(new Error(`“${B1.name}” è in prestito: aspetta che torni prima di unirlo.`), { user: true });
          const fill = {};
          for (const k of ['minPlayers', 'maxPlayers', 'duration', 'mode', 'weight', 'language', 'publisher', 'year', 'loc', 'ean', 'rules', 'setup', 'video']) if ((A1[k] === undefined || A1[k] === null) && B1[k] !== undefined && B1[k] !== null) fill[k] = B1[k];
          await saveGame(A.aid, p.a, { ...fill, copies: (Number(A1.copies) || 1) + (Number(B1.copies) || 1) });
          await trashGame(A.aid, p.b, B1, me());
        } else if (b.dataset.d === 'trashB') {
          if (B1.loanId) throw Object.assign(new Error(`“${B1.name}” è in prestito.`), { user: true });
          await trashGame(A.aid, p.b, B1, me());
        }
        logEvent(A.aid, { op: 'dup', item: p.a, name: A1.name, msg: { ok: `diverso da ${B1.name}`, expB: `${B1.name} è sua espansione`, expA: `espansione di ${B1.name}`, copy: `unito con ${B1.name}`, trashB: `${B1.name} nel cestino (doppione)` }[b.dataset.d], by: me() });
      });
      b.closest('[data-pair]').remove();
      toast('Fatto');
    } catch (err) { toast(userMsg(err), 'error'); }
  });
}

// Esporta / importa
const stamp = () => new Date().toISOString().slice(0, 10);
const fileName = (ext) => `armadio_${(A.info?.name || A.aid).replace(/[^\w-]+/g, '_').slice(0, 30)}_${stamp()}.${ext}`;
function exportCSV() { downloadFile(fileName('csv'), toCSV(A.lib), 'text/csv;charset=utf-8'); toast('CSV pronto'); }
function exportJSON() { downloadFile(fileName('json'), toJSON(A.info, A.lib, { withThumbs: true }), 'application/json'); toast('JSON pronto'); }
async function openImport(file) {
  if (file.size > 8 * 1024 * 1024) { toast('File troppo grande (massimo 8 MB).', 'error'); return; }
  let parsed;
  try { parsed = readImportFile(file.name, await file.text()); } catch (err) { Sheet.open(`${head('📥 Importa')}<p class="form-error">${esc(err.user ? err.message : 'File non leggibile.')}</p>`); return; }
  let mode = 'add';
  const el = Sheet.open(`${head(`📥 Importa ${esc(file.name)}`)}<div id="imBody"></div>`, { wide: true });
  const paint = () => {
    const plan = planImport(parsed.rows, A.lib, mode, { bgg: parsed.bgg });
    $('#imBody', el).innerHTML = `
      <p class="muted small">Anteprima: non ho ancora scritto niente.</p>
      <div class="seg" role="radiogroup" aria-label="Modo"><button type="button" data-mode="add" aria-pressed="${mode === 'add'}">🛡️ Prudente: aggiungi solo i nuovi</button><button type="button" data-mode="merge" aria-pressed="${mode === 'merge'}">🧩 Aggiungi e completa i campi vuoti</button></div>
      <ul class="am-im-sum">
        <li><b>${plan.total}</b> righe lette (${parsed.kind}${parsed.bgg ? ' di BoardGameGeek' : ''})</li>
        <li>✅ <b>${plan.add.length}</b> giochi nuovi da aggiungere</li>
        ${mode === 'merge' ? `<li>🧩 <b>${plan.update.length}</b> già presenti: completo i campi vuoti (non sovrascrivo niente)</li>` : ''}
        <li>⏭️ <b>${plan.same.length}</b> già presenti: ${mode === 'merge' ? 'niente da completare' : 'lasciati come sono'}</li>
        ${plan.dupInFile.length ? `<li>👯 <b>${plan.dupInFile.length}</b> ripetuti nel file (tengo il primo)</li>` : ''}
        ${plan.invalid.length ? `<li>❌ <b>${plan.invalid.length}</b> non validi</li>` : ''}
        ${plan.warnings ? `<li>⚠️ ${plan.warnings} avvisi su campi ignorati o corretti</li>` : ''}
      </ul>
      ${plan.add.length ? `<details class="hub-details" open><summary>Da aggiungere (${plan.add.length})</summary><ul class="am-mini-list">${plan.add.slice(0, 200).map((a) => `<li><b>${esc(a.game.name)}</b>${a.game.edition ? ` · ${esc(a.game.edition)}` : ''}${a.warnings.length ? ` <small class="am-warn">⚠️ ${esc(a.warnings.join('; '))}</small>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${plan.update.length ? `<details class="hub-details"><summary>Da completare (${plan.update.length})</summary><ul class="am-mini-list">${plan.update.slice(0, 200).map((u) => `<li><b>${esc(u.name)}</b>: ${esc(Object.keys(u.patch).join(', '))}</li>`).join('')}</ul></details>` : ''}
      ${plan.invalid.length ? `<details class="hub-details"><summary>Non validi (${plan.invalid.length})</summary><ul class="am-mini-list">${plan.invalid.map((x) => `<li>Riga ${x.row}: ${esc(x.name)} — ${esc(x.why)}</li>`).join('')}</ul></details>` : ''}
      ${plan.dupInFile.length ? `<details class="hub-details"><summary>Ripetuti nel file (${plan.dupInFile.length})</summary><ul class="am-mini-list">${plan.dupInFile.map((x) => `<li>Riga ${x.row}: ${esc(x.name)} (come la riga ${x.first})</li>`).join('')}</ul></details>` : ''}
      <p class="form-error" id="imErr" role="alert"></p>
      <div class="am-form-actions"><button type="button" class="btn" id="imGo" ${plan.add.length || plan.update.length ? '' : 'disabled'}>Importa ${plan.add.length + plan.update.length}</button><button type="button" class="btn-sec" data-close>Annulla</button></div>`;
    $('#imGo', el).addEventListener('click', async (e) => {
      try {
        const r = await busy(e.currentTarget, () => applyImport(A.aid, plan, A.lib, me()));
        A.undo = r.undo;
        Sheet.close(el);
        Sheet.open(`${head('📥 Importazione completata')}
          <p>✅ <b>${r.added}</b> aggiunti · 🧩 <b>${r.updated}</b> completati${plan.same.length ? ` · ⏭️ ${plan.same.length} lasciati com’erano` : ''}${plan.invalid.length ? ` · ❌ ${plan.invalid.length} non validi` : ''}.</p>
          ${r.failed.length ? `<p class="form-error">Non importati (${r.failed.length}): ${r.failed.map((f) => esc(f.name)).join(', ')}.</p>` : ''}
          <button type="button" class="btn-sec" id="imUndo">↶ Annulla questa importazione</button>`).querySelector('#imUndo').addEventListener('click', async (ev) => {
          if (!confirm('Annullare? I giochi aggiunti vanno nel cestino e quelli completati tornano come prima.')) return;
          try { await busy(ev.currentTarget, () => undoImport(A.aid, A.undo, A.lib, me())); A.undo = null; toast('Importazione annullata'); Sheet.closeAll(); } catch (err) { toast(userMsg(err), 'error'); }
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
  if (!arr.length && !shelf) { toast('Nessun gioco da etichettare.', 'warn'); return; }
  const lab = (title, sub, ref, url) => `<div class="lab"><div class="q">${qrSVG(url)}</div><div class="t"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}<small>${esc(ref)}</small></div></div>`;
  let labels = '';
  if (shelf) {
    const u = publicUrl('armadio.html'); u.searchParams.set('a', A.aid); u.searchParams.set('pos', shelf);
    labels += lab(`📍 ${shelf}`, `${plural(arr.length, 'gioco', 'giochi')} · ${A.info?.name || ''}`, `Armadio ${A.aid}`, u.href);
  }
  labels += arr.map((it) => lab(it.name, hasLoc(it) ? locText(it.loc) : '', `${A.info?.name || 'Armadio'} · ${A.aid}·${String(it.id).slice(-4)}`, gameLink(it.id))).join('');
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Etichette – ${esc(A.info?.name || 'Armadio')}</title>
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
</style></head><body><h1>🏷️ Etichette · ${esc(A.info?.name || 'Armadio')} · ${new Date().toLocaleDateString('it-IT')}</h1><div class="grid">${labels}</div></body></html>`;
  printReport(html);
}

// Link pubblico
function openShare() {
  if (!canEdit()) return;
  const tok = A.share?.token;
  const f = { ...A.pubFields };
  const el = Sheet.open(`${head('🔗 Link pubblico')}
    <p>Chi apre il link vede il <b>catalogo in sola lettura</b>: può cercare e filtrare, ma non modificare niente. <b>Chiunque riceva il link può vederlo</b>, anche se lo inoltra ad altri.</p>
    <h3>Cosa si vede</h3>
    <ul class="am-mini-list"><li>✅ Nome, miniatura, giocatori, durata, tipologia, difficoltà, lingua, edizione, etichette, regole in breve, espansioni</li>
      <li>🚫 Mai: chi ha in prestito i giochi, note private, proprietari, cronologia, cestino</li></ul>
    <label class="quick-toggle"><input type="checkbox" id="shStatus" ${f.status ? 'checked' : ''}><span>Mostra se un gioco è disponibile (senza dire a chi è prestato)</span></label>
    <label class="quick-toggle"><input type="checkbox" id="shLoc" ${f.loc ? 'checked' : ''}><span>Mostra la posizione in casa (stanza, mobile, ripiano)</span></label>
    <div id="shLink"></div>
    <p class="form-error" id="shErr" role="alert"></p>
    <div class="am-form-actions">${tok ? '<button type="button" class="btn" id="shSave">Salva</button><button type="button" class="btn-sec" id="shRenew">🔁 Nuovo link (il vecchio smette di funzionare)</button><button type="button" class="btn-sec am-danger" id="shOff">Disattiva</button>' : '<button type="button" class="btn" id="shOn">🔗 Crea il link</button>'}</div>`, { wide: true });
  const paintLink = (t) => {
    if (!t) { $('#shLink', el).innerHTML = ''; return; }
    const u = publicUrl('armadio.html'); u.searchParams.set('p', t);
    $('#shLink', el).innerHTML = `<div class="hub-qr">${qrSVG(u.href)}</div><p class="hub-link-code"><input class="input input--sm" readonly value="${esc(u.href)}" aria-label="Link pubblico"><button type="button" class="btn-sec btn-sec--sm" id="shCopy">Copia</button></p>`;
    $('#shCopy', el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(u.href); toast('Link copiato'); } catch { toast(u.href); } });
  };
  paintLink(tok);
  const read = () => ({ status: $('#shStatus', el).checked, loc: $('#shLoc', el).checked });
  const publish = async (t, fields, prev) => {
    A.pubFields = fields;
    const n = await syncPublic(t, A.aid, A.info, A.lib, fields, prev);
    A.pubPrev = Object.fromEntries(items().map((it) => [it.id, pubGame(it, fields)]));
    return n;
  };
  $('#shOn', el)?.addEventListener('click', async (e) => {
    try {
      const t = newToken();
      await busy(e.currentTarget, async () => { await publish(t, read(), {}); await set(armadioRef(A.aid, 'share'), { token: t }); });
      logEvent(A.aid, { op: 'share', msg: 'link pubblico creato', by: me() });
      Sheet.close(el); openShare();
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shSave', el)?.addEventListener('click', async (e) => {
    try { await busy(e.currentTarget, () => publish(tok, read(), A.pubPrev || {})); toast('Link aggiornato'); } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shRenew', el)?.addEventListener('click', async (e) => {
    if (!confirm('Creare un nuovo link? Il vecchio smette subito di funzionare.')) return;
    try {
      const t = newToken();
      await busy(e.currentTarget, async () => { await publish(t, read(), {}); await set(armadioRef(A.aid, 'share'), { token: t }); await remove(dbRef(`pub/${tok}`)); });
      logEvent(A.aid, { op: 'share', msg: 'link pubblico rigenerato', by: me() });
      Sheet.close(el); openShare();
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
  $('#shOff', el)?.addEventListener('click', async (e) => {
    if (!confirm('Disattivare il link pubblico? Chi lo apre vedrà “link non più valido”.')) return;
    try {
      await busy(e.currentTarget, async () => { await remove(dbRef(`pub/${tok}`)); await remove(armadioRef(A.aid, 'share')); });
      A.pubPrev = null;
      logEvent(A.aid, { op: 'share', msg: 'link pubblico disattivato', by: me() });
      toast('Link disattivato'); Sheet.close(el);
    } catch (err) { $('#shErr', el).textContent = userMsg(err); }
  });
}

// Spostare giochi in un altro armadio
async function openMove(ids) {
  if (!canEdit()) return;
  const its = ids.map((id) => ({ id, ...A.lib[id] })).filter((x) => x.name);
  const targets = otherArmadi();
  if (!targets.length) { toast('Non hai altri armadi: creane uno dalla home.', 'warn'); return; }
  const lent = its.filter((x) => x.loanId);
  const orphanExp = its.flatMap((x) => expansionsOf(A.lib, x.id)).filter((x) => !ids.includes(x.id));
  const el = Sheet.open(`${head(`🚚 Sposta ${its.length === 1 ? esc(its[0].name) : plural(its.length, 'gioco', 'giochi')}`)}
    <label><span class="field-label">In quale armadio?</span><select class="input select" id="mvTo">${targets.map((t) => `<option value="${esc(t.id)}">${esc(t.name || t.id)} (${esc(t.id)})</option>`).join('')}</select></label>
    <ul class="am-mini-list">
      <li>Il gioco esce da questo armadio ed entra nell’altro (niente copie), con foto, dati e cronologia.</li>
      <li>📍 La posizione resta ma va riconfermata.</li>
      ${lent.length ? `<li>🤝 <b>${lent.length} in prestito</b>: il prestito segue il gioco nell’altro armadio.</li>` : ''}
      ${orphanExp.length ? `<li>🧩 Le espansioni ${orphanExp.map((x) => `“${esc(x.name)}”`).join(', ')} restano qui (selezionale se vuoi spostarle insieme).</li>` : ''}
    </ul>
    <p class="form-error" id="mvErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="mvGo">Sposta</button>`);
  $('#mvGo', el).addEventListener('click', async (e) => {
    const to = $('#mvTo', el).value;
    try {
      await busy(e.currentTarget, async () => {
        // Bisogna poter modificare anche l'armadio di destinazione
        const info = (await get(armadioRef(to, 'info'))).val();
        if (!info) throw Object.assign(new Error('Quell’armadio non esiste più.'), { user: true });
        let okTo = info.ownerUid === A.uid || (await get(armadioRef(to, `admins/${A.uid}`)).catch(() => null))?.val() === true;
        const key = targets.find((t) => t.id === to)?.key || (() => { try { return localStorage.getItem(`gnr_akey_${to}`) || ''; } catch { return ''; } })();
        if (!okTo && key) {
          try { await set(dbRef(`armadioKeyClaims/${to}/${A.uid}`), key); await set(armadioRef(to, `admins/${A.uid}`), true); okTo = true; } catch { /* niente */ }
        }
        if (!okTo) throw Object.assign(new Error('Non puoi modificare quell’armadio: chiedi al proprietario di invitarti come collaboratore.'), { user: true });
        const r = await moveGames(A.aid, to, ids, A.lib, A.loans, me());
        ids.forEach((id) => A.sel.delete(id));
        Sheet.close(el);
        Sheet.open(`${head('🚚 Spostamento')}<p>✅ ${plural(r.moved.length, 'gioco spostato', 'giochi spostati')} in “${esc(info.name)}”.</p>${r.failed.length ? `<p class="form-error">❌ Non spostati: ${r.failed.map((x) => esc(x.name)).join(', ')}.</p>` : ''}<a class="btn-sec" href="armadio.html?a=${esc(to)}">Apri “${esc(info.name)}”</a>`);
      });
    } catch (err) { $('#mvErr', el).textContent = userMsg(err); }
  });
}

// Viste salvate (filtri + ordinamento + vista)
const viewsKey = () => `gnr_amviews_${A.aid || A.token}`;
function openViews() {
  const list = ls.get(viewsKey(), []) || [];
  const el = Sheet.open(`${head('⭐ Viste salvate')}
    ${list.length ? `<ul class="am-views-list">${list.map((v, i) => `<li><button type="button" class="am-view-go" data-vgo="${i}"><b>${esc(v.name)}</b><small>${esc(activeFilters(v.f).map((c) => c.label).join(' · ') || 'nessun filtro')}${v.f?.text ? ` · “${esc(v.f.text)}”` : ''} · ${esc(SORTS[v.sort] || '')}</small></button><button type="button" class="icon-btn" data-vren="${i}" aria-label="Rinomina">✏️</button><button type="button" class="icon-btn" data-vdel="${i}" aria-label="Elimina">🗑️</button></li>`).join('')}</ul>` : '<p class="muted">Nessuna vista salvata. Imposta filtri, ordinamento e vista, poi salvali qui con un nome (es. “Cooperativi veloci”).</p>'}
    <div class="hub-code-row"><input class="input" id="vName" maxlength="40" placeholder="Nome della vista attuale"><button type="button" class="btn" id="vSave">Salva</button></div>
    <p class="muted small">Le viste restano su questo dispositivo.</p>`);
  const save = (l) => ls.set(viewsKey(), l);
  $('#vSave', el).addEventListener('click', () => {
    const name = cleanName($('#vName', el).value, 40);
    if (!name) { toast('Dai un nome alla vista.', 'warn'); return; }
    const next = [...list.filter((v) => v.name !== name), { name, f: { ...A.f }, sort: A.sort, view: A.view }].slice(-20);
    save(next); toast(`⭐ Vista “${name}” salvata`); Sheet.close(el);
  });
  el.addEventListener('click', (e) => {
    const go = e.target.closest('[data-vgo]'); const ren = e.target.closest('[data-vren]'); const del = e.target.closest('[data-vdel]');
    if (go) { const v = list[Number(go.dataset.vgo)]; A.f = { ...(v.f || {}) }; A.sort = v.sort || 'name'; A.view = v.view || 'grid'; Sheet.close(el); A.tab = 'games'; paintTabs(); mountGames(); return; }
    if (ren) { const v = list[Number(ren.dataset.vren)]; const n = cleanName(prompt('Nuovo nome della vista:', v.name) || '', 40); if (n) { v.name = n; save(list); Sheet.close(el); openViews(); } return; }
    if (del) { const v = list[Number(del.dataset.vdel)]; if (confirm(`Eliminare la vista “${v.name}”?`)) { list.splice(Number(del.dataset.vdel), 1); save(list); Sheet.close(el); openViews(); } }
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
      app.innerHTML = `<main class="phone phone--center"><p class="lock-big" aria-hidden="true">🔒</p><h1 class="ph-title">Link non più valido</h1><p class="ph-lead">Il proprietario ha disattivato o cambiato questo link. Chiedigli quello nuovo.</p><a class="btn-sec" href="index.html">🏠 Home</a></main>`;
      return;
    }
    A.pubInfo = { name: v.name, desc: v.desc, emoji: v.emoji };
    A.pubFields = { status: Boolean(v.fields?.status), loc: Boolean(v.fields?.loc) };
    A.lib = v.games || {};
    A.loaded = true;
    if (!$('#amBody')) mount();
    refresh();
    const gid = param('g');
    if (gid && !A.openedG) { A.openedG = true; setTimeout(() => openGame(gid), 200); }
  }, (err) => showFatal(app, 'Catalogo non disponibile', explainError(err))));
}

// Tema (impostazioni minime anche qui)
document.addEventListener('click', (e) => { if (e.target.closest('[data-act="theme"]')) Sheet.open(`${head('Tema')}${themeSwitchHTML('amTheme')}`); });

boot();
