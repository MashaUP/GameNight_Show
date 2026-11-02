// Schermate della TV estratte da host.js (2.1, idea 76): tra un gioco e l'altro, classifica, premiazione,
// sondaggio, "Di sempre". Il codice è lo stesso di prima; quello che appartiene a host.js (stato S, cambio di
// fase, pannelli…) arriva con bindScreens() all'avvio della pagina.
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

// Dalla pagina della TV (host.js): stato della serata, pannelli e funzioni condivise.
let AlbumPanel, EditGame, ExportPanel, GameSheet, Interval, LibPanel, RecoPanel, S, armadioName, awayLabel, backFromAllTime, boostWishes, clockText, endNight, findLibrary, goNext, hasLib, isSel, libOk, libraryItems, libraryUrl, miniBoardHTML, namesList, newNight, nextNightHTML, openAllTime, openVotingWith, paintHouseNote, photoList, playElapsed, playState, playUrl, playedTonight, playerByName, playerOrGhost, pollGo, pollTally, poolLibrary, recapData, renderQR, reopenVoting, saveDraft, saveNextNight, setPhase, startPoll, teamBoardHTML, upgradeDraftImage, useLibraryGame;
export function bindScreens(c) {
  ({ AlbumPanel, EditGame, ExportPanel, GameSheet, Interval, LibPanel, RecoPanel, S, armadioName, awayLabel, backFromAllTime, boostWishes, clockText, endNight, findLibrary, goNext, hasLib, isSel, libOk, libraryItems, libraryUrl, miniBoardHTML, namesList, newNight, nextNightHTML, openAllTime, openVotingWith, paintHouseNote, photoList, playElapsed, playState, playUrl, playedTonight, playerByName, playerOrGhost, pollGo, pollTally, poolLibrary, recapData, renderQR, reopenVoting, saveDraft, saveNextNight, setPhase, startPoll, teamBoardHTML, upgradeDraftImage, useLibraryGame } = c);
}

