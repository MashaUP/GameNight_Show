// Prove della 2.1 senza browser: correzioni, storico, confronto, sfide, bacheca, promemoria, Discord,
// tracker, proposte, collezione BGG, limiti della serata, ricerca nei manuali.
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= window.location;
const { fixPatch } = await import('../js/night-fix.js');
const { historyCheck, editDistance, compareTop } = await import('../js/history-check.js');
const { challengeStats } = await import('../js/challenge.js');
const { boardEntry, suggEntry, suggList, boardList } = await import('../js/next-board.js');
const { reminderTime } = await import('../js/reminders.js');
const { discordSummary, validHook } = await import('../js/discord.js');
const { playsCSV, PLAYS_COLUMNS } = await import('../js/trackers.js');
const { makeProposal } = await import('../js/arm-proposals.js');
const { collectionPlan } = await import('../js/bgg.js');
const { cleanSettings, settingsPatch } = await import('../js/templates.js');
const { searchPages, highlight } = await import('../js/manual-search.js');

const NIGHT = { creatorUid: 'u1', at: 1, games: { g1: { name: 'Dixt', key: 'dixt', n: 3, sum: 21, playedMin: 30, order: 1 } } };

test('correzione del riassunto: nome (e chiave), durata, motivo obbligatorio, niente se uguale', () => {
  const { patch, entry } = fixPatch(NIGHT, 'g1', { name: 'Dixit', playedMin: 35, why: 'nome sbagliato' });
  assert.deepEqual(patch, { 'games/g1/name': 'Dixit', 'games/g1/key': 'dixit', 'games/g1/playedMin': 35 });
  assert.match(entry.what, /Dixt → Dixit/);
  assert.throws(() => fixPatch(NIGHT, 'g1', { name: 'Dixit', why: 'x' }), (e) => e.code === 'why');
  assert.throws(() => fixPatch(NIGHT, 'g1', { name: 'Dixt', playedMin: 30, why: 'niente' }), (e) => e.code === 'same');
  assert.throws(() => fixPatch(NIGHT, 'g1', { playedMin: 900, why: 'troppo' }), (e) => e.code === 'min');
  assert.throws(() => fixPatch(NIGHT, 'zz', { name: 'X', why: 'boh' }), (e) => e.code === 'game');
  assert.equal(fixPatch(NIGHT, 'g1', { name: '<b>Dixit</b>', why: 'html' }).patch['games/g1/name'], 'bDixit/b');
});

test('controllo dello storico: errori di battitura, varianti, rinominati, medie fuori scala', () => {
  assert.equal(editDistance('dixit', 'dixt'), 1);
  assert.equal(editDistance('catan', 'carcassonne', 2), 3);
  const nights = {
    A1: { at: 1, creatorUid: 'u', games: { a: { name: 'Dixit', key: 'dixit', n: 2, sum: 14 } } },
    A2: { at: 2, creatorUid: 'u', games: { a: { name: 'Dixt', key: 'dixt', n: 2, sum: 14 }, b: { name: 'Azul', key: 'azul', n: 2, sum: 40 } } },
    A3: { at: 3, games: {} },
    A4: { at: 4, creatorUid: 'u', games: { c: { name: 'azul ', key: 'azul', n: 1, sum: 5 }, d: { name: 'Codenamez', key: 'codenamez', n: 1, sum: 8 } } }
  };
  const r = historyCheck(nights, { L1: { name: 'Codenames' } });
  const kinds = r.map((x) => x.k);
  assert.equal(r[0].level, 'error');
  assert.ok(kinds.includes('avg'), 'media 20 su 2 voti');
  assert.ok(kinds.includes('typo'), 'Dixit / Dixt');
  assert.ok(kinds.includes('variants'), 'Azul / azul');
  assert.ok(kinds.includes('renamed'), 'Codenamez → Codenames');
  assert.ok(kinds.includes('empty') && kinds.includes('noCreator'));
  assert.deepEqual(historyCheck({}), []);
});

test('confronto dei primi tre: il migliore per riga è calcolato, i dati mancanti non vincono', () => {
  const recs = [
    { id: 'a', score: 90, ago: 1, item: { name: 'A', minPlayers: 2, maxPlayers: 4, duration: 60, weight: 2.5 } },
    { id: 'b', score: 70, ago: 5, item: { name: 'B', minPlayers: 2, maxPlayers: 6, duration: 30 } },
    { id: 'c', score: 70, ago: 0, item: { name: 'C', minPlayers: 5, maxPlayers: 8, duration: 90, weight: 1.5 } }
  ];
  const c = compareTop(recs, 4);
  const row = (k) => c.rows.find((r) => r.k === k);
  assert.deepEqual(c.cols.map((x) => x.name), ['A', 'B', 'C']);
  assert.equal(row('score').best, 0);
  assert.equal(row('time').best, 1);
  assert.equal(row('weight').best, 2);
  assert.equal(row('fit').worst, 2, 'C non va bene per 4');
  assert.equal(row('ago').best, 1);
  assert.equal(compareTop(recs.slice(0, 1), 4), null);
});

