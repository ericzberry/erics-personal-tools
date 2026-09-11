import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';

// Drives the built frame the way the lock screen does: one postMessage carrying
// the token and the record key from the same passkey assertion. The frame must
// adopt that key before its tools mount, or opening Finance asks again.
test('the unlocked frame adopts the record key the lock handed it', async () => {
  const {document, window} = parseHTML('<html><body><main id="capabilities-root"></main></body></html>');
  const posted = [];
  const parent = {postMessage: (value) => posted.push(value)};
  window.ResizeObserver = class { observe() {} };
  window.requestAnimationFrame = callback => { callback(); return 1; };
  window.MutationObserver ??= class { observe() {} };
  Object.assign(globalThis, {window, document, parent, location: {origin: 'https://example.com'}});

  const {sharedVault, sealSecret, encode, PRF_SALT} = await import('../dist/app/shared/secret-vault.js');
  // What the lock's assertion returns for the record vault's salt.
  const seed = new Uint8Array(32).fill(23);
  // The same passkey asked by the vault directly evaluates that salt as its own
  // first result, so this is the key the records were sealed with.
  const direct = await import('../dist/app/shared/secret-vault.js').then(module => module.secretVault({
    credentials: {async get({publicKey}) {
      const auth = new Uint8Array(37);
      auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example.com'))));
      auth[32] = 5;
      return {id: 'passkey', response: {authenticatorData: auth, clientDataJSON: new TextEncoder().encode(JSON.stringify({type: 'webauthn.get', origin: 'https://example.com', challenge: encode(publicKey.challenge)}))},
        getClientExtensionResults: () => ({prf: {results: {first: seed.slice().buffer}}})};
    }},
    origin: 'https://example.com', rpId: 'example.com', subtle: crypto.subtle, store: null, credentialStore: null
  }));
  const sealed = await sealSecret(await direct.key(), 'entry-1', {number: '4111111111111111'});

  await import('../dist/app/unlocked.js');
  assert.deepEqual(posted, [{type: 'mobile-ready'}], 'the frame announces itself before the lock replies');

  const event = new window.Event('message');
  Object.assign(event, {source: parent, origin: 'https://example.com',
    data: {type: 'mobile-unlock', token: 'synthetic-private-token-at-least-32-characters', records: encode(seed)}});
  window.dispatchEvent(event);
  // The tools themselves cannot mount in this host; the adoption ahead of them can.
  for (let i = 0; i < 200 && !sharedVault().unlocked(); i++) await new Promise(resolve => setTimeout(resolve, 1));

  assert.equal(sharedVault().unlocked(), true, 'the frame is open before a section can ask');
  assert.deepEqual(await sharedVault().open('entry-1', sealed), {number: '4111111111111111'},
    'and holds the same key the records were sealed with');
});
