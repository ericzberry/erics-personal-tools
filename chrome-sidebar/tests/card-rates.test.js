import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRateReading,matchRates,rateCards,rateCardRecord,RATE_LIMIT} from '../src/rate-data.js';
import {rewardRules,compareCards} from '../src/card-data.js';

// What the J.P. Morgan Reserve's own rewards page states, in the four lines it
// states them in. Research against public pages is at its weakest on an
// invitation-only product, and this page is at its strongest.
const RESERVE='J.P. Morgan Reserve (...4411)';
const reading=()=>({rates:[
  {label:'8x on Chase Travel',card:RESERVE,category:'Travel',channel:'Issuer portal',rate:8,unit:'points',
    condition:'Booked through Chase Travel.',confidence:'high'},
  {label:'4x on flights and hotels booked direct',card:RESERVE,category:'Travel',channel:'Direct',rate:4,unit:'points',
    condition:'Flights and hotels booked with the airline or hotel itself.',confidence:'high'},
  {label:'3x on dining',card:RESERVE,category:'Dining',channel:'Any',rate:3,unit:'points',condition:'',confidence:'high'},
  {label:'All other earnings',card:RESERVE,base:true,rate:1,unit:'points',confidence:'high'}
]});
const card=(over={})=>({id:'11111111-1111-4111-8111-111111111111',name:'J.P. Morgan Reserve',unit:'points',
  base:1,cpp:1.5,rules:'[]',source:'',checked:'2026-01-01',notes:'',revision:'r1',...over});

test('a card page states what it earns, and each rate reads into a category and a purchase method',()=>{
  const rows=parseRateReading(reading(),'Chase');
  assert.deepEqual(rows.map(row=>[row.label,row.category,row.channel,row.rate,row.base]),[
    ['8x on Chase Travel','Travel','Issuer portal',8,false],
    ['4x on flights and hotels booked direct','Travel','Direct',4,false],
    ['3x on dining','Dining','Any',3,false],
    ['All other earnings','','Any',1,true]
  ]);
  assert.equal(rows[0].unit,'points','a multiplier is points per dollar');
  assert.equal(rows[0].source,'Chase','a rate says where it was read');
  // A narrow reward filed under a broad category has to carry what narrows it,
  // or the comparison will spend it on purchases it was never good for.
  assert.match(rows[1].condition,/booked with the airline or hotel/i);
});

test('a rate the page did not state is never invented, and a reading is capped',()=>{
  const rows=parseRateReading({rates:[
    {label:'3% back at supermarkets',category:'Groceries',channel:'Any',rate:'3%',unit:'cash'},
    {label:'Unknown category',rate:5,unit:'points'},
    {label:'',category:'Dining',rate:2},
    {label:'No figure',category:'Gas',rate:'points'},
    {label:'Out of range',category:'Gas',rate:400},
    {label:'Nothing earned',category:'Transit',rate:0}
  ]});
  assert.deepEqual(rows.map(row=>[row.label,row.rate,row.unit]),[['3% back at supermarkets',3,'cash']],
    'a rate with no category, no figure, no wording or an impossible number is left out rather than guessed at');
  // The same category and purchase method stated twice for one card is one
  // rate; the first reading of it is kept.
  const twice=parseRateReading({rates:[{label:'3x dining',card:'X',category:'Dining',channel:'Any',rate:3},
    {label:'3x restaurants',card:'X',category:'Dining',channel:'Any',rate:9}]});
  assert.deepEqual(twice.map(row=>row.rate),[3]);
  const many=Array.from({length:RATE_LIMIT+1},(_,index)=>({label:`R${index}`,category:'Dining',channel:'Any',rate:index+1,card:`c${index}`}));
  assert.throws(()=>parseRateReading({rates:many}),/at most/);
  assert.deepEqual(parseRateReading({balances:[]}),[],'a page stating no rates proposes none');
});

test('a rate lands on the saved card the page names, and updates the rule that card already holds',()=>{
  const saved=card({rules:JSON.stringify([
    {category:'Dining',channel:'Any',rate:2,remaining:1000,active:true,end:'2027-01-01',condition:'Enrolled restaurants only.'}
  ])});
  const rows=matchRates(parseRateReading(reading(),'Chase'),[saved]);
  assert.deepEqual(rows.map(row=>row.holder?.id),Array(4).fill(saved.id));
  assert.equal(rows[2].existing?.rate,2,'the review says the dining rate is a change to a rule the card holds');
  assert.equal(rows[0].existing,null,'and that Chase Travel is a new one');
  assert.equal(rows[3].existing?.base,true,'"All other earnings" is the base rate, not a bonus');

  const [group]=rateCards(rows);
  const record=rateCardRecord(saved,group.rows,'2026-09-20');
  const rules=rewardRules(record.rules);
  assert.equal(rules.length,3,'the dining rule is updated rather than duplicated');
  assert.deepEqual(rules.map(rule=>[rule.category,rule.channel,rule.rate]),[
    ['Dining','Any',3],['Travel','Issuer portal',8],['Travel','Direct',4]]);
  // Everything else about a rule the owner already had is theirs.
  assert.equal(rules[0].remaining,1000);
  assert.equal(rules[0].end,'2027-01-01');
  assert.equal(rules[0].condition,'Enrolled restaurants only.','a rate the page states no restriction on does not erase one');
  assert.equal(record.base,1,'and the base is what the page said everything else earns');
  assert.equal(record.checked,'2026-09-20','terms read off the issuer’s own page today were reviewed today');
  assert.equal(record.cpp,1.5,'the owner’s redemption value is not the page’s to change');
});

