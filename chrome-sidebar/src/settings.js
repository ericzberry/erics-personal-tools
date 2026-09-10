import {showSettings} from './navigation.js';
import {CredentialRow,Note} from './components/ui.js';
const $=id=>document.getElementById(id);
const available=!!globalThis.chrome?.runtime?.sendMessage;
let editing=null,busy=false,connected=false,records=[];
const feedback=text=>{$('credential-status').textContent=text;$('credential-status').hidden=!text;};
async function send(action,data={}){
  if(!available)throw Error('Open settings in the installed extension.');
  const result=await chrome.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});
  if(!result?.ok)throw Error(result?.error||'Could not reach the Worker.');
  return result;
}
function controls(){
  $('credential-connection').hidden=connected;
  $('credential-maintenance').hidden=!connected;
  $('credential-cloud-state').textContent=connected?'Worker connected · Access token stays on this computer.':'Connect the Worker, then add your OpenAI API key below.';
  for(const id of ['save-credential','credential-name','credential-secret','credential-refresh','credential-disconnect'])$(id).disabled=busy||!connected;
  $('credential-connect').disabled=busy||!available;
}
function clearForm(){editing=null;$('credential-name').value='';$('credential-secret').value='';}
async function render(){
  const result=await send('list');records=result.connections;
  $('credential-list').replaceChildren(...(records.length?records.map(credential=>CredentialRow(credential,{
    onEdit:()=>{if(busy)return;editing=credential;$('credential-name').value=credential.provider;$('credential-secret').value='';$('credential-secret').focus();},
    onDelete:()=>mutate(async()=>{await send('remove',{id:credential.id,revision:credential.revision});clearForm();await render();feedback('Deleted from D1.');})
  })):[Note('No cloud credentials yet.')]));
}
async function load(){
  await render();
  try{
    const result=await send('migrate');
    if(result.moved){await render();feedback('Local keys moved to D1.');}
    if(result.remaining)feedback('Some local keys need review before migration. They have been retained.');
  }catch(error){feedback(`Local keys retained: ${error.message}`);}
}
async function mutate(action){
  if(busy)return;busy=true;controls();
  try{await action();}catch(error){feedback(error.message);}
  finally{busy=false;controls();}
}
$('open-settings').addEventListener('click',()=>{showSettings(true);$('close-settings').focus();mutate(async()=>{
  feedback('');connected=(await send('status')).connected;
  if(connected)await load();else feedback('Connect to your Worker to save and load keys.');
});});
$('close-settings').addEventListener('click',()=>{clearForm();$('credential-token').value='';showSettings(false);$('navigation-toggle').focus();});
$('credential-connect').addEventListener('click',()=>mutate(async()=>{
  await send('connect',{token:$('credential-token').value});$('credential-token').value='';connected=true;feedback('Worker connected. Add an API key below.');await load();
}));
$('credential-refresh').addEventListener('click',()=>mutate(async()=>{feedback('');await load();}));
$('credential-disconnect').addEventListener('click',()=>mutate(async()=>{await send('disconnect');connected=false;records=[];clearForm();$('credential-list').replaceChildren(Note('Connect to load saved credentials.'));feedback('Disconnected. Keys remain in D1.');}));
$('save-credential').addEventListener('click',()=>mutate(async()=>{
  const provider=$('credential-name').value,apiKey=$('credential-secret').value.trim();
  if(!provider||!apiKey)throw Error('Choose a service and enter its API key.');
  const existing=editing||records.find(r=>r.provider===provider && !r.baseUrl);
  const name=$('credential-name').selectedOptions[0]?.textContent||provider;
  const result=await send('save',{id:existing?.id||crypto.randomUUID(),connection:{...existing,name:existing?.name||name,provider,apiKey,revision:existing?.revision??null}});
  if(!result.connection?.hasApiKey)throw Error('Cloud save was not confirmed.');
  await render();
  const saved=records.find(record=>record.id===result.connection.id && record.provider===provider && record.hasApiKey);
  if(!saved)throw Error('The Worker did not return the saved API key record. Your entry is still here; try Refresh.');
  clearForm();feedback(`${saved.name} API key verified in D1.`);
}));
controls();
