import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountRewards} from '../src/rewards-tool.js';
import {sealSecret,openSecret} from '../src/secret-vault.js';
import {UNREAD_BALANCE} from '../src/balance-data.js';
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
 const $=id=>document.getElementById(id);for(const id of ['reward-kind','reward-state']){const node=$(id);let value=id==='reward-kind'?'balance':'available';Object.defineProperty(node,'value',{configurable:true,get:()=>value,set:next=>{value=next;}});}[...document.querySelectorAll('#rewards-list button')].find(b=>b.getAttribute('aria-label')==='Edit Synthetic').click();$('reward-name').value='Edited name';$('reward-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle(()=>$('reward-form-status').textContent);assert.equal($('reward-name').value,'Edited name');assert.match($('reward-form-status').textContent,/Storage unavailable/);
 $('reward-cancel').click();const remove=[...document.querySelectorAll('#rewards-list button')].find(b=>b.getAttribute('aria-label')==='Delete Synthetic');remove.click();assert.equal(deleted,0);const confirmation=[...document.querySelectorAll('#rewards-list button')].find(b=>b.textContent==='Delete reward');assert.equal(confirmation.closest('[hidden]'),null);fail=false;confirmation.click();await settle(()=>deleted===1);assert.equal(deleted,1);
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
 [...h.document.querySelectorAll('#rewards-list button')].find(b=>b.getAttribute('aria-label')==='Show the number for Synthetic').click();
 await settle(()=>$('rewards-list').textContent.includes('4111 1111'));
 assert.equal(vault.prompts(),before+1,'revealing prompts the vault');
 assert.match($('rewards-list').textContent,/4111 1111 1111 1111 · exp 12\/28/);
 assert.equal($('vault-status').textContent,'','an unlocked wallet reads its numbers rather than reporting that it is unlocked');
 assert.equal($('vault-detail').textContent,'');
 [...h.document.querySelectorAll('#vault-actions button')].find(b=>b.textContent==='Lock now').click();
 assert.equal($('rewards-list').textContent.includes('4111 1111'),false,'locking re-masks the number');
 assert.match($('vault-status').textContent,/passkey is required/,'locked, it says what is needed');
 tool.stop();h.restore();
});

test('the wallet syncs on its own: no refresh control, an empty wallet offers only Add a reward, and a queued change retries',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const h=harness();
 let records=[],syncs=0;
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  remote:async()=>({connections:[]}),
  offline:{request:async(token,path,options)=>{if(!options?.method)syncs++;return {records};}}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 const labels=()=>[...h.document.querySelectorAll('button')].map(button=>button.textContent);
 assert.equal(labels().some(label=>/refresh/i.test(label)),false,'no manual refresh control is offered');
 // Both ways in, on one row: naming a card is the fast one, so it leads.
 assert.deepEqual([...$('rewards-list').querySelectorAll('button')].map(b=>b.textContent),['Add a card','Add a reward'],'the empty wallet offers the two ways in');
 [...$('rewards-list').querySelectorAll('button')].find(b=>b.textContent==='Add a reward').click();
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

const CONNECTION='22222222-2222-4222-8222-222222222222';
const RESEARCHED={
 card:{name:'Synthetic Platinum Card (United States)',source:'Synthetic Bank',value:'5x flights, 1x everything else',url:'https://issuer.example/benefits',notes:'$895 annual fee'},
 benefits:[{kind:'benefit',name:'Ride credit',value:'$15 per month',state:'activation',cadence:'monthly',notes:'Enroll before using'},
  {kind:'membership',name:'Lounge access',value:'Priority Pass Select',state:'available',cadence:''}]
};
// A wallet that remembers what was written to it, so a saved card and the
// benefits filed under it can be read back the way the tool renders them.
function walletHost(h,{reply=RESEARCHED,connections=[{id:CONNECTION,name:'Synthetic',provider:'openai',hasApiKey:true}]}={}){
 const records=[],asked=[];
 const remote=async(token,path,options)=>{
  if(path==='/v1/ai-connections')return {connections};
  asked.push({path,value:options?.value});
  return reply;
 };
 const offline={request:async(token,path,options)=>{
  if(options?.method){
   const id=path.split('/').at(-1),index=records.findIndex(record=>record.id===id);
   const record={...options.value,revision:`r${records.length}`};
   if(options.method==='DELETE'){if(index>=0)records.splice(index,1);}
   else if(index>=0)records[index]=record;else records.push(record);
  }
  return {records:records.map(record=>({...record}))};
 }};
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),offline,remote});
 return {tool,records,asked};
}

