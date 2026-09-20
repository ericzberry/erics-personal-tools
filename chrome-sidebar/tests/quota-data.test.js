import test from 'node:test';
import assert from 'node:assert/strict';
import {D1_PLANS, planFor, BANDS, bandFor, formatBytes, usageSummary, usageAlert} from '../src/quota-data.js';

const MB = 1024 * 1024, GB = 1024 * MB;
const reading = (bytes, {plan = 'Free', total = bytes, worst = 'database'} = {}) => ({
  plan, checkedAt: '2026-09-20T12:00:00.000Z',
  databases: [{name: 'erics-personal-tools', bytes, tables: 24}],
  totalBytes: total, databaseLimitBytes: 500 * MB, accountLimitBytes: 5 * GB,
  fraction: worst === 'database' ? bytes / (500 * MB) : total / (5 * GB), worst
});

test('the free plan is the default and both of its limits are the published ones', () => {
  assert.equal(planFor(undefined), D1_PLANS.free);
  assert.equal(planFor('anything'), D1_PLANS.free);
  assert.equal(planFor('paid'), D1_PLANS.paid);
  assert.equal(D1_PLANS.free.database, 500 * MB);
  assert.equal(D1_PLANS.free.account, 5 * GB);
  assert.equal(D1_PLANS.free.databases, 10);
  assert.equal(D1_PLANS.paid.database, 10 * GB);
  assert.equal(D1_PLANS.paid.account, 250 * GB);
});

test('a band is only reached from below it, and an unreadable fraction reaches none', () => {
  assert.equal(bandFor(0), null);
  assert.equal(bandFor(0.74), null);
  assert.equal(bandFor(0.75), 0.75);
  assert.equal(bandFor(0.89), 0.75);
  assert.equal(bandFor(0.9), 0.9);
  assert.equal(bandFor(1), 1);
  assert.equal(bandFor(4), 1);
  for (const value of [null, undefined, NaN, 'most']) assert.equal(bandFor(value), null);
  assert.deepEqual(BANDS, [0.75, 0.9, 1]);
});

test('sizes are written the way a person reads them', () => {
  assert.equal(formatBytes(0), '0 bytes');
  assert.equal(formatBytes(940), '940 bytes');
  assert.equal(formatBytes(303 * 1024), '303 kB');
  assert.equal(formatBytes(1.5 * MB), '1.5 MB');
  assert.equal(formatBytes(500 * MB), '500 MB');
  assert.equal(formatBytes(5 * GB), '5 GB');
  for (const value of [undefined, -1, NaN]) assert.equal(formatBytes(value), '—');
});

test('a small database reads as under one percent and takes no tone', () => {
  const summary = usageSummary(reading(310000));
  assert.equal(summary.label, '<1%');
  assert.equal(summary.headline, '303 kB of 500 MB · <1%');
  assert.equal(summary.scope, 'erics-personal-tools');
  assert.equal(summary.tone, '');
});

test('an empty account still reads as zero rather than as nothing', () => {
  assert.equal(usageSummary(reading(0)).label, '0%');
  assert.equal(usageSummary(null), null);
  assert.equal(usageSummary({fraction: 'unknown'}), null);
});

test('crossing the first band earns alert and the limit itself earns error', () => {
  assert.equal(usageSummary(reading(0.74 * 500 * MB)).tone, '');
  assert.equal(usageSummary(reading(0.8 * 500 * MB)).tone, 'alert');
  assert.equal(usageSummary(reading(0.95 * 500 * MB)).tone, 'alert');
  assert.equal(usageSummary(reading(500 * MB)).tone, 'error');
});

test('the account limit is reported when it is the nearer of the two', () => {
  const summary = usageSummary(reading(400 * MB, {total: 4.5 * GB, worst: 'account'}));
  assert.equal(summary.scope, 'across the account');
  assert.equal(summary.limit, 5 * GB);
  assert.equal(summary.used, 4.5 * GB);
  assert.equal(summary.tone, 'alert');
});

test('the notification names the size, the limit and the plan, and no table or record', () => {
  const alert = usageAlert(reading(0.92 * 500 * MB));
  assert.equal(alert.title, 'Cloudflare storage 92% full');
  assert.equal(alert.body, '460 MB of 500 MB erics-personal-tools on the Free plan.');
  assert.equal(usageAlert(null), null);
});
