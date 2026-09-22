import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {privateStores} from '../src/private-resources.js';
import {assertPrivateDataSynced,disconnectPrivateData} from '../src/private-disconnect.js';
import {WEATHER_RESOURCE} from '../src/weather.js';
import {restaurantHistory} from '../src/restaurant-history.js';

const src=new URL('../src/',import.meta.url);
function memory(){
  const data=new Map(),key=(resource,token)=>`${resource}:${token}`;
  return {data,
    read:async(resource,token)=>structuredClone(data.get(key(resource,token))??null),
    write:async(resource,token,value)=>{data.set(key(resource,token),structuredClone(value));},
    remove:async(resource,token)=>{data.delete(key(resource,token));}};
}
const offline=async()=>{throw Error('offline');};
const synced={cloud:[{id:'a',revision:'1'}],pending:{},syncedAt:'2026-09-22T12:00:00.000Z',error:''};
const queued={...synced,pending:{b:{method:'PUT',value:{id:'b',brand:'Synthetic',size:'M'},baseRevision:null,localRevision:'local:synthetic',conflict:false}}};
const sources=(dir=src)=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(new URL(`${entry.name}/`,dir)):entry.name.endsWith('.js')?[new URL(entry.name,dir)]:[]);
const registered=()=>new Set(Object.values(privateStores({store:memory(),remote:offline})).map(store=>store.resource));

// A module that writes to the device store itself, rather than through an
// offline resource, and the copy it keeps there.
const direct={'health-offline.js':'health-draft','weather.js':WEATHER_RESOURCE,'restaurant-history.js':restaurantHistory({store:memory(),remote:offline}).resource};

// The registry is read off the directory rather than a list, so a tool's store
// is held to it the day its file appears — the sizes store was once left out of
// the extension's disconnect, and its cache outlived every disconnect after.
test('every store a tool keeps on the device is one a disconnect clears',async()=>{
  const names=registered(),seen=new Set();
  for(const file of sources()){
    const name=file.pathname.slice(src.pathname.length),text=readFileSync(file,'utf8');
    if(name!=='offline-resource.js'&&/\bofflineResource\(/.test(text))
      assert.match(name,/-offline\.js$/,`${name} opens an offline store; give it a *-offline.js module and register it in private-resources.js`);
    if(name.endsWith('-offline.js'))for(const open of Object.values(await import(file))){
      if(typeof open!=='function')continue;
      const {resource}=open({store:memory(),remote:offline});
      seen.add(resource);
      assert.ok(names.has(resource),`${name} keeps "${resource}" on the device, but private-resources.js does not clear it`);
    }
    if(name!=='offline-resource.js'&&/\bstore\.write\(/.test(text))
      assert.ok(names.has(direct[name]),`${name} writes to the device store; register what it keeps in private-resources.js and name it above`);
  }
  assert.ok(seen.has('sizes'),'the scan reached the tool stores');
});

test('an unsynced size edit holds every copy on the device; a synced one lets all of them go',async()=>{
  const store=memory(),stores=privateStores({store,remote:offline,online:()=>false});
  for(const {resource} of Object.values(stores))await store.write(resource,'synthetic-token',synced);
  await store.write('sizes','synthetic-token',queued);
  await store.write('sizes','another-token',synced);
  const kept=store.data.size;
  await assert.rejects(assertPrivateDataSynced('synthetic-token',stores),/pending private changes/);
  await assert.rejects(disconnectPrivateData('synthetic-token',stores),/pending private changes/);
  assert.equal(store.data.size,kept,'nothing leaves the device while a change is waiting');
  await store.write('sizes','synthetic-token',synced);
  await assertPrivateDataSynced('synthetic-token',stores);
  await disconnectPrivateData('synthetic-token',stores);
  assert.deepEqual([...store.data.keys()],['sizes:another-token']);
});
