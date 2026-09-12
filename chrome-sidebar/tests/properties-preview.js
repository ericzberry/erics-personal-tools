// Local synthetic fixture for Properties at sidebar widths. The tool, its
// validator and its styles are the real modules; the store, the page beside
// the panel and the model's reading are synthetic, so saving a listing and
// updating one can be driven without a listing site or a model call.
import {mountProperties} from '../src/properties.js';
import {normalizeProperty} from '../src/property-data.js';
const listing='https://www.zillow.com/homedetails/85-Greenway-Ter-Forest-Hills-Gardens-NY-11375/32004593_zpid/';
const fresh='https://www.zillow.com/homedetails/3-Oak-Ln-Montclair-NJ-07042/11111111_zpid/';
const shortlist=()=>[
  {...normalizeProperty({address:'85 Greenway Ter, Forest Hills, NY 11375',link:listing,status:'Seen',price:1250000,beds:4,baths:2.5,sqft:2400,taxes:18200,notes:'Backs onto the park. Kitchen needs work.',since:'2026-09-01'}),id:'a'},
  {...normalizeProperty({address:'12 Elm St, Maplewood, NJ 07040',status:'Looking',price:950000,beds:3,baths:2,taxes:21400,since:'2026-09-12'}),id:'b'},
  {...normalizeProperty({address:'221 Clinton Ave, Unit 4B, Brooklyn, NY 11205',link:'https://streeteasy.com/sale/1234567',status:'Offer',price:1480000,beds:3,baths:2,sqft:1650,taxes:9600,hoa:1240,notes:'Offer in at $1.42M. Board package due Friday.',since:'2026-08-20'}),id:'c'},
  {...normalizeProperty({address:'40 Ridge Rd, Summit, NJ 07901',status:'Passed',price:1350000,beds:5,baths:3,notes:'Too far from the train.',since:'2026-08-02'}),id:'d'}
].map((record,index)=>({...record,revision:`r${index}`}));
function store(records){
  return {async request(token,url,options={}){
    if(!options.method||options.method==='GET')return {records:[...records],syncMessage:''};
    const id=url.split('/').at(-1);const index=records.findIndex(record=>record.id===id);
    if(options.method==='DELETE'){records.splice(index,1);return {records:[...records]};}
    const saved={...normalizeProperty(options.value),id,revision:crypto.randomUUID()};
    if(index<0)records.push(saved);else records[index]=saved;
    return {record:saved,records:[...records]};
  },async resolve(){return {records:[...records]};}};
}
const remote=reading=>async(token,path,options)=>path==='/v1/ai-connections'
  ?{connections:[{id:'c1',hasApiKey:true}]}
  :{record:normalizeProperty({status:'Looking',notes:'',since:options.value.today,link:options.value.url,...reading})};
const states=[
  ['The shortlist',{url:''},{}],
  ['Beside a listing not on the shortlist',{url:fresh,listing:{id:'zillow'}},{address:'3 Oak Ln, Montclair, NJ 07042',price:875000,beds:3,baths:1.5,sqft:1820,taxes:16800}],
  ['Beside a saved listing whose price was cut',{url:listing,listing:{id:'zillow'}},{address:'85 Greenway Ter, Forest Hills, NY 11375',price:1195000,beds:4}]
];
const root=document.getElementById('property-states');
for(const [label,page,reading] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('section');
  host.className='tool-page';
  root.append(heading,host);
  const tool=mountProperties(host,{credentials:{get:async()=>'synthetic-token'},offline:store(shortlist()),remote:remote(reading),
    readPage:async()=>({text:'Synthetic listing text',url:page.url}),today:()=>'2026-09-13'});
  setTimeout(()=>tool.page(page),50);
}
