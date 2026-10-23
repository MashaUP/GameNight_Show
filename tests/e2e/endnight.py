import asyncio, json, urllib.request
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
async def play_game(host, phs, name, votes, reveal=True):
    await host.wait_for_selector('#gameName'); await host.fill('#gameName', name); await asyncio.sleep(0.3)
    await host.click('.win-av >> nth=0')
    await host.click('#openVote'); await host.wait_for_selector('.voting')
    for ph, v in zip(phs, votes): await vote(ph, v)
    if reveal:
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(1)
        await host.click('#nextGame'); await asyncio.sleep(0.8)
async def scenario(b, mode):
    hctx, host, code = await tv(b, seats=3, group='Gruppo Fine ' + mode)
    phs = [(await join(b, code, n, i))[1] for i, n in enumerate(['Ada', 'Bruno', 'Carla'])]
    await host.click('#startBtn')
    await play_game(host, phs, 'Azul', [8, 7, 9])
    await play_game(host, phs[:1], 'Dixit', [6], reveal=False)
    await asyncio.sleep(0.8)
    ok(await host.is_visible('#hdrEnd'), f'[{mode}] “Fine serata” sempre visibile in alto (anche a votazione aperta)')
    await host.click('#hdrEnd'); await host.wait_for_selector('#endDialog')
    txt = await host.inner_text('#endDialog'); await host.screenshot(path=f'm/end_dialog_{mode}.png')
    ok('Dixit' in txt and '1 voto su 3' in txt, f'[{mode}] la conferma spiega la votazione aperta')
    btn = '[data-edgo="count"]' if mode == 'conta' else '[data-edgo="drop"]'
    await host.click(btn); 
    try: await host.click('#hdrEnd', timeout=500)
    except Exception: pass
    await host.wait_for_selector('.awards', timeout=8000); await asyncio.sleep(1)
    st = at(f'rooms/{code}/state')
    ok(st.get('phase') == 'awards', f'[{mode}] serata terminata')
    games = at(f'rooms/{code}/games') or {}
    dixit = [g for g in games.values() if g.get('name') == 'Dixit']
    if mode == 'conta':
        ok(dixit and dixit[0].get('status') == 'revealed' and dixit[0].get('closedEarly'), f'[{mode}] Dixit contato con i voti arrivati')
    else:
        ok(not dixit and any((t.get('game') or {}).get('name') == 'Dixit' for t in (at(f'rooms/{code}/trash') or {}).values()), f'[{mode}] Dixit nel cestino, non in classifica')
    # doppio tocco: non ricomincia
    ok(not await host.is_visible('#hdrEnd'), f'[{mode}] in premiazione il comando sparisce (niente doppia chiusura)')
    # X sul banner
    if await host.is_visible('.undo-toast'):
        await host.click('.undo-toast .undo-x'); await asyncio.sleep(0.3)
        ok(not await host.is_visible('.undo-toast') and at(f'rooms/{code}/state/phase') == 'awards', f'[{mode}] la ✕ chiude l’avviso senza annullare')
    else: ok(False, f'[{mode}] avviso “Serata terminata” non trovato')
    await asyncio.sleep(0.5)
    ok(await host.reload() is not None and not await host.is_visible('.undo-toast'), f'[{mode}] l’avviso non ricompare dopo l’aggiornamento')
    # resoconto
    for i in range(30):
        if await host.is_visible('#reportLink'): break
        if await host.is_visible('#stepBtn'): await host.click('#stepBtn')
        await asyncio.sleep(0.5)
    await host.screenshot(path=f'm/awards_end_{mode}.png')
    href = await host.get_attribute('#reportLink', 'href')
    ok(href and 'resoconto.html?room=' + code in href, f'[{mode}] link al resoconto in premiazione')
    A = phs[0]
    await A.wait_for_selector('a[href^="resoconto.html"]', timeout=8000)
    await A.click('a[href^="resoconto.html"]'); await A.wait_for_selector('.rs-board, .rs'); await asyncio.sleep(0.8)
    t = await A.inner_text('main')
    await A.screenshot(path=f'm/resoconto_{mode}.png', full_page=True)
    ok('Azul' in t and '3 voti' in t, f'[{mode}] resoconto: Azul con 3 voti')
    if mode == 'conta': ok('chiusa in anticipo' in t and 'terminata in anticipo' in t, f'[{mode}] resoconto: Dixit chiuso in anticipo, dichiarato')
    else: ok('annullato' in t.lower() and '1 voto ricevuto' in t, f'[{mode}] resoconto: Dixit annullato con 1 voto non conteggiato')
    # dalla home, dopo aver lasciato la stanza
    await A.goto(BASE + '/index.html'); await A.click('#tileHist'); await asyncio.sleep(0.4)
    ok(code in await A.inner_text('#hubHistory'), f'[{mode}] la serata è nella home (Le tue serate)')
    return code
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await scenario(b, 'conta')
        await scenario(b, 'senza')
        await b.close()
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
