import {RemindersView} from './components/reminders.js';
import {RecordRow,Button,Note,Stack,ActionGroup} from './components/ui.js';
import {normalizeReminder,attentionSplit,reminderDue,reminderAge,duePhrase,intervalLabel,markedDone,canMarkDone,
  localDate,DEFAULT_NOTICE_DAYS,REMINDER_KINDS,REMINDER_EVENT_KINDS} from './reminder-data.js';
const fields=['kind','title','subject','date','every','since','notice','notes'];
// The anchor means something different for the two kinds of repeat, and the
// field says which rather than making the owner infer it.
const dateLabel=kind=>REMINDER_EVENT_KINDS.includes(kind)?'Date it falls on':'Last done';

export function mountReminders(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{},today=localDate}){
  root.replaceChildren(RemindersView());
  const $=id=>root.querySelector(`#reminders-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  const status=text=>{$('status').textContent=text||'';};
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  function clearForm(){
    editing=null;
    $('kind').value=REMINDER_KINDS[0];
    for(const key of ['title','subject','date','since','notes'])$(key).value='';
    $('every').value='12';
    $('notice').value=String(DEFAULT_NOTICE_DAYS);
    $('editor-title').textContent='New reminder';
    $('form-status').textContent='';
    syncDateLabel();
  }
  function syncDateLabel(){
    const label=root.querySelector('label[for="reminders-date"]');
    if(label)label.textContent=dateLabel($('kind').value);
  }
  function edit(record){
    editing={id:record.id,revision:record.revision};
    for(const key of fields)$(key).value=record[key]??'';
    $('every').value=String(record.every??0);
    $('notice').value=String(record.notice??DEFAULT_NOTICE_DAYS);
    $('editor-title').textContent=`Editing ${record.title}`;
    syncDateLabel();
    $('editor').open=true;$('title').focus();
  }
  function row(record){
    const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep reminder',()=>{confirmation.hidden=true;remove.focus();});
    const confirmation=Stack([Note(`Permanently delete “${record.title}” from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const age=reminderAge(record);
    const actions=[];
    // Only what applies to this row: a date that comes round on its own is
    // never marked done, and a finished one-off is reopened instead.
    if(record.completed&&!record.every)actions.push(action('Reopen',()=>save({...record,completed:''})));
    else if(canMarkDone(record))actions.push(action(record.every?'Mark done today':'Mark done',()=>save(markedDone(record,today())),'secondary'));
    actions.push(action('Edit',()=>edit(record),'subtle'),remove);
    if(record.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))));
    const detail=[
      record.completed&&!record.every?`Completed ${record.completed}`:`${duePhrase(record)} · ${record.due}`,
      record.subject,
      age?`turns ${age}`:'',
      record.every?intervalLabel(record.every):'',
      record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''
    ].filter(Boolean).join(' · ');
    const entry=RecordRow({title:record.title,detail,notes:record.notes,actions});
    if(record.days!==null&&record.days<0)entry.classList.add('record-row--overdue');
    return Stack([entry,confirmation]);
  }
  function render(){
    const {now,later}=attentionSplit(records,{today:today()});
    const done=records.filter(record=>record.completed&&!record.every).map(record=>reminderDue(record,today()));
    // A section with nothing in it says nothing. Only an empty tool explains
    // itself, and only once.
    for(const [id,list] of [['now',now],['later',later],['done',done]]){
      $(id).replaceChildren(...list.map(row));
      $(id).closest('section').hidden=!list.length;
    }
    // With nothing saved, a heading reading "Needs attention" over an empty
    // list is noise, and repeating the connection message the status line
    // already carries is noise twice.
    const heading=$('now').closest('section').querySelector('.settings-group-title');
    if(heading)heading.hidden=!records.length;
    if(!records.length&&loaded){
      $('now').replaceChildren(Note('No reminders yet. Add one above.'));
      $('now').closest('section').hidden=false;
    }
    for(const key of fields)$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    $('actions').replaceChildren(loaded?action('Refresh',refresh):action('Connection settings',onSettings,'secondary',{enabled:true}));
  }
  async function run(operation){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your reminders before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      const text=error?.message||'That did not save.';
      status(text);$('form-status').textContent=text;
      return false;
    }finally{busy=false;render();}
  }
  async function save(record,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/reminders/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading reminders…');
    await run(token=>offline.request(token,'/v1/reminders'));
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';clearForm();status('');render();
  }
  $('kind').addEventListener('change',syncDateLabel);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const input=Object.fromEntries(fields.map(key=>[key,$(key).value]));
      const value=normalizeReminder({...input,every:Number(input.every),notice:Number(input.notice||DEFAULT_NOTICE_DAYS)});
      const id=editing?.id||crypto.randomUUID();
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){$('form-status').textContent=error?.message||'Check the reminder and try again.';}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,capture:()=>$('capture')};
}