export const IdleScreen = {
  mount(el) {
    this.mode = 'drop';
    this.ctaPlaying = undefined;
    const number = Object.keys(S.games).length + 1;
    // Tradizione del modello (1.12, idea 24): la serata si apre con il gioco d'apertura
    const opening = number === 1 && typeof S.meta.opening === 'string' ? S.meta.opening : '';
    if (opening && !S.draft.name && S.openingUsed !== S.code) {
      S.openingUsed = S.code;
      const it = findLibrary(opening);
      S.draft.name = it?.name || opening;
      S.draft.libraryId = it?.id || null;
      saveDraft();
    }
    const board = buildBoard(S.games, S.votes);
    // 2.2: la copertina del gioco è la protagonista. In alto il nastro dei giochi, poi copertina grande
    // (intera, mai tagliata) con le azioni della foto discrete; a destra nome, chi gioca e un'azione
    // principale sola (cambia con lo stato: prima "Inizia la partita", a partita iniziata "Apri la votazione").
    // La classifica è una colonna stretta con in cima la barra delle azioni della serata.
    el.innerHTML = `
      <section class="idle idle--v22">
        <form class="card next-card" id="nextForm" novalidate>
          <div class="ng-head">
            <h1>${tr('tv.idle.game', { n: String(number) })}</h1>
            ${opening ? `<p class="trad-chip">🎬 ${tr('mem.opening.chip', { name: esc(opening) })}</p>` : ''}
            <p class="play-timer" id="playTimer" hidden></p>
          </div>
          <div class="live-box" id="liveBox"></div>
          <div class="lib-pick" id="libPick"></div>
          <div class="ng-body">
            <div class="ng-hero">
              <div class="dropzone" id="dropzone"></div>
              <div class="img-actions" role="group" aria-label="${esc(tr('tv.idle.photo').replace(/<[^>]*>/g, ''))}">
                <button type="button" class="btn-sec btn-sec--sm" id="pickFile" title="${tr('tv.idle.file')}">${ICONS.image}<span>${tr('tv.idle.file')}</span></button>
                <button type="button" class="btn-sec btn-sec--sm" id="fromPhone" aria-pressed="false" title="${tr('tv.idle.phone')}">${ICONS.phone}<span>${tr('tv.idle.phone')}</span></button>
                <button type="button" class="btn-sec btn-sec--sm" id="fromUrl" aria-expanded="false" aria-controls="urlPanel" title="${tr('tv.idle.link')}">${ICONS.link}<span>${tr('tv.idle.link')}</span></button>
              </div>
              <input type="file" id="fileInput" accept="image/*" hidden>
              <div class="url-panel" id="urlPanel" hidden>
                <label class="sr-only" for="urlInput">${tr('tv.idle.url')}</label>
                <input class="input" id="urlInput" type="url" inputmode="url" placeholder="${tr('tv.idle.urlPh')}">
                <button type="button" class="btn-sec" id="urlOk">${tr('tv.lib.urlOk')}</button>
              </div>
            </div>
            <div class="ng-side">
              <label class="field-label" for="gameName">${tr('tv.eg.name')}</label>
              <input class="input input--xl" id="gameName" maxlength="40" autocomplete="off" placeholder="${tr('tv.idle.namePh')}" value="${esc(S.draft.name)}">
              <div class="house-note" id="houseNote" hidden></div>
              <div class="win-pick">
                <div class="win-head">
                  <span class="field-label" id="winLabel">${tr('tv.idle.winners')}</span>
                  <label class="quick-toggle" title="${tr('tv.idle.quickTitle')}"><input type="checkbox" id="quickChk" ${S.draft.quick ? 'checked' : ''}><span>${tr('tv.idle.quick')}</span></label>
                </div>
                <div class="win-avs" id="winAvs" role="group" aria-labelledby="winLabel"></div>
              </div>
              <p class="form-error" id="nextErr" role="alert"></p>
              <div class="ov-row ng-cta">
                <button class="btn-sec btn-sec--sm" type="button" id="openRules" title="${tr('tv.idle.rulesTitle')}">📖 <span>${tr('tv.idle.rules')}</span></button>
                <button class="btn ng-primary" type="button" id="startPlay">${ICONS.clock}<span id="startPlayTxt">${tr('tv.tour.i4.t')}</span></button>
                <button class="btn-sec ng-second" type="submit" id="openVote">${ICONS.lock}<span>${tr('tv.tour.i5.t')}</span></button>
              </div>
            </div>
          </div>
        </form>
        <aside class="side-board">
          <div class="side-toolbar" role="toolbar" aria-label="${tr('tv.idle.toolbar')}">
            <button type="button" class="btn-sec btn-sec--sm" id="showInterval" title="${tr('tv.idle.intTitle')}">☕ <span>${tr('tv.tl.interval')}</span></button>
            <button type="button" class="btn-sec btn-sec--sm" id="openTable" title="${tr('tv.idle.tableTitle')}">🎲 <span>${tr('tv.idle.table')}</span></button>
            ${S.meta.groupId ? `<button type="button" class="btn-sec btn-sec--sm" id="openPlan" title="${tr('tv.idle.planTitle')}">🗓️ <span>${tr('tv.idle.plan')}</span></button>` : ''}
            <button type="button" class="btn-sec btn-sec--sm" id="openQuiz" title="${tr('tv.idle.quizTitle')}">🧠 <span>Quiz</span></button>
            <button type="button" class="btn-sec btn-sec--sm side-end" id="endNight" title="${tr('tv.hdr.endTitle')}">🏁 <span>${tr('tv.end.end')}</span></button>
          </div>
          <div class="side-head">
            <h2>${tr('tv.ic.board')}</h2>
            ${board.length ? `<span class="muted">${tr('tv.ic.nGames', { n: board.length })}</span>` : ''}
          </div>
          <div class="side-scroll">${miniBoardHTML(board)}</div>
          <div class="side-actions">
            ${board.length ? `<button type="button" class="btn-sec btn-sec--sm" id="showBoard">${ICONS.trophy}<span>${tr('tv.idle.fullBoard')}</span></button>` : ''}
            ${S.meta.groupId ? `<button type="button" class="btn-sec btn-sec--sm" id="showAllTime">${ICONS.star}<span>${tr('tv.idle.allTime')}</span></button>` : ''}
          </div>
        </aside>
      </section>`;

    $('#showAllTime', el)?.addEventListener('click', () => openAllTime());
    $('#showInterval', el).addEventListener('click', () => Interval.open());
    $('#openTable', el).addEventListener('click', () => TablePanel.open());
    $('#openQuiz', el).addEventListener('click', () => Quiz.open());
    $('#openPlan', el)?.addEventListener('click', () => PlanPanel.open());
    $('#openRules', el).addEventListener('click', () => {
      const it = findLibrary(cleanName($('#gameName').value));
      if (!it) { this.error(tr('tv.idle.rulesErr')); return; }
      RulesPanel.open(it.id);
    });
    $('#liveBox', el).addEventListener('click', (e) => { const b = e.target.closest('[data-score-edit]'); if (b) editScore(b.dataset.scoreEdit); });
    $('#winAvs', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-win]');
      if (!b) return;
      const uid = b.dataset.win;
      const wins = S.draft.winners || [];
      const specs = S.draft.spectators || [];
      // giocatore → vincitore → spettatore → giocatore
      if (wins.includes(uid)) { S.draft.winners = wins.filter((x) => x !== uid); S.draft.spectators = [...specs, uid]; }
      else if (specs.includes(uid)) S.draft.spectators = specs.filter((x) => x !== uid);
      else S.draft.winners = [...wins, uid];
      this.paintWinners(true);
      saveDraft();
    });
    $('#quickChk', el).addEventListener('change', (e) => { S.draft.quick = e.target.checked; saveDraft(); });
    $('#startPlay', el).addEventListener('click', () => {
      const name = cleanName($('#gameName').value);
      if (!name) { this.error(tr('tv.idle.needGame')); $('#gameName').focus(); return; }
      update(roomRef(S.code, 'state'), playState(name, S.draft.spectators)).catch((err) => this.error(explainError(err)));
      newGameSound();
    });
    this.tick = setInterval(() => this.paintTimer(), 1000);
    $('#libPick', el).addEventListener('click', (e) => {
      if (e.target.closest('#startPoll')) { startPoll(); return; }
      if (e.target.closest('#openWheel')) { GameWheel.open(); return; }
      if (e.target.closest('#pickRandom')) { this.randomPick(); return; }
      const pu = e.target.closest('[data-plan-use]');
      if (pu) { useLibraryGame(pu.dataset.planUse); return; }
      if (e.target.closest('#openReco')) { RecoPanel.open(); return; }
      if (e.target.closest('#openLib')) { LibPanel.open(); return; }
      const po = e.target.closest('[data-pool]');
      if (po) { S.poolAll = po.dataset.pool === 'all'; this.paintLib(true); return; }
      const lf = e.target.closest('[data-libf]');
      if (lf) { this.libFilter = lf.dataset.libf; this.paintLib(true); return; }
      const li = e.target.closest('[data-libinfo]');
      if (li) { GameSheet.open(li.dataset.libinfo); return; }
      const chip = e.target.closest('[data-lib]');
      if (!chip || this.rolling) return;
      this.pickLib(chip.dataset.lib);
    });

    // Ricerca e ordinamento dei giochi: si ridisegna l'elenco tenendo il cursore nella casella
    $('#libPick', el).addEventListener('input', (e) => {
      if (e.target.id !== 'libSearch') return;
      this.libQ = e.target.value;
      const pos = e.target.selectionStart;
      this.paintLib(true);
      const box = $('#libSearch');
      if (box) { box.focus(); try { box.setSelectionRange(pos, pos); } catch { /* niente */ } }
    });
    $('#libPick', el).addEventListener('change', (e) => { if (e.target.id === 'libSortSel') { this.libSort = e.target.value; this.paintLib(true); } });

    const nameInput = $('#gameName', el);
    nameInput.addEventListener('input', () => {
      S.draft.name = nameInput.value;
      saveDraft();
      paintHouseNote();
      if (S.draft.libraryId && nameKey(S.library?.[S.draft.libraryId]?.name) !== nameKey(nameInput.value)) {
        S.draft.libraryId = null;
        this.paintLib(true);
      }
    });
    setTimeout(() => nameInput.focus(), 50);

    const fileInput = $('#fileInput', el);
    $('#pickFile', el).addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) this.useFile(fileInput.files[0]); fileInput.value = ''; });

    const dz = $('#dropzone', el);
    dz.addEventListener('click', (e) => {
      if (e.target.closest('#clearImg')) { S.draft.image = null; this.paintDrop(); return; }
      if (this.mode === 'drop' && !S.draft.image) fileInput.click();
    });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('is-over');
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file) this.useFile(file);
    });

    this.onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) { e.preventDefault(); this.useFile(item.getAsFile()); }
    };
    document.addEventListener('paste', this.onPaste);

    $('#fromPhone', el).addEventListener('click', () => {
      this.mode = this.mode === 'phone' ? 'drop' : 'phone';
      if (this.mode === 'phone' && S.pendingImage) remove(roomRef(S.code, 'pendingImage')).catch(() => {});
      this.paintDrop();
    });

    const urlBtn = $('#fromUrl', el);
    const urlPanel = $('#urlPanel', el);
    urlBtn.addEventListener('click', () => {
      urlPanel.hidden = !urlPanel.hidden;
      urlBtn.setAttribute('aria-expanded', String(!urlPanel.hidden));
      el.querySelector('.next-card').classList.toggle('has-url', !urlPanel.hidden);
      if (!urlPanel.hidden) $('#urlInput').focus();
    });
    const useUrl = async () => {
      const url = $('#urlInput').value.trim();
      try {
        const r = await gameImageFromUrl(url);
        S.draft.image = r.image;
        this.mode = 'drop';
        this.error('');
        this.paintDrop();
        urlPanel.hidden = true;
        urlBtn.setAttribute('aria-expanded', 'false');
        el.querySelector('.next-card').classList.remove('has-url');
      } catch (err) { this.error(err.message); }
    };
    $('#urlOk', el).addEventListener('click', useUrl);
    $('#urlInput', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); useUrl(); } });

    $('#nextForm', el).addEventListener('submit', (e) => { e.preventDefault(); this.openVoting(); });
    $('#showBoard', el)?.addEventListener('click', () => setPhase('board'));
    $('#endNight', el)?.addEventListener('click', endNight);

    this.paintDrop();
    this.paintLib(true);
    this.paintWinners(true);
  },

  /** Il gioco consigliato per i presenti, in una riga. */
  bestHTML(fit) {
    if (!fit.length || !Object.keys(S.nights || {}).length || Tips.catOff('advisor')) return '';
    const ps = activePlayers(S.players);
    const rec = recommend({ library: poolLibrary(), nights: S.nights, present: ps.map((p) => ({ key: personKey(p), name: p.name })), playedTonight: new Set([...playedTonight()].map((k) => dbKey(k))) });
    const r = boostWishes(rec.all)[0];
    if (!r) return '';
    return `<button type="button" class="best-pick" data-lib="${esc(r.id)}"><span>${tr('tv.idle.best', { name: esc(r.item.name), score: String(r.score) })}</span><small>${esc(r.reasons.slice(0, 2).join(' · '))}</small></button>`;
  },

  /** Pulsanti "Chi ha vinto?": i giocatori presenti, si possono scegliere in più. */
  paintWinners(force = false) {
    const box = $('#winAvs');
    if (!box) return;
    const ps = activePlayers(S.players);
    const chosen = new Set((S.draft.winners || []).filter((uid) => ps.some((p) => p.uid === uid)));
    const specs = new Set(S.draft.spectators || []);
    const sig = JSON.stringify([ps.map((p) => [p.uid, p.name, p.style, p.seed, p.color]), [...chosen], [...specs]]);
    if (!force && sig === this.winSig) return;
    this.winSig = sig;
    box.innerHTML = ps.map((p) => {
      const state = chosen.has(p.uid) ? 'winner' : specs.has(p.uid) ? 'spectator' : 'player';
      const label = tr(`tv.idle.state.${state}`);
      return `
      <button type="button" class="win-av win-av--${state}" data-win="${esc(p.uid)}" aria-pressed="${state === 'winner'}" title="${esc(p.name)}: ${label}">
        ${state === 'winner' ? ICONS.crown : ''}${avatarHTML(p, '2.2rem')}<span>${esc(p.name)}</span>
        <small class="win-state">${label}</small>
      </button>`;
    }).join('');
  },

  /** Riga "Dall’armadio": i giochi non ancora giocati stasera, da toccare, e i modi per scegliere il prossimo. */
  paintLib(force = false) {
    const box = $('#libPick');
    if (!box) return;
    const card = box.closest('.next-card');
    if (!hasLib()) { box.hidden = true; return; }
    const items = libraryItems();
    const played = playedTonight();
    const table = onTable();
    const w = wishes();
    const pool = poolIds();
    const nTable = Object.keys(table).length;
    const lf = this.libFilter || 'all';
    const lsort = this.libSort || 'reco';
    const q = nameKey(this.libQ || '');
    const sig = JSON.stringify([items.map((i) => [i.id, i.name, (i.image || '').length, i.minPlayers, i.maxPlayers, i.status, i.loanTo, isSel(i), i.duration]), [...played], S.draft.libraryId, activePlayers(S.players).length, Object.keys(table), w, S.plan, S.poolAll, armadioName(), lf, lsort, q, Object.keys(S.nights || {}).length]);
    if (!force && sig === this.libSig) return;
    this.libSig = sig;
    const n = activePlayers(S.players).length;
    const inPool = (it) => !pool || pool.has(it.id);
    // 2.0: ricerca, filtri e ordinamento (quanti siete, tempo, mai giocati, i più amati) senza scorrere tutto
    const at = buildAllTime(S.nights, S.library);
    const rating = new Map(at.games.map((g) => [g.key, g]));
    const seen = lastPlayed(S.nights);
    const rOf = (it) => rating.get(dbKey(it.name));
    const pass = (it) => {
      if (q && !nameKey(it.name).includes(q) && !tagsOf(it).some((x) => nameKey(x).includes(q))) return false;
      const d = durationOf(it) || 0;
      if (lf === 'short') return d > 0 && d <= 30;
      if (lf === 'long') return d >= 60;
      if (lf === 'never') return !(dbKey(it.name) in seen);
      if (lf === 'loved') return (rOf(it)?.avg || 0) >= 7.5 && (rOf(it)?.n || 0) >= 3;
      if (lf === 'table') return Boolean(table[it.id]);
      return true;
    };
    const fresh = items.filter((it) => !played.has(nameKey(it.name)) && pass(it));
    const fit = fresh.filter((it) => libOk(it, n) && inPool(it));
    const rest = fresh.filter((it) => !fit.includes(it));
    card.classList.toggle('has-lib', items.length > 0);
    if (!items.length) {
      box.innerHTML = `<p class="lib-hint">${ICONS.books}<span>${tr('tv.idle.libEmpty', { btn: `<button type="button" class="inline-link" id="openLib">${tr('tv.idle.libEmptyBtn')}</button>` })}</span></p>`;
      return;
    }
    const onT = (it) => (table[it.id] ? 1 : 0);
    const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'it');
    const byTable = {
      reco: (a, b) => onT(b) - onT(a) || (w[b.id] || 0) - (w[a.id] || 0) || byName(a, b),
      name: byName,
      time: (a, b) => (durationOf(a) || 999) - (durationOf(b) || 999) || byName(a, b),
      rating: (a, b) => (rOf(b)?.avg || 0) - (rOf(a)?.avg || 0) || byName(a, b),
      dusty: (a, b) => (seen[dbKey(a.name)] ?? 9999) < (seen[dbKey(b.name)] ?? 9999) ? 1 : (seen[dbKey(a.name)] ?? 9999) > (seen[dbKey(b.name)] ?? 9999) ? -1 : byName(a, b)
    }[lsort] || ((a, b) => byName(a, b));
    const chip = (it) => {
      const isPlayed = played.has(nameKey(it.name));
      const isUnfit = !isPlayed && (!libOk(it, n) || !inPool(it));
      const tip = isPlayed ? tr('tv.idle.tipPlayed') : !isAvailable(it) ? awayLabel(it) : !libOk(it, n) ? tr('tv.idle.tipUnfit', { n: String(n), info: libInfo(it) }) : !inPool(it) ? tr('tv.idle.tipPool') : libInfo(it);
      const r = rOf(it);
      const meta = [it.minPlayers || it.maxPlayers ? `👥 ${it.minPlayers || '?'}–${it.maxPlayers || '?'}` : '', durationOf(it) ? `⏱ ${durationOf(it)}′` : '', r && r.n >= 2 ? `★ ${fmt(r.avg)}` : ''].filter(Boolean).join(' · ');
      return `
      <span class="lib-chip-wrap"><button type="button" class="lib-chip ${isPlayed ? 'is-played' : ''} ${isUnfit ? 'is-unfit' : ''}" data-lib="${esc(it.id)}" aria-pressed="${S.draft.libraryId === it.id}" ${tip ? `title="${esc(tip)}"` : ''}>
        ${gameImageHTML(it, 'game-img--chip')}<span class="lib-chip-txt"><span>${table[it.id] ? '⭐ ' : ''}${esc(it.name)}${w[it.id] ? ` <em class="wish-n">♥${w[it.id]}</em>` : ''}</span>${meta ? `<small class="lib-meta">${esc(meta)}</small>` : ''}</span>
        ${S.draft.libraryId === it.id ? `<span class="lib-check" aria-hidden="true">✓</span>` : ''}
      </button><button type="button" class="lib-info" data-libinfo="${esc(it.id)}" aria-label="${esc(tr('lib2.details', { name: it.name }))}" title="${esc(tr('lib2.details', { name: it.name }))}">i</button></span>`;
    };
    const playedItems = items.filter((it) => played.has(nameKey(it.name)));
    box.innerHTML = `
      <div class="lib-pick-head">
        <span class="field-label">${tr('tv.idle.pickNext')} <span class="muted">${tr('tv.idle.pickInfo', { n: fit.length, arm: esc(armadioName()) })}</span></span>
        ${nTable >= 2 ? `<span class="pool-switch" role="group" aria-label="${tr('tv.idle.poolAria')}">
          <button type="button" class="pool-opt" data-pool="tonight" aria-pressed="${!S.poolAll}">${tr('tv.idle.poolTonight', { n: String(nTable) })}</button>
          <button type="button" class="pool-opt" data-pool="all" aria-pressed="${Boolean(S.poolAll)}">${tr('tv.idle.poolAll')}</button></span>` : ''}
      </div>
      <div class="pick-modes">
        <button type="button" class="pick-mode" id="pickRandom" ${fit.length >= 2 ? '' : 'disabled'} title="${tr('tv.idle.randomTitle')}">🎲<b>${tr('tv.idle.random')}</b></button>
        <button type="button" class="pick-mode" id="openWheel" ${fit.length >= 2 ? '' : 'disabled'} title="${tr('tv.idle.wheelTitle')}">🎡<b>${tr('tv.idle.wheel')}</b></button>
        <button type="button" class="pick-mode" id="startPoll" ${fit.length >= 2 ? '' : 'disabled'} title="${tr('tv.idle.pollTitle')}">📱<b>${tr('tv.idle.poll')}</b></button>
        <button type="button" class="pick-mode" id="openReco" title="${tr('tv.idle.recoTitle')}">💡<b>${tr('tv.idle.reco')}</b></button>
        <button type="button" class="pick-mode" id="openLib" title="${tr('tv.idle.libTitle')}">📦<b>${tr('tv.armadio')}</b></button>
      </div>
      ${planNextHTML()}
      ${this.bestHTML(fit)}
      <div class="lib-tools" role="search">
        <label class="sr-only" for="libSearch">${esc(tr('lib2.search'))}</label>
        <input class="input input--sm lib-search" id="libSearch" type="search" placeholder="${esc(tr('lib2.searchPh'))}" value="${esc(this.libQ || '')}" autocomplete="off">
        <div class="lib-filters" role="group" aria-label="${esc(tr('lib2.filters'))}">${['all', 'table', 'short', 'long', 'never', 'loved'].filter((k) => k !== 'table' || nTable).map((k) => `<button type="button" class="pool-opt" data-libf="${k}" aria-pressed="${lf === k}">${esc(tr(`lib2.f.${k}`))}</button>`).join('')}</div>
        <label class="sr-only" for="libSortSel">${esc(tr('lib2.sort'))}</label>
        <select class="input select select--sm" id="libSortSel">${['reco', 'name', 'time', 'rating', 'dusty'].map((k) => `<option value="${k}" ${lsort === k ? 'selected' : ''}>${esc(tr(`lib2.s.${k}`))}</option>`).join('')}</select>
      </div>
      <p class="muted small lib-count">${esc(tr('lib2.count', { fit: fit.length, n: String(n), all: items.length }))}</p>
      <div class="lib-chips">${[...fit.sort(byTable), ...rest.sort(byTable)].map(chip).join('') || `<p class="muted small">${esc(tr('lib2.noMatch'))}</p>`}</div>
      ${playedItems.length ? `<details class="lib-played"><summary>${tr('tv.idle.playedList', { n: String(playedItems.length) })}</summary><div class="lib-chips">${playedItems.map(chip).join('')}</div></details>` : ''}`;
  },

  /** Tra i giochi adatti e non ancora giocati, sceglie la TV: i nomi lampeggiano e poi si ferma. */
  async randomPick() {
    if (this.rolling) return;
    const n = activePlayers(S.players).length;
    const played = playedTonight();
    const pool = poolIds();
    const list = libraryItems().filter((it) => !played.has(nameKey(it.name)) && libOk(it, n) && (!pool || pool.has(it.id)));
    if (list.length < 2) { toast(tr('tv.idle.randomNeed'), 'warn'); return; }
    this.rolling = true;
    const pick = list[Math.floor(Math.random() * list.length)];
    const chips = () => [...document.querySelectorAll('#libPick .lib-chips .lib-chip')].filter((c) => list.some((it) => it.id === c.dataset.lib));
    const steps = prefersReducedMotion() ? 1 : 16;
    drumroll(1.4);
    for (let i = 0; i < steps; i++) {
      const cs = chips();
      cs.forEach((c) => c.classList.remove('is-rolling'));
      const c = i === steps - 1 ? cs.find((x) => x.dataset.lib === pick.id) : cs[Math.floor(Math.random() * cs.length)];
      c?.classList.add('is-rolling');
      await new Promise((r) => setTimeout(r, 60 + i * i * 1.6));
    }
    chips().forEach((c) => c.classList.remove('is-rolling'));
    this.rolling = false;
    this.pickLib(pick.id);
    ding();
    toast(tr('tv.idle.randomDone', { name: pick.name }));
  },

  /** Mette nel modulo un gioco dell'armadio. */
  pickLib(id) {
    const it = S.library?.[id];
    if (!it) return;
    S.draft = { ...S.draft, name: it.name, image: it.image || it.thumb || null, libraryId: id, quick: Boolean(it.quick) };
    upgradeDraftImage(id);
    $('#gameName').value = it.name;
    $('#quickChk').checked = S.draft.quick;
    saveDraft();
    this.mode = 'drop';
    this.error('');
    this.paintDrop();
    this.paintLib(true);
  },

  /** Timer della partita in corso (dopo "Inizia la partita"). */
  paintTimer() {
    const t = $('#playTimer');
    const start = Number(S.state?.playStart) || 0;
    const btn = $('#startPlayTxt');
    if (btn) btn.textContent = start ? tr('tv.idle.restart') : tr('tv.tour.i4.t');
    // Una sola azione principale: prima della partita "Inizia la partita", durante "Apri la votazione"
    const sp = $('#startPlay');
    const ov = $('#openVote');
    if (sp && ov && this.ctaPlaying !== Boolean(start)) {
      this.ctaPlaying = Boolean(start);
      sp.className = start ? 'btn-sec btn-sec--sm ng-second' : 'btn ng-primary';
      ov.className = start ? 'btn ng-primary' : 'btn-sec ng-second';
      $('#nextForm')?.classList.toggle('is-playing', Boolean(start));
    }
    if (!t) return;
    t.hidden = !start;
    const nb = Object.keys((S.state?.playId && S.bets?.[S.state.playId]) || {}).length;
    const betLeft = start ? start + 5 * 60000 - serverNow() : 0;
    const betTxt = betLeft > 0 ? `${tr('tv.idle.betsOpen', { time: clockText(betLeft) })}${nb ? ` · ${nb}` : ''}` : nb ? tr('tv.idle.betsClosed', { n: nb }) : '';
    if (start) t.innerHTML = `${ICONS.clock}<span>${tr('tv.idle.playing', { name: esc(S.state.playName || tr('tv.idle.match')), time: clockText(playElapsed()) })}</span>${betTxt ? `<span class="bet-count">${betTxt}</span>` : ''}`;
    // Segnapunti dal vivo e "sfida nella sfida" tra i giocatori della partita
    const box = $('#liveBox');
    if (box) {
      const rv = start ? rivalryLine(Object.keys(S.state.playPlayers || {}).length ? Object.keys(S.state.playPlayers) : activePlayers(S.players).map((p) => p.uid)) : '';
      const html = start ? `${liveScoresHTML()}${rv ? `<p class="rival-line">${esc(rv)}</p>` : ''}` : '';
      if (html !== this.liveSig) { this.liveSig = html; box.innerHTML = html; }
    }
  },

  update() {
    this.paintTimer();
    this.paintLib();
    this.paintWinners();
    paintHouseNote();
    const p = S.pendingImage;
    if (p && isImageSource(p.data) && /^data:image\//.test(p.data)) {
      S.draft.image = p.data;
      this.mode = 'drop';
      this.paintDrop();
      toast(tr('tv.idle.photoIn'));
      remove(roomRef(S.code, 'pendingImage')).catch(() => {});
    }
  },

  unmount() {
    clearInterval(this.tick);
    document.removeEventListener('paste', this.onPaste);
  },

  error(msg) {
    const e = $('#nextErr');
    if (e) e.textContent = msg;
  },

  async useFile(file) {
    this.error('');
    try {
      S.draft.image = await gameImage(file);
      this.mode = 'drop';
      this.paintDrop();
    } catch (err) {
      this.error(err.message);
    }
  },

  paintDrop() {
    const dz = $('#dropzone');
    if (!dz) return;
    saveDraft();
    const phoneBtn = $('#fromPhone');
    phoneBtn?.setAttribute('aria-pressed', String(this.mode === 'phone'));
    dz.classList.toggle('has-img', Boolean(S.draft.image) && this.mode === 'drop');
    dz.classList.toggle('is-phone', this.mode === 'phone');
    if (this.mode === 'phone') {
      dz.innerHTML = `<div class="phone-drop"><div class="qr qr--sm" id="photoQr"></div><p>${tr('tv.idle.phoneDrop')}</p></div>`;
      renderQR($('#photoQr'), playUrl({ foto: '1' }));
    } else if (S.draft.image) {
      dz.innerHTML = `<img class="drop-bg" src="${esc(S.draft.image)}" alt=""><img class="drop-fg" src="${esc(S.draft.image)}" alt="${tr('tv.idle.preview')}"><button type="button" class="drop-clear" id="clearImg" aria-label="${tr('tv.idle.clearImg')}">${ICONS.x}</button>`;
    } else {
      dz.innerHTML = `<div class="drop-hint">${ICONS.image}<span>${tr('tv.idle.dropHint')}</span></div>`;
    }
  },

  async openVoting() {
    const name = cleanName($('#gameName').value);
    if (!name) {
      this.error(tr('tv.lib.needName'));
      $('#gameName').focus();
      return;
    }
    const btn = $('#openVote');
    btn.disabled = true;
    try {
      await openVotingWith({ ...S.draft, name });
    } catch (err) {
      this.error(explainError(err));
      btn.disabled = false;
    }
  }
};

