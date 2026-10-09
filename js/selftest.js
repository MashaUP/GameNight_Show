// Tavolo di verifica: prova davvero Firebase e le regole del database.
// Questa pagina fa la "TV"; due utenti anonimi in più fanno i "telefoni" (uno dentro la stanza, uno di fuori).
// Usa solo dati di prova con codici nuovi (controllati prima di usarli) e alla fine li cancella.
// Ogni voce dice: stato, come è stata provata, risultato. Quello che qui non si può provare davvero
// (audio, fotocamera, tasto Indietro dell'app, telefono che si spegne) è segnato "da provare a mano",
// mai come riuscito.
import {
  isConfigured, connect, roomRef, groupRef, armadioRef, secretRef, memberRef, get, set, update, remove, push, serverTimestamp, explainError,
  dbRef as pathRef
} from './fb.js';
import { $, esc, randomCode, applyTheme, ICONS, normalizeCode, isImageSource, downloadFile } from './util.js';
import { APP_VERSION } from './version.js';
import { firebaseConfig } from './config.js';
import {
  initializeApp, getAuth, signInAnonymously, getDatabase, ref as dbRef, set as dbSet, get as dbGet, update as dbUpdate,
  remove as dbRemove, serverTimestamp as dbNow
} from '../vendor/firebase.js';

applyTheme();
const list = $('#checks');
const summary = $('#summary');
const results = [];

const denied = (e) => /permission|denied/i.test(String(e?.code || e?.message || e));
const fail = (m) => { const e = new Error(m); e.user = true; throw e; };
class Skip extends Error {}
const manual = (m) => { throw new Skip(m); };

function row(area, title) {
  const li = document.createElement('li');
  li.className = 'check is-running';
  li.innerHTML = `<span class="check-ico">…</span><div><small class="st-area">${esc(area)}</small><b>${esc(title)}</b><p class="muted"></p></div>`;
  list.appendChild(li);
  const set3 = (cls, ico, msg) => { li.className = `check ${cls}`; li.querySelector('.check-ico').innerHTML = ico; li.querySelector('p').textContent = msg; };
  return {
    ok(msg = '') { set3('is-ok', ICONS.check, msg); },
    fail(msg) { set3('is-fail', ICONS.x, msg); },
    skip(msg) { set3('is-skip', '✋', msg); }
  };
}

/** Un utente anonimo in più, come il telefono di un amico (con il suo collegamento separato). */
async function guestUser(name) {
  const app = initializeApp(firebaseConfig, name);
  const cred = await signInAnonymously(getAuth(app));
  return { uid: cred.user.uid, db: getDatabase(app) };
}
const G = {
  set: (g, p, v) => dbSet(dbRef(g.db, p), v),
  get: async (g, p) => (await dbGet(dbRef(g.db, p))).val(),
  update: (g, p, v) => dbUpdate(dbRef(g.db, p), v),
  remove: (g, p) => dbRemove(dbRef(g.db, p))
};
/** Si aspetta che il database rifiuti l'operazione; se la accetta, è un problema delle regole. */
async function mustDeny(op, problem) {
  try { await op(); } catch (e) { if (denied(e)) return true; throw e; }
  fail(problem);
  return false;
}
const OLD_RULES = 'le regole sono vecchie: ricopia database.rules.json in Firebase e premi Pubblica.';

/** Codice nuovo, controllando che non sia già usato (così non si toccano mai dati veri). */
async function freshCode(len, refOf) {
  for (let i = 0; i < 15; i++) {
    const c = randomCode(len);
    if (!(await get(refOf(c)).catch(() => null))?.exists()) return c;
  }
  throw new Error('nessun codice libero');
}

let failures = 0;
async function step(area, title, how, fn) {
  const r = row(area, title);
  const rec = { area, title, how, status: 'ok', detail: '' };
  results.push(rec);
  try {
    rec.detail = (await fn()) || 'Funziona.';
    r.ok(rec.detail);
    return true;
  } catch (e) {
    if (e instanceof Skip) { rec.status = 'skip'; rec.detail = e.message; r.skip(e.message); return null; }
    failures++;
    rec.status = 'fail';
    rec.detail = e?.user ? e.message : explainError(e);
    r.fail(rec.detail);
    return false;
  }
}

