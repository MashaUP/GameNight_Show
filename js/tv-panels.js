// Pannelli della TV estratti da host.js (2.1, idea 76): armadio della serata, esportazioni, modelli di serata,
// scheda del gioco, album. Il codice è lo stesso di prima; quello che appartiene a host.js arriva con bindPanels().
// Schermata TV (host): crea la stanza, guida la serata e mostra reveal, classifica e premi.
import {
  isConfigured, connect, useSession, roomRef, groupRef, armadioRef, libraryRef, secretRef, dbRef, onValue, get, set, update, remove, push,
  serverTimestamp, explainError, trackConnection, serverNow
} from './fb.js';
import {
  $, esc, fmt, param, normalizeCode, randomCode, sortedPlayers, activePlayers, compressImage, gameImage, gameImageFromUrl,
  nameKey, cleanName, userError, asList, libFits, libInfo, connectionStatus, watchVersion, registerSW,
  toastUndo, applyTheme, themeSwitchHTML, isShowTheme, dbKey, compressPhoto, qrSVG,
  isImageSource, gameImageHTML, toast, confetti, installImageFallback, showFatal,
  showNotConfigured, downloadFile, ICONS, PLAYER_COLORS, MIN_PLAYERS, MAX_PLAYERS, DEFAULT_PLAYERS,
  ErrLog, a11yHTML, prefersReducedMotion, voteTimer, timerColor, editPhoto, rememberNight, pollChoices, POLL_MAX_VOTES, exportName
} from './util.js';
import { avatarHTML, avatarOptions, Seasonal } from './avatars.js';
import { seasonalAccessory, houseFor } from './traditions.js';
import { runTour, resetTours, tourOpen } from './tour.js';
import {
  CRITERIA, gameStats, verdict, buildBoard, buildAwards, rankLine, boardCSV, nightSummary, buildAllTime,
  activeCriteria, recommend, progressFor, newAchievements, records, groupLevel, durationOf,
  nightsList, nightHighlights, wrapped, yearsOf, nightsByMonth, onThisDay, groupInsights, pairsMap,
  searchLibrary, parseQuery, gameRecord, tagsOf, isAvailable, GAME_STATUS, GAME_MODES, nightFacts,
  betResults, seersByPlayer, winsByPlayer, nightChampions
} from './stats.js';
import { renderShareImage, renderStoryImage, renderYearImage, shareOrDownload, nightDate } from './share.js';
import {
  ding, pop, drumroll, fanfare, joinSound, soundsOn, setSounds, whistle, achievementSound, victory, sadTrombone,
  newGameSound, endNightSound, isMuted, setMuted, getVolume, setVolume, SFX, playSfx, cymbal, audioStatus, audioNeedsUnlock, audioBlocked, audioCtx,
  clockTick, timeUp, fireworkSound, stepUp, tick, duck
} from './sounds.js';
import { fireworks, confettiBurst, fxAllowed, setFxScale } from './fx.js';
import { allowedChaos, wheelSlices, fxScale, paceScale, votingForMode, gameVoting, guestAnonPatch, teamTotals } from './show.js';
import { TEAM_STYLE } from './extras.js';
import { historyCheck, compareTop } from './history-check.js';
import { nextBoardTvHTML } from './next-board.js';
import { bindChallenge, ChallengePanel } from './challenge.js';
import { discordSummary, sendToDiscord, getHook, setHook, validHook, autoSend, setAutoSend } from './discord.js';
import { playsCSV } from './trackers.js';
import { bindShow, ShowPanel, PresencePanel, RevealPreview, ShowPrefs, applyFar, applyTheme21, currentScene, finaleClass } from './tv-show.js';
import {
  bindTV, TablePanel, GameWheel, Quiz, Knocks, liveScoresHTML, editScore, rivalryLine, seasonTabHTML, rivalsTabHTML,
  cardsTabHTML, bindCards, seasonStageHTML, VideoPanel, downloadICS, importGamesCSV, changeRegiaCode, cleanupOldRooms
} from './tv-extras.js';
import { Lite } from './lite.js';
import { publicUrl, isApp } from './native.js';
import { Person } from './person.js';
import { settingsFromMeta, settingsPatch, settingsDiff, settingLabel, makeTemplate, templateList, planFromNight, LocalTemplates, TEMPLATE_MAX } from './templates.js';
import { isNightCreator } from './nights.js';
import { saveGame, newGameId, fullImage, trashGame as armTrash, logEvent as armLog } from './collection.js';
import { downloadPageUrl, getRelease, fmtSize, MIN_ANDROID } from './updates.js';
import { bindPrep, onTable, poolIds, wishes, prepHTML, planNextHTML, PlanPanel, RulesPanel } from './tv-prep.js';
import { nightStory, storyText, gameSessions, durationInfo } from './insights.js';
import { bindVotes, LateVotePanel, processLate, lateCount } from './tv-votes.js';
import { Tips } from './tips.js';
import { bindMemory, insightsHTML, insightsClick, insightsChange, traditionsHTML, traditionsClick, traditionsSubmit, CustomAwardPanel, confBadge } from './tv-memory.js';
import { Music, MUSIC_MODES, MOOD_LABEL } from './music.js';
import { AtmoSound, SOUND_SCENES } from './atmosound.js';
import { Atmo, ATMOS, atmoForGame, registerPack } from './atmo.js';
import { TRIVIA, groupFacts, tonightNews } from './facts.js';
import { commentatorMode, setCommentatorMode, COMMENTATOR_MODES, revealComment, nightRecap, podiumLine, speak, stopSpeaking } from './commentary.js';
import { exportReport } from './report.js';
import { Vault, checksum, sealBackup, validateBackup, storageInfo, askPersistence } from './vault.js';
import { isSafeMode, setSafeMode, watchErrors } from './safe.js';
import { trophies, affinities, lastPlayed, freshnessLabel, personKey, awardTitle, customAwardList } from './stats.js';
import { t as tr, has as trHas, fmtDate as fmtDateL, fmtNum, fmtList, langSwitchHTML } from './i18n.js';
import { bindSharedTimer, SharedTimer, kindLabel } from './sharedtimer.js';
import { pausePatch, playElapsed as elapsedOf } from './nightclock.js';
import { Ambient, bindAmbient } from './ambient.js';
import { Favs } from './favs.js';
import { initSpatialNav } from './spatialnav.js';
import { CustomSounds, publicList, customIdOf, checkFile, CSFX_ICONS, CSFX_MAX } from './customsfx.js';

// Dalla pagina della TV (host.js): stato della serata e funzioni condivise.
let QrPanel, S, addToLibrary, armReadOnly, armadioKey, armadioName, armadioPhoneUrl, awayLabel, discordText, durationOptions, ensureArmadioAdmin, filterChips, findLibrary, hasLib, inRoom, isSel, knownPeople, libRef, libraryItems, libraryUrl, logEvent, namesList, nightNumber, photoList, playedTonight, playerOrGhost, playersOptions, prettyKey, recapData, recentArmadi, registerMembers, selectedIds, sendDiscordNow, sessionsHTML, switchArmadio, syncMusic, writeSel;
export function bindPanels(c) {
  ({ QrPanel, S, addToLibrary, armReadOnly, armadioKey, armadioName, armadioPhoneUrl, awayLabel, discordText, durationOptions, ensureArmadioAdmin, filterChips, findLibrary, hasLib, inRoom, isSel, knownPeople, libRef, libraryItems, libraryUrl, logEvent, namesList, nightNumber, photoList, playedTonight, playerOrGhost, playersOptions, prettyKey, recapData, recentArmadi, registerMembers, selectedIds, sendDiscordNow, sessionsHTML, switchArmadio, syncMusic, writeSel } = c);
}

