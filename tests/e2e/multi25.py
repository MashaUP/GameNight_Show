# 2.5 · Stesso account su più dispositivi insieme, con le regole vere (porta 8767).
# PC (TV in regia + home), telefono (giocatore), tablet (consultazione), quarto dispositivo (nuovo accesso):
# - l'accesso su un dispositivo non scollega gli altri; profilo, gruppi e resoconto si caricano ovunque;
# - PC master + telefono giocatore insieme; "Gioca anche tu" dal PC con lo stesso account: un solo giocatore;
# - presenza per dispositivo: chiudere il PC non fa risultare scollegato il telefono;
# - "Scollega questo dispositivo" e "Esci dall'account" su un dispositivo non tolgono il profilo agli altri;
# - chiave del profilo rinnovata su un dispositivo: un nuovo accesso all'account funziona ancora;
# - nessuna lettura appesa all'infinito: dopo il tetto di tempo arriva un errore chiaro.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, random
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

RUN = str(random.randint(10000, 99999))
MAIL = f'multi{RUN}@example.com'
SHARED = "try { localStorage.setItem('fake_shared', '1'); localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}"

async def browser(b, name, mobile=True, w=1280, h=720):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
    await ctx.add_init_script(SHARED)
    pg = await ctx.new_page(); watch(pg, name)
    return ctx, pg

async def until(cond, timeout=10):
    end = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < end:
        try:
            if cond(): return True
        except Exception: pass
        await asyncio.sleep(0.25)
    return False

async def google(pg, torna=''):
    await pg.goto(f'{BASE}/index.html'); await asyncio.sleep(0.6)
    await pg.evaluate(f"localStorage.setItem('fake_google', '{MAIL}')")
    await pg.goto(f'{BASE}/index.html?accedi=1{torna}'); await pg.wait_for_selector('[data-act="acc-google"]', timeout=15000)
    await pg.click('[data-act="acc-google"]')
    # l'accesso è finito quando il dispositivo ha il profilo dell'account
    for _ in range(60):
        await asyncio.sleep(0.25)
        try:
            if await pg.evaluate("Boolean(JSON.parse(localStorage.getItem('gnr_person') || 'null')?.pid)"): break
        except Exception: pass
    await asyncio.sleep(0.5)

async def uid_of(pg):
    return await pg.evaluate("import('./js/fb.js').then(m => m.connect())")

