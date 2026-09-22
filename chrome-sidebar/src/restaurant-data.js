// The restaurant search's data contracts (docs/RESTAURANT_SEARCH_SPEC.md §8):
// the request as it is understood, the venue, the claims made about it and
// the deterministic comparison of a claim against what was asked for. Nothing
// here fetches, ranks or draws; it is shared by both hosts and the Worker, so
// it holds no DOM and no network.
import {safePublicURL} from './public-url.js';
export const SCHEMA_VERSION=2;
export const INTERPRETATION_VERSION='2026-09-22.1';
const DAY=86400000;
// Work limits and freshness are product policy, kept in one place (§3.4, §5.4,
// §7.3). They are adjusted here, never exposed as form controls.
export const LIMITS=Object.freeze({text:2000,requirements:12,preferences:12,dates:7,partySizes:4,people:20,candidates:24,verifyBatch:4,verifyPerSearch:12,shown:5,autoChecks:3,initialVisits:12,initialSeconds:60,runVisits:36,fallbackPerVenue:2,fallbackPerRun:6,readinessMs:15000,fallbackMs:20000,aliases:10,providers:5,claimsPerVenue:20,excerpt:500,note:1000,shortlistName:120,shortlistVenues:20,observationSlots:40,observationsPerRun:36});
export const FRESHNESS=Object.freeze({identity:30*DAY,status:7*DAY,menu:7*DAY,booking:7*DAY,edition:7*DAY,atmosphere:365*DAY,availability:5*60000});

export const normalizeName=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
const words=text=>` ${normalizeName(text)} `;
const hasPhrase=(text,phrase)=>words(text).includes(` ${normalizeName(phrase)} `);

// Cities the app knows the clock of. An outing is validated against the
// destination's own calendar (§3.1): Tokyo's dinner is not judged by New
// York's date. An unknown city keeps its name and uses the device's clock,
// which is said in the interpretation rather than assumed silently.
export const CITIES=[
  {name:'New York City',country:'US',timezone:'America/New_York',aliases:['nyc','new york','new york city','new york ny','manhattan','ny']},
  {name:'Los Angeles',country:'US',timezone:'America/Los_Angeles',aliases:['la','los angeles','los angeles ca']},
  {name:'San Francisco',country:'US',timezone:'America/Los_Angeles',aliases:['sf','san francisco']},
  {name:'Chicago',country:'US',timezone:'America/Chicago',aliases:['chicago']},
  {name:'Boston',country:'US',timezone:'America/New_York',aliases:['boston']},
  {name:'Washington, DC',country:'US',timezone:'America/New_York',aliases:['dc','washington','washington dc','washington d c']},
  {name:'Philadelphia',country:'US',timezone:'America/New_York',aliases:['philadelphia','philly']},
  {name:'Miami',country:'US',timezone:'America/New_York',aliases:['miami','miami beach']},
  {name:'New Orleans',country:'US',timezone:'America/Chicago',aliases:['new orleans','nola']},
  {name:'Austin',country:'US',timezone:'America/Chicago',aliases:['austin']},
  {name:'Denver',country:'US',timezone:'America/Denver',aliases:['denver']},
  {name:'Seattle',country:'US',timezone:'America/Los_Angeles',aliases:['seattle']},
  {name:'Las Vegas',country:'US',timezone:'America/Los_Angeles',aliases:['las vegas','vegas']},
  {name:'Toronto',country:'CA',timezone:'America/Toronto',aliases:['toronto']},
  {name:'Montreal',country:'CA',timezone:'America/Toronto',aliases:['montreal']},
  {name:'Mexico City',country:'MX',timezone:'America/Mexico_City',aliases:['mexico city','cdmx']},
  {name:'London',country:'GB',timezone:'Europe/London',aliases:['london']},
  {name:'Paris',country:'FR',timezone:'Europe/Paris',aliases:['paris']},
  {name:'Rome',country:'IT',timezone:'Europe/Rome',aliases:['rome','roma']},
  {name:'Milan',country:'IT',timezone:'Europe/Rome',aliases:['milan','milano']},
  {name:'Florence',country:'IT',timezone:'Europe/Rome',aliases:['florence','firenze']},
  {name:'Madrid',country:'ES',timezone:'Europe/Madrid',aliases:['madrid']},
  {name:'Barcelona',country:'ES',timezone:'Europe/Madrid',aliases:['barcelona']},
  {name:'Lisbon',country:'PT',timezone:'Europe/Lisbon',aliases:['lisbon','lisboa']},
  {name:'Amsterdam',country:'NL',timezone:'Europe/Amsterdam',aliases:['amsterdam']},
  {name:'Berlin',country:'DE',timezone:'Europe/Berlin',aliases:['berlin']},
  {name:'Copenhagen',country:'DK',timezone:'Europe/Copenhagen',aliases:['copenhagen']},
  {name:'Tokyo',country:'JP',timezone:'Asia/Tokyo',aliases:['tokyo']},
  {name:'Kyoto',country:'JP',timezone:'Asia/Tokyo',aliases:['kyoto']},
  {name:'Hong Kong',country:'HK',timezone:'Asia/Hong_Kong',aliases:['hong kong','hk']},
  {name:'Singapore',country:'SG',timezone:'Asia/Singapore',aliases:['singapore']},
  {name:'Sydney',country:'AU',timezone:'Australia/Sydney',aliases:['sydney']}
];
export function resolveCity(text){
  const key=normalizeName(String(text||'').split(',')[0]);
  const known=CITIES.find(city=>city.aliases.includes(key)||normalizeName(city.name)===key);
  if(known)return {name:known.name,country:known.country,timezone:known.timezone};
  return {name:String(text||'').trim().slice(0,120),country:'',timezone:''};
}
export const isNYC=text=>resolveCity(text).name==='New York City';
// Today's date where the outing is. A city the app has no clock for is read on
// the device's clock, which the interpretation says out loud.
export function dateIn(timezone='',now=new Date()){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone||undefined,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
  catch{return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
}
export const calendarDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
export const clockTime=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value));
export const timeMinutes=time=>{const [h,m]=String(time).split(':').map(Number);return h*60+m;};
export const minutesTime=minutes=>`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
// "19:15" as a person reads it on the destination's clock: 7:15 pm.
export function displayTime(time){
  if(!clockTime(time))return String(time||'');
  const minutes=timeMinutes(time),hour=Math.floor(minutes/60),minute=minutes%60;
  return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'am':'pm'}`;
}
export function displayDate(date,{weekday=true}={}){
  if(!calendarDate(date))return String(date||'');
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{timeZone:'UTC',...(weekday?{weekday:'short'}:{}),month:'short',day:'numeric'});
}
export const dayCount=(from,to)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/DAY)+1;
export function dateRange(from,to){
  const dates=[];
  for(let day=Date.parse(`${from}T00:00:00Z`);dates.length<LIMITS.dates;day+=DAY){
    const value=new Date(day).toISOString().slice(0,10);dates.push(value);
    if(value>=to)break;
  }
  return dates;
}

