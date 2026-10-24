// Sulla TV: strumenti da tavolo (chi inizia, squadre, clessidra), ruota dei giochi,
// segnapunti dal vivo, quiz del gruppo, stagioni, rivalità, figurine, video riassunto,
// allarme intrusi, cambio del codice regia, stanze a scadenza e storico privato.
// Le parti che dipendono dalla serata arrivano da host.js con bindTV(ctx).
import { $, esc, fmt, activePlayers, sortedPlayers, randomCode, nameKey, safeColor, toast, ICONS, voteTimer, timerColor, downloadFile, prefersReducedMotion, saveInApp } from './util.js';
import { isApp } from './native.js';
import { avatarHTML } from './avatars.js';
import { clockTick, timeUp, fanfare, pop, ding, whistle, drumroll, victory } from './sounds.js';
import { confettiBurst, fireworks } from './fx.js';
import { balancedTeams, TEAM_STYLE, skillMap, wheelTarget, wheelGradient, buildQuizRound, nextNightICS, gamesFromCSV } from './extras.js';
import { seasonTables, seasonOf, championPoints, topRivalries, playerCard, personKey, nightsByDate, nightSummary, buildAwards } from './stats.js';
import { cardHTML, bindTilt } from './cards.js';
import { makeRecapVideo, videoSupported } from './recap-video.js';
import { isSafeMode } from './safe.js';
import { timerDisplayHTML, timerControlsHTML, bindTimerControls, controlsSig, SharedTimer } from './sharedtimer.js';
import { t as tr, fmtNum, fmtDate, fmtList } from './i18n.js';

let C = null;
/** host.js passa qui lo stato della serata e le sue funzioni. */
export function bindTV(ctx) { C = ctx; }
const S = () => C.S;
const room = (path) => C.roomRef(C.S.code, path);
const fail = (err) => toast(C.explainError(err), 'error');
const PALETTE = ['#FF5A4E', '#FFC93C', '#2EC4B6', '#7B5CFA', '#FF8FB1', '#4D96FF', '#FF8A3D', '#8AC926', '#FF3DCB', '#3DF5E0', '#9B7BFF', '#FFD34D'];

// ---------------------------------------------------------------------------
// Ruota (riusata da "chi inizia" e dalla ruota dei giochi)
// ---------------------------------------------------------------------------

/** items: [{ label, color, avatar? (html) }] */
export function wheelHTML(items, id) {
  const n = items.length;
  const labels = items.map((it, i) => `
    <div class="wheel-label" style="--a:${(i + 0.5) * (360 / n)}deg">
      <span class="wheel-text">${it.avatar || ''}<b>${esc(it.label)}</b></span>
    </div>`).join('');
  return `
    <div class="wheel ${n > 8 ? 'wheel--many' : ''}" id="${id}">
      <div class="wheel-disc" style="background:${wheelGradient(items.map((it) => it.color))}">${labels}</div>
      <div class="wheel-pin" aria-hidden="true"></div>
      <div class="wheel-hub" aria-hidden="true">🎲</div>
    </div>`;
}

/** Fa girare la ruota e la ferma sullo spicchio i; ticchettio a ogni spicchio che passa. */
export function spinWheel(wheel, i, n) {
  const disc = wheel.querySelector('.wheel-disc');
  const from = Number(disc.dataset.rot || 0);
  const quick = prefersReducedMotion() || isSafeMode();
  const ms = quick ? 300 : 5200;
  const to = wheelTarget(i, n, from, quick ? 1 : 6);
  disc.dataset.rot = String(to);
  disc.style.transition = `transform ${ms}ms cubic-bezier(0.33, 1, 0.68, 1)`;
  disc.style.transform = `rotate(${to}deg)`;
  wheel.classList.add('is-spinning');
  if (!quick) {
    // Il tic segue la frenata: tempo in cui si supera ogni spicchio con un'uscita cubica
    const slice = 360 / n;
    const total = to - from;
    const timers = [];
    for (let k = 1, a = slice; a < total && k < 70; k++, a += slice * Math.max(1, Math.floor(total / slice / 60))) {
      const t = 1 - Math.cbrt(1 - a / total);
      timers.push(setTimeout(() => clockTick(t > 0.85), t * ms));
    }
    wheel._ticks = timers;
  }
  return new Promise((resolve) => setTimeout(() => { wheel.classList.remove('is-spinning'); resolve(); }, ms + 80));
}

// ---------------------------------------------------------------------------
// Pannello "Tavolo": chi inizia, squadre, timer condiviso (sharedtimer.js)
// ---------------------------------------------------------------------------

