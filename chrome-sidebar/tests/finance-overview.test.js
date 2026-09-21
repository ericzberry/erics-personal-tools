import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {markRef,capitalRef,holdingRef,propertyRef,valuationRef} from '../src/finance-data.js';
import {niceTicks,ProportionBar,share} from '../src/components/charts.js';
import {moneyShort} from '../src/money.js';
import {travelChanges} from '../src/travel-changes.js';
import {openFinanceDetails} from '../src/finance-page.js';

// The ledger's own page: what the side panel's Open details goes to, and what
// the phone shows as Finance. These hold what the page says, not how it looks.
const settle=async(check,attempts=500)=>{
  for(let i=0;i<attempts;i++){await new Promise(resolve=>setTimeout(resolve,1));if(check())return;}
  throw Error('Timed out waiting for the page to settle.');
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
  // Through the attribute: linkedom reads a selection from it, and an option
  // made with createElement ignores the property.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){
    for(const option of this.options){if(option.value===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');}
  }});
  return ()=>Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);
}
let restore=()=>{};
const setup=()=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  restore();restore=selectValues(window);
  return document;
};
const portfolio=(number,name,kind)=>({id:`p${number}`,row:'portfolio',revision:'r1',number,name,kind,currency:'USD'});
const mark=(portfolio,cls,asOf,amount)=>{const value={row:'mark',portfolio,class:cls,asOf,amount};return {...value,id:markRef(value),revision:String(amount)};};
const holding=(number,portfolio,name,vehicle,cls)=>({id:holdingRef(number),row:'holding',revision:'r1',number,portfolio,name,vehicle,class:cls,stated:0,share:10000,follows:0});
const capital=entry=>({unfunded:null,...entry,row:'capital',id:capitalRef(entry),revision:'r1'});
const property=(number,portfolio,name)=>({id:propertyRef(number),row:'property',revision:'r1',number,portfolio,name,link:''});
const valuation=entry=>({...entry,row:'valuation',id:valuationRef(entry),revision:'r1'});
const page=(document,records,options={})=>mountFinance(document.querySelector('main'),{
  vault:unlockedVault(),credentials:{get:async()=>'token'},remote:async()=>({connections:[]}),
  offline:{request:async()=>({records})},...options});

const HELD=[
  portfolio(1,'Eric and Ariana Berry Estate',1),portfolio(2,'Berry Holdings LLC',6),
  mark(1,10,'2026-09-20',1000000),mark(1,3,'2026-09-20',250000),
  holding(1,1,'Vantage Point Partners Fund IV, L.P.',1,4),
  capital({holding:1,asOf:'2026-09-20',value:1100000,contributed:800000,distributed:250000,commitment:1000000}),
  holding(2,2,'Northwind Robotics, Inc. Series B Preferred',2,14),
  capital({holding:2,asOf:'2026-09-20',value:880000,contributed:250000,distributed:0,commitment:0}),
  property(1,2,'41 Undermountain Road, Sheffield, MA 01257'),
  valuation({property:1,asOf:'2026-09-20',value:1200000,debt:600000,source:1})
];

test('axis ticks are round numbers that hold every point',()=>{
  assert.deepEqual(niceTicks(31336083,33880819),[31000000,32000000,33000000,34000000]);
  assert.deepEqual(niceTicks(0,100),[0,25,50,75,100]);
  const flat=niceTicks(500,500);
  assert.ok(flat[0]<500&&flat.at(-1)>500,'one reading still gets an axis around it');
});

test('a figure at a glance is shortened, and what is owed keeps its parentheses',()=>{
  assert.equal(moneyShort(82410337),'$82.4M');
  assert.equal(moneyShort(-1234567),'($1.2M)');
  assert.equal(moneyShort(950000),'$950K');
  assert.equal(moneyShort(640),'$640.00','nothing to shorten under a thousand');
  assert.equal(share(0.004),'<1%');assert.equal(share(0),'0%');assert.equal(share(0.615),'62%');
});