export const AlbumPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  /** room: stanza di cui mostrare le foto (di default quella di stasera). */
  async open(room = S.code, title = tr('tv.al.title')) {
    if (this.el || !S.meta?.groupId) return;
    this.room = room;
    this.slide = null;
    this.sig = null;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide panel--album" role="dialog" aria-modal="true" aria-labelledby="alTitle">
        <div class="panel-head"><h2 id="alTitle">${esc(title)}</h2>
          <div class="rg-row">${room === S.code ? `<button type="button" class="btn-sec btn-sec--sm" id="alAdd">${ICONS.image}<span>${tr('tv.al.add')}</span></button><input type="file" id="alFile" accept="image/*" hidden>` : ''}
          <button type="button" class="btn-sec btn-sec--sm" id="alShow">${ICONS.play}<span>${tr('tv.al.show')}</span></button>
          <button type="button" class="icon-btn" id="alClose" aria-label="${tr('tv.close')}">${ICONS.x}</button></div></div>
        <div class="album-grid" id="alGrid"><p class="muted">${tr('tv.al.loading')}</p></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#alClose')) { this.close(); return; }
      if (e.target.closest('#alAdd')) { $('#alFile', el).click(); return; }
      if (e.target.closest('#alShow')) { this.show(0); return; }
      const d = e.target.closest('[data-delphoto]');
      if (d && confirm(tr('tv.al.delConfirm'))) { remove(groupRef(S.meta.groupId, `photos/${this.room}/${d.dataset.delphoto}`)).catch((err) => toast(explainError(err), 'error')); return; }
      const ph = e.target.closest('[data-photo]');
      if (ph) this.show(Number(ph.dataset.photo));
    });
    $('#alFile', el)?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = await compressPhoto(f);
        await set(push(groupRef(S.meta.groupId, `photos/${this.room}`)), { data, uid: S.uid, by: 'TV', at: serverTimestamp() });
      } catch (err) { if (!err.cancelled) toast(explainError(err), 'error'); }
    });
    if (room !== S.code) {
      const snap = await get(groupRef(S.meta.groupId, `photos/${room}`)).catch(() => null);
      this.photos = photoList(snap?.val());
    }
    this.update();
  },
  list() { return this.room === S.code ? photoList(S.photos) : (this.photos || []); },
  update() {
    if (!this.el) return;
    const list = this.list();
    const sig = list.map((p) => p.id).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    $('#alGrid', this.el).innerHTML = list.length ? list.map((p, i) => `
      <figure class="polaroid" style="--r:${((i * 37) % 7) - 3}deg">
        <button type="button" class="polaroid-img" data-photo="${i}" aria-label="${tr('tv.al.open')}"><img src="${esc(p.data)}" alt="${esc(p.caption || tr('tv.al.photo'))}"></button>
        <figcaption>${esc(p.caption || '')}<small>${esc(p.by || '')}${p.game ? ` · ${esc(p.game)}` : ''}</small></figcaption>
        ${this.room === S.code ? `<button type="button" class="${'lib-del'}" data-delphoto="${esc(p.id)}" aria-label="${tr('tv.al.del')}">${ICONS.x}</button>` : ''}
      </figure>`).join('') : `<p class="muted">${this.room === S.code ? tr('tv.al.empty') : tr('tv.al.emptyOld')}</p>`;
  },
  show(i) {
    const list = this.list();
    if (!list.length) return;
    clearInterval(this.timer);
    let idx = i;
    const box = document.createElement('div');
    box.className = 'slideshow';
    const paint = () => {
      const p = list[idx % list.length];
      box.innerHTML = `<figure><img src="${esc(p.data)}" alt=""><figcaption>${esc(p.caption || '')} <small>${esc(p.by || '')}</small></figcaption></figure><p class="muted">${tr('tv.al.slide', { i: String((idx % list.length) + 1), n: String(list.length) })}</p>`;
    };
    paint();
    this.timer = setInterval(() => { idx++; paint(); }, 4500);
    box.addEventListener('click', () => { clearInterval(this.timer); box.remove(); });
    document.body.appendChild(box);
  },
  close() { clearInterval(this.timer); document.querySelector('.slideshow')?.remove(); this.el?.remove(); this.el = null; this.sig = ''; }
};

