// The birthdays already in the owner's calendar, kept as reminders.
//
// Nobody types a birthday twice. They are in a calendar because somebody put
// them there — often Google itself, from the contacts — and Reminders is where
// they have to be to reach a phone in the morning. So this module reads them
// and writes the records, and the reading is the Worker's job rather than a
// device's for two reasons: the Google refresh token lives here and no page
// ever sees it, and the sweep has to happen whether or not the app is open.
//
// Three rules run through it:
//
//   - Nothing is invented. A birthday event's start date is the date of birth
//     only when its year is one somebody could have been born in; otherwise
//     the record carries the day and no age at all. `calendarBirthday` in
//     reminder-data.js is where that decision lives, shared with the app.
//   - Nothing is written twice. Every event this sweep has dealt with is
//     remembered by its own id, so a birthday deleted by hand stays deleted
//     rather than coming back next month.
//   - Nothing already there is touched. A birthday typed in by hand that the
//     calendar also holds is recognized and left exactly as it is.
import {encryptSettings,decryptSettings} from './ai-settings.js';
import {accessToken,storedAccount,noteCalendarRefused,forgetAccessToken,CALENDAR_SCOPE} from './drive.js';
import {calendarBirthday,sameBirthday,localDate,CALENDAR_SOURCE} from '../../chrome-sidebar/src/reminder-data.js';

const fail=(status,message)=>{throw {status,message};};
const now=()=>new Date().toISOString();
const RECORD_ID='calendar-birthdays';
const API='https://www.googleapis.com/calendar/v3';
// Once a month, because that is how often the answer changes: a birthday is
// added to a calendar when somebody is met, not when the clock ticks.
export const SCAN_EVERY_DAYS=30;
// A Worker's subrequest budget is the real limit on how wide a sweep can be,
// so it is counted directly rather than guessed at from a number of calendars.
// A sweep that runs out says so instead of quietly reporting a short answer.
const MAX_REQUESTS=32;
const MAX_CALENDARS=12;
const PAGE_SIZE=250;
// One sweep should never be able to fill the reminder list on its own.
const MAX_ADDED=200;
// Every event the sweep has settled, so a record deleted by hand is not
// written again next month. One entry per person, so this grows very slowly.
const MAX_HANDLED=2000;
const CONTACTS=/#contacts@group\.v\.calendar\.google\.com$/;

