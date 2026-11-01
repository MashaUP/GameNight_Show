// Prove delle regole dello show sulla TV (js/show.js, 1.13). node --test tests/show.test.mjs
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const X = await import('../js/show.js');

test('scene: valori puliti e silenzio intelligente (idee 1 e 17)', () => {
  assert.deepEqual(X.cleanScenes({ reveal: { fx: 'soft', music: 'festa' }, voting: { fx: 'full' }, bogus: { fx: 'off' }, lobby: { fx: 'boom' }, quiet: { rules: false, x: true } }),
    { reveal: { fx: 'soft', music: 'festa' }, quiet: { rules: false } });
  const s = X.sceneFor('reveal', { reveal: { fx: 'off' } });
  assert.equal(s.fx, 'off'); assert.equal(s.music, 'auto'); assert.equal(s.duck, false);
  assert.equal(X.sceneFor('idle', {}, { rulesOpen: true }).duck, true, 'regole aperte: musica abbassata di base');
  assert.equal(X.sceneFor('idle', { quiet: { rules: false } }, { rulesOpen: true }).duck, false, 'regola spenta');
  assert.equal(X.sceneFor('voting', {}).duck, false);
  assert.deepEqual(X.sceneFor('voting', { quiet: { voting: true } }).why, ['voting']);
  assert.equal(X.fxScale('soft'), 0.4); assert.equal(X.fxScale('off'), 0);
});

test('finale scelto dai numeri (idea 2)', () => {
  assert.equal(X.finaleStyle({ n: 4, avg: 9, consensus: 90 }), 'triumph');
  assert.equal(X.finaleStyle({ n: 4, avg: 9, consensus: 60 }), 'loved');
  assert.equal(X.finaleStyle({ n: 4, avg: 6.5, consensus: 30 }), 'divisive');
  assert.equal(X.finaleStyle({ n: 2, avg: 6.5, consensus: 30 }), 'calm', 'con 2 voti non si parla di divisione');
  assert.equal(X.finaleStyle({ n: 3, avg: 4, consensus: 20 }), 'flop');
  assert.equal(X.finaleStyle({ n: 1, avg: 10 }), 'calm');
  assert.equal(X.finaleStyle(null), 'calm');
});

test('squadre: somma dei punti per squadra (idea 3)', () => {
  const teams = [['a', 'b'], ['c', 'd']];
  const scores = { p1: { a: 10, b: 5, c: 20, x: 99 }, p2: { a: 3, d: 'z', c: 1 } };
  const t = X.teamTotals(teams, scores);
  assert.deepEqual(t.map((x) => [x.i, x.total, x.games]), [[1, 21, 2], [0, 18, 2]]);
  assert.equal(t[0].best, 20);
  assert.deepEqual(X.teamTotals(null, scores), []);
  assert.deepEqual(X.teamTotals({ 0: { 0: 'a' } }, { p: { a: 2 } }).map((x) => x.total), [2], 'squadre lette come oggetti di Firebase');
});

test('imprevisti ammessi e spicchi della ruota (idea 4)', () => {
  const ev = X.CHAOS_KEYS.map((k) => ({ k }));
  assert.equal(X.allowedChaos(ev, { swap: true, draw: true }).length, ev.length - 2);
  assert.equal(X.allowedChaos(ev, Object.fromEntries(X.CHAOS_KEYS.map((k) => [k, true]))).length, ev.length, 'mai una ruota vuota');
  const sl = X.wheelSlices(ev, ev[3]);
  assert.equal(sl.length, 6); assert.equal(sl[5], ev[3]);
});

test('presenze: in gioco, spettatori, via, tardi, mancano (idea 6)', () => {
  const players = { a: { name: 'Anna' }, b: { name: 'Bruno', watch: true }, c: { name: 'Carla', away: true }, d: { name: 'Dario' } };
  const games = { g1: { order: 1, status: 'revealed' }, g2: { order: 2, status: 'revealed' } };
  const votes = { g1: { a: {} }, g2: { a: {}, d: {} } };
  const v = X.presenceView(players, { games, votes, rsvp: { r1: { name: 'Élia', answer: 'si' }, r2: { name: 'anna', answer: 'si' }, r3: { name: 'Zoe', answer: 'no' } } });
  assert.deepEqual(v.playing.map((p) => p.uid), ['a', 'd']);
  assert.deepEqual(v.watching.map((p) => p.uid), ['b']);
  assert.deepEqual(v.away.map((p) => p.uid), ['c']);
  assert.deepEqual(v.late.map((p) => p.uid), ['d']);
  assert.deepEqual(v.missing, ['Élia']);
});

test('criteri per modalità (idea 7)', () => {
  const meta = { voting: { sempl: false }, votingByMode: { cooperativo: { coinv: false, custom: [{ label: 'Tensione' }] } } };
  assert.deepEqual(X.votingForMode(meta, 'cooperativo'), meta.votingByMode.cooperativo);
  assert.deepEqual(X.votingForMode(meta, 'competitivo'), meta.voting);
  assert.equal(X.votingForMode({}, 'cooperativo'), null);
  assert.deepEqual(X.gameVoting({ voting: { rigioc: false } }, meta), { rigioc: false });
  assert.deepEqual(X.gameVoting({}, meta), meta.voting);
});

