import {RestaurantWorkspace,MobileRestaurantWorkspace,summaryChips,LocationChoice,RestaurantResult,ResultGroup,FoldedResult,timeChoices,windowChoices,Choices} from './components/restaurant-views.js';
import {setStatus,setProgress,Note} from './components/ui.js';
import {buildIntent,interpretRequest,summarizeIntent,intentFromJSON,LIMITS,dateIn,timeIn,displayDate,displayTime,windowLabel,resolveCity,DEFAULT_WINDOW,venue as venueRecord,SCHEMA_VERSION} from './restaurant-data.js';
import {rankVenues,groupResults,sortSlots} from './restaurant-ranking.js';
import {planChecks,runBounded,analyzeAvailability,observation,combineObservations,isStale,adapterFor} from './reservation-availability.js';
import {providerSearchURL} from './restaurant-search.js';
// The restaurant search, shared by the extension page and the phone
// (docs/RESTAURANT_SEARCH_SPEC.md §3, §4, §11). The host supplies what differs:
// how the words are read and research requested, whether booking pages can be
// inspected, how a page is opened, and where the device keeps its history.
// Everything about what a search means, what repeats after an edit, and what a
// result says is decided here once.
const fields=['text','city','date','people','time','window','flex-dates','through','flex-party','max','neighborhood','spend','dietary','format','travel'];
// The controls the words can set, and what each is called when a hand-set
// value is kept over what the words said.
const WORDED={city:'City',date:'Date',through:'Last date','flex-dates':'',people:'People',max:'Largest party','flex-party':'',time:'Time',window:'Window'};
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
export function mountRestaurants(root,{host='chrome',credentials,read=null,research,browser=null,openTab=null,generate=null,history,defaults={},online=()=>globalThis.navigator?.onLine!==false,connectionNote=async()=>'',now=()=>Date.now()}){
  root.replaceChildren(host==='mobile'?MobileRestaurantWorkspace():RestaurantWorkspace());
  const $=name=>root.querySelector(`#restaurant-${name}`);
  const mobile=host==='mobile',inspects=!!browser;
  let search=null,pending=null,ranked=null,busy=false,generation=0,abort=null,visits=0,fallbacks={total:0,venues:{}},userTabs={},pendingJobs=[],loaded=false,token='';
  // The last words read, what they said about each control, and the controls
  // the owner has set by hand since. Words already read are not read again;
  // `unread` is words whose reading failed, which go ahead as typed.
  let reading=null,unread='',override={text:'',mode:''};
  const handSet=new Set();
  const status=(text,tone='')=>{setStatus($('status'),text,tone);$('status').hidden=!text;actionsRow();};
  const error=text=>{setStatus($('error'),text,'error');$('error').hidden=!text;actionsRow();};
  const note=text=>{setStatus($('connection-status'),text,'');$('connection-status').hidden=!text;actionsRow();};
  const wordsFor=text=>reading&&reading.text===clean(text)?reading:null;
  const overrideFor=text=>override.text===clean(text)?override.mode:'';

  // The form
  function visibility(){
    const dated=!!$('date').value;
    $('flex-row').hidden=!dated;
    $('through-field').hidden=!dated||!$('flex-dates').checked;
    $('max-field').hidden=!dated||!$('flex-party').checked;
    $('nyc').hidden=!/new york|nyc|manhattan|^ny$/i.test($('city').value.trim());
    // Until new words are read, the controls still hold the last reading, so
    // whether this finds a table is not known yet.
    const form=formValue();
    if(!busy)$('find').textContent=search?.candidates?.length&&sameIdentity(form)?(dated?'Check availability':'Update results'):dated&&(!read||wordsFor(form.text))?'Find a table':'Find restaurants';
    actionsRow();
  }
  function formValue(){
    const words=wordsFor($('text').value);
    return {text:$('text').value,...(words?{request:words.request,name:words.name}:{}),city:$('city').value,date:$('date').value,endDate:$('through').value,flexibleDates:$('flex-dates').checked,people:$('people').value,maxPeople:$('max').value,flexibleParty:$('flex-party').checked,time:$('time').value,window:$('window').value,
      neighborhood:$('neighborhood').value,maxSpend:$('spend').value,dietary:$('dietary').value,format:$('format').value,includeLongTravel:$('travel').checked};
  }
  // A time or a window the words asked for is offered as a choice even when
  // it is not one of the usual ones, so the control shows exactly what will
  // be checked.
  function setControl(id,value){
    const control=$(id);
    if(control.type==='checkbox'){control.checked=!!value;return;}
    if(id==='time')control.replaceChildren(...Choices(timeChoices(value)));
    if(id==='window')control.replaceChildren(...Choices(windowChoices(value)));
    control.value=String(value);
  }
  function fill(value={}){
    const v={text:'',city:defaults.city||'New York City',date:'',endDate:'',flexibleDates:false,people:2,maxPeople:'',flexibleParty:false,time:'19:30',window:String(DEFAULT_WINDOW),neighborhood:defaults.neighborhood||'',maxSpend:'',dietary:'',format:'',includeLongTravel:!!defaults.includeLongTravel,...value};
    $('text').value=v.text;$('city').value=v.city;$('date').value=v.date;$('through').value=v.endDate;$('flex-dates').checked=!!v.flexibleDates;$('people').value=v.people;$('max').value=v.maxPeople;$('flex-party').checked=!!v.flexibleParty;
    setControl('time',v.time);setControl('window',v.window);$('neighborhood').value=v.neighborhood;$('spend').value=v.maxSpend;$('dietary').value=v.dietary;$('format').value=v.format;$('travel').checked=!!v.includeLongTravel;
    for(const id of ['date','through'])$(id).min=dateIn('',new Date(now()));
    $('text').required=true;
    visibility();
  }
  const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
  const fromIntent=intent=>({text:intent.text,city:intent.city.name,date:intent.outing?.preferredDate||'',endDate:intent.outing?.dates.at(-1)||'',flexibleDates:!!intent.outing&&intent.outing.dates.length>1,people:intent.outing?.preferredParty||2,maxPeople:intent.outing?.partySizes.at(-1)||'',flexibleParty:!!intent.outing&&intent.outing.partySizes.length>1,time:intent.outing?.preferredTime||'19:30',
    // The wider side, because a window that runs into midnight is cut short on one side only.
    window:intent.outing?String(Math.min(180,Math.max(minutes(intent.outing.endTime)-minutes(intent.outing.preferredTime),minutes(intent.outing.preferredTime)-minutes(intent.outing.startTime)))):String(DEFAULT_WINDOW),
    // Only a switch the owner threw comes back on: an area the words named set
    // the standing exclusions aside for that search, not for the next one.
    includeLongTravel:!!intent.includeLongTravel&&!interpretRequest(intent.request||intent.text,{city:intent.city.name}).includeLongTravel});

  // The words, read (§3.2). What they say about the day, the hour, the window,
  // the party and the city goes into those controls, and a control they say
  // nothing about goes back to its default, because the words are what it
  // follows. A control the owner set by hand stands over the words until the
  // words about it change: then the newer statement wins.
  function controlsFrom(r){
    const values={date:r.date||'',through:r.endDate||'','flex-dates':!!r.endDate,people:String(r.people||2),max:r.maxPeople?String(r.maxPeople):'','flex-party':!!r.maxPeople,time:r.time||'19:30',window:r.time&&r.window!==null&&r.window!==undefined?String(r.window):String(DEFAULT_WINDOW)};
    if(r.city)values.city=resolveCity(r.city).name;
    return values;
  }
  const saidOf=r=>({city:!!r.city,date:!!r.date,through:!!r.endDate,'flex-dates':!!r.endDate,people:!!r.people,max:!!r.maxPeople,'flex-party':!!r.maxPeople,time:!!r.time,window:!!r.time&&r.window!==null&&r.window!==undefined});
  function applyReading(text,r){
    const next=controlsFrom(r),before=reading?.controls||null;
    for(const [id,value] of Object.entries(next)){
      if(handSet.has(id)&&(!before||String(before[id])===String(value)))continue;
      setControl(id,value);handSet.delete(id);
    }
    reading={text,request:r.request,mode:r.mode,name:r.name||'',controls:next,said:saidOf(r)};
    unread='';
    visibility();
  }
  const describeControl=(id,value)=>id==='date'||id==='through'?displayDate(value):id==='time'?displayTime(value):id==='window'?windowLabel(value):String(value);
  // Where a hand-set control kept its value over what the words said, the
  // summary says so rather than choosing silently (§3.2).
  function resolved(form){
    const words=wordsFor(form.text);
    if(!words?.controls)return [];
    return Object.entries(WORDED).filter(([id,label])=>label&&handSet.has(id)&&words.said[id]).flatMap(([id,label])=>{
      const stated=words.controls[id],current=$(id).value;
      return String(stated)===String(current)?[]:[`${label} taken from the form (the words said ${describeControl(id,stated)}).`];
    });
  }
  // New words are read before anything else, and words already read are not
  // read again. Words whose reading failed go ahead as typed on the next press,
  // with the controls as they stand: the manual path when no reading can be
  // had (UI-20).
  async function understand(){
    const text=clean($('text').value);
    if(!read||!text||wordsFor(text)||unread===text)return true;
    if(!online()){error('Reconnect to find restaurants. Saved results stay available.');return false;}
    // Research needs the same connection, so its absence is said as itself
    // rather than as a reading that failed.
    try{const missing=await connectionNote();if(missing){error(missing);return false;}}catch(e){error(e.message);return false;}
    const current=++generation;abort=new AbortController();error('');setBusy(true);status('Reading the request…','progress');
    try{
      const place=resolveCity($('city').value),at=new Date(now());
      const r=await read({text,city:place.name,today:dateIn(place.timezone,at),now:timeIn(place.timezone,at)},{signal:abort.signal});
      if(current!==generation)return false;
      applyReading(text,r);status('');
      return true;
    }catch(e){
      if(current!==generation)return false;
      unread=text;$('details').open=true;
      status('');error(`${e.message} Set the date, people and time under Details, then search again.`);
      return false;
    }finally{if(current===generation)setBusy(false);}
  }
  // The research identity: the words about the place, the city and the mode.
  // The day, the hour and the party are not part of it, so saying Sunday
  // instead of Saturday rechecks the same restaurants (§3.5).
  const identityOf=(form,mode='')=>JSON.stringify([clean(wordsFor(form.text)?.request??form.text).toLowerCase(),form.city.trim().toLowerCase(),mode||overrideFor(form.text)]);
  const sameIdentity=form=>!!search&&search.identity===identityOf(form,search.intent.mode);
  // The action row stands while the form is open, and while work runs so it
  // can be stopped; once results are in and nothing runs, the summary's Edit
  // search is the way back in, and the folded search takes no room at all
  // unless it has something to say.
  function actionsRow(){
    const folded=$('form').classList.contains('is-collapsed')&&!busy;
    $('actions').hidden=folded;
    $('search-section').hidden=folded&&['status','error','connection-status'].every(id=>$(id).hidden);
  }
  function setBusy(value){
    busy=value;
    for(const id of fields)$(id).disabled=value;
    $('find').disabled=value||(!online()&&!sameIdentity(formValue()));
    $('stop').hidden=!value;
    $('more').disabled=value;$('continue').disabled=value;$('retry').disabled=value;
    $('edit').hidden=value;
    if(value)$('find').textContent='Working…';else visibility();
    actionsRow();
  }
  function collapse(value){$('form').classList.toggle('is-collapsed',value);$('summary').hidden=!value;actionsRow();}

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
  // What was understood is shown as soon as it is known: while research for
  // new words runs, the summary is theirs and the previous results are put
  // away, to come back if the research fails or is stopped (§3.2).
  function summarize(intent,clarification=''){
    $('summary-chips').replaceChildren(...summaryChips(summarizeIntent(intent)));
    $('summary-notes').textContent=[...intent.notes,clarification].filter(Boolean).join(' ');
  }
  function render(){
    const sw=$('mode-switch');
    if(pending){
      summarize(pending);sw.hidden=true;
      $('choice').hidden=true;$('results').hidden=true;collapse(true);
      return;
    }
    if(!search){$('results').hidden=true;collapse(false);return;}
    const intent=search.intent;
    summarize(intent,search.clarification);
    sw.hidden=busy||!intent.text||search.choosing;sw.textContent=intent.mode==='named'?'Search as a description instead':'Search as a name instead';
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
    if(!await understand())return;
    let intent;
    const form=formValue();
    const words=wordsFor(form.text);
    try{
      const reuse=sameIdentity(form);
      intent=buildIntent(form,{now:new Date(now()),id:reuse?search.id:crypto.randomUUID(),revision:reuse?search.intent.revision+1:1,mode:overrideFor(form.text)||words?.mode||(reuse?search.intent.mode:''),notes:resolved(form)});
      if(!reuse){if(!online())throw Error('Reconnect to find restaurants. Saved results stay available.');const missing=await connectionNote();if(missing)throw Error(missing);}
      token=await credentials.get()||'';
      if(reuse){await edit(intent);return;}
    }catch(e){error(e.message);return;}
    const current=++generation;abort=new AbortController();error('');setBusy(true);status('Researching restaurants and their sources…','progress');
    pending=intent;render();
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
      search=record;pending=null;visits=0;fallbacks={total:0,venues:{}};userTabs={};pendingJobs=[];
      if(intent.mode==='named')namedOutcome();
      status('');render();await persist();
      if(!search.choosing&&intent.outing&&inspects)await runChecks({initial:true});
    }catch(e){
      if(current!==generation)return;
      pending=null;
      if(search)search.stage='failed';
      error(e.message);status('Research could not finish. Your search is preserved.','error');
      if(search)render();
    }finally{if(current===generation){pending=null;setBusy(false);render();}}
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
    generation++;abort?.abort();pending=null;
    if(search){search.observations=search.observations.map(o=>o.status==='checking'?{...o,status:'cancelled',detail:'Stopped before this check completed.'}:o);}
    $('progress-row').hidden=true;setBusy(false);
    status('Stopped. Completed checks are kept. A research request already sent may still finish and be billed.','alert');
    render();persist();
  }

  // Wiring
  // The words are checked by buildIntent, which says what is wrong in words
  // beside the form; a browser's own bubble cannot point into a closed Details.
  $('form').noValidate=true;
  $('text').enterKeyHint='search';
  $('form').addEventListener('submit',find);
  // Enter searches, as in any search box; Shift+Enter starts a new line.
  $('text').addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.shiftKey||event.isComposing)return;
    event.preventDefault();
    if($('form').requestSubmit)$('form').requestSubmit();else find();
  });
  $('stop').addEventListener('click',stop);
  $('edit').addEventListener('click',()=>{collapse(false);$('text').focus();});
  $('mode-switch').addEventListener('click',()=>{if(!search)return;override={text:clean(search.intent.text),mode:search.intent.mode==='named'?'discovery':'named'};search=null;find();});
  $('more').addEventListener('click',()=>runChecks({initial:false}));
  $('continue').addEventListener('click',()=>runChecks({venues:[...new Set(pendingJobs.map(j=>j.venueId))].map(byId).filter(Boolean)}));
  $('retry').addEventListener('click',()=>{if(search){search=null;find();}});
  for(const id of Object.keys(WORDED))$(id).addEventListener('input',()=>handSet.add(id));
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
    // ages included, and starts nothing (§3.6). Its words count as read.
    async open(){
      if(loaded)return;loaded=true;
      try{
        token=await credentials.get()||'';
        const last=history&&token?await history.latest(token):null;
        if(last){
          const intent=intentFromJSON(last.intent,{now:new Date(now())});
          search={...last,intent,candidates:last.candidates.map(v=>venueRecord(v)).map((v,i)=>({...v,reason:last.candidates[i].reason||''})),observations:last.observations||[],checked:last.checked||[],choosing:false,stage:last.stage||'complete'};
          fill(fromIntent(intent));
          reading={text:clean(intent.text),request:intent.request||intent.text,mode:intent.mode,name:intent.name||'',controls:null,said:{}};
          render();
        }else if(defaults.city)fill();
      }catch(e){error(e.message);}
      try{note(await connectionNote());}catch(e){note(e.message);}
      setBusy(false);
    },
    stop,
    clear(){search=null;pending=null;ranked=null;token='';reading=null;unread='';override={text:'',mode:''};handSet.clear();render();fill();}
  };
}
