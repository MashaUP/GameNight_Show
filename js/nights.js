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
// Niente cancellazione logica: un riassunto nascosto ma ancora conteggiato renderebbe incoerenti le
// statistiche. Per tornare indietro restano il backup del gruppo e le copie locali della TV.
import { dbRef, roomRef, groupRef, secretRef, get, update, remove } from './fb.js';

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

/** Toglie la serata dallo storico locale di questo dispositivo ("Le tue serate"). */
export function forgetLocalNight(code) {
  try {
    const list = JSON.parse(localStorage.getItem('gnr_history') || '[]');
    if (Array.isArray(list)) localStorage.setItem('gnr_history', JSON.stringify(list.filter((n) => n?.room !== code)));
  } catch { /* niente */ }
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
  forgetLocalNight(code);
  return { room: roomExists, night };
}