test('sfida fra gruppi: solo aggregati, gioco più amato con almeno 3 voti', () => {
  const now = Date.UTC(2026, 10, 1);
  const s = challengeStats({ A: { at: now - 86400000, games: { x: { name: 'Azul', key: 'azul', n: 3, sum: 27 }, y: { name: 'Uno', key: 'uno', n: 1, sum: 10 } } }, B: { at: now - 90 * 86400000, games: { x: { name: 'Azul', key: 'azul', n: 2, sum: 12 } } } }, 'Amici <b>', now);
  assert.deepEqual({ ...s, at: 0 }, { name: 'Amici b', nights: 2, games: 2, votes: 6, avg: 8.2, top: 'Azul', recent: 1, at: 0 });
  assert.ok(!JSON.stringify(s).includes('people'));
});

test('bacheca e suggerimenti: testi puliti, nomi nascosti fino alla serata (tranne il proprio)', () => {
  assert.deepEqual(boardEntry('  porto  le <b>patatine</b> ', { key: 'k1', name: 'Anna' }), { text: 'porto le bpatatine/b', key: 'k1', name: 'Anna' });
  assert.throws(() => suggEntry('x', { key: 'k', name: 'A' }), (e) => e.code === 'short');
  const next = { at: 1000, board: { b1: { text: 'ciao', name: 'A', at: 1 } }, sugg: { s1: { text: 'Azul', name: 'Anna', key: 'k1', at: 1 }, s2: { text: 'Uno', name: 'Bruno', key: 'k2', at: 2 } } };
  assert.equal(boardList(next).length, 1);
  const before = suggList(next, { me: 'k1', now: 500 });
  assert.deepEqual(before.map((s) => s.who), ['Anna', null]);
  assert.deepEqual(suggList(next, { me: 'k1', now: 2000 }).map((s) => s.who), ['Anna', 'Bruno']);
});

test('promemoria: anticipo, mai nel passato', () => {
  const now = 1_000_000_000;
  assert.equal(reminderTime(now + 7200e3, 60, now), now + 3600e3);
  assert.equal(reminderTime(now + 600e3, 60, now), 0);
  assert.equal(reminderTime(now + 7200e3, 0, now), 0);
});

test('Discord: webhook valido, testo senza menzioni né markdown dai nomi, entro il limite', () => {
  assert.equal(validHook('https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_ABC-123'), true);
  assert.equal(validHook('https://evil.example/api/webhooks/1/2'), false);
  const txt = discordSummary({ group: 'Amici', date: '31 ottobre', board: [{ name: '*Azul*', avg: 8.25, n: 3 }, { name: '@everyone', avg: 6, n: 2 }], mvp: ['Anna'], kings: ['Bruno'], awards: [{ title: 'Re', who: 'Carla' }], next: 'venerdì', labels: { board: 'Classifica', votes: (n) => `${n} voti`, kings: 'Re', next: 'Prossima', decimal: ',' } });
  assert.match(txt, /\\\*Azul\\\*/);
  assert.ok(!/@everyone/.test(txt), 'menzione disinnescata');
  assert.match(txt, /8,3/);
  const long = discordSummary({ group: 'x', date: 'y', board: Array.from({ length: 10 }, () => ({ name: 'n'.repeat(300), avg: 5, n: 1 })), labels: { board: 'b', votes: () => 'v', kings: 'k', next: 'n' } });
  assert.ok(long.length <= 1900);
});

test('partite per i tracker: una riga per giocatore, ospiti anonimi, niente formule', () => {
  const csv = playsCSV(
    { g1: { name: '=Azul', status: 'revealed', order: 1, revealedAt: Date.UTC(2026, 9, 31), libraryId: 'L1', scores: { a: 40, b: 35 }, winners: { a: true }, playedMin: 45 } },
    { g1: { a: { overall: 8 }, b: { overall: 7 }, c: { overall: 9 } } },
    { a: { name: 'Anna' }, b: { name: 'Bruno', guest: true }, c: { name: 'Carla' } },
    { L1: { extId: 'bgg:230802' } }, { code: 'ABCD' });
  const lines = csv.replace('﻿', '').trim().split('\n');
  assert.equal(lines[0], PLAYS_COLUMNS.join(','));
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => l.includes('Guest 1')) && !csv.includes('Bruno'));
  assert.ok(lines[1].startsWith('2026-10-31,"\'=Azul",230802,'), lines[1]);
});

