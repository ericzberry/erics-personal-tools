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
globalThis.chrome={
  runtime:{id:'preview',sendMessage:async message=>{
    if(message.action==='list')return {ok:true,connections:[{id:'00000000-0000-0000-0000-000000000000',name:'Synthetic connection · no real API calls',provider:'openai',hasApiKey:true}]};
    if(message.action==='status')return {ok:true,connected:true};
    if(message.action==='restaurants'){await new Promise(r=>setTimeout(r,600));const named=message.intent.mode==='named';return {ok:true,schemaVersion:2,candidates:named?places.slice(0,2):places,clarification:'',locations:named?places.slice(0,2).map(p=>({name:p.name,address:p.address,neighborhood:p.neighborhood})):[],unverified:1,researchedAt:new Date().toISOString()};}
    if(message.action==='generate')return {ok:true,text:JSON.stringify({status:'login_required',detail:'Synthetic login challenge. Open the page to continue.',slots:[]})};
    throw Error('Unexpected preview action');
  }},
  storage:{local:{get:async()=>({cloudConnection:{token:'synthetic-preview-token-at-least-32-chars'}}),set:async()=>{}}},
  tabs:{create:async({url})=>{const tab={id:++counter,url,status:'complete',windowId:1};tabs.set(tab.id,tab);return tab;},get:async id=>{if(!tabs.has(id))throw Error('Tab closed');return tabs.get(id);},remove:async id=>tabs.delete(id),update:async(id,value)=>Object.assign(tabs.get(id),value)},
  windows:{update:async()=>{}},
  scripting:{executeScript:async({target})=>{
    const url=new URL(tabs.get(target.tabId).url),size=Number(url.searchParams.get('seats')||url.searchParams.get('covers')),date=url.searchParams.get('date')||url.searchParams.get('dateTime')?.slice(0,10);
    const name=/unread/.test(url.pathname)?'Unread Place':/second/.test(url.pathname)?'Second Synthetic Trattoria with a Long Name That Wraps':'Example Bistro';
    const controls=[{tag:'select',label:'Guests',text:`${size} Guests`,value:String(size),region:'reservation'},{tag:'button',label:'Date',text:date,selected:true,region:'reservation'},{tag:'button',text:'Hours 5:00 PM – 11:00 PM',region:'other'}];
    if(/second/.test(url.pathname))controls.push({tag:'button',text:'7:00 PM',region:'reservation'},{tag:'button',text:'7:30 PM',region:'reservation'});
    else if(size===2||size===4)controls.push({tag:'button',text:'6:30 PM · Dining Room',region:'reservation'},{tag:'button',text:'6:30 PM · Bar',region:'reservation'},{tag:'button',text:'8:00 PM · Dining Room',region:'reservation'});
    return [{result:{url:url.href,heading:name,title:`${name} | Synthetic`,text:size===3?'Complete verification before viewing reservation availability.':(size===2||size===4||/second/.test(url.pathname))?'Reserve a table at this synthetic restaurant.':`Sorry, we don't currently have any tables available for ${size}.`,controls,loading:false,capturedAt:new Date().toISOString()}}];
  }}
};
await import('../src/restaurant-page.js');
