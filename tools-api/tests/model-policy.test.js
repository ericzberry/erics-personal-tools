import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_CATALOG,chooseTaskModel,taskCatalog,taskTimeout,TASK_POLICIES,TIMEOUT_FLOOR,TIMEOUT_CEILING} from '../src/model-policy.js';
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

// Which model runs an action is a setting, chosen once in Settings, and the
// app has no other place to choose one. An explicit choice is the owner's
// call: it outranks the automatic pick and the cost ceiling, and is refused
// only where the request physically cannot run on it.
test('an owner’s chosen model replaces the automatic one, and only capability refuses it',()=>{
 const pick=(task,chosen,input={},available=MODEL_CATALOG)=>chooseTaskModel({provider:'openai',available,task,input,chosen});
 assert.equal(pick('email.summary','').model.id,'gpt-5.6-terra','no choice leaves the automatic answer alone');
 assert.equal(pick('email.summary','gpt-5-nano').model.id,'gpt-5-nano','a pinned policy model is a default, not a lock');
 assert.equal(pick('finance.intake','gpt-4o-mini').model.id,'gpt-4o-mini','a choice outranks the capability floor');
 assert.equal(pick('cards.research','gpt-5.6-terra').model.id,'gpt-5.6-terra','and the cost ceiling');
 // What the request needs of a model is not the owner's to waive.
 assert.throws(()=>pick('cards.research','gpt-5-nano'),e=>/search the web/.test(e.message));
 assert.throws(()=>pick('finance.intake','gpt-5-nano',{messages:[{content:[{type:'image'}]}]}),e=>/read an image/.test(e.message));
 assert.throws(()=>pick('email.summary','gpt-5-nano',{},[{id:'gpt-5.6-terra'}]),e=>/cannot reach/.test(e.message));
 assert.throws(()=>pick('email.summary','not-a-model'),e=>/not a reviewed model/.test(e.message));
});

test('every AI action is listed for settings, with the models that could run it',()=>{
 const tasks=taskCatalog({'finance.intake':'gpt-5-mini'});
 assert.ok(tasks.length>10,'every registered action is offered, not a chosen few');
 const finance=tasks.find(entry=>entry.task==='finance.intake');
 assert.equal(finance.label,'Finance reading');
 assert.equal(finance.chosen,'gpt-5-mini');
 // A searching action only offers models that can search.
 assert.deepEqual(tasks.find(e=>e.task==='cards.research').options.filter(o=>!MODEL_CATALOG.find(m=>m.id===o.id).web),[]);
 assert.equal(tasks.find(e=>e.task==='email.summary').automatic,'gpt-5.6-terra');
});

// A flat time budget belonged to a flat output budget. Once a reading was
// allowed the twenty-eight accounts a wealth manager prints on one page, the
// answer took longer to produce than the request was allowed to wait, and the
// press came back "The provider took longer than 25 seconds" with the page
// read, the figures found and the provider still billing for the abandoned
// answer. The time a task may take now follows the size of the answer it asked
// for, which is what the time is spent producing.
test('a task waits in proportion to the answer it asked for',()=>{
  const available=MODEL_CATALOG.map(model=>({id:model.id}));
  const route=task=>chooseTaskModel({provider:'openai',available,task,input:{messages:[{role:'user',content:'x'}]}});

  const reading=route('finance.intake');
  assert.equal(reading.timeoutMs,taskTimeout(reading.maxTokens));
  assert.ok(reading.timeoutMs>=90000,`a page of accounts gets room to answer, not ${reading.timeoutMs}ms`);
  // And stays inside what the device itself waits for, so the worker gives up
  // first and can say why rather than the press dying on the other side.
  assert.ok(reading.timeoutMs<=TIMEOUT_CEILING&&TIMEOUT_CEILING<130000,'the device allows 130s; the budget stays under it');

  // No task waits less than every task used to.
  for(const task of Object.keys(TASK_POLICIES).filter(name=>!TASK_POLICIES[name].web))
    assert.ok(route(task).timeoutMs>=TIMEOUT_FLOOR,`${task} keeps at least the standing budget`);
  assert.equal(route('capture.note').timeoutMs,TIMEOUT_FLOOR,'a short answer keeps the short leash');

  // Whole seconds, because the refusal prints the budget.
  for(const tokens of [500,2500,7512,40000])assert.equal(taskTimeout(tokens)%1000,0,`${tokens} rounds to whole seconds`);
  assert.equal(taskTimeout(1e6),TIMEOUT_CEILING,'and it is capped');
});

// Reading figures off a page the reader has already narrowed to figures is not
// work that needs a model to think first. Level 3 selected a reasoning model,
// which thinks and then still has twenty-eight accounts to write out, and the
// press sat for the better part of two minutes.
test('the finance reading takes the fast model, and an image still finds one that can see',()=>{
  const available=MODEL_CATALOG.map(model=>({id:model.id}));
  const page={messages:[{role:'system',content:'y'.repeat(8784)},{role:'user',content:'x'.repeat(2715)}]};
  const chosen=chooseTaskModel({provider:'openai',available,task:'finance.intake',input:page});
  assert.equal(chosen.model.reasoning??false,false,'no model that thinks before it writes');
  assert.ok(chosen.estimatedCost<=TASK_POLICIES['finance.intake'].maxCost);
  // A photographed statement goes down the same route and must still reach a
  // model this application will send a picture to.
  const photo={messages:[{role:'user',content:[{type:'image'},{type:'text',text:'x'}]}]};
  assert.equal(MODEL_CATALOG.find(m=>m.id===chooseTaskModel({provider:'openai',available,task:'finance.intake',input:photo}).model.id).vision,true);
  // And the owner's own pick still outranks the floor, which is what makes a
  // wrong reading a setting rather than a deploy.
  assert.equal(chooseTaskModel({provider:'openai',available,task:'finance.intake',input:page,chosen:'gpt-5-mini'}).model.id,'gpt-5-mini');
});
