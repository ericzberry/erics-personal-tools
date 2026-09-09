import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_CATALOG,chooseTaskModel} from '../src/model-policy.js';
import {generate} from '../src/providers.js';
const choose=(task='email.summary',input={},available=MODEL_CATALOG)=>chooseTaskModel({provider:'openai',available,task,input});
test('task selection minimizes estimated cost among capable and available candidates',()=>{
 assert.equal(choose().model.id,'gpt-5.6-terra');
 assert.throws(()=>choose('email.summary',{},[{id:'gpt-4o-mini'},{id:'gpt-4.1-mini'}]));
 assert.equal(choose('email.summary',{messages:[{content:'x'.repeat(13000)}]}).policy.level,3);
 assert.equal(choose('restaurant.research').policy.web,true);
 assert.equal(choose('restaurant.availability').policy.level,2);
 assert.throws(()=>choose('restaurant.availability',{},[{id:'gpt-5-nano'}]),e=>e.status===400);
 assert.equal(choose('restaurant.research',{search:{mode:'category',limit:24}}).model.id,'gpt-5-mini');
 assert.throws(()=>choose('restaurant.research',{},[{id:'gpt-5-nano'}]),e=>e.status===400);
 assert.throws(()=>choose('unknown'),e=>e.status===400);
 assert.throws(()=>choose('email.summary',{},[]),e=>e.status===400);
 assert.throws(()=>chooseTaskModel({provider:'custom',available:MODEL_CATALOG,task:'email.summary'}),e=>e.status===400);
});
test('routing ignores unknown models and enforces context and estimated cost limits',()=>{
 assert.throws(()=>choose('email.summary',{},[{id:'unknown-cheap-model'}]),e=>e.status===400);
 for(const change of [{context:10},{input:999,output:999}])assert.throws(()=>chooseTaskModel({provider:'openai',available:['test'],task:'email.summary',catalog:[{...MODEL_CATALOG[0],id:'test',...change}]}),e=>e.status===400);
});
test('task request discovers account models and sends only its selected model with reasoning budget',async()=>{
 const calls=[];
 const result=await generate({provider:'openai',apiKey:'synthetic',model:'expensive-legacy-default'}, {task:'email.summary',messages:[{role:'user',content:'Meeting on Friday.'}]},async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-5.6-terra'},{id:'gpt-4.1-mini'}]});
  const body=JSON.parse(options.body);assert.equal(body.model,'gpt-5.6-terra');assert.equal(body.max_output_tokens,700);assert.equal(body.reasoning.effort,'none');
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Meeting on Friday.'}]}],status:'completed'});
 });
 assert.equal(calls.length,2);assert.equal(result.routing.task,'email.summary');assert.equal(result.model,'gpt-5.6-terra');
});
test('legacy defaults cannot drive generation and invalid tasks make no upstream calls',async()=>{
 for(const input of [{messages:[{role:'user',content:'Hi'}]},{task:'unknown'},{task:'restaurant.research'},{task:'email.summary',model:'override'}])
  await assert.rejects(generate({provider:'openai',apiKey:'synthetic',model:'legacy'},input,()=>assert.fail('No provider call')),e=>e.status===400);
});
test('discovery failures and billed-request failures never cause a blind retry or downgrade',async()=>{
 for(const stage of ['discovery','generation']){
  let calls=0;
  await assert.rejects(generate({provider:'openai',apiKey:'synthetic'},{task:'email.summary',messages:[{role:'user',content:'Hi'}]},async url=>{
   calls++;if(stage==='generation'&&url.endsWith('/models'))return Response.json({data:[{id:'gpt-5.6-terra'}]});
   return new Response('',{status:429});
  }),e=>e.status===429);
  assert.equal(calls,stage==='discovery'?1:2);
 }
});
