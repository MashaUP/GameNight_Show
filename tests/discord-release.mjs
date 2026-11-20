// Annuncio di una release su Discord (workflow .github/workflows/discord.yml).
// Uso: DISCORD_WEBHOOK_URL=… GH_TOKEN=… node tests/discord-release.mjs <tag>
//
// Legge titolo e testo della release da GitHub (gh CLI) e li manda al webhook con il link diretto all'APK,
// alla pagina di download e alla release. Nessuna menzione (@everyone, ruoli, utenti) può partire.
// Senza segreto: avviso e fine (non è un errore). Indirizzo non di Discord o risposta diversa da 200/204: errore.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LIMIT = 2000; // caratteri massimi di un messaggio Discord

/** Solo webhook di Discord in https (mai un indirizzo qualsiasi preso dai segreti). */
export function validWebhook(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' && ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(u.hostname) && u.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

/** Testo pulito: niente menzioni di massa né commenti HTML, righe vuote compattate. */
export function clean(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/@(everyone|here)/g, '@​$1')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Messaggio per il webhook. Il testo della release viene accorciato se serve: i link in fondo restano sempre.
 * `allowed_mentions` vuoto: anche se il testo contiene <@id> o <@&ruolo>, Discord non notifica nessuno.
 */
export function buildMessage({ repo, tag, title, body, version, prerelease = false }) {
  const owner = repo.split('/')[0].toLowerCase();
  const name = repo.split('/')[1];
  const apk = `https://github.com/${repo}/releases/download/${tag}/GameNight-Show.apk`;
  const page = `https://github.com/${repo}/releases/tag/${tag}`;
  const site = `https://${owner}.github.io/${name}/`;
  const head = `🎲 **${clean(title) || `GameNight Show ${version}`}**${prerelease ? ' (anteprima)' : ''}`;
  const links = [
    `📲 APK: ${apk}`,
    `🌐 Sito (si aggiorna da solo): ${site}`,
    `📄 Release: ${page}`
  ].join('\n');
  const room = LIMIT - head.length - links.length - 4;
  let text = clean(body);
  if (text.length > room) text = `${text.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  const content = [head, text, links].filter(Boolean).join('\n\n');
  return { content, allowed_mentions: { parse: [] }, flags: 4 }; // 4 = niente anteprime dei link
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

async function main() {
  const tag = process.argv[2] || process.env.TAG;
  const repo = process.env.GITHUB_REPOSITORY;
  const hook = process.env.DISCORD_WEBHOOK_URL || '';
  if (!tag || !repo) throw new Error('servono il tag e GITHUB_REPOSITORY');
  if (!hook) {
    console.log('::warning::Segreto DISCORD_WEBHOOK_URL assente: nessun annuncio su Discord (non è un errore).');
    return;
  }
  if (!validWebhook(hook)) throw new Error('DISCORD_WEBHOOK_URL non è un webhook di Discord (https://discord.com/api/webhooks/…)');
  const version = JSON.parse(readFileSync('version.json', 'utf8')).version;
  const rel = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'name,body,isPrerelease,assets']));
  if (!rel.assets?.some((a) => a.name === 'GameNight-Show.apk')) console.log('::warning::La release non ha ancora GameNight-Show.apk: il link all\'APK funzionerà quando sarà allegata.');
  const msg = buildMessage({ repo, tag, title: rel.name, body: rel.body, version, prerelease: rel.isPrerelease });
  const res = await fetch(`${hook}${hook.includes('?') ? '&' : '?'}wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg),
    signal: AbortSignal.timeout(20000)
  });
  if (res.status !== 200 && res.status !== 204) throw new Error(`Discord ha risposto ${res.status}: annuncio non pubblicato (l'APK è comunque nella release)`);
  console.log(`Annuncio pubblicato su Discord per ${tag}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(`::error::${err.message}`); process.exit(1); });
}
