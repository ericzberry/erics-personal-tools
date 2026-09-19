import * as UI from './ui.js';
import {ASSET_CLASSES,REGISTRATIONS,classLabel,registrationLabel} from '../finance-data.js';
import {ACCEPTED} from '../statement-text.js';
const {Stack,Section,GroupTitle,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,Strong,Label,Text,ToolTitle}=UI;

export function money(value,currency='USD'){
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:Math.abs(value)>=1000?0:2}).format(value);}
  catch{return `${value.toLocaleString('en-US',{maximumFractionDigits:2})} ${currency}`;}
}
export const Figure=({label,value,id,tone=''})=>Stack([Label(label,{className:'figure-label'}),Strong(value,{id,className:`figure-value${tone?` figure-value--${tone}`:''}`})],{className:'figure'});
export const classOptions=()=>ASSET_CLASSES.map(entry=>({text:`${entry.label}${entry.side==='liability'?' (liability)':''}`,value:String(entry.code)}));
export const registrationOptions=()=>REGISTRATIONS.map(entry=>({text:entry.label,value:String(entry.code)}));

// What a reading came to, after the device folded it. A page states an account
// total and the holdings inside it, and those must never be added together; by
// the time a figure reaches this panel that has been settled, so what is shown
// is what would be saved: one amount per portfolio and asset class, every one
// of them editable, because the owner is the only one who can see whether a
// figure is right. Nothing is written by reading.
export function FoldReview({rows=[],notes=[],editing=false,disabled=false,saveLabel='Save these figures',onSave,onEdit,onDiscard,onAmount}){
  const action=(label,variant,handler)=>{
    const node=Button(label,{variant,size:'compact',disabled});
    node.addEventListener('click',handler);
    return node;
  };
  const shared=rows.length&&rows.every(row=>row.asOf===rows[0].asOf)?rows[0].asOf:'';
  return Stack([
    rows.length?Label([`${rows.length} figure${rows.length===1?'':'s'}`,shared?`as of ${shared}`:''].filter(Boolean).join(' · '),{className:'snapshot-meta'}):null,
    ...rows.map((row,index)=>FoldRow(row,{index,editing,dated:!shared,onAmount})),
    ...notes.map(note=>Note(note)),
    ActionGroup([
      action(saveLabel,'primary',onSave),
      ...(editing?[]:[action('Edit','secondary',onEdit)]),
      action('Discard','subtle',onDiscard)
    ],{compact:true})
  ]);
}
// One figure as it would be saved: where it lands, what it is, and what it came
// off. A portfolio that does not exist yet says so before it is made.
function FoldRow(row,{index,editing,dated,onAmount}){
  const target=[
    `${row.name}${row.isNew?' · new portfolio':''}`,
    dated?`as of ${row.asOf}`:'',
    row.from?.length?`from ${row.from.slice(0,3).join(', ')}${row.from.length>3?` and ${row.from.length-3} more`:''}`:''
  ].filter(Boolean).join(' · ');
  if(!editing)return Stack([
    Stack([Label(classLabel(row.class)),Strong(money(row.amount,row.currency))],{className:'snapshot-figure'}),
    Note(target)
  ],{className:'snapshot-row'});
  const field=FormField({id:`finance-fold-value-${index}`,label:classLabel(row.class),kind:'text'});
  const input=field.querySelector('input');
  input.value=String(row.amount);
  input.addEventListener('input',()=>onAmount(index,input.value));
  return Stack([field,Note(target)],{className:'snapshot-row'});
}

// Offered when the owner is already signed in to an account site beside the
// panel. Before anything is read it is one action and a plain sentence saying
// what that action will do; afterwards it is the folded reading above.
export function SnapshotPanel({site,rows=[],notes=[],editing=false,disabled=false,onStore,onSave,onEdit,onDiscard,onAmount}){
  const read=Button(`Read my ${site.label} accounts`,{variant:'primary',size:'compact',disabled});
  read.addEventListener('click',onStore);
  return Stack([
    Strong(site.label,{className:'snapshot-heading'}),
    ...(rows.length?[FoldReview({rows,notes,editing,disabled,onSave,onEdit,onDiscard,onAmount})]:[
      Note('Reads the accounts on the page in front of you and shows what it found. Nothing is saved until you have checked the figures.'),
      ActionGroup([read],{compact:true})
    ])
  ],{className:'snapshot-reading'});
}

