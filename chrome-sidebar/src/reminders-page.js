import {mountReminders} from './reminders.js';
import {remindersOffline} from './reminders-offline.js';
import {mountCapture} from './capture.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const storage=globalThis.chrome?.storage?.local;
const credentials={
  async get(){return storage?(await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token||'':'';},
  subscribe(callback){if(storage)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[CONNECTION_KEY])callback();});}
};
document.getElementById('reminders-navigation').replaceChildren(CapabilityPicker());
const offline=remindersOffline();
const tool=mountReminders(document.getElementById('reminders-root'),{offline,credentials});
mountCapture(document.getElementById('reminders-capture'),{credentials,remote:cloudRequest,stores:{reminders:offline},onSaved:()=>tool.refresh()});
await import('./capability-links.js');