// The point of all of it: Best card compares on saved terms, so a rate read
// off the page has to reach the comparison as an ordinary rule.
test('the folded rates decide the comparison the way a hand-entered rule would',()=>{
  const saved=card();
  const [group]=rateCards(matchRates(parseRateReading(reading()),[saved]));
  const updated={...saved,...rateCardRecord(saved,group.rows,'2026-09-20')};
  const confirmed=rewardRules(updated.rules).map((_,index)=>`${saved.id}:${index}`);
  const [best]=compareCards([updated],{category:'Travel',channel:'Issuer portal',amount:100,confirmed},'2026-09-20');
  assert.equal(best.matched.rate,8,'Chase Travel earns 8x');
  const [direct]=compareCards([updated],{category:'Travel',channel:'Direct',amount:100,confirmed},'2026-09-20');
  assert.equal(direct.matched.rate,4,'and a hotel booked direct earns 4x');
  const [other]=compareCards([updated],{category:'Gas',channel:'Direct',amount:100,confirmed},'2026-09-20');
  assert.equal(other.matched,null,'everything else falls back to the base rate');
  assert.equal(other.earned,100);
});

test('a rate matching no saved card is reported rather than given a card to land on',()=>{
  const wallet=[card({id:'22222222-2222-4222-8222-222222222222',name:'Blue Cash Preferred'})];
  const rows=matchRates(parseRateReading(reading()),wallet);
  assert.deepEqual(rows.map(row=>row.holder),Array(4).fill(null));
  assert.deepEqual(rateCards(rows),[],'nothing is written for a card the owner has not saved');
  // Two cards that fit the name equally file under neither, for the same
  // reason a credit does: the wrong card is worse than no card.
  const both=matchRates(parseRateReading({rates:[{label:'3x dining',card:'Chase Sapphire',category:'Dining',channel:'Any',rate:3}]}),
    [card({id:'33333333-3333-4333-8333-333333333333',name:'Chase Sapphire Preferred'}),
     card({id:'44444444-4444-4444-8444-444444444444',name:'Chase Sapphire Reserve'})]);
  assert.equal(both[0].ambiguous,true);
  assert.equal(both[0].holder,null);
});

// The page prints the last four beside the card's name, and an owner who put
// them in the card's own name has said which card this is more exactly than
// any product name can.
test('the digits the page prints decide between two cards of the same family',()=>{
  const rows=matchRates(parseRateReading({rates:[{label:'3x dining',card:'Sapphire Reserve ••••4411',category:'Dining',channel:'Any',rate:3}]}),
    [card({id:'33333333-3333-4333-8333-333333333333',name:'Chase Sapphire Reserve 4411'}),
     card({id:'44444444-4444-4444-8444-444444444444',name:'Chase Sapphire Reserve 9920'})]);
  assert.equal(rows[0].holder?.id,'33333333-3333-4333-8333-333333333333');
});

test('points read onto a card kept in cash back are reported rather than saved',()=>{
  const cash=card({id:'55555555-5555-4555-8555-555555555555',name:'J.P. Morgan Reserve',unit:'cash',base:2,cpp:1});
  const rows=matchRates(parseRateReading(reading()),[cash]);
  assert.equal(rows[0].mismatch,true);
  assert.equal(rows[0].holder,null,'8 and 8% are different numbers, and the card’s own unit reads them');
  assert.deepEqual(rateCards(rows),[]);
});

test('a page that states no rates leaves the card’s terms exactly as they were',()=>{
  const saved=card({rules:JSON.stringify([{category:'Dining',channel:'Any',rate:3,remaining:null,active:true,end:'',condition:''}])});
  const rows=matchRates(parseRateReading({balances:[{program:'Ultimate Rewards',amount:204812}],credits:[]}),[saved]);
  assert.deepEqual(rows,[]);
  assert.deepEqual(rateCards(rows),[],'no card record is built at all, so nothing is saved and nothing is touched');
});
