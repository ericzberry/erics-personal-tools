import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {classById} from '../src/finance-data.js';

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
const ESTATE='Eric and Ariana Berry Estate';
const estate={id:'p1',row:'portfolio',revision:'r1',number:1,name:ESTATE,kind:1,currency:'USD'};
const dated={registration:'',scope:'account',asOf:'2026-09-11',confidence:'high',reason:'Net account value on the accounts page.'};
const READING={readings:[
  {...dated,account:'Individual Brokerage',label:'Net Account Value',class:'unclassified',value:124500.5},
  {...dated,account:'Rollover IRA',label:'Net Account Value',class:'unclassified',registration:'ira',value:88000}
],unread:''};

// One tool, wired the way the sidebar wires it: a page beside the panel, a
// saved AI connection, and a portfolio already in the ledger to fold into.
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
// The tool is ready once the ledger has loaded; which saved connection reads
// a page is settled behind the screen, not by a control on it.
const ready=document=>settle(()=>document.getElementById('finance-list').textContent.includes('No figures yet')||document.getElementById('finance-list').querySelector('.record-group,.record-row'));
// Each scope is a tab, and the tab's label is its heading.
const tab=(document,key)=>document.getElementById(`finance-tabs-${key}-tab`);

test('a signed-in account page offers one action, and nothing before that',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document);
  await ready(document);
  // The tab is there for any page beside the panel; what changes when a site
  // is recognized is the name on the tab and the name on the action.
  assert.equal(tab(document,'page').hidden,false);
  assert.equal(tab(document,'page').textContent,'This page');
  assert.equal(tab(document,'page').getAttribute('aria-selected'),'true','a page beside the panel leads the row');
  tool.site(ETRADE);
  assert.equal(tab(document,'page').textContent,'E*TRADE');
  const panel=document.getElementById('finance-snapshot-body');
  assert.deepEqual([...panel.querySelectorAll('button')].map(node=>node.textContent),['Read my E*TRADE accounts']);
  // The tab says which page and the button says what it does, so the panel
  // before a reading is one action and nothing else.
  assert.equal(panel.textContent.trim(),'Read my E*TRADE accounts','no sentence under the action repeating it');
  assert.equal(document.getElementById('finance-page-block').className.includes('settings-group'),true);
  assert.equal(document.querySelector('#finance-page-block .settings-group-title'),null,'the tab is the heading');
  assert.equal(panel.querySelector('.record-row'),null);
  tool.site(null);
  assert.equal(tab(document,'page').textContent,'This page',
    'leaving a recognized site leaves an ordinary page, not nothing');
  tool.stop();restore();
});

// The panel turns to Finance beside a bank page on its own. What it must not do
// is answer a question nobody asked: the figures wait for one press, while the
// ways of getting new ones into the ledger are ready straight away.
test('a quiet arrival shows what can be put in, and none of what is already there',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{saved:[estate,{id:'1-1-20260601',row:'mark',revision:'10000000',portfolio:1,class:1,asOf:'2026-06-01',amount:100000}]});
  await ready(document);
  assert.match(document.getElementById('finance-totals').textContent,/\$100,000/,'chosen by hand, the ledger is the ledger');

  tool.quiet(true);
  tool.site(ETRADE);
  assert.equal(tab(document,'ledger').hidden,true,'the ledger is not even a tab until it is asked for');
  // Not hidden figures — figures that were never built.
  for(const id of ['finance-totals','finance-list','finance-breakdown','finance-trend'])
    assert.equal(document.getElementById(id).textContent,'',id);
  assert.equal(document.body.textContent.includes('100,000'),false,'no balance is anywhere on the page');

  // Everything that puts a figure into the ledger is ready without asking.
  assert.equal(tab(document,'page').hidden,false);
  assert.equal(tab(document,'page').getAttribute('aria-selected'),'true');
  assert.deepEqual([...document.querySelectorAll('#finance-snapshot-body button')].map(node=>node.textContent),['Read my E*TRADE accounts'],
    'one way to read the page, in the block about the page');
  assert.ok(document.getElementById('finance-drop'),'drop a statement');
  assert.equal(document.getElementById('finance-read').disabled,false);
  assert.equal(document.getElementById('finance-entry').hidden,false,'and a record typed by hand');
  assert.equal(document.getElementById('finance-entry').hasAttribute('open'),false,'offered, not opened');
  assert.equal(document.getElementById('finance-actions').textContent,'Show net worth','one action, and it is the one that applies');

  document.querySelector('#finance-actions button').click();
  await settle(()=>tab(document,'ledger').hidden===false);
  assert.equal(tab(document,'ledger').getAttribute('aria-selected'),'true','the press was the asking, so the ledger is what opens');
  assert.match(document.getElementById('finance-totals').textContent,/\$100,000/);

  assert.equal(document.getElementById('finance-actions').textContent,'Refresh');

  // Asked once, answered for the sitting: the next bank page does not cover it
  // up again and ask a second time.
  tool.quiet(true);
  assert.equal(tab(document,'ledger').hidden,false);
  tool.stop();restore();
});

