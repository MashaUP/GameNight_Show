// Modelli di serata e "riparti da una serata precedente" (1.11, idee 10 e 11).
//
// Un modello è l'insieme delle impostazioni della serata — domande e criteri, Chaos, timer del voto,
// votazione automatica, atmosfera (intensità e suono), musica, posti — con un nome. Si salva nel gruppo
// (groups/<gruppo>/templates/<id>, scrivono proprietario e admin) così vale per tutte le TV del gruppo;
// senza gruppo resta su questa TV (localStorage). Applicarlo cambia solo le impostazioni di stasera.
//
// Ripartire da una serata precedente copia le sue impostazioni (se la stanza esiste ancora) e mette nella
// scaletta di stasera i giochi giocati quella sera che sono nell'armadio. Mai voti, punteggi, giocatori,
// premi o codici: i partecipanti si riconfermano entrando con il QR.
//
// 1.12 (idea 24, tradizioni): un modello può avere anche un "gioco d'apertura" (proposto per primo
// quando la serata non ha ancora giochi) e un "premio ricorrente" (il premio del gruppo da assegnare a
// fine serata, idea 23). Sono solo campi del modello: nessun sistema separato.
//
// Qui la parte pura (provata in tests/features.test.mjs) e il pannello della TV (bindTemplates).
import { t } from './i18n.js';

export const TEMPLATE_MAX = 20;
export const SETTING_KEYS = ['voting', 'chaos', 'voteSeconds', 'voteAuto', 'manualReveal', 'atmosphere', 'atmoLevel', 'atmoSound', 'maxPlayers', 'music', 'opening', 'award', 'maxMinutes', 'maxGames'];
export const AWARD_EMOJI = ['🎖️', '🏅', '🎗️', '👑', '🔥', '🧠', '🤝', '😂', '🎭', '🍕', '🐢', '⚡', '🎯', '🌟'];
const CRIT_KEYS = ['coinv', 'sempl', 'rigioc'];
const ATMO = ['auto', 'pioggia', 'candele', 'neon', 'stelle', 'festa', 'nebbia', 'palco'];
const MUSIC = ['off', 'auto', 'lounge', 'suspense', 'festa', 'pausa'];
const VOTE_SECS = [45, 60, 90, 120, 180];
const cleanLabel = (s) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const asList = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

/** Impostazioni pulite (solo i valori ammessi, il resto sparisce). */
export function cleanSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = {};
  if (r.voting && typeof r.voting === 'object') {
    const v = {};
    for (const k of CRIT_KEYS) if (r.voting[k] === false) v[k] = false;
    const custom = asList(r.voting.custom).map((c) => cleanLabel(c?.label)).filter(Boolean).slice(0, 2).map((label) => ({ label }));
    if (custom.length) v.custom = custom;
    if (Object.keys(v).length) s.voting = v;
  }
  if (r.chaos === true) s.chaos = true;
  if (VOTE_SECS.includes(Number(r.voteSeconds))) s.voteSeconds = Number(r.voteSeconds);
  if (r.voteAuto === true) s.voteAuto = true;
  if (r.manualReveal === true) s.manualReveal = true;
  if (ATMO.includes(r.atmosphere)) s.atmosphere = r.atmosphere;
  if (['soft', 'strong'].includes(r.atmoLevel)) s.atmoLevel = r.atmoLevel;
  if (r.atmoSound === true) s.atmoSound = true;
  const mp = Number(r.maxPlayers);
  if (Number.isInteger(mp) && mp >= 2 && mp <= 12) s.maxPlayers = mp;
  if (MUSIC.includes(r.music)) s.music = r.music;
  const opening = String(r.opening ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (opening) s.opening = opening;
  const at = String(r.award?.t ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  if (at) s.award = { t: at, ...(AWARD_EMOJI.includes(r.award?.e) ? { e: r.award.e } : {}) };
  // 2.1 (idea 31): limiti della serata
  const mm = Number(r.maxMinutes);
  if (Number.isInteger(mm) && mm >= 30 && mm <= 600) s.maxMinutes = mm;
  const mg = Number(r.maxGames);
  if (Number.isInteger(mg) && mg >= 1 && mg <= 20) s.maxGames = mg;
  return s;
}

/** Impostazioni di stasera (meta della stanza più la musica di questa TV). */
export function settingsFromMeta(meta, music = '') {
  return cleanSettings({ ...(meta || {}), music });
}

/** Modello da salvare: { name, at, s }. */
export function makeTemplate(name, settings, now = Date.now()) {
  const n = cleanLabel(name);
  if (!n) throw Object.assign(new Error('name'), { code: 'name' });
  return { name: n, at: now, s: cleanSettings(settings) };
}

/** Modello letto dal database o dal dispositivo, controllato. null se non valido. */
export function cleanTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanLabel(raw.name);
  if (!name) return null;
  return { name, at: Number(raw.at) || 0, s: cleanSettings(raw.s) };
}

