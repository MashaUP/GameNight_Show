"""2.2 nel browser: checklist «Pronti?» riducibile, lobby partita (copertina e azione principale),
rivelazione dei voti decisa dalla regia o automatica (anche cambiata a votazione aperta), «Gioca anche tu»
dalla TV, chi vede l'armadio e «Rimuovi accesso» con le regole vere.
python3 tests/e2e/run.py v22"""
import asyncio, json, re
from playwright.async_api import async_playwright
from common import *

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def at(path):
    c = db()
    for s in path.split('/'):
        if not isinstance(c, dict): return None
        c = c.get(s)
    return c

async def until(cond, timeout=10):
    end = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < end:
        try:
            if cond(): return True
        except Exception: pass
        await asyncio.sleep(0.2)
    return False

async def tools(host):
    await host.click('#hdrTools'); await host.wait_for_selector('#tlRevealAll')

async def close_tools(host):
    await host.click('#tlClose')

async def new_game(host, name):
    await host.wait_for_selector('#gameName')
    await host.fill('#gameName', name)
    await host.click('#openVote'); await host.wait_for_selector('.voting')

RULES = 'http://localhost:8767'
INIT = "try{localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off');localStorage.setItem('gnr_intro_done','1')}catch(e){}"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        tctx, host, code = await tv(b, seats=4)
        _, A = await join(b, code, 'Anna', 0)
        _, B = await join(b, code, 'Bruno', 1)

        # ---------------- Checklist «Pronti?»: una riga e di nuovo completa
        await host.wait_for_selector('.prep-ready [data-ready-view="mini"]')
        await host.click('.prep-ready [data-ready-view="mini"]')
        await host.wait_for_selector('.prep-ready-mini', timeout=5000)
        ok(await host.query_selector('.prep-ready .ready-list') is None, 'checklist ridotta a una riga')
        ok(await host.evaluate("localStorage.getItem('gnr_ready_view')") == 'mini', 'preferenza della TV salvata')
        await host.click('.prep-ready-mini'); await host.wait_for_selector('.prep-ready .ready-list')
        ok(True, 'checklist di nuovo completa')
        reg = await host.query_selector('#lobbyRegia .regia-code')
        ok(reg is not None and re.match(r'^[A-Z0-9]{4}-[A-Z0-9]{4}$', (await reg.inner_text()).strip()) is not None, 'codice regia nel riquadro da copiare')

        # ---------------- Lobby partita: copertina e azione principale secondo lo stato
        await host.click('#startBtn'); await host.wait_for_selector('.idle--v22 .ng-hero #dropzone')
        ok('ng-primary' in (await host.get_attribute('#startPlay', 'class')) and 'ng-primary' not in (await host.get_attribute('#openVote', 'class')), 'prima della partita: «Inizia la partita» è l’azione principale')
        await host.fill('#gameName', 'Azul')
        await host.set_input_files('#fileInput', HERE + '/fixtures/imgs/tall.jpg')
        try: await photo_ok(host)
        except Exception: pass
        await host.wait_for_selector('#dropzone.has-img .drop-fg', timeout=8000)
        fit = await host.evaluate("getComputedStyle(document.querySelector('#dropzone .drop-fg')).objectFit")
        box = await host.evaluate("(()=>{const r=document.querySelector('#dropzone').getBoundingClientRect();return [r.width,r.height]})()")
        ok(fit == 'contain' and box[1] >= 230, f'copertina intera e grande ({fit}, {int(box[0])}×{int(box[1])})')
        await host.click('#startPlay'); await asyncio.sleep(0.8)
        ok('ng-primary' in (await host.get_attribute('#openVote', 'class')), 'a partita iniziata: «Apri la votazione» diventa l’azione principale')
        ok(await host.query_selector('.side-toolbar #endNight.side-end') is not None, '«Termina la serata» separato nella barra delle azioni')

        # ---------------- Rivelazione decisa dalla regia
        await tools(host)
        ok(await host.is_checked('#tlRevealAll'), 'di base la rivelazione è automatica')
        await host.uncheck('#tlRevealAll')
        ok(await until(lambda: at(f'rooms/{code}/meta/manualReveal') is True), 'impostazione salvata nella stanza (meta/manualReveal)')
        await close_tools(host)
        await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(A, 8); await vote(B, 7)
        await asyncio.sleep(3.5)
        ok(at(f'rooms/{code}/state/phase') == 'voting', 'tutti hanno votato ma i voti restano nascosti')
        txt = await host.inner_text('#voteCount')
        ok('pronti per la rivelazione' in txt, f'la TV dice che è pronta ({txt!r})')
        ok('is-ready' in (await host.get_attribute('#revealBtn', 'class')), 'il pulsante «Rivela» lo segnala')
        await A.wait_for_selector('#voteProg')
        ok(await until(lambda: True) and 'regia' in (await A.inner_text('#voteProg')), 'il telefono dice che decide la regia')
        gid = at(f'rooms/{code}/state/gameId')
        await host.click('#revealBtn')
        ok(await until(lambda: at(f'rooms/{code}/state/phase') == 'reveal'), 'la regia rivela quando vuole')
        ok(at(f'rooms/{code}/games/{gid}/status') == 'revealed', 'gioco segnato come rivelato')
        await host.wait_for_selector('#toBoard', timeout=15000); await host.click('#toBoard'); await host.wait_for_selector('#nextGame')
        await host.click('#nextGame')

        # ---------------- Cambio a votazione aperta: con tutti i voti, riaccesa → rivela da sola, una volta
        await host.wait_for_selector('#gameName', timeout=10000)
        await new_game(host, 'Dixit')
        await vote(A, 9); await vote(B, 6)
        await asyncio.sleep(2.8)
        ok(at(f'rooms/{code}/state/phase') == 'voting', 'ancora in attesa della regia')
        await tools(host); await host.check('#tlRevealAll'); await close_tools(host)
        ok(await until(lambda: at(f'rooms/{code}/state/phase') == 'reveal', 8), 'riaccesa a voti completi: la rivelazione parte da sola')
        gid2 = at(f'rooms/{code}/state/gameId')
        r1 = at(f'rooms/{code}/games/{gid2}/revealedAt')
        await asyncio.sleep(2.5)
        ok(at(f'rooms/{code}/games/{gid2}/revealedAt') == r1, 'una sola rivelazione (nessuna seconda scrittura)')

        # ---------------- «Gioca anche tu» dalla TV
        n_before = len(at(f'rooms/{code}/players') or {})
        async with tctx.expect_page() as pi:
            await host.click('#hdrPlayHere')
        P = await pi.value; watch(P, 'regia-gioca')
        await P.wait_for_load_state()
        ok(f'play.html?room={code}' in P.url, 'si apre la pagina del giocatore della stessa stanza')
        await P.wait_for_selector('#nameInput'); await P.fill('#nameInput', 'Regia'); await P.click('.av-opt[data-pick="3"]'); await P.click('#joinBtn')
        await P.wait_for_function('() => !document.querySelector("#joinBtn")', timeout=10000)
        players = at(f'rooms/{code}/players') or {}
        ok(await until(lambda: len(at(f'rooms/{code}/players') or {}) == n_before + 1), 'la regia entra come giocatore in più (una volta sola)')
        host_uid = at(f'rooms/{code}/meta/hostUid')
        ok(host_uid not in (at(f'rooms/{code}/players') or {}), 'giocatore e regia restano identità separate')
        ok(await host.query_selector('.reveal, .board, .idle') is not None, 'la regia continua a funzionare nella sua scheda')

        # ---------------- Armadio: chi lo vede e «Rimuovi accesso» (regole vere)
        octx = await b.new_context(viewport={'width': 1280, 'height': 820}); await octx.add_init_script(INIT)
        O = await octx.new_page(); watch(O, 'proprietario')
        await O.goto(RULES + '/index.html'); await O.wait_for_selector('#tileArm')
        await O.click('#tileArm'); await O.click('#armNew'); await O.fill('#naName', 'Casa 2.2'); await O.click('#naGo')
        await O.wait_for_selector('#edForm', timeout=10000)
        aid = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)
        await O.fill('#edName', 'Azul'); await O.click('#edSave'); await wait_js(O, "!document.querySelector('#edForm')", 10000)
        vctx = await b.new_context(viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True); await vctx.add_init_script(INIT)
        V = await vctx.new_page(); watch(V, 'visitatore')
        await V.goto(RULES + f'/armadio.html?a={aid}'); await V.wait_for_selector('.am-card', timeout=10000)
        ok('Azul' in await V.inner_text('#amBody'), 'il visitatore vede i giochi con il codice')
        await O.click('[data-tab="tools"]'); await O.wait_for_selector('.am-viewers')
        await wait_js(O, "!!document.querySelector('[data-block]')", 10000)
        ok(await O.query_selector('.am-viewers [data-block]') is not None, 'il proprietario vede chi visualizza l’armadio')
        await O.click('.am-viewers [data-block]')
        await V.wait_for_selector('text=Non hai più accesso', timeout=10000)
        ok(True, 'la pagina aperta del visitatore mostra subito «Non hai più accesso»')
        await V.reload(); await V.wait_for_selector('text=Non hai più accesso', timeout=10000)
        ok(True, 'riaprendo il link resta escluso')
        await O.wait_for_selector('[data-unblock]', state='attached', timeout=8000)
        await O.click('details.am-blocked summary'); await O.click('[data-unblock]')
        await asyncio.sleep(1)
        await V.reload(); await V.wait_for_selector('.am-card', timeout=10000)
        ok(True, 'riammesso, vede di nuovo i giochi')

        await b.close()
    print('FALLITI:', fails if fails else '')
    print(errs or 'no errors')

asyncio.run(main())
