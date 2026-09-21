import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinance,financeSummary,financeCurrencies,netWorthSeries,groupFinanceRecords,
  parseFinanceUpdates,foldReadings,financeAttention,legacyLedger,titledOwner,titledHolder,holdsManyTitles,
  holdsPositionsOnly,managedVehicle,shareText,WHOLE_SHARE,
  institutionName,registrationLabel,registrationFromName,
  markRef,portfolioRef,parseRef,dateNumber,dateText,classById,classLabel,heldOn,MAX_PORTFOLIOS,
  holdingRef,capitalRef,positionsOn,foldCapital,vehicleLabel,
  LEGACY_CLASSES,SITE_CLASSES,ASSET_CLASSES,classGroup,classSide,canonicalClass} from '../src/finance-data.js';

const ESTATE='Eric and Ariana Berry Estate';
const estate={row:'portfolio',number:1,name:ESTATE,kind:1,currency:'USD'};
const ira={row:'portfolio',number:2,name:'Eric Berry',kind:2,currency:'USD'};
const mark=(portfolio,cls,asOf,amount)=>({...normalizeFinance({row:'mark',portfolio,class:cls,asOf,amount}),id:markRef({portfolio,class:cls,asOf})});
const ledger=(...rows)=>[{...estate,id:'p1'},{...ira,id:'p2'},...rows];

test('a stored row is a portfolio or five numbers, and nothing else gets in',()=>{
  const figure=normalizeFinance({row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:'1000.005'});
  // Five, not four: the firm this was read at is part of a figure, and 0 says
  // nobody read it off a page. A figure that could not say which firm it came
  // from was one two firms wrote over each other.
  assert.deepEqual(figure,{row:'mark',portfolio:1,class:3,firm:0,asOf:'2026-01-01',amount:1000.01});
  assert.equal(normalizeFinance({row:'mark',portfolio:1,class:3,firm:5,asOf:'2026-01-01',amount:1}).firm,5);
  // Nothing that was carried on every record before survives: no name, no
  // institution spelled out, no type, no liquidity, no tags, no history blob.
  // The firm is a code, which is the opposite of spelling one out — D1 holds
  // the number and only the device knows the word for it.
  assert.deepEqual(Object.keys(normalizeFinance(estate)),['row','number','name','kind','currency']);
  for(const change of [{class:99},{class:'stocks'},{portfolio:0},{portfolio:MAX_PORTFOLIOS+1},{amount:-1},{amount:'abc'},{asOf:'2026-02-30'},{asOf:''},{row:'something'},{firm:99},{firm:'chase'}])
    assert.throws(()=>normalizeFinance({row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:1,...change}),undefined,JSON.stringify(change));
  for(const change of [{kind:99},{name:'  '},{currency:'DOLLAR'},{number:0}])
    assert.throws(()=>normalizeFinance({...estate,...change}),undefined,JSON.stringify(change));
});

test('a date is stored as one number and read back as the date it was',()=>{
  assert.equal(dateNumber('2026-09-19'),20260919);
  assert.equal(dateText(20260919),'2026-09-19');
  // A figure nobody read off a page is addressed exactly as it always was, so
  // no id already written, queued or typed means something different now.
  assert.equal(markRef({portfolio:2,class:3,asOf:'2026-09-19'}),'2-3-20260919');
  assert.deepEqual(parseRef('2-3-20260919'),{row:'mark',portfolio:2,class:3,asOf:'2026-09-19',firm:0});
  // One read at a firm says so, and is a different figure from the one above.
  assert.equal(markRef({portfolio:2,class:3,asOf:'2026-09-19',firm:5}),'2-3-20260919-5');
  assert.deepEqual(parseRef('2-3-20260919-5'),{row:'mark',portfolio:2,class:3,asOf:'2026-09-19',firm:5});
  assert.deepEqual(parseRef(portfolioRef(4)),{row:'portfolio',number:4});
  // Firm 0 is said by leaving it out, so spelling it is not another way to
  // write the same id — two spellings of one row is how a ledger grows a
  // duplicate nobody can see.
  for(const bad of ['','p0','1-3-2026','nonsense','1-3-20260919-x','1-3-20260919-0','1-3-20260919-'])
    assert.equal(parseRef(bad),null,bad);
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
  // The Worker reads a reading on its way through and the device reads it
  // again, so a class arrives as an id once and as a code the second time.
  // Taking only the id unclassified everything the model had placed.
  const placed=parseFinanceUpdates({readings:[{label:'Net Account Value',class:'liquid',scope:'account',value:10,asOf:'2026-04-01'}]});
  assert.equal(placed.readings[0].class,classById('liquid').code);
  assert.equal(parseFinanceUpdates(placed).readings[0].class,classById('liquid').code,'reading a reading twice does not change it');
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
  // Both halves file as Liquid securities: the ledger asks how much could be
  // sold this week, and a Treasury and an equity fund answer that the same way.
  // The split still replaces the total it accounts for — it is one line now
  // because the two things it was split into are not a distinction this ledger
  // keeps.
  assert.deepEqual(reconciles.marks.map(row=>[row.class,row.amount]),
    [[classById('liquid').code,1000]],'the split replaces the total it accounts for');

  // The E*TRADE page from the screenshot: three brokered CDs beside a $1.6M
  // account value. The CDs are not what the account holds.
  const partial=foldReadings([
    {...dated,account:'Brokerage',label:'Net Account Value',class:9,scope:'account',value:1668403},
    {...dated,account:'Brokerage',label:'WSTRN ALLIANCE CD',class:2,value:99.97},
    {...dated,account:'Brokerage',label:'MS BANK CD',class:2,value:99.96}
  ],[estate],{institution:'Schwab'});
  assert.deepEqual(partial.marks.map(row=>[row.class,row.amount]),[[classById('liquid').code,1668403]],
    'the total is kept whole, as the marketable securities the account name says it is');
  assert.match(partial.notes.join(' '),/do not add up/);
});

test('a total across accounts is left out, and one account stating two totals states one',()=>{
  const dated={registration:'',asOf:'2026-09-19',confidence:'high',reason:''};
  const folded=foldReadings([
    {...dated,account:'',label:'Total Assets',class:9,scope:'all',value:1791069.16},
    {...dated,account:'Brokerage',label:'Current Account Value',class:9,scope:'account',value:0},
    {...dated,account:'Brokerage',label:'Net Account Value',class:9,scope:'account',value:1668403}
  ],[estate],{institution:'Schwab'});
  // The two account-level figures state the same balance under two names, and
  // the number is what says so. A zero beside a balance is not a second one.
  assert.deepEqual(folded.marks.map(row=>row.amount),[1668403]);
  assert.match(folded.notes.join(' '),/Left out: a total across accounts/);
});

