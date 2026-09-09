import {openTravelEditor,travelPageMode} from './travel-navigation.js';
import {travelOffline} from './travel-offline.js';
import {mountTravel} from './travel.js';
import {CONNECTION_KEY} from './cloud-storage.js';
const storage = globalThis.chrome?.storage?.local;
const credentials = {
  async get(){return storage ? (await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token || '' : '';},
  async set(token){if(!storage)throw Error('Open Travel wallet from the installed extension.');await storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await storage.set({[CONNECTION_KEY]:{token}});},
  async remove(){if(storage)await storage.remove(CONNECTION_KEY);},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
const offline=travelOffline();
export function mountExtensionTravel(root, options={mode:'browse'}){
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('travel-record-changes'):null;
  const wallet=mountTravel(root,{
    credentials,request:offline.request,offline,...options,
    onOpenEditor:openTravelEditor,
    onSaved:id=>{
      // Keep a newly created record addressable if this editor is reloaded.
      if(options.mode==='editor')history.replaceState(null,'',`?${new URLSearchParams({edit:id})}`);
      channel?.postMessage({type:'saved'});
    },
    onDone:async()=>{
      const tab=await globalThis.chrome?.tabs?.getCurrent?.();
      if(tab?.id!==undefined)await chrome.tabs.remove(tab.id);
      else window.close();
    }
  });
  if(channel)channel.onmessage=event=>{if(event.data?.type==='saved')wallet.refresh();};
  window.addEventListener('pagehide',()=>channel?.close(),{once:true});
  return wallet;
}
const root=document.getElementById('travel-root');
if(root)mountExtensionTravel(root,travelPageMode(location.search));
