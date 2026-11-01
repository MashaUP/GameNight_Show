// Regia dello show sulla TV (1.13): pannello con scene, audio per categoria, profili di presentazione,
// vista da lontano, imprevisti ammessi, domande per modalità, tema della TV, pacchetti di atmosfera e
// anteprima del reveal; pannello delle presenze. Idee 1, 2, 4, 6, 7, 16, 17, 19, 20, 21, 22, 26.
//
// Le regole stanno in show.js (pure, provate). Quello che è "di questa TV" resta nel browser della TV
// (scene, volumi, vista da lontano, profilo, pacchetti); quello che vale per la serata va nella stanza
// (imprevisti ammessi, domande per modalità); il tema va nel gruppo (o resta sulla TV senza gruppo).
import { $, esc, toast, ICONS, activePlayers } from './util.js';
import { avatarHTML } from './avatars.js';
import { t } from './i18n.js';
import { CRITERIA, GAME_MODES } from './stats.js';
import { getVolume, setVolume } from './sounds.js';
import { setCommentatorMode } from './commentary.js';
import {
  SCENE_PHASES, FX_LEVELS, SCENE_MUSIC, PACES, QUIET_RULES, cleanScenes, sceneFor, finaleStyle, CHAOS_KEYS, presenceView,
  MODE_KEYS, AUDIO_KINDS, cleanVolume, checkTheme, THEME_FONTS, PODIUM_STYLES, parsePack, PACK_MAX,
  PRESENTATION_KEYS, presentationPrefs
} from './show.js';

let C = null;
/** ctx: { S, roomRef, groupRef, update, set, explainError, canWriteGroup(), Music, syncMusic(), syncAtmo(), logEvent() } */
export function bindShow(ctx) { C = ctx; }
const S = () => C.S;
const fail = (err) => toast(C.explainError(err), 'error');
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* memoria piena */ } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } }
};

// ---------------------------------------------------------------------------
// Preferenze di questa TV
// ---------------------------------------------------------------------------

export const ShowPrefs = {
  scenes() { return cleanScenes(ls.json('gnr_scenes', {})); },
  setScenes(s) { ls.set('gnr_scenes', JSON.stringify(cleanScenes(s))); window.dispatchEvent(new Event('gnr-scene')); },
  far() { return ls.get('gnr_far') === '1'; },
  setFar(on) { ls.set('gnr_far', on ? '1' : null); applyFar(); },
  profile() { return ls.get('gnr_presentation', ''); },
  packs() { const l = ls.json('gnr_atmo_packs', []); return Array.isArray(l) ? l.slice(0, PACK_MAX) : []; },
  /** Salva i pacchetti; false se il browser non ha più spazio (immagini grandi). */
  setPacks(l) { try { localStorage.setItem('gnr_atmo_packs', JSON.stringify(l.slice(0, PACK_MAX))); return true; } catch { return false; } },
  pack() { return ls.get('gnr_atmo_pack', ''); },
  setPack(id) { ls.set('gnr_atmo_pack', id || null); window.dispatchEvent(new Event('gnr-pack')); },
  localTheme() { return checkTheme(ls.json('gnr_tv_theme', {})).theme; }
};

/** Vista da lontano (idea 19): caratteri più grandi e meno testo secondario. */
export function applyFar() { document.documentElement.classList.toggle('tv-far', ShowPrefs.far()); }

/** Scena attiva adesso (idee 1 e 17). */
export function currentScene() {
  return sceneFor(S().state?.phase || 'lobby', ShowPrefs.scenes(), { rulesOpen: Boolean(document.querySelector('.rules-panel')), speaking: Boolean(document.querySelector('.caption-bar:not(:empty)')) });
}

/** Tema della TV (idea 21): dal gruppo, oppure da questa TV. Colori, carattere e stile del podio. */
export function applyTheme21() {
  const root = document.documentElement;
  const th = checkTheme(S().identity?.theme || ShowPrefs.localTheme()).theme;
  const on = Boolean(th.bg || th.accent || th.font || th.podium);
  root.classList.toggle('tv-themed', on);
  for (const [v, val] of [['--th-bg', th.bg], ['--th-accent', th.accent]]) { if (val) root.style.setProperty(v, val); else root.style.removeProperty(v); }
  if (th.font) root.dataset.thFont = th.font; else delete root.dataset.thFont;
  if (th.podium) root.dataset.podium = th.podium; else delete root.dataset.podium;
}

