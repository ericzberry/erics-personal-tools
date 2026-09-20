import * as UI from './ui.js';
import {TAX_DOCUMENT_TYPES,TAX_TAXPAYERS,TAX_CATEGORIES,TAX_JURISDICTIONS,TAX_QUARTERS,taxYears,defaultTaxYear,TAX_ROOT_FOLDER_URL,MAX_DOCUMENT_BYTES} from '../tax-data.js';
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
    // Only when it is not connected: a working connection is plumbing, and the
    // tool is about the document in front of you, not the account behind it.
    Stack([SettingsGroup({title:'Google Drive',level:2,children:[
      Stack([],{id:'taxes-connection'})
    ]})],{id:'taxes-connection-section',hidden:true}),
    SettingsGroup({title:'File a document',level:2,children:[
      UI.UploadField({id:'taxes-drop',inputId:'taxes-file',statusId:'taxes-file-status',
        label:'Drop a tax document',formats:`PDF, image, CSV or XLSX · up to ${MAX_DOCUMENT_BYTES/1000000} MB`,
        accept:ACCEPTED.join(','),status:'',resetId:'taxes-file-clear',resetLabel:'Remove file'}),
      // The reading picks its own connection. This line speaks only when there
      // is none to pick.
      Note('',{id:'taxes-ai-status',role:'status'}),
      Stack([],{id:'taxes-document',hidden:true}),
      Stack([],{id:'taxes-password',hidden:true}),
      FormField({id:'taxes-type',label:'Document type',kind:'select',
        options:[{text:'Choose a type',value:''},...TAX_DOCUMENT_TYPES.map(type=>({text:type.label,value:type.id}))]}),
      FormField({id:'taxes-issuer',label:'What it is',kind:'text',placeholder:'e.g. Schwab'}),
      // Whose document this is, and what it is for. Together they are the two
      // folders inside the year, so a taxpayer's return, the instalments that
      // paid it and the K-1s behind it each sit where they belong.
      FormField({id:'taxes-taxpayer',label:'Taxpayer',kind:'select',
        options:TAX_TAXPAYERS.map(who=>({text:who.label,value:who.id}))}),
      FormField({id:'taxes-category',label:'Filed under',kind:'select',
        options:TAX_CATEGORIES.map(category=>({text:category.label,value:category.id}))}),
      // Only for what the household filed or paid: which government, and which
      // instalment of the year.
      FormField({id:'taxes-jurisdiction',label:'Tax authority',kind:'select',
        options:[{text:'Choose Federal or New York',value:''},...TAX_JURISDICTIONS.map(place=>({text:place.label,value:place.id}))]}),
      FormField({id:'taxes-quarter',label:'Quarter',kind:'select',
        options:[{text:'Choose a quarter',value:''},...TAX_QUARTERS.map(quarter=>({text:quarter.label,value:quarter.id}))]}),
      FormField({id:'taxes-year',label:'Tax year',kind:'select',
        options:taxYears(today).map(year=>({text:year,value:year}))}),
      Stack([],{id:'taxes-destination',className:'tax-destination',hidden:true}),
      Stack([],{id:'taxes-conflict',hidden:true}),
      Notice('',{id:'taxes-file-form-status',role:'status'}),
      Stack([],{id:'taxes-file-actions',className:'action-group action-group--compact'})
    ]}),
    Stack([SettingsGroup({title:'Already filed',level:2,children:[
      Stack([],{id:'taxes-filed'}),
      Link('Open the tax folder',TAX_ROOT_FOLDER_URL,{className:'footnote tax-folder-link'})
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
// owner is approving a destination rather than trusting one. `path` is the
// folders under the tax folder, outermost first, so a year that is divided by
// taxpayer shows the division rather than only the year.
export const Destination=({path=[],name})=>Stack([
  Label('Files as'),
  Strong([...path,name].join(' / '),{className:'tax-destination-name'})
],{className:'tax-destination-line'});

// A document that arrived locked. The password is used on this device and
// never sent anywhere: it opens the file so an unlocked copy can be written
// here, and that copy is what Drive receives. Filing it as it arrived stays
// available, because a password nobody has is not a reason to lose the
// document — and that choice, not a paragraph, is what says so.
//
// What is wrong, and what a refused password said, belong to the status line
// this panel appears under, so they are not repeated inside it.
export function PasswordPanel({value='',busy=false,onType,onUnlock,onSkip}){
  const field=FormField({id:'taxes-password-value',label:'Password',kind:'password'});
  const input=field.querySelector('input');
  // A password that was refused is kept, so a typo is corrected rather than
  // typed again from the start.
  input.value=value;
  const unlock=Button('Unlock and file',{variant:'primary',size:'compact',disabled:busy});
  const skip=Button('File it locked',{variant:'secondary',size:'compact',disabled:busy});
  input.addEventListener('input',()=>onType(input.value));
  unlock.addEventListener('click',()=>onUnlock(input.value));
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();onUnlock(input.value);}});
  skip.addEventListener('click',onSkip);
  return Section([field,ActionGroup([unlock,skip],{compact:true})],{className:'record-row tax-password'});
}

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
    Note(`Keeping both files this one as ${keepBothName}. Replacing overwrites the copy already filed.`),
    ActionGroup([keep,replace,cancel],{compact:true})
  ],{className:'record-row'});
}

// What a year holds, read down rather than across: one line per document and
// nothing else on it. A date and a size on every row doubled the length of a
// list whose whole job is to answer "is this one already filed?".
//
// `groups` are the year's folders — from 2026 one per taxpayer, each divided
// again by what a document is for. Loose documents come before the folders at
// whichever level they sit at, which is where every document of 2025 and
// earlier is.
const countIn=group=>group.files.length+(group.groups||[]).reduce((count,inner)=>count+countIn(inner),0);
export function FiledList(year,files,groups=[]){
  const total=files.length+groups.reduce((count,group)=>count+countIn(group),0);
  if(!total)return Stack([GroupTitle(year,{className:'record-group-title'}),Note('Nothing filed yet.')],{className:'record-group'});
  // The list is one flat run of lines, so how deep a row sits is carried on the
  // row itself rather than inferred from what precedes it.
  const row=depth=>file=>{
    const props={className:`tax-filed-row tax-filed-row--${depth}`};
    return file.webViewLink?Link(file.name,file.webViewLink,props):Strong(file.name,props);
  };
  const under=(group,depth)=>[
    Strong(group.name,{className:`tax-filed-group tax-filed-group--${depth}`}),
    ...group.files.map(row(depth)),
    ...(group.groups||[]).flatMap(inner=>under(inner,depth+1))
  ];
  return Section([
    GroupTitle(`${year} · ${total} document${total===1?'':'s'}`,{className:'record-group-title'}),
    ...files.map(row(0)),
    ...groups.flatMap(group=>under(group,1))
  ],{className:'record-group tax-filed-list'});
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
