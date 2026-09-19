// Local synthetic fixture for the size list and quick add. Not copied into
// release builds. The controllers, components and styles are the real modules;
// only the records and the reading of a typed note are synthetic.
import {mountSizes} from '../src/sizes.js';
import {mountCapture} from '../src/capture.js';
import {normalizeSize} from '../src/size-data.js';
const records=[
  {brand:'',item:'Shirt',size:'M'},
  {brand:'',item:'Neck',size:'15.5 in'},
  {brand:'',item:'Sleeve',size:'34 in'},
  {brand:'',item:'Chest',size:'40 in'},
  {brand:'',item:'Waist',size:'33 in',fit:'Measured in March, after the marathon'},
  {brand:'',item:'Inseam',size:'32 in'},
  {brand:'',item:'Shoe',size:'US 10.5'},
  {brand:'Banana Republic',item:'Shirt',size:'M'},
  {brand:'Brooks Brothers',item:'Dress shirt',size:'15.5 / 34',fit:'Regent fit'},
  {brand:'Lululemon',item:'ABC joggers',size:'M',fit:'Runs slim through the thigh — the large in the warpstreme fabric'},
  {brand:'lululemon',item:'Metal Vent tech shirt',size:'M'},
  {brand:'Allbirds',item:'Wool Runners',size:'10.5'}
].map((record,index)=>({...normalizeSize(record),id:`40000000-0000-4000-8000-${String(index).padStart(12,'0')}`,revision:'first'}));
const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/sizes/'.length);
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
  :{capability:'sizes',path:'/v1/sizes',
    record:normalizeSize({brand:'Patagonia',item:'Better Sweater',size:'M'}),
    summary:'Better Sweater · M · Patagonia'};
const root=document.getElementById('size-states');
for(const [label,list,credentials] of [
  ['Populated · measurements and three brands, one with a long note',records,connected],
  ['Connected with nothing saved yet',[],connected],
  ['Not connected',[],{get:async()=>''}]
]){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const offline=store(list);
  const tool=mountSizes(host,{credentials,offline});
  mountCapture(host.querySelector('#sizes-capture'),{credentials,remote:reading,stores:{sizes:offline},
    placeholder:'Lululemon joggers are a medium',onSaved:()=>tool.refresh()});
}
