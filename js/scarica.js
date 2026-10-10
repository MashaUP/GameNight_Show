// Pagina ufficiale di download dell'app Android (scarica.html): è quella del QR mostrato dalla TV.
// L'indirizzo non cambia mai: a ogni nuova versione mostra da sola l'ultima APK pubblicata.
import { $, esc, qrSVG, toast, applyTheme, registerSW, ErrLog } from './util.js';
import { isApp, isAndroid, apkUrl } from './native.js';
import { mountUpdatePanel, releaseSource, MIN_ANDROID } from './updates.js';

ErrLog.install();
applyTheme();
registerSW();

const app = $('#app');
const src = releaseSource();
const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
app.innerHTML = `
  <main class="phone dl">
    <header class="ph-top">
      <a class="btn-sec btn-sec--sm ph-back" href="index.html" aria-label="Home">←</a>
      <span class="brand-row"><span class="brand brand--sm">GameNight <span class="logo-tag logo-tag--xs">Show</span></span></span>
      <span aria-hidden="true"></span>
    </header>
    <section class="card dl-hero">
      <p class="dl-ico" aria-hidden="true">📲</p>
      <h1>Scarica GameNight Show</h1>
      <p>L’app per Android: si apre a schermo intero, legge il QR della TV e usa lo stesso profilo del sito. Gratuita, senza pubblicità.</p>
    </section>
    ${isApp() ? '<p class="arm-ro">Sei già nell’app: qui sotto vedi se c’è una versione più nuova.</p>' : ''}
    ${ios ? '<p class="arm-ro">📱 Su iPhone e iPad l’app Android non si installa: apri il <a href="index.html">sito</a> in Safari, tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>' : ''}
    ${apkUrl() ? '<section class="card dl-sec"><div id="dlPanel" class="ver-panel"></div></section>'
    : '<section class="card dl-sec"><p class="form-error">Il download non è configurato su questo sito: l’indirizzo ufficiale dell’APK si ricava dal sito pubblicato su GitHub Pages (README, “App Android”).</p></section>'}
    <section class="card dl-sec">
      <h2>Come si installa</h2>
      <ol class="dl-steps">
        <li>Tocca <b>Scarica APK</b> e aspetta la fine del download.</li>
        <li>Apri il file <b>GameNight-Show.apk</b> (dalle notifiche o dalla cartella Download).</li>
        <li>La prima volta Android chiede il permesso di installare app da questa fonte (il browser o “File”): tocca <b>Impostazioni</b>, attiva <b>Consenti da questa fonte</b> e torna indietro.</li>
        <li>Tocca <b>Installa</b>. Per gli aggiornamenti fai lo stesso: profilo, armadi e serate restano.</li>
      </ol>
      <p class="muted small">Requisiti: Android ${esc(MIN_ANDROID)} o più recente e una connessione a internet per giocare.</p>
      ${src ? `<p class="muted small"><a href="${esc(src.page)}" target="_blank" rel="noopener noreferrer">Pagina della release su GitHub</a> (APK e dati della build).</p>` : ''}
    </section>
  </main>`;
if (apkUrl()) mountUpdatePanel($('#dlPanel'), { qrSVG, toast, showQR: !isAndroid() && !ios && !isApp(), page: true });
