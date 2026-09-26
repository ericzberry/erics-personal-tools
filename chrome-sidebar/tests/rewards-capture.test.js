import test from 'node:test';
import assert from 'node:assert/strict';
import {createRewardsCapture} from '../src/rewards-capture.js';
import {rewardProgram, programPath, offerUrl, mergeCatalog, MAX_OFFERS} from '../src/program-data.js';

const page = {url: 'https://secure.chase.com/web/auth/dashboard#/dashboard/travel', text: 'Exclusive offer: merchant stay discount.'};
test('Chase capture uses Rewards intake, preserves route and never declares complete', async () => {
  let payload, saved;
  const capture = createRewardsCapture({read: async value => {payload=value;return {offers:[{merchant:'Hotel',offer:'Third night free',card:'Reserve 1234'}]};},
    save: async (id, value) => {saved={id,value};}});
  assert.equal((await capture(page)).count,1);
  assert.equal(payload.source,'Chase');
  assert.equal(saved.id,'chase-offers');
  assert.equal(saved.value.complete,false);
  assert.equal(offerUrl(saved.id,saved.value.offers[0]),page.url);
  assert.equal((await capture(page)).status,'skipped');
});
test('capture skips authentication, bounds calls and keeps failed saves retryable', async () => {
  let calls=0, saves=0;
  const capture=createRewardsCapture({maxReads:2,read:async()=>{calls++;return {offers:[{merchant:'Hotel',offer:'Discount'}]};},
    save:async()=>{if(!saves++)throw Error('offline');}});
  assert.equal((await capture({...page,attention:'login'})).status,'skipped');
  await assert.rejects(capture(page),/offline/);
  assert.equal((await capture(page)).status,'saved');
  assert.equal((await capture({...page,text:page.text+' More'})).status,'limit');
  assert.equal(calls,2);
});
test('Chase origin stays constrained and application routes exclude secrets',()=>{
  assert.equal(rewardProgram(page.url).id,'chase-offers');
  assert.equal(programPath('chase-offers','https://phishing.example/path'),'');
  assert.equal(programPath('chase-offers','https://secure.chase.com/web/auth/dashboard#/dashboard/merchantOffers/offer-hub?accountId=123&offerId=456&token=secret'),'/web/auth/dashboard#/dashboard/merchantOffers/offer-hub?accountId=123&offerId=456');
  assert.equal(programPath('chase-offers','https://secure.chase.com/web?token=secret&state=abc#/dashboard/travel'),'/web#/dashboard/travel');
});
test('partial catalog overflow fails without discarding older offers',()=>{
  const previous={offers:Array.from({length:MAX_OFFERS},(_,i)=>({key:`old${i}`}))};
  assert.throws(()=>mergeCatalog(previous,{offers:[{key:'new'}],complete:false}),/No offers were discarded/);
  assert.equal(previous.offers.length,MAX_OFFERS);
});
