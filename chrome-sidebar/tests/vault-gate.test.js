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
  [...h.document.querySelectorAll('#personal-list button')].find(button=>button.textContent==='Show value').click();
  await settle(()=>h.document.body.textContent.includes('X1234567'));
  assert.match(h.document.getElementById('personal-list').textContent,/X1234567 · Synthetic notes/);
  tool.stop();h.restore();
});

test('finance totals and drafts stay behind the gate, and an applied draft is saved through the validator',async()=>{
  const h=harness();
  const vault=fakeVault();
  const id='22222222-2222-4222-8222-222222222222';
  const record={...normalizeFinance({kind:'brokerage',name:'Synthetic brokerage',value:1000,asOf:'2026-01-01'}),id,revision:'first'};
  const saved=[];
  const tool=mountFinance(h.document.querySelector('main'),{vault,credentials:{get:async()=>'token'},
    remote:async(token,path)=>path.endsWith('/finance-intake')
      ?{updates:[{name:'Synthetic brokerage',value:1300,asOf:'2026-04-01',kind:'brokerage',confidence:'high',reason:'The text states a balance and a date.'}],unread:''}
      :{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]},
    offline:{request:async(token,path,options)=>{if(options?.method){saved.push(options.value);return {records:[{...options.value,revision:'next'}]};}return {records:[record]};}}});
  assert.equal(h.document.body.textContent.includes('Synthetic brokerage'),false);
  await settle(()=>h.document.body.textContent.includes('Synthetic brokerage'));
  assert.match(h.document.getElementById('finance-totals').textContent,/\$1,000/);

  // A reading produces drafts and saves nothing on its own.
  h.document.getElementById('finance-intake').value='Synthetic brokerage was at 1300 on April 1.';
  h.document.getElementById('finance-connection').value='c1';
  h.document.getElementById('finance-read').click();
  await settle(()=>h.document.getElementById('finance-drafts').textContent.includes('Updates Synthetic brokerage'));
  assert.equal(saved.length,0,'reading text must not save anything');
  assert.match(h.document.getElementById('finance-intake-status').textContent,/1 draft ready to review/);

  // Applying one writes through the same validator and queue as a typed edit.
  [...h.document.querySelectorAll('#finance-drafts button')].find(button=>button.textContent==='Apply update').click();
  await settle(()=>saved.length===1);
  assert.equal(saved[0].id,id,'the draft lands on the record it matched');
  assert.equal(saved[0].revision,'first');
  assert.equal(saved[0].value,1300);
  assert.deepEqual(JSON.parse(saved[0].history).map(entry=>entry.asOf),['2026-04-01','2026-01-01'],'the earlier figure is kept in history');
  assert.match(JSON.parse(saved[0].history)[0].source,/AI reading/);
  assert.equal(h.document.getElementById('finance-drafts').textContent,'','an applied draft leaves the review list');
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

test('a hidden section waits its turn, and Lock now stays locked',async()=>{
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
  assert.equal(prompts,1,'Lock now is an instruction, not an invitation to ask again');
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

test('a borrowed session offers no lock of its own',async()=>{
  // On the phone the app's lock takes the passkey and hands the record key over.
  // Lock now here would close a session that lock opened, so the next arrival
  // would ask for the passkey the reader has already given — and recovery
  // belongs to that lock too. Neither control applies, so neither appears.
  const h=harness();
  const vault={idleMs:900000,available:()=>true,unlocked:()=>true,borrowed:()=>true,touch(){},lock(){},
    async key(){return 'key';},async unlockWithRecoveryCode(){},recoveryCode:()=>'EV1'};
  const gate=mountVaultGate(h.document.querySelector('main'),{id:'borrowed-vault',title:'Finance',vault});
  await settle(()=>true,50);
  assert.equal(h.document.getElementById('borrowed-vault-actions').textContent,'');
  assert.equal(gate.content.hidden,false);
  gate.stop();h.restore();
});
