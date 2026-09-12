import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountProperties} from '../src/properties.js';
import {normalizeProperty} from '../src/property-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function setup(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
function fakeStore(initial=[]){
  const records=initial.map((record,index)=>({...record,id:record.id||`p-${index}`,revision:`r-${index}`}));
  const writes=[];
  return {records,writes,
    async request(token,url,options={}){
      const id=url.slice('/v1/properties/'.length);
      if(!options.method||options.method==='GET')return {records:[...records],syncMessage:''};
      writes.push({id,method:options.method,value:options.value});
      const index=records.findIndex(record=>record.id===id);
      if(options.method==='DELETE'){if(index>=0)records.splice(index,1);return {records:[...records]};}
      const saved={...normalizeProperty(options.value),id,revision:`r-${writes.length}`};
      if(index<0)records.push(saved);else records[index]=saved;
      return {record:saved,records:[...records]};
    }};
}
const click=(root,label)=>{
  const button=[...root.querySelectorAll('button')].find(node=>node.textContent===label&&!node.closest('[hidden]'));
  assert.ok(button,`no ${label} button`);button.click();
};
const listing='https://www.zillow.com/homedetails/85-Greenway-Ter-Forest-Hills-Gardens-NY-11375/32004593_zpid/';
const credentials={get:async()=>'token'};
const remoteReading=(reading,calls=[])=>async(token,path,options)=>{
  calls.push({path,options});
  if(path==='/v1/ai-connections')return {connections:[{id:'c1',hasApiKey:true}]};
  return {record:normalizeProperty({link:listing,since:options.value.today,status:'Looking',notes:'',...reading})};
};

test('the shortlist reads by where the search stands, and one action moves each along',async()=>{
  const {document,restore}=setup();
  const store=fakeStore([
    normalizeProperty({address:'12 Elm St',price:950000,since:'2026-09-01'}),
    normalizeProperty({address:'85 Greenway Ter',price:1250000,status:'Seen',since:'2026-09-01'}),
    normalizeProperty({address:'3 Oak Ln',price:700000,status:'Passed',since:'2026-08-01'})
  ]);
  mountProperties(document.querySelector('main'),{credentials,offline:store});
  await settle(()=>document.querySelectorAll('#properties-list .record-row').length===2);
  const main=document.querySelector('main');
  assert.deepEqual([...main.querySelectorAll('#properties-list .group-title')].map(node=>node.textContent),['Looking','Seen']);
  assert.equal(main.querySelector('#properties-passed-view').hidden,false,'what was passed on keeps its own view');
  assert.equal(main.querySelector('#properties-passed-view summary').textContent,'Passed · 1');
  // Each row offers the next step and passing on it — never a second row of buttons.
  const elm=[...main.querySelectorAll('#properties-list .record-row')].find(row=>row.querySelector('strong').textContent==='12 Elm St');
  assert.deepEqual([...elm.querySelectorAll('.action-group > *')].map(node=>node.textContent),['Seen','Pass','Edit']);
  click(elm,'Seen');
  await settle(()=>store.writes.length===1);
  assert.equal(store.writes[0].value.status,'Seen');
  assert.equal(main.querySelector('#properties-page').hidden,true,'with no page beside it, the tool offers nothing about one');
  restore();
});

test('beside a listing, one press keeps it — read off the page, never typed',async()=>{
  const {document,restore}=setup();
  const store=fakeStore([]),calls=[];
  const tool=mountProperties(document.querySelector('main'),{credentials,offline:store,today:()=>'2026-09-13',
    remote:remoteReading({address:'85 Greenway Ter, Forest Hills, NY 11375',price:1250000,beds:4,baths:2.5,sqft:2400,taxes:18200},calls),
    readPage:async()=>({text:'listing text',url:listing})});
  await settle(()=>!document.querySelector('#properties-save').disabled);
  tool.page({url:listing,listing:{id:'zillow'}});
  const main=document.querySelector('main');
  assert.equal(main.querySelector('#properties-page').hidden,false);
  click(main.querySelector('#properties-page'),'Save this listing');
  await settle(()=>store.writes.length===1);
  assert.equal(calls.find(call=>call.path.endsWith('/listing')).options.value.url,listing);
  const [write]=store.writes;
  assert.equal(write.value.address,'85 Greenway Ter, Forest Hills, NY 11375');
  assert.equal(write.value.revision,null,'a listing not on the shortlist is a new property');
  await settle(()=>/^Saved/.test(main.querySelector('#properties-status').textContent));
  assert.equal(main.querySelector('#properties-status').textContent,'Saved · 85 Greenway Ter, Forest Hills, NY 11375 · $1,250,000 · 4 bd · 2.5 ba · 2,400 sq ft · $18,200/yr tax');
  // Now that it is saved, the page offers to bring it up to date instead.
  assert.deepEqual([...main.querySelectorAll('#properties-page button')].map(node=>node.textContent),['Update from this page']);
  restore();
});

