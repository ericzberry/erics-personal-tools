import {RemindersView} from './components/reminders.js';
import {RecordRow,Button,RowAction,EDIT_GLYPH,DELETE_GLYPH,DONE_GLYPH,UNDO_GLYPH,Link,Note,Stack,ActionGroup,setStatus} from './components/ui.js';
import {cloudRequest} from './cloud-storage.js';
import {normalizeReminder,attentionSplit,reminderDue,duePhrase,dueDay,markedDone,canMarkDone,
  localDate,DEFAULT_NOTICE_DAYS,REMINDER_KINDS,REMINDER_EVENT_KINDS} from './reminder-data.js';
const fields=['kind','title','subject','date','every','since','notice','notes'];
// The anchor means something different for the two kinds of repeat, and the
// field says which rather than making the owner infer it.
const dateLabel=kind=>REMINDER_EVENT_KINDS.includes(kind)?'Date it falls on':'Last done';

// `remote` is the cloud itself rather than the offline wrapper: reading a
// calendar is an online-only action and has nothing to fall back on, which is
// why it lives in its own section instead of beside the saved records.
// `openExternal` is the host's ability to put Google's consent page in front of
// the owner; a host that cannot leaves the link beside the button.
export function mountReminders(root,{credentials,offline,remote=cloudRequest,
  openExternal=url=>globalThis.open(url,'_blank','noopener'),onSettings=()=>{},onChanged=()=>{},today=localDate}){
  root.replaceChildren(RemindersView());
  const $=id=>root.querySelector(`#reminders-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  let calendar=null,consentUrl='',scanning=false;
  const status=(text,tone='')=>setStatus($('status'),text,tone);
  // A reminder's own verbs, named for the reminder they would act on.
  const rowAction=(glyph,label,handler,danger=false)=>
    RowAction(glyph,label,handler,{danger,disabled:busy||!loaded});
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
    setStatus($('form-status'),'');
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
    const remove=rowAction(DELETE_GLYPH,`Delete ${record.title}`,()=>{confirmation.hidden=false;yes.focus();},true);
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep reminder',()=>{confirmation.hidden=true;remove.focus();});
    const confirmation=Stack([Note(`Permanently delete “${record.title}” from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const actions=[];
    // Only what applies to this row: a date that comes round on its own is
    // never marked done, and a finished one-off is reopened instead.
    if(record.completed&&!record.every)actions.push(rowAction(UNDO_GLYPH,`Reopen ${record.title}`,()=>save({...record,completed:''})));
    else if(canMarkDone(record))actions.push(rowAction(DONE_GLYPH,`${record.every?'Mark done today':'Mark done'}: ${record.title}`,()=>save(markedDone(record,today()))));
    actions.push(rowAction(EDIT_GLYPH,`Edit ${record.title}`,()=>edit(record)),remove);
    // A conflict is a question the row is asking, not a verb it carries: it
    // stays in words under the reminder until one of the two is chosen.
    const decide=record.conflict
      ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))),{compact:true})]
      :[];
    // Who it is about and the day it lands, and nothing else: how often it
    // repeats, which calendar it came out of and what year anybody turns are
    // true of half the list at once or belong to the record, not to a line
    // read down a list, and the notes are for the editor.
    const detail=[
      record.completed&&!record.every?`Completed ${dueDay(record.completed)}`:`${duePhrase(record)} · ${dueDay(record.due)}`,
      record.subject,
      record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''
    ].filter(Boolean).join(' · ');
    const entry=RecordRow({title:record.title,detail,actions,extra:[...decide,confirmation]});
    if(record.days!==null&&record.days<0)entry.classList.add('record-row--overdue');
    return entry;
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
      $('now').replaceChildren(Note('No reminders yet.'));
      $('now').closest('section').hidden=false;
    }
    for(const key of fields)$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;
    $('actions').replaceChildren(loaded?action('Refresh',refresh):action('Connection settings',onSettings,'secondary',{enabled:true}));
    renderCalendar();
  }

  // --- Birthdays already in the owner's calendar
  //
  // Only the action that applies, and never more than the two. No connection
  // at all needs a first consent; a connection that cannot read a calendar
  // needs the rest of one and says so. Neither is a failure, so neither is
  // toned: they are standing conditions, and the words carry them.
  function renderCalendar(){
    const section=$('calendar');
    section.hidden=!calendar;
    if(!calendar)return;
    const {google={},scan=null,everyDays=30}=calendar;
    const buttons=[];
    const calendarAction=(label,handler,variant='secondary')=>{
      const button=Button(label,{variant,size:'compact',disabled:scanning||busy});
      button.addEventListener('click',handler);
      return button;
    };
    if(!google.connected)buttons.push(calendarAction('Connect Google',connectGoogle));
    else if(!google.calendar)buttons.push(calendarAction('Approve reading your calendar',connectGoogle));
    else{
      buttons.push(calendarAction('Look for birthdays now',()=>scanCalendar()));
      // Forgetting what the last sweeps settled is the only way back to a
      // birthday that was imported and then deleted, so it is offered only
      // once there is something to forget, and quietly.
      if(scan)buttons.push(calendarAction('Look again from the start',()=>scanCalendar({restart:true}),'subtle'));
    }
    if(consentUrl)buttons.push(Link('Open Google consent',consentUrl,{className:'footnote'}));
    $('calendar-actions').replaceChildren(...buttons);
    if(scanning||consentUrl)return;
    // A sweep that has run says what it did and when. One that has not says
    // when it will, rather than nothing at all.
    if(google.connected&&google.calendar&&!scan)
      calendarStatus(`Nothing read yet. The app looks every ${everyDays} days, or now.`);
    else if(scan)calendarStatus(scanSentence(scan,everyDays),scan.short?'alert':'');
    else calendarStatus('');
  }
  const calendarStatus=(text,tone='')=>setStatus($('calendar-status'),text,tone);
  function scanSentence(scan,everyDays){
    const kept=[scan.added?`added ${scan.added}`:'',scan.matched?`${scan.matched} already written down`:'',
      scan.saved?`${scan.saved} already saved`:''].filter(Boolean).join(' · ');
    const found=scan.scanned?`${scan.scanned} birthday${scan.scanned===1?'':'s'} across ${scan.calendars} calendar${scan.calendars===1?'':'s'}`
      :'no birthdays';
    return `Last looked ${scan.ranOn} — ${found}${kept?`, ${kept}`:''}. Looks again within ${everyDays} days.`
      +(scan.short?' Some calendars were not read all the way through.':'');
  }
  // Read once the records are in, and not on a device that knows it has no
  // signal: the saved birthdays are the thing that has to work offline, not the
  // sweep. A host that does not say either way is treated as online, because a
  // refused request is a better answer than a section that never appears.
  async function refreshCalendar(){
    if(globalThis.navigator?.onLine===false)return;
    try{
      const token=await credentials.get();
      if(!token)return;
      calendar=await remote(token,'/v1/calendar/birthdays');
    }catch{calendar=null;}
    renderCalendar();
  }
  async function connectGoogle(){
    scanning=true;consentUrl='';calendarStatus('Asking Google…','progress');renderCalendar();
    try{
      const token=await credentials.get();
      const {url}=await remote(token,'/v1/drive/connect',{method:'POST',value:{}});
      // A blocked popup is not a failure: the link is kept beside the button so
      // the owner can open the same consent page themselves.
      consentUrl=openExternal(url)?'':url;
      scanning=false;renderCalendar();
      calendarStatus('Approve reading your calendar in Google, then look for birthdays.','alert');
    }catch(error){
      scanning=false;renderCalendar();
      calendarStatus(error?.message||'Google could not be reached.','error');
    }
  }
  async function scanCalendar({restart=false}={}){
    scanning=true;consentUrl='';renderCalendar();
    calendarStatus(restart?'Reading your whole calendar again…':'Looking for birthdays…','progress');
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      const result=await remote(token,'/v1/calendar/birthdays/scan',{method:'POST',value:{restart}});
      calendar=result;
      scanning=false;
      // The records themselves are the point, so the list is reloaded before
      // the sentence about them is shown — a count with nothing under it would
      // be asking to be taken on trust.
      if(result.scan?.added)await refresh();
      renderCalendar();
      calendarStatus(scanSentence(result.scan,result.everyDays),result.scan?.short?'alert':'success');
      if(result.scan?.added)onChanged();
    }catch(error){
      scanning=false;renderCalendar();
      calendarStatus(error?.message||'That did not finish.','error');
    }
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
      if(result?.records){records=result.records;loaded=true;status(result.syncMessage||'','alert');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      const text=error?.message||'That did not save.';
      status(text,'error');setStatus($('form-status'),text,'error');
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
    status('Loading reminders…','progress');
    await run(token=>offline.request(token,'/v1/reminders'));
  }
  function clear(){
    generation++;records=[];loaded=false;activeToken='';consentUrl='';scanning=false;clearForm();status('');render();
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
    }catch(error){setStatus($('form-status'),error?.message||'Check the reminder and try again.','error');}
  });
  clearForm();clear();
  refresh().then(refreshCalendar);
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear,capture:()=>$('capture'),scanCalendar};
}
