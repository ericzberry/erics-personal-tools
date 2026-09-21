import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountSubscriptions,researchMarket} from '../src/subscriptions.js';
import {normalizeSubscription} from '../src/subscription-data.js';

const settle=async fn=>{for(let i=0;i<500;i++){await new Promise(r=>setTimeout(r,1));if(fn())return;}throw Error('Did not settle');};
const vault={unlocked:()=>true,available:()=>true,borrowed:()=>true,touch(){}};
const credentials={get:async()=>'synthetic-token'};
const STATEMENT='AMEX PLATINUM · Statement\n09/01/2026  SYNTHETIC STREAM 800-555-0100  15.49\n09/03/2026  GROCER  82.10';
const READING={account:'Amex Platinum ending 31004',subscriptions:[{name:'Synthetic Stream',currency:'USD',notes:'',
  charges:[{on:'2026-09-01',amount:15.49,description:'SYNTHETIC STREAM 800-555-0100'}]}]};
function setup(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||'';},set(value){for(const option of this.options)option.removeAttribute('selected');[...this.options].find(o=>o.value===value)?.setAttribute('selected','');}});
  return {document,window,root:document.querySelector('main')};
}
// A store that behaves like the offline one: every write returns the list.
function store(list){
  const saved={records:list.map((r,i)=>({...normalizeSubscription(r),id:r.id||`id-${i}`,revision:'first'}))};
  return {saved,request:async(token,path,options={})=>{
    if(!options.method)return {records:saved.records};
    const id=path.slice('/v1/subscriptions/'.length);
    const value={...normalizeSubscription(options.value),id,revision:'next'};
    saved.records=saved.records.some(r=>r.id===id)?saved.records.map(r=>r.id===id?value:r):[...saved.records,value];
    return {record:value,records:saved.records};
  }};
}
const drop=(root,window,body,name='statement.txt')=>{
  const input=root.querySelector('#subscriptions-file');
  Object.defineProperty(input,'files',{value:[new File([body],name,{type:'text/plain'})],configurable:true});
  input.dispatchEvent(new window.Event('change'));
};
const buttons=root=>[...root.querySelectorAll('button')].map(b=>b.textContent);
const ready=root=>settle(()=>!root.querySelector('#subscriptions-save').disabled);
// linkedom keeps no `open` property on <details>; a browser keeps both.
const isOpen=details=>details.open===true||details.hasAttribute('open');

// UI-38, UI-42, UI-47. Dropping a statement is the whole errand: nothing is
// asked first, the card it was charged to comes off the statement, the text
// pulled out of it never reaches the screen, and it is read when it arrives.
test('a dropped statement is read on arrival, with nothing asked first and nothing shown but the file',async()=>{
  const {root,window}=setup();const offline=store([]);let sent=null;
  mountSubscriptions(root,{vault,credentials,offline,remote:async(token,path,options)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'c1',provider:'openai',hasApiKey:true}]};
    if(path.endsWith('/subscription-intake')){sent=options.value;return READING;}
    throw Error(`Unexpected ${path}`);
  }});
  await ready(root);
  const intake=root.querySelector('#subscriptions-intake');
  assert.equal(isOpen(intake),true,'with nothing saved, reading a statement is what the screen is opened for');
  assert.deepEqual([...intake.querySelectorAll('input,textarea,select')].map(node=>node.type||node.tagName),['file'],
    'the drop zone is the only thing in the intake: no nickname, no box of text');
  assert.equal(root.querySelector('#subscriptions-read-actions').hidden,true,'nothing to read yet, so nothing offers to');

  drop(root,window,STATEMENT);
  await settle(()=>offline.saved.records.length===1&&!root.querySelector('#subscriptions-save').disabled);
  assert.match(sent.text,/SYNTHETIC STREAM/);
  const [record]=offline.saved.records;
  assert.equal(record.account,'Amex Platinum','the card comes off the statement, and its number does not');
  assert.equal(record.state,'Review');
  assert.equal(record.charges[0].source,'statement.txt');
  assert.equal(root.querySelector('#subscriptions-attachment').hidden,true,'read once is read: the file leaves with its reading');
  assert.equal(root.querySelector('#subscriptions-read-actions').hidden,true);
  assert.equal(root.querySelector('#subscriptions-intake-status').textContent,'Found 1 possible subscription — confirm it above.');
  assert.equal(root.textContent.includes('GROCER'),false,'what the device pulled out of the file is never on the screen');
  assert.equal(buttons(root).some(label=>/Find recurring|Clear statement|Read this/.test(label)),false);
});