export const TablePanel = {
  el: null,
  tab: 'starter',
  isOpen() { return Boolean(this.el); },
  open(tab = this.tab) {
    if (this.el || !S().code) return;
    this.tab = tab;
    const el = document.createElement('div');
    el.className = 'overlay overlay--table';
    el.innerHTML = `
      <div class="card panel panel--wide table-panel" role="dialog" aria-modal="true" aria-labelledby="tbTitle">
        <div class="panel-head"><h2 id="tbTitle">${esc(tr('tvx.table.title'))}</h2><button type="button" class="icon-btn" id="tbClose" aria-label="${esc(tr('common.close'))}">${ICONS.x}</button></div>
        <nav class="at-tabs tb-tabs" aria-label="${esc(tr('tvx.table.tools'))}">
          <button type="button" data-tb="starter">${esc(tr('tvx.table.starter'))}</button>
          <button type="button" data-tb="teams">${esc(tr('tvx.table.teams'))}</button>
          <button type="button" data-tb="timer">⏱️ ${esc(tr('timer.tab'))}</button>
        </nav>
        <div class="tb-body" id="tbBody"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#tbClose')) { this.close(); return; }
      const t = e.target.closest('[data-tb]');
      if (t) { this.tab = t.dataset.tb; this.paint(); return; }
      if (e.target.closest('#tbSpin')) { this.spinStarter(); return; }
      const nt = e.target.closest('[data-teams]');
      if (nt) { this.makeTeams(Number(nt.dataset.teams)); return; }
      if (e.target.closest('#tbClearTeams')) { C.update(room('table'), { teams: null }).catch(fail); return; }
    });
    // Comandi del timer condiviso (sharedtimer.js): ridisegna solo la parte dei comandi.
    bindTimerControls(el, (kind) => { if (kind) this.timerKind = kind; this.paintTimer(true); });
    this.paint();
  },
  close() { this.el?.remove(); this.el = null; },

  players() { return activePlayers(S().players); },

  paint() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-tb]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tb === this.tab)));
    const body = $('#tbBody', this.el);
    const ps = this.players();
    const tb = S().table || {};
    if (this.tab === 'starter') {
      const items = ps.map((p, i) => ({ label: p.name, color: safeColor(p.color) || PALETTE[i % PALETTE.length], avatar: avatarHTML(p, '2.6rem') }));
      this.items = ps;
      const st = tb.starter && S().players[tb.starter.uid];
      body.innerHTML = ps.length < 2 ? `<p class="muted">${esc(tr('tvx.table.need2'))}</p>` : `
        <div class="tb-wheel">${wheelHTML(items, 'starterWheel')}
          <div class="tb-side">
            <p class="tb-lead">${esc(tr('tvx.table.starterLead'))}</p>
            <button type="button" class="btn btn-big" id="tbSpin">${esc(tr('tvx.table.spin'))}</button>
            <p class="tb-result" id="tbResult" aria-live="polite">${st ? tr('tvx.table.last', { name: esc(st.name) }) : ''}</p>
          </div>
        </div>`;
    } else if (this.tab === 'teams') {
      const teams = Array.isArray(tb.teams) ? tb.teams : null;
      body.innerHTML = `
        <div class="tb-teams-head">
          <p class="tb-lead">${esc(tr('tvx.table.teamsLead'))}</p>
          <div class="rg-row">${[2, 3, 4].filter((n) => n <= Math.max(2, ps.length)).map((n) => `<button type="button" class="btn-sec" data-teams="${n}">${esc(tr('tvx.table.nTeams', { n }))}</button>`).join('')}
          ${teams ? `<button type="button" class="link-btn" id="tbClearTeams">${esc(tr('tvx.table.clearTeams'))}</button>` : ''}</div>
        </div>
        <div class="tb-teams" id="tbTeams">${teams ? teams.map((t, i) => this.teamHTML(t, i)).join('') : `<p class="muted">${esc(tr('tvx.table.teamsEmpty'))}</p>`}</div>`;
    } else {
      body.innerHTML = `
        <div class="tb-timer">
          ${timerDisplayHTML('panel')}
          <div class="tb-side">
            <p class="muted small">${esc(tr('timer.lead'))}</p>
            <div id="tbTimerCtrl"></div>
          </div>
        </div>`;
      this.paintTimer(true);
      SharedTimer.sync();
    }
  },

  /** Comandi del timer: ridisegnati solo quando cambia lo stato (non a ogni secondo). */
  paintTimer(force = false) {
    const box = this.el && $('#tbTimerCtrl', this.el);
    if (!box) return;
    const sig = `${controlsSig()}|${this.timerKind || 'turn'}`;
    if (!force && sig === this.timerSig) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && !force) return;
    this.timerSig = sig;
    box.innerHTML = timerControlsHTML(this.timerKind || (S().timer?.kind) || 'turn');
  },

  teamHTML(team, i) {
    const t = TEAM_STYLE[i % TEAM_STYLE.length];
    const members = (team || []).map((u) => C.playerOrGhost(u));
    return `<div class="tb-team" style="--tc:${t.color}; --i:${i}"><h3>${t.icon} ${esc(t.name)}</h3><ul>${members.map((p) => `<li>${avatarHTML(p, '2.6rem')}<span>${esc(p.name)}</span></li>`).join('')}</ul></div>`;
  },

  async spinStarter() {
    const ps = this.items || [];
    if (ps.length < 2 || this.spinning) return;
    this.spinning = true;
    const i = Math.floor(Math.random() * ps.length);
    const res = $('#tbResult', this.el);
    if (res) res.textContent = '';
    await spinWheel($('#starterWheel', this.el), i, ps.length);
    this.spinning = false;
    const p = ps[i];
    if (res) res.innerHTML = tr('tvx.table.starts', { name: esc(p.name) });
    fanfare();
    const r = $('#starterWheel', this.el)?.getBoundingClientRect();
    if (r) confettiBurst(70, { x: r.left + r.width / 2, y: r.top + 40 });
    C.update(room('table'), { starter: { uid: p.uid, name: p.name, at: C.serverTimestamp() } }).catch(fail);
    C.logEvent(tr('tvx.table.startsLog', { name: p.name }), '🎲');
  },

  makeTeams(n) {
    const ps = this.players();
    if (ps.length < 2) { toast(tr('tvx.table.need2'), 'warn'); return; }
    const skill = skillMap(Object.fromEntries(ps.map((p) => [p.uid, p])), S().nights, C.winsTonight(), personKey);
    const teams = balancedTeams(ps.map((p) => p.uid), n, skill);
    C.update(room('table'), { teams, teamsAt: C.serverTimestamp() }).catch(fail);
    pop();
    C.logEvent(tr('tvx.table.teamsLog', { n: teams.length, list: teams.map((t, i) => `${TEAM_STYLE[i].name} (${t.map((u) => C.playerOrGhost(u).name).join(', ')})`).join(' · ') }), '🤝');
  },

  update() {
    if (!this.el) return;
    if (this.tab === 'timer') { this.paintTimer(); return; }
    const sig = JSON.stringify([S().table?.teams, Object.keys(S().players || {}), this.tab === 'starter' ? activePlayers(S().players).map((p) => [p.uid, p.name, p.color]) : 0]);
    if (sig === this.sig || this.spinning) return;
    this.sig = sig;
    this.paint();
  }
};

// ---------------------------------------------------------------------------
// Ruota dei giochi (alternativa al sondaggio)
// ---------------------------------------------------------------------------

export const GameWheel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el) return;
    const n = activePlayers(S().players).length;
    const played = C.playedTonight();
    let items = C.poolItems().filter((it) => !played.has(nameKey(it.name)) && C.libOk(it, n));
    if (items.length < 2) { toast(tr('tvx.wheel.need2'), 'warn'); return; }
    if (items.length > 12) items = items.sort(() => Math.random() - 0.5).slice(0, 12);
    this.items = items;
    const el = document.createElement('div');
    el.className = 'overlay overlay--table';
    el.innerHTML = `
      <div class="card panel panel--wide table-panel" role="dialog" aria-modal="true" aria-labelledby="gwTitle">
        <div class="panel-head"><h2 id="gwTitle">${esc(tr('tvx.wheel.title'))}</h2><button type="button" class="icon-btn" id="gwClose" aria-label="${esc(tr('common.close'))}">${ICONS.x}</button></div>
        <div class="tb-wheel">${wheelHTML(items.map((it, i) => ({ label: it.name, color: PALETTE[i % PALETTE.length] })), 'gameWheel')}
          <div class="tb-side">
            <p class="tb-lead">${esc(tr('tvx.wheel.lead', { games: items.length, n }))}</p>
            <button type="button" class="btn btn-big" id="gwSpin">${esc(tr('tvx.wheel.spin'))}</button>
            <p class="tb-result" id="gwResult" aria-live="polite"></p>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#gwClose')) { if (!this.spinning) this.close(); return; }
      if (e.target.closest('#gwSpin')) this.spin();
    });
  },
  close() { this.el?.remove(); this.el = null; },
  async spin() {
    if (this.spinning) return;
    this.spinning = true;
    $('#gwSpin', this.el).disabled = true;
    const i = Math.floor(Math.random() * this.items.length);
    drumroll(1.2);
    await spinWheel($('#gameWheel', this.el), i, this.items.length);
    const it = this.items[i];
    $('#gwResult', this.el).innerHTML = tr('tvx.wheel.result', { name: esc(it.name) });
    fanfare();
    const r = $('#gameWheel', this.el)?.getBoundingClientRect();
    if (r) confettiBurst(90, { x: r.left + r.width / 2, y: r.top + 40 });
    C.chooseGame(it.id);
    C.logEvent(tr('tvx.wheel.log', { name: it.name }), '🎡');
    setTimeout(() => { this.spinning = false; this.close(); toast(tr('tvx.wheel.toast', { name: it.name })); }, prefersReducedMotion() ? 600 : 2600);
  }
};

