// Armadio del gruppo da sfogliare sul telefono (pagina aperta dal QR della TV).
import { isConfigured, connect, groupRef, armadioRef, dbRef, get, set, update, push, serverTimestamp, onValue, explainError } from './fb.js';
import { $, esc, fmt, param, normalizeCode, gameImageHTML, libInfo, applyTheme, installImageFallback, showFatal, showNotConfigured, registerSW, themeSwitchHTML, ErrLog, gameImage, cleanName, nameKey, toast } from './util.js';
ErrLog.install();
import { searchLibrary, parseQuery, tagsOf, isAvailable, gameRecord, GAME_STATUS, GAME_MODES } from './stats.js';
import { Person } from './person.js';
import { saveGame, newGameId, logEvent as armLog } from './collection.js';
import { t, lang, fmtDate, langSwitchHTML } from './i18n.js';
import { Favs, favFirst } from './favs.js';

const app = $('#app');
const L = { gid: null, uid: null, info: null, identity: null, library: {}, nights: {}, query: '', quick: new Set(), open: null, canEdit: false, img: null };
const QUICK = ['fav', 'available', 'coop', 'light', 'short', 'never'];

applyTheme();
installImageFallback();
registerSW();
boot();

/** Riferimento ai dati: l'armadio (?a=CODICE) oppure, per i link vecchi, il gruppo (?g=CODICE). */
const base = (path = '') => (L.aid ? armadioRef(L.aid, path) : groupRef(L.gid, path));
const libRef = (path = '') => base(`library${path ? `/${path}` : ''}`);

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  const aid = normalizeCode(param('a'), 6);
  const gid = normalizeCode(param('g'), 6);
  if (aid.length === 6) L.aid = aid;
  else if (gid.length === 6) L.gid = gid;
  else { showFatal(app, t('library.notFound'), t('library.noCode')); return; }
  L.gid = L.aid ? null : gid;
  app.innerHTML = `<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>${t('library.opening')}</p></div>`;
  try {
    L.uid = await connect();
    Person.uid = L.uid;
    await Person.load().catch(() => null);
    L.info = (await get(base('info'))).val();
  } catch (err) { showFatal(app, t('library.noConnection'), explainError(err)); return; }
  if (!L.info) { showFatal(app, t('library.notFound'), t('library.gone')); return; }
  L.canEdit = await canEdit();
  // L'armadio resta nel profilo personale (con la chiave, se questo telefono può modificarlo).
  if (L.aid) {
    let k = '';
    try { k = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ }
    Person.linkArmadio(L.aid, L.info.name, L.canEdit ? k : '', L.info.ownerUid === L.uid).catch(() => {});
    try {
      const list = JSON.parse(localStorage.getItem('gnr_armadi') || '[]').filter((a) => a?.id !== L.aid);
      localStorage.setItem('gnr_armadi', JSON.stringify([{ id: L.aid, name: L.info.name }, ...list].slice(0, 12)));
    } catch { /* niente */ }
  }
  mount();
  for (const key of L.aid ? ['library'] : ['library', 'nights', 'identity']) {
    onValue(base(key), (snap) => { L[key] = snap.val() || (key === 'identity' ? null : {}); paint(); }, () => {});
  }
}

const keyStore = () => (L.aid ? `gnr_akey_${L.aid}` : `gnr_gkey_${L.gid}`);

/**
 * Il telefono può aggiungere giochi se è del proprietario del gruppo, se è autorizzato,
 * se ha già giocato con il gruppo, oppure se arriva dal QR "Aggiungi dal telefono" della TV (con la chiave).
 */
async function canEdit() {
  if (L.info?.ownerUid === L.uid) return true;
  const val = async (path) => (await get(base(path)).catch(() => null))?.val();
  if (await val(`admins/${L.uid}`) === true || await val(`uids/${L.uid}`) === true) return true;
  let key = normalizeCode((location.hash.match(/(?:ak|gk)=([A-Za-z0-9-]+)/) || [])[1] || '', 8);
  if (!key) { try { key = localStorage.getItem(keyStore()) || ''; } catch { /* niente */ } }
  if (!key) return false;
  try {
    await set(dbRef(L.aid ? `armadioKeyClaims/${L.aid}/${L.uid}` : `groupKeyClaims/${L.gid}/${L.uid}`), key);
    await set(base(`admins/${L.uid}`), true);
    try { localStorage.setItem(keyStore(), key); } catch { /* niente */ }
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  } catch { return false; }
}

