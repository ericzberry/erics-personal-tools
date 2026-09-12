import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountGifts} from '../src/gifts.js';
import {mountCapture} from '../src/capture.js';
import {normalizeGift} from '../src/gift-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
function setup(){
  const {document,window}=parseHTML('<html><body><main></main><div id="capture"></div></body></html>');
  globalThis.document=document;globalThis.window=window;
  return {document,window,restore:selectValues(window)};
}
function fakeStore(resource,initial=[]){
  const records=initial.map((record,index)=>({...record,id:record.id||`${resource}-${index}`,revision:`r-${index}`}));
  const writes=[];
  return {records,writes,
    async request(token,url,options={}){
      const id=url.slice(`/v1/${resource}/`.length);
      if(!options.method||options.method==='GET')return {records:[...records],syncMessage:''};
      writes.push({id,method:options.method,value:options.value});
      const index=records.findIndex(record=>record.id===id);
      if(options.method==='DELETE'){if(index>=0)records.splice(index,1);return {records:[...records]};}
      const saved={...options.value,revision:`r-${writes.length}`};
      if(index<0)records.push(saved);else records[index]=saved;
      return {record:saved,records:[...records]};
    }};
}

test('ideas sit under the person they are for, and one action moves each along',async()=>{
  const {document,restore}=setup();
  const store=fakeStore('gifts',[
    normalizeGift({person:'Ariana',idea:'Cast iron pan',occasion:'Birthday',price:89,link:'https://example.com/pan'}),
    normalizeGift({person:'Celeste',idea:'Telescope',status:'Given'})
  ]);
  const tool=mountGifts(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store});
  await settle(()=>document.querySelectorAll('#gifts-list .record-row').length===2);
  const groups=[...document.querySelectorAll('#gifts-list .record-group-title')].map(node=>node.textContent);
  assert.deepEqual(groups,['Ariana','Celeste']);
  assert.match(document.querySelector('#gifts-list').textContent,/Idea · Birthday · \$89/);
  assert.ok(document.querySelector('.record-row--given'),'a given idea is dimmed rather than hidden');
  assert.equal([...document.querySelectorAll('#gifts-list a')].some(link=>link.href==='https://example.com/pan'),true);
  const buttons=[...document.querySelectorAll('#gifts-list button')].map(button=>button.textContent);
  assert.ok(buttons.includes('Mark bought'),'an idea offers the one step that applies');
  assert.ok(buttons.includes('Back to ideas'),'a given idea comes back round for next year');
  assert.equal(buttons.filter(text=>text.startsWith('Mark ')).length,1,'only the step that applies is offered');
  [...document.querySelectorAll('#gifts-list button')].find(button=>button.textContent==='Mark bought')
    .dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));
  await settle(()=>store.writes.length>0);
  assert.equal(store.writes[0].value.status,'Bought');
  // Searching narrows to matching ideas and says so when nothing matches.
  document.getElementById('gifts-search').value='telescope';
  document.getElementById('gifts-search').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  assert.deepEqual([...document.querySelectorAll('#gifts-list .record-group-title')].map(node=>node.textContent),['Celeste']);
  document.getElementById('gifts-search').value='nothing here';
  document.getElementById('gifts-search').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  assert.match(document.getElementById('gifts-list').textContent,/No matching ideas/);
  tool.clear();restore();
});

test('a note goes to the tool it belongs to, not the one that happened to be open',async()=>{
  const {document,restore}=setup();
  const gifts=fakeStore('gifts'),reminders=fakeStore('reminders');
  const record=normalizeGift({person:'Maisie',idea:'Telescope',occasion:'Birthday'});
  const refreshed=[];
  const remote=async(token,path)=>path==='/v1/ai-connections'
    ?{connections:[{id:'c-1',hasApiKey:true}]}
    :{capability:'gifts',path:'/v1/gifts',record,summary:'Telescope · for Maisie · Idea · Birthday'};
  mountCapture(document.getElementById('capture'),{credentials:{get:async()=>'token'},remote,
    stores:{gifts,reminders},today:()=>'2026-09-11',onSaved:capability=>refreshed.push(capability)});
  document.getElementById('capture-note').value='Maisie would like a telescope for her birthday';
  document.getElementById('capture-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>gifts.records.length===1);
  assert.equal(reminders.records.length,0,'the note must not land in both');
  assert.deepEqual(refreshed,['gifts']);
  assert.match(document.getElementById('capture-status').textContent,/^Saved · Telescope · for Maisie/);
  restore();
});
