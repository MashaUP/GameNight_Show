# 2.5 · ROOM e gestore della stanza, con le regole vere (porta 8767):
# - colonna del QR senza scorrimento interno, solo QR / testo / codice / codice regia (niente link);
# - X per allontanare dentro la card (non tagliata), avviso dei giocatori minimi in alto;
# - la TV sceglie un gestore; il telefono del gestore chiude l'ingresso, cambia i posti, allontana un giocatore;
# - revoca: il telefono perde i comandi e il database rifiuta le sue scritture;
# - TV chiusa: il gestore chiude comunque la serata.
import os
os.environ.setdefault('GN_BASE', 'http://localhost:8767')
import asyncio
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

async def poll(pg, js, timeout=12):
    """Aspetta che un'espressione nella pagina diventi vera (senza wait_for_function: la CSP blocca eval)."""
    end = asyncio.get_event_loop().time() + timeout
    last = None
    while asyncio.get_event_loop().time() < end:
        try:
            last = await pg.evaluate(js)
            if last: return last
        except Exception: pass
        await asyncio.sleep(0.25)
    return last

async def phone(b, name, uid):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    await ctx.add_init_script(f"try {{ sessionStorage.setItem('fake_uid', '{uid}'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_intro_done', '1'); localStorage.setItem('gnr_lite', 'off'); }} catch (e) {{}}")
    pg = await ctx.new_page(); watch(pg, name)
    return ctx, pg

