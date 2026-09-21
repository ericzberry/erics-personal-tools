import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {TrendTable,BreakdownList,FinanceView} from '../src/components/finance.js';
import {markRef} from '../src/finance-data.js';

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
function selectValues(window){
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){
    for(const option of this.options)if(option.value!==value)option.selected=false;
    for(const option of this.options)if(option.value===value)option.selected=true;
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
const mark=(portfolio,cls,asOf,amount)=>{
  const value={row:'mark',portfolio,class:cls,asOf,amount};
  return {...value,id:markRef(value),revision:String(amount)};
};
const ledger=(document,records)=>mountFinance(document.querySelector('main'),{
  vault:unlockedVault(),credentials:{get:async()=>'token'},
  remote:async()=>({connections:[]}),
  offline:{request:async()=>({records})}
});

// The estate as the intake leaves it: an account read before anyone said what
// was in it, filed Unclassified, then corrected the next day by a zero under
// the same portfolio, class and date and a real figure beside it.
const AMENDED=[
  portfolio(1,'Eric and Ariana Berry Estate',1),
  portfolio(2,'Eric Berry',2),
  mark(1,3,'2026-09-19',0.54),
  mark(1,9,'2026-09-19',0),
  mark(1,10,'2026-09-20',1668402.54),
  mark(2,9,'2026-09-19',0),
  mark(2,10,'2026-09-20',122666.62)
];

test('a figure zeroed out by a correction is no longer a holding',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  const list=document.getElementById('finance-list').textContent;
  assert.equal(list.includes('Unclassified'),false,'a correction’s tombstone is not a line in what is held');
  assert.match(list,/Cash/,'a figure that is merely small is still held');
  const breakdown=document.getElementById('finance-breakdown').textContent;
  assert.equal(breakdown.includes('Unclassified'),false);
  assert.equal(breakdown.includes('$0.00'),false,'nothing in a breakdown of what is held comes to nothing');
  tool.stop();
});

test('the ledger states its date once, and a class line never repeats it',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  // Once, at the top, beside the totals it qualifies.
  assert.match(document.getElementById('finance-totals').textContent,/As of2026-09-20/);
  // The cash figure is a day behind the securities beside it and says nothing
  // about it: a class line is a figure, not a document. (A delete confirmation
  // names its figure's date, but it is out of sight until the row raises it.)
  const dates=[...document.querySelectorAll('#finance-list .record-meta')].map(node=>node.textContent);
  assert.deepEqual(dates,[]);
  assert.match(document.getElementById('finance-list').textContent,/Cash\$0\.54/);
  tool.stop();
});

test('a portfolio behind the rest of the ledger still says its own date',async()=>{
  const document=setup();
  const tool=ledger(document,[portfolio(1,'Eric and Ariana Berry Estate',1),portfolio(2,'Eric Berry',2),
    mark(1,10,'2026-09-20',1668402.54),mark(2,10,'2026-09-18',122666.62)]);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  // On the heading, not under it: a portfolio is closed until it is asked for,
  // and a date behind the rest of the ledger is exactly what the closed row has
  // to be able to say.
  const said=[...document.querySelectorAll('#finance-list .group-name > .footnote')].map(node=>node.textContent);
  assert.deepEqual(said,['as of 2026-09-18'],'the date cascades to the group that is behind, and stops there');
  tool.stop();
});

test('a portfolio wears its account type, and assets appear only when something is owed',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  assert.deepEqual([...document.querySelectorAll('#finance-list .portfolio-kind')].map(node=>node.textContent),['Taxable','IRA']);
  const totals=document.getElementById('finance-totals').textContent;
  assert.match(totals,/Net\$1,791,070/);
  assert.equal(totals.includes('Assets'),false,'with nothing owed, assets are the net figure printed twice');
  // A mortgage against the estate, and both figures earn their place.
  document.querySelector('main').replaceChildren();
  const owing=ledger(document,[...AMENDED,mark(1,21,'2026-09-20',400000)]);
  await settle(()=>document.getElementById('finance-totals').textContent.includes('Liabilities'));
  assert.match(document.getElementById('finance-totals').textContent,/Assets\$1,791,070/);
  tool.stop();owing.stop();
});

// The whole point of the coverage rule: the 19th is not a net worth of 54
// cents, it is three figures out of six, and subtracting it from the 20th
// announced a two-million-dollar rise that never happened.
const SERIES=[
  {asOf:'2026-03-31',figures:1,net:500,assets:500,liabilities:0},
  {asOf:'2026-09-19',figures:3,net:0.54,assets:0.54,liabilities:0},
  {asOf:'2026-09-20',figures:6,net:2039492,assets:2039492,liabilities:0}
];

