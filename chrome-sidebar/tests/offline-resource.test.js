import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineResource} from '../src/offline-resource.js';
import {normalizeTravel,travelMetadata} from '../src/travel-data.js';
import {normalizeSubscription} from '../src/subscription-data.js';
function fixture(){
  const db=new Map(),cloud=new Map();let online=true,calls=0,fail=false,loseResponse=false;
  const store={async read(r,t){return structuredClone(db.get(`${r}:${t}`)||null);},async write(r,t,v){db.set(`${r}:${t}`,structuredClone(v));},async remove(r,t){db.delete(`${r}:${t}`);}};
  const remote=async(token,path,options={})=>{
    calls++;if(!online||fail)throw Error('Network unavailable.');
    if(path.endsWith('/snapshot'))return {records:structuredClone([...cloud.values()])};
    const id=path.split('/').at(-1),previous=cloud.get(id);
    if((previous?.revision??null)!==(options.value?.revision??null))throw Object.assign(Error('Conflict'),{status:409});
    if(options.method==='DELETE'){cloud.delete(id);return {ok:true};}
    const record={...normalizeTravel(options.value,previous),id,revision:crypto.randomUUID(),updatedAt:'now'};cloud.set(id,record);
    if(loseResponse){loseResponse=false;throw Error('Response lost.');}
    return {record:travelMetadata(record)};
  };
  const create=()=>offlineResource({resource:'travel',path:'/v1/travel',store,remote,normalize:normalizeTravel,metadata:travelMetadata,online:()=>online,locks:null});
  return {create,cloud,db,setOnline:v=>online=v,setFail:v=>fail=v,loseResponse:()=>loseResponse=true,calls:()=>calls};
}
const sample={id:'one',name:'Synthetic airline',category:'Airline',number:'00123456',notes:'Synthetic private note',traveler:'Example',expires:'',revision:'original'};
test('cold offline reopen reads and copies private data without network; edits survive restart and sync',async()=>{
  const f=fixture();f.cloud.set('one',sample);let adapter=f.create();
  const first=await adapter.request('token','/v1/travel');assert.equal(first.records[0].number,undefined);
  f.setOnline(false);adapter=f.create();const before=f.calls();
  assert.equal((await adapter.request('token','/v1/travel')).records.length,1);
  assert.equal((await adapter.request('token','/v1/travel/one')).record.number,'00123456');assert.equal(f.calls(),before);
  const saved=await adapter.request('token','/v1/travel/one',{method:'PUT',value:{name:'Offline edit',revision:'original'}});
  assert.equal(saved.records[0].pending,true);assert.match(saved.syncMessage,/waiting to sync/);
  adapter=f.create();assert.equal((await adapter.request('token','/v1/travel/one')).record.name,'Offline edit');
  await assert.rejects(adapter.disconnect('token'),/pending changes/);
  f.setOnline(true);const result=await adapter.request('token','/v1/travel');assert.equal(result.records[0].pending,undefined);assert.equal(f.cloud.get('one').name,'Offline edit');assert.equal(f.cloud.get('one').number,'00123456');
  await adapter.disconnect('token');f.setOnline(false);await assert.rejects(adapter.request('token','/v1/travel'),/download/);
});
test('conflicts retain local edits and require explicit resolution with current revisions',async()=>{
  const f=fixture();f.cloud.set('one',sample);const adapter=f.create();await adapter.request('token','/v1/travel');f.setOnline(false);
  await adapter.request('token','/v1/travel/one',{method:'PUT',value:{name:'Local name',revision:'original'}});
  f.cloud.set('one',{...sample,name:'Other device',revision:'new'});f.setOnline(true);
  const result=await adapter.request('token','/v1/travel');assert.equal(result.records[0].conflict,true);assert.equal(result.records[0].name,'Local name');assert.equal(f.cloud.get('one').name,'Other device');
  const resolved=await adapter.resolve('token','one','local');assert.equal(resolved.records[0].conflict,undefined);assert.equal(f.cloud.get('one').name,'Local name');
});
test('lost successful responses reconcile without duplicate writes; cloud deletion does not resurrect records',async()=>{
  const f=fixture();const adapter=f.create();await adapter.request('token','/v1/travel');f.loseResponse();
  await adapter.request('token','/v1/travel/one',{method:'PUT',value:{...sample,revision:null}});
  assert.equal(await adapter.hasPending('token'),true);
  await adapter.request('token','/v1/travel');assert.equal(await adapter.hasPending('token'),false);assert.equal(f.cloud.size,1);
  f.cloud.delete('one');assert.equal((await adapter.request('token','/v1/travel')).records.length,0);
});
test('delete queues survive restart, conflicting deletion can be discarded, and failed storage never reports a save',async()=>{
  const f=fixture();f.cloud.set('one',sample);let adapter=f.create();await adapter.request('token','/v1/travel');f.setOnline(false);
  const deleted=await adapter.request('token','/v1/travel/one',{method:'DELETE',value:{revision:'original'}});assert.equal(deleted.records[0].deleting,true);
  adapter=f.create();f.cloud.set('one',{...sample,revision:'other'});f.setOnline(true);assert.equal((await adapter.request('token','/v1/travel')).records[0].conflict,true);
  assert.equal((await adapter.resolve('token','one','cloud')).records[0].pending,undefined);assert.equal(f.cloud.size,1);
  const bad=offlineResource({resource:'travel',path:'/v1/travel',store:{read:async()=>null,write:async()=>{throw Error('Quota exceeded');}},remote:async()=>{},normalize:normalizeTravel,metadata:travelMetadata,online:()=>false,locks:null});
  await assert.rejects(bad.request('token','/v1/travel/new',{method:'PUT',value:{...sample,revision:null}}),/Quota/);
});
test('cached data is scoped to the access token and stale edits from another window are rejected',async()=>{
  const f=fixture();f.cloud.set('one',sample);const adapter=f.create();await adapter.request('token','/v1/travel');f.setOnline(false);
  await assert.rejects(adapter.request('different-token','/v1/travel'),/download/);
  await adapter.request('token','/v1/travel/one',{method:'PUT',value:{name:'First edit',revision:'original'}});
  await assert.rejects(adapter.request('token','/v1/travel/one',{method:'PUT',value:{name:'Stale edit',revision:'original'}}),/another window/);
});
test('offline deletion syncs after a restart without resurrecting the cached record',async()=>{
  const f=fixture();f.cloud.set('one',sample);let adapter=f.create();await adapter.request('token','/v1/travel');f.setOnline(false);
  await adapter.request('token','/v1/travel/one',{method:'DELETE',value:{revision:'original'}});
  adapter=f.create();f.setOnline(true);assert.equal((await adapter.request('token','/v1/travel')).records.length,0);assert.equal(f.cloud.size,0);
});
test('a shared browser lock serializes two windows without losing queued records',async()=>{
  const db=new Map();const store={read:async()=>structuredClone(db.get('state')||null),write:async(r,t,v)=>{await new Promise(resolve=>setTimeout(resolve,2));db.set('state',structuredClone(v));}};
  let queue=Promise.resolve();const locks={request(name,action){const result=queue.then(action);queue=result.catch(()=>{});return result;}};
  const create=()=>offlineResource({resource:'travel',path:'/v1/travel',store,remote:async()=>{},normalize:normalizeTravel,metadata:travelMetadata,online:()=>false,locks});
  await Promise.all(['one','two'].map(id=>create().request('token',`/v1/travel/${id}`,{method:'PUT',value:{...sample,id,revision:null}})));
  assert.equal((await create().request('token','/v1/travel')).records.length,2);
});

