import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountReplacements} from '../src/replacements.js';
import {mountCapture} from '../src/capture.js';
import {normalizeReplacement} from '../src/replacement-data.js';
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
const rowAction=(node,verb)=>[...node.querySelectorAll('button,a')].find(item=>item.getAttribute('aria-label')?.startsWith(`${verb} `));
const rows=document=>[...document.querySelectorAll('#replacements-list .record-row')];

test('each thing reads as what it is, the exact variant, and where it came from',async()=>{
  const {document}=setup();
  const copied=[];
  const store=fakeStore('replacements',[
    normalizeReplacement({item:'Running shoes',variant:'Brooks Ghost 16, 10.5 D, black/white',where:'Fleet Feet',note:'Every 400 miles'}),
    normalizeReplacement({item:'Printer ink',variant:'HP 67XL black',where:'https://www.staples.com/hp-67xl'}),
    normalizeReplacement({item:'Bedroom paint',variant:'Benjamin Moore Hale Navy HC-154, eggshell'})
  ]);
  mountReplacements(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store,
    clipboard:{writeText:async text=>{copied.push(text);}}});
  await settle(()=>rows(document).length===3);
  assert.deepEqual(rows(document).map(row=>row.querySelector('.record-name').textContent),['Bedroom paint','Printer ink','Running shoes']);
  const shoes=rows(document)[2];
  assert.match(shoes.textContent,/Brooks Ghost 16, 10\.5 D, black\/white/);
  assert.match(shoes.textContent,/Fleet Feet · Every 400 miles/);
  // A page is named by its shop and opened from the row's own glyph.
  const ink=rows(document)[1];
  assert.match(ink.textContent,/staples\.com/);
  assert.equal(rowAction(ink,'Open').getAttribute('href'),'https://www.staples.com/hp-67xl');
  assert.equal(rowAction(shoes,'Open'),undefined,'a shop with no page has nothing to open');
  // Copy takes the variant, which is what goes into a shop's search box.
  click(document,rowAction(ink,'Copy'));
  await settle(()=>copied.length===1);
  assert.deepEqual(copied,['HP 67XL black']);
  assert.match(document.getElementById('replacements-status').textContent,/Copied Printer ink/);

  const search=document.getElementById('replacements-search');
  search.value='fleet';search.dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(rows(document).length,1);
  search.value='nothing like it';search.dispatchEvent(new document.defaultView.Event('input'));
  assert.match(document.getElementById('replacements-list').textContent,/Nothing matches that/);
  search.value='';search.dispatchEvent(new document.defaultView.Event('input'));

  // Delete asks first, under the row, and then removes it everywhere.
  click(document,rowAction(rows(document)[0],'Delete'));
  click(document,[...rows(document)[0].querySelectorAll('button')].find(button=>button.textContent==='Delete from all devices'));
  await settle(()=>rows(document).length===2);
  assert.equal(store.writes.at(-1).method,'DELETE');
});

test('an edit replaces the thing it came from, and a bad page is refused in the form',async()=>{
  const {document}=setup();
  const store=fakeStore('replacements',[normalizeReplacement({item:'Pillow',variant:'Coop Original, queen'})]);
  mountReplacements(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:store});
  await settle(()=>rows(document).length===1);
  click(document,rowAction(document.getElementById('replacements-list'),'Edit'));
  assert.equal(document.getElementById('replacements-editor-title').textContent,'Editing Pillow');
  assert.equal(document.getElementById('replacements-variant').value,'Coop Original, queen');
  const submit=()=>document.getElementById('replacements-form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  document.getElementById('replacements-where').value='http://coop.example.com';
  submit();
  assert.match(document.getElementById('replacements-form-status').textContent,/https:\/\//);
  assert.equal(store.writes.length,0);
  document.getElementById('replacements-where').value='Coop Sleep Goods';
  submit();
  await settle(()=>store.writes.length===1);
  assert.equal(store.writes[0].id,'replacements-0','an edit replaces the record it came from');
  assert.equal(store.writes[0].value.where,'Coop Sleep Goods');
  await settle(()=>document.getElementById('replacements-editor-title').textContent==='New thing');

  const {document:blank}=setup();
  mountReplacements(blank.querySelector('main'),{credentials:{get:async()=>'token'},offline:fakeStore('replacements')});
  await settle(()=>/Nothing saved yet/.test(blank.getElementById('replacements-list').textContent));
});

test('a said favourite lands in the drawer rather than in whichever tool was open',async()=>{
  const {document}=setup();
  const replacements=fakeStore('replacements'),sizes=fakeStore('sizes');
  const refreshed=[];
  const record=normalizeReplacement({item:'Bedroom paint',variant:'Hale Navy HC-154, eggshell',where:'Home Depot'});
  const remote=async(token,path)=>path==='/v1/ai-connections'
    ?{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]}
    :{capability:'replacements',path:'/v1/replacements',record,summary:'Bedroom paint · Hale Navy HC-154, eggshell · Home Depot'};
  mountCapture(document.getElementById('capture'),{credentials:{get:async()=>'token'},remote,
    stores:{replacements,sizes},today:()=>'2026-09-22',onSaved:capability=>refreshed.push(capability)});
  const field=document.querySelector('#capture textarea,#capture input');
  field.value='the bedroom is Hale Navy eggshell from Home Depot';
  document.querySelector('#capture form').dispatchEvent(new document.defaultView.Event('submit',{bubbles:true}));
  await settle(()=>replacements.records.length===1);
  assert.equal(sizes.records.length,0);
  assert.deepEqual(refreshed,['replacements']);
});
