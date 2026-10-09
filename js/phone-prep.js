// Pre-partita sul telefono: giochi portati, stelline "voglio giocare a…", codice a barre,
// "porto io" nell'invito, regole del prossimo gioco e scaletta della serata.
import { $, esc, toast, buzz, cleanName, nameKey, gameImageHTML } from './util.js';
import { personKey } from './stats.js';
import { tableGames, wishCounts, gameMinutes } from './prep.js';

let C = null;
export function bindPhonePrep(ctx) { C = ctx; }
const P = () => C.P;
const room = (p) => C.roomRef(P().code, p);
const me = () => P().players?.[P().uid];
const MAX_WISH = 3;

export function myTonight(lid) { return Boolean(P().tonight?.[lid]?.[P().uid]); }
export function myWish(lid) { return Boolean(P().wish?.[P().uid]?.[lid]); }
export function onTable() { return tableGames(P().tonight, P().next, P().library); }

export async function markTonight(lid, on = true) {
  const m = me();
  if (!m) return;
  try { await C.Net.track('Giochi', C.set(room(`tonight/${lid}/${P().uid}`), on ? cleanName(m.name, 16) : null)); } catch (err) { toast(C.explainError(err), 'error'); }
}

async function toggleWish(lid) {
  const on = !myWish(lid);
  const count = Object.values(P().wish?.[P().uid] || {}).filter(Boolean).length;
  if (on && count >= MAX_WISH) { toast(`Al massimo ${MAX_WISH} stelline: togline una prima.`, 'warn'); return; }
  buzz(on ? [10, 30, 10] : 8);
  try { await C.Net.track('Desideri', C.set(room(`wish/${P().uid}/${lid}`), on || null)); } catch (err) { toast(C.explainError(err), 'error'); }
}

/** Riga dell’armadio con "portato stasera" e stellina. */
export function gameRowHTML(it, extra = '') {
  const t = myTonight(it.id);
  const w = myWish(it.id);
  const others = (onTable()[it.id] || []).filter((n) => n !== me()?.name);
  return `<li class="tn-row ${t ? 'is-on' : ''}">${gameImageHTML(it, 'game-img--mini')}
    <span class="lib-mini-text"><span>${esc(it.name)}</span>${extra || others.length ? `<small>${esc([extra, others.length ? `portato da ${others.join(', ')}` : ''].filter(Boolean).join(' · '))}</small>` : ''}</span>
    <button type="button" class="tn-btn" data-tonight="${esc(it.id)}" aria-pressed="${t}" title="L'ho portato stasera">🎲<span>${t ? 'Portato' : 'Porto'}</span></button>
    <button type="button" class="wish-btn" data-wish="${esc(it.id)}" aria-pressed="${w}" aria-label="Voglio giocarci">${w ? '★' : '☆'}</button></li>`;
}

export function tonightSummaryHTML() {
  const table = onTable();
  const lib = P().library || {};
  const ids = Object.keys(table);
  const w = wishCounts(P().wish);
  const mine = Object.values(P().wish?.[P().uid] || {}).filter(Boolean).length;
  return `<p class="tn-sum">🎲 Sul tavolo: <b>${ids.length ? esc(ids.map((id) => lib[id]?.name).filter(Boolean).join(', ')) : 'ancora niente'}</b></p>
    <p class="muted small">Le tue stelline: ${mine} / ${MAX_WISH}${Object.keys(w).length ? ` · più desiderato: ${esc(lib[Object.entries(w).sort((a, b) => b[1] - a[1])[0][0]]?.name || '')}` : ''}</p>`;
}

document.addEventListener('click', (e) => {
  if (!C) return;
  const t = e.target.closest('[data-tonight]');
  if (t) { const on = !myTonight(t.dataset.tonight); buzz(on ? 14 : 8); markTonight(t.dataset.tonight, on); return; }
  const w = e.target.closest('[data-wish]');
  if (w) toggleWish(w.dataset.wish);
});

// ---------------------------------------------------------------------------
// Codice a barre della scatola
// ---------------------------------------------------------------------------