const PLAYERS_OPT = (label) => `<option value="">${label}</option>${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}`;
const DUR_OPT = () => `<option value="">${t('library.durAny')}</option>${[10, 15, 20, 30, 45, 60, 90, 120, 180].map((d) => `<option value="${d}">${d} min</option>`).join('')}`;

function addFormHTML() {
  if (!L.canEdit) {
    return param('add') === '1'
      ? `<section class="card ph-card"><p class="form-error">${t('library.notAllowed')}</p></section>`
      : '';
  }
  return `
    <details class="card ph-card lb-add" id="lbAdd" ${param('add') === '1' ? 'open' : ''}>
      <summary><h2>${t('library.addTitle')}</h2></summary>
      <form id="lbForm" novalidate>
        <label class="lb-photo" id="lbPhoto">
          <input type="file" id="lbFile" accept="image/*" capture="environment" hidden>
          <span class="lb-photo-box" id="lbPhotoBox">${photoBoxHTML()}</span>
        </label>
        <label class="field-label" for="lbName">${t('library.name')}</label>
        <input class="input" id="lbName" maxlength="40" autocomplete="off" placeholder="${t('library.namePh')}">
        <div class="lb-row">
          <label class="sr-only" for="lbMin">${t('library.min')}</label><select class="input select select--sm" id="lbMin">${PLAYERS_OPT(t('library.minAny'))}</select>
          <label class="sr-only" for="lbMax">${t('library.max')}</label><select class="input select select--sm" id="lbMax">${PLAYERS_OPT(t('library.maxAny'))}</select>
          <label class="sr-only" for="lbDur">${t('library.duration')}</label><select class="input select select--sm" id="lbDur">${DUR_OPT()}</select>
        </div>
        <label class="quick-toggle"><input type="checkbox" id="lbSel" checked><span>${t('library.tonight')}</span></label>
        <p class="form-error" id="lbErr" role="alert"></p>
        <button type="submit" class="btn btn-block" id="lbSave">${t('library.save')}</button>
      </form>
    </details>`;
}

function photoBoxHTML() {
  return `<span>📷</span><b>${t('library.photo')}</b><small>${t('library.photoHint')}</small>`;
}

function bindAddForm() {
  const form = $('#lbForm');
  if (!form) return;
  $('#lbFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      L.img = await gameImage(f);
      $('#lbPhotoBox').innerHTML = `<img src="${L.img}" alt="${t('library.photoAlt')}">`;
      $('#lbErr').textContent = '';
    } catch (err) { $('#lbErr').textContent = err.message; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lbErr');
    const name = cleanName($('#lbName').value);
    if (!name) { err.textContent = t('library.nameNeeded'); $('#lbName').focus(); return; }
    const num = (id) => Number($(id).value) || null;
    const extra = Object.fromEntries(Object.entries({ minPlayers: num('#lbMin'), maxPlayers: num('#lbMax'), duration: num('#lbDur') }).filter(([, v]) => v));
    if (extra.minPlayers && extra.maxPlayers && extra.minPlayers > extra.maxPlayers) { err.textContent = t('library.minMax'); return; }
    const sel = $('#lbSel').checked ? true : null;
    const btn = $('#lbSave');
    btn.disabled = true;
    try {
      const k = nameKey(name);
      const found = Object.entries(L.library || {}).find(([, it]) => nameKey(it?.name) === k);
      if (found) {
        const patch = { ...extra };
        if (sel) patch.sel = true;
        if (L.aid) await saveGame(L.aid, found[0], patch, L.img ? { full: L.img } : {});
        else { if (L.img) patch.image = L.img; await update(libRef(found[0]), patch); }
        toast(t('library.updated', { name: found[1].name }));
      } else {
        if (L.aid) {
          const id = newGameId(L.aid);
          await saveGame(L.aid, id, { name, addedBy: 'Telefono', ...extra, ...(sel ? { sel } : {}) }, { create: true, ...(L.img ? { full: L.img } : {}) }); // i18n-ok: valore salvato nel database
          armLog(L.aid, { op: 'add', item: id, name, by: Person.data?.info?.name || 'Telefono' }); // i18n-ok: valore salvato nel database
        } else {
          const r = push(libRef());
          await set(r, { name, image: L.img || null, addedBy: 'Telefono', addedAt: serverTimestamp(), ...extra, ...(sel ? { sel } : {}) }); // i18n-ok: valore salvato nel database
        }
        toast(t(sel ? 'library.addedTonight' : 'library.added', { name }));
      }
      L.img = null;
      form.reset();
      $('#lbSel').checked = true;
      $('#lbPhotoBox').innerHTML = photoBoxHTML();
      err.textContent = '';
    } catch (e2) { err.textContent = explainError(e2); }
    btn.disabled = false;
  });
}

