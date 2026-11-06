// Collegamento a Firebase: inizializzazione, accesso anonimo e helper del database.
import { firebaseConfig } from './config.js';
import { t } from './i18n.js';
import { ErrLog } from './util.js';
import { isApp } from './native.js';

// 2.1 (idea 80): modalità dimostrativa. Con localStorage gnr_demo = '1' le stesse funzioni arrivano da
// js/demo-db.js (database solo in questo browser, niente Firebase); altrimenti dal vero SDK.
export const isDemo = (() => { try { return localStorage.getItem('gnr_demo') === '1'; } catch { return false; } })();
const FB = isDemo ? await import('./demo-db.js') : await import('../vendor/firebase.js');
const {
  initializeApp, getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged, signOut,
  GoogleAuthProvider, EmailAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential, signInWithCredential,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  getDatabase, ref, onValue, set, update, remove, push, serverTimestamp, onDisconnect
} = FB;

export { ref, onValue, set, update, remove, push, serverTimestamp };

// 2.5: nessuna attesa senza fine. La lettura una tantum di Firebase (get) non ha un limite di tempo: se la
// connessione resta appesa (rete che cambia, app Android ripresa dallo sfondo, WebView con il socket fermo)
// la promessa non finisce mai e la pagina resta sul dado che gira. Qui ogni lettura ha un tetto: allo scadere
// arriva un errore "db/timeout" che le pagine mostrano con "Ricarica"/"Riprova", e resta nel registro errori.
export const DB_TIMEOUT = 20000;
function timeoutError(what) {
  const e = new Error(`timeout: ${what}`);
  e.code = 'db/timeout';
  return e;
}
/** Promessa con un tetto di tempo (ms). Allo scadere: errore db/timeout, annotato nel registro errori. */
export function withTimeout(p, ms, what) {
  if (!ms) return p;
  let tm;
  const guard = new Promise((_, rej) => { tm = setTimeout(() => { ErrLog.add('timeout', `${what} > ${ms} ms`); rej(timeoutError(what)); }, ms); });
  return Promise.race([p, guard]).finally(() => clearTimeout(tm));
}
/** Come get() di Firebase, ma con un limite di tempo (0 = nessun limite). */
export function get(r, ms = DB_TIMEOUT) {
  const path = String(r?._path?.toString?.() || r?.path || '').replace(/[A-Z0-9]{4,}/g, '…');
  return withTimeout(FB.get(r), ms, `get ${path}`.trim());
}

/**
 * 2.5: identificativo di QUESTO dispositivo (browser o app), diverso dall'uid. Con un account lo stesso uid è
 * su PC, telefono e tablet insieme: la presenza in una stanza va tenuta per dispositivo, altrimenti chi si
 * scollega (es. il PC con "Gioca anche tu") cancella anche la presenza del telefono ancora collegato.
 */
export function deviceId() {
  try {
    let d = localStorage.getItem('gnr_dev');
    if (!/^[a-z0-9]{10}$/.test(d || '')) { d = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); localStorage.setItem('gnr_dev', d); }
    return d;
  } catch { return 'nodevice00'; }
}

export const isConfigured = isDemo || Boolean(
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith('INCOLLA') &&
  firebaseConfig.databaseURL
);

/** Entra nella demo (si ricarica la pagina). */
export function startDemo(to = 'index.html') { try { localStorage.setItem('gnr_demo', '1'); } catch { /* niente */ } location.href = to; }
/** Esce dalla demo: cancella i dati della demo da questo browser e torna alla home. */
export async function stopDemo() {
  if (isDemo) FB.wipeDemo?.();
  try { localStorage.removeItem('gnr_demo'); } catch { /* niente */ }
  location.href = 'index.html';
}
// Nastro "DEMO" su ogni pagina, con l'uscita sempre a portata di mano.
if (isDemo && typeof document !== 'undefined') {
  const put = () => {
    if (document.getElementById('demoRibbon')) return;
    const b = document.createElement('div');
    b.id = 'demoRibbon';
    b.className = 'demo-ribbon';
    b.setAttribute('role', 'status');
    b.innerHTML = `<span>🧪 ${t('demo.ribbon')}</span><button type="button" class="link-btn" id="demoExit">${t('demo.exit')}</button>`;
    document.body.appendChild(b);
    b.querySelector('#demoExit').addEventListener('click', () => { if (confirm(t('demo.exitAsk'))) stopDemo(); });
  };
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
}

