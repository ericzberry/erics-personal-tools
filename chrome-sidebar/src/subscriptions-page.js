import {mountSubscriptions} from './subscriptions.js';
import {subscriptionsOffline} from './subscriptions-offline.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionSubscriptions=(root,options={})=>mountSubscriptions(root,{credentials:deviceCredentials(),offline:subscriptionsOffline(),remote:cloudRequest,...options});
const root=document.getElementById('subscriptions-root');
if(root){document.getElementById('subscriptions-navigation').replaceChildren(CapabilityPicker());mountExtensionSubscriptions(root,{onSettings:()=>location.assign('settings.html')});await import('./capability-links.js');}
