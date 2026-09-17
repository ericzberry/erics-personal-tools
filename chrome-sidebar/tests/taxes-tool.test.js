import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTaxes} from '../src/taxes.js';

const settle=async(check,attempts=600)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the taxes tool to settle.');
};
// linkedom's select has no value setter, so assignments made by the tool have to
// land the way they do in a browser. The selection is written as attributes
// rather than through `option.selected`, whose setter clears whichever option is
// selected whenever another is set to false.
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,
    set(value){for(const option of this.options){if(option.value===value)option.setAttribute('selected','');else option.removeAttribute('selected');}}});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
// What a reader actually meets: the host hides `[hidden]` with CSS, which a
// DOM-only test has to do for itself.
const visibleText=node=>[...node.childNodes].map(child=>
  child.nodeType===3?child.textContent:child.hidden?'':visibleText(child)).join(' ');
function setup(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  return {document,window,restore:selectValues(window)};
}
const FILED=[{name:'K-1 - Averin Capital LLC.pdf',modifiedTime:'2026-03-02T00:00:00.000Z',size:2240000,webViewLink:'https://drive.example/k1'}];
// One synthetic Worker, recording what the tool asked it for.
function worker({connected=true,connections=[{id:'newest',name:'Newest',hasApiKey:true},{id:'older',name:'Older',hasApiKey:true}]}={}){
  const asked=[];
  return {asked,
    async remote(_token,path,options={}){
      asked.push({path,value:options.value});
      if(path==='/v1/drive/status')return {connected,account:connected?'owner@example.com':'',configured:true};
      if(path.startsWith('/v1/drive/filed'))return {year:'2025',files:connected?FILED:[]};
      if(path==='/v1/ai-connections')return {connections};
      if(path.endsWith('/tax-intake'))return {type:'1099',issuer:'Schwab',year:'2025',confidence:'high',reason:'Read off the form header.'};
      return {};
    }};
}
const document1099=()=>new File(['2025 Form 1099-DIV\nPayer: Schwab\nTotal ordinary dividends 1,284.00\n'],'download.txt',{type:'text/plain'});

test('a connected Drive says nothing about itself, and the reading picks its own connection',async()=>{
  const {document,window,restore}=setup();
  const api=worker();
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,upload:async()=>({filed:{name:'x',year:'2025'}})});
  await settle(()=>root.querySelectorAll('.tax-filed-row').length===1);

  // Nothing names the account or the service it files into while it is working.
  assert.equal(/Google Drive|owner@example\.com|Disconnect/.test(visibleText(root)),false,visibleText(root));
  assert.equal(document.getElementById('taxes-connection-section').hidden,true);
  // Nor is a connection asked for: there is no picker to answer.
  assert.equal(document.getElementById('taxes-connection-picker'),null);
  assert.equal(document.getElementById('taxes-ai-status').textContent,'');
  // The filed list is still there, under its own heading.
  assert.match(visibleText(root),/Already filed/);
  assert.match(document.getElementById('taxes-filed').textContent,/2025 · 1 document/);

  // A dropped document is read through the connection changed most recently,
  // which is the first the Worker lists.
  document.getElementById('taxes-drop').dispatchEvent(Object.assign(new window.Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[document1099()]}}));
  await settle(()=>document.getElementById('taxes-destination').hidden===false);
  assert.equal(api.asked.some(request=>request.path==='/v1/ai-connections/newest/tax-intake'),true);
  const typeField=document.getElementById('taxes-type');
  assert.equal(typeField.value,'1099');
  assert.equal(document.getElementById('taxes-issuer').value,'Schwab');
  assert.match(document.getElementById('taxes-destination').textContent,/2025 \/ Form 1099 - Schwab\.txt/);
  // A reading it is sure of leaves the status line empty, so nothing renders
  // between the destination and the actions.
  assert.equal(document.getElementById('taxes-file-form-status').textContent,'');
  assert.deepEqual([...document.getElementById('taxes-file-actions').children].map(node=>node.textContent),['File it','Clear']);
  restore();
});

test('an unconnected Drive is named, and a device with no AI connection is told where to save one',async()=>{
  const {document,restore}=setup();
  const api=worker({connected:false,connections:[{id:'keyless',name:'No key yet',hasApiKey:false}]});
  const root=document.querySelector('main');
  mountTaxes(root,{credentials:{get:async()=>'token'},remote:api.remote,upload:async()=>({})});
  await settle(()=>document.getElementById('taxes-ai-status').textContent!=='');

  assert.equal(document.getElementById('taxes-connection-section').hidden,false);
  assert.match(visibleText(root),/Google Drive/);
  assert.equal([...root.querySelectorAll('#taxes-connection button')].map(node=>node.textContent).join(),'Connect Google Drive');
  assert.match(document.getElementById('taxes-ai-status').textContent,/Save an AI connection in Settings/);
  // Nothing is filed yet, so the list stays out of the way entirely.
  assert.equal(document.getElementById('taxes-drive-contents').hidden,true);
  restore();
});
