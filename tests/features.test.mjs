// Prove delle funzioni nuove della serie 1.6–1.10 che non hanno bisogno del browser:
// Consigliere, preferiti, filtri dell'armadio. node --test tests/features.test.mjs
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { recommend } = await import('../js/stats.js');
const { cleanFavs, missingFavs, favFirst } = await import('../js/favs.js');
const { applyFilters, sortItems } = await import('../js/collection.js');

const LIB = {
  g1: { name: 'Azul', minPlayers: 2, maxPlayers: 4, duration: 45, weight: 1.8, mode: 'competitivo' },
  g2: { name: 'Pandemic', minPlayers: 2, maxPlayers: 4, duration: 60, weight: 2.4, mode: 'cooperativo' },
  g3: { name: 'Brass', minPlayers: 2, maxPlayers: 4, duration: 120, weight: 3.9, mode: 'competitivo' },
  g4: { name: 'Senza dati', minPlayers: 2, maxPlayers: 6 },
  g5: { name: 'Prestato', minPlayers: 2, maxPlayers: 4, status: 'prestato', loanId: 'L1' },
  g6: { name: 'Troppi', minPlayers: 6, maxPlayers: 10, duration: 30 }
};
const present = [{ key: 'a', name: 'Anna' }, { key: 'b', name: 'Bruno' }, { key: 'c', name: 'Carla' }];
const ids = (list) => list.map((r) => r.id).sort();

test('Consigliere: giocatori, durata e disponibilità', () => {
  const r = recommend({ library: LIB, nights: {}, present });
  assert.deepEqual(ids(r.all), ['g1', 'g2', 'g3', 'g4'], 'esclusi: prestato e per troppi giocatori');
  const short = recommend({ library: LIB, nights: {}, present, maxMinutes: 60 });
  assert.deepEqual(ids(short.all), ['g1', 'g2', 'g4'], 'Brass (120 min) escluso; senza durata resta');
  const g4 = short.all.find((x) => x.id === 'g4');
  assert.ok(g4.reasons.some((x) => /durata non indicata|duration not set/.test(x)), 'dato mancante dichiarato, non inventato');
});

test('Consigliere: difficoltà e tipologia', () => {
  const light = recommend({ library: LIB, nights: {}, present, weightMax: 2 });
  assert.deepEqual(ids(light.all), ['g1', 'g4']);
  const heavy = recommend({ library: LIB, nights: {}, present, weightMin: 3 });
  assert.deepEqual(ids(heavy.all), ['g3', 'g4']);
  assert.ok(heavy.all.find((x) => x.id === 'g4').reasons.some((x) => /difficoltà non indicata|difficulty not set/.test(x)));
  const coop = recommend({ library: LIB, nights: {}, present, mode: 'cooperativo' });
  assert.deepEqual(ids(coop.all), ['g2', 'g4']);
});

test('Consigliere: preferiti e tavolo sono solo spinte, non esclusioni', () => {
  const base = recommend({ library: LIB, nights: {}, present });
  const fav = recommend({ library: LIB, nights: {}, present, favs: new Set(['g3', 'g5']), onTable: new Set(['g2']) });
  assert.deepEqual(ids(fav.all), ids(base.all), 'stessi giochi proposti');
  const s = (r, id) => r.all.find((x) => x.id === id).score;
  assert.ok(s(fav, 'g3') > s(base, 'g3'), 'il preferito sale');
  assert.ok(s(fav, 'g2') > s(base, 'g2'), 'quello sul tavolo sale');
  assert.deepEqual(ids(fav.favs), ['g3']);
  // Il preferito non disponibile non è tra i giocabili, ma viene segnalato a parte con il motivo
  assert.ok(!fav.all.some((x) => x.id === 'g5'));
  assert.deepEqual(fav.favUnavailable.map((f) => [f.id, f.why]), [['g5', 'loan']]);
});

test('Consigliere: i gusti dei presenti contano', () => {
  const nights = { n1: { people: { a: { given: { azul: 9, pandemic: 3 } }, b: { given: { azul: 8, pandemic: 4 } } } } };
  const r = recommend({ library: LIB, nights, present });
  const s = (id) => r.all.find((x) => x.id === id).score;
  assert.ok(s('g1') > s('g2'));
  assert.ok(r.all.find((x) => x.id === 'g2').reasons.some((x) => /Anna|Bruno/.test(x)), 'chi non lo ama è nominato');
});

