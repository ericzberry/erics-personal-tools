const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/schedule.js');

const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const times = ['08:00', '11:00', '14:00', '17:00'];

test('normalizes, sorts and de-duplicates times, dropping junk', () => {
  assert.deepEqual(S.normalizeTimes(['14:00', '8:00', '08:00', '25:00', 'x', '9:61']), [480, 840]);
});

test('last delivery is the latest scheduled time at or before now', () => {
  assert.equal(S.lastScheduled(at(2026, 11, 20, 12, 30), times), at(2026, 11, 20, 11, 0));
  assert.equal(S.lastScheduled(at(2026, 11, 20, 11, 0), times), at(2026, 11, 20, 11, 0));
});

test('before the first delivery, the last one is yesterday evening', () => {
  assert.equal(S.lastScheduled(at(2026, 11, 20, 7, 0), times), at(2026, 11, 19, 17, 0));
});

test('next delivery rolls over to tomorrow after the last one', () => {
  assert.equal(S.nextScheduled(at(2026, 11, 20, 18, 0), times), at(2026, 11, 21, 8, 0));
  assert.equal(S.nextScheduled(at(2026, 11, 20, 9, 0), []), null);
});

test('Deliver now moves the cutoff forward; off holds nothing', () => {
  const now = at(2026, 11, 20, 12, 30);
  assert.equal(S.cutoff(now, { times }, at(2026, 11, 20, 12, 0)), at(2026, 11, 20, 12, 0));
  assert.equal(S.cutoff(now, { times }, at(2026, 11, 20, 9, 0)), at(2026, 11, 20, 11, 0));
  assert.equal(S.cutoff(now, { enabled: false, times }, 0), Infinity);
  assert.equal(S.cutoff(now, { times: [] }, 0), 0);
});

test('parses Gmail date titles in their known shapes', () => {
  assert.equal(S.parseGmailDate('Fri, Nov 20, 2026, 9:00 AM'), at(2026, 11, 20, 9, 0));
  assert.equal(S.parseGmailDate('Fri, Nov 20, 2026, 9:00 AM'), at(2026, 11, 20, 9, 0));
  assert.equal(S.parseGmailDate('Thu, Nov 19, 2026 at 3:05 PM'), at(2026, 11, 19, 15, 5));
  assert.equal(S.parseGmailDate('nonsense'), null);
  assert.equal(S.parseGmailDate(''), null);
});

test('held means a later minute than the cutoff; undated rows are never held', () => {
  const cut = at(2026, 11, 20, 11, 0);
  assert.equal(S.isHeld(at(2026, 11, 20, 11, 1), cut), true);
  assert.equal(S.isHeld(at(2026, 11, 20, 11, 0), cut), false);
  assert.equal(S.isHeld(at(2026, 11, 20, 10, 59), cut), false);
  assert.equal(S.isHeld(null, cut), false);
  assert.equal(S.isHeld(at(2026, 11, 20, 23, 0), Infinity), false);
});