// ---------------------------------------------------------------------------
// Pannello "Regia dello show"
// ---------------------------------------------------------------------------

const TABS = ['scenes', 'audio', 'profile', 'chaos', 'criteria', 'theme', 'packs'];

export const ShowPanel = {
  el: null,
  tab: 'scenes',
  isOpen() { return Boolean(this.el); },
  open(tab) {
    if (this.el || !S().code) return;
    if (tab && TABS.includes(tab)) this.tab = tab;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide show-panel" role="dialog" aria-modal="true" aria-labelledby="shTitle">
        <div class="panel-head"><h2 id="shTitle">🎬 ${esc(t('show.title'))}</h2><button type="button" class="icon-btn" id="shClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <nav class="ins-subs" aria-label="${esc(t('show.tabs'))}">${TABS.map((k) => `<button type="button" data-sh-tab="${k}" aria-pressed="${k === this.tab}">${esc(t(`show.tab.${k}`))}</button>`).join('')}</nav>
        <div class="show-body" id="shBody"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('change', (e) => this.change(e));
    el.addEventListener('input', (e) => this.input(e));
    this.paint();
  },
  paint() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-sh-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shTab === this.tab)));
    $('#shBody', this.el).innerHTML = this[`tab_${this.tab}`]();
  },

  tab_scenes() {
    const sc = ShowPrefs.scenes();
    const sel = (ph, kind, list, cur) => `<select class="input select select--sm" data-sh-scene="${ph}" data-sh-kind="${kind}" aria-label="${esc(t(`show.sc.${kind}`))} · ${esc(t(`show.ph.${ph}`))}">${list.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(t(`show.${kind}.${v}`))}</option>`).join('')}</select>`;
    const q = { rules: true, voting: false, speech: true, ...(sc.quiet || {}) };
    return `<p class="muted">${esc(t('show.sc.lead'))}</p>
      <table class="ins-table show-scenes"><thead><tr><th>${esc(t('show.sc.phase'))}</th><th>${esc(t('show.sc.fx'))}</th><th>${esc(t('show.sc.music'))}</th><th>${esc(t('show.sc.pace'))}</th></tr></thead>
      <tbody>${SCENE_PHASES.map((ph) => `<tr><td><b>${esc(t(`show.ph.${ph}`))}</b></td><td>${sel(ph, 'fx', FX_LEVELS, sc[ph]?.fx || 'full')}</td><td>${sel(ph, 'music', SCENE_MUSIC, sc[ph]?.music || 'auto')}</td><td>${ph === 'reveal' ? sel(ph, 'pace', PACES, sc[ph]?.pace || 'normal') : '—'}</td></tr>`).join('')}</tbody></table>
      <h3>🤫 ${esc(t('show.quiet.title'))}</h3><p class="muted small">${esc(t('show.quiet.lead'))}</p>
      <div class="qc-grid">${QUIET_RULES.map((k) => `<label class="quick-toggle"><input type="checkbox" data-sh-quiet="${k}" ${q[k] ? 'checked' : ''}><span>${esc(t(`show.quiet.${k}`))}</span></label>`).join('')}</div>
      <div class="rg-row"><button type="button" class="btn-sec" id="shPreview">👀 <span>${esc(t('show.pv.btn'))}</span></button><button type="button" class="link-btn" id="shScReset">${esc(t('show.sc.reset'))}</button></div>`;
  },
  tab_audio() {
    return `<p class="muted">${esc(t('show.au.lead'))}</p>
      <div class="show-sliders">${AUDIO_KINDS.map((k) => {
        const v = Math.round(getVolume(k) * 100);
        return `<label class="show-slider"><span>${esc(t(`show.au.${k}`))}</span><input type="range" min="0" max="100" step="5" value="${v}" data-sh-vol="${k}" aria-label="${esc(t(`show.au.${k}`))}"><b data-sh-volv="${k}">${v}%</b></label>`;
      }).join('')}</div>
      <p class="muted small">${esc(t('show.au.note'))}</p>`;
  },
  tab_profile() {
    const cur = ShowPrefs.profile();
    return `<p class="muted">${esc(t('show.pr.lead'))}</p>
      <div class="show-profiles">${PRESENTATION_KEYS.map((k) => `<button type="button" class="card show-profile" data-sh-profile="${k}" aria-pressed="${k === cur}"><b>${esc(t(`show.pr.${k}`))}</b><small>${esc(t(`show.pr.${k}.x`))}</small></button>`).join('')}</div>
      <label class="quick-toggle"><input type="checkbox" id="shFar" ${ShowPrefs.far() ? 'checked' : ''}><span><b>${esc(t('show.far.title'))}</b> · ${esc(t('show.far.lead'))}</span></label>`;
  },
  tab_chaos() {
    const off = S().meta?.chaosOff || {};
    return `<p class="muted">${esc(t('show.ch.lead'))}</p>
      ${S().meta?.chaos ? '' : `<p class="ins-warn">${esc(t('show.ch.offNow'))}</p>`}
      <div class="qc-grid">${CHAOS_KEYS.map((k) => `<label class="quick-toggle"><input type="checkbox" data-sh-chaos="${k}" ${off[k] ? '' : 'checked'}><span>${esc(t(`show.ch.k.${k}`))}</span></label>`).join('')}</div>
      <label class="quick-toggle"><input type="checkbox" id="shWheel" ${S().meta?.chaosWheel === false ? '' : 'checked'}><span>🎡 ${esc(t('show.ch.wheel'))}</span></label>`;
  },
  tab_criteria() {
    const by = S().meta?.votingByMode || {};
    const base = CRITERIA.filter((c) => !c.custom);
    return `<p class="muted">${esc(t('show.cr.lead'))}</p>
      <div class="show-modes">${MODE_KEYS.map((m) => {
        const v = by[m];
        const custom = Array.isArray(v?.custom) ? v.custom : Object.values(v?.custom || {});
        return `<section class="card stat-card"><h3>${esc(GAME_MODES[m] || m)}</h3>
          <label class="quick-toggle"><input type="checkbox" data-sh-mode="${m}" ${v ? 'checked' : ''}><span>${esc(t('show.cr.own'))}</span></label>
          <div class="show-mode-body" ${v ? '' : 'hidden'}>
            ${base.map((c) => `<label class="quick-toggle"><input type="checkbox" data-sh-crit="${m}:${c.key}" ${v?.[c.key] === false ? '' : 'checked'}><span>${esc(c.label)}</span></label>`).join('')}
            ${[0, 1].map((i) => `<input class="input input--sm" maxlength="40" data-sh-custom="${m}:${i}" placeholder="${esc(t('show.cr.customPh'))}" value="${esc(custom[i]?.label || '')}">`).join('')}
          </div></section>`;
      }).join('')}</div>
      <p class="muted small">${esc(t('show.cr.note'))}</p>
      <button type="button" class="btn" id="shCritSave">💾 <span>${esc(t('show.cr.save'))}</span></button>`;
  },
  tab_theme() {
    const th = checkTheme(S().identity?.theme || ShowPrefs.localTheme()).theme;
    const draft = this.themeDraft || th;
    const chk = checkTheme(draft);
    const where = S().meta?.groupId && C.canWriteGroup() ? t('show.th.whereGroup') : t('show.th.whereTv');
    return `<p class="muted">${esc(t('show.th.lead'))}</p>
      <div class="show-theme">
        <label><span class="field-label">${esc(t('show.th.bg'))}</span><input type="color" id="shThBg" value="${esc(draft.bg || '#140B2E')}"></label>
        <label><span class="field-label">${esc(t('show.th.accent'))}</span><input type="color" id="shThAccent" value="${esc(draft.accent || '#FFD34D')}"></label>
        <label><span class="field-label">${esc(t('show.th.font'))}</span><select class="input select select--sm" id="shThFont">${THEME_FONTS.map((f) => `<option value="${f}" ${f === (draft.font || 'show') ? 'selected' : ''}>${esc(t(`show.th.f.${f}`))}</option>`).join('')}</select></label>
        <label><span class="field-label">${esc(t('show.th.podium'))}</span><select class="input select select--sm" id="shThPodium">${PODIUM_STYLES.map((f) => `<option value="${f}" ${f === (draft.podium || 'classic') ? 'selected' : ''}>${esc(t(`show.th.p.${f}`))}</option>`).join('')}</select></label>
      </div>
      <div class="show-swatch" style="--sb:${esc(draft.bg || '#140B2E')};--sa:${esc(draft.accent || '#FFD34D')}"><span>${esc(t('show.th.sample'))}</span><b>8,7</b></div>
      ${chk.ok ? `<p class="muted small">✅ ${esc(t('show.th.ok'))}</p>` : `<ul class="ins-warn show-problems">${chk.problems.map((p) => `<li>${esc(t(`show.th.pb.${p.k}`, { r: String(p.ratio) }))}</li>`).join('')}</ul>`}
      <div class="rg-row"><button type="button" class="btn" id="shThSave" ${chk.ok ? '' : 'disabled'}>💾 <span>${esc(t('show.th.save'))}</span></button><button type="button" class="link-btn" id="shThReset">${esc(t('show.th.reset'))}</button></div>
      <p class="muted small">${esc(where)}</p>`;
  },
  tab_packs() {
    const packs = ShowPrefs.packs();
    const cur = ShowPrefs.pack();
    return `<p class="muted">${esc(t('show.pk.lead'))}</p>
      ${packs.length ? `<ul class="tp-list">${packs.map((p) => `<li class="tp-item"><span><b>${esc(p.icon)} ${esc(p.name)}</b><small class="muted">${esc(p.particles.kind === 'emoji' ? p.particles.emoji.join(' ') : t('show.pk.dots'))}</small></span>
        ${p.bg?.image ? '<small class="muted">🖼️</small>' : ''}<span class="tp-acts"><button type="button" class="btn-sec btn-sec--sm" data-sh-pack="${esc(p.id)}" aria-pressed="${p.id === cur}">${esc(p.id === cur ? t('show.pk.inUse') : t('show.pk.use'))}</button><button type="button" class="btn-sec btn-sec--sm am-danger" data-sh-packrm="${esc(p.id)}" aria-label="${esc(t('show.pk.remove', { name: p.name }))}">✕</button></span></li>`).join('')}</ul>` : `<p class="muted">${esc(t('show.pk.none'))}</p>`}
      <div class="rg-row"><label class="btn-sec">📦 <span>${esc(t('show.pk.import'))}</span><input type="file" id="shPackFile" accept=".json,application/json" hidden></label>
        ${cur ? `<button type="button" class="link-btn" data-sh-pack="">${esc(t('show.pk.stop'))}</button>` : ''}
        <button type="button" class="link-btn" id="shPackSample">${esc(t('show.pk.sample'))}</button></div>
      <p class="muted small">${esc(t('show.pk.safe'))}</p>`;
  },

  click(e) {
    if (e.target === this.el || e.target.closest('#shClose')) { this.close(); return; }
    const tb = e.target.closest('[data-sh-tab]');
    if (tb) { this.tab = tb.dataset.shTab; this.themeDraft = null; this.paint(); return; }
    if (e.target.closest('#shPreview')) { RevealPreview.open(); return; }
    if (e.target.closest('#shScReset')) { ShowPrefs.setScenes({}); this.paint(); return; }
    const pr = e.target.closest('[data-sh-profile]');
    if (pr) { applyProfile(pr.dataset.shProfile); this.paint(); return; }
    if (e.target.closest('#shCritSave')) { this.saveCriteria(); return; }
    if (e.target.closest('#shThSave')) { this.saveTheme(); return; }
    if (e.target.closest('#shThReset')) { this.themeDraft = {}; this.saveTheme(true); return; }
    const pk = e.target.closest('[data-sh-pack]');
    if (pk) { ShowPrefs.setPack(pk.dataset.shPack); C.syncAtmo(); this.paint(); return; }
    const rm = e.target.closest('[data-sh-packrm]');
    if (rm) { ShowPrefs.setPacks(ShowPrefs.packs().filter((p) => p.id !== rm.dataset.shPackrm)); if (ShowPrefs.pack() === rm.dataset.shPackrm) ShowPrefs.setPack(''); C.syncAtmo(); this.paint(); return; }
    if (e.target.closest('#shPackSample')) { this.addPack(JSON.stringify(SAMPLE_PACK)); }
  },
  change(e) {
    const x = e.target;
    if (x.dataset.shScene) {
      const sc = ShowPrefs.scenes();
      sc[x.dataset.shScene] = { ...(sc[x.dataset.shScene] || {}), [x.dataset.shKind]: x.value };
      ShowPrefs.setScenes(sc); ls.set('gnr_presentation', null); return;
    }
    if (x.dataset.shQuiet) {
      const sc = ShowPrefs.scenes();
      sc.quiet = { ...(sc.quiet || {}), [x.dataset.shQuiet]: x.checked };
      ShowPrefs.setScenes(sc); return;
    }
    if (x.id === 'shFar') { ShowPrefs.setFar(x.checked); return; }
    if (x.dataset.shChaos) {
      C.update(C.roomRef(S().code, 'meta/chaosOff'), { [x.dataset.shChaos]: x.checked ? null : true }).catch(fail); return;
    }
    if (x.id === 'shWheel') { C.update(C.roomRef(S().code, 'meta'), { chaosWheel: x.checked ? null : false }).catch(fail); return; }
    if (x.dataset.shMode) { x.closest('.stat-card').querySelector('.show-mode-body').hidden = !x.checked; return; }
    if (['shThBg', 'shThAccent', 'shThFont', 'shThPodium'].includes(x.id)) { this.themeFromForm(); return; }
    if (x.id === 'shPackFile' && x.files?.[0]) {
      const f = x.files[0];
      x.value = '';
      f.text().then((txt) => this.addPack(txt)).catch(() => toast(t('show.pk.err.json'), 'error'));
    }
  },
  input(e) {
    const x = e.target;
    if (x.dataset.shVol) {
      const v = cleanVolume(x.dataset.shVol, Number(x.value) / 100);
      setVolume(x.dataset.shVol, v);
      const lab = this.el.querySelector(`[data-sh-volv="${x.dataset.shVol}"]`);
      if (lab) lab.textContent = `${Math.round(v * 100)}%`;
      return;
    }
    if (x.id === 'shThBg' || x.id === 'shThAccent') this.themeFromForm();
  },
  themeFromForm() {
    this.themeDraft = { bg: $('#shThBg', this.el).value, accent: $('#shThAccent', this.el).value, font: $('#shThFont', this.el).value, podium: $('#shThPodium', this.el).value };
    const focus = document.activeElement?.id;
    this.paint();
    if (focus) document.getElementById(focus)?.focus();
  },
  async saveTheme(reset = false) {
    const chk = checkTheme(reset ? {} : this.themeDraft || {});
    if (!chk.ok) return;
    const theme = Object.keys(chk.theme).length ? chk.theme : null;
    try {
      if (S().meta?.groupId && C.canWriteGroup()) await C.set(C.groupRef(S().meta.groupId, 'identity/theme'), theme);
      else ls.set('gnr_tv_theme', theme ? JSON.stringify(theme) : null);
      applyTheme21();
      toast(t(reset ? 'show.th.resetDone' : 'show.th.saved'));
      this.themeDraft = null;
      this.paint();
    } catch (err) { fail(err); }
  },
  async saveCriteria() {
    const by = {};
    for (const m of MODE_KEYS) {
      if (!this.el.querySelector(`[data-sh-mode="${m}"]`)?.checked) continue;
      const v = {};
      for (const c of CRITERIA.filter((x) => !x.custom)) if (!this.el.querySelector(`[data-sh-crit="${m}:${c.key}"]`)?.checked) v[c.key] = false;
      const custom = [0, 1].map((i) => String(this.el.querySelector(`[data-sh-custom="${m}:${i}"]`)?.value || '').replace(/[<>]/g, '').trim().slice(0, 40)).filter(Boolean).map((label) => ({ label }));
      if (custom.length) v.custom = custom;
      by[m] = Object.keys(v).length ? v : { same: true };
    }
    try {
      await C.update(C.roomRef(S().code, 'meta'), { votingByMode: Object.keys(by).length ? by : null });
      toast(t('show.cr.saved'));
    } catch (err) { fail(err); }
  },
  addPack(txt) {
    try {
      const p = parsePack(txt);
      const list = ShowPrefs.packs();
      if (list.length >= PACK_MAX) { toast(t('show.pk.full', { n: PACK_MAX }), 'warn'); return; }
      const id = `p${Date.now().toString(36)}`;
      if (!ShowPrefs.setPacks([...list, { id, ...p }])) { toast(t('show.pk.err.space'), 'error'); return; }
      toast(t('show.pk.added', { name: p.name }));
      this.paint();
    } catch (err) { toast(t(`show.pk.err.${err.code || 'json'}`), 'error'); }
  },
  update() {
    if (!this.el || !['chaos', 'criteria'].includes(this.tab)) return;
    const sig = JSON.stringify([S().meta?.chaosOff, S().meta?.chaos, S().meta?.chaosWheel]);
    if (this.tab === 'chaos' && sig !== this.sig) { this.sig = sig; this.paint(); }
  },
  close() { this.el?.remove(); this.el = null; this.themeDraft = null; }
};

const SAMPLE_PACK = { format: 'gamenight-atmo', version: 1, name: 'Spiaggia', icon: '🏖️', colors: ['#FFD34D', '#3DF5E0', '#FF8A3D'], particles: { kind: 'emoji', emoji: ['🐚', '🌴', '☀️'], count: 26, dir: 'drift', speed: 0.6 }, bg: { top: '#0B2A4A', bottom: '#1E6F8F' } };

/** Profilo di presentazione (idea 26): solo preferenze di questa TV. */
export function applyProfile(key) {
  const p = presentationPrefs(key);
  if (!p) return;
  ShowPrefs.setScenes(p.scenes);
  setCommentatorMode(p.commentator);
  C.Music.setMode(p.music);
  ShowPrefs.setFar(p.far);
  for (const [k, v] of Object.entries(p.volumes)) setVolume(k, v);
  ls.set('gnr_presentation', key);
  C.syncMusic();
  toast(t('show.pr.applied', { name: t(`show.pr.${key}`) }));
  C.logEvent(t('show.pr.log', { name: t(`show.pr.${key}`) }), '🎬');
}

// ---------------------------------------------------------------------------
// Idea 20 · Anteprima del reveal (voti finti, mai scritti nel database)
// ---------------------------------------------------------------------------

const FAKE = { triumph: [9, 10, 9, 9], loved: [8, 7, 9, 7], divisive: [10, 3, 9, 4], flop: [4, 3, 5, 4], calm: [6, 7, 6, 7] };
export const RevealPreview = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(style = 'triumph') {
    this.close();
    const votes = FAKE[style] || FAKE.calm;
    const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
    const names = ['A', 'B', 'C', 'D'];
    const fx = currentSceneFor('reveal').fx;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide reveal-preview finale--${style}" role="dialog" aria-modal="true" aria-labelledby="rpTitle" data-fx="${fx}">
        <div class="panel-head"><h2 id="rpTitle">👀 ${esc(t('show.pv.title'))}</h2><button type="button" class="icon-btn" id="rpClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <p class="muted small">${esc(t('show.pv.lead'))}</p>
        <div class="seg" role="group" aria-label="${esc(t('show.pv.styles'))}">${Object.keys(FAKE).map((k) => `<button type="button" data-rp="${k}" aria-pressed="${k === style}">${esc(t(`show.fin.${k}`))}</button>`).join('')}</div>
        <div class="rp-stage"><div class="avg-badge"><span>${esc(t('show.pv.avg'))}</span><b>${avg.toFixed(1).replace('.', ',')}</b></div>
          <div class="vcards" style="--cols:4">${votes.map((v, i) => `<div class="vcard" style="--d:${(0.4 + i * 0.35).toFixed(2)}s"><div class="vcard-inner"><div class="vcard-back"><span>?</span></div><div class="vcard-front"><div class="vcard-who">${avatarHTML({ name: names[i], color: '#9B7BFF' }, 'var(--vc-av)')}<span>${esc(t('show.pv.player', { n: i + 1 }))}</span></div><b class="vcard-num">${v}</b></div></div></div>`).join('')}</div>
          <p class="verdict-chip">${esc(t(`show.fin.${style}.x`))}</p></div>
        <p class="muted small">${esc(t('show.pv.fx', { fx: t(`show.fx.${fx}`) }))}</p>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#rpClose')) { this.close(); return; }
      const b = e.target.closest('[data-rp]');
      if (b) this.open(b.dataset.rp);
    });
  },
  close() { this.el?.remove(); this.el = null; }
};

const currentSceneFor = (phase) => sceneFor(phase, ShowPrefs.scenes(), {});

/** Classe del finale per il reveal vero (idea 2). */
export const finaleClass = (st) => `finale--${finaleStyle(st)}`;

// ---------------------------------------------------------------------------
// Idea 6 · Presenze
// ---------------------------------------------------------------------------

export const PresencePanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open() {
    if (this.el || !S().code) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="prTitle">
        <div class="panel-head"><h2 id="prTitle">🙋 ${esc(t('show.ps.title'))}</h2><button type="button" class="icon-btn" id="prClose" aria-label="${esc(t('common.close'))}">${ICONS.x}</button></div>
        <p class="panel-note">${esc(t('show.ps.lead'))}</p>
        <div id="prBody"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#prClose')) { this.close(); return; }
      const w = e.target.closest('[data-ps-watch]');
      if (w) { const uid = w.dataset.psWatch; C.update(C.roomRef(S().code, `players/${uid}`), { watch: S().players?.[uid]?.watch ? null : true }).catch(fail); return; }
      const a = e.target.closest('[data-ps-away]');
      if (a) { const uid = a.dataset.psAway; C.update(C.roomRef(S().code, `players/${uid}`), { away: S().players?.[uid]?.away ? null : true }).catch(fail); }
    });
    this.sig = '';
    this.update();
  },
  update() {
    if (!this.el) return;
    const v = presenceView(S().players, { games: S().games, votes: S().votes, rsvp: S().next?.rsvp });
    const sig = JSON.stringify([v.playing.map((p) => p.uid), v.watching.map((p) => p.uid), v.away.map((p) => p.uid), v.late.map((p) => p.uid), v.missing]);
    if (sig === this.sig) return;
    this.sig = sig;
    const row = (p, extra = '') => `<li class="ps-row">${avatarHTML(p, '2.4rem')}<span class="ps-name">${esc(p.name)}${p.guest ? ` <small class="muted">${esc(t('show.ps.guest'))}</small>` : ''}${extra}</span>
      <button type="button" class="btn-sec btn-sec--sm" data-ps-watch="${esc(p.uid)}" aria-pressed="${Boolean(p.watch)}">${esc(p.watch ? t('show.ps.play') : t('show.ps.watch'))}</button>
      <button type="button" class="btn-sec btn-sec--sm" data-ps-away="${esc(p.uid)}" aria-pressed="${Boolean(p.away)}">${esc(p.away ? t('show.ps.back') : t('show.ps.away'))}</button></li>`;
    const late = new Set(v.late.map((p) => p.uid));
    const sec = (key, list) => `<section class="ps-sec"><h3>${esc(t(`show.ps.${key}`, { n: list.length }))}</h3>${list.length ? `<ul class="ps-list">${list.map((p) => row(p, late.has(p.uid) ? ` <small class="ps-late">${esc(t('show.ps.lateTag'))}</small>` : '')).join('')}</ul>` : `<p class="muted small">—</p>`}</section>`;
    $('#prBody', this.el).innerHTML = `<div class="ps-grid">${sec('playing', v.playing)}${sec('watching', v.watching)}${sec('awayList', v.away)}
      <section class="ps-sec"><h3>${esc(t('show.ps.missing', { n: v.missing.length }))}</h3>${v.missing.length ? `<p>${esc(v.missing.join(', '))}</p>` : `<p class="muted small">${esc(t('show.ps.noMissing'))}</p>`}</section></div>`;
  },
  close() { this.el?.remove(); this.el = null; }
};

/** Chi è spettatore per tutta la serata: escluso da chi deve votare (idea 6). */
export const watching = (p) => Boolean(p?.watch);
export { activePlayers };
