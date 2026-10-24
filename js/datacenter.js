// I tuoi dati (home › Profilo e app): esportazione e importazione guidata, centro privacy, centro diagnostico.
//
// - Esporta: file "gamenight-export" v2 con le categorie scelte (portability.js). Niente chiavi né codici segreti.
// - Importa: scegli il file → controllo (formato, versione, dati) → anteprima con aggiunte, completamenti e
//   conflitti → conferma → scrittura → esito con i numeri. Un armadio nuovo si scrive in un solo aggiornamento
//   (tutto o niente); se qualcosa va storto si torna indietro e lo si dice. Niente viene sovrascritto.
// - Centro privacy: cosa c'è e dove, e solo le cancellazioni che l'architettura permette davvero.
// - Centro diagnostico: versione, rete, Firebase, servizi, errori; rapporto scaricabile senza dati personali.
import { connect, dbRef, armadioRef, groupRef, get, set, update, remove, onValue, isConfigured, explainError } from './fb.js';
import { esc, toast, downloadFile, ErrLog, randomCode, cleanName } from './util.js';
import { t, lang, fmtNum } from './i18n.js';
import { Person } from './person.js';
import { Favs } from './favs.js';
import { sealBackup } from './vault.js';
import { applyImport, undoImport, newGameId, normTitle } from './collection.js';
import {
  buildExport, parseImport, validateImport, planArmadio, planCounts, newArmadioWrites, mapFavs, CATEGORIES
} from './portability.js';
import { LocalManuals } from './manuals.js';
import { bggHealth, bggEnabled } from './bgg.js';
import { APP_VERSION } from './version.js';
import { isApp } from './native.js';

let C = null;
/** ctx: { Sheet, head, uid(), ready(), armadiList(), rememberArm(id, name), repaint() } */
export function bindDataCenter(ctx) { C = ctx; }

const CODE6 = /^[A-Z0-9]{6}$/;
const today = () => new Date().toISOString().slice(0, 10);
const readable = async (ref) => { try { return (await get(ref)).val(); } catch { return undefined; } };
const canEditArm = (a) => Boolean(a.own || a.key || (() => { try { return localStorage.getItem(`gnr_akey_${a.id}`); } catch { return ''; } })());
const size = (n) => (n >= 1024 * 1024 ? `${fmtNum(n / 1024 / 1024, 1)} MB` : `${fmtNum(Math.max(1, Math.round(n / 1024)))} KB`);

// ---------------------------------------------------------------------------
// Esportazione
// ---------------------------------------------------------------------------

/** Legge tutto quello che questo dispositivo può esportare (senza scrivere niente). */
async function gatherExport() {
  await C.ready();
  const d = Person.data;
  const arms = C.armadiList();
  const armadi = [];
  for (const a of arms.slice(0, 30)) {
    const info = await readable(armadioRef(a.id, 'info'));
    if (!info) continue;
    const lib = (await readable(armadioRef(a.id, 'library'))) || {};
    const loans = canEditArm(a) ? (await readable(armadioRef(a.id, 'loans'))) : undefined;
    armadi.push({ id: a.id, info, lib, loans: loans || {}, canLoans: loans !== undefined });
  }
  const groups = [];
  const gids = new Set([...Object.keys(d?.groups || {}), ...Object.keys((() => { try { return JSON.parse(localStorage.getItem('gnr_profiles') || '{}') || {}; } catch { return {}; } })())]);
  for (const gid of [...gids].filter((g) => CODE6.test(g)).slice(0, 20)) {
    const info = await readable(groupRef(gid, 'info'));
    if (!info) continue;
    const [identity, nights, next] = await Promise.all([readable(groupRef(gid, 'identity')), readable(groupRef(gid, 'nights')), readable(groupRef(gid, 'next'))]);
    if (nights === undefined) continue; // storico privato e questo dispositivo non è membro
    groups.push(sealBackup({ app: 'GameNight_Show', kind: 'group', at: Date.now(), group: { id: gid, name: info.name || '' }, info, identity: identity || null, library: null, nights: nights || {}, next: next || null, photos: null, armadioImages: null }));
  }
  return { look: d?.info || null, favs: Favs.all(), armadi, groups };
}

