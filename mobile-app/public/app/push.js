// Notifications for this device.
//
// The browser half lives here, in the top-level page: permission and the push
// subscription both belong to the page the owner is actually looking at, not to
// the frame inside it. The authenticated half — telling the Worker where to
// reach this device — happens in that frame, because the access token lives
// there and nowhere else. The two halves talk by postMessage.
const el = id => document.getElementById(id);
const DEVICE_KEY = 'push-device';
function deviceId() {
  let id = '';
  try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch { /* Private browsing. */ }
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    try { localStorage.setItem(DEVICE_KEY, id); } catch { /* Then it is one subscription per visit. */ }
  }
  return id;
}
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const fromBase64url = value => {
  const padded = value.replaceAll('-','+').replaceAll('_','/');
  const binary = atob(padded + '='.repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};
const supported = () => 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// The frame is the only holder of the access token, so it makes the request and
// answers. A frame that is not there means the app is locked.
function askFrame(message, {timeoutMs = 20000} = {}) {
  const frame = document.querySelector('.mobile-tools-frame');
  if (!frame?.contentWindow) throw Error('Unlock the app first.');
  const request = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', listen); reject(Error('The app did not answer. Try again.')); }, timeoutMs);
    function listen(event) {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      if (event.data?.type !== 'mobile-push-result' || event.data.request !== request) return;
      clearTimeout(timer); window.removeEventListener('message', listen);
      event.data.ok ? resolve(event.data.value) : reject(Error(event.data.error || 'That did not work.'));
    }
    window.addEventListener('message', listen);
    frame.contentWindow.postMessage({...message, request}, location.origin);
  });
}

export function mountPush() {
  const status = text => { el('push-status').textContent = text || ''; };
  let busy = false, subscribed = false;
  function render() {
    const usable = supported();
    el('push-enable').hidden = !usable || subscribed;
    el('push-test').hidden = !usable || !subscribed;
    el('push-off').hidden = !usable || !subscribed;
    for (const id of ['push-enable','push-test','push-off']) el(id).disabled = busy;
  }
  async function run(label, action) {
    if (busy) return;
    busy = true; status(label); render();
    try { await action(); }
    catch (error) { status(error?.message || 'That did not work.'); }
    finally { busy = false; render(); }
  }
  async function registration() {
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('Offline setup is not ready yet.')), 10000))]);
    return ready;
  }
  async function existing() {
    if (!supported()) return null;
    try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
  }
  el('push-enable').addEventListener('click', () => run('Asking…', async () => {
    // Safari only grants this to an installed app, and says nothing useful when
    // it refuses, so the one thing the owner can act on is said here.
    if (!supported()) throw Error(standalone() ? 'This browser cannot show notifications.' : 'Add the app to your Home Screen first.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw Error(permission === 'denied' ? 'Notifications are blocked for this app in Settings.' : 'Notifications were not allowed.');
    const {key} = await (await fetch('/v1/push/key', {cache:'no-store'})).json();
    if (!key) throw Error('Push is not configured on the server yet.');
    const subscription = await (await registration()).pushManager.subscribe({userVisibleOnly:true, applicationServerKey:fromBase64url(key)});
    const raw = subscription.toJSON();
    await askFrame({type:'mobile-push-save', id:deviceId(), subscription:{
      endpoint:raw.endpoint, p256dh:raw.keys.p256dh, auth:raw.keys.auth,
      timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', hour:8
    }});
    subscribed = true;
    status('');
  }));
  el('push-test').addEventListener('click', () => run('Sending…', async () => {
    await askFrame({type:'mobile-push-test'});
    status('Sent.');
  }));
  el('push-off').addEventListener('click', () => run('Turning off…', async () => {
    const subscription = await existing();
    await askFrame({type:'mobile-push-forget', id:deviceId()});
    await subscription?.unsubscribe();
    subscribed = false;
    status('');
  }));
  // A subscription this browser still holds is the truth about this device; the
  // Worker's copy is repaired on the next save rather than asked about here.
  existing().then(subscription => { subscribed = !!subscription && Notification.permission === 'granted'; render(); });
  render();
}
