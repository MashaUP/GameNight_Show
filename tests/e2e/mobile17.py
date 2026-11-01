# 1.11 · Impostazioni e resoconto dal telefono (richieste 81 e 82).
# Impostazioni della home a 360 e 390 px: Lingua e Tema visibili (prima il flex li schiacciava a 2 px),
# nessuna scelta tagliata ("Automatico"), caselle comode da toccare, valori salvati e ritrovati dopo la ricarica.
# Profilo del telefono in serata: dopo il cambio di lingua si resta nel profilo.
# Resoconto a 360/390/1280 px con nomi lunghi, 8 giocatori, pubblico, votazione aperta, gioco annullato:
# niente fuori schermo, nomi non troncati a una riga, comandi alti almeno 40 px, dati uguali al database.
import asyncio, json, time, urllib.request
import common
from common import *
from playwright.async_api import async_playwright

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def dbset(path, value):
    body = json.dumps({'op': 'set', 'path': path, 'value': value, 'uid': 'tv'}).encode()
    urllib.request.urlopen(urllib.request.Request(BASE + '/__db', data=body, method='POST')).read()

SHEET = """() => { const W = innerWidth; const seg = (id) => { const s = document.getElementById(id); return s ? Math.round(s.getBoundingClientRect().height) : -1; };
  const out = [...document.querySelectorAll('.sheet *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).map(e => e.textContent.trim().slice(0, 20));
  const clipped = [...document.querySelectorAll('.sheet .seg button')].filter(b => { const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect(); return r.right > p.right + 1 || r.bottom > p.bottom + 1; }).map(b => b.textContent.trim());
  const small = [...document.querySelectorAll('.sheet .seg button, .sheet label.quick-toggle')].filter(e => e.getBoundingClientRect().height < 40).map(e => e.textContent.trim().slice(0, 16));
  return { lang: seg('hubLang'), theme: seg('hubTheme'), out, clipped, small }; }"""

