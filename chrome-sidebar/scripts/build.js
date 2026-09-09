import { mkdir, rm, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const name of ['manifest.json', 'sidepanel.html', 'settings.html', 'travel.html', 'data.html', 'src', 'config', 'icons']) {
  await cp(new URL(name, root), new URL(name, output), {recursive: true});
}
console.log('Load chrome-sidebar/dist as an unpacked Chrome extension.');
