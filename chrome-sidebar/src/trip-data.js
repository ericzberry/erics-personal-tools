import {safePublicURL} from './public-url.js';

// The research ledger, shared by the browser, phone, importer and Worker.
// Evidence is an observation, never a promise of inventory or a reservation.
const fail=message=>{throw {status:400,message};};
const str=(value,name,max=500,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Check ${name}.`);
  return value.trim();
};
const text=(value,name,max=500)=>str(value??'',name,max);
const one=(value,choices,name)=>choices.includes(value)?value:fail(`Check ${name}.`);
const list=(value,name,max)=>Array.isArray(value)&&value.length<=max&&value.every(x=>x!==null&&x!==undefined)?value:fail(`Check ${name} (up to ${max}).`);
const date=(value,name)=>{
  const s=text(value,name,10);
  if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))fail(`Check ${name}.`);
  return s;
};
const stamp=(value,name)=>{
  const s=text(value,name,40);
  if(s&&(!/^\d{4}-\d{2}-\d{2}T/.test(s)||!Number.isFinite(Date.parse(s))||Date.parse(s)>Date.now()+60000))fail(`Check ${name}.`);
  return s;
};
// Provider result pages may attach session credentials to otherwise ordinary
// search URLs. Such credentials never belong in prompts or saved checkpoints.
export function travelResearchURL(value,{stripSecrets=false}={}){
  const clean=safePublicURL(value);if(!clean)return null;
  const parsed=new URL(clean),original=new URL(value);
  for(const key of [...parsed.searchParams.keys()])if(/token|password|secret|authorization|(?:^|[._-])(?:code|state|session|sessionid|sid)$/i.test(key)){
    if(!stripSecrets)return null;parsed.searchParams.delete(key);
  }
  if(/^#\/[a-z0-9/_-]+$/i.test(original.hash))parsed.hash=original.hash;
  return parsed.href;
}
const url=(value,name)=>{
  if(!value)return '';
  const clean=travelResearchURL(str(value,name,2048,true));
  if(!clean)fail(`Use a public HTTPS link for ${name}.`);
  return clean;
};
const unique=(rows,name)=>{
  if(new Set(rows.map(x=>x.id)).size!==rows.length)fail(`Duplicate ${name}.`);
  return rows;
};
const id=value=>str(value,'identifier',80,true);
const bool=value=>value===true;
function checks(value,criteria){
  return unique(list(value??[],'checks',20).map(c=>{
    if(!criteria.some(r=>r.id===c.id))fail('A check must name one of this trip’s requirements.');
    const result={id:id(c.id),status:one(c.status,['match','mismatch','unknown'],'check result'),detail:str(c.detail,'check explanation',700,true),source:url(c.source,'evidence'),checkedAt:stamp(c.checkedAt,'evidence date')};
    if(result.status!=='unknown'&&(!result.source||!result.checkedAt))fail('A match or mismatch needs its source and observation time.');
    return result;
  }),'check');
}
export function normalizeTrip(input,previous={}){
  const v={...previous,...input};
  if(v.schemaVersion!==undefined&&v.schemaVersion!==1)fail('This trip format needs a newer app.');
  const criteria=unique(list(v.criteria??[],'requirements',20).map(c=>({id:id(c.id),label:str(c.label,'requirement',250,true),required:c.required!==false})),'requirement');
  const start=date(v.start,'arrival/departure date'),end=date(v.end,'checkout/return date');
  if(start&&end&&(end<start||(v.kind!=='flight'&&end===start)))fail('End date must follow the start date.');
  let party=null;
  if(v.party!=null){
    const p=v.party;
    if(!Number.isInteger(p.adults)||p.adults<1||p.adults>30||!Number.isInteger(p.rooms)||p.rooms<1||p.rooms>15)fail('Check travelers and rooms.');
    const childrenAges=list(p.childrenAges,'children’s ages',20);
    if(childrenAges.some(a=>!Number.isInteger(a)||a<0||a>17))fail('Check children’s ages.');
    party={adults:p.adults,childrenAges,rooms:p.rooms};
  }
  const trip={schemaVersion:1,title:str(v.title,'trip name',120,true),kind:one(v.kind??'hotel',['hotel','flight','both'],'trip type'),request:str(v.request,'trip request',4000,true),start,end,party,criteria,
    intentKey:text(v.intentKey,'parsed request context',12000),researchKey:text(v.researchKey,'research context',12000),summary:text(v.summary,'summary',1500),questions:list(v.questions??[],'open questions',12).map(q=>str(q,'question',400,true)),
    channels:unique(list(v.channels??[],'channels',15).map(c=>({id:id(c.id),label:str(c.label,'channel',100,true),status:one(c.status,['not-checked','partial','checked','login','blocked'],'channel status'),note:text(c.note,'channel note',500),checkedAt:stamp(c.checkedAt,'channel observation'),resumeURL:url(c.resumeURL,'resume link'),nextStep:text(c.nextStep,'next step',500),contextKey:text(c.contextKey,'channel context',12000)})),'channel'),
    candidates:unique(list(v.candidates??[],'options',20).map(c=>({id:id(c.id),name:str(c.name,'option name',150,true),description:text(c.description,'description',700),url:url(c.url,'option link'),checks:checks(c.checks,criteria),
      offers:unique(list(c.offers??[],'offers',12).map(o=>{
        const offer={id:id(o.id),channel:str(o.channel,'booking channel',100,true),product:str(o.product,'exact room or fare',250,true),contextKey:text(o.contextKey,'offer context',12000),availability:one(o.availability??'unknown',['available','unavailable','unknown'],'availability'),observedAt:stamp(o.observedAt,'offer observation'),source:url(o.source,'offer link'),evidence:text(o.evidence,'offer evidence',700),
          total:o.total??null,currency:one(o.currency??'USD',['USD','EUR','GBP','CAD','JPY','CHF','AUD'],'currency'),allIn:bool(o.allIn),terms:text(o.terms,'cancellation and payment terms',900),benefits:text(o.benefits,'conditional benefits',700),checks:checks(o.checks,criteria)};
        if(offer.total!==null&&(!Number.isFinite(offer.total)||offer.total<0||offer.total>10000000))fail('Check the full-trip price.');
        if((offer.total!==null||offer.availability!=='unknown')&&(!offer.observedAt||!offer.source||!offer.evidence||!offer.contextKey))fail('A price or availability needs dated evidence and its exact search context.');
        return offer;
      }),'offer')})),'option')};
  if(new TextEncoder().encode(JSON.stringify(trip)).length>56000)fail('This trip is too large. Keep the strongest options and concise evidence.');
  return trip;
}

// Exact scope is deliberate: changed words, occupancy, dates or requirements
// cannot inherit a prior search's green check or price ranking.
export function tripKey(t){return JSON.stringify([t.kind,t.request,t.start,t.end,t.party,t.criteria]);}
export const researchCurrent=t=>!!t.researchKey&&t.researchKey===tripKey(t);
export function checksFit(criteria,observations,now=Date.now()){
  const required=criteria.filter(c=>c.required);
  if(!required.length)return 'unknown';
  const statuses=required.map(c=>{
    const o=observations.find(x=>x.id===c.id);
    if(!o||!o.source||!o.checkedAt||now-Date.parse(o.checkedAt)>30*86400000||now<Date.parse(o.checkedAt))return 'unknown';
    return o.status;
  });
  return statuses.includes('mismatch')?'mismatch':statuses.every(s=>s==='match')?'match':'unknown';
}
export function offerState(trip,candidate,offer,now=Date.now()){
  if(!researchCurrent(trip)||offer.contextKey!==tripKey(trip))return 'Different search — recheck';
  if(!offer.observedAt||now-Date.parse(offer.observedAt)>15*60000||now<Date.parse(offer.observedAt))return 'Previous observation — recheck';
  if(offer.availability==='unavailable')return 'No matching availability observed';
  if(!trip.start||!trip.party||(trip.kind!=='flight'&&!trip.end))return 'Travel details incomplete';
  if(checksFit(trip.criteria,candidate.checks,now)!=='match'||checksFit(trip.criteria,offer.checks,now)!=='match')return 'Requirements not confirmed';
  if(offer.availability!=='available')return 'Availability not verified';
  if(offer.total===null||!offer.allIn||!offer.terms)return 'Price or terms incomplete';
  return 'Observed offer — recheck before booking';
}
export function rankCandidates(trip,now=Date.now()){
  const order={match:0,unknown:1,mismatch:2};
  return trip.candidates.map(c=>({...c,fit:researchCurrent(trip)?checksFit(trip.criteria,c.checks,now):'unknown'}))
    .sort((a,b)=>order[a.fit]-order[b.fit]||a.name.localeCompare(b.name));
}

export const TRIP_RETENTION_MS=90*86400000;
export const tripExpired=(record,now=Date.now())=>!!record.updatedAt&&Number.isFinite(Date.parse(record.updatedAt))&&Date.parse(record.updatedAt)+TRIP_RETENTION_MS<=now;

// One catalogue supplies the desktop search picker and both hosts' coverage.
// Merely listing a source never counts as checking it.
export const TRIP_CHANNELS=[
  {id:'web',label:'Google Hotels',url:'https://www.google.com/travel/hotels'},
  {id:'amex',label:'Amex Travel',url:'https://www.americanexpress.com/en-us/travel/'},
  {id:'chase',label:'Chase Travel',url:'https://secure.chase.com/web/auth/dashboard#/dashboard/travel'},
  {id:'kayak',label:'KAYAK',url:'https://www.kayak.com/'},
  {id:'trivago',label:'Trivago',url:'https://www.trivago.com/'},
  {id:'booking',label:'Booking.com',url:'https://www.booking.com/'},
  {id:'expedia',label:'Expedia',url:'https://www.expedia.com/'},
  {id:'priceline',label:'Priceline',url:'https://www.priceline.com/'},
  {id:'hotwire',label:'Hotwire',url:'https://www.hotwire.com/'},
  {id:'travelzoo',label:'Travelzoo',url:'https://www.travelzoo.com/'},
  {id:'suiteness',label:'Suiteness',url:'https://www.suiteness.com/'}
];
export function tripSources(trip){
  const known=new Set(TRIP_CHANNELS.map(c=>c.id));
  // Saved direct-provider checkpoints retain their verified URLs. A hotel
  // result URL can be an OTA, so never automatically label it "direct".
  return [...TRIP_CHANNELS,...trip.channels.filter(c=>!known.has(c.id)&&c.resumeURL).map(c=>({id:c.id,label:c.label,url:c.resumeURL}))];
}
export function tripCoverage(trip){
  return [...TRIP_CHANNELS.filter(c=>!trip.channels.some(s=>s.id===c.id)).map(c=>({...c,status:'not-checked'})),...trip.channels];
}
