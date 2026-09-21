// A figure knows where it was read.
//
// The ledger files a figure under whose money it is, and for a while that was
// the whole of its key: one amount per portfolio, asset class and date. Two
// firms holding the same trust's securities then wrote to one key, and the
// second reading replaced the first — silently, because the device had just
// saved the first and so held exactly the revision the Worker expected.
//
// That is what these cover: the firm is part of a figure's identity, a figure
// stated by hand belongs to no firm and keeps the key it always had, and every
// firm's newest figure counts rather than only the last one written.
import test from 'node:test';
import assert from 'node:assert/strict';
import {markRef,parseRef,normalizeFinance,heldOn,foldReadings,financeSummary,
  recordRef,firmCode,firmId} from '../src/finance-data.js';

const today='2026-09-20';
const CHASE=firmCode('chase'),UBS=firmCode('ubs');
// The four the family actually holds, spelled as the rosters in finance-data.js
// spell them, because that spelling is what folds both firms' accounts into the
// same portfolios — which is the whole of the collision.
const PORTFOLIOS=[
  {row:'portfolio',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'},
  {row:'portfolio',number:2,name:'Berry 2020 Irrevocable Family Trust',kind:5,currency:'USD'},
  {row:'portfolio',number:3,name:'Berry 2020 Descendants’ Irrevocable Trust',kind:5,currency:'USD'},
  {row:'portfolio',number:4,name:'Berry AE 21 Irrevocable Trust',kind:5,currency:'USD'}
];
// A store that behaves the way the Worker does: a row is addressed by its ref,
// and writing a ref again replaces what was there. Getting this wrong in the
// test would hide the very thing the test is for.
const ledger=()=>{
  const rows=new Map(PORTFOLIOS.map(entry=>[recordRef(entry),entry]));
  return {
    save(marks){for(const mark of marks)rows.set(markRef(mark),normalizeFinance({row:'mark',...mark}));},
    records:()=>[...rows.values()],
    refs:()=>[...rows.keys()].filter(ref=>/^\d/.test(ref))
  };
};

test('a firm is part of a figure’s identity, and a figure nobody read is not', ()=>{
  const read={row:'mark',portfolio:3,class:10,asOf:today,firm:UBS};
  const typed={row:'mark',portfolio:3,class:10,asOf:today,firm:0};
  assert.equal(markRef(read),`3-10-20260920-${UBS}`);
  // Unchanged for a figure stated by hand, so nothing already stored, queued
  // offline, or typed into the form is addressed differently than before.
  assert.equal(markRef(typed),'3-10-20260920');
  assert.equal(markRef({...typed,firm:undefined}),'3-10-20260920');
  assert.notEqual(markRef(read),markRef({...read,firm:CHASE}));
  assert.deepEqual(parseRef(markRef(read)),{row:'mark',portfolio:3,class:10,asOf:today,firm:UBS});
  assert.deepEqual(parseRef(markRef(typed)),{row:'mark',portfolio:3,class:10,asOf:today,firm:0});
});

test('a figure carries its firm through validation, and refuses one that is not a firm', ()=>{
  assert.equal(normalizeFinance({row:'mark',portfolio:1,class:3,asOf:today,amount:10,firm:CHASE}).firm,CHASE);
  // No firm is the ordinary case, not an error: every figure typed into the
  // form is one, and so is every figure the ledger held before firms existed.
  assert.equal(normalizeFinance({row:'mark',portfolio:1,class:3,asOf:today,amount:10}).firm,0);
  assert.throws(()=>normalizeFinance({row:'mark',portfolio:1,class:3,asOf:today,amount:10,firm:999}),/institution/i);
});

test('every firm’s newest figure counts, not only the newest figure', ()=>{
  const marks=[
    {portfolio:3,class:10,asOf:'2026-09-14',amount:1_000_000,firm:CHASE},
    {portfolio:3,class:10,asOf:'2026-09-20',amount:3_082_837,firm:UBS},
    // An older reading at the same firm is superseded by its own newer one,
    // exactly as it always was — the step function still runs, per firm.
    {portfolio:3,class:10,asOf:'2026-08-01',amount:2_900_000,firm:UBS}
  ];
  const live=heldOn(marks,today);
  assert.equal(live.length,2);
  assert.equal(live.reduce((total,mark)=>total+mark.amount,0),4_082_837);
  assert.deepEqual(live.map(mark=>mark.firm).sort(),[CHASE,UBS].sort());
});

test('Chase and UBS both count in one trust instead of one replacing the other', ()=>{
  const store=ledger();
  // Both pages name the same trusts, which is correct and is the point: the
  // rosters exist so a trust's account at either firm reaches the trust's own
  // portfolio rather than starting a second one beside it.
  const chase=foldReadings([
    {account:'Investment accounts · BERRY 2020 IRREV FAM TR (...5007)',label:'Present balance',
      value:1_000_000,class:9,scope:'account',asOf:today},
    {account:'Investment accounts · BERRY 2020 DESCENDANTS TR (...5012)',label:'Present balance',
      value:2_000_000,class:9,scope:'account',asOf:today}
  ],PORTFOLIOS,{institution:'Chase',firm:CHASE,defaultClass:3,today});
  store.save(chase.marks);
  assert.equal(financeSummary(store.records(),{today}).assets,3_000_000);

  const ubs=foldReadings([
    {account:'Irrevocable Tst (Y1 12345)',label:'Net account value',
      value:3_090_776,class:9,scope:'account',asOf:today},
    {account:'Descendants Tst (Y1 12346)',label:'Net account value',
      value:3_082_837,class:9,scope:'account',asOf:today}
  ],PORTFOLIOS,{institution:'UBS',firm:UBS,defaultClass:10,today});
  store.save(ubs.marks);

  // Four rows, not two: the same two portfolios and the same asset class, kept
  // apart by the firm each was read at.
  assert.equal(store.refs().length,4);
  assert.equal(financeSummary(store.records(),{today}).assets,9_173_613);
});

test('reading the same firm’s page twice replaces its own figures and adds nothing', ()=>{
  const store=ledger();
  const readings=[{account:'Descendants Tst (Y1 12346)',label:'Net account value',
    value:3_082_837,class:9,scope:'account',asOf:today}];
  const fold=()=>foldReadings(readings,PORTFOLIOS,{institution:'UBS',firm:UBS,defaultClass:10,today});
  store.save(fold().marks);
  store.save(fold().marks);
  assert.equal(store.refs().length,1);
  assert.equal(financeSummary(store.records(),{today}).assets,3_082_837);
});

test('the firm registry answers in both directions and refuses a place it does not know', ()=>{
  assert.equal(firmId(firmCode('morgan-stanley')),'morgan-stanley');
  assert.equal(firmCode('not-a-bank'),0);
  assert.equal(firmId(0),'');
  // Codes are permanent, so no two places may share one.
  const codes=['chase','ubs','schwab','morgan-stanley','etrade','carta'].map(firmCode);
  assert.equal(new Set(codes).size,codes.length);
  assert.ok(codes.every(code=>code>0));
});
