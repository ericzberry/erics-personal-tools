import {isSealed} from './secret-vault.js';
export const REWARDS_KEY='personalRewardsV1';
export const SECRET_MAX=4096;
export const REWARD_KINDS=['balance','benefit','membership','card'];
export const REWARD_STATES=['available','activation','used'];
// How often a recurring credit comes back. A blank cadence is a benefit that
// does not reset, which is every entry saved before cadence existed.
export const CADENCES=['monthly','quarterly','semiannual','annual'];
export const CADENCE_LABELS={monthly:'Monthly',quarterly:'Quarterly',semiannual:'Twice a year',annual:'Yearly'};
export const BENEFIT_LIMIT=40;
const MONTHS={monthly:1,quarterly:3,semiannual:6,annual:12};
// A recurring credit has no end date of its own: it expires when its period
// closes. The period is the calendar one issuers publish; a credit tied to an
// account anniversary carries an explicit date instead, because only the owner
// knows the anniversary.
export function resetDate(cadence,now=new Date()){
  const months=MONTHS[cadence];
  if(!months)return '';
  const end=new Date(now.getFullYear(),Math.floor(now.getMonth()/months)*months+months,0);
  return `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
}
const FIELDS=['kind','name','source','value','due','state','url','notes','secret','secretHint','card','cadence'];
export function validateReward(input,now=new Date().toISOString()){
  const entry=Object.fromEntries(FIELDS.map(key=>[key,String(input[key]||'').trim()]));
  if(!entry.name||!entry.source||!entry.value)throw Error('Enter a name, source, and balance or benefit.');
  if(!REWARD_KINDS.includes(entry.kind)||!REWARD_STATES.includes(entry.state))throw Error('Choose a valid entry type and status.');
  if(entry.cadence&&!CADENCES.includes(entry.cadence))throw Error('Choose how often this benefit resets.');
  // A benefit names the card it came with, so its card is a saved card entry.
  // A card cannot belong to a card.
  if(entry.card&&(entry.kind==='card'||!/^[a-f0-9-]{36}$/.test(entry.card)))throw Error('Choose which of your saved cards this benefit belongs to.');
  if(entry.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(entry.due)||!Number.isFinite(Date.parse(entry.due))||new Date(entry.due).toISOString().slice(0,10)!==entry.due))throw Error('Enter a valid expiration date.');
  if(entry.url){let url;try{url=new URL(entry.url);}catch{throw Error('Enter a full https:// account or offer URL.');}if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS URL without credentials.');}
  // The card number is sealed on the device; the API only ever sees an opaque
  // envelope. The hint is the last four digits, which are safe to display.
  if(entry.secret&&(entry.secret.length>SECRET_MAX||!isSealed(entry.secret)))throw Error('Protected values must be encrypted on your device before they are saved.');
  if(entry.secretHint&&!/^\d{4}$/.test(entry.secretHint))throw Error('The protected value hint must be the last four digits.');
  if(!!entry.secret!==!!entry.secretHint)throw Error('Save the protected value and its last four digits together.');
  return {...entry,id:input.id||crypto.randomUUID(),updatedAt:now};
}
// How close to a period's close a recurring credit is worth raising. A monthly
// credit is always within a month of resetting, so the same 30 days that suit a
// fixed deadline would keep every one of them on the list permanently.
const WINDOW={monthly:7,quarterly:14,semiannual:30,annual:45};
export function nextActions(entries,now=new Date()){
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return entries.filter(e=>e.state!=='used'&&e.kind!=='card').flatMap(e=>{
    const reset=!e.due&&e.cadence?resetDate(e.cadence,now):'';
    const deadline=e.due||reset,limit=reset?WINDOW[e.cadence]:30;
    const days=deadline?Math.round((Date.parse(deadline)-today)/86400000):null;
    const stale=!Number.isFinite(Date.parse(e.updatedAt))||now-Date.parse(e.updatedAt)>=30*86400000;
    const reason=days!==null&&days<0?'Deadline passed — verify availability':days!==null&&days<=limit?(days===0?'Use by today':`Use within ${days} day${days===1?'':'s'}`):e.state==='activation'?'Activate before using':e.kind==='balance'&&stale?'Update this balance':null;
    return reason?[{...e,deadline,reason,priority:days!==null&&days<=limit?days:e.state==='activation'?31:32}]:[];
  }).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name));
}
const httpsOnly=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
const calendarDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?String(value):'';
// Research answers one card name with the card itself plus the benefits it
// carries, each in the shape the wallet already stores. A field AI got wrong is
// dropped rather than failing the whole card, but every entry still passes the
// same validation a hand-typed one does, so nothing unchecked reaches storage.
// The owner reviews the result and saves it; research saves nothing.
export function parseCardBenefits(input,now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw Error('Card research returned nothing to review.');
  const card=validateReward({...input.card,kind:'card',state:'available',card:'',cadence:'',due:'',secret:'',secretHint:'',url:httpsOnly(input.card?.url)},now);
  const found=Array.isArray(input.benefits)?input.benefits:[];
  if(!found.length||found.length>BENEFIT_LIMIT)throw Error(`Card research must return between 1 and ${BENEFIT_LIMIT} benefits.`);
  const benefits=found.map(benefit=>validateReward({...benefit,
    kind:['benefit','membership'].includes(benefit?.kind)?benefit.kind:'benefit',
    // Research knows whether a credit needs enrollment; it cannot know that one
    // has already been used, so "used" is never a researched status.
    state:benefit?.state==='activation'?'activation':'available',
    cadence:CADENCES.includes(benefit?.cadence)?benefit.cadence:'',
    due:calendarDate(benefit?.due),url:httpsOnly(benefit?.url),
    source:card.name,card:'',secret:'',secretHint:''},now));
  return {card,benefits};
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
