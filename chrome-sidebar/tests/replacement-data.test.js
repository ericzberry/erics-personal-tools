import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReplacement,replacementSource,sortReplacements,replacementMatches,describeReplacement,REPLACEMENT_VARIANT_MAX} from '../src/replacement-data.js';

test('a thing to buy again is what it is, the exact variant, and optionally where',()=>{
  const record=normalizeReplacement({item:' Bedroom paint ',variant:'Benjamin Moore Hale Navy HC-154, eggshell '});
  assert.deepEqual(record,{item:'Bedroom paint',variant:'Benjamin Moore Hale Navy HC-154, eggshell',where:'',note:''});
  // The variant is the point of the record, so it cannot be left out.
  assert.throws(()=>normalizeReplacement({item:'Pillow',variant:'  '}),/exact variant/);
  assert.throws(()=>normalizeReplacement({item:'',variant:'Coop Original'}),/what it is/);
  assert.throws(()=>normalizeReplacement({item:'Pillow',variant:'x'.repeat(REPLACEMENT_VARIANT_MAX+1)}),/exact variant/);
  // An edit keeps what it did not mention.
  assert.equal(normalizeReplacement({note:'Two gallons'},record).variant,record.variant);
});

test('where it was bought is a shop’s name or a page this app would open',()=>{
  assert.equal(normalizeReplacement({item:'Ink',variant:'HP 67XL',where:'Staples on Main'}).where,'Staples on Main');
  const linked=normalizeReplacement({item:'Ink',variant:'HP 67XL',where:'https://www.amazon.com/dp/B07X#reviews'});
  assert.equal(linked.where,'https://www.amazon.com/dp/B07X','the fragment is not part of the page');
  assert.deepEqual(replacementSource(linked),{label:'amazon.com',link:'https://www.amazon.com/dp/B07X'});
  assert.deepEqual(replacementSource({where:'Staples'}),{label:'Staples',link:''});
  for(const where of ['http://example.com/cable','https://localhost/x','javascript://alert(1)'])
    assert.throws(()=>normalizeReplacement({item:'Cable',variant:'Anker 6 ft',where}),/https:\/\//,where);
});

test('the drawer reads by what the thing is, and finds a thing by any word on it',()=>{
  const records=[
    {item:'Running shoes',variant:'Brooks Ghost 16, 10.5 D',where:'Fleet Feet',note:''},
    {item:'bedroom paint',variant:'Hale Navy',where:'https://www.benjaminmoore.com/x',note:'Two gallons'},
    {item:'Bedroom paint',variant:'Chantilly Lace ceiling',where:'',note:''}
  ];
  assert.deepEqual(sortReplacements(records).map(record=>record.variant),['Chantilly Lace ceiling','Hale Navy','Brooks Ghost 16, 10.5 D']);
  assert.equal(records.filter(record=>replacementMatches(record,'fleet')).length,1);
  assert.equal(records.filter(record=>replacementMatches(record,'benjaminmoore')).length,1,'a shop named by its page is found by that name');
  assert.equal(records.filter(record=>replacementMatches(record,'GALLONS')).length,1);
  assert.equal(records.filter(record=>replacementMatches(record,'')).length,3);
  assert.equal(describeReplacement(records[0]),'Running shoes · Brooks Ghost 16, 10.5 D · Fleet Feet');
});
