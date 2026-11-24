// One notification per delivery per account, however many Gmail tabs reported it.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'delivered' || !(msg.count > 0)) return;
  const key = `delivered:${msg.account}:${msg.cutoff}`;
  chrome.storage.session.get(key).then((seen) => {
    if (seen[key]) return;
    chrome.storage.session.set({ [key]: sender.tab ? sender.tab.id : true });
    chrome.notifications.create(key, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
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

// Chrome only injects content scripts into pages loaded after the extension. A Gmail tab that was
// already open at install, or across a reload, would otherwise run unfiltered until it was reloaded:
// a reload also strips the old copy's stylesheet, so its held rows reappear. Inject into those tabs now.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
  for (const tab of tabs) {
    const target = { tabId: tab.id };
    try {
      await chrome.scripting.insertCSS({ target, files: ['src/content.css'] });
      await chrome.scripting.executeScript({ target, files: ['src/urgent.js', 'src/page.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target, files: ['src/schedule.js', 'src/urgent.js', 'src/content.js'] });
    } catch {
      // A discarded or still-loading tab gets the manifest's scripts when it loads.
    }
  }
});
