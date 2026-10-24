// Timer condiviso della serata (turni, round, intervalli), visibile su TV e telefoni.
//
// Il modello e le regole di calcolo stanno in nightclock.js; qui ci sono la scrittura su Firebase
// (rooms/<codice>/timer), il disegno e gli effetti allo scadere. La TV e i telefoni regia possono
// comandarlo; gli altri telefoni lo vedono. Nessuna scrittura mentre scorre: ogni dispositivo
// ricalcola il tempo dall'ora del server.
//
// La TV ha l'ultima parola sulla coerenza con la pausa della serata (reconcile): se la serata è in
// pausa e un timer "collegato" sta ancora correndo (per esempio perché la scrittura è andata persa
// con la rete), lo ferma; alla ripresa fa ripartire quelli che aveva fermato lei.
import { roomRef, get, set, serverTimestamp, serverNow } from './fb.js';
import { esc, toast, timerColor, buzz, ICONS } from './util.js';
import { t } from './i18n.js';
import {
  timerView, startTimer, pauseTimer, resumeTimer, resetTimer, addTime, nextRound, setTimerOptions,
  onNightPause, onNightResume, expiryKey, fmtClock, TIMER_PRESETS, TIMER_KINDS, DONE_VISIBLE_MS, isTimer
} from './nightclock.js';

let C = null;
/**
 * ctx: { role: 'tv'|'phone', code(), uid(), timer(), state(), canControl(), onExpire?(view), onTick?(view),
 *        onLog?(text, icon), explainError(err), openPanel?() }
 */
export function bindSharedTimer(ctx) { C = ctx; }

const FIRED_KEY = 'gnr_timer_fired';
function firedSet() {
  try { return new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || '[]')); } catch { return new Set(); }
}
function markFired(k) {
  const s = firedSet();
  s.add(k);
  try { sessionStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-40))); } catch { /* niente */ }
}

const isDenied = (err) => /permission|denied|PERMISSION_DENIED/i.test(`${err?.code || ''} ${err?.message || ''}`);

/**
 * Scrive il timer partendo dallo stato attuale nel database (non da quello in memoria, che può
 * essere vecchio). Se un'altra regia ha scritto nel frattempo, le regole rifiutano (rev) e si riprova.
 */
async function write(mutate) {
  if (!C?.code()) return false;
  const ref = roomRef(C.code(), 'timer');
  for (let i = 0; i < 3; i++) {
    const cur = (await get(ref)).val();
    const nxt = mutate(cur, serverNow());
    if (!nxt) return false;
    try {
      await set(ref, nxt);
      return true;
    } catch (err) {
      if (!isDenied(err) || i === 2) throw err;
    }
  }
  return false;
}

const by = () => C?.uid?.() || null;
const fail = (err) => toast(C?.explainError ? C.explainError(err) : String(err?.message || err), 'error');
const nightPaused = () => Boolean(C?.state?.()?.paused);

