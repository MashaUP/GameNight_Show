// Account permanente del giocatore (2.0): Google o email e password, sopra al profilo personale.
//
// Come funziona
// - Ogni dispositivo parte con una sessione anonima di Firebase (uid del dispositivo).
// - "Collega un account" aggancia Google o email alla sessione anonima: l'uid NON cambia, quindi stanze,
//   voti, profilo e armadi restano dove sono. Nel database si scrive accounts/<uid> = { pid, key }: il
//   profilo personale (people/<pid>) e la sua chiave, leggibili solo dall'account stesso.
// - Su un altro dispositivo si "Entra" nell'account: l'uid diventa quello dell'account (lo stesso ovunque),
//   la pagina legge accounts/<uid> e collega il profilo personale con la sua chiave. Se su quel dispositivo
//   c'era già un altro profilo, lo unisce (gruppi e armadi sommati, aspetto più recente): niente si perde.
// - Mai unioni per nome: si collegano solo profili di cui il dispositivo ha la chiave.
// - Prima di cambiare uid, se il dispositivo è in una serata, lascia un "passaggio" (handover) nella stanza:
//   dopo il cambio il telefono chiede il suo posto con quel gettone e la TV lo sposta da sola (regole verificate).
//
// L'accesso con Google usa una finestra (popup): nell'app Android (WebView) Google non lo permette, quindi lì
// si usa email e password (stesso account, se l'email è la stessa che si sceglie nel browser).
import {
  connect, dbRef, roomRef, get, set, accountInfo, accountGoogle, accountRegister, accountLogin, accountReset, accountSignOut
} from './fb.js';
import { Person, lookOf } from './person.js';
import { randomCode, cleanName, normalizeCode } from './util.js';
import { isApp } from './native.js';
import { t } from './i18n.js';

const HANDOVER = 'gnr_handover';
const CODE6 = /^[A-Z0-9]{6}$/;
const CODE8 = /^[A-Z0-9]{8}$/;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* niente */ } }
};

/** Google si può usare qui? (no nell'app Android: la WebView non apre la finestra di Google) */
export const googleAvailable = () => !isApp();

/** Controllo leggero dell'email e della password prima di chiamare Firebase. */
export function checkCredentials(email, password, { register = false } = {}) {
  const e = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return 'acc.err.email';
  if (register && String(password || '').length < 6) return 'acc.err.weak';
  if (!register && !String(password || '')) return 'acc.err.wrong';
  return '';
}

/**
 * Prima di un cambio di uid: per la serata in cui questo dispositivo gioca, un gettone nella stanza
 * (rooms/<codice>/handover/<uid vecchio>) e una nota locale per ritrovare il posto dopo.
 */
export async function prepareHandover(uid) {
  const room = normalizeCode(ls.get('gnr_room'));
  if (room.length !== 4 || !uid) return null;
  try {
    const me = (await get(roomRef(room, `players/${uid}`))).val();
    if (!me) return null;
    const token = randomCode(16);
    await set(roomRef(room, `handover/${uid}`), token);
    const h = { room, oldUid: uid, token, at: Date.now() };
    ls.set(HANDOVER, JSON.stringify(h));
    return h;
  } catch { return null; }
}

/** Passaggio in sospeso per questa stanza (valido 12 ore), se l'uid è cambiato. */
export function pendingHandover(room, uid) {
  try {
    const h = JSON.parse(ls.get(HANDOVER) || 'null');
    if (!h || h.room !== room || h.oldUid === uid || Date.now() - h.at > 12 * 3600e3) return null;
    return h;
  } catch { return null; }
}
export function clearHandover() { ls.set(HANDOVER, null); }

/**
 * Dopo l'accesso: collega account e profilo personale.
 * snapshot: copia del profilo che il dispositivo aveva prima del cambio (per unirlo, perché dopo il cambio
 * di uid il vecchio profilo potrebbe non essere più leggibile).
 */
export async function finishSignIn(res, snapshot = null) {
  const uid = await connect();
  Person.uid = uid;
  let acc = null;
  try { acc = (await get(dbRef(`accounts/${uid}`))).val(); } catch { acc = null; }
  if (acc?.pid && CODE6.test(acc.pid) && CODE8.test(acc.key || '')) {
    // L'account ha già un profilo: questo dispositivo lo usa (unendo quello che aveva).
    const mine = Person.local();
    if (mine?.pid !== acc.pid) await Person.linkWith(acc.pid, acc.key, { old: snapshot });
    else await Person.load().catch(() => null);
    return { profile: 'joined', pid: acc.pid };
  }
  // Primo accesso a questo account: il profilo di questo dispositivo diventa quello dell'account.
  let loc = Person.local();
  if (loc) {
    const d = await Person.load().catch(() => null);
    if (!d?.info) { await Person.claim(loc.pid, loc.key).catch(() => {}); await Person.load().catch(() => null); }
  } else {
    const info = accountInfo();
    const base = snapshot?.info || { name: cleanName(info?.name || (info?.email || '').split('@')[0], 16) || t('person.defaultName'), seed: randomCode(6).toLowerCase() };
    await Person.create(lookOf(base), snapshot ? { groups: snapshot.groups, armadi: snapshot.armadi } : {});
    loc = Person.local();
  }
  loc = Person.local();
  if (loc) await set(dbRef(`accounts/${uid}`), { pid: loc.pid, key: loc.key, at: Date.now() });
  return { profile: res?.kind === 'linked' ? 'linked' : 'created', pid: loc?.pid || '' };
}

/** Copia del profilo attuale, prima di un possibile cambio di uid. */
function snapshotPerson() {
  const d = Person.data;
  return d?.info ? { info: d.info, groups: d.groups || {}, alts: d.alts || {}, armadi: d.armadi || {} } : null;
}

async function withHandover(fn) {
  const uid = await connect();
  const snap = snapshotPerson();
  await prepareHandover(uid);
  const res = await fn();
  if (res.kind !== 'switched') clearHandover();
  const out = await finishSignIn(res, snap);
  return { ...res, ...out };
}

export const Account = {
  info: () => accountInfo(),
  google: () => withHandover(() => accountGoogle()),
  register: (email, password) => withHandover(() => accountRegister(email, password)),
  login: (email, password) => withHandover(() => accountLogin(email, password)),
  reset: (email) => accountReset(email),
  /** Esce dall'account: questo dispositivo torna anonimo e si scollega dal profilo (resta sugli altri). */
  async signOut() {
    const uid = await connect();
    await prepareHandover(uid);
    Person.forget();
    await accountSignOut();
  }
};
