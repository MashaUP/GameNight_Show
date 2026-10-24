# Esportazioni dall'app Android (1.10): nell'app non ci sono download né stampa del browser.
# Con un finto Capacitor (porta 8766, "come l'app") controlla che ogni esportazione arrivi davvero ai
# plugin nativi: PDF vero del resoconto (pagina Resoconto e funzione della TV, con le foto), CSV, JSON,
# calendario, registro errori, immagine da condividere, manuale salvato sul dispositivo.
import asyncio, base64, json, os, time, urllib.request
import common
from common import watch, errs
from playwright.async_api import async_playwright
common.BASE = BASE = 'http://localhost:8766'
fails = []
def ok(c, m):
    print(('OK   ' if c else 'FAIL ') + m, flush=True)
    if not c: fails.append(m)

# Finto Capacitor che tiene i file scritti (base64) per controllarne il contenuto
CAP = """
window.__calls = []; window.__files = {};
window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n) => ['App', 'Filesystem', 'Share', 'FileOpener'].includes(n), addListener() { return { remove() {} }; }, nativePromise(p, m, o) {
  const c = Object.assign({}, o || {}); if (c.data) { window.__files[(o.directory || '') + ':' + o.path] = o.data; c.data = 'len:' + o.data.length; } window.__calls.push([p, m, c]);
  if (p === 'Filesystem' && m === 'writeFile') return Promise.resolve({ uri: 'file:///' + (o.directory || 'x').toLowerCase() + '/' + o.path });
  return Promise.resolve({});
} };
try { localStorage.setItem('gnr_tour_off', '1'); localStorage.setItem('gnr_tour_phone', '1'); localStorage.setItem('gnr_lite', 'off'); localStorage.setItem('gnr_intro_done', '1'); localStorage.setItem('gnr_lang', 'it'); } catch (e) {}
"""

def dbset(path, value):
    body = json.dumps({'op': 'set', 'path': path, 'value': value, 'uid': 'tv', 'raw': True}).encode()
    urllib.request.urlopen(urllib.request.Request(BASE + '/__db', data=body, method='POST')).read()

def pdf_ok(b64):
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return False, b''
    return raw.startswith(b'%PDF-1.4') and raw.rstrip().endswith(b'%%EOF'), raw

async def calls(pg):
    return await pg.evaluate('window.__calls')