test('preferiti: dati puliti, mancanti, ordinamento', () => {
  const raw = { ARM001: { g1: 5, 'x.y': 3, g2: 'boh' }, bad: { g1: 1 }, ARM002: null };
  assert.deepEqual(cleanFavs(raw), { ARM001: { g1: 5, g2: 1 } });
  assert.deepEqual(cleanFavs(null), {});
  assert.deepEqual(missingFavs(new Set(['g1', 'g9']), LIB), ['g9']);
  const list = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }];
  assert.deepEqual(favFirst(list, new Set(['g3'])).map((x) => x.id), ['g3', 'g1', 'g2']);
});

test('armadio: filtro e ordinamento dei preferiti', () => {
  const items = Object.entries(LIB).map(([id, it]) => ({ id, ...it }));
  const favs = new Set(['g3', 'g4']);
  assert.deepEqual(applyFilters(items, { fav: true }, { favs }).map((x) => x.id), ['g3', 'g4']);
  assert.deepEqual(applyFilters(items, { fav: true }, {}).length, 0, 'senza preferiti nessun risultato, nessun errore');
  const sorted = sortItems(items, 'fav', { favs }).map((x) => x.id);
  assert.deepEqual(sorted.slice(0, 2).sort(), ['g3', 'g4']);
});

test('prestiti: scaduti e in scadenza', async () => {
  const { loanAlerts, alertsSig, DAY } = await import('../js/collection.js');
  const now = 1_700_000_000_000;
  const loans = {
    a: { item: 'g1', to: 'Anna', start: now - 20 * DAY, due: now - 2 * DAY },
    b: { item: 'g2', to: 'Bruno', start: now - 5 * DAY, due: now + DAY },
    c: { item: 'g3', to: 'Carla', start: now - 5 * DAY, due: now + 10 * DAY },
    d: { item: 'g4', to: 'Dario', start: now - 5 * DAY },
    e: { item: 'g5', to: 'Elena', start: now - 30 * DAY, due: now - 9 * DAY, ret: now - 8 * DAY }
  };
  const r = loanAlerts(loans, now);
  assert.deepEqual(r.overdue.map((l) => [l.id, l.days]), [['a', 2]]);
  assert.deepEqual(r.soon.map((l) => [l.id, l.days]), [['b', 1]]);
  assert.equal(alertsSig([{ aid: 'X', id: 'b' }, { aid: 'X', id: 'a' }]), 'X/a,X/b');
});

test('ritaglio: dentro la foto, rapporto rispettato, non troppo piccolo', async () => {
  const { clampCrop, centerCrop } = await import('../js/util.js');
  // Foto 1000×500, riquadro 4:3: altezza piena, larghezza 0.666
  const c = centerCrop(4 / 3, 1000, 500);
  assert.ok(Math.abs(c.h - 1) < 1e-9 && Math.abs(c.w * 1000 / (c.h * 500) - 4 / 3) < 1e-9);
  assert.ok(Math.abs(c.x - (1 - c.w) / 2) < 1e-9);
  // Fuori dai bordi: rientra
  const o = clampCrop({ x: 0.9, y: -0.3, w: 0.5, h: 0.5 }, null, 800, 600);
  assert.deepEqual([o.x, o.y], [0.5, 0]);
  // Troppo piccolo: almeno il 12%
  const sm = clampCrop({ x: 0.2, y: 0.2, w: 0.01, h: 0.01 }, null, 800, 600);
  assert.ok(sm.w >= 0.12 && sm.h >= 0.12);
  // Quadrato su foto verticale 600×900
  const sq = clampCrop({ x: 0, y: 0, w: 1, h: 1 }, 1, 600, 900);
  assert.ok(Math.abs(sq.w * 600 - sq.h * 900) < 1e-6 && sq.w <= 1 && sq.h <= 1);
  // Senza rapporto: libero
  assert.deepEqual(centerCrop(null, 10, 10), { x: 0, y: 0, w: 1, h: 1 });
});

