import {mountHealth} from './health.js';
import {healthOffline,healthDrafts} from './health-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
import {travelChanges} from './travel-changes.js';
const credentials=deviceCredentials();
// The panel and the page can be open together, so a note saved in either is
// announced to the other. Only a marker travels; the notes stay sealed.
export function mountExtensionHealth(root,options={}){
  const mine=new Set();
  const changes=travelChanges(marker=>{if(!mine.delete(marker))tool.changed();},{resource:'health'});
  const tool=mountHealth(root,{credentials,offline:healthOffline(),drafts:healthDrafts(),
    onChanged:()=>{const marker=changes.publish();if(marker)mine.add(marker);},...options});
  window.addEventListener('pagehide',()=>changes.close(),{once:true});
  return tool;
}
const root=document.getElementById('health-root');
if(root){
  document.getElementById('health-navigation').replaceChildren(CapabilityPicker());
  mountExtensionHealth(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
