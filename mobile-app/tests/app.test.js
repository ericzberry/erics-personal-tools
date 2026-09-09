import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('offline shell includes every shared module and bundled reference dataset',async()=>{
  const source=await readFile(new URL('../public/app/sw.js',import.meta.url),'utf8');
  const paths=[...source.match(/const SHELL = (\[[^;]+\]);/)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
  for(const path of paths){
    const content=await readFile(new URL(`../dist${path==='/'?'/app/index.html':path.endsWith('/')?path+'index.html':path}`,import.meta.url),'utf8');
    if(path.endsWith('.js'))for(const match of content.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=new URL(match[1],`https://example.com${path}`).pathname;
      assert.ok(paths.includes(dependency),`${path}: missing offline dependency ${dependency}`);
    }
  }
  assert.ok(paths.includes('/app/data/espn-league-2026.json'));
  assert.ok(paths.includes('/app/data/rankings-2026.json'));
  assert.ok(!paths.some(path=>path.startsWith('/v1/')));
});
