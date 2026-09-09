import test from 'node:test';
import assert from 'node:assert/strict';
import {passkeyVault, idleSession, IDLE_MS, VAULT_KEY, LEGACY_KEY, encode} from '../public/app/passkey-vault.js';
const token = 'synthetic-private-token-at-least-32-characters';
function fixture() {
  const data = new Map(), storage = {getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
  let counter = 0, seed = new Uint8Array(32).fill(17), flags = 5, supported = true, cancel = false, wrongOrigin = false;
  const credentials = {
    async create({publicKey}) {
      assert.equal(publicKey.authenticatorSelection.userVerification, 'required');
      assert.equal(publicKey.authenticatorSelection.residentKey, 'required');
      return {id: encode(new TextEncoder().encode(`passkey-${++counter}`)), getClientExtensionResults: () => ({prf: {enabled: supported}})};
    },
    async get({publicKey}) {
      if (cancel) throw new DOMException('Canceled', 'NotAllowedError');
      assert.equal(publicKey.userVerification, 'required');
      const auth = new Uint8Array(37); auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com')))); auth[32] = flags;
      return {id: encode(publicKey.allowCredentials[0].id), response: {authenticatorData: auth, clientDataJSON: new TextEncoder().encode(JSON.stringify({type: 'webauthn.get', origin: wrongOrigin ? 'https://evil.example' : 'https://example.com', challenge: encode(publicKey.challenge)}))}, getClientExtensionResults: () => ({prf: supported ? {results: {first: seed.slice().buffer}} : {}})};
    }
  };
  const options = {storage, credentials, origin: 'https://example.com', rpId: 'example.com'};
  return {data, storage, options, vault: passkeyVault(options), set: value => { if ('flags' in value) flags = value.flags; if ('seed' in value) seed = value.seed; if ('supported' in value) supported = value.supported; if ('cancel' in value) cancel = value.cancel; if ('wrongOrigin' in value) wrongOrigin = value.wrongOrigin; }};
}
test('passkey encrypts the legacy token; a cold offline reopen requires PRF to recover it', async () => {
  const f = fixture(); f.storage.setItem(LEGACY_KEY, token);
  await f.vault.prepare(token); assert.equal(f.storage.getItem(VAULT_KEY), null); assert.equal(f.storage.getItem(LEGACY_KEY), token);
  assert.equal(await f.vault.finish(), token);
  assert.equal(f.storage.getItem(LEGACY_KEY), null);
  assert.ok(!f.storage.getItem(VAULT_KEY).includes(token));
  assert.equal(await passkeyVault(f.options).unlock(), token);
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
  assert.equal(await f.vault.unlock(), token);
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
