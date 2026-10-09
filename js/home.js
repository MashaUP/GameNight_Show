// Pagina iniziale: scegli se questo dispositivo è la TV o un telefono.
import { $, normalizeCode, registerSW, applyTheme, ErrLog, toast } from './util.js';
import { isApp, isAndroid, apkUrl, canScanQR, scanQR, routeFromQR } from './native.js';

ErrLog.install();
applyTheme();
registerSW();

const input = $('#homeCode');
const err = $('#homeErr');
const last = normalizeCode(localStorage.getItem('gnr_room'));
if (last) {
  input.value = last;
  // Dopo un crash o una chiusura per sbaglio: un tocco e si rientra.
  const back = $('#backCard');
  back.href = `play.html?room=${last}`;
  $('#backText').textContent = `Rientra nella serata ${last}, l'ultima aperta su questo telefono.`;
  back.hidden = false;
}

input.addEventListener('input', () => {
  input.value = normalizeCode(input.value);
  err.textContent = '';
});

$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizeCode(input.value);
  if (code.length !== 4) {
    err.textContent = 'Il codice ha 4 caratteri: lo trovi sulla TV.';
    input.focus();
    return;
  }
  location.href = `play.html?room=${code}`;
});

// App Android: si entra anche inquadrando il QR della TV.
if (isApp() && canScanQR()) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-sec qr-scan-btn';
  b.textContent = '📷 Inquadra il QR della TV';
  b.addEventListener('click', async () => {
    const text = await scanQR();
    if (!text) return;
    const to = routeFromQR(text);
    if (to) location.href = to;
    else toast('Questo QR non è di GameNight Show.', 'warn');
  });
  $('#joinForm').appendChild(b);
}

// Telefono Android nel browser: c'è anche l'app da installare.
const apk = !isApp() && isAndroid() ? apkUrl() : '';
if (apk) {
  const p = document.createElement('p');
  p.className = 'home-foot home-apk';
  const a = document.createElement('a');
  a.href = apk;
  a.rel = 'noopener';
  a.textContent = '📲 Scarica l’app per Android';
  p.appendChild(a);
  $('.home-choices').after(p);
}
