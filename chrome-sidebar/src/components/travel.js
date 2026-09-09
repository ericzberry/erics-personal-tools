import {Section,Heading,Note,FormField,Form,Disclosure,SettingsGroup,ActionGroup,Button,Stack,Strong} from './ui.js';
export const TRAVEL_CATEGORIES = ['Airline','Hotel','Rental car','Trusted traveler','Passport','Visa','Other'];
export function TravelView() {
  return Section([
    Heading('Travel wallet',1), Note('Your travel numbers, together across your extension and phone.'),
    Disclosure('Connection',[
      Note('Connect with the same private access token on each device.',{id:'travel-connection',role:'status'}),
      FormField({id:'travel-token',label:'Private access token',kind:'password'}),
      ActionGroup([Button('Connect',{id:'travel-connect',variant:'primary'}),Button('Refresh records',{id:'travel-refresh',variant:'secondary'}),Button('Disconnect this device',{id:'travel-disconnect',variant:'danger'})],{compact:true}),
      Note('Records are encrypted in cloud storage. Internet is required to load and save them. Disconnecting keeps your saved records.')
    ],{id:'travel-cloud',open:true,titleHeading:true}),
    Note('',{id:'travel-status',role:'status','aria-live':'polite'}),
    SettingsGroup({title:'Saved travel details',level:2,children:[
      FormField({id:'travel-search',label:'Find a record',kind:'search',placeholder:'Program, traveler, or category'}),
      Stack([],{id:'travel-list',className:'travel-list'})
    ]}),
    SettingsGroup({title:'Add or edit a record',level:2,children:[
      Note('Add airline, hotel, rental-car, trusted traveler, passport, visa, or other membership numbers.'),
      Form([
        Strong('New record',{id:'travel-editor-title'}),
        FormField({id:'travel-category',label:'Category',kind:'select',options:TRAVEL_CATEGORIES.map(text=>({text,value:text}))}),
        FormField({id:'travel-name',label:'Program or document name',kind:'text',placeholder:'e.g. Delta SkyMiles'}),
        FormField({id:'travel-traveler',label:'Traveler (optional)',kind:'text'}),
        FormField({id:'travel-number',label:'Number',kind:'password'}),
        Note('Numbers stay hidden. Use Copy number when you need one.',{id:'travel-number-help'}),
        FormField({id:'travel-expires',label:'Expiration date (optional)',kind:'date'}),
        FormField({id:'travel-notes',label:'Private notes (optional)',kind:'password'}),
        Note('On edit, blank number and notes fields keep their saved values. Use Clear notes to remove saved notes.'),
        ActionGroup([Button('Save record',{id:'travel-save',type:'submit',variant:'primary'}),Button('Cancel edits',{id:'travel-cancel',variant:'secondary'}),Button('Clear notes',{id:'travel-clear-notes',variant:'secondary'})],{compact:true}),
        Note('',{id:'travel-form-status',role:'status'})
      ],{id:'travel-form',className:'form-stack'})
    ]})
  ],{className:'travel-wallet'});
}
export function TravelRecord(record, {onEdit,onCopy,onCopyNotes,onDelete}) {
  const copy=Button('Copy number',{variant:'secondary'}), edit=Button('Edit',{variant:'secondary'}), remove=Button('Delete',{variant:'danger'});
  copy.addEventListener('click',onCopy);edit.addEventListener('click',onEdit);
  const confirm=Button('Delete from all devices',{variant:'danger'}), keep=Button('Keep record',{variant:'secondary'});
  const confirmation=Stack([Note('Permanently delete this travel record from all devices?'),ActionGroup([confirm,keep],{compact:true})],{hidden:true});
  remove.addEventListener('click',()=>{confirmation.hidden=false;confirm.focus();});
  keep.addEventListener('click',()=>{confirmation.hidden=true;remove.focus();});confirm.addEventListener('click',onDelete);
  const notes=Button('Copy notes',{variant:'secondary'});notes.addEventListener('click',onCopyNotes);
  return Section([Strong(record.name),Note([record.category,record.traveler,record.expires?`Expires ${record.expires}`:''].filter(Boolean).join(' · ')),Note('Number: ••••••••'),ActionGroup([copy,edit,...(record.hasNotes?[notes]:[]),remove],{compact:true}),confirmation],{className:'travel-record'});
}
