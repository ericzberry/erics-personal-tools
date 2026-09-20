import {isDate,addMonths,daysBetween,localDate} from './reminder-data.js';
import {safePublicURL} from './public-url.js';
import {money as formatMoney} from './money.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
export const BILLING_CYCLES={unknown:'Not established',monthly:'Monthly',quarterly:'Quarterly',semiannual:'Every six months',annual:'Yearly',weekly:'Weekly'};
export const SUBSCRIPTION_STATES=['Review','Active','Canceled','Not recurring'];
const text=(v,max,label,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(`Check ${label} (up to ${max} characters).`);return v.trim();};
const day=v=>{if(v&&!isDate(v))fail('Enter a valid date.');return v||'';};
const amount=v=>{if(v===null||v===''||v===undefined)return null;if(typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>1e8)fail('Enter a nonnegative amount.');return Math.round(Number(v)*100)/100;};
export const chargeKey=c=>JSON.stringify([c.on,c.amount,c.description]);
export const subscriptionKey=r=>[r.name,r.account,r.currency].map(v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ')).join('|');
export function mergeCharges(a=[],b=[]){
  const rows=new Map();
  for(const charge of [...a,...b])rows.set([charge.on,charge.amount,charge.description].join('|'),charge);
  const result=[...rows.values()].sort((a,b)=>a.on.localeCompare(b.on)||a.description.localeCompare(b.description));
  if(result.length>120)fail('This subscription has 120 saved charges. Keep older evidence separately before adding more.');
  return result;
}
export function normalizeSubscription(input,previous={}){
  const v={...previous,...input};
  const cycle=v.cycle??'unknown',state=v.state??'Review';
  if(!Object.hasOwn(BILLING_CYCLES,cycle)||!SUBSCRIPTION_STATES.includes(state))fail('Choose a billing cycle and status.');
  const currency=text(v.currency??'',3,'currency',true).toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))fail('Enter a three-letter currency code.');
  try{new Intl.NumberFormat('en',{style:'currency',currency});}catch{fail('Check the currency.');}
  const notice=Number(v.notice??14);if(!Number.isInteger(notice)||notice<0||notice>365)fail('Choose 0–365 days of notice.');
  if(!Array.isArray(v.charges??[])||(v.charges??[]).length>120)fail('Save up to 120 charge observations.');
  const charges=(v.charges??[]).map(c=>{const on=day(c.on);const value=amount(c.amount);if(!on||value===null)fail('Each charge needs its date and amount.');return {on,amount:value,description:text(c.description??'',180,'charge description',true),source:text(c.source??'',120,'statement label')};});
  const reviewedCharges=v.reviewedCharges??[];
  if(!Array.isArray(reviewedCharges)||reviewedCharges.length>120||reviewedCharges.some(k=>typeof k!=='string'||k.length>1200))fail('Check the reviewed charge evidence.');
  const evidence=new Set(charges.map(chargeKey));
  const url=text(v.url??'',1200,'account URL');if(url&&!safePublicURL(url))fail('Use a public HTTPS account URL.');
  let research=v.research??null;
  if(research!==null){
    if(typeof research!=='object'||!isDate(research.checked)||!Array.isArray(research.options)||research.options.length>5)fail('Check the saved research.');
    for(const o of research.options){if(!safePublicURL(o.url)||typeof o.name!=='string'||o.name.length>160||typeof o.terms!=='string'||o.terms.length>1500||!Object.hasOwn(BILLING_CYCLES,o.cycle)||o.cycle==='unknown'||o.amount===null||amount(o.amount)===null||o.currency!==currency)fail('Check an alternative’s price, terms and source.');}
    research={checked:research.checked,country:text(research.country??'',80,'research country'),requirements:text(research.requirements??'',2000,'required features'),summary:text(research.summary??'',600,'research summary'),options:research.options.map(o=>({name:o.name,amount:amount(o.amount),currency,cycle:o.cycle,url:safePublicURL(o.url),terms:o.terms}))};
    if(JSON.stringify(research).length>16000)fail('The saved research is too long.');
  }
  return {name:text(v.name,120,'service name',true),account:text(v.account??'',80,'account nickname'),currency,amount:amount(v.amount),cycle,state,
    canceledOn:day(v.canceledOn),reviewedCharges:[...new Set(reviewedCharges)].filter(k=>evidence.has(k)),renewal:day(v.renewal),notice,url,notes:text(v.notes??'',2000,'notes'),charges:mergeCharges(charges),research};
}
export function annualCost(record){
  const factor={monthly:12,quarterly:4,semiannual:2,annual:1,weekly:52}[record.cycle];
  return factor&&record.amount!==null?Math.round(record.amount*factor*100)/100:null;
}
// Only evidence suggests cadence; no observation establishes contractual renewal terms.
export function suggestedCycle(charges){
  const dates=[...new Set(charges.map(c=>c.on))].sort();
  if(dates.length<2)return 'unknown';
  const gaps=dates.slice(1).map((d,i)=>daysBetween(dates[i],d));
  for(const [cycle,min,max] of [['weekly',5,9],['monthly',25,35],['quarterly',80,100],['semiannual',170,195],['annual',350,380]])if(gaps.every(g=>g>=min&&g<=max))return cycle;
  return 'unknown';
}
export function estimatedRenewal(record){
  const latest=record.charges?.at(-1)?.on;if(!latest)return '';
  if(record.cycle==='weekly')return new Date(Date.parse(latest)+7*86400000).toISOString().slice(0,10);
  const months={monthly:1,quarterly:3,semiannual:6,annual:12}[record.cycle];
  return months?addMonths(latest,months):'';
}
// These are observations to check, not assertions about a provider's contract.
export function subscriptionAlerts(record,today=localDate()){
  if(record.deleting||record.conflict||!['Active','Canceled'].includes(record.state))return [];
  const charges=mergeCharges(record.charges||[]).filter(c=>c.on<=today);
  const reviewed=new Set(record.reviewedCharges||[]);
  if(record.state==='Canceled'){
    const after=record.canceledOn?charges.filter(c=>c.on>record.canceledOn&&!reviewed.has(chargeKey(c))):[];
    return after.length?[{reason:`${after.length} charge${after.length===1?'':'s'} after recorded cancellation — verify final bills or posting delays`,due:after[0].on}]:[];
  }
  const latest=charges.at(-1);if(!latest||reviewed.has(chargeKey(latest)))return [];
  // Multiple charges on either date or an unmatched cadence cannot establish a comparable bill.
  const dates=[...new Set(charges.map(c=>c.on))].slice(-2);
  const recent=charges.filter(c=>dates.includes(c.on));
  if(recent.length!==2||suggestedCycle(recent)!==record.cycle||record.cycle==='unknown')return [];
  const previous=recent[0];
  if(latest.amount<=previous.amount)return [];
  return [{reason:`Higher observed charge: ${money(previous.amount,record.currency)} → ${money(latest.amount,record.currency)} — check price, usage or taxes`,due:latest.on}];
}
export function subscriptionAttention(records,today=localDate()){
  return records.filter(r=>!r.deleting&&!r.conflict&&r.state!=='Not recurring').flatMap(r=>{
    if(r.state==='Review')return [{...r,reason:'Review a possible recurring charge',due:'',days:null}];
    const alerts=subscriptionAlerts(r,today);
    if(alerts.length)return [{...r,...alerts[0],days:daysBetween(today,alerts[0].due)}];
    if(r.state==='Canceled')return [];
    const due=r.renewal||estimatedRenewal(r),days=due?daysBetween(today,due):null;
    if(days!==null&&days<=r.notice)return [{...r,due,days,reason:r.renewal?(days<0?'Renewal date passed — verify status':'Upcoming renewal'):'Estimated next charge — verify date'}];
    return [];
  });
}
export function parseSubscriptionReading(value,{account='',source=''}={}){
  if(!Array.isArray(value?.subscriptions)||value.subscriptions.length>40)fail('The reading must contain up to 40 possible subscriptions.');
  return value.subscriptions.map(r=>{
    if(!Array.isArray(r.charges)||!r.charges.length)fail('A possible subscription needs a dated charge as evidence.');
    const record=normalizeSubscription({...r,account,state:'Review',renewal:'',canceledOn:'',reviewedCharges:[],research:null,notice:14,url:'',charges:r.charges.map(c=>({...c,source}))});
    record.cycle=suggestedCycle(record.charges);
    record.amount=record.charges.at(-1).amount;
    return record;
  });
}
export function mergeSubscriptionReading(previous,incoming){
  const charges=mergeCharges(previous.charges,incoming.charges);
  // Importing never reactivates a cancellation or overwrites an owner's terms.
  return normalizeSubscription({...previous,charges,...(previous.state==='Review'?{cycle:suggestedCycle(charges),amount:charges.at(-1)?.amount??previous.amount}:{})});
}
export const money=(amount,currency)=>amount===null?'Amount unknown':formatMoney(amount,currency);
