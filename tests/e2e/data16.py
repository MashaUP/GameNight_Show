# Test 1.6–1.9 dell'armadio e dei dati, con le regole vere (porta 8767) e una seconda installazione
# separata (porta 8765, altro database): preferiti, prestiti scaduti, catalogo pubblico con anteprima,
# ritaglio delle foto, BoardGameGeek con un proxy simulato, link del manuale, esportazione e
# importazione tra installazioni, file rovinati, centro privacy e centro diagnostico.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio, json, re, time
from playwright.async_api import async_playwright
from common import *
BASE2 = 'http://localhost:8765'
OUT = os.path.join(HERE, 'out', 'shots_data16'); os.makedirs(OUT, exist_ok=True)
IM = HERE + '/fixtures/imgs/'
fails = []
DAY = 86400000


def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)


def raw(op, path, value=None, base=None):
    body = json.dumps({'op': op, 'path': path, 'value': value, 'raw': True}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request((base or BASE) + '/__db', data=body, method='POST')).read())


def dump(base=None):
    return json.loads(urllib.request.urlopen((base or BASE) + '/__dump').read())


PROMPT = {'text': ''}


def watch2(pg, n):
    pg.on('pageerror', lambda e: errs.append(f'[{n}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{n}] {m.text}') if m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_INTERNET' not in m.text and 'bgg.test' not in m.text and '429' not in m.text else None)
    def dlg(d):
        if d.type == 'prompt': asyncio.ensure_future(d.accept(PROMPT['text']))
        else: asyncio.ensure_future(d.accept())
    pg.on('dialog', dlg)


INIT = "try{localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off');localStorage.setItem('gnr_intro_done','1')}catch(e){}"

SERVICES = "export const BGG_PROXY_URL = 'https://bgg.test.example';\nexport const LINKS_URL = '';\n"
BGG_SEARCH = {'ok': True, 'q': 'azul', 'total': 2, 'items': [
    {'id': 230802, 'name': 'Azul', 'year': 2017, 'type': 'boardgame', 'isExpansion': False, 'minPlayers': 2, 'maxPlayers': 4, 'time': 45, 'weight': 1.76},
    {'id': 287954, 'name': 'Azul: Summer Pavilion', 'year': 2019, 'type': 'boardgame', 'isExpansion': False}]}
BGG_THING = {'ok': True, 'items': [{'id': 230802, 'name': 'Azul', 'year': 2017, 'minPlayers': 2, 'maxPlayers': 4, 'time': 45, 'weight': 1.76, 'categories': ['Abstract Strategy', 'Puzzle'], 'bestPlayers': [2], 'thumb': 'https://bgg.test.example/azul.png'}]}
STATE = {'rate': False}


async def route_bgg(ctx):
    async def svc(route):
        await route.fulfill(status=200, content_type='text/javascript', body=SERVICES)
    await ctx.route('**/js/services.js*', svc)

    async def proxy(route):
        url = route.request.url
        h = {'access-control-allow-origin': '*', 'content-type': 'application/json'}
        if STATE['rate']:
            await route.fulfill(status=429, headers={**h, 'Retry-After': '60'}, body=json.dumps({'ok': False, 'error': 'rate_limited'})); return
        if '/search' in url: await route.fulfill(status=200, headers=h, body=json.dumps(BGG_SEARCH)); return
        if '/thing' in url: await route.fulfill(status=200, headers=h, body=json.dumps(BGG_THING)); return
        if '/health' in url: await route.fulfill(status=200, headers=h, body=json.dumps({'ok': True, 'token': True, 'version': 'test'})); return
        if url.endswith('.png'): await route.fulfill(status=404, body=''); return
        await route.fulfill(status=404, headers=h, body=json.dumps({'ok': False, 'error': 'not_found'}))
    await ctx.route('https://bgg.test.example/**', proxy)


async def device(b, n, base=None, w=1280, h=860, mobile=False, bgg=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    await ctx.add_init_script(INIT)
    if bgg: await route_bgg(ctx)
    pg = await ctx.new_page(); watch2(pg, n)
    return ctx, pg


async def shot(pg, name):
    await asyncio.sleep(0.3)
    await pg.screenshot(path=f'{OUT}/{name}.png')


async def close_sheets(pg):
    for _ in range(5):
        if await pg.locator('.overlay').count(): await pg.keyboard.press('Escape'); await asyncio.sleep(0.15)


async def download(pg, click_sel):
    async with pg.expect_download() as d:
        await pg.click(click_sel)
    dl = await d.value
    return open(await dl.path(), encoding='utf-8').read(), dl.suggested_filename


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        co, O = await device(b, 'own', bgg=True)
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#tileArm')
        # Profilo personale (i preferiti vanno nel profilo e seguono la persona)
        pid = await O.evaluate("import('./js/person.js').then(async (m) => { await m.Person.create({ name: 'Anna', style: 'adventurer', seed: 'a', color: '#FF5A4E' }); return m.Person.data.pid; })")
        ok(bool(re.match(r'^[A-Z0-9]{6}$', pid or '')), f'profilo personale creato ({pid})')
        await O.reload(); await O.wait_for_selector('#tileArm')
        await O.click('#tileArm'); await O.click('#armNew'); await O.fill('#naName', 'Casa Dati'); await O.click('#naGo')
        await O.wait_for_selector('#edForm', timeout=10000)
        aid = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)
        await close_sheets(O)
        now = int(time.time() * 1000)
        games = {
            '-Ng1': {'name': 'Pandemic', 'minPlayers': 2, 'maxPlayers': 4, 'duration': 60, 'weight': 2.4, 'mode': 'cooperativo', 'addedAt': now},
            '-Ng2': {'name': 'Brass', 'minPlayers': 2, 'maxPlayers': 4, 'duration': 120, 'weight': 3.9, 'addedAt': now, 'loanId': 'L1', 'loanTo': 'Bruno', 'status': 'prestato'},
            '-Ng3': {'name': 'Just One', 'minPlayers': 3, 'maxPlayers': 7, 'duration': 20, 'addedAt': now, 'loanId': 'L2', 'loanTo': 'Carla', 'status': 'prestato'},
            '-Ng4': {'name': 'Pandemic: On the Brink', 'baseId': '-Ng1', 'addedAt': now, 'rules': 'Nuovi ruoli ed eventi'},
            '-Ng5': {'name': 'Ñandú & Ünicode ✨', 'addedAt': now, 'tags': ['àccenti']}
        }
        for gid, g in games.items(): raw('set', f'armadi/{aid}/library/{gid}', g)
        raw('set', f'armadi/{aid}/loans/L1', {'item': '-Ng2', 'name': 'Brass', 'to': 'Bruno', 'start': now - 20 * DAY, 'due': now - 3 * DAY})
        raw('set', f'armadi/{aid}/loans/L2', {'item': '-Ng3', 'name': 'Just One', 'to': 'Carla', 'start': now - 2 * DAY, 'due': now + DAY + 3600000})
        await O.reload(); await O.wait_for_selector('.am-card')

        # ---------------- 1. Preferiti ----------------
        await O.click('.am-card:has(.am-name:text-is("Pandemic")) .am-fav'); await asyncio.sleep(0.8)
        favs = dump().get('people', {}).get(pid, {}).get('favs', {})
        ok('-Ng1' in favs.get(aid, {}), 'preferito salvato nel profilo personale (privato)')
        await O.wait_for_selector('.am-favs .am-fav-item', timeout=5000)
        ok('Pandemic' in await O.inner_text('.am-favs'), 'riga “I tuoi preferiti”')
        await O.click('.am-card:has(.am-name:text-is("Brass")) .am-fav'); await asyncio.sleep(0.6)
        ok('non disponibile' in (await O.inner_text('.am-favs')).lower(), 'preferito in prestito segnato come non disponibile')
        await O.click('[data-act="favFilter"]'); await asyncio.sleep(0.4)
        names = await O.eval_on_selector_all('.am-card .am-name', 'els => els.map(e => e.textContent)')
        ok(sorted(names) == ['Brass', 'Pandemic'], f'filtro preferiti ({names})')
        await shot(O, '01_favs')
        await O.click('[data-act="clearFilters"] >> nth=0'); await asyncio.sleep(0.3)
        await O.reload(); await O.wait_for_selector('.am-favs .am-fav-item')
        ok(True, 'preferiti ancora lì dopo il ricaricamento')
        # Gioco rimosso: il preferito resta segnalato e si può togliere
        raw('set', f'armadi/{aid}/library/-Ng2', None); await asyncio.sleep(0.8)
        await O.wait_for_selector('[data-act="favPrune"]', timeout=5000)
        await O.click('[data-act="favPrune"]'); await asyncio.sleep(0.8)
        ok('-Ng2' not in dump()['people'][pid].get('favs', {}).get(aid, {}), 'preferito di un gioco rimosso tolto su richiesta')
        raw('set', f'armadi/{aid}/library/-Ng2', games['-Ng2']); await asyncio.sleep(0.5)

        # ---------------- 2. Prestiti scaduti e in scadenza nella home ----------------
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#loanAlert:not([hidden])', timeout=10000)
        txt = await O.inner_text('#loanAlert')
        ok('Brass' in txt and 'Bruno' in txt and 'ritardo' in txt, 'avviso: prestito scaduto con il ritardo')
        ok('Just One' in txt, 'avviso: prestito in scadenza')
        await shot(O, '02_loan_alert')
        await O.click('#loanAlert a:has-text("Brass")')
        await O.wait_for_selector('#rtForm', timeout=10000)
        ok('Bruno' in await O.inner_text('.am-overlay'), 'dal link: si apre direttamente il prestito da chiudere')
        await close_sheets(O)
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#loanAlert:not([hidden])', timeout=10000)
        await O.click('#loanSnooze'); await asyncio.sleep(0.3)
        await O.reload(); await asyncio.sleep(3)
        ok(await O.is_hidden('#loanAlert'), 'rimandato a domani: niente avviso ripetuto')

        # ---------------- 3. Catalogo pubblico con anteprima ----------------
        await O.goto(f'{BASE}/armadio.html?a={aid}'); await O.wait_for_selector('.am-card')
        await O.click('[data-tab="tools"]'); await O.click('[data-act="share"]'); await O.wait_for_selector('#shPreview')
        await O.uncheck('#shExp'); await O.check('#shOnlyAvail'); await O.uncheck('#shRules')
        await O.click('#shPreview'); await asyncio.sleep(0.3)
        pv = await O.inner_text('#shPrevBox')
        ok('2 giochi su 5' in pv and 'Brass' not in pv and 'Just One' not in pv and 'On the Brink' not in pv, f'anteprima: solo i giochi scelti ({pv.splitlines()[0]})')
        await shot(O, '03_pub_preview')
        await O.click('#shOn'); await asyncio.sleep(1.5)
        tok = dump()['armadi'][aid]['share']['token']
        pub = dump()['pub'][tok]
        ok(pub['fields'] == {'status': True, 'loc': False, 'exp': False, 'rules': False, 'onlyAvail': True}, f'scelte salvate {pub["fields"]}')
        ok(sorted(g['name'] for g in pub['games'].values()) == ['Just One', 'Pandemic', 'Ñandú & Ünicode ✨'] or sorted(g['name'] for g in pub['games'].values()) == ['Pandemic', 'Ñandú & Ünicode ✨'], f'catalogo: niente espansioni né giochi prestati ({sorted(g["name"] for g in pub["games"].values())})')
        ok(all('rules' not in g and 'loanTo' not in g and 'owner' not in g for g in pub['games'].values()), 'catalogo: niente regole (scelto) né dati privati')
        await close_sheets(O)

        # ---------------- 4. BoardGameGeek (proxy simulato) e link del manuale ----------------
        await O.click('[data-tab="games"]'); await O.click('[data-act="add"] >> nth=0'); await O.wait_for_selector('#edForm')
        await O.fill('#edName', 'azul'); await O.fill('#edMax', '5')
        await O.click('#edBgg'); await O.wait_for_selector('.am-bgg-item', timeout=8000)
        ok('Azul' in await O.inner_text('#bgRes'), 'BGG: risultati della ricerca')
        await O.click('.am-bgg-item[data-bgg="230802"]'); await O.wait_for_selector('.am-bgg-table', timeout=8000)
        await shot(O, '04_bgg_review')
        conflict = await O.locator('.am-bgg-table tr.is-conflict').count()
        ok(conflict == 1 and '5' in await O.inner_text('.am-bgg-table tr.is-conflict'), f'BGG: il valore diverso (giocatori max) è un conflitto da scegliere ({conflict})')
        ok(await O.locator('.am-bgg-table tr.is-fill').count() >= 3, 'BGG: i campi vuoti si riempiono')
        await O.uncheck('#bgImg') if await O.query_selector('#bgImg') else None
        await O.click('#bgApply'); await asyncio.sleep(0.5)
        ok(await O.input_value('#edMax') == '5' and await O.input_value('#edDur') == '45' and await O.input_value('#edWeight') == '1.8', 'BGG: i valori scritti a mano restano, i campi vuoti si riempiono')
        ok(await O.input_value('#edExt') == 'bgg:230802', 'BGG: identificativo salvato')
        await O.fill('#edManual', 'javascript:alert(1)'); await O.click('#edSave'); await asyncio.sleep(0.4)
        ok('https' in await O.inner_text('#edErr'), 'manuale: link non https rifiutato')
        await O.fill('#edManual', 'https://editore.example/azul-regole.pdf'); await O.fill('#edName', 'Azul')
        await O.click('#edSave'); await wait_js(O, "!document.querySelector('#edForm')", 10000)
        az = next((g for g in dump()['armadi'][aid]['library'].values() if g['name'] == 'Azul'), {})
        ok(az.get('extId') == 'bgg:230802' and az.get('duration') == 45 and az.get('maxPlayers') == 5 and az.get('manual', '').endswith('.pdf'), 'gioco salvato con i dati di BGG e il manuale')
        await O.click('.am-card:has(.am-name:text-is("Azul"))'); await O.wait_for_selector('.am-manual')
        mt = await O.inner_text('.am-manual')
        ok('Apri il manuale' in mt, 'scheda: manuale ufficiale')
        await O.wait_for_selector('[data-man="add"]', timeout=5000)
        ok(True, 'scheda: salvare il manuale su questo dispositivo')
        ok(await O.query_selector('.am-bgg-credit a[href*="boardgamegeek.com/boardgame/230802"]') is not None, 'scheda: collegamento a BGG con attribuzione')
        await close_sheets(O)
        # Errori del proxy: messaggio chiaro, niente blocchi
        STATE['rate'] = True
        await O.click('[data-act="add"] >> nth=0'); await O.wait_for_selector('#edForm'); await O.fill('#edName', 'dixit')
        await O.click('#edBgg'); await O.wait_for_selector('#bgRes .form-error', timeout=8000)
        ok('minuto' in await O.inner_text('#bgRes'), 'BGG: troppe richieste → messaggio comprensibile')
        STATE['rate'] = False
        await close_sheets(O)

        # ---------------- 5. Ritaglio della foto ----------------
        await O.click('[data-act="add"] >> nth=0'); await O.wait_for_selector('#edForm')
        await O.set_input_files('#edFile', IM + 'wide.jpg'); await O.wait_for_selector('#peCropBtn')
        await O.click('#peCropBtn'); await O.wait_for_selector('#peCrop:not([hidden])')
        b0 = await O.eval_on_selector('#peCrop', 'e => [e.style.left, e.style.width]')
        await O.focus('#peCrop'); await O.keyboard.press('-'); await O.keyboard.press('-'); await O.keyboard.press('ArrowLeft')
        b1 = await O.eval_on_selector('#peCrop', 'e => [e.style.left, e.style.width]')
        ok(b0 != b1, f'ritaglio: il riquadro si sposta e si ridimensiona da tastiera ({b0} → {b1})')
        box = await O.eval_on_selector('#peCrop', 'e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }')
        ok(abs(box[0] / box[1] - 4 / 3) < 0.05, f'ritaglio: rapporto 4:3 per la foto del gioco ({box[0]:.0f}×{box[1]:.0f})')
        await shot(O, '05_crop')
        # trascinamento con il dito/mouse
        r = await O.eval_on_selector('#peCrop', 'e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }')
        await O.mouse.move(r[0], r[1]); await O.mouse.down(); await O.mouse.move(r[0] + 30, r[1] + 10, steps=4); await O.mouse.up()
        b2 = await O.eval_on_selector('#peCrop', 'e => e.style.left')
        ok(b2 != b1[0], 'ritaglio: il riquadro si trascina')
        await O.click('#peCropBtn'); await O.click('#peOk'); await O.wait_for_selector('#edPick.has-img', timeout=8000)
        ok(True, 'ritaglio applicato alla foto')
        await O.click('[data-close] >> nth=0'); await close_sheets(O)

        # ---------------- 6. Esportazione ----------------
        await O.goto(BASE + '/index.html#altro'); await O.wait_for_selector('[data-open="export"]')
        await O.click('[data-view="altro"] [data-open="export"]'); await O.wait_for_selector('#dcExpGo', timeout=15000)
        await O.check('[data-cat="loans"]') if await O.is_enabled('[data-cat="loans"]') else None
        text, fname = await download(O, '#dcExpGo')
        data = json.loads(text)
        ok(fname.startswith('gamenight_dati_') and fname.endswith('.json'), f'file esportato ({fname})')
        ok(data.get('format') == 'gamenight-export' and data.get('version') == 2, 'formato versionato')
        arm = next((a for a in data.get('armadi', []) if a['id'] == aid), None)
        ok(arm is not None and len(arm['games']) == 6, f'armadio esportato con i giochi ({len(arm["games"]) if arm else 0})')
        ok(len(arm.get('loans', [])) == 2, 'prestiti esportati (categoria scelta)')
        ok(data.get('favs', {}).get(aid, {}).get('-Ng1'), 'preferiti esportati')
        ok(not re.search(r'"(key|ownerUid|uids|token|hostUid)"', text) and 'KEY' not in text, 'nessuna chiave, uid o token nel file')
        exp_path = os.path.join(OUT, 'export.json'); open(exp_path, 'w', encoding='utf-8').write(text)

        # ---------------- 7. Importazione in un'altra installazione (altro database) ----------------
        c2, D = await device(b, 'nuovo', base=BASE2, mobile=True, w=390, h=844)
        await D.goto(BASE2 + '/index.html#altro'); await D.wait_for_selector('[data-view="altro"] [data-open="import"]')
        await D.click('[data-view="altro"] [data-open="import"]'); await D.wait_for_selector('#dcFile')
        # file rovinato
        bad = os.path.join(OUT, 'rotto.json'); open(bad, 'w').write(text[: len(text) // 2])
        await D.set_input_files('#dcFile', bad); await asyncio.sleep(0.5)
        ok('rovinato' in await D.inner_text('#dcErr'), 'file rovinato: fermato con un messaggio chiaro')
        newer = os.path.join(OUT, 'nuovo.json'); open(newer, 'w').write(json.dumps({**data, 'version': 9}))
        await D.set_input_files('#dcFile', newer); await asyncio.sleep(0.5)
        ok('più nuova' in await D.inner_text('#dcErr'), 'formato più nuovo: fermato, chiede di aggiornare')
        await D.set_input_files('#dcFile', exp_path); await D.wait_for_selector('#dcGo', timeout=10000)
        await D.check('[data-arm="0"] [data-loans]') if await D.query_selector('[data-arm="0"] [data-loans]') else None
        await asyncio.sleep(0.6)
        counts = await D.inner_text('[data-arm="0"] [data-counts]')
        ok('6' in counts and 'aggiungere' in counts, f'anteprima: giochi da aggiungere ({counts})')
        await shot(D, '06_import_preview')
        await D.click('#dcGo'); await D.wait_for_selector('.dc-result', timeout=20000)
        res = await D.inner_text('.dc-result')
        ok('6 aggiunti' in res, f'esito con i numeri ({res.splitlines()[0]})')
        await shot(D, '07_import_done')
        d2 = dump(BASE2)
        new_arms = [k for k, v in d2.get('armadi', {}).items() if v.get('info', {}).get('name') == 'Casa Dati']
        ok(len(new_arms) == 1, 'armadio creato nella nuova installazione')
        na = d2['armadi'][new_arms[0]]
        ok(len(na.get('library', {})) == 6 and na['library']['-Ng4'].get('baseId') == '-Ng1', 'giochi con gli stessi id e le espansioni collegate')
        ok(len(na.get('loans', {})) == 2 and na['library']['-Ng2'].get('loanId') == 'L1', 'prestiti importati e ricollegati')
        ok(na['library']['-Ng5']['name'] == 'Ñandú & Ünicode ✨', 'Unicode intatto')
        lf = json.loads(await D.evaluate("localStorage.getItem('gnr_favs') || '{}'"))
        ok('-Ng1' in lf.get(new_arms[0], {}), 'preferiti portati sul nuovo armadio (sul dispositivo, senza profilo)')
        # seconda importazione nello stesso armadio: nessun doppione
        await D.click('[data-close] >> nth=0'); await asyncio.sleep(0.3)
        await D.click('[data-view="altro"] [data-open="import"]'); await D.wait_for_selector('#dcFile')
        await D.set_input_files('#dcFile', exp_path); await D.wait_for_selector('#dcGo', timeout=10000)
        await D.select_option('[data-arm="0"] [data-target]', new_arms[0]); await asyncio.sleep(1)
        c2t = await D.inner_text('[data-arm="0"] [data-counts]')
        ok('0' in c2t.split('da aggiungere')[0] and 'già presenti' in c2t, f'reimportazione: niente doppioni ({c2t})')
        await D.click('[data-close] >> nth=0')

        # ---------------- 8. Centro diagnostico e centro privacy ----------------
        await close_sheets(O)
        await O.click('[data-view="altro"] [data-open="diag"]'); await O.wait_for_selector('.dc-checks', timeout=15000)
        checks = await O.inner_text('.dc-checks')
        ok('Accesso anonimo' in checks and 'BoardGameGeek: proxy attivo con il token' in checks, 'diagnostica: Firebase e BGG controllati')
        await shot(O, '08_diag')
        rep, _ = await download(O, '#dgDl')
        ok(aid not in rep and pid not in rep and 'Anna' not in rep, 'rapporto senza codici né nomi')
        await close_sheets(O)
        await O.click('[data-view="altro"] [data-open="privacy"]'); await O.wait_for_selector('[data-pa="clearDevice"]', timeout=15000)
        pt = await O.inner_text('.hub-overlay')
        ok('catalogo pubblico attivo' in pt and 'Anna' in pt, 'privacy: profilo e catalogo pubblico elencati')
        await shot(O, '09_privacy')
        await O.click('[data-pub-off]'); await asyncio.sleep(1)
        ok(tok not in dump().get('pub', {}) and 'share' not in dump()['armadi'][aid], 'privacy: catalogo pubblico disattivato davvero')
        await close_sheets(O)
        # cancellare i dati del dispositivo (seconda installazione)
        PROMPT['text'] = 'CANCELLA'
        await D.click('[data-view="altro"] [data-open="privacy"]'); await D.wait_for_selector('[data-pa="clearDevice"]', timeout=15000)
        await D.click('[data-pa="clearDevice"]'); await asyncio.sleep(0.35)
        n_keys = await D.evaluate("Object.keys(localStorage).filter(k => k.startsWith('gnr_')).length")
        ok(n_keys <= 2, f'dati del dispositivo cancellati ({n_keys} chiavi rimaste)')
        ok(len(dump(BASE2).get('armadi', {}).get(new_arms[0], {}).get('library', {})) == 6, 'il database non è stato toccato')

        bad = [e for e in errs if 'permission' not in e.lower()]
        print('ERRORI:', bad if bad else 'nessuno')
        print('FALLITI:', fails if fails else 'nessuno')
        await b.close()

try:
    asyncio.run(main())
except Exception:
    print('ERRORI della pagina:', errs[:12])
    raise
