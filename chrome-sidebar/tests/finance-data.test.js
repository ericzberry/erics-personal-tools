import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinance,valueHistory,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,matchFinanceUpdates,parseFinanceUpdates,effectiveValue,MAX_HISTORY} from '../src/finance-data.js';
const sealed=JSON.stringify({v:1,iv:'aa',ciphertext:'bb'});
const base={kind:'brokerage',name:'Synthetic brokerage',value:1000,asOf:'2026-01-01'};

test('a record is validated, defaulted from its kind, and files its first snapshot',()=>{
  const record=normalizeFinance(base);
  assert.equal(record.currency,'USD');
  assert.equal(record.ownership,100);
  assert.equal(record.liquidity,'Liquid');
  assert.deepEqual(valueHistory(record.history),[{asOf:'2026-01-01',value:1000,source:''}]);
  for(const change of [{kind:'not-a-kind'},{name:'  '},{value:-1},{value:'abc'},{asOf:'2026-02-30'},{asOf:''},{currency:'DOLLAR'},{ownership:101},{secret:'plain text account number',secretHint:'x'}])
    assert.throws(()=>normalizeFinance({...base,...change}),undefined,JSON.stringify(change));
  assert.throws(()=>normalizeFinance({...base,secret:sealed}),/together with a short hint/);
});

test('history is keyed by as-of date, so revalidating a queued change cannot duplicate a snapshot',()=>{
  const first=normalizeFinance(base);
  const second=normalizeFinance({value:1200,asOf:'2026-02-01'},first);
  assert.deepEqual(valueHistory(second.history).map(entry=>entry.asOf),['2026-02-01','2026-01-01']);
  // The Worker revalidates the same queued value against the same previous
  // record; the result must be identical, not a third entry.
  const revalidated=normalizeFinance({value:1200,asOf:'2026-02-01'},first);
  assert.equal(revalidated.history,second.history);
  const corrected=normalizeFinance({value:1250,asOf:'2026-02-01'},second);
  assert.deepEqual(valueHistory(corrected.history).map(entry=>entry.value),[1250,1000]);
});

test('a backdated correction is filed in history without moving the current value',()=>{
  const current=normalizeFinance({value:1200,asOf:'2026-02-01'},normalizeFinance(base));
  const backfilled=normalizeFinance({value:900,asOf:'2025-12-01'},current);
  assert.equal(backfilled.value,1200);
  assert.equal(backfilled.asOf,'2026-02-01');
  assert.deepEqual(valueHistory(backfilled.history).map(entry=>entry.asOf),['2026-02-01','2026-01-01','2025-12-01']);
});

test('history is bounded so one record cannot grow without limit',()=>{
  let record=normalizeFinance(base);
  for(let day=1;day<=MAX_HISTORY+20;day++)record=normalizeFinance({value:day,asOf:new Date(Date.UTC(2020,0,day)).toISOString().slice(0,10)},record);
  assert.equal(valueHistory(record.history).length,MAX_HISTORY);
});

test('totals weight a partial interest, sign liabilities, and never mix currencies',()=>{
  const records=[
    normalizeFinance({...base,value:1000}),
    normalizeFinance({kind:'private',name:'Fund II',value:400,asOf:'2026-01-01',ownership:50,unfunded:100}),
    normalizeFinance({kind:'mortgage',name:'House loan',value:300,asOf:'2026-01-01'}),
    normalizeFinance({kind:'bank',name:'Euro account',value:500,asOf:'2026-01-01',currency:'EUR'})
  ];
  const usd=financeSummary(records,{currency:'USD',today:'2026-01-02'});
  assert.equal(usd.assets,1200);
  assert.equal(usd.liabilities,300);
  assert.equal(usd.net,900);
  assert.equal(usd.unfunded,100);
  const eur=financeSummary(records,{currency:'EUR',today:'2026-01-02'});
  assert.equal(eur.net,500);
  assert.deepEqual(financeCurrencies(records).map(entry=>entry.currency),['USD','EUR']);
  assert.equal(effectiveValue(records[1]),200);
});

test('a record waiting on a conflict or a deletion is left out of every total',()=>{
  const records=[normalizeFinance(base),{...normalizeFinance({...base,name:'Disputed',value:5000}),conflict:true},{...normalizeFinance({...base,name:'Going',value:900}),deleting:true}];
  assert.equal(financeSummary(records,{currency:'USD',today:'2026-01-02'}).net,1000);
});

test('stale records are named but still counted at their last known value',()=>{
  const summary=financeSummary([normalizeFinance(base)],{currency:'USD',today:'2026-06-01'});
  assert.equal(summary.stale.length,1);
  assert.equal(summary.net,1000);
});

test('net worth over time steps between observed snapshots and never interpolates',()=>{
  const brokerage=normalizeFinance({value:1200,asOf:'2026-03-01'},normalizeFinance(base));
  const loan=normalizeFinance({kind:'mortgage',name:'House loan',value:300,asOf:'2026-02-01'});
  const series=netWorthSeries([brokerage,loan],{currency:'USD'});
  assert.deepEqual(series.map(point=>[point.asOf,point.net]),[['2026-01-01',1000],['2026-02-01',700],['2026-03-01',900]]);
  // Nothing is reported before a record's first snapshot.
  assert.equal(series[0].records,1);
});

test('records group by type with assets before liabilities',()=>{
  const groups=groupFinanceRecords([normalizeFinance({kind:'mortgage',name:'Loan',value:1,asOf:'2026-01-01'}),normalizeFinance(base)]);
  assert.deepEqual(groups.map(group=>group.side),['asset','liability']);
});

test('AI drafts are matched on the device and a malformed draft is dropped, not fatal',()=>{
  const parsed=parseFinanceUpdates({updates:[
    {name:'Synthetic brokerage',value:1300,asOf:'2026-04-01',kind:'brokerage',confidence:'high'},
    {name:'No date here',value:5,kind:'bank'},
    {name:'',value:5,asOf:'2026-04-01'},
    'not an object'
  ],unread:'One line mentioned a transfer with no amount.'});
  assert.equal(parsed.updates.length,1);
  assert.match(parsed.unread,/transfer/);
  const matched=matchFinanceUpdates(parsed.updates,[normalizeFinance({...base,id:'one'})]);
  assert.equal(matched[0].match.name,'Synthetic brokerage');
  // An unknown name proposes a new record rather than guessing an existing one.
  assert.equal(matchFinanceUpdates(parseFinanceUpdates({updates:[{name:'Somewhere else',value:1,asOf:'2026-04-01'}]}).updates,[normalizeFinance({...base,id:'one'})])[0].match,null);
  assert.throws(()=>parseFinanceUpdates({updates:[]}),/did not find any figures/);
});

test('an ambiguous name is reported rather than applied to one of the candidates',()=>{
  const records=[{...normalizeFinance({...base,name:'Checking',institution:'Bank A'}),id:'a'},{...normalizeFinance({...base,name:'Checking',institution:'Bank B'}),id:'b'}];
  const [draft]=matchFinanceUpdates(parseFinanceUpdates({updates:[{name:'Checking',value:10,asOf:'2026-04-01',kind:'bank'}]}).updates,records);
  assert.equal(draft.match,null);
  assert.equal(draft.ambiguous,true);
  // Naming the institution resolves it.
  const [scoped]=matchFinanceUpdates(parseFinanceUpdates({updates:[{name:'Checking',institution:'Bank B',value:10,asOf:'2026-04-01',kind:'bank'}]}).updates,records);
  assert.equal(scoped.match.id,'b');
});
