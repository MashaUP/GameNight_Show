// Sul telefono: segnapunti, squadre/chi inizia/clessidra, quiz del gruppo,
// figurina, rivalità, stagione, invito .ics, allarme intrusi e revoca della regia.
import { $, esc, fmt, safeColor, toast, buzz, timerColor, cleanName, downloadFile, activePlayers } from './util.js';
import { avatarHTML } from './avatars.js';
import { playerCard, rivalsOf, seasonTables, seasonOf, personKey } from './stats.js';
import { TEAM_STYLE, nextNightICS } from './extras.js';
import { cardHTML, bindTilt, renderCardImage } from './cards.js';
import { confettiBurst } from './fx.js';
import { publicUrl } from './native.js';
import { t } from './i18n.js';

let C = null;
/** play.js passa qui lo stato del telefono e le sue funzioni. */
export function bindPhone(ctx) { C = ctx; }
const P = () => C.P;
const room = (path) => C.roomRef(P().code, path);

// ---------------------------------------------------------------------------
// Allarme intrusi: il telefono segnala alla TV i tentativi respinti
// ---------------------------------------------------------------------------

export function knock(kind) {
  if (!P().code || !P().uid) return;
  const k = `gnr_knock_${P().code}_${kind}`;
  let n = 1;
  try { n = (Number(sessionStorage.getItem(k)) || 0) + 1; sessionStorage.setItem(k, String(n)); } catch { /* niente */ }
  let name = '';
  try { name = cleanName(localStorage.getItem('gnr_name') || '', 16); } catch { /* niente */ }
  const data = { kind, n: Math.min(n, 1000), at: C.serverTimestamp() };
  if (name) data.name = name;
  C.set(room(`knock/${P().uid}`), data).catch(() => {});
}

/** La TV ha cambiato il codice regia: questo telefono perde la regia. */
export function checkCohost() {
  const p = P();
  if (!p.cohost || !p.loaded?.has('cohosts')) return;
  if (p.cohosts?.[p.uid]) { p.cohostSeen = true; return; }
  if (!p.cohostSeen) return;
  p.cohost = false;
  p.cohostSeen = false;
  try { localStorage.removeItem(`gnr_cohost_${p.code}`); localStorage.removeItem(`gnr_regia_${p.code}`); } catch { /* niente */ }
  toast(t('phx.regia.lost'), 'warn');
}

// ---------------------------------------------------------------------------
// Partita in corso: segnapunti, chi inizia, squadre, clessidra
// ---------------------------------------------------------------------------

function inPlay() {
  const st = P().state || {};
  return st.phase === 'idle' && st.playStart && st.playId ? st : null;
}

export function tableHTML() {
  const tb = P().table || {};
  const out = [];
  const st = tb.starter && P().players[tb.starter.uid];
  if (st && Number(tb.starter.at) > Date.now() - 30 * 60000) out.push(`<p class="tb-line">${t(tb.starter.uid === P().uid ? 'phx.table.startsMe' : 'phx.table.starts', { name: esc(st.name) })}</p>`);
  if (Array.isArray(tb.teams)) {
    const i = tb.teams.findIndex((team) => Array.isArray(team) && team.includes(P().uid));
    if (i >= 0) {
      const ts = TEAM_STYLE[i % TEAM_STYLE.length];
      const mates = tb.teams[i].filter((u) => u !== P().uid).map((u) => P().players[u]?.name).filter(Boolean);
      out.push(`<p class="tb-line tb-line--team" style="--tc:${ts.color}">${ts.icon} ${mates.length ? t('phx.table.teamWith', { team: esc(ts.name), names: esc(mates.join(', ')) }) : t('phx.table.team', { team: esc(ts.name) })}</p>`);
    }
  }
  out.push('<div class="fuse fuse--sand" id="sandFuse" hidden><div class="fuse-track" aria-hidden="true"><i class="fuse-rope" id="sandRope"></i><b class="fuse-spark"><i></i><i></i><i></i></b></div><span class="fuse-txt" id="sandTxt"></span></div>');
  return `<section class="card ph-card table-card">${out.join('')}</section>`;
}

