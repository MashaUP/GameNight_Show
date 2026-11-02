# 2.4 nel browser, con le regole vere (porta 8767):
# - chiudere una serata ancora in corso dal resoconto (pagina Serate → "Chiudi la serata"), con conferma;
#   un altro dispositivo non vede il pulsante; la TV aperta salva il riassunto nel gruppo;
# - la stanza di prova (giocatori finti) ricorda il creatore, quindi si può eliminare;
# - più di 12 posti (decide il master, fino a 100);
# - Silenzioso: stato visibile (aria-pressed), salvato, copiato in meta/muted per il telefono della regia;
# - preferenze della lobby (modalità Minimal) salvate sulla TV;
# - griglia dei partecipanti con 14 giocatori: niente scorrimento orizzontale, pulsante "Inizia" visibile.
# python3 tests/e2e/run.py v24
import asyncio, json, time, urllib.request
import common
from common import *
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8767'

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def raw(op, path, value=None):
    body = json.dumps({'op': op, 'path': path, 'value': value, 'raw': True}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/__db', data=body, method='POST')).read())

def tree():
    return json.loads(urllib.request.urlopen(BASE + '/__dump').read())

def at(t, path):
    for k in path.split('/'):
        if not isinstance(t, dict) or k not in t: return None
        t = t[k]
    return t

async def device(b, uid, mobile=True, w=1280, h=720):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile, locale='it-IT')
    await ctx.add_init_script(f"try {{ sessionStorage.setItem('fake_uid', '{uid}'); localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_intro_done', '1'); localStorage.setItem('gnr_lite', 'off'); }} catch (e) {{}}")
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: common.errs.append(f'[{uid}] {e}'))
    pg.on('console', lambda m: common.errs.append(f'[{uid}] {m.text}') if m.type == 'error' and 'permission' not in m.text.lower() and not any(x in m.text for x in common._NET) else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    return ctx, pg

async def create(pg, group='Gruppo 2.4', seats=None):
    await pg.goto(BASE + '/host.html'); await pg.wait_for_selector('#createBtn')
    if seats is not None:
        await pg.fill('#countOut', str(seats)); await pg.dispatch_event('#countOut', 'change')
    if await pg.is_visible('#groupName'): await pg.fill('#groupName', group)
    await pg.click('#createBtn'); await pg.wait_for_selector('.lobby')
    return pg.url.split('room=')[1]

async def main():
    now = int(time.time() * 1000)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------------- Serata in corso con un gioco votato
        actx, A = await device(b, 'master24', mobile=False, w=1920, h=1080)
        code = await create(A)
        meta = at(tree(), f'rooms/{code}/meta'); gid = meta.get('groupId')
        raw('set', f'rooms/{code}/players/u1', {'name': 'Anna', 'color': '#FF5A5F', 'joinedAt': now})
        raw('set', f'rooms/{code}/players/u2', {'name': 'Bruno', 'color': '#3DDC97', 'joinedAt': now})
        raw('set', f'rooms/{code}/games/g1', {'name': 'Azul', 'status': 'revealed', 'order': 1, 'addedAt': now})
        raw('set', f'rooms/{code}/votes/g1', {'u1': {'overall': 8, 'at': now}, 'u2': {'overall': 7, 'at': now}})
        await asyncio.sleep(0.8)

        # ---------------- Silenzioso: stato visibile, salvato, copiato per la regia
        mute = '#quickBar .quick-btn--mute'
        await A.wait_for_selector(mute)
        ok(await A.get_attribute(mute, 'aria-pressed') == 'false', 'silenzioso: spento all\'inizio (aria-pressed=false)')
        await A.click(mute); await asyncio.sleep(0.8)
        ok(await A.get_attribute(mute, 'aria-pressed') == 'true', 'silenzioso: il pulsante resta premuto')
        ok(await A.evaluate("localStorage.getItem('gnr_mute')") == '1', 'silenzioso: scelta salvata sulla TV')
        ok(at(tree(), f'rooms/{code}/meta/muted') is True, 'silenzioso: stato copiato nella stanza per il telefono della regia')
        await A.reload(); await A.wait_for_selector(mute)
        ok(await A.get_attribute(mute, 'aria-pressed') == 'true', 'silenzioso: resta acceso dopo la ricarica')
        # Comando dalla regia (come lo manda il telefono): la TV si riattiva
        raw('set', f'rooms/{code}/commands/c1', {'type': 'mute', 'on': False, 'uid': 'master24_gn-regia', 'at': now})
        await asyncio.sleep(1.5)
        ok(await A.get_attribute(mute, 'aria-pressed') == 'false', 'silenzioso: il comando della regia lo spegne sulla TV')
        ok(at(tree(), f'rooms/{code}/meta/muted') is None, 'silenzioso: stato della stanza aggiornato')

        # ---------------- Preferenze della lobby: Minimal salvata sulla TV
        await A.click('#hdrTools'); await A.wait_for_selector('#tlLobby [data-lobby-mode="minimal"]', state='visible')
        await A.click('#tlLobby [data-lobby-mode="minimal"]'); await asyncio.sleep(0.4); await A.click('#tlClose')
        ok(await A.get_attribute('.room', 'data-mode') == 'minimal', 'lobby: modalità Minimal applicata')
        await A.reload(); await A.wait_for_selector('.room')
        ok(await A.get_attribute('.room', 'data-mode') == 'minimal', 'lobby: modalità ritrovata dopo la ricarica')
        await A.evaluate("localStorage.removeItem('gnr_lobby')"); await A.reload(); await A.wait_for_selector('.room')

        # ---------------- Griglia con 14 giocatori: niente scorrimento orizzontale, "Inizia" visibile
        for i in range(3, 15):
            raw('set', f'rooms/{code}/players/u{i}', {'name': f'Giocatore {i}', 'color': '#7B5CFA', 'joinedAt': now + i})
        raw('set', f'rooms/{code}/meta/maxPlayers', 16)
        await asyncio.sleep(1.2)
        g = await A.evaluate("""() => { const W = innerWidth, H = innerHeight; const s = document.getElementById('startBtn').getBoundingClientRect();
          return { cards: document.querySelectorAll('#slots .pcard:not(.pcard--free):not(.pcard--empty)').length,
                   hscroll: document.documentElement.scrollWidth > W + 1, start: s.bottom <= H + 1 && s.top >= 0 && s.height > 0 }; }""")
        ok(g['cards'] == 14, f'lobby: 14 partecipanti mostrati ({g["cards"]})')
        ok(not g['hscroll'], 'lobby: niente scorrimento orizzontale con 14 giocatori')
        ok(g['start'], 'lobby: "Inizia la serata" visibile, non tagliato')

        # ---------------- Chiudere la serata in corso
        # Un altro dispositivo (non creatore) non vede il pulsante
        octx, O = await device(b, 'altro24')
        await O.goto(f'{BASE}/resoconto.html?room={code}&do=close'); await O.wait_for_selector('.rs-hero')
        ok(await O.query_selector('#rsClose') is None, 'chiusura: chi non ha creato la serata non vede "Chiudi la serata"')
        # Il master dalla pagina Serate (stesso dispositivo della TV: ha il codice regia, quindi la sessione giusta)
        R = await actx.new_page()
        R.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await R.goto(f'{BASE}/index.html#serate'); await R.wait_for_selector('#hubHistory')
        link = f'#hubHistory a[href*="room={code}"][href*="do=close"]'
        try:
            await R.wait_for_selector(link, timeout=8000); has = True
        except Exception: has = False
        ok(has, 'Serate: la serata in corso ha "Chiudi la serata" (distinto da Elimina)')
        if has: await R.click(link)
        else: await R.goto(f'{BASE}/resoconto.html?room={code}&do=close&s=regia')
        await R.wait_for_selector('#rsClose')
        focused = await R.evaluate("document.activeElement && document.activeElement.id")
        ok(focused == 'rsClose', f'chiusura: arrivando da "Chiudi la serata" il pulsante è pronto ({focused})')
        await R.click('#rsClose'); await asyncio.sleep(1.5)
        st = at(tree(), f'rooms/{code}/state') or {}
        ok(st.get('phase') == 'awards' and st.get('done') is True and st.get('remote') is True, f'chiusura: serata portata alla premiazione ({st})')
        ok(at(tree(), f'rooms/{code}/games/g1/name') == 'Azul' and at(tree(), f'rooms/{code}/votes/g1/u1/overall') == 8, 'chiusura: giochi e voti restano (non è un\'eliminazione)')
        ok(await R.query_selector('#rsClose') is None, 'chiusura: il pulsante sparisce, la serata risulta conclusa')
        await asyncio.sleep(1.5)
        night = at(tree(), f'groups/{gid}/nights/{code}')
        ok(isinstance(night, dict) and bool(night.get('games')), f'chiusura: la TV aperta salva il riassunto nel gruppo ({list((night or {}).get("games", {}))})')
        await O.close(); await R.close()

        # ---------------- Più di 12 posti
        dctx, D = await device(b, 'grande24', mobile=False)
        code2 = await create(D, group='Gruppo grande', seats=30)
        ok(at(tree(), f'rooms/{code2}/meta/maxPlayers') == 30, f'posti: 30 posti accettati ({at(tree(), f"rooms/{code2}/meta/maxPlayers")})')

        # ---------------- Stanza di prova: ricorda il creatore (si può eliminare)
        cctx, C = await device(b, 'prova24', mobile=False)
        await C.goto(BASE + '/host.html'); await C.wait_for_selector('#demoBtn')
        await C.click('#demoBtn'); await C.wait_for_selector('.lobby')
        code3 = C.url.split('room=')[1]
        m3 = at(tree(), f'rooms/{code3}/meta') or {}
        ok(m3.get('demo') is True and m3.get('creatorUid') == 'prova24_gn-regia', f'prova: creatore registrato ({m3.get("creatorUid")})')
        # Il creatore la elimina dal resoconto (stessa sessione della TV)
        common_answers = [code3]
        E = await cctx.new_page()
        E.on('dialog', lambda d: asyncio.ensure_future(d.accept(common_answers.pop(0) if common_answers and d.type == 'prompt' else '')))
        await E.goto(f'{BASE}/resoconto.html?room={code3}'); await E.wait_for_selector('#rsDelete')
        await E.click('#rsDelete'); await E.wait_for_selector('.rs-deleted', timeout=8000)
        ok(at(tree(), f'rooms/{code3}') is None, 'prova: la serata con giocatori finti si elimina')

        await b.close()
    print('ERRORI:', common.errs if common.errs else 'nessuno')
    print('FALLITI:', fails if fails else 'nessuno')

asyncio.run(main())