export function FinanceView(){
  return Stack([
    ToolTitle('Finance',{actionsId:'finance-actions',statusId:'finance-status'}),
    Section([Stack([],{id:'finance-snapshot-body'}),Notice('',{id:'finance-snapshot-status'})],{id:'finance-snapshot',className:'settings-group snapshot-panel',hidden:true}),
    SettingsGroup({title:'Position',level:2,id:'finance-position',children:[
      Stack([],{id:'finance-currency-switch',className:'currency-switch',hidden:true}),
      Stack([],{id:'finance-totals',className:'finance-totals'}),
      Notice('',{id:'finance-stale',hidden:true}),
      Disclosure('Breakdown',[Stack([],{id:'finance-breakdown'})],{id:'finance-breakdown-panel'}),
      Disclosure('Value over time',[Stack([],{id:'finance-trend'})],{id:'finance-trend-panel'})
    ]}),
    SettingsGroup({title:'Read an update',level:2,children:[
      UI.UploadField({id:'finance-drop',inputId:'finance-file',statusId:'finance-file-status',
        label:'Drop a statement',formats:'PDF, CSV, XLSX or image',accept:ACCEPTED.join(','),
        status:'',resetId:'finance-file-clear',resetLabel:'Remove file'}),
      ActionGroup([Button('Read the accounts on the open page',{id:'finance-page',variant:'secondary',size:'compact'})],{compact:true}),
      Stack([],{id:'finance-attachment',hidden:true}),
      Note('',{id:'finance-ai-status',role:'status'}),
      ActionGroup([Button('Read this',{id:'finance-read',variant:'primary',size:'compact'}),Button('Clear',{id:'finance-intake-clear',variant:'secondary',size:'compact'})],{compact:true}),
      Notice('',{id:'finance-intake-status',role:'status'}),
      Stack([],{id:'finance-drafts'})
    ]}),
    SettingsGroup({title:'Holdings',level:2,id:'finance-records',children:[
      Stack([],{id:'finance-list',className:'travel-list'})
    ]}),
    Disclosure('Enter a figure',[
      Form([
        Strong('New figure',{id:'finance-editor-title'}),
        FormField({id:'finance-portfolio',label:'Portfolio',kind:'select',options:[]}),
        Stack([
          FormField({id:'finance-name',label:'Portfolio name',kind:'text',placeholder:'e.g. Eric and Ariana Berry Estate'}),
          FormField({id:'finance-kind',label:'Registration',kind:'select',options:registrationOptions()}),
          FormField({id:'finance-currency',label:'Currency',kind:'text',placeholder:'USD'})
        ],{id:'finance-portfolio-fields',hidden:true}),
        Stack([
          FormField({id:'finance-class',label:'Asset class',kind:'select',options:classOptions()}),
          FormField({id:'finance-amount',label:'Amount',kind:'text',placeholder:'0.00'}),
          FormField({id:'finance-asOf',label:'As of',kind:'date'})
        ],{id:'finance-figure-fields'}),
        Notice('',{id:'finance-form-status',role:'status'}),
        ActionGroup([Button('Save figure',{id:'finance-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'finance-cancel',variant:'secondary'})])
      ],{id:'finance-form',className:'form-stack'})
    ],{id:'finance-editor'})
  ],{className:'finance-ledger'});
}

// One portfolio, its own total, and a line per asset class. The date sits with
// the figure it belongs to, because a portfolio whose cash was marked last week
// and whose stocks were marked last year is two different ages of information.
export function PortfolioGroup({name,meta,total,currency,rows}){
  return Section([
    Stack([GroupTitle(name,{className:'record-group-title'}),Strong(money(total,currency))],{className:'breakdown-row'}),
    meta?Note(meta):null,
    ...rows
  ],{className:'record-group'});
}

export function BreakdownList(title,rows,currency){
  return Stack([
    GroupTitle(title,{className:'record-group-title'}),
    ...(rows.length?rows.map(row=>Stack([Label(row.label),Strong(money(row.total,currency))],{className:'breakdown-row'})):[Note('Nothing recorded yet.')])
  ],{className:'breakdown-group'});
}

export function TrendTable(series,currency){
  if(series.length<2)return Note('Two dated figures needed.');
  const recent=series.slice(-12);
  const first=series[0],last=series.at(-1);
  const change=last.net-first.net;
  return Stack([
    Note(`${money(change,currency)} ${change<0?'lower':'higher'} than ${first.asOf}, across ${series.length} dated figure${series.length===1?'':'s'}.`),
    ...recent.map((point,index)=>{
      const previous=recent[index-1];
      const delta=previous?point.net-previous.net:null;
      return Stack([
        Label(point.asOf),
        Strong(money(point.net,currency)),
        Note(delta===null?`${point.figures} figure${point.figures===1?'':'s'}`:`${delta>=0?'+':''}${money(delta,currency)}`)
      ],{className:'trend-row'});
    })
  ],{className:'trend-table'});
}

// What the device pulled out of a file or a page, stated plainly before it is
// read. A poor extraction has to be visible here — the owner deciding "that is
// garbage, I will paste it instead" is the whole point of showing it.
export function AttachmentCard({label,detail,note,tone,onRemove}){
  const remove=Button('Remove',{variant:'subtle',size:'compact'});
  remove.addEventListener('click',onRemove);
  return Section([
    Stack([Strong(label),Text(detail,{className:'footnote'})]),
    note?Notice(note,{tone}):null,
    ActionGroup([remove],{compact:true})
  ],{className:'record-row'});
}
