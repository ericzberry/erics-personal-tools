// Eligibility and fit (docs/RESTAURANT_SEARCH_SPEC.md §6): which venues may
// be shown as choices, in what order, and why. Deterministic — the same facts
// give the same list — and separate from availability, which groups the
// eligible list without reordering it. Shared by both hosts; no DOM here.
import {checkConstraint,closureCheck,cuisineOf,venueArea,normalizeName,timeMinutes,FRESHNESS,areaLabel,describeValue,STANDING_PREFERENCE} from './restaurant-data.js';
export const WEIGHTS=Object.freeze({cuisine:25,atmosphere:20,geography:20,price:15,feedback:10,editorial:10});

// Every requirement must pass for a venue to be a choice. Any failure makes
// it an alternative the owner can ask to see; any unknown puts it under
// "Could not verify" with the missing fact named. A closed or moved venue is
// never a choice until that is resolved (§5.2, R25).
export function eligibility(venue,intent,{now=Date.now()}={}){
  const checks=intent.requirements.map(item=>checkConstraint(item,venue,{now,city:intent.city.name}));
  const closure=closureCheck(venue,{now});
  const status=closure?'excluded':checks.some(c=>c.status==='fail')?'excluded':checks.some(c=>c.status==='unknown')?'unverified':'eligible';
  return {status,checks,closure};
}

