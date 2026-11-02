# 2.3 · Eliminare anche l'ultima serata (con le regole vere, porta 8767).
# Prima: l'eliminazione riusciva, ma la TV teneva la copia locale come "serata interrotta" e "Riprendi"
# (o "Ricrea la serata da questa copia") la ricreava nel database. Qui si controlla che:
# - eliminata da un ALTRO dispositivo mentre la TV è aperta: la TV dice "Serata eliminata", senza "Ricrea";
#   ricaricata, non propone la ripresa; nel database non ricompare niente (neanche la presenza);
# - eliminata dallo STESSO computer della TV (l'ultima serata): copie locali, rientro e codice regia spariti,
#   la TV ricaricata non propone "Riprendi" e il codice è nell'elenco delle serate eliminate.
import asyncio, json, time, urllib.request
import common
from common import *
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8767'

fails = []
ANSWERS = []
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

async def new_night(A, group):
    await A.goto(BASE + '/host.html'); await A.wait_for_selector('#createBtn')
    # Una ripresa proposta (serata precedente) non deve esserci: la scheda starebbe sopra al modulo
    if await A.is_visible('#groupName'): await A.fill('#groupName', group)
    await A.click('#createBtn'); await A.wait_for_selector('.lobby')
    code = A.url.split('room=')[1]
    gid = at(tree(), f'rooms/{code}/meta/groupId')
    # Un gioco votato e il riassunto nel gruppo, come a fine serata
    raw('set', f'rooms/{code}/games/g1', {'name': 'Azul', 'order': 1, 'status': 'revealed'})
    raw('set', f'rooms/{code}/votes/g1/p1', {'overall': 8})
    raw('set', f'groups/{gid}/nights/{code}', {'at': int(time.time() * 1000), 'games': {'g1': {'name': 'Azul', 'key': 'azul', 'n': 1, 'sum': 8}}, 'creatorUid': 'creatorA_gn-regia'})
    await asyncio.sleep(3.5)  # la TV salva la copia locale (ogni 1,5 s dopo una modifica)
    saved = await A.evaluate(f"import('./js/vault.js').then(m => m.Vault.loadCurrent('{code}')).then(s => Boolean(s && s.data))")
    ok(saved, f'{code}: la TV ha la copia locale della serata (è quella che prima la faceva tornare)')
    return code, gid

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        actx, A = await device(b, 'creatorA', mobile=False)

        # ---------------- 1. Eliminata da un altro dispositivo, TV aperta ----------------
        code, gid = await new_night(A, 'Gruppo 23')
        cctx, C = await device(b, 'creatorA')  # altro dispositivo con la sessione di regia del creatore
        await C.goto(f'{BASE}/resoconto.html?room={code}&g={gid}&s=regia'); await C.wait_for_selector('#rsDelete')
        ANSWERS.append(code)
        await C.click('#rsDelete'); await C.wait_for_selector('.rs-deleted', timeout=8000)
        ok(at(tree(), f'rooms/{code}') is None and at(tree(), f'groups/{gid}/nights/{code}') is None, f'{code}: eliminata nel database')
        await A.wait_for_function("document.body.innerText.includes('Serata eliminata')", timeout=8000)
        ok(await A.query_selector('#goneRestore') is None, 'TV aperta: «Serata eliminata», nessun «Ricrea la serata»')
        await A.reload(); await A.wait_for_selector('#createBtn'); await asyncio.sleep(0.8)
        ok(await A.query_selector('.recover-card') is None, 'TV ricaricata: nessuna «serata interrotta» da riprendere')
        ok(at(tree(), f'rooms/{code}') is None, 'la stanza non ricompare (presenza compresa)')
        r = await A.evaluate(f"import('./js/fb.js').then(m => m.set(m.roomRef('{code}', 'presence/creatorA_gn-regia'), true)).then(() => 'ok', (e) => String(e.code || e.message))")
        ok(r != 'ok' and at(tree(), f'rooms/{code}') is None, f'regole: la presenza non ricrea una stanza eliminata ({r})')

        # ---------------- 2. L'ultima serata, eliminata dallo stesso computer della TV ----------------
        code2, gid2 = await new_night(A, 'Gruppo 23')
        ok(await A.evaluate("localStorage.getItem('gnr_host_room')") == code2, 'la TV ricorda la serata in corso')
        R = await actx.new_page()
        R.on('dialog', lambda d: asyncio.ensure_future(d.accept(ANSWERS.pop(0) if ANSWERS and d.type == 'prompt' else '')))
        await R.goto(f'{BASE}/resoconto.html?room={code2}&g={gid2}&s=regia'); await R.wait_for_selector('#rsDelete')
        ANSWERS.append(code2)
        await R.click('#rsDelete'); await R.wait_for_selector('.rs-deleted', timeout=8000)
        await asyncio.sleep(0.5)
        st = await R.evaluate(f"""(async () => {{
          const v = await import('./js/vault.js');
          return {{
            copy: Boolean(await v.Vault.loadCurrent('{code2}')),
            sessions: (await v.Vault.sessions()).map(s => s.room),
            host: localStorage.getItem('gnr_host_room'),
            regia: localStorage.getItem('gnr_regia_{code2}'),
            deleted: JSON.parse(localStorage.getItem('gnr_deleted_nights') || '[]')
          }};
        }})()""")
        ok(not st['copy'] and code2 not in st['sessions'], f'stesso computer: copie locali cancellate {st}')
        ok(st['host'] != code2 and st['regia'] is None, 'stesso computer: niente rientro né codice regia della serata eliminata')
        ok(code2 in st['deleted'], 'stesso computer: codice nell\'elenco delle serate eliminate')
        await A.goto(BASE + '/host.html'); await A.wait_for_selector('#createBtn'); await asyncio.sleep(0.8)
        ok(await A.query_selector('.recover-card') is None, 'TV riaperta: l\'ultima serata non è proposta come «interrotta»')
        ok(at(tree(), f'rooms/{code2}') is None and at(tree(), f'groups/{gid2}/nights/{code2}') is None, 'l\'ultima serata resta eliminata')
        # Una serata nuova con lo stesso codice non resta "eliminata"
        mark = await A.evaluate(f"import('./js/nights.js').then(m => {{ m.markDeleted('{code2}', false); return m.isLocallyDeleted('{code2}'); }})")
        ok(mark is False, 'un codice riusato per una stanza nuova esce dall\'elenco')
        await b.close()
    print('ERRORI:', common.errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
