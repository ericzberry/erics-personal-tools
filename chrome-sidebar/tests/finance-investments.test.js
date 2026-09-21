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
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){
    for(const option of this.options)if(option.value!==value)option.selected=false;
    for(const option of this.options)if(option.value===value)option.selected=true;
  }});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
const TRUST='Berry Family Trust';
const trust={id:'p1',row:'portfolio',revision:'r1',number:1,name:TRUST,kind:5,currency:'USD'};
// One quarterly capital account, as a fund's statement states it: the four
// figures that belong together, and the vehicle the paperwork calls itself.
const STATEMENT={readings:[],unread:'',capital:[{
  fund:'Acme Ventures Fund III, L.P.',vehicle:'fund',holder:TRUST,asOf:'2026-06-30',
  value:1100000,commitment:1000000,contributed:800000,distributed:250000,
  confidence:'high',reason:'Q2 capital account statement.'}]};

function financeHost(document,{saved=[],reading=STATEMENT}={}){
  const writes=[];
  let records=[...saved];
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},
    readPage:async()=>({text:'Acme Ventures Fund III, L.P.',host:'files.example',title:'Statement',trimmed:0,tables:1}),
    remote:async(token,path)=>path==='/v1/ai-connections'
      ?{connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]}
      :reading,
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
const ready=document=>settle(()=>document.getElementById('finance-list').textContent.includes('No figures yet')||document.getElementById('finance-list').querySelector('.record-group,.record-row'));
const press=(document,id)=>document.getElementById(id).dispatchEvent(new document.defaultView.Event('click'));
const buttonNamed=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);

