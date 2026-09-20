import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountVaultGate} from '../src/vault-gate.js';
import {mountPersonal} from '../src/personal.js';
import {mountFinance} from '../src/finance.js';
import {sealSecret,openSecret} from '../src/secret-vault.js';
import {normalizePersonal} from '../src/personal-data.js';
import {normalizeFinance} from '../src/finance-data.js';
const settle=async(check=()=>true,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the section to settle.');
};
function harness(){
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
  return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
function fakeVault(){
  let key=null,prompts=0,opened=false,waiting=null;
  return {idleMs:900000,available:()=>true,unlocked:()=>opened,touch(){},lock(){opened=false;},
    // Holds the next prompt open the way an unanswered passkey sheet does.
    hold(promise){waiting=promise;},
    async key(){prompts++;if(waiting){const sheet=waiting;waiting=null;await sheet;}opened=true;key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(7),'AES-GCM',false,['encrypt','decrypt']);return key;},
    async open(id,envelope){return openSecret(await this.key(),id,envelope);},
    async unlockWithRecoveryCode(){opened=true;return this.key();},recoveryCode:()=>'EV1-SYNTHETIC',prompts:()=>prompts};
}

test('the gate keeps its content out of the document tree’s visible state until the passkey answers',async()=>{
  const h=harness();
  const vault=fakeVault();
  const changes=[];
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'test-vault',title:'Locked section',vault,automatic:false,onChange:value=>changes.push(value)});
  gate.content.append(h.document.createElement('p'));
  gate.content.querySelector('p').textContent='Synthetic protected content';
  assert.equal(gate.content.hidden,true);
  assert.equal(h.document.getElementById('test-vault-status').textContent,'Locked');
  assert.equal(h.document.getElementById('test-vault-title').hidden,false,'the locked gate carries the page heading');
  h.document.getElementById('test-vault-actions').querySelector('button').click();
  await settle(()=>changes.length>0);
  assert.equal(gate.content.hidden,false);
  assert.equal(h.document.getElementById('test-vault-title').hidden,true,'unlocked, the gate hands the heading back to the tool');
  assert.equal(h.document.getElementById('test-vault-status').textContent,'','an open section shows itself rather than announcing that it is unlocked');
  assert.equal(h.document.getElementById('test-vault-detail').hidden,true);
  assert.deepEqual(changes,[true]);
  gate.lock();
  assert.equal(gate.content.hidden,true);
  assert.deepEqual(changes,[true,false]);
  gate.stop();h.restore();
});

test('an idle lock closes the section without waiting for the next interaction',async()=>{
  const h=harness();
  let unlocked=true;
  const vault={idleMs:900000,available:()=>true,unlocked:()=>unlocked,touch(){},lock(){unlocked=false;},key:async()=>null,unlockWithRecoveryCode:async()=>null,recoveryCode:()=>'EV1'};
  const changes=[];
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'idle-vault',vault,onChange:value=>changes.push(value)});
  assert.equal(gate.content.hidden,false);
  unlocked=false;
  await settle(()=>changes.length>0,2000);
  assert.equal(gate.content.hidden,true);
  assert.deepEqual(changes,[false]);
  gate.stop();h.restore();
});

test('personal information loads nothing while locked and opens a value only through the vault',async()=>{
  const h=harness();
  const vault=fakeVault();
  const key=await vault.key();vault.lock();
  const asked=vault.prompts();
  const id='11111111-1111-4111-8111-111111111111';
  const record={...normalizePersonal({category:'Identification',label:'Synthetic passport',hint:'ends 7781',secret:await sealSecret(key,id,{value:'X1234567','notes':'Synthetic notes'})}),id,revision:'first'};
  let requests=0,answer;
  vault.hold(new Promise(resolve=>{answer=resolve;}));
  const tool=mountPersonal(h.document.querySelector('main'),{vault,credentials:{get:async()=>'token'},
    offline:{request:async()=>{requests++;return {records:[record]};}}});
  // Arriving raises the prompt by itself, and nothing is fetched or rendered
  // while it is still unanswered.
  await settle(()=>vault.prompts()>asked);
  assert.equal(requests,0);
  assert.equal(h.document.body.textContent.includes('Synthetic passport'),false);
  answer();
  await settle(()=>requests>0&&h.document.body.textContent.includes('Synthetic passport'));
  assert.equal(vault.prompts(),asked+1,'arriving asks for the passkey once, without a button press');
  assert.equal(h.document.body.textContent.includes('X1234567'),false,'the value stays sealed until it is revealed');
  // The record's own verbs are glyphs at the end of its line, so the action is
  // found by the name it gives a screen reader rather than by a word under it.
  [...h.document.querySelectorAll('#personal-list button')]
    .find(button=>button.getAttribute('aria-label')==='Show the value of Synthetic passport').click();
  await settle(()=>h.document.body.textContent.includes('X1234567'));
  assert.match(h.document.getElementById('personal-list').textContent,/X1234567 · Synthetic notes/);
  tool.stop();h.restore();
});

