import * as UI from './ui.js';
import {HEALTH_TYPES,MEDICATION_STATUSES,CONDITION_STATUSES,FAMILY_SIDES,SUMMARY_CHOICES} from '../health-data.js';
const {Stack,Section,Note,Notice,Button,ActionGroup,Disclosure,FormField,FindField,Form,GroupTitle,ToolTitle,Strong,Label,Text,Tabs}=UI;
const choices=list=>list.map(text=>({text,value:text}));

// The notebook. One search over everything, three views one at a time, and
// the editor: a note, and nothing else required. Type and When are offered,
// not asked; what else a type can carry waits behind Details.
export function HealthView(){
  return Stack([
    ToolTitle('Health',{actionsId:'health-actions',statusId:'health-status'}),
    FindField({id:'health-search',label:'Search health',placeholder:'Note, medication, relative…'}),
    // While a search is active this is the one list on the screen.
    Stack([],{id:'health-results',className:'travel-list',hidden:true}),
    Tabs({id:'health-tabs',label:'Health',items:[
      {key:'summary',label:'Summary',content:[Stack([],{id:'health-summary',className:'travel-list'})]},
      {key:'history',label:'History',hidden:true,content:[
        FormField({id:'health-filter',label:'Type',kind:'select',options:[{text:'All types',value:''},...choices(HEALTH_TYPES)]}),
        Stack([],{id:'health-history',className:'travel-list'})]},
      {key:'family',label:'Family',hidden:true,content:[Stack([],{id:'health-family',className:'travel-list'})]}
    ]}),
    // A note that was being written when the section locked, offered back.
    Stack([],{id:'health-draft'}),
    Disclosure('Add record',[
      Form([
        Strong('New record',{id:'health-editor-title'}),
        FormField({id:'health-note',label:'Note',kind:'textarea',rows:3}),
        FormField({id:'health-type',label:'Type',kind:'select',options:choices(HEALTH_TYPES)}),
        FormField({id:'health-when',label:'When (optional)',kind:'text',placeholder:'2012 · around 2012 · 2012-03 · age 8'}),
        Disclosure('Details',[
          FormField({id:'health-directions',label:'Directions',kind:'text',placeholder:'10 mg each morning · as needed'}),
          FormField({id:'health-medication-status',label:'Status',kind:'select',options:choices(MEDICATION_STATUSES)}),
          FormField({id:'health-condition-status',label:'Status',kind:'select',options:choices(CONDITION_STATUSES)}),
          FormField({id:'health-side',label:'Family side',kind:'select',options:choices(FAMILY_SIDES)}),
          Note('',{id:'health-side-note'}),
          FormField({id:'health-summary-choice',label:'In the summary',kind:'select',options:SUMMARY_CHOICES})
        ],{id:'health-details',className:'health-details'}),
        // Where the note will be filed, said beside the save and changed by
        // one control. Nothing is shown here until the destination is known.
        Stack([Label('',{id:'health-destination-where',className:'health-destination-label'}),Button('Change',{id:'health-destination-change',variant:'subtle',size:'compact'})],{id:'health-destination-line',className:'health-destination'}),
        Stack([
          FormField({id:'health-destination',label:'Who this is about',kind:'select',options:[{text:'Me',value:''}]}),
          FormField({id:'health-relative-label',label:'Relative',kind:'text',placeholder:'Dad · Aunt Mary · maternal grandmother'})
        ],{id:'health-destination-fields',hidden:true}),
        Notice('',{id:'health-form-status',role:'status'}),
        ActionGroup([Button('Save',{id:'health-save',variant:'primary',type:'submit'}),Button('Cancel',{id:'health-cancel',variant:'secondary'}),Button('Undo',{id:'health-undo',variant:'subtle',hidden:true})])
      ],{id:'health-form',className:'form-stack'})
    ],{id:'health-editor'}),
    // The visit summary preview, and the change editor a medication opens.
    Stack([],{id:'health-export',hidden:true})
  ],{className:'health-notebook'});
}

