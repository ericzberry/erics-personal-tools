// Dated commitments: a birthday that comes back every year, a service interval
// that restarts when the work is done, a renewal with a deadline.
//
// One decision runs through this file: a record stores the anchor date and how
// often it repeats, and the next date is always computed from them. Nothing
// stores "next due", so a record cannot go stale sitting in the cloud or on a
// phone that was offline for a month, and marking a service done is a change to
// one date rather than a rewrite of a schedule.
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const REMINDER_KINDS=['Birthday','Anniversary','Service','Renewal','Appointment','Other'];
// Intervals are months. A birthday is a twelve-month repeat anchored on the
// date of birth; a filter change is a three-month repeat anchored on the last
// time it was changed.
export const REMINDER_INTERVALS=[
  {months:0,label:'Does not repeat'},
  {months:1,label:'Every month'},
  {months:3,label:'Every 3 months'},
  {months:6,label:'Every 6 months'},
  {months:12,label:'Every year'},
  {months:24,label:'Every 2 years'},
  {months:60,label:'Every 5 years'}
];
export const MAX_INTERVAL_MONTHS=120;
export const MAX_NOTICE_DAYS=365;
export const DEFAULT_NOTICE_DAYS=14;
export const REMINDER_NOTES_MAX=2000;
// Where a record came from, when it was not typed here. A record with no
// source was written by hand and is never touched by an import.
export const CALENDAR_SOURCE='google-calendar';
export const REMINDER_SOURCES=['',CALENDAR_SOURCE];
export const MAX_SOURCE_ID=200;
// Nobody in a calendar was born more than this long ago, and a start year
// outside that range is a placeholder rather than a date of birth.
export const MAX_AGE_YEARS=120;

// The device's own day, not UTC: "today is Derek's birthday" is said in the
// owner's timezone, and a UTC date would move it by one for half of each day.
export const localDate=(now=new Date())=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
export const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
const date=(value,label,required=false)=>{
  const clean=text(value??'',10,label,required);
  if(clean&&!isDate(clean))fail(`Enter a valid ${label} as YYYY-MM-DD.`);
  return clean;
};
// A four-digit year, or nothing. The anchor date carries the month and day a
// birthday falls on; this carries the year it started, which is the only thing
// that can turn a date into an age. A birthday entered without one simply has
// no age to show, rather than an invented one counted from when it was typed.
const year=(value,label)=>{
  const clean=text(value??'',4,label);
  if(clean&&!/^(1[89]|2[0-4])\d{2}$/.test(clean))fail(`Enter ${label} as a four-digit year.`);
  return clean;
};
// A source is one of the places this app can import from, or nothing at all.
// An unrecognized one is refused rather than stored, so the row's "where this
// came from" can never say something the app does not know how to honour.
const origin=value=>{
  const clean=text(value??'',40,'where this came from');
  if(clean&&!REMINDER_SOURCES.includes(clean))fail('That is not a place reminders can be imported from.');
  return clean;
};
const count=(value,max,label)=>{
  const number=Number(value??0);
  if(!Number.isInteger(number)||number<0||number>max)fail(`Enter ${label} between 0 and ${max}.`);
  return number;
};

export function normalizeReminder(input,previous={}){
  const get=key=>input[key]??previous[key];
  const kind=text(get('kind'),40,'a kind',true);
  if(!REMINDER_KINDS.includes(kind))fail('Choose what kind of reminder this is.');
  return {
    kind,
    title:text(get('title'),120,'what this is about',true),
    // Who or what it belongs to: a person for a birthday, a car for a service.
    subject:text(get('subject')??'',120,'who or what this is for'),
    // The anchor: the date of birth, or the last time the work was done.
    date:date(get('date'),'a date',true),
    every:count(get('every'),MAX_INTERVAL_MONTHS,'a repeat interval in months'),
    since:year(get('since'),'the year it started'),
    notice:count(get('notice')??DEFAULT_NOTICE_DAYS,MAX_NOTICE_DAYS,'days of advance notice'),
    // Only a reminder that does not repeat can be finished; a repeating one is
    // completed by moving its anchor forward instead.
    completed:date(get('completed')??'','the date it was completed'),
    notes:text(get('notes')??'',REMINDER_NOTES_MAX,'notes'),
    // Provenance, in two parts: which place this came from, and what that
    // place calls it. The second is what lets a later sweep of the same
    // calendar recognize its own work instead of adding it twice. An older
    // client that does not send either keeps whatever the record already had,
    // because `get` falls back to the previous value.
    source:origin(get('source')??''),
    sourceId:text(get('sourceId')??'',MAX_SOURCE_ID,'the source identifier')
  };
}

