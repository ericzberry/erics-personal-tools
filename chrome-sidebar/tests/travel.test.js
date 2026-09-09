import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountTravel} from '../src/travel.js';
import {TravelRecord} from '../src/components/travel.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('travel wallet preserves failed edits, masks records, and confirms deletion',async()=>{
  const {window,document}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const o of this.querySelectorAll('option'))o.selected=o.value===value;}});
  const record={id:'abc',revision:'one',name:'Synthetic airline',category:'Airline',traveler:'Test traveler',expires:'',hasNotes:true};
  let fail=false, writes=[], deleted=false, copied='';
  globalThis.ClipboardItem=class {constructor(data){this.data=data;}};
  const clipboard={async write(items){copied=await (await items[0].data['text/plain']).text();}};
  const request=async(token,path,options={})=>{
    assert.equal(token,'synthetic');
    if(options.method==='PUT'){writes.push(options.value);if(fail)throw Error('Offline: try again.');return {record:{...record,...options.value}};}
    if(options.method==='DELETE'){deleted=true;return {ok:true};}
    if(path!=='/v1/travel')return {record:{...record,number:'00123456'}};
    return {records:[record]};
  };
  await mountTravel(document.getElementById('app'),{credentials:{get:async()=> 'synthetic'},request,clipboard}).ready;
  const $=id=>document.getElementById(`travel-${id}`);
  assert.equal($('status').textContent,'');
  assert.match($('list').textContent,/••••••••/);
  $('list').querySelector('[aria-label="Copy number for Synthetic airline"]').click();await tick();assert.equal(copied,'00123456');
  const show=$('list').querySelector('.record-row-toggle');
  show.click();await tick();assert.match($('list').textContent,/00123456/);
  show.click();assert.doesNotMatch($('list').textContent,/00123456/);
  assert.equal($('cloud').open,false);assert.equal($('setup').hidden,true);
  [...$('list').querySelectorAll('button')].find(b=>b.textContent==='Edit').click();
  assert.equal($('editor').open,true);
  assert.equal($('number').value,'');
  $('name').value='Updated program';$('name').dispatchEvent(new window.Event('input',{bubbles:true}));
  fail=true;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'Updated program');assert.match($('form-status').textContent,/Offline/);
  assert.equal(writes[0].number,undefined);assert.equal(writes[0].revision,'one');
  fail=false;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'');assert.match($('list').textContent,/Updated program/);
  const buttons=[...$('list').querySelectorAll('button')];buttons.find(b=>b.textContent==='Delete').click();assert.equal(deleted,false);
  buttons.find(b=>b.textContent==='Delete from all devices').click();await tick();assert.equal(deleted,true);
  assert.match($('list').textContent,/No travel records yet/);
  const unsafe=TravelRecord({...record,name:'<img src=x onerror=alert(1)>'},{onEdit(){},onCopy(){},onCopyNotes(){},onDelete(){}});
  assert.equal(unsafe.querySelector('img'),null);
});

test('long travel lists reveal only the selected row and copy without expanding',async()=>{
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  let reads=0,copies=0;
  const list=document.querySelector('main');
  for(let i=0;i<100;i++)list.append(TravelRecord({name:`Program ${i}`,category:'Airline',traveler:'Synthetic traveler'}, {
    onShow:async()=>{reads++;return '00123456';},onCopy:()=>copies++,onEdit(){},onCopyNotes(){},onDelete(){}
  }));
  assert.equal(reads,0);
  list.querySelector('[aria-label="Copy number for Program 0"]').click();
  assert.equal(copies,1);assert.equal(reads,0);
  const toggle=list.querySelector('.record-row-toggle');
  toggle.click();await tick();
  assert.equal(reads,1);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal([...list.querySelectorAll('.record-row-content')].filter(n=>!n.hidden).length,1);
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.doesNotMatch(list.textContent,/00123456/);
});
