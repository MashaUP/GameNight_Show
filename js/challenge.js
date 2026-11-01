// Sfide amichevoli fra gruppi (2.1, idea 67): solo numeri aggregati, solo se il gruppo lo sceglie.
//
// Due (o più) gruppi si mettono d'accordo su un codice sfida di 6 caratteri. Il proprietario o un admin di
// ciascun gruppo pubblica in challenges/<codice>/<gruppo> soltanto aggregati: numero di serate e di giochi
// diversi, voti dati, media generale, gioco più amato, serate degli ultimi 30 giorni. Mai nomi di persone,
// voti singoli, commenti o foto. Chi conosce il codice vede i numeri di tutti i gruppi della sfida.
// Si toglie in ogni momento ("Esci dalla sfida") e si aggiorna quando si ripubblica.
import { esc, randomCode, normalizeCode, toast, ICONS } from './util.js';
import { t, fmtNum } from './i18n.js';

/** Aggregati del gruppo dai riassunti delle serate. */
export function challengeStats(nights, name, now = Date.now()) {
  const list = Object.values(nights || {}).filter((n) => n && typeof n === 'object');
  const games = new Map();
  let votes = 0, sum = 0, recent = 0;
  for (const n of list) {
    if (Number(n.at) && now - Number(n.at) <= 30 * 86400000) recent++;
    for (const g of Object.values(n.games || {})) {
      if (!g?.name || !Number(g.n)) continue;
      votes += Number(g.n); sum += Number(g.sum) || 0;
      const k = g.key || g.name;
      const e = games.get(k) || { name: g.name, n: 0, sum: 0 };
      e.n += Number(g.n); e.sum += Number(g.sum) || 0;
      games.set(k, e);
    }
  }
  const loved = [...games.values()].filter((g) => g.n >= 3).sort((a, b) => b.sum / b.n - a.sum / a.n)[0];
  return {
    name: String(name || '').replace(/[<>]/g, '').slice(0, 40) || '—',
    nights: list.length,
    games: games.size,
    votes,
    avg: votes ? Math.round((sum / votes) * 10) / 10 : 0,
    top: loved ? String(loved.name).replace(/[<>]/g, '').slice(0, 40) : '',
    recent,
    at: now
  };
}

let C = null;
/** ctx: { S, dbRef, get, set, remove, onValue, explainError, canWriteGroup() } */
export function bindChallenge(ctx) { C = ctx; }
const KEY = (gid) => `gnr_challenge_${gid}`;

