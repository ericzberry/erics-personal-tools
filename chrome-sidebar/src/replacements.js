import {ReplacementsView} from './components/replacements.js';
import {RecordRow,Button,RowAction,RowLink,EDIT_GLYPH,DELETE_GLYPH,COPY_GLYPH,OPEN_GLYPH,Note,Stack,ActionGroup,setStatus} from './components/ui.js';
import {normalizeReplacement,sortReplacements,replacementMatches,replacementSource} from './replacement-data.js';
const fields=['item','variant','where','note'];

export function mountReplacements(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{},clipboard=globalThis.navigator?.clipboard}){
  root.replaceChildren(ReplacementsView());
  const $=id=>root.querySelector(`#replacements-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  const status=(text,tone='')=>setStatus($('status'),text,tone);
  // A thing's own verbs, named for the thing they would act on.
  const rowAction=(glyph,label,handler,danger=false)=>
    RowAction(glyph,label,handler,{danger,disabled:busy||!loaded});
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  function clearForm(){
    editing=null;
    for(const key of fields)$(key).value='';
    $('editor-title').textContent='New thing';
    setStatus($('form-status'),'');
  }
  function edit(record){
    editing={id:record.id,revision:record.revision,record};
    for(const key of fields)$(key).value=record[key]??'';
    $('editor-title').textContent=`Editing ${record.item}`;
    $('editor').open=true;$('variant').focus();
  }
  // The variant is what gets pasted into a shop's search box, so it is the one
  // thing on the row worth a copy of its own.
  async function copy(record){
    if(!clipboard?.writeText){status('Copy is unavailable here. Select the variant instead.','alert');return;}
    try{await clipboard.writeText(record.variant);status(`Copied ${record.item}.`,'success');}
    catch{status('That did not copy. Select the variant instead.','error');}
  }
  function row(record){
    const {label:source,link}=replacementSource(record);
    const remove=rowAction(DELETE_GLYPH,`Delete ${record.item}`,()=>{confirmation.hidden=false;yes.focus();},true);
    const yes=action('Delete from all devices',()=>save(record,'DELETE'),'danger');
    const no=action('Keep it',()=>{confirmation.hidden=true;remove.focus();});
    const confirmation=Stack([Note(`Permanently delete “${record.item}” from all devices?`),ActionGroup([yes,no],{compact:true})],{className:'replacement-confirm',hidden:true});
    const actions=[rowAction(COPY_GLYPH,`Copy the variant of ${record.item}`,()=>copy(record))];
    if(link)actions.push(RowLink(OPEN_GLYPH,`Open where ${record.item} was bought`,link));
    actions.push(rowAction(EDIT_GLYPH,`Edit ${record.item}`,()=>edit(record)),remove);
    // A conflict is a question this record is asking, so it waits in words
    // under it rather than becoming another glyph on the line.
    const decide=record.conflict
      ?[ActionGroup(['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))),{compact:true})]
      :[];
    const sync=record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):'';
    const footnote=[source,record.note,sync].filter(Boolean).join(' · ');
    return RecordRow({title:record.item,notes:record.variant,actions,extra:[footnote?Note(footnote):null,...decide,confirmation]});
  }
  function render(){
    const query=$('search').value.trim();
    const matching=sortReplacements(records.filter(record=>replacementMatches(record,query)));
    $('list').replaceChildren(...(matching.length
      ?matching.map(row)
      :[Note(!loaded?'':records.length?'Nothing matches that.':'Nothing saved yet. Say one above, or add it below.')]));
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
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh the drawer before editing.');}
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
    const success=await run(token=>offline.request(token,`/v1/replacements/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading the drawer…','progress');
    await run(token=>offline.request(token,'/v1/replacements'));
  }
  function clear(){generation++;records=[];loaded=false;activeToken='';clearForm();status('');render();}
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const value=normalizeReplacement(Object.fromEntries(fields.map(key=>[key,$(key).value])),editing?.record||{});
      const id=editing?.id||crypto.randomUUID();
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){setStatus($('form-status'),error?.message||'Check the entry and try again.','error');}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  window.addEventListener('online',reload);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
