// Lo show sulla TV (1.13): regole pure per scene, finali, squadre, imprevisti, presenze, criteri per
// modalità, ospiti anonimi, volumi, contrasto dei temi, profili di presentazione e pacchetti di atmosfera.
// Idee 1, 2, 3, 4, 6, 7, 12, 16, 17, 19, 20, 21, 22, 26 del backlog (2.1; quello che manca è in TODO.md).
//
// Niente pagina e niente database: le funzioni ricevono dati e restituiscono decisioni, così si provano
// in tests/show.test.mjs. Le pagine (tv-show.js, host.js) le applicano.

// ---------------------------------------------------------------------------
// Idee 1 e 17 · Scene: per ogni fase della serata effetti, musica e silenzio
// ---------------------------------------------------------------------------

export const SCENE_PHASES = ['lobby', 'idle', 'voting', 'reveal', 'board', 'awards', 'poll'];
export const FX_LEVELS = ['full', 'soft', 'off'];
export const SCENE_MUSIC = ['auto', 'off', 'lounge', 'suspense', 'festa', 'pausa'];
/** Ritmo del reveal (2.1): quanto aspettare tra una carta e l'altra. */
export const PACES = ['normal', 'slow', 'fast'];
export const paceScale = (p) => (p === 'slow' ? 1.5 : p === 'fast' ? 0.6 : 1);
/** Regole del silenzio intelligente (idea 17): quando abbassare la musica senza toccare il "Silenzioso". */
export const QUIET_RULES = ['rules', 'voting', 'speech'];

const DEFAULT_SCENE = { fx: 'full', music: 'auto', pace: 'normal' };

/** Scene pulite: { <fase>: { fx, music } , quiet: { rules, voting, speech } }. Valori non ammessi spariscono. */
export function cleanScenes(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const ph of SCENE_PHASES) {
    const s = r[ph];
    if (!s || typeof s !== 'object') continue;
    const x = {};
    if (FX_LEVELS.includes(s.fx) && s.fx !== 'full') x.fx = s.fx;
    if (SCENE_MUSIC.includes(s.music) && s.music !== 'auto') x.music = s.music;
    if (PACES.includes(s.pace) && s.pace !== 'normal') x.pace = s.pace;
    if (Object.keys(x).length) out[ph] = x;
  }
  const q = {};
  for (const k of QUIET_RULES) if (r.quiet?.[k] === false || r.quiet?.[k] === true) q[k] = r.quiet[k];
  if (Object.keys(q).length) out.quiet = q;
  return out;
}

/**
 * Scena attiva in una fase: { fx, music, duck } dove duck = la musica va abbassata adesso (silenzio
 * intelligente). ctx: { rulesOpen, speaking }. Il "Silenzioso" scelto dall'utente non si tocca mai qui.
 * Regole del silenzio accese di base: durante la spiegazione delle regole e mentre parla il commentatore.
 */
export function sceneFor(phase, scenes, ctx = {}) {
  const s = cleanScenes(scenes);
  const base = { ...DEFAULT_SCENE, ...(s[phase] || {}) };
  const quiet = { rules: true, voting: false, speech: true, ...(s.quiet || {}) };
  const why = [];
  if (quiet.rules && ctx.rulesOpen) why.push('rules');
  if (quiet.voting && phase === 'voting') why.push('voting');
  if (quiet.speech && ctx.speaking) why.push('speech');
  return { ...base, duck: why.length > 0, why };
}

/** Moltiplicatore degli effetti (coriandoli, fuochi) per il livello della scena. */
export const fxScale = (level) => (level === 'off' ? 0 : level === 'soft' ? 0.4 : 1);

// ---------------------------------------------------------------------------
// Idea 2 · Finale di ogni gioco, scelto dai numeri (solo grafica e suoni)
// ---------------------------------------------------------------------------

/**
 * 'triumph' (media ≥ 8,5 e accordo ≥ 70%), 'loved' (media ≥ 7,5), 'divisive' (accordo < 50% con almeno
 * 3 voti), 'flop' (media < 5), altrimenti 'calm'. Con meno di 2 voti: 'calm'.
 */
export function finaleStyle(st) {
  const n = Number(st?.n) || 0;
  const avg = Number(st?.avg);
  if (n < 2 || !Number.isFinite(avg)) return 'calm';
  const cons = typeof st.consensus === 'number' ? st.consensus : null;
  if (avg < 5) return 'flop';
  if (n >= 3 && cons !== null && cons < 50) return 'divisive';
  if (avg >= 8.5 && (cons === null || cons >= 70)) return 'triumph';
  if (avg >= 7.5) return 'loved';
  return 'calm';
}