test('reading a page folds it into figures, and saves nothing until Save',async()=>{
  const {document,restore}=setup();
  let sent=null;
  const {tool,writes}=financeHost(document,{saved:[estate],onIntake:value=>{sent=value;}});
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));

  // The page text is sent as a live reading, so today's balances are not dropped
  // for want of a date printed on the page.
  assert.equal(sent.live,true);
  assert.equal(sent.institution,'E*TRADE');
  assert.match(sent.text,/Individual Brokerage/);

  const panel=document.getElementById('finance-snapshot-body');
  assert.match(panel.textContent,/\$124,501|\$124,500\.50/,'each figure shows what was read for it');
  assert.match(panel.textContent,new RegExp(ESTATE),'a taxable account joins the portfolio it is titled to');
  assert.match(panel.textContent,/Rollover IRA · new/,'the IRA heads its own group and says it would be made');
  assert.deepEqual([...panel.querySelectorAll('button')].map(node=>node.textContent),['Save these figures','Edit','Discard']);
  assert.match(panel.textContent,/^as of 2026-09-11/m,'one shared date is stated once, not on every row');
  assert.equal(/figures? read|folded into/.test(panel.textContent),false,'and the figures are not counted back at you');
  assert.equal(writes.length,0,'reading saves nothing');
  assert.equal(document.getElementById('finance-snapshot-status').textContent,'');

  panel.querySelector('button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('Saved 2 figures.'));
  // The portfolio the IRA needed is made first, because a figure cannot be
  // filed into one that does not exist.
  assert.deepEqual(writes.map(write=>write.row),['mark','portfolio','mark']);
  assert.deepEqual(writes.filter(write=>write.row==='mark').map(write=>[write.portfolio,write.class,write.amount,write.asOf]),
    [[1,10,124500.5,'2026-09-11'],[2,10,88000,'2026-09-11']]);
  assert.equal(writes[0].id,'1-10-20260911','a figure is identified by where, what and when — nothing else');
  assert.equal(writes[0].revision,null,'a date with no figure yet is an append');
  // E*TRADE settles no titling of its own, so the IRA is named after the
  // account rather than guessed at — but it is registered as an IRA, which is
  // what keeps it out of the joint estate. A second IRA reading joins it.
  assert.deepEqual([writes[1].name,writes[1].kind],['Rollover IRA',2]);
  assert.equal(writes[1].number,2,'and it is numbered around the portfolio already there');
  assert.equal(document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'),false,'saved figures leave the panel');
  tool.stop();restore();
});

test('figures read with different dates each state their own',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{saved:[estate],reading:{readings:[
    {...READING.readings[0],asOf:'2026-09-11'},
    {...READING.readings[1],asOf:'2026-08-31'}
  ],unread:''}});
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));
  const panel=document.getElementById('finance-snapshot-body');
  assert.equal(panel.textContent.includes('figures · as of'),false,'no single date can stand for both');
  assert.match(panel.textContent,/as of 2026-09-11/);
  assert.match(panel.textContent,/as of 2026-08-31/);
  tool.stop();restore();
});

