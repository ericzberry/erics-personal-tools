import {FormField,Stack,Section,Heading,Note,DataTable} from './ui.js';
import {CAPABILITIES} from '../capabilities.js';
export function CapabilityPicker({id='capability-picker'}={}) {
  return Stack([FormField({id,label:'Capabilities',kind:'select',options:[{value:'',text:'Choose a capability'},...CAPABILITIES.map(c=>({value:c.id,text:c.label}))]})],{className:'capability-navigation'});
}
export function CapabilitiesView(){
  return Stack([CapabilityPicker(),Stack([],{id:'capability-connection',className:'travel-wallet connection-only'}),Note('Choose a capability to view your saved data.',{id:'capability-intro'}),...CAPABILITIES.map(c=>Section([],{id:`capability-${c.id}`,hidden:true}))]);
}
export function DataLibrary({title,description,id}){
  return Stack([Heading(title,1),Note(description),FormField({id:`${id}-search`,label:'Search saved data',kind:'search'}),Note('',{id:`${id}-status`,role:'status'}),Stack([],{id:`${id}-rows`,className:'data-records'})],{className:'data-library'});
}
export function DataRows(rows){return rows.map(row=>Section([Heading(row.title,2),...row.lines.map(line=>Note(line))],{className:'data-record'}));}
