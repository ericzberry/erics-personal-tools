import {mountFinance} from './finance.js';
import {financeOffline} from './finance-offline.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
document.getElementById('finance-navigation').replaceChildren(CapabilityPicker());
mountFinance(document.getElementById('finance-root'),{offline:financeOffline(),remote:cloudRequest,credentials:{
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
}});
await import('./capability-links.js');
