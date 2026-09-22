// How a figure got into the ledger.
//
// Every dated row points at the import that last wrote it, and the import keeps
// what was read, a fingerprint of it, and each figure it saved with what that
// figure replaced. These cover the trail itself — what an import may hold, what
// became of each line — and the three questions it exists to answer: have I
// filed this statement before, is this money already filed from somewhere else,
// and what did this correction overwrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountFinance} from '../src/finance.js';
import {openSecret} from '../src/secret-vault.js';
import {normalizeFinance,parseRef,recordRef,importRef,importTrail,sameMoney,seenBefore,fingerprint,
  trailSubject,markRef,firmCode,MAX_TRAIL_LINES} from '../src/finance-data.js';

const SCHWAB=firmCode('schwab'),ETRADE=firmCode('etrade');
const estate={id:'p1',row:'portfolio',revision:'r1',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
const mark=(fields)=>{const value={row:'mark',firm:0,importId:null,...fields};return {...value,id:markRef(value),revision:String(Math.round(value.amount*100))};};
const trail=(number,lines,fields={})=>({id:importRef(number),row:'import',revision:String(number),number,kind:1,firm:0,print:'',name:'',note:'',lines,made:[],...fields});

test('an import is a number, a kind and the figures it saved, and nothing it cannot vouch for',()=>{
  const number=1758542400000;
  assert.equal(importRef(number),'i1758542400000');
  assert.deepEqual(parseRef(importRef(number)),{row:'import',number});
  assert.equal(recordRef({row:'import',number}),'i1758542400000');
  const saved=normalizeFinance({row:'import',number,kind:2,print:'0123456789abcdef',name:'  Schwab Q2.pdf ',
    lines:[{ref:'1-10-20260630',amount:'1668402.544',read:1668402.54,was:null,from:['Brokerage ...1234',' ','Total value']}],
    made:['p7','1-10-20260630','h3']});
  // A line is as short as what happened: the amount it was read as is kept only
  // when it differs from what was saved, and nothing that did not happen is
  // written down as null.
  assert.deepEqual(saved,{row:'import',number,kind:2,firm:0,print:'0123456789abcdef',name:'Schwab Q2.pdf',note:'',
    lines:[{ref:'1-10-20260630',amount:1668402.54,from:['Brokerage ...1234','Total value']}],made:['p7','h3']});
  const corrected=normalizeFinance({row:'import',number,kind:4,lines:[{ref:'f5-20260910',amount:-250000,read:-200000,was:500000,wasImport:12}]});
  assert.deepEqual(corrected.lines,[{ref:'f5-20260910',amount:-250000,read:-200000,was:500000,wasImport:12}],'cash out is negative, and so is its trail');
  for(const change of [{kind:0},{kind:'page'},{print:'ABCDEF0123456789'},{lines:[]},{lines:'x'},{number:0},{firm:999},
    {lines:[{ref:'p1',amount:1}]},{lines:[{ref:'i5',amount:1}]},{lines:[{ref:'1-10-20260630',amount:'abc'}]},
    {lines:Array.from({length:MAX_TRAIL_LINES+1},()=>({ref:'1-10-20260630',amount:1}))}])
    assert.throws(()=>normalizeFinance({row:'import',number,kind:1,lines:[{ref:'1-10-20260630',amount:1}],...change}),undefined,JSON.stringify(change));
});

test('a figure names the import that wrote it, and never inherits the one it replaced',()=>{
  const read=normalizeFinance({row:'mark',portfolio:1,class:10,asOf:'2026-09-20',amount:5,importId:1758542400000});
  assert.equal(read.importId,1758542400000);
  // The device saves through the previous record, and a figure retyped by hand
  // did not come from the statement the old one did.
  const retyped=normalizeFinance({row:'mark',portfolio:1,class:10,asOf:'2026-09-20',amount:6},read);
  assert.equal(retyped.importId,null);
  for(const row of [{row:'capital',holding:1,value:1},{row:'valuation',property:1,value:1},{row:'flow',firm:SCHWAB,amount:1}])
    assert.equal(normalizeFinance({...row,asOf:'2026-09-20',importId:7}).importId,7,row.row);
  assert.throws(()=>normalizeFinance({row:'mark',portfolio:1,class:10,asOf:'2026-09-20',amount:5,importId:-1}));
});

test('what became of each figure an import saved is read off the rows, not stored',()=>{
  const first=1000,second=2000;
  const records=[estate,
    mark({portfolio:1,class:10,asOf:'2026-09-20',firm:SCHWAB,amount:1668000,importId:second}),
    mark({portfolio:1,class:3,asOf:'2026-09-20',firm:SCHWAB,amount:0.54,importId:first}),
    trail(first,[{ref:`1-10-20260920-${SCHWAB}`,amount:1668402.54},{ref:`1-3-20260920-${SCHWAB}`,amount:0.54},{ref:'1-12-20260920',amount:9}],{name:'Schwab',firm:SCHWAB}),
    trail(second,[{ref:`1-10-20260920-${SCHWAB}`,amount:1668000,was:1668402.54,wasImport:first}],{kind:4})];
  const [newest,oldest]=importTrail(records);
  assert.equal(newest.number,second,'newest first');
  assert.equal(newest.lines[0].state,'current');
  assert.equal(newest.lines[0].replaced.number,first,'a correction names what it overwrote');
  assert.deepEqual(oldest.lines.map(line=>line.state),['replaced','current','removed']);
  assert.equal(oldest.lines[0].by.number,second,'and a replaced line names what replaced it');
  assert.deepEqual(trailSubject(`1-10-20260920-${SCHWAB}`,records),{what:'Eric and Ariana Berry Estate · Liquid securities',asOf:'2026-09-20'});
});

test('the same money from somewhere else, and the same statement twice, are both recognized',async()=>{
  const records=[estate,
    mark({portfolio:1,class:10,asOf:'2026-06-30',firm:SCHWAB,amount:1668402.54,importId:1000}),
    trail(1000,[{ref:`1-10-20260630-${SCHWAB}`,amount:1668402.54}],{print:await fingerprint('the statement')})];
  // Schwab's own statement, dropped in: no firm, the same cents, the next day.
  assert.equal(sameMoney({portfolio:1,class:10,firm:0,asOf:'2026-07-01',amount:'1668402.54'},records)?.firm,SCHWAB);
  // Not the same pile of money read twice: the same firm is the ordinary
  // next reading, a different amount is a different figure, and a month apart
  // is two statements.
  for(const other of [{firm:SCHWAB},{amount:1668402.55},{asOf:'2026-08-01'},{class:3},{portfolio:2},{amount:0}])
    assert.equal(sameMoney({portfolio:1,class:10,firm:0,asOf:'2026-07-01',amount:1668402.54,...other},records),null,JSON.stringify(other));
  assert.equal(seenBefore(records,await fingerprint('the statement'))?.number,1000);
  assert.equal(seenBefore(records,await fingerprint('another statement')),null);
  assert.equal(seenBefore(records,''),null,'a typed figure has no print, and matches nothing');
  assert.match(await fingerprint(new TextEncoder().encode('the statement').buffer),/^[0-9a-f]{16}$/);
  assert.equal(await fingerprint(new TextEncoder().encode('the statement').buffer),await fingerprint('the statement'),'bytes and text agree');
});

// The tool, wired as the finance page wires it, with a store that behaves like
// the Worker: a write replaces the row at its id.
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
const SITE={id:'etrade',label:'E*TRADE',institution:'E*TRADE',kind:'brokerage'};
const PAGE='Individual Brokerage  |  $124,500.50';
const READING={readings:[{account:'Individual Brokerage',label:'Net Account Value',class:'unclassified',registration:'',
  scope:'account',value:124500.5,asOf:'2026-09-11',confidence:'high',reason:'Net account value.'}],unread:''};
function host(document,saved){
  const writes=[];
  let records=[...saved];
  const tool=mountFinance(document.querySelector('main'),{
    vault:unlockedVault(),credentials:{get:async()=>'token'},
    readPage:async()=>({text:PAGE,host:'us.etrade.com',title:'Accounts',trimmed:0,tables:1}),
    remote:async(token,path)=>path==='/v1/ai-connections'?{connections:[{id:'connection-1',name:'Synthetic',provider:'openai',hasApiKey:true}]}:READING,
    offline:{request:async(token,path,options)=>{
      if(options?.method==='PUT'){
        writes.push(options.value);
        const revision=options.value.row==='import'?String(options.value.number):'r2';
        records=[...records.filter(record=>record.id!==options.value.id),{...options.value,revision}];
      }
      return {records};
    }}
  });
  return {tool,writes};
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

test('a reading says what it would overwrite and what is already filed, and a second read of the same page says so',async()=>{
  const document=setup();
  const typed=1000,dropped=2000;
  const saved=[estate,
    // The same date and firm already holds a different figure, typed by hand.
    mark({portfolio:1,class:10,asOf:'2026-09-11',firm:ETRADE,amount:120000,importId:typed}),
    trail(typed,[{ref:`1-10-20260911-${ETRADE}`,amount:120000}],{kind:4}),
    // And the same money, to the cent, came in two days earlier from a
    // statement with no firm.
    mark({portfolio:1,class:10,asOf:'2026-09-09',firm:0,amount:124500.5,importId:dropped}),
    trail(dropped,[{ref:'1-10-20260909',amount:124500.5}],{kind:2,name:'etrade-august.pdf'})];
  const {tool,writes}=host(document,saved);
  await settle(()=>document.getElementById('finance-list').querySelector('.record-group'));
  tool.site(SITE);
  document.getElementById('finance-page-read').click();
  await settle(()=>document.getElementById('finance-snapshot-body').textContent.includes('Liquid securities'));
  const panel=document.getElementById('finance-snapshot-body');
  assert.match(panel.textContent,/Replaces \$120,000 typed by hand\./);
  const twin=panel.querySelector('.notice--alert');
  assert.equal(twin.textContent,'The same amount is already filed from etrade-august.pdf, as of 2026-09-09.');
  assert.equal(writes.length,0,'nothing is written by reading');

  panel.querySelector('button').click();
  await settle(()=>writes.some(write=>write.row==='import'));
  const [figure,imported]=writes;
  assert.equal(figure.importId,imported.number);
  // The line says what it overwrote and which import had put that there.
  assert.deepEqual(imported.lines,[{ref:`1-10-20260911-${ETRADE}`,amount:124500.5,was:120000,wasImport:typed,from:['Net Account Value']}]);

  // Reading the same page again, unchanged, is recognized by its print.
  document.getElementById('finance-page-read').click();
  await settle(()=>/Already saved/.test(document.getElementById('finance-snapshot-status').textContent));
  assert.match(document.getElementById('finance-snapshot-status').textContent,/^Already saved from this page on \d{4}-\d{2}-\d{2}\.$/);
  tool.stop();
});

test('the page lists every import, newest first, closed to what it read and what has changed since',async()=>{
  const document=setup();
  const first=Date.UTC(2026,8,20,15,0),second=Date.UTC(2026,8,21,15,0);
  const saved=[estate,
    mark({portfolio:1,class:10,asOf:'2026-09-20',firm:SCHWAB,amount:1668000,importId:second}),
    mark({portfolio:1,class:10,asOf:'2026-09-13',firm:SCHWAB,amount:1600000,importId:first}),
    trail(first,[{ref:`1-10-20260920-${SCHWAB}`,amount:1668402.54,from:['Brokerage ...1234 Total value']},
      {ref:`1-10-20260913-${SCHWAB}`,amount:1600000}],{name:'Schwab',firm:SCHWAB,note:'Left out: a total across accounts.'}),
    trail(second,[{ref:`1-10-20260920-${SCHWAB}`,amount:1668000,read:1668400,was:1668402.54,wasImport:first}],{kind:4})];
  const {tool}=host(document,saved);
  await settle(()=>document.getElementById('finance-imports').querySelector('.record-group'));
  const tab=document.getElementById('finance-tabs-imports-tab');
  assert.equal(tab.hidden,false);
  assert.equal(tab.textContent,'Imports');
  const groups=[...document.querySelectorAll('#finance-imports .record-group')];
  assert.deepEqual(groups.map(group=>group.querySelector('.record-group-title').textContent),['Typed by hand','Schwab']);
  assert.deepEqual(groups.map(group=>group.open),[false,false],'closed to their headings');
  // What a reader needs before opening one: where, when, how many, and how
  // many of them have been written over since.
  const heading=groups[1].querySelector('summary').textContent;
  assert.match(heading,/Account page2026-09-\d\d \d\d:\d\d · 2 figures · 1 since changed/);
  assert.equal(heading.split('Schwab').length,2,'a page read is named for its firm once, not twice');
  assert.equal(groups[0].querySelector('.pill'),null,'a typed import is named by its kind, and not tagged with it again');
  const correction=groups[0].querySelector('.record-row').textContent;
  assert.match(correction,/Eric and Ariana Berry Estate · Liquid securities/);
  assert.match(correction,/Read as \$1,668,400 · Replaced \$1,668,403 from Schwab/);
  const read=groups[1].textContent;
  assert.match(read,/Since replaced by hand, 2026-09-2\d/);
  assert.match(read,/From Brokerage \.\.\.1234 Total value/);
  assert.match(read,/Left out: a total across accounts\./);

  // A figure's earlier values say where each came from.
  const history=[...document.querySelectorAll('#finance-list .record-row .footnote')].map(node=>node.textContent);
  assert.ok(history.includes('2026-09-13 · $1,600,000 · Schwab'),history.join('\n'));

  // Quiet, it is not built at all: an import names amounts.
  tool.quiet(true);
  assert.equal(tab.hidden,true);
  assert.equal(document.getElementById('finance-imports').textContent,'');
  tool.stop();
});
