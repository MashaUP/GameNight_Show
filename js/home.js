// Pagina iniziale (sito e app Android): profilo personale, ingresso nelle serate, armadi, gruppi e impostazioni.
// Il profilo personale (js/person.js) è lo stesso su tutti i dispositivi collegati.
// Sezioni (viste) con l'indirizzo dopo #: home, armadi, serate, gruppi, altro. Barra laterale sul computer,
// barra in basso sul telefono. Tutti i testi vengono da js/lang/<lingua>.js.
import {
  $, $$, esc, normalizeCode, registerSW, applyTheme, ErrLog, toast, themeSwitchHTML, a11yHTML, PLAYER_COLORS,
  squarePhoto, qrSVG, cleanName, param, randomCode, userError
} from './util.js';
import { t, fmtDate, langSwitchHTML, applyStatic } from './i18n.js';
import { isConfigured, connect, get, set, dbRef, roomRef, groupRef, memberRef, armadioRef, onValue, explainError } from './fb.js';
import { Person, parseLinkCode, personKeysFor, mergedNights } from './person.js';
import { avatarHTML, avatarOptions, avatarUri } from './avatars.js';
import { progressFor, ACHIEVEMENTS } from './stats.js';
import { isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';
import { mountUpdatePanel, autoCheck } from './updates.js';
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
  open(html, { onClose, wide = false } = {}) {
    this.close();
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet hub-overlay';
    el.innerHTML = `<div class="card sheet ${wide ? 'sheet--tall' : ''}" role="dialog" aria-modal="true">${html}</div>`;
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
    if (meta && meta.hostUid === H.uid) {
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
    box.innerHTML = `<a class="back-link hub-back-link" href="play.html?room=${esc(last)}">
      ${me ? avatarHTML(me, '2.6rem') : '<span class="tile-ico tile-ico--sun" aria-hidden="true">↩️</span>'}
      <span class="mini-text"><b>${esc(done ? t('home.back.results', { code: last }) : t('home.back.rejoin', { code: last }))}</b><small>${esc(meta.groupName || t('home.back.noGroup'))}${done ? ` · ${esc(t('home.back.ended'))}` : ''}</small></span>
      <span class="mini-go" aria-hidden="true">›</span></a>`;
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

function paintMe(state = Person.data) {
  $('#hubMe').innerHTML = meHTML(state, false);
  $('#hubMeFull').innerHTML = `<h2 class="sr-only">${esc(t('home.me.title'))}</h2>${meHTML(state, true)}`;
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
});

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
  const el = Sheet.open(`${head(`🏆 ${esc(t('home.tr.title'))}`)}<div id="trBody"><p class="muted">${esc(t('home.tr.loading'))}</p></div>`, { wide: true });
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
  $('#trBody', el).innerHTML = rows.length ? `
    <div class="tr-groups">${rows.map((r) => r.locked
      ? `<div class="tr-group"><b>${esc(r.name)}</b><span class="muted small">${esc(t('home.tr.private'))}</span></div>`
      : `<div class="tr-group"><b>${esc(r.name)}</b><span class="lv-badge">${esc(t('home.tr.level', { n: r.pr.level }))}</span><span class="muted small">${esc(r.pr.levelName)} · ${esc(t('home.tr.nights', { n: r.pr.nights }))} · ${esc(t('home.tr.wins', { n: r.pr.wins }))}</span><i class="tr-bar"><i style="width:${Math.round(r.pr.levelProgress * 100)}%"></i></i></div>`).join('')}</div>
    <h3>${esc(t('home.tr.unlocked', { n: got.size, total: ACHIEVEMENTS.length }))}</h3>
    <ul class="tr-list">${ACHIEVEMENTS.map((a) => {
      const ok = got.has(a.id);
      if (a.secret && !ok) return `<li class="tr-item is-off"><span>❔</span><div><b>${esc(t('home.tr.secret'))}</b><small>${esc(t('home.tr.secretHint'))}</small></div></li>`;
      return `<li class="tr-item ${ok ? '' : 'is-off'}"><span>${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></li>`;
    }).join('')}</ul>`
    : `<p>${esc(t('home.tr.none'))}</p>`;
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

function paintArmadi() {
  const list = armadiList();
  $('#tileArmTxt').textContent = list.length
    ? `${t('home.arm.count', { n: list.length })}: ${list.slice(0, 2).map((a) => a.name).join(', ')}${list.length > 2 ? '…' : ''}`
    : t('home.arm.empty');
  const box = $('#hubArmadi');
  box.innerHTML = `
    <div class="sec-row"><h1 class="page-title" id="armTitle">📦 ${esc(t('home.arm.title'))}</h1><button type="button" class="ui-btn ui-btn--primary ui-btn--sm" id="armNew">➕ <span>${esc(t('home.arm.new'))}</span></button></div>
    ${list.length ? `<ul class="rows">${list.map((a) => `<li><a class="row hub-item" href="${armUrl(a.id)}"><span class="tile-ico tile-ico--violet" aria-hidden="true">📦</span><span class="mini-text"><b>${esc(a.name)}</b><small>${esc(a.own ? t('home.arm.own') : a.key ? t('home.arm.editor') : t('home.arm.viewer'))} · ${esc(t('home.arm.code', { code: a.id }))}</small></span><span class="mini-go" aria-hidden="true">›</span></a></li>`).join('')}</ul>` // i18n-ok
      : `<p class="empty">${esc(t('home.arm.none'))}</p>`}
    <details class="hub-details"><summary>${esc(t('home.arm.haveCode'))}</summary>
      <div class="hub-code-row"><input class="input code-input code-input--6" id="armCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="${esc(t('home.arm.codeAria'))}"><button type="button" class="btn-sec" id="armCodeGo">${esc(t('common.open'))}</button></div>
      <p class="form-error" id="armCodeErr" role="alert"></p>
    </details>
    ${Person.local() ? '' : `<p class="muted small">${esc(t('home.arm.withProfile'))}</p>`}`;
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
function paintHistory() {
  const list = historyList();
  $('#tileHistTxt').textContent = list.length
    ? t('home.hist.count', { n: list.length, last: fmtDate(list[0].at, { day: 'numeric', month: 'short' }) })
    : t('home.hist.empty');
  const box = $('#hubHistory');
  box.innerHTML = `
    <h1 class="page-title" id="histTitle">📋 ${esc(t('home.hist.title'))}</h1>
    ${list.length ? `<ul class="rows">${list.map((n) => `<li><a class="row hub-item" href="resoconto.html?room=${esc(n.room)}${n.gid ? `&g=${esc(n.gid)}` : ''}"><span class="tile-ico tile-ico--teal" aria-hidden="true">📋</span><span class="mini-text"><b>${esc(n.group || t('home.hist.night'))} · ${esc(n.room)}</b><small>${esc(fmtDate(n.at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(t('home.hist.report'))}</small></span><span class="mini-go" aria-hidden="true">›</span></a></li>`).join('')}</ul>`
      : `<p class="empty">${esc(t('home.hist.none'))}</p>`}`;
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
function renderGroups() {
  const ids = groupIds();
  const full = $('#hubGroups');
  full.innerHTML = `<h1 class="page-title" id="grpTitle">👥 ${esc(t('home.groups.title'))}</h1>
    ${ids.length ? `<ul class="rows" id="grpList">${ids.map((g) => `<li id="grp_${esc(g)}">${groupRowHTML(g)}</li>`).join('')}</ul>` : `<p class="empty">${esc(t('home.groups.none'))}</p>`}`;
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
    get(groupRef(gid, 'info')).then((s) => { H.groups[gid].name = s.val()?.name || gid; renderGroups(); }).catch(() => {});
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
  box.parentElement.classList.toggle('no-app', hide);
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

function openSettings() {
  const el = Sheet.open(`
    ${head(`⚙️ ${esc(t('home.nav.settings'))}`)}
    <h3 id="stLangT">${esc(t('common.language'))}</h3>${langSwitchHTML('hubLang')}
    <p class="muted small">${esc(t('home.set.langHint'))}</p>
    <h3>${esc(t('home.set.theme'))}</h3>${themeSwitchHTML('hubTheme')}
    <h3>${esc(t('home.set.a11y'))}</h3>${a11yHTML('hubA11y')}
    <h3>${esc(t('home.set.help'))}</h3>
    <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stIntro">👋 ${esc(t('home.set.intro'))}</button><a class="btn-sec btn-sec--sm" href="test.html">🩺 ${esc(t('home.info.firebase'))}</a></div>
    ${Person.local() ? `<div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stShare">🔗 ${esc(t('home.set.share'))}</button></div>` : ''}
    <h3>${esc(t('home.set.version'))}</h3>
    <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stUpd">🔄 ${esc(t('upd.check'))}</button></div>
    <p class="muted small" id="stVer"></p>`, { wide: true });
  $('#stUpd', el).addEventListener('click', () => { Sheet.close(); openUpdates(true); });
  $('#stIntro', el).addEventListener('click', () => { Sheet.close(); showIntro(true); });
  $('#stShare', el)?.addEventListener('click', () => { Sheet.close(); openShare(); });
  $('#stVer', el).textContent = $('#hubVer').textContent;
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
  if (legacy.length === 6) { try { await adoptMember(legacy); paintAll(); } catch (err) { toast(explainError(err), 'warn'); } }
  if (hashLink) askLink(hashLink);
  else if (!state) showIntro();
}
boot();
// Avviso "È disponibile GameNight Show …" nell'app, e link diretto alla sezione (index.html#aggiornamenti)
if (location.hash === '#aggiornamenti') { history.replaceState(null, '', location.pathname); openUpdates(); } else autoCheck({ onOpen: () => openUpdates() }).catch(() => {});
