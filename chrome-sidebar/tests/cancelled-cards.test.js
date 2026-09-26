import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelledCard,usableCardRates,usableRewards,usableCatalogs,walletCards} from '../src/card-data.js';
import {nextActions,creditsThisQuarter,validateReward} from '../src/rewards-data.js';
import {advise} from '../src/purchase-data.js';
import {matchCredits} from '../src/credit-data.js';
import {createRewardsCapture} from '../src/rewards-capture.js';
const closed={id:'11111111-1111-4111-8111-111111111111',kind:'card',name:'Amex Platinum (21005)',source:'American Express',value:'Cancelled',state:'cancelled'};
const active={...closed,id:'22222222-2222-4222-8222-222222222222',name:'Morgan Stanley Platinum (61007)',state:'available'};
const credit={id:'credit',kind:'benefit',name:'Hotel credit',card:closed.id,source:closed.name,value:'$300',remaining:'$300',state:'available',due:'2026-09-30'};
const wallet=[closed,active,credit];
const catalog={offers:[{key:'closed',card:'Platinum Card (-21005)',name:'Hotel',summary:'Spend $100, get $50 back'},{key:'open',card:active.name,name:'Hotel',summary:'Spend $100, get $50 back'}]};
test('cancellation persists and excludes one account, its credits and its offers',()=>{
 assert.equal(validateReward(closed).state,'cancelled');
 assert.equal(cancelledCard('Platinum Card (-21005)',wallet),true);
 assert.equal(cancelledCard(active.name,wallet),false);
 assert.deepEqual(walletCards(wallet).map(x=>x.id),[active.id]);
 assert.equal(usableRewards(wallet).length,1);
 assert.deepEqual(usableCatalogs([catalog],wallet)[0].offers.map(o=>o.key),['open']);
 assert.equal(nextActions(wallet,new Date('2026-09-26')).length,0);
 assert.equal(creditsThisQuarter(wallet,{now:new Date('2026-09-26')}).length,0);
 assert.equal(matchCredits([{card:closed.name,name:'Hotel credit'}],wallet).length,0);
});
test('shared points survive cancellation and cancelled-only rates cannot win Pay',()=>{
 assert.equal(usableRewards([closed,{kind:'balance',card:closed.id,value:'500 points'}]).length,1);
 const cards=[{id:'rates',name:'Amex Platinum',unit:'points',base:1,cpp:1,rules:'[]',checked:'2026-09-26'}];
 const result=advise({cards,wallet:[closed],catalogs:[catalog],purchase:{category:'Travel',channel:'Direct',amount:100,merchant:'Hotel'}});
 assert.equal(result.rows.length,0);
 assert.equal(result.elsewhere.some(x=>x.key==='closed'),false);
});
test('travel capture consults the saved wallet before saving issuer offers',async()=>{
 let saved;
 const capture=createRewardsCapture({entries:async()=>wallet,read:async()=>({offers:catalog.offers.map(o=>({merchant:o.name,offer:o.summary,card:o.card}))}),save:async(id,value)=>{saved=value;}});
 assert.equal((await capture({url:'https://global.americanexpress.com/offers/eligible',text:'Offers for your cards'})).count,1);
 assert.equal(saved.offers[0].card,active.name);
});

test('another active account keeps shared product rates usable',()=>{
 const rates=[{id:'rates',name:'Amex Platinum'}];
 assert.equal(usableCardRates(rates,[closed,{...active,name:'Amex Platinum (61007)'}]).length,1);
 assert.equal(cancelledCard('Blue Cash Preferred (21005)',[closed]),false);
});
