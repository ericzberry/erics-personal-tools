import test from 'node:test';
import assert from 'node:assert/strict';
import {initialize, mobileCredentials, mobileRequest, protectedStore} from '../public/app/mobile-session.js';
const token = 'synthetic-private-token-at-least-32-characters';
test('mobile operations check the live lock before requests and before exposing responses', async () => {
  let allowed = true, calls = 0, disconnects = 0;
  globalThis.window = {};
  globalThis.parent = {mobileAccessAllowed: () => allowed, postMessage: () => disconnects++};
  globalThis.location = {origin: 'https://example.com'};
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { calls++; return Response.json({records: []}); };
  try {
    initialize(token);
    assert.equal(await mobileCredentials.get(), token);
    allowed = false;
    await assert.rejects(mobileCredentials.get(), /Unlock/);
    await assert.rejects(mobileRequest(token, '/v1/travel'), /Unlock/);
    assert.equal(calls, 0);
    allowed = true;
    await assert.rejects(mobileCredentials.set('replacement'), /Disconnect/);
    assert.deepEqual(await mobileRequest(token, '/v1/travel'), {records: []});
    globalThis.fetch = async () => { calls++; allowed = false; return Response.json({private: 'must not escape'}); };
    await assert.rejects(mobileRequest(token, '/v1/travel'), /Unlock/);
    allowed = true;
    const store = protectedStore({read: async () => { allowed = false; return 'private'; }});
    await assert.rejects(store.read('travel', token), /Unlock/);
    allowed = true;
    await mobileCredentials.remove(); assert.equal(disconnects, 1);
    await assert.rejects(mobileCredentials.get(), /Unlock/);
  } finally { globalThis.fetch = previous; delete globalThis.window; delete globalThis.parent; delete globalThis.location; }
});
