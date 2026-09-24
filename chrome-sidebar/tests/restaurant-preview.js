// Test-only integration harness. No network, provider credentials, or real inventory.
import {venue,claim} from '../src/restaurant-data.js';
const tabs=new Map();let counter=0;
const supported=(field,value,extra={})=>claim({field,value,status:'supported',source:{url:'https://example.com/'+field,title:`Synthetic ${field} source`},excerpt:'synthetic passage · fictional test data',retrievedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),...extra});
const lead=(field,value)=>claim({field,value,status:'unknown',source:{url:'https://example.com/'+field,title:'Synthetic lead'},excerpt:'quoted by research',reason:'Not read: the source budget for this search was used up.'});
const places=[
  venue({id:'a',name:'Example Bistro',address:'100 Example Street, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['Italian'],providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example-bistro'}],claims:[supported('michelin_stars',2,{edition:'2030',latest:true}),supported('price_per_person',{minorUnits:12500,currency:'USD',basis:'food'}),supported('atmosphere',['quiet','intimate'],{published:'2030-05-01'})]}),
  venue({id:'b',name:'Second Synthetic Trattoria with a Long Name That Wraps',address:'200 Other Avenue, New York, NY',city:'New York City',neighborhood:'Midtown',borough:'Manhattan',cuisine:['Italian'],providers:[{provider:'OpenTable',url:'https://www.opentable.com/r/second-synthetic'}],claims:[supported('michelin_stars',2,{edition:'2030',latest:true}),supported('atmosphere',['lively'],{published:'2030-05-01'})]}),
  venue({id:'c',name:'Third Place',address:'300 Third Street, New York, NY',city:'New York City',neighborhood:'Chelsea',borough:'Manhattan',cuisine:['Italian'],providers:[],claims:[supported('michelin_stars',2,{edition:'2030',latest:true})]}),
  venue({id:'d',name:'Unread Place',address:'400 Fourth Street, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['Italian'],providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/unread'}],claims:[lead('michelin_stars',2)]}),
  venue({id:'e',name:'Three Star Place',address:'500 Fifth Street, New York, NY',city:'New York City',neighborhood:'Upper West Side',borough:'Manhattan',cuisine:['Italian'],providers:[],claims:[supported('michelin_stars',3,{edition:'2030',latest:true})]})
];
// Two places for a sushi lunch in the Lower East Side, so the owner's own
// example can be operated end to end.
const sushi=[
  venue({id:'s1',name:'Synthetic Sushi Counter',address:'10 Example Street, New York, NY',city:'New York City',neighborhood:'Lower East Side',borough:'Manhattan',cuisine:['Sushi'],providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/synthetic-sushi-counter'}],claims:[supported('price_per_person',{minorUnits:9500,currency:'USD',basis:'food'})]}),
  venue({id:'s2',name:'Example Hand Roll Bar',address:'20 Example Street, New York, NY',city:'New York City',neighborhood:'Lower East Side',borough:'Manhattan',cuisine:['Sushi'],providers:[{provider:'Resy',url:'https://resy.com/cities/new-york-ny/venues/example-hand-roll'}],claims:[]})
];
// A request read the way the Worker reads one, without a model: enough of the
// owner's own phrasing to operate the screen.
function syntheticReading(text,today){
  const lower=text.toLowerCase(),days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekday=days.findIndex(day=>lower.includes(day)),start=Date.parse(`${today}T00:00:00Z`);
  const date=weekday>=0?new Date(start+((weekday-new Date(start).getUTCDay()+7)%7)*86400000).toISOString().slice(0,10):/\btomorrow\b/.test(lower)?new Date(start+86400000).toISOString().slice(0,10):/\b(today|tonight)\b/.test(lower)?today:'';
  const clock=/\b(\d{1,2}):(\d{2})\b/.exec(lower)||/\bat (\d{1,2})()\b/.exec(lower),hour=clock?Number(clock[1])+(Number(clock[1])<11?12:0):0;
  const window=Number(/within (\d+) min/.exec(lower)?.[1]);
  const request=text.replace(/\bfor \d+\b/i,'').replace(/\bthat'?s available\b/i,'').replace(/\bwithin \d+ minutes of \d{1,2}:\d{2}\b/i,'').replace(/\bat \d{1,2}(?::\d{2})?\b/i,'').replace(/\b(?:this |next )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|tonight|today)\b/i,'').replace(/\s+/g,' ').trim();
  // A capitalised name of a few words is a restaurant, as a model would read it.
  const named=/^[A-Z][\w’'-]*(?: [A-Z][\w’'-]*){0,3}$/.test(request);
  return {mode:named?'named':'discovery',name:named?request:'',request,city:'',date,endDate:'',people:Number(/\bfor (\d+)\b/.exec(lower)?.[1])||null,maxPeople:null,time:clock?`${String(hour).padStart(2,'0')}:${clock[2]||'00'}`:'',window:window>0?window:null};
}
globalThis.chrome={
  runtime:{id:'preview',sendMessage:async message=>{
    if(message.action==='list')return {ok:true,connections:[{id:'00000000-0000-0000-0000-000000000000',name:'Synthetic connection · no real API calls',provider:'openai',hasApiKey:true}]};
    if(message.action==='status')return {ok:true,connected:true};
    if(message.action==='restaurant-intent'){await new Promise(r=>setTimeout(r,500));return {ok:true,reading:syntheticReading(message.text,message.today)};}
    if(message.action==='restaurants'){await new Promise(r=>setTimeout(r,1500));const named=message.intent.mode==='named';if(/sushi/i.test(message.intent.request||message.intent.text))return {ok:true,schemaVersion:2,candidates:sushi,clarification:'',locations:[],unverified:0,researchedAt:new Date().toISOString()};return {ok:true,schemaVersion:2,candidates:named?places.slice(0,2):places,clarification:'',locations:named?places.slice(0,2).map(p=>({name:p.name,address:p.address,neighborhood:p.neighborhood})):[],unverified:1,researchedAt:new Date().toISOString()};}
    if(message.action==='generate')return {ok:true,text:JSON.stringify({status:'login_required',detail:'Synthetic login challenge. Open the page to continue.',slots:[]})};
    throw Error('Unexpected preview action');
  }},
  storage:{local:{get:async()=>({cloudConnection:{token:'synthetic-preview-token-at-least-32-chars'}}),set:async()=>{}}},
  tabs:{create:async({url})=>{const tab={id:++counter,url,status:'complete',windowId:1};tabs.set(tab.id,tab);return tab;},get:async id=>{if(!tabs.has(id))throw Error('Tab closed');return tabs.get(id);},remove:async id=>tabs.delete(id),update:async(id,value)=>Object.assign(tabs.get(id),value)},
  windows:{update:async()=>{}},
  scripting:{executeScript:async({target})=>{
    const url=new URL(tabs.get(target.tabId).url),size=Number(url.searchParams.get('seats')||url.searchParams.get('covers')),date=url.searchParams.get('date')||url.searchParams.get('dateTime')?.slice(0,10);
    const name=/unread/.test(url.pathname)?'Unread Place':/second/.test(url.pathname)?'Second Synthetic Trattoria with a Long Name That Wraps':/sushi-counter/.test(url.pathname)?'Synthetic Sushi Counter':/hand-roll/.test(url.pathname)?'Example Hand Roll Bar':'Example Bistro';
    const controls=[{tag:'select',label:'Guests',text:`${size} Guests`,value:String(size),region:'reservation'},{tag:'button',label:'Date',text:date,selected:true,region:'reservation'},{tag:'button',text:'Hours 5:00 PM – 11:00 PM',region:'other'}];
    if(/sushi-counter/.test(url.pathname))controls.push({tag:'button',text:'12:00 PM · Counter',region:'reservation'},{tag:'button',text:'12:30 PM · Counter',region:'reservation'},{tag:'button',text:'1:15 PM · Table',region:'reservation'});
    else if(/hand-roll/.test(url.pathname))controls.push({tag:'button',text:'2:00 PM · Counter',region:'reservation'});
    else if(/second/.test(url.pathname))controls.push({tag:'button',text:'7:00 PM',region:'reservation'},{tag:'button',text:'7:30 PM',region:'reservation'});
    else if(size===2||size===4)controls.push({tag:'button',text:'6:30 PM · Dining Room',region:'reservation'},{tag:'button',text:'6:30 PM · Bar',region:'reservation'},{tag:'button',text:'8:00 PM · Dining Room',region:'reservation'});
    const lunch=/sushi-counter|hand-roll/.test(url.pathname);
    return [{result:{url:url.href,heading:name,title:`${name} | Synthetic`,text:lunch?'Reserve a table at this synthetic restaurant.':size===3?'Complete verification before viewing reservation availability.':(size===2||size===4||/second/.test(url.pathname))?'Reserve a table at this synthetic restaurant.':`Sorry, we don't currently have any tables available for ${size}.`,controls,loading:false,capturedAt:new Date().toISOString()}}];
  }}
};
await import('../src/restaurant-page.js');
