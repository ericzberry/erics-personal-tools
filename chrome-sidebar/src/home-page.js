import {mountHomeBirthdays} from './home.js';
import {remindersOffline} from './reminders-offline.js';
import {deviceCredentials} from './cloud-storage.js';
import {onNavigate} from './navigation.js';
// The panel's home screen. Its own module for the same reason every other tool
// has one: what the extension supplies — this device's credentials and its
// copy of the records — is the host's business, not the controller's.
export function mountPanelBirthdays(root=document.getElementById('home-birthdays')){
  const tool=mountHomeBirthdays(root,{credentials:deviceCredentials(),offline:remindersOffline()});
  // Turning back to the home screen is the one moment the panel can be sure
  // this list is worth reading again: a birthday added or edited in Reminders
  // is reached by leaving here and coming back.
  onNavigate(capability=>{if(capability==='home')tool?.refresh();});
  return tool;
}