test('mobile number list opts in to cached numbers without exposing private notes or extra requests',async()=>{
  const {travelOffline}=await import('../src/travel-offline.js');
  let saved=null,online=true,calls=0;
  const store={read:async()=>structuredClone(saved),write:async(_r,_t,value)=>{saved=structuredClone(value);},remove:async()=>{saved=null;}};
  const remote=async()=>{calls++;return {records:[sample]};};
  const options={store,remote,online:()=>online,locks:null};
  const normal=await travelOffline(options).request('token','/v1/travel');
  assert.equal(normal.records[0].number,undefined);assert.equal(normal.syncMessage,'');
  online=false;const before=calls;
  const mobile=await travelOffline({...options,includeNumbers:true}).request('token','/v1/travel');
  assert.equal(mobile.records[0].number,'00123456');assert.equal(mobile.records[0].notes,undefined);
  assert.equal(calls,before);assert.match(mobile.syncMessage,/Offline/);
});

// The Worker answers in JSON, so whatever it sends back is a new object: a
// subscription's charges, reviewed evidence and research never arrive as the
// arrays and objects the device queued, even when they hold exactly the same.
function subscriptionFixture({operations=true,reshape=false}={}){
  const db=new Map(),cloud=new Map(),writes=[];let loseResponse=false;
  const store={async read(r,t){return structuredClone(db.get(`${r}:${t}`)||null);},async write(r,t,v){db.set(`${r}:${t}`,structuredClone(v));},async remove(r,t){db.delete(`${r}:${t}`);}};
  const wire=value=>JSON.parse(JSON.stringify(value));
  const remote=async(token,path,options={})=>{
    if(path.endsWith('/snapshot'))return wire({records:[...cloud.values()]});
    const id=path.split('/').at(-1),previous=cloud.get(id),input=wire(options.value);writes.push(input);
    if(operations&&input.operation&&input.operation!==input.revision&&previous?.revision===input.operation)return wire({record:previous});
    if((previous?.revision??null)!==(input.revision??null))throw Object.assign(Error('Conflict'),{status:409});
    if(options.method==='DELETE'){cloud.delete(id);return {ok:true};}
    let value=normalizeSubscription(input,previous);
    // A Worker a version ahead of the device, whose normalizer stores more than
    // the device's does: the content no longer matches what was queued.
    if(reshape)value={...value,charges:value.charges.map(charge=>({...charge,currency:value.currency}))};
    const record={...value,id,revision:(operations&&input.operation&&input.operation!==input.revision)?input.operation:crypto.randomUUID(),updatedAt:'now'};cloud.set(id,record);
    if(loseResponse){loseResponse=false;throw Error('Response lost.');}
    return wire({record});
  };
  const create=()=>offlineResource({resource:'subscriptions',path:'/v1/subscriptions',store,remote,normalize:normalizeSubscription,metadata:record=>record,online:()=>true,locks:null});
  return {create,cloud,writes,loseResponse:()=>loseResponse=true};
}
const subscription={name:'Synthetic Stream',account:'Example Card',currency:'USD',amount:15,cycle:'monthly',state:'Active',renewal:'',canceledOn:'',notice:14,url:'',notes:'',
  charges:[{on:'2026-08-01',amount:15,description:'SYNTHETIC STREAM',source:'August'},{on:'2026-09-01',amount:15,description:'SYNTHETIC STREAM',source:'September'}],
  reviewedCharges:[JSON.stringify(['2026-09-01',15,'SYNTHETIC STREAM'])],
  research:{checked:'2026-09-10',country:'United States',requirements:'No ads',summary:'Compare plans.',options:[{name:'Annual plan',amount:150,currency:'USD',cycle:'annual',url:'https://example.com/pricing',terms:'Paid upfront.'}]}};
