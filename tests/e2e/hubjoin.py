import asyncio, re
from playwright.async_api import async_playwright
from common import *
from hub import dev
async def chk(pg, tag):
    await pg.screenshot(path=f'hubjoin_{tag}.png')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        hctx, host, code = await tv(b, seats=4, group='Gruppo P')
        ca, A = await dev(b, 'A')
        await A.goto(BASE + '/index.html'); await A.click('[data-act="create"]')
        await A.fill('#edName', 'Andrea'); await A.click('[data-pick="1"]'); await A.click('#edSave'); await A.wait_for_selector('.hub-name')
        await A.fill('#homeCode', code); await A.click('#joinGo')
        await A.wait_for_selector('#joinPerson'); await chk(A, 'join_person')
        await A.click('#joinPerson'); await A.wait_for_selector('#waitList', timeout=8000); await chk(A, 'joined')
        d = db(); pl = [p for p in d['rooms'][code]['players'].values()]
        print('player:', pl[0]['name'], pl[0].get('memberId'))
        pid = [k for k, v in d['people'].items() if (v.get('info') or {}).get('name') == 'Andrea'][-1]
        print('person groups:', d['people'][pid].get('groups'), 'gid', d['rooms'][code]['meta']['groupId'])
        # back to home via 🏠 then hub shows "Rientra"
        await A.click('[data-phhome]'); await A.wait_for_selector('.hub-name'); await asyncio.sleep(1.5)
        print('back box:', (await A.inner_text('#backBox')).replace('\n', ' | '))
        await A.wait_for_selector('#grpList', state='attached'); await asyncio.sleep(1); print('groups:', (await A.inner_text('#grpList')).replace('\n', ' | '))
        await chk(A, 'hub_after')
        # handleBack simulato
        await A.goto(BASE + f'/play.html?room={code}'); await A.wait_for_selector('#waitList')
        r = await A.evaluate("import('./js/native.js').then(m => m.handleBack())")
        await asyncio.sleep(1); print('back from room ->', r, A.url)
        # nuovo telefono, profilo vecchio stile (solo gnr_profiles) -> migrazione
        cb, B = await dev(b, 'B')
        await B.goto(BASE + f'/play.html?room={code}'); await B.wait_for_selector('#nameInput')
        await B.fill('#nameInput', 'Bruno'); await B.click('.av-opt[data-pick="0"]'); await B.click('#joinBtn'); await B.wait_for_selector('#waitList')
        await asyncio.sleep(1)
        d = db(); bp = [v for v in d['people'].values() if (v.get('info') or {}).get('name') == 'Bruno']
        print('auto person for Bruno:', len(bp), bp[0].get('groups') if bp else None)
        await b.close()
    print(errs[:10] or 'no errors')
if __name__ == "__main__": asyncio.run(main())
