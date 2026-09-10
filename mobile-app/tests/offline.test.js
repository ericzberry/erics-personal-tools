import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {checkRelease,newer} from '../public/app/releases.js';
test('release attempts persist and throttle failures for an hour across reopenings',async()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 let calls=0;const fail=async()=>{calls++;throw Error('offline');};
 await checkRelease(storage,fail,1000);await checkRelease(storage,fail,2000);assert.equal(calls,1);
 await checkRelease(storage,fail,3601000);assert.equal(calls,2);
 assert.equal(newer('0.2.0'),true);assert.equal(newer('0.1.0'),false);assert.equal(newer(null),false);
});
test('saved release metadata remains available during the throttle window',async()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(await checkRelease(storage,async()=>Response.json({version:'0.2.0'}),1000),'0.2.0');
 assert.equal(await checkRelease(storage,()=>{throw Error('must not fetch');},2000),'0.2.0');
});
test('the Settings check skips the throttle, records the attempt, and reports failure',async()=>{
 const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 let calls=0;const found=async()=>{calls++;return Response.json({version:'0.2.0'});};
 assert.equal(await checkRelease(storage,found,1000),'0.2.0');
 // Automatic checks stay throttled by the attempt a forced check just recorded.
 assert.equal(await checkRelease(storage,()=>{throw Error('must not fetch');},2000),'0.2.0');
 assert.equal(await checkRelease(storage,found,2000,{force:true}),'0.2.0');
 assert.equal(calls,2);
 await assert.rejects(checkRelease(storage,async()=>new Response('',{status:500}),3000,{force:true}));
 // A forced failure must not lose the version the app already knows about.
 assert.equal(await checkRelease(storage,()=>{throw Error('must not fetch');},4000),'0.2.0');
});
test('installed shell loads offline and never intercepts API requests',async()=>{
 const handlers={};const saved=new Map();let network=0;
 const context={URL,fetch:()=>{network++;throw Error('offline');},self:{location:{origin:'https://example.com'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}},skipWaiting:()=>{}},caches:{open:async()=>({addAll:async paths=>{for(const path of paths)saved.set(path,new Response(path));},match:async path=>saved.get(path)}),keys:async()=>[],delete:async()=>{}}};
 vm.runInNewContext(await readFile(new URL('../public/app/sw.js',import.meta.url),'utf8'),context);
 let pending;handlers.install({waitUntil:p=>pending=p});await pending;
 let response;handlers.fetch({request:new Request('https://example.com/app/'),respondWith:p=>response=p});
 assert.equal(await (await response).text(),'/app/');assert.equal(network,0);
 let intercepted=false;handlers.fetch({request:new Request('https://example.com/v1/ai-connections'),respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
