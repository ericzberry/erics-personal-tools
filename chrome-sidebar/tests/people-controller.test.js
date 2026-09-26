import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountPeople} from '../src/people.js';
const settle=async check=>{for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,1));if(check())return;}throw Error('Did not settle');};
test('family context keeps age and reference year and preserves failed edits',async()=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=false;const selected=[...this.options].find(o=>o.value===value);if(selected)selected.selected=true;}});
  let records=[],fail=false;
  mountPeople(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:{request:async(t,p,o={})=>{if(o.method){if(fail)throw Error('Save failed');records=[{...o.value,revision:'new'}];}return {records};}}});
  await settle(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Add person'&&!b.disabled));
  [...document.querySelectorAll('button')].find(b=>b.textContent==='Add person').click();
  for(const [key,value] of Object.entries({name:'Child',role:'Child',age:'7',ageYear:'2026'}))document.getElementById(`people-${key}`).value=value;
  document.getElementById('people-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>records.length===1);
  assert.equal(records[0].age,7);assert.equal(records[0].ageYear,2026);
  document.querySelector('[aria-label="Edit Child"]').click();fail=true;document.getElementById('people-name').value='Keep this edit';
  document.getElementById('people-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>document.getElementById('people-form-status').textContent.includes('Save failed'));
  assert.equal(document.getElementById('people-name').value,'Keep this edit');assert.equal(records[0].name,'Child');
});
