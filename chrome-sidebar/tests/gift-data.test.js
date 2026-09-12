import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGift,groupGifts,advanced,nextStatus,describeGift,giftPeople,GIFT_STATUSES} from '../src/gift-data.js';
const base={person:'Ariana',idea:'Cast iron pan'};

test('an idea needs only a person and the idea, and keeps what else is known',()=>{
  const record=normalizeGift({...base,occasion:'Birthday',price:'89.5',link:'https://example.com/pan?x=1#where'});
  assert.deepEqual([record.status,record.price,record.date],['Idea',89.5,'']);
  // The fragment goes; the rest of the address is kept as typed.
  assert.equal(record.link,'https://example.com/pan?x=1');
  assert.equal(normalizeGift(base).price,null,'no price is not a price of zero');
  for(const change of [{person:'  '},{idea:''},{status:'Wrapped'},{date:'2026-02-30'},{price:-1},{price:1e9},{link:'http://example.com'},{link:'https://localhost/x'},{link:'not a url'}])
    assert.throws(()=>normalizeGift({...base,...change}),undefined,JSON.stringify(change));
});

test('one step at a time, and what was given comes back round for next year',()=>{
  const idea=normalizeGift(base);
  assert.equal(nextStatus(idea),'Bought');
  assert.equal(advanced(idea).status,'Bought');
  assert.equal(advanced(advanced(idea)).status,'Given');
  assert.equal(advanced(advanced(advanced(idea))).status,'Idea');
  assert.equal(GIFT_STATUSES.length,3,'a longer pipeline is bookkeeping nobody keeps up');
});

test('ideas group by person, unstarted first, and what was given stays at the bottom',()=>{
  const records=[
    normalizeGift({person:'Celeste',idea:'Telescope',status:'Given'}),
    normalizeGift({person:'Celeste',idea:'Ant farm'}),
    normalizeGift({person:'Ariana',idea:'Cast iron pan',status:'Bought'}),
    normalizeGift({person:'ariana',idea:'Apron'})
  ];
  const groups=groupGifts(records);
  // "ariana" is Ariana, under the spelling first seen — not a second list.
  assert.deepEqual(groups.map(group=>group.person),['Ariana','Celeste']);
  assert.deepEqual(groups[0].records.map(record=>record.idea),['Apron','Cast iron pan']);
  assert.deepEqual(groups.at(-1).records.map(record=>record.idea),['Ant farm','Telescope']);
  assert.deepEqual(giftPeople(records),['Ariana','Celeste']);
  assert.equal(describeGift(normalizeGift({...base,occasion:'Christmas',price:220})),'Idea · Christmas · $220');
});
