import asyncio
from playwright.async_api import async_playwright
from common import *
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); pg = await ctx.new_page(); watch(pg, 'test')
        await pg.goto(BASE + '/test.html'); await pg.wait_for_selector('.summary-ok, .summary-fail', timeout=15000)
        print('verifica:', await pg.evaluate("[...document.querySelectorAll('.check')].map(c=>c.className.replace('check ','')+': '+c.querySelector('b').textContent)"))
        for page in ['/index.html', '/play.html']:
            await pg.goto(BASE + page); await asyncio.sleep(1.2)
        await b.close()
    print(errs or 'no errors')
asyncio.run(main())
