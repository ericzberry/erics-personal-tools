import * as UI from './ui.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong}=UI;
import {PROPERTY_STATUSES} from '../property-data.js';
export function PropertiesView(){
  return Stack([
    ToolTitle('Properties',{actionsId:'properties-actions',statusId:'properties-status'}),
    // Beside a listing this offers to keep it, or to bring a saved one up to
    // date; beside anything else it is empty and takes no room.
    ActionGroup([],{id:'properties-page',compact:true,hidden:true}),
    Stack([],{id:'properties-capture'}),
    SettingsGroup({title:'Shortlist',level:2,children:[
      FormField({id:'properties-search',label:'Find a property',kind:'search',placeholder:'Address or note…'}),
      Stack([],{id:'properties-list',className:'travel-list'})
    ]}),
    // Passed is out of the way but never gone: it is the answer to "didn't we
    // already look at that one", which comes up in every search.
    Disclosure('Passed',[Stack([],{id:'properties-passed',className:'travel-list'})],{id:'properties-passed-view'}),
    Disclosure('Add or edit a property',[
      Form([
        Strong('New property',{id:'properties-editor-title'}),
        FormField({id:'properties-address',label:'Address',kind:'text'}),
        FormField({id:'properties-status-field',label:'Status',kind:'select',options:PROPERTY_STATUSES.map(status=>({value:status,text:status}))}),
        FormField({id:'properties-price',label:'Price',kind:'text'}),
        Stack([
          FormField({id:'properties-beds',label:'Beds',kind:'text'}),
          FormField({id:'properties-baths',label:'Baths',kind:'text'}),
          FormField({id:'properties-sqft',label:'Sq ft',kind:'text'})
        ],{className:'property-figures'}),
        Stack([
          FormField({id:'properties-taxes',label:'Taxes per year',kind:'text'}),
          FormField({id:'properties-hoa',label:'HOA per month',kind:'text'})
        ],{className:'property-figures'}),
        FormField({id:'properties-link',label:'Link',kind:'url',placeholder:'https://'}),
        FormField({id:'properties-notes',label:'Notes',kind:'textarea',rows:3}),
        Notice('',{id:'properties-form-status',role:'status'}),
        ActionGroup([
          Button('Save property',{id:'properties-save',variant:'primary',type:'submit'}),
          Button('Cancel edit',{id:'properties-cancel',variant:'secondary'}),
          Button('Delete',{id:'properties-delete',variant:'danger-subtle',hidden:true})
        ]),
        Stack([
          Note('',{id:'properties-delete-question'}),
          ActionGroup([Button('Delete from all devices',{id:'properties-delete-confirm',variant:'danger'}),Button('Keep property',{id:'properties-delete-keep',variant:'secondary'})],{compact:true})
        ],{id:'properties-delete-confirmation',hidden:true})
      ],{id:'properties-form',className:'form-stack'})
    ],{id:'properties-editor'})
  ],{className:'travel-wallet property-list'});
}
export function PropertyGroup(status,rows){
  return Section([GroupTitle(status,{className:'record-group-title'}),...rows],{className:'record-group'});
}
