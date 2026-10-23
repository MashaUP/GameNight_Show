# Telefono in inglese in una serata con la TV in italiano (1.5): ingresso, attesa, voto, time-out,
# premiazione. Nessun testo mancante, codici neutri nel database, ogni dispositivo nella sua lingua.
import asyncio
from playwright.async_api import async_playwright
from common import *

fails = []
missing = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

async def phone_lang(b, name, lang):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=2, locale='en-US' if lang == 'en' else 'it-IT')
    await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off','1'); localStorage.setItem('gnr_tour_phone','1'); localStorage.setItem('gnr_lite','off'); localStorage.setItem('gnr_lang','%s'); } catch (e) {}" % lang)
    ph = await ctx.new_page(); watch(ph, name)
    ph.on('console', lambda m: missing.append(f'[{name}] {m.text}') if '[i18n]' in m.text else None)
    return ph

async def enter(ph, code, name, pick):
    await ph.goto(f'{BASE}/play.html?room={code}'); await ph.wait_for_selector('#nameInput')
    first = await ph.inner_text('body')
    await ph.fill('#nameInput', name); await ph.click(f'.av-opt[data-pick="{pick}"]'); await ph.click('#joinBtn')
    await ph.wait_for_selector('#waitList')
    return first, await ph.inner_text('body')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3, group='Serata bilingue')
        E = await phone_lang(b, 'Emma', 'en')
        I = await phone_lang(b, 'Ivo', 'it')
        join_en, wait_en = await enter(E, code, 'Emma', 0)
        join_it, wait_it = await enter(I, code, 'Ivo', 1)
        ok('Who are you?' in join_en and 'Join the game' in join_en, 'telefono inglese: ingresso in inglese')
        ok('Emma' in wait_en and 'You’re in' in wait_en, 'telefono inglese: attesa in inglese')
        ok('Chi sei?' in join_it and 'Entra in partita' in join_it, 'telefono italiano: ingresso in italiano')
        await host.click('#startBtn')
        # Partita: voto dai due telefoni, reveal
        await host.wait_for_selector('#gameName'); await host.fill('#gameName', 'Azul'); await asyncio.sleep(0.3)
        await host.click('.win-av >> nth=0'); await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(E, 8); await vote(I, 6)
        ok('Vote sent' in await E.inner_text('body'), 'telefono inglese: "Vote sent!"')
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(1)
        await E.screenshot(path=os.path.join(HERE, 'out', 'en_phone_reveal.png'))
        await host.click('#nextGame'); await asyncio.sleep(0.8)
        # Time-out dal telefono inglese: nel database un codice, sulla TV il testo italiano
        await E.click('.buzz-fab, .ph-dock [data-dock="timeout"]'); await E.wait_for_selector('[data-bz="bathroom"]')
        ok('Bathroom break' in await E.inner_text('.tb-reasons'), 'motivi del time-out in inglese')
        await E.click('[data-bz="bathroom"]')
        await host.wait_for_selector('#pauseOverlay', timeout=8000); await asyncio.sleep(0.5)
        reason = (db()['rooms'][code].get('state') or {}).get('pauseReason') or ''
        ok('Pausa bagno' in reason and 'bathroom' not in reason, f'TV italiana: motivo tradotto ({reason})')
        await host.click('#resumeBtn'); await host.wait_for_selector('#pauseOverlay', state='detached')
        # Fine serata e premiazione
        await host.click('#hdrEnd')
        try:
            await host.wait_for_selector('#endDialog', timeout=2500)
            for sel in ('[data-edgo="count"]', '[data-edgo="go"]', '[data-edgo]'):
                if await host.query_selector(sel): await host.click(sel); break
        except Exception:
            pass
        await host.wait_for_selector('.awards', timeout=10000)
        for _ in range(30):
            if await host.is_visible('#reportLink'): break
            if await host.is_visible('#stepBtn'): await host.click('#stepBtn')
            await asyncio.sleep(0.5)
        await asyncio.sleep(1.5)
        t_en = await E.inner_text('body'); t_it = await I.inner_text('body')
        await E.screenshot(path=os.path.join(HERE, 'out', 'en_phone_end.png'), full_page=True)
        ok('MVP della serata' not in t_en and 'Il più ' not in t_en, 'premiazione sul telefono inglese senza titoli italiani')
        nights = (db().get('groups', {}).get(db()['rooms'][code]['meta']['groupId'], {}) or {}).get('nights', {}) or {}
        titles = [x for n in nights.values() for ts in (n.get('titles') or {}).values() for x in (ts if isinstance(ts, list) else list(ts.values()))]
        ok(all(' ' not in x for x in titles), f'titoli salvati come codici, non come testi {titles}')
        await b.close()
    ok(not missing, f'nessun testo mancante {missing[:5]}')
    print('ERRORI:', errs or 'nessuno'); print('FALLITI:', fails or 'nessuno')
    if fails or errs: raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())
