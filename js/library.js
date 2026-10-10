// Armadio del gruppo da sfogliare sul telefono (pagina aperta dal QR della TV).
import { isConfigured, connect, groupRef, armadioRef, dbRef, get, set, update, push, serverTimestamp, onValue, explainError } from './fb.js';
import { $, esc, fmt, param, normalizeCode, gameImageHTML, libInfo, applyTheme, installImageFallback, showFatal, showNotConfigured, registerSW, themeSwitchHTML, ErrLog, gameImage, cleanName, nameKey, toast } from './util.js';
ErrLog.install();
import { searchLibrary, parseQuery, tagsOf, isAvailable, gameRecord, GAME_STATUS, GAME_MODES } from './stats.js';
import { Person } from './person.js';
import { saveGame, newGameId, logEvent as armLog } from './collection.js';

const app = $('#app');
const L = { gid: null, uid: null, info: null, identity: null, library: {}, nights: {}, query: '', quick: new Set(), open: null, canEdit: false, img: null };
const QUICK = [
  ['available', 'Disponibili'], ['coop', 'Cooperativi'], ['light', 'Leggeri'], ['short', 'Fino a 30 min'], ['never', 'Mai giocati']
];

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
  else { showFatal(app, 'Armadio non trovato', 'Il link non contiene il codice dell’armadio: inquadra di nuovo il QR dalla TV.'); return; }
  L.gid = L.aid ? null : gid;
  app.innerHTML = '<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>Apro l’armadio…</p></div>';
  try {
    L.uid = await connect();
    Person.uid = L.uid;
    await Person.load().catch(() => null);
    L.info = (await get(base('info'))).val();
  } catch (err) { showFatal(app, 'Impossibile collegarsi', explainError(err)); return; }
  if (!L.info) { showFatal(app, 'Armadio non trovato', 'Questo armadio non esiste più o il codice è sbagliato.'); return; }
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
const DUR_OPT = `<option value="">Durata —</option>${[10, 15, 20, 30, 45, 60, 90, 120, 180].map((d) => `<option value="${d}">${d} min</option>`).join('')}`;

function addFormHTML() {
  if (!L.canEdit) {
    return param('add') === '1'
      ? '<section class="card ph-card"><p class="form-error">Questo telefono non è autorizzato ad aggiungere giochi: inquadra di nuovo il QR “Aggiungi dal telefono” della TV.</p></section>'
      : '';
  }
  return `
    <details class="card ph-card lb-add" id="lbAdd" ${param('add') === '1' ? 'open' : ''}>
      <summary><h2>➕ Aggiungi un gioco all’armadio</h2></summary>
      <form id="lbForm" novalidate>
        <label class="lb-photo" id="lbPhoto">
          <input type="file" id="lbFile" accept="image/*" capture="environment" hidden>
          <span class="lb-photo-box" id="lbPhotoBox"><span>📷</span><b>Fotografa la scatola</b><small>La foto viene messa sempre nello stesso formato</small></span>
        </label>
        <label class="field-label" for="lbName">Nome del gioco</label>
        <input class="input" id="lbName" maxlength="40" autocomplete="off" placeholder="Es. Dixit">
        <div class="lb-row">
          <label class="sr-only" for="lbMin">Minimo giocatori</label><select class="input select select--sm" id="lbMin">${PLAYERS_OPT('Da —')}</select>
          <label class="sr-only" for="lbMax">Massimo giocatori</label><select class="input select select--sm" id="lbMax">${PLAYERS_OPT('A —')}</select>
          <label class="sr-only" for="lbDur">Durata</label><select class="input select select--sm" id="lbDur">${DUR_OPT}</select>
        </div>
        <label class="quick-toggle"><input type="checkbox" id="lbSel" checked><span>⭐ Lo portiamo stasera</span></label>
        <p class="form-error" id="lbErr" role="alert"></p>
        <button type="submit" class="btn btn-block" id="lbSave">Aggiungi all’armadio</button>
      </form>
    </details>`;
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
      $('#lbPhotoBox').innerHTML = `<img src="${L.img}" alt="Foto del gioco">`;
      $('#lbErr').textContent = '';
    } catch (err) { $('#lbErr').textContent = err.message; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lbErr');
    const name = cleanName($('#lbName').value);
    if (!name) { err.textContent = 'Scrivi il nome del gioco.'; $('#lbName').focus(); return; }
    const num = (id) => Number($(id).value) || null;
    const extra = Object.fromEntries(Object.entries({ minPlayers: num('#lbMin'), maxPlayers: num('#lbMax'), duration: num('#lbDur') }).filter(([, v]) => v));
    if (extra.minPlayers && extra.maxPlayers && extra.minPlayers > extra.maxPlayers) { err.textContent = 'Il minimo di giocatori è più alto del massimo.'; return; }
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
        toast(`${found[1].name} era già nell’armadio: aggiornato`);
      } else {
        if (L.aid) {
          const id = newGameId(L.aid);
          await saveGame(L.aid, id, { name, addedBy: 'Telefono', ...extra, ...(sel ? { sel } : {}) }, { create: true, ...(L.img ? { full: L.img } : {}) });
          armLog(L.aid, { op: 'add', item: id, name, by: Person.data?.info?.name || 'Telefono' });
        } else {
          const r = push(libRef());
          await set(r, { name, image: L.img || null, addedBy: 'Telefono', addedAt: serverTimestamp(), ...extra, ...(sel ? { sel } : {}) });
        }
        toast(`${name} è nell’armadio${sel ? ' ⭐ per stasera' : ''}`);
      }
      L.img = null;
      form.reset();
      $('#lbSel').checked = true;
      $('#lbPhotoBox').innerHTML = '<span>📷</span><b>Fotografa la scatola</b><small>La foto viene messa sempre nello stesso formato</small>';
      err.textContent = '';
    } catch (e2) { err.textContent = explainError(e2); }
    btn.disabled = false;
  });
}

