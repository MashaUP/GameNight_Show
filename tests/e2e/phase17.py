# 1.11 · Fase 2 con le regole vere (porta 8767): ospiti (idea 5), modelli di serata e "riparti da una
# serata" (idee 10 e 11), modalità pubblico della TV (idea 13), comandi rapidi (idea 15).
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


async def join_guest(b, code, name, pick):
    ctx, ph = await phone(b, name)
    await ph.goto(f'{BASE}/play.html?room={code}'); await ph.wait_for_selector('#nameInput')
    await ph.fill('#nameInput', name); await ph.click(f'.av-opt[data-pick="{pick}"]')
    await ph.check('#guestIn'); await ph.click('#joinBtn')
    await ph.wait_for_selector('#waitList')
    return ctx, ph


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=3, group='Gruppo Fase Due')
        gid = at(f'rooms/{code}/meta/groupId')
        _, A = await join(b, code, 'Anna', 0)
        _, G = await join_guest(b, code, 'Gino', 1)
        pl = at(f'rooms/{code}/players') or {}
        gino = [p for p in pl.values() if p.get('name') == 'Gino']
        ok(gino and gino[0].get('guest') is True and not gino[0].get('memberId'), f'ospite: segnato come ospite, senza profilo di gruppo {gino[:1]}')
        ok(await G.is_visible('#waitList'), 'ospite: entra e aspetta come gli altri')
        members = at('members') or {}
        ok(not any(m.get('name') == 'Gino' for m in members.values()), 'ospite: nessun profilo di gruppo creato')

        # ---------------- Modelli di serata ----------------
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        raw(f'rooms/{code}/meta/chaos', True); raw(f'rooms/{code}/meta/voteSeconds', 90); raw(f'rooms/{code}/meta/atmosphere', 'stelle')
        await asyncio.sleep(0.6)
        await host.click('#hdrTools'); await host.wait_for_selector('#tlTpl'); await host.click('#tlTpl')
        await host.wait_for_selector('#tpSaveForm')
        await host.fill('#tpName', 'Giovedì classico'); await host.click('#tpSaveForm button[type="submit"]'); await asyncio.sleep(0.8)
        tpls = at(f'groups/{gid}/templates') or {}
        t1 = list(tpls.values())[0] if tpls else {}
        ok(t1.get('name') == 'Giovedì classico' and t1.get('s', {}).get('chaos') is True and t1.get('s', {}).get('voteSeconds') == 90, f'modello salvato nel gruppo {t1}')
        ok(not any(k in json.dumps(t1) for k in ['hostUid', 'creatorUid', code]), 'nel modello niente uid, creatore o codice della stanza')
        # cambio le impostazioni, poi applico il modello: anteprima con le differenze
        raw(f'rooms/{code}/meta/chaos', None); raw(f'rooms/{code}/meta/voteSeconds', 45); await asyncio.sleep(0.5)
        await host.click('[data-tp-preview]'); await host.wait_for_selector('#tpPreview:not([hidden])')
        pv = await host.inner_text('#tpPreview')
        ok('Chaos' in pv and '45' in pv and '90' in pv, f'anteprima: mostra che cosa cambia [{pv[:120]}]')
        await host.click('#tpApply'); await asyncio.sleep(0.8)
        meta = at(f'rooms/{code}/meta') or {}
        ok(meta.get('chaos') is True and meta.get('voteSeconds') == 90 and meta.get('atmosphere') == 'stelle', 'modello applicato alla serata')
        ok(meta.get('groupId') == gid and meta.get('hostUid'), 'il resto della stanza non cambia')

        # ---------------- Riparti da una serata precedente ----------------
        now = int(time.time() * 1000)
        raw(f'rooms/OLD7/meta', {'hostUid': 'altro', 'createdAt': now - 86400000 * 7, 'groupId': gid, 'chaos': True, 'voteSeconds': 120, 'maxPlayers': 6})
        raw(f'groups/{gid}/nights/OLD7', {'at': now - 86400000 * 7, 'games': {'x': {'name': 'Azul', 'order': 1, 'n': 2, 'sum': 15}}, 'names': ['Anna'], 'people': {}})
        await asyncio.sleep(0.8)
        await host.keyboard.press('Escape'); await asyncio.sleep(0.2)
        await host.click('#hdrTools'); await host.click('#tlTpl'); await host.wait_for_selector('[data-tp-night="OLD7"]', timeout=8000)
        await host.click('[data-tp-night="OLD7"]'); await host.wait_for_selector('#tpPreview:not([hidden])')
        pv = await host.inner_text('#tpPreview')
        ok('120' in pv and ('armadio' in pv.lower() or 'shelf' in pv.lower()) and 'giocatori' in pv.lower(), f'serata precedente: impostazioni, niente scaletta senza armadio, niente giocatori [{pv[:160]}]')
        await host.click('#tpApply'); await asyncio.sleep(0.8)
        meta = at(f'rooms/{code}/meta') or {}
        ok(meta.get('voteSeconds') == 120 and meta.get('maxPlayers', 0) >= 3, 'impostazioni della serata precedente applicate (posti non sotto chi è entrato)')
        ok(len(at(f'rooms/{code}/players') or {}) == 2 and not at(f'rooms/{code}/votes'), 'niente giocatori o voti copiati')

        # ---------------- Comandi rapidi ----------------
        btns = await host.evaluate("[...document.querySelectorAll('#quickBar [data-quick]')].map(b => [b.dataset.quick, b.disabled])")
        ok([x[0] for x in btns] == ['pause', 'timer', 'mute'], f'comandi rapidi predefiniti {btns}')
        await host.click('#quickBar [data-quick="pause"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/state/paused') is True, 'comando rapido: pausa')
        await host.click('#resumeBtn'); await asyncio.sleep(0.6)
        ok(not at(f'rooms/{code}/state/paused'), 'in pausa si riprende dal pulsante grande della TV')
        await host.click('#hdrTools'); await host.wait_for_selector('[data-qc="reveal"]')
        await host.check('[data-qc="reveal"]'); await host.check('[data-qc="public"]'); await asyncio.sleep(0.2)
        await host.click('[data-qc="next"]'); await asyncio.sleep(0.2)
        ok(not await host.is_checked('[data-qc="next"]'), 'comandi rapidi: al massimo 5')
        await host.keyboard.press('Escape'); await asyncio.sleep(0.3)
        rv = await host.evaluate("document.querySelector('#quickBar [data-quick=\"reveal\"]')?.disabled")
        ok(rv is True, 'comando rapido "Svela" spento quando non c’è una votazione')

        # ---------------- Una partita: l'ospite vota ----------------
        raw(f'rooms/{code}/meta/chaos', None); await asyncio.sleep(0.4)   # niente eventi Chaos in mezzo alla prova
        for _ in range(3):
            if await host.query_selector('#evOk'): await host.click('#evOk'); await asyncio.sleep(0.3)
        await host.fill('#gameName', 'Azul'); await asyncio.sleep(0.3)
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await asyncio.sleep(0.5)
        rv = await host.evaluate("document.querySelector('#quickBar [data-quick=\"reveal\"]')?.disabled")
        ok(rv is False, 'comando rapido "Svela" attivo durante la votazione')
        await vote(A, 8); await vote(G, 6)
        await host.wait_for_selector('.reveal', timeout=10000); await asyncio.sleep(0.8)

        # ---------------- Modalità pubblico ----------------
        await host.click('#quickBar [data-quick="public"]'); await asyncio.sleep(0.8)
        ok(at(f'rooms/{code}/meta/publicTv') is True and await host.evaluate("document.documentElement.classList.contains('tv-public')"), 'modalità pubblico accesa (comando rapido)')
        vis = await host.evaluate("""() => { const v = (s) => [...document.querySelectorAll(s)].filter(e => e.offsetParent).length;
          const fixed = (s) => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return r && r.width > 0 ? 1 : 0; };
          return { tools: v('#hdrTools'), screenBtns: v('#screen button, #screen .btn, #screen form'), code: v('.code-text'), exit: fixed('#pubExit'), cards: v('.vcard, .reveal') }; }""")
        ok(vis['tools'] == 0 and vis['screenBtns'] == 0, f'pubblico: niente comandi della regia sullo schermo {vis}')
        ok(vis['code'] >= 1 and vis['exit'] == 1, 'pubblico: restano il codice della stanza e il pulsante discreto “Regia”')
        await host.screenshot(path=os.path.join(HERE, 'out', 'phase17_public_reveal.png'))
        await host.click('#pubExit'); await asyncio.sleep(0.6)
        ok(not at(f'rooms/{code}/meta/publicTv') and await host.is_visible('#hdrTools'), 'pubblico: “Regia” riporta i comandi')
        await host.keyboard.press('v'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/meta/publicTv') is True, 'pubblico: tasto V')
        await host.reload(); await host.wait_for_selector('.tv-shell'); await asyncio.sleep(1.2)
        ok(await host.evaluate("document.documentElement.classList.contains('tv-public')"), 'pubblico: resta dopo il ricaricamento')
        await host.keyboard.press('v'); await asyncio.sleep(0.6)
        await host.click('#nextGame'); await asyncio.sleep(0.6)
        await host.click('#quickBar [data-quick="public"]'); await asyncio.sleep(0.8)
        ok(await host.query_selector('#ambient') is not None, 'pubblico tra un gioco e l’altro: schermata ambientale al posto del modulo')
        await host.click('#ambExit'); await asyncio.sleep(0.6)
        ok(not at(f'rooms/{code}/meta/publicTv') and await host.query_selector('#ambient') is None, 'dalla schermata ambientale “Torna alla regia” spegne anche la modalità pubblico')

        # ---------------- Fine serata: l'ospite non resta nel gruppo ----------------
        await host.click('#hdrEnd'); await asyncio.sleep(0.5)
        await host.wait_for_selector('[data-edgo]'); await host.click('[data-edgo] >> nth=0')
        await host.wait_for_selector('.awards', timeout=10000); await asyncio.sleep(1.5)
        night = at(f'groups/{gid}/nights/{code}') or {}
        ok(night.get('guests') == 1 and 'Gino' not in json.dumps(night), f'riassunto nel gruppo: solo quanti ospiti, nessun dato dell’ospite ({night.get("names")}, guests={night.get("guests")})')
        g1 = [g for g in (night.get('games') or {}).values() if g.get('name') == 'Azul']
        ok(g1 and g1[0].get('n') == 2 and g1[0].get('sum') == 14, 'il voto dell’ospite conta nella media del gioco')
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
