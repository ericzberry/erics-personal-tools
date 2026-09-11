import {rewardsOffline} from './rewards-offline.js';
import {travelOffline} from './travel-offline.js';
import {cardsOffline} from './cards-offline.js';
import {financeOffline} from './finance-offline.js';
import {personalOffline} from './personal-offline.js';
import {programsOffline} from './program-offline.js';
import {forgetProgramReads} from './reward-programs.js';
export async function disconnectPrivateData(token){
  if(!token||!globalThis.indexedDB)return;
  // A program catalogue queues nothing — only a visit to the program's site
  // writes one — so it is cleared with the rest but never blocks a disconnect.
  const resources=[travelOffline(),cardsOffline(),rewardsOffline(),financeOffline(),personalOffline(),programsOffline()];
  for(const resource of resources)if(await resource.hasPending(token))throw Error('Sync or resolve your pending private changes before disconnecting.');
  for(const resource of resources)await resource.disconnect(token);
  await forgetProgramReads();
}
