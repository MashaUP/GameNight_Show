// Genera serate finte (formato nightSummary) per i test che servono uno storico del gruppo.
// Uso: node seed.mjs '<json players {uid:{name,memberId}}>' → stampa {room: summary}
globalThis.document = { addEventListener() {}, createElement() { return {}; }, documentElement: { style: {}, classList: { contains: () => false, toggle() {} } }, querySelector: () => null };
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, dispatchEvent() {} };
globalThis.location = { pathname: '/', search: '', hostname: 'localhost', protocol: 'http:', href: 'http://localhost/' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator ??= { userAgent: 'node', language: 'it-IT' };
const { buildBoard, nightSummary } = await import('../../js/stats.js');
const players = JSON.parse(process.argv[2]);
const uids = Object.keys(players);
const DAY = 86400000;
const now = Date.now();
const LIB = ['Dixit', 'Codenames', 'Azul', 'Just One', 'Cascadia', 'Exploding Kittens', 'Lupus in Tabula'];
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const out = {};
// 9 serate negli ultimi 14 mesi
const ago = [420, 365, 300, 210, 150, 90, 60, 30, 9];
ago.forEach((d, ni) => {
  const at = now - d * DAY;
  const games = {}, votes = {};
  const present = uids.filter((u, i) => (ni + i) % 5 !== 4);
  const nGames = 2 + (ni % 3);
  for (let g = 0; g < nGames; g++) {
    const name = LIB[(ni * 2 + g) % LIB.length];
    const id = `g${ni}_${g}`;
    const pl = present.filter((u, i) => (i + g) % 4 !== 3);
    const w = [pl[(ni + g) % pl.length]];
    games[id] = { name, order: g + 1, status: 'revealed', players: Object.fromEntries(pl.map((u) => [u, true])), winners: Object.fromEntries(w.map((u) => [u, true])), playedMin: 15 + Math.round(rnd() * 50), revealedAt: at + (g + 1) * 50 * 60000 };
    votes[id] = {};
    present.forEach((u, i) => {
      const base = name === 'Dixit' ? 8.5 : name === 'Exploding Kittens' ? (i % 2 ? 9 : 3) : name === 'Lupus in Tabula' ? 4 : 6.5;
      const ov = Math.max(1, Math.min(10, Math.round((base + (rnd() * 3 - 1.5)) * 2) / 2));
      const others = present.filter((x) => x !== u);
      votes[id][u] = { overall: ov, coinv: 1 + Math.floor(rnd() * 5), sempl: 1 + Math.floor(rnd() * 5), rigioc: name === 'Azul' ? 5 : name === 'Codenames' ? 1 : 1 + Math.floor(rnd() * 5), mvp: others[Math.floor(rnd() * others.length)], ...(g === 0 && i === 0 ? { comment: `Serata ${ni + 1}: che risate` } : {}) };
    });
  }
  const board = buildBoard(games, votes);
  const pls = Object.fromEntries(present.map((u) => [u, players[u]]));
  const sum = nightSummary(board, pls, { createdAt: at }, [{ title: 'Re del bluff', players: [{ uid: present[0] }] }]);
  out[`OLD${ni}`] = JSON.parse(JSON.stringify(sum));
});
console.log(JSON.stringify(out));
