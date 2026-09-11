import {mountRewards} from './shared/rewards-tool.js';
import {rewardsOffline} from './shared/rewards-offline.js';
import {programsOffline} from './shared/program-offline.js';
import {mountToolNavigation,SETTINGS_SCREEN} from './tool-navigation.js';
import {CapabilitiesView} from './shared/components/capabilities.js';
import {CAPABILITIES} from './shared/capabilities.js';
import {mountCards} from './shared/cards.js';
import {cardsOffline} from './shared/cards-offline.js';
import {mountFinance} from './shared/finance.js';
import {financeOffline} from './shared/finance-offline.js';
import {mountPersonal} from './shared/personal.js';
import {mountReminders} from './shared/reminders.js';
import {remindersOffline} from './shared/reminders-offline.js';
import {mountCapture} from './shared/capture.js';
import {mountTaxes} from './shared/taxes.js';
import {personalOffline} from './shared/personal-offline.js';
import {mountTravel} from './shared/travel.js';
import {travelOffline} from './shared/travel-offline.js';
import {offlineResource} from './shared/offline-resource.js';
import {encryptedDeviceStore} from './shared/offline-storage.js';
import {mobileCredentials, protectedStore, mobileRequest as cloudRequest, mobileUpload} from './mobile-session.js';
import {mountLibrary} from './shared/data-library.js';
import {mountRestaurants} from './restaurants.js';
import {restaurantCache} from './restaurant-cache.js';
const root=document.getElementById('capabilities-root');
root.replaceChildren(CapabilitiesView());
// Connection maintenance and AI connections belong to the Settings screen.
const connectionRoot=document.getElementById('capability-settings');
connectionRoot.parentElement.append(connectionRoot);
connectionRoot.hidden=true;
const ai=offlineResource({resource:'ai-metadata',path:'/v1/ai-connections',store:protectedStore(encryptedDeviceStore()),remote:async token=>({records:(await cloudRequest(token,'/v1/ai-connections')).connections}),normalize:value=>value,metadata:value=>value});
const restaurantDownloads=restaurantCache({store:protectedStore(encryptedDeviceStore()),credentials:mobileCredentials});
const rewardStore=rewardsOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
// The phone shows a program's offers and never reads one: the reading needs the
// browser that is signed in to the program's site. Its copy is downloaded like
// any other record, so the offers stay readable with no signal.
const programStore=programsOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const cardStore=cardsOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const financeStore=financeOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const personalStore=personalOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const reminderStore=remindersOffline({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
const credentials={
  async beforeDisconnect(){const token=await this.get();if(token&&(await cardStore.hasPending(token)||await rewardStore.hasPending(token)||await financeStore.hasPending(token)||await personalStore.hasPending(token)||await reminderStore.hasPending(token)))throw Error('Sync or resolve pending changes before disconnecting.');},
  get:()=>mobileCredentials.get(),
  set:token=>mobileCredentials.set(token),
  async remove(){const token=await this.get();if(token){await cardStore.disconnect(token);await rewardStore.disconnect(token);await programStore.disconnect(token);await financeStore.disconnect(token);await personalStore.disconnect(token);await reminderStore.disconnect(token);await restaurantDownloads.disconnect();await ai.disconnect(token);}cardTool.clear();rewardTool.clear();financeTool.clear();personalTool.clear();reminderTool.clear();taxTool.clear();await mobileCredentials.remove();}
};
const cardTool=mountCards(document.getElementById('capability-cards'),{credentials,offline:cardStore,remote:cloudRequest});
const openSettings=()=>navigation.show(SETTINGS_SCREEN,{focus:true});
const rewardTool=mountRewards(document.getElementById('capability-rewards'),{credentials,offline:rewardStore,programs:programStore,remote:cloudRequest,onSettings:openSettings});
const financeTool=mountFinance(document.getElementById('capability-finance'),{credentials,offline:financeStore,remote:cloudRequest,onSettings:openSettings});
const personalTool=mountPersonal(document.getElementById('capability-personal'),{credentials,offline:personalStore,onSettings:openSettings});
const reminderTool=mountReminders(document.getElementById('capability-reminders'),{credentials,offline:reminderStore,onSettings:openSettings});
// Quick add sits on the home screen and writes through the same offline store
// the tool uses, so a note typed with no signal queues like any other change.
const captureRoot=document.getElementById('capability-capture');
captureRoot.className='travel-wallet';
mountCapture(captureRoot,{credentials,remote:cloudRequest,stores:{reminders:reminderStore},onSaved:()=>reminderTool.refresh()});
// Taxes keeps nothing on the device: a document is read here and goes straight
// to Drive, so it has no offline store to disconnect - only a tool to clear.
const taxTool=mountTaxes(document.getElementById('capability-taxes'),{credentials,remote:cloudRequest,upload:mobileUpload,
  openExternal:url=>!!window.open(url,'_blank','noopener'),onSettings:openSettings});
const aiLibrary=mountLibrary(document.getElementById('capability-ai'),{kind:'ai',level:2,load:async()=>{
  const token=await credentials.get();if(!token)throw Error('Connect this device above to download saved connection details.');
  const result=await ai.request(token,'/v1/ai-connections');return {value:result.records,message:result.syncMessage};
}});
async function connectionChanged(){try{if(await credentials.get())await aiLibrary.refresh();else {aiLibrary.clear();cardTool.clear();rewardTool.clear();financeTool.clear();personalTool.clear();reminderTool.clear();taxTool.clear();}}catch{aiLibrary.clear();}}
const offline=travelOffline({includeNumbers:true,remote:cloudRequest,store:protectedStore(encryptedDeviceStore())});
mountTravel(document.getElementById('capability-travel'),{credentials,offline,showNumbers:true,request:offline.request,connectionRoot:document.getElementById('capability-connection'),onConnectionChange:connectionChanged});
const rankings=mountLibrary(document.getElementById('capability-rankings'),{kind:'rankings',load:async()=>({value:await (await fetch('/app/data/rankings-2026.json')).json()})});
await rankings.refresh();
let selectedTool;
const restaurants=mountRestaurants(document.getElementById('capability-restaurants'),{credentials,request:cloudRequest,cache:restaurantDownloads,loadConnections:async()=>{
  const result=await ai.request(await credentials.get(),'/v1/ai-connections');return result.records;
}});
// The cloud connection belongs to Settings, so it is always expanded there.
const cloud=document.getElementById('travel-cloud');
cloud.open=true;
cloud.querySelector('summary').hidden=true;
// Settings is a screen like any tool: the hamburger stays available, and the
// shell mirrors the chosen screen so it can show its own device settings.
function showScreen(screen){
  const settings=screen===SETTINGS_SCREEN;
  selectedTool=settings?null:screen;
  connectionRoot.hidden=!settings;
  // Quick add belongs to the home screen: with a tool open, the tool is what
  // the page is for.
  captureRoot.hidden=settings||!!selectedTool;
  for(const capability of CAPABILITIES)document.getElementById(`capability-${capability.id}`).hidden=selectedTool!==capability.id;
  if(selectedTool==='restaurants')restaurants.open();
  if(selectedTool==='rewards')rewardTool.refresh({quiet:true});
  parent.postMessage({type:'mobile-screen',screen:settings?SETTINGS_SCREEN:selectedTool||'home'},location.origin);
}
const navigation=mountToolNavigation(root.querySelector('.capability-navigation'),{onScreen:showScreen});
await connectionChanged();
window.addEventListener('online',connectionChanged);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)connectionChanged();});
