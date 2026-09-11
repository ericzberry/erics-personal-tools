import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReminder,nextDue,addMonths,reminderDue,reminderAge,attentionSplit,markedDone,canMarkDone,
  duePhrase,describeReminder,localDate,DEFAULT_NOTICE_DAYS} from '../src/reminder-data.js';
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
