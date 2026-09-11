import {observeToolSize} from './tool-layout.js';
import {initialize} from './mobile-session.js';
import {decode} from './passkey-vault.js';
let started = false;
window.addEventListener('message', async event => {
  if (started || window.parent === window || event.source !== parent || event.origin !== location.origin || event.data?.type !== 'mobile-unlock' || typeof event.data.token !== 'string') return;
  started = true;
  initialize(event.data.token);
  try {
    // The lock already verified the passkey, and the same assertion carried the
    // key that opens sealed records. Adopt it before the tools mount, so a
    // protected section is simply open rather than asking for the passkey the
    // owner has just given. An authenticator that produced no second result
    // sends nothing here and each section asks for itself, as before.
    if (event.data.records) {
      const {sharedVault} = await import('./shared/secret-vault.js');
      try { await sharedVault().unlockWithPasskeySeed(decode(event.data.records)); } catch { /* The section asks for itself. */ }
    }
    await import('./capabilities.js');
    // The connection is already established by the passkey. Keep maintenance
    // and disconnect controls, but never offer a second plaintext token store.
    const tokenField = document.getElementById('travel-token');
    if (tokenField) { tokenField.disabled = true; tokenField.closest('.form-field')?.setAttribute('hidden', ''); }
    const connect = document.getElementById('travel-connect');
    if (connect) connect.hidden = true;
    document.querySelector('.capability-launcher .launcher-tile:not([hidden])')?.focus({preventScroll:true});
  } catch {
    document.getElementById('capabilities-root').textContent = 'Could not open your tools. Reopen the app to try again.';
  }
});
if (parent !== window) parent.postMessage({type: 'mobile-ready'}, location.origin);
for (const type of ['pointerdown', 'keydown', 'input', 'scroll']) {
  document.addEventListener(type, event => {
    if (event.isTrusted && !document.hidden) parent.postMessage({type: 'mobile-activity'}, location.origin);
  }, {capture: true, passive: true});
}
observeToolSize(document.getElementById('capabilities-root'), height => parent.postMessage({type:'mobile-size',height},location.origin));