test('a bar of parts sizes each part by its value, and runs are kept apart',()=>{
  setup();
  const bar=ProportionBar({runs:[
    {tone:'liquid',parts:[{key:'a',label:'Cash',value:300},{key:'b',label:'Stocks',value:100}]},
    {tone:'illiquid',parts:[{key:'c',label:'Funds',value:100},{key:'d',label:'Nothing',value:0}]}
  ]});
  const runs=[...bar.querySelectorAll('.proportion-run')];
  assert.deepEqual(runs.map(run=>run.getAttribute('style')),['flex-grow:800.00','flex-grow:200.00']);
  assert.equal(bar.querySelectorAll('.proportion-part').length,3,'a part worth nothing draws nothing');
  assert.match(bar.querySelector('[data-key=a]').getAttribute('title'),/Cash · 300 · 60%/);
});

test('the page leads with the figure, and draws a line only once two full quarters stand behind it',async()=>{
  const document=setup();
  const tool=page(document,HELD);
  await settle(()=>document.getElementById('finance-totals'));
  const totals=document.getElementById('finance-totals');
  assert.ok(totals.querySelector('.figure-value--hero'),'the net is the page’s headline figure');
  assert.match(totals.textContent,/^Net\$3,830,000As of2026-09-20Assets\$4,430,000Liabilities\(\$600,000\)$/);
  assert.equal(document.querySelector('.line-chart'),null,'one quarter is a figure, not a line');
  tool.stop();

  // A year on: the same ledger read at the end of each quarter.
  const later=[...HELD,...['2026-12-31','2027-03-31'].flatMap((asOf,index)=>[
    mark(1,10,asOf,1000000+(index+1)*100000),mark(1,3,asOf,250000),
    capital({holding:1,asOf,value:1100000,contributed:800000,distributed:250000,commitment:1000000}),
    capital({holding:2,asOf,value:880000,contributed:250000,distributed:0,commitment:0}),
    valuation({property:1,asOf,value:1200000,debt:600000,source:1})])];
  document.querySelector('main').replaceChildren();
  const year=page(document,later);
  await settle(()=>document.querySelector('.line-chart'));
  const points=[...document.querySelectorAll('.line-chart-point')].map(point=>point.getAttribute('aria-label'));
  assert.deepEqual(points,['2026 Q3 · $3,830,000','2026 Q4 · $3,930,000 · $100,000 higher than 2026 Q3',
    '2027 Q1 · $4,030,000 · $100,000 higher than 2026 Q4']);
  assert.match(document.getElementById('finance-totals').textContent,/\$100,000 higher than 2026 Q4/,
    'what the last quarter did is said in words beside the figure');
  // The table stays: the line is a picture of it, not a replacement for it.
  assert.equal(document.querySelectorAll('#finance-trend .trend-row').length,3);
  year.stop();
});

test('where the money is reads as what can be sold this week, class by class',async()=>{
  const document=setup();
  const tool=page(document,HELD);
  await settle(()=>document.querySelector('#finance-breakdown .allocation'));
  const columns=[...document.querySelectorAll('#finance-breakdown .allocation-column')];
  assert.deepEqual(columns.map(column=>column.getAttribute('aria-label')),['Liquid','Illiquid','Account types']);
  assert.deepEqual([...columns[0].querySelectorAll('.allocation-line:not(.allocation-line--group) .allocation-name')].map(node=>node.textContent),
    ['Liquid securities','Cash']);
  assert.deepEqual([...columns[1].querySelectorAll('.allocation-line:not(.allocation-line--group) .allocation-name')].map(node=>node.textContent),
    ['Real estate','Fund investments','Private stock'],'the biggest class leads its side');
  // What is owed is not a part of what is held.
  assert.equal(document.getElementById('finance-breakdown').textContent.includes('Mortgage'),false);
  // The bar and the list name the same parts, so pointing at one marks both.
  const keys=[...document.querySelectorAll('#finance-breakdown .proportion-part')].map(part=>part.dataset.key);
  const named=[...document.querySelectorAll('#finance-breakdown .allocation-line[data-key]')].map(line=>line.dataset.key);
  assert.deepEqual(keys,named);
  tool.stop();
});

