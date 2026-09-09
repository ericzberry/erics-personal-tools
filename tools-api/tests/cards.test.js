import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {classifyPurchase,researchCard} from '../src/cards.js';
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
test('category classification uses the task policy and validates AI output',async()=>{
 let body;
 const fetcher=async(url,options)=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4o-mini'}]}):(body=JSON.parse(options.body),Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"category":"Dining","confidence":"medium","reason":"Restaurant purchase"}'}]}]}));
 assert.equal((await classifyPurchase(connection,{purchase:'Dinner at a restaurant'},fetcher)).category,'Dining');
 assert.equal(body.model,'gpt-4o-mini');assert.ok(!body.instructions.includes('Synthetic Cash'));
 await assert.rejects(classifyPurchase(connection,{purchase:''},fetcher));
 const invalid=async url=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4o-mini'}]}):Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"category":"Wrong"}'}]}]});
 await assert.rejects(classifyPurchase(connection,{purchase:'Purchase'},invalid),e=>e.status===502);
});
test('issuer research requires web evidence and rejects incomplete or ungrounded output',async()=>{
 let evidence=true;
 const fetcher=async url=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4.1-mini'}]}):Response.json({status:'completed',output:[{type:'web_search_call',action:{sources:evidence?[{url:fixture.source}]:[]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({...fixture,rules:[]})}]}]});
 assert.equal((await researchCard(connection,{name:'Synthetic Cash'},fetcher)).card.base,2);
 evidence=false;await assert.rejects(researchCard(connection,{name:'Synthetic Cash'},fetcher),e=>e.status===502);
});