test('naming a card brings back its benefits to review, and saving files them under the card',async()=>{
 const h=harness();
 const {tool,records,asked}=walletHost(h);
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 $('reward-card-name').value='amex platinum';
 $('reward-card-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
 await settle(()=>$('reward-card-review').textContent.includes('Lounge access'));
 // Only the name typed into the intake is sent; nothing already in the wallet is.
 // A saved connection answers without being asked for: the wallet never shows
 // a picker, and the card lookup still reaches the one connection there is.
 assert.deepEqual(asked,[{path:`/v1/ai-connections/${CONNECTION}/card-benefits`,value:{name:'amex platinum'}}]);
 assert.equal(h.document.getElementById('reward-card-connection'),null,'no connection picker is shown');
 // Every benefit is readable before any of it is saved, including what it costs
 // in attention: the reset period and the enrollment step.
 const review=$('reward-card-review').textContent;
 for(const text of ['Synthetic Platinum Card (United States)','$15 per month','Monthly','needs enrollment','Enroll before using','Priority Pass Select'])assert.match(review,new RegExp(text.replace(/[$()]/g,'\\$&')));
 assert.equal(records.length,0,'reviewing saves nothing');
 const save=[...$('reward-card-review').querySelectorAll('button')].find(b=>b.textContent.startsWith('Save'));
 assert.equal(save.textContent,'Save this card and 2 benefits');
 save.click();
 await settle(()=>records.length===3);
 const card=records.find(record=>record.kind==='card');
 assert.equal(card.name,RESEARCHED.card.name);
 assert.deepEqual(records.filter(record=>record.kind!=='card').map(record=>record.card),[card.id,card.id],'each benefit names the saved card');
 assert.equal($('reward-card-name').value,'','a saved card leaves the intake empty');
 assert.match($('reward-card-status').textContent,/Saved .* and 2 benefits/);
 // The wallet reads as one card with its benefits inside it, not as three rows.
 const group=$('rewards-list').querySelector('details');
 assert.equal(group.querySelector('summary strong').textContent,RESEARCHED.card.name);
 assert.equal(group.querySelector('summary .footnote').textContent,'Synthetic Bank · 2 benefits');
 assert.match(group.textContent,/Ride credit/);
 assert.match(group.textContent,/Monthly/);
 assert.equal($('rewards-list').querySelectorAll('details').length,1);
 // A benefit that needs enrolling is what Next actions is for.
 assert.match($('rewards-actions').textContent,/Ride credit/);
 tool.stop();h.restore();
});

test('a loose card name asks which card before researching one, and a failed save keeps the rest to retry',async()=>{
 const h=harness();
 const matches={matches:[{name:'Synthetic Blue Cash Everyday (United States)',note:'No annual fee'},{name:'Synthetic Blue Cash Preferred (United States)',note:'$95 annual fee'}]};
 let reply=matches;
 const records=[],asked=[];
 const remote=async(token,path,options)=>{
  if(path==='/v1/ai-connections')return {connections:[{id:CONNECTION,name:'Synthetic',provider:'openai',hasApiKey:true}]};
  asked.push(options.value.name);return reply;
 };
 let failFrom=null;
 const offline={request:async(token,path,options)=>{
  if(options?.method){
   if(failFrom&&options.value.name===failFrom)throw Error('Storage unavailable');
   records.push({...options.value,revision:`r${records.length}`});
  }
  return {records:records.map(record=>({...record}))};
 }};
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),offline,remote});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 $('reward-card-name').value='blue cash';
 $('reward-card-form').dispatchEvent(new h.window.Event('submit',{cancelable:true}));
 await settle(()=>$('reward-card-matches').textContent.includes('Preferred'));
 assert.match($('reward-card-status').textContent,/more than one card/);
 assert.equal($('reward-card-review').textContent,'','an unresolved name brings back nothing to save');
 reply=RESEARCHED;
 [...$('reward-card-matches').querySelectorAll('button')].find(b=>b.textContent.includes('Preferred')).click();
 await settle(()=>$('reward-card-review').textContent.includes('Ride credit'));
 // Choosing sends the exact product name, not the rough one typed in.
 assert.deepEqual(asked,['blue cash','Synthetic Blue Cash Preferred (United States)']);
 assert.equal($('reward-card-matches').textContent,'','the choice is made, so the alternatives go');
 // The second benefit fails to save: the card and the first stay saved, and what
 // is left is still on screen to save again.
 failFrom='Lounge access';
 [...$('reward-card-review').querySelectorAll('button')].find(b=>b.textContent.startsWith('Save')).click();
 await settle(()=>$('reward-card-review').textContent.includes('Save the remaining'));
 assert.deepEqual(records.map(record=>record.name),[RESEARCHED.card.name,'Ride credit']);
 assert.match($('reward-card-status').textContent,/Storage unavailable/);
 failFrom=null;
 [...$('reward-card-review').querySelectorAll('button')].find(b=>b.textContent.startsWith('Save')).click();
 await settle(()=>records.length===3);
 assert.deepEqual(records.map(record=>record.name),[RESEARCHED.card.name,'Ride credit','Lounge access']);
 assert.equal(records.filter(record=>record.kind==='card').length,1,'retrying does not save the card twice');
 tool.stop();h.restore();
});

