import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReminder,nextDue,addMonths,reminderDue,reminderAge,attentionSplit,markedDone,canMarkDone,
  duePhrase,describeReminder,localDate,DEFAULT_NOTICE_DAYS,
  calendarBirthday,sameBirthday,fromCalendar} from '../src/reminder-data.js';
const birthday={kind:'Birthday',title:'Derek’s birthday',date:'1985-03-04',every:12,since:'1985'};
const service={kind:'Service',title:'Oil change',subject:'Outback',date:'2026-03-31',every:6};

test('an event rolls forward on its own and an obligation stays due until it is done',()=>{
  // A birthday that has passed is next year's business.
  assert.equal(nextDue(normalizeReminder(birthday),'2026-09-11'),'2027-03-04');
  assert.equal(nextDue(normalizeReminder(birthday),'2026-03-04'),'2026-03-04','the day itself is still today’s business');
  // A service interval falls due once and accumulates however late it is.
  assert.equal(nextDue(normalizeReminder(service),'2026-09-11'),'2026-09-30');
  assert.equal(nextDue(normalizeReminder(service),'2027-06-01'),'2026-09-30','an overdue service does not skip to the next one');
  assert.equal(duePhrase(reminderDue(normalizeReminder(service),'2026-10-05')),'5 days overdue');
  // Marking it done re-anchors the interval; a one-off is finished instead.
  assert.equal(nextDue(markedDone(normalizeReminder(service),'2026-10-05'),'2026-10-06'),'2027-04-05');
  const once=normalizeReminder({kind:'Renewal',title:'Passport',date:'2026-12-01',every:0});
  assert.equal(nextDue(markedDone(once,'2026-11-20'),'2026-11-21'),'','a finished one-off has no next date');
  // Nobody completes a birthday, and trying must not overwrite the date it
  // falls on with today's.
  assert.equal(canMarkDone(normalizeReminder(birthday)),false);
  assert.equal(markedDone(normalizeReminder(birthday),'2026-09-11').date,'1985-03-04');
});

test('month ends clamp without drifting into the next month',()=>{
  assert.equal(addMonths('2026-03-31',1),'2026-04-30');
  assert.equal(addMonths('2026-01-31',1),'2026-02-28');
  assert.equal(addMonths('2024-01-31',1),'2024-02-29');
  assert.equal(addMonths('2026-12-15',1),'2027-01-15');
  // Every step is measured from the anchor, so a clamped month does not pull
  // the following ones back with it.
  assert.equal(nextDue({kind:'Service',title:'x',date:'2026-01-31',every:1,completed:''},'2026-03-01'),'2026-02-28');
});

test('an age is counted from the year it started, never from when it was typed',()=>{
  assert.equal(reminderAge(reminderDue(normalizeReminder(birthday),'2026-09-11')),42);
  // "Today is Derek's birthday", with no year: the record is anchored on today
  // and must never claim he has turned one a year later.
  const heard=normalizeReminder({kind:'Birthday',title:'Derek',date:'2026-09-11',every:12});
  assert.equal(reminderAge(reminderDue(heard,'2026-09-11')),0);
  assert.equal(reminderAge(reminderDue(heard,'2027-09-12')),0);
});

test('each reminder is sorted by its own notice, so slow things warn early',()=>{
  const records=[
    normalizeReminder({kind:'Birthday',title:'Maisie',date:'2026-09-20',every:12}),
    normalizeReminder(service),
    normalizeReminder({kind:'Renewal',title:'Passport',date:'2026-12-01',every:0,notice:90})
  ];
  const {now,later}=attentionSplit(records,{today:'2026-09-11'});
  assert.deepEqual(now.map(record=>record.title),['Maisie','Passport']);
  assert.deepEqual(later.map(record=>record.title),['Oil change']);
});

test('the validator refuses what the tool could not show, and defaults the rest',()=>{
  const record=normalizeReminder({kind:'Service',title:'  Oil change  ',date:'2026-03-31'});
  assert.deepEqual([record.title,record.every,record.notice,record.since],['Oil change',0,DEFAULT_NOTICE_DAYS,'']);
  for(const change of [{kind:'Whenever'},{title:'  '},{date:''},{date:'2026-02-30'},{every:-1},{every:900},{notice:400},{since:'85'},{since:'3200'}])
    assert.throws(()=>normalizeReminder({...service,...change}),undefined,JSON.stringify(change));
  assert.match(describeReminder(normalizeReminder(service)),/Outback · Every 6 months · last done 2026-03-31/);
  assert.equal(localDate(new Date(2026,0,5)),'2026-01-05','the device’s own day, not UTC');
});