async def main():
    now = int(time.time() * 1000)
    code = 'XP7Q'
    dbset(f'rooms/{code}', {
        'meta': {'createdAt': now - 3 * 3600_000, 'groupName': 'Amici del giovedì', 'host': 'tv'},
        'players': {'a': {'name': 'Anna'}, 'b': {'name': 'Bruno'}, 'c': {'name': 'Carla'}},
        'games': {'g1': {'name': 'Azul', 'order': 1, 'status': 'revealed', 'playedMin': 40, 'winners': {'a': True}},
                  'g2': {'name': 'Città perdute', 'order': 2, 'status': 'revealed', 'playedMin': 25}},
        'votes': {'g1': {'a': {'overall': 9, 'comment': 'Bellissimo (davvero)'}, 'b': {'overall': 8}, 'c': {'overall': 7}},
                  'g2': {'a': {'overall': 6}, 'b': {'overall': 7, 'comment': 'Più tattico del previsto'}}},
        'state': {'phase': 'awards'}
    })
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        await ctx.add_init_script(CAP)
        pg = await ctx.new_page(); watch(pg, 'app')

        # 1. Resoconto: il pulsante dice PDF e crea un PDF vero in Documenti, poi lo apre
        await pg.goto(f'{BASE}/resoconto.html?room={code}'); await pg.wait_for_selector('.rs-board')
        label = await pg.inner_text('#rsPrint')
        ok('PDF' in label, f'pulsante del resoconto nell\'app: {label!r}')
        await pg.evaluate('window.__calls = []'); await pg.click('#rsPrint'); await pg.wait_for_timeout(1500)
        cs = await calls(pg)
        docs = [c for c in cs if c[0] == 'Filesystem' and c[2].get('directory') == 'DOCUMENTS']
        ok(docs and docs[0][2]['path'].startswith('GameNight Show/GameNight_resoconto_') and docs[0][2]['path'].endswith('.pdf'), f'PDF salvato in Documenti/GameNight Show {[c[2].get("path") for c in docs]}')
        files = await pg.evaluate('window.__files')
        b64 = next((v for k, v in files.items() if k.startswith('DOCUMENTS:') and k.endswith('.pdf')), '')
        good, raw = pdf_ok(b64)
        ok(good, f'il file è un PDF completo ({len(raw)} byte)')
        ok(b'Azul' in raw and b'Amici del giovedi' not in raw and b'Amici del gioved\\354' in raw, 'testo del PDF con nomi e accenti (WinAnsi)')
        ok(any(c[0] == 'FileOpener' and c[1] == 'openFile' and c[2].get('mimeType') == 'application/pdf' for c in cs), 'PDF aperto con il lettore del telefono')
        ok(not any(c[2].get('path', '').endswith('.html') for c in cs), 'niente più pagina HTML al posto del PDF')

        # 2. PDF della TV (stessa funzione) con le foto dell'album
        await pg.evaluate('window.__calls = []; window.__files = {}')
        res = await pg.evaluate("""(async () => {
          const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d');
          g.fillStyle = '#7B5CFF'; g.fillRect(0, 0, 300, 200); g.fillStyle = '#FFD23F'; g.fillRect(40, 40, 120, 120);
          const photo = c.toDataURL('image/png');
          const { exportReport } = await import('/js/report.js');
          return exportReport({ group: 'Prova', date: 'oggi', number: 3, facts: '2 giochi', rows: [{ rank: 1, name: 'Azul', avg: 8, n: 3, crit: {}, mvp: ['Anna'], winners: [], minutes: 40, audience: null, consensus: 70 }],
            awards: [{ title: 'Gioco della serata', who: 'Azul', value: '8' }], achievements: [], quotes: [], photos: [{ data: photo, caption: 'Tavolo', by: 'Anna' }, { data: photo, caption: '' }], next: '' });
        })()""")
        files = await pg.evaluate('window.__files')
        b64 = next((v for k, v in files.items() if k.endswith('.pdf')), '')
        good, raw = pdf_ok(b64)
        ok(res == 'pdf' and good, f'PDF della serata dalla TV/app: {res}')
        ok(raw.count(b'/Subtype /Image') == 2 and b'/DCTDecode' in raw, 'le foto dell\'album sono nel PDF (JPEG)')

        # 3. Altri file: CSV, JSON, calendario, registro errori → Documenti/GameNight Show
        await pg.evaluate('window.__calls = []')
        await pg.evaluate("""(async () => {
          const { downloadFile, ErrLog } = await import('/js/util.js');
          downloadFile('armadio.csv', 'nome;giocatori\\nAzul;2-4', 'text/csv');
          downloadFile('dati.json', '{"a":1}', 'application/json');
          const { downloadICS } = await import('/js/tv-extras.js');
          downloadICS({ at: Date.now() + 86400000, place: 'da Anna' }, 'Gruppo');
          ErrLog.download();
        })()""")
        await pg.wait_for_timeout(800)
        paths = [c[2].get('path') for c in await calls(pg) if c[0] == 'Filesystem' and c[2].get('directory') == 'DOCUMENTS']
        for ext in ('.csv', '.json', '.ics', '.txt'):
            ok(any(x.endswith(ext) for x in paths), f'file {ext} salvato nell\'app')

        # 4. Immagine da condividere: pannello "Condividi" di Android
        await pg.evaluate('window.__calls = []')
        await pg.evaluate("""(async () => {
          const { shareOrDownload } = await import('/js/share.js');
          const c = document.createElement('canvas'); c.width = 10; c.height = 10;
          const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
          await shareOrDownload(blob, 'serata.png', 'GameNight');
        })()""")
        await pg.wait_for_timeout(500)
        ok(any(c[0] == 'Share' and c[1] == 'share' for c in await calls(pg)), 'immagine condivisa con "Condividi" di Android')

        # 5. Manuale salvato sul dispositivo: si apre con il lettore del telefono (non window.open)
        await pg.evaluate('window.__calls = []')
        r = await pg.evaluate("""(async () => {
          const { LocalManuals } = await import('/js/manuals.js');
          const f = new File(['%PDF-1.4\\n%%EOF'], 'regole.pdf', { type: 'application/pdf' });
          await LocalManuals.save('ABC123', 'g1', f);
          let opened = false; const o = window.open; window.open = () => { opened = true; return null; };
          const res = await LocalManuals.open('ABC123', 'g1');
          window.open = o;
          return { res, opened };
        })()""")
        cs = await calls(pg)
        ok(r['res'] and not r['opened'], f'manuale aperto senza schede del browser {r}')
        ok(any(c[0] == 'FileOpener' and c[2].get('mimeType') == 'application/pdf' for c in cs), 'manuale passato al lettore PDF')
        # 6. Etichette con QR dell'armadio: PDF vero con i QR disegnati
        await pg.evaluate('window.__calls = []; window.__files = {}')
        r = await pg.evaluate("""(async () => {
          if (!window.qrcode) await new Promise((r) => { const s = document.createElement('script'); s.src = '/vendor/qrcode.js'; s.onload = r; document.head.appendChild(s); });
          const { exportLabels } = await import('/js/report.js');
          const labels = Array.from({ length: 30 }, (_, i) => ({ title: 'Gioco numero ' + (i + 1), sub: 'Soggiorno › Libreria', ref: 'Armadio · ABC123·' + i, url: 'https://example.github.io/GameNight_Show/armadio.html?a=ABC123&g=g' + i }));
          return exportLabels('<html></html>', { heading: 'Etichette di prova', labels });
        })()""")
        files = await pg.evaluate('window.__files')
        b64 = next((v for k, v in files.items() if 'etichette' in k and k.endswith('.pdf')), '')
        good, raw = pdf_ok(b64)
        ok(r == 'pdf' and good and b'/Count 2' in raw and raw.count(b' re') > 2000, f'etichette in PDF con QR vettoriali su 2 pagine ({len(raw)} byte)')
        open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'labels16.pdf'), 'wb').write(raw)
        await ctx.close(); await b.close()
    print('ERRORI:', errs or 'nessuno')
    print('FALLITI:', fails or 'nessuno')

if __name__ == '__main__': asyncio.run(main())