test('a program’s offers are a tab of their own, with their own search and a category filter',async()=>{
 const h=harness();
 const catalog={id:'ms-reserved',programId:'ms-reserved',label:'Morgan Stanley Reserved',complete:true,
  listedAt:'2026-09-11T00:00:00.000Z',readAt:'2026-09-11T00:00:00.000Z',
  offers:[
   {key:'/offer/sixt',name:'SIXT',category:'Travel',badge:'Limited-Time Offer',dates:'',summary:'Save up to 20% off car rentals.',firstSeenAt:'2020-01-01T00:00:00.000Z'},
   {key:'/offer/lg',name:'LG',category:'Home',badge:'New',dates:'',summary:'10% off major appliances.',firstSeenAt:'2020-01-01T00:00:00.000Z'}]};
 const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first'};
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async()=>({records:[entry]})},
  programs:{request:async()=>({records:[catalog]})}});
 await tool.refresh();
 const $=id=>h.document.getElementById(id);
 // The offers themselves, not the headings they now sit under: a catalogue is
 // grouped by category, so a group's own name is a `strong` in this list too.
 const names=()=>[...h.document.querySelectorAll('#programs-list .record-name')].map(node=>node.textContent);
 const groups=()=>[...h.document.querySelectorAll('#programs-list details.reward-group')]
  .map(node=>node.querySelector('summary strong').textContent);
 await settle(()=>names().length===2);
 assert.deepEqual(names(),['LG','SIXT']);
 // Neither offer is new, so there is no New group and the categories are the list.
 assert.deepEqual(groups(),['Home','Travel']);
 assert.equal($('programs-status').textContent,'Morgan Stanley Reserved · 2 offers · read 2026-09-11');
 // A catalogue that has been read is a tab; the wallet keeps the lead, because
 // offers arriving is not the owner asking for them.
 assert.equal($('rewards-tabs-offers-tab').hidden,false);
 assert.equal($('rewards-tabs-wallet-tab').getAttribute('aria-selected'),'true');
 $('rewards-tabs-offers-tab').click();
 assert.equal($('rewards-tabs-offers-panel').hidden,false);
 assert.equal($('rewards-tabs-wallet-panel').hidden,true,'one at a time');
 const row=()=>[...h.document.querySelectorAll('#programs-list section')].find(node=>node.textContent.includes('SIXT'));
 // Under the heading that names the category, the row qualifies itself with
 // what the heading does not already say.
 assert.match(row().textContent,/Limited-Time Offer/);
 assert.doesNotMatch(row().textContent,/Travel/,'the group is already called Travel');
 assert.match(row().textContent,/Save up to 20% off car rentals\./);
 assert.equal(row().querySelector('a').getAttribute('href'),'https://msreserved.com/offer/sixt');

 // One filter per list: this one narrows what is on offer, and the wallet's own
 // search narrows what is held.
 $('programs-search').value='appliances';
 $('programs-search').dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.deepEqual(names(),['LG']);
 assert.deepEqual(groups(),[],'a search has already narrowed the list, so there is nothing to open through');
 // Results span categories, so here the category is what tells them apart.
 assert.match([...h.document.querySelectorAll('#programs-list section')][0].textContent,/New · Home/);
 assert.equal($('programs-status').textContent,'Morgan Stanley Reserved · 1 of 2 offers · read 2026-09-11');
 $('rewards-search').value='nothing in the wallet matches this';
 $('rewards-search').dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.deepEqual(names(),['LG'],'the wallet’s search leaves the offers alone');
 $('rewards-search').value='';
 $('programs-search').value='';
 $('programs-search').dispatchEvent(new h.window.Event('input',{bubbles:true}));

 const picker=$('programs-category');
 assert.deepEqual([...picker.options].map(option=>option.textContent),['All categories','Home','Travel']);
 picker.value='Travel';
 picker.dispatchEvent(new h.window.Event('change',{bubbles:true}));
 assert.deepEqual(names(),['SIXT']);
 assert.deepEqual(groups(),[],'and neither has a chosen category');
 assert.doesNotMatch(row().textContent,/Travel/,'the picker above the list already says Travel');

 // Nothing read yet means no tab at all, rather than an empty one.
 tool.clear();
 assert.equal($('rewards-tabs-offers-tab').hidden,true);
 assert.equal($('rewards-tabs-wallet-panel').hidden,false,'the reader is handed back to the wallet, not to a blank panel');
 assert.equal(names().length,0);
 tool.stop();h.restore();
});

