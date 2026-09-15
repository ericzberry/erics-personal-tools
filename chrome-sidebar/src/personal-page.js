import {mountPersonal} from './personal.js';
import {personalOffline} from './personal-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
export function mountExtensionPersonal(root,options={}){
  return mountPersonal(root,{credentials,offline:personalOffline(),...options});
}
const root=document.getElementById('personal-root');
if(root){
  document.getElementById('personal-navigation').replaceChildren(CapabilityPicker());
  mountExtensionPersonal(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