export const SharedTimer = {
  view() { return timerView(C?.timer?.(), serverNow()); },
  /** Il timer va mostrato in evidenza (in corso, in pausa, o scaduto da poco)? */
  visible(v = this.view()) {
    return v.status === 'running' || v.status === 'paused' || (v.status === 'done' && v.overBy < DONE_VISIBLE_MS);
  },
  async run(mutate) {
    if (!C?.canControl?.()) { toast(t('timer.noControl'), 'warn'); return false; }
    try { return await write(mutate); } catch (err) { fail(err); return false; }
  },
  start(opts) {
    return this.run((cur, now) => {
      const nt = startTimer(cur, opts, { now, startAt: serverTimestamp(), by: by() });
      // Serata in pausa e timer collegato: si prepara fermo e parte alla ripresa.
      if (nightPaused() && nt.follow) return { ...nt, status: 'paused', startAt: null, nightPaused: true };
      return nt;
    });
  },
  pause() { return this.run((cur, now) => pauseTimer(cur, now, { by: by() })); },
  resume() { return this.run((cur, now) => resumeTimer(cur, now, { startAt: serverTimestamp(), by: by() })); },
  reset() { return this.run((cur) => resetTimer(cur, { by: by() })); },
  add(secs) { return this.run((cur, now) => addTime(cur, secs, now, { startAt: serverTimestamp(), by: by() })); },
  next() {
    return this.run((cur, now) => {
      const nt = nextRound(cur, { now, startAt: serverTimestamp(), by: by() });
      if (nt && nightPaused() && nt.follow) return { ...nt, status: 'paused', startAt: null, nightPaused: true };
      return nt;
    });
  },
  options(opts) { return this.run((cur) => setTimerOptions(cur, opts, { by: by() })); },
  async clear() {
    if (!C?.canControl?.()) return false;
    try { await set(roomRef(C.code(), 'timer'), null); return true; } catch (err) { fail(err); return false; }
  },

  /** Solo TV: allinea il timer alla pausa della serata. Chiamata da setPaused e a ogni aggiornamento. */
  async reconcile() {
    if (C?.role !== 'tv' || this.busy) return;
    const tm = C.timer?.();
    if (!isTimer(tm)) return;
    const paused = nightPaused();
    const v = timerView(tm, serverNow());
    const needPause = paused && v.status === 'running' && v.follow;
    const needResume = !paused && tm.status === 'paused' && tm.nightPaused;
    if (!needPause && !needResume) return;
    this.busy = true;
    try {
      await write((cur, now) => (nightPaused()
        ? onNightPause(cur, now, { by: by() })
        : onNightResume(cur, now, { startAt: serverTimestamp(), by: by() })));
    } catch (err) {
      if (!isDenied(err)) fail(err);
    } finally { this.busy = false; }
  },

  /** Da chiamare quando arrivano dati nuovi: avvia o ferma il ridisegno periodico. */
  sync() {
    const v = this.view();
    const live = this.visible(v);
    if (live && !this.tick) this.tick = setInterval(() => this.paint(), 250);
    if (!live && this.tick) { clearInterval(this.tick); this.tick = null; }
    this.paint();
    if (C?.role === 'tv') this.reconcile();
  },

  paint() {
    const v = this.view();
    paintChip(v);
    for (const el of document.querySelectorAll('[data-shtimer]')) paintDisplay(el, v);
    this.effects(v);
    if (!this.visible(v) && this.tick) { clearInterval(this.tick); this.tick = null; paintChip(v); }
  },

  effects(v) {
    if (v.status === 'running' && v.sec !== this.lastSec) {
      if (this.lastSec !== undefined && v.sec <= 5 && v.sec > 0) C?.onTick?.(v);
      this.lastSec = v.sec;
    }
    if (v.status === 'done') {
      const k = expiryKey(C?.timer?.());
      // Solo uno scadere appena avvenuto: chi apre la pagina dopo non sente il suono.
      if (k && v.overBy < 4000 && !firedSet().has(k)) {
        markFired(k);
        C?.onExpire?.(v);
      }
    }
    if (v.status !== 'running') this.lastSec = undefined;
  }
};

// ---------------------------------------------------------------------------
// Disegno
// ---------------------------------------------------------------------------

const KIND_ICON = { turn: '🔁', round: '🎯', break: '☕', custom: '⏱️' };
export const kindLabel = (k) => t(`timer.kind.${TIMER_KINDS.includes(k) ? k : 'custom'}`);
const presetLabel = (s) => (s < 60 ? t('timer.secShort', { n: s }) : s % 60 ? fmtClock(s * 1000) : t('timer.minShort', { n: s / 60 }));

function statusLine(v) {
  if (v.status === 'done') return t('timer.done');
  if (v.status === 'paused') return v.nightPaused ? t('timer.pausedNight') : t('timer.paused');
  if (v.status === 'idle') return t('timer.ready');
  return v.kind === 'turn' || v.kind === 'round' ? t('timer.roundN', { kind: kindLabel(v.kind), n: v.round }) : kindLabel(v.kind);
}

function paintChip(v) {
  const show = SharedTimer.visible(v) && !document.querySelector('[data-shtimer="panel"]') && !document.body.classList.contains('ambient-on');
  let chip = document.getElementById('shTimerChip');
  if (show && !chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.id = 'shTimerChip';
    chip.className = `sh-chip sh-chip--${C?.role || 'tv'}`;
    chip.addEventListener('click', () => C?.openPanel?.());
    document.body.appendChild(chip);
  }
  if (!show) { chip?.remove(); return; }
  chip.style.setProperty('--tc', v.status === 'paused' ? '#9AA3B8' : timerColor(v.frac));
  chip.classList.toggle('is-over', v.status === 'done');
  chip.classList.toggle('is-paused', v.status === 'paused');
  chip.classList.toggle('is-hot', v.status === 'running' && v.sec <= 10);
  const txt = v.status === 'done' ? t('timer.doneShort') : fmtClock(v.left);
  const label = `${KIND_ICON[v.kind] || '⏱️'} ${v.label || kindLabel(v.kind)}`;
  const html = `<span class="sh-chip-k">${esc(label)}</span><b>${v.status === 'paused' ? '❚❚ ' : ''}${esc(txt)}</b>`;
  if (chip.dataset.html !== html) { chip.dataset.html = html; chip.innerHTML = html; }
  chip.setAttribute('aria-label', `${label}: ${v.status === 'done' ? t('timer.done') : `${fmtClock(v.left)} · ${statusLine(v)}`}`);
}

