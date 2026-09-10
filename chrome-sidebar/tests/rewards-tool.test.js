import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountRewards} from '../src/rewards-tool.js';
import {sealSecret,openSecret} from '../src/secret-vault.js';
// Waits for the tool to reach an expected state. Sealing and opening a
// protected value run through real WebCrypto, so a single tick is not enough
// to observe the result reliably.
const settle=async(check=()=>true,attempts=500)=>{
 for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
 throw Error('Timed out waiting for the rewards tool to settle.');
};
test('reward editor preserves failed input and uses inline deletion confirmation',async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
 const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
 let fail=true,deleted=0;const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first'};
 const tool=mountRewards(document.querySelector('main'),{credentials:{get:async()=>'token'},offline:{request:async(t,p,o)=>{if(o?.method){if(fail)throw Error('Storage unavailable');if(o.method==='DELETE')deleted++;return {records:o.method==='DELETE'?[]:[{...o.value,revision:'next'}]};}return {records:[entry]};}}});await tool.refresh();
 const $=id=>document.getElementById(id);for(const id of ['reward-kind','reward-state']){const node=$(id);let value=id==='reward-kind'?'balance':'available';Object.defineProperty(node,'value',{configurable:true,get:()=>value,set:next=>{value=next;}});}document.querySelector('#rewards-list button').click();$('reward-name').value='Edited name';$('reward-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>$('reward-form-status').textContent);assert.equal($('reward-name').value,'Edited name');assert.match($('reward-form-status').textContent,/Storage unavailable/);
 $('reward-cancel').click();const remove=[...document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Delete');remove.click();assert.equal(deleted,0);const confirmation=[...document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Delete reward');assert.equal(confirmation.closest('[hidden]'),null);fail=false;confirmation.click();await settle(()=>deleted===1);assert.equal(deleted,1);
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
});

function harness(){
 const {document,window}=parseHTML('<html><body><main></main></body></html>');globalThis.document=document;globalThis.window=window;
 const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===value;}});
 return {document,window,restore:()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor)};
}
function fakeVault(){
 let key=null,prompts=0,opened=false;
 return {idleMs:900000,available:()=>true,unlocked:()=>opened,touch(){},lock(){opened=false;},
  async key(){prompts++;opened=true;key??=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(3),'AES-GCM',false,['encrypt','decrypt']);return key;},
  async open(id,envelope){return openSecret(await this.key(),id,envelope);},
  async unlockWithRecoveryCode(){opened=true;},recoveryCode:()=>'EV1-SYNTHETIC',prompts:()=>prompts};
}
function shim(document,ids){for(const id of ids){const node=document.getElementById(id);let value=id==='reward-kind'?'balance':'available';Object.defineProperty(node,'value',{configurable:true,get:()=>value,set:next=>{value=next;}});}}

test('a card number is sealed on the device: the sync layer only ever sees an envelope and the last four digits',async()=>{
 const h=harness();const saved=[];
 const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first',secret:'',secretHint:''};
 const vault=fakeVault();
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault,
  offline:{request:async(t,p,o)=>{if(o?.method){saved.push(o.value);return {records:[{...o.value,revision:'next'}]};}return {records:[entry]};}}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);shim(h.document,['reward-kind','reward-state']);
 h.document.querySelector('#rewards-list button').click();
 $('reward-secret-number').value='4111 1111 1111 1111';$('reward-secret-expiry').value='12/28';
 $('reward-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));await settle(()=>saved.length===1);
 assert.equal(saved.length,1);
 const stored=saved[0];
 assert.equal(stored.secretHint,'1111');
 assert.equal(stored.secret.includes('4111'),false,'digits must never reach the sync layer');
 assert.equal(stored.secret.includes('1111'),false);
 assert.equal(JSON.parse(stored.secret).v,1);
 assert.equal(vault.prompts(),1,'sealing requires the vault key');
 tool.stop();h.restore();
});

