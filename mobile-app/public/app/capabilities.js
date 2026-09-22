import {mountAttention} from './shared/attention.js';
import {mountSubscriptions} from './shared/subscriptions.js';
import {mountRewards} from './shared/rewards-tool.js';
import {mountToolNavigation,SETTINGS_SCREEN} from './tool-navigation.js';
import {CapabilitiesView} from './shared/components/capabilities.js';
import {CAPABILITIES} from './shared/capabilities.js';
import {mountCards} from './shared/cards.js';
import {mountPurchaseAdvisor} from './shared/purchase-advisor.js';
import {mountFinance} from './shared/finance.js';
import {mountPersonal} from './shared/personal.js';
import {mountReminders} from './shared/reminders.js';
import {mountHome} from './shared/home.js';
import {mountCapture} from './shared/capture.js';
import {mountPushBridge} from './push-bridge.js';
import {captureStores} from './shared/capture-stores.js';
import {mountGifts} from './shared/gifts.js';
import {mountSizes} from './shared/sizes.js';
import {mountReplacements} from './shared/replacements.js';
import {mountTaxes} from './shared/taxes.js';
import {mountTravel} from './shared/travel.js';
import {offlineResource} from './shared/offline-resource.js';
import {privateStores,assertNothingPending,disconnectStores} from './shared/private-resources.js';
import {encryptedDeviceStore} from './shared/offline-storage.js';
import {mobileCredentials, protectedStore, mobileRequest as cloudRequest, mobileUpload} from './mobile-session.js';
import {mountLibrary} from './shared/data-library.js';
import {mountRestaurants} from './restaurants.js';
const root=document.getElementById('capabilities-root');
root.replaceChildren(CapabilitiesView());
// Connection maintenance and AI connections belong to the Settings screen.
const connectionRoot=document.getElementById('capability-settings');
connectionRoot.parentElement.append(connectionRoot);
connectionRoot.hidden=true;
const ai=offlineResource({resource:'ai-metadata',path:'/v1/ai-connections',store:protectedStore(encryptedDeviceStore()),remote:async token=>({records:(await cloudRequest(token,'/v1/ai-connections')).connections}),normalize:value=>value,metadata:value=>value});
// Every tool's store comes from the shared registry, so a store added there is
// one this phone clears on disconnect without being named here. The phone
// shows a program's offers and never reads one: the reading needs the browser
// that is signed in to the program's site. Its copy is downloaded like any
// other record, so the offers stay readable with no signal.
const stores=privateStores({remote:cloudRequest,store:protectedStore(encryptedDeviceStore())},{travel:{includeNumbers:true}});
const {subscriptions:subscriptionStore,rewards:rewardStore,programs:programStore,cards:cardStore,finance:financeStore,personal:personalStore,
  reminders:reminderStore,gifts:giftStore,sizes:sizeStore,replacements:replacementStore,travel:travelStore,weather}=stores;
// What a disconnect clears: the registry's stores and the one only the phone keeps.
const deviceCopies={...stores,ai};
const credentials={
  async beforeDisconnect(){const token=await this.get();if(token)await assertNothingPending(deviceCopies,token);},
  get:()=>mobileCredentials.get(),
  set:token=>mobileCredentials.set(token),
  async remove(){const token=await this.get();if(token)await disconnectStores(deviceCopies,token);subscriptionTool.clear();attentionTool.clear();cardTool.clear();advisorTool.clear();rewardTool.clear();financeTool.clear();personalTool.clear();reminderTool.clear();giftTool.clear();sizeTool.clear();replacementTool.clear();taxTool.clear();await mobileCredentials.remove();}
};
// Best card reads the same wallet Rewards keeps, for the cards it already
// knows the owner holds but has no rates for.
const cardTool=mountCards(document.getElementById('capability-cards'),{credentials,offline:cardStore,wallet:rewardStore,remote:cloudRequest});
const openSettings=()=>navigation.show(SETTINGS_SCREEN,{focus:true});
// Purchase advisor reads Best card's cards, the wallet and the offer
// catalogues, and writes to none of them.
const advisorTool=mountPurchaseAdvisor(document.getElementById('capability-advisor'),{credentials,cards:cardStore,wallet:rewardStore,programs:programStore,remote:cloudRequest,onSettings:openSettings});
const rewardTool=mountRewards(document.getElementById('capability-rewards'),{credentials,offline:rewardStore,programs:programStore,remote:cloudRequest,onSettings:openSettings});
const financeTool=mountFinance(document.getElementById('capability-finance'),{credentials,offline:financeStore,remote:cloudRequest,onSettings:openSettings});
const personalTool=mountPersonal(document.getElementById('capability-personal'),{credentials,offline:personalStore,onSettings:openSettings});
const reminderTool=mountReminders(document.getElementById('capability-reminders'),{credentials,offline:reminderStore,onSettings:openSettings});
const giftTool=mountGifts(document.getElementById('capability-gifts'),{credentials,offline:giftStore,onSettings:openSettings});
const sizeTool=mountSizes(document.getElementById('capability-sizes'),{credentials,offline:sizeStore,onSettings:openSettings});
const replacementTool=mountReplacements(document.getElementById('capability-replacements'),{credentials,offline:replacementStore,onSettings:openSettings});
// Today's weather leads the home screen, worked out once a day from where the
// phone is. The fortnight's birthdays and the money about to reset on a card
// follow it, read from the same offline copies the tools keep, so a phone with
// no signal still knows whose day it is and what is about to be taken back.
const homeRoot=document.getElementById('capability-birthdays');
const home=mountHome(homeRoot,{credentials,reminders:reminderStore,rewards:rewardStore,weather});
// Quick add sits on the home screen and writes through the same offline store
// the tool uses, so a note typed with no signal queues like any other change.
const captureRoot=document.getElementById('capability-capture');
captureRoot.className='travel-wallet';
mountCapture(captureRoot,{credentials,remote:cloudRequest,stores:captureStores({reminders:reminderStore,gifts:giftStore,sizes:sizeStore,replacements:replacementStore}),
  onSaved:capability=>{
    ({gifts:giftTool,sizes:sizeTool,replacements:replacementTool,reminders:reminderTool}[capability])?.refresh();
    // A note typed here can be a birthday, and the birthdays are the thing
    // directly above it on this screen.
    if(capability==='reminders')home?.refresh();
  }});
