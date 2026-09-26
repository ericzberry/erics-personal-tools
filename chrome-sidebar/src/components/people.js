import {Stack,Section,Heading,Text,Note,Strong,Button,ActionGroup,Disclosure,Form,FormField,Notice,ToolTitle,RowAction,EDIT_GLYPH,DELETE_GLYPH} from './ui.js';
import {PEOPLE_ROLES,ageInYear} from '../people-data.js';
export function PeopleView(){return Stack([
  ToolTitle('Family & places',{actionsId:'people-actions',statusId:'people-status'}),
  Note('AI reference context'),
  Stack([],{id:'people-list',className:'travel-list'}),
  Disclosure('Person',[
    Form([
      FormField({id:'people-name',label:'Name or label',kind:'text'}),
      FormField({id:'people-role',label:'Relationship',kind:'select',options:PEOPLE_ROLES.map(value=>({value,text:value}))}),
      FormField({id:'people-age',label:'Age in reference year',kind:'number'}),
      FormField({id:'people-ageYear',label:'Reference year',kind:'number'}),
      FormField({id:'people-location',label:'Location',kind:'text'}),
      FormField({id:'people-notes',label:'Notes',kind:'textarea',rows:2}),
      Notice('',{id:'people-form-status'}),
      ActionGroup([Button('Save person',{id:'people-save',variant:'primary',type:'submit'}),Button('Cancel',{id:'people-cancel',variant:'secondary'})])
    ],{id:'people-form',className:'form-stack'})
  ],{id:'people-editor'})
],{className:'travel-wallet'});}
export function PersonRow(p,{onEdit,onDelete,onResolve,busy=false,year=new Date().getFullYear()}){
  const remove=()=>{confirmation.hidden=false;};
  const yes=Button('Delete person from all devices',{variant:'danger',disabled:busy});yes.addEventListener('click',onDelete);
  const no=Button('Keep person',{variant:'secondary'});no.addEventListener('click',()=>{confirmation.hidden=true;});
  const confirmation=Stack([Text(`Delete ${p.name} from shared app context?`),ActionGroup([yes,no])],{hidden:true});
  const age=ageInYear(p,year);
  return Section([
    Stack([Strong(p.name),ActionGroup([RowAction(EDIT_GLYPH,`Edit ${p.name}`,onEdit,{disabled:busy}),RowAction(DELETE_GLYPH,`Delete ${p.name}`,remove,{danger:true,disabled:busy})],{compact:true})],{className:'group-line'}),
    Note([p.role,age===null?'':`${age} in ${year}`,p.location].filter(Boolean).join(' · ')),
    p.notes?Text(p.notes):null,
    p.age!==null?Note(`Based on age ${p.age} in ${p.ageYear}; exact birthday not recorded.`):null,
    p.pending?Notice(p.conflict?'Changed on another device. Choose a version.':'Waiting to sync.',{tone:'alert'}):null,
    p.conflict?ActionGroup(['local','cloud'].map(choice=>{const b=Button(choice==='local'?'Keep my change':'Use cloud version',{variant:'secondary',disabled:busy});b.addEventListener('click',()=>onResolve(choice));return b;})):null,
    confirmation
  ],{className:'record-row'});
}
