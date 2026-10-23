import asyncio, subprocess, time
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_xss'); os.makedirs(OUT, exist_ok=True)
SEED = os.path.join(HERE, 'seed.mjs')

X = '"><img src=x onerror="window.__x=1"><svg onload="window.__x=2">\'"`'
ATTR = 'x" onmouseover="window.__x=3" data-z="'
IMG = 'data:image/png" onerror="window.__x=4'
found = []


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value}).encode(), method='POST')
    urllib.request.urlopen(req).read()


CHECK = """(() => {
  const docs = [document, ...[...document.querySelectorAll('iframe')].map((f) => { try { return f.contentDocument; } catch { return null; } }).filter(Boolean)];
  let n = 0; const what = [];
  for (const d of docs) {
    for (const el of d.querySelectorAll('img[src="x"], [onerror], [onload], [onmouseover], [data-z], script:not([src])')) {
      if (el.tagName === 'SCRIPT' && !el.textContent.includes('__x')) continue;
      n++; what.push(el.outerHTML.slice(0, 80));
    }
  }
  return { n, what, x: window.__x || null };
})()"""


async def check(pg, where):
    r = await pg.evaluate(CHECK)
    status = 'OK' if not r['n'] and not r['x'] else 'INIEZIONE'
    if status != 'OK':
        found.append((where, r))
    print(f'{status:9} {where}' + (f"  {r['what'][:2]} x={r['x']}" if status != 'OK' else ''))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=4, group='Gruppo XSS')
        A = (await join(b, code, 'Andrea', 0))[1]
        G = (await join(b, code, 'Giulia', 1))[1]
        room = db()['rooms'][code]; gid = room['meta']['groupId']
        ua = next(u for u, pl in room['players'].items() if pl['name'] == 'Andrea')
        ug = next(u for u, pl in room['players'].items() if pl['name'] == 'Giulia')
        # Giocatori con nome, motto, foto e colore ostili (le regole li bloccherebbero: qui si prova che l'app non si fida)
        dbset(f'rooms/{code}/players/{ug}/name', X)
        dbset(f'rooms/{code}/players/{ug}/motto', X)
        dbset(f'rooms/{code}/players/{ug}/photo', IMG)
        dbset(f'rooms/{code}/players/{ug}/color', 'red;position:fixed;inset:0;z-index:9999;background:red')
        dbset(f'rooms/{code}/meta/groupName', X)
        dbset(f'rooms/{code}/meta/banned', {'ghost': X})
        dbset(f'groups/{gid}/info/name', X)
        dbset(f'groups/{gid}/identity', {'emblem': X, 'motto': X, 'logo': IMG, 'color': 'x;background:url(javascript:alert(1))'})
        dbset(armlib(code), {
            'l1': {'name': X, 'image': ATTR, 'tags': [X, 'party'], 'publisher': X, 'owner': X, 'loanTo': X, 'status': 'prestato', 'language': X, 'addedBy': X, 'minPlayers': 2, 'maxPlayers': 6, 'duration': 30, 'mode': X, 'rules': X, 'setup': X + '\n' + X, 'video': 'https://x" onmouseover="window.__x=3" data-z="', 'ean': X},
            'l2': {'name': 'Dixit', 'baseId': 'l1', 'addedBy': 'TV', 'rules': X, 'setup': X + '\n' + X, 'video': 'https://x" onmouseover="window.__x=3" data-z="'}
        })
        dbset(f'groups/{gid}/next', {'at': int(time.time() * 1000) + 3600000, 'place': X, 'note': X, 'rsvp': {'k1': {'name': X, 'answer': 'si'}}, 'bring': {'k1': {'name': X, 'food': X, 'games': {'l1': True}}}})
        dbset(f'rooms/{code}/tonight', {'l1': {ug: X}})
        dbset(f'rooms/{code}/wish', {ug: {'l1': True}})
        dbset(f'rooms/{code}/plan', {'items': ['l1', 'l2'], 'minutes': 120})
        dbset(f'rooms/{code}/knock', {'zz': {'kind': 'locked', 'name': X, 'n': 2, 'at': int(time.time() * 1000)}})
        dbset(f'rooms/{code}/table', {'starter': {'uid': ug, 'name': X, 'at': int(time.time() * 1000)}, 'teams': [[ua], [ug]]})
        players = {ua: {'name': 'Andrea'}, ug: {'name': X}, 'fakeZ': {'name': X}}
        nights = json.loads(subprocess.check_output(['node', SEED, json.dumps(players)], cwd=os.path.dirname(SEED)))
        for k, v in list(nights.items())[:4]:
            for g in v['games'].values():
                g['name'] = X
            v['quotes'] = [{'name': X, 'game': X, 'text': X}]
            dbset(f'groups/{gid}/nights/{k}', v)
        dbset(f'groups/{gid}/photos/{code}/ph1', {'data': IMG, 'uid': ua, 'by': X, 'caption': X, 'game': X, 'at': 1})
        dbset(f'groups/{gid}/photos/OLD0/ph1', {'data': IMG, 'uid': ua, 'by': X, 'caption': X, 'game': X, 'at': 1})
        await asyncio.sleep(2)
        await check(host, 'TV lobby')
        await check(A, 'telefono attesa')
        await host.keyboard.press('g'); await asyncio.sleep(0.6); await check(host, 'TV pannello giocatori'); await host.click('#ppClose')
        await host.click('#startBtn'); await host.wait_for_selector('#gameName'); await asyncio.sleep(0.8)
        await check(host, 'TV prossimo gioco + ludoteca')
        await host.click('#hdrLib'); await host.wait_for_selector('#lpSearch'); await asyncio.sleep(0.6); await check(host, 'TV ludoteca')
        await host.click('[data-edit="l1"]'); await asyncio.sleep(0.6); await check(host, 'TV scheda gioco'); await host.click('#gsClose')
        await host.fill('#lpSearch', 'party'); await asyncio.sleep(0.5); await check(host, 'TV ricerca ludoteca'); await host.click('#lpClose')
        await host.click('#openPlan'); await asyncio.sleep(0.6); await check(host, 'TV scaletta'); await host.click('#plClose')
        await host.click('[data-lib="l2"]'); await host.click('#openRules'); await asyncio.sleep(1); await check(host, 'TV regole'); await check(A, 'telefono regole'); await host.click('#rlLater')
        await host.click('#openTable'); await asyncio.sleep(0.5); await host.click('[data-tb="teams"]'); await asyncio.sleep(0.4); await check(host, 'TV squadre'); await host.click('#tbClose')
        # Partita con nome ostile, commenti, pronostici, ticker, time-out
        await host.click('#hdrTools'); await host.wait_for_selector('#tlTicker'); await host.check('#tlTicker'); await asyncio.sleep(0.5); await host.click('#tlClose')
        dbset(f'rooms/{code}/gossip/g1', {'text': X, 'by': ua, 'at': 1})
        dbset(f'rooms/{code}/sfx/s1', {'k': X, 'by': ua, 'at': int(time.time() * 1000)})
        await host.fill('#gameName', X[:40]); await host.click('#startPlay'); await asyncio.sleep(1)
        dbset(f'rooms/{code}/bets/{db()["rooms"][code]["state"]["playId"]}/{ua}', ug)
        await asyncio.sleep(1); await check(host, 'TV partita in corso + ticker')
        await check(A, 'telefono partita in corso')
        await host.click('#openVote'); await host.wait_for_selector('.voting'); await asyncio.sleep(0.5)
        await check(host, 'TV votazione'); await check(A, 'telefono voto')
        await vote(A, 8, comment=X[:80]); await vote(G, 6)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(3)
        await check(host, 'TV reveal'); await check(A, 'telefono reveal')
        dbset(f'rooms/{code}/buzz/b1', {'by': ua, 'reason': X, 'at': int(time.time() * 1000)})
        await asyncio.sleep(1.5); await check(host, 'TV time-out con motivo ostile')
        await check(host, 'TV pausa (dal time-out)')
        for _ in range(3):
            if await host.query_selector('#resumeBtn'): await host.click('#resumeBtn'); await asyncio.sleep(0.8)
        await host.click('#hdrTools'); await asyncio.sleep(0.8); await check(host, 'TV strumenti (pettegolezzi)')
        await host.click('#tlTime'); await asyncio.sleep(1); await check(host, 'TV macchina del tempo'); await host.click('#tmClose')
        await host.click('#hdrTools'); await host.click('#tlCheck'); await asyncio.sleep(0.6); await check(host, 'TV controllo integrità'); await host.click('#icClose')
        try:
            await host.evaluate("document.querySelector('#toBoard').click()")
        except Exception:
            await host.screenshot(path=f'{OUT}/dbg_board.png'); print('DBG', await host.evaluate("(() => { const b = document.querySelector('#toBoard').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2); return [e?.outerHTML.slice(0, 160), document.querySelectorAll('.overlay').length]; })()")); raise
        await host.wait_for_selector('.board'); await asyncio.sleep(0.5); await check(host, 'TV classifica')
        await host.evaluate("document.querySelector('#endNight').click()"); await host.click('#endDialog [data-edgo]'); await asyncio.sleep(0.5)
        if await host.query_selector('#icGo'): await host.click('#icGo')
        await host.wait_for_selector('.awards', timeout=8000)
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await asyncio.sleep(1); await check(host, 'TV premiazione'); await check(A, 'telefono risultati')
        await host.click('#openAlbum'); await asyncio.sleep(0.8); await check(host, 'TV album'); await host.click('#alClose')
        # Esportazioni (resoconto PDF in un iframe)
        if await host.query_selector('#openExport'):
            await host.click('#openExport'); await asyncio.sleep(0.5)
        html = await host.evaluate("import('./js/report.js').then(() => document.querySelector('#reportFrame') ? 1 : 0)")
        await host.click('#toAllTime'); await host.wait_for_selector('.at-tabs')
        for view in ['rank', 'stats', 'pairs', 'hof', 'memories', 'wrapped', 'calendar']:
            await host.click(f'[data-view="{view}"]'); await asyncio.sleep(0.5); await check(host, f'TV di sempre: {view}')
        await host.click('[data-view="memories"]'); await host.click('.mem-card >> nth=1'); await asyncio.sleep(0.5); await check(host, 'TV pagina di una serata')
        await host.click('[data-album]'); await asyncio.sleep(1); await check(host, 'TV album serata passata'); await host.click('#alClose')
        await A.wait_for_selector('[data-myprofile]', timeout=8000); await A.click('[data-myprofile]'); await asyncio.sleep(1.2); await check(A, 'telefono profilo')
        await A.click('#myMemories [data-mem]'); await asyncio.sleep(1.2); await check(A, 'telefono serata passata'); await A.click('[data-nsclose]')
        await A.click('[data-profileback]'); await asyncio.sleep(0.5); await check(A, 'telefono di sempre')
        L = await (await b.new_context(viewport={'width': 390, 'height': 844})).new_page(); watch(L, 'ludoteca')
        await L.goto(f'{BASE}/ludoteca.html?a={aid_of(code)}'); await asyncio.sleep(2); await check(L, 'pagina ludoteca')
        await L.click('.lb-head'); await asyncio.sleep(0.4); await check(L, 'pagina ludoteca, dettaglio')
        await host.screenshot(path=f'{OUT}/tv_end.png')
        await b.close()
    print('\nINIEZIONI TROVATE:', found if found else 'nessuna')
    # Le immagini con indirizzi non validi (iniettati apposta) non si caricano: non sono errori dell'app
    real = [e for e in errs if 'Failed to load resource' not in e]
    print(real or 'no errors')

asyncio.run(main())