// ---------------------------------------------------------------------------
// Segnapunti dal vivo (i telefoni scrivono i loro punti durante la partita)
// ---------------------------------------------------------------------------

export function liveScores() {
  const st = S().state || {};
  if (st.phase !== 'idle' || !st.playId) return [];
  const sc = S().scores?.[st.playId] || {};
  return Object.entries(sc).filter(([u, v]) => typeof v === 'number' && S().players[u]).map(([uid, v]) => ({ uid, v, p: C.playerOrGhost(uid) }))
    .sort((a, b) => b.v - a.v);
}

export function liveScoresHTML() {
  const list = liveScores();
  if (!list.length) return '';
  const top = list[0].v;
  return `<div class="live-scores" id="liveScores" aria-live="polite"><span class="ls-title">${esc(tr('tvx.score.title'))}</span>
    <ol>${list.map((r) => `<li class="${r.v === top ? 'is-lead' : ''}" style="--pc:${safeColor(r.p.color)}"><button type="button" data-score-edit="${esc(r.uid)}" title="${esc(tr('tvx.score.fix', { name: r.p.name }))}">${avatarHTML(r.p, '2rem')}<span>${esc(r.p.name)}</span><b>${r.v}</b></button></li>`).join('')}</ol></div>`;
}

/** Vincitori dal segnapunti (chi ha il punteggio più alto; a pari merito tutti). */
export function scoreWinners() {
  const list = liveScores();
  if (!list.length) return [];
  const top = list[0].v;
  return list.filter((r) => r.v === top).map((r) => r.uid);
}

export function editScore(uid) {
  const st = S().state || {};
  const cur = S().scores?.[st.playId]?.[uid];
  const p = C.playerOrGhost(uid);
  const v = prompt(tr('tvx.score.prompt', { name: p.name }), cur ?? '');
  if (v === null) return;
  const n = Math.round(Number(String(v).replace(',', '.')));
  if (!Number.isFinite(n)) { toast(tr('tvx.score.nan'), 'warn'); return; }
  C.set(room(`scores/${st.playId}/${uid}`), n).catch(fail);
}