test('ospiti anonimi a fine serata (idea 12)', () => {
  const p = X.guestAnonPatch({ u1: { name: 'Zed', guest: true, photo: 'data:x' }, u2: { name: 'Anna' }, u3: { name: 'Bea', guest: true }, u4: { name: 'Ospite 9', guest: true, anon: true } }, (n) => `Ospite ${n}`);
  assert.equal(p['players/u3/name'], 'Ospite 1');
  assert.equal(p['players/u1/name'], 'Ospite 2');
  assert.equal(p['players/u1/photo'], null);
  assert.ok(!('players/u2/name' in p) && !('players/u4/name' in p));
});

test('volumi per categoria (idea 16)', () => {
  assert.equal(X.cleanVolume('fx', 0.33), 0.35);
  assert.equal(X.cleanVolume('voice', 7), 1);
  assert.equal(X.cleanVolume('atmo', null), X.AUDIO_DEFAULT.atmo);
  assert.equal(X.cleanVolume('nope', 0.5), 0);
});

test('temi: contrasto WCAG (idea 21)', () => {
  assert.equal(X.contrast('#000000', '#FFFFFF'), 21);
  assert.equal(X.contrast('#777777', '#777777'), 1);
  assert.equal(X.contrast('rosso', '#fff'), null);
  const good = X.checkTheme({ bg: '#1f1a3d', accent: '#FFC93C', font: 'serif', podium: 'gold', extra: 1 });
  assert.equal(good.ok, true); assert.deepEqual(Object.keys(good.theme), ['bg', 'accent', 'font', 'podium']);
  const bad = X.checkTheme({ bg: '#EEEEEE', accent: '#333333' });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.problems.map((p) => p.k).sort(), ['accentText', 'bgText']);
  assert.ok(X.checkTheme({ bg: '#1F1A3D', accent: '#2A2550' }).problems.some((p) => p.k === 'accentBg'), 'accento che non si distingue dallo sfondo');
});

test('pacchetti di atmosfera: letti senza fidarsi (idea 22)', () => {
  const ok = X.parsePack(JSON.stringify({ format: 'gamenight-atmo', version: 1, name: 'Spiaggia <b>', colors: ['#FFD34D', 'red', '#3DF5E0'], particles: { kind: 'emoji', emoji: ['🐚', '<img>', 'abc', '🌴'], count: 999, dir: 'up', speed: 9 }, bg: { top: '#003366', bottom: '#0077AA' }, script: 'alert(1)' }));
  assert.equal(ok.name, 'Spiaggia b');
  assert.deepEqual(ok.colors, ['#FFD34D', '#3DF5E0']);
  assert.deepEqual(ok.particles, { kind: 'emoji', emoji: ['🐚', '🌴'], count: 120, dir: 'up', speed: 3 });
  assert.ok(!('script' in ok));
  for (const [txt, code] of [['x'.repeat(210000), 'size'], ['{', 'json'], ['{"format":"altro"}', 'format'], ['{"format":"gamenight-atmo","version":2}', 'version'],
    ['{"format":"gamenight-atmo","version":1,"name":" "}', 'name'], ['{"format":"gamenight-atmo","version":1,"name":"A","colors":["blu"]}', 'colors']]) {
    assert.throws(() => X.parsePack(txt), (e) => e.code === code, code);
  }
  assert.equal(X.parsePack('{"format":"gamenight-atmo","version":1,"name":"A","colors":["#000000"],"particles":{"kind":"emoji"}}').particles.kind, 'dots', 'emoji senza simboli: puntini');
});

test('profili di presentazione: solo preferenze della TV (idea 26)', () => {
  for (const k of X.PRESENTATION_KEYS) {
    const p = X.presentationPrefs(k);
    assert.deepEqual(Object.keys(p).sort(), ['commentator', 'far', 'music', 'scenes', 'volumes']);
  }
  assert.equal(X.presentationPrefs('minimal').scenes.reveal.fx, 'off');
  assert.equal(X.presentationPrefs('nessuno'), null);
});

test('pacchetti con immagine di sfondo: solo data URI di immagini (2.1)', async () => {
  const { parsePack } = await import('../js/show.js');
  const base = { format: 'gamenight-atmo', version: 1, name: 'Mare', colors: ['#3DF5E0'], bg: { top: '#0B2A4A', bottom: '#1E6F8F' } };
  assert.equal(parsePack(JSON.stringify({ ...base, bg: { ...base.bg, image: 'data:image/webp;base64,AAAA' } })).bg.image, 'data:image/webp;base64,AAAA');
  assert.equal(parsePack(JSON.stringify({ ...base, bg: { ...base.bg, image: 'https://evil.example/x.png' } })).bg.image, undefined);
  assert.equal(parsePack(JSON.stringify({ ...base, bg: { ...base.bg, image: 'data:image/svg+xml;base64,AAAA' } })).bg.image, undefined);
});

test('ritmo del reveal nelle scene (2.1)', async () => {
  const { cleanScenes, sceneFor, paceScale } = await import('../js/show.js');
  assert.deepEqual(cleanScenes({ reveal: { pace: 'slow' }, voting: { pace: 'boh' } }), { reveal: { pace: 'slow' } });
  assert.equal(sceneFor('reveal', { reveal: { pace: 'fast' } }).pace, 'fast');
  assert.equal(sceneFor('idle', {}).pace, 'normal');
  assert.equal(paceScale('slow'), 1.5); assert.equal(paceScale('x'), 1);
});