test('Edit puts the folded amounts in fields, and Save writes what the owner left there',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{saved:[estate]});
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));

  const buttons=()=>[...document.querySelectorAll('#finance-snapshot-body button')];
  buttons().find(node=>node.textContent==='Edit').click();
  const first=document.getElementById('finance-fold-value-0');
  assert.equal(first.value,'124500.5','an amount is offered as read, not as a blank field');
  assert.equal(document.querySelector('label[for=finance-fold-value-0]').textContent,'Liquid securities');
  assert.deepEqual(buttons().map(node=>node.textContent),['Save these figures','Discard']);
  first.value='124600';
  first.dispatchEvent(new document.defaultView.Event('input'));
  buttons()[0].click();
  await settle(()=>writes.filter(write=>write.row==='mark').length===2);
  assert.equal(writes[0].amount,124600,'the corrected amount is what gets saved');
  tool.stop();restore();
});

test('a reading needs a saved connection, and a bad amount is reported without losing the rest',async()=>{
  const {document,restore}=setup();
  // No usable connection: the tool says where one is saved rather than
  // offering a choice the owner has not made yet.
  const {tool:none}=financeHost(document,{saved:[estate],connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:false}]});
  await ready(document);
  none.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('Save an AI connection in Settings'));
  none.stop();

  document.querySelector('main').replaceChildren();
  // Two saved connections, and still no question: connections are managed in
  // Settings, and the reading uses whichever one can answer.
  const {tool,writes}=financeHost(document,{saved:[estate],connections:[
    {id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true},
    {id:'connection-2',name:'Second',provider:'anthropic',hasApiKey:true}
  ]});
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));
  [...document.querySelectorAll('#finance-snapshot-body button')].find(node=>node.textContent==='Edit').click();
  const first=document.getElementById('finance-fold-value-0');
  first.value='not a number';
  first.dispatchEvent(new document.defaultView.Event('input'));
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('valid amount'));
  assert.equal(writes.length,0,'nothing is saved past the row that could not be read');
  assert.match(document.getElementById('finance-snapshot-body').textContent,/Liquid securities/,'the rows stay put to be corrected');
  tool.stop();restore();
});

// Nothing about the reading flow is one broker's: a second site brings its own
// label, its own institution, and its own answer for what an account total is
// made of when the page never says. Chase brings something else as well — one
// sign-on over a joint account, several trusts, an LLC and the children's
// accounts — so the page's own headings decide where its figures land.
const CHASE={id:'chase',label:'Chase',institution:'Chase',kind:'bank'};
const COINBASE={id:'coinbase',label:'Coinbase',institution:'Coinbase',kind:'crypto'};
test('a second account site reads under its own name, its own default class and its own titles',async()=>{
  const {document,restore}=setup();
  let sent=null;
  const {tool,writes}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Eric and Ariana Berry Joint Account · Total Checking',label:'Available balance',class:'unclassified',value:8420.11,asOf:'2026-09-11'},
      {...dated,account:'Berry AE 21 Irrevocable Trust · Self-Directed',label:'Account value',class:'stocks',value:51200,asOf:'2026-09-11'}
    ],unread:''},
    readPage:async()=>({text:'Total Checking  |  $8,420.11',host:'secure.chase.com',title:'Chase Online',trimmed:0,tables:1}),
    onIntake:value=>{sent=value;}
  });
  await ready(document);
  tool.site(CHASE);
  const panel=()=>document.getElementById('finance-snapshot-body');
  assert.match(panel().textContent,/Chase/);
  panel().querySelector('button').click();
  await settle(()=>panel().textContent.includes('Cash'));
  assert.equal(sent.institution,'Chase','the site names the institution the page belongs to');
  assert.equal(sent.live,true);
  assert.match(panel().textContent,/Berry AE 21 Irrevocable Trust · new/,'the trust is named before anything is saved');

  panel().querySelector('button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('Saved 2 figures.'));
  const checking=writes.find(write=>write.class===3),brokerage=writes.find(write=>write.class===1);
  assert.ok(checking,'a figure the reading could not place takes the site’s own class');
  assert.ok(brokerage,'a class the reading did state is kept');
  assert.deepEqual([checking.amount,brokerage.amount],[8420.11,51200]);
  // The joint account is the estate's and joins the portfolio already holding
  // it; the trust is not, and gets its own rather than adding a trust's money
  // to a joint title nobody would see afterwards.
  assert.deepEqual([checking.portfolio,brokerage.portfolio],[1,2]);
  const made=writes.find(write=>write.row==='portfolio');
  assert.deepEqual([made.name,made.kind],['Berry AE 21 Irrevocable Trust',5]);
  tool.stop();restore();
});

