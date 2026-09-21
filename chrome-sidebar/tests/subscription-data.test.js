import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubscription,parseSubscriptionReading,mergeSubscriptionReading,subscriptionKey,statementAccount,matchingSubscriptions,annualCost,estimatedRenewal,subscriptionAttention,suggestedCycle,subscriptionAlerts,chargeKey} from '../src/subscription-data.js';
import {attentionItems} from '../src/attention-data.js';
import {subscriptionsOffline} from '../src/subscriptions-offline.js';
const charge=(on,amount=15)=>({on,amount,description:'SYNTHETIC STREAM',source:'Statement'});
const base=()=>normalizeSubscription({name:'Synthetic Stream',currency:'USD',charges:[charge('2026-01-31'),charge('2026-02-28')],amount:15,cycle:'monthly'});
test('statement candidates stay unconfirmed, merge evidence idempotently and preserve manual terms',()=>{
  const [r]=parseSubscriptionReading({subscriptions:[{...base(),state:'Active',cycle:'annual',renewal:'2026-10-01'}]},{account:'Everyday card',source:'February'});
  assert.equal(r.state,'Review');assert.equal(r.renewal,'');assert.equal(r.cycle,'monthly');
  assert.equal(estimatedRenewal(r),'2026-03-28');
  const saved={...r,state:'Canceled',amount:20,cycle:'annual',renewal:'2027-01-31'};
  const merged=mergeSubscriptionReading(saved,{...r,charges:[charge('2026-03-31',21)]});
  assert.equal(merged.state,'Canceled');assert.equal(merged.amount,20);assert.equal(merged.cycle,'annual');assert.equal(merged.renewal,'2027-01-31');
  assert.equal(mergeSubscriptionReading(merged,r).charges.length,3);
  assert.notEqual(subscriptionKey({...r,account:'Card A'}),subscriptionKey({...r,account:'Card B'}));
});
test('unknown terms, currencies and dates do not become made-up annual costs or renewals',()=>{
  assert.equal(annualCost({...base(),cycle:'unknown'}),null);assert.equal(annualCost({...base(),amount:null}),null);assert.equal(annualCost(base()),180);
  assert.equal(suggestedCycle([charge('2026-01-01')]),'unknown');
  assert.throws(()=>normalizeSubscription({...base(),renewal:'2026-02-30'}));
  assert.throws(()=>normalizeSubscription({...base(),url:'javascript:alert(1)'}));
  assert.throws(()=>parseSubscriptionReading({subscriptions:[{name:'Unknown',currency:'USD',charges:[]}]}));
  assert.throws(()=>parseSubscriptionReading({subscriptions:[{name:'Unknown',charges:[charge('2026-01-01')]}]}));
});
test('attention excludes canceled, conflicted and deleted subscriptions; overdue estimates remain until reviewed',()=>{
  const records=[{...base(),id:'review'},{...base(),id:'active',state:'Active'}, {...base(),id:'cancel',state:'Canceled'},{...base(),id:'conflict',conflict:true},{...base(),id:'delete',deleting:true}];
  assert.deepEqual(subscriptionAttention(records,'2026-09-14').map(r=>r.id),['review','active']);
  assert.match(subscriptionAttention(records,'2026-09-14')[1].reason,/Estimated/);
  // Finance is a portfolio and its dated figures, and attention names the
  // portfolio rather than every class inside it.
  const finance=[{id:'p1',row:'portfolio',number:1,name:'Old balance',kind:1,currency:'USD'},
    {id:'1-3-20260101',row:'mark',portfolio:1,class:3,asOf:'2026-01-01',amount:5}];
  const items=attentionItems({subscriptions:records,finance,personal:[{id:'p',label:'Passport',expires:'2026-09-20',secret:'must never appear'}]},{today:'2026-09-14'});
  assert.ok(items.some(i=>i.id==='finance:p1'));assert.ok(items.some(i=>i.reason==='Resolve conflicting edits'));assert.ok(!JSON.stringify(items).includes('must never appear'));
});
test('saved charges and alternatives survive cold offline edits, conflict resolution and disconnect',async()=>{
  let state=null,online=true,calls=0;
  const cloud=new Map([['one',{...base(),id:'one',revision:'first'}]]);
  const store={read:async()=>structuredClone(state),write:async(r,t,v)=>{state=structuredClone(v);},remove:async()=>{state=null;}};
  const remote=async(t,path,options={})=>{calls++;if(!online)throw Error('offline');if(path.endsWith('/snapshot'))return {records:[...cloud.values()]};const id=path.split('/').at(-1),old=cloud.get(id);if((old?.revision??null)!==options.value.revision)throw Object.assign(Error('Conflict'),{status:409});const record={...normalizeSubscription(options.value),id,revision:crypto.randomUUID()};cloud.set(id,record);return {record};};
  const create=()=>subscriptionsOffline({store,remote,online:()=>online,locks:null});
  let adapter=create();await adapter.request('token','/v1/subscriptions');online=false;adapter=create();const before=calls;
  const cached=await adapter.request('token','/v1/subscriptions');assert.equal(cached.records[0].charges.length,2);assert.equal(calls,before);
  await adapter.request('token','/v1/subscriptions/one',{method:'PUT',value:{...cached.records[0],state:'Active'}});
  adapter=create();assert.equal((await adapter.request('token','/v1/subscriptions')).records[0].state,'Active');await assert.rejects(adapter.disconnect('token'),/pending/);
  cloud.set('one',{...cloud.get('one'),revision:'other',notes:'Other device'});online=true;assert.equal((await adapter.request('token','/v1/subscriptions')).records[0].conflict,true);
  await adapter.resolve('token','one','local');assert.equal(cloud.get('one').state,'Active');await adapter.disconnect('token');online=false;await assert.rejects(adapter.request('token','/v1/subscriptions'),/download/);
});

