import test from 'node:test';
import assert from 'node:assert/strict';
import {loyaltySite,LOYALTY_PROGRAMS} from '../src/loyalty-sites.js';
import {balanceTotals,readBalance,parseBalanceReading,matchBalances,balanceRecord,BALANCE_LIMIT} from '../src/balance-data.js';
import {pageOffers} from '../src/page-offers.js';

const balance=(name,source,value,updatedAt=new Date().toISOString())=>({id:`${name}-id`,kind:'balance',name,source,value,state:'available',updatedAt});

test('a program is recognized by its own site, over HTTPS and nothing else',()=>{
  assert.equal(loyaltySite('https://www.united.com/en/us/myunited')?.id,'united');
  assert.equal(loyaltySite('https://www.marriott.com/loyalty/myAccount/default.mi')?.unit,'points');
  assert.equal(loyaltySite('http://united.com/'),null,'a balance read over plain HTTP is not this program');
  assert.equal(loyaltySite('https://united.com.example.invalid/'),null,'a lookalike host is not the program');
  assert.equal(loyaltySite('https://example.invalid/'),null);
});

test('every program names itself, its source, and the unit its balance is counted in',()=>{
  const ids=new Set();
  for(const program of LOYALTY_PROGRAMS){
    assert.ok(program.id&&program.label&&program.source,`${program.id} names itself`);
    assert.ok(['miles','points','Avios'].includes(program.unit),`${program.id} counts in a known unit`);
    assert.ok(program.hosts.length,`${program.id} is recognized by a host`);
    assert.equal(ids.has(program.id),false,'program ids are unique');
    ids.add(program.id);
  }
});

test('the wallet totals miles and points separately, and never adds them together',()=>{
  const {totals}=balanceTotals([
    balance('MileagePlus','United Airlines','82,431 miles'),
    balance('Mileage Plan','Alaska Airlines','12,000 miles'),
    balance('Bonvoy','Marriott','240,000 points'),
    {kind:'benefit',name:'Dining credit',source:'Amex',value:'$15 per month',updatedAt:new Date().toISOString()}
  ]);
  assert.deepEqual(totals.map(total=>[total.unit,total.amount,total.programs]),
    [['points',240000,1],['miles',94431,2]],'largest first, one line per unit, benefits left out');
});

test('a balance with no figure in it is counted in neither total rather than as zero',()=>{
  const summary=balanceTotals([balance('Gold','Hyatt','Globalist status'),balance('Bonvoy','Marriott','240,000 points')]);
  assert.equal(summary.unread,1);
  assert.deepEqual(summary.totals.map(total=>total.amount),[240000]);
});

test('an entry whose value states no unit takes it from the program name',()=>{
  assert.deepEqual(readBalance(balance('Membership Rewards','American Express','512,000')),{amount:512000,unit:'points'});
  assert.deepEqual(readBalance(balance('MileagePlus','United Airlines','82,431')),{amount:82431,unit:'miles'});
  assert.equal(readBalance({kind:'card',name:'Platinum',source:'Amex',value:'5x flights'}),null);
});

test('a total says how much of it is a month old, because a total is only as current as its oldest figure',()=>{
  const summary=balanceTotals([
    balance('Bonvoy','Marriott','240,000 points','2020-01-01T00:00:00.000Z'),
    balance('MileagePlus','United Airlines','1,000 miles')
  ]);
  assert.equal(summary.stale,1);
});

test('a reading keeps only the figures it can check',()=>{
  const program=loyaltySite('https://www.united.com/');
  const rows=parseBalanceReading({balances:[
    {program:'MileagePlus',source:'United Airlines',amount:'82,431',unit:'miles',confidence:'high'},
    {program:'MileagePlus',source:'United Airlines',amount:'not a number'},
    {program:'PlusPoints',source:'United Airlines',amount:'not a number',unit:'points'},
    {program:'MileagePlus',source:'United Airlines',amount:'100',unit:'miles'}
  ]},program);
  assert.equal(rows.length,1,'an unreadable figure is dropped, and the same program is not read twice');
  assert.deepEqual([rows[0].name,rows[0].value,rows[0].confidence],['MileagePlus','82,431 miles','high']);
});

test('a reading that names no program takes the one whose page it was read from',()=>{
  const program=loyaltySite('https://www.marriott.com/');
  const [row]=parseBalanceReading({balances:[{amount:'240000'}]},program);
  assert.deepEqual([row.name,row.source,row.value],['Bonvoy','Marriott','240,000 points']);
});

test('a reading is refused when it returns more balances than a page could hold',()=>{
  const balances=Array.from({length:BALANCE_LIMIT+1},(_,index)=>({program:`P${index}`,source:'S',amount:'1'}));
  assert.throws(()=>parseBalanceReading({balances}),/at most/);
});

test('a read balance updates the entry already in the wallet instead of adding a second one',()=>{
  const entries=[balance('MileagePlus','United Airlines','70,000 miles'),balance('Bonvoy','Marriott','10 points')];
  const [row]=matchBalances(parseBalanceReading({balances:[{program:'Mileage Plus',source:'United Airlines',amount:'82431',unit:'miles'}]}),entries);
  assert.equal(row.match?.id,'MileagePlus-id','matched by its source when the name is spelled differently');
  const saved=balanceRecord(row,row.match);
  assert.equal(saved.value,'82,431 miles');
  assert.equal(saved.id,row.match.id);
  assert.equal(saved.name,'MileagePlus','the entry keeps the name the owner gave it');
});

test('a balance reading never overwrites a benefit or a card',()=>{
  const entries=[{id:'card-id',kind:'card',name:'MileagePlus Explorer',source:'United Airlines',value:'2x United',state:'available',updatedAt:new Date().toISOString()}];
  const [row]=matchBalances(parseBalanceReading({balances:[{program:'MileagePlus',source:'United Airlines',amount:'1000',unit:'miles'}]}),entries);
  assert.equal(row.match,null);
  assert.equal(balanceRecord(row,null).kind,'balance');
});

test('a program page offers the wallet the reading, and no other page does',()=>{
  const [offer]=pageOffers({url:'https://www.aa.com/loyalty/summary'});
  assert.deepEqual([offer.capability,offer.label],['rewards','Read your AAdvantage balance']);
  assert.equal(pageOffers({url:'https://example.invalid/'}).length,0);
  assert.equal(pageOffers({url:'https://www.aa.com/',active:'rewards'}).length,0,'no offer to go where the owner already is');
});
