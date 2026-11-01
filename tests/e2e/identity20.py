# 2.0 · Identità, sessioni e rientro con le regole vere (porta 8767):
# - regia e giocatore nello stesso browser hanno sessioni separate (niente conflitti di ruolo);
# - chiudere e riaprire il browser: si rientra da soli al proprio posto;
# - account permanente (Google simulato, email e password): stesso uid su tutti i dispositivi, niente doppioni;
# - stesso profilo personale da un altro dispositivo: posto spostato da solo (verificato dalle regole), il vecchio
#   dispositivo vede "Ora giochi da un altro dispositivo" e può riprenderlo;
# - cambio di account con una serata in corso: il posto passa al nuovo uid con il gettone di passaggio;
# - voti dopo la votazione: finestra aperta dalla regia, voto aggiunto, modifica permessa, registro.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, json, urllib.request
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

import random
RUN = str(random.randint(10000, 99999))
ANNA = f'anna{RUN}@example.com'
DARIO = f'dario{RUN}@example.com'
SHARED = "try { localStorage.setItem('fake_shared', '1'); localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}"

async def browser(b, name, mobile=True):
    """Un browser vero: le schede condividono l'accesso (come Firebase)."""
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 720}, is_mobile=mobile, accept_downloads=True)
    await ctx.add_init_script(SHARED)
    pg = await ctx.new_page(); watch(pg, name)
    return ctx, pg

async def join_as(pg, code, name, pick=0):
    await pg.goto(f'{BASE}/play.html?room={code}'); await pg.wait_for_selector('#nameInput')
    await pg.fill('#nameInput', name); await pg.click(f'.av-opt[data-pick="{pick}"]'); await pg.click('#joinBtn')
    await pg.wait_for_selector('#waitList')

async def until(cond, timeout=10):
    """Aspetta che una condizione sui dati diventi vera (al massimo timeout secondi)."""
    end = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < end:
        try:
            if cond(): return True
        except Exception: pass
        await asyncio.sleep(0.25)
    return False

