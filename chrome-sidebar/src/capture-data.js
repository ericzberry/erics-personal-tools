import {normalizeReminder,describeReminder,reminderDue,duePhrase} from './reminder-data.js';
// What a typed note can become. Each target names the capability that owns the
// record, the path its store writes to, and the validator the tool itself uses
// — so a captured record is indistinguishable from a typed one and cannot
// arrive in a shape the tool would refuse to show.
//
// The line the owner reads back is built here from the validated record, not
// taken from the model's own description of it. A summary that came from the
// model could flatter a reading the record does not actually contain.
export const CAPTURE_TARGETS=[{
  capability:'reminders',label:'Reminder',path:'/v1/reminders',normalize:normalizeReminder,
  summary:(record,today)=>[record.title,describeReminder(record),duePhrase(reminderDue(record,today))].filter(Boolean).join(' · ')
}];
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
