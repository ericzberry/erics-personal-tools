import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from '../../chrome-sidebar/node_modules/linkedom/esm/index.js';
import {mountRestaurants} from '../dist/app/restaurants.js';
import {restaurantHistory,LEGACY_RESTAURANT_CACHE} from '../dist/app/shared/restaurant-history.js';
import {venue,claim} from '../dist/app/shared/restaurant-data.js';
function memory(){
  const data=new Map(),key=(r,t)=>`${r}:${t}`;
  return {data,read:async(r,t)=>structuredClone(data.get(key(r,t))??null),write:async(r,t,v)=>{data.set(key(r,t),structuredClone(v));},remove:async(r,t)=>{data.delete(key(r,t));}};
}
test('mobile restaurant search posts the intent, keeps one handoff per provider, follows a date change without research, and restores offline',async()=>{
  const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
  globalThis.document=document;globalThis.window=window;
  const descriptor=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
    get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.getAttribute('value')??'';},
    set(value){for(const option of this.options)option.removeAttribute('selected');[...this.options].find(option=>option.getAttribute('value')===String(value))?.setAttribute('selected','');}});
  let network=true,fail=false,resolveResearch,calls=0;const clock={now:Date.parse('2030-09-15T03:00:00Z')},readings=[];
  const store=memory(),history=restaurantHistory({store,locks:null,now:()=>clock.now});
  const options={credentials:{get:async()=>'synthetic-token'},history,online:()=>network,loadConnections:async()=>[{id:'test',name:'Test connection',provider:'openai',hasApiKey:true}],request:async(token,path,options)=>{
    // The words are read first, on their own route and with their own short budget.
    if(path.endsWith('/restaurant-intent')){
      assert.equal(options.timeoutMs,40000);readings.push(options.value);
      return {reading:{mode:'discovery',name:'',request:options.value.text,city:'',date:'',endDate:'',people:null,maxPeople:null,time:'',window:null}};
    }
    calls++;assert.equal(options.timeoutMs,170000);assert.equal(options.value.intent.city.name,'New York City');assert.equal(options.value.intent.schemaVersion,2);
    if(fail)throw Error('Synthetic failure');return new Promise(resolve=>{resolveResearch=resolve;});
  }};
  const root=document.getElementById('app'),$=id=>root.querySelector(`#restaurant-${id}`),settle=async(n=12)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
  const submit=()=>$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  const type=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new window.Event('input'));};
  const place=venue({id:'a',name:'Example Bistro',address:'100 Example, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['Italian'],providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example'},{provider:'OpenTable',url:'https://www.opentable.com/r/example'}],
    claims:[claim({field:'michelin_stars',value:1,status:'supported',source:{url:'https://guide.michelin.com/x',title:'Guide'},excerpt:'one star',retrievedAt:'2030-09-14T00:00:00Z',expiresAt:'2030-09-30T00:00:00Z'})]});
  const research={schemaVersion:2,candidates:[place],clarification:'',locations:[],unverified:0,researchedAt:'2030-09-15T03:00:00Z'};
  try{
    const tool=mountRestaurants(root,options);await tool.open();
    type('text','Italian');type('date','2030-09-20');type('people','4');
    submit();await settle();assert.equal($('find').disabled,true);submit();assert.equal(calls,1);
    assert.deepEqual(readings.map(words=>[words.text,words.city,/^\d{4}-\d{2}-\d{2}$/.test(words.today),/^\d{2}:\d{2}$/.test(words.now)]),[['Italian','New York City',true,true]]);
    resolveResearch(research);await settle(20);
    const links=[...root.querySelectorAll('#restaurant-result-a a')].filter(a=>/Check on/.test(a.textContent));
    assert.deepEqual(links.map(a=>a.textContent),['Check on Resy','Check on OpenTable']);
    const url=new URL(links[0].href);assert.equal(url.searchParams.get('seats'),'4');assert.equal(url.searchParams.get('date'),'2030-09-20');
    assert.match(root.querySelector('#restaurant-result-a').textContent,/read from the source/);
    type('date','2030-09-21');await settle();
    assert.equal(new URL([...root.querySelectorAll('#restaurant-result-a a')].find(a=>/Check on Resy/.test(a.textContent)).href).searchParams.get('date'),'2030-09-21');
    assert.equal(calls,1);
    fail=true;type('text','failure');submit();await settle();assert.equal($('text').value,'failure');assert.match($('error').textContent,/Synthetic failure/);
    assert.equal((await history.latest('synthetic-token')).intent.text,'Italian');
    fail=false;type('text','sushi');submit();await settle();$('stop').click();resolveResearch({...research,candidates:[{...place,name:'Late'}]});await settle(20);
    assert.doesNotMatch(root.textContent,/Late/);
    network=false;
    const again=mountRestaurants(root,options);await again.open();
    assert.match($('connection-status').textContent,/Offline/);
    assert.match(root.querySelector('#restaurant-result-a').textContent,/Example Bistro/);
    assert.equal($('find').disabled,false,'the restored search can be re-ranked or re-dated with no signal');
    assert.equal($('people').value,'4');
    type('text','somewhere new');assert.equal($('find').disabled,true,'new words need the network');
    network=true;window.dispatchEvent(new window.Event('online'));await settle();assert.equal($('find').disabled,false);
  }finally{Object.defineProperty(window.HTMLSelectElement.prototype,'value',descriptor);delete globalThis.document;delete globalThis.window;}
});
test('the previous download survives as a dated search on the phone',async()=>{
  const store=memory(),history=restaurantHistory({store,locks:null});
  await store.write(LEGACY_RESTAURANT_CACHE,'t',{startedAt:1,downloadedAt:'2030-09-01T00:00:00Z',search:{mode:'category',query:'two stars',city:'NYC',date:'2030-09-10',endDate:'2030-09-10',minParty:2,maxParty:2,startTime:'17:00',endTime:'22:00'},research:{restaurants:[{name:'Example',address:'1 St',city:'New York City',booking:[],evidence:[]}]}});
  const latest=await history.latest('t');
  assert.equal(latest.legacy,true);assert.equal(latest.candidates[0].name,'Example');
  assert.equal(store.data.has(`${LEGACY_RESTAURANT_CACHE}:t`),false);
});
