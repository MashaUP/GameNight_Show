import asyncio
from playwright.async_api import async_playwright
from common import *
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def at(path):
    c = db()
    for s in path.split('/'):
        if not isinstance(c, dict): return None
        c = c.get(s)
    return c
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3, group='Gruppo Poll')
        phs = [(await join(b, code, n, i))[1] for i, n in enumerate(['Ada', 'Bruno', 'Carla'])]
        await host.click('#lobbyLib'); await host.wait_for_selector('#lpName')
        for n in ['Azul', 'Dixit', 'Catan', 'Uno']:
            await host.fill('#lpName', n); await host.click('#lpSubmit'); await asyncio.sleep(0.3)
        await host.click('#lpClose'); await host.click('#startBtn'); await host.wait_for_selector('#startPoll')
        await host.click('#startPoll'); await host.wait_for_selector('.poll-card')
        ok(at(f'rooms/{code}/poll/max') == 1, 'di base un voto a testa')
        await host.click('[data-pmax="2"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/poll/max') == 2, 'la TV concede 2 voti a testa')
        A, B, C = phs
        await A.wait_for_selector('.poll-opt'); await asyncio.sleep(0.5)
        lead = await A.inner_text('#pollLead'); ok('fino a 2' in lead, f'il telefono lo dice: {lead[:60]}')
        await A.click('.poll-opt >> text=Azul'); await asyncio.sleep(0.4); await A.click('.poll-opt >> text=Dixit'); await asyncio.sleep(0.4)
        await A.click('.poll-opt >> text=Catan'); await asyncio.sleep(0.6)
        v = at(f'rooms/{code}/poll/votes/{await A.evaluate("sessionStorage.getItem(\'fake_uid\')")}')
        ok(isinstance(v, dict) and sorted(v.values()) and len(v) == 2, f'massimo 2: il terzo non passa ({v})')
        ok('massimo 2' in (await A.inner_text('#toast')), 'avviso chiaro al terzo tocco')
        await A.click('.poll-opt >> text=Dixit'); await asyncio.sleep(0.4); await A.click('.poll-opt >> text=Catan'); await asyncio.sleep(0.6)
        v = at(f'rooms/{code}/poll/votes/{await A.evaluate("sessionStorage.getItem(\'fake_uid\')")}')
        ok(sorted(v.values()) == ['Azul', 'Catan'] or len(v) == 2, f'si toglie e si cambia ({v})')
        ok(await host.is_disabled('[data-pmax="1"]'), 'dopo il primo voto i voti a testa non si cambiano più')
        await B.click('.poll-opt >> text=Catan'); await asyncio.sleep(0.4)
        await C.click('.poll-opt >> text=Catan'); await asyncio.sleep(0.4); await C.click('.poll-opt >> text=Uno'); await asyncio.sleep(0.8)
        cnt = await host.inner_text('#pollCount'); ok('Hanno scelto tutti' in cnt or '3 / 3' in cnt, f'conteggio persone: {cnt}')
        await host.screenshot(path='m/poll_multi.png')
        await host.wait_for_selector('#pollWin:not([hidden])', timeout=8000); await asyncio.sleep(0.8)
        win = at(f'rooms/{code}/poll/winner'); name = at(f'{armlib(code)}/{win}/name') if win else None
        ok(name == 'Catan', f'vince il gioco con più voti (Catan 3 voti): {name}')
        await b.close()
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
