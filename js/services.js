// Servizi esterni facoltativi (indirizzi pubblici, NON segreti).
//
// BGG_PROXY_URL: indirizzo del proxy BoardGameGeek (Cloudflare Worker, cartella bgg-proxy).
// Vuoto = integrazione con BoardGameGeek spenta: tutto il resto funziona, e l'importazione
// del file CSV di BGG resta disponibile. Guida: bgg-proxy/README.md
export const BGG_PROXY_URL = '';

// LINKS_URL: indirizzo pubblico della configurazione dei link ufficiali (formato in docs/LINKS.md).
// Vuoto = automatico: sul sito si usa config/links.json del sito stesso; nell'app Android la copia
// pubblicata su GitHub Pages (SITE_URL + config/links.json). Va cambiato solo se un giorno la
// configurazione si sposta altrove (deve restare un file statico https, senza segreti).
export const LINKS_URL = '';
