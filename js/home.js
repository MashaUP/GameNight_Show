// Pagina iniziale (sito e app Android): profilo personale, ingresso nelle serate, armadi, gruppi e impostazioni.
// Il profilo personale (js/person.js) è lo stesso su tutti i dispositivi collegati.
import {
  $, esc, normalizeCode, registerSW, applyTheme, ErrLog, toast, themeSwitchHTML, a11yHTML, PLAYER_COLORS,
  squarePhoto, qrSVG, cleanName, param, randomCode, userError
} from './util.js';
import { isConfigured, connect, get, set, dbRef, roomRef, groupRef, memberRef, armadioRef, onValue, explainError } from './fb.js';
import { Person, parseLinkCode, personKeysFor, mergedNights, lookOf } from './person.js';
import { avatarHTML, avatarOptions, avatarUri } from './avatars.js';
import { progressFor, ACHIEVEMENTS } from './stats.js';
import { isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';
import { mountUpdatePanel, autoCheck } from './updates.js';

ErrLog.install();
applyTheme();
registerSW();

const H = { uid: null, online: false, groupStops: [] };
const CODE6 = /^[A-Z0-9]{6}$/;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } },
  json(k, fb) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } }
};

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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && Sheet.el) { e.preventDefault(); Sheet.close(); } });
const head = (title) => `<div class="panel-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Chiudi">✕</button></div>`;

// ---------------------------------------------------------------------------
// Entra in una serata: prima il QR (nell'app e sui telefoni), poi il codice
// ---------------------------------------------------------------------------

const input = $('#homeCode');
input.addEventListener('input', () => { input.value = normalizeCode(input.value); $('#homeErr').textContent = ''; });
$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizeCode(input.value);
  if (code.length !== 4) { $('#homeErr').textContent = 'Il codice ha 4 caratteri: lo trovi sulla TV.'; input.focus(); return; }
  location.href = `play.html?room=${code}`;
});
const touch = window.matchMedia('(pointer: coarse)').matches;
if (canScanQR() && (isApp() || touch)) {
  $('#scanBtn').hidden = false;
  $('#codeLabel').textContent = 'oppure scrivi il codice che vedi sulla TV';
  $('#scanBtn').addEventListener('click', scanAndGo);
}
async function scanAndGo() {
  const text = await scanQR();
  if (!text) return;
  const link = parseLinkCode(text);
  if (link) { askLink(link); return; }
  const to = routeFromQR(text);
  if (to) location.href = to;
  else toast('Questo QR non è di GameNight Show.', 'warn');
}

