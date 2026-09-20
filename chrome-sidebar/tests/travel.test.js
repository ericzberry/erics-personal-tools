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
  // A record's verbs are glyphs named for the record, on the number's own line.
  const verbs=$('list').querySelector('.record-number-line .action-group');
  assert.deepEqual([...verbs.querySelectorAll('button')].map(button=>button.getAttribute('aria-label')),
    ['Edit Synthetic airline','Copy number for Synthetic airline','Copy notes for Synthetic airline','Delete Synthetic airline']);
  assert.deepEqual([...verbs.querySelectorAll('button')].map(button=>button.textContent),['','','','']);
  $('list').querySelector('[aria-label="Edit Synthetic airline"]').click();
  assert.equal($('editor').open,true);
  assert.equal($('number').value,'');
  $('name').value='Updated program';$('name').dispatchEvent(new window.Event('input',{bubbles:true}));
  fail=true;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'Updated program');assert.match($('form-status').textContent,/Offline/);
  assert.equal(writes[0].number,undefined);assert.equal(writes[0].revision,'one');
  fail=false;$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));await tick();
  assert.equal($('name').value,'');assert.match($('list').textContent,/Updated program/);
  $('list').querySelector('[aria-label="Delete Updated program"]').click();assert.equal(deleted,false);
  [...$('list').querySelectorAll('button')].find(b=>b.textContent==='Delete from all devices').click();await tick();assert.equal(deleted,true);
  assert.match($('list').textContent,/No travel records yet/);
  const unsafe=TravelRecord({...record,name:'<img src=x onerror=alert(1)>'},{onEdit(){},onCopy(){},onCopyNotes(){},onDelete(){}});
  assert.equal(unsafe.querySelector('img'),null);
});

test('long travel lists read nothing until one row is opened',async()=>{
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  let reads=0,copies=0;
  const list=document.querySelector('main');
  for(let i=0;i<100;i++)list.append(TravelRecord({name:`Program ${i}`,category:'Airline',traveler:'Synthetic traveler'}, {
    onShow:async()=>{reads++;return '00123456';},onCopy:()=>copies++,onEdit(){},onCopyNotes(){},onDelete(){}
  }));
  // A hundred rows are a hundred names: nothing is fetched, and nothing is on
  // screen to copy, until one of them is opened.
  assert.equal(reads,0);
  assert.equal(list.querySelectorAll('.record-row-content:not([hidden])').length,0);
  const toggle=list.querySelector('.record-row-toggle');
  toggle.click();await tick();
  assert.equal(reads,1);assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal([...list.querySelectorAll('.record-row-content')].filter(n=>!n.hidden).length,1);
  list.querySelector('[aria-label="Copy number for Program 0"]').click();
  assert.equal(copies,1);assert.equal(reads,1);
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.doesNotMatch(list.textContent,/00123456/);
});

test('mobile record shows the cached number and its verbs without expanding or fetching',()=>{
  const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;
  let reads=0,copies=0;
  const row=TravelRecord({name:'Synthetic program',category:'Airline',number:'00123456'}, {
    showNumber:true,onShow:()=>reads++,onCopy:()=>copies++,onEdit(){},onDelete(){},onCopyNotes(){}
  });
  const preview=row.querySelector('.record-number-line');
  assert.match(preview.textContent,/00123456/);
  // A record with nothing written down does not carry the verb for it.
  assert.deepEqual([...preview.querySelectorAll('button')].map(button=>button.getAttribute('aria-label')),
    ['Edit Synthetic program','Copy number for Synthetic program','Delete Synthetic program']);
  preview.querySelector('[aria-label="Copy number for Synthetic program"]').click();
  assert.equal(copies,1);assert.equal(reads,0);
  assert.equal(row.querySelector('.record-row-content').hidden,true);
  // The deletion it raises is a sentence, and waits beside the number rather
  // than behind the disclosure the number no longer sits under.
  preview.querySelector('[aria-label="Delete Synthetic program"]').click();
  const confirmation=[...row.querySelector('.record-value').children].find(node=>node.textContent.startsWith('Delete this record'));
  assert.equal(confirmation.hidden,false);
});

