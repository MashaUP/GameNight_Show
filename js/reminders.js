// Promemoria per le serate pianificate (2.1, idea 69).
//
// Nell'app Android: notifica locale (plugin Capacitor LocalNotifications) all'anticipo scelto — 1 ora,
// 3 ore o il giorno prima — per la prossima serata del gruppo. Niente server, niente notifiche push:
// il telefono la programma da solo e la rifà se la data cambia. Facoltativo, spento di base.
// Nel browser le notifiche programmate non esistono: si offre il promemoria nel calendario (.ics) che
// c'era già, e se la pagina è aperta all'ora giusta compare un avviso.
import { isApp, nativeCall } from './native.js';
import { t } from './i18n.js';

export const LEADS = [0, 60, 180, 1440];
const KEY = 'gnr_remind_lead';
const DONE = 'gnr_remind_set';
const NOTIF_ID = 4242;

export function reminderLead() { try { const v = Number(localStorage.getItem(KEY)); return LEADS.includes(v) ? v : 0; } catch { return 0; } }
export function setReminderLead(v) { try { localStorage.setItem(KEY, String(LEADS.includes(Number(v)) ? Number(v) : 0)); } catch { /* niente */ } }

/** Quando suonare: at - lead minuti, solo se nel futuro. */
export function reminderTime(at, lead, now = Date.now()) {
  if (!Number(at) || !lead) return 0;
  const when = Number(at) - lead * 60000;
  return when > now + 30000 ? when : 0;
}

export const canNotify = () => isApp() && Boolean(window.Capacitor?.isPluginAvailable?.('LocalNotifications'));

/**
 * Programma (o toglie) il promemoria per la serata { at, place, group }. Restituisce 'set' | 'off' | 'past' |
 * 'denied' | 'web'. Non rifà niente se è già programmato per la stessa data e lo stesso anticipo.
 */
export async function syncReminder(next, group = '') {
  const lead = reminderLead();
  const when = reminderTime(next?.at, lead);
  const sig = when ? `${when}|${group}` : '';
  let prev = '';
  try { prev = localStorage.getItem(DONE) || ''; } catch { /* niente */ }
  if (!canNotify()) return lead ? 'web' : 'off';
  if (sig === prev) return when ? 'set' : 'off';
  await nativeCall('LocalNotifications', 'cancel', { notifications: [{ id: NOTIF_ID }] }).catch(() => {});
  if (!when) { try { localStorage.setItem(DONE, ''); } catch { /* niente */ } return lead ? 'past' : 'off'; }
  const perm = await nativeCall('LocalNotifications', 'requestPermissions', {}).catch(() => ({ display: 'denied' }));
  if (perm?.display !== 'granted') return 'denied';
  const hhmm = new Date(Number(next.at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  await nativeCall('LocalNotifications', 'schedule', {
    notifications: [{ id: NOTIF_ID, title: t('rem.title', { group: group || 'GameNight' }), body: t('rem.body', { time: hhmm, place: next.place || '' }).trim(), schedule: { at: new Date(when).toISOString(), allowWhileIdle: true } }]
  });
  try { localStorage.setItem(DONE, sig); } catch { /* niente */ }
  return 'set';
}

/** Nel browser, con la pagina aperta: avviso quando arriva l'ora del promemoria (una volta). */
export function webReminderTick(next, group = '') {
  const when = reminderTime(next?.at, reminderLead(), 0);
  if (!when || canNotify()) return;
  const k = `gnr_remind_web_${when}`;
  try { if (localStorage.getItem(k)) return; } catch { return; }
  if (Date.now() < when || Date.now() > Number(next.at)) return;
  try { localStorage.setItem(k, '1'); } catch { /* niente */ }
  const text = t('rem.title', { group: group || 'GameNight' });
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(text); return; } catch { /* niente */ } }
  window.dispatchEvent(new CustomEvent('gnr-reminder', { detail: text }));
}

/** Scelta dell'anticipo (telefono, riquadro della prossima serata). */
export function reminderHTML(next) {
  if (!Number(next?.at)) return '';
  const lead = reminderLead();
  return `<label class="nb-remind"><span>🔔 ${t('rem.label')}</span><select class="input select select--sm" data-remind>${LEADS.map((v) => `<option value="${v}" ${v === lead ? 'selected' : ''}>${t(`rem.lead.${v}`)}</option>`).join('')}</select></label>
    ${canNotify() ? '' : `<small class="muted">${t('rem.webNote')}</small>`}`;
}
