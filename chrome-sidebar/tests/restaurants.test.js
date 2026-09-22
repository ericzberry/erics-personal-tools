import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {positiveSlots,pageContext,structuralObservation,validatedObservation,analyzeAvailability,combineObservations,planChecks,runBounded,observation,isStale,matchesDate,readTime,seatingOf} from '../src/reservation-availability.js';
import {providerSearchURL,bookingProvider,safePublicURL,searchInput,discoveryResult} from '../src/restaurant-search.js';
import {buildIntent,venue,LIMITS} from '../src/restaurant-data.js';
import {RestaurantWorkspace,MobileRestaurantWorkspace,RestaurantResult} from '../src/components/views.js';
import {isSettingsPage,settingsAction} from '../src/settings-bridge.js';
import {reservationBrowser} from '../src/reservation-browser.js';
const now=new Date('2030-09-15T03:00:00Z');
const intent=buildIntent({text:'Example Bistro',city:'NYC',date:'2030-09-20',people:2,time:'19:30'},{now});
const place=venue({id:'v1',name:'Example Bistro',address:'100 Example Street, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example-bistro'}]});
const job=()=>planChecks([place],intent.outing,{searchId:'s',queryRevision:1,timezone:'America/New_York'})[0];
const control=(text,extra={})=>({tag:'button',role:'',label:'',name:'',text,value:'',href:'',disabled:false,selected:false,region:'reservation',...extra});
const page=(extra={})=>({url:'https://resy.com/cities/new-york-ny/venues/example-bistro?date=2030-09-20&seats=2',title:'Example Bistro - New York, NY | Resy',heading:'Example Bistro',text:'Example Bistro. Reserve a table. Dinner reservations.',loading:false,capturedAt:now.toISOString(),
  controls:[control('2 Guests',{tag:'select',label:'Guests',value:'2'}),control('Fri, Sep 20',{label:'Date',selected:true}),control('7:00 PM',{tag:'select',label:'Time',value:'1900'}),control('21',{label:'Saturday, September 21, 2030.',region:'reservation'})],...extra});