// ---------------------------------------------------------------------------
// Quiz del gruppo
// ---------------------------------------------------------------------------

const OPT_COLORS = ['#FF5A4E', '#4D96FF', '#FFC93C', '#8AC926'];
const OPT_SHAPES = ['▲', '◆', '●', '■'];
const QUIZ_SECS = 20;

/** "Vince Anna!" / "Vince Anna e Luca!" (più vincitori a pari punti). */
const winnersLine = (names) => tr('tvx.quiz.wins', { n: names.length, names: fmtList(names) });

export const Quiz = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(count = 5) {
    if (this.el || !S().code) return;
    const board = C.board();
    const names = Object.fromEntries(Object.entries(S().players || {}).map(([u, p]) => [u, p.name]));
    this.round = buildQuizRound({ nights: S().nights, library: S().library, board, names }, count);
    if (!this.round.length) { toast(tr('tvx.quiz.none'), 'warn'); return; }
    this.idx = -1;
    this.qid = null;
    const el = document.createElement('div');
    el.className = 'quiz-show';
    el.id = 'quizShow';
    el.innerHTML = '<div class="qz-stage" id="qzStage"></div>';
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target.closest('#qzClose')) { this.close(); return; }
      if (e.target.closest('#qzNext')) { this.next(); return; }
      if (e.target.closest('#qzReveal')) { this.reveal(); }
    });
    C.set(room('quizScore'), null).catch(() => {});
    C.set(room('quizAns'), null).catch(() => {});
    C.logEvent(tr('tvx.quiz.name'), '🧠');
    this.intro();
  },

  intro() {
    $('#qzStage', this.el).innerHTML = `
      <div class="qz-intro"><span class="qz-kicker">${esc(tr('tvx.quiz.kicker'))}</span><h1 class="qz-big">${esc(tr('tvx.quiz.count', { n: this.round.length }))}</h1>
      <p class="qz-sub">${esc(tr('tvx.quiz.rules', { secs: QUIZ_SECS }))}</p>
      <div class="qz-actions"><button type="button" class="btn-sec" id="qzClose">${esc(tr('common.close'))}</button><button type="button" class="btn btn-big" id="qzNext">${esc(tr('tvx.quiz.first'))}</button></div></div>`;
    $('#qzNext', this.el).focus();
  },

  async next() {
    clearTimeout(this.auto);
    this.idx++;
    if (this.idx >= this.round.length) { this.finish(); return; }
    const q = this.round[this.idx];
    this.qid = `q${Date.now().toString(36)}`;
    this.revealed = false;
    this.lastSec = undefined;
    try {
      await C.set(room('quiz'), { id: this.qid, n: this.idx + 1, total: this.round.length, q: q.q, options: q.options, open: true, at: C.serverTimestamp(), secs: QUIZ_SECS, kind: q.kind });
    } catch (err) { fail(err); return; }
    ding();
    this.paintQuestion();
    clearInterval(this.tick);
    this.tick = setInterval(() => this.paintClock(), 200);
    if (S().meta?.demo) this.botAnswers();
  },

  paintQuestion() {
    const q = this.round[this.idx];
    $('#qzStage', this.el).innerHTML = `
      <div class="qz-q">
        <div class="qz-top"><span class="qz-kicker">${esc(tr(q.kind === 'trivia' ? 'tvx.quiz.kind.trivia' : q.kind === 'tonight' ? 'tvx.quiz.kind.tonight' : 'tvx.quiz.kind.group'))} · ${this.idx + 1} / ${this.round.length}</span>
          <div class="vtimer qz-timer" id="qzTimer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="vt-track" cx="60" cy="60" r="52"/><circle class="vt-arc" id="qzArc" cx="60" cy="60" r="52" stroke-dasharray="326.73" stroke-dashoffset="0"/></svg><b id="qzNum">${QUIZ_SECS}</b></div></div>
        <h1 class="qz-question">${esc(q.q)}</h1>
        <div class="qz-opts">${q.options.map((o, i) => `<div class="qz-opt" data-opt="${i}" style="--oc:${OPT_COLORS[i]}"><span class="qz-shape" aria-hidden="true">${OPT_SHAPES[i]}</span><b>${esc(o)}</b><span class="qz-who" id="qzWho${i}"></span></div>`).join('')}</div>
        <div class="qz-foot"><span id="qzCount" class="qz-count"></span><span class="qz-actions"><button type="button" class="btn-sec" id="qzClose">${esc(tr('tvx.quiz.closeQuiz'))}</button><button type="button" class="btn" id="qzReveal">${esc(tr('tvx.quiz.reveal'))}</button></span></div>
      </div>`;
    this.paintAnswers();
  },

  answers() { return S().quizAns?.[this.qid] || {}; },

  paintAnswers() {
    if (!this.el || !this.qid) return;
    const ans = this.answers();
    const ps = activePlayers(S().players);
    const n = ps.filter((p) => typeof ans[p.uid] === 'number').length;
    const c = $('#qzCount', this.el);
    if (c) c.innerHTML = `${ps.filter((p) => typeof ans[p.uid] === 'number').map((p) => avatarHTML(p, '2.2rem')).join('')}<span>${esc(tr('tvx.quiz.answered', { n, total: ps.length }))}</span>`;
    if (!this.revealed && ps.length && n >= ps.length) setTimeout(() => this.reveal(), 700);
  },

  paintClock() {
    if (!this.el || this.revealed) return;
    const at = Number(S().quiz?.at);
    if (!Number.isFinite(at)) return;
    // Serata in pausa: il tempo del quiz è fermo (alla ripresa la TV sposta quiz.at in avanti).
    if (S().state?.paused) { const n = $('#qzNum', this.el); if (n) n.textContent = '❚❚'; this.lastSec = undefined; return; }
    const left = Math.max(0, at + QUIZ_SECS * 1000 - C.serverNow());
    const frac = left / (QUIZ_SECS * 1000);
    const sec = Math.ceil(left / 1000);
    const box = $('#qzTimer', this.el);
    if (!box) return;
    box.style.setProperty('--tc', timerColor(frac));
    $('#qzArc', this.el).setAttribute('stroke-dashoffset', String(326.73 * (1 - frac)));
    $('#qzNum', this.el).textContent = String(sec);
    box.classList.toggle('is-hot', sec <= 5 && sec > 0);
    if (sec !== this.lastSec && this.lastSec !== undefined && sec <= 5 && sec > 0) clockTick(sec <= 3);
    this.lastSec = sec;
    if (left <= 0) this.reveal();
  },

  async reveal() {
    if (this.revealed || !this.qid) return;
    this.revealed = true;
    clearInterval(this.tick);
    const q = this.round[this.idx];
    const ans = this.answers();
    const right = Object.entries(ans).filter(([, v]) => v === q.correct).map(([u]) => u);
    const scores = { ...(S().quizScore || {}) };
    for (const u of right) scores[u] = (Number(scores[u]) || 0) + 1;
    try {
      await C.update(room(''), { 'quiz/open': false, 'quiz/correct': q.correct, quizScore: scores });
    } catch (err) { fail(err); }
    if (right.length) { fanfare(); } else whistle();
    const num = $('#qzNum', this.el);
    if (num) num.textContent = '✓';
    $('#qzTimer', this.el)?.classList.remove('is-hot');
    this.el.querySelectorAll('.qz-opt').forEach((o) => {
      const i = Number(o.dataset.opt);
      o.classList.add(i === q.correct ? 'is-right' : 'is-wrong');
      const who = Object.entries(ans).filter(([, v]) => v === i).map(([u]) => C.playerOrGhost(u));
      const w = $(`#qzWho${i}`, this.el);
      if (w) w.innerHTML = who.map((p) => avatarHTML(p, '1.9rem')).join('');
    });
    const foot = $('.qz-actions', this.el);
    if (foot) foot.innerHTML = `<button type="button" class="btn-sec" id="qzClose">${esc(tr('tvx.quiz.closeQuiz'))}</button><button type="button" class="btn btn-big" id="qzNext">${esc(tr(this.idx + 1 >= this.round.length ? 'tvx.quiz.final' : 'tvx.quiz.next'))}</button>`;
    $('#qzCount', this.el).innerHTML = right.length ? `✅ <b>${esc(right.map((u) => C.playerOrGhost(u).name).join(', '))}</b>` : esc(tr('tvx.quiz.nobody'));
    $('#qzNext', this.el)?.focus();
  },

  finish() {
    clearInterval(this.tick);
    const sc = S().quizScore || {};
    const rows = activePlayers(S().players).map((p) => ({ p, v: Number(sc[p.uid]) || 0 })).sort((a, b) => b.v - a.v);
    const top = rows[0]?.v || 0;
    C.update(room('quiz'), { open: false, done: true, id: `end${Date.now().toString(36)}` }).catch(() => {});
    $('#qzStage', this.el).innerHTML = `
      <div class="qz-intro"><span class="qz-kicker">${esc(tr('tvx.quiz.kicker'))}</span><h1 class="qz-big">${top ? esc(winnersLine(rows.filter((r) => r.v === top).map((r) => r.p.name))) : esc(tr('tvx.quiz.noPoints'))}</h1>
        <ol class="qz-rank">${rows.map((r, i) => `<li style="--i:${i}" class="${r.v === top && top ? 'is-top' : ''}">${avatarHTML(r.p, '3rem')}<span>${esc(r.p.name)}</span><b>${r.v}</b></li>`).join('')}</ol>
        <div class="qz-actions"><button type="button" class="btn btn-big" id="qzClose">${esc(tr('tvx.quiz.back'))}</button></div></div>`;
    if (top) { victory(); confettiBurst(140); }
  },

  botAnswers() {
    const q = this.round[this.idx];
    for (const p of activePlayers(S().players).filter((x) => String(x.uid).startsWith('bot_'))) {
      setTimeout(() => {
        if (!this.el || this.revealed) return;
        const i = Math.random() < 0.5 ? q.correct : Math.floor(Math.random() * q.options.length);
        C.set(room(`quizAns/${this.qid}/${p.uid}`), i).catch(() => {});
      }, 1500 + Math.random() * 5000);
    }
  },

  update() { if (this.el && !this.revealed) this.paintAnswers(); },

  close() {
    clearInterval(this.tick);
    clearTimeout(this.auto);
    this.el?.remove();
    this.el = null;
    this.qid = null;
    C.update(room(''), { quiz: null, quizAns: null }).catch(() => {});
  }
};

