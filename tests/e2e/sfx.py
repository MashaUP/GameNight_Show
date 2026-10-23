import asyncio
from playwright.async_api import async_playwright
from common import *
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
SPY = """(() => { const AC = window.AudioContext; let made = 0; window.__osc = 0;
  window.AudioContext = function (...a) { const c = new AC(...a); made++; window.__ac = c;
    const o = c.createOscillator.bind(c); c.createOscillator = () => { window.__osc++; return o(); };
    const b = c.createBufferSource.bind(c); c.createBufferSource = () => { window.__osc++; return b(); }; return c; }; })();"""
async def main():
    async with async_playwright() as p:
        # autoplay come su un tablet: l'audio parte solo dopo un gesto
        b = await p.chromium.launch(args=['--autoplay-policy=user-gesture-required'])
        hctx, host, code = await tv(b, seats=3, group='Gruppo Suoni')
        await host.add_init_script(SPY)
        phs = [(await join(b, code, n, i))[1] for i, n in enumerate(['Ada', 'Bruno'])]
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        # ricarica senza toccare la TV: l'audio è bloccato
        await host.reload(); await host.wait_for_selector('#gameName'); await asyncio.sleep(2.2)
        st0 = await host.evaluate("window.__ac ? window.__ac.state : 'none'")
        hint = await host.is_visible('.audio-hint')
        ok(hint == (st0 != 'running'), f'avviso “tocca per attivare l’audio” solo se l’audio è davvero bloccato (stato {st0}, avviso {hint})')
        if not hint:
            await host.evaluate("window.__ac.suspend()"); await host.evaluate("document.querySelector('.audio-hint')?.remove()")
        A, B = phs
        await A.wait_for_selector('[data-dock="sfx"], .dock-btn', timeout=8000)
        btn = await A.query_selector('[data-dock="sfx"]') or await A.query_selector('.dock-btn >> text=Suoni')
        await btn.click(); await A.wait_for_selector('.sfx-grid--big [data-sfx]')
        await A.click('.sfx-grid--big [data-sfx="applausi"]'); await asyncio.sleep(1.2)
        bub = await host.inner_text('.sfx-bubble') if await host.query_selector('.sfx-bubble') else ''
        ok('Ada' in bub and 'attivare' in bub, f'effetto ricevuto, con il motivo se non si sente: “{bub}”')
        # tocco sulla TV (dito che si alza): l'audio si sblocca
        if await host.is_visible('.audio-hint'): await host.click('.audio-hint')
        else: await host.click('#gameName')
        await asyncio.sleep(0.6)
        st = await host.evaluate("window.__ac ? window.__ac.state : 'none'")
        ok(st == 'running' and not await host.is_visible('.audio-hint'), f'tocco: audio attivo ({st}) e avviso sparito')
        n0 = await host.evaluate('window.__osc')
        await asyncio.sleep(4.2)
        await A.click('.sfx-grid--big [data-sfx="tromba"]'); await asyncio.sleep(0.3)
        bs = await B.query_selector('[data-dock="sfx"]') or await B.query_selector('.dock-btn >> text=Suoni')
        await bs.click(); await B.wait_for_selector('.sfx-grid--big [data-sfx]'); await B.click('.sfx-grid--big [data-sfx="risate"]')
        await asyncio.sleep(0.6)
        n1 = await host.evaluate('window.__osc')
        ok(n1 > n0, f'gli effetti suonano davvero (nodi audio creati: {n1 - n0})')
        await asyncio.sleep(1.6)
        n2 = await host.evaluate('window.__osc')
        ok(n2 > n1, 'due telefoni insieme: il secondo effetto parte dopo il primo, non sopra')
        # ripetizioni troppo veloci: bloccate dal telefono e dalle regole
        await A.click('.sfx-grid--big [data-sfx="tromba"]'); await asyncio.sleep(0.5)
        ok('aspetta' in (await A.inner_text('#toast')).lower(), 'tocchi ripetuti: “aspetta qualche secondo”')
        # TV in silenzioso: il motivo compare
        await host.evaluate("localStorage.setItem('gnr_mute','1')"); await asyncio.sleep(4.2)
        await A.click('.sfx-grid--big [data-sfx="ciak"]'); await asyncio.sleep(1)
        bub = await host.inner_text('.sfx-bubble') if await host.query_selector('.sfx-bubble') else ''
        ok('silenzioso' in bub, f'TV in silenzioso: lo dice ({bub})')
        await host.evaluate("localStorage.setItem('gnr_mute','0')")
        await b.close()
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
