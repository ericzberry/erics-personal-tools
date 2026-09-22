import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWalletRecord,cardAccounts,matchAccount,applyBindings,bindingFor,accountCoverage,coverageLine,walletGaps,accountPrograms,FRESH_DAYS} from '../src/wallet-data.js';
import {normalizeCard} from '../src/card-data.js';

const now=new Date('2026-09-22T12:00:00Z');
const P1='11111111-1111-4111-8111-111111111111',P2='22222222-2222-4222-8222-222222222222',BLUE='33333333-3333-4333-8333-333333333333';
const RATES='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entries=[
  {id:P1,kind:'card',name:'The Platinum Card® from American Express',source:'American Express',value:'5x flights',state:'available',secretHint:'1111'},
  {id:P2,kind:'card',name:'The Platinum Card® from American Express',source:'American Express',value:'5x flights',state:'available',secretHint:'2222'},
  {id:BLUE,kind:'card',name:'Blue Cash Preferred® Card',source:'American Express',value:'6% groceries',state:'available',secretHint:'3333'},
  {id:'c1',kind:'benefit',name:'Airline Fee Credit',source:'Platinum Card®',value:'$200 per year',remaining:'$200',state:'available',card:P1,updatedAt:'2026-09-20T00:00:00Z'},
  {id:'c2',kind:'benefit',name:'Uber Cash',source:'Platinum Card®',value:'$15 per month',remaining:'',state:'available',card:P1,updatedAt:'2026-09-20T00:00:00Z'},
  {id:'c3',kind:'benefit',name:'Airline Fee Credit',source:'Platinum Card®',value:'$200 per year',remaining:'$50',state:'available',card:P2,updatedAt:'2026-08-01T00:00:00Z'},
  {id:'m1',kind:'membership',name:'Priority Pass Select',source:'Platinum Card®',value:'Membership',state:'activation',card:P1},
  {id:'b1',kind:'balance',name:'Membership Rewards',source:'American Express',value:'13,674 points',state:'available',updatedAt:'2026-09-21T00:00:00Z'}
];
const cards=[{id:RATES,revision:'1',...normalizeCard({name:'The Platinum Card® from American Express (United States)',unit:'points',base:1,cpp:1.5,checked:'2026-09-01',rules:'[]'})}];
const catalogs=[{id:'amex-offers',programId:'amex-offers',label:'Amex Offers',complete:false,readAt:'2026-09-21T00:00:00Z',offers:[
  {key:'o1',name:'Dell',card:'Platinum Card® (-61111)',summary:'Get $50 back.'},
  {key:'o2',name:'Saks',card:'Platinum Card® (-61111)',summary:'Get $10 back.'},
  {key:'o3',name:'Hyatt',card:'Blue Cash Preferred® ····3333',summary:'Get $20 back.'}]}];

test('two accounts of one product are two accounts sharing its terms',()=>{
  const accounts=cardAccounts(entries,cards);
  assert.deepEqual(accounts.map(account=>[account.id,account.hint,account.cardId]),[[P1,'1111',RATES],[P2,'2222',RATES],[BLUE,'3333',null]]);
  assert.equal(accounts[0].source,'American Express');
});

test('a page name finds its account by binding, then digits, then words, and never across conflicting digits',()=>{
  const accounts=cardAccounts(entries,cards);
  assert.equal(matchAccount('Platinum Card® (-62222)',accounts).account.id,P2,'digits decide');
  assert.equal(matchAccount('Platinum Card® (-69999)',accounts).account,null,'digits that match no account are nobody’s');
  assert.equal(matchAccount('Platinum Card® (-69999)',accounts).conflict,true);
  const ambiguous=matchAccount('Platinum Card®',accounts);
  assert.equal(ambiguous.account,null,'two Platinums fit the words equally');
  assert.deepEqual(ambiguous.candidates.map(account=>account.id),[P1,P2]);
  assert.equal(matchAccount('Blue Cash Preferred',accounts).account.id,BLUE,'words decide where only one product fits');
  // Once chosen, the choice is kept and asked for no more.
  const binding=bindingFor('amex',' Platinum Card® ',accounts[1]);
  assert.deepEqual(binding,{kind:'binding',key:'platinum card',adapter:'amex',accountId:P2,label:'The Platinum Card® from American Express'});
  const bound=matchAccount('Platinum Card®',accounts,[binding]);
  assert.equal(bound.account.id,P2);assert.equal(bound.bound,true);
  assert.equal(matchAccount('Platinum Card®',accounts,[binding],{adapter:'chase'}).account,null,'a binding is per source');
  const rows=applyBindings([{name:'Airline Fee Credit',card:'Platinum Card®',holder:null,ambiguous:true}],[binding],entries);
  assert.equal(rows[0].holder.id,P2);assert.equal(rows[0].ambiguous,false);assert.equal(rows[0].bound,true);
});

