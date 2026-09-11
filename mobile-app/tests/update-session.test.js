import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {VAULT_KEY, encode} from '../public/app/passkey-vault.js';

// Applying an update reloads the shell. These tests drive the lock screen the
// way that reload does, because the passkey the owner gave a moment earlier
// must still be the only one the update costs them.
const token = 'synthetic-private-token-at-least-32-characters';
const name = value => encode(new TextEncoder().encode(value));
const saved = {version: 1, id: name('passkey-1'), rpId: 'example.com', salt: 'c2FsdA', iv: 'aXY', ciphertext: 'Y2lwaGVy', fingerprint: 'ZmluZ2Vy'};
const store = keep => ({
  getItem: key => (keep.has(key) ? keep.get(key) : null),
  setItem: (key, value) => keep.set(key, String(value)),
  removeItem: key => keep.delete(key)
});

let take = 0;
async function mount(carried) {
  const {document, window} = parseHTML('<html><body><div id="capabilities-root"></div></body></html>');
  window.isSecureContext = true;
  window.PublicKeyCredential = class {};
  const asked = {count: 0};
  const held = new Map();
  if (carried) held.set('mobileUnlockHandoff.v1', JSON.stringify(carried));
  const local = new Map([[VAULT_KEY, JSON.stringify(saved)]]);
  const timer = globalThis.setInterval;
  globalThis.setInterval = () => 0;
  Object.assign(globalThis, {
    window, document, sessionStorage: store(held), localStorage: store(local),
    location: {origin: 'https://example.com', hostname: 'example.com'}
  });
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {credentials: {
    create: async () => { throw Error('enrollment must not happen here'); },
    get: async () => { asked.count++; throw new DOMException('Canceled', 'NotAllowedError'); }
  }}});
  const module = await import(`${new URL('../dist/app/mobile-security.js', import.meta.url)}?take=${++take}`);
  globalThis.setInterval = timer;
  await new Promise(resolve => setTimeout(resolve, 0));
  return {module, document, asked, held};
}

test('an update carries the unlock across its reload instead of asking again', async () => {
  const at = Date.now();
  const {document, asked, held} = await mount({at, id: saved.id, token, records: encode(new Uint8Array(32).fill(41))});
  assert.equal(asked.count, 0, 'the passkey given moments ago is not asked for a second time');
  assert.ok(document.querySelector('.mobile-tools-frame'), 'the tools reopen on the new version');
  assert.equal(document.querySelector('.mobile-lock').hidden, true);
  assert.equal(held.size, 0, 'the carried unlock is removed as it is read, so it is usable once');
});

test('the unlock a reload carries is the one the lock wrote', async () => {
  const first = await mount({at: Date.now(), id: saved.id, token, records: encode(new Uint8Array(32).fill(41))});
  assert.equal(first.module.carrySession(), true);
  assert.equal(first.held.size, 1, 'the lock hands the open session to the page that replaces it');
  const carried = JSON.parse([...first.held.values()][0]);
  assert.equal(carried.token, token);
  const second = await mount(carried);
  assert.equal(second.asked.count, 0);
  assert.ok(second.document.querySelector('.mobile-tools-frame'));
});

test('an unlock older than the reload, or for another lock, still asks', async () => {
  const stale = await mount({at: Date.now() - 60000, id: saved.id, token, records: ''});
  assert.equal(stale.asked.count, 1, 'nothing carried means the passkey is asked for');
  assert.equal(stale.document.querySelector('.mobile-tools-frame'), null);
  assert.equal(stale.held.size, 0, 'and the stale unlock is discarded rather than kept');
  const other = await mount({at: Date.now(), id: name('passkey-2'), token, records: ''});
  assert.equal(other.asked.count, 1);
  assert.equal(other.document.querySelector('.mobile-tools-frame'), null);
});

test('a locked app hands nothing to the page that replaces it', async () => {
  const {module, held} = await mount(null);
  assert.equal(module.carrySession(), false);
  assert.equal(held.size, 0);
});
