import {mountAttention} from './attention.js';
import {attentionStores} from './attention-stores.js';
import {deviceCredentials} from './cloud-storage.js';
import {CAPABILITIES} from './capabilities.js';
import {CapabilityPicker} from './components/capabilities.js';
export const mountExtensionAttention=(root,options={})=>mountAttention(root,{credentials:deviceCredentials(),stores:attentionStores(),onOpen:tool=>location.assign(CAPABILITIES.find(c=>c.id===tool).href),...options});
const root=document.getElementById('attention-root');
if(root){document.getElementById('attention-navigation').replaceChildren(CapabilityPicker());mountExtensionAttention(root,{onSettings:()=>location.assign('settings.html')});await import('./capability-links.js');}