// Geography is canonical areas, never substrings (§6.1). New York has a canon
// because the standing preferences are about it; elsewhere an area is the
// words the owner typed, matched as a whole phrase.
export const NYC_AREAS=[
  {id:'uws',label:'Upper West Side',borough:'Manhattan',aliases:['uws','upper west side','upper west','lincoln square','columbus circle']},
  {id:'ues',label:'Upper East Side',borough:'Manhattan',aliases:['ues','upper east side','upper east','yorkville','carnegie hill','lenox hill']},
  {id:'midtown',label:'Midtown',borough:'Manhattan',aliases:['midtown','midtown east','midtown west','times square','theater district','theatre district','koreatown','k town','garment district','rockefeller center','turtle bay','sutton place']},
  {id:'hells-kitchen',label:'Hell’s Kitchen',borough:'Manhattan',aliases:['hells kitchen','hell s kitchen','hudson yards']},
  {id:'chelsea',label:'Chelsea',borough:'Manhattan',aliases:['chelsea','meatpacking','meatpacking district']},
  {id:'west-village',label:'West Village',borough:'Manhattan',aliases:['west village','greenwich village','the village','washington square']},
  {id:'soho',label:'SoHo',borough:'Manhattan',aliases:['soho','nolita','little italy','hudson square']},
  {id:'tribeca',label:'Tribeca',borough:'Manhattan',aliases:['tribeca']},
  {id:'flatiron',label:'Flatiron & Gramercy',borough:'Manhattan',aliases:['flatiron','gramercy','gramercy park','union square','kips bay','murray hill','nomad','madison square']},
  {id:'les',label:'Lower East Side',borough:'Manhattan',aliases:['les','lower east side','lower east','two bridges']},
  {id:'east-village',label:'East Village',borough:'Manhattan',aliases:['east village','ev','noho','alphabet city','bowery']},
  {id:'harlem',label:'Harlem & Upper Manhattan',borough:'Manhattan',aliases:['harlem','east harlem','morningside heights','hamilton heights','washington heights','inwood','manhattanville']},
  {id:'fidi',label:'Financial District',borough:'Manhattan',aliases:['financial district','fidi','battery park','battery park city','seaport','south street seaport','wall street']},
  {id:'chinatown',label:'Chinatown',borough:'Manhattan',aliases:['chinatown']},
  {id:'brooklyn',label:'Brooklyn',borough:'Brooklyn',aliases:['brooklyn','williamsburg','greenpoint','bushwick','park slope','cobble hill','carroll gardens','fort greene','dumbo','brooklyn heights','prospect heights','crown heights','bed stuy','bedford stuyvesant','red hook','gowanus','boerum hill','clinton hill','sunset park','bay ridge','downtown brooklyn','ditmas park','windsor terrace']},
  {id:'queens',label:'Queens',borough:'Queens',aliases:['queens','astoria','long island city','lic','flushing','jackson heights','sunnyside','woodside','forest hills','ridgewood','elmhurst','bayside','corona','rego park']},
  {id:'bronx',label:'The Bronx',borough:'Bronx',aliases:['bronx','the bronx','arthur avenue','riverdale','belmont']},
  {id:'staten-island',label:'Staten Island',borough:'Staten Island',aliases:['staten island']}
];
export const STANDING_EXCLUSIONS=['les','east-village','brooklyn','queens'];
export const STANDING_PREFERENCE='uws';
const areaByAlias=(text,city)=>{
  if(!isNYC(city))return null;
  const haystack=words(text);
  // Longest alias first, so "upper west side" is not read as "west village".
  const matches=NYC_AREAS.flatMap(area=>area.aliases.filter(alias=>haystack.includes(` ${alias} `)).map(alias=>({area,alias})));
  if(!matches.length)return null;
  matches.sort((a,b)=>b.alias.length-a.alias.length);
  return matches[0].area;
};
// One area for a phrase the owner typed, or a venue's own neighborhood line.
export function canonicalArea(text,city='New York City'){
  const clean=String(text||'').trim();
  if(!clean)return null;
  const nyc=areaByAlias(clean,city);
  if(nyc)return {id:nyc.id,label:nyc.label,borough:nyc.borough};
  if(isNYC(city))return null;
  return {id:normalizeName(clean).replace(/\s+/g,'-'),label:clean.slice(0,80),borough:''};
}
// Where a venue is, read from its borough first and its neighborhood second,
// and the city it says it is in must be the city asked for. A venue that names
// no area it can be placed in is unknown, never quietly nearby.
export function venueArea(venue,city='New York City'){
  const venueCity=resolveCity(venue.city||'').name,requested=resolveCity(city).name;
  if(venueCity&&venueCity!==requested)return {id:'elsewhere',label:venue.city,borough:'',city:venueCity};
  if(isNYC(city)){
    const borough=normalizeName(venue.borough||'');
    const outer=NYC_AREAS.find(area=>['brooklyn','queens','bronx','staten-island'].includes(area.id)&&area.aliases.includes(borough));
    if(outer)return {id:outer.id,label:outer.label,borough:outer.borough};
    const area=areaByAlias(venue.neighborhood||'',city)||areaByAlias(venue.address||'',city);
    return area?{id:area.id,label:area.label,borough:area.borough}:null;
  }
  return canonicalArea(venue.neighborhood||'',city);
}
export const areaLabel=id=>NYC_AREAS.find(area=>area.id===id)?.label||String(id||'').replace(/-/g,' ');

// A constraint is one thing the request requires or prefers (§8). The kinds,
// their operators and their qualifiers are closed lists; anything else is
// refused rather than carried along as an expression to evaluate later.
export const CONSTRAINT_KINDS=Object.freeze({
  cuisine:{operators:['eq','in','exclude'],qualifiers:[]},
  geography:{operators:['in','exclude'],qualifiers:['city']},
  price:{operators:['lt','lte','gt','gte'],qualifiers:['currency','basis','includes','alcohol']},
  editorial:{operators:['eq','in','lt','lte','gt','gte'],qualifiers:['publisher','system','edition','latest','list']},
  dining_format:{operators:['eq','exclude'],qualifiers:[]},
  dietary:{operators:['in'],qualifiers:['safety']},
  atmosphere:{operators:['in','exclude'],qualifiers:[]},
  occasion:{operators:['eq'],qualifiers:[]}
});
export const ORIGINS=['explicit_control','query','saved_preference'];
const qualifierOK=value=>['string','number','boolean'].includes(typeof value);
export function constraint(input={}){
  const kind=CONSTRAINT_KINDS[input.kind];
  if(!kind)throw Error(`Unknown constraint kind: ${input.kind}`);
  if(!kind.operators.includes(input.operator))throw Error(`Constraint ${input.kind} cannot use ${input.operator}.`);
  const value=Array.isArray(input.value)?input.value.map(item=>String(item).slice(0,80)).slice(0,12):typeof input.value==='number'?input.value:String(input.value??'').slice(0,120);
  if(Array.isArray(value)?!value.length:value==='')throw Error(`Constraint ${input.kind} needs a value.`);
  const qualifiers={};
  for(const [key,item] of Object.entries(input.qualifiers||{})){
    if(!kind.qualifiers.includes(key))throw Error(`Constraint ${input.kind} cannot carry ${key}.`);
    if(!qualifierOK(item))throw Error(`Constraint qualifier ${key} must be a string, number or boolean.`);
    qualifiers[key]=typeof item==='string'?item.slice(0,80):item;
  }
  if(!ORIGINS.includes(input.origin))throw Error('A constraint needs an origin.');
  return {id:String(input.id||`${input.kind}:${input.operator}:${Array.isArray(value)?value.join('|'):value}`).slice(0,160),kind:input.kind,operator:input.operator,value,qualifiers,origin:input.origin};
}

