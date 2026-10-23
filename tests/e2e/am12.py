# Test 1.2 "Armadio organizzato" sul server con le regole vere di Firebase (porta 8767)
import asyncio, os, json, sys, re, time, datetime, urllib.request
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
from common import *
from mprobe import OVF
from playwright.async_api import async_playwright
IM = HERE + '/fixtures/imgs/'
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

def raw(op, path, value=None, uid='x'):
    body = json.dumps({'op': op, 'path': path, 'value': value, 'uid': uid}).encode()
    return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + '/__db', data=body, method='POST')).read())

def fix(o):
    # Firebase restituisce gli array come oggetti {"0":…}: si normalizza come fa l'SDK
    if isinstance(o, dict):
        if o and all(k.isdigit() for k in o) and sorted(int(k) for k in o) == list(range(len(o))):
            return [fix(o[str(i)]) for i in range(len(o))]
        return {k: fix(v) for k, v in o.items()}
    return o
def arm(aid):
    return fix(db().get('armadi', {}).get(aid, {}))

def lib_by_name(aid):
    return {g['name']: (k, g) for k, g in (arm(aid).get('library') or {}).items()}

PROMPT = {'text': ''}
def watch2(pg, n):
    pg.on('pageerror', lambda e: errs.append(f'[{n}] {e}'))
    pg.on('console', lambda m: errs.append(f'[{n}] {m.text}') if m.type == 'error' and 'Failed to fetch' not in m.text and 'ERR_INTERNET' not in m.text else None)
    def dlg(d):
        if d.type == 'prompt': asyncio.ensure_future(d.accept(PROMPT['text']))
        else: asyncio.ensure_future(d.accept())
    pg.on('dialog', dlg)

INIT = "try{localStorage.setItem('gnr_tour_off','1');localStorage.setItem('gnr_tour_phone','1');localStorage.setItem('gnr_lite','off');localStorage.setItem('gnr_intro_done','1')}catch(e){}"
async def device(b, n, w=1280, h=820, mobile=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); watch2(pg, n)
    return ctx, pg

async def count_text(pg):
    return (await pg.inner_text('#amCount')).strip().split(' · ')[0]

async def card(pg, name):
    return pg.locator(f'.am-card:has(.am-name:text-is("{name}"))')

