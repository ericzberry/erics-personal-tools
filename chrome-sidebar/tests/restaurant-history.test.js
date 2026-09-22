import test from 'node:test';
import assert from 'node:assert/strict';
import {restaurantHistory,RESTAURANT_HISTORY,LEGACY_RESTAURANT_CACHE,HISTORY_LIMITS} from '../src/restaurant-history.js';
import {buildIntent,SCHEMA_VERSION} from '../src/restaurant-data.js';
function memory(){
  const data=new Map(),key=(resource,token)=>`${resource}:${token}`;
  return {data,read:async(r,t)=>structuredClone(data.get(key(r,t))??null),write:async(r,t,v)=>{data.set(key(r,t),structuredClone(v));},remove:async(r,t)=>{data.delete(key(r,t));}};
}
const token='synthetic-token',start=Date.parse('2030-09-15T00:00:00Z');
const search=(id,at,extra={})=>({id,intent:buildIntent({text:`search ${id}`,city:'NYC'},{now:new Date(start),id}),candidates:[],observations:[{id:'o',venueId:'v',observedAt:new Date(at).toISOString()}],researchedAt:new Date(at).toISOString(),...extra});
test('history keeps the last ten searches for thirty days and a day of observations, newest first',async()=>{
  let clock=start;const store=memory(),history=restaurantHistory({store,locks:null,now:()=>clock});
  for(let i=0;i<12;i++){clock=start+i*60000;await history.write(token,search(`00000000-0000-4000-8000-0000000000${String(i).padStart(2,'0')}`,clock));}
  const state=await history.read(token);
  assert.equal(state.searches.length,HISTORY_LIMITS.searches);assert.equal(state.searches[0].id,'00000000-0000-4000-8000-000000000011');
  assert.equal((await history.latest(token)).id,state.searches[0].id);
  clock=start+HISTORY_LIMITS.observationMs+12*60000;
  assert.deepEqual((await history.latest(token)).observations,[],'a day-old observation is history, not a search result');
  clock=start+HISTORY_LIMITS.searchMs+13*60000;
  assert.equal((await history.latest(token)),null);
  assert.equal(await history.hasPending(token),false);
  assert.deepEqual(await history.read(''),{schemaVersion:SCHEMA_VERSION,searches:[]});
  await assert.rejects(history.write('',search('x',clock)),/access token/);
});
test('a write lands on its own search id, even when it is no longer the latest (R10)',async()=>{
  let clock=start;const store=memory(),history=restaurantHistory({store,locks:null,now:()=>clock});
  const a='00000000-0000-4000-8000-00000000000a',b='00000000-0000-4000-8000-00000000000b';
  await history.write(token,search(a,clock));clock+=1000;await history.write(token,search(b,clock));clock+=1000;
  await history.write(token,{...search(a,clock),candidates:[{name:'late'}]});
  const state=await history.read(token);
  assert.deepEqual(state.searches.map(s=>s.id),[a,b]);
  assert.equal(state.searches.find(s=>s.id===a).candidates[0].name,'late');
});
test('the previous version’s download comes forward as a dated search of leads, and the old copy goes only after the new one is written (R27)',async()=>{
  const store=memory(),history=restaurantHistory({store,locks:null,now:()=>start});
  await store.write(LEGACY_RESTAURANT_CACHE,token,{startedAt:1,downloadedAt:'2030-09-01T00:00:00Z',search:{mode:'restaurant',query:'Example Bistro',city:'NYC',date:'2030-09-10',endDate:'2030-09-10',minParty:2,maxParty:2,startTime:'17:00',endTime:'22:00'},
    research:{clarification:'',restaurants:[{name:'Example Bistro',address:'100 Example',city:'New York City',neighborhood:'UWS',borough:'Manhattan',booking:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example'}],evidence:[{url:'https://example.com/review',title:'Source',detail:'Verified rating',published:'2026'}]}]}});
  const latest=await history.latest(token);
  assert.equal(latest.legacy,true);assert.equal(latest.intent.mode,'named');assert.equal(latest.intent.interpretationVersion,'legacy');
  assert.equal(latest.candidates[0].claims[0].status,'unknown');assert.match(latest.candidates[0].claims[0].reason,/not read from the source/);
  assert.equal(latest.candidates[0].providers[0].provider,'Resy');
  assert.equal(store.data.has(`${LEGACY_RESTAURANT_CACHE}:${token}`),false);
  assert.ok(store.data.has(`${RESTAURANT_HISTORY}:${token}`));
  const failing=memory();failing.write=async()=>{throw Error('disk full');};
  await failing.data.set(`${LEGACY_RESTAURANT_CACHE}:${token}`,{research:{restaurants:[]},search:{}});
  await assert.rejects(restaurantHistory({store:failing,locks:null}).latest(token),/disk full/);
  assert.ok(failing.data.has(`${LEGACY_RESTAURANT_CACHE}:${token}`),'the legacy copy survives a failed migration');
  await store.write(RESTAURANT_HISTORY,token,{schemaVersion:99,searches:[]});
  await assert.rejects(history.latest(token),/newer version/);
  await history.disconnect(token);
  assert.equal(store.data.size,0);
});
