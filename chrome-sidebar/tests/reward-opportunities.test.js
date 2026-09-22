import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardOpportunities,resolutionFor,score,BUCKETS,TOP_COUNT} from '../src/reward-opportunities.js';
import {normalizeCard} from '../src/card-data.js';

const now=new Date(2026,8,22,12);
const P1='11111111-1111-4111-8111-111111111111',RATES='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const card={id:P1,kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available',secretHint:'1111',url:'https://issuer.example/benefits',updatedAt:'2026-09-01T00:00:00Z'};
const benefit=(id,name,extra={})=>({id,kind:'benefit',name,source:card.name,value:'$100 per quarter',state:'available',cadence:'quarterly',card:P1,remaining:'$100',updatedAt:'2026-09-20T00:00:00Z',...extra});
const rates=[{id:RATES,revision:'1',...normalizeCard({name:'Synthetic Platinum Card',unit:'cash',base:1,cpp:1,checked:'2026-09-01',rules:'[]'})}];

test('access with no dollar figure ranks above a credit with one, and nothing says the owner is losing money',()=>{
  const entries=[card,
    {id:'lounge',kind:'membership',name:'Synthetic Lounge Collection',source:card.name,value:'Membership',state:'activation',card:P1,url:'https://issuer.example/lounge'},
    benefit('dining','Dining credit'),
    {id:'balance',kind:'balance',name:'Bonvoy',source:'Marriott',value:'240,000 points',state:'available',updatedAt:'2026-05-01T00:00:00Z'}];
  const {top,urgent}=rewardOpportunities({entries,cards:rates},{now});
  assert.deepEqual(top.map(item=>[item.kind,item.title,item.bucket]),[
    ['setup','Set up Synthetic Lounge Collection',BUCKETS.setup],
    ['use','Use Dining credit within 8 days',BUCKETS.recurring],
    ['gap','Update the Marriott balance',BUCKETS.possible]]);
  assert.equal(top[0].figure,'','no cash value is invented for access');
  assert.equal(top[0].action.url,'https://issuer.example/lounge');
  assert.match(top[1].why,/useful if you were already planning/);
  assert.equal(top[1].figure,'$100 left');
  // A credit needing enrollment with no tracker read shows its allowance as
  // an allowance, not as what is left.
  const enrol=rewardOpportunities({entries:[card,benefit('h','Hotel credit',{state:'activation',remaining:'',value:'$300 prepaid hotel credit'})],cards:rates},{now}).top[0];
  assert.equal(enrol.figure,'$300 allowance');
  assert.doesNotMatch(top.map(item=>item.why).join(' '),/losing/);
  assert.deepEqual(urgent.map(item=>item.key),[top[0].key,top[1].key]);
});

test('a dismissal holds until the terms or the period change, and a reminder until its date',()=>{
  const entries=[card,benefit('dining','Dining credit')];
  const first=rewardOpportunities({entries,cards:rates},{now}).top.find(item=>item.kind==='use');
  const dismissed=resolutionFor(first,'not_useful',{now});
  assert.equal(rewardOpportunities({entries,cards:rates,resolutions:[dismissed]},{now}).top.some(item=>item.kind==='use'),false);
  // A new period is a new question: the same credit at the next quarter's close is back.
  const october=new Date(2026,11,20,12);
  assert.equal(rewardOpportunities({entries,cards:rates,resolutions:[dismissed]},{now:october}).top.some(item=>item.kind==='use'),true);
  // A changed remaining amount reopens it too.
  const spent=entries.map(entry=>entry.id==='dining'?{...entry,remaining:'$40'}:entry);
  assert.equal(rewardOpportunities({entries:spent,cards:rates,resolutions:[dismissed]},{now}).top.some(item=>item.kind==='use'),true);
  const remind=resolutionFor(first,'remind',{until:'2026-09-25',now});
  assert.equal(rewardOpportunities({entries,cards:rates,resolutions:[remind]},{now}).top.some(item=>item.kind==='use'),false);
  assert.equal(rewardOpportunities({entries,cards:rates,resolutions:[remind]},{now:new Date(2026,8,26,12)}).top.some(item=>item.kind==='use'),true);
  assert.equal(rewardOpportunities({entries,cards:rates,resolutions:[dismissed]},{now}).dismissed,1);
});

test('the short list is five, no more than two from one card, and a catalogue is one row rather than a dump',()=>{
  const credits=Array.from({length:8},(_,index)=>benefit(`c${index}`,`Credit ${index}`));
  const other={id:'o',kind:'card',name:'Synthetic Gold Card',source:'Synthetic Bank',value:'4x dining',state:'available',secretHint:'2222'};
  const gold=Array.from({length:3},(_,index)=>benefit(`g${index}`,`Gold credit ${index}`,{source:other.name,card:'o'}));
  const catalog={id:'ms-reserved',programId:'ms-reserved',label:'Morgan Stanley Reserved',offers:Array.from({length:120},(_,index)=>({key:`/offer/${index}`,name:`Offer ${index}`,summary:'10% off.',firstSeenAt:'2026-01-01T00:00:00Z'}))};
  const result=rewardOpportunities({entries:[card,other,...credits,...gold],cards:rates,catalogs:[catalog]},{now});
  assert.equal(result.top.length,TOP_COUNT);
  const bySource=result.top.reduce((count,item)=>({...count,[item.source]:(count[item.source]||0)+1}),{});
  assert.ok(Object.values(bySource).every(count=>count<=2),JSON.stringify(bySource));
  // No membership says the owner is in the program, so the catalogue is
  // something to check, not something to browse — one row either way.
  const access=result.all.filter(item=>item.source==='Morgan Stanley Reserved');
  assert.deepEqual(access.map(item=>[item.kind,item.title]),[['access','Check whether Morgan Stanley Reserved is yours to use']]);
  assert.equal(result.rest.length,result.all.length-TOP_COUNT);
  const member={id:'ms',kind:'membership',name:'Reserved Living & Giving',source:'Morgan Stanley',value:'Member offers',state:'available'};
  const browse=rewardOpportunities({entries:[member],catalogs:[catalog]},{now}).all;
  assert.deepEqual(browse.map(item=>[item.kind,item.bucket,item.state]),[['explore',BUCKETS.explore,'confirmed']]);
});

test('what the wallet lacks is one row per account, and a used or unread thing is not raised',()=>{
  const entries=[card,benefit('a','Airline credit',{remaining:'',cadence:''}),benefit('b','Hotel credit',{remaining:'',cadence:''}),benefit('u','Used credit',{state:'used'}),
    {id:'never',kind:'balance',name:'Bonvoy',source:'Marriott',value:'Not read yet',state:'available'}];
  const {all}=rewardOpportunities({entries,cards:[]},{now});
  assert.deepEqual(all.map(item=>item.title),['Read what is left of Synthetic Platinum Card’s credits','Add what Synthetic Platinum Card earns']);
  assert.equal(all[0].why,'0 of 2 read · Pay counts a credit only once its tracker has been read');
  assert.equal(all[0].action.url,card.url);
  assert.equal(score({actionable:9,urgency:9,effort:9}),4,'the dimensions are clamped');
});
