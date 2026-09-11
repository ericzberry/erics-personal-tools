import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountReminders} from '../src/reminders.js';
import {mountCapture} from '../src/capture.js';
import {normalizeReminder} from '../src/reminder-data.js';
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
// linkedom's <select> value is read-only; the app sets it like a browser does.
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
function fakeStore(initial=[]){
  const records=initial.map((record,index)=>({...record,id:record.id||`id-${index}`,revision:`r-${index}`}));
  const writes=[];
  return {records,writes,
    async request(token,url,options={}){
      const id=url.slice('/v1/reminders/'.length);
      if(!options.method||options.method==='GET')return {records:[...records],syncMessage:''};
      writes.push({id,method:options.method,value:options.value});
      const index=records.findIndex(record=>record.id===id);
      if(options.method==='DELETE'){if(index>=0)records.splice(index,1);return {records:[...records]};}
      const saved={...options.value,revision:`r-${writes.length}`};
      if(index<0)records.push(saved);else records[index]=saved;
      return {record:saved,records:[...records]};
    }};
}

test('the list separates what needs attention, and marking a service done re-anchors its interval',async()=>{
  const {document,restore}=setup();
  const store=fakeStore([
    normalizeReminder({kind:'Service',title:'Oil change',subject:'Outback',date:'2026-02-28',every:6}),
    normalizeReminder({kind:'Birthday',title:'Celeste',date:'2016-11-02',every:12,since:'2016'})
  ]);
  const tool=mountReminders(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store,today:()=>'2026-09-11'});
  await settle(()=>document.querySelectorAll('#reminders-now .record-row').length>0);
  const attention=document.querySelector('#reminders-now');
  assert.match(attention.textContent,/Oil change/);
  assert.match(attention.textContent,/14 days overdue/);
  assert.ok(attention.querySelector('.record-row--overdue'),'an overdue row is marked as well as worded');
  // The birthday is 52 days out with a fortnight of notice, so it waits below.
  assert.match(document.querySelector('#reminders-later').textContent,/Celeste/);
  assert.match(document.querySelector('#reminders-later').textContent,/turns 10/);
  const birthdayRow=document.querySelector('#reminders-later .record-row');
  assert.equal([...birthdayRow.querySelectorAll('button')].some(button=>button.textContent.startsWith('Mark done')),false,
    'a birthday is never marked done, which would move the date it falls on');
  assert.equal(document.querySelector('#reminders-done').closest('section').hidden,true);
  const done=[...attention.querySelectorAll('button')].find(button=>button.textContent==='Mark done today');
  done.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));
  await settle(()=>store.writes.length>0);
  assert.equal(store.writes[0].value.date,'2026-09-11','the interval restarts from the day the work happened');
  await settle(()=>document.querySelector('#reminders-later').textContent.includes('Oil change'));
  tool.clear();restore();
});

test('quick add saves what it read through the same store, and Undo takes it back',async()=>{
  const {document,restore}=setup();
  const store=fakeStore();
  const record=normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:'2026-09-11',every:12});
  const asked=[];
  const remote=async(token,path,options)=>{
    asked.push(path);
    if(path==='/v1/ai-connections')return {connections:[{id:'c-1',name:'Synthetic',hasApiKey:true},{id:'c-2',hasApiKey:false}]};
    assert.equal(path,'/v1/ai-connections/c-1/capture');
    assert.equal(options.value.note,'today is Derek’s birthday');
    assert.equal(options.value.today,'2026-09-11');
    return {capability:'reminders',path:'/v1/reminders',record,summary:'Derek’s birthday · Every year · Today'};
  };
  const capture=mountCapture(document.getElementById('capture'),{credentials:{get:async()=>'token'},remote,stores:{reminders:store},today:()=>'2026-09-11'});
  document.getElementById('capture-note').value='today is Derek’s birthday';
  document.getElementById('capture-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>store.records.length===1);
  assert.equal(store.records[0].title,'Derek’s birthday');
  assert.match(document.getElementById('capture-status').textContent,/^Saved · Derek’s birthday/);
  assert.equal(document.getElementById('capture-note').value,'','the note is cleared once it is stored');
  const undo=[...document.querySelectorAll('#capture-actions button')].find(button=>button.textContent==='Undo');
  assert.equal(undo.hidden,false);
  undo.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));
  await settle(()=>store.records.length===0);
  assert.equal(store.writes.at(-1).method,'DELETE');
  assert.equal(undo.hidden,true,'there is nothing left to undo');
  capture.clear();restore();
});

test('quick add says what is missing instead of failing quietly',async()=>{
  const {document,restore}=setup();
  const store=fakeStore();
  const remote=async(token,path)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'c-1',hasApiKey:false}]};
    throw Error('must not read a note without a connection');
  };
  mountCapture(document.getElementById('capture'),{credentials:{get:async()=>'token'},remote,stores:{reminders:store},today:()=>'2026-09-11'});
  document.getElementById('capture-note').value='today is Derek’s birthday';
  document.getElementById('capture-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>document.getElementById('capture-status').textContent.includes('Settings'));
  assert.equal(store.records.length,0);
  restore();
});