// A run of records under the label that groups them, with the group's own
// verbs at the end of its heading line.
export function HealthGroup(title,rows,{actions=[],name=false,extra=[]}={}){
  const heading=GroupTitle(title,{className:`record-group-title${name?' group-title--name':''}`});
  return Section([
    actions.length?Stack([heading,ActionGroup(actions,{compact:true})],{className:'settings-group-head health-group-head'}):heading,
    ...extra,...rows
  ],{className:'record-group'});
}

// One record: the first line the owner wrote, a short line under it, and the
// whole note with its verbs once it is opened.
export function HealthRow({title,subtitle,note,detail,actions=[],words=[],lines=[],extra=[],onToggle}){
  const body=Stack([Text(note,{className:'health-note'}),ActionGroup(actions,{compact:true,className:'action-group action-group--compact record-actions'})],{className:'record-line health-note-line'});
  const children=[body,...(detail?[Note(detail)]:[]),...lines.map(line=>Note(line)),
    ...(words.length?[ActionGroup(words,{compact:true})]:[]),...extra.filter(Boolean)];
  return UI.ExpandableRecord({title,subtitle,children,onToggle});
}

// The fields a medication change asks for: the new directions where the change
// is one, and when it took effect — optional, and kept as typed.
export function ChangeEditor({id,directions=true}){
  return Form([
    ...(directions?[FormField({id:`${id}-to`,label:'Directions',kind:'text'})]:[]),
    FormField({id:`${id}-effective`,label:'Effective (optional)',kind:'text',placeholder:'2026-09-01 · September'}),
    Notice('',{id:`${id}-status`,role:'status'}),
    ActionGroup([Button('Save change',{id:`${id}-save`,variant:'primary',size:'compact',type:'submit'}),Button('Cancel',{id:`${id}-cancel`,variant:'secondary',size:'compact'}),
      // Asked only when the change is dated before one already recorded.
      Button('It is current',{id:`${id}-current`,variant:'secondary',size:'compact',hidden:true}),Button('History only',{id:`${id}-history`,variant:'secondary',size:'compact',hidden:true})])
  ],{id,className:'form-stack health-change'});
}

// Renaming a relative, saying which side of the family they are on, and the
// other names a note may call them by.
export function RelativeEditor({id}){
  return Form([
    FormField({id:`${id}-label`,label:'Relative',kind:'text'}),
    FormField({id:`${id}-side`,label:'Family side',kind:'select',options:choices(FAMILY_SIDES)}),
    FormField({id:`${id}-aliases`,label:'Also called (optional, comma-separated)',kind:'text',placeholder:'Father, Papa'}),
    Notice('',{id:`${id}-status`,role:'status'}),
    ActionGroup([Button('Save',{id:`${id}-save`,variant:'primary',size:'compact',type:'submit'}),Button('Cancel',{id:`${id}-cancel`,variant:'secondary',size:'compact'})])
  ],{id,className:'form-stack health-relative-editor'});
}

// What leaves the vault, chosen record by record, with the one thing worth
// saying before it does.
export function ExportPreview({id,groups,labels,warning}){
  return Section([
    Stack([GroupTitle('Visit summary',{className:'record-group-title'}),ActionGroup([Button('Close',{id:`${id}-close`,variant:'subtle',size:'compact'})],{compact:true})],{className:'settings-group-head health-group-head'}),
    ...groups.map(group=>Section([Strong(group.title,{className:'health-export-heading'}),...group.rows],{className:'health-export-group'})),
    ...(labels.length?[Section([Strong('Relatives are named as',{className:'health-export-heading'}),...labels],{className:'health-export-group'})]:[]),
    Stack([],{id:`${id}-lines`,className:'health-export-lines'}),
    Notice(warning,{id:`${id}-warning`,role:'status'}),
    Notice('',{id:`${id}-status`,role:'status'}),
    ActionGroup([Button('Export PDF',{id:`${id}-save`,variant:'primary',size:'compact'})])
  ],{id,className:'health-export'});
}

// A record offered for the summary: its first line and where it sits.
export function ExportChoice({title,detail,checked,onChange}){
  return UI.ChoiceRow({title,description:detail,checked,onChange});
}