// The whole errand Eric asked for: a capital account statement goes in, the
// investment it belongs to comes out, and what it cost is on the screen beside
// what it is worth.
test('a capital account statement is read into an investment, reviewed, and saved as a position',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[trust]});
  await ready(document);

  press(document,'finance-page-read');
  // Read off the page, so the review is in the page's own block rather than
  // one heading down under a different scope.
  await settle(()=>document.getElementById('finance-capital-page').textContent.includes('Acme'));
  assert.equal(document.getElementById('finance-capital-drafts').textContent,'');
  const review=document.getElementById('finance-capital-page');
  assert.equal(document.getElementById('finance-snapshot-status').textContent,'','a reading that found something shows it rather than counting it');
  // What is shown is what would be saved: where it lands, what it is worth,
  // and the three flows a value on its own cannot explain.
  assert.match(review.textContent,/Acme Ventures Fund III, L\.P\./);
  assert.match(review.textContent,/\$1,100,000/);
  assert.match(review.textContent,new RegExp(`${TRUST} · Fund · new investment · as of 2026-06-30`));
  assert.match(review.textContent,/Commitment\$1,000,000Funded\$800,000Returned\$250,000Unfunded\$200,000Multiple1\.69×/);
  assert.equal(writes.length,0,'nothing is written by reading');

  buttonNamed(review,'Save').dispatchEvent(new document.defaultView.Event('click'));
  await settle(()=>writes.length>=2);
  // The investment is saved before the statement, because a capital account
  // cannot be filed into something that does not exist yet.
  assert.deepEqual(writes.map(write=>write.row),['holding','capital']);
  assert.deepEqual([writes[0].id,writes[0].name,writes[0].portfolio,writes[0].vehicle,writes[0].stated],
    ['h1','Acme Ventures Fund III, L.P.',1,1,1]);
  assert.deepEqual([writes[1].id,writes[1].value,writes[1].contributed,writes[1].distributed,writes[1].commitment],
    ['h1-20260630',1100000,800000,250000,1000000]);

  await settle(()=>document.getElementById('finance-list').textContent.includes('Acme'));
  assert.equal(document.getElementById('finance-capital-page').textContent,'','a saved review is gone');
  assert.equal(document.getElementById('finance-capital-drafts').textContent,'');
  // Saving reports where the review was, not where capital reviews usually are.
  assert.match(document.getElementById('finance-snapshot-status').textContent,/Saved 1 capital account\./);
  assert.equal(document.getElementById('finance-intake-status').textContent,'');
  const list=document.getElementById('finance-list').textContent;
  // A position is read inside one Private investments line, like a house
  // inside Real estate: its own name, with no vehicle word run onto it. UI-41.
  assert.match(list,/Private investments\$1,100,000Acme Ventures Fund III, L\.P\.\$1,100,000/);
  assert.equal(list.includes('L.P. · Fund'),false,'the vehicle is not run onto the name');
  const inside=document.querySelector('#finance-list .position-detail');
  assert.equal(inside.hidden,true,'the positions wait behind their line');
  [...document.querySelectorAll('#finance-list button')]
    .find(node=>node.getAttribute('aria-label')?.startsWith('Show the private investments')).click();
  assert.equal(inside.hidden,false);
  // A figure to a line, named beside it, rather than one run-on sentence. UI-41.
  const names=[...document.querySelectorAll('#finance-list .figure-list-name')].map(node=>node.textContent);
  assert.deepEqual(names,['Commitment','Funded','Returned','Unfunded','Multiple']);
  assert.equal(list.includes('Funded $800,000 ·'),false,'the figures are not run together');
  assert.match(list,/Commitment\$1,000,000Funded\$800,000Returned\$250,000Unfunded\$200,000Multiple1\.69×/);
  // It counts like any other figure. What is still owed on the commitment is
  // not a total of the ledger — it is neither held nor owed today — so it is
  // read against the commitment, in the private investments set out side by
  // side, and never up in the totals.
  assert.match(document.getElementById('finance-totals').textContent,/Net\$1,100,000/);
  assert.equal(document.getElementById('finance-totals').textContent.includes('Unfunded'),false,
    'unfunded is a fifth total again; it belongs beside the commitment it is owed on');
  const positions=document.getElementById('finance-positions-panel');
  assert.equal(positions.hidden,false);
  assert.match(positions.querySelector('.overview-title').textContent,/Private investments/);
  const unfunded=[...positions.querySelectorAll('.overview-row:not(.overview-row--head) [data-label=Unfunded]')].map(cell=>cell.textContent);
  assert.deepEqual(unfunded,['$200,000']);
  // A class line carries its own share of what is held, between the class
  // and the amount.
  assert.match(document.getElementById('finance-breakdown').textContent,/Fund investments100%\$1,100,000/);
  tool.stop();restore();
});

// UI-42. Dropping a statement is asking for it to be read, so it is read the
// moment it arrives. "Read this" used to sit under the figures it had already
// read, beside a "Ready to read." line that was no longer true; now the button
// exists only for a file that could not be read, and the file leaves with its
// review. UI-43: the review's own verbs stand alone.
test('a dropped statement is read on arrival, and never offers to be read again',async()=>{
  const {document,restore}=setup();
  const writes=[];
  let records=[trust],asked=0,fail=true;
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},
    remote:async(token,path)=>{
      if(path==='/v1/ai-connections')return {connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]};
      asked++;
      if(fail)throw Error('The reading timed out.');
      return STATEMENT;
    },
    offline:{request:async(token,path,options)=>{
      if(options?.method==='PUT'){
        writes.push(options.value);
        records=[...records.filter(record=>record.id!==options.value.id),{...options.value,revision:'r2'}];
      }
      return {records};
    }}
  });
  await ready(document);
  const $=id=>document.getElementById(`finance-${id}`);
  const drop=new document.defaultView.Event('drop');
  drop.dataTransfer={files:[new File(['Acme Ventures Fund III, L.P. capital account, Q2 2026'],'Acme Q2.txt')]};
  $('drop').dispatchEvent(drop);
  await settle(()=>$('intake-status').classList.contains('notice--error'));
  assert.equal(asked,1,'read without a press');
  assert.equal($('file-status').textContent,'','no line saying it is ready to read');
  // A reading that failed is the one case with something to press, because
  // trying again is the remedy.
  assert.equal($('read-actions').hidden,false);
  assert.deepEqual([...$('read-actions').querySelectorAll('button')].map(node=>node.textContent),['Read']);

  fail=false;
  press(document,'finance-read');
  await settle(()=>$('capital-drafts').textContent.includes('Acme'));
  assert.equal(asked,2);
  assert.equal($('read-actions').hidden,true,'a file that has been read does not offer to be read again');
  assert.match($('attachment').textContent,/Acme Q2\.txt/,'the file stays beside what was read from it');
  const review=$('capital-drafts');
  assert.deepEqual([...review.querySelectorAll('button')].map(node=>node.textContent),['Save','Edit','Discard']);

  buttonNamed(review,'Save').dispatchEvent(new document.defaultView.Event('click'));
  await settle(()=>writes.length>=2&&$('attachment').hidden);
  assert.equal($('attachment').textContent,'','a saved statement takes its file with it');
  assert.equal($('read-actions').hidden,true);
  assert.match($('intake-status').textContent,/Saved 1 capital account\./);
  tool.stop();restore();
});

