import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {normalizeFinance,financeSummary,groupFinanceRecords,netWorthSeries,
  propertiesOn,parseRef,recordRef,propertyRef,valuationRef} from '../src/finance-data.js';

// A house is worth what somebody says it is worth, on a day, less what is still
// owed on it. These tests are about the three parts of that sentence staying
// attached to one another: the address, the dated reading, and the debt.
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
const ESTATE='Eric and Ariana Berry Estate';
const estate={id:'p1',row:'portfolio',revision:'r1',number:1,name:ESTATE,kind:1,currency:'USD'};
const record=(id,value)=>({id,revision:'r1',...normalizeFinance(value)});
const house=(number,name,link='')=>record(propertyRef(number),{row:'property',number,portfolio:1,name,link});
const reading=(property,asOf,value,debt=0,source=1)=>
  record(valuationRef({property,asOf}),{row:'valuation',property,asOf,value,debt,source});

function financeHost(document,{saved=[],readZestimate=null}={}){
  const writes=[];
  let records=[...saved];
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},readZestimate,
    remote:async()=>({connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]}),
    offline:{request:async(token,path,options)=>{
      if(options?.method==='PUT'){
        writes.push(options.value);
        records=[...records.filter(entry=>entry.id!==options.value.id),{...options.value,revision:'r2'}];
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

// The whole point of a property being its own record rather than a line in a
// Real estate total: two of them stay two, and the mortgage stays attached to
// the house it is against.
test('a property counts as its value under Real estate and its debt under Mortgage',()=>{
  const records=[estate,
    house(1,'123 Example St, Town ST 00000'),reading(1,'2026-09-20',1240000),
    house(2,'456 Second Ave, Town ST 00000'),reading(2,'2026-09-20',610000,320000)];
  const summary=financeSummary(records,{currency:'USD',today:'2026-09-20'});
  assert.equal(summary.assets,1850000);
  assert.equal(summary.liabilities,320000);
  assert.equal(summary.net,1530000,'net worth is what is owned less what is owed');
  assert.deepEqual(summary.properties,{count:2,value:1850000,debt:320000,equity:1530000});
  // Both reach the totals as ordinary figures, in classes that already existed.
  assert.deepEqual(summary.byClass.map(row=>[row.label,row.total]),
    [['Real estate',1850000],['Mortgage',-320000]]);
  // A house is illiquid, and nothing had to be told that separately.
  assert.deepEqual(summary.byGroup.map(row=>[row.label,row.total]),[['Illiquid securities',1850000]]);
  // The portfolio holds the difference, not the two figures.
  assert.equal(groupFinanceRecords(records)[0].total,1530000);
  assert.equal(groupFinanceRecords(records)[0].properties.length,2);
});

// The same step function every other dated figure follows, and for the same
// reason: a Zestimate is a reading taken on a day, and nothing observable
// happened to the house between two of them.
test('a property holds its newest valuation on or before a date, and none before its first',()=>{
  const records=[estate,house(1,'123 Example St'),
    reading(1,'2026-03-31',1180000,400000),
    reading(1,'2026-06-30',1210000,395000),
    reading(1,'2026-09-20',1240000,390000)];
  assert.equal(propertiesOn(records,'2026-05-01')[0].value,1180000);
  assert.equal(propertiesOn(records,'2026-05-01')[0].equity,780000);
  assert.equal(propertiesOn(records,'2026-01-01')[0].current,null,'nothing before the first reading');
  assert.equal(propertiesOn(records,'2026-01-01')[0].value,0);
  assert.equal(propertiesOn(records)[0].value,1240000);
  // Every reading is a day the series has a point on, and equity is what moves.
  assert.deepEqual(netWorthSeries(records).map(point=>[point.asOf,point.net]),
    [['2026-03-31',780000],['2026-06-30',815000],['2026-09-20',850000]]);
});

// An address recorded the day the house is bought is a whole record. It counts
// as nothing until a figure says otherwise — the same rule a commitment with no
// capital account behind it follows.
test('a property with no valuation is still a property, and counts as nothing',()=>{
  const records=[estate,house(1,'123 Example St')];
  const summary=financeSummary(records,{currency:'USD',today:'2026-09-20'});
  assert.equal(summary.net,0);
  assert.equal(summary.properties.count,1);
  assert.equal(groupFinanceRecords(records)[0].properties[0].current,null);
});

test('a property and a valuation are addressed, validated and round-tripped',()=>{
  assert.deepEqual(parseRef('r3'),{row:'property',number:3});
  assert.deepEqual(parseRef('r3-20260920'),{row:'valuation',property:3,asOf:'2026-09-20'});
  assert.equal(recordRef({row:'property',number:3}),'r3');
  assert.equal(recordRef({row:'valuation',property:3,asOf:'2026-09-20'}),'r3-20260920');
  // A mark still parses as a mark: only a figure begins with a digit.
  assert.equal(parseRef('1-7-20260920').row,'mark');

  // The address is the record, so a link that is not a safe public one is
  // dropped rather than refusing to save the house.
  assert.equal(normalizeFinance({row:'property',number:1,portfolio:1,name:'123 Example St',link:'javascript:alert(1)'}).link,'');
  assert.equal(normalizeFinance({row:'property',number:1,portfolio:1,name:'123 Example St',
    link:'https://www.zillow.com/homedetails/123-Example-St/1234_zpid/#tour'}).link,
    'https://www.zillow.com/homedetails/123-Example-St/1234_zpid/');
  assert.throws(()=>normalizeFinance({row:'property',number:1,portfolio:1,name:''}),/address/);
  // A debt is a positive number under the property; the class applies the sign.
  assert.throws(()=>normalizeFinance({row:'valuation',property:1,asOf:'2026-09-20',value:100,debt:-5}),/owed/);
  assert.throws(()=>normalizeFinance({row:'valuation',property:1,asOf:'2026-09-20',value:100,source:99}),/where this value came from/);
  // Debt and source have standing answers: nothing owed, and the Zestimate.
  const bare=normalizeFinance({row:'valuation',property:1,asOf:'2026-09-20',value:100});
  assert.deepEqual([bare.debt,bare.source],[0,1]);
});

// The errand Eric asked for, through the tool: an address and a Zestimate go
// in, and the house is in the totals with the number it was valued by named.
test('a property can be recorded by hand, with or without a valuation behind it',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[estate]});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  set('finance-prop-name','123 Example St, Town ST 00000');
  set('finance-prop-value','1240000');
  set('finance-prop-asOf','');
  document.getElementById('finance-prop-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>document.getElementById('finance-prop-status').textContent.includes('date'));
  assert.match(document.getElementById('finance-prop-status').textContent,/Give the date these figures are as of/);
  assert.equal(writes.length,0,'a refused valuation does not leave a property saved behind it');

  set('finance-prop-asOf','2026-09-20');
  set('finance-prop-link','https://www.zillow.com/homedetails/123-Example-St/1234_zpid/');
  document.getElementById('finance-prop-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=2);
  assert.deepEqual(writes.map(write=>write.row),['property','valuation']);
  assert.deepEqual([writes[0].name,writes[0].portfolio,writes[0].link],
    ['123 Example St, Town ST 00000',1,'https://www.zillow.com/homedetails/123-Example-St/1234_zpid/']);
  assert.deepEqual([writes[1].property,writes[1].value,writes[1].debt,writes[1].source],[1,1240000,0,1]);

  await settle(()=>document.getElementById('finance-list').textContent.includes('123 Example St'));
  const list=document.getElementById('finance-list').textContent;
  assert.match(list,/Zestimate/,'the row says which kind of number this is');
  assert.doesNotMatch(list,/Equity/,'a house with nothing owed on it does not say its equity twice');
  assert.match(document.getElementById('finance-totals').textContent,/\$1,240,000/);
  tool.stop();restore();
});

// A mortgage is the reason the debt is kept on the property rather than filed
// beside it: the row has to be able to say what is left.
test('a mortgage on a property is shown against it and counted against net worth',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{saved:[estate,
    house(1,'456 Second Ave, Town ST 00000'),reading(1,'2026-09-20',610000,320000)]});
  await settle(()=>document.getElementById('finance-list').textContent.includes('456 Second Ave'));
  const list=document.getElementById('finance-list').textContent;
  assert.match(list,/Mortgage \$320,000/);
  assert.match(list,/Equity \$290,000/);
  const totals=document.getElementById('finance-totals').textContent;
  assert.match(totals,/\$290,000/,'net worth holds the equity');
  assert.match(totals,/\$320,000/,'and the debt is named as a liability');
  tool.stop();restore();
});