export async function openExport() {
  const el = C.Sheet.open(`${C.head(`📤 ${esc(t('dc.exp.title'))}`)}<p class="muted">${esc(t('dc.loading'))}</p>`, { wide: true });
  let src;
  try { src = await gatherExport(); } catch (err) { el.querySelector('.muted').textContent = explainError(err); return; }
  if (!el.isConnected) return;
  const nGames = src.armadi.reduce((n, a) => n + Object.keys(a.lib).length, 0);
  const nLoans = src.armadi.reduce((n, a) => n + Object.keys(a.loans || {}).length, 0);
  const nFavs = Object.values(src.favs).reduce((n, g) => n + Object.keys(g).length, 0);
  const nNights = src.groups.reduce((n, g) => n + Object.keys(g.nights || {}).length, 0);
  const row = (k, ok, label, sub) => `<label class="quick-toggle dc-cat"><input type="checkbox" data-cat="${k}" ${ok ? 'checked' : 'disabled'}><span><b>${esc(label)}</b><small>${esc(sub)}</small></span></label>`;
  el.querySelector('.sheet').innerHTML = `${C.head(`📤 ${esc(t('dc.exp.title'))}`)}
    <p>${esc(t('dc.exp.lead'))}</p>
    <div class="dc-cats">
      ${row('profile', Boolean(src.look), t('dc.cat.profile'), src.look ? t('dc.cat.profileSub', { name: src.look.name }) : t('dc.cat.none'))}
      ${row('favs', nFavs > 0, t('dc.cat.favs'), t('dc.cat.favsSub', { n: nFavs }))}
      ${row('armadi', src.armadi.length > 0, t('dc.cat.armadi'), t('dc.cat.armadiSub', { n: src.armadi.length, games: nGames }))}
      ${row('loans', nLoans > 0, t('dc.cat.loans'), t('dc.cat.loansSub', { n: nLoans }))}
      ${row('groups', src.groups.length > 0, t('dc.cat.groups'), t('dc.cat.groupsSub', { n: src.groups.length, nights: nNights }))}
    </div>
    <p class="muted small">🔒 ${esc(t('dc.exp.never'))}</p>
    <button type="button" class="btn btn-block" id="dcExpGo">⬇️ <span>${esc(t('dc.exp.go'))}</span></button>`;
  el.querySelector('#dcExpGo').addEventListener('click', () => {
    const cats = [...el.querySelectorAll('[data-cat]:checked')].map((c) => c.dataset.cat).filter((c) => CATEGORIES.includes(c));
    if (!cats.length) { toast(t('dc.exp.pick'), 'warn'); return; }
    const file = buildExport({ ...src, appVersion: APP_VERSION }, cats);
    downloadFile(`gamenight_dati_${today()}.json`, JSON.stringify(file, null, 1), 'application/json');
    toast(t('dc.exp.done'));
  });
}

// ---------------------------------------------------------------------------
// Importazione guidata
// ---------------------------------------------------------------------------

export function openImport() {
  const el = C.Sheet.open(`${C.head(`📥 ${esc(t('dc.imp.title'))}`)}
    <ol class="dc-steps"><li class="is-on">${esc(t('dc.imp.s1'))}</li><li>${esc(t('dc.imp.s2'))}</li><li>${esc(t('dc.imp.s3'))}</li></ol>
    <p>${esc(t('dc.imp.lead'))}</p>
    <input type="file" id="dcFile" accept="application/json,.json" class="dc-file">
    <p class="form-error" id="dcErr" role="alert"></p>
    <div id="dcPlan"></div>
    <details class="hub-details"><summary>${esc(t('dc.imp.howTitle'))}</summary><ol class="dc-how">${[1, 2, 3, 4].map((i) => `<li>${esc(t(`dc.imp.how${i}`))}</li>`).join('')}</ol></details>`, { wide: true });
  el.querySelector('#dcFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const err = el.querySelector('#dcErr');
    err.textContent = '';
    el.querySelector('#dcPlan').innerHTML = '';
    if (!file) return;
    let parsed;
    try {
      if (file.size > 40 * 1024 * 1024) throw Object.assign(new Error(''), { key: 'port.err.tooBig', params: { mb: 40 } });
      parsed = parseImport(await file.text());
    } catch (ex) { err.textContent = ex.key ? t(ex.key, ex.params) : t('port.err.notJson'); return; }
    const v = validateImport(parsed);
    showPlan(el, parsed, v);
  });
}

