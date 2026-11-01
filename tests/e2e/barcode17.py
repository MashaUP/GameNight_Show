# 1.11 · Codice a barre nell'armadio (richiesta 84), con le regole vere (porta 8767) e un proxy BGG simulato.
# Chromium senza BarcodeDetector: si usa l'inserimento delle cifre, la stessa strada di chi non ha la fotocamera.
# Controlla: codice con cifra di controllo sbagliata rifiutato; codice salvato nella scheda; senza nome chiede il
# nome (BGG non cerca per codice); con il nome cerca su BGG e la scheda va confermata; abbinamento ricordato sul
# dispositivo; stesso codice nello stesso armadio = "è già di …"; in un altro armadio la scheda si apre da sola
# ma va sempre confermata; niente sovrascritture dei campi scritti a mano.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, json, re
from playwright.async_api import async_playwright
from common import *
# Stessi strumenti di data16.py (proxy BGG simulato, dispositivi, letture del database)
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)
DAY = 86400000


def raw(op, path, value=None, base=None):
    body = json.dumps({'op': op, 'path': path, 'value': value, 'raw': True}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request((base or BASE) + '/__db', data=body, method='POST')).read())


def dump(base=None):
    return json.loads(urllib.request.urlopen((base or BASE) + '/__dump').read())


PROMPT = {'text': ''}


