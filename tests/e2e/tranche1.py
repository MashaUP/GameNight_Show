import asyncio
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t1'); os.makedirs(OUT, exist_ok=True)


async def lib_add(host, name, mn, mx, dur):
    await host.fill('#lpName', name)
    await host.select_option('#lpMin', str(mn)); await host.select_option('#lpMax', str(mx)); await host.select_option('#lpDur', str(dur))
    await host.click('#lpSubmit'); await asyncio.sleep(0.4)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=4)
        regia = (await host.inner_text('.lobby-regia b')).strip()
        A = (await join(b, code, 'Andrea', 0))[1]; G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]; S = (await join(b, code, 'Sara', 3))[1]
        await host.click('#lobbyLib'); await host.wait_for_selector('#lpName')
        for g in [('Codenames', 4, 8, 15), ('Dixit', 3, 6, 30), ('Azul', 2, 4, 45), ('Patchwork', 2, 2, 30), ('Just One', 3, 7, 20)]:
            await lib_add(host, *g)
        await host.click('#lpClose')
        print('livello in lobby:', await host.evaluate("[...document.querySelectorAll('.lv-badge')].map(x=>x.textContent)"))

        # Domande della serata: niente Semplicità, una domanda personalizzata, modalità Chaos
        await host.click('#hdrTools'); await host.wait_for_selector('#tlVoting'); await host.click('#tlVoting')
        await host.wait_for_selector('#vpSave'); await host.uncheck('[data-crit="sempl"]')
        await host.click('[data-sugg="Lo consiglieresti?"]'); await host.check('#vpChaos')
        await host.screenshot(path=f'{OUT}/01_voting_panel.png')
        await host.click('#vpSave'); await asyncio.sleep(0.5)
        print('meta voting:', db()['rooms'][code]['meta'].get('voting'), 'chaos:', db()['rooms'][code]['meta'].get('chaos'))

        await host.click('#startBtn'); await host.wait_for_selector('#libPick .lib-chip')
        await host.click('.lib-chip >> text=Codenames'); await host.click('#startPlay'); await asyncio.sleep(2.2)
        print('timer:', (await host.inner_text('#playTimer')).replace('\n', ' '))
        await host.click('.win-av[title^="Andrea"]')
        await host.click('.win-av[title^="Sara"]'); await host.click('.win-av[title^="Sara"]')
        print('stati:', await host.evaluate("[...document.querySelectorAll('.win-av')].map(b=>b.title)"))
        await host.screenshot(path=f'{OUT}/02_idle_states.png')
        await host.click('#openVote'); await host.wait_for_selector('.voting')

        await S.wait_for_selector('#sendVote')
        print('Sara spettatrice:', bool(await S.query_selector('.spectator-note')), '| MVP proposti a Sara:', await S.evaluate("[...document.querySelectorAll('.mvp-n')].map(x=>x.textContent)"))
        print('domande sul telefono:', await A.evaluate("[...document.querySelectorAll('.pips-row')].map(r=>r.dataset.crit)"), '| MVP proposti ad Andrea:', await A.evaluate("[...document.querySelectorAll('.mvp-n')].map(x=>x.textContent)"))
        await A.wait_for_selector('#privNote', state='attached')
        await A.click('.priv-note summary'); await A.fill('#privNote', 'Ricordarsi: il nero perde subito')
        await vote(A, 9, k=5, comment='Spie leggendarie')
        await G.wait_for_selector('#sendVote'); await G.screenshot(path=f'{OUT}/03_phone_vote_na.png', full_page=True)
        await vote(G, 8, k=4, na=('rigioc',))
        await vote(M, 6, k=3)
        await S.screenshot(path=f'{OUT}/04_phone_spectator.png', full_page=True)
        await vote(S, 10, k=5)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(4.5)
        await host.screenshot(path=f'{OUT}/05_reveal.png')
        print('reveal:', await host.evaluate("[...document.querySelectorAll('.aud-chip')].map(x=>x.textContent)"), '| citazioni:', await host.evaluate("[...document.querySelectorAll('.vcard-quote')].map(x=>x.textContent)"))
        room = db()['rooms'][code]
        gid = room['state']['gameId']
        print('giocatori della partita:', sorted(room['players'][u]['name'] for u in room['games'][gid]['players']), '| durata:', room['games'][gid].get('playedMin'))
        print('voti:', {room['players'][u]['name']: {k: v for k, v in vv.items() if k in ('overall', 'coinv', 'rigioc', 'c1', 'comment')} for u, vv in room['votes'][gid].items()})

        # Rivincita
        await host.click('#rematchBtn'); await host.wait_for_selector('#gameName')
        if await host.query_selector('#eventOverlay'):
            await host.click('#evOk')
        print('rivincita:', await host.input_value('#gameName'), '| Sara ancora spettatrice:', bool(await host.query_selector('.win-av--spectator[title^="Sara"]')), '| timer:', await host.is_visible('#playTimer'))
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        for ph, ov in [(A, 7), (G, 7), (M, 8), (S, 6)]:
            await vote(ph, ov, k=3)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(1)
        print('numero partita:', await host.evaluate("[...document.querySelectorAll('.aud-chip')].map(x=>x.textContent).filter(t=>t.includes('partita'))"))

        # Prossimo gioco: evento casuale (Chaos)
        await host.click('#nextGame'); await host.wait_for_selector('#eventOverlay', timeout=6000)
        print('evento:', await host.inner_text('#evTitle'))
        await asyncio.sleep(0.9); await host.screenshot(path=f'{OUT}/06_chaos_event.png')
        await A.wait_for_selector('.event-mini', timeout=6000); await A.screenshot(path=f'{OUT}/07_phone_event.png')
        await host.click('#evOk')

        # Time-out dal telefono di Marco
        await M.click('.buzz-fab, .ph-dock [data-dock="timeout"]'); await M.click('[data-bz="bathroom"]')
        await host.wait_for_selector('#pauseOverlay', timeout=6000); await asyncio.sleep(0.5)
        print('pausa:', await host.inner_text('#pauseKicker'))
        await host.screenshot(path=f'{OUT}/08_timeout.png')
        await host.click('#resumeBtn'); await host.wait_for_selector('#pauseOverlay', state='detached')

        # Consigli
        await host.click('#openReco'); await host.wait_for_selector('#rcBody')
        await asyncio.sleep(0.6); await host.screenshot(path=f'{OUT}/09_reco.png')
        print('consigli:', await host.evaluate("[...document.querySelectorAll('.rc-item')].map(x=>x.querySelector('b').textContent+' '+x.querySelector('.rc-score').textContent)"))
        await host.click('[data-max="30"]'); await asyncio.sleep(0.3)
        print('in 30 minuti:', await host.evaluate("[...document.querySelectorAll('.rc-item b')].map(x=>x.textContent)"))
        await host.click('[data-use] >> nth=0'); await asyncio.sleep(0.3)
        print('scelto dai consigli:', await host.input_value('#gameName'))

        # Regia: Giulia spettatrice, inizia la partita, apri il voto
        await A.click('[data-myprofile]'); await A.wait_for_selector('#regiaInput')
        await A.fill('#regiaInput', regia); await A.click('#regiaGo'); await A.wait_for_selector('.regia-fab')
        await A.click('[data-profileback]'); await A.click('.regia-fab'); await A.wait_for_selector('#rgName')
        await A.fill('#rgName', 'Just One')
        await A.click('[data-rgwin] >> text=Giulia'); await A.click('[data-rgwin] >> text=Giulia')
        await A.click('.sheet [data-cmd="startPlay"]'); await asyncio.sleep(1.5)
        print('timer dalla regia:', db()['rooms'][code]['state'].get('playName'))
        await A.screenshot(path=f'{OUT}/10_regia.png')
        await A.click('.sheet [data-cmd="openVote"]'); await host.wait_for_selector('.voting', timeout=8000); await A.click('#rgClose')
        room = db()['rooms'][code]; print('STATE', room['state']); gid = room['state']['gameId']
        print('Just One, giocatori:', sorted(room['players'][u]['name'] for u in (room['games'][gid].get('players') or {})))
        for ph, ov in [(A, 8), (G, 9), (M, 7), (S, 8)]:
            await vote(ph, ov, k=4)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(1)

        # Fine serata: traguardi
        await host.click('#toBoard'); await host.wait_for_selector('.board')
        await host.click('#endNight'); await host.click('#endDialog [data-edgo]'); await host.wait_for_selector('.awards')
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await asyncio.sleep(0.8)
        print('traguardi sulla TV:', await host.evaluate("[...document.querySelectorAll('.prize-row')].map(r=>r.querySelector('h2').textContent+': '+r.querySelectorAll('.award').length)"))
        await asyncio.sleep(9.5); await host.screenshot(path=f'{OUT}/11_awards.png')
        await A.wait_for_selector('#shareBtn', timeout=8000); await asyncio.sleep(0.5)
        print('risultati Andrea:', (await A.inner_text('.p-awards >> nth=-1')).replace('\n', ' | ')[:200])
        await A.screenshot(path=f'{OUT}/12_phone_results.png', full_page=True)

        # Hall of Fame
        await host.click('#toAllTime'); await host.wait_for_selector('[data-view="hof"]'); await host.click('[data-view="hof"]')
        await host.wait_for_selector('.hof-row'); await asyncio.sleep(0.4)
        await host.screenshot(path=f'{OUT}/13_hof.png')

        # Profilo con livello, traguardi e note: nuova serata dello stesso gruppo
        await host.click('#atBack'); await host.wait_for_selector('#newNight2'); await host.click('#newNight2')
        await host.wait_for_selector('#createBtn'); await host.click('#createBtn'); await host.wait_for_selector('.lobby')
        code2 = host.url.split('room=')[1]
        await A.goto(f'{BASE}/play.html?room={code2}'); await A.wait_for_selector('#joinPerson, #joinMember', timeout=8000); await A.click('#joinPerson, #joinMember')
        await A.wait_for_selector('[data-myprofile]', timeout=8000); await A.click('[data-myprofile]')
        await A.wait_for_selector('.lv-head', timeout=8000); await asyncio.sleep(0.5)
        print('profilo:', await A.inner_text('#myLevel h2'), '|', await A.inner_text('#myAch h2'), '| note:', await A.evaluate("[...document.querySelectorAll('.notes-list b')].map(x=>x.textContent)"))
        await A.screenshot(path=f'{OUT}/14_profile.png', full_page=True)
        await asyncio.sleep(0.5)
        print('livelli in lobby (serata 2):', await host.evaluate("[...document.querySelectorAll('.lv-badge')].map(x=>x.textContent)"))
        await b.close()
    print(errs or 'no errors')

asyncio.run(main())