// ---------------------------------------------------------------------------
// Idea 3 · Squadre: punteggi del segnapunti sommati per squadra (separati dai voti di gradimento)
// ---------------------------------------------------------------------------

/**
 * teams: [[uid…], …] (table/teams); scores: { <partita>: { <uid>: punti } }.
 * Restituisce [{ i, members, total, games, best }] in ordine di punti; i giocatori senza squadra non contano.
 */
export function teamTotals(teams, scores) {
  const raw = Array.isArray(teams) ? teams : teams && typeof teams === 'object' ? Object.values(teams) : [];
  const list = raw.map((t) => (Array.isArray(t) ? t : Object.values(t || {})));
  const out = list.map((members, i) => ({ i, members, total: 0, games: 0, best: 0 }));
  const teamOf = new Map();
  list.forEach((m, i) => m.forEach((uid) => teamOf.set(uid, i)));
  for (const play of Object.values(scores || {})) {
    const sums = new Map();
    for (const [uid, v] of Object.entries(play || {})) {
      const i = teamOf.get(uid);
      const n = Number(v);
      if (i === undefined || !Number.isFinite(n)) continue;
      sums.set(i, (sums.get(i) || 0) + n);
    }
    for (const [i, s] of sums) { out[i].total += s; out[i].games++; out[i].best = Math.max(out[i].best, s); }
  }
  return out.sort((a, b) => b.total - a.total || a.i - b.i);
}

// ---------------------------------------------------------------------------
// Idea 4 · Ruota degli imprevisti: quali eventi Chaos sono ammessi
// ---------------------------------------------------------------------------

export const CHAOS_KEYS = ['chooser', 'loser', 'lastWin', 'draw', 'never', 'short', 'oldest', 'flop', 'reco', 'swap'];

/** Eventi ammessi: off = { <chiave>: true } per quelli spenti. Se li spegni tutti, restano tutti (mai una ruota vuota). */
export function allowedChaos(events, off) {
  const o = off && typeof off === 'object' ? off : {};
  const ok = (events || []).filter((e) => !o[e?.k]);
  return ok.length ? ok : (events || []);
}

/** Spicchi della ruota: l'evento scelto più fino a 5 altri, l'ultimo è quello scelto. */
export function wheelSlices(events, chosen, max = 6) {
  const others = (events || []).filter((e) => e !== chosen && e?.k !== chosen?.k).slice(0, max - 1);
  return [...others, chosen].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Idea 6 · Presenze: chi c'è, chi guarda, chi è arrivato tardi, chi manca
// ---------------------------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * players: { uid: { name, away, watch, guest } }; games: { id: { order, status } }; votes: { id: { uid: … } };
 * rsvp: { k: { name, answer } } (prossima serata del gruppo).
 * → { playing, watching, away, late, missing } (late: hanno votato per la prima volta dopo il primo gioco;
 *   missing: hanno risposto "sì" ma non sono entrati, per nome).
 */
export function presenceView(players, { games = {}, votes = {}, rsvp = {} } = {}) {
  const ps = Object.entries(players || {}).filter(([, p]) => p?.name).map(([uid, p]) => ({ uid, ...p }));
  const order = Object.entries(games || {}).filter(([, g]) => g?.status === 'revealed').sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([id]) => id);
  const firstVote = {};
  order.forEach((id, i) => { for (const uid of Object.keys(votes?.[id] || {})) if (firstVote[uid] === undefined) firstVote[uid] = i; });
  const names = new Set(ps.map((p) => norm(p.name)));
  return {
    playing: ps.filter((p) => !p.away && !p.watch),
    watching: ps.filter((p) => !p.away && p.watch),
    away: ps.filter((p) => p.away),
    late: order.length >= 2 ? ps.filter((p) => firstVote[p.uid] > 0) : [],
    missing: Object.values(rsvp || {}).filter((r) => r?.answer === 'si' && r.name && !names.has(norm(r.name))).map((r) => r.name)
  };
}

// ---------------------------------------------------------------------------
// Idea 7 · Criteri di voto per modalità di gioco
// ---------------------------------------------------------------------------

export const MODE_KEYS = ['competitivo', 'cooperativo', 'squadre', 'misto'];

/**
 * Domande da usare per un gioco: la scheda della sua modalità (meta.votingByMode[mode]) se c'è,
 * altrimenti quella della serata (meta.voting). Il risultato si salva nel gioco (games/<id>/voting),
 * così telefoni e resoconto usano le stesse domande anche se poi la serata cambia scheda.
 */
