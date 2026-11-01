// Proposte di modifica condivise per l'armadio (2.1, idea 64).
//
// Chi vede l'armadio ma non lo modifica (ospite con il link, membro del gruppo) può proporre una correzione
// di un gioco: giocatori, durata, difficoltà, regole veloci, nota, con un motivo. La proposta resta in
// armadi/<id>/proposals finché il proprietario o un collaboratore non la accetta (si applica alla scheda e
// finisce nella cronologia) o la rifiuta. Le regole del database: chiunque sia collegato può proporre per sé
// su un gioco che esiste; leggono e decidono solo proprietario e collaboratori; chi ha proposto può ritirarla.
import { esc } from './util.js';
import { t } from './i18n.js';

export const PROP_FIELDS = ['minPlayers', 'maxPlayers', 'duration', 'weight', 'rules', 'note'];
const LIMITS = { minPlayers: [1, 20], maxPlayers: [1, 20], duration: [1, 600], weight: [1, 5] };

/** Proposta pulita da un modulo. Lancia { code } se non c'è niente di valido o manca il motivo. */
export function makeProposal(item, input, { uid, name }) {
  const patch = {};
  for (const k of PROP_FIELDS) {
    const raw = input[k];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    if (LIMITS[k]) {
      const n = Number(String(raw).replace(',', '.'));
      const [lo, hi] = LIMITS[k];
      if (!Number.isFinite(n) || n < lo || n > hi) throw Object.assign(new Error(k), { code: 'range', field: k });
      const v = k === 'weight' ? Math.round(n * 10) / 10 : Math.round(n);
      if (v !== Number(item?.[k])) patch[k] = v;
    } else {
      const s = String(raw).replace(/[<>]/g, '').trim().slice(0, k === 'rules' ? 600 : 300);
      if (s && s !== String(item?.[k] || '')) patch[k] = s;
    }
  }
  if (patch.minPlayers && (patch.maxPlayers || item?.maxPlayers) && patch.minPlayers > (patch.maxPlayers || item.maxPlayers)) throw Object.assign(new Error('minmax'), { code: 'minmax' });
  if (!Object.keys(patch).length) throw Object.assign(new Error('empty'), { code: 'empty' });
  const why = String(input.why || '').replace(/[<>]/g, '').trim().slice(0, 120);
  if (why.length < 3) throw Object.assign(new Error('why'), { code: 'why' });
  return { item: String(input.itemId).slice(0, 40), patch, why, uid, name: String(name || '').slice(0, 24) || '—' };
}

/** Elenco delle proposte per il proprietario e i collaboratori. */
export function proposalsHTML(props, lib) {
  const list = Object.entries(props || {}).filter(([, p]) => p?.item).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  if (!list.length) return `<p class="muted">${esc(t('prop.none'))}</p>`;
  const label = (k) => t(`prop.f.${k}`);
  return `<ul class="am-props">${list.map(([id, p]) => {
    const it = lib?.[p.item];
    const rows = Object.entries(p.patch || {}).map(([k, v]) => `<li><b>${esc(label(k))}</b>: ${esc(String(it?.[k] ?? '—'))} → <b>${esc(String(v))}</b></li>`).join('');
    return `<li class="card am-prop"><div><b>${esc(it?.name || t('prop.gone'))}</b> <span class="muted small">· ${esc(p.name || '—')}</span></div>
      <ul class="am-mini-list">${rows}</ul><p class="small">“${esc(p.why || '')}”</p>
      <div class="rg-row">${it ? `<button type="button" class="btn btn-sec--sm" data-prop-ok="${esc(id)}">✅ ${esc(t('prop.accept'))}</button>` : ''}<button type="button" class="btn-sec btn-sec--sm" data-prop-no="${esc(id)}">✕ ${esc(t('prop.reject'))}</button></div></li>`;
  }).join('')}</ul>`;
}

/** Modulo per proporre (sheet). */
export function proposeFormHTML(it) {
  const f = (k, type = 'number', extra = '') => `<label><span class="field-label">${esc(t(`prop.f.${k}`))}</span><input class="input" data-pf="${k}" type="${type}" ${extra} placeholder="${esc(String(it?.[k] ?? ''))}"></label>`;
  return `<form id="propForm" class="am-form" novalidate>
    <p class="muted small">${esc(t('prop.lead'))}</p>
    <div class="am-form-grid">${f('minPlayers', 'number', 'min="1" max="20"')}${f('maxPlayers', 'number', 'min="1" max="20"')}${f('duration', 'number', 'min="1" max="600"')}${f('weight', 'number', 'min="1" max="5" step="0.1"')}</div>
    <label><span class="field-label">${esc(t('prop.f.rules'))}</span><textarea class="input" data-pf="rules" rows="2" maxlength="600"></textarea></label>
    <label><span class="field-label">${esc(t('prop.f.note'))}</span><textarea class="input" data-pf="note" rows="2" maxlength="300"></textarea></label>
    <label><span class="field-label">${esc(t('prop.why'))}</span><input class="input" data-pf="why" maxlength="120" placeholder="${esc(t('prop.whyPh'))}"></label>
    <p class="form-error" id="propErr" role="alert"></p>
    <button type="submit" class="btn btn-block">💡 ${esc(t('prop.send'))}</button>
  </form>`;
}
