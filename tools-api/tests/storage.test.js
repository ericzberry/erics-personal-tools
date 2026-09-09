import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
const token='test-token-with-at-least-32-characters';
const id='a5bb73f0-738b-4cf6-9862-41c6468cf40a';
const path=`/v1/ai-connections/${id}`;
function environment() {
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 return {sql,API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),DB:{prepare(query){const statement=sql.prepare(query);let args=[];return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};}}};
}
const data={name:'Test provider',provider:'openai',model:'test-model',baseUrl:'https://api.openai.com/v1',apiKey:'private-provider-key'};
async function call(env,url,method='GET',value,auth=token,type='application/json') {
 return worker.fetch(new Request(`https://example.com${url}`,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`}:{ }),'Content-Type':type},body:value===undefined?undefined:typeof value==='string'?value:JSON.stringify(value)}),env);
}
test('authentication fails closed and old draft backup endpoints are removed',async()=>{
 const env=environment();
 for(const auth of [null,'wrong','x'.repeat(600)])assert.equal((await call(env,'/health','GET',undefined,auth)).status,401);
 assert.equal((await call({...env,API_TOKEN:undefined},'/health')).status,401);
 assert.equal((await call(env,'/v1/records/draft-backup')).status,404);
 assert.equal((await call(env,'/v1/records/settings')).status,404);
 assert.equal((await (await call(env,'/health')).json()).version,2);
});
test('connection roundtrip encrypts storage, masks keys, preserves keys on edit and supports removal',async()=>{
 const env=environment();
 assert.deepEqual(await (await call(env,'/v1/ai-connections')).json(),{connections:[]});
 const response=await call(env,path,'PUT',data);assert.equal(response.status,200);
 const saved=(await response.json()).connection;
 assert.equal(saved.hasApiKey,true);assert.equal(saved.apiKey,undefined);
 assert.equal(JSON.stringify(saved).includes(data.apiKey),false);
 const raw=env.sql.prepare('SELECT value FROM ai_connections').get().value;
 assert.equal(raw.includes(data.apiKey),false);assert.equal(raw.includes(data.name),false);
 let list=(await (await call(env,'/v1/ai-connections')).json()).connections;
 assert.equal(list[0].hasApiKey,true);assert.equal(list[0].apiKey,undefined);
 const edited=(await (await call(env,path,'PUT',{...saved,name:'Renamed'})).json()).connection;
 assert.equal(edited.hasApiKey,true);assert.equal(edited.name,'Renamed');
 const cleared=(await (await call(env,path,'PUT',{...edited,apiKey:''})).json()).connection;
 assert.equal(cleared.hasApiKey,false);
 assert.equal((await call(env,path,'DELETE',{revision:cleared.revision})).status,200);
 list=(await (await call(env,'/v1/ai-connections')).json()).connections;assert.deepEqual(list,[]);
});
test('stale updates and deletes conflict; provider changes never reuse a previous key',async()=>{
 const env=environment();const saved=(await (await call(env,path,'PUT',data)).json()).connection;
 assert.equal((await call(env,path,'PUT',data)).status,409);
 assert.equal((await call(env,path,'DELETE',{revision:'stale'})).status,409);
 const moved=(await (await call(env,path,'PUT',{...saved,provider:'custom'})).json()).connection;
 assert.equal(moved.hasApiKey,false);
 assert.equal((await call(env,path,'PUT',{...saved,name:'Stale'})).status,409);
});
test('invalid settings, content types, oversized requests and missing encryption are rejected',async()=>{
 const env=environment();
 for(const value of ['invalid','[]','null',{...data,name:''},{...data,provider:'bad'},{...data,baseUrl:'http://example.com'},{...data,baseUrl:'https://example.com?api_key=secret'},{...data,apiKey:'x'.repeat(5000)}])assert.equal((await call(env,path,'PUT',value)).status,400);
 assert.equal((await call(env,path,'PUT',data,token,'text/plain')).status,415);
 assert.equal((await call(env,path,'PUT',{text:'x'.repeat(66000)})).status,413);
 assert.equal((await call(env,path,'POST',data)).status,405);
 assert.equal((await call({...env,SETTINGS_ENCRYPTION_KEY:undefined},path,'PUT',data)).status,503);
 assert.deepEqual((await (await call(env,'/v1/ai-connections')).json()).connections,[]);
 const result=await call(env,'/v1/ai-connections');assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
});
test('provider routes use only encrypted saved credentials and never caller-supplied keys or URLs',async()=>{
 const env=environment();await call(env,path,'PUT',data);
 const previousFetch=globalThis.fetch;let requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});assert.equal(options.headers.Authorization,`Bearer ${data.apiKey}`);
  return url.endsWith('/models')?Response.json({data:[{id:'test-model'}]}):Response.json({output:[{type:'message',content:[{type:'output_text',text:'OK'}]}],status:'completed'});
 };
 try{
  assert.equal((await call(env,path+'/generate','POST',{model:'test',messages:[{role:'user',content:'hello'}]},null)).status,401);assert.equal(requests.length,0);
  assert.equal((await call(env,path+'/models')).status,200);
  assert.equal((await call(env,path+'/generate','POST',{model:'test',messages:[{role:'user',content:'hello'}],apiKey:'injected',baseUrl:'https://evil.example'})).status,200);
  assert.equal(requests.at(-1).url,'https://api.openai.com/v1/responses');
  assert.equal((await call(env,path+'/test','POST',{model:'test',messages:[{role:'user',content:'injected'}]})).status,200);
  assert.equal(JSON.parse(requests.at(-1).options.body).input[0].content,'Reply with just OK.');
 }finally{globalThis.fetch=previousFetch;}
});