/** Passo 2: anteprima con le scelte (destinazione di ogni armadio, modo, prestiti, profilo). */
async function showPlan(el, parsed, v) {
  el.querySelectorAll('.dc-steps li').forEach((li, i) => li.classList.toggle('is-on', i === 1));
  await C.ready();
  const mine = C.armadiList().filter(canEditArm);
  const box = el.querySelector('#dcPlan');
  const warn = v.warnings.length ? `<details class="hub-details"><summary>⚠️ ${esc(t('dc.imp.warnings', { n: v.warnings.length }))}</summary><ul class="am-mini-list">${v.warnings.slice(0, 40).map((w) => `<li>${esc(t(w.key, w.params))}</li>`).join('')}</ul></details>` : '';
  const nothing = !v.profile && !Object.keys(v.favs).length && !v.armadi.length && !v.groups.length;
  if (nothing) { box.innerHTML = `<p class="form-error">${esc(t('dc.imp.empty'))}</p>${warn}`; return; }
  box.innerHTML = `
    ${parsed.tampered ? `<p class="claim-warn">⚠️ ${esc(t('dc.imp.tampered'))}</p>` : ''}
    ${v.profile ? `<section class="dc-sec"><h3>👤 ${esc(t('dc.cat.profile'))}</h3>
      <label class="quick-toggle"><input type="checkbox" id="dcLook" ${Person.data?.info ? '' : 'checked'}><span>${esc(Person.data?.info ? t('dc.imp.lookReplace', { name: v.profile.name, cur: Person.data.info.name }) : t('dc.imp.lookCreate', { name: v.profile.name }))}</span></label></section>` : ''}
    ${v.armadi.map((a, i) => `<section class="dc-sec" data-arm="${i}"><h3>📦 ${esc(a.name || t('dc.imp.noName'))} <small class="muted">${esc(t('dc.imp.armCount', { n: a.games.length }))}</small></h3>
      <label class="field-label" for="dcT${i}">${esc(t('dc.imp.target'))}</label>
      <select class="input select select--sm" id="dcT${i}" data-target>
        <option value="new">${esc(t('dc.imp.targetNew'))}</option>
        ${mine.map((m) => `<option value="${esc(m.id)}" ${m.id === a.srcId ? 'selected' : ''}>${esc(t('dc.imp.targetInto', { name: m.name }))}</option>`).join('')}
        <option value="skip">${esc(t('dc.imp.targetSkip'))}</option>
      </select>
      <div class="dc-mode" data-modebox>
        <label class="quick-toggle"><input type="radio" name="dcM${i}" value="add" checked><span>${esc(t('dc.imp.modeAdd'))}</span></label>
        <label class="quick-toggle"><input type="radio" name="dcM${i}" value="merge"><span>${esc(t('dc.imp.modeMerge'))}</span></label>
      </div>
      ${a.loans.length ? `<label class="quick-toggle" data-loansbox><input type="checkbox" data-loans><span>${esc(t('dc.imp.loans', { n: a.loans.length }))}</span></label>` : ''}
      <p class="dc-counts" data-counts></p></section>`).join('')}
    ${Object.keys(v.favs).length ? `<section class="dc-sec"><h3>❤️ ${esc(t('dc.cat.favs'))}</h3><p class="muted small">${esc(t('dc.imp.favs'))}</p></section>` : ''}
    ${v.groups.length ? `<section class="dc-sec"><h3>👥 ${esc(t('dc.cat.groups'))}</h3><p class="muted small">${esc(t('dc.imp.groups'))}</p>
      <ul class="am-mini-list">${v.groups.map((g, i) => `<li>${esc(g.group.name || g.group.id)} · ${esc(t('dc.imp.nights', { n: Object.keys(g.nights || {}).length }))} <button type="button" class="link-btn" data-gdl="${i}">${esc(t('dc.imp.groupFile'))}</button></li>`).join('')}</ul></section>` : ''}
    ${warn}
    <p class="muted small">${esc(t('dc.imp.safe'))}</p>
    <button type="button" class="btn btn-block" id="dcGo">${esc(t('dc.imp.go'))}</button>`;
  const libs = {};
  const plans = [];
  const refresh = async () => {
    for (const sec of box.querySelectorAll('[data-arm]')) {
      const i = Number(sec.dataset.arm);
      const a = v.armadi[i];
      const target = sec.querySelector('[data-target]').value;
      const modeBox = sec.querySelector('[data-modebox]');
      const loansBox = sec.querySelector('[data-loansbox]');
      modeBox.hidden = target === 'new' || target === 'skip';
      if (loansBox) loansBox.hidden = target !== 'new';
      const counts = sec.querySelector('[data-counts]');
      if (target === 'skip') { plans[i] = null; counts.textContent = t('dc.imp.skipped'); continue; }
      if (target !== 'new' && !libs[target]) { counts.textContent = t('dc.loading'); libs[target] = (await readable(armadioRef(target, 'library'))) || {}; }
      const mode = sec.querySelector(`input[name="dcM${i}"]:checked`)?.value || 'add';
      const p = planArmadio(a, { target: target === 'new' ? 'new' : 'existing', lib: libs[target] || {}, mode, withLoans: Boolean(sec.querySelector('[data-loans]')?.checked) });
      plans[i] = { ...p, aid: target === 'new' ? null : target, arm: a, mode };
      const c = planCounts(p);
      counts.innerHTML = [
        `➕ <b>${c.add}</b> ${esc(t('dc.imp.cAdd'))}`, c.update ? `✏️ <b>${c.update}</b> ${esc(t('dc.imp.cUpdate'))}` : '',
        c.same ? `= <b>${c.same}</b> ${esc(t('dc.imp.cSame'))}` : '', c.invalid ? `⚠️ <b>${c.invalid}</b> ${esc(t('dc.imp.cInvalid'))}` : '', c.loans ? `🤝 <b>${c.loans}</b> ${esc(t('dc.imp.cLoans'))}` : ''
      ].filter(Boolean).join(' · ');
    }
  };
  box.addEventListener('change', () => { refresh(); });
  box.addEventListener('click', (e) => {
    const g = e.target.closest('[data-gdl]');
    if (g) { const b = v.groups[Number(g.dataset.gdl)]; downloadFile(`gamenight_gruppo_${b.group.id}_${today()}.json`, JSON.stringify(b), 'application/json'); }
  });
  await refresh();
  box.querySelector('#dcGo').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const total = plans.filter(Boolean).reduce((n, p) => n + p.add.length + p.update.length, 0);
    const look = box.querySelector('#dcLook')?.checked;
    if (!total && !look && !Object.keys(v.favs).length) { toast(t('dc.imp.nothingToDo'), 'warn'); return; }
    if (!confirm(t('dc.imp.confirm', { n: total }))) return;
    btn.disabled = true;
    btn.textContent = t('dc.imp.working');
    const res = await applyAll(v, plans, { look });
    el.querySelectorAll('.dc-steps li').forEach((li, i) => li.classList.toggle('is-on', i === 2));
    showResult(box, res);
    C.repaint?.();
  });
}