async def join(pg, code, name, pick=0):
    await pg.goto(f'{BASE}/play.html?room={code}'); await pg.wait_for_selector('#nameInput')
    await pg.fill('#nameInput', name); await pg.click(f'.av-opt[data-pick="{pick}"]'); await pg.click('#joinBtn')
    await pg.wait_for_selector('#waitList')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        tctx, TV, code = await tv(b, seats=4, group='Stanza 2.5', w=1920, h=1080)
        hint = await TV.inner_text('#lobbyHint')
        top = await TV.evaluate("() => { const h = document.getElementById('lobbyHint').getBoundingClientRect(); const s = document.getElementById('startBtn').getBoundingClientRect(); return h.bottom < s.top - 200; }")
        ok('almeno 2' in hint and top, f'avviso dei giocatori minimi in alto ({hint})')
        side = await TV.evaluate("() => { const s = document.querySelector('.room-side'); const q = document.getElementById('lobbyQr'); return [s.scrollHeight - s.clientHeight, q.scrollHeight - q.clientHeight, getComputedStyle(s).overflowY]; }")
        ok(side[0] <= 0 and side[1] <= 0, f'colonna del QR senza scorrimento interno ({side})')
        txt = await TV.inner_text('.room-side')
        ok('play.html' not in txt and 'github' not in txt, 'niente link testuale nella colonna')
        rg = await TV.evaluate("() => { const r = document.getElementById('lobbyRegia').getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; }")
        ok(rg and await TV.is_visible('#regiaCopy'), 'codice regia e «Copia» visibili senza scorrere')
        qr = await TV.evaluate("() => { const r = document.getElementById('qr').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }")
        ok(abs(qr[0] - qr[1]) <= 1 and qr[0] >= 200, f'QR quadrato e grande ({qr})')

        actx, A = await phone(b, 'anna', 'anna25'); await join(A, code, 'Anna', 0)
        bctx, B = await phone(b, 'bruno', 'bruno25'); await join(B, code, 'Bruno', 1)
        await poll(TV, "document.querySelectorAll('#slots .pcard:not(.pcard--free):not(.pcard--empty)').length === 2 && !document.getElementById('lobbyHint').textContent.includes('almeno 2')")
        hint2 = await TV.inner_text('#lobbyHint')
        ok('almeno 2' not in hint2, f'avviso aggiornato con 2 giocatori ({hint2})')
        # misurate a card ferme (l'ingresso ha una piccola animazione)
        KICK = "(() => { if (document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('#slots'))) return null; const box = document.getElementById('peopleBox').getBoundingClientRect(); const r = [...document.querySelectorAll('#slots .kick')].map((k) => { const x = k.getBoundingClientRect(); const c = k.closest('.pcard').getBoundingClientRect(); return x.top >= c.top - 0.5 && x.right <= c.right + 0.5 && x.top >= box.top - 0.5; }); return r.length === 2 && r.every(Boolean) ? r : null; })()"
        kick = await poll(TV, KICK, 10)
        ok(bool(kick), f'X dentro la card e non tagliata ({kick})')

        # ---------------- La TV sceglie il gestore ----------------
        await TV.click('#hdrTools'); await TV.wait_for_selector('#tlManager', state='visible')
        await TV.select_option('#tlManager', 'anna25'); await until(lambda: at(f'rooms/{code}/meta/managerUid') == 'anna25', 10)
        ok(at(f'rooms/{code}/meta/managerUid') == 'anna25', 'la TV nomina Anna gestore')
        await TV.click('#tlClose')
        chip = await poll(TV, "(() => { const b = document.getElementById('lobbyManager'); return b && !b.hidden && b.textContent.includes('Anna') ? b.textContent : null; })()")
        ok(bool(chip), f'la TV mostra chi è il gestore ({chip})')
        await A.wait_for_selector('[data-dock="manage"]', timeout=15000)
        ok(not await B.is_visible('[data-dock="manage"]'), 'solo il gestore ha «Gestisci»')

        # ---------------- Comandi del gestore ----------------
        await A.click('[data-dock="manage"]'); await A.wait_for_selector('[data-mg="lock"]')
        await A.click('[data-mg="lock"]'); await until(lambda: at(f'rooms/{code}/meta/locked') is True, 10)
        ok(at(f'rooms/{code}/meta/locked') is True, 'il gestore chiude l\'ingresso')
        await poll(A, "document.querySelector('[data-mg=\"lock\"]')?.getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-mg=\"lock\"]').disabled")
        await A.click('[data-mg="lock"]'); await until(lambda: at(f'rooms/{code}/meta/locked') is False, 10)
        ok(at(f'rooms/{code}/meta/locked') is False, 'e lo riapre')
        before = at(f'rooms/{code}/meta/maxPlayers')
        await poll(A, "document.querySelector('[data-mg=\"lock\"]')?.getAttribute('aria-pressed') === 'false'")
        await A.click('[data-mg="seats"][data-d="1"]'); await until(lambda: at(f'rooms/{code}/meta/maxPlayers') == before + 1, 10)
        ok(at(f'rooms/{code}/meta/maxPlayers') == before + 1, 'il gestore cambia i posti')
        await A.wait_for_selector('[data-mg="kick"][data-uid="bruno25"]', timeout=10000)
        await A.click('[data-mg="kick"][data-uid="bruno25"]'); await until(lambda: not at(f'rooms/{code}/players/bruno25'), 10)
        ok(not at(f'rooms/{code}/players/bruno25') and at(f'rooms/{code}/meta/banned/bruno25'), 'il gestore allontana Bruno (e non può rientrare)')
        bad = await B.evaluate(f"import('./js/fb.js').then((m) => m.set(m.roomRef('{code}', 'players/bruno25'), {{ name: 'Bruno', style: 'adventurer', seed: 'x', color: '#2EC4B6' }}).then(() => 'scritto', (e) => e.code))")
        ok(bad != 'scritto', f'Bruno non rientra da solo ({bad})')

        # ---------------- Revoca ----------------
        await TV.click('#hdrTools'); await TV.wait_for_selector('#tlManager', state='visible')
        await TV.select_option('#tlManager', ''); await until(lambda: at(f'rooms/{code}/meta/managerUid') is None, 10); await TV.click('#tlClose')
        ok(at(f'rooms/{code}/meta/managerUid') is None, 'la TV revoca il gestore')
        gone = await poll(A, "!document.querySelector('[data-dock=\"manage\"]')")
        ok(bool(gone), 'il telefono perde «Gestisci»')
        den = await A.evaluate(f"import('./js/fb.js').then((m) => m.set(m.roomRef('{code}', 'meta/locked'), true).then(() => 'scritto', (e) => e.code))")
        ok(den != 'scritto', f'dopo la revoca il database rifiuta i comandi ({den})')

        # ---------------- TV chiusa: il gestore chiude la serata ----------------
        await TV.click('#hdrTools'); await TV.wait_for_selector('#tlManager', state='visible')
        await TV.select_option('#tlManager', 'anna25'); await until(lambda: at(f'rooms/{code}/meta/managerUid') == 'anna25', 10)
        await tctx.close()
        await A.wait_for_selector('[data-dock="manage"]', timeout=15000)
        await A.click('[data-dock="manage"]'); await A.wait_for_selector('[data-mg="end"]')
        await A.click('[data-mg="end"]'); await until(lambda: (at(f'rooms/{code}/state') or {}).get('phase') == 'awards', 12)
        st = at(f'rooms/{code}/state') or {}
        ok(st.get('phase') == 'awards' and st.get('remote') is True, f'TV chiusa: il gestore chiude la serata ({st.get("phase")})')

        await b.close()
    print('ERRORI:', errs if errs else 'nessuno')
    print('FALLITI:', fails if fails else 'nessuno')

asyncio.run(main())
