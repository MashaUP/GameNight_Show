# Test 1.6: pausa della serata, timer condiviso e schermata ambientale, sul server con le regole vere (porta 8767).
# TV + due telefoni (uno con la regia). Controlla sincronizzazione, pausa collegata e indipendente,
# riconnessione, scadere senza doppioni, ritorno dalla schermata ambientale senza perdere lo stato.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, json, re
from playwright.async_api import async_playwright
from common import *
OUT = os.path.join(HERE, 'out', 'shots_night16'); os.makedirs(OUT, exist_ok=True)
fails = []


def ok(cond, label):
    print(('OK   ' if cond else 'FAIL ') + label)
    if not cond: fails.append(label)


def dbset(path, value):
    req = urllib.request.Request(BASE + '/__db', data=json.dumps({'op': 'set', 'path': path, 'value': value, 'raw': True}).encode(), method='POST')
    urllib.request.urlopen(req).read()


def room(code):
    return db()['rooms'][code]


def secs_of(txt):
    """'0:58' → 58, '1:02:03' → 3723."""
    m = re.findall(r'\d+', txt or '')
    if not m: return None
    n = [int(x) for x in m]
    return n[0] * 3600 + n[1] * 60 + n[2] if len(n) == 3 else n[0] * 60 + n[1] if len(n) == 2 else n[0]


