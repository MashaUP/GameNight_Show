import asyncio, sys
from playwright.async_api import async_playwright
from common import *
OVF = """(() => { const W = document.documentElement.clientWidth; const out = [];
 for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (!r.width || getComputedStyle(el).visibility==='hidden') continue;
   if (r.right > W + 1 || r.left < -1) { let p = el.parentElement, clipped = false; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.right <= W+1 && pr.left >= -1) { clipped = true; break; } } p = p.parentElement; } if (!clipped) out.push((el.id?'#'+el.id:'')+'.'+[...el.classList].join('.')+'<'+el.tagName+'> '+Math.round(r.left)+'..'+Math.round(r.right)); } }
 return {sw: document.documentElement.scrollWidth, W, out: out.filter(s => !/<(path|svg|SPAN|B|I|SMALL|IMG|circle|rect|line|polyline|g)>/.test(s)).slice(0, 14)}; })()"""
async def ovf(pg, tag):
    r = await pg.evaluate(OVF)
    print(f"{tag}: scrollW={r['sw']} W={r['W']}", *r['out'][:12], sep='\n   ')
    await pg.screenshot(path=f'm/{tag}.png')
async def mhost(b, app=False):
    ctx = await b.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); } catch (e) {}")
    pg = await ctx.new_page(); watch(pg, 'mhost')
    return ctx, pg
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx, h = await mhost(b)
        await h.goto(BASE + '/index.html'); await asyncio.sleep(0.6); await ovf(h, 'home')
        await h.goto(BASE + '/host.html'); await h.wait_for_selector('#createBtn'); await asyncio.sleep(0.5); await ovf(h, 'create')
        await h.fill('#groupName', 'Gruppo M') if await h.is_visible('#groupName') else None
        await h.click('#createBtn'); await h.wait_for_selector('.lobby'); await asyncio.sleep(0.8)
        code = h.url.split('room=')[1]
        await ovf(h, 'lobby')
        for i, n in enumerate(['Ada', 'Bruno', 'Carla']): await join(b, code, n, i)
        await asyncio.sleep(1); await ovf(h, 'lobby2')
        btn = await h.query_selector('#startNight, [data-act="start"], #closeLobby')
        print('start btn', btn and await btn.get_attribute('id'))
        await b.close()
    print(errs or 'no errors')
if __name__ == "__main__": asyncio.run(main())