test('the wallet says, per account and per kind, what it has read and what it has not',()=>{
  const accounts=cardAccounts(entries,cards);
  const [first,second,blue]=accounts.map(account=>accountCoverage(account,{entries,catalogs},now));
  assert.deepEqual(first.kinds.map(kind=>[kind.kind,kind.state,kind.at]),[
    ['terms','read','2026-09-01'],['credits','partial','2026-09-20'],['offers','read','2026-09-21'],['balance','read','2026-09-21']]);
  assert.equal(first.kinds[1].detail,'1 of 2 read');
  assert.equal(coverageLine(first,now),'earning terms read 21 days ago · credit trackers partly read 2 days ago · offers read yesterday · membership rewards read yesterday');
  assert.deepEqual(second.kinds.map(kind=>[kind.kind,kind.state]),[['terms','read'],['credits','stale'],['offers','missing'],['balance','read']]);
  // A cash-back card at an issuer running two currencies: its terms are not
  // saved, so which program it earns into is not confirmed.
  assert.deepEqual(blue.kinds.map(kind=>[kind.kind,kind.state]),[['terms','missing'],['offers','read'],['balance','unknown']]);
  assert.deepEqual(accountPrograms({...blue.account,card:{unit:'cash'}}).map(program=>program.id),['amex-cash']);
  const gaps=walletGaps(accounts,{entries,catalogs},now);
  assert.deepEqual(gaps.map(gap=>[gap.account.hint,gap.kind,gap.state]),[['1111','credits','partial'],['2222','credits','stale'],['2222','offers','missing'],['3333','terms','missing'],['3333','balance','unknown']]);
  assert.match(gaps[0].next,/benefits page/);
  assert.equal(FRESH_DAYS.credits,7);
});

test('wallet records are typed, keyed and checked',()=>{
  assert.deepEqual(validateWalletRecord({kind:'valuation',key:'membership-rewards',cents:'1.6',source:'Portal rate',asOf:'2026-09-22'}),{kind:'valuation',key:'membership-rewards',cents:1.6,source:'Portal rate',asOf:'2026-09-22'});
  const resolution=validateWalletRecord({kind:'resolution',key:'setup:m1',action:'not_useful',fingerprint:'x',at:'2026-09-22T00:00:00.000Z'});
  assert.equal(resolution.action,'not_useful');
  assert.equal(validateWalletRecord({kind:'goal',key:'chicago',text:'Hotel stay in Chicago in November',by:'2026-11-10'}).state,'open');
  for(const bad of [{kind:'invented',key:'x'},{kind:'valuation',key:'x',cents:0},{kind:'valuation',key:'x',cents:500},{kind:'resolution',key:'x',action:'remind'},
    {kind:'resolution',key:'x',action:'later'},{kind:'binding',key:'x',adapter:'amex',accountId:'not-a-uuid'},{kind:'goal',key:'x',text:''},{kind:'goal',key:'x',text:'y',by:'2026-02-30'}])
    assert.throws(()=>validateWalletRecord(bad),`${JSON.stringify(bad)} should be refused`);
  // An edit keeps what it did not send.
  assert.equal(validateWalletRecord({cents:2},{kind:'valuation',key:'ur',cents:1,source:'Card terms',asOf:''}).source,'Card terms');
});