// ---------------------------------------------------------------------------
// Allarme intrusi
// ---------------------------------------------------------------------------

// Tipi di tentativo (codici scritti dai telefoni in rooms/<codice>/knock): testo in tvx.knock.<tipo>.
const KNOCK_KINDS = new Set(['locked', 'banned', 'regia', 'full']);

export const Knocks = {
  seen: {},
  list() {
    return Object.entries(S().knock || {}).map(([uid, k]) => ({ uid, ...k })).filter((k) => KNOCK_KINDS.has(k.kind)).sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  },
  text(k) { return `${k.name ? `“${k.name}”` : tr('tvx.knock.device')} ${tr(`tvx.knock.${k.kind}`)}${k.n > 1 ? ` ${tr('tvx.knock.times', { n: Number(k.n) })}` : ''}`; },
  sync() {
    for (const k of this.list()) {
      const sig = `${k.at}|${k.n}`;
      if (this.seen[k.uid] === sig) continue;
      const first = this.seen[k.uid] === undefined && this.started;
      const changed = this.seen[k.uid] !== undefined;
      this.seen[k.uid] = sig;
      if (first || changed) {
        this.alarm(k);
      }
    }
    this.started = true;
  },
  alarm(k) {
    C.logEvent(tr('tvx.knock.log', { text: this.text(k) }), '🚨');
    let el = $('#knockAlarm');
    if (!el) {
      el = document.createElement('div');
      el.id = 'knockAlarm';
      el.className = 'knock-alarm';
      el.setAttribute('role', 'alert');
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { if (e.target.closest('[data-knock-ok]')) el.remove(); });
    }
    el.innerHTML = `<span class="ka-ico" aria-hidden="true">🚨</span><span><b>${esc(tr('tvx.knock.title'))}</b><br>${esc(this.text(k))}</span><button type="button" class="btn-sec btn-sec--sm" data-knock-ok>Ok</button>`;
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
    ding();
    clearTimeout(this.hide);
    this.hide = setTimeout(() => el.remove(), 12000);
  },
  html() {
    const l = this.list();
    return l.length ? `<ul class="trash-list knock-list">${l.slice(0, 8).map((k) => `<li><span>🚨 ${esc(this.text(k))}<small> · ${fmtDate(Number(k.at), { hour: '2-digit', minute: '2-digit' })}</small></span></li>`).join('')}</ul><button type="button" class="link-btn" id="tlKnockClear">${esc(tr('tvx.knock.clear'))}</button>` : `<p class="muted small">${esc(tr('tvx.knock.none'))}</p>`;
  }
};

