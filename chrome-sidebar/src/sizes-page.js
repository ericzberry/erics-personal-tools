import {mountSizes} from './sizes.js';
import {sizesOffline} from './sizes-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// A size is usually said rather than filled in — "Lululemon joggers are a
// medium" — so the note field is the way in, and the form is what it falls back
// to. A note typed here can still turn out to belong elsewhere.
export function mountExtensionSizes(root,options={}){
  const offline=sizesOffline();
  const tool=mountSizes(root,{credentials,offline,...options});
  mountCapture(root.querySelector('#sizes-capture'),{credentials,remote:cloudRequest,stores:captureStores({sizes:offline}),
    placeholder:'Lululemon joggers are a medium',onSaved:capability=>{if(capability==='sizes')tool.refresh();}});
  return tool;
}
const root=document.getElementById('sizes-root');
if(root){
  document.getElementById('sizes-navigation').replaceChildren(CapabilityPicker());
  mountExtensionSizes(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