async function run() {
  $('#info').textContent = `Versione dell'app ${APP_VERSION}. Progetto Firebase: ${firebaseConfig?.projectId || '—'}. Database: ${firebaseConfig?.databaseURL || '—'}.`;
  if (!(await step('Base', 'Configurazione in js/config.js', 'Controllo che ci siano i dati del progetto Firebase.', async () => {
    if (!isConfigured) fail('Mancano i dati di Firebase: compila js/config.js (README, passo 2.5).');
    return 'Dati presenti, compreso databaseURL.';
  }))) return done();

  let uid;
  if (!(await step('Base', 'Accesso anonimo', 'Accedo come la TV, senza registrazione.', async () => { uid = await connect(); return 'Funziona: ogni dispositivo viene riconosciuto senza registrazione.'; }))) return done();

  // Dati di prova (codici nuovi) da cancellare alla fine
  const made = { rooms: [], groups: [], armadi: [], people: [], members: [] };
  let A = null; let B = null;
  await step('Base', 'Due telefoni di prova', 'Creo due utenti anonimi separati: A entra nella stanza, B resta fuori.', async () => {
    A = await guestUser('verifica-telefono-a');
    B = await guestUser('verifica-telefono-b');
    return 'Pronti: due “telefoni” con identità diverse.';
  });

  const code = await freshCode(4, (c) => roomRef(c, 'meta')).catch(() => null);
  const roomOk = code && await step('Stanza', 'Creazione della stanza', 'La TV crea una stanza di prova con un codice libero.', async () => {
    await set(roomRef(code, 'meta'), { hostUid: uid, maxPlayers: 4, createdAt: serverTimestamp(), test: true, soundboard: true, groupName: 'Verifica' });
    made.rooms.push(code);
    await set(roomRef(code, 'state'), { phase: 'lobby', at: serverTimestamp() });
    return `Stanza ${code} creata (verrà cancellata alla fine).`;
  });
  const P = (n) => ({ name: n, style: 'adventurer', seed: 'verifica', color: '#FF5A4E' });

  if (roomOk && A && B) {
    await step('Regia', 'Codice regia segreto', 'Scrivo il codice regia e provo a rileggerlo.', async () => {
      await set(secretRef(code), randomCode(8));
      try { await get(secretRef(code)); } catch (e) { if (denied(e)) return 'Si può scrivere ma non leggere: corretto.'; throw e; }
      fail(`Il codice regia si può leggere: ${OLD_RULES}`);
    });
    await step('Partecipanti', 'Un telefono entra nella stanza', 'Il telefono A scrive il suo giocatore.', async () => {
      await G.set(A, `rooms/${code}/players/${A.uid}`, P('Verifica A'));
      return 'Il telefono entra con nome e personaggio.';
    });
    await step('Regia', 'Solo la TV guida la serata', 'Il telefono A prova a cambiare la fase della serata.', async () => {
      await mustDeny(() => G.set(A, `rooms/${code}/state`, { phase: 'awards' }), `Un telefono può cambiare la fase della serata: ${OLD_RULES}`);
      return 'Un telefono non può cambiare schermata alla TV: corretto.';
    });
    await step('Partecipanti', 'Stanza chiusa e rientro dopo una disconnessione', 'La TV chiude la stanza: A (già dentro) riscrive il suo giocatore, B (nuovo) prova a entrare.', async () => {
      await update(roomRef(code, 'meta'), { locked: true });
      await G.set(A, `rooms/${code}/players/${A.uid}`, P('Verifica A'));
      await mustDeny(() => G.set(B, `rooms/${code}/players/${B.uid}`, P('Verifica B')), `Con la stanza chiusa entra anche chi non c'era: ${OLD_RULES}`);
      await update(roomRef(code, 'meta'), { locked: null });
      return 'Chi era dentro rientra, chi non c’era resta fuori: corretto.';
    });
    await step('Partecipanti', 'Telefono rimosso dalla TV', 'La TV rimuove B; B prova a rientrare.', async () => {
      await update(roomRef(code, 'meta'), { [`banned/${B.uid}`]: 'Verifica B' });
      await mustDeny(() => G.set(B, `rooms/${code}/players/${B.uid}`, P('Verifica B')), `Un telefono rimosso può rientrare: ${OLD_RULES}`);
      await update(roomRef(code, 'meta'), { [`banned/${B.uid}`]: null });
      return 'Chi è stato rimosso non rientra finché la TV non lo riammette.';
    });
    await step('Votazioni', 'Votare mentre la votazione è aperta', 'La TV apre la votazione di un gioco; A vota.', async () => {
      await set(roomRef(code, 'games/g1'), { name: 'Gioco di prova', status: 'voting', order: 1 });
      await set(roomRef(code, 'state'), { phase: 'voting', gameId: 'g1', at: serverTimestamp() });
      await G.set(A, `rooms/${code}/votes/g1/${A.uid}`, { overall: 7, coinv: 3, sempl: 4, rigioc: 5, guess: 6.5, at: dbNow() });
      return 'Il voto arriva.';
    });
    await step('Votazioni', 'Si vota solo per sé', 'A prova a scrivere un voto a nome della TV.', async () => {
      await mustDeny(() => G.set(A, `rooms/${code}/votes/g1/${uid}`, { overall: 1, at: dbNow() }), `Un telefono può votare per un altro: ${OLD_RULES}`);
      return 'Ognuno vota solo per sé: corretto.';
    });
    await step('Votazioni', 'Voti bloccati dopo il reveal', 'La TV svela i voti; A prova a cambiare il suo voto.', async () => {
      await update(roomRef(code, 'state'), { phase: 'reveal' });
      await update(roomRef(code, 'games/g1'), { status: 'revealed' });
      await mustDeny(() => G.set(A, `rooms/${code}/votes/g1/${A.uid}`, { overall: 1, at: dbNow() }), `Dopo il reveal i voti si possono ancora cambiare: ${OLD_RULES}`);
      return 'Dopo il reveal nessuno può cambiare il voto: corretto.';
    });
    await step('Votazioni', 'Timer del voto', 'La TV imposta 60 secondi, poi un valore fuori scala (9999).', async () => {
      await update(roomRef(code, 'meta'), { voteSeconds: 60 });
      await mustDeny(() => update(roomRef(code, 'meta'), { voteSeconds: 9999 }), `Timer fuori scala accettato: ${OLD_RULES}`);
      await update(roomRef(code, 'meta'), { voteSeconds: null });
      return 'Il timer accetta solo valori validi (0–600 secondi).';
    });
    await step('Partita', 'Pronostici solo nei primi 5 minuti', 'La TV fa partire una partita: A pronostica subito; poi la partita risulta iniziata da 6 minuti e A riprova.', async () => {
      await set(roomRef(code, 'state'), { phase: 'idle', playId: 'p1', playStart: Date.now(), at: serverTimestamp() });
      await G.set(A, `rooms/${code}/bets/p1/${A.uid}`, A.uid);
      await update(roomRef(code, 'state'), { playStart: Date.now() - 6 * 60000 });
      await mustDeny(() => G.set(A, `rooms/${code}/bets/p1/${A.uid}`, A.uid), `Pronostico accettato dopo 5 minuti: ${OLD_RULES}`);
      return 'Pronostico accettato all’inizio, rifiutato dopo 5 minuti.';
    });
    await step('Partita', 'Segnapunti', 'A scrive i suoi punti della partita in corso.', async () => {
      await G.set(A, `rooms/${code}/scores/p1/${A.uid}`, 42);
      return 'Punti salvati.';
    });
    await step('Partita', 'Quiz: una risposta sola', 'La TV apre una domanda; A risponde due volte.', async () => {
      await set(roomRef(code, 'quiz'), { id: 'q1', open: true, at: serverTimestamp() });
      await G.set(A, `rooms/${code}/quizAns/q1/${A.uid}`, 2);
      await mustDeny(() => G.set(A, `rooms/${code}/quizAns/q1/${A.uid}`, 1), `Si può cambiare la risposta del quiz: ${OLD_RULES}`);
      return 'La prima risposta vale, la seconda viene rifiutata.';
    });
    await step('Soundboard', 'Effetto dal telefono e anti-spam', 'A manda un effetto alla TV; subito dopo ne manda un altro.', async () => {
      const send = () => G.update(A, `rooms/${code}`, { [`sfx/${randomCode(8)}`]: { k: 'applausi', by: A.uid, at: dbNow() }, [`rate/${A.uid}/sfx`]: dbNow() });
      await send();
      await mustDeny(send, `Effetti a raffica accettati: ${OLD_RULES}`);
      return 'Il primo effetto arriva; il secondo entro 3 secondi viene rifiutato dal database.';
    });
    await step('Prossimo gioco', 'Votazione dei giochi con più voti a testa', 'La TV concede 2 voti a testa: A ne usa 2, poi prova 3 e due volte lo stesso gioco.', async () => {
      await set(roomRef(code, 'state'), { phase: 'poll', at: serverTimestamp() });
      await set(roomRef(code, 'poll'), { open: true, options: ['L1', 'L2', 'L3'], max: 2, at: serverTimestamp() });
      await G.set(A, `rooms/${code}/poll/votes/${A.uid}`, { a: 'L1', b: 'L2' });
      await mustDeny(() => G.set(A, `rooms/${code}/poll/votes/${A.uid}`, { a: 'L1', b: 'L2', c: 'L3' }), `Più voti di quelli concessi: ${OLD_RULES}`);
      await mustDeny(() => G.set(A, `rooms/${code}/poll/votes/${A.uid}`, { a: 'L1', b: 'L1' }), `Due voti allo stesso gioco: ${OLD_RULES}`);
      return '2 voti accettati; il terzo e i doppioni vengono rifiutati dal database.';
    });
  }

  // Armadio, giochi importati nella stanza, gruppo, profilo
  const aid = await freshCode(6, (c) => armadioRef(c, 'info')).catch(() => null);
  let armOk = false;
  if (aid) {
    armOk = await step('Armadio', 'Armadio dei giochi', 'La TV crea un armadio di prova (senza gruppo) e aggiunge due giochi, uno con la stellina “Stasera”.', async () => {
      await set(armadioRef(aid, 'info'), { name: 'Armadio di prova', ownerUid: uid, createdAt: serverTimestamp() });
      made.armadi.push(aid);
      await set(armadioRef(aid, 'library/t1'), { name: 'Gioco di prova', sel: true });
      await set(armadioRef(aid, 'library/t2'), { name: 'Secondo gioco' });
      return 'Armadio creato con 2 giochi.';
    });
  }
  if (armOk && B) {
    await step('Armadio', 'Permessi dell’armadio', 'B (estraneo) legge i giochi, prova ad aggiungerne uno, poi usa la chiave dell’armadio e riprova.', async () => {
      const lib = await G.get(B, `armadi/${aid}/library`);
      if (!lib?.t1) fail('Un altro dispositivo non riesce a leggere l’armadio.');
      await mustDeny(() => G.set(B, `armadi/${aid}/library/x1`, { name: 'Intruso' }), `Un estraneo aggiunge giochi all’armadio: ${OLD_RULES}`);
      const key = randomCode(8);
      await set(pathRef(`armadioKeys/${aid}`), key);
      await G.set(B, `armadioKeyClaims/${aid}/${B.uid}`, key);
      await G.set(B, `armadi/${aid}/admins/${B.uid}`, true);
      await G.set(B, `armadi/${aid}/library/x1`, { name: 'Con la chiave' });
      return 'Tutti lo consultano; lo modifica solo chi ha la chiave.';
    });
  }
  if (armOk && code && A) {
    await step('Armadio', 'Giochi importati nella stanza', 'La stanza si collega all’armadio; la TV copia la stellina nella serata; A legge i giochi e prova a cambiare le stelline.', async () => {
      await update(roomRef(code, 'meta'), { armadioId: aid, armadioName: 'Armadio di prova' });
      await set(roomRef(code, 'pick'), { t1: true });
      const meta = await G.get(A, `rooms/${code}/meta`);
      const lib = await G.get(A, `armadi/${meta.armadioId}/library`);
      const pick = await G.get(A, `rooms/${code}/pick`);
      if (!lib?.t1 || !pick?.t1) fail('Il telefono non vede i giochi dell’armadio della stanza.');
      await mustDeny(() => G.set(A, `rooms/${code}/pick/t2`, true), `Un telefono cambia le stelline della serata: ${OLD_RULES}`);
      const sel = (await get(armadioRef(aid, 'library/t2/sel'))).val();
      if (sel) fail('La scelta della serata ha modificato l’armadio.');
      return 'I telefoni vedono i giochi dell’armadio; le scelte della serata stanno nella stanza e non cambiano la collezione.';
    });
  }
  const gid = await freshCode(6, (c) => groupRef(c, 'info')).catch(() => null);
  const mid = await freshCode(6, (c) => memberRef(c)).catch(() => null);
  if (gid && mid) {
    await step('Gruppo', 'Gruppo e profilo di gruppo', 'Creo un gruppo di prova e un profilo nel gruppo.', async () => {
      await set(groupRef(gid, 'info'), { name: 'Verifica', ownerUid: uid, createdAt: serverTimestamp() });
      made.groups.push(gid);
      await set(memberRef(mid), { name: 'Verifica', groupId: gid, style: 'adventurer', seed: 'test', color: '#FF5A4E' });
      made.members.push(mid);
      return 'Gruppo e profilo creati.';
    });
    if (code) {
      await step('Chiusura', 'Serata salvata una volta sola', 'Salvo due volte il riassunto della serata nel gruppo (come un doppio tocco o una riconnessione).', async () => {
        // Come una serata vera: la stanza appartiene al gruppo, e la TV che la guida salva il riassunto.
        await update(roomRef(code, 'meta'), { groupId: gid });
        const night = { at: Date.now(), groupName: 'Verifica', games: { g1: { name: 'Gioco di prova', n: 1, sum: 7, order: 1 } } };
        await set(groupRef(gid, `nights/${code}`), night);
        await set(groupRef(gid, `nights/${code}`), night);
        const all = (await get(groupRef(gid, 'nights'))).val() || {};
        if (Object.keys(all).length !== 1) fail('La serata risulta salvata due volte.');
        return 'Una sola serata nel gruppo: il salvataggio è sempre nello stesso posto.';
      });
    }
  }
  if (code && A) {
    await step('Chiusura', 'Fine serata e resoconto', 'La TV chiude la serata; A prova a riaprirla e poi legge i dati per il resoconto.', async () => {
      await set(roomRef(code, 'state'), { phase: 'awards', done: true, at: serverTimestamp() });
      await mustDeny(() => G.set(A, `rooms/${code}/state`, { phase: 'idle' }), `Un telefono riapre la serata: ${OLD_RULES}`);
      const games = await G.get(A, `rooms/${code}/games`);
      const votes = await G.get(A, `rooms/${code}/votes`);
      if (!games?.g1 || !votes?.g1) fail('Il resoconto non riesce a leggere giochi e voti.');
      return 'Serata chiusa dalla TV; i telefoni leggono giochi e voti per il resoconto.';
    });
  }
  const pid = await freshCode(6, (c) => pathRef(`people/${c}/info`)).catch(() => null);
  if (pid && B) {
    await step('Profilo', 'Profilo personale su più dispositivi', 'Creo un profilo personale; B prova a leggerlo, poi usa la chiave del profilo e riprova.', async () => {
      const info = { name: 'Verifica', style: 'adventurer', seed: 'test', color: '#FF5A4E', ownerUid: uid, updatedAt: Date.now() };
      try {
        await update(pathRef(''), { [`people/${pid}/info`]: info, [`people/${pid}/uids/${uid}`]: Date.now() });
      } catch (e) { if (denied(e)) fail(`Il database rifiuta i profili personali: ${OLD_RULES}`); throw e; }
      made.people.push(pid);
      await mustDeny(() => G.get(B, `people/${pid}`), `Un altro dispositivo legge il profilo senza chiave: ${OLD_RULES}`);
      const key = randomCode(8);
      await set(pathRef(`personKeys/${pid}`), key);
      await G.set(B, `personKeyClaims/${pid}/${B.uid}`, key);
      await G.set(B, `people/${pid}/uids/${B.uid}`, Date.now());
      const v = await G.get(B, `people/${pid}/info`);
      if (v?.name !== 'Verifica') fail('Con la chiave il secondo dispositivo non vede il profilo.');
      await G.remove(B, `people/${pid}/uids/${B.uid}`);
      return 'Senza chiave nessuno lo legge; con la chiave il secondo dispositivo lo usa.';
    });
  }

  // Cose che richiedono una persona davanti al dispositivo: mai segnate come riuscite.
  await step('Da provare a mano', 'Audio della soundboard sulla TV', 'Serve ascoltare: dal telefono, durante una serata, tocca 🔊 Suoni › Applausi.', async () => manual('Da provare a mano: la TV deve suonare. Se compare “Tocca qui per attivare l’audio”, tocca la TV una volta.'));
  await step('Da provare a mano', 'Telefono che si spegne o perde la rete', 'Serve un telefono vero: spegni lo schermo durante una serata.', async () => manual('Da provare a mano: entro 15 secondi la TV lo segna come scollegato e non lo aspetta per il voto; riaccendendo, rientra al suo posto.'));
  await step('Da provare a mano', 'Fotocamera, QR e rotazione delle foto', 'Serve una fotocamera: inquadra il QR della TV dall’app, aggiungi un gioco con la foto e ruotala.', async () => manual('Da provare a mano sul telefono (la rotazione è provata in automatico nei test del progetto).'));
  await step('Da provare a mano', 'Tasto Indietro dell’app Android', 'Serve l’app installata: apri un pannello e premi Indietro.', async () => manual('Da provare a mano nell’app: prima si chiude il pannello, poi si torna alla schermata precedente, dalla home l’app va in secondo piano.'));
  await step('Da provare a mano', 'Figurine, video e premiazione', 'Sono solo grafica (nessun dato nuovo): usa “Prova con giocatori finti” sulla TV.', async () => manual('Da provare con la serata di prova: premiazione, figurine e video si generano dai dati già verificati qui sopra.'));

  await step('Base', 'Pulizia dei dati di prova', 'Cancello solo quello che ho creato io (codici controllati all’inizio), poi rileggo per controllare.', async () => {
    const ops = { del: (p) => remove(pathRef(p)), get: async (p) => (await get(pathRef(p))).val() };
    const gOps = (g) => ({ del: (p) => G.remove(g, p), get: (p) => G.get(g, p) });
    /** Cancella un nodo; se le regole permettono di cancellare solo i figli, scende di livello. */
    async function wipe(o, p, depth = 0) {
      try { await o.del(p); return; } catch (e) { if (!denied(e) || depth > 3) return; }
      const v = await o.get(p).catch(() => null);
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) await wipe(o, `${p}/${k}`, depth + 1);
    }
    // Prima le tracce dei telefoni (solo loro possono cancellarle), poi la stanza (meta per ultima: serve alle regole).
    for (const c of made.rooms) {
      if (A) await wipe(gOps(A), `rooms/${c}/rate/${A.uid}`);
      const room = (await get(roomRef(c)).catch(() => null))?.val() || {};
      for (const k of Object.keys(room)) if (k !== 'meta' && k !== 'rate') await wipe(ops, `rooms/${c}/${k}`);
    }
    for (const g of made.groups) await wipe(ops, `groups/${g}/nights`);
    for (const c of made.rooms) await wipe(ops, `rooms/${c}/meta`);
    for (const m of made.members) await wipe(ops, `members/${m}`);
    for (const a of made.armadi) {
      await wipe(ops, `armadi/${a}/library`); await wipe(ops, `armadi/${a}/admins`); await wipe(ops, `armadi/${a}/uids`);
      await wipe(ops, `armadioKeys/${a}`);
      if (B) await wipe(gOps(B), `armadioKeyClaims/${a}/${B.uid}`);
      await wipe(ops, `armadi/${a}/info`);
    }
    for (const g of made.groups) await wipe(ops, `groups/${g}/info`);
    for (const pid of made.people) {
      if (B) await wipe(gOps(B), `personKeyClaims/${pid}/${B.uid}`);
      await wipe(ops, `personKeys/${pid}`); await wipe(ops, `people/${pid}/info`); await wipe(ops, `people/${pid}/uids/${uid}`);
    }
    // Controllo: cosa è rimasto davvero?
    const left = [];
    const check = async (p) => { const v = await ops.get(p).catch(() => undefined); if (v !== null && v !== undefined) left.push(p); };
    for (const c of made.rooms) await check(`rooms/${c}`);
    for (const g of made.groups) await check(`groups/${g}`);
    for (const a of made.armadi) await check(`armadi/${a}`);
    for (const m of made.members) await check(`members/${m}`);
    if (left.length) fail(`Non sono riuscito a cancellare: ${left.join(', ')}. Non è grave (sono dati di prova con codici nuovi), ma segnalo il problema.`);
    return 'Dati di prova cancellati e ricontrollati. Resta solo il codice regia della stanza di prova, che per sicurezza il database non fa cancellare a nessuno.';
  });
  done();
}

