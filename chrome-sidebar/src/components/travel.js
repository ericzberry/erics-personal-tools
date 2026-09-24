import {Section,Heading,GroupTitle,Note,FormField,FindField,Form,Disclosure,SettingsGroup,ActionGroup,Button,Stack,Strong,ExpandableRecord,RowAction,EDIT_GLYPH,COPY_GLYPH,NOTES_GLYPH,DELETE_GLYPH} from './ui.js';
import {TRAVEL_CATEGORIES} from '../travel-data.js';
export function TravelView({connection=true,mode='inline',editId=null}={}) {
  return Section([
    ActionGroup([Heading(mode==='editor'?(editId?'Edit record':'Add record'):'Travel wallet',1),Button('Add record',{id:'travel-add',variant:'primary',size:'compact',hidden:mode!=='browse'})],{compact:true}),
    Note('',{id:'travel-status',role:'status','aria-live':'polite'}),
    Stack([
      FindField({id:'travel-search',label:'Find record',hiddenLabel:true,placeholder:'find record'}),
      Stack([],{id:'travel-list',className:'travel-list'})
    ],{hidden:mode==='editor',className:'record-search'}),
    (mode==='editor'?(_title,children,props)=>Section(children,props):Disclosure)('Add or edit a record',[
      Form([
        Strong('New record',{id:'travel-editor-title'}),
        FormField({id:'travel-category',label:'Category',kind:'select',options:TRAVEL_CATEGORIES.map(text=>({text,value:text}))}),
        FormField({id:'travel-name',label:'Program or document name',kind:'text',placeholder:'e.g. Delta SkyMiles'}),
        FormField({id:'travel-number',label:'Number',kind:'password'}),
        FormField({id:'travel-notes',label:'Notes (optional)',kind:'password'}),
        ActionGroup([Button('Save record',{id:'travel-save',type:'submit',variant:'primary'}),Button('Cancel edits',{id:'travel-cancel',variant:'secondary'})],{compact:true}),
        Note('',{id:'travel-form-status',role:'status'})
      ],{id:'travel-form',className:'form-stack'})
    ],{id:'travel-editor',hidden:mode==='browse'}),
    ...(connection?[TravelConnection()]:[])
  ],{className:'travel-wallet'});
}
export function TravelGroup(category, rows) {
  return Section([GroupTitle(category,{className:'record-group-title'}),...rows],{className:'record-group'});
}

export function TravelRecord(record, {onEdit,onCopy,onShow,onCopyNotes,onDelete,onResolve,showNumber=false}) {
  const action=(label,options)=>Button(label,{size:'compact',...options});
  const number=Strong(showNumber?record.number||'—':'••••••••',{className:'travel-number','aria-live':'polite'});
  const remove=RowAction(DELETE_GLYPH,`Delete ${record.name}`,()=>{confirmation.hidden=false;confirm.focus();},{danger:true});
  const confirm=action('Delete from all devices',{variant:'danger'}), keep=action('Keep record',{variant:'secondary'});
  const confirmation=Stack([Note('Delete this record from all devices?'),ActionGroup([confirm,keep],{compact:true})],{hidden:true});
  keep.addEventListener('click',()=>{confirmation.hidden=true;remove.focus();});confirm.addEventListener('click',onDelete);
  // The number and the verbs that act on it are one line: Copy sits beside the
  // value it copies, and the record's own actions are the glyphs every other
  // list in the wallet carries rather than a row of words under the record.
  const numberLine=Stack([number,ActionGroup([
    RowAction(EDIT_GLYPH,`Edit ${record.name}`,onEdit),
    RowAction(COPY_GLYPH,`Copy number for ${record.name}`,onCopy),
    ...(record.hasNotes?[RowAction(NOTES_GLYPH,`Copy notes for ${record.name}`,onCopyNotes)]:[]),
    remove],{compact:true})],{className:'record-number-line'});
  const decisions=[confirmation];
  if(record.conflict){
    const local=action('Keep this device’s changes',{variant:'secondary'}), cloud=action('Use cloud version',{variant:'secondary'});
    const accept=action('Discard my pending change',{variant:'danger'}), cancel=action('Keep reviewing',{variant:'secondary'});
    const warning=Stack([Note('Discard this device’s change and use the cloud version?'),ActionGroup([accept,cancel],{compact:true})],{hidden:true});
    local.addEventListener('click',()=>onResolve('local'));
    cloud.addEventListener('click',()=>{warning.hidden=false;accept.focus();});cancel.addEventListener('click',()=>{warning.hidden=true;cloud.focus();});
    accept.addEventListener('click',()=>onResolve('cloud'));
    decisions.push(Stack([Note('Changed on another device. Choose which version to use.'),ActionGroup([local,cloud],{compact:true}),warning]));
  }
  // What a record raised for this device to decide stays with the number it was
  // raised against: beside it where the number is always shown, under it where
  // opening the record is what brings the number out.
  const detail=Note([showNumber?record.traveler:'',record.expires?`Expires ${record.expires}`:''].filter(Boolean).join(' · '));
  return ExpandableRecord({
    title:record.name,
    subtitle:[showNumber?'':record.traveler,record.pending?(record.conflict?'Needs review':record.deleting?'Deletion waiting to sync':'Waiting to sync'):''].filter(Boolean).join(' · '),
    preview:showNumber?Stack([numberLine,...decisions],{className:'record-value'}):null,
    children:showNumber?[detail]:[numberLine,detail,...decisions],
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
      Stack([
        Note('',{id:'travel-connection',role:'status'}),
        Stack([FormField({id:'travel-token',label:'Private access token',kind:'password'}),ActionGroup([Button('Connect',{id:'travel-connect',variant:'primary'})])],{id:'travel-setup',className:'connection-setup'}),
        Stack([
          ActionGroup([Button('Refresh records',{id:'travel-refresh',variant:'secondary',size:'compact'}),Button('Disconnect this device',{id:'travel-disconnect',variant:'danger',size:'compact'})],{compact:true})
        ],{id:'travel-maintenance',className:'connection-maintenance',hidden:true}),
        Note('',{id:'travel-connection-status',role:'status'})
      ],{className:'connection-content'})
    ],{id:'travel-cloud'})],{className:'connection-surface'});}