// ---------------------------------------------------------------------------
// Sicurezza: codice regia nuovo, stanze a scadenza, storico privato
// ---------------------------------------------------------------------------

/** Nuovo codice regia: i telefoni regia e gli altri computer con il vecchio codice perdono l'accesso. */
export async function changeRegiaCode() {
  const code = randomCode(8);
  await C.set(C.secretRef(S().code), code);
  await C.update(room(''), { cohosts: null, takeover: null });
  try { localStorage.setItem(C.regiaKey(S().code), code); } catch { /* niente */ }
  C.logEvent(tr('tvx.regia.log'), '🔑');
  return code;
}

/**
 * Cancella le stanze del gruppo più vecchie di "days" giorni (la serata resta salvata nel gruppo).
 * Si salta la stanza aperta adesso. Restituisce quante stanze ha cancellato.
 */
export async function cleanupOldRooms(gid, days) {
  if (!gid || !days) return 0;
  const limit = Date.now() - days * 86400000;
  const nights = S().nights || {};
  const listed = (await C.get(C.groupRef(gid, 'rooms')).catch(() => null))?.val() || {};
  const codes = [...new Set([...Object.keys(nights), ...Object.keys(listed)])].filter((c) => c !== S().code && /^[A-Z0-9]{4}$/.test(c));
  let n = 0;
  for (const code of codes) {
    const at = Number(nights[code]?.at) || 0;
    if (at && at > limit) continue;
    const meta = (await C.get(C.roomRef(code, 'meta')).catch(() => null))?.val();
    if (!meta || meta.groupId !== gid || Number(meta.createdAt) > limit) continue;
    try {
      await C.remove(C.roomRef(code, ''));
      await C.remove(C.secretRef(code)).catch(() => {});
      n++;
    } catch { /* niente: non autorizzati */ }
  }
  if (n) C.logEvent(tr('tvx.rooms.log', { n, days }), '🧹');
  return n;
}

// ---------------------------------------------------------------------------
// Stagioni, rivalità, figurine (schede della "Classifica di sempre" e premiazione)
// ---------------------------------------------------------------------------

/** Le serate del gruppo con quella di stasera già dentro (anche prima del salvataggio). */
export function nightsWithTonight() {
  const board = C.board();
  if (!board.length) return S().nights || {};
  return { ...(S().nights || {}), [S().code]: nightSummary(board, S().players, S().meta, buildAwards(board, S().votes, S().players)) };
}

function personAvatar(key, name) {
  const p = sortedPlayers(S().players).find((x) => personKey(x) === key) || C.playerByName(name);
  return p;
}