test('a file that could not be read waits with Read, and a service found again joins the one already saved',async()=>{
  const {root,window}=setup();
  const offline=store([{id:'saved',name:'Synthetic Stream',account:'Everyday card',currency:'USD',amount:15.49,cycle:'monthly',state:'Active',
    charges:[{on:'2026-08-01',amount:15.49,description:'SYNTHETIC STREAM 800-555-0100'}]}]);
  let fail=true;
  mountSubscriptions(root,{vault,credentials,offline,remote:async(token,path)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'c1',provider:'openai',hasApiKey:true}]};
    if(fail)throw Error('The reading timed out.');
    return READING;
  }});
  await ready(root);
  assert.equal(isOpen(root.querySelector('#subscriptions-intake')),false,'with records saved, the list is what the screen is for');
  drop(root,window,STATEMENT);
  await settle(()=>root.querySelector('#subscriptions-intake-status').textContent==='The reading timed out.');
  assert.equal(root.querySelector('#subscriptions-attachment').hidden,false,'the file stays, named by its card');
  assert.match(root.querySelector('#subscriptions-attachment').textContent,/statement\.txt/);
  assert.equal(root.querySelector('#subscriptions-read-actions').hidden,false,'and offers Read, because trying again is the remedy');

  fail=false;root.querySelector('#subscriptions-read').click();
  await settle(()=>root.querySelector('#subscriptions-attachment').hidden);
  assert.equal(offline.saved.records.length,1,'the same service on a statement for another card is still one service');
  const [record]=offline.saved.records;
  assert.equal(record.account,'Everyday card','a reading never replaces the card already saved');
  assert.equal(record.state,'Active','nor the owner’s terms');
  assert.equal(record.charges.length,2);
});

// UI-48. A line prints what is known.
test('a record line leaves off what is not known and says Active not at all',async()=>{
  const {root}=setup();
  const offline=store([
    {name:'Membership fee',account:'Amex Platinum',currency:'USD',amount:895,cycle:'unknown',state:'Review',notes:'',charges:[{on:'2025-10-21',amount:895,description:'MEMBERSHIP FEE'}]},
    {name:'Unpriced service',currency:'USD',amount:null,cycle:'unknown',state:'Active'},
    {name:'Streaming',currency:'USD',amount:12,cycle:'monthly',state:'Active',renewal:'2026-10-03'},
    {name:'Old gym',currency:'USD',amount:40,cycle:'monthly',state:'Canceled',canceledOn:'2026-07-01'}]);
  mountSubscriptions(root,{vault,credentials,offline,remote:async()=>({connections:[]})});
  await ready(root);
  const rows=[...root.querySelectorAll('#subscriptions-records > .record-row')];
  const row=name=>rows.find(r=>r.querySelector('.record-name').textContent===name);
  assert.equal(/Not established|Not known|Amount unknown|Active/.test(rows.map(r=>r.querySelector('.record-line').nextElementSibling?.textContent||'').join('\n')),false);
  assert.equal(row('Membership fee').querySelector('p').textContent,'Possible subscription · Amex Platinum');
  assert.equal(row('Unpriced service').querySelector('.record-figure>strong'),null,'no figure where the price is not known');
  assert.equal(row('Streaming').querySelector('p').textContent,'Monthly · Renews Oct 3, 2026');
  // Every row carries the same verbs, so the amounts end on one edge. UI-27.
  assert.deepEqual(rows.map(r=>r.querySelectorAll('.record-line .row-action').length),[2,2,2,2]);
  // What a possible subscription asks is answered under it; cheaper plans are
  // looked for only for a service being paid for, inside its own drawer.
  assert.deepEqual([...row('Membership fee').querySelectorAll(':scope > .action-group button')].map(b=>b.textContent),['Confirm','Not recurring']);
  assert.equal(row('Membership fee').textContent.includes('alternatives'),false);
  assert.match(row('Streaming').querySelector('details summary').textContent,/^Alternatives$/);
  assert.equal(row('Streaming').querySelector('details button').textContent,'Find cheaper alternatives');
  assert.equal(row('Old gym').querySelector('details'),null);
});

test('cheaper plans are looked for where the browser says the owner is, and the answer stays with the record',async()=>{
  assert.equal(researchMarket('en-US'),'United States');
  assert.equal(researchMarket('en-GB'),'United Kingdom');
  assert.equal(researchMarket('fr'),'France');
  const {root}=setup();
  const offline=store([{id:'s',name:'Streaming',currency:'USD',amount:20,cycle:'monthly',state:'Active'}]);let asked=null;
  mountSubscriptions(root,{vault,credentials,offline,remote:async(token,path,options)=>{
    if(path==='/v1/ai-connections')return {connections:[{id:'c1',provider:'openai',hasApiKey:true}]};
    asked=options.value;
    return {research:{checked:'2026-09-21',country:options.value.country,requirements:'',summary:'One cheaper tier.',
      options:[{name:'Streaming Basic',amount:10,currency:'USD',cycle:'monthly',url:'https://example.com/pricing',terms:'Ads.'}]}};
  }});
  await ready(root);
  root.querySelector('details button').click();
  await settle(()=>root.textContent.includes('Found 1 alternative.'));
  assert.equal(asked.country,researchMarket(),'no field asks for a country');
  assert.equal(isOpen(root.querySelector('details')),true,'the drawer holding the answer opens');
  assert.match(root.querySelector('details').textContent,/Streaming Basic.*\$10\.00.*\$120\.00 a year less/s);
  assert.equal(root.querySelector('#subscriptions-country'),null);
});
