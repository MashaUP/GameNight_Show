// Finto Firebase per i test end-to-end (lo serve tests/e2e/server.mjs al posto di vendor/firebase.js).
// Stesse funzioni usate da js/fb.js; lo stato sta nel server, ogni pagina lo legge ogni 200 ms.
const BASE = '/__db';
let tree = null, version = -1;
const listeners = new Set();
const cid = Math.random().toString(36).slice(2);
let connected = false;
const connListeners = new Set();
function setConnected(v) { if (v === connected) return; connected = v; for (const cb of connListeners) cb({ val: () => v, exists: () => true, key: 'connected' }); }
// Utenti per app (come il vero SDK): di base ogni scheda è un dispositivo a sé (sessionStorage); con
// localStorage "fake_shared" = "1" le schede dello stesso browser condividono l'utente, come Firebase vero.
const store = () => (localStorage.getItem('fake_shared') === '1' ? localStorage : sessionStorage);
const keyOf = (name) => 'fake_user' + (name ? '_' + name : '');
const legacy = sessionStorage.getItem('fake_uid');
function loadUser(name) {
  try { const u = JSON.parse(store().getItem(keyOf(name)) || 'null'); if (u?.uid) return u; } catch (e) { /* niente */ }
  return null;
}
function saveUser(name, u) { if (u) store().setItem(keyOf(name), JSON.stringify(u)); else store().removeItem(keyOf(name)); }
const newUid = () => 'u' + Math.random().toString(36).slice(2, 10);
const appName = (a) => (a && a.name ? a.name : '');
const authOf = {};
const userObj = (u) => (u ? { uid: u.uid, isAnonymous: !u.prov || u.prov === 'anonymous', email: u.email || null, displayName: u.name || null, photoURL: null, providerData: u.prov && u.prov !== 'anonymous' ? [{ providerId: u.prov }] : [] } : null);
function current(name) { return loadUser(name); }
const curUid = (name) => current(name)?.uid || '';
const curProv = (name) => current(name)?.prov || 'anonymous';
function emit(name) { const a = authOf[name]; if (!a) return; a.currentUser = userObj(current(name)); for (const cb of a.cbs) { try { cb(a.currentUser); } catch (e) { console.error(e); } } }
export function initializeApp(c, name) { return { c, name: name || '' }; }
export function getAuth(app) {
  const name = appName(app);
  if (!authOf[name]) {
    authOf[name] = { app, name, cbs: new Set(), currentUser: null };
    // Compatibilità con i test scritti prima della 2.0: l'utente della scheda resta quello di prima.
    if (!name && legacy && !loadUser('')) saveUser('', { uid: legacy, prov: 'anonymous' });
    if (name && legacy && !loadUser(name)) saveUser(name, { uid: legacy + '_' + name, prov: 'anonymous' });
  }
  authOf[name].currentUser = userObj(current(name));
  return authOf[name];
}
export function onAuthStateChanged(a, cb) { a.cbs.add(cb); setTimeout(() => cb(userObj(current(a.name))), 0); return () => a.cbs.delete(cb); }
export function signInAnonymously(a) {
  let u = current(a.name);
  if (!u) { u = { uid: newUid() + (a.name ? '_' + a.name : ''), prov: 'anonymous' }; saveUser(a.name, u); if (!a.name && !sessionStorage.getItem('fake_uid')) sessionStorage.setItem('fake_uid', u.uid); }
  emit(a.name);
  return Promise.resolve({ user: userObj(u) });
}
export function signOut(a) { saveUser(a.name, null); emit(a.name); return Promise.resolve(); }
async function authCall(body) {
  const r = await fetch('/__auth', { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) { const e = new Error(j.error); e.code = 'auth/' + j.error; if (j.email) { e.customData = { email: j.email }; e._cred = { providerId: 'google.com', email: j.email }; } throw e; }
  return j;
}
function become(a, j, prov) { const u = { uid: j.uid, prov, email: j.email, name: j.name || '' }; saveUser(a.name, u); emit(a.name); return { user: userObj(u) }; }
export class GoogleAuthProvider {
  constructor() { this.providerId = 'google.com'; }
  setCustomParameters() { return this; }
  static credentialFromError(e) { return e && e._cred ? e._cred : null; }
}
export const EmailAuthProvider = { credential: (email, password) => ({ providerId: 'password', email, password }) };
const googleEmail = () => { const e = localStorage.getItem('fake_google'); if (!e) { const x = new Error('popup closed'); x.code = 'auth/popup-closed-by-user'; throw x; } return e; };
export async function linkWithPopup(user, provider) {
  const a = Object.values(authOf).find((x) => x.currentUser?.uid === user.uid);
  const email = googleEmail();
  const j = await authCall({ op: 'link', uid: user.uid, email, prov: 'google.com' });
  return become(a, j, 'google.com');
}
export async function signInWithPopup(a) { const email = googleEmail(); const j = await authCall({ op: 'signin', email, prov: 'google.com' }); return become(a, j, 'google.com'); }
export async function signInWithCredential(a, cred) { const j = await authCall({ op: 'signin', email: cred.email, prov: cred.providerId, password: cred.password }); return become(a, j, cred.providerId); }
export async function linkWithCredential(user, cred) {
  const a = Object.values(authOf).find((x) => x.currentUser?.uid === user.uid);
  if (String(cred.password || '').length < 6) { const e = new Error('weak'); e.code = 'auth/weak-password'; throw e; }
  const j = await authCall({ op: 'link', uid: user.uid, email: cred.email, password: cred.password, prov: 'password' });
  return become(a, j, 'password');
}
export async function signInWithEmailAndPassword(a, email, password) { const j = await authCall({ op: 'signin', email, password, prov: 'password' }); return become(a, j, 'password'); }
export async function sendPasswordResetEmail(a, email) { await authCall({ op: 'reset', email }); }
// Uid con cui la pagina parla al server: quello attuale dell'app del riferimento.
const appUid = (app) => curUid(appName(app));
const appProv = (app) => curProv(appName(app));
export function getDatabase(app) { return { app }; }
export function ref(db, path) { if (path === '') throw new Error('child failed: path argument was an invalid path = "". Paths must be non-empty strings'); if (path === undefined) path = ''; const p = String(path).replace(/^\/+|\/+$/g, ''); return { path: p, key: p.split('/').pop(), app: db?.app || null }; }
export function push(r) { const k = '-N' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); return { ...ref({ app: r.app }, r.path + '/' + k) }; }
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
async function post(op, path, value, app) {
  const v = sv(value);
  let applied = false;
  for (;;) {
    let j;
    try { const r = await fetch(BASE, { method: 'POST', body: JSON.stringify({ op, path, value, uid: appUid(app), prov: appProv(app) }) }); j = await r.json(); }
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
  const res = await fetch(BASE, { method: 'POST', body: JSON.stringify({ op: 'read', path: r.path, uid: appUid(r.app), prov: appProv(r.app) }) });
  const j = await res.json();
  if (j.error) { const e = new Error(j.error); e.code = 'PERMISSION_DENIED'; throw e; }
  return snap(r.path, j.value);
}
export const set = (r, v) => post('set', r.path, v, r.app);
export const update = (r, v) => post('update', r.path, v, r.app);
export const remove = (r) => post('set', r.path, null, r.app);