test('a host with no catalogue store has no offers tab, and a failed load is not an error the owner must act on',async()=>{
 const h=harness();
 const entry={id:'one',name:'Synthetic',kind:'balance',source:'Example',value:'5 points',state:'available',revision:'first'};
 const bare=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async()=>({records:[entry]})}});
 await bare.refresh();
 const $=id=>h.document.getElementById(id);
 assert.equal($('rewards-tabs-offers-tab').hidden,true,'a host that cannot hold a catalogue does not show an empty tab');
 assert.equal(h.document.querySelector('#rewards-tabs .tabs-list').hidden,true,'and one tab is not a choice, so the row is not drawn');
 assert.equal($('programs-list').children.length,0);
 bare.stop();

 const second=harness();
 const tool=mountRewards(second.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async()=>({records:[entry]})},
  programs:{request:async()=>{throw Error('Cloud unavailable.');}}});
 await tool.refresh();
 const status=second.document.getElementById('programs-status');
 assert.equal(status.textContent,'');
 assert.equal(second.document.getElementById('rewards-tabs-offers-tab').hidden,true);
 assert.equal(second.document.getElementById('rewards-status').textContent,'','the wallet does not report a catalogue’s failure as its own');
 tool.stop();second.restore();h.restore();
});

// A balance is read down one column of programs and one of figures, so each is
// one line: the issuer belongs to the program's name rather than to a line of
// its own under it, "Available" is what every row in the wallet is and so says
// nothing, and a program never read prints no figure instead of three words
// where the number goes.
test('a balance reads as one line: the program, then what is in it',async()=>{
 const h=harness();
 const records=[
  {id:'a',kind:'balance',name:'Bonvoy',source:'Marriott',value:'131,581 points',state:'available',card:'',cadence:'',due:'',notes:'',secret:'',secretHint:'',revision:'r1'},
  {id:'b',kind:'balance',name:'Hilton Honors',source:'Hilton',value:'82,400 points',state:'available',card:'',cadence:'',due:'',notes:'',secret:'',secretHint:'',revision:'r2'},
  {id:'c',kind:'balance',name:'MileagePlus',source:'United Airlines',value:UNREAD_BALANCE,state:'available',card:'',cadence:'',due:'',notes:'',secret:'',secretHint:'',revision:'r3'}
 ];
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async()=>({records})}});
 await tool.refresh();
 const rows=[...h.document.querySelectorAll('#rewards-list .record-row')];
 assert.deepEqual(rows.map(row=>row.querySelector('.record-name').textContent),
  ['Marriott Bonvoy','Hilton Honors','United Airlines MileagePlus'],'the issuer joins the name only where the name does not already carry it');
 assert.deepEqual(rows.map(row=>row.querySelector('.record-figure > strong')?.textContent??''),
  ['131,581 points','82,400 points',''],'a program awaiting its first reading shows no figure');
 for(const row of rows)assert.equal([...row.children].filter(node=>!node.hidden).length,1,'nothing is left to print under the line');
 const wallet=h.document.getElementById('rewards-list').textContent;
 assert.equal(wallet.includes('Available'),false,'the resting state of every row states nothing');
 assert.equal(wallet.includes(UNREAD_BALANCE),false);
 tool.stop();h.restore();
});

