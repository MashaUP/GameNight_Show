// Statistiche e memoria del gruppo sulla TV (1.12): scheda "Analisi" della classifica di sempre
// (idee 8, 37, 41, 44, 45, 46, 48, 49, 50, 71), scheda "Tradizioni" (regole della casa e premi del
// gruppo, idee 23, 24, 68) e pannello dei premi del gruppo a fine serata (idea 23).
//
// I calcoli sono in insights.js e traditions.js (funzioni pure, provate); qui solo le pagine.
// Ogni numero mostrato porta con sé quanti dati lo sostengono (idea 44): "pochi dati" sotto i 3 voti.
import { $, esc, fmt, toast, ICONS, downloadFile, activePlayers, exportName } from './util.js';
import { avatarHTML } from './avatars.js';
import { t, fmtDate } from './i18n.js';
import { customAwardList, cleanAwardTitle, CUSTOM_AWARD_EMOJI, CUSTOM_AWARD_MAX, GAME_MODES, nightsByDate, CRITERIA } from './stats.js';
import {
  confidence, gameSessions, trends, seasonList, compareSeasons, periodRecap, periodBounds, habits, tasteProfile, modeCriteria, groupTimeline,
  collectionReport, statsExport, durationInfo
} from './insights.js';
import { houseList, makeHouseRule, HOUSE_MAX, HOUSE_TEXT_MAX } from './traditions.js';

let C = null;
/** ctx: { S, groupRef, roomRef, set, remove, serverTimestamp, explainError, canWriteGroup(), saveNight(), logEvent() } */
export function bindMemory(ctx) { C = ctx; }
const S = () => C.S;
const fail = (err) => toast(C.explainError(err), 'error');

// ---------------------------------------------------------------------------
// Affidabilità (idea 44)
// ---------------------------------------------------------------------------

/** Etichetta "pochi dati / dati discreti / dati solidi" con il numero di voti. */
export function confBadge(n) {
  const c = confidence(n);
  return `<span class="conf conf--${c}" title="${esc(t('ins.conf.title', { n }))}">${esc(t(`ins.conf.${c}`))}</span>`;
}

// ---------------------------------------------------------------------------
// Scheda "Analisi"
// ---------------------------------------------------------------------------

export const INS_SUBS = ['timeline', 'trends', 'game', 'seasons', 'period', 'habits', 'taste', 'collection', 'export'];
const V = { sub: 'trends', game: '', sa: '', sb: '', pk: 'month', pAt: 0, names: false, xgame: '', from: '', to: '' };

const dayName = (i) => fmtDate(new Date(2024, 0, 1 + i), { weekday: 'short' }); // 1/1/2024 era lunedì
const monthName = (i) => fmtDate(new Date(2024, i, 1), { month: 'short' });
const when = (at) => fmtDate(Number(at), { day: 'numeric', month: 'short', year: 'numeric' });

/** Giochi giocati almeno una volta, dal più frequente: [{ name, nights }]. */
function playedGames() {
  const by = new Map();
  for (const n of nightsByDate(S().nights)) {
    for (const g of Object.values(n.games || {})) {
      if (!g?.name || !g.n) continue;
      const k = g.name.toLowerCase();
      const x = by.get(k) || { name: g.name, nights: 0 };
      x.nights++;
      by.set(k, x);
    }
  }
  return [...by.values()].sort((a, b) => b.nights - a.nights || a.name.localeCompare(b.name));
}

function periodLabel(kind, from) {
  const d = new Date(from);
  if (kind === 'month') return fmtDate(d, { month: 'long', year: 'numeric' });
  if (kind === 'quarter') return t('ins.period.q', { q: Math.floor(d.getMonth() / 3) + 1, y: d.getFullYear() });
  return String(d.getFullYear());
}

