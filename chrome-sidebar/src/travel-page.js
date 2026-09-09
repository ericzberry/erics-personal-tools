import {travelChanges} from './travel-changes.js';
import {Stack} from './components/ui.js';
import {openTravelEditor,travelPageMode} from './travel-navigation.js';
import {travelOffline} from './travel-offline.js';
import {mountTravel} from './travel.js';
import {CONNECTION_KEY} from './cloud-storage.js';
import {disconnectPrivateData} from './private-disconnect.js';
const storage = globalThis.chrome?.storage?.local;
const credentials = {
  async beforeDisconnect(){const token=await this.get();if(token){const {cardsOffline}=await import('./cards-offline.js');if(await cardsOffline().hasPending(token))throw Error('Sync or resolve pending card changes before disconnecting.');}},
  async get(){return storage ? (await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token || '' : '';},
  async set(token){if(!storage)throw Error('Open Travel wallet from the installed extension.');const previous=await this.get();if(previous&&previous!==token)await disconnectPrivateData(previous);await storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await storage.set({[CONNECTION_KEY]:{token}});},
  async remove(){if(storage){await disconnectPrivateData(await this.get());await storage.remove(CONNECTION_KEY);}},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
const offline=travelOffline();
export function mountExtensionTravel(root, options={mode:'browse'}){
  const changes=travelChanges(()=>wallet.refresh());
  const wallet=mountTravel(root,{
    credentials,request:offline.request,offline,connectionRoot:document.getElementById('travel-settings-connection')||Stack([]),...options,
    onOpenEditor:openTravelEditor,
    onChanged:()=>changes.publish(),
    onDone:async()=>{
      const tab=await globalThis.chrome?.tabs?.getCurrent?.();
      if(tab?.id!==undefined)await chrome.tabs.remove(tab.id);
      else window.close();
    }
  });
  window.addEventListener('pagehide',()=>changes.close(),{once:true});
  return wallet;
}
const root=document.getElementById('travel-root');
if(root)mountExtensionTravel(root,travelPageMode(location.search));
