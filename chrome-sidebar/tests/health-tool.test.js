import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountHealth} from '../src/health.js';
import {sealSecret,openSecret} from '../src/secret-vault.js';
import {validateHealthRecord,validateRelative} from '../src/health-data.js';
const settle=async(check=()=>true,attempts=800)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,2));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function harness(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  // linkedom's option `selected` setter clears the chosen option whenever
  // another option is set false, so values are set through the attribute.
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
    get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.getAttribute('value')??'';},
    set(value){for(const option of this.options)option.removeAttribute('selected');[...this.options].find(option=>option.getAttribute('value')===String(value))?.setAttribute('selected','');}});
  return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
function fakeVault(){
  let key=null,opened=false;
  return {idleMs:900000,available:()=>true,unlocked:()=>opened,touch(){},lock(){opened=false;},
    async key(){opened=true;key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(9),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(id,envelope){return openSecret(await this.key(),id,envelope);},
    async unlockWithRecoveryCode(){opened=true;return this.key();},recoveryCode:()=>'EV1-SYNTHETIC'};
}
// The store as the offline adapter presents it: sealed rows, a revision each.
function fakeStore(){
  const rows=new Map();const writes=[];let n=0;
  const list=()=>[...rows.values()];
  return {rows,writes,
    async request(token,url,options={}){
      const id=url.slice('/v1/health/'.length);
      if(!options.method||options.method==='GET')return {records:list(),syncMessage:''};
      writes.push({id,method:options.method,value:options.value});
      const previous=rows.get(id);
      if((previous?.revision??null)!==(options.value.revision??null))throw Error('This record changed in another window. Cancel your edits and refresh.');
      if(options.method==='DELETE'){rows.delete(id);return {records:list()};}
      const saved={id,secret:options.value.secret,revision:`r${++n}`};
      rows.set(id,saved);
      return {record:saved,records:list()};
    },
    async resolve(){return {records:list()};}};
}
const fakeDrafts=()=>{let kept=null;return {kept:()=>kept,read:async()=>kept,write:async(token,sealed,at)=>{kept={sealed,at};},remove:async()=>{kept=null;}};};
const key=async vault=>vault.key();
const opened=async(vault,store)=>Promise.all([...store.rows.values()].map(async row=>({id:row.id,...await openSecret(await key(vault),`health:${row.id}`,row.secret)})));
const fire=(node,type)=>node.dispatchEvent(new node.ownerDocument.defaultView.Event(type,{bubbles:true}));
const byLabel=(document,scope,prefix)=>[...document.querySelectorAll(`${scope} button`)].find(button=>button.getAttribute('aria-label')?.startsWith(prefix));
const byText=(document,scope,text)=>[...document.querySelectorAll(`${scope} button`)].find(button=>button.textContent===text);
async function mounted({records=[],relatives=[],drafts=fakeDrafts()}={}){
  const h=harness();
  const vault=fakeVault();await vault.key();
  const store=fakeStore();
  for(const [payload,id] of [...relatives,...records])store.rows.set(id,{id,secret:await sealSecret(await key(vault),`health:${id}`,payload),revision:'first'});
  const downloads=[];
  const tool=mountHealth(h.document.querySelector('main'),{vault,credentials:{get:async()=>'token'},offline:store,drafts,
    now:()=>'2026-09-22T12:00:00.000Z',download:file=>downloads.push(file)});
  await settle(()=>!h.document.getElementById('health-save').disabled);
  return {...h,vault,store,tool,drafts,downloads};
}
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const submit=async(t,note)=>{
  t.document.getElementById('health-note').value=note;fire(t.document.getElementById('health-note'),'input');
  fire(t.document.getElementById('health-form'),'submit');
};

test('one field and Save is a record; the default editor asks for nothing else',async()=>{
  const t=await mounted();
  const form=t.document.getElementById('health-form');
  const shown=[...form.querySelectorAll('.form-field')].filter(field=>!field.closest('#health-details')&&!field.closest('[hidden]')&&!field.hidden);
  assert.deepEqual(shown.map(field=>field.querySelector('textarea,input,select').id),['health-note','health-type','health-when'],'three entry controls, no more');
  assert.match(t.document.getElementById('health-summary').textContent,/Add your first health note/);
  assert.equal(t.document.getElementById('health-editor').open,true,'first use opens the editor');
  await submit(t,'Appendix removed around 2012; no complications');
  await settle(()=>t.store.rows.size===1);
  const [record]=await opened(t.vault,t.store);
  assert.equal(record.kind,'record');
  assert.equal(record.note,'Appendix removed around 2012; no complications');
  assert.equal(record.type,'Note');
  assert.equal(record.when,'');
  assert.equal(record.relative,'');
  assert.equal(t.store.writes[0].value.secret.includes('Appendix'),false,'what the store sees is sealed');
  await settle(()=>t.document.getElementById('health-history').textContent.includes('Appendix removed'));
  assert.equal(t.document.getElementById('health-form-status').textContent,'Saved');
  assert.equal(t.document.getElementById('health-undo').hidden,false,'undo is offered after a save');
  assert.equal(t.document.getElementById('health-tabs-history-tab').hidden,false,'History appears once a personal record exists');
  assert.equal(t.document.getElementById('health-tabs-family-tab').hidden,true,'Family waits for a relative');
  t.tool.stop();t.restore();
});

test('“My dad had Parkinson’s” files itself under Dad, creates him once and reuses him after',async()=>{
  const t=await mounted();
  t.document.getElementById('health-note').value='My dad had Parkinson’s';fire(t.document.getElementById('health-note'),'input');
  assert.equal(t.document.getElementById('health-destination-where').textContent,'Family · Dad (new)');
  fire(t.document.getElementById('health-form'),'submit');
  await settle(()=>t.store.rows.size===2);
  let items=await opened(t.vault,t.store);
  const dad=items.find(item=>item.kind==='relative'),note=items.find(item=>item.kind==='record');
  assert.equal(dad.label,'Dad');
  assert.equal(note.relative,dad.id);
  assert.equal(note.note,'My dad had Parkinson’s','the sentence is kept whole');
  assert.equal(note.type,'Note','no diagnosis is inferred');
  await settle(()=>t.document.getElementById('health-family').textContent.includes('Dad'));
  assert.equal(t.document.getElementById('health-tabs-family-tab').hidden,false);
  assert.equal(t.document.getElementById('health-tabs-history-tab').hidden,true,'a family note is not the owner’s history');
  assert.match(t.document.getElementById('health-form-status').textContent,/Saved · Family · Dad/);
  await submit(t,'My father has high blood pressure');
  await settle(()=>t.store.rows.size===3);
  items=await opened(t.vault,t.store);
  assert.equal(items.filter(item=>item.kind==='relative').length,1,'the same Dad is reused');
  assert.equal(items.filter(item=>item.kind==='record').every(item=>item.relative===dad.id),true);
  // The owner's own condition never moves to Dad; negation stays in the words.
  await submit(t,'Dad said I have migraines');
  await settle(()=>t.store.rows.size===4);
  items=await opened(t.vault,t.store);
  assert.equal(items.find(item=>item.note==='Dad said I have migraines').relative,'');
  await submit(t,'My dad did not have diabetes');
  await settle(()=>t.store.rows.size===5);
  items=await opened(t.vault,t.store);
  assert.equal(items.find(item=>item.note==='My dad did not have diabetes').relative,dad.id);
  assert.equal(t.document.body.textContent.includes('Ongoing issues'),false,'a family note never appears as the owner’s condition');
  t.tool.stop();t.restore();
});

test('two relatives a sentence could mean are asked about; a chosen destination outlasts more typing',async()=>{
  const mary=validateRelative({label:'Aunt Mary'});
  const t=await mounted({relatives:[[mary,id(3)],[mary,id(4)]]});
  await settle(()=>t.document.getElementById('health-family').textContent.includes('Aunt Mary'));
  await submit(t,'My aunt Mary had glaucoma');
  await settle(()=>t.document.getElementById('health-form-status').textContent==='Which relative?');
  assert.equal(t.store.writes.length,0,'nothing is guessed at');
  assert.equal(t.document.getElementById('health-destination-fields').hidden,false);
  const choice=t.document.getElementById('health-destination');
  assert.equal(choice.value,id(3));
  choice.value=id(4);fire(choice,'change');
  fire(t.document.getElementById('health-form'),'submit');
  await settle(()=>t.store.rows.size===3);
  const note=(await opened(t.vault,t.store)).find(item=>item.kind==='record');
  assert.equal(note.relative,id(4));
  // An explicit choice stands whatever the sentence then says.
  t.document.getElementById('health-note').value='My dad had gout';fire(t.document.getElementById('health-note'),'input');
  assert.equal(t.document.getElementById('health-destination-where').textContent,'Family · Dad (new)');
  t.document.getElementById('health-destination-change').click();
  choice.value='';fire(choice,'change');
  t.document.getElementById('health-note').value='My dad had gout and my mom had asthma';fire(t.document.getElementById('health-note'),'input');
  assert.equal(t.document.getElementById('health-destination-where').textContent,'Me');
  fire(t.document.getElementById('health-form'),'submit');
  await settle(()=>t.store.rows.size===4);
  assert.equal((await opened(t.vault,t.store)).find(item=>item.note?.startsWith('My dad had gout')).relative,'');
  t.tool.stop();t.restore();
});

test('a medication saves with no status, and its changes keep the history under the row',async()=>{
  const medication=validateHealthRecord({note:'Cetirizine',type:'Medication',directions:'10 mg each morning',status:'Taking',createdAt:'2026-09-01T00:00:00Z'});
  const t=await mounted({records:[[medication,id(7)]]});
  await settle(()=>t.document.getElementById('health-summary').textContent.includes('Cetirizine'));
  assert.match(t.document.getElementById('health-summary').textContent,/Medications/);
  t.document.getElementById('health-note').value='Vitamin D';fire(t.document.getElementById('health-note'),'input');
  t.document.getElementById('health-type').value='Medication';fire(t.document.getElementById('health-type'),'change');
  fire(t.document.getElementById('health-form'),'submit');
  await settle(()=>t.store.rows.size===2);
  const vitamin=(await opened(t.vault,t.store)).find(item=>item.note==='Vitamin D');
  assert.equal(vitamin.status,'Unspecified');
  await settle(()=>t.document.getElementById('health-history').textContent.includes('Status not recorded'));
  const medications=[...t.document.querySelectorAll('#health-summary .record-group')].find(group=>group.textContent.startsWith('Medications'));
  assert.equal(medications.textContent.includes('Vitamin D'),false,'an unspecified medication is not listed as current');
  assert.match(t.document.querySelector('#health-summary .health-review').textContent,/Vitamin D[\s\S]*Status not recorded/,'but it is there to be reviewed');
  // Stopping is a decision inside the record, in words.
  const row=[...t.document.querySelectorAll('#health-summary .record-row')].find(node=>node.textContent.includes('Cetirizine'));
  row.querySelector('.record-row-toggle').click();
  byText(t.document,'#health-summary','Mark stopped').click();
  await settle(()=>!!t.document.getElementById('health-change-00000007-save'));
  fire(t.document.getElementById('health-change-00000007'),'submit');
  await settle(()=>t.store.writes.filter(write=>write.id===id(7)).length===1);
  const items=await opened(t.vault,t.store);
  const stopped=items.find(item=>item.id===id(7));
  assert.equal(stopped.status,'Stopped');
  assert.deepEqual(stopped.changes.map(change=>[change.kind,change.from,change.to,change.effective]),[['stopped','Taking','Stopped','']]);
  const revision=items.find(item=>item.kind==='revision');
  assert.equal(revision.record,id(7));
  assert.equal(revision.prior.status,'Taking','the prior contents are kept as their own sealed object');
  await settle(()=>t.document.getElementById('health-history').textContent.includes('effective date not recorded'));
  assert.equal([...t.document.querySelectorAll('#health-summary .record-group')].some(group=>group.textContent.includes('Cetirizine')),false,'a stopped medication leaves the summary');
  t.tool.stop();t.restore();
});

test('locking clears every rendered word and keeps the unsaved note sealed for the next unlock',async()=>{
  const t=await mounted({records:[[validateHealthRecord({note:'Penicillin — hives',type:'Allergy or reaction'}),id(5)]]});
  await settle(()=>t.document.body.textContent.includes('Penicillin'));
  t.document.getElementById('health-note').value='Broke my wrist skiing';fire(t.document.getElementById('health-note'),'input');
  await settle(()=>!!t.drafts.kept());
  assert.equal(t.drafts.kept().sealed.includes('wrist'),false,'the draft is sealed before it is stored');
  t.vault.lock();
  await settle(()=>!t.document.body.textContent.includes('Penicillin'),2000);
  assert.equal(t.document.getElementById('health-note').value,'');
  assert.equal(t.document.body.textContent.includes('wrist'),false);
  await t.vault.key();
  await settle(()=>t.document.getElementById('health-draft').textContent.includes('unsaved note'),2000);
  assert.equal(t.document.body.textContent.includes('wrist'),false,'the draft is offered, not shown');
  byText(t.document,'#health-draft','Restore draft').click();
  await settle(()=>t.document.getElementById('health-note').value==='Broke my wrist skiing');
  t.tool.stop();t.restore();
});

test('the visit summary previews exactly what leaves, warns once, and never invents an absence',async()=>{
  const dad=validateRelative({label:'Dad'});
  const t=await mounted({relatives:[[dad,id(2)]],records:[
    [validateHealthRecord({note:'Cetirizine',type:'Medication',status:'Taking',directions:'10 mg'}),id(7)],
    [validateHealthRecord({note:'My dad had Parkinson’s — Dad’s name is Robert',relative:id(2)}),id(8)]]});
  await settle(()=>t.document.getElementById('health-summary').textContent.includes('Cetirizine'));
  byText(t.document,'#health-summary','Create visit summary').click();
  await settle(()=>!t.document.getElementById('health-export').hidden);
  const preview=t.document.getElementById('health-export');
  assert.match(preview.textContent,/This file will contain health information outside the vault\./);
  assert.equal(preview.textContent.includes('No known'),false);
  assert.equal(preview.querySelector('#health-visit-lines').textContent.includes('Robert'),false,'family history is in only when chosen');
  const family=[...preview.querySelectorAll('.choice-row')].find(row=>row.textContent.includes('Parkinson'));
  family.querySelector('input').checked=true;fire(family.querySelector('input'),'change');
  assert.ok(preview.querySelector('#health-visit-lines').textContent.includes('Robert'),'the note appears as written, name included');
  assert.ok(preview.querySelector('#health-visit-lines').textContent.includes('Dad'),'the relative is named by a safely determinable relationship');
  t.document.getElementById('health-visit-save').click();
  await settle(()=>t.downloads.length===1);
  assert.equal(t.downloads[0].filename,'health-summary-2026-09-22.pdf');
  assert.match(t.document.getElementById('health-visit-status').textContent,/Saved health-summary-2026-09-22\.pdf/);
  // Locking closes the preview and revokes what was made.
  t.vault.lock();
  await settle(()=>t.document.getElementById('health-export').hidden,2000);
  assert.equal(t.document.getElementById('health-export').textContent,'');
  t.tool.stop();t.restore();
});
