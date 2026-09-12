import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
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
  // League rules were removed, so their dataset is no longer shipped offline.
  assert.ok(!paths.includes('/app/data/espn-league-2026.json'));
  assert.ok(paths.includes('/app/data/rankings-2026.json'));
  assert.ok(!paths.some(path=>path.startsWith('/v1/')));
});
test('an available update leads the page instead of trailing the tools',async()=>{
  const markup=await readFile(new URL('../public/app/index.html',import.meta.url),'utf8');
  const main=markup.slice(markup.indexOf('<main>'));
  assert.ok(main.indexOf('id="update"')<main.indexOf('id="capabilities-root"'));
});

test('a push shows what it carries, and opening it returns to the app already running',async()=>{
  const handlers={},shown=[],focused=[],opened=[];
  const context={URL,TextDecoder,Response,fetch:async()=>{throw Error('a notification needs no network');},
    self:{location:{origin:'https://example.com'},addEventListener:(name,fn)=>handlers[name]=fn,
      registration:{showNotification:async(title,options)=>{shown.push({title,options});}},
      clients:{claim:async()=>{},matchAll:async()=>[{url:'https://example.com/app/',focus:async()=>{focused.push(true);return true;}}],
        openWindow:async url=>{opened.push(url);}},
      skipWaiting:()=>{}},
    caches:{open:async()=>({addAll:async()=>{},match:async()=>undefined}),keys:async()=>[],delete:async()=>{}}};
  vm.runInNewContext(await readFile(new URL('../public/app/sw.js',import.meta.url),'utf8'),context);
  const waits=[];
  handlers.push({data:{json:()=>({title:'Derek’s birthday',body:'Today',tag:'reminders',url:'/app/'})},waitUntil:promise=>waits.push(promise)});
  await Promise.all(waits);
  assert.equal(shown.length,1);
  assert.deepEqual([shown[0].title,shown[0].options.body,shown[0].options.tag],['Derek’s birthday','Today','reminders']);
  assert.equal(shown[0].options.data.url,'/app/');
  // A push with no payload is the service's own business, not a notification.
  handlers.push({data:null,waitUntil:promise=>waits.push(promise)});
  assert.equal(shown.length,1);
  // Tapping it focuses the window that is already open rather than adding one.
  let click;let closed=false;
  handlers.notificationclick({notification:{close:()=>{closed=true;},data:{url:'/app/'}},waitUntil:promise=>{click=promise;}});
  await click;
  assert.deepEqual([closed,focused.length,opened.length],[true,1,0]);
});
