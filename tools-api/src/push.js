import {travel} from './travel.js';
import {encryptSettings, decryptSettings} from './ai-settings.js';
import {sendPush, fromBase64url, base64url} from './web-push.js';
import {reminderDue, duePhrase, isDueSoon} from '../../chrome-sidebar/src/reminder-data.js';
const fail = message => { throw {status:400, message}; };

// One device, one subscription row: where to reach it, the keys that encrypt to
// it, the zone it lives in, and the hour of its own morning it wants the day's
// reminders. The endpoint is a capability URL — anyone holding it can push to
// the phone — so it is encrypted at rest like every other record here and never
// returned by the listing.
export function normalizePushSubscription(input, previous = {}) {
  const get = key => input[key] ?? previous[key];
  let endpoint;
  try { endpoint = new URL(String(get('endpoint') || '')); } catch { fail('A push subscription needs the endpoint its browser issued.'); }
  if (endpoint.protocol !== 'https:') fail('A push endpoint must be an https address.');
  const bytes = (value, length, label) => {
    let decoded;
    try { decoded = fromBase64url(String(value || '')); } catch { fail(`Send ${label} as base64url.`); }
    if (decoded.length !== length) fail(`Send ${label} as ${length} bytes.`);
    return base64url(decoded);
  };
  const timeZone = String(get('timeZone') || 'UTC').slice(0, 60);
  try { new Intl.DateTimeFormat('en-CA', {timeZone}); } catch { fail('Send a time zone this device actually uses.'); }
  const hour = Number(get('hour') ?? 8);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) fail('Choose an hour from 0 to 23.');
  return {
    endpoint: endpoint.href,
    p256dh: bytes(get('p256dh'), 65, 'the subscription key'),
    auth: bytes(get('auth'), 16, 'the subscription secret'),
    timeZone, hour,
    // Server-kept, never accepted from a device: it is how a day's notification
    // is sent once rather than every hour.
    lastSentOn: String(previous.lastSentOn || '')
  };
}
// The listing says which devices are subscribed without handing back the
// capability URLs that would let anything else push to them.
export const pushSubscriptions = (request, env, readValue, json) => travel(request, env, readValue, json, {
  resource:'push/subscriptions', table:'push_subscriptions', normalize:normalizePushSubscription,
  metadata:(row, value) => ({id:row.id, revision:row.revision, updatedAt:row.updated_at,
    host:(() => { try { return new URL(value.endpoint).host; } catch { return ''; } })(), timeZone:value.timeZone, hour:value.hour})
});

export const vapidKeys = env => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw {status:503, message:'Push is not configured on this Worker.'};
  return {publicKey:fromBase64url(env.VAPID_PUBLIC_KEY), privateKey:fromBase64url(env.VAPID_PRIVATE_KEY),
    subject:env.VAPID_SUBJECT || 'mailto:push@erics-tools.invalid'};
};

const rows = async (env, table, resource) => {
  const {results} = await env.DB.prepare(`SELECT id, value, revision, updated_at FROM ${table}`).all();
  return Promise.all(results.map(async row => ({...row, value:await decryptSettings(row.value, `${resource}:${row.id}`, env)})));
};
const saveSubscription = async (env, row, value) => {
  await env.DB.prepare('UPDATE push_subscriptions SET value = ?, updated_at = ? WHERE id = ?')
    .bind(await encryptSettings(value, `push/subscriptions:${row.id}`, env), new Date().toISOString(), row.id).run();
};
const forget = (env, id) => env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(id).run();

// A device's own day and hour. Reminders are per-day facts, so what counts as
// "today" has to be the phone's today, not the Worker's UTC one.
export const zonedDate = (timeZone, now) => new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
export const zonedHour = (timeZone, now) => Number(new Intl.DateTimeFormat('en-US', {timeZone, hour:'2-digit', hour12:false, hourCycle:'h23'}).format(now));

// What one morning's notification says. One thing due speaks for itself; more
// than one is a count and the first few names, because a notification is a
// reason to open the app, not a replacement for it.
export function reminderDigest(reminders, today) {
  const due = reminders.map(record => reminderDue(record, today)).filter(record => record.due && isDueSoon(record))
    .sort((a, b) => a.due.localeCompare(b.due));
  if (!due.length) return null;
  const name = record => [record.title, record.subject].filter(Boolean).join(' · ');
  if (due.length === 1) return {title:name(due[0]), body:duePhrase(due[0]), count:1};
  return {title:`${due.length} reminders`, body:due.slice(0, 3).map(name).join(' · ') + (due.length > 3 ? '…' : ''), count:due.length};
}

// Runs every hour; sends to a device only in the hour it asked for, and at most
// once per its own day. Nothing is sent when nothing is due — an empty
// notification every morning would train the owner to ignore the full ones.
export async function deliverDueReminders(env, {now = new Date(), fetcher = fetch, log = () => {}} = {}) {
  const subscriptions = await rows(env, 'push_subscriptions', 'push/subscriptions');
  if (!subscriptions.length) return {sent:0, skipped:0};
  const due = subscriptions.filter(row => zonedHour(row.value.timeZone, now) === row.value.hour
    && row.value.lastSentOn !== zonedDate(row.value.timeZone, now));
  if (!due.length) return {sent:0, skipped:subscriptions.length};
  const reminders = (await rows(env, 'reminder_records', 'reminders')).map(row => row.value);
  const vapid = vapidKeys(env);
  let sent = 0;
  for (const row of due) {
    const today = zonedDate(row.value.timeZone, now);
    const digest = reminderDigest(reminders, today);
    if (!digest) continue;
    try {
      const result = await sendPush(row.value, JSON.stringify({...digest, url:'/app/', tag:'reminders'}), vapid, {fetcher});
      if (result.gone) { await forget(env, row.id); log(`push subscription ${row.id} is gone`); continue; }
      if (!result.ok) { log(`push to ${row.id} failed with ${result.status}`); continue; }
      await saveSubscription(env, row, {...row.value, lastSentOn:today});
      sent++;
    } catch (error) { log(`push to ${row.id} threw: ${error?.message || error}`); }
  }
  return {sent, skipped:subscriptions.length - due.length};
}

// Proving it works is the only way to know it works, and it must not have to
// wait until tomorrow morning.
export async function sendTestPush(env, {fetcher = fetch} = {}) {
  const subscriptions = await rows(env, 'push_subscriptions', 'push/subscriptions');
  if (!subscriptions.length) throw {status:400, message:'No device is subscribed yet.'};
  const vapid = vapidKeys(env);
  const results = [];
  for (const row of subscriptions) {
    const result = await sendPush(row.value, JSON.stringify({title:'Eric’s Tools', body:'Reminders are working on this device.', url:'/app/', tag:'test'}), vapid, {fetcher});
    if (result.gone) await forget(env, row.id);
    results.push({id:row.id, status:result.status, ok:result.ok});
  }
  return {results};
}
