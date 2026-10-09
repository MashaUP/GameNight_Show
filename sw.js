// Service worker: rende l'app installabile e tiene una copia dei file per quando la rete va e viene.
// Strategia "prima la rete": online si usa sempre la versione più recente, offline la copia salvata.
// A ogni rilascio aumenta VERSION (insieme a js/version.js e version.json).
const VERSION = '1.1.0';
// Cambia a ogni pubblicazione anche senza cambiare versione: così il telefono e la TV prendono sempre i file nuovi.
const BUILD = '20261010b';
const CACHE = `gnr-${VERSION}-${BUILD}`;
const SHELL = [
  "./",
  "index.html",
  "host.html",
  "play.html",
  "test.html",
  "manifest.webmanifest",
  "css/style.css",
  "ludoteca.html",
  "resoconto.html",
  "js/resoconto.js",
  "js/atmo.js",
  "js/fx.js",
  "js/extras.js",
  "js/cards.js",
  "js/lite.js",
  "js/recap-video.js",
  "js/tv-extras.js",
  "js/phone-extras.js",
  "js/prep.js",
  "js/tv-prep.js",
  "js/phone-prep.js",
  "js/avatars.js",
  "js/commentary.js",
  "js/facts.js",
  "js/library.js",
  "js/music.js",
  "js/report.js",
  "js/sfx.js",
  "js/safe.js",
  "js/tour.js",
  "js/vault.js",
  "js/config.js",
  "js/fb.js",
  "js/home.js",
  "js/person.js",
  "js/host.js",
  "js/play.js",
  "js/selftest.js",
  "js/share.js",
  "js/sounds.js",
  "js/stats.js",
  "js/util.js",
  "js/version.js",
  "js/stale.js",
  "js/native.js",
  "js/site.js",
  "vendor/dicebear.js",
  "vendor/firebase.js",
  "vendor/qrcode.js",
  "assets/favicon.svg",
  "assets/logo-mark.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/fonts/fredoka-600.woff2",
  "assets/fonts/fredoka-700.woff2",
  "assets/fonts/nunito.woff2",
  "assets/fonts/atkinson-400.woff2",
  "assets/fonts/atkinson-500.woff2",
  "assets/fonts/atkinson-700.woff2"
];

self.addEventListener('install', (event) => {
  // cache: 'reload' = scarica dal sito, non dalla memoria del browser.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gnr-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase e servizi esterni vanno sempre in rete; version.json anche (serve a scoprire gli aggiornamenti).
  if (url.origin !== self.location.origin || url.pathname.endsWith('version.json')) return;
  // 'no-cache': il browser chiede sempre al sito se il file è cambiato (risposta leggerissima se è uguale).
  // Così non si mescolano mai file vecchi e nuovi dopo una pubblicazione.
  event.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === 'navigate' ? caches.match('play.html') : undefined))
        .then((hit) => hit || Response.error()))
  );
});
