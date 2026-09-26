import {aiConnections} from './ai-connection.js';
import {researchTrip} from './trip-research.js';
import {travelBrowser,TRIP_CHANNELS} from './trip-browser.js';
import {mountTrips} from './trips.js';
import {tripsOffline} from './trips-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionTrips=(root,options={})=>{
  const api=globalThis.chrome?.runtime?.id?chrome:null;
  const request=async(action,data={})=>{const r=await api.runtime.sendMessage({type:'ERIC_SETTINGS',action,...data});if(!r?.ok)throw Error(r?.error||'Could not reach the research connection.');return r;};
  const connections=aiConnections({load:async()=>(await request('list')).connections,need:'for travel research'});
  return mountTrips(root,{credentials:deviceCredentials(),offline:tripsOffline(),research:api?args=>researchTrip({...args,channel:TRIP_CHANNELS.find(c=>c.id===args.channel),browser:travelBrowser(api),generate:async messages=>{
    const result=await request('generate',{id:await connections.id(),task:'travel.browser',messages});if(result.warning)throw Error(result.warning);return result.text;
  }}):null,...options});
};
const root=document.getElementById('trips-root');
if(root){
  document.getElementById('trips-navigation').replaceChildren(CapabilityPicker());
  mountExtensionTrips(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