// Three records, one drawer. The point of the switch is that a person looking
// for the property form finds it without reading four closed drawers to see
// which one it is — and that each form keeps what was typed into it while they
// look at another.
test('one drawer offers the three records, and a row action opens it on the right one',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{saved:[estate,
    house(1,'456 Second Ave, Town ST 00000'),reading(1,'2026-09-20',610000,320000)]});
  await ready(document);
  const drawer=document.getElementById('finance-entry');
  const forms=['finance-form','finance-inv-form','finance-prop-form'];
  const showing=()=>forms.filter(id=>!document.getElementById(id).hidden);
  const chooser=()=>[...document.getElementById('finance-entry-switch').querySelectorAll('button')];

  // One drawer, not three, and the ones that were three are gone.
  for(const gone of ['finance-editor','finance-investment','finance-property'])
    assert.equal(document.getElementById(gone),null,gone);
  assert.deepEqual(chooser().map(node=>node.textContent),['Figure','Private investment','Property']);
  // `details.open` rather than the attribute throughout: linkedom's setter does
  // not reflect it, and its getter is undefined until something sets it.
  assert.ok(!drawer.open,'offered, not opened');
  assert.deepEqual(showing(),['finance-form'],'a figure is what it opens on');
  assert.equal(chooser()[0].getAttribute('aria-pressed'),'true');

  // Typing into one form and looking at another does not throw the first away.
  document.getElementById('finance-prop-name').value='99 Draft Lane';
  chooser()[1].dispatchEvent(new document.defaultView.Event('click'));
  assert.deepEqual(showing(),['finance-inv-form']);
  assert.equal(chooser()[1].getAttribute('aria-pressed'),'true');
  assert.equal(chooser()[0].getAttribute('aria-pressed'),'false');
  assert.equal(document.getElementById('finance-prop-name').value,'99 Draft Lane','the half-filled form is still there');

  // Editing a property from its row opens the drawer on the property form,
  // rather than on whichever one happened to be showing.
  const edit=[...document.querySelectorAll('#finance-list button')]
    .find(node=>node.getAttribute('aria-label')?.startsWith('Edit 456 Second Ave'));
  edit.dispatchEvent(new document.defaultView.Event('click'));
  assert.equal(drawer.open,true);
  assert.deepEqual(showing(),['finance-prop-form']);
  assert.equal(document.getElementById('finance-prop-name').value,'456 Second Ave, Town ST 00000');
  assert.equal(document.getElementById('finance-prop-debt').value,'320000');
  // The form's title says only what the switch above it cannot: that this is an
  // existing record, and which one. On a new record it says nothing at all.
  assert.equal(document.getElementById('finance-prop-title').textContent,'Editing 456 Second Ave, Town ST 00000');
  assert.equal(document.getElementById('finance-prop-title').hidden,false);
  const cancel=[...document.querySelectorAll('#finance-prop-form button')].find(node=>node.textContent==='Cancel edit');
  cancel.dispatchEvent(new document.defaultView.Event('click'));
  assert.equal(document.getElementById('finance-prop-title').textContent,'');
  assert.equal(document.getElementById('finance-prop-title').hidden,true,'no "New property" under a pressed Property button');
  tool.stop();restore();
});