export function seasonTabHTML() {
  const all = seasonTables(nightsWithTonight());
  const cur = all.find((s) => s.id === seasonOf(Date.now()).id) || null;
  const past = all.filter((s) => s.done && s.champion.length);
  const rows = (cur?.rows || []).map((r, i) => `
    <li class="season-row ${r.rank === 1 ? 'is-lead' : ''}" style="--i:${i}">
      <span class="brank">${r.rank}</span>${avatarHTML(personAvatar(r.key, r.name), '3rem')}
      <span class="sr-name"><b>${esc(r.name)}</b><small>${esc([tr('tvx.season.nights', { n: r.nights }), tr('tvx.season.champ', { n: r.nightWins }), tr('tvx.season.wins', { n: r.wins }), tr('tvx.season.mvp', { n: r.mvp })].join(' · '))}</small></span>
      <span class="sr-pts">${r.points}<small>${esc(tr('tvx.season.pt'))}</small></span>
    </li>`).join('');
  return `
    <div class="season-box">
      <div class="season-main card">
        <h2>${esc(tr('tvx.season.title', { name: cur ? cur.name : seasonOf(Date.now()).name }))}</h2>
        <p class="muted">${esc(tr('tvx.season.rules'))}</p>
        ${rows ? `<ol class="season-list">${rows}</ol>` : `<p class="empty-title">${esc(tr('tvx.season.empty'))}</p>`}
      </div>
      <aside class="season-side card">
        <h2>${esc(tr('tvx.season.hall'))}</h2>
        ${past.length ? `<ul class="hall">${past.map((s) => `<li><span class="hall-season">${esc(s.name)}</span><b>${esc(fmtList(s.champion.map((c) => c.name)))}</b><small>${esc(`${tr('tvx.season.pts', { n: s.champion[0].points })} · ${tr('tvx.season.nights', { n: s.nights })}`)}</small></li>`).join('')}</ul>` : `<p class="muted">${esc(tr('tvx.season.hallEmpty'))}</p>`}
      </aside>
    </div>`;
}

export function rivalsTabHTML() {
  const list = topRivalries(nightsWithTonight(), 8);
  if (!list.length) return `<div class="empty-board"><p class="empty-title">${esc(tr('tvx.rivals.emptyTitle'))}</p><p class="muted">${esc(tr('tvx.rivals.emptyText'))}</p></div>`;
  return `<div class="rivals">${list.map((r, i) => {
    const pa = personAvatar(r.a, r.aName);
    const pb = personAvatar(r.b, r.bName);
    const tot = Math.max(1, r.aw + r.bw);
    return `
      <article class="rival card" style="--i:${i}; --ca:${safeColor(pa.color)}; --cb:${safeColor(pb.color)}">
        <div class="rv-side">${avatarHTML(pa, '4rem')}<b>${esc(r.aName)}</b></div>
        <div class="rv-mid"><span class="rv-score">${r.aw}<i>–</i>${r.bw}</span><span class="rv-bar"><i style="width:${(r.aw / tot) * 100}%"></i></span><small>${esc(`${tr('tvx.rivals.games', { n: r.games })} · ${r.aw === r.bw ? tr('tvx.rivals.tie') : tr('tvx.rivals.ahead', { name: r.aw > r.bw ? r.aName : r.bName })}`)}</small></div>
        <div class="rv-side">${avatarHTML(pb, '4rem')}<b>${esc(r.bName)}</b></div>
      </article>`;
  }).join('')}</div>`;
}

/** Riga "sfida nella sfida" per la partita in corso: la rivalità più accesa tra chi gioca. */
export function rivalryLine(uids) {
  const keys = new Map(uids.map((u) => [personKey(S().players[u] || {}), S().players[u]?.name]).filter(([k, n]) => k && n));
  const r = topRivalries(S().nights || {}, 40).find((x) => keys.has(x.a) && keys.has(x.b));
  return r ? tr('tvx.rivals.line', { a: r.aName, aw: String(r.aw), bw: String(r.bw), b: r.bName }) : '';
}

export function cardsTabHTML() {
  const nights = nightsWithTonight();
  const people = {};
  for (const n of nightsByDate(nights)) for (const [k, pp] of Object.entries(n.people || {})) people[k] ||= pp.name;
  const cards = Object.entries(people).map(([k, name]) => ({ c: playerCard(nights, k, S().library), p: personAvatar(k, name) }))
    .sort((a, b) => b.c.level - a.c.level || b.c.xp - a.c.xp);
  if (!cards.length) return `<div class="empty-board"><p class="empty-title">${esc(tr('tvx.cards.emptyTitle'))}</p><p class="muted">${esc(tr('tvx.cards.emptyText'))}</p></div>`;
  return `<p class="muted cards-lead">${esc(tr('tvx.cards.lead'))}</p>
    <div class="gcards" id="gcards">${cards.map(({ c, p }) => cardHTML(c, p)).join('')}</div>`;
}

export function bindCards(root) {
  const g = root.querySelector('#gcards');
  if (g) bindTilt(g);
}

/** Tappa "Classifica di stagione" della premiazione: chi sale grazie a stasera. */
export function seasonStageHTML() {
  const nowSeason = seasonOf(Date.now());
  const withT = seasonTables(nightsWithTonight()).find((s) => s.id === nowSeason.id);
  if (!withT) return '';
  const before = seasonTables(Object.fromEntries(Object.entries(S().nights || {}).filter(([k]) => k !== S().code))).find((s) => s.id === nowSeason.id);
  const prevRank = Object.fromEntries((before?.rows || []).map((r) => [r.key, r.rank]));
  const tonight = nightsWithTonight()[S().code]?.people || {};
  return `<div class="season-stage"><h2 class="prize-title">${esc(tr('tvx.stage.title', { name: withT.name }))}</h2><ol class="season-list season-list--stage">${withT.rows.slice(0, 8).map((r, i) => {
    const gain = championPoints(tonight[r.key]);
    const was = prevRank[r.key];
    const move = was ? was - r.rank : null;
    return `<li class="season-row ${r.rank === 1 ? 'is-lead' : ''}" style="--i:${i}"><span class="brank">${r.rank}</span>${avatarHTML(personAvatar(r.key, r.name), '3rem')}<span class="sr-name"><b>${esc(r.name)}</b><small>${esc(tr('tvx.season.nights', { n: r.nights }))}</small></span>${gain ? `<span class="sr-gain">${esc(tr('tvx.stage.gain', { n: gain }))}</span>` : ''}${move ? `<span class="sr-move ${move > 0 ? 'is-up' : 'is-down'}">${move > 0 ? `▲ ${move}` : `▼ ${-move}`}</span>` : was ? '' : `<span class="sr-move is-new">${esc(tr('tvx.stage.new'))}</span>`}<span class="sr-pts">${r.points}<small>${esc(tr('tvx.season.pt'))}</small></span></li>`;
  }).join('')}</ol></div>`;
}

