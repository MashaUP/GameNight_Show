// Finto Firebase per i test end-to-end (lo serve tests/e2e/server.mjs al posto di vendor/firebase.js).
// Stesse funzioni usate da js/fb.js; lo stato sta nel server, ogni pagina lo legge ogni 200 ms.
const BASE = '/__db';
let tree = null, version = -1;
const listeners = new Set();
const cid = Math.random().toString(36).slice(2);
let connected = false;
const connListeners = new Set();
function setConnected(v) { if (v === connected) return; connected = v; for (const cb of connListeners) cb({ val: () => v, exists: () => true, key: 'connected' }); }
let uid = sessionStorage.getItem('fake_uid');
if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('fake_uid', uid); }
// Ogni app ha il suo utente (come telefoni diversi): l'app principale usa uid, le altre uid_nome.
const appUid = (app) => (app && app.name ? uid + '_' + app.name : uid);
export function initializeApp(c, name) { return { c, name: name || '' }; }
export function getAuth(app) { return { app }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb({ uid: appUid(a?.app) }), 0); return () => {}; }
export function signInAnonymously(a) { return Promise.resolve({ user: { uid: appUid(a?.app) } }); }
export function getDatabase(app) { return { app }; }
export function ref(db, path) { if (path === '') throw new Error('child failed: path argument was an invalid path = "". Paths must be non-empty strings'); if (path === undefined) path = ''; const p = String(path).replace(/^\/+|\/+$/g, ''); return { path: p, key: p.split('/').pop(), uid: appUid(db?.app) }; }
export function push(r) { const k = '-N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); return { ...ref(null, r.path + '/' + k), uid: r.uid }; }
export function serverTimestamp() { return { '.sv': 'timestamp' }; }
const sv = (v) => Array.isArray(v) ? v.map(sv) : (v && typeof v === 'object') ? (v['.sv'] ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x)]))) : v;
const at = (t, path) => { let c = t; for (const s of path.split('/').filter(Boolean)) { if (c == null || typeof c !== 'object') return null; c = c[s]; } return c === undefined ? null : c; };
const snap = (path, v) => ({ val: () => v == null ? null : JSON.parse(JSON.stringify(v)), exists: () => v != null, key: path.split('/').pop() });
function fire() { for (const l of listeners) { const v = at(tree, l.path); const s = JSON.stringify(v); if (s !== l.last) { l.last = s; try { l.cb(snap(l.path, v)); } catch (e) { console.error(e); } } } }
function apply(j) { if (j.version !== version) { version = j.version; tree = j.tree || {}; fire(); } }
// Come il vero SDK: senza rete la scrittura resta in coda (e si vede subito in locale), poi parte da sola.
function localApply(op, path, value) {
  if (tree === null) return;
  const t = JSON.parse(JSON.stringify(tree));
  const setAt = (p, v) => { const segs = p.split('/').filter(Boolean); if (!segs.length) return; let c = t; for (let i = 0; i < segs.length - 1; i++) { if (c[segs[i]] == null || typeof c[segs[i]] !== 'object') c[segs[i]] = {}; c = c[segs[i]]; } const last = segs[segs.length - 1]; if (v === null || v === undefined) delete c[last]; else c[last] = JSON.parse(JSON.stringify(v)); };
  if (op === 'set') setAt(path, value); else for (const [k, v] of Object.entries(value || {})) setAt(path ? path + '/' + k : k, v);
  tree = t; fire();
}
async function post(op, path, value, who) {
  const v = sv(value);
  let applied = false;
  for (;;) {
    let j;
    try { const r = await fetch(BASE, { method: 'POST', body: JSON.stringify({ op, path, value, uid: who || uid }) }); j = await r.json(); }
    catch (e) { if (!applied) { applied = true; localApply(op, path, v); } await new Promise((res) => setTimeout(res, 400)); continue; }
    if (j.error) { const e = new Error(j.error); e.code = 'PERMISSION_DENIED'; throw e; }
    apply(j); return;
  }
}
async function poll() { try { const r = await fetch(BASE + '?since=' + version + '&cid=' + cid); apply(await r.json()); setConnected(true); } catch (e) { setConnected(false); } setTimeout(poll, 200); }
poll();
export function onDisconnect(r) {
  const reg = (value) => fetch(BASE, { method: 'POST', body: JSON.stringify({ op: 'ondisc', cid, path: r.path, value }) }).then(() => {});
  return { remove: () => reg(null), set: (v) => reg(v) };
}
export function onValue(r, cb) {
  if (r.path === '.info/connected') { connListeners.add(cb); setTimeout(() => cb({ val: () => connected, exists: () => true, key: 'connected' }), 0); return () => connListeners.delete(cb); }
  const l = { path: r.path, cb, last: undefined }; listeners.add(l); if (tree !== null) fire(); return () => listeners.delete(l);
}
export async function get(r) {
  const res = await fetch(BASE, { method: 'POST', body: JSON.stringify({ op: 'read', path: r.path, uid: r.uid || uid }) });
  const j = await res.json();
  if (j.error) { const e = new Error(j.error); e.code = 'PERMISSION_DENIED'; throw e; }
  return snap(r.path, j.value);
}
export const set = (r, v) => post('set', r.path, v, r.uid);
export const update = (r, v) => post('update', r.path, v, r.uid);
export const remove = (r) => post('set', r.path, null, r.uid);
