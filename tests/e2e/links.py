# Link ufficiali (1.5): icone GitHub e Discord nel footer, Ko-fi, "Community e supporto",
# configurazione remota nell'app, riserva offline, link spenti o non validi, go.html.
import asyncio, json, os, copy
from playwright.async_api import async_playwright
import common
from common import watch, errs, HERE

SITE_BASE = 'http://localhost:8765'
APP_BASE = 'http://localhost:8766'
SITE = 'https://example.github.io/GameNight_Show/'
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
# Configurazione di prova fissa (copia di config/links.json della 1.5.0): il file vero si può cambiare
# (nuovo invito, link spenti) senza rompere le prove. Che il file vero sia valido lo controllano check.mjs e links.test.mjs.
CFG_TEXT = open(os.path.join(HERE, 'fixtures', 'links.json'), encoding='utf-8').read()
CFG = json.loads(CFG_TEXT)
GH, DC, KF = CFG['links']['github']['url'], CFG['links']['discord']['url'], CFG['links']['kofi']['url']
INIT = "try { localStorage.setItem('gnr_tour_off','1'); localStorage.setItem('gnr_tour_phone','1'); localStorage.setItem('gnr_lite','off'); localStorage.setItem('gnr_intro_done','1'); } catch (e) {}"
CAP = "window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => false, addListener() { return { remove() {} }; }, nativePromise() { return Promise.resolve({}); } };"

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def cfg(**changes):
    c = copy.deepcopy(CFG)
    for k, v in changes.items():
        if k == 'updated': c['updated'] = v
        elif v is None: c['links'].pop(k, None)
        else: c['links'][k] = {**c['links'].get(k, {}), **v}
    return json.dumps(c)

def serve(body, status=200):
    return lambda r: r.fulfill(status=status, content_type='application/json', body=body, headers={'access-control-allow-origin': '*'})

async def ctx_for(b, app=False, w=1280, h=800, theme=None):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block', is_mobile=w < 700, has_touch=w < 700)
    await ctx.add_init_script(INIT + (CAP if app else '') + (f"try {{ localStorage.setItem('gnr_theme','{theme}'); localStorage.setItem('gnr_theme_v','2'); }} catch (e) {{}}" if theme else ''))
    await ctx.route('**/config/links.json*', serve(CFG_TEXT))
    await ctx.route('https://github.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<h1>github</h1>'))
    await ctx.route('https://discord.gg/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<h1>discord</h1>'))
    if app:
        await ctx.route(SITE + 'version.json*', serve('{"version":"1.0.0"}'))
        await ctx.route('https://api.github.com/**', serve('{}', 404))
    return ctx

