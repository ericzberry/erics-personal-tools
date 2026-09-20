import {mountCards} from './cards.js';
import {cardsOffline} from './cards-offline.js';
import {rewardsOffline} from './rewards-offline.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
export function mountExtensionCards(root,options={}){
  // The wallet's own store, read for the cards it already knows the owner
  // holds. Rewards writes it; this tool only ever looks.
  return mountCards(root,{credentials,offline:cardsOffline(),wallet:rewardsOffline(),remote:cloudRequest,...options});
}
const root=document.getElementById('cards-root');
if(root){
  document.getElementById('cards-navigation').replaceChildren(CapabilityPicker());
  mountExtensionCards(root);
  await import('./capability-links.js');
}