test('catalogo pubblico: scelte del proprietario e dati privati mai pubblicati', async () => {
  const { pubFieldsOf, pubIncludes, pubGame } = await import('../js/collection.js');
  assert.deepEqual(pubFieldsOf({ status: true, loc: false }), { status: true, loc: false, exp: true, rules: true, onlyAvail: false }, 'cataloghi vecchi: come prima');
  const f = pubFieldsOf({ exp: false, rules: false, onlyAvail: true });
  assert.equal(pubIncludes({ name: 'Espansione', baseId: 'g1' }, f), false);
  assert.equal(pubIncludes({ name: 'Prestato', status: 'prestato', loanId: 'L1' }, f), false);
  assert.equal(pubIncludes({ name: 'Azul' }, f), true);
  const g = pubGame({ name: 'Azul', rules: 'Si pescano tessere', owner: 'Anna', note: 'segreta', loanTo: 'Bruno', loc: { room: 'Sala' } }, f);
  assert.equal(g.rules, undefined, 'regole escluse su richiesta');
  for (const k of ['owner', 'note', 'loanTo', 'loc']) assert.equal(g[k], undefined, `${k} mai pubblicato`);
});

test('portabilità: esportazione → importazione (andata e ritorno)', async () => {
  const P = await import('../js/portability.js');
  const lib = {
    '-Na1': { name: 'Azul', minPlayers: 2, maxPlayers: 4, duration: 45, thumb: 'data:image/jpeg;base64,AAAA', image: 'data:image/jpeg;base64,GRANDE', sel: true, loanId: 'L1', status: 'prestato', loanTo: 'Bruno' },
    '-Na2': { name: 'Azul: Pavillon d’été', baseId: '-Na1', tags: ['astratto', 'è bello'] },
    '-Na3': { name: 'Ñandú 🎲 Ünicode', note: 'nota privata' }
  };
  const loans = { L1: { item: '-Na1', name: 'Azul', to: 'Bruno', start: 1000, due: 5000 }, L9: { item: '-Nzz', to: 'Fantasma', start: 1 } };
  const file = P.buildExport({ look: { name: 'Anna', style: 'adventurer', seed: 's', color: '#FF5A4E' }, favs: { ARM001: { '-Na1': 7 } }, armadi: [{ id: 'ARM001', info: { name: 'Casa' }, lib, loans }], appVersion: '1.10.0', now: 0 }, P.CATEGORIES);
  const text = JSON.stringify(file);
  for (const secret of ['GRANDE', 'KEY', 'ownerUid', 'uids', 'token']) assert.ok(!text.includes(secret), `nel file non c'è ${secret}`);
  assert.equal(file.armadi[0].games.find((g) => g.id === '-Na1').sel, undefined);
  assert.deepEqual(file.armadi[0].loans.map((l) => l.id), ['L1'], 'prestito di un gioco inesistente scartato');
  const parsed = P.parseImport(text);
  assert.equal(parsed.kind, 'full');
  assert.equal(parsed.tampered, false);
  const v = P.validateImport(parsed);
  assert.equal(v.games, 3);
  assert.equal(v.profile.name, 'Anna');
  assert.equal(v.armadi[0].games.find((g) => g.srcId === '-Na3').game.name, 'Ñandú 🎲 Ünicode');
  // Armadio nuovo: stessi id, espansione collegata, prestito ricollegato, un'unica scrittura
  const plan = P.planArmadio(v.armadi[0], { target: 'new', withLoans: true });
  assert.deepEqual(P.planCounts(plan), { add: 3, update: 0, same: 0, invalid: 0, loans: 1 });
  let n = 0;
  const w = P.newArmadioWrites(plan, { now: 9, newId: () => `-new${n++}` });
  assert.equal(w.upd['library/-Na2'].baseId, '-Na1');
  assert.equal(w.upd['library/-Na1'].loanId, 'L1');
  assert.equal(w.upd['loans/L1'].to, 'Bruno');
  // Preferiti portati sul nuovo armadio
  assert.deepEqual(P.mapFavs(v.favs, { ARM001: { aid: 'NEW001', ids: w.ids } }), { NEW001: { '-Na1': 7 } });
  // Seconda importazione nello stesso armadio: niente doppioni
  const existing = Object.fromEntries(Object.entries(w.upd).filter(([k]) => k.startsWith('library/')).map(([k, g]) => [k.slice(8), g]));
  const again = P.planArmadio(v.armadi[0], { target: 'existing', lib: existing, mode: 'add' });
  assert.equal(again.add.length, 0, 'nessun gioco aggiunto due volte');
  assert.equal(again.same.length, 3);
});

