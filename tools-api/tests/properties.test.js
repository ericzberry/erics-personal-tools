import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {readListing,MAX_LISTING_TEXT} from '../src/properties.js';
import {taskPolicy} from '../src/model-policy.js';
const connection={provider:'openai',apiKey:'synthetic-key'};
const reply=value=>async url=>url.endsWith('/models')
  ?Response.json({data:[{id:'gpt-4.1-mini'}]})
  :Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:typeof value==='string'?value:JSON.stringify(value)}]}]});
const page='85 Greenway Ter, Forest Hills, NY 11375 · For sale · $1,250,000 · 4 bd · 2.5 ba · 2,400 sqft · Annual tax amount $18,200';
const url='https://www.zillow.com/homedetails/85-Greenway-Ter-Forest-Hills-Gardens-NY-11375/32004593_zpid/';

test('a listing page becomes a property holding only what the listing states',async()=>{
  const {record}=await readListing(connection,{text:page,url,today:'2026-09-13'},
    reply({listing:{address:'85 Greenway Ter, Forest Hills, NY 11375',price:1250000,beds:4,baths:2.5,sqft:2400,taxes:18200,hoa:null}}));
  assert.equal(record.address,'85 Greenway Ter, Forest Hills, NY 11375');
  assert.equal(record.price,1250000);
  assert.equal(record.hoa,null,'a figure the listing does not state stays unknown, not zero');
  assert.equal(record.link,url,'the property keeps the page it was read from');
  assert.equal(record.status,'Looking');
  assert.equal(record.since,'2026-09-13');
  assert.deepEqual(record.prices,[{price:1250000,on:'2026-09-13'}],'the first asking price is where the history starts');
});

test('a page that is not one listing comes back as the owner’s to know, not a failure',async()=>{
  await assert.rejects(readListing(connection,{text:'Homes for sale in Queens · 1,204 results',url},reply({error:'This is a search results page, not a single listing.'})),
    error=>error.status===422&&/search results/.test(error.message));
  // A reading that would not validate is refused rather than half-stored.
  await assert.rejects(readListing(connection,{text:page,url},reply({listing:{address:'',price:1}})),error=>error.status===502);
  await assert.rejects(readListing(connection,{text:page,url},reply('not json')),error=>error.status===502);
  await assert.rejects(readListing(connection,{text:'   ',url},reply({})),error=>error.status===400);
  await assert.rejects(readListing(connection,{text:'x'.repeat(MAX_LISTING_TEXT+1),url},reply({})),error=>error.status===400);
});

test('a link that is not a public page is not kept',async()=>{
  const {record}=await readListing(connection,{text:page,url:'http://localhost/listing',today:'2026-09-13'},reply({listing:{address:'85 Greenway Ter',price:null}}));
  assert.equal(record.link,'');
  assert.deepEqual(record.prices,[],'no price, no history');
});

test('reading a listing is a registered task with a cost ceiling',()=>{
  const policy=taskPolicy('properties.listing',{messages:[{role:'user',content:page}]});
  assert.equal(policy.web,false,'a listing is read from the page the owner has, never searched for');
  assert.ok(policy.maxCost>0&&policy.maxCost<=0.02);
});

test('properties store and validate through the shared record route',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../properties-schema.sql',import.meta.url),'utf8'));
  const token='synthetic-token-at-least-32-characters';
  const env={API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{
    prepare(query){
      const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};
    }
  }};
  const path='/v1/properties/44444444-4444-4444-8444-444444444444';
  const call=(target,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${target}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);
  const record={address:'85 Greenway Ter, Forest Hills, NY 11375',status:'Seen',price:1250000,beds:4,baths:2.5,sqft:2400,taxes:18200,hoa:null,link:url,notes:'Backs onto the park. Kitchen needs work.',since:'2026-09-01'};
  assert.equal((await call(path,'PUT',record,'bad')).status,401);
  assert.equal((await call(path,'PUT',{...record,status:'Maybe'})).status,400);
  assert.equal((await call(path,'PUT',{...record,price:-5})).status,400);
  const saved=(await (await call(path,'PUT',record)).json()).record;
  assert.equal(saved.notes,'Backs onto the park. Kitchen needs work.');
  // The stored row is an encrypted envelope, not the address in the clear.
  assert.equal(sql.prepare('SELECT value FROM property_records').get().value.includes('Greenway'),false);
  const snapshot=await (await call('/v1/properties/snapshot')).json();
  assert.deepEqual(snapshot.records[0].prices,[{price:1250000,on:'2026-09-01'}]);
  assert.equal((await call(path,'PUT',record)).status,409,'a stale revision cannot overwrite');
  assert.equal((await call(path,'DELETE',{revision:saved.revision})).status,200);
});
