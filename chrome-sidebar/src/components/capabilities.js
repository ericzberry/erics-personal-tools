import {FormField,FindField,Stack,Section,Heading,Note,DataTable} from './ui.js';
import {CAPABILITIES,APP_AREAS} from '../capabilities.js';
export function CapabilityPicker({id='capability-picker'}={}) {
  return Stack([FormField({id,label:'Tools',kind:'select',options:[{value:'',text:'Choose an area'},...APP_AREAS.map(c=>({value:`area-${c.id}`,text:c.label}))]})],{className:'capability-navigation'});
}
export function CapabilitiesView(){
  return Stack([
    Section([
      Stack([],{id:'capability-birthdays'}),Stack([],{id:'capability-capture'}),Section([],{id:'capability-attention'})
    ],{id:'capability-home',hidden:true}),
    Section([],{id:'capability-info',hidden:true}),Section([],{id:'capability-more',hidden:true}),
    CapabilityPicker(),
    // AI connections live in Settings beside the cloud connection they belong to.
    Section([Heading('Cloud connection',2),Stack([],{id:'capability-connection'}),Stack([],{id:'capability-ai'})],{id:'capability-settings',className:'travel-wallet connection-only',hidden:true}),
    ...CAPABILITIES.filter(c=>c.id!=='attention').map(c=>Section([],{id:`capability-${c.id}`,hidden:true}))
  ]);
}
export function DataLibrary({title,id,level=1}){
  return Stack([Heading(title,level),FindField({id:`${id}-search`,label:'Search saved data'}),Note('',{id:`${id}-status`,role:'status'}),Stack([],{id:`${id}-rows`,className:'data-records'})],{className:'data-library'});
}
export function DataRows(rows){return rows.map(row=>Section([Heading(row.title,2),...row.lines.map(line=>Note(line))],{className:'data-record'}));}
