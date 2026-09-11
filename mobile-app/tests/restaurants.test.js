import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {restaurantCache,RESTAURANT_CACHE} from '../public/app/restaurant-cache.js';
import {mountRestaurants} from '../dist/app/restaurants.js';

test('download cache survives restart, retains newer research, and clears on disconnect without late writes',async()=>{
  const data=new Map(),credentials={get:async()=>'synthetic-token'};
  const store={read:async key=>structuredClone(data.get(key)),write:async(key,token,value)=>data.set(key,structuredClone(value)),remove:async key=>data.delete(key)};
  const options={store,credentials,locks:null},cache=restaurantCache(options);
  await cache.write({startedAt:20,research:{restaurants:['newer']}});
  assert.deepEqual((await restaurantCache(options).read()).research.restaurants,['newer']);
  assert.equal(await cache.write({startedAt:10,research:{restaurants:['older']}}),false);
  assert.deepEqual((await cache.read()).research.restaurants,['newer']);
  await cache.disconnect();assert.equal(data.has(RESTAURANT_CACHE),false);
  await assert.rejects(cache.write({startedAt:30}),/disconnected/);
  assert.equal(await restaurantCache(options).read(),undefined);
});

test('mobile restaurant search preserves failures, ignores canceled replies, restores offline evidence and provider filters',async()=>{
  const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:descriptor.get,set(value){for(const option of this.options)option.selected=option.value===String(value);}});
  let saved=null,network=true,fail=false,resolveResearch,calls=0;
  const cache={read:async()=>structuredClone(saved),write:async value=>{saved=structuredClone(value);return true;}};
  const options={credentials:{get:async()=>'test'},cache,online:()=>network,loadConnections:async()=>[{id:'test',name:'Test connection',provider:'openai',hasApiKey:true}],request:async(token,path,options)=>{
    calls++;assert.equal(options.timeoutMs,150000);assert.equal(options.value.search.city,'New York City');
    if(fail)throw Error('Synthetic failure');return new Promise(resolve=>{resolveResearch=resolve;});
  }};
  const root=document.getElementById('app'),$=id=>root.querySelector(`#restaurant-${id}`),settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
  const submit=()=>$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  const research={summary:'Verified shortlist',clarification:'Check the address',restaurants:[{id:'1',name:'Example Bistro',address:'100 Example',city:'New York City',neighborhood:'UWS',borough:'Manhattan',travel:'included',booking:[{url:'https://resy.com/cities/new-york-ny/venues/example',provider:'Resy'}],evidence:[{url:'https://example.com/review',title:'Source',detail:'Verified rating',published:'2026'}]}]};
  try{
    await mountRestaurants(root,options).open();$('connection').value='test';$('query').value='Example';$('party').value='4';
    submit();await settle();assert.equal($('find').disabled,true);submit();assert.equal(calls,1);
    resolveResearch(research);await settle();assert.ok(saved);assert.match($('candidates').textContent,/17:00–22:00 local time/);
    const url=new URL(root.querySelector('.booking-links a').href);assert.equal(url.searchParams.get('seats'),'4');assert.equal(url.searchParams.get('date'),saved.search.date);
    // A run of dates gives every date its own verified booking link.
    $('flex-dates').checked=true;$('flex-dates').dispatchEvent(new window.Event('input'));
    assert.equal($('through-field').hidden,false);
    const through=new Date(Date.parse(`${saved.search.date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
    $('through').value=through;submit();await settle();resolveResearch(research);await settle();
    const dates=[...root.querySelectorAll('.booking-links a')].map(a=>new URL(a.href).searchParams.get('date'));
    assert.deepEqual([...new Set(dates)],[saved.search.date,through]);
    $('flex-dates').checked=false;$('flex-dates').dispatchEvent(new window.Event('input'));
    submit();await settle();resolveResearch(research);await settle();
    fail=true;$('query').value='failure';submit();await settle();assert.equal($('query').value,'failure');assert.match($('error').textContent,/Synthetic failure/);assert.equal(saved.search.query,'Example');
    fail=false;submit();await settle();$('stop').click();resolveResearch({...research,summary:'Canceled result'});await settle();assert.equal(saved.research.summary,'Verified shortlist');
    network=false;await mountRestaurants(root,options).open();assert.match($('summary').textContent,/Offline/);assert.match($('candidates').textContent,/Verified rating/);assert.equal($('find').disabled,true);assert.equal($('search-panel').open,false);
    assert.equal($('party').value,'4');
    network=true;window.dispatchEvent(new window.Event('online'));await settle();assert.equal($('find').disabled,false);
  }finally{Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);delete globalThis.document;delete globalThis.window;}
});
