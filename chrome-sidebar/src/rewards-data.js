import {isSealed} from './secret-vault.js';
export const REWARDS_KEY='personalRewardsV1';
export const SECRET_MAX=4096;
export function validateReward(input,now=new Date().toISOString()){
  const entry=Object.fromEntries(['kind','name','source','value','due','state','url','notes','secret','secretHint'].map(key=>[key,String(input[key]||'').trim()]));
  if(!entry.name||!entry.source||!entry.value)throw Error('Enter a name, source, and balance or benefit.');
  if(!['balance','benefit','membership'].includes(entry.kind)||!['available','activation','used'].includes(entry.state))throw Error('Choose a valid entry type and status.');
  if(entry.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(entry.due)||!Number.isFinite(Date.parse(entry.due))||new Date(entry.due).toISOString().slice(0,10)!==entry.due))throw Error('Enter a valid expiration date.');
  if(entry.url){let url;try{url=new URL(entry.url);}catch{throw Error('Enter a full https:// account or offer URL.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS URL without credentials.');}
  // The card number is sealed on the device; the API only ever sees an opaque
  // envelope. The hint is the last four digits, which are safe to display.
  if(entry.secret&&(entry.secret.length>SECRET_MAX||!isSealed(entry.secret)))throw Error('Protected values must be encrypted on your device before they are saved.');
  if(entry.secretHint&&!/^\d{4}$/.test(entry.secretHint))throw Error('The protected value hint must be the last four digits.');
  if(!!entry.secret!==!!entry.secretHint)throw Error('Save the protected value and its last four digits together.');
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
// Typo check for a card number entered by hand. The API never sees the digits,
// so this is the only chance to catch a mistyped number before it is sealed.
export function luhnValid(digits){
  if(!/^\d{12,19}$/.test(digits))return false;
  let sum=0,double=false;
  for(let i=digits.length-1;i>=0;i--){
    let value=digits.charCodeAt(i)-48;
    if(double){value*=2;if(value>9)value-=9;}
    sum+=value;double=!double;
  }
  return sum%10===0;
}
