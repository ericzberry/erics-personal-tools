import {InfoView,InfoRows} from './components/info.js';
import {Note,Button,setStatus} from './components/ui.js';
import {INFO_SOURCES,infoRecords,findInfo} from './info-data.js';
import {mountVaultGate} from './vault-gate.js';
import {mountCapture} from './capture.js';
export function mountInfo(root,{credentials,stores,remote,onOpen=()=>{},onSettings=()=>{},vault}={}){
  const gate=mountVaultGate(root,{id:'info-vault',title:'Info',...(vault?{vault}:{}),onChange:open=>open?refresh():clear()});
  gate.content.replaceChildren(InfoView());
  const $=id=>gate.content.querySelector(`#info-${id}`);
  let rows=[],busy=false,generation=0;
  const capture=mountCapture($('capture'),{id:'info-note',credentials,stores,remote,onSaved:()=>refresh()});
  const add=Button('Add',{variant:'primary',size:'compact'});
  add.addEventListener('click',()=>{$('add').hidden=!$('add').hidden;add.setAttribute('aria-expanded',String(!$('add').hidden));if(!$('add').hidden)$('capture').querySelector('input').focus();});
  add.setAttribute('aria-controls','info-add');add.setAttribute('aria-expanded','false');
  $('manual').addEventListener('click',()=>onOpen({tool:$('manual-kind').value,create:true}));
  const retry=Button('Refresh',{variant:'secondary',size:'compact'});retry.addEventListener('click',refresh);
  const settings=Button('Settings',{variant:'secondary',size:'compact'});settings.addEventListener('click',onSettings);
  $('actions').append(add,retry,settings);retry.hidden=true;settings.hidden=true;
  function render(){
    const found=findInfo(rows,$('search').value,$('filter').value);
    $('records').replaceChildren(...(found.length?InfoRows(found,onOpen):[Note(rows.length?'No matching information. Change the search or filter.':'No saved information in the sources available.')]));
  }
  function clear(){generation++;busy=false;rows=[];capture.clear();$('search').value='';$('coverage').replaceChildren();$('records').replaceChildren();setStatus($('status'),'');}
  async function refresh(){
    if(busy||!gate.unlocked())return;
    busy=true;retry.disabled=true;const current=++generation;setStatus($('status'),'Loading saved information…','progress');
    try{
      const token=await credentials.get();if(!token)throw Error('Connect this device in Settings.');
      const results=await Promise.allSettled(INFO_SOURCES.map(async name=>stores[name].request(token,`/v1/${name}`)));
      if(current!==generation||!gate.unlocked())return;
      const data={},coverage=[];
      results.forEach((result,i)=>{const name=INFO_SOURCES[i];if(result.status==='fulfilled'){data[name]=result.value.records;if(result.value.syncMessage)coverage.push(`${name}: ${result.value.syncMessage}`);}else coverage.push(`${name} unavailable: ${result.reason?.message||'Try Refresh.'}`);});
      retry.hidden=!coverage.length;settings.hidden=!coverage.length;rows=infoRecords(data);render();$('coverage').replaceChildren(...coverage.map(text=>Note(text)));
      setStatus($('status'),'');
    }catch(error){if(current===generation){retry.hidden=false;settings.hidden=false;setStatus($('status'),error.message,'error');}}
    finally{if(current===generation){busy=false;retry.disabled=false;}}
  }
  $('search').addEventListener('input',render);$('filter').addEventListener('change',render);
  credentials.subscribe?.(()=>{clear();refresh();});
  globalThis.addEventListener?.('online',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(gate.unlocked())refresh();
  return {refresh,clear};
}
// Open a result inside the existing editor's list, preserving its normal edit,
// reveal and conflict controls. No private values pass through navigation.
export function focusInfoRecord(root,row){
  const field=root?.querySelector('input[type="search"]');
  if(field){field.value=row.create?'':row.query||'';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();}
  if(row.create){const editor=root?.querySelector('details[id$="-editor"]');if(editor){editor.open=true;editor.querySelector('input')?.focus();}}
}