// What the words of a request establish. "Exactly", "must", "only", "under",
// "no" and an allergy make a requirement; "prefer", "ideally", "near" and the
// atmosphere words make a preference (§3.2). The list is deliberately plain:
// what it does not recognise is left in the text for the research to read.
export const CUISINES=[
  ['italian',['italian','pasta','trattoria','osteria']],['french',['french','bistro','brasserie']],['japanese',['japanese','izakaya','yakitori']],['sushi',['sushi','omakase']],['ramen',['ramen']],
  ['chinese',['chinese','sichuan','szechuan','cantonese','dim sum','hunan','shanghainese']],['korean',['korean','korean bbq','korean barbecue']],['thai',['thai']],['vietnamese',['vietnamese','pho']],['indian',['indian','south indian','north indian']],
  ['mexican',['mexican','tacos','taqueria']],['spanish',['spanish','tapas','basque']],['mediterranean',['mediterranean','levantine']],['greek',['greek']],['turkish',['turkish']],['middle eastern',['middle eastern','lebanese','israeli','persian','iranian']],
  ['american',['american','new american','contemporary american']],['steakhouse',['steakhouse','steak house','steak','steaks']],['seafood',['seafood','fish','oyster bar','oysters']],['pizza',['pizza','pizzeria']],['burgers',['burgers','burger']],['bbq',['bbq','barbecue','barbeque']],
  ['ethiopian',['ethiopian']],['peruvian',['peruvian','ceviche']],['brazilian',['brazilian']],['argentine',['argentine','argentinian']],['caribbean',['caribbean','jamaican','cuban','puerto rican']],['southern',['southern','soul food','cajun','creole']],
  ['german',['german','austrian']],['british',['british','english','gastropub']],['scandinavian',['scandinavian','nordic','danish','swedish']],['portuguese',['portuguese']],['filipino',['filipino']],['malaysian',['malaysian','singaporean']],['indonesian',['indonesian']],
  ['vegetarian',['vegetarian restaurant','plant based','plant-based']],['vegan',['vegan restaurant']],['kosher',['kosher restaurant']],['wine bar',['wine bar','natural wine']],['cocktail bar',['cocktail bar']],['brunch',['brunch']]
];
export const cuisineOf=text=>{
  const haystack=words(text);
  return CUISINES.filter(([,aliases])=>aliases.some(alias=>haystack.includes(` ${normalizeName(alias)} `))).map(([id])=>id);
};
const DIETARY=[['vegetarian',['vegetarian','vegetarian options','veggie']],['vegan',['vegan','vegan options']],['gluten-free',['gluten free','gluten-free','celiac','coeliac']],['nut-free',['nut allergy','nut free','nut-free','peanut allergy','tree nut']],['dairy-free',['dairy free','dairy-free','lactose']],['shellfish-free',['shellfish allergy','shellfish free']],['kosher',['kosher']],['halal',['halal']],['pescatarian',['pescatarian','pescetarian']]];
const ALLERGY=/\b(allerg\w*|celiac|coeliac|intoleran\w*|nut[- ]free|shellfish[- ]free)\b/i;
const ATMOSPHERE=[['quiet',['quiet','somewhere we can talk','can talk','conversation','not loud','not too loud','calm','low key','low-key','relaxed']],['romantic',['romantic','intimate','candlelit']],['lively',['lively','buzzy','fun','energetic','scene','loud is fine']],['cozy',['cozy','cosy','warm']],['casual',['casual','laid back','laid-back','neighborhood spot','neighbourhood spot']],['upscale',['upscale','fancy','fine dining','special occasion','white tablecloth','elegant','dressy']],['outdoor',['outdoor seating','outdoors','patio','garden','al fresco','rooftop']],['bar seating',['bar seating','eat at the bar','counter seating']]];
const OCCASION=[['date',['date night','a date','date']],['birthday',['birthday']],['anniversary',['anniversary']],['business',['business dinner','client dinner','work dinner','colleagues']],['family',['with kids','kids','family dinner','children','family friendly','family-friendly']],['group',['group','large party','big group','party of']],['celebration',['celebration','celebrate','graduation','promotion']]];
const FORMATS=[['tasting menu',['tasting menu','tasting','degustation','set menu']],['omakase',['omakase']],['prix fixe',['prix fixe','prix-fixe','fixed price']],['a la carte',['a la carte','à la carte','ala carte']],['counter',['chef s counter','counter']]];
const NUMBER_WORDS={one:1,two:2,three:3,four:4,five:5};
const numberOf=text=>NUMBER_WORDS[normalizeName(text)]??Number(text);
const GENERIC=/\b(restaurant|restaurants|place|places|spot|spots|somewhere|dinner|lunch|brunch|table|food|good|great|best|nice|cheap|near|around|close|recommend\w*|anything|something|ideas?|options?|quiet|fun|romantic|new|top|rated|stars?|michelin|nyt|infatuation|under|over|budget|menu|cuisine|neighborhood|neighbourhood|uptown|downtown|for|with|and|or|the|a|an|in|on|at|to|of|my|we|us|our|i|me)\b/i;

