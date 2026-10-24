// Navigazione con il telecomando (D-pad) per la TV e Android TV (1.10).
//
// Le frecce spostano il fuoco al pulsante, link o campo più vicino in quella direzione, dentro la
// finestra aperta in cima (se c'è) o nella pagina. OK/Invio "clicca" come sempre; Indietro/Esc li
// gestiscono già le singole pagine. Le schermate che usano le frecce per conto loro (premiazione,
// diapositive) chiamano preventDefault e qui non si interviene. Nei campi di testo sinistra/destra
// restano al cursore.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';
const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function visible(el) {
  if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none';
}

/** Dove cercare: l'ultima finestra aperta (dialogo, foglio, pannello) oppure la pagina. */
export function navScope() {
  const dialogs = [...document.querySelectorAll('.overlay, [role="dialog"][aria-modal="true"], #ambient')].filter((d) => visible(d));
  return dialogs[dialogs.length - 1] || document.body;
}

/** Il candidato migliore nella direzione: distanza lungo la direzione + scostamento laterale pesato. */
export function pickNext(from, list, dir) {
  const c = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const a = c(from);
  let best = null;
  let bestScore = Infinity;
  for (const it of list) {
    const b = c(it.rect);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let main; let side;
    if (dir === 'up') { main = -dy; side = Math.abs(dx); }
    else if (dir === 'down') { main = dy; side = Math.abs(dx); }
    else if (dir === 'left') { main = -dx; side = Math.abs(dy); }
    else { main = dx; side = Math.abs(dy); }
    if (main <= 1) continue;
    const score = main + side * 2.2;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best;
}

export function moveFocus(dir) {
  const scope = navScope();
  const els = [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
  if (!els.length) return false;
  const cur = document.activeElement;
  if (!cur || cur === document.body || !scope.contains(cur) || !visible(cur)) {
    els[0].focus({ preventScroll: false });
    return true;
  }
  const next = pickNext(cur.getBoundingClientRect(), els.filter((e) => e !== cur).map((el) => ({ el, rect: el.getBoundingClientRect() })), dir);
  if (!next) return false;
  next.el.focus({ preventScroll: true });
  next.el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

/** Siamo su un televisore (Android TV, Fire TV, Google TV…)? Lo dice il browser o l'app. */
export function isTvDevice() {
  const ua = navigator.userAgent || '';
  return /\b(Android TV|AFT[A-Z]|BRAVIA|SHIELD Android TV|MiBOX|Chromecast|GoogleTV|SMART-TV|SmartTV|Tizen|Web0S|HbbTV)\b/i.test(ua)
    || (/Android/i.test(ua) && window.matchMedia?.('(hover: none) and (pointer: none)').matches);
}

/** Attiva le frecce del telecomando. when(): se restituisce false (per esempio mentre si scrive) non fa niente. */
export function initSpatialNav({ when = () => true } = {}) {
  if (initSpatialNav.on) return;
  initSpatialNav.on = true;
  if (isTvDevice()) document.documentElement.classList.add('tv-remote');
  // Su window (fase di risalita): arriva DOPO i gestori delle pagine, che così possono tenersi le frecce.
  window.addEventListener('keydown', (e) => {
    const dir = DIRS[e.key];
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !when()) return;
    const t = e.target;
    const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'].includes(t.type));
    if (typing && (dir === 'left' || dir === 'right')) return;
    if (t instanceof HTMLSelectElement) return; // le frecce cambiano la scelta
    if (t instanceof HTMLInputElement && t.type === 'range' && (dir === 'left' || dir === 'right')) return;
    if (moveFocus(dir)) e.preventDefault();
  });
}
