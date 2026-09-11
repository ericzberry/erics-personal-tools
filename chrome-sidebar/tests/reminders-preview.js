// Local synthetic fixture for the reminders list and quick add. Not copied into
// release builds. The controllers, components and styles are the real modules;
// only the records, the clock and the reading of a typed note are synthetic, so
// the states a person actually meets can be inspected at sidebar widths without
// a connection or a model call.
import {mountReminders} from '../src/reminders.js';
import {mountCapture} from '../src/capture.js';
import {normalizeReminder} from '../src/reminder-data.js';
const today=()=>'2026-09-11';
const records=[
  {kind:'Service',title:'Oil change and tire rotation',subject:'Subaru Outback',date:'2026-02-28',every:6,notes:'Tire pressure was low at the last visit.'},
  {kind:'Birthday',title:'Maisie’s birthday',date:'2016-09-20',every:12,since:'2016',notice:14},
  {kind:'Renewal',title:'Passport renewal for the whole household',date:'2026-12-01',every:0,notice:90},
  {kind:'Service',title:'Furnace filter',subject:'Basement',date:'2026-08-01',every:3},
  {kind:'Birthday',title:'Ariana’s birthday',date:'1988-04-17',every:12,since:'1988'},
  {kind:'Appointment',title:'Dentist',subject:'Celeste',date:'2026-06-14',every:0,completed:'2026-06-14'}
].map((record,index)=>({...normalizeReminder(record),id:`1000000${index}-0000-4000-8000-00000000000${index}`,revision:'first'}));
const store=list=>{
  let saved=[...list];
  return {
    async request(token,url,options={}){
      const id=url.slice('/v1/reminders/'.length);
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
// What a typed note reads back as, so quick add can be operated end to end
// without a connection or a billable call.
const reading=async(token,path,options)=>path==='/v1/ai-connections'
  ?{connections:[{id:'c1',name:'Synthetic',provider:'openai',hasApiKey:true}]}
  :{capability:'reminders',path:'/v1/reminders',
    record:normalizeReminder({kind:'Birthday',title:'Derek’s birthday',date:today(),every:12}),
    summary:'Derek’s birthday · Every year · Today'};
const root=document.getElementById('reminder-states');
const states=[
  ['Populated · one overdue, one completed',records,connected],
  ['Connected with nothing saved yet',[],connected],
  ['Not connected',[],{get:async()=>''}]
];
for(const [label,list,credentials] of states){
  const heading=document.createElement('h2');
  heading.textContent=`Synthetic state · ${label}`;
  heading.style.cssText='font:600 12px/1.4 system-ui;margin:16px 0 8px;color:#666';
  const host=document.createElement('div');
  root.append(heading,host);
  const offline=store(list);
  const tool=mountReminders(host,{credentials,offline,today});
  mountCapture(host.querySelector('#reminders-capture'),{credentials,remote:reading,stores:{reminders:offline},today,onSaved:()=>tool.refresh()});
}
