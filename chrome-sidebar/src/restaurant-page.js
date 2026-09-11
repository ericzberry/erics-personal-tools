import {RestaurantWorkspace,RestaurantCandidate,ReservationResult} from './components/views.js';
import {Option} from './components/ui.js';
import {searchInput,localDate,isNYC,partySizes,searchDates,needsRestaurantChoice,bookingURL,searchTimes} from './restaurant-search.js';
import {reservationBrowser} from './reservation-browser.js';
import {analyzeAvailability,combineObservations} from './reservation-availability.js';

document.getElementById('app').replaceChildren(RestaurantWorkspace());
const $=id=>document.getElementById(id),api=globalThis.chrome?.runtime?.id?globalThis.chrome:null;
const browser=api?reservationBrowser(api):null;
let connections=[],search=null,research=null,selected=new Set(),results=[],busy=false,generation=0,abort=null,ai=null;
const fields=['mode','query','city','neighborhood','date','through','start','end','party','min','max','flexible','flex-dates','travel','limit','connection'];
const dateRange=value=>value.date===value.endDate?value.date:`${value.date} – ${value.endDate}`;
const status=text=>{$('restaurant-status').textContent=text;$('restaurant-status').hidden=!text;};
const error=text=>{$('restaurant-error').textContent=text;$('restaurant-error').hidden=!text;};
const connectionStatus=text=>{$('restaurant-connection-status').textContent=text;$('restaurant-connection-status').hidden=!text;};
function visibility() {
  const category=$('restaurant-mode').value==='category',flex=$('restaurant-flexible').checked;
  document.querySelector('label[for="restaurant-query"]').textContent=category?'Restaurant category':'Restaurant name';
  $('restaurant-query').placeholder=category?'e.g. exactly 2 Michelin stars':'Name or approximate spelling';
  $('restaurant-category-help').hidden=!category;
  $('restaurant-nyc').hidden=!isNYC($('restaurant-city').value);
  // A run of dates is offered for one named restaurant; a category search is one evening.
  const flexDates=!category&&$('restaurant-flex-dates').checked;
  $('restaurant-date-options').hidden=category;
  $('restaurant-through-field').hidden=!flexDates;$('restaurant-date-help').hidden=!flexDates;
  document.querySelector('label[for="restaurant-date"]').textContent=flexDates?'First date':'Date';
  $('restaurant-flex-fields').hidden=!flex;$('restaurant-fixed-fields').hidden=flex;
  $('restaurant-party-help').hidden=!flex;
}
function formValue() {return {mode:$('restaurant-mode').value,query:$('restaurant-query').value,city:$('restaurant-city').value,neighborhood:$('restaurant-neighborhood').value,date:$('restaurant-date').value,endDate:$('restaurant-through').value,flexibleDates:$('restaurant-flex-dates').checked,startTime:$('restaurant-start').value,endTime:$('restaurant-end').value,partySize:$('restaurant-party').value,minParty:$('restaurant-min').value,maxParty:$('restaurant-max').value,flexible:$('restaurant-flexible').checked,includeLongTravel:$('restaurant-travel').checked,limit:$('restaurant-limit').value};}
function fill(value={}) {
  const values={mode:'restaurant',query:'',city:'New York City',neighborhood:'',date:localDate(),endDate:value.date||localDate(),startTime:'17:00',endTime:'22:00',partySize:value.minParty||2,minParty:2,maxParty:6,limit:12,...value};
  const names={start:'startTime',end:'endTime',through:'endDate',party:'partySize',min:'minParty',max:'maxParty'};
  for(const id of fields.filter(id=>!['connection','flexible','flex-dates','travel'].includes(id)))$('restaurant-'+id).value=values[names[id]||id];
  $('restaurant-flexible').checked=!!value.flexible;$('restaurant-flex-dates').checked=!!value.flexibleDates;$('restaurant-travel').checked=!!value.includeLongTravel;
  for(const id of ['date','through'])$('restaurant-'+id).min=localDate();
  for(const id of ['party','min','max']){const el=$('restaurant-'+id);el.min=1;el.max=20;el.step=1;}
  for(const id of ['query','city','date','start','end'])$('restaurant-'+id).required=true;
  visibility();
}
async function request(action,data={}) {
  if(!api)throw Error('Open this workspace from the installed Chrome extension to use your saved connection and live booking pages.');
  // Activity is bounded to this pending research call; Chrome can otherwise retire
  // the message bridge while a web-search response is still being generated.
  const heartbeat=action==='restaurants'?setInterval(()=>{api.runtime.sendMessage({type:'ERIC_SETTINGS',action:'status'}).catch(()=>{});},15000):null;
  let response;
  try{response=await api.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});}finally{if(heartbeat)clearInterval(heartbeat);}
  if(!response?.ok)throw Error(response?.error||'Could not reach the extension service. Reload the extension and try again.');
  return response;
}
async function loadConnections() {
  $('restaurant-reload').disabled=true;
  try {
    const previous=$('restaurant-connection').value;
    const data=await request('list');connections=(data.connections||[]).filter(c=>c.provider==='openai'&&c.hasApiKey);
    $('restaurant-connection').replaceChildren(...(connections.length?connections.map(c=>Option(c.name,c.id)):[Option('Add an OpenAI connection in AI settings','')]));
    if(connections.some(c=>c.id===previous))$('restaurant-connection').value=previous;
    connectionStatus(connections.length?'':'Add an OpenAI key in AI settings.');
  }catch(e){$('restaurant-connection').replaceChildren(Option('Connection needed',''));connectionStatus(e.message);}
  finally{$('restaurant-reload').disabled=busy;}
}
function setBusy(value) {
  busy=value;
  for(const id of fields)$('restaurant-'+id).disabled=value;
  for(const id of ['find','check','reload'])$('restaurant-'+id).disabled=value;
  $('restaurant-stop').hidden=!value;
  $('restaurant-candidates').inert=value;
  renderResults();
}
function renderCandidates() {
  $('restaurant-candidates').replaceChildren(...(research?.restaurants||[]).map(r=>RestaurantCandidate(r,selected.has(r.id),checked=>{checked?selected.add(r.id):selected.delete(r.id);updateCheck();})));
  updateCheck();
}
function updateCheck() {
  const count=research?.restaurants.filter(r=>selected.has(r.id)).length||0;
  $('restaurant-check').hidden=!research?.restaurants.length;
  $('restaurant-check').disabled=busy||!count;
  $('restaurant-check').textContent=`Check ${count||'selected'} restaurant${count===1?'':'s'}`;
}
function renderResults() {
  $('restaurant-availability').hidden=!results.length;
  $('restaurant-result-context').textContent=search?`${dateRange(search)} · ${search.startTime}–${search.endTime} local time · ${search.minParty===search.maxParty?search.minParty:`${search.minParty}–${search.maxParty}`} people`:'';
  $('restaurant-results').replaceChildren(...results.map(r=>ReservationResult(r,{busy,onOpen:()=>openResult(r),onRecheck:()=>recheck(r)})));
}
function selectedAI() {
  const connection=connections.find(c=>c.id===$('restaurant-connection').value);
  if(!connection)throw Error('Connect an OpenAI account in AI settings, then reload connections.');
  return {id:connection.id};
}
async function interpret(snapshot,r,size,token,context=search) {
  const result=await analyzeAvailability(snapshot,r,context,size,async messages=>{
    if(token!==generation)throw new DOMException('Stopped','AbortError');
    const response=await request('generate',{...ai,task:'restaurant.availability',messages,maxTokens:2000});
    if(response.warning)throw Error(response.warning);return response.text;
  });
  if(token!==generation)throw new DOMException('Stopped','AbortError');
  return result;
}
async function find(event) {
  event.preventDefault();if(busy)return;
  let next,nextAI;
  try {next=searchInput(formValue());nextAI=selectedAI();}catch(e){error(e.message);return;}
  const token=++generation;abort=new AbortController();error('');setBusy(true);status('Researching names, ratings, and booking providers… This can take up to two minutes.');
  try {
    await api.storage.local.set({restaurantSearchPreferences:formValue()});
    const data=await request('restaurants',{...nextAI,search:next});if(token!==generation)return;
    await browser.closeAll();if(token!==generation)return;search=next;ai=nextAI;research=data;results=[];
    const choose=needsRestaurantChoice(data,search);
    selected=new Set(choose?[]:data.restaurants.filter(r=>r.travel==='included'&&r.booking.length).map(r=>r.id));
    $('restaurant-shortlist').hidden=false;
    $('restaurant-summary').hidden=false;$('restaurant-summary').textContent=[data.summary,`${data.restaurants.length} verified candidates · Shortlist, not an exhaustive list.`,data.excluded?`${data.excluded} longer-travel options excluded.`:'',data.unverified?`${data.unverified} candidates omitted because their sources, addresses, or requested geography could not be verified.`:''].filter(Boolean).join(' ');
    $('restaurant-clarification').hidden=!choose&&!data.clarification;
    $('restaurant-clarification').textContent=data.clarification||(choose?'Select the restaurant you meant. Check the name, address, and travel distance before continuing.':'');
    renderCandidates();renderResults();status(data.restaurants.length?'Review the shortlist, then check availability.':'No source-backed matches found. Try a clearer name, another neighborhood, or broader criteria.');
  }catch(e){if(token===generation){error(e.message);status('Research could not finish. Your search inputs are preserved.');}}
  finally{if(token===generation){setBusy(false);updateCheck();}}
}
async function checkSelected() {
  if(busy||!research)return;
  // Results must always correspond to the displayed input, not an older discovery.
  try{if(JSON.stringify(searchInput(formValue()))!==JSON.stringify(search))throw Error('Search details changed. Click Find restaurants again before checking availability.');ai=selectedAI();}catch(e){error(e.message);return;}
  const restaurants=research.restaurants.filter(r=>selected.has(r.id)),sizes=partySizes(search),dates=searchDates(search);
  const jobs=restaurants.flatMap(r=>r.booking.flatMap(booking=>dates.flatMap(date=>sizes.map(size=>({restaurant:r,...booking,size,date})))));
  if(!jobs.length){error('The selected restaurants have no verified booking pages. Try another restaurant or refine the search.');return;}
  const total=jobs.reduce((n,j)=>n+searchTimes(j.provider,search).length,0);
  if(total>120){error(`This search needs ${total} checks. Select fewer restaurants, dates, or party sizes (120 checks maximum).`);return;}
  const token=++generation;abort=new AbortController();error('');results=[];setBusy(true);
  try {
    await browser.closeAll();
    let completed=0;
    for(const job of jobs) {
      if(token!==generation)break;
      const dated={...search,date:job.date};
      const result={...job,url:bookingURL(job.url,search,job.size,search.startTime,job.date),status:'checking',slots:[],observations:[],detail:'Opening the live booking page…'};
      results.push(result);renderResults();
      for(const time of searchTimes(job.provider,search)) {
        if(token!==generation)break;
        status(`Checking ${completed+1} of ${total}: ${job.restaurant.name}, ${job.size} people, ${job.provider}, ${job.date} near ${time}.`);
        let opened;
        try {
          opened=await browser.open(job.url,dated,job.size,abort.signal,time);
          const value=await interpret(opened.snapshot,job.restaurant,job.size,token,dated);
          if(token===generation){result.observations.push({...value,time});result.checkedAt=opened.snapshot.capturedAt;}
        }catch(e){if(token===generation)result.observations.push({status:'error',detail:e.message,slots:[],time});if(e.tabId)await browser.close(e.tabId);}
        finally{if(opened)await browser.close(opened.tabId);}
        completed++;
        if(token===generation){Object.assign(result,combineObservations(result.observations));renderResults();}
      }
    }
    if(token===generation){const found=results.filter(r=>r.status==='available').length,attention=results.filter(r=>['attention','error'].includes(r.status)).length;status(`Finished ${results.length} checks. ${found} found tables; ${attention} need attention. Only the selected providers, dates, sizes, and time window were checked.`);}
  }finally{if(token===generation){setBusy(false);updateCheck();}}
}
async function openResult(result) {
  if(!api)return;
  error('');
  try {
    if(result.tabId){try{await browser.focus(result.tabId);return;}catch{result.tabId=null;}}
    // Keep this user-opened page for login/filter corrections and an explicit recheck.
    const tab=await api.tabs.create({url:result.url,active:true});result.tabId=tab.id;renderResults();
  }catch(e){error(e.message);}
}
async function recheck(result) {
  if(busy||!result.tabId)return;
  const token=++generation;abort=new AbortController();error('');setBusy(true);status(`Rechecking ${result.restaurant.name} for ${result.size} people on ${result.date}…`);
  try{
    const snapshot=await browser.read(result.tabId,result.url),value=await interpret(snapshot,result.restaurant,result.size,token,{...search,date:result.date});
    if(token===generation){Object.assign(result,value,{checkedAt:snapshot.capturedAt});status('Page rechecked.');}
  }catch(e){if(token===generation){error(e.message);status('Recheck failed. Previous observations are retained.');}}
  finally{if(token===generation){setBusy(false);updateCheck();}}
}
$('restaurant-form').addEventListener('submit',find);
$('restaurant-check').addEventListener('click',checkSelected);
$('restaurant-reload').addEventListener('click',loadConnections);
$('restaurant-stop').addEventListener('click',()=>{
  generation++;abort?.abort();
  results.filter(r=>r.status==='checking'||(r.observations&&r.observations.length<searchTimes(r.provider,search).length)).forEach(r=>{r.observations??=[];r.observations.push({status:'cancelled',slots:[],detail:'Stopped before all checks completed.'});Object.assign(r,combineObservations(r.observations));});
  setBusy(false);updateCheck();status('Stopped. Completed checks remain visible. An AI request already sent may still finish and be billed.');
});
for(const id of ['mode','city','flexible','flex-dates'])$('restaurant-'+id).addEventListener('input',visibility);
fill();
if(api){try{const saved=await api.storage.local.get('restaurantSearchPreferences');fill(saved.restaurantSearchPreferences);}catch{status('Could not load saved preferences. Using defaults.');}await loadConnections();}
else{$('restaurant-connection').replaceChildren(Option('Extension required',''));connectionStatus('Preview only. Open the installed extension for live search.');status('Interface preview · Live searches require the Chrome extension.');}
