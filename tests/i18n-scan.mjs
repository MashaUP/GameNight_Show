// Cerca testi italiani rimasti scritti a mano nei moduli (invece di t('chiave')).
//
//   node tests/i18n-scan.mjs js/resoconto.js js/report.js     elenca i testi sospetti con la riga
//   node tests/i18n-scan.mjs --count js/*.js                   solo il numero per file
//
// È un controllo euristico: legge stringhe e modelli `…` (anche su più righe, con ${…} annidati)
// e segnala i testi con parole italiane comuni o lettere accentate. Ignora commenti, console.*,
// chiavi di t(), selettori e le righe marcate con il commento  // i18n-ok  (nomi propri, dati,
// parole chiave della ricerca in italiano e inglese…).
// tests/check.mjs lo usa sui moduli già tradotti (elenco I18N_DONE): lì deve dare zero.
import fs from 'fs';

const WORDS = /(^|[^\p{L}])(il|lo|gli|una|uno|di|del|della|dello|dei|delle|degli|che|non|per|con|sono|ancora|questo|questa|questi|queste|tutti|tutte|giochi|gioco|serata|serate|voto|voti|telefono|telefoni|giocatori|giocatore|nessun|nessuna|apri|chiudi|salva|scarica|riprova|errore|stanza|armadio|gruppo|premi|classifica|partita|nel|nella|sul|sulla|alla|allo|agli|dalla|dal|anche|solo|ogni|qui|poi|tuo|tua|tuoi|vostro|vostra|cosa|quando|dopo|prima|ora|oggi|stasera|niente|tempo|inizia|fine|chi|come|più|già|perché|puoi|serve|vuoi|aggiungi|elimina|annulla|conferma|scegli|mostra|nascondi|minuti|secondi|ore)(?=$|[^\p{L}])/iu;
const ACCENT = /[àèéìòù]/i;

/** Divide il sorgente in pezzi di testo: { kind: 'str'|'tpl', text, line, before }. */
function tokens(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const stack = []; // per i modelli: profondità delle graffe dentro ${…}
  let lastCode = 0; // inizio del codice prima della stringa (per capire t('…'))
  const push = (kind, text, l, start) => out.push({ kind, text, line: l, before: src.slice(Math.max(lastCode, start - 40), start) });
  function readTemplate() {
    // i punta al carattere dopo `
    let buf = '';
    const l = line;
    const start = i - 1;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { buf += src.slice(i, i + 2); i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; push('tpl', buf, l, start); return; }
      if (c === '$' && src[i + 1] === '{') {
        push('tpl', buf, l, start);
        buf = '';
        i += 2;
        readCode(true);
        continue;
      }
      buf += c;
      i++;
    }
  }
  function readCode(inExpr) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        const end = src.indexOf('\n', i);
        i = end < 0 ? n : end;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const chunk = src.slice(i, end < 0 ? n : end + 2);
        line += (chunk.match(/\n/g) || []).length;
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === '\'' || c === '"') {
        const start = i;
        const l = line;
        i++;
        let buf = '';
        while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') { buf += src.slice(i, i + 2); i += 2; continue; } buf += src[i]; i++; }
        i++;
        push('str', buf, l, start);
        continue;
      }
      if (c === '`') { i++; readTemplate(); continue; }
      if (c === '/' && /[=(,:;!&|?{}[\n]\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
        // espressione regolare: la salto
        i++;
        let cls = false;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break;
          i++;
        }
        i++;
        continue;
      }
      if (inExpr) {
        if (c === '{') depth++;
        if (c === '}') { if (depth === 0) { i++; return; } depth--; }
      }
      i++;
    }
  }
  void stack;
  readCode(false);
  return out;
}

function suspicious(text) {
  const s = text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\\n/g, ' ').trim();
  if (!s || s.length < 3) return false;
  if (/^[\w.-]+$/.test(s) && !ACCENT.test(s)) return false; // chiavi, id, classi
  if (/^(https?:|data:|blob:|\.\/|\/)/.test(s)) return false;
  if (/^[\w-]+\.(html|js|json|css)(\?[\w=&-]*)?$/.test(s)) return false; // percorsi di pagine e file
  return WORDS.test(s) || ACCENT.test(s);
}

export function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const hits = [];
  for (const tok of tokens(src)) {
    const lineText = lines[tok.line - 1] || '';
    if (/\/\/\s*i18n-ok\b/.test(lineText)) continue;
    if (/console\.(log|warn|error|info|debug)\(/.test(lineText) && tok.kind === 'str') continue;
    if (/^\s*import\s/.test(lineText)) continue;
    if (tok.kind === 'str' && /\b(?:t|tr|has|trHas)\(\s*$/.test(tok.before)) continue;
    if (tok.kind === 'str' && /(querySelector(All)?|closest|\$\$?|getElementById|matches|getItem|setItem|removeItem)\(\s*$/.test(tok.before)) continue;
    // Nei modelli guardo il testo fuori dai tag e gli attributi leggibili
    const pieces = tok.kind === 'tpl'
      ? [...tok.text.split(/<[^>]*>/), ...[...tok.text.matchAll(/(?:aria-label|title|placeholder|alt)="([^"]+)"/g)].map((m) => m[1])]
      : [tok.text];
    let l = tok.line;
    for (const p of pieces) {
      if (suspicious(p)) hits.push({ line: l, text: p.replace(/\s+/g, ' ').trim() });
    }
    void l;
  }
  // Una voce per riga e testo
  const seen = new Set();
  return hits.filter((h) => { const k = `${h.line}|${h.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

if (process.argv[1] && process.argv[1].endsWith('i18n-scan.mjs')) {
  const args = process.argv.slice(2);
  const count = args.includes('--count');
  let total = 0;
  for (const f of args.filter((a) => !a.startsWith('--'))) {
    const hits = scan(f);
    total += hits.length;
    if (count) console.log(`${String(hits.length).padStart(5)}  ${f}`);
    else for (const h of hits) console.log(`${f}:${h.line}: ${h.text.slice(0, 140)}`);
  }
  if (count) console.log(`${String(total).padStart(5)}  totale`);
}
