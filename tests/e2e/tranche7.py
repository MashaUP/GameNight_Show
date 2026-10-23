import asyncio, json, time
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t7'); os.makedirs(OUT, exist_ok=True)
fails = []


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


def ok(cond, label):
    print(('OK   ' if cond else 'FAIL ') + label)
    if not cond: fails.append(label)


async def shot(pg, name, full=False):
    await asyncio.sleep(0.25)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=5, group='Gruppo Show', w=1600, h=900)
        await asyncio.sleep(0.8)
        # 1. Tema Show di partenza sulla TV, con il palcoscenico animato
        ok(await host.evaluate("document.documentElement.classList.contains('theme-show') && document.documentElement.dataset.theme === 'night'"), 'TV: tema Show di partenza')
        ok(await host.evaluate("window.gnrDebug.atmo()") == 'palco', 'TV: scena palcoscenico sullo sfondo')
        await shot(host, '01_lobby_show')
        A = (await join(b, code, 'Andrea', 0))[1]
        G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]
        ok(not await A.evaluate("document.documentElement.classList.contains('theme-show')"), 'telefono: niente tema Show')

        # 2. Timer del voto dagli Strumenti
        await host.click('#hdrTools'); await host.wait_for_selector('#tlVoteTimer')
        ok(await host.is_visible('[data-theme-set="show"]'), 'Strumenti: opzione tema Show')
        await host.select_option('#tlVoteTimer', '60'); await asyncio.sleep(0.4)
        await shot(host, '02_tools')
        await host.click('#tlClose')
        room = db()['rooms'][code]
        ok(room['meta'].get('voteSeconds') == 60, 'meta.voteSeconds = 60')
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Dixit'); await host.click('#startPlay'); await asyncio.sleep(0.8)
        await host.click('#openVote'); await host.wait_for_selector('.voting'); await asyncio.sleep(1)
        st = db()['rooms'][code]['state']
        ok(st.get('voteSecs') == 60, 'state.voteSecs alla votazione')
        ok(await host.is_visible('#vTimer'), 'TV: anello del timer visibile')
        num = await host.inner_text('#vtNum')
        ok(num in ('59', '60', '58', '1:00', '0:59'), f'TV: secondi rimasti ({num})')
        await A.wait_for_selector('#fuse:not([hidden])', timeout=5000)
        ok(True, 'telefono: miccia visibile')
        await shot(A, '03_phone_fuse')
        w = await A.evaluate("parseFloat(document.querySelector('#fuseRope').style.width)")
        ok(90 < w <= 100, f'miccia quasi intera ({w:.1f}%)')
        # Voti di due giocatori su tre: flash sulla carta di chi vota
        await vote(A, 8, mvp=1)
        await host.wait_for_selector('.voter.is-fresh', timeout=5000)
        ok(await host.query_selector('.voter-flash') is not None, 'TV: lampo sulla carta di chi ha votato')
        ok(await host.query_selector('.voter-think') is not None, 'TV: puntini "sta pensando" su chi manca')
        # Pausa: il timer si ferma
        await host.keyboard.press('p'); await asyncio.sleep(1.2)
        paused = await host.evaluate("document.querySelector('#vTimer').classList.contains('is-paused')")
        if not paused:
            await host.click('#hdrTools'); await host.click('#tlPause'); await asyncio.sleep(1.2)
            paused = await host.evaluate("document.querySelector('#vTimer').classList.contains('is-paused')")
        ok(paused, 'TV: timer in pausa')
        await asyncio.sleep(1.5)
        for _ in range(3):
            if await host.query_selector('#resumeBtn'): await host.click('#resumeBtn'); await asyncio.sleep(0.8)
        if await host.query_selector('#tlClose'): await host.click('#tlClose')
        await asyncio.sleep(0.8)
        st = db()['rooms'][code]['state']
        ok(not st.get('paused') and (st.get('votePaused') or 0) >= 1000, f"pausa sottratta al timer ({st.get('votePaused')} ms)")
        # Ultimi secondi: anello rosso che pulsa
        dbset(f'rooms/{code}/state/at', int(time.time() * 1000) - 53000 - (st.get('votePaused') or 0))
        await asyncio.sleep(1)
        ok(await host.evaluate("document.querySelector('#vTimer').classList.contains('is-hot')"), 'TV: ultimi secondi (is-hot)')
        await shot(host, '04_tv_hot'); await shot(G, '05_phone_hot')
        # Tempo scaduto: chi non ha votato trema; con "rivela da sola" parte il reveal
        await host.click('#hdrTools'); await host.check('#tlVoteAuto'); await asyncio.sleep(0.4); await host.click('#tlClose')
        ok(db()['rooms'][code]['meta'].get('voteAuto') is True, 'meta.voteAuto')
        await wait_js(host, "document.querySelector('#voters')?.classList.contains('voters--late')", 12000)
        ok(await host.evaluate("document.querySelector('#vTimer').classList.contains('is-over')"), 'TV: tempo scaduto (is-over)')
        ok(True, 'TV: ritardatari che tremano')
        await shot(host, '06_tv_over'); await shot(G, '07_phone_over')
        await host.wait_for_selector('.reveal', timeout=8000)
        ok(True, 'reveal automatico allo scadere')
        # 3. Reveal a ritmo crescente
        ds = await host.evaluate("[...document.querySelectorAll('.vcard')].map(c => parseFloat(c.style.getPropertyValue('--d')))")
        print('ritardi delle carte:', ds)
        await shot(host, '08_reveal')
        await host.click('#nextGame'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Azul'); await host.click('#startPlay'); await asyncio.sleep(0.6)
        await host.click('#hdrTools'); await host.select_option('#tlVoteTimer', '0'); await host.click('#tlClose')
        await host.click('#openVote'); await host.wait_for_selector('.voting'); await asyncio.sleep(0.8)
        ok(await host.is_hidden('#vTimer'), 'timer spento: niente anello')
        ok(await A.is_hidden('#fuse'), 'timer spento: niente miccia')
        # 4. MVP trascinando la carta sul tavolo
        await A.wait_for_selector('#sendVote')
        await set_range(A, '#overall', 9)
        vc = await A.evaluate("document.querySelector('#overall').style.getPropertyValue('--vc')")
        ok(vc.startswith('rgb'), f'slider gigante colorato ({vc})')
        for crit in await A.evaluate("[...document.querySelectorAll('.pips-row')].map(r=>r.dataset.crit)"):
            await A.click(f'.pips-row[data-crit="{crit}"] [data-k="4"]')
        card = await A.query_selector('.mvp-card >> nth=0')
        await card.scroll_into_view_if_needed()
        bb = await card.bounding_box(); sb = await (await A.query_selector('#mvpSlot')).bounding_box()
        await A.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
        await A.mouse.down()
        for k in range(1, 9):
            await A.mouse.move(bb['x'] + bb['width'] / 2 + k * 4, bb['y'] + bb['height'] / 2 - (bb['y'] - sb['y']) * k / 8)
            await asyncio.sleep(0.03)
        ok(await A.query_selector('.mvp-ghost') is not None, 'carta sollevata mentre si trascina')
        await shot(A, '09_phone_drag')
        await A.mouse.up(); await asyncio.sleep(0.5)
        pressed = await A.evaluate("document.querySelector('.mvp-card').getAttribute('aria-pressed')")
        ok(pressed == 'true', 'MVP scelto trascinando la carta')
        ok(await A.query_selector('#mvpSlot .mvp-played') is not None, 'carta MVP sul tavolo')
        ok(await A.query_selector('.mvp-ghost') is None, 'niente carte fantasma rimaste')
        await shot(A, '10_phone_played', full=True)
        await A.click('[data-mvpclear]'); await asyncio.sleep(0.3)
        ok(await A.evaluate("document.querySelector('.mvp-card').getAttribute('aria-pressed')") == 'false', 'MVP tolto dal tavolo')
        await A.click('.mvp-btn >> nth=1'); await asyncio.sleep(0.2)
        ok(await A.evaluate("document.querySelectorAll('.mvp-card')[1].getAttribute('aria-pressed')") == 'true', 'MVP scelto toccando la carta')
        await A.click('#sendVote'); await A.wait_for_selector('#editVote')
        ok(db()['rooms'][code]['votes'] is not None, 'voto inviato')
        await vote(G, 7, mvp=0); await vote(M, 6, mvp=0)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(4)
        # 5. Premiazione con i campioni della serata
        await host.click('#toBoard'); await host.wait_for_selector('.board'); await asyncio.sleep(0.5)
        await host.evaluate("document.querySelector('#endNight').click()"); await host.click('#endDialog [data-edgo]'); await asyncio.sleep(0.5)
        if await host.query_selector('#icGo'): await host.click('#icGo')
        await host.wait_for_selector('.awards', timeout=8000)
        ok(await host.query_selector('#awChamps') is not None, 'TV: podio dei campioni presente')
        saw_players = False; saw_fx = False; i = 0
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); i += 1; await asyncio.sleep(0.35)
            if await host.evaluate("document.querySelector('#awSec').classList.contains('stage-players')"):
                saw_players = True
                if await host.query_selector('.champ-who.is-climbing'): await shot(host, f'11_champ_{i}')
            if await host.query_selector('.fx-layer'): saw_fx = True
            await asyncio.sleep(1.1)
            if await host.query_selector('.fx-layer'): saw_fx = True
        ok(saw_players, 'TV: tappa "Campioni della serata"')
        ok(saw_fx, 'TV: fuochi d\'artificio / coriandoli su canvas')
        ok(await host.query_selector('.champ-who.is-hidden') is None, 'tutti i campioni svelati')
        await host.click('[data-stage="players"]'); await asyncio.sleep(0.5); await shot(host, '12_champions')
        await host.click('[data-stage="podium"]'); await asyncio.sleep(0.5); await shot(host, '13_podium')
        await A.wait_for_selector('.p-champs', timeout=8000)
        ok(True, 'telefono: campioni nei risultati'); await shot(A, '14_phone_results', full=True)
        # 6. Cambio tema e Safe Mode (niente effetti su canvas)
        await host.click('#hdrTools'); await host.click('[data-theme-set="night"]'); await asyncio.sleep(0.4)
        ok(not await host.evaluate("document.documentElement.classList.contains('theme-show')"), 'TV: tema Notte senza Show')
        ok(await host.evaluate("localStorage.getItem('gnr_theme_tv')") == 'night', 'scelta del tema salvata per la TV')
        await host.click('[data-theme-set="show"]'); await asyncio.sleep(0.4); await host.click('#tlClose')
        ok(await host.evaluate("document.documentElement.classList.contains('theme-show')"), 'TV: di nuovo Show')
        await host.evaluate("localStorage.setItem('gnr_safe','1')"); await host.reload(); await host.wait_for_selector('.awards'); await asyncio.sleep(0.8)
        await host.evaluate("import('./js/fx.js').then(m => m.fireworks(5))"); await asyncio.sleep(0.4)
        ok(await host.query_selector('.fx-layer') is None, 'Safe Mode: niente fuochi')
        ok(await host.evaluate("window.gnrDebug.atmo()") == 'none', 'Safe Mode: niente palcoscenico animato')
        await host.evaluate("localStorage.setItem('gnr_safe','0')")
        await b.close()
    print('\nFALLITI:', fails or 'nessuno')
    print(errs or 'no errors')

asyncio.run(main())
