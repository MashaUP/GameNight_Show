// Resoconto stampabile della serata: si salva in PDF dalla finestra di stampa del browser.
import { esc, fmt, downloadFile } from './util.js';
import { isApp } from './native.js';

function names(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

/**
 * d: { group, emblem, color, date, number, facts, rows: [{ rank, name, avg, n, crit: {label: value}, mvp, winners, minutes, audience, consensus }],
 *      awards: [{ title, who, value }], achievements: [{ who, title }], quotes: [{ name, game, text }], photos: [{ data, caption, by }], next }
 */
export function reportHTML(d) {
  const font = (f) => new URL(`assets/fonts/${f}`, location.href).href;
  const color = /^#[0-9A-Fa-f]{6}$/.test(d.color || '') ? d.color : '#FFC93C';
  const critHeads = [...new Set(d.rows.flatMap((r) => Object.keys(r.crit || {})))];
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(`GameNight Show · ${d.group || 'Serata'} · ${d.date}`)}</title>
<style>
@font-face { font-family: 'Lilita One'; src: url('${font('lilita-one.woff2')}') format('woff2'); }
@font-face { font-family: 'Nunito'; src: url('${font('nunito.woff2')}') format('woff2'); font-weight: 200 1000; }
@page { size: A4; margin: 14mm 13mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Nunito, system-ui, sans-serif; font-weight: 700; color: #1F1A3D; font-size: 10.5pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1, h2, h3 { font-family: 'Lilita One', Nunito, sans-serif; font-weight: 400; margin: 0; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12pt; border-bottom: 3pt solid #1F1A3D; padding-bottom: 8pt; margin-bottom: 12pt; }
.brand { font-family: 'Lilita One', sans-serif; font-size: 13pt; }
.brand span { background: ${color}; border: 1.5pt solid #1F1A3D; border-radius: 4pt; padding: 0 4pt; }
h1 { font-size: 26pt; line-height: 1; margin-top: 4pt; }
.sub { color: #4A4468; font-size: 11pt; margin-top: 3pt; }
.num { font-family: 'Lilita One', sans-serif; font-size: 15pt; background: ${color}; border: 2pt solid #1F1A3D; border-radius: 999px; padding: 2pt 10pt; white-space: nowrap; }
h2 { font-size: 15pt; margin: 14pt 0 6pt; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 4pt 5pt; border-bottom: 0.8pt solid #CFC8E6; vertical-align: top; }
th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #4A4468; border-bottom: 1.5pt solid #1F1A3D; }
td.r, th.r { text-align: right; }
tr.first td { background: #FFF3C4; }
.avg { font-family: 'Lilita One', sans-serif; font-size: 13pt; }
.small { font-size: 8.5pt; color: #4A4468; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 14pt; }
.award { border: 1.2pt solid #1F1A3D; border-radius: 6pt; padding: 5pt 8pt; break-inside: avoid; }
.award b { display: block; font-size: 11pt; }
.quotes { margin: 0; padding: 0; list-style: none; display: grid; gap: 4pt; }
.quotes li { border-left: 3pt solid ${color}; padding-left: 7pt; font-style: italic; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; }
.photos figure { margin: 0; border: 1.2pt solid #1F1A3D; padding: 4pt; break-inside: avoid; }
.photos img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.photos figcaption { font-size: 8.5pt; margin-top: 3pt; }
.foot { margin-top: 16pt; padding-top: 6pt; border-top: 1pt solid #CFC8E6; color: #4A4468; font-size: 8.5pt; display: flex; justify-content: space-between; }
section { break-inside: avoid-page; }
</style></head><body>
<div class="head">
  <div><div class="brand">GameNight <span>Show</span></div>
    <h1>${d.emblem ? `${esc(d.emblem)} ` : ''}${esc(d.group || 'La nostra serata')}</h1>
    <div class="sub">${esc(d.date)}${d.facts ? ` · ${esc(d.facts)}` : ''}</div></div>
  ${d.number ? `<div class="num">Game Night #${d.number}</div>` : ''}
</div>
<section><h2>Classifica della serata</h2>
<table><thead><tr><th>#</th><th>Gioco</th><th class="r">Media</th>${critHeads.map((c) => `<th class="r">${esc(c)}</th>`).join('')}<th class="r">Voti</th><th>MVP</th><th>Vincitori</th><th class="r">Durata</th></tr></thead>
<tbody>${d.rows.map((r, i) => `<tr class="${i === 0 ? 'first' : ''}"><td>${r.rank}</td><td><b>${esc(r.name)}</b>${r.audience !== null && r.audience !== undefined ? `<div class="small">Pubblico: ${fmt(r.audience)}</div>` : ''}${r.consensus !== null && r.consensus !== undefined ? `<div class="small">Consenso ${r.consensus}%</div>` : ''}</td>
<td class="r avg">${fmt(r.avg)}</td>${critHeads.map((c) => `<td class="r">${r.crit?.[c] !== null && r.crit?.[c] !== undefined ? fmt(r.crit[c]) : '–'}</td>`).join('')}<td class="r">${r.n}</td><td>${esc(names(r.mvp || [])) || '–'}</td><td>${esc(names(r.winners || [])) || '–'}</td><td class="r">${r.minutes ? `${r.minutes} min` : '–'}</td></tr>`).join('')}</tbody></table></section>
${d.awards.length ? `<section><h2>Premi speciali</h2><div class="grid">${d.awards.map((a) => `<div class="award"><span class="small">${esc(a.title)}</span><b>${esc(a.who)}</b><span class="small">${esc(a.value || '')}</span></div>`).join('')}</div></section>` : ''}
${d.achievements.length ? `<section><h2>Traguardi sbloccati</h2><div class="grid">${d.achievements.map((a) => `<div class="award"><b>${esc(a.title)}</b><span class="small">${esc(a.who)}</span></div>`).join('')}</div></section>` : ''}
${d.quotes.length ? `<section><h2>Commenti</h2><ul class="quotes">${d.quotes.map((q) => `<li>«${esc(q.text)}» <span class="small">${esc(q.name)}, ${esc(q.game)}</span></li>`).join('')}</ul></section>` : ''}
${d.photos.length ? `<section><h2>Album</h2><div class="photos">${d.photos.slice(0, 12).map((p) => `<figure><img src="${esc(p.data)}" alt=""><figcaption>${esc(p.caption || '')}${p.by ? ` <span class="small">${esc(p.by)}</span>` : ''}</figcaption></figure>`).join('')}</div></section>` : ''}
<div class="foot"><span>${d.next ? `Prossima serata: ${esc(d.next)}` : ''}</span><span>Fatto con GameNight Show</span></div>
</body></html>`;
}

/** Apre la finestra di stampa con il resoconto (da lì: "Salva come PDF"). */
export function printReport(html) {
  // Nell'app Android non c'è la finestra di stampa: si salva la pagina, da aprire nel browser e stampare in PDF.
  if (isApp()) { downloadFile(`GameNight_resoconto_${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html'); return null; }
  document.getElementById('reportFrame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'reportFrame';
  frame.title = 'Resoconto della serata';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* niente */ }
  };
  // Aspetta font e foto prima di stampare.
  const imgs = [...doc.images];
  Promise.all([doc.fonts?.ready?.catch(() => {}), ...imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; })))])
    .then(() => setTimeout(go, 150));
  return frame;
}
