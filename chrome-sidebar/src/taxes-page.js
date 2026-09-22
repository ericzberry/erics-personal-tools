import {mountTaxes} from './taxes.js';
import {cloudRequest,cloudUpload,cloudDownload,CONNECTION_KEY} from './cloud-storage.js';
import {dragOut} from './drag-out.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
const credentials={
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
// Google's consent page belongs in a tab of its own, not in this one: the
// dropped document and the fields the owner has corrected are still here when
// they come back.
const openExternal=url=>{
  if(globalThis.chrome?.tabs?.create){chrome.tabs.create({url});return true;}
  return !!globalThis.open(url,'_blank','noopener');
};
// Only the side panel has a page beside it to hand a filed document to.
export function mountExtensionTaxes(root,{beside=false,...options}={}){
  return mountTaxes(root,{remote:cloudRequest,upload:cloudUpload,download:cloudDownload,credentials,openExternal,
    handOff:beside?dragOut():null,...options});
}
const root=document.getElementById('taxes-root');
if(root){
  document.getElementById('taxes-navigation').replaceChildren(CapabilityPicker());
  mountExtensionTaxes(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
