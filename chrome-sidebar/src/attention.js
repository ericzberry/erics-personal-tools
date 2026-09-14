import {AttentionView} from './components/attention.js';
import {Button,RecordRow,Note} from './components/ui.js';
import {attentionItems,ATTENTION_SOURCES} from './attention-data.js';
import {mountVaultGate} from './vault-gate.js';
export function mountAttention(root,{credentials,stores,onOpen=()=>{},onSettings=()=>{},vault}={}){
  const gate=mountVaultGate(root,{id:'attention-vault',title:'Needs attention',lockedDetail:'Unlock to review attention items from your private records.',...(vault?{vault}:{}),onChange:open=>open?refresh():clear()});
  gate.content.replaceChildren(AttentionView());
  const $=id=>gate.content.querySelector(`#attention-${id}`);
  let generation=0,busy=false;
  function clear(){generation++;busy=false;$('records').replaceChildren();$('coverage').replaceChildren();$('status').textContent='';}
  async function refresh(){
    if(busy||!gate.unlocked())return;
    busy=true;const current=++generation;$('status').textContent='Checking saved records…';refreshButton.disabled=true;
    try{
      const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');
      if(current!==generation||!gate.unlocked())return;
      const results=await Promise.allSettled(Object.entries(stores).map(async([name,store])=>({name,...await store.request(token,`/v1/${name}`)})));
      if(current!==generation||!gate.unlocked())return;
      const data={},coverage=[];let failures=0;
      results.forEach((r,i)=>{const name=Object.keys(stores)[i];if(r.status==='fulfilled'){data[name]=r.value.records;if(r.value.syncMessage)coverage.push(`${ATTENTION_SOURCES[name]}: ${r.value.syncMessage}`);}else{failures++;coverage.push(`${ATTENTION_SOURCES[name]} unavailable: ${r.reason?.message||'Try refreshing.'}`);}});
      const items=attentionItems(data);
      $('coverage').replaceChildren(...coverage.map(text=>Note(text)));
      $('records').replaceChildren(...(items.length?items.map(item=>{
        const open=Button(`Open ${ATTENTION_SOURCES[item.tool]}`,{variant:'secondary',size:'compact'});open.addEventListener('click',()=>onOpen(item.tool,item.recordId));
        return RecordRow({title:item.title,detail:[item.reason,item.due,item.pending?'Waiting to sync':''].filter(Boolean).join(' · '),actions:[open]});
      }):[Note(failures?'No attention items in the sources that could be checked. Other sources are unavailable.':'Nothing needs attention in the saved records checked.')]));
      $('status').textContent=`${items.length} item${items.length===1?'':'s'} · ${results.length-failures} of ${results.length} sources checked`;
    }catch(error){if(current===generation)$('status').textContent=error.message;}
    finally{if(current===generation){busy=false;refreshButton.disabled=false;}}
  }
  const refreshButton=Button('Refresh',{variant:'secondary',size:'compact'});refreshButton.addEventListener('click',refresh);
  const settings=Button('Connection settings',{variant:'secondary',size:'compact'});settings.addEventListener('click',onSettings);
  $('actions').replaceChildren(refreshButton,settings);
  if(gate.unlocked())refresh();
  window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});credentials.subscribe?.(()=>{clear();refresh();});
  return {refresh,clear};
}
