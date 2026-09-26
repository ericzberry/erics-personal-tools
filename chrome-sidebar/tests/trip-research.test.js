import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTrip} from '../src/trip-research.js';
import {normalizeTrip,tripKey} from '../src/trip-data.js';
const trip={...normalizeTrip({title:'Family stay',request:'Two real bedrooms; no sofa beds.',start:'2026-10-16',end:'2026-10-17',party:{adults:2,childrenAges:[7,9],rooms:1},criteria:[{id:'beds',label:'Two real bedrooms',required:true}]}),id:'11111111-1111-4111-8111-111111111111',revision:'first'};
const channel={id:'direct',label:'Direct',url:'https://example.com/rooms'};
test('browser research checkpoints revisions and cannot turn unsupported text into a match',async()=>{
  let revision='first',calls=0;const saved=[];
  const browser={open:async()=>1,read:async()=>({url:channel.url,text:'One king bed and a sofa bed.',controls:[]}),act:()=>assert.fail('No action expected')};
  const result=await researchTrip({trip,channel,browser,generate:async()=>JSON.stringify(++calls===1?{type:'done'}:{summary:'Check beds',candidates:[{id:'x',name:'Room',url:channel.url,checks:[{id:'beds',status:'match',detail:'Two bedrooms',source:channel.url,quote:'Two real bedrooms'}]}]}),save:async value=>{assert.equal(value.revision,revision);revision=`r${saved.length}`;const record={...value,revision};saved.push(record);return record;}});
  assert.equal(result.candidates[0].checks[0].status,'unknown');assert.equal(result.channels[0].status,'partial');assert.equal(saved.length,3);
});
test('sign-in pauses without sending the page to AI; aborted searches preserve a resume URL',async()=>{
  let calls=0;const save=async value=>({...value,revision:'next'});
  const result=await researchTrip({trip,channel,browser:{open:async()=>1,read:async()=>({url:channel.url,attention:'Unlock Apple Passwords.'})},generate:async()=>{calls++;},save});
  assert.equal(calls,0);assert.equal(result.channels[0].status,'login');assert.equal(result.channels[0].nextStep,'Unlock Apple Passwords.');
  const abort=new AbortController();abort.abort();
  const stopped=await researchTrip({trip,channel,browser:{open:async()=>1},generate:async()=>{},save,signal:abort.signal});
  assert.equal(stopped.channels[0].status,'blocked');assert.equal(stopped.channels[0].resumeURL,channel.url);
});
test('missing travel details are read before opening a tab, and unresolved questions stop the run',async()=>{
  const value={...trip,start:'',party:null};let opened=false;
  const result=await researchTrip({trip:value,channel,browser:{open:async()=>{opened=true;}},generate:async()=>JSON.stringify({questions:['Which arrival date?']}),save:async value=>({...value,revision:'saved'})});
  assert.equal(opened,false);assert.deepEqual(result.questions,['Which arrival date?']);
});
test('current parsed scope survives sign-in and stale checkpoints from other sources',async()=>{
  let calls=0;
  const value={...trip,intentKey:tripKey(trip),researchKey:'older search',channels:[{id:'other',label:'Other',contextKey:'older search',status:'partial'}]};
  const result=await researchTrip({trip:value,channel,browser:{open:async()=>1,read:async()=>({url:channel.url,attention:'Sign in'})},generate:async()=>{calls++;throw Error('Must not reparse the same scope');},save:async v=>v});
  assert.equal(calls,0);assert.equal(result.channels.at(-1).status,'login');assert.deepEqual(result.criteria,trip.criteria);
});
test('an interrupted newly parsed request does not reparse on another source',async()=>{
  let calls=0;const browser={open:async()=>1,read:async()=>({url:channel.url,attention:'Sign in'})};
  const value={...trip,request:'Now outside the city',researchKey:tripKey(trip)};
  const result=await researchTrip({trip:value,channel,browser,generate:async()=>{calls++;return JSON.stringify({start:trip.start,end:trip.end,party:trip.party,criteria:trip.criteria,questions:[]});},save:async v=>v});
  assert.equal(calls,1);assert.equal(result.intentKey,tripKey(result));assert.notEqual(result.researchKey,result.intentKey);
  await researchTrip({trip:result,channel:{...channel,id:'another'},browser,generate:async()=>assert.fail('Must use parsed criteria'),save:async v=>v});
});
test('rewards capture runs only on unlocked observations and failures remain visible without losing hotel work',async()=>{
  let calls=0,model=0;
  const args={trip,channel,browser:{open:async()=>1,read:async()=>({url:channel.url,text:'Hotel room description',controls:[]})},generate:async()=>JSON.stringify(++model===1?{type:'done'}:{summary:'Saved room evidence',candidates:[]}),save:async v=>v,onObservation:async()=>{calls++;throw Error('Read offers again in Rewards.');}};
  const result=await researchTrip(args);assert.equal(calls,1);assert.equal(result.summary,'Saved room evidence');assert.match(result.channels[0].note,/Rewards not saved/);assert.equal(result.channels[0].status,'partial');
  await researchTrip({...args,browser:{open:async()=>1,read:async()=>({url:channel.url,attention:'Sign in'})}});assert.equal(calls,1);
});

