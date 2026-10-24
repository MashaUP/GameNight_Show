// Ambiente minimo per importare in Node i moduli del sito che toccano document/window all'avvio
// (util.js, stats.js…). Solo per le prove: nessuna pagina vera, nessun DOM.
const noop = () => {};
const classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
const el = () => ({ classList, style: { setProperty: noop }, dataset: {}, setAttribute: noop, getAttribute: () => null, appendChild: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] });
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage ??= globalThis.localStorage;
globalThis.document ??= { documentElement: { ...el(), lang: 'it' }, body: el(), head: el(), createElement: el, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, visibilityState: 'visible' };
globalThis.window ??= { addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), location: { href: 'http://localhost/', search: '', hash: '', pathname: '/' } };
globalThis.CustomEvent ??= class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'it-IT', languages: ['it-IT'] }, configurable: true }); } catch { /* già definito */ }
