import {mountGifts} from './gifts.js';
import {giftsOffline} from './gifts-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// A note typed here can still turn out to be a reminder; it goes where it
// belongs and this tool refreshes only when it was an idea.
export function mountExtensionGifts(root,options={}){
  const offline=giftsOffline();
  const tool=mountGifts(root,{credentials,offline,...options});
  mountCapture(root.querySelector('#gifts-capture'),{credentials,remote:cloudRequest,stores:captureStores({gifts:offline}),
    placeholder:'Ariana would like a cast iron pan',onSaved:capability=>{if(capability==='gifts')tool.refresh();}});
  return tool;
}
const root=document.getElementById('gifts-root');
if(root){
  document.getElementById('gifts-navigation').replaceChildren(CapabilityPicker());
  mountExtensionGifts(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
