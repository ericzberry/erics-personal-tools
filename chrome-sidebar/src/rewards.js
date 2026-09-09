import {loadRewards,rewardsRequest} from './rewards-sync.js';
import {showRewards} from './navigation.js';
import {REWARDS_KEY,validateReward,nextActions} from './rewards-data.js';
import {RecordRow,Button,Note,Link} from './components/ui.js';
const $=id=>document.getElementById(id),extension=!!globalThis.chrome?.storage?.local;
const fields=['kind','name','source','value','due','state','url','notes'];
let entries=[],editing=null,busy=false,loaded=false,revision=null;
const status=message=>{$('rewards-status').textContent=message;$('reward-form-status').textContent=message;};
function edit(entry){editing=entry.id;for(const key of fields)$(`reward-${key}`).value=entry[key]||'';$('reward-editor').open=true;$('reward-name').focus();}
function clear(){editing=null;$('reward-form').reset();}
function action(label,handler,variant='secondary'){const button=Button(label,{variant,disabled:busy||!loaded});button.addEventListener('click',handler);return button;}
function render(){
  const query=$('rewards-search').value.trim().toLowerCase();
  const visible=entries.filter(e=>[e.name,e.source,e.notes,e.value].join(' ').toLowerCase().includes(query));
  $('rewards-list').replaceChildren(...(visible.length?visible.map(e=>RecordRow({title:e.name,detail:`${e.source} · ${e.value} · ${{available:'Available',activation:'Needs activation',used:'Used'}[e.state]}${e.due?` · Due ${e.due}`:''} · Updated ${new Date(e.updatedAt).toLocaleDateString()}`,notes:e.notes,actions:[action('Edit',()=>edit(e)),...(e.state!=='used'&&e.kind==='benefit'?[action('Mark used',()=>save(entries.map(item=>item.id===e.id?{...item,state:'used'}:item),'Benefit marked used.'))]:[]),...(e.url?[Link('Open source ↗',e.url)]:[]),action('Delete',()=>{if(confirm(`Delete “${e.name}”? This removes only this saved entry.`))save(entries.filter(item=>item.id!==e.id),'Entry deleted.');},'danger')]})):[Note(entries.length?'No matching rewards.':'Add your cards, airline programs, and benefit sources below.')]));
  const actions=nextActions(entries);
  $('rewards-actions').replaceChildren(...(actions.length?actions.map(e=>RecordRow({title:e.reason,detail:`${e.name} · ${e.source} · ${e.value}${e.state==='activation'?' · Needs activation':''}`,actions:[action('Review',()=>edit(e)),...(e.url?[Link('Open source ↗',e.url)]:[])]})):[Note(entries.length?'No upcoming actions in your saved entries.':'Add expiration dates and activation requirements to see what needs attention.')]));
  for(const key of fields)$(`reward-${key}`).disabled=busy||!loaded;
  $('reward-cancel').disabled=busy;
  $('reward-save').disabled=busy||!loaded;
  $('rewards-refresh').disabled=busy;
}
async function save(next,message){
  if(busy||!loaded)return false;busy=true;render();
  try{if(extension){const cloud=await rewardsRequest('rewards-save',{entries:next,revision});entries=cloud.entries;revision=cloud.revision;}else{localStorage.setItem(REWARDS_KEY,JSON.stringify(next));entries=next;}status(extension?`${message} Synced to D1.`:`${message} Preview only.`);return true;}
  catch(error){status(`Could not save: ${error.message}. Your form is preserved; try again.`);return false;}
  finally{busy=false;render();}
}
$('close-rewards').addEventListener('click',()=>showRewards(false));
$('reward-cancel').addEventListener('click',()=>{clear();$('reward-editor').open=false;});
$('rewards-search').addEventListener('input',render);
$('reward-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!loaded)return;
  try{if(editing&&!entries.some(e=>e.id===editing))throw Error('This reward was removed elsewhere. Cancel this edit or add it as a new entry.');const entry=validateReward({...Object.fromEntries(fields.map(key=>[key,$(`reward-${key}`).value])),id:editing});const next=editing?entries.map(e=>e.id===editing?entry:e):[...entries,entry];if(await save(next,'Reward saved.'))clear();}
  catch(error){status(error.message);}
});
async function refresh(manual=false){
  if(busy||(!manual&&$('reward-editor').open))return;
  busy=true;render();status('Syncing rewards…');
  try{
    if(extension){const cloud=await loadRewards(chrome.storage.local);entries=cloud.entries;revision=cloud.revision;}
    else entries=JSON.parse(localStorage.getItem(REWARDS_KEY)||'[]');
    loaded=true;status(extension?'Synced to D1 · Balances entered manually.':'Preview only · Not connected to D1.');
  }catch(error){status(`Could not sync: ${error.message} Your form and local migration data are preserved. Connect in Settings or refresh to retry.`);}
  finally{busy=false;render();}
}
$('rewards-refresh').addEventListener('click',()=>refresh(true));
$('rewards-connect').addEventListener('click',()=>$('open-settings').click());
$('navigate-rewards').addEventListener('click',()=>refresh());
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes.cloudConnection){entries=[];revision=null;loaded=false;render();refresh(true);}
});
await refresh();
setInterval(()=>{if(!$('rewards-tool').hidden)refresh();},60000);
