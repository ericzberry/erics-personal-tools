import * as UI from './ui.js';
import {FINANCE_KINDS,LIQUIDITY} from '../finance-data.js';
import {ACCEPTED} from '../statement-text.js';
const {Stack,Section,GroupTitle,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,Strong,Label,Text,ToolTitle}=UI;

export function money(value,currency='USD'){
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:Math.abs(value)>=1000?0:2}).format(value);}
  catch{return `${value.toLocaleString('en-US',{maximumFractionDigits:2})} ${currency}`;}
}
export const Figure=({label,value,id,tone=''})=>Stack([Label(label,{className:'figure-label'}),Strong(value,{id,className:`figure-value${tone?` figure-value--${tone}`:''}`})],{className:'figure'});

export function FinanceView(){
  const kinds=FINANCE_KINDS.map(kind=>({text:`${kind.label}${kind.side==='liability'?' (liability)':''}`,value:kind.id}));
  return Stack([
    ToolTitle('Finance',{actionsId:'finance-actions',statusId:'finance-status'}),
    SettingsGroup({title:'Position',level:2,children:[
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
      ActionGroup([Button('Read the open page',{id:'finance-page',variant:'secondary',size:'compact'})],{compact:true}),
      Stack([],{id:'finance-attachment',hidden:true}),
      FormField({id:'finance-intake',label:'Notes',kind:'textarea',rows:3}),
      FormField({id:'finance-connection',label:'AI connection',kind:'select',options:[{text:'Choose a connection',value:''}]}),
      Note('',{id:'finance-ai-status',role:'status'}),
      ActionGroup([Button('Read this',{id:'finance-read',variant:'primary',size:'compact'}),Button('Clear',{id:'finance-intake-clear',variant:'secondary',size:'compact'})],{compact:true}),
      Notice('',{id:'finance-intake-status',role:'status'}),
      Stack([],{id:'finance-drafts'})
    ]}),
    SettingsGroup({title:'Accounts & assets',level:2,children:[
      FormField({id:'finance-search',label:'Find a record',kind:'search',placeholder:'Name, institution, owner, tag…'}),
      Stack([],{id:'finance-list',className:'travel-list'})
    ]}),
    Disclosure('Add or edit a record',[
      Form([
        Strong('New record',{id:'finance-editor-title'}),
        FormField({id:'finance-kind',label:'Type',kind:'select',options:kinds}),
        FormField({id:'finance-name',label:'Record name',kind:'text',placeholder:'e.g. Schwab brokerage'}),
        FormField({id:'finance-institution',label:'Institution (optional)',kind:'text',placeholder:'e.g. Charles Schwab'}),
        FormField({id:'finance-owner',label:'Owner (optional)',kind:'text',placeholder:'A person, trust, or entity'}),
        FormField({id:'finance-value',label:'Current value',kind:'text',placeholder:'0.00'}),
        FormField({id:'finance-asOf',label:'As of',kind:'date'}),
        Disclosure('More detail',[
          FormField({id:'finance-currency',label:'Currency',kind:'text',placeholder:'USD'}),
          FormField({id:'finance-ownership',label:'Your ownership share (%)',kind:'text',placeholder:'100'}),
          FormField({id:'finance-liquidity',label:'Liquidity',kind:'select',options:LIQUIDITY.map(text=>({text,value:text}))}),
          FormField({id:'finance-rate',label:'Rate (% — yield or interest, optional)',kind:'text'}),
          FormField({id:'finance-commitment',label:'Total commitment (optional)',kind:'text'}),
          FormField({id:'finance-unfunded',label:'Unfunded commitment (optional)',kind:'text'}),
          FormField({id:'finance-tags',label:'Tags (optional)',kind:'text',placeholder:'Comma separated'}),
          FormField({id:'finance-notes',label:'Notes (optional)',kind:'textarea',rows:3}),
          UI.ProtectedField({id:'finance-secret',label:'Account details (optional)',
            numberLabel:'Account or reference number',expiryLabel:'Short hint for the list (e.g. ends 4321)'})
        ],{id:'finance-advanced'}),
        Notice('',{id:'finance-form-status',role:'status'}),
        ActionGroup([Button('Save record',{id:'finance-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'finance-cancel',variant:'secondary'})])
      ],{id:'finance-form',className:'form-stack'})
    ],{id:'finance-editor'})
  ],{className:'finance-ledger'});
}

export function FinanceGroup(label,side,rows){
  return Section([GroupTitle(`${label}${side==='liability'?' · liability':''}`,{className:'record-group-title'}),...rows],{className:'record-group'});
}

export function BreakdownList(title,rows,currency){
  return Stack([
    GroupTitle(title,{className:'record-group-title'}),
    ...(rows.length?rows.map(row=>Stack([Label(row.label),Strong(money(row.total,currency))],{className:'breakdown-row'})):[Note('Nothing recorded yet.')])
  ],{className:'breakdown-group'});
}

export function TrendTable(series,currency){
  if(series.length<2)return Note('Two dated values are needed before a trend can be shown. Each save files a snapshot under its as-of date.');
  const recent=series.slice(-12);
  const first=series[0],last=series.at(-1);
  const change=last.net-first.net;
  return Stack([
    Note(`${money(change,currency)} ${change<0?'lower':'higher'} than ${first.asOf}, across ${series.length} dated snapshot${series.length===1?'':'s'}.`),
    ...recent.map((point,index)=>{
      const previous=recent[index-1];
      const delta=previous?point.net-previous.net:null;
      return Stack([
        Label(point.asOf),
        Strong(money(point.net,currency)),
        Note(delta===null?`${point.records} record${point.records===1?'':'s'}`:`${delta>=0?'+':''}${money(delta,currency)}`)
      ],{className:'trend-row'});
    })
  ],{className:'trend-table'});
}

// A draft is a proposal, never a saved figure: it names the record it would
// change, or says it would create one, and does nothing until it is applied.
export function DraftRow(draft,{onApply,onDiscard,onEdit}){
  const target=draft.match?`Updates ${draft.match.name}`:draft.ambiguous?'Several records match this name — open the ledger and edit the right one':'Creates a new record';
  const apply=Button(draft.ambiguous?'Add as new record':draft.match?'Apply update':'Create record',{variant:'primary',size:'compact'});
  const discard=Button('Discard',{variant:'secondary',size:'compact'});
  const edit=Button('Edit before saving',{variant:'subtle',size:'compact'});
  apply.addEventListener('click',onApply);discard.addEventListener('click',onDiscard);edit.addEventListener('click',onEdit);
  return Section([
    Strong(`${draft.name} · ${money(draft.value,draft.currency)}`),
    Note([target,`As of ${draft.asOf}`,`${draft.confidence} confidence`].join(' · ')),
    draft.reason?Text(draft.reason,{className:'footnote'}):null,
    ActionGroup([apply,edit,discard],{compact:true})
  ],{className:'record-row'});
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
