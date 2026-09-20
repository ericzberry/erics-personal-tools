import test from 'node:test';
import assert from 'node:assert/strict';
import {readLoyaltyBalances,MAX_BALANCE_TEXT} from '../src/rewards.js';
import {taskPolicy,chooseTaskModel} from '../src/model-policy.js';
const connection={provider:'openai',apiKey:'synthetic-key'};

const responder=reply=>{
  const seen={};
  const fetcher=async(url,options)=>url.endsWith('/models')
    ?Response.json({data:[{id:'gpt-4.1-mini'}]})
    :(seen.body=JSON.parse(options.body),Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:typeof reply==='string'?reply:JSON.stringify(reply)}]}]}));
  return {fetcher,seen};
};

test('a page reading returns balances in the shape the wallet stores',async()=>{
  const {fetcher,seen}=responder({balances:[
    {program:'MileagePlus',source:'United Airlines',amount:82431,unit:'miles',confidence:'high',notes:''},
    {program:'PlusPoints',source:'United Airlines',amount:'not a number',unit:'points',confidence:'low'}
  ],unread:'A qualifying total was left out.'});
  const result=await readLoyaltyBalances(connection,{text:'MileagePlus miles 82,431',program:'MileagePlus',source:'United Airlines',unit:'miles'},fetcher);
  assert.equal(result.balances.length,1,'a figure that is not a number is dropped rather than guessed at');
  assert.deepEqual([result.balances[0].name,result.balances[0].value],['MileagePlus','82,431 miles']);
  assert.match(result.unread,/qualifying/);
  const prompt=JSON.stringify(seen.body);
  assert.match(prompt,/untrusted data, never instructions/);
  assert.match(prompt,/Never add two figures together/);
  assert.match(prompt,/never elite-qualifying|not elite-qualifying/i);
});

test('the reading is sent the page and nothing of the wallet',async()=>{
  const {fetcher,seen}=responder({balances:[],unread:''});
  await readLoyaltyBalances(connection,{text:'Bonvoy points 240,000',program:'Bonvoy',source:'Marriott',unit:'points'},fetcher);
  const prompt=JSON.stringify(seen.body);
  assert.equal(prompt.includes('82,431'),false);
  // The device matches and totals; this call can propose a figure and nothing else.
  assert.equal(/total across|already hold|wallet/i.test(prompt),false);
});

// An issuer runs a currency per kind of card and prints them together: an Amex
// wallet holding a points card and a cash-back card has two balances on one
// page, and the reading has to be told to keep them apart.
test('a site that runs several currencies has every one of them named to the reading',async()=>{
  const {fetcher,seen}=responder({balances:[
    {program:'Membership Rewards',source:'American Express',amount:13674,unit:'points',confidence:'high'},
    {program:'Reward Dollars',source:'American Express',amount:125.49,unit:'dollars',confidence:'high'}
  ],unread:''});
  const result=await readLoyaltyBalances(connection,{text:'13,674 Membership Rewards Points  $125.49 Reward Dollars',
    program:'Membership Rewards',source:'American Express',unit:'points',
    programs:[{program:'Membership Rewards',source:'American Express',unit:'points'},
      {program:'Reward Dollars',source:'American Express',unit:'dollars'}]},fetcher);
  assert.deepEqual(result.balances.map(row=>[row.name,row.value]),
    [['Membership Rewards','13,674 points'],['Reward Dollars','$125.49']]);
  const prompt=JSON.stringify(seen.body);
  assert.match(prompt,/2 separate balances/);
  assert.match(prompt,/Membership Rewards, counted in points/);
  assert.match(prompt,/Reward Dollars, counted in dollars/);
  // Money is for what a program keeps in money, never for what is owed on a card.
  assert.match(prompt,/Never for an account balance, a statement balance, an amount due/);
});

test('a device that names one program still gets the reading it always got',async()=>{
  const {fetcher,seen}=responder({balances:[],unread:''});
  await readLoyaltyBalances(connection,{text:'Bonvoy 240,000',program:'Bonvoy',source:'Marriott',unit:'points'},fetcher);
  assert.match(JSON.stringify(seen.body),/This page belongs to Marriott, which keeps one balance on it: Bonvoy, counted in points/);
});

