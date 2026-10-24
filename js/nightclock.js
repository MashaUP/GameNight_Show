// Stato condiviso della serata per pausa, timer condiviso e schermata ambientale.
//
// Niente DOM e niente Firebase qui: solo funzioni pure, provate in tests/nightclock.test.mjs.
// La TV e i telefoni ricostruiscono la stessa situazione dallo stato nel database, senza timer
// locali avviati in momenti diversi:
//
// rooms/<codice>/state     (scrive solo la TV)            fase, partita, pausa della serata
//   paused, pausedAt, pauseReason                           pausa globale (già dalla 1.0)
//   playPaused, votePaused                                  tempo di pausa da non contare
// rooms/<codice>/timer     (TV e telefoni regia)          timer condiviso, vedi TIMER_FORMAT
// rooms/<codice>/meta/ambient (scrive solo la TV)         schermata ambientale accesa (true) o no
//
// Il timer condiviso non scrive niente mentre scorre: si salvano solo l'istante di partenza (ora del
// server) e il tempo che restava. Ogni dispositivo calcola il resto con l'ora del server
// (fb.js › serverNow, che corregge l'orologio del dispositivo). "rev" cresce di 1 a ogni scrittura:
// le regole del database rifiutano una scrittura fatta su uno stato vecchio (due regie che toccano il
// timer nello stesso momento), e chi è stato rifiutato rilegge e riprova.

/** Versione del formato dei dati del timer (diversa dalla versione dell'app). */
export const TIMER_FORMAT = 1;
export const TIMER_KINDS = ['turn', 'round', 'break', 'custom'];
export const TIMER_MIN_SECS = 5;
export const TIMER_MAX_SECS = 2 * 60 * 60;
/** Preimpostazioni per tipo (secondi). */
export const TIMER_PRESETS = {
  turn: [30, 60, 90, 120, 180],
  round: [300, 600, 900, 1200, 1800],
  break: [300, 600, 900, 1800],
  custom: [45, 120, 240, 420]
};
/** Dopo quanto tempo dallo scadere il timer smette di essere mostrato in evidenza. */
export const DONE_VISIBLE_MS = 15000;