test('reading a saved listing again records a price cut and keeps what the owner said',async()=>{
  const {document,restore}=setup();
  const store=fakeStore([{...normalizeProperty({address:'85 Greenway Ter, Forest Hills, NY 11375',price:1250000,status:'Seen',notes:'Kitchen needs work.',taxes:18200,link:listing,since:'2026-09-01'}),id:'house'}]);
  const tool=mountProperties(document.querySelector('main'),{credentials,offline:store,today:()=>'2026-09-13',
    remote:remoteReading({address:'85 Greenway Ter, Forest Hills, NY 11375',price:1195000,beds:4,taxes:null}),
    readPage:async()=>({text:'listing text',url:`${listing}?utm_source=alert`})});
  await settle(()=>document.querySelectorAll('#properties-list .record-row').length===1);
  tool.page({url:`${listing}?utm_source=alert`,listing:{id:'zillow'}});
  click(document.querySelector('#properties-page'),'Update from this page');
  await settle(()=>store.writes.length===1);
  const {value}=store.writes[0];
  assert.equal(value.id,'house','the same house is updated, not saved twice');
  assert.equal(value.status,'Seen');
  assert.equal(value.notes,'Kitchen needs work.');
  assert.equal(value.taxes,18200,'a figure the page no longer shows is left as it was');
  assert.equal(value.beds,4,'a figure the page now shows is filled in');
  assert.deepEqual(value.prices,[{price:1250000,on:'2026-09-01'},{price:1195000,on:'2026-09-13'}]);
  await settle(()=>/^Updated/.test(document.querySelector('#properties-status').textContent));
  assert.equal(document.querySelector('#properties-status').textContent,'Updated · price down $55,000');
  restore();
});

test('a host with no page beside it never offers to read one',async()=>{
  const {document,restore}=setup();
  const tool=mountProperties(document.querySelector('main'),{credentials,offline:fakeStore([])});
  await settle(()=>!document.querySelector('#properties-save').disabled);
  tool.page({url:listing,listing:{id:'zillow'}});
  assert.equal(document.querySelector('#properties-page').hidden,true,'the phone and a full tab sit beside no listing');
  restore();
});

test('a typed price change joins the history, and deleting asks first',async()=>{
  const {document,restore}=setup();
  const store=fakeStore([{...normalizeProperty({address:'12 Elm St',price:950000,since:'2026-09-01'}),id:'elm'}]);
  mountProperties(document.querySelector('main'),{credentials,offline:store,today:()=>'2026-09-13'});
  await settle(()=>document.querySelectorAll('#properties-list .record-row').length===1);
  const main=document.querySelector('main');
  click(main.querySelector('#properties-list'),'Edit');
  assert.equal(main.querySelector('#properties-price').value,'950000');
  main.querySelector('#properties-price').value='925000';
  main.querySelector('#properties-form').dispatchEvent(new document.defaultView.Event('submit',{cancelable:true}));
  await settle(()=>store.writes.length===1);
  assert.deepEqual(store.writes[0].value.prices.map(entry=>entry.price),[950000,925000]);
  click(main.querySelector('#properties-list'),'Edit');
  click(main,'Delete');
  assert.equal(main.querySelector('#properties-delete-confirmation').hidden,false);
  assert.equal(store.writes.length,1,'nothing is deleted before it is confirmed');
  click(main,'Delete from all devices');
  await settle(()=>store.writes.length===2);
  assert.equal(store.writes[1].method,'DELETE');
  restore();
});
