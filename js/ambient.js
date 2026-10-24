// Schermata ambientale della TV: una vista elegante e poco invasiva per i momenti di gioco e le pause.
//
// Non è una seconda regia: legge lo stesso stato della serata (host.js passa un "modello" già pronto
// con ambientModel) e si limita a disegnarlo. Si accende e si spegne con rooms/<codice>/meta/ambient
// (TV, tasto A, Strumenti, o regia dal telefono con il comando "ambient"), quindi resta accesa anche
// se la pagina si ricarica. Si vede nelle fasi tranquille (lobby, tra un gioco e l'altro, classifica):
// quando si apre una votazione, un reveal o la premiazione la TV mostra quelli, e la schermata
// ambientale torna da sola dopo. Lo stato della serata non cambia mai.
import { esc, gameImageHTML, ICONS } from './util.js';
import { avatarHTML } from './avatars.js';
import { timerDisplayHTML, SharedTimer } from './sharedtimer.js';
import { t, fmtDate } from './i18n.js';
import { fmtClock } from './nightclock.js';

/** Fasi in cui la schermata ambientale può stare sullo schermo. */
export const AMBIENT_PHASES = ['lobby', 'idle', 'board', 'alltime'];

let C = null;
/** ctx: { model() → vedi host.js › ambientModel, exit(), serverNow() } */
export function bindAmbient(ctx) { C = ctx; }

export const Ambient = {
  el: null,
  sig: '',
  isShown() { return Boolean(this.el); },
  /** Mostra, aggiorna o toglie la schermata in base al modello. */
  sync() {
    const m = C?.model?.();
    const show = Boolean(m?.on && AMBIENT_PHASES.includes(m.phase));
    document.body.classList.toggle('ambient-on', show);
    if (!show) { this.hide(); return; }
    if (!this.el) this.mount();
    this.paint(m);
  },
  mount() {
    const el = document.createElement('section');
    el.className = 'ambient';
    el.id = 'ambient';
    el.setAttribute('aria-label', t('amb.aria'));
    el.innerHTML = `
      <div class="amb-vignette" aria-hidden="true"></div>
      <div class="amb-main" id="ambMain"></div>
      <aside class="amb-side">
        <p class="amb-clock" id="ambClock" aria-hidden="true"></p>
        <div class="amb-pause" id="ambPause" hidden></div>
        <div class="amb-timer" id="ambTimer">${timerDisplayHTML('ambient')}</div>
        <div class="amb-extra" id="ambExtra"></div>
      </aside>
      <footer class="amb-foot">
        <span class="amb-atmo" id="ambAtmo"></span>
        <button type="button" class="amb-exit" id="ambExit">${ICONS.x}<span>${esc(t('amb.exit'))}</span></button>
      </footer>`;
    document.body.appendChild(el);
    this.el = el;
    this.sig = '';
    el.querySelector('#ambExit').addEventListener('click', () => C?.exit?.());
    this.clock = setInterval(() => this.paintClock(), 1000);
    SharedTimer.sync();
  },
  hide() {
    if (!this.el) return;
    clearInterval(this.clock);
    this.el.remove();
    this.el = null;
    this.sig = '';
    SharedTimer.sync();
  },
  paintClock() {
    if (!this.el) return;
    const m = C?.model?.();
    const c = this.el.querySelector('#ambClock');
    const now = new Date();
    const txt = fmtDate(now, { hour: '2-digit', minute: '2-digit' });
    if (c && c.textContent !== txt) c.textContent = txt;
    const pl = this.el.querySelector('#ambPlay');
    if (pl && m?.playStart) pl.textContent = fmtClock(m.playElapsed());
  },
  paint(m) {
    // Ridisegno solo quando cambia qualcosa di visibile: niente immagini ricaricate a ogni aggiornamento.
    const sig = JSON.stringify([m.mode, m.game?.key, m.game?.image ? m.game.image.length : 0, m.game?.info, m.players?.map((p) => [p.uid, p.name, p.color, p.style, p.seed]),
      m.board, m.group, m.night, m.paused, m.pauseReason, m.atmoLabel, m.statusKey, m.count]);
    this.el.classList.toggle('is-paused', Boolean(m.paused));
    this.el.dataset.mode = m.mode;
    if (sig === this.sig) { this.paintClock(); return; }
    this.sig = sig;
    const main = this.el.querySelector('#ambMain');
    if (m.mode === 'game' && m.game) {
      main.innerHTML = `
        <div class="amb-cover">${gameImageHTML({ name: m.game.name, image: m.game.image }, 'amb-img')}</div>
        <div class="amb-info">
          <p class="amb-kicker">${esc(t(`amb.status.${m.statusKey}`))}</p>
          <h1 class="amb-title">${esc(m.game.name)}</h1>
          ${m.game.info ? `<p class="amb-meta">${esc(m.game.info)}</p>` : ''}
          ${m.playStart ? `<p class="amb-play">⏱️ <b id="ambPlay">${esc(fmtClock(m.playElapsed()))}</b> <span>${esc(t('amb.playing'))}</span></p>` : ''}
          ${m.players?.length ? `<ul class="amb-players" aria-label="${esc(t('amb.players'))}">${m.players.map((p) => `<li>${avatarHTML(p, '3.4rem')}<span>${esc(p.name)}</span></li>`).join('')}</ul>` : ''}
        </div>`;
    } else {
      main.innerHTML = `
        <div class="amb-idle">
          ${m.emblem ? `<div class="amb-emblem" aria-hidden="true">${m.emblem}</div>` : '<div class="amb-emblem amb-emblem--dice" aria-hidden="true">🎲</div>'}
          <p class="amb-kicker">${esc(m.night ? t('amb.nightN', { n: m.night }) : t('amb.tonight'))}</p>
          <h1 class="amb-title">${esc(m.group || t('amb.defaultTitle'))}</h1>
          <p class="amb-meta">${esc(t(`amb.status.${m.statusKey}`))}${m.count ? ` · ${esc(t('amb.count', { n: m.count }))}` : ''}</p>
          ${m.board?.length ? `<ol class="amb-board" aria-label="${esc(t('amb.board'))}">${m.board.map((g, i) => `<li><span class="amb-pos">${i + 1}</span><b>${esc(g.name)}</b><span class="amb-avg">${esc(g.avg)}</span></li>`).join('')}</ol>` : ''}
        </div>`;
    }
    const pz = this.el.querySelector('#ambPause');
    pz.hidden = !m.paused;
    pz.innerHTML = m.paused ? `<b>❚❚ ${esc(t('amb.paused'))}</b>${m.pauseReason ? `<span>${esc(m.pauseReason)}</span>` : ''}` : '';
    this.el.querySelector('#ambAtmo').textContent = m.atmoLabel ? `✨ ${m.atmoLabel}` : '';
    this.paintClock();
  }
};
