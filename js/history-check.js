// Controllo di coerenza dello storico del gruppo (2.1, idea 34). Funzioni pure, provate in tests/v21.test.mjs.
//
// Il controllo della serata in corso c'era già (pannello "Controllo dei dati" della TV). Questo guarda i
// riassunti salvati nel gruppo (groups/<gruppo>/nights) e segnala, con tre livelli:
// - error: dati che falsano le statistiche (media fuori scala, voti senza giochi);
// - warn: probabili errori di battitura (lo stesso gioco scritto in due modi) o giochi rinominati nell'armadio;
// - info: serate senza giochi votati, senza data o senza creatore (vecchie versioni).
// Ogni voce propone la correzione: "Correggi il riassunto" (idea 9) per il creatore della serata, che apre il
// resoconto di quella serata. Niente si cambia da solo.
import { dbKey } from './util.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

/** Distanza di modifica (Levenshtein) limitata: oltre max restituisce max + 1. */
export function editDistance(a, b, max = 3) {
  const x = String(a), y = String(b);
  if (Math.abs(x.length - y.length) > max) return max + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[y.length];
}

/**
 * nights: { <codice>: riassunto }; library: { id: { name } } (armadio della serata).
 * → [{ level, k, code?, names?, text params }] ordinati per gravità.
 */
export function historyCheck(nights, library = {}) {
  const out = [];
  const entries = Object.entries(nights || {}).filter(([, n]) => n && typeof n === 'object');
  const names = new Map(); // forma compatta → { name, key, codes:Set }
  for (const [code, n] of entries) {
    const games = Object.values(n.games || {}).filter((g) => g && typeof g === 'object');
    if (!games.length) out.push({ level: 'info', k: 'empty', code });
    if (!Number(n.at)) out.push({ level: 'info', k: 'noDate', code });
    if (!n.creatorUid && !n.creatorPid) out.push({ level: 'info', k: 'noCreator', code });
    for (const g of games) {
      const cnt = Number(g.n) || 0;
      if (cnt > 0 && (g.sum / cnt < 1 || g.sum / cnt > 10)) out.push({ level: 'error', k: 'avg', code, names: [g.name] });
      if (!g.name) { out.push({ level: 'error', k: 'noName', code }); continue; }
      if (g.key && g.key !== dbKey(g.name)) out.push({ level: 'warn', k: 'key', code, names: [g.name] });
      const f = fold(g.name);
      const e = names.get(f) || { name: g.name, variants: new Set(), codes: new Set() };
      e.variants.add(g.name); e.codes.add(code);
      names.set(f, e);
    }
  }
  // Stesso gioco scritto in modi diversi (maiuscole, accenti, spazi) o con un errore di battitura
  const list = [...names.entries()];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const [fa, a] = list[i];
    if (a.variants.size > 1) out.push({ level: 'warn', k: 'variants', names: [...a.variants], codes: [...a.codes] });
    for (let j = i + 1; j < list.length; j++) {
      const [fb, b] = list[j];
      if (fa.length < 4 || fb.length < 4) continue;
      const pair = `${fa}|${fb}`;
      if (seen.has(pair)) continue;
      if (editDistance(fa, fb, 2) <= (Math.min(fa.length, fb.length) >= 8 ? 2 : 1)) {
        seen.add(pair);
        out.push({ level: 'warn', k: 'typo', names: [a.name, b.name], codes: [...new Set([...a.codes, ...b.codes])] });
      }
    }
  }
  // Giochi dello storico che nell'armadio hanno un nome diverso (rinominati)
  const lib = Object.values(library || {}).filter((it) => it?.name).map((it) => ({ name: it.name, f: fold(it.name) }));
  const libSet = new Set(lib.map((x) => x.f));
  for (const [f, e] of names) {
    if (libSet.has(f) || f.length < 4) continue;
    const near = lib.find((x) => x.f.length >= 4 && editDistance(f, x.f, 2) <= 1);
    if (near) out.push({ level: 'warn', k: 'renamed', names: [e.name, near.name], codes: [...e.codes] });
  }
  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((x, y) => rank[x.level] - rank[y.level]);
}

/**
 * Confronto deterministico tra le prime 2–3 alternative del Consigliere (2.1, idea 35).
 * recs: [{ id, item, score, ago }]; present: numero di giocatori.
 * → { cols: [{ id, name }], rows: [{ k, values: [testo grezzo], best: indice|null, worst: indice|null }] }
 *   Il vincitore di ogni riga è calcolato, mai inventato: senza dato la cella resta vuota e non vince.
 */
export function compareTop(recs, present = 0) {
  const list = (recs || []).slice(0, 3);
  if (list.length < 2) return null;
  const pick = (vals, better) => {
    const idx = vals.map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v));
    if (idx.length < 2) return { best: null, worst: null };
    const sorted = [...idx].sort((a, b) => (better === 'high' ? b[0] - a[0] : a[0] - b[0]));
    return sorted[0][0] === sorted[sorted.length - 1][0] ? { best: null, worst: null } : { best: sorted[0][1], worst: sorted[sorted.length - 1][1] };
  };
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : NaN);
  const fit = list.map((r) => {
    const mn = num(r.item.minPlayers), mx = num(r.item.maxPlayers);
    if (!present || (!Number.isFinite(mn) && !Number.isFinite(mx))) return NaN;
    return (Number.isFinite(mn) ? present >= mn : true) && (Number.isFinite(mx) ? present <= mx : true) ? 1 : 0;
  });
  const rows = [
    { k: 'score', raw: list.map((r) => num(r.score)), better: 'high' },
    { k: 'fit', raw: fit, better: 'high' },
    { k: 'time', raw: list.map((r) => num(r.item.duration)), better: 'low' },
    { k: 'weight', raw: list.map((r) => num(r.item.weight)), better: 'low' },
    { k: 'ago', raw: list.map((r) => num(r.ago)), better: 'high' }
  ].map((r) => ({ k: r.k, values: r.raw, ...pick(r.raw, r.better) }));
  return { cols: list.map((r) => ({ id: r.id, name: r.item.name })), rows };
}
