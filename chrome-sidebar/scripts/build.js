import { mkdir, rm, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const name of ['manifest.json', 'rewards.html', 'sidepanel.html', 'settings.html', 'restaurants.html', 'travel.html', 'cards.html', 'finance.html', 'personal.html', 'data.html', 'src', 'config', 'icons', 'vendor']) {
  await cp(new URL(name, root), new URL(name, output), {recursive: true});
}
console.log('Load chrome-sidebar/dist as an unpacked Chrome extension.');
