import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {measureUsage, readUsage, sweepStorage, USAGE_ID} from '../src/quota.js';

const MB = 1024 * 1024, GB = 1024 * MB;
const token = 'test-token-with-at-least-32-characters';

function environment(extra = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../storage-usage-schema.sql', import.meta.url), 'utf8'));
  return {
    sql, API_TOKEN: token, SETTINGS_ENCRYPTION_KEY: '12'.repeat(32),
    CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'cf-read-token',
    DB: {prepare(query) {
      const statement = sql.prepare(query);
      let args = [];
      return {bind(...values) {args = values; return this;},
        async first() {return statement.get(...args) || null;},
        async all() {return {results: statement.all(...args)};},
        async run() {return {meta: {changes: Number(statement.run(...args).changes)}};}};
    }},
    ...extra
  };
}

// Cloudflare's own shape: a listing that already carries each database's size,
// and a detail call for one that did not.
const cloudflare = (databases, {calls = [], detailOnly = false} = {}) => async (url, options) => {
  calls.push({url: String(url), auth: options?.headers?.Authorization});
  const path = String(url).split('/accounts/acct')[1];
  const strip = database => detailOnly ? {uuid: database.uuid, name: database.name} : database;
  if (path.startsWith('/d1/database?')) return Response.json({success: true, result: databases.map(strip)});
  const found = databases.find(database => path === `/d1/database/${database.uuid}`);
  return found ? Response.json({success: true, result: found})
    : Response.json({success: false, errors: [{message: 'not found'}]}, {status: 404});
};
const db = (name, file_size, num_tables = 24) => ({uuid: `${name}-uuid`, name, file_size, num_tables});
const call = (env, url, method = 'GET', auth = token) => worker.fetch(
  new Request(`https://example.com${url}`, {method, headers: auth ? {Authorization: `Bearer ${auth}`} : {}}), env);

test('a reading names every database, sorts by size, and measures the worse of the two limits', async () => {
  const calls = [];
  const usage = await measureUsage(environment(), {fetcher: cloudflare([db('small', 1024), db('erics-personal-tools', 310000)], {calls}), now: new Date('2026-09-20T12:00:00Z')});
  assert.deepEqual(usage.databases.map(database => database.name), ['erics-personal-tools', 'small']);
  assert.equal(usage.totalBytes, 311024);
  assert.equal(usage.databaseLimitBytes, 500 * MB);
  assert.equal(usage.accountLimitBytes, 5 * GB);
  assert.equal(usage.plan, 'Free');
  assert.equal(usage.worst, 'database');
  assert.equal(usage.checkedAt, '2026-09-20T12:00:00.000Z');
  // One listing is enough when the listing already carries the sizes.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].auth, 'Bearer cf-read-token');
});

test('a database the listing did not size is asked for by itself, and nothing beyond the cap is asked for at all', async () => {
  const calls = [];
  const many = Array.from({length: 40}, (_, index) => db(`d${index}`, 1024));
  const usage = await measureUsage(environment(), {fetcher: cloudflare(many, {calls, detailOnly: true})});
  assert.equal(usage.databases.length, 25);
  assert.equal(calls.length, 26);
});

// On the free plan the account limit is ten times the per-database one, so it
// only becomes the nearer of the two once there are more than ten databases.
test('the account limit takes over when it is the nearer one', async () => {
  const usage = await measureUsage(environment(), {fetcher: cloudflare(Array.from({length: 12}, (_, index) => db(`d${index}`, 380 * MB)))});
  assert.equal(usage.worst, 'account');
  assert.equal(usage.totalBytes, 4560 * MB);
  assert.ok(usage.fraction > 380 * MB / (500 * MB));
});

test('the paid plan changes the limits without changing anything else', async () => {
  const usage = await measureUsage(environment({CLOUDFLARE_PLAN: 'paid'}), {fetcher: cloudflare([db('a', 600 * MB)])});
  assert.equal(usage.plan, 'Paid');
  assert.equal(usage.databaseLimitBytes, 10 * GB);
  assert.ok(usage.fraction < 0.1);
});

test('an unconfigured Worker says which secret is missing instead of guessing a size', async () => {
  for (const missing of [{CLOUDFLARE_API_TOKEN: undefined}, {CLOUDFLARE_ACCOUNT_ID: undefined}]) {
    const response = await call(environment(missing), '/v1/storage');
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /CLOUDFLARE_API_TOKEN/);
  }
});

test('a token Cloudflare rejects names the permission it needs and never echoes the token', async () => {
  const env = environment();
  const refused = async () => Response.json({success: false, errors: [{message: 'Authentication error'}]}, {status: 403});
  await assert.rejects(() => measureUsage(env, {fetcher: refused}), error => {
    assert.equal(error.status, 403);
    assert.match(error.message, /Account · D1 · Read/);
    assert.ok(!error.message.includes('cf-read-token'));
    return true;
  });
});

