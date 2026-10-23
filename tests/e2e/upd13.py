# Test 1.3 (aggiornato alla 1.5): controllo versioni, download APK verificato, installazione, pagina scarica.html,
# QR sulla TV. Dalla 1.5 le APK stanno nelle release pubblicate a mano (tag vX.Y.Z), lette da releases/latest,
# con l'impronta SHA-256 calcolata da GitHub ("digest") e la build nell'etichetta del file.
# L'app Android è simulata (window.Capacitor finto); GitHub (API e APK) è simulato con le route di Playwright.
import asyncio, json, hashlib, base64, os, re
import common
from common import watch, errs, wait_js
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8766'
SITE = 'https://example.github.io/GameNight_Show/'
APK = 'https://github.com/example/GameNight_Show/releases/latest/download/GameNight-Show.apk'   # indirizzo stabile (js/site.js)
ASSET = lambda v: f'https://github.com/example/GameNight_Show/releases/download/v{v}/GameNight-Show.apk'
LEGACY = 'https://github.com/example/GameNight_Show/releases/download/app-android/GameNight-Show.apk'
API = 'https://api.github.com/repos/example/GameNight_Show/releases/latest'
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

APK_BYTES = os.urandom(300_000)
SHA = hashlib.sha256(APK_BYTES).hexdigest()
CORS = {'access-control-allow-origin': '*'}

def release(version='1.3.0', code=58, sha=SHA, size=len(APK_BYTES), meta=False, url=None, notes=None, body=None, digest=True, label=True, tag=None, apk=True, **extra):
    """Release come la pubblica l'utente (testo libero) con i file aggiunti dal workflow.
    meta=True: vecchio formato dei workflow fino alla 1.4 (dati della build nella descrizione)."""
    url = url or ASSET(version)
    m = {'version': version, 'versionCode': code, 'sha256': sha, 'size': size, 'date': '2026-10-10T09:00:00Z', 'notes': notes or ['Aggiornamenti dall’app', 'QR sulla TV'], 'minAndroid': '7.0'}
    b = body if body is not None else ('Testo scritto a mano' + (f'\n\n<!-- gamenight-apk: {json.dumps(m)} -->' if meta else ''))
    a = {'name': 'GameNight-Show.apk', 'size': len(APK_BYTES), 'browser_download_url': url, 'updated_at': '2026-10-10T09:01:00Z'}
    if digest: a['digest'] = 'sha256:' + sha
    if label: a['label'] = f'GameNight Show {version} · build {code}'
    assets = [a, {'name': 'GameNight-Show.json', 'size': 300, 'browser_download_url': url.replace('.apk', '.json')}] if apk else []
    return {'name': f'GameNight Show {version}', 'tag_name': tag or f'v{version}', 'body': b, 'published_at': '2026-10-10T09:00:00Z', 'draft': False, 'prerelease': False, 'assets': assets, **extra}

CAP = """
window.__calls = []; window.__ls = {};
const inst = JSON.parse(sessionStorage.getItem('__inst') || '{"version":"1.2.0","build":"40"}');
const plugins = JSON.parse(sessionStorage.getItem('__plugins') || '["App","Filesystem","FileOpener"]');
window.__file = null;
window.Capacitor = {
  isNativePlatform: () => true,
  isPluginAvailable: (n) => plugins.includes(n),
  addListener(p, e, cb) { (window.__ls[p + ':' + e] ||= []).push(cb); if (p === 'App' && e === 'backButton') window.__back = cb; return { remove: async () => { window.__ls[p + ':' + e] = (window.__ls[p + ':' + e] || []).filter((x) => x !== cb); } }; },
  async nativePromise(p, m, o) {
    window.__calls.push([p, m, o ? JSON.parse(JSON.stringify(o)) : {}]);
    const mode = sessionStorage.getItem('__dl') || 'ok';
    if (p === 'App' && m === 'getInfo') return { name: 'GameNight Show', id: 'it.gamenight.show', version: inst.version, build: inst.build };
    if (p === 'Filesystem' && m === 'downloadFile') {
      if (mode === 'fail') throw new Error('Unable to resolve host');
      const res = await fetch(o.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let buf = new Uint8Array(await res.arrayBuffer());
      if (mode === 'truncate') buf = buf.slice(0, buf.length >> 1);
      if (mode === 'empty') buf = new Uint8Array(0);
      if (mode === 'corrupt') { buf = buf.slice(); buf[10] ^= 255; }
      const fire = (d) => (window.__ls['Filesystem:progress'] || []).forEach((cb) => cb({ url: o.url, bytes: d, contentLength: buf.length }));
      fire(Math.floor(buf.length / 3)); await new Promise((r) => setTimeout(r, 150)); fire(buf.length);
      window.__file = buf;
      return { path: '/data/user/0/it.gamenight.show/cache/' + o.path };
    }
    if (p === 'Filesystem' && m === 'stat') { if (!window.__file) throw new Error('no file'); return { type: 'file', size: window.__file.length, uri: 'file:///data/cache/' + o.path }; }
    if (p === 'Filesystem' && m === 'readFile') { let s = ''; const b = window.__file; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return { data: btoa(s) }; }
    if (p === 'Filesystem' && m === 'deleteFile') { window.__file = null; return {}; }
    if (p === 'FileOpener') { if (!plugins.includes('FileOpener')) throw new Error('not implemented'); return {}; }
    return {};
  }
};
try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}
"""
INIT_PLAIN = "try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}"

