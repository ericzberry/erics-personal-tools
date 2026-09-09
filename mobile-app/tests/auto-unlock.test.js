import test from 'node:test';
import assert from 'node:assert/strict';
import {autoUnlock} from '../public/app/auto-unlock.js';
test('opening and duplicate pageshow events prompt once; returning prompts again', async () => {
  let calls = 0;
  const gate = autoUnlock({eligible: () => true, unlock: async () => { calls++; }});
  await gate.request(); await gate.request(); assert.equal(calls, 1);
  gate.background(); await gate.request(); assert.equal(calls, 2);
});
test('canceled prompts and their visibility events do not cause a retry loop', async () => {
  let calls = 0, finish;
  const gate = autoUnlock({eligible: () => true, unlock: () => { calls++; return new Promise(resolve => { finish = resolve; }); }});
  const request = gate.request(); gate.background(); await gate.request();
  assert.equal(calls, 1); finish(); await request; await gate.request(); assert.equal(calls, 1);
  gate.background(); const next = gate.request(); assert.equal(calls, 2); finish(); await next;
});
test('setup, recovery, unlocked, unsupported, hidden and busy states do not consume an attempt', async () => {
  let allowed = false, calls = 0;
  const gate = autoUnlock({eligible: () => allowed, unlock: async () => { calls++; }});
  await gate.request(); assert.equal(calls, 0); allowed = true;
  await gate.request(); assert.equal(calls, 1);
});
test('Lock now stays locked until another visit; failures allow a later foreground retry', async () => {
  let calls = 0;
  const gate = autoUnlock({eligible: () => true, unlock: async () => { calls++; throw Error('denied'); }});
  gate.suppress(); await gate.request(); assert.equal(calls, 0);
  gate.background(); await assert.rejects(gate.request(), /denied/);
  await gate.request(); assert.equal(calls, 1);
  gate.background(); await assert.rejects(gate.request(), /denied/); assert.equal(calls, 2);
});

test('idle expiry is distinguishable from deliberate locking', async () => {
  const {idleSession, IDLE_MS} = await import('../public/app/passkey-vault.js');
  let now = 0; const reasons = [];
  const session = idleSession({now: () => now, onLock: reason => reasons.push(reason)});
  session.start(); now = IDLE_MS; session.check();
  session.start(); session.lock();
  assert.deepEqual(reasons, ['idle', 'manual']);
});