export function interpretRequest(text,{city='New York City'}={}){
  const raw=String(text||'').trim().slice(0,LIMITS.text);
  const requirements=[],preferences=[],notes=[];
  const add=(list,kind,operator,value,qualifiers={})=>{
    const item=constraint({kind,operator,value,qualifiers,origin:'query'});
    if(!list.some(existing=>existing.id===item.id))list.push(item);
  };
  const lower=raw.toLowerCase();
  const soft=/\b(prefer\w*|ideally|maybe|would be nice|nice to have|if possible|or similar|something like|leaning)\b/i.test(lower);
  let recognized=false;
  // Editorial criteria, each in the publication's own units (§5.2).
  const michelin=/\b(exactly|at least|minimum|no more than|at most|up to)?\s*(one|two|three|1|2|3)\s+michelin[\s-]*stars?\b/i.exec(raw);
  if(michelin){
    recognized=true;
    const bound=(michelin[1]||'').toLowerCase();
    const operator=/at least|minimum/.test(bound)?'gte':/no more than|at most|up to/.test(bound)?'lte':'eq';
    add(requirements,'editorial',operator,numberOf(michelin[2]),{publisher:'Michelin',system:'stars'});
  }else if(/\bmichelin[\s-]*(starred|star)\b/i.test(raw)){recognized=true;add(requirements,'editorial','gte',1,{publisher:'Michelin',system:'stars'});}
  if(/\bbib gourmand\b/i.test(raw)){recognized=true;add(requirements,'editorial','eq','bib gourmand',{publisher:'Michelin',system:'bib'});}
  const infatuation=/\binfatuation\s*(?:score|rating|rated)?\s*(above|over|higher than|more than|greater than|>|at least|of at least|>=|of|=|is|rated|:)?\s*(\d{1,2}(?:\.\d)?)\b/i.exec(raw);
  if(infatuation){
    recognized=true;
    const word=(infatuation[1]||'').toLowerCase();
    const operator=/at least|>=/.test(word)?'gte':/above|over|higher|more|greater|>/.test(word)?'gt':'gte';
    add(requirements,'editorial',operator,Number(infatuation[2]),{publisher:'The Infatuation',system:'score'});
  }
  const nytList=/\b(?:nyt|new york times|the times|times)\s*(?:'s|s)?\s*(?:top|best)\s*(\d{1,3})\b/i.exec(raw);
  const year=/\b(20\d{2})\b/.exec(raw);
  if(nytList){
    recognized=true;
    const latest=!year;
    add(requirements,'editorial','lte',Number(nytList[1]),{publisher:'The New York Times',system:'rank',list:`Best restaurants in ${resolveCity(city).name}`,latest,...(year?{edition:year[1]}:{})});
    if(latest)notes.push('NYT list read as the latest edition.');
  }
  const nytStars=/\b(one|two|three|four|1|2|3|4)\s+(?:nyt|times|new york times)\s+stars?\b/i.exec(raw)||/\b(?:nyt|times|new york times)\s+(one|two|three|four|1|2|3|4)\s+stars?\b/i.exec(raw);
  if(nytStars){recognized=true;add(requirements,'editorial','gte',numberOf(nytStars[1]),{publisher:'The New York Times',system:'stars'});}
  // Money is a requirement when it is a ceiling and a preference when it is a
  // feeling. "All-in" makes tax, tip and fees part of the figure (§3.2).
  const price=/\b(under|below|less than|no more than|at most|max(?:imum)?|up to|around|about|roughly|~)\s*\$?\s*(\d{2,4})\s*(?:\$|dollars|usd|bucks)?\s*(pp|per person|a head|per head|each|a person|all[- ]in)?/i.exec(raw);
  if(price){
    recognized=true;
    const amount=Number(price[2]),vague=/around|about|roughly|~/.test(price[1].toLowerCase());
    const allIn=/all[- ]in/i.test(raw);
    const qualifiers={currency:'USD',basis:allIn?'all-in':'food',includes:allIn?'food,tax,tip,fees':'food',alcohol:/\b(with|including|incl\.?)\s+(drinks|wine|cocktails|alcohol|booze)\b/i.test(raw)};
    add(vague||soft?preferences:requirements,'price','lte',amount,qualifiers);
  }
  // Formats. "No tasting menu" refuses one; "tasting menu" asks for one.
  for(const [format,aliases] of FORMATS){
    const hit=aliases.find(alias=>hasPhrase(raw,alias));
    if(!hit)continue;
    recognized=true;
    const refused=new RegExp(`\\b(no|not|without|skip|avoid|don t want|dont want|nothing)\\s+(?:a |an |the )?${normalizeName(hit).replace(/ /g,'\\s+')}`,'i').test(normalizeName(raw));
    if(refused)add(requirements,'dining_format','exclude',format);
    else if(format==='a la carte')add(requirements,'dining_format','exclude','tasting menu');
    else add(soft?preferences:requirements,'dining_format','eq',format);
  }
  const dietary=DIETARY.filter(([,aliases])=>aliases.some(alias=>hasPhrase(raw,alias))).map(([id])=>id);
  if(dietary.length){
    recognized=true;
    const allergy=ALLERGY.test(raw);
    add(requirements,'dietary','in',dietary,{safety:allergy?'allergy':'preference'});
    if(allergy)notes.push('Allergy handling is confirmed with the restaurant, not from a menu.');
  }
  for(const [mood,aliases] of ATMOSPHERE)if(aliases.some(alias=>hasPhrase(raw,alias))){recognized=true;add(preferences,'atmosphere','in',[mood]);}
  if(/\b(too loud|loud)\b/i.test(raw)&&/\b(not|no|isn t|isnt|too)\b/i.test(raw)&&!preferences.some(p=>p.kind==='atmosphere'&&p.value.includes('quiet')))add(preferences,'atmosphere','in',['quiet']);
  for(const [occasion,aliases] of OCCASION)if(aliases.some(alias=>hasPhrase(raw,alias))){recognized=true;add(preferences,'occasion','eq',occasion);break;}
  // Cuisine. Named plainly it is what is wanted; softened it is a leaning;
  // "no sushi" rules one out.
  const cuisines=cuisineOf(raw).filter(id=>!(dietary.includes(id)));
  if(cuisines.length){
    recognized=true;
    const refused=cuisines.filter(id=>{const aliases=CUISINES.find(([key])=>key===id)[1];return aliases.some(alias=>new RegExp(`\\b(no|not|without|avoid|skip|anything but)\\s+(?:a |an |the )?${normalizeName(alias).replace(/ /g,'\\s+')}\\b`).test(normalizeName(raw)));});
    const wanted=cuisines.filter(id=>!refused.includes(id));
    if(refused.length)add(requirements,'cuisine','exclude',refused);
    if(wanted.length)add(soft?preferences:requirements,'cuisine',wanted.length>1?'in':'eq',wanted.length>1?wanted:wanted[0]);
  }
  // Geography. "Near" and "around" lean; "in" and a bare area name require.
  // Naming a standing exclusion sets it aside for this search (§6.1).
  let includeLongTravel=/\b(anywhere|any neighborhood|any neighbourhood|don t mind travel\w*|happy to travel|willing to travel|outer boroughs|all boroughs|longer travel)\b/i.test(normalizeName(raw));
  const areas=isNYC(city)?NYC_AREAS.flatMap(area=>area.aliases.filter(alias=>hasPhrase(raw,alias)).map(alias=>({area,alias}))).sort((a,b)=>b.alias.length-a.alias.length):[];
  const seen=new Set();
  for(const {area,alias} of areas){
    if(seen.has(area.id))continue;seen.add(area.id);recognized=true;
    const before=normalizeName(raw).split(` ${alias} `)[0].split(' ').slice(-3).join(' ');
    const near=/\b(near|around|close to|by|next to|ideally|preferably)\b/.test(before)||soft;
    const excluded=/\b(not|no|avoid|except|anywhere but|outside)\b/.test(before);
    if(excluded)add(requirements,'geography','exclude',[area.id],{city:resolveCity(city).name});
    else add(near?preferences:requirements,'geography','in',[area.id],{city:resolveCity(city).name});
    if(STANDING_EXCLUSIONS.includes(area.id)&&!excluded){includeLongTravel=true;notes.push(`${area.label} asked for, so the standing exclusion is set aside for this search.`);}
  }
  // A name is what is left when nothing above was recognised and the words do
  // not describe a dinner. A misspelt name still reads as a name; the research
  // corrects it and says so (§3.3).
  // A name often carries a cuisine word — Example Bistro, Sushi Nakazawa, Bar
  // Boulud — so a short Title Case phrase whose only recognised criterion is
  // the cuisine is still a name, and a name carries no criteria at all: the
  // venue is what is wanted, wherever it is (§3.3).
  const quoted=/["“]([^"”]{2,120})["”]/.exec(raw);
  const wordList=raw.split(/\s+/).filter(Boolean),wordCount=wordList.length;
  const onlyCuisine=recognized&&requirements.every(item=>item.kind==='cuisine')&&!preferences.length;
  const titleCase=wordCount>=2&&wordList.filter(word=>/^[A-Z]/.test(word)).length>=wordCount-1;
  const named=!!quoted||(wordCount>0&&wordCount<=6&&!GENERIC.test(raw)&&(!recognized||(onlyCuisine&&titleCase)));
  if(named)return {mode:'named',name:(quoted?quoted[1]:raw).trim().slice(0,150),requirements:[],preferences:[],notes:[],includeLongTravel:true};
  return {mode:'discovery',name:'',requirements:requirements.slice(0,LIMITS.requirements),preferences:preferences.slice(0,LIMITS.preferences),notes,includeLongTravel};
}

// The standing preferences the previous search carried (§6.1), as constraints
// with their own origin so a query can be seen to have overridden them.
export function standingConstraints(city,{includeLongTravel=false}={}){
  if(!isNYC(city))return {requirements:[],preferences:[]};
  const cityName=resolveCity(city).name;
  return {
    requirements:includeLongTravel?[]:[constraint({kind:'geography',operator:'exclude',value:STANDING_EXCLUSIONS,qualifiers:{city:cityName},origin:'saved_preference'})],
    preferences:[constraint({kind:'geography',operator:'in',value:[STANDING_PREFERENCE],qualifiers:{city:cityName},origin:'saved_preference'})]
  };
}

// The form, understood: one SearchIntent (§8). Controls the owner set win over
// words in the text, and every resolution of a conflict is written into `notes`
// so the summary can show it rather than choose silently (§3.2).
export function buildIntent(form={},{now=new Date(),id=crypto.randomUUID(),revision=1,mode=''}={}){
  const text=String(form.text||'').trim().slice(0,LIMITS.text);
  const city=resolveCity(form.city);
  if(!text)throw Error('Describe the dinner or name the restaurant.');
  if(!city.name)throw Error('Enter a city.');
  const read=interpretRequest(text,{city:city.name});
  const finalModeOf=()=>['named','discovery'].includes(mode)?mode:read.mode;
  const notes=[...read.notes];
  if(!city.timezone)notes.push(`${city.name} is read on this device’s clock.`);
  const today=dateIn(city.timezone,now);
  const date=String(form.date||'').trim();
  let outing=null;
  if(date){
    if(!calendarDate(date))throw Error('Choose a valid date.');
    if(date<today)throw Error(`Choose a date on or after ${displayDate(today)} in ${city.name}.`);
    const endDate=form.flexibleDates&&form.endDate?String(form.endDate).trim():date;
    if(!calendarDate(endDate)||endDate<date)throw Error('Choose a last date on or after the first date.');
    if(dayCount(date,endDate)>LIMITS.dates)throw Error(`Check at most ${LIMITS.dates} dates in one search.`);
    const people=Number(form.people),maxPeople=form.flexibleParty?Number(form.maxPeople):people;
    const size=n=>Number.isInteger(n)&&n>=1&&n<=LIMITS.people;
    if(!size(people))throw Error(`Enter a party size from 1 to ${LIMITS.people} people.`);
    if(!size(maxPeople)||maxPeople<people)throw Error('Choose a largest party size at or above the party size.');
    if(maxPeople-people+1>LIMITS.partySizes)throw Error(`Check at most ${LIMITS.partySizes} party sizes in one search. Narrow the range before checking availability.`);
    const preferredTime=String(form.time||'19:30');
    if(!clockTime(preferredTime))throw Error('Choose a time.');
    const window=[30,60,90,120,180].includes(Number(form.window))?Number(form.window):60;
    const minutes=timeMinutes(preferredTime);
    const start=Math.max(0,minutes-window),end=Math.min(23*60+59,minutes+window);
    if(minutes+window>23*60+59)notes.push('The time window stops at midnight; the next day is a separate date.');
    if(minutes-window<0)notes.push('The time window starts at midnight.');
    outing={dates:dateRange(date,endDate),preferredDate:date,partySizes:Array.from({length:maxPeople-people+1},(_,i)=>people+i),preferredParty:people,preferredTime,startTime:minutesTime(start),endTime:minutesTime(end)};
  }
  const requirements=[...read.requirements],preferences=[...read.preferences];
  const control=(list,kind,operator,value,qualifiers={})=>{
    const item=constraint({kind,operator,value,qualifiers,origin:'explicit_control'});
    for(const target of [requirements,preferences]){
      const at=target.findIndex(existing=>existing.kind===kind&&existing.origin==='query'&&(kind!=='geography'||existing.operator===operator));
      if(at>=0){
        const previous=target[at];
        if(JSON.stringify(previous.value)!==JSON.stringify(item.value))notes.push(`${kindLabel(kind)} taken from the form (the text said ${describeValue(previous)}).`);
        target.splice(at,1);
      }
    }
    list.push(item);
  };
  const spend=Number(String(form.maxSpend||'').replace(/[^0-9.]/g,''));
  if(form.maxSpend&&(!Number.isFinite(spend)||spend<=0))throw Error('Enter the most to spend per person as a number.');
  if(spend>0)control(requirements,'price','lte',Math.round(spend),{currency:'USD',basis:'food',includes:'food',alcohol:false});
  const dietary=String(form.dietary||'').trim();
  if(dietary){
    const matched=DIETARY.filter(([,aliases])=>aliases.some(alias=>hasPhrase(dietary,alias))).map(([id])=>id);
    control(requirements,'dietary','in',matched.length?matched:[dietary.slice(0,80)],{safety:ALLERGY.test(dietary)?'allergy':'preference'});
  }
  if(form.format==='no-tasting')control(requirements,'dining_format','exclude','tasting menu');
  else if(form.format==='tasting')control(requirements,'dining_format','eq','tasting menu');
  const neighborhood=String(form.neighborhood||'').trim();
  if(neighborhood){
    const area=canonicalArea(neighborhood,city.name);
    if(!area)throw Error(`${neighborhood} is not a neighborhood the app can place in ${city.name}. Name the area another way.`);
    control(preferences,'geography','in',[area.id],{city:city.name});
    if(STANDING_EXCLUSIONS.includes(area.id))read.includeLongTravel=true;
  }
  const includeLongTravel=!!form.includeLongTravel||read.includeLongTravel;
  // A named venue is wanted wherever it is; the standing areas apply to discovery.
  const standing=finalModeOf()==='named'?{requirements:[],preferences:[]}:standingConstraints(city.name,{includeLongTravel});
  for(const item of standing.requirements)if(!requirements.some(existing=>existing.kind==='geography'&&existing.operator==='exclude'))requirements.push(item);
  for(const item of standing.preferences)if(![...requirements,...preferences].some(existing=>existing.kind==='geography'&&existing.operator==='in'))preferences.push(item);
  if(requirements.length>LIMITS.requirements||preferences.length>LIMITS.preferences)throw Error('That is more than the search can hold. Say less at once.');
  const finalMode=finalModeOf();
  return {schemaVersion:SCHEMA_VERSION,id,revision,text,mode:finalMode,name:finalMode==='named'?(read.name||text.slice(0,150)):'',city,venueId:null,outing,requirements,preferences,includeLongTravel,notes,interpretationVersion:INTERPRETATION_VERSION};
}
export const kindLabel=kind=>({cuisine:'Cuisine',geography:'Area',price:'Budget',editorial:'Rating',dining_format:'Menu',dietary:'Dietary',atmosphere:'Atmosphere',occasion:'Occasion'}[kind]||kind);
const titleCase=text=>String(text).replace(/\b[a-z]/g,ch=>ch.toUpperCase());
// One constraint in the owner's own terms, for the query summary.
export function describeValue(item){
  const value=Array.isArray(item.value)?item.value:[item.value];
  if(item.kind==='editorial'){
    const q=item.qualifiers,n=value[0];
    if(q.system==='stars')return `${item.operator==='eq'?'Exactly ':item.operator==='gte'?'At least ':item.operator==='lte'?'At most ':''}${n} ${q.publisher} star${n===1?'':'s'}`;
    if(q.system==='bib')return 'Michelin Bib Gourmand';
    if(q.system==='score')return `${q.publisher} ${item.operator==='gt'?'above':'at least'} ${n}`;
    if(q.system==='rank')return `NYT top ${n}${q.edition?` (${q.edition})`:' (latest)'}`;
    return `${q.publisher} ${n}`;
  }
  if(item.kind==='price')return `${item.operator==='lte'||item.operator==='lt'?'Under':'Over'} $${value[0]} per person${item.qualifiers.basis==='all-in'?' all-in':''}`;
  if(item.kind==='geography')return `${item.operator==='exclude'?'Not ':''}${value.map(areaLabel).join(', ')}`;
  if(item.kind==='dining_format')return item.operator==='exclude'?`No ${value[0]}`:titleCase(value[0]);
  if(item.kind==='cuisine')return `${item.operator==='exclude'?'No ':''}${value.map(titleCase).join(' or ')}`;
  if(item.kind==='dietary')return titleCase(value.join(', '));
  if(item.kind==='atmosphere')return titleCase(value.join(', '));
  if(item.kind==='occasion')return titleCase(value[0]);
  return value.join(', ');
}
export function describeOuting(outing){
  if(!outing)return '';
  const dates=outing.dates.length>1?`${displayDate(outing.dates[0])} – ${displayDate(outing.dates.at(-1))}`:displayDate(outing.preferredDate);
  const sizes=outing.partySizes.length>1?`${outing.partySizes[0]}–${outing.partySizes.at(-1)} people`:`${outing.preferredParty} ${outing.preferredParty===1?'person':'people'}`;
  return `${dates} · ${sizes} · ${displayTime(outing.startTime)}–${displayTime(outing.endTime)}`;
}
export function summarizeIntent(intent){
  const parts=[];
  if(intent.mode==='named')parts.push(intent.name);
  for(const item of intent.requirements)if(item.origin!=='saved_preference')parts.push(describeValue(item));
  for(const item of intent.preferences)if(item.origin!=='saved_preference')parts.push(item.kind==='geography'?`${describeValue(item)} preferred`:describeValue(item));
  else if(item.kind==='geography')parts.push(`${areaLabel(item.value[0])} preferred`);
  if(intent.includeLongTravel&&intent.mode!=='named'&&isNYC(intent.city.name))parts.push('Longer travel included');
  if(intent.outing)parts.push(describeOuting(intent.outing));
  if(intent.city.name!=='New York City')parts.push(intent.city.name);
  return parts.filter(Boolean);
}

// The combinations an outing asks to be checked, most wanted first (§7.3):
// the preferred date and party, then the other dates in order, each with the
// party sizes by their distance from the preferred one.
export function outingCombinations(outing){
  if(!outing)return [];
  const dates=[outing.preferredDate,...outing.dates.filter(date=>date!==outing.preferredDate)];
  const sizes=[...outing.partySizes].sort((a,b)=>Math.abs(a-outing.preferredParty)-Math.abs(b-outing.preferredParty)||a-b);
  return dates.flatMap(date=>sizes.map(partySize=>({date,partySize})));
}

// The legacy Worker request (§11 compatibility parser): what an older Worker
// route understands, built from the intent so no client has two forms.
export function legacySearch(intent,today=dateIn(intent.city.timezone)){
  const named=intent.mode==='named',outing=intent.outing;
  const area=[...intent.requirements,...intent.preferences].find(item=>item.kind==='geography'&&item.operator==='in'&&item.origin!=='saved_preference');
  const search={mode:named?'restaurant':'category',query:named?intent.name:intent.text,city:intent.city.name,neighborhood:area?areaLabel(area.value[0]):'',
    date:outing?.preferredDate||today,endDate:outing?outing.dates.at(-1):today,flexibleDates:!!outing&&outing.dates.length>1,flexible:!!outing&&outing.partySizes.length>1,
    minParty:outing?.partySizes[0]||2,maxParty:outing?outing.partySizes.at(-1):2,startTime:outing?.startTime||'17:00',endTime:outing?.endTime||'22:00',includeLongTravel:!!intent.includeLongTravel,limit:LIMITS.candidates};
  if(!search.flexible)search.partySize=search.minParty;
  return search;
}

// Claims (§5.1, §8): one fact about one venue, with the evidence it rests on.
export const CLAIM_FIELDS=Object.freeze({
  michelin_stars:{type:'number',publisher:'Michelin',system:'stars'},michelin_bib:{type:'boolean',publisher:'Michelin',system:'bib'},
  nyt_rank:{type:'number',publisher:'The New York Times',system:'rank'},nyt_stars:{type:'number',publisher:'The New York Times',system:'stars'},
  infatuation_score:{type:'number',publisher:'The Infatuation',system:'score'},
  price_per_person:{type:'money'},dining_format:{type:'text'},cuisine:{type:'list'},area:{type:'text'},address:{type:'text'},status:{type:'text'},dietary:{type:'list'},atmosphere:{type:'list'},booking:{type:'url'},menu:{type:'url'}
});
export const CLAIM_STATUSES=['supported','contradicted','unknown'];
export function claim(input={}){
  const field=CLAIM_FIELDS[input.field];
  if(!field)throw Error(`Unknown claim field: ${input.field}`);
  if(!CLAIM_STATUSES.includes(input.status))throw Error('A claim needs a status.');
  let value=input.value;
  if(field.type==='number'){value=Number(value);if(!Number.isFinite(value))value=null;}
  else if(field.type==='boolean')value=value===true;
  else if(field.type==='list')value=(Array.isArray(value)?value:[value]).filter(item=>typeof item==='string'&&item.trim()).map(item=>item.trim().slice(0,80)).slice(0,12);
  else if(field.type==='money')value=value&&typeof value==='object'&&Number.isInteger(value.minorUnits)?{minorUnits:value.minorUnits,currency:String(value.currency||'USD').slice(0,3),basis:String(value.basis||'food').slice(0,40)}:null;
  else if(field.type==='url')value=safePublicURL(value);
  else value=typeof value==='string'?value.trim().slice(0,200):null;
  const source={url:safePublicURL(input.source?.url)||'',title:String(input.source?.title||'').slice(0,150),publisher:String(input.source?.publisher||field.publisher||'').slice(0,80)};
  return {id:String(input.id||crypto.randomUUID()),venueId:String(input.venueId||''),field:input.field,value,units:String(input.units||field.system||'').slice(0,40),basis:String(input.basis||'').slice(0,40),status:input.status,source,
    excerpt:String(input.excerpt||'').slice(0,LIMITS.excerpt),retrievedAt:String(input.retrievedAt||''),published:String(input.published||'').slice(0,80),edition:String(input.edition||'').slice(0,40),latest:input.latest===true,
    expiresAt:String(input.expiresAt||''),extractor:String(input.extractor||'').slice(0,40),reason:String(input.reason||'').slice(0,200)};
}
const fresh=(item,now)=>!item.expiresAt||Date.parse(item.expiresAt)>now;
const editorialField=q=>Object.entries(CLAIM_FIELDS).find(([,field])=>field.publisher===q.publisher&&field.system===q.system)?.[0];
const compare=(operator,left,right)=>({eq:left===right,in:false,lt:left<right,lte:left<=right,gt:left>right,gte:left>=right})[operator];
// Pass, fail or unknown (§6.1), with the missing fact named. Only a supported
// claim that is still fresh can pass; a lead, a stale claim or a claim about
// another edition leaves the requirement unknown rather than satisfied.
export function checkConstraint(item,venue,{now=Date.now(),city='New York City'}={}){
  const claims=(venue.claims||[]).filter(c=>c.status==='supported'&&fresh(c,now));
  const result=(status,detail,found=null)=>({constraint:item,status,detail,claim:found});
  if(item.kind==='editorial'){
    const field=editorialField(item.qualifiers);
    if(!field)return result('unknown',`${item.qualifiers.publisher} ${item.qualifiers.system} is not a rating the app can verify.`);
    const found=(venue.claims||[]).filter(c=>c.field===field);
    const supported=found.filter(c=>c.status==='supported'&&fresh(c,now));
    if(!supported.length)return result('unknown',`${describeValue(item)}: not verified from ${item.qualifiers.publisher}.`,found[0]||null);
    if(item.qualifiers.edition){
      const edition=supported.find(c=>c.edition===item.qualifiers.edition);
      if(!edition)return result('unknown',`${describeValue(item)}: verified for ${supported[0].edition||'an unstated edition'}, not ${item.qualifiers.edition}.`,supported[0]);
      return result(compare(item.operator,edition.value,item.value)?'pass':'fail',`${item.qualifiers.publisher} ${item.qualifiers.edition}: ${edition.value}`,edition);
    }
    if(item.qualifiers.latest){
      const latest=supported.find(c=>c.latest);
      if(!latest)return result('unknown',`${describeValue(item)}: the latest edition is not established; ${supported[0].edition||'an earlier edition'} was verified.`,supported[0]);
      return result(compare(item.operator,latest.value,item.value)?'pass':'fail',`${item.qualifiers.publisher} ${latest.edition||'latest'}: ${latest.value}`,latest);
    }
    const current=supported.sort((a,b)=>String(b.edition).localeCompare(String(a.edition)))[0];
    if(item.qualifiers.system==='bib')return result(current.value===true?'pass':'fail',`${item.qualifiers.publisher}: ${current.value?'Bib Gourmand':'no Bib Gourmand'}`,current);
    return result(compare(item.operator,current.value,item.value)?'pass':'fail',`${item.qualifiers.publisher}${current.edition?` ${current.edition}`:''}: ${current.value}`,current);
  }
  if(item.kind==='price'){
    const found=claims.filter(c=>c.field==='price_per_person'&&c.value);
    if(!found.length)return result('unknown','Price per person not verified.');
    const allIn=item.qualifiers.basis==='all-in';
    const usable=found.find(c=>c.value.currency===(item.qualifiers.currency||'USD')&&(!allIn||c.value.basis==='all-in'));
    if(!usable)return result('unknown',allIn?'Tax, tip and fees not established, so the all-in budget cannot be confirmed.':'Price verified in another currency.',found[0]);
    const dollars=usable.value.minorUnits/100;
    return result(compare(item.operator,dollars,item.value)?'pass':'fail',`$${Math.round(dollars)} per person (${usable.value.basis})`,usable);
  }
  if(item.kind==='cuisine'){
    const labels=[...new Set([...(venue.cuisine||[]),...claims.filter(c=>c.field==='cuisine').flatMap(c=>c.value)].flatMap(label=>cuisineOf(label).length?cuisineOf(label):[normalizeName(label)]))];
    if(!labels.length)return result('unknown','Cuisine not verified.');
    const wanted=Array.isArray(item.value)?item.value:[item.value];
    const hit=wanted.some(id=>labels.includes(id));
    if(item.operator==='exclude')return result(hit?'fail':'pass',`Cuisine: ${labels.join(', ')}`);
    return result(hit?'pass':'fail',`Cuisine: ${labels.join(', ')}`);
  }
  if(item.kind==='geography'){
    const area=venueArea(venue,city);
    if(!area)return result('unknown','Neighborhood not established.');
    if(area.id==='elsewhere')return result('fail',`In ${area.label}, not ${resolveCity(city).name}.`);
    const listed=item.value.includes(area.id);
    if(item.operator==='exclude')return result(listed?'fail':'pass',area.label);
    return result(listed?'pass':'fail',area.label);
  }
  if(item.kind==='dining_format'){
    const found=claims.find(c=>c.field==='dining_format'&&c.value);
    if(!found)return result('unknown','Menu format not verified.');
    const format=normalizeName(found.value),wanted=normalizeName(item.value);
    const only=/only|required|mandatory/.test(format);
    if(item.operator==='exclude')return result(format.includes(wanted)&&only?'fail':'pass',found.value,found);
    return result(format.includes(wanted)?'pass':'fail',found.value,found);
  }
  if(item.kind==='dietary'){
    const found=claims.find(c=>c.field==='dietary'&&c.value.length);
    if(!found)return result('unknown','Published dietary accommodations not verified.');
    const listed=found.value.map(normalizeName);
    const missing=item.value.filter(need=>!listed.some(label=>label.includes(normalizeName(need))));
    return result(missing.length?'unknown':'pass',missing.length?`${titleCase(missing.join(', '))} not among the published accommodations.`:`Accommodates ${found.value.join(', ')}`,found);
  }
  // Atmosphere and occasion are qualified opinion (§5.2): never eligibility.
  return result('pass','');
}
export function closureCheck(venue,{now=Date.now()}={}){
  const status=(venue.claims||[]).find(c=>c.field==='status'&&c.status==='supported'&&fresh(c,now));
  if(!status)return null;
  return /closed|moved|relocat/i.test(status.value)?{detail:`${status.value}${status.source.title?` · ${status.source.title}`:''}`,claim:status}:null;
}

// Identity (§5.3). A provider's own id for the venue is decisive; then the
// official site with the address; then the name with the address. A name
// alone never merges two places.
const STREET={st:'street',ave:'avenue',av:'avenue',blvd:'boulevard',rd:'road',dr:'drive',pl:'place',sq:'square',w:'west',e:'east',n:'north',s:'south',ny:'new york',nyc:'new york'};
export const normalizeAddress=value=>normalizeName(String(value||'').split(/,\s*(?:usa|united states)\s*$/i)[0]).split(' ').map(word=>STREET[word]||word).filter(Boolean).slice(0,8).join(' ');
const domainOf=url=>{const safe=safePublicURL(url);return safe?new URL(safe).hostname.replace(/^www\./,''):'';};
export function venueKey(venue){
  const address=normalizeAddress(venue.address);
  const provider=(venue.providers||[])[0];
  if(provider?.id)return `${provider.provider}:${provider.id}`;
  const domain=domainOf(venue.officialURL);
  if(domain&&address)return `${domain}|${address}`;
  return `${normalizeName(venue.name)}|${address}`;
}
export function sameVenue(a,b){
  const ids=(v)=>(v.providers||[]).filter(p=>p.id).map(p=>`${p.provider}:${p.id}`);
  if(ids(a).some(id=>ids(b).includes(id)))return true;
  const addressA=normalizeAddress(a.address),addressB=normalizeAddress(b.address);
  if(!addressA||!addressB||addressA!==addressB)return false;
  const domainA=domainOf(a.officialURL),domainB=domainOf(b.officialURL);
  if(domainA&&domainB)return domainA===domainB;
  return normalizeName(a.name)===normalizeName(b.name);
}
// Which parameters are tracking and may be dropped from an evidence link.
// Everything else stays: some providers put the venue in the query (§5.3).
const TRACKING=/^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|referrer|source|_ga|_gl|yclid|srsltid)$/i;
export function evidenceKey(url){
  const safe=safePublicURL(url);if(!safe)return '';
  const u=new URL(safe);
  for(const key of [...u.searchParams.keys()])if(TRACKING.test(key))u.searchParams.delete(key);
  u.hostname=u.hostname.replace(/^www\./,'');
  if(!u.search)u.pathname=u.pathname.replace(/\/+$/,'')||'/';
  return u.href;
}
// The venue record (§8), bounded and with its identity settled.
export function venue(input={}){
  const name=String(input.name||'').trim().slice(0,150);
  if(!name)throw Error('A venue needs a name.');
  const providers=(Array.isArray(input.providers)?input.providers:[]).map(p=>({provider:String(p.provider||'').slice(0,40),id:String(p.id||'').slice(0,120),url:safePublicURL(p.url)||''})).filter(p=>p.provider&&(p.url||p.id)).slice(0,LIMITS.providers);
  const record={schemaVersion:SCHEMA_VERSION,id:String(input.id||crypto.randomUUID()),name,aliases:[...new Set((Array.isArray(input.aliases)?input.aliases:[]).map(a=>String(a).trim().slice(0,150)).filter(a=>a&&normalizeName(a)!==normalizeName(name)))].slice(0,LIMITS.aliases),
    address:String(input.address||'').trim().slice(0,250),city:String(input.city||'').trim().slice(0,120),neighborhood:String(input.neighborhood||'').trim().slice(0,120),borough:String(input.borough||'').trim().slice(0,80),country:String(input.country||'').slice(0,2),timezone:String(input.timezone||'').slice(0,60),
    officialURL:safePublicURL(input.officialURL)||'',cuisine:(Array.isArray(input.cuisine)?input.cuisine:[]).map(c=>String(c).trim().slice(0,40)).filter(Boolean).slice(0,6),providers,
    identity:['verified','corrected','ambiguous'].includes(input.identity)?input.identity:'unverified',claims:(Array.isArray(input.claims)?input.claims:[]).slice(0,LIMITS.claimsPerVenue),
    createdAt:String(input.createdAt||new Date().toISOString()),updatedAt:String(input.updatedAt||new Date().toISOString())};
  return record;
}
// A dozen results from one research reply can name the same place twice, with
// a stale address the second time. They merge by identity, and their claims
// are kept apart by source rather than overwritten by whichever came last.
export function mergeVenues(list){
  const merged=[];
  for(const item of list){
    const existing=merged.find(v=>sameVenue(v,item));
    if(!existing){merged.push(item);continue;}
    for(const c of item.claims||[])if(!existing.claims.some(e=>e.field===c.field&&e.source.url===c.source.url&&JSON.stringify(e.value)===JSON.stringify(c.value)))existing.claims.push(c);
    for(const p of item.providers||[])if(!existing.providers.some(e=>e.url===p.url))existing.providers.push(p);
    if(normalizeName(item.name)!==normalizeName(existing.name)&&!existing.aliases.includes(item.name))existing.aliases.push(item.name);
    existing.claims=existing.claims.slice(0,LIMITS.claimsPerVenue);existing.providers=existing.providers.slice(0,LIMITS.providers);existing.aliases=existing.aliases.slice(0,LIMITS.aliases);
  }
  return merged;
}
// The candidate a legacy research reply describes, lifted into a venue whose
// evidence is leads (§5.1): a source link establishes that a claim was found
// somewhere, not that it was read there, so nothing from it is supported.
export function venueFromLegacy(item,{city='New York City'}={}){
  const record=venue({name:item.name,address:item.address,city:item.city||city,neighborhood:item.neighborhood,borough:item.borough,
    providers:(item.booking||[]).map(b=>({provider:b.provider,url:b.url})),identity:'unverified'});
  record.claims=(item.evidence||[]).slice(0,5).map(e=>claim({venueId:record.id,field:'area',status:'unknown',value:null,source:{url:e.url,title:e.title,publisher:e.title},excerpt:e.detail,published:e.published,reason:'Found by search; not read from the source.'}));
  record.reason=String(item.reason||'').slice(0,700);
  return record;
}

