import * as UI from './ui.js';
import {PERSONAL_CATEGORIES} from '../personal-data.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle}=UI;
export function PersonalView(){
  return Stack([
    ToolTitle('Personal information',{actionsId:'personal-actions',statusId:'personal-status'}),
    SettingsGroup({title:'Expiring soon',level:2,children:[Stack([],{id:'personal-expiring'})]}),
    SettingsGroup({title:'Your records',level:2,children:[
      FormField({id:'personal-search',label:'Find a record',kind:'search',placeholder:'Name, category, person…'}),
      Stack([],{id:'personal-list',className:'travel-list'})
    ]}),
    Disclosure('Add or edit a record',[
      Form([
        UI.Strong('New record',{id:'personal-editor-title'}),
        FormField({id:'personal-category',label:'Category',kind:'select',options:PERSONAL_CATEGORIES.map(text=>({text,value:text}))}),
        FormField({id:'personal-label',label:'Record name',kind:'text',placeholder:'e.g. Passport number'}),
        FormField({id:'personal-person',label:'Who this is about (optional)',kind:'text',placeholder:'e.g. Eric'}),
        FormField({id:'personal-hint',label:'Hint shown in the list (optional)',kind:'text',placeholder:'e.g. ends 7781'}),
        FormField({id:'personal-expires',label:'Expires (optional)',kind:'date'}),
        FormField({id:'personal-value',label:'Protected value',kind:'textarea',rows:2}),
        FormField({id:'personal-notes',label:'Protected notes (optional)',kind:'textarea',rows:3}),
        Note('',{id:'personal-value-state',role:'status',hidden:true}),
        Notice('',{id:'personal-form-status',role:'status'}),
        ActionGroup([Button('Save record',{id:'personal-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'personal-cancel',variant:'secondary'})])
      ],{id:'personal-form',className:'form-stack'})
    ],{id:'personal-editor'}),
  ],{className:'personal-records'});
}
export function PersonalGroup(category,rows){
  return Section([GroupTitle(category,{className:'record-group-title'}),...rows],{className:'record-group'});
}
