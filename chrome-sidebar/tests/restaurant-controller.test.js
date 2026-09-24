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
function harness({research=null,read=null,browser=true,host='chrome',store=memory(),clock={now:Date.parse('2030-09-15T03:00:00Z')}}={}){
  const {document,window}=parseHTML('<html><body><div id="app"></div></body></html>');
  globalThis.document=document;
  const value=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
  // linkedom's option.selected setter clears the chosen option whenever a
  // sibling is set false, so the value is kept in the attribute instead.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
    get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.getAttribute('value')??'';},
    set(v){for(const option of this.options)option.removeAttribute('selected');[...this.options].find(option=>option.getAttribute('value')===String(v))?.setAttribute('selected','');}});
  const calls={research:[],opened:[],tabs:[],generate:0,read:[]};
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
  const tool=mountRestaurants(document.getElementById('app'),{host,credentials:{get:async()=>'synthetic-token'},read:read?async words=>{calls.read.push(words);return read(words);}:null,
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

// The owner's own sentence (§3.2): one box of words, read into the controls,
// with what was understood on screen before the research comes back.
const sentence=day=>`sushi restaurant for 3 in the LES that's available within 15 minutes of 12:15 this ${day}`;
const lesSushi=(overrides={})=>place('s1','Synthetic Sushi Counter',{neighborhood:'Lower East Side',cuisine:['Sushi'],...overrides});
function reader(){
  const said={Saturday:'2030-09-21',Sunday:'2030-09-22'};
  return words=>{
    if(/fail/.test(words.text))throw Error('The reading timed out.');
    const day=Object.keys(said).find(name=>words.text.includes(name));
    const people=Number(/for (\d+)/.exec(words.text)?.[1])||null;
    return {mode:'discovery',name:'',request:'sushi restaurant in the LES',city:'',date:day?said[day]:'',endDate:'',people,maxPeople:null,time:'12:15',window:15};
  };
}
test('the words fill the date, party, time and window, and what was understood shows before the research returns',async()=>{
  const h=harness({read:reader()});
  try{
    await h.tool.open();
    assert.equal(h.$('text').tagName,'TEXTAREA');assert.equal(h.$('details').hasAttribute('open'),false,'the fields stay behind Details');
    h.type('text',sentence('Saturday'));
    h.$('text').dispatchEvent(Object.assign(new h.window.Event('keydown',{bubbles:true,cancelable:true}),{key:'Enter'}));
    await h.settle();
    assert.equal(h.calls.read.length,1);
    assert.deepEqual(h.calls.read[0],{text:sentence('Saturday'),city:'New York City',today:'2030-09-14',now:'23:00'},'today and the time are the city’s own');
    assert.equal(h.$('date').value,'2030-09-21');assert.equal(h.$('people').value,'3');assert.equal(h.$('time').value,'12:15');assert.equal(h.$('window').value,'15');
    assert.equal(h.calls.research.length,1);
    const intent=h.calls.research[0];
    assert.equal(intent.text,sentence('Saturday'));assert.equal(intent.request,'sushi restaurant in the LES');
    assert.deepEqual([intent.outing.startTime,intent.outing.endTime,intent.outing.preferredParty],['12:00','12:30',3]);
    assert.ok(intent.requirements.some(item=>item.kind==='cuisine'&&item.value==='sushi'));
    // Research is still running, and the summary is already the new request's.
    assert.equal(h.$('summary').hidden,false);assert.equal(h.$('results').hidden,true);
    assert.match(h.$('summary-chips').textContent,/Sushi.*Lower East Side.*Sat, Sep 21 · 3 people · 12:00 pm–12:30 pm/);
    assert.match(h.$('summary-notes').textContent,/Lower East Side asked for/);
    assert.equal(h.$('edit').hidden,true,'Stop comes first while it works');assert.equal(h.$('stop').hidden,false);
    h.resolve(reply([lesSushi()]));await h.settle(40);
    assert.equal(h.$('results').hidden,false);
    assert.ok(h.calls.opened.length>0&&h.calls.opened.every(id=>id.includes('2030-09-21')&&id.endsWith('|3')));
    assert.equal(h.$('actions').hidden,true,'with the results in and nothing running, Edit search is the way back');
    // Saying Sunday instead is read again and rechecks the same restaurants.
    const opened=h.calls.opened.length;
    h.$('edit').click();assert.equal(h.$('actions').hidden,false);
    h.type('text',sentence('Sunday'));h.submit();await h.settle(40);
    assert.equal(h.calls.read.length,2);assert.equal(h.calls.research.length,1,'a different day is not a different search');
    assert.ok(h.calls.opened.slice(opened).every(id=>id.includes('2030-09-22')));
    // A party set by hand stands over the words until the words about it change.
    h.$('edit').click();h.type('people','4');h.submit();await h.settle(40);
    assert.equal(h.calls.read.length,2,'the same words are not read twice');
    assert.match(h.$('summary-chips').textContent,/4 people/);
    assert.match(h.$('summary-notes').textContent,/People taken from the form \(the words said 3\)\./);
    h.$('edit').click();h.type('text',sentence('Sunday').replace('for 3','for 5'));h.submit();await h.settle(40);
    assert.equal(h.$('people').value,'5','the newer statement wins');
    assert.doesNotMatch(h.$('summary-notes').textContent,/taken from the form/);
    assert.equal(h.calls.research.length,1);
  }finally{h.restore();}
});
test('a reading that fails opens Details, and the same words then go ahead as typed',async()=>{
  const h=harness({read:reader()});
  try{
    await h.tool.open();
    h.type('text','fail: sushi on Saturday');h.submit();await h.settle();
    assert.match(h.$('error').textContent,/The reading timed out\. Set the date, people and time under Details, then search again\./);
    assert.equal(h.$('details').open,true);assert.equal(h.calls.research.length,0);assert.equal(h.$('text').value,'fail: sushi on Saturday');
    h.type('date','2030-09-21');h.submit();await h.settle();
    assert.equal(h.calls.read.length,1,'words whose reading failed are not read again');
    assert.equal(h.calls.research.length,1);assert.equal(h.calls.research[0].outing.preferredDate,'2030-09-21');
    // Stop during the reading leaves the words and starts nothing.
    h.$('stop').click();
    let release;const slow=harness({read:words=>new Promise(resolve=>{release=()=>resolve(reader()(words));})});
    try{
      await slow.tool.open();slow.type('text',sentence('Saturday'));slow.submit();await slow.settle();
      assert.match(slow.$('status').textContent,/Reading the request/);
      slow.$('stop').click();release();await slow.settle(20);
      assert.equal(slow.calls.research.length,0);assert.equal(slow.$('date').value,'','a reading that arrives after Stop sets nothing');
    }finally{slow.restore();}
  }finally{h.restore();}
});

