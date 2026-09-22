import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountRestaurants} from '../src/restaurants.js';
import {restaurantHistory} from '../src/restaurant-history.js';
import {venue,claim} from '../src/restaurant-data.js';
function memory(){
  const data=new Map(),key=(r,t)=>`${r}:${t}`;
  return {data,read:async(r,t)=>structuredClone(data.get(key(r,t))??null),write:async(r,t,v)=>{data.set(key(r,t),structuredClone(v));},remove:async(r,t)=>{data.delete(key(r,t));}};
}
const supported=(field,value)=>claim({field,value,status:'supported',source:{url:'https://example.com/'+field,title:field},retrievedAt:'2030-09-14T12:00:00Z',expiresAt:'2030-09-30T00:00:00Z'});
const place=(id,name,extra={})=>venue({id,name,address:`${name} St, New York, NY`,city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['Italian'],providers:[{provider:'Resy',url:`https://resy.com/cities/new-york-ny/venues/${id}`}],claims:[supported('atmosphere',['quiet'])],...extra});
const candidates=['a','b','c','d'].map((id,i)=>place(id,`Place ${id.toUpperCase()}`,i===3?{claims:[]}:{}));
function harness({research=null,browser=true,host='chrome',store=memory(),clock={now:Date.parse('2030-09-15T03:00:00Z')}}={}){
  const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.document=document;
  const value=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:value.get,set(v){for(const o of this.options)o.selected=o.value===String(v);}});
  const calls={research:[],opened:[],tabs:[],generate:0};
  let resolveResearch,rejectResearch;
  const opened=new Map();let counter=0;
  const fakeBrowser=browser?{
    async open(job){calls.opened.push(job.id);const id=++counter;opened.set(id,job);
      const controls=[{tag:'select',label:'Guests',text:`${job.partySize} Guests`,value:String(job.partySize),region:'reservation'},{tag:'button',label:'Date',text:job.date,selected:true,region:'reservation'}];
      if(job.venueId!=='b')controls.push({tag:'button',text:'7:15 PM · Dining Room',region:'reservation'},{tag:'button',text:'7:15 PM · Bar',region:'reservation'});
      return {tabId:id,url:job.searchURL,snapshot:{url:job.searchURL,heading:job.venueName,title:job.venueName,text:job.venueId==='b'?`Sorry, we don't currently have any tables available for ${job.partySize}.`:'Reserve a table at this restaurant tonight.',controls,loading:false,capturedAt:new Date(clock.now).toISOString()}};},
    async read(tabId,url){return this.open(opened.get(tabId)||{venueId:'a',venueName:'Place A',partySize:2,date:'2030-09-20',searchURL:url}).then(o=>o.snapshot);},
    async focus(){},async close(id){opened.delete(id);},async closeAll(){},owns:id=>opened.has(id)
  }:null;
  const history=restaurantHistory({store,locks:null,now:()=>clock.now});
  const tool=mountRestaurants(document.getElementById('app'),{host,credentials:{get:async()=>'synthetic-token'},
    research:research||(intent=>{calls.research.push(intent);return new Promise((resolve,reject)=>{resolveResearch=resolve;rejectResearch=reject;});}),
    browser:fakeBrowser,openTab:async url=>{calls.tabs.push(url);return 100+calls.tabs.length;},generate:async()=>{calls.generate++;return JSON.stringify({status:'unsupported',detail:'x'});},history,now:()=>clock.now,connectionNote:async()=>''});
  const $=id=>document.getElementById(`restaurant-${id}`);
  const settle=async(n=12)=>{for(let i=0;i<n;i++)await new Promise(r=>setImmediate(r));};
  const submit=()=>$('form').dispatchEvent(new window.Event('submit',{cancelable:true}));
  const type=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new window.Event('input'));};
  const restore=()=>{Object.defineProperty(window.HTMLSelectElement.prototype,'value',value);};
  return {document,window,$,settle,submit,type,tool,calls,store,history,clock,resolve:v=>resolveResearch(v),reject:e=>rejectResearch(e),restore};
}
const reply=(list=candidates)=>({schemaVersion:2,candidates:list,clarification:'',locations:[],unverified:0,researchedAt:'2030-09-15T03:00:00Z'});
test('a dated discovery researches once, ranks, checks the first three eligible, and a date-only edit rechecks with no research (R09)',async()=>{
  const h=harness();
  try{
    await h.tool.open();
    h.type('text','quiet Italian');h.type('date','2030-09-20');h.type('people','2');
    assert.equal(h.$('find').textContent,'Find a table');
    h.submit();await h.settle();
    assert.equal(h.calls.research.length,1);assert.equal(h.calls.research[0].outing.preferredDate,'2030-09-20');assert.equal(h.$('find').disabled,true);
    h.resolve(reply());await h.settle(40);
    assert.equal(h.$('results').hidden,false);assert.equal(h.$('summary').hidden,false);
    assert.match(h.$('summary-chips').textContent,/Quiet/);
    assert.deepEqual([...new Set(h.calls.opened.map(id=>id.split('|')[0]))].sort(),['a','b','c'],'the first three eligible restaurants are checked, the fourth waits');
    const groups=[...h.document.querySelectorAll('.result-groups .record-group-title')].map(e=>e.textContent);
    assert.deepEqual(groups,['Times found','Still checking / Check on provider','No matching times observed']);
    assert.match(h.document.querySelector('#restaurant-result-a').textContent,/Open 7:15 pm search · Dining Room/);
    assert.match(h.document.querySelector('#restaurant-result-a').textContent,/Open 7:15 pm search · Bar/);
    assert.match(h.document.querySelector('#restaurant-result-b').textContent,/tables available for 2/);
    assert.equal(h.$('more').hidden,false);assert.match(h.$('more').textContent,/1 remaining/);
    assert.equal(h.$('form').classList.contains('is-collapsed'),true);
    // The outing changes: the same restaurants, checked again for the new date, and no new research.
    const before=h.calls.opened.length;
    h.type('date','2030-09-21');
    assert.equal(h.$('find').textContent,'Check availability');
    h.submit();await h.settle(40);
    assert.equal(h.calls.research.length,1);
    assert.ok(h.calls.opened.length>before);assert.ok(h.calls.opened.slice(before).every(id=>id.includes('2030-09-21')));
    const saved=(await h.history.latest('synthetic-token'));
    assert.equal(saved.intent.revision,2);assert.ok(saved.observations.every(o=>o.queryRevision===2||o.date==='2030-09-20'));
    // A preference edit reranks and visits nothing.
    const visited=h.calls.opened.length;
    h.$('edit').click();h.type('neighborhood','Midtown');h.submit();await h.settle(20);
    assert.equal(h.calls.research.length,1);assert.equal(h.calls.opened.length,visited);
    assert.match(h.$('summary-chips').textContent,/Midtown preferred/);
    // New words are a new search.
    h.type('text','sushi');h.submit();await h.settle();
    assert.equal(h.calls.research.length,2);
  }finally{h.restore();}
});
test('a late reply lands in history and never over the visible search (R10); stop keeps what was found (R11)',async()=>{
  const h=harness();
  try{
    await h.tool.open();
    h.type('text','quiet Italian');h.submit();await h.settle();
    h.$('stop').click();
    assert.match(h.$('status').textContent,/Stopped/);assert.equal(h.$('find').disabled,false);
    h.resolve(reply());await h.settle(20);
    assert.equal(h.$('results').hidden,true);
    assert.equal((await h.history.read('synthetic-token')).searches.length,0,'a search stopped before it was saved does not appear on reopening');
    h.type('text','Italian');h.submit();await h.settle();h.resolve(reply([candidates[0]]));await h.settle(20);
    assert.match(h.document.querySelector('#restaurant-result-a').textContent,/Place A/);
    assert.equal(h.$('text').value,'Italian');
  }finally{h.restore();}
});
test('reopening restores the last search and its observations and starts nothing',async()=>{
  const store=memory();const clock={now:Date.parse('2030-09-15T03:00:00Z')};
  const first=harness({store,clock});
  try{
    await first.tool.open();first.type('text','quiet Italian');first.type('date','2030-09-20');first.submit();await first.settle();first.resolve(reply());await first.settle(40);
  }finally{first.restore();}
  clock.now+=10*60000;
  const again=harness({store,clock});
  try{
    await again.tool.open();
    assert.equal(again.calls.research.length,0);assert.equal(again.calls.opened.length,0);
    assert.equal(again.$('text').value,'quiet Italian');assert.equal(again.$('date').value,'2030-09-20');
    assert.deepEqual([...again.document.querySelectorAll('.result-groups .record-group-title')].map(e=>e.textContent),['Still checking / Check on provider','Previously observed — recheck','No matching times observed']);
    assert.equal(again.$('status').hidden,true);
  }finally{again.restore();}
});
test('a named search with several locations asks which before any page is opened (R05), and a failure keeps the words',async()=>{
  const h=harness();
  try{
    await h.tool.open();
    h.type('text','Chez Example');h.type('date','2030-09-20');h.submit();await h.settle();
    assert.equal(h.calls.research[0].mode,'named');
    h.resolve({...reply(candidates.slice(0,2)),locations:[{name:'Place A',address:'A St'},{name:'Place B',address:'B St'}]});await h.settle(20);
    assert.equal(h.$('choice').hidden,false);assert.equal(h.calls.opened.length,0);
    assert.equal(h.document.querySelectorAll('.choice-option').length,2);
    h.document.querySelectorAll('.choice-option')[1].click();await h.settle(30);
    assert.equal(h.$('choice').hidden,true);
    assert.deepEqual([...new Set(h.calls.opened.map(id=>id.split('|')[0]))],['b']);
    h.type('text','Nowhere');h.submit();await h.settle();h.reject(Error('Research failed'));await h.settle();
    assert.equal(h.$('text').value,'Nowhere');assert.match(h.$('error').textContent,/Research failed/);assert.equal(h.$('find').disabled,false);
    h.$('mode-switch');
  }finally{h.restore();}
});
test('without a browser each result is one handoff per provider, rebuilt as the date changes (R20)',async()=>{
  const h=harness({browser:false,host:'mobile'});
  try{
    await h.tool.open();
    h.type('text','quiet Italian');h.type('date','2030-09-20');h.type('people','2');h.$('flex-dates').checked=true;h.type('through','2030-09-26');h.$('flex-party').checked=true;h.type('max','5');
    h.submit();await h.settle();h.resolve(reply());await h.settle(20);
    const links=[...h.document.querySelectorAll('#restaurant-result-a a')].filter(a=>/Check on/.test(a.textContent));
    assert.equal(links.length,1,'seven dates and four sizes are one link, not a matrix');
    const url=new URL(links[0].href);assert.equal(url.searchParams.get('date'),'2030-09-20');assert.equal(url.searchParams.get('seats'),'2');
    h.type('date','2030-09-22');h.type('people','3');await h.settle();
    const next=new URL([...h.document.querySelectorAll('#restaurant-result-a a')].find(a=>/Check on/.test(a.textContent)).href);
    assert.equal(next.searchParams.get('date'),'2030-09-22');assert.equal(next.searchParams.get('seats'),'3');
    assert.equal(h.calls.research.length,1);
    assert.equal(h.document.querySelector('.slot-action'),null);
  }finally{h.restore();}
});