const match=(strong,partial=false)=>strong?1:partial?0.5:0;
function dimension(name,weight,{score,detail='',unknown=false}){return {dimension:name,weight,match:score,detail,unknown};}
function cuisineFit(venue,items,now){
  const labels=[...new Set([...(venue.cuisine||[]),...(venue.claims||[]).filter(c=>c.field==='cuisine'&&c.status==='supported').flatMap(c=>c.value)].flatMap(label=>cuisineOf(label).length?cuisineOf(label):[normalizeName(label)]))];
  if(!labels.length)return {score:0,unknown:true,detail:'Cuisine not established'};
  const wanted=items.flatMap(item=>Array.isArray(item.value)?item.value:[item.value]);
  const hit=wanted.filter(id=>labels.includes(id));
  return {score:match(hit.length>0),detail:hit.length?`${hit.map(label=>label.replace(/\b[a-z]/g,ch=>ch.toUpperCase())).join(', ')}`:`${labels.slice(0,2).join(', ')} rather than ${wanted.join(' or ')}`};
}
function atmosphereFit(venue,items,now){
  const claims=(venue.claims||[]).filter(c=>c.field==='atmosphere'&&c.status==='supported');
  if(!claims.length)return {score:0,unknown:true,detail:'Atmosphere not described by a dated review'};
  const known=claims.flatMap(c=>c.value.map(normalizeName));
  const wanted=items.flatMap(item=>item.value).map(normalizeName);
  const hit=wanted.filter(mood=>known.some(label=>label.includes(mood)));
  const against=wanted.some(mood=>mood==='quiet'&&known.some(label=>/loud|noisy|lively|buzzy/.test(label)));
  const weak=claims.every(c=>c.published&&Date.parse(c.published)&&now-Date.parse(c.published)>FRESHNESS.atmosphere);
  return {score:against?0:match(hit.length>0&&!weak,hit.length>0&&weak),detail:hit.length?`Described as ${claims.find(c=>c.value.some(v=>hit.includes(normalizeName(v))))?.value.join(', ')}`:against?`Reviews describe it as ${known.find(label=>/loud|noisy|lively|buzzy/.test(label))}`:`Reviews describe ${known.slice(0,2).join(', ')}`};
}
function geographyFit(venue,items,city){
  const area=venueArea(venue,city);
  if(!area)return {score:0,unknown:true,detail:'Neighborhood not established'};
  const wanted=items.filter(item=>item.operator==='in').flatMap(item=>item.value);
  if(wanted.includes(area.id))return {score:1,detail:area.label};
  // Next door counts for half: the West Side and Midtown are a short ride from
  // the Upper West Side; the outer boroughs are not.
  const near={[STANDING_PREFERENCE]:['ues','midtown','hells-kitchen','harlem'],ues:['uws','midtown'],midtown:['uws','ues','hells-kitchen','chelsea','flatiron'],chelsea:['west-village','flatiron','midtown','hells-kitchen'],'west-village':['chelsea','soho','flatiron','east-village'],soho:['west-village','tribeca','chinatown','les'],tribeca:['soho','fidi','chinatown'],flatiron:['chelsea','west-village','midtown','east-village'],les:['east-village','chinatown','soho'],'east-village':['les','flatiron','west-village'],fidi:['tribeca','chinatown'],chinatown:['les','soho','tribeca','fidi']};
  const adjacent=wanted.some(id=>(near[id]||[]).includes(area.id));
  return {score:match(false,adjacent),detail:adjacent?`${area.label}, near ${wanted.map(areaLabel).join(' or ')}`:area.label};
}
function priceFit(venue,items){
  const found=(venue.claims||[]).find(c=>c.field==='price_per_person'&&c.status==='supported'&&c.value);
  if(!found)return {score:0,unknown:true,detail:'Price not established'};
  const dollars=found.value.minorUnits/100,ceiling=Math.min(...items.map(item=>Number(item.value)));
  return {score:match(dollars<=ceiling,dollars<=ceiling*1.2),detail:`About $${Math.round(dollars)} per person`};
}
function feedbackFit(venue,feedback){
  const state=feedback?.[venue.id]?.state;
  if(state==='return')return {score:1,detail:'You would return'};
  if(state==='not_for_me')return {score:0,detail:'Marked not for me'};
  return {score:0.5,detail:''};
}
function editorialFit(venue,items,now,city){
  const results=items.map(item=>checkConstraint(item,venue,{now,city}));
  if(results.every(r=>r.status==='unknown'))return {score:0,unknown:true,detail:results[0].detail};
  const passed=results.filter(r=>r.status==='pass');
  return {score:match(passed.length===results.length,passed.length>0),detail:passed[0]?.detail||results.find(r=>r.status==='fail')?.detail||''};
}
// Fit after eligibility (§6.2). Only the dimensions the request or a standing
// preference actually asked for take part, and their weights are renormalised;
// an unknown scores nothing and is flagged, never treated as neutral. Explicit
// feedback is the one dimension that is always on once any feedback exists.
export function fit(venue,intent,{now=Date.now(),feedback={}}={}){
  const prefs=kind=>intent.preferences.filter(item=>item.kind===kind);
  const city=intent.city.name;
  const active=[];
  if(prefs('cuisine').length)active.push(dimension('cuisine',WEIGHTS.cuisine,cuisineFit(venue,prefs('cuisine'),now)));
  if(prefs('atmosphere').length||prefs('occasion').length)active.push(dimension('atmosphere',WEIGHTS.atmosphere,atmosphereFit(venue,[...prefs('atmosphere'),...prefs('occasion').map(item=>({value:[item.value==='date'?'romantic':item.value==='business'?'quiet':item.value==='family'?'casual':item.value==='celebration'?'lively':item.value]}))],now)));
  if(prefs('geography').length)active.push(dimension('geography',WEIGHTS.geography,geographyFit(venue,prefs('geography'),city)));
  if(prefs('price').length)active.push(dimension('price',WEIGHTS.price,priceFit(venue,prefs('price'))));
  if(Object.keys(feedback||{}).length)active.push(dimension('feedback',WEIGHTS.feedback,feedbackFit(venue,feedback)));
  if(prefs('editorial').length)active.push(dimension('editorial',WEIGHTS.editorial,editorialFit(venue,prefs('editorial'),now,city)));
  const total=active.reduce((sum,d)=>sum+d.weight,0);
  const score=total?active.reduce((sum,d)=>sum+d.weight*d.match,0)/total:null;
  return {score,contributions:active.map(d=>({...d,weight:total?d.weight/total:0})),unknowns:active.filter(d=>d.unknown).map(d=>d.detail)};
}
// How much of what was asked is established, for ordering when nothing was
// asked, and as the first tie-breaker (§6.2).
const supportedCount=venue=>(venue.claims||[]).filter(c=>c.status==='supported').length;
const identityRank={verified:0,corrected:1,ambiguous:2,unverified:3};
function decisiveFreshness(venue){
  const decisive=(venue.claims||[]).filter(c=>c.status==='supported'&&['michelin_stars','nyt_rank','nyt_stars','infatuation_score','price_per_person','dining_format','status'].includes(c.field));
  return decisive.length?Math.max(...decisive.map(c=>Date.parse(c.retrievedAt)||0)):0;
}
// The two largest supported contributions and the largest meaningful
// compromise, as words (§6.2). A venue with nothing active says what is known.
export function explain(venue,result,eligibility){
  const supported=result.contributions.filter(d=>d.match>0&&d.detail).sort((a,b)=>b.weight*b.match-a.weight*a.match).slice(0,2);
  const facts=eligibility.checks.filter(c=>c.status==='pass'&&c.detail&&c.constraint.origin!=='saved_preference').map(c=>c.detail);
  const reason=[...supported.map(d=>d.detail),...facts].filter((text,at,all)=>all.indexOf(text)===at).slice(0,3).join(' · ')||venue.reason||'';
  const compromise=result.contributions.filter(d=>!d.unknown&&d.match<1&&d.detail).sort((a,b)=>b.weight*(1-b.match)-a.weight*(1-a.match))[0]?.detail||'';
  return {reason,compromise,unknowns:result.unknowns};
}
function order(a,b){
  if((b.fit.score??-1)!==(a.fit.score??-1))return (b.fit.score??-1)-(a.fit.score??-1);
  const unknownA=a.fit.unknowns.length+a.eligibility.checks.filter(c=>c.status==='unknown').length,unknownB=b.fit.unknowns.length+b.eligibility.checks.filter(c=>c.status==='unknown').length;
  if(unknownA!==unknownB)return unknownA-unknownB;
  if(a.fit.score===null&&b.fit.score===null){
    if(supportedCount(b.venue)!==supportedCount(a.venue))return supportedCount(b.venue)-supportedCount(a.venue);
    if(identityRank[a.venue.identity]!==identityRank[b.venue.identity])return identityRank[a.venue.identity]-identityRank[b.venue.identity];
  }
  const freshA=decisiveFreshness(a.venue),freshB=decisiveFreshness(b.venue);
  if(freshA!==freshB)return freshB-freshA;
  return a.venue.id.localeCompare(b.venue.id);
}
// The whole answer for one intent: choices in order, then what could not be
// verified, then what does not match — each entry carrying its own checks so
// the screen can name the fact that placed it. "Not for me" venues leave
// discovery unless the search named them (§4.4).
export function rankVenues(venues,intent,{now=Date.now(),feedback={}}={}){
  const ranked=venues.map(venue=>{const e=eligibility(venue,intent,{now});const f=fit(venue,intent,{now,feedback});return {venue,eligibility:e,fit:f,explanation:explain(venue,f,e)};});
  const suppressed=ranked.filter(r=>feedback?.[r.venue.id]?.state==='not_for_me'&&intent.mode!=='named');
  const shown=ranked.filter(r=>!suppressed.includes(r));
  const sorted=list=>list.sort(order);
  return {
    eligible:sorted(shown.filter(r=>r.eligibility.status==='eligible')),
    unverified:sorted(shown.filter(r=>r.eligibility.status==='unverified')),
    excluded:sorted(shown.filter(r=>r.eligibility.status==='excluded')),
    suppressed:sorted(suppressed),
    arbitrary:shown.length>1&&ranked.every(r=>r.fit.score===null)
  };
}