async function createArmadio(a) {
  const uid = C.uid();
  for (let i = 0; i < 12; i++) {
    const id = randomCode(6);
    if ((await get(armadioRef(id, 'info'))).exists()) continue;
    const info = { name: cleanName(a.name, 40) || t('dc.imp.importedName'), ownerUid: uid, createdAt: Date.now() };
    if (a.desc) info.desc = a.desc;
    if (a.emoji) info.emoji = a.emoji;
    await set(armadioRef(id, 'info'), info);
    const key = randomCode(8);
    await set(dbRef(`armadioKeys/${id}`), key);
    try { localStorage.setItem(`gnr_akey_${id}`, key); } catch { /* niente */ }
    C.rememberArm(id, info.name);
    await Person.linkArmadio(id, info.name, key, true).catch(() => {});
    return id;
  }
  throw new Error(t('common.noFreeCode'));
}

/** Passo 3: scrive tutto. Per ogni armadio: tutto o niente (con ritorno indietro se qualcosa fallisce). */
async function applyAll(v, plans, { look }) {
  const res = { armadi: [], favs: 0, profile: null, errors: [] };
  const armMap = {};
  const by = (Person.data?.info?.name || t('dc.imp.by')).slice(0, 24);
  for (const p of plans) {
    if (!p) continue;
    const name = p.arm.name || t('dc.imp.noName');
    if (!p.aid) {
      let aid = null;
      let written = null;
      try {
        aid = await createArmadio(p.arm);
        const { upd, ids } = newArmadioWrites(p, { by, newId: () => newGameId(aid) });
        written = upd;
        const bytes = JSON.stringify(upd).length;
        if (bytes < 8 * 1024 * 1024) await update(armadioRef(aid), upd);
        else {
          // File molto grande (tante miniature): a blocchi, e se un blocco fallisce si cancella tutto.
          const entries = Object.entries(upd);
          for (let i = 0; i < entries.length; i += 300) await update(armadioRef(aid), Object.fromEntries(entries.slice(i, i + 300)));
        }
        if (p.arm.srcId) armMap[p.arm.srcId] = { aid, ids };
        res.armadi.push({ name, aid, added: p.add.length, updated: 0, loans: (p.loans || []).length, isNew: true });
      } catch (err) {
        if (aid) {
          // Ritorno indietro: l'armadio appena creato non resta a metà.
          const undo = Object.fromEntries(Object.keys(written || {}).map((k) => [k, null]));
          await update(armadioRef(aid), undo).catch(() => {});
          await remove(armadioRef(aid, 'info')).catch(() => {});
          await Person.unlinkArmadio(aid).catch(() => {});
        }
        res.errors.push({ name, msg: explainError(err), rolledBack: Boolean(aid) });
      }
    } else {
      const lib = (await readable(armadioRef(p.aid, 'library'))) || {};
      const planForImport = { add: p.add, update: p.update };
      try {
        const r = await applyImport(p.aid, planForImport, lib, by);
        if (r.failed.length) {
          await undoImport(p.aid, r.undo, (await readable(armadioRef(p.aid, 'library'))) || {}, by).catch(() => {});
          res.errors.push({ name, msg: t('dc.imp.partial', { n: r.failed.length }), rolledBack: true });
        } else {
          // Per i preferiti: id dei giochi del file → id nell'armadio di destinazione (per nome).
          const after = (await readable(armadioRef(p.aid, 'library'))) || {};
          const byName = new Map(Object.entries(after).filter(([, it]) => it?.name).map(([id, it]) => [normTitle(it.name), id]));
          const ids = new Map(p.arm.games.filter((g) => g.srcId).map((g) => [g.srcId, byName.get(normTitle(g.game.name))]).filter(([, id]) => id));
          if (p.arm.srcId) armMap[p.arm.srcId] = { aid: p.aid, ids };
          res.armadi.push({ name, aid: p.aid, added: r.added, updated: r.updated, loans: 0, isNew: false, undo: r.undo });
        }
      } catch (err) { res.errors.push({ name, msg: explainError(err), rolledBack: false }); }
    }
  }
  // Preferiti: solo per i giochi che adesso esistono davvero negli armadi di destinazione.
  try { res.favs = await Favs.importAll(mapFavs(v.favs, armMap)); } catch (err) { res.errors.push({ name: t('dc.cat.favs'), msg: explainError(err) }); }
  if (look && v.profile) {
    try {
      if (Person.data?.info) await Person.saveLook({ ...Person.data.info, ...v.profile });
      else await Person.create(v.profile);
      res.profile = v.profile.name;
    } catch (err) { res.errors.push({ name: t('dc.cat.profile'), msg: explainError(err) }); }
  }
  return res;
}

