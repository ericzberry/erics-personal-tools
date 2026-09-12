import {mountGifts} from './gifts.js';
import {giftsOffline} from './gifts-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
const credentials={
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
document.getElementById('gifts-navigation').replaceChildren(CapabilityPicker());
const offline=giftsOffline();
const tool=mountGifts(document.getElementById('gifts-root'),{offline,credentials});
// A note typed here can still turn out to be a reminder; it goes where it
// belongs and this tool refreshes only when it was an idea.
mountCapture(document.getElementById('gifts-capture'),{credentials,remote:cloudRequest,stores:captureStores({gifts:offline}),
  placeholder:'Ariana would like a cast iron pan',onSaved:capability=>{if(capability==='gifts')tool.refresh();}});
await import('./capability-links.js');