// What the fold refused is the only thing the panel cannot show, because the
// evidence for it is a figure that is not on the screen. Two of them arrive
// together here: a page that never named an account, and money behind this
// password that is not the owner's.
test('what the fold left out is said, and a page that only totals its kinds says where to go instead',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Bank accounts',label:'Total',class:'cash',value:2101804.48,asOf:'2026-09-11'},
      {...dated,account:'Investment accounts',label:'Total',class:'liquid',value:14268036.59,asOf:'2026-09-11'}
    ],unread:''},
    readPage:async()=>({text:'Bank accounts  |  $2,101,804.48',host:'secure.chase.com',title:'Chase Online',trimmed:0,tables:1})
  });
  await ready(document);
  tool.site(CHASE);
  const panel=()=>document.getElementById('finance-snapshot-body');
  const said=()=>document.getElementById('finance-snapshot-status').textContent;
  panel().querySelector('button').click();
  await settle(()=>said().includes('Show the accounts themselves'));
  assert.match(said(),/total across accounts/,'the figures were refused, and the line says so');
  assert.equal(panel().textContent.includes('Save these figures'),false,'nothing was filed to review');
  assert.equal(writes.length,0);
  tool.stop();restore();
});

// A card's balance is owed, and the review is the screen where it sits closest
// to the cash it is owed against. Printed the way it is stored — positive, with
// the class carrying the sign — it reads as one more thing held.
test('a debt is reviewed as what it does to the total, and is still typed as what is owed',async()=>{
  const {document,restore}=setup();
  const {tool,writes}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Credit cards · SYNTHETIC REWARDS CARD (...1739)',label:'Current balance',class:'credit',value:15835,asOf:'2026-09-11'}
    ],unread:''},
    readPage:async()=>({text:'Current balance  |  $15,835.00',host:'secure.chase.com',title:'Chase Online',trimmed:0,tables:1})
  });
  await ready(document);
  tool.site(CHASE);
  const panel=()=>document.getElementById('finance-snapshot-body');
  panel().querySelector('button').click();
  await settle(()=>panel().textContent.includes('Credit'));
  assert.match(panel().textContent,/-\$15,835/,'the figure is what it does to net worth');
  assert.match(panel().textContent,/Credit · liability/,'and the word says so as well, for a reader who misses the sign');

  // Correcting it is typing what is owed. The sign belongs to the class, and a
  // negative amount is not a figure this ledger can hold.
  const buttons=()=>[...panel().querySelectorAll('button')];
  buttons().find(node=>node.textContent==='Edit').click();
  await settle(()=>!!panel().querySelector('input'));
  assert.equal(panel().querySelector('input').value,'15835');
  buttons().find(node=>node.textContent==='Save these figures').click();
  await settle(()=>writes.some(write=>write.row==='mark'));
  const filed=writes.find(write=>write.row==='mark');
  assert.equal(filed.amount,15835,'stored positive, under the class that carries the sign');
  assert.equal(filed.class,classById('credit').code);
  tool.stop();restore();
});