function showResult(box, res) {
  box.innerHTML = `<section class="dc-sec dc-result"><h3>${res.errors.length ? '⚠️' : '✅'} ${esc(res.errors.length ? t('dc.imp.doneErrors') : t('dc.imp.done'))}</h3>
    <ul class="am-mini-list">
      ${res.armadi.map((a) => `<li><b>${esc(a.name)}</b>: ${esc(t('dc.imp.resArm', { added: a.added, updated: a.updated }))}${a.loans ? ` · ${esc(t('dc.imp.resLoans', { n: a.loans }))}` : ''} · <a href="armadio.html?a=${esc(a.aid)}">${esc(t('dc.imp.openArm'))}</a>${a.undo && (a.added || a.updated) ? ` · <button type="button" class="link-btn" data-undo="${esc(a.aid)}">${esc(t('dc.imp.undo'))}</button>` : ''}</li>`).join('')} // i18n-ok
      ${res.favs ? `<li>❤️ ${esc(t('dc.imp.resFavs', { n: res.favs }))}</li>` : ''}
      ${res.profile ? `<li>👤 ${esc(t('dc.imp.resProfile', { name: res.profile }))}</li>` : ''}
      ${res.errors.map((e) => `<li class="form-error">${esc(e.name)}: ${esc(e.msg)}${e.rolledBack ? ` (${esc(t('dc.imp.rolledBack'))})` : ''}</li>`).join('')}
    </ul></section>`;
  box.addEventListener('click', async (e) => {
    const u = e.target.closest('[data-undo]');
    if (!u) return;
    const a = res.armadi.find((x) => x.aid === u.dataset.undo);
    if (!a?.undo || !confirm(t('dc.imp.undoConfirm'))) return;
    u.disabled = true;
    try { await undoImport(a.aid, a.undo, (await readable(armadioRef(a.aid, 'library'))) || {}, ''); toast(t('dc.imp.undone')); u.replaceWith(document.createTextNode(t('dc.imp.undone'))); } catch (err) { toast(explainError(err), 'error'); u.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Centro privacy
// ---------------------------------------------------------------------------

function localKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^gnr_/.test(k)) out.push(k); } } catch { /* niente */ }
  return out;
}

