import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTravel} from '../src/travel.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'Airline';},set(value){for(const o of this.querySelectorAll('option'))o.selected=o.value===value;}});
  return {window,document,root:document.querySelector('main'),$:id=>document.getElementById(`travel-${id}`)};
}
const record={id:'abc',revision:'one',name:'Synthetic airline',category:'Airline',traveler:'Test',hasNotes:true};
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
test('separate editor loads the chosen revision, preserves failed input and refreshes only clean edits',async()=>{
  const {root,$,window}=setup();let current={...record},fail=true,writes=[],saved=[];
  const wallet=mountTravel(root,{mode:'editor',editId:'abc',credentials:{get:async()=> 'test'},onSaved:id=>saved.push(id),request:async(_token,_path,options)=>{
    if(options?.method==='PUT'){writes.push(options.value);if(fail)throw Error('Save failed');current={...current,...options.value,revision:'two'};return {record:current};}
    return {records:[current]};
  }});
  await wallet.ready;
  assert.equal($('name').value,record.name);assert.equal($('number').value,'');
  $('name').value='Updated';$('form').dispatchEvent(new window.Event('input'));
  current={...current,name:'Other device'};wallet.refresh();await tick();assert.equal($('name').value,'Updated');
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'Updated');assert.equal(writes[0].revision,'one');assert.equal(writes[0].number,undefined);
  fail=false;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.deepEqual(saved,['abc']);assert.equal($('name').value,'Updated');assert.equal(wallet.isDirty(),false);
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();assert.equal(writes.at(-1).revision,'two');
});
test('missing editor record cannot silently create a replacement',async()=>{
  const {root,$,window}=setup();let calls=0;
  await mountTravel(root,{mode:'editor',editId:'deleted',credentials:{get:async()=> 'test'},request:async()=>{calls++;return {records:[]};}}).ready;
  assert.equal($('save').disabled,true);assert.match($('form-status').textContent,/no longer available/);
  $('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();assert.equal(calls,1);
});
