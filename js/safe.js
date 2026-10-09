// Safe Mode: se qualcosa va storto si spengono animazioni, musica, effetti, commentatore,
// atmosfere e ticker. Restano giocatori, voti, classifica, regia e salvataggi.
const KEY = 'gnr_safe';

function stored() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let forced = false; // attivata dalla TV per tutta la stanza (sui telefoni)

export function isSafeMode() {
  return forced || stored();
}

function apply() {
  document.documentElement?.classList?.toggle('safe-mode', isSafeMode());
}

/** Attiva o spegne la Safe Mode su questo dispositivo. */
export function setSafeMode(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* niente */ }
  apply();
  window.dispatchEvent(new CustomEvent('gnr-safe', { detail: isSafeMode() }));
}

/** Safe Mode chiesta dalla stanza (la TV la estende ai telefoni). */
export function setRoomSafeMode(on) {
  if (Boolean(on) === forced) return;
  forced = Boolean(on);
  apply();
  window.dispatchEvent(new CustomEvent('gnr-safe', { detail: isSafeMode() }));
}

if (typeof document !== 'undefined') apply();

/**
 * Guardiano degli errori: se in un minuto la pagina incontra 3 errori o più,
 * propone la Safe Mode (onTrouble viene chiamata una volta sola per ondata).
 */
export function watchErrors(onTrouble) {
  const times = [];
  let warned = 0;
  const hit = (e) => {
    const msg = String(e?.message || e?.reason?.message || e?.reason || '');
    // Errori di rete, estensioni del browser e risorse esterne non contano.
    if (/ResizeObserver|Script error|extension|Failed to fetch|NetworkError|Load failed/i.test(msg)) return;
    const now = Date.now();
    times.push(now);
    while (times.length && now - times[0] > 60000) times.shift();
    if (times.length >= 3 && now - warned > 120000 && !isSafeMode()) {
      warned = now;
      onTrouble?.(msg);
    }
  };
  window.addEventListener('error', hit);
  window.addEventListener('unhandledrejection', hit);
}
