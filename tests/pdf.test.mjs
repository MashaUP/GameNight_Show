// Prove del PDF generato nel dispositivo (js/pdfdoc.js): struttura del file, testo con gli accenti,
// a capo, più pagine. node --test tests/pdf.test.mjs  (con qpdf/pdftotext, se presenti, controlla anche il file)
import './dom-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const { PdfDoc, winAnsi, pdfText, textWidth, wrap, reportPDF } = await import('../js/pdfdoc.js');

const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

test('testo: accenti in WinAnsi, emoji tolte', () => {
  assert.deepEqual(winAnsi('è'), [0xE8]);
  assert.deepEqual(winAnsi('€…'), [0x80, 0x85]);
  assert.equal(pdfText('🎲 Serata  più bella 🏆'), 'Serata più bella');
  assert.ok(textWidth('WWW', 10) > textWidth('iii', 10));
  assert.ok(textWidth('abc', 10, true) >= textWidth('abc', 10));
});

test('a capo entro la larghezza, anche con parole lunghissime', () => {
  const lines = wrap('Una frase abbastanza lunga da andare a capo più volte nella colonna stretta', 10, 80);
  assert.ok(lines.length > 2);
  for (const l of lines) assert.ok(textWidth(l, 10) <= 80.01, l);
  const long = wrap('Supercalifragilistichespiralidoso', 10, 40);
  assert.ok(long.length > 1);
  for (const l of long) assert.ok(textWidth(l, 10) <= 40.01, l);
});

test('PdfDoc: intestazione, xref coerente, parentesi protette', () => {
  const d = new PdfDoc();
  d.text('Ciao (mondo) \\ è', 40, 40);
  d.addPage();
  d.rect(10, 10, 50, 20, { fill: '#FFC93C', stroke: '#1F1A3D', r: 4 });
  const bytes = d.bytes('Prova');
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/Count 2/);
  assert.ok(s.includes('(Ciao \\(mondo\\) \\\\ \\350)'));
  // ogni voce della tabella xref punta all'inizio del suo oggetto
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  const entries = s.slice(xref).split('\n').slice(3).filter((l) => / n $/.test(l));
  entries.forEach((l, i) => assert.equal(s.slice(Number(l.slice(0, 10)), Number(l.slice(0, 10)) + 12).split(' obj')[0], `${i + 1} 0`));
});

function sample(nRows = 6, nQuotes = 4) {
  return {
    group: 'I Dadi Ribelli 🎲', color: '#7AD3FF', date: 'sabato 24 ottobre', number: 12, facts: '6 giochi · 5 giocatori · 3 h 10 min',
    rows: Array.from({ length: nRows }, (_, i) => ({ rank: i + 1, name: i === 0 ? 'Le Città Perdute: edizione con un nome molto lungo' : `Gioco ${i + 1}`, avg: 8.4 - i / 3, n: 5, crit: { Fun: 4.2, Regole: 3.8 }, mvp: ['Anna'], winners: ['Bruno', 'Carla'], minutes: 40 + i, audience: i === 1 ? 7.5 : null, consensus: 80 })),
    awards: [{ title: 'Gioco della serata', who: 'Azul', value: '8,4' }, { title: 'Re dei dadi', who: 'Bruno', value: '3 vittorie' }, { title: 'Divisivo', who: 'Brass', value: '±3' }],
    achievements: [{ title: 'Prima vittoria', who: 'Carla' }],
    quotes: Array.from({ length: nQuotes }, (_, i) => ({ name: 'Anna', game: 'Azul', text: `Commento numero ${i + 1}: bellissimo, però le regole sono lunghe (ma si impara).` })),
    photos: [], next: 'venerdì 30 ottobre, da Bruno'
  };
}

test('resoconto: PDF valido con testo leggibile', async () => {
  const blob = await reportPDF(sample(), { photos: false });
  assert.equal(blob.type, 'application/pdf');
  const buf = Buffer.from(await blob.arrayBuffer());
  const f = path.join(os.tmpdir(), `gnr_report_${process.pid}.pdf`);
  fs.writeFileSync(f, buf);
  if (has('qpdf')) execFileSync('qpdf', ['--check', f], { stdio: 'pipe' });
  if (has('pdftotext')) {
    const txt = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
    for (const w of ['I Dadi Ribelli', 'Classifica della serata', 'Gioco della serata', 'Prossima serata', 'Città', 'venerdì']) assert.ok(txt.includes(w), w);
  }
  fs.unlinkSync(f);
});

test('resoconto lungo: va su più pagine con il numero di pagina', async () => {
  const blob = await reportPDF(sample(45, 20), { photos: false });
  const s = Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const count = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(count >= 2, `pagine: ${count}`);
  assert.ok(s.includes(`1/${count}`));
});
