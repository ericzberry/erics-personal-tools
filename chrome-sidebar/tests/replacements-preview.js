// Local synthetic fixture for the replacement drawer and quick add. Not copied
// into release builds. The controllers, components and styles are the real
// modules; only the records and the reading of a typed note are synthetic.
import {mountReplacements} from '../src/replacements.js';
import {mountCapture} from '../src/capture.js';
import {normalizeReplacement} from '../src/replacement-data.js';
const records=[
  {item:'Bedroom paint',variant:'Benjamin Moore Hale Navy HC-154, Regal Select eggshell',where:'Home Depot',note:'Two gallons does the room'},
  {item:'Ceiling paint',variant:'Benjamin Moore Chantilly Lace OC-65, flat',where:'https://www.benjaminmoore.com/en-us/paint-colors/color/oc-65/chantilly-lace'},
  {item:'Pillow',variant:'Coop Sleep Goods Original Adjustable, queen',where:'https://www.coopsleepgoods.com/products/the-original-pillow'},
  {item:'Laptop charger',variant:'Anker 543 USB-C to USB-C, 6 ft, 240 W, braided black',where:'Amazon'},
  {item:'Printer ink',variant:'HP 67XL black, 3YM57AN',where:'Staples',note:'The regular 67 lasts a month'},
  {item:'Running shoes',variant:'Brooks Ghost 16, men’s 10.5 D, black/black/ebony',where:'Fleet Feet',note:'Every 400 miles'},
  {item:'Furnace filter',variant:'Filtrete MPR 1500, 16x25x1'}
].map((record,index)=>({...normalizeReplacement(record),id:`50000000-0000-4000-8000-${String(index).padStart(12,'0')}`,revision:'first'}));
records[6].pending=true;
const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/replacements/'.length);
      if(!options.method||options.method==='GET')return {records:[...saved],syncMessage:''};
      if(options.method==='DELETE'){saved=saved.filter(record=>record.id!==id);return {records:[...saved]};}
      const value={...options.value,revision:'next'};
      saved=saved.some(record=>record.id===id)?saved.map(record=>record.id===id?value:record):[...saved,value];
      return {record:value,records:[...saved]};
    },
    async resolve(){return {records:[...saved]};}
  };
};
const connected={get:async()=>'synthetic-preview-token-at-least-32-characters'};
const reading=async(token,path)=>path==='/v1/ai-connections'
  ?{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]}
  :{capability:'replacements',path:'/v1/replacements',
    record:normalizeReplacement({item:'Kitchen bulbs',variant:'Philips Ultra Definition BR30, 2700K'}),
    summary:'Kitchen bulbs · Philips Ultra Definition BR30, 2700K'};
const root=document.getElementById('replacement-states');
for(const [label,list,credentials] of [
  ['Populated · shops, pages, notes and one waiting to sync',records,connected],
  ['Connected with nothing saved yet',[],connected],
  ['Not connected',[],{get:async()=>''}]
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const offline=store(list);
  const tool=mountReplacements(host,{credentials,offline});
  mountCapture(host.querySelector('#replacements-capture'),{credentials,remote:reading,stores:{replacements:offline},
    placeholder:'Bedroom paint is Benjamin Moore Hale Navy, eggshell',onSaved:()=>tool.refresh()});
}
