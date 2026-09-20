import {mountFinance} from './finance.js';
import {financeOffline} from './finance-offline.js';
import {readZestimate} from './zestimate.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
const credentials={
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
// Shared by both hosts. The sidebar adds the page reader, because it is the
// only host sitting beside the account page the owner is logged into.
//
// Both of them can read a Zestimate, because that page is not one the owner has
// to be standing on: a browser is all it takes to open a house's own page and
// read what it publishes, and only the phone has no browser to do it with.
export function mountExtensionFinance(root,options={}){
  return mountFinance(root,{offline:financeOffline(),remote:cloudRequest,credentials,
    readZestimate:globalThis.chrome?.tabs?(link,address)=>readZestimate(link,{address}):null,
    ...options});
}
const root=document.getElementById('finance-root');
if(root){
  document.getElementById('finance-navigation').replaceChildren(CapabilityPicker());
  mountExtensionFinance(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
