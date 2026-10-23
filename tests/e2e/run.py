#!/usr/bin/env python3
"""Esegue i test end-to-end di GameNight Show (Playwright, Chromium).

Uso:
  python3 tests/e2e/run.py            tutti i test
  python3 tests/e2e/run.py hub app    solo quelli indicati
  python3 tests/e2e/run.py --ci       la selezione usata da GitHub Actions

Avvia da solo il server di prova (tests/e2e/server.mjs) se non è già attivo.
Un test è fallito se esce con un errore, se stampa una riga "FAIL", oppure se i suoi
riepiloghi (ERRORI, FALLITI, BAD, errors…) non sono vuoti.
"""
import os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

# Ordine: prima i più veloci e quelli delle fondamenta.
ALL = ['i18n', 'links', 'hub', 'app', 'upd13', 'selftest', 'fit', 'regress', 'xss', 'am12', 'armadio', 'arm2', 'images', 'rot',
       'tranche1', 'tranche2', 'tranche3', 'tranche5', 'tranche6', 'tranche7', 'tranche8', 'tranche9',
       'phoneui', 'phone_en', 'endnight', 'hubjoin', 'armpick', 'pollmulti', 'sfx', 'mtour', 'dtour', 'look']
# In CI (limite di 10 minuti): i flussi principali e le regole vere.
CI = ['i18n', 'links', 'hub', 'app', 'upd13', 'regress', 'xss', 'am12', 'armadio', 'images', 'endnight', 'pollmulti', 'fit', 'look']

BAD_SUMMARY = re.compile(r'^(ERRORI|FALLITI|BAD|ERRS|INIEZIONI TROVATE):\s*(.*)$')


def up(port):
    try:
        urllib.request.urlopen(f'http://localhost:{port}/index.html', timeout=2).read(1)
        return True
    except Exception:
        return False


def start_server():
    if all(up(p) for p in (8765, 8766, 8767)):
        return None
    proc = subprocess.Popen(['node', os.path.join(HERE, 'server.mjs')], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(50):
        if all(up(p) for p in (8765, 8766, 8767)):
            return proc
        time.sleep(0.2)
    proc.kill()
    sys.exit('Il server di prova non parte (serve Node 18+ e "npm install" nella cartella tests).')


def verdict(code, out):
    reasons = []
    if code != 0:
        reasons.append(f'uscita {code}')
    for line in out.splitlines():
        s = line.strip()
        if s.startswith('FAIL '):
            reasons.append(s[:160])
        m = BAD_SUMMARY.match(s)
        if m and m.group(2).strip() not in ('nessuno', 'nessuna', '[]', ''):
            reasons.append(s[:200])
        if s.startswith('[') and s.endswith(']') and s != '[]' and "'" in s and len(reasons) < 6:
            # elenco di errori della console stampato al posto di "no errors"
            if not s.startswith("['OK"):
                reasons.append('errori: ' + s[:200])
    return reasons


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = CI if '--ci' in sys.argv else (args or ALL)
    os.makedirs(OUT, exist_ok=True)
    proc = start_server()
    env = dict(os.environ)
    env.setdefault('PLAYWRIGHT_BROWSERS_PATH', env.get('PLAYWRIGHT_BROWSERS_PATH', ''))
    if not env['PLAYWRIGHT_BROWSERS_PATH']:
        del env['PLAYWRIGHT_BROWSERS_PATH']
    env['PYTHONPATH'] = HERE + os.pathsep + env.get('PYTHONPATH', '')
    results, t0 = [], time.time()
    try:
        for n in names:
            f = os.path.join(HERE, f'{n}.py')
            if not os.path.exists(f):
                results.append((n, ['file mancante'], 0)); continue
            t = time.time()
            attempt = 0
            while True:
                attempt += 1
                try:
                    p = subprocess.run([sys.executable, f], cwd=OUT, env=env, capture_output=True, text=True, timeout=600)
                    out, code = p.stdout + p.stderr, p.returncode
                except subprocess.TimeoutExpired as e:
                    out, code = (e.stdout or '') if isinstance(e.stdout, str) else '', 124
                with open(os.path.join(OUT, f'{n}.log'), 'w', encoding='utf-8') as fh:
                    fh.write(out)
                bad = verdict(code, out)
                # Un secondo tentativo solo per i test che dipendono dai tempi (non nasconde errori ripetibili)
                if bad and attempt == 1 and '--no-retry' not in sys.argv:
                    print(f'… {n}: ritento ({bad[0][:80]})', flush=True)
                    continue
                break
            dt = time.time() - t
            results.append((n, bad, dt))
            print(f"{'OK  ' if not bad else 'FAIL'} {n:10s} {dt:6.1f}s {'' if not bad else ' | '.join(bad[:3])}", flush=True)
    finally:
        if proc:
            proc.kill()
    failed = [r for r in results if r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} test superati in {time.time() - t0:.0f}s')
    if failed:
        print('Falliti: ' + ', '.join(r[0] for r in failed) + f' (dettagli in {OUT}/<nome>.log)')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
