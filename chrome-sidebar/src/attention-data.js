import {attentionSplit,localDate,daysBetween} from './reminder-data.js';
import {nextActions} from './rewards-data.js';
import {subscriptionAttention} from './subscription-data.js';
export const ATTENTION_SOURCES={reminders:'Reminders',rewards:'Rewards & benefits',travel:'Travel wallet',personal:'Personal information',finance:'Finance',subscriptions:'Subscriptions & renewals'};
// A projection of source records, never a second store of dates or completion state.
export function attentionItems(data,{today=localDate()}={}){
  const items=[];
  const add=(tool,r,title,reason,due='',days=null)=>items.push({id:`${tool}:${r.id}`,tool,recordId:r.id,title,reason,due,days,pending:!!r.pending});
  const usable=tool=>(data[tool]||[]).filter(r=>!r.deleting&&!r.conflict);
  for(const r of attentionSplit(usable('reminders'),{today}).now)add('reminders',r,r.title,r.days<0?'Overdue reminder':'Upcoming reminder',r.due,r.days);
  for(const r of nextActions(usable('rewards'),new Date(`${today}T12:00:00`)))add('rewards',r,r.name,r.reason,r.deadline,r.deadline?daysBetween(today,r.deadline):null);
  for(const tool of ['travel','personal'])for(const r of usable(tool))if(r.expires){const days=daysBetween(today,r.expires);if(days<=90)add(tool,r,r.name||r.label,days<0?'Document expired':'Document expires soon',r.expires,days);}
  for(const r of usable('finance')){const age=r.asOf?daysBetween(r.asOf,today):Infinity;if(age>=90)add('finance',r,r.name,r.asOf?`Balance last updated ${age} days ago`:'Balance needs a date');}
  for(const r of subscriptionAttention(usable('subscriptions'),today))add('subscriptions',r,r.name,r.reason,r.due,r.days);
  for(const [tool,rows] of Object.entries(data))for(const r of rows||[])if(r.conflict)add(tool,r,r.name||r.title||r.label||ATTENTION_SOURCES[tool],'Resolve conflicting edits');
  return items.sort((a,b)=>(a.days??1e6)-(b.days??1e6)||a.title.localeCompare(b.title));
}
