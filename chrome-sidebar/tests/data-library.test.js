import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountLibrary,referenceRows} from '../src/data-library.js';
test('reference search clears empty feedback after results return and preserves load errors',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;
 let fail=false;const root=document.querySelector('main');const library=mountLibrary(root,{kind:'ai',load:async()=>{if(fail)throw Error('Reconnect to download');return {value:[{name:'Example',provider:'openai',hasApiKey:true}]};}});await library.refresh();
 const search=root.querySelector('input'),status=root.querySelector('[role=status]');search.value='missing';search.dispatchEvent(new window.Event('input'));assert.match(status.textContent,/No matching/);
 search.value='';search.dispatchEvent(new window.Event('input'));assert.equal(status.textContent,'');fail=true;await library.refresh();search.dispatchEvent(new window.Event('input'));assert.equal(status.textContent,'Reconnect to download');
 assert.doesNotMatch(referenceRows('ai',[{name:'Example',provider:'openai',model:'legacy'}])[0].lines.join(' '),/Default model|legacy/);
});
test('a late reference load cannot restore private data after clearing the view',async()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;let finish;
 const root=document.querySelector('main'),library=mountLibrary(root,{kind:'ai',load:()=>new Promise(resolve=>finish=resolve)});const pending=library.refresh();library.clear();finish({value:[{name:'Private old account'}]});await pending;assert.doesNotMatch(root.textContent,/Private old account/);
});