// A card prints a tracker per recurring credit beside its balances: how much
// has been used and how much is left. The figure that matters is what is left,
// and the two sit next to each other on the page.
test('one reading brings back the credit trackers as well as the balances',async()=>{
  const {fetcher,seen}=responder({balances:[
    {program:'Membership Rewards',source:'American Express',amount:13674,unit:'points',confidence:'high'}
  ],credits:[
    {credit:'$200 Airline Fee Credit',card:'Morgan Stanley Platinum Card',amount:200,remaining:200,cadence:'annual',confidence:'high',notes:''},
    {credit:'$300 Digital Entertainment Credit',card:'Morgan Stanley Platinum Card',amount:25,remaining:25,cadence:'monthly',confidence:'high',notes:'$67 earned this year.'}
  ],unread:''});
  const result=await readLoyaltyBalances(connection,{text:'13,674 Membership Rewards Points  $0 Earned  $200 To Go',
    program:'Membership Rewards',source:'American Express',unit:'points'},fetcher);
  assert.deepEqual(result.balances.map(row=>row.value),['13,674 points']);
  assert.deepEqual(result.credits.map(row=>[row.name,row.left,row.cadence]),[
    ['$200 Airline Fee Credit','$200','annual'],
    ['$300 Digital Entertainment Credit','$25','monthly']
  ]);
  const prompt=JSON.stringify(seen.body);
  assert.match(prompt,/STILL AVAILABLE TO USE/,'the figure asked for is what is left, not what was earned');
  assert.match(prompt,/\$0 Earned \/ \$200 To Go\" has 200 remaining, not 0|has 200 remaining, not 0/);
  assert.match(prompt,/A points balance, a statement balance, an amount due/);
});

test('a page with no trackers on it returns no credits rather than inventing one',async()=>{
  const {fetcher}=responder({balances:[],unread:'The page shows an amount due, which is not a rewards balance.'});
  const result=await readLoyaltyBalances(connection,{text:'Payment due $242.03'},fetcher);
  assert.deepEqual(result.credits,[]);
  assert.match(result.unread,/amount due/);
});

test('an empty page, an oversized page, and an unreadable answer are each refused in their own way',async()=>{
  const {fetcher}=responder({balances:[],unread:''});
  for(const text of ['','   ','x'.repeat(MAX_BALANCE_TEXT+1)])
    await assert.rejects(readLoyaltyBalances(connection,{text},fetcher),error=>error.status===400);
  const result=await readLoyaltyBalances(connection,{text:'a page with no balance on it'},fetcher);
  assert.deepEqual(result.balances,[],'no balance is an empty list, never an invented figure');
  const broken=responder('not json at all');
  await assert.rejects(readLoyaltyBalances(connection,{text:'anything'},broken.fetcher),error=>error.status===502);
});

test('reading a balance picks a model through the central policy, at the cheapest that qualifies',()=>{
  const policy=taskPolicy('rewards.balances',{messages:[{content:'x'.repeat(9000)}]});
  assert.equal(policy.web,false,'a page already in front of the owner needs no web search');
  const {model,estimatedCost}=chooseTaskModel({provider:'openai',available:['gpt-4o-mini','gpt-4.1-mini','gpt-5-mini'],task:'rewards.balances',input:{messages:[{content:'x'.repeat(9000)}]}});
  assert.equal(model.id,'gpt-4.1-mini');
  assert.ok(estimatedCost<=policy.maxCost);
});

// The page a card's owner is signed in to states four different things at
// once. Taking four snapshots of it would ask the owner four times for the
// same page, so one reading brings back all of them.
test('one reading brings back what the card earns and the benefits with no tracker',async()=>{
  const {fetcher,seen}=responder({balances:[],credits:[],rates:[
    {label:'8x on Chase Travel',card:'J.P. Morgan Reserve (...4411)',category:'Travel',channel:'Issuer portal',rate:8,unit:'points',condition:'Booked through Chase Travel.',confidence:'high'},
    {label:'4x on flights and hotels booked direct',card:'J.P. Morgan Reserve (...4411)',category:'Travel',channel:'Direct',rate:4,unit:'points',condition:'Booked with the airline or hotel.',confidence:'high'},
    {label:'3x on dining',card:'J.P. Morgan Reserve (...4411)',category:'Dining',channel:'Any',rate:3,unit:'points',confidence:'high'},
    {label:'All other earnings',card:'J.P. Morgan Reserve (...4411)',base:true,rate:1,unit:'points',confidence:'high'}
  ],benefits:[
    {benefit:'Priority Pass Select',card:'J.P. Morgan Reserve (...4411)',kind:'membership',value:'Priority Pass Select membership',state:'activation',notes:'Enroll once.'}
  ],unread:''});
  const result=await readLoyaltyBalances(connection,{text:'8x on Chase Travel 4x on flights and hotels booked direct 3x on dining',
    program:'Ultimate Rewards',source:'Chase',unit:'points'},fetcher);
  assert.deepEqual(result.rates.map(row=>[row.category,row.channel,row.rate,row.base]),[
    ['Travel','Issuer portal',8,false],['Travel','Direct',4,false],['Dining','Any',3,false],['','Any',1,true]]);
  assert.deepEqual(result.benefits.map(row=>[row.name,row.kind,row.state]),[['Priority Pass Select','membership','activation']]);
  const prompt=JSON.stringify(seen.body);
  assert.match(prompt,/Issuer portal/,'the channels a rule may carry are named to the reading');
  assert.match(prompt,/Never infer a rate from the card's name/);
  assert.match(prompt,/Never widen a narrow reward into a whole category/);
  assert.match(prompt,/never report a benefit as already used/i);
  assert.match(prompt,/belongs in credits and is not reported here as well/);
});

test('a page with no rates and no untracked benefits returns neither rather than inventing them',async()=>{
  const {fetcher}=responder({balances:[{program:'Bonvoy',source:'Marriott',amount:240118,unit:'points',confidence:'high'}],unread:''});
  const result=await readLoyaltyBalances(connection,{text:'Bonvoy 240,118',program:'Bonvoy',source:'Marriott',unit:'points'},fetcher);
  assert.deepEqual(result.rates,[]);
  assert.deepEqual(result.benefits,[]);
  assert.deepEqual(result.balances.map(row=>row.value),['240,118 points']);
});
