// Gift ideas, from the thought to the thing handed over.
//
// The whole point is that an idea can be written down the moment it occurs,
// usually with nothing but a person and a few words, so only those two are
// required. Everything else — the occasion, what it costs, where it was seen —
// is added later or never.
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
import {safePublicURL} from './public-url.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
// Deliberately short. A gift is an idea, then a thing you own, then a thing you
// have given; anything finer is bookkeeping nobody keeps up.
export const GIFT_STATUSES=['Idea','Bought','Given'];
export const GIFT_NOTES_MAX=2000;
export const MAX_GIFT_PRICE=100000;
export const isDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
export function normalizeGift(input,previous={}){
  const get=key=>input[key]??previous[key];
  const status=text(get('status')??GIFT_STATUSES[0],20,'a status',true);
  if(!GIFT_STATUSES.includes(status))fail('Choose whether this is an idea, bought, or given.');
  const date=text(get('date')??'',10,'a date');
  if(date&&!isDate(date))fail('Enter a valid occasion date as YYYY-MM-DD.');
  const price=get('price');
  const amount=price===''||price===null||price===undefined?null:Number(price);
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>MAX_GIFT_PRICE))fail(`Enter a price between 0 and ${MAX_GIFT_PRICE.toLocaleString('en-US')}.`);
  // A link is kept only when it is one this app would be willing to open.
  const link=text(get('link')??'',500,'a link');
  const url=link?safePublicURL(link):'';
  if(link&&!url)fail('Enter a link as a public https:// address, or leave it empty.');
  return {
    person:text(get('person'),120,'who the gift is for',true),
    idea:text(get('idea'),160,'the gift idea',true),
    occasion:text(get('occasion')??'',60,'the occasion'),
    date,status,
    price:amount===null?null:Math.round(amount*100)/100,
    link:url,
    notes:text(get('notes')??'',GIFT_NOTES_MAX,'notes')
  };
}
// Ideas come before things already bought, and what has been given sinks to the
// bottom of that person's list rather than leaving it: last year's gift is the
// most useful thing to see when thinking about this year's.
const rank=record=>GIFT_STATUSES.indexOf(record.status||GIFT_STATUSES[0]);
// People are grouped by who they are, not by how the name was typed: a note
// captured as "ariana" belongs under Ariana rather than starting a second list
// beside it. The first spelling seen is the one shown.
const personKey=record=>(record.person||'Someone').toLowerCase();
function people(records){
  const seen=new Map();
  for(const record of records)if(!seen.has(personKey(record)))seen.set(personKey(record),record.person||'Someone');
  return [...seen].sort((a,b)=>a[1].localeCompare(b[1],undefined,{sensitivity:'base'}));
}
export function groupGifts(records){
  return people(records).map(([key,person])=>({
    person,
    records:records.filter(record=>personKey(record)===key)
      .sort((a,b)=>rank(a)-rank(b)||a.idea.localeCompare(b.idea,undefined,{sensitivity:'base',numeric:true}))
  })).filter(group=>group.records.length);
}
export const giftPeople=records=>people(records.filter(record=>record.person)).map(([,person])=>person);
// The one step that applies to a record, and nothing else: an idea becomes
// bought, a bought thing becomes given, and a given one can be put back.
export const nextStatus=record=>{
  const index=GIFT_STATUSES.indexOf(record.status||GIFT_STATUSES[0]);
  return index<0||index===GIFT_STATUSES.length-1?GIFT_STATUSES[0]:GIFT_STATUSES[index+1];
};
export const advanced=record=>({...record,status:nextStatus(record)});
export const money=value=>value===null||value===undefined?'':value.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:value%1?2:0});
export const describeGift=record=>[
  record.status,
  record.occasion,
  record.date,
  record.price===null||record.price===undefined?'':money(record.price)
].filter(Boolean).join(' · ');
