# Home 1.4: introduzione, profilo, armadio dalla home, collegamento di un secondo dispositivo,
# traguardi, impostazioni, sezioni (#armadi, #serate, #gruppi, #altro) e niente scorrimento laterale.
import asyncio, re
from playwright.async_api import async_playwright
from common import *
from mprobe import OVF

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

async def dev(b, name, intro=False, w=400, h=860, lang='it'):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 700, has_touch=w < 700, device_scale_factor=2 if w < 700 else 1, locale='it-IT')
    init = "try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_lang', '%s'); %s } catch (e) {}" % (lang, "" if intro else "localStorage.setItem('gnr_intro_done','1');")
    await ctx.add_init_script(init)
    pg = await ctx.new_page(); watch(pg, name)
    return ctx, pg

async def no_scroll(pg, tag):
    r = await pg.evaluate(OVF)
    ok(r['sw'] <= r['W'] + 1 and not r['out'], f'{tag}: niente fuori schermo {r["out"][:4] if r["out"] else ""}')
    await pg.screenshot(path=f'hub_{tag}.png')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ca, A = await dev(b, 'A', intro=True)
        await A.goto(BASE + '/index.html')
        await A.wait_for_selector('.intro-step'); await no_scroll(A, 'intro')
        await A.click('#inNext'); await A.click('#inNext'); await A.click('#inNext')
        await A.wait_for_selector('#edName'); await no_scroll(A, 'editor')
        await A.fill('#edName', 'Andrea'); await A.click('[data-pick="2"]'); await A.click('#edSave')
        await A.wait_for_selector('#hubMe .hub-name'); await asyncio.sleep(0.5)
        ok('Andrea' in await A.inner_text('#heroTitle'), 'saluto con il nome nel riquadro in alto')
        ok(await A.is_visible('.tabbar') and not await A.is_visible('.side'), 'telefono: barra in basso, niente barra laterale')
        await no_scroll(A, 'me')
        # Armadio dalla home: tocco su "I tuoi armadi" → sezione #armadi → nuovo
        await A.click('#tileArm'); await A.wait_for_selector('#armNew', state='visible')
        ok(A.url.endswith('#armadi') and await A.is_visible('[data-view="armadi"]') and not await A.is_visible('[data-view="home"]'), 'sezione Armadi aperta (#armadi)')
        ok(await A.get_attribute('.tabbar [data-nav="armadi"]', 'aria-current') == 'page', 'barra in basso: Armadi evidenziato')
        await A.click('#armNew'); await A.fill('#naName', 'Giochi di casa'); await A.click('#naGo')
        await A.wait_for_url(re.compile('armadio.html'), timeout=8000); await asyncio.sleep(1.2); await A.keyboard.press('Escape')
        aid = A.url.split('a=')[1][:6]
        # Profilo completo in "Profilo e app"
        await A.goto(BASE + '/index.html#altro'); await A.wait_for_selector('#hubMeFull .hub-name')
        await A.click('#hubMeFull [data-act="share"]'); await A.wait_for_selector('.hub-qr'); await no_scroll(A, 'share')
        code = (await A.inner_text('.hub-link-code .code-chip')).strip(); pid = code[:6]
        ok(db()['people'][pid]['info']['name'] == 'Andrea', 'profilo salvato nel database')
        await A.keyboard.press('Escape')
        ok(not await A.query_selector('.hub-overlay'), 'Esc chiude la finestra')
        # Dispositivo B: un suo profilo, poi collegato a quello di A (più recente vince il nome)
        cb, B = await dev(b, 'B')
        await B.goto(BASE + '/index.html'); await B.wait_for_selector('#hubMe [data-act="create"]')
        await B.click('#hubMe [data-act="create"]'); await B.fill('#edName', 'Andy'); await B.click('#edSave'); await B.wait_for_selector('#hubMe .hub-name')
        await B.goto(BASE + '/index.html#collega=' + code); await B.wait_for_selector('#alGo'); await no_scroll(B, 'askLink')
        await B.click('#alGo'); await asyncio.sleep(1.5)
        ok(sorted(db()['people'][pid]['uids'].keys()).__len__() == 2, 'due dispositivi collegati allo stesso profilo')
        await B.goto(BASE + '/index.html#armadi'); await B.wait_for_selector('#hubArmadi .rows')
        ok('Giochi di casa' in await B.inner_text('#hubArmadi'), 'l’armadio di A compare anche su B')
        await B.goto(BASE + f'/armadio.html?a={aid}'); await B.wait_for_selector('.am-meta'); await asyncio.sleep(1)
        ok(await B.query_selector('[data-act="add"]') is not None, 'B può aggiungere giochi all’armadio')
        # Traguardi e impostazioni
        await B.goto(BASE + '/index.html#altro'); await B.wait_for_selector('#hubMeFull .hub-name')
        await B.click('#hubMeFull [data-act="trophies"]'); await B.wait_for_selector('.tr-list, #trBody p'); await asyncio.sleep(0.6); await no_scroll(B, 'trophies')
        await B.keyboard.press('Escape'); await B.click('#hubSettings'); await B.wait_for_selector('#hubLang'); await no_scroll(B, 'settings')
        ok(await B.is_visible('#hubLang [data-lang-set="en"]') and await B.is_visible('#hubTheme'), 'impostazioni: lingua e tema')
        ok(await B.is_visible('#stUpd') and 'Cerca aggiornamento' in await B.inner_text('#stUpd'), 'impostazioni: “Cerca aggiornamento”')
        await B.keyboard.press('Escape')
        # Ko-fi e "Cerca aggiornamento" sempre in home
        await B.goto(BASE + '/index.html'); await B.wait_for_selector('#hubMe .hub-name')
        ok(await B.get_attribute('.home-donate a.kofi-btn', 'href') == 'https://ko-fi.com/mashaup', 'link Ko-fi nella home')
        ok(await B.is_visible('#hubCheckUpd'), '“Cerca aggiornamento” nella home')
        # Computer: barra laterale, niente barra in basso
        cd, D = await dev(b, 'D', w=1366, h=860)
        await D.goto(BASE + '/index.html'); await D.wait_for_selector('#hubMe')
        ok(await D.is_visible('.side') and not await D.is_visible('.tabbar'), 'computer: barra laterale')
        await D.click('.side [data-nav="serate"]'); await D.wait_for_selector('#histTitle', state='visible')
        ok(await D.get_attribute('.side [data-nav="serate"]', 'aria-current') == 'page', 'barra laterale: Serate evidenziato')
        await D.go_back(); await D.wait_for_selector('[data-view="home"]', state='visible')
        ok(True, 'Indietro del browser torna alla home')
        await no_scroll(D, 'desk')
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == "__main__": asyncio.run(main())