export const BoardScreen = {
  mount(el) {
    this.render(el);
  },

  render(el) {
    const board = buildBoard(S.games, S.votes);
    this.sig = board.map((r) => r.id + r.stats.n).join('|');
    const two = board.length > 6;
    const rows = board.map((r, i) => `
      <li class="brow brow--r${Math.min(r.rank, 4)}" style="--i:${i}">
        <span class="brank">${r.rank}</span>
        ${gameImageHTML(r, 'game-img--thumb')}
        <span class="bname">
          <b>${esc(r.name)}</b>
          <span class="bbar" aria-hidden="true"><i style="width:${Math.max(4, r.stats.avg * 10)}%"></i></span>
        </span>
        <span class="bcrit">${CRITERIA.map((c) => `<span class="bcrit-item" style="--cc:${c.color}" title="${c.label}">${c.short} ${fmt(r.stats.crit[c.key])}</span>`).join('')}</span>
        <span class="bavg">${fmt(r.stats.avg)}</span>
        <span class="brow-tools">
          <button type="button" class="brow-reopen" data-edit-game="${esc(r.id)}" title="${tr('tv.bd.editTitle', { name: esc(r.name) })}">${tr('tv.bd.edit')}</button>
          <button type="button" class="brow-reopen" data-reopen="${esc(r.id)}" title="${tr('tv.bd.reopenTitle', { name: esc(r.name) })}">${tr('tv.bd.reopen')}</button>
          <button type="button" class="brow-reopen" data-late="${esc(r.id)}" title="${esc(tr('lv.btnTitle'))}">🗳️</button>
        </span>
      </li>`).join('');

    el.innerHTML = `
      <section class="board">
        <div class="board-head">
          <h1>${tr('tv.ic.board')}</h1>
          <span class="muted">${tr('tv.rec.games', { n: board.length })}</span>
        </div>
        ${board.length
          ? `<ol class="board-list ${two ? 'board-list--two' : ''}" style="--rows:${Math.ceil(board.length / 2)}">${rows}</ol>`
          : `<div class="empty-board"><p class="empty-title">${tr('tv.idle.emptyTitle')}</p></div>`}
        ${teamBoardHTML()}
        <div class="board-actions">
          ${S.meta.groupId ? `<button type="button" class="btn-sec" id="showAllTime">${ICONS.star}<span>${tr('tv.idle.allTime')}</span></button>` : ''}
          ${board.length ? `<button type="button" class="btn-sec" id="endNight">${tr('tv.end.end')}</button>` : ''}
          <button type="button" class="btn btn-big" id="nextGame">${tr('tv.rv.next')}</button>
        </div>
      </section>`;
    $('#endNight', el)?.addEventListener('click', endNight);
    $('#showAllTime', el)?.addEventListener('click', () => openAllTime());
    $('#nextGame', el).addEventListener('click', () => goNext());
    el.querySelector('.board-list')?.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit-game]');
      if (ed) { EditGame.open(ed.dataset.editGame); return; }
      const lv = e.target.closest('[data-late]');
      if (lv) { LateVotePanel.open(lv.dataset.late); return; }
      const b = e.target.closest('[data-reopen]');
      const g = b && S.games[b.dataset.reopen];
      if (g && confirm(tr('tv.rv.reopenConfirm', { name: g.name }))) reopenVoting(b.dataset.reopen).catch((err) => toast(explainError(err), 'error'));
    });
  }
};

