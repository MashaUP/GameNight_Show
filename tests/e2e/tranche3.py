import asyncio, subprocess, base64
from playwright.async_api import async_playwright
from PIL import Image
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t3'); os.makedirs(OUT, exist_ok=True)
SEED = os.path.join(HERE, 'seed.mjs')


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


async def shot(pg, name, full=False):
    await asyncio.sleep(0.35)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def tool_select(host, sel, value):
    await host.click('#hdrTools'); await host.wait_for_selector(sel)
    await host.select_option(sel, value); await asyncio.sleep(0.4)
    await host.click('#tlClose')


async def tool_check(host, sel, on=True):
    await host.click('#hdrTools'); await host.wait_for_selector(sel)
    if on: await host.check(sel)
    else: await host.uncheck(sel)
    await asyncio.sleep(0.4)
    await host.click('#tlClose')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        hctx, host, code = await tv(b, seats=4)
        regia = (await host.inner_text('.lobby-regia b')).strip()
        Actx, A = await join(b, code, 'Andrea', 0)
        G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]
        room = db()['rooms'][code]; gid = room['meta']['groupId']
        players = {u: {'name': pl['name'], **({'memberId': pl['memberId']} if pl.get('memberId') else {})} for u, pl in room['players'].items()}
        players['fakeLuca'] = {'name': 'Luca'}
        nights = json.loads(subprocess.check_output(['node', SEED, json.dumps(players)], cwd=os.path.dirname(SEED)))
        for k, v in nights.items():
            dbset(f'groups/{gid}/nights/{k}', v)
        b1 = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(HERE, 'fixtures', 'box1.png'), 'rb').read()).decode()
        dbset(f'groups/{gid}/photos/OLD7/p1', {'data': b1, 'uid': 'x', 'by': 'Giulia', 'caption': 'La rivincita di Luca', 'at': 1})
        dbset(armlib(code), {
            'l1': {'name': 'Dixit', 'minPlayers': 3, 'maxPlayers': 6, 'duration': 30, 'tags': ['party'], 'addedBy': 'TV'},
            'l2': {'name': 'Sherlock Express', 'minPlayers': 2, 'maxPlayers': 4, 'duration': 20, 'mode': 'cooperativo', 'weight': 1.5, 'tags': ['giallo', 'deduzione'], 'addedBy': 'TV'},
            'l3': {'name': 'Azul', 'minPlayers': 2, 'maxPlayers': 4, 'duration': 45, 'weight': 2, 'status': 'prestato', 'loanTo': 'Luca', 'addedBy': 'TV'},
            'l4': {'name': 'Codenames', 'minPlayers': 4, 'maxPlayers': 8, 'duration': 15, 'mode': 'squadre', 'addedBy': 'TV'},
        })
        await asyncio.sleep(1.2)

        # Regia sul telefono di Andrea (in lobby)
        await A.click('[data-myprofile]'); await A.wait_for_selector('#regiaInput')
        await A.fill('#regiaInput', regia); await A.click('#regiaGo'); await A.wait_for_selector('.regia-fab')
        # QR personale nel profilo
        await A.wait_for_selector('.prof-qr'); await A.click('.prof-qr summary'); await asyncio.sleep(0.3)
        print('QR profilo:', await A.evaluate("Boolean(document.querySelector('#profQr svg'))"))
        await shot(A, '01_profile_qr')
        await A.click('[data-profileback]'); await A.wait_for_selector('#waitList')
        mid = db()['rooms'][code]['players'][[u for u, pl in db()['rooms'][code]['players'].items() if pl['name'] == 'Andrea'][0]].get('memberId')
        nctx, N = await phone(b, 'nuovo')
        await N.goto(f'{BASE}/play.html?profilo={mid}'); await asyncio.sleep(1.5)
        print('profilo collegato dal QR:', await N.evaluate("localStorage.getItem('gnr_profiles')"), '| url:', N.url.split('/')[-1])
        await nctx.close()

        # Musica, effetti, atmosfera, ticker, soundboard, commentatore
        await tool_select(host, '#tlMusic', 'auto')
        await tool_select(host, '#tlAtmo', 'auto')
        await tool_select(host, '#tlComment', 'festa')
        await tool_check(host, '#tlBoard'); await tool_check(host, '#tlTicker')
        await host.click('#hdrTools'); await host.wait_for_selector('#tlMusic'); await shot(host, '02_tools'); await host.click('#tlClose')
        print('musica in lobby:', await host.evaluate('gnrDebug.music()'))
        await host.click('#startBtn'); await host.wait_for_selector('#libPick .lib-chip')
        await asyncio.sleep(0.6)
        print('musica in idle:', await host.evaluate('gnrDebug.music()'), '| atmosfera:', await host.evaluate('gnrDebug.atmo()'))
        print('ticker:', (await host.inner_text('.ticker'))[:160].replace('\n', ' '))

        # Pettegolezzo e soundboard dal telefono
        await G.wait_for_selector('.buzz-fab, .ph-dock [data-dock="timeout"]'); print('pulsante:', await G.inner_text('.buzz-fab, .ph-dock [data-dock="timeout"]'))
        await G.click('.buzz-fab, .ph-dock [data-dock="timeout"]'); await G.wait_for_selector('#gsText')
        await G.fill('#gsText', 'Marco giura di non aver mai barato'); await shot(G, '03_phone_table')
        await G.click('#gsSend'); await asyncio.sleep(0.8)
        await G.click('[data-sfx="applausi"]'); await asyncio.sleep(0.8)
        print('bolla soundboard:', await host.evaluate("document.querySelector('.sfx-bubble')?.textContent"))
        await G.click('[data-bzclose]')
        await asyncio.sleep(0.5)
        print('ticker con pettegolezzo:', 'Marco giura' in await host.inner_text('.ticker'))
        await shot(host, '04_idle_ticker')

        # Atmosfera automatica dal gioco + pronostici
        await host.click('#libPick .lib-chip >> text=Sherlock Express'); await asyncio.sleep(0.4)
        await host.click('#startPlay'); await asyncio.sleep(1)
        print('atmosfera con un giallo:', await host.evaluate('gnrDebug.atmo()'))
        for ph, who in [(A, 'Giulia'), (G, 'Giulia'), (M, 'Andrea')]:
            await ph.wait_for_selector('.bet-banner', timeout=8000)
            await ph.click('.bet-banner'); await ph.wait_for_selector('.dock-sheet .bet-opt')
            await ph.click(f'.dock-sheet .bet-opt >> text={who}'); await asyncio.sleep(0.3)
            await ph.click('.dock-sheet [data-dockclose]')
        await asyncio.sleep(0.8)
        await shot(A, '05_phone_bet')
        print('TV pronostici:', await host.inner_text('#playTimer'))
        await shot(host, '06_idle_bets_rain')
        await host.click('.win-av[title^="Giulia"]')
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await asyncio.sleep(0.6)
        st = db()['rooms'][code]
        gid1 = st['state']['gameId']
        print('pronostici salvati nel gioco:', st['games'][gid1].get('bets') and len(st['games'][gid1]['bets']), '| nodo bets pulito:', 'bets' not in st)
        print('musica durante il voto:', await host.evaluate('gnrDebug.music()'))
        await vote(A, 9, comment='Che indagine!'); await vote(G, 8); await asyncio.sleep(0.8)
        print('musica con un voto mancante:', await host.evaluate('gnrDebug.music()'))
        await vote(M, 4)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(4.5)
        print('reveal pronostici:', await host.evaluate("document.querySelector('.bet-chip')?.textContent"))
        print('sottotitolo commentatore:', await host.evaluate("document.querySelector('#speechCap')?.textContent"))
        print('musica al reveal:', await host.evaluate('gnrDebug.music()'))
        await shot(host, '07_reveal_bet_caption')
        await A.wait_for_selector('.p-bet', state='attached', timeout=5000)
        print('telefono Andrea:', await A.inner_text('.p-bet'))

        # Intervallo dalla regia e da tastiera
        await host.click('#toBoard'); await host.wait_for_selector('.board')
        await A.click('.regia-fab'); await A.wait_for_selector('#rgBody')
        await A.click('.rg-sfx summary'); await A.click('[data-rgsfx="badumtss"]'); await asyncio.sleep(0.8)
        print('soundboard regia:', await host.evaluate("document.querySelector('.sfx-bubble')?.textContent"))
        await A.click('#rgClose')
        await host.keyboard.press('i'); await host.wait_for_selector('#intervalOverlay')
        await shot(host, '08_interval_1')
        cards = []
        for _ in range(3):
            cards.append(await host.evaluate("document.querySelector('#intStage').innerText.replace(/\\n/g,' ').slice(0,90)"))
            await asyncio.sleep(9.2)
        print('intervallo:', cards)
        await shot(host, '09_interval_2')
        await host.keyboard.press('Space'); await asyncio.sleep(0.3)
        print('intervallo chiuso:', not await host.query_selector('#intervalOverlay'))

        # Pausa con curiosità
        await host.keyboard.press('p'); await host.wait_for_selector('#pauseFact')
        print('musica in pausa:', await host.evaluate('gnrDebug.music()'), '| curiosità:', (await host.inner_text('#pauseFact'))[:90])
        await shot(host, '10_pause_fact')
        await host.click('#resumeBtn'); await host.wait_for_selector('#pauseOverlay', state='detached')

        # Atmosfere (giorno e notte)
        for sc in ['pioggia', 'candele', 'neon', 'stelle', 'festa', 'nebbia']:
            await tool_select(host, '#tlAtmo', sc); await asyncio.sleep(0.8)
            await shot(host, f'11_atmo_{sc}')
        await host.evaluate("document.documentElement.dataset.theme='night'")
        for sc in ['neon', 'candele']:
            await tool_select(host, '#tlAtmo', sc); await asyncio.sleep(0.8)
            await shot(host, f'12_atmo_night_{sc}')
        await host.evaluate("document.documentElement.dataset.theme='day'")
        await tool_select(host, '#tlAtmo', 'none')

        # Moderazione: togli il pettegolezzo
        await host.click('#hdrTools'); await host.wait_for_selector('[data-delgossip]')
        await shot(host, '13_tools_gossip')
        await host.click('[data-delgossip]'); await asyncio.sleep(0.6); await host.click('#tlClose')
        print('pettegolezzo tolto:', not db()['rooms'][code].get('gossip'), '| ticker:', 'Marco giura' not in await host.inner_text('.ticker'))

        # QR della ludoteca e pagina ludoteca
        await host.click('#hdrLib'); await host.wait_for_selector('#lpQr'); await host.click('#lpQr'); await host.wait_for_selector('#qpQr svg')
        url = await host.get_attribute('.qr-panel .qr-url a', 'href'); print('link ludoteca:', url)
        await shot(host, '14_lib_qr')
        await host.keyboard.press('Escape'); await asyncio.sleep(0.2)
        print('QR chiuso, ludoteca aperta:', not await host.query_selector('.qr-panel'), bool(await host.query_selector('#lpSearch')))
        await host.keyboard.press('Escape')
        lctx, Lp = await phone(b, 'ludoteca')
        await Lp.goto(url); await Lp.wait_for_selector('.lb-item', timeout=8000)
        print('ludoteca telefono:', await Lp.evaluate("[...document.querySelectorAll('.lb-text b')].map(x=>x.textContent)"))
        await Lp.click('[data-quick="available"]'); await asyncio.sleep(0.3)
        print('solo disponibili:', await Lp.evaluate("[...document.querySelectorAll('.lb-text b')].map(x=>x.textContent)"))
        await Lp.click('[data-quick="available"]'); await Lp.fill('#lbSearch', 'cooperativi'); await asyncio.sleep(0.3)
        print('cooperativi:', await Lp.evaluate("[...document.querySelectorAll('.lb-text b')].map(x=>x.textContent)"))
        await Lp.fill('#lbSearch', ''); await asyncio.sleep(0.2)
        await Lp.click('[data-open="l1"]'); await asyncio.sleep(0.3)
        print('dettaglio Dixit:', (await Lp.inner_text('.lb-more')).replace('\n', ' '))
        await shot(Lp, '15_phone_library', full=True)
        await Lp.evaluate("document.documentElement.dataset.theme='night'"); await shot(Lp, '15b_phone_library_night', full=True)
        await lctx.close()

        # Fine serata: premiazione, resoconto, esportazioni
        await host.wait_for_selector('#endNight'); await host.click('#endNight'); await host.click('#endDialog [data-edgo]')
        await host.wait_for_selector('.awards')
        print('musica alla premiazione:', await host.evaluate('gnrDebug.music()'), '| atmosfera:', await host.evaluate('gnrDebug.atmo()'))
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await asyncio.sleep(1)
        print('premi:', await host.evaluate("[...document.querySelectorAll('.award-front h3')].map(x=>x.textContent)"))
        await host.click('#recapBtn'); await asyncio.sleep(0.6)
        print('resoconto:', (await host.evaluate("document.querySelector('#speechCap')?.textContent") or '')[:220])
        await shot(host, '16_awards_recap')
        await host.click('#shareImg'); await host.wait_for_selector('#exStory')
        await shot(host, '17_export_panel')
        async with host.expect_download() as dl:
            await host.click('#exStory')
        d = await dl.value; path = f'{OUT}/story.png'; await d.save_as(path)
        print('storia:', d.suggested_filename, Image.open(path).size)
        async with host.expect_download() as dl:
            await host.click('#exImg')
        d = await dl.value; await d.save_as(f'{OUT}/board.png'); print('immagine:', d.suggested_filename)
        await host.click('#exPdf'); await asyncio.sleep(1.5)
        html = await host.evaluate("document.getElementById('reportFrame')?.contentDocument.documentElement.outerHTML || ''")
        print('PDF:', len(html), 'Classifica della serata' in html, 'Sherlock Express' in html, 'Il veggente' in html)
        rctx = await b.new_context(viewport={'width': 794, 'height': 1123})
        R = await rctx.new_page(); await R.goto(BASE + '/'); await R.set_content(html); await asyncio.sleep(0.8)
        await R.screenshot(path=f'{OUT}/18_report.png', full_page=True); await rctx.close()
        await host.keyboard.press('Escape')

        # Telefono: storia dai risultati
        await G.wait_for_selector('#storyBtn', timeout=8000)
        async with G.expect_download() as dl:
            await G.click('#storyBtn')
        d = await dl.value; await d.save_as(f'{OUT}/story_phone.png'); print('storia dal telefono:', Image.open(f'{OUT}/story_phone.png').size)
        await shot(G, '19_phone_results', full=True)
        sm = db()['groups'][gid]['nights'][code]
        print('riassunto serata, veggenti:', {pp['name']: pp.get('seer') for pp in sm['people'].values()})
        await b.close()
    print(errs or 'no errors')

try:
    asyncio.run(main())
finally:
    print("ERRS:", errs[:8])