export const ChallengePanel = {
  el: null,
  stop: null,
  isOpen() { return Boolean(this.el); },
  code() { try { return localStorage.getItem(KEY(C.S.meta?.groupId)) || ''; } catch { return ''; } },
  open() {
    if (this.el || !C.S.meta?.groupId) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `<div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="chTitle">
      <div class="panel-head"><h2 id="chTitle">⚔️ ${esc(t('chg.title'))}</h2><button type="button" class="icon-btn" id="chClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
      <p class="panel-note">${esc(t('chg.lead'))}</p><div id="chBody"></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('submit', (e) => { e.preventDefault(); this.join(normalizeCode(el.querySelector('#chCode')?.value || '', 6)); });
    this.paint();
  },
  paint(rows = null) {
    if (!this.el) return;
    const code = this.code();
    const can = C.canWriteGroup();
    const mine = challengeStats(C.S.nights, C.S.meta?.groupName);
    const body = this.el.querySelector('#chBody');
    if (!code) {
      body.innerHTML = can ? `<div class="rg-row"><button type="button" class="btn" id="chNew">⚔️ <span>${esc(t('chg.new'))}</span></button></div>
        <form class="nb-form"><label class="sr-only" for="chCode">${esc(t('chg.code'))}</label><input class="input input--sm" id="chCode" maxlength="6" autocapitalize="characters" placeholder="${esc(t('chg.codePh'))}"><button type="submit" class="btn-sec btn-sec--sm">${esc(t('chg.join'))}</button></form>
        <p class="muted small">${esc(t('chg.what', { nights: mine.nights, games: mine.games }))}</p>` : `<p class="muted">${esc(t('chg.adminOnly'))}</p>`;
      return;
    }
    const list = rows ? Object.entries(rows).map(([gid, r]) => ({ gid, ...r })).sort((a, b) => (b.nights || 0) - (a.nights || 0)) : null;
    body.innerHTML = `<p>${esc(t('chg.codeIs'))} <span class="code-chip">${esc(code)}</span></p>
      ${list ? `<div class="am-bgg-table-wrap"><table class="ins-table"><thead><tr><th>${esc(t('chg.c.group'))}</th><th>${esc(t('chg.c.nights'))}</th><th>${esc(t('chg.c.games'))}</th><th>${esc(t('chg.c.votes'))}</th><th>${esc(t('chg.c.avg'))}</th><th>${esc(t('chg.c.recent'))}</th><th>${esc(t('chg.c.top'))}</th></tr></thead>
        <tbody>${list.map((r) => `<tr class="${r.gid === C.S.meta.groupId ? 'is-mine' : ''}"><th scope="row">${esc(r.name)}</th><td>${fmtNum(r.nights || 0)}</td><td>${fmtNum(r.games || 0)}</td><td>${fmtNum(r.votes || 0)}</td><td>${esc(String(r.avg || 0).replace('.', ','))}</td><td>${fmtNum(r.recent || 0)}</td><td>${esc(r.top || '—')}</td></tr>`).join('')}</tbody></table></div>
        ${list.length < 2 ? `<p class="muted small">${esc(t('chg.alone'))}</p>` : ''}` : `<p class="muted">${esc(t('chg.loading'))}</p>`}
      ${can ? `<div class="rg-row"><button type="button" class="btn-sec" id="chPub">🔄 <span>${esc(t('chg.update'))}</span></button><button type="button" class="link-btn am-danger" id="chLeave">${esc(t('chg.leave'))}</button></div>` : ''}
      <p class="muted small">🔒 ${esc(t('chg.privacy'))}</p>`;
    if (!rows) this.watch(code);
  },
  watch(code) {
    this.stop?.();
    this.stop = C.onValue(C.dbRef(`challenges/${code}`), (snap) => this.paint(snap.val() || {}), () => this.paint({}));
  },
  async publish(code) {
    await C.set(C.dbRef(`challenges/${code}/${C.S.meta.groupId}`), challengeStats(C.S.nights, C.S.meta.groupName));
  },
  async join(code) {
    if (code.length !== 6) { toast(t('chg.badCode'), 'warn'); return; }
    try {
      await this.publish(code);
      try { localStorage.setItem(KEY(C.S.meta.groupId), code); } catch { /* niente */ }
      this.paint();
    } catch (err) { toast(C.explainError(err), 'error'); }
  },
  async click(e) {
    if (e.target === this.el || e.target.closest('#chClose')) { this.close(); return; }
    if (e.target.closest('#chNew')) { this.join(randomCode(6)); return; }
    const code = this.code();
    if (e.target.closest('#chPub') && code) { try { await this.publish(code); toast(t('chg.updated')); } catch (err) { toast(C.explainError(err), 'error'); } return; }
    if (e.target.closest('#chLeave') && code) {
      if (!confirm(t('chg.leaveAsk'))) return;
      try { await C.remove(C.dbRef(`challenges/${code}/${C.S.meta.groupId}`)); } catch (err) { toast(C.explainError(err), 'error'); return; }
      try { localStorage.removeItem(KEY(C.S.meta.groupId)); } catch { /* niente */ }
      this.stop?.(); this.stop = null;
      this.paint();
    }
  },
  close() { this.stop?.(); this.stop = null; this.el?.remove(); this.el = null; }
};
