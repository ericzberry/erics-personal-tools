import {validateSnapshot, mergeSnapshot, sessionKey} from './draft-state.js';
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(console.error);
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
    respond({ok: true});
  }).catch(error => respond({ok: false, error: error.message}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => enqueue(async () => {
  const {draftSessions = {}} = await chrome.storage.local.get('draftSessions');
  let changed = false;
  for (const session of Object.values(draftSessions)) if (session.tabId === tabId) { session.connected = false; changed = true; }
  if (changed) await chrome.storage.local.set({draftSessions});
}));
