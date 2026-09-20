import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSize,groupSizes,sizeBrands,sizeLine,brandNames,describeSize,OTHER_GARMENT,SIZE_ITEM_MAX,SIZE_VALUE_MAX} from '../src/size-data.js';
const base={brand:'Lululemon',item:'ABC joggers',size:'M'};

test('a size is a brand, what it is for, the size, and how it fits',()=>{
  const record=normalizeSize({...base,fit:'  Runs slim  '});
  assert.deepEqual(Object.keys(record).sort(),['brand','fit','item','size']);
  assert.equal(record.fit,'Runs slim');
  // A measurement is the same record with no brand to file it under.
  assert.equal(normalizeSize({brand:'',item:'Waist',size:'33 in'}).brand,'');
  for(const change of [{item:''},{size:'  '},{item:'x'.repeat(SIZE_ITEM_MAX+1)},{size:'x'.repeat(SIZE_VALUE_MAX+1)},{brand:'x'.repeat(81)},{fit:'x'.repeat(201)}])
    assert.throws(()=>normalizeSize({...base,...change}),undefined,JSON.stringify(change));
});

test('a garment heads its run, the general size leads it, brands follow',()=>{
  const records=[
    normalizeSize({brand:'Patagonia',item:'Fleece',size:'L'}),
    normalizeSize({brand:'',item:'Waist',size:'33 in'}),
    normalizeSize({brand:'lululemon',item:'Joggers',size:'M'}),
    normalizeSize({brand:'Lululemon',item:'ABC pant',size:'32x32'}),
    normalizeSize({brand:'',item:'Chest',size:'40 in'}),
    normalizeSize({brand:'',item:'Shirt',size:'M'}),
    normalizeSize({brand:'Banana Republic',item:'Shirt',size:'M'}),
    normalizeSize({brand:'',item:'Pants length',size:'32 in'}),
    normalizeSize({brand:'',item:'Hammock',size:'Double'})
  ];
  const groups=groupSizes(records);
  // The garment is read off what the record is for: a chest is a shirt, a waist
  // is a pair of trousers, and a word the registry does not know waits at the end.
  assert.deepEqual(groups.map(group=>group.garment),['Shirts','Sweaters','Pants',OTHER_GARMENT]);
  assert.deepEqual(groups[0].records.map(record=>sizeLine(record)),
    ['General · M','Chest · 40 in','Banana Republic · M']);
  // Knitwear is cut to its own size in the same shop, so a fleece heads a run of
  // its own instead of answering for a shirt.
  assert.deepEqual(groups[1].records.map(record=>sizeLine(record)),['Patagonia · L']);
  // "Pants length" is the inseam, "joggers" adds nothing the heading has not said,
  // and both records of one brand read with the spelling first seen.
  assert.deepEqual(groups[2].records.map(record=>sizeLine(record,brandNames(records))),
    ['Waist · 33 in','Inseam · 32 in','lululemon · ABC pant · 32x32','lululemon · M']);
  assert.deepEqual(groups[3].records.map(record=>sizeLine(record)),['Hammock · Double']);
  assert.deepEqual(sizeBrands(records),['Banana Republic','lululemon','Patagonia'],'General is not a brand');
});

test('a size reads as one line, with the brand only when one decided it',()=>{
  assert.equal(describeSize(normalizeSize(base)),'ABC joggers · M · Lululemon');
  assert.equal(describeSize(normalizeSize({brand:'',item:'Inseam',size:'32 in'})),'Inseam · 32 in');
});
