import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';

const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the tool to settle.');
};
function unlockedVault(){
  let key=null;
  return {idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
    async key(){key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(id,envelope){return openSecret(await this.key(),id,envelope);},
    async unlockWithRecoveryCode(){return this.key();},recoveryCode:()=>'EV1-SYNTHETIC'};
}
// linkedom's <select> value is read-only; the app sets it like a browser does.
// Deselecting is written first because linkedom clears the whole selection when
// an option is set to false, which would undo the choice made before it.
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){
    for(const option of this.options)if(option.value!==value)option.selected=false;
    for(const option of this.options)if(option.value===value)option.selected=true;
  }});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
const ETRADE={id:'etrade',label:'E*TRADE',institution:'E*TRADE',kind:'brokerage'};
const READING={updates:[
  {name:'Individual Brokerage',institution:'E*TRADE',owner:'',kind:'brokerage',currency:'USD',value:124500.5,asOf:'2026-09-11',confidence:'high',reason:'Net account value on the accounts page.'},
  {name:'Rollover IRA',institution:'E*TRADE',owner:'',kind:'retirement',currency:'USD',value:88000,asOf:'2026-09-11',confidence:'high',reason:'Net account value on the accounts page.'}
],unread:''};

// One tool, wired the way the sidebar wires it: a page beside the panel, a
// saved AI connection, and one record already in the ledger to match against.
function financeHost(document,{saved=[],reading=READING,readPage,onIntake,connections=[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]}={}){
  const writes=[];
  let records=[...saved];
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},
    readPage:readPage||(async()=>({text:'Individual Brokerage  |  $124,500.50',host:'us.etrade.com',title:'Accounts',trimmed:0,tables:1})),
    remote:async(token,path,options)=>{
      if(path==='/v1/ai-connections')return {connections};
      onIntake?.(options.value);
      return reading;
    },
    offline:{request:async(token,path,options)=>{
      if(options?.method==='PUT'){
        writes.push(options.value);
        records=[...records.filter(record=>record.id!==options.value.id),{...options.value,revision:'r2'}];
      }
      return {records};
    }}
  });
  return {tool,writes};
}
function setup(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  return {document,restore:selectValues(window)};
}
const ready=document=>settle(()=>document.getElementById('finance-connection').querySelectorAll('option').length>1);

test('a signed-in account page offers one action, and nothing before that',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document);
  await ready(document);
  assert.equal(document.getElementById('finance-snapshot').hidden,true,'no site, no prompt');
  tool.site(ETRADE);
  assert.equal(document.getElementById('finance-snapshot').hidden,false);
  const panel=document.getElementById('finance-snapshot-body');
  assert.match(panel.textContent,/E\*TRADE/);
  assert.deepEqual([...panel.querySelectorAll('button')].map(node=>node.textContent),['Store account snapshots']);
  tool.site(null);
  assert.equal(document.getElementById('finance-snapshot').hidden,true,'leaving the page withdraws the offer');
  tool.stop();restore();
});

