// go.html?to=<id>: collegamento stabile verso un link ufficiale (config/links.json).
// Accetta solo un id (es. "discord"), mai un indirizzo: la destinazione è sempre un link
// validato con le regole di js/links-policy.js. Se il link è spento o manca, mostra gli altri.
import { links, linkLabel, linkListHTML } from './links.js';
import { t, applyStatic } from './i18n.js';
import { applyTheme } from './util.js';

applyTheme();
applyStatic();

const id = new URLSearchParams(location.search).get('to') || '';
await links.ready();
const e = /^[a-z][a-z0-9-]{0,31}$/.test(id) ? links.get(id) : null;
const msg = document.getElementById('goMsg');
if (e) {
  const a = document.createElement('a');
  a.href = e.url; a.rel = 'noreferrer';
  a.textContent = linkLabel(e);
  msg.textContent = t('go.manual', { name: '' }).trim() + ' ';
  msg.appendChild(a);
  location.replace(e.url);
} else {
  document.getElementById('goTitle').textContent = 'GameNight Show';
  msg.textContent = `${t('go.missing')} ${t('go.others')}`;
  const list = document.getElementById('goList');
  list.innerHTML = linkListHTML();
  list.hidden = !list.children.length;
}
