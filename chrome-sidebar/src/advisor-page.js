import {mountPurchaseAdvisor} from './purchase-advisor.js';
import {cardsOffline} from './cards-offline.js';
import {rewardsOffline} from './rewards-offline.js';
import {programsOffline} from './program-offline.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// Best card's cards, the wallet and the offer catalogues, each read from the
// store its own tool keeps. Nothing here writes to any of them.
export function mountExtensionAdvisor(root,options={}){
  return mountPurchaseAdvisor(root,{credentials,cards:cardsOffline(),wallet:rewardsOffline(),programs:programsOffline(),remote:cloudRequest,...options});
}
const root=document.getElementById('advisor-root');
if(root){
  document.getElementById('advisor-navigation').replaceChildren(CapabilityPicker());
  mountExtensionAdvisor(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
