# 1.12 · Statistiche e memoria con le regole vere (porta 8767): scheda "Analisi" (idee 8, 37, 41, 44–46,
# 48–50, 71), "Tradizioni" con le regole della casa (68), premi del gruppo (23) con premio ricorrente e
# gioco d'apertura dei modelli (24), accessori stagionali (25), definizioni dei record (47), racconto della
# serata nel resoconto (39).
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, json, time, urllib.request
from playwright.async_api import async_playwright
from common import *

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def raw(path, value):
    body = json.dumps({'op': 'set', 'path': path, 'value': value, 'raw': True}).encode()
    urllib.request.urlopen(urllib.request.Request(BASE + '/__db', data=body, method='POST')).read()

def at(path):
    c = db()
    for s in path.split('/'):
        if not isinstance(c, dict): return None
        c = c.get(s)
    return c

DAY = 86400000

def old_nights(now):
    """Sei serate finte negli ultimi mesi: Azul piace sempre di più, Brass sempre meno."""
    out = {}
    azul = [5, 5, 6, 8, 9, 9]
    brass = [9, 9, 8, 6, 5, 5]
    for i in range(6):
        t = now - (200 - i * 30) * DAY
        out[f'OL{i}X'[:4]] = {
            'at': t, 'names': ['Anna', 'Bruno'],
            'games': {
                'a': {'name': 'Azul', 'key': 'azul', 'n': 3, 'sum': azul[i] * 3, 'order': 1, 'playedMin': 40, 'mode': 'competitivo', 'weight': 1.8,
                      'v': {'anna': azul[i], 'bruno': azul[i]}, 'pl': ['anna', 'bruno'], 'w': ['anna']},
                'b': {'name': 'Brass', 'key': 'brass', 'n': 3, 'sum': brass[i] * 3, 'order': 2, 'playedMin': 130, 'weight': 3.9,
                      'v': {'anna': brass[i], 'bruno': brass[i]}, 'pl': ['anna', 'bruno'], 'w': ['bruno']},
            },
            'people': {'anna': {'name': 'Anna', 'n': 2, 'sumGiven': 14, 'wins': 1, 'mvp': 1}, 'bruno': {'name': 'Bruno', 'n': 2, 'sumGiven': 14, 'wins': 1}},
            'custom': [{'t': 'Re del bluff', 'e': '👑', 'k': 'bruno', 'name': 'Bruno'}] if i % 2 else [],
        }
    return out


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3, group='Gruppo Memoria')
        gid = at(f'rooms/{code}/meta/groupId')
        now = int(time.time() * 1000)
        for k, v in old_nights(now).items():
            raw(f'groups/{gid}/nights/{k}', v)
        _, A = await join(b, code, 'Anna', 0)
        _, B = await join(b, code, 'Bruno', 1)
        ctx, G = await phone(b, 'Gino')
        await G.goto(f'{BASE}/play.html?room={code}'); await G.wait_for_selector('#nameInput')
        await G.fill('#nameInput', 'Gino'); await G.click('.av-opt[data-pick="2"]'); await G.check('#guestIn'); await G.click('#joinBtn')
        await G.wait_for_selector('#waitList')

        # ---------------- Tradizione del modello: gioco d'apertura ----------------
        raw(f'rooms/{code}/meta/opening', 'Azul')
        await asyncio.sleep(0.5)
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        ok(await host.input_value('#gameName') == 'Azul' and 'Azul' in (await host.inner_text('.trad-chip')), 'gioco d’apertura proposto per primo, con la nota della tradizione')

        # ---------------- Scheda "Analisi" ----------------
        await host.click('#showAllTime'); await host.wait_for_selector('.at-tabs')
        await host.click('[data-view="insights"]'); await host.wait_for_selector('.ins-subs')
        txt = await host.inner_text('#insBody')
        ok('Azul' in txt and 'Brass' in txt and 'di più' in txt and 'meno' in txt, f'tendenze: Azul su, Brass giù [{txt[:140]}]')
        ok(await host.query_selector('#insBody .conf') is not None, 'tendenze: con l’etichetta di affidabilità')
        await host.click('[data-ins-sub="game"]'); await host.wait_for_selector('.ins-table')
        rows = await host.evaluate("document.querySelectorAll('.ins-table tbody tr').length")
        ok(rows == 6, f'un gioco nel tempo: 6 serate di Azul ({rows})')
        ok(await host.query_selector('#insBody svg.trend') is not None, 'un gioco nel tempo: grafico')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_game.png'))
        await host.click('[data-ins-game="Brass"]'); await asyncio.sleep(0.3)
        first = await host.inner_text('.ins-table tbody tr >> nth=0')
        ok('9' in first, f'un gioco nel tempo: cambia gioco [{first}]')
        await host.click('[data-ins-sub="seasons"]'); await asyncio.sleep(0.3)
        ok(await host.query_selector('#insSa') is not None and await host.query_selector('#insSb') is not None, 'stagioni a confronto: due stagioni scelte')
        await host.click('[data-ins-sub="period"]'); await asyncio.sleep(0.3)
        lbl1 = await host.inner_text('#insPeriod')
        await host.click('[data-ins-pk="year"]'); await asyncio.sleep(0.3)
        lbl2 = await host.inner_text('#insPeriod')
        ok(lbl1 != lbl2 and lbl2.isdigit(), f'riepilogo: mese → anno ({lbl1} → {lbl2})')
        await host.click('[data-ins-shift="-1"]'); await asyncio.sleep(0.3)
        ok(await host.inner_text('#insPeriod') == str(int(lbl2) - 1), 'riepilogo: anno precedente')
        await host.click('[data-ins-sub="habits"]'); await asyncio.sleep(0.3)
        ok(await host.evaluate("document.querySelectorAll('.ins-heat tbody tr').length") == 7, 'abitudini: griglia giorni × mesi')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_habits.png'))
        await host.click('[data-ins-sub="taste"]'); await asyncio.sleep(0.3)
        tt = await host.inner_text('#insBody')
        ok('Competitivo' in tt or 'competitivo' in tt.lower(), f'gusti: per modalità dal riassunto [{tt[:120]}]')
        ok('Impegnativi' in tt and 'Leggeri' in tt, 'gusti: per peso')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_taste.png'))
        await host.click('[data-ins-sub="seasons"]'); await asyncio.sleep(0.3)
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_seasons.png'))
        await host.click('[data-ins-sub="trends"]'); await asyncio.sleep(0.3)
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_trends.png'))
        await host.click('[data-ins-sub="export"]'); await host.wait_for_selector('#insExport')
        cnt = await host.inner_text('#insCount')
        ok('12' in cnt, f'esporta: 12 partite [{cnt}]')
        await host.select_option('#insXGame', 'Azul'); await asyncio.sleep(0.3)
        ok('6' in await host.inner_text('#insCount'), 'esporta: filtro per gioco')
        async with host.expect_download() as dl:
            await host.click('[data-ins-dl="csv"]')
        d = await dl.value
        path = os.path.join(HERE, 'out', 'memory18_stats.csv'); await d.save_as(path)
        csv = open(path, encoding='utf-8-sig').read()
        ok(csv.startswith('date,night,game') and 'Azul' in csv and 'Anna' not in csv and 'P1' in csv, f'esporta: CSV senza nomi [{csv[:80]}]')
        await host.check('#insNames'); await asyncio.sleep(0.2)
        async with host.expect_download() as dl:
            await host.click('[data-ins-dl="json"]')
        d = await dl.value
        path = os.path.join(HERE, 'out', 'memory18_stats.json'); await d.save_as(path)
        js = json.load(open(path, encoding='utf-8'))
        ok(js.get('format') == 'gamenight-stats' and js['filters']['names'] is True and 'Anna' in json.dumps(js), 'esporta: JSON con i nomi se scelto')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_export.png'))

        # ---------------- Hall of Fame: definizione dei record ----------------
        await host.click('[data-view="hof"]'); await asyncio.sleep(0.4)
        ok(await host.evaluate("document.querySelectorAll('.rec-def').length") >= 3, 'record con la loro definizione')

        # ---------------- Tradizioni: regole della casa ----------------
        await host.click('[data-view="traditions"]'); await host.wait_for_selector('#houseForm')
        hist = await host.inner_text('#atBox')
        ok('Re del bluff' in hist and '×3' in hist, f'premi del gruppo delle serate passate [{hist[:200]}]')
        await host.select_option('#houseGame', 'Azul') if await host.evaluate("[...document.querySelectorAll('#houseGame option')].some(o => o.value === 'Azul')") else None
        await host.fill('#houseText', 'Chi perde sceglie il prossimo gioco'); await host.click('#houseForm button[type="submit"]')
        await asyncio.sleep(0.8)
        house = at(f'groups/{gid}/house') or {}
        ok(any(r.get('text') == 'Chi perde sceglie il prossimo gioco' for r in house.values()), f'regola della casa salvata nel gruppo {house}')
        raw(f'groups/{gid}/house/hAzul', {'text': 'Si gioca con la variante a specchio', 'g': 'Azul', 'at': now})
        await asyncio.sleep(0.6)
        ok('variante a specchio' in await host.inner_text('#atBox'), 'regola della casa per un gioco: in elenco')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_traditions.png'))
        await host.click('#atBack'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Azu'); await host.type('#gameName', 'l'); await asyncio.sleep(0.4)
        ok(await host.is_visible('#houseNote') and 'specchio' in await host.inner_text('#houseNote'), 'regole della casa accanto al gioco scritto nel modulo')

        # ---------------- Accessori stagionali ----------------
        await host.click('#hdrTools'); await host.wait_for_selector('#tlSeasonal'); await host.click('#tlSeasonal'); await asyncio.sleep(0.8)
        ok(at(f'rooms/{code}/meta/seasonal') is True, 'accessori stagionali accesi dalla TV')
        festive = await host.evaluate("import('/js/traditions.js').then(m => Boolean(m.seasonalAccessory()))")
        shown = await A.evaluate("document.querySelectorAll('.avatar-acc').length")
        ok((shown > 0) == festive, f'accessorio sui telefoni solo nei giorni di festa (oggi festa: {festive}, simboli: {shown})')

        # ---------------- Una partita, poi i premi del gruppo ----------------
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(A, 9, comment='Bellissimo'); await vote(B, 7); await vote(G, 8)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(0.6)
        await host.click('#nextGame'); await host.wait_for_selector('#gameName')
        await host.click('#hdrEnd'); await host.wait_for_selector('[data-edgo]'); await host.click('[data-edgo] >> nth=0')
        await host.wait_for_selector('.awards', timeout=10000)
        for _ in range(20):
            if await host.query_selector('#customAward'): break
            if await host.query_selector('#stepBtn'): await host.click('#stepBtn')
            await asyncio.sleep(0.3)
        raw(f'rooms/{code}/meta/award', {'t': 'Lumaca d’oro', 'e': '🐢'})
        await asyncio.sleep(0.5)
        await host.click('#customAward'); await host.wait_for_selector('#caForm')
        ok(await host.input_value('#caName') == 'Lumaca d’oro', 'premio ricorrente del modello già pronto')
        who = await host.evaluate("[...document.querySelectorAll('[data-ca-uid]')].map(b => b.innerText.replace(/^\\S+\\n/, '').trim())")
        ok('Anna' in who and 'Bruno' in who and 'Gino' not in who, f'premi del gruppo: niente ospiti tra chi può riceverli {who}')
        ok('Re del bluff' in await host.inner_text('#caForm'), 'suggerimento: i premi già usati dal gruppo')
        anna = await host.evaluate("[...document.querySelectorAll('[data-ca-uid]')].find(b => b.innerText.includes('Anna')).dataset.caUid")
        await host.click(f'[data-ca-uid="{anna}"]'); await host.click('#caForm button[type="submit"]'); await asyncio.sleep(1.2)
        ca = at(f'rooms/{code}/customAwards') or {}
        ok(len(ca) == 1 and list(ca.values())[0].get('t') == 'Lumaca d’oro' and list(ca.values())[0].get('uid') == anna, f'premio salvato nella stanza {ca}')
        await host.click('[data-ca-sug="Re del bluff"]'); await host.click('[data-ca-uid]:not([data-ca-uid="' + anna + '"])'); await host.click('#caForm button[type="submit"]'); await asyncio.sleep(1.2)
        await host.keyboard.press('Escape'); await asyncio.sleep(0.8)
        ok(await host.evaluate("document.querySelectorAll('.award[data-award]').length") >= 2 and 'Lumaca' in await host.inner_text('.prizes'), 'premiazione: riga dei premi del gruppo')
        await host.screenshot(path=os.path.join(HERE, 'out', 'memory18_awards.png'))
        night = at(f'groups/{gid}/nights/{code}') or {}
        cust = night.get('custom') or []
        cust = list(cust.values()) if isinstance(cust, dict) else cust
        ok(sorted(c.get('name') for c in cust) == ['Anna', 'Bruno'] and 'Gino' not in json.dumps(night), f'riassunto della serata: premi del gruppo, nessun dato dell’ospite {cust}')
        g1 = [g for g in (night.get('games') or {}).values() if g.get('name') == 'Azul']
        ok(g1 and g1[0].get('n') == 3, 'il voto dell’ospite conta nella media')

        # ---------------- Resoconto: racconto della serata ----------------
        rp = await hctx.new_page(); watch(rp, 'resoconto')
        await rp.goto(f'{BASE}/resoconto.html?room={code}'); await rp.wait_for_selector('#rsStory')
        st = await rp.inner_text('#rsStory')
        ok('Azul' in st and 'Bellissimo' in st, f'racconto: dati veri e commenti [{st[:160]}]')
        await rp.uncheck('#rsQuotes'); await asyncio.sleep(0.3)
        st2 = await rp.inner_text('#rsStory')
        ok('Azul' in st2 and 'Bellissimo' not in st2, 'racconto: commenti esclusi su richiesta')
        ok('Lumaca' in await rp.inner_text('.rs-awards'), 'resoconto: premi del gruppo')
        await rp.screenshot(path=os.path.join(HERE, 'out', 'memory18_report.png'), full_page=True)
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
