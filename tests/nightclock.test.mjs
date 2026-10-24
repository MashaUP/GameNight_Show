// Prove del modello di pausa e timer condiviso (js/nightclock.js): node --test tests/nightclock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timerView, startTimer, pauseTimer, resumeTimer, resetTimer, addTime, nextRound, setTimerOptions,
  onNightPause, onNightResume, pausePatch, pausedFor, playElapsed, expiryKey, fmtClock, isTimer, TIMER_MAX_SECS
} from '../js/nightclock.js';

const T0 = 1_700_000_000_000;
/** Simula il server: il segnaposto dell'ora diventa l'ora vera al momento della scrittura. */
const written = (t, at) => (t ? { ...t, startAt: t.startAt === 'TS' ? at : t.startAt } : t);

test('avvio, scorrere del tempo e scadenza', () => {
  const t = written(startTimer(null, { secs: 60, kind: 'turn' }, { now: T0, startAt: 'TS', by: 'tv' }), T0);
  assert.ok(isTimer(t));
  assert.equal(t.rev, 1);
  assert.equal(t.round, 1);
  let v = timerView(t, T0);
  assert.equal(v.status, 'running');
  assert.equal(v.sec, 60);
  v = timerView(t, T0 + 30_500);
  assert.equal(v.sec, 30);
  assert.ok(Math.abs(v.frac - 29.5 / 60) < 1e-9);
  v = timerView(t, T0 + 61_000);
  assert.equal(v.status, 'done');
  assert.equal(v.left, 0);
  assert.equal(v.overBy, 1000);
});

test('pausa e ripresa non perdono né guadagnano tempo', () => {
  let t = written(startTimer(null, { secs: 120, kind: 'round' }, { now: T0, startAt: 'TS' }), T0);
  t = pauseTimer(t, T0 + 50_000);
  assert.equal(t.status, 'paused');
  assert.equal(t.left, 70_000);
  assert.equal(t.rev, 2);
  // In pausa il tempo resta fermo anche dopo molto
  assert.equal(timerView(t, T0 + 10 * 60_000).sec, 70);
  t = written(resumeTimer(t, T0 + 400_000, { startAt: 'TS' }), T0 + 400_000);
  assert.equal(t.status, 'running');
  assert.equal(timerView(t, T0 + 410_000).sec, 60);
  // Una seconda pausa su un timer già in pausa non scrive niente
  const p = pauseTimer(t, T0 + 420_000);
  assert.equal(pauseTimer(p, T0 + 421_000), null);
});

test('orologi diversi: ogni dispositivo usa l’ora del server, non la sua', () => {
  const t = written(startTimer(null, { secs: 30 }, { now: T0, startAt: 'TS' }), T0);
  // Due dispositivi con orologi sbagliati di ±7 s ma ora del server corretta: stesso risultato
  const serverNow = T0 + 12_000;
  assert.equal(timerView(t, serverNow).sec, timerView(t, serverNow).sec);
  // Partenza non ancora confermata dal server (segnaposto): il tempo non scorre e non va in negativo
  const pending = startTimer(null, { secs: 30 }, { now: T0, startAt: { '.sv': 'timestamp' } });
  assert.equal(timerView(pending, T0 + 99_000).sec, 30);
  // Ora del server di poco indietro rispetto all'istante di partenza: niente tempo in più
  assert.equal(timerView(t, T0 - 500).sec, 30);
});

test('azzeramento, tempo in più, turno successivo', () => {
  let t = written(startTimer(null, { secs: 60, kind: 'turn' }, { now: T0, startAt: 'TS' }), T0);
  t = resetTimer(t);
  assert.equal(t.status, 'idle');
  assert.equal(timerView(t, T0 + 99_000).sec, 60);
  t = written(resumeTimer({ ...t, status: 'paused' }, T0, { startAt: 'TS' }), T0);
  t = written(addTime(t, 30, T0 + 10_000, { startAt: 'TS' }), T0 + 10_000);
  assert.equal(timerView(t, T0 + 10_000).sec, 80);
  assert.equal(t.secs, 80);
  t = written(nextRound(t, { now: T0 + 20_000, startAt: 'TS' }), T0 + 20_000);
  assert.equal(t.round, 2);
  assert.equal(timerView(t, T0 + 20_000).sec, 80);
  // Il turno successivo è un nuovo scadere (chiave diversa), quindi suona di nuovo
  const k1 = expiryKey(t);
  const t2 = written(nextRound(t, { now: T0 + 30_000, startAt: 'TS' }), T0 + 30_000);
  assert.notEqual(expiryKey(t2), k1);
  // Tempo tolto fino a zero: fermo, non negativo
  const z = addTime(t2, -999, T0 + 31_000, { startAt: 'TS' });
  assert.equal(z.status, 'idle');
  assert.equal(z.left, 0);
  assert.equal(timerView(z, T0 + 40_000).status, 'done');
  // Limiti della durata
  const big = startTimer(null, { secs: 999_999 }, { now: T0, startAt: 'TS' });
  assert.equal(big.secs, TIMER_MAX_SECS);
  const small = startTimer(null, { secs: 1 }, { now: T0, startAt: 'TS' });
  assert.equal(small.secs, 5);
});

