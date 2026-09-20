import {against, bandFor, usageAlert} from '../../chrome-sidebar/src/quota-data.js';
import {notifyDevices} from './push.js';

// How much of Cloudflare's storage this account has used, and the one
// notification that arrives before the limit does.
//
// A D1 database cannot measure itself: the Worker's `PRAGMA page_count` comes
// back SQLITE_AUTH. The figure therefore comes from Cloudflare's own API, which
// needs an account-scoped read token the Worker holds for nothing else. Without
// that token this reports that it is unconfigured rather than guessing at a
// size from the rows it can see.
//
// The reading is kept in `storage_usage` because it is also the memory the
// threshold notification needs: which band was last announced, so a climb is
// reported once instead of every hour. It is account telemetry — no personal
// record, nothing encrypted, nothing a device queues — and one row replaces
// itself.

const CF_API = 'https://api.cloudflare.com/client/v4';
export const USAGE_ID = 'd1';
// A free account may hold ten databases; the cap is there so a misread listing
// cannot turn one reading into an unbounded run of requests.
const MAX_DATABASES = 25;
// How long a saved reading stands before it is taken again. The hourly cron
// refreshes it anyway, so opening Settings normally costs no external request.
const FRESH_MS = 60 * 60 * 1000;

const configured = env => !!(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
const unconfigured = () => {
  throw {status: 503, message: 'Storage reporting needs CLOUDFLARE_ACCOUNT_ID and the CLOUDFLARE_API_TOKEN secret.'};
};

async function cloudflare(env, path, fetcher) {
  const response = await fetcher(`${CF_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    headers: {Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, Accept: 'application/json'},
    // Never follow a redirect: this request carries the read token, and a
    // followed hop could hand it to a host that is not Cloudflare. `manual`
    // rather than `error` because workerd rejects `error` outright — a 3xx then
    // arrives as a non-2xx and is treated as a failed read, which is the point.
    cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000)
  });
  let body;
  try { body = await response.json(); } catch { throw {status: 502, message: 'Cloudflare did not answer with JSON.'}; }
  if (!response.ok || !body?.success) {
    const detail = body?.errors?.[0]?.message || `HTTP ${response.status}`;
    // 401 and 403 mean the token, not the account, so say which to go and fix.
    if ([401, 403].includes(response.status)) throw {status: 403, message: `Cloudflare refused the storage read: ${detail}. The token needs Account · D1 · Read.`};
    throw {status: 502, message: `Cloudflare could not report storage: ${detail}`};
  }
  return body.result;
}

// One reading: every D1 database, largest first. Sizes and a timestamp and
// nothing else — what the plan allows is applied by `against` when the reading
// is served, so a plan change is reflected at once instead of at the next
// sweep.
export async function measureUsage(env, {fetcher = fetch, now = new Date()} = {}) {
  if (!configured(env)) unconfigured();
  const listed = (await cloudflare(env, '/d1/database?per_page=100', fetcher) || []).slice(0, MAX_DATABASES);
  const databases = [];
  for (const entry of listed) {
    // The listing is good for enumerating and nothing else: it reports
    // `num_tables: 0` for every database — present, and wrong, which is worse
    // than absent because no test of the field can catch it. So each database
    // is asked about by itself. One extra request an hour, for the truth.
    const detail = await cloudflare(env, `/d1/database/${entry.uuid}`, fetcher);
    databases.push({
      name: String(detail?.name || entry?.name || 'database').slice(0, 80),
      bytes: Number(detail?.file_size) || 0,
      tables: Number(detail?.num_tables) || 0
    });
  }
  databases.sort((a, b) => b.bytes - a.bytes);
  return {checkedAt: now.toISOString(), databases,
    totalBytes: databases.reduce((sum, database) => sum + database.bytes, 0)};
}

const load = async env => {
  const row = await env.DB.prepare('SELECT value FROM storage_usage WHERE id = ?').bind(USAGE_ID).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
};
const save = (env, usage) => env.DB.prepare(
  'INSERT INTO storage_usage (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
).bind(USAGE_ID, JSON.stringify(usage), usage.checkedAt).run();

// The saved reading, taken again when it has gone stale or when the owner asked
// for it now. A failed re-read keeps the reading already in hand and says how
// old it is: a figure from an hour ago answers the question, and an error page
// does not.
export async function readUsage(env, {fetcher = fetch, now = new Date(), refresh = false} = {}) {
  const saved = await load(env);
  if (!refresh && saved?.checkedAt && now - new Date(saved.checkedAt) < FRESH_MS) return saved;
  try {
    const measured = {...await measureUsage(env, {fetcher, now}), notified: saved?.notified ?? null};
    await save(env, measured);
    return measured;
  } catch (error) {
    if (!saved) throw error;
    return {...saved, stale: true, error: error?.message || 'Storage could not be read again.'};
  }
}

export async function storageUsage(request, env, json) {
  if (request.method !== 'GET') return json({error: 'Method not allowed.'}, 405);
  const {notified, ...measurement} = await readUsage(env, {refresh: new URL(request.url).searchParams.get('refresh') === '1'});
  return json(against(measurement, env.CLOUDFLARE_PLAN));
}

// Hourly, on the trigger that already exists. It sends nothing until a band is
// crossed upward, and then once: the owner asked to hear before the limit
// arrives, not to be told every hour that it has not arrived yet. Falling back
// below a band re-arms it, so a database that grows, is trimmed, and grows
// again is reported both times.
export async function sweepStorage(env, {fetcher = fetch, now = new Date(), log = () => {}, notify = notifyDevices} = {}) {
  if (!configured(env)) { log('storage reporting is not configured'); return {checked: false}; }
  let measurement;
  try { measurement = await readUsage(env, {fetcher, now, refresh: true}); }
  catch (error) { log(`storage read failed: ${error?.message || error}`); return {checked: false}; }
  if (measurement.stale) { log(`storage read failed: ${measurement.error}`); return {checked: false}; }
  const usage = against(measurement, env.CLOUDFLARE_PLAN);
  const band = bandFor(usage.fraction);
  if (band === null || (measurement.notified != null && band <= measurement.notified)) {
    if (band !== measurement.notified) await save(env, {...measurement, notified: band});
    return {checked: true, notified: false, band};
  }
  try { await notify(env, {...usageAlert(usage), tag: 'storage'}, {fetcher, log}); }
  catch (error) { log(`storage notification failed: ${error?.message || error}`); return {checked: true, notified: false, band}; }
  await save(env, {...measurement, notified: band});
  return {checked: true, notified: true, band};
}
