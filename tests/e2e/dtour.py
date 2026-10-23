import asyncio, sys
from playwright.async_api import async_playwright
from common import *
from mprobe import OVF, mhost
W = int(sys.argv[1]) if len(sys.argv) > 1 else 412
DESK = len(sys.argv) > 3
H = int(sys.argv[2]) if len(sys.argv) > 2 else 915
bad = []
async def ovf(pg, tag, shot=True):
    r = await pg.evaluate(OVF)
    if r['sw'] > r['W'] or r['out']:
        bad.append(tag); print(f"!! {tag}: scrollW={r['sw']} W={r['W']}", *r['out'][:14], sep='\n   ')
    else: print(f"ok {tag}")
    if shot: await pg.screenshot(path=f'm/{W}_{tag}.png')
async def esc(h):
    await h.keyboard.press('Escape'); await asyncio.sleep(0.4)
async def step(h, tag, sel, wait=None, close=True):
    try:
        await h.click(sel, timeout=4000)
        if wait: await h.wait_for_selector(wait, timeout=5000)
        await asyncio.sleep(0.7); await ovf(h, tag)
    except Exception as e:
        print(f'?? {tag}: {str(e).splitlines()[0][:140]}'); bad.append(tag + '(err)')
    if not close: return
    await esc(h)
    for sel in ('#qzClose', '#intClose', '.overlay [data-close]', '.overlay .icon-btn[aria-label^="Chiudi"]'):
        try:
            if await h.is_visible(sel): await h.click(sel, timeout=1500); await asyncio.sleep(0.3)
        except Exception: pass
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=not DESK, has_touch=not DESK, device_scale_factor=1 if DESK else 2)
        await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); } catch (e) {}")
        h = await ctx.new_page(); watch(h, 'mhost')
        await h.goto(BASE + '/index.html'); await asyncio.sleep(0.6); await ovf(h, 'home')
        await h.goto(BASE + '/host.html?armadio=1'); await asyncio.sleep(1.2); await ovf(h, 'armadio_page')
        await h.goto(BASE + '/host.html'); await h.wait_for_selector('#createBtn'); await asyncio.sleep(0.5); await ovf(h, 'create')
        if await h.is_visible('#groupName'): await h.fill('#groupName', 'Gruppo M')
        await h.click('#createBtn'); await h.wait_for_selector('.lobby'); await asyncio.sleep(0.8)
        code = h.url.split('room=')[1]
        phs = []
        for i, n in enumerate(['Ada', 'Bruno', 'Carla']): phs.append((await join(b, code, n, i))[1])
        await asyncio.sleep(1); await ovf(h, 'lobby')
        await step(h, 'players', '#hdrPlayers')
        await step(h, 'tools', '#hdrTools')
        await step(h, 'lib', '#lobbyLib', '#lpName', close=False)
        for n in ['Codenames', 'Dixit', 'Azul']:
            await h.fill('#lpName', n); await h.click('#lpSubmit'); await asyncio.sleep(0.3)
        await ovf(h, 'lib2'); await h.click('#lpClose')
        await h.click('#startBtn'); await h.wait_for_selector('#libPick .lib-chip'); await asyncio.sleep(0.8); await ovf(h, 'idle')
        await step(h, 'wheel', '#openWheel')
        await step(h, 'reco', '#openReco')
        await step(h, 'table', '#openTable')
        await step(h, 'interval', '#showInterval')
        await step(h, 'quiz', '#openQuiz')
        await step(h, 'plan', '#openPlan')
        await step(h, 'rules', '#openRules')
        await step(h, 'poll', '#startPoll', '.poll-card', close=False)
        try:
            await ovf(h, 'poll2'); await h.click('#hdrBack'); await asyncio.sleep(0.8)
        except Exception as e: print('?? pollback', str(e).splitlines()[0])
        await step(h, 'alltime', '#showAllTime', close=False)
        try:
            await asyncio.sleep(1)
            n = len(await h.query_selector_all('.at-tabs button'))
            for i in range(min(n, 10)):
                await h.click(f'.at-tabs button >> nth={i}'); await asyncio.sleep(0.6); await ovf(h, f'alltime_tab{i}')
        except Exception as e: print('?? alltime', str(e).splitlines()[0])
        try:
            await h.click('#hdrBack'); await h.wait_for_selector('#libPick .lib-chip', timeout=5000)
        except Exception as e: print('?? alltime', str(e).splitlines()[0])
        await h.click('.lib-chip >> text=Codenames', timeout=5000); await asyncio.sleep(0.3)
        await ovf(h, 'idle_game')
        try:
            await h.click('#startPlay', timeout=3000); await asyncio.sleep(0.8); await ovf(h, 'playing')
        except Exception as e: print('?? startPlay', str(e)[:100])
        await h.click('.win-av[title^="Ada"]'); await asyncio.sleep(0.3)
        await h.click('#openVote'); await h.wait_for_selector('.voting'); await asyncio.sleep(0.8); await ovf(h, 'voting')
        for ph in phs: await vote(ph, 8)
        try:
            await h.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(2.5); await ovf(h, 'reveal')
            await asyncio.sleep(6); await ovf(h, 'reveal2')
            await h.click('#toBoard'); await h.wait_for_selector('.board'); await asyncio.sleep(0.8); await ovf(h, 'board')
            await h.click('#endNight'); await h.click('#endDialog [data-edgo]'); await h.wait_for_selector('.awards'); await asyncio.sleep(1); await ovf(h, 'awards')
            for i in range(12):
                if not await h.is_visible('#stepBtn'): break
                await h.click('#stepBtn'); await asyncio.sleep(0.4)
            await asyncio.sleep(1); await ovf(h, 'awards_end')
            await ovf(phs[0], 'phone_end')
        except Exception as e: print('?? end', str(e)[:200])
        await b.close()
    print('BAD:', bad)
    print(errs[:10] or 'no errors')
asyncio.run(main())