test('proposte per l\'armadio: solo campi cambiati, limiti, motivo', () => {
  const p = makeProposal({ name: 'Azul', minPlayers: 2, maxPlayers: 4 }, { itemId: 'L1', minPlayers: '2', maxPlayers: '5', weight: '1,8', why: 'scatola' }, { uid: 'u9', name: 'Anna' });
  assert.deepEqual(p.patch, { maxPlayers: 5, weight: 1.8 });
  assert.throws(() => makeProposal({}, { itemId: 'L1', duration: '0', why: 'xxx' }, { uid: 'u' }), (e) => e.code === 'range');
  assert.throws(() => makeProposal({ maxPlayers: 4 }, { itemId: 'L1', minPlayers: '6', why: 'xxx' }, { uid: 'u' }), (e) => e.code === 'minmax');
  assert.throws(() => makeProposal({}, { itemId: 'L1', why: 'xxx' }, { uid: 'u' }), (e) => e.code === 'empty');
  assert.throws(() => makeProposal({}, { itemId: 'L1', note: 'ok', why: '' }, { uid: 'u' }), (e) => e.code === 'why');
});

test('collezione BGG: nuovi, già presenti (numero BGG o nome), espansioni', () => {
  const plan = collectionPlan([{ id: 13, name: 'CATAN' }, { id: 822, name: 'Carcassonne' }, { id: 1, name: 'Nuovo' }, { id: 926, name: 'Seafarers', type: 'boardgameexpansion' }], { L1: { name: 'Catàn' }, L2: { name: 'Carc', extId: 'bgg:822' } });
  assert.deepEqual(plan.map((x) => x.state), ['have', 'have', 'new', 'exp']);
});

test('limiti della serata nei modelli', () => {
  assert.deepEqual(cleanSettings({ maxMinutes: 180, maxGames: 5, chaos: true }), { chaos: true, maxMinutes: 180, maxGames: 5 });
  assert.deepEqual(cleanSettings({ maxMinutes: 10, maxGames: 99 }), {});
  assert.equal(settingsPatch({ maxGames: 3 }).patch.maxGames, 3);
  assert.equal(settingsPatch({}).patch.maxMinutes, null);
});

test('ricerca nel manuale: tutte le parole, senza accenti, pagina più pertinente prima, evidenziazione sicura', () => {
  const pages = [{ page: 1, text: 'Preparazione del gioco.' }, { page: 4, text: 'In caso di parità vince chi ha più monete. Parità di monete: si condivide.' }, { page: 7, text: 'Fine della partita e parita finale.' }];
  const r = searchPages(pages, 'parità');
  assert.deepEqual(r.map((x) => x.page), [4, 7]);
  assert.deepEqual(searchPages(pages, 'parita monete').map((x) => x.page), [4]);
  assert.deepEqual(searchPages(pages, 'x'), []);
  assert.equal(highlight('<b>parità</b>', 'parità'), '&lt;b&gt;<mark>parità</mark>&lt;/b&gt;');
});

test('storico per criterio e modalità (idea 7)', async () => {
  const { modeCriteria } = await import('../js/insights.js');
  const nights = {
    A: { at: 1, games: { a: { name: 'Pandemic', key: 'pandemic', mode: 'cooperativo', n: 3, sum: 24, nC: 3, sumC: 12, nS: 3, sumS: 9, nR: 2, sumR: 8 } } },
    B: { at: 2, games: { b: { name: 'Dixit', key: 'dixit', n: 4, sum: 28, nC: 4, sumC: 16 } } }
  };
  const r = modeCriteria(nights, { L: { name: 'Dixit', mode: 'competitivo' } });
  assert.deepEqual(r.map((x) => x.mode), ['cooperativo', 'competitivo']);
  assert.equal(r[0].crit.coinv.avg, 4);
  assert.equal(r[0].crit.rigioc, null, 'meno di 3 voti: niente media');
  assert.equal(r[1].crit.coinv.avg, 4);
});

test('cronologia del gruppo: prima serata, ritorni, record e più amato solo con abbastanza voti', async () => {
  const { groupTimeline } = await import('../js/insights.js');
  const D = 864e5;
  const g = (name, n, sum) => ({ name, key: name.toLowerCase(), n, sum });
  const nights = {
    A: { at: 1 * D, games: { a: g('Azul', 3, 21) }, people: { p1: { name: 'Anna' } } },
    B: { at: 2 * D, games: { a: g('Dixit', 3, 27), b: g('Uno', 1, 10) }, people: { p1: { name: 'Anna' }, p2: { name: 'Bruno' } } },
    C: { at: 300 * D, games: { a: g('Azul', 6, 54) }, people: {} }
  };
  const ev = groupTimeline(nights);
  const ks = ev.map((e) => e.k);
  assert.equal(ev[ev.length - 1].k, 'first');
  assert.ok(ks.includes('newcomer') && ev.find((e) => e.k === 'newcomer').name === 'Bruno');
  assert.ok(ev.some((e) => e.k === 'rediscovered' && e.name === 'Azul' && e.days === 299));
  assert.ok(ev.some((e) => e.k === 'record' && e.name === 'Dixit'), 'Dixit 9 batte Azul 7');
  assert.ok(!ev.some((e) => e.k === 'record' && e.name === 'Uno'), 'un voto solo non è un record');
  assert.ok(ev.some((e) => e.k === 'leader' && e.name === 'Azul' && e.prev === undefined) === false);
});
