// Prove delle analisi dello storico (js/insights.js, 1.12). node --test tests/insights.test.mjs
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const I = await import('../js/insights.js');
const day = 86400000;
const T0 = new Date(2026, 0, 5, 21, 0).getTime(); // lunedì 5 gennaio 2026, 21:00

// Serate finte: Azul cresce, Brass cala, Dixit poco votato
function nights() {
  const out = {};
  const azul = [5, 6, 8, 9];
  const brass = [9, 9, 6, 5];
  for (let i = 0; i < 4; i++) {
    out[`N${i}`] = {
      at: T0 + i * 7 * day,
      games: {
        a: { name: 'Azul', key: 'azul', n: 4, sum: azul[i] * 4, playedMin: 40, pl: ['m_A', 'm_B', 'm_C', 'm_D'], v: { m_A: azul[i], m_B: azul[i] }, w: ['m_A'], order: 1 },
        b: { name: 'Brass', key: 'brass', n: 3, sum: brass[i] * 3, playedMin: 120, w: ['m_B'], order: 2 },
        ...(i === 0 ? { d: { name: 'Dixit', key: 'dixit', n: 2, sum: 14, order: 3 } } : {})
      },
      people: { m_A: { name: 'Anna', n: 2, sumGiven: 14, wins: 1, mvp: 2 }, m_B: { name: 'Bruno', n: 2, sumGiven: 12, wins: 1, mvp: 0 } }
    };
  }
  return out;
}

test('affidabilità: pochi, discreti, solidi', () => {
  assert.equal(I.confidence(0), 'few');
  assert.equal(I.confidence(2), 'few');
  assert.equal(I.confidence(3), 'ok');
  assert.equal(I.confidence(8), 'solid');
});

test('stesso gioco serata per serata, con il numero di voti', () => {
  const s = I.gameSessions(nights(), 'Azul');
  assert.equal(s.length, 4);
  assert.deepEqual(s.map((x) => x.avg), [5, 6, 8, 9]);
  assert.equal(s[0].players, 4);
  assert.equal(I.gameSessions(nights(), 'Dixit')[0].few, true, 'due voti: da non confrontare');
});

test('tendenze: solo con abbastanza serate e voti', () => {
  const t = I.trends(nights());
  const azul = t.find((x) => x.name === 'Azul');
  const brass = t.find((x) => x.name === 'Brass');
  assert.equal(azul.dir, 'up');
  assert.equal(brass.dir, 'down');
  assert.ok(!t.some((x) => x.name === 'Dixit'), 'una serata sola: nessuna tendenza');
  assert.equal(I.trends(nights(), { minNights: 5 }).length, 0);
});

test('stagioni a confronto e riepilogo di un periodo', () => {
  const ns = nights();
  ns.N9 = { at: new Date(2026, 4, 10, 21).getTime(), games: { a: { name: 'Azul', key: 'azul', n: 3, sum: 21 } }, people: {} };
  const list = I.seasonList(ns);
  assert.ok(list.length >= 2);
  const c = I.compareSeasons(ns, list[0].id, list[1].id);
  assert.equal(c.a.nights + c.b.nights, 5);
  assert.equal(c.uneven, true, '1 serata contro 4: confronto da leggere con prudenza');
  const { from, to } = I.periodBounds('month', T0);
  const r = I.periodRecap(ns, from, to);
  assert.equal(r.nights, 4);
  assert.equal(r.most.name, 'Azul');
  assert.equal(r.winner.name, 'Anna');
});

test('abitudini: giorni e mesi', () => {
  const h = I.habits(nights());
  assert.equal(h.total, 4);
  assert.equal(h.topDay, 0, 'lunedì');
  assert.equal(h.topMonth, 0, 'gennaio');
  assert.equal(h.grid[0][0], 4);
});

test('gusti del gruppo e modalità (dall\'armadio o dal riassunto)', () => {
  const lib = { x: { name: 'Azul', mode: 'competitivo', weight: 1.8, duration: 45 }, y: { name: 'Brass', mode: 'competitivo', weight: 3.9 } };
  const p = I.tasteProfile(nights(), lib);
  assert.ok(p.find((x) => x.dim === 'weight' && x.value === 'heavy'));
  assert.ok(p.find((x) => x.dim === 'mode' && x.value === 'competitivo').n >= 3);
  assert.ok(p.every((x) => x.n >= 3), 'mai valori su meno di 3 voti');
});

