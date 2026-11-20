// One notification per delivery per account, however many Gmail tabs reported it.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'delivered' || !(msg.count > 0)) return;
  const key = `delivered:${msg.account}:${msg.cutoff}`;
  chrome.storage.session.get(key).then((seen) => {
    if (seen[key]) return;
    chrome.storage.session.set({ [key]: sender.tab ? sender.tab.id : true });
    chrome.notifications.create(key, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon.png'),
      title: `${msg.count} new email${msg.count === 1 ? '' : 's'}`,
      message: msg.account,
      priority: 0,
    });
  });
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.storage.session.get(id).then((stored) => {
    const tabId = stored[id];
    if (typeof tabId === 'number') {
      chrome.tabs.update(tabId, { active: true }).then((tab) => chrome.windows.update(tab.windowId, { focused: true })).catch(() => {});
    }
    chrome.notifications.clear(id);
  });
});