export const GameSheet = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(id) {
    this.close();
    const it = S.library?.[id];
    if (!it) return;
    this.id = id;
    this.eanClear = false;
    this.image = it.image || it.thumb || null;
    this.imageChanged = false;
    const rec = gameRecord(S.nights, it.name);
    const opt = (vals, cur, empty) => `<option value="">${empty}</option>` + vals.map(([v, l]) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const bases = libraryItems().filter((x) => x.id !== id && !x.baseId).map((x) => [x.id, x.name]);
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="gsTitle">
        <div class="panel-head"><h2 id="gsTitle">${esc(it.name)}</h2><button type="button" class="icon-btn" id="gsClose" aria-label="${tr('tv.close')}">${ICONS.x}</button></div>
        <div class="gs-record">
          <span>${tr('tv.gs.matches', { n: String(rec.matches) })}</span>
          <span>${tr('tv.gs.avg', { v: rec.avg !== null ? fmt(rec.avg) : '—' })}</span>
          <span>${tr('tv.gs.minutes', { v: rec.minutes ? `${rec.minutes} min` : '—' })}</span>
          <span>${tr('tv.gs.last', { v: rec.last ? fmtDateL(rec.last, { day: 'numeric', month: 'short', year: 'numeric' }) : tr('tv.gs.never') })}</span>
          <span>${tr('tv.gs.consensus', { v: rec.consensus !== null ? `${rec.consensus}%` : '—' })}</span>
          <span><b>${rec.champion ? esc(rec.champion.name) : '—'}</b> ${rec.champion ? tr('tv.gs.champWins', { n: rec.champion.wins }) : tr('tv.gs.champ')}</span>
          <span>${tr('tv.gs.level', { n: String(rec.level) })}</span>
        </div>
        ${sessionsHTML(it)}
        <div class="gs-grid">
          <button type="button" class="lib-add-img ${this.image ? 'has-img' : ''}" id="gsPick" aria-label="${tr('tv.gs.photo')}">${this.image ? `<img src="${esc(this.image)}" alt="">` : ICONS.image}</button>
          <input type="file" id="gsFile" accept="image/*" hidden>
          <label class="gs-f gs-f--wide"><span class="field-label">${tr('tv.gs.name')}</span><input class="input" id="gsName" maxlength="40" value="${esc(it.name)}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.minP')}</span><select class="input select" id="gsMin">${playersOptions(it.minPlayers, '—')}</select></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.maxP')}</span><select class="input select" id="gsMax">${playersOptions(it.maxPlayers, '—')}</select></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.dur')}</span><select class="input select" id="gsDur">${durationOptions(it.duration)}</select></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.mode')}</span><select class="input select" id="gsMode">${opt(Object.entries(GAME_MODES), it.mode, '—')}</select></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.weight')}</span><select class="input select" id="gsWeight">${opt([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((w) => [w, `${fmtNum(w)} / 5`]), it.weight, '—')}</select></label>
          <label class="gs-f gs-f--wide"><span class="field-label">${tr('tv.gs.tags')}</span><input class="input" id="gsTags" maxlength="120" placeholder="${tr('tv.gs.tagsPh')}" value="${esc(tagsOf(it).join(', '))}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.pub')}</span><input class="input" id="gsPub" maxlength="40" value="${esc(it.publisher || '')}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.year')}</span><input class="input" id="gsYear" type="number" min="1900" max="2100" value="${esc(it.year || '')}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.lang')}</span><input class="input" id="gsLang" maxlength="20" value="${esc(it.language || '')}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.owner')}</span><input class="input" id="gsOwner" maxlength="24" value="${esc(it.owner || (it.addedBy && it.addedBy !== 'TV' ? it.addedBy : ''))}"></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.status')}</span><select class="input select" id="gsStatus">${opt(Object.entries(GAME_STATUS).filter(([k]) => k !== 'posseduto'), it.status === 'posseduto' ? '' : it.status, tr('tv.gs.available'))}</select></label>
          <label class="gs-f"><span class="field-label">${tr('tv.gs.loan')}</span><input class="input" id="gsLoan" maxlength="24" value="${esc(it.loanTo || '')}"></label>
          <label class="gs-f gs-f--wide"><span class="field-label">${tr('tv.gs.base')}</span><select class="input select" id="gsBase">${opt(bases, it.baseId, tr('tv.gs.isBase'))}</select></label>
          <label class="gs-f gs-f--full"><span class="field-label">${tr('tv.gs.rules')}</span><textarea class="input" id="gsRules" maxlength="600" rows="3" placeholder="${tr('tv.gs.rulesPh')}">${esc(it.rules || '')}</textarea></label>
          <label class="gs-f gs-f--wide"><span class="field-label">${tr('tv.gs.setup')}</span><textarea class="input" id="gsSetup" maxlength="300" rows="3" placeholder="${tr('tv.gs.setupPh')}">${esc(it.setup || '')}</textarea></label>
          <label class="gs-f gs-f--wide"><span class="field-label">${tr('tv.gs.video')}</span><input class="input" id="gsVideo" type="url" maxlength="200" placeholder="https://www.youtube.com/…" value="${esc(it.video || '')}">
            ${it.ean ? `<small class="muted">${tr('tv.gs.ean', { ean: esc(it.ean) })} <button type="button" class="link-btn" id="gsEanClear">${tr('tv.gs.eanDel')}</button></small>` : `<small class="muted">${tr('tv.gs.eanHow')}</small>`}</label>
        </div>
        <p class="form-error" id="gsErr" role="alert"></p>
        <div class="claim-actions"><button type="button" class="btn btn-big" id="gsSave">${ICONS.check}<span>${tr('tv.save')}</span></button></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#gsClose')) { this.close(); return; }
      if (e.target.closest('#gsPick')) { $('#gsFile', el).click(); return; }
      if (e.target.closest('#gsSave')) this.save();
      if (e.target.closest('#gsEanClear')) { this.eanClear = true; e.target.closest('small').textContent = tr('tv.gs.eanGone'); }
    });
    $('#gsFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { this.image = await gameImage(f); this.imageChanged = true; const b = $('#gsPick', el); b.innerHTML = `<img src="${this.image}" alt="">`; b.classList.add('has-img'); } catch (err) { if (!err.cancelled) toast(err.message, 'error'); }
    });
  },
  async save() {
    const v = (id) => $(id, this.el).value.trim();
    const num = (id) => Number(v(id)) || null;
    const name = cleanName(v('#gsName'));
    const err = $('#gsErr', this.el);
    if (!name) { err.textContent = tr('tv.gs.errName'); return; }
    const same = findLibrary(name);
    if (same && same.id !== this.id) { err.textContent = tr('tv.gs.errDup'); return; }
    if (num('#gsMin') && num('#gsMax') && num('#gsMin') > num('#gsMax')) { err.textContent = tr('tv.gs.errMinMax'); return; }
    if (v('#gsVideo') && !/^https:\/\/[^\s"<>]+$/.test(v('#gsVideo'))) { err.textContent = tr('tv.gs.errVideo'); return; }
    const year = num('#gsYear');
    const status = v('#gsStatus') || null;
    const patch = {
      name, image: this.image || null,
      minPlayers: num('#gsMin'), maxPlayers: num('#gsMax'), duration: num('#gsDur'),
      mode: v('#gsMode') || null, weight: num('#gsWeight'),
      tags: v('#gsTags') ? [...new Set(v('#gsTags').split(',').map((t) => cleanName(t, 20)).filter(Boolean))].slice(0, 8) : null,
      publisher: cleanName(v('#gsPub'), 40) || null, year: year && year >= 1900 && year <= 2100 ? year : null,
      language: cleanName(v('#gsLang'), 20) || null, owner: cleanName(v('#gsOwner'), 24) || null,
      status, loanTo: status === 'prestato' ? (cleanName(v('#gsLoan'), 24) || null) : null,
      baseId: v('#gsBase') || null,
      rules: $('#gsRules', this.el).value.trim().slice(0, 600) || null,
      setup: $('#gsSetup', this.el).value.trim().slice(0, 300) || null,
      video: /^https:\/\/[^\s"<>]+$/.test(v('#gsVideo')) ? v('#gsVideo').slice(0, 200) : null,
      ...(this.eanClear ? { ean: null } : {})
    };
    try {
      if (S.meta?.armadioId) {
        const before = S.library?.[this.id] || {};
        delete patch.image;
        await saveGame(S.meta.armadioId, this.id, patch, this.imageChanged ? { full: this.image || null } : {});
        armLog(S.meta.armadioId, { op: 'edit', item: this.id, name, by: 'TV', msg: before.name !== name ? `prima: ${before.name}` : '' }); // i18n-ok: cronologia dell'armadio nel database
      } else await update(libRef(this.id), patch);
      toast(tr('tv.gs.saved', { name }));
      this.close();
    } catch (e) { err.textContent = explainError(e); }
  },
  close() { this.el?.remove(); this.el = null; }
};

export const ExportPanel = {
  el: null,
  isOpen() { return Boolean(this.el); },
  open(board, awards) {
    this.close();
    this.board = board;
    this.awards = awards;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel" role="dialog" aria-modal="true" aria-labelledby="exTitle">
        <div class="panel-head"><h2 id="exTitle">${tr('tv.ex.title')}</h2><button type="button" class="icon-btn" id="exClose" aria-label="${tr('tv.close')}">${ICONS.x}</button></div>
        <div class="export-grid">
          <button type="button" class="export-opt" id="exImg"><span aria-hidden="true">🖼️</span><b>${tr('tv.ex.img')}</b><small>${tr('tv.ex.imgText')}</small></button>
          <button type="button" class="export-opt" id="exStory"><span aria-hidden="true">📱</span><b>${tr('tv.ex.story')}</b><small>${tr('tv.ex.storyText')}</small></button>
          <button type="button" class="export-opt" id="exPdf"><span aria-hidden="true">📄</span><b>${tr('tv.ex.pdf')}</b><small>${tr('tv.ex.pdfText')}</small></button>
          <button type="button" class="export-opt" id="exCsv"><span aria-hidden="true">📊</span><b>CSV</b><small>${tr('tv.ex.csvText')}</small></button>
          <button type="button" class="export-opt" id="exVideo"><span aria-hidden="true">🎬</span><b>${tr('tv.ex.video')}</b><small>${tr('tv.ex.videoText')}</small></button>
          <button type="button" class="export-opt" id="exDiscord"><span aria-hidden="true">💬</span><b>${esc(tr('dc.copy'))}</b><small>${esc(tr('dc.copyText'))}</small></button>
          <button type="button" class="export-opt" id="exPlays"><span aria-hidden="true">🗂️</span><b>${esc(tr('trk.title'))}</b><small>${esc(tr('trk.text'))}</small></button>
        </div>
        <label class="check ex-quotes"><input type="checkbox" id="exQuotes" checked><span>${tr('story.withQuotes')}</span></label>
        <details class="dc-hook"><summary>💬 ${esc(tr('dc.hookTitle'))}</summary>
          <p class="muted small">${esc(tr('dc.hookLead'))}</p>
          <label class="sr-only" for="dcHook">${esc(tr('dc.hookLabel'))}</label><input class="input input--sm" id="dcHook" type="url" autocomplete="off" spellcheck="false" placeholder="https://discord.com/api/webhooks/…" value="${esc(getHook() ? '••••••••' : '')}">
          <label class="quick-toggle"><input type="checkbox" id="dcAuto" ${autoSend() ? 'checked' : ''}><span>${esc(tr('dc.auto'))}</span></label>
          <div class="rg-row"><button type="button" class="btn-sec btn-sec--sm" id="dcSave">${esc(tr('dc.save'))}</button><button type="button" class="btn-sec btn-sec--sm" id="dcSend" ${getHook() ? '' : 'disabled'}>📨 ${esc(tr('dc.send'))}</button>${getHook() ? `<button type="button" class="link-btn" id="dcForget">${esc(tr('dc.forget'))}</button>` : ''}</div>
        </details>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('change', (e) => { if (e.target.id === 'dcAuto') setAutoSend(e.target.checked); });
    el.addEventListener('click', async (e) => {
      if (e.target === el || e.target.closest('#exClose')) { this.close(); return; }
      // 2.1 (idee 53 e 54): Discord con webhook salvato solo su questa TV
      if (e.target.closest('#dcSave')) {
        const v = $('#dcHook', el).value.trim();
        if (v === '••••••••') return;
        if (!validHook(v)) { toast(tr('dc.badHook'), 'warn'); return; }
        setHook(v); toast(tr('dc.saved')); this.open(this.board, this.awards); return;
      }
      if (e.target.closest('#dcForget')) { setHook(''); setAutoSend(false); this.open(this.board, this.awards); return; }
      if (e.target.closest('#dcSend')) { sendDiscordNow(this.board, this.awards); return; }
      const b = e.target.closest('.export-opt');
      if (!b) return;
      if (b.id === 'exDiscord') { try { await navigator.clipboard.writeText(discordText(this.board, this.awards)); toast(tr('dc.copied')); } catch { toast(tr('setup.copyFail'), 'warn'); } return; }
      if (b.id === 'exPlays') { downloadFile(exportName({ group: S.meta.groupName || '', at: S.meta.createdAt, kind: tr('exp.k.plays'), ext: 'csv' }), playsCSV(S.games, S.votes, S.players, S.library, { ...S.meta, code: S.code }), 'text/csv;charset=utf-8'); return; }
      b.disabled = true;
      try {
        if (b.id === 'exImg') await this.image();
        if (b.id === 'exStory') await this.story();
        if (b.id === 'exPdf') this.pdf();
        if (b.id === 'exVideo') { const data = this.videoData(); this.close(); VideoPanel.open(data); return; }
        if (b.id === 'exCsv') downloadFile(exportName({ group: S.meta.groupName || '', at: S.meta.createdAt, kind: tr('exp.k.board'), ext: 'csv' }), boardCSV(this.board, S.players), 'text/csv;charset=utf-8');
      } catch (err) {
        toast(tr('tv.ex.failed'), 'error');
        console.error(err);
      } finally { b.disabled = false; }
    });
  },
  title() { return `${S.identity?.emblem && !S.identity?.logo ? `${S.identity.emblem} ` : ''}${S.meta.groupName || tr('tv.ourNight')}`; },
  /** Dati per il video riassunto. */
  videoData() {
    const champs = nightChampions(this.board).filter((c) => c.rank <= 3).slice(0, 3).map((c) => ({ name: playerOrGhost(c.uid).name, points: c.points, player: playerOrGhost(c.uid) }));
    const awards = this.awards.filter((a) => a.kind !== 'ach').map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) }));
    return {
      group: S.meta.groupName || tr('tv.ourNight'), subtitle: nightDate(S.meta.createdAt), number: nightNumber(),
      games: this.board.map((r) => ({ name: r.name, avg: r.stats.avg, image: /^data:image\//.test(r.image || '') ? r.image : null })),
      champs, awards, photos: photoList(S.photos).map((p) => p.data)
    };
  },
  async image() {
    const blob = await renderShareImage({ title: this.title(), subtitle: nightDate(S.meta.createdAt), board: this.board, awards: this.awards.filter((a) => a.kind !== 'ach') });
    await shareOrDownload(blob, exportName({ group: S.meta.groupName || '', at: S.meta.createdAt, kind: tr('exp.k.image'), ext: 'png' }), tr('tv.ex.shareTitle'), true);
  },
  async story() {
    const d = recapData(this.board, this.awards);
    const facts = [tr('tv.ic.nGames', { n: d.games }), tr('tv.fc.players', { n: String(activePlayers(S.players).length) }), d.minutes ? (d.minutes >= 60 ? `${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min` : `${d.minutes} min`) : ''].filter(Boolean).join(' · ');
    const awards = this.awards.filter((a) => a.kind !== 'ach' && !['mvp', 'wins'].includes(a.key)).map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)) }));
    const blob = await renderStoryImage({ title: S.meta.groupName || tr('tv.ourNight'), emblem: S.identity?.logo ? '' : (S.identity?.emblem || ''), color: S.identity?.color, subtitle: nightDate(S.meta.createdAt), number: nightNumber(), board: this.board, mvp: d.mvp, winners: d.kings, facts, awards });
    await shareOrDownload(blob, exportName({ group: S.meta.groupName || '', at: S.meta.createdAt, kind: tr('exp.k.story'), ext: 'png' }), tr('tv.ourNight'), true);
  },
  pdf() {
    const d = recapData(this.board, this.awards);
    const crits = activeCriteria(S.meta.voting);
    const rows = this.board.map((r) => ({
      rank: r.rank, name: r.name, avg: r.stats.avg, n: r.stats.n,
      crit: r.quick ? {} : Object.fromEntries(crits.map((c) => [c.short || c.label, r.stats.crit[c.key] ?? null])),
      mvp: r.stats.mvp.winners.map((u) => playerOrGhost(u).name),
      winners: Object.keys(r.winners || {}).map((u) => playerOrGhost(u).name),
      minutes: r.playedMin || null, audience: r.stats.audience?.n ? r.stats.audience.avg : null, consensus: r.stats.consensus
    }));
    const withQuotes = $('#exQuotes', this.el)?.checked !== false;
    const quotes = [];
    if (withQuotes) for (const r of this.board) for (const v of [...r.stats.list, ...(r.stats.audience?.list || [])]) if (v.comment) quotes.push({ name: playerOrGhost(v.uid).name, game: r.name, text: v.comment });
    // Racconto della serata (1.12, idea 39): solo dati veri del riassunto; i commenti solo se scelti
    const story = storyText(nightStory(nightSummary(this.board, S.players, S.meta, this.awards.filter((a) => a.kind !== 'custom' && a.kind !== 'ach')), { withQuotes }));
    const data = {
      at: S.meta.createdAt,
      story,
      group: S.meta.groupName || '', emblem: S.identity?.logo ? '' : (S.identity?.emblem || ''), color: S.identity?.color,
      date: nightDate(S.meta.createdAt), number: nightNumber(),
      facts: [tr('tv.ic.nGames', { n: d.games }), tr('tv.fc.players', { n: String(activePlayers(S.players).length) }), d.minutes ? `${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min` : ''].filter(Boolean).join(' · '),
      rows,
      awards: this.awards.filter((a) => a.kind !== 'ach').map((a) => ({ title: a.title, who: a.game ? a.game.name : namesList(a.players.map((p) => p.name)), value: a.value })),
      achievements: this.awards.filter((a) => a.kind === 'ach').map((a) => ({ title: a.title, who: namesList(a.players.map((p) => p.name)) })),
      quotes: quotes.slice(0, 20),
      photos: photoList(S.photos),
      next: d.next ? `${d.next}${S.next?.place ? `, ${S.next.place}` : ''}` : ''
    };
    // Browser: finestra di stampa ("Salva come PDF"). App Android: PDF vero salvato e aperto.
    exportReport(data).then((r) => { if (r === 'print') toast(tr('tv.ex.printHint')); });
  },
  close() { this.el?.remove(); this.el = null; }
};

