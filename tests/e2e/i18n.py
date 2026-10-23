# Lingue (1.4): prima apertura con la lingua del dispositivo, scelta nelle impostazioni senza ricaricare,
# scelta ricordata per dispositivo, testi tradotti anche negli errori e nel pannello degli aggiornamenti,
# nessuna chiave mancante.
import asyncio, json
from playwright.async_api import async_playwright
import common
from common import watch, errs

fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

missing = []
APP = 'http://localhost:8766'
SITE = 'https://example.github.io/GameNight_Show/'
REL = {'name': 'GameNight Show 1.3.0', 'tag_name': 'v1.3.0', 'body': '', 'assets': [{'name': 'GameNight-Show.apk', 'size': 5600000, 'browser_download_url': 'https://github.com/example/GameNight_Show/releases/download/v1.3.0/GameNight-Show.apk'}]}
CORS = {'access-control-allow-origin': '*'}

async def page(b, locale, lang=None, base=common.BASE):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, locale=locale, is_mobile=True)
    init = "try { localStorage.setItem('gnr_intro_done','1'); localStorage.setItem('gnr_tour_off','1'); %s } catch (e) {}" % (f"localStorage.setItem('gnr_lang','{lang}');" if lang else '')
    await ctx.add_init_script(init)
    await common.route_links(ctx, SITE)
    await ctx.route(SITE + 'version.json*', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'version': '1.3.0', 'notes': ['Novità'], 'notesEn': ['News']}), headers=CORS))
    await ctx.route('https://api.github.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(REL), headers=CORS))
    pg = await ctx.new_page(); watch(pg, f'{locale}/{lang}')
    pg.on('console', lambda m: missing.append(m.text) if '[i18n]' in m.text else None)
    await pg.goto(base + '/index.html'); await pg.wait_for_selector('#joinForm')
    await asyncio.sleep(0.4)
    return ctx, pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # Prima apertura: lingua del dispositivo
        ctx, pg = await page(b, 'en-US')
        ok(await pg.get_attribute('html', 'lang') == 'en', 'telefono in inglese → <html lang="en">')
        ok(await pg.inner_text('#joinTitle') == 'Join a room', f'titolo in inglese: {await pg.inner_text("#joinTitle")}')
        ok('Welcome' in await pg.inner_text('#heroTitle'), 'saluto in inglese')
        ok(await pg.title() == 'GameNight Show', 'titolo della pagina')
        await pg.fill('#homeCode', 'AB'); await pg.click('#joinGo')
        ok('4 characters' in await pg.inner_text('#homeErr'), 'errore del codice in inglese')
        await ctx.close()
        ctx, pg = await page(b, 'fr-FR')
        ok(await pg.get_attribute('html', 'lang') == 'it' and await pg.inner_text('#joinTitle') == 'Entra in una stanza', 'lingua non disponibile (francese) → italiano')
        await ctx.close()
        # Scelta nelle impostazioni: cambia subito, senza ricaricare, e resta dopo il ricaricamento
        ctx, pg = await page(b, 'it-IT')
        ok(await pg.inner_text('#joinTitle') == 'Entra in una stanza', 'telefono in italiano')
        await pg.evaluate('window.__noReload = 1')
        await pg.click('#hubSettings'); await pg.wait_for_selector('#hubLang')
        await pg.click('#hubLang [data-lang-set="en"]'); await asyncio.sleep(0.6)
        ok(await pg.evaluate('window.__noReload') == 1, 'cambio di lingua senza ricaricare la pagina')
        ok(await pg.inner_text('#joinTitle') == 'Join a room' and await pg.get_attribute('html', 'lang') == 'en', 'dopo la scelta: testi in inglese')
        ok(await pg.is_visible('#hubLang') and await pg.get_attribute('#hubLang [data-lang-set="en"]', 'aria-pressed') == 'true', 'le impostazioni restano aperte, English selezionato')
        ok('Theme' in await pg.inner_text('.hub-overlay') and 'Accessibility' in await pg.inner_text('.hub-overlay'), 'impostazioni tradotte')
        ok(await pg.evaluate("localStorage.getItem('gnr_lang')") == 'en', 'scelta salvata sul dispositivo')
        await pg.keyboard.press('Escape')
        tabs = await pg.inner_text('.tabbar')
        ok('Shelves' in tabs and 'Nights' in tabs and 'Groups' in tabs, f'barra in basso tradotta ({tabs.split()})')
        await pg.reload(); await pg.wait_for_selector('#joinForm'); await asyncio.sleep(0.3)
        ok(await pg.inner_text('#joinTitle') == 'Join a room', 'la lingua scelta resta dopo il ricaricamento')
        await pg.click('#hubSettings'); await pg.click('#hubLang [data-lang-set="it"]'); await asyncio.sleep(0.5)
        ok(await pg.inner_text('#joinTitle') == 'Entra in una stanza', 'si torna all’italiano')
        await ctx.close()
        # Pannello degli aggiornamenti (sito con l'APK ufficiale): testi e novità nella lingua scelta
        ctx, pg = await page(b, 'en-GB', base=APP)
        await pg.wait_for_selector('#hubApp .ver-grid'); await asyncio.sleep(0.4)
        t = await pg.inner_text('#hubApp')
        ok('Check for updates' in t and 'Download APK' in t and 'Stable Android app' in t, 'pannello App Android in inglese')
        ok('5.3 MB' in t, f'dimensione con il punto decimale in inglese')
        await ctx.close()
        ctx, pg = await page(b, 'it-IT', base=APP)
        await pg.wait_for_selector('#hubApp .ver-grid'); await asyncio.sleep(0.4)
        t = await pg.inner_text('#hubApp')
        ok('Cerca aggiornamento' in t and '5,3 MB' in t, 'pannello App Android in italiano (virgola decimale)')
        await ctx.close()
        await b.close()
    ok(not missing, f'nessun testo mancante {missing[:5]}')
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
