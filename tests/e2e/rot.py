import asyncio
from playwright.async_api import async_playwright
from common import *
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
RUN = """async (name) => {
  const { gameImage, squarePhoto } = await import('/js/util.js');
  const blob = await (await fetch('/tests/e2e/fixtures/' + name)).blob();
  const f = new File([blob], name, { type: 'image/jpeg' });
  window.__res = null;
  (window.__kind === 'square' ? squarePhoto(f) : gameImage(f)).then((d) => { window.__res = d; }, (e) => { window.__res = 'ERR:' + (e.cancelled ? 'cancelled' : e.message); });
}"""
SAMPLE = """async (pts) => {
  const img = new Image(); img.src = window.__res; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return [img.width, img.height, ...pts.map(([a, b]) => { const d = x.getImageData(a, b, 1, 1).data; return d[0] > d[2] ? 'R' : 'B'; })];
}"""
async def go(pg, name, rot, pts, kind='game'):
    await pg.evaluate(f"window.__kind = '{kind}'")
    await pg.evaluate(RUN, name)
    if rot is None:
        await pg.wait_for_selector('#peOk'); await pg.click('[data-pecancel]')
    else:
        await photo_ok(pg, rot)
    await wait_js(pg, 'window.__res !== null')
    if rot is None: return await pg.evaluate('window.__res')
    return await pg.evaluate(SAMPLE, pts)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 400, 'height': 860}, is_mobile=True)
        pg = await ctx.new_page(); watch(pg, 'rot')
        await pg.goto(BASE + '/test.html'); await asyncio.sleep(0.5)
        r = await go(pg, 'rot_lr.jpg', 0, [(200, 240), (440, 240)]); ok(r[:2] == [640, 480] and r[2:] == ['R', 'B'], f'senza rotazione: sinistra rossa, destra blu {r}')
        r = await go(pg, 'rot_lr.jpg', 1, [(320, 120), (320, 360)]); ok(r[2:] == ['R', 'B'], f'ruotata a destra: rosso in alto {r}')
        r = await go(pg, 'rot_lr.jpg', -1, [(320, 120), (320, 360)]); ok(r[2:] == ['B', 'R'], f'ruotata a sinistra: blu in alto {r}')
        r = await go(pg, 'rot_lr.jpg', 2, [(200, 240), (440, 240)]); ok(r[2:] == ['B', 'R'], f'mezzo giro {r}')
        r = await go(pg, 'rot_exif6.jpg', 0, [(320, 120), (320, 360)]); ok(r[2:] == ['R', 'B'], f'orientamento EXIF della fotocamera applicato {r}')
        r = await go(pg, 'rot_lr.jpg', 1, [(128, 40), (128, 215)], 'square'); ok(r[:2] == [256, 256] and r[2:] == ['R', 'B'], f'personaggio ruotato {r}')
        r = await go(pg, 'rot_lr.jpg', None, None); ok(r == 'ERR:cancelled', f'annulla: nessuna foto salvata ({r})')
        ok(await pg.query_selector('#toast.is-show, #toast.show') is None, 'annullare non mostra errori')
        await b.close()
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
if __name__ == "__main__": asyncio.run(main())
