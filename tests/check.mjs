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
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
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
try { ok(Boolean(JSON.parse(read('database.rules.json')).rules), 'database.rules.json senza "rules"'); } catch (e) { fail(`database.rules.json non è JSON valido: ${e.message}`); }

if (errors.length) {
  console.error(`✗ ${errors.length} problemi trovati:\n\n• ${errors.join('\n• ')}`);
  process.exit(1);
}
console.log(`✓ ${checks} controlli superati (versione ${v1}, ${jsFiles.length} moduli, ${shell.length} file offline)`);