test('value over time draws no change against a reading that covers part of the ledger',()=>{
  setup();
  const table=TrendTable(SERIES,'USD');
  const rows=[...table.querySelectorAll('.trend-row')].map(row=>row.textContent);
  assert.equal(rows.length,2);
  assert.match(rows[0],/2026 Q1\$500\.001 of 6 figures/);
  assert.match(rows[1],/2026 Q3\$2,039,492$/,'the only full reading, and nothing to compare it with');
  assert.equal(table.textContent.includes('higher than'),false);
  assert.match(table.textContent,/first full picture/);
});

// The table had a Quarterly/Daily switch above it. Daily answered nothing a
// quarter did not — the same figures, one row per reading — so the grain is
// fixed and the control is gone.
test('value over time offers no grain to choose: the table is quarterly and says so once',()=>{
  setup();
  assert.equal(TrendTable(SERIES,'USD',{period:'day'}).querySelectorAll('.trend-row').length,2,
    'a leftover period argument changes nothing');
  const view=FinanceView();
  assert.equal(view.querySelector('#finance-trend-switch'),null);
  assert.equal([...view.querySelectorAll('button')].some(b=>/Quarterly|Daily/.test(b.textContent)),false);
});

test('value over time is read quarterly by default, each quarter shown by its last reading',()=>{
  setup();
  const rows=[...TrendTable(SERIES,'USD').querySelectorAll('.trend-row')].map(row=>row.textContent);
  assert.deepEqual(rows.map(row=>row.slice(0,7)),['2026 Q1','2026 Q3']);
  assert.match(rows[1],/2026 Q3\$2,039,492/,'the 19th and the 20th are one quarter, closed on the 20th');
});

test('two full readings are compared with each other, and the partial ones between them are not',()=>{
  setup();
  const table=TrendTable([...SERIES,{asOf:'2026-12-31',figures:6,net:2100000,assets:2100000,liabilities:0}],'USD');
  assert.match(table.textContent,/\$60,508 higher than 2026 Q3/);
  assert.match([...table.querySelectorAll('.trend-row')].at(-1).textContent,/\+\$60,508/);
});

test('a breakdown line carries its share, and a line that comes to nothing is left out',()=>{
  setup();
  const list=BreakdownList('By asset class',[
    {label:'Liquid securities',total:750},
    {label:'Cash',total:250},
    {label:'Unclassified',total:0}
  ],'USD');
  const rows=[...list.querySelectorAll('.breakdown-line')];
  assert.deepEqual(rows.map(row=>row.textContent),['Liquid securities75%$750.00','Cash25%$250.00']);
  assert.match(rows[0].getAttribute('style'),/--share:75\.0%/);
  // Committed, funded and returned are not parts of one whole, so no share is
  // claimed for them.
  const flows=BreakdownList('Private investments',[{label:'Committed',total:1000},{label:'Value',total:1100}],'USD',{shares:false});
  assert.deepEqual([...flows.querySelectorAll('.breakdown-line')].map(row=>row.textContent),['Committed$1,000','Value$1,100']);
  restore();
});

// The ledger is read at the level of the entities that hold the money. Seven
// trusts with five classes each is forty lines to scroll past before the second
// name; closed, it is seven names and seven totals, and one opens at a time.
test('a portfolio is closed to its own total, and opens on its own',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  const groups=[...document.querySelectorAll('#finance-list .portfolio-group')];
  assert.equal(groups.length,2);
  for(const group of groups)assert.equal(group.open,false,'a portfolio opens because it was asked for');
  // Closed, the heading still carries the one thing it is there to say.
  const heading=groups[0].querySelector('summary');
  assert.match(heading.textContent,/Eric and Ariana Berry Estate/);
  assert.match(heading.textContent,/\$1,668,403/,'the entity’s own total, on the line that is always shown');
  // And the class lines are inside it, not beside it.
  assert.ok(groups[0].querySelector('.record-line'),'the classes are in the block the heading opens');
  assert.equal(heading.querySelector('.record-line'),null,'and not in the heading itself');
  groups[0].open=true;
  assert.equal(groups[1].open,false,'opening one is not opening the rest');
  tool.stop();
});

// The heading is a name and a number. A portfolio's own verbs are in the block
// it opens, the way any record that opens into a block keeps them: on the
// heading they either held 96px of nothing open beside every total, or floated
// over the end of a long name and cut it off under the pointer.
test('a portfolio heading is a name and a total, and its verbs are in the block',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  const group=document.querySelector('#finance-list .portfolio-group');
  assert.equal(group.querySelector('summary button'),null,'nothing on the heading to press but the heading');
  const verbs=[...group.querySelectorAll(':scope > .portfolio-actions button')];
  assert.deepEqual(verbs.map(button=>button.getAttribute('aria-label')),
    ['Rename Eric and Ariana Berry Estate','Delete Eric and Ariana Berry Estate']);
  tool.stop();
});
