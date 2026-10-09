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
    d.innerHTML = '<b>La pagina non si è caricata del tutto.</b> Probabilmente il browser ha tenuto dei file della versione precedente. ' +
      '<button type="button">Ricarica</button><small>Se non basta: sul computer Ctrl+Shift+R, sul telefono chiudi e riapri la scheda.</small>';
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
