// Il commentatore della serata: frasi celebrative o "roast" lette dalla TV con la sintesi vocale del browser.
import { fmt } from './util.js';
import { duck, isMuted } from './sounds.js';
import { isSafeMode } from './safe.js';

const KEY = 'gnr_commentator';
export const COMMENTATOR_MODES = [['off', 'Spento'], ['festa', 'Telecronista (celebrativo)'], ['roast', 'Roast (satirico, ma con affetto)']];

export function commentatorMode() {
  try { return localStorage.getItem(KEY) || 'off'; } catch { return 'off'; }
}
export function setCommentatorMode(m) {
  try { localStorage.setItem(KEY, m); } catch { /* niente */ }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function names(list) {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}
const num = (x) => fmt(x).replace('.', ',');
function duration(min) {
  if (!min) return '';
  if (min < 60) return `${min} minuti`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h === 1 ? "un'ora" : `${h} ore`}${m ? ` e ${m} minuti` : ''}`;
}

/**
 * Commento al reveal di un gioco.
 * d: { game, avg, n, min, max, minNames, maxNames, winners, mvp, consensus, rank, total, seers, betsTotal, audience }
 */
export function revealComment(d, mode) {
  if (!d || !d.n) return '';
  const g = d.game;
  const a = num(d.avg);
  const parts = [];
  if (mode === 'roast') {
    parts.push(pick([`Ed ecco il verdetto su ${g}.`, `${g}, è il tuo momento.`, `Vediamo cosa pensate davvero di ${g}.`]));
    if (d.avg >= 9) parts.push(pick([`${a}. Calma, non vi pagano mica.`, `${a}! Va bene, ammettiamolo: è un capolavoro.`]));
    else if (d.avg >= 8) parts.push(pick([`${a}: ammettetelo, vi siete divertiti.`, `${a}. Promosso, anche se qualcuno fa finta di niente.`]));
    else if (d.avg >= 7) parts.push(pick([`${a}: il classico voto da “carino, dai”.`, `${a}. Né carne né pesce, ma si mangia.`]));
    else if (d.avg >= 6) parts.push(pick([`${a}: lo stesso entusiasmo di un lunedì mattina.`, `${a}. Sufficienza politica.`]));
    else if (d.avg >= 5) parts.push(pick([`${a}: questo lo rigiocate solo se perdete una scommessa.`, `${a}. ${g}, possiamo parlarne.`]));
    else parts.push(pick([`${a}. ${g}, torna nella scatola e pensa a quello che hai fatto.`, `${a}: un applauso al coraggio di chi l’ha proposto.`]));
    if (d.max - d.min >= 4 && d.minNames.length) parts.push(pick([`${names(d.minNames)} ha dato ${d.min}: qualcuno controlli che stia bene.`, `Il voto più basso è di ${names(d.minNames)}: bastian contrario certificato.`]));
    if (d.winners.length) parts.push(pick([`Ha vinto ${names(d.winners)}: preparatevi, lo farà pesare tutta la sera.`, `Vittoria di ${names(d.winners)}. Gli altri? Presenti.`]));
    if (d.betsTotal && d.winners.length && !d.seers.length) parts.push(`Nessuno aveva previsto la vittoria di ${names(d.winners)}. Forse nemmeno ${d.winners.length === 1 ? 'lui' : 'loro'}.`);
    else if (d.seers.length) parts.push(`${names(d.seers)} ${d.seers.length === 1 ? 'aveva' : 'avevano'} previsto tutto. Sospetto.`);
    if (d.mvp.length) parts.push(pick([`MVP: ${names(d.mvp)}. Gli altri prendano appunti.`, `MVP a ${names(d.mvp)}: e adesso non montatevi la testa.`]));
    if (d.rank === 1 && d.total > 1) parts.push('E va pure in testa alla classifica. Incredibile.');
    return parts.join(' ');
  }
  parts.push(pick([`Signore e signori, il verdetto su ${g}!`, `Si accende il tabellone per ${g}!`, `Ed ecco i voti per ${g}!`]));
  if (d.avg >= 9) parts.push(`${a}! Un capolavoro: il pubblico è in piedi!`);
  else if (d.avg >= 8) parts.push(`${a}! Promosso a pieni voti!`);
  else if (d.avg >= 7) parts.push(`${a}: un bel gioco, niente da dire.`);
  else if (d.avg >= 6) parts.push(`${a}: sufficienza piena.`);
  else if (d.avg >= 5) parts.push(`${a}: così così, stavolta.`);
  else parts.push(`${a}: una partita da dimenticare.`);
  if (d.max - d.min >= 4 && d.minNames.length && d.maxNames.length) parts.push(`Il gruppo si divide: dal ${d.min} di ${names(d.minNames)} al ${d.max} di ${names(d.maxNames)}.`);
  else if (d.consensus !== null && d.consensus >= 85 && d.n >= 3) parts.push(`Tutti d’accordo: consenso al ${d.consensus} per cento.`);
  if (d.winners.length) parts.push(`Vittoria per ${names(d.winners)}!`);
  if (d.seers.length) parts.push(`Pronostico azzeccato da ${names(d.seers)}!`);
  if (d.mvp.length) parts.push(`MVP della partita: ${names(d.mvp)}.`);
  if (d.rank === 1 && d.total > 1) parts.push('Ed è primo in classifica!');
  return parts.join(' ');
}

/**
 * Resoconto della serata.
 * d: { group, games, minutes, top, flop, kings, kingWins, mvp, awards: [{title, who}], next }
 */
export function nightRecap(d, mode) {
  const parts = [];
  const games = `${d.games} ${d.games === 1 ? 'gioco' : 'giochi'}`;
  if (mode === 'roast') {
    parts.push(`Ed eccoci al resoconto di questa serata${d.group ? `, ${d.group}` : ''}.`);
    parts.push(`${games}${d.minutes ? ` in ${duration(d.minutes)} di vita che non torneranno indietro` : ''}.`);
    if (d.top) parts.push(`Il migliore: ${d.top.name}, con ${num(d.top.avg)}.`);
    if (d.flop && d.flop.name !== d.top?.name) parts.push(`Il peggiore: ${d.flop.name}, con ${num(d.flop.avg)}. Ci vediamo in tribunale.`);
    if (d.kings.length) parts.push(`${names(d.kings)} ${d.kings.length === 1 ? 'ha' : 'hanno'} vinto ${d.kingWins} ${d.kingWins === 1 ? 'partita' : 'partite'}: la prossima volta invitate${d.kings.length === 1 ? 'lo' : 'li'} di meno.`);
    if (d.mvp.length) parts.push(`MVP della serata: ${names(d.mvp)}. Complimenti, ora tornate con i piedi per terra.`);
    for (const a of d.awards.slice(0, 3)) parts.push(`${a.title}: ${a.who}.`);
    parts.push(d.next ? `Ci rivediamo ${d.next}. Se avete ancora amici.` : 'Alla prossima, se avete ancora amici!');
    return parts.join(' ');
  }
  parts.push(`Che serata${d.group ? `, ${d.group}` : ''}!`);
  parts.push(`${games}${d.minutes ? ` in ${duration(d.minutes)}` : ''}.`);
  if (d.top) parts.push(`Il gioco della serata è ${d.top.name}, con ${num(d.top.avg)}!`);
  if (d.kings.length) parts.push(`Chi ha vinto di più: ${names(d.kings)}, con ${d.kingWins} ${d.kingWins === 1 ? 'partita vinta' : 'partite vinte'}.`);
  if (d.mvp.length) parts.push(`MVP della serata: ${names(d.mvp)}!`);
  for (const a of d.awards.slice(0, 3)) parts.push(`${a.title}: ${a.who}.`);
  parts.push(d.next ? `Grazie a tutti, e appuntamento a ${d.next}!` : 'Grazie a tutti, e alla prossima serata!');
  return parts.join(' ');
}

/** Il primo posto sul podio. */
export function podiumLine(name, avg, mode) {
  return mode === 'roast'
    ? `Il gioco della serata è ${name}, con ${num(avg)}. Gli altri giochi possono andare a casa.`
    : `E il gioco della serata è… ${name}, con ${num(avg)}!`;
}

// ---------------------------------------------------------------------------
// Voce e sottotitoli
// ---------------------------------------------------------------------------

let voice = null;
function pickVoice() {
  if (voice || !('speechSynthesis' in window)) return voice;
  const vs = window.speechSynthesis.getVoices().filter((v) => /^it(-|_|$)/i.test(v.lang));
  voice = vs.find((v) => /google/i.test(v.name)) || vs.find((v) => /alice|luca|elsa|isabella|diego|federica/i.test(v.name)) || vs[0] || null;
  return voice;
}
if ('speechSynthesis' in window) window.speechSynthesis.addEventListener?.('voiceschanged', () => { voice = null; pickVoice(); });

export function voiceAvailable() {
  return 'speechSynthesis' in window && Boolean(pickVoice());
}

let capTimer = null;
function caption(text) {
  let el = document.getElementById('speechCap');
  if (!text) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'speechCap';
    el.className = 'speech-cap';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span aria-hidden="true">🎙️</span><span></span>`;
  el.lastChild.textContent = text;
}

/** Legge il testo (se c'è una voce italiana) e lo mostra come sottotitolo. */
let speechToken = 0;
export function speak(text, { captions = true } = {}) {
  if (!text || isSafeMode()) return;
  clearTimeout(capTimer);
  const token = ++speechToken;
  if (captions) caption(text);
  const hide = () => {
    if (token !== speechToken) return;
    duck(false);
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { if (token === speechToken) caption(''); }, 1200);
  };
  const v = isMuted() ? null : pickVoice();
  if (!v) { capTimer = setTimeout(() => caption(''), Math.max(4000, text.length * 75)); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = 1.04;
    u.pitch = 1;
    u.onstart = () => duck(true);
    u.onend = hide;
    u.onerror = hide;
    window.speechSynthesis.speak(u);
    // Rete di sicurezza: alcuni browser non chiamano onend.
    setTimeout(hide, Math.max(6000, text.length * 110));
  } catch { hide(); }
}

export function stopSpeaking() {
  speechToken++;
  try { window.speechSynthesis?.cancel(); } catch { /* niente */ }
  duck(false);
  caption('');
}
