import test from 'node:test';
import assert from 'node:assert/strict';
import {researchTrip} from '../src/trip-research.js';
import {normalizeTrip} from '../src/trip-data.js';
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
