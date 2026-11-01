# 1.11 · Eliminare una serata: solo il master che l'ha creata (richiesta 83), con le regole vere (porta 8767).
# - la stanza nuova ricorda il creatore (meta.creatorUid) e il riassunto nel gruppo lo copia;
# - un altro master (admin del gruppo) non vede il pulsante e il database gli rifiuta la cancellazione,
#   anche chiamando direttamente il database e anche dopo aver preso la regia;
# - il creatore conferma scrivendo il codice (codice sbagliato: non succede niente), poi spariscono stanza,
#   riassunto, album ed elenco, e la serata esce dallo storico locale;
# - riassunto rimasto senza stanza: lo elimina il creatore; stanza di prima della 1.11: vale la TV che la guida.
import asyncio, json, time, urllib.request
import common
from common import *
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8767'

fails = []
ANSWERS = []  # risposte ai prompt, in ordine
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

async def device(b, uid, mobile=True):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 720}, is_mobile=mobile, has_touch=mobile, locale='it-IT')
    await ctx.add_init_script(f"try {{ sessionStorage.setItem('fake_uid', '{uid}'); localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_intro_done', '1'); }} catch (e) {{}}")
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: common.errs.append(f'[{uid}] {e}'))
    pg.on('console', lambda m: common.errs.append(f'[{uid}] {m.text}') if m.type == 'error' and 'PERMISSION_DENIED' not in m.text and 'permission' not in m.text.lower() else None)
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept(ANSWERS.pop(0) if ANSWERS and d.type == 'prompt' else '')))
    return ctx, pg

