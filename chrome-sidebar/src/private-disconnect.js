import {travelOffline} from './travel-offline.js';
import {cardsOffline} from './cards-offline.js';
export async function disconnectPrivateData(token){
  if(!token||!globalThis.indexedDB)return;
  const resources=[travelOffline(),cardsOffline()];
  for(const resource of resources)if(await resource.hasPending(token))throw Error('Sync or resolve your pending travel and card changes before disconnecting.');
  for(const resource of resources)await resource.disconnect(token);
}
