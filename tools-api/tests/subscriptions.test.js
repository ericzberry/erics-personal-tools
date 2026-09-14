import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {readSubscriptions,researchSubscriptions} from '../src/subscriptions.js';
const connection={provider:'openai',apiKey:'synthetic-key'};
const reading={subscriptions:[{name:'Synthetic Stream',currency:'USD',charges:[{on:'2026-09-01',amount:15,description:'SYNTHETIC STREAM'}],notes:'One charge; verify the service.'}]};
const fetcher=(value,{search=false,source='https://example.com/pricing'}={})=>async url=>url.endsWith('/models')?Response.json({data:[{id:'gpt-4.1-mini'},{id:'gpt-5-mini'}]}):Response.json({status:'completed',output:[...(search?[{type:'web_search_call',action:{sources:[{url:source}]}}]:[]),{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
test('statement extraction rejects missing evidence, oversize text and unsupported claims',async()=>{
  const result=await readSubscriptions(connection,{text:'Synthetic statement'},fetcher(reading));assert.equal(result.subscriptions[0].state,'Review');assert.equal(result.subscriptions[0].cycle,'unknown');
  await assert.rejects(readSubscriptions(connection,{text:'x'.repeat(24001)},fetcher(reading)),e=>e.status===400);
  await assert.rejects(readSubscriptions(connection,{text:'Example'},fetcher({subscriptions:[{name:'Guess',currency:'USD',charges:[]}]})),e=>e.status===502);
});
test('research requires live evidence for every price and matching currency',async()=>{
  const input={name:'Synthetic Stream',currency:'USD',country:'United States',requirements:'No ads'};
  const value={summary:'Compare features.',options:[{name:'Basic annual',amount:100,currency:'USD',cycle:'annual',url:'https://example.com/pricing',terms:'Pay upfront. Tax treatment unknown.'}]};
  assert.equal((await researchSubscriptions(connection,input,fetcher(value,{search:true}))).research.options[0].amount,100);
  await assert.rejects(researchSubscriptions(connection,input,fetcher(value)),e=>e.status===502);
  await assert.rejects(researchSubscriptions(connection,input,fetcher(value,{search:true,source:'https://example.org/other'})),e=>e.status===502);
  await assert.rejects(researchSubscriptions(connection,input,fetcher({...value,options:[{...value.options[0],currency:'EUR'}]},{search:true})),e=>e.status===502);
});
test('additive schema preserves existing records; encrypted CRUD rejects stale edits and unauthorized requests',async()=>{
  const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('existing');");
  const schema=readFileSync(new URL('../subscriptions-schema.sql',import.meta.url),'utf8');sql.exec(schema);sql.exec(schema);assert.equal(sql.prepare('SELECT value FROM preserved').get().value,'existing');
  const token='synthetic-token-at-least-32-characters';const env={API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{prepare(query){const stmt=sql.prepare(query);let args=[];return {bind(...v){args=v;return this;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}};}};}}};
  const path='/v1/subscriptions/44444444-4444-4444-8444-444444444444';
  const call=(target,method='GET',value,auth=token)=>worker.fetch(new Request(`https://example.com${target}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);
  assert.equal((await call(path,'PUT',reading.subscriptions[0],'wrong')).status,401);
  const saved=await (await call(path,'PUT',reading.subscriptions[0])).json();assert.ok(saved.record);
  assert.equal(sql.prepare('SELECT value FROM subscription_records').get().value.includes('Synthetic Stream'),false);
  assert.equal((await call(path,'PUT',reading.subscriptions[0])).status,409);
  assert.equal((await (await call('/v1/subscriptions/snapshot')).json()).records.length,1);
  assert.equal((await call(path,'DELETE',{revision:saved.record.revision})).status,200);
  sql.close();
});
