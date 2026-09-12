import {readFile, mkdir, cp, rm} from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('./public/app/manifest.webmanifest', import.meta.url)));
const {version} = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
for (const file of ['app.js','releases.js','styles.css','sw.js','index.html','push.js','push-bridge.js','icon-192.png','icon-512.png']) await readFile(new URL(`./public/app/${file}`, import.meta.url));
if (manifest.version !== version) throw Error('Manifest version mismatch');
for (const file of ['releases.js', 'sw.js', 'index.html']) {
  if (!(await readFile(new URL(`./public/app/${file}`, import.meta.url), 'utf8')).includes(version)) throw Error(`Version missing from ${file}`);
}
await rm(new URL('./dist/', import.meta.url), {recursive: true, force: true});
await mkdir(new URL('./dist/', import.meta.url), {recursive: true});
await cp(new URL('./public/', import.meta.url), new URL('./dist/', import.meta.url), {recursive: true});
console.log(`Built Eric’s Tools ${version}`);

const shared=['components/tokens.css','rewards-tool.js','rewards-data.js','rewards-offline.js','program-data.js','program-offline.js','secret-vault.js','idle-session.js','auto-unlock.js','components/rewards.js','components/select.js','components/select.css','components/upload.css','cards.js','card-data.js','cards-offline.js','components/cards.js','components/cards.css','restaurant-search.js','components/restaurant-views.js','components/workspace.css','travel.js','travel-data.js','travel-offline.js','offline-resource.js','offline-storage.js','capabilities.js','data-library.js','cloud-storage.js','components/ui.js','components/travel.js','components/travel.css','finance.js','finance-data.js','finance-offline.js','components/finance.js','components/finance.css','pdf-text.js','statement-text.js','finance-page-read.js','components/file-drop.js','personal.js','personal-data.js','personal-offline.js','components/personal.js','reminders.js','reminder-data.js','reminders-offline.js','components/reminders.js','components/reminders.css','gifts.js','gift-data.js','gifts-offline.js','public-url.js','components/gifts.js','components/gifts.css','properties.js','property-data.js','properties-offline.js','components/properties.js','components/properties.css','capture.js','capture-data.js','capture-stores.js','components/capture.js','components/capture.css','taxes.js','tax-data.js','components/taxes.js','components/taxes.css','vault-gate.js','components/vault.js','components/vault.css','components/capabilities.js','components/capabilities.css'];
for (const file of shared) {
  const target = new URL(`./dist/app/shared/${file}`, import.meta.url);
  await mkdir(new URL('./', target), {recursive:true});
  await cp(new URL(`../chrome-sidebar/src/${file}`, import.meta.url), target);
}
// statement-text.js reaches the spreadsheet reader at ../vendor/, which from
// dist/app/shared/ means dist/app/vendor/. `vendor/` is not in Git, so a
// checkout without it copies nothing here rather than failing the build — the
// same thing the extension build does with that directory. Reading a
// spreadsheet is one input among several, and the reader's absence must not
// hold back a release of everything else.
await cp(new URL('../chrome-sidebar/vendor/',import.meta.url),new URL('./dist/app/vendor/',import.meta.url),{recursive:true,force:true});
await mkdir(new URL('./dist/app/data/',import.meta.url),{recursive:true});
await cp(new URL('../chrome-sidebar/config/rankings-2026.json',import.meta.url),new URL('./dist/app/data/rankings-2026.json',import.meta.url));
