import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinance,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,
  parseFinanceUpdates,foldReadings,financeAttention,legacyLedger,titledOwner,titledHolder,holdsManyTitles,
  institutionName,registrationLabel,
  markRef,portfolioRef,parseRef,dateNumber,dateText,classById,heldOn,MAX_PORTFOLIOS} from '../src/finance-data.js';

const ESTATE='Eric and Ariana Berry Estate';
const estate={row:'portfolio',number:1,name:ESTATE,kind:1,currency:'USD'};
const ira={row:'portfolio',number:2,name:'Eric Berry',kind:2,currency:'USD'};
const mark=(portfolio,cls,asOf,amount)=>({...normalizeFinance({row:'mark',portfolio,class:cls,asOf,amount}),id:markRef({portfolio,class:cls,asOf})});
const ledger=(...rows)=>[{...estate,id:'p1'},{...ira,id:'p2'},...rows];

test('a stored row is a portfolio or four numbers, and nothing else gets in',()=>{
  const figure=normalizeFinance({row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:'1000.005'});
  assert.deepEqual(figure,{row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:1000.01});
  // Nothing that was carried on every record before survives: no name, no
  // institution, no type spelled out, no liquidity, no tags, no history blob.
  assert.deepEqual(Object.keys(normalizeFinance(estate)),['row','number','name','kind','currency']);
  for(const change of [{class:99},{class:'stocks'},{portfolio:0},{portfolio:MAX_PORTFOLIOS+1},{amount:-1},{amount:'abc'},{asOf:'2026-02-30'},{asOf:''},{row:'something'}])
    assert.throws(()=>normalizeFinance({row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:1,...change}),undefined,JSON.stringify(change));
  for(const change of [{kind:99},{name:'  '},{currency:'DOLLAR'},{number:0}])
    assert.throws(()=>normalizeFinance({...estate,...change}),undefined,JSON.stringify(change));
});

test('a date is stored as one number and read back as the date it was',()=>{
  assert.equal(dateNumber('2026-09-19'),20260919);
  assert.equal(dateText(20260919),'2026-09-19');
  assert.equal(markRef({portfolio:2,class:3,asOf:'2026-09-19'}),'2-3-20260919');
  assert.deepEqual(parseRef('2-3-20260919'),{row:'mark',portfolio:2,class:3,asOf:'2026-09-19'});
  assert.deepEqual(parseRef(portfolioRef(4)),{row:'portfolio',number:4});
  for(const bad of ['','p0','1-3-2026','nonsense','1-3-20260919-x'])assert.equal(parseRef(bad),null,bad);
});

test('one figure per portfolio, class and date, so a replayed queued change cannot duplicate one',()=>{
  const first=mark(1,3,'2026-01-01',1000);
  const again=mark(1,3,'2026-01-01',1000);
  assert.equal(first.id,again.id,'the figure identifies itself — the same key is the same row');
  const corrected=mark(1,3,'2026-01-01',1250);
  assert.equal(corrected.id,first.id);
  assert.equal(corrected.amount,1250);
});

test('totals add every class, sign liabilities, and never mix currencies',()=>{
  const euro={row:'portfolio',number:3,name:'Euro account',kind:1,currency:'EUR',id:'p3'};
  const records=[...ledger(
    mark(1,1,'2026-01-01',1000),   // stocks
    mark(1,2,'2026-01-01',400),    // bonds
    mark(1,3,'2026-01-01',200),    // cash
    mark(1,21,'2026-01-01',300),   // mortgage
    mark(2,9,'2026-01-01',5000)    // the IRA, unsplit
  ),euro,mark(3,3,'2026-01-01',500)];
  const usd=financeSummary(records,{currency:'USD',today:'2026-01-02'});
  assert.equal(usd.assets,6600);
  assert.equal(usd.liabilities,300);
  assert.equal(usd.net,6300);
  assert.deepEqual(usd.byClass.map(row=>[row.label,row.total]).sort(),
    [['Bonds',400],['Cash',200],['Mortgage',-300],['Stocks',1000],['Unclassified',5000]]);
  assert.deepEqual(usd.byPortfolio.map(row=>[row.label,row.total]),[['Eric Berry',5000],[ESTATE,1300]]);
  assert.deepEqual(usd.byRegistration.map(row=>row.label).sort(),['IRA','Taxable']);
  assert.equal(financeSummary(records,{currency:'EUR',today:'2026-01-02'}).net,500);
  assert.deepEqual(financeCurrencies(records).map(entry=>entry.currency),['USD','EUR']);
});

