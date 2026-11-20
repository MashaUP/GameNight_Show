// Annuncio delle release su Discord: messaggio, menzioni bloccate, solo webhook di Discord.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, validWebhook, clean, LIMIT } from './discord-release.mjs';

const base = { repo: 'MashaUP/GameNight_Show', tag: 'v2.5.2', title: 'v2.5.2 · Novità', body: 'Una riga.\n\nDue righe.', version: '2.5.2' };

test('messaggio: titolo, testo e link diretti (APK, sito, release)', () => {
  const m = buildMessage(base);
  assert.match(m.content, /^🎲 \*\*v2\.5\.2 · Novità\*\*/);
  assert.match(m.content, /Una riga\.\n\nDue righe\./);
  assert.ok(m.content.includes('https://github.com/MashaUP/GameNight_Show/releases/download/v2.5.2/GameNight-Show.apk'));
  assert.ok(m.content.includes('https://mashaup.github.io/GameNight_Show/'));
  assert.ok(m.content.includes('https://github.com/MashaUP/GameNight_Show/releases/tag/v2.5.2'));
});

test('nessuna menzione può notificare qualcuno', () => {
  const m = buildMessage({ ...base, body: 'Ciao @everyone e @here, <@123> <@&456>' });
  assert.deepEqual(m.allowed_mentions, { parse: [] });
  assert.ok(!/@everyone|@here/.test(m.content.replace(/​/g, 'X')));
});

test('testo lungo accorciato, i link restano', () => {
  const m = buildMessage({ ...base, body: 'x'.repeat(5000) });
  assert.ok(m.content.length <= LIMIT, `lunghezza ${m.content.length}`);
  assert.ok(m.content.endsWith('releases/tag/v2.5.2'));
  assert.ok(m.content.includes('…'));
});

test('titolo vuoto: nome e versione; commenti HTML tolti', () => {
  const m = buildMessage({ ...base, title: '', body: 'A <!-- nascosto --> B' });
  assert.match(m.content, /\*\*GameNight Show 2\.5\.2\*\*/);
  assert.ok(!m.content.includes('nascosto'));
  assert.equal(clean('a\n\n\n\nb'), 'a\n\nb');
});

test('pre-release segnata', () => {
  assert.match(buildMessage({ ...base, prerelease: true }).content, /\(anteprima\)/);
});

test('solo webhook di Discord in https', () => {
  assert.equal(validWebhook('https://discord.com/api/webhooks/1/abc'), true);
  assert.equal(validWebhook('https://discordapp.com/api/webhooks/1/abc'), true);
  assert.equal(validWebhook('http://discord.com/api/webhooks/1/abc'), false);
  assert.equal(validWebhook('https://example.com/api/webhooks/1/abc'), false);
  assert.equal(validWebhook('https://discord.com/channels/1'), false);
  assert.equal(validWebhook(''), false);
});