export async function openPrivacy() {
  const el = C.Sheet.open(`${C.head(`🔐 ${esc(t('dc.priv.title'))}`)}<p class="muted">${esc(t('dc.loading'))}</p>`, { wide: true });
  await C.ready();
  const d = Person.data;
  const keys = localKeys();
  const manuals = await LocalManuals.list();
  let storage = null;
  try { storage = await navigator.storage?.estimate?.(); } catch { /* niente */ }
  const arms = C.armadiList();
  const pubs = [];
  for (const a of arms.filter(canEditArm).slice(0, 20)) {
    const sh = await readable(armadioRef(a.id, 'share'));
    if (sh?.token) pubs.push({ aid: a.id, name: a.name, token: sh.token });
  }
  if (!el.isConnected) return;
  const sec = (icon, title, body) => `<section class="dc-sec"><h3>${icon} ${esc(title)}</h3>${body}</section>`;
  const li = (txt) => `<li>${esc(txt)}</li>`;
  el.querySelector('.sheet').innerHTML = `${C.head(`🔐 ${esc(t('dc.priv.title'))}`)}
    <p>${esc(t('dc.priv.lead'))}</p>
    ${sec('📱', t('dc.priv.device'), `<ul class="am-mini-list">${li(t('dc.priv.deviceKeys', { n: keys.length }))}${li(t('dc.priv.deviceManuals', { n: manuals.length }))}${storage?.usage ? li(t('dc.priv.deviceSpace', { used: size(storage.usage) })) : ''}${li(t('dc.priv.deviceVault'))}</ul>`)}
    ${sec('☁️', t('dc.priv.cloud'), `<ul class="am-mini-list">
      ${li(d?.info ? t('dc.priv.cloudProfile', { name: d.info.name, n: d.devices || 1 }) : t('dc.priv.cloudNoProfile'))}
      ${li(t('dc.priv.cloudArmadi', { n: arms.length }))}${li(t('dc.priv.cloudFavs', { n: Object.values(Favs.all()).reduce((n, g) => n + Object.keys(g).length, 0) }))}
      ${li(t('dc.priv.cloudGroups'))}${li(t('dc.priv.cloudRooms'))}</ul>`)}
    ${sec('👀', t('dc.priv.shared'), `<ul class="am-mini-list">${li(t('dc.priv.sharedRoom'))}${li(t('dc.priv.sharedGroup'))}${li(t('dc.priv.sharedArm'))}</ul>
      ${pubs.length ? `<p><b>${esc(t('dc.priv.pubs', { n: pubs.length }))}</b></p><ul class="am-mini-list">${pubs.map((p) => `<li>${esc(p.name)} · <button type="button" class="link-btn" data-pub-off="${esc(p.aid)}" data-tok="${esc(p.token)}">${esc(t('dc.priv.pubOff'))}</button></li>`).join('')}</ul>` : `<p class="muted small">${esc(t('dc.priv.noPubs'))}</p>`}`)}
    ${sec('🌐', t('dc.priv.ext'), `<ul class="am-mini-list">${li(t('dc.priv.extFirebase'))}${li(t('dc.priv.extGithub'))}${bggEnabled() ? li(t('dc.priv.extBgg')) : ''}${li(t('dc.priv.extLinks'))}${li(t('dc.priv.extNone'))}</ul>`)}
    ${sec('🧰', t('dc.priv.actions'), `
      <div class="dc-actions">
        <button type="button" class="btn-sec" data-pa="export">📤 <span>${esc(t('dc.exp.title'))}</span></button>
        ${d?.pid ? `<button type="button" class="btn-sec" data-pa="unlink">🔌 <span>${esc(t('dc.priv.unlink'))}</span></button>` : ''}
        <button type="button" class="btn-sec" data-pa="clearDevice">🧹 <span>${esc(t('dc.priv.clearDevice'))}</span></button>
        ${d?.pid ? `<button type="button" class="btn-sec am-danger" data-pa="deleteProfile">🗑️ <span>${esc(t('dc.priv.deleteProfile'))}</span></button>` : ''}
      </div>
      <p class="muted small">${esc(t('dc.priv.limits'))}</p>`)}
    <p class="muted small">${esc(t('dc.priv.docs'))}</p>`;
  el.addEventListener('click', async (e) => {
    const po = e.target.closest('[data-pub-off]');
    if (po) {
      if (!confirm(t('dc.priv.pubOffConfirm'))) return;
      try { await remove(dbRef(`pub/${po.dataset.tok}`)); await remove(armadioRef(po.dataset.pubOff, 'share')); toast(t('dc.priv.pubOffDone')); po.replaceWith(document.createTextNode(t('dc.priv.pubOffDone'))); } catch (err) { toast(explainError(err), 'error'); }
      return;
    }
    const b = e.target.closest('[data-pa]');
    if (!b) return;
    const a = b.dataset.pa;
    if (a === 'export') { openExport(); return; }
    if (a === 'unlink') {
      if (!confirm(t('dc.priv.unlinkConfirm'))) return;
      await Person.signOut();
      toast(t('dc.priv.unlinkDone'));
      C.Sheet.close(); C.repaint?.();
      return;
    }
    if (a === 'clearDevice') {
      const w = prompt(t('dc.priv.clearConfirm'));
      if (!w || w.trim().toUpperCase() !== t('dc.priv.clearWord').toUpperCase()) return;
      for (const k of localKeys()) { try { localStorage.removeItem(k); } catch { /* niente */ } }
      try { sessionStorage.clear(); } catch { /* niente */ }
      await LocalManuals.clear();
      for (const name of ['gnr_vault', 'gnr_manuals', 'gnr_sounds']) { try { indexedDB.deleteDatabase(name); } catch { /* niente */ } }
      try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* niente */ }
      toast(t('dc.priv.clearDone'));
      setTimeout(() => location.reload(), 800);
      return;
    }
    if (a === 'deleteProfile') {
      const w = prompt(t('dc.priv.deleteConfirm'));
      if (!w || w.trim().toUpperCase() !== t('dc.priv.deleteWord').toUpperCase()) return;
      try {
        const r = await deleteProfile();
        toast(r.left ? t('dc.priv.deletePartial', { n: r.left }) : t('dc.priv.deleteDone'), r.left ? 'warn' : 'info');
        C.Sheet.close(); C.repaint?.();
      } catch (err) { toast(explainError(err), 'error'); }
    }
  });
}

