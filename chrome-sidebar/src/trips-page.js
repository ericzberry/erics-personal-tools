import {mountTrips} from './trips.js';
import {tripsOffline} from './trips-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionTrips=(root,options={})=>mountTrips(root,{credentials:deviceCredentials(),offline:tripsOffline(),...options});
const root=document.getElementById('trips-root');
if(root){
  document.getElementById('trips-navigation').replaceChildren(CapabilityPicker());
  mountExtensionTrips(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
