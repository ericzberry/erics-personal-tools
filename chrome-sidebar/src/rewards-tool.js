import {RewardsView} from './components/rewards.js';
import {RecordRow,Button,Note,Link,Stack,ActionGroup} from './components/ui.js';
import {validateReward,nextActions} from './rewards-data.js';
const fields=['kind','name','source','value','due','state','url','notes'];
export function mountRewards(root,{credentials,offline,onSettings=()=>{},onChanged=()=>{}}){
  root.replaceChildren(RewardsView());
  const $=id=>root.querySelector(`#${id}`);
  let entries=[],editing=null,busy=false,loaded=false,activeToken='',generation=0;
  const status=text=>{$('rewards-status').textContent=text;};
  const action=(label,fn,variant='secondary')=>{const b=Button(label,{variant,size:'compact',disabled:busy||!loaded});b.addEventListener('click',fn);return b;};
  function edit(entry){editing={id:entry.id,revision:entry.revision};for(const key of fields)$(`reward-${key}`).value=entry[key]||'';$('reward-editor').open=true;$('reward-name').focus();}
  function clearForm(){editing=null;for(const key of fields)$(`reward-${key}`).value=key==='kind'?'balance':key==='state'?'available':'';$('reward-form-status').textContent='';}
  function render(){
    const query=$('rewards-search').value.trim().toLowerCase();
    const visible=entries.filter(e=>[e.name,e.source,e.notes,e.value].join(' ').toLowerCase().includes(query));
    $('rewards-list').replaceChildren(...(visible.length?visible.map(e=>{
      const remove=action('Delete',()=>{confirmation.hidden=false;yes.focus();},'danger-subtle');
      const yes=action('Delete reward',()=>save(e,'DELETE'),'danger');
      const no=action('Keep reward',()=>{confirmation.hidden=true;remove.focus();});
      const confirmation=Stack([Note(`Delete “${e.name}” from your connected devices?`),ActionGroup([yes,no],{compact:true})],{hidden:true});
      const actions=[action('Edit',()=>edit(e),'subtle'),...(e.state!=='used'&&e.kind==='benefit'?[action('Mark used',()=>save({...e,state:'used',updatedAt:new Date().toISOString()}))]:[]),...(e.url?[Link('Open source',e.url)]:[]),remove];
      if(e.conflict)actions.push(...['local','cloud'].map(choice=>action(choice==='local'?'Keep my change':'Use cloud version',()=>resolve(e.id,choice))));
      return Stack([RecordRow({title:e.name,detail:`${e.source} · ${e.value} · ${{available:'Available',activation:'Needs activation',used:'Used'}[e.state]}${e.due?` · Due ${e.due}`:''}${e.pending?' · Waiting to sync':''}${e.conflict?' · Conflict':''}${e.deleting?' · Pending deletion':''}`,notes:e.notes,actions}),confirmation]);
    }):[Note(!loaded?'Connect in Settings to load your saved rewards.':entries.length?'No matching rewards. Clear the search to see all entries.':'No saved rewards. Add a program or benefit below.')]));
    const next=nextActions(entries.filter(e=>!e.deleting&&!e.conflict));
    $('rewards-actions').replaceChildren(...next.map(e=>RecordRow({title:e.reason,detail:`${e.name} · ${e.value}`,actions:[action('Review',()=>edit(e))]})));
    $('rewards-actions').closest('section').hidden=!next.length;
    for(const key of fields)$(`reward-${key}`).disabled=busy||!loaded;
    $('reward-save').disabled=busy||!loaded;$('reward-cancel').disabled=busy;$('rewards-refresh').disabled=busy;
  }
  async function run(operation){if(busy)return false;busy=true;const current=++generation;render();try{const token=await credentials.get();if(!token)throw Error('Open Settings to connect this device.');if(activeToken&&activeToken!==token){clear();throw Error('Connection changed. Refresh rewards before editing.');}activeToken=token;const result=await operation(token);if(current!==generation)return false;entries=result.records;loaded=true;status(result.syncMessage||'');return true;}catch(error){if(current!==generation)return false;status(error.message);$('reward-form-status').textContent=error.message;return false;}finally{busy=false;render();}}
  async function save(entry,method='PUT'){
    const success=await run(token=>offline.request(token,`/v1/rewards/${entry.id}`,{method,value:entry}));
    if(success)onChanged();
    return success;
  }
  async function resolve(id,choice){if(await run(token=>offline.resolve(token,id,choice)))onChanged();}
  async function refresh(){if(busy)return;status('Refreshing rewards…');await run(token=>offline.request(token,'/v1/rewards'));}
  function clear(){generation++;entries=[];editing=null;loaded=false;activeToken='';clearForm();status('Open Settings to connect this device.');render();}
  $('rewards-search').addEventListener('input',render);
  $('rewards-refresh').addEventListener('click',refresh);
  $('rewards-connect').addEventListener('click',onSettings);
  $('reward-cancel').addEventListener('click',()=>{clearForm();$('reward-editor').open=false;});
  $('reward-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||!loaded)return;try{
    const entry=validateReward({...Object.fromEntries(fields.map(key=>[key,$(`reward-${key}`).value])),id:editing?.id});
    if(await save({...entry,revision:editing?.revision??null})){clearForm();$('reward-editor').open=false;}
  }catch(error){$('reward-form-status').textContent=error.message;}});
  clearForm();render();
  const reconnect=()=>{if(!$('reward-editor').open)refresh();};
  window.addEventListener('online',reconnect);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnect();});
  return {refresh,clear};
}
