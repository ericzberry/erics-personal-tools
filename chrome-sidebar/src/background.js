import {registerSidebarLauncher} from './components/sidebar-launcher.js';
registerSidebarLauncher(chrome);
import {pageAdvice} from './page-advice.js';
import {registerSettingsBridge} from './settings-bridge.js';
import {validateSnapshot, mergeSnapshot, sessionKey} from './draft-state.js';
import {watchRewardPrograms} from './reward-programs.js';
import {travelChanges} from './travel-changes.js';
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(console.error);
registerSettingsBridge(chrome);
// A reward program's catalogue is read here rather than in the side panel, so
// visiting the program's site keeps the offers current whether or not the panel
// is open. An open Rewards tool hears about it through the same change marker a
// saved record uses.
const rewardChanges = travelChanges(() => {}, {resource: 'rewards'});
watchRewardPrograms(chrome, {onRead: () => rewardChanges.publish()});
let pending = Promise.resolve();
function enqueue(action) {
  pending = pending.catch(console.error).then(action);
  return pending;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'DRAFT_SNAPSHOT' || !sender.tab || sender.frameId !== 0 ||
      !validateSnapshot(message.snapshot, sender.url)) return;
  enqueue(async () => {
    const {draftSessions = {}} = await chrome.storage.local.get('draftSessions');
    const key = sessionKey(message.snapshot);
    draftSessions[key] = mergeSnapshot(draftSessions[key], message.snapshot, Date.now(), sender.tab.id);
    // Retain the real league and the most recent 10 practice sessions.
    const practice = Object.entries(draftSessions).filter(([,s]) => s.mode === 'practice').sort((a,b) => b[1].lastSeenAt-a[1].lastSeenAt);
    for (const [oldKey] of practice.slice(10)) delete draftSessions[oldKey];
    await chrome.storage.local.set({draftSessions});
    try{
      const stored=await chrome.storage.local.get(['manualDrafts','espnCatalog']);
      respond({ok:true,highlights:await pageAdvice(draftSessions[key],stored)});
    }catch(error){respond({ok:true,highlightError:error.message});}
  }).catch(error => respond({ok: false, error: error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => enqueue(async () => {
  const {draftSessions = {}} = await chrome.storage.local.get('draftSessions');
  let changed = false;
  for (const session of Object.values(draftSessions)) if (session.tabId === tabId) { session.connected = false; changed = true; }
  if (changed) await chrome.storage.local.set({draftSessions});
}));