for(const operations of [false,true])test(`a subscription saved before its response was lost is not a conflict (${operations?'Worker names writes':'older Worker'})`,async()=>{
  const f=subscriptionFixture({operations});const adapter=f.create();await adapter.request('token','/v1/subscriptions');
  f.loseResponse();
  const saved=await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...subscription,revision:null}});
  assert.equal(saved.records[0].pending,true);assert.equal(f.cloud.size,1);
  const synced=await adapter.request('token','/v1/subscriptions');
  assert.equal(synced.records[0].conflict,undefined);assert.equal(synced.records[0].pending,undefined);assert.equal(synced.syncMessage,'');
  assert.equal(await adapter.hasPending('token'),false);assert.equal(f.writes.length,1);
  assert.deepEqual(synced.records[0].charges,subscription.charges);assert.deepEqual(synced.records[0].research,subscription.research);
});
test('a write the Worker stored differently is recognized by its name, and without one is held for review',async()=>{
  for(const operations of [true,false]){
    const f=subscriptionFixture({operations,reshape:true});const adapter=f.create();await adapter.request('token','/v1/subscriptions');
    f.loseResponse();await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...subscription,revision:null}});
    const synced=await adapter.request('token','/v1/subscriptions');
    // Content that does not match is never taken as proof, so an older Worker
    // leaves the owner a conflict to review rather than a silently dropped change.
    assert.equal(synced.records[0].conflict,operations?undefined:true);assert.equal(await adapter.hasPending('token'),!operations);assert.equal(f.writes.length,1);
  }
});
test('a subscription another device changed is still a conflict, and choosing this device names a new write',async()=>{
  const f=subscriptionFixture();f.cloud.set('one',{...subscription,id:'one',revision:'original',updatedAt:'then'});
  const adapter=f.create();await adapter.request('token','/v1/subscriptions');
  f.loseResponse();
  const extra={on:'2026-10-01',amount:17,description:'SYNTHETIC STREAM',source:'October'};
  await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...subscription,charges:[...subscription.charges,extra],revision:'original'}});
  // The write landed; then another device changed the evidence on top of it.
  const other=f.cloud.get('one');f.cloud.set('one',{...other,reviewedCharges:[],revision:'other'});
  const conflicted=await adapter.request('token','/v1/subscriptions');
  assert.equal(conflicted.records[0].conflict,true);assert.equal(f.writes.length,1);
  await adapter.resolve('token','one','local');
  assert.equal(f.writes.length,2);assert.notEqual(f.writes[1].operation,f.writes[0].operation);
  assert.equal(f.cloud.get('one').revision,f.writes[1].operation);assert.equal(await adapter.hasPending('token'),false);
});
test('an edit made on top of a write whose response was lost syncs without a conflict',async()=>{
  const f=subscriptionFixture();const adapter=f.create();await adapter.request('token','/v1/subscriptions');
  f.loseResponse();const first=await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...subscription,revision:null}});
  // No snapshot in between: the owner changes the still-pending record.
  const again=await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...subscription,notes:'Price rises in October.',revision:first.record.revision}});
  assert.equal(again.records[0].conflict,undefined);assert.equal(again.records[0].pending,undefined);
  assert.equal(f.cloud.get('one').notes,'Price rises in October.');assert.equal(f.writes.length,2);assert.equal(f.writes[1].revision,f.writes[0].operation);
});
