// Voti dopo la votazione (2.0): voti aggiunti in ritardo e modifiche autorizzate dalla regia.
//
// Solo la regia (TV o telefono regia) apre una "finestra" per un giocatore su un gioco già svelato:
//   rooms/<codice>/late/<gioco>/<uid> = { at, edit? }
// - senza edit: il giocatore che non aveva votato può votare dal suo telefono (una volta sola);
// - con edit: chi aveva già votato può cambiare il voto (il nuovo sostituisce il vecchio, mai due voti).
// La TV può anche votare al posto del giocatore ("Vota dalla TV", come durante la votazione).
// Le regole del database lo garantiscono: il telefono scrive solo il proprio voto e solo con la finestra
// aperta; un secondo voto senza "edit" viene rifiutato. Ogni operazione resta nel registro
// rooms/<codice>/votelog (chi, quando, che cosa: aperta, aggiunto, modificato, dalla TV, chiusa).
// I voti aggiunti dopo hanno late: true, quelli cambiati editedAt: medie, classifica e riassunto del gruppo
// si ricalcolano dai voti, quindi si aggiornano da soli (la TV risalva il riassunto).
import { $, esc, toast, ICONS, activePlayers } from './util.js';
import { avatarHTML } from './avatars.js';
import { t, fmtDate } from './i18n.js';

let C = null;
/** ctx: { S, roomRef, set, update, remove, push, serverTimestamp, explainError, proxyVote(gid, uid), saveNight(), logEvent() } */
export function bindVotes(ctx) { C = ctx; }
const S = () => C.S;
const fail = (err) => toast(C.explainError(err), 'error');

/** Una riga del registro dei voti. */
function log(gid, uid, kind) {
  return C.set(C.push(C.roomRef(S().code, 'votelog')), { gid, uid, kind, by: 'tv', at: C.serverTimestamp() }).catch(() => {});
}

/** Giochi svelati, in ordine. */
const revealed = () => Object.entries(S().games || {}).filter(([, g]) => g?.status === 'revealed').sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

