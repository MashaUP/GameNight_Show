import asyncio, json
import common
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t6'); os.makedirs(OUT, exist_ok=True)


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


async def shot(pg, name, full=False):
    await asyncio.sleep(0.3)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1. Tutorial al primo avvio (contesto "pulito", senza disattivare i giri)
        common.NO_TOURS = False
        tctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        T = await tctx.new_page(); watch(T, 'tour')
        await T.goto(BASE + '/host.html'); await T.wait_for_selector('.tour-tip', timeout=8000)
        print('tutorial creazione:', (await T.inner_text('.tour-step')), '|', await T.inner_text('#tourTitle'))
        await shot(T, '01_tour_create')
        for _ in range(10):
            if not await T.query_selector('.tour-tip'): break
            await T.click('[data-tour="next"]'); await asyncio.sleep(0.3)
        print('tutorial chiuso:', not await T.query_selector('.tour'))
        await T.fill('#groupName', 'Gruppo tutorial'); await T.click('#createBtn'); await T.wait_for_selector('.lobby')
        await T.wait_for_selector('.tour-tip', timeout=8000)
        print('tutorial lobby:', await T.inner_text('#tourTitle')); await shot(T, '02_tour_lobby')
        await T.click('[data-tour="skip"]'); await asyncio.sleep(0.3)
        print('saltato, niente altri giri:', await T.evaluate("localStorage.getItem('gnr_tour_off')"))
        Fctx, F = await phone(b, 'Primo')
        await F.goto(f'{BASE}/play.html?room={T.url.split("room=")[1]}'); await F.wait_for_selector('#nameInput')
        await F.fill('#nameInput', 'Primo'); await F.click('.av-opt[data-pick="0"]'); await F.click('#joinBtn')
        await F.wait_for_selector('.ft-list', timeout=6000); print('aiuto al primo ingresso sul telefono:', await F.inner_text('#ftTitle'))
        await shot(F, '03_phone_first_help')
        await tctx.close(); await Fctx.close()
        common.NO_TOURS = True

        # 2. Modalità prova con giocatori finti e reveal cinematico
        dctx = await b.new_context(viewport={'width': 1280, 'height': 720}, accept_downloads=True)
        await dctx.add_init_script("localStorage.setItem('gnr_tour_off','1')")
        D = await dctx.new_page(); watch(D, 'demo')
        await D.goto(BASE + '/host.html'); await D.wait_for_selector('#demoBtn'); await D.click('#demoBtn')
        await D.wait_for_selector('.lobby'); await asyncio.sleep(4.5)
        dcode = D.url.split('room=')[1]
        bots = [pl['name'] for u, pl in db()['rooms'][dcode]['players'].items() if u.startswith('bot_')]
        print('giocatori finti:', bots, '| chip prova:', await D.inner_text('.chip--demo'))
        await shot(D, '04_demo_lobby')
        await D.click('#startBtn'); await D.wait_for_selector('#gameName'); await D.fill('#gameName', 'Dixit')
        await D.click('#startPlay'); await asyncio.sleep(5.5)
        st = db()['rooms'][dcode]
        print('pronostici dei finti:', len((st.get('bets') or {}).get(st['state'].get('playId'), {})))
        await D.click('#openVote'); await D.wait_for_selector('.reveal', timeout=20000)
        await asyncio.sleep(2.2); await shot(D, '05_cine_dim')
        print('reveal cinematico:', bool(await D.query_selector('.reveal--cine')), '| carte al ralenti:', await D.evaluate("document.querySelectorAll('.vcard.is-slow').length"))
        await asyncio.sleep(6); await shot(D, '06_cine_end')
        print('niente serata nel gruppo:', db()['rooms'][dcode]['meta'].get('groupId') is None)
        await dctx.close()

        # 3. Gruppo: membri, chiave, anti-spam, profili ricordati, "Sei tu?"
        hctx, host, code = await tv(b, seats=5)
        A = (await join(b, code, 'Andrea', 0))[1]
        Gctx, G = await join(b, code, 'Giulia', 1)
        await asyncio.sleep(1.5)
        r = db(); gid = r['rooms'][code]['meta']['groupId']
        uids = r['groups'][gid].get('uids') or {}
        print('membri registrati dalla TV:', sorted(r['rooms'][code]['players'][u]['name'] for u in uids if u in r['rooms'][code]['players']))
        print('chiave del gruppo creata:', bool(r.get('groupKeys', {}).get(gid)), '| salvata sulla TV:', bool(await host.evaluate(f"localStorage.getItem('gnr_gkey_{gid}')")))
        ua = next(u for u, pl in r['rooms'][code]['players'].items() if pl['name'] == 'Andrea')
        print('profilo ricordato dal database:', r.get('deviceProfiles', {}).get(ua, {}).get(gid))
        await host.click('#hdrTools'); await host.wait_for_selector('.gk-line'); print('strumenti, gruppo:', (await host.inner_text('.gk-line'))[:90])
        await host.click('#tlTicker'); await asyncio.sleep(0.5); await host.click('#tlClose')
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        await G.click('.buzz-fab, .ph-dock [data-dock="timeout"]'); await G.wait_for_selector('#gsText'); await G.fill('#gsText', 'Pettegolezzo di prova'); await G.click('#gsSend'); await asyncio.sleep(1)
        ug = next(u for u, pl in db()['rooms'][code]['players'].items() if pl['name'] == 'Giulia')
        rr = db()['rooms'][code]
        print('pettegolezzo con contatore anti-spam:', bool(rr.get('gossip')), '| rate:', bool(rr.get('rate', {}).get(ug, {}).get('gossip')))
        await G.click('[data-bzclose]') if await G.query_selector('[data-bzclose]') else None
        # Profilo ritrovato dopo aver svuotato la memoria del browser
        await A.evaluate("localStorage.removeItem('gnr_profiles'); localStorage.removeItem('gnr_person'); localStorage.removeItem('gnr_person_cache')")
        await A.goto(BASE + '/play.html'); await A.wait_for_selector('#grpList .hub-item--live', state='attached', timeout=8000); await asyncio.sleep(1.5)
        print('dopo la pulizia, la home ritrova:', (await A.inner_text('.hub-name')), '|', (await A.inner_text('#grpList')).replace('\n', ' '))
        await shot(A, '07_phone_home_restored')
        # "Sei tu?": nello storico c'è già una Sara con un profilo
        dbset(f'groups/{gid}/nights/OLD1', {'at': 1700000000000, 'games': {'g': {'name': 'Dixit', 'n': 1, 'sum': 8, 'order': 1}}, 'people': {'m_SARA01': {'name': 'Sara', 'memberId': 'SARA01', 'n': 1}}})
        dbset('members/SARA01', {'name': 'Sara', 'groupId': gid, 'style': 'adventurer', 'seed': 'abc', 'color': '#7B5CFA'})
        Sctx, Sp = await phone(b, 'Sara')
        await Sp.goto(f'{BASE}/play.html?room={code}'); await Sp.wait_for_selector('#nameInput'); await asyncio.sleep(1)
        await Sp.fill('#nameInput', 'sara'); await asyncio.sleep(0.4)
        print('Sei tu?:', (await Sp.inner_text('#sameName')).split('\n')[0])
        await shot(Sp, '08_phone_same_name')
        await Sp.click('.av-opt[data-pick="0"]'); await Sp.click('#joinBtn'); await asyncio.sleep(0.4)
        print('ingresso bloccato:', (await Sp.inner_text('#joinErr'))[:60])
        await Sp.fill('#snCode', 'SARA01'); await Sp.click('#snGo'); await Sp.wait_for_selector('#joinMember', timeout=5000)
        print('profilo ritrovato:', await Sp.inner_text('#joinMember'))
        await Sp.click('#joinMember'); await asyncio.sleep(1.5)
        sp = [pl for pl in db()['rooms'][code]['players'].values() if pl['name'] == 'Sara']
        print('Sara in stanza con il suo profilo:', sp and sp[0].get('memberId'))
        # "Non ho il codice": Luca chiede il suo profilo alla TV
        dbset(f'groups/{gid}/nights/OLD2', {'at': 1700000500000, 'games': {'g': {'name': 'Azul', 'n': 1, 'sum': 7, 'order': 1}}, 'people': {'m_LUCA01': {'name': 'Luca', 'memberId': 'LUCA01', 'n': 1}}})
        dbset('members/LUCA01', {'name': 'Luca', 'groupId': gid, 'style': 'adventurer', 'seed': 'xyz', 'color': '#4D96FF'})
        Lctx, Lp = await phone(b, 'Luca')
        await Lp.goto(f'{BASE}/play.html?room={code}'); await Lp.wait_for_selector('#nameInput'); await asyncio.sleep(1)
        await Lp.fill('#nameInput', 'Luca'); await asyncio.sleep(0.4)
        await Lp.click('#snAsk'); await asyncio.sleep(1)
        print('telefono di Luca:', (await Lp.inner_text('.same-wait'))[:60])
        await host.wait_for_selector('#pcYes', timeout=8000)
        print('TV:', await host.inner_text('#pcTitle')); await shot(host, '08b_tv_profile_claim'); await shot(Lp, '08c_phone_profile_wait')
        await host.click('#pcYes'); await asyncio.sleep(2.5)
        lp = [pl for pl in db()['rooms'][code]['players'].values() if pl['name'] == 'Luca']
        print('Luca in stanza con il suo profilo:', lp and lp[0].get('memberId'), '| ricordato sul telefono:', await Lp.evaluate("localStorage.getItem('gnr_profiles')"))

        # 4. Accessibilità
        await host.click('#hdrTools'); await host.wait_for_selector('#tlA11y')
        await host.click('#tlA11y [data-a11y-size="xl"]'); await host.check('#tlA11y [data-a11y="contrast"]'); await host.check('#tlA11y [data-a11y="cb"]')
        print('TV accessibile:', await host.evaluate("[...document.documentElement.classList].filter(c => c.startsWith('a11y')).join(' ')"))
        await host.click('#tlClose'); await shot(host, '09_a11y_tv')
        await host.click('#hdrTools'); await host.click('#tlA11y [data-a11y-size="m"]'); await host.uncheck('#tlA11y [data-a11y="contrast"]'); await host.uncheck('#tlA11y [data-a11y="cb"]'); await host.click('#tlClose')
        await G.click('[data-myprofile]'); await G.wait_for_selector('#phA11y'); await G.click('#phA11y [data-a11y-size="l"]'); await G.check('#phA11y [data-a11y="contrast"]')
        print('telefono accessibile:', await G.evaluate("[...document.documentElement.classList].filter(c => c.startsWith('a11y')).join(' ')"))
        await G.evaluate("document.querySelector('#phA11y').scrollIntoView()"); await shot(G, '10_a11y_phone')

        # 5. Registro errori
        await host.evaluate("setTimeout(() => { throw new Error('errore di prova del registro'); }, 0)"); await asyncio.sleep(0.5)
        await host.click('#hdrTools'); await host.wait_for_selector('#tlErrInfo')
        print('registro:', (await host.inner_text('#tlErrInfo'))[:70])
        async with host.expect_download() as dl:
            await host.click('#tlErrDl')
        d = await dl.value; await d.save_as(f'{OUT}/errori.txt')
        txt = open(f'{OUT}/errori.txt').read()
        print('file del registro:', d.suggested_filename, '| contiene l’errore:', 'errore di prova del registro' in txt, '| versione:', '"versione": "2.6.0"' in txt)
        await host.click('#tlClose')

        # 6. Trasferimento con la chiave del gruppo
        await host.click('#hdrTools'); await host.click('#tlTransfer'); await host.wait_for_selector('.transfer-codes')
        print('trasferimento:', (await host.inner_text('.transfer-codes')).replace('\n', ' '))
        key = await host.evaluate(f"localStorage.getItem('gnr_gkey_{gid}')"); regia = db()['secrets'][code]
        t2 = await b.new_context(viewport={'width': 1280, 'height': 720}); await t2.add_init_script("localStorage.setItem('gnr_tour_off','1')")
        T2 = await t2.new_page(); watch(T2, 'tv2')
        await T2.goto(f'{BASE}/host.html?room={code}#regia={regia}&gk={key}'); await T2.wait_for_selector('#rsBtn'); await T2.click('#rsBtn')
        await T2.wait_for_selector('.topbar', timeout=10000); await asyncio.sleep(2)
        uid2 = db()['rooms'][code]['meta']['hostUid']
        print('nuovo PC autorizzato nel gruppo:', db()['groups'][gid].get('admins', {}).get(uid2), '| chiave ricordata:', await T2.evaluate(f"localStorage.getItem('gnr_gkey_{gid}')") == key)
        await b.close()
    # L'errore lanciato apposta per provare il registro non è un errore dell'app
    real = [e for e in errs if 'errore di prova del registro' not in e]
    print(real or 'no errors')

asyncio.run(main())