async def main():
    now = int(time.time() * 1000)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------------- 81 · Impostazioni della home ----------------
        for (w, h) in [(360, 640), (390, 844)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, locale='it-IT')
            await ctx.add_init_script("try{localStorage.setItem('gnr_intro_done','1');localStorage.setItem('gnr_tour_off','1')}catch(e){}")
            pg = await ctx.new_page(); watch(pg, f'home{w}')
            await pg.goto(BASE + '/index.html'); await pg.wait_for_selector('#joinForm')
            await pg.click('#hubSettings'); await pg.wait_for_selector('.sheet #hubTheme')
            r = await pg.evaluate(SHEET)
            ok(r['lang'] >= 40 and r['theme'] >= 40, f'{w}px: selettori Lingua e Tema visibili (altezze {r["lang"]}, {r["theme"]})')
            ok(not r['out'] and not r['clipped'], f'{w}px: nessuna scelta fuori schermo o tagliata {r["out"]} {r["clipped"]}')
            ok(not r['small'], f'{w}px: scelte e caselle alte almeno 40 px {r["small"]}')
            await pg.tap('[data-theme-set="day"]'); await pg.tap('[data-a11y-size="l"]')
            await pg.tap('label.quick-toggle:has([data-a11y="contrast"])'); await asyncio.sleep(0.3)
            ok(await pg.evaluate("document.documentElement.dataset.theme === 'day' && document.documentElement.classList.contains('a11y-l') && document.documentElement.classList.contains('a11y-contrast')"), f'{w}px: tema e accessibilità applicati subito')
            await pg.reload(); await pg.wait_for_selector('#joinForm'); await pg.click('#hubSettings'); await pg.wait_for_selector('.sheet #hubTheme')
            st = await pg.evaluate("({p: [...document.querySelectorAll('.sheet [aria-pressed=true]')].map(b=>b.dataset.themeSet||b.dataset.a11ySize||b.dataset.langSet), c: document.querySelector('[data-a11y=contrast]').checked, theme: document.documentElement.dataset.theme})")
            ok('day' in st['p'] and 'l' in st['p'] and st['c'] and st['theme'] == 'day', f'{w}px: impostazioni ritrovate dopo la ricarica {st}')
            await pg.tap('[data-lang-set="en"]'); await asyncio.sleep(0.6)
            ok(await pg.evaluate("document.documentElement.lang === 'en' && !!document.querySelector('.sheet #hubLang')"), f'{w}px: lingua cambiata senza chiudere le impostazioni')
            await ctx.close()

        # ---------------- 81 · Profilo del telefono in serata ----------------
        tctx, host, code = await tv(b)
        ctx = await b.new_context(viewport={'width': 360, 'height': 640}, is_mobile=True, has_touch=True, locale='it-IT')
        await ctx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); } catch (e) {}")
        ph = await ctx.new_page(); watch(ph, 'phone')
        await ph.goto(f'{BASE}/play.html?room={code}'); await ph.wait_for_selector('#nameInput')
        await ph.fill('#nameInput', 'Anna'); await ph.click('.av-opt[data-pick="0"]'); await ph.click('#joinBtn'); await ph.wait_for_selector('#waitList')
        await ph.click('[data-myprofile]'); await ph.wait_for_selector('#phTheme')
        small = await ph.evaluate("[...document.querySelectorAll('#phLang button, #phTheme button, #phA11y button, #phA11y label')].filter(e => e.getBoundingClientRect().height < 40).length")
        ok(small == 0, f'telefono: impostazioni del profilo comode da toccare ({small} troppo piccole)')
        await ph.locator('#phLang').scroll_into_view_if_needed(); await ph.tap('#phLang [data-lang-set="en"]')
        await wait_js(ph, "document.documentElement.lang === 'en' && !!document.querySelector('#phLang')", 10000)
        ok(await ph.evaluate("document.documentElement.lang === 'en' && !!document.querySelector('#phLang')"), 'telefono: dopo il cambio di lingua si resta nel profilo')
        await ctx.close(); await tctx.close()

        # ---------------- 82 · Resoconto dal telefono ----------------
        names = ['Anna', 'Bartolomeo Massimiliano', 'Carla', 'Daniele', 'Elisabetta Margherita Rossi', 'Fra', 'Giulia', 'Hugo']
        players = {f'u{i}': {'name': n, 'style': 'adventurer', 'seed': n, 'color': '#FF5A4E'} for i, n in enumerate(names)}
        long_name = 'Le Città Perdute: Edizione Deluxe con espansione completa'
        games = {'g1': {'name': long_name, 'order': 1, 'status': 'revealed', 'playedMin': 40, 'winners': {'u1': True}, 'players': {f'u{i}': True for i in range(6)}, 'scores': {'u0': 120, 'u1': 141}},
                 'g2': {'name': 'Azul', 'order': 2, 'status': 'revealed', 'playedMin': 25},
                 'g3': {'name': 'Dixit', 'order': 3, 'status': 'voting'}}
        votes = {'g1': {f'u{i}': {'overall': 6 + i % 4, 'comment': 'Un commento piuttosto lungo per vedere come va a capo sul telefono' if i == 2 else None} for i in range(8)},
                 'g2': {f'u{i}': {'overall': 8} for i in range(5)}, 'g3': {'u0': {'overall': 7}}}
        dbset('rooms/RS9Z', {'meta': {'createdAt': now - 3600_000, 'groupName': 'Gli Incredibili Giocatori del Giovedì Sera', 'host': 'tv'},
                             'players': players, 'games': games, 'votes': votes, 'state': {'phase': 'awards'},
                             'trash': {'t1': {'game': {'name': 'Gioco annullato'}, 'votes': {'u0': {'overall': 3}}}}})
        for (w, h, m) in [(360, 740, True), (390, 844, True), (1280, 800, False)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=m, has_touch=m, locale='it-IT')
            pg = await ctx.new_page(); watch(pg, f'rs{w}')
            await pg.goto(BASE + '/resoconto.html?room=RS9Z'); await pg.wait_for_selector('.rs-board'); await asyncio.sleep(0.4)
            r = await pg.evaluate("""() => { const W = innerWidth;
              const out = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).length;
              const small = [...document.querySelectorAll('main button, main summary, main .ph-home')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.textContent.trim().slice(0, 12));
              const top = [...document.querySelectorAll('.rs-top > *')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
              const overlap = top.some((a, i) => top.some((b, j) => i < j && a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top && b.bottom > a.top));
              const board = [...document.querySelectorAll('.rs-board li')].map(li => [li.querySelector('.rs-name b').textContent, li.querySelector('.rs-avg').textContent]);
              const nameB = [...document.querySelectorAll('.rs-board .rs-name b')].find(b => b.textContent.startsWith('Le Città'));
              return { sw: document.documentElement.scrollWidth, W, out, small, overlap, board, nameLines: nameB ? Math.round(nameB.getBoundingClientRect().height / parseFloat(getComputedStyle(nameB).lineHeight)) : 0, hasVoting: !!document.querySelector('.rs-warn'), trash: !!document.querySelector('.rs-trash') }; }""")
            ok(r['sw'] <= r['W'] and r['out'] == 0, f'resoconto {w}px: niente fuori schermo ({r["out"]})')
            ok(not r['overlap'], f'resoconto {w}px: intestazione senza sovrapposizioni')
            ok(not r['small'], f'resoconto {w}px: comandi alti almeno 40 px {r["small"]}')
            ok(r['board'] == [['Azul', '8,0'], [long_name, '7,2']], f'resoconto {w}px: classifica uguale ai dati (solo chi ha giocato, nome completo) {r["board"]}')
            if m: ok(r['nameLines'] >= 2, f'resoconto {w}px: nome lungo su più righe invece di troncato')
            ok(r['hasVoting'] and r['trash'], f'resoconto {w}px: votazione aperta e gioco annullato dichiarati')
            await ctx.close()
        # ---------------- 82 · Reveal, classifica e premiazione sul telefono in serata ----------------
        now = int(time.time() * 1000)
        long = ['Anna', 'Bartolomeo Massimiliano', 'Carla', 'Daniele', 'Elisabetta Margherita Rossi', 'Fra', 'Giulia', 'Hugo']
        pl = {f'u{i}': {'name': n, 'style': 'adventurer', 'seed': n, 'color': '#FF5A4E', 'joinedAt': now} for i, n in enumerate(long)}
        gm = {'g1': {'name': 'Le Città Perdute: Edizione Deluxe con espansione completa', 'order': 1, 'status': 'revealed', 'winners': {'u1': True, 'u4': True}},
              'g2': {'name': 'Azul', 'order': 2, 'status': 'revealed', 'winners': {'u0': True}},
              'g3': {'name': 'Supercalifragilistichespiralidoso Party Game', 'order': 3, 'status': 'revealed', 'winners': {'u4': True}}}
        vt = {g: {f'u{i}': {'overall': 5 + (i * 3 + j) % 6, 'mvp': 'u4' if i != 4 else 'u1'} for i in range(8)} for j, g in enumerate(['g1', 'g2', 'g3'])}
        expect = {}
        for g, vs in vt.items():
            expect[gm[g]['name']] = sum(v['overall'] for v in vs.values()) / len(vs)
        for (w, h) in [(360, 640), (390, 844)]:
            for phase in ['reveal', 'board', 'awards']:
                st = {'phase': phase, 'gameId': 'g1', **({'done': True} if phase == 'awards' else {})}
                dbset('rooms/MB82', {'meta': {'createdAt': now, 'hostUid': 'tv', 'maxPlayers': 12}, 'players': pl, 'games': gm, 'votes': vt, 'state': st})
                ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True, locale='it-IT')
                await ctx.add_init_script("sessionStorage.setItem('fake_uid','u4'); try { localStorage.setItem('gnr_tour_phone','1'); localStorage.setItem('gnr_intro_done','1'); localStorage.setItem('gnr_lite','off'); } catch(e) {}")
                ph = await ctx.new_page(); watch(ph, f'p82-{phase}-{w}')
                await ph.goto(BASE + '/play.html?room=MB82'); await wait_js(ph, "!!document.querySelector('main .ph-title')", 10000); await asyncio.sleep(0.8)
                r = await ph.evaluate("""() => { const W = innerWidth;
                  const out = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).length;
                  const clipped = [...document.querySelectorAll('.p-name, .p-champ b, .vgame-name, .ph-room, .brand')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 2).map(e => e.textContent.trim().slice(0, 30));
                  const top = document.querySelector('.ph-top'); const kids = top ? [...top.children].map(c => c.getBoundingClientRect()) : [];
                  let overlap = false; for (let i = 1; i < kids.length; i++) if (kids[i].width && kids[i - 1].width && kids[i].left < kids[i - 1].right - 1) overlap = true;
                  const rows = [...document.querySelectorAll('.p-row')].map(r => [r.querySelector('.p-name').textContent.trim(), r.querySelector('.p-avg').textContent.trim()]);
                  return { sw: document.documentElement.scrollWidth, W, out, clipped, overlap, rows }; }""")
                tag = f'{w}px {phase}'
                ok(r['sw'] <= r['W'] + 1 and r['out'] == 0, f'{tag}: niente fuori schermo')
                ok(not r['clipped'], f'{tag}: nomi di giochi e giocatori non tagliati su una riga {r["clipped"]}')
                ok(not r['overlap'], f'{tag}: intestazione senza sovrapposizioni')
                if r['rows']:
                    good = all(abs(float(a.replace(',', '.')) - round(expect[n], 1)) < 0.051 for n, a in r['rows'])
                    ok(good and len(r['rows']) == 3, f'{tag}: medie della classifica uguali ai voti salvati {r["rows"]}')
                if phase == 'reveal':
                    vis = await ph.evaluate("(() => { const n = document.querySelector('.p-reveal-nums .p-num'); const r = n && n.getBoundingClientRect(); return !!r && r.bottom <= innerHeight; })()")
                    ok(vis, f'{tag}: il proprio voto si vede senza scorrere')
                await ph.screenshot(path=f'mobile17_{phase}_{w}.png')
                await ctx.close()
        await b.close()
    print('ERRORI:', common.errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
