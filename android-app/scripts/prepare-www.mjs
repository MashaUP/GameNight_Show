// Prepara la cartella www/ con una copia del sito, da impacchettare nell'app Android.
// Indirizzi pubblici (letti dall'ambiente, li imposta il workflow di GitHub):
//   SITE_URL  indirizzo del sito su GitHub Pages, es. https://nome.github.io/GameNight_Show/
//   APK_URL   indirizzo da cui scaricare l'ultima versione dell'app
// Servono perché dentro l'app le pagine girano su https://localhost: i QR e i link da mandare
// agli amici devono invece puntare al sito pubblico.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const www = join(here, '..', 'www');

const ITEMS = ['index.html', 'host.html', 'play.html', 'ludoteca.html', 'resoconto.html', 'test.html', 'manifest.webmanifest', 'version.json', 'css', 'js', 'assets', 'vendor'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const it of ITEMS) {
  const src = join(root, it);
  if (!existsSync(src)) throw new Error(`Manca ${it} nella cartella del sito`);
  cpSync(src, join(www, it), { recursive: true });
}

const clean = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (!/^https:\/\/[^\s"'<>]+$/.test(s)) throw new Error(`Indirizzo non valido: ${s}`);
  return s;
};
let site = clean(process.env.SITE_URL);
if (site && !site.endsWith('/')) site += '/';
const apk = clean(process.env.APK_URL);

writeFileSync(join(www, 'js', 'site.js'),
  `// Generato da android-app/scripts/prepare-www.mjs: indirizzi pubblici usati dall'app Android.\n` +
  `export const SITE_URL = ${JSON.stringify(site)};\n` +
  `export const APK_URL = ${JSON.stringify(apk)};\n`);

const { version } = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));
console.log(`www pronta: versione ${version}${site ? `, sito ${site}` : ', sito pubblico non impostato'}`);
