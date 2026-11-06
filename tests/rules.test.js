// Prove delle regole di firebase/database.rules.json con il simulatore targaryen.
const targaryen = require('targaryen');
const rules = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'firebase', 'database.rules.json'), 'utf8'));
const P = (name, color = '#FF5A4E') => ({ name, style: 'adventurer', seed: 'abc', color });
function base(extraMeta = {}) {
  return {
    rooms: { ABCD: {
      meta: { hostUid: 'host', maxPlayers: 6, groupId: 'GRP123', ...extraMeta },
      state: { phase: 'voting', gameId: 'g1', playId: 'p1' },
      players: { p1: P('Anna'), p2: P('Bruno', '#2EC4B6') },
      games: { g1: { name: 'Dixit', status: 'voting' } },
      votes: { g1: { p2: { overall: 7 } } }
    } },
    secrets: { ABCD: 'REGIA123' },
    groups: { GRP123: { info: { name: 'Amici', ownerUid: 'owner' }, nights: { OLD1: { at: 1, games: {} } }, uids: { p1: true, p2: true } } }
  };
}
let fail = 0, n = 0;
function check(label, data, uid, op, path, value, expect) {
  n++;
  let db = targaryen.database(rules, data).with({ debug: false });
  db = uid ? db.as({ uid }) : db;
  const res = op === 'update' ? db.update(path, value) : op === 'read' ? db.read(path) : db.write(path, value);
  const ok = res.allowed === expect;
  if (!ok) { fail++; console.log(`✗ ${label}: atteso ${expect ? 'permesso' : 'negato'}, ottenuto ${res.allowed}`); }
  else console.log(`✓ ${label}`);
}
const R = '/rooms/ABCD';
// Ingresso e stanza chiusa
check('nuovo giocatore entra (stanza aperta)', base(), 'p3', 'set', `${R}/players/p3`, P('Carla', '#7B5CFA'), true);
check('nuovo giocatore NON entra (stanza chiusa)', base({ locked: true }), 'p3', 'set', `${R}/players/p3`, P('Carla', '#7B5CFA'), false);
check('chi è già dentro si aggiorna anche a stanza chiusa', base({ locked: true }), 'p1', 'set', `${R}/players/p1`, { ...P('Anna'), away: true }, true);
check('la TV aggiunge un giocatore a stanza chiusa (rientro confermato)', base({ locked: true }), 'host', 'set', `${R}/players/p9`, P('Anna'), true);
check('espulso non rientra', base({ banned: { p3: 'Carla' } }), 'p3', 'set', `${R}/players/p3`, P('Carla', '#7B5CFA'), false);
check('espulso non chiede il rientro', base({ banned: { p3: 'Carla' } }), 'p3', 'set', `${R}/claims/p3`, { target: 'p1' }, false);
check('richiesta di rientro a stanza chiusa (la TV conferma)', base({ locked: true }), 'p3', 'set', `${R}/claims/p3`, { target: 'p1' }, true);
check('colore non valido rifiutato', base(), 'p3', 'set', `${R}/players/p3`, P('Carla', 'red;position:fixed'), false);
check('foto con virgolette rifiutata', base(), 'p3', 'set', `${R}/players/p3`, { ...P('Carla', '#7B5CFA'), photo: 'data:image/png" onerror="alert(1)' }, false);
check('foto normale accettata', base(), 'p3', 'set', `${R}/players/p3`, { ...P('Carla', '#7B5CFA'), photo: 'data:image/jpeg;base64,AAAA' }, true);
check('nome troppo lungo rifiutato', base(), 'p3', 'set', `${R}/players/p3`, P('X'.repeat(17), '#7B5CFA'), false);
check('non si scrive il posto di un altro', base(), 'p2', 'set', `${R}/players/p1`, P('Hacker'), false);
// Voti
check('voto del giocatore', base(), 'p1', 'set', `${R}/votes/g1/p1`, { overall: 8 }, true);
check('voto di chi non è giocatore (espulso)', base(), 'p3', 'set', `${R}/votes/g1/p3`, { overall: 8 }, false);
check('voto fuori scala', base(), 'p1', 'set', `${R}/votes/g1/p1`, { overall: 11 }, false);
check('voto per conto di un altro', base(), 'p1', 'set', `${R}/votes/g1/p2`, { overall: 1 }, false);
// Battito
check('battito del proprio telefono', base(), 'p1', 'set', `${R}/hb/p1`, 123, true);
check('battito per un altro', base(), 'p1', 'set', `${R}/hb/p2`, 123, false);
check('battito di chi non è in stanza', base(), 'p3', 'set', `${R}/hb/p3`, 123, false);
check('la TV toglie un battito', base(), 'host', 'set', `${R}/hb/p1`, null, true);
// Meta: stanza chiusa, espulsioni, safe mode
check('la TV chiude la stanza', base(), 'host', 'update', `${R}/meta`, { locked: true }, true);
check('un giocatore NON chiude la stanza', base(), 'p1', 'update', `${R}/meta`, { locked: true }, false);
check('un giocatore NON si toglie dagli espulsi', base({ banned: { p3: 'Carla' } }), 'p3', 'set', `${R}/meta/banned/p3`, null, false);
check('espulsione dalla TV (aggiornamento multiplo)', base(), 'host', 'update', R, { 'players/p2': null, 'claims/p2': null, 'hb/p2': null, 'meta/banned/p2': 'Bruno', 'votes/g1/p2': null }, true);
check('la TV accende la Safe Mode', base(), 'host', 'update', `${R}/meta`, { safeMode: true }, true);
check('la TV imposta il timer del voto', base(), 'host', 'update', `${R}/meta`, { voteSeconds: 90, voteAuto: true }, true);
check('timer del voto fuori misura', base(), 'host', 'update', `${R}/meta`, { voteSeconds: 99999 }, false);
check('timer del voto non numerico', base(), 'host', 'update', `${R}/meta`, { voteSeconds: '90' }, false);
check('un telefono non cambia il timer', base(), 'p1', 'update', `${R}/meta`, { voteSeconds: 10 }, false);
// Ripristino dalla macchina del tempo (per singolo gioco)
check('ripristino giochi e voti dalla TV', base(), 'host', 'update', R, { 'games/g1': { name: 'Dixit', status: 'revealed' }, 'votes/g1': { p1: { overall: 8 } }, 'games/g2': null, 'votes/g2': null, state: { phase: 'idle', at: 1 } }, true);
check('un giocatore NON ripristina', base(), 'p1', 'update', R, { 'games/g1': null }, false);
// Regia: comandi
check('comando da chi non è regia', base(), 'p1', 'set', `${R}/commands/c1`, { type: 'kick', args: { uid: 'p2' } }, false);
check('comando dalla regia (cohost)', { ...base(), rooms: { ABCD: { ...base().rooms.ABCD, cohosts: { p1: true } } } }, 'p1', 'set', `${R}/commands/c1`, { type: 'kick', args: { uid: 'p2' } }, true);
// Gruppo: ripristino delle serate
check('il proprietario del gruppo rimette una serata mancante', base(), 'owner', 'set', '/groups/GRP123/nights/ZZZZ', { at: 5, games: {} }, true);
check('il proprietario NON sovrascrive una serata esistente', base(), 'owner', 'set', '/groups/GRP123/nights/OLD1', { at: 5, games: {} }, false);
check('un altro NON rimette serate', base(), 'p1', 'set', '/groups/GRP123/nights/ZZZZ', { at: 5, games: {} }, false);
check('una TV che non è admin NON salva serate nel gruppo', base(), 'host', 'set', '/groups/GRP123/nights/ABCD', { at: 5, games: {} }, false);
check('logo con < rifiutato', base(), 'p1', 'set', '/groups/GRP123/identity', { logo: 'data:image/svg+xml,<svg onload=alert(1)>' }, false);
check('profilo con colore non valido rifiutato', base(), 'p1', 'set', '/members/ABC123', { name: 'A', groupId: 'GRP123', style: 'adventurer', seed: 'x', color: 'url(x)' }, false);
// Vecchi profili di gruppo (members): nessuno li cancella o li sposta in un altro gruppo (1.4)
const withMember = () => ({ ...base(), members: { ABC123: { name: 'Anna', groupId: 'GRP123', style: 'adventurer', seed: 'x', color: '#FF5A4E' } } });
check('profilo di gruppo: aggiornamento del nome', withMember(), 'p1', 'update', '/members/ABC123', { name: 'Annina' }, true);
check('profilo di gruppo: un altro NON lo cancella', withMember(), 'p2', 'set', '/members/ABC123', null, false);
check('profilo di gruppo: NON si sposta in un altro gruppo', withMember(), 'p2', 'update', '/members/ABC123', { groupId: 'ALTRO1' }, false);
check('profilo di gruppo: il proprietario del gruppo lo cancella', withMember(), 'owner', 'set', '/members/ABC123', null, true);
check('profilo di gruppo nuovo', base(), 'p1', 'set', '/members/NEW123', { name: 'Carla', groupId: 'GRP123', style: 'adventurer', seed: 'x', color: '#FF5A4E' }, true);

