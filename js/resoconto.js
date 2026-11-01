// Resoconto della serata: giochi, voti, vincitori e premi, consultabile anche dopo aver lasciato la stanza.
// Legge i dati veri della stanza (rooms/<codice>); se la stanza è stata cancellata usa il riassunto
// salvato nel gruppo (groups/<gruppo>/nights/<codice>), dichiarando che è un riassunto.
// Non inventa niente: i giochi senza voti, le votazioni non chiuse e quelli annullati sono indicati come tali.
import { isConfigured, connect, useSession, roomRef, groupRef, get, explainError } from './fb.js';
import { $, esc, fmt, param, normalizeCode, applyTheme, registerSW, showFatal, showNotConfigured, ErrLog, gameImageHTML, installImageFallback } from './util.js';
import { avatarHTML } from './avatars.js';
import { buildBoard, buildAwards, gameStats, verdict, activeCriteria, nightSummary, customAwardList } from './stats.js';
import { nightStory, storyText } from './insights.js';
import { t, fmtDate, fmtList, langToggleHTML } from './i18n.js';
import { isApp } from './native.js';
import { exportReport } from './report.js';
import { Person } from './person.js';
import { isNightCreator, deleteNight } from './nights.js';
import { fixFormHTML, fixesHTML, bindFixForm } from './night-fix.js';

// Aperto dalla TV (&s=regia): stessa sessione della regia, così chi ha creato la serata è riconosciuto.
if (new URLSearchParams(location.search).get('s') === 'regia') useSession('regia');
ErrLog.install();
applyTheme();
registerSW();
installImageFallback();
const app = $('#app');