test('report della collezione: mai giocati, amati, polverosi', () => {
  const lib = { a: { name: 'Azul' }, b: { name: 'Brass' }, c: { name: 'Mai Visto' }, e: { name: 'Espansione', baseId: 'a' } };
  const r = I.collectionReport(lib, nights(), T0 + 400 * day);
  assert.equal(r.total, 3, 'le espansioni non contano');
  assert.deepEqual(r.never.map((x) => x.name), ['Mai Visto']);
  assert.equal(r.dusty.length, 2);
  assert.equal(r.often[0].nights, 4);
});

test('esportazione statistica: filtri e nomi nascosti di base', () => {
  const all = I.statsExport(nights());
  assert.equal(all.rows.length, 9);
  assert.ok(!all.csv.includes('Anna') && all.csv.includes('P1'), 'niente nomi di base');
  assert.ok(I.statsExport(nights(), { names: true }).csv.includes('Anna'));
  const only = I.statsExport(nights(), { game: 'Brass', from: T0 + 7 * day });
  assert.equal(only.rows.length, 3);
  const me = I.statsExport(nights(), { person: 'm_A' });
  assert.equal(me.rows.length, 4, 'solo le partite in cui la persona ha votato');
  assert.equal(JSON.parse(me.json).format, 'gamenight-stats');
});

test('statistiche personali: solo le proprie', () => {
  const st = I.personalStats([{ id: 'GRP123', name: 'Amici', nights: nights() }], { GRP123: ['m_A'] });
  assert.equal(st.length, 1);
  assert.equal(st[0].nights, 4);
  assert.equal(st[0].wins, 4);
  assert.deepEqual(st[0].games.Azul, [5, 6, 8, 9]);
  assert.ok(!JSON.stringify(st).includes('Bruno'), 'niente dati degli altri');
});

test('racconto della serata: solo dati veri, commenti facoltativi', () => {
  const n = nights().N3;
  n.quotes = [{ name: 'Anna', game: 'Azul', text: 'Bellissimo' }];
  const s = I.nightStory(n);
  assert.equal(s[0].k, 'story.open');
  assert.equal(s.find((x) => x.k === 'story.best').p.name, 'Azul');
  assert.ok(s.some((x) => x.k === 'story.quote'));
  assert.ok(!I.nightStory(n, { withQuotes: false }).some((x) => x.k === 'story.quote'));
  assert.deepEqual(I.nightStory({ games: {} }), []);
});

// ---------------------------------------------------------------- 1.12: tradizioni e premi del gruppo
const S = await import('../js/stats.js');
const T = await import('../js/traditions.js');
const TP = await import('../js/templates.js');
const PO = await import('../js/portability.js');

test('premi del gruppo: puliti, al massimo 6, mai agli ospiti nel riassunto', () => {
  const raw = { a2: { t: 'Re del <b>bluff</b>', e: '👑', uid: 'u1', at: 2 }, a1: { t: 'Lumaca', e: 'x', uid: 'u2', at: 1 }, bad: { t: '', uid: 'u1' }, g: { t: 'Ospite top', uid: 'u3', at: 3 } };
  const l = S.customAwardList(raw);
  assert.deepEqual(l.map((a) => a.id), ['a1', 'a2', 'g']);
  assert.equal(l[1].t, 'Re del bbluff/b', 'niente simboli di pagina');
  assert.equal(l[0].e, '', 'simbolo non ammesso: tolto');
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`x${i}`, { t: `P${i}`, uid: 'u1', at: i }]));
  assert.equal(S.customAwardList(many).length, S.CUSTOM_AWARD_MAX);
  const players = { u1: { name: 'Anna', memberId: 'M1' }, u2: { name: 'Bruno' }, u3: { name: 'Gino', guest: true } };
  const board = S.buildBoard({ g1: { name: 'Azul', status: 'revealed', order: 1, libraryId: 'L1' } }, { g1: { u1: { overall: 8 }, u2: { overall: 6 } } });
  const sum = S.nightSummary(board, players, { createdAt: 1 }, [], { custom: raw, library: { L1: { name: 'Azul', mode: 'competitivo', weight: 1.83 } } });
  assert.deepEqual(sum.custom.map((a) => [a.t, a.name, a.k]), [['Lumaca', 'Bruno', 'bruno'], ['Re del bbluff/b', 'Anna', 'm_M1']]);
  assert.ok(!JSON.stringify(sum).includes('Gino'), 'premio all’ospite: non resta nel gruppo');
  const g = Object.values(sum.games)[0];
  assert.equal(g.mode, 'competitivo', 'idea 48: modalità copiata dall’armadio');
  assert.equal(g.weight, 1.8);
  assert.equal(S.nightSummary(board, players, {}, []).custom, undefined, 'senza premi niente campo');
});

