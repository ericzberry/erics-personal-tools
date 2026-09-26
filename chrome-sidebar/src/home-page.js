import {mountInfo,focusInfoRecord} from './info.js';
import {mountCapture} from './capture.js';
import {privateStores} from './private-resources.js';
import {selectCapability} from './navigation.js';
import {openPanelTool,openAttentionTool} from './capability-links.js';
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
  const tool=mountHome(root,{credentials:deviceCredentials(),
    weather:dailyWeather({store:encryptedDeviceStore(),remote:cloudRequest})});
  // Turning back to the home screen is the one moment the panel can be sure
  // these runs are worth reading again: a birthday added in Reminders, or a
  // credit read off a card's page in Rewards, is reached by leaving here and
  // coming back.
  const stores=privateStores(),credentials=deviceCredentials();
  mountCapture(document.getElementById('today-capture'),{id:'today-note',credentials,remote:cloudRequest,stores,onSaved:()=>{tool?.refresh();openAttentionTool();}});
  const info=mountInfo(document.getElementById('info-tool'),{credentials,stores,remote:cloudRequest,
    onSettings:()=>document.getElementById('open-settings')?.click(),onOpen:async row=>{
      selectCapability(row.tool,{area:'info'});
      if(row.tool==='rewards'){const {rewardsTool}=await import('./rewards.js');rewardsTool.scope('memberships');await rewardsTool.refresh({quiet:true});rewardsTool.view('wallet');}
      else {const target=await openPanelTool(row.tool);await target?.ready;if(row.tool==='travel')target?.setScope('memberships');await target?.refresh?.();}
      focusInfoRecord(document.getElementById(`${row.tool}-tool`),row);
    }});
  onNavigate(capability=>{if(capability==='home'){tool?.refresh();openAttentionTool();}if(capability==='info')info.refresh();});
  openAttentionTool();
  return tool;
}
