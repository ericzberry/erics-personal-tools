import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRestaurants} from '../src/restaurants.js';
import {searchInput,discoveryResult} from '../../chrome-sidebar/src/restaurant-search.js';
import {buildIntent} from '../../chrome-sidebar/src/restaurant-data.js';
import {chooseTaskModel,taskPolicy} from '../src/model-policy.js';
const connection={provider:'openai',apiKey:'synthetic-secret'};
const input={search:{query:'Example Bistro',city:'NYC',date:'2030-09-15',partySize:2}};
const evidence={url:'https://guide.michelin.com/us/en/example',title:'Guide',detail:'Two stars',published:'2030'};
const booking={url:'https://resy.com/cities/new-york-ny/venues/example'};
const output=()=>({status:'completed',output:[{type:'web_search_call',action:{sources:[evidence,booking]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Shortlist',restaurants:[{name:'Example Bistro',address:'100 Example Street',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',evidence:[evidence],booking:[booking]}]})}]}]});
function fetcher(response,inspect=()=>{},pages={}){return async(url,options)=>{if(url.endsWith('/models'))return Response.json({data:[{id:'gpt-4.1-mini'},{id:'gpt-5-mini'}]});if(pages[url])return pages[url]();inspect(url,options);return Response.json(response);};}
test('legacy restaurant research still forces real web search, sources, saved credentials and automated routing',async()=>{
  const result=await discoverRestaurants(connection,input,fetcher(output(),(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer synthetic-secret');
    const body=JSON.parse(options.body);assert.equal(body.store,false);assert.deepEqual(body.tools,[{type:'web_search'}]);assert.equal(body.tool_choice,'required');assert.deepEqual(body.include,['web_search_call.action.sources']);assert.match(body.instructions,/misspellings/);assert.match(body.instructions,/Do not claim reservation availability/);
  }));
  assert.equal(result.restaurants[0].booking[0].provider,'Resy');assert.equal(result.restaurants.length,1);assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
  assert.equal(result.candidates,undefined,'the legacy answer makes no v2 claims');
});
test('the normalized legacy search the app sends passes the Worker’s own validation',async()=>{
  const fixed=searchInput(input.search);
  const {partySize,...older}=fixed;
  assert.equal(partySize,2);
  for(const search of [fixed,older,searchInput({...input.search,flexible:true,minParty:2,maxParty:4}),searchInput({...input.search,flexibleDates:true,endDate:'2030-09-17'})]) {
    const result=await discoverRestaurants(connection,{search},fetcher(output()));
    assert.equal(result.restaurants.length,1);
  }
});
test('no sources, truncation, malformed JSON and unsupported providers fail explicitly',async()=>{
  const noSources=output();noSources.output=noSources.output.slice(1);
  for(const data of [noSources,{...output(),status:'incomplete'},{...output(),output:[output().output[0],{type:'message',content:[{type:'output_text',text:'not JSON'}]}]}])await assert.rejects(discoverRestaurants(connection,input,fetcher(data)),e=>e.status===502);
  await assert.rejects(discoverRestaurants({...connection,provider:'anthropic'},input,()=>assert.fail()),e=>e.status===400);
  await assert.rejects(discoverRestaurants(connection,{search:{...input.search,partySize:0}},()=>assert.fail()),e=>e.status===400);
});
const now=new Date('2030-09-15T03:00:00Z');
const intent=buildIntent({text:'exactly two Michelin stars',city:'NYC',date:'2030-09-20',people:2,time:'19:30'},{now});
const guide='https://guide.michelin.com/us/en/new-york-state/new-york/restaurant/example-bistro';
const v2=(candidates)=>({status:'completed',output:[{type:'web_search_call',action:{sources:[{url:guide},booking]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({clarification:'',locations:[],candidates})}]}]});
const candidate={name:'Example Bistro',address:'100 Example Street, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['French'],identity:'verified',reason:'Two stars in the 2030 guide.',
  claims:[{field:'michelin_stars',value:2,url:guide,title:'MICHELIN Guide',publisher:'Michelin',quote:'Example Bistro is awarded Two MICHELIN Stars in the 2030 MICHELIN Guide New York',edition:'2030',latest:true},{field:'price_per_person',value:145,basis:'all-in',url:guide,quote:'The set menu is priced at 145 dollars per person including service',publisher:'Michelin'}],
  booking:[{provider:'Resy',url:booking.url}]};
const html=body=>()=>new Response(`<html><head><title>Example Bistro – MICHELIN Guide</title><style>.x{}</style></head><body><script>var x=1</script><h1>Example Bistro</h1><p>${body}</p></body></html>`,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
test('a v2 intent is discovered with quoted claims, and each claim is supported only where its source says so (R01)',async()=>{
  let posted;
  const result=await discoverRestaurants({...connection,taskModels:{'restaurant.research':'gpt-5-mini'}},{intent},fetcher(v2([candidate]),(url,options)=>{posted=JSON.parse(options.body);},
    {[guide]:html('Example Bistro is awarded Two MICHELIN Stars in the 2030 MICHELIN Guide New York. Dinner is served from six.')}));
  assert.equal(posted.model,'gpt-5-mini','the legacy research choice carries over to discovery');
  assert.match(posted.instructions,/quote/);assert.match(posted.instructions,/Never infer stars/);
  const request=JSON.parse(posted.input[0].content);
  assert.deepEqual(request.wanted,['REQUIRED Exactly 2 Michelin stars','REQUIRED Not Lower East Side, East Village, Brooklyn, Queens (standing preference)','PREFERRED Upper West Side preferred'.replace(' preferred','')]);
  assert.equal(result.schemaVersion,2);assert.equal(result.candidates.length,1);
  const [stars,price]=result.candidates[0].claims;
  assert.equal(stars.status,'supported');assert.match(stars.excerpt,/two michelin stars in the 2030/);assert.equal(stars.extractor,'source-read');assert.ok(stars.expiresAt>stars.retrievedAt);
  assert.equal(price.status,'unknown');assert.match(price.reason,/not found on the source page/);
  assert.equal(result.verification.fetches,1);assert.equal(result.candidates[0].providers[0].provider,'Resy');
  assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
  assert.equal(result.routing.level,3,'an editorial requirement is read at the higher tier');
});
test('an unreachable or paywalled source leaves the claim unknown rather than trusted (R04), and bad intents are refused',async()=>{
  const result=await discoverRestaurants(connection,{intent},fetcher(v2([candidate]),()=>{},{[guide]:()=>new Response('',{status:403})}));
  assert.equal(result.candidates[0].claims[0].status,'unknown');assert.match(result.candidates[0].claims[0].reason,/not accessible/);
  const wrong=await discoverRestaurants(connection,{intent},fetcher(v2([candidate]),()=>{},{[guide]:html('Example Bistro is awarded Three MICHELIN Stars in the 2030 MICHELIN Guide New York')}));
  assert.equal(wrong.candidates[0].claims[0].status,'unknown','a passage that states a different figure does not support the claim');
  await assert.rejects(discoverRestaurants(connection,{intent:{...intent,schemaVersion:1}},()=>assert.fail()),e=>e.status===400);
  await assert.rejects(discoverRestaurants(connection,{intent:{...intent,requirements:[{kind:'shell',operator:'eq',value:'rm',origin:'query'}]}},()=>assert.fail()),e=>e.status===400);
  assert.equal(taskPolicy('restaurant.discovery',{intent:buildIntent({text:'Italian',city:'NYC'},{now})}).level,2);
});