// --- What the last sweep did.
export async function storedScan(env){
  const row=await env.DB.prepare('SELECT value FROM calendar_scans WHERE id = ?').bind(RECORD_ID).first();
  if(!row)return null;
  try{return await decryptSettings(row.value,RECORD_ID,env);}catch{return null;}
}
const storeScan=async(env,value)=>env.DB.prepare('INSERT INTO calendar_scans (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
  .bind(RECORD_ID,await encryptSettings(value,RECORD_ID,env),now()).run();

// --- Google Calendar, read-only.
async function calendarFetch(env,request,fetcher,path,retried=false){
  const account=await storedAccount(env);
  if(!account?.refreshToken)fail(409,'Connect Google first, then look for birthdays.');
  if(!(account.scopes||[]).includes(CALENDAR_SCOPE))
    fail(409,'This Google connection cannot read your calendar yet. Connect Google again and approve reading your calendar.');
  const token=await accessToken(env,request,fetcher);
  let response;
  try{
    response=await fetcher(`${API}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  }catch{fail(504,'Google Calendar did not answer in time. Try again.');}
  // A held token can go stale early, and that is worth one fresh one before it
  // is read as the connection losing its permission — which is written down.
  if(response.status===401&&!retried){
    await response.body?.cancel();
    forgetAccessToken();
    return calendarFetch(env,request,fetcher,path,true);
  }
  if([401,403,429].includes(response.status)){
    // Three different refusals wear these codes and need three different
    // things done about them, and Google's own sentence says which this is.
    const detail=await response.json().catch(()=>({}));
    const reason=detail?.error?.errors?.[0]?.reason||'';
    const said=String(detail?.error?.message||'').slice(0,300);
    if(response.status===429||['rateLimitExceeded','userRateLimitExceeded','quotaExceeded','dailyLimitExceeded'].includes(reason))
      fail(429,'Google is limiting how fast its calendar can be read. Try again in a minute.');
    if(reason==='accessNotConfigured'||/has not been used in project|is disabled/i.test(said))
      fail(409,`The Google Calendar API is switched off in your Google Cloud project. Turn it on there, then look again. Google said: ${said}`);
    await noteCalendarRefused(env);
    fail(409,`Google would not allow reading your calendar. Connect Google again and approve reading your calendar.${said?` Google said: ${said}`:''}`);
  }
  if(!response.ok){await response.body?.cancel();fail(502,`Google Calendar is unavailable (${response.status}).`);}
  return response.json();
}

// --- Which events are birthdays.
//
// Google's own contact birthdays say so outright, and those are taken at their
// word. Anything else has to look like one from both sides: a date with no
// time that comes round every year, and a name that says birthday. A yearly
// all-day event alone is not enough — so is a wedding anniversary.
const yearly=event=>Array.isArray(event?.recurrence)
  &&event.recurrence.some(rule=>/^RRULE[:;]/i.test(String(rule))&&/FREQ=YEARLY/i.test(String(rule)));
export const namedBirthday=summary=>/\b(birthdays?|bday|b-day)\b/i.test(String(summary??''));
export const isBirthdayEvent=event=>!!event?.start?.date
  &&(event.eventType==='birthday'||(yearly(event)&&namedBirthday(event.summary)));

// A sweep's request budget, spent one call at a time. Everything that reads
// Google goes through here so nothing can quietly exceed it.
function budget(){
  let left=MAX_REQUESTS;
  return {get exhausted(){return left<=0;},spend(){if(left<=0)return false;left--;return true;}};
}

// Which calendars to read, and in which order. The order is the point: a
// subscription to every national holiday and two sports teams can easily push
// the calendar that holds nothing but birthdays past whatever cap the request
// budget sets, and losing that one loses almost everything worth finding. So
// the birthday calendar goes first, the owner's own calendar next, and the
// rest in whatever order Google gives them.
export const calendarOrder=items=>[...items].sort((a,b)=>rank(a)-rank(b)).slice(0,MAX_CALENDARS);
const rank=calendar=>CONTACTS.test(String(calendar?.id||''))?0:calendar?.primary?1:2;
async function calendars(env,request,fetcher,spend){
  if(!spend.spend())return [];
  const list=await calendarFetch(env,request,fetcher,
    `/users/me/calendarList?${new URLSearchParams({maxResults:'250',minAccessRole:'reader',fields:'items(id,summary,primary)'})}`);
  return calendarOrder(Array.isArray(list.items)?list.items:[]);
}

// One calendar's birthdays. The free-text search is what keeps a calendar of
// ten thousand meetings down to one request; a calendar that holds nothing but
// birthdays is read without it, because Google writes those titles in the
// owner's own language and "birthday" is not a word in all of them.
async function calendarBirthdays(env,request,fetcher,spend,calendar){
  const events=[];
  // A calendar that holds nothing but birthdays is read whole; everything else
  // is searched, because a calendar of ten thousand meetings cannot be.
  const contacts=CONTACTS.test(String(calendar.id||''));
  for(const query of contacts?[{}]:[{q:'birthday'}]){
    let pageToken='';
    do{
      if(!spend.spend())return {events,short:true};
      const params=new URLSearchParams({maxResults:String(PAGE_SIZE),singleEvents:'false',showDeleted:'false',
        fields:'items(id,summary,eventType,recurrence,start/date),nextPageToken',...query});
      if(pageToken)params.set('pageToken',pageToken);
      let page;
      try{
        page=await calendarFetch(env,request,fetcher,`/calendars/${encodeURIComponent(calendar.id)}/events?${params}`);
      }catch(error){
        // One calendar the owner can list but not read is that calendar's
        // problem, not the sweep's. A refusal about the connection itself, or
        // about reading too fast, is everyone's and stops here.
        if([409,429,504].includes(error?.status))throw error;
        return {events,short:false};
      }
      for(const event of Array.isArray(page.items)?page.items:[])if(isBirthdayEvent(event))events.push(event);
      pageToken=typeof page.nextPageToken==='string'?page.nextPageToken:'';
    }while(pageToken);
  }
  return {events,short:false};
}

// --- The records.
const reminderRows=async env=>{
  const {results}=await env.DB.prepare('SELECT id, value FROM reminder_records').all();
  return Promise.all(results.map(async row=>({...await decryptSettings(row.value,`reminders:${row.id}`,env),id:row.id})));
};
async function addReminder(env,record){
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO reminder_records (id, value, revision, updated_at) VALUES (?, ?, ?, ?)')
    .bind(id,await encryptSettings(record,`reminders:${id}`,env),crypto.randomUUID(),now()).run();
  return {...record,id};
}

// --- The sweep.
//
// What it decides, per event, in order: one already settled is left alone; one
// this app already imported is recognized by its own id; one the owner typed in
// by hand is recognized by its day and its name and left untouched; and only
// what is left becomes a new record.
export async function scanBirthdays(env,{request,fetcher=fetch,now:when=new Date(),restart=false}={}){
  const today=localDate(when);
  const previous=await storedScan(env);
  const handled=new Set(restart?[]:(previous?.handled||[]));
  const spend=budget();
  const list=await calendars(env,request,fetcher,spend);
  const records=await reminderRows(env);
  const added=[],matched=[],saved=[];
  let scanned=0,short=spend.exhausted;
  for(const calendar of list){
    const result=await calendarBirthdays(env,request,fetcher,spend,calendar);
    short=short||result.short;
    scanned+=result.events.length;
    for(const event of result.events){
      if(handled.has(event.id))continue;
      // An event this app cannot make a record of — no name, or a start date
      // that is not one — is one event's problem and not the sweep's.
      let candidate=null;
      try{candidate=calendarBirthday({id:event.id,summary:event.summary,start:event.start.date},{today});}catch{candidate=null;}
      if(!candidate)continue;
      handled.add(event.id);
      const already=records.find(record=>record.source===CALENDAR_SOURCE&&record.sourceId===event.id);
      if(already){saved.push(already.title);continue;}
      const byHand=records.find(record=>sameBirthday(record,candidate));
      if(byHand){matched.push(byHand.title);continue;}
      if(added.length>=MAX_ADDED){short=true;handled.delete(event.id);continue;}
      records.push(await addReminder(env,candidate));
      added.push(candidate.title);
    }
    if(spend.exhausted){short=true;break;}
  }
  const scan={ranAt:now(),ranOn:today,added:added.length,matched:matched.length,saved:saved.length,
    scanned,calendars:list.length,short,
    handled:[...handled].slice(-MAX_HANDLED)};
  await storeScan(env,scan);
  return {...report(scan),addedTitles:added.slice(0,20)};
}

// What the app is told. The remembered event ids stay here: they are this
// module's bookkeeping and say nothing a person needs.
const report=scan=>scan?{ranAt:scan.ranAt,ranOn:scan.ranOn,added:scan.added,matched:scan.matched,
  saved:scan.saved,scanned:scan.scanned,calendars:scan.calendars,short:!!scan.short}:null;

export const dueForScan=(scan,when=new Date())=>!scan?.ranAt
  ||Date.parse(scan.ranAt)<when.getTime()-SCAN_EVERY_DAYS*86400000;

// The hourly cron's second job. It is deliberately quiet: no connection, no
// permission, or not a month yet, and it does nothing at all rather than
// reporting a problem nobody asked about. A failure here must never reach the
// morning notification, which is the cron's first job and the one that matters.
export async function sweepBirthdays(env,{fetcher=fetch,now:when=new Date(),log=()=>{}}={}){
  const account=await storedAccount(env);
  if(!account?.refreshToken||!(account.scopes||[]).includes(CALENDAR_SCOPE)||account.calendarRefused)return {skipped:'connection'};
  if(!dueForScan(await storedScan(env),when))return {skipped:'not due'};
  try{
    // No request arrives on a cron, and the reading does not need one: it is
    // carried only so the token renewal reads its own configuration the same
    // way it does on a route.
    const result=await scanBirthdays(env,{request:new Request('https://tools.invalid/v1/calendar/birthdays'),fetcher,now:when});
    log(`calendar birthdays: ${result.added} added, ${result.matched} already kept by hand`);
    return result;
  }catch(error){
    log(`calendar birthday sweep failed: ${error?.message||error}`);
    return {failed:error?.message||'unknown'};
  }
}

// --- The routes.
export async function calendarRoutes(request,env,readValue,json,fetcher=fetch){
  const path=new URL(request.url).pathname,method=request.method;

  // What the Reminders screen needs to decide what to offer: whether this
  // connection can read a calendar at all, and what the last sweep found.
  if(path==='/v1/calendar/birthdays'&&method==='GET'){
    const account=await storedAccount(env);
    return json({
      google:{connected:!!account?.refreshToken,
        calendar:(account?.scopes||[]).includes(CALENDAR_SCOPE)&&!account?.calendarRefused},
      scan:report(await storedScan(env)),everyDays:SCAN_EVERY_DAYS});
  }

  // The same sweep the cron runs, asked for now. `restart` forgets which
  // events have already been settled, which is the only way to bring back a
  // birthday that was imported and then deleted.
  if(path==='/v1/calendar/birthdays/scan'&&method==='POST'){
    const input=JSON.parse(await readValue(request));
    const result=await scanBirthdays(env,{request,fetcher,restart:!!input.restart});
    const account=await storedAccount(env);
    return json({google:{connected:!!account?.refreshToken,
      calendar:(account?.scopes||[]).includes(CALENDAR_SCOPE)&&!account?.calendarRefused},
      scan:report(await storedScan(env)),everyDays:SCAN_EVERY_DAYS,added:result.addedTitles});
  }

  fail(404,'Unknown calendar request.');
}