export function votingForMode(meta, mode) {
  const by = meta?.votingByMode;
  if (mode && MODE_KEYS.includes(mode) && by && typeof by === 'object' && by[mode] && typeof by[mode] === 'object') return by[mode];
  return meta?.voting || null;
}

/** Domande di un gioco già votato (o in votazione): le sue, oppure quelle della serata. */
export const gameVoting = (game, meta) => (game?.voting && typeof game.voting === 'object' ? game.voting : meta?.voting || null);

// ---------------------------------------------------------------------------
// Idea 12 · Ospiti anonimi nella stanza a fine serata
// ---------------------------------------------------------------------------

/** Patch per rooms/<codice> che sostituisce nome e foto degli ospiti con "Ospite 1, 2…" (label(n) dà il testo). */
export function guestAnonPatch(players, label) {
  const patch = {};
  let n = 0;
  for (const [uid, p] of Object.entries(players || {}).sort((a, b) => String(a[1]?.name).localeCompare(String(b[1]?.name)))) {
    if (!p?.guest || p.anon) continue;
    n++;
    patch[`players/${uid}/name`] = String(label(n)).slice(0, 16);
    patch[`players/${uid}/photo`] = null;
    patch[`players/${uid}/motto`] = null;
    patch[`players/${uid}/anon`] = true;
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Idea 16 · Volumi per categoria
// ---------------------------------------------------------------------------

export const AUDIO_KINDS = ['voice', 'music', 'fx', 'notify', 'atmo'];
export const AUDIO_DEFAULT = { voice: 1, music: 0.45, fx: 0.8, notify: 0.8, atmo: 0.6 };
/** Volume valido tra 0 e 1 (arrotondato a 0,05), oppure quello di base. */
export function cleanVolume(kind, v) {
  const n = Number(v);
  if (!AUDIO_KINDS.includes(kind)) return 0;
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return AUDIO_DEFAULT[kind];
  return Math.round(Math.max(0, Math.min(1, n)) * 20) / 20;
}

// ---------------------------------------------------------------------------
// Idea 21 · Temi della TV: colori con controllo del contrasto (WCAG 2.1)
// ---------------------------------------------------------------------------

const HEX = /^#[0-9A-Fa-f]{6}$/;
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Rapporto di contrasto tra due colori #RRGGBB (1–21), null se non validi. */
export function contrast(a, b) {
  if (!HEX.test(a || '') || !HEX.test(b || '')) return null;
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

export const THEME_FONTS = ['show', 'rounded', 'serif', 'mono'];
export const PODIUM_STYLES = ['classic', 'neon', 'gold', 'flat'];
const INK_DARK = '#1F1A3D';
const INK_LIGHT = '#FFFFFF';

/**
 * Tema pulito e controllato: { bg, accent, font, podium } con { ok, problems } — accent deve avere almeno 3:1
 * contro lo sfondo (elementi grandi) e il testo scuro sull'accento almeno 4,5:1; testo chiaro sullo sfondo 4,5:1.
 */
export function checkTheme(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const theme = {};
  if (HEX.test(r.bg || '')) theme.bg = r.bg.toUpperCase();
  if (HEX.test(r.accent || '')) theme.accent = r.accent.toUpperCase();
  if (THEME_FONTS.includes(r.font)) theme.font = r.font;
  if (PODIUM_STYLES.includes(r.podium)) theme.podium = r.podium;
  const problems = [];
  if (theme.bg && contrast(theme.bg, INK_LIGHT) < 4.5) problems.push({ k: 'bgText', ratio: contrast(theme.bg, INK_LIGHT) });
  if (theme.accent && contrast(theme.accent, INK_DARK) < 4.5) problems.push({ k: 'accentText', ratio: contrast(theme.accent, INK_DARK) });
  if (theme.accent && theme.bg && contrast(theme.accent, theme.bg) < 3) problems.push({ k: 'accentBg', ratio: contrast(theme.accent, theme.bg) });
  return { theme, ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Idea 22 · Pacchetti di atmosfera (file JSON, senza script né immagini esterne)
// ---------------------------------------------------------------------------

export const PACK_FORMAT = 'gamenight-atmo';
export const PACK_MAX_BYTES = 200 * 1024;
/** Immagine di sfondo facoltativa del pacchetto (2.1): data URI JPEG/PNG/WebP, al massimo 150 KB di testo. */
const PACK_IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const PACK_MAX = 12;
const PACK_DIRS = ['up', 'down', 'drift', 'twinkle'];

/**
 * Legge un pacchetto senza fidarsi: { format: 'gamenight-atmo', version: 1, name, icon?, colors: [#hex…],
 * particles: { kind: 'dots'|'emoji', emoji?: [..], count, dir, speed }, bg?: { top, bottom } }.
 * Lancia un errore con code: 'size' | 'json' | 'format' | 'version' | 'name' | 'colors'.
 */
export function parsePack(text) {
  const s = String(text || '');
  if (s.length > PACK_MAX_BYTES) throw Object.assign(new Error('size'), { code: 'size' });
  let d;
  try { d = JSON.parse(s); } catch { throw Object.assign(new Error('json'), { code: 'json' }); }
  if (!d || d.format !== PACK_FORMAT) throw Object.assign(new Error('format'), { code: 'format' });
  if (Number(d.version) !== 1) throw Object.assign(new Error('version'), { code: 'version' });
  const name = String(d.name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!name) throw Object.assign(new Error('name'), { code: 'name' });
  const colors = (Array.isArray(d.colors) ? d.colors : []).filter((c) => HEX.test(c)).slice(0, 6);
  if (!colors.length) throw Object.assign(new Error('colors'), { code: 'colors' });
  const p = d.particles && typeof d.particles === 'object' ? d.particles : {};
  // Emoji: solo caratteri "da disegno" (niente lettere, niente markup), al massimo 6
  const emoji = (Array.isArray(p.emoji) ? p.emoji : []).map((e) => String(e)).filter((e) => e.length <= 8 && !/[<>&"'\w]/.test(e)).slice(0, 6);
  const kind = p.kind === 'emoji' && emoji.length ? 'emoji' : 'dots';
  const count = Math.max(5, Math.min(120, Math.round(Number(p.count) || 40)));
  const speed = Math.max(0.2, Math.min(3, Number(p.speed) || 1));
  const bg = d.bg && HEX.test(d.bg.top || '') && HEX.test(d.bg.bottom || '') ? { top: d.bg.top, bottom: d.bg.bottom } : null;
  const img = typeof d.bg?.image === 'string' && d.bg.image.length <= 150000 && PACK_IMG.test(d.bg.image) ? d.bg.image : null;
  if (bg && img) bg.image = img;
  const icon = typeof d.icon === 'string' && d.icon.length <= 8 && !/[<>&"'\w]/.test(d.icon) ? d.icon : '✨';
  return { format: PACK_FORMAT, version: 1, name, icon, colors, particles: { kind, ...(kind === 'emoji' ? { emoji } : {}), count, dir: PACK_DIRS.includes(p.dir) ? p.dir : 'drift', speed }, ...(bg ? { bg } : {}) };
}

// ---------------------------------------------------------------------------
// Idea 26 · Profili di presentazione (solo impostazioni di questa TV)
// ---------------------------------------------------------------------------

/**
 * Ogni profilo cambia solo preferenze locali della TV: effetti per fase, commentatore, musica, vista da
 * lontano, volumi. Le impostazioni della serata e del gruppo (domande, Chaos, timer) non si toccano.
 */
export const PRESENTATION = {
  famiglia: { scenes: { reveal: { fx: 'soft' }, awards: { fx: 'soft' } }, commentator: 'festa', music: 'lounge', far: true, volumes: { fx: 0.6, voice: 1 } },
  competitiva: { scenes: { voting: { music: 'suspense' }, reveal: { fx: 'full', music: 'suspense', pace: 'slow' } }, commentator: 'festa', music: 'auto', far: false, volumes: { fx: 0.8 } },
  party: { scenes: { reveal: { fx: 'full', music: 'festa', pace: 'fast' }, awards: { fx: 'full', music: 'festa' }, idle: { music: 'festa' } }, commentator: 'roast', music: 'festa', far: false, volumes: { fx: 1, music: 0.6 } },
  minimal: { scenes: Object.fromEntries(SCENE_PHASES.map((p) => [p, { fx: 'off', music: 'off' }])), commentator: 'off', music: 'off', far: false, volumes: { fx: 0.4 } }
};
export const PRESENTATION_KEYS = Object.keys(PRESENTATION);

/** Le preferenze locali che un profilo imposta, già pulite. */
export function presentationPrefs(key) {
  const p = PRESENTATION[key];
  if (!p) return null;
  return {
    scenes: cleanScenes(p.scenes),
    commentator: ['off', 'festa', 'roast'].includes(p.commentator) ? p.commentator : 'off',
    music: SCENE_MUSIC.includes(p.music) ? p.music : 'auto',
    far: Boolean(p.far),
    volumes: Object.fromEntries(Object.entries(p.volumes || {}).map(([k, v]) => [k, cleanVolume(k, v)]).filter(([k]) => AUDIO_KINDS.includes(k)))
  };
}
