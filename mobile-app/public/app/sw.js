const CACHE = 'erics-tools-shell-0.1.58';
const SHELL = ['/app/shared/components/tokens.css','/app/shared/rewards-tool.js','/app/shared/rewards-data.js','/app/shared/rewards-offline.js','/app/shared/program-data.js','/app/shared/program-offline.js','/app/shared/secret-vault.js','/app/shared/idle-session.js','/app/shared/components/rewards.js','/app/shared/components/select.js','/app/shared/components/select.css','/app/shared/components/upload.css','/app/tool-navigation.js', '/app/tool-navigation.css', '/app/shared/cards.js', '/app/shared/card-data.js', '/app/shared/cards-offline.js', '/app/shared/components/cards.js', '/app/shared/components/cards.css', '/app/restaurants.js', '/app/restaurant-cache.js', '/app/shared/restaurant-search.js', '/app/shared/components/restaurant-views.js', '/app/shared/components/workspace.css', '/app/tool-layout.js', '/app/shared/auto-unlock.js', '/app/mobile-security.js', '/app/passkey-vault.js', '/app/mobile-session.js', '/app/push.js', '/app/push-bridge.js', '/app/unlocked.js', '/app/unlocked.html', '/app/', '/app/styles.css', '/app/app.js', '/app/capabilities.js', '/app/data/rankings-2026.json', '/app/shared/travel-data.js', '/app/shared/travel-offline.js', '/app/shared/offline-resource.js', '/app/shared/offline-storage.js', '/app/shared/capabilities.js', '/app/shared/data-library.js', '/app/shared/components/capabilities.js', '/app/shared/components/capabilities.css', '/app/releases.js', '/app/shared/travel.js', '/app/shared/cloud-storage.js', '/app/shared/components/ui.js', '/app/shared/components/travel.js', '/app/shared/components/travel.css', '/app/shared/finance.js', '/app/shared/finance-data.js', '/app/shared/finance-offline.js', '/app/shared/components/finance.js', '/app/shared/components/finance.css', '/app/shared/pdf-text.js', '/app/shared/statement-text.js', '/app/shared/finance-page-read.js', '/app/shared/components/file-drop.js', '/app/shared/personal.js', '/app/shared/personal-data.js', '/app/shared/personal-offline.js', '/app/shared/components/personal.js', '/app/shared/reminders.js', '/app/shared/reminder-data.js', '/app/shared/reminders-offline.js', '/app/shared/components/reminders.js', '/app/shared/components/reminders.css', '/app/shared/gifts.js', '/app/shared/gift-data.js', '/app/shared/gifts-offline.js', '/app/shared/public-url.js', '/app/shared/components/gifts.js', '/app/shared/components/gifts.css', '/app/shared/capture.js', '/app/shared/capture-data.js', '/app/shared/capture-stores.js', '/app/shared/components/capture.js', '/app/shared/components/capture.css', '/app/shared/taxes.js', '/app/shared/tax-data.js', '/app/shared/components/taxes.js', '/app/shared/components/taxes.css', '/app/shared/vault-gate.js', '/app/shared/components/vault.js', '/app/shared/components/vault.css', '/app/manifest.webmanifest', '/app/icon-192.png', '/app/icon-512.png'];
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
// A push carries its own text, encrypted end to end by the Worker to this
// device's own key, so the push service forwarded something it could not read
// and this is the first place it exists in the clear. Every push shows
// something: that is the bargain that keeps the subscription alive.
self.addEventListener('push', event => {
  if (!event.data) return;
  let notice;
  try { notice = event.data.json(); } catch { notice = {title:'Eric’s Tools', body:event.data.text()}; }
  event.waitUntil(self.registration.showNotification(notice.title || 'Eric’s Tools', {
    body: notice.body || '',
    tag: notice.tag || 'reminders',
    data: {url: notice.url || '/app/'},
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png'
  }));
});
// Opening the app it already has, rather than a second copy of it.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const app = new URL('/app/', self.location.origin).href;
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({type:'window', includeUncontrolled:true})) {
      if (client.url.startsWith(app)) return client.focus();
    }
    return self.clients.openWindow(new URL(event.notification.data?.url || '/app/', self.location.origin).href);
  })());
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
