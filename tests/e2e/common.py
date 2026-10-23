import asyncio, os, json, urllib.request
if os.path.isdir('/opt/pw-browsers'): os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
BASE = os.environ.get('GN_BASE', 'http://localhost:8765')

# I test controllano i testi in italiano: i browser di prova partono in italiano (locale it-IT),
# salvo i test che indicano un'altra lingua (tests/e2e/i18n.py).
try:
    from playwright.async_api import Browser as _Browser
    _nc, _np = _Browser.new_context, _Browser.new_page
    async def _new_context(self, *a, **kw):
        kw.setdefault('locale', 'it-IT')
        return await _nc(self, *a, **kw)
    async def _new_page(self, *a, **kw):
        kw.setdefault('locale', 'it-IT')
        return await _np(self, *a, **kw)
    _Browser.new_context, _Browser.new_page = _new_context, _new_page
except Exception:  # Playwright non installato: i test non partono comunque
    pass
HERE = os.path.dirname(os.path.abspath(__file__))
errs = []
NO_TOURS = True


def watch(pg, n):
    pg.on('pageerror', lambda e: errs.append(f'[{n}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{n}] {m.text}') if m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_INTERNET' not in m.text else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))


def db():
    return json.loads(urllib.request.urlopen(BASE + '/__dump').read())


async def tv(b, seats=3, group='Amici del giovedì', w=1280, h=720):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True)
    if NO_TOURS: await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); } catch (e) {}")
    host = await ctx.new_page(); watch(host, 'tv')
    await host.goto(BASE + '/host.html'); await host.wait_for_selector('#createBtn')
    for _ in range(8 - seats):
        await host.click('.step-btn[data-step="-1"]')
    if await host.is_visible('#groupName'):
        await host.fill('#groupName', group)
    await host.click('#createBtn'); await host.wait_for_selector('.lobby')
    return ctx, host, host.url.split('room=')[1]


async def phone(b, n):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=2)
    if NO_TOURS: await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); } catch (e) {}")
    ph = await ctx.new_page(); watch(ph, n)
    return ctx, ph


async def join(b, code, name, pick):
    ctx, ph = await phone(b, name)
    await ph.goto(f'{BASE}/play.html?room={code}'); await ph.wait_for_selector('#nameInput')
    await ph.fill('#nameInput', name); await ph.click(f'.av-opt[data-pick="{pick}"]'); await ph.click('#joinBtn')
    await ph.wait_for_selector('#waitList')
    return ctx, ph


async def set_range(ph, sel, v):
    await ph.evaluate(f"(()=>{{const e=document.querySelector('{sel}'); e.value={v}; e.dispatchEvent(new Event('input',{{bubbles:true}}));}})()")


async def vote(ph, ov, k=3, mvp=0, crits=None, na=(), comment=None, send=True):
    await ph.wait_for_selector('#sendVote')
    await set_range(ph, '#overall', ov)
    rows = crits if crits is not None else await ph.evaluate("[...document.querySelectorAll('.pips-row')].map(r=>r.dataset.crit)")
    for crit in rows:
        if crit in na:
            await ph.click(f'[data-na="{crit}"]')
        else:
            await ph.click(f'.pips-row[data-crit="{crit}"] [data-k="{k}"]')
    if await ph.query_selector('.mvp-btn'):
        await ph.click(f'.mvp-btn >> nth={mvp}')
    if comment:
        await ph.fill('#voteComment', comment)
    if send:
        await ph.click('#sendVote'); await ph.wait_for_selector('#editVote')


async def wait_js(pg, expr, timeout=8000):
    """Come wait_for_function, ma senza eval nella pagina (che la Content-Security-Policy blocca)."""
    end = asyncio.get_event_loop().time() + timeout / 1000
    while True:
        try:
            if await pg.evaluate(expr):
                return True
        except Exception:
            pass
        if asyncio.get_event_loop().time() > end:
            raise TimeoutError(f'wait_js scaduto: {expr[:80]}')
        await asyncio.sleep(0.2)


def aid_of(code):
    """Codice dell'armadio collegato alla stanza."""
    return db()['rooms'][code]['meta']['armadioId']


def armlib(code):
    return f"armadi/{aid_of(code)}/library"


async def photo_ok(pg, rotate=0):
    """Finestra "Controlla la foto": eventualmente ruota, poi "Usa la foto"."""
    await pg.wait_for_selector('#peOk', timeout=5000)
    for _ in range(abs(rotate)):
        await pg.click('#peRight' if rotate > 0 else '#peLeft')
    await pg.click('#peOk')


LINKS_FILE = os.path.abspath(os.path.join(HERE, '..', '..', 'config', 'links.json'))


async def route_links(ctx, site):
    """App simulata: la copia remota dei link (sul sito pubblico d'esempio) è il file del repository."""
    body = open(LINKS_FILE, encoding='utf-8').read()
    await ctx.route(site + 'config/links.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=body, headers={'access-control-allow-origin': '*'}))
