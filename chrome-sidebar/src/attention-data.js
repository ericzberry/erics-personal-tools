import {attentionSplit,localDate,daysBetween} from './reminder-data.js';
import {rewardOpportunities} from './reward-opportunities.js';
import {subscriptionAttention} from './subscription-data.js';
import {financeAttention} from './finance-data.js';
export const ATTENTION_SOURCES={reminders:'Reminders',rewards:'Rewards & benefits',travel:'Travel wallet',personal:'Personal information',finance:'Finance',subscriptions:'Subscriptions & renewals'};
// A projection of source records, never a second store of dates or completion state.
export function attentionItems(data,{today=localDate()}={}){
  const items=[];
  const add=(tool,r,title,reason,due='',days=null)=>items.push({id:`${tool}:${r.id}`,tool,recordId:r.id,title,reason,due,days,pending:!!r.pending});
  const usable=tool=>(data[tool]||[]).filter(r=>!r.deleting&&!r.conflict);
  for(const r of attentionSplit(usable('reminders'),{today}).now)add('reminders',r,r.title,r.days<0?'Overdue reminder':'Upcoming reminder',r.due,r.days);
  // The wallet's own projection, so an item here is the item under For you,
  // with the same key and the same answer.
  for(const item of rewardOpportunities({entries:usable('rewards'),resolutions:data.wallet||[]},{now:new Date(`${today}T12:00:00`)}).urgent)
    add('rewards',{id:item.recordId||item.key,pending:!!item.entry?.pending},item.title,item.why,item.deadline||'',item.deadline?daysBetween(today,item.deadline):null);
  for(const tool of ['travel','personal'])for(const r of usable(tool))if(r.expires){const days=daysBetween(today,r.expires);if(days<=90)add(tool,r,r.name||r.label,days<0?'Document expired':'Document expires soon',r.expires,days);}
  // A portfolio nobody has marked in a season, named once rather than once per
  // asset class — three stale figures in one account is one thing to go and do.
  for(const r of financeAttention(data.finance||[],{today}))add('finance',r,r.name,r.asOf?`Last marked ${daysBetween(r.asOf,today)} days ago`:'No figures recorded');
  for(const r of subscriptionAttention(usable('subscriptions'),today))add('subscriptions',r,r.name,r.reason,r.due,r.days);
  for(const [tool,rows] of Object.entries(data))for(const r of rows||[])if(r.conflict)add(tool,r,r.name||r.title||r.label||ATTENTION_SOURCES[tool],'Resolve conflicting edits');
  return items.sort((a,b)=>(a.days??1e6)-(b.days??1e6)||a.title.localeCompare(b.title));
}
