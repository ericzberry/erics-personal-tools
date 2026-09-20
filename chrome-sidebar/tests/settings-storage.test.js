import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

const MB = 1024 * 1024;
// The reading the Worker returns, as the Settings page receives it.
const reading = (bytes, extra = {}) => ({
  plan: 'Free', checkedAt: '2026-09-20T12:00:00.000Z',
  databases: [{name: 'erics-personal-tools', bytes, tables: 24}, {name: 'scratch', bytes: 4096, tables: 1}],
  totalBytes: bytes + 4096, databaseLimitBytes: 500 * MB, accountLimitBytes: 5 * 1024 * MB,
  fraction: bytes / (500 * MB), worst: 'database', ...extra
});

test('the cloud storage panel shows the size against the limit, tones only when it matters, and refreshes on request', async () => {
  const {document, window} = parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.document = document; globalThis.window = window;
  globalThis.location = {protocol: 'chrome-extension:'};
  const $ = id => document.getElementById(id);
  const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get: selectValue.get,
    set(value) {for (const option of this.options) option.selected = option.value === value;}});

  let connected = false, usage = reading(310000), asked = [];
  globalThis.chrome = {runtime: {sendMessage: async message => {
    if (message.action === 'status') return {ok: true, connected};
    if (message.action === 'connect') {connected = true; return {ok: true, connected};}
    if (message.action === 'disconnect') {connected = false; return {ok: true, connected};}
    if (message.action === 'list') return {ok: true, connections: []};
    if (message.action === 'ai-tasks') return {ok: true, tasks: []};
    if (message.action === 'migrate') return {ok: true, moved: 0};
    if (message.action === 'storage') {
      asked.push(!!message.refresh);
      if (usage instanceof Error) return {ok: false, error: usage.message};
      return {ok: true, ...usage};
    }
    return {ok: true};
  }}};
  const settle = async () => {for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));};
  await import('../src/settings-page.js');

  // Nothing is asked of the Worker before this browser is connected.
  assert.deepEqual(asked, []);
  assert.equal($('storage-refresh').disabled, true);

  $('settings-token').value = 'private-extension-token';
  $('settings-connect').click(); await settle();
  assert.deepEqual(asked, [false]);
  assert.equal($('storage-headline').textContent, '303 kB of 500 MB · <1%');
  assert.match($('storage-scope').textContent, /erics-personal-tools · Free plan/);
  assert.equal($('storage-meter').getAttribute('aria-valuenow'), '0');
  assert.match($('storage-meter').getAttribute('aria-valuetext'), /less than 1 percent/);
  assert.equal($('storage-meter').className, 'meter');
  // Every database the account holds is named with its own size.
  assert.match($('storage-databases').textContent, /erics-personal-tools · 24 tables/);
  assert.match($('storage-databases').textContent, /scratch · 1 table4 kB/);
  assert.equal($('storage-status').hidden, true);

  // Refresh is the owner asking for the figure now.
  usage = reading(0.92 * 500 * MB);
  $('storage-refresh').click(); await settle();
  assert.deepEqual(asked, [false, true]);
  assert.equal($('storage-headline').textContent, '460 MB of 500 MB · 92%');
  assert.equal($('storage-meter').getAttribute('aria-valuenow'), '92');
  assert.ok($('storage-meter').classList.contains('meter--alert'));

  // A reading Cloudflare would not take again says how old the one on screen is.
  usage = reading(0.92 * 500 * MB, {stale: true, error: 'Cloudflare could not report storage: HTTP 500'});
  $('storage-refresh').click(); await settle();
  assert.equal($('storage-status').hidden, false);
  assert.ok($('storage-status').classList.contains('notice--alert'));
  assert.match($('storage-status').textContent, /could not report storage/);

  // A refused token is an error the owner can act on, and the panel says it.
  usage = Error('Storage reporting needs CLOUDFLARE_ACCOUNT_ID and the CLOUDFLARE_API_TOKEN secret.');
  $('storage-refresh').click(); await settle();
  assert.ok($('storage-status').classList.contains('notice--error'));
  assert.match($('storage-status').textContent, /CLOUDFLARE_API_TOKEN/);

  // Disconnecting this browser clears the figure rather than leaving a stale one.
  $('settings-disconnect').click(); await settle();
  assert.equal($('storage-headline').textContent, '—');
  assert.equal($('storage-databases').children.length, 0);
  assert.equal($('storage-status').hidden, true);
  assert.equal($('storage-refresh').disabled, true);
});