function mount() {
  app.innerHTML = `
    <main class="phone lb">
      <header class="ph-top"><button type="button" class="btn-sec btn-sec--sm ph-back" id="lbBack" aria-label="${t('library.back')}">←</button><span class="brand-row"><span class="ph-emblem" id="lbEmblem"></span><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span><a class="ph-home" href="index.html" aria-label="Home" title="Home">🏠</a></header>
      <h1 class="ph-title">${t('library.title')}</h1>
      <p class="ph-lead" id="lbLead">${esc(L.info.name || '')}</p>
      ${addFormHTML()}
      <div class="lb-search">
        <label class="sr-only" for="lbSearch">${t('library.search')}</label>
        <input class="input" type="search" id="lbSearch" autocomplete="off" placeholder="${t('library.searchPh')}">
        <div class="rg-chips" id="lbQuick">${QUICK.filter((k) => k !== 'fav' || L.aid).map((k) => `<button type="button" class="lib-chip" data-quick="${k}" aria-pressed="false">${t(`library.quick.${k}`)}</button>`).join('')}</div>
        <p class="muted small" id="lbCount"></p>
      </div>
      <ul class="lb-list" id="lbList"></ul>
      <section class="card ph-card"><h2>${esc(t('theme.label'))}</h2>${themeSwitchHTML('lbTheme')}</section>
      <section class="card ph-card"><h2>${esc(t('common.language'))}</h2>${langSwitchHTML('lbLang')}</section>
    </main>`;
  $('#lbSearch').addEventListener('input', (e) => { L.query = e.target.value; paint(); });
  $('#lbQuick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const k = b.dataset.quick;
    if (L.quick.has(k)) L.quick.delete(k); else L.quick.add(k);
    b.setAttribute('aria-pressed', String(L.quick.has(k)));
    paint();
  });
  bindAddForm();
  window.addEventListener('gnr:back', (e) => { e.preventDefault(); $('#lbBack')?.click(); });
  $('#lbBack').addEventListener('click', () => {
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
    else location.href = 'index.html';
  });
  window.addEventListener('gnr-favs', () => paint());
  $('#lbList').addEventListener('click', (e) => {
    const fv = e.target.closest('[data-fav]');
    if (fv && L.aid) { Favs.toggle(L.aid, fv.dataset.fav).then((on) => toast(t(on ? 'fav.added' : 'fav.removed'))).catch((err) => toast(explainError(err), 'error')); return; }
    const sb = e.target.closest('[data-sel]');
    if (sb) {
      const it = L.library?.[sb.dataset.sel];
      if (it) update(libRef(sb.dataset.sel), { sel: it.sel === true ? null : true }).catch((err) => toast(explainError(err), 'error'));
      return;
    }
    const b = e.target.closest('[data-open]');
    if (!b) return;
    L.open = L.open === b.dataset.open ? null : b.dataset.open;
    paint();
  });
}