function mount() {
  app.innerHTML = `
    <main class="phone lb">
      <header class="ph-top"><button type="button" class="btn-sec btn-sec--sm ph-back" id="lbBack" aria-label="Indietro">←</button><span class="brand-row"><span class="ph-emblem" id="lbEmblem"></span><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span><a class="ph-home" href="index.html" aria-label="Home" title="Home">🏠</a></header>
      <h1 class="ph-title">📦 Armadio dei giochi</h1>
      <p class="ph-lead" id="lbLead">${esc(L.info.name || '')}</p>
      ${addFormHTML()}
      <div class="lb-search">
        <label class="sr-only" for="lbSearch">Cerca</label>
        <input class="input" type="search" id="lbSearch" autocomplete="off" placeholder="Cerca o chiedi: per 5 persone, massimo 45 minuti">
        <div class="rg-chips" id="lbQuick">${QUICK.map(([k, l]) => `<button type="button" class="lib-chip" data-quick="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
        <p class="muted small" id="lbCount"></p>
      </div>
      <ul class="lb-list" id="lbList"></ul>
      <section class="card ph-card"><h2>Tema</h2>${themeSwitchHTML('lbTheme')}</section>
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
  $('#lbList').addEventListener('click', (e) => {
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
  if (L.quick.has('coop')) f.mode = 'cooperativo';
  if (L.quick.has('light')) f.maxWeight = 2;
  if (L.quick.has('short')) f.maxMin = 30;
  if (L.quick.has('never')) f.never = true;
  const ids = new Set(searchLibrary(L.library, f, L.nights).map((x) => x.id));
  const items = all.filter((it) => ids.has(it.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
  $('#lbLead').textContent = `${L.info.name || ''}: ${all.length} ${all.length === 1 ? 'gioco' : 'giochi'}`;
  $('#lbCount').textContent = q || L.quick.size ? `${items.length} su ${all.length}` : '';
  const base = (bid) => L.library?.[bid]?.name;
  $('#lbList').innerHTML = items.length ? items.map((it) => {
    const away = !isAvailable(it) ? (it.status === 'prestato' && it.loanTo ? `Prestato a ${it.loanTo}` : (GAME_STATUS[it.status] || it.status)) : '';
    const rec = L.open === it.id ? gameRecord(L.nights, it.name) : null;
    return `
      <li class="card lb-item ${away ? 'is-away' : ''}">
        <button type="button" class="lb-head" data-open="${esc(it.id)}" aria-expanded="${L.open === it.id}">
          ${gameImageHTML(it, 'game-img--mini')}
          <span class="lb-text"><b>${esc(it.name)}</b><span class="muted small">${esc(libInfo(it) || '')}${it.mode ? ` · ${esc(GAME_MODES[it.mode] || it.mode)}` : ''}${it.weight ? ` · peso ${String(it.weight).replace('.', ',')}` : ''}</span>
            ${it.baseId && base(it.baseId) ? `<span class="lib-exp">Espansione di ${esc(base(it.baseId))}</span>` : ''}
            ${tagsOf(it).length ? `<span class="lib-tags">${tagsOf(it).slice(0, 4).map((t) => `<span>#${esc(t)}</span>`).join('')}</span>` : ''}</span>
          ${away ? `<span class="lb-away">${esc(away)}</span>` : ''}
        </button>
        ${L.canEdit ? `<button type="button" class="lib-sel lb-sel" data-sel="${esc(it.id)}" aria-pressed="${it.sel === true}">${it.sel === true ? '✓' : '☆'}<span>Stasera</span></button>` : (it.sel === true ? '<span class="lb-tonight">⭐ Stasera</span>' : '')}
        ${rec ? `<div class="lb-more">
          <span><b>${rec.matches}</b> partite</span><span><b>${rec.avg !== null ? fmt(rec.avg) : '—'}</b> media</span>
          <span><b>${rec.minutes ? `${rec.minutes} min` : '—'}</b> durata reale</span>
          <span><b>${rec.last ? new Date(rec.last).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'mai'}</b> ultima volta</span>
          ${rec.champion ? `<span><b>${esc(rec.champion.name)}</b> vince di più</span>` : ''}
          ${it.owner ? `<span><b>${esc(it.owner)}</b> proprietario</span>` : ''}
          ${it.publisher || it.year ? `<span><b>${esc([it.publisher, it.year].filter(Boolean).join(', '))}</b> editore e anno</span>` : ''}
        </div>` : ''}
      </li>`;
  }).join('') : `<li class="muted">${all.length ? 'Nessun gioco corrisponde alla ricerca.' : 'L’armadio è ancora vuoto.'}</li>`;
}
