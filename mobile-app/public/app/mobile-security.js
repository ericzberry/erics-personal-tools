import {autoUnlock} from './shared/auto-unlock.js';
import {passkeyVault, VAULT_KEY, encode} from './passkey-vault.js';
import {PRF_SALT} from './shared/secret-vault.js';
import {idleSession} from './shared/idle-session.js';
const root = document.getElementById('capabilities-root');
root.innerHTML = `
<section class="mobile-lock" aria-labelledby="lock-title">
  <h1 id="lock-title">Protect your mobile app</h1>
  <form id="lock-setup">
    <label for="lock-token">Private access token</label>
    <input id="lock-token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required minlength="32" maxlength="500" aria-describedby="lock-token-help">
    <p id="lock-token-help" class="muted">The same token as your extension.</p>
    <button id="lock-create" type="submit">Create passkey</button>
  </form>
  <button id="lock-finish" type="button" hidden>Finish passkey setup</button>
  <button id="lock-restart" class="secondary" type="button" hidden>Start setup again</button>
  <button id="lock-unlock" type="button" hidden>Unlock with passkey</button>
  <p id="lock-status" role="status" aria-live="polite"></p>
  <details id="lock-recovery" hidden><summary>Can’t use your passkey?</summary><p>Recover with your original access token. Saved records and pending changes stay on this device.</p><button id="lock-recover" class="secondary" type="button">Recover access</button></details>
</section>
<div id="mobile-private" hidden></div>`;
const el = id => document.getElementById(id);
// The record key rides along with the token: it is the other half of the same
// assertion, and the frame adopts it so a protected section opens without a
// second prompt. It lives exactly as long as the token does.
let vault, token = '', records = null, frame = null, busy = false, epoch = 0, supported = false;
function forgetRecordKey() { records?.fill(0); records = null; }
const automatic = autoUnlock({
  eligible: () => supported && !document.hidden && !busy && !frame && !!vault?.record() && el('lock-setup').hidden,
  unlock: () => unlock()
});
const status = text => { el('lock-status').textContent = text; };
const session = idleSession({onLock: reason => {
  ++epoch;
  token = '';
  forgetRecordKey();
  vault?.cancel();
  frame?.remove(); frame = null;
  el('mobile-private').replaceChildren();
  el('mobile-private').hidden = true;
  root.querySelector('.mobile-lock').hidden = false;
  showGate();
  status('');
  if (reason === 'idle' && !document.hidden) {
    automatic.background();
    queueMicrotask(() => automatic.request());
  }
}});
// The child checks expiry synchronously before any private storage or API use.
window.mobileAccessAllowed = () => session.check() && !document.hidden;
function showGate() {
  const saved = !!vault.record();
  el('lock-title').textContent = saved ? 'Opening your tools…' : 'Protect your mobile app';
  el('lock-setup').hidden = saved;
  el('lock-unlock').hidden = true;
  el('lock-finish').hidden = true;
  el('lock-restart').hidden = true;
  el('lock-recovery').hidden = true;
  el('lock-recovery').open = false;
  el('lock-token').value = saved ? '' : vault.legacyToken();
  if (!saved && el('lock-token').value) status('Create a passkey to protect your existing connection.');
}
async function run(action) {
  if (busy) return;
  busy = true;
  for (const button of root.querySelectorAll('.mobile-lock button')) button.disabled = true;
  if(vault.record()){el('lock-unlock').hidden=true;el('lock-recovery').hidden=true;}
  status('');
  try { await action(epoch); }
  catch (error) {
    if(vault.record()){el('lock-title').textContent='Couldn’t open your tools';el('lock-unlock').textContent='Try again';el('lock-unlock').hidden=false;el('lock-recovery').hidden=false;}
    status(error.name === 'NotAllowedError' || error.name === 'AbortError' ? 'Passkey verification was canceled or timed out.' : error.message || 'Could not unlock. Try again.');
  } finally {
    busy = false;
    for (const button of root.querySelectorAll('.mobile-lock button')) button.disabled = false;
  }
}
function open({token: value, records: recordKey}, attempt) {
  if (attempt !== epoch) return;
  if (document.hidden) { status('Return to the app and unlock again.'); return; }
  token = value;
  forgetRecordKey();
  records = recordKey;
  session.start();
  root.querySelector('.mobile-lock').hidden = true;
  el('mobile-private').hidden = false;
  frame = document.createElement('iframe');
  frame.title = 'Your unlocked tools';
  frame.className = 'mobile-tools-frame';
  frame.setAttribute('scrolling', 'no');
  frame.src = '/app/unlocked.html';
  el('mobile-private').replaceChildren(frame);
}
el('lock-setup').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    // Do not fetch before credentials.create: Safari needs this user gesture.
    // The token is checked before anything is committed in the finish step.
    await vault.prepare(el('lock-token').value.trim());
    el('lock-setup').hidden = true;
    el('lock-finish').hidden = false;
    el('lock-restart').hidden = false;
    el('lock-unlock').hidden = true;
    status('Passkey created. Finish setup to verify it.');
    el('lock-finish').focus();
  });
});
el('lock-restart').addEventListener('click', () => { vault.cancel(); showGate(); status('Setup restarted. Your saved data is unchanged.'); });
el('lock-finish').addEventListener('click', () => run(async attempt => {
  // PRF verification must start directly from the button gesture on Safari.
  const existing = vault.record() || vault.legacyToken();
  const opened = await vault.finish({validate: async value => {
    if (existing) return; // Recovery must also work offline with the original token.
    const response = await fetch('/health', {headers: {Authorization: `Bearer ${value}`}, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw Error(response.status === 401 ? 'The access token was rejected. Start setup again and enter the correct token.' : 'Connect to the internet to finish first-time setup.');
  }});
  el('lock-token').value = '';
  open(opened, attempt);
}));
function unlock() { return run(async attempt => open(await vault.unlock(), attempt)); }
el('lock-unlock').addEventListener('click', () => { automatic.suppress(); unlock(); });
el('lock-recover').addEventListener('click', () => {
  el('lock-setup').hidden = false;
  el('lock-token').value = '';
  el('lock-title').textContent = 'Recover mobile access';
  status('Enter your original token. Downloaded data and pending changes are kept.');
  el('lock-token').focus();
});
window.addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin || !session.check()) return;
  if (event.data?.type === 'mobile-ready') frame.contentWindow.postMessage({type: 'mobile-unlock', token, records: records ? encode(records) : ''}, location.origin);
  if (event.data?.type === 'mobile-activity' && !document.hidden) session.touch();
  if (event.data?.type === 'mobile-size' && Number.isFinite(event.data.height)) frame.style.height = `${Math.max(100, Math.min(100000, event.data.height))}px`;
  if (event.data?.type === 'mobile-disconnected') { vault.disconnect(); session.lock(); status('Disconnected. Offline copies removed; cloud records kept.'); }
});
for (const type of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(type, event => {
  if (event.isTrusted && !document.hidden) session.touch();
}, {capture: true, passive: true});
document.addEventListener('visibilitychange', () => {
  // Conceal private content while backgrounded; foregrounding is not activity.
  if (document.hidden) { el('mobile-private').hidden = true; automatic.background(); }
  else if (session.check()) el('mobile-private').hidden = false;
  else automatic.request();
}, true);
window.addEventListener('pagehide', () => { ++epoch; automatic.background(); session.lock(); forgetRecordKey(); vault?.cancel(); el('lock-token').value = ''; });
window.addEventListener('pageshow', () => { if (!session.check()) automatic.request(); });
window.addEventListener('storage', event => {
  if (event.key === VAULT_KEY || event.key === null) {
    ++epoch; session.lock();
    if (!busy) { vault?.cancel(); showGate(); }
  }
});
setInterval(() => session.check(), 1000);
try {
  vault = passkeyVault({recordSalt: PRF_SALT});
  showGate();
  supported = !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
  if (!supported) {
    for (const button of root.querySelectorAll('.mobile-lock button')) button.disabled = true;
    status('Passkeys are unavailable here. Open the HTTPS address in Safari.');
  } else automatic.request();
} catch (error) {
  for (const button of root.querySelectorAll('.mobile-lock button')) button.disabled = true;
  status(error.message || 'Device storage is unavailable. Enable website storage.');
}
