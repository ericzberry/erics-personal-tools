import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {firmCode,firmId,quarterNumber,quarterName,quarterEnded,classById,flowRef,parseRef,normalizeFinance,recordRef} from '../src/finance-data.js';
import {firmPerformance} from '../src/firm-history.js';
import {firmLabel} from '../src/account-sites.js';
import {InstitutionCard,returnText} from '../src/components/finance-overview.js';

// A figure is filed under whose money it is, so where it is held survives only
// in the firm the figure carries; the cash the owner moves in and out is
// recorded against the firm itself. These tests are about the series that
// reads both back: what a firm returned, what it was handed, which readings
// count, and what must never be compared with what.
const UBS=firmCode('ubs'),MS=firmCode('morgan-stanley'),CHASE=firmCode('chase');
const LIQUID=classById('liquid').code,CASH=classById('cash').code,CREDIT=classById('credit').code;
const estate={id:'p1',row:'portfolio',revision:'r1',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
const trust={id:'p2',row:'portfolio',revision:'r1',number:2,name:'Berry 2020 Irrevocable Family Trust',kind:5,currency:'USD'};
const swiss={id:'p3',row:'portfolio',revision:'r1',number:3,name:'Zurich',kind:1,currency:'CHF'};
const mark=(portfolio,cls,firm,asOf,amount)=>
  ({id:`${portfolio}-${cls}-${asOf.replace(/-/g,'')}-${firm}`,row:'mark',revision:String(amount),
    portfolio,class:cls,firm,asOf,amount});
const flow=(firm,asOf,amount)=>({id:flowRef({firm,asOf}),row:'flow',revision:String(amount*100),firm,asOf,amount});

test('cash in or out is its own row: a firm, a day and a signed amount',()=>{
  assert.deepEqual(parseRef('f5-20260910'),{row:'flow',firm:5,asOf:'2026-09-10'});
  assert.equal(parseRef('f0-20260910'),null,'firm 0 names no firm');
  assert.equal(recordRef({row:'flow',firm:5,asOf:'2026-09-10'}),'f5-20260910');
  assert.deepEqual(normalizeFinance({row:'flow',firm:UBS,asOf:'2026-09-10',amount:'-250000.004'}),
    {row:'flow',firm:UBS,asOf:'2026-09-10',amount:-250000});
  assert.throws(()=>normalizeFinance({row:'flow',firm:UBS,asOf:'2026-09-10',amount:0}),/how much/);
  assert.throws(()=>normalizeFinance({row:'flow',firm:0,asOf:'2026-09-10',amount:5}),/institution/);
  assert.throws(()=>normalizeFinance({row:'flow',firm:UBS,asOf:'',amount:5}),/date/);
});

test('cash that went in is not a return: a firm handed $500,000 earned only what it grew by',()=>{
  const [ubs]=firmPerformance([estate,
    mark(1,LIQUID,UBS,'2026-09-01',1_000_000),mark(1,LIQUID,UBS,'2026-10-01',1_600_000),
    // In halfway through a thirty-day period, so it worked for half of it.
    flow(UBS,'2026-09-16',500_000)
  ]);
  assert.deepEqual(ubs.periods.map(period=>[period.flow,period.gain,period.return]),[[500_000,100_000,0.08]],
    'the $600,000 rise is $500,000 handed over and $100,000 earned on an average of $1,250,000');
  assert.deepEqual(ubs.total,{flow:500_000,gain:100_000,return:0.08});
});

test('a return over several readings is chained, so it says how the firm did and not how much it was given',()=>{
  const [ubs]=firmPerformance([estate,
    // Wired in on the day of the second reading, and in the balance read that
    // day: it earned nothing in the first period and all of the second.
    mark(1,LIQUID,UBS,'2026-09-01',1_000_000),mark(1,LIQUID,UBS,'2026-10-01',5_955_000),
    mark(1,LIQUID,UBS,'2026-12-31',6_550_500),
    flow(UBS,'2026-10-01',5_000_000)
  ]);
  assert.deepEqual(ubs.periods.map(period=>period.return),[-0.045,0.1],
    'a deposit on a reading day is part of the balance read that day');
  assert.equal(ubs.total.return,0.0505,'−4.5% then +10%, chained — not the 555% the balance rose by');
  assert.deepEqual(ubs.points.map(point=>point.index),[1,0.955,1.0505]);
});

test('cash moved before the first full reading, or since the last, is shown but not counted',()=>{
  const [ubs]=firmPerformance([estate,
    mark(1,LIQUID,UBS,'2026-09-01',1_000_000),mark(1,LIQUID,UBS,'2026-10-01',1_050_000),
    flow(UBS,'2026-08-15',250_000),flow(UBS,'2026-10-12',75_000)]);
  assert.equal(ubs.total.flow,0);
  assert.equal(ubs.total.gain,50_000);
  assert.deepEqual(ubs.flows.map(entry=>[entry.flow.asOf,entry.before,entry.waiting,entry.counted]),
    [['2026-10-12',false,true,false],['2026-08-15',true,false,false]],'newest first, each saying where it stands');
});

test('the firm held what the step function says, not only what was re-read',()=>{
  const [ubs]=firmPerformance([estate,trust,
    mark(1,LIQUID,UBS,'2026-09-30',1_000_000),mark(2,LIQUID,UBS,'2026-09-30',4_000_000),
    // December: only the estate is re-read. The trust is not gone — it stands
    // at its September figure, exactly as it stands in net worth.
    mark(1,LIQUID,UBS,'2026-12-31',1_250_000)
  ]);
  assert.deepEqual(ubs.quarters.map(quarter=>[quarter.label,quarter.value,quarter.gain,quarter.return]),
    [['2026 Q4',5_250_000,250_000,0.05]]);
});

test('a card read beside the accounts is owed: it comes off the firm, and a firm of nothing but debt has no return',()=>{
  const [chase]=firmPerformance([estate,
    mark(1,CASH,CHASE,'2026-09-30',80_000),mark(1,CREDIT,CHASE,'2026-09-30',12_500)]);
  assert.equal(chase.value,67_500);
  const [amex]=firmPerformance([estate,
    mark(1,CREDIT,firmCode('american-express'),'2026-09-30',4_000),mark(1,CREDIT,firmCode('american-express'),'2026-10-31',6_000)]);
  assert.equal(amex.total.return,null,'a balance owed has no return to speak of');
});

test('a quarter nobody read is not a row, and a period is added to the quarter it ends in',()=>{
  const [ubs]=firmPerformance([estate,
    mark(1,LIQUID,UBS,'2026-07-15',1_000_000),mark(1,LIQUID,UBS,'2026-09-30',1_050_000),
    // Nothing in Q4. The figure still counts towards net worth all winter; a
    // flat line drawn through it would claim an observation nobody made.
    mark(1,LIQUID,UBS,'2027-03-31',1_155_000)
  ]);
  assert.deepEqual(ubs.quarters.map(quarter=>[quarter.label,quarter.return]),[['2026 Q3',0.05],['2027 Q1',0.1]]);
});

test('a reading covering less of the firm than the newest one is not an observation',()=>{
  const [ms]=firmPerformance([estate,trust,
    // The first reading held one account; the next holds both. The rise is the
    // ledger filling up, not money arriving, so the record starts at the
    // first reading that holds the whole firm.
    mark(1,LIQUID,MS,'2026-09-10',900_000),
    mark(1,LIQUID,MS,'2026-09-30',950_000),mark(2,LIQUID,MS,'2026-09-30',3_000_000),
    mark(1,LIQUID,MS,'2026-12-31',990_000),mark(2,LIQUID,MS,'2026-12-31',3_150_000)
  ]);
  assert.equal(ms.from,'2026-09-30');
  assert.deepEqual(ms.periods.map(period=>[period.from,period.to]),[['2026-09-30','2026-12-31']]);
});

test('two firms are two series, a figure with no firm is in neither, and currencies are never mixed',()=>{
  const firms=firmPerformance([estate,
    mark(1,LIQUID,CHASE,'2026-09-30',16_369_841),mark(1,LIQUID,UBS,'2026-09-30',26_925_389),
    mark(1,CASH,0,'2026-09-30',5_000)]);
  assert.deepEqual(firms.map(firm=>[firm.label,firm.value]),[['UBS',26_925_389],['Chase',16_369_841]],'largest first');
  // Two portfolios in dollars and one in francs: dollars is the main currency.
  const ledger=[estate,trust,swiss,mark(1,LIQUID,UBS,'2026-09-30',2_000_000),mark(3,CASH,UBS,'2026-09-30',750_000),flow(UBS,'2026-09-20',1)];
  assert.deepEqual(firmPerformance(ledger).map(firm=>firm.value),[2_000_000]);
  const [chf]=firmPerformance(ledger,{currency:'CHF'});
  assert.equal(chf.value,750_000);
  assert.deepEqual(chf.flows,[],'cash is recorded in the main currency and counts only there');
});

test('a firm with cash recorded and nothing read is still a firm, waiting for its first reading',()=>{
  const [ms]=firmPerformance([estate,flow(MS,'2026-09-12',400_000)]);
  assert.equal(ms.value,null);
  assert.equal(ms.flows[0].waiting,true);
});

test('the card says what the firm returned, what it earned against what it was handed, and dates a quarter read early',()=>{
  const {document}=parseHTML('<html><body><main></main></body></html>');
  globalThis.document=document;
  const [ubs]=firmPerformance([estate,
    mark(1,LIQUID,UBS,'2026-09-01',1_000_000),mark(1,LIQUID,UBS,'2026-11-20',1_600_000),
    flow(UBS,'2026-09-16',500_000),flow(UBS,'2026-12-02',-50_000)]);
  const card=InstitutionCard(ubs,{currency:'USD'});
  document.querySelector('main').append(card);
  assert.equal(card.querySelector('.firm-name').textContent,'UBS');
  assert.equal(card.querySelector('.firm-return').textContent,returnText(ubs.total.return));
  assert.match(card.querySelector('.firm-split').textContent,/earned\$500,000 added$/);
  const quarter=card.querySelector('.firm-quarter:not(.firm-quarter--head)');
  assert.match(quarter.textContent,/^2026 Q42026-11-20/,'a quarter last read before its closing month says the day');
  assert.deepEqual([...card.querySelectorAll('.firm-cash .record-meta')].map(node=>node.textContent),['taken out','added']);
  assert.deepEqual([...card.querySelectorAll('.firm-cash .record-row > p')].map(node=>node.textContent),['Counts from the next reading.']);
  assert.ok(card.querySelector('.firm-cash .amount--negative'),'cash out reads as money out');
  assert.equal(card.querySelectorAll('.line-chart').length,1,'two readings draw a line');
  // One reading is a balance, not yet a return.
  const [once]=firmPerformance([estate,mark(1,LIQUID,UBS,'2026-09-01',1_000_000)]);
  const lone=InstitutionCard(once,{currency:'USD'});
  assert.equal(lone.querySelector('.firm-return'),null);
  assert.equal(lone.querySelector('.line-chart'),null);
  assert.match(lone.textContent,/A return starts with the next reading\./);
  assert.deepEqual([returnText(0.0712),returnText(-0.004),returnText(null)],['+7.1%','−0.4%','—']);
});

test('the words a code stands for, and the quarter a date falls in',()=>{
  assert.deepEqual([firmLabel(UBS),firmLabel(MS),firmId(UBS),firmLabel(0)],['UBS','Morgan Stanley','ubs','']);
  assert.deepEqual([quarterNumber('2026-01-01'),quarterNumber('2026-12-31'),quarterName(20264)],[20261,20264,'2026 Q4']);
  assert.deepEqual([quarterEnded(20261),quarterEnded(20262),quarterEnded(20263),quarterEnded(20264)],
    ['2026-03-31','2026-06-30','2026-09-30','2026-12-31']);
});