// Inside one restaurant, the times closest to the one wanted come first, then
// the seating asked for, then the clock. A 5 pm table is not better because it
// sorts first (§6.2).
export function sortSlots(slots,{preferredTime='19:30',seating=''}={}){
  const wanted=timeMinutes(preferredTime),seat=normalizeName(seating);
  return [...slots].sort((a,b)=>{
    const da=Math.abs(timeMinutes(a.time)-wanted),db=Math.abs(timeMinutes(b.time)-wanted);
    if(da!==db)return da-db;
    if(seat){const sa=normalizeName(a.seating||'').includes(seat)?0:1,sb=normalizeName(b.seating||'').includes(seat)?0:1;if(sa!==sb)return sa-sb;}
    return timeMinutes(a.time)-timeMinutes(b.time)||String(a.seating||'').localeCompare(String(b.seating||''));
  });
}
// Availability groups a fit-ordered list without reordering it (§4.2). An
// observation older than five minutes leaves the found group and is history.
export const STALE_AFTER=FRESHNESS.availability;
export function availabilityGroup(summary,{now=Date.now()}={}){
  if(!summary)return 'checking';
  if(summary.status==='available')return summary.observedAt&&now-Date.parse(summary.observedAt)>STALE_AFTER?'stale':'found';
  if(['none_in_checked_window','not_released'].includes(summary.status))return 'none';
  return 'checking';
}
export const GROUPS=[{key:'found',title:'Times found'},{key:'checking',title:'Still checking / Check on provider'},{key:'stale',title:'Previously observed — recheck'},{key:'none',title:'No matching times observed'}];
export function groupResults(eligible,summaries={},{now=Date.now(),outing=null}={}){
  if(!outing)return [{key:'fit',title:'',items:eligible}];
  const buckets=Object.fromEntries(GROUPS.map(group=>[group.key,[]]));
  for(const item of eligible)buckets[availabilityGroup(summaries[item.venue.id],{now})].push(item);
  return GROUPS.map(group=>({...group,items:buckets[group.key]})).filter(group=>group.items.length);
}
