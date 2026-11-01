// Esportazione verso altri tracker (2.1, idea 55): le partite di stasera in un CSV "una riga per giocatore".
//
// Non esiste un formato comune documentato fra le app di statistiche dei giochi: le più diffuse importano un
// CSV scegliendo le colonne. Qui le colonne sono le più usate (data, gioco, id BoardGameGeek, giocatore,
// punti, vincitore, durata, voto), con nomi in inglese e date ISO, così si mappano facilmente. Il formato è
// descritto in docs/DATI.md. Gli ospiti escono come "Guest N" (niente nomi di chi non ha un profilo).
import { bggIdOf } from './bgg.js';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};
const iso = (ms) => { const d = new Date(Number(ms) || Date.now()); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };

export const PLAYS_COLUMNS = ['date', 'game', 'bgg_id', 'player', 'score', 'winner', 'minutes', 'rating', 'night'];

/** games/votes/players della stanza; library per l'id BGG; meta per data e codice. */
export function playsCSV(games, votes, players, library = {}, meta = {}) {
  const rows = [PLAYS_COLUMNS.join(',')];
  const guestN = new Map();
  const nameOf = (uid) => {
    const p = players?.[uid];
    if (!p) return '';
    if (!p.guest) return p.name || '';
    if (!guestN.has(uid)) guestN.set(uid, guestN.size + 1);
    return `Guest ${guestN.get(uid)}`;
  };
  const list = Object.entries(games || {}).filter(([, g]) => g?.status === 'revealed').sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  for (const [gid, g] of list) {
    const it = (g.libraryId && library?.[g.libraryId]) || null;
    const bgg = bggIdOf(it?.extId || '') || '';
    const who = new Set([...Object.keys(g.players || {}), ...Object.keys(g.scores || {}), ...Object.keys(votes?.[gid] || {}), ...Object.keys(g.winners || {})]);
    for (const uid of who) {
      if (!players?.[uid]) continue;
      if (g.players && Object.keys(g.players).length && !g.players[uid] && !g.scores?.[uid]) continue; // pubblico: votava ma non giocava
      rows.push([iso(g.revealedAt || meta.createdAt), g.name, bgg, nameOf(uid), g.scores?.[uid] ?? '', g.winners?.[uid] ? 1 : 0, g.playedMin || '', votes?.[gid]?.[uid]?.overall ?? '', meta.code || ''].map(q).join(','));
    }
  }
  return `﻿${rows.join('\n')}\n`;
}
