import asyncio, json
import common
from common import watch, errs
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8766'
SITE = 'https://example.github.io/GameNight_Show/'
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

CAP = """
window.__calls = [];
window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'App', addListener(p, e, cb) { window.__back = cb; return { remove() {} }; }, nativePromise(p, m, o) {
  const c = Object.assign({}, o || {}); if (c.data) c.data = 'len:' + c.data.length; window.__calls.push([p, m, c]);
  if (p === 'Filesystem' && m === 'writeFile') { if (window.__failDocs && o.directory === 'DOCUMENTS') return Promise.reject(new Error('no')); return Promise.resolve({ uri: 'file:///cache/' + o.path }); }
  return Promise.resolve({});
} };
try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}
"""

async def ctxp(b, n, mobile=True):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 720}, is_mobile=mobile)
    await ctx.add_init_script(CAP)
    await common.route_links(ctx, SITE)
    await ctx.route(SITE + 'version.json*', lambda r: r.fulfill(status=200, content_type='application/json', body='{"version":"1.0.1"}', headers={'access-control-allow-origin': '*'}))
    same = {'name': 'GameNight Show 1.3.0', 'tag_name': 'v1.3.0', 'body': '', 'assets': [{'name': 'GameNight-Show.apk', 'size': 10, 'browser_download_url': 'https://github.com/example/GameNight_Show/releases/download/v1.3.0/GameNight-Show.apk'}]}
    await ctx.route('https://api.github.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(same), headers={'access-control-allow-origin': '*'}))
    await ctx.route('https://example.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<h1>esterno</h1>'))
    pg = await ctx.new_page(); watch(pg, n)
    return ctx, pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        # Home
        ctx, pg = await ctxp(b, 'home')
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#joinForm')
        ok(await pg.evaluate("document.documentElement.classList.contains('in-app')"), 'classe in-app')
        ok(await pg.wait_for_selector('#scanBtn', state='visible', timeout=4000) is not None, 'pulsante QR in home')
        await pg.wait_for_timeout(300)
        ok(any(c[0] == 'SystemBars' for c in await pg.evaluate('window.__calls')), 'barra di stato impostata')
        ok(not await pg.is_visible('#hubApp'), 'niente link APK dentro l\'app')
        # tasto Indietro: prima chiude la finestra, poi dalla home riduce a icona
        await pg.click('#hubSettings'); await pg.wait_for_selector('.hub-overlay')
        await pg.evaluate('window.__calls = []; window.__back()'); await pg.wait_for_timeout(300)
        ok(await pg.query_selector('.hub-overlay') is None, 'Indietro chiude la finestra aperta')
        await pg.evaluate('window.__back()'); await pg.wait_for_timeout(300)
        ok(any(c[0] == 'App' and c[1] == 'minimizeApp' for c in await pg.evaluate('window.__calls')), 'Indietro dalla home riduce a icona')
        # scanner overlay opens and closes
        await pg.click('#scanBtn'); await pg.wait_for_selector('.scan-view--qr video', timeout=5000)
        await pg.wait_for_timeout(1200)
        ok(await pg.evaluate("document.querySelector('.scan-view--qr video')?.videoWidth > 0"), 'fotocamera (finta) aperta')
        await pg.click('[data-close]'); await pg.wait_for_timeout(200)
        ok(await pg.query_selector('.scan-view--qr') is None, 'scanner chiuso')
        # jsQR decodes a QR made by our generator
        txt = await pg.evaluate("""(async () => {
          if (!window.qrcode) await new Promise((r) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.js'; s.onload = r; document.head.appendChild(s); });
          const { qrSVG } = await import('/js/util.js');
          const svg = qrSVG('https://example.github.io/GameNight_Show/play.html?room=K7Q2');
          const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
          await img.decode();
          const cv = document.createElement('canvas'); cv.width = 400; cv.height = 400; const cx = cv.getContext('2d');
          cx.fillStyle = '#fff'; cx.fillRect(0, 0, 400, 400); cx.drawImage(img, 20, 20, 360, 360);
          const jsQR = (await import('/vendor/jsqr.js')).default;
          const r = jsQR(cx.getImageData(0, 0, 400, 400).data, 400, 400);
          const { routeFromQR } = await import('/js/native.js');
          return r ? routeFromQR(r.data) : null;
        })()""")
        ok(txt == 'play.html?room=K7Q2', f'jsQR legge il QR della stanza ({txt})')
        # downloads → Documenti
        await pg.evaluate("window.__calls = []; import('/js/util.js').then(m => m.downloadFile('prova.txt', 'ciao'))")
        await pg.wait_for_timeout(400)
        calls = await pg.evaluate('window.__calls')
        ok(any(c[0] == 'Filesystem' and c[2].get('directory') == 'DOCUMENTS' and c[2]['path'] == 'GameNight Show/prova.txt' for c in calls), 'file salvato in Documenti')
        ok('Documenti/GameNight Show/prova.txt' in (await pg.inner_text('#toast')), 'avviso con la cartella')
        # Documents fails → share
        await pg.evaluate("window.__calls = []; window.__failDocs = true; import('/js/util.js').then(m => m.downloadFile('b.ics', 'x', 'text/calendar'))")
        await pg.wait_for_timeout(400)
        calls = await pg.evaluate('window.__calls')
        ok(any(c[0] == 'Share' and c[1] == 'share' and c[2]['files'] == ['file:///cache/condivisi/b.ics'] for c in calls), 'ripiego su Condividi')
        # share image
        await pg.evaluate("window.__calls = []; window.__failDocs = false; import('/js/share.js').then(async m => { window.__how = await m.shareOrDownload(new Blob(['x'], {type:'image/png'}), 'fig ura.png', 'testo'); })")
        await pg.wait_for_timeout(400)
        calls = await pg.evaluate('window.__calls')
        ok(any(c[0] == 'Share' and c[2].get('text') == 'testo' and c[2]['files'] == ['file:///cache/condivisi/fig_ura.png'] for c in calls) and await pg.evaluate('window.__how') == 'shared', 'immagine condivisa')
        # update banner (1.3: dati dalla release su GitHub, una volta per versione)
        rel = {'name': 'GameNight Show 9.9.0', 'tag_name': 'v9.9.0', 'body': 'Testo scritto a mano', 'assets': [{'name': 'GameNight-Show.apk', 'size': 10, 'label': 'GameNight Show 9.9.0 · build 99', 'digest': 'sha256:' + 'a' * 64, 'browser_download_url': 'https://github.com/example/GameNight_Show/releases/download/v9.9.0/GameNight-Show.apk'}]}
        await ctx.route('https://api.github.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(rel), headers={'access-control-allow-origin': '*'}))
        await pg.evaluate("localStorage.removeItem('gnr_upd_auto'); localStorage.removeItem('gnr_release'); import('/js/util.js').then(m => m.watchVersion())")
        await pg.wait_for_selector('#updBanner [data-updopen]', timeout=5000)
        ok('9.9.0' in await pg.inner_text('#updBanner'), 'banner aggiornamento dell’app (APK nuova)')
        await pg.click('#updBanner .upd-x'); ok(await pg.query_selector('#updBanner') is None, 'avviso aggiornamento chiudibile')
        # external link
        await pg.evaluate("(() => { const a = document.createElement('a'); a.href = 'https://example.com/x'; a.target = '_blank'; a.id = 'ext'; a.textContent = 'x'; a.style.cssText = 'position:fixed;top:40%;left:40%;z-index:999'; document.body.appendChild(a); })()")
        await pg.click('#ext'); await pg.wait_for_url('https://example.com/x', timeout=5000)
        ok(pg.url == 'https://example.com/x', 'link esterno passato fuori')
        await ctx.close()
        # TV: QR url on public site
        ctx, host = await ctxp(b, 'tv', mobile=False)
        await host.goto(BASE + '/host.html'); await host.wait_for_selector('#createBtn')
        if await host.is_visible('#groupName'): await host.fill('#groupName', 'Prova app')
        await host.click('#createBtn'); await host.wait_for_selector('.lobby')
        code = host.url.split('room=')[1]
        u = await host.inner_text('#lobbyUrl')
        ok(u.startswith('example.github.io/GameNight_Show/play.html?room=' + code), f'QR della TV punta al sito pubblico ({u})')
        # Phone in app joins
        ctx2, ph = await ctxp(b, 'phone')
        await ph.goto(BASE + '/play.html'); await ph.wait_for_selector('#joinForm')
        ok('index.html' in ph.url, 'play.html senza stanza porta alla home')
        ok(await ph.wait_for_selector('#scanBtn', state='visible', timeout=4000) is not None, 'pulsante QR sul telefono (prima del codice)')
        ok(not await ph.is_visible('#hubApp'), 'niente invito a scaricare l\'app dentro l\'app')
        await ph.goto(f'{BASE}/play.html?room={code}'); await ph.wait_for_selector('#nameInput')
        await ph.fill('#nameInput', 'Anna'); await ph.click('.av-opt[data-pick="0"]'); await ph.click('#joinBtn')
        await ph.wait_for_selector('#waitList')
        ok(True, 'telefono nell\'app entra nella stanza')
        await b.close()
    real = [e for e in errs if 'example.github.io' not in e]
    print('ERRORI:', real if real else 'nessuno')
    print('FALLITI:', fails if fails else 'nessuno')

if __name__ == "__main__": asyncio.run(main())
