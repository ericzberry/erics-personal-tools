import test from 'node:test';
import assert from 'node:assert/strict';
import {offerTerms,offerBenefit,offersFor,advise,offerExpiry,breakEven,tied} from '../src/purchase-data.js';
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
  assert.deepEqual(advice.shared.map(line=>[line.name,line.dollars,line.supported,line.conditions]),[['Dell',200,false,['Up to that much; the merchant decides.']]]);
  assert.deepEqual(advice.elsewhere.map(line=>[line.name,line.card,line.dollars,line.supported,line.conditions]),
    [['Dell Technologies','Synthetic Gold Card (-31002)',50,false,['Add the Dell Technologies offer to the card first.','Spend $250.00 or more.']]]);
  assert.equal(advice.unrated,0);
});

test('an offer lifts a card only once it is on the card; until then it is what the card could come to',()=>{
  const big=badge=>[{id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
    {key:'dell-big',name:'Dell',category:'Electronics',badge,card:'Synthetic Everyday Card (-72005)',summary:'Spend $1,500 or more, get $300 back.'}]}];
  // Not yet added: the Platinum keeps the recommendation on what holds today,
  // and the Everyday says what one step would make it worth.
  const pending=advise({cards,wallet:[],catalogs:big(''),purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(pending.rows[0].name,'Synthetic Platinum Card');
  const everyday=pending.rows.find(row=>row.name==='Synthetic Everyday Card');
  assert.equal(everyday.total,40,'the un-added offer is not in the supported figure');
  assert.equal(everyday.couldBe,340,'but it is what the card could come to');
  assert.deepEqual(everyday.after,['Add the Dell offer to the card first.','Spend $1,500 or more.'],'the minimum still has to hold once it is added');
  assert.deepEqual(everyday.conditions,[]);
  assert.equal(everyday.offers[0].supported,false);
  // Added: the same offer is a supported line and the Everyday wins.
  const won=advise({cards,wallet:[],catalogs:big('Added'),purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(won.rows[0].name,'Synthetic Everyday Card');
  assert.equal(won.rows[0].total,340);
  assert.equal(won.rows[0].couldBe,null);
  assert.deepEqual(won.rows[0].conditions,['Spend $1,500 or more.']);
  // Under its minimum the offer is worth nothing and says why.
  const small=advise({cards,wallet:[],catalogs:big('Added'),purchase:{amount:800,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.equal(small.rows[0].name,'Synthetic Platinum Card');
  const under=small.rows.find(row=>row.name==='Synthetic Everyday Card');
  assert.equal(under.offers[0].dollars,0);
  assert.equal(under.couldBe,null,'an offer this purchase is under is not something a step would earn');
  assert.deepEqual(under.offers[0].conditions,['Spend $1,500 or more; this purchase is under it.']);
});

test('an expired offer adds nothing anywhere, and is counted so the screen can say so',()=>{
  const stale=[{id:'amex-offers',programId:'amex-offers',label:'Amex Offers',offers:[
    {key:'dell-old',name:'Dell',category:'Electronics',badge:'Added',card:'Synthetic Everyday Card (-72005)',summary:'Get $50 back on $100 or more.',dates:'Expires 09/01/2026'},
    {key:'dell-words',name:'Dell',category:'Electronics',badge:'Added',card:'Synthetic Everyday Card (-72005)',summary:'Get $40 back. Offer expires on August 31, 2026.'},
    {key:'dell-live',name:'Dell',category:'Electronics',badge:'Added',card:'Synthetic Everyday Card (-72005)',summary:'Get $10 back.',dates:'Expires 12/31/2026'}]}];
  const advice=advise({cards,wallet:[],catalogs:stale,purchase:{amount:100,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  const everyday=advice.rows.find(row=>row.name==='Synthetic Everyday Card');
  assert.deepEqual(everyday.offers.map(line=>[line.name,line.dollars,line.expiry]),[['Dell',10,'2026-12-31']]);
  assert.equal(everyday.total,12,'$2 base plus the one offer still running');
  assert.equal(everyday.couldBe,null);
  assert.equal(advice.expired,2);
  assert.equal(offerExpiry('November 16-18, 2026'),'2026-11-18','a range runs to its last day');
  assert.equal(offerExpiry('Ends Sep 30, 2026'),'2026-09-30');
  assert.equal(offerExpiry('Save 10% on everything.'),'','no date is no expiry, not an expired offer');
});

test('a credit is worth what its tracker says is left, and nothing until the tracker is read',()=>{
  const unread=[{id:'w-plat',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available'},
    {id:'w-dell',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum Card',value:'$200 per year',remaining:'',state:'available',card:'w-plat'}];
  const advice=advise({cards,wallet:unread,catalogs:[],purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  const platinum=advice.rows.find(row=>row.name==='Synthetic Platinum Card');
  assert.deepEqual(platinum.credits.map(line=>[line.name,line.dollars,line.supported,line.detail]),[['Dell credit',null,false,'$200 per year']]);
  assert.equal(platinum.total,60,'the $200 allowance is not counted as savings');
  assert.equal(platinum.couldBe,null,'and not as something a step would earn either: what is left is unknown');
  assert.deepEqual(platinum.after,['$200 per year allowance; what is left of it has not been read.']);
  // A known zero is a known zero.
  const spent=unread.map(entry=>entry.id==='w-dell'?{...entry,remaining:'$0'}:entry);
  const gone=advise({cards,wallet:spent,catalogs:[],purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.deepEqual(gone.rows[0].credits.map(line=>[line.dollars,line.supported]),[[0,true]]);
});

test('two accounts of one product are two plans sharing its terms, and a card with no terms is named in the coverage',()=>{
  const twice=[
    {id:'w-p1',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available',secretHint:'1111'},
    {id:'w-p2',kind:'card',name:'Synthetic Platinum Card',source:'Synthetic Bank',value:'5x flights',state:'available',secretHint:'2222'},
    {id:'w-dell',kind:'benefit',name:'Dell credit',source:'Synthetic Platinum Card',value:'$200 per year',remaining:'$150',state:'available',card:'w-p2'},
    {id:'w-x',kind:'card',name:'Synthetic Sapphire Card',source:'Bank',value:'x',state:'available',secretHint:'4321'}];
  const advice=advise({cards,wallet:twice,catalogs:[],purchase:{amount:2000,category:'Online shopping',channel:'Online',merchant:'Dell'},today});
  assert.deepEqual(advice.rows.map(row=>[row.name,row.hint,row.total]),
    [['Synthetic Platinum Card','2222',210],['Synthetic Platinum Card','1111',60],['Synthetic Everyday Card','',40]],
    'the credit belongs to the account it was read on, not to every card of that product');
  assert.deepEqual(advice.missing,[{name:'Synthetic Sapphire Card',hint:'4321',reason:'No earning rates saved for it.'}]);
  assert.equal(advice.unrated,1);
});

test('a points card is shown where its value stops mattering, and a near tie is a tie',()=>{
  const points=[card(PLATINUM,'Synthetic Points Card',{unit:'points',base:1,cpp:1.2,rules:JSON.stringify([bonus({rate:3})])}),
    card(EVERYDAY,'Synthetic Cash Card',{base:2,rules:'[]'})];
  const advice=advise({cards:points,wallet:[],catalogs:[],purchase:{amount:100,category:'Online shopping',channel:'Online',merchant:''},today});
  // 300 points at 1.2¢ is $3.60 against $2 cash: the points card wins, and
  // would lose below 0.67¢ a point.
  assert.equal(advice.rows[0].name,'Synthetic Points Card');
  assert.deepEqual(advice.breakEven,{cents:0.67,points:'Synthetic Points Card',cash:'Synthetic Cash Card',earned:300});
  assert.equal(breakEven({unit:'points',earned:300,dollars:3.6,total:3.6},{dollars:2,total:4}),1.33);
  assert.equal(breakEven({unit:'cash',earned:3,dollars:3,total:3},{dollars:2,total:2}),null);
  assert.equal(tied(10,10.4,true),true);assert.equal(tied(10,10.6,true),false);
  assert.equal(tied(2,2.1,false),true);assert.equal(tied(2,2.2,false),false);
});

test('a credit still to activate is worth nothing yet, and a credit is never worth more than the purchase',()=>{
  const uber=advise({cards,wallet,catalogs:[],purchase:{amount:12,category:'Transit',channel:'Direct',merchant:'Uber'},today});
  const platinum=uber.rows.find(row=>row.name==='Synthetic Platinum Card');
  assert.deepEqual(platinum.credits.map(line=>[line.name,line.dollars,line.supported]),[['Uber Cash',0,false]]);
  assert.deepEqual(platinum.conditions,[]);
  assert.deepEqual(platinum.after,['Activate Uber Cash first.','$15 per month allowance; what is left of it has not been read.']);
  const active=wallet.map(entry=>entry.id==='w-uber'?{...entry,state:'available',remaining:'$15'}:entry);
  const ready=advise({cards,wallet:active,catalogs:[],purchase:{amount:12,category:'Transit',channel:'Direct',merchant:'Uber'},today});
  assert.equal(ready.rows.find(row=>row.name==='Synthetic Platinum Card').credits[0].dollars,12);
  assert.equal(ready.rows[0].name,'Synthetic Platinum Card','$12 of credit beats a point of rate');
  // Activated but never read: an allowance, not a figure, so the rate decides.
  const unread=wallet.map(entry=>entry.id==='w-uber'?{...entry,state:'available'}:entry);
  const unknown=advise({cards,wallet:unread,catalogs:[],purchase:{amount:12,category:'Transit',channel:'Direct',merchant:'Uber'},today});
  assert.equal(unknown.rows[0].name,'Synthetic Everyday Card');
  assert.deepEqual(unknown.rows[1].credits.map(line=>[line.dollars,line.supported]),[[null,false]]);
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