test('storing snapshots reads one total per account and saves nothing until Save',async()=>{
  const {document,restore}=setup();
  let sent=null;
  const {tool,writes}=financeHost(document,{
    saved:[{id:'existing',revision:'r1',kind:'brokerage',name:'Individual Brokerage',institution:'E*TRADE',currency:'USD',value:100000,asOf:'2026-06-01',ownership:100,liquidity:'Liquid',history:'[]'}],
    onIntake:value=>{sent=value;}
  });
  await ready(document);
  tool.site(ETRADE);
  document.getElementById('finance-connection').value='connection-1';
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Rollover IRA'));

  // The page text is sent as a live reading, so today's balances are not dropped
  // for want of a date printed on the page.
  assert.equal(sent.live,true);
  assert.equal(sent.institution,'E*TRADE');
  assert.match(sent.text,/Individual Brokerage/);

  const panel=document.getElementById('finance-snapshot-body');
  assert.match(panel.textContent,/\$124,501|\$124,500\.50/,'each account shows the total read for it');
  assert.match(panel.textContent,/Updates Individual Brokerage/,'a known account names the record it lands on');
  assert.match(panel.textContent,/New record/,'an unknown account says it would create one');
  assert.deepEqual([...panel.querySelectorAll('button')].map(node=>node.textContent),['Save','Edit','Discard']);
  assert.match(panel.textContent,/2 accounts · as of 2026-09-11/,'one shared date is stated once, not on every row');
  assert.equal(panel.textContent.includes('New record · as of'),false);
  assert.equal(writes.length,0,'reading saves nothing');
  assert.match(document.getElementById('finance-snapshot-status').textContent,/2 accounts read\. Nothing is saved yet\./);

  panel.querySelector('button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('Saved 2 snapshots.'));
  assert.deepEqual(writes.map(record=>[record.name,record.value,record.asOf]),[['Individual Brokerage',124500.5,'2026-09-11'],['Rollover IRA',88000,'2026-09-11']]);
  assert.equal(writes[0].id,'existing','a matched account updates its record instead of duplicating it');
  assert.equal(writes[0].revision,'r1');
  assert.equal(writes[1].revision,null);
  assert.equal(writes[1].kind,'retirement');
  assert.match(writes[0].history,/E\*TRADE page/,'the snapshot says where the figure came from');
  assert.equal(document.getElementById('finance-snapshot-body').textContent.includes('Rollover IRA'),false,'saved snapshots leave the panel');
  tool.stop();restore();
});

test('accounts read with different dates each state their own',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{reading:{updates:[
    {...READING.updates[0],asOf:'2026-09-11'},
    {...READING.updates[1],asOf:'2026-08-31'}
  ],unread:''}});
  await ready(document);
  tool.site(ETRADE);
  document.getElementById('finance-connection').value='connection-1';
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Rollover IRA'));
  const panel=document.getElementById('finance-snapshot-body');
  assert.equal(panel.textContent.includes('accounts · as of'),false,'no single date can stand for both');
  assert.match(panel.textContent,/as of 2026-09-11/);
  assert.match(panel.textContent,/as of 2026-08-31/);
  tool.stop();restore();
});

test('Edit puts the extracted amounts in fields, and Save writes what the owner left there',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document);
  await ready(document);
  tool.site(ETRADE);
  document.getElementById('finance-connection').value='connection-1';
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Rollover IRA'));

  const buttons=()=>[...document.querySelectorAll('#finance-snapshot-body button')];
  buttons().find(node=>node.textContent==='Edit').click();
  const first=document.getElementById('finance-snapshot-value-0');
  assert.equal(first.value,'124500.5','an amount is offered as read, not as a blank field');
  assert.equal(document.querySelector('label[for=finance-snapshot-value-0]').textContent,'Individual Brokerage');
  assert.deepEqual(buttons().map(node=>node.textContent),['Save','Discard']);
  first.value='124600';
  first.dispatchEvent(new document.defaultView.Event('input'));
  buttons()[0].click();
  await settle(()=>writes.length===2);
  assert.equal(writes[0].value,124600,'the corrected amount is what gets saved');
  tool.stop();restore();
});

test('a reading needs a connection, and a bad amount is reported without losing the rest',async()=>{
  const {document,restore}=setup();
  // Two saved connections, so none is chosen for the owner and the reading has
  // to say what it is waiting for.
  const {tool,writes}=financeHost(document,{connections:[
    {id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true},
    {id:'connection-2',name:'Second',provider:'anthropic',hasApiKey:true}
  ]});
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('AI connection'));
  assert.equal(writes.length,0);

  document.getElementById('finance-connection').value='connection-1';
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Rollover IRA'));
  [...document.querySelectorAll('#finance-snapshot-body button')].find(node=>node.textContent==='Edit').click();
  const first=document.getElementById('finance-snapshot-value-0');
  first.value='not a number';
  first.dispatchEvent(new document.defaultView.Event('input'));
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('valid value'));
  assert.equal(writes.length,0,'nothing is saved past the row that could not be read');
  assert.match(document.getElementById('finance-snapshot-body').textContent,/Individual Brokerage/,'the rows stay put to be corrected');
  tool.stop();restore();
});