test('a calendar birthday keeps its day and never brings an age',()=>{
  const today='2026-09-20';
  // A yearly event made by hand starts the year somebody got round to making
  // it, so its start year is the age of the event, not of the person. Reading
  // it as a birth year is how a grown adult turns two.
  const typed=calendarBirthday({id:'evt-1',summary:'Maisie’s Birthday',start:'2025-01-10'},{today});
  assert.equal(typed.since,'');
  assert.equal(typed.date,'2026-01-10','the day it falls on, in a year that is simply this one');
  assert.equal(reminderAge(reminderDue(typed,today)),0);
  // Google's own contact birthdays are no different: only somebody who knows
  // the year puts one in, and the form is where they do it.
  const contact=calendarBirthday({id:'evt-2',summary:'Ashley’s birthday',start:'1985-03-04',eventType:'birthday'},{today});
  assert.equal(contact.since,'','a calendar is never the source of an age');
  assert.equal(contact.date.slice(5),'03-04');
  assert.equal(contact.every,12);
  assert.equal(contact.kind,'Birthday');
  // February 29th stays February 29th rather than being moved to the 28th.
  const leap=calendarBirthday({id:'evt-3',summary:'Leap day birthday',start:'2000-02-29'},{today});
  assert.equal(leap.date,'2024-02-29','the nearest year that actually has the day');
  assert.equal(nextDue(leap,today),'2027-02-28','a 29th clamps on the way out, not on the way in');
  // Nothing usable is nothing, not a guess.
  assert.equal(calendarBirthday({id:'evt-4',summary:'',start:'1985-03-04'},{today}),null);
  assert.equal(calendarBirthday({id:'evt-5',summary:'No date',start:''},{today}),null);
  assert.equal(calendarBirthday({summary:'Nameless event',start:'1985-03-04'},{today}),null);
});

test('the same birthday written twice is recognized by its day and its name, whatever year each carries',()=>{
  const typed=normalizeReminder({kind:'Birthday',title:'Ashley',date:'2021-03-04',every:12});
  const fromTheCalendar=calendarBirthday({id:'evt-1',summary:'Ashley’s birthday',start:'1985-03-04'},{today:'2026-09-20'});
  assert.equal(sameBirthday(typed,fromTheCalendar),true,'a placeholder year must not hide a duplicate');
  // Two people can share a day without sharing a record.
  const other=normalizeReminder({kind:'Birthday',title:'Derek',date:'1990-03-04',every:12});
  assert.equal(sameBirthday(other,fromTheCalendar),false);
  // And one person's birthday is not their anniversary.
  const anniversary=normalizeReminder({kind:'Anniversary',title:'Ashley',date:'2021-03-04',every:12});
  assert.equal(sameBirthday(anniversary,fromTheCalendar),false);
  // A different day is a different birthday however alike the names read.
  assert.equal(sameBirthday(normalizeReminder({kind:'Birthday',title:'Ashley',date:'2021-03-05',every:12}),fromTheCalendar),false);
});

test('a record remembers where it came from, and an older client editing it does not lose that',()=>{
  const imported=calendarBirthday({id:'evt-1',summary:'Ashley’s birthday',start:'1985-03-04'},{today:'2026-09-20'});
  assert.equal(fromCalendar(imported),true);
  assert.equal(imported.sourceId,'evt-1');
  // An extension or phone on an older version sends neither field; the record
  // keeps what it already had rather than being orphaned from its calendar.
  const edited=normalizeReminder({kind:'Birthday',title:'Ashley',date:'1985-03-04',every:12,notice:30},imported);
  assert.equal(edited.source,'google-calendar');
  assert.equal(edited.sourceId,'evt-1');
  assert.equal(edited.notice,30);
  // Somewhere this app cannot import from is refused rather than stored.
  assert.throws(()=>normalizeReminder({kind:'Birthday',title:'Ashley',date:'1985-03-04',every:12,source:'somewhere-else'}),/imported from/);
  assert.equal(fromCalendar(normalizeReminder({kind:'Birthday',title:'Typed by hand',date:'1985-03-04',every:12})),false);
});
