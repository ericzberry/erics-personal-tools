import {Section,Heading,Note,FormField,Form,Disclosure,SettingsGroup,ActionGroup,Button,Stack,Strong,ExpandableRecord,CopyIconButton} from './ui.js';
import {TRAVEL_CATEGORIES} from '../travel-data.js';
export function TravelView({connection=true,mode='inline',editId=null}={}) {
  return Section([
    ActionGroup([Heading(mode==='editor'?(editId?'Edit record':'Add record'):'Travel wallet',1),Button('Add record',{id:'travel-add',variant:'primary',size:'compact',hidden:mode!=='browse'})],{compact:true}),
    Note('',{id:'travel-status',role:'status','aria-live':'polite'}),
    Stack([
      FormField({id:'travel-search',label:'Find record',hiddenLabel:true,kind:'search',placeholder:'find record'}),
      Stack([],{id:'travel-list',className:'travel-list'})
    ],{hidden:mode==='editor',className:'record-search'}),
    (mode==='editor'?(_title,children,props)=>Section(children,props):Disclosure)('Add or edit a record',[
      Note('Add airline, hotel, rental-car, trusted traveler, passport, visa, or other membership numbers.'),
      Form([
        Strong('New record',{id:'travel-editor-title'}),
        FormField({id:'travel-category',label:'Category',kind:'select',options:TRAVEL_CATEGORIES.map(text=>({text,value:text}))}),
        FormField({id:'travel-name',label:'Program or document name',kind:'text',placeholder:'e.g. Delta SkyMiles'}),
        FormField({id:'travel-number',label:'Number',kind:'password'}),
        Note(mode==='editor'?'Numbers stay masked while you edit.':'Tap a program to see its number, or use Copy in the list.',{id:'travel-number-help'}),
        FormField({id:'travel-notes',label:'Notes (optional)',kind:'password'}),
        Note('On edit, blank number and notes fields keep their saved values.'),
        ActionGroup([Button('Save record',{id:'travel-save',type:'submit',variant:'primary'}),Button('Cancel edits',{id:'travel-cancel',variant:'secondary'})],{compact:true}),
        Note('',{id:'travel-form-status',role:'status'})
      ],{id:'travel-form',className:'form-stack'})
    ],{id:'travel-editor',hidden:mode==='browse'}),
    ...(connection?[TravelConnection()]:[])
  ],{className:'travel-wallet'});
}
export function TravelRecord(record, {onEdit,onCopy,onShow,onCopyNotes,onDelete,onResolve,showNumber=false}) {
  const action=(label,options)=>Button(label,{size:'compact',...options});
  const number=Strong(showNumber?record.number||'—':'••••••••',{className:'travel-number','aria-live':'polite'});
  const copy=CopyIconButton(`Copy number for ${record.name}`), edit=action('Edit',{variant:'subtle'}), remove=action('Delete',{variant:'danger-subtle'});
  copy.addEventListener('click',onCopy);edit.addEventListener('click',onEdit);
  const confirm=action('Delete from all devices',{variant:'danger'}), keep=action('Keep record',{variant:'secondary'});
  const confirmation=Stack([Note('Permanently delete this travel record from all devices?'),ActionGroup([confirm,keep],{compact:true})],{hidden:true});
  remove.addEventListener('click',()=>{confirmation.hidden=false;confirm.focus();});
  keep.addEventListener('click',()=>{confirmation.hidden=true;remove.focus();});confirm.addEventListener('click',onDelete);
  const notes=action('Copy notes',{variant:'subtle'});notes.addEventListener('click',onCopyNotes);
  const resolutions=Stack([]);
  if(record.conflict){
    const local=action('Keep this device’s changes',{variant:'secondary'}), cloud=action('Use cloud version',{variant:'secondary'});
    const accept=action('Discard my pending change',{variant:'danger'}), cancel=action('Keep reviewing',{variant:'secondary'});
    const warning=Stack([Note('Discard the pending change on this device and use the cloud version?'),ActionGroup([accept,cancel],{compact:true})],{hidden:true});
    local.addEventListener('click',()=>onResolve('local'));
    cloud.addEventListener('click',()=>{warning.hidden=false;accept.focus();});cancel.addEventListener('click',()=>{warning.hidden=true;cloud.focus();});
    accept.addEventListener('click',()=>onResolve('cloud'));
    resolutions.append(Note('Changed on another device. Choose which version to use.'),ActionGroup([local,cloud],{compact:true}),warning);
  }
  return ExpandableRecord({
    title:record.name,
    subtitle:[record.traveler,record.pending?(record.conflict?'Needs review':record.deleting?'Deletion waiting to sync':'Waiting to sync'):''].filter(Boolean).join(' · '),
    action:showNumber?null:copy,
    preview:showNumber?Stack([number,copy],{className:'record-number-line'}):null,
    children:[...(showNumber?[]:[number]),Note([record.category,record.expires?`Expires ${record.expires}`:''].filter(Boolean).join(' · ')),ActionGroup([edit,...(record.hasNotes?[notes]:[]),remove],{compact:true}),confirmation,resolutions],
    onToggle:async open=>{
      if(showNumber)return;
      number.textContent='••••••••';
      if(!open)return;
      const value=await onShow();
      if(value!==undefined)number.textContent=value;
    }
  });
}

export function TravelConnection(){return Stack([Disclosure('Connection settings',[
      Note('Connect with the same private access token on each device.',{id:'travel-connection',role:'status'}),
      Stack([FormField({id:'travel-token',label:'Private access token',kind:'password'}),Button('Connect',{id:'travel-connect',variant:'primary'})],{id:'travel-setup'}),
      ActionGroup([Button('Refresh records',{id:'travel-refresh',variant:'secondary'}),Button('Disconnect this device',{id:'travel-disconnect',variant:'danger'})],{compact:true}),
      Note('Records are encrypted in cloud storage. Downloaded records are encrypted on this device for offline use. Changes sync when connected. Disconnect clears this device’s copy and keeps cloud records.')
    ],{id:'travel-cloud'})],{className:'connection-surface'});}
