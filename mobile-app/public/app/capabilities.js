import {CapabilitiesView} from './shared/components/capabilities.js';
import {CAPABILITIES} from './shared/capabilities.js';
import {mountTravel} from './shared/travel.js';
import {travelOffline} from './shared/travel-offline.js';
import {offlineResource} from './shared/offline-resource.js';
import {encryptedDeviceStore} from './shared/offline-storage.js';
import {mobileCredentials, protectedStore, mobileRequest as cloudRequest} from './mobile-session.js';
import {mountLibrary} from './shared/data-library.js';
const root=document.getElementById('capabilities-root');
root.replaceChildren(CapabilitiesView());
// Saved content comes before connection maintenance in the mobile reading order.
const connectionRoot=document.getElementById('capability-connection');
connectionRoot.parentElement.append(connectionRoot);
const ai=offlineResource({resource:'ai-metadata',path:'/v1/ai-connections',store:protectedStore(encryptedDeviceStore()),remote:async token=>({records:(await cloudRequest(token,'/v1/ai-connections')).connections}),normalize:value=>value,metadata:value=>value});
const credentials={
  get:()=>mobileCredentials.get(),
  set:token=>mobileCredentials.set(token),
  async remove(){const token=await this.get();if(token)await ai.disconnect(token);await mobileCredentials.remove();}
};
const aiLibrary=mountLibrary(document.getElementById('capability-ai'),{kind:'ai',load:async()=>{
  const token=await credentials.get();if(!token)throw Error('Connect this device above to download saved connection details.');
  const result=await ai.request(token,'/v1/ai-connections');return {value:result.records,message:result.syncMessage};
}});
async function connectionChanged(){try{if(await credentials.get())await aiLibrary.refresh();else aiLibrary.clear();}catch{aiLibrary.clear();}}
const offline=travelOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
mountTravel(document.getElementById('capability-travel'),{credentials,offline,request:offline.request,connectionRoot:document.getElementById('capability-connection'),onConnectionChange:connectionChanged});
for(const [kind,filename] of [['rules','espn-league-2026.json'],['rankings','rankings-2026.json']]){
  const library=mountLibrary(document.getElementById(`capability-${kind}`),{kind,load:async()=>({value:await (await fetch(`/app/data/${filename}`)).json()})});
  await library.refresh();
}
const picker=document.getElementById('capability-picker');
function selectTool(){
  for(const capability of CAPABILITIES)document.getElementById(`capability-${capability.id}`).hidden=picker.value!==capability.id;
  document.getElementById('capability-intro').hidden=!!picker.value;
}
try { picker.value=localStorage.getItem('mobile-selected-tool')||CAPABILITIES[0].id; } catch { picker.value=CAPABILITIES[0].id; }
if(!CAPABILITIES.some(tool=>tool.id===picker.value))picker.value=CAPABILITIES[0].id;
selectTool();
picker.addEventListener('change',()=>{
  selectTool();
  try { localStorage.setItem('mobile-selected-tool',picker.value); } catch { /* Selection remains usable without storage. */ }
});
await connectionChanged();
window.addEventListener('online',connectionChanged);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)connectionChanged();});
