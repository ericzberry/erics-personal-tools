import {normalizeReminder,describeReminder,reminderDue,duePhrase,REMINDER_KINDS,REMINDER_EVENT_KINDS,DEFAULT_NOTICE_DAYS} from './reminder-data.js';
import {normalizeGift,describeGift,GIFT_STATUSES} from './gift-data.js';
// What a typed note can become. Each target names the capability that owns the
// record, the path its store writes to, the validator the tool itself uses —
// so a captured record is indistinguishable from a typed one and cannot arrive
// in a shape the tool would refuse to show — and the description of its fields
// that the reading is asked to fill in.
//
// The field descriptions live here, beside the validator they have to satisfy,
// rather than in the Worker's prompt: the two cannot drift apart if adding a
// field means editing one file.
//
// The line the owner reads back is built here from the validated record, never
// taken from the model's own description of it. A summary that came from the
// model could flatter a reading the record does not actually contain.
const OBLIGATIONS=REMINDER_KINDS.filter(kind=>!REMINDER_EVENT_KINDS.includes(kind));
export const CAPTURE_TARGETS=[
  {
    capability:'reminders',label:'reminders',path:'/v1/reminders',normalize:normalizeReminder,
    when:'the note is about something that happens on a date, or something due again after an interval',
    fields:today=>`- kind: exactly one of ${REMINDER_KINDS.join(', ')}. ${REMINDER_EVENT_KINDS.join(' and ')} are dates that come round on their own. ${OBLIGATIONS.join(', ')} are obligations, which fall due an interval after the last time they were done and stay due until the owner marks them done.
- title: what it is, in a few words, as the owner would recognize it — "Derek's birthday", "Oil change", "Passport renewal".
- subject: the person, vehicle, pet or thing it belongs to, or "" when the note names none.
- date: YYYY-MM-DD, the anchor. For a birthday or anniversary, the date it falls on; when the note gives no year, use the occurrence on or after today. For an obligation, the last time it was done: "I got the car serviced" with no date means ${today}. Resolve "today", "yesterday", "last Tuesday" and "in March" against today's date.
- since: the four-digit year it started — a year of birth, or the year a marriage began — and "" when the note does not state one. Never guess it.
- every: how many months until it comes round again, as a whole number; 0 when it happens once. A birthday or anniversary is 12. Use the interval the note states. When it states none but the work plainly recurs, use the ordinary interval for that work; when nothing recurs, use 0.
- notice: how many days of warning the owner wants, as a whole number. ${DEFAULT_NOTICE_DAYS} unless the note asks for more, or unless the thing takes real time to arrange — a passport or a visa deserves 90.
- notes: anything in the note that none of the fields above carries, otherwise "".`,
    summary:(record,today)=>[record.title,describeReminder(record),duePhrase(reminderDue(record,today))].filter(Boolean).join(' · ')
  },
  {
    capability:'gifts',label:'gift ideas',path:'/v1/gifts',normalize:normalizeGift,
    when:'the note is about something to give someone',
    fields:()=>`- person: who the gift is for, as the note names them. Required.
- idea: the gift itself, in a few words. Required.
- occasion: the occasion it is for — a birthday, Christmas, an anniversary — or "" when the note names none.
- date: the occasion's date as YYYY-MM-DD when the note gives one, otherwise "".
- price: the price as a plain number when the note states one, otherwise null. Never estimate what something costs.
- link: an https:// address the note contains, otherwise "".
- status: one of ${GIFT_STATUSES.join(', ')}. A note that only has an idea is ${GIFT_STATUSES[0]}; use the later ones only when the note says it was bought or given.
- notes: anything in the note that none of the fields above carries, otherwise "".`,
    summary:record=>[record.idea,`for ${record.person}`,describeGift(record)].filter(Boolean).join(' · ')
  }
];
export const captureTarget=capability=>CAPTURE_TARGETS.find(target=>target.capability===capability)||null;
export const MAX_CAPTURE_NOTE=600;
// `today` is the day the note was typed, sent up by the device. The line read
// back is worked out against that day rather than the server's, so a note typed
// late in the evening does not come back describing tomorrow.
export function parseCapture(value,today){
  // A note the model could not place is the owner's problem to fix, not a
  // failure of the service: it carries its own explanation back at 422.
  if(typeof value?.error==='string'&&value.error.trim())throw Object.assign(Error(value.error.trim().slice(0,300)),{status:422});
  const target=captureTarget(value?.capability);
  if(!target)throw Object.assign(Error('That note did not turn into anything these tools keep.'),{status:502});
  const record=target.normalize(value.record||{});
  return {capability:target.capability,path:target.path,record,summary:target.summary(record,today)};
}
