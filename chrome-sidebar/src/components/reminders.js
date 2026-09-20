import * as UI from './ui.js';
import {REMINDER_KINDS,REMINDER_INTERVALS,DEFAULT_NOTICE_DAYS,MAX_NOTICE_DAYS} from '../reminder-data.js';
const {Stack,Note,Notice,Button,ActionGroup,Disclosure,SettingsGroup,FormField,Form,GroupTitle,Section,ToolTitle,Strong}=UI;
export function RemindersView(){
  return Stack([
    ToolTitle('Reminders',{actionsId:'reminders-actions',statusId:'reminders-status'}),
    Stack([],{id:'reminders-capture'}),
    SettingsGroup({title:'Needs attention',level:2,children:[Stack([],{id:'reminders-now',className:'travel-list'})]}),
    SettingsGroup({title:'Coming up',level:2,children:[Stack([],{id:'reminders-later',className:'travel-list'})]}),
    SettingsGroup({title:'Completed',level:2,children:[Stack([],{id:'reminders-done',className:'travel-list'})]}),
    // Last, and hidden until the Worker has said whether there is a calendar to
    // read at all: this is where birthdays come from, not what the tool is for,
    // and an empty section explaining a connection nobody has made is noise.
    SettingsGroup({title:'From your calendar',level:2,children:[
      Note('Checked once a month. Birthdays already here are left alone.'),
      Notice('',{id:'reminders-calendar-status',role:'status'}),
      Stack([],{id:'reminders-calendar-actions',className:'action-group'})
    ],id:'reminders-calendar',hidden:true}),
    Disclosure('Add or edit a reminder',[
      Form([
        Strong('New reminder',{id:'reminders-editor-title'}),
        FormField({id:'reminders-kind',label:'Kind',kind:'select',options:REMINDER_KINDS.map(text=>({text,value:text}))}),
        FormField({id:'reminders-title',label:'What it is',kind:'text',placeholder:'e.g. Oil change'}),
        FormField({id:'reminders-subject',label:'Who or what it is for (optional)',kind:'text',placeholder:'e.g. Outback'}),
        FormField({id:'reminders-date',label:'Last done',kind:'date'}),
        FormField({id:'reminders-every',label:'Repeats',kind:'select',options:REMINDER_INTERVALS.map(interval=>({text:interval.label,value:String(interval.months)}))}),
        FormField({id:'reminders-since',label:'Starting year (optional)',kind:'text',placeholder:'e.g. 1985'}),
        FormField({id:'reminders-notice',label:`Days of advance notice (${DEFAULT_NOTICE_DAYS} by default)`,kind:'number'}),
        FormField({id:'reminders-notes',label:'Notes (optional)',kind:'textarea',rows:3}),
        Notice('',{id:'reminders-form-status',role:'status'}),
        ActionGroup([Button('Save reminder',{id:'reminders-save',variant:'primary',type:'submit'}),Button('Cancel edit',{id:'reminders-cancel',variant:'secondary'})])
      ],{id:'reminders-form',className:'form-stack'})
    ],{id:'reminders-editor'})
  ],{className:'travel-wallet reminder-list'});
}
export function ReminderGroup(title,rows){
  return Section([GroupTitle(title,{className:'record-group-title'}),...rows],{className:'record-group'});
}
export const NOTICE_LIMIT=MAX_NOTICE_DAYS;
