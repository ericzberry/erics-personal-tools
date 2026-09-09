import './mobile-security.js';
import {VERSION, checkRelease, newer} from './releases.js';
const el = id => document.getElementById(id);
let registration;
function setSettings(open) {
  el('app-settings').hidden = !open;
  el('toggle-settings').setAttribute('aria-expanded', String(open));
  el('install').hidden = open || navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  document.querySelector('.mobile-tools-frame')?.contentWindow.postMessage({type:'mobile-settings',open},location.origin);
}
el('toggle-settings').addEventListener('click', () => setSettings(el('app-settings').hidden));
function connection() { el('connection').textContent = navigator.onLine ? 'Online' : 'Offline'; }
function installed() { el('install').hidden = !el('app-settings').hidden || navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }
async function releases() {
  if (!navigator.onLine) return;
  try {
    const version = await checkRelease(localStorage);
    if (newer(version)) { el('update').hidden = false; el('update-detail').textContent = `Version ${version} is available. Connect to the internet to update.`; }
  } catch { /* Private browsing may disable device storage. */ }
}
async function offlineSetup() {
  el('retry-offline').hidden = true;
  try {
    if (!('serviceWorker' in navigator)) throw Error('unsupported');
    const existing=await navigator.serviceWorker.getRegistration('/app/');
    try {registration = await navigator.serviceWorker.register('/app/sw.js', {scope: '/app/', updateViaCache: 'none'});}
    catch(error){if(!existing?.active)throw error;registration=existing;}
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('timeout')), 15000))]);
    el('offline-status').textContent = 'Ready';
    el('offline-detail').textContent = 'Downloaded records and reference data work offline. Changes wait on this device until they can sync. Device storage is not a permanent backup.';
  } catch {
    setSettings(true);
    el('offline-status').textContent = 'Not ready';
    el('offline-detail').textContent = 'Reconnect and retry to save the app for offline use.';
    el('retry-offline').hidden = false;
  }
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
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once: true});
      waiting.postMessage({type: 'ACTIVATE'});
    } else { el('update-detail').textContent = 'The update is still being prepared. Try again in a moment.'; }
  } catch { el('update-detail').textContent = 'Couldn’t update. Check your connection and try again.'; }
  finally { button.disabled = false; }
});
el('version').textContent = `Version ${VERSION}`;
connection(); installed(); offlineSetup(); releases();
window.addEventListener('online', () => { connection(); releases(); });
window.addEventListener('offline', connection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { connection(); installed(); releases(); } });
setInterval(releases, 60 * 60 * 1000);
