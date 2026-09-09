export const REWARDS_KEY='personalRewardsV1';
export function validateReward(input,now=new Date().toISOString()){
  const entry=Object.fromEntries(['kind','name','source','value','due','state','url','notes'].map(key=>[key,String(input[key]||'').trim()]));
  if(!entry.name||!entry.source||!entry.value)throw Error('Enter a name, source, and balance or benefit.');
  if(!['balance','benefit'].includes(entry.kind)||!['available','activation','used'].includes(entry.state))throw Error('Choose a valid entry type and status.');
  if(entry.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(entry.due)||!Number.isFinite(Date.parse(entry.due))||new Date(entry.due).toISOString().slice(0,10)!==entry.due))throw Error('Enter a valid expiration date.');
  if(entry.url){let url;try{url=new URL(entry.url);}catch{throw Error('Enter a full https:// account or offer URL.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS URL without credentials.');}
  return {...entry,id:input.id||crypto.randomUUID(),updatedAt:now};
}
export function nextActions(entries,now=new Date()){
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return entries.filter(e=>e.state!=='used').flatMap(e=>{
    const days=e.due?Math.round((Date.parse(e.due)-today)/86400000):null;
    const stale=!Number.isFinite(Date.parse(e.updatedAt))||now-Date.parse(e.updatedAt)>=30*86400000;
    const reason=days!==null&&days<0?'Deadline passed — verify availability':days!==null&&days<=30?(days===0?'Use by today':`Use within ${days} day${days===1?'':'s'}`):e.state==='activation'?'Activate before using':e.kind==='balance'&&stale?'Update this balance':null;
    return reason?[{...e,reason,priority:days!==null&&days<=30?days:e.state==='activation'?31:32}]:[];
  }).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name));
}
