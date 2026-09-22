import * as UI from './ui.js';
const {Stack,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,ToolTitle,Strong}=UI;
export function ReplacementsView(){
  return Stack([
    ToolTitle('Replacement drawer',{actionsId:'replacements-actions',statusId:'replacements-status'}),
    Stack([],{id:'replacements-capture'}),
    SettingsGroup({title:'Buy again',level:2,children:[
      FormField({id:'replacements-search',label:'Find a thing',kind:'search',placeholder:'Paint, pillow, cable, shop…'}),
      Stack([],{id:'replacements-list',className:'travel-list'})
    ]}),
    Disclosure('Add or edit a thing',[
      Form([
        Strong('New thing',{id:'replacements-editor-title'}),
        FormField({id:'replacements-item',label:'What it is',kind:'text',placeholder:'e.g. Bedroom paint'}),
        FormField({id:'replacements-variant',label:'The exact variant',kind:'text',placeholder:'e.g. Benjamin Moore Hale Navy HC-154, Regal eggshell'}),
        FormField({id:'replacements-where',label:'Where you bought it (optional)',kind:'text',placeholder:'A shop, or https://'}),
        FormField({id:'replacements-note',label:'Note (optional)',kind:'text',placeholder:'e.g. Two gallons does the room'}),
        Notice('',{id:'replacements-form-status',role:'status'}),
        ActionGroup([Button('Save thing',{id:'replacements-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'replacements-cancel',variant:'secondary'})])
      ],{id:'replacements-form',className:'form-stack'})
    ],{id:'replacements-editor'})
  ],{className:'travel-wallet replacement-list'});
}
