import test from 'node:test';
import assert from 'node:assert/strict';
import {pointsAccounts,balanceAmount,currencyId,redemptionValue,valuationFor} from '../src/points-data.js';
import {normalizeCard} from '../src/card-data.js';

const now=new Date('2026-09-22T12:00:00Z');
const P1='11111111-1111-4111-8111-111111111111',BLUE='33333333-3333-4333-8333-333333333333',RATES='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',CASH='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entries=[
  {id:P1,kind:'card',name:'The Platinum Card® from American Express',source:'American Express',value:'5x flights',state:'available',secretHint:'1111'},
  {id:BLUE,kind:'card',name:'Blue Cash Preferred® Card',source:'American Express',value:'6% groceries',state:'available',secretHint:'3333'},
  {id:'mr',kind:'balance',name:'Membership Rewards',source:'American Express',value:'13,674 points',state:'available',updatedAt:'2026-09-21T00:00:00Z'},
  {id:'rd',kind:'balance',name:'Reward Dollars',source:'American Express',value:'$125.49',state:'available',updatedAt:'2026-06-01T00:00:00Z'},
  {id:'bonvoy',kind:'balance',name:'Bonvoy',source:'Marriott',value:'240,000 points',state:'available',updatedAt:'2026-09-01T00:00:00Z'},
  {id:'united',kind:'balance',name:'MileagePlus',source:'United Airlines',value:'Not read yet',state:'available'}
];
const cards=[
  {id:RATES,...normalizeCard({name:'The Platinum Card® from American Express (United States)',unit:'points',base:1,cpp:1.5,checked:'2026-09-01',rules:'[]'})},
  {id:CASH,...normalizeCard({name:'Blue Cash Preferred® Card',unit:'cash',base:1,cpp:1,checked:'2026-09-01',rules:'[]'})}];

test('balances are one row per currency, never summed, each with what earns into it and what a point is worth',()=>{
  const rows=pointsAccounts({entries,cards},{now});
  assert.deepEqual(rows.map(row=>[row.label,row.currency,row.unit,row.amount,row.stale]),[
    ['Amex','membership-rewards','points',13674,false],
    ['Amex cash','amex-cash','dollars',125.49,true],
    ['Marriott','marriott','points',240000,false]]);
  assert.ok(!rows.some(row=>row.id==='united'),'a program never read has no balance to show and no card earning into it');
  const [mr,cash,bonvoy]=rows;
  assert.deepEqual(mr.earners.map(account=>account.hint),['1111'],'the cash-back card earns Reward Dollars, not points');
  assert.deepEqual(mr.valuation,{cents:1.5,source:'Card terms',asOf:'2026-09-01'});
  assert.equal(mr.scenarioCents,20511);
  assert.deepEqual(cash.earners.map(account=>account.hint),['3333']);
  assert.deepEqual(cash.valuation,{cents:100,source:'Cash',asOf:''});
  assert.equal(bonvoy.valuation,null,'no card earns into it and nothing is saved, so its value is unknown, not 1¢');
  assert.equal(bonvoy.scenarioCents,null);
  // A saved value outranks the card's terms and says where it came from.
  const saved=pointsAccounts({entries,cards,valuations:[valuationFor('membership-rewards',1.1,{source:'Statement credit rate',asOf:'2026-09-22'})]},{now});
  assert.deepEqual(saved[0].valuation,{cents:1.1,source:'Statement credit rate',asOf:'2026-09-22',saved:true});
});

test('figures and currencies are read as they were written, and a redemption is valued from an actual pair of prices',()=>{
  assert.equal(balanceAmount('13,674 points'),13674);
  assert.equal(balanceAmount('$125.49'),125.49);
  assert.equal(balanceAmount('Gold status'),null);
  assert.equal(currencyId({name:'MileagePlus',source:'United Airlines'}),'united');
  assert.equal(currencyId({name:'House points',source:'Synthetic Hotel'}),'synthetic hotel house points');
  assert.equal(redemptionValue({cashPrice:600,awardCash:60,points:30000}),1.8);
  assert.equal(redemptionValue({cashPrice:600,points:0}),null);
});