export const AwardsScreen = {
  mount(el) {
    this.el = el;
    this.board = buildBoard(S.games, S.votes);
    this.awards = buildAwards(this.board, S.votes, S.players);
    this.gameAwards = this.awards.filter((a) => a.kind === 'game');
    this.playerAwards = this.awards.filter((a) => a.kind === 'player');
    // Traguardi sbloccati con questa serata (calcolati con il riassunto di stasera)
    const nightsNow = { ...(S.nights || {}), [S.code]: nightSummary(this.board, S.players, S.meta, this.awards, { library: S.library, custom: S.customAwards }) };
    this.achAwards = [];
    if (S.meta.groupId) {
      for (const p of sortedPlayers(S.players)) {
        for (const a of newAchievements(nightsNow, personKey(p), S.code, S.library)) {
          this.achAwards.push({ key: 'ach', kind: 'ach', title: `${a.icon} ${a.name}`, players: [{ uid: p.uid, ...p }], value: a.desc, color: '#8AC926' });
        }
      }
    }
    this.awards = [...this.awards, ...this.achAwards.slice(0, 8)];
    // Premi del gruppo assegnati a mano dalla regia (1.12, idea 23): dopo tutti gli altri
    this.caSig = JSON.stringify(S.customAwards || {});
    this.customAwards = customAwardList(S.customAwards).map((a) => ({ key: 'custom', kind: 'custom', title: `${a.e || '🎖️'} ${a.t}`, players: [{ uid: a.uid, ...playerOrGhost(a.uid) }], value: tr('mem.ca.value'), color: '#FF8FB1' }));
    this.awards = [...this.awards, ...this.customAwards];
    const podium = this.board.slice(0, 3);
    // Campioni della serata: i giocatori che salgono sul podio (vittorie, voti MVP, pronostici, medie indovinate).
    this.champs = nightChampions(this.board).filter((c) => c.rank <= 3).slice(0, 3);
    // Classifica della stagione (gruppi): chi sale grazie a stasera
    this.seasonHTML = S.meta.groupId && !S.meta.demo ? seasonStageHTML() : '';
    // Prima il podio dei giochi dal terzo al primo, poi i campioni, poi i premi speciali uno alla volta.
    this.steps = [
      ...podium.map((_, i) => ({ type: 'pod', index: i })).reverse(),
      ...(this.champs.length ? [{ type: 'pstage' }, ...this.champs.map((_, i) => ({ type: 'ppod', index: i })).reverse()] : []),
      ...(this.seasonHTML ? [{ type: 'sstage' }] : []),
      ...(this.awards.length ? [{ type: 'stage' }] : []),
      ...this.awards.map((_, i) => ({ type: 'award', index: i }))
    ];
    this.step = 0;

    if (!this.board.length) {
      el.innerHTML = `
        <section class="awards awards--empty">
          <h1>${tr('tv.aw.title')}</h1>
          <div class="empty-board"><p class="empty-title">${tr('tv.aw.emptyTitle')}</p><p class="muted">${tr('tv.aw.emptyText')}</p></div>
          <div class="awards-actions"><button type="button" class="btn btn-big" id="backIdle">${tr('tv.aw.back')}</button></div>
        </section>`;
      $('#backIdle', el).addEventListener('click', () => setPhase('idle'));
      return;
    }

    const podCol = (i) => {
      const r = podium[i];
      if (!r) return '<div class="pod pod--none" aria-hidden="true"></div>';
      return `
        <div class="pod pod--${i + 1}">
          <div class="pod-card is-hidden" data-pod="${i}">
            ${gameImageHTML(r, 'game-img--pod')}
            <b class="pod-name">${esc(r.name)}</b>
            <span class="pod-avg">${fmt(r.stats.avg)}</span>
          </div>
          <div class="pod-base"><span>${r.rank}</span></div>
        </div>`;
    };

    const medals = ['🏆', '🥈', '🥉'];
    const champCol = (i) => {
      const c = this.champs[i];
      if (!c) return '<div class="champ champ--none" aria-hidden="true"></div>';
      const p = playerOrGhost(c.uid);
      const bits = [c.wins ? tr('tv.aw.wins', { n: c.wins }) : '', c.mvp ? `${c.mvp} MVP` : '', c.seer ? tr('tv.aw.seer', { n: c.seer }) : '', c.oracle ? tr('tv.aw.oracle', { n: c.oracle }) : ''].filter(Boolean);
      return `
        <div class="champ champ--${i + 1}" style="--pc:${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#FFC93C'}">
          <div class="champ-who is-hidden" data-champ="${i}">
            <span class="champ-trophy" aria-hidden="true">${medals[c.rank - 1] || '🏅'}</span>
            <span class="champ-av">${avatarHTML(p, i === 0 ? '8.4rem' : '6.6rem')}</span>
            <b class="champ-name">${esc(p.name)}</b>
            <span class="champ-pts">${tr('tv.aw.points', { n: c.points })}</span>
            <small class="champ-why">${esc(bits.join(' · '))}</small>
          </div>
          <div class="champ-base champ-base--r${Math.min(c.rank, 3)}"><span>${c.rank}</span></div>
        </div>`;
    };

    const awardCard = (a) => {
      const i = this.awards.indexOf(a);
      const body = a.game
        ? `${gameImageHTML(a.game, 'game-img--award')}<b class="award-name">${esc(a.game.name)}</b>`
        : `<div class="award-people">${a.players.slice(0, 3).map((p) => `<span class="${a.key === 'mvp' ? 'crowned' : 'person'}">${a.key === 'mvp' ? ICONS.crown : ''}${avatarHTML(p, '4.2rem')}</span>`).join('')}</div><b class="award-name">${esc(namesList(a.players.map((p) => p.name)))}</b>`;
      return `
        <article class="award" data-award="${i}" style="--ac:${a.color}">
          <div class="award-inner">
            <div class="award-back">${ICONS.trophy}</div>
            <div class="award-front">
              <h3>${esc(a.title)}</h3>
              ${body}
              <span class="award-value">${esc(a.value)}</span>
            </div>
          </div>
        </article>`;
    };
    const row = (title, list) => list.length ? `
      <div class="prize-row">
        <h2 class="prize-title">${title}</h2>
        <div class="award-grid" style="--n:${list.length}">${list.map(awardCard).join('')}</div>
      </div>` : '';

    el.innerHTML = `
      <section class="awards stage-podium" id="awSec">
        <div class="awards-head">
          <div class="awards-title"><h1 id="awTitle">${tr('tv.aw.title')}</h1><div id="awStages"></div></div>
          <div class="awards-actions" id="awardsActions"></div>
        </div>
        <div class="podium">${[1, 0, 2].map(podCol).join('')}</div>
        ${this.champs.length ? `<div class="champions" id="awChamps">${[1, 0, 2].map(champCol).join('')}</div>
        <p class="champ-rule">${tr('tv.aw.rule')}</p>` : ''}
        ${this.seasonHTML ? `<div class="season-wrap">${this.seasonHTML}</div>` : ''}
        <div class="prizes ${this.achAwards.length ? 'prizes--dense' : ''}">
          ${row(tr('tv.aw.toGames'), this.gameAwards)}
          ${row(tr('tv.aw.toPlayers'), this.playerAwards)}
          ${row(tr('tv.aw.ach'), this.achAwards.slice(0, 8))}
          ${row(tr('mem.ca.row'), this.customAwards)}
        </div>
      </section>`;
    this.stage = 'podium';

    // Si riprende dal punto raggiunto (es. dopo aver ricaricato la pagina), o tutto scoperto se era finita.
    const target = S.state?.done ? this.steps.length : Math.min(Number(S.state?.step) || 0, this.steps.length);
    if (!target) endNightSound();
    while (this.step < target) this.next(true);
    this.paintActions();
  },

  setStage(stage) {
    const sec = $('#awSec', this.el);
    sec.classList.toggle('stage-podium', stage === 'podium');
    sec.classList.toggle('stage-players', stage === 'players');
    sec.classList.toggle('stage-season', stage === 'season');
    sec.classList.toggle('stage-prizes', stage === 'prizes');
    $('#awTitle', this.el).textContent = stage === 'prizes' ? tr('tv.aw.prizes') : stage === 'players' ? tr('tv.aw.champs') : stage === 'season' ? tr('tv.aw.season') : tr('tv.aw.title');
    this.stage = stage;
  },

  paintActions() {
    const box = $('#awardsActions', this.el);
    if (!box) return;
    const stagesBox = $('#awStages', this.el);
    if (stagesBox) stagesBox.innerHTML = '';
    if (this.step < this.steps.length) {
      const nextStep = this.steps[this.step];
      const label = this.step === 0 ? tr('tv.aw.podium') : nextStep.type === 'stage' ? tr('tv.aw.prizes') : nextStep.type === 'pstage' ? tr('tv.aw.champs') : nextStep.type === 'sstage' ? tr('tv.aw.seasonBoard') : tr('tv.aw.next');
      box.innerHTML = `<span class="muted key-hint">${tr('tv.aw.space')}</span><button type="button" class="btn btn-big" id="stepBtn">${label}</button>`;
      $('#stepBtn', box).addEventListener('click', () => this.next());
      $('#stepBtn', box).focus();
      return;
    }
    const stages = [['podium', tr('tv.aw.stPodium')], ...(this.champs.length ? [['players', tr('tv.aw.stChamps')]] : []), ...(this.seasonHTML ? [['season', tr('tv.aw.season')]] : []), ...(this.awards.length ? [['prizes', tr('tv.aw.prizes')]] : [])];
    if (stagesBox && stages.length > 1) stagesBox.innerHTML = `<div class="seg seg--stage" role="group" aria-label="${tr('tv.aw.stAria')}">${stages.map(([k, l]) => `<button type="button" data-stage="${k}" aria-pressed="${this.stage === k}">${l}</button>`).join('')}</div>`;
    box.innerHTML = `
      <button type="button" class="btn-sec" id="shareImg">${ICONS.share}<span>${tr('tv.aw.share')}</span></button>
      <button type="button" class="btn-sec" id="recapBtn" title="${tr('tv.aw.recapTitle')}">🎙️ <span>${tr('tv.aw.recap')}</span></button>
      <a class="btn-sec" id="reportLink" href="resoconto.html?room=${esc(S.code)}${S.meta.groupId ? `&g=${esc(S.meta.groupId)}` : ''}&s=regia" target="_blank" rel="noopener" title="${tr('tv.aw.reportTitle')}">📋 <span>${tr('tv.aw.report')}</span></a>
      ${S.meta.groupId ? `<button type="button" class="btn-sec" id="openAlbum">📸 <span>Album${photoList(S.photos).length ? ` (${photoList(S.photos).length})` : ''}</span></button>` : ''}
      ${S.meta.groupId ? `<button type="button" class="btn-sec" id="toAllTime">${ICONS.star}<span>${tr('tv.aw.allTime')}</span></button>` : ''}
      <button type="button" class="btn-sec" id="customAward">🎖️ <span>${tr('mem.ca.btn')}</span></button>
      <button type="button" class="btn" id="newNight2">${tr('tv.create.title')}</button>`;
    stagesBox?.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { this.setStage(b.dataset.stage); this.paintActions(); }));
    $('#shareImg', box).addEventListener('click', () => ExportPanel.open(this.board, this.awards));
    $('#recapBtn', box).addEventListener('click', () => {
      const mode = commentatorMode() === 'off' ? 'festa' : commentatorMode();
      if (isMuted()) toast(tr('tv.aw.muted'), 'warn');
      speak(nightRecap(recapData(this.board, this.awards), mode), { captions: true });
    });
    $('#openAlbum', box)?.addEventListener('click', () => AlbumPanel.open());
    $('#toAllTime', box)?.addEventListener('click', () => openAllTime());
    $('#customAward', box).addEventListener('click', () => CustomAwardPanel.open());
    $('#newNight2', box).addEventListener('click', newNight);
  },

  /** Un premio del gruppo aggiunto o tolto: la premiazione si ridisegna (già tutta scoperta se era finita). */
  update() {
    if (!this.el || !this.board?.length) return;
    const sig = JSON.stringify(S.customAwards || {});
    if (sig === this.caSig) return;
    this.mount(this.el);
    if (this.step >= this.steps.length && this.customAwards.length) {
      this.setStage('prizes');
      this.el.querySelector('.prizes .prize-row:last-child')?.scrollIntoView?.({ block: 'nearest' });
    }
    this.paintActions();
  },

  next(silent = false) {
    const s = this.steps[this.step];
    if (!s) return;
    if (s.type === 'pod') {
      if (this.stage !== 'podium') this.setStage('podium');
      $(`[data-pod="${s.index}"]`, this.el)?.classList.remove('is-hidden');
      if (s.index === 0 && !silent) {
        confetti(140);
        if (!this.champs.length) { fireworks(6); [0.9, 1.4, 1.9, 2.5].forEach((d) => fireworkSound(d)); }
        fanfare();
        const mode = commentatorMode();
        if (mode !== 'off' && !isMuted()) setTimeout(() => speak(podiumLine(this.board[0].name, this.board[0].stats.avg, mode)), 900);
      } else if (!silent) pop();
    } else if (s.type === 'pstage') {
      this.setStage('players');
      if (!silent) drumroll(1.2);
    } else if (s.type === 'ppod') {
      if (this.stage !== 'players') this.setStage('players');
      const who = $(`[data-champ="${s.index}"]`, this.el);
      who?.classList.remove('is-hidden');
      if (!silent) {
        who?.classList.add('is-climbing');
        stepUp(0.29, 1); stepUp(0.6, 2); stepUp(0.94, 3);
        if (s.index === 0) {
          fanfare(0.9);
          victory(1.6);
          setTimeout(() => {
            const r = who?.getBoundingClientRect();
            if (r) confettiBurst(160, { x: r.left + r.width / 2, y: r.top + r.height * 0.3 });
            fireworks(8, 3.2);
          }, 950);
          [1.8, 2.3, 2.9, 3.4, 4].forEach((d) => fireworkSound(d));
          const mode = commentatorMode();
          if (mode !== 'off' && !isMuted()) setTimeout(() => speak(tr('tv.aw.champSpeak', { name: playerOrGhost(this.champs[0].uid).name, n: this.champs[0].points })), 2600);
        } else pop(0.95);
      }
    } else if (s.type === 'sstage') {
      this.setStage('season');
      if (!silent) ding();
    } else if (s.type === 'stage') {
      this.setStage('prizes');
    } else {
      $(`[data-award="${s.index}"]`, this.el)?.classList.add('is-shown');
      if (!silent) pop();
    }
    this.step++;
    if (silent) return;
    this.paintActions();
    update(roomRef(S.code, 'state'), this.step >= this.steps.length ? { step: this.step, done: true } : { step: this.step }).catch(() => {});
  },

  onKey(e) {
    // Su un pulsante con il focus ci pensa già il click nativo.
    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
      if (this.step < this.steps.length) {
        e.preventDefault();
        this.next();
      }
    }
  }
};