const when = (ts) => (ts ? fmtDate(ts, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
const nameOf = (players, uid) => players?.[uid]?.name || t('report.rs.exPlayer');
let pdfData = null; // dati del resoconto per il PDF dell'app Android (lì window.print non esiste)
let me = { uid: '', pid: '' }; // questo dispositivo e il suo profilo personale (per "Elimina la serata")
let target = null; // { code, gid, owner } della serata mostrata
let story = { summary: null, withQuotes: true }; // racconto della serata (1.12, idea 39)

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  const code = normalizeCode(param('room'));
  if (code.length !== 4) { showFatal(app, t('report.rs.notFound'), t('report.rs.noCode')); return; }
  app.innerHTML = `<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>${esc(t('report.rs.loading'))}</p></div>`;
  try {
    me.uid = await connect();
    Person.uid = me.uid;
    await Person.load().catch(() => null);
    me.pid = Person.data?.pid || '';
    const room = (await get(roomRef(code))).val();
    if (room?.meta) { target = { code, gid: room.meta.groupId || '', owner: room.meta }; renderRoom(code, room); return; }
    // Stanza cancellata: riassunto salvato nel gruppo (se c'era un gruppo).
    const gid = normalizeCode(param('g'), 6) || (JSON.parse(localStorage.getItem('gnr_history') || '[]').find((n) => n.room === code)?.gid || '');
    const night = gid ? (await get(groupRef(gid, `nights/${code}`)).catch(() => null))?.val() : null;
    if (night) { target = { code, gid, owner: night }; renderSummary(code, night); return; }
    showFatal(app, t('report.rs.unavailable'), t('report.rs.gone', { code }));
  } catch (err) {
    showFatal(app, t('report.rs.readFailed'), explainError(err));
  }
}

function head(code, title, sub, status) {
  return `
    <header class="ph-top rs-top">
      <a class="btn-sec btn-sec--sm ph-back" href="index.html" aria-label="${esc(t('report.rs.homeAria'))}">←</a>
      <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span class="ph-right">${langToggleHTML()}<button type="button" class="btn-sec btn-sec--sm" id="rsPrint">${isApp() ? `📄 <span>${esc(t('report.rs.pdf'))}</span>` : `🖨️ <span>${esc(t('report.rs.print'))}</span>`}</button></span>
    </header>
    <section class="rs-hero">
      <p class="rs-kicker">${esc(t('report.rs.kicker', { code: String(code) }))}</p>
      <h1 class="ph-title">${esc(title)}</h1>
      <p class="muted">${esc(sub)}</p>
      ${status ? `<p class="rs-status">${status}</p>` : ''}
    </section>`;
}

function renderRoom(code, r) {
  const meta = r.meta || {};
  const players = r.players || {};
  const games = r.games || {};
  const votes = r.votes || {};
  const state = r.state || {};
  const board = buildBoard(games, votes);
  const awards = buildAwards(board, votes, players);
  const ended = state.phase === 'awards';
  const crit = activeCriteria(meta.voting);
  const ordered = Object.entries(games).map(([id, g]) => ({ id, ...g })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const trash = Object.entries(r.trash || {}).map(([id, x]) => ({ id, ...(x?.game || {}), nv: Object.keys(x?.votes || {}).length }));
  const nPlayers = Object.keys(players).length;
  const nVotes = board.reduce((a, b) => a + b.stats.n, 0);
  const status = esc(ended
    ? (Object.values(games).some((g) => g?.closedEarly) ? t('report.rs.endedEarly') : t('report.rs.ended'))
    : t('report.rs.live'));
  const rankBy = Object.fromEntries(board.map((b) => [b.id, b]));
  const custom = customAwardList(r.customAwards).filter((a) => players[a.uid]).map((a) => ({ title: `${a.e || '🎖️'} ${a.t}`, who: nameOf(players, a.uid), value: t('report.rs.customAward') }));
  pdfData = roomPdfData(meta, players, games, board, awards, ended, crit);
  if (ended) pdfData.awards.push(...custom);
  story.summary = board.length ? nightSummary(board, players, meta, awards) : null;
  const tie = (b) => board.filter((x) => x.rank === b.rank).length > 1;

  app.innerHTML = `
    <main class="phone rs">
      ${head(code, meta.groupName || t('report.rs.theNight'), `${when(meta.createdAt)} · ${t('report.rs.players', { n: nPlayers })} · ${t('report.rs.gamesVoted', { n: board.length })} · ${t('report.rs.votes', { n: nVotes })}`, status)}
      ${meta.demo ? `<p class="arm-ro">${esc(t('report.rs.demo'))}</p>` : ''}
      ${storyHTML()}
      <section class="card ph-card rs-board-card">
        <h2>${esc(t('report.rs.board'))}</h2>
        ${board.length ? `<ol class="rs-board">${board.map((b) => `
          <li><span class="rs-rank">${b.rank}${tie(b) ? `<small>${esc(t('report.rs.tie'))}</small>` : ''}</span>${gameImageHTML(b, 'game-img--thumb')}<span class="rs-name"><b>${esc(b.name)}</b><small>${esc(t('report.rs.votes', { n: b.stats.n }))}${b.closedEarly ? ` · ${esc(t('report.rs.closedEarly'))}` : ''}</small></span><span class="rs-avg">${fmt(b.stats.avg)}</span></li>`).join('')}</ol>`
          : `<p class="muted">${esc(t('report.rs.noBoard'))}</p>`}
      </section>
      <h2 class="rs-sec">${esc(t('report.rs.byGame'))}</h2>
      <div class="rs-games">${ordered.length ? ordered.map((g) => gameCard(g, rankBy[g.id], votes[g.id] || {}, players, crit, tie, g.scores)).join('') : `<p class="muted">${esc(t('report.rs.noGames'))}</p>`}</div>
      ${trash.length ? `<section class="card ph-card rs-trash"><h2>${esc(t('report.rs.trash'))}</h2><ul class="rs-list">${trash.map((x) => `<li>${x.nv ? t('report.rs.trashVotes', { name: esc(x.name || t('report.rs.game')), n: x.nv }) : t('report.rs.trashNoVotes', { name: esc(x.name || t('report.rs.game')) })}</li>`).join('')}</ul></section>` : ''}
      ${(awards.length || custom.length) && ended ? `<section class="card ph-card rs-awards"><h2>${esc(t('report.rs.awards'))}</h2><ul class="rs-list">${awards.map((a) => `<li><b>${esc(a.title)}</b>: ${esc(a.game ? a.game.name : fmtList((a.players || []).map((p) => p.name)))} <span class="muted">(${esc(a.value || '')})</span></li>`).join('')}${custom.map((a) => `<li><b>${esc(a.title)}</b>: ${esc(a.who)} <span class="muted">(${esc(a.value)})</span></li>`).join('')}</ul></section>` : ''}
      <section class="card ph-card rs-players"><h2>${esc(t('report.rs.who'))}</h2><div class="rs-people">${Object.entries(players).map(([uid, p]) => `<span class="rs-person">${avatarHTML(p, '2.2rem')}<span>${esc(p.name)}</span></span>`).join('') || '<span class="muted">—</span>'}</div></section>
      <p class="muted small center rs-note">${esc(t('report.rs.note'))}</p>
      ${deleteHTML()}
      <a class="btn-sec btn-block rs-home" href="index.html">${esc(t('report.rs.backHome'))}</a>
    </main>`;
  bind();
}

/** Stessi dati del PDF della TV (report.js), presi dalla stanza. Le foto restano nell'album del gruppo. */
function roomPdfData(meta, players, games, board, awards, ended, crit) {
  const quotes = [];
  for (const b of board) for (const v of b.stats.list || []) if (v.comment) quotes.push({ name: nameOf(players, v.uid), game: b.name, text: String(v.comment).slice(0, 200) });
  const mins = board.reduce((a, b) => a + (Number(games[b.id]?.playedMin) || 0), 0);
  return {
    group: meta.groupName || '', color: meta.color || '', date: when(meta.createdAt), at: meta.createdAt,
    facts: [t('report.rs.gamesVoted', { n: board.length }), t('report.rs.players', { n: Object.keys(players).length }), mins ? t('report.rs.minutes', { n: mins }) : ''].filter(Boolean).join(' · '),
    rows: board.map((b) => ({
      rank: b.rank, name: b.name, avg: b.stats.avg, n: b.stats.n,
      crit: b.quick ? {} : Object.fromEntries(crit.map((c) => [c.short || c.label, b.stats.crit?.[c.key] ?? null])),
      mvp: (b.stats.mvp?.winners || []).map((u) => nameOf(players, u)),
      winners: Object.keys(games[b.id]?.winners || {}).map((u) => nameOf(players, u)),
      minutes: games[b.id]?.playedMin || null, audience: b.stats.audience?.n ? b.stats.audience.avg : null, consensus: b.stats.consensus ?? null
    })),
    awards: ended ? awards.filter((a) => a.kind !== 'ach').map((a) => ({ title: a.title, who: a.game ? a.game.name : fmtList((a.players || []).map((p) => p.name)), value: a.value })) : [],
    achievements: ended ? awards.filter((a) => a.kind === 'ach').map((a) => ({ title: a.title, who: fmtList((a.players || []).map((p) => p.name)) })) : [],
    quotes: quotes.slice(0, 20), photos: [], next: ''
  };
}

function gameCard(g, b, votes, players, crit, tie, scores) {
  const st = gameStats(votes, g.players);
  const all = Object.entries(votes).filter(([, v]) => typeof v?.overall === 'number');
  let state;
  if (g.status === 'voting') state = `<p class="rs-warn">${esc(t('report.rs.votingOpen', { n: all.length }))}</p>`;
  else if (!b) state = `<p class="rs-warn">${esc(t('report.rs.noVotes'))}</p>`;
  else state = `<p><b>${esc(t(tie(b) ? 'report.rs.placeTie' : 'report.rs.place', { n: b.rank }))}</b> · ${t('report.rs.avg', { avg: fmt(st.avg) })} · ${esc(verdict(st))}${st.consensus !== null ? ` · ${esc(t('report.rs.consensus', { n: st.consensus }))}` : ''}</p>`;
  const winners = Object.keys(g.winners || {}).map((u) => nameOf(players, u));
  const mvp = st.mvp.winners.map((u) => `${nameOf(players, u)} (${st.mvp.top})`);
  const critRow = b ? crit.filter((c) => st.crit[c.key] !== null && st.crit[c.key] !== undefined).map((c) => `<span class="rs-chip" style="--cc:${c.color}">${esc(c.short)} ${fmt(st.crit[c.key])}/5</span>`).join('') : '';
  return `
    <section class="card ph-card rs-game">
      <div class="rs-game-head">${gameImageHTML(g, 'game-img--thumb')}<div><h3>${esc(g.name || t('report.rs.game'))}</h3>${g.playedMin ? `<small class="muted">${esc(t('report.rs.minutes', { n: g.playedMin }))}</small>` : ''}</div></div>
      ${state}
      ${winners.length ? `<p>${t('report.rs.won', { names: esc(winners.join(', ')) })}</p>` : `<p class="muted small">${esc(t('report.rs.noWinner'))}</p>`}
      ${critRow ? `<div class="rs-chips">${critRow}</div>` : ''}
      ${mvp.length ? `<p>⭐ MVP: ${esc(mvp.join(', '))}</p>` : ''}
      ${all.length ? `<details class="hub-details"><summary>${esc(t('report.rs.votesList', { n: all.length }))}</summary><ul class="rs-votes">${all.sort((x, y) => y[1].overall - x[1].overall).map(([uid, v]) => `<li><span>${esc(nameOf(players, uid))}${g.players && Object.keys(g.players).length && !g.players[uid] ? ` <small class="muted">${esc(t('report.rs.audience'))}</small>` : ''}</span><b>${v.overall}</b>${v.comment ? `<em>“${esc(String(v.comment).slice(0, 80))}”</em>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${scoresHTML(scores, players)}
      ${st.oracle && b ? `<p class="small">${esc(t('report.rs.oracle', { names: st.oracle.winners.map((w) => nameOf(players, w.uid)).join(', ') }))}</p>` : ''}
    </section>`;
}

/** Punti del segnapunti di quella partita (scores/<partita>/<giocatore>). */
function scoresHTML(scores, players) {
  const rows = Object.entries(scores || {}).map(([uid, v]) => ({ name: nameOf(players, uid), pts: Number(v) })).filter((x) => Number.isFinite(x.pts));
  if (!rows.length) return '';
  rows.sort((a, b) => b.pts - a.pts);
  return `<p class="small">${t('report.rs.scores', { list: rows.map((x) => `${esc(x.name)} <b>${x.pts}</b>`).join(' · ') })}</p>`;
}

/** Stanza cancellata: il riassunto salvato nel gruppo (meno dettagli, ma veri). */
function renderSummary(code, n) {
  const sumRows = Object.values(n.games || {}).filter((g) => g.n > 0).map((g) => ({ ...g, avg: g.sum / g.n })).sort((a, b) => b.avg - a.avg);
  const custom = Object.values(n.custom || {}).filter((a) => a?.t).map((a) => ({ title: `${a.e || '🎖️'} ${a.t}`, who: a.name || '', value: t('report.rs.customAward') }));
  pdfData = { group: n.groupName || n.group || '', at: n.at, date: when(n.at), facts: t('report.rs.summary'), rows: sumRows.map((g, i) => ({ rank: i + 1, name: g.name, avg: g.avg, n: g.n, crit: {}, mvp: [], winners: [], minutes: null, audience: null, consensus: null })), awards: custom, achievements: [], quotes: [], photos: [], next: '' };
  story.summary = n;
  const games = Object.values(n.games || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = games.filter((g) => g.n > 0).map((g) => ({ ...g, avg: g.sum / g.n })).sort((a, b) => b.avg - a.avg);
  app.innerHTML = `
    <main class="phone rs">
      ${head(code, n.groupName || n.group || t('report.rs.theNight'), when(n.at), esc(t('report.rs.summary')))}
      ${storyHTML()}
      <section class="card ph-card"><h2>${esc(t('report.rs.board'))}</h2>
        ${rows.length ? `<ol class="rs-board">${rows.map((g, i) => `<li><span class="rs-rank">${i + 1}</span><span class="rs-name"><b>${esc(g.name)}</b><small>${esc(t('report.rs.votes', { n: g.n }))}</small></span><span class="rs-avg">${fmt(g.avg)}</span></li>`).join('')}</ol>` : `<p class="muted">${esc(t('report.rs.noneVoted'))}</p>`}
      </section>
      ${custom.length ? `<section class="card ph-card rs-awards"><h2>${esc(t('report.rs.awards'))}</h2><ul class="rs-list">${custom.map((a) => `<li><b>${esc(a.title)}</b>: ${esc(a.who)}</li>`).join('')}</ul></section>` : ''}
      ${target && isNightCreator(target.owner, me.uid, me.pid) ? fixFormHTML(n) : fixesHTML(n) ? `<section class="card ph-card">${fixesHTML(n)}</section>` : ''}
      ${deleteHTML()}
      <a class="btn-sec btn-block" href="index.html">${esc(t('report.rs.backHome'))}</a>
    </main>`;
  bind();
  // 2.1 (idea 9): correzione del riassunto da parte di chi ha creato la serata, con motivo e cronologia
  bindFixForm(app, {
    groupId: target?.gid, code, night: n, explainError,
    onDone: async () => { const fresh = (await get(groupRef(target.gid, `nights/${code}`)).catch(() => null))?.val(); if (fresh) { target.owner = fresh; renderSummary(code, fresh); } }
  });
}

/** Racconto della serata in poche frasi, solo da dati veri; i commenti dei giocatori si possono escludere. */
function storyLines() {
  return story.summary ? storyText(nightStory(story.summary, { withQuotes: story.withQuotes })) : [];
}

function storyHTML() {
  const lines = storyLines();
  if (pdfData) pdfData.story = lines;
  if (!lines.length) return '';
  const hasQuotes = Boolean(story.summary?.quotes?.length);
  return `<section class="card ph-card rs-story" id="rsStory">
      <h2>📖 ${esc(t('story.title'))}</h2>
      <p>${lines.map(esc).join(' ')}</p>
      ${hasQuotes ? `<label class="check"><input type="checkbox" id="rsQuotes" ${story.withQuotes ? 'checked' : ''}><span>${esc(t('story.withQuotes'))}</span></label>` : ''}
    </section>`;
}

function bindStory() {
  $('#rsStory')?.addEventListener('change', (e) => {
    if (e.target.id !== 'rsQuotes') return;
    story.withQuotes = e.target.checked;
    if (pdfData && !story.withQuotes) pdfData.quotesBackup ||= pdfData.quotes;
    if (pdfData) pdfData.quotes = story.withQuotes ? (pdfData.quotesBackup || pdfData.quotes) : [];
    $('#rsStory').outerHTML = storyHTML();
    bindStory();
  });
}

/** "Elimina la serata": solo sul dispositivo (o profilo) di chi l'ha creata. Le regole lo garantiscono comunque. */
function deleteHTML() {
  if (!target || !isNightCreator(target.owner, me.uid, me.pid)) return '';
  return `<section class="card ph-card rs-danger">
      <h2>🗑️ ${esc(t('report.del.title'))}</h2>
      <p class="muted small">${esc(t('report.del.lead'))}</p>
      <button type="button" class="btn-sec btn-block am-danger" id="rsDelete">${esc(t('report.del.btn'))}</button>
      <p class="form-error" id="rsDelErr" role="alert"></p>
    </section>`;
}

async function askDelete() {
  const { code, gid } = target;
  const word = prompt(t('report.del.confirm', { code }));
  if (word === null) return;
  if (word.trim().toUpperCase() !== code) { $('#rsDelErr').textContent = t('report.del.wrongCode'); return; }
  const btn = $('#rsDelete');
  btn.disabled = true;
  try {
    await deleteNight(code, gid);
    app.innerHTML = `<main class="phone rs"><section class="card ph-card rs-deleted"><h1 class="ph-title">✅ ${esc(t('report.del.done'))}</h1><p class="muted">${esc(t('report.del.doneText', { code }))}</p><a class="btn btn-block" href="index.html">${esc(t('report.rs.backHome'))}</a></section></main>`;
  } catch (err) {
    btn.disabled = false;
    $('#rsDelErr').textContent = /permission/i.test(String(err?.code || err?.message || '')) ? t('report.del.denied') : explainError(err);
  }
}

function bind() {
  $('#rsDelete')?.addEventListener('click', askDelete);
  bindStory();
  $('#rsPrint')?.addEventListener('click', () => {
    if (isApp()) {
      // Nell'app non c'è la stampa: PDF vero (con i dati della stanza) o, per il riassunto, la stampa non serve.
      if (pdfData) exportReport(pdfData);
      return;
    }
    document.querySelectorAll('.rs details').forEach((d) => { d.open = true; });
    window.print();
  });
}

boot();
