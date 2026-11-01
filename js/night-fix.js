// Correzione guidata del riassunto di una serata chiusa (2.1, idea 9).
//
// Dopo la chiusura il riassunto nel gruppo (groups/<gruppo>/nights/<codice>) è la fonte di classifica di
// sempre, stagioni e statistiche. Prima si poteva solo eliminare tutto o ripristinare un backup. Ora chi ha
// creato la serata (stessa regola dell'eliminazione, controllata anche dalle regole del database) può:
// - correggere il nome di un gioco (errori di battitura: "Dixt" → "Dixit"), che cambia anche la chiave con cui
//   il gioco si unisce agli altri nelle statistiche di sempre;
// - correggere la durata giocata.
// Ogni correzione chiede un motivo e resta nella cronologia della serata (fixes), che non si modifica.
// Voti, persone e premi non si toccano qui: per quelli c'è "Voti dopo la votazione" a serata aperta.
import { groupRef, update, push, serverTimestamp } from './fb.js';
import { dbKey, esc } from './util.js';
import { t, fmtDate } from './i18n.js';

/** Patch per groups/<gruppo>/nights/<codice> (percorsi relativi). Lancia { code } se i dati non vanno bene. */
export function fixPatch(night, gameId, { name, playedMin, why }) {
  const g = night?.games?.[gameId];
  if (!g) throw Object.assign(new Error('game'), { code: 'game' });
  const reason = String(why || '').replace(/[<>]/g, '').trim().slice(0, 120);
  if (reason.length < 3) throw Object.assign(new Error('why'), { code: 'why' });
  const out = {};
  const what = [];
  const nm = String(name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (nm && nm !== g.name) {
    out[`games/${gameId}/name`] = nm;
    out[`games/${gameId}/key`] = dbKey(nm);
    what.push(`${g.name} → ${nm}`);
  }
  if (playedMin !== undefined && playedMin !== null && playedMin !== '') {
    const m = Math.round(Number(playedMin));
    if (!Number.isFinite(m) || m < 1 || m > 600) throw Object.assign(new Error('min'), { code: 'min' });
    if (m !== Number(g.playedMin)) { out[`games/${gameId}/playedMin`] = m; what.push(`${g.playedMin || '—'}′ → ${m}′`); }
  }
  if (!what.length) throw Object.assign(new Error('same'), { code: 'same' });
  return { patch: out, entry: { gid: String(gameId).slice(0, 40), what: what.join(' · ').slice(0, 80), why: reason } };
}

/** Applica la correzione e la registra (tutto in un aggiornamento). */
export async function applyFix(groupId, code, night, gameId, input) {
  const { patch, entry } = fixPatch(night, gameId, input);
  const id = push(groupRef(groupId, `nights/${code}/fixes`)).key;
  await update(groupRef(groupId, `nights/${code}`), { ...patch, [`fixes/${id}`]: { ...entry, at: serverTimestamp() } });
  return entry;
}

/** Cronologia delle correzioni (più recenti prima). */
export function fixesHTML(night) {
  const list = Object.values(night?.fixes || {}).filter((x) => x?.what).sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!list.length) return '';
  return `<details class="hub-details rs-fixes"><summary>${esc(t('fix.log', { n: list.length }))}</summary><ul class="rs-list">${list.map((x) => `<li><b>${esc(x.what)}</b> <span class="muted">· ${esc(x.why)} · ${esc(fmtDate(Number(x.at) || Date.now(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></li>`).join('')}</ul></details>`;
}

/** Modulo di correzione (solo per il creatore). */
export function fixFormHTML(night) {
  const games = Object.entries(night?.games || {}).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  if (!games.length) return '';
  return `<section class="card ph-card rs-fix">
    <h2>✏️ ${esc(t('fix.title'))}</h2>
    <p class="muted small">${esc(t('fix.lead'))}</p>
    <form id="fixForm" class="rs-fix-form" novalidate>
      <label class="field-label" for="fixGame">${esc(t('fix.game'))}</label>
      <select class="input select" id="fixGame">${games.map(([id, g]) => `<option value="${esc(id)}">${esc(g.name)}</option>`).join('')}</select>
      <label class="field-label" for="fixName">${esc(t('fix.name'))}</label>
      <input class="input" id="fixName" maxlength="40" value="${esc(games[0][1].name)}">
      <label class="field-label" for="fixMin">${esc(t('fix.min'))}</label>
      <input class="input" id="fixMin" type="number" min="1" max="600" inputmode="numeric" value="${esc(games[0][1].playedMin || '')}">
      <label class="field-label" for="fixWhy">${esc(t('fix.why'))}</label>
      <input class="input" id="fixWhy" maxlength="120" placeholder="${esc(t('fix.whyPh'))}">
      <p class="form-error" id="fixErr" role="alert"></p>
      <button type="submit" class="btn btn-block">${esc(t('fix.save'))}</button>
    </form>
    ${fixesHTML(night)}
  </section>`;
}

/** Collega il modulo: onDone(night aggiornata) dopo il salvataggio. */
export function bindFixForm(root, { groupId, code, night, onDone, explainError }) {
  const form = root.querySelector('#fixForm');
  if (!form) return;
  const sel = form.querySelector('#fixGame');
  sel.addEventListener('change', () => {
    const g = night.games?.[sel.value] || {};
    form.querySelector('#fixName').value = g.name || '';
    form.querySelector('#fixMin').value = g.playedMin || '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('#fixErr');
    err.textContent = '';
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const entry = await applyFix(groupId, code, night, sel.value, { name: form.querySelector('#fixName').value, playedMin: form.querySelector('#fixMin').value, why: form.querySelector('#fixWhy').value });
      onDone(entry);
    } catch (x) {
      err.textContent = x?.code && ['game', 'why', 'min', 'same'].includes(x.code) ? t(`fix.err.${x.code}`) : /permission/i.test(String(x?.code || x?.message || '')) ? t('fix.err.denied') : explainError(x);
    } finally { btn.disabled = false; }
  });
}
