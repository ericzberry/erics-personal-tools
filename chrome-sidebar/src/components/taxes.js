import * as UI from './ui.js';
import {TAX_DOCUMENT_TYPES,taxYears,defaultTaxYear,TAX_ROOT_FOLDER_URL,MAX_DOCUMENT_BYTES} from '../tax-data.js';
import {ACCEPTED} from '../statement-text.js';
const {Stack,Section,Note,Notice,Button,ActionGroup,SettingsGroup,FormField,Strong,Label,Text,Link,ToolTitle,GroupTitle}=UI;

export const fileSize=bytes=>bytes>=1000000?`${(bytes/1000000).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1000))} KB`;
const filedOn=stamp=>{
  const date=new Date(stamp);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
};

export function TaxesView({today=new Date()}={}){
  return Stack([
    ToolTitle('Taxes',{actionsId:'taxes-actions',statusId:'taxes-status'}),
    SettingsGroup({title:'Google Drive',level:2,children:[
      Stack([],{id:'taxes-connection'}),
      Notice('',{id:'taxes-connection-status',role:'status'})
    ]}),
    SettingsGroup({title:'File a document',level:2,children:[
      UI.UploadField({id:'taxes-drop',inputId:'taxes-file',statusId:'taxes-file-status',
        label:'Drop a tax document',formats:`PDF, image, CSV or XLSX · up to ${MAX_DOCUMENT_BYTES/1000000} MB`,
        accept:ACCEPTED.join(','),status:'',resetId:'taxes-file-clear',resetLabel:'Remove file'}),
      FormField({id:'taxes-connection-picker',label:'AI connection',kind:'select',options:[{text:'Choose a connection',value:''}]}),
      Note('',{id:'taxes-ai-status',role:'status'}),
      Stack([],{id:'taxes-document',hidden:true}),
      FormField({id:'taxes-type',label:'Document type',kind:'select',
        options:[{text:'Choose a type',value:''},...TAX_DOCUMENT_TYPES.map(type=>({text:type.label,value:type.id}))]}),
      FormField({id:'taxes-issuer',label:'What it is',kind:'text',placeholder:'e.g. Schwab'}),
      FormField({id:'taxes-year',label:'Tax year',kind:'select',
        options:taxYears(today).map(year=>({text:year,value:year}))}),
      Stack([],{id:'taxes-destination',className:'tax-destination',hidden:true}),
      Stack([],{id:'taxes-conflict',hidden:true}),
      Notice('',{id:'taxes-file-form-status',role:'status'}),
      Stack([],{id:'taxes-file-actions'})
    ]}),
    Stack([SettingsGroup({title:'In Drive',level:2,children:[
      Stack([],{id:'taxes-filed'}),
      Link('Open the tax folder',TAX_ROOT_FOLDER_URL,{className:'footnote'})
    ]})],{id:'taxes-drive-contents',hidden:true})
    // The shared wallet surface every tool's root carries: record rows, action
    // roles and the danger colouring all hang off it. Finance and Personal
    // information inherit it from the lock screen they mount inside; this
    // section has none, so it wears it itself.
  ],{className:'travel-wallet tax-filing'});
}

export const defaultYearFor=today=>defaultTaxYear(today);

// What the device pulled out of the dropped file, before anything is sent or
// filed. A reading that went badly has to be visible here: the owner deciding
// "that is wrong, I will name it myself" is the point of showing it.
export function DocumentCard({label,detail,note,tone,onRemove}){
  const remove=Button('Remove',{variant:'subtle',size:'compact'});
  remove.addEventListener('click',onRemove);
  return Section([
    Stack([Strong(label),Text(detail,{className:'footnote'})]),
    note?Notice(note,{tone}):null,
    ActionGroup([remove],{compact:true})
  ],{className:'record-row'});
}

// The name and folder this document would take, shown before it moves so the
// owner is approving a destination rather than trusting one.
export const Destination=({year,name})=>Stack([
  Label('Files as'),
  Strong(`${year} / ${name}`,{className:'tax-destination-name'})
],{className:'tax-destination-line'});

// A name already in that year's folder. Replacing is the destructive choice, so
// it says what would be overwritten and is not the first or the default button.
export function ConflictPanel({existing,keepBothName,onKeepBoth,onReplace,onCancel}){
  const keep=Button('Keep both',{variant:'primary',size:'compact'});
  const replace=Button('Replace it',{variant:'danger',size:'compact'});
  const cancel=Button('Cancel',{variant:'secondary',size:'compact'});
  keep.addEventListener('click',onKeepBoth);
  replace.addEventListener('click',onReplace);
  cancel.addEventListener('click',onCancel);
  return Section([
    Strong(`${existing.name} is already filed there`),
    Note([filedOn(existing.modifiedTime)&&`Last changed ${filedOn(existing.modifiedTime)}`,existing.size&&fileSize(existing.size)].filter(Boolean).join(' · ')),
    Note(`Keeping both files this one as ${keepBothName}. Replacing overwrites the copy in Drive.`),
    ActionGroup([keep,replace,cancel],{compact:true})
  ],{className:'record-row'});
}

export function FiledList(year,files){
  if(!files.length)return Stack([GroupTitle(year,{className:'record-group-title'}),Note('Nothing filed yet.')],{className:'record-group'});
  return Section([
    GroupTitle(`${year} · ${files.length} document${files.length===1?'':'s'}`,{className:'record-group-title'}),
    ...files.map(file=>Stack([
      file.webViewLink?Link(file.name,file.webViewLink):Strong(file.name),
      Note([filedOn(file.modifiedTime),file.size&&fileSize(file.size)].filter(Boolean).join(' · '))
    ],{className:'tax-filed-row'}))
  ],{className:'record-group'});
}

// One row, and only what applies: a connected account offers Disconnect, an
// unconnected one offers Connect. `consentUrl` appears only when the host could
// not open Google's page itself, so a blocked popup leaves a link rather than a
// button that does nothing.
export const ConnectionPanel=({connected,account,consentUrl='',onConnect,onDisconnect})=>{
  const button=connected?Button('Disconnect',{variant:'danger-subtle',size:'compact'}):Button('Connect Google Drive',{variant:'primary',size:'compact'});
  button.addEventListener('click',connected?onDisconnect:onConnect);
  return Stack([
    connected?Strong(account||'Connected'):null,
    ActionGroup([button],{compact:true}),
    consentUrl&&!connected?Link('Open Google consent',consentUrl,{className:'footnote'}):null
  ].filter(Boolean),{className:'tax-connection'});
};