const clampSecs = (s) => Math.min(TIMER_MAX_SECS, Math.max(TIMER_MIN_SECS, Math.round(Number(s) || 0)));
const newId = (now) => `t${Math.floor(now).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Il timer salvato è valido? (dati letti dal database: non ci si fida a priori) */
export function isTimer(t) {
  return Boolean(t && typeof t === 'object' && typeof t.id === 'string' && TIMER_KINDS.includes(t.kind)
    && Number.isFinite(Number(t.secs)) && Number(t.secs) >= TIMER_MIN_SECS && Number(t.secs) <= TIMER_MAX_SECS
    && Number.isFinite(Number(t.left)) && ['running', 'paused', 'idle'].includes(t.status) && Number.isFinite(Number(t.rev)));
}

/**
 * Situazione del timer adesso.
 * status: 'none' (nessun timer) · 'idle' (pronto, non partito) · 'running' · 'paused' · 'done' (scaduto)
 * left: millisecondi rimasti · sec: secondi interi rimasti (arrotondati per eccesso) · frac: 1 → 0
 * overBy: da quanti millisecondi è scaduto · nightPaused: fermato dalla pausa della serata.
 */
export function timerView(t, now) {
  if (!isTimer(t)) return { status: 'none', left: 0, sec: 0, frac: 0, overBy: 0 };
  const total = Number(t.secs) * 1000;
  let left = Math.max(0, Math.min(total, Number(t.left)));
  let status = t.status;
  let overBy = 0;
  if (status === 'running') {
    const start = Number(t.startAt);
    // Partenza appena scritta: l'ora del server non è ancora tornata (o è nel futuro di poco).
    const elapsed = Number.isFinite(start) ? Math.max(0, now - start) : 0;
    const raw = left - elapsed;
    left = Math.max(0, raw);
    if (raw <= 0) { status = 'done'; overBy = -raw; }
  } else if (status === 'idle' && left <= 0) {
    status = 'done';
  }
  return {
    status, left, sec: Math.ceil(left / 1000), frac: total ? left / total : 0, overBy,
    total, kind: t.kind, round: Number(t.round) || 1, label: t.label || '', id: t.id,
    follow: t.follow !== false, nightPaused: Boolean(t.nightPaused), sound: t.sound !== false
  };
}

/** "1:05", "0:09", "1:02:03". */
export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Chiave che identifica uno scadere: lo stesso scadere non deve suonare due volte sullo stesso dispositivo. */
export function expiryKey(t) {
  return isTimer(t) ? `${t.id}:${t.round || 1}:${t.startAt || 0}` : '';
}

function next(prev, patch, by) {
  return {
    v: TIMER_FORMAT,
    follow: true,
    sound: true,
    round: 1,
    ...prev,
    ...patch,
    rev: (Number(prev?.rev) || 0) + 1,
    by: by || prev?.by || null
  };
}

/**
 * Nuovo conto alla rovescia che parte subito.
 * opts: { secs, kind, label, follow, sound, round }. startAt è il segnaposto dell'ora del server
 * (serverTimestamp) passato da chi scrive.
 */
export function startTimer(prev, opts, { now, startAt, by } = {}) {
  const secs = clampSecs(opts?.secs);
  const kind = TIMER_KINDS.includes(opts?.kind) ? opts.kind : 'custom';
  const keepRound = prev && isTimer(prev) && prev.kind === kind;
  return next(isTimer(prev) ? prev : null, {
    id: newId(now || 0), kind, secs, left: secs * 1000, status: 'running', startAt,
    label: String(opts?.label || '').slice(0, 40) || null,
    follow: opts?.follow !== undefined ? Boolean(opts.follow) : (prev?.follow ?? true),
    sound: opts?.sound !== undefined ? Boolean(opts.sound) : (prev?.sound ?? true),
    round: Number(opts?.round) || (keepRound ? Number(prev.round) || 1 : 1),
    nightPaused: null
  }, by);
}

/** Pausa del timer (a mano o per la pausa della serata). Un timer già fermo non cambia (null). */
export function pauseTimer(prev, now, { byNight = false, by } = {}) {
  const v = timerView(prev, now);
  if (v.status !== 'running') return null;
  return next(prev, { status: 'paused', left: Math.max(0, Math.round(v.left)), startAt: null, nightPaused: byNight || null }, by);
}

/** Ripresa. Con byNight riprende solo se era stato fermato dalla pausa della serata. */
export function resumeTimer(prev, now, { startAt, byNight = false, by } = {}) {
  if (!isTimer(prev) || prev.status !== 'paused') return null;
  if (byNight && !prev.nightPaused) return null;
  if (Number(prev.left) <= 0) return next(prev, { status: 'idle', left: 0, startAt: null, nightPaused: null }, by);
  return next(prev, { status: 'running', startAt, nightPaused: null }, by);
}

/** Azzeramento: torna alla durata piena, fermo. */
export function resetTimer(prev, { by } = {}) {
  if (!isTimer(prev)) return null;
  return next(prev, { status: 'idle', left: Number(prev.secs) * 1000, startAt: null, nightPaused: null }, by);
}

/** Aggiunge (o toglie) tempo al timer, senza superare la durata massima. */
export function addTime(prev, secs, now, { startAt, by } = {}) {
  const v = timerView(prev, now);
  if (v.status === 'none') return null;
  const left = Math.max(0, Math.min(TIMER_MAX_SECS * 1000, v.left + secs * 1000));
  const total = Math.max(Number(prev.secs), Math.ceil(left / 1000), TIMER_MIN_SECS);
  if (v.status === 'running' || v.status === 'done') {
    if (left <= 0) return next(prev, { status: 'idle', left: 0, startAt: null }, by);
    return next(prev, { status: 'running', left, secs: Math.min(TIMER_MAX_SECS, total), startAt }, by);
  }
  return next(prev, { left, secs: Math.min(TIMER_MAX_SECS, total) }, by);
}

/** Turno o round successivo: stessa durata, numero +1, parte subito. */
export function nextRound(prev, { now, startAt, by } = {}) {
  if (!isTimer(prev)) return null;
  return next(prev, {
    id: newId(now || 0), left: Number(prev.secs) * 1000, status: 'running', startAt,
    round: Math.min(999, (Number(prev.round) || 1) + 1), nightPaused: null
  }, by);
}

/** Cambia le impostazioni senza toccare il conto alla rovescia (segui la pausa, suono). */
export function setTimerOptions(prev, opts, { by } = {}) {
  if (!isTimer(prev)) return null;
  const patch = {};
  if (opts.follow !== undefined) patch.follow = Boolean(opts.follow);
  if (opts.sound !== undefined) patch.sound = Boolean(opts.sound);
  if (opts.label !== undefined) patch.label = String(opts.label || '').slice(0, 40) || null;
  return next(prev, patch, by);
}

/**
 * Cosa fare al timer quando la serata va in pausa o riprende (chi decide: la TV).
 * Il timer si ferma con la serata solo se "follow" è acceso; un timer fermato a mano resta fermo.
 */
export function onNightPause(prev, now, opts = {}) {
  if (!isTimer(prev) || prev.follow === false) return null;
  return pauseTimer(prev, now, { ...opts, byNight: true });
}
export function onNightResume(prev, now, opts = {}) {
  if (!isTimer(prev)) return null;
  return resumeTimer(prev, now, { ...opts, byNight: true });
}

// ---------------------------------------------------------------------------
// Pausa della serata
// ---------------------------------------------------------------------------

/**
 * Patch di rooms/<codice>/state per mettere o togliere la pausa (key/params: motivo neutro, es. 'timeout').
 * now: ora del server; ts: segnaposto serverTimestamp. Restituisce null se non cambia niente.
 * Il tempo passato in pausa si aggiunge a playPaused (cronometro della partita) e votePaused
 * (timer del voto), così nessun conto alla rovescia perde o guadagna tempo.
 */
export function pausePatch(state, on, { now, ts, reason = null, key = null, params = null } = {}) {
  const st = state || {};
  const was = Boolean(st.paused);
  if (was === on && (!on || (reason || null) === (st.pauseReason || null))) return null;
  if (on) {
    // pauseReason: testo (lo leggono anche le versioni vecchie); pauseK/pauseP: codice e parametri neutri,
    // così ogni schermo lo mostra nella sua lingua.
    const patch = { paused: true, pauseReason: reason || null, pauseK: key || null, pauseP: key && params ? params : null };
    if (!was) patch.pausedAt = ts;
    return patch;
  }
  const patch = { paused: null, pausedAt: null, pauseReason: null, pauseK: null, pauseP: null };
  const at = Number(st.pausedAt);
  const spent = Number.isFinite(at) ? Math.max(0, now - at) : 0;
  if (st.playStart) patch.playPaused = (Number(st.playPaused) || 0) + spent;
  if (st.voteSecs) patch.votePaused = (Number(st.votePaused) || 0) + spent;
  return patch;
}

/** Da quanto tempo la serata è in pausa (millisecondi), 0 se non lo è. */
export function pausedFor(state, now) {
  if (!state?.paused) return 0;
  const at = Number(state.pausedAt);
  return Number.isFinite(at) ? Math.max(0, now - at) : 0;
}

/** Tempo di gioco trascorso, senza le pause. */
export function playElapsed(state, now) {
  const start = Number(state?.playStart);
  if (!Number.isFinite(start) || !start) return 0;
  const end = state.paused && Number.isFinite(Number(state.pausedAt)) ? Number(state.pausedAt) : now;
  return Math.max(0, end - start - (Number(state.playPaused) || 0));
}
