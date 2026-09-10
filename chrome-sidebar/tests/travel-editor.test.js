import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTravel} from '../src/travel.js';
import {offlineResource} from '../src/offline-resource.js';
import {normalizeTravel,travelMetadata} from '../src/travel-data.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'Airline';},set(value){for(const o of this.querySelectorAll('option'))o.selected=o.value===value;}});
  return {window,document,root:document.querySelector('main'),$:id=>document.getElementById(`travel-${id}`)};
}
const record={id:'abc',revision:'one',name:'Synthetic airline',category:'Airline',traveler:'Test',hasNotes:true};
for(const mode of ['editor','inline'])test(`${mode}: consecutive new entries survive refresh, restart and offline synchronization`,async()=>{
  const {root,$,window}=setup();let state=null,online=false;const cloud=new Map(),saved=[];
  const create=()=>offlineResource({resource:'travel',path:'/v1/travel',locks:null,online:()=>online,
    normalize:normalizeTravel,metadata:travelMetadata,
    store:{read:async()=>structuredClone(state),write:async(_r,_t,value)=>{state=structuredClone(value);}},
    remote:async(_token,path,options={})=>{
      if(path.endsWith('/snapshot'))return {records:structuredClone([...cloud.values()])};
      const id=path.split('/').at(-1),previous=cloud.get(id);
      assert.equal(options.value.revision,previous?.revision??null);
      const value={...normalizeTravel(options.value,previous),id,revision:crypto.randomUUID()};
      cloud.set(id,value);return {record:travelMetadata(value)};
    }
  });
  const adapter=create();
  const wallet=mountTravel(root,{mode,credentials:{get:async()=> 'test'},request:adapter.request,onSaved:id=>saved.push(id)});
  await wallet.ready;
  for(const [name,number] of [['First airline','00123'],['Second hotel','00456']]){
    $('name').value=name;$('number').value=number;$('form').dispatchEvent(new window.Event('input'));
    $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
    assert.equal(wallet.isDirty(),false);
    // Returning to the page must not turn Add record into an edit of the last save.
    await wallet.refresh();
  }
  assert.equal(new Set(saved).size,2,'each new entry must have its own record ID');
  const restarted=create();
  assert.equal((await restarted.request('test','/v1/travel')).records.length,2);
  assert.equal((await restarted.request('test',`/v1/travel/${saved[0]}`)).record.number,'00123');
  assert.equal((await restarted.request('test',`/v1/travel/${saved[1]}`)).record.number,'00456');
  online=true;
  assert.equal((await restarted.request('test','/v1/travel')).records.length,2);
  assert.equal(cloud.size,2);
  await wallet.refresh();
  assert.equal($('name').value,'');assert.equal($('number').value,'');
});
test('sidebar Add and Edit launch the editor without an inline form or local writes',async()=>{
  const {root,$,window}=setup();const opened=[];
  await mountTravel(root,{mode:'browse',credentials:{get:async()=> 'test'},request:async(_token,_path,options)=>{assert.equal(options,undefined);return {records:[record]};},onOpenEditor:id=>opened.push(id)}).ready;
  assert.equal($('editor').hidden,true);
  $('add').click();await tick();
  [...$('list').querySelectorAll('button')].find(b=>b.textContent==='Edit').click();await tick();
  assert.deepEqual(opened,[undefined,'abc']);
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  assert.equal($('editor').hidden,true);
});
test('failed additions preserve input and retry the same ID; the next successful addition gets a new ID',async()=>{
  const {root,$,window}=setup();const writes=[];let fail=true;
  const wallet=mountTravel(root,{mode:'editor',credentials:{get:async()=> 'test'},request:async(_token,path,options)=>{
    if(!options)return {records:[]};
    writes.push({path,value:options.value});
    if(fail)throw Error('Storage unavailable');
    return {record:{...options.value,id:path.split('/').at(-1),revision:'saved'}};
  }});
  await wallet.ready;
  $('name').value='First airline';$('number').value='00123';$('form').dispatchEvent(new window.Event('input'));
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'First airline');assert.equal($('number').value,'00123');assert.equal(wallet.isDirty(),true);
  fail=false;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal(writes[0].path,writes[1].path);
  assert.equal($('name').value,'');assert.equal($('number').value,'');
  $('name').value='Second hotel';$('number').value='00456';$('form').dispatchEvent(new window.Event('input'));
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.notEqual(writes[1].path,writes[2].path);
  assert.ok(writes.every(write=>write.value.revision===null));
});
test('separate editor loads the chosen revision, preserves failed input and refreshes only clean edits',async()=>{
  const {root,$,window}=setup();let current={...record},fail=true,writes=[],saved=[],changes=0;
  const wallet=mountTravel(root,{mode:'editor',editId:'abc',credentials:{get:async()=> 'test'},onSaved:id=>saved.push(id),onChanged:()=>changes++,request:async(_token,_path,options)=>{
    if(options?.method==='PUT'){writes.push(options.value);if(fail)throw Error('Save failed');current={...current,...options.value,revision:'two'};return {record:current};}
    return {records:[current]};
  }});
  await wallet.ready;
  assert.equal($('name').value,record.name);assert.equal($('number').value,'');
  $('name').value='Updated';$('form').dispatchEvent(new window.Event('input'));
  current={...current,name:'Other device'};wallet.refresh();await tick();assert.equal($('name').value,'Updated');
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal(changes,0);assert.equal($('name').value,'Updated');assert.equal(writes[0].revision,'one');assert.equal(writes[0].number,undefined);
  fail=false;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal(changes,1);assert.deepEqual(saved,['abc']);assert.equal($('name').value,'Updated');assert.equal(wallet.isDirty(),false);
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();assert.equal(writes.at(-1).revision,'two');
});
test('missing editor record cannot silently create a replacement',async()=>{
  const {root,$,window}=setup();let calls=0;
  await mountTravel(root,{mode:'editor',editId:'deleted',credentials:{get:async()=> 'test'},request:async()=>{calls++;return {records:[]};}}).ready;
  assert.equal($('save').disabled,true);assert.match($('form-status').textContent,/no longer available/);
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();assert.equal(calls,1);
});
test('change notifications during a busy refresh are coalesced and applied afterwards',async()=>{
  const {root,$}=setup();let release,calls=0;
  const wallet=mountTravel(root,{mode:'browse',credentials:{get:async()=> 'test'},request:async()=>{
    calls++;if(calls===2)await new Promise(resolve=>{release=resolve;});
    return {records:[{...record,name:calls>=3?'Live updated airline':'Original airline'}]};
  }});
  await wallet.ready;
  const refreshing=wallet.refresh();await tick();
  wallet.refresh();wallet.refresh();release();await refreshing;await tick();
  assert.equal(calls,3);assert.match($('list').textContent,/Live updated airline/);
});

test('connection setup hides unavailable maintenance and preserves token after failure',async()=>{
  const {root,$}=setup();let saved='';
  const wallet=mountTravel(root,{credentials:{get:async()=>saved,set:async value=>{saved=value;},remove:async()=>{saved='';}},request:async token=>{if(token==='bad')throw Error('Check your access token.');return {records:[]};}});
  await wallet.ready;
  assert.equal($('setup').hidden,false);assert.equal($('maintenance').hidden,true);
  $('token').value='bad';$('connect').click();await tick();
  assert.equal($('token').value,'bad');assert.equal($('maintenance').hidden,true);
  $('token').value='synthetic-token';$('connect').click();await tick();
  assert.equal($('setup').hidden,true);assert.equal($('maintenance').hidden,false);
  assert.equal($('token').value,'');
  $('disconnect').click();await tick();
  assert.equal($('setup').hidden,false);assert.equal($('maintenance').hidden,true);
});
