import {showSettings} from './navigation.js';
import {credentialStore} from './credentials.js';
import {CredentialRow,Note} from './components/ui.js';
const $=id=>document.getElementById(id);
const store=globalThis.chrome?.storage?.local?credentialStore(chrome.storage.local):null;
let editing=null,busy=false;
const feedback=text=>{$('credential-status').textContent=text;$('credential-status').hidden=!text;};
function clearForm(){editing=null;$('credential-name').value='';$('credential-secret').value='';}
async function render(){
  const credentials=store?await store.list():[];
  $('credential-list').replaceChildren(...(credentials.length?credentials.map(credential=>CredentialRow(credential,{
    onEdit:()=>{editing=credential.id;$('credential-name').value=credential.name;$('credential-secret').value='';$('credential-secret').focus();},
    onDelete:()=>mutate(async()=>{await store.remove(credential.id);if(editing===credential.id)clearForm();feedback('Credential deleted.');})
  })):[Note('No credentials saved.')]));
}
async function mutate(action){
  if(busy)return;busy=true;$('save-credential').disabled=true;
  try{await action();await render();}catch{feedback('Could not save changes. Check the fields and try again.');}
  finally{busy=false;$('save-credential').disabled=!store;}
}
$('open-settings').addEventListener('click',()=>{showSettings(true);$('close-settings').focus();render().catch(()=>feedback('Could not load credentials.'));});
$('close-settings').addEventListener('click',()=>{clearForm();showSettings(false);$('open-settings').focus();});
$('credential-secret').setAttribute('autocomplete','new-password');
$('credential-name').setAttribute('autocomplete','off');
$('save-credential').disabled=!store;
$('save-credential').addEventListener('click',()=>mutate(async()=>{
  await store.save({id:editing,name:$('credential-name').value,secret:$('credential-secret').value});clearForm();feedback('Credential saved on this computer.');
}));
