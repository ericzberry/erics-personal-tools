import {mountProperties} from './properties.js';
import {propertiesOffline} from './properties-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// One line typed here can still turn out to be a reminder or a gift idea; it
// goes where it belongs, and this tool refreshes only when it was a property.
export function mountExtensionProperties(root,options={}){
  const offline=propertiesOffline();
  const tool=mountProperties(root,{credentials,offline,remote:cloudRequest,...options});
  mountCapture(root.querySelector('#properties-capture'),{credentials,remote:cloudRequest,stores:captureStores({properties:offline}),
    placeholder:'Saw 12 Elm St today, $950k, kitchen needs work',onSaved:capability=>{if(capability==='properties')tool.refresh();}});
  return tool;
}
const root=document.getElementById('properties-root');
if(root){
  document.getElementById('properties-navigation').replaceChildren(CapabilityPicker());
  // A tab of its own sits beside no listing, so it is given no page to read.
  mountExtensionProperties(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
