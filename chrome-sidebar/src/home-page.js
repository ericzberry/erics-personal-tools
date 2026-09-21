import {mountHome} from './home.js';
import {remindersOffline} from './reminders-offline.js';
import {rewardsOffline} from './rewards-offline.js';
import {deviceCredentials,cloudRequest} from './cloud-storage.js';
import {encryptedDeviceStore} from './offline-storage.js';
import {dailyWeather} from './weather.js';
import {onNavigate} from './navigation.js';
// The panel's home screen. Its own module for the same reason every other tool
// has one: what the extension supplies — this device's credentials and its
// copies of the records — is the host's business, not the controller's.
export function mountPanelHome(root=document.getElementById('home-birthdays')){
  const tool=mountHome(root,{credentials:deviceCredentials(),reminders:remindersOffline(),rewards:rewardsOffline(),
    weather:dailyWeather({store:encryptedDeviceStore(),remote:cloudRequest})});
  // Turning back to the home screen is the one moment the panel can be sure
  // these runs are worth reading again: a birthday added in Reminders, or a
  // credit read off a card's page in Rewards, is reached by leaving here and
  // coming back.
  onNavigate(capability=>{if(capability==='home')tool?.refresh();});
  return tool;
}
