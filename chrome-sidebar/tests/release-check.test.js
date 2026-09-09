import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseChecker,newerVersion,RELEASE_CHECK_INTERVAL} from '../src/release-check.js';
test('version comparison is numeric and rejects invalid versions',()=>{
 assert.equal(newerVersion('0.6.41','0.6.9'),true);assert.equal(newerVersion('0.6.41','0.6.41'),false);assert.equal(newerVersion('0.6.40','0.6.41'),false);assert.equal(newerVersion('bad','0.6.41'),false);assert.equal(newerVersion('1.2.0','1.2'),false);
});
test('concurrent panels and restarts reuse the hourly cache',async()=>{
 let data={},time=1000,calls=0;const storage={get:async()=>structuredClone(data),set:async x=>{data={...data,...x};}};
 const options={now:()=>time,fetcher:async()=>{calls++;return Response.json({version:'0.6.41'});}};
 const check=releaseChecker(storage,options);await Promise.all([check(),check(),check()]);assert.equal(calls,1);
 time+=RELEASE_CHECK_INTERVAL-1;assert.equal((await releaseChecker(storage,options)()).version,'0.6.41');assert.equal(calls,1);
 time++;await check();assert.equal(calls,2);
});
test('offline attempts are throttled too and preserve known release metadata',async()=>{
 let data={releaseCheck:{version:'0.6.41',checkedAt:0}},time=RELEASE_CHECK_INTERVAL,calls=0;
 const storage={get:async()=>data,set:async x=>{data={...data,...x};}};const check=releaseChecker(storage,{now:()=>time,fetcher:async()=>{calls++;throw Error('Offline');}});
 assert.equal((await check()).version,'0.6.41');await check();assert.equal(calls,1);
});
