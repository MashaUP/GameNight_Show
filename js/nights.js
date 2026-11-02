// Eliminare una serata (1.11, richiesta 83): solo il master che l'ha creata.
//
// "Creatore" = il dispositivo che ha creato la stanza (rooms/<codice>/meta/creatorUid) oppure un altro
// dispositivo dello stesso profilo personale (meta/creatorPid). Non cambia passando la regia ad altri.
// Le stanze di prima della 1.11 non hanno il creatore: vale la TV che le guida (hostUid), come prima.
// La protezione vera è nelle regole del database (firebase/database.rules.json): qui si decide solo se
// mostrare il pulsante e si cancella tutto in un colpo.
//
// Cosa si cancella: la stanza (voti, giochi, giocatori…), il riassunto nel gruppo (classifica di sempre,
// stagioni, statistiche, Il vostro anno si ricalcolano da soli), l'album della serata, la voce
// nell'elenco delle stanze del gruppo, poi il codice regia e la serata "in corso" se puntava lì.
// 2.3: anche le tracce su questo dispositivo (storico, rientro, copie locali della TV) e un promemoria
// "eliminata": prima la TV riproponeva l'ultima serata come "interrotta" e "Riprendi" la ricreava.
// Vale anche per l'ultima serata e per quella ancora aperta sulla TV: nessun controllo lo impedisce.
// Niente cancellazione logica: un riassunto nascosto ma ancora conteggiato renderebbe incoerenti le
// statistiche. Per tornare indietro restano il backup del gruppo e le copie locali della TV.
import { dbRef, roomRef, groupRef, secretRef, get, update, remove } from './fb.js';
import { Vault } from './vault.js';

const CODE4 = /^[A-Z0-9]{4}$/;
const CODE6 = /^[A-Z0-9]{6}$/;

/** Questo dispositivo è il creatore? owner: meta della stanza o riassunto del gruppo; pid: profilo personale. */
export function isNightCreator(owner, uid, pid = '') {
  if (!owner || !uid) return false;
  if (owner.creatorUid === uid) return true;
  if (pid && owner.creatorPid && owner.creatorPid === pid) return true;
  // Stanze di prima della 1.11 (solo la stanza ha hostUid; i riassunti vecchi non dicono chi li ha creati)
  return !owner.creatorUid && Boolean(owner.hostUid) && owner.hostUid === uid;
}

/** Percorsi da cancellare insieme (un solo aggiornamento: tutto o niente). */
export function nightDeletePaths(code, gid, { roomExists = true } = {}) {
  if (!CODE4.test(code || '')) throw new Error('codice non valido'); // i18n-ok: errore interno
  const up = {};
  if (roomExists) up[`rooms/${code}`] = null;
  if (CODE6.test(gid || '')) {
    up[`groups/${gid}/nights/${code}`] = null;
    up[`groups/${gid}/rooms/${code}`] = null;
    up[`groups/${gid}/photos/${code}`] = null;
  }
  return up;
}

// 2.3: serate eliminate da questo dispositivo (solo i codici, al massimo 50). La TV non le ripropone più
// come "serata interrotta" e non offre di ricrearle dalla copia locale.
const DELETED_KEY = 'gnr_deleted_nights';
const MAX_DELETED = 50;

function readDeleted() {
  try { const l = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]'); return Array.isArray(l) ? l.filter((c) => CODE4.test(c)) : []; } catch { return []; }
}

/** Questo dispositivo ha eliminato la serata `code`? */
export function isLocallyDeleted(code) { return readDeleted().includes(code); }

/** Ricorda che la serata è stata eliminata (si usa anche quando un codice viene riusato per una stanza nuova). */
export function markDeleted(code, on = true) {
  if (!CODE4.test(code || '')) return;
  const list = readDeleted().filter((c) => c !== code);
  if (on) list.unshift(code);
  try { localStorage.setItem(DELETED_KEY, JSON.stringify(list.slice(0, MAX_DELETED))); } catch { /* niente */ }
}

/** La copia locale contiene almeno un voto? */
export function hasVotes(votes) {
  return Object.values(votes || {}).some((v) => v && typeof v === 'object' && Object.keys(v).length > 0);
}

/**
 * La serata risulta eliminata? Sì se l'ha eliminata questo dispositivo; altrimenti (eliminata da un altro
 * dispositivo, es. dal telefono) se sono spariti insieme la stanza e il riassunto nel gruppo pur avendo
 * già dei voti: una stanza scaduta lascia il riassunto, una serata eliminata no. Nel dubbio (errore di rete,
 * nessun gruppo, nessun voto) risponde false: meglio proporre una ripresa in più che perdere una serata.
 */
export async function nightWasDeleted(code, { gid = '', votes = null } = {}) {
  if (isLocallyDeleted(code)) return true;
  if (!CODE6.test(gid || '') || !hasVotes(votes)) return false;
  try {
    const [room, night] = await Promise.all([get(roomRef(code, 'meta')), get(groupRef(gid, `nights/${code}`))]);
    return !room.exists() && !night.exists();
  } catch { return false; }
}

/**
 * Toglie la serata da questo dispositivo: "Le tue serate", rientro nella serata e regia della home,
 * codice regia salvato, copie locali della TV. Così niente la ripropone dopo l'eliminazione.
 */
export function forgetLocalNight(code) {
  try {
    const list = JSON.parse(localStorage.getItem('gnr_history') || '[]');
    if (Array.isArray(list)) localStorage.setItem('gnr_history', JSON.stringify(list.filter((n) => n?.room !== code)));
    for (const key of ['gnr_room', 'gnr_host_room']) if (localStorage.getItem(key) === code) localStorage.removeItem(key);
    localStorage.removeItem(`gnr_regia_${code}`);
  } catch { /* niente */ }
  markDeleted(code);
  return Vault.drop(code).catch(() => {});
}

/**
 * Cancella la serata. Lancia l'errore del database se le regole la rifiutano (permission_denied):
 * in quel caso non è cambiato niente. Restituisce { room, night } (cosa c'era).
 */
export async function deleteNight(code, gid) {
  const roomExists = (await get(roomRef(code, 'meta')).catch(() => null))?.exists() || false;
  const night = CODE6.test(gid || '') ? (await get(groupRef(gid, `nights/${code}`)).catch(() => null))?.exists() || false : false;
  await update(dbRef(''), nightDeletePaths(code, gid, { roomExists }));
  // Dopo: codice regia (si toglie solo a stanza sparita) e serata "in corso" del gruppo, se era questa.
  await remove(secretRef(code)).catch(() => {});
  if (CODE6.test(gid || '')) {
    const cur = (await get(groupRef(gid, 'current')).catch(() => null))?.val();
    if (cur?.room === code) await remove(groupRef(gid, 'current')).catch(() => {});
  }
  await forgetLocalNight(code);
  return { room: roomExists, night };
}