/**
 * Cancella il profilo personale: aspetto, preferiti, armadi e gruppi collegati, chiave e dispositivi,
 * in un solo aggiornamento (le regole lo permettono a un dispositivo del profilo). Gli armadi e le serate
 * dei gruppi NON si cancellano: sono condivisi con altre persone (lo dice il centro privacy).
 */
async function deleteProfile() {
  const d = Person.data || (await Person.load().catch(() => null));
  if (!d?.pid) return { left: 0 };
  const full = (await readable(dbRef(`people/${d.pid}`))) || {};
  const upd = {};
  for (const [aid, games] of Object.entries(full.favs || {})) for (const gid of Object.keys(games || {})) upd[`people/${d.pid}/favs/${aid}/${gid}`] = null;
  for (const aid of Object.keys(full.armadi || {})) upd[`people/${d.pid}/armadi/${aid}`] = null;
  for (const gid of Object.keys(full.groups || {})) upd[`people/${d.pid}/groups/${gid}`] = null;
  for (const [gid, m] of Object.entries(full.alts || {})) for (const mid of Object.keys(m || {})) upd[`people/${d.pid}/alts/${gid}/${mid}`] = null;
  upd[`people/${d.pid}/info`] = null;
  upd[`personKeys/${d.pid}`] = null;
  for (const uid of Object.keys(full.uids || {})) upd[`people/${d.pid}/uids/${uid}`] = null;
  await update(dbRef(''), upd);
  const left = (await readable(dbRef(`people/${d.pid}`))) ? 1 : 0;
  try { localStorage.removeItem('gnr_person'); localStorage.removeItem('gnr_person_cache'); } catch { /* niente */ }
  Person.data = null;
  return { left };
}

// ---------------------------------------------------------------------------
// Centro diagnostico
// ---------------------------------------------------------------------------