/** Display grande (TV, pannello del telefono, schermata ambientale). */
export function timerDisplayHTML(kind = 'panel') {
  return `
    <div class="sh-display" data-shtimer="${esc(kind)}" role="timer" aria-live="off">
      <span class="sh-kind"></span>
      <b class="sh-num">—</b>
      <div class="sh-bar" aria-hidden="true"><i></i></div>
      <span class="sh-status"></span>
    </div>`;
}

function paintDisplay(el, v) {
  const num = el.querySelector('.sh-num');
  const st = el.querySelector('.sh-status');
  const kd = el.querySelector('.sh-kind');
  const bar = el.querySelector('.sh-bar i');
  el.classList.toggle('is-none', v.status === 'none');
  el.classList.toggle('is-over', v.status === 'done');
  el.classList.toggle('is-paused', v.status === 'paused');
  el.classList.toggle('is-hot', v.status === 'running' && v.sec <= 10);
  el.style.setProperty('--tc', v.status === 'paused' ? '#9AA3B8' : timerColor(v.frac));
  const n = v.status === 'none' ? '—' : v.status === 'done' ? t('timer.doneShort') : fmtClock(v.left);
  if (num && num.textContent !== n) num.textContent = n;
  const s = v.status === 'none' ? t('timer.none') : statusLine(v);
  if (st && st.textContent !== s) st.textContent = s;
  const k = v.status === 'none' ? '' : `${KIND_ICON[v.kind] || '⏱️'} ${v.label || kindLabel(v.kind)}`;
  if (kd && kd.textContent !== k) kd.textContent = k;
  if (bar) bar.style.width = `${v.status === 'none' ? 0 : (v.frac * 100).toFixed(2)}%`;
}

/** Comandi del timer (TV e telefono regia). Tutti i pulsanti hanno data-tm. */
export function timerControlsHTML(selKind = 'turn') {
  const tm = C?.timer?.();
  const v = SharedTimer.view();
  const kind = TIMER_KINDS.includes(selKind) ? selKind : 'turn';
  const follow = isTimer(tm) ? tm.follow !== false : true;
  const sound = isTimer(tm) ? tm.sound !== false : true;
  const live = v.status === 'running' || v.status === 'paused' || v.status === 'idle' || v.status === 'done';
  return `
    <div class="sh-ctrl" data-shkind="${kind}">
      ${live ? `<div class="sh-actions">
        ${v.status === 'running' ? `<button type="button" class="btn-sec" data-tm="pause">❚❚ ${esc(t('timer.pause'))}</button>` : ''}
        ${v.status === 'paused' || v.status === 'idle' ? `<button type="button" class="btn-sec" data-tm="resume">${ICONS.play}<span>${esc(v.status === 'idle' ? t('timer.go') : t('timer.resume'))}</span></button>` : ''}
        <button type="button" class="btn-sec" data-tm="add" data-secs="30">+30 s</button>
        ${v.kind === 'turn' || v.kind === 'round' ? `<button type="button" class="btn-sec" data-tm="next">⏭️ ${esc(v.kind === 'turn' ? t('timer.nextTurn') : t('timer.nextRound'))}</button>` : ''}
        <button type="button" class="btn-sec" data-tm="reset">↺ ${esc(t('timer.reset'))}</button>
        <button type="button" class="link-btn" data-tm="clear">${esc(t('timer.clear'))}</button>
      </div>` : ''}
      <div class="sh-kinds" role="group" aria-label="${esc(t('timer.kindAria'))}">
        ${TIMER_KINDS.map((k) => `<button type="button" class="chip-btn" data-tm="kind" data-k="${k}" aria-pressed="${k === kind}">${KIND_ICON[k]} ${esc(kindLabel(k))}</button>`).join('')}
      </div>
      <div class="sh-presets" role="group" aria-label="${esc(t('timer.presetsAria'))}">
        ${TIMER_PRESETS[kind].map((s) => `<button type="button" class="btn-sec" data-tm="start" data-secs="${s}">${esc(presetLabel(s))}</button>`).join('')}
      </div>
      <form class="sh-custom" data-tm-form>
        <label><span>${esc(t('timer.min'))}</span><input class="input input--sm" type="number" name="m" min="0" max="120" step="1" value="1" inputmode="numeric"></label>
        <label><span>${esc(t('timer.sec'))}</span><input class="input input--sm" type="number" name="s" min="0" max="59" step="5" value="0" inputmode="numeric"></label>
        <label class="sh-label"><span>${esc(t('timer.label'))}</span><input class="input input--sm" type="text" name="label" maxlength="40" placeholder="${esc(t('timer.labelPh'))}"></label>
        <button type="submit" class="btn">${ICONS.play}<span>${esc(t('timer.start'))}</span></button>
      </form>
      <label class="quick-toggle"><input type="checkbox" data-tm="follow" ${follow ? 'checked' : ''}><span>${esc(t('timer.follow'))}</span></label>
      <label class="quick-toggle"><input type="checkbox" data-tm="sound" ${sound ? 'checked' : ''}><span>${esc(t('timer.sound'))}</span></label>
    </div>`;
}

