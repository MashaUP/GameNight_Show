import asyncio, json
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t5'); os.makedirs(OUT, exist_ok=True)
dialogs = []


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


async def shot(pg, name, full=False):
    await asyncio.sleep(0.35)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def tools(host):
    if not await host.query_selector('#tlClose'):
        await host.click('#hdrTools'); await host.wait_for_selector('#tlClose')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=4)
        host.on('dialog', lambda d: dialogs.append(d.message))
        A = (await join(b, code, 'Andrea', 0))[1]
        Gctx, G = await join(b, code, 'Giulia', 1)
        Mctx, M = await join(b, code, 'Marco', 2)
        await asyncio.sleep(6)
        room = db()['rooms'][code]
        uid = {pl['name']: u for u, pl in room['players'].items()}
        print('battiti:', sorted(room['players'][u]['name'] for u in (room.get('hb') or {})))
        print('pillola rete Andrea:', await A.get_attribute('[data-netpill]', 'class'))

        # 1. Heartbeat: Marco "blocca" il telefono (pagina nascosta, ma la connessione resta)
        await M.evaluate("Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })")
        await host.keyboard.press('g'); await host.wait_for_selector('#ppList')
        for i in range(30):
            txt = await host.inner_text('#ppList')
            if 'Non collegato' in txt: break
            await asyncio.sleep(1)
        print(f'Marco disconnesso dopo ~{i + 6} s di silenzio:', 'Non collegato' in txt)
        await shot(host, '01_panel_offline')
        await M.evaluate("Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange'))")
        await asyncio.sleep(3)
        print('Marco di nuovo collegato:', 'Non collegato' not in await host.inner_text('#ppList'))

        # 2. Stanza chiusa
        await host.click('#ppLock'); await asyncio.sleep(0.8)
        print('meta.locked:', db()['rooms'][code]['meta'].get('locked'), '| QR nascosto:', await host.evaluate("document.querySelector('#ppQr').hidden"))
        await shot(host, '02_panel_locked')
        await host.click('#ppClose')
        Lctx, L = await phone(b, 'Luca')
        await L.goto(f'{BASE}/play.html?room={code}'); await L.wait_for_selector('.ph-title')
        print('Luca vede:', await L.inner_text('.ph-title'), '| form di ingresso:', bool(await L.query_selector('#nameInput')))
        await shot(L, '03_phone_locked')
        await shot(host, '04_lobby_locked')
        await host.click('#lobbyLock'); await asyncio.sleep(1.2)
        await L.wait_for_selector('#nameInput', timeout=6000)
        print('stanza riaperta, Luca può entrare:', bool(await L.query_selector('#nameInput')))
        await Lctx.close()

        # 3. Partita, voto in coda senza rete
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Dixit'); await host.click('.win-av[title^="Giulia"]')
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        gid = db()['rooms'][code]['state']['gameId']
        await vote(G, 8)
        actx = A.context
        await actx.set_offline(True); await asyncio.sleep(1.2)
        print('pillola offline:', (await A.inner_text('[data-netpill]')).strip())
        await vote(A, 9, send=False); await A.click('#sendVote'); await asyncio.sleep(2.2)
        print('pillola con voto in coda:', (await A.inner_text('[data-netpill]')).strip(), '| voto sul server:', bool(db()['rooms'][code]['votes'][gid].get(uid['Andrea'])))
        await shot(A, '05_phone_queue')
        await actx.set_offline(False)
        await wait_js(A, "document.querySelector('#toast')?.textContent.includes('sincronizzato')", timeout=8000)
        print('dopo la rete:', await A.inner_text('#toast'), '| voto sul server:', bool(db()['rooms'][code]['votes'][gid].get(uid['Andrea'])))

        # 4. Espulsione di Giulia (con il suo voto in sospeso)
        await host.keyboard.press('g'); await host.wait_for_selector('#ppList')
        await host.click(f'[data-kickp="{uid["Giulia"]}"]'); await host.wait_for_selector('#kkYes')
        await shot(host, '06_kick_dialog')
        await host.click('#kkYes'); await asyncio.sleep(1)
        r = db()['rooms'][code]
        print('Giulia espulsa:', uid['Giulia'] not in r['players'], '| voto tolto:', uid['Giulia'] not in r['votes'].get(gid, {}), '| banned:', r['meta'].get('banned'))
        await G.wait_for_selector('text=Sei fuori dalla serata', timeout=6000); await shot(G, '07_phone_banned')
        await shot(host, '08_panel_banned')
        await host.click(f'[data-readmit="{uid["Giulia"]}"]'); await asyncio.sleep(1)
        await G.wait_for_selector('#nameInput', timeout=6000)
        print('Giulia riammessa:', not db()['rooms'][code]['meta'].get('banned'))
        await G.fill('#nameInput', 'Giulia'); await G.click('.av-opt[data-pick="1"]'); await G.click('#joinBtn'); await asyncio.sleep(1)
        uid['Giulia'] = next(u for u, pl in db()['rooms'][code]['players'].items() if pl['name'] == 'Giulia')
        await host.click('#ppClose')
        await vote(G, 7); await vote(M, 6)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(1.5)

        # 5. Macchina del tempo: torno a prima del reveal
        await tools(host); await host.click('#tlTime'); await host.wait_for_selector('.tm-row')
        await asyncio.sleep(0.6); await shot(host, '09_time_machine')
        labels = await host.evaluate("[...document.querySelectorAll('.tm-row--snap b')].map(x=>x.textContent)")
        print('istantanee:', labels[:8])
        btn = await host.query_selector('[data-tmrestore][data-label*="prima del reveal di dixit"]')
        await btn.click(); await asyncio.sleep(1.5)
        st = db()['rooms'][code]
        print('dopo il ripristino:', st['state']['phase'], st['games'][gid]['status'], '| voti:', len(st['votes'][gid]))
        await host.wait_for_selector('.voting', timeout=6000)
        await host.wait_for_selector('.reveal', timeout=12000)

        # 6. Controllo integrità con voti orfani
        dbset(f'rooms/{code}/votes/{gid}/fantasma', {'overall': 7})
        dbset(f'rooms/{code}/votes/sparito', {uid['Andrea']: {'overall': 5}})
        await asyncio.sleep(1)
        await tools(host); await host.click('#tlCheck'); await host.wait_for_selector('.ic-row')
        print('integrità:', await host.evaluate("[...document.querySelectorAll('.ic-row')].map(x=>x.className.split('--')[1]+': '+x.innerText.replace(/\\n/g,' '))"))
        await shot(host, '10_integrity_errors')
        await host.click('#icFix'); await asyncio.sleep(1.5)
        print('dopo la correzione:', await host.inner_text('#icSummary'), '| voti fantasma:', 'fantasma' in db()['rooms'][code]['votes'][gid], '| gioco sparito:', 'sparito' in db()['rooms'][code]['votes'])
        await shot(host, '11_integrity_ok')
        await host.click('#icClose')

        # 7. Safe Mode (TV e telefoni)
        await tools(host)
        try:
            await host.click('#tlSafe', timeout=5000)
        except Exception as e:
            await shot(host, 'dbg_safe'); print('DBG', await host.evaluate("[!!document.querySelector('#tlSafe'), document.querySelector('#tlSafe')?.getBoundingClientRect().toJSON(), [...document.querySelectorAll('.overlay')].length]")); raise
        await asyncio.sleep(1.2)
        print('Safe Mode TV:', await host.evaluate("document.documentElement.classList.contains('safe-mode')"), '| telefono:', await A.evaluate("document.documentElement.classList.contains('safe-mode')"), '| chip:', await host.is_visible('#hdrSafe'))
        await shot(host, '12_safe_mode')
        await host.click('#hdrSafe'); await asyncio.sleep(1.2)
        print('Safe Mode spenta:', not await host.evaluate("document.documentElement.classList.contains('safe-mode')"), not await A.evaluate("document.documentElement.classList.contains('safe-mode')"))

        # 8. Backup di emergenza, file rovinato, file modificato
        await tools(host)
        async with host.expect_download() as dl:
            await host.click('#tlDownload')
        d = await dl.value; path = f'{OUT}/{d.suggested_filename}'; await d.save_as(path)
        bk = json.load(open(path))
        print('backup:', d.suggested_filename, '| schema', bk.get('schema'), '| checksum', bk.get('sum'), '| giochi', len(bk['games']))
        open(f'{OUT}/rotto.json', 'w').write(open(path).read()[:-40])
        dialogs.clear()
        await host.set_input_files('#tlFile', f'{OUT}/rotto.json'); await asyncio.sleep(1)
        print('file rotto:', dialogs[-1][:90].replace('\n', ' ') if dialogs else None)
        bk2 = dict(bk); bk2['games'] = {k: {**v, 'name': v['name'] + ' (mod)'} for k, v in bk['games'].items()}
        json.dump(bk2, open(f'{OUT}/modificato.json', 'w'))
        dialogs.clear()
        await host.set_input_files('#tlFile', f'{OUT}/modificato.json'); await asyncio.sleep(1)
        print('file modificato:', dialogs[-1][:80].replace('\n', ' ') if dialogs else None)
        bk3 = dict(bk); bk3.pop('sum'); bk3['votes'] = {gid: {uid['Andrea']: {'overall': 42}}}
        json.dump(bk3, open(f'{OUT}/fuori_scala.json', 'w'))
        dialogs.clear()
        await host.set_input_files('#tlFile', f'{OUT}/fuori_scala.json'); await asyncio.sleep(1)
        print('voto fuori scala:', dialogs[-1][:110].replace('\n', ' ') if dialogs else None)
        async with host.expect_download() as dl:
            await host.click('#tlGroupBackup')
        d = await dl.value; await d.save_as(f'{OUT}/gruppo.json'); gb = json.load(open(f'{OUT}/gruppo.json'))
        print('backup del gruppo:', d.suggested_filename, gb.get('kind'), '| serate:', len(gb.get('nights') or {}))
        await asyncio.sleep(1)
        print('spazio:', (await host.inner_text('#tlSpace')).replace('\n', ' | ')[:200])
        print('salvataggi:', await host.inner_text('#tlSave'))
        await shot(host, '13_tools', full=False)
        await host.click('#tlClose')

        # 9. Bentornato (telefono ricaricato) e watchdog della regia
        await A.reload(); await wait_js(A, "document.querySelector('#toast')?.textContent.includes('Bentornato')", timeout=8000)
        print('telefono ricaricato:', await A.inner_text('#toast'))
        regia = db()['secrets'][code]
        dbset(f'rooms/{code}/cohosts/{uid["Andrea"]}', True)
        await A.evaluate(f"localStorage.setItem('gnr_cohost_{code}', '1'); localStorage.setItem('gnr_regia_{code}', '{regia}')")
        await A.reload(); await A.wait_for_selector('.regia-fab', timeout=8000); await A.click('.regia-fab'); await A.wait_for_selector('#rgWatch')
        await asyncio.sleep(1.2); print('watchdog:', await A.inner_text('#rgWatch'))
        await A.click('#rgSafety summary'); await asyncio.sleep(0.3); await shot(A, '14_phone_regia')
        await A.click('[data-rglock]'); await asyncio.sleep(1.5)
        print('stanza chiusa dalla regia:', db()['rooms'][code]['meta'].get('locked'))
        await A.click('[data-rglock]'); await asyncio.sleep(1.5); await A.click('#rgClose')

        # 10. Ripresa: ricarico la TV
        await host.reload(); await wait_js(host, "document.querySelector('#toast')?.textContent.includes('Serata ripresa')", timeout=10000)
        print('TV ricaricata:', await host.inner_text('#toast'))

        # 11. La stanza sparisce dal database
        before = len(db()['rooms'][code]['games'])
        snapshot_players = len(db()['rooms'][code]['players'])
        dbset(f'rooms/{code}', None)
        await host.wait_for_selector('#goneRestore', timeout=8000); await shot(host, '15_room_gone')
        await host.click('#goneRestore'); await host.wait_for_selector('.topbar', timeout=10000); await asyncio.sleep(1.5)
        r = db()['rooms'][code]
        print('stanza ricreata:', code in db()['rooms'], '| giochi', len(r.get('games', {})), 'di', before, '| giocatori', len(r.get('players', {})), 'di', snapshot_players, '| fase', r['state']['phase'])
        await A.wait_for_selector('[data-netpill]', timeout=8000); await asyncio.sleep(1)
        print('Andrea ancora dentro:', uid['Andrea'] in r['players'])

        # 12. Schermata iniziale con la serata interrotta
        await host.evaluate("localStorage.removeItem('gnr_host_room')")
        await host.goto(BASE + '/host.html'); await host.wait_for_selector('.recover-card', timeout=8000)
        print('scheda di ripresa:', (await host.inner_text('.recover-card')).replace('\n', ' ')[:200])
        await shot(host, '16_recover_card')
        await host.click('#recGo'); await host.wait_for_selector('.topbar', timeout=10000)
        print('ripresa dalla scheda:', host.url.split('room=')[1])

        # 13. Trasferisci la regia su un altro computer
        await tools(host); await host.click('#tlTransfer'); await host.wait_for_selector('#trQr svg'); await shot(host, '17_transfer')
        regia_code = db()['secrets'][code]
        t2ctx = await b.new_context(viewport={'width': 1280, 'height': 720}); await t2ctx.add_init_script("localStorage.setItem('gnr_tour_off','1')"); T2 = await t2ctx.new_page(); watch(T2, 'tv2')
        await T2.goto(f'{BASE}/host.html?room={code}#regia={regia_code}'); await T2.wait_for_selector('#rsBtn')
        print('nuovo PC, regia precompilata:', await T2.input_value('#rsRegia'))
        await T2.click('#rsBtn'); await T2.wait_for_selector('.topbar', timeout=10000); await asyncio.sleep(1.5)
        print('nuovo host:', db()['rooms'][code]['meta']['hostUid'] != None, '| vecchia TV:', await host.inner_text('h2') if await host.query_selector('#lostForm') else 'ancora regia')
        await b.close()
    print(errs or 'no errors')

asyncio.run(main())
