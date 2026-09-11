import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {searchInput,partySizes,searchDates,isNYC,travelDisposition,discoveryResult,needsRestaurantChoice,bookingURL,bookingProvider,safePublicURL} from '../src/restaurant-search.js';
import {resyAvailability,validatedAvailability,matchesDate,combineObservations} from '../src/reservation-availability.js';
import {searchTimes,matchesGeography} from '../src/restaurant-search.js';
import {RestaurantWorkspace,RestaurantCandidate,ReservationResult} from '../src/components/views.js';
import {isSettingsPage,settingsAction} from '../src/settings-bridge.js';
import {reservationBrowser} from '../src/reservation-browser.js';
const input={mode:'restaurant',query:'Example Bistro',city:'NYC',date:'2030-09-15',partySize:2,startTime:'17:00',endTime:'22:00'};
const search=searchInput(input,'2030-01-01');
const restaurant={name:'Example Bistro',city:'New York City',address:'100 Example Street',neighborhood:'Upper West Side',borough:'Manhattan'};
const page=()=>({url:'https://resy.com/cities/new-york-ny/venues/example-bistro',heading:restaurant.name,text:"Sorry, we don't currently have any tables available for 2.",controls:[{tag:'select',label:'Guests',value:'2',text:'2 Guests'},{tag:'button',label:'Date',text:'Sun., Sep. 15'},{tag:'select',label:'Time',text:'7:00 PM',value:'1900'},{tag:'button',label:'Monday, September 16, 2030.',text:'16'}]});
test('validates dates, local party ranges, time windows, and city aliases',()=>{
  assert.equal(isNYC('Manhattan'),true);assert.equal(isNYC('New York City'),true);assert.equal(isNYC('Paris'),false);
  assert.deepEqual(partySizes(searchInput({...input,flexible:true,minParty:2,maxParty:6},'2030-01-01')),[2,3,4,5,6]);
  for(const changes of [{date:'2030-02-30'},{date:'2029-12-01'},{date:'2030-13-10'},{partySize:0},{partySize:2.5},{flexible:true,minParty:1,maxParty:10},{flexible:true,minParty:6,maxParty:2},{endTime:'16:00'},{city:''},{query:''}])assert.throws(()=>searchInput({...input,...changes},'2030-01-01'));
  // The Worker re-validates the normalized search the app sends it, so it has to survive the round trip.
  assert.deepEqual(searchInput(search,'2030-01-01'),search);
  assert.deepEqual(searchInput(searchInput({...input,flexible:true,minParty:2,maxParty:6},'2030-01-01'),'2030-01-01').maxParty,6);
});
test('a specific restaurant can be checked across a run of dates',()=>{
  const week=searchInput({...input,flexibleDates:true,endDate:'2030-09-18'},'2030-01-01');
  assert.deepEqual(searchDates(week),['2030-09-15','2030-09-16','2030-09-17','2030-09-18']);
  assert.deepEqual(searchDates(search),['2030-09-15']);
  assert.deepEqual(searchInput(week,'2030-01-01'),week);
  // A category search is one evening out, so it keeps a single date.
  assert.equal(searchInput({...input,mode:'category',flexibleDates:true,endDate:'2030-09-18'},'2030-01-01').endDate,'2030-09-15');
  for(const endDate of ['2030-09-25','2030-09-14','2030-13-01'])assert.throws(()=>searchInput({...input,flexibleDates:true,endDate},'2030-01-01'));
  const url=new URL(bookingURL('https://www.opentable.com/r/example-new-york',week,4,'19:00','2030-09-17'));
  assert.equal(url.searchParams.get('dateTime'),'2030-09-17T19:00:00');
});
test('NYC travel filter handles exclusions, unknown locations and city-specific behavior',()=>{
  for(const neighborhood of ['Lower East Side','LES','East Village','EV'])assert.equal(travelDisposition({...restaurant,neighborhood},search),'longer');
  for(const borough of ['Brooklyn','Queens'])assert.equal(travelDisposition({...restaurant,borough},search),'longer');
  assert.equal(travelDisposition(restaurant,search),'included');assert.equal(travelDisposition({...restaurant,borough:''},search),'unknown');
  assert.equal(travelDisposition({...restaurant,borough:'Queens'},{...search,includeLongTravel:true}),'included');
  assert.equal(travelDisposition({...restaurant,neighborhood:'East Village'},{...search,city:'London'}),'included');
});
test('research rejects ungrounded URLs, deduplicates addresses and asks about misspellings',()=>{
  const source={url:'https://guide.michelin.com/us/en/example',title:'Guide',detail:'Two stars · 2030 guide'},booking={url:'https://resy.com/cities/new-york-ny/venues/example-bistro'};
  const r={...restaurant,evidence:[source],booking:[booking,{url:'https://unverified.example.com/'}]};
  const result=discoveryResult({restaurants:[r,r,{...r,name:'Different',address:'Other',evidence:[{...source,url:'https://invented.example.com'}]}]},[source,booking],search);
  assert.equal(result.restaurants.length,1);assert.equal(result.restaurants[0].booking.length,1);assert.equal(result.unverified,1);assert.equal(needsRestaurantChoice(result,search),false);
  assert.equal(needsRestaurantChoice(result,{...search,query:'Exampel Bisto'}),true);
  assert.equal(needsRestaurantChoice({...result,clarification:'Which branch?'},search),true);
  const out=discoveryResult({restaurants:[{...r,borough:'Brooklyn'}]},[source,booking],{...search,mode:'category'});assert.equal(out.excluded,1);assert.equal(out.restaurants.length,0);
});
test('provider links retain identity and replace stale dates and party sizes',()=>{
  const links=[['https://resy.com/cities/new-york-ny/venues/example?date=2020-01-01&seats=9','Resy','seats'],['https://www.opentable.com/r/example-new-york','OpenTable','covers'],['https://www.exploretock.com/example/experience/123/dinner','Tock','size'],['https://www.sevenrooms.com/reservations/example','SevenRooms','party_size']];
  for(const [url,provider,key] of links){assert.equal(bookingProvider(url),provider);const result=new URL(bookingURL(url,search,4));assert.equal(result.searchParams.get(key),'4');assert.ok(result.href.includes('2030-09-15'));assert.equal(result.pathname,new URL(url).pathname);}
  assert.equal(new URL(bookingURL(links[0][0],search,2)).searchParams.get('time'),'all-day');
  for(const url of ['javascript:alert(1)','http://example.com','https://secret@host.com','https://127.0.0.1','https://localhost','https://foo.internal'])assert.equal(safePublicURL(url),null);
});
test('Resy reads explicit no-tables and enabled times without treating filters or calendar days as slots',()=>{
  let p=page();assert.equal(resyAvailability(p,restaurant,search,2).status,'unavailable');
  p.text='Dinner reservations';assert.equal(resyAvailability(p,restaurant,search,2),null);
  p.controls.push({tag:'button',text:'6:30 PM · Dining Room',label:'',disabled:false},{tag:'button',text:'7:30 PM',disabled:true},{tag:'button',text:'Notify 8:00 PM'},{tag:'button',text:'11:30 PM'});
  const r=resyAvailability(p,restaurant,search,2);assert.deepEqual(r.slots.map(s=>s.time),['18:30']);
  p.heading='Another restaurant';assert.equal(resyAvailability(p,restaurant,search,2),null);
});
test('wrong or unselected dates, ambiguous 6+ guests, loading and wrong party sizes cannot confirm availability',()=>{
  for(const change of [p=>p.controls[1].text='Sep. 16',p=>p.controls[1]={tag:'button',label:'September 15, 2030.',text:'15'},p=>p.controls[0].value='4',p=>p.controls[0]={tag:'select',label:'Guests',text:'2+ Guests',value:'2'},p=>p.loading=true]){
    const p=page();change(p);assert.equal(resyAvailability(p,restaurant,search,2),null);
  }
  assert.equal(matchesDate('Date September 15, 2029','2030-09-15'),false);
});
test('model interpretations must cite selected controls and actual enabled times',()=>{
  const p=page();p.controls.push({tag:'button',text:'6:30 PM Dining room'});
  const raw={status:'available',dateControl:1,partyControl:0,slots:[{control:4,time:'18:30'},{control:2,time:'19:00'}]};
  assert.deepEqual(validatedAvailability(raw,p,restaurant,search,2).slots.map(s=>s.time),['18:30']);
  assert.equal(validatedAvailability({...raw,slots:[{control:4,time:'20:00'}]},p,restaurant,search,2).status,'attention');
  assert.equal(validatedAvailability({...raw,dateControl:3},p,restaurant,search,2).status,'attention');
  assert.equal(validatedAvailability({...raw,status:'unavailable',noAvailabilityQuote:'No reservations are available for this date.'},p,restaurant,search,2).status,'attention');
  assert.equal(validatedAvailability({...raw,status:'unavailable',noAvailabilityQuote:p.text},p,restaurant,search,2).status,'unavailable');
});
test('workspace uses unique IDs, accessible controls, safe evidence and results',()=>{
  const {document}=parseHTML('<html><body></body></html>');globalThis.document=document;const view=RestaurantWorkspace();document.body.append(view);
  const ids=[...view.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
  for(const label of view.querySelectorAll('label[for]'))assert.ok(document.getElementById(label.getAttribute('for')));
  // Two choices stay visible as a segmented control rather than hiding in a dropdown.
  assert.equal(view.querySelector('select#restaurant-mode'),null);
  const mode=view.querySelector('#restaurant-mode');mode.value='category';
  assert.equal(view.querySelector('#restaurant-mode-category').checked,true);assert.equal(mode.value,'category');
  // The search fills the page: no second column, and results wait until there are some.
  assert.equal(view.querySelector('.workspace-columns'),null);
  assert.equal(view.querySelector('#restaurant-shortlist').hidden,true);
  assert.equal(view.querySelectorAll('input[type=password]').length,0);
  const card=RestaurantCandidate({...restaurant,name:'<img src=x>',booking:[],evidence:[]},false,()=>{});assert.equal(card.querySelector('img'),null);
  const result=ReservationResult({restaurant,size:4,provider:'Resy',date:search.date,status:'attention',detail:'Log in'},{});assert.match(result.textContent,/4 people/);assert.equal(result.querySelectorAll('button')[1].disabled,true);
});
test('restaurant bridge accepts only exact trusted extension pages and bounds endpoint forwarding',async()=>{
  const api={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p},storage:{local:{setAccessLevel:async()=>{},get:async()=>({cloudConnection:{token:'x'.repeat(32)}})}}};
  assert.equal(isSettingsPage({id:'test',url:'chrome-extension://test/restaurants.html'},api),true);
  assert.equal(isSettingsPage({id:'test',url:'https://resy.com/restaurants.html'},api),false);
  await settingsAction({action:'restaurants',id:'12345678-1234-1234-1234-123456789abc',search,apiKey:'do not send'},api,async(token,path,options)=>{assert.match(path,/\/restaurants$/);assert.equal(options.timeoutMs,130000);assert.equal(options.value.apiKey,undefined);return {};});
});
test('browser reader refuses a cross-origin tab and never closes pre-existing tabs',async()=>{
  let reads=0,closed=[];
  const api={tabs:{get:async()=>({url:'https://another.example.com/'}),remove:async id=>closed.push(id)},scripting:{executeScript:async()=>{reads++;}}};
  const b=reservationBrowser(api);await assert.rejects(b.read(1,'https://resy.com/cities/ny/venues/test'),/different site/);assert.equal(reads,0);await b.close(1);await b.closeAll();assert.deepEqual(closed,[]);
});
test('time-focused providers scan the requested window and partial failures stay visible',()=>{
  assert.deepEqual(searchTimes('OpenTable',search),['17:00','18:00','19:00','20:00','21:00','22:00']);
  assert.deepEqual(searchTimes('Tock',{...search,endTime:'18:30'}),['17:00','18:00','18:30']);
  assert.deepEqual(searchTimes('Resy',search),['17:00']);
  const slot={time:'18:00',label:'Dining room'};
  const result=combineObservations([{status:'available',slots:[slot]},{status:'available',slots:[slot]},{status:'error',detail:'Login needed'}]);
  assert.equal(result.status,'available');assert.equal(result.slots.length,1);assert.match(result.detail,/incomplete/);
  assert.equal(combineObservations([{status:'unavailable'},{status:'error',detail:'Failed'}]).status,'attention');
  assert.equal(combineObservations([]).status,'cancelled');
});

test('geographic constraints reject candidates in another city or neighborhood',()=>{
 assert.equal(matchesGeography({...restaurant,city:'Boston'},search),false);
 assert.equal(matchesGeography(restaurant,{...search,neighborhood:'UWS'}),true);
 assert.equal(matchesGeography(restaurant,{...search,neighborhood:'East Village'}),false);
 assert.equal(matchesGeography({city:'Paris',neighborhood:'Marais'},{...search,city:'Paris, France',neighborhood:'Marais'}),true);
});
