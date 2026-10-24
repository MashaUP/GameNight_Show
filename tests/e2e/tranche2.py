import asyncio, subprocess, time
from datetime import datetime, timedelta
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t2'); os.makedirs(OUT, exist_ok=True)
SEED = os.path.join(HERE, 'seed.mjs')


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


async def shot(pg, name, full=False):
    await asyncio.sleep(0.35)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=4)
        A = (await join(b, code, 'Andrea', 0))[1]; G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]
        room = db()['rooms'][code]; gid = room['meta']['groupId']
        players = {u: {'name': pl['name'], **({'memberId': pl['memberId']} if pl.get('memberId') else {})} for u, pl in room['players'].items()}
        players['fakeLuca'] = {'name': 'Luca'}; players['fakeSara'] = {'name': 'Sara'}
        nights = json.loads(subprocess.check_output(['node', SEED, json.dumps(players)], cwd=os.path.dirname(SEED)))
        for k, v in nights.items():
            dbset(f'groups/{gid}/nights/{k}', v)
        lib = {
            'l1': {'name': 'Dixit', 'minPlayers': 3, 'maxPlayers': 6, 'duration': 30, 'mode': 'competitivo', 'weight': 1.5, 'tags': ['party', 'creatività'], 'addedBy': 'TV'},
            'l2': {'name': 'Codenames', 'minPlayers': 4, 'maxPlayers': 8, 'duration': 15, 'mode': 'squadre', 'weight': 1.5, 'tags': ['party', 'parole'], 'addedBy': 'TV'},
            'l3': {'name': 'Azul', 'minPlayers': 2, 'maxPlayers': 4, 'duration': 45, 'mode': 'competitivo', 'weight': 2, 'tags': ['astratto'], 'addedBy': 'TV'},
            'l4': {'name': 'Just One', 'minPlayers': 3, 'maxPlayers': 7, 'duration': 20, 'mode': 'cooperativo', 'weight': 1, 'tags': ['party', 'parole'], 'addedBy': 'TV'},
            'l5': {'name': 'Cascadia', 'minPlayers': 1, 'maxPlayers': 4, 'duration': 40, 'weight': 2, 'addedBy': 'TV'},
            'l6': {'name': 'Exploding Kittens', 'minPlayers': 2, 'maxPlayers': 5, 'duration': 15, 'addedBy': 'Marco'},
            'l7': {'name': 'Lupus in Tabula', 'minPlayers': 8, 'maxPlayers': 24, 'duration': 30, 'addedBy': 'TV'},
            'l8': {'name': 'Terraforming Mars', 'minPlayers': 1, 'maxPlayers': 5, 'duration': 120, 'weight': 3.5, 'tags': ['strategia'], 'addedBy': 'TV'},
            'l9': {'name': 'Dixit: Odyssey', 'minPlayers': 3, 'maxPlayers': 12, 'duration': 30, 'baseId': 'l1', 'addedBy': 'TV'},
        }
        dbset(armlib(code), lib)
        await asyncio.sleep(1.5)

        # 1. Identità del gruppo
        await host.click('#hdrTools'); await host.wait_for_selector('#tlIdentity'); await host.click('#tlIdentity')
        await host.wait_for_selector('#idSave')
        await host.click('[data-emb="🐉"]'); await host.fill('#idMotto', 'Chi perde lava i piatti'); await host.click('[data-col="#2EC4B6"]')
        await shot(host, '01_identity_panel')
        await host.click('#idSave'); await asyncio.sleep(0.8)
        print('identità:', db()['groups'][gid].get('identity'))
        print('emblema TV:', await host.inner_text('#hdrEmblem'), '| lobby:', (await host.inner_text('#lobbyIdentity')).replace('\n', ' '))
        print('colore gruppo:', await host.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--group')"))
        await shot(host, '02_lobby_identity')
        print('emblema telefono:', await A.evaluate("document.querySelector('[data-emblem]')?.textContent"))

        # 2. Foto ricordo dal telefono
        await A.set_input_files('#memPhoto', os.path.join(HERE, 'fixtures', 'box1.png')); await photo_ok(A)
        await A.wait_for_selector('#phSave'); await A.fill('#phCaption', 'Il tradimento di Marco')
        await shot(A, '03_phone_photo')
        await A.click('#phSave'); await asyncio.sleep(0.8)
        ph = db()['groups'][gid].get('photos', {}).get(code, {})
        print('foto:', [(x['by'], x.get('caption'), len(x['data'])) for x in ph.values()])

        # 3. Ludoteca: ricerca e scheda gioco
        await host.click('#hdrLib'); await host.wait_for_selector('#lpSearch')
        await host.fill('#lpSearch', 'per 4 persone massimo 30 minuti'); await asyncio.sleep(0.5)
        print('ricerca 1:', await host.inner_text('#lpChips'), '→', await host.evaluate("[...document.querySelectorAll('#lpList .lib-name')].map(x=>x.textContent)"))
        await shot(host, '04_lib_search')
        await host.fill('#lpSearch', 'giochi party che Andrea non odia'); await asyncio.sleep(0.5)
        print('ricerca 2:', await host.inner_text('#lpChips'), '→', await host.evaluate("[...document.querySelectorAll('#lpList .lib-name')].map(x=>x.textContent)"))
        await host.fill('#lpSearch', 'cooperativi'); await asyncio.sleep(0.4)
        print('ricerca 3:', await host.evaluate("[...document.querySelectorAll('#lpList .lib-name')].map(x=>x.textContent)"))
        await host.fill('#lpSearch', 'mai giocati'); await asyncio.sleep(0.4)
        print('ricerca 4:', await host.evaluate("[...document.querySelectorAll('#lpList .lib-name')].map(x=>x.textContent)"))
        await host.fill('#lpSearch', 'mars'); await asyncio.sleep(0.4)
        print('ricerca 5:', await host.evaluate("[...document.querySelectorAll('#lpList .lib-name')].map(x=>x.textContent)"))
        await host.fill('#lpSearch', ''); await asyncio.sleep(0.3)
        await host.click('[data-edit="l3"]'); await host.wait_for_selector('#gsSave')
        print('scheda Azul:', (await host.inner_text('.gs-record')).replace('\n', ' '))
        await host.select_option('#gsStatus', 'prestato'); await host.fill('#gsLoan', 'Luca')
        await host.fill('#gsTags', 'astratto, piastrelle'); await host.fill('#gsPub', 'Next Move'); await host.fill('#gsYear', '2017')
        await shot(host, '05_game_sheet')
        await host.click('#gsSave'); await asyncio.sleep(0.6)
        it = db()['armadi'][aid_of(code)]['library']['l3']
        print('Azul salvato:', {k: it.get(k) for k in ('status', 'loanTo', 'tags', 'publisher', 'year', 'weight', 'mode')})
        await asyncio.sleep(0.4); await shot(host, '06_lib_tiles')
        await host.click('#lpClose')

        # 4. Una partita e fine serata
        await host.click('#startBtn'); await host.wait_for_selector('#libPick .lib-chip')
        print('Azul tra le scelte (prestato):', await host.evaluate("[...document.querySelectorAll('#libPick .lib-chip')].filter(x=>x.textContent.includes('Azul')).map(x=>x.className+' / '+x.title)"))
        print('emblema in alto (idle):', await host.inner_text('#hdrEmblem'))
        await shot(host, '06b_idle_emblem')
        await host.click('#libPick .lib-chip >> text=Dixit')
        await host.click('.win-av[title^="Giulia"]')
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(A, 9, comment='Che carte!'); await vote(G, 8); await vote(M, 7)
        await host.wait_for_selector('.reveal', timeout=8000); await asyncio.sleep(1)
        await host.click('#toBoard'); await host.wait_for_selector('.board')
        await host.click('#endNight'); await host.click('#endDialog [data-edgo]'); await host.wait_for_selector('.awards')
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await asyncio.sleep(1)

        # 5. Album sulla TV
        await host.wait_for_selector('#openAlbum'); await host.click('#openAlbum'); await host.wait_for_selector('#alGrid .polaroid')
        await host.set_input_files('#alFile', os.path.join(HERE, 'fixtures', 'box2.png')); await photo_ok(host)
        await wait_js(host, "document.querySelectorAll('#alGrid .polaroid').length === 2", timeout=8000)
        await shot(host, '07_album')
        await host.click('#alShow'); await host.wait_for_selector('.slideshow img'); await shot(host, '08_slideshow')
        await host.click('.slideshow'); await host.click('#alClose')

        # 6. Pagine "di sempre"
        await host.click('#toAllTime'); await host.wait_for_selector('.at-tabs')
        await shot(host, '09_rank')
        for view in ['stats', 'pairs', 'memories', 'wrapped', 'calendar']:
            await host.click(f'[data-view="{view}"]'); await asyncio.sleep(0.4)
            await shot(host, f'10_{view}')
        await host.click('[data-view="pairs"]'); await host.click('.pair-matrix [data-pair] >> nth=1'); await shot(host, '11_pairs_detail')
        print('coppie:', await host.evaluate("[...document.querySelectorAll('.pair-hl')].map(x=>x.innerText.replace(/\\n/g,' '))"))
        print('dettaglio coppia:', (await host.inner_text('.pairs-body .card:last-child')).replace('\n', ' | ')[:220])
        await host.click('[data-view="memories"]'); await asyncio.sleep(0.3)
        print('ricordi:', await host.evaluate("[...document.querySelectorAll('.mem-card .mem-num')].map(x=>x.textContent)"))
        print('otd:', await host.evaluate("document.querySelector('.otd')?.textContent"))
        await host.click(f'.mem-card[data-night="{code}"]'); await host.wait_for_selector('.night-side'); await shot(host, '12_night')
        await host.click('[data-view="memories"]'); await host.click('.mem-card[data-night="OLD3"]'); await asyncio.sleep(0.3); await shot(host, '12b_night_old')
        await host.click('[data-album="OLD3"]'); await host.wait_for_selector('#alGrid'); await asyncio.sleep(0.5)
        print('album serata vecchia:', await host.inner_text('#alGrid')); await host.click('#alClose')
        await host.click('[data-view="wrapped"]'); await asyncio.sleep(0.3)
        slides = []
        for i in range(14):
            # dalla 1.10 alcune diapositive sono elenchi (giochi dell'anno) invece di un numero grande
            slides.append((await host.inner_text('.wr-k')) + ' = ' + (await host.evaluate("(document.querySelector('.wr-big')||document.querySelector('.wr-list'))?.innerText.replace(/\\n/g,' / ')")))
            if i == 2: await shot(host, '13_wrapped_slide')
            await host.keyboard.press('ArrowRight'); await asyncio.sleep(0.15)
        print('wrapped:', slides)
        await host.click('[data-view="calendar"]'); await host.wait_for_selector('#nxForm')
        when = (datetime.now() + timedelta(days=9)).replace(hour=21, minute=0).strftime('%Y-%m-%dT%H:%M')
        await host.fill('#nxAt', when); await host.fill('#nxPlace', 'da Giulia')
        await host.click('#nxForm button[type="submit"]'); await asyncio.sleep(0.8)
        print('prossima serata:', db()['groups'][gid].get('next'))

        # 7. Telefono: RSVP, statistiche avanzate, ricordi, Wrapped
        await A.wait_for_selector('[data-myprofile]', timeout=8000); await A.click('[data-myprofile]')
        await A.wait_for_selector('#myNext [data-rsvp="si"]', timeout=8000)
        await A.click('#myNext [data-rsvp="si"]'); await asyncio.sleep(0.8)
        await G.click('[data-myprofile]'); await G.wait_for_selector('#myNext [data-rsvp="forse"]'); await G.click('#myNext [data-rsvp="forse"]'); await asyncio.sleep(0.8)
        print('rsvp:', db()['groups'][gid]['next'].get('rsvp'))
        print('insights Andrea:', (await A.inner_text('#myInsights')).replace('\n', ' | '))
        print('wrapped Andrea:', (await A.inner_text('#myWrapped')).replace('\n', ' | ')[:200])
        await shot(A, '14_phone_profile', full=True)
        await A.click('#myMemories [data-mem="OLD8"]'); await A.wait_for_selector('#nsAlbum'); await asyncio.sleep(0.6); await shot(A, '15_phone_night')
        await A.click('[data-nsclose]')
        await A.click('#myMemories [data-mem]'); await A.wait_for_selector('#nsAlbum figure', timeout=5000); await asyncio.sleep(0.4); await shot(A, '15b_phone_night_photos')
        await A.click('[data-nsclose]')
        await asyncio.sleep(0.5)
        print('TV presenze:', (await host.inner_text('.rsvp-cols')).replace('\n', ' '))
        await shot(host, '16_calendar_rsvp')

        # 8. Telefono: aggiunta gioco con ricerca in ludoteca
        await M.wait_for_selector('#addGameBtn', timeout=8000); await M.click('#addGameBtn'); await M.wait_for_selector('#agSearch')
        await M.fill('#agSearch', 'per 6 persone'); await asyncio.sleep(0.4)
        print('telefono ricerca:', await M.evaluate("[...document.querySelectorAll('#agItems li')].map(x=>x.innerText.replace(/\\n/g,' '))"))
        await shot(M, '17_phone_addgame', full=True)

        # 9. Tema notte
        for pg in (host, A):
            await pg.evaluate("document.documentElement.dataset.theme='night'")
        await host.click('[data-view="pairs"]'); await shot(host, '18_night_pairs')
        await host.click('[data-view="wrapped"]'); await shot(host, '19_night_wrapped')
        await host.click('[data-view="memories"]'); await shot(host, '20_night_memories')
        await host.click('[data-view="calendar"]'); await shot(host, '20b_night_calendar')
        await host.click('[data-view="stats"]'); await shot(host, '20c_night_stats')
        await shot(A, '21_night_phone_profile', full=True)
        await host.click('#hdrLib'); await host.wait_for_selector('#lpSearch'); await asyncio.sleep(0.4); await shot(host, '22_night_lib')
        await host.click('[data-edit="l3"]'); await host.wait_for_selector('#gsSave'); await shot(host, '23_night_sheet')
        await b.close()
    print(errs or 'no errors')

asyncio.run(main())
