// Resoconto della serata: giochi, voti, vincitori e premi, consultabile anche dopo aver lasciato la stanza.
// Legge i dati veri della stanza (rooms/<codice>); se la stanza è stata cancellata usa il riassunto
// salvato nel gruppo (groups/<gruppo>/nights/<codice>), dichiarando che è un riassunto.
// Non inventa niente: i giochi senza voti, le votazioni non chiuse e quelli annullati sono indicati come tali.
import { isConfigured, connect, roomRef, groupRef, get, explainError } from './fb.js';
import { $, esc, fmt, param, normalizeCode, applyTheme, registerSW, showFatal, showNotConfigured, ErrLog, gameImageHTML, installImageFallback } from './util.js';
import { avatarHTML } from './avatars.js';
import { buildBoard, buildAwards, gameStats, verdict, activeCriteria } from './stats.js';

ErrLog.install();
applyTheme();
registerSW();
installImageFallback();
const app = $('#app');

const when = (t) => (t ? new Date(t).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
const nameOf = (players, uid) => players?.[uid]?.name || 'Ex giocatore';

async function boot() {
  if (!isConfigured) { showNotConfigured(app); return; }
  const code = normalizeCode(param('room'));
  if (code.length !== 4) { showFatal(app, 'Resoconto non trovato', 'Manca il codice della serata.'); return; }
  app.innerHTML = '<div class="loading"><div class="loading-die" aria-hidden="true"><i></i><i></i><i></i></div><p>Preparo il resoconto…</p></div>';
  try {
    await connect();
    const room = (await get(roomRef(code))).val();
    if (room?.meta) { renderRoom(code, room); return; }
    // Stanza cancellata: riassunto salvato nel gruppo (se c'era un gruppo).
    const gid = normalizeCode(param('g'), 6) || (JSON.parse(localStorage.getItem('gnr_history') || '[]').find((n) => n.room === code)?.gid || '');
    const night = gid ? (await get(groupRef(gid, `nights/${code}`)).catch(() => null))?.val() : null;
    if (night) { renderSummary(code, night); return; }
    showFatal(app, 'Resoconto non disponibile', `La serata ${code} non c'è più nel database e non era salvata in un gruppo.`);
  } catch (err) {
    showFatal(app, 'Impossibile leggere la serata', explainError(err));
  }
}

function head(code, title, sub, status) {
  return `
    <header class="ph-top rs-top">
      <a class="btn-sec btn-sec--sm ph-back" href="index.html" aria-label="Home">←</a>
      <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span class="ph-right"><button type="button" class="btn-sec btn-sec--sm" id="rsPrint">🖨️ <span>Stampa</span></button></span>
    </header>
    <section class="rs-hero">
      <p class="rs-kicker">📋 Resoconto della serata · ${esc(code)}</p>
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
  const trash = Object.entries(r.trash || {}).map(([id, t]) => ({ id, ...(t?.game || {}), nv: Object.keys(t?.votes || {}).length }));
  const nPlayers = Object.keys(players).length;
  const nVotes = board.reduce((a, b) => a + b.stats.n, 0);
  const status = ended
    ? (Object.values(games).some((g) => g?.closedEarly) ? '🏁 Serata terminata in anticipo: i dati sono quelli raccolti fino alla chiusura.' : '🏁 Serata terminata.')
    : '⏳ Serata ancora in corso: il resoconto è parziale e si aggiorna ricaricando la pagina.';
  const rankBy = Object.fromEntries(board.map((b) => [b.id, b]));
  const tie = (b) => board.filter((x) => x.rank === b.rank).length > 1;

  app.innerHTML = `
    <main class="phone rs">
      ${head(code, meta.groupName || 'La serata', `${when(meta.createdAt)} · ${nPlayers} ${nPlayers === 1 ? 'giocatore' : 'giocatori'} · ${board.length} ${board.length === 1 ? 'gioco votato' : 'giochi votati'} · ${nVotes} voti`, status)}
      ${meta.demo ? '<p class="arm-ro">🧪 Serata di prova con giocatori finti.</p>' : ''}
      <section class="card ph-card rs-board-card">
        <h2>🏆 Classifica</h2>
        ${board.length ? `<ol class="rs-board">${board.map((b) => `
          <li><span class="rs-rank">${b.rank}${tie(b) ? '<small>pari</small>' : ''}</span>${gameImageHTML(b, 'game-img--thumb')}<span class="rs-name"><b>${esc(b.name)}</b><small>${b.stats.n} ${b.stats.n === 1 ? 'voto' : 'voti'}${b.closedEarly ? ' · votazione chiusa in anticipo' : ''}</small></span><span class="rs-avg">${fmt(b.stats.avg)}</span></li>`).join('')}</ol>`
          : '<p class="muted">Nessun gioco ha ricevuto voti: non c’è una classifica.</p>'}
      </section>
      <h2 class="rs-sec">🎲 Gioco per gioco</h2>
      <div class="rs-games">${ordered.length ? ordered.map((g) => gameCard(g, rankBy[g.id], votes[g.id] || {}, players, crit, tie, g.scores)).join('') : '<p class="muted">Nessun gioco registrato in questa serata.</p>'}</div>
      ${trash.length ? `<section class="card ph-card rs-trash"><h2>🗑️ Giochi annullati</h2><ul class="rs-list">${trash.map((t) => `<li><b>${esc(t.name || 'Gioco')}</b> — annullato${t.nv ? `: ${t.nv} ${t.nv === 1 ? 'voto ricevuto' : 'voti ricevuti'}, non conteggiati` : ', senza voti'}.</li>`).join('')}</ul></section>` : ''}
      ${awards.length && ended ? `<section class="card ph-card rs-awards"><h2>🎖️ Premi speciali</h2><ul class="rs-list">${awards.map((a) => `<li><b>${esc(a.title)}</b>: ${esc(a.game ? a.game.name : (a.players || []).map((p) => p.name).join(' e '))} <span class="muted">(${esc(a.value || '')})</span></li>`).join('')}</ul></section>` : ''}
      <section class="card ph-card rs-players"><h2>👥 Chi c’era</h2><div class="rs-people">${Object.entries(players).map(([uid, p]) => `<span class="rs-person">${avatarHTML(p, '2.2rem')}<span>${esc(p.name)}</span></span>`).join('') || '<span class="muted">—</span>'}</div></section>
      <p class="muted small center rs-note">I voti sono quelli effettivamente inviati dai telefoni. “Pari” indica un pareggio nella media.</p>
      <a class="btn-sec btn-block rs-home" href="index.html">🏠 Torna alla home</a>
    </main>`;
  bind();
}

function gameCard(g, b, votes, players, crit, tie, scores) {
  const st = gameStats(votes, g.players);
  const all = Object.entries(votes).filter(([, v]) => typeof v?.overall === 'number');
  let state;
  if (g.status === 'voting') state = `<p class="rs-warn">🗳️ Votazione non completata: ${all.length} ${all.length === 1 ? 'voto arrivato' : 'voti arrivati'}, non conteggiati in classifica.</p>`;
  else if (!b) state = '<p class="rs-warn">Nessun voto ricevuto: non è in classifica.</p>';
  else state = `<p><b>${b.rank}° posto${tie(b) ? ' (a pari merito)' : ''}</b> · media <b>${fmt(st.avg)}</b> · ${esc(verdict(st))}${st.consensus !== null ? ` · consenso ${st.consensus}%` : ''}</p>`;
  const winners = Object.keys(g.winners || {}).map((u) => nameOf(players, u));
  const mvp = st.mvp.winners.map((u) => `${nameOf(players, u)} (${st.mvp.top})`);
  const critRow = b ? crit.filter((c) => st.crit[c.key] !== null && st.crit[c.key] !== undefined).map((c) => `<span class="rs-chip" style="--cc:${c.color}">${esc(c.short)} ${fmt(st.crit[c.key])}/5</span>`).join('') : '';
  return `
    <section class="card ph-card rs-game">
      <div class="rs-game-head">${gameImageHTML(g, 'game-img--thumb')}<div><h3>${esc(g.name || 'Gioco')}</h3>${g.playedMin ? `<small class="muted">${g.playedMin} minuti di gioco</small>` : ''}</div></div>
      ${state}
      ${winners.length ? `<p>🏆 Ha vinto: <b>${esc(winners.join(', '))}</b></p>` : '<p class="muted small">Vincitore non segnato.</p>'}
      ${critRow ? `<div class="rs-chips">${critRow}</div>` : ''}
      ${mvp.length ? `<p>⭐ MVP: ${esc(mvp.join(', '))}</p>` : ''}
      ${all.length ? `<details class="hub-details"><summary>Voti (${all.length})</summary><ul class="rs-votes">${all.sort((x, y) => y[1].overall - x[1].overall).map(([uid, v]) => `<li><span>${esc(nameOf(players, uid))}${g.players && Object.keys(g.players).length && !g.players[uid] ? ' <small class="muted">(pubblico)</small>' : ''}</span><b>${v.overall}</b>${v.comment ? `<em>“${esc(String(v.comment).slice(0, 80))}”</em>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${scoresHTML(scores, players)}
      ${st.oracle && b ? `<p class="small">🔮 Media indovinata meglio da ${esc(st.oracle.winners.map((w) => nameOf(players, w.uid)).join(', '))}</p>` : ''}
    </section>`;
}

/** Punti del segnapunti di quella partita (scores/<partita>/<giocatore>). */
function scoresHTML(scores, players) {
  const rows = Object.entries(scores || {}).map(([uid, v]) => ({ name: nameOf(players, uid), pts: Number(v) })).filter((x) => Number.isFinite(x.pts));
  if (!rows.length) return '';
  rows.sort((a, b) => b.pts - a.pts);
  return `<p class="small">🧮 Segnapunti: ${rows.map((x) => `${esc(x.name)} <b>${x.pts}</b>`).join(' · ')}</p>`;
}

/** Stanza cancellata: il riassunto salvato nel gruppo (meno dettagli, ma veri). */
function renderSummary(code, n) {
  const games = Object.values(n.games || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = games.filter((g) => g.n > 0).map((g) => ({ ...g, avg: g.sum / g.n })).sort((a, b) => b.avg - a.avg);
  app.innerHTML = `
    <main class="phone rs">
      ${head(code, n.groupName || n.group || 'La serata', when(n.at), '📦 La stanza non c’è più: questo è il riassunto salvato nel gruppo (medie e voti, senza i dettagli di ogni telefono).')}
      <section class="card ph-card"><h2>🏆 Classifica</h2>
        ${rows.length ? `<ol class="rs-board">${rows.map((g, i) => `<li><span class="rs-rank">${i + 1}</span><span class="rs-name"><b>${esc(g.name)}</b><small>${g.n} ${g.n === 1 ? 'voto' : 'voti'}</small></span><span class="rs-avg">${fmt(g.avg)}</span></li>`).join('')}</ol>` : '<p class="muted">Nessun gioco votato.</p>'}
      </section>
      <a class="btn-sec btn-block" href="index.html">🏠 Torna alla home</a>
    </main>`;
  bind();
}

function bind() {
  $('#rsPrint')?.addEventListener('click', () => {
    document.querySelectorAll('.rs details').forEach((d) => { d.open = true; });
    window.print();
  });
}

boot();