// A birthday as a calendar keeps it, turned into the record this app keeps.
//
// The one judgement here is the year. A calendar's yearly birthday event
// starts on the date of birth when the year is known, and on a placeholder
// when it is not — so a year that is not a year someone could have been born
// in is dropped rather than shown as an age. That is the same rule the form
// follows: a birthday with no year simply has no age, rather than an invented
// one counted from when it was first written down.
export function calendarBirthday(event,{today=localDate()}={}){
  const title=String(event?.summary??'').trim().slice(0,120);
  const start=String(event?.start??'');
  const sourceId=String(event?.id??'').slice(0,MAX_SOURCE_ID);
  if(!title||!isDate(start)||!sourceId)return null;
  const thisYear=Number(today.slice(0,4)),startYear=Number(start.slice(0,4));
  const born=startYear<thisYear&&startYear>=thisYear-MAX_AGE_YEARS;
  return normalizeReminder({
    kind:'Birthday',title,subject:'',
    date:born?start:thisYearsDate(start,thisYear),
    every:12,since:born?String(startYear):'',
    notice:DEFAULT_NOTICE_DAYS,completed:'',notes:'',
    source:CALENDAR_SOURCE,sourceId
  });
}
// The same month and day, in a year that has one. February 29th only exists
// every fourth year, and moving it to the 28th would be recording a different
// birthday; stepping back to a year that has the day keeps the date itself
// intact and lets `nextDue` clamp it the way it clamps every other 29th.
function thisYearsDate(start,thisYear){
  for(let year=thisYear;year>thisYear-4;year--){
    const value=`${year}-${start.slice(5)}`;
    if(isDate(value))return value;
  }
  return start;
}

