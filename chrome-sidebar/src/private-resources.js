import {peopleOffline} from './people-offline.js';
import {tripsOffline} from './trips-offline.js';
import {subscriptionsOffline} from './subscriptions-offline.js';
import {remindersOffline} from './reminders-offline.js';
import {giftsOffline} from './gifts-offline.js';
import {sizesOffline} from './sizes-offline.js';
import {replacementsOffline} from './replacements-offline.js';
import {travelOffline} from './travel-offline.js';
import {cardsOffline} from './cards-offline.js';
import {rewardsOffline} from './rewards-offline.js';
import {walletOffline} from './wallet-offline.js';
import {programsOffline} from './program-offline.js';
import {financeOffline} from './finance-offline.js';
import {personalOffline} from './personal-offline.js';
import {healthOffline,healthDrafts} from './health-offline.js';
import {dailyWeather} from './weather.js';
import {restaurantHistory} from './restaurant-history.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {cloudRequest} from './cloud-storage.js';

// Every private copy a device keeps of the owner's records, one entry per
// store, read by both hosts. Disconnecting a device — or changing the access
// token it holds — walks this list, so a tool's records leave the device
// because its store is named here, not because each host remembered to name
// it. A tool that keeps records on the device is added here in the same change
// that adds its store; tests/private-resources.test.js fails for any store
// that is not.
//
// A program catalogue, today's weather and the restaurant searches queue
// nothing — one is written only by a visit to the program's site, one is
// worked out afresh each day, one is downloaded research — so they are cleared
// with the rest and never hold a disconnect up.
export const PRIVATE_RESOURCES=Object.freeze({
  people:peopleOffline,
  trips:tripsOffline,
  subscriptions:subscriptionsOffline,
  reminders:remindersOffline,
  gifts:giftsOffline,
  sizes:sizesOffline,
  replacements:replacementsOffline,
  travel:travelOffline,
  cards:cardsOffline,
  rewards:rewardsOffline,
  wallet:walletOffline,
  programs:programsOffline,
  finance:financeOffline,
  personal:personalOffline,
  health:healthOffline,
  // The note being written, sealed with the vault key; it queues nothing.
  healthDrafts:healthDrafts,
  restaurants:restaurantHistory,
  weather:({store=encryptedDeviceStore(),remote=cloudRequest,...options}={})=>dailyWeather({store,remote,...options})
});

// One store per entry, keyed as above. A host that builds one store
// differently — the phone shows travel numbers — names it in `overrides`.
export const privateStores=(options={},overrides={})=>
  Object.fromEntries(Object.entries(PRIVATE_RESOURCES).map(([id,open])=>[id,open({...options,...overrides[id]})]));

// A disconnect takes every copy or none: nothing is cleared while any store
// still holds a change the cloud has not seen.
export async function assertNothingPending(stores,token){
  for(const store of Object.values(stores))
    if(await store.hasPending?.(token))throw Error('Sync or resolve your pending private changes before disconnecting.');
}
export async function disconnectStores(stores,token){
  await assertNothingPending(stores,token);
  for(const store of Object.values(stores))await store.disconnect(token);
}
