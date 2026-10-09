// Prove delle regole di database.rules.json con il simulatore targaryen.
const targaryen = require('targaryen');
const rules = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'database.rules.json'), 'utf8'));
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
check('scadenza: l\'admin del gruppo cancella una stanza vecchia', (() => { const d = old({ hostUid: 'altro' }); d.groups.GRP123.admins = { pc2: true }; return d; })(), 'pc2', 'set', R, null, true);
check('scadenza: NON una stanza di oggi', base({ createdAt: Date.now() - 3600000 }), 'host', 'set', R, null, false);
check('scadenza: un giocatore NON cancella stanze', old(), 'p1', 'set', R, null, false);
check('scadenza: il codice regia di una stanza sparita si toglie', (() => { const d = base(); delete d.rooms.ABCD; return d; })(), 'host', 'set', '/secrets/ABCD', null, true);
check('scadenza: NON il codice di una stanza viva', base(), 'zz', 'set', '/secrets/ABCD', null, false);
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
console.log(`\n${n - fail}/${n} regole come previsto`);
process.exit(fail ? 1 : 0);
