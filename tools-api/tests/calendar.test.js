import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {scanBirthdays,dueForScan,isBirthdayEvent,calendarOrder,SCAN_EVERY_DAYS} from '../src/calendar.js';
import {CALENDAR_SCOPE,DRIVE_SCOPE} from '../src/drive.js';
import {encryptSettings,decryptSettings} from '../src/ai-settings.js';
import {normalizeReminder} from '../../chrome-sidebar/src/reminder-data.js';

const token='synthetic-token-at-least-32-characters';

function environment(){
  const sql=new DatabaseSync(':memory:');
  for(const schema of ['schema.sql','drive-schema.sql','reminders-schema.sql','calendar-schema.sql'])
    sql.exec(readFileSync(new URL(`../${schema}`,import.meta.url),'utf8'));
  return {sql,env:{API_TOKEN:token,SETTINGS_ENCRYPTION_KEY:'12'.repeat(32),
    GOOGLE_CLIENT_ID:'synthetic-client-id',GOOGLE_CLIENT_SECRET:'synthetic-client-secret',
    DB:{prepare(query){
      const statement=sql.prepare(query);let args=[];
      return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
        async all(){return {results:statement.all(...args)};},async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}};
    }}}};
}
const call=(env,url,method='GET',value)=>worker.fetch(new Request(`https://example.com${url}`,{
  method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:value===undefined?undefined:JSON.stringify(value)}),env);

const connectGoogle=async(env,scopes=[DRIVE_SCOPE,CALENDAR_SCOPE],extra={})=>env.DB
  .prepare('INSERT INTO drive_accounts (id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value')
  .bind('google-drive',await encryptSettings({refreshToken:'synthetic-refresh-token',email:'owner@example.com',
    connectedAt:new Date().toISOString(),scopes,...extra},'google-drive',env),new Date().toISOString()).run();

const saveReminder=async(env,input)=>{
  const id=crypto.randomUUID(),record=normalizeReminder(input);
  await env.DB.prepare('INSERT INTO reminder_records (id, value, revision, updated_at) VALUES (?, ?, ?, ?)')
    .bind(id,await encryptSettings(record,`reminders:${id}`,env),crypto.randomUUID(),new Date().toISOString()).run();
  return id;
};
const savedReminders=async env=>{
  const {results}=await env.DB.prepare('SELECT id, value FROM reminder_records').all();
  return Promise.all(results.map(async row=>({...await decryptSettings(row.value,`reminders:${row.id}`,env),id:row.id})));
};

// Google Calendar answering only what this module actually asks it, and
// recording what it was asked.
function fakeGoogle({calendars,events,refusal}={}){
  const asked=[];
  const fetcher=async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url);
    asked.push(`${url.pathname}${url.search?`?${url.searchParams.get('q')??''}`:''}`);
    if(url.origin==='https://oauth2.googleapis.com')
      return Response.json({access_token:'synthetic-access',expires_in:3600});
    if(refusal)return Response.json({error:{code:refusal.status,message:refusal.message,errors:[{reason:refusal.reason}]}},{status:refusal.status});
    if(init.headers?.Authorization!=='Bearer synthetic-access')return Response.json({error:{message:'bad token'}},{status:401});
    if(url.pathname.endsWith('/users/me/calendarList'))return Response.json({items:calendars});
    const id=decodeURIComponent(url.pathname.split('/')[4]);
    const search=url.searchParams.get('q');
    const items=(events[id]||[]).filter(event=>!search||JSON.stringify(event).toLowerCase().includes(search));
    return Response.json({items});
  };
  return {fetcher,asked};
}

const CALENDARS=[{id:'owner@example.com',summary:'Eric',primary:true},
  {id:'addressbook#contacts@group.v.calendar.google.com',summary:'Birthdays'}];