test('a mistyped card number is refused before anything is sealed, and blank inputs keep the saved number',async()=>{
 const h=harness();const saved=[];
 const vault=fakeVault();
 const sealedEarlier=await sealSecret(await vault.key(),'one',{number:'4111111111111111',expiry:''});
 const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first',secret:sealedEarlier,secretHint:'1111'};
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault,
  offline:{request:async(t,p,o)=>{if(o?.method){saved.push(o.value);return {records:[{...o.value,revision:'next'}]};}return {records:[entry]};}}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);shim(h.document,['reward-kind','reward-state']);
 h.document.querySelector('#rewards-list button').click();
 $('reward-secret-number').value='4111111111111112';
 $('reward-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));await settle(()=>$('reward-form-status').textContent.includes('card number'));
 assert.equal(saved.length,0,'a failed check must not save');
 assert.match($('reward-form-status').textContent,/do not form a valid card number/);
 assert.equal($('reward-secret-number').value,'4111111111111112','input is preserved after a failure');
 // Leaving the fields blank keeps what is already stored rather than erasing it.
 $('reward-secret-number').value='';
 $('reward-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));await settle(()=>saved.length===1);
 assert.equal(saved.length,1);
 assert.equal(saved[0].secret,sealedEarlier);
 assert.equal(saved[0].secretHint,'1111');
 tool.stop();h.restore();
});

test('showing a number needs the vault; the list masks it until then and re-masks on lock',async()=>{
 const h=harness();
 const vault=fakeVault();
 const sealed=await sealSecret(await vault.key(),'one',{number:'4111111111111111',expiry:'12/28'});
 vault.lock();
 const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first',secret:sealed,secretHint:'1111'};
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault,
  offline:{request:async()=>({records:[entry]})}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 assert.match($('rewards-list').textContent,/•••• 1111/,'the last four are shown without unlocking');
 assert.equal($('rewards-list').textContent.includes('4111 1111'),false);
 const before=vault.prompts();
 [...h.document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Show number').click();
 await settle(()=>$('rewards-list').textContent.includes('4111 1111'));
 assert.equal(vault.prompts(),before+1,'revealing prompts the vault');
 assert.match($('rewards-list').textContent,/4111 1111 1111 1111 · exp 12\/28/);
 [...h.document.querySelectorAll('#vault-actions button')].find(b=>b.textContent==='Lock now').click();
 assert.equal($('rewards-list').textContent.includes('4111 1111'),false,'locking re-masks the number');
 tool.stop();h.restore();
});

test('the wallet syncs on its own: no refresh control, an empty wallet offers only Add a reward, and a queued change retries',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const h=harness();
 let records=[],syncs=0;
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async(token,path,options)=>{if(!options?.method)syncs++;return {records};}}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 const labels=()=>[...h.document.querySelectorAll('button')].map(button=>button.textContent);
 assert.equal(labels().some(label=>/refresh/i.test(label)),false,'no manual refresh control is offered');
 assert.deepEqual([...$('rewards-list').querySelectorAll('button')].map(b=>b.textContent),['Add a reward'],'the empty wallet offers one action');
 $('rewards-list').querySelector('button').click();
 assert.equal($('reward-editor').open,true,'the empty state opens the editor');
 // A change still waiting to reach the cloud retries without being asked; an
 // open editor is left alone so the retry cannot disturb typing.
 records=[{id:'one',name:'Synthetic',kind:'membership',source:'Example',value:'Member offers',state:'available',revision:'local:1',pending:true}];
 const queued=syncs;
 t.mock.timers.tick(60000);
 await settle(()=>syncs>queued,50).then(()=>assert.fail('an open editor is not interrupted'),()=>{});
 $('reward-cancel').click();
 await tool.refresh({quiet:true});
 const idle=syncs;
 t.mock.timers.tick(60000);
 await settle(()=>syncs>idle);
 assert.ok(syncs>idle,'the queued change retries on its own');
 tool.stop();h.restore();t.mock.timers.reset();
});