/** Armadio vero, solo lettura: quanti giochi, foto valide, stelline. */
async function checkOwnArmadio() {
  const id = normalizeCode($('#stArm').value, 6);
  if (id.length !== 6) { $('#stArm').focus(); return; }
  $('#stArmGo').disabled = true;
  await step('Il tuo armadio', `Armadio ${id} (solo lettura)`, 'Leggo i giochi del tuo armadio senza modificare niente.', async () => {
    await connect();
    const info = (await get(armadioRef(id, 'info'))).val();
    if (!info) fail('Nessun armadio con questo codice.');
    const lib = (await get(armadioRef(id, 'library'))).val() || {};
    const items = Object.values(lib).filter((it) => it?.name);
    if (!items.length) return `“${info.name}”: l’armadio è vuoto. Aggiungi i giochi dalla home › I tuoi armadi.`;
    const noImg = items.filter((it) => !it.image).length;
    const badImg = items.filter((it) => it.image && !isImageSource(it.image)).length;
    const sel = items.filter((it) => it.sel === true).length;
    const noPl = items.filter((it) => !it.minPlayers && !it.maxPlayers).length;
    const notes = [
      `${items.length} giochi`,
      `${sel} con la stellina “Stasera”`,
      noImg ? `${noImg} senza foto` : 'tutti con la foto',
      badImg ? `⚠️ ${badImg} con una foto non valida` : '',
      noPl ? `${noPl} senza numero di giocatori (la TV li propone sempre)` : ''
    ].filter(Boolean);
    if (badImg) fail(`“${info.name}”: ${notes.join(', ')}.`);
    return `“${info.name}”: ${notes.join(', ')}.`;
  });
  $('#stArmGo').disabled = false;
  done();
}