async def icons(pg):
    await pg.wait_for_selector('.foot .link-icons a', state='attached', timeout=6000)
    return await pg.evaluate("""[...document.querySelectorAll('.foot .link-icons a')].map(a => {
      const r = a.getBoundingClientRect(), s = a.querySelector('svg').getBoundingClientRect();
      return { id: a.dataset.linkId, href: a.getAttribute('href'), label: a.getAttribute('aria-label'), title: a.title,
               target: a.target, rel: a.rel, w: r.width, h: r.height, sw: s.width, sh: s.height, color: getComputedStyle(a).color };
    })""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ---------------------------------------------------------------- sito, computer
        ctx = await ctx_for(b)
        pg = await ctx.new_page(); watch(pg, 'site')
        await pg.goto(SITE_BASE + '/index.html')
        ic = await icons(pg)
        ok([i['id'] for i in ic] == ['github', 'discord'], f'footer: GitHub e Discord, in quest’ordine {[i["id"] for i in ic]}')
        ok(ic[0]['href'] == GH and ic[1]['href'] == DC, 'indirizzi presi da config/links.json')
        ok(all(16 <= i['sw'] <= 20 and 16 <= i['sh'] <= 20 for i in ic), f'icone di 16–20 px {[(i["sw"], i["sh"]) for i in ic]}')
        ok(all(i['w'] >= 32 and i['h'] >= 32 for i in ic), 'area da toccare abbastanza grande')
        ok(all(i['target'] == '_blank' and 'noopener' in i['rel'] and 'noreferrer' in i['rel'] for i in ic), 'nuova scheda, senza accesso alla pagina di origine')
        ok(all('nuova scheda' in i['label'] and i['title'] in ('GitHub', 'Discord') for i in ic), f'etichette accessibili e suggerimenti {[i["label"] for i in ic]}')
        ok(await pg.get_attribute('.foot .link-icons', 'aria-label') == 'GameNight Show in rete', 'gruppo di icone con nome')
        # tastiera: si arriva alle icone con Tab e il contorno del focus si vede
        found = None
        for _ in range(120):
            await pg.keyboard.press('Tab')
            found = await pg.evaluate("document.activeElement && document.activeElement.dataset.linkId || null")
            if found == 'github': break
        st = await pg.evaluate("(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, parseFloat(s.outlineWidth)]; })()")
        ok(found == 'github' and st[0] != 'none' and st[1] >= 2, f'raggiungibile con Tab, focus visibile {found} {st}')
        await pg.keyboard.press('Tab')
        ok(await pg.evaluate("document.activeElement.dataset.linkId") == 'discord', 'Tab passa a Discord')
        # passaggio del mouse: cambia colore
        before = ic[1]['color']
        await pg.mouse.move(0, 0); await pg.hover('.foot .link-icons a[data-link-id="discord"]'); await asyncio.sleep(0.3)
        after = await pg.evaluate("getComputedStyle(document.querySelector('.foot .link-icons a[data-link-id=discord]')).color")
        ok(before != after, f'stato al passaggio del mouse {before} → {after}')
        await pg.locator('.foot').screenshot(path=os.path.join(HERE, 'out', 'links_foot_night.png'))
        # Ko-fi: pulsante nella home, link nel footer
        kofi = await pg.evaluate("[...document.querySelectorAll('[data-link=kofi]')].map(a => [a.getAttribute('href'), a.hidden])")
        ok(len(kofi) == 3 and all(h == KF and not hid for h, hid in kofi), f'Ko-fi da config/links.json in tutti i punti {kofi}')
        # nessun link ufficiale sbagliato o doppio in tutta la pagina
        bad = await pg.evaluate("""(allowed) => [...document.querySelectorAll('a[href^="https://"]')].map(a => a.href).filter(h => /github\\.com|discord|ko-fi/.test(h) && !allowed.includes(h))""", [GH, DC, KF, CFG['links']['docs']['url'], CFG['links']['bugs']['url'], CFG['links']['ideas']['url']])
        ok(not bad, f'nessun indirizzo diverso da quelli configurati {bad}')
        # Community e supporto (Profilo e app)
        await pg.click('.side [data-nav="altro"]'); await pg.wait_for_selector('.tile--links .link-row')
        rows = await pg.evaluate("[...document.querySelectorAll('.tile--links .link-row')].map(a => a.dataset.linkId)")
        ok(rows == ['github', 'discord', 'docs', 'bugs', 'ideas'], f'elenco completo, senza Ko-fi (ha il suo riquadro) e senza doppioni {rows}')
        ok('Link' in (await pg.inner_text('#linksStatus')), 'data della configurazione mostrata')
        await pg.locator('.tile--links').screenshot(path=os.path.join(HERE, 'out', 'links_list.png'))
        # cambio lingua: etichette tradotte senza ricaricare
        await pg.evaluate("import('./js/i18n.js').then(m => m.setLang('en', { reload: false }))"); await asyncio.sleep(0.6)
        lab = await pg.get_attribute('.foot .link-icons a[data-link-id="github"]', 'aria-label')
        ok(lab == 'GitHub (opens in a new tab)', f'etichette in inglese {lab}')
        ok('Report a problem' in await pg.inner_text('.tile--links'), 'elenco in inglese')
        await pg.evaluate("import('./js/i18n.js').then(m => m.setLang('it', { reload: false }))")
        # Riserva: il file non si legge più (rete giù) → restano i link dell'ultima volta
        await pg.route('**/config/links.json*', lambda r: r.abort())
        await pg.reload(); ic2 = await icons(pg)
        ok([i['href'] for i in ic2] == [GH, DC], 'offline: link dall’ultima copia buona salvata')
        await ctx.close()

        # ---------------------------------------------------------------- sito, tema chiaro e telefono
        ctx = await ctx_for(b, w=360, h=780, theme='day')
        pg = await ctx.new_page(); watch(pg, 'day')
        await pg.goto(SITE_BASE + '/index.html'); ic = await icons(pg)
        bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
        ok(ic[0]['color'] != bg, f'tema chiaro: icone visibili {ic[0]["color"]} su {bg}')
        ow = await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        ok(ow, 'telefono 360 px: niente scorrimento laterale')
        await pg.locator('.foot').scroll_into_view_if_needed()
        await pg.locator('.foot').screenshot(path=os.path.join(HERE, 'out', 'links_foot_day_phone.png'))
        await ctx.close()

        # ---------------------------------------------------------------- link spento, indirizzi non validi
        ctx = await ctx_for(b)
        await ctx.route('**/config/links.json*', serve(cfg(discord={'enabled': False}, kofi={'url': 'javascript:alert(1)'}, docs={'url': 'https://evil.example/x'}, bugs={'url': 'http://github.com/x'})))
        pg = await ctx.new_page(); watch(pg, 'off')
        await pg.goto(SITE_BASE + '/index.html'); ic = await icons(pg)
        ok([i['id'] for i in ic] == ['github'], f'Discord spento: niente icona {[i["id"] for i in ic]}')
        await asyncio.sleep(0.3)
        kofi = await pg.evaluate("[...document.querySelectorAll('[data-link=kofi]')].map(a => [a.getAttribute('href'), a.hidden])")
        ok(all(h is None and hid for h, hid in kofi), f'Ko-fi non valido: nessun pulsante verso il nulla {kofi}')
        ok(await pg.evaluate("document.querySelectorAll('.home-donate').length > 0 && [...document.querySelectorAll('.home-donate')].every(s => s.hidden)"), 'riquadro "Sostieni" nascosto senza un link valido')
        await pg.click('.side [data-nav="altro"]'); await pg.wait_for_selector('.tile--links .link-row')
        rows = await pg.evaluate("[...document.querySelectorAll('.tile--links .link-row')].map(a => a.dataset.linkId)")
        ok(rows == ['github', 'ideas'], f'scartati javascript:, http: e domini non ammessi {rows}')
        ok(not await pg.evaluate("[...document.querySelectorAll('a')].some(a => /^(javascript|http):|evil/.test(a.getAttribute('href') || ''))"), 'nessun indirizzo pericoloso nella pagina')
        # go.html: id spento → messaggio ed elenco; id sconosciuto o indirizzo → nessun redirect
        for q in ['discord', 'https%3A%2F%2Fevil.example', 'nonesiste', '']:
            await pg.goto(SITE_BASE + f'/go.html?to={q}'); await pg.wait_for_selector('#goList:not([hidden]) .link-row', timeout=5000)
            ok(pg.url.startswith(SITE_BASE) and 'non è disponibile' in await pg.inner_text('#goMsg'), f'go.html?to={q or "(vuoto)"}: resta qui e mostra gli altri link')
        await ctx.close()

        ctx = await ctx_for(b)
        pg = await ctx.new_page(); watch(pg, 'go')
        await pg.goto(SITE_BASE + '/go.html?to=discord'); await pg.wait_for_url(DC + '*', timeout=6000)
        ok(pg.url.rstrip('/') == DC.rstrip('/'), f'go.html?to=discord porta all’invito attuale ({pg.url})')
        await pg.goto(SITE_BASE + '/go.html?to=github'); await pg.wait_for_url('https://github.com/**', timeout=6000)
        ok(pg.url == GH, 'go.html?to=github porta al repository')
        await ctx.close()

        # ---------------------------------------------------------------- app Android: copia remota
        NEW = 'https://discord.gg/NuovoInvito2026'
        ctx = await ctx_for(b, app=True, w=390, h=844)
        remote = {'body': cfg(discord={'url': NEW}, updated='2099-01-01'), 'status': 200, 'hits': 0}
        async def remote_route(r):
            remote['hits'] += 1
            await r.fulfill(status=remote['status'], content_type='application/json', body=remote['body'], headers={'access-control-allow-origin': '*'})
        await ctx.route(SITE + 'config/links.json*', remote_route)
        pg = await ctx.new_page(); watch(pg, 'app')
        await pg.goto(APP_BASE + '/index.html')
        await pg.wait_for_selector(f'.foot .link-icons a[href="{NEW}"]', state='attached', timeout=8000)
        ok(True, 'app: invito Discord aggiornato dalla copia pubblicata, senza nuova versione')
        saved = await pg.evaluate("JSON.parse(localStorage.getItem('gnr_links') || 'null')")
        ok(saved and saved['data']['links']['discord']['url'] == NEW, 'copia remota buona salvata sul telefono')
        hits = remote['hits']
        await pg.reload(); await pg.wait_for_selector(f'.foot .link-icons a[href="{NEW}"]', state='attached', timeout=8000); await asyncio.sleep(1)
        ok(remote['hits'] == hits, 'riaprendo l’app non la richiede di nuovo (niente richieste inutili)')
        # "Cerca aggiornamento" ricontrolla anche i link, subito
        NEW2 = 'https://discord.gg/AncoraNuovo'
        remote['body'] = cfg(discord={'url': NEW2}, updated='2099-01-02')
        await pg.click('.tabbar [data-nav="altro"]'); await pg.click('[data-view="altro"] [data-open="updates"] >> visible=true')
        await pg.wait_for_selector(f'.link-icons a[href="{NEW2}"]', state='attached', timeout=8000)
        ok(remote['hits'] > hits, '"Cerca aggiornamento" aggiorna anche i link')
        # server giù o file rotto: si tiene l'ultima copia buona
        remote['status'] = 500
        await pg.evaluate("import('./js/links.js').then(m => m.refreshLinks())"); await asyncio.sleep(0.5)
        ok(await pg.get_attribute('.foot .link-icons a[data-link-id="discord"]', 'href') == NEW2, 'server non disponibile: restano gli ultimi link buoni')
        log = await pg.evaluate("JSON.parse(localStorage.getItem('gnr_errlog') || '[]').filter(e => e.kind === 'links').map(e => e.msg)")
        ok(any('http_500' in m for m in log), f'errore annotato nel registro, senza avvisi a schermo {log}')
        await ctx.close()

        for name, body, status in [('JSON rotto', '{"schema":', 200), ('irraggiungibile', '', 503), ('altro progetto', cfg(updated='2099-01-01').replace('gamenight-show', 'altro'), 200)]:
            ctx = await ctx_for(b, app=True, w=390, h=844)
            await ctx.route(SITE + 'config/links.json*', serve(body, status))
            pg = await ctx.new_page(); watch(pg, 'app2')
            await pg.goto(APP_BASE + '/index.html'); ic = await icons(pg); await asyncio.sleep(0.6); ic = await icons(pg)
            ok([i['href'] for i in ic] == [GH, DC], f'app, copia remota "{name}": restano i link inclusi nell’app')
            await ctx.close()

        await b.close()
    # 404 = finta API delle release (nessuna release nell'ambiente di prova); 500/503 = server giù simulato
    expected = ('ERR_FAILED', 'status of 404', 'status of 500', 'status of 503', 'net::ERR')
    real = [e for e in errs if not any(x in e for x in expected)]
    print('ERRORI:', real or 'nessuno'); print('FALLITI:', fails or 'nessuno')
    if fails or real: raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