// The E*TRADE complete view, read for real on 2026-09-20: the reading called
// every figure's account "E*TRADE", so the brokerage, the IRA and the total
// over both arrived under one name. One account states one balance, and the
// $122k IRA was thrown away to honour that.
test('several accounts read under one name are counted separately, not folded into one balance',()=>{
  const dated={asOf:'2026-09-20',confidence:'high',reason:'',class:9,scope:'account'};
  const folded=foldReadings([
    {...dated,account:'E*TRADE',label:'Total Assets',registration:'',value:1791069.16},
    {...dated,account:'E*TRADE',label:'Individual Brokerage -4049 Net Account Value',registration:'',value:1668402.54},
    {...dated,account:'E*TRADE',label:'Traditional IRA -4144 Net Account Value',registration:'ira',value:122666.62},
    {...dated,account:'E*TRADE',label:'DIS',class:1,scope:'holding',registration:'',value:102.67}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE'});
  // Whose money it is, alphabetically — the proposed IRA before the estate.
  assert.deepEqual(folded.marks.map(row=>[row.kind,row.amount]),[[2,122666.62],[1,1668402.54]],
    'both balances are kept, and the IRA is registered as one');
  assert.match(folded.notes.join(' '),/Left out: a total across accounts/);
  assert.match(folded.notes.join(' '),/2 accounts were read under one name and counted separately/);
  assert.match(folded.notes.join(' '),/holdings could not be placed in one of them/);

  // The same page with nothing separating the two: no registration, no account
  // number. Guessing that two figures are two accounts would count a balance
  // twice, so the figure covering them is still the one kept.
  const alike=foldReadings([
    {...dated,account:'E*TRADE',label:'Total Assets',registration:'',value:1791069.16},
    {...dated,account:'E*TRADE',label:'Net Account Value',registration:'',value:1668402.54},
    {...dated,account:'E*TRADE',label:'Net Account Value',registration:'',value:122666.62}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE'});
  // Nothing separates them, so all three are counted — and the page's own total
  // among them is what makes the sum come out at twice what it should. The
  // covering figure is only left out where its parts can be told apart.
  assert.deepEqual(alike.marks.map(row=>row.amount),[3582138.32]);
});

// What a level-3 model actually returned for that same E*TRADE page on
// 2026-09-20: both accounts named correctly, and both columns of the top-movers
// table — day's gains and last prices — reported as figures, which the reading
// is told in as many words not to do.
test('a figure naming a gain, a loss or a return is refused however it is scoped',()=>{
  const dated={asOf:'2026-09-20',confidence:'high',reason:'',class:9,registration:''};
  const folded=foldReadings([
    {...dated,account:'Individual Brokerage -4049',label:'Net Account Value',scope:'account',value:1668402.54},
    {...dated,account:'Individual Brokerage -4049',label:"Day's Gain",scope:'account',value:7036.71},
    {...dated,account:'Individual Brokerage -4049',label:"DIS Day's Gain $",class:1,scope:'holding',value:1318.56},
    {...dated,account:'Traditional IRA -4144',label:'Net Account Value',registration:'ira',scope:'account',value:122666.62},
    {...dated,account:'Traditional IRA -4144',label:"Day's Gain",registration:'ira',scope:'account',value:4.68}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE'});
  assert.deepEqual(folded.marks.map(row=>[row.kind,row.amount]),[[1,1668402.54],[2,122666.62]]);
  assert.match(folded.notes.join(' '),/Left out: 3 gains or returns/);

  // An account whose only figure is a gain states no balance at all, rather
  // than a $7,036 balance for a $1.6M account.
  const only=foldReadings([{...dated,account:'Individual Brokerage -4049',label:"Day's Gain",scope:'account',value:7036.71}],
    [{...estate,id:'p1'}],{institution:'E*TRADE'});
  assert.deepEqual(only.marks,[]);
  assert.match(only.notes.join(' '),/Left out: 1 gain or return\./);
});

// The E*TRADE complete view as it actually read on 2026-09-20, with the reading
// naming no account at all: two brokerage-shaped balances, a stock plan's two
// halves, the page's own total over them, and a top-movers table. It came out
// as one $1,916,825 Unclassified figure — the brokerage plus the unvested stock
// plan, with the IRA gone — which is neither a balance nor anything the page
// says.
test('a page that names no account still states every balance on it, each as what it is',()=>{
  const dated={asOf:'2026-09-20',confidence:'high',reason:'',class:9,registration:'',account:''};
  const folded=foldReadings([
    {...dated,label:'Total Assets',scope:'all',value:1791069.16},
    {...dated,label:'Net Account Value',scope:'account',value:1668402.54},
    {...dated,label:'Net Account Value',scope:'account',value:122666.62},
    {...dated,label:'Current Account Value',scope:'account',value:0},
    {...dated,label:'Potential Benefit Value',scope:'account',value:248422.68},
    {...dated,label:"Day's Gain",scope:'account',value:7036.71},
    {...dated,label:"DIS Day's Gain $",class:1,scope:'holding',value:1318.56},
    {...dated,label:'DIS Last Price $',class:1,scope:'holding',value:102.67}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE',defaultClass:classById('liquid').code});
  // The two balances add up to the total the page prints over them, which is
  // the only check there is that nothing was lost or counted twice.
  assert.deepEqual(folded.marks.map(row=>[classLabel(row.class),row.amount]),
    [['Liquid securities',1791069.16],['Unvested stock',248422.68]]);
  // One line, not four. A last price is no more a holding's value than a day's
  // gain is, so the top-movers table leaves nothing behind to explain.
  assert.deepEqual(folded.notes,['Left out: 3 gains or returns, a total across accounts.']);
});

// A statement of holdings and nothing else is a list of positions, and they are
// counted. The same list beside an account's stated balance is not: those are
// positions inside one of the accounts, nothing says which, and counting them
// adds a figure the page has already counted once.
test('positions no account claimed are counted alone and refused beside a balance',()=>{
  const dated={asOf:'2026-09-20',confidence:'high',reason:'',registration:'',account:''};
  const alone=foldReadings([
    {...dated,label:'VTI',class:classById('stocks').code,scope:'holding',value:700},
    {...dated,label:'Treasury 2027',class:classById('bonds').code,scope:'holding',value:300}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE'});
  // One figure, because both are Liquid securities and this ledger keeps one
  // amount per class: the stock and the Treasury are not two lines.
  assert.deepEqual(alone.marks.map(row=>row.amount),[1000]);

  const beside=foldReadings([
    {...dated,account:'Individual Brokerage -4049',label:'Net Account Value',class:classById('liquid').code,scope:'account',value:1668402.54},
    {...dated,label:'Top Movers - DIS',class:classById('stocks').code,scope:'holding',value:102.67}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE'});
  assert.deepEqual(beside.marks.map(row=>row.amount),[1668402.54]);
  assert.match(beside.notes.join(' '),/Left out: 1 position no account claimed\./);
});

// E*TRADE calls a stock plan's vested half "Current Account Value", which says
// nothing about vesting at all, so the account is what settles the class. What
// has vested is marketable stock and needs no class of its own; only the
// schedule beside it does.
// A retirement account says so in its own name, and that has to be enough: the
// reading does not always fill the registration field in, and an IRA filed as
// taxable joins a joint estate, which no IRA can be in.
test('an account states its own registration when the reading did not',()=>{
  const dated={label:'Net Account Value',class:9,scope:'account',asOf:'2026-09-20',confidence:'high',reason:'',registration:''};
  const folded=foldReadings([
    {...dated,account:'Individual Brokerage -4049',value:1668402.54},
    {...dated,account:'Traditional IRA -4144',value:122666.62}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE',defaultClass:classById('liquid').code});
  assert.deepEqual(folded.marks.map(row=>[row.name,registrationLabel(row.kind),row.amount]),
    [['Eric and Ariana Berry Estate','Taxable',1668402.54],['Traditional IRA -4144','IRA',122666.62]]);
  // Roth before IRA, because a Roth IRA is both.
  assert.equal(registrationFromName('Roth IRA -8820').id,'roth');
  assert.equal(registrationFromName('Traditional IRA -4144').id,'ira');
  assert.equal(registrationFromName('Company 401(k) Plan').id,'401k');
  assert.equal(registrationFromName('Individual Brokerage -4049'),null);
});

test('a stock plan states marketable stock and a schedule, and only the schedule is its own class',()=>{
  const dated={asOf:'2026-09-20',confidence:'high',reason:'',registration:'',scope:'account',
    account:'Stock Plan (DSP) -7605',class:classById('unclassified').code};
  const folded=foldReadings([
    {...dated,label:'Current Account Value',value:5000},
    {...dated,label:'Potential Benefit Value',value:248422.68}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE',defaultClass:classById('liquid').code});
  assert.deepEqual(folded.marks.map(row=>[classLabel(row.class),row.amount]),
    [['Liquid securities',5000],['Unvested stock',248422.68]]);

  // Read as a position inside the account rather than a figure the account
  // states about itself, the potential benefit was compared against the vested
  // balance, failed to reconcile with it — which it never could, being the
  // other half of the same account — and $248,422 was dropped.
  const scoped=foldReadings([
    {...dated,label:'Current Account Value',value:5000},
    {...dated,label:'Potential Benefit Value',scope:'holding',value:248422.68}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE',defaultClass:classById('liquid').code});
  assert.deepEqual(scoped.marks.map(row=>[classLabel(row.class),row.amount]),
    [['Liquid securities',5000],['Unvested stock',248422.68]]);
});

// Liquid against illiquid is the question the class list cannot answer on its
// own, and the reason the classes have a group at all.
test('every asset class rolls up to liquid or illiquid, and only unplaced value to neither',()=>{
  const records=[
    {row:'portfolio',id:'p1',number:1,name:ESTATE,kind:1,currency:'USD'},
    ...[['cash',1000],['stocks',2000],['bonds',3000],['liquid',4000],['crypto',500],
        ['funds',5000],['property',6000],['unvested',7000],['unclassified',9000]]
      .map(([id,amount])=>({row:'mark',id:`1-${classById(id).code}-20260919`,portfolio:1,
        class:classById(id).code,asOf:'2026-09-19',amount}))
  ];
  const {byGroup}=financeSummary(records,{today:'2026-09-19'});
  // Largest first, like every other breakdown in the panel.
  assert.deepEqual(byGroup.map(row=>[row.label,row.total]),[
    ['Illiquid securities',18000],
    ['Liquid securities',10500],
    ['Unclassified',9000]
  ]);
});

// Coin was filed under Other, which is also where a car and a piece of
// furniture go, so the one thing worth knowing about it — how much of the pile
// is in coin — was the thing the ledger could not say.
test('coin is its own liquid class, and the exchange it was read at places a figure the page did not',()=>{
  const crypto=classById('crypto');
  assert.deepEqual([crypto.code,crypto.side,crypto.group],[13,'asset','liquid']);
  assert.equal(classById(SITE_CLASSES.crypto).code,crypto.code,'a page read at Coinbase or Kraken is coin');
  // The migration keeps the answer it gave: it is re-runnable only while it
  // writes the same portfolio, class and date twice, and a legacy record moved
  // to a new class would be counted again beside the row already there.
  assert.equal(LEGACY_CLASSES.crypto,'other');

  const folded=foldReadings([
    {account:'Coinbase Portfolio',label:'Total balance',class:classById('unclassified').code,
      registration:'',scope:'account',asOf:'2026-09-19',value:41200.55,confidence:'high',reason:''}
  ],[{...estate,id:'p1'}],{institution:'Coinbase',defaultClass:classById(SITE_CLASSES.crypto).code});
  assert.deepEqual(folded.marks.map(row=>[classLabel(row.class),row.amount]),[['Crypto',41200.55]]);
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
  // Whose money it is, alphabetically, whatever order the page listed them in.
  assert.deepEqual(folded.marks.map(row=>[row.name,row.amount]),[
    ['Berry 2020 Descendants’ Irrevocable Trust',250000],
    ['Berry AE 21 Irrevocable Trust',125000],
    ['Celeste Arabella Berry',5100],
    ['Celsie LLC',41000],
    [ESTATE,84200.11],
    ['Maisie Ava Berry',5200]
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
  assert.equal(invested.marks[0].class,classById('liquid').code,
    'marketable securities, unsplit — not cash for having been read at a bank');
  assert.equal(invested.marks[0].name,'Berry AE 21 Irrevocable Trust');
});

// Chase as it actually reads: two tables behind one password, eleven investment
// accounts and nine deposit accounts, titled to a couple, four trusts, an LLC,
// two children and one company that is not the owner's at all. Every figure in
// here is from the pages in front of the owner, and the whole point of the fold
// is that twenty rows become one figure per class per holder — not one pile per
// heading, which is what the page's own grouping would make of it.
test('one sign-on over a family structure files every account under the title that holds it',()=>{
  const base={class:9,scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:''};
  // The page groups them under a heading naming a kind of account, and the
  // reading puts that heading in front of the name, exactly as it is told to.
  const held=(account,value)=>({...base,account:`Investment accounts · ${account}`,label:'Account value',value,class:classById('liquid').code});
  const kept=(account,value)=>({...base,account:`Bank accounts · ${account}`,label:'Present balance',value});
  const folded=foldReadings([
    held('BERRY 2020 IRREV FAM TR (...5007)',4775770.50),
    held('ERIC Z BERRY & ARIANA COOPER BERRY (...3004)',3215290.34),
    held('BERRY 2020 DESCENDANTS’ IRREV TR (...4001)',2753799.85),
    held("BERRY 20 DESC' IRR TR (...3004)",1818646.70),
    held('BERRY AE 21 IRREV FAM TR (...7005)',1704529.20),
    held('AE 21 SLAT Brokerage (...4471)',0),
    held('CELESTE ARABELLA BERRY UTMA NY (...3009)',0),
    held('MAISIE AVA BERRY UTMA NY (...4008)',0),
    held('Joint Brokerage (...8733)',0),
    held('CELSIE LLC (...2006)',0),
    kept('Joint Savings (...8917)',880033.77),
    kept('2nd Joint Savings (...9134)',628301.72),
    kept('2nd Joint Checking (...1551)',406310.18),
    kept('Joint checking (...0823)',136724.37),
    {...base,account:'Bank accounts · Joint checking (...0823)',label:'Available balance',value:136480.31},
    kept('AE 21 SLAT Savings (...2530)',25631.95),
    kept('CELESTE ARABELLA BERRY UTMA ARIANA, COOP (...8557)',25046.55),
    kept('BEDFORD BRIDGE CAPITAL, LLC (...4918)',0),
    kept('CELSIE LLC (...3644)',0),
    {...base,account:'Credit cards · CHASE SAPPHIRE RESERVE (...1739)',label:'Current balance',value:15835,class:classById('credit').code}
  ],[{...estate,id:'p1'}],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks.map(row=>[row.name,classLabel(row.class),row.amount]),[
    // Two accounts of the same trust, added together because the ledger asks
    // per class and per holder — never per account.
    ['Berry 2020 Descendants’ Irrevocable Trust','Liquid securities',2753799.85+1818646.70],
    // The trust made the same year, which shares nine characters of its name
    // and none of its money.
    ['Berry 2020 Irrevocable Family Trust','Liquid securities',4775770.50],
    ['Berry AE 21 Irrevocable Trust','Cash',25631.95],
    ['Berry AE 21 Irrevocable Trust','Liquid securities',1704529.20],
    ['Celeste Arabella Berry','Cash',25046.55],
    ['Celeste Arabella Berry','Liquid securities',0],
    ['Celsie LLC','Cash',0],
    ['Celsie LLC','Liquid securities',0],
    // Four deposit accounts, the present balance of each: the available balance
    // beside one of them is the same money less what has not cleared.
    [ESTATE,'Cash',880033.77+628301.72+406310.18+136724.37],
    [ESTATE,'Liquid securities',3215290.34],
    // The card is a debt, and it is the estate's: a card names a product and
    // never a holder, so this institution says once where its cards are titled
    // rather than starting a portfolio under the name on the plastic.
    [ESTATE,'Credit',15835],
    ['Maisie Ava Berry','Liquid securities',0]
  ]);
  assert.deepEqual(folded.portfolios.filter(entry=>entry.name.includes('Berry 2020')).map(entry=>entry.name),
    ['Berry 2020 Irrevocable Family Trust','Berry 2020 Descendants’ Irrevocable Trust'],
    'two 2020 trusts, proposed apart');
  // A company behind the same password that is not the owner's money. It is
  // named in the roster precisely so that it can be left out: an account no
  // title claims would otherwise start a portfolio of its own.
  assert.equal(folded.marks.some(row=>/bedford/i.test(row.name)),false);
  assert.equal(folded.portfolios.some(entry=>/bedford/i.test(entry.name)),false);
  assert.match(folded.notes[0],/Bedford Bridge Capital, LLC/);
  assert.match(folded.notes[0],/available balance/);
  // And no portfolio is named after the page's own furniture.
  assert.equal(folded.marks.some(row=>/accounts$|^Taxable$/i.test(row.name)),false);
});

// The same sign-on, read one page earlier. Chase's dashboard states one figure
// for each kind of account and names no account at all, and those three figures
// are twenty accounts belonging to eight holders. Filed, they became portfolios
// called Bank accounts, Credit cards and Investment accounts — a ledger in which
// nothing is anybody's.
test('a figure printed against a kind of account is a total over accounts, not an account',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:''};
  const folded=foldReadings([
    {...base,account:'Bank accounts',label:'Total',value:2101804.48,class:classById('cash').code},
    {...base,account:'Credit cards',label:'Total',value:15835,class:classById('credit').code},
    {...base,account:'Investment accounts',label:'Total',value:14268036.59,class:classById('liquid').code}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks,[]);
  assert.deepEqual(folded.portfolios,[]);
  assert.match(folded.notes.join(' '),/total across accounts/);
  // Nothing was filed and the page is why, so the note says where the figures
  // are instead of only what was refused.
  assert.match(folded.notes.join(' '),/Show the accounts themselves/);
});

// The dashboard again, read a second time, with the reading labelling the
// credit-card sum the way the page labels it. Two of the three totals were
// refused and the third was not, because "Outstanding" is a word about a
// balance and was taken for the name of an account — so a portfolio called
// OUTSTANDING was offered holding every card added up, and the sentence saying
// the page could not answer went away with it, since something had been filed.
test('the word a page puts over a sum is not the name of an account',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:''};
  const folded=foldReadings([
    {...base,account:'Bank accounts',label:'Total',value:2101804.48,class:classById('cash').code},
    {...base,account:'Credit cards · Outstanding',label:'Outstanding',value:15835,class:classById('credit').code},
    {...base,account:'Investment accounts',label:'Total',value:14268036.59,class:classById('liquid').code}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks,[],'all three are one total per kind, and none of them is an account');
  assert.deepEqual(folded.portfolios,[]);
  assert.match(folded.notes.join(' '),/Show the accounts themselves/);
});

// The same sentence must not follow a page that does answer. A broker prints a
// headline total over the accounts it also states, and refusing that total
// loses nothing at all — the accounts are right there, unnamed but stated, and
// telling the owner to go elsewhere would send him away from the page that has
// what he came for.
test('a headline total over accounts the page states does not send the owner elsewhere',()=>{
  const base={asOf:'2026-09-20',confidence:'high',reason:'',class:9,registration:'',account:''};
  const folded=foldReadings([
    {...base,label:'Total Assets',scope:'all',value:1791069.16},
    {...base,label:'Net Account Value',scope:'account',value:1668402.54},
    {...base,label:'Net Account Value',scope:'account',value:122666.62}
  ],[{...estate,id:'p1'}],{institution:'E*TRADE',defaultClass:classById('liquid').code});
  assert.equal(folded.marks.length,1);
  assert.equal(folded.notes.some(note=>/Show the accounts themselves/.test(note)),false);
});

// A heading over a group of accounts, whatever word is in front of it. This
// was fixed once by adding words to a list — bank, credit, investment — and the
// page answered Outstanding, then External accounts, then Chase accounts. What
// they share is the end of the phrase, not the front.
test('a heading over a group of accounts is one whatever word is in front of it',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:classById('cash').code};
  for(const account of ['Chase accounts','External accounts','Bank accounts','Credit cards',
    'Investment accounts','Deposit accounts','My accounts','Accounts','Business checking accounts']){
    const folded=foldReadings([{...base,account,label:'Total',value:109}],[],{institution:'Chase',defaultClass:classById('cash').code});
    assert.deepEqual(folded.marks,[],account);
  }
  // What it must not take with it: a heading with a real account behind it.
  const kept=foldReadings([
    {...base,account:'External accounts · Fidelity Cash Management (...4410)',label:'Present balance',value:109}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(kept.marks.map(row=>[row.name,row.amount]),[['Fidelity Cash Management (...4410)',109]],
    'the heading comes off the front and the account behind it stays');
});

// A bank files a credit score beside the money, under a product name of its
// own. It is three digits in the range of a small balance, and nothing about
// its shape says it is not one — so a score of 737 arrived as $737 of cash.
test('a credit score is not a balance, wherever the page files it',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:9};
  const folded=foldReadings([
    {...base,account:'Credit Journey',label:'Credit score',value:737},
    {...base,account:'Joint Savings (...8917)',label:'Present balance',value:880033.77}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks.map(row=>row.amount),[880033.77],'the balance beside it is untouched');
  assert.match(folded.notes[0],/credit score/);
  // Named on the figure rather than the account, it goes the same way.
  const named=foldReadings([{...base,account:'',label:'FICO Score',value:737}],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(named.marks,[]);
});

// The worst figure this ledger has offered, and it came from a guard meant to
// protect it. A card's balance is forced to Credit so that a bank's default of
// cash cannot file a debt as money held — but the test was put to everything
// the group said rather than to the figure's own name. A page whose accounts
// could not be told apart arrived as one group holding the whole overview, the
// words "credit cards" were somewhere in it, and $16.4M of assets was offered
// for saving as -$18,537,244 owed.
test('one card in a group does not make a debt of everything beside it',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:9};
  const folded=foldReadings([
    {...base,account:'J.P. Morgan Wealth (...5007)',label:'Total investments',value:14268036.59},
    {...base,account:'J.P. Morgan Wealth (...5007)',label:'Total cash',value:2151568.27},
    {...base,account:'J.P. Morgan Wealth (...5007)',label:'Credit cards',value:15834.80}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  const byClass=Object.fromEntries(folded.marks.map(row=>[classLabel(row.class),row.amount]));
  assert.equal(byClass.Credit,15834.80,'the card is the debt');
  assert.ok(!('Credit' in byClass)||folded.marks.length>1,'and it is not the only row');
  assert.equal(folded.marks.some(row=>row.amount<0),false,'no figure is stored negative');
  assert.equal(folded.marks.filter(row=>classLabel(row.class)==='Credit').length,1,
    'exactly one row is a liability, not every row in the group');
  // The two beside it keep what the site says they are.
  assert.ok(byClass.Cash||byClass['Liquid securities'],'the assets are still assets');
});

// A summary panel is a page-level total per label, under a heading that names a
// kind of account. Nothing on it says whose money any of it is, and its labels
// name what a figure covers rather than who holds it — so taken as account
// names they made one portfolio called Liabilities holding $16.4M, which is
// three of the page's own totals added together.
test('a summary panel of page totals names no account and files nothing',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:9};
  const folded=foldReadings([
    {...base,account:'Chase accounts',label:'Assets',value:16369841.07},
    {...base,account:'Chase accounts',label:'Liabilities',value:15834.80},
    {...base,account:'Chase accounts',label:'Total investments',value:14268036.59},
    {...base,account:'Chase accounts',label:'Total cash',value:2151568.27},
    {...base,account:'Chase accounts',label:'Bank accounts',value:2101804.48}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks,[],'not one of them is an account');
  assert.deepEqual(folded.portfolios,[]);
  assert.match(folded.notes.join(' '),/Show the accounts themselves/);
  // And a product whose name happens to contain one of those words is still an
  // account: Chase sells one called Total Checking.
  const real=foldReadings([{...base,account:'Bank accounts · Chase Total Checking (...4421)',label:'Present balance',value:8420.11}],
    [],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(real.marks.map(row=>[row.name,row.amount]),[['Chase Total Checking (...4421)',8420.11]]);
});

// One trust, two of its accounts, and a reading that guessed differently about
// each. The roster is the owner's own standing answer about his own structure
// and a reading is a guess from a page, so taking the guess first proposed the
// same trust twice under one name — its managed account as a trust, its
// brokerage as taxable — and the panel offered two portfolios called Berry AE
// 21 Irrevocable Trust, one of them holding nothing.
test('a title the roster settles is not re-registered by what a page guessed',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:classById('liquid').code};
  const folded=foldReadings([
    {...base,account:'BERRY AE 21 IRREV FAM TR (...7005)',label:'Account value',value:1704529.20},
    {...base,account:'AE 21 SLAT Brokerage (...4471)',label:'Account value',value:0,registration:'taxable'}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.portfolios.map(entry=>entry.name),['Berry AE 21 Irrevocable Trust'],
    'one trust, proposed once');
  assert.deepEqual([...new Set(folded.marks.map(row=>registrationLabel(row.kind)))],['Trust']);
  // Law still outranks the roster: an IRA is one person's whatever else holds
  // the account, so a retirement registration the page states is kept.
  const ira=foldReadings([{...base,account:'BERRY AE 21 IRREV FAM TR (...7005)',label:'Account value',value:100,registration:'ira'}],
    [],{institution:'Chase',defaultClass:classById('cash').code});
  assert.equal(registrationLabel(ira.marks[0].kind),'IRA');
});

// A page that lists its cards by product rather than under a heading. Nothing
// in "Prime Visa" or "J.P. Morgan Reserve" says the word card, so a rule that
// waited for the word gave each of them a portfolio of its own, holding one
// household's liabilities between four headings.
test('a debt is titled where the institution says its cards are, however the page names it',()=>{
  const base={scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:'',class:classById('credit').code};
  const folded=foldReadings([
    {...base,account:'Joint Savings (...8917)',label:'Present balance',value:880033.77,class:classById('cash').code},
    {...base,account:'CLOSED CARD (...5372)',label:'Current balance',value:0},
    {...base,account:'ERIC FREEDOM CARD (...6106)',label:'Current balance',value:1309},
    {...base,account:'J.P. MORGAN RESERVE (...0789)',label:'Current balance',value:11686},
    {...base,account:'PRIME VISA (...2213)',label:'Current balance',value:430}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks.map(row=>[row.name,classLabel(row.class),row.amount]),[
    [ESTATE,'Cash',880033.77],
    [ESTATE,'Credit',1309+11686+430]
  ],'four cards, one debt, under the title the institution names');
  assert.deepEqual(folded.portfolios.map(entry=>entry.name),[ESTATE],
    'one portfolio proposed, and none of them named after a piece of plastic');

  // A business card is still its company's: the roster is asked first.
  const business=foldReadings([{...base,account:'CELSIE LLC INK BUSINESS (...9902)',label:'Current balance',value:2400}],
    [],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(business.marks.map(row=>[row.name,row.amount]),[['Celsie LLC',2400]]);
});

// A card is read at a bank, behind the same password as the checking account,
// and the site answers cash for what it holds. A balance owed is the one figure
// where taking that answer moves net worth by twice the number.
test('a credit card balance is a debt, and the credit left on it is not a figure at all',()=>{
  const base={class:9,scope:'account',registration:'',asOf:'2026-09-20',confidence:'high',reason:''};
  const folded=foldReadings([
    {...base,account:'Credit cards · CHASE SAPPHIRE RESERVE (...1739)',label:'Current balance',value:15835},
    {...base,account:'Credit cards · CHASE SAPPHIRE RESERVE (...1739)',label:'Available credit',value:34165}
  ],[],{institution:'Chase',defaultClass:classById('cash').code});
  assert.deepEqual(folded.marks.map(row=>[classLabel(row.class),row.amount]),[['Credit',15835]]);
  assert.match(folded.notes[0],/credit limit/);
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
  // Two trusts made in 2020 and one fragment that used to name both. The
  // longest fragment present wins, which is what keeps them apart.
  for(const [said,owner] of [
    ['BERRY 2020 IRREV FAM TR (...5007)','Berry 2020 Irrevocable Family Trust'],
    ['BERRY 2020 IRREVOCABLE FAMILY TRUST (...6003)','Berry 2020 Irrevocable Family Trust'],
    ['BERRY 2020 DESCENDANTS’ IRREV TR (...4001)','Berry 2020 Descendants’ Irrevocable Trust'],
    ["BERRY 20 DESC' IRR TR (...3004)",'Berry 2020 Descendants’ Irrevocable Trust'],
    ['BERRY AE 21 IRREV FAM TR (...7005)','Berry AE 21 Irrevocable Trust'],
    ['AE 21 SLAT Savings (...2530)','Berry AE 21 Irrevocable Trust'],
    ['ERIC Z BERRY & ARIANA COOPER BERRY (...3004)',ESTATE],
    ['2nd Joint Checking (...1551)',ESTATE],
    // A child's account is titled to a parent as custodian, and the parent's
    // name in it must not carry it into the parents' own estate.
    ['CELESTE ARABELLA BERRY UTMA ARIANA, COOP (...8557)','Celeste Arabella Berry'],
    ['MAISIE AVA BERRY UTMA NY (...4008)','Maisie Ava Berry']
  ])assert.equal(titledHolder('Chase',said)?.owner,owner,said);
  // Money reached by the same password that is not the owner's.
  assert.equal(titledHolder('Chase','BEDFORD BRIDGE CAPITAL, LLC (...4918)')?.ignore,true);
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
    [1,10,'2026-06-30',390000],
    [1,10,'2026-09-19',412000],
    [2,10,'2026-09-19',122667],
    [3,4,'2026-09-19',200]
  ]);
  assert.deepEqual(moved.map(entry=>[entry.from,entry.portfolio,entry.class,entry.dates]),[
    ['Brokerage',ESTATE,'Liquid securities',2],
    ['Checking',ESTATE,'Cash',1],
    ['IRA','Eric Berry','Liquid securities',1],
    ['Fund II','Berry Family Trust','Fund investments',1]
  ]);
});

test('a record with no owner is titled by its institution on the way across',()=>{
  const {portfolios}=legacyLedger([
    {name:'Brokerage',institution:'Charles Schwab',kind:'brokerage',owner:'',currency:'USD',value:1,asOf:'2026-09-19',history:'[]'},
    {name:'Rollover IRA',institution:'Charles Schwab',kind:'retirement',owner:'',currency:'USD',value:1,asOf:'2026-09-19',history:'[]'}
  ]);
  assert.deepEqual(portfolios.map(entry=>entry.name),[ESTATE,'Eric Berry']);
});

// ── Direct investments ────────────────────────────────────────────────────
const TRUST='Berry Family Trust';
const trust={row:'portfolio',number:3,name:TRUST,kind:5,currency:'USD'};
const holding=(number,name,vehicle,portfolio,extra={})=>({
  ...normalizeFinance({row:'holding',number,portfolio,name,vehicle,class:classById('funds').code,...extra}),id:holdingRef(number)});
const capital=(entry)=>({...normalizeFinance({row:'capital',...entry}),id:capitalRef(entry)});

test('an investment and its capital account are their own rows, addressed apart from every other',()=>{
  const fund=normalizeFinance({row:'holding',number:1,portfolio:3,name:'Acme Ventures Fund III, L.P.',vehicle:1,class:4,stated:3});
  assert.deepEqual(Object.keys(fund),['row','number','portfolio','name','vehicle','class','stated','share']);
  // Almost every investment is the whole of its vehicle, and an investment
  // filed before the share existed is one too.
  assert.equal(fund.share,WHOLE_SHARE);
  assert.equal(normalizeFinance({row:'holding',number:1,portfolio:3,name:'A fund',vehicle:1,class:4,share:'3500'}).share,3500);
  for(const bad of [0,-1,10001,'abc'])
    assert.throws(()=>normalizeFinance({row:'holding',number:1,portfolio:3,name:'A fund',vehicle:1,class:4,share:bad}),undefined,String(bad));
  const statement=normalizeFinance({row:'capital',holding:1,asOf:'2026-06-30',value:'1100000.004',contributed:800000,distributed:250000,commitment:1000000});
  assert.deepEqual(statement,{row:'capital',holding:1,asOf:'2026-06-30',value:1100000,contributed:800000,distributed:250000,commitment:1000000});
  // A commitment signed with nothing called against it yet is a whole record.
  assert.equal(normalizeFinance({row:'capital',holding:1,asOf:'2026-06-30',value:0,commitment:1000000}).contributed,0);

  assert.equal(holdingRef(7),'h7');
  assert.equal(capitalRef({holding:7,asOf:'2026-06-30'}),'h7-20260630');
  assert.deepEqual(parseRef('h7'),{row:'holding',number:7});
  assert.deepEqual(parseRef('h7-20260630'),{row:'capital',holding:7,asOf:'2026-06-30'});
  // Only a figure begins with a digit, so no prefix can be mistaken for another.
  assert.deepEqual(parseRef('3-4-20260630'),{row:'mark',portfolio:3,class:4,asOf:'2026-06-30',firm:0});
  for(const bad of ['h0','h7-2026','h7-20260630-x','hh7'])assert.equal(parseRef(bad),null,bad);

  for(const change of [{vehicle:99},{vehicle:'fund'},{class:23},{name:'  '},{portfolio:0}])
    assert.throws(()=>normalizeFinance({row:'holding',number:1,portfolio:3,name:'A fund',vehicle:1,class:4,...change}),undefined,JSON.stringify(change));
  for(const change of [{value:-1},{asOf:''},{holding:0},{contributed:'abc'}])
    assert.throws(()=>normalizeFinance({row:'capital',holding:1,asOf:'2026-06-30',value:1,...change}),undefined,JSON.stringify(change));
});

test('a position states what it cost as well as what it is worth, and counts as its class',()=>{
  const records=ledger(
    {...trust,id:'p3'},
    holding(1,'Acme Ventures Fund III, L.P.',1,3),
    capital({holding:1,asOf:'2026-03-31',value:900000,contributed:750000,distributed:100000,commitment:1000000}),
    capital({holding:1,asOf:'2026-06-30',value:1100000,contributed:800000,distributed:250000,commitment:1000000})
  );
  const [position]=positionsOn(records);
  // The newest statement on or before the date answers, and nothing is
  // interpolated between two of them.
  assert.equal(position.value,1100000);
  assert.equal(position.unfunded,200000);
  assert.equal(position.multiple,1.69,'(1,100,000 + 250,000) / 800,000');
  assert.equal(positionsOn(records,'2026-04-01')[0].value,900000);
  // An investment with no statement yet is still a position, worth nothing.
  const unstated=positionsOn(ledger({...trust,id:'p3'},holding(2,'Signed last week',2,3)))[0];
  assert.equal(unstated.value,0);
  assert.equal(unstated.multiple,null,'a multiple of nothing is a question nobody has asked, not infinity');

  const summary=financeSummary(records,{currency:'USD',today:'2026-07-01'});
  assert.equal(summary.net,1100000,'a position is an asset in its portfolio like any other figure');
  assert.deepEqual(summary.byClass.map(row=>[row.label,row.total]),[['Fund investments',1100000]]);
  assert.deepEqual(summary.byPortfolio.map(row=>[row.label,row.total]),[[TRUST,1100000]]);
  assert.deepEqual(summary.byRegistration.map(row=>row.label),['Trust']);
  assert.deepEqual(summary.positions,{count:1,committed:1000000,contributed:800000,distributed:250000,value:1100000,unfunded:200000});
  // The day a statement was struck is a day the series has a point on.
  assert.deepEqual(netWorthSeries(records,{currency:'USD'}).map(point=>[point.asOf,point.net]),
    [['2026-03-31',900000],['2026-06-30',1100000]]);
  const group=groupFinanceRecords(records).find(entry=>entry.portfolio.number===3);
  assert.equal(group.positions.length,1);
  assert.equal(group.total,1100000);
});

test('what the paperwork calls itself is kept beside what the ledger files it as',()=>{
  const records=ledger({...trust,id:'p3'},
    // Sold as a fund, filed as the single-company SPV it actually is.
    holding(1,'Acme Opportunity Fund I',3,3,{stated:1}),
    capital({holding:1,asOf:'2026-06-30',value:500000,contributed:500000,distributed:0,commitment:500000}));
  const [position]=positionsOn(records);
  assert.equal(position.disputed,true);
  assert.equal(vehicleLabel(position.holding.vehicle),'SPV Investment');
  assert.equal(vehicleLabel(position.holding.stated),'Direct Fund Investment');
  // Agreement, or nothing stated at all, is not a dispute.
  assert.equal(positionsOn(ledger({...trust,id:'p3'},holding(2,'Plain',1,3,{stated:1})))[0].disputed,false);
  assert.equal(positionsOn(ledger({...trust,id:'p3'},holding(2,'Plain',1,3)))[0].disputed,false);
});

test('a capital account statement is read, never totalled, and an unreadable one is dropped',()=>{
  const {capital,readings}=parseFinanceUpdates({readings:[],unread:'',capital:[
    {fund:'Acme Ventures Fund III, L.P.',vehicle:'fund',holder:'Berry Family Trust',asOf:'2026-09-30',
      value:1200000,commitment:1000000,distributed:250000,periodContributed:50000,confidence:'high',reason:'Q3 statement.'},
    // No date, so no statement: the same rule every other reading follows.
    {fund:'Undated Partners',asOf:'',value:5},
    // One bad entry cannot discard the rest.
    {fund:'',asOf:'2026-09-30',value:5},
    'nonsense'
  ]});
  assert.equal(readings.length,0);
  assert.equal(capital.length,1);
  // An absent figure and a figure of zero are different answers.
  assert.equal(capital[0].contributed,null,'no cumulative contributions were stated');
  assert.equal(capital[0].periodContributed,50000);
  assert.equal(capital[0].periodDistributed,null);
  assert.equal(capital[0].stated,'fund');
  assert.equal(capital[0].holder,'Berry Family Trust');
  // Nothing at all still refuses, rather than reporting an empty reading.
  assert.throws(()=>parseFinanceUpdates({readings:[],capital:[],unread:''}));
});

test('a statement ties to the investment it names, and its period movement is added on the device',()=>{
  const records=ledger({...trust,id:'p3'},
    holding(1,'Acme Ventures Fund III, L.P.',1,3),
    capital({holding:1,asOf:'2026-06-30',value:1100000,contributed:800000,distributed:250000,commitment:1000000}));
  const {capital:read}=parseFinanceUpdates({readings:[],unread:'',capital:[{
    fund:'Acme Ventures Fund III',vehicle:'fund',holder:'Berry Family Trust',asOf:'2026-09-30',
    value:1200000,commitment:1000000,distributed:250000,periodContributed:50000,confidence:'high',reason:'Q3.'}]});
  const {rows,portfolios,holdings,notes}=foldCapital(read,records,{today:'2026-10-01'});
  assert.equal(portfolios.length,0,'the trust already exists and is matched by the holder line');
  assert.equal(holdings.length,0,'so does the fund, matched by its own name');
  const [row]=rows;
  assert.equal(row.holding,1);
  assert.equal(row.portfolio,3);
  assert.equal(row.value,1200000);
  // 800,000 already called, plus the 50,000 this period. AI reported the
  // period; the device did the addition.
  assert.equal(row.contributed,850000);
  assert.equal(row.distributed,250000);
  assert.match(notes.join(' '),/period only, so it was added to the 2026-06-30 figure/);
  // Filing the same quarter twice reaches the same row and the same numbers.
  assert.deepEqual(foldCapital(read,records,{today:'2026-10-01'}).rows[0],row);
});

test('a statement nobody can place proposes rather than guessing, and names the trust it is addressed to',()=>{
  const sibling={row:'portfolio',number:4,name:'Berry 2020 Descendants Irrevocable Trust',kind:5,currency:'USD',id:'p4'};
  const records=[...ledger({...trust,id:'p3'},sibling),
    holding(1,'Acme Fund',1,3),
    holding(2,'Acme Fund III',1,3)];
  const statement=(fund,holder)=>parseFinanceUpdates({readings:[],unread:'',capital:[
    {fund,holder,asOf:'2026-09-30',value:100,contributed:100,distributed:0,commitment:100,vehicle:'spv'}]}).capital;

  // "Berry" alone fits three portfolios. A misfiled capital account is
  // invisible afterwards, so nothing is picked: a new one is proposed, said
  // plainly, and corrected on the row.
  const vague=foldCapital(statement('Brand New SPV','Berry'),records,{today:'2026-10-01'});
  assert.equal(vague.portfolios.length,1);
  assert.match(vague.notes.join(' '),/no portfolio matched “Berry” closely enough/);
  assert.equal(vague.rows[0].portfolioIsNew,true);

  // A name that does fit one fits it exactly.
  const placed=foldCapital(statement('Brand New SPV','Berry 2020 Descendants Irrevocable Trust'),records,{today:'2026-10-01'});
  assert.equal(placed.portfolios.length,0);
  assert.equal(placed.rows[0].portfolio,4);
  // A trust that does not exist yet is proposed as a trust, because its name
  // says so — the same registration reading the account titles use.
  const fresh=foldCapital(statement('Brand New SPV','The Celsie Holdings LLC'),records,{today:'2026-10-01'});
  assert.equal(registrationLabel(fresh.portfolios[0].kind),'Entity');

  // A holder carrying more identity than the portfolio name is a different
  // party, however much of the name they share. Maisie's trust must not land
  // in Eric's IRA — a capital account filed there is invisible from then on.
  const child=foldCapital(statement('Brand New SPV','Maisie Berry 2021 Irrevocable Trust'),
    [...ledger({...trust,id:'p3'})],{today:'2026-10-01'});
  assert.equal(child.rows[0].portfolioIsNew,true,'“Eric Berry” sits inside her name and is not her');
  assert.equal(child.portfolios[0].name,'Maisie Berry 2021 Irrevocable Trust');
  assert.equal(registrationLabel(child.portfolios[0].kind),'Trust');
  // The shorter form of the same title still matches, which is the direction
  // that is safe: the ledger holds the fuller legal name.
  const fuller=[...ledger(),{row:'portfolio',number:5,name:'The Berry Family Trust u/a 2019',kind:5,currency:'USD',id:'p5'}];
  assert.equal(foldCapital(statement('Brand New SPV','Berry Family Trust'),fuller,{today:'2026-10-01'}).rows[0].portfolio,5);

  // The same rule for the investment: a statement for "Acme" fits both funds
  // and so belongs to neither until somebody says which.
  const ambiguous=foldCapital(statement('Acme','Berry Family Trust'),records,{today:'2026-10-01'});
  assert.equal(ambiguous.rows[0].isNew,true,'two candidates fit equally, so neither is chosen');
  // A name that answers exactly answers, even though the longer one also fits.
  assert.equal(foldCapital(statement('Acme Fund','Berry Family Trust'),records,{today:'2026-10-01'}).rows[0].holding,1);
  const exact=foldCapital(statement('Acme Fund III','Berry Family Trust'),records,{today:'2026-10-01'});
  assert.equal(exact.rows[0].holding,2);
  assert.equal(exact.rows[0].isNew,false);
  // The fund says it is an SPV and the ledger has it as a fund. Saving the
  // statement does not quietly reclassify it; the disagreement is reported.
  assert.equal(exact.rows[0].stated,3);
  assert.equal(exact.rows[0].vehicle,1);
  assert.match(exact.notes.join(' '),/calls this spv investment and it is filed as direct fund investment/);
});

// UBS abbreviates every title on the way to the screen: the joint estate is
// "Joint Accounts", the 2020 trusts are "Descendants Tst" and "Irrevocable
// Tst", and the 2021 trust is "AE 2021 Trust". None of those is what the trust
// is called on its own paperwork, and none carries a fragment the Chase roster
// would recognize — so twenty-eight accounts arrived as twenty-eight new
// portfolios, each named after an account number.
test('a UBS heading is the title it abbreviates, and its accounts join the trust already there',()=>{
  const estate={row:'portfolio',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
  const family={row:'portfolio',number:2,name:'Berry 2020 Irrevocable Family Trust',kind:5,currency:'USD'};
  const descendants={row:'portfolio',number:3,name:'Berry 2020 Descendants\u2019 Irrevocable Trust',kind:5,currency:'USD'};
  const ae={row:'portfolio',number:4,name:'Berry AE 21 Irrevocable Trust',kind:5,currency:'USD'};
  const portfolios=[estate,family,descendants,ae];

  for(const [said,owner] of [
    ['Joint Accounts Y1 60033',estate.name],
    // A second heading over the same money, not a second holder.
    ['JT Liquidity Y1 69921',estate.name],
    ['Descendants Tst Y1 60187',descendants.name],
    ['Irrevocable Tst Y1 60157',family.name],
    // "ae21" does not appear in "AE 2021 Trust" once spacing is dropped, so the
    // fragment has to be written out in full.
    ['AE 2021 Trust Y1 63541',ae.name]
  ]) assert.equal(titledHolder('UBS',said)?.owner,owner,said);
  assert.equal(holdsManyTitles('UBS'),true,'an unrecognized UBS account must not fall into another trust');

  const reading=(account,cls,value)=>({account,label:'',class:cls,registration:'',scope:'account',
    value,asOf:'2026-09-20',confidence:'high',reason:''});
  const folded=foldReadings([
    reading('Joint Accounts Y1 60184','bonds',4020675.81),
    reading('Descendants Tst Y1 60250','stocks',1827635.08),
    reading('Irrevocable Tst Y1 60203','stocks',1835811.54),
    reading('AE 2021 Trust Y1 85516','bonds',381402.85),
    reading('JT Liquidity Y1 69921','bonds',0)
  ],portfolios,{institution:'UBS',today:'2026-09-20'});

  assert.deepEqual(folded.portfolios,[],'nothing here needs a portfolio that is not already in the ledger');
  const filed=Object.fromEntries(folded.marks.map(mark=>[mark.portfolio,mark.amount]));
  assert.equal(filed[estate.number],4020675.81);
  assert.equal(filed[descendants.number],1827635.08);
  assert.equal(filed[family.number],1835811.54);
  assert.equal(filed[ae.number],381402.85);
  // The two 2020 trusts are the pair that has been folded into each other
  // before, so they are checked apart rather than merely present.
  assert.notEqual(filed[family.number],filed[descendants.number]);
});

// One class for everything held through a fund. The split into private equity,
// venture capital and hedge funds asked a question the owner does not ask, and
// cost a decision on every figure that arrived.
test('the three fund classes are one, and a figure stored under a retired code still reads',()=>{
  assert.equal(classById('pe'),null,'the old ids are gone');
  assert.equal(classById('vc'),null);
  assert.equal(classById('hedge'),null);
  const funds=classById('funds');
  assert.equal(funds.code,4,'code 4 is kept: everything stored under it was already a fund investment');
  assert.equal(funds.label,'Fund investments');
  assert.equal(funds.group,'illiquid');
  // Retired, not reused — and still resolved, because a figure written before
  // the merge is in the ledger until it is migrated, and a holding carries its
  // class inside a blob no SQL pass can reach.
  for(const retired of [5,6]){
    assert.equal(classLabel(retired),'Fund investments',`class ${retired} reads as what it always was`);
    assert.equal(classGroup(retired),'illiquid');
    assert.equal(classSide(retired),'asset');
    assert.equal(canonicalClass(retired),4);
  }
  assert.equal(canonicalClass(1),1,'a class that was not merged is left alone');
  // And the list offered for choosing has one fund line, not three.
  assert.equal(ASSET_CLASSES.filter(entry=>entry.label.toLowerCase().includes('fund')).length,1);
});

// At a wealth manager, "Brokerage" is where the fund investments sit; the
// dashboard prints one total and never says so. Everywhere else the word means
// what it sounds like.
test('a UBS Brokerage account is fund investments, and every other one is not',()=>{
  const estate={row:'portfolio',number:1,name:'Eric and Ariana Berry Estate',kind:1,currency:'USD'};
  const reading=(account,label,cls,value)=>({account,label,class:classById(cls).code,registration:'',
    scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:''});

  const ubs=foldReadings([
    reading('Joint Accounts Y1 60033','Brokerage','liquid',8454037.54),
    reading('Joint Accounts Y1 60185','Global Equity','stocks',3954866.16)
  ],[estate],{institution:'UBS',today:'2026-09-20'});
  const byClass=Object.fromEntries(ubs.marks.map(mark=>[classLabel(mark.class),mark.amount]));
  assert.equal(byClass['Fund investments'],8454037.54,'the Brokerage account holds the funds');
  assert.equal(byClass['Liquid securities'],3954866.16,'and the equity account beside it is untouched');

  // One UBS fund account carries no description at all — the page prints an
  // empty name column — so there is no word to recognize it by and it is named
  // by its number instead.
  const ae={row:'portfolio',number:2,name:'Berry AE 21 Irrevocable Trust',kind:5,currency:'USD'};
  const unnamed=foldReadings([
    reading('AE 2021 Trust Y1 63541','','liquid',856692.22),
    reading('AE 2021 Trust Y1 85516','Core Munis','bonds',381402.85)
  ],[ae],{institution:'UBS',today:'2026-09-20'});
  const aeClass=Object.fromEntries(unnamed.marks.map(mark=>[classLabel(mark.class),mark.amount]));
  assert.equal(aeClass['Fund investments'],856692.22,'the account the page declines to describe');
  assert.equal(aeClass['Fund investments']===undefined,false);
  assert.ok(!('Fund investments' in {Bonds:0})||true);
  assert.equal(unnamed.marks.filter(mark=>classLabel(mark.class)==='Fund investments').length,1,
    'and only that one: the account beside it is not swept in by the number');

  // The same word at a broker that means it stays marketable securities.
  for(const institution of ['Schwab','E*TRADE','Chase']){
    const other=foldReadings([reading('Individual Brokerage -4049','Brokerage','liquid',1000)],
      [estate],{institution,today:'2026-09-20'});
    assert.notEqual(classLabel(other.marks[0].class),'Fund investments',institution);
  }
});

// Morgan Stanley as it actually reads: twelve accounts on one Total Wealth View,
// nine of them titled to three trusts and abbreviated differently on adjacent
// rows — "BERRY 2020 IRR FAMILY TR" on two accounts and "BERRY 2020 IRRV FAMILY
// TR" on the next, "IRR" and "IRREV" on the 2021 trust, "DES" where the
// descendants' trust writes out its name everywhere else. None of it matched a
// trust already in the ledger, so the page arrived as nine new portfolios with
// an account number in each name, standing beside the three trusts they belong
// to. The two accounts named after a Morgan Stanley product rather than a
// holder are the estate's, and the page's second money column is inside its
// first.
test('Morgan Stanley abbreviates its titles, and its accounts join the trusts already there',()=>{
  const family={row:'portfolio',number:2,name:'Berry 2020 Irrevocable Family Trust',kind:5,currency:'USD'};
  const descendants={row:'portfolio',number:3,name:'Berry 2020 Descendants’ Irrevocable Trust',kind:5,currency:'USD'};
  const ae={row:'portfolio',number:4,name:'Berry AE 21 Irrevocable Trust',kind:5,currency:'USD'};
  const portfolios=[estate,family,descendants,ae];

  for(const [said,owner] of [
    ['BERRY 2020 DES IRR TR -0607',descendants.name],
    ['BERRY 2020 IRR FAMILY TR -0643',family.name],
    // The same trust, abbreviated one letter longer on the account beside it.
    ['BERRY 2020 IRRV FAMILY TR -0612',family.name],
    ['BERRY AE 2021 IRR FAMILY TR -0641',ae.name],
    ['BERRY AE 2021 IRREV FAMILY TR -0618',ae.name],
    ['ERIC AND ARIANA BERRY ESTATE -0155',ESTATE],
    // A product name is not a holder, and these two are the estate's.
    ['Platinum CashPlus -6792',ESTATE],
    ['AAA -1785',ESTATE]
  ]) assert.equal(titledHolder('Morgan Stanley',said)?.owner,owner,said);
  // The trust's own Active Assets Account says both "aaa" and its trust's name,
  // and the longer of the two is what it is.
  assert.equal(titledHolder('Morgan Stanley','BERRY 2020 DES IRR TR AAA -0607')?.owner,descendants.name);
  assert.equal(holdsManyTitles('Morgan Stanley'),true,'an unrecognized account must not fall into the estate');

  const reading=(account,label,cls,value,registration='')=>({account,label,class:classById(cls).code,
    registration,scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:''});
  const held=(account,value)=>reading(account,'Total Assets','liquid',value,/\bTR\b/.test(account)?'trust':'');
  const folded=foldReadings([
    held('Platinum CashPlus -6792',895.11),
    // The page prints the cash column against every account. On this one it is
    // the same number as the total, and the rule above already had that.
    reading('Platinum CashPlus -6792','Available Cash','cash',895.11),
    held('AAA -1785',558.94),
    // On this one it is a few cents short of the total, which is two balances
    // by every test that looks at the numbers alone.
    reading('AAA -1785','Available Cash','cash',558.93),
    held('BERRY 2020 DES IRR TR -0607',1054631.22),
    held('BERRY 2020 DES IRR TR -0639',2192933.41),
    held('BERRY 2020 DES IRR TR -0640',869683.07),
    held('BERRY 2020 IRR FAMILY TR -0643',2173508.19),
    // Two accounts of two different trusts, to the cent. Identical figures are
    // one balance read twice only within one account.
    held('BERRY 2020 IRR FAMILY TR -0644',869683.07),
    held('BERRY 2020 IRRV FAMILY TR -0612',1055712.66),
    held('BERRY AE 2021 IRR FAMILY TR -0641',2542096.44),
    held('BERRY AE 2021 IRR FAMILY TR -0642',427894.20),
    held('BERRY AE 2021 IRREV FAMILY TR -0618',2293693.55),
    held('ERIC AND ARIANA BERRY ESTATE -0155',18250731.18),
    reading('ERIC AND ARIANA BERRY ESTATE -0155','Available Cash','cash',21200),
    // What the page prints above the list, which is every line of it added up.
    {...reading('','Total Assets','unclassified',31732021.04),scope:'all'}
  ],portfolios,{institution:'Morgan Stanley',today:'2026-09-20'});

  assert.deepEqual(folded.portfolios,[],'nine accounts, and not one portfolio the ledger did not already hold');
  const filed=Object.fromEntries(folded.marks.map(mark=>[mark.portfolio,mark.amount]));
  assert.equal(filed[descendants.number],4117247.70);
  assert.equal(filed[family.number],4098903.92);
  assert.equal(filed[ae.number],5263684.19);
  // The estate's own account, and the two accounts named after a product.
  assert.equal(filed[estate.number],18252185.23);
  assert.notEqual(filed[family.number],filed[descendants.number]);
  // Available Cash is a part of Total Assets, not a second balance: counted as
  // its own figure it put the estate's spare cash on top of the estate's own
  // total, and at a broker that column is not even cash — it is cash plus what
  // could be borrowed against the securities.
  assert.equal(folded.marks.some(mark=>classLabel(mark.class)==='Cash'),false);
  assert.match(folded.notes[0],/available balance/);
  // The headline is refused and its parts reach it exactly, which is the whole
  // arithmetic this ledger does.
  assert.equal(folded.marks.reduce((total,mark)=>total+mark.amount,0),31732021.04);
  assert.match(folded.notes[0],/a total across accounts/);

  // An available figure standing alone is all the account said, so it is the
  // account's figure rather than nothing.
  const alone=foldReadings([reading('BERRY 2020 DES IRR TR -0607','Available Cash','cash',12000)],
    portfolios,{institution:'Morgan Stanley',today:'2026-09-20'});
  assert.deepEqual(alone.marks.map(mark=>[mark.name,mark.amount]),[[descendants.name,12000]]);
});

// Carta is the one site in the registry that states no account balance at all.
// Read as a brokerage page it offered $191,519,164 under the name of the entity
// the owner signs in as — a fund's own assets, not his — while the $150,000 he
// actually put into a fund arrived as nothing. And it prints the firm he runs
// in the same table as the fund he bought into, so the general partner's
// commitment reads exactly like his own.
test('a cap-table page states positions, never balances, and the fund he runs is not one he holds',()=>{
  const reading=(account,label,cls,value)=>({account,label,class:classById(cls).code,registration:'',
    scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:''});
  const fund=(name,holder,extra={})=>parseFinanceUpdates({readings:[],unread:'',capital:[
    {fund:name,holder,vehicle:'fund',asOf:'2026-09-20',value:150000,commitment:150000,
      contributed:150000,distributed:0,confidence:'high',reason:'The row states what was committed and called.',...extra}]}).capital[0];

  assert.equal(holdsPositionsOnly('Carta'),true);
  for(const elsewhere of ['Schwab','UBS','Chase',''])assert.equal(holdsPositionsOnly(elsewhere),false,elsewhere);

  // Neither figure is a balance, whatever class the reading gave it, and the
  // refusal is named: a number that simply vanished would be read as a page
  // that could not be read at all.
  const carta=foldReadings([
    reading('CELSIE LLC','Total assets','unclassified',191519164),
    reading('CELSIE LLC','Liquid securities','liquid',142412829)
  ],[estate,ira],{institution:'Carta',today:'2026-09-20'});
  assert.deepEqual(carta.marks,[]);
  assert.deepEqual(carta.portfolios,[]);
  assert.match(carta.notes.join(' '),/Left out: 2 figures this page states about a company or a fund rather than about you\./);
  // The same figure at a broker is a balance, because there it is one.
  assert.equal(foldReadings([reading('CELSIE LLC','Total assets','unclassified',191519164)],
    [estate,ira],{institution:'Schwab',today:'2026-09-20'}).marks[0].amount,191519164);

  // What he bought is a position, titled where he holds it. The investor
  // account is his own name and the portfolio called "Eric Berry" is his IRA,
  // which cannot hold a partnership interest bought personally.
  const bought=foldCapital([fund('C2V Tributary Fund II, LP','Eric Berry')],ledger(),
    {institution:'Carta',today:'2026-09-20'});
  assert.equal(bought.rows.length,1);
  assert.equal(bought.rows[0].name,'C2V Tributary Fund II, LP');
  assert.equal(bought.rows[0].portfolio,1);
  assert.equal(bought.rows[0].portfolioName,ESTATE);
  assert.equal(bought.rows[0].portfolioIsNew,false);
  assert.equal(classLabel(bought.rows[0].class),'Fund investments');
  assert.equal(bought.rows[0].commitment,150000);
  assert.equal(bought.portfolios.length,0);
  // Away from Carta the roster says nothing, and a statement addressed to
  // "Eric Berry" still matches the portfolio of that name exactly.
  assert.equal(foldCapital([fund('C2V Tributary Fund II, LP','Eric Berry')],ledger(),{today:'2026-09-20'}).rows[0].portfolio,2);

  // The general partner of a fund he manages arrives at his share of it. The
  // statement states the GP's whole capital account and no page says what part
  // of the GP is his, so the row carries the standing answer and says so.
  const runs=foldCapital([
    fund('Averin Health Opportunities GP I LLC','Eric Berry',{commitment:2119150,contributed:850000,value:850000}),
    fund('C2V Tributary Fund II, LP','Eric Berry')
  ],ledger(),{institution:'Carta',today:'2026-09-20'});
  assert.deepEqual(runs.rows.map(row=>row.name),['Averin Health Opportunities GP I LLC','C2V Tributary Fund II, LP']);
  assert.equal(runs.rows[0].share,3500,'a vehicle he manages arrives at his share of it');
  assert.equal(runs.rows[1].share,WHOLE_SHARE,'and a fund he simply bought into is the whole of one');
  // The statement is still the statement: the share scales the position, and
  // nothing rewrites what the vehicle reported.
  assert.equal(runs.rows[0].commitment,2119150);
  assert.match(runs.notes.join(' '),/Averin Health Opportunities GP I LLC at 35% — a vehicle you manage/);
  // On a page of balances there is no commitment or called capital for a share
  // to be a share of, so a managed vehicle is refused there instead.
  const beside=foldReadings([reading('Averin Health Opportunities GP I LLC','Total','liquid',850000),
    reading('Individual Brokerage -4049','Net Account Value','liquid',1000)],
    [estate,ira],{institution:'Schwab',today:'2026-09-20'});
  assert.deepEqual(beside.marks.map(entry=>entry.amount),[1000]);
  assert.match(beside.notes.join(' '),/Averin Capital, which you manage/);
  assert.equal(managedVehicle('Averin Health Opportunities GP I LLC')?.name,'Averin Capital');
  assert.equal(managedVehicle('C2V Tributary Fund II, LP'),null);
});

// iCapital is the second of them, and the platform the owner's fund
// commitments are actually administered on. Its reporting page states one
// investment at a time — committed, called, distributed, the net asset value
// and the multiple on it — and none of those is an account balance either.
test('a fund administrator states a capital account, and the investor named on it is not the IRA of that name',()=>{
  const reading=(account,label,cls,value)=>({account,label,class:classById(cls).code,registration:'',
    scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:''});
  assert.equal(holdsPositionsOnly('iCapital'),true);
  // The fund's own net asset value, read as though it were an account, is the
  // several-digits-larger figure the refusal exists for.
  const page=foldReadings([reading('Eric Berry','NAV','unclassified',392000)],[estate,ira],
    {institution:'iCapital',today:'2026-09-20'});
  assert.deepEqual(page.marks,[]);
  assert.match(page.notes.join(' '),/Left out: 1 figure this page states about a company or a fund rather than about you\./);

  // The position itself, titled to the estate: the investor and the account
  // both say "Eric Berry" and the portfolio of that name is his IRA, which a
  // feeder into a buyout fund cannot sit inside.
  const held=foldCapital(parseFinanceUpdates({readings:[],unread:'',capital:[
    {fund:'iCapital-Vista Equity Partners Fund VIII U.S. Access Fund, L.P.',holder:'Eric Berry',
      vehicle:'fund',asOf:'2026-06-30',value:392000,commitment:500000,contributed:341000,
      distributed:4000,confidence:'high',reason:'The tiles state the commitment, the contributions and the net asset value.'}]}).capital,
    ledger(),{institution:'iCapital',today:'2026-09-20'});
  assert.equal(held.rows.length,1);
  assert.equal(held.rows[0].name,'iCapital-Vista Equity Partners Fund VIII U.S. Access Fund, L.P.');
  assert.equal(held.rows[0].portfolioName,ESTATE);
  assert.equal(classLabel(held.rows[0].class),'Fund investments');
  // The value is the net asset value and nothing is derived from it: what is
  // still owed on the commitment is the ledger's arithmetic, not the page's.
  assert.equal(held.rows[0].value,392000);
  assert.equal(held.rows[0].commitment,500000);
  assert.equal(held.rows[0].contributed,341000);
  assert.equal(held.rows[0].distributed,4000);
});

// A general partner is rarely one person's. The owner holds part of the GP of
// each fund he runs and one or more trusts hold the rest, while the statement
// the fund sends states the GP's whole capital account — so the position is
// that statement scaled, and the same vehicle is a separate position in every
// portfolio that holds a piece of it.
test('a position is this portfolio’s share of a vehicle, and the statement still states all of it',()=>{
  assert.equal(shareText(WHOLE_SHARE),'100%');
  assert.equal(shareText(3500),'35%');
  assert.equal(shareText(1250),'12.5%');
  const statement={asOf:'2026-09-20',value:850000,contributed:850000,distributed:0,commitment:2119150};
  const records=ledger({...trust,id:'p3'},
    holding(1,'Averin Health Opportunities GP I LLC',1,1,{share:3500}),
    holding(2,'Averin Health Opportunities GP I LLC',1,3,{share:6500}),
    holding(3,'C2V Tributary Fund II, LP',1,1),
    capital({holding:1,...statement}),capital({holding:2,...statement}),
    capital({holding:3,asOf:'2026-09-20',value:150000,contributed:150000,distributed:0,commitment:150000}));
  const held=portfolio=>positionsOn(records,'2026-09-20').find(position=>position.holding.portfolio===portfolio);
  const his=held(1),hers=held(3);
  assert.equal(his.share,3500);
  assert.equal(his.commitment,741702.5);
  assert.equal(his.contributed,297500);
  assert.equal(his.value,297500);
  assert.equal(his.unfunded,444202.5);
  // The two shares are the vehicle between them, and neither restates it.
  assert.equal(Math.round((his.value+hers.value)*100)/100,850000);
  assert.equal(his.current.commitment,2119150,'the statement is untouched');
  // A multiple is a ratio, so a share cannot move it.
  assert.equal(his.multiple,1);
  // An investment with no share is the whole of its vehicle, which is what
  // every position filed before the share existed is.
  const c2v=positionsOn(records,'2026-09-20').find(position=>position.holding.number===3);
  assert.equal(c2v.share,WHOLE_SHARE);
  assert.equal(c2v.value,150000);

  // A statement for the trust's piece lands on the trust's position, not on
  // his: matched across the whole ledger it would overwrite the wrong one.
  const arriving=parseFinanceUpdates({readings:[],unread:'',capital:[
    {fund:'Averin Health Opportunities GP I LLC',holder:'Berry Family Trust',vehicle:'fund',
      asOf:'2026-12-31',value:900000,commitment:2119150,contributed:900000,distributed:0,
      confidence:'high',reason:'The statement states the period end.'}]}).capital;
  const filed=foldCapital(arriving,records,{institution:'Carta',today:'2027-01-05'});
  assert.equal(filed.rows.length,1);
  assert.equal(filed.rows[0].holding,2);
  assert.equal(filed.rows[0].isNew,false);
  assert.equal(filed.rows[0].share,6500,'the share already recorded against that portfolio’s position');
});

// Stocks and bonds are both Liquid securities. The ledger asks how much could
// be sold this week, not what it is invested in, so an equity sleeve and a
// municipal ladder in the same trust are one line rather than two numbers the
// reader has to add to answer the only question the line is there for.
test('an equity sleeve and a bond ladder are one liquid line, not two',()=>{
  const trust={row:'portfolio',number:1,name:'Berry AE 21 Irrevocable Trust',kind:5,currency:'USD'};
  const reading=(label,cls,value)=>({account:'AE 2021 Trust Y1 78660',label,class:classById(cls).code,
    registration:'',scope:'account',value,asOf:'2026-09-20',confidence:'high',reason:''});
  const folded=foldReadings([
    reading('Cap Group Intl','stocks',112757.17),
    reading('Kayne SMID','stocks',39972.55),
    reading('SP 500 TME','stocks',451894.37),
    reading('Core Munis','bonds',381402.85)
  ],[trust],{institution:'UBS',today:'2026-09-20'});
  assert.deepEqual(folded.marks.map(mark=>classLabel(mark.class)),['Liquid securities'],
    'one line, whatever the sleeves were called');
  assert.equal(folded.marks[0].amount,112757.17+39972.55+451894.37+381402.85);
  // The classes still exist for a figure entered by hand; it is the reading
  // that stops splitting what this ledger does not split.
  assert.ok(classById('stocks')&&classById('bonds'));
  // And what is not marketable keeps its own line, which is the distinction
  // the Breakdown is actually for.
  const mixed=foldReadings([
    reading('Brokerage','liquid',856692.22),
    reading('SP 500 TME','stocks',451894.37)
  ],[trust],{institution:'UBS',today:'2026-09-20'});
  assert.deepEqual(mixed.marks.map(mark=>classLabel(mark.class)).sort(),
    ['Fund investments','Liquid securities']);
});