// An Unclassified figure is a class like any other. It was tempting to let a
// split supersede it, and that would quietly drop real money out of a portfolio
// holding both — the brokerage total beside the checking balance.
test('an unclassified total counts beside the classes it sits with',()=>{
  const summary=financeSummary(ledger(mark(1,3,'2026-01-01',500),mark(1,9,'2026-01-01',1200)),{currency:'USD',today:'2026-01-02'});
  assert.equal(summary.net,1700);
});

test('a row waiting on a conflict or a deletion is left out of every total',()=>{
  const records=ledger(mark(1,3,'2026-01-01',1000),{...mark(1,1,'2026-01-01',5000),conflict:true},{...mark(1,2,'2026-01-01',900),deleting:true});
  assert.equal(financeSummary(records,{currency:'USD',today:'2026-01-02'}).net,1000);
});

test('staleness is a portfolio’s question, asked once rather than once per class',()=>{
  const records=ledger(mark(1,1,'2026-01-01',10),mark(1,3,'2026-01-01',10),mark(2,9,'2026-05-20',10));
  const summary=financeSummary(records,{currency:'USD',today:'2026-06-01'});
  assert.deepEqual(summary.stale.map(entry=>entry.name),[ESTATE],'one line for the portfolio, not one per figure');
  assert.equal(summary.net,30,'and it is still counted at its last known figure');
  assert.deepEqual(financeAttention(records,{today:'2026-06-01'}),[{id:'p1',name:ESTATE,asOf:'2026-01-01'}]);
});

test('value over time steps between observed figures and never interpolates',()=>{
  const series=netWorthSeries(ledger(
    mark(1,1,'2026-01-01',1000),
    mark(1,1,'2026-03-01',1200),
    mark(1,21,'2026-02-01',300)
  ),{currency:'USD'});
  assert.deepEqual(series.map(point=>[point.asOf,point.net]),[['2026-01-01',1000],['2026-02-01',700],['2026-03-01',900]]);
  assert.equal(heldOn([mark(1,1,'2026-03-01',1200)],'2026-01-01').length,0,'nothing counts before its first figure');
});

test('the ledger reads as portfolios, each with its live figure per class and that figure’s own date',()=>{
  const groups=groupFinanceRecords(ledger(mark(1,3,'2026-01-01',100),mark(1,3,'2026-04-01',150),mark(1,1,'2026-02-01',900)));
  const [first]=groups;
  assert.equal(first.portfolio.name,ESTATE);
  assert.deepEqual(first.rows.map(row=>[row.label,row.current.amount,row.current.asOf]),[['Stocks',900,'2026-02-01'],['Cash',150,'2026-04-01']]);
  assert.equal(first.rows[1].history.length,2,'a class keeps its own history');
  assert.equal(first.total,1050);
});

test('a reading is labelled, never totalled, and a malformed one is dropped rather than fatal',()=>{
  const parsed=parseFinanceUpdates({readings:[
    {account:'Brokerage',label:'Net Account Value',class:'stocks',registration:'',scope:'account',value:1300,asOf:'2026-04-01',confidence:'high'},
    {account:'Brokerage',label:'No date here',class:'cash',scope:'holding',value:5},
    {label:'',value:5,asOf:'2026-04-01'},
    'not an object'
  ],unread:'One line mentioned a transfer with no amount.'});
  assert.equal(parsed.readings.length,1);
  assert.equal(parsed.readings[0].class,classById('stocks').code);
  assert.match(parsed.unread,/transfer/);
  // A class the model invented falls back to Unclassified rather than failing.
  assert.equal(parseFinanceUpdates({readings:[{label:'x',class:'moon rocks',scope:'account',value:1,asOf:'2026-04-01'}]}).readings[0].class,9);
  assert.throws(()=>parseFinanceUpdates({readings:[]}),/did not find any figures/);
});