test('finance totals and readings stay behind the gate, and a saved figure goes through the validator',async()=>{
  const h=harness();
  const vault=fakeVault();
  const estate={id:'p1',row:'portfolio',revision:'first',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
  const figure={id:'1-1-20260101',row:'mark',revision:'100000',portfolio:1,class:1,asOf:'2026-01-01',amount:1000};
  const saved=[];
  const tool=mountFinance(h.document.querySelector('main'),{vault,credentials:{get:async()=>'token'},
    remote:async(token,path)=>path.endsWith('/finance-intake')
      ?{readings:[{account:'Brokerage',label:'Net Account Value',class:'stocks',registration:'',scope:'account',value:1300,asOf:'2026-04-01',confidence:'high',reason:'The text states a balance and a date.'}],unread:''}
      :{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]},
    readPage:async()=>({text:'Brokerage was at 1300 on April 1.',host:'accounts.example',title:'',trimmed:0,tables:1}),
    offline:{request:async(token,path,options)=>{if(options?.method){saved.push(options.value);return {records:[estate,{...options.value,revision:'next'}]};}return {records:[estate,figure]};}}});
  assert.equal(h.document.body.textContent.includes('Eric and Ariana Berry Estate'),false);
  await settle(()=>h.document.body.textContent.includes('Eric and Ariana Berry Estate'));
  assert.match(h.document.getElementById('finance-totals').textContent,/\$1,000/);

  // A reading produces figures to review and saves nothing on its own.
  h.document.getElementById('finance-page-read').click();
  await settle(()=>h.document.getElementById('finance-snapshot-body').textContent.includes('Stocks'));
  assert.equal(saved.length,0,'reading a page must not save anything');
  assert.match(h.document.getElementById('finance-snapshot-status').textContent,/1 figure read(?: from accounts\.example)?, folded into 1/);

  // Saving writes through the same validator and queue as a typed edit, and
  // the figure is addressed by where, what and when — nothing else.
  [...h.document.querySelectorAll('#finance-snapshot-body button')].find(button=>button.textContent==='Save these figures').click();
  await settle(()=>saved.length===1);
  assert.equal(saved[0].id,'1-1-20260401');
  assert.equal(saved[0].revision,null,'a date this class has no figure for yet is an append');
  assert.deepEqual([saved[0].portfolio,saved[0].class,saved[0].amount],[1,1,1300]);
  assert.equal(saved[0].row,'mark');
  // January's figure is untouched, because a figure is keyed by its own date.
  assert.equal(h.document.getElementById('finance-snapshot-body').textContent.includes('Stocks'),false,'a saved reading leaves the review list');
  tool.stop();h.restore();
});

test('a section the sidebar opened on its own raises no passkey sheet until it is asked for',async()=>{
  // Visiting a bank is not asking for Finance. The panel turns to it beside such
  // a page, and a system prompt in front of someone who only opened a tab would
  // be the sidebar arriving at a protected section on its own account.
  const h=harness();
  let prompts=0,open=false;
  const vault={idleMs:900000,available:()=>true,unlocked:()=>open,touch(){},lock(){open=false;},
    async key(){prompts++;open=true;return 'key';},async unlockWithRecoveryCode(){open=true;},recoveryCode:()=>'EV1'};
  const tool=mountFinance(h.document.querySelector('main'),{vault,quiet:true,credentials:{get:async()=>'token'},
    readPage:async()=>({text:'',host:'client.schwab.com',title:'',trimmed:0,tables:0}),
    remote:async()=>({connections:[]}),offline:{request:async()=>({records:[]})}});
  await settle(()=>true,50);
  assert.equal(prompts,0,'no passkey sheet, and the gate is still locked');
  assert.equal(h.document.getElementById('finance-vault-content').hidden,true);
  // Being told again is the same arrival, not a new one.
  tool.quiet(true);
  await settle(()=>true,50);
  assert.equal(prompts,0);
  // Unlocking from the lock screen opens the section — and answers only the
  // question it was asked. The figures still wait to be sent for.
  h.document.querySelector('#finance-vault-actions button').click();
  await settle(()=>prompts>0&&h.document.getElementById('finance-vault-content').hidden===false);
  await settle(()=>h.document.getElementById('finance-actions').textContent==='Show everything you hold');
  assert.equal(h.document.getElementById('finance-ledger').hidden,true);
  tool.quiet(false);
  assert.equal(h.document.getElementById('finance-ledger').hidden,false);
  assert.equal(prompts,1,'one passkey, given once, for the whole sitting');
  tool.stop();h.restore();
});