let db = null;

export function getDb() {
  return db;
}

// Ora del server (per i conti alla rovescia condivisi tra TV e telefoni, anche se gli orologi non coincidono).
let timeOffset = 0;
let offsetWatch = false;
export function serverNow() {
  if (!offsetWatch && db) {
    offsetWatch = true;
    try { onValue(ref(db, '.info/serverTimeOffset'), (s) => { timeOffset = Number(s.val()) || 0; }); } catch { /* niente */ }
  }
  return Date.now() + timeOffset;
}

// ---------------------------------------------------------------------------
// Sessioni (2.0): la regia e il giocatore non condividono più l'identità del browser.
//
// Firebase ricorda l'utente per origine: TV (host.html) e telefono (play.html) aperti nello stesso
// browser erano lo stesso uid, cioè "regia" e "giocatore" della stessa stanza insieme. Ora la pagina
// della TV usa una sessione sua (app Firebase con nome "gn-regia", uid separato e persistente su quel
// dispositivo); le altre pagine usano la sessione del giocatore, che può diventare un account permanente
// (Google o email). Il ruolo nella stanza resta esplicito nel database: meta/hostUid (regia),
// cohosts/<uid> (telefoni regia), players/<uid> (giocatori). Vedi docs/SVILUPPO.md, "Identità e sessioni".
// ---------------------------------------------------------------------------

let session = 'player';
let app = null;
let auth = null;
let ready = null;
const userListeners = new Set();

/** Sceglie la sessione della pagina prima del primo collegamento ('player' o 'regia'). */
export function useSession(name) {
  if (ready) return;
  session = name === 'regia' ? 'regia' : 'player';
}
export const currentSession = () => session;

/**
 * 2.5: nell'app Android (WebView di Capacitor, pagine su https://localhost) getAuth() prepara anche l'accesso
 * con finestra/redirect di Google, che carica un iframe da <progetto>.firebaseapp.com e ASPETTA quell'iframe
 * prima di dire chi è l'utente salvato. Con la rete lenta o assente l'attesa non finisce: la prima risposta di
 * onAuthStateChanged non arriva e la pagina resta sul dado che gira. Nell'app Google non si usa (finestra non
 * permessa), quindi lì l'accesso si inizializza senza quel pezzo: utente salvato in IndexedDB (o localStorage).
 */
function authFor(a) {
  if (isApp() && initializeAuth && indexedDBLocalPersistence) {
    try { return initializeAuth(a, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }); } catch { /* già inizializzato */ }
  }
  return getAuth(a);
}

/** Primo stato dell'accesso (dopo aver letto l'utente salvato sul dispositivo). */
function firstUser(a) {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(a, (u) => { stop(); resolve(u || null); }, reject);
  });
}

/**
 * Inizializza Firebase e restituisce l'uid della sessione. Se sul dispositivo c'è già un utente (anonimo o
 * account) lo riusa: l'accesso anonimo parte solo se non c'è nessuno (prima un account veniva sostituito).
 */
