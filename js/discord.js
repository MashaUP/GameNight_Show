// Discord (2.1, idee 53 e 54): riepilogo della serata da incollare e, se si vuole, invio con un webhook.
//
// - "Copia per Discord": testo già formattato (grassetti, elenco) da incollare in un canale. Sempre disponibile.
// - Webhook (facoltativo): l'indirizzo del webhook di un canale (Impostazioni del canale › Integrazioni ›
//   Webhook). È una specie di password: resta SOLO su questa TV (localStorage), mai nel database o nei file
//   esportati. L'invio parte dal browser come modulo (multipart, niente richiesta preliminare): Discord non
//   restituisce conferme leggibili ai browser, quindi l'app dice "inviato" quando la richiesta è partita.
// - A fine serata può partire da solo (casella "Invia a fine serata").
// Niente bot e niente server: per eventi diversi (webhook "configurabili" verso altri servizi) servirebbe un
// backend con segreti, come il proxy BGG; vedi docs/SVILUPPO.md.

const KEY = 'gnr_discord_hook';
const AUTO = 'gnr_discord_auto';
const HOOK = /^https:\/\/(?:ptb\.|canary\.)?(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,120}$/;

export const validHook = (u) => HOOK.test(String(u || '').trim());
export function getHook() { try { const v = localStorage.getItem(KEY) || ''; return validHook(v) ? v : ''; } catch { return ''; } }
export function setHook(u) { try { if (u && validHook(u)) localStorage.setItem(KEY, u.trim()); else localStorage.removeItem(KEY); } catch { /* niente */ } }
export function autoSend() { try { return localStorage.getItem(AUTO) === '1'; } catch { return false; } }
export function setAutoSend(on) { try { localStorage.setItem(AUTO, on ? '1' : '0'); } catch { /* niente */ } }

const md = (s) => String(s ?? '').replace(/([*_~`|>\\])/g, '\\$1').replace(/@/g, '@\u200b');

/**
 * Testo del riepilogo (al massimo 1900 caratteri, il limite di Discord è 2000).
 * d: { group, date, board: [{ name, avg, n }], mvp: [nomi], kings: [nomi], awards: [{ title, who }], next, labels }
 */
export function discordSummary(d) {
  const L = d.labels;
  const fmt = (x) => (Number.isFinite(Number(x)) ? Number(x).toFixed(1).replace('.', L.decimal || ',') : '—');
  const lines = [`🎲 **${md(d.group || 'Game Night')}** · ${md(d.date)}`];
  if (d.board?.length) {
    lines.push('', `**${md(L.board)}**`);
    d.board.slice(0, 10).forEach((r, i) => lines.push(`${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${md(r.name)} — **${fmt(r.avg)}** (${md(L.votes(r.n))})`));
  }
  if (d.kings?.length) lines.push('', `🏆 ${md(L.kings)}: ${md(d.kings.join(', '))}`);
  if (d.mvp?.length) lines.push(`⭐ MVP: ${md(d.mvp.join(', '))}`);
  for (const a of (d.awards || []).slice(0, 5)) lines.push(`🎖️ ${md(a.title)}: ${md(a.who)}`);
  if (d.next) lines.push('', `📅 ${md(L.next)}: ${md(d.next)}`);
  let text = lines.join('\n');
  if (text.length > 1900) text = `${text.slice(0, 1890)}…`;
  return text;
}

/** Invio al webhook. Lancia { code: 'nohook' | 'network' }. */
export async function sendToDiscord(text, hook = getHook()) {
  if (!validHook(hook)) throw Object.assign(new Error('nohook'), { code: 'nohook' });
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: text, username: 'GameNight Show', allowed_mentions: { parse: [] } }));
  try { await fetch(hook, { method: 'POST', body: form, mode: 'no-cors' }); } catch { throw Object.assign(new Error('network'), { code: 'network' }); }
}