test('a time is a slot only inside the reservation region, enabled, and in the window (R06, R07, R14)',()=>{
  const p=page();
  p.controls.push(control('7:00 PM',{region:'page'}),control('Hours: 5:00 PM – 11:00 PM',{region:'other'}),control('Notify 8:00 PM'),control('7:30 PM',{disabled:true}),control('11:30 PM'));
  assert.deepEqual(positiveSlots(p,job()),[]);
  p.controls.push(control('6:30 PM · Dining Room'),control('6:30 PM · Bar'),control('7:15 PM',{tag:'a',href:'https://resy.com/cities/new-york-ny/venues/example-bistro/book?slot=abc'}));
  const slots=positiveSlots(p,job());
  assert.deepEqual(slots.map(s=>[s.time,s.seating,s.slotURL]),[['18:30','Dining Room',null],['18:30','Bar',null],['19:15',null,'https://resy.com/cities/new-york-ny/venues/example-bistro/book?slot=abc']]);
  assert.equal(structuralObservation(p,job(),place).status,'available');
  for(const change of [q=>q.controls[1].text='Sep. 21',q=>q.controls[1]={...control('20'),label:'Friday, September 20, 2030.',selected:false},q=>q.controls[0].value='4',q=>q.controls[0]={...control('2+ Guests',{tag:'select',label:'Guests',value:'2'})},q=>q.heading='Another Restaurant']){
    const q=page();q.controls.push(control('6:30 PM · Dining Room'));change(q);
    const o=structuralObservation(q,job(),place);
    assert.equal(o.status,'failed',JSON.stringify(q.controls[1]));assert.equal(o.slots.length,0);
  }
  assert.equal(pageContext({...page(),title:'Example Bistro | Resy',heading:''},place,'2030-09-20',2).ok,true,'a title that starts with the name identifies the page');
  assert.equal(matchesDate('Date September 20, 2029','2030-09-20'),false);
  assert.equal(readTime('7:15pm'),'19:15');assert.equal(seatingOf('7:15 PM · Patio'),'Patio');
});
test('empty text is never sold out: only the provider’s explicit message, for this party, is',()=>{
  const p=page();
  assert.equal(structuralObservation(p,job(),place),null,'nothing said, nothing concluded');
  p.text="Sorry, we don't currently have any tables available for 2 on this date.";
  const none=structuralObservation(p,job(),place);
  assert.equal(none.status,'none_in_checked_window');assert.equal(none.coverage,'complete_requested_window');assert.match(none.detail,/tables available for 2/);
  p.text="Sorry, we don't currently have any tables available for 4.";
  assert.equal(structuralObservation(p,job(),place),null,'a message about another party size proves nothing');
  p.text='Reservations for this date open on September 6 at 9:00 AM.';
  assert.equal(structuralObservation(p,job(),place).status,'not_released');
  p.text='Log in to book this restaurant. Members see availability after signing in.';
  assert.equal(structuralObservation({...p,controls:p.controls.map(c=>({...c,region:'page'}))},job(),place).status,'login_required');
  p.text='Complete verification before viewing reservation availability.';
  assert.equal(structuralObservation(p,job(),place).status,'challenge_required');
  const outside=page();outside.controls.push(control('10:30 PM'));
  const o=structuralObservation(outside,job(),place);
  assert.equal(o.status,'none_in_checked_window');assert.match(o.detail,/outside/);
  const opentable=planChecks([venue({...place,id:'v2',providers:[{provider:'OpenTable',url:'https://www.opentable.com/r/example-bistro-new-york'}]})],intent.outing,{})[0];
  const ot=page({url:opentable.searchURL,text:'Sorry, no tables are available near that time for a party of 2.'});
  const partial=structuralObservation(ot,opentable,place);
  assert.equal(partial.status,'none_in_checked_window');assert.equal(partial.coverage,'partial');assert.deepEqual(partial.checkedWindow,{start:'19:30',end:'19:30'});
  assert.equal(structuralObservation(page({url:'https://example.com/book'}),{...job(),provider:'Restaurant website'},place).status,'unsupported');
});
test('a model reading is accepted only where the page agrees with it',async()=>{
  const p=page();p.controls.push(control('6:30 PM Dining room'),control('7:00 PM',{region:'page'}));
  const raw={status:'available',dateControl:1,partyControl:0,slots:[{control:4,time:'18:30',seating:'Dining room'},{control:5,time:'19:00'},{control:2,time:'19:00'}]};
  const ok=validatedObservation(raw,p,job(),place);
  assert.deepEqual(ok.slots.map(s=>[s.time,s.seating]),[['18:30','Dining room']]);
  assert.equal(validatedObservation({...raw,slots:[{control:4,time:'20:00'}]},p,job(),place).status,'failed');
  assert.equal(validatedObservation({...raw,dateControl:3},p,job(),place).status,'failed');
  assert.equal(validatedObservation({...raw,status:'none_in_checked_window',slots:[],noAvailabilityQuote:'No reservations are available for this date.'},p,job(),place).status,'failed','a quote must be on the page');
  const quoted={...p,text:`${p.text} No reservations are available for this date.`};
  assert.equal(validatedObservation({...raw,status:'none_in_checked_window',slots:[],noAvailabilityQuote:'No reservations are available for this date.'},quoted,job(),place).status,'none_in_checked_window');
  assert.equal(validatedObservation({status:'login_required',detail:'Sign in'},p,job(),place).status,'login_required');
  let asked=0;
  const silent=await analyzeAvailability(page({text:'Example Bistro. A long page that says nothing explicit about tables at all.'}),job(),place,async()=>{asked++;return JSON.stringify({status:'available',dateControl:1,partyControl:0,slots:[]});});
  assert.equal(asked,1);assert.equal(silent.status,'failed');
  const withoutModel=await analyzeAvailability(page({text:'Example Bistro. A long page that says nothing explicit about tables at all.'}),job(),place,null);
  assert.equal(withoutModel.reasonCode,'silent');
});
test('observations combine without losing a failure, and age out (R08, R19)',()=>{
  const j=job();
  const good=observation(j,{status:'available',slots:[{time:'19:00',seating:'Bar',searchURL:j.searchURL,slotURL:null,evidenceRef:'control:4'}],coverage:'complete_requested_window',observedAt:now.toISOString()});
  const bad=observation({...j,partySize:3},{status:'login_required',detail:'Sign in',observedAt:now.toISOString()});
  const both=combineObservations([good,bad],{now:now.getTime()});
  assert.equal(both.status,'available');assert.equal(both.slots.length,1);assert.equal(both.coverage,'partial');assert.match(both.detail,/1 check could not be completed/);
  assert.equal(combineObservations([observation(j,{status:'none_in_checked_window',coverage:'complete_requested_window'}),bad]).status,'login_required');
  assert.equal(combineObservations([]).status,'not_checked');
  assert.equal(combineObservations([observation(j,{status:'checking'}),bad]).status,'checking','a check still running is not a verdict');
  assert.equal(combineObservations([observation(j,{status:'cancelled'})]).status,'cancelled');
  assert.equal(isStale(good,now.getTime()),false);assert.equal(isStale(good,now.getTime()+LIMITS.readinessMs*100),true);
  assert.equal(combineObservations([good],{now:now.getTime()+10*60000}).stale,true);
});
test('the plan visits the preferred combination first, skips what is fresh, and anchors only time-search providers (R09, R15)',()=>{
  const wide=buildIntent({text:'Example Bistro',city:'NYC',date:'2030-09-20',endDate:'2030-09-21',flexibleDates:true,people:2,maxPeople:3,flexibleParty:true,time:'19:30'},{now});
  const two=venue({...place,id:'v2',providers:[{provider:'OpenTable',url:'https://www.opentable.com/r/example-bistro-new-york'},{provider:'Restaurant website',url:'https://example.com/reserve'}]});
  const jobs=planChecks([place,two],wide.outing,{searchId:'s',queryRevision:2,timezone:'America/New_York'});
  assert.deepEqual(jobs.slice(0,4).map(j=>[j.venueId,j.date,j.partySize]),[['v1','2030-09-20',2],['v1','2030-09-20',3],['v1','2030-09-21',2],['v1','2030-09-21',3]]);
  assert.equal(jobs.length,8,'the manual provider is not planned');
  const ot=jobs.find(j=>j.provider==='OpenTable');
  assert.equal(ot.anchor,'19:30');assert.equal(new URL(ot.searchURL).searchParams.get('dateTime'),'2030-09-20T19:30:00');
  assert.equal(jobs[0].anchor,null);assert.equal(new URL(jobs[0].searchURL).searchParams.get('time'),'all-day');
  const fresh=[observation(jobs[0],{status:'none_in_checked_window'}),observation(jobs[1],{status:'failed'}),{...observation(jobs[2],{status:'available',slots:[]}),queryRevision:1}];
  const again=planChecks([place,two],wide.outing,{searchId:'s',queryRevision:2,fresh});
  assert.equal(again.some(j=>j.id===jobs[0].id),false,'a fresh observation is not repeated');
  assert.equal(again.some(j=>j.id===jobs[1].id),true,'a failure is');
  assert.equal(again.some(j=>j.id===jobs[2].id),true,'an older revision does not count');
  assert.deepEqual(planChecks([place],null),[]);
});
test('bounded runs: two at a time, one per site, and nothing new after stop',async()=>{
  const jobs=[1,2,3,4,5].map(n=>({id:String(n),provider:n%2?'Resy':'OpenTable',searchURL:n%2?`https://resy.com/${n}`:`https://www.opentable.com/${n}`}));
  let active=0,peak=0;const hosts=new Map();const abort=new AbortController();
  const {results,skipped}=await runBounded(jobs,async job=>{
    const host=new URL(job.searchURL).hostname;hosts.set(host,(hosts.get(host)||0)+1);assert.ok(hosts.get(host)<=1,'one per site');
    active++;peak=Math.max(peak,active);
    await new Promise(r=>setTimeout(r,5));
    if(job.id==='3')abort.abort();
    active--;hosts.set(host,hosts.get(host)-1);return job.id;
  },{concurrency:2,perDomain:1,signal:abort.signal});
  assert.equal(peak,2);assert.ok(results.length<5&&skipped.length>0);
  assert.ok(results.every(r=>r.result===r.job.id));
});
test('workspace uses unique IDs, labels every control, and results are text-safe',()=>{
  const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;
  const view=RestaurantWorkspace();document.body.append(view);
  const ids=[...view.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  for(const label of view.querySelectorAll('label[for]'))assert.ok(document.getElementById(label.getAttribute('for')),label.getAttribute('for'));
  assert.equal(view.querySelector('#restaurant-mode'),null,'no mode choice and no shortlist size: intent comes from the words');
  assert.equal(view.querySelector('#restaurant-limit'),null);
  assert.equal(view.querySelector('#restaurant-results').hidden,true);
  assert.equal(view.querySelectorAll('input[type=password]').length,0);
  assert.ok(view.querySelector('#restaurant-spend[data-money]'));
  const entry={venue:venue({...place,name:'<img src=x>',claims:[]}),eligibility:{status:'eligible',checks:[]},fit:{score:1,contributions:[],unknowns:[]},explanation:{reason:'<b>x</b>',compromise:'',unknowns:[]}};
  const card=RestaurantResult(entry,{outing:intent.outing,summary:{status:'available',slots:[{time:'19:15',seating:null,slotURL:null,searchURL:'https://resy.com/x'},{time:'19:15',seating:'Bar',slotURL:'https://resy.com/x/book',searchURL:'https://resy.com/x'}],observedAt:now.toISOString(),coverage:'complete_requested_window',detail:''},now:now.getTime()});
  assert.equal(card.querySelector('img'),null);assert.equal(card.querySelector('b'),null);
  assert.deepEqual([...card.querySelectorAll('.slot-action')].map(b=>b.textContent),['Open 7:15 pm search · Seating not specified','7:15 pm · Bar']);
  assert.ok(card.matches('section.result-block')&&card.querySelectorAll('.result-block').length===0,'one block per restaurant');
  const mobileCard=RestaurantResult(entry,{outing:intent.outing,mobile:true,handoffs:[{label:'Check on Resy',url:'https://resy.com/x?date=2030-09-20&seats=2'}]});
  assert.equal(mobileCard.querySelector('.slot-action'),null);assert.equal(mobileCard.querySelector('a').textContent,'Check on Resy');
  const mobile=MobileRestaurantWorkspace();assert.ok(mobile.classList.contains('workspace-shell--mobile'));
});
test('provider links retain identity and take only the outing parameters',()=>{
  const links=[['https://resy.com/cities/new-york-ny/venues/example?date=2020-01-01&seats=9','Resy','seats'],['https://www.opentable.com/r/example-new-york','OpenTable','covers'],['https://www.exploretock.com/example/experience/123/dinner','Tock','size'],['https://www.sevenrooms.com/reservations/example','SevenRooms','party_size']];
  for(const [url,provider,key] of links){assert.equal(bookingProvider(url),provider);const result=new URL(providerSearchURL(url,{date:'2030-09-20',partySize:4,time:'19:00'}));assert.equal(result.searchParams.get(key),'4');assert.ok(result.href.includes('2030-09-20'));assert.equal(result.pathname,new URL(url).pathname);}
  for(const url of ['javascript:alert(1)','http://example.com','https://secret@host.com','https://127.0.0.1','https://localhost','https://foo.internal'])assert.equal(safePublicURL(url),null);
  // The legacy request still validates and still round-trips, for clients on it.
  const legacy=searchInput({mode:'restaurant',query:'Example Bistro',city:'NYC',date:'2030-09-15',partySize:2},'2030-01-01');
  assert.deepEqual(searchInput(legacy,'2030-01-01'),legacy);
  const source={url:'https://guide.michelin.com/us/en/example?utm_source=x',title:'Guide',detail:'Two stars'};
  assert.equal(discoveryResult({restaurants:[{name:'X',address:'1 St',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',evidence:[{...source,url:'https://guide.michelin.com/us/en/example'}],booking:[]}]},[source],legacy).restaurants.length,1);
});
test('restaurant bridge accepts only exact trusted extension pages and forwards the intent, never a key',async()=>{
  const api={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p},storage:{local:{setAccessLevel:async()=>{},get:async()=>({cloudConnection:{token:'x'.repeat(32)}})}}};
  assert.equal(isSettingsPage({id:'test',url:'chrome-extension://test/restaurants.html'},api),true);
  assert.equal(isSettingsPage({id:'test',url:'https://resy.com/restaurants.html'},api),false);
  await settingsAction({action:'restaurants',id:'12345678-1234-1234-1234-123456789abc',intent,apiKey:'do not send'},api,async(token,path,options)=>{assert.match(path,/\/restaurants$/);assert.equal(options.timeoutMs,150000);assert.equal(options.value.apiKey,undefined);assert.equal(options.value.intent.text,'Example Bistro');return {};});
});
test('browser reader refuses a cross-origin tab, never closes pre-existing tabs, and gives up at the readiness limit',async()=>{
  let reads=0,closed=[];
  const api={tabs:{get:async()=>({url:'https://another.example.com/'}),remove:async id=>closed.push(id)},scripting:{executeScript:async()=>{reads++;}}};
  const b=reservationBrowser(api);await assert.rejects(b.read(1,'https://resy.com/cities/ny/venues/test'),/different site/);assert.equal(reads,0);await b.close(1);await b.closeAll();assert.deepEqual(closed,[]);
  let clock=0;const tabs=new Map();
  const slow={tabs:{create:async({url})=>{tabs.set(7,{url,status:'complete'});return {id:7};},get:async id=>tabs.get(id),remove:async id=>closed.push(id)},scripting:{executeScript:async()=>[{result:{url:'https://resy.com/cities/ny/venues/test',heading:'',text:'',controls:[],loading:true}}]}};
  const browser=reservationBrowser(slow,{readiness:1500,now:()=>clock+=800});
  const opened=await browser.open({searchURL:'https://resy.com/cities/ny/venues/test'});
  assert.equal(opened.timedOut,true);assert.equal(browser.owns(7),true);await browser.close(7);assert.deepEqual(closed,[7]);
});
