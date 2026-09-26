import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTrips} from '../src/trips.js';
import {fixture} from './trips-fixture.js';
const settle=async check=>{for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,1));if(check())return;}throw Error('Tool did not settle');};
test('trip edits preserve research, show stale scope and retain input on failure',async()=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  let record={...fixture(),id:'11111111-1111-4111-8111-111111111111',revision:'r1'},fail=false;
  record.channels=[{id:'amex',label:'Amex Travel',status:'login',nextStep:'Unlock Apple Passwords on your Mac.',resumeURL:'https://www.americanexpress.com/en-us/travel/'}];
  const offline={request:async(t,p,o={})=>{
    if(o.method){if(fail)throw Error('Synthetic save failure');record={...o.value,revision:'r2'};}
    return {records:[record]};
  }};
  mountTrips(document.querySelector('main'),{credentials:{get:async()=>'token'},offline});
  const click=node=>node.dispatchEvent(new window.Event('click'));
  await settle(()=>!!document.querySelector('[aria-label="Edit Synthetic city stay"]'));
  assert.match(document.getElementById('trips-result').textContent,/Observed offer/);
  const auth=document.querySelector('.trip-auth');assert.match(auth.textContent,/Sign-in needs your help.*Unlock Apple Passwords/s);
  assert.equal(auth.closest('details'),null);assert.equal(auth.querySelector('a').href,'https://www.americanexpress.com/en-us/travel/');
  click(document.querySelector('[aria-label="Edit Synthetic city stay"]'));
  document.getElementById('trips-request').value='Different dates and a third bedroom';
  document.getElementById('trips-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  await settle(()=>record.request==='Different dates and a third bedroom');
  assert.equal(record.candidates.length,1);assert.match(document.getElementById('trips-result').textContent,/Previous search — recheck/);
  click(document.querySelector('[aria-label="Edit Synthetic city stay"]'));fail=true;
  document.getElementById('trips-title').value='Keep my unsaved title';
  document.getElementById('trips-form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  await settle(()=>document.getElementById('trips-form-status').textContent.includes('Synthetic save failure'));
  assert.equal(document.getElementById('trips-title').value,'Keep my unsaved title');
  assert.equal(record.title,'Synthetic city stay');
});