// ---------------------------------------------------------------------------
// Video riassunto della serata
// ---------------------------------------------------------------------------

export const VideoPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(data) {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="vdTitle">
        <div class="panel-head"><h2 id="vdTitle">${esc(tr('tvx.video.title'))}</h2><button type="button" class="icon-btn" id="vdClose" aria-label="${esc(tr('common.close'))}">${ICONS.x}</button></div>
        <div id="vdBody">${videoSupported() ? `
          <p class="muted">${esc(tr('tvx.video.lead'))}</p>
          <button type="button" class="btn btn-big" id="vdGo">${esc(tr('tvx.video.make'))}</button>` : `<p>${esc(tr('tvx.video.unsupported'))}</p>`}</div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#vdClose')) { if (!this.busy) this.close(); return; }
      if (e.target.closest('#vdGo')) this.make(data);
      if (e.target.closest('#vdSave')) this.save();
    });
  },
  async make(data) {
    if (this.busy) return;
    this.busy = true;
    const body = $('#vdBody', this.el);
    body.innerHTML = `<p>${esc(tr('tvx.video.recording'))}</p><div class="vd-bar"><i id="vdProg"></i></div><p class="muted small" id="vdPct">0%</p>`;
    try {
      const res = await makeRecapVideo(data, (f) => { const b = $('#vdProg'); if (b) b.style.width = `${Math.round(f * 100)}%`; const p = $('#vdPct'); if (p) p.textContent = `${Math.round(f * 100)}%`; });
      this.blob = res.blob;
      this.url = URL.createObjectURL(res.blob);
      body.innerHTML = `<video class="vd-preview" src="${this.url}" controls autoplay muted loop playsinline></video>
        <p class="muted small">${esc(tr('tvx.video.info', { secs: res.seconds, mb: fmtNum(res.blob.size / 1048576, 1), format: res.type.replace('video/', '').toUpperCase() }))}</p>
        <button type="button" class="btn btn-big" id="vdSave">${ICONS.download}<span>${esc(tr('tvx.video.save'))}</span></button>`;
      C.logEvent(tr('tvx.video.log'), '🎬');
    } catch (err) {
      body.innerHTML = `<p class="form-error">${esc(err.message || tr('tvx.video.fail'))}</p>`;
    }
    this.busy = false;
  },
  save() {
    if (!this.blob) return;
    const ext = this.blob.type.includes('mp4') ? 'mp4' : 'webm';
    if (isApp()) { saveInApp(this.blob, `GameNight_video_${new Date().toISOString().slice(0, 10)}.${ext}`); return; }
    const a = document.createElement('a');
    a.href = this.url;
    a.download = `GameNight_video_${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  close() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.blob = null;
    this.el?.remove();
    this.el = null;
  }
};

// ---------------------------------------------------------------------------
// Invito .ics e importazione CSV di BoardGameGeek
// ---------------------------------------------------------------------------

export function downloadICS(next, group, url = '') {
  if (!next?.at) return;
  downloadFile(`gamenight_${new Date(Number(next.at)).toISOString().slice(0, 10)}.ics`, nextNightICS({ at: next.at, place: next.place, note: next.note, group, url }), 'text/calendar');
}

/** Legge il CSV e aggiunge i giochi che mancano (completa i dati vuoti di quelli già presenti). */
export async function importGamesCSV(file) {
  if (!S().meta?.armadioId && !S().meta?.groupId) return null;
  const { items, source } = gamesFromCSV(await file.text());
  if (!items.length) throw new Error(tr('tvx.csv.none'));
  const lib = S().library || {};
  const byName = new Map(Object.entries(lib).map(([id, it]) => [nameKey(it.name), id]));
  const fresh = items.filter((it) => !byName.has(nameKey(it.name)));
  const known = items.filter((it) => byName.has(nameKey(it.name)));
  if (!confirm(tr('tvx.csv.confirm', { src: tr(source === 'bgg' ? 'tvx.csv.bgg' : 'tvx.csv.file'), n: items.length, fresh: fresh.length, known: known.length }))) return null;
  const patch = {};
  for (const it of fresh) {
    const id = C.push(C.libraryRef(S().meta)).key;
    patch[id] = { ...it, addedBy: 'BoardGameGeek', addedAt: C.serverTimestamp() };
  }
  for (const it of known) {
    const id = byName.get(nameKey(it.name));
    const cur = lib[id] || {};
    for (const k of ['minPlayers', 'maxPlayers', 'duration', 'year', 'weight']) if (it[k] !== undefined && (cur[k] === undefined || cur[k] === null)) patch[`${id}/${k}`] = it[k];
  }
  if (Object.keys(patch).length) await C.update(C.libraryRef(S().meta), patch);
  C.logEvent(tr('tvx.csv.log', { n: fresh.length, src: source === 'bgg' ? 'BoardGameGeek' : 'CSV' }), '📥');
  return { added: fresh.length, updated: known.length };
}

