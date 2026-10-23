import asyncio, time, re
from common import *
from playwright.async_api import async_playwright
IM = HERE + '/fixtures/imgs/'
GNAME = 'Img ' + str(int(time.time()) % 100000)
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

CHECK = """(() => {
  const bad = [];
  const ratio = {};
  for (const g of document.querySelectorAll('.game-img')) {
    const r = g.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cls = [...g.classList].filter(c => c.startsWith('game-img--')).join(' ') || 'game-img';
    (ratio[cls] ||= new Set()).add((r.width / r.height).toFixed(2));
    if (g.closest('.tilt-left')) continue;
    const box = g.parentElement.closest('.card, .panel, .lib-tile, .lib-chip, .vcards, .reveal, .voting-game, section, li');
    if (box) {
      const b = box.getBoundingClientRect();
      if (r.left < b.left - 3 || r.right > b.right + 3 || r.top < b.top - 3 || r.bottom > b.bottom + 3) bad.push(`${cls} esce da ${box.className.split(' ')[0]}: ${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}-${Math.round(r.bottom)} in ${Math.round(b.left)}-${Math.round(b.right)}x${Math.round(b.top)}-${Math.round(b.bottom)}`);
    }
    if (r.right > innerWidth + 2 || r.left < -2) bad.push(`${cls} esce dallo schermo`);
    const fg = g.querySelector('.gi-fg');
    if (fg && fg.complete && fg.naturalWidth) {
      const f = fg.getBoundingClientRect();
      if (Math.abs(f.width - r.width) > r.width * 0.12 + 8 || f.height > r.height + 6) bad.push(`${cls}: foto ${Math.round(f.width)}x${Math.round(f.height)} nel riquadro ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return { bad, ratio: Object.fromEntries(Object.entries(ratio).map(([k, v]) => [k, [...v]])) };
})()"""

async def check(pg, label, shotname=None):
    r = await pg.evaluate(CHECK)
    ok(not r['bad'], f"{label}: riquadri {r['ratio']}" + (f" PROBLEMI {r['bad'][:3]}" if r['bad'] else ''))
    if shotname: await pg.screenshot(path=f'img_{shotname}.png')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vw, vh in [(1280, 720), (1920, 1080)]:
            pass
        ctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        await ctx.add_init_script("localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off')")
        tv = await ctx.new_page(); watch(tv, 'tv')
        await tv.goto(BASE + '/host.html'); await tv.wait_for_selector('#createBtn')
        await tv.click('[data-armmode="new"]'); await tv.fill('#armInlineIn', GNAME); await tv.click('#armInlineGo')
        await tv.wait_for_url(re.compile('armadio.html'), timeout=8000); await tv.wait_for_selector('#edForm')
        games = [('Torre Altissima', 'tall'), ('Panorama Larghissimo', 'wide'), ('Quadrato', 'square'), ('Scatola', 'box43')]
        for i, (nm, f) in enumerate(games):
            if i: await tv.click('#amHero [data-act="add"]'); await tv.wait_for_selector('#edForm')
            await tv.set_input_files('#edFile', IM + f + '.jpg'); await photo_ok(tv); await tv.wait_for_selector('#edPick.has-img')
            await tv.fill('#edName', nm); await tv.click('#edSave')
            await wait_js(tv, "!document.querySelector('#edForm')")
            await wait_js(tv, f"[...document.querySelectorAll('.am-name')].some(e=>e.textContent==={nm!r})")
        await asyncio.sleep(0.5)
        await check(tv, 'armadio (pagina 1.2)', 'armadio')
        await tv.click('#amHero a[href*="usaArmadio"]'); await tv.wait_for_selector('#createBtn')
        await tv.select_option('#groupSel', '__new'); await tv.fill('#groupName', 'G ' + GNAME)
        for _ in range(5): await tv.click('.step-btn[data-step="-1"]')
        await tv.click('#createBtn'); await tv.wait_for_selector('.lobby')
        code = tv.url.split('room=')[1]
        phones = []
        for i, n in enumerate(['Ada', 'Bruno', 'Carla']):
            c, ph = await join(b, code, n, i); phones.append(ph)
        await tv.click('#startBtn'); await tv.wait_for_selector('#libPick .lib-chip')
        await check(tv, 'TV prossimo gioco', 'idle')
        # votazione per scegliere: poll con le foto
        await tv.click('#startPoll'); await tv.wait_for_selector('.poll')
        await asyncio.sleep(0.8)
        await check(tv, 'TV votazione del prossimo gioco', 'poll')
        await phones[0].wait_for_selector('.poll-opt, [data-poll]', timeout=8000)
        await check(phones[0], 'telefono votazione del prossimo gioco', 'phone_poll')
        await tv.click('#hdrBack'); await tv.wait_for_selector('#libPick .lib-chip')
        for nm, f in games[:2]:
            await tv.click(f'#libPick .lib-chip >> text={nm}')
            await tv.click('#openVote'); await tv.wait_for_selector('.voting')
            await asyncio.sleep(0.5)
            await check(tv, f'TV votazione {nm}', f'voting_{f}')
            await phones[0].wait_for_selector('#sendVote')
            await check(phones[0], f'telefono voto {nm}', f'phone_vote_{f}')
            for ph in phones: await vote(ph, 7)
            await tv.wait_for_selector('.reveal', timeout=15000); await asyncio.sleep(3)
            await check(tv, f'TV reveal {nm}', f'reveal_{f}')
            await tv.click('#hdrBack'); await tv.wait_for_selector('#libPick')
        await tv.click('#showBoard'); await tv.wait_for_selector('.board, .board-list', timeout=8000); await asyncio.sleep(1.5)
        await check(tv, 'TV classifica', 'board')
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
