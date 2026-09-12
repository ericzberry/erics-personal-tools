import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProperty,withPrice,priceChange,describeProperty,groupProperties,nextStatus,PROPERTY_STATUSES} from '../src/property-data.js';
import {listingSite} from '../src/listing-sites.js';
import {samePage} from '../src/public-url.js';
import {captureTarget,parseCapture} from '../src/capture-data.js';
const base={address:'85 Greenway Ter, Forest Hills, NY 11375',since:'2026-09-01'};

test('a property holds what a listing states, and nothing it does not',()=>{
  const record=normalizeProperty({...base,price:'$1,250,000',beds:'4',baths:2.5,sqft:'2,400',taxes:18200,hoa:''});
  assert.equal(record.price,1250000,'a price is read however it was typed');
  assert.equal(record.sqft,2400);
  assert.equal(record.hoa,null,'an HOA nobody has read is unknown, not zero');
  assert.equal(record.status,'Looking');
  assert.equal(normalizeProperty({...base,baths:2.4}).baths,2.5,'bathrooms come in halves');
  for(const bad of [{price:-1},{price:'about a million'},{status:'Maybe'},{link:'http://example.com'},{since:'last week'},{address:''}])
    assert.throws(()=>normalizeProperty({...base,...bad}),error=>error.status===400,JSON.stringify(bad));
});

test('the history starts at the first price, and only a different price joins it',()=>{
  const saved=normalizeProperty({...base,price:1250000});
  assert.deepEqual(saved.prices,[{price:1250000,on:'2026-09-01'}]);
  assert.equal(withPrice(saved,1250000,'2026-09-08').prices.length,1,'reading the same listing again adds nothing');
  const cut=withPrice(saved,1195000,'2026-09-13');
  assert.deepEqual(cut.prices.map(entry=>entry.price),[1250000,1195000]);
  assert.equal(priceChange(cut),-55000);
  assert.equal(describeProperty({...cut,beds:4,baths:2.5,sqft:2400,taxes:18200,hoa:null}),'$1,195,000 ↓ $55,000 · 4 bd · 2.5 ba · 2,400 sq ft · $18,200/yr tax');
  // A price with nothing recorded before it still keeps the one it replaced.
  const typed={...normalizeProperty({address:'12 Elm St'}),price:900000,prices:[]};
  assert.deepEqual(withPrice(typed,875000,'2026-09-13').prices.map(entry=>entry.price),[900000,875000]);
  // The history travels in order whatever order it arrives in.
  assert.deepEqual(normalizeProperty({...base,price:2,prices:[{price:2,on:'2026-09-10'},{price:1,on:'2026-09-02'}]}).prices.map(entry=>entry.on),['2026-09-02','2026-09-10']);
});

test('the shortlist reads in the order a search moves, cheapest first',()=>{
  const records=[
    {...normalizeProperty({address:'B',price:900000,status:'Seen'})},
    {...normalizeProperty({address:'A',price:1100000})},
    {...normalizeProperty({address:'C',price:800000})},
    {...normalizeProperty({address:'D',price:null})}
  ];
  assert.deepEqual(groupProperties(records).map(group=>[group.status,group.records.map(record=>record.address)]),[['Looking',['C','A','D']],['Seen',['B']]]);
  assert.deepEqual(PROPERTY_STATUSES.map(nextStatus),['Seen','Offer',null,null]);
});

test('a listing page is recognized by its path, and a search page is not',()=>{
  assert.equal(listingSite('https://www.zillow.com/homedetails/85-Greenway-Ter-Forest-Hills-Gardens-NY-11375/32004593_zpid/')?.id,'zillow');
  assert.equal(listingSite('https://www.redfin.com/NY/Brooklyn/5-Cambridge-Pl-11238/home/12345678')?.id,'redfin');
  assert.equal(listingSite('https://www.realtor.com/realestateandhomes-detail/85-Greenway-Ter_Forest-Hills_NY_11375_M00000-00000')?.id,'realtor');
  assert.equal(listingSite('https://www.compass.com/listing/85-greenway-terrace-queens-ny-11375/123/')?.id,'compass');
  assert.equal(listingSite('https://streeteasy.com/sale/1234567')?.id,'streeteasy');
  for(const url of ['https://www.zillow.com/new-york-ny/','https://www.redfin.com/city/30749/NY/New-York','https://www.compass.com/homes-for-sale/new-york-ny/','https://zillow.com.example.invalid/homedetails/1','http://www.zillow.com/homedetails/1/','not a url'])
    assert.equal(listingSite(url),null,url);
  assert.equal(samePage('https://www.zillow.com/homedetails/1/?utm=x','https://www.zillow.com/homedetails/1'),true);
  assert.equal(samePage('https://www.zillow.com/homedetails/1/','https://www.zillow.com/homedetails/2/'),false);
});

test('one typed line can become a property',()=>{
  const target=captureTarget('properties');
  assert.ok(target.fields('2026-09-13').includes('since: 2026-09-13'));
  const reading=parseCapture({capability:'properties',record:{address:'12 Elm St',status:'Seen',price:950000,beds:3,baths:null,sqft:null,taxes:null,hoa:null,link:'',notes:'Kitchen needs work.',since:'2026-09-13'}},'2026-09-13');
  assert.equal(reading.path,'/v1/properties');
  assert.deepEqual(reading.record.prices,[{price:950000,on:'2026-09-13'}]);
  assert.equal(reading.summary,'12 Elm St · $950,000 · 3 bd · Seen');
});
