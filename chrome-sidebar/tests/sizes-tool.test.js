import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountSizes} from '../src/sizes.js';
import {mountCapture} from '../src/capture.js';
import {normalizeSize} from '../src/size-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function setup(){
  const {document,window}=parseHTML('<html><body><main></main><div id="capture"></div></body></html>');
  globalThis.document=document;globalThis.window=window;
  return {document,window};
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
const click=(document,node)=>node.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));

test('each garment leads with the general size, then what the brands call it',async()=>{
  const {document}=setup();
  const store=fakeStore('sizes',[
    normalizeSize({brand:'Lululemon',item:'ABC joggers',size:'M',fit:'Runs slim'}),
    normalizeSize({brand:'',item:'Waist',size:'33 in'}),
    normalizeSize({brand:'Banana Republic',item:'Shirt',size:'M'})
  ]);
  const tool=mountSizes(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store});
  await settle(()=>document.querySelectorAll('#sizes-list .record-row').length===3);
  assert.deepEqual([...document.querySelectorAll('#sizes-list .record-group-title')].map(node=>node.textContent),['Shirts','Pants']);
  const rows=[...document.querySelectorAll('#sizes-list .record-row')];
  assert.deepEqual(rows.map(node=>node.querySelector('strong').textContent),
    ['Banana Republic · M','Waist · 33 in','Lululemon · ABC joggers · M']);
  // How it runs is the thing that makes a bare size usable months later.
  assert.match(rows[2].textContent,/Runs slim/);

  // Searching narrows to matching sizes and says so when nothing matches.
  const search=document.getElementById('sizes-search');
  search.value='lulu';search.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  assert.equal(document.querySelectorAll('#sizes-list .record-row').length,1);
  // A measurement is found by the garment it describes, which is never typed on it.
  search.value='pants';search.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  assert.equal(document.querySelectorAll('#sizes-list .record-row').length,2);
  search.value='nothing here';search.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));
  assert.match(document.getElementById('sizes-list').textContent,/No size matches that/);
  search.value='';search.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));

  // Deleting asks first, and the question names the record it would remove.
  const row=[...document.querySelectorAll('#sizes-list .record-row')].find(node=>/Waist/.test(node.textContent));
  click(document,[...row.querySelectorAll('button')].find(button=>button.textContent==='Delete'));
  assert.match(row.parentElement.textContent,/Permanently delete “Waist” from all devices\?/);
  click(document,[...row.parentElement.querySelectorAll('button')].find(button=>button.textContent==='Delete from all devices'));
  await settle(()=>store.writes.length>0);
  assert.equal(store.writes[0].method,'DELETE');
  await settle(()=>document.querySelectorAll('#sizes-list .record-row').length===2);
  tool.clear();
});

test('editing loads the record into the form and saves over the same size',async()=>{
  const {document}=setup();
  const store=fakeStore('sizes',[normalizeSize({brand:'Allbirds',item:'Runners',size:'10'})]);
  mountSizes(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store});
  await settle(()=>document.querySelectorAll('#sizes-list .record-row').length===1);
  click(document,[...document.querySelectorAll('#sizes-list button')].find(button=>button.textContent==='Edit'));
  assert.equal(document.getElementById('sizes-brand').value,'Allbirds');
  assert.equal(document.getElementById('sizes-editor-title').textContent,'Editing Runners');
  document.getElementById('sizes-size').value='10.5';
  document.getElementById('sizes-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>store.writes.length>0);
  assert.equal(store.writes[0].id,'sizes-0','an edit replaces the record it came from');
  assert.equal(store.writes[0].value.size,'10.5');
  await settle(()=>document.getElementById('sizes-editor-title').textContent==='New size');
  // The empty state points at the two ways in, not at one of them.
  const {document:blank}=setup();
  mountSizes(blank.querySelector('main'),{credentials:{get:async()=>'token'},offline:fakeStore('sizes')});
  await settle(()=>/No sizes yet/.test(blank.getElementById('sizes-list').textContent));
  assert.match(blank.getElementById('sizes-list').textContent,/Say one above, or add it below/);
});

test('a said size lands in sizes rather than in whichever tool was open',async()=>{
  const {document}=setup();
  const sizes=fakeStore('sizes'),gifts=fakeStore('gifts');
  const record=normalizeSize({brand:'Lululemon',item:'ABC joggers',size:'M',fit:'Runs slim'});
  const refreshed=[];
  const remote=async(token,path)=>path==='/v1/ai-connections'
    ?{connections:[{id:'c-1',hasApiKey:true}]}
    :{capability:'sizes',path:'/v1/sizes',record,summary:'ABC joggers · M · Lululemon'};
  mountCapture(document.getElementById('capture'),{credentials:{get:async()=>'token'},remote,
    stores:{sizes,gifts},today:()=>'2026-09-19',onSaved:capability=>refreshed.push(capability)});
  document.getElementById('capture-note').value='Lululemon ABC joggers are a medium, they run slim';
  document.getElementById('capture-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>sizes.records.length===1);
  assert.equal(gifts.records.length,0,'a size is not a gift idea');
  assert.deepEqual(refreshed,['sizes']);
  assert.match(document.getElementById('capture-status').textContent,/^Saved · ABC joggers · M · Lululemon/);
});
