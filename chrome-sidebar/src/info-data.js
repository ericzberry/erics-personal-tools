import {isLoyaltyReward} from './balance-data.js';
// Read-only projections over the existing stores. Numbers, sealed payloads,
// private notes and account URLs never enter the search index or web queries.
export const INFO_SOURCES=['people','personal','travel','gifts','sizes','replacements','rewards'];
export const INFO_FILTERS=[['','All info'],['people','People & places'],['personal','Personal'],['memberships','Memberships'],['sizes','Sizes'],['gifts','Gifts'],['replacements','Buy again']];
export const isMembership=record=>['Airline','Hotel','Rental car','Other'].includes(record.category);
const clean=text=>String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const words=text=>clean(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export function infoRecords(data={}){
  const rows=[];
  const add=(tool,record,kind,title,detail,search='',web='')=>{
    if(record.deleting)return;
    rows.push({tool,id:record.id,kind,title,detail,query:title,search:[title,detail,search].join(' '),web,
      pending:!!record.pending,conflict:!!record.conflict});
  };
  for(const r of data.people||[])add('people',r,'people',r.name,[r.role,r.location].filter(Boolean).join(' · '),'person family address place');
  for(const r of data.personal||[])add('personal',r,'personal',r.label,[r.person,r.category,r.hint].filter(Boolean).join(' · '),'document identification');
  for(const r of data.travel||[])if(isMembership(r))add('travel',r,'memberships',r.name,[r.category,r.traveler].filter(Boolean).join(' · '),'loyalty membership program account miles points');
  for(const r of data.gifts||[])add('gifts',r,'gifts',r.idea,[r.person,r.status].filter(Boolean).join(' · '),'gift present',r.idea);
  for(const r of data.sizes||[])add('sizes',r,'sizes',r.item,[r.brand,r.size,r.fit].filter(Boolean).join(' · '),'size clothing measurements');
  for(const r of data.replacements||[])add('replacements',r,'replacements',r.item,r.variant,'buy again product replacement',r.variant);
  for(const r of data.rewards||[])if(isLoyaltyReward(r))add('rewards',r,'memberships',r.name,[r.source,r.value].filter(Boolean).join(' · '),'loyalty membership program account miles points');
  return rows.sort((a,b)=>a.title.localeCompare(b.title));
}
export function findInfo(rows,query='',kind=''){
  const terms=words(query);
  return rows.filter(row=>(!kind||row.kind===kind)&&terms.every(term=>clean(row.search).includes(term)));
}
export const productSearchURL=row=>row.web?`https://www.google.com/search?q=${encodeURIComponent(row.web.slice(0,300))}`:'';
