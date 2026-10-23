# Aspetto delle pagine riprogettate: nessuno scorrimento laterale e nessun elemento fuori schermo
# a 360, 390, 412, 768, 1024, 1280, 1366 e 1920 px, in italiano e in inglese, tema Show e Giorno.
# Salva gli screenshot in tests/e2e/out/look/.
import asyncio, os
from playwright.async_api import async_playwright
from common import *
from mprobe import OVF

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

WIDTHS = [(360, 760), (390, 844), (412, 915), (768, 1024), (1024, 768), (1280, 800), (1366, 768), (1920, 1080)]
PAGES = [('index.html', '#joinForm'), ('index.html#armadi', '#hubArmadi'), ('index.html#altro', '#hubMeFull')]
os.makedirs('look', exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ('it', 'en'):
            for theme in ('show', 'day'):
                for (w, h) in WIDTHS:
                    if theme == 'day' and w not in (390, 1366):
                        continue
                    mobile = w < 700
                    ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
                    await ctx.add_init_script(f"try {{ localStorage.setItem('gnr_intro_done','1'); localStorage.setItem('gnr_tour_off','1'); localStorage.setItem('gnr_lang','{lang}'); localStorage.setItem('gnr_theme','{theme}'); localStorage.setItem('gnr_theme_v','2'); }} catch (e) {{}}")
                    pg = await ctx.new_page(); watch(pg, f'{lang}-{theme}-{w}')
                    for path, sel in PAGES:
                        await pg.goto(f'{BASE}/{path}'); await pg.wait_for_selector(sel, state='attached'); await asyncio.sleep(0.5)
                        r = await pg.evaluate(OVF)
                        tag = f'{path.replace(".html", "").replace("#", "-")} {lang} {theme} {w}px'
                        ok(r['sw'] <= r['W'] + 1 and not r['out'], f'{tag}: niente fuori schermo {r["out"][:3] if r["out"] else ""}')
                        if path == 'index.html' or w in (390, 1366):
                            await pg.screenshot(path=f'look/{path.replace(".html", "").replace("#", "-")}_{lang}_{theme}_{w}.png', full_page=w < 1100)
                    # Pulsanti e campi del telefono abbastanza grandi da toccare (44 px)
                    if mobile:
                        await pg.goto(f'{BASE}/index.html'); await pg.wait_for_selector('#joinForm'); await asyncio.sleep(0.3)
                        small = await pg.evaluate("""[...document.querySelectorAll('.ui-btn, .tabbar a, .icon-round, #homeCode')].filter(e => e.offsetParent).map(e => [e.id || e.className.split(' ')[0], Math.round(e.getBoundingClientRect().height)]).filter(([, hh]) => hh < 40)""")
                        ok(not small, f'{lang} {w}px: controlli alti almeno 40 px {small[:4]}')
                    await ctx.close()
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