export const PollScreen = {
  mount(el) {
    this.sig = '';
    this.timer = null;
    this.shown = false;
    const n = asList(S.poll?.options).length;
    const cols = n <= 4 ? n : n <= 6 ? 3 : 4;
    el.innerHTML = `
      <section class="poll" id="pollBox">
        <div class="poll-head">
          <div>
            <h1>${tr('tv.po.title')}</h1>
            <p class="lead-line" id="pollLead">${tr('tv.po.lead')}</p>
            <div class="poll-max" id="pollMax"></div>
            <p class="muted poll-excluded" id="pollExcluded"></p>
          </div>
          <span class="chip chip-lg" id="pollCount" aria-live="polite"></span>
        </div>
        <div class="poll-grid ${n > 8 ? 'poll-grid--dense' : ''}" id="pollGrid" style="--cols:${cols}"></div>
        <div class="poll-actions">
          <button type="button" class="btn-sec" id="pollCancel">${tr('tv.cancel')}</button>
          <button type="button" class="btn btn-big" id="pollClose">${tr('tv.po.close')}</button>
        </div>
      </section>
      <section class="poll-win" id="pollWin" hidden></section>`;
    $('#pollCancel', el).addEventListener('click', async () => {
      clearTimeout(this.timer);
      await setPhase('idle');
      remove(roomRef(S.code, 'poll')).catch(() => {});
    });
    $('#pollClose', el).addEventListener('click', () => this.close());
    $('#pollMax', el).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pmax]');
      if (!b || b.disabled) return;
      const v = Number(b.dataset.pmax);
      try { localStorage.setItem('gnr_poll_max', String(v)); } catch { /* niente */ }
      await update(roomRef(S.code, 'poll'), { max: v }).catch((err) => toast(explainError(err), 'error'));
    });
  },

  update() {
    const poll = S.poll;
    if (!poll) return;
    if (!poll.open) { this.showWinner(); return; }
    const opts = asList(poll.options).filter((id) => S.library?.[id]);
    const { tally, voted, total, cast } = pollTally(poll);
    const max = Math.max(0, ...Object.values(tally));
    const pm = Math.max(1, Number(poll.max) || 1);
    const limit = Math.min(POLL_MAX_VOTES, opts.length - 1);
    const pmSig = JSON.stringify([pm, cast > 0, limit]);
    if ($('#pollMax').dataset.sig !== pmSig) {
      $('#pollMax').dataset.sig = pmSig;
      $('#pollMax').innerHTML = limit >= 2 ? `<span class="field-label">${tr('tv.po.perHead')}</span><span class="seg" role="group" aria-label="${tr('tv.po.perHead')}">${Array.from({ length: limit }, (_, i) => i + 1).map((v) => `<button type="button" data-pmax="${v}" aria-pressed="${pm === v}" ${cast > 0 && pm !== v ? 'disabled' : ''}>${v}</button>`).join('')}</span>${cast > 0 ? `<small class="muted">${tr('tv.po.locked')}</small>` : ''}` : '';
      $('#pollLead').textContent = pm > 1 ? tr('tv.po.leadMulti', { n: String(pm) }) : tr('tv.po.lead');
    }
    const sig = JSON.stringify([opts, tally, opts.map((id) => (S.library[id].image || '').length)]);
    if (sig !== this.sig) {
      this.sig = sig;
      $('#pollGrid').innerHTML = opts.map((id) => {
        const it = S.library[id];
        const c = tally[id] || 0;
        return `
          <div class="poll-card ${c && c === max ? 'is-lead' : ''}">
            ${gameImageHTML(it, 'game-img--poll')}
            <div class="poll-info"><span class="poll-text"><b class="poll-name">${esc(it.name)}</b>${libInfo(it) ? `<span class="poll-meta">${esc(libInfo(it))}</span>` : ''}${freshnessLabel(it, lastPlayed(S.nights)) ? `<span class="poll-fresh">${esc(freshnessLabel(it, lastPlayed(S.nights)))}</span>` : ''}</span><span class="poll-votes" aria-label="${tr('tv.ic.nVotes', { n: String(c) })}">${c}</span></div>
            <span class="poll-bar" aria-hidden="true"><i style="width:${max ? Math.round((c / max) * 100) : 0}%"></i></span>
          </div>`;
      }).join('');
    }
    const n = activePlayers(S.players).length;
    const played = playedTonight();
    const out = libraryItems().filter((it) => !played.has(nameKey(it.name)) && isAvailable(it) && !libFits(it, n)).map((it) => it.name);
    $('#pollExcluded').textContent = out.length ? tr('tv.po.excluded', { n: String(n), list: namesList(out) }) : '';
    const all = total > 0 && voted === total;
    $('#pollCount').textContent = all ? tr('tv.po.all') : tr('tv.po.count', { n: `${voted} / ${total}` });
    $('#pollClose').disabled = voted === 0;
    if (all && !S.state?.paused) {
      if (!this.timer) this.timer = setTimeout(() => this.close(), 2000);
    } else if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  },

  async close() {
    clearTimeout(this.timer);
    this.timer = null;
    const poll = S.poll;
    if (!poll?.open) return;
    const { tally } = pollTally(poll);
    const max = Math.max(0, ...Object.values(tally));
    if (!max) return;
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    const winner = top[Math.floor(Math.random() * top.length)];
    await update(roomRef(S.code, 'poll'), { open: false, winner, tie: top.length > 1 })
      .catch((err) => toast(explainError(err), 'error'));
  },

  showWinner() {
    if (this.shown) return;
    this.shown = true;
    clearTimeout(this.timer);
    const poll = S.poll;
    const it = S.library?.[poll.winner] || { name: tr('tv.po.chosen') };
    $('#pollBox').hidden = true;
    const box = $('#pollWin');
    box.hidden = false;
    box.innerHTML = `
      <div class="poll-win-art">${gameImageHTML(it, 'game-img--win tilt-left')}</div>
      <div class="poll-win-text">
        <span class="chip chip--tomato">${poll.tie ? tr('tv.po.tie') : tr('tv.po.youChose')}</span>
        <h1 class="win-title">${tr('tv.po.winTitle', { name: esc(it.name) })}</h1>
        <p class="lead-line">${tr('tv.po.winLead')}</p>
        <button type="button" class="btn btn-big" id="pollGo">${ICONS.play}<span>${tr('tv.po.go')}</span></button>
      </div>`;
    confetti(110);
    fanfare();
    $('#pollGo').addEventListener('click', () => pollGo());
    $('#pollGo').focus();
  },

  unmount() {
    clearTimeout(this.timer);
  }
};