class Net:
    def __init__(self): self.rel = release(); self.web = {'version': '1.3.0', 'notes': ['Novità dal sito']}; self.api_calls = 0; self.api_mode = 'ok'; self.apk_mode = 'ok'
async def routes(ctx, net):
    async def api(route):
        net.api_calls += 1
        if net.api_mode == 'offline': await route.abort('internetdisconnected'); return
        if net.api_mode == 'garbage': await route.fulfill(status=200, content_type='application/json', body='{"ciao": tru', headers=CORS); return
        if net.api_mode == '404': await route.fulfill(status=404, content_type='application/json', body='{}', headers=CORS); return
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(net.rel), headers=CORS)
    async def apk(route):
        if net.apk_mode == '404': await route.fulfill(status=404, body='', headers=CORS); return
        await route.fulfill(status=200, content_type='application/vnd.android.package-archive', body=APK_BYTES, headers=CORS)
    await ctx.route(API, api)
    await ctx.route('https://github.com/example/GameNight_Show/releases/download/**', apk)
    await common.route_links(ctx, SITE)
    await ctx.route(SITE + 'version.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(net.web), headers=CORS))
    # Nel browser il sito legge il suo version.json (non quello pubblico): stessa versione simulata
    await ctx.route(BASE + '/version.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(net.web), headers=CORS))

async def appctx(b, net, inst=None, plugins=None, dl='ok', w=390, h=844):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
    pre = "sessionStorage.setItem('__inst', %s); sessionStorage.setItem('__plugins', %s); sessionStorage.setItem('__dl', %s);" % (
        json.dumps(json.dumps(inst or {'version': '1.2.0', 'build': '40'})), json.dumps(json.dumps(plugins or ['App', 'Filesystem', 'FileOpener'])), json.dumps(dl))
    await ctx.add_init_script("if (!sessionStorage.getItem('__set')) { " + pre + " sessionStorage.setItem('__set', '1'); }")
    await ctx.add_init_script(CAP)
    await routes(ctx, net)
    pg = await ctx.new_page(); watch(pg, 'app')
    return ctx, pg

async def open_panel(pg):
    await pg.goto(BASE + '/index.html#aggiornamenti'); await pg.wait_for_selector('#stVerPanel .ver-grid')
    await wait_js(pg, "!document.querySelector('#stVerPanel .ver-state--busy')", 8000)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ------------------------------------------------ confronto versioni e dati
        net = Net()
        ctx, pg = await appctx(b, net)
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#joinForm')
        cases = [['1.10.0', '1.9.0', 1], ['1.2', '1.2.0', 0], ['1.3.0-beta.1', '1.3.0', -1], ['1.3.0-beta.2', '1.3.0-beta.10', -1], ['2.0.0', '10.0.0', -1], ['1.2.0', '1.2.1', -1], ['v1.4.0', '1.4.0', 0], ['abc', '1.0', None], ['', '1.0', None]]
        res = await pg.evaluate("(c) => import('/js/updates.js').then((m) => c.map(([a, b]) => m.semverCmp(a, b)))", [[a, b] for a, b, _ in cases])
        ok(res == [c[2] for c in cases], f'confronto semantico delle versioni {res}')
        pr = await pg.evaluate("""(args) => import('/js/updates.js').then((m) => args.map((j) => { const r = m.parseRelease(j, '%s'); return r && [r.version, r.versionCode, r.sha256.length, r.size, r.sizeMismatch]; }))""" % APK,
            [release(), release(url='https://evil.example/GameNight-Show.apk'), {'assets': 'x'}, release(digest=False, label=False),
             release(digest=False, label=False, body='<!-- gamenight-apk: {rotto -->'), release(meta=True, size=5, digest=False), release(sha='zz', code=-3),
             {'name': 'x', 'assets': []}, release(url=ASSET('9.9.9')), release(draft=True), release(prerelease=True),
             release(meta=True, digest=False, label=False, tag='app-android', url=LEGACY), release(url=ASSET('1.3.0').replace('example/GameNight_Show', 'altro/GameNight_Show'))])
        ok(pr[0] == ['1.3.0', 58, 64, len(APK_BYTES), False], f'release fatta a mano: versione dal tag, impronta di GitHub, build dall’etichetta {pr[0]}')
        ok(pr[1] is None and pr[2] is None and pr[7] is None, 'APK non ufficiale o release senza APK: ignorate')
        ok(pr[3] == ['1.3.0', None, 0, len(APK_BYTES), False] and pr[4] == ['1.3.0', None, 0, len(APK_BYTES), False], f'senza impronta né etichetta (o con dati rotti): versione dal tag, solo dimensione {pr[3]} {pr[4]}')
        ok(pr[5][4] is True and pr[6][1] is None and pr[6][2] == 0, f'dati non validi scartati uno per uno {pr[5]} {pr[6]}')
        ok(pr[8] is None and pr[9] is None and pr[10] is None and pr[12] is None, f'APK di un’altra release o di un altro repository, bozze e anteprime: ignorate {pr[8:11]} {pr[12]}')
        ok(pr[11] == ['1.3.0', 58, 64, len(APK_BYTES), False], f'vecchia release app-android (workflow fino alla 1.4) ancora letta {pr[11]}')
        up = ASSET('1.3.0').replace('example', 'ExAmple')
        cs = await pg.evaluate("(a) => import('/js/updates.js').then((m) => { const r = m.parseRelease(a[0], a[1]); return r && [r.version, r.url]; })", [release(url=up), APK])
        ok(cs and cs[0] == '1.3.0' and cs[1] == up, f'utente con maiuscole (MashaUP) e sito in minuscolo (mashaup.github.io): APK riconosciuta {cs}')
        src = await pg.evaluate("import('/js/updates.js').then((m) => [m.releaseSource('%s'), m.releaseSource('%s'), m.releaseSource('https://evil.example/x.apk')])" % (APK, LEGACY))
        ok(src[0]['api'] == API and src[1]['api'] == API and src[0]['apk'] == APK and src[2] is None, 'API dell’ultima release, anche con l’indirizzo vecchio dell’APK')
        pw = await pg.evaluate("(a) => import('/js/updates.js').then((m) => a.map((x) => m.parseWebVersion(x)))", [{'version': '1.3.0', 'notes': ['a', 3, '']}, {'version': 'boh'}, None])
        ok(pw[0]['notes'] == ['a'] and pw[1] is None and pw[2] is None, 'version.json controllato')
        await ctx.close()

        # ------------------------------------------------ app aggiornata
        net = Net(); ctx, pg = await appctx(b, net, inst={'version': '1.3.0', 'build': '58'})
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#joinForm'); await asyncio.sleep(1.2)
        ok(await pg.query_selector('#updBanner') is None, 'stessa versione e build: nessun avviso')
        await open_panel(pg)
        t = await pg.inner_text('#stVerPanel')
        ok('GameNight Show è aggiornato' in t and '1.3.0' in t and 'build 58' in t, 'pannello: “GameNight Show è aggiornato”')
        n0 = net.api_calls
        await pg.click('[data-ver="check"]'); await wait_js(pg, "!document.querySelector('#stVerPanel .ver-state--busy')")
        ok(net.api_calls == n0 + 1, 'Controlla aggiornamenti: un controllo vero, subito')
        await pg.screenshot(path='upd_uptodate.png', full_page=True)
        await ctx.close()

        # ------------------------------------------------ build più recente (stessa versione)
        net = Net(); ctx, pg = await appctx(b, net, inst={'version': '1.3.0', 'build': '50'})
        await open_panel(pg)
        ok('build più recente' in await pg.inner_text('#stVerPanel') and await pg.query_selector('[data-ver="download"]'), 'stessa versione ma build nuova: si può scaricare, senza avviso')
        await ctx.close()

        # ------------------------------------------------ versione nuova: avviso una volta, download, installazione
        net = Net(); ctx, pg = await appctx(b, net)
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#updBanner', timeout=8000)
        bt = await pg.inner_text('#updBanner')
        ok('È disponibile GameNight Show 1.3.0' in bt and 'Hai la 1.2.0' in bt, f'avviso: {bt.strip()[:90]}')
        await pg.screenshot(path='upd_banner.png')
        for _ in range(3):
            await pg.goto(BASE + '/play.html'); await asyncio.sleep(0.8)
        ok(net.api_calls == 1, f'niente richieste ripetute: {net.api_calls} richiesta a GitHub in 4 pagine')
        await pg.evaluate("localStorage.removeItem('gnr_upd_auto')")
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#updBanner')
        await pg.click('#updBanner .upd-x')
        await pg.evaluate("localStorage.removeItem('gnr_upd_auto')")
        await pg.goto(BASE + '/index.html'); await asyncio.sleep(1.5)
        ok(await pg.query_selector('#updBanner') is None, '“Più tardi”: l’avviso per la stessa versione non torna')
        net.rel = release(version='1.4.0', code=60); net.web = {'version': '1.4.0', 'notes': ['Aggiornamenti dall’app', 'QR sulla TV']}
        await pg.evaluate("localStorage.removeItem('gnr_upd_auto'); localStorage.removeItem('gnr_release')")
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#updBanner', timeout=8000)
        ok('1.4.0' in await pg.inner_text('#updBanner'), 'versione ancora più nuova: l’avviso torna')
        await pg.click('[data-updopen]'); await pg.wait_for_selector('#stVerPanel [data-ver="download"]', timeout=8000)
        t = await pg.inner_text('#stVerPanel')
        ok('Aggiornamenti dall’app' in t and '293 KB' in t and '1.4.0' in t and 'Android 7.0' in t, 'pannello: novità, dimensione, versione e requisiti')
        await pg.screenshot(path='upd_available.png', full_page=True)
        await pg.click('[data-ver="download"]')
        await pg.wait_for_selector('.ver-bar', timeout=3000); ok(True, 'avanzamento del download')
        await pg.wait_for_selector('[data-ver="install"]', timeout=8000)
        t = await pg.inner_text('#stVerPanel')
        ok('Download completato e controllato (SHA-256 e dimensione)' in t, 'download controllato con SHA-256')
        await pg.screenshot(path='upd_ready.png', full_page=True)
        await pg.click('[data-ver="install"]'); await asyncio.sleep(0.3)
        calls = await pg.evaluate('window.__calls')
        op = [c for c in calls if c[0] == 'FileOpener']
        ok(op and op[-1][2]['mimeType'] == 'application/vnd.android.package-archive' and op[-1][2]['path'].endswith('GameNight-Show-aggiornamento.apk'), 'apre l’installazione di Android sul file controllato')
        t = await pg.inner_text('#stVerPanel')
        ok('Installazione da confermare' in t and 'installato' not in t.lower().replace('installazione', ''), 'dice “da confermare”, mai “installato”')
        ok('Consenti da questa fonte' in t, 'spiega il permesso “installa app sconosciute”')
        dl = [c for c in calls if c[1] == 'downloadFile'][-1][2]
        ok(dl['url'] == ASSET('1.4.0') and dl['directory'] == 'CACHE', 'scarica solo l’APK della release ufficiale, nella memoria dell’app')
        await ctx.close()

        # ------------------------------------------------ errori del download
        for mode, apk_mode, rel, expect in [('corrupt', 'ok', None, 'SHA-256 non superato'), ('truncate', 'ok', None, 'incompleto'), ('empty', 'ok', None, 'vuoto'),
                                           ('ok', '404', None, 'Download non riuscito'), ('fail', 'ok', None, 'Download non riuscito'),
                                           ('ok', 'ok', release(sha=hashlib.sha256(b'altro').hexdigest()), 'SHA-256 non superato')]:
            net = Net(); net.apk_mode = apk_mode
            if rel: net.rel = rel
            ctx, pg = await appctx(b, net, dl=mode)
            await open_panel(pg)
            await pg.click('[data-ver="download"]')
            await pg.wait_for_selector('#stVerPanel .ver-state--err', timeout=8000)
            t = await pg.inner_text('#stVerPanel'); calls = await pg.evaluate('window.__calls')
            ok(expect in t and not await pg.query_selector('[data-ver="install"]') and not any(c[0] == 'FileOpener' for c in calls), f'download {mode}/{apk_mode}{"/hash sbagliato" if rel else ""}: “{expect}”, niente installazione')
            if mode in ('corrupt', 'truncate', 'empty'): ok(await pg.evaluate('window.__file === null'), f'  file {mode} cancellato')
            if mode == 'corrupt': await pg.screenshot(path='upd_hash.png', full_page=True)
            await ctx.close()

        # ------------------------------------------------ rete assente, dati non validi, APK in preparazione, app vecchia
        for mode, expect in [('offline', 'non risponde'), ('garbage', 'non sono valide'), ('404', 'Non c’è ancora')]:
            net = Net(); net.api_mode = mode
            ctx, pg = await appctx(b, net)
            await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#joinForm'); await asyncio.sleep(1)
            ok(await pg.query_selector('#updBanner') is None and await pg.is_visible('#joinForm'), f'{mode}: l’app parte normalmente, nessun avviso')
            await open_panel(pg)
            t = await pg.inner_text('#stVerPanel')
            msg = await pg.inner_text('#stVerPanel .ver-status')
            ok(expect in msg and not await pg.query_selector('[data-ver="download"]'), f'{mode}: errore spiegato, niente download ({msg.strip()[:90]})')
            await ctx.close()
        net = Net(); net.web = {'version': '1.4.0'}; ctx, pg = await appctx(b, net, inst={'version': '1.3.0', 'build': '58'})
        await open_panel(pg)
        ok('in preparazione' in await pg.inner_text('#stVerPanel') and not await pg.query_selector('[data-ver="download"]'), 'sito già alla 1.4.0, APK no: “in preparazione”')
        await ctx.close()
        net = Net(); ctx, pg = await appctx(b, net, plugins=['App', 'Filesystem'])
        await open_panel(pg)
        a = await pg.query_selector('#stVerPanel a.btn[href]')
        ok(a and await a.get_attribute('href') == ASSET('1.3.0') and 'nel browser' in await a.inner_text(), 'APK vecchia senza componente di installazione: scarica nel browser')
        await ctx.close()
        # release appena pubblicata a mano, APK ancora in costruzione: "in preparazione", non un errore
        net = Net(); net.rel = release(version='1.4.0', apk=False); net.web = {'version': '1.4.0'}
        ctx, pg = await appctx(b, net, inst={'version': '1.3.0', 'build': '58'})
        await open_panel(pg)
        t = await pg.inner_text('#stVerPanel')
        ok('in preparazione' in t and 'non sono valide' not in t and not await pg.query_selector('[data-ver="download"]'), f'release senza APK (workflow in corso): “in preparazione” ({t.strip()[:80]})')
        await ctx.close()

        # ------------------------------------------------ sito nel browser (non app)
        net = Net()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}); await ctx.add_init_script(INIT_PLAIN); await routes(ctx, net)
        pg = await ctx.new_page(); watch(pg, 'web')
        await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#hubApp .ver-grid'); await wait_js(pg, "!document.querySelector('#hubApp .ver-state--busy')")
        t = await pg.inner_text('#hubApp')
        ok('App Android' in t and 'App Android stabile: versione 1.3.0' in t and 'Cerca aggiornamento' in t, 'home del sito: riquadro “App Android” con “Cerca aggiornamento”')
        ok(await pg.get_attribute('#hubApp a[data-ver="link"]', 'href') == ASSET('1.3.0') and await pg.query_selector('#hubApp .ver-qr svg'), 'link ufficiale e QR per il telefono')
        await pg.screenshot(path='upd_web_home.png', full_page=True)
        await ctx.close()
        for ua, expect_ok, tag in [('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', True, 'android13'),
                                    ('Mozilla/5.0 (Linux; Android 6.0; Nexus 5) AppleWebKit/537.36 Chrome/90 Mobile Safari/537.36', False, 'android6'),
                                    ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', False, 'iphone')]:
            net = Net()
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, user_agent=ua); await ctx.add_init_script(INIT_PLAIN); await routes(ctx, net)
            pg = await ctx.new_page(); watch(pg, tag)
            await pg.goto(BASE + '/scarica.html'); await pg.wait_for_selector('.dl-steps')
            if tag != 'iphone': await wait_js(pg, "!document.querySelector('#dlPanel .ver-state--busy')")
            link = await pg.query_selector('#dlPanel a[data-ver="link"]')
            t = await pg.inner_text('main')
            if tag == 'android13': ok(link and await link.get_attribute('href') == ASSET('1.3.0') and 'Come si installa' in t and 'SHA-256' in t and 'Novità della 1.3.0' in t, 'scarica.html su Android: download ufficiale, istruzioni, novità, impronta')
            if tag == 'android6': ok(not link and 'richiede Android 7.0' in t, 'scarica.html su Android 6: dispositivo non compatibile, niente download')
            if tag == 'iphone': ok('Su iPhone' in t, 'scarica.html su iPhone: spiega di usare il sito')
            r = await pg.evaluate(common.__dict__.get('OVF', 'null')) if False else None
            sw = await pg.evaluate('document.documentElement.scrollWidth <= innerWidth')
            ok(sw, f'scarica.html {tag}: niente scorrimento a destra')
            await pg.screenshot(path=f'upd_page_{tag}.png', full_page=True)
            await ctx.close()

        # ------------------------------------------------ TV: QR per installare su un altro dispositivo
        for w, h in [(1280, 720), (1920, 1080)]:
            net = Net()
            ctx = await b.new_context(viewport={'width': w, 'height': h}); await ctx.add_init_script(INIT_PLAIN); await routes(ctx, net)
            pg = await ctx.new_page(); watch(pg, 'tv')
            await pg.goto(BASE + '/host.html'); await pg.wait_for_selector('#installTvBtn')
            await pg.focus('#installTvBtn'); await pg.keyboard.press('Enter')
            await pg.wait_for_selector('.install-qr-code svg')
            await wait_js(pg, "document.querySelector('#iqVer').textContent.includes('1.3.0')")
            foc = await pg.evaluate("document.activeElement.id")
            size = await pg.evaluate("(() => { const r = document.querySelector('.install-qr-code svg').getBoundingClientRect(); return [r.width, r.height, r.bottom <= innerHeight, r.right <= innerWidth]; })()")
            ok(foc == 'iqClose' and size[0] >= 300 and size[2] and size[3], f'TV {w}×{h}: QR {int(size[0])} px, tutto nello schermo, fuoco su “Chiudi”')
            dec = await pg.evaluate("""(async () => {
              const svg = document.querySelector('.install-qr-code svg').outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
              const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
              const cv = document.createElement('canvas'); cv.width = 420; cv.height = 420; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 420, 420);
              const jsQR = (await import('/vendor/jsqr.js')).default; const r = jsQR(cx.getImageData(0, 0, 420, 420).data, 420, 420); return r && r.data; })()""")
            ok(dec == BASE + '/scarica.html', f'il QR si legge e porta alla pagina stabile di download ({dec})')
            await pg.screenshot(path=f'upd_tv_{w}.png')
            await pg.keyboard.press('Tab'); ok(await pg.evaluate("document.activeElement.id") == 'iqClose', 'Tab: il fuoco resta nella finestra')
            await pg.keyboard.press('g'); await asyncio.sleep(0.2)
            await pg.keyboard.press('Escape'); await asyncio.sleep(0.2)
            ok(await pg.query_selector('.install-qr') is None and await pg.evaluate("document.activeElement.id") == 'installTvBtn', 'Esc chiude e il fuoco torna al pulsante')
            await ctx.close()
        # dentro la stanza: Strumenti › App sui telefoni (QR nell'app: punta al sito pubblico)
        net = Net(); ctx, pg = await appctx(b, net, w=1280, h=720)
        await pg.goto(BASE + '/host.html'); await pg.wait_for_selector('#createBtn')
        if await pg.is_visible('#groupName'): await pg.fill('#groupName', 'Gruppo QR')
        await pg.click('#createBtn'); await pg.wait_for_selector('.lobby')
        await pg.click('#hdrTools'); await pg.click('#tlInstall'); await pg.wait_for_selector('.install-qr-url')
        u = await pg.inner_text('.install-qr-url')
        ok(u == SITE.replace('https://', '') + 'scarica.html', f'nell’app il QR punta al sito pubblico: {u}')
        await ctx.close()
        await b.close()
    real = [e for e in errs if 'net::ERR_INTERNET_DISCONNECTED' not in e and 'Failed to load resource' not in e]
    print('ERRORI:', real or 'nessuno')
    print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
