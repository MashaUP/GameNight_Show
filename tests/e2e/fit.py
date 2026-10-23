import asyncio
from common import *
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, seed in [(1920, 969, False), (1366, 657, False), (1280, 720, True), (1920, 969, True), (1024, 600, True)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h})
            pre = "localStorage.setItem('gnr_tour_off','1');"
            if seed:
                pre += "localStorage.setItem('gnr_armadi', JSON.stringify([{id:'ABC123',name:'I giochi di Andrea'},{id:'DEF456',name:'Casa al mare'}]));localStorage.setItem('gnr_groups', JSON.stringify([{id:'GRP123',name:'Amici del giovedì'}]));"
            await ctx.add_init_script(pre)
            pg = await ctx.new_page(); watch(pg, f'{w}x{h}')
            await pg.goto(BASE + '/host.html'); await pg.wait_for_selector('#createBtn'); await asyncio.sleep(0.5)
            r = await pg.evaluate("(()=>{const c=document.querySelector('.create');return {sh:c.scrollHeight, ch:c.clientHeight, sw: document.documentElement.scrollWidth, vw: innerWidth}})()")
            print(w, h, 'seed' if seed else 'vuoto', 'ENTRA' if r['sh'] <= r['ch'] + 1 else f"SCORRE {r['sh']}>{r['ch']}", r)
            await pg.screenshot(path=f'fit_{w}x{h}_{int(seed)}.png')
            await ctx.close()
        await b.close()
    print(errs or 'no errors')
asyncio.run(main())
