import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineResource} from '../src/offline-resource.js';
import {normalizeTravel,travelMetadata} from '../src/travel-data.js';
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
