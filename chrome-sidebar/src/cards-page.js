import {mountCards} from './cards.js';
import {cardsOffline} from './cards-offline.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
export function mountExtensionCards(root,options={}){
  return mountCards(root,{credentials,offline:cardsOffline(),remote:cloudRequest,...options});
}
const root=document.getElementById('cards-root');
if(root){
  document.getElementById('cards-navigation').replaceChildren(CapabilityPicker());
  mountExtensionCards(root);
  await import('./capability-links.js');
}
