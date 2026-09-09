import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_PROVIDERS} from '../../chrome-sidebar/src/ai-providers.js';
import {generate,listModels,providerConfig,generationInput} from '../src/providers.js';
const key='private-test-api-key';
const input={model:'test-text-model',messages:[{role:'system',content:'Be brief.'},{role:'user',content:'Hello'}],maxTokens:512};
const sample=format=>format==='responses'?{output:[{type:'message',content:[{type:'output_text',text:'Hello'}]}],status:'completed',usage:{input_tokens:10,output_tokens:2}}:format==='anthropic'?{content:[{type:'thinking',thinking:'private reasoning'},{type:'text',text:'Hello'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:2}}:{choices:[{message:{content:'Hello',reasoning_content:'private reasoning'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2}};
for(const provider of AI_PROVIDERS){
 test(`${provider.name}: text adapter endpoint, authentication, payload and normalized output`,async()=>{
  const connection={provider:provider.id,apiKey:key,baseUrl:provider.id==='custom'?'https://example.com/v1':'',model:'default-model'};
  const result=await generate(connection,input,async(url,options)=>{
   const config=providerConfig(connection),body=JSON.parse(options.body);
   assert.equal(url,config.baseUrl+(config.format==='responses'?'/responses':config.format==='anthropic'?'/messages':'/chat/completions'));
   assert.equal(options.redirect,'manual');assert.equal(options.credentials,undefined);assert.equal(options.method,'POST');
   assert.equal(body.model,input.model);
   if(config.format==='anthropic'){assert.equal(options.headers['x-api-key'],key);assert.equal(options.headers['anthropic-version'],'2023-06-01');assert.equal(body.system,'Be brief.');assert.equal(body.messages.some(m=>m.role==='system'),false);}
   else assert.equal(options.headers.Authorization,`Bearer ${key}`);
   if(config.format==='responses'){assert.equal(body.store,false);assert.equal(body.instructions,'Be brief.');assert.equal(body.max_output_tokens,512);}
   else assert.equal(body.max_tokens,512);
   return Response.json(sample(config.format));
  });
  assert.equal(result.text,'Hello');assert.deepEqual(result.usage,{inputTokens:10,outputTokens:2});assert.equal(result.warning,null);assert.equal(JSON.stringify(result).includes(key),false);assert.equal(JSON.stringify(result).includes('private reasoning'),false);
 });
}
test('custom endpoints support all three request formats and reject unsafe destinations',async()=>{
 for(const apiFormat of ['chat','responses','anthropic']){
  const result=await generate({provider:'custom',apiKey:key,baseUrl:'https://example.com/api',apiFormat},input,async()=>Response.json(sample(apiFormat)));assert.equal(result.text,'Hello');
 }
 for(const baseUrl of ['http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://service.internal','https://key:secret@example.com','https://example.com?key=secret'])assert.throws(()=>providerConfig({provider:'custom',baseUrl}));
 assert.throws(()=>providerConfig({provider:'openai',baseUrl:'https://other.example.com/v1'}));
 assert.equal(providerConfig({provider:'zai',baseUrl:'https://api.z.ai/api/coding/paas/v4'}).format,'chat');
});
test('model discovery handles catalogs, manual providers, partial lists and redaction',async()=>{
 const result=await listModels({provider:'anthropic',apiKey:key},async(url,options)=>{assert.equal(url,'https://api.anthropic.com/v1/models');assert.equal(options.headers['x-api-key'],key);return Response.json({data:[{id:'model-b',display_name:'B'},{id:'model-a',display_name:key}],has_more:true});});
 assert.equal(result.models[0].id,'model-a');assert.equal(result.models[0].name,'[redacted]');assert.equal(result.partial,true);
 assert.equal((await listModels({provider:'zai',apiKey:key},()=>assert.fail('No model endpoint assumed'))).manual,true);
 assert.equal((await listModels({provider:'together',apiKey:key},async()=>Response.json([{id:'test'}]))).models.length,1);
});
test('upstream errors, timeouts and invalid responses do not expose credentials or retry',async()=>{
 const connection={provider:'openai',apiKey:key};
 for(const status of [400,401,402,403,404,429,500]){
  let calls=0;
  await assert.rejects(generate(connection,input,async()=>{calls++;return new Response(`echo ${key}`,{status});}),error=>error.status>=400&&!error.message.includes(key));assert.equal(calls,1);
 }
 await assert.rejects(generate(connection,input,async()=>{throw new DOMException('late','TimeoutError');}),error=>error.status===504&&error.message.includes('not retried'));
 await assert.rejects(generate(connection,input,async()=>Response.json({})),error=>error.status===502);
 await assert.rejects(generate(connection,input,async()=>Response.json(null)),error=>error.status===502);
 await assert.rejects(generate({...connection,apiKey:''},input,()=>assert.fail('No key')),error=>error.status===400);
 await assert.rejects(generate(connection,input,async()=>new Response('x'.repeat(2*1024*1024+1))),error=>error.status===502);
});
test('limits, empty/refusal output and truncation are handled explicitly',async()=>{
 for(const invalid of [{...input,maxTokens:99999},{...input,messages:[{role:'tool',content:'bad'}]},{...input,messages:[{role:'user',content:'x'.repeat(32001)}]},{...input,model:''}])assert.throws(()=>generationInput(invalid,{}));
 const connection={provider:'groq',apiKey:key};
 let result=await generate(connection,input,async()=>Response.json({choices:[{message:{content:null},finish_reason:'length'}]}));assert.match(result.warning,/no text/);
 result=await generate(connection,input,async()=>Response.json({choices:[{message:{content:key},finish_reason:'length'}]}));assert.equal(result.text,'[redacted]');assert.match(result.warning,/incomplete/);
});
