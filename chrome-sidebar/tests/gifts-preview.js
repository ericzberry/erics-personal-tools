// Local synthetic fixture for the gift list and quick add. Not copied into
// release builds. The controllers, components and styles are the real modules;
// only the records and the reading of a typed note are synthetic.
import {mountGifts} from '../src/gifts.js';
import {mountCapture} from '../src/capture.js';
import {normalizeGift} from '../src/gift-data.js';
const records=[
  {person:'Ariana',idea:'Cast iron skillet, the 12 inch one with the long handle',link:'https://example.com/skillet'},
  {person:'Ariana',idea:'Weekend in the mountains',status:'Bought'},
  {person:'Maisie',idea:'Telescope with a tripod',link:'https://example.com/telescope'},
  {person:'maisie',idea:'Ant farm'},
  {person:'Celeste',idea:'Roller skates, size 3',status:'Bought'}
].map((record,index)=>({...normalizeGift(record),id:`3000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));
const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/gifts/'.length);
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
  :{capability:'gifts',path:'/v1/gifts',
    record:normalizeGift({person:'Celeste',idea:'Butterfly net'}),
    summary:'Butterfly net · for Celeste'};
const root=document.getElementById('gift-states');
for(const [label,list,credentials] of [
  ['Populated · three people, two already bought',records,connected],
  ['Connected with nothing saved yet',[],connected],
  ['Not connected',[],{get:async()=>''}]
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const offline=store(list);
  const tool=mountGifts(host,{credentials,offline});
  mountCapture(host.querySelector('#gifts-capture'),{credentials,remote:reading,stores:{gifts:offline},
    placeholder:'Ariana would like a cast iron pan',onSaved:()=>tool.refresh()});
}
