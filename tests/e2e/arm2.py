import asyncio, time
from common import *
from playwright.async_api import async_playwright
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
async def newtv(b, w=1280, h=720):
    ctx = await b.new_context(viewport={'width': w, 'height': h})
    await ctx.add_init_script("localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_lite','off')")
    pg = await ctx.new_page(); watch(pg, 'tv'); return pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        a = await newtv(b)
        await a.goto(BASE + '/host.html'); await a.wait_for_selector('.arm-card')
        await a.screenshot(path='a2_create720.png')
        # la pagina si scorre fino in fondo
        sc = await a.evaluate("(()=>{const c=document.querySelector('.create');c.scrollTop=9999;const d=document.querySelector('#demoBtn').getBoundingClientRect();return [c.scrollHeight>c.clientHeight, d.bottom<=innerHeight+1]})()")
        ok(sc[1], f'il fondo della schermata iniziale si raggiunge scorrendo {sc}')
        await a.click('[data-armmode="new"]'); await a.fill('#armInlineIn', 'Armadio di A'); await a.click('#armInlineGo'); await a.wait_for_selector('#edForm')
        ok('armadio.html' in a.url, 'il nuovo armadio si apre nella sua pagina')
        await a.fill('#edName', 'Carcassonne'); await a.click('#edSave')
        await wait_js(a, "[...document.querySelectorAll('.am-name')].some(e=>e.textContent==='Carcassonne')")
        aid = [k for k, x in db()['armadi'].items() if (x.get('info') or {}).get('name') == 'Armadio di A'][-1]
        key = await a.evaluate(f"localStorage.getItem('gnr_akey_{aid}')")
        ok(bool(key), 'il proprietario ha la chiave')
        # un'altra TV usa lo stesso armadio con il codice
        t = await newtv(b, 1920, 1080)
        await t.goto(BASE + '/host.html'); await t.wait_for_selector('#armSel')
        await t.select_option('#armSel', '__code'); await t.fill('#armCode', aid)
        await t.fill('#groupName', 'Gruppo B ' + str(int(time.time()) % 1000))
        for _ in range(6): await t.click('.step-btn[data-step="-1"]')
        await t.click('#createBtn'); await t.wait_for_selector('.lobby')
        code = t.url.split('room=')[1]
        ok(aid_of(code) == aid, 'la stanza di un’altra TV consulta lo stesso armadio')
        await t.click('#hdrLib'); await t.wait_for_selector('.lib-name')
        ok('Carcassonne' in await t.inner_text('#lpList'), 'vede i giochi dell’armadio')
        await t.wait_for_selector('#lpKeyIn', timeout=5000)
        ok(True, 'senza chiave: solo consultazione')
        await t.screenshot(path='a2_readonly.png')
        await t.fill('#lpKeyIn', key); await t.click('#lpKeyGo')
        await wait_js(t, "!document.querySelector('#lpKeyIn')", 5000)
        ok(True, 'con la chiave diventa modificabile')
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
