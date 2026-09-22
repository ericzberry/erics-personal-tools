import {mountReplacements} from './replacements.js';
import {replacementsOffline} from './replacements-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// A thing worth buying again is usually said the moment it is liked — "the
// bedroom is Hale Navy eggshell, from Home Depot" — so the note field is the
// way in, and the form is what it falls back to.
export function mountExtensionReplacements(root,options={}){
  const offline=replacementsOffline();
  const tool=mountReplacements(root,{credentials,offline,...options});
  mountCapture(root.querySelector('#replacements-capture'),{credentials,remote:cloudRequest,stores:captureStores({replacements:offline}),
    placeholder:'Bedroom paint is Benjamin Moore Hale Navy, eggshell',onSaved:capability=>{if(capability==='replacements')tool.refresh();}});
  return tool;
}
const root=document.getElementById('replacements-root');
if(root){
  document.getElementById('replacements-navigation').replaceChildren(CapabilityPicker());
  mountExtensionReplacements(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
