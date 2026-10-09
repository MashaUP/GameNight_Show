// Pre-partita: giochi sul tavolo stasera, desideri, arrivi, "porto io" e scaletta della serata.
// Funzioni pure, usate sia dalla TV sia dai telefoni.

/** La prossima serata del gruppo è oggi? (da 6 ore prima a 12 ore dopo l'orario fissato) */
export function nextIsTonight(next, now = Date.now()) {
  const at = Number(next?.at) || 0;
  return Boolean(at && now > at - 6 * 3600000 && now < at + 12 * 3600000);
}

/**
 * Giochi sul tavolo stasera: { libId: [nomi di chi li ha portati] }.
 * Unisce quelli segnati dai telefoni nella stanza (tonight) e i "porto io" dell'invito (se la serata è oggi).
 */
export function tableGames(tonight, next, library = {}, now = Date.now()) {
  const out = {};
  const add = (lid, name) => {
    if (!library?.[lid]) return;
    const l = (out[lid] ||= []);
    if (name && !l.includes(name)) l.push(name);
  };
  for (const [lid, by] of Object.entries(tonight || {})) for (const name of Object.values(by || {})) if (typeof name === 'string' && name) add(lid, name);
  if (nextIsTonight(next, now)) {
    for (const b of Object.values(next?.bring || {})) for (const lid of Object.keys(b?.games || {})) add(lid, b?.name || '');
  }
  return out;
}

/** Quante stelline "voglio giocare a…" ha ogni gioco: { libId: n }. */
export function wishCounts(wish) {
  const out = {};
  for (const w of Object.values(wish || {})) for (const [lid, on] of Object.entries(w || {})) if (on) out[lid] = (out[lid] || 0) + 1;
  return out;
}

/** Cibo e bevande promessi nell'invito: [{ name, food }]. */
export function foodList(next, now = Date.now()) {
  if (!nextIsTonight(next, now)) return [];
  return Object.values(next?.bring || {}).filter((b) => b?.food && b?.name).map((b) => ({ name: b.name, food: b.food }));
}

/**
 * Arrivi: chi ha detto "ci sono" (o "forse") alla serata di oggi e non è ancora entrato.
 * keyOf(player) dà la chiave della persona (personKey); nameKey normalizza i nomi.
 */
export function arrivals(next, players, keyOf, nameKey, now = Date.now()) {
  if (!nextIsTonight(next, now)) return null;
  const inRoom = Object.values(players || {}).filter((p) => p && !p.away);
  const keys = new Set(inRoom.map((p) => keyOf(p)));
  const names = new Set(inRoom.map((p) => nameKey(p.name)));
  const rs = Object.entries(next?.rsvp || {});
  const missing = (answer) => rs.filter(([k, r]) => r?.answer === answer && !keys.has(k) && !names.has(nameKey(r.name))).map(([, r]) => r.name);
  const yes = rs.filter(([, r]) => r?.answer === 'si').length;
  const at = Number(next.at);
  return { at, yes, coming: missing('si'), maybe: missing('forse'), late: now > at + 15 * 60000, expected: yes + rs.filter(([, r]) => r?.answer === 'forse').length };
}

/** Durata stimata di un gioco in minuti: quella misurata nelle serate, poi quella scritta nell’armadio, altrimenti 30. */
export function gameMinutes(it) {
  const real = Number(it?.playedCount) > 0 ? Math.round(Number(it.playedTotal) / Number(it.playedCount)) : 0;
  return real || Number(it?.duration) || 30;
}

/**
 * Scaletta della serata. items: giochi candidati [{ id, name, duration, minPlayers, maxPlayers, ... }];
 * fits(it): adatto a quanti siete; wishes: { id: n }; played: Set di id già giocati stasera.
 * Si apre con un gioco breve per scaldarsi, poi i più desiderati e lunghi, e si chiude con uno corto.
 * Ogni gioco conta anche 5 minuti per spiegazione e preparazione.
 */
export function buildPlan({ items, minutes, fits = () => true, wishes = {}, played = new Set(), favorite = {} }) {
  const pool = items.filter((it) => fits(it) && !played.has(it.id));
  if (!pool.length) return [];
  const score = (it) => (wishes[it.id] || 0) * 3 + (favorite[it.id] || 0) + Math.random() * 0.6;
  const cost = (it) => gameMinutes(it) + 5;
  const ranked = [...pool].sort((a, b) => score(b) - score(a));
  const budget = Math.max(20, Number(minutes) || 120);
  const chosen = [];
  let used = 0;
  const opener = ranked.find((it) => gameMinutes(it) <= 30);
  if (opener && cost(opener) <= budget) { chosen.push(opener); used += cost(opener); }
  for (const it of ranked) {
    if (chosen.includes(it)) continue;
    if (used + cost(it) <= budget * 1.1) { chosen.push(it); used += cost(it); }
  }
  if (!chosen.length) chosen.push(ranked.sort((a, b) => cost(a) - cost(b))[0]);
  // Ordine: apertura breve, poi dal più lungo al più corto (la chiusura è il più veloce)
  const first = opener && chosen[0] === opener ? [opener] : [];
  const rest = chosen.filter((it) => !first.includes(it)).sort((a, b) => cost(b) - cost(a));
  return [...first, ...rest].map((it) => ({ id: it.id, minutes: gameMinutes(it) }));
}

/** Orari della scaletta a partire da "start" (ms): [{ id, minutes, start }]. */
export function planTimes(list, start) {
  let t = Number(start) || Date.now();
  return list.map((p) => { const out = { ...p, start: t }; t += (p.minutes + 5) * 60000; return out; });
}

export const hhmm = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