function shiftPeriod(kind, at, dir) {
  const d = new Date(at);
  if (kind === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime();
  if (kind === 'quarter') return new Date(d.getFullYear(), d.getMonth() + 3 * dir, 1).getTime();
  return new Date(d.getFullYear() + dir, 0, 1).getTime();
}

/** Riquadri del riepilogo di un periodo o di una stagione. */
function recapCards(r) {
  if (!r.nights) return `<p class="muted">${esc(t('ins.period.none'))}</p>`;
  const item = (label, val) => `<li class="at-row at-row--stack"><span class="muted">${esc(label)}</span><b>${val}</b></li>`;
  return `<ol class="at-list">
    ${item(t('ins.r.nights'), String(r.nights))}
    ${item(t('ins.r.games'), `${r.games} · ${esc(t('ins.r.votes', { n: r.votes }))}`)}
    ${r.minutes ? item(t('ins.r.time'), esc(t('ins.r.hours', { h: fmt(r.minutes / 60) }))) : ''}
    ${r.best ? item(t('ins.r.best'), `${esc(r.best.name)} ${fmt(r.best.avg)} ${confBadge(r.best.n)}`) : ''}
    ${r.most ? item(t('ins.r.most'), `${esc(r.most.name)} · ${esc(t('ins.nNights', { n: r.most.nights }))}`) : ''}
    ${r.winner ? item(t('ins.r.winner'), `${esc(r.winner.name)} · ${esc(t('ins.nWins', { n: r.winner.wins }))}`) : ''}
    ${r.regular ? item(t('ins.r.regular'), `${esc(r.regular.name)} · ${esc(t('ins.nNights', { n: r.regular.nights }))}`) : ''}
  </ol>`;
}

/** Piccolo grafico a linea delle medie serata per serata. */
function sparkSVG(list) {
  if (list.length < 2) return '';
  const W = 560; const H = 160; const P = 34;
  const pts = list.map((s, i) => ({ x: P + (i * (W - 2 * P)) / (list.length - 1), y: H - P - ((s.avg - 1) / 9) * (H - 2 * P), s }));
  return `<svg class="trend trend--sm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ins.game.chart'))}">
    ${[2, 5, 8].map((v) => { const y = H - P - ((v - 1) / 9) * (H - 2 * P); return `<line x1="${P}" x2="${W - P}" y1="${y}" y2="${y}" class="trend-grid"/><text x="${P - 6}" y="${y + 4}" class="trend-axis" text-anchor="end">${v}</text>`; }).join('')}
    <polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" class="trend-line"/>
    ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="6" class="trend-dot ${p.s.few ? 'trend-dot--few' : ''}"/><text x="${p.x}" y="${p.y - 11}" text-anchor="middle" class="trend-val">${fmt(p.s.avg)}</text>`).join('')}
  </svg>`;
}

function subTrends() {
  const list = trends(S().nights);
  if (!list.length) return `<p class="muted">${esc(t('ins.trends.none'))}</p>`;
  return `<ol class="at-list ins-list">${list.slice(0, 10).map((x) => `
    <li class="at-row"><span class="ins-arrow ins-arrow--${x.dir}" aria-hidden="true">${x.dir === 'up' ? '▲' : '▼'}</span>
      <span class="at-name">${esc(x.name)}<small class="muted">${esc(t(x.dir === 'up' ? 'ins.trends.up' : 'ins.trends.down', { from: fmt(x.from), to: fmt(x.to) }))} · ${esc(t('ins.nNights', { n: x.nights }))}</small></span>
      <span class="at-val">${confBadge(Math.min(x.nFrom, x.nTo))}</span></li>`).join('')}</ol>
    <p class="muted small">${esc(t('ins.trends.how'))}</p>`;
}

function subGame() {
  const games = playedGames();
  if (!games.length) return `<p class="muted">${esc(t('ins.none'))}</p>`;
  if (!V.game || !games.some((g) => g.name === V.game)) V.game = games[0].name;
  const list = gameSessions(S().nights, V.game);
  const it = Object.values(S().library || {}).find((x) => x?.name?.toLowerCase() === V.game.toLowerCase());
  const du = it ? durationInfo(it) : null;
  return `
    <div class="ins-picks" role="group" aria-label="${esc(t('ins.game.pick'))}">${games.slice(0, 14).map((g) => `<button type="button" class="chip chip-btn" data-ins-game="${esc(g.name)}" aria-pressed="${g.name === V.game}">${esc(g.name)} <small>${g.nights}</small></button>`).join('')}</div>
    ${sparkSVG(list)}
    <table class="ins-table"><thead><tr><th>${esc(t('ins.game.date'))}</th><th>${esc(t('ins.game.avg'))}</th><th>${esc(t('ins.game.votes'))}</th><th>${esc(t('ins.game.players'))}</th><th>${esc(t('ins.game.minutes'))}</th></tr></thead>
      <tbody>${list.map((s) => `<tr class="${s.few ? 'is-few' : ''}"><td>${esc(when(s.at))}</td><td><b>${fmt(s.avg)}</b></td><td>${s.n} ${s.few ? confBadge(s.n) : ''}</td><td>${s.players}</td><td>${s.minutes ? `${s.minutes}′` : '–'}</td></tr>`).join('')}</tbody></table>
    ${du && (du.declared || du.observed) ? `<p class="muted">${esc(t('ins.game.duration', { declared: du.declared ? `${du.declared}′` : '–', observed: du.observed ? `${du.observed}′` : '–', n: du.n }))}</p>` : ''}
    <p class="muted small">${esc(t('ins.game.few'))}</p>`;
}

function subSeasons() {
  const list = seasonList(S().nights);
  if (list.length < 2) return `<p class="muted">${esc(t('ins.seasons.need'))}</p>`;
  if (!list.some((s) => s.id === V.sa)) V.sa = list[0].id;
  if (!list.some((s) => s.id === V.sb) || V.sb === V.sa) V.sb = list.find((s) => s.id !== V.sa).id;
  const c = compareSeasons(S().nights, V.sa, V.sb);
  const sel = (id, cur) => `<select class="input select input--sm" id="${id}">${list.map((s) => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
  return `
    <div class="ins-two">
      <section class="card stat-card"><h2>${sel('insSa', V.sa)}</h2>${recapCards(c.a)}</section>
      <section class="card stat-card"><h2>${sel('insSb', V.sb)}</h2>${recapCards(c.b)}</section>
    </div>
    ${c.uneven ? `<p class="ins-warn">⚠️ ${esc(t('ins.seasons.uneven', { a: c.a.nights, b: c.b.nights }))}</p>` : ''}`;
}

function subPeriod() {
  if (!V.pAt) V.pAt = nightsByDate(S().nights)[0]?.at || Date.now();
  const { from, to } = periodBounds(V.pk, V.pAt);
  const r = periodRecap(S().nights, from, to);
  return `
    <div class="ins-period">
      <div class="seg" role="group" aria-label="${esc(t('ins.period.kind'))}">${['month', 'quarter', 'year'].map((k) => `<button type="button" data-ins-pk="${k}" aria-pressed="${V.pk === k}">${esc(t(`ins.period.${k}`))}</button>`).join('')}</div>
      <span class="ins-nav"><button type="button" class="btn-sec btn-sec--sm" data-ins-shift="-1" aria-label="${esc(t('ins.period.prev'))}">‹</button><b id="insPeriod">${esc(periodLabel(V.pk, from))}</b><button type="button" class="btn-sec btn-sec--sm" data-ins-shift="1" aria-label="${esc(t('ins.period.next'))}">›</button></span>
    </div>
    <section class="card stat-card stat-card--wide">${recapCards(r)}</section>`;
}

function subHabits() {
  const h = habits(S().nights);
  if (!h.total) return `<p class="muted">${esc(t('ins.none'))}</p>`;
  const max = Math.max(1, ...h.grid.flat());
  const cell = (v) => `<td style="--a:${v ? 0.18 + (0.82 * v) / max : 0}" title="${v}">${v || ''}</td>`;
  const hour = h.hours.indexOf(Math.max(...h.hours));
  return `
    <p class="ins-lead">${esc(t('ins.habits.lead', { day: fmtDate(new Date(2024, 0, 1 + h.topDay), { weekday: 'long' }), month: fmtDate(new Date(2024, h.topMonth, 1), { month: 'long' }), h: String(hour).padStart(2, '0') }))}</p>
    <div class="ins-scroll"><table class="ins-heat"><thead><tr><th></th>${h.months.map((_, i) => `<th>${esc(monthName(i))}</th>`).join('')}<th>Σ</th></tr></thead>
      <tbody>${h.grid.map((row, d) => `<tr><th>${esc(dayName(d))}</th>${row.map(cell).join('')}<td class="ins-sum">${h.days[d]}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">${esc(t('ins.habits.note', { n: h.total }))}</p>`;
}

/** Opportunità B (2.1): la cronologia del gruppo, dal più recente. */
function subTimeline() {
  const ev = groupTimeline(S().nights);
  if (!ev.length) return `<p class="muted">${esc(t('ins.tl.none'))}</p>`;
  const ICO = { first: '🎉', milestone: '🏁', newcomer: '👋', rediscovered: '🔁', record: '🏆', leader: '👑' };
  return `<p class="ins-lead">${esc(t('ins.tl.lead'))}</p><ol class="ins-timeline">${ev.map((e) => `<li><span class="tl-ico" aria-hidden="true">${ICO[e.k] || '•'}</span><span class="tl-when">${esc(fmtDate(e.at || Date.now(), { day: 'numeric', month: 'short', year: 'numeric' }))}</span><span class="tl-text">${esc(t(`ins.tl.k.${e.k}`, { name: e.name || '', prev: e.prev || '', n: e.n || 0, avg: e.avg ? fmt(e.avg) : '', days: e.days || 0 }))}</span></li>`).join('')}</ol>`;
}

function subTaste() {
  const list = tasteProfile(S().nights, S().library);
  if (!list.length) return `<p class="muted">${esc(t('ins.taste.none'))}</p>`;
  const label = (x) => (x.dim === 'mode' ? (GAME_MODES[x.value] || x.value) : t(`ins.taste.${x.dim}.${x.value}`));
  return `<div class="ins-two ins-two--3">${['mode', 'weight', 'length'].map((dim) => {
    const rows = list.filter((x) => x.dim === dim);
    return `<section class="card stat-card"><h2>${esc(t(`ins.taste.${dim}`))}</h2>${rows.length ? `<ol class="at-list">${rows.map((x) => `<li class="at-row"><span class="at-name">${esc(label(x))}<small class="muted">${esc(t('ins.taste.games', { n: x.games }))}</small></span><span class="at-val">${fmt(x.avg)} ${confBadge(x.n)}</span></li>`).join('')}</ol>` : `<p class="muted">${esc(t('ins.few'))}</p>`}</section>`;
  }).join('')}</div>
  ${modeCritHTML()}
  <p class="muted small">${esc(t('ins.taste.how'))}</p>`;
}

/** Idea 7 (2.1): domande per modalità di gioco, ognuna con la sua media e quanto è affidabile. */
function modeCritHTML() {
  const rows = modeCriteria(S().nights, S().library);
  if (!rows.length) return '';
  const crits = CRITERIA.filter((c) => !c.custom);
  const cell = (x, max) => (x ? `${fmt(x.avg)}<small class="muted">/${max}</small> ${confBadge(x.n)}` : '—');
  return `<section class="card stat-card"><h2>${esc(t('ins.mc.title'))}</h2><div class="ins-scroll"><table class="ins-table"><thead><tr><th>${esc(t('ins.taste.mode'))}</th><th>${esc(t('ins.mc.overall'))}</th>${crits.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row">${esc(GAME_MODES[r.mode] || r.mode)}</th><td>${cell(r.overall, 10)}</td>${crits.map((c) => `<td>${cell(r.crit[c.key], 5)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">${esc(t('ins.mc.note'))}</p></section>`;
}

function subCollection() {
  if (!Object.keys(S().library || {}).length) return `<p class="muted">${esc(t('ins.coll.noLib'))}</p>`;
  const r = collectionReport(S().library, S().nights);
  const names = (l, val) => (l.length ? `<ol class="at-list">${l.slice(0, 8).map((x) => `<li class="at-row"><span class="at-name">${esc(x.name)}</span><span class="at-val">${val(x)}</span></li>`).join('')}</ol>${l.length > 8 ? `<p class="muted small">${esc(t('ins.more', { n: l.length - 8 }))}</p>` : ''}` : `<p class="muted">—</p>`);
  return `
    <p class="ins-lead">${esc(t('ins.coll.lead', { total: r.total, played: r.played, pct: r.total ? Math.round((r.played / r.total) * 100) : 0 }))}</p>
    <div class="ins-two ins-two--4">
      <section class="card stat-card"><h2>${esc(t('ins.coll.often'))}</h2>${names(r.often, (x) => esc(t('ins.nNights', { n: x.nights })))}</section>
      <section class="card stat-card"><h2>${esc(t('ins.coll.loved'))}</h2>${names(r.loved, (x) => `${fmt(x.avg)} ${confBadge(x.n)}`)}</section>
      <section class="card stat-card"><h2>${esc(t('ins.coll.dusty'))}</h2>${names(r.dusty, (x) => esc(when(x.last)))}</section>
      <section class="card stat-card"><h2>${esc(t('ins.coll.never'))}</h2>${names(r.never, () => '')}</section>
    </div>
    <p class="muted small">${esc(t('ins.coll.how'))}</p>`;
}

function exportFilters() {
  const day = (v) => (v ? new Date(`${v}T00:00:00`).getTime() : 0);
  return { from: day(V.from), to: V.to ? day(V.to) + 86400000 : 0, game: V.xgame || '', names: V.names };
}

function subExport() {
  const games = playedGames();
  const n = statsExport(S().nights, exportFilters()).rows.length;
  return `
    <form class="ins-export" id="insExport">
      <label><span class="field-label">${esc(t('ins.x.from'))}</span><input class="input input--sm" type="date" id="insFrom" value="${esc(V.from)}"></label>
      <label><span class="field-label">${esc(t('ins.x.to'))}</span><input class="input input--sm" type="date" id="insTo" value="${esc(V.to)}"></label>
      <label><span class="field-label">${esc(t('ins.x.game'))}</span><select class="input select input--sm" id="insXGame"><option value="">${esc(t('ins.x.allGames'))}</option>${games.map((g) => `<option ${g.name === V.xgame ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="insNames" ${V.names ? 'checked' : ''}><span>${esc(t('ins.x.names'))}</span></label>
    </form>
    <p class="ins-lead" id="insCount">${esc(t('ins.x.rows', { n }))}</p>
    <div class="ins-actions"><button type="button" class="btn" data-ins-dl="csv" ${n ? '' : 'disabled'}>⬇️ <span>CSV</span></button><button type="button" class="btn-sec" data-ins-dl="json" ${n ? '' : 'disabled'}>⬇️ <span>JSON</span></button></div>
    <p class="muted small">${esc(t('ins.x.privacy'))}</p>`;
}

/** Contenuto della scheda "Analisi". */
export function insightsHTML() {
  const body = { timeline: subTimeline, trends: subTrends, game: subGame, seasons: subSeasons, period: subPeriod, habits: subHabits, taste: subTaste, collection: subCollection, export: subExport }[V.sub] || subTrends;
  return `
    <nav class="ins-subs" aria-label="${esc(t('ins.subs'))}">${INS_SUBS.map((k) => `<button type="button" data-ins-sub="${k}" aria-pressed="${V.sub === k}">${esc(t(`ins.sub.${k}`))}</button>`).join('')}</nav>
    <div class="ins-body" id="insBody">${body()}</div>`;
}

/** Clic nella scheda: true se gestito (repaint ridisegna la scheda). */
export function insightsClick(e, repaint) {
  const sub = e.target.closest('[data-ins-sub]');
  if (sub) { V.sub = sub.dataset.insSub; repaint(); return true; }
  const g = e.target.closest('[data-ins-game]');
  if (g) { V.game = g.dataset.insGame; repaint(); return true; }
  const pk = e.target.closest('[data-ins-pk]');
  if (pk) { V.pk = pk.dataset.insPk; repaint(); return true; }
  const sh = e.target.closest('[data-ins-shift]');
  if (sh) { V.pAt = shiftPeriod(V.pk, periodBounds(V.pk, V.pAt).from, Number(sh.dataset.insShift)); repaint(); return true; }
  const dl = e.target.closest('[data-ins-dl]');
  if (dl) {
    const x = statsExport(S().nights, exportFilters());
    const name = (ext) => exportName({ group: S().meta?.groupName || '', kind: t('exp.k.stats'), ext });
    if (dl.dataset.insDl === 'csv') downloadFile(name('csv'), `﻿${x.csv}`, 'text/csv');
    else downloadFile(name('json'), x.json, 'application/json');
    toast(t('ins.x.done', { n: x.rows.length }));
    return true;
  }
  return false;
}

/** Cambi nei campi della scheda (stagioni, filtri dell'esportazione). */
export function insightsChange(e, repaint) {
  const id = e.target.id;
  if (id === 'insSa') { V.sa = e.target.value; repaint(); return true; }
  if (id === 'insSb') { V.sb = e.target.value; repaint(); return true; }
  if (['insFrom', 'insTo', 'insXGame', 'insNames'].includes(id)) {
    V.from = $('#insFrom')?.value || '';
    V.to = $('#insTo')?.value || '';
    V.xgame = $('#insXGame')?.value || '';
    V.names = Boolean($('#insNames')?.checked);
    const n = statsExport(S().nights, exportFilters()).rows.length;
    const c = $('#insCount');
    if (c) c.textContent = t('ins.x.rows', { n });
    document.querySelectorAll('[data-ins-dl]').forEach((b) => { b.disabled = !n; });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scheda "Tradizioni": regole della casa e premi del gruppo (idee 23, 24, 68)
// ---------------------------------------------------------------------------

/** Premi del gruppo assegnati nelle serate: [{ t, e, total, people: [{ name, n }] }] dal più assegnato. */
export function customAwardHistory(nights) {
  const by = new Map();
  for (const n of nightsByDate(nights)) {
    for (const a of Object.values(n.custom || {})) {
      if (!a?.t) continue;
      const k = a.t.toLowerCase();
      const x = by.get(k) || { t: a.t, e: a.e || '🎖️', total: 0, people: new Map() };
      x.total++;
      const p = x.people.get(a.k || a.name) || { name: a.name, n: 0 };
      p.n++;
      x.people.set(a.k || a.name, p);
      by.set(k, x);
    }
  }
  return [...by.values()].map((x) => ({ ...x, people: [...x.people.values()].sort((a, b) => b.n - a.n) })).sort((a, b) => b.total - a.total);
}

export function traditionsHTML() {
  const rules = houseList(S().house);
  const can = C.canWriteGroup();
  const games = Object.values(S().library || {}).filter((it) => it?.name && !it.baseId).map((it) => it.name).sort((a, b) => a.localeCompare(b));
  const hist = customAwardHistory(S().nights);
  return `
    <div class="ins-two">
      <section class="card stat-card">
        <h2>📜 ${esc(t('mem.house.title'))}</h2>
        <p class="muted small">${esc(t('mem.house.lead'))}</p>
        ${rules.length ? `<ul class="house-list">${rules.map((r) => `<li class="house-item"><span><b>${esc(r.g || t('mem.house.general'))}</b><span>${esc(r.text)}</span></span>${can ? `<button type="button" class="btn-sec btn-sec--sm am-danger" data-house-rm="${esc(r.id)}" aria-label="${esc(t('mem.house.delete'))}">✕</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${esc(t('mem.house.none'))}</p>`}
        ${can ? `<form class="house-form" id="houseForm">
          <label class="sr-only" for="houseGame">${esc(t('mem.house.game'))}</label>
          <select class="input select input--sm" id="houseGame"><option value="">${esc(t('mem.house.general'))}</option>${games.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
          <label class="sr-only" for="houseText">${esc(t('mem.house.text'))}</label>
          <input class="input input--sm" id="houseText" maxlength="${HOUSE_TEXT_MAX}" placeholder="${esc(t('mem.house.ph'))}">
          <button type="submit" class="btn-sec">➕ <span>${esc(t('mem.house.add'))}</span></button>
        </form>` : `<p class="muted small">${esc(t('mem.house.readOnly'))}</p>`}
      </section>
      <section class="card stat-card">
        <h2>🎖️ ${esc(t('mem.awards.title'))}</h2>
        <p class="muted small">${esc(t('mem.awards.lead'))}</p>
        ${hist.length ? `<ol class="at-list">${hist.map((x) => `<li class="at-row at-row--stack"><b>${esc(x.e)} ${esc(x.t)} <small class="muted">×${x.total}</small></b><span class="muted">${esc(x.people.slice(0, 4).map((p) => (p.n > 1 ? `${p.name} ×${p.n}` : p.name)).join(', '))}</span></li>`).join('')}</ol>` : `<p class="muted">${esc(t('mem.awards.none'))}</p>`}
      </section>
    </div>`;
}

export function traditionsClick(e) {
  const rm = e.target.closest('[data-house-rm]');
  if (!rm) return false;
  if (confirm(t('mem.house.deleteAsk'))) C.remove(C.groupRef(S().meta.groupId, `house/${rm.dataset.houseRm}`)).catch(fail);
  return true;
}

export async function traditionsSubmit(e) {
  if (e.target.id !== 'houseForm') return false;
  e.preventDefault();
  if (houseList(S().house).length >= HOUSE_MAX) { toast(t('mem.house.full', { n: HOUSE_MAX }), 'warn'); return true; }
  let rule;
  try { rule = makeHouseRule($('#houseText').value, $('#houseGame').value); } catch { toast(t('mem.house.needText'), 'warn'); $('#houseText')?.focus(); return true; }
  try {
    await C.set(C.groupRef(S().meta.groupId, `house/h${Date.now().toString(36)}`), rule);
    toast(t('mem.house.saved'));
  } catch (err) { fail(err); }
  return true;
}

// ---------------------------------------------------------------------------
// Premi del gruppo a fine serata (idea 23) — rooms/<codice>/customAwards/<id> = { t, e, uid, at }
// ---------------------------------------------------------------------------

/** Titoli già usati dal gruppo e premio ricorrente del modello (meta/award) per i suggerimenti. */
function awardSuggestions() {
  const out = [];
  const tr = S().meta?.award;
  if (tr?.t) out.push({ t: tr.t, e: tr.e || '🎖️', trad: true });
  for (const x of customAwardHistory(S().nights)) if (!out.some((y) => y.t.toLowerCase() === x.t.toLowerCase())) out.push({ t: x.t, e: x.e });
  return out.slice(0, 8);
}

export const CustomAwardPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S().code) return;
    const sug = awardSuggestions();
    this.emoji = sug[0]?.trad ? sug[0].e : CUSTOM_AWARD_EMOJI[0];
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="caTitle">
        <div class="panel-head"><h2 id="caTitle">🎖️ ${esc(t('mem.ca.title'))}</h2><button type="button" class="icon-btn" id="caClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <p class="panel-note">${esc(t('mem.ca.lead'))}</p>
        <div id="caList"></div>
        <form id="caForm" class="ca-form">
          <label><span class="field-label">${esc(t('mem.ca.name'))}</span><input class="input" id="caName" maxlength="32" list="caSug" placeholder="${esc(t('mem.ca.namePh'))}" value="${esc(sug[0]?.trad ? sug[0].t : '')}"></label>
          <datalist id="caSug">${sug.map((x) => `<option value="${esc(x.t)}">`).join('')}</datalist>
          ${sug.length ? `<div class="ins-picks">${sug.map((x) => `<button type="button" class="chip chip-btn" data-ca-sug="${esc(x.t)}" data-ca-e="${esc(x.e)}">${esc(x.e)} ${esc(x.t)}${x.trad ? ` <small>${esc(t('mem.ca.trad'))}</small>` : ''}</button>`).join('')}</div>` : ''}
          <span class="field-label">${esc(t('mem.ca.icon'))}</span>
          <div class="ca-emoji" role="radiogroup" aria-label="${esc(t('mem.ca.icon'))}">${CUSTOM_AWARD_EMOJI.map((x) => `<button type="button" role="radio" data-ca-emoji="${esc(x)}" aria-checked="${x === this.emoji}">${x}</button>`).join('')}</div>
          <span class="field-label">${esc(t('mem.ca.who'))}</span>
          <div class="ca-who" id="caWho"></div>
          <p class="muted small">${esc(t('mem.ca.guests'))}</p>
          <button type="submit" class="btn btn-big">🎖️ <span>${esc(t('mem.ca.give'))}</span></button>
        </form>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('submit', (e) => { e.preventDefault(); this.give(); });
    this.sig = '';
    this.update();
    $('#caName', el).focus();
  },
  paint() {
    if (!this.el) return;
    const list = customAwardList(S().customAwards);
    const players = activePlayers(S().players).filter((p) => !p.guest);
    const pName = (uid) => S().players?.[uid]?.name || t('report.rs.exPlayer');
    $('#caList', this.el).innerHTML = list.length ? `<ul class="tp-list">${list.map((a) => `<li class="tp-item"><span><b>${esc(a.e || '🎖️')} ${esc(a.t)}</b><small class="muted">${esc(pName(a.uid))}</small></span><span class="tp-acts"><button type="button" class="btn-sec btn-sec--sm am-danger" data-ca-rm="${esc(a.id)}" aria-label="${esc(t('mem.ca.remove', { name: a.t }))}">✕</button></span></li>`).join('')}</ul>` : '';
    const who = $('#caWho', this.el);
    if (!this.uid || !players.some((p) => p.uid === this.uid)) this.uid = '';
    who.innerHTML = players.length ? players.map((p) => `<button type="button" class="ca-person" data-ca-uid="${esc(p.uid)}" aria-pressed="${p.uid === this.uid}">${avatarHTML(p, '3rem')}<span>${esc(p.name)}</span></button>`).join('') : `<p class="muted">${esc(t('mem.ca.nobody'))}</p>`;
    const full = list.length >= CUSTOM_AWARD_MAX;
    const btn = $('#caForm button[type="submit"]', this.el);
    btn.disabled = full || !players.length;
    if (full) btn.title = t('mem.ca.full', { n: CUSTOM_AWARD_MAX });
  },
  click(e) {
    if (e.target === this.el || e.target.closest('#caClose')) { this.close(); return; }
    const em = e.target.closest('[data-ca-emoji]');
    if (em) { this.emoji = em.dataset.caEmoji; this.el.querySelectorAll('[data-ca-emoji]').forEach((b) => b.setAttribute('aria-checked', String(b === em))); return; }
    const sg = e.target.closest('[data-ca-sug]');
    if (sg) {
      $('#caName', this.el).value = sg.dataset.caSug;
      if (CUSTOM_AWARD_EMOJI.includes(sg.dataset.caE)) { this.emoji = sg.dataset.caE; this.el.querySelectorAll('[data-ca-emoji]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.caEmoji === this.emoji))); }
      return;
    }
    const who = e.target.closest('[data-ca-uid]');
    if (who) { this.uid = who.dataset.caUid; this.el.querySelectorAll('[data-ca-uid]').forEach((b) => b.setAttribute('aria-pressed', String(b === who))); return; }
    const rm = e.target.closest('[data-ca-rm]');
    if (rm) { C.remove(C.roomRef(S().code, `customAwards/${rm.dataset.caRm}`)).then(() => C.saveNight()).catch(fail); }
  },
  async give() {
    const title = cleanAwardTitle($('#caName', this.el).value);
    if (!title) { toast(t('mem.ca.needName'), 'warn'); $('#caName', this.el).focus(); return; }
    if (!this.uid) { toast(t('mem.ca.needWho'), 'warn'); return; }
    if (customAwardList(S().customAwards).length >= CUSTOM_AWARD_MAX) { toast(t('mem.ca.full', { n: CUSTOM_AWARD_MAX }), 'warn'); return; }
    const uid = this.uid;
    try {
      await C.set(C.roomRef(S().code, `customAwards/a${Date.now().toString(36)}`), { t: title, e: this.emoji, uid, at: C.serverTimestamp() });
      C.logEvent(t('mem.ca.log', { name: title, who: S().players?.[uid]?.name || '' }), '🎖️');
      this.uid = '';
      if (this.el) { $('#caName', this.el).value = ''; this.sig = ''; this.update(); }
      toast(t('mem.ca.given', { name: title }));
      await C.saveNight();
    } catch (err) { fail(err); }
  },
  update() {
    if (!this.el) return;
    const sig = JSON.stringify([S().customAwards || {}, activePlayers(S().players).map((p) => [p.uid, p.name, p.guest])]);
    if (sig !== this.sig) { this.sig = sig; this.paint(); }
  },
  close() { this.el?.remove(); this.el = null; }
};