/** Clessidra sul telefono (aggiornata dal timer della schermata). */
export function paintSand() {
  const box = $('#sandFuse');
  if (!box) return;
  const s = P().table?.sand;
  const secs = Number(s?.secs) || 0;
  const at = Number(s?.at);
  if (!secs || !Number.isFinite(at)) { box.hidden = true; return; }
  const left = Math.max(0, at + secs * 1000 - C.serverNow());
  if (left <= 0 && C.serverNow() - (at + secs * 1000) > 8000) { box.hidden = true; return; }
  box.hidden = false;
  const frac = left / (secs * 1000);
  box.style.setProperty('--tc', timerColor(frac));
  box.style.setProperty('--fx', `${(frac * 100).toFixed(2)}%`);
  $('#sandRope').style.width = `${(frac * 100).toFixed(2)}%`;
  box.classList.toggle('is-over', left <= 0);
  $('#sandTxt').textContent = left <= 0 ? t('phx.sand.over') : t('phx.sand.left', { n: Math.ceil(left / 1000) });
  if (left <= 0 && paintSand.last > 0) buzz([120, 60, 120]);
  paintSand.last = Math.ceil(left / 1000);
}

export function scoreHTML() {
  const st = inPlay();
  if (!st) return '';
  const players = st.playPlayers ? Object.keys(st.playPlayers) : activePlayers(P().players).map((p) => p.uid);
  if (!players.includes(P().uid)) return '';
  const sc = P().scores?.[st.playId] || {};
  const mine = P().myScore?.[st.playId] ?? sc[P().uid] ?? 0;
  const others = players.filter((u) => u !== P().uid && typeof sc[u] === 'number').map((u) => ({ p: P().players[u] || { name: '?' }, v: sc[u] })).sort((a, b) => b.v - a.v);
  return `
    <section class="card ph-card score-card">
      <h2>${esc(st.playName ? t('phx.score.titleGame', { game: st.playName }) : t('phx.score.title'))}</h2>
      <div class="sc-me">
        <button type="button" class="sc-btn" data-sc="-5">−5</button>
        <button type="button" class="sc-btn" data-sc="-1">−1</button>
        <output class="sc-num" id="scNum">${mine}</output>
        <button type="button" class="sc-btn" data-sc="1">+1</button>
        <button type="button" class="sc-btn" data-sc="5">+5</button>
      </div>
      <button type="button" class="link-btn" data-scset>${esc(t('phx.score.set'))}</button>
      ${others.length ? `<ol class="sc-list">${others.map((o) => `<li>${avatarHTML(o.p, '1.8rem')}<span>${esc(o.p.name)}</span><b>${o.v}</b></li>`).join('')}</ol>` : `<p class="muted small">${esc(t('phx.score.hint'))}</p>`}
    </section>`;
}

async function writeScore(v) {
  const st = inPlay();
  if (!st) return;
  const p = P();
  p.myScore = { [st.playId]: v };
  const out = $('#scNum');
  if (out) { out.textContent = String(v); out.classList.remove('is-bump'); void out.offsetWidth; out.classList.add('is-bump'); }
  try { await C.Net.track(t('phx.score.net'), C.set(room(`scores/${st.playId}/${p.uid}`), v)); } catch (err) { toast(C.explainError(err), 'error'); }
}

document.addEventListener('click', (e) => {
  if (!C) return;
  const b = e.target.closest('[data-sc]');
  if (b) {
    const st = inPlay();
    if (!st) return;
    const cur = P().myScore?.[st.playId] ?? P().scores?.[st.playId]?.[P().uid] ?? 0;
    writeScore(Math.max(-99999, Math.min(999999, cur + Number(b.dataset.sc))));
    return;
  }
  if (e.target.closest('[data-scset]')) {
    const st = inPlay();
    if (!st) return;
    const cur = P().myScore?.[st.playId] ?? P().scores?.[st.playId]?.[P().uid] ?? 0;
    const v = prompt(t('phx.score.prompt'), String(cur));
    if (v === null) return;
    const n = Math.round(Number(String(v).replace(',', '.')));
    if (!Number.isFinite(n)) { toast(t('phx.score.nan'), 'warn'); return; }
    writeScore(Math.max(-99999, Math.min(999999, n)));
  }
});

// ---------------------------------------------------------------------------
// Quiz del gruppo (foglio sopra qualsiasi schermata)
// ---------------------------------------------------------------------------

const OPT_COLORS = ['#FF5A4E', '#4D96FF', '#FFC93C', '#8AC926'];
const OPT_SHAPES = ['▲', '◆', '●', '■'];

