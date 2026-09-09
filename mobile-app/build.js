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
