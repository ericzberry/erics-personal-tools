import test from 'node:test';
import assert from 'node:assert/strict';
import {passkeyVault, VAULT_KEY, LEGACY_KEY, encode} from '../public/app/passkey-vault.js';
import {idleSession, IDLE_MS} from '../../chrome-sidebar/src/idle-session.js';
import {secretVault, sealSecret, PRF_SALT} from '../../chrome-sidebar/src/secret-vault.js';
const token = 'synthetic-private-token-at-least-32-characters';
// A passkey asked by the record vault directly: one salt, answered with the same
// bytes this fixture's authenticator gives for that salt as a second result.
function recordPasskey(seed) {
  return {async get({publicKey}) {
    const auth = new Uint8Array(37);
    auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com'))));
    auth[32] = 5;
    return {id: encode(new TextEncoder().encode('passkey-1')),
      response: {authenticatorData: auth, clientDataJSON: new TextEncoder().encode(JSON.stringify({type: 'webauthn.get', origin: 'https://example.com', challenge: encode(publicKey.challenge)}))},
      getClientExtensionResults: () => ({prf: {results: {first: seed.slice().buffer}}})};
  }};
}
function fixture() {
  const data = new Map(), storage = {getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
  let counter = 0, seed = new Uint8Array(32).fill(17), flags = 5, supported = true, cancel = false, wrongOrigin = false;
  // A real authenticator answers each salt with its own HMAC. This one keeps a
  // separate reply per salt, so asking for two gets two.
  let records = new Uint8Array(32).fill(41), recordSalt = null;
  const handles = [];
  const credentials = {
    async create({publicKey}) {
      handles.push(encode(publicKey.user.id));
      assert.equal(publicKey.authenticatorSelection.userVerification, 'required');
      assert.equal(publicKey.authenticatorSelection.residentKey, 'required');
      assert.equal(publicKey.authenticatorSelection.authenticatorAttachment, 'platform');
      return {id: encode(new TextEncoder().encode(`passkey-${++counter}`)), getClientExtensionResults: () => ({prf: {enabled: supported}})};
    },
    async get({publicKey}) {
      if (cancel) throw new DOMException('Canceled', 'NotAllowedError');
      assert.equal(publicKey.userVerification, 'required');
      assert.equal(publicKey.allowCredentials.length, 1);
      assert.deepEqual(publicKey.allowCredentials[0].transports, ['internal']);
      const auth = new Uint8Array(37); auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com')))); auth[32] = flags;
      recordSalt = publicKey.extensions.prf.eval.second || null;
      const results = {first: seed.slice().buffer, ...(recordSalt ? {second: records.slice().buffer} : {})};
      return {id: encode(publicKey.allowCredentials[0].id), response: {authenticatorData: auth, clientDataJSON: new TextEncoder().encode(JSON.stringify({type: 'webauthn.get', origin: wrongOrigin ? 'https://evil.example' : 'https://example.com', challenge: encode(publicKey.challenge)}))}, getClientExtensionResults: () => ({prf: supported ? {results} : {}})};
    }
  };
  const options = {storage, credentials, origin: 'https://example.com', rpId: 'example.com', recordSalt: PRF_SALT};
  return {data, storage, options, handles, vault: passkeyVault(options), salt: () => recordSalt,
    set: value => { if ('flags' in value) flags = value.flags; if ('seed' in value) seed = value.seed; if ('supported' in value) supported = value.supported; if ('cancel' in value) cancel = value.cancel; if ('wrongOrigin' in value) wrongOrigin = value.wrongOrigin; if ('records' in value) records = value.records; }};
}
test('passkey encrypts the legacy token; a cold offline reopen requires PRF to recover it', async () => {
  const f = fixture(); f.storage.setItem(LEGACY_KEY, token);
  await f.vault.prepare(token); assert.equal(f.storage.getItem(VAULT_KEY), null); assert.equal(f.storage.getItem(LEGACY_KEY), token);
  assert.equal((await f.vault.finish()).token, token);
  assert.equal(f.storage.getItem(LEGACY_KEY), null);
  assert.ok(!f.storage.getItem(VAULT_KEY).includes(token));
  assert.equal((await passkeyVault(f.options).unlock()).token, token);
  f.set({seed: new Uint8Array(32).fill(18)});
  await assert.rejects(passkeyVault(f.options).unlock(), /could not open/);
});
test('canceled/unsupported verification leaves the old envelope and pending data intact', async () => {
  const f = fixture(); await f.vault.prepare(token); await f.vault.finish();
  const old = f.storage.getItem(VAULT_KEY);
  await f.vault.prepare(token); f.set({cancel: true});
  await assert.rejects(f.vault.finish(), {name: 'NotAllowedError'});
  assert.equal(f.storage.getItem(VAULT_KEY), old);
  f.set({cancel: false, supported: false});
  await assert.rejects(f.vault.finish(), /cannot unlock/);
  assert.equal(f.storage.getItem(VAULT_KEY), old);
  await assert.rejects(f.vault.prepare(token), /does not support/);
});
test('recovery requires the original token and validates the replacement before committing', async () => {
  const f = fixture(); await f.vault.prepare(token); await f.vault.finish();
  const old = f.vault.record();
  await assert.rejects(f.vault.prepare('different-private-token-of-at-least-32-characters'), /original/);
  f.set({seed: new Uint8Array(32).fill(99)});
  await f.vault.prepare(token); await f.vault.finish();
  assert.notEqual(f.vault.record().id, old.id);
  assert.equal((await f.vault.unlock()).token, token);
});
test('new enrollment validation failure never persists an invalid token', async () => {
  const f = fixture(); await f.vault.prepare(token);
  await assert.rejects(f.vault.finish({validate: () => { throw Error('Rejected'); }}), /Rejected/);
  assert.equal(f.vault.record(), null);
});
test('verification rejects missing user verification, wrong origin, and tampered ciphertext', async () => {
  const f = fixture(); await f.vault.prepare(token); await f.vault.finish();
  f.set({flags: 1}); await assert.rejects(f.vault.unlock(), /verification failed/);
  f.set({flags: 5, wrongOrigin: true}); await assert.rejects(f.vault.unlock(), /verification failed/);
  f.set({wrongOrigin: false});
  const saved = f.vault.record(); saved.ciphertext = encode(new Uint8Array(60)); f.storage.setItem(VAULT_KEY, JSON.stringify(saved));
  await assert.rejects(f.vault.unlock(), /could not open/);
});
test('disconnect removes wrapped and legacy credentials; migration cannot change the data key', async () => {
  const f = fixture(); f.storage.setItem(LEGACY_KEY, token);
  await assert.rejects(f.vault.prepare('different-private-token-of-at-least-32-characters'), /existing token/);
  await f.vault.prepare(token); await f.vault.finish(); f.vault.disconnect();
  assert.equal(f.storage.getItem(VAULT_KEY), null); assert.equal(f.storage.getItem(LEGACY_KEY), null);
  await assert.rejects(f.vault.unlock(), /Set up/);
});
test('activity extends an unlocked session; expired activity cannot revive it', () => {
  let now = 100, locks = 0;
  const session = idleSession({now: () => now, onLock: () => locks++});
  assert.equal(session.check(), false); session.start();
  now += IDLE_MS - 1; assert.equal(session.check(), true); session.touch();
  now += IDLE_MS - 1; assert.equal(session.check(), true);
  now++; session.touch(); assert.equal(session.check(), false); assert.equal(locks, 1);
  session.lock(); assert.equal(locks, 1);
  session.start(); now -= 1; assert.equal(session.check(), false); assert.equal(locks, 2);
});
test('suspended page is checked against wall time; full restart starts locked', () => {
  let now = 100;
  const session = idleSession({now: () => now}); session.start();
  now += IDLE_MS + 50000; assert.equal(session.check(), false);
  assert.equal(idleSession().check(), false);
});
test('enrolling again renews the one passkey instead of leaving another entry behind', async () => {
  // An authenticator files a resident credential under rp.id and user.id
  // together. A handle that changed between enrollments made every repeated
  // setup — and every recovery — add a second passkey under the same name, so
  // the browser had to ask which one to use and only one of them held the key.
  const f = fixture();
  await f.vault.prepare(token); await f.vault.finish();
  f.set({seed: new Uint8Array(32).fill(99)});
  await f.vault.prepare(token); await f.vault.finish();
  assert.equal(f.handles.length, 2);
  assert.equal(f.handles[0], f.handles[1], 'the same user handle is what makes the second enrollment replace the first');
  assert.equal((await f.vault.unlock()).token, token);
});

test('unlocking the app also opens its sealed records, without a second passkey prompt', async () => {
  // One assertion, two salts. The lock's own salt unwraps this device's token;
  // the record vault's salt yields the key its sections need, so opening
  // Finance right after unlocking the app does not ask for the passkey again.
  const f = fixture();
  await f.vault.prepare(token);
  await f.vault.finish();
  const opened = await f.vault.unlock();
  assert.equal(opened.token, token);
  assert.equal(encode(f.salt()), encode(PRF_SALT), 'the lock must evaluate the record vault’s salt');
  assert.equal(opened.records.length, 32);

  // The same passkey, asked directly by the record vault, evaluates that salt as
  // its own `first`. Both routes must arrive at one key, or a record sealed on
  // the sidebar would not open here.
  const direct = secretVault({credentials: recordPasskey(new Uint8Array(32).fill(41)), origin: 'https://example.com', rpId: 'example.com', subtle: crypto.subtle, store: null, credentialStore: null});
  const sealed = await sealSecret(await direct.key(), 'entry-1', {number: '4111111111111111'});

  const adopted = secretVault({credentials: {get: async () => { throw Error('asked for the passkey a second time'); }}, origin: 'https://example.com', rpId: 'example.com', subtle: crypto.subtle, store: null, credentialStore: null});
  assert.equal(adopted.unlocked(), false);
  await adopted.unlockWithPasskeySeed(opened.records);
  assert.equal(adopted.unlocked(), true);
  assert.deepEqual(await adopted.open('entry-1', sealed), {number: '4111111111111111'});
  // Handed over, the seed is gone from the caller's copy.
  assert.ok(opened.records.every(byte => byte === 0));
});

test('a passkey that evaluates only one salt still unlocks the app', async () => {
  // Then the record vault has nothing to adopt and each section asks for itself,
  // exactly as it did before the two were joined.
  const f = fixture();
  await f.vault.prepare(token);
  await f.vault.finish();
  const plain = passkeyVault({...f.options, recordSalt: null});
  const opened = await plain.unlock();
  assert.equal(opened.token, token);
  assert.equal(f.salt(), null);
  assert.equal(opened.records, null);
});