async def me_name(pg):
    await pg.goto(f'{BASE}/index.html')
    for _ in range(100):
        await asyncio.sleep(0.25)
        try:
            if await pg.evaluate("[...document.querySelectorAll('#hubMe, #hubMeFull')].some((e) => e.innerText.includes('Anna') && !e.innerText.includes('Carico'))"): return True
        except Exception: pass
    print('ME:', await pg.evaluate("[...document.querySelectorAll('#hubMe, #hubMeFull')].map((e) => e.innerText.slice(0, 120))"), await pg.evaluate("localStorage.getItem('gnr_errlog')"))
    return False

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------------- PC: la TV crea la stanza (sessione regia) ----------------
        pctx, TV = await browser(b, 'pc-tv', mobile=False, w=1920, h=1080)
        await TV.goto(f'{BASE}/host.html'); await TV.wait_for_selector('#createBtn')
        if await TV.is_visible('#groupName'): await TV.fill('#groupName', 'Multi')
        await TV.click('#createBtn'); await TV.wait_for_selector('.lobby')
        code = TV.url.split('room=')[1]

        # ---------------- Telefono: entra come giocatore e collega l'account ----------------
        fctx, PH = await browser(b, 'telefono')
        await PH.goto(f'{BASE}/play.html?room={code}'); await PH.wait_for_selector('#nameInput')
        await PH.fill('#nameInput', 'Anna'); await PH.click('.av-opt[data-pick="0"]'); await PH.click('#joinBtn'); await PH.wait_for_selector('#waitList')
        old_uid = await uid_of(PH)
        await google(PH)
        await until(lambda: at(f'accounts/{old_uid}'), 20)
        acc = at(f'accounts/{old_uid}') or {}
        uid = old_uid; pid = acc.get('pid')
        ok(bool(pid), f'telefono: account collegato al profilo ({pid})')

        # ---------------- PC: stesso account nella home (la TV resta in regia) ----------------
        PC = await pctx.new_page(); watch(PC, 'pc-home')
        await google(PC)
        for _ in range(60):
            try:
                if await uid_of(PC) == uid: break
            except Exception: pass
            await asyncio.sleep(0.25)
        ok(await uid_of(PC) == uid, 'PC: stesso account, stesso uid del telefono')
        ok(await me_name(PC), 'PC: profilo caricato con il telefono ancora collegato')
        ok(await TV.is_visible('.lobby'), 'PC: la TV della serata non è stata toccata dall\'accesso')
        await PH.goto(f'{BASE}/play.html?room={code}'); await PH.wait_for_selector('#waitList', timeout=15000)
        ok(True, 'telefono: dopo l\'accesso sul PC resta in serata come giocatore')

        # ---------------- "Gioca anche tu" dal PC con lo stesso account ----------------
        PP = await pctx.new_page(); watch(PP, 'pc-play')
        await PP.goto(f'{BASE}/play.html?room={code}')
        try: await PP.wait_for_selector('#waitList, #movedBack', timeout=15000)
        except Exception:
            await PP.screenshot(path='/tmp/pp.png'); print('PP:', (await PP.inner_text('body'))[:600]); raise
        anna = [u for u, pl in (at(f'rooms/{code}/players') or {}).items() if pl.get('name') == 'Anna']
        ok(len(anna) == 1, f'stesso account da PC e telefono: un solo giocatore ({len(anna)})')
        await until(lambda: len(at(f'rooms/{code}/presence/{uid}') or {}) >= 2, 15)
        devs = at(f'rooms/{code}/presence/{uid}') or {}
        ok(isinstance(devs, dict) and len(devs) >= 2, f'presenza per dispositivo ({len(devs) if isinstance(devs, dict) else devs})')
        await PP.close()
        # il server toglie la presenza di un dispositivo sparito dopo 2,5 s: si aspetta che resti solo il telefono
        await until(lambda: isinstance(at(f'rooms/{code}/presence/{uid}'), dict) and len(at(f'rooms/{code}/presence/{uid}')) == 1, 15)
        ok(bool(at(f'rooms/{code}/presence/{uid}')), 'PC chiuso: il telefono risulta ancora collegato')
        await asyncio.sleep(0.8)
        dot = await TV.evaluate("() => { const c = [...document.querySelectorAll('#slots .pcard')].find((x) => x.innerText.includes('Anna')); return c ? c.className : ''; }")
        ok('offline' not in dot, f'la TV vede Anna collegata ({dot})')

        # ---------------- Tablet: consulta profilo, gruppi e resoconto ----------------
        tctx, TB = await browser(b, 'tablet', mobile=False, w=768, h=1024)
        await google(TB)
        for _ in range(60):
            try:
                if await uid_of(TB) == uid: break
            except Exception: pass
            await asyncio.sleep(0.25)
        ok(await uid_of(TB) == uid and await me_name(TB), 'tablet: terzo dispositivo con lo stesso account, profilo caricato')
        await TB.goto(f'{BASE}/index.html#gruppi')
        g = False
        for _ in range(60):
            await asyncio.sleep(0.25)
            if await TB.evaluate("(document.querySelector('#hubGroups')?.innerText || '').includes('Multi') && !(document.querySelector('#hubGroups')?.innerText || '').includes('Controllo se')"): g = True; break
        ok(g, 'tablet: il gruppo della serata compare in Gruppi')
        await TB.goto(f'{BASE}/resoconto.html?room={code}');
        try:
            await TB.wait_for_selector('.rs-hero', timeout=15000); r = True
        except Exception: r = False
        ok(r and not await TB.is_visible('.loading-die'), 'tablet: resoconto della serata in corso caricato')

        # ---------------- Scollegare un dispositivo non scollega gli altri ----------------
        await TB.goto(f'{BASE}/index.html'); await asyncio.sleep(1)
        await TB.evaluate("import('./js/person.js').then(async (m) => { await m.Person.ready(); await m.Person.signOut(); })")
        await asyncio.sleep(0.6)
        ok(bool(at(f'people/{pid}/uids/{uid}')), '"Scollega questo dispositivo" sul tablet: l\'account resta autorizzato')
        ok(await me_name(PC), 'PC: profilo ancora caricato dopo lo scollegamento del tablet')

        # ---------------- Esci dall'account sul telefono: PC e TV continuano ----------------
        await PH.goto(f'{BASE}/index.html#altro'); await PH.wait_for_selector('[data-act="acc-out"]', timeout=15000)
        await PH.click('[data-act="acc-out"]'); await asyncio.sleep(1.5)
        ok(await uid_of(PH) != uid, 'telefono: uscito dall\'account (sessione nuova)')
        ok(await me_name(PC), 'PC: profilo ancora caricato dopo l\'uscita dal telefono')
        await TV.reload(); await TV.wait_for_selector('.lobby', timeout=15000)
        ok(True, 'TV ricaricata: la serata riparte')

        # ---------------- Chiave rinnovata su un dispositivo, nuovo accesso altrove ----------------
        await PC.evaluate("import('./js/person.js').then(async (m) => { await m.Person.ready(); await m.Person.load(); await m.Person.renewKey(); })")
        await asyncio.sleep(0.6)
        ok((at(f'accounts/{uid}') or {}).get('key') == at(f'personKeys/{pid}'), 'chiave rinnovata: l\'account la ricorda')
        nctx, NW = await browser(b, 'nuovo')
        await google(NW)
        for _ in range(60):
            try:
                if await uid_of(NW) == uid: break
            except Exception: pass
            await asyncio.sleep(0.25)
        ok(await NW.evaluate("JSON.parse(localStorage.getItem('gnr_person') || '{}').pid") == pid, 'quarto dispositivo: entra nell\'account e ritrova il profilo')

        # ---------------- Nessuna attesa infinita ----------------
        await NW.goto(f'{BASE}/index.html'); await asyncio.sleep(1.5)
        code_err = await NW.evaluate("import('./js/fb.js').then((m) => m.withTimeout(new Promise(() => {}), 300, 'prova').then(() => 'finito', (e) => e.code))")
        ok(code_err == 'db/timeout', f'lettura appesa: errore dopo il tetto di tempo ({code_err})')
        msg = await NW.evaluate("import('./js/fb.js').then((m) => m.explainError({ code: 'db/timeout' }))")
        ok('non risponde' in msg, 'messaggio chiaro per il database che non risponde')

        await b.close()
    print('ERRORI:', errs if errs else 'nessuno')
    print('FALLITI:', fails if fails else 'nessuno')

asyncio.run(main())
