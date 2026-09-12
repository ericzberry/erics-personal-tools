import {carrySession} from './mobile-security.js';
import {VERSION, checkRelease, newer} from './releases.js';
import {mountPush} from './push.js';
const el = id => document.getElementById(id);
let registration;
// The tools frame owns navigation, so the shell mirrors whichever screen it
// reports. Device settings are part of the Settings screen; a failed offline
// setup shows them anyway, because nothing else would report the problem.
let currentScreen = 'home', offlineProblem = false;
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
function render() {
  el('app-settings').hidden = !(currentScreen === 'settings' || offlineProblem);
  el('install').hidden = currentScreen !== 'home' || standalone();
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== document.querySelector('.mobile-tools-frame')?.contentWindow) return;
  if (event.data?.type === 'mobile-screen' && typeof event.data.screen === 'string') { currentScreen = event.data.screen; render(); }
});
function connection() { el('connection').textContent = navigator.onLine ? 'Online' : 'Offline'; }
async function releases() {
  if (!navigator.onLine) return;
  try {
    const version = await checkRelease(localStorage);
    showRelease(version);
  } catch { /* Private browsing may disable device storage. */ }
}
function showRelease(version) {
  if (!newer(version)) { el('version-status').textContent = `Version ${VERSION} · up to date`; return false; }
  el('update').hidden = false;
  el('update-detail').textContent = `Version ${version} is ready.`;
  el('version-status').textContent = `Version ${VERSION} · ${version} available`;
  return true;
}
// A manual check is a deliberate user action, so it skips the hourly throttle
// that paces the automatic checks. It still records the attempt.
el('check-update').addEventListener('click', async () => {
  const button = el('check-update');
  button.disabled = true;
  el('version-status').textContent = 'Checking…';
  try {
    if (!navigator.onLine) throw Error('offline');
    showRelease(await checkRelease(localStorage, fetch, Date.now(), {force: true}));
  } catch { el('version-status').textContent = `Version ${VERSION} · couldn’t check`; }
  finally { button.disabled = false; }
});
async function offlineSetup() {
  el('retry-offline').hidden = true;
  try {
    if (!('serviceWorker' in navigator)) throw Error('unsupported');
    const existing=await navigator.serviceWorker.getRegistration('/app/');
    try {registration = await navigator.serviceWorker.register('/app/sw.js', {scope: '/app/', updateViaCache: 'none'});}
    catch(error){if(!existing?.active)throw error;registration=existing;}
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('timeout')), 15000))]);
    offlineProblem = false;
    el('offline-status').textContent = 'Ready';
    el('offline-detail').textContent = '';
  } catch {
    offlineProblem = true;
    el('offline-status').textContent = 'Not ready';
    el('offline-detail').textContent = 'Reconnect and retry.';
    el('retry-offline').hidden = false;
  }
  render();
}
el('retry-offline').addEventListener('click', offlineSetup);
el('apply-update').addEventListener('click', async () => {
  const button = el('apply-update'); button.disabled = true;
  try {
    if (!navigator.onLine || !registration) throw Error('offline');
    await registration.update();
    const waiting = registration.waiting || registration.installing;
    if (waiting) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('timeout')), 15000);
        const ready = () => {
          if (waiting.state === 'installed') { clearTimeout(timeout); resolve(); }
          if (waiting.state === 'redundant') { clearTimeout(timeout); reject(Error('failed')); }
        };
        waiting.addEventListener('statechange', ready); ready();
      });
      // The owner unlocked the app moments ago, so the reload carries that unlock
      // rather than asking for the same passkey again on the way back.
      navigator.serviceWorker.addEventListener('controllerchange', () => { carrySession(); location.reload(); }, {once: true});
      waiting.postMessage({type: 'ACTIVATE'});
    } else { el('update-detail').textContent = 'Still preparing. Try again in a moment.'; }
  } catch { el('update-detail').textContent = 'Couldn’t update. Check your connection.'; }
  finally { button.disabled = false; }
});
el('version-status').textContent = `Version ${VERSION}`;
connection(); render(); offlineSetup(); releases(); mountPush();
window.addEventListener('online', () => { connection(); releases(); });
window.addEventListener('offline', connection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { connection(); render(); releases(); } });
setInterval(releases, 60 * 60 * 1000);