def watch2(pg, n):
    pg.on('pageerror', lambda e: errs.append(f'[{n}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{n}] {m.text}') if m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_INTERNET' not in m.text and 'bgg.test' not in m.text and '429' not in m.text else None)
    def dlg(d):
        if d.type == 'prompt': asyncio.ensure_future(d.accept(PROMPT['text']))
        else: asyncio.ensure_future(d.accept())
    pg.on('dialog', dlg)


INIT = "try{localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off');localStorage.setItem('gnr_intro_done','1')}catch(e){}"

SERVICES = "export const BGG_PROXY_URL = 'https://bgg.test.example';\nexport const LINKS_URL = '';\n"
BGG_SEARCH = {'ok': True, 'q': 'azul', 'total': 2, 'items': [
    {'id': 230802, 'name': 'Azul', 'year': 2017, 'type': 'boardgame', 'isExpansion': False, 'minPlayers': 2, 'maxPlayers': 4, 'time': 45, 'weight': 1.76},
    {'id': 287954, 'name': 'Azul: Summer Pavilion', 'year': 2019, 'type': 'boardgame', 'isExpansion': False}]}
BGG_THING = {'ok': True, 'items': [{'id': 230802, 'name': 'Azul', 'year': 2017, 'minPlayers': 2, 'maxPlayers': 4, 'time': 45, 'weight': 1.76, 'categories': ['Abstract Strategy', 'Puzzle'], 'bestPlayers': [2], 'thumb': 'https://bgg.test.example/azul.png'}]}
STATE = {'rate': False}


async def route_bgg(ctx):
    async def svc(route):
        await route.fulfill(status=200, content_type='text/javascript', body=SERVICES)
    await ctx.route('**/js/services.js*', svc)

    async def proxy(route):
        url = route.request.url
        h = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
        if STATE['rate']:
            await route.fulfill(status=429, headers={**h, 'Retry-After': '60'}, body=json.dumps({'ok': False, 'error': 'rate_limited'})); return
        if '/search' in url: await route.fulfill(status=200, headers=h, body=json.dumps(BGG_SEARCH)); return
        if '/thing' in url: await route.fulfill(status=200, headers=h, body=json.dumps(BGG_THING)); return
        if '/health' in url: await route.fulfill(status=200, headers=h, body=json.dumps({'ok': True, 'token': True, 'version': 'test'})); return
        if url.endswith('.png'): await route.fulfill(status=404, body=''); return
        await route.fulfill(status=404, headers=h, body=json.dumps({'ok': False, 'error': 'not_found'}))
    await ctx.route('https://bgg.test.example/**', proxy)


async def device(b, n, base=None, w=1280, h=860, mobile=False, bgg=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    await ctx.add_init_script(INIT)
    if bgg: await route_bgg(ctx)
    pg = await ctx.new_page(); watch2(pg, n)
    return ctx, pg


async def close_sheets(pg):
    for _ in range(5):
        if await pg.locator('.overlay').count(): await pg.keyboard.press('Escape'); await asyncio.sleep(0.15)



CODE = '4006381333931'


async def scan(pg, code):
    await pg.click('#edScan'); await pg.wait_for_selector('#barManual')
    await pg.fill('#barManual', code); await pg.click('#barForm button[type="submit"]')
    await asyncio.sleep(0.4)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        co, O = await device(b, 'own', bgg=True)
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#tileArm')
        await O.click('#tileArm'); await O.click('#armNew'); await O.fill('#naName', 'Casa Codici'); await O.click('#naGo')
        await O.wait_for_selector('#edForm', timeout=10000)
        aid = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)

        # 1. Codice sbagliato: rifiutato, la finestra resta aperta
        await O.click('#edScan'); await O.wait_for_selector('#barManual')
        ok(await O.is_visible('#barManual'), 'senza fotocamera: si possono scrivere le cifre')
        await O.fill('#barManual', '4006381333932'); await O.click('#barForm button[type="submit"]'); await asyncio.sleep(0.3)
        ok('valido' in (await O.inner_text('#barErr')) and await O.is_visible('#barManual'), 'cifra di controllo sbagliata: codice rifiutato')
        await O.fill('#barManual', CODE); await O.click('#barForm button[type="submit"]'); await asyncio.sleep(0.4)
        ok(await O.query_selector('.bar-overlay') is None, 'codice valido: la finestra si chiude')
        ok(await O.input_value('#edEan') == CODE, 'codice scritto nel campo della scheda')
        msg = await O.inner_text('#edScanMsg')
        ok('nome' in msg and 'BoardGameGeek' in msg, f'senza nome: chiede il nome (BGG non cerca per codice) [{msg[:80]}]')
        ok(await O.evaluate("document.activeElement?.id === 'edName'"), 'il cursore va sul nome')

        # 2. Con il nome: ricerca su BGG, scelta e conferma; i campi scritti a mano restano
        await O.fill('#edName', 'azul'); await O.fill('#edMax', '5')
        await scan(O, CODE)
        await O.wait_for_selector('.am-bgg-item', timeout=8000)
        ok('Azul' in await O.inner_text('#bgRes'), 'con il nome: risultati di BoardGameGeek')
        await O.click('[data-bgg="230802"]'); await O.wait_for_selector('#bgApply', timeout=8000)
        ok(await O.query_selector('[data-take="maxPlayers"]') is not None, 'valore diverso da quello scritto: si cambia solo se spuntato')
        if await O.query_selector('#bgImg'): await O.uncheck('#bgImg')
        await O.click('#bgApply'); await asyncio.sleep(0.5)
        ok(await O.input_value('#edMax') == '5' and await O.input_value('#edDur') == '45', 'BGG riempie i campi vuoti e lascia quelli scritti a mano')
        mp = await O.evaluate("JSON.parse(localStorage.getItem('gnr_ean_map') || '{}')")
        ok(mp.get(CODE, {}).get('bgg') == 230802, f'abbinamento codice → scheda ricordato su questo dispositivo {mp}')
        await O.fill('#edName', 'Azul'); await O.click('#edSave'); await wait_js(O, "!document.querySelector('#edForm')", 10000)
        lib = dump().get('armadi', {}).get(aid, {}).get('library', {})
        saved = [g for g in lib.values() if g.get('name') == 'Azul']
        ok(saved and saved[0].get('ean') == CODE and saved[0].get('extId') == 'bgg:230802', f'scheda salvata con codice e numero di BGG {saved[:1]}')

        # 3. Stesso codice nello stesso armadio: "è già di Azul", con il link alla scheda
        await O.click('[data-act="add"] >> nth=0'); await O.wait_for_selector('#edForm')
        await scan(O, CODE)
        msg = await O.inner_text('#edScanMsg')
        ok('Azul' in msg and await O.is_visible('[data-twin]'), f'codice già nell\'armadio: lo dice e propone la scheda [{msg[:70]}]')
        await O.click('[data-twin]'); await asyncio.sleep(0.6)
        ok(await O.query_selector('#edForm') is None and 'Azul' in (await O.inner_text('.overlay')), 'apre la scheda del gioco già presente')
        await close_sheets(O)

        # 4. Altro armadio: la scheda di BGG si apre da sola dal codice, ma va confermata
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#tileArm')
        await O.click('#tileArm'); await O.click('#armNew'); await O.fill('#naName', 'Casa al mare'); await O.click('#naGo')
        await O.wait_for_selector('#edForm', timeout=10000)
        aid2 = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)
        await scan(O, CODE)
        await O.wait_for_selector('#bgApply', timeout=8000)
        ok('Azul' in await O.inner_text('#bgRes'), 'altro armadio: dal codice si apre direttamente la scheda già abbinata')
        ok(await O.input_value('#edName') == '', 'niente compilato prima della conferma')
        if await O.query_selector('#bgImg'): await O.uncheck('#bgImg')
        await O.click('#bgApply'); await asyncio.sleep(0.5)
        ok(await O.input_value('#edName') == 'Azul' and await O.input_value('#edEan') == CODE, 'confermata: nome e codice nella scheda nuova')
        await O.click('#edSave'); await wait_js(O, "!document.querySelector('#edForm')", 10000)
        lib2 = dump().get('armadi', {}).get(aid2, {}).get('library', {})
        ok(any(g.get('ean') == CODE and g.get('name') == 'Azul' for g in lib2.values()), 'secondo armadio: gioco salvato con il codice')
        await co.close(); await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
