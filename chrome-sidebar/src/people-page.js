import {mountPeople} from './people.js';
import {peopleOffline} from './people-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionPeople=(root,options={})=>mountPeople(root,{credentials:deviceCredentials(),offline:peopleOffline(),...options});
const root=document.getElementById('people-root');
if(root){document.getElementById('people-navigation').replaceChildren(CapabilityPicker());mountExtensionPeople(root,{onSettings:()=>location.assign('settings.html')});await import('./capability-links.js');}