export const AlltimeScreen = {
  TABS: ['rank', 'season', 'rivals', 'cards', 'stats', 'insights', 'pairs', 'hof', 'memories', 'traditions', 'wrapped', 'calendar'],

  mount(el) {
    this.sig = '';
    this.view = 'rank';
    this.night = null;
    this.pair = null;
    this.year = null;
    this.slide = 0;
    el.innerHTML = '<section class="alltime" id="atBox"></section>';
    const box = $('#atBox', el);
    box.addEventListener('click', (e) => {
      const go = (patch) => { Object.assign(this, patch); this.sig = ''; this.update(); };
      if (e.target.closest('#atBack')) { backFromAllTime(); return; }
      if (this.view === 'insights' && insightsClick(e, () => go({}))) return;
      if (this.view === 'traditions' && traditionsClick(e)) return;
      const v = e.target.closest('[data-view]');
      if (v) { go({ view: v.dataset.view, slide: 0 }); return; }
      const n = e.target.closest('[data-night]');
      if (n) { go({ view: 'night', night: n.dataset.night }); return; }
      const p = e.target.closest('[data-pair]');
      if (p) { go({ pair: p.dataset.pair }); return; }
      const y = e.target.closest('[data-year]');
      if (y) { go({ year: Number(y.dataset.year), slide: 0 }); return; }
      const s = e.target.closest('[data-slide]');
      if (s) { go({ slide: this.slide + Number(s.dataset.slide) }); return; }
      const ys = e.target.closest('[data-yearshare]');
      if (ys) { this.shareYear(Number(ys.dataset.yearshare), ys); return; }
      const al = e.target.closest('[data-album]');
      if (al) { AlbumPanel.open(al.dataset.album, al.dataset.title || tr('tv.tl.album')); return; }
      if (e.target.closest('#nxIcs')) { downloadICS(S.next, S.meta.groupName || 'Game Night', libraryUrl()); return; }
      if (e.target.closest('#nxClear')) { if (confirm(tr('tv.nx.clearConfirm'))) remove(groupRef(S.meta.groupId, 'next')).catch((err) => toast(explainError(err), 'error')); }
    });
    box.addEventListener('change', (e) => { if (this.view === 'insights') insightsChange(e, () => { this.sig = ''; this.update(); }); });
    box.addEventListener('submit', async (e) => {
      if (await traditionsSubmit(e)) return;
      if (e.target.id !== 'nxForm') return;
      e.preventDefault();
      try { await saveNextNight($('#nxAt').value, $('#nxPlace').value); toast(tr('tv.nx.saved')); } catch (err) { toast(explainError(err), 'error'); }
    });
  },

  onKey(e) {
    if (this.view !== 'wrapped') return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.slide++; this.sig = ''; this.update(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.slide = Math.max(0, this.slide - 1); this.sig = ''; this.update(); }
  },

  head(title, sub = '') {
    const active = this.view === 'night' ? 'memories' : this.view;
    return `
      <div class="alltime-head">
        <div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
        <button type="button" class="btn btn-big" id="atBack">${tr('tv.aw.back')}</button>
      </div>
      <nav class="at-tabs" aria-label="${tr('tv.at.sections')}">${this.TABS.map((k) => `<button type="button" data-view="${k}" aria-pressed="${k === active}">${tr(`tv.at.tab.${k}`)}</button>`).join('')}</nav>`;
  },

  update() {
    const sig = JSON.stringify([this.view, this.night, this.pair, this.year, this.slide, Object.keys(S.nights || {}).length, JSON.stringify(S.nights || {}).length, Object.keys(S.library || {}).length, S.next, Object.keys(S.games || {}).length, S.identity, JSON.stringify(S.house || {}).length, S.groupAdmin]);
    if (sig === this.sig) return;
    this.sig = sig;
    const paint = { rank: this.paintRank, season: this.paintSeason, rivals: this.paintRivals, cards: this.paintCards, stats: this.paintStats, pairs: this.paintPairs, hof: this.paintHof, memories: this.paintMemories, night: this.paintNight, insights: this.paintInsights, traditions: this.paintTraditions, wrapped: this.paintWrapped, calendar: this.paintCalendar }[this.view] || this.paintRank;
    paint.call(this);
  },

  paintInsights() { $('#atBox').innerHTML = `${this.head(tr('tv.at.tab.insights'), tr('ins.head', { group: this.groupLabel(), n: Object.keys(S.nights || {}).length }))}${insightsHTML()}`; },
  paintTraditions() { $('#atBox').innerHTML = `${this.head(tr('tv.at.tab.traditions'), this.groupLabel())}${traditionsHTML()}`; },
  paintSeason() { $('#atBox').innerHTML = `${this.head(tr('tv.at.tab.season'), tr('tv.at.seasonSub', { group: this.groupLabel() }))}${seasonTabHTML()}`; },
  paintRivals() { $('#atBox').innerHTML = `${this.head(tr('tv.at.tab.rivals'), tr('tv.at.rivalsSub'))}${rivalsTabHTML()}`; },
  paintCards() { $('#atBox').innerHTML = `${this.head(tr('tv.at.tab.cards'), this.groupLabel())}${cardsTabHTML()}`; bindCards($('#atBox')); },

  groupLabel() {
    return `${S.identity?.emblem && !S.identity?.logo ? `${esc(S.identity.emblem)} ` : ''}${esc(S.meta.groupName || tr('tv.create.group'))}`;
  },

  paintRank() {
    const at = buildAllTime(S.nights, S.library);
    const games = at.games.slice(0, 7);
    const rows = games.map((g, i) => `
      <li class="brow brow--at brow--r${Math.min(g.rank, 4)}" style="--i:${i}">
        <span class="brank">${g.rank}</span>
        ${gameImageHTML(g, 'game-img--thumb')}
        <span class="bname"><b>${esc(g.name)}</b><span class="bsub">${tr('tv.at.votesIn', { votes: tr('tv.rv.nVotes', { n: g.n }), nights: tr('tv.at.nNights', { n: g.nights }) })} ${confBadge(g.n)}</span></span>
        <span class="bavg">${fmt(g.avg)}</span>
      </li>`).join('');
    const row = (i, name, val) => `<li class="at-row"><span class="at-pos">${i + 1}</span>${avatarHTML(playerByName(name), '2.6rem')}<span class="at-name">${esc(name)}</span><span class="at-val">${val}</span></li>`;
    const wins = at.wins.slice(0, 3).map((w, i) => row(i, w.name, tr('tv.aw.wins', { n: w.wins }))).join('');
    const mvp = at.mvp.slice(0, 3).map((m, i) => row(i, m.name, tr('tv.rv.nVotes', { n: m.votes }))).join('');
    const most = at.mostPlayed.slice(0, 3).map((g) => `<li class="at-row"><span class="at-name">${esc(g.name)}</span><span class="at-val">${tr('tv.nNights', { n: g.nights })}</span></li>`).join('');
    $('#atBox').innerHTML = `
      ${this.head(tr('tv.idle.allTime'), tr('tv.at.rankSub', { group: this.groupLabel(), nights: tr('tv.at.nNights', { n: at.nights }), games: tr('tv.rec.games', { n: at.games.length }) }))}
      ${at.games.length ? `
        <div class="alltime-body">
          <div class="alltime-main"><ol class="board-list">${rows}</ol>${at.games.length > games.length ? `<p class="muted">${tr('tv.idle.more', { n: at.games.length - games.length })}</p>` : ''}</div>
          <aside class="card alltime-side">
            <h2>${tr('tv.pl.mvpEver')}</h2>${mvp ? `<ol class="at-list">${mvp}</ol>` : `<p class="muted">${tr('tv.at.noMvp')}</p>`}
            ${wins ? `<h2>${tr('tv.at.mostWins')}</h2><ol class="at-list">${wins}</ol>` : ''}
            ${most ? `<h2>${tr('tv.at.mostPlayed')}</h2><ol class="at-list">${most}</ol>` : ''}
          </aside>
        </div>` : `<div class="empty-board"><p class="empty-title">${tr('tv.at.noNights')}</p><p class="muted">${tr('tv.at.noNightsText')}</p></div>`}`;
  },

  /** Andamento della serata e statistiche del gruppo su tutte le serate. */
  paintStats() {
    const board = buildBoard(S.games, S.votes).sort((a, b) => (a.order || 0) - (b.order || 0));
    const W = 560, H = 210, P = 34;
    const pts = board.map((r, i) => ({ x: board.length > 1 ? P + (i * (W - 2 * P)) / (board.length - 1) : W / 2, y: H - P - ((r.stats.avg - 1) / 9) * (H - 2 * P), r }));
    const chart = board.length ? `
      <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('tv.at.trendAria')}">
        ${[2, 4, 6, 8, 10].map((v) => { const y = H - P - ((v - 1) / 9) * (H - 2 * P); return `<line x1="${P}" x2="${W - P}" y1="${y}" y2="${y}" class="trend-grid"/><text x="${P - 8}" y="${y + 4}" class="trend-axis" text-anchor="end">${v}</text>`; }).join('')}
        <polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" class="trend-line"/>
        ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="7" class="trend-dot"/><text x="${p.x}" y="${p.y - 14}" text-anchor="middle" class="trend-val">${fmt(p.r.stats.avg)}</text><text x="${p.x}" y="${H - 8}" text-anchor="middle" class="trend-axis">${esc(p.r.name.length > 12 ? p.r.name.slice(0, 11) + '…' : p.r.name)}</text>`).join('')}
      </svg>` : `<p class="muted">${tr('tv.at.noGamesTonight')}</p>`;
    const ins = groupInsights(S.nights, S.library);
    const played = lastPlayed(S.nights);
    const dusty = libraryItems().map((it) => ({ name: it.name, label: freshnessLabel(it, played), n: played[dbKey(it.name)] ?? 999 })).filter((x) => x.label).sort((a, b) => b.n - a.n).slice(0, 3);
    const card = (title, list, val, empty) => `<section class="card stat-card stat-card--sm"><h2>${title}</h2>${list.length ? `<ol class="at-list">${list.map((g) => `<li class="at-row"><span class="at-name">${esc(g.name)}</span><span class="at-val">${val(g)}</span></li>`).join('')}</ol>` : `<p class="muted">${empty}</p>`}</section>`;
    const few = tr('tv.st.few');
    $('#atBox').innerHTML = `
      ${this.head(tr('tv.at.tab.stats'), this.groupLabel())}
      <div class="stats-body stats-body--grid">
        <section class="card stat-card stat-card--chart"><h2>${tr('tv.st.trend')}</h2>${chart}</section>
        ${card(tr('tv.st.loved'), ins.loved, (g) => fmt(g.avg), few)}
        ${card(tr('tv.st.everyone'), ins.everyone, (g) => tr('tv.st.everyoneVal', { n: String(g.minVote) }), tr('tv.st.everyoneNone'))}
        ${card(tr('tv.st.divisive'), ins.divisive, (g) => tr('tv.st.consensus', { n: String(g.consensus) }), tr('tv.st.divisiveNone'))}
        ${card(tr('tv.st.overrated'), ins.overrated, () => tr('tv.st.overratedVal'), few)}
        ${card(tr('tv.st.underrated'), ins.underrated, () => tr('tv.st.underratedVal'), few)}
        ${card(tr('tv.st.longer'), ins.longer, (g) => tr('tv.st.longerVal', { real: String(Math.round(g.realMin)), declared: String(g.declared) }), tr('tv.st.longerNone'))}
        ${card(tr('tv.st.perMinute'), ins.perMinute, (g) => tr('tv.st.perMinuteVal', { avg: fmt(g.avg), min: String(Math.round(g.realMin)) }), tr('tv.st.perMinuteNone'))}
        ${card(tr('tv.st.never'), ins.never, (g) => fmt(g.avg), tr('tv.st.neverNone'))}
        ${card(tr('tv.st.replay'), ins.replay, (g) => tr('tv.st.replayVal', { n: g.ago }), tr('tv.st.replayNone'))}
        ${card(tr('tv.st.dusty'), dusty, (g) => esc(g.label), tr('tv.st.dustyNone'))}
      </div>`;
  },

  /** Mappa delle coppie: compatibilità, rivalità, duo imbattibili. */
  paintPairs() {
    const pm = pairsMap(S.nights);
    const people = pm.people.slice(0, 9);
    const find = (a, b) => pm.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    const hl = (icon, title, p, text) => `<button type="button" class="card pair-hl" ${p ? `data-pair="${esc(p.a)}|${esc(p.b)}"` : 'disabled'}><span class="pair-ico">${icon}</span><b>${title}</b>${p ? `<span>${esc(p.aName)} + ${esc(p.bName)}</span><small>${text(p)}</small>` : `<small>${tr('tv.pr.few')}</small>`}</button>`;
    const heat = (c) => (c === null ? 'transparent' : `hsl(${Math.round((c / 100) * 130)}, 70%, 62%)`);
    const matrix = people.length >= 2 ? `
      <table class="pair-matrix"><thead><tr><th></th>${people.map((p) => `<th>${avatarHTML(playerByName(p.name), '2rem')}<span>${esc(p.name)}</span></th>`).join('')}</tr></thead>
      <tbody>${people.map((r) => `<tr><th>${esc(r.name)}</th>${people.map((c) => {
        if (r.key === c.key) return '<td class="is-self"></td>';
        const p = find(r.key, c.key);
        return `<td><button type="button" class="${p?.compat === null || p?.compat === undefined ? 'is-na' : ''}" data-pair="${esc(r.key)}|${esc(c.key)}" style="--h:${heat(p?.compat ?? null)}" aria-label="${esc(namesList([r.name, c.name]))}">${p?.compat ?? '—'}${p?.compat !== null && p?.compat !== undefined ? '%' : ''}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>` : `<p class="muted">${tr('tv.pr.needTwo')}</p>`;
    let detail = `<p class="muted">${tr('tv.pr.tap')}</p>`;
    if (this.pair) {
      const [a, b] = this.pair.split('|');
      const p = find(a, b);
      if (p) {
        const x = p.a === a ? { n1: p.aName, n2: p.bName, w1: p.aWins, w2: p.bWins } : { n1: p.bName, n2: p.aName, w1: p.bWins, w2: p.aWins };
        const gname = (k) => S.library && libraryItems().find((it) => dbKey(it.name) === k)?.name || k;
        detail = `
          <h2>${esc(x.n1)} + ${esc(x.n2)}</h2>
          <p class="pair-compat">${p.compat !== null && p.compat !== undefined ? tr('tv.pr.compat', { n: String(p.compat) }) : tr('tv.pr.compatNone')}</p>
          <ul class="pair-facts">
            <li>${tr('tv.pr.together', { n: String(p.together) })}</li>
            <li>${tr('tv.pr.h2h', { a: `<b>${esc(x.n1)} ${x.w1}</b>`, b: `<b>${x.w2} ${esc(x.n2)}</b>` })}</li>
            <li>${tr('tv.pr.both', { n: String(p.both) })}</li>
            ${p.lovedBoth?.length ? `<li>${tr('tv.pr.loved', { list: esc(p.lovedBoth.slice(0, 4).map(gname).join(', ')) })}</li>` : ''}
            ${p.opposite?.length ? `<li>${tr('tv.pr.opposite', { list: esc(p.opposite.slice(0, 4).map(gname).join(', ')) })}</li>` : ''}
          </ul>`;
      }
    }
    $('#atBox').innerHTML = `
      ${this.head(tr('tv.at.tab.pairs'), this.groupLabel())}
      <div class="pairs-hl">
        ${hl('🔥', tr('tv.pr.duo'), pm.duo, (p) => tr('tv.pr.duoVal', { n: String(p.both) }))}
        ${hl('⚔️', tr('tv.pr.rivalry'), pm.rivalry, (p) => tr('tv.pr.rivalryVal', { a: String(p.aWins), b: String(p.bWins) }))}
        ${hl('❤️', tr('tv.pr.souls'), pm.souls, (p) => tr('tv.pr.compatVal', { n: String(p.compat) }))}
        ${hl('💀', tr('tv.pr.enemies'), pm.enemies, (p) => tr('tv.pr.compatVal', { n: String(p.compat) }))}
      </div>
      <div class="pairs-body"><div class="card stat-card pair-matrix-wrap">${matrix}</div><div class="card stat-card">${detail}</div></div>`;
  },

  /** Hall of Fame: livello del gruppo, record, livelli e traguardi dei giocatori. */
  paintHof() {
    const gl = groupLevel(S.nights);
    const rec = records(S.nights);
    const people = {};
    for (const n of Object.values(S.nights || {})) for (const [k, pp] of Object.entries(n?.people || {})) people[k] = pp.name || people[k];
    const rows = Object.entries(people).map(([k, name]) => ({ k, name, pr: progressFor(S.nights, k, S.library) })).sort((a, b) => b.pr.xp - a.pr.xp).slice(0, 8);
    $('#atBox').innerHTML = `
      ${this.head('Hall of Fame', tr('tv.hof.sub', { group: this.groupLabel(), level: String(gl.level), nights: tr('tv.at.nNights', { n: gl.nights }), games: String(gl.games) }))}
      <div class="stats-body stats-body--hof">
        <section class="card stat-card stat-card--wide"><h2>${tr('tv.hof.levels')}</h2>${rows.length ? `<ol class="hof-list">${rows.map((r, i) => `
          <li class="hof-row">
            <span class="at-pos">${i + 1}</span>
            ${avatarHTML(playerByName(r.name), '2.8rem')}
            <span class="hof-who"><b>${esc(r.name)}</b><small>${tr('tv.hof.level', { n: String(r.pr.level) })} · ${esc(r.pr.levelName)} · ${r.pr.xp} XP</small>
              <span class="xp-bar" aria-hidden="true"><i style="width:${Math.round(r.pr.levelProgress * 100)}%"></i></span></span>
            <span class="hof-ach" title="${tr('tv.hof.ach')}">${r.pr.achievements.filter((a) => a.got).map((a) => a.icon).join(' ')}</span>
          </li>`).join('')}</ol>` : `<p class="muted">${tr('tv.at.noNights')}.</p>`}</section>
        <section class="card stat-card"><h2>${tr('tv.hof.records')}</h2>${rec.length ? `<ol class="at-list">${rec.map((r) => `<li class="at-row at-row--stack"><span class="muted">${esc(r.title)}</span><b>${esc(r.value)}</b>${r.def ? `<small class="rec-def">${esc(r.def)}</small>` : ''}</li>`).join('')}</ol>` : `<p class="muted">${tr('tv.hof.noRecords')}</p>`}</section>
      </div>`;
  },

  /** Ricordi: tutte le serate del gruppo, dalla più recente. */
  paintMemories() {
    const list = nightsList(S.nights).reverse();
    const otd = onThisDay(S.nights);
    const date = (at) => fmtDateL(Number(at), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const banner = otd ? `<div class="otd">${otd.anniversary ? tr('tv.mem.anniv', { years: tr('tv.mem.years', { n: otd.anniversary.years }), date: esc(date(otd.anniversary.at)) }) : ''}${otd.yearAgo ? tr('tv.mem.yearAgo', { date: esc(date(otd.yearAgo.at)), games: esc(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3).join(', ')) }) : ''}</div>` : '';
    $('#atBox').innerHTML = `
      ${this.head(tr('tv.at.tab.memories'), `${this.groupLabel()}: ${tr('tv.at.nNights', { n: list.length })}`)}
      ${banner}
      ${list.length ? `<div class="mem-grid">${list.slice(0, 12).map((n) => `
        <button type="button" class="card mem-card" data-night="${esc(n.room)}">
          <span class="mem-num">Game Night #${n.number}${n.room === S.code ? tr('tv.mem.tonight') : ''}</span>
          <b class="mem-date">${esc(date(n.at))}</b>
          <span class="mem-facts">${nightFacts(n)}</span>
          ${n.topGame ? `<span>⭐ ${esc(n.topGame.name)} ${fmt(n.topGame.avg)}</span>` : ''}
          ${n.winners.length ? `<span>🏆 ${esc(namesList(n.winners))}</span>` : ''}
          ${n.mvpNames.length ? `<span>👑 MVP ${esc(namesList(n.mvpNames))}</span>` : ''}
        </button>`).join('')}</div>` : `<div class="empty-board"><p class="empty-title">${tr('tv.mem.none')}</p><p class="muted">${tr('tv.mem.noneText')}</p></div>`}`;
  },

  /** Pagina di una serata. */
  paintNight() {
    const list = nightsList(S.nights);
    const n = list.find((x) => x.room === this.night);
    if (!n) { this.view = 'memories'; this.paintMemories(); return; }
    const names = Object.fromEntries(Object.entries(n.people || {}).map(([k, pp]) => [k, pp.name]));
    const titles = {};
    for (const [k, ts] of Object.entries(n.titles || {})) for (const tt of (Array.isArray(ts) ? ts : Object.values(ts))) (titles[awardTitle(tt)] ||= []).push(names[k] || k);
    const imgByKey = Object.fromEntries(libraryItems().map((it) => [dbKey(it.name), it]));
    const games = [...n.gamesSorted].sort((a, b) => (b.n ? b.sum / b.n : 0) - (a.n ? a.sum / a.n : 0)).map((g, i) => `
      <li class="brow brow--at brow--r${Math.min(i + 1, 4)}">
        <span class="brank">${i + 1}</span>
        ${gameImageHTML(imgByKey[g.key] || g, 'game-img--thumb')}
        <span class="bname"><b>${esc(g.name)}</b><span class="bsub">${tr('tv.ic.nVotes', { n: String(g.n) })}${g.playedMin ? ` · ${g.playedMin} min` : ''}${(g.w || []).length ? ` · 🏆 ${esc(namesList((Array.isArray(g.w) ? g.w : Object.values(g.w)).map((k) => names[k] || k)))}` : ''}</span></span>
        <span class="bavg">${g.n ? fmt(g.sum / g.n) : '—'}</span>
      </li>`).join('');
    const photos = n.room === S.code ? photoList(S.photos).length : null;
    $('#atBox').innerHTML = `
      ${this.head(`Game Night #${n.number}`, `${esc(fmtDateL(Number(n.at), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${nightFacts(n)}`)}
      <div class="alltime-body">
        <div class="alltime-main"><ol class="board-list">${games}</ol></div>
        <aside class="card alltime-side night-side">
          ${n.topGame ? `<p>${tr('tv.ng.top', { name: esc(n.topGame.name), avg: fmt(n.topGame.avg) })}</p>` : ''}
          ${n.mvpNames.length ? `<p>👑 MVP: <b>${esc(namesList(n.mvpNames))}</b></p>` : ''}
          ${n.winners.length ? `<p>${tr('tv.ng.winner', { names: esc(namesList(n.winners)) })}</p>` : ''}
          ${Object.keys(titles).length ? `<h2>${tr('tv.ng.awards')}</h2><ul class="at-list">${Object.entries(titles).map(([tt, ns]) => `<li class="at-row at-row--stack"><span class="muted">${esc(tt)}</span><b>${esc(namesList(ns))}</b></li>`).join('')}</ul>` : ''}
          ${(n.quotes || []).length ? `<h2>${tr('tv.ng.quotes')}</h2><ul class="quote-list">${(Array.isArray(n.quotes) ? n.quotes : Object.values(n.quotes)).slice(0, 6).map((q) => `<li>«${esc(q.text)}» <small>${esc(q.name)}, ${esc(q.game)}</small></li>`).join('')}</ul>` : ''}
          <button type="button" class="btn-sec" data-album="${esc(n.room)}" data-title="Album · Game Night #${n.number}">📸 ${tr('tv.al.title')}${photos !== null ? ` (${photos})` : ''}</button>
          <a class="btn-sec" href="resoconto.html?room=${esc(n.room)}&g=${esc(S.meta?.groupId || '')}&s=regia" target="_blank" rel="noopener">📋 ${tr('tv.ng.report')}</a>
          ${isNightCreator(n, S.uid, Person.data?.pid || '') ? `<p class="muted small">${tr(n.room === S.code ? 'tv.ng.canDeleteNow' : 'tv.ng.canDelete')}</p>` : ''}
          <button type="button" class="link-btn" data-view="memories">${tr('tv.ng.allMem')}</button>
        </aside>
      </div>`;
  },

  /** "Il vostro anno": recap una scheda alla volta (frecce ← →) e immagine da condividere. Solo dati veri. */
  paintWrapped() {
    const years = yearsOf(S.nights);
    if (!years.length) { $('#atBox').innerHTML = `${this.head(tr('year.title'))}<div class="empty-board"><p class="empty-title">${esc(tr('year.empty'))}</p></div>`; return; }
    const year = years.includes(this.year) ? this.year : years[0];
    const w = wrapped(S.nights, year);
    const day = (ts) => fmtDateL(Number(ts), { day: 'numeric', month: 'long' });
    const slides = [
      { k: tr('year.k.intro', { year: String(year) }), big: tr('year.nights', { n: w.nights }), small: [tr('year.matches', { n: w.matches }), tr('year.games', { n: w.distinctGames }), w.hours ? tr('year.hours', { n: w.hours }) : '', tr('year.players', { n: w.players })].filter(Boolean).join(' · ') + (w.inProgress ? ` (${tr('year.soFar')})` : '') },
      w.topGames.length > 1 && { k: tr('year.k.top'), list: w.topGames.map((g) => `${g.name} · ${tr('year.matchesShort', { n: g.matches })}${g.avg !== null ? ` · ⭐ ${fmt(g.avg)}` : ''}`) },
      w.mostPlayed && w.topGames.length <= 1 && { k: tr('year.k.mostPlayed'), big: w.mostPlayed.name, small: tr('year.matches', { n: w.mostPlayed.matches }) },
      w.loved && { k: tr('year.k.loved'), big: w.loved.name, small: tr('year.avg', { avg: fmt(w.loved.avg) }) },
      w.newGames && { k: tr('year.k.new'), big: String(w.newGames), small: tr('year.newGames', { n: w.newGames }) },
      w.longestMatch && { k: tr('year.k.longestMatch'), big: w.longestMatch.name, small: tr('year.minutes', { n: w.longestMatch.minutes }) },
      w.longestNight && { k: tr('year.k.longestNight'), big: tr('year.hm', { h: Math.floor(w.longestNight.minutes / 60), m: w.longestNight.minutes % 60 }), small: day(w.longestNight.at) },
      w.deadliest && { k: tr('year.k.deadliest'), big: w.deadliest.name, small: tr('year.wins', { n: w.deadliest.wins }) },
      w.mostPresent && { k: tr('year.k.present'), big: w.mostPresent.name, small: tr('year.presence', { n: w.mostPresent.nights, total: w.nights }) },
      w.mvp && { k: tr('year.k.mvp'), big: w.mvp.name, small: tr('year.mvpVotes', { n: w.mvp.mvp }) },
      w.oracle && { k: tr('year.k.oracle'), big: w.oracle.name, small: tr('year.oracle', { n: w.oracle.oracle }) },
      w.seer && { k: tr('year.k.seer'), big: w.seer.name, small: tr('year.seer', { n: w.seer.seer }) },
      w.critic && { k: tr('year.k.critic'), big: w.critic.name, small: tr('year.given', { avg: fmt(w.critic.sum / w.critic.n) }) },
      w.generous && { k: tr('year.k.generous'), big: w.generous.name, small: tr('year.given', { avg: fmt(w.generous.sum / w.generous.n) }) },
      w.bestMonth && { k: tr('year.k.month'), big: w.bestMonth.name, small: tr('year.nights', { n: w.bestMonth.nights }) },
      { k: tr('year.k.thanks'), big: S.meta.groupName || tr('year.yourGroup'), small: S.next?.at ? tr('year.nextOn', { date: day(S.next.at) }) : tr('year.next') }
    ].filter(Boolean);
    const i = Math.max(0, Math.min(this.slide, slides.length - 1));
    this.slide = i;
    const sl = slides[i];
    const colors = ['#FF5A4E', '#2EC4B6', '#7B5CFA', '#FFC93C', '#FF8FB1', '#4D96FF', '#8AC926', '#FF924C'];
    $('#atBox').innerHTML = `
      ${this.head(tr('year.titleN', { year: String(year) }), this.groupLabel())}
      <div class="rg-row">${years.length > 1 ? years.map((y) => `<button type="button" class="lib-chip" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('') : ''}
        <button type="button" class="btn-sec btn-sec--sm" data-yearshare="${year}">📤 <span>${esc(tr('year.share'))}</span></button></div>
      ${w.nights < 3 ? `<p class="muted small">${esc(tr('year.few'))}</p>` : ''}
      <div class="wrapped">
        <button type="button" class="wr-nav" data-slide="-1" aria-label="${esc(tr('year.prev'))}" ${i === 0 ? 'disabled' : ''}>‹</button>
        <article class="wr-slide" style="--wc:${colors[i % colors.length]}">
          <p class="wr-k">${esc(sl.k)}</p>
          ${sl.list ? `<ol class="wr-list">${sl.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : `<h2 class="wr-big">${esc(sl.big)}</h2><p class="wr-small">${esc(sl.small)}</p>`}
          <p class="wr-dots">${slides.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</p>
        </article>
        <button type="button" class="wr-nav" data-slide="1" aria-label="${esc(tr('year.next'))}" ${i === slides.length - 1 ? 'disabled' : ''}>›</button>
      </div>`;
  },

  async shareYear(year, btn) {
    const w = wrapped(S.nights, year);
    if (!w) return;
    if (btn) btn.disabled = true;
    try {
      const blob = await renderYearImage(w, { group: S.meta?.groupName || '', emblem: S.identity?.emblem || '', color: S.identity?.color || undefined });
      await shareOrDownload(blob, exportName({ group: S.meta?.groupName || '', kind: tr('exp.k.year'), extra: String(year), ext: 'png' }), tr('year.shareText', { year: String(year) }));
    } catch (err) { toast(explainError(err), 'error'); } finally { if (btn) btn.disabled = false; }
  },

  /** Calendario: prossima serata con presenze, serate per mese, ricorrenze. */
  paintCalendar() {
    const years = yearsOf(S.nights);
    const year = this.year || new Date().getFullYear();
    const months = nightsByMonth(S.nights, year);
    const MONTHS = Array.from({ length: 12 }, (_, i) => { const m = fmtDateL(new Date(2020, i, 1), { month: 'short' }).replace('.', ''); return m.charAt(0).toUpperCase() + m.slice(1); });
    const now = new Date();
    const thisMonth = nightsByMonth(S.nights, now.getFullYear())[now.getMonth()].length;
    const otd = onThisDay(S.nights);
    $('#atBox').innerHTML = `
      ${this.head(tr('tv.at.tab.calendar'), this.groupLabel())}
      <div class="cal-body">
        ${nextNightHTML(true)}
        <section class="card stat-card">
          <div class="cal-head"><h2>${tr('tv.cal.title', { year: String(year) })}</h2>${[...new Set([now.getFullYear(), ...years])].sort((a, b) => b - a).map((y) => `<button type="button" class="lib-chip" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}</div>
          <div class="cal-grid">${months.map((m, i) => `<div class="cal-month ${m.length ? 'has' : ''}"><b>${MONTHS[i]}</b><span class="cal-dots">${m.map((n) => `<button type="button" class="cal-dot" data-night="${esc(n.room)}" title="Game Night #${n.number}, ${new Date(Number(n.at)).getDate()} ${MONTHS[i]}">${new Date(Number(n.at)).getDate()}</button>`).join('')}</span></div>`).join('')}</div>
          <p class="muted">${tr('tv.cal.month', { n: thisMonth, year: String(year), total: String(months.flat().length) })}</p>
          ${otd?.anniversary ? `<p>${tr('tv.cal.anniv', { years: tr('tv.cal.years', { n: otd.anniversary.years }) })}</p>` : ''}
          ${otd?.yearAgo ? `<p>${tr('tv.cal.yearAgo', { games: esc(otd.yearAgo.gamesSorted.map((g) => g.name).slice(0, 3).join(', ')) })}</p>` : ''}
        </section>
      </div>`;
  }
};