test('an account the roster keeps out of the ledger is left out by name',async()=>{
  const {document,restore}=setup();
  const {tool}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Bank accounts · Joint Savings (...8917)',label:'Present balance',class:'cash',value:52000.40,asOf:'2026-09-11'},
      {...dated,account:'Bank accounts · BEDFORD BRIDGE CAPITAL, LLC (...4918)',label:'Present balance',class:'cash',value:77000,asOf:'2026-09-11'}
    ],unread:''},
    readPage:async()=>({text:'Joint Savings  |  $52,000.40',host:'secure.chase.com',title:'Chase Online',trimmed:0,tables:1})
  });
  await ready(document);
  tool.site(CHASE);
  const panel=()=>document.getElementById('finance-snapshot-body');
  panel().querySelector('button').click();
  await settle(()=>panel().textContent.includes('Cash'));
  assert.match(panel().textContent,/Eric and Ariana Berry Estate/);
  assert.equal(panel().textContent.includes('BEDFORD'),false,'it is not offered to be filed');
  assert.match(document.getElementById('finance-snapshot-status').textContent,/Bedford Bridge Capital, LLC/,
    'and the one line about it names it, because a figure that is simply absent says nothing');
  tool.stop();restore();
});

// An exchange states one balance for a page and never says what kind of money
// it is, because to it there is only one kind. The site is what answers: a
// figure read at Coinbase is coin, which is the whole reason the class exists.
test('an exchange page reads under its own name and files what it holds as crypto',async()=>{
  const {document,restore}=setup();
  let sent=null;
  const {tool,writes}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Coinbase',label:'Total balance',class:'unclassified',value:15576.31,asOf:'2026-09-11'}
    ],unread:''},
    readPage:async()=>({text:'Crypto\n$15,576.25\nCash\n$0.06',host:'www.coinbase.com',title:'Coinbase',trimmed:0,tables:0}),
    onIntake:value=>{sent=value;}
  });
  await ready(document);
  tool.site(COINBASE);
  const panel=()=>document.getElementById('finance-snapshot-body');
  assert.match(panel().textContent,/Read my Coinbase accounts/,'the page says whose accounts it is offering to read');
  panel().querySelector('button').click();
  await settle(()=>panel().textContent.includes('Crypto'));
  assert.equal(sent.institution,'Coinbase');
  assert.equal(sent.live,true,'a signed-in page dates its own balances');

  panel().querySelector('button').click();
  await settle(()=>document.getElementById('finance-snapshot-status').textContent.includes('Saved 1 figure.'));
  const saved=writes.find(write=>write.row==='mark');
  assert.deepEqual([saved.class,saved.amount,saved.portfolio],[classById('crypto').code,15576.31,1]);
  tool.stop();restore();
});

// A page states an account's own total and the holdings inside it, and those
// must never be added together. Reading E*TRADE shows three brokered CDs beside
// a $1.6M account value; the account does not hold $300.
test('a partial list of holdings does not replace the account total it sits under',async()=>{
  const {document,restore}=setup();
  const holding={registration:'',scope:'holding',asOf:'2026-09-11',confidence:'high',reason:''};
  const {tool,writes}=financeHost(document,{
    saved:[estate],
    reading:{readings:[
      {...dated,account:'Brokerage',label:'Net Account Value',class:'unclassified',value:1668403},
      {...holding,account:'Brokerage',label:'WSTRN ALLIANCE PHOENIX AZ CD 4.05% 10/30/2026',class:'bonds',value:99.97},
      {...holding,account:'Brokerage',label:'MS BANK NA SALT LAKE CITY UT CD 3.95%',class:'bonds',value:99.96},
      {...dated,account:'',label:'Total Assets',class:'unclassified',scope:'all',value:1791069.16}
    ],unread:''}
  });
  await ready(document);
  tool.site(ETRADE);
  document.querySelector('#finance-snapshot-body button').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));
  const panel=document.getElementById('finance-snapshot-body');
  assert.match(panel.textContent,/^as of 2026-09-11/m,'four lines read, one figure kept');
  // The review is the figures. What the fold declined to count is not written
  // out beside them; the status line says how many were read and how many kept.
  assert.equal(/do not add up|Left out:/.test(panel.textContent),false);
  panel.querySelector('button').click();
  await settle(()=>writes.length===1);
  assert.deepEqual([writes[0].class,writes[0].amount],[classById('liquid').code,1668403]);
  tool.stop();restore();
});
