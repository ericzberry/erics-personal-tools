import {GiftsView,GiftGroup} from './components/gifts.js';
import {RecordRow,Button,Note,Stack,ActionGroup,Link} from './components/ui.js';
import {normalizeGift,groupGifts,isBought,bought,unbought} from './gift-data.js';
const fields=['person','idea','link'];

export function mountGifts(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{}}){
  root.replaceChildren(GiftsView());
  const $=id=>root.querySelector(`#gifts-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  const status=text=>{$('status').textContent=text||'';};
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  function clearForm(){
    editing=null;
    for(const key of fields)$(key).value='';
    $('editor-title').textContent='New idea';
    $('form-status').textContent='';
  }
  function edit(record){
    editing={id:record.id,revision:record.revision,record};
    for(const key of fields)$(key).value=record[key]??'';
    $('editor-title').textContent=`Editing ${record.idea}`;
    $('editor').open=true;$('idea').focus();
  }
  function row(record){
    const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep idea',()=>{confirmation.hidden=true;remove.focus();});
    const confirmation=Stack([Note(`Permanently delete “${record.idea}” from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const actions=[action(isBought(record)?'Back to ideas':'Bought',()=>save(isBought(record)?unbought(record):bought(record)))];
    if(record.link)actions.push(Link('Open',record.link));
    actions.push(action('Edit',()=>edit(record),'subtle'),remove);
    if(record.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))));
    const detail=record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):'';
    return Stack([RecordRow({title:record.idea,detail,actions}),confirmation]);
  }
  function render(){
    const query=$('search').value.trim().toLowerCase();
    const matching=records.filter(record=>[record.person,record.idea].join(' ').toLowerCase().includes(query));
    const open=matching.filter(record=>!isBought(record)),done=matching.filter(isBought);
    $('list').replaceChildren(...(open.length
      ?groupGifts(open).map(group=>GiftGroup(group.person,group.records.map(row)))
      :[Note(!loaded?'':records.length?'Nothing left to decide here.':'No ideas yet. Add one above.')]));
    $('bought').replaceChildren(...groupGifts(done).map(group=>GiftGroup(group.person,group.records.map(row))));
    $('bought-view').hidden=!done.length;
    $('bought-view').querySelector('summary').textContent=`Bought · ${done.length}`;
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
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your ideas before editing.');}
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
    const success=await run(token=>offline.request(token,`/v1/gifts/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading ideas…');
    await run(token=>offline.request(token,'/v1/gifts'));
  }
  function clear(){generation++;records=[];loaded=false;activeToken='';clearForm();status('');render();}
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const value=normalizeGift(Object.fromEntries(fields.map(key=>[key,$(key).value])),editing?.record||{});
      const id=editing?.id||crypto.randomUUID();
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){$('form-status').textContent=error?.message||'Check the idea and try again.';}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