// The fold is the whole point of the new shape: a page names dozens of things
// and the ledger keeps a handful of numbers.
test('holdings split an account only when they add up to it',()=>{
  const dated={registration:'',scope:'holding',asOf:'2026-09-19',confidence:'high',reason:''};
  const reconciles=foldReadings([
    {...dated,account:'Brokerage',label:'Net Account Value',class:9,scope:'account',value:1000},
    {...dated,account:'Brokerage',label:'VTI',class:1,value:700},
    {...dated,account:'Brokerage',label:'Treasury 2027',class:2,value:300}
  ],[estate],{institution:'Schwab'});
  assert.deepEqual(reconciles.marks.map(row=>[row.class,row.amount]),[[1,700],[2,300]],'the split replaces the total it accounts for');

  // The E*TRADE page from the screenshot: three brokered CDs beside a $1.6M
  // account value. The CDs are not what the account holds.
  const partial=foldReadings([
    {...dated,account:'Brokerage',label:'Net Account Value',class:9,scope:'account',value:1668403},
    {...dated,account:'Brokerage',label:'WSTRN ALLIANCE CD',class:2,value:99.97},
    {...dated,account:'Brokerage',label:'MS BANK CD',class:2,value:99.96}
  ],[estate],{institution:'Schwab'});
  assert.deepEqual(partial.marks.map(row=>[row.class,row.amount]),[[9,1668403]],'the total is kept whole');
  assert.match(partial.notes.join(' '),/do not add up/);
});

test('a total across accounts is left out, and one account stating two totals states one',()=>{
  const dated={registration:'',asOf:'2026-09-19',confidence:'high',reason:''};
  const folded=foldReadings([
    {...dated,account:'',label:'Total Assets',class:9,scope:'all',value:1791069.16},
    {...dated,account:'Brokerage',label:'Current Account Value',class:9,scope:'account',value:0},
    {...dated,account:'Brokerage',label:'Net Account Value',class:9,scope:'account',value:1668403}
  ],[estate],{institution:'Schwab'});
  assert.deepEqual(folded.marks.map(row=>row.amount),[1668403]);
  assert.match(folded.notes.join(' '),/total across accounts was left out/);
  assert.match(folded.notes.join(' '),/Net Account Value was used/);
});

test('a reading lands in the portfolio its registration and institution settle, and proposes one only when it must',()=>{
  const dated={label:'Net Account Value',class:9,scope:'account',asOf:'2026-09-19',confidence:'high',reason:''};
  const folded=foldReadings([
    {...dated,account:'Brokerage',registration:''},
    {...dated,account:'Rollover IRA',registration:'ira'}
  ].map((reading,index)=>({...reading,value:[412000,88000][index]})),[{...estate,id:'p1'}],{institution:'Schwab'});
  assert.deepEqual(folded.marks.map(row=>[row.name,row.amount,row.isNew]),
    [[ESTATE,412000,false],['Eric Berry',88000,true]],'the taxable figure joins the estate; the IRA is titled to a person');
  assert.deepEqual(folded.portfolios.map(entry=>[entry.name,entry.kind,entry.number]),[['Eric Berry',2,2]]);

  // A bank site says what an account total is made of when the page does not,
  // and a taxable account at an institution that holds one title and settles
  // none of its own joins the one taxable portfolio rather than starting a
  // second — which is the whole consolidation: a checking account is not its
  // own portfolio.
  const bank=foldReadings([{...dated,account:'Total Checking',registration:'',value:8420.11}],[{...estate,id:'p1'}],
    {institution:'Ally',defaultClass:classById('cash').code});
  assert.equal(bank.marks[0].class,classById('cash').code);
  assert.equal(bank.marks[0].name,ESTATE);
  assert.deepEqual(bank.portfolios,[],'nothing new had to be made');

  // With nothing to join and no titling, it proposes one named for the account
  // rather than guessing which of several it belongs to.
  const fresh=foldReadings([{...dated,account:'Total Checking',registration:'',value:8420.11}],[],{institution:'Ally'});
  assert.deepEqual(fresh.portfolios.map(entry=>[entry.name,entry.kind]),[['Total Checking',1]]);
});

