import asyncio, json, time
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t8'); os.makedirs(OUT, exist_ok=True)
fails = []


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


def ok(cond, label):
    print(('OK   ' if cond else 'FAIL ') + label)
    if not cond: fails.append(label)


async def shot(pg, name, full=False):
    await asyncio.sleep(0.3)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)

CSV = 'objectname,objectid,own,minplayers,maxplayers,playingtime,yearpublished,avgweight\n"Azul",230802,1,2,4,45,2017,1.76\n"Just One",254640,1,3,7,20,2018,1.05\n"Cascadia",295947,1,1,4,45,2021,1.85\n"Codenames",178900,1,2,8,15,2015,1.27\n"Venduto",1,0,2,4,30,2000,1\n'


async def main():
    csv_path = os.path.join(OUT, 'collezione.csv'); open(csv_path, 'w').write(CSV)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=5, group='Gruppo 2.8', w=1600, h=900)
        A = (await join(b, code, 'Andrea', 0))[1]
        G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]
        gid = db()['rooms'][code]['meta']['groupId']
        # 1. Import CSV di BoardGameGeek
        await host.click('#hdrLib'); await host.wait_for_selector('#lpCsv')
        await host.set_input_files('#lpCsvFile', csv_path); await asyncio.sleep(1.2)
        lib = db()['armadi'][aid_of(code)].get('library', {})
        names = sorted(it['name'] for it in lib.values())
        ok(names == ['Azul', 'Cascadia', 'Codenames', 'Just One'], f'CSV BoardGameGeek importato ({names})')
        az = next(it for it in lib.values() if it['name'] == 'Azul')
        ok(az.get('minPlayers') == 2 and az.get('maxPlayers') == 4 and az.get('duration') == 45 and az.get('year') == 2017, 'dati del gioco dal CSV')
        await host.click('#lpClose')
        await host.click('#startBtn'); await host.wait_for_selector('#gameName'); await asyncio.sleep(0.6)
        # 2. Chi inizia (ruota)
        await host.click('#openTable'); await host.wait_for_selector('#tbSpin')
        await shot(host, '01_wheel_start')
        await host.click('#tbSpin'); await asyncio.sleep(2.5); await shot(host, '02_wheel_spinning')
        await wait_js(host, "!!document.querySelector('#tbResult b')", 9000); await asyncio.sleep(0.6)
        st = db()['rooms'][code].get('table', {}).get('starter')
        ok(bool(st and st.get('uid')), f"chi inizia salvato ({st and st.get('name')})")
        await shot(host, '03_wheel_done')
        await A.wait_for_selector('.tb-line', timeout=5000)
        ok('Inizia' in await A.inner_text('#idleTable'), 'telefono: chi inizia')
        # 3. Squadre
        await host.click('[data-tb="teams"]'); await host.click('[data-teams="2"]'); await asyncio.sleep(0.8)
        teams = db()['rooms'][code]['table'].get('teams')
        ok(teams and len(teams) == 2 and sorted(len(t) for t in teams) == [1, 2], f'squadre equilibrate {teams}')
        await shot(host, '04_teams')
        await wait_js(A, "document.querySelector('.tb-line--team') !== null", 5000)
        ok('Sei nei' in await A.inner_text('#idleTable'), 'telefono: la mia squadra')
        # 4. Timer condiviso (dalla 1.6 al posto della clessidra)
        await host.click('[data-tb="timer"]'); await host.click('[data-tm="start"][data-secs="30"]'); await asyncio.sleep(1.5)
        ok((await host.inner_text('[data-shtimer="panel"] .sh-num')).strip() in ('0:28', '0:29', '0:30'), 'timer sulla TV')
        await shot(host, '05_sand')
        await A.wait_for_selector('#shTimerChip', timeout=5000)
        ok(True, 'timer sul telefono'); await shot(A, '06_phone_table')
        await host.click('#tbClose'); await asyncio.sleep(0.5)
        ok(await host.query_selector('#shTimerChip') is not None, 'TV: chip del timer con il pannello chiuso')
        await host.click('#shTimerChip'); await host.wait_for_selector('[data-tm="clear"]'); await host.click('[data-tm="clear"]'); await host.click('#tbClose'); await asyncio.sleep(0.5)
        # 5. Ruota dei giochi
        await host.click('#openWheel'); await host.wait_for_selector('#gwSpin'); await shot(host, '07_gamewheel')
        await host.click('#gwSpin')
        await wait_js(host, "!document.querySelector('#gameWheel')", 12000)
        chosen = await host.input_value('#gameName')
        ok(chosen in ['Azul', 'Just One', 'Cascadia', 'Codenames'], f'la ruota ha scelto un gioco adatto ({chosen})')
        # 6. Segnapunti dal vivo
        await host.fill('#gameName', 'Azul'); await host.click('#startPlay'); await asyncio.sleep(1)
        async def score_sheet(ph):
            await ph.wait_for_selector('.ph-dock [data-dock="score"]', timeout=5000)
            await ph.click('.ph-dock [data-dock="score"]'); await ph.wait_for_selector('.dock-sheet .sc-btn')
        await score_sheet(A)
        for d in ['5', '1', '1']: await A.click(f'[data-sc="{d}"]'); await asyncio.sleep(0.15)
        await score_sheet(G); await G.click('[data-sc="5"]')
        await score_sheet(M); await M.click('[data-sc="-1"]')
        await asyncio.sleep(1.2)
        pid = db()['rooms'][code]['state']['playId']
        sc = db()['rooms'][code].get('scores', {}).get(pid, {})
        ok(sorted(sc.values()) == [-1, 5, 7], f'punteggi salvati {sc}')
        await host.wait_for_selector('#liveScores', timeout=5000)
        ok('7' in await host.inner_text('#liveScores'), 'TV: classifica dal vivo')
        await shot(host, '08_live_scores'); await shot(G, '09_phone_score')
        await host.click('#openVote'); await host.wait_for_selector('.voting'); await asyncio.sleep(0.8)
        room = db()['rooms'][code]; g = room['games'][room['state']['gameId']]
        ua = next(u for u, pl in room['players'].items() if pl['name'] == 'Andrea')
        ok(list((g.get('winners') or {}).keys()) == [ua], 'vince chi ha più punti nel segnapunti')
        ok(g.get('scores', {}).get(ua) == 7, 'punteggi salvati con il gioco')
        ok(not room.get('scores'), 'segnapunti azzerato dopo il voto')
        for ph, v in ((A, 8), (G, 7), (M, 9)): await vote(ph, v, mvp=0)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(4)
        ok(await host.query_selector('.score-chip') is not None, 'reveal: punteggi della partita')
        # 7. Quiz del gruppo
        await host.click('#toBoard'); await host.wait_for_selector('.board')
        await host.keyboard.press('q'); await host.wait_for_selector('#qzNext'); await shot(host, '10_quiz_intro')
        total = 0
        for qi in range(5):
            await host.click('#qzNext'); await asyncio.sleep(0.8)
            for i, ph in enumerate((A, G, M)):
                await ph.wait_for_selector('.qs-opt', timeout=5000)
                await ph.click(f'.qs-opt[data-qa="{i % 2}"]')
            if qi == 0: await shot(A, '11_phone_quiz'); await asyncio.sleep(0.2)
            await wait_js(host, "document.querySelector('.qz-opt.is-right') !== null", 8000)
            if qi == 0: await shot(host, '12_quiz_reveal'); await shot(A, '13_phone_quiz_reveal')
            q = db()['rooms'][code]['quiz']
            total += sum(1 for i in range(3) if i % 2 == q['correct'])
        await host.click('#qzNext'); await asyncio.sleep(0.8)
        qs = db()['rooms'][code].get('quizScore', {})
        ok(sum(qs.values()) == total, f'punti del quiz coerenti ({qs}, attesi {total})')
        await shot(host, '14_quiz_final')
        await A.wait_for_selector('.qz-rank--phone', timeout=5000); ok(True, 'telefono: classifica del quiz')
        await host.click('#qzClose'); await asyncio.sleep(0.8)
        ok(not db()['rooms'][code].get('quiz'), 'quiz chiuso e cancellato')
        ok(await A.query_selector('.quiz-sheet') is None, 'telefono: quiz chiuso')
        # 8. Stagione, rivalità, figurine
        await host.click('#showAllTime'); await host.wait_for_selector('.at-tabs')
        await host.click('[data-view="season"]'); await asyncio.sleep(0.6)
        ok(await host.query_selector('.season-row') is not None, 'scheda Stagione'); await shot(host, '15_season')
        await host.click('[data-view="rivals"]'); await asyncio.sleep(0.6); await shot(host, '16_rivals')
        await host.click('[data-view="cards"]'); await asyncio.sleep(0.6)
        ok(len(await host.query_selector_all('.gcard')) == 3, 'figurine dei 3 giocatori'); await shot(host, '17_cards')
        await host.click('[data-view="calendar"]'); await asyncio.sleep(0.5)
        await host.fill('#nxAt', '2026-12-18T21:00'); await host.fill('#nxPlace', 'Da Giulia'); await host.click('#nxForm button[type="submit"]'); await asyncio.sleep(0.8)
        async with host.expect_download() as dl:
            await host.click('#nxIcs')
        d = await dl.value; txt = open(await d.path()).read()
        ok(txt.startswith('BEGIN:VCALENDAR') and 'LOCATION:Da Giulia' in txt, 'invito .ics')
        # 9. Profilo sul telefono: figurina e rivalità
        await A.wait_for_selector('[data-myprofile]', timeout=8000); await A.click('[data-myprofile]'); await asyncio.sleep(1.5)
        ok(await A.query_selector('#myCard .gcard') is not None, 'telefono: la mia figurina')
        ok(await A.query_selector('[data-ics]') is not None, 'telefono: aggiungi al calendario')
        await A.evaluate("document.querySelector('#myCard').scrollIntoView()"); await shot(A, '18_phone_card')
        await A.click('[data-profileback]'); await asyncio.sleep(0.6)
        regia = await host.evaluate(f"localStorage.getItem('gnr_regia_{code}')")
        await M.click('[data-myprofile]'); await M.wait_for_selector('#regiaInput'); await M.fill('#regiaInput', regia); await M.click('#regiaGo')
        await M.wait_for_selector('.regia-fab', timeout=5000); await asyncio.sleep(1)
        await host.click('#atBack'); await asyncio.sleep(0.6)
        # 10. Sicurezza: allarme, codice regia, privacy, scadenza
        await host.click('#hdrTools'); await host.check('#tlLock'); await asyncio.sleep(0.4); await host.click('#tlClose')
        X = (await phone(b, 'Intruso'))[1]
        await X.goto(f'{BASE}/play.html?room={code}'); await asyncio.sleep(2)
        await host.wait_for_selector('#knockAlarm', timeout=6000)
        ok('stanza chiusa' in await host.inner_text('#knockAlarm'), 'allarme intrusi sulla TV'); await shot(host, '19_knock')
        await M.wait_for_selector('.regia-fab', timeout=5000)
        regia = await host.evaluate(f"localStorage.getItem('gnr_regia_{code}')")
        await host.click('#hdrTools'); await host.click('#tlRegiaNew'); await asyncio.sleep(1.2)
        new = await host.evaluate(f"localStorage.getItem('gnr_regia_{code}')")
        ok(new and new != regia and db()['secrets'][code] == new, 'codice regia cambiato')
        await wait_js(M, "!document.querySelector('.regia-fab')", 6000)
        ok(True, 'il telefono regia perde la regia')
        old_at = int(time.time() * 1000) - 50 * 86400000
        dbset('rooms/OLD9', {'meta': {'hostUid': 'x', 'groupId': gid, 'createdAt': old_at}, 'state': {'phase': 'lobby'}})
        dbset(f'groups/{gid}/nights/OLD9', {'at': old_at, 'games': {'g': {'name': 'Vecchio', 'n': 1, 'sum': 7}}, 'people': {}})
        await host.check('#tlPrivate'); await asyncio.sleep(0.5)
        await host.select_option('#tlExpire', '30'); await asyncio.sleep(2)
        pr = db()['groups'][gid].get('privacy', {})
        ok(pr.get('private') is True and pr.get('expireDays') == 30, f'privacy del gruppo {pr}')
        ok('OLD9' not in db()['rooms'], 'stanza vecchia cancellata')
        ok('OLD9' in db()['groups'][gid]['nights'], 'la serata vecchia resta nello storico')
        await host.select_option('#tlLite', 'on'); await asyncio.sleep(0.3)
        ok(await host.evaluate("document.documentElement.classList.contains('lite')"), 'modalità leggera accesa')
        await host.select_option('#tlLite', 'off'); await host.click('#tlClose')
        # 11. Premiazione: stagione e video
        await host.evaluate("document.querySelector('#toBoard')?.click()"); await asyncio.sleep(0.5)
        if not await host.query_selector('#endNight'):
            await host.click('#showBoard') if await host.query_selector('#showBoard') else None
        await host.wait_for_selector('#endNight', timeout=6000)
        await host.evaluate("document.querySelector('#endNight').click()"); await host.click('#endDialog [data-edgo]'); await asyncio.sleep(0.5)
        if await host.query_selector('#icGo'): await host.click('#icGo')
        await host.wait_for_selector('.awards', timeout=8000)
        saw = False
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.4)
            if await host.evaluate("document.querySelector('#awSec').classList.contains('stage-season')"):
                if not saw: await asyncio.sleep(0.6); await shot(host, '20_awards_season')
                saw = True
        ok(saw, 'premiazione: tappa della stagione')
        await host.click('#shareImg'); await host.wait_for_selector('#exVideo'); await host.click('#exVideo')
        await host.wait_for_selector('#vdGo'); await host.click('#vdGo')
        await asyncio.sleep(4); await shot(host, '21_video_recording')
        await host.wait_for_selector('#vdSave', timeout=60000)
        await asyncio.sleep(1.5)
        info = await host.inner_text('#vdBody')
        rs = await host.evaluate("document.querySelector('.vd-preview').readyState")
        ok('MB' in info and rs >= 1, f'video creato ({info.splitlines()[0] if info else ""}, readyState {rs})')
        await shot(host, '22_video_done')
        async with host.expect_download() as dl:
            await host.click('#vdSave')
        d = await dl.value
        ok(d.suggested_filename.endswith('.webm') or d.suggested_filename.endswith('.mp4'), f'video scaricato {d.suggested_filename}')
        await b.close()
    print('\nFALLITI:', fails or 'nessuno')
    print(errs or 'no errors')

asyncio.run(main())
