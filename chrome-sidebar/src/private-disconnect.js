import {rewardsOffline} from './rewards-offline.js';
import {travelOffline} from './travel-offline.js';
import {cardsOffline} from './cards-offline.js';
export async function disconnectPrivateData(token){
  if(!token||!globalThis.indexedDB)return;
  const resources=[travelOffline(),cardsOffline(),rewardsOffline()];
  for(const resource of resources)if(await resource.hasPending(token))throw Error('Sync or resolve your pending private changes before disconnecting.');
  for(const resource of resources)await resource.disconnect(token);
}