// A portfolio is read down its asset classes, and an address set among them is
// a different kind of thing in the same column. So the houses come to one line
// of the ledger, and they are behind it for whoever wants them.
test('the ledger shows one Real estate line, with the houses behind it',async()=>{
  const {document,restore}=setup();
  const window=document.defaultView;
  const {tool}=financeHost(document,{saved:[estate,
    house(1,'123 Example St, Town ST 00000'),reading(1,'2026-09-20',1240000),
    house(2,'456 Second Ave, Town ST 00000'),reading(2,'2026-09-20',610000,320000)]});
  await settle(()=>document.querySelector('#finance-list .estate-detail'));
  const rows=[...document.querySelectorAll('#finance-list .record-group>.record-row')];
  assert.deepEqual(rows.map(row=>row.querySelector('.record-name').textContent),['Real estate'],
    'two houses are one line, named for the class and not for either address');
  assert.match(rows[0].textContent,/\$1,850,000/,'the line carries what the houses are worth');
  assert.match(rows[0].textContent,/2 properties/);
  assert.match(rows[0].textContent,/Mortgage \$320,000/);
  assert.match(rows[0].textContent,/Equity \$1,530,000/,'and what is left of them, which no class line can say');

  const detail=document.querySelector('#finance-list .estate-detail');
  assert.equal(detail.hidden,true,'the addresses wait to be asked for');
  assert.deepEqual([...detail.querySelectorAll('.record-name')].map(node=>node.textContent),
    ['123 Example St, Town ST 00000','456 Second Ave, Town ST 00000']);
  const show=[...rows[0].querySelectorAll('button')]
    .find(node=>node.getAttribute('aria-label')?.startsWith('Show the properties'));
  show.dispatchEvent(new window.Event('click'));
  assert.equal(detail.hidden,false);
  // A house's own verbs act on the house, so they stay with it rather than
  // riding on the line that adds it to the others.
  assert.deepEqual(rows[0].querySelector('.record-line .action-group').children.length,1);
  assert.ok([...detail.querySelectorAll('button')].some(node=>node.getAttribute('aria-label')==='Edit 123 Example St, Town ST 00000'));
  tool.stop();restore();
});

