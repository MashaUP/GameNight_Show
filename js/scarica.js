// Pagina ufficiale di download dell'app Android (scarica.html): è quella del QR mostrato dalla TV.
// L'indirizzo non cambia mai: a ogni nuova versione mostra da sola l'ultima APK pubblicata.
import { $, esc, qrSVG, toast, applyTheme, registerSW, ErrLog } from './util.js';
import { isApp, isAndroid, apkUrl } from './native.js';
import { mountUpdatePanel, releaseSource, MIN_ANDROID } from './updates.js';
import { t } from './i18n.js';

ErrLog.install();
applyTheme();
registerSW();

const app = $('#app');
const src = releaseSource();
const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
app.innerHTML = `
  <main class="phone dl">
    <header class="ph-top">
      <a class="btn-sec btn-sec--sm ph-back" href="index.html" aria-label="${esc(t('dl.home'))}">←</a>
      <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span aria-hidden="true"></span>
    </header>
    <section class="card dl-hero">
      <p class="dl-ico" aria-hidden="true">📲</p>
      <h1>${esc(t('dl.title'))}</h1>
      <p>${esc(t('dl.lead'))}</p>
    </section>
    ${isApp() ? `<p class="arm-ro">${esc(t('dl.inApp'))}</p>` : ''}
    ${ios ? `<p class="arm-ro">📱 ${t('dl.ios')}</p>` : ''}
    ${apkUrl() ? '<section class="card dl-sec"><div id="dlPanel" class="ver-panel"></div></section>'
    : `<section class="card dl-sec"><p class="form-error">${esc(t('dl.noconfig'))}</p></section>`}
    <section class="card dl-sec">
      <h2>${esc(t('dl.howTitle'))}</h2>
      <ol class="dl-steps">
        <li>${t('dl.step1')}</li>
        <li>${t('dl.step2')}</li>
        <li>${t('dl.step3')}</li>
        <li>${t('dl.step4')}</li>
      </ol>
      <p class="muted small">${esc(t('dl.req', { v: MIN_ANDROID }))}</p>
      ${src ? `<p class="muted small"><a href="${esc(src.page)}" target="_blank" rel="noopener noreferrer">${esc(t('dl.release'))}</a> ${esc(t('dl.releaseHint'))}</p>` : ''}
    </section>
  </main>`;
if (apkUrl()) mountUpdatePanel($('#dlPanel'), { qrSVG, toast, showQR: !isAndroid() && !ios && !isApp(), page: true });
