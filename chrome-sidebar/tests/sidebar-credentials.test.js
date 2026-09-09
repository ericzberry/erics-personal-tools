import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountApp} from '../src/components/views.js';
test('sidebar saves keys through the Worker, reports failures, and deletes using cloud revisions',async()=>{
 const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');globalThis.document=document;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(value){for(const option of this.querySelectorAll('option')){if(option.value===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'selectedOptions',{configurable:true,get(){return [...this.querySelectorAll('option[selected]')];}});
 mountApp(document.getElementById('app'));let records=[],fail=false,missing=false;const calls=[];
 globalThis.chrome={runtime:{sendMessage:async message=>{
  calls.push(message);
  if(message.action==='status')return {ok:true,connected:true};
  if(message.action==='list')return {ok:true,connections:missing?[]:records};
  if(message.action==='migrate')return {ok:true,moved:0,remaining:0};
  if(message.action==='save'){
   if(fail)return {ok:false,error:'Worker unavailable'};
   records=[{id:message.id,name:'OpenAI',provider:'openai',hasApiKey:true,revision:'revision-1'}];return {ok:true,connection:records[0]};
  }
  if(message.action==='remove'){records=[];return {ok:true};}
 }}};
 await import('../src/settings.js');
 const $=id=>document.getElementById(id),settle=()=>new Promise(resolve=>setTimeout(resolve,10));
 $('open-settings').click();await settle();assert.equal($('save-credential').disabled,false);
 $('credential-name').value='openai';$('credential-secret').value='synthetic-key';$('save-credential').click();await settle();
 assert.equal(calls.find(m=>m.action==='save').connection.apiKey,'synthetic-key');assert.equal($('credential-secret').value,'');assert.equal($('credential-status').textContent,'OpenAI API key verified in D1.');
 missing=true;$('credential-name').value='openai';$('credential-secret').value='unconfirmed';$('save-credential').click();await settle();
 assert.match($('credential-status').textContent,/did not return/);assert.equal($('credential-secret').value,'unconfirmed');
 missing=false;$('credential-refresh').click();await settle();
 fail=true;$('credential-name').value='openai';$('credential-secret').value='replacement';$('save-credential').click();await settle();
 assert.equal($('credential-status').textContent,'Worker unavailable');assert.equal($('credential-secret').value,'replacement');
 document.querySelector('[aria-label="Delete OpenAI"]').click();await settle();assert.equal(calls.find(m=>m.action==='remove').revision,'revision-1');
 delete globalThis.chrome;
});
