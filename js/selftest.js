// Verifica della configurazione: prova Firebase e le regole con una stanza finta, poi la cancella.
import {
  isConfigured, connect, roomRef, groupRef, armadioRef, secretRef, memberRef, get, set, update, remove, push, serverTimestamp, explainError
} from './fb.js';
import { $, esc, randomCode, applyTheme, ICONS } from './util.js';
import { APP_VERSION } from './version.js';
import { firebaseConfig } from './config.js';
import { initializeApp, getAuth, signInAnonymously, getDatabase, ref as dbRef, set as dbSet, remove as dbRemove } from '../vendor/firebase.js';

applyTheme();
const list = $('#checks');
const summary = $('#summary');

function row(title) {
  const li = document.createElement('li');
  li.className = 'check is-running';
  li.innerHTML = `<span class="check-ico">…</span><div><b>${esc(title)}</b><p class="muted"></p></div>`;
  list.appendChild(li);
  return {
    ok(msg = '') { li.className = 'check is-ok'; li.querySelector('.check-ico').innerHTML = ICONS.check; li.querySelector('p').textContent = msg; },
    fail(msg) { li.className = 'check is-fail'; li.querySelector('.check-ico').innerHTML = ICONS.x; li.querySelector('p').textContent = msg; }
  };
}

/**
 * Un secondo utente anonimo, come il telefono di un amico. Serve perché questa pagina è anche la "TV"
 * della stanza di prova: la TV può scrivere nei voti (per esempio per azzerarli), quindi i limiti
 * dei giocatori si possono provare solo con un utente diverso.
 */
async function guestUser() {
  const app = initializeApp(firebaseConfig, 'verifica-giocatore');
  const cred = await signInAnonymously(getAuth(app));
  return { uid: cred.user.uid, db: getDatabase(app) };
}

const denied = (e) => /permission|denied/i.test(String(e?.code || e?.message || e));

async function run() {
  let failures = 0;
  const step = async (title, fn) => {
    const r = row(title);
    try { r.ok(await fn()); return true; } catch (e) { failures++; r.fail(e?.user ? e.message : explainError(e)); return false; }
  };
  const fail = (m) => { const e = new Error(m); e.user = true; throw e; };

  $('#info').textContent = `Versione dell'app ${APP_VERSION}. Progetto Firebase: ${firebaseConfig?.projectId || '—'}. Database: ${firebaseConfig?.databaseURL || '—'}.`;
  if (!(await step('Configurazione in js/config.js', async () => { if (!isConfigured) fail('Mancano i dati di Firebase: compila js/config.js (README, passo 2.5).'); return 'Dati presenti, compreso databaseURL.'; }))) return done(failures);

  let uid;
  if (!(await step('Accesso anonimo', async () => { uid = await connect(); return 'Funziona: ogni dispositivo viene riconosciuto senza registrazione.'; }))) return done(failures);

  const code = randomCode(4);
  const gid = randomCode(6);
  const mid = randomCode(6);
  let libKey = null;
  const ok1 = await step('Creazione di una stanza di prova', async () => {
    await set(roomRef(code, 'meta'), { hostUid: uid, maxPlayers: 2, createdAt: serverTimestamp(), test: true });
    return `Stanza ${code} creata (verrà cancellata alla fine).`;
  });
  if (ok1) {
    await step('Codice regia segreto', async () => {
      await set(secretRef(code), randomCode(8));
      try { await get(secretRef(code)); } catch (e) { if (denied(e)) return 'Si può scrivere ma non leggere: corretto.'; throw e; }
      fail('Il codice regia si può leggere: le regole sono vecchie. Ricopia database.rules.json in Firebase e pubblica.');
    });
    let guest = null;
    await step('Giocatori e votazione', async () => {
      guest = await guestUser();
      await set(roomRef(code, 'state'), { phase: 'voting', gameId: 'g1', at: serverTimestamp() });
      await dbSet(dbRef(guest.db, `rooms/${code}/players/${guest.uid}`), { name: 'Verifica', style: 'adventurer', seed: 'test', color: '#FF5A4E' });
      await dbSet(dbRef(guest.db, `rooms/${code}/votes/g1/${guest.uid}`), { overall: 7, coinv: 3, sempl: 4, rigioc: 5, guess: 6.5, at: serverTimestamp() });
      return 'Un giocatore entra e vota mentre la votazione è aperta.';
    });
    if (guest) {
      await step('Voti bloccati a votazione chiusa', async () => {
        await update(roomRef(code, 'state'), { phase: 'reveal' });
        try { await dbSet(dbRef(guest.db, `rooms/${code}/votes/g1/${guest.uid}`), { overall: 1, at: serverTimestamp() }); } catch (e) { if (denied(e)) return 'Dopo il reveal nessuno può cambiare il voto: corretto.'; throw e; }
        fail('Dopo il reveal i voti si possono ancora cambiare: le regole non sono aggiornate. Ricopia database.rules.json e pubblica.');
      });
      await dbRemove(dbRef(guest.db, `rooms/${code}/players/${guest.uid}`)).catch(() => {});
    }
  }
  await step('Gruppo, armadio e profili', async () => {
    await set(groupRef(gid, 'info'), { name: 'Verifica', ownerUid: uid, createdAt: serverTimestamp() });
    const r = push(groupRef(gid, 'library'));
    libKey = r.key;
    await set(r, { name: 'Gioco di prova', minPlayers: 2, maxPlayers: 6, duration: 20 });
    await set(memberRef(mid), { name: 'Verifica', groupId: gid, style: 'adventurer', seed: 'test', color: '#FF5A4E' });
    return 'Si possono creare gruppi, giochi nell’armadio e profili personali.';
  });
  const aid = randomCode(6);
  let armItem = null;
  await step('Armadio dei giochi', async () => {
    await set(armadioRef(aid, 'info'), { name: 'Armadio di prova', ownerUid: uid, createdAt: serverTimestamp() });
    const r = push(armadioRef(aid, 'library'));
    armItem = r.key;
    await set(r, { name: 'Gioco di prova', sel: true });
    return 'Si crea un armadio (senza gruppo) e ci si aggiungono giochi.';
  });
  await step('Pulizia', async () => {
    const jobs = [
      remove(roomRef(code, `votes/g1`)), remove(roomRef(code, `players/${uid}`)), remove(roomRef(code, 'state')),
      remove(memberRef(mid)), libKey ? remove(groupRef(gid, `library/${libKey}`)) : null
    ].filter(Boolean);
    await Promise.allSettled(jobs);
    await Promise.allSettled([remove(roomRef(code, 'meta')), remove(groupRef(gid, 'info')), armItem ? remove(armadioRef(aid, `library/${armItem}`)) : null].filter(Boolean));
    await remove(armadioRef(aid, 'info')).catch(() => {});
    return 'Dati di prova cancellati.';
  });
  done(failures);
}

function done(failures) {
  summary.className = `card ph-card ${failures ? 'summary-fail' : 'summary-ok'}`;
  summary.innerHTML = failures
    ? `<h2>Ci sono ${failures} ${failures === 1 ? 'problema' : 'problemi'} da sistemare</h2><p>Leggi i messaggi in rosso: di solito basta ricopiare le regole o attivare l'accesso anonimo (README, passo 2).</p>`
    : '<h2>Tutto a posto!</h2><p>Firebase e le regole funzionano: la serata può cominciare.</p>';
}

run();
