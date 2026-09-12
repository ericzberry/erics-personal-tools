import * as UI from './ui.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong}=UI;
export function GiftsView(){
  return Stack([
    ToolTitle('Gift ideas',{actionsId:'gifts-actions',statusId:'gifts-status'}),
    Stack([],{id:'gifts-capture'}),
    SettingsGroup({title:'Ideas',level:2,children:[
      FormField({id:'gifts-search',label:'Find an idea',kind:'search',placeholder:'Person or idea…'}),
      Stack([],{id:'gifts-list',className:'travel-list'})
    ]}),
    // Bought is out of the way but never gone: it is the answer to "what did I
    // already get them", which is the other half of deciding.
    Disclosure('Bought',[Stack([],{id:'gifts-bought',className:'travel-list'})],{id:'gifts-bought-view'}),
    Disclosure('Add or edit a gift idea',[
      Form([
        Strong('New idea',{id:'gifts-editor-title'}),
        FormField({id:'gifts-person',label:'Who it is for',kind:'text',placeholder:'e.g. Ariana'}),
        FormField({id:'gifts-idea',label:'The idea',kind:'text',placeholder:'e.g. Cast iron skillet, the 12 inch one'}),
        FormField({id:'gifts-link',label:'Link (optional)',kind:'url',placeholder:'https://'}),
        Notice('',{id:'gifts-form-status',role:'status'}),
        ActionGroup([Button('Save idea',{id:'gifts-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'gifts-cancel',variant:'secondary'})])
      ],{id:'gifts-form',className:'form-stack'})
    ],{id:'gifts-editor'})
  ],{className:'travel-wallet gift-list'});
}
export function GiftGroup(person,rows){
  return Section([GroupTitle(person,{className:'record-group-title'}),...rows],{className:'record-group'});
}