// --- 2.6: anti-spam, gruppo solo ai membri, profili ricordati dal telefono ---
const TS = { '.sv': 'timestamp' };
const withRoom = (patch) => { const d = base(); Object.assign(d.rooms.ABCD, patch); return d; };
check('pettegolezzo con il contatore', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123', ticker: true } }), 'p1', 'update', R, { 'gossip/m1': { text: 'ciao', by: 'p1', at: TS }, 'rate/p1/gossip': TS }, true);
check('pettegolezzo senza contatore (aggira il limite)', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123', ticker: true } }), 'p1', 'set', `${R}/gossip/m1`, { text: 'ciao', by: 'p1', at: TS }, false);
check('pettegolezzo troppo presto', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123', ticker: true }, rate: { p1: { gossip: Date.now() - 2000 } } }), 'p1', 'update', R, { 'gossip/m2': { text: 'ancora', by: 'p1', at: TS }, 'rate/p1/gossip': TS }, false);
check('pettegolezzo dopo 15 s', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123', ticker: true }, rate: { p1: { gossip: Date.now() - 16000 } } }), 'p1', 'update', R, { 'gossip/m2': { text: 'ancora', by: 'p1', at: TS }, 'rate/p1/gossip': TS }, true);
check('contatore con data falsa', base(), 'p1', 'set', `${R}/rate/p1/gossip`, 1, false);
check('effetto ogni 3 s', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123', soundboard: true }, rate: { p1: { sfx: Date.now() - 1000 } } }), 'p1', 'update', R, { 'sfx/s1': { k: 'risate', by: 'p1', at: TS }, 'rate/p1/sfx': TS }, false);
check('time-out ripetuto bloccato', withRoom({ rate: { p1: { buzz: Date.now() - 5000 } } }), 'p1', 'update', R, { 'buzz/b1': { by: 'p1', at: TS }, 'rate/p1/buzz': TS }, false);
check('time-out normale', base(), 'p1', 'update', R, { 'buzz/b1': { by: 'p1', at: TS }, 'rate/p1/buzz': TS }, true);
check('la TV scrive effetti senza limiti', withRoom({ meta: { hostUid: 'host', groupId: 'GRP123' } }), 'host', 'set', `${R}/sfx/s9`, { k: 'risate', by: 'host' }, true);
const G = '/groups/GRP123';
check('membro aggiunge un gioco', base(), 'p1', 'set', `${G}/library/x1`, { name: 'Azul' }, true);
check('estraneo NON aggiunge giochi', base(), 'zz', 'set', `${G}/library/x1`, { name: 'Spam' }, false);
check('estraneo NON cambia la prossima serata', base(), 'zz', 'set', `${G}/next`, { at: 5 }, false);
check('membro risponde alla presenza', base(), 'p2', 'set', `${G}/next/rsvp/k`, { name: 'B', answer: 'si' }, true);
check('estraneo NON carica foto', base(), 'zz', 'update', G, { 'photos/ABCD/f1': { data: 'data:image/jpeg;base64,AA', uid: 'zz' }, 'rate/zz/photo': TS }, false);
check('membro carica una foto (con contatore)', base(), 'p1', 'update', G, { 'photos/ABCD/f1': { data: 'data:image/jpeg;base64,AA', uid: 'p1' }, 'rate/p1/photo': TS }, true);
check('foto a raffica bloccata', (() => { const d = base(); d.groups.GRP123.rate = { p1: { photo: Date.now() - 1000 } }; return d; })(), 'p1', 'update', G, { 'photos/ABCD/f2': { data: 'data:image/jpeg;base64,AA', uid: 'p1' }, 'rate/p1/photo': TS }, false);
check('membro NON cambia l’identità del gruppo', base(), 'p1', 'set', `${G}/identity`, { motto: 'hack' }, false);
check('il proprietario cambia l’identità', base(), 'owner', 'set', `${G}/identity`, { motto: 'ok' }, true);
check('il proprietario registra un membro', base(), 'owner', 'set', `${G}/uids/p9`, true, true);
check('un membro NON registra altri', base(), 'p1', 'set', `${G}/uids/p9`, true, false);
check('estraneo NON si registra da solo', base(), 'zz', 'set', `${G}/uids/zz`, true, false);
check('stanza di un estraneo NON scrive serate nel gruppo', (() => { const d = base(); d.rooms.EVIL = { meta: { hostUid: 'zz', groupId: 'GRP123' } }; return d; })(), 'zz', 'set', `${G}/nights/EVIL`, { at: 5, games: {} }, false);
check('stanza dell’admin scrive la serata', (() => { const d = base(); d.groups.GRP123.admins = { host: true }; return d; })(), 'host', 'set', `${G}/nights/ABCD`, { at: 5, games: {} }, true);
check('il proprietario crea la chiave del gruppo', base(), 'owner', 'set', '/groupKeys/GRP123', 'KEY12345', true);
check('estraneo NON sovrascrive la chiave', (() => { const d = base(); d.groupKeys = { GRP123: 'KEY12345' }; return d; })(), 'zz', 'set', '/groupKeys/GRP123', 'EVIL1234', false);
check('nuovo PC diventa admin con la chiave giusta', (() => { const d = base(); d.groupKeys = { GRP123: 'KEY12345' }; d.groupKeyClaims = { GRP123: { pc2: 'KEY12345' } }; return d; })(), 'pc2', 'set', `${G}/admins/pc2`, true, true);
check('chiave sbagliata: niente admin', (() => { const d = base(); d.groupKeys = { GRP123: 'KEY12345' }; d.groupKeyClaims = { GRP123: { pc2: 'WRONG123' } }; return d; })(), 'pc2', 'set', `${G}/admins/pc2`, true, false);
check('la chiave non si legge', (() => { const d = base(); d.groupKeys = { GRP123: 'KEY12345' }; return d; })(), 'zz', 'read', '/groupKeys/GRP123', null, false);
check('profilo ricordato: il telefono scrive il suo', base(), 'p1', 'set', '/deviceProfiles/p1/GRP123', 'ABC123', true);
check('profilo ricordato: non si legge quello degli altri', base(), 'p2', 'read', '/deviceProfiles/p1', null, false);
check('profilo ricordato: lo legge il suo telefono', base(), 'p1', 'read', '/deviceProfiles/p1', null, true);
// Profilo ritrovato tramite la TV (senza codice)
check('telefono nuovo chiede il suo profilo alla TV', base(), 'p7', 'set', `${R}/profileClaims/p7`, { mid: 'ABC123', name: 'Anna' }, true);
check('richiesta di profilo per conto di un altro', base(), 'p7', 'set', `${R}/profileClaims/p8`, { mid: 'ABC123', name: 'Anna' }, false);
check('espulso non chiede il profilo', base({ banned: { p7: 'X' } }), 'p7', 'set', `${R}/profileClaims/p7`, { mid: 'ABC123', name: 'Anna' }, false);
check('solo la TV concede il profilo', base(), 'p7', 'set', `${R}/profileGrants/p7`, { mid: 'ABC123' }, false);
check('la TV concede il profilo', base(), 'host', 'set', `${R}/profileGrants/p7`, { mid: 'ABC123' }, true);
// Segnapunti, tavolo, quiz, allarme intrusi, codice regia, scadenza stanze, storico privato
const idle = (extra = {}) => { const d = base(extra); d.rooms.ABCD.state = { phase: 'idle', playId: 'p9' }; return d; };
check('segnapunti: il giocatore scrive il suo punteggio', idle(), 'p1', 'set', `${R}/scores/p9/p1`, 42, true);
check('segnapunti: NON quello di un altro', idle(), 'p1', 'set', `${R}/scores/p9/p2`, 42, false);
check('segnapunti: NON su una partita chiusa', idle(), 'p1', 'set', `${R}/scores/pOLD/p1`, 42, false);
check('segnapunti: NON durante la votazione', base(), 'p1', 'set', `${R}/scores/p1/p1`, 42, false);
check('segnapunti: niente testo', idle(), 'p1', 'set', `${R}/scores/p9/p1`, 'tanti', false);
check('segnapunti: la regia corregge tutti', (() => { const d = idle(); d.rooms.ABCD.cohosts = { p2: true }; return d; })(), 'p2', 'set', `${R}/scores/p9/p1`, 10, true);
check('segnapunti: la TV corregge tutti', idle(), 'host', 'set', `${R}/scores/p9/p2`, 7, true);
check('tavolo: solo la TV', idle(), 'p1', 'set', `${R}/table`, { starter: 'p1' }, false);
check('tavolo: la TV fa le squadre', idle(), 'host', 'set', `${R}/table`, { teams: [['p1'], ['p2']] }, true);
const quiz = () => { const d = idle(); d.rooms.ABCD.quiz = { id: 'q1', open: true, q: 'Domanda?', options: ['a', 'b'] }; return d; };
check('quiz: risposta del giocatore', quiz(), 'p1', 'set', `${R}/quizAns/q1/p1`, 1, true);
check('quiz: una risposta sola', (() => { const d = quiz(); d.rooms.ABCD.quizAns = { q1: { p1: 0 } }; return d; })(), 'p1', 'set', `${R}/quizAns/q1/p1`, 1, false);
check('quiz: niente risposte a domanda chiusa', (() => { const d = quiz(); d.rooms.ABCD.quiz.open = false; return d; })(), 'p1', 'set', `${R}/quizAns/q1/p1`, 1, false);
check('quiz: niente risposte a un\'altra domanda', quiz(), 'p1', 'set', `${R}/quizAns/q0/p1`, 1, false);
check('quiz: estraneo non risponde', quiz(), 'zz', 'set', `${R}/quizAns/q1/zz`, 1, false);
check('quiz: la domanda la scrive solo la TV', quiz(), 'p1', 'set', `${R}/quiz/open`, false, false);
check('intrusi: un dispositivo segnala un tentativo', base(), 'zz', 'set', `${R}/knock/zz`, { kind: 'locked', name: 'Zio', at: TS, n: 1 }, true);
check('intrusi: non a nome di altri', base(), 'zz', 'set', `${R}/knock/p1`, { kind: 'locked', at: TS, n: 1 }, false);
check('intrusi: tipo sconosciuto', base(), 'zz', 'set', `${R}/knock/zz`, { kind: 'boh', at: TS, n: 1 }, false);
check('intrusi: a raffica bloccato', (() => { const d = base(); d.rooms.ABCD.knock = { zz: { kind: 'locked', at: Date.now() - 1000, n: 1 } }; return d; })(), 'zz', 'set', `${R}/knock/zz`, { kind: 'locked', at: TS, n: 2 }, false);
check('codice regia: la TV lo cambia', base(), 'host', 'set', '/secrets/ABCD', 'NUOVO123', true);
check('codice regia: un giocatore NON lo cambia', base(), 'p1', 'set', '/secrets/ABCD', 'NUOVO123', false);
check('codice regia: si legge? no', base(), 'p1', 'read', '/secrets/ABCD', null, false);
check('codice regia: la TV revoca la regia di un telefono', (() => { const d = base(); d.rooms.ABCD.takeover = { p2: 'REGIA123' }; return d; })(), 'host', 'set', `${R}/takeover/p2`, null, true);
check('codice regia: un giocatore NON revoca gli altri', (() => { const d = base(); d.rooms.ABCD.takeover = { p2: 'REGIA123' }; return d; })(), 'p1', 'set', `${R}/takeover/p2`, null, false);
const old = (meta = {}) => { const d = base({ createdAt: Date.now() - 40 * 86400000, ...meta }); return d; };
check('scadenza: la TV cancella la sua stanza vecchia', old(), 'host', 'set', R, null, true);
// 1.11 (richiesta 83): un altro master (admin del gruppo) NON cancella più la stanza di un altro, neanche vecchia
check('scadenza: l\'admin del gruppo NON cancella la stanza vecchia di un altro master', (() => { const d = old({ hostUid: 'altro' }); d.groups.GRP123.admins = { pc2: true }; return d; })(), 'pc2', 'set', R, null, false);
check('stanza di prima della 1.11 (senza creatore): la TV che la guida la cancella anche oggi', base({ createdAt: Date.now() - 3600000 }), 'host', 'set', R, null, true);
check('scadenza: un giocatore NON cancella stanze', old(), 'p1', 'set', R, null, false);
check('scadenza: il codice regia di una stanza sparita si toglie', (() => { const d = base(); delete d.rooms.ABCD; return d; })(), 'host', 'set', '/secrets/ABCD', null, true);
check('scadenza: NON il codice di una stanza viva', base(), 'zz', 'set', '/secrets/ABCD', null, false);
// ---------------- 1.11 · Eliminare una serata: solo il master che l'ha creata (richiesta 83) ----------------
const made = (meta = {}) => {
  const d = base({ creatorUid: 'host', createdAt: Date.now() - 3600000, ...meta });
  d.groups.GRP123.admins = { host: true, master2: true };
  d.groups.GRP123.nights.ABCD = { at: 1, games: {}, creatorUid: 'host' };
  d.groups.GRP123.rooms = { ABCD: true };
  d.groups.GRP123.photos = { ABCD: { f1: { uid: 'p1', data: 'data:image/jpeg;base64,AAAA' } } };
  d.people = { PERS01: { uids: { host: true, tablet: true } } };
  return d;
};
const wipeAll = { 'rooms/ABCD': null, 'groups/GRP123/nights/ABCD': null, 'groups/GRP123/rooms/ABCD': null, 'groups/GRP123/photos/ABCD': null };
check('serata: il creatore la cancella tutta in un colpo (stanza, riassunto, album, elenco)', made(), 'host', 'update', '/', wipeAll, true);
check('serata: un altro master (admin del gruppo) NON la cancella', made(), 'master2', 'update', '/', wipeAll, false);
check('serata: un altro master NON cancella neanche solo la stanza', made(), 'master2', 'set', R, null, false);
check('serata: un altro master NON cancella il riassunto nel gruppo', made(), 'master2', 'set', '/groups/GRP123/nights/ABCD', null, false);
check('serata: un altro master NON cancella l\'album', made(), 'master2', 'set', '/groups/GRP123/photos/ABCD', null, false);
check('serata: il proprietario del gruppo NON la cancella se non l\'ha creata', made(), 'owner', 'update', '/', wipeAll, false);
check('serata: un giocatore NON la cancella', made(), 'p1', 'update', '/', wipeAll, false);
check('serata: chi ha preso la regia (hostUid) NON la cancella se non è il creatore', made({ hostUid: 'master2' }), 'master2', 'set', R, null, false);
check('serata: il creatore la cancella anche dopo aver passato la regia', made({ hostUid: 'master2' }), 'host', 'update', '/', wipeAll, true);
check('serata: un altro dispositivo dello stesso profilo del creatore la cancella', made({ creatorPid: 'PERS01' }), 'tablet', 'update', '/', wipeAll, true);
check('serata: un dispositivo di un altro profilo NON la cancella', made({ creatorPid: 'PERS01' }), 'master2', 'update', '/', wipeAll, false);
check('serata: riassunto rimasto senza stanza: lo cancella il creatore', (() => { const d = made(); delete d.rooms.ABCD; return d; })(), 'host', 'set', '/groups/GRP123/nights/ABCD', null, true);
check('serata: riassunto rimasto senza stanza: NON un altro master', (() => { const d = made(); delete d.rooms.ABCD; return d; })(), 'master2', 'set', '/groups/GRP123/nights/ABCD', null, false);
check('serata: stanza già sparita, il creatore toglie riassunto, album ed elenco insieme', (() => { const d = made(); delete d.rooms.ABCD; return d; })(), 'host', 'update', '/', { 'groups/GRP123/nights/ABCD': null, 'groups/GRP123/rooms/ABCD': null, 'groups/GRP123/photos/ABCD': null }, true);
check('serata: stanza già sparita, un altro master NON toglie l\'album', (() => { const d = made(); delete d.rooms.ABCD; return d; })(), 'master2', 'update', '/', { 'groups/GRP123/photos/ABCD': null }, false);
// 2.3 · Serata eliminata: un dispositivo rimasto aperto non ricrea la stanza con la sua presenza
check('presenza: nella stanza che esiste si scrive', made(), 'p1', 'set', `${R}/presence/p1`, true, true);
check('presenza: in una stanza eliminata NON si scrive (niente stanza fantasma)', (() => { const d = made(); delete d.rooms.ABCD; return d; })(), 'p1', 'set', `${R}/presence/p1`, true, false);
check('presenza: si toglie anche a stanza eliminata (onDisconnect)', (() => { const d = made(); delete d.rooms.ABCD.meta; d.rooms.ABCD.presence = { p1: true }; return d; })(), 'p1', 'set', `${R}/presence/p1`, null, true);
check('creatore: si scrive alla creazione della stanza', { rooms: {} }, 'host', 'set', `${R}/meta`, { hostUid: 'host', creatorUid: 'host', maxPlayers: 6 }, true);
check('creatore: una stanza ripristinata da un backup tiene il creatore originale', { rooms: {} }, 'host', 'set', `${R}/meta`, { hostUid: 'host', creatorUid: 'altro', maxPlayers: 6 }, true);
check('creatore: NON si cambia dopo', made(), 'host', 'update', `${R}/meta`, { creatorUid: 'master2' }, false);
check('creatore: chi prende la regia NON si fa creatore', made({ hostUid: 'master2' }), 'master2', 'update', `${R}/meta`, { creatorUid: 'master2' }, false);
check('creatore: profilo collegato aggiunto dopo solo se è davvero il suo', (() => { const d = made(); d.people.PERS02 = { uids: { altro: true } }; return d; })(), 'host', 'update', `${R}/meta`, { creatorPid: 'PERS02' }, false);
check('creatore: profilo collegato aggiunto dopo, se è il suo', (() => { const d = made(); return d; })(), 'host', 'update', `${R}/meta`, { creatorPid: 'PERS01' }, true);
check('creatore nel riassunto: uguale a quello della stanza', made(), 'host', 'set', '/groups/GRP123/nights/ABCD/creatorUid', 'master2', false);
check('creatore nel riassunto: copiato dalla stanza alla prima scrittura', (() => { const d = made(); delete d.groups.GRP123.nights.ABCD; return d; })(), 'host', 'set', '/groups/GRP123/nights/ABCD', { at: 1, games: {}, creatorUid: 'host' }, true);
const priv = () => { const d = base(); d.groups.GRP123.privacy = { private: true }; return d; };
check('storico privato: il membro legge le serate', priv(), 'p1', 'read', `${G}/nights`, null, true);
check('storico privato: l\'estraneo NON legge le serate', priv(), 'zz', 'read', `${G}/nights`, null, false);
check('storico privato: l\'estraneo NON vede le foto', priv(), 'zz', 'read', `${G}/photos/ABCD`, null, false);
check('storico privato: la ludoteca resta visibile', priv(), 'zz', 'read', `${G}/library`, null, true);
check('storico pubblico: chiunque legge le serate', base(), 'zz', 'read', `${G}/nights`, null, true);
check('storico privato: lo attiva il proprietario', base(), 'owner', 'set', `${G}/privacy`, { private: true, expireDays: 30 }, true);
check('storico privato: un membro NON lo cambia', base(), 'p1', 'set', `${G}/privacy/private`, false, false);
check('privacy: campi sconosciuti rifiutati', base(), 'owner', 'set', `${G}/privacy`, { boh: 1 }, false);
// Pre-partita
check('tavolo: il giocatore segna un gioco portato', base(), 'p1', 'set', `${R}/tonight/L1/p1`, 'Anna', true);
check('tavolo: non a nome di un altro', base(), 'p1', 'set', `${R}/tonight/L1/p2`, 'Bruno', false);
check('tavolo: estraneo no', base(), 'zz', 'set', `${R}/tonight/L1/zz`, 'Zio', false);
check('tavolo: la TV segna per tutti', base(), 'host', 'set', `${R}/tonight/L1/m_ABC123`, 'Carla', true);
check('desideri: il giocatore mette una stella', base(), 'p1', 'set', `${R}/wish/p1/L1`, true, true);
check('desideri: non per un altro', base(), 'p1', 'set', `${R}/wish/p2/L1`, true, false);
check('scaletta: solo la TV', base(), 'p1', 'set', `${R}/plan`, { items: ['L1'] }, false);
check('scaletta: la TV', base(), 'host', 'set', `${R}/plan`, { items: ['L1'], minutes: 120 }, true);
check('regole: "lo conosco" del giocatore', base(), 'p1', 'set', `${R}/knows/L1/p1`, true, true);
check('regole: non per un altro', base(), 'p1', 'set', `${R}/knows/L1/p2`, true, false);
check('ludoteca: codice a barre valido', base(), 'p1', 'set', `${G}/library/L9`, { name: 'Azul', ean: '3760175513909' }, true);
check('ludoteca: codice a barre con lettere', base(), 'p1', 'set', `${G}/library/L9`, { name: 'Azul', ean: '37601X' }, false);
check('ludoteca: video solo https', base(), 'p1', 'set', `${G}/library/L9`, { name: 'Azul', video: 'javascript:alert(1)' }, false);
check('ludoteca: regole troppo lunghe', base(), 'p1', 'set', `${G}/library/L9`, { name: 'Azul', rules: 'x'.repeat(700) }, false);
check('invito: porto io', base(), 'p1', 'set', `${G}/next`, { at: 5, rsvp: { anna: { name: 'Anna', answer: 'si' } }, bring: { anna: { name: 'Anna', food: 'Pizza', games: { L1: true } } } }, true);
check('invito: porto io con campi strani', base(), 'p1', 'set', `${G}/next`, { at: 5, bring: { anna: { name: 'Anna', evil: 1 } } }, false);
// Armadio: stellina "Stasera" e pronostici solo all'inizio della partita
check('armadio: stellina Stasera', base(), 'p1', 'update', `${G}/library/L9`, { name: 'Azul', sel: true }, true);
check('armadio: Stasera non booleano', base(), 'p1', 'update', `${G}/library/L9`, { name: 'Azul', sel: 'si' }, false);
check('armadio: estraneo non aggiunge giochi', base(), 'zz', 'set', `${G}/library/L9`, { name: 'Azul' }, false);
const betBase = (startedAgo) => { const d = base(); d.rooms.ABCD.state = { phase: 'idle', playId: 'p1', playStart: Date.now() - startedAgo }; return d; };
check('pronostico nei primi minuti', betBase(60000), 'p1', 'set', `${R}/bets/p1/p1`, 'p2', true);
check('pronostico chiuso dopo 5 minuti', betBase(6 * 60000), 'p1', 'set', `${R}/bets/p1/p1`, 'p2', false);
// Armadio indipendente (senza gruppo)
const A = '/armadi/ARM001';
const armBase = () => { const d = base(); d.armadi = { ARM001: { info: { name: 'Giochi di casa', ownerUid: 'owner' }, library: { L1: { name: 'Azul' } }, uids: { p1: true } } }; d.armadioKeys = { ARM001: 'KEY12345' }; return d; };
check('armadio: si crea senza gruppo', base(), 'zz', 'set', '/armadi/NEW001/info', { name: 'I miei giochi', ownerUid: 'zz' }, true);
check('armadio: non a nome di un altro', base(), 'zz', 'set', '/armadi/NEW001/info', { name: 'I miei giochi', ownerUid: 'owner' }, false);
check('armadio: il proprietario aggiunge un gioco', armBase(), 'owner', 'set', `${A}/library/L9`, { name: 'Dixit', sel: true }, true);
check('armadio: un membro aggiunge un gioco', armBase(), 'p1', 'set', `${A}/library/L9`, { name: 'Dixit' }, true);
check('armadio: un estraneo NON aggiunge giochi', armBase(), 'zz', 'set', `${A}/library/L9`, { name: 'Dixit' }, false);
check('armadio: tutti lo consultano', armBase(), 'zz', 'read', `${A}/library`, null, true);
check('armadio: con la chiave si diventa autorizzati', (() => { const d = armBase(); d.armadioKeyClaims = { ARM001: { zz: 'KEY12345' } }; return d; })(), 'zz', 'set', `${A}/admins/zz`, true, true);
check('armadio: chiave sbagliata', (() => { const d = armBase(); d.armadioKeyClaims = { ARM001: { zz: 'WRONG123' } }; return d; })(), 'zz', 'set', `${A}/admins/zz`, true, false);
check('armadio: solo il proprietario scrive la chiave', armBase(), 'zz', 'set', '/armadioKeys/ARM001', 'HACK1234', false);
check('armadio: il proprietario registra i membri', armBase(), 'owner', 'set', `${A}/uids/p2`, true, true);
check('armadio: campi sconosciuti rifiutati', armBase(), 'owner', 'set', `${A}/boh`, 1, false);
check('stanza collegata a un armadio', base(), 'host', 'update', `${R}/meta`, { armadioId: 'ARM001', armadioName: 'Giochi di casa' }, true);
check('stanza: codice armadio non valido', base(), 'host', 'update', `${R}/meta`, { armadioId: '<x>' }, false);

// Profilo personale (lo stesso su sito, telefono e app): solo i dispositivi collegati lo leggono e lo modificano
const ME = (uid = 'dev1', extra = {}) => ({ name: 'Andrea', style: 'adventurer', seed: 'abc', color: '#FF5A4E', ownerUid: uid, updatedAt: 1, ...extra });
const personBase = () => { const d = base(); d.people = { PER001: { info: ME(), uids: { dev1: 1 }, groups: { GRP123: 'MEM001' } } }; d.personKeys = { PER001: 'KEY98765' }; return d; };
check('profilo: si crea con il primo dispositivo', base(), 'dev1', 'update', '/', { 'people/PER002/info': ME(), 'people/PER002/uids/dev1': 1 }, true);
check('profilo: non a nome di un altro dispositivo', base(), 'dev1', 'update', '/', { 'people/PER002/info': ME('altro'), 'people/PER002/uids/dev1': 1 }, false);
check('profilo: un estraneo non si aggiunge', personBase(), 'zz', 'set', '/people/PER001/uids/zz', 1, false);
check('profilo: con la chiave giusta si collega un altro dispositivo', (() => { const d = personBase(); d.personKeyClaims = { PER001: { app2: 'KEY98765' } }; return d; })(), 'app2', 'set', '/people/PER001/uids/app2', 1, true);
check('profilo: chiave sbagliata', (() => { const d = personBase(); d.personKeyClaims = { PER001: { app2: 'WRONG123' } }; return d; })(), 'app2', 'set', '/people/PER001/uids/app2', 1, false);
check('profilo: con la chiave non si collega qualcun altro', (() => { const d = personBase(); d.personKeyClaims = { PER001: { app2: 'KEY98765' } }; return d; })(), 'app2', 'set', '/people/PER001/uids/zz', 1, false);
check('profilo: lo legge un dispositivo collegato', personBase(), 'dev1', 'read', '/people/PER001', null, true);
check('profilo: un estraneo NON lo legge', personBase(), 'zz', 'read', '/people/PER001', null, false);
check('profilo: un estraneo non lo modifica', personBase(), 'zz', 'set', '/people/PER001/info', ME('dev1', { name: 'Hacker' }), false);
check('profilo: il dispositivo collegato cambia nome', personBase(), 'dev1', 'set', '/people/PER001/info', ME('dev1', { name: 'Andy', updatedAt: 2 }), true);
check('profilo: il proprietario non si cambia', personBase(), 'dev1', 'set', '/people/PER001/info', ME('altro', { updatedAt: 2 }), false);
check('profilo: colore non valido', personBase(), 'dev1', 'set', '/people/PER001/info', ME('dev1', { color: 'red' }), false);
check('profilo: collega un gruppo', personBase(), 'dev1', 'set', '/people/PER001/groups/GRP999', 'MEM002', true);
check('profilo: collega un armadio con la chiave', personBase(), 'dev1', 'set', '/people/PER001/armadi/ARM001', { name: 'Giochi di casa', key: 'KN75MK8G', own: true, at: 5 }, true);
check('profilo: chiave armadio non valida', personBase(), 'dev1', 'set', '/people/PER001/armadi/ARM001', { name: 'Giochi', key: '<x>' }, false);
check('profilo: unisce un vecchio profilo dello stesso gruppo', personBase(), 'dev1', 'set', '/people/PER001/alts/GRP123/MEM009', true, true);
check('profilo: si crea insieme ai gruppi e agli armadi', base(), 'dev1', 'update', '/', { 'people/PER003/info': ME(), 'people/PER003/uids/dev1': 1, 'people/PER003/groups/GRP123': 'MEM001', 'people/PER003/armadi/ARM001': { name: 'Casa', key: 'KN75MK8G' } }, true);
check('profilo: un estraneo non aggiunge gruppi', personBase(), 'zz', 'set', '/people/PER001/groups/GRP999', 'MEM002', false);
check('profilo: un estraneo non aggiunge armadi', personBase(), 'zz', 'set', '/people/PER001/armadi/ARM001', { name: 'X' }, false);
check('profilo: un estraneo non si aggiunge insieme a un gruppo', personBase(), 'zz', 'update', '/', { 'people/PER001/uids/zz': 1, 'people/PER001/groups/GRP999': 'MEM002' }, false);
check('profilo: la chiave la scrive solo un dispositivo collegato', personBase(), 'zz', 'set', '/personKeys/PER001', 'HACK1234', false);
check('profilo: un dispositivo collegato rinnova la chiave', personBase(), 'dev1', 'set', '/personKeys/PER001', 'NEWK1234', true);
check('profilo: la chiave non si legge', personBase(), 'dev1', 'read', '/personKeys/PER001', null, false);
check('profilo: campi sconosciuti rifiutati', personBase(), 'dev1', 'set', '/people/PER001/boh', 1, false);

// Stelline "Stasera" della serata (non toccano l'armadio) e votazione dei giochi con più voti a testa
check('serata: la TV sceglie i giochi di stasera', base(), 'host', 'set', `${R}/pick/L1`, true, true);
check('serata: un giocatore non cambia le stelline della TV', base(), 'p1', 'set', `${R}/pick/L1`, true, false);
check('serata: stellina non booleana', base(), 'host', 'set', `${R}/pick/L1`, 'si', false);
const pollBase = (max) => { const d = base(); d.rooms.ABCD.state = { phase: 'poll' }; d.rooms.ABCD.poll = { open: true, options: ['L1', 'L2', 'L3', 'L4'], ...(max ? { max } : {}) }; return d; };
check('giochi: un voto (come prima)', pollBase(), 'p1', 'set', `${R}/poll/votes/p1`, 'L1', true);
check('giochi: due voti se la TV ne concede 2', pollBase(2), 'p1', 'set', `${R}/poll/votes/p1`, { a: 'L1', b: 'L2' }, true);
check('giochi: il secondo voto NO se la TV ne concede 1', pollBase(1), 'p1', 'set', `${R}/poll/votes/p1`, { a: 'L1', b: 'L2' }, false);
check('giochi: il terzo voto NO se la TV ne concede 2', pollBase(2), 'p1', 'set', `${R}/poll/votes/p1`, { a: 'L1', b: 'L2', c: 'L3' }, false);
check('giochi: tre voti se la TV ne concede 3', pollBase(3), 'p1', 'set', `${R}/poll/votes/p1`, { a: 'L1', b: 'L2', c: 'L3' }, true);
check('giochi: due voti allo stesso gioco NO', pollBase(3), 'p1', 'set', `${R}/poll/votes/p1`, { a: 'L1', b: 'L1' }, false);
check('giochi: casella sconosciuta NO', pollBase(3), 'p1', 'set', `${R}/poll/votes/p1`, { z: 'L1' }, false);
check('giochi: si vota solo per sé', pollBase(2), 'p1', 'set', `${R}/poll/votes/p2`, { a: 'L1' }, false);
check('giochi: massimo voti a testa oltre 3 NO', pollBase(), 'host', 'set', `${R}/poll/max`, 5, false);
check('giochi: la TV imposta 2 voti a testa', pollBase(), 'host', 'set', `${R}/poll/max`, 2, true);

// Armadio 1.2: foto leggere, prestiti, cronologia, cestino, link pubblico, inviti
const arm12 = () => { const d = armBase(); d.armadi.ARM001.admins = { col1: true }; d.armadi.ARM001.uids = { p1: true }; d.armadi.ARM001.library.L1.thumb = 'data:image/jpeg;base64,AAA'; d.armadi.ARM001.share = { token: 'abcdefghij012345' }; d.pub = { abcdefghij012345: { aid: 'ARM001', name: 'Giochi di casa', games: { L1: { name: 'Azul' } } } }; d.armadi.ARM001.invites = { INVITE0001: { exp: Date.now() + 86400000, role: 'editor' }, OLDINVITE1: { exp: Date.now() - 1000, role: 'editor' } }; return d; };
check('armadio: il proprietario rinomina', arm12(), 'owner', 'update', `${A}/info`, { name: 'Ludoteca', desc: 'Soggiorno', emoji: '🎲', updatedAt: 5 }, true);
check('armadio: un collaboratore NON rinomina', arm12(), 'col1', 'update', `${A}/info`, { name: 'Mio' }, false);
check('armadio: posizione e campi nuovi', arm12(), 'col1', 'update', `${A}/library/L1`, { loc: { room: 'Soggiorno', unit: 'Libreria', shelf: 'Ripiano 2' }, acq: '2026-10-01', isNew: true, copies: 2, edition: 'Seconda', thumb: 'data:image/jpeg;base64,BBB', updatedAt: 9 }, true);
check('armadio: posizione con chiave sconosciuta rifiutata', arm12(), 'col1', 'update', `${A}/library/L1`, { loc: { piano: 'x' } }, false);
check('armadio: data di acquisizione non valida', arm12(), 'col1', 'update', `${A}/library/L1`, { acq: 'ieri' }, false);
check('armadio: miniatura con HTML rifiutata', arm12(), 'col1', 'update', `${A}/library/L1`, { thumb: 'data:image/png;base64,"><script>' }, false);
check('armadio: foto grande nel suo nodo', arm12(), 'p1', 'set', `${A}/images/L1`, 'data:image/jpeg;base64,CCC', true);
check('armadio: foto grande da estraneo rifiutata', arm12(), 'zz', 'set', `${A}/images/L1`, 'data:image/jpeg;base64,CCC', false);
check('armadio: prestito registrato dal collaboratore', arm12(), 'col1', 'set', `${A}/loans/K1`, { item: 'L1', name: 'Azul', to: 'Luca', start: 1, due: 2, by: 'Andrea' }, true);
check('armadio: un giocatore NON registra prestiti', arm12(), 'p1', 'set', `${A}/loans/K1`, { item: 'L1', to: 'Luca', start: 1 }, false);
check('armadio: i prestiti non li legge chi ha solo il codice', arm12(), 'zz', 'read', `${A}/loans`, null, false);
check('armadio: cronologia aggiunta da un giocatore', arm12(), 'p1', 'set', `${A}/log/E1`, { at: 1, op: 'add', item: 'L1', name: 'Azul', by: 'Ada' }, true);
check('armadio: cronologia non modificabile', (() => { const d = arm12(); d.armadi.ARM001.log = { E1: { at: 1, op: 'add' } }; return d; })(), 'owner', 'set', `${A}/log/E1`, { at: 2, op: 'edit' }, false);
check('armadio: il proprietario può cancellare una voce della cronologia', (() => { const d = arm12(); d.armadi.ARM001.log = { E1: { at: 1, op: 'add' } }; return d; })(), 'owner', 'set', `${A}/log/E1`, null, true);
check('armadio: un collaboratore non cancella la cronologia', (() => { const d = arm12(); d.armadi.ARM001.log = { E1: { at: 1, op: 'add' } }; return d; })(), 'col1', 'set', `${A}/log/E1`, null, false);
check('armadio: cronologia non leggibile da estranei', arm12(), 'zz', 'read', `${A}/log`, null, false);
check('armadio: cestino dal collaboratore', arm12(), 'col1', 'set', `${A}/trash/L1`, { game: { name: 'Azul' }, at: 1, by: 'Andrea' }, true);
check('armadio: cestino non da un giocatore', arm12(), 'p1', 'set', `${A}/trash/L1`, { game: { name: 'Azul' }, at: 1 }, false);
check('catalogo pubblico: lo legge chiunque, anche senza accesso', arm12(), null, 'read', '/pub/abcdefghij012345', null, true);
check('catalogo pubblico: un visitatore non lo modifica', arm12(), 'zz', 'set', '/pub/abcdefghij012345/games/L1/name', 'Hack', false);
check('catalogo pubblico: un visitatore non lo crea per un armadio altrui', arm12(), 'zz', 'set', '/pub/zzzzzzzzzzzzzzzz', { aid: 'ARM001', name: 'Finto' }, false);
check('catalogo pubblico: il collaboratore lo aggiorna', arm12(), 'col1', 'set', '/pub/abcdefghij012345/games/L2', { name: 'Dixit', minPlayers: 3 }, true);
check('catalogo pubblico: il proprietario lo revoca', arm12(), 'owner', 'set', '/pub/abcdefghij012345', null, true);
check('catalogo pubblico: niente campi oggetto non previsti', arm12(), 'owner', 'set', '/pub/abcdefghij012345/games/L2', { name: 'Dixit', prestito: { a: 'Luca' } }, false);
check('catalogo pubblico: il token non lo legge chi ha solo il codice', arm12(), 'zz', 'read', `${A}/share`, null, false);
const claimed = (who, code, used) => { const d = arm12(); d.armadioInviteClaims = { ARM001: { [who]: code } }; if (used) d.armadi.ARM001.invites[code].used = used; return d; };
check('invito: chi lo usa lo prenota per sé', claimed('inv1', 'INVITE0001'), 'inv1', 'set', `${A}/invites/INVITE0001/used`, 'inv1', true);
check('invito: non si prenota a nome di un altro', claimed('inv1', 'INVITE0001'), 'inv1', 'set', `${A}/invites/INVITE0001/used`, 'zz', false);
check('invito: già usato da un altro, non si riusa', claimed('inv2', 'INVITE0001', 'inv1'), 'inv2', 'set', `${A}/invites/INVITE0001/used`, 'inv2', false);
check('invito: già usato da un altro, niente accesso', claimed('inv2', 'INVITE0001', 'inv1'), 'inv2', 'set', `${A}/admins/inv2`, true, false);
check('invito scaduto: non si prenota', claimed('inv1', 'OLDINVITE1'), 'inv1', 'set', `${A}/invites/OLDINVITE1/used`, 'inv1', false);
check('invito: senza prenotarlo non si diventa collaboratori', claimed('inv1', 'INVITE0001'), 'inv1', 'set', `${A}/admins/inv1`, true, false);
check('invito: chi lo usa non ne cambia la scadenza', claimed('inv1', 'INVITE0001', 'inv1'), 'inv1', 'set', `${A}/invites/INVITE0001/exp`, Date.now() + 9e8, false);
check('revocato (invito cancellato dal proprietario): non rientra', (() => { const d = claimed('inv1', 'INVITE0001', 'inv1'); delete d.armadi.ARM001.invites.INVITE0001; return d; })(), 'inv1', 'set', `${A}/admins/inv1`, true, false);
check('invito valido: si diventa collaboratori', claimed('inv1', 'INVITE0001', 'inv1'), 'inv1', 'set', `${A}/admins/inv1`, true, true);
check('invito scaduto: rifiutato', (() => { const d = claimed('inv1', 'OLDINVITE1', 'inv1'); return d; })(), 'inv1', 'set', `${A}/admins/inv1`, true, false);
check('invito inventato: rifiutato', (() => { const d = arm12(); d.armadioInviteClaims = { ARM001: { inv1: 'ABCDEFGHIJ' } }; return d; })(), 'inv1', 'set', `${A}/admins/inv1`, true, false);
check('senza invito non si diventa collaboratori', arm12(), 'inv1', 'set', `${A}/admins/inv1`, true, false);
check('solo il proprietario crea inviti', arm12(), 'col1', 'set', `${A}/invites/NEWINVITE1`, { exp: Date.now() + 1000, role: 'editor' }, false);
check('il proprietario crea un invito', arm12(), 'owner', 'set', `${A}/invites/NEWINVITE1`, { exp: Date.now() + 1000, role: 'editor' }, true);
check('il proprietario revoca un collaboratore', arm12(), 'owner', 'set', `${A}/admins/col1`, null, true);
check('un collaboratore non revoca gli altri', (() => { const d = arm12(); d.armadi.ARM001.admins.col2 = true; return d; })(), 'col1', 'set', `${A}/admins/col2`, null, false);
check('un collaboratore lascia da solo', arm12(), 'col1', 'set', `${A}/admins/col1`, null, true);
check('revocato: non modifica più i giochi', (() => { const d = arm12(); delete d.armadi.ARM001.admins.col1; return d; })(), 'col1', 'set', `${A}/library/L9`, { name: 'Dixit' }, false);
check('nome del collaboratore', arm12(), 'col1', 'set', `${A}/adminInfo/col1`, { name: 'Bea', at: 1 }, true);
check('nome a nome di un altro: rifiutato', arm12(), 'col1', 'set', `${A}/adminInfo/col9`, { name: 'Bea' }, false);
// Timer condiviso (1.6): TV e regia; ogni scrittura parte dallo stato attuale (rev + 1)
const tmr = (extra = {}) => ({ v: 1, id: 'tabc123', kind: 'turn', secs: 60, left: 60000, status: 'running', startAt: TS, rev: 1, follow: true, sound: true, round: 1, by: 'host', ...extra });
const withTimer = (t, cohost) => { const d = idle(); if (t) d.rooms.ABCD.timer = { ...t, startAt: Date.now() - 1000 }; if (cohost) d.rooms.ABCD.cohosts = { [cohost]: true }; return d; };
check('timer: la TV lo avvia', withTimer(null), 'host', 'set', `${R}/timer`, tmr(), true);
check('timer: la regia dal telefono lo mette in pausa', withTimer(tmr(), 'p2'), 'p2', 'set', `${R}/timer`, tmr({ status: 'paused', left: 40000, startAt: null, rev: 2, by: 'p2' }), true);
check('timer: un giocatore normale NON lo tocca', withTimer(tmr()), 'p1', 'set', `${R}/timer`, tmr({ rev: 2 }), false);
check('timer: scrittura su uno stato vecchio rifiutata (rev uguale)', withTimer(tmr({ rev: 5 })), 'host', 'set', `${R}/timer`, tmr({ rev: 5 }), false);
check('timer: scrittura su uno stato vecchio rifiutata (rev indietro)', withTimer(tmr({ rev: 5 })), 'host', 'set', `${R}/timer`, tmr({ rev: 3 }), false);
check('timer: durata fuori misura', withTimer(null), 'host', 'set', `${R}/timer`, tmr({ secs: 99999 }), false);
check('timer: tipo sconosciuto', withTimer(null), 'host', 'set', `${R}/timer`, tmr({ kind: 'bomba' }), false);
check('timer: campo in più rifiutato', withTimer(null), 'host', 'set', `${R}/timer`, tmr({ html: '<b>' }), false);
check('timer: partenza nel futuro lontano rifiutata', withTimer(null), 'host', 'set', `${R}/timer`, tmr({ startAt: Date.now() + 3600000 }), false);
check('timer: la TV lo cancella', withTimer(tmr()), 'host', 'set', `${R}/timer`, null, true);
check('timer: pausa della serata e timer insieme (aggiornamento multiplo dalla TV)', withTimer(tmr()), 'host', 'update', R, { 'state/paused': true, 'state/pausedAt': TS, timer: tmr({ status: 'paused', left: 30000, startAt: null, nightPaused: true, rev: 2 }) }, true);
check('schermata ambientale: la TV la accende', idle(), 'host', 'update', `${R}/meta`, { ambient: true }, true);
check('schermata ambientale: un telefono NON la accende', idle(), 'p1', 'update', `${R}/meta`, { ambient: true }, false);
check('schermata ambientale: valore non booleano', idle(), 'host', 'update', `${R}/meta`, { ambient: 'sì' }, false);
check('pausa: un telefono NON mette in pausa la serata (deve chiederlo alla TV)', idle(), 'p1', 'update', `${R}/state`, { paused: true }, false);
// Preferiti personali (1.6): solo i dispositivi del profilo, valori numerici, id puliti
check('preferiti: un mio dispositivo aggiunge una stella', personBase(), 'dev1', 'set', '/people/PER001/favs/ARM001/-Nabc123', Date.now(), true);
check('preferiti: un estraneo NON li scrive', personBase(), 'zz', 'set', '/people/PER001/favs/ARM001/-Nabc123', Date.now(), false);
check('preferiti: un estraneo NON li legge', personBase(), 'zz', 'read', '/people/PER001/favs', null, false);
check('preferiti: armadio con codice non valido', personBase(), 'dev1', 'set', '/people/PER001/favs/xx/-Nabc123', 1, false);
check('preferiti: id del gioco non valido', personBase(), 'dev1', 'set', '/people/PER001/favs/ARM001/' + 'x'.repeat(41), 1, false);
check('preferiti: valore non numerico', personBase(), 'dev1', 'set', '/people/PER001/favs/ARM001/-Nabc123', '<b>', false);
check('preferiti: si toglie una stella', (() => { const d = personBase(); d.people.PER001.favs = { ARM001: { g1: 5 } }; return d; })(), 'dev1', 'set', '/people/PER001/favs/ARM001/g1', null, true);
// Catalogo pubblico: le nuove scelte del proprietario (1.9) e niente campi inventati
check('catalogo: nuove scelte (espansioni, regole, solo disponibili)', arm12(), 'owner', 'set', '/pub/abcdefghijklmnop', { aid: 'ARM001', name: 'Casa', fields: { status: true, loc: false, exp: false, rules: true, onlyAvail: true } }, true);
check('catalogo: scelta sconosciuta rifiutata', arm12(), 'owner', 'set', '/pub/abcdefghijklmnop', { aid: 'ARM001', name: 'Casa', fields: { owners: true } }, false);
// Link del manuale (1.8): solo https, niente caratteri pericolosi
check('manuale: link https accettato', arm12(), 'owner', 'set', '/armadi/ARM001/library/L9', { name: 'Dixit', manual: 'https://editore.example/dixit-regole.pdf' }, true);
check('manuale: link non https rifiutato', arm12(), 'owner', 'set', '/armadi/ARM001/library/L9', { name: 'Dixit', manual: 'javascript:alert(1)' }, false);
check('manuale: virgolette rifiutate', arm12(), 'owner', 'set', '/armadi/ARM001/library/L9', { name: 'Dixit', manual: 'https://x.example/"onmouseover=' }, false);
// Soundboard personalizzata (1.10): nella stanza solo nome e icona, niente audio, niente HTML
check('suoni personalizzati: la TV pubblica nomi e icone', idle(), 'host', 'update', `${R}/meta`, { customSfx: { cab12: { l: 'Gallina', i: '🐔' } } }, true);
check('suoni personalizzati: niente audio nel database', idle(), 'host', 'update', `${R}/meta`, { customSfx: { cab12: { l: 'Gallina', i: '🐔', data: 'data:audio/mp3;base64,AAAA' } } }, false);
check('suoni personalizzati: niente HTML nel nome', idle(), 'host', 'update', `${R}/meta`, { customSfx: { cab12: { l: '<img src=x>', i: '🐔' } } }, false);
check('suoni personalizzati: un telefono NON cambia l’elenco', idle(), 'p1', 'update', `${R}/meta`, { customSfx: { cab12: { l: 'X', i: '🐔' } } }, false);
check('soundboard: un telefono fa partire un suono personalizzato', (() => { const d = idle({ soundboard: true }); return d; })(), 'p1', 'update', R, { 'sfx/s1': { k: 'c:cab12', by: 'p1', at: { '.sv': 'timestamp' } }, 'rate/p1/sfx': { '.sv': 'timestamp' } }, true);
// ---------------- 1.11 · Modelli di serata nel gruppo (idea 10) ----------------
{
  const T = '/groups/GRP123/templates/t1';
  const tpl = { name: 'Giovedì classico', at: 5, s: { voting: { sempl: false, custom: { 0: { label: 'Rigiocheresti?' } } }, chaos: true, voteSeconds: 90, atmosphere: 'stelle', atmoLevel: 'soft', maxPlayers: 8, music: 'lounge' } };
  check('modello: il proprietario del gruppo lo salva', base(), 'owner', 'set', T, tpl, true);
  check('modello: un admin del gruppo lo salva', (() => { const d = base(); d.groups.GRP123.admins = { host: true }; return d; })(), 'host', 'set', T, tpl, true);
  check('modello: un giocatore del gruppo NON lo salva', base(), 'p1', 'set', T, tpl, false);
  check('modello: campi sconosciuti rifiutati', base(), 'owner', 'set', T, { ...tpl, s: { ...tpl.s, hostUid: 'x' } }, false);
  check('modello: niente HTML nel nome', base(), 'owner', 'set', T, { ...tpl, name: '<b>x</b>' }, false);
  check('modello: senza nome rifiutato', base(), 'owner', 'set', T, { at: 5, s: {} }, false);
  check('modello: un giocatore NON lo cancella', (() => { const d = base(); d.groups.GRP123.templates = { t1: tpl }; return d; })(), 'p1', 'set', T, null, false);
  check('modello: il proprietario lo cancella', (() => { const d = base(); d.groups.GRP123.templates = { t1: tpl }; return d; })(), 'owner', 'set', T, null, true);
}

// ---------------- 1.11 · Ospiti (idea 5) e modalità pubblico (idea 13) ----------------
check('ospite: il giocatore si segna come ospite', base(), 'p9', 'set', `${R}/players/p9`, { name: 'Ospite', style: 'adventurer', seed: 'x', color: '#FF5A4E', guest: true }, true);
check('ospite: valore non booleano rifiutato', base(), 'p9', 'set', `${R}/players/p9`, { name: 'Ospite', style: 'adventurer', seed: 'x', color: '#FF5A4E', guest: 'sì' }, false);
check('modalità pubblico: la TV la accende', base(), 'host', 'update', `${R}/meta`, { publicTv: true }, true);
check('modalità pubblico: un telefono NON la accende', base(), 'p1', 'update', `${R}/meta`, { publicTv: true }, false);

// ---------------- 1.12 · Premi del gruppo (23), tradizioni (24), accessori (25), regole della casa (68) ----------------
{
  const A = `${R}/customAwards/a1`;
  const aw = { t: 'Re del bluff', e: '👑', uid: 'p1', at: { '.sv': 'timestamp' } };
  check('premio del gruppo: la TV lo assegna a un giocatore', base(), 'host', 'set', A, aw, true);
  check('premio del gruppo: un telefono NON lo assegna', base(), 'p1', 'set', A, aw, false);
  check('premio del gruppo: un co-regia lo assegna', (() => { const d = base(); d.rooms.ABCD.cohosts = { p2: true }; return d; })(), 'p2', 'set', A, aw, true);
  check('premio del gruppo: non a chi non è in stanza', base(), 'host', 'set', A, { ...aw, uid: 'zz' }, false);
  check('premio del gruppo: non a un ospite', (() => { const d = base(); d.rooms.ABCD.players.p2.guest = true; return d; })(), 'host', 'set', A, { ...aw, uid: 'p2' }, false);
  check('premio del gruppo: niente HTML nel nome', base(), 'host', 'set', A, { ...aw, t: '<img src=x>' }, false);
  check('premio del gruppo: nome troppo lungo', base(), 'host', 'set', A, { ...aw, t: 'x'.repeat(33) }, false);
  check('premio del gruppo: campi sconosciuti rifiutati', base(), 'host', 'set', A, { ...aw, score: 5 }, false);
  check('premio del gruppo: la TV lo toglie', (() => { const d = base(); d.rooms.ABCD.customAwards = { a1: { t: 'X', uid: 'p1', at: 1 } }; return d; })(), 'host', 'set', A, null, true);
  check('tradizioni: la TV imposta gioco d’apertura e premio ricorrente', base(), 'host', 'update', `${R}/meta`, { opening: 'Dixit', award: { t: 'Re del bluff', e: '👑' } }, true);
  check('tradizioni: premio ricorrente con campi sconosciuti rifiutato', base(), 'host', 'update', `${R}/meta`, { award: { t: 'Re', x: 1 } }, false);
  check('tradizioni: niente HTML nel gioco d’apertura', base(), 'host', 'update', `${R}/meta`, { opening: '<script>' }, false);
  check('accessori stagionali: la TV li accende', base(), 'host', 'update', `${R}/meta`, { seasonal: true }, true);
  check('accessori stagionali: un telefono NON li accende', base(), 'p1', 'update', `${R}/meta`, { seasonal: true }, false);
  const T = '/groups/GRP123/templates/t2';
  check('modello con tradizioni', base(), 'owner', 'set', T, { name: 'Venerdì', at: 5, s: { opening: 'Dixit', award: { t: 'Re', e: '👑' } } }, true);
  check('modello: premio ricorrente senza nome rifiutato', base(), 'owner', 'set', T, { name: 'Venerdì', at: 5, s: { award: { e: '👑' } } }, false);
  const H = '/groups/GRP123/house/h1';
  const rule = { text: 'Chi perde sceglie il prossimo gioco', g: 'Azul', at: 5 };
  check('regola della casa: il proprietario la scrive', base(), 'owner', 'set', H, rule, true);
  check('regola della casa: un dispositivo del gruppo la scrive', base(), 'p1', 'set', H, rule, true);
  check('regola della casa: un estraneo NON la scrive', base(), 'zz', 'set', H, rule, false);
  check('regola della casa: troppo lunga', base(), 'owner', 'set', H, { ...rule, text: 'x'.repeat(201) }, false);
  check('regola della casa: niente HTML', base(), 'owner', 'set', H, { ...rule, text: '<b>x</b>' }, false);
  check('regola della casa: campi sconosciuti rifiutati', base(), 'owner', 'set', H, { ...rule, by: 'x' }, false);
  check('regola della casa: chiunque la legge (gruppo non privato)', base(), 'zz', 'read', '/groups/GRP123/house', null, true);
  check('regola della casa: gruppo privato, un estraneo NON la legge', (() => { const d = base(); d.groups.GRP123.privacy = { private: true }; return d; })(), 'zz', 'read', '/groups/GRP123/house', null, false);
}

// ---------------- 2.0 · voti dopo la votazione, registro, passaggio di identità, informazioni BGG ----------------
{
  const revealed = (late) => { const d = base(); d.rooms.ABCD.state = { phase: 'idle', playId: 'p9' }; d.rooms.ABCD.games.g1.status = 'revealed'; if (late) d.rooms.ABCD.late = { g1: late }; return d; };
  const L = `${R}/late/g1/p1`;
  check('voto tardivo: la TV apre la finestra a un giocatore', revealed(), 'host', 'set', L, { at: 5 }, true);
  check('voto tardivo: un telefono NON apre la finestra (nemmeno a sé)', revealed(), 'p1', 'set', L, { at: 5 }, false);
  check('voto tardivo: niente finestra per chi non è in stanza', revealed(), 'host', 'set', `${R}/late/g1/zz`, { at: 5 }, false);
  check('voto tardivo: campi sconosciuti rifiutati', revealed(), 'host', 'set', L, { at: 5, all: true }, false);
  check('voto tardivo: senza finestra il telefono NON vota dopo il reveal', revealed(), 'p1', 'set', `${R}/votes/g1/p1`, { overall: 8 }, false);
  check('voto tardivo: con la finestra il telefono vota', revealed({ p1: { at: 5 } }), 'p1', 'set', `${R}/votes/g1/p1`, { overall: 8, late: true }, true);
  check('voto tardivo: la finestra di un altro NON vale', revealed({ p2: { at: 5 } }), 'p1', 'set', `${R}/votes/g1/p1`, { overall: 8 }, false);
  check('voto tardivo: senza "edit" NON si cambia un voto già dato', revealed({ p2: { at: 5 } }), 'p2', 'set', `${R}/votes/g1/p2`, { overall: 3 }, false);
  check('modifica autorizzata: con "edit" il voto si cambia', revealed({ p2: { at: 5, edit: true } }), 'p2', 'set', `${R}/votes/g1/p2`, { overall: 3, editedAt: 9 }, true);
  check('modifica autorizzata: il giocatore NON cancella il proprio voto', revealed({ p2: { at: 5, edit: true } }), 'p2', 'set', `${R}/votes/g1/p2`, null, false);
  check('modifica autorizzata: NON si cambia il voto di un altro', revealed({ p2: { at: 5, edit: true } }), 'p1', 'set', `${R}/votes/g1/p2`, { overall: 1 }, false);
  check('durante la votazione il giocatore cambia il proprio voto', base(), 'p2', 'set', `${R}/votes/g1/p2`, { overall: 9 }, true);
  const V = `${R}/votelog/e1`;
  const ev = { gid: 'g1', uid: 'p1', kind: 'late', by: 'self', at: 5 };
  check('registro dei voti: la TV scrive una riga', revealed(), 'host', 'set', V, { ...ev, by: 'tv' }, true);
  check('registro dei voti: il giocatore con la finestra scrive la sua riga', revealed({ p1: { at: 5 } }), 'p1', 'set', V, ev, true);
  check('registro dei voti: senza finestra il telefono NON scrive', revealed(), 'p1', 'set', V, ev, false);
  check('registro dei voti: righe non modificabili', (() => { const d = revealed(); d.rooms.ABCD.votelog = { e1: ev }; return d; })(), 'host', 'set', V, { ...ev, kind: 'edit' }, false);
  check('registro dei voti: tipo sconosciuto rifiutato', revealed(), 'host', 'set', V, { ...ev, kind: 'hack' }, false);
  const H = `${R}/handover/p1`;
  check('passaggio di identità: il giocatore lascia il proprio gettone', base(), 'p1', 'set', H, 'TOKEN-abcdef123456', true);
  check('passaggio di identità: NON per un altro uid', base(), 'p2', 'set', H, 'TOKEN-abcdef123456', false);
  check('passaggio di identità: NON se non si è in stanza', base(), 'zz', 'set', `${R}/handover/zz`, 'TOKEN-abcdef123456', false);
  check('passaggio di identità: gettone troppo corto', base(), 'p1', 'set', H, 'corto', false);
  check('passaggio di identità: la TV lo toglie', (() => { const d = base(); d.rooms.ABCD.handover = { p1: 'TOKEN-abcdef123456' }; return d; })(), 'host', 'set', H, null, true);
  {
    const acc = (provider) => targaryen.database(rules, personBase()).with({ debug: false }).as({ uid: 'dev1', provider, token: { firebase: { sign_in_provider: provider } } }).write('/accounts/dev1', { pid: 'PER001', key: 'KEY98765', at: 1 }).allowed;
    for (const [label, provider, expect] of [['account: una sessione ospite (anonima) NON lo scrive', 'anonymous', false], ['account: con Google lo scrive (profilo e chiave giusti)', 'google.com', true]]) {
      n++;
      if (acc(provider) === expect) console.log(`✓ ${label}`); else { fail++; console.log(`✗ ${label}`); }
    }
  }
  check('account: nessuno legge quello di un altro', personBase(), 'zz', 'read', '/accounts/dev1', null, false);
  const B = '/armadi/ARM001/library/L1/bggInfo';
  check('BGG: il proprietario salva le informazioni', armBase(), 'owner', 'set', B, { designers: ['Klaus Teuber'], age: 10, rating: 7.1, rank: 512, mech: ['Dice Rolling'], at: 5 }, true);
  check('BGG: campi sconosciuti rifiutati', armBase(), 'owner', 'set', B, { description: 'testo copiato', at: 5 }, false);
  check('BGG: voto fuori scala rifiutato', armBase(), 'owner', 'set', B, { rating: 11, at: 5 }, false);
  check('BGG: troppi autori rifiutati', armBase(), 'owner', 'set', B, { designers: ['a', 'b', 'c', 'd'], at: 5 }, false);
}

// ---------------- 2.1 · correzioni, organizzatori, proposte, sfide, bacheca, tema, conservazione ----------------
{
  const closed = () => { const d = base(); delete d.rooms.ABCD; d.groups.GRP123.nights.OLD1 = { at: 1, creatorUid: 'p1', games: { g1: { name: 'Dixt', key: 'dixt', n: 2, sum: 12 } } }; return d; };
  const N = '/groups/GRP123/nights/OLD1';
  check('correzione: il creatore corregge il nome del gioco', closed(), 'p1', 'update', N, { 'games/g1/name': 'Dixit', 'games/g1/key': 'dixit' }, true);
  check('correzione: un altro NON corregge', closed(), 'p2', 'update', N, { 'games/g1/name': 'Dixit' }, false);
  check('correzione: niente HTML nel nome', closed(), 'p1', 'update', N, { 'games/g1/name': '<b>x</b>' }, false);
  const F = { gid: 'g1', what: 'Dixt → Dixit', why: 'nome sbagliato', at: 5 };
  check('correzione: il creatore scrive la cronologia', closed(), 'p1', 'set', `${N}/fixes/f1`, F, true);
  check('correzione: la cronologia non si riscrive', (() => { const d = closed(); d.groups.GRP123.nights.OLD1.fixes = { f1: F }; return d; })(), 'p1', 'set', `${N}/fixes/f1`, { ...F, why: 'altro motivo' }, false);
  check('correzione: motivo obbligatorio', closed(), 'p1', 'set', `${N}/fixes/f2`, { ...F, why: 'x' }, false);
  check('correzione: un altro NON scrive la cronologia', closed(), 'p2', 'set', `${N}/fixes/f3`, F, false);

  const org = () => { const d = base(); d.groupOrgKeys = { GRP123: 'ORGKEY01' }; return d; };
  check('organizzatore: un admin crea la chiave', base(), 'owner', 'set', '/groupOrgKeys/GRP123', 'ORGKEY01', true);
  check('organizzatore: un dispositivo qualsiasi NON crea la chiave', base(), 'p1', 'set', '/groupOrgKeys/GRP123', 'ORGKEY01', false);
  check('organizzatore: con la chiave giusta ci si segna', (() => { const d = org(); d.groupOrgKeyClaims = { GRP123: { p9: 'ORGKEY01' } }; return d; })(), 'p9', 'set', '/groups/GRP123/organizers/p9', true, true);
  check('organizzatore: con la chiave sbagliata NO', (() => { const d = org(); d.groupOrgKeyClaims = { GRP123: { p9: 'SBAGLIAT' } }; return d; })(), 'p9', 'set', '/groups/GRP123/organizers/p9', true, false);
  check('organizzatore: salva un modello di serata', (() => { const d = base(); d.groups.GRP123.organizers = { p9: true }; return d; })(), 'p9', 'set', '/groups/GRP123/templates/t1', { name: 'Venerdì', at: 5, s: { maxGames: 4 } }, true);
  check('organizzatore: NON cambia la privacy', (() => { const d = base(); d.groups.GRP123.organizers = { p9: true }; return d; })(), 'p9', 'update', '/groups/GRP123/privacy', { private: true }, false);
  check('modello: limiti fuori scala rifiutati', base(), 'owner', 'set', '/groups/GRP123/templates/t2', { name: 'X', at: 5, s: { maxMinutes: 5 } }, false);

  const arm = () => { const d = armBase(); return d; };
  const P = { item: 'L1', patch: { maxPlayers: 5 }, why: 'sulla scatola', uid: 'zz', name: 'Zoe', at: 5 };
  check('proposta: chiunque collegato propone per sé su un gioco che c\'è', arm(), 'zz', 'set', '/armadi/ARM001/proposals/q1', P, true);
  check('proposta: NON a nome di un altro', arm(), 'zz', 'set', '/armadi/ARM001/proposals/q1', { ...P, uid: 'owner' }, false);
  check('proposta: NON su un gioco che non c\'è', arm(), 'zz', 'set', '/armadi/ARM001/proposals/q1', { ...P, item: 'NOPE' }, false);
  check('proposta: campi non ammessi rifiutati', arm(), 'zz', 'set', '/armadi/ARM001/proposals/q1', { ...P, patch: { ownerUid: 'zz' } }, false);
  check('proposta: chi propone NON legge le proposte', arm(), 'zz', 'read', '/armadi/ARM001/proposals', null, false);
  check('proposta: il proprietario legge e decide', (() => { const d = arm(); d.armadi.ARM001.proposals = { q1: P }; return d; })(), 'owner', 'set', '/armadi/ARM001/proposals/q1', null, true);
  check('cronologia dell\'armadio: durata di conservazione', arm(), 'owner', 'update', '/armadi/ARM001/info', { keepLogDays: 90 }, true);

  const C = { name: 'Amici', nights: 3, games: 5, votes: 20, avg: 7.4, top: 'Azul', recent: 1, at: 5 };
  check('sfida: l\'admin del gruppo pubblica gli aggregati', base(), 'owner', 'set', '/challenges/ABC123/GRP123', C, true);
  check('sfida: un altro dispositivo NON pubblica per il gruppo', base(), 'p1', 'set', '/challenges/ABC123/GRP123', C, false);
  check('sfida: niente campi in più (nomi, voti…)', base(), 'owner', 'set', '/challenges/ABC123/GRP123', { ...C, people: { a: 1 } }, false);
  check('sfida: chi è collegato legge', base(), 'zz', 'read', '/challenges/ABC123', null, true);

  const B = { text: 'Porto le patatine', key: 'k1', name: 'Anna', at: 5 };
  check('bacheca: un dispositivo del gruppo scrive una nota', base(), 'p1', 'set', '/groups/GRP123/next/board/b1', B, true);
  check('bacheca: niente HTML', base(), 'p1', 'set', '/groups/GRP123/next/board/b1', { ...B, text: '<script>' }, false);
  check('suggerimenti: troppo lungo rifiutato', base(), 'p1', 'set', '/groups/GRP123/next/sugg/s1', { ...B, text: 'x'.repeat(61) }, false);
  check('bacheca: un estraneo NON scrive', base(), 'zz', 'set', '/groups/GRP123/next/board/b1', B, false);

  check('tema della TV: l\'admin lo salva nel gruppo', base(), 'owner', 'set', '/groups/GRP123/identity/theme', { bg: '#140B2E', accent: '#FFD34D', font: 'rounded', podium: 'neon' }, true);
  check('tema della TV: valori non ammessi', base(), 'owner', 'set', '/groups/GRP123/identity/theme', { bg: 'red', font: 'comic' }, false);
  check('foto: l\'admin toglie le foto vecchie anche di altri', (() => { const d = base(); d.groups.GRP123.photos = { OLD1: { x1: { uid: 'p2', data: 'data:image/jpeg;base64,AA', at: 1 } } }; return d; })(), 'owner', 'set', '/groups/GRP123/photos/OLD1/x1', null, true);
  check('foto: un dispositivo qualsiasi NON toglie quelle degli altri', (() => { const d = base(); d.groups.GRP123.photos = { OLD1: { x1: { uid: 'p2', data: 'data:image/jpeg;base64,AA', at: 1 } } }; return d; })(), 'p1', 'set', '/groups/GRP123/photos/OLD1/x1', null, false);
  check('foto: scadenza dell\'album', base(), 'owner', 'update', '/groups/GRP123/privacy', { photosDays: 365 }, true);
  check('imprevisti ammessi: la TV li sceglie', base(), 'host', 'update', `${R}/meta`, { chaosOff: { swap: true }, chaosWheel: false, maxGames: 4, maxMinutes: 180 }, true);
  check('imprevisti: chiave sconosciuta rifiutata', base(), 'host', 'update', `${R}/meta`, { chaosOff: { hack: true } }, false);
  check('limiti: un telefono NON li cambia', base(), 'p1', 'update', `${R}/meta`, { maxGames: 1 }, false);
}

// 2.2 · rivelazione dei voti decisa dalla regia e accessi agli armadi
{
  check('rivelazione manuale: la regia la imposta', base(), 'host', 'update', `${R}/meta`, { manualReveal: true }, true);
  check('rivelazione manuale: un telefono NON la cambia', base(), 'p1', 'update', `${R}/meta`, { manualReveal: true }, false);
  check('rivelazione manuale: solo sì/no', base(), 'host', 'update', `${R}/meta`, { manualReveal: 'x' }, false);
  check('rivelazione manuale nei modelli del gruppo', base(), 'owner', 'set', '/groups/GRP123/templates/t1', { name: 'Serata', at: 1, s: { manualReveal: true } }, true);
  const AR = '/armadi/ARM001';
  const arm = (extra = {}) => { const d = base(); d.armadi = { ARM001: { info: { name: 'Casa', ownerUid: 'own' }, library: { g1: { name: 'Dixit' } }, admins: { ed: true }, ...extra } }; return d; };
  check('armadio: chi ha il codice lo vede', arm(), 'vis', 'read', `${AR}/library`, undefined, true);
  check('armadio: il visitatore si registra', arm(), 'vis', 'set', `${AR}/viewers/vis`, { name: 'Vale', at: 1, acct: true }, true);
  check('armadio: NON registra un altro', arm(), 'vis', 'set', `${AR}/viewers/altro`, { name: 'Vale', at: 1 }, false);
  check('armadio: registrazione con campi strani rifiutata', arm(), 'vis', 'set', `${AR}/viewers/vis`, { name: 'Vale', at: 1, ruolo: 'admin' }, false);
  check('armadio: il proprietario vede chi lo visualizza', arm({ viewers: { vis: { name: 'Vale', at: 1 } } }), 'own', 'read', `${AR}/viewers`, undefined, true);
  check('armadio: un visitatore NON vede l\'elenco', arm({ viewers: { vis: { name: 'Vale', at: 1 } } }), 'vis', 'read', `${AR}/viewers`, undefined, false);
  check('armadio: il proprietario rimuove l\'accesso', arm({ viewers: { vis: { name: 'Vale', at: 1 } } }), 'own', 'update', AR, { 'viewers/vis': null, 'blocked/vis': true }, true);
  check('armadio: un collaboratore NON rimuove accessi', arm(), 'ed', 'set', `${AR}/blocked/vis`, true, false);
  check('armadio: il proprietario non esclude sé stesso', arm(), 'own', 'set', `${AR}/blocked/own`, true, false);
  check('armadio: escluso, non legge più i giochi', arm({ blocked: { vis: true } }), 'vis', 'read', `${AR}/library`, undefined, false);
  check('armadio: escluso, non legge più le informazioni', arm({ blocked: { vis: true } }), 'vis', 'read', `${AR}/info`, undefined, false);
  check('armadio: escluso, non si registra di nuovo', arm({ blocked: { vis: true } }), 'vis', 'set', `${AR}/viewers/vis`, { name: 'Vale', at: 2 }, false);
  check('armadio: escluso, sa di esserlo', arm({ blocked: { vis: true } }), 'vis', 'read', `${AR}/blocked/vis`, undefined, true);
  check('armadio: collaboratore escluso non rientra con la chiave', (() => { const d = arm({ blocked: { ex: true } }); d.armadioKeys = { ARM001: 'K1' }; d.armadioKeyClaims = { ARM001: { ex: 'K1' } }; return d; })(), 'ex', 'set', `${AR}/admins/ex`, true, false);
  check('armadio: il proprietario riammette', arm({ blocked: { vis: true } }), 'own', 'set', `${AR}/blocked/vis`, null, true);
  check('armadio: il proprietario legge sempre', arm({ blocked: { own: true } }), 'own', 'read', `${AR}/library`, undefined, true);
}


// 2.4 · Chiudere una serata in corso dalla pagina Serate (creatore, anche da un altro dispositivo del profilo)
const CLOSE = { phase: 'awards', done: true, remote: true, at: 1 };
check('chiusura: il creatore porta la serata alla premiazione', made({ hostUid: 'tvx' }), 'host', 'set', `${R}/state`, CLOSE, true);
check('chiusura: un altro dispositivo del profilo del creatore chiude', made({ hostUid: 'tvx', creatorPid: 'PERS01' }), 'tablet', 'set', `${R}/state`, CLOSE, true);
check('chiusura: il creatore NON cambia la fase in altro (solo premiazione)', made({ hostUid: 'tvx' }), 'host', 'set', `${R}/state`, { phase: 'voting', gameId: 'g1' }, false);
check('chiusura: il creatore NON scrive una premiazione "a metà"', made({ hostUid: 'tvx' }), 'host', 'set', `${R}/state`, { phase: 'awards', at: 1 }, false);
check('chiusura: un giocatore NON chiude la serata', made({ hostUid: 'tvx' }), 'p1', 'set', `${R}/state`, CLOSE, false);
check('chiusura: NON crea lo stato di una stanza che non esiste più', (() => { const d = made({ hostUid: 'tvx' }); delete d.rooms.ABCD.state; return d; })(), 'host', 'set', `${R}/state`, CLOSE, false);
check('chiusura: la TV chiude come sempre', made({ hostUid: 'tvx' }), 'tvx', 'set', `${R}/state`, { phase: 'awards', at: 1 }, true);
// 2.4 · Niente tetto fisso a 12 giocatori: decide il master, fino a 100 (limite tecnico documentato)
check('posti: 40 giocatori si possono impostare', base(), 'host', 'set', `${R}/meta/maxPlayers`, 40, true);
check('posti: 100 è il massimo', base(), 'host', 'set', `${R}/meta/maxPlayers`, 100, true);
check('posti: oltre 100 NO', base(), 'host', 'set', `${R}/meta/maxPlayers`, 101, false);
check('posti: un giocatore NON cambia i posti', base(), 'p1', 'set', `${R}/meta/maxPlayers`, 30, false);

check('silenzioso: la TV pubblica lo stato per la regia', base(), 'host', 'set', `${R}/meta/muted`, true, true);
check('silenzioso: solo vero/falso', base(), 'host', 'set', `${R}/meta/muted`, 'si', false);
check('silenzioso: un giocatore NON lo cambia', base(), 'p1', 'set', `${R}/meta/muted`, true, false);

// 2.5 · Gestore della stanza (meta/managerUid): scelto dalla TV, amministra solo questa stanza
const mg = () => base({ managerUid: 'p1' });
check('gestore: la TV lo sceglie tra i giocatori', base(), 'host', 'set', `${R}/meta/managerUid`, 'p1', true);
check('gestore: NON uno che non è nella stanza', base(), 'host', 'set', `${R}/meta/managerUid`, 'estraneo', false);
check('gestore: un giocatore NON si nomina da solo', base(), 'p1', 'set', `${R}/meta/managerUid`, 'p1', false);
check('gestore: NON passa il ruolo a un altro', mg(), 'p1', 'set', `${R}/meta/managerUid`, 'p2', false);
check('gestore: NON diventa la TV', mg(), 'p1', 'set', `${R}/meta/hostUid`, 'p1', false);
check('gestore: chiude l\'ingresso', mg(), 'p1', 'set', `${R}/meta/locked`, true, true);
check('gestore: lo riapre', base({ managerUid: 'p1', locked: true }), 'p1', 'set', `${R}/meta/locked`, false, true);
check('gestore: cambia i posti', mg(), 'p1', 'set', `${R}/meta/maxPlayers`, 12, true);
check('gestore: NON cambia altre impostazioni della stanza', mg(), 'p1', 'set', `${R}/meta/safeMode`, true, false);
check('gestore: NON cambia il gruppo', mg(), 'p1', 'set', `${R}/meta/groupId`, 'ALTRO1', false);
check('gestore: allontana un giocatore (posto + blocco)', mg(), 'p1', 'update', R, { 'players/p2': null, 'meta/banned/p2': 'Bruno' }, true);
check('gestore: NON modifica un altro giocatore', mg(), 'p1', 'set', `${R}/players/p2/name`, 'Pippo', false);
check('gestore: NON blocca sé stesso', mg(), 'p1', 'set', `${R}/meta/banned/p1`, 'Anna', false);
check('gestore: chiude la serata (premiazione)', mg(), 'p1', 'set', `${R}/state`, CLOSE, true);
check('gestore: NON cambia la fase in altro', mg(), 'p1', 'set', `${R}/state`, { phase: 'idle' }, false);
check('gestore: NON cancella la stanza', mg(), 'p1', 'set', R, null, false);
check('gestore: NON tocca i voti degli altri', mg(), 'p1', 'set', `${R}/votes/g1/p2`, null, false);
check('gestore: NON legge la chiave del profilo né scrive nel gruppo', mg(), 'p1', 'set', '/groups/GRP123/info/name', 'Mio', false);
check('gestore revocato: non può più chiudere l\'ingresso', base({ managerUid: 'p2' }), 'p1', 'set', `${R}/meta/locked`, true, false);
check('non gestore: un giocatore NON allontana nessuno', base(), 'p1', 'set', `${R}/players/p2`, null, false);
check('la TV revoca il gestore', mg(), 'host', 'set', `${R}/meta/managerUid`, null, true);
// 2.5 · Presenza per dispositivo: lo stesso account su due dispositivi non si cancella a vicenda
check('presenza: per dispositivo', base(), 'p1', 'set', `${R}/presence/p1/abcdefghij`, true, true);
check('presenza: formato vecchio ancora accettato', base(), 'p1', 'set', `${R}/presence/p1`, true, true);
check('presenza: NON quella di un altro', base(), 'p2', 'set', `${R}/presence/p1/abcdefghij`, true, false);
check('presenza: identificativo del dispositivo non valido', base(), 'p1', 'set', `${R}/presence/p1/X`, true, false);
console.log(`\n${n - fail}/${n} regole come previsto`);
process.exit(fail ? 1 : 0);