// Two records naming the same birthday. The year is deliberately not compared:
// one of them may carry a placeholder year, and a birthday is the day it falls
// on. What has to agree is the day and the name — so two people who share a
// birthday stay two records, and "Ashley’s birthday" recognizes "Ashley".
const NOT_A_NAME=new Set(['birthday','birthdays','bday','bdays','b','day','happy','birth','the','of']);
export const birthdayName=value=>new Set(String(value??'').toLowerCase()
  .replace(/[\u2019']s\b/g,'')
  .replace(/[^a-z0-9]+/g,' ')
  .split(' ')
  .filter(word=>word&&!NOT_A_NAME.has(word)));
export function sameBirthday(record,candidate){
  if(record?.kind!=='Birthday'||candidate?.kind!=='Birthday')return false;
  if(String(record.date??'').slice(5)!==String(candidate.date??'').slice(5))return false;
  const left=birthdayName(`${record.title??''} ${record.subject??''}`);
  const right=birthdayName(`${candidate.title??''} ${candidate.subject??''}`);
  if(!left.size||!right.size)return false;
  return [...left].every(word=>right.has(word))||[...right].every(word=>left.has(word));
}
export const fromCalendar=record=>record?.source===CALENDAR_SOURCE;

// Adding months keeps the anchor's day where the target month has one, and
// clamps to the month's last day where it does not, so a 31st does not skid
// into the next month. Every step is measured from the anchor rather than the
// previous result, so repeated clamping cannot walk a date backwards.
export function addMonths(value,months){
  const [y,m,d]=value.split('-').map(Number);
  const total=y*12+(m-1)+months;
  const year=Math.floor(total/12),month=total-year*12;
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return `${String(year).padStart(4,'0')}-${String(month+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
export const daysBetween=(from,to)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000);

// Two kinds of repeat, and the difference is the whole point. A birthday
// happens whether or not anyone attends to it, so once it passes the next one
// is next year. A service interval is an obligation: it falls due one interval
// after the last time the work was done and stays there, accumulating however
// many days late it is, until someone marks it done.
export const REMINDER_EVENT_KINDS=['Birthday','Anniversary'];
export const rollsForward=record=>REMINDER_EVENT_KINDS.includes(record?.kind);
export function nextDue(record,today=localDate()){
  if(!isDate(record?.date||''))return '';
  const every=Number(record.every)||0;
  if(!every)return record.completed?'':record.date;
  if(!rollsForward(record))return addMonths(record.date,every);
  if(record.date>=today)return record.date;
  const [ay,am]=record.date.split('-').map(Number),[ty,tm]=today.split('-').map(Number);
  let steps=Math.max(0,Math.floor(((ty-ay)*12+(tm-am))/every)),due=addMonths(record.date,every*steps);
  while(due<today)due=addMonths(record.date,every*++steps);
  return due;
}
export const reminderDue=(record,today=localDate())=>{
  const due=nextDue(record,today);
  return {...record,due,days:due?daysBetween(today,due):null};
};
// The number this anniversary reaches on its next date, and 0 when the note
// never said what year it started. Never counted from the anchor date, whose
// year may be nothing more than when the birthday was first typed in.
export const reminderAge=record=>record.since&&record.due?Number(record.due.slice(0,4))-Number(record.since):0;
export const isDueSoon=record=>record.days!==null&&record.days<=(record.notice??DEFAULT_NOTICE_DAYS);
export const intervalLabel=months=>REMINDER_INTERVALS.find(interval=>interval.months===months)?.label
  ||`Every ${months} month${months===1?'':'s'}`;
export function duePhrase(record){
  if(record.days===null)return 'Completed';
  if(record.days<0)return `${-record.days} day${record.days===-1?'':'s'} overdue`;
  return record.days===0?'Today':record.days===1?'Tomorrow':`In ${record.days} days`;
}

// Everything still ahead, soonest first. Completed one-off reminders drop out;
// a repeat never does, because it always has a next time. A record queued for
// deletion stays in the list until the queue drains, carrying its own pending
// state, because an edit that has not reached the cloud is not a fact yet.
export const dueReminders=(records,{today=localDate()}={})=>records
  .map(record=>reminderDue(record,today))
  .filter(record=>record.due)
  .sort((a,b)=>a.due.localeCompare(b.due)||a.title.localeCompare(b.title,undefined,{sensitivity:'base'}));
// Split at each record's own notice: fourteen days is plenty for a birthday,
// where a passport renewal wants months.
export const attentionSplit=(records,options)=>{
  const due=dueReminders(records,options);
  return {now:due.filter(isDueSoon),later:due.filter(record=>!isDueSoon(record))};
};

// Marking a repeat done moves its anchor to the day the work happened, which is
// what makes the next date fall the full interval after it. A one-off is
// finished instead, and keeps its date as the record of when it was due.
//
// An event cannot be done: nobody completes a birthday, and moving its anchor
// would overwrite the date it actually falls on. Tools do not offer it, and it
// is a no-op here so a mistaken call cannot quietly rewrite the date.
export const canMarkDone=record=>!rollsForward(record);
export const markedDone=(record,today=localDate())=>!canMarkDone(record)
  ?{...record}
  :Number(record.every)?{...record,date:today,completed:''}:{...record,completed:today};
export const describeReminder=record=>[
  record.subject,
  intervalLabel(Number(record.every)||0),
  record.every?(rollsForward(record)?record.date:`last done ${record.date}`):record.date
].filter(Boolean).join(' · ');
