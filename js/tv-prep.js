// Pre-partita sulla TV: giochi sul tavolo, desideri, arrivi, cibo, scaletta e spiegazione delle regole.
import { $, esc, activePlayers, nameKey, libFits, toast, ICONS, qrSVG, gameImageHTML, safeColor } from './util.js';
import { avatarHTML } from './avatars.js';
import { personKey } from './stats.js';
import { tableGames, wishCounts, foodList, arrivals, buildPlan, planTimes, gameMinutes, hhmm } from './prep.js';
import { ding, pop } from './sounds.js';

let C = null;
export function bindPrep(ctx) { C = ctx; }
const S = () => C.S;
const room = (p) => C.roomRef(C.S.code, p);
const fail = (err) => toast(C.explainError(err), 'error');

/** Giochi sul tavolo stasera { id: [nomi] }: quelli portati dai telefoni e quelli con la stellina "Stasera" nell'armadio. */
export function onTable() {
  const t = tableGames(S().tonight, S().next, S().library);
  for (const [id, it] of Object.entries(S().library || {})) if (it?.name && it.sel === true && !t[id]) t[id] = [];
  return t;
}

/**
 * Se sul tavolo ci sono almeno 2 giochi, consigli, ruota, "A caso" e votazione scelgono solo tra quelli
 * (a meno che la TV non scelga "Tutto l'armadio").
 */
export function poolIds() {
  if (S().poolAll) return null;
  const ids = Object.keys(onTable());
  return ids.length >= 2 ? new Set(ids) : null;
}

export function wishes() { return wishCounts(S().wish); }

/** Riquadro "pre-partita" della lobby: arrivi, giochi sul tavolo, desideri, cibo, scaletta. */
export function prepHTML() {
  if (!S().meta?.groupId) return '';
  const lib = S().library || {};
  const table = onTable();
  const w = wishes();
  const arr = arrivals(S().next, S().players, personKey, nameKey);
  const food = foodList(S().next);
  const blocks = [];
  if (arr && (arr.coming.length || arr.maybe.length)) {
    blocks.push(`<div class="prep-block prep-arrivals"><b>${arr.late ? '⏰ In ritardo' : '🚶 In arrivo'}</b>
      <span>${esc(arr.coming.join(', ')) || '—'}${arr.maybe.length ? ` <small>· forse ${esc(arr.maybe.join(', '))}</small>` : ''}</span>
      ${arr.expected > (S().meta.maxPlayers || 0) ? `<small class="prep-warn">Servono ${arr.expected} posti: aumentali con +</small>` : ''}</div>`);
  }
  const ids = Object.keys(table);
  blocks.push(`<div class="prep-block prep-table"><b>🎲 Sul tavolo stasera${ids.length ? ` (${ids.length})` : ''}</b>
    ${ids.length ? `<div class="prep-chips">${ids.sort((a, b) => (w[b] || 0) - (w[a] || 0)).slice(0, 10).map((id) => `<span class="prep-chip" title="${esc(table[id].length ? `Portato da ${table[id].join(', ')}` : '')}">${esc(lib[id]?.name || '')}${w[id] ? ` <em>⭐${w[id]}</em>` : ''}${table[id].length ? `<small>${esc(table[id].join(', '))}</small>` : ''}</span>`).join('')}</div>`
      : '<span class="muted">Dal telefono: "I giochi di stasera" per segnare cosa avete portato (anche con il codice a barre della scatola).</span>'}</div>`);
  const top = Object.entries(w).filter(([id]) => lib[id] && !table[id]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length) blocks.push(`<div class="prep-block"><b>⭐ Più desiderati</b><span>${top.map(([id, n]) => `${esc(lib[id].name)} (${n})`).join(' · ')}</span></div>`);
  if (food.length) blocks.push(`<div class="prep-block"><b>🍕 Da mangiare</b><span>${food.map((f) => `${esc(f.name)}: ${esc(f.food)}`).join(' · ')}</span></div>`);
  return `${blocks.join('')}<button type="button" class="btn-sec btn-sec--sm prep-plan" id="openPlan">🗓️ <span>${S().plan?.items?.length ? 'Scaletta della serata' : 'Prepara la scaletta'}</span></button>`;
}

// ---------------------------------------------------------------------------
// Scaletta della serata
// ---------------------------------------------------------------------------

export function planList() {
  const lib = S().library || {};
  return (Array.isArray(S().plan?.items) ? S().plan.items : []).filter((id) => lib[id]).map((id) => ({ id, minutes: gameMinutes(lib[id]) }));
}

/** Il prossimo gioco della scaletta non ancora giocato stasera. */
export function nextPlanned() {
  const played = C.playedTonight();
  return planList().find((p) => !played.has(nameKey(S().library[p.id].name))) || null;
}

