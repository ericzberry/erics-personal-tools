import {mountRewards} from './shared/rewards-tool.js';
import {rewardsOffline} from './shared/rewards-offline.js';
import {mountToolNavigation} from './tool-navigation.js';
import {CapabilitiesView} from './shared/components/capabilities.js';
import {CAPABILITIES} from './shared/capabilities.js';
import {mountCards} from './shared/cards.js';
import {cardsOffline} from './shared/cards-offline.js';
import {mountTravel} from './shared/travel.js';
import {travelOffline} from './shared/travel-offline.js';
import {offlineResource} from './shared/offline-resource.js';
import {encryptedDeviceStore} from './shared/offline-storage.js';
import {mobileCredentials, protectedStore, mobileRequest as cloudRequest} from './mobile-session.js';
import {mountLibrary} from './shared/data-library.js';
import {mountRestaurants} from './restaurants.js';
import {restaurantCache} from './restaurant-cache.js';
const root=document.getElementById('capabilities-root');
root.replaceChildren(CapabilitiesView());
// Connection maintenance is shown only from the app header’s Settings control.
const connectionRoot=document.getElementById('capability-settings');
connectionRoot.parentElement.append(connectionRoot);
connectionRoot.hidden=true;
const ai=offlineResource({resource:'ai-metadata',path:'/v1/ai-connections',store:protectedStore(encryptedDeviceStore()),remote:async token=>({records:(await cloudRequest(token,'/v1/ai-connections')).connections}),normalize:value=>value,metadata:value=>value});
const restaurantDownloads=restaurantCache({store:protectedStore(encryptedDeviceStore()),credentials:mobileCredentials});
const rewardStore=rewardsOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const cardStore=cardsOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const credentials={
  async beforeDisconnect(){const token=await this.get();if(token&&(await cardStore.hasPending(token)||await rewardStore.hasPending(token)))throw Error('Sync or resolve pending card or reward changes before disconnecting.');},
  get:()=>mobileCredentials.get(),
  set:token=>mobileCredentials.set(token),
  async remove(){const token=await this.get();if(token){await cardStore.disconnect(token);await rewardStore.disconnect(token);await restaurantDownloads.disconnect();await ai.disconnect(token);}cardTool.clear();rewardTool.clear();await mobileCredentials.remove();}
};
const cardTool=mountCards(document.getElementById('capability-cards'),{credentials,offline:cardStore,remote:cloudRequest});
const rewardTool=mountRewards(document.getElementById('capability-rewards'),{credentials,offline:rewardStore,onSettings:()=>parent.postMessage({type:'mobile-open-settings'},location.origin)});
const aiLibrary=mountLibrary(document.getElementById('capability-ai'),{kind:'ai',load:async()=>{
  const token=await credentials.get();if(!token)throw Error('Connect this device above to download saved connection details.');
  const result=await ai.request(token,'/v1/ai-connections');return {value:result.records,message:result.syncMessage};
}});
async function connectionChanged(){try{if(await credentials.get())await aiLibrary.refresh();else {aiLibrary.clear();cardTool.clear();rewardTool.clear();}}catch{aiLibrary.clear();}}
const offline=travelOffline({includeNumbers:true,remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
mountTravel(document.getElementById('capability-travel'),{credentials,offline,showNumbers:true,request:offline.request,connectionRoot:document.getElementById('capability-connection'),onConnectionChange:connectionChanged});
for(const [kind,filename] of [['rules','espn-league-2026.json'],['rankings','rankings-2026.json']]){
  const library=mountLibrary(document.getElementById(`capability-${kind}`),{kind,load:async()=>({value:await (await fetch(`/app/data/${filename}`)).json()})});
  await library.refresh();
}
let selectedTool;
const restaurants=mountRestaurants(document.getElementById('capability-restaurants'),{credentials,request:cloudRequest,cache:restaurantDownloads,loadConnections:async()=>{
  const result=await ai.request(await credentials.get(),'/v1/ai-connections');return result.records;
}});
function selectTool(){
  for(const capability of CAPABILITIES)document.getElementById(`capability-${capability.id}`).hidden=selectedTool!==capability.id;
  if(selectedTool==='restaurants')restaurants.open();
  if(selectedTool==='rewards')rewardTool.refresh();
}
const navigation=mountToolNavigation(root.querySelector('.capability-navigation'),{
  onSelect(id){selectedTool=id;selectTool();},
  onSettings(){parent.postMessage({type:'mobile-open-settings'},location.origin);}
});
export function showSettings(open){
  navigation.hidden=open;
  connectionRoot.hidden=!open;
  if(open)for(const capability of CAPABILITIES)document.getElementById(`capability-${capability.id}`).hidden=true;
  else selectTool();
  const disclosure=document.getElementById('travel-cloud');
  disclosure.open=true;
  disclosure.querySelector('summary').hidden=true;
}
await connectionChanged();
window.addEventListener('online',connectionChanged);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)connectionChanged();});