export const Scanner = {
  el: null,
  supported() { return 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia); },
  async open() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'overlay overlay--sheet';
    el.innerHTML = `
      <div class="card sheet scan-sheet" role="dialog" aria-modal="true" aria-labelledby="scTitle">
        <h2 id="scTitle">📷 Codice a barre</h2>
        <div id="scBody">
          ${this.supported() ? '<div class="scan-view"><video id="scVideo" playsinline muted></video><i class="scan-line" aria-hidden="true"></i></div><p class="muted small" id="scHint">Inquadra il codice a barre sul retro della scatola.</p>'
            : '<p class="muted small">Questo browser non sa leggere i codici a barre con la fotocamera (succede su iPhone e su alcuni browser): scrivi i numeri sotto il codice.</p>'}
          <div class="profile-code-row"><label class="sr-only" for="scManual">Numeri del codice a barre</label>
            <input class="input" id="scManual" inputmode="numeric" maxlength="14" placeholder="Es. 3760175513909" autocomplete="off">
            <button type="button" class="btn-sec" id="scGo">Cerca</button></div>
        </div>
        <button type="button" class="link-btn" id="scClose">Chiudi</button>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('#scClose')) { this.close(); return; }
      if (e.target.closest('#scGo')) { const v = String($('#scManual', el).value).replace(/\D/g, ''); if (v.length >= 8) this.found(v); else toast('Il codice ha da 8 a 14 cifre.', 'warn'); return; }
      const a = e.target.closest('[data-assign]');
      if (a) { this.assign(a.dataset.assign); return; }
      if (e.target.closest('#scNew')) this.createNew();
    });
    $('#scManual', el).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
    if (this.supported()) this.start().catch(() => { const h = $('#scHint', el); if (h) h.textContent = 'Fotocamera non disponibile: scrivi i numeri del codice.'; });
  },
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('#scVideo', this.el);
    if (!v) { this.stop(); return; }
    v.srcObject = this.stream;
    await v.play().catch(() => {});
    // eslint-disable-next-line no-undef
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    this.timer = setInterval(async () => {
      if (!this.el || !v.videoWidth) return;
      try {
        const codes = await det.detect(v);
        const c = codes.find((x) => /^\d{8,14}$/.test(x.rawValue || ''));
        if (c) { buzz([30, 40, 30]); this.found(c.rawValue); }
      } catch { /* niente */ }
    }, 350);
  },
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  },
  found(code) {
    this.stop();
    this.code = code;
    const lib = P().library || {};
    const hit = Object.entries(lib).find(([, it]) => it?.ean === code);
    if (hit) {
      markTonight(hit[0], true);
      toast(`${hit[1].name}: sul tavolo! 🎲`);
      this.close();
      return;
    }
    const items = Object.entries(lib).filter(([, it]) => it?.name && !it.ean).map(([id, it]) => ({ id, ...it })).sort((a, b) => a.name.localeCompare(b.name));
    $('#scBody', this.el).innerHTML = `
      <p>Codice <b>${esc(code)}</b>: è la prima volta che lo vedo. Che gioco è? Da ora in poi lo riconosco da solo.</p>
      ${items.length ? `<input class="input" type="search" id="scFind" placeholder="Cerca nell’armadio"><ul class="lib-mini scan-list">${items.map((it) => `<li data-name="${esc(nameKey(it.name))}"><button type="button" class="scan-pick" data-assign="${esc(it.id)}">${gameImageHTML(it, 'game-img--mini')}<span>${esc(it.name)}</span></button></li>`).join('')}</ul>` : ''}
      <div class="profile-code-row"><label class="sr-only" for="scName">Nome del gioco nuovo</label><input class="input" id="scName" maxlength="40" placeholder="Oppure scrivi il nome di un gioco nuovo"><button type="button" class="btn-sec" id="scNew">Aggiungi</button></div>`;
    $('#scFind', this.el)?.addEventListener('input', (e) => {
      const q = nameKey(e.target.value);
      this.el.querySelectorAll('.scan-list li').forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
    });
  },
  async assign(lid) {
    try {
      await C.update(C.libraryRef(P().meta, lid), { ean: this.code });
      await markTonight(lid, true);
      toast(`${P().library?.[lid]?.name || 'Gioco'} collegato al codice e messo sul tavolo 🎲`);
      this.close();
    } catch (err) { toast(C.explainError(err), 'error'); }
  },
  async createNew() {
    const name = cleanName($('#scName', this.el)?.value || '');
    if (!name) { toast('Scrivi il nome del gioco.', 'warn'); return; }
    const existing = Object.entries(P().library || {}).find(([, it]) => nameKey(it?.name) === nameKey(name));
    if (existing) { this.assign(existing[0]); return; }
    try {
      const r = C.push(C.libraryRef(P().meta));
      await C.set(r, { name, ean: this.code, addedBy: me()?.name || '', addedAt: C.serverTimestamp() });
      await markTonight(r.key, true);
      toast(`${name} aggiunto all’armadio e messo sul tavolo 🎲`);
      this.close();
    } catch (err) { toast(C.explainError(err), 'error'); }
  },
  close() { this.stop(); this.el?.remove(); this.el = null; }
};

// ---------------------------------------------------------------------------
// Regole del prossimo gioco e scaletta (schermata "Prossimo gioco")
// ---------------------------------------------------------------------------

export function rulesCardHTML() {
  const lid = P().rules?.lid;
  const it = lid && P().library?.[lid];
  if (!it) return '';
  const k = P().knows?.[lid]?.[P().uid];
  const setup = String(it.setup || '').split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  return `<section class="card ph-card rules-card">
    <h2>📖 Si gioca a ${esc(it.name)}</h2>
    <p class="vlabel-sm">Lo conosci già?</p>
    <div class="rules-know"><button type="button" class="btn-sec" data-know="1" aria-pressed="${k === true}">✅ Sì, lo so</button><button type="button" class="btn-sec" data-know="0" aria-pressed="${k === false}">🆕 Spiegatemelo</button></div>
    ${it.rules ? `<p class="rules-text">${esc(it.rules)}</p>` : ''}
    ${setup.length ? `<details><summary>Preparazione</summary><ul>${setup.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}
    ${/^https:\/\/[^\s"<>]+$/.test(it.video || '') ? `<a class="btn-sec btn-sec--sm" href="${esc(it.video)}" target="_blank" rel="noopener noreferrer">▶️ Video delle regole</a>` : ''}
  </section>`;
}

