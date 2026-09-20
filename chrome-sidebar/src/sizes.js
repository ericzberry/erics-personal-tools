import {SizesView,SizeGroup,SizeRow} from './components/sizes.js';
import {Button,IconButton,EDIT_GLYPH,DELETE_GLYPH,Note,Stack,ActionGroup,setStatus} from './components/ui.js';
import {normalizeSize,groupSizes,classifySize,sizeParts,brandNames} from './size-data.js';
const fields=['brand','item','size','fit'];

export function mountSizes(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{}}){
  root.replaceChildren(SizesView());
  const $=id=>root.querySelector(`#sizes-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  const status=(text,tone='')=>setStatus($('status'),text,tone);
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  // A row's own action. The glyph is the verb and the label is what a screen
  // reader and a paused pointer are told, so it names the size it would act on
  // rather than saying "Edit" twelve times down the list.
  const rowAction=(glyph,label,handler,className='')=>{
    const button=IconButton(glyph,label,{className:`size-action ${className}`.trim(),disabled:busy||!loaded});
    button.addEventListener('click',handler);
    return button;
  };
  function clearForm(){
    editing=null;
    for(const key of fields)$(key).value='';
    $('editor-title').textContent='New size';
    setStatus($('form-status'),'');
  }
  function edit(record){
    editing={id:record.id,revision:record.revision,record};
    for(const key of fields)$(key).value=record[key]??'';
    $('editor-title').textContent=`Editing ${record.item}`;
    $('editor').open=true;$('item').focus();
  }
  function row(record,names){
    const {name,size}=sizeParts(record,names);
    const line=[name,size].filter(Boolean).join(' · ');
    const remove=rowAction(DELETE_GLYPH,`Delete ${line}`,()=>{confirmation.hidden=false;yes.focus();},'size-action--danger');
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep size',()=>{confirmation.hidden=true;remove.focus();});
    // The question names the row as the list reads it, not the word the record
    // happens to be stored under: “Loro Piana · S”, not “Sweaters”.
    const confirmation=Stack([Note(`Permanently delete “${line}” from all devices?`),ActionGroup([yes,no],{compact:true})],{className:'size-confirm',hidden:true});
    const actions=[rowAction(EDIT_GLYPH,`Edit ${line}`,()=>edit(record)),remove];
    // A conflict is not a quiet row action: it is a question, and it stays in
    // words under the line until it is answered.
    const extra=record.conflict
      ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))),{compact:true})]
      :[];
    const note=[record.fit,record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):''].filter(Boolean).join(' · ');
    return SizeRow({name,size,note,actions,extra,confirmation});
  }
  function render(){
    const query=$('search').value.trim().toLowerCase();
    const names=brandNames(records);
    // The garment is searchable although it is never typed: a neck is found by
    // looking for a shirt, which is how the question usually arrives.
    const matching=records.filter(record=>[record.brand,record.item,record.size,record.fit,classifySize(record).garment].join(' ').toLowerCase().includes(query));
    $('list').replaceChildren(...(matching.length
      ?groupSizes(matching).map(group=>SizeGroup(group.garment,group.records.map(record=>row(record,names))))
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
    const success=await run(token=>offline.request(token,`/v1/sizes/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading sizes…','progress');
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
    }catch(error){setStatus($('form-status'),error?.message||'Check the size and try again.','error');}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
