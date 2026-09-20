import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {firmCode,firmId,quarterNumber,quarterName,quarterEnded,classById} from '../src/finance-data.js';
import {firmQuarters} from '../src/firm-history.js';
import {firmLabel} from '../src/account-sites.js';
import {FirmQuarters} from '../src/components/firms.js';

// A figure is filed under whose money it is, so where it is held survives only
// in the firm the figure carries. These tests are about the series that reads
// it back: what a quarter means, which quarters exist at all, and what must
// never be compared with what.
const UBS=firmCode('ubs'),MS=firmCode('morgan-stanley'),CHASE=firmCode('chase');
const LIQUID=classById('liquid').code,CASH=classById('cash').code,CREDIT=classById('credit').code;
const estate={id:'p1',row:'portfolio',revision:'r1',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
const trust={id:'p2',row:'portfolio',revision:'r1',number:2,name:'Berry 2020 Irrevocable Family Trust',kind:5,currency:'USD'};
const swiss={id:'p3',row:'portfolio',revision:'r1',number:3,name:'Zurich',kind:1,currency:'CHF'};
const mark=(portfolio,cls,firm,asOf,amount)=>
  ({id:`${portfolio}-${cls}-${asOf.replace(/-/g,'')}-${firm}`,row:'mark',revision:String(amount),
    portfolio,class:cls,firm,asOf,amount});

test('a quarter is what the firm held at the end of it, not what was read in it',()=>{
  const [ubs]=firmQuarters([estate,trust,
    // March: both accounts read.
    mark(1,LIQUID,UBS,'2026-03-31',1_000_000),mark(2,LIQUID,UBS,'2026-03-31',4_000_000),
    // June: only the estate is re-read. The trust is not gone — it stands at
    // its March figure, exactly as it stands in net worth.
    mark(1,LIQUID,UBS,'2026-06-30',1_250_000)
  ]);
  assert.deepEqual(ubs.quarters.map(quarter=>[quarter.label,quarter.amount,quarter.figures]),
    [['2026 Q1',5_000_000,2],['2026 Q2',5_250_000,2]]);
  assert.equal(ubs.quarters.at(-1).change,250_000,'and the quarter is measured against the whole of the one before');
});

test('a card read beside the accounts is owed, and comes off the firm’s total',()=>{
  const [chase]=firmQuarters([estate,
    mark(1,CASH,CHASE,'2026-09-30',80_000),mark(1,CREDIT,CHASE,'2026-09-30',12_500)
  ]);
  assert.equal(chase.quarters.at(-1).amount,67_500);
});

test('a quarter nobody read is not a row',()=>{
  const [ubs]=firmQuarters([estate,
    mark(1,LIQUID,UBS,'2026-03-31',1_000_000),
    // Nothing in Q2. The figure still counts towards net worth all summer; it
    // is not an observation of the summer, and a flat line drawn through it
    // would claim one.
    mark(1,LIQUID,UBS,'2026-09-30',1_400_000)
  ]);
  assert.deepEqual(ubs.quarters.map(quarter=>quarter.label),['2026 Q1','2026 Q3']);
  assert.equal(ubs.quarters.at(-1).change,400_000);
});

test('two firms in one portfolio and one class on one day are two series',()=>{
  // The case that made this necessary: the roster folds Chase and UBS into the
  // same four entities, so before a figure carried its firm these two were one
  // key and the second reading of the day wrote over the first.
  const firms=firmQuarters([estate,
    mark(1,LIQUID,CHASE,'2026-09-30',16_369_841),
    mark(1,LIQUID,UBS,'2026-09-30',26_925_389)
  ]);
  assert.deepEqual(firms.map(firm=>[firm.label,firm.latest]),
    [['UBS',26_925_389],['Chase',16_369_841]],'largest first, and neither has taken the other’s money');
  // Each firm's own figures are read on their own before the step function
  // sees them, so one firm can never be holding another's money here — whatever
  // the ledger's own key does about the two of them.
  assert.deepEqual(firms.map(firm=>firm.quarters.at(-1).figures),[1,1]);
});

test('a figure that names no firm belongs to none of them',()=>{
  // Typed by hand, or folded out of a dropped statement: nothing in either says
  // where it came from, and a heading over them would name nowhere.
  const firms=firmQuarters([estate,
    mark(1,CASH,0,'2026-09-30',5_000),{id:'1-3-20260930',row:'mark',revision:'1',portfolio:1,class:CASH,asOf:'2026-09-30',amount:5_000}
  ]);
  assert.deepEqual(firms,[]);
});

test('currencies are two answers at one firm, never one',()=>{
  const ledger=[estate,swiss,
    mark(1,LIQUID,UBS,'2026-09-30',2_000_000),mark(3,CASH,UBS,'2026-09-30',750_000)];
  assert.deepEqual(firmQuarters(ledger).map(firm=>firm.latest),[2_000_000]);
  assert.deepEqual(firmQuarters(ledger,{currency:'CHF'}).map(firm=>firm.latest),[750_000]);
});

test('a quarter covering less of the firm than the newest one draws no change',()=>{
  const [ms]=firmQuarters([estate,trust,
    // The first quarter held one account; the second holds both. The rise is
    // the ledger filling up, not money arriving, so nothing is drawn against
    // it and the row says how much of the firm it covered.
    mark(1,LIQUID,MS,'2026-03-31',900_000),
    mark(1,LIQUID,MS,'2026-06-30',950_000),mark(2,LIQUID,MS,'2026-06-30',3_000_000)
  ]);
  assert.deepEqual(ms.quarters.map(quarter=>[quarter.label,quarter.complete,quarter.change,quarter.figures,quarter.whole]),
    [['2026 Q1',false,null,1,2],['2026 Q2',true,null,2,2]]);
});

test('the panel names the firm, dates a reading taken before the quarter closed, and says what cannot be compared',()=>{
  const {document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;
  const node=FirmQuarters(firmQuarters([estate,trust,
    mark(1,LIQUID,UBS,'2026-06-30',1_000_000),mark(1,LIQUID,UBS,'2026-07-02',1_250_000),
    mark(1,LIQUID,MS,'2026-03-31',400_000),
    mark(1,LIQUID,MS,'2026-06-30',420_000),mark(2,LIQUID,MS,'2026-06-30',80_000)
  ]),'USD');
  document.querySelector('main').append(node);
  assert.deepEqual([...node.querySelectorAll('.group-title')].map(title=>title.textContent),
    ['UBS','Morgan Stanley'],'the firm is the heading, which is the whole of what was missing');
  const rows=[...node.querySelectorAll('.trend-row')].map(row=>row.textContent);
  assert.match(rows[1],/2026 Q3/);
  assert.match(rows[1],/\+\$250,000/,'a quarter says what it is against the one before');
  assert.match(rows[1],/2026-07-02/,'and says when it was read when that was not the quarter’s end');
  assert.equal(/2026-06-30/.test(rows[0]),false,'a quarter read in its closing month says nothing extra');
  assert.match(rows[2],/1 of 2 figures/,'a partial quarter says so in words rather than in a colour');
  assert.equal(node.querySelectorAll('.trend-row--partial').length,1);
  assert.equal(FirmQuarters([]).textContent,'No account page has been read yet.');
});

test('the words a code stands for, and the quarter a date falls in',()=>{
  assert.deepEqual([firmLabel(UBS),firmLabel(MS),firmId(UBS),firmLabel(0)],['UBS','Morgan Stanley','ubs','']);
  assert.deepEqual([quarterNumber('2026-01-01'),quarterNumber('2026-12-31'),quarterName(20264)],[20261,20264,'2026 Q4']);
  assert.deepEqual([quarterEnded(20261),quarterEnded(20262),quarterEnded(20263),quarterEnded(20264)],
    ['2026-03-31','2026-06-30','2026-09-30','2026-12-31']);
});
