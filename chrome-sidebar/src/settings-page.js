import {mountSettings} from './components/views.js';
import {ConnectionCard,setModelSuggestions} from './components/ui.js';
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
function status(message) {$('settings-status').textContent=message;$('settings-status').hidden=!message;}
function controls() {
  for (const node of $('connection-form').querySelectorAll('input,select,button')) node.disabled=working||!connected;
  for (const id of ['connection-add','connection-reload']) $(id).disabled=working||!connected;
  for (const node of $('connection-list').querySelectorAll('button')) node.disabled=working||!connected;
  $('settings-connect').disabled=working||!available;
  $('settings-disconnect').disabled=working||!connected;
  $('settings-token').disabled=working||!available;
  $('settings-connection-badge').textContent=connected?'Connected':'Not connected';
  $('settings-connection-badge').classList.toggle('pill-connected',connected);
  const canRun=connected&&!!selected?.hasApiKey&&!dirty&&!working;
  for(const node of $('playground-form').querySelectorAll('input,textarea,select,button'))node.disabled=!canRun;
  $('connection-models').disabled=!canRun;
  $('playground-copy').disabled=working||!$('playground-output').textContent;
  $('playground-context').textContent=dirty?'Save or cancel your changes before making a provider request.':!selected?'Select a saved connection above.':!selected.hasApiKey?'Save an API key for this connection to try it.':`Using ${selected.name}. Tests and prompts use this provider’s API credit.`;
}
function endpointHint(){
  const provider=providerFor($('ai-provider').value);
  $('ai-base-url').placeholder=provider?.baseUrl||'https://your-provider.example/v1';
  $('ai-endpoint-help').textContent=provider?.baseUrl?`Leave blank to use ${provider.baseUrl}`:'Enter the service’s API base URL and choose its API format.';
  $('ai-format-field').hidden=provider?.id!=='custom';
}
function renderList() {
  $('connection-list').replaceChildren(...connections.map(connection=>ConnectionCard(connection,{selected:selected?.id===connection.id,onSelect:next=>{
    if (dirty) {status('Save or cancel your edits before switching connections.');return;}
    edit(next);
  }})));
  $('connections-empty').hidden=connections.length>0;
  $('connections-empty').textContent=connected?'No connections yet. Add your first provider.':'Connect your browser to load your AI settings.';
  controls();
}
function edit(connection=null) {
  selected=connection;dirty=false;
  if (!connection) newId=crypto.randomUUID();
  $('connection-editor-title').textContent=connection?'Edit connection':'Add connection';
  $('ai-name').value=connection?.name||'';
  $('ai-provider').value=connection?.provider||'openai';
  $('ai-format').value=connection?.apiFormat||providerFor(connection?.provider)?.format||'chat';
  $('ai-model').value=connection?.model||'';
  $('ai-base-url').value=connection?.baseUrl||'';
  $('ai-key').value='';$('ai-clear-key').checked=false;
  $('ai-clear-key').closest('label').hidden=!connection?.hasApiKey;
  $('ai-key').placeholder=connection?.hasApiKey?'Saved — leave blank to keep':'Paste your provider’s key';
  $('ai-key-help').textContent=connection?.hasApiKey?'Leave blank to keep your saved key. Changing provider or API URL clears it unless you enter a new key.':'Keys are stored encrypted. Saved keys are never displayed.';
  $('connection-remove').hidden=!connection;
  $('connection-remove-confirm').hidden=true;
  $('playground-model').value=connection?.model||'';
  $('playground-limit').value='2048';
  $('playground-output').textContent='';$('playground-output').hidden=true;
  $('playground-status').textContent='';$('model-list-status').textContent='';
  setModelSuggestions($('provider-model-list'),[]);
  endpointHint();
  renderList();
}
async function run(action) {
  if (working) return;
  working=true;controls();status('');
  try {await action();} catch (error) {status(error.message);}
  finally {working=false;controls();}
}
async function load() {
  const result=await send('list');connections=result.connections;renderList();
}
$('settings-connect').addEventListener('click',()=>run(async()=>{
  await send('connect', {token:$('settings-token').value.trim()||undefined});
  $('settings-token').value='';connected=true;
  await load();$('settings-cloud').open=false;$('settings-cloud-status').textContent='This browser is connected.';
  status('Connected. Your settings are ready.');
}));
$('settings-disconnect').addEventListener('click',()=>run(async()=>{
  await send('disconnect');connected=false;connections=[];edit();$('settings-token').value='';$('settings-cloud').open=true;
  status('Disconnected from this browser. Saved AI connections remain in your account.');
}));
$('connection-form').addEventListener('input',()=>{dirty=true;controls();});
$('connection-form').addEventListener('change',()=>{dirty=true;controls();});
$('ai-provider').addEventListener('change',endpointHint);
$('connection-form').addEventListener('submit',event=>{
  event.preventDefault();run(async()=>{
    const name=$('ai-name').value.trim();if (!name) throw Error('Give this connection a name.');
    const connection={name,provider:$('ai-provider').value,model:$('ai-model').value.trim(),baseUrl:$('ai-base-url').value.trim(),apiFormat:$('ai-format').value,revision:selected?.revision??null};
    const key=$('ai-key').value.trim();
    if ($('ai-clear-key').checked && key) throw Error('Either enter a new key or remove the saved key.');
    if (key || $('ai-clear-key').checked) connection.apiKey=key;
    const result=await send('save',{id:selected?.id||newId,connection});
    connections=[result.connection,...connections.filter(item=>item.id!==result.connection.id)];
    edit(result.connection);status('Connection saved.');
  });
});
$('connection-add').addEventListener('click',()=>{
  if (dirty) {status('Save or cancel your edits before adding another connection.');return;}
  edit();status('');$('ai-name').focus();
});
$('connection-cancel').addEventListener('click',()=>{edit();status('');});
$('connection-reload').addEventListener('click',()=>run(async()=>{
  if (dirty) throw Error('Save or cancel your edits before reloading connections.');
  await load();edit();status('Connections reloaded.');
}));
$('connection-remove').addEventListener('click',()=>{$('connection-remove-confirm').hidden=false;});
$('connection-keep').addEventListener('click',()=>{$('connection-remove-confirm').hidden=true;});
$('connection-confirm-remove').addEventListener('click',()=>run(async()=>{
  if (!selected) return;
  await send('remove',{id:selected.id,revision:selected.revision});
  connections=connections.filter(item=>item.id!==selected.id);edit();status('Connection removed.');
}));
function requireSaved(){if(!selected||dirty||!selected.hasApiKey)throw Error('Select a saved connection with an API key first.');}
$('connection-models').addEventListener('click',()=>run(async()=>{
  requireSaved();$('model-list-status').textContent='Fetching models…';
  try{
    const result=await send('models',{id:selected.id});
    setModelSuggestions($('provider-model-list'),result.models);
    $('model-list-status').textContent=result.manual?result.message:`${result.models.length} models loaded${result.partial?' (partial list)':''}. Type in either model field to choose. ${result.message||''}`;
  }catch(error){$('model-list-status').textContent='Could not fetch models. You can enter a model ID manually.';throw error;}
}));
$('connection-test').addEventListener('click',()=>run(async()=>{
  requireSaved();$('playground-status').textContent='Testing with a small request…';
  try{
    const result=await send('test',{id:selected.id,model:$('playground-model').value.trim()});
    $('playground-status').textContent=`Provider accepted the test for ${result.model}. ${result.warning||'Connection works.'}`;
  }catch(error){$('playground-status').textContent='Connection test failed.';throw error;}
}));
$('playground-form').addEventListener('submit',event=>{
  event.preventDefault();run(async()=>{
    requireSaved();const prompt=$('playground-prompt').value.trim(),system=$('playground-system').value.trim();
    if(!prompt)throw Error('Enter a prompt first.');
    const messages=[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}];
    $('playground-status').textContent='Waiting for the provider…';$('playground-output').textContent='';$('playground-output').hidden=true;
    try{
      const result=await send('generate',{id:selected.id,model:$('playground-model').value.trim(),messages,maxTokens:Number($('playground-limit').value)});
      $('playground-output').textContent=result.text;$('playground-output').hidden=!result.text;
      const usage=result.usage;
      $('playground-status').textContent=`${result.model} · ${(result.durationMs/1000).toFixed(1)}s${usage?.inputTokens!=null?` · ${usage.inputTokens} input tokens`:''}${usage?.outputTokens!=null?` · ${usage.outputTokens} output tokens`:''}${result.warning?` · ${result.warning}`:''}`;
    }catch(error){$('playground-status').textContent='Request failed. Your prompt is still here.';throw error;}
  });
});
$('playground-copy').addEventListener('click',()=>run(async()=>{
  await navigator.clipboard.writeText($('playground-output').textContent);$('playground-status').textContent='Response copied.';
}));
window.addEventListener('beforeunload',event=>{if (dirty) {event.preventDefault();event.returnValue='';}});
edit();
await run(async()=>{
  const result=await send('status');connected=result.connected;$('settings-cloud').open=!connected;
  if (connected) {
    try {await load();}
    catch (error) {connected=false;$('settings-cloud').open=true;renderList();throw error;}
  }
});