test('portabilità: file rovinati, estranei o di versioni non supportate', async () => {
  const P = await import('../js/portability.js');
  const fails = (text, key) => assert.throws(() => P.parseImport(text), (e) => e.key === key, key);
  fails('', 'port.err.empty');
  fails('{"format":"gamenight-export","version":2,"armadi":[', 'port.err.notJson');
  fails('[1,2,3]', 'port.err.notOurs');
  fails('{"hello":"world"}', 'port.err.notOurs');
  fails('{"format":"gamenight-export","version":99}', 'port.err.newer');
  fails('{"format":"gamenight-export","version":1}', 'port.err.version');
  fails('{"format":"gamenight-armadio","version":3,"games":[]}', 'port.err.version');
  assert.throws(() => P.parseImport('x'.repeat(50), { maxBytes: 10 }), (e) => e.key === 'port.err.tooBig');
  // File modificato a mano: si legge, ma si sa
  const f = P.buildExport({ armadi: [], now: 0 }, ['armadi']);
  f.armadi.push({ id: 'ARM002', name: 'aggiunto a mano', games: [] });
  assert.equal(P.parseImport(JSON.stringify(f)).tampered, true);
  // Vecchio formato di un solo armadio (1.2)
  const old = P.parseImport(JSON.stringify({ format: 'gamenight-armadio', version: 1, armadio: { name: 'Vecchio' }, games: [{ name: 'Dixit' }, { nome: 'senza nome' }] }));
  const v = P.validateImport(old);
  assert.equal(v.games, 1);
  assert.equal(v.warnings.filter((x) => x.key === 'port.warn.badGame').length, 1);
  // Dati pericolosi: niente codice eseguito, campi ripuliti
  const evil = P.validateImport({ data: { armadi: [{ id: 'ARM001', games: [{ id: 'g1', name: '<img src=x onerror=alert(1)>', thumb: 'javascript:alert(1)', video: 'http://non-https' }], loans: [{ item: 'g1', to: '', start: 1 }] }], favs: { 'bad id': { g: 1 } } } });
  const g = evil.armadi[0].games[0].game;
  assert.equal(g.thumb, undefined);
  assert.equal(g.video, undefined);
  assert.equal(evil.armadi[0].loans.length, 0, 'prestito senza nome scartato');
  assert.deepEqual(evil.favs, {});
});

test('BoardGameGeek: scheda → campi dell’armadio, senza sovrascrivere in silenzio', async () => {
  const B = await import('../js/bgg.js');
  assert.equal(B.bggEnabled(), false, 'senza proxy l’integrazione è spenta');
  B.setBggProxy('javascript:alert(1)');
  assert.equal(B.bggEnabled(), false, 'indirizzo non https rifiutato');
  B.setBggProxy('https://proxy.example.workers.dev/');
  assert.equal(B.bggBase(), 'https://proxy.example.workers.dev');
  B.setBggProxy(null);
  const g = B.bggToGame({ id: 230802, name: 'Azul', year: 2017, minPlayers: 2, maxPlayers: 4, time: 45, weight: 1.76, categories: ['Abstract Strategy', 'Puzzle'], thumb: 'https://cf.geekdo-images.com/x.jpg', bestPlayers: [2] });
  assert.deepEqual({ name: g.name, year: g.year, min: g.minPlayers, max: g.maxPlayers, dur: g.duration, w: g.weight, ext: g.extId }, { name: 'Azul', year: 2017, min: 2, max: 4, dur: 45, w: 1.8, ext: 'bgg:230802' });
  assert.equal(B.bggIdOf('bgg:230802'), 230802);
  assert.equal(B.bggIdOf('230802'), 230802);
  assert.equal(B.bggIdOf('altro'), null);
  // Dati strani da BGG: scartati, non inventati
  const odd = B.bggToGame({ id: 1, name: 'X', minPlayers: 0, maxPlayers: 99, time: 0, weight: 0, thumb: 'http://insicuro' });
  for (const k of ['minPlayers', 'maxPlayers', 'duration', 'weight', 'thumbUrl']) assert.equal(odd[k], undefined, k);
  // Confronto: campi vuoti si riempiono, quelli diversi solo se scelti
  const cur = { name: 'Azul', minPlayers: 2, maxPlayers: 5, duration: null, tags: [] };
  const plan = B.mergePlan(cur, g);
  const st = Object.fromEntries(plan.map((p) => [p.field, p.state]));
  assert.equal(st.name, 'same');
  assert.equal(st.maxPlayers, 'conflict');
  assert.equal(st.duration, 'fill');
  assert.equal(st.tags, 'fill');
  assert.equal(B.applyMerge(cur, plan).maxPlayers, 5, 'il valore inserito a mano resta');
  assert.equal(B.applyMerge(cur, plan, new Set(['maxPlayers'])).maxPlayers, 4, 'cambia solo se scelto');
  assert.equal(B.applyMerge(cur, plan).duration, 45);
});