// Chase is one sign-on over a whole structure: the joint account, the trusts,
// the LLC and the children's accounts all answer to the same password, and the
// page says which is which. Reading it must not make them one pile.
test('a bank holding several titles files each account under the one that holds it',()=>{
  const dated={label:'Current balance',class:9,scope:'account',registration:'',asOf:'2026-09-19',confidence:'high',reason:''};
  const chase={institution:'Chase',defaultClass:classById('cash').code};
  const folded=foldReadings([
    {...dated,account:'Eric and Ariana Berry Joint Account · Total Checking (...1234)',value:84200.11},
    {...dated,account:'Berry 2020 Descendants’ Irrevocable Trust (...4421)',value:250000},
    {...dated,account:'BERRY AE 21 IRREV TRUST (...8890)',value:125000},
    {...dated,account:'Celsie LLC · Business Complete Banking',value:41000},
    {...dated,account:'Maisie Ava Berry',value:5200},
    {...dated,account:'Celeste Arabella Berry',value:5100}
  ],[{...estate,id:'p1'}],chase);
  assert.deepEqual(folded.marks.map(row=>[row.name,row.amount]),[
    [ESTATE,84200.11],
    ['Berry 2020 Descendants’ Irrevocable Trust',250000],
    ['Berry AE 21 Irrevocable Trust',125000],
    ['Celsie LLC',41000],
    ['Maisie Ava Berry',5200],
    ['Celeste Arabella Berry',5100]
  ],'six accounts, six titles, and the joint one joins the estate already in the ledger');
  assert.deepEqual(folded.portfolios.map(entry=>[entry.name,registrationLabel(entry.kind)]),[
    ['Berry 2020 Descendants’ Irrevocable Trust','Trust'],
    ['Berry AE 21 Irrevocable Trust','Trust'],
    ['Celsie LLC','Entity'],
    ['Maisie Ava Berry','Custodial'],
    ['Celeste Arabella Berry','Custodial']
  ],'each one registered the way its title is, not the way the first account was');
  assert.deepEqual(folded.marks.map(row=>row.class),new Array(6).fill(classById('cash').code));

  // A title the roster has never seen — there are more of these — keeps the
  // name the page gave it and says what it is. What it must never do is land in
  // the estate because the estate is the only taxable portfolio there is.
  const unknown=foldReadings([{...dated,account:'Berry 2024 GST Exempt Trust (...7710)',value:900}],[{...estate,id:'p1'}],chase);
  assert.deepEqual(unknown.portfolios.map(entry=>[entry.name,registrationLabel(entry.kind)]),
    [['Berry 2024 GST Exempt Trust (...7710)','Trust']]);
  assert.equal(unknown.marks[0].name.includes('Estate'),false);

  // And the investment accounts behind the same sign-on are not cash for having
  // been read at a bank.
  const invested=foldReadings([{...dated,account:'Berry AE 21 Irrevocable Trust · J.P. Morgan Managed Portfolio',value:612000}],[],chase);
  assert.equal(invested.marks[0].class,9,'unsplit, and asking to be split — not filed as cash');
  assert.equal(invested.marks[0].name,'Berry AE 21 Irrevocable Trust');
});

