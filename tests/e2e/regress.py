import asyncio, sys
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_reg'); os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3)
        regia = (await host.inner_text('.lobby-regia b')).strip()
        A = (await join(b, code, 'Andrea', 0))[1]
        Gctx, G = await join(b, code, 'Giulia', 1)
        Mctx, M = await join(b, code, 'Marco', 2)
        await A.click('[data-myprofile]'); await A.wait_for_selector('#regiaInput')
        await A.fill('#regiaInput', regia); await A.click('#regiaGo'); await A.wait_for_selector('.regia-fab')
        await A.click('[data-profileback]'); await A.wait_for_selector('#waitList')
        # ludoteca dalla TV
        await host.click('#lobbyLib'); await host.wait_for_selector('#lpName')
        for name in ['Dixit', 'Codenames']:
            await host.fill('#lpName', name); await host.click('#lpSubmit'); await asyncio.sleep(0.4)
        await host.click('#lpClose')
        await host.click('#startBtn'); await host.wait_for_selector('#libPick .lib-chip')
        # sondaggio
        await host.click('#startPoll'); await host.wait_for_selector('.poll-card')
        for ph in (A, G, M):
            await ph.wait_for_selector('.poll-opt'); await ph.click('.poll-opt >> text=Dixit')
        await host.wait_for_selector('#pollGo', timeout=8000); await host.click('#pollGo'); await host.wait_for_selector('#gameName')
        assert await host.input_value('#gameName') == 'Dixit'
        await host.click('.win-av[title^="Andrea"]')
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(A, 8); await vote(G, 9)
        # crash di Marco: la TV aspetta, Marco rientra da un telefono nuovo
        await Mctx.close(); await asyncio.sleep(3.5)
        assert not await host.query_selector('.reveal'), 'reveal partito senza aspettare'
        nctx, M2 = await phone(b, 'Marco2')
        await M2.goto(f'{BASE}/play.html?room={code}')
        await M2.wait_for_selector('.reclaim-btn >> text=Marco', timeout=10000); await M2.click('.reclaim-btn >> text=Marco')
        await host.wait_for_selector('#clYes', timeout=8000); await host.click('#clYes')
        await vote(M2, 6)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(3)
        await host.screenshot(path=f'{OUT}/reveal.png')
        # pausa
        await host.keyboard.press('p'); await host.wait_for_selector('#pauseOverlay'); await A.wait_for_selector('text=Pausa!', timeout=6000)
        await host.click('#resumeBtn'); await host.wait_for_selector('#pauseOverlay', state='detached')
        # regia dal telefono
        await A.click('.regia-fab'); await A.wait_for_selector('.sheet [data-cmd="next"]'); await A.click('.sheet [data-cmd="next"]')
        await host.wait_for_selector('#gameName', timeout=8000)
        if await host.query_selector('#eventOverlay'):
            await host.click('#evOk')
        await A.wait_for_selector('#rgName'); await A.fill('#rgName', 'Codenames'); await A.click('.sheet [data-cmd="openVote"]')
        try:
            await host.wait_for_selector('.voting', timeout=8000)
        except Exception:
            await host.screenshot(path=f'{OUT}/fail_host.png'); await A.screenshot(path=f'{OUT}/fail_phone.png')
            print('FAIL state', json.dumps(db()['rooms'][code].get('state')), 'cmds', json.dumps(db()['rooms'][code].get('commands')))
            raise
        await A.click('#rgClose')
        await vote(A, 7); await vote(G, 8); await vote(M2, 9)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(1)
        await host.click('#toBoard'); await host.wait_for_selector('.board')
        await host.click('#endNight'); await host.click('#endDialog [data-edgo]'); await host.wait_for_selector('.awards')
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await G.wait_for_selector('#shareBtn', timeout=8000)
        await host.screenshot(path=f'{OUT}/awards.png')
        room = db()['rooms'][code]
        print('giochi:', sorted(g['name'] for g in room['games'].values()), '| giocatori:', sorted(pl['name'] for pl in room['players'].values()))
        await b.close()
    print(errs or 'no errors')

asyncio.run(main())