// A statement addressed to a trust the ledger has never heard of proposes the
// trust rather than dropping the statement into whatever is nearest.
test('a statement for an unknown holder proposes the portfolio, and saves it first',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[],reading:{...STATEMENT,
    capital:[{...STATEMENT.capital[0],holder:'Maisie Ava Berry 2021 Irrevocable Trust'}]}});
  await ready(document);
  press(document,'finance-page-read');
  await settle(()=>document.getElementById('finance-capital-page').textContent.includes('Acme'));
  assert.match(document.getElementById('finance-capital-page').textContent,/Maisie Ava Berry 2021 Irrevocable Trust · new portfolio/);

  buttonNamed(document.getElementById('finance-capital-page'),'Save').dispatchEvent(new document.defaultView.Event('click'));
  await settle(()=>writes.length>=3);
  assert.deepEqual(writes.map(write=>write.row),['portfolio','holding','capital']);
  // Its name said it was a trust, so it was proposed as one.
  assert.deepEqual([writes[0].name,writes[0].kind],['Maisie Ava Berry 2021 Irrevocable Trust',5]);
  assert.equal(writes[1].portfolio,writes[0].number);
  tool.stop();restore();
});

// An investment signed this morning has no statement behind it yet, and that is
// a whole record. Figures without the date they are as of are not.
test('an investment can be recorded by hand, with or without a statement behind it',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[trust]});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  set('finance-inv-name','Celsie Co-Invest SPV I');
  set('finance-inv-vehicle','3');
  set('finance-inv-commitment','250000');
  set('finance-inv-asOf','');
  document.getElementById('finance-inv-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>document.getElementById('finance-inv-status').textContent.includes('date'));
  assert.match(document.getElementById('finance-inv-status').textContent,/Give the date these figures are as of/);
  assert.equal(writes.length,0);

  set('finance-inv-commitment','');
  document.getElementById('finance-inv-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=1);
  assert.deepEqual(writes.map(write=>write.row),['holding'],'a commitment not yet drawn on is the investment alone');
  assert.deepEqual([writes[0].name,writes[0].vehicle,writes[0].portfolio],['Celsie Co-Invest SPV I',3,1]);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Celsie'));
  assert.match(document.getElementById('finance-list').textContent,/no statement yet/);
  tool.stop();restore();
});