async def shot(pg, name):
    await asyncio.sleep(0.3)
    await pg.screenshot(path=f'{OUT}/{name}.png')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3, group='Gruppo pausa', w=1600, h=900)
        A = (await join(b, code, 'Andrea', 0))[1]
        actx, = [A.context]
        bctx, B = await join(b, code, 'Giulia', 1)
        players = room(code)['players']
        uid = {v['name']: k for k, v in players.items()}
        # Andrea ha la regia dal telefono
        regia = db()['secrets'][code]
        dbset(f'rooms/{code}/cohosts/{uid["Andrea"]}', True)
        await A.evaluate(f"localStorage.setItem('gnr_cohost_{code}', '1'); localStorage.setItem('gnr_regia_{code}', '{regia}')")
        await A.reload(); await A.wait_for_selector('.regia-fab', timeout=8000)
        await host.click('#startBtn'); await host.wait_for_selector('#gameName'); await asyncio.sleep(0.6)

        # 1. Avvio dalla TV
        await host.click('#openTable'); await host.wait_for_selector('[data-tb="timer"]', timeout=8000)
        await host.click('[data-tb="timer"]'); await host.wait_for_selector('[data-tm="start"]')
        await host.click('[data-tm="start"][data-secs="60"]'); await asyncio.sleep(1.2)
        tm = room(code).get('timer') or {}
        ok(tm.get('status') == 'running' and tm.get('kind') == 'turn' and tm.get('secs') == 60 and tm.get('rev') == 1, f'timer avviato dalla TV ({tm.get("status")}, rev {tm.get("rev")})')
        tv_s = secs_of(await host.inner_text('[data-shtimer="panel"] .sh-num'))
        ok(tv_s is not None and 55 <= tv_s <= 60, f'TV: conto alla rovescia ({tv_s} s)')
        await shot(host, '01_tv_timer')
        for ph, n in ((A, 'Andrea'), (B, 'Giulia')):
            await ph.wait_for_selector('#shTimerChip', timeout=5000)
            s = secs_of(await ph.inner_text('#shTimerChip b'))
            ok(s is not None and abs(s - tv_s) <= 2, f'{n}: chip del timer allineato alla TV ({s} s / {tv_s} s)')
        await shot(B, '02_phone_chip')

        # 2. Un giocatore normale lo vede ma non lo comanda
        await B.click('#shTimerChip'); await B.wait_for_selector('.timer-sheet')
        ok(await B.query_selector('.timer-sheet [data-tm="pause"]') is None and 'regia' in (await B.inner_text('.timer-sheet')).lower(), 'giocatore normale: solo vista, niente comandi')
        await shot(B, '03_phone_view_only')
        await B.click('.timer-sheet [data-tsclose]')

        # 3. La regia dal telefono lo mette in pausa e lo riprende
        await A.click('#shTimerChip'); await A.wait_for_selector('.timer-sheet', timeout=5000)
        await A.wait_for_selector('.timer-sheet [data-tm="pause"]', timeout=5000)
        await shot(A, '04_phone_regia_timer')
        await A.click('.timer-sheet [data-tm="pause"]'); await asyncio.sleep(1)
        tm = room(code)['timer']
        ok(tm['status'] == 'paused' and tm['rev'] == 2 and tm.get('by') == uid['Andrea'], 'regia: pausa del timer (rev 2)')
        left1 = tm['left']
        await wait_js(host, "!!document.querySelector('[data-shtimer=\"panel\"].is-paused')", 5000)
        ok(True, 'TV: timer mostrato in pausa')
        await asyncio.sleep(2.2)
        ok(room(code)['timer']['left'] == left1, 'in pausa il tempo resta fermo (nessuna scrittura)')
        await A.click('.timer-sheet [data-tm="resume"]'); await asyncio.sleep(1)
        ok(room(code)['timer']['status'] == 'running', 'regia: ripresa')
        await A.click('.timer-sheet [data-tsclose]')

        # 4. Scrittura concorrente: un altro dispositivo ha già scritto (rev 10). La TV rilegge e scrive rev 11.
        cur = room(code)['timer']; cur['rev'] = 10
        dbset(f'rooms/{code}/timer', cur); await asyncio.sleep(0.5)
        await host.click('[data-tm="pause"]'); await asyncio.sleep(1)
        tm = room(code)['timer']
        ok(tm['rev'] == 11 and tm['status'] == 'paused', f'stato vecchio in memoria: la TV rilegge e scrive rev 11 ({tm["rev"]})')
        await host.click('[data-tm="resume"]'); await asyncio.sleep(0.8)
        await host.click('#tbClose')

        # 5. Pausa della serata con timer collegato
        before = room(code)['timer']
        await host.keyboard.press('p'); await asyncio.sleep(1.2)
        r = room(code)
        ok(r['state'].get('paused') is True, 'serata in pausa')
        ok(r['timer']['status'] == 'paused' and r['timer'].get('nightPaused') is True, 'timer collegato: fermo con la serata')
        left_p = r['timer']['left']
        await A.wait_for_selector('#shTimerChip.is-paused', timeout=5000)
        ok(True, 'telefono: chip in pausa')
        ok('pausa' in (await B.inner_text('main')).lower(), 'telefono: schermata di pausa')
        await shot(B, '05_phone_pause')
        await asyncio.sleep(2.5)
        await host.keyboard.press('p'); await asyncio.sleep(1.2)
        r = room(code)
        ok(not r['state'].get('paused') and r['timer']['status'] == 'running' and not r['timer'].get('nightPaused'), 'ripresa: il timer riparte da solo')
        ok(r['timer']['left'] == left_p, f'il tempo rimasto è quello di prima della pausa ({left_p} ms)')

        # 6. Timer indipendente: la pausa della serata non lo ferma
        await A.click('#shTimerChip'); await A.wait_for_selector('.timer-sheet [data-tm="follow"]')
        await A.click('.timer-sheet [data-tm="follow"]'); await asyncio.sleep(1)
        ok(room(code)['timer'].get('follow') is False, 'regia: timer reso indipendente')
        await A.click('.timer-sheet [data-tsclose]')
        await host.keyboard.press('p'); await asyncio.sleep(1.2)
        ok(room(code)['timer']['status'] == 'running', 'timer indipendente: continua durante la pausa')
        await host.keyboard.press('p'); await asyncio.sleep(1)

        # 7. Riconnessione durante il conto alla rovescia
        await B.reload(); await B.wait_for_selector('#shTimerChip', timeout=8000)
        s_b = secs_of(await B.inner_text('#shTimerChip b'))
        await host.click('#shTimerChip'); await host.wait_for_selector('[data-shtimer="panel"]')
        s_tv = secs_of(await host.inner_text('[data-shtimer="panel"] .sh-num'))
        ok(s_b is not None and s_tv is not None and abs(s_b - s_tv) <= 2, f'telefono ricaricato: stesso tempo della TV ({s_b} / {s_tv})')

        # 8. Scadere visto da più dispositivi: un solo avviso per dispositivo, nessuna scrittura
        await host.click('[data-tm="kind"][data-k="custom"]'); await asyncio.sleep(0.3)
        await host.fill('.sh-custom input[name="m"]', '0'); await host.fill('.sh-custom input[name="s"]', '5')
        await host.fill('.sh-custom input[name="label"]', 'Prova scadenza')
        await host.click('.sh-custom button[type="submit"]'); await asyncio.sleep(0.8)
        rev_before = room(code)['timer']['rev']
        await host.click('#tbClose')
        await asyncio.sleep(7)
        ok(room(code)['timer']['rev'] == rev_before, 'nessuna scrittura allo scadere (ogni dispositivo lo calcola da sé)')
        fired = {}
        for ph, n in ((host, 'TV'), (A, 'Andrea'), (B, 'Giulia')):
            fired[n] = await ph.evaluate("JSON.parse(sessionStorage.getItem('gnr_timer_fired') || '[]').length")
        ok(all(v == 1 for v in fired.values()), f'scadere registrato una volta per dispositivo {fired}')
        ev = [e for e in (room(code).get('events') or {}).values()] if isinstance(room(code).get('events'), dict) else []
        await B.reload(); await asyncio.sleep(2)
        ok(await B.evaluate("JSON.parse(sessionStorage.getItem('gnr_timer_fired') || '[]').length") == 1, 'dopo il ricaricamento lo scadere non si ripete')
        await shot(host, '06_tv_expired')

        # 9. Schermata ambientale durante una partita
        await host.fill('#gameName', 'Azul'); await host.click('#startPlay'); await asyncio.sleep(1)
        phase_before = room(code)['state'].get('phase'); play_before = room(code)['state'].get('playId')
        await host.keyboard.press('a'); await asyncio.sleep(1)
        ok(room(code)['meta'].get('ambient') is True, 'schermata ambientale accesa (meta.ambient)')
        await host.wait_for_selector('#ambient')
        ok(await host.is_hidden('#app'), 'regia nascosta sotto la schermata ambientale')
        txt = await host.inner_text('#ambient')
        ok('Azul' in txt and ('Andrea' in txt and 'Giulia' in txt), 'ambientale: gioco e giocatori')
        ok(await host.query_selector('#ambient .game-img--empty') is not None, 'ambientale: copertina mancante gestita (iniziali)')
        await A.click('.regia-fab'); await A.wait_for_selector('#rgBody'); await asyncio.sleep(0.5)
        await shot(host, '07_ambient_game')
        # timer nella schermata ambientale
        await A.click('#rgBody [data-open-timer]'); await A.wait_for_selector('.timer-sheet [data-tm="start"]')
        await A.click('.timer-sheet [data-tm="kind"][data-k="round"]'); await asyncio.sleep(0.3)
        if not await A.is_checked('.timer-sheet [data-tm="follow"]'):
            await A.click('.timer-sheet [data-tm="follow"]'); await asyncio.sleep(0.6)
        await A.click('.timer-sheet [data-tm="start"][data-secs="300"]'); await asyncio.sleep(1.2)
        ok(await host.is_visible('#ambient [data-shtimer="ambient"]:not(.is-none)'), 'ambientale: timer condiviso visibile')
        await A.click('.timer-sheet [data-tsclose]')
        # pausa mentre è accesa
        await host.keyboard.press('p'); await asyncio.sleep(1.2)
        ok(await host.is_visible('#ambPause') and await host.query_selector('#ambient.is-paused') is not None, 'ambientale: indicatore di pausa')
        ok(await host.query_selector('#ambient [data-shtimer="ambient"].is-paused') is not None, 'ambientale: timer in pausa con la serata')
        await shot(host, '08_ambient_paused')
        await host.keyboard.press('p'); await asyncio.sleep(1)
        # uscita: stato della partita intatto
        await host.keyboard.press('Escape'); await asyncio.sleep(1)
        r = room(code)
        ok(not r['meta'].get('ambient') and await host.query_selector('#ambient') is None and await host.is_visible('#app'), 'uscita dalla schermata ambientale: torna la regia')
        ok(r['state'].get('phase') == phase_before and r['state'].get('playId') == play_before, 'stato della partita conservato')
        # dalla regia del telefono
        await A.click('#rgBody [data-cmd="ambient"]'); await asyncio.sleep(1.5)
        ok(room(code)['meta'].get('ambient') is True and await host.query_selector('#ambient') is not None, 'regia dal telefono: accende la schermata ambientale')
        # ricaricare la TV la lascia accesa
        await host.reload(); await host.wait_for_selector('#ambient', timeout=10000)
        ok(True, 'TV ricaricata: la schermata ambientale resta')
        # votazione: la schermata si fa da parte e torna dopo
        await host.keyboard.press('Escape'); await asyncio.sleep(0.8)
        await host.keyboard.press('a'); await asyncio.sleep(0.8)
        await host.evaluate("document.body.classList.remove('ambient-on')")
        await host.keyboard.press('a'); await asyncio.sleep(0.6)
        ok(room(code)['meta'].get('ambient') is not True, 'tasto A: spegne')
        await host.click('#openVote'); await asyncio.sleep(1.2)
        await host.keyboard.press('a'); await asyncio.sleep(1)
        ok(room(code)['state']['phase'] == 'voting' and await host.query_selector('#ambient') is None and room(code)['meta'].get('ambient') is True, 'durante la votazione la schermata ambientale si fa da parte')
        await shot(host, '09_voting_with_ambient_on')

        # 10. Regole vere: un giocatore normale non scrive il timer
        res = await B.evaluate("""(async () => {
          const m = await import('./js/fb.js');
          await m.connect();
          try { await m.set(m.roomRef(new URLSearchParams(location.search).get('room'), 'timer'), { id: 'tzz', kind: 'turn', secs: 60, left: 60000, status: 'idle', rev: 999 }); return 'scritto'; }
          catch (e) { return 'rifiutato'; }
        })()""")
        ok(res == 'rifiutato', f'regole: un giocatore normale non scrive il timer ({res})')

        bad = [e for e in errs if 'permission' not in e.lower() and 'PERMISSION' not in e]
        print('ERRORI:', bad if bad else 'nessuno')
        print('FALLITI:', fails if fails else 'nessuno')
        await b.close()

try:
    asyncio.run(main())
except Exception:
    print('ERRORI della pagina:', errs[:12])
    raise