test('modelli: gioco d’apertura e premio ricorrente (idea 24)', () => {
  const s = TP.cleanSettings({ opening: '  Dixit <x> ', award: { t: 'Re del bluff', e: '👑', z: 1 }, chaos: true });
  assert.deepEqual(s, { chaos: true, opening: 'Dixit x', award: { t: 'Re del bluff', e: '👑' } });
  assert.deepEqual(TP.cleanSettings({ award: { t: '', e: '👑' }, opening: '' }), {});
  const { patch } = TP.settingsPatch({ opening: 'Dixit' });
  assert.equal(patch.opening, 'Dixit');
  assert.equal(patch.award, null, 'senza premio ricorrente il campo si toglie');
  assert.ok(TP.settingsDiff({ opening: 'Azul' }, '', { opening: 'Dixit' }).some((d) => d.key === 'opening'));
  assert.equal(TP.settingLabel('award', { t: 'Re', e: '👑' }), '👑 Re');
});

test('regole della casa: testo breve, per gioco o generali', () => {
  assert.throws(() => T.makeHouseRule('   '), /text/);
  const r = T.makeHouseRule('Chi perde <sceglie>', 'Azul', 5);
  assert.deepEqual(r, { text: 'Chi perde sceglie', g: 'Azul', at: 5 });
  assert.equal(T.makeHouseRule('x'.repeat(300)).text.length, T.HOUSE_TEXT_MAX);
  const obj = { h1: r, h2: { text: 'Pizza alle 20', at: 9 }, 'bad id!': { text: 'x' }, h3: { text: '' } };
  assert.deepEqual(T.houseList(obj).map((x) => x.id), ['h2', 'h1'], 'prima le generali; id e testi non validi spariscono');
  assert.equal(T.houseFor(obj, 'AZUL').length, 1, 'senza badare a maiuscole');
  assert.equal(T.houseFor(obj, '').length, 0);
});

test('accessori stagionali: date fisse e Pasqua calcolata', () => {
  assert.equal(T.easter(2026).getMonth(), 3); assert.equal(T.easter(2026).getDate(), 5, 'Pasqua 2026: 5 aprile');
  assert.equal(T.easter(2025).getDate(), 20, 'Pasqua 2025: 20 aprile');
  const at = (y, m, d) => new Date(y, m - 1, d, 21).getTime();
  assert.equal(T.seasonalAccessory(at(2026, 12, 24)).id, 'xmas');
  assert.equal(T.seasonalAccessory(at(2026, 12, 31)).id, 'newyear');
  assert.equal(T.seasonalAccessory(at(2027, 1, 6)).id, 'xmas');
  assert.equal(T.seasonalAccessory(at(2026, 2, 14)).id, 'valentine');
  assert.equal(T.seasonalAccessory(at(2026, 2, 17)).id, 'carnival', 'martedì grasso 2026');
  assert.equal(T.seasonalAccessory(at(2026, 4, 6)).id, 'easter', 'Pasquetta 2026');
  assert.equal(T.seasonalAccessory(at(2026, 10, 31)).id, 'halloween');
  assert.equal(T.seasonalAccessory(at(2026, 8, 10)).id, 'summer');
  assert.equal(T.seasonalAccessory(at(2026, 5, 20)), null);
  assert.equal(T.seasonalAccessory('nonsense'), null);
});

test('racconto tradotto e statistiche personali nell’esportazione (idea 60)', () => {
  const lines = I.storyText([{ k: 'story.best', p: { name: 'Azul', avg: 8.5 } }]);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('Azul'));
  const st = I.personalStats([{ id: 'GRP123', name: 'Amici', nights: nights() }], { GRP123: ['m_A'] });
  const file = PO.buildExport({ mine: st, look: null }, ['mine']);
  assert.equal(file.mine.length, 1);
  assert.ok(!('groups' in file) && !JSON.stringify(file).includes('Bruno'), 'solo i propri dati');
});