test('travel records stay alphabetical when loaded, searched, and refreshed',async()=>{
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  const records=['Delta','Alamo','alaska','AAA'].map((name,id)=>({id:String(id),name,category:'Airline'}));
  const originalOrder=records.map(record=>record.name);
  const wallet=mountTravel(document.querySelector('main'),{
    credentials:{get:async()=> 'synthetic'},request:async()=>({records})
  });
  await wallet.ready;
  const names=()=>[...document.querySelectorAll('#travel-list .record-row-toggle')].map(node=>node.textContent.trim());
  assert.deepEqual(names(),['AAA','Alamo','alaska','Delta']);
  assert.deepEqual(records.map(record=>record.name),originalOrder);
  const search=document.getElementById('travel-search');
  search.value='ala';search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(names(),['Alamo','alaska']);
  search.value='';search.dispatchEvent(new window.Event('input'));
  records.unshift({id:'new',name:'Bravo',category:'Airline'});
  await wallet.refresh();
  assert.deepEqual(names(),['AAA','Alamo','alaska','Bravo','Delta']);
});

test('records group by category in registry order, keeping retired categories and filtered groups',async()=>{
  const {window,document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.window=window;globalThis.document=document;
  const records=[
    {id:'1',name:'Hertz',category:'Rental car'},
    {id:'2',name:'Delta',category:'Airline'},
    {id:'3',name:'AAA',category:'Other'},
    {id:'4',name:'Alaska',category:'Airline'},
    {id:'5',name:'Airport lounge',category:'Lounge'},
    {id:'6',name:'Unfiled membership'}
  ];
  const wallet=mountTravel(document.querySelector('main'),{
    credentials:{get:async()=>'synthetic'},request:async()=>({records})
  });
  await wallet.ready;
  const layout=()=>[...document.querySelectorAll('#travel-list .record-group')].map(group=>[
    group.querySelector('.record-group-title').textContent,
    [...group.querySelectorAll('.record-row-toggle')].map(node=>node.textContent.trim())
  ]);
  // Registry order first, a retired category before Other, and no record dropped.
  assert.deepEqual(layout(),[
    ['Airline',['Alaska','Delta']],
    ['Rental car',['Hertz']],
    ['Lounge',['Airport lounge']],
    ['Other',['AAA','Unfiled membership']]
  ]);
  const search=document.getElementById('travel-search');
  search.value='rental';search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(layout(),[['Rental car',['Hertz']]]);
  search.value='zzz';search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(layout(),[]);
  assert.equal(document.querySelector('#travel-list').textContent,'No matching records.');
});

test('a connection hosted on another screen reports its own work there',async()=>{
  const {window,document}=parseHTML('<html><body><main></main><aside id="panel"></aside></body></html>');
  globalThis.window=window;globalThis.document=document;
  let token='synthetic-access-token-0123456789';
  const credentials={get:async()=>token,set:async value=>{token=value;},remove:async()=>{token='';}};
  const wallet=mountTravel(document.querySelector('main'),{
    credentials,request:async()=>({records:[]}),connectionRoot:document.getElementById('panel')
  });
  await wallet.ready;
  const $=id=>document.getElementById(`travel-${id}`);
  // The wallet itself can be a hidden screen, so connection feedback belongs
  // beside the connection rather than in the wallet's own status line.
  assert.ok(document.getElementById('panel').contains($('connection-status')));
  $('refresh').click();await tick();
  assert.equal($('connection-status').textContent,'Records are up to date.');
  assert.equal($('status').textContent,'');
  $('disconnect').click();await tick();
  assert.equal($('connection-status').textContent,'Disconnected from this device. Cloud records remain saved.');
  assert.equal($('setup').hidden,false);assert.equal($('status').textContent,'');
});