/**
 * Armadio dei giochi: i giochi del gruppo, conservati per tutte le serate. Si prepara prima della serata
 * (dalla schermata iniziale della TV o dal telefono) e si completa anche durante.
 * opts.mount: elemento in cui mostrarlo come pagina (prima della serata); senza, si apre come pannello.
 */
export const LibPanel = {
  el: null,
  sig: '',
  img: null,
  lastFocus: null,

  // Come pagina (prima della serata) non conta come pannello aperto: Esc non lo chiude.
  isOpen() { return Boolean(this.el) && !this.inline; },

  open(opts = {}) {
    if (this.el || !hasLib()) return;
    this.inline = Boolean(opts.mount);
    this.lastFocus = document.activeElement;
    this.img = null;
    const el = document.createElement('div');
    el.className = this.inline ? 'armadio-inline' : 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide ${'armadio'}" role="${this.inline ? 'region' : 'dialog'}" ${this.inline ? '' : 'aria-modal="true"'} aria-labelledby="lpTitle">
        <div class="panel-head">
          <h2 id="lpTitle">${tr('tv.create.armTitle')}</h2>
          ${inRoom() && ['lobby', 'idle'].includes(S.state?.phase) ? `<button type="button" class="btn-sec btn-sec--sm" id="lpSwitchBtn" aria-expanded="false" aria-controls="lpSwitch">🔁 <span>${tr('tv.lib.switch')}</span></button>` : ''}
          ${this.inline ? '' : `<button type="button" class="icon-btn" id="lpClose" aria-label="${tr('tv.close')}">${ICONS.x}</button>`}
        </div>
        <div class="arm-switch" id="lpSwitch" hidden></div>
        ${armReadOnly() ? `<p class="arm-ro">${tr('tv.lib.demo')}</p>` : ''}
        <p class="arm-ro arm-missing" id="lpMissing" hidden>${tr('tv.lib.missing')}</p>
        <p class="panel-note">${tr('tv.lib.note', { name: esc(armadioName()) })}
          ${S.meta.armadioId ? tr('tv.lib.armCode', { code: esc(S.meta.armadioId) }) : tr('tv.lib.groupCode', { code: esc(S.meta.groupId) })}</p>
        <div class="arm-key" id="lpKey"></div>
        <div class="arm-tools">
          <button type="button" class="btn-sec btn-sec--sm" id="lpPhone">📱 <span>${tr('tv.lib.phoneAdd')}</span></button>
          <button type="button" class="btn-sec btn-sec--sm" id="lpQr">🔎 <span>${tr('tv.lib.phoneBrowse')}</span></button>
          ${S.meta.armadioId && !armReadOnly() ? `<a class="btn-sec btn-sec--sm" id="lpFull" href="${'armadio.html'}?a=${esc(S.meta.armadioId)}&s=regia" target="_blank" rel="noopener">🗂️ <span>${tr('tv.lib.full')}</span></a>` : ''}
          <button type="button" class="btn-sec btn-sec--sm" id="lpCsv" title="${tr('tv.lib.csvTitle')}">📥 <span>${tr('tv.lib.csv')}</span></button>
          <input type="file" id="lpCsvFile" accept=".csv,text/csv" hidden>
        </div>
        <form class="lib-add" id="lpForm" novalidate>
          <button type="button" class="lib-add-img" id="lpPick" aria-label="${tr('tv.lib.pick')}">${ICONS.image}</button>
          <label class="sr-only" for="lpName">${tr('tv.eg.name')}</label>
          <input class="input" id="lpName" maxlength="40" autocomplete="off" placeholder="${tr('tv.lib.namePh')}">
          <button type="submit" class="btn" id="lpSubmit">${ICONS.plus}<span>${tr('tv.lib.add')}</span></button>
          <div class="lib-add-more">
            <span class="field-label" id="lpPlLabel">${tr('tv.players')}</span>
            <label class="sr-only" for="lpMin">${tr('tv.lib.min')}</label>
            <select class="input select select--sm" id="lpMin">${playersOptions('', tr('tv.lib.minOpt'))}</select>
            <label class="sr-only" for="lpMax">${tr('tv.lib.max')}</label>
            <select class="input select select--sm" id="lpMax">${playersOptions('', tr('tv.lib.maxOpt'))}</select>
            <label class="sr-only" for="lpDur">${tr('tv.gs.dur')}</label>
            <select class="input select select--sm" id="lpDur">${durationOptions('')}</select>
            <label class="quick-toggle"><input type="checkbox" id="lpSel" checked><span>${tr('tv.lib.tonight')}</span></label>
            <button type="button" class="link-btn" id="lpCancel" hidden>${tr('tv.lib.cancelEdit')}</button>
          </div>
          <div class="lib-add-url">
            <label class="sr-only" for="lpUrl">${tr('tv.lib.url')}</label>
            <input class="input input--sm" id="lpUrl" type="url" inputmode="url" placeholder="${tr('tv.lib.urlPh')}">
            <button type="button" class="btn-sec btn-sec--sm" id="lpUrlOk">${tr('tv.lib.urlOk')}</button>
          </div>
          <input type="file" id="lpFile" accept="image/*" hidden>
        </form>
        <p class="form-error" id="lpErr" role="alert"></p>
        <div class="arm-sel" id="lpSelBar"></div>
        <div class="lib-search">
          <label class="sr-only" for="lpSearch">${tr('tv.lib.search')}</label>
          <input class="input" id="lpSearch" type="search" autocomplete="off" placeholder="${tr('tv.lib.searchPh')}">
          <div class="lib-chips-row" id="lpChips"></div>
        </div>
        <ul class="lib-grid" id="lpList"></ul>
      </div>`;
    (opts.mount || document.body).appendChild(el);
    this.el = el;
    this.sig = '';
    const file = $('#lpFile', el);
    $('#lpCsvFile', el).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const r = await importGamesCSV(f);
        if (r) toast(`${tr('tv.lib.csvDone', { n: r.added })}${r.updated ? tr('tv.lib.csvUpdated', { n: r.updated }) : ''}`);
      } catch (err) { toast(err.message || explainError(err), 'error'); }
    });
    el.addEventListener('click', (e) => {
      if ((!this.inline && e.target === el) || e.target.closest('#lpClose')) { this.close(); return; }
      if (e.target.closest('#lpPick')) { file.click(); return; }
      if (e.target.closest('#lpCsv')) { $('#lpCsvFile', el).click(); return; }
      if (e.target.closest('#lpQr')) { QrPanel.open(tr('tv.lib.qrBrowse'), libraryUrl(), tr('tv.lib.qrBrowseText')); return; }
      if (e.target.closest('#lpPhone')) { QrPanel.open(tr('tv.lib.qrAdd'), armadioPhoneUrl(), tr('tv.lib.qrAddText')); return; }
      if (e.target.closest('#lpUrlOk')) { this.useUrl(); return; }
      if (e.target.closest('#lpCancel')) { this.resetForm(); return; }
      if (e.target.closest('#lpSelClear')) { this.clearSel(); return; }
      if (e.target.closest('#lpKeyGo')) { this.useKey(); return; }
      if (e.target.closest('#lpSwitchBtn')) { this.paintSwitch(); return; }
      const sw = e.target.closest('[data-armswitch]');
      if (sw) { this.doSwitch(sw.dataset.armswitch); return; }
      if (e.target.closest('#lpSwitchGo')) { this.doSwitch(normalizeCode($('#lpSwitchIn', this.el).value, 6)); return; }
      if (e.target.closest('#lpSelAll')) { this.selAll(); return; }
      const sel = e.target.closest('[data-sel]');
      if (sel) { this.toggleSel(sel.dataset.sel); return; }
      const edit = e.target.closest('[data-edit]');
      if (edit) { GameSheet.open(edit.dataset.edit); return; }
      const del = e.target.closest('[data-del]');
      if (del) this.removeItem(del.dataset.del);
    });
    $('#lpUrl', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.useUrl(); } });
    file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) this.setImage(f); });
    this.onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); this.setImage(item.getAsFile()); }
    };
    document.addEventListener('paste', this.onPaste);
    const form = $('#lpForm', el);
    form.addEventListener('dragover', (e) => { e.preventDefault(); form.classList.add('is-over'); });
    form.addEventListener('dragleave', () => form.classList.remove('is-over'));
    form.addEventListener('drop', (e) => {
      e.preventDefault();
      form.classList.remove('is-over');
      const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
      if (f) this.setImage(f);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); this.add(); });
    $('#lpSearch', el).addEventListener('input', (e) => { this.query = e.target.value; this.sig = ''; this.update(); });
    this.query = '';
    this.update();
    $('#lpName', el).focus();
  },

  async useUrl() {
    const err = $('#lpErr', this.el);
    try {
      const r = await gameImageFromUrl($('#lpUrl', this.el).value.trim());
      this.img = r.image;
      const b = $('#lpPick', this.el);
      b.innerHTML = `<img src="${esc(this.img)}" alt="">`;
      b.classList.add('has-img');
      $('#lpUrl', this.el).value = '';
      err.textContent = '';
      if (!r.copied) toast(tr('tv.lib.urlLinked'), 'warn');
    } catch (e) { err.textContent = e.message; }
  },

  async useKey() {
    const aid = S.meta?.armadioId;
    const v = $('#lpKeyIn', this.el)?.value || '';
    if (!aid) return;
    const ok = await ensureArmadioAdmin(aid, v).catch(() => false);
    if (ok) { S.armAdmin = true; registerMembers(); toast(tr('tv.lib.keyOk')); }
    else toast(tr('tv.lib.keyWrong'), 'error');
    this.sig = '';
    this.update();
  },

  /** Riga della chiave: per chi può modificare, la chiave da dare a un'altra TV; per chi consulta, dove scriverla. */
  paintKey() {
    const kb = $('#lpKey', this.el);
    if (!kb) return;
    const aid = S.meta?.armadioId;
    let html = '';
    if (aid && S.armAdmin === false) {
      html = `<span>${tr('tv.lib.readOnly')}</span>
        <span class="gk-row"><label class="sr-only" for="lpKeyIn">${tr('tv.lib.key')}</label><input class="input code-input code-input--8" id="lpKeyIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX"><button type="button" class="btn-sec btn-sec--sm" id="lpKeyGo">${tr('tv.gk.confirm')}</button></span>`;
    } else if (aid && S.armAdmin && armadioKey(aid)) {
      html = `<span>${tr('tv.lib.keyShow', { key: esc(prettyKey(armadioKey(aid))) })}</span>`;
    }
    if (kb.dataset.sig !== html) { kb.dataset.sig = html; kb.innerHTML = html; kb.hidden = !html; }
  },

  /** Elenco degli armadi per cambiare quello della serata. */
  paintSwitch() {
    const box = $('#lpSwitch', this.el);
    const btn = $('#lpSwitchBtn', this.el);
    if (!box) return;
    box.hidden = !box.hidden;
    btn?.setAttribute('aria-expanded', String(!box.hidden));
    if (box.hidden) return;
    const list = recentArmadi().filter((a) => a.id !== S.meta?.armadioId);
    box.innerHTML = `
      <p class="muted small">${tr('tv.lib.switchText')}</p>
      ${list.length ? `<div class="arm-list">${list.map((a) => `<button type="button" class="arm-open-btn" data-armswitch="${esc(a.id)}">📦 <span>${esc(a.name)}</span><small>${esc(a.id)}</small></button>`).join('')}</div>` : ''}
      <div class="arm-inline"><label class="sr-only" for="lpSwitchIn">${tr('tv.create.armCodeLabel')}</label><input class="input input--sm" id="lpSwitchIn" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="${tr('tv.lib.switchPh')}"><button type="button" class="btn-sec btn-sec--sm" id="lpSwitchGo">${tr('tv.lib.use')}</button></div>
      <p class="form-error" id="lpSwitchErr" role="alert"></p>`;
  },
  async doSwitch(id) {
    const err = $('#lpSwitchErr', this.el);
    if (!/^[A-Z0-9]{6}$/.test(id || '')) { if (err) err.textContent = tr('tv.arm.codeLen'); return; }
    if (id === S.meta?.armadioId) return;
    try {
      await switchArmadio(id);
      this.close();
    } catch (e) { if (err) err.textContent = explainError(e); }
  },

  toggleSel(id) {
    const it = S.library?.[id];
    if (!it) return;
    writeSel({ [id]: isSel({ ...it, id }) ? null : true }).catch((e) => toast(explainError(e), 'error'));
  },

  clearSel() {
    const ids = selectedIds();
    if (!ids.length || !confirm(tr('tv.lib.clearConfirm'))) return;
    writeSel(Object.fromEntries(ids.map((id) => [id, null]))).catch((e) => toast(explainError(e), 'error'));
  },

  selAll() {
    const ids = libraryItems().filter((it) => isAvailable(it) && !isSel(it)).map((it) => it.id);
    if (!ids.length) return;
    writeSel(Object.fromEntries(ids.map((id) => [id, true]))).catch((e) => toast(explainError(e), 'error'));
  },

  close() {
    if (!this.el) return;
    document.removeEventListener('paste', this.onPaste);
    this.el.remove();
    this.el = null;
    if (!this.inline) this.lastFocus?.focus?.();
    this.inline = false;
  },

  resetPick() {
    const b = $('#lpPick', this.el);
    b.innerHTML = ICONS.image;
    b.classList.remove('has-img');
  },

  resetForm() {
    this.editId = null;
    this.img = null;
    this.resetPick();
    $('#lpName', this.el).value = '';
    $('#lpMin', this.el).value = '';
    $('#lpMax', this.el).value = '';
    $('#lpDur', this.el).value = '';
    $('#lpSel', this.el).checked = true;
    $('#lpSel', this.el).closest('label').hidden = false;
    $('#lpSubmit', this.el).innerHTML = `${ICONS.plus}<span>${tr('tv.lib.add')}</span>`;
    $('#lpCancel', this.el).hidden = true;
    $('#lpErr', this.el).textContent = '';
    $('#lpName', this.el).focus();
  },

  startEdit(id) {
    const it = S.library?.[id];
    if (!it) return;
    this.editId = id;
    this.img = null;
    $('#lpName', this.el).value = it.name;
    $('#lpMin', this.el).value = it.minPlayers || '';
    $('#lpMax', this.el).value = it.maxPlayers || '';
    $('#lpDur', this.el).value = it.duration || '';
    $('#lpSel', this.el).closest('label').hidden = true;
    const b = $('#lpPick', this.el);
    const shown = it.image || it.thumb;
    if (shown) { b.innerHTML = `<img src="${esc(shown)}" alt="">`; b.classList.add('has-img'); } else this.resetPick();
    $('#lpSubmit', this.el).innerHTML = `${ICONS.check}<span>${tr('tv.save')}</span>`;
    $('#lpCancel', this.el).hidden = false;
    $('#lpErr', this.el).textContent = '';
    $('#lpName', this.el).focus();
  },

  /** Giocatori e durata scelti nel modulo (null se non indicati). */
  extra() {
    const num = (id) => Number($(id, this.el).value) || null;
    return { minPlayers: num('#lpMin'), maxPlayers: num('#lpMax'), duration: num('#lpDur') };
  },

  async setImage(f) {
    try {
      this.img = await gameImage(f);
      const b = $('#lpPick', this.el);
      b.innerHTML = `<img src="${this.img}" alt="">`;
      b.classList.add('has-img');
      $('#lpErr', this.el).textContent = '';
    } catch (err) {
      $('#lpErr', this.el).textContent = err.message;
    }
  },

  async add() {
    const input = $('#lpName', this.el);
    const err = $('#lpErr', this.el);
    const name = cleanName(input.value);
    const extra = this.extra();
    if (!name) { err.textContent = tr('tv.lib.needName'); input.focus(); return; }
    if (extra.minPlayers && extra.maxPlayers && extra.minPlayers > extra.maxPlayers) {
      err.textContent = tr('tv.gs.errMinMax');
      return;
    }
    const same = findLibrary(name);
    try {
      if (this.editId) {
        if (same && same.id !== this.editId) { err.textContent = tr('tv.gs.errDup'); return; }
        const patch = { name, ...extra };
        if (S.meta?.armadioId) await saveGame(S.meta.armadioId, this.editId, patch, this.img ? { full: this.img } : {});
        else { if (this.img) patch.image = this.img; await update(libRef(this.editId), patch); }
        toast(tr('tv.gs.saved', { name }));
      } else {
        if (same && !this.img && !Object.values(extra).some(Boolean)) { err.textContent = tr('tv.lib.already'); return; }
        const id = await addToLibrary(name, this.img, 'TV', extra);
        if (id && $('#lpSel', this.el).checked) await writeSel({ [id]: true });
        toast(`${tr('tv.lib.added', { name })}${$('#lpSel', this.el).checked ? tr('tv.lib.addedTonight') : ''}`);
      }
      this.resetForm();
    } catch (e) {
      err.textContent = explainError(e);
    }
  },

  removeItem(id) {
    const it = S.library?.[id];
    if (!it || !confirm(tr('tv.lib.delConfirm', { name: it.name }))) return;
    if (S.meta?.armadioId) armTrash(S.meta.armadioId, id, it, 'TV').then(() => toast(tr('tv.lib.deleted', { name: it.name }))).catch((e) => toast(explainError(e), 'error'));
    else remove(libRef(id)).catch((e) => toast(explainError(e), 'error'));
  },

  update() {
    if (!this.el) return;
    this.paintKey();
    const miss = $('#lpMissing', this.el);
    if (miss) miss.hidden = !S.armMissing;
    this.el.querySelector('.armadio')?.classList.toggle('armadio--ro', armReadOnly());
    const all = libraryItems();
    const played = playedTonight();
    const sig = JSON.stringify([all.map((i) => [i.id, i.name, i.addedBy, (i.image || '').length, libInfo(i), i.status, i.loanTo, tagsOf(i), i.baseId, i.mode, i.weight, isSel(i)]), [...played], this.query]);
    if (sig === this.sig) return;
    this.sig = sig;
    // Ricerca: parole chiave + filtri capiti dalla frase
    const q = String(this.query || '').trim();
    const tags = [...new Set(all.flatMap(tagsOf))];
    const f = q ? parseQuery(q, knownPeople(), tags) : {};
    const structured = Object.keys(f).length > 0;
    if (q && !structured) f.text = q;
    const ids = new Set(searchLibrary(S.library, f, S.nights).map((x) => x.id));
    const items = all.filter((it) => ids.has(it.id));
    $('#lpChips', this.el).innerHTML = q ? `${filterChips(f).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}<span class="muted">${tr('tv.lib.found', { n: String(items.length), total: String(all.length) })}</span>` : '';
    const baseName = (id) => S.library?.[id]?.name;
    const nSel = all.filter((it) => isSel(it)).length;
    $('#lpSelBar', this.el).innerHTML = all.length ? `
      <span class="arm-sel-n">${tr('tv.lib.selN', { n: nSel })}</span>
      <span class="muted small">${nSel >= 2 ? tr('tv.lib.selMany') : tr('tv.lib.selFew')}</span>
      <span class="rg-row">${nSel < all.length ? `<button type="button" class="btn-sec btn-sec--sm" id="lpSelAll">${tr('tv.lib.selAll')}</button>` : ''}${nSel ? `<button type="button" class="btn-sec btn-sec--sm" id="lpSelClear">${tr('tv.lib.selClear')}</button>` : ''}</span>` : '';
    $('#lpList', this.el).innerHTML = items.length ? items.map((it) => {
      const isPlayed = played.has(nameKey(it.name));
      const status = !isAvailable(it) ? esc(awayLabel(it)) : '';
      const note = isPlayed ? tr('tv.lib.played') : (it.owner ? tr('tv.lib.owner', { name: esc(it.owner) }) : it.addedBy && it.addedBy !== 'TV' ? tr('tv.lib.broughtBy', { name: esc(it.addedBy) }) : '');
      return `
        <li class="lib-tile ${isPlayed ? 'is-played' : ''} ${status ? 'is-away' : ''} ${isSel(it) ? 'is-sel' : ''}">
          ${gameImageHTML(it, 'game-img--lib')}
          <button type="button" class="lib-sel" data-sel="${esc(it.id)}" aria-pressed="${isSel(it)}" title="${isSel(it) ? tr('tv.lib.selOn') : tr('tv.lib.selOff')}">${isSel(it) ? '✓' : '☆'}<span>${tr('tv.int.tonight')}</span></button>
          ${status ? `<span class="lib-status">${status}</span>` : ''}
          <span class="lib-name">${esc(it.name)}</span>
          ${it.baseId && baseName(it.baseId) ? `<span class="lib-exp">${tr('tv.lib.expOf', { name: esc(baseName(it.baseId)) })}</span>` : ''}
          <span class="lib-info">${esc(libInfo(it)) || '&nbsp;'}</span>
          ${tagsOf(it).length || it.mode || it.weight ? `<span class="lib-tags">${it.mode ? `<span>${esc(GAME_MODES[it.mode] || it.mode)}</span>` : ''}${it.weight ? `<span>${tr('tv.lib.weight', { n: it.weight })}</span>` : ''}${tagsOf(it).slice(0, 3).map((t) => `<span>#${esc(t)}</span>`).join('')}</span>` : ''}
          <span class="lib-meta">${note}</span>
          <button type="button" class="lib-edit" data-edit="${esc(it.id)}" aria-label="${tr('tv.lib.edit', { name: esc(it.name) })}">${ICONS.edit}</button>
          <button type="button" class="${'lib-del'}" data-${'del'}="${esc(it.id)}" aria-label="${tr('tv.lib.del', { name: esc(it.name) })}">${ICONS.x}</button>
        </li>`;
    }).join('') : `<li class="lib-empty">${all.length ? tr('tv.lib.noMatch') : tr('tv.lib.empty')}</li>`;
  }
};

/**
 * Modelli di serata (idea 10) e "riparti da una serata precedente" (idea 11): solo impostazioni e scaletta,
 * mai voti, punteggi o giocatori. Ogni applicazione mostra prima che cosa cambia.
 */
export const TemplatesPanel = {
  el: null,
  list: [],
  isOpen() { return Boolean(this.el); },
  where() { return S.meta?.groupId && (S.groupAdmin || S.groupOrganizer) ? 'group' : 'local'; },
  async load() {
    const gid = S.meta?.groupId;
    const fromGroup = gid ? (await get(groupRef(gid, 'templates')).catch(() => null))?.val() || {} : {};
    this.list = [...templateList(fromGroup).map((x) => ({ ...x, src: 'group' })), ...templateList(LocalTemplates.all()).map((x) => ({ ...x, src: 'local' }))];
  },
  async open() {
    if (this.el || !S.code) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="card panel panel--wide" role="dialog" aria-modal="true" aria-labelledby="tpTitle">
        <div class="panel-head"><h2 id="tpTitle">🗂️ ${esc(tr('tpl.title'))}</h2><button type="button" class="icon-btn" id="tpClose" aria-label="${tr('tv.close')}">${ICONS.x}</button></div>
        <p class="panel-note">${esc(tr('tpl.lead'))}</p>
        <div class="tp-body" id="tpBody"><p class="muted">${esc(tr('tv.tl.reading'))}</p></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'tpSaveForm') this.save(); });
    await this.load();
    this.paint();
  },
  paint() {
    if (!this.el) return;
    const nights = nightsList(S.nights || {}).filter((n) => n.room !== S.code).slice(0, 12);
    const tpl = this.list.map((x) => `<li class="tp-item"><span><b>${esc(x.name)}</b><small class="muted">${esc(x.src === 'group' ? tr('tpl.inGroup') : tr('tpl.onTv'))}${x.at ? ` · ${esc(fmtDateL(x.at, { day: 'numeric', month: 'short' }))}` : ''}</small></span>
        <span class="tp-acts"><button type="button" class="btn-sec btn-sec--sm" data-tp-preview="${esc(x.src)}:${esc(x.id)}">${esc(tr('tpl.preview'))}</button>
        ${x.src === 'local' || S.groupAdmin || S.groupOrganizer ? `<button type="button" class="btn-sec btn-sec--sm am-danger" data-tp-rm="${esc(x.src)}:${esc(x.id)}" aria-label="${esc(tr('tpl.delete', { name: x.name }))}">✕</button>` : ''}</span></li>`).join('');
    $('#tpBody', this.el).innerHTML = `
      <section class="tp-sec"><h3>${esc(tr('tpl.saved'))}</h3>
        ${tpl ? `<ul class="tp-list">${tpl}</ul>` : `<p class="muted">${esc(tr('tpl.none'))}</p>`}
        <form class="rg-row" id="tpSaveForm"><label class="sr-only" for="tpName">${esc(tr('tpl.name'))}</label>
          <input class="input input--sm" id="tpName" maxlength="40" placeholder="${esc(tr('tpl.namePh'))}">
          <button type="submit" class="btn-sec">💾 <span>${esc(tr('tpl.saveNow'))}</span></button>
          <details class="tp-trad"><summary>${esc(tr('mem.tpl.trad'))}</summary>
            <label><span class="field-label">${esc(tr('mem.tpl.opening'))}</span><input class="input input--sm" id="tpOpening" maxlength="60" list="tpGames" value="${esc(S.meta?.opening || '')}" placeholder="${esc(tr('mem.tpl.openingPh'))}"></label>
            <datalist id="tpGames">${libraryItems().map((it) => `<option value="${esc(it.name)}">`).join('')}</datalist>
            <label><span class="field-label">${esc(tr('mem.tpl.award'))}</span><input class="input input--sm" id="tpAward" maxlength="32" value="${esc(S.meta?.award?.t || '')}" placeholder="${esc(tr('mem.tpl.awardPh'))}"></label>
            <p class="muted small">${esc(tr('mem.tpl.tradNote'))}</p>
          </details></form>
        <p class="muted small">${esc(this.where() === 'group' ? tr('tpl.whereGroup') : S.meta?.groupId ? tr('tpl.whereLocalNotAdmin') : tr('tpl.whereLocal'))}</p></section>
      <section class="tp-sec"><h3>${esc(tr('tpl.again'))}</h3>
        ${nights.length ? `<ul class="tp-list">${nights.map((n) => `<li class="tp-item"><span><b>${esc(n.title || `Game Night #${n.number}`)}</b><small class="muted">${esc(nightDate(n.at))} · ${esc(tr('tpl.nGames', { n: n.gamesCount }))}</small></span>
          <span class="tp-acts"><button type="button" class="btn-sec btn-sec--sm" data-tp-night="${esc(n.room)}">${esc(tr('tpl.preview'))}</button></span></li>`).join('')}</ul>` : `<p class="muted">${esc(tr('tpl.noNights'))}</p>`}
      </section>
      <section class="tp-sec" id="tpPreview" hidden></section>`;
  },
  click(e) {
    if (e.target === this.el || e.target.closest('#tpClose')) { this.close(); return; }
    const pv = e.target.closest('[data-tp-preview]');
    if (pv) { const [src, id] = pv.dataset.tpPreview.split(':'); const x = this.list.find((y) => y.src === src && y.id === id); if (x) this.preview({ title: x.name, s: x.s, items: null }); return; }
    const dl = e.target.closest('[data-tp-rm]');
    if (dl) { this.remove(...dl.dataset.tpRm.split(':')); return; }
    const nt = e.target.closest('[data-tp-night]');
    if (nt) { this.fromNight(nt.dataset.tpNight); return; }
    if (e.target.closest('#tpApply')) this.apply();
  },
  async save() {
    const name = $('#tpName', this.el).value;
    let tpl;
    const cur = settingsFromMeta(S.meta, Music.mode());
    const opening = $('#tpOpening', this.el)?.value.trim() || '';
    const award = $('#tpAward', this.el)?.value.trim() || '';
    const settings = { ...cur, opening: opening || null, award: award ? { t: award, e: S.meta?.award?.t === award ? S.meta.award.e : '🎖️' } : null };
    try { tpl = makeTemplate(name, settings); } catch { toast(tr('tpl.nameNeeded'), 'warn'); $('#tpName', this.el).focus(); return; }
    const id = `t${Date.now().toString(36)}`;
    try {
      if (this.where() === 'group') {
        if (this.list.filter((x) => x.src === 'group').length >= TEMPLATE_MAX) throw Object.assign(new Error('full'), { code: 'full' });
        await set(groupRef(S.meta.groupId, `templates/${id}`), tpl);
      } else LocalTemplates.save(id, tpl);
      toast(tr('tpl.savedToast', { name: tpl.name }));
      logEvent(tr('tpl.log.saved', { name: tpl.name }), '🗂️');
      await this.load(); this.paint();
    } catch (err) { toast(err.code === 'full' ? tr('tpl.full', { n: TEMPLATE_MAX }) : explainError(err), 'error'); }
  },
  async remove(src, id) {
    const x = this.list.find((y) => y.src === src && y.id === id);
    if (!x || !confirm(tr('tpl.deleteAsk', { name: x.name }))) return;
    try {
      if (src === 'group') await remove(groupRef(S.meta.groupId, `templates/${id}`)); else LocalTemplates.remove(id);
      await this.load(); this.paint();
    } catch (err) { toast(explainError(err), 'error'); }
  },
  async fromNight(room) {
    const night = S.nights?.[room];
    if (!night) return;
    // Impostazioni: dalla stanza, se esiste ancora (i riassunti non le contengono)
    const meta = (await get(roomRef(room, 'meta')).catch(() => null))?.val() || null;
    const plan = S.library ? planFromNight(night, S.library) : { ids: [], missing: [] };
    this.preview({ title: tr('tpl.likeNight', { date: nightDate(night.at) }), s: meta ? settingsFromMeta(meta, Music.mode()) : null, items: plan.ids, missing: plan.missing, noArm: !S.library });
  },
  preview({ title, s, items, missing = [], noArm = false }) {
    this.pending = { s, items };
    const box = $('#tpPreview', this.el);
    const diff = s ? settingsDiff(S.meta, Music.mode(), s) : [];
    const lib = S.library || {};
    box.hidden = false;
    box.innerHTML = `<h3>${esc(tr('tpl.previewTitle', { name: title }))}</h3>
      ${s ? (diff.length ? `<ul class="tp-diff">${diff.map((d) => `<li><b>${esc(tr(`tpl.k.${d.key}`))}</b>: ${esc(settingLabel(d.key, d.from))} → <b>${esc(settingLabel(d.key, d.to))}</b></li>`).join('')}</ul>` : `<p class="muted">${esc(tr('tpl.noChange'))}</p>`) : `<p class="muted">${esc(tr('tpl.noSettings'))}</p>`}
      ${items ? (items.length ? `<p>${esc(tr('tpl.planWill', { list: items.map((id) => lib[id]?.name).filter(Boolean).join(', ') }))}</p>` : `<p class="muted">${esc(noArm ? tr('tpl.noArm') : tr('tpl.planNone'))}</p>`) : ''}
      ${missing.length ? `<p class="muted small">${esc(tr('tpl.missing', { list: missing.join(', ') }))}</p>` : ''}
      <p class="muted small">${esc(tr('tpl.never'))}</p>
      ${(s && diff.length) || items?.length ? `<button type="button" class="btn" id="tpApply">✅ <span>${esc(tr('tpl.apply'))}</span></button>` : ''}`;
    box.scrollIntoView?.({ block: 'nearest' });
  },
  async apply() {
    const p = this.pending;
    if (!p) return;
    try {
      const upd = {};
      if (p.s) {
        const { patch, music } = settingsPatch(p.s, { activePlayers: activePlayers(S.players).length });
        for (const [k, v] of Object.entries(patch)) upd[`meta/${k}`] = v;
        if (music) { Music.setMode(music); syncMusic(true); }
      }
      if (p.items?.length) {
        const cur = Array.isArray(S.plan?.items) ? S.plan.items : [];
        upd.plan = { items: [...new Set([...cur, ...p.items])].slice(0, 30), minutes: Number(S.plan?.minutes) || null, at: serverTimestamp() };
      }
      if (Object.keys(upd).length) await update(roomRef(S.code, ''), upd);
      toast(tr('tpl.applied'));
      logEvent(tr('tpl.log.applied'), '🗂️');
      this.close();
    } catch (err) { toast(explainError(err), 'error'); }
  },
  close() { this.el?.remove(); this.el = null; this.pending = null; }
};