export async function connect() {
  if (!ready) {
    ready = (async () => {
      app = session === 'regia' ? initializeApp(firebaseConfig, 'gn-regia') : initializeApp(firebaseConfig);
      db = getDatabase(app);
      auth = authFor(app);
      // 2.5: anche la lettura dell'utente salvato ha un tetto (memoria del browser bloccata o lenta).
      const user = await withTimeout(firstUser(auth), DB_TIMEOUT, 'auth');
      if (!user) await signInAnonymously(auth);
      onAuthStateChanged(auth, (u) => { for (const cb of userListeners) { try { cb(accountInfo(u)); } catch { /* niente */ } } });
    })();
    ready.catch(() => { ready = null; });
  }
  await ready;
  // Sempre l'utente di adesso: dopo l'accesso a un account l'uid può essere cambiato.
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

/** Chi è collegato in questa sessione: { uid, anonymous, provider, email, name, photo } oppure null. */
export function accountInfo(u = auth?.currentUser) {
  if (!u) return null;
  const prov = u.isAnonymous ? 'anonymous' : (u.providerData?.[0]?.providerId || 'password');
  return { uid: u.uid, anonymous: Boolean(u.isAnonymous), provider: prov, email: u.email || '', name: u.displayName || '', photo: u.photoURL || '' };
}
export function onAccountChange(cb) { userListeners.add(cb); return () => userListeners.delete(cb); }

/**
 * Account con Google. Dal dispositivo anonimo l'account si "aggancia" allo stesso uid (non si perde niente);
 * se quell'account Google esiste già (creato su un altro dispositivo) si entra nell'account: l'uid cambia.
 * Restituisce { kind: 'linked'|'switched'|'signedIn', oldUid, uid }.
 */
export async function accountGoogle() {
  await connect();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const oldUid = auth.currentUser?.uid || '';
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    const r = await signInWithPopup(auth, provider);
    return { kind: r.user.uid === oldUid ? 'signedIn' : 'switched', oldUid, uid: r.user.uid };
  }
  try {
    const r = await linkWithPopup(auth.currentUser, provider);
    return { kind: 'linked', oldUid, uid: r.user.uid };
  } catch (err) {
    const code = String(err?.code || '');
    if (code.includes('credential-already-in-use') || code.includes('email-already-in-use')) {
      const cred = GoogleAuthProvider.credentialFromError(err);
      if (!cred) throw err;
      const r = await signInWithCredential(auth, cred);
      return { kind: 'switched', oldUid, uid: r.user.uid };
    }
    throw err;
  }
}

/** Nuovo account con email e password: si aggancia al dispositivo attuale (stesso uid). */
export async function accountRegister(email, password) {
  await connect();
  const oldUid = auth.currentUser?.uid || '';
  const cred = EmailAuthProvider.credential(String(email).trim(), String(password));
  if (auth.currentUser && !auth.currentUser.isAnonymous) throw Object.assign(new Error('already'), { code: 'auth/already-signed-in' });
  const r = await linkWithCredential(auth.currentUser, cred);
  return { kind: 'linked', oldUid, uid: r.user.uid };
}

/** Entra in un account esistente con email e password (su questo dispositivo l'uid diventa quello dell'account). */
export async function accountLogin(email, password) {
  await connect();
  const oldUid = auth.currentUser?.uid || '';
  const r = await signInWithEmailAndPassword(auth, String(email).trim(), String(password));
  return { kind: r.user.uid === oldUid ? 'signedIn' : 'switched', oldUid, uid: r.user.uid };
}

export async function accountReset(email) {
  await connect();
  await sendPasswordResetEmail(auth, String(email).trim());
}

/** Esce dall'account: il dispositivo torna a una sessione anonima nuova. */
export async function accountSignOut() {
  await connect();
  await signOut(auth);
  const r = await signInAnonymously(auth);
  return r.user.uid;
}