test('higher charges require comparable periods and reviewed evidence survives reimport',()=>{
  const r={...base(),state:'Active',charges:[charge('2026-08-01',15),charge('2026-09-01',19)]};
  assert.match(subscriptionAlerts(r,'2026-09-14')[0].reason,/15.00.*19.00/);
  assert.equal(subscriptionAlerts({...r,cycle:'annual'},'2026-09-14').length,0);
  assert.equal(subscriptionAlerts({...r,charges:[...r.charges,charge('2026-09-01',2)]},'2026-09-14').length,0);
  assert.equal(subscriptionAlerts(r,'2026-08-14').length,0,'future evidence is not an observed change');
  const reviewed=normalizeSubscription({...r,reviewedCharges:r.charges.map(chargeKey)});
  assert.equal(subscriptionAlerts(mergeSubscriptionReading(reviewed,r),'2026-09-14').length,0);
  const changed=mergeSubscriptionReading(reviewed,{charges:[charge('2026-10-01',22)]});
  assert.equal(subscriptionAlerts(changed,'2026-10-14').length,1);
  assert.equal(changed.amount,15,'import preserves confirmed terms');
});
test('post-cancellation evidence is explicit, individually reviewed and compatible with older writes',()=>{
  const r=normalizeSubscription({...base(),state:'Canceled',canceledOn:'2026-08-15',charges:[charge('2026-08-15'),charge('2026-09-01')]});
  assert.equal(subscriptionAlerts({...r,canceledOn:''},'2026-09-14').length,0);
  assert.match(subscriptionAlerts(r,'2026-09-14')[0].reason,/1 charge after recorded cancellation/);
  const reviewed=normalizeSubscription({...r,reviewedCharges:r.charges.map(chargeKey)});
  assert.equal(subscriptionAttention([reviewed],'2026-09-14').length,0);
  const earlier=mergeSubscriptionReading(reviewed,{charges:[charge('2026-08-20')]});
  assert.equal(subscriptionAlerts(earlier,'2026-09-14').length,1,'newly discovered earlier charges still need review');
  const oldClient={name:r.name,currency:r.currency,state:'Canceled'};
  assert.equal(normalizeSubscription(oldClient,reviewed).canceledOn,r.canceledOn);
  assert.deepEqual(normalizeSubscription(oldClient,reviewed).reviewedCharges,reviewed.reviewedCharges);
  assert.throws(()=>normalizeSubscription({...r,canceledOn:'2026-02-30'}));
});

// UI-38. The card comes off the statement, so nobody types a nickname — and
// nothing that could be part of an account number survives the trip.
test('a statement names its card, never its number, and a service is one record across cards',()=>{
  for(const [printed,kept] of [['Amex Platinum','Amex Platinum'],['Platinum Card® ending 1-2345','Platinum Card®'],
    ['Chase Sapphire Reserve (xxxx-1234)','Chase Sapphire Reserve'],['Blue Cash Everyday Card - Acct ending in 31005','Blue Cash Everyday Card'],
    ['Citi Double Cash, account number: 4000-1234-5678-9010','Citi Double Cash'],['Amex Gold ****1004','Amex Gold'],
    ['Max Rewards','Max Rewards'],['Account # 1234 5678 9012',''],[null,''],[42,'']])assert.equal(statementAccount(printed),kept);
  const [read]=parseSubscriptionReading({account:'Amex Platinum ending 31004',subscriptions:[base()]});
  assert.equal(read.account,'Amex Platinum');
  const one={...normalizeSubscription({...base(),account:'Everyday card',state:'Active'}),id:'one'};
  assert.deepEqual(matchingSubscriptions([one],read).map(r=>r.id),['one'],'a new card joins the service already saved');
  assert.deepEqual(matchingSubscriptions([one],{...read,account:''}).map(r=>r.id),['one'],'so does a statement that names none');
  const two={...one,id:'two',account:'Amex Platinum'};
  assert.deepEqual(matchingSubscriptions([one,two],read).map(r=>r.id),['two'],'two saved on two cards: the card decides');
  assert.deepEqual(matchingSubscriptions([one,{...two,account:'Other'}],read),[],'and a third card is a third record');
  assert.equal(mergeSubscriptionReading(one,read).account,'Everyday card','a reading never replaces the card already saved');
  assert.equal(mergeSubscriptionReading({...one,account:''},read).account,'Amex Platinum','it fills one that is missing');
});
