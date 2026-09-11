import {FormField,Stack,Section,Heading,Note,DataTable} from './ui.js';
import {CAPABILITIES} from '../capabilities.js';
export function CapabilityPicker({id='capability-picker'}={}) {
  return Stack([FormField({id,label:'Tools',kind:'select',options:[{value:'',text:'Choose a tool'},...CAPABILITIES.map(c=>({value:c.id,text:c.label}))]})],{className:'capability-navigation'});
}
export function CapabilitiesView(){
  return Stack([
    // Quick add belongs to the home screen, above the tools themselves: a note
    // is typed before choosing where it goes, which is the point of it.
    Stack([],{id:'capability-capture',hidden:true}),
    CapabilityPicker(),
    // AI connections live in Settings beside the cloud connection they belong to.
    Section([Heading('Cloud connection',2),Stack([],{id:'capability-connection'}),Stack([],{id:'capability-ai'})],{id:'capability-settings',className:'travel-wallet connection-only',hidden:true}),
    ...CAPABILITIES.map(c=>Section([],{id:`capability-${c.id}`,hidden:true}))
  ]);
}
export function DataLibrary({title,id,level=1}){
  return Stack([Heading(title,level),FormField({id:`${id}-search`,label:'Search saved data',kind:'search'}),Note('',{id:`${id}-status`,role:'status'}),Stack([],{id:`${id}-rows`,className:'data-records'})],{className:'data-library'});
}
export function DataRows(rows){return rows.map(row=>Section([Heading(row.title,2),...row.lines.map(line=>Note(line))],{className:'data-record'}));}