/** Messaggio chiaro per gli errori dell'accesso (codici auth/...). */
export function explainAuthError(err) {
  const code = String(err?.code || err?.message || '');
  const map = [
    ['popup-closed-by-user', 'acc.err.closed'], ['cancelled-popup-request', 'acc.err.closed'], ['popup-blocked', 'acc.err.popup'],
    ['operation-not-allowed', 'acc.err.disabled'], ['admin-restricted-operation', 'acc.err.disabled'], ['unauthorized-domain', 'acc.err.domain'],
    ['email-already-in-use', 'acc.err.emailUsed'], ['credential-already-in-use', 'acc.err.emailUsed'], ['invalid-credential', 'acc.err.wrong'],
    ['wrong-password', 'acc.err.wrong'], ['user-not-found', 'acc.err.wrong'], ['invalid-login-credentials', 'acc.err.wrong'],
    ['weak-password', 'acc.err.weak'], ['invalid-email', 'acc.err.email'], ['missing-email', 'acc.err.email'], ['too-many-requests', 'acc.err.tooMany'],
    ['network-request-failed', 'acc.err.network'], ['web-storage-unsupported', 'acc.err.storage'], ['already-signed-in', 'acc.err.already'],
    ['operation-not-supported-in-this-environment', 'acc.err.env']
  ];
  for (const [k, key] of map) if (code.includes(k)) return t(key);
  return t('fb.err.other', { code });
}

/**
 * Segnala lo stato della connessione di questo dispositivo (true/false).
 * Con code e uid tiene aggiornata anche la presenza nella stanza:
 * quando il dispositivo si disconnette, Firebase la toglie da solo.
 */
export function trackConnection(onStatus, code = null, uid = null) {
  return onValue(ref(db, '.info/connected'), (snap) => {
    const online = snap.val() === true;
    onStatus?.(online);
    if (!online || !code || !uid) return;
    // 2.5: presenza per dispositivo (presence/<uid>/<dispositivo>): lo stesso account su due dispositivi
    // non si cancella a vicenda. Chi legge controlla solo che presence/<uid> esista.
    const pres = roomRef(code, `presence/${uid}/${deviceId()}`);
    onDisconnect(pres).remove()
      .then(() => set(pres, true))
      .catch(() => {});
  });
}

/** Codice regia segreto della stanza (si può solo scrivere, mai leggere). */
export function secretRef(code) {
  return ref(db, `secrets/${code}`);
}

/** Profilo personale (codice di 6 caratteri). */
export function memberRef(memberId) {
  return ref(db, `members/${memberId}`);
}

/** Riferimento a un percorso dentro un gruppo (ludoteca, serate salvate). */
/** Riferimento a un percorso qualsiasi (chiavi del gruppo, profili ricordati dal telefono). */
export function dbRef(path) {
  // La radice del database (per gli aggiornamenti su più percorsi insieme): Firebase non accetta un percorso vuoto.
  const p = String(path || '').replace(/^\/+|\/+$/g, '');
  return p ? ref(db, p) : ref(db);
}

export function groupRef(groupId, path = '') {
  return ref(db, `groups/${groupId}${path ? '/' + path : ''}`);
}

/** Riferimento a un percorso dentro un armadio dei giochi (indipendente dai gruppi). */
export function armadioRef(armadioId, path = '') {
  return ref(db, `armadi/${armadioId}${path ? '/' + path : ''}`);
}

/**
 * Dove stanno i giochi: nell'armadio collegato alla stanza (meta.armadioId) oppure,
 * per le stanze create prima degli armadi, nel vecchio armadio del gruppo.
 */
export function libraryRef(meta, path = '') {
  const p = `library${path ? '/' + path : ''}`;
  if (meta?.armadioId) return armadioRef(meta.armadioId, p);
  return groupRef(meta?.groupId, p);
}

/** Riferimento a un percorso dentro la stanza. */
export function roomRef(code, path = '') {
  return ref(db, `rooms/${code}${path ? '/' + path : ''}`);
}

/** Traduce gli errori Firebase più comuni in messaggi chiari. */
export function explainError(err) {
  if (err?.user) return err.message;
  const code = String(err?.code || err?.message || err || '');
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) return t('fb.err.anon');
  if (code.includes('unauthorized-domain')) return t('fb.err.domain');
  if (code.includes('db/timeout') || code.startsWith('timeout')) return t('fb.err.timeout');
  if (code.toLowerCase().includes('permission')) return t('fb.err.permission');
  if (code.includes('network')) return t('fb.err.network');
  return t('fb.err.other', { code });
}