async def main():
    now = int(time.time() * 1000)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # La TV del creatore crea una serata con il gruppo
        actx, A = await device(b, 'creatorA', mobile=False)
        await A.goto(BASE + '/host.html'); await A.wait_for_selector('#createBtn')
        if await A.is_visible('#groupName'): await A.fill('#groupName', 'Gruppo Prova')
        await A.click('#createBtn'); await A.wait_for_selector('.lobby')
        code = A.url.split('room=')[1]
        meta = at(tree(), f'rooms/{code}/meta')
        gid = meta.get('groupId')
        # 2.0: la TV usa la sessione di regia (uid "<dispositivo>_gn-regia"), separata da quella del giocatore
        CREATOR = 'creatorA_gn-regia'
        ok(meta.get('creatorUid') == CREATOR and meta.get('hostUid') == CREATOR, f'stanza nuova: creatore registrato ({meta.get("creatorUid")})')
        # Dati della serata: riassunto nel gruppo (come lo scrive la TV a fine serata), album, secondo master admin del gruppo
        night = {'at': now - 3600000, 'games': {'g1': {'name': 'Azul', 'key': 'azul', 'n': 2, 'sum': 15}}, 'creatorUid': CREATOR}
        raw('set', f'groups/{gid}/nights/{code}', night)
        raw('set', f'groups/{gid}/photos/{code}/f1', {'uid': CREATOR, 'data': 'data:image/jpeg;base64,AAAA'})
        raw('set', f'groups/{gid}/admins/master2', True)
        raw('set', f'groups/{gid}/rooms/{code}', True)
        # Il creatore ricorda la serata nello storico locale
        await A.evaluate(f"localStorage.setItem('gnr_history', JSON.stringify([{{ room: '{code}', gid: '{gid}', at: Date.now() }}]))")

        # ---------------- Un altro master ----------------
        bctx, B = await device(b, 'master2')
        await B.goto(f'{BASE}/resoconto.html?room={code}&g={gid}'); await B.wait_for_selector('.rs-board, .rs')
        await asyncio.sleep(0.5)
        ok(await B.query_selector('#rsDelete') is None, 'altro master: nessun pulsante "Elimina"')
        r = await B.evaluate(f"import('./js/nights.js').then(m => m.deleteNight('{code}', '{gid}')).then(() => 'ok', (e) => String(e.code || e.message))")
        t = tree()
        ok(r != 'ok' and at(t, f'rooms/{code}/meta') and at(t, f'groups/{gid}/nights/{code}'), f'altro master: il database rifiuta anche la chiamata diretta ({r})')
        r = await B.evaluate(f"import('./js/fb.js').then(m => m.remove(m.groupRef('{gid}', 'nights/{code}'))).then(() => 'ok', (e) => String(e.code || e.message))")
        ok(r != 'ok' and at(tree(), f'groups/{gid}/nights/{code}'), 'altro master: non cancella neanche solo il riassunto nel gruppo')
        # Anche prendendo la regia (hostUid) non diventa il creatore
        raw('set', f'rooms/{code}/meta/hostUid', 'master2')
        r = await B.evaluate(f"import('./js/fb.js').then(m => m.update(m.roomRef('{code}', 'meta'), {{ creatorUid: 'master2' }})).then(() => 'ok', (e) => String(e.code || e.message))")
        ok(r != 'ok' and at(tree(), f'rooms/{code}/meta/creatorUid') == CREATOR, 'chi prende la regia non può farsi creatore')
        await B.reload(); await B.wait_for_selector('.rs'); await asyncio.sleep(0.4)
        ok(await B.query_selector('#rsDelete') is None, 'con la regia in mano: ancora nessun pulsante')

        # ---------------- Il creatore ----------------
        rctx, C = await device(b, 'creatorA')
        await C.goto(f'{BASE}/resoconto.html?room={code}&g={gid}&s=regia'); await C.wait_for_selector('#rsDelete')
        ok(True, 'creatore (resoconto aperto dalla TV): pulsante "Elimina la serata" visibile (anche dopo aver passato la regia)')
        ANSWERS.extend(['ZZZZ', code])
        await C.click('#rsDelete'); await asyncio.sleep(0.6)
        ok('non corrisponde' in await C.inner_text('#rsDelErr') and at(tree(), f'rooms/{code}/meta'), 'codice sbagliato: la serata resta')
        await C.evaluate(f"localStorage.setItem('gnr_history', JSON.stringify([{{ room: '{code}', gid: '{gid}', at: Date.now() }}, {{ room: 'QQQQ', at: Date.now() }}]))")
        await C.click('#rsDelete'); await C.wait_for_selector('.rs-deleted', timeout=8000)
        t = tree()
        gone = [p for p in (f'rooms/{code}', f'groups/{gid}/nights/{code}', f'groups/{gid}/photos/{code}', f'groups/{gid}/rooms/{code}', f'secrets/{code}') if at(t, p) is not None]
        ok(not gone, f'creatore: stanza, riassunto, album, elenco e codice regia cancellati {gone}')
        ok(at(t, f'groups/{gid}/info') is not None, 'il gruppo resta')
        hist = await C.evaluate("JSON.parse(localStorage.getItem('gnr_history') || '[]').map(n => n.room)")
        ok(hist == ['QQQQ'], f'la serata esce dallo storico locale ({hist})')

        # ---------------- Riassunto rimasto senza stanza ----------------
        raw('set', f'groups/{gid}/nights/OLD9', {'at': now - 86400000 * 40, 'games': {'g1': {'name': 'Dixit', 'key': 'dixit', 'n': 1, 'sum': 7}}, 'creatorUid': CREATOR})
        await B.goto(f'{BASE}/resoconto.html?room=OLD9&g={gid}'); await B.wait_for_selector('.rs'); await asyncio.sleep(0.4)
        ok(await B.query_selector('#rsDelete') is None, 'riassunto senza stanza: l\'altro master non vede il pulsante')
        await C.goto(f'{BASE}/resoconto.html?room=OLD9&g={gid}&s=regia'); await C.wait_for_selector('#rsDelete')
        ANSWERS.append('OLD9')
        await C.click('#rsDelete'); await C.wait_for_selector('.rs-deleted', timeout=8000)
        ok(at(tree(), f'groups/{gid}/nights/OLD9') is None, 'riassunto senza stanza: il creatore lo elimina')

        # ---------------- Stanza di prima della 1.11 (senza creatore) ----------------
        # (la TV di allora usava la sessione unica del browser, che oggi è quella del giocatore)
        raw('set', 'rooms/LEG1', {'meta': {'hostUid': 'creatorA', 'createdAt': now - 3600000, 'groupName': 'Vecchia'}, 'state': {'phase': 'awards'}})
        await B.goto(f'{BASE}/resoconto.html?room=LEG1'); await B.wait_for_selector('.rs'); await asyncio.sleep(0.3)
        ok(await B.query_selector('#rsDelete') is None, 'stanza vecchia: solo la TV che la guida vede il pulsante')
        await C.goto(f'{BASE}/resoconto.html?room=LEG1'); await C.wait_for_selector('#rsDelete')
        ANSWERS.append('LEG1')
        await C.click('#rsDelete'); await C.wait_for_selector('.rs-deleted', timeout=8000)
        ok(at(tree(), 'rooms/LEG1') is None, 'stanza vecchia: la TV che la guidava la elimina')
        await b.close()
    print('ERRORI:', common.errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
