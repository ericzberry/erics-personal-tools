import {mountFinance} from './finance.js';
import {financeOffline} from './finance-offline.js';
import {readZestimate} from './zestimate.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
import {travelChanges} from './travel-changes.js';
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
//
// The side panel and the page it opens are often on screen together, the one
// beside the other, so a figure saved in either is announced to the rest. Only
// a marker travels; the figures stay in encrypted storage. A view hearing its
// own announcement has nothing to catch up on and ignores it.
export function mountExtensionFinance(root,options={}){
  const mine=new Set();
  const changes=travelChanges(marker=>{if(!mine.delete(marker))tool.changed();},{resource:'finance'});
  const tool=mountFinance(root,{offline:financeOffline(),remote:cloudRequest,credentials,
    readZestimate:globalThis.chrome?.tabs?(link,address)=>readZestimate(link,{address}):null,
    onChanged:()=>{const marker=changes.publish();if(marker)mine.add(marker);},
    ...options});
  window.addEventListener('pagehide',()=>changes.close(),{once:true});
  return tool;
}
// The ledger's own page, opened from the side panel. One page however many
// times it is asked for: a press while it is already open brings that tab to
// the front rather than opening a second beside it. The address carries
// nothing but the page's name; the figures stay in encrypted storage.
export async function openFinanceDetails(api=globalThis.chrome){
  const url=api?.runtime?.getURL?.('finance.html');
  if(!url||!api.tabs?.create){globalThis.open?.('finance.html','_blank','noopener');return;}
  const open=(await api.runtime.getContexts?.({contextTypes:['TAB']}).catch(()=>null)||[])
    .find(context=>context.tabId>=0&&String(context.documentUrl||'').startsWith(url));
  if(open){
    await api.tabs.update(open.tabId,{active:true});
    if(open.windowId>=0)await api.windows?.update?.(open.windowId,{focused:true});
    return;
  }
  await api.tabs.create({url});
}
const root=globalThis.document?.getElementById('finance-root');
if(root){
  document.getElementById('finance-navigation').replaceChildren(CapabilityPicker());
  mountExtensionFinance(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
