// Fonte unica della versione: version.json. Questo script ne copia il numero nelle due copie che servono al
// browser (js/version.js per l'app, sw.js per la cache offline). check.mjs ferma tutto se non coincidono.
// Uso: modifica "version" (e date, notes) in version.json, poi:  cd tests && npm run sync-version
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (f) => path.join(ROOT, f);
const v = JSON.parse(fs.readFileSync(file('version.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error(`version.json: versione non valida "${v}" (serve x.y.z)`); process.exit(1); }
const copies = [
  ['js/version.js', /APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`],
  ['sw.js', /const VERSION = '[^']*'/, `const VERSION = '${v}'`]
];
for (const [f, re, to] of copies) {
  const src = fs.readFileSync(file(f), 'utf8');
  if (!re.test(src)) { console.error(`${f}: non trovo dove scrivere la versione`); process.exit(1); }
  const out = src.replace(re, to);
  if (out !== src) { fs.writeFileSync(file(f), out); console.log(`${f} → ${v}`); }
}
console.log(`Versione ${v} copiata. Ricorda la sezione "## ${v}" in CHANGELOG.md.`);
