import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {classifyPurchase,researchCard,issuerSourceKey} from '../src/cards.js';
const connection={provider:'openai',apiKey:'synthetic-key'};
const fixture={name:'Synthetic Cash',unit:'cash',base:2,cpp:1,rules:'[]',checked:'2026-09-09',source:'https://issuer.example/terms',notes:''};
test('cards API authenticates, encrypts, validates and rejects stale per-record changes',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../cards-schema.sql',import.meta.url),'utf8'));
 const token='synthetic-token-at-least-32-characters';
 const env={API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{
   prepare(query){
     const statement=sql.prepare(query);let args=[];
     return {
       bind(...values){args=values;return this;},
       async first(){return statement.get(...args)||null;},
       async all(){return {results:statement.all(...args)};},
       async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}
     };
   }
 }};
 const path='/v1/cards/11111111-1111-4111-8111-111111111111';
 const call=(url,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${url}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);
 assert.equal((await call(path,'PUT',fixture,'bad')).status,401);
 assert.equal((await call(path,'PUT',{...fixture,base:-1})).status,400);
 const response=await call(path,'PUT',fixture);assert.equal(response.status,200);const saved=(await response.json()).record;
 assert.equal(sql.prepare('SELECT value FROM card_records').get().value.includes(fixture.name),false);
 const snapshot=await (await call('/v1/cards/snapshot')).json();assert.equal(snapshot.records[0].name,fixture.name);
 assert.equal((await call(path,'PUT',fixture)).status,409);
 assert.equal((await call(path,'DELETE',{revision:'old'})).status,409);
 assert.equal((await call(path,'DELETE',{revision:saved.revision})).status,200);
 assert.equal((await (await call('/v1/cards')).json()).records.length,0);
});
test('a free-text description is read into merchant, category, method and amount',async()=>{
 let body,reply='{"merchant":"Cote","category":"Dining","channel":"In store","amount":400,"confidence":"medium","reason":"Korean steakhouse"}';
 const fetcher=async(url,options)=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4o-mini'}]}):(body=JSON.parse(options.body),Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:reply}]}]}));
 const reading=await classifyPurchase(connection,{purchase:'dinner at Cote, $400'},fetcher);
 assert.deepEqual([reading.merchant,reading.category,reading.channel,reading.amount],['Cote','Dining','In store',400]);
 assert.equal(body.model,'gpt-4o-mini');
 // Only the description reaches the model; saved card names never do.
 assert.ok(!JSON.stringify(body).includes('Synthetic Cash'));
 // A bare description still reads, with no invented merchant, method or amount.
 reply='{"merchant":"","category":"Gas","confidence":"high","reason":"Fuel"}';
 assert.deepEqual(Object.values(await classifyPurchase(connection,{purchase:'gas'},fetcher)).slice(0,6),['Gas','high','Fuel','','Direct',null]);
 await assert.rejects(classifyPurchase(connection,{purchase:''},fetcher));
 const invalid=async url=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4o-mini'}]}):Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"category":"Wrong"}'}]}]});
 await assert.rejects(classifyPurchase(connection,{purchase:'Purchase'},invalid),e=>e.status===502);
});
test('issuer research requires web evidence and rejects incomplete or ungrounded output',async()=>{
 let evidence=true;
 const fetcher=async url=>url.endsWith('/models')?Response.json({data:[{id:'gpt-5-mini'}]}):Response.json({status:'completed',output:[{type:'web_search_call',action:{sources:evidence?[{url:fixture.source+'?utm_source=openai'}]:[]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({...fixture,rules:[]})}]}]});
 assert.equal((await researchCard(connection,{name:'Synthetic Cash'},fetcher)).card.base,2);
 evidence=false;await assert.rejects(researchCard(connection,{name:'Synthetic Cash'},fetcher),e=>e.status===502);
});
test('issuer evidence ignores tracking and fragments but preserves product-defining query parameters',()=>{
 assert.equal(issuerSourceKey('https://issuer.example/terms/?utm_source=openai#terms'),issuerSourceKey('https://issuer.example/terms'));
 assert.notEqual(issuerSourceKey('https://issuer.example/terms?product=a'),issuerSourceKey('https://issuer.example/terms?product=b'));
 assert.equal(issuerSourceKey('https://user:password@issuer.example/terms'),'');
});