export const LateVotePanel = {
  el: null,
  gid: null,
  isOpen() { return Boolean(this.el); },
  open(gid) {
    if (this.el) this.close();
    const list = revealed();
    if (!list.length) { toast(t('lv.none'), 'warn'); return; }
    this.gid = gid && S().games?.[gid]?.status === 'revealed' ? gid : list[list.length - 1][0];
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="lvTitle">
        <div class="panel-head"><h2 id="lvTitle">🗳️ ${esc(t('lv.title'))}</h2><button type="button" class="icon-btn" id="lvClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <p class="panel-note">${esc(t('lv.lead'))}</p>
        <label class="field-label" for="lvGame">${esc(t('lv.game'))}</label>
        <select class="input select select--sm" id="lvGame"></select>
        <div id="lvBody"></div>
        <details class="lv-log"><summary>${esc(t('lv.log'))}</summary><ul id="lvLog"></ul></details>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('change', (e) => { if (e.target.id === 'lvGame') { this.gid = e.target.value; this.sig = ''; this.update(); } });
    this.sig = '';
    this.update();
  },
  update() {
    if (!this.el) return;
    const list = revealed();
    const g = S().games?.[this.gid];
    const late = S().late?.[this.gid] || {};
    const votes = S().votes?.[this.gid] || {};
    const sig = JSON.stringify([this.gid, list.map(([id]) => id), late, Object.keys(votes), Object.values(votes).map((v) => [v?.late, v?.editedAt]), Object.keys(S().votelog || {}).length, activePlayers(S().players).map((p) => p.uid)]);
    if (sig === this.sig) return;
    this.sig = sig;
    $('#lvGame', this.el).innerHTML = list.map(([id, x]) => `<option value="${esc(id)}" ${id === this.gid ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    if (!g) { $('#lvBody', this.el).innerHTML = ''; return; }
    const ps = activePlayers(S().players);
    const missing = ps.filter((p) => !votes[p.uid]);
    const voted = ps.filter((p) => votes[p.uid]);
    const row = (p, voted) => {
      const open = late[p.uid];
      const v = votes[p.uid];
      const tag = v?.late ? `<small class="lv-tag">${esc(t('lv.tagLate'))}</small>` : v?.editedAt ? `<small class="lv-tag">${esc(t('lv.tagEdited'))}</small>` : v?.byHost ? `<small class="lv-tag">${esc(t('lv.tagTv'))}</small>` : '';
      return `<li class="lv-row">${avatarHTML(p, '2.4rem')}<span class="lv-name"><b>${esc(p.name)}</b>${tag}${open ? `<small class="muted">${esc(t(open.edit ? 'lv.openEdit' : 'lv.openLate'))}</small>` : ''}</span>
        <span class="lv-acts">
          ${open ? `<button type="button" class="btn-sec btn-sec--sm" data-lv-close="${esc(p.uid)}">${esc(t('lv.closeWin'))}</button>`
            : voted ? `<button type="button" class="btn-sec btn-sec--sm" data-lv-edit="${esc(p.uid)}">✏️ <span>${esc(t('lv.allowEdit'))}</span></button>`
              : `<button type="button" class="btn-sec btn-sec--sm" data-lv-open="${esc(p.uid)}">📱 <span>${esc(t('lv.openPhone'))}</span></button>`}
          ${voted ? '' : `<button type="button" class="btn-sec btn-sec--sm" data-lv-tv="${esc(p.uid)}">📺 <span>${esc(t('lv.voteTv'))}</span></button>`}
        </span></li>`;
    };
    $('#lvBody', this.el).innerHTML = `
      <h3>${esc(t('lv.missing', { n: missing.length }))}</h3>
      ${missing.length ? `<ul class="lv-list">${missing.map((p) => row(p, false)).join('')}</ul>` : `<p class="muted small">${esc(t('lv.allVoted'))}</p>`}
      <h3>${esc(t('lv.voted', { n: voted.length }))}</h3>
      ${voted.length ? `<ul class="lv-list">${voted.map((p) => row(p, true)).join('')}</ul>` : ''}
      <p class="muted small">🔒 ${esc(t('lv.secret'))}</p>`;
    const name = (uid) => S().players?.[uid]?.name || t('ph.exPlayer');
    const entries = Object.values(S().votelog || {}).filter((x) => x?.gid === this.gid).sort((a, b) => (a.at || 0) - (b.at || 0));
    $('#lvLog', this.el).innerHTML = entries.length ? entries.map((x) => `<li>${esc(fmtDate(Number(x.at) || Date.now(), { hour: '2-digit', minute: '2-digit' }))} · ${esc(t(`lv.k.${x.kind}`, { name: name(x.uid), by: x.by === 'self' ? t('lv.bySelf') : t('lv.byTv') }))}</li>`).join('') : `<li class="muted">${esc(t('lv.logNone'))}</li>`;
  },
  async click(e) {
    if (e.target === this.el || e.target.closest('#lvClose')) { this.close(); return; }
    const b = e.target.closest('[data-lv-open],[data-lv-edit],[data-lv-close],[data-lv-tv]');
    if (!b) return;
    const gid = this.gid;
    try {
      if (b.dataset.lvOpen) { await C.set(C.roomRef(S().code, `late/${gid}/${b.dataset.lvOpen}`), { at: C.serverTimestamp() }); await log(gid, b.dataset.lvOpen, 'open'); toast(t('lv.opened', { name: S().players[b.dataset.lvOpen]?.name || '' })); }
      if (b.dataset.lvEdit) {
        if (!confirm(t('lv.editAsk', { name: S().players[b.dataset.lvEdit]?.name || '' }))) return;
        await C.set(C.roomRef(S().code, `late/${gid}/${b.dataset.lvEdit}`), { at: C.serverTimestamp(), edit: true }); await log(gid, b.dataset.lvEdit, 'open');
      }
      if (b.dataset.lvClose) { await C.remove(C.roomRef(S().code, `late/${gid}/${b.dataset.lvClose}`)); await log(gid, b.dataset.lvClose, 'close'); }
      if (b.dataset.lvTv) { this.close(); C.proxyVote(gid, b.dataset.lvTv); }
    } catch (err) { fail(err); }
  },
  close() { this.el?.remove(); this.el = null; }
};

/**
 * Sulla TV, a ogni aggiornamento: quando arriva il voto atteso la finestra si chiude da sola, l'operazione
 * va nel registro e il riassunto della serata nel gruppo si risalva (medie e statistiche aggiornate).
 */
const done = new Set();
export function processLate() {
  const late = S().late || {};
  for (const [gid, byUid] of Object.entries(late)) {
    for (const [uid, w] of Object.entries(byUid || {})) {
      const v = S().votes?.[gid]?.[uid];
      if (!v) continue;
      const fresh = w.edit ? Number(v.editedAt) >= Number(w.at || 0) : true;
      const key = `${gid}/${uid}/${w.at}`;
      if (!fresh || done.has(key)) continue;
      done.add(key);
      const name = S().players?.[uid]?.name || '';
      C.remove(C.roomRef(S().code, `late/${gid}/${uid}`)).catch(() => {});
      C.set(C.push(C.roomRef(S().code, 'votelog')), { gid, uid, kind: w.edit ? 'edit' : 'late', by: v.by === 'tv' ? 'tv' : 'self', at: C.serverTimestamp() }).catch(() => {});
      toast(t(w.edit ? 'lv.gotEdit' : 'lv.gotLate', { name, game: S().games?.[gid]?.name || '' }));
      C.logEvent(t(w.edit ? 'lv.gotEdit' : 'lv.gotLate', { name, game: S().games?.[gid]?.name || '' }), '🗳️');
      C.saveNight();
    }
  }
}

/** Voti aggiunti o cambiati dopo il reveal per un gioco (per le etichette di reveal e resoconto). */
export function lateCount(votes) {
  return Object.values(votes || {}).filter((v) => v?.late || v?.editedAt).length;
}
