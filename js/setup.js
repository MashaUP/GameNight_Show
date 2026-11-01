// Configuratore della copia personale (2.1, idea 78): dalla configurazione incollata a config.js.
//
// 1. Legge il blocco firebaseConfig incollato (senza eseguirlo: solo le chiavi note, come testo).
// 2. Prova davvero il progetto: accesso anonimo (attivo? dominio autorizzato?), database raggiungibile,
//    regole di GameNight Show pubblicate (secrets non leggibile, gruppi leggibili da chi è collegato).
// 3. Prepara config.js da scaricare o copiare, con le istruzioni per metterlo nel repository.
import { initializeApp, getAuth, signInAnonymously, getDatabase, ref, get } from '../vendor/firebase.js';
import { $, esc, toast, downloadFile, applyTheme } from './util.js';
import { t, applyStatic } from './i18n.js';

applyTheme();
applyStatic();
const KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

/** Estrae { chiave: valore } dal testo incollato (oggetto JS o JSON). Mai eval. */
export function parseConfig(text) {
  const out = {};
  for (const k of KEYS) {
    const m = new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"'\\n]+)["']`).exec(String(text || ''));
    if (m) out[k] = m[1].trim();
  }
  return out;
}
/** Problemi di forma (prima di provare il progetto). */
export function configProblems(c) {
  const p = [];
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(c.apiKey || '')) p.push('apiKey');
  if (!/^https:\/\/[a-z0-9-]+(-default-rtdb)?\.[a-z0-9.-]*(firebaseio\.com|firebasedatabase\.app)\/?$/.test(c.databaseURL || '')) p.push('databaseURL');
  if (!c.projectId) p.push('projectId');
  if (!c.authDomain) p.push('authDomain');
  if (!c.appId) p.push('appId');
  return p;
}
export function configFile(c) {
  const lines = KEYS.filter((k) => c[k]).map((k) => `  ${k}: ${JSON.stringify(c[k])}`);
  return `// =====================================================================
//  GameNight Show – configurazione Firebase (creata da setup.html)
//  Queste chiavi non sono segrete: la sicurezza è data dalle regole
//  del database (firebase/database.rules.json).
// =====================================================================

export const firebaseConfig = {
${lines.join(',\n')}
};
`;
}

async function probe(c) {
  const res = { auth: 'fail', db: 'fail', rules: 'unknown', code: '' };
  let app = null;
  try {
    app = initializeApp(c, `gn-setup-${Date.now()}`);
    try { await signInAnonymously(getAuth(app)); res.auth = 'ok'; } catch (e) { res.code = String(e?.code || ''); res.auth = res.code.includes('operation-not-allowed') || res.code.includes('admin-restricted') ? 'anonOff' : res.code.includes('unauthorized-domain') || res.code.includes('requests-from-referer') ? 'domain' : 'fail'; }
    if (res.auth === 'ok') {
      const db = getDatabase(app);
      const timeout = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(Object.assign(new Error('timeout'), { code: 'timeout' })), 8000))]);
      let secretsDenied = false, groupsOk = false;
      try { await timeout(get(ref(db, 'secrets/ZZZZ'))); res.db = 'ok'; } catch (e) { const code = String(e?.code || e?.message || ''); if (/permission/i.test(code)) { res.db = 'ok'; secretsDenied = true; } else res.db = code === 'timeout' ? 'timeout' : 'fail'; }
      if (res.db === 'ok') {
        try { await timeout(get(ref(db, 'groups/ZZZZZZ/info'))); groupsOk = true; } catch { groupsOk = false; }
        res.rules = secretsDenied && groupsOk ? 'ok' : !secretsDenied ? 'open' : 'locked';
      }
    }
  } catch (e) { res.code = String(e?.code || e?.message || ''); }
  return res;
}

function paint(c, r) {
  const box = $('#cfgResult');
  const row = (ok, label, help) => `<li class="ic-row ic-row--${ok ? 'ok' : 'error'}"><span class="ic-ico" aria-hidden="true">${ok ? '✅' : '❌'}</span><b>${esc(label)}</b>${help ? `<span>${esc(help)}</span>` : ''}</li>`;
  const host = location.hostname;
  box.hidden = false;
  box.innerHTML = `<h2>${esc(t('setup.results'))}</h2><ul class="ic-list">
    ${row(r.auth === 'ok', t('setup.r.auth'), r.auth === 'anonOff' ? t('setup.h.anonOff') : r.auth === 'domain' ? t('setup.h.domain', { host }) : r.auth !== 'ok' ? t('setup.h.authFail', { code: r.code }) : '')}
    ${row(r.db === 'ok', t('setup.r.db'), r.db === 'timeout' ? t('setup.h.dbTimeout') : r.db !== 'ok' ? t('setup.h.dbFail') : '')}
    ${row(r.rules === 'ok', t('setup.r.rules'), r.rules === 'open' ? t('setup.h.rulesOpen') : r.rules === 'locked' ? t('setup.h.rulesLocked') : r.rules === 'unknown' ? t('setup.h.rulesUnknown') : '')}
  </ul>
  <h3>${esc(t('setup.file'))}</h3><pre class="setup-pre">${esc(configFile(c))}</pre>
  <div class="rg-row"><button type="button" class="btn" id="cfgDl">⬇️ ${esc(t('setup.download'))}</button><button type="button" class="btn-sec" id="cfgCopy">📋 ${esc(t('setup.copy'))}</button></div>
  <p class="muted small">${esc(t('setup.next'))}</p>`;
  $('#cfgDl').addEventListener('click', () => downloadFile('config.js', configFile(c), 'text/javascript'));
  $('#cfgCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(configFile(c)); toast(t('setup.copied')); } catch { toast(t('setup.copyFail'), 'warn'); } });
}

$('#cfgCheck').addEventListener('click', async (e) => {
  const c = parseConfig($('#cfgIn').value);
  const bad = configProblems(c);
  $('#cfgErr').textContent = bad.length ? t('setup.bad', { list: bad.join(', ') }) : '';
  if (bad.length) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = t('setup.checking');
  try { paint(c, await probe(c)); } finally { btn.disabled = false; btn.textContent = t('setup.check'); }
});