// An intent that arrived as JSON — posted to the Worker, or read back from the
// device — checked field by field before anything is done with it.
export function intentFromJSON(value,{now=new Date()}={}){
  if(!value||typeof value!=='object'||value.schemaVersion!==SCHEMA_VERSION)throw Error('Unsupported search format. Update the app.');
  const text=String(value.text||'').trim().slice(0,LIMITS.text);
  if(!text)throw Error('Describe the dinner or name the restaurant.');
  if(!['named','discovery'].includes(value.mode))throw Error('Unknown search mode.');
  const city=resolveCity(value.city?.name||value.city);
  if(!city.name)throw Error('Enter a city.');
  let outing=null;
  if(value.outing){
    const o=value.outing;
    const dates=Array.isArray(o.dates)?o.dates.filter(calendarDate):[];
    if(!dates.length||dates.length>LIMITS.dates||!calendarDate(o.preferredDate)||!dates.includes(o.preferredDate))throw Error('Choose a valid date.');
    const sizes=Array.isArray(o.partySizes)?o.partySizes.filter(n=>Number.isInteger(n)&&n>=1&&n<=LIMITS.people):[];
    if(!sizes.length||sizes.length>LIMITS.partySizes||!sizes.includes(o.preferredParty))throw Error(`Choose 1 to ${LIMITS.partySizes} party sizes between 1 and ${LIMITS.people}.`);
    if(![o.preferredTime,o.startTime,o.endTime].every(clockTime)||o.startTime>o.endTime)throw Error('Choose a time window within one day.');
    outing={dates:[...dates].sort(),preferredDate:o.preferredDate,partySizes:[...sizes].sort((a,b)=>a-b),preferredParty:o.preferredParty,preferredTime:o.preferredTime,startTime:o.startTime,endTime:o.endTime};
  }
  const list=(items,max)=>{if(!Array.isArray(items)||items.length>max)throw Error('That is more than the search can hold.');return items.map(item=>constraint(item));};
  return {schemaVersion:SCHEMA_VERSION,id:/^[0-9a-f-]{36}$/.test(String(value.id))?value.id:crypto.randomUUID(),revision:Number.isInteger(value.revision)&&value.revision>0?value.revision:1,text,mode:value.mode,name:value.mode==='named'?String(value.name||text).slice(0,150):'',city,venueId:typeof value.venueId==='string'?value.venueId.slice(0,80):null,outing,
    requirements:list(value.requirements||[],LIMITS.requirements),preferences:list(value.preferences||[],LIMITS.preferences),includeLongTravel:value.includeLongTravel===true,notes:(Array.isArray(value.notes)?value.notes:[]).map(n=>String(n).slice(0,200)).slice(0,8),interpretationVersion:String(value.interpretationVersion||'').slice(0,40)};
}
// A search saved by the previous generation of the tool, carried forward as a
// dated search rather than re-read as verified fact (§13 Phase D).
export function legacyIntent(search){
  const dates=search.date?dateRange(search.date,search.endDate||search.date):[];
  const sizes=Number.isInteger(search.minParty)?Array.from({length:Math.min(LIMITS.people,(search.maxParty||search.minParty)-search.minParty+1)},(_,i)=>search.minParty+i):[Number(search.partySize)||2];
  return {schemaVersion:SCHEMA_VERSION,id:crypto.randomUUID(),revision:1,text:String(search.query||''),mode:search.mode==='restaurant'?'named':'discovery',name:search.mode==='restaurant'?String(search.query||''):'',city:resolveCity(search.city),venueId:null,
    outing:dates.length?{dates,preferredDate:dates[0],partySizes:sizes,preferredParty:sizes[0],preferredTime:search.startTime||'19:00',startTime:search.startTime||'17:00',endTime:search.endTime||'22:00'}:null,
    requirements:[],preferences:[],includeLongTravel:!!search.includeLongTravel,notes:['Saved by an earlier version of the search.'],interpretationVersion:'legacy'};
}

