import {readFile, mkdir, cp, rm} from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('./public/app/manifest.webmanifest', import.meta.url)));
const {version} = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
for (const file of ['app.js','releases.js','styles.css','sw.js','index.html','icon-192.png','icon-512.png']) await readFile(new URL(`./public/app/${file}`, import.meta.url));
if (manifest.version !== version) throw Error('Manifest version mismatch');
for (const file of ['releases.js', 'sw.js', 'index.html']) {
  if (!(await readFile(new URL(`./public/app/${file}`, import.meta.url), 'utf8')).includes(version)) throw Error(`Version missing from ${file}`);
}
await rm(new URL('./dist/', import.meta.url), {recursive: true, force: true});
await mkdir(new URL('./dist/', import.meta.url), {recursive: true});
await cp(new URL('./public/', import.meta.url), new URL('./dist/', import.meta.url), {recursive: true});
console.log(`Built Eric’s Tools ${version}`);

const shared=['cards.js','card-data.js','cards-offline.js','components/cards.js','components/cards.css','restaurant-search.js','components/restaurant-views.js','components/workspace.css','travel.js','travel-data.js','travel-offline.js','offline-resource.js','offline-storage.js','capabilities.js','data-library.js','cloud-storage.js','components/ui.js','components/travel.js','components/travel.css','components/capabilities.js','components/capabilities.css'];
for (const file of shared) {
  const target = new URL(`./dist/app/shared/${file}`, import.meta.url);
  await mkdir(new URL('./', target), {recursive:true});
  await cp(new URL(`../chrome-sidebar/src/${file}`, import.meta.url), target);
}
await mkdir(new URL('./dist/app/data/',import.meta.url),{recursive:true});
for(const file of ['espn-league-2026.json','rankings-2026.json'])await cp(new URL(`../chrome-sidebar/config/${file}`,import.meta.url),new URL(`./dist/app/data/${file}`,import.meta.url));