// Taxes keeps nothing on the device: a document is read here and goes straight
// to Drive, so it has no offline store to disconnect - only a tool to clear.
const taxTool=mountTaxes(document.getElementById('capability-taxes'),{credentials,remote:cloudRequest,upload:mobileUpload,
  openExternal:url=>!!window.open(url,'_blank','noopener'),onSettings:openSettings});
const aiLibrary=mountLibrary(document.getElementById('capability-ai'),{kind:'ai',level:2,load:async()=>{
  const token=await credentials.get();if(!token)throw Error('Connect this device above to download saved connection details.');
  const result=await ai.request(token,'/v1/ai-connections');return {value:result.records,message:result.syncMessage};
}});
async function connectionChanged(){try{if(await credentials.get())await aiLibrary.refresh();else {aiLibrary.clear();subscriptionTool.clear();attentionTool.clear();cardTool.clear();advisorTool.clear();rewardTool.clear();financeTool.clear();personalTool.clear();reminderTool.clear();giftTool.clear();sizeTool.clear();replacementTool.clear();taxTool.clear();}}catch{aiLibrary.clear();}}
mountTravel(document.getElementById('capability-travel'),{credentials,offline:travelStore,showNumbers:true,request:travelStore.request,connectionRoot:document.getElementById('capability-connection'),onConnectionChange:connectionChanged});
const subscriptionTool=mountSubscriptions(document.getElementById('capability-subscriptions'),{credentials,offline:subscriptionStore,remote:cloudRequest,onSettings:openSettings});
const attentionTool=mountAttention(document.getElementById('capability-attention'),{credentials,stores:{reminders:reminderStore,rewards:rewardStore,travel:travelStore,personal:personalStore,finance:financeStore,subscriptions:subscriptionStore},onSettings:openSettings,onOpen:(id)=>navigation.show(id,{focus:true})});
const rankings=mountLibrary(document.getElementById('capability-rankings'),{kind:'rankings',load:async()=>({value:await (await fetch('/app/data/rankings-2026.json')).json()})});
await rankings.refresh();
let selectedTool;
const restaurants=mountRestaurants(document.getElementById('capability-restaurants'),{credentials,request:cloudRequest,history:stores.restaurants,loadConnections:async()=>{
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
  // Quick add and the glance belong to the home screen: with a tool open, the
  // tool is what the page is for.
  captureRoot.hidden=settings||!!selectedTool;
  homeRoot.hidden=settings||!!selectedTool;
  // Coming back to the home screen is when a birthday added in Reminders, or a
  // credit read in Rewards, is worth reading again.
  if(!homeRoot.hidden)home?.refresh();
  for(const capability of CAPABILITIES)document.getElementById(`capability-${capability.id}`).hidden=selectedTool!==capability.id;
  if(selectedTool==='attention')attentionTool.refresh();
  if(selectedTool==='subscriptions')subscriptionTool.refresh();
  if(selectedTool==='restaurants')restaurants.open();
  if(selectedTool==='rewards')rewardTool.refresh({quiet:true});
  // A card, a credit or an offer saved since the last look changes the answer.
  if(selectedTool==='advisor')advisorTool.refresh();
  parent.postMessage({type:'mobile-screen',screen:settings?SETTINGS_SCREEN:selectedTool||'home'},location.origin);
}
mountPushBridge();
const navigation=mountToolNavigation(root.querySelector('.capability-navigation'),{onScreen:showScreen});
await connectionChanged();
window.addEventListener('online',connectionChanged);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)connectionChanged();});