/** "Rientra nella serata": solo se la stanza esiste ancora (mai dentro una serata finita senza volerlo). */
async function paintBack() {
  const last = normalizeCode(ls.get('gnr_room'));
  const hostRoom = normalizeCode(ls.get('gnr_host_room'));
  const box = $('#backBox');
  if (hostRoom.length === 4 && H.uid) {
    const meta = (await get(roomRef(hostRoom, 'meta')).catch(() => null))?.val();
    if (meta && meta.hostUid === H.uid) {
      $('#createTitle').textContent = `📺 La tua regia: stanza ${hostRoom}`;
      $('#createTxt').textContent = `${meta.groupName || 'Serata'}: la serata è ancora aperta.`;
      $('#createGo').textContent = 'Torna alla regia';
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
    box.innerHTML = `<a class="hub-back-link" href="play.html?room=${esc(last)}">
      ${me ? avatarHTML(me, '2.4rem') : '<span class="hub-ico" aria-hidden="true">↩️</span>'}
      <span><b>${done ? 'Risultati della serata' : 'Rientra nella serata'} ${esc(last)}</b><small>${esc(meta.groupName || 'Serata senza gruppo')}${done ? ' · finita' : ''}</small></span>
      <span class="hub-go" aria-hidden="true">›</span></a>`;
    box.hidden = false;
  } catch { /* stanza non leggibile: niente scorciatoia */ }
}

// ---------------------------------------------------------------------------
// Profilo personale
// ---------------------------------------------------------------------------

function paintMe(state = Person.data) {
  const box = $('#hubMe');
  if (!isConfigured) {
    box.innerHTML = '<p class="muted">Profilo non disponibile: Firebase non è ancora configurato (vedi README).</p>';
    return;
  }
  if (state?.revoked || state?.missing) {
    box.innerHTML = `
      <h2>👤 Il tuo profilo</h2>
      <p>${state.revoked ? 'Questo dispositivo è stato scollegato dal profilo da un altro dispositivo.' : 'Il profilo salvato qui non esiste più.'}</p>
      <div class="hub-row"><button type="button" class="btn" data-act="create">Crea un profilo</button><button type="button" class="btn-sec" data-act="link">🔗 Collega un profilo</button></div>`;
    return;
  }
  const d = state?.info ? state : null;
  if (!d) {
    box.innerHTML = `
      <div class="hub-me-new">
        <span class="hub-ico hub-ico--lg" aria-hidden="true">👤</span>
        <div><h2>Il tuo profilo</h2><p class="muted">Nome e personaggio pronti per ogni serata, con traguardi e armadi su tutti i tuoi dispositivi (sito e app).</p></div>
      </div>
      <div class="hub-row">
        <button type="button" class="btn" data-act="create">✨ Crea il profilo</button>
        <button type="button" class="btn-sec" data-act="link">🔗 Ce l’ho già</button>
      </div>`;
    return;
  }
  const groups = Object.keys(d.groups || {}).length;
  const arms = Object.keys(d.armadi || {}).length;
  box.innerHTML = `
    <div class="hub-me-row">
      <button type="button" class="hub-av" data-act="edit" aria-label="Modifica il profilo">${avatarHTML(d.info, '4.2rem', 'avatar--shadow')}<i aria-hidden="true">✏️</i></button>
      <div class="hub-me-text">
        <span class="hub-hello">Ciao,</span>
        <b class="hub-name">${esc(d.info.name)}</b>
        ${d.info.motto ? `<span class="muted small">“${esc(d.info.motto)}”</span>` : ''}
        <span class="hub-meta">${groups} ${groups === 1 ? 'gruppo' : 'gruppi'} · ${arms} ${arms === 1 ? 'armadio' : 'armadi'} · ${d.devices || 1} ${d.devices === 1 || !d.devices ? 'dispositivo' : 'dispositivi'}</span>
      </div>
    </div>
    <div class="hub-row hub-row--3">
      <button type="button" class="btn-sec btn-sec--sm" data-act="edit">✏️ <span>Modifica</span></button>
      <button type="button" class="btn-sec btn-sec--sm" data-act="trophies">🏆 <span>Traguardi</span></button>
      <button type="button" class="btn-sec btn-sec--sm" data-act="share" title="Usa il profilo su un altro dispositivo">🔗 <span>Dispositivi</span></button>
    </div>`;
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
    ${head(info ? 'Il tuo profilo' : 'Crea il tuo profilo')}
    <div class="hub-ed-top"><span id="edPrev"></span>
      <div class="field"><label for="edName">Il tuo nome</label><input class="input" id="edName" maxlength="16" autocomplete="nickname" enterkeyhint="done" placeholder="Es. Giulia" value="${esc(f.name)}"></div>
    </div>
    <div class="ph-row"><h3>Personaggio</h3><button type="button" class="btn-sec btn-sec--sm" id="edMore">🔄 <span>Altri</span></button></div>
    <div class="av-grid av-grid--sm" id="edGrid" role="radiogroup" aria-label="Personaggio"></div>
    <div class="av-tools">
      <label class="btn-sec btn-sec--sm" for="edSelfie">📷 <span>Selfie</span></label><input type="file" id="edSelfie" accept="image/*" capture="user" class="sr-only">
      <label class="btn-sec btn-sec--sm" for="edGallery">🖼️ <span>Dalla galleria</span></label><input type="file" id="edGallery" accept="image/*" class="sr-only">
      <button type="button" class="link-btn" id="edNoPhoto" ${f.photo ? '' : 'hidden'}>Togli la foto</button>
    </div>
    <h3>Il tuo colore</h3>
    <div class="swatches" id="edColors" role="radiogroup" aria-label="Colore"></div>
    <div class="field field--stack"><label for="edMotto">Motto <span class="muted">(facoltativo, compare sulla TV)</span></label><input class="input" id="edMotto" maxlength="40" autocomplete="off" placeholder="Es. Stavolta vinco io" value="${esc(f.motto)}"></div>
    <p class="form-error" id="edErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="edSave">${info ? 'Salva' : 'Crea il profilo'}</button>
    ${info ? '' : '<p class="muted small">Lo usi in tutte le serate senza riscriverlo. Per usarlo anche su un altro dispositivo: "🔗 Dispositivi".</p>'}`, { wide: true });
  const look = () => {
    const o = f.options[f.pick];
    return { name: cleanName($('#edName', el).value, 16) || 'Tu', style: o.style, seed: o.seed, color: f.color, photo: f.photo, motto: cleanName($('#edMotto', el).value, 40), opts: f.pick === 0 && info && o.style === info.style && o.seed === info.seed ? f.opts : null };
  };
  const paint = () => {
    $('#edPrev', el).innerHTML = avatarHTML(look(), '4.6rem', 'avatar--shadow');
    $('#edGrid', el).innerHTML = f.options.map((o, i) => `<button type="button" class="av-opt" data-pick="${i}" role="radio" aria-checked="${!f.photo && i === f.pick}" aria-label="Personaggio ${i + 1}" style="--pc:${f.color}"><img src="${esc(avatarUri(o.style, o.seed))}" alt="" draggable="false"></button>`).join('');
    $('#edColors', el).innerHTML = PLAYER_COLORS.map((c) => `<button type="button" class="swatch" data-color="${c}" style="--sc:${c}" role="radio" aria-checked="${c === f.color}" aria-label="Colore ${c}"></button>`).join('');
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
    try { f.photo = await squarePhoto(file); paint(); } catch (err) { if (!err.cancelled) toast(err.message || 'Foto non leggibile', 'error'); }
  };
  $('#edSelfie', el).addEventListener('change', (e) => take(e.target));
  $('#edGallery', el).addEventListener('change', (e) => take(e.target));
  $('#edName', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  $('#edSave', el).addEventListener('click', async (e) => {
    const name = cleanName($('#edName', el).value, 16);
    if (!name) { $('#edErr', el).textContent = 'Scrivi il tuo nome.'; $('#edName', el).focus(); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Salvo…';
    try {
      await H.ready;
      if (info) await Person.saveLook(look());
      else await Person.create(look());
      ls.set('gnr_name', name);
      Sheet.close();
      paintAll();
      toast(info ? '✓ Profilo aggiornato su tutti i tuoi dispositivi' : `Ciao, ${name}! Il profilo è pronto.`);
    } catch (err) {
      $('#edErr', el).textContent = explainError(err);
      btn.disabled = false;
      btn.textContent = info ? 'Salva' : 'Crea il profilo';
    }
  });
}

/** QR e codice per collegare un altro dispositivo (per esempio l'app sul telefono). */
function openShare() {
  if (!Person.local()) { openEditor(null); return; }
  const url = Person.linkUrl();
  const code = Person.linkCode();
  const el = Sheet.open(`
    ${head('Usa il profilo altrove')}
    <p>Sull’altro dispositivo apri GameNight Show (sito o app), tocca <b>Il tuo profilo › Ce l’ho già</b> e inquadra questo QR, oppure scrivi il codice.</p>
    <div class="hub-qr">${qrSVG(url)}</div>
    <p class="hub-link-code"><span class="code-chip">${esc(code)}</span><button type="button" class="btn-sec btn-sec--sm" id="shCopy">Copia</button></p>
    <p class="muted small">Il codice è come una password: dallo solo ai tuoi dispositivi. Nome, personaggio, traguardi e armadi restano uguali ovunque.</p>
    <details class="hub-details"><summary>Sicurezza</summary>
      <p class="muted small">Se qualcuno ha visto il codice, rinnovalo: i dispositivi già collegati restano collegati.</p>
      <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="shRenew">🔁 Nuovo codice</button><button type="button" class="btn-sec btn-sec--sm" id="shOut">🚪 Scollega questo dispositivo</button></div>
    </details>`);
  $('#shCopy', el).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); toast('Codice copiato'); } catch { toast(code); }
  });
  $('#shRenew', el).addEventListener('click', async () => {
    try { await Person.renewKey(); Sheet.close(); openShare(); toast('Nuovo codice pronto'); } catch (err) { toast(explainError(err), 'error'); }
  });
  $('#shOut', el).addEventListener('click', async () => {
    if (!confirm('Scollegare questo dispositivo dal profilo? Sugli altri dispositivi il profilo resta, e potrai ricollegarlo con il codice.')) return;
    await Person.signOut();
    Sheet.close();
    paintAll();
  });
}

/** Collega questo dispositivo a un profilo che esiste già (QR o codice). */
function openLinkInput() {
  const el = Sheet.open(`
    ${head('Hai già un profilo?')}
    <p>Sul dispositivo dove hai il profilo apri <b>Il tuo profilo › 🔗 Dispositivi</b>: compare un QR e un codice.</p>
    ${canScanQR() ? '<button type="button" class="btn btn-block" id="lkScan">📷 Inquadra il QR</button><p class="hub-or">oppure scrivi il codice</p>' : ''}
    <label class="sr-only" for="lkCode">Codice del profilo</label>
    <input class="input code-input code-input--link" id="lkCode" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123-K7Q2XA9F">
    <p class="form-error" id="lkErr" role="alert"></p>
    <button type="button" class="btn-sec btn-block" id="lkGo">Collega</button>
    <details class="hub-details"><summary>Ho solo il codice personale di 6 caratteri</summary>
      <p class="muted small">Il vecchio codice di un gruppo (es. ABC123): lo trovi in "Il mio profilo" durante una serata.</p>
      <div class="hub-code-row"><input class="input code-input code-input--6" id="lkMember" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123"><button type="button" class="btn-sec" id="lkMemberGo">Ritrova</button></div>
      <p class="form-error" id="lkMemberErr" role="alert"></p>
    </details>`);
  $('#lkCode', el).addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15); });
  $('#lkMember', el).addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  $('#lkScan', el)?.addEventListener('click', async () => {
    const t = await scanQR({ title: '📷 Inquadra il QR del profilo', hint: 'Lo trovi sull’altro dispositivo in Il tuo profilo › 🔗 Dispositivi.' });
    if (!t) return;
    const l = parseLinkCode(t);
    if (!l) { $('#lkErr', el).textContent = 'Questo non è il QR di un profilo.'; return; }
    doLink(l, $('#lkErr', el));
  });
  $('#lkGo', el).addEventListener('click', () => {
    const l = parseLinkCode($('#lkCode', el).value);
    if (!l) { $('#lkErr', el).textContent = 'Il codice ha 14 caratteri: 6, un trattino e altri 8.'; return; }
    doLink(l, $('#lkErr', el));
  });
  $('#lkMemberGo', el).addEventListener('click', async () => {
    const id = normalizeCode($('#lkMember', el).value, 6);
    const err = $('#lkMemberErr', el);
    if (id.length !== 6) { err.textContent = 'Il codice ha 6 caratteri.'; return; }
    try { await adoptMember(id); Sheet.close(); paintAll(); } catch (ex) { err.textContent = explainError(ex); }
  });
}

/** Conferma per i link "…index.html#collega=…" e i QR inquadrati. */
function askLink(l) {
  if (Person.local()?.pid === l.pid) { toast('Questo dispositivo usa già questo profilo.'); return; }
  const el = Sheet.open(`
    ${head('Collega questo dispositivo')}
    <p>Vuoi usare qui il profilo <b>${esc(l.pid)}</b>? Nome, personaggio, traguardi e armadi saranno gli stessi dell’altro dispositivo.</p>
    ${Person.local() ? '<p class="muted small">Il profilo che c’è adesso su questo dispositivo viene unito: resta il nome e il personaggio modificati più di recente, gruppi e armadi si sommano.</p>' : ''}
    <p class="form-error" id="alErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="alGo">Collega</button>
    <button type="button" class="link-btn" data-close>Annulla</button>`);
  $('#alGo', el).addEventListener('click', () => doLink(l, $('#alErr', el)));
}

async function doLink(l, errEl) {
  try {
    await H.ready;
    const res = await Person.linkWith(l.pid, l.key);
    Sheet.close();
    paintAll();
    toast(res.merged ? `✓ Profili uniti: ciao, ${res.info?.name || ''}!` : `✓ Collegato: ciao, ${res.info?.name || ''}!`);
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
  if (!m) throw userError('Nessun profilo con questo codice.');
  const profs = ls.json('gnr_profiles', {}) || {};
  profs[m.groupId] = m.id;
  ls.set('gnr_profiles', JSON.stringify(profs));
  if (Person.local()) await Person.linkGroup(m.groupId, m.id);
  else await Person.create(m, { groups: { [m.groupId]: m.id } });
  toast(`Profilo di ${m.name} collegato`);
}

/** Traguardi di tutti i gruppi del profilo (sommati anche tra profili uniti). */
async function openTrophies() {
  const d = Person.data;
  if (!d) return;
  const el = Sheet.open(`${head('🏆 I tuoi traguardi')}<div id="trBody"><p class="muted">Leggo le serate dei tuoi gruppi…</p></div>`, { wide: true });
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
      ? `<div class="tr-group"><b>${esc(r.name)}</b><span class="muted small">Storico privato: lo vedi entrando in una serata del gruppo.</span></div>`
      : `<div class="tr-group"><b>${esc(r.name)}</b><span class="lv-badge">Lv ${r.pr.level}</span><span class="muted small">${esc(r.pr.levelName)} · ${r.pr.nights} ${r.pr.nights === 1 ? 'serata' : 'serate'} · ${r.pr.wins} vittorie</span><i class="tr-bar"><i style="width:${Math.round(r.pr.levelProgress * 100)}%"></i></i></div>`).join('')}</div>
    <h3>Sbloccati: ${got.size} su ${ACHIEVEMENTS.length}</h3>
    <ul class="tr-list">${ACHIEVEMENTS.map((a) => {
      const ok = got.has(a.id);
      if (a.secret && !ok) return '<li class="tr-item is-off"><span>❔</span><div><b>Segreto</b><small>Continua a giocare per scoprirlo</small></div></li>';
      return `<li class="tr-item ${ok ? '' : 'is-off'}"><span>${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></li>`;
    }).join('')}</ul>`
    : '<p>Ancora nessun gruppo: i traguardi arrivano con la prima serata giocata con il profilo.</p>';
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
const armUrl = (id) => `armadio.html?a=${id}`;

function paintArmadi() {
  const list = armadiList();
  $('#tileArmTxt').textContent = list.length ? `${list.length} ${list.length === 1 ? 'armadio' : 'armadi'}: ${list.slice(0, 2).map((a) => a.name).join(', ')}${list.length > 2 ? '…' : ''}` : 'I giochi con la foto, pronti per ogni serata.';
  const box = $('#hubArmadi');
  box.innerHTML = `
    <div class="hub-sec-head"><h2 id="armTitle">📦 I tuoi armadi</h2><button type="button" class="btn-sec btn-sec--sm" id="armNew">➕ <span>Nuovo</span></button></div>
    ${list.length ? `<ul class="hub-list">${list.map((a) => `<li><a class="hub-item" href="${armUrl(a.id)}"><span class="hub-ico" aria-hidden="true">📦</span><span><b>${esc(a.name)}</b><small>${a.own ? 'Tuo' : a.key ? 'Puoi modificarlo' : 'Da consultare'} · codice ${esc(a.id)}</small></span><span class="hub-go" aria-hidden="true">›</span></a></li>`).join('')}</ul>`
      : '<p class="muted">Nessun armadio ancora. Creane uno e aggiungi i giochi con la foto: ogni serata li consulta.</p>'}
    <details class="hub-details"><summary>Ho il codice di un armadio</summary>
      <div class="hub-code-row"><input class="input code-input code-input--6" id="armCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123"><button type="button" class="btn-sec" id="armCodeGo">Apri</button></div>
      <p class="form-error" id="armCodeErr" role="alert"></p>
    </details>
    ${Person.local() ? '' : '<p class="muted small">Con un profilo gli armadi ti seguono su tutti i tuoi dispositivi.</p>'}`;
  $('#armNew').addEventListener('click', openNewArmadio);
  $('#armCode').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value, 6); });
  $('#armCodeGo').addEventListener('click', async () => {
    const id = normalizeCode($('#armCode').value, 6);
    const err = $('#armCodeErr');
    if (id.length !== 6) { err.textContent = 'Il codice ha 6 caratteri.'; return; }
    try {
      await H.ready;
      const info = (await get(armadioRef(id, 'info'))).val();
      if (!info) { err.textContent = 'Nessun armadio con questo codice.'; return; }
      rememberArm(id, info.name);
      await Person.linkArmadio(id, info.name).catch(() => {});
      location.href = armUrl(id);
    } catch (ex) { err.textContent = explainError(ex); }
  });
}
function rememberArm(id, name) {
  const list = (ls.json('gnr_armadi', []) || []).filter((a) => a?.id !== id);
  ls.set('gnr_armadi', JSON.stringify([{ id, name }, ...list].slice(0, 12)));
}
function openNewArmadio() {
  const el = Sheet.open(`
    ${head('📦 Nuovo armadio')}
    <p>Un armadio raccoglie i vostri giochi con la foto. Non dipende da gruppi o stanze: ogni serata lo consulta.</p>
    <div class="field field--stack"><label for="naName">Nome</label><input class="input" id="naName" maxlength="40" autocomplete="off" placeholder="Es. I giochi di ${esc(Person.data?.info?.name || 'casa')}"></div>
    <p class="form-error" id="naErr" role="alert"></p>
    <button type="button" class="btn btn-block" id="naGo">Crea e aggiungi i giochi</button>`);
  $('#naGo', el).addEventListener('click', async (e) => {
    const name = cleanName($('#naName', el).value, 40) || `I giochi di ${Person.data?.info?.name || 'casa'}`;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await H.ready;
      let id = null;
      for (let i = 0; i < 12 && !id; i++) { const c = randomCode(6); if (!(await get(armadioRef(c, 'info'))).exists()) id = c; }
      if (!id) throw new Error('nessun codice libero');
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
$('#tileArm').addEventListener('click', () => {
  const box = $('#hubArmadi');
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------------------------------------------------------------------------
// Le tue serate: resoconti di quelle aperte su questo dispositivo
// ---------------------------------------------------------------------------

function paintHistory() {
  const list = (ls.json('gnr_history', []) || []).filter((n) => /^[A-Z0-9]{4}$/.test(n?.room || ''));
  $('#tileHistTxt').textContent = list.length ? `${list.length} ${list.length === 1 ? 'serata' : 'serate'}: l’ultima ${new Date(list[0].at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}` : 'Resoconti con voti e vincitori.';
  const box = $('#hubHistory');
  box.innerHTML = `
    <h2 id="histTitle">📋 Le tue serate</h2>
    ${list.length ? `<ul class="hub-list">${list.map((n) => `<li><a class="hub-item" href="resoconto.html?room=${esc(n.room)}${n.gid ? `&g=${esc(n.gid)}` : ''}"><span class="hub-ico" aria-hidden="true">📋</span><span><b>${esc(n.group || 'Serata')} · ${esc(n.room)}</b><small>${esc(new Date(n.at).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · resoconto</small></span><span class="hub-go" aria-hidden="true">›</span></a></li>`).join('')}</ul>`
      : '<p class="muted">Qui trovi il resoconto delle serate aperte da questo dispositivo: giochi, voti, vincitori e premi.</p>'}`;
}
$('#tileHist').addEventListener('click', () => {
  const box = $('#hubHistory');
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------------------------------------------------------------------------
// Gruppi: serata in corso
// ---------------------------------------------------------------------------

function paintGroups() {
  H.groupStops.forEach((f) => { try { f(); } catch { /* niente */ } });
  H.groupStops = [];
  const groups = { ...(ls.json('gnr_profiles', {}) || {}), ...(Person.data?.groups || {}) };
  const ids = Object.keys(groups).filter((g) => CODE6.test(g));
  const box = $('#hubGroups');
  box.hidden = !ids.length;
  if (!ids.length) return;
  box.innerHTML = `<h2 id="grpTitle">👥 I tuoi gruppi</h2><ul class="hub-list" id="grpList">${ids.map((g) => `<li id="grp_${esc(g)}"><div class="hub-item"><span class="hub-ico" aria-hidden="true">🎲</span><span><b>…</b><small>Controllo se c’è una serata…</small></span></div></li>`).join('')}</ul>`;
  for (const gid of ids) {
    get(groupRef(gid, 'info')).then((s) => {
      const li = document.getElementById(`grp_${gid}`);
      const name = s.val()?.name || gid;
      if (li) li.querySelector('b').textContent = name;
    }).catch(() => {});
    H.groupStops.push(onValue(groupRef(gid, 'current'), async (snap) => {
      const li = document.getElementById(`grp_${gid}`);
      if (!li) return;
      const cur = snap.val();
      let live = null;
      if (cur?.room) {
        const meta = (await get(roomRef(cur.room, 'meta')).catch(() => null))?.val();
        const st = meta ? (await get(roomRef(cur.room, 'state')).catch(() => null))?.val() : null;
        if (meta) live = { room: cur.room, done: st?.phase === 'awards' && st?.done };
      }
      const name = li.querySelector('b')?.textContent || gid;
      li.innerHTML = live
        ? `<a class="hub-item hub-item--live" href="play.html?room=${esc(live.room)}"><span class="hub-ico" aria-hidden="true">${live.done ? '🏆' : '🔴'}</span><span><b>${esc(name)}</b><small>${live.done ? 'Serata finita: vedi i risultati' : `Serata in corso · stanza ${esc(live.room)}`}</small></span><span class="hub-go" aria-hidden="true">›</span></a>`
        : `<div class="hub-item"><span class="hub-ico" aria-hidden="true">🎲</span><span><b>${esc(name)}</b><small>Nessuna serata in corso</small></span></div>`;
    }, () => {}));
  }
}

// ---------------------------------------------------------------------------
// App Android
// ---------------------------------------------------------------------------

function paintApp() {
  const box = $('#hubApp');
  // Nell'app la sezione sta nelle Impostazioni (e nell'avviso degli aggiornamenti)
  if (isApp() || !apkUrl()) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="hub-sec-head"><h2>📲 Scarica GameNight</h2></div>
    <p>L’app per Android si apre a schermo intero, legge il QR della TV e usa lo stesso profilo del sito. È gratuita.</p>
    <div id="hubVerPanel" class="ver-panel"></div>`;
  mountUpdatePanel($('#hubVerPanel'), { qrSVG, toast, showQR: !isAndroid() });
}

/** Sezione "Scarica GameNight" in una finestra: versioni, aggiornamenti, download e QR per un altro telefono. */
function openUpdates() {
  const el = Sheet.open(`${head('📲 Scarica GameNight')}
    <div id="stVerPanel" class="ver-panel"></div>`, { wide: true });
  mountUpdatePanel($('#stVerPanel', el), { qrSVG, toast, showQR: true });
}

// ---------------------------------------------------------------------------
// Impostazioni e introduzione
// ---------------------------------------------------------------------------

$('#hubSettings').addEventListener('click', () => {
  const el = Sheet.open(`
    ${head('⚙️ Impostazioni')}
    <h3>Tema</h3>${themeSwitchHTML('hubTheme')}
    <h3>Accessibilità</h3>${a11yHTML('hubA11y')}
    <h3>Aiuto</h3>
    <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stIntro">👋 Rivedi l’introduzione</button><a class="btn-sec btn-sec--sm" href="test.html">🩺 Verifica Firebase</a></div>
    ${Person.local() ? '<div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stShare">🔗 Profilo sugli altri dispositivi</button></div>' : ''}
    <h3>Versione</h3>
    <div class="hub-row"><button type="button" class="btn-sec btn-sec--sm" id="stUpd">📲 Aggiornamenti e download dell’app</button></div>
    <p class="muted small" id="stVer"></p>`, { wide: true });
  $('#stUpd', el).addEventListener('click', () => { Sheet.close(); openUpdates(); });
  $('#stIntro', el).addEventListener('click', () => { Sheet.close(); showIntro(true); });
  $('#stShare', el)?.addEventListener('click', () => { Sheet.close(); openShare(); });
  $('#stVer', el).textContent = $('#hubVer').textContent;
});

const INTRO = [
  { ico: '📺', t: 'La TV fa lo show', d: 'Sul PC collegato alla TV crei la serata: compare un QR. La TV svela i voti, fa la classifica e premia il gioco migliore.' },
  { ico: '📱', t: 'Il telefono è il telecomando', d: 'Inquadri il QR ed entri con il tuo profilo. Voti in segreto ogni gioco, fai pronostici, tieni il segnapunti.' },
  { ico: '👤', t: 'Un profilo, ovunque', d: 'Crea il profilo una volta: nome, personaggio, traguardi e armadi dei giochi sono gli stessi sul sito e nell’app.' }
];
function showIntro(force = false) {
  if (!force && ls.get('gnr_intro_done') === '1') return;
  let i = 0;
  const el = Sheet.open('<div id="inBody"></div>', { onClose: () => ls.set('gnr_intro_done', '1') });
  const paint = () => {
    const s = INTRO[i];
    $('#inBody', el).innerHTML = `
      <div class="intro-step"><span class="intro-ico" aria-hidden="true">${s.ico}</span><h2>${esc(s.t)}</h2><p>${esc(s.d)}</p></div>
      <div class="intro-dots" aria-hidden="true">${INTRO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="hub-row hub-row--end"><button type="button" class="link-btn" data-close>Salta</button><button type="button" class="btn" id="inNext">${i < INTRO.length - 1 ? 'Avanti' : (Person.local() ? 'Iniziamo' : 'Crea il profilo')}</button></div>`;
    $('#inNext', el).addEventListener('click', () => {
      if (i < INTRO.length - 1) { i++; paint(); return; }
      Sheet.close();
      if (!Person.local() && isConfigured) openEditor(null);
    });
  };
  paint();
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------

function paintAll() {
  paintMe(Person.data);
  paintArmadi();
  paintGroups();
  paintHistory();
}

async function boot() {
  fetch('version.json', { cache: 'no-cache' }).then((r) => r.json()).then((v) => { $('#hubVer').textContent = `versione ${v.version}`; }).catch(() => {});
  paintApp();
  const cached = Person.cached();
  paintMe(cached);
  paintArmadi();
  paintHistory();
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
      if (found) { ls.set('gnr_profiles', JSON.stringify(profs)); toast(found === 1 ? 'Ho ritrovato il tuo profilo su questo dispositivo' : `Ho ritrovato ${found} profili su questo dispositivo`); }
    } catch { /* regole vecchie o rete assente */ }
  }
  let state = null;
  try {
    state = await Person.load();
    if (!state && !hashLink) state = await Person.migrateLegacy(loadMember).then(() => Person.data).catch(() => null);
  } catch (err) { console.warn('Profilo non caricato', err); state = cached; }
  paintAll();
  paintBack();
  if (legacy.length === 6) { try { await adoptMember(legacy); paintAll(); } catch (err) { toast(explainError(err), 'warn'); } }
  if (hashLink) askLink(hashLink);
  else if (!state) showIntro();
}
boot();
// Avviso "È disponibile GameNight Show …" nell'app, e link diretto alla sezione (index.html#aggiornamenti)
if (location.hash === '#aggiornamenti') { history.replaceState(null, '', location.pathname); openUpdates(); } else autoCheck({ onOpen: openUpdates }).catch(() => {});
window.addEventListener('hashchange', () => {
  if (location.hash === '#aggiornamenti') { history.replaceState(null, '', location.pathname); openUpdates(); return; }
  const l = parseLinkCode(location.hash);
  if (!l) return;
  history.replaceState(null, '', location.pathname);
  H.ready?.then(() => askLink(l));
});
