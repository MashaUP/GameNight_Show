// Modalità dimostrativa senza Firebase (2.1, idea 80).
//
// Stesse funzioni di vendor/firebase.js usate da js/fb.js, ma il "database" è un oggetto in memoria salvato
// in localStorage di QUESTO browser: TV e telefono aperti in due schede si vedono a vicenda (evento
// "storage"), nessun dato esce dal dispositivo. Non ci sono regole: è solo per provare.
// Account Google ed email non esistono nella demo (si spiega con un errore chiaro).
// Si attiva con localStorage gnr_demo = '1' (pulsante "Prova la demo"); "Esci dalla demo" cancella tutto.
const DB_KEY = 'gnr_demo_db';
const USER_KEY = (name) => `gnr_demo_user${name ? `_${name}` : ''}`;
let tree = load();
const listeners = new Set();

function load() { try { return JSON.parse(localStorage.getItem(DB_KEY) || '{}') || {}; } catch { return {}; } }
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(tree)); } catch (e) {
    const err = new Error('Demo: spazio del browser finito (foto troppo grandi?)'); err.code = 'demo/quota'; throw err; // i18n-ok: errore tecnico
  }
}
window.addEventListener('storage', (e) => { if (e.key === DB_KEY) { tree = load(); fire(); } });

const segs = (p) => String(p || '').split('/').filter(Boolean);
const at = (p) => { let c = tree; for (const s of segs(p)) { if (c == null || typeof c !== 'object') return null; c = c[s]; } return c === undefined ? null : c; };
const sv = (v) => (Array.isArray(v) ? v.map(sv) : v && typeof v === 'object' ? (v['.sv'] ? Date.now() : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x)]))) : v);
const clean = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const o = {};
  for (const [k, x] of Object.entries(Array.isArray(v) ? Object.fromEntries(v.map((y, i) => [i, y])) : v)) { const c = clean(x); if (c !== null) o[k] = c; }
  return Object.keys(o).length ? o : null;
};
function setAt(p, v) {
  const s = segs(p);
  if (!s.length) { tree = clean(sv(v)) || {}; return; }
  let c = tree;
  for (let i = 0; i < s.length - 1; i++) { if (c[s[i]] == null || typeof c[s[i]] !== 'object') c[s[i]] = {}; c = c[s[i]]; }
  const val = clean(sv(v));
  if (val === null) delete c[s[s.length - 1]]; else c[s[s.length - 1]] = val;
  // Nodi rimasti vuoti spariscono (come in Firebase)
  for (let i = s.length - 1; i > 0; i--) { const parent = at(s.slice(0, i).join('/')); if (parent && typeof parent === 'object' && !Object.keys(parent).length) setAt(s.slice(0, i).join('/'), null); else break; }
}
const snap = (p, v) => ({ val: () => (v == null ? null : JSON.parse(JSON.stringify(v))), exists: () => v != null, key: segs(p).pop() || null });
function fire() {
  for (const l of listeners) {
    const v = at(l.path);
    const s = JSON.stringify(v);
    if (s !== l.last) { l.last = s; try { l.cb(snap(l.path, v)); } catch (e) { console.error(e); } }
  }
}

// --------------------------------------------------------------------------- app e accesso
export function initializeApp(c, name) { return { c, name: name || '' }; }
const auths = {};
const userObj = (u) => (u ? { uid: u.uid, isAnonymous: true, email: null, displayName: null, photoURL: null, providerData: [] } : null);
const readUser = (name) => { try { return JSON.parse(localStorage.getItem(USER_KEY(name)) || 'null'); } catch { return null; } };
export function getAuth(app) {
  const name = app?.name || '';
  auths[name] ||= { name, cbs: new Set(), currentUser: userObj(readUser(name)) };
  return auths[name];
}
export function onAuthStateChanged(a, cb) { a.cbs.add(cb); setTimeout(() => cb(a.currentUser), 0); return () => a.cbs.delete(cb); }
export function signInAnonymously(a) {
  let u = readUser(a.name);
  if (!u) { u = { uid: `demo${Math.random().toString(36).slice(2, 10)}${a.name ? `_${a.name}` : ''}` }; try { localStorage.setItem(USER_KEY(a.name), JSON.stringify(u)); } catch { /* niente */ } }
  a.currentUser = userObj(u);
  for (const cb of a.cbs) { try { cb(a.currentUser); } catch { /* niente */ } }
  return Promise.resolve({ user: a.currentUser });
}
export function signOut(a) { try { localStorage.removeItem(USER_KEY(a.name)); } catch { /* niente */ } a.currentUser = null; for (const cb of a.cbs) cb(null); return Promise.resolve(); }
const noAccounts = () => { const e = new Error('demo'); e.code = 'auth/operation-not-allowed'; return Promise.reject(e); };
export class GoogleAuthProvider { setCustomParameters() { return this; } static credentialFromError() { return null; } }
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export const signInWithPopup = noAccounts;
export const linkWithPopup = noAccounts;
export const linkWithCredential = noAccounts;
export const signInWithCredential = noAccounts;
export const signInWithEmailAndPassword = noAccounts;
export const sendPasswordResetEmail = noAccounts;

// --------------------------------------------------------------------------- database
export function getDatabase(app) { return { app }; }
export function ref(db, path = '') { const p = segs(path).join('/'); return { path: p, key: segs(p).pop() || null }; }
export function push(r) { const k = `-D${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; return ref(null, `${r.path}/${k}`); }
export function serverTimestamp() { return { '.sv': 'timestamp' }; }
export function onValue(r, cb) {
  if (r.path === '.info/connected') { setTimeout(() => cb(snap('connected', true)), 0); return () => {}; }
  if (r.path === '.info/serverTimeOffset') { setTimeout(() => cb(snap('o', 0)), 0); return () => {}; }
  const l = { path: r.path, cb, last: undefined };
  listeners.add(l);
  setTimeout(fire, 0);
  return () => listeners.delete(l);
}
export async function get(r) { return snap(r.path, at(r.path)); }
export async function set(r, v) { setAt(r.path, v); save(); fire(); }
export async function update(r, v) { for (const [k, x] of Object.entries(v || {})) setAt(r.path ? `${r.path}/${k}` : k, x); save(); fire(); }
export async function remove(r) { setAt(r.path, null); save(); fire(); }
const onDisc = [];
window.addEventListener('pagehide', () => { if (!onDisc.length) return; for (const [p, v] of onDisc) setAt(p, v); try { save(); } catch { /* niente */ } });
export function onDisconnect(r) { return { remove: () => { onDisc.push([r.path, null]); return Promise.resolve(); }, set: (v) => { onDisc.push([r.path, v]); return Promise.resolve(); } }; }

/** Esce dalla demo: cancella database e utenti della demo da questo browser. */
export function wipeDemo() {
  try {
    for (const k of Object.keys(localStorage)) if (k === DB_KEY || k.startsWith('gnr_demo')) localStorage.removeItem(k);
  } catch { /* niente */ }
}
