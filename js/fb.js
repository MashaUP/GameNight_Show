// Collegamento a Firebase: inizializzazione, accesso anonimo e helper del database.
import {
  initializeApp, getAuth, signInAnonymously, onAuthStateChanged,
  getDatabase, ref, onValue, get, set, update, remove, push, serverTimestamp, onDisconnect
} from '../vendor/firebase.js';
import { firebaseConfig } from './config.js';

export { ref, onValue, get, set, update, remove, push, serverTimestamp };

export const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith('INCOLLA') &&
  firebaseConfig.databaseURL
);

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

/** Inizializza Firebase e fa l'accesso anonimo. Restituisce l'uid del dispositivo. */
export async function connect() {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  const auth = getAuth(app);
  const uid = await new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) { stop(); resolve(user.uid); }
    }, reject);
    signInAnonymously(auth).catch((err) => { stop(); reject(err); });
  });
  return uid;
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
    const pres = roomRef(code, `presence/${uid}`);
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
  return ref(db, path);
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
  if (code.includes('admin-restricted-operation') || code.includes('operation-not-allowed')) {
    return "L'accesso anonimo non è attivo su Firebase. Apri Authentication › Metodo di accesso e abilita “Anonimo”.";
  }
  if (code.includes('unauthorized-domain')) {
    return 'Questo indirizzo non è autorizzato su Firebase. Aggiungilo in Authentication › Impostazioni › Domini autorizzati.';
  }
  if (code.toLowerCase().includes('permission')) {
    return 'Il database ha rifiutato l’operazione. Controlla di aver pubblicato le regole di database.rules.json.';
  }
  if (code.includes('network')) {
    return 'Connessione assente. Controlla il wifi e riprova.';
  }
  return 'Qualcosa non ha funzionato (' + code + '). Ricarica la pagina e riprova.';
}
