import {travel} from './travel.js';
import {normalizeReminder} from '../../chrome-sidebar/src/reminder-data.js';
// Reminders reuse the generic encrypted record store. The Worker never
// computes a due date: it validates the anchor and the interval, and the
// device works out what that means today.
export const reminders=(request,env,readValue,json)=>travel(request,env,readValue,json,{
  resource:'reminders',table:'reminder_records',normalize:normalizeReminder,
  metadata:(row,value)=>({...value,id:row.id,revision:row.revision,updatedAt:row.updated_at})
});
