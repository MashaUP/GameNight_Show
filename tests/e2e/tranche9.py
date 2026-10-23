import asyncio, json, time
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_t9'); os.makedirs(OUT, exist_ok=True)
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

CSV = 'objectname,own,minplayers,maxplayers,playingtime\nAzul,1,2,4,45\nJust One,1,3,7,20\nCascadia,1,1,4,45\nCodenames,1,2,8,15\nDixit,1,3,8,30\n'


async def main():
    csv_path = os.path.join(OUT, 'c.csv'); open(csv_path, 'w').write(CSV)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=5, group='Gruppo 2.9', w=1600, h=900)
        A = (await join(b, code, 'Andrea', 0))[1]
        G = (await join(b, code, 'Giulia', 1))[1]
        M = (await join(b, code, 'Marco', 2))[1]
        gid = db()['rooms'][code]['meta']['groupId']
        await host.click('#hdrLib'); await host.wait_for_selector('#lpCsv'); await host.set_input_files('#lpCsvFile', csv_path); await asyncio.sleep(1.2); await host.click('#lpClose')
        lib = db()['armadi'][aid_of(code)]['library']; ID = {it['name']: k for k, it in lib.items()}
        # 1. Telefoni: giochi portati e stelline
        await A.click('#addGameBtn'); await A.wait_for_selector('[data-tonight]')
        await A.click(f'[data-tonight="{ID["Azul"]}"]'); await A.click(f'[data-tonight="{ID["Just One"]}"]'); await A.click(f'[data-wish="{ID["Azul"]}"]')
        await G.click('#addGameBtn'); await G.wait_for_selector('[data-wish]')
        await G.click(f'[data-wish="{ID["Azul"]}"]'); await G.click(f'[data-wish="{ID["Cascadia"]}"]')
        await asyncio.sleep(1)
        room = db()['rooms'][code]
        ok(set(room.get('tonight', {}).keys()) == {ID['Azul'], ID['Just One']}, 'giochi portati dal telefono')
        ok(sum(1 for w in room.get('wish', {}).values() for v in w.values() if v) == 3, 'stelline salvate')
        await shot(A, '01_phone_tonight')
        # Codice a barre (inserito a mano: in prova non c'è la fotocamera)
        await M.click('#addGameBtn'); await M.click('#scanBtn'); await M.wait_for_selector('#scManual')
        await M.fill('#scManual', '3760175513909'); await M.click('#scGo'); await M.wait_for_selector('[data-assign]')
        await shot(M, '02_phone_scan_assign')
        await M.click(f'[data-assign="{ID["Cascadia"]}"]'); await asyncio.sleep(1)
        ok(db()['armadi'][aid_of(code)]['library'][ID['Cascadia']].get('ean') == '3760175513909', 'codice a barre collegato al gioco')
        ok(ID['Cascadia'] in db()['rooms'][code].get('tonight', {}), 'gioco scansionato sul tavolo')
        await M.click(f'[data-tonight="{ID["Cascadia"]}"]'); await asyncio.sleep(0.6)
        ok(not db()['rooms'][code].get('tonight', {}).get(ID['Cascadia']), 'tolto dal tavolo')
        await M.click('#scanBtn'); await M.fill('#scManual', '3760175513909'); await M.click('#scGo'); await asyncio.sleep(1)
        ok(ID['Cascadia'] in db()['rooms'][code].get('tonight', {}) and await M.query_selector('.scan-sheet') is None, 'codice riconosciuto al secondo colpo')
        for ph in (A, G, M): await ph.click('#agDone')
        # 2. Invito: arrivi, porto io, cibo
        at = int(time.time() * 1000) + 10 * 60000
        dbset(f'groups/{gid}/next', {'at': at, 'place': 'Da Andrea', 'rsvp': {'luca': {'name': 'Luca', 'answer': 'si'}, 'sara': {'name': 'Sara', 'answer': 'forse'}},
                                   'bring': {'sara': {'name': 'Sara', 'games': {ID['Codenames']: True}, 'food': 'Pizza'}}})
        await asyncio.sleep(1.2)
        prep = await host.inner_text('#lobbyPrep')
        ok('Luca' in prep and 'Pizza' in prep, 'lobby: arrivi e cibo')
        ok('Sul tavolo stasera (4)' in prep, f'lobby: 4 giochi sul tavolo ({prep.splitlines()[:6]})')
        await shot(host, '03_lobby_prep')
        # 3. Scaletta
        await host.click('#openPlan'); await host.wait_for_selector('#plMake')
        await host.click('[data-min="90"]'); await host.click('#plMake'); await asyncio.sleep(0.8)
        plan = db()['rooms'][code].get('plan', {})
        table_ids = {ID['Azul'], ID['Just One'], ID['Cascadia'], ID['Codenames']}
        ok(plan.get('items') and set(plan['items']) <= table_ids, f'scaletta solo con i giochi sul tavolo ({[lib[i]["name"] for i in plan.get("items", [])]})')
        ok(ID['Dixit'] not in plan.get('items', []), 'Dixit (non portato) fuori dalla scaletta')
        await shot(host, '04_plan')
        first = plan['items'][0]
        await host.click('[data-plmove="1"][data-i="0"]'); await asyncio.sleep(0.6)
        ok(db()['rooms'][code]['plan']['items'][1] == first, 'scaletta riordinata')
        await host.click('#plClose')
        # 4. Serata: prossimo in scaletta, ruota solo sul tavolo
        await host.click('#startBtn'); await host.wait_for_selector('#gameName'); await asyncio.sleep(0.8)
        ok(await host.query_selector('.plan-next') is not None, 'idle: prossimo in scaletta')
        await host.click('#openWheel'); await host.wait_for_selector('#gwSpin')
        ok(len(await host.query_selector_all('#gameWheel .wheel-label')) == 4, 'la ruota sceglie solo tra i giochi sul tavolo')
        await host.click('#gwClose')
        await M.wait_for_selector('#idlePlan .plan-card', timeout=5000); ok(True, 'telefono: scaletta')
        # 5. Regole: scheda del gioco, spiegazione, chi lo conosce
        await host.click('#hdrLib'); await host.wait_for_selector(f'[data-edit="{ID["Azul"]}"]'); await host.click(f'[data-edit="{ID["Azul"]}"]')
        await host.wait_for_selector('#gsRules')
        await host.fill('#gsRules', 'Prendi le tessere di un colore da un espositore e completa le righe.'); await host.fill('#gsSetup', 'Una plancia a testa\n4 tessere per espositore')
        await host.fill('#gsVideo', 'https://www.youtube.com/watch?v=abc'); await host.click('#gsSave'); await asyncio.sleep(0.8)
        az = db()['armadi'][aid_of(code)]['library'][ID['Azul']]
        ok(az.get('rules', '').startswith('Prendi') and az.get('video', '').startswith('https://'), 'regole e video salvati')
        if await host.query_selector('#gsClose'): await host.click('#gsClose')
        if await host.query_selector('#lpClose'): await host.click('#lpClose')
        await host.click(f'[data-lib="{ID["Azul"]}"]'); await host.click('#openRules'); await host.wait_for_selector('#rlGo')
        await A.wait_for_selector('.rules-card', timeout=5000)
        await A.click('[data-know="1"]'); await G.wait_for_selector('.rules-card'); await G.click('[data-know="0"]')
        await asyncio.sleep(1.5)
        ok('Spiega' in await host.inner_text('#rlKnows'), 'TV: chi spiega')
        await shot(host, '05_rules'); await shot(G, '06_phone_rules')
        await host.click('#rlGo'); await asyncio.sleep(1)
        st = db()['rooms'][code]['state']
        ok(st.get('playName') == 'Azul' and not db()['rooms'][code].get('rules'), 'Iniziamo: partita avviata, regole chiuse')
        # 6. Porto io dal profilo
        await A.click('[data-myprofile]'); await A.wait_for_selector('[data-rsvp="si"]'); await A.click('[data-rsvp="si"]'); await asyncio.sleep(1)
        await A.wait_for_selector('[data-bring]')
        await A.click(f'[data-bring="{ID["Dixit"]}"]'); await A.fill('#bringFood', 'Birre'); await A.click('#bringSave'); await asyncio.sleep(0.8)
        br = db()['groups'][gid]['next'].get('bring', {})
        mine = [v for k, v in br.items() if v.get('name') == 'Andrea']
        ok(mine and mine[0].get('food') == 'Birre' and ID['Dixit'] in mine[0].get('games', {}), 'porto io salvato')
        await A.evaluate("document.querySelector('#myNext').scrollIntoView()"); await shot(A, '07_phone_bring')
        await asyncio.sleep(0.6)
        lib_txt = await host.inner_text('#libPick')
        ok('⭐ Dixit' in lib_txt, 'il gioco promesso nell\'invito è sul tavolo')
        await shot(host, '08_idle')
        await b.close()
    print('\nFALLITI:', fails or 'nessuno')
    print(errs or 'no errors')

asyncio.run(main())
