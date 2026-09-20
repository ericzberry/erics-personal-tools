import {mountSettings,AiTaskRow,setCloudStorage} from './components/views.js';
import {ConnectionCard,setModelSuggestions,setStatus} from './components/ui.js';
import {providerFor} from './ai-providers.js';
mountSettings(document.getElementById('app'));
await import('./capability-links.js');
const $=id=>document.getElementById(id);
let connected=false, working=false, connections=[], selected=null, dirty=false, newId=crypto.randomUUID();
const available=!!globalThis.chrome?.runtime?.sendMessage && location.protocol==='chrome-extension:';
async function send(action, data={}) {
  if (!available) throw Error('Open this page from the installed Eric’s Personal Tools extension.');
  let response;
  try {response=await chrome.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});}
  catch {throw Error('The extension was reloaded. Refresh this page to reconnect.');}
  if (!response?.ok) throw Error(response?.error||'The settings service did not respond.');
  return response;
}
function status(message,tone='') {setStatus($('settings-status'),message,tone);$('settings-status').hidden=!message;}
function controls() {
  for (const node of $('connection-form').querySelectorAll('input,select,button')) node.disabled=working||!connected;
  for (const id of ['connection-add','connection-reload','storage-refresh']) $(id).disabled=working||!connected;
  $('connection-actions').hidden=!connected;
  for (const node of $('connection-list').querySelectorAll('button')) node.disabled=working||!connected;
  for (const node of $('ai-tasks-list').querySelectorAll('select')) node.disabled=working||!connected;
  $('settings-connect').disabled=working||!available;
  $('settings-disconnect').disabled=working||!connected;
  $('settings-disconnect').hidden=!connected;
  $('settings-token').disabled=working||!available;
  // Before this browser is connected there is one thing to do here, and it is
  // on the first tab: the models list has nothing in it and nothing can be sent
  // to a connection that does not exist. So they leave the row, and a row of
  // one tab is not drawn at all.
  for(const key of ['models','playground'])$('settings-tabs').show(key,connected);
  $('settings-connection-badge').textContent=connected?'Connected':'Not connected';
  $('settings-connection-badge').classList.toggle('pill-connected',connected);
  const canRun=connected&&!!selected?.hasApiKey&&!dirty&&!working;
  for(const node of $('playground-form').querySelectorAll('input,textarea,select,button'))node.disabled=!canRun;
  $('connection-models').disabled=!canRun;
  $('playground-copy').disabled=working||!$('playground-output').textContent;
  $('playground-context').textContent=dirty?'Save or cancel your changes first.':!selected?'Choose a connection under Connections.':!selected.hasApiKey?'Save an API key to try it.':`Using ${selected.name} · billed to that provider.`;
}
function endpointHint(){
  const provider=providerFor($('ai-provider').value);
  $('ai-base-url').placeholder=provider?.baseUrl||'https://your-provider.example/v1';
  $('ai-endpoint-help').textContent=provider?.baseUrl?`Leave blank to use ${provider.baseUrl}`:'Enter the service’s API base URL and choose its API format.';
  $('ai-format-field').hidden=provider?.id!=='custom';
}
function renderList() {
  $('connection-list').replaceChildren(...connections.map(connection=>ConnectionCard(connection,{selected:selected?.id===connection.id,onSelect:next=>{
    if (dirty) {status('Save or cancel your edits before switching connections.','alert');return;}
    edit(next);
  }})));
  $('connections-empty').hidden=connections.length>0;
  $('connections-empty').textContent=connected?'No connections yet.':'Not connected.';
  controls();
}
function edit(connection=null) {
  selected=connection;dirty=false;
  if (!connection) newId=crypto.randomUUID();
  $('connection-editor-title').textContent=connection?'Edit connection':'Add connection';
  $('ai-name').value=connection?.name||'';
  $('ai-provider').value=connection?.provider||'openai';
  $('ai-format').value=connection?.apiFormat||providerFor(connection?.provider)?.format||'chat';
  $('ai-base-url').value=connection?.baseUrl||'';
  $('ai-key').value='';$('ai-clear-key').checked=false;
  $('ai-clear-key').closest('label').hidden=!connection?.hasApiKey;
  $('ai-key').placeholder=connection?.hasApiKey?'Saved — leave blank to keep':'Paste your provider’s key';
  $('ai-key-help').textContent=connection?.hasApiKey?'Leave blank to keep your saved key. Changing provider or API URL clears it unless you enter a new key.':'Keys are stored encrypted. Saved keys are never displayed.';
  $('connection-remove').hidden=!connection;
  $('connection-remove-confirm').hidden=true;
  $('playground-model').value='';
  $('playground-limit').value='2048';
  $('playground-output').textContent='';$('playground-output').hidden=true;
  setStatus($('playground-status'),'');setStatus($('model-list-status'),'');
  setModelSuggestions($('provider-model-list'),[]);
  endpointHint();
  renderList();
}
async function run(action) {
  if (working) return;
  working=true;controls();status('');
  try {await action();} catch (error) {status(error.message,'error');}
  finally {working=false;controls();}
}
async function load() {
  const result=await send('list');connections=result.connections;renderList();
  await loadTasks();
  await loadStorage();
  await migrate();
}
// Every AI action the app performs, and the model that runs it. This list is
// the whole of that choice: no feature offers one beside its own button.
async function loadTasks() {
  try {renderTasks((await send('ai-tasks')).tasks||[]);}
  catch (error) {setStatus($('ai-tasks-status'),error.message,'error');}
}
function renderTasks(tasks) {
  setStatus($('ai-tasks-status'),'');
  $('ai-tasks-list').replaceChildren(...tasks.map(task=>AiTaskRow({...task,onChange:model=>run(async()=>{
    renderTasks((await send('ai-task-save',{task:task.task,model})).tasks||[]);
    setStatus($('ai-tasks-status'),`${task.label}: ${model||'automatic'}`,'success');
  })})));
}
// Keys saved in this browser before connections moved to D1 follow them here,
// where the connections that hold them now live.
async function migrate() {
  try {
    const result=await send('migrate');
    if (result.moved) {connections=(await send('list')).connections;renderList();status('Keys saved in this browser moved to your account.','success');}
    else if (result.remaining) status('Some keys saved in this browser need review before they move.','alert');
  } catch (error) {status(`Keys saved in this browser were kept: ${error.message}`,'error');}
}
// What the account's Cloudflare storage holds, against what the plan allows.
// The Worker keeps the reading and takes it again hourly, so arriving here
// normally costs no external request; Refresh is the owner asking for it now.
// The Worker also notifies the phone when a threshold is crossed, which is the
// part that matters — this screen is for looking, not for finding out.
let storage=null;
const renderStorage=()=>setCloudStorage(document,storage);
async function loadStorage({refresh=false}={}){
  if(!connected)return;
  $('storage-refresh').disabled=true;
  if(refresh)setStatus($('storage-status'),'Reading Cloudflare…','progress'),$('storage-status').hidden=false;
  try{
    storage=await send('storage',{refresh});
    renderStorage();
    // A reading Cloudflare would not re-take is still the right answer, but its
    // age is the thing that could mislead, so that is what gets said.
    if(storage.stale)setStatus($('storage-status'),`Showing the reading from ${new Date(storage.checkedAt).toLocaleString()}. ${storage.error}`,'alert');
    else setStatus($('storage-status'),'');
  }catch(error){
    setStatus($('storage-status'),error.message,'error');
  }finally{
    $('storage-status').hidden=!$('storage-status').textContent;
    controls();
  }
}
$('storage-refresh').addEventListener('click',()=>loadStorage({refresh:true}));
$('settings-connect').addEventListener('click',()=>run(async()=>{
  await send('connect', {token:$('settings-token').value.trim()||undefined});
  $('settings-token').value='';connected=true;
  await load();$('settings-cloud').open=false;setStatus($('settings-cloud-status'),'This browser is connected.','success');
  status('Connected.','success');
}));
$('settings-disconnect').addEventListener('click',()=>run(async()=>{
  await send('disconnect');connected=false;connections=[];storage=null;renderStorage();setStatus($('storage-status'),'');$('storage-status').hidden=true;edit();$('settings-token').value='';$('settings-cloud').open=true;
  status('Disconnected. Saved connections stay in your account.','success');
}));
$('connection-form').addEventListener('input',()=>{dirty=true;controls();});
$('connection-form').addEventListener('change',()=>{dirty=true;controls();});
$('ai-provider').addEventListener('change',endpointHint);
$('connection-form').addEventListener('submit',event=>{
  event.preventDefault();run(async()=>{
    const name=$('ai-name').value.trim();if (!name) throw Error('Give this connection a name.');
    const connection={name,provider:$('ai-provider').value,baseUrl:$('ai-base-url').value.trim(),apiFormat:$('ai-format').value,revision:selected?.revision??null};
    const key=$('ai-key').value.trim();
    if ($('ai-clear-key').checked && key) throw Error('Either enter a new key or remove the saved key.');
    if (key || $('ai-clear-key').checked) connection.apiKey=key;
    const result=await send('save',{id:selected?.id||newId,connection});
    connections=[result.connection,...connections.filter(item=>item.id!==result.connection.id)];
    edit(result.connection);status('Connection saved.','success');
  });
});
$('connection-add').addEventListener('click',()=>{
  if (dirty) {status('Save or cancel your edits before adding another connection.','alert');return;}
  edit();status('');$('ai-name').focus();
});
$('connection-cancel').addEventListener('click',()=>{edit();status('');});
$('connection-reload').addEventListener('click',()=>run(async()=>{
  if (dirty) throw Error('Save or cancel your edits before reloading connections.');
  await load();edit();status('Connections reloaded.','success');
}));
$('connection-remove').addEventListener('click',()=>{$('connection-remove-confirm').hidden=false;});
$('connection-keep').addEventListener('click',()=>{$('connection-remove-confirm').hidden=true;});
$('connection-confirm-remove').addEventListener('click',()=>run(async()=>{
  if (!selected) return;
  await send('remove',{id:selected.id,revision:selected.revision});
  connections=connections.filter(item=>item.id!==selected.id);edit();status('Connection removed.','success');
}));
function requireSaved(){if(!selected||dirty||!selected.hasApiKey)throw Error('Select a saved connection with an API key first.');}
$('connection-models').addEventListener('click',()=>run(async()=>{
  requireSaved();setStatus($('model-list-status'),'Fetching models…','progress');
  try{
    const result=await send('models',{id:selected.id});
    setModelSuggestions($('provider-model-list'),result.models);
    setStatus($('model-list-status'),result.manual?result.message:`${result.models.length} models loaded${result.partial?' (partial list)':''}. Choose a model for this playground request. ${result.message||''}`,result.manual?'alert':'success');
  }catch(error){setStatus($('model-list-status'),'Could not fetch models. You can enter a model ID manually.','error');throw error;}
}));
$('connection-test').addEventListener('click',()=>run(async()=>{
  requireSaved();setStatus($('playground-status'),'Testing with a small request…','progress');
  try{
    const result=await send('test',{id:selected.id,model:$('playground-model').value.trim()});
    setStatus($('playground-status'),`Provider accepted the test for ${result.model}. ${result.warning||'Connection works.'}`,result.warning?'alert':'success');
  }catch(error){setStatus($('playground-status'),'Connection test failed.','error');throw error;}
}));
$('playground-form').addEventListener('submit',event=>{
  event.preventDefault();run(async()=>{
    requireSaved();const prompt=$('playground-prompt').value.trim(),system=$('playground-system').value.trim();
    if(!prompt)throw Error('Enter a prompt first.');
    const messages=[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}];
    setStatus($('playground-status'),'Waiting for the provider…','progress');$('playground-output').textContent='';$('playground-output').hidden=true;
    try{
      const result=await send('generate',{id:selected.id,model:$('playground-model').value.trim(),messages,maxTokens:Number($('playground-limit').value)});
      $('playground-output').textContent=result.text;$('playground-output').hidden=!result.text;
      const usage=result.usage;
      setStatus($('playground-status'),`${result.model} · ${(result.durationMs/1000).toFixed(1)}s${usage?.inputTokens!=null?` · ${usage.inputTokens} input tokens`:''}${usage?.outputTokens!=null?` · ${usage.outputTokens} output tokens`:''}${result.warning?` · ${result.warning}`:''}`,result.warning?'alert':'success');
    }catch(error){setStatus($('playground-status'),'Request failed. Your prompt is still here.','error');throw error;}
  });
});
$('playground-copy').addEventListener('click',()=>run(async()=>{
  await navigator.clipboard.writeText($('playground-output').textContent);setStatus($('playground-status'),'Response copied.','success');
}));
window.addEventListener('beforeunload',event=>{if (dirty) {event.preventDefault();event.returnValue='';}});
edit();
await run(async()=>{
  $('settings-cloud').open=true;
  const result=await send('status');connected=result.connected;$('settings-cloud').open=!connected;
  if (connected) {
    try {await load();}
    catch (error) {connected=false;$('settings-cloud').open=true;renderList();throw error;}
  }
});
