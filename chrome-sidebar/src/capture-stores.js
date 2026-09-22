import {remindersOffline} from './reminders-offline.js';
import {giftsOffline} from './gifts-offline.js';
import {sizesOffline} from './sizes-offline.js';
import {replacementsOffline} from './replacements-offline.js';
// Every store quick add can write to. A note typed inside one tool may turn out
// to belong to another, and it should land where it belongs rather than be
// refused by whichever tool happened to be open — so a host passes the stores
// it already has and gets the rest built to match.
export const captureStores=(provided={},options={})=>({
  reminders:provided.reminders||remindersOffline(options),
  gifts:provided.gifts||giftsOffline(options),
  sizes:provided.sizes||sizesOffline(options),
  replacements:provided.replacements||replacementsOffline(options)
});
