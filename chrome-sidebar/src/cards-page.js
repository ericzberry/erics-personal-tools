import {mountCards} from './cards.js';
import {cardsOffline} from './cards-offline.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
document.getElementById('cards-navigation').replaceChildren(CapabilityPicker());
mountCards(document.getElementById('cards-root'),{offline:cardsOffline(),remote:cloudRequest,credentials:{
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
}});
await import('./capability-links.js');