// Shares bought in a company once are not a fund. The owner picked Direct
// Equity and was still asked for a commitment and a capital account, filed
// under Fund investments: the kind decides which figures are asked for, what
// they are called, and the class a new one starts in.
test('a direct equity investment asks for what was invested and what it is worth, and no commitment',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[trust]});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  const shown=id=>!document.getElementById(id).closest('.form-field').hidden;
  const label=id=>document.querySelector(`label[for="${id}"]`).textContent;
  assert.ok(shown('finance-inv-commitment')&&shown('finance-inv-unfunded'));
  set('finance-inv-commitment','500000');
  set('finance-inv-vehicle','2');
  document.getElementById('finance-inv-vehicle').dispatchEvent(new document.defaultView.Event('change'));
  assert.ok(!shown('finance-inv-commitment')&&!shown('finance-inv-unfunded'));
  assert.deepEqual(['finance-inv-value','finance-inv-funded','finance-inv-returned'].map(label),
    ['Current value','Amount invested','Proceeds received']);
  assert.equal(document.getElementById('finance-inv-class').value,'14','a company stake is Private stock, not a fund');

  set('finance-inv-name','Rhythmic Technologies Inc');
  set('finance-inv-value','40000');
  set('finance-inv-funded','25000');
  set('finance-inv-asOf','2026-09-21');
  document.getElementById('finance-inv-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=2);
  assert.deepEqual([writes[0].vehicle,writes[0].class],[2,14]);
  assert.deepEqual([writes[1].value,writes[1].contributed,writes[1].commitment],[40000,25000,0],
    'a commitment typed before the kind changed is not saved');
  await settle(()=>document.getElementById('finance-list').textContent.includes('Rhythmic'));
  assert.match(document.getElementById('finance-list').textContent,/Invested\$25,000/);
  assert.ok(shown('finance-inv-commitment'),'the next new investment starts as a fund again');
  tool.stop();restore();
});

// The second holder of a general partner. Eric holds part of Averin's GP and a
// trust holds the rest, and Carta states one capital account for the vehicle —
// so the trust's position is mapped onto the one already held and asks for no
// figures of its own. Whatever Carta says next reaches both.
test('a second holder maps onto the vehicle already held and takes its figures from there',async()=>{
  const {document,restore}=setup();
  const estate={id:'p2',row:'portfolio',revision:'r1',number:2,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
  const gp={id:'h1',row:'holding',revision:'r1',number:1,portfolio:2,
    name:'Averin Health Opportunities GP I LLC',vehicle:1,class:4,stated:0,share:3500,follows:0};
  const account={id:'h1-20260920',row:'capital',revision:'r1',holding:1,asOf:'2026-09-20',
    value:850000,contributed:850000,distributed:0,commitment:2119150};
  const {tool,writes}=financeHost(document,{saved:[trust,estate,gp,account]});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  const follows=document.getElementById('finance-inv-follows');
  // The field is there because there is a vehicle to point at, and it offers
  // the one that holds its own statements.
  assert.equal(document.getElementById('finance-inv-follows-field').hidden,false);
  assert.deepEqual([...follows.options].map(option=>option.textContent),
    ['Its own statements','Averin Health Opportunities GP I LLC · Eric and Ariana Berry Estate']);
  assert.equal(document.getElementById('finance-inv-figures').hidden,false);

  set('finance-inv-name','Averin Health Opportunities GP I LLC');
  set('finance-inv-portfolio','p1');
  set('finance-inv-share','65');
  follows.value='1';
  follows.dispatchEvent(new document.defaultView.Event('change'));
  // Mapped onto a vehicle, the boxes that would ask for its figures are gone:
  // they are the vehicle's, filed once, and a second copy is what this exists
  // to avoid.
  assert.equal(document.getElementById('finance-inv-figures').hidden,true);

  document.getElementById('finance-inv-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=1);
  assert.deepEqual(writes.map(write=>write.row),['holding'],'no second capital account is written');
  assert.equal(writes[0].follows,1);
  assert.equal(writes[0].share,6500);
  assert.equal(writes[0].portfolio,1);

  // And it reads the vehicle's statement at its own share, without a figure
  // having been typed against it.
  await settle(()=>document.getElementById('finance-list').textContent.includes('65%'));
  const list=document.getElementById('finance-list').textContent;
  assert.match(list,/Share of vehicle65%/);
  assert.match(list,/\$552,500/);
  assert.match(list,/\$297,500/,'and the position it was mapped onto is unchanged');
  tool.stop();restore();
});