const EVENTS={
  'owner@example.com':[
    {id:'typed-1',summary:'Derek’s birthday',eventType:'default',recurrence:['RRULE:FREQ=YEARLY'],start:{date:'1985-03-04'}},
    {id:'meeting',summary:'Board meeting',eventType:'default',start:{date:'2026-10-01'}},
    // A yearly all-day event that is not a birthday, which is exactly the
    // thing a looser rule would sweep up.
    {id:'anniversary',summary:'Wedding anniversary',eventType:'default',recurrence:['RRULE:FREQ=YEARLY'],start:{date:'2011-06-18'}},
    // A birthday in name only: no recurrence, so it is one day in 2026 rather
    // than a date that comes round.
    {id:'party',summary:'Birthday party at the Smiths',eventType:'default',start:{date:'2026-10-11'}}
  ],
  'addressbook#contacts@group.v.calendar.google.com':[
    {id:'contact-1',summary:'Ashley Bell',eventType:'birthday',recurrence:['RRULE:FREQ=YEARLY'],start:{date:'1990-07-22'}},
    {id:'contact-2',summary:'Celeste',eventType:'birthday',recurrence:['RRULE:FREQ=YEARLY'],start:{date:'2026-11-02'}}
  ]
};

test('only a date that comes round every year and says birthday is one',()=>{
  const [derek,meeting,anniversary,party]=EVENTS['owner@example.com'];
  assert.equal(isBirthdayEvent(derek),true);
  assert.equal(isBirthdayEvent(meeting),false);
  assert.equal(isBirthdayEvent(anniversary),false,'an anniversary repeats yearly too');
  assert.equal(isBirthdayEvent(party),false,'one party is not a birthday that comes round');
  assert.equal(isBirthdayEvent(EVENTS['addressbook#contacts@group.v.calendar.google.com'][0]),true,'Google’s own say so');
  // A birthday with a time on it is an appointment about a birthday.
  assert.equal(isBirthdayEvent({summary:'Lunch for Ann’s birthday',recurrence:['RRULE:FREQ=YEARLY'],start:{dateTime:'2026-10-11T12:00:00Z'}}),false);
});

test('a sweep writes each birthday once, leaves what was typed by hand alone, and does not bring back a deleted one',async()=>{
  const {env}=environment();
  await connectGoogle(env);
  // Already there, typed by hand, with a year the owner never knew.
  const byHand=await saveReminder(env,{kind:'Birthday',title:'Derek',date:'2022-03-04',every:12,notes:'his own words'});
  const google=fakeGoogle({calendars:CALENDARS,events:EVENTS});
  const first=await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-09-20T12:00:00Z')});

  assert.equal(first.added,2,'the two contact birthdays');
  assert.equal(first.matched,1,'Derek was already written down');
  assert.deepEqual(first.addedTitles.sort(),['Ashley Bell','Celeste']);
  const after=await savedReminders(env);
  assert.equal(after.length,3);
  // The hand-written record is untouched — same notes, same anchor date.
  const derek=after.find(record=>record.id===byHand);
  assert.equal(derek.notes,'his own words');
  assert.equal(derek.date,'2022-03-04');
  assert.equal(derek.source,'');
  // The imported ones carry the year only where the calendar knew it.
  const ashley=after.find(record=>record.title==='Ashley Bell');
  assert.equal(ashley.since,'1990');
  assert.equal(ashley.sourceId,'contact-1');
  assert.equal(after.find(record=>record.title==='Celeste').since,'','a placeholder year is not an age');

  // Running it again adds nothing and changes nothing: every event it saw last
  // month is one it has already settled.
  const second=await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-10-21T12:00:00Z')});
  assert.equal(second.added,0);
  assert.equal(second.scanned,3,'it still reads them, it just has nothing to do about them');
  assert.equal((await savedReminders(env)).length,3);

  // Starting over forgets that bookkeeping, and the records themselves are
  // still enough: each one is recognized by the event id it was written from.
  const again=await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-10-22T12:00:00Z'),restart:true});
  assert.equal(again.added,0,'a record already written from an event is never written twice');
  assert.equal(again.saved,2);
  assert.equal(again.matched,1);
  assert.equal((await savedReminders(env)).length,3);

  // A birthday deleted by hand stays deleted.
  await env.DB.prepare('DELETE FROM reminder_records WHERE id = ?').bind(ashley.id).run();
  const third=await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-11-21T12:00:00Z')});
  assert.equal(third.added,0,'the sweep remembers it already dealt with that event');
  assert.equal((await savedReminders(env)).length,2);

  // Starting over is the way back to it, and the only way.
  const restarted=await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-11-22T12:00:00Z'),restart:true});
  assert.equal(restarted.added,1);
  assert.deepEqual(restarted.addedTitles,['Ashley Bell']);
});