test('the route is authenticated, GET only, and returns the figure without the notification bookkeeping', async () => {
  const env = environment();
  assert.equal((await call(env, '/v1/storage', 'GET', null)).status, 401);
  assert.equal((await call(env, '/v1/storage', 'POST')).status, 405);
  globalThis.fetch = cloudflare([db('erics-personal-tools', 310000)]);
  const body = await (await call(env, '/v1/storage')).json();
  assert.equal(body.totalBytes, 310000);
  assert.equal(body.notified, undefined);
  assert.equal(env.sql.prepare('SELECT count(*) AS n FROM storage_usage').get().n, 1);
});

test('a saved reading stands for an hour, is taken again after it, and survives Cloudflare going away', async () => {
  const env = environment();
  let served = 0;
  const counting = databases => async (...args) => {served++; return cloudflare(databases)(...args);};
  const first = await readUsage(env, {fetcher: counting([db('a', 1000)]), now: new Date('2026-09-20T12:00:00Z')});
  assert.equal(first.totalBytes, 1000);
  // Within the hour nothing is asked of Cloudflare again.
  const cached = await readUsage(env, {fetcher: counting([db('a', 9999)]), now: new Date('2026-09-20T12:30:00Z')});
  assert.equal(cached.totalBytes, 1000);
  assert.equal(served, 1);
  const later = await readUsage(env, {fetcher: counting([db('a', 2000)]), now: new Date('2026-09-20T13:30:00Z')});
  assert.equal(later.totalBytes, 2000);
  // A refusal keeps the reading already in hand and marks how it got there.
  const stale = await readUsage(env, {fetcher: async () => {throw Error('network down');}, now: new Date('2026-09-20T15:00:00Z'), refresh: true});
  assert.equal(stale.totalBytes, 2000);
  assert.equal(stale.stale, true);
  assert.equal(stale.checkedAt, '2026-09-20T13:30:00.000Z');
});

test('the hourly sweep speaks once per band crossed, stays quiet above it, and re-arms on the way down', async () => {
  const env = environment();
  const sent = [];
  const notify = async (_env, message) => {sent.push(message);};
  const sweep = (bytes, at) => sweepStorage(env, {fetcher: cloudflare([db('erics-personal-tools', bytes)]), now: new Date(at), notify});

  assert.deepEqual(await sweep(100 * MB, '2026-09-20T12:00:00Z'), {checked: true, notified: false, band: null});
  assert.equal(sent.length, 0);

  const crossed = await sweep(400 * MB, '2026-09-20T13:00:00Z');
  assert.equal(crossed.notified, true);
  assert.equal(crossed.band, 0.75);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'Cloudflare storage 80% full');
  assert.equal(sent[0].tag, 'storage');
  assert.match(sent[0].body, /400 MB of 500 MB/);

  // Still above the same band an hour later: nothing more is said.
  await sweep(410 * MB, '2026-09-20T14:00:00Z');
  assert.equal(sent.length, 1);

  // The next band up is its own piece of news.
  await sweep(470 * MB, '2026-09-20T15:00:00Z');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].title, 'Cloudflare storage 94% full');

  // Trimmed back below every band, then grown again — reported both times.
  await sweep(10 * MB, '2026-09-20T16:00:00Z');
  assert.equal(sent.length, 2);
  await sweep(400 * MB, '2026-09-20T17:00:00Z');
  assert.equal(sent.length, 3);
});

test('the sweep does not notify from a reading it could not take, and never fails the hour', async () => {
  const env = environment();
  const sent = [];
  const notify = async (_env, message) => {sent.push(message);};
  await sweepStorage(env, {fetcher: cloudflare([db('a', 400 * MB)]), now: new Date('2026-09-20T12:00:00Z'), notify});
  assert.equal(sent.length, 1);
  env.sql.prepare('DELETE FROM storage_usage WHERE id = ?').run(USAGE_ID);
  // Nothing saved and Cloudflare unreachable: it reports that it did not check.
  assert.deepEqual(await sweepStorage(env, {fetcher: async () => {throw Error('down');}, notify}), {checked: false});
  // A reading it has, but could not take again, is not fresh enough to act on.
  await sweepStorage(env, {fetcher: cloudflare([db('a', 100 * MB)]), now: new Date('2026-09-20T13:00:00Z'), notify});
  assert.deepEqual(await sweepStorage(env, {fetcher: async () => {throw Error('down');}, now: new Date('2026-09-20T14:00:00Z'), notify}), {checked: false});
  // A Worker with no Cloudflare token checks nothing rather than throwing.
  assert.deepEqual(await sweepStorage(environment({CLOUDFLARE_API_TOKEN: undefined}), {notify}), {checked: false});
  // Push being unconfigured loses the notification, not the hour.
  env.sql.prepare('DELETE FROM storage_usage WHERE id = ?').run(USAGE_ID);
  const thrown = await sweepStorage(env, {fetcher: cloudflare([db('a', 480 * MB)]), now: new Date('2026-09-20T15:00:00Z'),
    notify: async () => {throw {status: 503, message: 'Push is not configured on this Worker.'};}});
  assert.equal(thrown.notified, false);
  // Nothing was recorded as announced, so a working push says it next hour.
  const retried = await sweepStorage(env, {fetcher: cloudflare([db('a', 480 * MB)]), now: new Date('2026-09-20T16:00:00Z'), notify});
  assert.equal(retried.notified, true);
});
