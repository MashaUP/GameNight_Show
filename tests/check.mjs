// Controlli statici del sito (nessun browser): versioni allineate, file del service worker presenti,
// sintassi dei moduli JavaScript, import che puntano a file ed esportazioni esistenti, regole JSON valide.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const fail = (m) => errors.push(m);
let checks = 0;
const ok = (cond, m) => { checks++; if (!cond) fail(m); };

// 1. Versione uguale in version.json, js/version.js e sw.js
const v1 = JSON.parse(read('version.json')).version;
const v2 = (read('js/version.js').match(/APP_VERSION = '([^']+)'/) || [])[1];
const v3 = (read('sw.js').match(/const VERSION = '([^']+)'/) || [])[1];
ok(v1 && v1 === v2 && v2 === v3, `Versioni diverse: version.json ${v1}, js/version.js ${v2}, sw.js ${v3}`);

// 2. Ogni file nella lista del service worker esiste, e ogni modulo js è nella lista
const shell = [...read('sw.js').matchAll(/^\s*"([^"]+)",?$/gm)].map((m) => m[1]).filter((f) => f !== './');
for (const f of shell) ok(fs.existsSync(path.join(ROOT, f)), `sw.js elenca un file che non esiste: ${f}`);
const jsFiles = [
  ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')),
  ...fs.readdirSync(path.join(ROOT, 'js', 'lang')).filter((f) => f.endsWith('.js')).map((f) => `lang/${f}`)
];
for (const f of jsFiles) ok(shell.includes(`js/${f}`), `js/${f} manca dalla lista del service worker (offline non funzionerebbe)`);

// 3. Sintassi dei moduli
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: read(`js/${f}`), encoding: 'utf8' });
  ok(r.status === 0, `Errore di sintassi in js/${f}:\n${(r.stderr || '').split('\n').slice(0, 6).join('\n')}`);
}

// 4. Import relativi: il file esiste e i nomi importati sono esportati
const exportsOf = new Map();
function exportedNames(file) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"][^'"]+['"])?/g)) {
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  }
  exportsOf.set(file, names);
  return names;
}
for (const f of jsFiles) {
  const src = read(`js/${f}`);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = path.join(ROOT, 'js', m[2]);
    if (!fs.existsSync(target)) { ok(false, `js/${f} importa un file che non esiste: ${m[2]}`); continue; }
    if (target.includes(`${path.sep}vendor${path.sep}`)) continue;
    const names = exportedNames(target);
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) ok(names.has(n), `js/${f} importa "${n}" da ${m[2]}, che non lo esporta`);
    }
  }
  for (const m of src.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) ok(fs.existsSync(path.join(ROOT, 'js', m[1])), `js/${f} carica un file che non esiste: ${m[1]}`);
}

// 5. Pagine HTML: gli script e i fogli di stile indicati esistono
for (const html of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const src = read(html);
  for (const m of src.matchAll(/(?:src|href)="((?!https?:|data:|#)[^"]+\.(?:js|css|webmanifest|svg|png|woff2))"/g)) ok(fs.existsSync(path.join(ROOT, m[1])), `${html} usa un file che non esiste: ${m[1]}`);
}

// 6. Regole del database: JSON valido con la radice "rules"
try { ok(Boolean(JSON.parse(read('firebase/database.rules.json')).rules), 'firebase/database.rules.json senza "rules"'); } catch (e) { fail(`firebase/database.rules.json non è JSON valido: ${e.message}`); }

