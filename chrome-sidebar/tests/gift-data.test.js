import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGift,groupGifts,bought,unbought,isBought,giftPeople,GIFT_STATUSES,GIFT_IDEA_MAX} from '../src/gift-data.js';
const base={person:'Ariana',idea:'Cast iron skillet, the 12 inch one'};

test('an idea is a person, the idea, and at most a link',()=>{
  const record=normalizeGift({...base,link:'https://example.com/pan?x=1#where'});
  assert.deepEqual(Object.keys(record).sort(),['idea','link','person','status']);
  assert.equal(record.status,'Idea');
  // The fragment goes; the rest of the address is kept as typed.
  assert.equal(record.link,'https://example.com/pan?x=1');
  // Anything the old shape carried is simply not a field any more.
  assert.equal(normalizeGift({...base,occasion:'Birthday',price:89,notes:'x'}).occasion,undefined);
  for(const change of [{person:'  '},{idea:''},{idea:'x'.repeat(GIFT_IDEA_MAX+1)},{status:'Given'},{link:'http://example.com'},{link:'https://localhost/x'},{link:'not a url'}])
    assert.throws(()=>normalizeGift({...base,...change}),undefined,JSON.stringify(change));
});

test('bought is the one step, and it is reversible',()=>{
  const idea=normalizeGift(base);
  assert.equal(isBought(idea),false);
  assert.equal(bought(idea).status,'Bought');
  assert.equal(isBought(bought(idea)),true);
  assert.equal(unbought(bought(idea)).status,'Idea');
  assert.deepEqual(GIFT_STATUSES,['Idea','Bought'],'an idea is either still to decide or already handled');
});

test('ideas group by who they are for, however the name was typed',()=>{
  const records=[
    normalizeGift({person:'Celeste',idea:'Telescope'}),
    normalizeGift({person:'Ariana',idea:'Skillet'}),
    normalizeGift({person:'ariana',idea:'Apron'})
  ];
  const groups=groupGifts(records);
  assert.deepEqual(groups.map(group=>group.person),['Ariana','Celeste']);
  assert.deepEqual(groups[0].records.map(record=>record.idea),['Apron','Skillet']);
  assert.deepEqual(giftPeople(records),['Ariana','Celeste']);
});