export function planNextHTML() {
  const n = nextPlanned();
  if (!n) return '';
  const it = S().library[n.id];
  return `<button type="button" class="plan-next" data-plan-use="${esc(n.id)}">🗓️ Prossimo in scaletta: <b>${esc(it.name)}</b> <small>${n.minutes} min</small></button>`;
}

export const PlanPanel = {
  el: null,
  minutes: 120,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S().meta?.groupId) return;
    if (S().plan?.minutes) this.minutes = Number(S().plan.minutes);
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="plTitle">
        <div class="panel-head"><h2 id="plTitle">🗓️ Scaletta della serata</h2><button type="button" class="icon-btn" id="plClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <p class="muted">La TV mette in fila i giochi ${poolIds() ? '<b>sul tavolo stasera</b>' : 'dell’armadio'} adatti a quanti siete: uno breve per scaldarsi, poi i più desiderati, e si chiude con uno veloce. Cinque minuti a gioco per spiegazione e preparazione. Si riordina con le frecce.</p>
        <div class="rc-filter"><span class="field-label">Tempo a disposizione</span>
          <div class="seg" id="plTime">${[60, 90, 120, 180, 240].map((m) => `<button type="button" data-min="${m}" aria-pressed="${this.minutes === m}">${m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? 'ora' : 'ore'}`.replace('1.5 ore', '1 ora e ½')}</button>`).join('')}</div>
          <button type="button" class="btn" id="plMake">Proponi la scaletta</button></div>
        <ol class="plan-list" id="plList"></ol>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#plClose')) { this.close(); return; }
      const m = e.target.closest('[data-min]');
      if (m) { this.minutes = Number(m.dataset.min); el.querySelectorAll('[data-min]').forEach((b) => b.setAttribute('aria-pressed', String(b === m))); return; }
      if (e.target.closest('#plMake')) { this.make(); return; }
      const mv = e.target.closest('[data-plmove]');
      if (mv) { this.move(Number(mv.dataset.i), Number(mv.dataset.plmove)); return; }
      const del = e.target.closest('[data-pldel]');
      if (del) { this.remove(Number(del.dataset.pldel)); return; }
      const use = e.target.closest('[data-plan-use]');
      if (use) { C.useLibraryGame(use.dataset.planUse); this.close(); }
    });
    this.paint();
  },
  close() { this.el?.remove(); this.el = null; },
  candidates() {
    const pool = poolIds();
    return C.libraryItems().filter((it) => !pool || pool.has(it.id));
  },
  make() {
    const n = activePlayers(S().players).length;
    const played = new Set(C.libraryItems().filter((it) => C.playedTonight().has(nameKey(it.name))).map((it) => it.id));
    const list = buildPlan({ items: this.candidates(), minutes: this.minutes, fits: (it) => C.libOk(it, n), wishes: wishes(), played });
    if (!list.length) { toast(`Nessun gioco adatto a ${n} giocatori.`, 'warn'); return; }
    C.set(room('plan'), { items: list.map((p) => p.id), minutes: this.minutes, at: C.serverTimestamp() }).then(() => { pop(); C.logEvent(`Scaletta: ${list.map((p) => S().library[p.id].name).join(', ')}`, '🗓️'); }).catch(fail);
  },
  save(items) { C.update(room('plan'), { items }).catch(fail); },
  move(i, d) {
    const items = planList().map((p) => p.id);
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    this.save(items);
  },
  remove(i) {
    const items = planList().map((p) => p.id);
    items.splice(i, 1);
    if (items.length) this.save(items); else C.set(room('plan'), null).catch(fail);
  },
  paint() {
    const box = $('#plList', this.el);
    if (!box) return;
    const played = C.playedTonight();
    const lib = S().library || {};
    const w = wishes();
    const table = onTable();
    const list = planTimes(planList(), Date.now());
    const total = list.reduce((a, p) => a + p.minutes + 5, 0);
    box.innerHTML = list.length ? list.map((p, i) => {
      const it = lib[p.id];
      const done = played.has(nameKey(it.name));
      return `<li class="plan-item ${done ? 'is-done' : ''}" style="--i:${i}">
        <span class="plan-time">${done ? '✓' : hhmm(p.start)}</span>${gameImageHTML(it, 'game-img--thumb')}
        <span class="plan-name"><b>${esc(it.name)}</b><small>${p.minutes} min${w[p.id] ? ` · ⭐ ${w[p.id]}` : ''}${table[p.id]?.length ? ` · portato da ${esc(table[p.id].join(', '))}` : ''}</small></span>
        <span class="plan-tools"><button type="button" class="icon-btn" data-plmove="-1" data-i="${i}" aria-label="Su">▲</button><button type="button" class="icon-btn" data-plmove="1" data-i="${i}" aria-label="Giù">▼</button><button type="button" class="icon-btn" data-pldel="${i}" aria-label="Togli">${ICONS.x}</button>
        ${done ? '' : `<button type="button" class="btn-sec btn-sec--sm" data-plan-use="${esc(p.id)}">Giochiamo</button>`}</span></li>`;
    }).join('') + `<li class="plan-total muted">Totale circa ${Math.floor(total / 60)} h ${total % 60} min · fine verso le ${hhmm(Date.now() + total * 60000)}</li>` : '<li class="muted">Scegli il tempo e premi "Proponi la scaletta".</li>';
  },
  update() {
    if (!this.el) return;
    const sig = JSON.stringify([S().plan, Object.keys(S().games || {}).length, S().wish, S().tonight]);
    if (sig !== this.sig) { this.sig = sig; this.paint(); }
  }
};

// ---------------------------------------------------------------------------
// Spiegazione delle regole
// ---------------------------------------------------------------------------

export const RulesPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  async open(lid) {
    const it = S().library?.[lid];
    if (!it || this.el) return;
    this.lid = lid;
    try { await C.set(room('rules'), { lid, at: C.serverTimestamp() }); } catch (err) { fail(err); }
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide rules-panel" role="dialog" aria-modal="true" aria-labelledby="rlTitle">
        <div class="panel-head"><h2 id="rlTitle">📖 Si gioca a ${esc(it.name)}</h2><button type="button" class="icon-btn" id="rlClose" aria-label="Chiudi">${ICONS.x}</button></div>
        <div class="rules-grid">
          <div class="rules-main">
            ${gameImageHTML(it, 'game-img--rules')}
            <p class="rules-meta">${[it.minPlayers && it.maxPlayers ? `${it.minPlayers}–${it.maxPlayers} giocatori` : '', `${gameMinutes(it)} min`, it.weight ? `peso ${String(it.weight).replace('.', ',')}/5` : ''].filter(Boolean).join(' · ')}</p>
            ${it.rules ? `<h3>In breve</h3><p class="rules-text">${esc(it.rules)}</p>` : '<p class="muted">Nessun riassunto delle regole: si aggiunge dalla scheda del gioco nell’armadio.</p>'}
            ${it.setup ? `<h3>Preparazione</h3><ul class="rules-setup">${esc(it.setup).split(/\n|;/).map((s) => s.trim()).filter(Boolean).map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
          </div>
          <aside class="rules-side">
            <div class="rules-clock"><span>Spiegazione</span><b id="rlClock">0:00</b></div>
            <div id="rlKnows"></div>
            ${it.video ? `<div class="rules-video"><div class="qr qr--sm" id="rlQr"></div><small>Video delle regole: inquadra con il telefono</small></div>` : ''}
          </aside>
        </div>
        <div class="claim-actions"><button type="button" class="btn-sec" id="rlLater">Non ancora</button><button type="button" class="btn btn-big" id="rlGo">${ICONS.play}<span>Iniziamo!</span></button></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    if (it.video && /^https:\/\//.test(it.video)) $('#rlQr', el).innerHTML = qrSVG(it.video);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#rlClose') || e.target.closest('#rlLater')) { this.close(); return; }
      if (e.target.closest('#rlGo')) { const id = this.lid; this.close(); C.useLibraryGame(id); C.startPlay(it.name); }
    });
    ding();
    this.tick = setInterval(() => this.paintClock(), 1000);
    this.paint();
  },
  paintClock() {
    const at = Number(S().rules?.at);
    const c = $('#rlClock', this.el);
    if (!c || !Number.isFinite(at)) return;
    const s = Math.max(0, Math.floor((C.serverNow() - at) / 1000));
    c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  paint() {
    const box = $('#rlKnows', this.el);
    if (!box) return;
    const kn = S().knows?.[this.lid] || {};
    const ps = activePlayers(S().players);
    const yes = ps.filter((p) => kn[p.uid] === true);
    const no = ps.filter((p) => kn[p.uid] === false);
    const wait = ps.filter((p) => typeof kn[p.uid] !== 'boolean');
    const row = (list, label) => list.length ? `<p class="rules-k"><b>${label}</b></p><div class="rules-avs">${list.map((p) => `<span>${avatarHTML(p, '2.4rem')}<small>${esc(p.name)}</small></span>`).join('')}</div>` : '';
    const teacher = yes.length ? yes[Math.floor((this.lid.length + yes.length) % yes.length)] : null;
    box.innerHTML = `${teacher ? `<p class="rules-teacher">🎓 Spiega <b>${esc(teacher.name)}</b></p>` : ''}${row(yes, '✅ Lo conoscono')}${row(no, '🆕 Da spiegare a')}${row(wait, '⏳ Rispondono dal telefono')}`;
  },
  update() {
    if (!this.el) return;
    const sig = JSON.stringify([S().knows?.[this.lid], Object.keys(S().players || {})]);
    if (sig !== this.sig) { this.sig = sig; this.paint(); }
  },
  close() {
    clearInterval(this.tick);
    this.el?.remove();
    this.el = null;
    C.remove(room('rules')).catch(() => {});
  }
};