// The wallet is the list of programs and cards the owner is in, so every row
// in it reaches the page it is on: a link the owner typed, and otherwise the
// page the registries already hold for that program or that institution.
test('every row in the wallet reaches the page it is on',async()=>{
 const h=harness();
 const entry=(id,fields)=>({id,state:'available',card:'',cadence:'',due:'',url:'',notes:'',secret:'',secretHint:'',revision:id,...fields});
 const records=[
  entry('a',{kind:'balance',name:'Bonvoy',source:'Marriott',value:'131,581 points'}),
  entry('b',{kind:'balance',name:'MileagePlus',source:'United Airlines',value:'488,302 miles'}),
  // A link of the owner's own is theirs, and outranks the registry's.
  entry('c',{kind:'balance',name:'Guest Rewards',source:'Amtrak',value:'9,400 points',url:'https://example.invalid/mine'}),
  entry('d',{kind:'card',name:'Platinum Card',source:'American Express',value:'5x flights'}),
  // A credit is used on the card that carries it, so it goes where the card does.
  entry('e',{kind:'benefit',name:'Ride credit',source:'Amex Platinum',value:'$15 per month',card:'d'}),
  // Nothing here knows where a lounge membership is kept.
  entry('f',{kind:'membership',name:'Priority Pass Select',source:'Lounge access',value:'Member'})
 ];
 const tool=mountRewards(h.document.querySelector('main'),{credentials:{get:async()=>'token'},vault:fakeVault(),
  offline:{request:async()=>({records})}});
 await tool.refresh();
 const linkOf=name=>[...h.document.querySelectorAll('#rewards-list a.row-action')]
  .find(link=>link.getAttribute('aria-label')===`Open the site for ${name}`)?.getAttribute('href')??'';
 assert.equal(linkOf('Bonvoy'),'https://www.marriott.com/loyalty/myAccount/default.mi');
 assert.equal(linkOf('MileagePlus'),'https://www.united.com/en/us/myunited');
 assert.equal(linkOf('Guest Rewards'),'https://example.invalid/mine');
 assert.equal(linkOf('Platinum Card'),'https://global.americanexpress.com/dashboard');
 assert.equal(linkOf('Ride credit'),'https://global.americanexpress.com/dashboard');
 assert.equal(linkOf('Priority Pass Select'),'','a row nothing recognizes carries no link rather than a guess');
 tool.stop();h.restore();
});