async def close_sheets(pg):
    for _ in range(4):
        if await pg.locator('.am-overlay').count(): await pg.keyboard.press('Escape'); await asyncio.sleep(0.15)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        co, O = await device(b, 'own')
        # ---------------- creazione dalla home e primo gioco con foto ----------------
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#tileArm')
        await O.click('#tileArm'); await O.click('#armNew'); await O.fill('#naName', 'Casa Test'); await O.click('#naGo')
        await O.wait_for_selector('#edForm', timeout=10000)
        aid = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)
        ok('armadio.html' in O.url, f'la home apre la nuova pagina dell’armadio ({O.url.split("/")[-1]})')
        await O.set_input_files('#edFile', IM + 'wide.jpg'); await photo_ok(O); await O.wait_for_selector('#edPick.has-img')
        await O.fill('#edName', 'Dixit'); await O.fill('#edMin', '3'); await O.fill('#edMax', '8'); await O.fill('#edDur', '30')
        await O.fill('#edLoc_room', 'Soggiorno'); await O.fill('#edLoc_unit', 'Libreria'); await O.fill('#edLoc_shelf', 'Ripiano 2')
        await O.fill('#edAcq', '2026-09-01')
        await O.click('#edSave'); await wait_js(O, "!document.querySelector('#edForm')", 10000)
        L = lib_by_name(aid); did, dx = L['Dixit']
        ok('image' not in dx and dx.get('thumb', '').startswith('data:image/jpeg'), 'nell’elenco solo la miniatura, niente foto grande')
        ok(len(dx['thumb']) <= 30000, f'miniatura leggera: {len(dx["thumb"])} caratteri')
        big = arm(aid).get('images', {}).get(did, '')
        ok(len(big) > len(dx['thumb']) * 2, f'foto grande a parte: {len(big)} caratteri')
        ok(dx.get('loc') == {'room': 'Soggiorno', 'unit': 'Libreria', 'shelf': 'Ripiano 2'} and dx.get('acq') == '2026-09-01' and dx.get('isNew') is True, 'posizione, data di acquisizione e “da provare” salvati')
        ok(any(e.get('op') == 'add' and e.get('item') == did for e in arm(aid).get('log', {}).values()), 'cronologia: aggiunta')
        # foto grande solo nella scheda
        await (await card(O, 'Dixit')).click(); await O.wait_for_selector('#amBig')
        await wait_js(O, "(()=>{const i=document.querySelector('#amBig .gi-fg');return i&&i.src.length>" + str(len(dx['thumb']) + 100) + "})()")
        ok(True, 'la scheda carica la foto grande')
        ok('Soggiorno › Libreria › Ripiano 2' in await O.inner_text('.am-where'), 'la scheda dice dove si trova')
        await close_sheets(O)
        # stesso nome: un'altra copia
        await O.click('#amHero [data-act="add"]'); await O.fill('#edName', 'dixit'); await O.click('#edSave')
        await O.wait_for_selector('[data-c="copy"]'); await O.click('[data-c="copy"]')
        await wait_js(O, "!document.querySelector('#edForm')")
        await asyncio.sleep(0.6)
        ok(lib_by_name(aid)['Dixit'][1].get('copies') == 2 and len(lib_by_name(aid)) == 1, 'stesso gioco: una copia in più invece di un doppione')

        # ---------------- importazione CSV con anteprima e annulla ----------------
        csv = ("nome;giocatori_min;giocatori_max;durata_min;tipologia;stanza;mobile;ripiano;gioco_base;etichette\r\n"
               "Azul;2;4;40;competitivo;;;;;astratto\r\nCodenames;4;8;15;squadre;Soggiorno;Libreria;Ripiano 2;;party, parole\r\n"
               "Dixit: Odyssey;3;12;30;;Soggiorno;Libreria;Ripiano 2;Dixit;\r\nCatan;3;4;90;competitivo;Studio;Armadio;Alto;;\r\n"
               "Catan;3;4;90;;;;;;\r\n;2;2;10;;;;;;\r\nPandemic;2;4;45;cooperativo;Studio;Armadio;Alto;;coop\r\nDixit;;;;;;;;;\r\n")
        open(HERE + '/out/am_import.csv', 'w', encoding='utf-8').write(csv)
        await O.click('[data-tab="tools"]'); await O.wait_for_selector('#amImport', state='attached')
        await O.set_input_files('#amImport', HERE + '/out/am_import.csv'); await O.wait_for_selector('#imGo')
        sm = await O.inner_text('.am-im-sum')
        ok('8' in sm and '5' in sm and 'ripetuti' in sm and 'non validi' in sm, 'anteprima: righe, nuovi, ripetuti, non validi: ' + sm.replace('\n', ' | '))
        ok(len(lib_by_name(aid)) == 1, 'l’anteprima non scrive niente')
        ok((await O.inner_text('#imGo')).strip() == 'Importa 5', 'pulsante “Importa 5”')
        await O.click('#imGo'); await O.wait_for_selector('#imUndo')
        L = lib_by_name(aid)
        ok(len(L) == 6, f'importati: {sorted(L)}')
        ok(L['Dixit: Odyssey'][1].get('baseId') == did, 'l’espansione è collegata al gioco base')
        ok(L['Codenames'][1].get('tags') == ['party', 'parole'] and L['Catan'][1].get('loc', {}).get('room') == 'Studio', 'etichette e posizione importate: ' + json.dumps([L['Codenames'][1].get('tags'), L['Catan'][1].get('loc')]))
        await O.click('#imUndo'); await wait_js(O, "!document.querySelector('#imUndo')")
        await asyncio.sleep(0.6)
        ok(len(lib_by_name(aid)) == 1 and len(arm(aid).get('trash', {})) == 5, 'annulla: i giochi importati tornano fuori (nel cestino)')
        await O.set_input_files('#amImport', HERE + '/out/am_import.csv'); await O.wait_for_selector('#imGo'); await O.click('#imGo'); await O.wait_for_selector('#imUndo')
        await close_sheets(O); await asyncio.sleep(0.5)
        L = lib_by_name(aid); ok(len(L) == 6, 'reimportati')

        # ---------------- rinomina ----------------
        await O.click('[data-act="editInfo"]'); await O.fill('#aiName', 'Ludoteca di casa'); await O.fill('#aiDesc', 'Giochi del soggiorno e dello studio')
        await O.click('[data-emo="🎲"]'); await O.click('#aiSave')
        await wait_js(O, "document.querySelector('#amName').textContent==='Ludoteca di casa'")
        inf = arm(aid)['info']
        ok(inf['name'] == 'Ludoteca di casa' and inf.get('emoji') == '🎲' and inf.get('desc') and inf.get('updatedAt'), 'rinomina, descrizione e icona salvate')
        ok(any(e.get('op') == 'rename' for e in arm(aid).get('log', {}).values()), 'cronologia: rinomina')
        await O.reload(); await O.wait_for_selector('#amName')
        ok(await O.inner_text('#amName') == 'Ludoteca di casa' and 'soggiorno' in await O.inner_text('.am-desc'), 'il nome resta dopo il ricaricamento')
        # rinomina vietata a chi non è proprietario
        r = raw('update', f'armadi/{aid}/info', {'name': 'Hackerato'}, uid='uEstraneo')
        ok(r.get('error') == 'permission_denied', 'un estraneo non può rinominare')

        # ---------------- filtri, ordinamento, viste ----------------
        await O.wait_for_selector('.am-card')
        await O.fill('#amSearch', 'cat'); await asyncio.sleep(0.2)
        ok(await count_text(O) == '1 di 6', 'ricerca per nome: ' + await count_text(O))
        await O.fill('#amSearch', 'studio'); await asyncio.sleep(0.2)
        ok(await count_text(O) == '2 di 6', 'ricerca per posizione: ' + await count_text(O))
        await O.fill('#amSearch', '')
        await O.fill('#amSide [data-f="players"]', '2'); await asyncio.sleep(0.2)
        ok(await count_text(O) == '2 di 6', 'filtro “siamo in 2”: ' + await count_text(O))
        await O.select_option('#amSide [data-f="mode"]', 'cooperativo'); await asyncio.sleep(0.2)
        names = await O.eval_on_selector_all('.am-card .am-name', 'e=>e.map(x=>x.textContent)')
        ok(names == ['Pandemic'], f'filtri combinati (2 giocatori + cooperativo): {names}')
        ok(await O.locator('.am-chip').count() == 2, 'chip dei filtri attivi')
        await O.click('.am-chip[data-unf="mode"]'); await asyncio.sleep(0.2)
        ok(await count_text(O) == '2 di 6', 'togli un filtro dal chip: ' + await count_text(O))
        await O.click('#amChips [data-act="clearFilters"]'); await asyncio.sleep(0.2)
        await O.check('#amSide [data-f="noLoc"]'); await asyncio.sleep(0.2)
        names = await O.eval_on_selector_all('.am-card .am-name', 'e=>e.map(x=>x.textContent)')
        ok(names == ['Azul'], f'senza posizione: {names}')
        await O.uncheck('#amSide [data-f="noLoc"]')
        await O.select_option('#amSide [data-f="exp"]', 'exp'); await asyncio.sleep(0.2)
        names = await O.eval_on_selector_all('.am-card .am-name', 'e=>e.map(x=>x.textContent)')
        ok(names == ['Dixit: Odyssey'], f'solo espansioni: {names}')
        await O.select_option('#amSide [data-f="exp"]', '')
        await O.select_option('#amSort', 'duration'); await asyncio.sleep(0.2)
        names = await O.eval_on_selector_all('.am-card .am-name', 'e=>e.map(x=>x.textContent)')
        ok(names[0] == 'Codenames' and names[-1] == 'Catan', f'ordina per durata: {names}')
        await O.select_option('#amSort', 'loc'); await asyncio.sleep(0.2)
        names = await O.eval_on_selector_all('.am-card .am-name', 'e=>e.map(x=>x.textContent)')
        ok(names[-1] == 'Azul', f'per posizione, i senza posizione in fondo: {names}')
        await O.select_option('#amSort', 'name')
        await O.click('[data-view="list"]'); await O.wait_for_selector('.am-table')
        ok(await O.locator('.am-tr:not(.am-th)').count() == 6, 'vista lista')
        await O.click('[data-view="shelves"]'); await O.wait_for_selector('.am-shelf')
        heads = await O.eval_on_selector_all('.am-shelf-head h3', 'e=>e.map(x=>x.textContent)')
        ok(len(heads) == 3 and 'Senza posizione' in heads[-1], f'vista scaffali: {heads}')
        await O.screenshot(path='am_shelves.png', full_page=True)
        await O.click('[data-view="grid"]')
        # vista salvata
        await O.fill('#amSide [data-f="players"]', '2'); await asyncio.sleep(0.2)
        await O.click('[data-act="views"]'); await O.fill('#vName', 'In due'); await O.click('#vSave')
        await O.click('#amChips [data-act="clearFilters"]'); await O.reload(); await O.wait_for_selector('.am-card')
        await O.click('[data-act="views"]'); await O.click('[data-vgo="0"]'); await asyncio.sleep(0.3)
        ok(await count_text(O) == '2 di 6', 'vista salvata riapplicata dopo il ricaricamento')
        await O.click('#amChips [data-act="clearFilters"]')

        # ---------------- trova il gioco ----------------
        await O.click('#amHero [data-act="find"]'); await O.fill('#fdQ', 'odyss'); await asyncio.sleep(0.3)
        t = await O.inner_text('#fdList')
        ok('Soggiorno › Libreria › Ripiano 2' in t and 'Disponibile' in t, 'Trova: posizione e disponibilità')
        await O.fill('#fdQ', 'dixit'); await asyncio.sleep(0.3)
        t = await O.inner_text('#fdList')
        ok('🧩' in t and 'Dixit: Odyssey' in t, 'Trova: mostra anche le espansioni del gioco')
        await close_sheets(O)

        # ---------------- prestiti ----------------
        yest = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        await (await card(O, 'Azul')).click(); await O.click('[data-lend]'); await O.wait_for_selector('#lnTo')
        await O.fill('#lnTo', 'Marco'); await O.fill('#lnDue', yest); await O.fill('#lnNote', 'scatola un po’ rovinata'); await O.click('#lnGo')
        await wait_js(O, "!document.querySelector('#lnForm')"); await asyncio.sleep(0.6)
        A = arm(aid); azid, az = lib_by_name(aid)['Azul']
        lo = [l for l in A.get('loans', {}).values() if l['item'] == azid]
        ok(len(lo) == 1 and lo[0]['to'] == 'Marco' and lo[0].get('due') and az.get('loanId') and az.get('status') == 'prestato', 'prestito registrato')
        await wait_js(O, "!!document.querySelector('.am-card .am-tag--late')")
        ok('in ritardo' in await O.inner_text('#amHero'), 'prestito scaduto evidenziato')
        await O.click('[data-tab="loans"]'); await O.wait_for_selector('.am-loan.is-late')
        ok(True, 'scheda Prestiti: in ritardo in rosso')
        await O.click('.am-loan [data-return]'); await O.click('[data-st="incompleto"]'); await O.fill('#rtNote', 'manca una tessera'); await O.click('#rtGo')
        await wait_js(O, "!document.querySelector('#rtForm')"); await asyncio.sleep(0.6)
        A = arm(aid); az = A['library'][azid]; l = [l for l in A['loans'].values() if l['item'] == azid][0]
        ok(l.get('ret') and l.get('state') == 'incompleto' and not az.get('loanId') and az.get('status') == 'posseduto', 'restituzione con stato e note')
        # due copie: si possono prestare entrambe
        await O.click('[data-tab="games"]'); await O.wait_for_selector('.am-card')
        for who in ['Ada', 'Bea']:
            await (await card(O, 'Dixit')).click(); await O.click('[data-lend]'); await O.fill('#lnTo', who); await O.click('#lnGo')
            await wait_js(O, "!document.querySelector('#lnForm')"); await asyncio.sleep(0.5)
        A = arm(aid)
        ok(len([l for l in A['loans'].values() if l['item'] == did and not l.get('ret')]) == 2 and A['library'][did]['status'] == 'prestato', '2 copie prestate a 2 persone')
        await (await card(O, 'Dixit')).click(); await O.wait_for_selector('.am-sheet-actions')
        ok(await O.locator('.am-sheet-actions [data-lend]').count() == 0 and await O.locator('.am-sec [data-return]').count() == 2, 'tutte le copie fuori: niente “Presta”, due “Restituito”')
        await O.click('.am-sec [data-return] >> nth=0'); await O.click('#rtGo'); await asyncio.sleep(0.6)
        A = arm(aid)
        ok(A['library'][did]['status'] == 'posseduto' and A['library'][did].get('loanId'), 'una copia tornata: di nuovo disponibile, l’altra ancora fuori')
        await close_sheets(O)

        # ---------------- modifica multipla ----------------
        await O.click('[data-act="select"]'); await O.wait_for_selector('#amSelBar:not([hidden])')
        await (await card(O, 'Azul')).click(); await (await card(O, 'Pandemic')).click()
        ok('2' in await O.inner_text('.am-sel-n'), 'due giochi selezionati')
        await O.click('[data-act="bulk"]'); await O.fill('#bkLoc_room', 'Cantina'); await O.fill('#bkLoc_unit', 'Scaffale'); await O.fill('#bkTagAdd', 'estate')
        await O.click('#bkPrev'); await O.wait_for_selector('#bkPreview:not([hidden])')
        pv = await O.inner_text('#bkPreview')
        ok('Cambierà 2 giochi' in pv and len(lib_by_name(aid)['Azul'][1].get('loc') or {}) == 0, 'anteprima della modifica multipla, niente scritto: ' + pv.split('\n')[0])
        await O.click('#bkGo'); await asyncio.sleep(0.8)
        L = lib_by_name(aid)
        ok(L['Azul'][1]['loc'] == {'room': 'Cantina', 'unit': 'Scaffale'} and L['Pandemic'][1]['loc'].get('room') == 'Cantina' and L['Pandemic'][1]['loc'].get('shelf') == 'Alto', 'posizione applicata a tutti (i campi lasciati vuoti restano)')
        ok('estate' in L['Azul'][1]['tags'] and 'coop' in L['Pandemic'][1]['tags'], 'etichetta aggiunta senza togliere le altre')
        ok(any(e.get('op') == 'bulk' for e in arm(aid)['log'].values()), 'cronologia: modifica multipla')
        await O.click('#amSelBar [data-act="select"]')

        # ---------------- cestino, ripristino, eliminazione ----------------
        cid = L['Codenames'][0]
        await (await card(O, 'Codenames')).click(); await O.click('[data-trash]'); await asyncio.sleep(0.8)
        A = arm(aid)
        ok(cid not in A['library'] and cid in A['trash'], 'nel cestino (non cancellato)')
        await O.click('[data-tab="trash"]'); await O.wait_for_selector(f'[data-restore="{cid}"]')
        await O.click(f'[data-restore="{cid}"]'); await asyncio.sleep(0.8)
        A = arm(aid)
        ok(cid in A['library'] and cid not in A['trash'] and A['library'][cid].get('tags') == ['party', 'parole'], 'ripristinato con tutti i dati')
        old = [k for k, t in A['trash'].items() if t['game']['name'] == 'Azul'][0]
        await O.click(f'[data-restore="{old}"]'); await asyncio.sleep(0.8)
        A = arm(aid)
        n_az = len([g for g in A['library'].values() if g['name'] == 'Azul'])
        ok(n_az == 2, 'ripristino con lo stesso nome: chiede conferma e lo aggiunge come gioco separato')
        PROMPT['text'] = 'no'
        old2 = [k for k, t in A['trash'].items() if t['game']['name'] == 'Catan'][0]
        await O.wait_for_selector(f'[data-purge="{old2}"]'); await O.click(f'[data-purge="{old2}"]'); await asyncio.sleep(0.6)
        ok(old2 in arm(aid)['trash'], 'eliminazione definitiva: senza scrivere ELIMINA non succede niente')
        PROMPT['text'] = 'ELIMINA'
        await O.click(f'[data-purge="{old2}"]'); await asyncio.sleep(0.8)
        ok(old2 not in arm(aid).get('trash', {}), 'eliminato per sempre dopo la conferma')
        r = raw('set', f'armadi/{aid}/trash/{old}', None, uid='uEstraneo')
        ok(r.get('error') == 'permission_denied', 'un estraneo non può svuotare il cestino')
        # cronologia
        await O.click('[data-tab="log"]'); await O.wait_for_selector('.am-log li')
        lg = await O.inner_text('.am-log')
        ok(all(x in lg for x in ['Aggiunto', 'Prestato', 'Restituito', 'cestino', 'Ripristinato', 'Eliminato', 'Importato', 'rinominato']), 'cronologia completa nella scheda')
        r = raw('set', f'armadi/{aid}/log/{list(arm(aid)["log"])[0]}', {'at': 1, 'op': 'edit'}, uid=arm(aid)['info']['ownerUid'])
        ok(r.get('error') == 'permission_denied', 'le voci della cronologia non si possono modificare, nemmeno dal proprietario')

        # ---------------- doppioni ----------------
        await O.click('[data-tab="games"]'); await O.click('#amHero [data-act="add"]'); await O.fill('#edName', 'Catan'); await O.fill('#edEdition', 'Big Box'); await O.click('#edSave')
        await wait_js(O, "!document.querySelector('#edForm')"); await asyncio.sleep(0.5)
        ok(len([g for g in arm(aid)['library'].values() if g['name'] == 'Catan']) == 2, 'altra edizione aggiunta senza domande')
        await O.click('[data-tab="tools"]'); await O.wait_for_selector('.am-tools')
        await O.click('[data-act="dups"]'); await O.wait_for_selector('.am-dup')
        n = await O.locator('.am-dup').count()
        ok(n >= 1, f'coppie da controllare: {n}')
        ok('Edizione diversa' in await O.inner_text('.am-dups'), 'riconosce l’edizione diversa')
        dup = O.locator('.am-dup:has-text("Catan")').first
        await dup.locator('[data-d="ok"]').click(); await asyncio.sleep(0.7)
        L = arm(aid)['library']; cs = [k for k, g in L.items() if g['name'] == 'Catan']
        ok(L[cs[0]].get('dupOk', {}).get(cs[1]) is True and L[cs[1]].get('dupOk', {}).get(cs[0]) is True, '“Sono diversi” ricordato')
        await close_sheets(O)

        # ---------------- esportazione ----------------
        async with O.expect_download() as d1:
            await O.click('[data-act="export-csv"]')
        f1 = await (await d1.value).path(); t1 = open(f1, encoding='utf-8-sig').read()
        ok(t1.startswith('id;nome;') and 'Dixit: Odyssey' in t1 and 'Cantina' in t1, 'CSV esportato (punto e virgola, intestazioni italiane)')
        async with O.expect_download() as d2:
            await O.click('[data-act="export-json"]')
        j = json.loads(open(await (await d2.value).path(), encoding='utf-8').read())
        bad = [k for k in ['ownerUid', 'armadioKeys', 'admins', 'images'] if k in json.dumps(j)]
        ok(j['format'] == 'gamenight-armadio' and len(j['games']) == 8 and not bad and not any('image' in g for g in j['games']), f'JSON esportato senza segreti né foto grandi ({bad})')

        # ---------------- etichette QR ----------------
        await O.click('[data-act="labels-all"]'); await asyncio.sleep(1)
        nl = await O.evaluate("(()=>{const f=document.getElementById('reportFrame');return f&&f.contentDocument?f.contentDocument.querySelectorAll('.lab svg').length:-1})()")
        ok(nl == 8, f'etichette con QR per tutti i giochi filtrati: {nl}')
        href = await O.evaluate("(()=>{const f=document.getElementById('reportFrame');return f.contentDocument.body.innerHTML.includes('armadio.html?a=')})()")
        route = await O.evaluate(f"import('/js/native.js').then(m=>m.routeFromQR('https://example.github.io/GameNight_Show/armadio.html?a={aid}&g=-Nabc&pos=Soggiorno%20%E2%80%BA%20Libreria'))")
        ok(route and route.startswith(f'armadio.html?a={aid}') and 'g=-Nabc' in route and 'pos=' in route, f'il QR dell’etichetta si apre anche dalla fotocamera dell’app: {route}')

        # ---------------- schede incomplete ----------------
        await O.click('[data-act="wizard"]'); await O.wait_for_selector('#wzGo')
        await O.click('#wzGo'); await O.wait_for_selector('#wzForm')
        first = await O.inner_text('.am-wz-head b')
        if await O.locator('#wzW').count(): await O.fill('#wzW', '2')
        if await O.locator('#wzMode').count(): await O.select_option('#wzMode', 'misto')
        await O.click('#wzSave'); await asyncio.sleep(0.6)
        ok(any(g['name'] == first and (g.get('weight') == 2 or g.get('mode') == 'misto') for g in arm(aid)['library'].values()), f'compilazione rapida: {first} completato')
        await O.click('#wzSkip'); await asyncio.sleep(0.3)
        ok(await O.locator('#wzForm').count() == 1 or await O.locator('text=Fatto').count() == 1, '“Salta” passa al successivo')
        await close_sheets(O)

        # ---------------- migrazione delle foto vecchie ----------------
        ouid = arm(aid)['info']['ownerUid']
        big_img = arm(aid)['images'][did]
        r = raw('set', f'armadi/{aid}/library/-legacy1', {'name': 'Vecchio gioco', 'image': big_img, 'addedAt': 1}, uid=ouid)
        ok('error' not in r, 'gioco “vecchio” con la foto dentro (come prima della 1.2)')
        await O.goto(BASE + f'/armadio.html?a={aid}'); await O.wait_for_selector('.am-card')
        await wait_js(O, f"true", 100); await asyncio.sleep(4)
        g = arm(aid)['library']['-legacy1']
        ok('image' not in g and g.get('thumb', '').startswith('data:image/jpeg') and arm(aid)['images'].get('-legacy1') == big_img, 'migrazione: foto spostata a parte, miniatura creata, nessuna perdita')

        # ---------------- link pubblico ----------------
        await O.click('[data-tab="tools"]'); await O.click('[data-act="share"]'); await O.wait_for_selector('#shOn')
        ok(await O.is_checked('#shLoc') is False, 'la posizione non è pubblica se non la scegli')
        await O.click('#shOn'); await O.wait_for_selector('#shLink input'); await asyncio.sleep(0.8)
        purl = await O.input_value('#shLink input'); tok = purl.split('p=')[1]
        pub = db().get('pub', {}).get(tok)
        ok(pub and pub['aid'] == aid and len(pub['games']) == 9, f'catalogo pubblico creato ({len(pub["games"]) if pub else 0} giochi)')
        dumped = json.dumps(pub['games'])
        leak = [w for w in ['Marco', 'Ada', 'Bea', 'loanTo', 'owner', 'note', '"loc"', 'tessera', 'rovinata', 'Cantina', 'Studio'] if w in dumped]
        ok(not leak, f'nel catalogo niente prestiti, note, proprietari, posizioni: {leak}')
        await close_sheets(O)
        cv, V = await device(b, 'vis', 412, 860, mobile=True)
        await V.goto(BASE + f'/armadio.html?p={tok}'); await V.wait_for_selector('.am-card')
        ok(await V.locator('.am-card').count() == 9 and await V.locator('[data-act="add"]').count() == 0 and await V.locator('#amTabs:not([hidden])').count() == 0, 'il visitatore vede il catalogo senza comandi di modifica')
        await V.locator('.am-card').first.click(); await V.wait_for_selector('.am-sheet-grid')
        ok(await V.locator('[data-edit], [data-lend], [data-trash]').count() == 0 and 'non pubblicata' in await V.inner_text('.am-overlay'), 'scheda pubblica in sola lettura, posizione nascosta')
        vuid = await V.evaluate("sessionStorage.getItem('fake_uid')")
        r1 = raw('set', f'pub/{tok}/games/x', {'name': 'Spam'}, uid=vuid)
        r2 = raw('set', f'armadi/{aid}/library/x', {'name': 'Spam'}, uid=vuid)
        r3 = raw('read', f'armadi/{aid}/loans', uid=vuid)
        r4 = raw('read', 'pub', uid=vuid)
        ok(all(r.get('error') == 'permission_denied' for r in [r1, r2, r3, r4]), 'regole: il visitatore non scrive, non legge i prestiti, non elenca i cataloghi')
        await V.screenshot(path='am_public.png', full_page=True)
        # aggiornamento automatico del catalogo
        await O.click('[data-tab="games"]'); await (await card(O, 'Pandemic')).click(); await O.click('[data-edit]'); await O.fill('#edDur', '50'); await O.click('#edSave')
        await asyncio.sleep(4.5)
        pg = [g for g in db()['pub'][tok]['games'].values() if g['name'] == 'Pandemic'][0]
        ok(pg.get('duration') == 50, 'il catalogo pubblico si aggiorna da solo (solo il gioco cambiato)')
        # disattiva
        await O.click('[data-tab="tools"]'); await O.click('[data-act="share"]'); await O.click('#shOff'); await asyncio.sleep(1.2)
        ok(tok not in db().get('pub', {}) and 'share' not in arm(aid), 'link disattivato')
        await V.wait_for_selector('text=Link non più valido', timeout=8000)
        ok(True, 'chi aveva il link vede “Link non più valido”')

        # ---------------- collaboratore con invito, poi revocato ----------------
        await O.click('[data-tab="tools"]'); await O.click('[data-act="invite"]'); await O.wait_for_selector('#ivCopy')
        code = (await O.inner_text('.am-overlay .hub-link-code .code-chip')).strip()
        inv = arm(aid)['invites'][code]
        ok(inv['exp'] - time.time() * 1000 > 6.9 * 86400000, f'invito valido 7 giorni ({code})')
        await close_sheets(O)
        ce, E = await device(b, 'edit', 412, 860, mobile=True)
        await E.goto(BASE + f'/armadio.html?a={aid}#inv={code}'); await E.wait_for_selector('#amHero')
        await wait_js(E, "document.querySelector('.am-meta').textContent.includes('Collaboratore')")
        euid = await E.evaluate("sessionStorage.getItem('fake_uid')")
        ok(arm(aid)['admins'].get(euid) is True and '#inv' not in E.url, 'con l’invito diventa collaboratore (e il codice sparisce dall’indirizzo)')
        await (await card(E, 'Azul')).first.click(); await E.click('[data-edit]'); await E.fill('#edLoc_box', 'Scatola blu'); await E.click('#edSave'); await asyncio.sleep(0.8)
        ok(any(g['name'] == 'Azul' and (g.get('loc') or {}).get('box') == 'Scatola blu' for g in arm(aid)['library'].values()), 'il collaboratore modifica')
        await O.click('[data-tab="games"]'); await O.click('[data-tab="tools"]'); await O.wait_for_selector(f'[data-revoke="{euid}"]')
        ok('Dispositivo' in await O.inner_text('.am-people') or 'Collaboratore' in await O.inner_text('.am-people'), 'il collaboratore compare in “Persone e permessi”')
        await O.click(f'[data-revoke="{euid}"]'); await asyncio.sleep(0.8)
        ok(euid not in (arm(aid).get('admins') or {}), 'revocato')
        r = raw('update', f'armadi/{aid}/library/{did}', {'note': 'x'}, uid=euid)
        ok(r.get('error') == 'permission_denied', 'dopo la revoca non può più scrivere')
        r = raw('set', f'armadioInviteClaims/{aid}/{euid}', code, uid=euid)
        r2 = raw('set', f'armadi/{aid}/admins/{euid}', True, uid=euid)
        ok(r2.get('error') == 'permission_denied' or r.get('error') == 'permission_denied', 'un invito già usato non si riusa dopo la revoca')
        await E.reload(); await E.wait_for_selector('#amHero')
        ok('Sola lettura' in await E.inner_text('.am-meta') and await E.locator('[data-act="add"]').count() == 0, 'dopo la revoca: sola lettura')

        # ---------------- trasferimento in un altro armadio ----------------
        await O.goto(BASE + '/index.html'); await O.wait_for_selector('#tileArm'); await O.click('#tileArm')
        await O.wait_for_selector('#hubArmadi:not([hidden])')
        ok('Ludoteca di casa' in await O.inner_text('#hubArmadi'), 'la home mostra il nome nuovo dell’armadio')
        await O.click('#armNew'); await O.fill('#naName', 'Casa al mare'); await O.click('#naGo'); await O.wait_for_selector('#edForm')
        aid2 = re.search(r'a=([A-Z0-9]{6})', O.url).group(1)
        await O.goto(BASE + f'/armadio.html?a={aid}'); await O.wait_for_selector('.am-card')
        pid = lib_by_name(aid)['Pandemic'][0]
        await (await card(O, 'Pandemic')).click(); await O.click('[data-move]'); await O.select_option('#mvTo', aid2); await O.click('#mvGo')
        await O.wait_for_selector('text=giochi spostati', timeout=8000) if False else await asyncio.sleep(1.5)
        A1, A2 = arm(aid), arm(aid2)
        ok(pid not in A1['library'] and pid in A2['library'] and A2['library'][pid].get('locCheck') is True, 'spostato (non copiato) e posizione da riconfermare')
        await close_sheets(O)

        # ---------------- host: reindirizzamento e armadio già scelto ----------------
        await O.goto(BASE + f'/host.html?armadio={aid}'); await O.wait_for_url(re.compile('armadio.html'), timeout=8000)
        ok(f'armadio.html?a={aid}' in O.url, 'host.html?armadio=… porta alla nuova pagina')
        await O.wait_for_selector('#amHero a[href*="usaArmadio"]'); await O.click('#amHero a[href*="usaArmadio"]'); await O.wait_for_selector('#armSel')
        ok(await O.input_value('#armSel') == aid, '“Crea una serata” sceglie già questo armadio')

        # ---------------- telefono stretto: niente scorrimento a destra ----------------
        cm, M = await device(b, 'm360', 360, 780, mobile=True)
        key = db()['armadioKeys'][aid]
        await M.goto(BASE + f'/armadio.html?a={aid}#ak={key}'); await M.wait_for_selector('.am-card')
        await wait_js(M, "!!document.querySelector('[data-act=\"select\"]')")
        for tag, act in [('grid', None), ('list', '[data-view="list"]'), ('shelves', '[data-view="shelves"]')]:
            if act: await M.click(act); await asyncio.sleep(0.3)
            r = await M.evaluate(OVF)
            ok(r['sw'] <= r['W'] and not r['out'], f'360px vista {tag}: niente fuori schermo {r["out"][:3]}')
            await M.screenshot(path=f'am_m_{tag}.png', full_page=True)
        await M.click('[data-view="grid"]'); await M.click('[data-act="filters"]'); await M.wait_for_selector('.am-filters-sheet')
        r = await M.evaluate(OVF); ok(r['sw'] <= r['W'] and not r['out'], f'360px filtri {r["out"][:3]}')
        await M.screenshot(path='am_m_filters.png')
        await close_sheets(M)
        await (await card(M, 'Dixit')).click(); await M.wait_for_selector('.am-sheet-grid'); await asyncio.sleep(0.4)
        r = await M.evaluate(OVF); ok(r['sw'] <= r['W'] and not r['out'], f'360px scheda gioco {r["out"][:3]}')
        await M.screenshot(path='am_m_sheet.png')
        await close_sheets(M)
        await M.click('[data-act="select"]'); await (await card(M, 'Azul')).first.click(); await asyncio.sleep(0.3)
        r = await M.evaluate(OVF); ok(r['sw'] <= r['W'] and not r['out'], f'360px selezione multipla {r["out"][:3]}')
        await M.screenshot(path='am_m_sel.png')
        await M.click('#amSelBar [data-act="select"]')
        for tab in ['loans', 'log', 'trash', 'tools']:
            await M.click(f'[data-tab="{tab}"]'); await asyncio.sleep(0.3)
            r = await M.evaluate(OVF); ok(r['sw'] <= r['W'] and not r['out'], f'360px scheda {tab} {r["out"][:3]}')
            await M.screenshot(path=f'am_m_{tab}.png', full_page=True)
        # tasto Indietro di Android (simulato): finestra, poi scheda, poi home
        BACK = "import('/js/native.js').then(m=>m.handleBack())"
        await M.click('[data-tab="loans"]')
        await M.click('[data-tab="games"]'); await (await card(M, 'Dixit')).click(); await M.wait_for_selector('.am-overlay')
        r1 = await M.evaluate(BACK); await asyncio.sleep(0.3)
        ok(r1 == 'overlay' and await M.locator('.am-overlay').count() == 0, 'Indietro chiude la scheda aperta')
        await M.click('[data-tab="trash"]'); r2 = await M.evaluate(BACK); await asyncio.sleep(0.2)
        ok(r2 == 'page' and await M.get_attribute('[data-tab="games"]', 'aria-pressed') == 'true', 'Indietro torna all’elenco dei giochi')
        await M.evaluate(BACK); await M.wait_for_url(re.compile('index.html'), timeout=5000)
        ok(True, 'Indietro dall’elenco torna alla home')
        await O.goto(BASE + f'/armadio.html?a={aid}'); await O.wait_for_selector('.am-card'); await O.screenshot(path='am_desk.png', full_page=True)
        await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')
asyncio.run(main())
