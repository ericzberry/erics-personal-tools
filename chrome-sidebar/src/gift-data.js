// Gift ideas: who it is for, what it is, and where to get it.
//
// Deliberately three fields. An idea has to be writable the moment it occurs,
// and everything else — an occasion, a price, a note about why — is a field
// that would have to be skipped every time. What it is, in the owner's own
// words, already says whatever needed saying.
//
// Validation is shared with the Worker, so every rule here applies to a record
// however it arrives.
import {safePublicURL} from './public-url.js';
const fail=message=>{throw Object.assign(Error(message),{status:400});};
// An idea, or a thing already bought. Bought leaves the list and keeps its own
// view, so the list is only ever what is still to decide.
export const GIFT_STATUSES=['Idea','Bought'];
export const GIFT_IDEA_MAX=200;
const text=(value,max,label,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
export function normalizeGift(input,previous={}){
  const get=key=>input[key]??previous[key];
  const status=text(get('status')??GIFT_STATUSES[0],20,'a status',true);
  if(!GIFT_STATUSES.includes(status))fail('An idea is either still an idea or already bought.');
  // A link is kept only when it is one this app would be willing to open.
  const link=text(get('link')??'',500,'a link');
  const url=link?safePublicURL(link):'';
  if(link&&!url)fail('Enter a link as a public https:// address, or leave it empty.');
  return {
    person:text(get('person'),120,'who the gift is for',true),
    idea:text(get('idea'),GIFT_IDEA_MAX,'the gift idea',true),
    status,link:url
  };
}
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
      .sort((a,b)=>a.idea.localeCompare(b.idea,undefined,{sensitivity:'base',numeric:true}))
  })).filter(group=>group.records.length);
}
export const giftPeople=records=>people(records.filter(record=>record.person)).map(([,person])=>person);
export const isBought=record=>record.status===GIFT_STATUSES[1];
export const bought=record=>({...record,status:GIFT_STATUSES[1]});
export const unbought=record=>({...record,status:GIFT_STATUSES[0]});