/** Toglie dai testi codici di stanze, gruppi, armadi, profili, chiavi e identificativi dei dispositivi. */
export function scrub(s) {
  return String(s ?? '')
    .replace(/\b(rooms|groups|armadi|people|pub|secrets|members|personKeys|armadioKeys|groupKeys|deviceProfiles|personKeyClaims|armadioKeyClaims)\/[^/\s'"`]+/g, '$1/…')
    .replace(/([?&#](?:room|a|g|p|profilo|collega|regia|inv|ak)=)[^&\s'"]+/gi, '$1…')
    .replace(/\b[A-Za-z0-9]{6}-[A-Za-z0-9]{8}\b/g, '…')
    .replace(/\b[A-Za-z0-9]{20,36}\b/g, '…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '…');
}

async function firebaseOnline() {
  if (!isConfigured) return null;
  return new Promise((resolve) => {
    let off = null;
    const timer = setTimeout(() => { off?.(); resolve(false); }, 4000);
    try {
      off = onValue(dbRef('.info/connected'), (s) => { if (s.val() === true) { clearTimeout(timer); off?.(); resolve(true); } });
    } catch { clearTimeout(timer); resolve(false); }
  });
}

/** Esegue i controlli. Ogni voce: { k, status: 'ok'|'warn'|'err'|'info', text }. */
export async function runDiagnostics() {
  const out = [];
  const add = (k, status, text) => out.push({ k, status, text });
  add('version', 'info', t('dc.diag.version', { v: APP_VERSION }));
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    const pub = (await r.json())?.version;
    if (pub && pub !== APP_VERSION) add('published', 'warn', t('dc.diag.published', { v: pub }));
    else if (pub) add('published', 'ok', t('dc.diag.upToDate'));
  } catch { add('published', 'warn', t('dc.diag.noVersion')); }
  add('online', navigator.onLine ? 'ok' : 'warn', navigator.onLine ? t('dc.diag.online') : t('dc.diag.offline'));
  if (!isConfigured) add('firebase', 'err', t('dc.diag.notConfigured'));
  else {
    let uid = null;
    try { uid = await connect(); } catch { /* niente */ }
    add('auth', uid ? 'ok' : 'err', uid ? t('dc.diag.auth') : t('dc.diag.noAuth'));
    const live = uid ? await firebaseOnline() : false;
    add('firebase', live ? 'ok' : 'warn', live ? t('dc.diag.fbOk') : t('dc.diag.fbNo'));
    if (uid) {
      try { await get(dbRef('rooms/ZZZZ/meta')); add('rules', 'ok', t('dc.diag.rulesOk')); } catch (err) { add('rules', 'err', t('dc.diag.rulesNo', { msg: scrub(explainError(err)) })); }
    }
  }
  const sw = 'serviceWorker' in navigator ? Boolean(navigator.serviceWorker.controller) : false;
  add('sw', sw ? 'ok' : 'info', sw ? t('dc.diag.swOk') : t('dc.diag.swNo'));
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) { const pct = Math.round((est.usage / est.quota) * 100); add('space', pct > 80 ? 'warn' : 'ok', t('dc.diag.space', { used: size(est.usage), pct })); }
  } catch { /* niente */ }
  if (bggEnabled()) {
    const h = await bggHealth();
    add('bgg', h.ok && h.token ? 'ok' : 'warn', h.ok ? (h.token ? t('dc.diag.bggOk') : t('dc.diag.bggNoToken')) : t('dc.diag.bggNo', { code: h.code }));
  } else add('bgg', 'info', t('dc.diag.bggOff'));
  add('app', 'info', isApp() ? t('dc.diag.app') : t('dc.diag.web'));
  const errs = ErrLog.list();
  add('errors', errs.length ? 'warn' : 'ok', errs.length ? t('dc.diag.errors', { n: errs.length }) : t('dc.diag.noErrors'));
  add('profile', 'info', Person.data?.pid ? t('dc.diag.profile', { n: Person.data.devices || 1 }) : t('dc.diag.noProfile'));
  add('lang', 'info', t('dc.diag.lang', { lang: t('common.languageName') }));
  return out;
}

/** Rapporto da allegare a una segnalazione: niente nomi, codici, chiavi, uid o contenuti. */
export function diagReport(checks) {
  const errs = ErrLog.list().slice(-30).map((e) => ({ when: new Date(e.t).toISOString(), kind: e.kind, page: e.page, v: e.v, msg: scrub(e.msg).slice(0, 300), n: e.n || 1 }));
  const env = {
    app: 'GameNight_Show', version: APP_VERSION, generated: new Date().toISOString(), lang: lang(), platform: isApp() ? 'android-app' : 'web',
    browser: scrub(navigator.userAgent), screen: `${screen.width}×${screen.height}`, online: navigator.onLine
  };
  return JSON.stringify({ env, checks: checks.map((c) => ({ k: c.k, status: c.status, text: scrub(c.text) })), errors: errs }, null, 2);
}

export async function openDiagnostics() {
  const el = C.Sheet.open(`${C.head(`🩺 ${esc(t('dc.diag.title'))}`)}<p class="muted">${esc(t('dc.diag.running'))}</p>`, { wide: true });
  const checks = await runDiagnostics();
  if (!el.isConnected) return;
  const ico = { ok: '✅', warn: '⚠️', err: '❌', info: 'ℹ️' };
  el.querySelector('.sheet').innerHTML = `${C.head(`🩺 ${esc(t('dc.diag.title'))}`)}
    <p>${esc(t('dc.diag.lead'))}</p>
    <ul class="dc-checks">${checks.map((c) => `<li class="is-${c.status}" data-check="${esc(c.k)}"><span aria-hidden="true">${ico[c.status]}</span><span>${esc(c.text)}</span></li>`).join('')}</ul>
    <div class="dc-actions">
      <button type="button" class="btn" id="dgDl">⬇️ <span>${esc(t('dc.diag.download'))}</span></button>
      <button type="button" class="btn-sec" id="dgAgain">🔄 <span>${esc(t('dc.diag.again'))}</span></button>
      <a class="btn-sec" href="test.html">🧪 <span>${esc(t('dc.diag.full'))}</span></a>
    </div>
    <p class="muted small">🔒 ${esc(t('dc.diag.privacy'))}</p>`;
  el.querySelector('#dgDl').addEventListener('click', () => downloadFile(`gamenight_diagnostica_${today()}.json`, diagReport(checks), 'application/json'));
  el.querySelector('#dgAgain').addEventListener('click', () => { C.Sheet.close(); openDiagnostics(); });
}


