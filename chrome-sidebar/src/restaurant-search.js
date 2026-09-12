import {safePublicURL} from './public-url.js';
// Shared, deterministic search rules. No catalogue or availability is invented here.
export const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const isNYC = city => ['nyc','new york','new york city','new york ny','manhattan'].includes(normalizeName(city));
const neighborhoodName=value=>({uws:'upper west side',ues:'upper east side',les:'lower east side',ev:'east village'}[normalizeName(value)]||normalizeName(value));
export function matchesGeography(restaurant,search) {
  const city=normalizeName(String(restaurant.city||'').split(',')[0]),requested=normalizeName(search.city.split(',')[0]);
  const matches=isNYC(requested)?isNYC(city)||['brooklyn','queens','bronx','staten island'].includes(city):city===requested;
  if(!matches)return false;
  const neighborhood=neighborhoodName(search.neighborhood);
  return !neighborhood || (` ${neighborhoodName(restaurant.neighborhood)} `).includes(` ${neighborhood} `);
}
export function localDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
export const MAX_DATES = 7;
const calendarDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const dayCount = (from,to) => Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)+1;
export function searchDates(search) {
  const dates=[];
  for (let i=0, day=Date.parse(`${search.date}T00:00:00Z`); i<MAX_DATES; i++, day+=86400000) {
    const value=new Date(day).toISOString().slice(0,10);
    dates.push(value);
    if (value >= (search.endDate || search.date)) break;
  }
  return dates;
}
export function searchInput(input, today = localDate()) {
  const text = (value,max=300) => typeof value === 'string' ? value.trim().slice(0,max) : '';
  const mode = input.mode === 'category' ? 'category' : 'restaurant';
  const query = text(input.query), city = text(input.city,120);
  if (!query || !city) throw Error('Enter a restaurant or category and a city.');
  const date = text(input.date,10);
  if (!calendarDate(date) || date < today) throw Error('Choose a valid date today or later.');
  // A range of dates only makes sense for one named restaurant; a category search
  // is one evening out, not a survey of the city over a week.
  const flexibleDates = mode === 'restaurant' && input.flexibleDates === true;
  const endDate = flexibleDates ? (text(input.endDate,10) || date) : date;
  if (!calendarDate(endDate) || endDate < date) throw Error('Choose a last date on or after the first date.');
  if (dayCount(date,endDate) > MAX_DATES) throw Error(`Check at most ${MAX_DATES} dates in one search.`);
  const flexible = input.flexible === true;
  // The Worker re-validates this object, so it has to survive its own output:
  // a fixed size reads back from minParty, and it is also returned as partySize
  // so a client on this version still satisfies an older deployed Worker.
  const size = Number(input.partySize ?? input.minParty);
  const minParty = flexible ? Number(input.minParty) : size, maxParty = flexible ? Number(input.maxParty) : size;
  const party = n => Number.isInteger(n) && n >= 1 && n <= 20;
  if (flexible) {
    if (![minParty,maxParty].every(party) || maxParty < minParty || maxParty-minParty > 7) throw Error('Choose a party-size range between 1 and 20 people, covering at most 8 sizes.');
  } else if (!party(size)) throw Error('Enter a party size from 1 to 20 people.');
  const startTime = text(input.startTime,5) || '17:00', endTime = text(input.endTime,5) || '22:00';
  if (![startTime,endTime].every(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) || startTime>endTime) throw Error('Choose a time window ending on the same day, after it starts.');
  return {mode,query,city:isNYC(city)?'New York City':city,neighborhood:text(input.neighborhood,120),date,endDate,flexibleDates,flexible,...(flexible?{}:{partySize:size}),minParty,maxParty,startTime,endTime,includeLongTravel:isNYC(city)&&input.includeLongTravel===true,limit:[6,12,24].includes(Number(input.limit))?Number(input.limit):12};
}
export const partySizes = search => Array.from({length:search.maxParty-search.minParty+1},(_,i)=>search.minParty+i);
export {safePublicURL} from './public-url.js';
export function bookingProvider(value) {
  const safe=safePublicURL(value); if(!safe)return null;
  const u=new URL(safe), h=u.hostname.replace(/^www\./,'');
  if(h==='resy.com' && /\/cities\/[^/]+\/(?:venues\/)?[^/]+/.test(u.pathname))return 'Resy';
  if(/^opentable\.(com|co\.uk|ca|com\.au|de|fr|es|it|jp|com\.mx|ie|nl|ae|hk|sg)$/.test(h) && /^\/(?:r\/|restref\/client)/.test(u.pathname))return 'OpenTable';
  if(h==='exploretock.com' && /^\/[^/]+/.test(u.pathname) && !/^\/(?:join|blog|city|search)(?:\/|$)/.test(u.pathname))return 'Tock';
  if(h==='sevenrooms.com' && /^\/(?:reservations|explore)\//.test(u.pathname))return 'SevenRooms';
  return 'Restaurant website';
}
export function bookingURL(value,search,size,time=search.startTime,date=search.date) {
  const safe=safePublicURL(value); if(!safe)throw Error('The booking link is not a public HTTPS address.');
  const u=new URL(safe),provider=bookingProvider(safe);
  if(provider==='Resy'){u.searchParams.set('date',date);u.searchParams.set('seats',size);u.searchParams.set('time','all-day');}
  if(provider==='OpenTable'){u.searchParams.set('dateTime',`${date}T${time}:00`);u.searchParams.set('covers',size);}
  if(provider==='Tock'){u.searchParams.set('date',date);u.searchParams.set('size',size);u.searchParams.set('time',time);}
  if(provider==='SevenRooms'){u.searchParams.set('date',date);u.searchParams.set('party_size',size);}
  return u.href;
}
export function travelDisposition(restaurant,search) {
  if(!isNYC(search.city)||search.includeLongTravel)return 'included';
  const neighborhood=normalizeName(restaurant.neighborhood),borough=normalizeName(restaurant.borough);
  if(['brooklyn','queens'].includes(borough)||/\b(brooklyn|queens|lower east side|east village)\b/.test(neighborhood)||['les','ev'].includes(neighborhood))return 'longer';
  if(!borough || !neighborhood)return 'unknown';
  return 'included';
}
export function parseJSON(text) {
  try {return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
  catch {throw Error('The research response was incomplete. Try a smaller restaurant shortlist.');}
}
const sourceKey = value => {const safe=safePublicURL(value);if(!safe)return '';const u=new URL(safe);u.search='';return u.href.replace(/\/$/,'');};
export function discoveryResult(raw, sources, search) {
  if(!Array.isArray(raw?.restaurants))throw Error('Research did not return a restaurant list.');
  const verified=new Set(sources.map(s=>sourceKey(s.url)).filter(Boolean)),seen=new Set();
  const restaurants=[];let excluded=0,unverified=0;
  for(const item of raw.restaurants.slice(0,40)) {
    if(typeof item.name!=='string'||!item.name.trim()||typeof item.address!=='string'||!item.address.trim()){unverified++;continue;}
    const evidence=(Array.isArray(item.evidence)?item.evidence:[]).filter(e=>verified.has(sourceKey(e.url))&&typeof e.detail==='string').slice(0,5).map(e=>({url:safePublicURL(e.url),title:String(e.title||'Source').slice(0,150),detail:e.detail.slice(0,700),published:String(e.published||'Date not provided').slice(0,80)}));
    if(!evidence.length){unverified++;continue;}
    const key=normalizeName(item.name+' '+item.address);if(seen.has(key))continue;seen.add(key);
    const r={id:String(restaurants.length+1),name:item.name.slice(0,150),address:item.address.slice(0,250),city:String(item.city||search.city).slice(0,120),neighborhood:String(item.neighborhood||'').slice(0,120),borough:String(item.borough||'').slice(0,80),reason:String(item.reason||'').slice(0,700),evidence,
      booking:[...new Set((Array.isArray(item.booking)?item.booking:[]).map(b=>safePublicURL(b.url)).filter(url=>url&&verified.has(sourceKey(url))))].slice(0,5).map(url=>({url,provider:bookingProvider(url)}))};
    if(!item.city||!matchesGeography(r,search)){unverified++;continue;}
    r.travel=travelDisposition(r,search);
    if(r.travel==='longer' && search.mode==='category'){excluded++;continue;}
    restaurants.push(r);
  }
  return {restaurants:restaurants.slice(0,search.limit),excluded,unverified,clarification:String(raw.clarification||'').slice(0,700),summary:String(raw.summary||'').slice(0,1200),researchedAt:new Date().toISOString()};
}
export function needsRestaurantChoice(result,search) {
  return search.mode==='restaurant' && (result.restaurants.length!==1 || normalizeName(result.restaurants[0].name)!==normalizeName(search.query) || !!result.clarification || result.restaurants[0].travel!=='included');
}
export const timeMinutes = time => {const [h,m]=time.split(':').map(Number);return h*60+m;};
export function searchTimes(provider,search) {
  if(!['OpenTable','Tock'].includes(provider))return [search.startTime];
  const start=timeMinutes(search.startTime),end=timeMinutes(search.endTime),times=[];
  for(let minute=start;minute<=end;minute+=60)times.push(`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`);
  if(times.at(-1)!==search.endTime)times.push(search.endTime);
  return times;
}