function paint() {
  if (!$('#lbList')) return;
  const id = L.identity;
  const c = id?.color;
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) document.documentElement.style.setProperty('--group', c);
  $('#lbEmblem').innerHTML = id?.logo ? `<img src="${esc(id.logo)}" alt="">` : esc(id?.emblem || '');
  const all = Object.entries(L.library || {}).map(([k, it]) => ({ id: k, ...it })).filter((it) => it.name);
  const people = [];
  for (const n of Object.values(L.nights || {})) for (const [k, pp] of Object.entries(n?.people || {})) if (!people.some((p) => p.key === k)) people.push({ key: k, name: pp.name });
  const tags = [...new Set(all.flatMap(tagsOf))];
  const q = L.query.trim();
  const f = q ? parseQuery(q, people, tags) : {};
  if (q && !Object.keys(f).length) f.text = q;
  if (L.quick.has('available')) f.available = true;
  if (L.quick.has('coop')) f.mode = 'cooperativo'; // i18n-ok: codice della modalità
  if (L.quick.has('light')) f.maxWeight = 2;
  if (L.quick.has('short')) f.maxMin = 30;
  if (L.quick.has('never')) f.never = true;
  const ids = new Set(searchLibrary(L.library, f, L.nights).map((x) => x.id));
  const favs = L.aid ? Favs.ids(L.aid) : new Set();
  const items = favFirst(all.filter((it) => ids.has(it.id) && (!L.quick.has('fav') || favs.has(it.id))).sort((a, b) => String(a.name).localeCompare(String(b.name), lang())), favs);
  $('#lbLead').textContent = t('library.lead', { name: L.info.name || '', n: all.length });
  $('#lbCount').textContent = q || L.quick.size ? t('library.count', { n: items.length, total: all.length }) : '';
  const base = (bid) => L.library?.[bid]?.name;
  $('#lbList').innerHTML = items.length ? items.map((it) => {
    const away = !isAvailable(it) ? (it.status === 'prestato' && it.loanTo ? t('library.lentTo', { name: it.loanTo }) : (GAME_STATUS[it.status] || it.status)) : '';
    const rec = L.open === it.id ? gameRecord(L.nights, it.name) : null;
    return `
      <li class="card lb-item ${away ? 'is-away' : ''}">
        <button type="button" class="lb-head" data-open="${esc(it.id)}" aria-expanded="${L.open === it.id}">
          ${gameImageHTML(it, 'game-img--mini')}
          <span class="lb-text"><b>${esc(it.name)}</b><span class="muted small">${esc(libInfo(it) || '')}${it.mode ? ` · ${esc(GAME_MODES[it.mode] || it.mode)}` : ''}${it.weight ? ` · ${t('library.weight', { w: Number(it.weight) })}` : ''}</span>
            ${it.baseId && base(it.baseId) ? `<span class="lib-exp">${t('library.expansion', { name: esc(base(it.baseId)) })}</span>` : ''}
            ${tagsOf(it).length ? `<span class="lib-tags">${tagsOf(it).slice(0, 4).map((t) => `<span>#${esc(t)}</span>`).join('')}</span>` : ''}</span>
          ${away ? `<span class="lb-away">${esc(away)}</span>` : ''}
        </button>
        ${L.aid ? `<button type="button" class="am-fav lb-fav ${favs.has(it.id) ? 'is-on' : ''}" data-fav="${esc(it.id)}" aria-pressed="${favs.has(it.id)}" aria-label="${esc(t(favs.has(it.id) ? 'fav.remove' : 'fav.add'))}">${favs.has(it.id) ? '♥' : '♡'}</button>` : ''}
        ${L.canEdit ? `<button type="button" class="lib-sel lb-sel" data-sel="${esc(it.id)}" aria-pressed="${it.sel === true}">${it.sel === true ? '✓' : '☆'}<span>${t('library.sel')}</span></button>` : (it.sel === true ? `<span class="lb-tonight">⭐ ${t('library.sel')}</span>` : '')}
        ${rec ? `<div class="lb-more">
          <span>${t('library.rec.matches', { n: rec.matches })}</span><span>${t('library.rec.avg', { v: rec.avg !== null ? fmt(rec.avg) : '—' })}</span>
          <span>${t('library.rec.minutes', { v: rec.minutes ? `${rec.minutes} min` : '—' })}</span>
          <span>${t('library.rec.last', { v: rec.last ? fmtDate(rec.last, { day: 'numeric', month: 'short', year: 'numeric' }) : t('library.rec.never') })}</span>
          ${rec.champion ? `<span>${t('library.rec.champion', { v: esc(rec.champion.name) })}</span>` : ''}
          ${it.owner ? `<span>${t('library.rec.owner', { v: esc(it.owner) })}</span>` : ''}
          ${it.publisher || it.year ? `<span>${t('library.rec.publisher', { v: esc([it.publisher, it.year].filter(Boolean).join(', ')) })}</span>` : ''}
        </div>` : ''}
      </li>`;
  }).join('') : `<li class="muted">${t(all.length ? 'library.noMatch' : 'library.empty')}</li>`;
}
