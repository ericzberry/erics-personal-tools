import {PropertiesView,PropertyGroup} from './components/properties.js';
import {RecordRow,Button,Link,Note} from './components/ui.js';
import {normalizeProperty,groupProperties,isPassed,nextStatus,withPrice,describeProperty,priceChange,money,PROPERTY_STATUSES} from './property-data.js';
import {samePage} from './public-url.js';
import {localDate} from './reminder-data.js';
const fields=['address','price','beds','baths','sqft','taxes','hoa','link','notes'];
// What a reading of the page may change on a property already saved. Status,
// notes and the day it was saved are the owner's; a figure the page no longer
// shows is left as it was rather than erased.
const FACTS=['address','beds','baths','sqft','taxes','hoa'];

// `readPage` is the host's ability to read the tab beside it. Only the sidebar
// has one, so only the sidebar offers to keep the listing that is open.
export function mountProperties(root,{credentials,offline,remote=null,readPage=null,today=localDate,onSettings=()=>{},onChanged=()=>{},timeoutMs=90000}){
  root.replaceChildren(PropertiesView());
  const $=id=>root.querySelector(`#properties-${id}`);
  let records=[],editing=null,busy=false,loaded=false,activeToken='',generation=0,connection='',page={url:'',listing:null};
  const status=text=>{$('status').textContent=text||'';};
  const action=(label,handler,variant='secondary',{enabled=false}={})=>{
    const button=Button(label,{variant,size:'compact',disabled:busy||(!loaded&&!enabled)});
    button.addEventListener('click',handler);
    return button;
  };
  const savedFor=url=>url?records.find(record=>record.link&&samePage(record.link,url))||null:null;
  function clearForm(){
    editing=null;
    for(const key of fields)$(key).value='';
    $('status-field').value=PROPERTY_STATUSES[0];
    $('editor-title').textContent='New property';
    $('form-status').textContent='';
    $('delete').hidden=true;$('delete-confirmation').hidden=true;
  }
  function edit(record){
    editing={id:record.id,revision:record.revision,record};
    for(const key of fields)$(key).value=record[key]??'';
    $('status-field').value=record.status;
    $('editor-title').textContent=`Editing ${record.address}`;
    $('delete').hidden=false;$('delete-confirmation').hidden=true;
    $('editor').open=true;$('address').focus();
  }
  function row(record){
    const actions=[];
    const next=nextStatus(record.status);
    if(next)actions.push(action(next,()=>save({...record,status:next})));
    actions.push(action(isPassed(record)?'Back to shortlist':'Pass',()=>save({...record,status:isPassed(record)?'Looking':'Passed'}),isPassed(record)?'secondary':'subtle'));
    if(record.link)actions.push(Link('Open',record.link));
    actions.push(action('Edit',()=>edit(record),'subtle'));
    if(record.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(record.id,choice))));
    const sync=record.pending?(record.conflict?'Conflict':record.deleting?'Pending deletion':'Waiting to sync'):'';
    return RecordRow({title:record.address,detail:[describeProperty(record),sync].filter(Boolean).join(' · '),notes:record.notes,actions});
  }
  // The one action that belongs to the page beside the panel: keep this
  // listing, or bring the saved one up to date with it.
  function renderPage(){
    const saved=savedFor(page.url);
    const offer=readPage&&(saved||page.listing);
    $('page').hidden=!offer;
    $('page').replaceChildren(...(offer?[action(saved?'Update from this page':'Save this listing',()=>saveListing(),saved?'secondary':'primary')]:[]));
  }
  function render(){
    const query=$('search').value.trim().toLowerCase();
    const matching=records.filter(record=>[record.address,record.notes].join(' ').toLowerCase().includes(query));
    const open=matching.filter(record=>!isPassed(record)),passed=matching.filter(isPassed);
    $('list').replaceChildren(...(open.length
      ?groupProperties(open).map(group=>PropertyGroup(group.status,group.records.map(row)))
      :[Note(!loaded?'':records.length?'Nothing on the shortlist.':'No properties yet.')]));
    $('passed').replaceChildren(...groupProperties(passed).map(group=>PropertyGroup(group.status,group.records.map(row))));
    $('passed-view').hidden=!passed.length;
    $('passed-view').querySelector('summary').textContent=`Passed · ${passed.length}`;
    for(const key of [...fields,'status-field'])$(key).disabled=busy||!loaded;
    $('save').disabled=busy||!loaded;$('cancel').disabled=busy;$('delete').disabled=busy;
    $('actions').replaceChildren(loaded?action('Refresh',refresh):action('Connection settings',onSettings,'secondary',{enabled:true}));
    renderPage();
  }
  async function run(operation){
    if(busy)return false;
    busy=true;const current=++generation;render();
    try{
      const token=await credentials.get();
      if(!token)throw Error('Open Settings to connect this device.');
      if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh your properties before editing.');}
      activeToken=token;
      const result=await operation(token);
      if(current!==generation)return false;
      if(result?.records){records=result.records;loaded=true;if(!result.keepStatus)status(result.syncMessage||'');}
      return true;
    }catch(error){
      if(current!==generation)return false;
      const text=error?.message||'That did not save.';
      status(text);$('form-status').textContent=text;
      return false;
    }finally{busy=false;render();}
  }
  async function save(record,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/properties/${record.id}`,{method,value:record}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){
    status('Loading properties…');
    await run(token=>offline.request(token,'/v1/properties'));
  }
  // Whichever saved connection can answer, remembered for the session, exactly
  // as quick add chooses one: reading a listing never asks which model.
  async function connectionId(token){
    if(connection)return connection;
    const result=await remote(token,'/v1/ai-connections');
    const usable=(result.connections||[]).filter(entry=>entry.hasApiKey);
    if(!usable.length)throw Error('Save an AI connection in Settings to read listings.');
    return connection=usable[0].id;
  }
  async function saveListing(){
    if(!readPage||!remote)return false;
    status('Reading the listing…');
    let line='';
    const success=await run(async token=>{
      const open=await readPage();
      const id=await connectionId(token);
      const day=today();
      const {record:read}=await remote(token,`/v1/ai-connections/${id}/listing`,{method:'POST',value:{text:open.text,url:open.url||page.url,today:day},timeoutMs});
      // The same house on a second site is still the same house.
      const address=read.address.toLowerCase();
      const existing=savedFor(open.url||page.url)||records.find(record=>record.address.toLowerCase()===address)||null;
      let value;
      if(existing){
        const facts=Object.fromEntries(FACTS.filter(key=>read[key]!==null&&read[key]!=='').map(key=>[key,read[key]]));
        value=withPrice({...existing,...facts,link:existing.link||read.link},read.price,day);
      }else value=read;
      const recordId=existing?.id||crypto.randomUUID();
      const result=await offline.request(token,`/v1/properties/${recordId}`,{method:'PUT',value:{...value,id:recordId,revision:existing?.revision??null}});
      // The line read back is built from what was stored, not from the reading.
      const stored=result.record||value;
      const moved=existing&&stored.price!==existing.price?priceChange({prices:[{price:existing.price}],price:stored.price}):0;
      line=existing
        ?(moved?`Updated · price ${moved<0?'down':'up'} ${money(Math.abs(moved))}`:'Up to date')
        :`Saved · ${[stored.address,describeProperty(stored)].filter(Boolean).join(' · ')}`;
      return {...result,keepStatus:true};
    });
    if(success){status(line);onChanged();}
    return success;
  }
  function clear(){generation++;records=[];loaded=false;activeToken='';connection='';clearForm();status('');render();}
  $('search').addEventListener('input',render);
  $('cancel').addEventListener('click',()=>{clearForm();$('editor').open=false;});
  $('delete').addEventListener('click',()=>{
    if(!editing)return;
    $('delete-question').textContent=`Permanently delete ${editing.record.address} from all devices?`;
    $('delete-confirmation').hidden=false;$('delete-confirm').focus();
  });
  $('delete-keep').addEventListener('click',()=>{$('delete-confirmation').hidden=true;$('delete').focus();});
  $('delete-confirm').addEventListener('click',async()=>{
    if(!editing)return;
    if(await save({...editing.record,id:editing.id,revision:editing.revision},'DELETE')){clearForm();$('editor').open=false;}
  });
  $('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy||!loaded)return;
    try{
      const typed=Object.fromEntries(fields.map(key=>[key,$(key).value]));
      const previous=editing?.record||{};
      // A price typed over the old one is a price change like any other, so it
      // joins the history rather than rewriting where the search started.
      const base=normalizeProperty({...typed,price:previous.price??typed.price,status:$('status-field').value,since:previous.since||today()},previous);
      const price=normalizeProperty({address:typed.address,price:typed.price}).price;
      const value=!editing?base:price===null?{...base,price:null}:withPrice(base,price,today());
      const id=editing?.id||crypto.randomUUID();
      if(await save({...value,id,revision:editing?.revision??null})){clearForm();$('editor').open=false;}
    }catch(error){$('form-status').textContent=error?.message||'Check the property and try again.';}
  });
  clearForm();clear();
  refresh();
  const reload=()=>{if(!$('editor').open)refresh();};
  globalThis.addEventListener?.('online',reload);
  globalThis.document?.addEventListener('visibilitychange',()=>{if(!document.hidden)reload();});
  credentials.subscribe?.(()=>{clear();refresh();});
  return {
    refresh,clear,saveListing,
    // The host says which page is beside the panel; the tool decides what, if
    // anything, that page offers.
    page(next){page={url:next?.url||'',listing:next?.listing||null};renderPage();}
  };
}
