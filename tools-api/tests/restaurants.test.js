import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRestaurants} from '../src/restaurants.js';
const connection={provider:'openai',apiKey:'synthetic-secret'};
const input={search:{query:'Example Bistro',city:'NYC',date:'2030-09-15',partySize:2}};
const evidence={url:'https://guide.michelin.com/us/en/example',title:'Guide',detail:'Two stars',published:'2030'};
const booking={url:'https://resy.com/cities/new-york-ny/venues/example'};
const output=()=>({status:'completed',output:[{type:'web_search_call',action:{sources:[evidence,booking]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Shortlist',restaurants:[{name:'Example Bistro',address:'100 Example Street',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',evidence:[evidence],booking:[booking]}]})}]}]});
function fetcher(response,inspect=()=>{}){return async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-4.1-mini'}]});inspect(url,options);return Response.json(response);};}
test('restaurant research forces real web search, sources, saved credentials and automated routing',async()=>{
  const result=await discoverRestaurants(connection,input,fetcher(output(),(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer synthetic-secret');
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.deepEqual(body.tools,[{type:'web_search'}]);assert.equal(body.tool_choice,'required');assert.deepEqual(body.include,['web_search_call.action.sources']);assert.match(body.instructions,/misspellings/);assert.match(body.instructions,/Do not claim reservation availability/);
  }));
  assert.equal(result.restaurants[0].booking[0].provider,'Resy');assert.equal(result.restaurants.length,1);assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
});
test('no sources, truncation, malformed JSON and unsupported providers fail explicitly',async()=>{
  const noSources=output();noSources.output=noSources.output.slice(1);
  for(const data of [noSources,{...output(),status:'incomplete'},{...output(),output:[output().output[0],{type:'message',content:[{type:'output_text',text:'not JSON'}]}]}])await assert.rejects(discoverRestaurants(connection,input,fetcher(data)),e=>e.status===502);
  await assert.rejects(discoverRestaurants({...connection,provider:'anthropic'},input,()=>assert.fail()),e=>e.status===400);
  await assert.rejects(discoverRestaurants(connection,{search:{...input.search,partySize:0}},()=>assert.fail()),e=>e.status===400);
});
