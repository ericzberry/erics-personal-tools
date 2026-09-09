const CACHE = 'erics-tools-shell-0.1.9';
const SHELL = ['/app/tool-layout.js', '/app/auto-unlock.js', '/app/mobile-security.js', '/app/passkey-vault.js', '/app/mobile-session.js', '/app/unlocked.js', '/app/unlocked.html', '/app/', '/app/styles.css', '/app/app.js', '/app/capabilities.js', '/app/data/espn-league-2026.json', '/app/data/rankings-2026.json', '/app/shared/travel-data.js', '/app/shared/travel-offline.js', '/app/shared/offline-resource.js', '/app/shared/offline-storage.js', '/app/shared/capabilities.js', '/app/shared/data-library.js', '/app/shared/components/capabilities.js', '/app/shared/components/capabilities.css', '/app/releases.js', '/app/shared/travel.js', '/app/shared/cloud-storage.js', '/app/shared/components/ui.js', '/app/shared/components/travel.js', '/app/shared/components/travel.css', '/app/manifest.webmanifest', '/app/icon-192.png', '/app/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('erics-tools-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return;
  // Only the explicit app shell is cached. Authenticated API responses and
  // future personal records must have their own deliberate storage policy.
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.pathname) || fetch(event.request);
  })());
});