test('an institution that settles its own titling answers however the name is spelled, and by registration',()=>{
  for(const institution of ['Charles Schwab','Schwab Bank','schwab','Charles Schwab & Co., Inc.'])
    assert.equal(titledOwner(institution),ESTATE,institution);
  for(const institution of ['','Fidelity','E*TRADE'])assert.equal(titledOwner(institution),'',institution);
  // An IRA is registered to one person by law and cannot sit in a joint estate.
  assert.equal(titledOwner('Charles Schwab','ira'),'Eric Berry');
  assert.equal(titledOwner('Schwab Bank','roth'),'Eric Berry');
  // A place that holds accounts for several titles settles none of them by
  // itself; the account in front of the reader is what answers.
  assert.equal(titledOwner('Chase'),'');
  assert.equal(holdsManyTitles('Chase'),true);
  assert.equal(holdsManyTitles('Schwab'),false);
  assert.equal(titledHolder('Chase','CELSIE LLC BUSINESS COMPLETE BANKING')?.owner,'Celsie LLC');
  assert.equal(titledHolder('Chase','Chase Total Checking (...1234)'),null,'a nickname naming nobody is nobody');
  // One institution, one spelling, whatever the page calls itself.
  assert.equal(institutionName('Charles Schwab'),'Schwab');
  assert.equal(institutionName('JPMorgan Chase Bank, N.A.'),'Chase');
  assert.equal(institutionName('Schwab Bank'),'Schwab');
  assert.equal(institutionName('E*TRADE'),'E*TRADE');
});

// The retrofit. Eight accounts in one estate are one estate, and every dated
// figure comes across — not only the newest.
test('the record-per-account ledger migrates to portfolios and classes, keeping all of its history',()=>{
  const {portfolios,marks,moved}=legacyLedger([
    {name:'Brokerage',institution:'Schwab',kind:'brokerage',owner:ESTATE,currency:'USD',ownership:100,value:412000,asOf:'2026-09-19',
     history:JSON.stringify([{asOf:'2026-09-19',value:412000},{asOf:'2026-06-30',value:390000}])},
    {name:'Checking',institution:'Schwab',kind:'bank',owner:ESTATE,currency:'USD',ownership:100,value:0.54,asOf:'2026-09-19',
     history:JSON.stringify([{asOf:'2026-09-19',value:0.54}])},
    {name:'IRA',institution:'Schwab',kind:'retirement',owner:'Eric Berry',currency:'USD',ownership:100,value:122667,asOf:'2026-09-19',
     history:JSON.stringify([{asOf:'2026-09-19',value:122667}])},
    // A half interest was weighted by its ownership share; that is applied once
    // here, because the model it moves into has no such field.
    {name:'Fund II',institution:'Meridian',kind:'private',owner:'Berry Family Trust',currency:'USD',ownership:50,value:400,asOf:'2026-09-19',history:'[]'}
  ]);
  assert.deepEqual(portfolios.map(entry=>[entry.name,entry.kind]),[[ESTATE,1],['Eric Berry',2],['Berry Family Trust',5]]);
  assert.deepEqual(marks.map(row=>[row.portfolio,row.class,row.asOf,row.amount]),[
    [1,3,'2026-09-19',0.54],
    [1,9,'2026-06-30',390000],
    [1,9,'2026-09-19',412000],
    [2,9,'2026-09-19',122667],
    [3,4,'2026-09-19',200]
  ]);
  assert.deepEqual(moved.map(entry=>[entry.from,entry.portfolio,entry.class,entry.dates]),[
    ['Brokerage',ESTATE,'Unclassified',2],
    ['Checking',ESTATE,'Cash',1],
    ['IRA','Eric Berry','Unclassified',1],
    ['Fund II','Berry Family Trust','Private equity',1]
  ]);
});

test('a record with no owner is titled by its institution on the way across',()=>{
  const {portfolios}=legacyLedger([
    {name:'Brokerage',institution:'Charles Schwab',kind:'brokerage',owner:'',currency:'USD',value:1,asOf:'2026-09-19',history:'[]'},
    {name:'Rollover IRA',institution:'Charles Schwab',kind:'retirement',owner:'',currency:'USD',value:1,asOf:'2026-09-19',history:'[]'}
  ]);
  assert.deepEqual(portfolios.map(entry=>entry.name),[ESTATE,'Eric Berry']);
});
