// Controllo di sicurezza (script classico, parte prima dei moduli): se dopo una pubblicazione il browser
// mescola file vecchi e nuovi, la pagina resta ferma. In quel caso si mostra come ricaricarla.
(function () {
  var shown = false;
  function show() {
    if (shown || window.__gnrReady) return;
    shown = true;
    var d = document.createElement('div');
    d.className = 'stale-banner';
    d.setAttribute('role', 'alert');
    // Script classico (prima dei moduli e dei dizionari): i due testi stanno qui, scelti con la lingua salvata.
    var en = false;
    try { en = (localStorage.getItem('gnr_lang') || (navigator.language || '')).slice(0, 2).toLowerCase() === 'en'; } catch (e) { /* niente */ }
    d.innerHTML = en
      ? '<b>The page didn’t load completely.</b> Your browser probably kept files from the previous version. <button type="button">Reload</button><small>If that’s not enough: Ctrl+Shift+R on a computer; on a phone close and reopen the tab.</small>'
      : '<b>La pagina non si è caricata del tutto.</b> Probabilmente il browser ha tenuto dei file della versione precedente. ' + // i18n-ok
        '<button type="button">Ricarica</button><small>Se non basta: sul computer Ctrl+Shift+R, sul telefono chiudi e riapri la scheda.</small>'; // i18n-ok
    d.querySelector('button').addEventListener('click', function () {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.update(); }); });
        }
      } catch (e) { /* niente */ }
      location.reload();
    });
    (document.body || document.documentElement).appendChild(d);
  }
  window.addEventListener('error', function (e) {
    var m = String((e && e.message) || '');
    if (/import|export|module|does not provide/i.test(m)) setTimeout(show, 300);
  }, true);
  setTimeout(show, 9000);
})();