// What a research reply establishes (§5.1). The model proposes candidates and
// the claims it read, each with the sentence it read them in; here a claim is
// kept only when its source is one the search actually opened, and it enters
// as a lead. Reading the source is the verifier's job, not the model's word.
const CLAIM_INPUT={michelin_stars:'number',michelin_bib:'boolean',nyt_rank:'number',nyt_stars:'number',infatuation_score:'number',price_per_person:'money',dining_format:'text',cuisine:'list',dietary:'list',atmosphere:'list',status:'text'};
export function candidatesFromResearch(raw,sources,intent){
  if(!Array.isArray(raw?.candidates))throw Error('Research did not return a restaurant list.');
  const opened=new Set(sources.map(s=>evidenceKey(s.url)).filter(Boolean));
  const seen=new Set();let unverified=0;
  const venues=[];
  for(const item of raw.candidates.slice(0,40)){
    if(typeof item.name!=='string'||!item.name.trim()||typeof item.address!=='string'||!item.address.trim()){unverified++;continue;}
    let record;
    try{record=venue({name:item.name,aliases:item.aliases,address:item.address,city:item.city||intent.city.name,neighborhood:item.neighborhood,borough:item.borough,officialURL:item.officialURL,cuisine:item.cuisine,
      providers:(Array.isArray(item.booking)?item.booking:[]).map(b=>({provider:b.provider||'',url:b.url,id:b.id})).filter(b=>b.url&&opened.has(evidenceKey(b.url))),identity:['verified','corrected','ambiguous'].includes(item.identity)?item.identity:'unverified'});}
    catch{unverified++;continue;}
    const key=venueKey(record);if(seen.has(key))continue;seen.add(key);
    record.reason=String(item.reason||'').slice(0,400);
    record.claims=(Array.isArray(item.claims)?item.claims:[]).slice(0,LIMITS.claimsPerVenue).flatMap(c=>{
      if(!CLAIM_INPUT[c.field]||!opened.has(evidenceKey(c.url)))return [];
      let value=c.value;
      if(CLAIM_INPUT[c.field]==='money')value=Number.isFinite(Number(c.value))?{minorUnits:Math.round(Number(c.value)*100),currency:String(c.currency||'USD').slice(0,3),basis:['all-in','food','tasting menu','prix fixe'].includes(c.basis)?c.basis:'food'}:null;
      try{return [claim({venueId:record.id,field:c.field,value,status:'unknown',source:{url:c.url,title:c.title,publisher:c.publisher},excerpt:String(c.quote||'').slice(0,LIMITS.excerpt),published:c.published,edition:c.edition,latest:c.latest===true,extractor:'research',reason:'Quoted by research; not yet read from the source.'})];}
      catch{return [];}
    });
    if(!record.claims.length&&!record.providers.length){unverified++;continue;}
    venues.push(record);
  }
  return {candidates:mergeVenues(venues).slice(0,LIMITS.candidates),unverified,clarification:String(raw.clarification||'').slice(0,500),locations:Array.isArray(raw.locations)?raw.locations.slice(0,3).map(l=>({name:String(l.name||'').slice(0,150),address:String(l.address||'').slice(0,250),neighborhood:String(l.neighborhood||'').slice(0,120)})):[]};
}
