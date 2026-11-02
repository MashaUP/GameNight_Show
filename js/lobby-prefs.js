// Preferenze della lobby della TV (2.4): modalità di visualizzazione, pannelli opzionali e voci della checklist.
//
// Sono preferenze della REGIA su questo dispositivo (localStorage "gnr_lobby"), come la vecchia "gnr_ready_view"
// della 2.2: valgono per tutte le serate guidate da questo computer e il master le ritrova quando riapre una stanza.
// Non vanno nel profilo personale (sono di questo schermo, non della persona) e non vanno nella stanza: cambiano
// solo l'aspetto della TV, non la partita, quindi telefoni e giocatori non ne dipendono.
// La home (Impostazioni › Partita e regia) e la TV (Strumenti › Visualizzazione) usano lo stesso controllo:
// TV e home sullo stesso computer condividono localStorage, e la TV aperta si aggiorna da sola (evento storage).
import { esc } from './util.js';
import { t } from './i18n.js';

const KEY = 'gnr_lobby';
export const LOBBY_MODES = ['standard', 'minimal', 'info'];
export const CHECK_ITEMS = ['armadio', 'plan', 'rules', 'timer', 'limits', 'players'];
const DEFAULTS = { mode: 'standard', checklist: false, checkItems: CHECK_ITEMS, table: false, plan: false };

export function lobbyPrefs() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { raw = {}; }
  const p = { ...DEFAULTS, ...raw };
  if (!LOBBY_MODES.includes(p.mode)) p.mode = 'standard';
  p.checkItems = Array.isArray(p.checkItems) ? p.checkItems.filter((k) => CHECK_ITEMS.includes(k)) : CHECK_ITEMS;
  p.checklist = Boolean(p.checklist); p.table = Boolean(p.table); p.plan = Boolean(p.plan);
  return p;
}

export function setLobbyPrefs(patch) {
  const next = { ...lobbyPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* niente */ }
  window.dispatchEvent(new CustomEvent('gnr-lobby', { detail: next }));
  return next;
}

/** Il pannello è visibile con questa modalità? Minimal: solo i partecipanti (e QR, codice, Inizia). */
export function lobbyShows(what, p = lobbyPrefs()) {
  if (p.mode === 'minimal') return false;
  if (what === 'extras') return p.mode === 'info'; // arrivi, desideri, cibo, identità del gruppo
  return Boolean(p[what]);
}

/** Controlli delle preferenze (Impostazioni della home e Strumenti della TV). */
export function lobbyPrefsHTML(id = 'lobbyPrefs') {
  const p = lobbyPrefs();
  const mode = (m) => `<button type="button" data-lobby-mode="${m}" aria-pressed="${p.mode === m}">${esc(t(`lobby.mode.${m}`))}</button>`;
  const tog = (k) => `<label class="quick-toggle"><input type="checkbox" data-lobby-tog="${k}" ${p[k] ? 'checked' : ''}><span>${esc(t(`lobby.tog.${k}`))}<small class="muted">${esc(t(`lobby.tog.${k}Hint`))}</small></span></label>`;
  return `<div class="lobby-prefs" id="${id}">
      <p class="field-label">${esc(t('lobby.mode.label'))}</p>
      <div class="seg seg--wide" role="group" aria-label="${esc(t('lobby.mode.label'))}">${LOBBY_MODES.map(mode).join('')}</div>
      <p class="muted small" data-lobby-modehint>${esc(t(`lobby.mode.${p.mode}Hint`))}</p>
      <div class="lobby-toggles">${tog('checklist')}${tog('table')}${tog('plan')}</div>
      <fieldset class="lobby-items" ${p.checklist ? '' : 'disabled'}>
        <legend>${esc(t('lobby.items.label'))}</legend>
        <div class="lobby-items-grid">${CHECK_ITEMS.map((k) => `<label class="quick-toggle"><input type="checkbox" data-lobby-item="${k}" ${p.checkItems.includes(k) ? 'checked' : ''}><span>${esc(t(`prep.ck.${k}`))}</span></label>`).join('')}</div>
      </fieldset>
      ${p.mode === 'minimal' ? `<p class="muted small">${esc(t('lobby.minimalNote'))}</p>` : ''}
    </div>`;
}

/** Collega i controlli: ogni cambio si salva subito; onChange ridisegna chi li contiene. */
export function bindLobbyPrefs(root, onChange = () => {}) {
  root.addEventListener('click', (e) => {
    const m = e.target.closest('[data-lobby-mode]');
    if (!m) return;
    setLobbyPrefs({ mode: m.dataset.lobbyMode });
    onChange();
  });
  root.addEventListener('change', (e) => {
    const tg = e.target.closest('[data-lobby-tog]');
    if (tg) { setLobbyPrefs({ [tg.dataset.lobbyTog]: tg.checked }); onChange(); return; }
    const it = e.target.closest('[data-lobby-item]');
    if (it) {
      const set = new Set(lobbyPrefs().checkItems);
      if (it.checked) set.add(it.dataset.lobbyItem); else set.delete(it.dataset.lobbyItem);
      setLobbyPrefs({ checkItems: CHECK_ITEMS.filter((k) => set.has(k)) });
      onChange();
    }
  });
}
