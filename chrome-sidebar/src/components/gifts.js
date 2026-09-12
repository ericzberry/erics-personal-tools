import * as UI from './ui.js';
import {GIFT_STATUSES} from '../gift-data.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong}=UI;
export function GiftsView(){
  return Stack([
    ToolTitle('Gift ideas',{actionsId:'gifts-actions',statusId:'gifts-status'}),
    Stack([],{id:'gifts-capture'}),
    SettingsGroup({title:'Ideas',level:2,children:[
      FormField({id:'gifts-search',label:'Find an idea',kind:'search',placeholder:'Person, idea, occasion…'}),
      Stack([],{id:'gifts-list',className:'travel-list'})
    ]}),
    Disclosure('Add or edit a gift idea',[
      Form([
        Strong('New idea',{id:'gifts-editor-title'}),
        FormField({id:'gifts-person',label:'Who it is for',kind:'text',placeholder:'e.g. Ariana'}),
        FormField({id:'gifts-idea',label:'The idea',kind:'text',placeholder:'e.g. Cast iron pan'}),
        FormField({id:'gifts-occasion',label:'Occasion (optional)',kind:'text',placeholder:'e.g. Birthday'}),
        FormField({id:'gifts-date',label:'Occasion date (optional)',kind:'date'}),
        FormField({id:'gifts-price',label:'Price (optional)',kind:'number'}),
        FormField({id:'gifts-link',label:'Link (optional)',kind:'url',placeholder:'https://'}),
        FormField({id:'gifts-status',label:'Status',kind:'select',options:GIFT_STATUSES.map(text=>({text,value:text}))}),
        FormField({id:'gifts-notes',label:'Notes (optional)',kind:'textarea',rows:3}),
        Notice('',{id:'gifts-form-status',role:'status'}),
        ActionGroup([Button('Save idea',{id:'gifts-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'gifts-cancel',variant:'secondary'})])
      ],{id:'gifts-form',className:'form-stack'})
    ],{id:'gifts-editor'})
  ],{className:'travel-wallet gift-list'});
}
export function GiftGroup(person,rows){
  return Section([GroupTitle(person,{className:'record-group-title'}),...rows],{className:'record-group'});
}
