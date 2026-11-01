// Prove della 2.0 che non hanno bisogno del browser: nomi dei file esportati, consigli, BoardGameGeek.
// node --test tests/v2.test.mjs
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { exportName, filePart, fileDate } = await import('../js/util.js');
const { tipLimit, Tips } = await import('../js/tips.js');
const { bggToGame, bggInfoOf, mergePlan, applyMerge } = await import('../js/bgg.js');

test('filePart: niente accenti, caratteri vietati o spazi; lunghezza massima', () => {
  assert.equal(filePart('Amici del giovedì: "casa" / Andrea?'), 'Amici-del-giovedi-casa-Andrea');
  assert.equal(filePart('   '), '');
  assert.equal(filePart('x'.repeat(80), 30).length, 30);
  assert.equal(filePart('---Ciao---'), 'Ciao');
});

test('fileDate: data della serata (locale), non di oggi', () => {
  assert.equal(fileDate(new Date(2026, 9, 31, 23, 50).getTime()), '2026-10-31');
  assert.match(fileDate('non una data'), /^\d{4}-\d{2}-\d{2}$/);
});

test('exportName: GameNight_Gruppo_Data_Tipo.ext e niente sovrascritture', () => {
  try { localStorage.clear(); } catch { /* niente */ }
  const at = new Date(2026, 9, 31, 21).getTime();
  const a = exportName({ group: 'Amici del giovedì', at, kind: 'Resoconto', ext: 'pdf' });
  assert.equal(a, 'GameNight_Amici-del-giovedi_2026-10-31_Resoconto.pdf');
  const b = exportName({ group: 'Amici del giovedì', at, kind: 'Resoconto', ext: 'pdf' });
  assert.equal(b, 'GameNight_Amici-del-giovedi_2026-10-31_Resoconto_2.pdf');
  assert.equal(exportName({ group: '', at, kind: 'Backup', extra: 'ABCD', ext: 'json', unique: false }), 'GameNight_2026-10-31_Backup_ABCD.json');
  assert.equal(exportName({ at, kind: 'X', ext: '../p df' }), 'GameNight_2026-10-31_X.pdf');
});

test('consigli: livelli, tetto di volte, chiusura per sempre, categorie', () => {
  assert.equal(tipLimit(4, 'all'), 4);
  assert.equal(tipLimit(4, 'few'), 2);
  assert.equal(tipLimit(1, 'few'), 1);
  assert.equal(tipLimit(4, 'off'), 0);
  Tips.reset(); Tips.setLevel('few');
  assert.equal(Tips.allowed('t1', { max: 2 }), true);
  Tips.bump('t1');
  assert.equal(Tips.allowed('t1', { max: 2 }), false, '“pochi”: metà delle volte');
  Tips.setLevel('all');
  assert.equal(Tips.allowed('t1', { max: 2 }), true);
  Tips.close('t1');
  assert.equal(Tips.allowed('t1', { max: 9 }), false, 'chiuso con ✕ non torna');
  Tips.setCat('vote', false);
  assert.equal(Tips.allowed('t2', { cat: 'vote' }), false);
  assert.equal(Tips.pick([{ id: 't2', cat: 'vote' }, { id: 't3', cat: 'app' }]), 't3', 'il primo permesso in ordine di priorità');
  Tips.setLevel('off');
  assert.equal(Tips.pick([{ id: 't4' }]), '');
  Tips.reset(); Tips.setLevel('few');
});

test('BGG: editore, autori, età, voto e posizione; campi della persona mai sovrascritti in silenzio', () => {
  const g = bggToGame({ id: 13, name: 'CATAN', minPlayers: 3, maxPlayers: 4, time: 120, minAge: 10, weight: 2.29, rating: 7.09, rank: 512, designers: ['Klaus Teuber'], publishers: ['KOSMOS', 'Giochi Uniti'], mechanics: ['Dice Rolling'] });
  assert.equal(g.publisher, 'KOSMOS');
  assert.deepEqual({ ...g.bggInfo, at: 0 }, { designers: ['Klaus Teuber'], age: 10, rating: 7.1, rank: 512, mech: ['Dice Rolling'], at: 0 });
  assert.equal(bggInfoOf({ rank: 'Not Ranked', rating: 0 }), null);
  const plan = mergePlan({ name: 'Catan', publisher: 'Giochi Uniti', minPlayers: null }, g);
  const st = Object.fromEntries(plan.map((p) => [p.field, p.state]));
  assert.equal(st.publisher, 'conflict');
  assert.equal(st.minPlayers, 'fill');
  const kept = applyMerge({ name: 'Catan', publisher: 'Giochi Uniti' }, plan);
  assert.equal(kept.publisher, 'Giochi Uniti', 'diverso: si cambia solo se scelto');
  assert.equal(kept.minPlayers, 3);
  assert.equal(applyMerge({ publisher: 'Giochi Uniti' }, plan, new Set(['publisher'])).publisher, 'KOSMOS');
});

test('link dell\'app: gamenight://open porta solo a pagine nostre', async () => {
  globalThis.location ??= window.location;
  const { routeFromAppLink, appIntentUrl } = await import('../js/native.js');
  assert.equal(routeFromAppLink('gamenight://open?to=' + encodeURIComponent('play.html?room=ABCD')), 'play.html?room=ABCD');
  assert.equal(routeFromAppLink('gamenight://open?to=' + encodeURIComponent('https://evil.example/x')), null);
  assert.equal(routeFromAppLink('gamenight://open?to=' + encodeURIComponent('//evil.example/x')), null);
  assert.equal(routeFromAppLink('https://mashaup.github.io/x'), null);
  assert.match(appIntentUrl('play.html?room=ABCD'), /^intent:\/\/open\?to=play\.html%3Froom%3DABCD#Intent;scheme=gamenight;package=it\.gamenight\.show;/);
});
