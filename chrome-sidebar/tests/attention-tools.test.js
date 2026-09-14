import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountSubscriptions} from '../src/subscriptions.js';
import {mountAttention} from '../src/attention.js';
import {normalizeSubscription} from '../src/subscription-data.js';
const settle=async fn=>{for(let i=0;i<500;i++){await new Promise(r=>setTimeout(r,1));if(fn())return;}throw Error('Did not settle');};
const vault={unlocked:()=>true,available:()=>true,borrowed:()=>true,touch(){}};
const credentials={get:async()=>'synthetic-token'};
function setup(){const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||'';},set(value){for(const option of this.options)option.removeAttribute('selected');[...this.options].find(o=>o.value===value)?.setAttribute('selected','');}});return {document,window,root:document.querySelector('main')};}
test('attention shows partial source failure without claiming everything is clear',async()=>{
  const {root}=setup();mountAttention(root,{vault,credentials,stores:{reminders:{request:async()=>({records:[]})},subscriptions:{request:async()=>{throw Error('Unavailable');}}}});
  await settle(()=>root.textContent.includes('1 of 2 sources checked'));
  assert.match(root.textContent,/Subscriptions & renewals unavailable/);assert.match(root.textContent,/Other sources are unavailable/);
});
test('subscriptions preserve rejected edits, accept decimal prices, and exclude review candidates from totals',async()=>{
  const {root,window}=setup();let fail=false,writes=0;
  let records=[{...normalizeSubscription({name:'Synthetic Stream',currency:'USD',amount:12.99,cycle:'monthly',state:'Review'}),id:'one',revision:'r'}];
  const offline={request:async(t,p,o={})=>{if(o.method){writes++;if(fail)throw Error('Could not save');records=[{...normalizeSubscription(o.value),id:'one',revision:'next'}];}return {records};}};
  mountSubscriptions(root,{vault,credentials,offline,remote:async()=>({connections:[]})});
  await settle(()=>root.textContent.includes('Add an OpenAI connection')&&!root.querySelector('#subscriptions-save').disabled);
  assert.equal(root.querySelector('#subscriptions-total').textContent,'');assert.equal(root.querySelector('#subscriptions-amount').getAttribute('step'),'0.01');
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Edit').click();
  assert.equal(root.querySelector('#subscriptions-cycle').value,'monthly');root.querySelector('#subscriptions-name').value='Edited name';root.querySelector('#subscriptions-state').value='Active';fail=true;
  root.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>root.textContent.includes('Could not save'));
  assert.equal(root.querySelector('#subscriptions-name').value,'Edited name');
  fail=false;root.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>writes===2&&!root.querySelector('#subscriptions-save').disabled);
  assert.equal(records[0].name,'Edited name');assert.equal(records[0].cycle,'monthly');assert.equal(records[0].state,'Active');assert.match(root.querySelector('#subscriptions-total').textContent,/155.88/);
});
test('locking during an in-flight read prevents late private data from repopulating',async()=>{
  const {root}=setup();let finish;const wait=new Promise(r=>{finish=r;});let open=true;
  const tool=mountSubscriptions(root,{vault:{...vault,unlocked:()=>open},credentials,offline:{request:async()=>wait}});
  await settle(()=>root.querySelector('#subscriptions-save').disabled);open=false;tool.clear();finish({records:[{...normalizeSubscription({name:'Private old data',currency:'USD'}),id:'one'}]});await new Promise(r=>setTimeout(r,10));
  assert.ok(!root.textContent.includes('Private old data'));
});