def players_named(code, name):
    return [(u, p) for u, p in (at(f'rooms/{code}/players') or {}).items() if p.get('name') == name]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------------- Regia e giocatore nello stesso browser ----------------
        tctx, host = await browser(b, 'tv', mobile=False)
        await host.goto(BASE + '/host.html'); await host.wait_for_selector('#createBtn')
        if await host.is_visible('#groupName'): await host.fill('#groupName', 'Gruppo Identità')
        await host.click('#createBtn'); await host.wait_for_selector('.lobby')
        code = host.url.split('room=')[1]
        gid = at(f'rooms/{code}/meta/groupId')
        same = await tctx.new_page(); watch(same, 'stesso-browser')
        await join_as(same, code, 'Regista', 3)
        host_uid = at(f'rooms/{code}/meta/hostUid')
        reg = players_named(code, 'Regista')
        ok(reg and reg[0][0] != host_uid, f'stesso browser: la regia ({host_uid}) e il giocatore ({reg[0][0] if reg else None}) hanno sessioni diverse')
        await host.reload(); await host.wait_for_selector('.lobby', timeout=8000)
        ok(at(f'rooms/{code}/meta/hostUid') == host_uid and await host.query_selector('#lostRegia') is None, 'la TV ricaricata resta la regia (stessa sessione di regia)')
        await same.close()

        # ---------------- Chiudere e riaprire il browser ----------------
        actx, A = await browser(b, 'anna')
        await join_as(A, code, 'Anna', 0)
        a_uid = players_named(code, 'Anna')[0][0]
        await asyncio.sleep(1.2)
        a_pid = at(f'rooms/{code}/players/{a_uid}/pid')
        ok(bool(a_pid), f'il posto ricorda il profilo personale (pid {a_pid})')
        await A.close()
        A = await actx.new_page(); watch(A, 'anna2')
        await A.goto(f'{BASE}/play.html?room={code}'); await A.wait_for_selector('#waitList', timeout=8000)
        ok(len(players_named(code, 'Anna')) == 1, 'browser riaperto: di nuovo al proprio posto, nessun doppione')

        # ---------------- Account con Google: collegato sul primo dispositivo ----------------
        await A.evaluate(f"localStorage.setItem('fake_google', '{ANNA}')")
        await A.goto(f'{BASE}/index.html#altro'); await A.wait_for_selector('[data-act="acc-google"]', timeout=8000)
        await A.click('[data-act="acc-google"]')
        await until(lambda: at(f'accounts/{a_uid}'))
        acc = at(f'accounts/{a_uid}') or {}
        ok(acc.get('pid') == a_pid and len(acc.get('key', '')) == 8, f'account collegato senza cambiare uid, con il profilo personale {acc.get("pid")}')
        await asyncio.sleep(1.5)
        await A.goto(f'{BASE}/index.html#altro')
        shown = await wait_js(A, f"(document.querySelector('#accCard')?.innerText || '').includes('{ANNA}')", 8000)
        ok(shown, 'il profilo mostra l’account collegato')

        # ---------------- Lo stesso account su un altro dispositivo ----------------
        bctx, B = await browser(b, 'anna-pc', mobile=False)
        await B.goto(f'{BASE}/index.html'); await asyncio.sleep(1)
        await B.evaluate(f"localStorage.setItem('fake_google', '{ANNA}')")
        await B.goto(f'{BASE}/index.html?accedi=1&torna=play.html%3Froom%3D{code}'); await B.wait_for_selector('[data-act="acc-google"]', timeout=8000)
        await B.click('[data-act="acc-google"]')
        await B.wait_for_url('**/play.html?room=*', timeout=10000); await B.wait_for_selector('#waitList', timeout=8000)
        ok(len(players_named(code, 'Anna')) == 1, 'altro dispositivo con lo stesso account: stessa persona al suo posto, nessun doppione')
        ok(await B.evaluate("JSON.parse(localStorage.getItem('gnr_person') || '{}').pid") == a_pid, 'altro dispositivo: profilo personale ritrovato dall’account')

        # ---------------- Stesso profilo personale, dispositivo senza account ----------------
        key = acc.get('key')
        cctx, Cp = await browser(b, 'anna-tablet')
        await Cp.add_init_script(f"try {{ if (!localStorage.getItem('gnr_person')) localStorage.setItem('gnr_person', JSON.stringify({{ pid: '{a_pid}', key: '{key}' }})); }} catch (e) {{}}")
        await Cp.goto(f'{BASE}/play.html?room={code}'); await Cp.wait_for_selector('#movedBack', timeout=8000)
        ok(True, 'nuovo dispositivo con lo stesso profilo: propone di prendere qui il posto (niente secondo giocatore)')
        c_uid = await Cp.evaluate("import('./js/fb.js').then(m => m.connect())")
        await Cp.click('#movedBack')
        await until(lambda: players_named(code, 'Anna')[0][0] == c_uid)
        rows = players_named(code, 'Anna')
        ok(len(rows) == 1 and rows[0][0] == c_uid, f'profilo verificato: la TV sposta il posto da sola sul nuovo dispositivo ({[r[0] for r in rows]})')
        await A.goto(f'{BASE}/play.html?room={code}'); await A.wait_for_selector('#movedBack', timeout=8000)
        ok(True, 'il vecchio dispositivo vede "Ora giochi da un altro dispositivo"')
        await A.click('#movedBack')
        await until(lambda: players_named(code, 'Anna')[0][0] == a_uid)
        rows = players_named(code, 'Anna')
        ok(len(rows) == 1 and rows[0][0] == a_uid, 'e può riprendersi il posto (sempre uno solo)')

        # ---------------- Email e password, poi cambio di account con una serata in corso ----------------
        dctx, D = await browser(b, 'dario')
        await D.goto(f'{BASE}/index.html#altro'); await asyncio.sleep(1)
        await D.wait_for_selector('[data-act="acc-email"]', timeout=8000); await D.click('[data-act="acc-email"]')
        await D.click('[data-accmode="register"]'); await D.fill('#accEmail', DARIO); await D.fill('#accPw', '123'); await D.click('#accGo')
        await asyncio.sleep(0.4)
        ok('6' in await D.inner_text('#accErr'), 'password troppo corta: errore chiaro, nessun account')
        d_uid = await D.evaluate("import('./js/fb.js').then(m => m.connect())")
        await D.fill('#accPw', 'segreta1'); await D.click('#accGo')
        await until(lambda: at(f'accounts/{d_uid}'))
        ok((at(f'accounts/{d_uid}') or {}).get('pid'), 'account con email creato e collegato al profilo')
        fctx, F = await browser(b, 'fede')
        await join_as(F, code, 'Fede', 2)
        f_old = players_named(code, 'Fede')[0][0]
        await F.goto(f'{BASE}/index.html#altro'); await F.wait_for_selector('[data-act="acc-email"]', timeout=8000); await F.click('[data-act="acc-email"]')
        await F.fill('#accEmail', DARIO); await F.fill('#accPw', 'sbagliata'); await F.click('#accGo'); await asyncio.sleep(0.8)
        ok('corrette' in await F.inner_text('#accErr'), 'password sbagliata: errore chiaro')
        await F.fill('#accPw', 'segreta1'); await F.click('#accGo'); await asyncio.sleep(2.5)
        await asyncio.sleep(1.5)
        await F.goto(f'{BASE}/play.html?room={code}')
        await until(lambda: players_named(code, 'Fede')[0][0] == d_uid)
        rows = players_named(code, 'Fede')
        ok(len(rows) == 1 and rows[0][0] == d_uid and not at(f'rooms/{code}/players/{f_old}'), f'cambio di account in serata: il posto passa al nuovo uid con il gettone ({[r[0] for r in rows]})')

        # ---------------- Voti dopo la votazione ----------------
        _, G = await join(b, code, 'Gino', 4)
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Azul'); await host.click('#openVote'); await host.wait_for_selector('.voting')
        await vote(A, 8)
        await vote(G, 6)
        # Fede (F) non vota: la TV chiude la votazione
        await asyncio.sleep(0.5)
        await host.click('#revealBtn') if await host.query_selector('#revealBtn') else None
        await host.wait_for_selector('.reveal', timeout=12000); await asyncio.sleep(1)
        gid_game = at(f'rooms/{code}/state/gameId')
        avg1 = await host.inner_text('.avg-badge b')
        await host.click('#lateVotes'); await host.wait_for_selector('#lvBody')
        txt = await host.inner_text('#lvBody')
        ok('Fede' in txt and '8' not in txt.split('Fede')[0][-3:], 'voti mancanti: si vede chi non ha votato, mai i voti')
        await host.click(f'[data-lv-open="{d_uid}"]'); await asyncio.sleep(0.8)
        ok(at(f'rooms/{code}/late/{gid_game}/{d_uid}'), 'finestra aperta per Fede')
        await F.wait_for_selector('.late-banner', timeout=8000)
        await vote(F, 10, send=False); await F.click('#sendVote')
        await until(lambda: not at(f'rooms/{code}/late/{gid_game}/{d_uid}'))
        v = at(f'rooms/{code}/votes/{gid_game}/{d_uid}') or {}
        ok(v.get('overall') == 10 and v.get('late') is True, f'voto aggiunto e segnato come "aggiunto dopo" {v}')
        ok(not at(f'rooms/{code}/late/{gid_game}/{d_uid}'), 'la finestra si chiude da sola')
        avg2 = await host.inner_text('.avg-badge b')
        ok(avg1 != avg2 and '8' in avg2, f'media aggiornata ({avg1} → {avg2})')
        log = list((at(f'rooms/{code}/votelog') or {}).values())
        ok(any(x.get('kind') == 'open' for x in log) and any(x.get('kind') == 'late' and x.get('uid') == d_uid for x in log), f'registro: apertura e voto aggiunto ({[x.get("kind") for x in log]})')
        r = await F.evaluate(f"import('./js/fb.js').then(m => m.set(m.roomRef('{code}', 'votes/{gid_game}/{d_uid}'), {{ overall: 1, late: true }})).then(() => 'ok', (e) => String(e.code || e.message))")
        ok(r != 'ok', f'senza permesso un secondo voto viene rifiutato ({r})')
        night = at(f'groups/{gid}/nights/{code}') or {}
        g1 = [g for g in (night.get('games') or {}).values() if g.get('name') == 'Azul']
        ok(g1 and g1[0].get('n') == 3, 'il riassunto del gruppo conta anche il voto aggiunto')
        # modifica permessa
        g_uid = players_named(code, 'Gino')[0][0]
        await host.click('#lvClose') if await host.query_selector('#lvClose') else None
        await host.click('#lateVotes'); await host.wait_for_selector(f'[data-lv-edit="{g_uid}"]')
        await host.click(f'[data-lv-edit="{g_uid}"]'); await asyncio.sleep(0.8)
        await G.wait_for_selector('.late-banner', timeout=8000)
        await vote(G, 9, send=False); await G.click('#sendVote')
        await until(lambda: (at(f'rooms/{code}/votes/{gid_game}/{g_uid}') or {}).get('editedAt'))
        v = at(f'rooms/{code}/votes/{gid_game}/{g_uid}') or {}
        ok(v.get('overall') == 9 and v.get('editedAt'), f'voto cambiato con il permesso della regia {v}')
        ok(len((at(f'rooms/{code}/votes/{gid_game}') or {})) == 3, 'mai due voti della stessa persona')
        await host.screenshot(path=os.path.join(HERE, 'out', 'identity20_reveal.png'))
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