// What a house is worth is published rather than held, so a property saved with
// the page it is published on does not wait to be told the figure.
test('a property saved with a Zillow page and no figure has its Zestimate read off it',async()=>{
  const {document,restore}=setup();
  const asked=[];
  const {tool,writes}=financeHost(document,{saved:[estate],
    readZestimate:async(link,address)=>{asked.push([link,address]);return {value:3985700,address,url:link};}});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  set('finance-prop-name','220 Riverside Blvd, Apartment 11J, NY NY 10069');
  set('finance-prop-link','https://www.zillow.com/homedetails/220-Riverside-Blvd/1234_zpid/');
  set('finance-prop-value','');
  set('finance-prop-asOf','2026-09-20');
  document.getElementById('finance-prop-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=2);
  assert.deepEqual(asked,[['https://www.zillow.com/homedetails/220-Riverside-Blvd/1234_zpid/','220 Riverside Blvd, Apartment 11J, NY NY 10069']]);
  assert.deepEqual([writes[1].value,writes[1].source,writes[1].asOf],[3985700,1,'2026-09-20'],
    'the figure read off the page, filed as the Zestimate it is');
  tool.stop();restore();
});

// A figure typed by hand is the owner overriding the Zestimate, which is the
// whole reason the source is a choice. Nothing is read over it.
test('a market value typed by hand is not read over',async()=>{
  const {document,restore}=setup();
  let asked=0;
  const {tool,writes}=financeHost(document,{saved:[estate],
    readZestimate:async()=>{asked++;return {value:3985700,address:'',url:''};}});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  set('finance-prop-name','123 Example St, Town ST 00000');
  set('finance-prop-link','https://www.zillow.com/homedetails/123-Example-St/1234_zpid/');
  set('finance-prop-value','1240000');
  set('finance-prop-source','3');
  set('finance-prop-asOf','2026-09-20');
  document.getElementById('finance-prop-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>writes.length>=2);
  assert.equal(asked,0,'the owner has already answered');
  assert.deepEqual([writes[1].value,writes[1].source],[1240000,3]);
  tool.stop();restore();
});

// The house already in the ledger with a page and no figure: nobody has to open
// the form again for it. It is read when the ledger loads, once per sitting.
test('a saved property with a page and no figure is read when the ledger loads',async()=>{
  const {document,restore}=setup();
  let asked=0;
  const {tool,writes}=financeHost(document,{
    saved:[estate,house(1,'123 Example St, Town ST 00000','https://www.zillow.com/homedetails/123-Example-St/1234_zpid/'),
      house(2,'456 Second Ave, Town ST 00000'),reading(2,'2026-09-20',610000)],
    readZestimate:async()=>{asked++;return {value:1240000,address:'123 Example St, Town ST 00000',url:''};}});
  await settle(()=>writes.length>=1);
  assert.equal(asked,1,'the house with a figure already is left alone, and the one with no page cannot be read');
  assert.deepEqual([writes[0].row,writes[0].property,writes[0].value,writes[0].source],['valuation',1,1240000,1]);
  tool.stop();restore();
});

// A page that will not give up a figure is said once, in words, where the
// ledger's own status is — and the house is still saved.
test('a Zestimate that cannot be read is reported, and the property is saved anyway',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[estate],
    readZestimate:async()=>{throw Error('No Zestimate was found on that page.');}});
  await ready(document);
  const set=(id,value)=>{document.getElementById(id).value=value;};
  set('finance-prop-name','123 Example St, Town ST 00000');
  set('finance-prop-link','https://www.zillow.com/homedetails/123-Example-St/1234_zpid/');
  set('finance-prop-value','');
  set('finance-prop-asOf','2026-09-20');
  document.getElementById('finance-prop-form').dispatchEvent(new document.defaultView.Event('submit'));
  await settle(()=>document.getElementById('finance-status').textContent.includes('No Zestimate'));
  assert.equal(writes[0].row,'property','the address is the record, and it is saved');
  tool.stop();restore();
});
