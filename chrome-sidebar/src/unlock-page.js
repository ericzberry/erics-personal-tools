// The window the side panel opens to ask for the passkey (see vault-window.js).
// It asks as soon as it is on screen, leaves the session in the browser's
// session store for the panel to adopt, says how the check ended, and closes:
// the panel is where the reader is, so it is the panel that reports a failure.
import {sharedVault} from './secret-vault.js';
import {UNLOCK_MESSAGE} from './vault-window.js';
import {Stack,Section,Heading,Notice} from './components/ui.js';

document.getElementById('unlock-root').replaceChildren(Stack([
  Section([Heading('Unlock',1),Notice('Waiting for your passkey…')],{className:'vault-gate'})
],{className:'travel-wallet vault-section'}));

// Chrome refuses a passkey request from a page that is not on screen yet.
if(document.visibilityState!=='visible')await new Promise(resolve=>{
  const shown=()=>{if(document.visibilityState!=='visible')return;document.removeEventListener('visibilitychange',shown);resolve();};
  document.addEventListener('visibilitychange',shown);
});
let error=null;
try{await sharedVault().key();}
catch(caught){error={name:caught?.name||'Error',message:caught?.message||''};}
try{await chrome.runtime.sendMessage({type:UNLOCK_MESSAGE,request:new URLSearchParams(location.search).get('request'),error});}
catch{/* A panel that has gone away has nothing to be told. */}
window.close();
