import {RestaurantWorkspace,MobileRestaurantWorkspace,summaryChips,LocationChoice,RestaurantResult,ResultGroup,FoldedResult} from './components/restaurant-views.js';
import {setStatus,setProgress,Note} from './components/ui.js';
import {buildIntent,summarizeIntent,intentFromJSON,LIMITS,dateIn,displayDate,venue as venueRecord,SCHEMA_VERSION} from './restaurant-data.js';
import {rankVenues,groupResults,sortSlots} from './restaurant-ranking.js';
import {planChecks,runBounded,analyzeAvailability,observation,combineObservations,isStale,adapterFor} from './reservation-availability.js';
import {providerSearchURL} from './restaurant-search.js';
// The restaurant search, shared by the extension page and the phone
// (docs/RESTAURANT_SEARCH_SPEC.md §3, §4, §11). The host supplies what differs:
// how research is requested, whether booking pages can be inspected, how a
// page is opened, and where the device keeps its history. Everything about
// what a search means, what repeats after an edit, and what a result says is
// decided here once.
const fields=['text','city','date','people','time','window','flex-dates','through','flex-party','max','neighborhood','spend','dietary','format','travel'];
export function mountRestaurants(root,{host='chrome',credentials,research,browser=null,openTab=null,generate=null,history,defaults={},online=()=>globalThis.navigator?.onLine!==false,connectionNote=async()=>'',now=()=>Date.now()}){
  root.replaceChildren(host==='mobile'?MobileRestaurantWorkspace():RestaurantWorkspace());
  const $=name=>root.querySelector(`#restaurant-${name}`);
  const mobile=host==='mobile',inspects=!!browser;
  let search=null,ranked=null,busy=false,generation=0,abort=null,modeOverride='',visits=0,fallbacks={total:0,venues:{}},userTabs={},pendingJobs=[],loaded=false,token='';
  const status=(text,tone='')=>{setStatus($('status'),text,tone);$('status').hidden=!text;};
  const error=text=>{setStatus($('error'),text,'error');$('error').hidden=!text;};
  const note=text=>{setStatus($('connection-status'),text,'');$('connection-status').hidden=!text;};

  // The form
  function visibility(){
    const dated=!!$('date').value;
    $('flex-row').hidden=!dated;
    $('through-field').hidden=!dated||!$('flex-dates').checked;
    $('max-field').hidden=!dated||!$('flex-party').checked;
    $('nyc').hidden=!/new york|nyc|manhattan|^ny$/i.test($('city').value.trim());
    if(!busy)$('find').textContent=search?.candidates?.length&&sameIdentity(formValue())?(dated?'Check availability':'Update results'):dated?'Find a table':'Find restaurants';
  }
  function formValue(){
    return {text:$('text').value,city:$('city').value,date:$('date').value,endDate:$('through').value,flexibleDates:$('flex-dates').checked,people:$('people').value,maxPeople:$('max').value,flexibleParty:$('flex-party').checked,time:$('time').value,window:$('window').value,
      neighborhood:$('neighborhood').value,maxSpend:$('spend').value,dietary:$('dietary').value,format:$('format').value,includeLongTravel:$('travel').checked};
  }
  function fill(value={}){
    const v={text:'',city:defaults.city||'New York City',date:'',endDate:'',flexibleDates:false,people:2,maxPeople:'',flexibleParty:false,time:'19:30',window:'60',neighborhood:defaults.neighborhood||'',maxSpend:'',dietary:'',format:'',includeLongTravel:!!defaults.includeLongTravel,...value};
    $('text').value=v.text;$('city').value=v.city;$('date').value=v.date;$('through').value=v.endDate;$('flex-dates').checked=!!v.flexibleDates;$('people').value=v.people;$('max').value=v.maxPeople;$('flex-party').checked=!!v.flexibleParty;
    $('time').value=v.time;$('window').value=String(v.window);$('neighborhood').value=v.neighborhood;$('spend').value=v.maxSpend;$('dietary').value=v.dietary;$('format').value=v.format;$('travel').checked=!!v.includeLongTravel;
    for(const id of ['date','through'])$(id).min=dateIn('',new Date(now()));
    $('text').required=true;$('city').required=true;
    visibility();
  }
  const fromIntent=intent=>({text:intent.text,city:intent.city.name,date:intent.outing?.preferredDate||'',endDate:intent.outing?.dates.at(-1)||'',flexibleDates:!!intent.outing&&intent.outing.dates.length>1,people:intent.outing?.preferredParty||2,maxPeople:intent.outing?.partySizes.at(-1)||'',flexibleParty:!!intent.outing&&intent.outing.partySizes.length>1,time:intent.outing?.preferredTime||'19:30',
    window:intent.outing?String(Math.max(30,Math.min(120,Math.abs(minutes(intent.outing.endTime)-minutes(intent.outing.preferredTime))))):'60',includeLongTravel:!!intent.includeLongTravel});
  const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
  // The research identity: the words, the city and the mode. Anything else
  // that changes reuses what was already found (§3.5).
  const identityOf=(form,mode='')=>JSON.stringify([form.text.trim().toLowerCase(),form.city.trim().toLowerCase(),mode||modeOverride]);
  const sameIdentity=form=>!!search&&search.identity===identityOf(form,search.intent.mode);
  function setBusy(value){
    busy=value;
    for(const id of fields)$(id).disabled=value;
    $('find').disabled=value||(!online()&&!sameIdentity(formValue()));
    $('stop').hidden=!value;
    $('more').disabled=value;$('continue').disabled=value;$('retry').disabled=value;
    if(value)$('find').textContent='Working…';else visibility();
  }
  function collapse(value){$('form').classList.toggle('is-collapsed',value);$('summary').hidden=!value;}

  // What the screen shows
  const outing=()=>search?.intent.outing||null;
  const byId=id=>search?.candidates.find(v=>v.id===id);
  // The current revision's observations for a venue, and failing those, the
  // last revision's, which stay labelled with their own date (§3.5).
  function summaryFor(venue){
    const all=search.observations.filter(o=>o.venueId===venue.id);
    const current=all.filter(o=>o.queryRevision===search.intent.revision);
    if(current.length)return combineObservations(current,{now:now()});
    if(!all.length)return null;
    const old=combineObservations(all,{now:now()});
    return {...old,status:old.slots.length?'available':old.status,slots:[],detail:`Previously observed for ${[...new Set(all.map(o=>displayDate(o.date)))].join(', ')} — recheck.`,stale:true};
  }
  // A phone's handoff follows the form as it is now; the extension's follows
  // the outing its observations were made for.
  const handoffsFor=venue=>{
    const o=inspects?outing():(liveOuting()||outing());
    return (venue.providers||[]).map(p=>({label:o?`Check on ${p.provider}`:`Open on ${p.provider}`,url:o?providerSearchURL(p.url,{date:o.preferredDate,partySize:o.preferredParty,time:o.preferredTime}):p.url}));
  };
  // The outing as the form has it now, so a phone's handoff links follow a
  // date change with no research and no submit (§10).
  function liveOuting(){try{return buildIntent(formValue(),{now:new Date(now())}).outing;}catch{return null;}}
  function render(){
    if(!search){$('results').hidden=true;collapse(false);return;}
    const intent=search.intent;
    $('summary-chips').replaceChildren(...summaryChips(summarizeIntent(intent)));
    $('summary-notes').textContent=[...intent.notes,search.clarification].filter(Boolean).join(' ');
    const sw=$('mode-switch');sw.hidden=!intent.text||search.choosing;sw.textContent=intent.mode==='named'?'Search as a description instead':'Search as a name instead';
    $('choice').hidden=!search.choosing;
    if(search.choosing)$('choices').replaceChildren(...LocationChoice(search.candidates.slice(0,3).map(v=>({id:v.id,name:v.name,address:v.address,neighborhood:v.neighborhood})),choose));
    $('results').hidden=search.choosing;
    collapse(true);
    if(search.choosing)return;
    ranked=rankVenues(search.candidates,intent,{now:now()});
    const shown=ranked.eligible.slice(0,Math.max(LIMITS.shown,ranked.eligible.filter(e=>search.checked.includes(e.venue.id)).length));
    const summaries=Object.fromEntries(shown.map(e=>[e.venue.id,summaryFor(e.venue)]));
    const groups=groupResults(shown,summaries,{now:now(),outing:outing()});
    const primaryTime=outing()?.preferredTime||'19:30';
    $('groups').replaceChildren(...groups.map(group=>ResultGroup(group.title,group.items.map(entry=>{
      const summary=summaries[entry.venue.id];
      if(summary?.slots)summary.slots=sortSlots(summary.slots,{preferredTime:primaryTime});
      return RestaurantResult(entry,{outing:outing(),summary,mobile:!inspects,handoffs:handoffsFor(entry.venue),userTab:!!userTabs[entry.venue.id],busy,now:now(),onOpen:slot=>openVenue(entry.venue,slot),onRecheck:()=>recheck(entry.venue)});
    }))));
    if(!shown.length)$('groups').replaceChildren(Note(ranked.unverified.length||ranked.excluded.length?'Nothing matched every requirement.':search.stage==='failed'?'':'No source-backed match was found. Try a clearer name or a broader request.'));
    const fold=(id,title,items)=>{$(id).hidden=!items.length;$(id).querySelector('summary').textContent=`${title} · ${items.length}`;$(`${id}-list`).replaceChildren(...items.map(FoldedResult));};
    fold('unverified','Could not verify',ranked.unverified);
    fold('excluded','Doesn’t match',ranked.excluded);
    const limited=[];
    if(shown.length<LIMITS.shown&&(ranked.unverified.length||search.unverified))limited.push(`${shown.length} of ${search.candidates.length} found match${shown.length===1?'es':''} every requirement.`);
    if(ranked.arbitrary&&!intent.outing)limited.push('Say what kind of dinner you want and the order will mean something.');
    $('limited').textContent=limited.join(' ');
    const remaining=inspects&&outing()?ranked.eligible.filter(e=>!search.checked.includes(e.venue.id)&&(e.venue.providers||[]).some(p=>adapterFor(p.provider).automatic)):[];
    $('more').hidden=busy||!remaining.length||visits>=LIMITS.runVisits;
    $('more').textContent=`Check ${remaining.length} remaining restaurant${remaining.length===1?'':'s'}`;
    $('continue').hidden=busy||!pendingJobs.length;
    $('retry').hidden=busy||search.stage!=='failed';
  }
  async function persist(){
    if(!history||!token||!search)return;
    try{await history.write(token,{id:search.id,identity:search.identity,intent:search.intent,candidates:search.candidates,observations:search.observations,checked:search.checked,clarification:search.clarification,locations:search.locations,unverified:search.unverified,researchedAt:search.researchedAt,stage:search.stage});}
    catch(e){note(`Results are shown but could not be kept on this device. ${e.message}`);}
  }

  // Research
  async function find(event){
    event?.preventDefault();if(busy)return;
    let intent;
    const form=formValue();
    try{
      const reuse=sameIdentity(form);
      intent=buildIntent(form,{now:new Date(now()),id:reuse?search.id:crypto.randomUUID(),revision:reuse?search.intent.revision+1:1,mode:modeOverride||(reuse?search.intent.mode:'')});
      if(!reuse){if(!online())throw Error('Reconnect to find restaurants. Saved results stay available.');const missing=await connectionNote();if(missing)throw Error(missing);}
      token=await credentials.get()||'';
      if(reuse){await edit(intent);return;}
    }catch(e){error(e.message);return;}
    const current=++generation;abort=new AbortController();error('');setBusy(true);status('Researching restaurants and their sources…','progress');
    const started={id:intent.id,identity:identityOf(form,intent.mode)};
    try{
      const data=await research(intent,{signal:abort.signal});
      const record={id:intent.id,identity:started.identity,intent,candidates:(data.candidates||[]).map(v=>venueRecord(v)),observations:[],checked:[],clarification:data.clarification||'',locations:data.locations||[],unverified:data.unverified||0,researchedAt:data.researchedAt||new Date(now()).toISOString(),stage:'complete',choosing:false};
      for(const v of record.candidates)v.reason=(data.candidates||[]).find(c=>c.id===v.id)?.reason||'';
      // A reply for a search that is no longer showing lands on its own record
      // if it has one, and never over what is on the screen; a search that was
      // stopped before it was ever saved is simply dropped (§3.5, R10).
      if(current!==generation){
        if(history&&token&&(await history.read(token).catch(()=>({searches:[]}))).searches.some(s=>s.id===record.id))await history.write(token,record).catch(()=>{});
        return;
      }
      search=record;visits=0;fallbacks={total:0,venues:{}};userTabs={};pendingJobs=[];
      if(intent.mode==='named')namedOutcome();
      status('');render();await persist();
      if(!search.choosing&&intent.outing&&inspects)await runChecks({initial:true});
    }catch(e){
      if(current!==generation)return;
      if(search)search.stage='failed';
      error(e.message);status('Research could not finish. Your search is preserved.','error');
      if(search)render();
    }finally{if(current===generation){setBusy(false);render();}}
  }
  // A named search resolves to one place or asks which (§3.3).
  function namedOutcome(){
    const c=search.candidates;
    if(c.length===1){search.intent.venueId=c[0].id;if(c[0].identity==='corrected')search.intent.notes=[...search.intent.notes,`Read as ${c[0].name}.`];return;}
    if(c.length>1)search.choosing=true;
  }
  async function choose(option){
    if(!search)return;
    search.intent.venueId=option.id;search.choosing=false;search.candidates=search.candidates.filter(v=>v.id===option.id);
    render();await persist();
    if(search.intent.outing&&inspects)await runChecks({initial:true});
  }
  // A changed outing rechecks availability; changed preferences rerank; the
  // facts already found are never researched again (§3.5, R09).
  async function edit(intent){
    const previous=search.intent;
    search.intent={...intent,venueId:previous.venueId};
    search.stage='complete';
    const outingChanged=JSON.stringify(previous.outing)!==JSON.stringify(intent.outing);
    if(outingChanged){search.checked=[];pendingJobs=[];}
    error('');status('');render();await persist();
    if(outingChanged&&intent.outing&&inspects&&!search.choosing)await runChecks({initial:true});
  }

  // Availability (§7.3): the first eligible restaurants on the first pass,
  // the rest on request, at most twelve pages and a minute per pass, two
  // pages at a time and one per site.
  async function runChecks({initial=false,venues=null}={}){
    if(!search||!inspects||!search.intent.outing)return;
    const eligible=rankVenues(search.candidates,search.intent,{now:now()}).eligible.map(e=>e.venue);
    const targets=venues||(initial?eligible.slice(0,search.intent.mode==='named'?1:LIMITS.autoChecks):eligible.filter(v=>!search.checked.includes(v.id)));
    const jobs=planChecks(targets,search.intent.outing,{searchId:search.id,queryRevision:search.intent.revision,timezone:search.intent.city.timezone,fresh:search.observations,now:now()});
    const room=Math.max(0,Math.min(LIMITS.initialVisits,LIMITS.runVisits-visits));
    const pass=jobs.slice(0,room);pendingJobs=jobs.slice(room);
    for(const v of targets)if(!search.checked.includes(v.id))search.checked.push(v.id);
    if(!pass.length){render();return;}
    const current=++generation;abort=new AbortController();setBusy(true);
    let done=0;const bar=$('progress');$('progress-row').hidden=false;setProgress(bar,0);
    try{
      await browser.closeAll();
      const {skipped}=await runBounded(pass,async job=>{
        if(current!==generation)return;
        await checkJob(job,current);
        done++;setProgress(bar,done/pass.length*100);
      },{concurrency:2,perDomain:1,signal:abort.signal,budgetMs:LIMITS.initialSeconds*1000,now});
      if(current===generation)pendingJobs=[...skipped,...pendingJobs];
    }finally{
      if(current===generation){
        $('progress-row').hidden=true;setBusy(false);
        const attention=search.observations.filter(o=>o.queryRevision===search.intent.revision&&['failed','login_required','challenge_required','choose_experience'].includes(o.status)).length;
        status(attention?`${attention} check${attention===1?'':'s'} need${attention===1?'s':''} attention on the provider.`:'',attention?'alert':'');
        render();await persist();
      }
    }
  }
  const replaceObservation=(job,next)=>{search.observations=[...search.observations.filter(o=>!(o.venueId===job.venueId&&o.provider===job.provider&&o.date===job.date&&o.partySize===job.partySize&&o.queryRevision===job.queryRevision)),next];};
  function fallbackFor(job){
    if(!generate||fallbacks.total>=LIMITS.fallbackPerRun||(fallbacks.venues[job.venueId]||0)>=LIMITS.fallbackPerVenue)return null;
    return async messages=>{fallbacks.total++;fallbacks.venues[job.venueId]=(fallbacks.venues[job.venueId]||0)+1;return generate(messages,{signal:abort.signal});};
  }
  async function checkJob(job,current){
    const venue=byId(job.venueId);if(!venue)return;
    const stamp=()=>new Date(now()).toISOString();
    replaceObservation(job,observation(job,{status:'checking',observedAt:stamp()}));render();
    let opened;
    try{
      visits++;
      opened=await browser.open(job,abort.signal);
      const result=await analyzeAvailability(opened.snapshot,job,venue,fallbackFor(job));
      if(current===generation)replaceObservation(job,result);
    }catch(e){
      if(current!==generation||e.name==='AbortError')replaceObservation(job,observation(job,{status:'cancelled',detail:'Stopped before this check completed.',observedAt:stamp()}));
      else replaceObservation(job,observation(job,{status:'failed',detail:e.message,nextAction:'open',reasonCode:'exception',observedAt:stamp()}));
      if(e.tabId&&!opened)await browser.close(e.tabId);
    }finally{if(opened)await browser.close(opened.tabId);}
    render();
  }
  // Opening a page is the owner's own tab: kept for a recheck, never closed
  // by the app. Old observations are marked before the handoff (§7.4).
  async function openVenue(venue,slot){
    const o=outing(),p=(venue.providers||[])[0];
    const url=slot?.slotURL||slot?.searchURL||(o&&p?providerSearchURL(p.url,{date:o.preferredDate,partySize:o.preferredParty,time:slot?.time||o.preferredTime}):p?.url||venue.officialURL);
    if(!url)return;
    error('');
    try{
      if(userTabs[venue.id]&&browser){try{await browser.focus(userTabs[venue.id]);return;}catch{delete userTabs[venue.id];}}
      const tabId=openTab?await openTab(url):null;
      if(tabId)userTabs[venue.id]=tabId;
      render();
    }catch(e){error(e.message);}
  }
  async function recheck(venue){
    const tabId=userTabs[venue.id];if(busy||!tabId||!browser||!outing())return;
    const o=outing(),p=(venue.providers||[])[0];
    const job=planChecks([venue],o,{searchId:search.id,queryRevision:search.intent.revision,timezone:search.intent.city.timezone})[0]||{id:`${venue.id}|${p?.provider}|${o.preferredDate}|${o.preferredParty}`,searchId:search.id,queryRevision:search.intent.revision,venueId:venue.id,venueName:venue.name,provider:p?.provider||'Restaurant website',url:p?.url||'',searchURL:p?providerSearchURL(p.url,{date:o.preferredDate,partySize:o.preferredParty,time:o.preferredTime}):'',date:o.preferredDate,partySize:o.preferredParty,timezone:search.intent.city.timezone,startTime:o.startTime,endTime:o.endTime,preferredTime:o.preferredTime,anchor:null};
    const current=++generation;abort=new AbortController();setBusy(true);error('');status(`Rechecking ${venue.name}…`,'progress');
    try{
      const tab=await browser.read(tabId,job.searchURL||job.url);
      const result=await analyzeAvailability(tab,{...job,searchURL:tab.url},venue,fallbackFor(job));
      if(current===generation){replaceObservation(job,result);status('');}
    }catch(e){if(current===generation){delete userTabs[venue.id];error(e.message);status('Recheck failed. Earlier observations are kept.','error');}}
    finally{if(current===generation){setBusy(false);render();await persist();}}
  }
  function stop(){
    generation++;abort?.abort();
    if(search){search.observations=search.observations.map(o=>o.status==='checking'?{...o,status:'cancelled',detail:'Stopped before this check completed.'}:o);}
    $('progress-row').hidden=true;setBusy(false);
    status('Stopped. Completed checks are kept. A research request already sent may still finish and be billed.','alert');
    render();persist();
  }

  // Wiring
  $('form').addEventListener('submit',find);
  $('stop').addEventListener('click',stop);
  $('edit').addEventListener('click',()=>{collapse(false);$('text').focus();});
  $('mode-switch').addEventListener('click',()=>{if(!search)return;modeOverride=search.intent.mode==='named'?'discovery':'named';search=null;find();});
  $('more').addEventListener('click',()=>runChecks({initial:false}));
  $('continue').addEventListener('click',()=>runChecks({venues:[...new Set(pendingJobs.map(j=>j.venueId))].map(byId).filter(Boolean)}));
  $('retry').addEventListener('click',()=>{if(search){search=null;find();}});
  for(const id of ['date','city','flex-dates','flex-party'])$(id).addEventListener('input',visibility);
  // New words or a new city need the network; a change to the outing or the
  // preferences of a search already here does not.
  for(const id of ['text','city'])$(id).addEventListener('input',()=>{if(!busy)setBusy(false);});
  for(const id of ['date','people','time','window','through','max','flex-dates','flex-party'])$(id).addEventListener('input',()=>{if(!inspects&&search&&!busy)render();});
  const connectionChanged=()=>{if(!loaded)return;setBusy(busy);if(!busy)connectionNote().then(text=>note(text)).catch(e=>note(e.message));};
  const page=globalThis.window||globalThis;
  page.addEventListener?.('online',connectionChanged);page.addEventListener?.('offline',connectionChanged);
  fill();
  return {
    // Reopening restores the last search as it was, observations and their
    // ages included, and starts nothing (§3.6).
    async open(){
      if(loaded)return;loaded=true;
      try{
        token=await credentials.get()||'';
        const last=history&&token?await history.latest(token):null;
        if(last){
          const intent=intentFromJSON(last.intent,{now:new Date(now())});
          search={...last,intent,candidates:last.candidates.map(v=>venueRecord(v)).map((v,i)=>({...v,reason:last.candidates[i].reason||''})),observations:last.observations||[],checked:last.checked||[],choosing:false,stage:last.stage||'complete'};
          fill(fromIntent(intent));render();
        }else if(defaults.city)fill();
      }catch(e){error(e.message);}
      try{note(await connectionNote());}catch(e){note(e.message);}
      setBusy(false);
    },
    stop,
    clear(){search=null;ranked=null;token='';render();fill();}
  };
}
