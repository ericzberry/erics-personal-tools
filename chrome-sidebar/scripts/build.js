import { mkdir, rm, cp, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
// `vendor/` holds the third-party spreadsheet reader and is not in Git, so a
// fresh checkout does not have one. Reading a spreadsheet is one input among
// several, and its absence must not hold back a build of everything else.
const optional = new Set(['vendor']);
for (const name of ['manifest.json', 'rewards.html', 'sidepanel.html', 'settings.html', 'restaurants.html', 'travel.html', 'cards.html', 'finance.html', 'personal.html', 'reminders.html', 'gifts.html', 'sizes.html', 'attention.html', 'subscriptions.html', 'unlock.html', 'taxes.html', 'data.html', 'src', 'config', 'icons', 'vendor']) {
  if (optional.has(name) && !await stat(new URL(name, root)).catch(() => null)) {
    console.warn(`No ${name}/ in this checkout — the build carries on without it.`);
    continue;
  }
  await cp(new URL(name, root), new URL(name, output), {recursive: true});
}
console.log('Load chrome-sidebar/dist as an unpacked Chrome extension.');