function done() {
  const ok = results.filter((r) => r.status === 'ok').length;
  const ko = results.filter((r) => r.status === 'fail').length;
  const sk = results.filter((r) => r.status === 'skip').length;
  summary.className = `card ph-card ${ko ? 'summary-fail' : 'summary-ok'}`;
  summary.innerHTML = ko
    ? `<h2>Ci sono ${ko} ${ko === 1 ? 'problema' : 'problemi'} da sistemare</h2><p>Leggi i messaggi in rosso: di solito basta ricopiare le regole o attivare l'accesso anonimo (README, passo 2).</p><p class="muted small">${ok} verifiche riuscite, ${sk} da provare a mano.</p>`
    : `<h2>Tutto a posto!</h2><p>${ok} verifiche riuscite su Firebase vero. ${sk} cose si provano a mano (sono indicate con ✋).</p>`;
  const m = $('#matrix');
  m.hidden = false;
  const label = { ok: '✅ Verificata', fail: '❌ Problema', skip: '✋ Da provare a mano' };
  m.innerHTML = `
    <div class="hub-sec-head"><h2>Matrice delle verifiche</h2><button type="button" class="btn-sec btn-sec--sm" id="stDl">⬇️ <span>Scarica</span></button></div>
    <div class="st-table-wrap"><table class="st-table">
      <thead><tr><th>Funzione</th><th>Stato</th><th>Come è stata provata</th><th>Risultato</th></tr></thead>
      <tbody>${results.map((r) => `<tr class="st-${r.status}"><td><small>${esc(r.area)}</small><br><b>${esc(r.title)}</b></td><td>${label[r.status]}</td><td>${esc(r.how)}</td><td>${esc(r.detail)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#stDl', m).addEventListener('click', () => {
    const lines = [`# Tavolo di verifica GameNight Show ${APP_VERSION}`, `Data: ${new Date().toLocaleString('it-IT')}`, `Progetto: ${firebaseConfig?.projectId || '—'}`, '',
      '| Funzione | Stato | Come è stata provata | Risultato |', '|---|---|---|---|',
      ...results.map((r) => `| ${r.area} › ${r.title} | ${label[r.status]} | ${r.how.replace(/\|/g, '/')} | ${String(r.detail).replace(/\|/g, '/')} |`)];
    downloadFile(`verifica_gamenight_${new Date().toISOString().slice(0, 10)}.md`, lines.join('\n'), 'text/markdown');
  });
}

$('#stArmGo')?.addEventListener('click', checkOwnArmadio);
run();
