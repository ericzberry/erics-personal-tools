import test from 'node:test';
import assert from 'node:assert/strict';
import {offerTerms,offerBenefit,offersFor,advise} from '../src/purchase-data.js';
import {normalizeCard} from '../src/card-data.js';

const bonus=(extra={})=>({category:'Online shopping',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:'',merchant:'',...extra});
const card=(id,name,extra={})=>({id,...normalizeCard({name,unit:'cash',base:1,cpp:1,rules:JSON.stringify([bonus()]),checked:'2026-09-20',...extra})});
const PLATINUM='11111111-1111-4111-8111-111111111111',EVERYDAY='22222222-2222-4222-8222-222222222222';
const cards=[card(PLATINUM,'Synthetic Platinum Card'),card(EVERYDAY,'Synthetic Everyday Card',{base:2,rules:'[]'})];
// The wallet: the Platinum as a card entry, and a Dell credit filed under it.
const wallet=[
  {id:'w-plat',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available'},
  {id:'w-dell',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum Card',value:'$200 per year',remaining:'$150',state:'available',card:'w-plat'},
  {id:'w-uber',kind:'benefit',name:'Uber Cash',source:'Synthetic Platinum Card',value:'$15 per month',remaining:'',state:'activation',card:'w-plat'}
];
const catalogs=[
  {id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
    {key:'dell-everyday',name:'Dell',category:'Electronics',badge:'Added',card:'Synthetic Everyday Card (-72005)',summary:'Spend $599 or more, get $100 back.',path:'/offers/eligible?account_key=e'},
    {key:'dell-other',name:'Dell Technologies',category:'Electronics',badge:'',card:'Synthetic Gold Card (-31002)',summary:'Spend $250 or more, get $50 back.',path:'/offers/eligible?account_key=g'}]},
  {id:'ms-reserved',programId:'ms-reserved',label:'Morgan Stanley Reserved',offers:[
    {key:'/offer/dell',name:'Dell',category:'Home',badge:'',summary:'Save up to 10% off select laptops.'},
    {key:'/offer/sixt',name:'SIXT',category:'Travel',badge:'',summary:'Save up to 20% off car rentals.'}]}
];
const today='2026-09-22';

test('an offer’s sentence is read for what comes back, what must be spent and its ceiling',()=>{
  assert.deepEqual(offerTerms('Spend $599 or more, get $100 back.'),{back:100,percent:null,minimum:599,cap:null,upTo:false});
  assert.deepEqual(offerTerms('Get 5% back on purchases, up to $50 total.'),{back:null,percent:5,minimum:null,cap:50,upTo:false});
  assert.deepEqual(offerTerms('10% off major appliances.'),{back:null,percent:10,minimum:null,cap:null,upTo:false});
  assert.deepEqual(offerTerms('Save up to 20% off SIXT car rentals.'),{back:null,percent:20,minimum:null,cap:null,upTo:true});
  assert.deepEqual(offerTerms('$25 statement credit on purchases of $150 or more'),{back:25,percent:null,minimum:150,cap:null,upTo:false});
  assert.deepEqual(offerTerms('Get up to $50 back'),{back:50,percent:null,minimum:null,cap:null,upTo:true});
  // No figure is no figure: points are not money, and 100% is not a percentage.
  assert.deepEqual(offerTerms('Earn 3 additional points per dollar. 100% of members love it.'),{back:null,percent:null,minimum:null,cap:null,upTo:false});
  // What an offer comes to on a purchase, or without one.
  assert.deepEqual(offerBenefit(offerTerms('Spend $599 or more, get $100 back.'),2000),{dollars:100,met:true});
  assert.deepEqual(offerBenefit(offerTerms('Spend $599 or more, get $100 back.'),400),{dollars:0,met:false});
  assert.deepEqual(offerBenefit(offerTerms('Spend $599 or more, get $100 back.'),null),{dollars:100,met:null});
  assert.deepEqual(offerBenefit(offerTerms('Get 5% back, up to $50'),2000),{dollars:50,met:true});
  assert.deepEqual(offerBenefit(offerTerms('10% off'),null),{dollars:null,met:true});
  assert.deepEqual(offerBenefit(offerTerms('$50 off'),20),{dollars:20,met:true},'a discount is worth at most the purchase');
});

test('the merchant’s offers are found across catalogues, and nobody else’s are',()=>{
  const found=offersFor(catalogs,'Dell');
  assert.deepEqual(found.map(offer=>[offer.program,offer.name,offer.card]),
    [['Amex Offers','Dell','Synthetic Everyday Card (-72005)'],['Amex Offers','Dell Technologies','Synthetic Gold Card (-31002)'],['Morgan Stanley Reserved','Dell','']]);
  assert.equal(found[0].url,'https://global.americanexpress.com/offers/eligible?account_key=e','an issuer offer opens the list it is on');
  assert.equal(found[2].url,'https://msreserved.com/offer/dell');
  assert.deepEqual(offersFor(catalogs,''),[],'no merchant, no offer');
  assert.deepEqual(offersFor(catalogs,'Best Buy'),[]);
});

test('one recommendation adds the rate, the credit left and the offer, and says what has to hold',()=>{
  const advice=advise({cards,wallet,catalogs,purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(advice.estimated,true);
  // On the rate alone the Platinum wins (3% bonus against 2% base); with the
  // Dell credit it wins by more, and the Everyday's added offer does not
  // close the gap.
  const [best,other]=advice.rows;
  assert.equal(best.name,'Synthetic Platinum Card');
  assert.equal(best.dollars,60);
  assert.deepEqual(best.credits.map(line=>[line.name,line.detail,line.dollars]),[['Dell credit','$150 left',150]]);
  assert.equal(best.total,210);
  assert.deepEqual(best.offers,[]);
  assert.equal(other.name,'Synthetic Everyday Card');
  assert.equal(other.dollars,40);
  assert.deepEqual(other.offers.map(line=>[line.name,line.dollars,line.met]),[['Dell',100,true]]);
  assert.equal(other.total,140);
  // The added offer's only condition is its minimum, which this purchase meets.
  assert.deepEqual(other.conditions,['Spend $599.00 or more.']);
  assert.deepEqual(best.conditions,[]);
  // The Uber credit is not Dell's, so it is not here.
  assert.ok(!best.credits.some(line=>line.name==='Uber Cash'));
  // A program's offer that names no card applies whatever is paid with; an
  // issuer's offer on a card with no rates here is reported, not ranked.
  assert.deepEqual(advice.shared.map(line=>[line.name,line.dollars,line.conditions]),[['Dell',200,['Up to that much; the merchant decides.']]]);
  assert.deepEqual(advice.elsewhere.map(line=>[line.name,line.card,line.dollars,line.conditions]),
    [['Dell Technologies','Synthetic Gold Card (-31002)',50,['Add the Dell Technologies offer to the card first.','Spend $250.00 or more.']]]);
  assert.equal(advice.unrated,0);
});

test('an offer can move a card to the top, and one not yet added or under its minimum says so',()=>{
  const big=[{id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
    {key:'dell-big',name:'Dell',category:'Electronics',badge:'',card:'Synthetic Everyday Card (-72005)',summary:'Spend $1,500 or more, get $300 back.'}]}];
  const won=advise({cards,wallet:[],catalogs:big,purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(won.rows[0].name,'Synthetic Everyday Card');
  assert.equal(won.rows[0].total,340);
  assert.deepEqual(won.rows[0].conditions,['Add the Dell offer to the card first.','Spend $1,500 or more.']);
  const small=advise({cards,wallet:[],catalogs:big,purchase:{amount:800,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(small.rows[0].name,'Synthetic Platinum Card');
  const everyday=small.rows.find(row=>row.name==='Synthetic Everyday Card');
  assert.equal(everyday.offers[0].dollars,0);
  assert.deepEqual(everyday.conditions,['Add the Dell offer to the card first.','Spend $1,500 or more; this purchase is under it.']);
});

test('a credit still to activate is worth nothing yet, and a credit is never worth more than the purchase',()=>{
  const uber=advise({cards,wallet,catalogs:[],purchase:{amount:12,category:'Transit',channel:'Direct',merchant:'Uber'},today});
  const platinum=uber.rows.find(row=>row.name==='Synthetic Platinum Card');
  assert.deepEqual(platinum.credits.map(line=>[line.name,line.dollars]),[['Uber Cash',0]]);
  assert.deepEqual(platinum.conditions,['Activate Uber Cash first.']);
  const active=wallet.map(entry=>entry.id==='w-uber'?{...entry,state:'available'}:entry);
  const ready=advise({cards,wallet:active,catalogs:[],purchase:{amount:12,category:'Transit',channel:'Direct',merchant:'Uber'},today});
  assert.equal(ready.rows.find(row=>row.name==='Synthetic Platinum Card').credits[0].dollars,12);
  assert.equal(ready.rows[0].name,'Synthetic Platinum Card','$12 of credit beats a point of rate');
});

test('without an amount the rate decides and everything else is listed beside it',()=>{
  const advice=advise({cards,wallet,catalogs,purchase:{amount:'',category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(advice.estimated,false);
  assert.deepEqual(advice.rows.map(row=>[row.name,row.rate,row.total]),[['Synthetic Platinum Card',3,null],['Synthetic Everyday Card',2,null]]);
  assert.equal(advice.rows[0].credits[0].dollars,150,'a fixed credit is still a figure');
  assert.deepEqual(advice.rows[1].offers.map(line=>[line.dollars,line.met]),[[100,null]],'a minimum cannot be checked against no amount');
  assert.deepEqual(advice.shared.map(line=>line.dollars),[null],'a percentage has nothing to apply to');
});

test('the rate’s own requirements are conditions, and an unconfirmed one keeps the bonus out',()=>{
  const conditional=[card(PLATINUM,'Synthetic Platinum Card',{rules:JSON.stringify([bonus({rate:5,condition:'Only at U.S. merchants',channel:'Online',end:'2026-12-31',remaining:1000})])})];
  const purchase={amount:2000,category:'Online shopping',channel:'Online',merchant:''};
  const excluded=advise({cards:conditional,wallet:[],catalogs:[],purchase,today});
  assert.equal(excluded.rows[0].dollars,20);
  assert.deepEqual(excluded.rows[0].conditions,[]);
  const confirmed=advise({cards:conditional,wallet:[],catalogs:[],purchase,confirmed:[`${PLATINUM}:0`],today});
  assert.equal(confirmed.rows[0].dollars,60,'5% on the $1,000 left, 1% on the rest');
  assert.deepEqual(confirmed.rows[0].conditions,['Only at U.S. merchants','Online purchases only.','Through 2026-12-31.','On up to $1,000 more eligible spend.']);
  // A wallet card with no rates here is counted, never guessed at.
  const unrated=advise({cards:conditional,wallet:[{id:'w-x',kind:'card',name:'Synthetic Sapphire Card',source:'Bank',value:'x',state:'available'}],catalogs:[],purchase,today});
  assert.equal(unrated.unrated,1);
  assert.throws(()=>advise({cards,wallet,catalogs,purchase:{amount:-1,category:'Dining',channel:'Direct'}}));
});