document.addEventListener('click', (e) => {
  if (!C) return;
  const b = e.target.closest('[data-know]');
  if (!b) return;
  const lid = P().rules?.lid;
  if (!lid) return;
  buzz(10);
  C.Net.track('Regole', C.set(room(`knows/${lid}/${P().uid}`), b.dataset.know === '1')).catch((err) => toast(C.explainError(err), 'error'));
});

export function planCardHTML() {
  const lib = P().library || {};
  const items = (Array.isArray(P().plan?.items) ? P().plan.items : []).filter((id) => lib[id]);
  if (!items.length) return '';
  const played = new Set(Object.values(P().games || {}).filter((g) => g?.status === 'revealed').map((g) => nameKey(g.name)));
  return `<section class="card ph-card plan-card"><h2>🗓️ La scaletta di stasera</h2><ol>${items.map((id) => {
    const done = played.has(nameKey(lib[id].name));
    return `<li class="${done ? 'is-done' : ''}">${done ? '✓ ' : ''}<b>${esc(lib[id].name)}</b> <small>${gameMinutes(lib[id])} min</small></li>`;
  }).join('')}</ol></section>`;
}

// ---------------------------------------------------------------------------
// "Porto io" nell'invito alla prossima serata
// ---------------------------------------------------------------------------

export function bringHTML(next, key) {
  if (!next?.at) return '';
  const mine = next.rsvp?.[key]?.answer;
  if (mine !== 'si' && mine !== 'forse') return '';
  const b = next.bring?.[key] || {};
  const lib = Object.entries(P().library || {}).filter(([, it]) => it?.name).sort((a, b2) => a[1].name.localeCompare(b2[1].name));
  return `<details class="bring" ${b.food || Object.keys(b.games || {}).length ? '' : 'open'}><summary>🎒 Porto io</summary>
    <p class="muted small">Scegli i giochi che porti (la sera stessa sono già "sul tavolo") e, se vuoi, cosa porti da mangiare o da bere.</p>
    <div class="bring-games">${lib.map(([id, it]) => `<button type="button" class="lib-chip" data-bring="${esc(id)}" aria-pressed="${Boolean(b.games?.[id])}">${esc(it.name)}</button>`).join('')}</div>
    <label class="sr-only" for="bringFood">Cibo o bevande</label><input class="input" id="bringFood" maxlength="60" placeholder="Es. pizza, patatine, birre" value="${esc(b.food || '')}">
    <button type="button" class="btn-sec btn-sec--sm" id="bringSave">Salva</button></details>`;
}

document.addEventListener('click', async (e) => {
  if (!C) return;
  const g = e.target.closest('[data-bring]');
  if (g) { g.setAttribute('aria-pressed', String(g.getAttribute('aria-pressed') !== 'true')); buzz(8); return; }
  if (!e.target.closest('#bringSave')) return;
  const gid = P().meta?.groupId;
  const m = me();
  if (!gid || !m) return;
  const games = Object.fromEntries([...document.querySelectorAll('[data-bring][aria-pressed="true"]')].map((x) => [x.dataset.bring, true]));
  const food = cleanName($('#bringFood')?.value || '', 60);
  try {
    await C.Net.track('Porto io', C.set(C.groupRef(gid, `next/bring/${personKey(m)}`), { name: cleanName(m.name, 16), games: Object.keys(games).length ? games : null, food: food || null }));
    toast('Segnato: lo vedono tutti nell’invito');
  } catch (err) { toast(C.explainError(err), 'error'); }
});
