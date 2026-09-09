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
mountTravel(document.getElementById('travel-root'),{credentials,request:offline.request,offline});