test('timer collegato e indipendente dalla pausa della serata', () => {
  const linked = written(startTimer(null, { secs: 100, follow: true }, { now: T0, startAt: 'TS' }), T0);
  const free = written(startTimer(null, { secs: 100, follow: false }, { now: T0, startAt: 'TS' }), T0);
  const lp = onNightPause(linked, T0 + 10_000);
  assert.equal(lp.status, 'paused');
  assert.equal(lp.nightPaused, true);
  assert.equal(onNightPause(free, T0 + 10_000), null, 'il timer indipendente continua');
  const lr = written(onNightResume(lp, T0 + 500_000, { startAt: 'TS' }), T0 + 500_000);
  assert.equal(lr.status, 'running');
  assert.equal(timerView(lr, T0 + 500_000).sec, 90);
  // Un timer messo in pausa a mano NON riparte con la ripresa della serata
  const manual = pauseTimer(linked, T0 + 5_000);
  assert.equal(onNightResume(manual, T0 + 9_000, { startAt: 'TS' }), null);
  // Opzioni cambiate senza toccare il conto alla rovescia
  const o = setTimerOptions(linked, { follow: false, sound: false });
  assert.equal(o.follow, false);
  assert.equal(o.sound, false);
  assert.equal(o.startAt, linked.startAt);
  assert.equal(o.rev, linked.rev + 1);
});

test('pausa della serata: patch dello stato e tempi', () => {
  const st = { phase: 'idle', playStart: T0, voteSecs: 60, playPaused: 1000 };
  const on = pausePatch(st, true, { now: T0 + 10_000, ts: 'TS', reason: 'Pizza' });
  assert.deepEqual(on, { paused: true, pauseReason: 'Pizza', pauseK: null, pauseP: null, pausedAt: 'TS' });
  const paused = { ...st, ...on, pausedAt: T0 + 10_000 };
  // Ri-mettere in pausa con un altro motivo cambia solo il motivo
  assert.deepEqual(pausePatch(paused, true, { now: T0 + 11_000, ts: 'TS', reason: 'Telefono' }), { paused: true, pauseReason: 'Telefono', pauseK: null, pauseP: null });
  assert.equal(pausePatch(paused, true, { now: T0 + 11_000, ts: 'TS', reason: 'Pizza' }), null);
  assert.equal(pausedFor(paused, T0 + 70_000), 60_000);
  assert.equal(playElapsed(paused, T0 + 999_000), 9_000, 'il cronometro della partita è fermo in pausa');
  const off = pausePatch(paused, false, { now: T0 + 70_000 });
  assert.equal(off.paused, null);
  assert.equal(off.playPaused, 61_000);
  assert.equal(off.votePaused, 60_000);
  const after = { ...paused, ...off };
  assert.equal(playElapsed(after, T0 + 80_000), 80_000 - 61_000);
  assert.equal(pausePatch({ phase: 'idle' }, false, { now: T0 }), null);
  assert.equal(off.pauseK, null, 'alla ripresa sparisce anche il motivo neutro');
  // Time-out: testo per le versioni vecchie e codice neutro per la lingua di ogni schermo
  const to = pausePatch(st, true, { now: T0, ts: 'TS', reason: 'Time-out chiamato da Anna', key: 'timeout', params: { name: 'Anna', why: 'bathroom' } });
  assert.equal(to.pauseK, 'timeout');
  assert.deepEqual(to.pauseP, { name: 'Anna', why: 'bathroom' });
});

test('dati non validi dal database', () => {
  for (const bad of [null, {}, { id: 1 }, { id: 'x', kind: 'boh', secs: 60, left: 1, status: 'running', rev: 1 }, { id: 'x', kind: 'turn', secs: 60, left: 1, status: 'strano', rev: 1 }]) {
    assert.equal(timerView(bad, T0).status, 'none');
    assert.equal(pauseTimer(bad, T0), null);
    assert.equal(resetTimer(bad), null);
    assert.equal(nextRound(bad), null);
  }
});

test('formato dell’ora', () => {
  assert.equal(fmtClock(0), '0:00');
  assert.equal(fmtClock(9_001), '0:10');
  assert.equal(fmtClock(65_000), '1:05');
  assert.equal(fmtClock(3_723_000), '1:02:03');
});