export const QuizPhone = {
  el: null,
  sync() {
    const q = P().quiz;
    const me = P().players?.[P().uid];
    if (!q?.id || !me || me.away) { this.close(); return; }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'quiz-sheet';
      this.el.setAttribute('role', 'dialog');
      this.el.setAttribute('aria-label', t('phx.quiz.aria'));
      document.body.appendChild(this.el);
      this.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-qa]');
        if (b) this.answer(Number(b.dataset.qa));
      });
    }
    const mine = P().quizAns?.[q.id]?.[P().uid];
    const sig = JSON.stringify([q.id, q.open, q.correct, q.done, mine, P().quizScore?.[P().uid]]);
    if (sig === this.sig) return;
    this.sig = sig;
    const score = Number(P().quizScore?.[P().uid]) || 0;
    if (q.done) {
      const rows = activePlayers(P().players).map((p) => ({ p, v: Number(P().quizScore?.[p.uid]) || 0 })).sort((a, b) => b.v - a.v);
      const top = rows[0]?.v || 0;
      this.el.innerHTML = `<div class="qs-in"><p class="qs-kicker">${esc(t('phx.quiz.done'))}</p><h2>${esc(t('phx.quiz.points', { n: score }))}</h2>
        <ol class="qz-rank qz-rank--phone">${rows.map((r) => `<li class="${r.v === top && top ? 'is-top' : ''}">${avatarHTML(r.p, '2.2rem')}<span>${esc(r.p.name)}</span><b>${r.v}</b></li>`).join('')}</ol>
        <p class="muted small">${esc(t('phx.quiz.watch'))}</p></div>`;
      if (top && rows.some((r) => r.v === top && r.p.uid === P().uid) && !this.party) { this.party = true; confettiBurst(110, 'rain'); }
      return;
    }
    this.party = false;
    const answered = typeof mine === 'number';
    const revealed = q.open === false && typeof q.correct === 'number';
    this.el.innerHTML = `
      <div class="qs-in">
        <p class="qs-kicker">${esc(`${t('phx.quiz.head', { n: String(Number(q.n) || ''), total: String(Number(q.total) || '') })} · ${t('phx.quiz.points', { n: score })}`)}</p>
        <h2 class="qs-q">${esc(q.q)}</h2>
        <div class="qs-opts">${(Array.isArray(q.options) ? q.options : []).map((o, i) => `
          <button type="button" class="qs-opt ${revealed ? (i === q.correct ? 'is-right' : 'is-wrong') : ''} ${mine === i ? 'is-mine' : ''}" data-qa="${i}" style="--oc:${OPT_COLORS[i]}" ${answered || !q.open ? 'disabled' : ''}>
            <span class="qz-shape" aria-hidden="true">${OPT_SHAPES[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
        <p class="qs-state" aria-live="polite">${esc(t(revealed ? (mine === q.correct ? 'phx.quiz.right' : answered ? 'phx.quiz.wrong' : 'phx.quiz.missed') : answered ? 'phx.quiz.sent' : 'phx.quiz.tap'))}</p>
      </div>`;
    if (revealed && mine === q.correct) buzz([20, 40, 20]);
  },
  async answer(i) {
    const q = P().quiz;
    if (!q?.open || typeof P().quizAns?.[q.id]?.[P().uid] === 'number') return;
    buzz(12);
    P().quizAns = { ...(P().quizAns || {}), [q.id]: { ...(P().quizAns?.[q.id] || {}), [P().uid]: i } };
    this.sig = '';
    this.sync();
    try { await C.set(room(`quizAns/${q.id}/${P().uid}`), i); } catch (err) { toast(C.explainError(err), 'error'); }
  },
  close() { this.el?.remove(); this.el = null; this.sig = ''; }
};

// ---------------------------------------------------------------------------
// Profilo: figurina, album, rivalità, stagione, invito .ics
// ---------------------------------------------------------------------------

export function cardSectionHTML(me) {
  const key = personKey(me);
  const nights = P().nights || {};
  const card = playerCard(nights, key, P().library);
  if (!card.nights) return `<h2>${esc(t('phx.card.title'))}</h2><p class="muted">${esc(t('phx.card.empty'))}</p>`;
  // Album: chi ha giocato almeno una volta con te la trovi, gli altri sono "da trovare"
  const people = {};
  const met = new Set();
  for (const n of Object.values(nights)) {
    for (const [k, pp] of Object.entries(n?.people || {})) {
      people[k] ||= pp.name;
      if (k === key) for (const w of Object.keys(pp.with || {})) met.add(w);
    }
  }
  const others = Object.entries(people).filter(([k]) => k !== key);
  const found = others.filter(([k]) => met.has(k)).length;
  const findPlayer = (k, name) => Object.values(P().players || {}).find((p) => personKey(p) === k) || { name };
  return `<h2>${esc(t('phx.card.title'))}</h2>
    <div class="my-card" id="myCardBox">${cardHTML(card, me, { big: true, me: true })}</div>
    <button type="button" class="btn-sec btn-block" id="shareCard">${'📤'} <span>${esc(t('phx.card.share'))}</span></button>
    ${others.length ? `<details class="card-album"><summary>${esc(t('phx.card.album', { found, total: others.length }))}</summary>
      <div class="gcards gcards--mini">${others.map(([k, name]) => cardHTML(playerCard(nights, k, P().library), findPlayer(k, name), { owned: met.has(k) })).join('')}</div></details>` : ''}`;
}

export function bindCardSection(box, me) {
  if (!box) return;
  bindTilt(box);
  $('#shareCard', box)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const card = playerCard(P().nights || {}, personKey(me), P().library);
      const blob = await renderCardImage(card, me, P().meta?.groupName || '');
      await C.shareOrDownload(blob, `figurina_${card.name}.png`, t('phx.card.shareText', { level: card.level, rarity: card.rarity.label }));
    } catch (err) { console.error(err); toast(t('phx.card.fail'), 'error'); }
    btn.disabled = false;
  });
}

export function rivalsSectionHTML(me) {
  const r = rivalsOf(P().nights || {}, personKey(me));
  if (!r.list.length) return `<h2>${esc(t('phx.rivals.title'))}</h2><p class="muted">${esc(t('phx.rivals.empty'))}</p>`;
  const row = (x) => `<li><span class="rv-n">${esc(x.name)}</span><b class="rv-s ${x.won > x.lost ? 'is-up' : x.won < x.lost ? 'is-down' : ''}">${x.won}–${x.lost}</b><small>${esc(t('phx.rivals.games', { n: x.games }))}</small></li>`;
  return `<h2>${esc(t('phx.rivals.title'))}</h2>
    ${r.nemesis ? `<p class="stats-line">😈<span>${t('phx.rivals.nemesis', { name: esc(r.nemesis.name), n: r.nemesis.lost, won: r.nemesis.won })}</span></p>` : ''}
    ${r.victim ? `<p class="stats-line">😎<span>${t('phx.rivals.victim', { name: esc(r.victim.name), won: r.victim.won, lost: r.victim.lost })}</span></p>` : ''}
    <ul class="rv-list">${r.list.slice(0, 8).map(row).join('')}</ul>`;
}

export function seasonLineHTML(me) {
  const key = personKey(me);
  const s = seasonTables(P().nights || {}).find((x) => x.id === seasonOf(Date.now()).id);
  const row = s?.rows.find((r) => r.key === key);
  const past = seasonTables(P().nights || {}).filter((x) => x.done && x.champion.some((c) => c.key === key)).map((x) => x.name);
  if (!row && !past.length) return '';
  return `${row ? `<p class="stats-line">🏆<span>${t('phx.season.line', { name: esc(s.name), rank: row.rank, points: row.points, total: s.rows.length })}</span></p>` : ''}
    ${past.length ? `<p class="stats-line">👑<span>${t('phx.season.won', { list: esc(past.join(', ')) })}</span></p>` : ''}`;
}

/** Pulsante "aggiungi al calendario" per la prossima serata. */
export function icsButtonHTML(next) {
  return next?.at ? `<button type="button" class="btn-sec btn-sec--sm" data-ics>📅 <span>${esc(t('phx.ics.add'))}</span></button>` : '';
}

document.addEventListener('click', (e) => {
  if (!C || !e.target.closest('[data-ics]')) return;
  const nx = P().next;
  if (!nx?.at) return;
  const url = publicUrl('play.html');
  url.search = '';
  downloadFile(`gamenight_${new Date(Number(nx.at)).toISOString().slice(0, 10)}.ics`, nextNightICS({ at: nx.at, place: nx.place, note: nx.note, group: P().meta?.groupName || 'Game Night', url: url.href }), 'text/calendar');
});