test('all-source research continues after sign-in and saves each source without claiming completion',async()=>{
 const {researchAll}=await import('../src/trip-research.js');let opens=0,revision=0;
 const result=await researchAll({trip,browser:{open:async()=>++opens,read:async()=>({url:'https://example.com/',attention:'Sign in required'})},generate:async()=>assert.fail('Locked page must not reach AI'),save:async value=>({...value,revision:String(++revision)})});
 assert.equal(opens,12);assert.equal(result.channels.length,12);assert.ok(result.channels.every(c=>c.status==='login'));assert.match(result.summary,/12 sources attempted/);
});
test('observed prices require exact occupancy and quotes for product, total and fees',async()=>{
 const {observedCandidates}=await import('../src/trip-research.js');
 const at=new Date().toISOString(),source='https://example.com/rooms';
 const quotes={product:'Two bedroom suite',availability:'Available for these dates',total:'Total $900.00',allIn:'Includes all taxes and fees',terms:'Refundable until October 14 at 6 PM ET; pay at hotel'};
 const scope={start:trip.start,end:trip.end,party:trip.party,quotes:['October 16–17, 2026','2 adults, children 7 and 9, 1 suite']};
 const page={url:source,at,text:[...Object.values(quotes),...scope.quotes].join('\n')};
 const data={candidates:[{name:'Suite',checks:[],offers:[{source,product:quotes.product,total:900,currency:'USD',allIn:true,terms:quotes.terms,availability:'available',scope,quotes}]}]};
 const extract=()=>observedCandidates(data,trip,channel,[page])[0].offers[0];
 assert.equal(extract().total,900);assert.equal(extract().allIn,true);assert.equal(extract().availability,'available');
 data.candidates[0].offers[0].scope={...scope,party:{...trip.party,childrenAges:[]}};
 assert.equal(extract().total,null);assert.equal(extract().availability,'unknown');
 data.candidates[0].offers[0].scope=scope;data.candidates[0].offers[0].total=90;
 assert.equal(extract().total,null);
 data.candidates[0].offers[0].quotes={...quotes,allIn:'Invented inclusion'};
 assert.equal(extract().allIn,false);
});
test('stopping all-source research never starts the next provider',async()=>{
 const {researchAll}=await import('../src/trip-research.js');const controller=new AbortController();let opens=0;
 await researchAll({trip,signal:controller.signal,browser:{open:async()=>{opens++;controller.abort();return 1;}},generate:async()=>'',save:async value=>value});
 assert.equal(opens,1);
});
test('provider result tabs replace only the tab opened by this research',async()=>{
 const {travelBrowser}=await import('../src/trip-browser.js');let removed=[],created=0;
 const control={index:0,label:'Search',tag:'button'};
 const tabs=new Map([[1,{id:1,url:'https://example.com/search',status:'complete'}]]);
 const api={tabs:{create:async()=>{created++;return tabs.get(1);},get:async id=>tabs.get(id),update:async(id,change)=>{tabs.set(id,{...tabs.get(id),...change});return tabs.get(id);},query:async()=>[...tabs.values()],remove:async id=>{removed.push(id);tabs.delete(id);}},scripting:{executeScript:async()=>{tabs.set(2,{id:2,openerTabId:1,url:'https://example.com/results',status:'complete'});return [];}}};
 const browser=travelBrowser(api),first=await browser.open('https://example.com/search');
 const next=await browser.act(first,{url:'https://example.com/search',controls:[control]},{type:'click',index:0});
 assert.equal(next,2);assert.deepEqual(removed,[1]);await browser.release(next);assert.equal(await browser.open('https://example.com/another'),2);assert.equal(created,1);
});

test('a same-site URL change discards stale controls and reobserves before acting',async()=>{
 const {travelBrowser}=await import('../src/trip-browser.js');let injected=0;
 const api={tabs:{create:async()=>({id:1}),get:async()=>({url:'https://example.com/rooms?loaded=1',status:'complete'})},scripting:{executeScript:async()=>{injected++;}}};
 const browser=travelBrowser(api);await browser.open(channel.url);
 await assert.rejects(browser.act(1,{url:channel.url,controls:[{index:0}]},{type:'click',index:0}),e=>e.code==='TRAVEL_PAGE_CHANGED');
 assert.equal(injected,0);
 let reads=0,models=0,acts=0;
 const result=await researchTrip({trip,channel,browser:{open:async()=>1,read:async()=>{reads++;return {url:channel.url,text:'Observed rooms',controls:[{index:0,label:'Search'}]};},act:async()=>{acts++;throw Object.assign(Error('Page changed'),{code:'TRAVEL_PAGE_CHANGED'});}},generate:async()=>JSON.stringify(++models===1?{type:'click',index:0}:models===2?{type:'done',note:'Fresh page inspected'}:{summary:'Observed fresh page',candidates:[]}),save:async v=>v});
 assert.equal(reads,2);assert.equal(acts,1);assert.equal(result.channels[0].status,'partial');
});

test('invalid model JSON or control indexes get one repair before any browser action',async()=>{
 for(const invalid of ['{"type":"click","index":0}\n{"type":"click","index":1}',JSON.stringify({type:'click',index:999})]){
  let calls=0,acted=0;
  const result=await researchTrip({trip,channel,browser:{open:async()=>1,read:async()=>({url:channel.url,text:'Rooms observed',controls:[{index:0,label:'Search'}]}),act:async()=>{acted++;}},generate:async messages=>{calls++;if(calls===1)return invalid;if(calls===2){assert.match(messages.at(-1).content,/previous response was invalid/);return JSON.stringify({type:'done'});}return JSON.stringify({summary:'Observed rooms',candidates:[]});},save:async v=>v});
  assert.equal(acted,0);assert.equal(calls,3);assert.equal(result.channels[0].status,'partial');
 }
 let calls=0;
 const result=await researchTrip({trip,channel,browser:{open:async()=>1,read:async()=>({url:channel.url,text:'Rooms',controls:[]})},generate:async()=>{calls++;return 'not JSON';},save:async v=>v});
 assert.equal(calls,2);assert.equal(result.channels[0].status,'blocked');assert.match(result.channels[0].note,/invalid response twice/);
});
