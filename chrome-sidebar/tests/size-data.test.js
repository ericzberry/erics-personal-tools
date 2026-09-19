import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSize,groupSizes,sizeBrands,describeSize,GENERAL_BRAND,SIZE_ITEM_MAX,SIZE_VALUE_MAX} from '../src/size-data.js';
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

test('measurements come first, then brands, however the brand was typed',()=>{
  const records=[
    normalizeSize({brand:'Patagonia',item:'Fleece',size:'L'}),
    normalizeSize({brand:'',item:'Waist',size:'33 in'}),
    normalizeSize({brand:'lululemon',item:'Joggers',size:'M'}),
    normalizeSize({brand:'Lululemon',item:'ABC pant',size:'32x32'}),
    normalizeSize({brand:'',item:'Chest',size:'40 in'})
  ];
  const groups=groupSizes(records);
  assert.deepEqual(groups.map(group=>group.brand),[GENERAL_BRAND,'lululemon','Patagonia']);
  // General holds what no brand decided; inside a group, items read alphabetically.
  assert.deepEqual(groups[0].records.map(record=>record.item),['Chest','Waist']);
  assert.deepEqual(groups[1].records.map(record=>record.item),['ABC pant','Joggers']);
  assert.deepEqual(sizeBrands(records),['lululemon','Patagonia'],'General is not a brand');
});

test('a size reads as one line, with the brand only when one decided it',()=>{
  assert.equal(describeSize(normalizeSize(base)),'ABC joggers · M · Lululemon');
  assert.equal(describeSize(normalizeSize({brand:'',item:'Inseam',size:'32 in'})),'Inseam · 32 in');
});