/** Collega i comandi dentro root (delegazione: si può ridisegnare liberamente). */
export function bindTimerControls(root, onRepaint) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tm]');
    if (!b || b.tagName === 'INPUT') return;
    const box = b.closest('.sh-ctrl');
    const kind = box?.dataset.shkind || 'turn';
    const follow = box?.querySelector('[data-tm="follow"]')?.checked;
    const sound = box?.querySelector('[data-tm="sound"]')?.checked;
    const a = b.dataset.tm;
    if (a === 'kind') { onRepaint?.(b.dataset.k); return; }
    let p;
    if (a === 'start') p = SharedTimer.start({ secs: Number(b.dataset.secs), kind, follow, sound });
    if (a === 'pause') p = SharedTimer.pause();
    if (a === 'resume') p = SharedTimer.resume();
    if (a === 'reset') p = SharedTimer.reset();
    if (a === 'add') p = SharedTimer.add(Number(b.dataset.secs) || 30);
    if (a === 'next') p = SharedTimer.next();
    if (a === 'clear') p = SharedTimer.clear();
    if (p) p.then(() => onRepaint?.(kind));
  });
  root.addEventListener('change', (e) => {
    const c = e.target.closest('input[data-tm]');
    if (!c) return;
    if (isTimer(C?.timer?.())) SharedTimer.options({ [c.dataset.tm]: c.checked });
  });
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-tm-form]');
    if (!f) return;
    e.preventDefault();
    const box = f.closest('.sh-ctrl');
    const secs = (Math.max(0, Number(f.m.value) || 0) * 60) + Math.max(0, Number(f.s.value) || 0);
    if (secs < 5) { toast(t('timer.tooShort'), 'warn'); return; }
    SharedTimer.start({
      secs, kind: box?.dataset.shkind || 'custom', label: f.label.value.trim(),
      follow: box?.querySelector('[data-tm="follow"]')?.checked, sound: box?.querySelector('[data-tm="sound"]')?.checked
    }).then(() => onRepaint?.(box?.dataset.shkind));
  });
}

/** Firma dei dati che cambiano i comandi (per ridisegnarli solo quando serve). */
export function controlsSig() {
  const tm = C?.timer?.();
  const v = SharedTimer.view();
  return JSON.stringify([v.status === 'done' ? 'done' : v.status, v.kind, tm?.follow, tm?.sound, Boolean(C?.canControl?.())]);
}

/**
 * Foglio del timer sul telefono: display grande per tutti; i comandi solo per la regia.
 * Si chiude toccando fuori, con la X o con Esc.
 */
export const TimerSheet = {
  el: null,
  kind: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet timer-sheet';
    el.innerHTML = `
      <div class="card sheet" role="dialog" aria-modal="true" aria-labelledby="tsTitle">
        <button type="button" class="icon-btn sheet-x" data-tsclose aria-label="${esc(t('common.close'))}">${ICONS.x}</button>
        <h2 id="tsTitle">⏱️ ${esc(t('timer.title'))}</h2>
        ${timerDisplayHTML('panel')}
        <div id="tsCtrl"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-tsclose]')) this.close(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    bindTimerControls(el, (k) => { if (k) this.kind = k; this.update(true); });
    this.update(true);
    SharedTimer.sync();
    el.querySelector('[data-tsclose]')?.focus();
  },
  close() { this.el?.remove(); this.el = null; this.sig = ''; SharedTimer.sync(); },
  update(force = false) {
    const box = this.el?.querySelector('#tsCtrl');
    if (!box) return;
    const sig = `${controlsSig()}|${this.kind}`;
    if (!force && sig === this.sig) return;
    if (!force && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    this.sig = sig;
    box.innerHTML = C?.canControl?.()
      ? timerControlsHTML(this.kind || C?.timer?.()?.kind || 'turn')
      : `<p class="muted small">${esc(t('timer.viewOnly'))}</p>`;
  }
};

/** Vibrazione e avviso per i telefoni allo scadere. */
export function phoneExpire(v) {
  if (v.sound) buzz([160, 80, 160, 80, 260]);
  toast(`⏰ ${v.label || kindLabel(v.kind)}: ${t('timer.done')}`);
}

