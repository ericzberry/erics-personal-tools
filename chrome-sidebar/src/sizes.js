import {SizesView,SizeGroup} from './components/sizes.js';
import {RecordRow,Button,Note,Stack,ActionGroup} from './components/ui.js';
import {normalizeSize,groupSizes} from './size-data.js';
const fields=['brand','item','size','fit'];

export function mountSizes(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{}}){
  root.replaceChildren(SizesView());
  const $=id=>root.querySelector(`#sizes-${id}`);
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
    $('editor-title').textContent='New size';
    $('form-status').textContent='';
  }
  function edit(record){
    editing={id:record.id,revision:record.revision,record};
    for(const key of fields)$(key).value=record[key]??'';
    $('editor-title').textContent=`Editing ${record.item}`;
    $('editor').open=true;$('item').focus();
  }
  function row(record){
    const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep size',()=>{confirmation.hidden=true;remove.focus();});
    const confirmation=Stack([Note(`Permanently delete “${record.item}” from all devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
    const actions=[action('Edit',()=>edit(record),'subtle'),remove];
    if(record.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))));
    const detail=[record.fit,record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
    return Stack([RecordRow({title:`${record.item} · ${record.size}`,detail,actions}),confirmation]);
  }
  function render(){
    const query=$('search').value.trim().toLowerCase();
    const matching=records.filter(record=>[record.brand,record.item,record.size,record.fit].join(' ').toLowerCase().includes(query));
    $('list').replaceChildren(...(matching.length
      ?groupSizes(matching).map(group=>SizeGroup(group.brand,group.records.map(row)))
      :[Note(!loaded?'':records.length?'No size matches that.':'No sizes yet. Say one above, or add it below.')]));
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
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your sizes before editing.');}
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
    const success=await run(token=>offline.request(token,`/v1/sizes/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading sizes…');
    await run(token=>offline.request(token,'/v1/sizes'));
  }
  function clear(){generation++;records=[];loaded=false;activeToken='';clearForm();status('');render();}
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const value=normalizeSize(Object.fromEntries(fields.map(key=>[key,$(key).value])),editing?.record||{});
      const id=editing?.id||crypto.randomUUID();
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){$('form-status').textContent=error?.message||'Check the size and try again.';}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
