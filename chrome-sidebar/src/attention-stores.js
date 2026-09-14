import {remindersOffline} from './reminders-offline.js';
import {rewardsOffline} from './rewards-offline.js';
import {travelOffline} from './travel-offline.js';
import {personalOffline} from './personal-offline.js';
import {financeOffline} from './finance-offline.js';
import {subscriptionsOffline} from './subscriptions-offline.js';
export const attentionStores=(options={})=>({reminders:remindersOffline(options),rewards:rewardsOffline(options),travel:travelOffline(options),personal:personalOffline(options),finance:financeOffline(options),subscriptions:subscriptionsOffline(options)});