// 7. Lingue: stesse chiavi in italiano e inglese, stessi {parametri}, stesse forme del plurale,
//    nessun testo vuoto, e ogni chiave usata nel codice esiste.
const LANGS = ['it', 'en'];
const dicts = {};
for (const l of LANGS) dicts[l] = (await import(path.join(ROOT, 'js', 'lang', `${l}.js`))).default;
const params = (v) => [...new Set([...(typeof v === 'object' ? Object.values(v).join(' ') : String(v)).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
for (const l of LANGS.slice(1)) {
  for (const k of Object.keys(dicts.it)) ok(k in dicts[l], `Traduzione mancante in ${l}: ${k}`);
  for (const k of Object.keys(dicts[l])) ok(k in dicts.it, `Chiave in ${l} che non esiste in italiano: ${k}`);
}
for (const k of Object.keys(dicts.it)) {
  const vals = LANGS.map((l) => dicts[l][k]).filter((v) => v !== undefined);
  for (const v of vals) ok(typeof v === 'string' ? v.trim() !== '' : (v && typeof v === 'object' && typeof v.other === 'string' && v.other.trim() !== ''), `Testo vuoto o non valido: ${k}`);
  ok(new Set(vals.map(params)).size <= 1, `Parametri diversi tra le lingue per ${k}: ${vals.map(params).join(' / ')}`);
  ok(new Set(vals.map((v) => typeof v)).size <= 1, `Forma diversa (testo/plurale) tra le lingue per ${k}`);
}
// I dizionari sono divisi per area (js/lang/it-<area>.js): la stessa chiave non può stare in due file
// (l'ultimo vincerebbe in silenzio), e ogni area ha le stesse chiavi nelle due lingue.
for (const l of LANGS) {
  const seen = new Map();
  const base = read(`js/lang/${l}.js`);
  const parts = fs.readdirSync(path.join(ROOT, 'js', 'lang')).filter((f) => f.startsWith(`${l}-`) && f.endsWith('.js'));
  for (const m of base.matchAll(/^\s*'([a-z][\w.-]+)':/gm)) seen.set(m[1], `${l}.js`);
  for (const f of parts) {
    const d = (await import(path.join(ROOT, 'js', 'lang', f))).default;
    for (const k of Object.keys(d)) { ok(!seen.has(k), `Chiave ${k} ripetuta in ${f} e ${seen.get(k)}`); seen.set(k, f); }
    ok(base.includes(`from './${f}'`), `js/lang/${l}.js non importa ${f}`);
  }
}
const used = new Set();
for (const f of jsFiles.filter((x) => !x.startsWith('lang/'))) for (const m of read(`js/${f}`).matchAll(/\b(?:t|tr)\(\s*'([a-z][\w.-]+)'/g)) used.add(m[1]);
for (const html of fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
  const src = read(html);
  for (const m of src.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) { const k = pair.split(':')[1]?.trim(); if (k) used.add(k); }
  for (const m of src.matchAll(/name="gnr-title" content="([^"]+)"/g)) used.add(m[1]);
}
for (const k of used) ok(k in dicts.it, `Chiave usata nel codice ma assente nei dizionari: ${k}`);

// 8. Link ufficiali: config/links.json valido con le regole del codice, e nessun indirizzo
//    di GitHub, Discord o Ko-fi scritto a mano nelle pagine o nei moduli (unica fonte: il JSON).
{
  const { parseConfig } = await import('../js/links-core.js');
  const { PROJECT, LINK_POLICY } = await import('../js/links-policy.js');
  const p = parseConfig(read('config/links.json'), { project: PROJECT, policy: LINK_POLICY });
  ok(p.ok, `config/links.json non valido: ${p.error}`);
  if (p.ok) ok(!p.errors.length, `config/links.json: voci scartate (${p.errors.join(', ')})`);
  ok(shell.includes('config/links.json'), 'config/links.json manca dalla lista del service worker');
  ok(read('android-app/scripts/prepare-www.mjs').includes("'config'"), "la cartella config non viene copiata nell'app Android");
  const HARD = /https:\/\/(?:www\.)?(?:ko-fi\.com|discord\.gg|discord\.com\/invite|github\.com\/MashaUP)/i;
  const files = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')), ...jsFiles.map((f) => `js/${f}`)];
  for (const f of files) ok(!HARD.test(read(f)), `${f} contiene un link ufficiale scritto a mano: usa config/links.json (data-link / js/links.js)`);
}

// 9. Testi scritti nel codice (dalla 1.10 tutta l'app è bilingue): lo scanner deve dare zero su ogni modulo.
//    I testi che devono restare (nomi propri, dati salvati, parole chiave della ricerca) si marcano // i18n-ok.
{
  const { scan } = await import('./i18n-scan.mjs');
  const I18N_DONE = jsFiles.filter((f) => f.endsWith('.js') && !f.startsWith('lang/'));
  for (const f of I18N_DONE) {
    const hits = scan(path.join(ROOT, 'js', f));
    ok(!hits.length, `js/${f}: ${hits.length} testi italiani scritti nel codice (usa t('chiave'); es. riga ${hits[0]?.line}: "${(hits[0]?.text || '').slice(0, 60)}")`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problemi trovati:\n\n• ${errors.join('\n• ')}`);
  process.exit(1);
}
console.log(`✓ ${checks} controlli superati (versione ${v1}, ${jsFiles.length} moduli, ${shell.length} file offline, ${Object.keys(dicts.it).length} testi in ${LANGS.length} lingue)`);
