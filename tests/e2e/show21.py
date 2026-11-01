"""2.1 nel browser: regia dello show, presenze, finali, limiti, checklist, storico, confronto, Discord e
tracker, accessibilità del voto (axe), configuratore della copia, modalità dimostrativa senza Firebase.
python3 tests/e2e/run.py show21"""
import asyncio, json, os
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
        await asyncio.sleep(0.25)
    return False

AXE = os.path.join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js')

async def tools(host):
    await host.click('#hdrTools'); await host.wait_for_selector('#tlShow')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        tctx, host, code = await tv(b, seats=4)
        # ---------------- Checklist della lobby (idea 30)
        await host.wait_for_selector('.prep-ready')
        txt = await host.inner_text('.prep-ready')
        ok('Pronti?' in txt and 'Scaletta' in txt, f'checklist "Pronti?" in lobby ({txt[:60]!r})')
        # Anna con un contesto che lascia iniettare axe (bypass della Content-Security-Policy solo per la prova)
        actx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, bypass_csp=True)
        await actx.add_init_script("try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); } catch (e) {}")
        A = await actx.new_page(); watch(A, 'Anna')
        await A.goto(f'{BASE}/play.html?room={code}'); await A.wait_for_selector('#nameInput')
        await A.fill('#nameInput', 'Anna'); await A.click('.av-opt[data-pick="0"]'); await A.click('#joinBtn'); await A.wait_for_selector('#waitList')
        _, B = await join(b, code, 'Bruno', 1)

        # ---------------- Regia dello show (idee 1, 16, 19, 21, 22, 26)
        await tools(host); await host.click('#tlShow'); await host.wait_for_selector('#shBody')
        for tab in ['scenes', 'audio', 'profile', 'chaos', 'criteria', 'theme', 'packs']:
            await host.click(f'[data-sh-tab="{tab}"]'); await asyncio.sleep(0.15)
        ok(len(await host.query_selector_all('[data-sh-tab]')) == 7, 'regia dello show: 7 sezioni, tutte si aprono')
        await host.click('[data-sh-tab="audio"]')
        await host.evaluate("(()=>{const e=document.querySelector('[data-sh-vol=\"voice\"]'); e.value=40; e.dispatchEvent(new Event('input',{bubbles:true}));})()")
        ok(await host.evaluate("localStorage.getItem('gnr_vol_voice')") == '0.4', 'volume della voce separato (idea 16)')
        await host.click('[data-sh-tab="profile"]'); await host.click('[data-sh-profile="minimal"]'); await asyncio.sleep(0.4)
        ok(await host.evaluate("document.documentElement.dataset.fx") == 'off', 'profilo Minimal: effetti spenti dalla scena (idee 1 e 26)')
        await host.click('[data-sh-tab="profile"]'); await host.check('#shFar'); await asyncio.sleep(0.2)
        ok(await host.evaluate("document.documentElement.classList.contains('tv-far')"), 'vista da lontano (idea 19)')
        await host.uncheck('#shFar')
        await host.click('[data-sh-tab="chaos"]'); await host.uncheck('[data-sh-chaos="swap"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/meta/chaosOff/swap') is True, 'imprevisti ammessi salvati nella stanza (idea 4)')
        await host.click('[data-sh-tab="theme"]')
        await host.evaluate("(()=>{const s=document.querySelector('#shThPodium'); s.value='neon'; s.dispatchEvent(new Event('change',{bubbles:true}));})()")
        await asyncio.sleep(0.2); await host.click('#shThSave'); await asyncio.sleep(0.8)
        ok(await host.evaluate("document.documentElement.dataset.podium") == 'neon', 'tema della TV: podio neon applicato (idea 21)')
        await host.click('[data-sh-tab="packs"]'); await host.click('#shPackSample'); await asyncio.sleep(0.2)
        await host.click('[data-sh-pack]'); await asyncio.sleep(0.4)
        ok(await host.evaluate("window.gnrDebug.atmo()") in ('pack',) or await host.evaluate("Boolean(localStorage.getItem('gnr_atmo_pack'))"), 'pacchetto di atmosfera importato e in uso (idea 22)')
        await host.click('[data-sh-tab="scenes"]'); await host.click('#shPreview'); await host.wait_for_selector('.reveal-preview')
        ok(at(f'rooms/{code}/votes') in (None, {}), 'anteprima del reveal: niente nel database (idea 20)')
        await host.click('#rpClose'); await host.click('#shClose')

        # ---------------- Presenze (idea 6)
        b_uid = [u for u, x in (at(f'rooms/{code}/players') or {}).items() if x.get('name') == 'Bruno'][0]
        await tools(host); await host.click('#tlPresence'); await host.wait_for_selector('#prBody')
        await host.click(f'[data-ps-watch="{b_uid}"]'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/players/{b_uid}/watch') is True, 'Bruno spettatore per la serata')
        await host.click('#prClose')

        # ---------------- Limiti (idea 31)
        await tools(host); await host.click('#tlVoting'); await host.wait_for_selector('#vpMaxGames')
        await host.fill('#vpMaxGames', '1'); await host.click('#vpSave'); await asyncio.sleep(0.6)
        ok(at(f'rooms/{code}/meta/maxGames') == 1, 'limite di giochi salvato')

        # ---------------- Voto, accessibilità (idea 18), finale (idea 2), spettatore non atteso
        await host.click('#startBtn'); await host.wait_for_selector('#gameName')
        await host.fill('#gameName', 'Azul'); await host.click('#openVote'); await host.wait_for_selector('.voting')
        await A.wait_for_selector('#sendVote')
        await set_range(A, '#overall', 9)
        vt = await A.get_attribute('#overall', 'aria-valuetext')
        ok(vt and '9' in vt and '10' in vt, f'voto letto come "9 su 10" dal lettore di schermo ({vt!r})')
        await A.add_script_tag(path=AXE)
        res = await A.evaluate("axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], rules: { 'color-contrast': { enabled: false } } }).then(r => r.violations.map(v => [v.id, v.impact, v.nodes.length]))")
        bad = [v for v in res if v[1] in ('critical', 'serious')]
        ok(not bad, f'axe sulla schermata del voto: nessun problema grave {bad or res}')
        await vote(A, 9)
        await asyncio.sleep(0.6)
        txt = await host.inner_text('.voting')
        ok('Bruno' not in txt or await host.query_selector('#revealBtn'), 'lo spettatore non si aspetta')
        if await host.query_selector('#revealBtn'): await host.click('#revealBtn')
        await host.wait_for_selector('.reveal', timeout=12000); await asyncio.sleep(0.5)
        cls = await host.get_attribute('.reveal', 'class')
        ok('finale--' in cls, f'finale per verdetto sul reveal (idea 2): {cls}')
        await asyncio.sleep(1.5)
        logs = json.dumps(at(f'rooms/{code}') or {})
        await host.click('#toBoard'); await host.wait_for_selector('.board')

        # ---------------- Controllo dello storico (idea 34) e confronto del Consigliere (idea 35)
        await tools(host); await host.click('#tlCheck'); await host.wait_for_selector('#icHistory')
        ok(await host.query_selector('#icHistory details') is not None, 'controllo dello storico del gruppo nel pannello dei dati')
        await host.click('#icClose')

        # ---------------- Discord e tracker (idee 54, 55)
        await host.wait_for_selector('#endNight'); await host.click('#endNight'); await host.click('#endDialog [data-edgo]')
        await host.wait_for_selector('.awards')
        while await host.query_selector('#stepBtn'):
            await host.click('#stepBtn'); await asyncio.sleep(0.3)
        await asyncio.sleep(1)
        opened = False
        try:
            await host.click('#shareImg'); await host.wait_for_selector('#exDiscord', timeout=5000); opened = True
        except Exception:
            pass
        if opened:
            async with host.expect_download() as dl:
                await host.click('#exPlays')
            d = await dl.value
            path = await d.path(); csv = open(path, encoding='utf-8-sig').read()
            ok(d.suggested_filename.startswith('GameNight_') and '_Partite' in d.suggested_filename and csv.startswith('date,game,bgg_id,player'), f'CSV per i tracker ({d.suggested_filename})')
            ok(await host.query_selector('#dcHook') is not None, 'webhook di Discord nel pannello delle esportazioni (solo su questa TV)')
        else:
            ok(False, 'pannello delle esportazioni a fine serata')

        # ---------------- Configuratore (idea 78)
        sctx = await b.new_context(viewport={'width': 390, 'height': 844}); S = await sctx.new_page(); watch(S, 'setup')
        await S.goto(BASE + '/setup.html'); await S.wait_for_selector('#cfgIn')
        await S.fill('#cfgIn', 'const firebaseConfig = { apiKey: "AIzaSyAOiQf_vodq2QCH45jvYVrhYzicHK2DJ60", authDomain: "x.firebaseapp.com", databaseURL: "https://x-default-rtdb.europe-west1.firebasedatabase.app", projectId: "x", appId: "1:2:web:3" };')
        await S.click('#cfgCheck'); await S.wait_for_selector('#cfgResult:not([hidden]) .setup-pre', timeout=15000)
        pre = await S.inner_text('.setup-pre')
        ok('export const firebaseConfig' in pre and 'x-default-rtdb' in pre, 'configuratore: config.js pronto dai valori incollati')
        await S.fill('#cfgIn', 'apiKey: "no"'); await S.click('#cfgCheck')
        ok('apiKey' in await S.inner_text('#cfgErr'), 'configuratore: valori sbagliati segnalati')

        # ---------------- Modalità dimostrativa senza Firebase (idea 80)
        dctx = await b.new_context(viewport={'width': 1280, 'height': 720})
        await dctx.add_init_script("try { localStorage.setItem('gnr_demo', '1'); localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_intro_done', '1'); } catch (e) {}")
        D = await dctx.new_page(); watch(D, 'demo-tv')
        before = json.dumps(db())
        await D.goto(BASE + '/host.html'); await D.wait_for_selector('#createBtn')
        ok(await D.query_selector('#demoRibbon') is not None, 'demo: nastro "Demo" visibile')
        if await D.is_visible('#groupName'): await D.fill('#groupName', 'Demo')
        await D.click('#createBtn'); await D.wait_for_selector('.lobby', timeout=15000)
        dcode = D.url.split('room=')[1]
        P2 = await dctx.new_page(); watch(P2, 'demo-phone')
        await P2.goto(f'{BASE}/play.html?room={dcode}'); await P2.wait_for_selector('#nameInput')
        await P2.fill('#nameInput', 'Zoe'); await P2.click('.av-opt[data-pick="2"]'); await P2.click('#joinBtn'); await P2.wait_for_selector('#waitList')
        await asyncio.sleep(1)
        ok('Zoe' in await D.inner_text('#slots'), 'demo: TV e telefono in due schede si vedono (senza server)')
        ok(dcode not in json.dumps(db().get('rooms', {})), 'demo: niente scritto nel database vero')

        await b.close()
    print('FALLITI:', fails if fails else '')
    print(errs or 'no errors')

asyncio.run(main())
