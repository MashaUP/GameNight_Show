import asyncio, json, sys, time, re
GNAME = 'Arm ' + str(int(time.time()) % 100000)
from common import *
from playwright.async_api import async_playwright
IM = HERE + '/fixtures/imgs/'
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 760})
        await ctx.add_init_script("localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off')")
        tv = await ctx.new_page(); watch(tv, 'tv')
        await tv.goto(BASE + '/host.html'); await tv.wait_for_selector('#createBtn')
        await tv.screenshot(path='ar_create.png')
        ok(await tv.input_value('#armSel') == '__new', 'nessun armadio: si propone di crearne uno')
        await tv.click('[data-armmode="new"]'); await tv.fill('#armInlineIn', GNAME); await tv.click('#armInlineGo')
        await tv.wait_for_url(re.compile('armadio.html'), timeout=8000); await tv.wait_for_selector('#edForm')
        ok(True, 'armadio aperto senza gruppo (pagina 1.2)')
        # 4 giochi con foto di forme diverse + 1 da link
        for i, (nm, f) in enumerate([('Dixit', 'tall'), ('Codenames', 'wide'), ('Azul', 'square'), ('Cascadia', 'box43'), ('Just One', None)]):
            if i: await tv.click('#amHero [data-act="add"]'); await tv.wait_for_selector('#edForm')
            if f:
                await tv.set_input_files('#edFile', IM + f + '.jpg'); await photo_ok(tv)
            else:
                await tv.fill('#edUrl', BASE + '/assets/icon-512.png'); await tv.click('#edUrlOk')
            await tv.wait_for_selector('#edPick.has-img')
            await tv.fill('#edName', nm); await tv.click('#edSave')
            await wait_js(tv, "!document.querySelector('#edForm')")
            await wait_js(tv, f"[...document.querySelectorAll('.am-name')].some(e=>e.textContent==={nm!r})", timeout=8000)
        d = db()
        aid = [k for k, a in d.get('armadi', {}).items() if a.get('info', {}).get('name') == GNAME][0]
        lib = d['armadi'][aid]['library']; imgs = d['armadi'][aid].get('images', {})
        ok(not any(g.get('info', {}).get('name') == GNAME for g in d.get('groups', {}).values()), 'nessun gruppo creato per l’armadio')
        sizes = []
        for k in lib:
            sizes.append(await tv.evaluate("(src)=>new Promise(r=>{const i=new Image();i.onload=()=>r([i.naturalWidth,i.naturalHeight]);i.src=src})", imgs[k]))
        ok(all(s == [640, 480] for s in sizes), f'tutte le foto grandi 640x480: {sizes}')
        ok(all(not it.get('image') and it.get('thumb') for it in lib.values()), 'nell’elenco solo le miniature')
        await tv.screenshot(path='ar_page.png', full_page=True)
        # QR dal telefono
        await tv.click('[data-act="phoneQR"]'); await tv.wait_for_selector('.am-overlay .qr-url a')
        url = await tv.get_attribute('.am-overlay .qr-url a', 'href')
        ok('a=' + aid in url and 'add=1' in url and '#ak=' in url, f'QR telefono con chiave: {url}')
        await tv.keyboard.press('Escape')
        # Crea la stanza da qui
        await tv.click('#amHero a[href*="usaArmadio"]'); await tv.wait_for_selector('#createBtn')
        sel = await tv.eval_on_selector('#armSel', 'e=>e.value')
        ok(sel == aid, 'armadio già scelto per la stanza')
        await tv.select_option('#groupSel', '__new'); await tv.fill('#groupName', 'Gruppo ' + GNAME)
        for _ in range(5): await tv.click('.step-btn[data-step="-1"]')
        await tv.click('#createBtn'); await tv.wait_for_selector('.lobby')
        code = tv.url.split('room=')[1]
        ok(aid_of(code) == aid, 'la stanza consulta l’armadio')
        c1, a = await join(b, code, 'Ada', 0); c2, bb = await join(b, code, 'Bruno', 1)
        await tv.click('#startBtn'); await tv.wait_for_selector('#libPick .pick-modes')
        await tv.screenshot(path='ar_idle.png')
        ok(await tv.is_visible('#pickRandom'), 'scelta del prossimo gioco dall’armadio')
        await tv.click('#pickRandom')
        await wait_js(tv, "document.querySelector('#gameName').value.length>0", timeout=8000)
        name = await tv.input_value('#gameName')
        ok(name in ['Dixit', 'Codenames', 'Azul', 'Cascadia', 'Just One'], f'A caso tra i giochi dell’armadio: {name}')
        # telefono: armadio con chiave
        ph = await (await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)).new_page(); watch(ph, 'tel')
        await ph.goto(url); await ph.wait_for_selector('#edForm')
        ok('Collaboratore' in await ph.inner_text('.am-meta'), 'il telefono con la chiave diventa collaboratore')
        await ph.set_input_files('#edFile', IM + 'wide.jpg'); await photo_ok(ph); await ph.wait_for_selector('#edPick.has-img')
        await ph.fill('#edName', 'Ticket to Ride'); await ph.click('#edSave')
        await wait_js(ph, "[...document.querySelectorAll('.am-name')].some(e=>e.textContent==='Ticket to Ride')", timeout=8000)
        ok(True, 'gioco aggiunto dal telefono')
        await ph.screenshot(path='ar_phone.png', full_page=True)
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