test('private positions sit side by side, and a kind with no commitment prints none',async()=>{
  const document=setup();
  const tool=page(document,HELD);
  await settle(()=>!document.getElementById('finance-positions-panel').hidden);
  const rows=[...document.querySelectorAll('#finance-positions .overview-row:not(.overview-row--head)')];
  const cells=row=>Object.fromEntries([...row.querySelectorAll('[data-label]')].map(cell=>[cell.dataset.label,cell.textContent]));
  // Biggest first.
  assert.match(rows[0].textContent,/Vantage Point/);
  assert.deepEqual(cells(rows[0]),{Committed:'$1,000,000',Funded:'$800,000',Returned:'$250,000',Unfunded:'$200,000',Value:'$1,100,000',Multiple:'1.69×'});
  assert.match(rows[0].querySelector('.overview-meta').textContent,/^Eric and Ariana Berry Estate · Fund$/);
  assert.equal(rows[0].querySelector('.called-fill').getAttribute('style'),'width:80.0%','four-fifths of the commitment called');
  // Shares bought once have no commitment, and say so with a dash, and name
  // their flows the way the owner does.
  assert.deepEqual(cells(rows[1]),{Committed:'—',Invested:'$250,000',Proceeds:'—',Unfunded:'—',Value:'$880,000',Multiple:'3.52×'});
  assert.equal(rows[1].querySelector('.called-track'),null);
  const total=cells(rows[2]);
  assert.equal(total.Value,'$1,980,000');
  assert.equal(total.Multiple,'2.12×','what every dollar put in has become, across them all');
  // A row's own verb opens its record where it is edited.
  rows[0].querySelector('button[aria-label^="Edit Vantage"]').click();
  await settle(()=>document.getElementById('finance-inv-name').value==='Vantage Point Partners Fund IV, L.P.');
  assert.equal(document.getElementById('finance-tabs-add-tab').getAttribute('aria-selected'),'true');
  tool.stop();
});

test('a house is its value, what is owed on it, and what is left',async()=>{
  const document=setup();
  const tool=page(document,HELD);
  await settle(()=>!document.getElementById('finance-properties-panel').hidden);
  const row=document.querySelector('#finance-properties .overview-row:not(.overview-row--head)');
  const cells=Object.fromEntries([...row.querySelectorAll('[data-label]')].map(cell=>[cell.dataset.label,cell.textContent]));
  assert.deepEqual(cells,{Value:'$1,200,000',Owed:'($600,000)',Equity:'$600,000','As of':'2026-09-20'});
  assert.ok(row.querySelector('[data-label=Owed] .amount--negative'),'what is owed is read as owed');
  assert.equal(document.querySelector('#finance-properties .overview-row--total'),null,'a total of one house is that house again');
  tool.stop();
});

test('Open details brings the page already open to the front instead of opening another',async()=>{
  const calls=[];
  const api=contexts=>({
    runtime:{getURL:path=>`chrome-extension://abc/${path}`,getContexts:async()=>contexts},
    tabs:{update:async(id,value)=>calls.push(['update',id,value]),create:async value=>calls.push(['create',value])},
    windows:{update:async(id,value)=>calls.push(['focus',id,value])}
  });
  await openFinanceDetails(api([{tabId:7,windowId:2,documentUrl:'chrome-extension://abc/finance.html'}]));
  assert.deepEqual(calls,[['update',7,{active:true}],['focus',2,{focused:true}]]);
  calls.length=0;
  await openFinanceDetails(api([{tabId:3,windowId:1,documentUrl:'chrome-extension://abc/rewards.html'}]));
  assert.deepEqual(calls,[['create',{url:'chrome-extension://abc/finance.html'}]]);
});

