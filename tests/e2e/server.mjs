// Server per i test end-to-end: serve il sito con un finto Firebase al posto di vendor/firebase.js.
// Tre porte, ognuna con il suo database in memoria:
//   8765  sito, senza regole (tutto permesso)
//   8766  come l'app Android: js/site.js con indirizzi pubblici d'esempio
//   8767  sito con le regole vere di database.rules.json (simulate con targaryen)
// Uso: node tests/e2e/server.mjs  (dalla radice del progetto o da qualunque cartella)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.GN_ROOT || path.join(HERE, '..', '..'));
const require = createRequire(path.join(HERE, '..', 'package.json'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg'
};
const FAKE_CONFIG = 'export const firebaseConfig = { apiKey: "test", databaseURL: "https://test", projectId: "test" };';
const APP_SITE = "export const SITE_URL = 'https://example.github.io/GameNight_Show/';\nexport const APK_URL = 'https://github.com/example/GameNight_Show/releases/latest/download/GameNight-Show.apk';\n";

/** Sostituisce {".sv": "timestamp"} con l'ora attuale (come fa Firebase). */
const sv = (v, now) => Array.isArray(v) ? v.map((x) => sv(x, now))
  : v && typeof v === 'object' ? (v['.sv'] ? now : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x, now)]))) : v;

function makeDb({ rules = false } = {}) {
  let tree = {}, version = 0;
  const seen = {}, ondisc = {};
  const RULES = rules ? JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')) : null;
  const targaryen = rules ? require('targaryen') : null;
  const tdb = (uid) => { const d = targaryen.database(RULES, tree).with({ debug: false }); return uid ? d.as({ uid }) : d; };
  const setAt = (p, v) => {
    const segs = String(p || '').split('/').filter(Boolean);
    if (!segs.length) { tree = v || {}; return; }
    let c = tree;
    for (let i = 0; i < segs.length - 1; i++) { if (c[segs[i]] == null || typeof c[segs[i]] !== 'object') c[segs[i]] = {}; c = c[segs[i]]; }
    const last = segs[segs.length - 1];
    if (v === null || v === undefined) delete c[last]; else c[last] = JSON.parse(JSON.stringify(v));
  };
  const at = (p) => { let c = tree; for (const s of String(p || '').split('/').filter(Boolean)) { c = c && typeof c === 'object' ? c[s] : undefined; } return c === undefined ? null : c; };
  // Dispositivi scollegati da più di 2,5 secondi: si applicano le loro operazioni "onDisconnect".
  setInterval(() => {
    const now = Date.now();
    for (const [cid, t] of Object.entries(seen)) {
      if (now - t > 2500) {
        for (const [p, value] of ondisc[cid] || []) { setAt(p, value); version++; }
        delete ondisc[cid]; delete seen[cid];
      }
    }
  }, 500).unref();
  return {
    get tree() { return tree; },
    get version() { return version; },
    touch(cid) { if (cid) seen[cid] = Date.now(); },
    op({ op, path: p, value, cid, uid, raw }) {
      const now = Date.now();
      if (op === 'ondisc') { (ondisc[cid] ||= []).push([p, value]); return { version, tree }; }
      if (op === 'read') {
        if (rules && !raw && !tdb(uid).read(p || '/', now).allowed) return { error: 'permission_denied' };
        return { value: at(p) };
      }
      // raw: scrittura diretta dai test (preparazione dei dati), senza controllo delle regole
      if (rules && !raw) {
        const r = op === 'set' ? tdb(uid).write(p || '/', value, { now }) : tdb(uid).update(p || '/', value, now);
        if (!r.allowed) return { error: 'permission_denied' };
        tree = r.newDatabase.root.$value() || {};
      } else {
        const v = sv(value, now);
        if (op === 'set') setAt(p, v);
        else if (op === 'update') for (const [k, x] of Object.entries(v || {})) setAt(p ? `${p}/${k}` : k, x);
        else return { error: 'unknown_op' };
      }
      version++;
      return { version, tree };
    },
    reset() { tree = {}; version++; }
  };
}

function serve(port, { rules = false, app = false } = {}) {
  const db = makeDb({ rules });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__db') {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          let msg;
          try { msg = JSON.parse(body || '{}'); } catch { res.statusCode = 400; res.end('{"error":"bad_json"}'); return; }
          if (msg.op === 'reset') { db.reset(); res.end('{}'); return; }
          // I test passano "raw" solo dal loro processo, mai dalla pagina (la pagina non lo conosce).
          res.end(JSON.stringify(db.op(msg)));
        });
        return;
      }
      db.touch(u.searchParams.get('cid'));
      res.end(JSON.stringify({ version: db.version, tree: db.tree }));
      return;
    }
    if (u.pathname === '/__dump') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(db.tree, null, 1)); return; }
    const f = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
    if (f === '/js/config.js') { res.setHeader('content-type', TYPES['.js']); res.end(FAKE_CONFIG); return; }
    if (app && f === '/js/site.js') { res.setHeader('content-type', TYPES['.js']); res.end(APP_SITE); return; }
    let file = path.join(ROOT, f);
    if (f === '/vendor/firebase.js') file = path.join(HERE, 'fakefb.js');
    if (!file.startsWith(ROOT) && !file.startsWith(HERE)) { res.statusCode = 403; res.end('no'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; res.end('nf'); return; }
      res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      res.end(data);
    });
  });
  server.listen(port);
  return server;
}

serve(Number(process.env.GN_PORT_SITE || 8765));
serve(Number(process.env.GN_PORT_APP || 8766), { app: true });
serve(Number(process.env.GN_PORT_RULES || 8767), { rules: true });
console.log(`GameNight test server: ${ROOT} → 8765 (sito), 8766 (app), 8767 (regole vere)`);
