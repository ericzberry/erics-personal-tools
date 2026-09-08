import {build} from 'esbuild';
import { mkdir, rm, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const name of ['manifest.json', 'sidepanel.html', 'sidepanel.css', 'src', 'config', 'icons']) {
  await cp(new URL(name, root), new URL(name, output), {recursive: true});
}
await mkdir(new URL('vendor/', root), {recursive:true});
await build({stdin:{contents:"export {default} from 'read-excel-file';",resolveDir:new URL('../',import.meta.url).pathname},outfile:new URL('vendor/read-xlsx.js',root).pathname,bundle:true,format:'esm',platform:'browser',minify:true});
await cp(new URL('node_modules/read-excel-file/LICENSE',root),new URL('vendor/read-excel-file-LICENSE',root));
await cp(new URL('node_modules/fflate/LICENSE',root),new URL('vendor/fflate-LICENSE',root));
await cp(new URL('vendor',root),new URL('vendor',output),{recursive:true});
console.log('Load chrome-sidebar/dist as an unpacked Chrome extension.');