test('a view can tell its own saved change from another view’s',()=>{
  const listeners=new Set();
  const storage={local:{set:async value=>{for(const listener of listeners)listener(Object.fromEntries(Object.entries(value).map(([key,newValue])=>[key,{newValue}])),'local');}},
    onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
  const heard=[];
  const panel=travelChanges(marker=>heard.push(['panel',marker]),{resource:'finance',storage});
  const details=travelChanges(marker=>heard.push(['page',marker]),{resource:'finance',storage});
  const marker=panel.publish();
  assert.match(marker,/^[a-f0-9-]{36}$/);
  assert.deepEqual(heard,[['panel',marker],['page',marker]],'every view hears it, the one that saved included');
  panel.close();details.close();
});

// Cash in or out, entered by hand. Which way it went is a switch, the amount is
// typed the way a statement prints it, and a second movement on the same day
// at the same firm joins the first rather than writing over it.
function writable(document,saved,options={}){
  const writes=[];let records=[...saved];
  const tool=page(document,records,{...options,offline:{request:async(token,path,request)=>{
    if(request?.method==='PUT'){writes.push(request.value);records=[...records.filter(record=>record.id!==request.value.id),{...request.value,revision:'r2'}];}
    if(request?.method==='DELETE'){writes.push({deleted:path});records=records.filter(record=>`/v1/finance/${record.id}`!==path);}
    return {records};
  }}});
  return {tool,writes};
}
test('cash is recorded against a firm, one way or the other, and a second movement that day joins the first',async()=>{
  const document=setup();
  const saved=[...HELD,{row:'flow',firm:5,asOf:'2026-09-10',amount:500000,id:'f5-20260910',revision:'50000000'}];
  const {tool,writes}=writable(document,saved);
  await settle(()=>document.getElementById('finance-flow-firm').options.length>2);
  // Nothing is chosen for the owner: a default firm would file a wire to the
  // wrong bank for anyone who skipped the field.
  assert.equal(document.getElementById('finance-flow-firm').value||'','');
  const submit=()=>document.getElementById('finance-flow-form').dispatchEvent(new document.defaultView.Event('submit',{cancelable:true}));
  document.getElementById('finance-flow-amount').value='$250,000';
  submit();
  await settle(()=>document.getElementById('finance-flow-status').textContent);
  assert.match(document.getElementById('finance-flow-status').textContent,/institution/);
  assert.equal(writes.length,0,'nothing half-saved');

  document.getElementById('finance-flow-firm').value='2';
  document.getElementById('finance-flow-asOf').value='2026-09-12';
  [...document.querySelectorAll('#finance-flow-direction button')].find(button=>button.textContent==='Taken out').click();
  submit();
  await settle(()=>writes.length===1);
  assert.deepEqual({...writes[0],id:writes[0].id},{row:'flow',firm:2,asOf:'2026-09-12',amount:-250000,id:'f2-20260912',revision:null});
  await settle(()=>/Recorded/.test(document.getElementById('finance-status').textContent));
  assert.equal(document.getElementById('finance-status').textContent,'Recorded $250,000 taken out of Chase on 2026-09-12.');

  // The card's own verb opens the form for that firm, going the default way.
  // It is said in words — a + beside the balance read as the balance's sign,
  // and did not say what it would add. UI-46.
  await settle(()=>document.querySelector('.firm-card[aria-label=UBS] .firm-figure button'));
  const verb=document.querySelector('.firm-card[aria-label=UBS] .firm-figure button');
  assert.equal(verb.textContent,'Record cash in or out');
  assert.equal(verb.getAttribute('aria-label'),'Record cash in or out of UBS');
  assert.equal(verb.querySelector('svg'),null,'no glyph stands in for the words');
  verb.click();
  await settle(()=>document.getElementById('finance-flow-firm').value==='5');
  assert.equal(document.querySelector('#finance-flow-direction button[aria-pressed=true]').textContent,'Added');
  document.getElementById('finance-flow-amount').value='100000';
  document.getElementById('finance-flow-asOf').value='2026-09-10';
  submit();
  await settle(()=>writes.length===2);
  assert.equal(writes[1].amount,600000,'added to the $500,000 already recorded that day');
  assert.equal(writes[1].revision,'50000000','and saved over it, knowingly');
  await settle(()=>/now comes to/.test(document.getElementById('finance-status').textContent));
  tool.stop();
});