/**
 * Patch di rooms/<codice>/meta per applicare le impostazioni: ogni chiave del modello prende il suo valore,
 * quelle assenti tornano al valore di base (null). I posti non scendono sotto chi è già entrato.
 * La musica non è nella stanza (è di questa TV): la restituisce a parte.
 */
export function settingsPatch(settings, { activePlayers = 0 } = {}) {
  const s = cleanSettings(settings);
  const patch = {};
  for (const k of SETTING_KEYS) {
    if (k === 'music') continue;
    if (k === 'maxPlayers') { if (s.maxPlayers) patch.maxPlayers = Math.max(s.maxPlayers, Math.min(12, activePlayers)); continue; }
    patch[k] = s[k] === undefined ? null : s[k];
  }
  return { patch, music: s.music || null };
}

/** Che cosa cambierebbe applicando le impostazioni: [{ key, from, to }] (per l'anteprima). */
export function settingsDiff(meta, music, settings) {
  const cur = settingsFromMeta(meta, music);
  const next = cleanSettings(settings);
  const out = [];
  for (const k of SETTING_KEYS) {
    if (k === 'maxPlayers' && next.maxPlayers === undefined) continue;
    const a = JSON.stringify(cur[k] ?? null);
    const b = JSON.stringify(next[k] ?? null);
    if (a !== b) out.push({ key: k, from: cur[k] ?? null, to: next[k] ?? null });
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Giochi della serata passata (riassunto nel gruppo) che sono nell'armadio di stasera, nell'ordine in cui
 * erano stati giocati. Restituisce { ids, missing } (missing: nomi non trovati nell'armadio).
 */
export function planFromNight(night, library) {
  const games = Object.values(night?.games || {}).filter((g) => g?.name).sort((a, b) => (a.order || 0) - (b.order || 0));
  const byName = new Map();
  for (const [id, it] of Object.entries(library || {})) if (it?.name && !byName.has(norm(it.name))) byName.set(norm(it.name), id);
  const ids = [];
  const missing = [];
  for (const g of games) {
    const id = byName.get(norm(g.name));
    if (id && !ids.includes(id)) ids.push(id);
    else if (!id) missing.push(g.name);
  }
  return { ids, missing };
}

/** Etichetta leggibile di un'impostazione (per l'anteprima). */
export function settingLabel(key, value) {
  if (value === null || value === undefined) return t('tpl.v.default');
  if (key === 'voting') {
    const off = CRIT_KEYS.filter((k) => value[k] === false).length;
    const custom = asList(value.custom).map((c) => c.label);
    return [off ? t('tpl.v.critOff', { n: off }) : '', custom.length ? t('tpl.v.custom', { list: custom.join(', ') }) : ''].filter(Boolean).join(' · ') || t('tpl.v.default');
  }
  if (key === 'award') return `${value.e || '🎖️'} ${value.t}`;
  if (typeof value === 'boolean') return value ? t('tpl.v.on') : t('tpl.v.off');
  if (key === 'voteSeconds') return t('tpl.v.secs', { n: value });
  if (key === 'maxMinutes') return t('lim.vMin', { n: value });
  if (key === 'maxGames') return t('lim.vGames', { n: value });
  return String(value);
}

// ---------------------------------------------------------------------------
// Archivio dei modelli: gruppo (Firebase) oppure questa TV
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'gnr_templates';

export const LocalTemplates = {
  all() {
    try { const m = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch { return {}; }
  },
  save(id, tpl) {
    const m = this.all();
    if (!m[id] && Object.keys(m).length >= TEMPLATE_MAX) throw Object.assign(new Error('full'), { code: 'full' });
    m[id] = tpl;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(m)); } catch { /* memoria piena */ }
  },
  remove(id) {
    const m = this.all();
    delete m[id];
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(m)); } catch { /* niente */ }
  }
};

/** Elenco ordinato (più recenti prima) di { id, name, at, s } da un oggetto { id: modello }. */
export function templateList(obj) {
  return Object.entries(obj || {}).map(([id, raw]) => {
    const tpl = cleanTemplate(raw);
    return tpl && /^[\w-]{1,40}$/.test(id) ? { id, ...tpl } : null;
  }).filter(Boolean).sort((a, b) => b.at - a.at);
}