test('arriving at a locked section asks for the passkey, and a dismissed prompt leaves a button instead of a loop',async()=>{
  const h=harness();
  let prompts=0,refuse=true,open=false;
  const vault={idleMs:900000,available:()=>true,unlocked:()=>open,touch(){},lock(){open=false;},
    async key(){prompts++;if(refuse)throw Object.assign(Error('Canceled'),{name:'NotAllowedError'});open=true;return 'key';},
    async unlockWithRecoveryCode(){open=true;},recoveryCode:()=>'EV1'};
  const changes=[];
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'auto-vault',vault,onChange:value=>changes.push(value)});
  await settle(()=>prompts>0);
  assert.equal(prompts,1,'no button press was needed');
  await settle(()=>h.document.getElementById('auto-vault-actions').textContent.includes('Unlock'),50);
  assert.match(h.document.getElementById('auto-vault-status').textContent,/canceled or timed out/);
  await settle(()=>true,50);
  assert.equal(prompts,1,'a dismissed prompt is not retried on its own');
  refuse=false;
  h.document.getElementById('auto-vault-actions').querySelector('button').click();
  await settle(()=>changes.length>0);
  assert.deepEqual(changes,[true]);
  assert.equal(gate.content.hidden,false);
  gate.stop();h.restore();
});

test('a hidden section waits its turn, and a deliberate lock stays locked',async()=>{
  const h=harness();
  let prompts=0,open=false;
  const vault={idleMs:900000,available:()=>true,unlocked:()=>open,touch(){},lock(){open=false;},
    async key(){prompts++;open=true;return 'key';},async unlockWithRecoveryCode(){open=true;},recoveryCode:()=>'EV1'};
  const root=h.document.querySelector('main');
  root.hidden=true;
  const gate=mountVaultGate(root,{id:'hidden-vault',vault});
  await settle(()=>true,50);
  assert.equal(prompts,0,'a tool that is not on screen must not raise a passkey sheet');
  root.hidden=false;
  await settle(()=>prompts>0);
  assert.equal(gate.unlocked(),true);
  gate.lock();
  await settle(()=>true,50);
  assert.equal(prompts,1,'a deliberate lock is an instruction, not an invitation to ask again');
  gate.stop();h.restore();
});

test('a section arriving at an already-open vault shows itself instead of asking again',async()=>{
  // The mobile app's lock verifies the passkey and hands the record key over, so
  // the vault is open before the first section mounts. Opening Finance then has
  // nothing to ask for.
  const h=harness();
  let prompts=0;
  const vault={idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
    async key(){prompts++;return 'key';},async unlockWithRecoveryCode(){},recoveryCode:()=>'EV1'};
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'adopted-vault',title:'Finance',vault});
  await settle(()=>true,50);
  assert.equal(prompts,0,'the passkey the owner just gave is the one that counts');
  assert.equal(gate.content.hidden,false);
  assert.equal(h.document.getElementById('adopted-vault-title').hidden,true);
  assert.equal(h.document.getElementById('adopted-vault-status').textContent,'');
  gate.stop();h.restore();
});

test('an unlocked gate offers nothing: the tool is what the reader came for',async()=>{
  // A row of lock maintenance above every protected heading is a label for a
  // visible state. The session closes on its own idle window, and the recovery
  // code lives in Settings, so the open gate has no control left to show.
  const h=harness();
  const vault={idleMs:900000,available:()=>true,unlocked:()=>true,touch(){},lock(){},
    async key(){return 'key';},async unlockWithRecoveryCode(){},recoveryCode:()=>'EV1'};
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'open-vault',title:'Finance',vault});
  await settle(()=>true,50);
  assert.equal(h.document.getElementById('open-vault-actions').textContent,'');
  assert.equal(h.document.getElementById('open-vault-actions').querySelector('button'),null);
  assert.equal(gate.content.hidden,false);
  gate.stop();h.restore();
});