test('the calendar that holds only birthdays is read whole, and every other one is searched',async()=>{
  const {env}=environment();
  await connectGoogle(env);
  const google=fakeGoogle({calendars:CALENDARS,events:EVENTS});
  await scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-09-20T12:00:00Z')});
  const reads=google.asked.filter(path=>path.includes('/events'));
  assert.equal(reads.length,2,'one request per calendar');
  assert.ok(reads.some(path=>path.includes('owner%40example.com/events?birthday')),'a working calendar is searched, not read whole');
  assert.ok(reads.some(path=>path.endsWith('/events?')),'the contacts calendar is read whole, because Google names those days in the owner’s own language');
});

test('a connection that cannot read a calendar says so, and the sweep waits a month between runs',async()=>{
  const {env}=environment();
  // Connected for Drive only.
  await connectGoogle(env,[DRIVE_SCOPE]);
  const status=await (await call(env,'/v1/calendar/birthdays')).json();
  assert.deepEqual(status.google,{connected:true,calendar:false});
  assert.equal(status.scan,null);
  assert.equal(status.everyDays,SCAN_EVERY_DAYS);
  const refused=await call(env,'/v1/calendar/birthdays/scan','POST',{});
  assert.equal(refused.status,409);
  assert.match((await refused.json()).error,/approve reading your calendar/);

  // And the monthly gate is a month, measured from when it last ran.
  assert.equal(dueForScan(null),true,'never run is always due');
  const ranAt=new Date('2026-09-20T12:00:00Z').toISOString();
  assert.equal(dueForScan({ranAt},new Date('2026-10-10T12:00:00Z')),false);
  assert.equal(dueForScan({ranAt},new Date('2026-10-21T12:00:00Z')),true);
});

test('Google refusing the calendar is written down, so the screen stops offering a sweep',async()=>{
  const {env}=environment();
  await connectGoogle(env);
  const google=fakeGoogle({calendars:CALENDARS,events:EVENTS,
    refusal:{status:403,reason:'insufficientPermissions',message:'Request had insufficient authentication scopes.'}});
  await assert.rejects(()=>scanBirthdays(env,{request:new Request('https://example.com/v1/calendar/birthdays'),
    fetcher:google.fetcher,now:new Date('2026-09-20T12:00:00Z')}),error=>error.status===409);
  const status=await (await call(env,'/v1/calendar/birthdays')).json();
  assert.equal(status.google.calendar,false,'the panel’s next question is what this connection can do');
});

test('the birthday calendar is read first, however far down the list Google puts it',()=>{
  // A subscription to every national holiday and two sports teams is enough to
  // push the one calendar that matters past any cap.
  const noise=Array.from({length:20},(_,index)=>({id:`feed-${index}@group.calendar.google.com`,summary:`Feed ${index}`}));
  const ordered=calendarOrder([...noise,
    {id:'owner@example.com',summary:'Eric',primary:true},
    {id:'addressbook#contacts@group.v.calendar.google.com',summary:'Birthdays'}]);
  assert.equal(ordered[0].id,'addressbook#contacts@group.v.calendar.google.com');
  assert.equal(ordered[1].id,'owner@example.com');
  assert.ok(ordered.length<=12,'and the list is still bounded by the request budget');
});
