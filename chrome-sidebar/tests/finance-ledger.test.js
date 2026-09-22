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
  // A mortgage against the estate, and both figures earn their place — what is
  // held, and beside it in parentheses what is owed against it. A liability is
  // read with the assets it stands against, not as a total two rows away.
  document.querySelector('main').replaceChildren();
  const owing=ledger(document,[...AMENDED,mark(1,21,'2026-09-20',400000)]);
  await settle(()=>document.getElementById('finance-totals').textContent.includes('Assets'));
  const owed=document.getElementById('finance-totals');
  assert.match(owed.textContent,/Assets\$1,791,070Liabilities\(\$400,000\)/);
  assert.ok(owed.querySelector('.figure-value--negative'),'and it is read as what is owed');
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

// A quarter from before the ledger was first whole is not history: a lone
// capital account dated 30 June stood as "2026 Q2, $392,000, 1 of 38 figures"
// above an $82 million Q3. The table starts at the first full picture.
test('value over time starts at the first quarter that holds every figure',()=>{
  setup();
  const table=TrendTable(SERIES,'USD');
  const rows=[...table.querySelectorAll('.trend-row')].map(row=>row.textContent);
  assert.equal(rows.length,1,'a quarter that covers part of the ledger is shown');
  assert.match(rows[0],/2026 Q3\$2,039,492$/,'the only full reading, and nothing to compare it with');
  assert.equal(table.querySelector('.trend-row--partial'),null);
  assert.equal(table.textContent.includes('higher than'),false);
  assert.equal(table.textContent.includes('first full picture'),false,'a row that is not shown is not explained');
});

// The table had a Quarterly/Daily switch above it. Daily answered nothing a
// quarter did not — the same figures, one row per reading — so the grain is
// fixed and the control is gone.
test('value over time offers no grain to choose: the table is quarterly and says so once',()=>{
  setup();
  assert.equal(TrendTable(SERIES,'USD',{period:'day'}).querySelectorAll('.trend-row').length,1,
    'a leftover period argument changes nothing');
  const view=FinanceView();
  assert.equal(view.querySelector('#finance-trend-switch'),null);
  assert.equal([...view.querySelectorAll('button')].some(b=>/Quarterly|Daily/.test(b.textContent)),false);
});

// UI-35. The entities ran as a bare stack under three disclosures — four
// things at one level, three of them boxes that open and one loose. On the
// ledger's own page every section is open, because there is room for all of
// them, and so every one of them is the same kind of thing: a heading over what
// it names, never a disclosure beside a loose list.
test('every section of the ledger\u2019s page opens the same way, and none of them has to be opened',()=>{
  setup();
  const view=FinanceView();
  const list=view.querySelector('#finance-list');
  const section=list.closest('.overview-section');
  assert.ok(section,'the entities are a loose stack beside the other sections. See UI-35 in docs/UI_RULES.md.');
  assert.equal(section.querySelector('.overview-title').textContent,'Entities');
  const ledger=view.querySelector('#finance-ledger');
  assert.equal(ledger.querySelector(':scope details'),null,'a section on the page is put away behind a disclosure');
  assert.deepEqual([...ledger.querySelectorAll('.overview-title')].map(node=>node.textContent),
    ['Allocation','Entities','Value over time','Institutions','Private investments','Real estate','Sources']);
});

// The side panel keeps what it all comes to and the ways a figure gets in.
// Every line of the ledger — the classes inside each entity, the positions, the
// houses, the quarters — is on the page Open details goes to. "Rather than
// jamming everything into the sidebar." UI-45.
test('the side panel answers what it comes to, and sends the detail to its own page',async()=>{
  const document=setup();
  let opened=0;
  const records=[...AMENDED,mark(1,12,'2026-09-20',248422.68),mark(1,21,'2026-09-20',400000)];
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},layout:'panel',openDetails:()=>{opened++;},
    remote:async()=>({connections:[]}),offline:{request:async()=>({records})}
  });
  await settle(()=>document.getElementById('finance-totals').textContent.includes('Net'));
  for(const id of ['finance-list','finance-hero','finance-positions','finance-properties','finance-trend','finance-firms','finance-sources'])
    assert.equal(document.getElementById(id),null,`${id} is ledger detail, and the panel carries it again`);
  assert.match(document.getElementById('finance-totals').textContent,/Net\$1,639,492As of2026-09-20Assets\$2,039,492Liabilities\(\$400,000\)/);
  // How much could be sold this week, and who holds it.
  const liquidity=document.getElementById('finance-liquidity');
  assert.match(liquidity.textContent,/Liquid88%\$1,791,070/);
  assert.match(liquidity.textContent,/Illiquid12%\$248,423/);
  assert.equal(liquidity.querySelectorAll('.proportion-part').length,3,'one part per class held');
  assert.match(document.getElementById('finance-breakdown').textContent,/By entity/);
  assert.match(document.getElementById('finance-breakdown').textContent,/Eric and Ariana Berry Estate/);
  // The way to the rest of it, and one press is the whole errand.
  const details=document.getElementById('finance-details');
  assert.equal(details.closest('.action-group').hidden,false);
  details.click();
  assert.equal(opened,1);
  tool.stop();
});

test('a panel with no page to send anyone to offers no way there',async()=>{
  const document=setup();
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},layout:'panel',
    remote:async()=>({connections:[]}),offline:{request:async()=>({records:AMENDED})}
  });
  await settle(()=>document.getElementById('finance-totals').textContent.includes('Net'));
  assert.equal(document.getElementById('finance-details').closest('.action-group').hidden,true);
  tool.stop();
});

test('value over time is read quarterly by default, each quarter shown by its last reading',()=>{
  setup();
  const rows=[...TrendTable(SERIES,'USD').querySelectorAll('.trend-row')].map(row=>row.textContent);
  assert.deepEqual(rows.map(row=>row.slice(0,7)),['2026 Q3']);
  assert.match(rows[0],/2026 Q3\$2,039,492/,'the 19th and the 20th are one quarter, closed on the 20th');
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

// A portfolio's verbs ride at the end of its heading line, where a class
// figure's ride at the end of its own. They sat at the foot of the opened
// block for one release, which put a rule and twelve pixels of nothing between
// the last figure and a pair of glyphs belonging to the name three lines
// above: *"Looks weird when I expand an entity."* UI-33.
test('a portfolio\u2019s verbs ride on its heading, and pressing one does not open it',async()=>{
  const document=setup();
  const tool=ledger(document,AMENDED);
  await settle(()=>document.getElementById('finance-list').textContent.includes('Liquid securities'));
  const group=document.querySelector('#finance-list .portfolio-group');
  const verbs=[...group.querySelectorAll('summary .group-figure .action-group button')];
  assert.deepEqual(verbs.map(button=>button.getAttribute('aria-label')),
    ['Rename Eric and Ariana Berry Estate','Delete Eric and Ariana Berry Estate'],
    'the portfolio\u2019s verbs are at the end of its heading line');
  assert.equal(group.querySelector(':scope > .portfolio-actions'),null,
    'a row of verbs on a line of its own belongs to nothing the eye can find');
  // The heading is the press, but the verbs on it are not: a verb acts on the
  // portfolio rather than opening it.
  group.open=true;
  const Press=document.defaultView.Event||Event;
  const press=new Press('click',{bubbles:true,cancelable:true});
  verbs[0].dispatchEvent(press);
  assert.equal(press.defaultPrevented,true,'pressing a verb would toggle the group');
  tool.stop();
});
