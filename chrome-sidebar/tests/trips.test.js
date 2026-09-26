import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrip,tripKey,offerState,rankCandidates} from '../src/trip-data.js';
import {tripsOffline} from '../src/trips-offline.js';
import {fixture} from './trips-fixture.js';
const now=Date.now();
test('only an exact, fresh, fully priced and evidenced offer can qualify',()=>{
  const t=fixture(),c=t.candidates[0],o=c.offers[0];
  assert.equal(offerState(t,c,o,now),'Observed offer — recheck before booking');
  for(const property of ['request','start'])assert.equal(offerState({...t,[property]:property==='start'?'2026-10-15':'Different words'},c,o,now),'Different search — recheck');
  assert.equal(offerState(t,c,{...o,checks:[]},now),'Requirements not confirmed');
  assert.equal(offerState(t,c,{...o,allIn:false},now),'Price or terms incomplete');
  assert.equal(offerState(t,c,{...o,total:null},now),'Price or terms incomplete');
  assert.equal(offerState(t,c,{...o,terms:''},now),'Price or terms incomplete');
  assert.equal(offerState(t,c,o,now+16*60000),'Previous observation — recheck');
  assert.equal(offerState(t,c,{...o,availability:'unavailable'},now),'No matching availability observed');
});
test('a cheap wrong room, old evidence and unknowns never pass requirements',()=>{
  const t=fixture();
  t.candidates.push({...t.candidates[0],id:'cheap',name:'Cheap but wrong',checks:[{...t.candidates[0].checks[0],status:'mismatch'}]});
  assert.deepEqual(rankCandidates(t,now).map(c=>c.fit),['match','mismatch']);
  assert.equal(rankCandidates(t,now+31*86400000)[0].fit,'unknown');
  assert.equal(rankCandidates({...t,request:'Now a different request'},now)[0].fit,'unknown');
});
test('invalid evidence, dates, unsafe URLs, future formats and negative totals fail closed',()=>{
  for(const change of [{schemaVersion:2},{start:'2026-02-30'},{party:{adults:0,rooms:1,childrenAges:[]}},{criteria:[{id:'same',label:'A'},{id:'same',label:'B'}]}])assert.throws(()=>normalizeTrip({...fixture(),...change}));
  const t=fixture();t.candidates[0].checks[0].source='javascript:alert(1)';assert.throws(()=>normalizeTrip(t));
  const p=fixture();p.candidates[0].offers[0].evidence='';assert.throws(()=>normalizeTrip(p));
  const n=fixture();n.candidates[0].offers[0].total=-1;assert.throws(()=>normalizeTrip(n));
});
test('hotel and flight scopes remain distinct and missing occupancy cannot be bookable',()=>{
  const t=fixture();t.kind='flight';t.end='';t.researchKey=tripKey(t);t.candidates[0].offers[0].contextKey=tripKey(t);
  assert.equal(offerState(t,t.candidates[0],t.candidates[0].offers[0],now),'Observed offer — recheck before booking');
  t.party=null;t.researchKey=tripKey(t);t.candidates[0].offers[0].contextKey=tripKey(t);
  assert.equal(offerState(t,t.candidates[0],t.candidates[0].offers[0],now),'Travel details incomplete');
});
test('private trip edits survive an offline restart, synchronize, conflict and disconnect',async()=>{
  let data=null,online=false,cloud=[];
  const store={read:async()=>structuredClone(data),write:async(r,t,v)=>{data=structuredClone(v);},remove:async()=>{data=null;}};
  const remote=async(token,path,options={})=>{
    if(!online)throw Error('offline');
    if(options.method==='PUT'){
      const old=cloud.find(x=>x.id===options.value.id);
      if(old&&options.value.revision!==old.revision)throw {status:409,message:'conflict'};
      const r={...options.value,revision:options.value.operation||'r1'};cloud=[r];return {record:r};
    }
    return {records:structuredClone(cloud)};
  };
  const open=()=>tripsOffline({store,remote,online:()=>online});
  const id='11111111-1111-4111-8111-111111111111';
  await open().request('token',`/v1/trips/${id}`,{method:'PUT',value:{...fixture(),id,revision:null}});
  const reopened=await open().request('token','/v1/trips');assert.equal(reopened.records[0].title,'Synthetic city stay');assert.equal(reopened.records[0].pending,true);
  online=true;await open().request('token','/v1/trips');assert.equal(await open().hasPending('token'),false);
  online=false;const old=cloud[0];await open().request('token',`/v1/trips/${id}`,{method:'PUT',value:{...old,title:'Local edit'}});
  cloud=[{...old,title:'Cloud edit',revision:'new-cloud-revision'}];online=true;
  const conflict=await open().request('token','/v1/trips');assert.equal(conflict.records[0].conflict,true);
  await open().resolve('token',id,'cloud');assert.equal(await open().hasPending('token'),false);
  await open().disconnect('token');assert.equal(data,null);
});

test('sign-in checkpoints survive saves without being mistaken for search results',()=>{
  const t=fixture();t.channels=[{id:'amex',label:'Amex',status:'login',resumeURL:'https://www.americanexpress.com/en-us/travel/',nextStep:'After device unlock, autofill sign-in and run this trip.',contextKey:tripKey(t)}];
  const saved=normalizeTrip(t);assert.equal(saved.channels[0].status,'login');assert.equal(saved.channels[0].contextKey,tripKey(saved));
  assert.throws(()=>normalizeTrip({...t,channels:[{...t.channels[0],resumeURL:'https://example.com/?access_token=secret'}]}));
  assert.equal(normalizeTrip({...saved,title:'Renamed'}).channels[0].nextStep,t.channels[0].nextStep);
  assert.throws(()=>normalizeTrip({...t,end:t.start}));
});
test('search retention removes downloaded expired data but preserves queued edits',async()=>{
  const {offlineResource}=await import('../src/offline-resource.js');
  const {tripExpired}=await import('../src/trip-data.js');
  let state={cloud:[{id:'old',updatedAt:'2020-01-01T00:00:00.000Z'}],pending:{pending:{value:{id:'pending',title:'Unsynced'},localRevision:'local:x',method:'PUT'}},syncedAt:'2020-01-01T00:00:00.000Z'};
  const resource=offlineResource({resource:'trips',path:'/v1/trips',store:{read:async()=>structuredClone(state),write:async(r,t,v)=>{state=structuredClone(v);}},remote:()=>assert.fail('Offline'),normalize:v=>v,metadata:v=>v,online:()=>false,expired:tripExpired,locks:null});
  const result=await resource.request('token','/v1/trips');assert.equal(state.cloud.length,0);assert.equal(result.records.length,1);assert.equal(result.records[0].pending,true);
});
