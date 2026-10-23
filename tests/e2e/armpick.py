import asyncio, json, time, urllib.request
from playwright.async_api import async_playwright
from common import *
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value, 'uid': 'altro'}).encode(), method='POST'); urllib.request.urlopen(req).read()
def at(path):
    c = db()
    for s in path.split('/'):
        if not isinstance(c, dict): return None
        c = c.get(s)
    return c
A1 = 'ARMT%02d' % (int(time.time()) % 100); A2 = 'ARMU%02d' % (int(time.time()) % 100)
async def newtv(b, w=1280, h=720):
    ctx = await b.new_context(viewport={'width': w, 'height': h})
    await ctx.add_init_script("localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_lite','off');localStorage.setItem('gnr_armadi', JSON.stringify([{id:'%s',name:'Armadio Test'},{id:'%s',name:'Secondo'}]))" % (A1, A2))
    pg = await ctx.new_page(); watch(pg, 'tv'); return pg
async def main():
    for a, nm, lib in ((A1, 'Armadio Test', {'g1': {'name': 'Azul', 'sel': True}, 'g2': {'name': 'Dixit', 'sel': True}, 'g3': {'name': 'Catan'}}), (A2, 'Secondo', {'g9': {'name': 'Just One', 'sel': True}, 'g8': {'name': 'Codenames'}})):
        dbset(f'armadi/{a}/info', {'name': nm, 'ownerUid': 'altro'})
        for k, v in lib.items(): dbset(f'armadi/{a}/library/{k}', v)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        t = await newtv(b)
        await t.goto(BASE + '/host.html'); await t.wait_for_selector('#armSel')
        await t.select_option('#armSel', A1)
        if await t.is_visible('#groupName'): await t.fill('#groupName', 'Gruppo AP')
        await t.click('#createBtn')
        try: await t.wait_for_selector('.lobby', timeout=8000)
        except Exception:
            print('ERRORE CREAZIONE:', await t.inner_text('#createErr')); raise
        await asyncio.sleep(1)
        code = t.url.split('room=')[1]
        ok(set((at(f'rooms/{code}/pick') or {}).keys()) == {'g1', 'g2'}, f'stelline dell’armadio copiate nella stanza {at(f"rooms/{code}/pick")}')
        txt = await t.inner_text('#lobbyLibTxt'); ok('Armadio Test' in txt and '⭐ 2' in txt, f'armadio attivo visibile in lobby: {txt}')
        await t.click('#lobbyLib'); await t.wait_for_selector('[data-sel="g3"]')
        await t.click('[data-sel="g3"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/pick/g3') is True and at(f'armadi/{A1}/library/g3/sel') is None, 'stellina nella stanza: la collezione non cambia')
        await t.click('[data-sel="g1"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/pick/g1') is None and at(f'armadi/{A1}/library/g1/sel') is True, 'togliere la stellina stasera non tocca l’armadio')
        await t.click('#lpSwitchBtn'); await t.wait_for_selector(f'[data-armswitch="{A2}"]'); await t.screenshot(path='m/arm_switch.png')
        await t.click(f'[data-armswitch="{A2}"]'); await asyncio.sleep(1.2)
        ok(at(f'rooms/{code}/meta/armadioId') == A2 and set((at(f'rooms/{code}/pick') or {}).keys()) == {'g9'}, f'armadio cambiato: {at(f"rooms/{code}/meta/armadioId")} pick {at(f"rooms/{code}/pick")}')
        txt = await t.inner_text('#lobbyLibTxt'); ok('Secondo' in txt, f'lobby mostra il nuovo armadio: {txt}')
        for i, n in enumerate(['Ada', 'Bea']): await join(b, code, n, i)
        await t.click('#startBtn'); await t.wait_for_selector('#libPick .lib-chip'); await asyncio.sleep(0.6)
        chips = await t.inner_text('#libPick'); ok('Just One' in chips and 'Azul' not in chips and 'Secondo' in chips, 'il prossimo gioco si sceglie dal nuovo armadio')
        # armadio cancellato
        dbset(f'armadi/{A2}/info', None); await t.reload(); await t.wait_for_selector('#libPick'); await asyncio.sleep(1.5)
        await t.click('#openLib'); await t.wait_for_selector('#lpMissing'); await asyncio.sleep(0.5)
        ok(await t.is_visible('#lpMissing'), 'armadio cancellato: avviso e invito a cambiarlo')
        dbset(f'armadi/{A2}/info', {'name': 'Secondo', 'ownerUid': 'altro'})
        # prova con l'armadio, in sola lettura
        d = await newtv(b)
        await d.goto(BASE + '/host.html'); await d.wait_for_selector('#armSel'); await d.select_option('#armSel', A1)
        await d.click('#demoBtn'); await d.wait_for_selector('.lobby'); await asyncio.sleep(1)
        dc = d.url.split('room=')[1]
        ok(at(f'rooms/{dc}/meta/armadioId') == A1 and at(f'rooms/{dc}/meta/armadioReadOnly') is True, 'la prova usa l’armadio scelto, in sola lettura')
        await d.click('#lobbyLib'); await d.wait_for_selector('.arm-ro'); await asyncio.sleep(0.4)
        ok(not await d.is_visible('#lpForm'), 'nella prova non si aggiungono giochi all’armadio')
        await d.click('#lpClose'); await asyncio.sleep(4); await d.click('#startBtn'); await d.wait_for_selector('#gameName')
        await d.fill('#gameName', 'Gioco Inventato'); await d.click('#openVote'); await asyncio.sleep(1.5)
        names = [g.get('name') for g in (at(f'armadi/{A1}/library') or {}).values()]
        ok('Gioco Inventato' not in names, f'il gioco della prova non entra nell’armadio {names}')
        await b.close()
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
