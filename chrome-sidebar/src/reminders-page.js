import {mountReminders} from './reminders.js';
import {remindersOffline} from './reminders-offline.js';
import {mountCapture} from './capture.js';
import {captureStores} from './capture-stores.js';
import {cloudRequest,deviceCredentials} from './cloud-storage.js';
import {CapabilityPicker} from './components/capabilities.js';
const credentials=deviceCredentials();
// A note typed here can still turn out to be a gift idea; it goes where it
// belongs and this tool refreshes only when it was a reminder.
export function mountExtensionReminders(root,options={}){
  const offline=remindersOffline();
  const tool=mountReminders(root,{credentials,offline,...options});
  mountCapture(root.querySelector('#reminders-capture'),{credentials,remote:cloudRequest,stores:captureStores({reminders:offline}),
    onSaved:capability=>{if(capability==='reminders')tool.refresh();}});
  return tool;
}
const root=document.getElementById('reminders-root');
if(root){
  document.getElementById('reminders-navigation').replaceChildren(CapabilityPicker());
  mountExtensionReminders(root,{onSettings:()=>location.assign('settings.html')});
  await import('./capability-links.js');
}
