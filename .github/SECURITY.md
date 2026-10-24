# Sicurezza

Grazie se hai trovato un problema di sicurezza in GameNight Show. **Non aprire una segnalazione pubblica**:
chiunque potrebbe leggerla prima che il problema sia corretto.

## Come segnalarlo

Usa la segnalazione privata di GitHub: scheda **Security › Report a vulnerability** del repository
(<https://github.com/MashaUP/GameNight_Show/security/advisories/new>). Solo il proprietario la vede.

Scrivi, se puoi:

- cosa si riesce a fare (per esempio leggere i dati di un altro gruppo, guidare una stanza non tua, far aprire un link non ufficiale);
- i passi per riprodurlo e la versione (in fondo alla home o in Impostazioni › Versione);
- pagina e dispositivo (sito, telefono, app Android).

Riceverai una risposta appena possibile. Il progetto è curato nel tempo libero e non prevede ricompense in denaro;
se vuoi, verrai ringraziato nel CHANGELOG della correzione.

## Cosa interessa di più

- **Regole del database** (`firebase/database.rules.json`): letture o scritture permesse a chi non dovrebbe.
- **Testi inseriti dagli utenti** (nomi, commenti, pettegolezzi, giochi) che finiscono nella pagina come codice.
- **Link ufficiali** (`config/links.json`, `go.html`): modi per far aprire un indirizzo fuori dai domini ammessi.
- **App Android**: aggiornamenti che installano un file diverso da quello pubblicato (controllo SHA-256), permessi.
- **Proxy BoardGameGeek** (`bgg-proxy/`): accesso al token o uso del proxy da altri siti.

## Cosa non è un problema di sicurezza

- Le chiavi in `js/config.js`: per le app web di Firebase sono pubbliche per natura; la protezione sta nelle regole del database (README, passo 2.5).
- La chiave di firma di prova in `android-app/keystore/`: è pubblica di proposito, per le copie tra amici. Chi pubblica l'app per altri deve usare una chiave sua (README, “La firma dell'app”).
- Chi conosce il codice di una stanza può entrarci: è il funzionamento previsto (la stanza si può chiudere dalla TV).

## Versioni seguite

Solo l'ultima versione pubblicata riceve correzioni. Gli aggiornamenti arrivano da soli sul sito e vengono segnalati nell'app.
