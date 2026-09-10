import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountRewards} from '../src/rewards-tool.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('reward editor preserves failed input and uses inline deletion confirmation',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
 const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
 let fail=true,deleted=0;const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first'};
 const tool=mountRewards(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:{request:async(t,p,o)=>{if(o?.method){if(fail)throw Error('Storage unavailable');if(o.method==='DELETE')deleted++;return {records:o.method==='DELETE'?[]:[{...o.value,revision:'next'}]};}return {records:[entry]};}}});await tool.refresh();
 const $=id=>document.getElementById(id);for(const id of ['reward-kind','reward-state']){const node=$(id);let value=id==='reward-kind'?'balance':'available';Object.defineProperty(node,'value',{configurable:true,get:()=>value,set:next=>{value=next;}});}document.querySelector('#rewards-list button').click();$('reward-name').value='Edited name';$('reward-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();assert.equal($('reward-name').value,'Edited name');assert.match($('reward-form-status').textContent,/Storage unavailable/);
 $('reward-cancel').click();const remove=[...document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Delete');remove.click();assert.equal(deleted,0);const confirmation=[...document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Delete reward');assert.equal(confirmation.closest('[hidden]'),null);fail=false;confirmation.click();await settle();assert.equal(deleted,1);
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
});