test('il vostro anno: solo dati veri, gruppi nuovi e giochi nuovi', async () => {
  const { wrapped } = await import('../js/stats.js');
  const at = (y, m) => new Date(y, m, 10, 21).getTime();
  const g = (name, n, sum, order) => ({ name, n, sum, order });
  const nights = {
    A: { at: at(2025, 3), games: { a: g('Azul', 3, 24, 1) }, people: { p1: { name: 'Anna', mvp: 1 } } },
    B: { at: at(2026, 1), games: { a: g('Azul', 3, 27, 1), b: g('Dixit', 3, 18, 2) }, people: { p1: { name: 'Anna', mvp: 2, wins: 1 }, p2: { name: 'Bruno' } } },
    C: { at: at(2026, 2), games: { a: g('Azul', 2, 16, 1), c: g('Brass', 0, 0, 2) }, people: { p1: { name: 'Anna' } } }
  };
  const w = wrapped(nights, 2026);
  assert.equal(w.nights, 2);
  assert.equal(w.topGames.length, 3);
  assert.deepEqual(w.topGames[0], { name: 'Azul', matches: 2, avg: (27 + 16) / 5 });
  assert.equal(w.topGames[0].name, 'Azul');
  assert.equal(w.topGames.find((x) => x.name === 'Brass').avg, null, 'nessun voto: media non inventata');
  assert.equal(w.newGames, 2, 'Dixit e Brass mai giocati negli anni prima');
  const first = wrapped(nights, 2025);
  assert.equal(first.newGames, null, 'primo anno del gruppo: non si confronta con niente');
  assert.equal(first.critic, null, 'pochi voti: niente "il più severo" inventato');
  assert.equal(wrapped(nights, 2020), null);
});

test('telecomando: il pulsante più vicino nella direzione giusta', async () => {
  const { pickNext } = await import('../js/spatialnav.js');
  const R = (x, y, w = 100, h = 40) => ({ left: x, top: y, width: w, height: h });
  const from = R(200, 200);
  const list = [
    { el: 'su', rect: R(200, 100) }, { el: 'giù', rect: R(210, 300) }, { el: 'giù-lontano', rect: R(200, 600) },
    { el: 'destra', rect: R(400, 205) }, { el: 'sinistra', rect: R(20, 190) }, { el: 'diagonale', rect: R(420, 330) }
  ];
  assert.equal(pickNext(from, list, 'up').el, 'su');
  assert.equal(pickNext(from, list, 'down').el, 'giù');
  assert.equal(pickNext(from, list, 'right').el, 'destra');
  assert.equal(pickNext(from, list, 'left').el, 'sinistra');
  assert.equal(pickNext(from, [{ el: 'x', rect: R(200, 100) }], 'down'), null, 'niente in quella direzione: il fuoco resta');
});

test('soundboard personalizzata: elenco pubblico pulito, chiavi e controlli dei file', async () => {
  const { publicList, sfxKey, customIdOf, checkFile, CSFX_MAX, CSFX_MAX_BYTES } = await import('../js/customsfx.js');
  const list = [{ id: 'cabc1', label: '<b>Tromba</b>', icon: '🎺' }, { id: 'bad id', label: 'x' }, { id: 'cdef2', label: '', icon: '💣' }];
  assert.deepEqual(publicList(list), { cabc1: { l: 'bTromba/b', i: '🎺' }, cdef2: { l: '?', i: '🔔' } });
  assert.equal(Object.keys(publicList(Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, label: 'x' })))).length, CSFX_MAX);
  assert.equal(customIdOf(sfxKey('cabc1')), 'cabc1');
  assert.equal(customIdOf('applausi'), null);
  assert.equal(customIdOf('c:../x'), null);
  assert.equal(checkFile(null), 'none');
  assert.equal(checkFile({ type: 'audio/mpeg', size: 1000 }, CSFX_MAX), 'full');
  assert.equal(checkFile({ type: 'text/html', size: 10 }), 'type');
  assert.equal(checkFile({ type: 'audio/ogg', size: CSFX_MAX_BYTES + 1 }), 'size');
  assert.equal(checkFile({ type: 'audio/wav', size: 1000 }), '');
});
